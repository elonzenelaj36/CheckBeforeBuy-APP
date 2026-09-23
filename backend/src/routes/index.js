const express = require('express');

const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/product-checks', require('./productCheckRoutes'));
router.use('/history', require('./historyRoutes'));
router.use('/rooms', require('./roomRoutes'));
router.use('/saved-products', require('./savedProductRoutes'));
router.use('/items', require('./userItemRoutes'));
router.use('/generated-images', require('./generatedImageRoutes'));
router.use('/product-cutouts', require('./productCutoutRoutes'));
router.use('/product-models', require('./productModelRoutes'));
router.use('/find-for-my-home', require('./findForMyHomeRoutes'));

router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

module.exports = router;
