const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMarketplaceDiscoverySyncService,
  scheduledMinuteValue,
} = require('../src/services/tiktokMarketplaceDiscoverySyncService');
const {
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  loadMarketplaceCooldown,
  marketplaceRateLimitCooldownMs,
} = require('../src/services/tiktokMarketplaceCooldownService');

const marketplaceShop = () => ({
  id: 7,
  cipher: 'shop-cipher',
  authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
});
const emptySearchQueue = {
  async nextPendingSearch() { return null; },
  async completeSearch() {},
  async retrySearch() {},
};

test('Marketplace Discovery job stores one page and advances its pagination state', async () => {
  const currentTime = new Date('2026-07-22T03:19:17.000Z');
  const runUpdates = [];
  const stateUpserts = [];
  const storedRows = [];
  const requests = [];
  const detailQueues = [];
  const cachedProfiles = [];
  const infoLogs = [];
  const run = { async update(value) { runUpdates.push(value); } };
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [run, true]; } },
    StateModel: {
      async findByPk() { return { next_page_token: 'page-2', search_key: 'stable-search' }; },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: {
      async bulkCreate(rows, options) { storedRows.push(...rows); assert.ok(options.updateOnDuplicate.includes('profile')); },
    },
    searchMarketplace: async (options) => {
      requests.push(options);
      return {
        request_id: 'request-123',
        data: {
          creators: [
            { creator_open_id: 'creator-1', username: 'new.koc', nickname: 'New KOC' },
            { username: 'missing-id' },
          ],
          next_page_token: 'page-3',
          search_key: 'stable-search',
        },
      };
    },
    runRequest: async (_shopId, operation) => operation(),
    queueCreatorDetails: async (shop, creators) => { detailQueues.push({ shop, creators }); },
    cacheCreatorProfiles: async (shopId, creators) => { cachedProfiles.push({ shopId, creators }); },
    autoDetailEnabled: true,
    searchQueue: emptySearchQueue,
    loadCooldown: async () => 0,
    now: () => new Date(currentTime),
    logger: {
      info(message, details) { infoLogs.push({ message, details }); },
      warn() {},
    },
  });

  const result = await service.syncShop(marketplaceShop(), scheduledMinuteValue(currentTime));

  assert.equal(result.skipped, false);
  assert.equal(result.creator_count, 1);
  assert.equal(result.has_next_page, true);
  assert.equal(result.segment_key, 'all');
  assert.equal(result.crawl_complete, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pageSize, 20);
  assert.equal(requests[0].pageToken, 'page-2');
  assert.equal(requests[0].searchKey, 'stable-search');
  assert.deepEqual(requests[0].filters, {});
  assert.equal(storedRows.length, 1);
  assert.equal(storedRows[0].profile.username, 'new.koc');
  assert.equal(detailQueues.length, 1);
  assert.equal(detailQueues[0].shop.id, 7);
  assert.deepEqual(detailQueues[0].creators.map((creator) => creator.creator_open_id), ['creator-1']);
  assert.equal(cachedProfiles[0].shopId, 7);
  assert.deepEqual(cachedProfiles[0].creators.map((creator) => creator.creator_open_id), ['creator-1']);
  assert.equal(stateUpserts.at(-1).next_page_token, 'page-3');
  assert.equal(stateUpserts.at(-1).segment_page_count, 1);
  assert.equal(stateUpserts.at(-1).consecutive_duplicate_pages, 0);
  assert.equal(runUpdates.at(-1).status, 'SUCCEEDED');
  assert.equal(infoLogs[0].message, '[Marketplace Discovery] Request started');
  assert.equal(infoLogs[0].details.segmentKey, 'all');
  assert.equal(infoLogs[0].details.hasPageToken, true);
  assert.equal(infoLogs[1].message, '[Marketplace Discovery] Request completed');
  assert.equal(infoLogs[1].details.requestId, 'request-123');
  assert.equal(infoLogs[1].details.returnedCreators, 2);
  assert.equal(infoLogs[1].details.validCreators, 1);
  assert.equal(infoLogs[1].details.newCreators, 1);
  assert.equal(infoLogs[1].details.duplicateCreators, 0);
});

test('Marketplace Discovery moves to the next segment after repeated duplicate-only pages', async () => {
  const stateUpserts = [];
  const infoLogs = [];
  const service = createMarketplaceDiscoverySyncService({
    RunModel: {
      async findOrCreate() { return [{ async update() {} }, true]; },
    },
    StateModel: {
      async findByPk() {
        return {
          segment_index: 0,
          crawl_status: 'ACTIVE',
          next_page_token: 'page-3',
          search_key: 'stable-search',
          segment_page_count: 2,
          consecutive_duplicate_pages: 2,
        };
      },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: {
      async findAll() { return [{ creator_open_id: 'existing-creator' }]; },
      async bulkCreate() {},
    },
    discoverySegments: [
      { key: 'all', filters: {} },
      { key: 'filtered', filters: { gmv_ranges: ['GMV_RANGE_0_100'] } },
    ],
    searchMarketplace: async () => ({
      data: {
        creators: [{ creator_open_id: 'existing-creator' }],
        next_page_token: 'page-4',
        search_key: 'stable-search',
      },
    }),
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    cacheCreatorProfiles: async () => {},
    duplicatePageLimit: 3,
    segmentMaxPages: 5,
    searchQueue: emptySearchQueue,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
    logger: {
      info(message, details) { infoLogs.push({ message, details }); },
      warn() {},
    },
  });

  const result = await service.syncShop(marketplaceShop());

  assert.equal(result.crawl_complete, false);
  assert.equal(stateUpserts.at(-1).segment_index, 1);
  assert.equal(stateUpserts.at(-1).next_page_token, null);
  assert.equal(stateUpserts.at(-1).search_key, null);
  assert.equal(stateUpserts.at(-1).segment_page_count, 0);
  assert.equal(stateUpserts.at(-1).consecutive_duplicate_pages, 0);
  const completedLog = infoLogs.find((entry) => entry.message === '[Marketplace Discovery] Request completed');
  assert.equal(completedLog.details.newCreators, 0);
  assert.equal(completedLog.details.segmentStopReason, 'duplicate_page_limit');
  assert.equal(completedLog.details.nextSegmentIndex, 1);
});

test('Marketplace Discovery caps each segment even while it is finding new creators', async () => {
  const stateUpserts = [];
  const service = createMarketplaceDiscoverySyncService({
    RunModel: {
      async findOrCreate() { return [{ async update() {} }, true]; },
    },
    StateModel: {
      async findByPk() {
        return {
          segment_index: 0,
          crawl_status: 'ACTIVE',
          next_page_token: 'page-5',
          search_key: 'stable-search',
          segment_page_count: 4,
          consecutive_duplicate_pages: 0,
        };
      },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: {
      async findAll() { return []; },
      async bulkCreate() {},
    },
    discoverySegments: [
      { key: 'first', filters: {} },
      { key: 'second', filters: { units_sold_ranges: ['UNITS_SOLD_RANGE_0_10'] } },
    ],
    searchMarketplace: async () => ({
      data: {
        creators: [{ creator_open_id: 'new-creator' }],
        next_page_token: 'page-6',
        search_key: 'stable-search',
      },
    }),
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    cacheCreatorProfiles: async () => {},
    duplicatePageLimit: 3,
    segmentMaxPages: 5,
    searchQueue: emptySearchQueue,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  await service.syncShop(marketplaceShop());

  assert.equal(stateUpserts.at(-1).segment_index, 1);
  assert.equal(stateUpserts.at(-1).next_page_token, null);
  assert.equal(stateUpserts.at(-1).segment_page_count, 0);
  assert.equal(stateUpserts.at(-1).consecutive_duplicate_pages, 0);
});

test('Marketplace Discovery job claims each shop and minute only once across instances', async () => {
  let searchCalls = 0;
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [{}, false]; } },
    searchMarketplace: async () => { searchCalls += 1; },
    now: () => new Date('2026-07-22T03:19:17.000Z'),
    searchQueue: emptySearchQueue,
  });

  const result = await service.syncShop(marketplaceShop());

  assert.deepEqual(result, { skipped: true, reason: 'already_claimed' });
  assert.equal(searchCalls, 0);
});

test('Marketplace Discovery continues while Creator Performance refresh is active', async () => {
  let searchCalls = 0;
  let detailQueues = 0;
  const run = { async update() {} };
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [run, true]; } },
    StateModel: {
      async findByPk() { return null; },
      async upsert() {},
    },
    CreatorModel: { async bulkCreate() {} },
    profileRefreshActive: () => true,
    searchQueue: emptySearchQueue,
    searchMarketplace: async () => {
      searchCalls += 1;
      return { data: { creators: [{ creator_open_id: 'creator-1', username: 'new.koc' }] } };
    },
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    queueCreatorDetails: async () => { detailQueues += 1; },
    cacheCreatorProfiles: async () => {},
    autoDetailEnabled: true,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  const result = await service.syncShop(marketplaceShop());

  assert.equal(result.skipped, false);
  assert.equal(result.creator_count, 1);
  assert.equal(result.has_next_page, false);
  assert.equal(result.has_more_segments, true);
  assert.equal(result.crawl_complete, false);
  assert.equal(searchCalls, 1);
  assert.equal(detailQueues, 0);
});

test('Marketplace Discovery advances to the next filter segment after a segment ends', async () => {
  const stateUpserts = [];
  const requests = [];
  const run = { async update() {} };
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [run, true]; } },
    StateModel: {
      async findByPk() {
        return {
          segment_index: 0,
          crawl_status: 'ACTIVE',
          next_page_token: 'last-page',
          search_key: 'stable-search',
        };
      },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: { async bulkCreate() {} },
    discoverySegments: [
      { key: 'all', filters: {} },
      { key: 'high-gmv', filters: { gmv_ranges: ['GMV_RANGE_10000_AND_ABOVE'] } },
    ],
    searchQueue: emptySearchQueue,
    searchMarketplace: async (options) => {
      requests.push(options);
      return { data: { creators: [], next_page_token: null } };
    },
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  const result = await service.syncShop(marketplaceShop());

  assert.equal(requests[0].pageToken, 'last-page');
  assert.equal(result.has_more_segments, true);
  assert.equal(result.crawl_complete, false);
  assert.equal(stateUpserts.at(-1).segment_index, 1);
  assert.equal(stateUpserts.at(-1).next_page_token, null);
  assert.equal(stateUpserts.at(-1).search_key, null);
  assert.equal(stateUpserts.at(-1).crawl_status, 'ACTIVE');
});

test('Marketplace Discovery completes the crawl and waits until the refresh window', async () => {
  const currentTime = new Date('2026-07-22T03:19:17.000Z');
  const stateUpserts = [];
  const run = { async update() {} };
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [run, true]; } },
    StateModel: {
      async findByPk() { return { segment_index: 0, crawl_status: 'ACTIVE' }; },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: { async bulkCreate() {} },
    discoverySegments: [{ key: 'only-segment', filters: {} }],
    refreshIntervalMs: 24 * 60 * 60 * 1000,
    searchQueue: emptySearchQueue,
    searchMarketplace: async () => ({ data: { creators: [], next_page_token: null } }),
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    now: () => new Date(currentTime),
  });

  const result = await service.syncShop(marketplaceShop());

  assert.equal(result.crawl_complete, true);
  assert.equal(result.has_more_segments, false);
  assert.equal(stateUpserts.at(-1).crawl_status, 'COMPLETED');
  assert.equal(
    new Date(stateUpserts.at(-1).next_refresh_at).getTime(),
    currentTime.getTime() + 24 * 60 * 60 * 1000,
  );
});

test('Marketplace Discovery does not restart a completed crawl before refresh is due', async () => {
  let searchCalls = 0;
  const runUpdates = [];
  const service = createMarketplaceDiscoverySyncService({
    RunModel: {
      async findOrCreate() {
        return [{ async update(value) { runUpdates.push(value); } }, true];
      },
    },
    StateModel: {
      async findByPk() {
        return {
          crawl_status: 'COMPLETED',
          next_refresh_at: new Date('2026-07-23T03:19:17.000Z'),
        };
      },
    },
    searchQueue: emptySearchQueue,
    searchMarketplace: async () => { searchCalls += 1; },
    loadCooldown: async () => 0,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  const result = await service.syncShop(marketplaceShop());

  assert.equal(result.reason, 'crawl_complete');
  assert.equal(searchCalls, 0);
  assert.equal(runUpdates.at(-1).status, 'SKIPPED');
});

test('Marketplace Discovery only queues detail enrichment for newly stored creators', async () => {
  const queuedCreatorIds = [];
  const run = { async update() {} };
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [run, true]; } },
    StateModel: {
      async findByPk() { return null; },
      async upsert() {},
    },
    CreatorModel: {
      async findAll() { return [{ creator_open_id: 'existing-creator' }]; },
      async bulkCreate() {},
    },
    discoverySegments: [{ key: 'only-segment', filters: {} }],
    searchQueue: emptySearchQueue,
    searchMarketplace: async () => ({
      data: {
        creators: [
          { creator_open_id: 'existing-creator' },
          { creator_open_id: 'new-creator' },
        ],
      },
    }),
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    cacheCreatorProfiles: async () => {},
    queueCreatorDetails: async (_shop, creators) => {
      queuedCreatorIds.push(...creators.map((creator) => creator.creator_open_id));
    },
    autoDetailEnabled: true,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  await service.syncShop(marketplaceShop());

  assert.deepEqual(queuedCreatorIds, ['new-creator']);
});

test('Marketplace Discovery job persists cooldown after TikTok rate limiting', async () => {
  const currentTime = new Date('2026-07-22T03:19:17.000Z');
  const cooldowns = [];
  const runUpdates = [];
  const stateUpserts = [];
  const service = createMarketplaceDiscoverySyncService({
    RunModel: {
      async findOrCreate() { return [{ async update(value) { runUpdates.push(value); } }, true]; },
    },
    StateModel: {
      async findByPk() {
        return {
          next_page_token: 'page-3',
          search_key: 'stable-search',
          consecutive_rate_limits: 2,
          recovery_successes: 1,
        };
      },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: { async bulkCreate() {} },
    searchMarketplace: async () => {
      const error = new Error('Too many requests for downstream.');
      error.tiktokCode = 36009002;
      throw error;
    },
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    persistCooldown: async (value) => { cooldowns.push(value); },
    rateLimitCooldownMs: () => 60_000,
    searchQueue: emptySearchQueue,
    now: () => new Date(currentTime),
    logger: { warn() {} },
  });

  const result = await service.syncShop(marketplaceShop());

  assert.equal(result.failed, true);
  assert.equal(cooldowns.length, 1);
  assert.equal(cooldowns[0].shopId, 7);
  assert.equal(cooldowns[0].cooldownUntil, currentTime.getTime() + 60_000);
  assert.equal(stateUpserts.at(-1).next_page_token, 'page-3');
  assert.equal(stateUpserts.at(-1).search_key, 'stable-search');
  assert.equal(stateUpserts.at(-1).consecutive_rate_limits, 3);
  assert.equal(stateUpserts.at(-1).recovery_successes, 0);
  assert.equal(stateUpserts.at(-1).last_status, 'FAILED');
  assert.equal(runUpdates.at(-1).status, 'FAILED');
});

test('Marketplace Discovery checks again next minute after one successful recovery probe', async () => {
  const stateUpserts = [];
  const cooldowns = [];
  let clearCalls = 0;
  const service = createMarketplaceDiscoverySyncService({
    RunModel: {
      async findOrCreate() { return [{ async update() {} }, true]; },
    },
    StateModel: {
      async findByPk() {
        return {
          segment_index: 0,
          crawl_status: 'ACTIVE',
          next_page_token: 'page-3',
          search_key: 'stable-search',
          consecutive_rate_limits: 5,
          recovery_successes: 0,
        };
      },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: { async bulkCreate() {} },
    searchMarketplace: async () => ({
      data: {
        creators: [],
        next_page_token: 'page-4',
        search_key: 'stable-search',
      },
    }),
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    persistCooldown: async (value) => { cooldowns.push(value); },
    clearCooldown: async () => { clearCalls += 1; },
    recoverySuccessThreshold: 3,
    searchQueue: emptySearchQueue,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  await service.syncShop(marketplaceShop());

  assert.equal(stateUpserts.at(-1).next_page_token, 'page-4');
  assert.equal(stateUpserts.at(-1).search_key, 'stable-search');
  assert.equal(stateUpserts.at(-1).consecutive_rate_limits, 5);
  assert.equal(stateUpserts.at(-1).recovery_successes, 1);
  assert.equal(cooldowns.length, 0);
  assert.equal(clearCalls, 0);
});

test('Marketplace Discovery exits recovery mode after three consecutive successful probes', async () => {
  const stateUpserts = [];
  let clearCalls = 0;
  const service = createMarketplaceDiscoverySyncService({
    RunModel: {
      async findOrCreate() { return [{ async update() {} }, true]; },
    },
    StateModel: {
      async findByPk() {
        return {
          segment_index: 0,
          crawl_status: 'ACTIVE',
          next_page_token: 'page-4',
          search_key: 'stable-search',
          consecutive_rate_limits: 5,
          recovery_successes: 2,
        };
      },
      async upsert(value) { stateUpserts.push(value); },
    },
    CreatorModel: { async bulkCreate() {} },
    searchMarketplace: async () => ({
      data: {
        creators: [],
        next_page_token: 'page-5',
        search_key: 'stable-search',
      },
    }),
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    persistCooldown: async () => { throw new Error('should not persist cooldown'); },
    clearCooldown: async () => { clearCalls += 1; },
    recoverySuccessThreshold: 3,
    searchQueue: emptySearchQueue,
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  await service.syncShop(marketplaceShop());

  assert.equal(stateUpserts.at(-1).consecutive_rate_limits, 0);
  assert.equal(stateUpserts.at(-1).recovery_successes, 0);
  assert.equal(clearCalls, 1);
});

test('Marketplace Discovery waits 24 hours after TikTok daily query quota is reached', async () => {
  const currentTime = new Date('2026-07-22T03:19:17.000Z');
  const cooldowns = [];
  const run = { async update() {} };
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [run, true]; } },
    StateModel: {
      async findByPk() { return null; },
      async upsert() {},
    },
    CreatorModel: { async bulkCreate() {} },
    searchMarketplace: async () => {
      const error = new Error('The query quota has been reached.');
      error.tiktokCode = 45101004;
      throw error;
    },
    runRequest: async (_shopId, operation) => operation(),
    loadCooldown: async () => 0,
    persistCooldown: async (value) => { cooldowns.push(value); },
    searchQueue: emptySearchQueue,
    now: () => new Date(currentTime),
    logger: { warn() {} },
  });

  await service.syncShop(marketplaceShop());

  assert.equal(
    cooldowns[0].cooldownUntil,
    currentTime.getTime() + 24 * 60 * 60 * 1000,
  );
});

test('Marketplace Discovery respects the full persisted cooldown', async () => {
  const updatedAt = new Date('2026-07-22T04:00:00.000Z');
  const model = {
    async findOne() {
      return {
        cooldown_until: new Date(updatedAt.getTime() + 30 * 60_000),
        updated_at: updatedAt,
      };
    },
  };

  assert.equal(
    await loadMarketplaceCooldown(7, model),
    updatedAt.getTime() + 30 * 60_000,
  );
});

test('Marketplace Discovery rate-limit backoff grows exponentially and caps at one hour', () => {
  assert.equal(marketplaceRateLimitCooldownMs(1), DEFAULT_MARKETPLACE_COOLDOWN_MS);
  assert.equal(marketplaceRateLimitCooldownMs(2), DEFAULT_MARKETPLACE_COOLDOWN_MS * 2);
  assert.equal(marketplaceRateLimitCooldownMs(20), 60 * 60_000);
});
