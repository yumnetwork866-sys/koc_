const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMarketplaceCreatorDetailService,
  normalizeMarketplaceCreatorDetail,
} = require('../src/services/tiktokMarketplaceCreatorDetailService');

test('normalizes TikTok marketplace detail metrics to stable application fields', () => {
  const detail = normalizeMarketplaceCreatorDetail({
    items_sold: 234,
    avg_ec_video_play_count: 18000,
    ec_video_engagement_rate: 72,
  });

  assert.equal(detail.units_sold, 234);
  assert.equal(detail.avg_video_views, 18000);
  assert.equal(detail.video_engagement_rate, 72);
});

test('marketplace detail snapshots enrich immediately and stale creators share a throttled queue', async () => {
  let currentTime = Date.parse('2026-07-21T10:00:00.000Z');
  const fetchedAt = [];
  const upserts = [];
  const freshSnapshot = {
    creator_open_id: 'creator-1',
    detail: { engagement_rate: 110, nickname: 'Fresh creator' },
    fetched_at: new Date(currentTime - 1000),
  };
  const staleSnapshot = {
    creator_open_id: 'creator-2',
    detail: { engagement_rate: 72 },
    fetched_at: new Date(currentTime - 13 * 60 * 60 * 1000),
  };
  const DetailModel = {
    async findAll() { return [freshSnapshot, staleSnapshot]; },
    async upsert(value) { upserts.push(value); },
  };
  const service = createMarketplaceCreatorDetailService({
    DetailModel,
    ttlMs: 12 * 60 * 60 * 1000,
    intervalMs: 1000,
    now: () => currentTime,
    sleep: async (milliseconds) => { currentTime += milliseconds; },
    schedule: () => {},
    loadCooldown: async () => 0,
    runRequest: async (_shopId, operation) => operation(),
    fetchDetail: async ({ creatorId }) => {
      fetchedAt.push({ creatorId, at: currentTime });
      return { data: { creator: { creator_open_id: creatorId, engagement_rate: 110 } } };
    },
    logger: { warn() {} },
  });
  const shop = { id: 7, cipher: 'cipher', authorization: {} };
  const creators = [
    { creator_open_id: 'creator-1', nickname: 'Search creator' },
    { creator_open_id: 'creator-2' },
    { creator_open_id: 'creator-3' },
  ];

  const first = await service.enrichAndQueue(shop, creators);
  const second = await service.enrichAndQueue(shop, creators);

  assert.equal(first.creators[0].engagement_rate, 110);
  assert.equal(first.creators[0].nickname, 'Fresh creator');
  assert.deepEqual(first.detail_refresh, { pending: true, pending_count: 2, poll_after_ms: 2000 });
  assert.equal(service.stateFor(shop.id).queue.length, 2);
  assert.equal(second.detail_refresh.pending_count, 2);
  assert.equal(service.stateFor(shop.id).queue.length, 2);

  await service.drain(shop, service.stateFor(shop.id));

  assert.deepEqual(fetchedAt.map((item) => item.creatorId), ['creator-2', 'creator-3']);
  assert.equal(fetchedAt[1].at - fetchedAt[0].at, 1000);
  assert.equal(upserts.length, 2);
  assert.ok(upserts.every((value) => value.fetched_at instanceof Date));
});

test('marketplace detail refresh is complete when every shared snapshot is fresh', async () => {
  const now = Date.parse('2026-07-21T10:00:00.000Z');
  const service = createMarketplaceCreatorDetailService({
    DetailModel: {
      async findAll() {
        return [{
          creator_open_id: 'creator-1',
          detail: { engagement_rate: 110 },
          fetched_at: new Date(now - 1000),
        }];
      },
    },
    now: () => now,
    schedule: () => {},
    loadCooldown: async () => 0,
  });

  const result = await service.enrichAndQueue({ id: 7 }, [{ creator_open_id: 'creator-1' }]);

  assert.equal(result.creators[0].engagement_rate, 110);
  assert.deepEqual(result.detail_refresh, { pending: false, pending_count: 0, poll_after_ms: 0 });
  assert.equal(service.stateFor(7).queue.length, 0);
});

test('marketplace detail rate limits persist a shared cooldown and retain the queue for retry', async () => {
  const now = Date.parse('2026-07-22T03:19:17.000Z');
  const fetched = [];
  const persisted = [];
  const service = createMarketplaceCreatorDetailService({
    DetailModel: {
      async findAll() { return []; },
      async upsert() {},
    },
    now: () => now,
    schedule: () => {},
    loadCooldown: async () => 0,
    persistCooldown: async (value) => { persisted.push(value); },
    runRequest: async (_shopId, operation) => operation(),
    fetchDetail: async ({ creatorId }) => {
      fetched.push(creatorId);
      const error = new Error('Too many requests for downstream.');
      error.tiktokCode = 36009002;
      throw error;
    },
    logger: { warn() {} },
  });
  const shop = { id: 7, cipher: 'cipher', authorization: {} };

  await service.enrichAndQueue(shop, [
    { creator_open_id: 'creator-1' },
    { creator_open_id: 'creator-2' },
    { creator_open_id: 'creator-3' },
  ]);
  await service.drain(shop, service.stateFor(shop.id));

  assert.deepEqual(fetched, ['creator-1']);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].shopId, 7);
  assert.equal(persisted[0].reason, 'Too many requests for downstream.');
  assert.equal(service.stateFor(shop.id).queue.length, 3);
  assert.equal(service.stateFor(shop.id).queuedIds.size, 3);
  assert.equal(service.stateFor(shop.id).retryScheduled, true);
});

test('marketplace detail does not queue work while a persisted cooldown is active', async () => {
  const now = Date.parse('2026-07-22T03:19:17.000Z');
  const service = createMarketplaceCreatorDetailService({
    DetailModel: { async findAll() { return []; } },
    now: () => now,
    schedule: () => {},
    loadCooldown: async () => now + 60_000,
  });

  const result = await service.enrichAndQueue({ id: 7 }, [{ creator_open_id: 'creator-1' }]);

  assert.deepEqual(result.detail_refresh, {
    pending: false,
    pending_count: 0,
    poll_after_ms: 0,
    cooling_down: true,
    retry_after_ms: 60_000,
  });
  assert.equal(service.stateFor(7).queue.length, 0);
});
