const express = require('express');
const router = express.Router();
const {
  getReports,
  getReportById,
  createReport,
  updateReport,
  deleteReport
} = require('../controllers/reportController');

// GET /api/reports
router.get('/', getReports);

// GET /api/reports/:id
router.get('/:id', getReportById);

// POST /api/reports
router.post('/', createReport);

// PUT /api/reports/:id
router.put('/:id', updateReport);

// DELETE /api/reports/:id
router.delete('/:id', deleteReport);

module.exports = router;