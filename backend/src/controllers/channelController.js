const { TikTokChannel, Video } = require('../models');

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
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
};
