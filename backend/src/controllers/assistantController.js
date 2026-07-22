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
  const [overviewRows, userRows, productRows, bookingRows] = await Promise.all([
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
    sequelize.query(`
      SELECT
        b.id,
        b.creator_id AS "creatorId",
        b.creator_open_id AS "creatorOpenId",
        b.creator_username AS username,
        COALESCE(NULLIF(b.creator_name, ''), NULLIF(creator.name, ''), NULLIF(b.creator_username, ''), 'KOC') AS "creatorName",
        b.target_shop_id AS "shopId",
        b.staff_name AS "staffName",
        b.booking_cost AS "bookingCost",
        b.status,
        b.deadline,
        b.note,
        b.video_url AS "videoUrl",
        b.posted_at AS "postedAt",
        b.created_at AS "createdAt",
        b.updated_at AS "updatedAt",
        performance.start_date AS "performanceStartDate",
        performance.end_date AS "performanceEndDate",
        performance.currency AS "performanceCurrency",
        performance.affiliate_gmv AS "affiliateGmv",
        performance.video_gmv AS "videoGmv",
        performance.live_gmv AS "liveGmv",
        performance.affiliate_orders AS "affiliateOrders",
        performance.items_sold AS "itemsSold",
        performance.video_views AS "videoViews",
        performance.shoppable_videos AS "shoppableVideos"
      FROM bookings b
      LEFT JOIN users creator ON creator.id = b.creator_id
      LEFT JOIN LATERAL (
        SELECT snapshot.*
        FROM tiktok_creator_performance_snapshots snapshot
        WHERE (b.target_shop_id IS NULL OR snapshot.shop_id = b.target_shop_id)
          AND (
            (b.creator_open_id IS NOT NULL AND snapshot.creator_open_id = b.creator_open_id)
            OR (b.creator_username IS NOT NULL AND LOWER(snapshot.username) = LOWER(b.creator_username))
          )
        ORDER BY snapshot.end_date DESC, snapshot.synced_at DESC, snapshot.id DESC
        LIMIT 1
      ) performance ON TRUE
      ORDER BY b.updated_at DESC NULLS LAST, b.id DESC
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
    bookings: bookingRows || [],
  };
}

const BOOKING_STATUS_LABELS = {
  draft: 'Nháp',
  booked: 'Đã booking',
  waiting_video: 'Chờ video',
  video_posted: 'Đã đăng',
  done: 'Hoàn tất',
  cancelled: 'Đã hủy',
};
const TERMINAL_BOOKING_STATUSES = new Set(['done', 'cancelled']);

function bookingIsOverdue(booking, now = Date.now()) {
  if (!booking.deadline || TERMINAL_BOOKING_STATUSES.has(booking.status)) return false;
  return new Date(`${booking.deadline}T23:59:59`).getTime() < now;
}

function summarizeBookingKocs(bookings) {
  const kocs = new Map();
  for (const booking of bookings || []) {
    const key = booking.creatorOpenId
      || (booking.username ? `username:${String(booking.username).toLowerCase()}` : null)
      || (booking.creatorId ? `user:${booking.creatorId}` : `name:${booking.creatorName}`);
    if (!kocs.has(key)) {
      kocs.set(key, {
        name: booking.creatorName || booking.username || 'KOC',
        username: booking.username || null,
        bookingCount: 0,
        totalCost: 0,
        activeCount: 0,
        overdueCount: 0,
        statuses: {},
        nearestDeadline: null,
        performance: null,
      });
    }
    const item = kocs.get(key);
    item.bookingCount += 1;
    item.totalCost += Number(booking.bookingCost || 0);
    item.statuses[booking.status] = (item.statuses[booking.status] || 0) + 1;
    if (!TERMINAL_BOOKING_STATUSES.has(booking.status)) item.activeCount += 1;
    if (bookingIsOverdue(booking)) item.overdueCount += 1;
    if (booking.deadline && (!item.nearestDeadline || booking.deadline < item.nearestDeadline)) {
      item.nearestDeadline = booking.deadline;
    }
    if (!item.performance && booking.performanceEndDate) {
      item.performance = {
        startDate: booking.performanceStartDate,
        endDate: booking.performanceEndDate,
        currency: booking.performanceCurrency,
        affiliateGmv: Number(booking.affiliateGmv || 0),
        videoGmv: Number(booking.videoGmv || 0),
        liveGmv: Number(booking.liveGmv || 0),
        affiliateOrders: Number(booking.affiliateOrders || 0),
        itemsSold: Number(booking.itemsSold || 0),
        videoViews: Number(booking.videoViews || 0),
        shoppableVideos: Number(booking.shoppableVideos || 0),
      };
    }
  }
  return [...kocs.values()].sort((left, right) => (
    right.totalCost - left.totalCost || right.bookingCount - left.bookingCount || left.name.localeCompare(right.name)
  ));
}

function formatBookingContext(bookings) {
  if (!bookings?.length) return '- Chưa có dữ liệu Booking.';
  const kocs = summarizeBookingKocs(bookings);
  const totalCost = bookings.reduce((sum, booking) => sum + Number(booking.bookingCost || 0), 0);
  const active = bookings.filter((booking) => !TERMINAL_BOOKING_STATUSES.has(booking.status)).length;
  const overdue = bookings.filter((booking) => bookingIsOverdue(booking)).length;
  const completed = bookings.filter((booking) => booking.status === 'done').length;
  const kocLines = kocs.slice(0, 30).map((koc, index) => {
    const statuses = Object.entries(koc.statuses)
      .map(([status, count]) => `${BOOKING_STATUS_LABELS[status] || status}: ${count}`)
      .join(', ');
    const performance = koc.performance
      ? `; hiệu suất creator ${koc.performance.startDate}–${koc.performance.endDate}: GMV ${koc.performance.affiliateGmv.toLocaleString()} ${koc.performance.currency || ''}, ${koc.performance.affiliateOrders.toLocaleString()} đơn, ${koc.performance.itemsSold.toLocaleString()} sản phẩm, ${koc.performance.videoViews.toLocaleString()} video views`
      : '; chưa khớp được Creator Performance';
    return `${index + 1}. ${koc.name}${koc.username ? ` (@${koc.username})` : ''}: ${koc.bookingCount} booking, cost RM ${koc.totalCost.toLocaleString()}, active ${koc.activeCount}, quá hạn ${koc.overdueCount}, trạng thái [${statuses}]${performance}`;
  });
  const recentLines = bookings.slice(0, 50).map((booking) => {
    const note = String(booking.note || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    return `- #${booking.id} ${booking.creatorName}${booking.username ? ` (@${booking.username})` : ''}: RM ${Number(booking.bookingCost || 0).toLocaleString()}, ${BOOKING_STATUS_LABELS[booking.status] || booking.status}, deadline ${booking.deadline || 'chưa có'}${bookingIsOverdue(booking) ? ' (QUÁ HẠN)' : ''}, staff ${booking.staffName || 'chưa gán'}${note ? `, ghi chú: ${note}` : ''}`;
  });
  return [
    `- Tổng booking: ${bookings.length}; KOC có booking: ${kocs.length}; đang hoạt động: ${active}; hoàn tất: ${completed}; quá hạn: ${overdue}; tổng booking cost: RM ${totalCost.toLocaleString()}.`,
    '- Tổng hợp theo KOC:',
    ...kocLines,
    '- Booking gần đây:',
    ...recentLines,
  ].join('\n');
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
    'Dữ liệu trang Booking và Creator Performance khớp theo creator:',
    formatBookingContext(snapshot.bookings),
    '',
    'Quy tắc diễn giải Booking:',
    '- booking_cost là chi phí booking được nhập trên trang Booking, đơn vị RM.',
    '- Creator Performance là hiệu suất tổng của creator trong kỳ ghi rõ, không mặc định là kết quả trực tiếp của một Booking.',
    '- Không tính ROI/ROAS của Booking nếu chưa có video hoặc doanh thu được liên kết trực tiếp với Booking; khi đó chỉ được gọi là chỉ số tham khảo.',
    '- Đánh giá vận hành dựa trên trạng thái, deadline, quá hạn, cost và ghi chú. Không xem Target Collaboration là bằng chứng creator đã được thuê.',
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
  if (snapshot.bookings?.length) return formatBookingAnswer(snapshot);
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

function formatBookingAnswer(snapshot) {
  const bookings = snapshot.bookings || [];
  if (!bookings.length) {
    return 'Chưa có dữ liệu Booking để đánh giá KOC. Bạn cần tạo Booking và cập nhật cost, trạng thái, deadline trước.';
  }
  const kocs = summarizeBookingKocs(bookings);
  const totalCost = bookings.reduce((sum, booking) => sum + Number(booking.bookingCost || 0), 0);
  const overdueKocs = kocs.filter((koc) => koc.overdueCount > 0);
  const highestSpend = kocs[0];
  const performanceLine = highestSpend.performance
    ? `Hiệu suất tổng gần nhất của creator này trong kỳ ${highestSpend.performance.startDate}–${highestSpend.performance.endDate}: GMV ${highestSpend.performance.affiliateGmv.toLocaleString()} ${highestSpend.performance.currency || ''}, ${highestSpend.performance.affiliateOrders.toLocaleString()} đơn và ${highestSpend.performance.videoViews.toLocaleString()} video views.`
    : 'Creator này chưa khớp được dữ liệu Creator Performance gần nhất.';
  return [
    `Hiện có ${bookings.length} Booking của ${kocs.length} KOC, tổng booking cost RM ${totalCost.toLocaleString()}.`,
    `KOC có tổng chi phí cao nhất là ${highestSpend.name}${highestSpend.username ? ` (@${highestSpend.username})` : ''}: RM ${highestSpend.totalCost.toLocaleString()} qua ${highestSpend.bookingCount} booking, trong đó ${highestSpend.activeCount} đang hoạt động.`,
    overdueKocs.length
      ? `Cần ưu tiên xử lý ${overdueKocs.length} KOC có Booking quá hạn: ${overdueKocs.slice(0, 5).map((koc) => `${koc.name} (${koc.overdueCount})`).join(', ')}.`
      : 'Không có Booking đang hoạt động bị quá hạn.',
    performanceLine,
    'Lưu ý: số liệu GMV/view trên là hiệu suất tổng của creator, chưa phải ROI trực tiếp của Booking vì hệ thống chưa liên kết doanh thu với từng Booking.',
  ].join(' ');
}

function fallbackAnswer(message, snapshot) {
  const text = String(message || '').toLowerCase();
  if (/(booking|chi phí|cost|deadline|quá hạn)/.test(text)) {
    return formatBookingAnswer(snapshot);
  }
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
  const suggestions = ['Đánh giá KOC theo Booking', 'Booking quá hạn', 'Tổng chi phí Booking'];
  const systemPrompt = [
    'Bạn là trợ lý phân tích dữ liệu nội bộ cho YUM Network.',
    "Trả lời ngắn gọn, rõ ràng, lịch sự, xưng 'mình' gọi người dùng 'bạn'.",
    'Ưu tiên số liệu, không bịa, nếu thiếu dữ liệu thì nói rõ.',
    'Trình bày câu trả lời bằng markdown nhẹ khi phù hợp, dùng bullet list hoặc in đậm cho ý chính.',
    'Không mở đầu câu trả lời bằng lời chào; đi thẳng vào nội dung.',
    'Khi phù hợp, hãy đưa ra 1 đến 3 gợi ý hành động cụ thể.',
    'Khi đánh giá KOC, phải ưu tiên dữ liệu Booking; không được xem hiệu suất tổng của creator là doanh thu trực tiếp từ Booking.',
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
    'Khi đánh giá KOC, phải ưu tiên dữ liệu Booking; không được xem hiệu suất tổng của creator là doanh thu trực tiếp từ Booking.',
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
  __test: {
    bookingIsOverdue,
    summarizeBookingKocs,
    formatBookingContext,
    formatBookingAnswer,
    getKpiSnapshot,
  },
};
