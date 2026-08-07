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
  syncChannelVideos,
  revokeChannelAuthorization,
  deleteChannel,
} = require('../controllers/channelController');
const { requireAdmin, requirePermission } = require('../lib/session');

router.get('/oauth/tiktok/callback', handleTiktokOauthCallback);
router.post('/webhook/tiktok', handleTiktokWebhook);
router.use(requireAdmin, requirePermission('reports'));
router.get('/oauth/tiktok/start', startTiktokOauth);
router.get('/', getChannels);
router.get('/:id', getChannelById);
router.post('/', createChannel);
router.put('/:id', updateChannel);
router.post('/:id/sync-videos', syncChannelVideos);
router.post('/:id/revoke', revokeChannelAuthorization);
router.delete('/:id', deleteChannel);

module.exports = router;
