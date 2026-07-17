const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const XLSX = require('xlsx');

const {
  exportDateRange,
  shiftEndDay,
  parseCreatorPerformanceWorkbook,
  parseBasePerformanceWorkbook,
  enrichCreatorRows,
  loadMarketplaceCreatorProfiles,
  createCreatorPerformanceExportWithFallback,
} = require('../src/services/tiktokCreatorPerformanceService');

test('Compass date ranges are inclusive and match TikTok report filenames', () => {
  assert.deepEqual(exportDateRange('PAST_7_DAYS', 20260715), {
    startDate: '2026-07-09',
    endDate: '2026-07-15',
  });
  assert.deepEqual(exportDateRange('PAST_30_DAYS', 20260715), {
    startDate: '2026-06-16',
    endDate: '2026-07-15',
  });
  assert.equal(shiftEndDay(20260716, -1), 20260715);
});

test('Compass export falls back when TikTok has not made the requested day available', async () => {
  const attempts = [];
  const result = await createCreatorPerformanceExportWithFallback({ region: 'MY' }, {
    windowType: 'PAST_7_DAYS',
    endDay: 20260716,
    planType: 'ALL',
  }, {
    createExport: async (_shop, options) => {
      attempts.push(options.endDay);
      if (options.endDay === 20260716) {
        const error = new Error('The day of the export is not available.');
        error.tiktokCode = 13017003;
        throw error;
      }
      return { id: 1, status: 'PROCESSING' };
    },
  });
  assert.deepEqual(attempts, [20260716, 20260715]);
  assert.equal(result.requestedEndDay, 20260716);
  assert.equal(result.endDay, 20260715);
  assert.equal(result.fallbackDays, 1);
});

test('provided Creator List workbook maps to Creator Performance fields', () => {
  const workbookPath = path.resolve(__dirname, '../../Creator_List_20260709-20260715_20260716082822.xlsx');
  const rows = parseCreatorPerformanceWorkbook(fs.readFileSync(workbookPath), {
    exportId: 1,
    shopId: 1,
    startDate: '2026-07-09',
    endDate: '2026-07-15',
    windowType: 'PAST_7_DAYS',
    planType: 'ALL',
    currency: 'MYR',
  });
  assert.equal(rows.length, 1061);
  assert.equal(rows[0].username, 'my.belanjaharian');
  assert.equal(rows[0].affiliate_gmv, 7988.8);
  assert.equal(rows[0].affiliate_orders, 20);
  assert.equal(rows[0].items_sold, 20);
  assert.equal(rows[0].product_impressions, 5037);
  assert.equal(rows[0].refunded_gmv, 4853.9);
  assert.equal(rows[0].followers, 1258);
});

test('Compass production workbook variant with MYR formatting is parsed', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      'Creator name': '',
      'Creator-attributed GMV': 'Metric description',
      Refunds: 'Metric description',
    },
    {
      'Creator name': 'my.belanjaharian',
      'Creator-attributed GMV': 'RM7,988.80',
      Refunds: 'RM0.00',
      'Est. commission': 'RM399.20',
      'Attributed orders': '20',
      'Creator-attributed items sold': '20',
      'Items refunded': '12',
      Videos: '1',
      'LIVE streams': '0',
      AOV: 'RM399.44',
      'Samples shipped': '0',
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet 1');
  const [row] = parseCreatorPerformanceWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    exportId: 1, shopId: 1, startDate: '2026-07-09', endDate: '2026-07-15',
    windowType: 'PAST_7_DAYS', planType: 'ALL', currency: 'MYR',
  });
  assert.equal(row.affiliate_gmv, 7988.8);
  assert.equal(row.affiliate_orders, 20);
  assert.equal(row.items_sold, 20);
  assert.equal(row.refunded_gmv, 0);
  assert.equal(row.average_order_value, 399.44);
});

test('Compass BASE workbook skips the description row and maps core metrics', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Creator-attributed GMV', 'Creator-attributed items sold', 'Refunds', 'Est. commission', 'Videos', 'LIVE streams', 'Samples shipped', 'Items refunded', 'AOV'],
    ['Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description', 'Metric description'],
    ['RM18,139.74', '80', 'RM0.00', 'RM699.03', '30', '1', '9', '23', 'RM232.56'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet 1');
  const row = parseBasePerformanceWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    exportId: 2,
    shopId: 1,
    startDate: '2026-07-09',
    endDate: '2026-07-15',
    windowType: 'PAST_7_DAYS',
    currency: 'MYR',
  });
  assert.equal(row.creator_attributed_gmv, 18139.74);
  assert.equal(row.creator_attributed_items_sold, 80);
  assert.equal(row.estimated_commission, 699.03);
  assert.equal(row.videos, 30);
  assert.equal(row.live_streams, 1);
  assert.equal(row.samples_shipped, 9);
  assert.equal(row.items_refunded, 23);
  assert.equal(row.average_order_value, 232.56);
});

test('creator rows use Sample Applications first and Marketplace as avatar fallback', async () => {
  const rows = [
    { username: 'sample.creator', nickname: null, avatar_url: null, creator_open_id: null, followers: 0 },
    { username: 'market.creator', nickname: null, avatar_url: null, creator_open_id: null, followers: 0 },
  ];
  const marketplaceKeywords = [];
  await enrichCreatorRows({
    id: 1,
    cipher: 'shop-cipher',
    authorization: {
      granted_scopes: [
        'seller.affiliate_collaboration.read',
        'seller.creator_marketplace.read',
      ],
    },
  }, rows, {
    searchSamples: async () => ({
      data: {
        sample_applications: [{
          creator: {
            username: 'sample.creator',
            nickname: 'Sample Creator',
            avatar_url: 'https://example.test/sample.webp',
            follower_count: 120,
            user_id: 'sample-user-id',
          },
        }],
      },
    }),
    searchMarketplace: async ({ keyword }) => {
      marketplaceKeywords.push(keyword);
      return {
        data: {
          creators: [{
            username: keyword,
            nickname: 'Market Creator',
            avatar: { url: 'https://example.test/market.webp' },
            follower_count: 340,
            creator_open_id: 'market-open-id',
          }],
        },
      };
    },
  });

  assert.deepEqual(marketplaceKeywords, ['market.creator']);
  assert.deepEqual(rows[0], {
    username: 'sample.creator',
    nickname: 'Sample Creator',
    avatar_url: 'https://example.test/sample.webp',
    creator_open_id: 'sample-user-id',
    followers: 120,
  });
  assert.deepEqual(rows[1], {
    username: 'market.creator',
    nickname: 'Market Creator',
    avatar_url: 'https://example.test/market.webp',
    creator_open_id: 'market-open-id',
    followers: 340,
  });
});

test('creator Marketplace fallback is skipped when OAuth scope is not granted', async () => {
  let marketplaceCalls = 0;
  const rows = [{ username: 'missing.creator', nickname: null, avatar_url: null, creator_open_id: null, followers: 0 }];
  await enrichCreatorRows({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] },
  }, rows, {
    searchSamples: async () => ({ data: { sample_applications: [] } }),
    searchMarketplace: async () => {
      marketplaceCalls += 1;
      return { data: { creators: [] } };
    },
  });
  assert.equal(marketplaceCalls, 0);
  assert.equal(rows[0].avatar_url, null);
});

test('creator Marketplace refresh fills followers when an avatar already exists', async () => {
  const rows = [{
    username: 'avatar.only',
    nickname: 'Avatar Only',
    avatar_url: 'https://example.test/existing.webp',
    creator_open_id: null,
    followers: 0,
  }];
  const marketplaceKeywords = [];
  await enrichCreatorRows({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, rows, {
    searchSamples: async () => ({ data: { sample_applications: [] } }),
    searchMarketplace: async ({ keyword }) => {
      marketplaceKeywords.push(keyword);
      return {
        data: {
          creators: [{
            username: keyword,
            nickname: 'Avatar Only',
            avatar: { url: 'https://example.test/current.webp' },
            follower_count: 9876,
            creator_open_id: 'avatar-only-open-id',
          }],
        },
      };
    },
    marketplaceOptions: { minIntervalMs: 0 },
  });

  assert.deepEqual(marketplaceKeywords, ['avatar.only']);
  assert.equal(rows[0].followers, 9876);
  assert.equal(rows[0].creator_open_id, 'avatar-only-open-id');
});

test('Marketplace creator lookup cools down downstream rate limits', async () => {
  let calls = 0;
  const cooldowns = new Map();
  const shopCooldowns = new Map();
  const now = () => 1000;
  const profiles = await loadMarketplaceCreatorProfiles({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, ['retry.creator'], async () => {
    calls += 1;
    const error = new Error('Too many requests for downstream.');
    error.tiktokCode = 36009002;
    throw error;
  }, {
    concurrency: 1,
    minIntervalMs: 0,
    retryCount: 2,
    rateLimitCooldownMs: 60000,
    cooldowns,
    shopCooldowns,
    now,
    sleep: async () => {},
  });

  assert.equal(calls, 1);
  assert.equal(profiles.size, 0);
  assert.equal(cooldowns.get('1:retry.creator'), 61000);
  assert.equal(shopCooldowns.get('1'), 61000);
});

test('Marketplace creator lookup still retries transient transport failures', async () => {
  let calls = 0;
  const profiles = await loadMarketplaceCreatorProfiles({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, ['retry.creator'], async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('socket timeout');
    }
    return {
      data: {
        creators: [{
          username: 'retry.creator',
          nickname: 'Retry Creator',
          avatar: { url: 'https://example.test/retry.webp' },
          creator_open_id: 'retry-open-id',
        }],
      },
    };
  }, {
    concurrency: 1,
    minIntervalMs: 0,
    retryCount: 2,
    sleep: async () => {},
  });

  assert.equal(calls, 2);
  assert.equal(profiles.get('retry.creator').avatar_url, 'https://example.test/retry.webp');
});

test('Marketplace creator lookup skips the whole shop during cooldown', async () => {
  let calls = 0;
  const cooldowns = new Map();
  const shopCooldowns = new Map([['1', 2000]]);
  const profiles = await loadMarketplaceCreatorProfiles({
    id: 1,
    cipher: 'shop-cipher',
    authorization: { granted_scopes: ['seller.creator_marketplace.read'] },
  }, ['one.creator', 'two.creator'], async () => {
    calls += 1;
    return { data: { creators: [] } };
  }, {
    concurrency: 1,
    minIntervalMs: 0,
    cooldowns,
    shopCooldowns,
    now: () => 1000,
    sleep: async () => {},
  });

  assert.equal(calls, 0);
  assert.equal(profiles.size, 0);
});
