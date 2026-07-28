const { Op } = require('sequelize');
const {
  Product,
  ShopVideo,
  ShopVideoPerformanceSnapshot,
  TikTokChannel,
  User,
  Video,
  VideoAssignment,
} = require('../models');

const videoInclude = [
  { model: TikTokChannel, as: 'channel' },
  { model: Product, as: 'products', through: { attributes: [] } },
  {
    model: VideoAssignment,
    as: 'assignments',
    include: [{ model: User, as: 'user' }],
  },
];

const syncVideoProducts = async (video, productIds) => {
  if (!Array.isArray(productIds)) {
    return;
  }

  const products = await Product.findAll({ where: { id: productIds } });
  await video.setProducts(products);
};

const addLatestShopPerformance = async (videos) => {
  const platformIds = [...new Set(videos.map((video) => String(video.platform_video_id || '')).filter(Boolean))];
  if (!platformIds.length) return videos.map((video) => video.toJSON());
  const shopVideos = await ShopVideo.findAll({
    where: { platform_video_id: { [Op.in]: platformIds } },
    attributes: ['id', 'platform_video_id'],
  });
  if (!shopVideos.length) return videos.map((video) => video.toJSON());
  const snapshots = await ShopVideoPerformanceSnapshot.findAll({
    where: { shop_video_id: { [Op.in]: shopVideos.map((video) => video.id) } },
    order: [['synced_at', 'DESC'], ['id', 'DESC']],
  });
  const platformIdByShopVideo = new Map(shopVideos.map((video) => [String(video.id), String(video.platform_video_id)]));
  const latestByPlatformId = new Map();
  for (const snapshot of snapshots) {
    const platformId = platformIdByShopVideo.get(String(snapshot.shop_video_id));
    if (platformId && !latestByPlatformId.has(platformId)) latestByPlatformId.set(platformId, snapshot);
  }
  return videos.map((video) => {
    const value = video.toJSON();
    const snapshot = latestByPlatformId.get(String(value.platform_video_id));
    return snapshot ? {
      ...value,
      gross_gmv: Number(snapshot.gross_gmv || 0),
      sales_currency: snapshot.currency || null,
      sales_synced_at: snapshot.synced_at || null,
    } : value;
  });
};

const getVideos = async (req, res) => {
  try {
    const videos = await Video.findAll({
      include: videoInclude,
      order: [['published_at', 'DESC'], ['id', 'DESC']],
    });
    res.json(await addLatestShopPerformance(videos));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getVideoById = async (req, res) => {
  try {
    const video = await Video.findByPk(req.params.id, { include: videoInclude });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    res.json(video);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createVideo = async (req, res) => {
  try {
    const { product_ids, ...payload } = req.body;
    const video = await Video.create({
      ...payload,
      last_synced_at: payload.last_synced_at || new Date(),
    });

    await syncVideoProducts(video, product_ids);

    const createdVideo = await Video.findByPk(video.id, { include: videoInclude });
    res.status(201).json(createdVideo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateVideo = async (req, res) => {
  try {
    const { product_ids, ...payload } = req.body;
    const video = await Video.findByPk(req.params.id);

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    await video.update({
      ...payload,
      last_synced_at: payload.last_synced_at || new Date(),
    });
    await syncVideoProducts(video, product_ids);

    const updatedVideo = await Video.findByPk(req.params.id, { include: videoInclude });
    res.json(updatedVideo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteVideo = async (req, res) => {
  try {
    const deleted = await Video.destroy({
      where: { id: req.params.id },
    });
    if (deleted) {
      res.json({ message: 'Video deleted successfully' });
    } else {
      res.status(404).json({ message: 'Video not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getVideos,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo,
};
