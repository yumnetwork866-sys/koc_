const express = require('express');
const router = express.Router();
const {
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
} = require('../controllers/channelController');

router.get('/', getChannels);
router.get('/:id', getChannelById);
router.post('/', createChannel);
router.put('/:id', updateChannel);
router.delete('/:id', deleteChannel);

module.exports = router;
