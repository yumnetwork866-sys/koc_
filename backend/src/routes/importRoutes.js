const express = require('express');
const router = express.Router();
const { importPlatformData } = require('../controllers/importController');

router.post('/platform', importPlatformData);

module.exports = router;
