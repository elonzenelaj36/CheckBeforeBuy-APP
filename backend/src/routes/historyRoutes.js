const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getHistory } = require('../controllers/historyController');

const router = express.Router();

router.get('/', requireAuth, getHistory);

module.exports = router;
