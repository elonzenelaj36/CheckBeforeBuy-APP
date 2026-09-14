const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { requireString } = require('../utils/validate');
const { relativeUploadPath } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');

async function loadRoomWithPhotos(roomId, userId) {
  const [roomRows] = await pool.query('SELECT * FROM rooms WHERE id = ? AND user_id = ? LIMIT 1', [
    roomId,
    userId,
  ]);
  if (roomRows.length === 0) return null;

  const [photoRows] = await pool.query(
    'SELECT * FROM room_photos WHERE room_id = ? ORDER BY created_at ASC',
    [roomId]
  );

  return serializeRoom(roomRows[0], photoRows);
}

function serializeRoom(room, photos) {
  const primary = photos.find((p) => p.is_primary) || photos[0] || null;
  return {
    id: String(room.id),
    name: room.name,
    roomType: room.room_type,
    imageUris: photos.map((p) => toAbsoluteUrl(p.image_path)),
    photos: photos.map((p) => ({
      id: String(p.id),
      imageUri: toAbsoluteUrl(p.image_path),
      isPrimary: !!p.is_primary,
    })),
    primaryImageUri: primary ? toAbsoluteUrl(primary.image_path) : null,
    createdAt: room.created_at,
    updatedAt: room.updated_at,
  };
}

/** GET /api/rooms */
const listRooms = asyncHandler(async (req, res) => {
  const [rooms] = await pool.query('SELECT * FROM rooms WHERE user_id = ? ORDER BY created_at DESC', [
    req.user.id,
  ]);

  const [photos] = await pool.query(
    rooms.length
      ? `SELECT * FROM room_photos WHERE room_id IN (${rooms.map(() => '?').join(',')}) ORDER BY created_at ASC`
      : 'SELECT * FROM room_photos WHERE FALSE',
    rooms.map((r) => r.id)
  );

  const roomsWithPhotos = rooms.map((room) =>
    serializeRoom(
      room,
      photos.filter((p) => p.room_id === room.id)
    )
  );

  res.json({ rooms: roomsWithPhotos });
});

/** GET /api/rooms/:id */
const getRoom = asyncHandler(async (req, res) => {
  const room = await loadRoomWithPhotos(req.params.id, req.user.id);
  if (!room) throw new ApiError(404, 'Room not found.');
  res.json({ room });
});

/**
 * POST /api/rooms
 * multipart/form-data: name, roomType, image (optional)
 */
const createRoom = asyncHandler(async (req, res) => {
  const name = requireString(req.body.name, 'Room name', { maxLength: 150 });
  const roomType = requireString(req.body.roomType, 'Room type', { maxLength: 50 });

  const [result] = await pool.query('INSERT INTO rooms (user_id, name, room_type) VALUES (?, ?, ?)', [
    req.user.id,
    name,
    roomType,
  ]);
  const roomId = result.insertId;

  if (req.file) {
    const relativeImagePath = relativeUploadPath(req.file);
    await pool.query(
      'INSERT INTO room_photos (room_id, image_path, is_primary) VALUES (?, ?, TRUE)',
      [roomId, relativeImagePath]
    );
  }

  const room = await loadRoomWithPhotos(roomId, req.user.id);
  res.status(201).json({ room });
});

/** PUT /api/rooms/:id */
const updateRoom = asyncHandler(async (req, res) => {
  const existing = await loadRoomWithPhotos(req.params.id, req.user.id);
  if (!existing) throw new ApiError(404, 'Room not found.');

  const name = req.body.name !== undefined ? requireString(req.body.name, 'Room name', { maxLength: 150 }) : existing.name;
  const roomType =
    req.body.roomType !== undefined
      ? requireString(req.body.roomType, 'Room type', { maxLength: 50 })
      : existing.roomType;

  await pool.query('UPDATE rooms SET name = ?, room_type = ? WHERE id = ? AND user_id = ?', [
    name,
    roomType,
    req.params.id,
    req.user.id,
  ]);

  const room = await loadRoomWithPhotos(req.params.id, req.user.id);
  res.json({ room });
});

/** DELETE /api/rooms/:id */
const deleteRoom = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM rooms WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Room not found.');
  res.status(204).end();
});

/** POST /api/rooms/:id/photos — multipart/form-data: image */
const addRoomPhoto = asyncHandler(async (req, res) => {
  const existing = await loadRoomWithPhotos(req.params.id, req.user.id);
  if (!existing) throw new ApiError(404, 'Room not found.');
  if (!req.file) throw new ApiError(400, 'An "image" file is required.');

  const relativeImagePath = relativeUploadPath(req.file);
  const isFirstPhoto = existing.imageUris.length === 0;

  await pool.query('INSERT INTO room_photos (room_id, image_path, is_primary) VALUES (?, ?, ?)', [
    req.params.id,
    relativeImagePath,
    isFirstPhoto,
  ]);

  const room = await loadRoomWithPhotos(req.params.id, req.user.id);
  res.status(201).json({ room });
});

/** DELETE /api/rooms/:id/photos/:photoId */
const removeRoomPhoto = asyncHandler(async (req, res) => {
  const existing = await loadRoomWithPhotos(req.params.id, req.user.id);
  if (!existing) throw new ApiError(404, 'Room not found.');

  const [photoRows] = await pool.query('SELECT * FROM room_photos WHERE id = ? AND room_id = ?', [
    req.params.photoId,
    req.params.id,
  ]);
  if (photoRows.length === 0) throw new ApiError(404, 'Photo not found.');

  const wasPrimary = !!photoRows[0].is_primary;

  await pool.query('DELETE FROM room_photos WHERE id = ?', [req.params.photoId]);

  if (wasPrimary) {
    const [remaining] = await pool.query(
      'SELECT id FROM room_photos WHERE room_id = ? ORDER BY created_at ASC LIMIT 1',
      [req.params.id]
    );
    if (remaining.length > 0) {
      await pool.query('UPDATE room_photos SET is_primary = TRUE WHERE id = ?', [remaining[0].id]);
    }
  }

  const room = await loadRoomWithPhotos(req.params.id, req.user.id);
  res.json({ room });
});

/** PATCH /api/rooms/:id/photos/:photoId — body: { isPrimary: true } */
const setPrimaryPhoto = asyncHandler(async (req, res) => {
  const existing = await loadRoomWithPhotos(req.params.id, req.user.id);
  if (!existing) throw new ApiError(404, 'Room not found.');

  const [photoRows] = await pool.query('SELECT * FROM room_photos WHERE id = ? AND room_id = ?', [
    req.params.photoId,
    req.params.id,
  ]);
  if (photoRows.length === 0) throw new ApiError(404, 'Photo not found.');

  await pool.query('UPDATE room_photos SET is_primary = (id = ?) WHERE room_id = ?', [
    req.params.photoId,
    req.params.id,
  ]);

  const room = await loadRoomWithPhotos(req.params.id, req.user.id);
  res.json({ room });
});

module.exports = {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  addRoomPhoto,
  removeRoomPhoto,
  setPrimaryPhoto,
};
