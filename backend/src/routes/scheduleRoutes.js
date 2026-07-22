const express = require('express');
const controller = require('../controllers/scheduleController');

const router = express.Router();
router.get('/', controller.listSchedules);
router.put('/:jobKey', controller.updateSchedule);
router.post('/:jobKey/run', controller.runScheduleNow);
router.post('/:jobKey/stop', controller.stopScheduleNow);

module.exports = router;
