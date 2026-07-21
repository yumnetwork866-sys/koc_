const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getUsdMyrRate,
  convertUsdMoneyToMyr,
  addMarketplaceLocalCurrency,
  clearExchangeRateCache,
} = require('../src/services/exchangeRateService');

const bnmResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: [{
      currency_code: 'USD',
      unit: 1,
      rate: { date: '2026-07-21', middle_rate: 4.0895 },
    }],
  }),
});

test('loads and caches the BNM USD/MYR middle rate', async (t) => {
  clearExchangeRateCache();
  t.after(clearExchangeRateCache);
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.match(url, /api\.bnm\.gov\.my\/public\/exchange-rate/);
    assert.equal(options.headers.accept, 'application/vnd.BNM.API.v1+json');
    return bnmResponse();
  };
  const first = await getUsdMyrRate(fetchImpl);
  const second = await getUsdMyrRate(fetchImpl);
  assert.deepEqual(first, { base: 'USD', quote: 'MYR', rate: 4.0895, date: '2026-07-21', source: 'Bank Negara Malaysia' });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('converts marketplace USD GMV to MYR and preserves source money', async (t) => {
  clearExchangeRateCache();
  t.after(clearExchangeRateCache);
  const payload = await addMarketplaceLocalCurrency({
    data: { creators: [{ username: 'mawarrahmad', gmv: { amount: '82943.81', currency: 'USD' } }] },
  }, 'MY', async () => bnmResponse());
  const localGmv = payload.data.creators[0].local_gmv;
  assert.equal(localGmv.currency, 'MYR');
  assert.equal(localGmv.source_amount, '82943.81');
  assert.equal(localGmv.exchange_rate, 4.0895);
  assert.ok(Math.abs(Number(localGmv.amount) - 339198.710995) < 0.000001);
  assert.equal(payload.data.exchange_rate.source, 'Bank Negara Malaysia');
});

test('does not relabel unsupported currencies', () => {
  assert.equal(convertUsdMoneyToMyr({ amount: '100', currency: 'SGD' }, { rate: 4.0895 }), null);
});
