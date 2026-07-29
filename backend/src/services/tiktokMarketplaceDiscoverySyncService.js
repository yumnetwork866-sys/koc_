const { Op } = require('sequelize');
const {
  TikTokMarketplaceCreator,
  TikTokMarketplaceDiscoveryState,
  TikTokMarketplaceDiscoveryRun,
} = require('../models');
const {
  searchMarketplaceCreators,
  SELLER_CREATOR_MARKETPLACE_SCOPE,
} = require('./tiktokShopService');
const {
  loadMarketplaceCooldown,
  marketplaceRateLimitCooldownMs,
  persistMarketplaceCooldown,
} = require('./tiktokMarketplaceCooldownService');
const { createMarketplaceRequestGate } = require('./tiktokMarketplaceRequestGate');
const { isCreatorProfileRefreshActive } = require('./tiktokMarketplaceWorkCoordinator');
const { marketplaceCreatorDetailService } = require('./tiktokMarketplaceCreatorDetailService');
const { marketplaceSearchQueueService } = require('./tiktokMarketplaceSearchQueueService');
const { saveCreatorProfiles } = require('./tiktokCreatorProfileService');
const {
  MARKETPLACE_DISCOVERY_SEGMENTS,
  marketplaceDiscoverySegment,
} = require('./tiktokMarketplaceDiscoverySegments');

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DEFAULT_REFRESH_INTERVAL_MS = Math.max(
  6 * 60 * MINUTE_MS,
  Number(process.env.TIKTOK_MARKETPLACE_DISCOVERY_REFRESH_MS) || DAY_MS,
);
const DEFAULT_AUTO_DETAIL_ENABLED = String(
  process.env.TIKTOK_MARKETPLACE_AUTO_DETAIL_ENABLED ?? 'false',
).toLowerCase() === 'true';
const runBackgroundMarketplaceRequest = createMarketplaceRequestGate({ minIntervalMs: MINUTE_MS });
const scheduledMinuteValue = (date) => new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);

const createMarketplaceDiscoverySyncService = ({
  CreatorModel = TikTokMarketplaceCreator,
  StateModel = TikTokMarketplaceDiscoveryState,
  RunModel = TikTokMarketplaceDiscoveryRun,
  searchMarketplace = searchMarketplaceCreators,
  runRequest = runBackgroundMarketplaceRequest,
  loadCooldown = loadMarketplaceCooldown,
  persistCooldown = persistMarketplaceCooldown,
  profileRefreshActive = isCreatorProfileRefreshActive,
  queueCreatorDetails = (shop, creators) => marketplaceCreatorDetailService.enrichAndQueue(shop, creators),
  cacheCreatorProfiles = (shopId, creators, options) => (
    saveCreatorProfiles(shopId, creators, 'marketplace_discovery', options)
  ),
  autoDetailEnabled = DEFAULT_AUTO_DETAIL_ENABLED,
  searchQueue = marketplaceSearchQueueService,
  discoverySegments = MARKETPLACE_DISCOVERY_SEGMENTS,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  rateLimitCooldownMs = marketplaceRateLimitCooldownMs,
  now = () => new Date(),
  logger = console,
} = {}) => {
  const claimRun = async (shop, scheduledMinute) => {
    const [run, created] = await RunModel.findOrCreate({
      where: { shop_id: shop.id, scheduled_minute: scheduledMinute },
      defaults: { status: 'PROCESSING', creator_count: 0, started_at: now() },
    });
    return created ? run : null;
  };

  const syncShop = async (shop, scheduledMinute = scheduledMinuteValue(now())) => {
    const run = await claimRun(shop, scheduledMinute);
    if (!run) return { skipped: true, reason: 'already_claimed' };
    const scopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
    if (!scopes.includes(SELLER_CREATOR_MARKETPLACE_SCOPE)) {
      await run.update({ status: 'SKIPPED', completed_at: now(), error: 'Missing Creator Marketplace scope.' });
      return { skipped: true, reason: 'missing_scope' };
    }

    const cooldownUntil = await loadCooldown(shop.id).catch(() => 0);
    if (cooldownUntil > now().getTime()) {
      await run.update({ status: 'SKIPPED', completed_at: now(), error: 'Creator Discovery is cooling down.' });
      return { skipped: true, reason: 'cooldown' };
    }

    const state = await StateModel.findByPk(shop.id);
    const pendingSearch = await searchQueue.nextPendingSearch(shop.id);
    const pendingKeyword = pendingSearch?.payload?.keyword || '';
    const currentTime = now();
    const refreshDue = !state?.next_refresh_at
      || new Date(state.next_refresh_at).getTime() <= currentTime.getTime();
    if (!pendingKeyword && state?.crawl_status === 'COMPLETED' && !refreshDue) {
      await run.update({
        status: 'SKIPPED',
        completed_at: currentTime,
        error: `Discovery crawl complete until ${new Date(state.next_refresh_at).toISOString()}.`,
      });
      return {
        skipped: true,
        reason: 'crawl_complete',
        next_refresh_at: state.next_refresh_at,
      };
    }

    const restartingCrawl = !pendingKeyword && state?.crawl_status === 'COMPLETED' && refreshDue;
    const segmentIndex = restartingCrawl ? 0 : Math.max(0, Number(state?.segment_index) || 0);
    const segment = discoverySegments[segmentIndex] || marketplaceDiscoverySegment(segmentIndex);
    const requestedAt = now();
    await StateModel.upsert({
      shop_id: shop.id,
      next_page_token: restartingCrawl ? null : (state?.next_page_token || null),
      search_key: restartingCrawl ? null : (state?.search_key || null),
      segment_index: segmentIndex,
      crawl_status: pendingKeyword ? (state?.crawl_status || 'ACTIVE') : 'ACTIVE',
      completed_at: restartingCrawl ? null : (state?.completed_at || null),
      next_refresh_at: restartingCrawl ? null : (state?.next_refresh_at || null),
      consecutive_rate_limits: Number(state?.consecutive_rate_limits) || 0,
      last_requested_at: requestedAt,
      last_succeeded_at: state?.last_succeeded_at || null,
      last_status: 'PROCESSING',
      last_error: null,
      updated_at: requestedAt,
    });

    try {
      const requestContext = {
        shopId: shop.id,
        requestType: pendingKeyword ? 'keyword' : 'background',
        segmentIndex: pendingKeyword ? null : segmentIndex,
        segmentKey: pendingKeyword ? null : segment.key,
        keyword: pendingKeyword || null,
        hasPageToken: !pendingKeyword && !restartingCrawl && Boolean(state?.next_page_token),
        hasSearchKey: !pendingKeyword && !restartingCrawl && Boolean(state?.search_key),
      };
      logger?.info?.('[Marketplace Discovery] Request started', requestContext);
      const payload = await runRequest(shop.id, () => searchMarketplace({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        pageToken: pendingKeyword || restartingCrawl ? null : (state?.next_page_token || null),
        pageSize: 20,
        keyword: pendingKeyword || null,
        searchKey: pendingKeyword || restartingCrawl ? null : (state?.search_key || null),
        filters: pendingKeyword ? {} : segment.filters,
      }));
      const creators = Array.isArray(payload.data?.creators) ? payload.data.creators : [];
      const seenAt = now();
      const rows = creators
        .filter((creator) => String(creator?.creator_open_id || '').trim())
        .map((creator) => ({
          shop_id: shop.id,
          creator_open_id: String(creator.creator_open_id),
          username: creator.username || null,
          nickname: creator.nickname || null,
          profile: creator,
          first_seen_at: seenAt,
          last_seen_at: seenAt,
          updated_at: seenAt,
        }));
      let newCreatorCount = 0;
      if (rows.length) {
        const creatorIds = rows.map((row) => row.creator_open_id);
        const existingCreators = typeof CreatorModel.findAll === 'function'
          ? await CreatorModel.findAll({
            attributes: ['creator_open_id'],
            where: { shop_id: shop.id, creator_open_id: { [Op.in]: creatorIds } },
            raw: true,
          })
          : [];
        const existingIds = new Set(existingCreators.map((creator) => String(creator.creator_open_id)));
        const newProfiles = rows
          .filter((row) => !existingIds.has(row.creator_open_id))
          .map((row) => row.profile);
        newCreatorCount = newProfiles.length;
        await CreatorModel.bulkCreate(rows, {
          updateOnDuplicate: ['username', 'nickname', 'profile', 'last_seen_at', 'updated_at'],
        });
        await cacheCreatorProfiles(shop.id, rows.map((row) => row.profile), { logger }).catch((error) => {
          logger.warn('[Marketplace Discovery] Could not update shared creator profile cache', {
            shopId: shop.id,
            message: error.message,
          });
        });
        // Detail enrichment also consumes Marketplace quota. Defer it while the
        // Performance profile worker is active so even/odd minute alternation is
        // not disrupted by a third request stream.
        if (autoDetailEnabled && newProfiles.length && !profileRefreshActive(shop.id)) {
          await queueCreatorDetails(shop, newProfiles).catch((error) => {
            logger.warn('[Marketplace Discovery] Could not queue creator details', {
              shopId: shop.id,
              message: error.message,
            });
          });
        }
      }
      if (pendingSearch) await searchQueue.completeSearch(pendingSearch, rows.length);
      const responseNextPageToken = payload.data?.next_page_token || null;
      const segmentComplete = !pendingKeyword && !responseNextPageToken;
      const nextSegmentIndex = segmentComplete ? segmentIndex + 1 : segmentIndex;
      const crawlComplete = segmentComplete && nextSegmentIndex >= discoverySegments.length;
      const completedAt = crawlComplete ? seenAt : null;
      const nextRefreshAt = crawlComplete
        ? new Date(seenAt.getTime() + refreshIntervalMs)
        : null;
      const nextPageToken = pendingKeyword
        ? (state?.next_page_token || null)
        : responseNextPageToken;
      await StateModel.upsert({
        shop_id: shop.id,
        next_page_token: nextPageToken,
        search_key: pendingKeyword
          ? (state?.search_key || null)
          : (nextPageToken ? (payload.data?.search_key || state?.search_key || null) : null),
        segment_index: pendingKeyword
          ? segmentIndex
          : Math.min(nextSegmentIndex, discoverySegments.length - 1),
        crawl_status: pendingKeyword
          ? (state?.crawl_status || 'ACTIVE')
          : (crawlComplete ? 'COMPLETED' : 'ACTIVE'),
        completed_at: pendingKeyword ? (state?.completed_at || null) : completedAt,
        next_refresh_at: pendingKeyword ? (state?.next_refresh_at || null) : nextRefreshAt,
        consecutive_rate_limits: 0,
        last_requested_at: requestedAt,
        last_succeeded_at: seenAt,
        last_status: 'SUCCEEDED',
        last_error: null,
        updated_at: seenAt,
      });
      await run.update({
        status: 'SUCCEEDED',
        creator_count: rows.length,
        error: null,
        completed_at: seenAt,
      });
      logger?.info?.('[Marketplace Discovery] Request completed', {
        ...requestContext,
        requestId: payload.request_id || null,
        returnedCreators: creators.length,
        validCreators: rows.length,
        newCreators: newCreatorCount,
        duplicateCreators: Math.max(0, rows.length - newCreatorCount),
        hasNextPage: Boolean(responseNextPageToken),
        segmentComplete,
        nextSegmentIndex: pendingKeyword || crawlComplete ? null : nextSegmentIndex,
        crawlComplete,
      });
      return {
        skipped: false,
        creator_count: rows.length,
        has_next_page: Boolean(responseNextPageToken),
        segment_key: pendingKeyword ? null : segment.key,
        has_more_segments: !pendingKeyword && !crawlComplete
          && (Boolean(responseNextPageToken) || nextSegmentIndex < discoverySegments.length),
        crawl_complete: crawlComplete,
      };
    } catch (error) {
      const failedAt = now();
      if (pendingSearch) await searchQueue.retrySearch(pendingSearch, error).catch(() => {});
      const rateLimited = Number(error.tiktokCode) === 36009002;
      const dailyQuotaReached = Number(error.tiktokCode) === 45101004;
      const consecutiveRateLimits = rateLimited
        ? (Number(state?.consecutive_rate_limits) || 0) + 1
        : (Number(state?.consecutive_rate_limits) || 0);
      if (rateLimited || dailyQuotaReached) {
        await persistCooldown({
          shopId: shop.id,
          cooldownUntil: failedAt.getTime() + (
            dailyQuotaReached ? DAY_MS : rateLimitCooldownMs(consecutiveRateLimits)
          ),
          reason: error.message,
        }).catch(() => {});
      }
      const message = String(error.message || error).slice(0, 2000);
      await StateModel.upsert({
        shop_id: shop.id,
        next_page_token: restartingCrawl ? null : (state?.next_page_token || null),
        search_key: restartingCrawl ? null : (state?.search_key || null),
        segment_index: segmentIndex,
        crawl_status: pendingKeyword ? (state?.crawl_status || 'ACTIVE') : 'ACTIVE',
        completed_at: restartingCrawl ? null : (state?.completed_at || null),
        next_refresh_at: restartingCrawl ? null : (state?.next_refresh_at || null),
        consecutive_rate_limits: consecutiveRateLimits,
        last_requested_at: requestedAt,
        last_succeeded_at: state?.last_succeeded_at || null,
        last_status: 'FAILED',
        last_error: message,
        updated_at: failedAt,
      });
      await run.update({ status: 'FAILED', error: message, completed_at: failedAt });
      logger.warn('[Marketplace Discovery] Shop sync failed', {
        shopId: shop.id,
        requestType: pendingKeyword ? 'keyword' : 'background',
        segmentIndex: pendingKeyword ? null : segmentIndex,
        segmentKey: pendingKeyword ? null : segment.key,
        keyword: pendingKeyword || null,
        hasPageToken: !pendingKeyword && !restartingCrawl && Boolean(state?.next_page_token),
        hasSearchKey: !pendingKeyword && !restartingCrawl && Boolean(state?.search_key),
        tiktokCode: Number(error.tiktokCode) || null,
        requestId: error.requestId || error.request_id || null,
        consecutiveRateLimits,
        message,
      });
      return { skipped: false, failed: true, error: message };
    }
  };

  return { syncShop, claimRun };
};

const marketplaceDiscoverySyncService = createMarketplaceDiscoverySyncService();

module.exports = {
  DEFAULT_REFRESH_INTERVAL_MS,
  MARKETPLACE_DISCOVERY_SEGMENTS,
  createMarketplaceDiscoverySyncService,
  marketplaceDiscoverySyncService,
  scheduledMinuteValue,
};
