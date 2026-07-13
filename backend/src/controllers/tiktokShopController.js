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
} = require('../services/tiktokShopService');

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:3005';
const redirectUrl = (status, message) => {
  const url = new URL('/manage/shop-analytics', FRONTEND_URL());
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

const startShopOauth = async (_req, res) => {
  try { res.json({ authorizeUrl: buildShopAuthorizationUrl() }); }
  catch (error) { res.status(error.message.includes('not configured') ? 503 : 500).json({ message: error.message }); }
};

const handleShopOauthCallback = async (req, res) => {
  try {
    parseShopAuthorizationState(req.query.state);
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
    const hasAnalyticsScope = normalizedScopes.includes('data.shop_analytics.public.read');
    return res.redirect(redirectUrl(
      hasAnalyticsScope ? 'success' : 'warning',
      hasAnalyticsScope
        ? `${validShops.length} TikTok Shop connected.`
        : `${validShops.length} TikTok Shop connected, but Shop Analytics permission is missing.`,
    ));
  } catch (error) {
    console.error('[TikTok Shop OAuth] Callback failed', { message: error.message });
    return res.redirect(redirectUrl('error', oauthErrorMessage(error)));
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

const disconnectShopAuthorization = async (req, res) => {
  try {
    const deleted = await TikTokShopAuthorization.destroy({ where: { id: { [Op.eq]: Number(req.params.authorizationId) || -1 } } });
    if (!deleted) return res.status(404).json({ message: 'TikTok Shop authorization not found.' });
    res.json({ message: 'TikTok Shop authorization removed.' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

module.exports = {
  startShopOauth, handleShopOauthCallback, listShopConnections, listShops,
  getShopAnalytics, syncShopAnalytics, disconnectShopAuthorization,
};
