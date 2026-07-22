const test = require('node:test');
const assert = require('node:assert/strict');

const { createMarketplaceSearchQueueService } = require('../src/services/tiktokMarketplaceSearchQueueService');

test('Marketplace search queue deduplicates pending keywords and caches completed searches', async () => {
  const currentTime = new Date('2026-07-22T06:00:00.000Z');
  const rows = [];
  const SearchModel = {
    async findOne({ where }) {
      return rows.find((row) => row.shop_id === where.shop_id && row.cache_key === where.cache_key) || null;
    },
    async findAll() { return rows; },
    async upsert(value) {
      const row = {
        ...value,
        async update(update) { Object.assign(this, update); return this; },
      };
      rows.push(row);
      return row;
    },
  };
  const service = createMarketplaceSearchQueueService({ SearchModel, now: () => new Date(currentTime) });

  const first = await service.queueSearch(7, '@Shurr88');
  const duplicate = await service.queueSearch(7, 'shurr88');
  const pending = await service.nextPendingSearch(7);
  await service.completeSearch(pending, 1);
  const cached = await service.queueSearch(7, 'SHURR88');

  assert.equal(first.status, 'PENDING');
  assert.equal(duplicate.status, 'PENDING');
  assert.equal(rows.length, 1);
  assert.equal(pending.payload.keyword, 'shurr88');
  assert.equal(pending.payload.creator_count, 1);
  assert.equal(cached.status, 'SUCCEEDED');
});
