import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAffiliateOrderProductIds,
  getAffiliateOrderProgramIds,
  getCreatorVideoEngagementRate,
  normalizeEngagementPercentage,
} from '../src/lib/sellerAffiliate.js';

test('affiliate order fields are collected from every SKU and deduplicated', () => {
  const order = {
    skus: [
      { product_id: 'product-1', open_collaboration_id: 'open-1', target_collaboration_id: '' },
      { product_id: 'product-2', open_collaboration_id: '', target_collaboration_id: 'target-1' },
      { product_id: 'product-1', open_collaboration_id: 'open-1' },
    ],
  };

  assert.deepEqual(getAffiliateOrderProductIds(order), ['product-1', 'product-2']);
  assert.deepEqual(getAffiliateOrderProgramIds(order), ['open-1', 'target-1']);
});

test('affiliate order fields retain support for legacy top-level values', () => {
  const order = {
    product_id: 'legacy-product',
    program_id: 'legacy-program',
  };

  assert.deepEqual(getAffiliateOrderProductIds(order), ['legacy-product']);
  assert.deepEqual(getAffiliateOrderProgramIds(order), ['legacy-program']);
  assert.deepEqual(getAffiliateOrderProductIds(), []);
  assert.deepEqual(getAffiliateOrderProgramIds(), []);
});

test('engagement percentage normalization uses explicit units instead of magnitude guessing', () => {
  assert.equal(normalizeEngagementPercentage(0.4), 0.4);
  assert.equal(normalizeEngagementPercentage('0.4%'), 0.4);
  assert.equal(normalizeEngagementPercentage({ percentage: 4.8 }), 4.8);
  assert.equal(normalizeEngagementPercentage({ ratio: 0.048 }), 4.8);
  assert.equal(normalizeEngagementPercentage({ value: 480, unit: 'BPS' }), 4.8);
  assert.equal(normalizeEngagementPercentage(null), null);
});

test('creator video engagement is calculated from matching 30-day average counts', () => {
  const creator = {
    avg_ec_video_play_count: 18000,
    avg_ec_video_like_count: 920,
    avg_ec_video_comment_count: 74,
    avg_ec_video_share_count: 51,
    engagement_rate: 99,
  };

  assert.equal(getCreatorVideoEngagementRate(creator), (920 + 74 + 51) / 18000 * 100);
});

test('creator video engagement supports nested interaction counts and direct percentage fallback', () => {
  assert.equal(getCreatorVideoEngagementRate({
    content_performance: {
      avg_video_views: 2500,
      avg_video_interaction_count: 125,
    },
  }), 5);
  assert.equal(getCreatorVideoEngagementRate({ video_engagement_rate: 0.4 }), 0.4);
  assert.equal(getCreatorVideoEngagementRate({}), null);
});
