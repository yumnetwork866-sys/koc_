const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/services/tiktokVideoPerformanceService');

test('TikTok Analytics list and detail responses are normalized into a video snapshot', () => {
  const row = __test.apiVideoRow({
    exportId: 7,
    shopId: 3,
    syncedAt: new Date('2026-08-05T01:00:00.000Z'),
    video: {
      id: '7616717880972856597',
      title: 'Demo video',
      username: 'demo.creator',
      creator: { user_name: 'demo.creator', nick_name: 'Demo Creator' },
      video_post_time: '2026-08-01 12:00:00',
      gmv: { amount: '120', currency: 'MYR' },
      gpm: { amount: '20', currency: 'MYR' },
      avg_customers: 2,
      sku_orders: 3,
      items_sold: 4,
      views: 1000,
      click_through_rate: '0.15',
      products: [{ id: 'product-1' }],
    },
    detail: {
      data: {
        performance: {
          intervals: [{
            sales: {
              overall: {
                gmv: { amount: '180', currency: 'MYR' },
                customers: 6,
                items_sold: 7,
                product_impressions: 800,
                product_clicks: 150,
              },
              breakdowns: [{ product_id: 'product-1' }, { product_id: 'product-2' }],
            },
            traffic: { views: 1000, likes: 30, comments: 5, shares: 2 },
          }],
        },
      },
    },
  });

  assert.equal(row.video_title, 'Demo video');
  assert.equal(row.video_id, '7616717880972856597');
  assert.equal(row.video_link, 'https://www.tiktok.com/@demo.creator/video/7616717880972856597');
  assert.equal(row.creator_name, 'Demo Creator');
  assert.equal(row.product_id, 'product-1, product-2');
  assert.equal(row.creator_attributed_gmv, 180);
  assert.equal(row.attributed_orders, 6);
  assert.equal(row.aov, 30);
  assert.equal(row.attributed_items_sold, 7);
  assert.equal(row.refunds, 0);
  assert.equal(row.items_refunded, 0);
  assert.equal(row.likes, 30);
  assert.equal(row.comments, 5);
  assert.equal(row.shares, 2);
  assert.equal(row.product_impressions, 800);
  assert.equal(row.product_clicks, 150);
  assert.equal(row.raw_metrics.source, 'TIKTOK_SHOP_ANALYTICS_API');
});

test('video detail mapper respects its concurrency limit and keeps result order', async () => {
  let active = 0;
  let maximumActive = 0;
  const values = await __test.mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(values, [10, 20, 30, 40, 50]);
  assert.equal(maximumActive, 2);
});
