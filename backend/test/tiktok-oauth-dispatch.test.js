const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

test('the shared TikTok Partner callback dispatches Seller state to the Shop handler', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const partnerServicePath = require.resolve('../src/services/tiktokPartnerService');
  const shopControllerPath = require.resolve('../src/controllers/tiktokShopController');
  const bookingControllerPath = require.resolve('../src/controllers/bookingController');
  let shopHandlerCalls = 0;

  const restores = [
    mockModule(modelsPath, {}),
    mockModule(partnerServicePath, {
      parseAuthorizationState: () => ({ oauthType: 'shop', returnPath: '/manage/shop-analytics' }),
    }),
    mockModule(shopControllerPath, {
      handleShopOauthCallback: async (_req, res) => {
        shopHandlerCalls += 1;
        return res.redirect('/manage/shop-analytics');
      },
    }),
  ];
  delete require.cache[bookingControllerPath];
  t.after(() => {
    delete require.cache[bookingControllerPath];
    restores.reverse().forEach((restore) => restore());
  });

  const { handleTikTokPartnerOauthCallback } = require(bookingControllerPath);
  let redirectedTo = null;
  await handleTikTokPartnerOauthCallback(
    { query: { code: 'seller-code', state: 'signed-shop-state' } },
    { redirect: (url) => { redirectedTo = url; return url; } },
  );

  assert.equal(shopHandlerCalls, 1);
  assert.equal(redirectedTo, '/manage/shop-analytics');
});
