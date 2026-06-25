const express = require('express');
const router = express.Router();
const {
  getAssignments,
  createAssignment,
  deleteAssignment,
} = require('../controllers/assignmentController');

router.get('/', getAssignments);
router.post('/', createAssignment);
router.delete('/:id', deleteAssignment);

module.exports = router;
