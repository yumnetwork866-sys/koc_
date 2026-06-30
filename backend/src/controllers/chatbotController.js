const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  FacebookPage,
  FacebookOauthState,
  FacebookUserSession,
  ChatbotMessage,
  ChatbotOrder,
  ChatbotKnowledgeDoc,
  ChatbotSetting,
  sequelize,
} = require('../models');
const { decryptToken, encryptToken } = require('../lib/tokenEncryption');

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v19.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const EMBED_MODEL = 'text-embedding-004';
const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEBUG_FB_CHATBOT = process.env.FB_CHATBOT_DEBUG === '1' || process.env.FB_CHATBOT_DEBUG === 'true';

function fbDebug(message, meta = {}) {
  if (!DEBUG_FB_CHATBOT) return;
  const suffix = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[fb-chatbot] ${message}${suffix}`);
}

function parseModelList(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf(':');
      if (separatorIndex === -1) {
        return { provider: 'gemini', model: item, label: item };
      }
      const provider = item.slice(0, separatorIndex).trim().toLowerCase();
      const model = item.slice(separatorIndex + 1).trim();
      if (!model) {
        return { provider: 'gemini', model: item, label: item };
      }
      return {
        provider: provider === 'ollama' ? 'ollama' : 'gemini',
        model,
        label: `${provider === 'ollama' ? 'Ollama' : 'Gemini'}: ${model}`,
      };
    });
}

function defaultChatbotModel() {
  const models = parseModelList(process.env.CHATBOT_MODELS || process.env.GEMINI_MODEL || 'gemma-3-27b-it');
  return models[0] || { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemma-3-27b-it', label: process.env.GEMINI_MODEL || 'gemma-3-27b-it' };
}

async function ensureChatbotSetting() {
  const defaults = defaultChatbotModel();
  try {
    const [setting] = await ChatbotSetting.findOrCreate({
      where: { id: 1 },
      defaults: {
        id: 1,
        provider: defaults.provider,
        model: defaults.model,
        ollama_host: DEFAULT_OLLAMA_HOST,
        updated_at: new Date(),
      },
    });
    return setting;
  } catch (error) {
    if (error?.parent?.code !== '42P01') {
      throw error;
    }

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS chatbot_settings (
        id INTEGER PRIMARY KEY,
        provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
        model VARCHAR(255) NOT NULL,
        ollama_host TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const [setting] = await ChatbotSetting.findOrCreate({
      where: { id: 1 },
      defaults: {
        id: 1,
        provider: defaults.provider,
        model: defaults.model,
        ollama_host: DEFAULT_OLLAMA_HOST,
        updated_at: new Date(),
      },
    });
    return setting;
  }
}

async function getChatbotRuntimeConfig() {
  const setting = await ensureChatbotSetting();
  return {
    provider: setting.provider || 'gemini',
    model: setting.model || defaultChatbotModel().model,
    ollamaHost: DEFAULT_OLLAMA_HOST,
    models: parseModelList(process.env.CHATBOT_MODELS || process.env.GEMINI_MODEL || 'gemma-3-27b-it'),
  };
}

function normalizeOllamaHost(host) {
  return String(host || '').trim().replace(/\/+$/, '');
}

async function fetchOllamaModelsFromHost(ollamaHost) {
  const host = normalizeOllamaHost(ollamaHost);
  if (!host) {
    return { ollamaHost: '', models: [] };
  }

  const response = await fetch(`${host}/api/tags`, {
    headers: { accept: 'application/json' },
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || 'Failed to load Ollama models');
    error.status = 502;
    error.payload = { ollamaHost: host, models: [] };
    throw error;
  }

  return {
    ollamaHost: host,
    models: (data.models || [])
      .map((item) => {
        const model = item.name || item.model || item.tag || '';
        return model
          ? {
              provider: 'ollama',
              model,
              label: `Ollama: ${model}`,
            }
          : null;
      })
      .filter(Boolean),
  };
}

async function listOllamaModels(_req, res) {
  const setting = await ensureChatbotSetting();
  try {
    return res.json(await fetchOllamaModelsFromHost(setting.ollama_host || DEFAULT_OLLAMA_HOST));
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'Failed to load Ollama models',
      ...(error.payload || { ollamaHost: normalizeOllamaHost(setting.ollama_host || DEFAULT_OLLAMA_HOST), models: [] }),
    });
  }
}

const getBaseUrl = () => (process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, '');
const getFrontendUrl = () => (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
const getRedirectUri = () => `${getBaseUrl()}/api/chatbot/facebook/callback`;
const fbConfigured = () => Boolean(process.env.FB_APP_ID && process.env.FB_APP_SECRET);
const getFacebookSessionToken = (req) => req.get('x-fb-chatbot-token')?.trim() || null;

const loginScopes = [
  'public_profile',
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
].join(',');

function toMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    pageId: row.page_id,
    direction: row.direction,
    text: row.text,
    via: row.via,
    ts: new Date(row.created_at).getTime(),
  };
}

function toOrder(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    pageId: row.page_id,
    raw: row.raw,
    name: row.name || '',
    phone: row.phone || '',
    address: row.address || '',
    status: row.status,
    ts: new Date(row.created_at).getTime(),
  };
}

function publicPage(row) {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id || '',
    ownerName: row.owner_name || '',
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

async function graphGet(path, params = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Graph GET ${path} failed`);
  return data;
}

async function currentFacebookSession(req) {
  const sid = getFacebookSessionToken(req);
  fbDebug('currentFacebookSession:token', { hasToken: Boolean(sid) });
  if (!sid) return null;

  const session = await FacebookUserSession.findByPk(sid);
  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    fbDebug('currentFacebookSession:expired-or-missing', { hasSession: Boolean(session) });
    if (session) await session.destroy();
    return null;
  }

  fbDebug('currentFacebookSession:ok', { userId: session.user_id, userName: session.user_name });
  return {
    sid: session.sid,
    userId: session.user_id,
    userName: session.user_name,
    userToken: decryptToken(session.user_token_encrypted),
  };
}

async function tokenForPage(pageId) {
  if (pageId) {
    const page = await FacebookPage.findByPk(pageId);
    if (page?.access_token_encrypted) return decryptToken(page.access_token_encrypted);
  }
  return process.env.PAGE_ACCESS_TOKEN || null;
}

async function pageForSender(senderId) {
  const message = await ChatbotMessage.findOne({
    where: { sender_id: senderId, page_id: { [Op.ne]: null } },
    order: [['created_at', 'DESC']],
  });
  return message?.page_id || null;
}

async function findPhone(text) {
  const compact = String(text || '').replace(/[ .-]/g, '');
  return compact.match(/0\d{9}|\+84\d{9}/)?.[0] || null;
}

async function embed(text) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      console.error('Embed error:', JSON.stringify(data));
      return null;
    }
    return data.embedding?.values || null;
  } catch (error) {
    console.error('Embed error:', error.message);
    return null;
  }
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    na += a[index] * a[index];
    nb += b[index] * b[index];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function keywordScore(query, text) {
  const words = String(query || '').toLowerCase().split(/\W+/).filter((word) => word.length > 1);
  if (!words.length) return 0;
  const haystack = String(text || '').toLowerCase();
  return words.filter((word) => haystack.includes(word)).length / words.length;
}

async function retrieve(query, limit = 3) {
  const docs = await ChatbotKnowledgeDoc.findAll({ order: [['created_at', 'DESC']] });
  if (!docs.length) return [];

  const queryEmbedding = await embed(query);
  const scored = docs.map((doc) => {
    const embedding = Array.isArray(doc.embedding) ? doc.embedding : null;
    return {
      doc,
      score: queryEmbedding && embedding
        ? cosine(queryEmbedding, embedding)
        : keywordScore(query, `${doc.title} ${doc.content}`),
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.doc);
}

async function askAI(userText) {
  const docs = await retrieve(userText, 3);
  const context = docs.length
    ? `Thông tin của shop (ưu tiên dùng để trả lời, không bịa thêm):\n${docs.map((doc) => `- ${doc.title}: ${doc.content}`).join('\n')}\n\n`
    : '';
  const systemPrompt = [
    'Bạn là trợ lý CSKH của một shop online tại Việt Nam.',
    "Trả lời ngắn gọn, thân thiện, lịch sự, xưng 'mình' gọi khách 'bạn'.",
    "Nếu có 'Thông tin của shop' bên dưới, hãy dựa vào đó để trả lời.",
  ].join(' ');

  try {
    const runtime = await getChatbotRuntimeConfig();
    const prompt = `${systemPrompt}\n\n${context}Khách: ${userText}`;

    if (runtime.provider === 'ollama') {
      const response = await fetch(`${runtime.ollamaHost.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: runtime.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...(context ? [{ role: 'system', content: context.trim() }] : []),
            { role: 'user', content: userText },
          ],
          stream: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Ollama error:', JSON.stringify(data));
        return 'Xin lỗi, hệ thống đang bận. Bạn thử lại sau ít phút nhé!';
      }
      return data.message?.content?.trim() || data.response?.trim() || 'Mình chưa rõ ý bạn, bạn nói rõ hơn nhé.';
    }

    if (!process.env.GEMINI_API_KEY) {
      return 'Cảm ơn bạn đã nhắn tin. Nhân viên sẽ phản hồi sớm nhất ạ!';
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${runtime.model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return 'Xin lỗi, hệ thống đang bận. Bạn thử lại sau ít phút nhé!';
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Mình chưa rõ ý bạn, bạn nói rõ hơn nhé.';
  } catch (error) {
    console.error('AI error:', error.message);
    return 'Xin lỗi, hệ thống đang bận. Bạn thử lại sau ít phút nhé!';
  }
}

async function callSendAPI(pageId, payload) {
  const token = await tokenForPage(pageId);
  if (!token) {
    console.error(`No Facebook page access token for page ${pageId}`);
    return;
  }

  const response = await fetch(`${GRAPH}/me/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) console.error('Send API error:', await response.text());
}

async function sendText(pageId, senderId, text, quickReplies = [], via = 'bot') {
  await ChatbotMessage.create({ sender_id: senderId, page_id: pageId, direction: 'out', text, via });
  const message = { text };
  if (quickReplies.length) {
    message.quick_replies = quickReplies.map((title) => ({
      content_type: 'text',
      title,
      payload: title.toUpperCase().replace(/\s+/g, '_'),
    }));
  }
  return callSendAPI(pageId, { recipient: { id: senderId }, message });
}

const sendAction = (pageId, senderId, action) => callSendAPI(pageId, {
  recipient: { id: senderId },
  sender_action: action,
});

async function handleMessage(pageId, senderId, text) {
  await ChatbotMessage.create({ sender_id: senderId, page_id: pageId, direction: 'in', text, via: 'customer' });
  await sendAction(pageId, senderId, 'typing_on');
  const lower = text.toLowerCase();
  const phone = await findPhone(text);

  if (phone) {
    await ChatbotOrder.create({ sender_id: senderId, page_id: pageId, raw: text, phone });
    return sendText(pageId, senderId, 'Dạ shop đã nhận thông tin, sẽ liên hệ xác nhận đơn sớm nhất ạ!', [], 'script');
  }

  if (/(giá|bao nhiêu|price)/.test(lower)) {
    return sendText(pageId, senderId, 'Dạ sản phẩm hiện có giá 299.000đ. Bạn muốn đặt mua không ạ?', ['Đặt mua', 'Xem sản phẩm khác'], 'script');
  }

  if (/(mua|đặt hàng|order|chốt đơn)/.test(lower)) {
    return sendText(pageId, senderId, 'Tuyệt vời! Bạn cho mình xin Tên - SĐT - Địa chỉ để lên đơn nhé.', [], 'script');
  }

  if (/(ship|giao hàng|vận chuyển)/.test(lower)) {
    return sendText(pageId, senderId, 'Bên mình giao toàn quốc 2-4 ngày, freeship đơn từ 500k ạ.', [], 'script');
  }

  const reply = await askAI(text);
  return sendText(pageId, senderId, reply, ['Xem sản phẩm', 'Gặp nhân viên'], 'ai');
}

async function handlePostback(pageId, senderId, payload) {
  await ChatbotMessage.create({ sender_id: senderId, page_id: pageId, direction: 'in', text: `[postback] ${payload}`, via: 'customer' });
  if (payload === 'GET_STARTED') {
    return sendText(pageId, senderId, 'Chào mừng bạn đến với Shop! Mình có thể giúp gì ạ?', ['Xem sản phẩm', 'Hỏi giá', 'CSKH'], 'script');
  }
  return sendText(pageId, senderId, `Bạn vừa chọn: ${payload}`, [], 'script');
}

async function startFacebookOAuth(_req, res) {
  if (!fbConfigured()) {
    return res.status(500).json({ message: 'FB_APP_ID and FB_APP_SECRET must be configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  await FacebookOauthState.create({
    state,
    expires_at: new Date(Date.now() + STATE_TTL_MS),
  });

  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.FB_APP_ID);
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('scope', loginScopes);
  return res.json({ authorizeUrl: url.toString() });
}

async function facebookCallback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  const redirect = (status, message, token = '') => {
    const url = new URL(`${getFrontendUrl()}/chatbot`);
    url.searchParams.set('oauth_status', status);
    url.searchParams.set('oauth_message', message);
    if (token) url.hash = `fb_token=${encodeURIComponent(token)}`;
    return res.redirect(url.toString());
  };

  fbDebug('facebookCallback:start', {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasError: Boolean(error),
  });
  if (error) return redirect('error', errorDescription || error);
  if (!code || !state) return redirect('error', 'Missing Facebook OAuth code or state');

  const stateRow = await FacebookOauthState.findByPk(state);
  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    if (stateRow) await stateRow.destroy();
    return redirect('error', 'Facebook OAuth state is invalid or expired');
  }
  await stateRow.destroy();

  try {
    const shortToken = await graphGet('oauth/access_token', {
      client_id: process.env.FB_APP_ID,
      client_secret: process.env.FB_APP_SECRET,
      redirect_uri: getRedirectUri(),
      code,
    });
    const longToken = await graphGet('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: process.env.FB_APP_ID,
      client_secret: process.env.FB_APP_SECRET,
      fb_exchange_token: shortToken.access_token,
    });
    const userToken = longToken.access_token;
    const me = await graphGet('me', { fields: 'id,name', access_token: userToken });
    const sid = crypto.randomBytes(24).toString('hex');

    await FacebookUserSession.create({
      sid,
      user_id: me.id,
      user_name: me.name,
      user_token_encrypted: encryptToken(userToken),
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    });
    fbDebug('facebookCallback:success', { userId: me.id, userName: me.name, sidPrefix: sid.slice(0, 8) });
    return redirect('success', 'Facebook login connected', sid);
  } catch (err) {
    console.error('Facebook OAuth callback error:', err);
    fbDebug('facebookCallback:error', { message: err.message });
    return redirect('error', err.message);
  }
}

async function facebookLogout(req, res) {
  const sid = getFacebookSessionToken(req);
  if (sid) await FacebookUserSession.destroy({ where: { sid } });
  res.json({ ok: true });
}

async function getFacebookMe(req, res) {
  const session = await currentFacebookSession(req);
  fbDebug('getFacebookMe', { loggedIn: Boolean(session), configured: fbConfigured() });
  res.json({
    configured: fbConfigured(),
    loggedIn: Boolean(session),
    name: session?.userName || null,
  });
}

async function getManagedPages(req, res) {
  const session = await currentFacebookSession(req);
  if (!session) return res.status(401).json({ message: 'Facebook login is required' });

  try {
    fbDebug('getManagedPages:start', { userId: session.userId, userName: session.userName });
    const data = await graphGet('me/accounts', {
      fields: 'id,name,tasks',
      access_token: session.userToken,
      limit: 100,
    });
    const connected = new Set((await FacebookPage.findAll({ attributes: ['id'] })).map((page) => page.id));
    const pages = (data.data || []).map((page) => ({
      id: page.id,
      name: page.name,
      canManage: (page.tasks || []).includes('MANAGE'),
      connected: connected.has(page.id),
    }));
    fbDebug('getManagedPages:done', { count: pages.length, pageIds: pages.map((page) => page.id) });
    return res.json(pages);
  } catch (err) {
    fbDebug('getManagedPages:error', { message: err.message });
    return res.status(500).json({ message: err.message });
  }
}

async function connectPage(req, res) {
  const session = await currentFacebookSession(req);
  if (!session) return res.status(401).json({ message: 'Facebook login is required' });

  try {
    const pageId = req.params.id;
    fbDebug('connectPage:start', { pageId, userId: session.userId, userName: session.userName });
    const accounts = await graphGet('me/accounts', {
      fields: 'id,name,access_token',
      access_token: session.userToken,
      limit: 100,
    });
    const page = (accounts.data || []).find((item) => item.id === pageId);
    if (!page) return res.status(404).json({ message: 'You do not manage this Facebook page' });
    if (!page.access_token) return res.status(403).json({ message: 'Could not read the page access token' });

    const subscription = await fetch(
      `${GRAPH}/${pageId}/subscribed_apps?${new URLSearchParams({
        subscribed_fields: 'messages,messaging_postbacks',
        access_token: page.access_token,
      })}`,
      { method: 'POST' },
    );
    const subscriptionData = await subscription.json();
    if (!subscription.ok || subscriptionData.success === false) {
      throw new Error(subscriptionData.error?.message || 'Could not subscribe page webhook');
    }

    const payload = {
      id: page.id,
      name: page.name,
      access_token_encrypted: encryptToken(page.access_token),
      owner_id: session.userId,
      owner_name: session.userName,
      updated_at: new Date(),
    };
    const existing = await FacebookPage.findByPk(page.id);
    if (existing) await existing.update(payload);
    else await FacebookPage.create({ ...payload, connected_at: new Date() });

    fbDebug('connectPage:ok', { pageId: page.id, pageName: page.name });
    return res.json({ ok: true, id: page.id, name: page.name });
  } catch (err) {
    console.error('Connect Facebook page error:', err);
    fbDebug('connectPage:error', { message: err.message });
    return res.status(500).json({ message: err.message });
  }
}

async function disconnectPage(req, res) {
  const page = await FacebookPage.findByPk(req.params.id);
  if (!page) return res.status(404).json({ message: 'Facebook page was not found' });

  try {
    const token = decryptToken(page.access_token_encrypted);
    if (token) {
      await fetch(`${GRAPH}/${page.id}/subscribed_apps?${new URLSearchParams({ access_token: token })}`, { method: 'DELETE' });
    }
  } catch (err) {
    console.error('Unsubscribe Facebook page error:', err.message);
  }

  await page.destroy();
  return res.json({ ok: true });
}

async function listPages(_req, res) {
  const pages = await FacebookPage.findAll({ order: [['updated_at', 'DESC']] });
  res.json(pages.map(publicPage));
}

async function stats(_req, res) {
  const [totalMessages, incoming, outgoing, aiReplies, scriptReplies, manualReplies, orders, newOrders, docs, uniqueUsers, today] = await Promise.all([
    ChatbotMessage.count(),
    ChatbotMessage.count({ where: { direction: 'in' } }),
    ChatbotMessage.count({ where: { direction: 'out' } }),
    ChatbotMessage.count({ where: { via: 'ai' } }),
    ChatbotMessage.count({ where: { via: 'script' } }),
    ChatbotMessage.count({ where: { via: 'manual' } }),
    ChatbotOrder.count(),
    ChatbotOrder.count({ where: { status: 'new' } }),
    ChatbotKnowledgeDoc.count(),
    ChatbotMessage.count({ distinct: true, col: 'sender_id' }),
    ChatbotMessage.count({ where: { created_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ]);

  res.json({
    totalMessages,
    incoming,
    outgoing,
    today,
    uniqueUsers,
    aiReplies,
    scriptReplies,
    manualReplies,
    orders,
    newOrders,
    docs,
  });
}

async function listConversations(_req, res) {
  const messages = await ChatbotMessage.findAll({ order: [['created_at', 'ASC']] });
  const map = new Map();
  messages.forEach((message) => {
    const conversation = map.get(message.sender_id) || {
      senderId: message.sender_id,
      pageId: message.page_id,
      count: 0,
      lastText: '',
      lastTs: 0,
      lastDirection: '',
    };
    conversation.count += 1;
    const ts = new Date(message.created_at).getTime();
    if (ts >= conversation.lastTs) {
      conversation.pageId = message.page_id;
      conversation.lastTs = ts;
      conversation.lastText = message.text;
      conversation.lastDirection = message.direction;
    }
    map.set(message.sender_id, conversation);
  });
  res.json([...map.values()].sort((a, b) => b.lastTs - a.lastTs));
}

async function listMessages(req, res) {
  const where = {};
  if (req.query.senderId) where.sender_id = req.query.senderId;
  const rows = await ChatbotMessage.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Number(req.query.limit) || 200,
  });
  res.json(rows.reverse().map(toMessage));
}

async function listOrders(_req, res) {
  const rows = await ChatbotOrder.findAll({ order: [['created_at', 'DESC']] });
  res.json(rows.map(toOrder));
}

async function updateOrder(req, res) {
  const order = await ChatbotOrder.findByPk(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order was not found' });
  await order.update({ status: req.body.status });
  return res.json(toOrder(order));
}

async function listKnowledgeDocs(_req, res) {
  const docs = await ChatbotKnowledgeDoc.findAll({ order: [['created_at', 'DESC']] });
  res.json(docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    ts: new Date(doc.created_at).getTime(),
  })));
}

async function getSettings(_req, res) {
  const setting = await ensureChatbotSetting();
  res.json({
    provider: setting.provider || 'gemini',
    model: setting.model || defaultChatbotModel().model,
    ollamaHost: normalizeOllamaHost(setting.ollama_host || DEFAULT_OLLAMA_HOST),
    models: parseModelList(process.env.CHATBOT_MODELS || process.env.GEMINI_MODEL || 'gemma-3-27b-it'),
  });
}

async function updateSettings(req, res) {
  const { provider, model } = req.body || {};
  const baseModels = parseModelList(process.env.CHATBOT_MODELS || process.env.GEMINI_MODEL || 'gemma-3-27b-it');
  const setting = await ensureChatbotSetting();
  const currentHost = setting.ollama_host || DEFAULT_OLLAMA_HOST;
  let models = baseModels;

  if (provider === 'ollama') {
    try {
      const hostModels = await fetchOllamaModelsFromHost(currentHost);
      models = [...baseModels, ...hostModels.models];
    } catch (error) {
      if (baseModels.some((item) => item.provider === provider && item.model === model)) {
        models = baseModels;
      } else {
        return res.status(502).json({ message: error.message || 'Failed to load Ollama models' });
      }
    }
  }

  const selected = models.find((item) => item.provider === provider && item.model === model);
  if (!selected) {
    return res.status(400).json({ message: 'Model is not available from current configuration' });
  }

  await setting.update({
    provider: selected.provider,
    model: selected.model,
    updated_at: new Date(),
  });

  return res.json({
    provider: setting.provider,
    model: setting.model,
    ollamaHost: normalizeOllamaHost(setting.ollama_host || DEFAULT_OLLAMA_HOST),
    models,
  });
}

async function createKnowledgeDoc(req, res) {
  const { title, content } = req.body;
  if (!content) return res.status(400).json({ message: 'Content is required' });
  const embedding = await embed(`${title || ''}\n${content}`);
  const doc = await ChatbotKnowledgeDoc.create({
    title: title || '(không tiêu đề)',
    content,
    embedding,
  });
  return res.json({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    ts: new Date(doc.created_at).getTime(),
  });
}

async function deleteKnowledgeDoc(req, res) {
  const count = await ChatbotKnowledgeDoc.destroy({ where: { id: req.params.id } });
  if (!count) return res.status(404).json({ message: 'Knowledge document was not found' });
  return res.json({ ok: true });
}

async function sendManualMessage(req, res) {
  const { senderId, text } = req.body;
  if (!senderId || !text) return res.status(400).json({ message: 'senderId and text are required' });

  try {
    const pageId = req.body.pageId || await pageForSender(senderId);
    await sendText(pageId, senderId, text, [], 'manual');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

function receiveWebhook(req, res) {
  const body = req.body;
  if (body.object !== 'page') return res.sendStatus(404);

  res.status(200).send('EVENT_RECEIVED');
  for (const entry of body.entry || []) {
    const pageId = entry.id;
    for (const event of entry.messaging || []) {
      const senderId = event.sender?.id;
      if (!senderId) continue;
      if (event.message?.text) {
        handleMessage(pageId, senderId, event.message.text).catch(console.error);
      } else if (event.postback) {
        handlePostback(pageId, senderId, event.postback.payload).catch(console.error);
      }
    }
  }
}

module.exports = {
  startFacebookOAuth,
  facebookCallback,
  facebookLogout,
  getFacebookMe,
  getManagedPages,
  connectPage,
  disconnectPage,
  listPages,
  stats,
  listConversations,
  listMessages,
  listOrders,
  updateOrder,
  listKnowledgeDocs,
  createKnowledgeDoc,
  deleteKnowledgeDoc,
  getSettings,
  listOllamaModels,
  updateSettings,
  sendManualMessage,
  verifyWebhook,
  receiveWebhook,
};
