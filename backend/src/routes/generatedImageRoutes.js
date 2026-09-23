const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  listGeneratedImages,
  listGeneratedImagesForRoom,
  createGeneratedImage,
  updateGeneratedImage,
  saveGeneratedImageLayout,
  deleteGeneratedImage,
} = require('../controllers/generatedImageController');
const { generateSession } = require('../controllers/visualizationSessionController');

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
router.post(
  '/session',
  upload.fields(Array.from({ length: 8 }, (_, i) => ({ name: `productImage${i}`, maxCount: 1 }))),
  generateSession
);
router.patch('/:id', updateGeneratedImage);
router.put('/:id/layout', saveGeneratedImageLayout);
router.delete('/:id', deleteGeneratedImage);

module.exports = router;
