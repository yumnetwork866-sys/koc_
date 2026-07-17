const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  AUTHORIZED_SHOPS_PATH,
  SHOP_PERFORMANCE_PATH,
  OPEN_COLLABORATIONS_PATH,
  TARGET_COLLABORATIONS_PATH,
  TARGET_COLLABORATION_DETAIL_PATH,
  AFFILIATE_ORDERS_PATH,
  SAMPLE_APPLICATIONS_PATH,
  CREATOR_CONTENT_DETAILS_PATH,
  MARKETPLACE_CREATORS_PATH,
  buildShopAuthorizationUrl,
  parseShopAuthorizationState,
  exchangeShopAuthorizationCode,
  signature,
  getAuthorizedShops,
  getShopPerformance,
  normalizeShopPerformance,
  searchOpenCollaborations,
  searchTargetCollaborations,
  getTargetCollaboration,
  searchAffiliateOrders,
  searchSellerSampleApplications,
  searchMarketplaceCreators,
  getSellerCreatorContentDetails,
  createCompassExportTask,
  listCompassExportTasks,
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

test('seller OAuth preserves the standalone affiliate return page', (t) => {
  configure(t);
  const url = new URL(buildShopAuthorizationUrl('/manage/affiliate'));
  const state = parseShopAuthorizationState(url.searchParams.get('state'));
  assert.equal(state.returnPath, '/manage/affiliate');
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
    assert.equal(url.searchParams.has('with_comparison'), false);
    assert.equal(options.headers['x-tts-access-token'], 'seller-token');
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { performance: { intervals: [] } }, request_id: 'request-1' }),
    };
  });
  assert.equal(payload.request_id, 'request-1');
});

test('shop performance 202509 response is normalized for the existing analytics UI', () => {
  const performance = normalizeShopPerformance({
    intervals: [{
      start_date: '2026-07-01',
      end_date: '2026-07-02',
      sales: {
        gmv: { amount: '233', currency: 'MYR' },
        orders: 23,
        items_sold: 25,
        breakdowns: [{
          content_type: 'LIVE',
          sales: { gmv: { amount: '43', currency: 'MYR' } },
        }],
      },
      traffic: {
        breakdowns: [
          { traffic: { impressions: 34, page_views: 43 } },
          { traffic: { impressions: 6, page_views: 7 } },
        ],
      },
      cancel_and_refunds: { returned: 2, canceled: 3, refunded: 1 },
    }],
  });
  assert.deepEqual(performance.intervals[0].gmv, { amount: '233', currency: 'MYR' });
  assert.equal(performance.intervals[0].orders, 23);
  assert.equal(performance.intervals[0].units_sold, 25);
  assert.equal(performance.intervals[0].product_impressions, 40);
  assert.equal(performance.intervals[0].product_page_views, 50);
  assert.equal(performance.intervals[0].refunds, 1);
  assert.equal(performance.intervals[0].cancellations_and_returns, 5);
  assert.deepEqual(performance.intervals[0].gmv_breakdowns, [
    { type: 'LIVE', amount: '43', currency: 'MYR' },
  ]);
});

test('shop performance normalizer supports the current 202509 response fields', () => {
  const performance = normalizeShopPerformance({
    intervals: [{
      start_date: '2026-07-09',
      end_date: '2026-07-10',
      gmv: {
        overall: { amount: '8222.47', currency: 'MYR' },
        breakdowns: [{ type: 'LIVE', gmv: { amount: '4774.89', currency: 'MYR' } }],
      },
      sales: {
        orders_count: 34,
        sku_orders_count: 34,
        items_sold: 34,
        avg_customers_count: 29,
        refunds: { amount: '359.46', currency: 'MYR' },
      },
      traffic: { avg_visitors: 1213, avg_page_views: 2719 },
      // Values written by the first 202509 adapter must be replaced by the
      // authoritative nested response when old snapshots are read again.
      orders: 0,
      buyers: 0,
      refunds: 0,
      product_impressions: 0,
      product_page_views: 0,
      cancellations_and_returns: 0,
    }],
  });
  const [interval] = performance.intervals;
  assert.deepEqual(interval.gmv, { amount: '8222.47', currency: 'MYR' });
  assert.equal(interval.orders, 34);
  assert.equal(interval.units_sold, 34);
  assert.equal(interval.buyers, 29);
  assert.equal(interval.product_impressions, 1213);
  assert.equal(interval.product_page_views, 2719);
  assert.deepEqual(interval.refunds, { amount: '359.46', currency: 'MYR' });
  assert.equal(interval.cancellations_and_returns, null);
  assert.deepEqual(interval.gmv_breakdowns, [
    { type: 'LIVE', amount: '4774.89', currency: 'MYR' },
  ]);
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

test('search target collaborations defaults the required status to ONGOING', async (t) => {
  configure(t);
  const payload = await searchTargetCollaborations({
    authorization: sellerAuthorization(), shopCipher: 'cipher-1',
  }, async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { collaboration_status: 'ONGOING' });
    return successResponse({ target_collaborations: [{ id: 'target-1', type: 'STANDARD' }] });
  });
  assert.equal(payload.data.target_collaborations[0].status, 'ONGOING');
  assert.equal(payload.data.target_collaborations[0].collaboration_status, 'ONGOING');
});

test('get target collaboration loads creator profiles from the detail endpoint', async (t) => {
  configure(t);
  await getTargetCollaboration({
    authorization: sellerAuthorization(), shopCipher: 'cipher-1', collaborationId: 'target-1',
  }, async (url, options) => {
    assert.equal(url.pathname, `${TARGET_COLLABORATION_DETAIL_PATH}/target-1`);
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return successResponse({ target_collaboration: { creators: [{ username: 'creator.one' }] } });
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

test('search Seller sample applications uses the existing Seller Affiliate read scope', async (t) => {
  configure(t);
  await searchSellerSampleApplications({
    authorization: sellerAuthorization(),
    shopCipher: 'cipher-1',
    pageSize: 20,
    keyword: 'demo.creator',
    status: 'PENDING',
  }, async (url, options) => {
    assert.equal(url.pathname, SAMPLE_APPLICATIONS_PATH);
    assert.equal(url.searchParams.get('shop_cipher'), 'cipher-1');
    assert.equal(url.searchParams.get('page_size'), '20');
    assert.deepEqual(JSON.parse(options.body), { username: 'demo.creator', status: 'PENDING' });
    return successResponse({ sample_applications: [] });
  });
});

test('search Marketplace creators uses creator marketplace scope and username keyword', async (t) => {
  configure(t);
  const authorization = sellerAuthorization();
  authorization.granted_scopes.push('seller.creator_marketplace.read');
  await searchMarketplaceCreators({
    authorization,
    shopCipher: 'cipher-1',
    pageSize: 20,
    keyword: '@demo.creator',
  }, async (url, options) => {
    assert.equal(url.pathname, MARKETPLACE_CREATORS_PATH);
    assert.equal(url.searchParams.get('shop_cipher'), 'cipher-1');
    assert.equal(url.searchParams.get('page_size'), '20');
    assert.deepEqual(JSON.parse(options.body), { keyword: '@demo.creator' });
    return successResponse({
      creators: [{
        username: 'demo.creator',
        nickname: 'Demo Creator',
        avatar: { url: 'https://example.test/avatar.webp' },
        creator_open_id: 'creator-open-id',
      }],
    });
  });
});

test('search Marketplace creators requires seller creator marketplace scope', async (t) => {
  configure(t);
  await assert.rejects(
    searchMarketplaceCreators({
      authorization: sellerAuthorization(),
      shopCipher: 'cipher-1',
      keyword: 'demo.creator',
    }),
    /seller\.creator_marketplace\.read/,
  );
});

test('get Seller creator content details uses product filters and Seller token', async (t) => {
  configure(t);
  await getSellerCreatorContentDetails({
    authorization: sellerAuthorization(),
    shopCipher: 'cipher-1',
    productId: 'product-1',
    pageSize: 50,
  }, async (url, options) => {
    assert.equal(url.pathname, CREATOR_CONTENT_DETAILS_PATH);
    assert.equal(url.searchParams.get('shop_cipher'), 'cipher-1');
    assert.equal(url.searchParams.get('product_id'), 'product-1');
    assert.equal(url.searchParams.get('page_size'), '50');
    assert.equal(options.method, 'GET');
    return successResponse({ creator_content_details: [] });
  });
});

test('seller affiliate API fails before network access when the read scope is missing', async (t) => {
  configure(t);
  await assert.rejects(
    searchOpenCollaborations({ authorization: { ...sellerAuthorization(), granted_scopes: [] }, shopCipher: 'cipher-1' }),
    /seller\.affiliate_collaboration\.read/,
  );
});

test('Compass creator export uses the production task parameters', async (t) => {
  configure(t);
  await createCompassExportTask({
    authorization: sellerAuthorization(),
    shopCipher: 'cipher-1',
    windowType: 'PAST_7_DAYS',
    endDay: 20260715,
    planType: 'ALL',
  }, async (url, options) => {
    assert.equal(url.pathname, '/affiliate_seller/202603/compass/offline_task');
    assert.deepEqual(JSON.parse(options.body), {
      module_type: 'CREATOR',
      window_type: 'PAST_7_DAYS',
      end_day: 20260715,
      plan_type: 'ALL',
    });
    return successResponse({ task: { id: 'task-1' } });
  });
});

test('Compass task list includes the required production doc_type', async (t) => {
  configure(t);
  await listCompassExportTasks({
    authorization: sellerAuthorization(), shopCipher: 'cipher-1', pageSize: 10,
  }, async (url) => {
    assert.equal(url.pathname, '/affiliate_seller/202603/compass/offline_tasks');
    assert.equal(url.searchParams.get('doc_type'), 'CREATOR');
    assert.equal(url.searchParams.get('page_size'), '10');
    return successResponse({ tasks: [] });
  });
});
