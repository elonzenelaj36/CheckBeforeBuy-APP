const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { findForMyHome } = require('../controllers/findForMyHomeController');

const router = express.Router();

router.use(requireAuth);

router.post('/', findForMyHome);

module.exports = router;
