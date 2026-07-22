const cron = require('node-cron');
const { TikTokShop, TikTokShopAuthorization } = require('../models');
const { marketplaceDiscoverySyncService } = require('../services/tiktokMarketplaceDiscoverySyncService');

const startMarketplaceCreatorDiscoveryJob = () => {
  const enabled = String(process.env.TIKTOK_MARKETPLACE_DISCOVERY_JOB_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.info('[Marketplace Discovery] Background job disabled');
    return null;
  }
  // Odd minutes alternate with Creator Performance on even minutes.
  const task = cron.schedule('0 1-59/2 * * * *', async () => {
    const shops = await TikTokShop.findAll({
      include: [{ model: TikTokShopAuthorization, as: 'authorization' }],
      order: [['id', 'ASC']],
    });
    for (const shop of shops) {
      await marketplaceDiscoverySyncService.syncShop(shop).catch((error) => {
        console.error('[Marketplace Discovery] Unexpected sync failure', {
          shopId: shop.id,
          message: error.message,
        });
      });
    }
  }, { name: 'marketplace-creator-discovery', noOverlap: true });
  console.info('[Marketplace Discovery] Background job started', {
    interval: '2 minutes',
    minuteOffset: 1,
  });
  return task;
};

module.exports = { startMarketplaceCreatorDiscoveryJob };
