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
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  loadMarketplaceCooldown,
  persistMarketplaceCooldown,
} = require('./tiktokMarketplaceCooldownService');
const { createMarketplaceRequestGate } = require('./tiktokMarketplaceRequestGate');
const { isCreatorProfileRefreshActive } = require('./tiktokMarketplaceWorkCoordinator');
const { marketplaceCreatorDetailService } = require('./tiktokMarketplaceCreatorDetailService');
const { marketplaceSearchQueueService } = require('./tiktokMarketplaceSearchQueueService');

const MINUTE_MS = 60 * 1000;
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
  searchQueue = marketplaceSearchQueueService,
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
    if (profileRefreshActive(shop.id)) {
      return { skipped: true, reason: 'creator_profile_refresh_active' };
    }
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
    const requestedAt = now();
    await StateModel.upsert({
      shop_id: shop.id,
      next_page_token: state?.next_page_token || null,
      search_key: state?.search_key || null,
      last_requested_at: requestedAt,
      last_succeeded_at: state?.last_succeeded_at || null,
      last_status: 'PROCESSING',
      last_error: null,
      updated_at: requestedAt,
    });

    try {
      const payload = await runRequest(shop.id, () => searchMarketplace({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        pageToken: pendingKeyword ? null : (state?.next_page_token || null),
        pageSize: 50,
        keyword: pendingKeyword || null,
        searchKey: pendingKeyword ? null : (state?.search_key || null),
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
      if (rows.length) {
        await CreatorModel.bulkCreate(rows, {
          updateOnDuplicate: ['username', 'nickname', 'profile', 'last_seen_at', 'updated_at'],
        });
        await queueCreatorDetails(shop, rows.map((row) => row.profile)).catch((error) => {
          logger.warn('[Marketplace Discovery] Could not queue creator details', {
            shopId: shop.id,
            message: error.message,
          });
        });
      }
      if (pendingSearch) await searchQueue.completeSearch(pendingSearch, rows.length);
      const nextPageToken = pendingKeyword ? (state?.next_page_token || null) : (payload.data?.next_page_token || null);
      await StateModel.upsert({
        shop_id: shop.id,
        next_page_token: nextPageToken,
        search_key: pendingKeyword
          ? (state?.search_key || null)
          : (nextPageToken ? (payload.data?.search_key || state?.search_key || null) : null),
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
      return { skipped: false, creator_count: rows.length, has_next_page: Boolean(nextPageToken) };
    } catch (error) {
      const failedAt = now();
      if (pendingSearch) await searchQueue.retrySearch(pendingSearch, error).catch(() => {});
      if (Number(error.tiktokCode) === 36009002) {
        await persistCooldown({
          shopId: shop.id,
          cooldownUntil: failedAt.getTime() + DEFAULT_MARKETPLACE_COOLDOWN_MS,
          reason: error.message,
        }).catch(() => {});
      }
      const message = String(error.message || error).slice(0, 2000);
      await StateModel.upsert({
        shop_id: shop.id,
        next_page_token: state?.next_page_token || null,
        search_key: state?.search_key || null,
        last_requested_at: requestedAt,
        last_succeeded_at: state?.last_succeeded_at || null,
        last_status: 'FAILED',
        last_error: message,
        updated_at: failedAt,
      });
      await run.update({ status: 'FAILED', error: message, completed_at: failedAt });
      logger.warn('[Marketplace Discovery] Shop sync failed', { shopId: shop.id, message });
      return { skipped: false, failed: true, error: message };
    }
  };

  return { syncShop, claimRun };
};

const marketplaceDiscoverySyncService = createMarketplaceDiscoverySyncService();

module.exports = {
  createMarketplaceDiscoverySyncService,
  marketplaceDiscoverySyncService,
  scheduledMinuteValue,
};
