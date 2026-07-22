const cron = require('node-cron');
const {
  TikTokShop,
  TikTokShopAuthorization,
  TikTokCreatorPerformanceExport,
} = require('../models');
const { refreshCreatorPerformanceProfiles } = require('../services/tiktokCreatorPerformanceService');

const refreshLatestProfiles = async () => {
  const shops = await TikTokShop.findAll({
    include: [{ model: TikTokShopAuthorization, as: 'authorization' }],
    order: [['id', 'ASC']],
  });
  for (const shop of shops) {
    const exportRecord = await TikTokCreatorPerformanceExport.findOne({
      where: { shop_id: shop.id, module_type: 'CREATOR', status: 'SUCCEEDED' },
      order: [['completed_at', 'DESC'], ['created_at', 'DESC']],
    });
    if (!exportRecord) continue;
    // Do not await the full refresh: it deliberately remains alive while issuing
    // one request every two minutes. Repeated ticks reuse the active per-shop promise.
    refreshCreatorPerformanceProfiles(shop, exportRecord).catch((error) => {
      console.error('[Creator Profile Refresh Scheduler] Shop failed', {
        shopId: shop.id,
        exportId: exportRecord.id,
        message: error.message,
      });
    });
  }
};

const startCreatorProfileRefreshJob = () => {
  const enabled = String(process.env.TIKTOK_CREATOR_PROFILE_JOB_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.info('[Creator Profile Refresh Scheduler] Background job disabled');
    return null;
  }
  const run = () => refreshLatestProfiles().catch((error) => {
    console.error('[Creator Profile Refresh Scheduler] Unexpected failure', { message: error.message });
  });
  // Even minutes are reserved for Creator Performance profiles.
  const task = cron.schedule('0 */2 * * * *', run, {
    name: 'creator-profile-two-minute-refresh',
    noOverlap: true,
  });
  console.info('[Creator Profile Refresh Scheduler] Started', {
    interval: '2 minutes',
    minuteOffset: 0,
  });
  return task;
};

module.exports = { startCreatorProfileRefreshJob, refreshLatestProfiles };
