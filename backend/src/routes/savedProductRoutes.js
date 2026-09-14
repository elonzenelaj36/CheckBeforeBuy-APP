const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  listSavedProducts,
  createSavedProduct,
  deleteSavedProduct,
} = require('../controllers/savedProductController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listSavedProducts);
router.post('/', upload.single('image'), createSavedProduct);
router.delete('/:id', deleteSavedProduct);

module.exports = router;
