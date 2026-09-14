const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  listUserItems,
  createUserItem,
  updateUserItem,
  deleteUserItem,
} = require('../controllers/userItemController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listUserItems);
router.post('/', upload.single('image'), createUserItem);
router.put('/:id', updateUserItem);
router.delete('/:id', deleteUserItem);

module.exports = router;
