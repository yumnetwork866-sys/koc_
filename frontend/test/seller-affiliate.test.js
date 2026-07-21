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

test('engagement percentage normalization handles TikTok basis-point rates and explicit units', () => {
  assert.equal(normalizeEngagementPercentage(581), 5.81);
  assert.equal(normalizeEngagementPercentage(0.4), 0.004);
  assert.equal(normalizeEngagementPercentage('0.4%'), 0.4);
  assert.equal(normalizeEngagementPercentage({ percentage: 4.8 }), 4.8);
  assert.equal(normalizeEngagementPercentage({ ratio: 0.048 }), 4.8);
  assert.equal(normalizeEngagementPercentage({ value: 480, unit: 'BPS' }), 4.8);
  assert.equal(normalizeEngagementPercentage({ value: 4.8, unit: 'PERCENT' }), 4.8);
  assert.equal(normalizeEngagementPercentage({ value: 480 }), 4.8);
  assert.equal(normalizeEngagementPercentage(null), null);
});

test('all-video engagement prefers TikTok provided rate without mixing in EC counts', () => {
  const creator = {
    avg_ec_video_play_count: 10000,
    avg_ec_video_like_count: 60,
    avg_ec_video_comment_count: 8,
    avg_ec_video_share_count: 4,
    ec_video_engagement_rate: 72,
    engagement_rate: 110,
  };

  assert.equal((60 + 8 + 4) / 10000 * 100, 0.72);
  assert.equal(getCreatorVideoEngagementRate(creator), 1.1);
});

test('shoppable-video engagement derives a rate when TikTok does not provide one', () => {
  const creator = {
    avg_ec_video_play_count: 18000,
    avg_ec_video_like_count: 920,
    avg_ec_video_comment_count: 74,
    avg_ec_video_share_count: 51,
  };

  assert.equal(getCreatorVideoEngagementRate(creator), null);
  assert.equal(
    getCreatorVideoEngagementRate(creator, { scope: 'shoppable' }),
    (920 + 74 + 51) / 18000 * 100,
  );
});

test('creator video engagement supports nested interaction counts and direct percentage fallback', () => {
  assert.equal(getCreatorVideoEngagementRate({
    content_performance: {
      avg_video_views: 2500,
      avg_video_interaction_count: 125,
    },
  }), 5);
  assert.equal(getCreatorVideoEngagementRate({ video_engagement_rate: 581 }), 5.81);
  assert.equal(getCreatorVideoEngagementRate({ ec_video_engagement_rate: 72 }), null);
  assert.equal(getCreatorVideoEngagementRate(
    { ec_video_engagement_rate: 72 },
    { scope: 'shoppable' },
  ), 0.72);
  assert.equal(getCreatorVideoEngagementRate({}), null);
});
