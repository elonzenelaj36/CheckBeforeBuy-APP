const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { createProductCutout } = require('../controllers/productCutoutController');

const router = express.Router();

router.use(requireAuth);

router.post('/', upload.single('image'), createProductCutout);

module.exports = router;
