const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMarketplaceDiscoverySyncService,
  scheduledMinuteValue,
} = require('../src/services/tiktokMarketplaceDiscoverySyncService');

const marketplaceShop = () => ({
  id: 7,
  cipher: 'shop-cipher',
  authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
});

test('Marketplace Discovery job stores one page and advances its pagination state', async () => {
  const currentTime = new Date('2026-07-22T03:19:17.000Z');
  const runUpdates = [];
  const stateUpserts = [];
  const storedRows = [];
  const requests = [];
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
    loadCooldown: async () => 0,
    now: () => new Date(currentTime),
    logger: { warn() {} },
  });

  const result = await service.syncShop(marketplaceShop(), scheduledMinuteValue(currentTime));

  assert.deepEqual(result, { skipped: false, creator_count: 1, has_next_page: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pageSize, 50);
  assert.equal(requests[0].pageToken, 'page-2');
  assert.equal(requests[0].searchKey, 'stable-search');
  assert.equal(storedRows.length, 1);
  assert.equal(storedRows[0].profile.username, 'new.koc');
  assert.equal(stateUpserts.at(-1).next_page_token, 'page-3');
  assert.equal(runUpdates.at(-1).status, 'SUCCEEDED');
});

test('Marketplace Discovery job claims each shop and minute only once across instances', async () => {
  let searchCalls = 0;
  const service = createMarketplaceDiscoverySyncService({
    RunModel: { async findOrCreate() { return [{}, false]; } },
    searchMarketplace: async () => { searchCalls += 1; },
    now: () => new Date('2026-07-22T03:19:17.000Z'),
  });

  const result = await service.syncShop(marketplaceShop());

  assert.deepEqual(result, { skipped: true, reason: 'already_claimed' });
  assert.equal(searchCalls, 0);
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
      async findByPk() { return null; },
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
    now: () => new Date(currentTime),
    logger: { warn() {} },
  });

  const result = await service.syncShop(marketplaceShop());

  assert.equal(result.failed, true);
  assert.equal(cooldowns.length, 1);
  assert.equal(cooldowns[0].shopId, 7);
  assert.equal(stateUpserts.at(-1).last_status, 'FAILED');
  assert.equal(runUpdates.at(-1).status, 'FAILED');
});
