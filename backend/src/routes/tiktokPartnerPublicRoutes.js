const express = require('express');
const { handleTikTokPartnerOauthCallback } = require('../controllers/bookingController');

const router = express.Router();
router.get('/callback', handleTikTokPartnerOauthCallback);

module.exports = router;
