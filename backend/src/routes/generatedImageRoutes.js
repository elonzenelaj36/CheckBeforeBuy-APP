const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  listGeneratedImages,
  listGeneratedImagesForRoom,
  createGeneratedImage,
  deleteGeneratedImage,
} = require('../controllers/generatedImageController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listGeneratedImages);
router.get('/room/:roomId', listGeneratedImagesForRoom);
router.post(
  '/',
  upload.fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'roomImage', maxCount: 1 },
  ]),
  createGeneratedImage
);
router.delete('/:id', deleteGeneratedImage);

module.exports = router;
