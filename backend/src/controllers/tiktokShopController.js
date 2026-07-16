const { Op } = require('sequelize');
const {
  sequelize, TikTokShopAuthorization, TikTokShop, TikTokShopAnalyticsSnapshot,
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
} = require('../services/tiktokShopService');
const { createTtlPromiseCache } = require('../lib/ttlPromiseCache');

const affiliateCacheTtlValue = Number(process.env.TIKTOK_SELLER_AFFILIATE_CACHE_TTL_MS ?? 120000);
const affiliateCacheTtlMs = affiliateCacheTtlValue === 0
  ? 0
  : Math.min(300000, Math.max(60000, affiliateCacheTtlValue || 120000));
const sellerAffiliateCache = createTtlPromiseCache({ ttlMs: affiliateCacheTtlMs, maxEntries: 1000 });

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:3005';
const redirectUrl = (status, message, returnPath = '/manage/shop-analytics') => {
  const safeReturnPath = ['/manage/shop-analytics', '/manage/koc-performance'].includes(returnPath) ? returnPath : '/manage/shop-analytics';
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
    const requestedAffiliate = oauthState.returnPath === '/manage/koc-performance';
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
    const snapshots = await TikTokShopAnalyticsSnapshot.findAll({ where, order: [['synced_at', 'DESC']], limit: 30 });
    res.json({ shop, snapshots });
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
    res.status(shop ? 502 : 500).json({ message: error.message });
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
      () => operation(shop, req),
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

module.exports = {
  startShopOauth, handleShopOauthCallback, listShopConnections, listShops,
  getShopAnalytics, syncShopAnalytics, disconnectShopAuthorization,
  listOpenCollaborations, listTargetCollaborations, listAffiliateOrders, showOpenCollaborationSettings,
};
