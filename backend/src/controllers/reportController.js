const { Op } = require('sequelize');
const { Product, Team, User, Video, VideoAssignment, WeeklyReport } = require('../models');

const toDateOnly = (date) => date.toISOString().slice(0, 10);

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
    const [teams, users, videos, products] = await Promise.all([
      Team.findAll({ order: [['id', 'ASC']] }),
      User.findAll({ order: [['id', 'ASC']] }),
      Video.findAll({
        include: [
          { model: VideoAssignment, as: 'assignments', include: [{ model: User, as: 'user' }] },
          { model: Product, as: 'products', through: { attributes: [] } },
        ],
      }),
      Product.findAll({
        include: [{ model: Video, as: 'videos', through: { attributes: [] } }],
        order: [['id', 'ASC']],
      }),
    ]);

    const userTeamIds = new Map(users.map((user) => [user.id, user.team_id]));
    const videosForUser = (userId) => {
      return videos.filter((video) => {
        return video.assignments?.some((assignment) => assignment.user_id === userId);
      });
    };

    const teamKpis = teams.map((team) => {
      const teamUserIds = users
        .filter((user) => user.team_id === team.id)
        .map((user) => user.id);
      const teamVideos = videos.filter((video) => {
        return video.assignments?.some((assignment) => teamUserIds.includes(assignment.user_id));
      });
      const totalViews = teamVideos.reduce((sum, video) => sum + Number(video.views || 0), 0);

      return {
        id: team.id,
        name: team.name,
        totalVideos: teamVideos.length,
        totalViews,
        totalLikes: teamVideos.reduce((sum, video) => sum + Number(video.likes || 0), 0),
        totalComments: teamVideos.reduce((sum, video) => sum + Number(video.comments || 0), 0),
        totalShares: teamVideos.reduce((sum, video) => sum + Number(video.shares || 0), 0),
        avgViewsPerVideo: teamVideos.length ? Math.round(totalViews / teamVideos.length) : 0,
      };
    });

    const userKpis = users.map((user) => {
      const assignedVideos = videosForUser(user.id);
      const totalViews = assignedVideos.reduce((sum, video) => sum + Number(video.views || 0), 0);
      const topVideo = [...assignedVideos].sort((a, b) => Number(b.views || 0) - Number(a.views || 0))[0];
      const above10k = assignedVideos.filter((video) => Number(video.views || 0) >= 10000).length;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team_id: userTeamIds.get(user.id),
        videoCount: assignedVideos.length,
        totalViews,
        avgViewsPerVideo: assignedVideos.length ? Math.round(totalViews / assignedVideos.length) : 0,
        topVideo: topVideo ? { id: topVideo.id, title: topVideo.title, views: topVideo.views } : null,
        over10kRate: assignedVideos.length ? Math.round((above10k / assignedVideos.length) * 100) : 0,
      };
    });

    const productKpis = products.map((product) => {
      const productVideos = product.videos || [];
      const totalViews = productVideos.reduce((sum, video) => sum + Number(video.views || 0), 0);
      return {
        id: product.id,
        name: product.name,
        totalVideos: productVideos.length,
        totalViews,
        avgViewsPerVideo: productVideos.length ? Math.round(totalViews / productVideos.length) : 0,
      };
    });

    res.json({
      overview: {
        totalTeams: teams.length,
        totalUsers: users.length,
        totalVideos: videos.length,
        totalViews: videos.reduce((sum, video) => sum + Number(video.views || 0), 0),
        totalLikes: videos.reduce((sum, video) => sum + Number(video.likes || 0), 0),
        totalComments: videos.reduce((sum, video) => sum + Number(video.comments || 0), 0),
        totalShares: videos.reduce((sum, video) => sum + Number(video.shares || 0), 0),
      },
      teams: teamKpis,
      users: userKpis,
      products: productKpis,
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
