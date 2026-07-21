const test = require('node:test');
const assert = require('node:assert/strict');

const { createMarketplaceCreatorDetailService } = require('../src/services/tiktokMarketplaceCreatorDetailService');

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
  });

  const result = await service.enrichAndQueue({ id: 7 }, [{ creator_open_id: 'creator-1' }]);

  assert.equal(result.creators[0].engagement_rate, 110);
  assert.deepEqual(result.detail_refresh, { pending: false, pending_count: 0, poll_after_ms: 0 });
  assert.equal(service.stateFor(7).queue.length, 0);
});
