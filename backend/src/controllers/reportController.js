const { Op, QueryTypes } = require('sequelize');
const { Product, User, Video, VideoAssignment, WeeklyReport, sequelize } = require('../models');

const toDateOnly = (date) => date.toISOString().slice(0, 10);
const toNumbers = (row, fields) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? Number(value) : value]),
);

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
    const weekStart = req.body.week_start ? new Date(req.body.week_start) : new Date();
    const weekEnd = req.body.week_end ? new Date(req.body.week_end) : new Date(weekStart);

    if (!req.body.week_end) {
      weekEnd.setDate(weekStart.getDate() + 6);
    }

    const videos = await Video.findAll({
      where: {
        published_at: {
          [Op.between]: [weekStart, new Date(`${toDateOnly(weekEnd)}T23:59:59.999Z`)],
        },
      },
      include: [
        { model: Product, as: 'products', through: { attributes: [] } },
        { model: VideoAssignment, as: 'assignments', include: [{ model: User, as: 'user' }] },
      ],
      order: [['views', 'DESC']],
    });

    const totalViews = videos.reduce((sum, video) => sum + Number(video.views || 0), 0);
    const topVideos = videos.slice(0, 3);
    const strongProducts = new Map();

    videos.forEach((video) => {
      video.products?.forEach((product) => {
        const current = strongProducts.get(product.name) || { videos: 0, views: 0 };
        current.videos += 1;
        current.views += Number(video.views || 0);
        strongProducts.set(product.name, current);
      });
    });

    const productLines = Array.from(strongProducts.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .map(([name, stat]) => `- ${name}: ${stat.videos} video, ${stat.views.toLocaleString()} views`)
      .join('\n');

    const content = [
      `Báo cáo tuần ${toDateOnly(weekStart)} - ${toDateOnly(weekEnd)}`,
      '',
      `Tổng video: ${videos.length}`,
      `Tổng views: ${totalViews.toLocaleString()}`,
      `Avg view/video: ${videos.length ? Math.round(totalViews / videos.length).toLocaleString() : 0}`,
      '',
      'Top video:',
      topVideos.length
        ? topVideos.map((video, index) => `${index + 1}. ${video.title} - ${Number(video.views || 0).toLocaleString()} views`).join('\n')
        : '- Chưa có video trong tuần này',
      '',
      'Sản phẩm nổi bật:',
      productLines || '- Chưa có dữ liệu sản phẩm',
      '',
      'Nhận định AI:',
      videos.length
        ? 'Tập trung nhân rộng format của top video, ưu tiên các sản phẩm đang có view trung bình cao và rà soát lại nhóm video dưới 10k view để cải thiện hook 3 giây đầu.'
        : 'Tuần này chưa có dữ liệu video, cần import hoặc đồng bộ nguồn dữ liệu trước khi đánh giá hiệu suất.',
    ].join('\n');

    const report = await WeeklyReport.create({
      week_start: toDateOnly(weekStart),
      week_end: toDateOnly(weekEnd),
      generated_content: content,
    });

    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getReports,
  getReportById,
  createReport,
  updateReport,
  deleteReport,
  getKpis,
  getKocDetail,
  generateWeeklyReport,
};
