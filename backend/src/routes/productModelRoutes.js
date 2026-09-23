const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createProductModel, getProductModel } = require('../controllers/productModelController');

const router = express.Router();

router.use(requireAuth);

router.post('/', createProductModel);
router.get('/:id', getProductModel);

module.exports = router;
