const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload, videoUpload } = require('../middleware/upload');
const {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  addRoomPhoto,
  removeRoomPhoto,
  setPrimaryPhoto,
  analyzeRoom,
} = require('../controllers/roomController');
const { createCapture, getCapture, selectView, deleteCapture } = require('../controllers/roomCaptureController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listRooms);
router.post('/', upload.single('image'), createRoom);
router.get('/:id', getRoom);
router.put('/:id', updateRoom);
router.delete('/:id', deleteRoom);

router.post('/:id/photos', upload.single('image'), addRoomPhoto);
router.delete('/:id/photos/:photoId', removeRoomPhoto);
router.patch('/:id/photos/:photoId', setPrimaryPhoto);

router.post('/:id/analyze', analyzeRoom);

// Optional 180°/360° room capture (room views). Never changes the room's photos.
router.get('/:id/capture', getCapture);
router.post('/:id/capture', videoUpload.single('video'), createCapture);
router.patch('/:id/capture/:captureId', selectView);
router.delete('/:id/capture/:captureId', deleteCapture);

module.exports = router;
