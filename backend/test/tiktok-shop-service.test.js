const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  AUTHORIZED_SHOPS_PATH,
  SHOP_PERFORMANCE_PATH,
  OPEN_COLLABORATIONS_PATH,
  TARGET_COLLABORATIONS_PATH,
  AFFILIATE_ORDERS_PATH,
  buildShopAuthorizationUrl,
  parseShopAuthorizationState,
  exchangeShopAuthorizationCode,
  signature,
  getAuthorizedShops,
  getShopPerformance,
  searchOpenCollaborations,
  searchTargetCollaborations,
  searchAffiliateOrders,
} = require('../src/services/tiktokShopService');
const { encryptPartnerToken } = require('../src/lib/tiktokPartnerTokenEncryption');

const ENV_KEYS = [
  'TIKTOK_PARTNER_APP_KEY',
  'TIKTOK_PARTNER_APP_SECRET',
  'TIKTOK_PARTNER_SERVICE_ID',
  'TIKTOK_PARTNER_REDIRECT_URI',
  'TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY',
  'TIKTOK_PARTNER_TOKEN_BASE_URL',
  'TIKTOK_PARTNER_API_BASE_URL',
  'TIKTOK_SHOP_SERVICE_ID',
  'TIKTOK_SHOP_AUTHORIZE_URL',
];

const configure = (t) => {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, {
    TIKTOK_PARTNER_APP_KEY: 'shop-app-key',
    TIKTOK_PARTNER_APP_SECRET: 'shop-app-secret',
    TIKTOK_PARTNER_SERVICE_ID: 'service-id',
    TIKTOK_PARTNER_REDIRECT_URI: 'https://api.example.test/api/bookings/tiktok-partner/callback',
    TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY: 'test-shop-encryption-secret-at-least-32-characters',
    TIKTOK_PARTNER_TOKEN_BASE_URL: 'https://auth.example.test/api/v2/token',
    TIKTOK_PARTNER_API_BASE_URL: 'https://api.example.test',
    TIKTOK_SHOP_AUTHORIZE_URL: 'https://services.example.test/open/authorize',
  });
};

test('seller OAuth URL contains service id and a verifiable expiring state', (t) => {
  configure(t);
  const url = new URL(buildShopAuthorizationUrl());
  assert.equal(url.origin, 'https://services.example.test');
  assert.equal(url.searchParams.get('service_id'), 'service-id');
  const state = parseShopAuthorizationState(url.searchParams.get('state'));
  assert.equal(state.oauthType, 'shop');
  assert.equal(state.returnPath, '/manage/shop-analytics');
  assert.ok(state.nonce);
  assert.ok(state.expiresAt > Date.now());
});

test('seller authorization code is exchanged through the TikTok Shop token endpoint', async (t) => {
  configure(t);
  const token = await exchangeShopAuthorizationCode('authorization-code', async (url, options) => {
    assert.equal(url.origin, 'https://auth.example.test');
    assert.equal(url.pathname, '/api/v2/token/get');
    assert.equal(url.searchParams.get('app_key'), 'shop-app-key');
    assert.equal(url.searchParams.get('auth_code'), 'authorization-code');
    assert.equal(url.searchParams.get('grant_type'), 'authorized_code');
    assert.equal(options.headers.accept, 'application/json');
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { access_token: 'seller-token', user_type: 0 } }),
    };
  });
  assert.equal(token.user_type, 0);
});

test('signature follows TikTok Shop HMAC-SHA256 signing rules', (t) => {
  configure(t);
  const query = { timestamp: 1623812664, app_key: 'shop-app-key', shop_cipher: 'shop-cipher', sign: 'ignored' };
  const parameterString = 'app_keyshop-app-keyshop_ciphershop-ciphertimestamp1623812664';
  const message = `shop-app-secret${SHOP_PERFORMANCE_PATH}${parameterString}shop-app-secret`;
  const expected = crypto.createHmac('sha256', 'shop-app-secret').update(message).digest('hex');
  assert.equal(signature({ path: SHOP_PERFORMANCE_PATH, query }), expected);
});

test('authorized shops request uses the seller token and returns the shop list', async (t) => {
  configure(t);
  const shops = await getAuthorizedShops('seller-token', async (url, options) => {
    assert.equal(url.pathname, AUTHORIZED_SHOPS_PATH);
    assert.equal(url.searchParams.get('app_key'), 'shop-app-key');
    assert.ok(url.searchParams.get('sign'));
    assert.equal(options.headers['x-tts-access-token'], 'seller-token');
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { shops: [{ id: 'shop-1', cipher: 'cipher-1' }] } }),
    };
  });
  assert.equal(shops[0].id, 'shop-1');
});

test('shop performance request uses the selected shop cipher and date range', async (t) => {
  configure(t);
  const authorization = {
    access_token_encrypted: encryptPartnerToken('seller-token'),
    access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
  };
  const payload = await getShopPerformance({
    authorization,
    shopCipher: 'cipher-1',
    startDate: '2026-06-01',
    endDate: '2026-07-01',
    currency: 'LOCAL',
  }, async (url, options) => {
    assert.equal(url.pathname, SHOP_PERFORMANCE_PATH);
    assert.equal(url.searchParams.get('shop_cipher'), 'cipher-1');
    assert.equal(url.searchParams.get('start_date_ge'), '2026-06-01');
    assert.equal(url.searchParams.get('end_date_lt'), '2026-07-01');
    assert.equal(url.searchParams.get('granularity'), '1D');
    assert.equal(url.searchParams.get('with_comparison'), 'true');
    assert.equal(options.headers['x-tts-access-token'], 'seller-token');
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { performance: { intervals: [] } }, request_id: 'request-1' }),
    };
  });
  assert.equal(payload.request_id, 'request-1');
});

const sellerAuthorization = () => ({
  granted_scopes: ['seller.affiliate_collaboration.read'],
  access_token_encrypted: encryptPartnerToken('seller-token'),
  access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
});

const successResponse = (data = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ code: 0, data, request_id: 'affiliate-request' }),
});

test('search open collaborations uses Seller scope, shop cipher, pagination and product keyword', async (t) => {
  configure(t);
  const payload = await searchOpenCollaborations({
    authorization: sellerAuthorization(), shopCipher: 'cipher-1', pageSize: 20, keyword: 'Blue shirt',
  }, async (url, options) => {
    assert.equal(url.pathname, OPEN_COLLABORATIONS_PATH);
    assert.equal(url.searchParams.get('shop_cipher'), 'cipher-1');
    assert.equal(url.searchParams.get('page_size'), '20');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { keyword_type: 'PRODUCT_NAME', keyword: 'Blue shirt' });
    return successResponse({ open_collaborations: [] });
  });
  assert.equal(payload.request_id, 'affiliate-request');
});

test('search target collaborations sends supported seller filters', async (t) => {
  configure(t);
  await searchTargetCollaborations({
    authorization: sellerAuthorization(), shopCipher: 'cipher-1', keyword: 'Launch invite', status: 'ONGOING',
  }, async (url, options) => {
    assert.equal(url.pathname, TARGET_COLLABORATIONS_PATH);
    assert.deepEqual(JSON.parse(options.body), {
      search_param: { keyword_type: 'TARGET_COLLABORATION_NAME', keyword: 'Launch invite' },
      collaboration_status: 'ONGOING',
    });
    return successResponse({ target_collaborations: [] });
  });
});

test('search affiliate orders sends the time window and program id', async (t) => {
  configure(t);
  await searchAffiliateOrders({
    authorization: sellerAuthorization(), shopCipher: 'cipher-1', startTime: 1700000000, endTime: 1700100000, programId: 'program-1',
  }, async (url, options) => {
    assert.equal(url.pathname, AFFILIATE_ORDERS_PATH);
    assert.deepEqual(JSON.parse(options.body), { create_time_ge: 1700000000, create_time_lt: 1700100000, program_id: 'program-1' });
    return successResponse({ orders: [] });
  });
});

test('seller affiliate API fails before network access when the read scope is missing', async (t) => {
  configure(t);
  await assert.rejects(
    searchOpenCollaborations({ authorization: { ...sellerAuthorization(), granted_scopes: [] }, shopCipher: 'cipher-1' }),
    /seller\.affiliate_collaboration\.read/,
  );
});
