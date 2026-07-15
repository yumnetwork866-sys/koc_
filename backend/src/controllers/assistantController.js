const { QueryTypes } = require('sequelize');
const { ChatbotSetting, sequelize } = require('../models');

const DEFAULT_MODEL = process.env.AI_CHAT_MODEL || process.env.GEMINI_MODEL || 'gemma-3-27b-it';
const DEFAULT_PROVIDER = process.env.AI_CHAT_PROVIDER || 'gemini';
const DEFAULT_OLLAMA_HOST = process.env.AI_CHAT_OLLAMA_HOST || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const EMBED_MODEL = 'text-embedding-004';

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

function parseSingleModel(rawValue, fallbackProvider = DEFAULT_PROVIDER) {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  if (value.toLowerCase().startsWith('ollama:')) {
    return {
      provider: 'ollama',
      model: value.slice('ollama:'.length).trim(),
    };
  }

  if (value.toLowerCase().startsWith('gemini:')) {
    return {
      provider: 'gemini',
      model: value.slice('gemini:'.length).trim(),
    };
  }

  return {
    provider: fallbackProvider === 'ollama' ? 'ollama' : 'gemini',
    model: value,
  };
}

function getEnvRuntimeConfig() {
  const rawModel = String(process.env.AI_CHAT_MODEL || '').trim();
  if (!rawModel) return null;

  const parsed = parseSingleModel(rawModel, DEFAULT_PROVIDER);
  if (!parsed?.model) return null;

  return {
    provider: parsed.provider,
    model: parsed.model,
    ollamaHost: String(process.env.AI_CHAT_OLLAMA_HOST || process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST).trim().replace(/\/+$/, ''),
  };
}

function defaultAssistantModel() {
  const parsed = parseSingleModel(DEFAULT_MODEL, DEFAULT_PROVIDER);
  if (parsed?.model) {
    return {
      provider: parsed.provider,
      model: parsed.model,
      label: DEFAULT_MODEL,
    };
  }

  return {
    provider: DEFAULT_PROVIDER === 'ollama' ? 'ollama' : 'gemini',
    model: DEFAULT_MODEL,
    label: DEFAULT_MODEL,
  };
}

async function ensureAssistantSetting() {
  const defaults = defaultAssistantModel();

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

async function getRuntime() {
  const envRuntime = getEnvRuntimeConfig();
  if (envRuntime) return envRuntime;

  const setting = await ensureAssistantSetting();
  return {
    provider: setting.provider || defaultAssistantModel().provider,
    model: setting.model || defaultAssistantModel().model,
    ollamaHost: String(setting.ollama_host || DEFAULT_OLLAMA_HOST).trim().replace(/\/+$/, ''),
  };
}

async function getKpiSnapshot() {
  const [overviewRows, userRows, productRows] = await Promise.all([
    sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM users)::int AS "totalUsers",
        COUNT(*)::int AS "totalVideos",
        COALESCE(SUM(views), 0)::bigint AS "totalViews",
        COALESCE(SUM(likes), 0)::bigint AS "totalLikes",
        COALESCE(SUM(comments), 0)::bigint AS "totalComments",
        COALESCE(SUM(shares), 0)::bigint AS "totalShares"
      FROM videos
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      WITH user_videos AS (
        SELECT DISTINCT user_id, video_id
        FROM video_assignments
      )
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COUNT(uv.video_id)::int AS "videoCount",
        COALESCE(SUM(v.views), 0)::bigint AS "totalViews",
        COALESCE(ROUND(AVG(v.views)), 0)::bigint AS "avgViewsPerVideo",
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE v.views >= 10000) / NULLIF(COUNT(v.id), 0)), 0)::int AS "over10kRate",
        CASE WHEN top_video.id IS NULL THEN NULL ELSE json_build_object(
          'id', top_video.id,
          'title', top_video.title,
          'views', top_video.views
        ) END AS "topVideo"
      FROM users u
      LEFT JOIN user_videos uv ON uv.user_id = u.id
      LEFT JOIN videos v ON v.id = uv.video_id
      LEFT JOIN LATERAL (
        SELECT v_top.id, v_top.title, v_top.views
        FROM user_videos uv_top
        JOIN videos v_top ON v_top.id = uv_top.video_id
        WHERE uv_top.user_id = u.id
        ORDER BY v_top.views DESC, v_top.id ASC
        LIMIT 1
      ) top_video ON true
      GROUP BY u.id, u.name, u.email, u.role, top_video.id, top_video.title, top_video.views
      ORDER BY "totalViews" DESC, "videoCount" DESC, u.id ASC
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT
        p.id,
        p.name,
        COUNT(vp.video_id)::int AS "totalVideos",
        COALESCE(SUM(v.views), 0)::bigint AS "totalViews",
        COALESCE(ROUND(AVG(v.views)), 0)::bigint AS "avgViewsPerVideo"
      FROM products p
      LEFT JOIN video_products vp ON vp.product_id = p.id
      LEFT JOIN videos v ON v.id = vp.video_id
      GROUP BY p.id, p.name
      ORDER BY "totalViews" DESC, p.id ASC
    `, { type: QueryTypes.SELECT }),
  ]);

  return {
    overview: overviewRows[0] || {
      totalUsers: 0,
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
    },
    users: userRows || [],
    products: productRows || [],
  };
}

function formatTopUsers(users) {
  const topUsers = (users || []).slice(0, 5);
  if (!topUsers.length) return '- Chưa có dữ liệu KOC';

  return topUsers
    .map((user, index) => {
      const topVideo = user.topVideo ? `${user.topVideo.title} (${Number(user.topVideo.views || 0).toLocaleString()} views)` : 'chưa có video nổi bật';
      return `${index + 1}. ${user.name} - ${Number(user.totalViews || 0).toLocaleString()} views, ${user.videoCount || 0} video, top video: ${topVideo}`;
    })
    .join('\n');
}

function formatTopProducts(products) {
  const topProducts = (products || []).slice(0, 5);
  if (!topProducts.length) return '- Chưa có dữ liệu sản phẩm';

  return topProducts
    .map((product, index) => `${index + 1}. ${product.name} - ${Number(product.totalViews || 0).toLocaleString()} views từ ${product.totalVideos || 0} video`)
    .join('\n');
}

function buildPrompt(message, snapshot) {
  const overview = snapshot.overview || {};
  return [
    'Bạn là trợ lý phân tích nội bộ cho YUM Network.',
    "Trả lời ngắn gọn, rõ ràng, lịch sự, xưng 'mình' gọi người dùng 'bạn'.",
    'Ưu tiên số liệu, không bịa, nếu thiếu dữ liệu thì nói rõ.',
    'Trình bày câu trả lời bằng markdown nhẹ khi phù hợp, dùng bullet list hoặc in đậm cho ý chính.',
    'Khi phù hợp, hãy đưa ra 1 đến 3 gợi ý hành động cụ thể.',
    '',
    'Dữ liệu KPI hiện có:',
    `- Tổng users: ${Number(overview.totalUsers || 0).toLocaleString()}`,
    `- Tổng videos: ${Number(overview.totalVideos || 0).toLocaleString()}`,
    `- Tổng views: ${Number(overview.totalViews || 0).toLocaleString()}`,
    `- Total likes: ${Number(overview.totalLikes || 0).toLocaleString()}`,
    `- Total comments: ${Number(overview.totalComments || 0).toLocaleString()}`,
    `- Total shares: ${Number(overview.totalShares || 0).toLocaleString()}`,
    '',
    'Top KOC:',
    formatTopUsers(snapshot.users),
    '',
    'Top sản phẩm:',
    formatTopProducts(snapshot.products),
    '',
    `Câu hỏi của người dùng: ${message}`,
  ].join('\n');
}

function formatOverviewAnswer(snapshot) {
  const overview = snapshot.overview || {};
  const topUsers = (snapshot.users || []).slice(0, 3);
  const topProducts = (snapshot.products || []).slice(0, 3);

  const topUserLine = topUsers.length
    ? topUsers.map((user) => `${user.name} (${Number(user.totalViews || 0).toLocaleString()} views)`).join(', ')
    : 'chưa có dữ liệu KOC';

  const topProductLine = topProducts.length
    ? topProducts.map((product) => `${product.name} (${Number(product.totalViews || 0).toLocaleString()} views)`).join(', ')
    : 'chưa có dữ liệu sản phẩm';

  return [
    `Tổng quan hiện tại: ${Number(overview.totalVideos || 0).toLocaleString()} video, ${Number(overview.totalViews || 0).toLocaleString()} views, ${Number(overview.totalLikes || 0).toLocaleString()} likes, ${Number(overview.totalComments || 0).toLocaleString()} comments.`,
    `Nhóm KOC đang nổi bật: ${topUserLine}.`,
    `Sản phẩm đang kéo view tốt: ${topProductLine}.`,
    'Gợi ý: tập trung nhân rộng format của video top đầu, so sánh thêm nhóm video dưới 10k views để tối ưu hook và CTA.',
  ].join(' ');
}

function formatKocAnswer(snapshot) {
  const topUsers = (snapshot.users || []).slice(0, 5);
  if (!topUsers.length) {
    return 'Chưa có đủ dữ liệu để đánh giá KOC. Bạn cần đồng bộ video và assignment trước.';
  }

  const leader = topUsers[0];
  const challengers = topUsers.slice(1, 4);
  const leaderTopVideo = leader.topVideo?.title || 'chưa có top video rõ ràng';

  return [
    `KOC nổi bật nhất hiện tại là ${leader.name} với ${Number(leader.totalViews || 0).toLocaleString()} views từ ${leader.videoCount || 0} video, top video là "${leaderTopVideo}".`,
    challengers.length
      ? `Những KOC bám sát phía sau gồm ${challengers.map((user) => `${user.name} (${Number(user.totalViews || 0).toLocaleString()} views)`).join(', ')}.`
      : 'Hiện chưa có thêm KOC đủ dữ liệu để so sánh sâu.',
    'Gợi ý: ưu tiên phân tích video format, chủ đề và thời điểm đăng của nhóm đầu bảng, sau đó nhân rộng cho các KOC còn lại.',
  ].join(' ');
}

function fallbackAnswer(message, snapshot) {
  const text = String(message || '').toLowerCase();
  if (/(tổng quan|overview|dashboard|report|báo cáo)/.test(text)) {
    return formatOverviewAnswer(snapshot);
  }
  if (/(koc|creator|influencer|đánh giá)/.test(text)) {
    return formatKocAnswer(snapshot);
  }
  return 'Bạn có thể hỏi mình về báo cáo tổng quan hoặc đánh giá KOC.';
}

function cleanAssistantAnswer(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  const cleaned = value.replace(
    /^(?:xin chào|chào bạn|chào mừng bạn|mình xin chào|hello|hi)\s*(?:[,!។.:-]\s*)?/i,
    '',
  ).trim();

  return cleaned || value;
}

async function askAssistant(message) {
  const snapshot = await getKpiSnapshot();
  const runtime = await getRuntime();
  const normalizedMessage = String(message || '').trim();
  const prompt = buildPrompt(normalizedMessage, snapshot);
  const suggestions = ['Báo cáo tổng quan', 'Đánh giá KOC'];
  const systemPrompt = [
    'Bạn là trợ lý phân tích dữ liệu nội bộ cho YUM Network.',
    "Trả lời ngắn gọn, rõ ràng, lịch sự, xưng 'mình' gọi người dùng 'bạn'.",
    'Ưu tiên số liệu, không bịa, nếu thiếu dữ liệu thì nói rõ.',
    'Trình bày câu trả lời bằng markdown nhẹ khi phù hợp, dùng bullet list hoặc in đậm cho ý chính.',
    'Không mở đầu câu trả lời bằng lời chào; đi thẳng vào nội dung.',
    'Khi phù hợp, hãy đưa ra 1 đến 3 gợi ý hành động cụ thể.',
  ].join(' ');
  const userPrompt = [
    buildPrompt(normalizedMessage, snapshot),
    '',
    "Lưu ý: nếu muốn chào, hãy chỉ chào tối đa một lần ở câu đầu; còn lại đi thẳng vào ý chính.",
  ].join('\n');

  if (runtime.provider === 'ollama') {
    try {
      const response = await fetch(`${runtime.ollamaHost.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: runtime.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        const answer = cleanAssistantAnswer(data.message?.content?.trim() || data.response?.trim());
        return {
          answer: answer || fallbackAnswer(normalizedMessage, snapshot),
          suggestions,
        };
      }
    } catch (error) {
      console.error('Assistant Ollama error:', error.message);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${runtime.model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
            ],
            generationConfig: { maxOutputTokens: 320, temperature: 0.5 },
          }),
        },
      );
      const data = await response.json();
      if (response.ok) {
        const answer = cleanAssistantAnswer(data.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
        return {
          answer: answer || fallbackAnswer(normalizedMessage, snapshot),
          suggestions,
        };
      }
      console.error('Assistant Gemini error:', JSON.stringify(data));
    } catch (error) {
      console.error('Assistant Gemini error:', error.message);
    }
  }

  return {
    answer: fallbackAnswer(normalizedMessage, snapshot),
    suggestions,
  };
}

async function readStreamLines(response, onLine) {
  if (!response.body) throw new Error('Provider did not return a readable stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) onLine(line);
    if (done) break;
  }
  if (buffer.trim()) onLine(buffer);
}

async function streamAssistantAnswer(message, onDelta) {
  const snapshot = await getKpiSnapshot();
  const runtime = await getRuntime();
  const normalizedMessage = String(message || '').trim();
  const systemPrompt = [
    'Bạn là trợ lý phân tích dữ liệu nội bộ cho YUM Network.',
    "Trả lời ngắn gọn, rõ ràng, lịch sự, xưng 'mình' gọi người dùng 'bạn'.",
    'Ưu tiên số liệu, không bịa, nếu thiếu dữ liệu thì nói rõ.',
    'Trình bày câu trả lời bằng markdown nhẹ khi phù hợp.',
    'Không mở đầu câu trả lời bằng lời chào; đi thẳng vào nội dung.',
  ].join(' ');
  const userPrompt = buildPrompt(normalizedMessage, snapshot);
  let receivedText = false;

  if (runtime.provider === 'ollama') {
    try {
      const response = await fetch(`${runtime.ollamaHost.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: runtime.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: true,
        }),
      });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      await readStreamLines(response, (line) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        const delta = event.message?.content || event.response || '';
        if (delta) {
          receivedText = true;
          onDelta(delta);
        }
      });
      if (receivedText) return;
    } catch (error) {
      console.error('Assistant Ollama stream error:', error.message);
      if (receivedText) return;
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${runtime.model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { maxOutputTokens: 320, temperature: 0.5 },
          }),
        },
      );
      if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
      await readStreamLines(response, (line) => {
        if (!line.startsWith('data:')) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        const event = JSON.parse(payload);
        const delta = event.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
        if (delta) {
          receivedText = true;
          onDelta(delta);
        }
      });
      if (receivedText) return;
    } catch (error) {
      console.error('Assistant Gemini stream error:', error.message);
      if (receivedText) return;
    }
  }

  const fallback = fallbackAnswer(normalizedMessage, snapshot);
  for (const delta of fallback.match(/.{1,18}(?:\s+|$)/gs) || [fallback]) {
    onDelta(delta);
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
}

async function chat(req, res) {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ message: 'message is required' });
  }

  try {
    return res.json(await askAssistant(message));
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to generate assistant response' });
  }
}

async function chatStream(req, res) {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ message: 'message is required' });
  }

  res.status(200);
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  try {
    await streamAssistantAnswer(message, (delta) => {
      if (res.destroyed) return;
      res.write(`${JSON.stringify({ type: 'delta', delta })}\n`);
      if (typeof res.flush === 'function') res.flush();
    });

    if (res.destroyed) return undefined;
    res.write(`${JSON.stringify({ type: 'done' })}\n`);
    return res.end();
  } catch (error) {
    res.write(`${JSON.stringify({ type: 'error', message: error.message || 'Failed to generate assistant response' })}\n`);
    return res.end();
  }
}

module.exports = {
  chat,
  chatStream,
};
