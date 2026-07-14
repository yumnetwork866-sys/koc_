const express = require('express');
const { getRoles, createRole, updateRole, deleteRole } = require('../controllers/roleController');

const router = express.Router();

router.get('/', getRoles);
router.post('/', createRole);
router.put('/:key', updateRole);
router.delete('/:key', deleteRole);

module.exports = router;
