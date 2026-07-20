const {
  TikTokShopAnalyticsSnapshot,
} = require('../models');
const { getShopPerformance } = require('./tiktokShopService');
const { shiftEndDay, yesterdayEndDay } = require('./tiktokCreatorPerformanceService');

const isoDay = (endDay) => {
  const value = String(endDay);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};

const scheduledAnalyticsRange = (shop, now = new Date()) => {
  const endDay = shiftEndDay(yesterdayEndDay(shop.region, now), 1);
  return {
    startDate: isoDay(shiftEndDay(endDay, -30)),
    endDate: isoDay(endDay),
  };
};

const syncShopAnalyticsSnapshot = async (shop, {
  startDate,
  endDate,
  currency = 'LOCAL',
} = {}) => {
  const grantedScopes = Array.isArray(shop.authorization?.granted_scopes)
    ? shop.authorization.granted_scopes
    : [];
  if (!grantedScopes.includes('data.shop_analytics.public.read')) {
    throw new Error('Reconnect TikTok Shop and grant data.shop_analytics.public.read.');
  }
  const payload = await getShopPerformance({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    startDate,
    endDate,
    currency,
  });
  const performance = payload.data?.performance;
  if (!performance || !Array.isArray(performance.intervals)) {
    throw new Error('TikTok Shop returned an invalid Shop Analytics response.');
  }
  await TikTokShopAnalyticsSnapshot.upsert({
    shop_id: shop.id,
    start_date: startDate,
    end_date: endDate,
    currency,
    metrics: performance,
    latest_available_date: payload.data?.latest_available_date || null,
    request_id: payload.request_id || null,
    synced_at: new Date(),
  });
  await shop.update({ last_synced_at: new Date(), last_sync_status: 'success', last_sync_error: null });
  await shop.authorization.update({ last_sync_status: 'success', last_sync_error: null, updated_at: new Date() });
  return { startDate, endDate, intervals: performance.intervals.length };
};

module.exports = { scheduledAnalyticsRange, syncShopAnalyticsSnapshot };
