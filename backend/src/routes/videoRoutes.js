const express = require('express');
const router = express.Router();
const {
  getVideos,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo
} = require('../controllers/videoController');

// GET /api/videos
router.get('/', getVideos);

// GET /api/videos/:id
router.get('/:id', getVideoById);

// POST /api/videos
router.post('/', createVideo);

// PUT /api/videos/:id
router.put('/:id', updateVideo);

// DELETE /api/videos/:id
router.delete('/:id', deleteVideo);

module.exports = router;