const test = require('node:test');
const assert = require('node:assert/strict');

const { createMarketplaceRequestGate } = require('../src/services/tiktokMarketplaceRequestGate');

test('Creator Discovery request gate waits for the shared shop slot', async () => {
  let currentTime = Date.parse('2026-07-22T03:00:00.000Z');
  const queryLog = [];
  const nextRequestAt = new Date(currentTime + 1500);
  const sequelizeInstance = {
    async transaction(operation) { return operation({ id: 'transaction' }); },
    async query(sql, options) {
      queryLog.push({ sql: sql.trim(), options });
      if (sql.includes('SELECT next_request_at')) return [[{ next_request_at: nextRequestAt }], {}];
      return [[], {}];
    },
  };
  const gate = createMarketplaceRequestGate({
    sequelizeInstance,
    minIntervalMs: 3000,
    now: () => currentTime,
    sleep: async (milliseconds) => { currentTime += milliseconds; },
  });

  const result = await gate(7, async () => 'ok');

  assert.equal(result, 'ok');
  assert.equal(currentTime, nextRequestAt.getTime());
  assert.match(queryLog[0].sql, /pg_advisory_xact_lock/);
  assert.equal(queryLog[0].options.replacements.shopId, 7);
  assert.equal(
    queryLog[2].options.replacements.nextRequestAt.getTime(),
    nextRequestAt.getTime() + 60_000,
  );
});

test('Creator Discovery request gate enforces at most one request per shop per minute', async () => {
  let currentTime = Date.parse('2026-07-22T03:00:00.000Z');
  let persistedNextRequestAt = null;
  const calls = [];
  const sequelizeInstance = {
    async transaction(operation) { return operation({}); },
    async query(sql, options) {
      if (sql.includes('SELECT next_request_at')) {
        return [[...(persistedNextRequestAt ? [{ next_request_at: persistedNextRequestAt }] : [])], {}];
      }
      if (sql.includes('INSERT INTO tiktok_marketplace_request_gates')) {
        persistedNextRequestAt = options.replacements.nextRequestAt;
      }
      return [[], {}];
    },
  };
  const gate = createMarketplaceRequestGate({
    sequelizeInstance,
    minIntervalMs: 1000,
    now: () => currentTime,
    sleep: async (milliseconds) => { currentTime += milliseconds; },
  });

  await gate(7, async () => { calls.push(currentTime); });
  await gate(7, async () => { calls.push(currentTime); });

  assert.equal(calls.length, 2);
  assert.equal(calls[1] - calls[0], 60_000);
});

test('Creator Discovery request gate commits the slot before propagating an API error', async () => {
  let transactionCompleted = false;
  const sequelizeInstance = {
    async transaction(operation) {
      const value = await operation({});
      transactionCompleted = true;
      return value;
    },
    async query(sql) {
      if (sql.includes('SELECT next_request_at')) return [[], {}];
      return [[], {}];
    },
  };
  const gate = createMarketplaceRequestGate({ sequelizeInstance, now: () => 1000 });
  const apiError = new Error('rate limited');

  await assert.rejects(() => gate(7, async () => { throw apiError; }), apiError);
  assert.equal(transactionCompleted, true);
});
