const {
  Product,
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

const getVideos = async (req, res) => {
  try {
    const videos = await Video.findAll({
      include: videoInclude,
      order: [['published_at', 'DESC'], ['id', 'DESC']],
    });
    res.json(videos);
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
