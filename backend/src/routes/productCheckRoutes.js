const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  createProductCheck,
  listProductChecks,
  getProductCheck,
  updateProductCheck,
  clearProductChecks,
} = require('../controllers/productCheckController');

const router = express.Router();

router.use(requireAuth);

router.post('/', upload.single('image'), createProductCheck);
router.get('/', listProductChecks);
router.delete('/', clearProductChecks);
router.patch('/:id', updateProductCheck);
router.get('/:id', getProductCheck);

module.exports = router;
