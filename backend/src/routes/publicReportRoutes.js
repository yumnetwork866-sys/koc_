const express = require('express');
const { getPublicReport } = require('../controllers/reportController');

const router = express.Router();

router.get('/:token', getPublicReport);

module.exports = router;
