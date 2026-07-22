const { Op } = require('sequelize');
const { TikTokMarketplaceCreatorDetail } = require('../models');
const { getMarketplaceCreatorPerformance } = require('./tiktokShopService');
const {
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  loadMarketplaceCooldown,
  persistMarketplaceCooldown,
} = require('./tiktokMarketplaceCooldownService');
const { runMarketplaceDiscoveryRequest } = require('./tiktokMarketplaceRequestGate');

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const configuredTtlMs = Number(process.env.TIKTOK_MARKETPLACE_DETAIL_TTL_MS || 12 * HOUR_MS);
const DEFAULT_TTL_MS = Math.min(24 * HOUR_MS, Math.max(6 * HOUR_MS, configuredTtlMs || 12 * HOUR_MS));
const DEFAULT_INTERVAL_MS = Math.max(
  MINUTE_MS,
  Number(process.env.TIKTOK_MARKETPLACE_DETAIL_INTERVAL_MS) || MINUTE_MS,
);
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = Math.max(
  60 * 1000,
  Number(process.env.TIKTOK_MARKETPLACE_DETAIL_RATE_LIMIT_COOLDOWN_MS) || DEFAULT_MARKETPLACE_COOLDOWN_MS,
);

const plainSnapshot = (snapshot) => typeof snapshot?.toJSON === 'function' ? snapshot.toJSON() : snapshot;

const firstMetric = (detail, names) => names
  .map((name) => detail?.[name])
  .find((value) => value !== undefined && value !== null && value !== '');

const normalizeMarketplaceCreatorDetail = (detail) => {
  if (!detail || typeof detail !== 'object') return detail;
  const unitsSold = firstMetric(detail, ['units_sold', 'items_sold']);
  const avgVideoViews = firstMetric(detail, [
    'avg_video_views',
    'avg_ec_video_play_count',
    'avg_ec_video_view_count',
  ]);
  const videoEngagementRate = firstMetric(detail, [
    'video_engagement_rate',
    'ec_video_engagement_rate',
    'avg_ec_video_engagement_rate',
  ]);
  return {
    ...detail,
    ...(unitsSold !== undefined ? { units_sold: unitsSold } : {}),
    ...(avgVideoViews !== undefined ? { avg_video_views: avgVideoViews } : {}),
    ...(videoEngagementRate !== undefined ? { video_engagement_rate: videoEngagementRate } : {}),
  };
};

const createMarketplaceCreatorDetailService = ({
  DetailModel = TikTokMarketplaceCreatorDetail,
  fetchDetail = getMarketplaceCreatorPerformance,
  ttlMs = DEFAULT_TTL_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  rateLimitCooldownMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  schedule = (operation, delayMs = 0) => (delayMs > 0
    ? setTimeout(operation, delayMs)
    : setImmediate(operation)),
  loadCooldown = loadMarketplaceCooldown,
  persistCooldown = persistMarketplaceCooldown,
  runRequest = runMarketplaceDiscoveryRequest,
  logger = console,
} = {}) => {
  const shops = new Map();

  const stateFor = (shopId) => {
    const key = String(shopId);
    if (!shops.has(key)) {
      shops.set(key, {
        queue: [],
        queuedIds: new Set(),
        running: false,
        retryScheduled: false,
        nextRequestAt: 0,
        cooldownUntil: 0,
      });
    }
    return shops.get(key);
  };

  const drain = async (shop, state) => {
    if (state.running) return;
    state.running = true;
    const scheduleRetry = (cooldownUntil) => {
      if (state.retryScheduled) return;
      state.retryScheduled = true;
      schedule(() => {
        state.retryScheduled = false;
        void drain(shop, state);
      }, Math.max(0, cooldownUntil - now()));
    };
    try {
      while (state.queue.length) {
        const persistedCooldownUntil = await loadCooldown(shop.id).catch(() => 0);
        if (persistedCooldownUntil > now()) {
          state.cooldownUntil = persistedCooldownUntil;
          scheduleRetry(persistedCooldownUntil);
          break;
        }
        const waitUntil = Math.max(state.nextRequestAt, state.cooldownUntil);
        if (waitUntil > now()) await sleep(waitUntil - now());
        const job = state.queue.shift();
        let retryJob = false;
        state.nextRequestAt = now() + intervalMs;
        try {
          const payload = await runRequest(shop.id, () => fetchDetail({
            authorization: shop.authorization,
            shopCipher: shop.cipher,
            creatorId: job.creator_open_id,
          }));
          const detail = normalizeMarketplaceCreatorDetail(payload?.data?.creator);
          if (detail) {
            const fetchedAt = new Date(now());
            await DetailModel.upsert({
              shop_id: shop.id,
              creator_open_id: job.creator_open_id,
              username: detail.username || job.username || null,
              detail,
              fetched_at: fetchedAt,
              updated_at: fetchedAt,
            });
          }
        } catch (error) {
          if (Number(error?.tiktokCode) === 36009002) {
            state.cooldownUntil = now() + rateLimitCooldownMs;
            await persistCooldown({
              shopId: shop.id,
              cooldownUntil: state.cooldownUntil,
              reason: error.message,
            }).catch((persistError) => {
              logger.warn('[Marketplace Creator Detail] Could not persist cooldown', {
                shopId: shop.id,
                message: persistError.message,
              });
            });
            logger.warn('[Marketplace Creator Detail] Shop rate-limited', {
              shopId: shop.id,
              creatorId: job.creator_open_id,
              cooldownUntil: new Date(state.cooldownUntil).toISOString(),
            });
            retryJob = true;
            state.queue.unshift(job);
            scheduleRetry(state.cooldownUntil);
            break;
          } else {
            logger.warn('[Marketplace Creator Detail] Refresh failed', {
              shopId: shop.id,
              creatorId: job.creator_open_id,
              message: error.message,
            });
          }
        } finally {
          if (!retryJob) state.queuedIds.delete(job.creator_open_id);
        }
      }
    } finally {
      state.running = false;
      if (state.queue.length && !state.retryScheduled) schedule(() => drain(shop, state));
    }
  };

  const enqueue = (shop, creators) => {
    const state = stateFor(shop.id);
    for (const creator of creators) {
      const creatorId = String(creator?.creator_open_id || '').trim();
      if (!creatorId || state.queuedIds.has(creatorId)) continue;
      state.queuedIds.add(creatorId);
      state.queue.push({ creator_open_id: creatorId, username: creator.username || null });
    }
    if (state.queue.length && !state.running) schedule(() => drain(shop, state));
    return state.queue.length + (state.running ? 1 : 0);
  };

  const enrichAndQueue = async (shop, creators = []) => {
    const creatorIds = [...new Set(creators.map((creator) => String(creator?.creator_open_id || '').trim()).filter(Boolean))];
    if (!creatorIds.length) {
      return { creators, detail_refresh: { pending: false, pending_count: 0, poll_after_ms: 0 } };
    }
    const snapshots = await DetailModel.findAll({
      where: { shop_id: shop.id, creator_open_id: { [Op.in]: creatorIds } },
    });
    const snapshotById = new Map(snapshots.map((snapshot) => {
      const value = plainSnapshot(snapshot);
      return [String(value.creator_open_id), value];
    }));
    const staleBefore = now() - ttlMs;
    const needsRefresh = creators.filter((creator) => {
      const snapshot = snapshotById.get(String(creator.creator_open_id));
      return !snapshot || new Date(snapshot.fetched_at).getTime() < staleBefore;
    });
    const cooldownUntil = await loadCooldown(shop.id).catch(() => 0);
    const coolingDown = cooldownUntil > now();
    if (!coolingDown) enqueue(shop, needsRefresh);
    return {
      creators: creators.map((creator) => {
        const snapshot = snapshotById.get(String(creator.creator_open_id));
        if (!snapshot?.detail) return creator;
        return {
          ...creator,
          ...snapshot.detail,
          marketplace_detail_fetched_at: snapshot.fetched_at,
        };
      }),
      detail_refresh: {
        pending: !coolingDown && needsRefresh.length > 0,
        pending_count: coolingDown ? 0 : needsRefresh.length,
        poll_after_ms: !coolingDown && needsRefresh.length ? 2000 : 0,
        ...(coolingDown ? {
          cooling_down: true,
          retry_after_ms: Math.max(0, cooldownUntil - now()),
        } : {}),
      },
    };
  };

  return { enrichAndQueue, enqueue, drain, stateFor };
};

const marketplaceCreatorDetailService = createMarketplaceCreatorDetailService();

module.exports = {
  createMarketplaceCreatorDetailService,
  marketplaceCreatorDetailService,
  normalizeMarketplaceCreatorDetail,
  DEFAULT_TTL_MS,
  DEFAULT_INTERVAL_MS,
};
