const assert = require('node:assert/strict');
const test = require('node:test');

const { createTtlPromiseCache } = require('../src/lib/ttlPromiseCache');

test('TTL cache reuses values and reloads them after expiration', async () => {
  let currentTime = 1000;
  let calls = 0;
  const cache = createTtlPromiseCache({ ttlMs: 120000, now: () => currentTime });
  const loader = async () => ({ sequence: ++calls });

  const first = await cache.getOrLoad('shop:1:open', loader);
  const second = await cache.getOrLoad('shop:1:open', loader);
  currentTime += 120001;
  const third = await cache.getOrLoad('shop:1:open', loader);

  assert.deepEqual(first, { value: { sequence: 1 }, hit: false });
  assert.deepEqual(second, { value: { sequence: 1 }, hit: true });
  assert.deepEqual(third, { value: { sequence: 2 }, hit: false });
});

test('TTL cache coalesces concurrent loads and does not cache failures', async () => {
  let resolveLoad;
  let calls = 0;
  const cache = createTtlPromiseCache({ ttlMs: 120000 });
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { resolveLoad = resolve; });
  };
  const first = cache.getOrLoad('shop:1:orders', loader);
  const second = cache.getOrLoad('shop:1:orders', loader);
  await Promise.resolve();
  resolveLoad({ orders: [] });

  assert.deepEqual(await first, { value: { orders: [] }, hit: false });
  assert.deepEqual(await second, { value: { orders: [] }, hit: true });
  assert.equal(calls, 1);

  let failures = 0;
  await assert.rejects(cache.getOrLoad('failure', async () => { failures += 1; throw new Error('temporary'); }), /temporary/);
  await assert.rejects(cache.getOrLoad('failure', async () => { failures += 1; throw new Error('temporary'); }), /temporary/);
  assert.equal(failures, 2);
});
