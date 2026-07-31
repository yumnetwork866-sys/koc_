const {
  TikTokShop,
  TikTokShopAuthorization,
} = require('../models');
const { getShopVideoPerformance } = require('./tiktokShopService');
const { createTtlPromiseCache } = require('../lib/ttlPromiseCache');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');

const revenueCacheTtlValue = Number(process.env.CHANNEL_REPORT_REVENUE_CACHE_TTL_MS ?? 120000);
const revenueCacheTtlMs = revenueCacheTtlValue === 0
  ? 0
  : Math.min(300000, Math.max(60000, revenueCacheTtlValue || 120000));
const revenueCache = createTtlPromiseCache({ ttlMs: revenueCacheTtlMs, maxEntries: 200 });

const videoId = (video) => String(video?.id || video?.video_id || '').trim();
const videoRevenue = (video) => {
  const raw = video?.gmv?.amount ?? video?.gmv;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
};

const loadShopRevenue = async (shop, { startDate, endDate }) => {
  const options = {
    startDate,
    endDate,
    currency: 'LOCAL',
    sortField: 'gmv',
    sortOrder: 'DESC',
    pageSize: 100,
  };
  if (isDemoAuthorization(shop.authorization)) {
    return sellerAffiliateFixture('shop-video-performance', shop, {
      ...options,
      account_type: 'LINKED_ACCOUNTS',
    }).data?.videos || [];
  }
  const request = (accountType) => getShopVideoPerformance({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    ...options,
    accountType,
  });
  const [officialPayload, marketingPayload] = await Promise.all([
    request('OFFICIAL_ACCOUNTS'),
    request('MARKETING_ACCOUNTS'),
  ]);
  const videos = new Map();
  [
    ...(officialPayload.data?.videos || []),
    ...(marketingPayload.data?.videos || []),
  ].forEach((video) => {
    const id = videoId(video);
    if (id) videos.set(id, video);
  });
  return [...videos.values()];
};

const cacheKey = (shop, startDate, endDate) => JSON.stringify([
  shop.id,
  shop.authorization_id,
  shop.authorization?.updated_at
    ? new Date(shop.authorization.updated_at).getTime()
    : 0,
  startDate,
  endDate,
]);

const loadMonthlyShopVideoRevenue = async ({ startDate, endDate }) => {
  const shops = await TikTokShop.findAll({
    include: [{ model: TikTokShopAuthorization, as: 'authorization' }],
    order: [['id', 'ASC']],
  });
  const outcomes = await Promise.allSettled(shops.map(async (shop) => {
    const { value } = await revenueCache.getOrLoad(
      cacheKey(shop, startDate, endDate),
      () => loadShopRevenue(shop, { startDate, endDate }),
    );
    return value;
  }));
  const revenueByVideo = new Map();
  outcomes
    .filter((outcome) => outcome.status === 'fulfilled')
    .flatMap((outcome) => outcome.value)
    .forEach((video) => {
      const id = videoId(video);
      const amount = videoRevenue(video);
      if (!id || amount === null) return;
      const currency = video?.gmv?.currency || video?.sales_currency || 'MYR';
      const current = revenueByVideo.get(id);
      revenueByVideo.set(id, {
        platform_video_id: id,
        revenue: (current?.revenue || 0) + amount,
        currency: current?.currency || currency,
      });
    });
  return {
    rows: [...revenueByVideo.values()],
    errors: outcomes
      .filter((outcome) => outcome.status === 'rejected')
      .map((outcome) => String(outcome.reason?.message || outcome.reason)),
  };
};

module.exports = {
  loadMonthlyShopVideoRevenue,
  __test: { loadShopRevenue, videoId, videoRevenue },
};
