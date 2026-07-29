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
  clearMarketplaceCooldown,
  loadMarketplaceCooldown,
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
const DEFAULT_RECOVERY_SUCCESS_THRESHOLD = Math.max(
  2,
  Number(process.env.TIKTOK_MARKETPLACE_RECOVERY_SUCCESS_THRESHOLD) || 3,
);
const DEFAULT_RATE_LIMIT_RETRY_MS = Math.max(
  60 * 1000,
  Number(process.env.TIKTOK_MARKETPLACE_DISCOVERY_RATE_LIMIT_RETRY_MS) || MINUTE_MS,
);
const DEFAULT_SEGMENT_MAX_PAGES = Math.max(
  1,
  Number(process.env.TIKTOK_MARKETPLACE_DISCOVERY_SEGMENT_MAX_PAGES) || 5,
);
const DEFAULT_DUPLICATE_PAGE_LIMIT = Math.max(
  1,
  Number(process.env.TIKTOK_MARKETPLACE_DISCOVERY_DUPLICATE_PAGE_LIMIT) || 3,
);
const COOLDOWN_BOUNDARY_TOLERANCE_MS = 1000;
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
  clearCooldown = clearMarketplaceCooldown,
  profileRefreshActive = isCreatorProfileRefreshActive,
  queueCreatorDetails = (shop, creators) => marketplaceCreatorDetailService.enrichAndQueue(shop, creators),
  cacheCreatorProfiles = (shopId, creators, options) => (
    saveCreatorProfiles(shopId, creators, 'marketplace_discovery', options)
  ),
  autoDetailEnabled = DEFAULT_AUTO_DETAIL_ENABLED,
  searchQueue = marketplaceSearchQueueService,
  discoverySegments = MARKETPLACE_DISCOVERY_SEGMENTS,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  rateLimitCooldownMs = () => DEFAULT_RATE_LIMIT_RETRY_MS,
  recoverySuccessThreshold = DEFAULT_RECOVERY_SUCCESS_THRESHOLD,
  segmentMaxPages = DEFAULT_SEGMENT_MAX_PAGES,
  duplicatePageLimit = DEFAULT_DUPLICATE_PAGE_LIMIT,
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
    if (!run) {
      logger?.info?.('[Marketplace Discovery] Request skipped', {
        shopId: shop.id,
        reason: 'already_claimed',
      });
      return { skipped: true, reason: 'already_claimed' };
    }
    const scopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
    if (!scopes.includes(SELLER_CREATOR_MARKETPLACE_SCOPE)) {
      await run.update({ status: 'SKIPPED', completed_at: now(), error: 'Missing Creator Marketplace scope.' });
      logger?.info?.('[Marketplace Discovery] Request skipped', {
        shopId: shop.id,
        reason: 'missing_scope',
      });
      return { skipped: true, reason: 'missing_scope' };
    }

    const state = await StateModel.findByPk(shop.id);
    const persistedCooldownUntil = await loadCooldown(shop.id).catch(() => 0);
    const previousRequestAt = state?.last_requested_at
      ? new Date(state.last_requested_at).getTime()
      : 0;
    const previousFailureWasRateLimit = Number(state?.consecutive_rate_limits) > 0
      && /36009002|too many requests/i.test(String(state?.last_error || ''));
    // Older versions persisted exponential cooldowns. In one-minute probe mode,
    // cap those legacy rows at one minute from the failed request.
    const cooldownUntil = previousFailureWasRateLimit && previousRequestAt
      ? Math.min(
        persistedCooldownUntil,
        previousRequestAt + rateLimitCooldownMs(Number(state.consecutive_rate_limits)),
      )
      : persistedCooldownUntil;
    if (cooldownUntil - now().getTime() > COOLDOWN_BOUNDARY_TOLERANCE_MS) {
      const skippedAt = now();
      await run.update({ status: 'SKIPPED', completed_at: skippedAt, error: 'Creator Discovery is cooling down.' });
      logger?.info?.('[Marketplace Discovery] Request skipped', {
        shopId: shop.id,
        reason: 'cooldown',
        cooldownUntil: new Date(cooldownUntil).toISOString(),
        retryAfterMs: Math.max(0, cooldownUntil - skippedAt.getTime()),
        consecutiveRateLimits: Number(state?.consecutive_rate_limits) || 0,
        recoverySuccesses: Number(state?.recovery_successes) || 0,
      });
      return {
        skipped: true,
        reason: 'cooldown',
        cooldown_until: new Date(cooldownUntil),
      };
    }

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
      logger?.info?.('[Marketplace Discovery] Request skipped', {
        shopId: shop.id,
        reason: 'crawl_complete',
        nextRefreshAt: new Date(state.next_refresh_at).toISOString(),
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
      recovery_successes: Number(state?.recovery_successes) || 0,
      segment_page_count: restartingCrawl ? 0 : (Number(state?.segment_page_count) || 0),
      consecutive_duplicate_pages: restartingCrawl
        ? 0
        : (Number(state?.consecutive_duplicate_pages) || 0),
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
      const previousSegmentPageCount = restartingCrawl
        ? 0
        : (Number(state?.segment_page_count) || 0);
      const previousDuplicatePages = restartingCrawl
        ? 0
        : (Number(state?.consecutive_duplicate_pages) || 0);
      const completedSegmentPageCount = previousSegmentPageCount + 1;
      const consecutiveDuplicatePages = newCreatorCount === 0
        ? previousDuplicatePages + 1
        : 0;
      const segmentResultsExhausted = !responseNextPageToken;
      const segmentPageLimitReached = completedSegmentPageCount >= segmentMaxPages;
      const duplicatePageLimitReached = consecutiveDuplicatePages >= duplicatePageLimit;
      const segmentComplete = !pendingKeyword && (
        segmentResultsExhausted
        || segmentPageLimitReached
        || duplicatePageLimitReached
      );
      const segmentStopReason = !segmentComplete
        ? null
        : (
          segmentResultsExhausted
            ? 'results_exhausted'
            : (duplicatePageLimitReached ? 'duplicate_page_limit' : 'page_limit')
        );
      const nextSegmentIndex = segmentComplete ? segmentIndex + 1 : segmentIndex;
      const crawlComplete = segmentComplete && nextSegmentIndex >= discoverySegments.length;
      const completedAt = crawlComplete ? seenAt : null;
      const nextRefreshAt = crawlComplete
        ? new Date(seenAt.getTime() + refreshIntervalMs)
        : null;
      const previousRateLimits = Number(state?.consecutive_rate_limits) || 0;
      const wasRecovering = previousRateLimits > 0;
      const recoverySuccesses = wasRecovering
        ? (Number(state?.recovery_successes) || 0) + 1
        : 0;
      const fullyRecovered = !wasRecovering
        || crawlComplete
        || recoverySuccesses >= recoverySuccessThreshold;
      const nextRateLimitCount = fullyRecovered ? 0 : previousRateLimits;
      const nextRecoverySuccesses = fullyRecovered ? 0 : recoverySuccesses;
      const nextPageToken = pendingKeyword
        ? (state?.next_page_token || null)
        : (segmentComplete ? null : responseNextPageToken);
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
        consecutive_rate_limits: nextRateLimitCount,
        recovery_successes: nextRecoverySuccesses,
        segment_page_count: pendingKeyword
          ? (Number(state?.segment_page_count) || 0)
          : (segmentComplete ? 0 : completedSegmentPageCount),
        consecutive_duplicate_pages: pendingKeyword
          ? (Number(state?.consecutive_duplicate_pages) || 0)
          : (segmentComplete ? 0 : consecutiveDuplicatePages),
        last_requested_at: requestedAt,
        last_succeeded_at: seenAt,
        last_status: 'SUCCEEDED',
        last_error: null,
        updated_at: seenAt,
      });
      if (wasRecovering) {
        if (fullyRecovered) {
          await clearCooldown(shop.id).catch((error) => {
            logger.warn('[Marketplace Discovery] Could not clear recovery cooldown', {
              shopId: shop.id,
              message: error.message,
            });
          });
        }
      }
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
        segmentStopReason,
        segmentPageCount: pendingKeyword ? null : completedSegmentPageCount,
        consecutiveDuplicatePages: pendingKeyword ? null : consecutiveDuplicatePages,
        segmentMaxPages,
        duplicatePageLimit,
        nextSegmentIndex: pendingKeyword || crawlComplete ? null : nextSegmentIndex,
        crawlComplete,
        recoveryMode: wasRecovering && !fullyRecovered,
        recoverySuccesses: nextRecoverySuccesses,
        recoverySuccessThreshold,
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
        const cooldownMs = dailyQuotaReached
          ? DAY_MS
          : rateLimitCooldownMs(consecutiveRateLimits);
        await persistCooldown({
          shopId: shop.id,
          cooldownUntil: failedAt.getTime() + cooldownMs,
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
        recovery_successes: 0,
        segment_page_count: restartingCrawl ? 0 : (Number(state?.segment_page_count) || 0),
        consecutive_duplicate_pages: restartingCrawl
          ? 0
          : (Number(state?.consecutive_duplicate_pages) || 0),
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
        cursorRetained: Boolean(state?.next_page_token || state?.search_key),
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
  DEFAULT_RATE_LIMIT_RETRY_MS,
  DEFAULT_RECOVERY_SUCCESS_THRESHOLD,
  DEFAULT_SEGMENT_MAX_PAGES,
  DEFAULT_DUPLICATE_PAGE_LIMIT,
  MARKETPLACE_DISCOVERY_SEGMENTS,
  createMarketplaceDiscoverySyncService,
  marketplaceDiscoverySyncService,
  scheduledMinuteValue,
};
