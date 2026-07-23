const { TikTokApiCooldown } = require('../models');
const { searchTargetCollaborations, getTargetCollaboration } = require('./tiktokShopService');
const { syncAndHydrateCollaborationCreators } = require('./tiktokCreatorProfileService');
const { recordTargetCollaborationInvites } = require('./tiktokCreatorContactHistoryService');
const { saveTargetCollaborationSnapshots } = require('./tiktokTargetCollaborationSnapshotService');

const TARGET_STATUSES = ['ONGOING', 'EXPIRING', 'VALID', 'CANCELING', 'COMPLETED'];
const TARGET_PAGE_SIZE = 100;
const RATE_LIMIT_COOLDOWN_MS = Math.max(
  15 * 60 * 1000,
  Number(process.env.TIKTOK_TARGET_SYNC_COOLDOWN_MS) || 15 * 60 * 1000,
);
const REQUEST_GATE_NAMESPACE = 'target_collaboration_full_sync';
const LEGACY_REQUEST_INTERVAL_REASON = 'Target Collaboration full-sync request interval.';
const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    const error = new Error('Target Collaboration sync was stopped.');
    error.name = 'AbortError';
    reject(error);
    return;
  }
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    const error = new Error('Target Collaboration sync was stopped.');
    error.name = 'AbortError';
    reject(error);
  }, { once: true });
});

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Target Collaboration sync was stopped.');
  error.name = 'AbortError';
  throw error;
};

const createTargetRequestRunner = ({
  CooldownModel = TikTokApiCooldown,
  now = () => new Date(),
  sleep = delay,
  cooldownMs = RATE_LIMIT_COOLDOWN_MS,
} = {}) => async (shopId, operation, { signal } = {}) => {
  while (true) {
    throwIfAborted(signal);
    const gate = await CooldownModel.findOne({
      where: { shop_id: shopId, namespace: REQUEST_GATE_NAMESPACE },
    });
    // Target Collaboration is not part of the one-request-per-minute Creator
    // Discovery/Performance gate. Ignore interval rows written by older builds,
    // while retaining a persisted cooldown after TikTok explicitly rate-limits it.
    const waitUntil = gate?.cooldown_until && gate.reason !== LEGACY_REQUEST_INTERVAL_REASON
      ? new Date(gate.cooldown_until).getTime()
      : 0;
    const waitMs = waitUntil - now().getTime();
    if (waitMs > 0) await sleep(waitMs, signal);
    throwIfAborted(signal);
    try {
      return await operation();
    } catch (error) {
      if (Number(error.tiktokCode) !== 36009002) throw error;
      const retryAt = new Date(now().getTime() + cooldownMs);
      await CooldownModel.upsert({
        shop_id: shopId,
        namespace: REQUEST_GATE_NAMESPACE,
        cooldown_until: retryAt,
        reason: String(error.message || error).slice(0, 2000),
        updated_at: now(),
      });
    }
  }
};

const createTargetCollaborationSyncService = ({
  search = searchTargetCollaborations,
  getDetail = getTargetCollaboration,
  hydrate = syncAndHydrateCollaborationCreators,
  recordInvites = recordTargetCollaborationInvites,
  saveSnapshots = saveTargetCollaborationSnapshots,
  runRequest = createTargetRequestRunner(),
  statuses = TARGET_STATUSES,
  logger = console,
} = {}) => {
  const activeRuns = new Map();

  const performSync = async (shop, { signal } = {}) => {
    const scopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
    if (!scopes.includes('seller.affiliate_collaboration.read')) {
      return { skipped: true, reason: 'missing_scope', collaborations: 0, creators: 0 };
    }
    const summary = { skipped: false, collaborations: 0, creators: 0, statuses: {} };
    logger.info('[Target Collaboration Sync] Full sync started', {
      shopId: shop.id,
      statuses: statuses.length,
      pageSize: TARGET_PAGE_SIZE,
    });
    for (const status of statuses) {
      throwIfAborted(signal);
      let pageToken = null;
      let pageCount = 0;
      const seenTokens = new Set();
      const statusSummary = { collaborations: 0, creators: 0, pages: 0 };
      do {
        const payload = await runRequest(shop.id, () => search({
          authorization: shop.authorization,
          shopCipher: shop.cipher,
          pageToken,
          pageSize: TARGET_PAGE_SIZE,
          status,
        }), { signal });
        const rows = Array.isArray(payload.data?.target_collaborations) ? payload.data.target_collaborations : [];
        statusSummary.pages += 1;
        for (const row of rows) {
          throwIfAborted(signal);
          const detail = await runRequest(shop.id, () => getDetail({
            authorization: shop.authorization,
            shopCipher: shop.cipher,
            collaborationId: row.id,
          }), { signal });
          const detailed = { ...row, ...(detail.data?.target_collaboration || {}), status, collaboration_status: status };
          const [hydrated] = await hydrate(shop.id, [detailed], {
            logger: { info() {} },
          });
          const creators = hydrated?.creators || [];
          await saveSnapshots(shop.id, hydrated ? [hydrated] : [detailed]);
          await recordInvites(shop.id, hydrated ? [hydrated] : []);
          statusSummary.collaborations += 1;
          statusSummary.creators += creators.length;
          summary.collaborations += 1;
          summary.creators += creators.length;
        }
        const nextToken = payload.data?.next_page_token ? String(payload.data.next_page_token) : null;
        if (!nextToken || seenTokens.has(nextToken)) pageToken = null;
        else {
          seenTokens.add(nextToken);
          pageToken = nextToken;
        }
        pageCount += 1;
        if (pageCount >= 1000) throw new Error(`Target Collaboration pagination exceeded 1000 pages for ${status}.`);
      } while (pageToken);
      summary.statuses[status] = statusSummary;
      logger.info('[Target Collaboration Sync] Status completed', {
        shopId: shop.id,
        status,
        ...statusSummary,
      });
    }
    logger.info('[Target Collaboration Sync] Full sync completed', { shopId: shop.id, ...summary });
    return summary;
  };

  const syncShop = (shop, options = {}) => {
    const key = String(shop.id);
    if (activeRuns.has(key)) return activeRuns.get(key);
    const promise = performSync(shop, options).finally(() => activeRuns.delete(key));
    activeRuns.set(key, promise);
    return promise;
  };

  const startShopSync = (shop) => {
    const key = String(shop.id);
    if (activeRuns.has(key)) return { started: false, status: 'PROCESSING' };
    syncShop(shop).catch((error) => logger.error('[Target Collaboration Sync] Full sync failed', {
      shopId: shop.id,
      message: error.message,
    }));
    return { started: true, status: 'PROCESSING' };
  };

  return { syncShop, startShopSync, isActive: (shopId) => activeRuns.has(String(shopId)) };
};

const targetCollaborationSyncService = createTargetCollaborationSyncService();

module.exports = {
  TARGET_STATUSES,
  TARGET_PAGE_SIZE,
  createTargetRequestRunner,
  createTargetCollaborationSyncService,
  targetCollaborationSyncService,
};
