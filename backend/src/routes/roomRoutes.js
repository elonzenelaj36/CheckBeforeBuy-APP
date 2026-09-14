const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  addRoomPhoto,
  removeRoomPhoto,
  setPrimaryPhoto,
} = require('../controllers/roomController');

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

module.exports = router;
