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
    const [overviewRows, userKpis, productKpis] = await Promise.all([
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
        ORDER BY u.id ASC
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
        ORDER BY p.id ASC
      `, { type: QueryTypes.SELECT }),
    ]);

    res.json({
      overview: toNumbers(overviewRows[0], ['totalViews', 'totalLikes', 'totalComments', 'totalShares']),
      users: userKpis.map((user) => toNumbers(user, ['totalViews', 'avgViewsPerVideo'])),
      products: productKpis.map((product) => toNumbers(product, ['totalViews', 'avgViewsPerVideo'])),
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
  generateWeeklyReport,
};
