const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getMe } = require('../controllers/userController');

const router = express.Router();

router.get('/me', requireAuth, getMe);

module.exports = router;
