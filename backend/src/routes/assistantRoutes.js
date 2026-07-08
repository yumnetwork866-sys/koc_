const express = require('express');
const { requireAdmin } = require('../lib/session');
const controller = require('../controllers/assistantController');

const router = express.Router();

router.post('/chat', requireAdmin, controller.chat);

module.exports = router;
