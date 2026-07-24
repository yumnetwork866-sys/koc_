const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const {
  Booking,
  BookingVideo,
  BookingVideoPerformanceSnapshot,
  User,
  WeeklyReport,
  sequelize,
} = require('../models');
const { serializeBookingWithActual } = require('../services/bookingVideoPerformanceService');

const toDateOnly = (date) => date.toISOString().slice(0, 10);
const REPORT_OLLAMA_HOST = String(
  process.env.REPORT_OLLAMA_HOST
    || process.env.AI_CHAT_OLLAMA_HOST
    || process.env.OLLAMA_HOST
    || 'http://127.0.0.1:11434',
).trim().replace(/\/+$/, '');
const REPORT_OLLAMA_MODEL = String(
  process.env.REPORT_OLLAMA_MODEL
    || process.env.AI_CHAT_MODEL
    || 'llama3.1:8b',
).trim().replace(/^ollama:/i, '');
const REPORT_OLLAMA_TIMEOUT_MS = Math.max(1000, Number(process.env.REPORT_OLLAMA_TIMEOUT_MS) || 90000);
const toNumbers = (row, fields) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? Number(value) : value]),
);
const number = (value) => Number(value || 0);
const formatNumber = (value) => number(value).toLocaleString('vi-VN');
const normalizeAiContent = (value) => String(value || '')
  .trim()
  .replace(/^```(?:markdown|md)?\s*/i, '')
  .replace(/\s*```$/, '')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .trim();

const validateReportPeriod = (startValue, endValue) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const startText = String(startValue || '');
  const endText = String(endValue || '');
  if (!datePattern.test(startText) || !datePattern.test(endText)) {
    const error = new Error('Khoảng thời gian báo cáo không hợp lệ.');
    error.status = 400;
    throw error;
  }

  const start = new Date(`${startText}T00:00:00.000Z`);
  const end = new Date(`${endText}T23:59:59.999Z`);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || toDateOnly(start) !== startText
    || toDateOnly(end) !== endText
    || start > end
  ) {
    const error = new Error('Khoảng thời gian báo cáo không hợp lệ.');
    error.status = 400;
    throw error;
  }
  if ((end.getTime() - start.getTime()) / 86400000 > 366) {
    const error = new Error('Khoảng thời gian báo cáo không được vượt quá 366 ngày.');
    error.status = 400;
    throw error;
  }
  return { start, end, startText, endText };
};

const buildKocReportSnapshot = (bookings, startText, endText) => {
  const activeCollaborationStatuses = new Set(['ONGOING', 'VALID', 'EXPIRING']);
  const terminalBookingStatuses = new Set(['done', 'cancelled']);
  const endOfPeriod = new Date(`${endText}T23:59:59.999Z`);
  const kocStats = new Map();
  let activeCollaborations = 0;
  let performanceEvaluations = 0;

  bookings.forEach((booking) => {
    const evaluation = booking.evaluation_snapshot || {};
    const performance = evaluation.performance || null;
    const collaboration = evaluation.collaboration || null;
    const identity = String(
      booking.creator_open_id
        || (booking.creator_username ? `username:${booking.creator_username.toLowerCase()}` : '')
        || (booking.creator_id ? `user:${booking.creator_id}` : '')
        || `booking:${booking.id}`,
    );
    if (!kocStats.has(identity)) {
      kocStats.set(identity, {
        identity,
        name: booking.creator_name || booking.creator_username || 'KOC',
        username: booking.creator_username || null,
        bookings: 0,
        bookingCost: 0,
        activeBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        overdueBookings: 0,
        statuses: {},
        latestPerformance: null,
        actualGrossGmv: 0,
        actualNetGmv: 0,
        actualNetGmvAvailable: true,
        actualOrders: 0,
        actualViews: 0,
        attributedVideos: 0,
        evaluations: [],
      });
    }
    const current = kocStats.get(identity);
    const bookingCost = number(booking.booking_cost);
    const videoViews = number(performance?.video_views);
    const affiliateOrders = number(performance?.affiliate_orders);
    const affiliateGmv = number(performance?.affiliate_gmv);
    const benchmark = {
      costPerThousandViews: videoViews > 0 ? Number((bookingCost / videoViews * 1000).toFixed(2)) : null,
      costPerOrder: affiliateOrders > 0 ? Number((bookingCost / affiliateOrders).toFixed(2)) : null,
      costToHistoricalGmvRate: affiliateGmv > 0 ? Number((bookingCost / affiliateGmv * 100).toFixed(2)) : null,
    };
    const actual = booking.actual_performance || {};

    current.bookings += 1;
    current.bookingCost += bookingCost;
    current.statuses[booking.status] = (current.statuses[booking.status] || 0) + 1;
    if (!terminalBookingStatuses.has(booking.status)) current.activeBookings += 1;
    if (['video_posted', 'done'].includes(booking.status)) current.completedBookings += 1;
    if (booking.status === 'cancelled') current.cancelledBookings += 1;
    const overdue = Boolean(
      booking.deadline
      && !terminalBookingStatuses.has(booking.status)
      && new Date(`${booking.deadline}T23:59:59.999Z`) < endOfPeriod
    );
    if (overdue) current.overdueBookings += 1;
    if (activeCollaborationStatuses.has(String(collaboration?.status || '').toUpperCase())) {
      activeCollaborations += 1;
    }
    if (performance) performanceEvaluations += 1;
    current.actualGrossGmv += number(actual.gross_gmv);
    current.actualOrders += number(actual.orders);
    current.actualViews += number(actual.views);
    current.attributedVideos += number(actual.video_count);
    if (actual.net_gmv === null || actual.net_gmv === undefined) current.actualNetGmvAvailable = false;
    else current.actualNetGmv += number(actual.net_gmv);

    const normalizedPerformance = performance ? {
      startDate: performance.start_date || null,
      endDate: performance.end_date || null,
      currency: performance.currency || null,
      affiliateGmv,
      affiliateOrders,
      itemsSold: number(performance.items_sold),
      videoViews,
      shoppableVideos: number(performance.shoppable_videos),
      ctr: number(performance.ctr),
      ctor: number(performance.ctor),
      estimatedCommission: number(performance.estimated_commission),
      syncedAt: performance.synced_at || null,
    } : null;
    const latestEndDate = current.latestPerformance?.endDate || '';
    if (normalizedPerformance && String(normalizedPerformance.endDate || '') >= String(latestEndDate)) {
      current.latestPerformance = normalizedPerformance;
    }
    current.evaluations.push({
      bookingId: booking.id,
      bookingCost,
      status: booking.status,
      deadline: booking.deadline,
      overdue,
      collaboration: collaboration ? {
        name: collaboration.name || null,
        status: collaboration.status || null,
        endAt: collaboration.end_at || null,
      } : null,
      performance: normalizedPerformance,
      benchmark,
      actual: {
        status: actual.status || 'AWAITING_VIDEO',
        videoCount: number(actual.video_count),
        grossGmv: number(actual.gross_gmv),
        refundedGmv: actual.refunded_gmv ?? null,
        netGmv: actual.net_gmv ?? null,
        orders: number(actual.orders),
        views: number(actual.views),
        grossRoas: actual.gross_roas ?? null,
        netRoas: actual.net_roas ?? null,
        roi: null,
        roiStatus: 'MISSING_COST_DATA',
      },
    });
  });

  const rankings = Array.from(kocStats.values()).map((koc) => ({
      ...koc,
      bookingCompletionRate: koc.bookings
        ? Number(((koc.completedBookings / koc.bookings) * 100).toFixed(1))
        : 0,
      averageBookingCost: koc.bookings ? Math.round(koc.bookingCost / koc.bookings) : 0,
      actualGrossRoas: koc.bookingCost > 0 && koc.attributedVideos
        ? Number((koc.actualGrossGmv / koc.bookingCost).toFixed(2))
        : null,
      actualNetRoas: koc.bookingCost > 0 && koc.attributedVideos && koc.actualNetGmvAvailable
        ? Number((koc.actualNetGmv / koc.bookingCost).toFixed(2))
        : null,
    })).sort((a, b) => (
      b.actualGrossGmv - a.actualGrossGmv
      || number(b.latestPerformance?.affiliateGmv) - number(a.latestPerformance?.affiliateGmv)
      || b.bookingCost - a.bookingCost
      || a.name.localeCompare(b.name)
    ));
  const totalBookingCost = rankings.reduce((sum, koc) => sum + koc.bookingCost, 0);
  const completedBookings = rankings.reduce((sum, koc) => sum + koc.completedBookings, 0);
  const overdueBookings = rankings.reduce((sum, koc) => sum + koc.overdueBookings, 0);
  const actualGrossGmv = rankings.reduce((sum, koc) => sum + koc.actualGrossGmv, 0);
  const attributedVideos = rankings.reduce((sum, koc) => sum + koc.attributedVideos, 0);

  return {
    period: { start: startText, end: endText },
    bookingCurrency: 'MYR',
    overview: {
      evaluations: bookings.length,
      totalKocs: rankings.length,
      activeCollaborations,
      performanceCoverage: bookings.length
        ? Number(((performanceEvaluations / bookings.length) * 100).toFixed(1))
        : 0,
      bookings: bookings.length,
      bookingCost: totalBookingCost,
      completedBookings,
      overdueBookings,
      bookingCompletionRate: bookings.length
        ? Number(((completedBookings / bookings.length) * 100).toFixed(1))
        : 0,
      attributedVideos,
      actualGrossGmv,
      actualGrossRoas: totalBookingCost > 0 && attributedVideos
        ? Number((actualGrossGmv / totalBookingCost).toFixed(2))
        : null,
    },
    kocs: rankings,
  };
};

const buildKocFactualReport = (snapshot) => {
  const {
    period,
    overview,
    kocs,
  } = snapshot;
  const formatBenchmark = (benchmark) => {
    const values = [
      benchmark.costPerThousandViews == null
        ? '—/1K views'
        : `RM ${formatNumber(benchmark.costPerThousandViews)}/1K views`,
      benchmark.costPerOrder == null
        ? '—/đơn'
        : `RM ${formatNumber(benchmark.costPerOrder)}/đơn`,
      benchmark.costToHistoricalGmvRate == null
        ? '—% GMV lịch sử'
        : `${benchmark.costToHistoricalGmvRate.toLocaleString('vi-VN')}% GMV lịch sử`,
    ];
    return values.join(' · ');
  };
  return [
    'BÁO CÁO ĐÁNH GIÁ HIỆU QUẢ KOC',
    `Kỳ đánh giá: ${period.start} - ${period.end}`,
    '',
    'TỔNG QUAN',
    `- Đánh giá booking trong kỳ: ${formatNumber(overview.evaluations)}`,
    `- KOC được đánh giá: ${formatNumber(overview.totalKocs)}`,
    `- Hợp tác đang hoạt động: ${formatNumber(overview.activeCollaborations)}`,
    `- Độ phủ Creator Performance: ${overview.performanceCoverage.toLocaleString('vi-VN')}%`,
    `- Tổng chi phí booking: RM ${formatNumber(overview.bookingCost)}`,
    `- Booking quá hạn: ${formatNumber(overview.overdueBookings)}`,
    `- Video đã quy gán: ${formatNumber(overview.attributedVideos)}`,
    `- Gross GMV thực tế từ video: RM ${formatNumber(overview.actualGrossGmv)}`,
    `- Gross ROAS thực tế: ${overview.actualGrossRoas == null ? 'Chưa đủ dữ liệu' : `${overview.actualGrossRoas.toLocaleString('vi-VN')}x`}`,
    '',
    'ĐÁNH GIÁ THEO KOC',
    kocs.length ? kocs.map((koc, index) => {
      const performance = koc.latestPerformance;
      const latestEvaluation = koc.evaluations[0];
      return [
        `${index + 1}. ${koc.name}`,
        `   Booking: ${formatNumber(koc.bookings)} đánh giá · chi phí RM ${formatNumber(koc.bookingCost)} · quá hạn ${formatNumber(koc.overdueBookings)}`,
        performance
          ? `   Creator Performance (${performance.startDate || '—'} - ${performance.endDate || '—'}): GMV ${formatNumber(performance.affiliateGmv)} ${performance.currency || ''} · ${formatNumber(performance.affiliateOrders)} đơn · ${formatNumber(performance.videoViews)} video views · ${formatNumber(performance.shoppableVideos)} video có gắn sản phẩm`
          : '   Creator Performance: Chưa có dữ liệu.',
        !latestEvaluation || Object.values(latestEvaluation.benchmark).every((value) => value == null)
          ? '   Benchmark chi phí: Chưa đủ dữ liệu.'
          : `   Benchmark chi phí: ${formatBenchmark(latestEvaluation.benchmark)}`,
        koc.attributedVideos
          ? `   Kết quả thực tế (${formatNumber(koc.attributedVideos)} video): Gross GMV RM ${formatNumber(koc.actualGrossGmv)} · ${formatNumber(koc.actualOrders)} đơn · Gross ROAS ${koc.actualGrossRoas == null ? '—' : `${koc.actualGrossRoas.toLocaleString('vi-VN')}x`} · Net ROAS ${koc.actualNetRoas == null ? 'chờ dữ liệu hoàn trả' : `${koc.actualNetRoas.toLocaleString('vi-VN')}x`} · ROI chưa đủ dữ liệu giá vốn`
          : '   Kết quả thực tế: Chưa liên kết video booking.',
      ].join('\n');
    }).join('\n\n') : '- Chưa có đánh giá booking trong khoảng thời gian đã chọn.',
    '',
    'LƯU Ý DỮ LIỆU',
    '- Nguồn dữ liệu giống page Quản lý booking: booking có evaluation_snapshot, lọc theo ngày tạo trong kỳ.',
    '- Creator Performance là dữ liệu tổng của KOC được lưu tại lúc tạo đánh giá, không phải kết quả trực tiếp hay ROI của booking.',
    '- Kết quả thực tế chỉ lấy snapshot của video đã liên kết trong cửa sổ ghi nhận 30 ngày.',
    '- ROI không được tính khi chưa có giá vốn và các chi phí liên quan.',
  ].join('\n');
};

const generateOllamaAnalysis = async (snapshot) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REPORT_OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${REPORT_OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: REPORT_OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          {
            role: 'system',
            content: [
              'Bạn là chuyên gia đánh giá hiệu quả KOC cho YUM Network.',
              'Chỉ sử dụng đúng dữ liệu JSON được cung cấp, tuyệt đối không tự tạo số liệu hoặc suy đoán doanh thu.',
              'Viết tiếng Việt dạng văn bản thuần, ngắn gọn, gồm ba phần: "ĐIỂM NỔI BẬT", "ĐIỂM CẦN CẢI THIỆN", "ĐỀ XUẤT HÀNH ĐỘNG".',
              'Tách rõ benchmark trước booking và kết quả thực tế sau booking.',
              'Benchmark dùng Creator Performance lịch sử. Kết quả thực tế chỉ dùng actual của video đã liên kết: Gross/Net GMV, đơn hàng, views và Gross/Net ROAS.',
              'Không được xem Creator Performance tổng là kết quả trực tiếp hay ROI của booking.',
              'Không gọi ROAS là ROI. Nếu ROI có trạng thái MISSING_COST_DATA thì phải nói chưa đủ giá vốn và chi phí để tính ROI.',
              'Nếu thiếu Creator Performance, benchmark, refund hoặc actual thì nói rõ giới hạn, không đưa kết luận vô căn cứ.',
              'Không lặp lại toàn bộ bảng KPI và không thêm lời chào.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Đánh giá hiệu quả KOC từ snapshot sau:\n${JSON.stringify(snapshot)}`,
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Ollama trả về HTTP ${response.status}`);
    }
    const content = normalizeAiContent(payload.message?.content || payload.response);
    if (!content) throw new Error('Ollama không trả về nội dung phân tích.');
    return content;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Ollama không phản hồi sau ${REPORT_OLLAMA_TIMEOUT_MS / 1000} giây.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const getReports = async (req, res) => {
  try {
    const reports = await WeeklyReport.findAll({
      order: [['week_start', 'DESC'], ['id', 'DESC']],
    });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReportById = async (req, res) => {
  try {
    const report = await WeeklyReport.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Weekly report not found' });
    }
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const shareReport = async (req, res) => {
  try {
    const report = await WeeklyReport.findByPk(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    if (!report.public_share_token) {
      report.public_share_token = crypto.randomBytes(24).toString('hex');
      await report.save();
    }
    res.json({ share_token: report.public_share_token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPublicReport = async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!/^[a-f0-9]{48}$/i.test(token)) {
      return res.status(404).json({ message: 'Shared report not found' });
    }
    const report = await WeeklyReport.findOne({
      where: { public_share_token: token },
      attributes: ['id', 'week_start', 'week_end', 'generated_content'],
    });
    if (!report) return res.status(404).json({ message: 'Shared report not found' });
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createReport = async (req, res) => {
  try {
    const report = await WeeklyReport.create(req.body);
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateReport = async (req, res) => {
  try {
    const [updated] = await WeeklyReport.update(req.body, {
      where: { id: req.params.id },
    });
    if (!updated) {
      return res.status(404).json({ message: 'Weekly report not found' });
    }

    const report = await WeeklyReport.findByPk(req.params.id);
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const deleted = await WeeklyReport.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Weekly report not found' });
    }

    res.json({ message: 'Weekly report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getKpis = async (req, res) => {
  try {
    const role = req.query.role ? String(req.query.role).trim().toLowerCase() : '';
    const roleFilterSql = role === 'koc' ? 'WHERE role = :role' : '';
    const userFilterSql = role === 'koc' ? 'WHERE u.role = :role' : '';
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start_date || '')) ? req.query.start_date : null;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end_date || '')) ? req.query.end_date : null;
    const videoDateSql = `${startDate ? ' AND v.published_at::date >= :startDate' : ''}${endDate ? ' AND v.published_at::date <= :endDate' : ''}`;
    const topVideoDateSql = `${startDate ? ' AND v_top.published_at::date >= :startDate' : ''}${endDate ? ' AND v_top.published_at::date <= :endDate' : ''}`;
    const statsDateSql = `${startDate ? ' AND vds.date >= :startDate' : ''}${endDate ? ' AND vds.date <= :endDate' : ''}`;
    const replacements = { ...(role === 'koc' ? { role } : {}), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };

    const [overviewRows, userKpis, productKpis, weeklyViews, topVideos] = await Promise.all([
      sequelize.query(`
        SELECT
          (SELECT COUNT(*) FROM users ${roleFilterSql})::int AS "totalUsers",
          COUNT(*)::int AS "totalVideos",
          COALESCE(SUM(views), 0)::bigint AS "totalViews",
          COALESCE(SUM(likes), 0)::bigint AS "totalLikes",
          COALESCE(SUM(comments), 0)::bigint AS "totalComments",
          COALESCE(SUM(shares), 0)::bigint AS "totalShares"
        FROM videos
      `, { type: QueryTypes.SELECT, replacements }),
      sequelize.query(`
        WITH user_videos AS (
          SELECT DISTINCT user_id, video_id
          FROM video_assignments
          UNION
          SELECT tc.creator_id AS user_id, v.id AS video_id
          FROM tiktok_channels tc
          JOIN videos v ON v.channel_id = tc.id
          WHERE tc.creator_id IS NOT NULL
        ),
        video_product_counts AS (
          SELECT video_id, COUNT(*)::int AS product_count
          FROM video_products
          GROUP BY video_id
        ),
        period_bounds AS (
          SELECT MAX(published_at::date) AS max_date
          FROM videos
          WHERE published_at IS NOT NULL
        ),
        periods AS (
          SELECT
            max_date AS current_end,
            (max_date - INTERVAL '6 days')::date AS current_start,
            (max_date - INTERVAL '13 days')::date AS previous_start,
            (max_date - INTERVAL '7 days')::date AS previous_end
          FROM period_bounds
          WHERE max_date IS NOT NULL
        )
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          COUNT(v.id)::int AS "videoCount",
          COUNT(DISTINCT v.id) FILTER (WHERE COALESCE(vpc.product_count, 0) > 0)::int AS "productVideoCount",
          COALESCE(SUM(v.views), 0)::bigint AS "totalViews",
          COALESCE(SUM(v.likes), 0)::bigint AS "totalLikes",
          COALESCE(SUM(v.comments), 0)::bigint AS "totalComments",
          COALESCE(SUM(v.shares), 0)::bigint AS "totalShares",
          COALESCE(ROUND(AVG(v.views)), 0)::bigint AS "avgViewsPerVideo",
          COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE v.views >= 10000) / NULLIF(COUNT(v.id), 0)), 0)::int AS "over10kRate",
          COALESCE(SUM(CASE WHEN p.current_start IS NOT NULL AND v.published_at::date BETWEEN p.current_start AND p.current_end THEN v.views ELSE 0 END), 0)::bigint AS "currentPeriodViews",
          COALESCE(SUM(CASE WHEN p.previous_start IS NOT NULL AND v.published_at::date BETWEEN p.previous_start AND p.previous_end THEN v.views ELSE 0 END), 0)::bigint AS "previousPeriodViews",
          CASE WHEN top_video.id IS NULL THEN NULL ELSE json_build_object(
            'id', top_video.id,
            'title', top_video.title,
            'views', top_video.views
          ) END AS "topVideo"
        FROM users u
        LEFT JOIN user_videos uv ON uv.user_id = u.id
        LEFT JOIN videos v ON v.id = uv.video_id${videoDateSql}
        LEFT JOIN video_product_counts vpc ON vpc.video_id = uv.video_id
        LEFT JOIN periods p ON true
        LEFT JOIN LATERAL (
          SELECT v_top.id, v_top.title, v_top.views
          FROM user_videos uv_top
          JOIN videos v_top ON v_top.id = uv_top.video_id
          WHERE uv_top.user_id = u.id
          ${topVideoDateSql}
          ORDER BY v_top.views DESC, v_top.id ASC
          LIMIT 1
        ) top_video ON true
        ${userFilterSql}
        GROUP BY u.id, u.name, u.email, u.role, top_video.id, top_video.title, top_video.views
        ORDER BY u.id ASC
      `, { type: QueryTypes.SELECT, replacements }),
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
        ORDER BY p.id ASC
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        WITH koc_videos AS (
          SELECT DISTINCT va.video_id
          FROM video_assignments va
          JOIN users u ON u.id = va.user_id
          WHERE u.role = 'koc'
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN users u ON u.id = tc.creator_id AND u.role = 'koc'
          JOIN videos v ON v.channel_id = tc.id
        ), snapshots AS (
          SELECT vds.video_id, vds.date, MAX(vds.views)::bigint AS views
          FROM koc_videos kv
          JOIN video_daily_stats vds ON vds.video_id = kv.video_id
          GROUP BY vds.video_id, vds.date
        ), gains AS (
          SELECT video_id, date, GREATEST(views - COALESCE(LAG(views) OVER (PARTITION BY video_id ORDER BY date), views), 0) AS views
          FROM snapshots
        )
        SELECT date_trunc('week', date)::date AS week, COALESCE(SUM(views), 0)::bigint AS views
        FROM gains
        WHERE 1 = 1${statsDateSql.replaceAll('vds.', '')}
        GROUP BY date_trunc('week', date)
        ORDER BY week ASC
      `, { type: QueryTypes.SELECT, replacements }),
      sequelize.query(`
        WITH koc_videos AS (
          SELECT DISTINCT va.video_id
          FROM video_assignments va
          JOIN users u ON u.id = va.user_id
          WHERE u.role = 'koc'
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN users u ON u.id = tc.creator_id AND u.role = 'koc'
          JOIN videos v ON v.channel_id = tc.id
        )
        SELECT v.id, v.title, v.views, v.likes, v.comments, v.shares, v.thumbnail_url AS "thumbnailUrl",
               COALESCE(v.video_url, 'https://www.tiktok.com/@' || tc.username || '/video/' || v.platform_video_id) AS "videoUrl",
               v.published_at AS "publishedAt", v.platform_video_id AS "platformVideoId",
               STRING_AGG(DISTINCT u.name, ', ') AS "creatorNames"
        FROM koc_videos kv
        JOIN videos v ON v.id = kv.video_id${videoDateSql}
        LEFT JOIN tiktok_channels tc ON tc.id = v.channel_id
        LEFT JOIN video_assignments va ON va.video_id = v.id
        LEFT JOIN users u ON u.id = va.user_id AND u.role = 'koc'
        GROUP BY v.id, tc.username
        ORDER BY v.views DESC, v.id DESC
        LIMIT 10
      `, { type: QueryTypes.SELECT, replacements }),
    ]);

    res.json({
      overview: toNumbers(overviewRows[0], ['totalUsers', 'totalViews', 'totalLikes', 'totalComments', 'totalShares']),
      users: userKpis.map((user) => toNumbers(user, [
        'totalViews',
        'totalLikes',
        'totalComments',
        'totalShares',
        'avgViewsPerVideo',
        'currentPeriodViews',
        'previousPeriodViews',
      ])),
      products: productKpis.map((product) => toNumbers(product, ['totalViews', 'avgViewsPerVideo'])),
      weeklyViews: weeklyViews.map((row) => ({ week: row.week, views: Number(row.views || 0) })),
      topVideos: topVideos.map((video) => ({
        ...video,
        views: Number(video.views || 0),
        likes: Number(video.likes || 0),
        comments: Number(video.comments || 0),
        shares: Number(video.shares || 0),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getKocDetail = async (req, res) => {
  try {
    const creatorId = Number(req.params.creatorId);
    if (!Number.isInteger(creatorId)) return res.status(400).json({ message: 'Invalid KOC id.' });
    const creator = await User.findOne({ where: { id: creatorId, role: 'koc' }, attributes: ['id', 'name', 'email', 'role'], raw: true });
    if (!creator) return res.status(404).json({ message: 'KOC not found.' });

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start_date || '')) ? req.query.start_date : null;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end_date || '')) ? req.query.end_date : null;
    const dateSql = `${startDate ? ' AND vds.date >= :startDate' : ''}${endDate ? ' AND vds.date <= :endDate' : ''}`;
    const videoDateSql = `${startDate ? ' AND v.published_at::date >= :startDate' : ''}${endDate ? ' AND v.published_at::date <= :endDate' : ''}`;
    const replacements = { creatorId, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };
    const [dailyViews, videos, bookings, syncHistory] = await Promise.all([
      sequelize.query(`
        WITH creator_videos AS (
          SELECT DISTINCT video_id FROM video_assignments WHERE user_id = :creatorId
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN videos v ON v.channel_id = tc.id
          WHERE tc.creator_id = :creatorId
        )
        SELECT vds.date, COALESCE(SUM(vds.views), 0)::bigint AS views
        FROM creator_videos cv
        JOIN video_daily_stats vds ON vds.video_id = cv.video_id${dateSql}
        GROUP BY vds.date
        ORDER BY vds.date ASC
      `, { type: QueryTypes.SELECT, replacements }),
      sequelize.query(`
        WITH creator_videos AS (
          SELECT DISTINCT video_id FROM video_assignments WHERE user_id = :creatorId
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN videos v ON v.channel_id = tc.id
          WHERE tc.creator_id = :creatorId
        )
        SELECT DISTINCT v.id, v.title, v.views, v.likes, v.comments, v.shares,
          v.thumbnail_url AS "thumbnailUrl", v.video_url AS "videoUrl", v.published_at AS "publishedAt"
        FROM creator_videos cv
        JOIN videos v ON v.id = cv.video_id${videoDateSql}
        ORDER BY v.views DESC, v.id DESC
        LIMIT 20
      `, { type: QueryTypes.SELECT, replacements }),
      sequelize.query(`
        SELECT id, booking_cost AS "bookingCost", status, deadline, note, video_url AS "videoUrl", posted_at AS "postedAt"
        FROM bookings
        WHERE creator_id = :creatorId
        ORDER BY deadline DESC, id DESC
        LIMIT 20
      `, { type: QueryTypes.SELECT, replacements }),
      sequelize.query(`
        SELECT id, status, error, synced_at AS "syncedAt"
        FROM tiktok_partner_sync_logs
        WHERE creator_id = :creatorId
        ORDER BY synced_at DESC, id DESC
        LIMIT 10
      `, { type: QueryTypes.SELECT, replacements }),
    ]);
    res.json({
      creator,
      dailyViews: dailyViews.map((row) => ({ date: row.date, views: Number(row.views || 0) })),
      videos: videos.map((row) => ({ ...row, views: Number(row.views || 0), likes: Number(row.likes || 0), comments: Number(row.comments || 0), shares: Number(row.shares || 0) })),
      bookings,
      syncHistory,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const generateWeeklyReport = async (req, res) => {
  try {
    const today = toDateOnly(new Date());
    const requestedStart = req.body.week_start || today;
    const requestedEnd = req.body.week_end || requestedStart;
    const {
      start: weekStart,
      end: weekEnd,
      startText,
      endText,
    } = validateReportPeriod(requestedStart, requestedEnd);

    const bookingInstances = await Booking.findAll({
      where: {
        evaluation_snapshot: { [Op.not]: null },
        created_at: { [Op.between]: [weekStart, weekEnd] },
      },
      attributes: [
        'id',
        'creator_id',
        'creator_open_id',
        'creator_username',
        'creator_name',
        'booking_cost',
        'status',
        'deadline',
        'created_at',
        'evaluation_snapshot',
      ],
      include: [{
        model: BookingVideo,
        as: 'booking_videos',
        required: false,
        include: [{
          model: BookingVideoPerformanceSnapshot,
          as: 'performance_snapshots',
          required: false,
        }],
      }],
      order: [['created_at', 'DESC'], ['id', 'DESC']],
    });
    const bookings = bookingInstances.map(serializeBookingWithActual);

    const snapshot = buildKocReportSnapshot(bookings, startText, endText);
    const factualContent = buildKocFactualReport(snapshot);
    const aiAnalysis = await generateOllamaAnalysis(snapshot);
    const content = `${factualContent}\n\n${aiAnalysis}`;

    const report = await WeeklyReport.create({
      week_start: startText,
      week_end: endText,
      generated_content: content,
    });

    res.status(201).json(report);
  } catch (error) {
    const isOllamaError = /Ollama/i.test(error.message);
    res.status(error.status || (isOllamaError ? 502 : 500)).json({
      message: isOllamaError
        ? `Không thể tạo phân tích AI: ${error.message}`
        : error.message,
    });
  }
};

module.exports = {
  getReports,
  getReportById,
  getPublicReport,
  shareReport,
  createReport,
  updateReport,
  deleteReport,
  getKpis,
  getKocDetail,
  generateWeeklyReport,
  __test: {
    buildKocReportSnapshot,
    buildKocFactualReport,
    validateReportPeriod,
    generateOllamaAnalysis,
  },
};
