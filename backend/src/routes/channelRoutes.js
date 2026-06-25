const express = require('express');
const router = express.Router();
const {
  startTiktokOauth,
  handleTiktokOauthCallback,
  handleTiktokWebhook,
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
} = require('../controllers/channelController');

router.get('/oauth/tiktok/start', startTiktokOauth);
router.get('/oauth/tiktok/callback', handleTiktokOauthCallback);
router.get('/webhook/tiktok', handleTiktokWebhook);
router.post('/webhook/tiktok', handleTiktokWebhook);
router.get('/', getChannels);
router.get('/:id', getChannelById);
router.post('/', createChannel);
router.put('/:id', updateChannel);
router.delete('/:id', deleteChannel);

module.exports = router;
