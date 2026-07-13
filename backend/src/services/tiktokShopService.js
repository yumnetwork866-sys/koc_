const crypto = require('crypto');
const { encryptPartnerToken, decryptPartnerToken } = require('../lib/tiktokPartnerTokenEncryption');

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_SKEW_MS = 5 * 60 * 1000;
const AUTHORIZED_SHOPS_PATH = '/authorization/202309/shops';
const SHOP_PERFORMANCE_PATH = '/analytics/202405/shop/performance';

const getConfig = () => ({
  appKey: String(process.env.TIKTOK_PARTNER_APP_KEY || '').trim(),
  appSecret: String(process.env.TIKTOK_PARTNER_APP_SECRET || '').trim(),
  serviceId: String(process.env.TIKTOK_PARTNER_SERVICE_ID || process.env.TIKTOK_SHOP_SERVICE_ID || '').trim(),
  redirectUri: String(process.env.TIKTOK_PARTNER_REDIRECT_URI || '').trim(),
  authorizeUrl: String(process.env.TIKTOK_SHOP_AUTHORIZE_URL || 'https://services.tiktokshop.com/open/authorize').trim(),
  tokenBaseUrl: String(process.env.TIKTOK_PARTNER_TOKEN_BASE_URL || 'https://auth.tiktok-shops.com/api/v2/token').trim().replace(/\/+$/, ''),
  apiBaseUrl: String(process.env.TIKTOK_PARTNER_API_BASE_URL || 'https://open-api.tiktokglobalshop.com').trim().replace(/\/+$/, ''),
  requestTimeoutMs: Math.max(1000, Number(process.env.TIKTOK_SHOP_REQUEST_TIMEOUT_MS || 15000) || 15000),
});

const assertConfigured = (config, { oauth = false } = {}) => {
  const missing = [
    ['TIKTOK_PARTNER_APP_KEY', config.appKey],
    ['TIKTOK_PARTNER_APP_SECRET', config.appSecret],
    ...(oauth ? [['TIKTOK_PARTNER_REDIRECT_URI', config.redirectUri]] : []),
    ...(oauth && !new URL(config.authorizeUrl).searchParams.get('service_id') ? [['TIKTOK_PARTNER_SERVICE_ID', config.serviceId]] : []),
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`TikTok Shop is not configured. Set ${missing.join(', ')} in backend/.env.`);
};

const signState = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

const buildShopAuthorizationUrl = () => {
  const config = getConfig();
  assertConfigured(config, { oauth: true });
  const payload = Buffer.from(JSON.stringify({
    oauthType: 'shop',
    returnPath: '/manage/shop-analytics',
    nonce: crypto.randomBytes(16).toString('hex'),
    expiresAt: Date.now() + STATE_TTL_MS,
  })).toString('base64url');
  const state = `${payload}.${signState(payload, config.appSecret)}`;
  const url = new URL(config.authorizeUrl);
  if (!url.searchParams.get('service_id')) url.searchParams.set('service_id', config.serviceId);
  url.searchParams.set('state', state);
  return url.toString();
};

const parseShopAuthorizationState = (state) => {
  const config = getConfig();
  assertConfigured(config);
  const [payload, signature] = String(state || '').split('.');
  const expected = payload ? signState(payload, config.appSecret) : '';
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('TikTok Shop OAuth state is invalid.');
  }
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new Error('TikTok Shop OAuth state payload is invalid.'); }
  if (!data.expiresAt || data.expiresAt < Date.now()) throw new Error('TikTok Shop OAuth state is expired.');
  if (data.oauthType !== 'shop') throw new Error('TikTok Shop OAuth state has the wrong authorization type.');
  return data;
};

const tokenRequest = async (path, params, fetchImpl = fetch) => {
  const config = getConfig();
  assertConfigured(config);
  const url = new URL(`${config.tokenBaseUrl}/${path}`);
  Object.entries({ app_key: config.appKey, app_secret: config.appSecret, ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(config.requestTimeoutMs) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || Number(payload?.code) !== 0 || !payload?.data?.access_token) throw new Error(`TikTok Shop token error: ${payload?.message || response.statusText || response.status}`);
  return payload.data;
};

const exchangeShopAuthorizationCode = (code, fetchImpl) => tokenRequest('get', { auth_code: code, grant_type: 'authorized_code' }, fetchImpl);
const refreshShopAuthorizationToken = (token, fetchImpl) => tokenRequest('refresh', { refresh_token: token, grant_type: 'refresh_token' }, fetchImpl);
const expiryDate = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const now = Math.floor(Date.now() / 1000);
  return new Date((number > now ? number : now + number) * 1000);
};

const shopTokenFields = (data, existing = {}) => ({
  open_id: data.open_id || existing.open_id || null,
  user_type: Number(data.user_type ?? existing.user_type ?? 0),
  granted_scopes: data.granted_scopes || data.granted_permissions || existing.granted_scopes || [],
  access_token_encrypted: encryptPartnerToken(data.access_token),
  refresh_token_encrypted: data.refresh_token ? encryptPartnerToken(data.refresh_token) : existing.refresh_token_encrypted || null,
  access_token_expires_at: expiryDate(data.access_token_expire_in || data.expires_in),
  refresh_token_expires_at: expiryDate(data.refresh_token_expire_in || data.refresh_expires_in) || existing.refresh_token_expires_at || null,
  updated_at: new Date(),
});

const signature = ({ path, query, body = '' }) => {
  const config = getConfig();
  const parameters = Object.keys(query).filter((key) => !['sign', 'access_token'].includes(key)).sort().map((key) => `${key}${query[key]}`).join('');
  const input = `${config.appSecret}${path}${parameters}${body}${config.appSecret}`;
  return crypto.createHmac('sha256', config.appSecret).update(input).digest('hex');
};

const requestShopApi = async ({ path, accessToken, query = {}, fetchImpl = fetch }) => {
  const config = getConfig();
  assertConfigured(config);
  const signed = { ...query, app_key: config.appKey, timestamp: Math.floor(Date.now() / 1000) };
  signed.sign = signature({ path, query: signed });
  const url = new URL(`${config.apiBaseUrl}${path}`);
  Object.entries(signed).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)); });
  const response = await fetchImpl(url, {
    headers: { 'content-type': 'application/json', 'x-tts-access-token': accessToken },
    ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(config.requestTimeoutMs) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || Number(payload?.code) !== 0) throw new Error(`TikTok Shop API error: ${payload?.message || response.statusText || response.status}`);
  return payload;
};

const getUsableShopToken = async (authorization, fetchImpl = fetch) => {
  if (authorization.access_token_encrypted && new Date(authorization.access_token_expires_at || 0).getTime() > Date.now() + TOKEN_SKEW_MS) {
    return decryptPartnerToken(authorization.access_token_encrypted);
  }
  if (!authorization.refresh_token_encrypted) throw new Error('TikTok Shop must be connected again.');
  if (authorization.refresh_token_expires_at && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now()) throw new Error('TikTok Shop authorization expired. Reconnect the shop.');
  const data = await refreshShopAuthorizationToken(decryptPartnerToken(authorization.refresh_token_encrypted), fetchImpl);
  if (Number(data.user_type) !== 0) throw new Error('TikTok authorization is not a Seller token.');
  await authorization.update(shopTokenFields(data, authorization));
  return data.access_token;
};

const getAuthorizedShops = async (accessToken, fetchImpl) => {
  const payload = await requestShopApi({ path: AUTHORIZED_SHOPS_PATH, accessToken, fetchImpl });
  return Array.isArray(payload.data?.shops) ? payload.data.shops : [];
};

const getShopPerformance = async ({ authorization, shopCipher, startDate, endDate, currency = 'LOCAL' }, fetchImpl) => {
  const accessToken = await getUsableShopToken(authorization, fetchImpl || fetch);
  return requestShopApi({
    path: SHOP_PERFORMANCE_PATH,
    accessToken,
    fetchImpl: fetchImpl || fetch,
    query: { shop_cipher: shopCipher, start_date_ge: startDate, end_date_lt: endDate, with_comparison: true, granularity: '1D', currency },
  });
};

module.exports = {
  AUTHORIZED_SHOPS_PATH,
  SHOP_PERFORMANCE_PATH,
  buildShopAuthorizationUrl,
  parseShopAuthorizationState,
  exchangeShopAuthorizationCode,
  shopTokenFields,
  signature,
  getAuthorizedShops,
  getShopPerformance,
};
