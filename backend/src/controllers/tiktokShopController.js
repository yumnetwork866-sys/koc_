const { Op } = require('sequelize');
const {
  sequelize, TikTokShopAuthorization, TikTokShop, TikTokShopAnalyticsSnapshot,
  TikTokCreatorPerformanceExport, TikTokCreatorPerformanceSnapshot,
} = require('../models');
const {
  buildShopAuthorizationUrl,
  parseShopAuthorizationState,
  exchangeShopAuthorizationCode,
  shopTokenFields,
  getAuthorizedShops,
  getShopPerformance,
  searchOpenCollaborations,
  searchTargetCollaborations,
  searchAffiliateOrders,
  getOpenCollaborationSettings,
  searchSellerSampleApplications,
  getSellerCreatorContentDetails,
  normalizeShopPerformance,
} = require('../services/tiktokShopService');
const {
  createCreatorPerformanceExportWithFallback,
  processCreatorPerformanceExport,
  refreshCreatorPerformanceProfiles,
  yesterdayEndDay,
} = require('../services/tiktokCreatorPerformanceService');
const { createTtlPromiseCache } = require('../lib/ttlPromiseCache');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');

const affiliateCacheTtlValue = Number(process.env.TIKTOK_SELLER_AFFILIATE_CACHE_TTL_MS ?? 120000);
const affiliateCacheTtlMs = affiliateCacheTtlValue === 0
  ? 0
  : Math.min(300000, Math.max(60000, affiliateCacheTtlValue || 120000));
const sellerAffiliateCache = createTtlPromiseCache({ ttlMs: affiliateCacheTtlMs, maxEntries: 1000 });
const creatorProfileRefreshJobs = new Map();
const creatorProfileRefreshKey = (shopId, exportId) => `${shopId}:${exportId}`;

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:3005';
const redirectUrl = (status, message, returnPath = '/manage/shop-analytics') => {
  const safeReturnPath = ['/manage/shop-analytics', '/manage/koc-performance', '/manage/affiliate'].includes(returnPath) ? returnPath : '/manage/shop-analytics';
  const url = new URL(safeReturnPath, FRONTEND_URL());
  url.searchParams.set('shop_oauth_status', status);
  if (message) url.searchParams.set('shop_oauth_message', message);
  return url.toString();
};
const dateValue = (value) => {
  const normalized = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? null : normalized;
};
const idValue = (value) => /^[1-9]\d*$/.test(String(value || '')) ? Number(value) : null;
const pageSizeValue = (value) => Math.min(100, Math.max(1, Number(value) || 20));
const unixTimeValue = (value) => /^\d{1,12}$/.test(String(value || '')) ? Number(value) : null;
const safeShop = (instance) => {
  const shop = instance?.toJSON ? instance.toJSON() : { ...(instance || {}) };
  delete shop.cipher;
  delete shop.authorization;
  return shop;
};
const oauthErrorMessage = (error) => {
  const message = String(error?.message || '');
  if (/state is (?:invalid|expired)|authorization was denied|Seller token/i.test(message)) return message;
  return 'TikTok Shop OAuth could not be completed. Please try again.';
};

const startShopOauth = async (req, res) => {
  try { res.json({ authorizeUrl: buildShopAuthorizationUrl(req.query.return_path) }); }
  catch (error) { res.status(error.message.includes('not configured') ? 503 : 500).json({ message: error.message }); }
};

const handleShopOauthCallback = async (req, res) => {
  let returnPath = '/manage/shop-analytics';
  try {
    const oauthState = parseShopAuthorizationState(req.query.state);
    returnPath = oauthState.returnPath;
    const code = req.query.code || req.query.auth_code;
    if (!code) throw new Error(req.query.error || 'TikTok Shop authorization was denied.');
    const tokenData = await exchangeShopAuthorizationCode(code);
    if (Number(tokenData.user_type) !== 0) throw new Error('TikTok authorization must return a Seller token (user_type=0).');
    const scopes = tokenData.granted_scopes || tokenData.granted_permissions || [];
    const normalizedScopes = Array.isArray(scopes) ? scopes : String(scopes).split(',').map((item) => item.trim()).filter(Boolean);
    const existing = tokenData.open_id ? await TikTokShopAuthorization.findOne({ where: { open_id: tokenData.open_id } }) : null;
    const values = {
      ...shopTokenFields({ ...tokenData, granted_scopes: normalizedScopes }, existing || {}),
      connected_at: new Date(), last_sync_status: 'success', last_sync_error: null,
    };
    const shops = await getAuthorizedShops(tokenData.access_token);
    const validShops = shops.filter((item) => item?.id && item?.cipher);
    await sequelize.transaction(async (transaction) => {
      const authorization = existing
        ? await existing.update(values, { transaction })
        : await TikTokShopAuthorization.create(values, { transaction });
      for (const shop of validShops) {
        await TikTokShop.upsert({
          authorization_id: authorization.id,
          platform_shop_id: String(shop.id),
          name: shop.name || shop.code || String(shop.id),
          region: shop.region || null,
          seller_type: shop.seller_type || null,
          cipher: shop.cipher,
          code: shop.code || null,
          last_sync_status: 'success',
          last_sync_error: null,
        }, { transaction });
      }
      await TikTokShop.destroy({
        where: {
          authorization_id: authorization.id,
          ...(validShops.length ? { platform_shop_id: { [Op.notIn]: validShops.map((shop) => String(shop.id)) } } : {}),
        },
        transaction,
      });
    });
    sellerAffiliateCache.clear();
    const requestedAffiliate = ['/manage/koc-performance', '/manage/affiliate'].includes(oauthState.returnPath);
    const requiredScope = requestedAffiliate ? 'seller.affiliate_collaboration.read' : 'data.shop_analytics.public.read';
    const hasRequiredScope = normalizedScopes.includes(requiredScope);
    return res.redirect(redirectUrl(
      hasRequiredScope ? 'success' : 'warning',
      hasRequiredScope
        ? `${validShops.length} TikTok Shop connected.`
        : `${validShops.length} TikTok Shop connected, but ${requiredScope} permission is missing.`,
      oauthState.returnPath,
    ));
  } catch (error) {
    console.error('[TikTok Shop OAuth] Callback failed', { message: error.message });
    return res.redirect(redirectUrl('error', oauthErrorMessage(error), returnPath));
  }
};

const listShopConnections = async (_req, res) => {
  try {
    const authorizations = await TikTokShopAuthorization.findAll({
      attributes: { exclude: ['access_token_encrypted', 'refresh_token_encrypted'] },
      include: [{ model: TikTokShop, as: 'shops', attributes: { exclude: ['cipher'] } }],
      order: [['connected_at', 'DESC']],
    });
    res.json(authorizations);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const listShops = async (_req, res) => {
  try {
    const shops = await TikTokShop.findAll({
      attributes: { exclude: ['cipher'] },
      include: [{ model: TikTokShopAuthorization, as: 'authorization', attributes: ['id', 'granted_scopes', 'refresh_token_expires_at'] }],
      order: [['name', 'ASC']],
    });
    res.json(shops);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const getShopAnalytics = async (req, res) => {
  try {
    const shopId = idValue(req.params.shopId);
    if (!shopId) return res.status(400).json({ message: 'A valid TikTok Shop id is required.' });
    const shop = await TikTokShop.findByPk(shopId, { attributes: { exclude: ['cipher'] } });
    if (!shop) return res.status(404).json({ message: 'TikTok Shop not found.' });
    const where = { shop_id: shop.id };
    const startDate = dateValue(req.query.start_date);
    const endDate = dateValue(req.query.end_date);
    if (startDate) where.start_date = startDate;
    if (endDate) where.end_date = endDate;
    if (['LOCAL', 'USD'].includes(req.query.currency)) where.currency = req.query.currency;
    let snapshots = await TikTokShopAnalyticsSnapshot.findAll({ where, order: [['synced_at', 'DESC']], limit: 30 });
    let isFallback = false;
    if (!snapshots.length && (startDate || endDate)) {
      const fallbackWhere = { shop_id: shop.id };
      if (['LOCAL', 'USD'].includes(req.query.currency)) fallbackWhere.currency = req.query.currency;
      snapshots = await TikTokShopAnalyticsSnapshot.findAll({
        where: fallbackWhere,
        order: [['end_date', 'DESC'], ['synced_at', 'DESC']],
        limit: 1,
      });
      isFallback = snapshots.length > 0;
    }
    res.json({
      shop,
      is_fallback: isFallback,
      requested_range: { start_date: startDate, end_date: endDate },
      snapshots: snapshots.map((snapshot) => {
        const value = snapshot.toJSON();
        return { ...value, metrics: normalizeShopPerformance(value.metrics) };
      }),
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const syncShopAnalytics = async (req, res) => {
  let shop = null;
  try {
    const shopId = idValue(req.params.shopId);
    if (!shopId) return res.status(400).json({ message: 'A valid TikTok Shop id is required.' });
    shop = await TikTokShop.findByPk(shopId, { include: [{ model: TikTokShopAuthorization, as: 'authorization' }] });
    if (!shop) return res.status(404).json({ message: 'TikTok Shop not found.' });
    const body = req.body || {};
    const startDate = dateValue(body.start_date);
    const endDate = dateValue(body.end_date);
    const currency = body.currency === 'USD' ? 'USD' : 'LOCAL';
    if (!startDate || !endDate || startDate >= endDate) return res.status(400).json({ message: 'A valid start_date and exclusive end_date are required.' });
    const grantedScopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
    if (!grantedScopes.includes('data.shop_analytics.public.read')) {
      return res.status(403).json({ message: 'Reconnect TikTok Shop and grant data.shop_analytics.public.read.' });
    }
    const payload = await getShopPerformance({ authorization: shop.authorization, shopCipher: shop.cipher, startDate, endDate, currency });
    const performance = payload.data?.performance;
    if (!performance || !Array.isArray(performance.intervals)) throw new Error('TikTok Shop returned an invalid Shop Analytics response.');
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
    const snapshot = await TikTokShopAnalyticsSnapshot.findOne({
      where: { shop_id: shop.id, start_date: startDate, end_date: endDate, currency },
    });
    await shop.update({ last_synced_at: new Date(), last_sync_status: 'success', last_sync_error: null });
    await shop.authorization.update({ last_sync_status: 'success', last_sync_error: null, updated_at: new Date() });
    res.json({ shop: safeShop(shop), snapshot });
  } catch (error) {
    await shop?.update({ last_synced_at: new Date(), last_sync_status: 'failed', last_sync_error: String(error.message).slice(0, 2000) }).catch(() => {});
    await shop?.authorization?.update({ last_sync_status: 'failed', last_sync_error: String(error.message).slice(0, 2000), updated_at: new Date() }).catch(() => {});
    res.status(shop ? 424 : 500).json({
      message: error.message,
      ...(error.requestId ? { request_id: error.requestId } : {}),
    });
  }
};

const loadAffiliateShop = async (req, res) => {
  const shopId = idValue(req.params.shopId);
  if (!shopId) {
    res.status(400).json({ message: 'A valid TikTok Shop id is required.' });
    return null;
  }
  const shop = await TikTokShop.findByPk(shopId, { include: [{ model: TikTokShopAuthorization, as: 'authorization' }] });
  if (!shop) {
    res.status(404).json({ message: 'TikTok Shop not found.' });
    return null;
  }
  return shop;
};

const affiliateCacheKey = (namespace, shop, req) => {
  const normalizedQuery = Object.entries(req.query || {})
    .sort(([left], [right]) => left.localeCompare(right));
  const authorizationVersion = shop.authorization?.updated_at
    ? new Date(shop.authorization.updated_at).getTime()
    : 0;
  return JSON.stringify([namespace, shop.id, shop.authorization_id, authorizationVersion, normalizedQuery]);
};

const affiliateResponse = (namespace, operation) => async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const { value: payload, hit } = await sellerAffiliateCache.getOrLoad(
      affiliateCacheKey(namespace, shop, req),
      () => isDemoAuthorization(shop.authorization)
        ? sellerAffiliateFixture(namespace, shop, req.query)
        : operation(shop, req),
    );
    res.set('X-Seller-Affiliate-Cache', hit ? 'HIT' : 'MISS');
    res.json({ ...payload.data, request_id: payload.request_id || null });
  } catch (error) {
    const permissionError = /grant seller\.affiliate_collaboration\.read/i.test(error.message);
    res.status(permissionError ? 403 : 502).json({ message: error.message });
  }
};

const listOpenCollaborations = affiliateResponse('open-collaborations', (shop, req) => searchOpenCollaborations({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
  pageToken: req.query.page_token,
  pageSize: pageSizeValue(req.query.page_size),
  keyword: req.query.keyword,
}));

const listTargetCollaborations = affiliateResponse('target-collaborations', (shop, req) => searchTargetCollaborations({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
  pageToken: req.query.page_token,
  pageSize: pageSizeValue(req.query.page_size),
  keyword: req.query.keyword,
  status: ['ONGOING', 'EXPIRING', 'VALID', 'CANCELING', 'COMPLETED'].includes(req.query.status) ? req.query.status : null,
}));

const listAffiliateOrders = affiliateResponse('orders', (shop, req) => searchAffiliateOrders({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
  pageToken: req.query.page_token,
  pageSize: pageSizeValue(req.query.page_size),
  startTime: unixTimeValue(req.query.create_time_ge),
  endTime: unixTimeValue(req.query.create_time_lt),
  programId: req.query.program_id,
}));

const sampleApplicationStatuses = new Set([
  'PENDING', 'AWAITING_SHIPMENT', 'SHIPPED', 'CONTENT_PENDING', 'REJECT_CANCELLED',
  'OVERDUE_CANCELLED', 'UNFULFILL_CANCELLED', 'DEL_OPEN_COLLAB',
  'SELLER_NOT_SHIP_CANCELLED', 'WITHDRAW_CANCELLED', 'UNFULFILLABLE_CANCELLED',
  'OPS_CANCELLED', 'OPS_FAILED', 'OPS_COMPLETED', 'COMPLETED',
]);

const listAffiliateCreators = affiliateResponse('creators', (shop, req) => searchSellerSampleApplications({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
  pageToken: req.query.page_token,
  pageSize: pageSizeValue(req.query.page_size),
  keyword: req.query.keyword,
  status: sampleApplicationStatuses.has(req.query.status) ? req.query.status : null,
}));

const listCreatorContentDetails = affiliateResponse('creator-content-details', (shop, req) => getSellerCreatorContentDetails({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
  productId: req.query.product_id,
  pageToken: req.query.page_token,
  pageSize: pageSizeValue(req.query.page_size),
}));

const showOpenCollaborationSettings = affiliateResponse('open-collaboration-settings', (shop) => getOpenCollaborationSettings({
  authorization: shop.authorization,
  shopCipher: shop.cipher,
}));

const disconnectShopAuthorization = async (req, res) => {
  try {
    const deleted = await TikTokShopAuthorization.destroy({ where: { id: { [Op.eq]: Number(req.params.authorizationId) || -1 } } });
    if (!deleted) return res.status(404).json({ message: 'TikTok Shop authorization not found.' });
    sellerAffiliateCache.clear();
    res.json({ message: 'TikTok Shop authorization removed.' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const creatorPerformanceOptions = (shop, input = {}) => ({
  windowType: ['PAST_24H', 'PAST_7_DAYS', 'PAST_30_DAYS'].includes(input.window_type)
    ? input.window_type : 'PAST_7_DAYS',
  endDay: /^\d{8}$/.test(String(input.end_day || '')) ? Number(input.end_day) : yesterdayEndDay(shop.region),
  planType: ['ALL', 'TARGET', 'OPEN', 'PARTNER'].includes(input.plan_type) ? input.plan_type : 'ALL',
});

const listCreatorPerformance = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const options = creatorPerformanceOptions(shop, req.query);
    const requestedEndDate = `${String(options.endDay).slice(0, 4)}-${String(options.endDay).slice(4, 6)}-${String(options.endDay).slice(6, 8)}`;
    const exportRecord = await TikTokCreatorPerformanceExport.findOne({
      where: {
        shop_id: shop.id,
        window_type: options.windowType,
        plan_type: options.planType,
        end_date: requestedEndDate,
      },
      order: [['created_at', 'DESC']],
    });
    const snapshotExport = exportRecord?.status === 'SUCCEEDED'
      ? exportRecord
      : await TikTokCreatorPerformanceExport.findOne({
        where: {
          shop_id: shop.id,
          window_type: options.windowType,
          plan_type: options.planType,
          status: 'SUCCEEDED',
        },
        order: [['end_date', 'DESC'], ['created_at', 'DESC']],
      });
    if (!snapshotExport) {
      return res.json({
        export: exportRecord,
        snapshot_export: null,
        is_fallback: false,
        requested_end_date: requestedEndDate,
        creators: [],
        total_count: 0,
        totals: null,
      });
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
    const keyword = String(req.query.keyword || '').trim();
    const where = {
      shop_id: shop.id,
      start_date: snapshotExport.start_date,
      end_date: snapshotExport.end_date,
      plan_type: snapshotExport.plan_type,
      ...(keyword ? { username: { [Op.iLike]: `%${keyword}%` } } : {}),
    };
    const { count, rows } = await TikTokCreatorPerformanceSnapshot.findAndCountAll({
      where,
      order: [['affiliate_gmv', 'DESC'], ['username', 'ASC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const [totals] = await sequelize.query(`
      SELECT
        COALESCE(SUM(affiliate_gmv), 0) AS affiliate_gmv,
        COALESCE(SUM(affiliate_orders), 0) AS affiliate_orders,
        COALESCE(SUM(items_sold), 0) AS items_sold,
        COALESCE(SUM(product_impressions), 0) AS product_impressions,
        COALESCE(SUM(refunded_gmv), 0) AS refunded_gmv
      FROM tiktok_creator_performance_snapshots
      WHERE shop_id = :shopId AND start_date = :startDate AND end_date = :endDate AND plan_type = :planType
    `, {
      replacements: {
        shopId: shop.id, startDate: snapshotExport.start_date, endDate: snapshotExport.end_date, planType: snapshotExport.plan_type,
      },
    });
    res.json({
      export: exportRecord,
      snapshot_export: snapshotExport,
      is_fallback: !exportRecord || String(exportRecord.id) !== String(snapshotExport.id),
      requested_end_date: requestedEndDate,
      creators: rows,
      total_count: count,
      totals: totals[0],
      page,
      page_size: pageSize,
      profile_refresh: creatorProfileRefreshJobs.get(creatorProfileRefreshKey(shop.id, snapshotExport.id)) || null,
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const syncCreatorPerformance = async (req, res) => {
  try {
    const shop = await loadAffiliateShop(req, res);
    if (!shop) return;
    const {
      exportRecord,
      requestedEndDay,
      endDay,
      fallbackDays,
    } = await createCreatorPerformanceExportWithFallback(shop, creatorPerformanceOptions(shop, req.body || {}));
    if (exportRecord.status === 'PROCESSING') {
      setImmediate(() => processCreatorPerformanceExport(shop, exportRecord).catch((error) => {
        console.error('[Creator Performance] Export failed', { shopId: shop.id, taskId: exportRecord.task_id, message: error.message });
      }));
    }
    const profile_refresh_started = exportRecord.status === 'SUCCEEDED';
    if (profile_refresh_started) {
      const refreshKey = creatorProfileRefreshKey(shop.id, exportRecord.id);
      if (creatorProfileRefreshJobs.get(refreshKey)?.status !== 'PROCESSING') {
        creatorProfileRefreshJobs.set(refreshKey, { status: 'PROCESSING', started_at: new Date() });
        setImmediate(() => refreshCreatorPerformanceProfiles(shop, exportRecord).then((count) => {
          creatorProfileRefreshJobs.set(refreshKey, {
            status: 'SUCCEEDED',
            count,
            completed_at: new Date(),
          });
          console.log('[Creator Performance] Profiles refreshed', {
            shopId: shop.id,
            taskId: exportRecord.task_id,
            count,
          });
        }).catch((error) => {
          creatorProfileRefreshJobs.set(refreshKey, {
            status: 'FAILED',
            error: error.message,
            completed_at: new Date(),
          });
          console.error('[Creator Performance] Profile refresh failed', {
            shopId: shop.id,
            taskId: exportRecord.task_id,
            message: error.message,
          });
        }));
      }
    }
    res.status(202).json({
      export: exportRecord,
      profile_refresh_started,
      requested_end_day: requestedEndDay,
      effective_end_day: endDay,
      fallback_days: fallbackDays,
    });
  } catch (error) { res.status(424).json({ message: error.message }); }
};

module.exports = {
  startShopOauth, handleShopOauthCallback, listShopConnections, listShops,
  getShopAnalytics, syncShopAnalytics, disconnectShopAuthorization,
  listOpenCollaborations, listTargetCollaborations, listAffiliateOrders, showOpenCollaborationSettings,
  listAffiliateCreators,
  listCreatorContentDetails,
  listCreatorPerformance,
  syncCreatorPerformance,
};
