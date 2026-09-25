const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { detectProduct, cropSelection } = require('../controllers/productSelectionController');

const router = express.Router();

router.use(requireAuth);

router.post('/detect', upload.single('image'), detectProduct);
router.post('/crop', upload.single('image'), cropSelection);

module.exports = router;
