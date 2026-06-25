const crypto = require('crypto');
const { TikTokChannel, Video } = require('../models');

const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name';
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const DEFAULT_OAUTH_RETURN_PATH = process.env.TIKTOK_OAUTH_RETURN_PATH || '/manage/channels';

const buildTiktokOauthUrl = () => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  const scopes = (process.env.TIKTOK_SCOPES || 'user.info.basic')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(',');
  const authorizeBaseUrl = process.env.TIKTOK_OAUTH_AUTHORIZE_BASE_URL || 'https://www.tiktok.com/v2/auth/authorize/';

  if (!clientKey || !redirectUri) {
    return null;
  }

  const state = crypto.randomBytes(16).toString('hex');

  const url = new URL(authorizeBaseUrl);
  url.searchParams.set('client_key', clientKey);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  return url.toString();
};

const handleTiktokWebhook = async (req, res) => {
  try {
    const payload = req.body || {};

    // Keep the webhook lightweight for now. We log and acknowledge the event.
    console.log('TikTok webhook received:', JSON.stringify(payload));

    return res.status(200).json({
      ok: true,
      received_at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const parseResponseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const stringifyForLog = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const buildTikTokErrorMessage = (payload, fallbackMessage) => {
  const candidates = [
    payload?.error_description,
    payload?.error && payload?.error?.code !== 'ok' ? payload.error.message : null,
    payload?.error && payload?.error?.code !== 'ok' ? payload.error.description : null,
    payload?.message,
    typeof payload?.error === 'string' ? payload.error : null,
    payload ? stringifyForLog(payload) : null,
    fallbackMessage,
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || fallbackMessage;
};

const buildFrontendRedirectUrl = (status, message) => {
  const url = new URL(DEFAULT_OAUTH_RETURN_PATH, DEFAULT_FRONTEND_URL);
  url.searchParams.set('oauth', 'tiktok');
  url.searchParams.set('oauth_status', status);
  if (message) {
    url.searchParams.set('oauth_message', message);
  }
  return url.toString();
};

const exchangeTiktokCodeForToken = async (code) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;

  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error('TikTok OAuth token exchange is not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI.');
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = await parseResponseJson(response);
  const payloadErrorCode = payload?.error?.code || payload?.error?.error_code || payload?.error?.status;

  if (!response.ok || (payload?.error && payloadErrorCode !== 'ok')) {
    const errorMessage = buildTikTokErrorMessage(
      payload,
      `TikTok token exchange failed with status ${response.status} ${response.statusText}`.trim(),
    );
    console.error('[TikTok OAuth] Token exchange error response', {
      status: response.status,
      statusText: response.statusText,
      payload,
    });
    throw new Error(errorMessage);
  }

  return payload;
};

const fetchTiktokUserInfo = async (accessToken) => {
  const response = await fetch(TIKTOK_USER_INFO_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await parseResponseJson(response);
  const payloadErrorCode = payload?.error?.code || payload?.error?.error_code || payload?.error?.status;

  if (!response.ok || (payload?.error && payloadErrorCode !== 'ok')) {
    const errorMessage = buildTikTokErrorMessage(
      payload,
      `TikTok profile fetch failed with status ${response.status} ${response.statusText}`.trim(),
    );
    console.error('[TikTok OAuth] User info error response', {
      status: response.status,
      statusText: response.statusText,
      payload,
    });
    throw new Error(errorMessage);
  }

  return payload;
};

const handleTiktokOauthCallback = async (req, res) => {
  let stage = 'callback_received';
  try {
    const { code, error, error_description: errorDescription } = req.query || {};

    console.info('[TikTok OAuth] Callback received', {
      hasCode: Boolean(code),
      error: error || null,
      errorDescription: errorDescription || null,
    });

    if (error) {
      return res.redirect(buildFrontendRedirectUrl('error', errorDescription || error));
    }

    if (!code) {
      return res.redirect(buildFrontendRedirectUrl('error', 'TikTok OAuth callback missing authorization code'));
    }

    stage = 'exchange_token';
    console.info('[TikTok OAuth] Exchanging authorization code for token');
    const tokenPayload = await exchangeTiktokCodeForToken(code);
    const tokenData = tokenPayload?.data || tokenPayload;

    console.info('[TikTok OAuth] Token exchange succeeded', {
      hasAccessToken: Boolean(tokenData?.access_token),
      hasRefreshToken: Boolean(tokenData?.refresh_token),
      expiresIn: tokenData?.expires_in ?? null,
      openId: tokenData?.open_id || null,
    });

    stage = 'fetch_user_info';
    console.info('[TikTok OAuth] Fetching user info');
    const profilePayload = await fetchTiktokUserInfo(tokenData.access_token);
    const profileData = profilePayload?.data?.user || profilePayload?.data || profilePayload?.user || profilePayload;
    const openId = profileData?.open_id || tokenData?.open_id;
    const displayName = String(profileData?.display_name || openId || 'TikTok').trim();
    const username = String(profileData?.username || openId || `tiktok_${crypto.randomBytes(6).toString('hex')}`)
      .replace(/^@/, '')
      .trim();
    const profileUrl = profileData?.username ? `https://www.tiktok.com/@${profileData.username}` : null;
    const expiresIn = Number(tokenData?.expires_in);
    const tokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    const lookup = openId
      ? { tiktok_open_id: String(openId) }
      : { username };

    stage = 'save_channel';
    console.info('[TikTok OAuth] Saving channel', {
      lookup,
      username,
      openId: openId || null,
    });
    const [channel, created] = await TikTokChannel.findOrCreate({
      where: lookup,
      defaults: {
        platform: 'tiktok',
        tiktok_open_id: openId || null,
        username,
        display_name: displayName,
        avatar_url: profileData?.avatar_url || null,
        profile_url: profileUrl,
        access_token_encrypted: tokenData.access_token || null,
        refresh_token_encrypted: tokenData.refresh_token || null,
        token_expires_at: tokenExpiresAt,
        sync_source: 'oauth',
      },
    });

    await channel.update({
      platform: 'tiktok',
      tiktok_open_id: openId || channel.tiktok_open_id,
      username,
      display_name: displayName,
      avatar_url: profileData?.avatar_url || channel.avatar_url || null,
      profile_url: profileUrl || channel.profile_url || null,
      access_token_encrypted: tokenData.access_token || channel.access_token_encrypted || null,
      refresh_token_encrypted: tokenData.refresh_token || channel.refresh_token_encrypted || null,
      token_expires_at: tokenExpiresAt || channel.token_expires_at || null,
      sync_source: 'oauth',
    });

    console.info('[TikTok OAuth] Channel saved', {
      channelId: channel.id,
      created,
      username: channel.username,
      syncSource: channel.sync_source,
    });

    return res.redirect(
      buildFrontendRedirectUrl('success', created ? 'TikTok channel connected' : 'TikTok channel updated'),
    );
  } catch (error) {
    console.error('[TikTok OAuth] Callback failed', {
      stage,
      message: error?.message || String(error),
      name: error?.name || null,
    });
    console.error(error);
    return res.redirect(buildFrontendRedirectUrl('error', error.message || 'TikTok OAuth failed'));
  }
};

const startTiktokOauth = async (req, res) => {
  try {
    const authorizeUrl = buildTiktokOauthUrl();

    if (!authorizeUrl) {
      return res.status(501).json({
        message: 'TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI in backend/.env',
      });
    }

    console.log('TikTok OAuth URL:', authorizeUrl);

    return res.redirect(authorizeUrl);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getChannels = async (req, res) => {
  try {
    const channels = await TikTokChannel.findAll({
      include: [{ model: Video, as: 'videos' }],
      order: [['id', 'ASC']],
    });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getChannelById = async (req, res) => {
  try {
    const channel = await TikTokChannel.findByPk(req.params.id, {
      include: [{ model: Video, as: 'videos' }],
    });
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    res.json(channel);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createChannel = async (req, res) => {
  try {
    const channel = await TikTokChannel.create({
      platform: req.body.platform || 'tiktok',
      ...req.body,
    });
    res.status(201).json(channel);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateChannel = async (req, res) => {
  try {
    const [updated] = await TikTokChannel.update(req.body, {
      where: { id: req.params.id },
    });
    if (!updated) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const channel = await TikTokChannel.findByPk(req.params.id);
    res.json(channel);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteChannel = async (req, res) => {
  try {
    const deleted = await TikTokChannel.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  handleTiktokWebhook,
  handleTiktokOauthCallback,
  startTiktokOauth,
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
};
