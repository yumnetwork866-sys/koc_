const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

test('shop video catalog follows every TikTok page and stores daily snapshots', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const shopServicePath = require.resolve('../src/services/tiktokShopService');
  const fixturesPath = require.resolve('../src/lib/tiktokDemoFixtures');
  const servicePath = require.resolve('../src/services/shopVideoCatalogService');
  let apiCalls = 0;
  let catalogRows = 0;
  let snapshotRows = 0;
  const restores = [
    mockModule(modelsPath, {
      ShopVideo: {
        bulkCreate: async (rows) => { catalogRows += rows.length; },
        findAll: async ({ where }) => where.platform_video_id[Object.getOwnPropertySymbols(where.platform_video_id)[0]]
          .map((platformVideoId, index) => ({ id: index + 1, platform_video_id: platformVideoId })),
      },
      ShopVideoPerformanceSnapshot: {
        bulkCreate: async (rows) => { snapshotRows += rows.length; },
      },
    }),
    mockModule(shopServicePath, {
      getShopVideoPerformance: async ({ pageToken }) => {
        apiCalls += 1;
        const page = Number(pageToken || 0);
        return {
          data: {
            videos: [0, 1].map(() => ({
              id: `video-${page}`,
              creator: { user_name: 'creator' },
              video_post_time: '2026-07-23 10:00:00',
              gmv: { amount: String(100 + page), currency: 'MYR' },
              views: 1000 + page,
            })),
            next_page_token: page < 2 ? String(page + 1) : null,
          },
        };
      },
    }),
    mockModule(fixturesPath, {
      isDemoAuthorization: () => false,
      sellerAffiliateFixture: () => ({}),
    }),
  ];
  delete require.cache[servicePath];
  t.after(() => {
    delete require.cache[servicePath];
    restores.reverse().forEach((restore) => restore());
  });

  const { syncShopVideoCatalog } = require(servicePath);
  const result = await syncShopVideoCatalog({
    id: 1,
    cipher: 'cipher',
    authorization: { id: 2 },
  }, { now: new Date('2026-07-24T06:00:00.000Z') });

  assert.equal(apiCalls, 3);
  assert.equal(catalogRows, 3);
  assert.equal(snapshotRows, 3);
  assert.equal(result.pages, 3);
  assert.equal(result.total, 3);
  assert.equal(result.snapshot_date, '2026-07-24');
});
