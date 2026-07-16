const assert = require('node:assert/strict');
const test = require('node:test');

const {
  creatorOverviewFixture,
  isDemoAuthorization,
  sellerAffiliateFixture,
} = require('../src/lib/tiktokDemoFixtures');

test('TikTok demo fixtures only activate for demo authorizations', () => {
  assert.equal(isDemoAuthorization({ open_id: 'demo_full_seller_open' }), true);
  assert.equal(isDemoAuthorization({ open_id: 'real-seller-open-id' }), false);
});

test('TikTok demo fixtures provide Seller Affiliate and Creator data', () => {
  const authorization = {
    open_id: 'demo_full_creator_open_1',
    username: 'demo.creator',
    showcase_count: 12,
  };
  const seller = sellerAffiliateFixture('open-collaborations', { name: 'Demo Shop' });
  const creator = creatorOverviewFixture(authorization);
  assert.equal(seller.data.open_collaborations.length, 8);
  assert.equal(creator.profile.username, 'demo.creator');
  assert.equal(creator.showcase.products.length, 8);
  assert.equal(creator.errors.profile, null);
});
