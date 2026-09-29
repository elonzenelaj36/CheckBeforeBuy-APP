const path = require('path');
const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { requireString } = require('../utils/validate');
const { relativeUploadPath, uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { analyzeRoomImages } = require('../services/aiService');
const { serializeUserItem, serializeWithObservations } = require('./userItemController');
const roomItemDetection = require('../services/roomItemDetectionService');
const { loadCaptureSummaries } = require('./roomCaptureController');

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

  const captures = await loadCaptureSummaries([roomRows[0].id]);
  return serializeRoom(roomRows[0], photoRows, captures.get(roomRows[0].id));
}

/** `capture` is the optional 180°/360° room capture summary (null for rooms without one). */
function serializeRoom(room, photos, capture = null) {
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
    capture: capture || null,
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

  const captures = await loadCaptureSummaries(rooms.map((r) => r.id));
  const roomsWithPhotos = rooms.map((room) =>
    serializeRoom(
      room,
      photos.filter((p) => p.room_id === room.id),
      captures.get(room.id)
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

/**
 * POST /api/rooms/:id/analyze
 *
 * Runs AI room analysis over the room's current photos and saves any
 * newly-detected objects to user_items. Never blocks room creation/editing
 * — this is always a separate, best-effort call the frontend makes after
 * the room (and its photos) are already saved. A room with no photos yet
 * simply returns no items rather than erroring.
 *
 * Duplicate-avoidance: existing items for this room are fetched first and
 * passed to the AI as context (so a re-analysis after adding more photos
 * doesn't re-describe furniture it already knows about), and are checked
 * again on the way in as a hard guard against inserting an exact
 * name+category repeat.
 */
const analyzeRoom = asyncHandler(async (req, res) => {
  const existing = await loadRoomWithPhotos(req.params.id, req.user.id);
  if (!existing) throw new ApiError(404, 'Room not found.');

  // Groq configured (the project's AI provider): detect furniture WITH where it
  // appears — the primary photo, or a few views of the 180°/360° capture.
  if (roomItemDetection.isAvailable()) return detectItemsWithLocations(req, res, existing);

  if (existing.imageUris.length === 0) {
    return res.json({ items: [], totalDetected: 0, isMock: false, message: 'Add a room photo before analyzing.' });
  }

  const [photoRows] = await pool.query(
    'SELECT image_path FROM room_photos WHERE room_id = ? ORDER BY created_at ASC LIMIT 5',
    [req.params.id]
  );
  const absoluteImagePaths = photoRows.map((p) => path.join(uploadRoot, path.basename(p.image_path)));

  const [existingItemRows] = await pool.query(
    'SELECT name, category FROM user_items WHERE user_id = ? AND room_id = ?',
    [req.user.id, req.params.id]
  );

  let aiResult;
  try {
    aiResult = await analyzeRoomImages({
      absoluteImagePaths,
      roomType: existing.roomType,
      existingItems: existingItemRows,
    });
  } catch (err) {
    throw new ApiError(502, "We couldn't analyze this room. Please try again.", err.message);
  }

  const knownItems = existingItemRows.map((row) => ({
    name: row.name.toLowerCase(),
    category: row.category.toLowerCase(),
  }));

  const created = [];
  for (const item of aiResult.items) {
    const name = (item.name || '').trim();
    if (!name) continue;
    const category = (item.category || 'Other').trim() || 'Other';

    const isDuplicate = knownItems.some(
      (known) => known.name === name.toLowerCase() && known.category === category.toLowerCase()
    );
    if (isDuplicate) continue;

    const [result] = await pool.query(
      `INSERT INTO user_items (user_id, room_id, name, category, description, source)
       VALUES (?, ?, ?, ?, ?, 'ai')`,
      [req.user.id, req.params.id, name, category, item.description || null]
    );

    knownItems.push({ name: name.toLowerCase(), category: category.toLowerCase() });

    const [rows] = await pool.query('SELECT * FROM user_items WHERE id = ?', [result.insertId]);
    created.push(serializeUserItem(rows[0]));
  }

  res.json({
    items: created,
    totalDetected: aiResult.items.length,
    isMock: aiResult.isMock,
    provider: aiResult.provider,
  });
});

/**
 * Items Detected for a room (Groq): the primary photo of a photo room, or a
 * few evenly spaced views of a 180°/360° capture, merged so one sofa seen in
 * several views is one item. Replaces this room's previous AI-detected items
 * (manual items are kept) and stores where each item was seen
 * (room_item_observations). Detection problems never affect the room itself.
 */
async function detectItemsWithLocations(req, res, room) {
  let input = null;
  if (room.capture) {
    const [frames] = await pool.query(
      'SELECT id, angle_deg, image_path FROM room_capture_frames WHERE capture_id = ? ORDER BY frame_index ASC',
      [room.capture.id]
    );
    input = {
      capture: {
        loops: room.capture.loops,
        lens: room.capture.lens,
        fovDeg: room.capture.fovDeg ?? null,
        frames: frames.map((f) => ({
          id: f.id,
          angleDeg: Number(f.angle_deg),
          path: path.join(uploadRoot, path.basename(f.image_path)),
        })),
      },
    };
  } else {
    const [photoRows] = await pool.query(
      'SELECT id, image_path FROM room_photos WHERE room_id = ? ORDER BY is_primary DESC, created_at ASC LIMIT 1',
      [room.id]
    );
    if (photoRows.length === 0) {
      return res.json({ items: [], totalDetected: 0, isMock: false, message: 'Add a room photo before analyzing.' });
    }
    input = { photo: { id: photoRows[0].id, path: path.join(uploadRoot, path.basename(photoRows[0].image_path)) } };
  }

  let result;
  try {
    result = await roomItemDetection.detectRoomItems(input);
  } catch (err) {
    console.error('[roomItems] detection failed:', err.message);
    throw new ApiError(502, "We couldn't detect furniture in this room. Please try again later.");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM user_items WHERE user_id = ? AND room_id = ? AND source = 'ai'", [req.user.id, room.id]);
    for (const item of result.items) {
      const name = item.label.charAt(0).toUpperCase() + item.label.slice(1);
      const views = item.observations.length;
      const [ins] = await conn.query(
        `INSERT INTO user_items (user_id, room_id, name, category, description, color, material, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')`,
        [
          req.user.id,
          room.id,
          name,
          item.category,
          views > 1 ? `Detected automatically in ${views} views` : 'Detected automatically',
          item.color ?? null,
          item.material ?? null,
        ]
      );
      for (const o of item.observations) {
        await conn.query(
          `INSERT INTO room_item_observations
             (user_item_id, room_photo_id, capture_frame_id, box_x1, box_y1, box_x2, box_y2, confidence, direction_deg, half_width_deg)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ins.insertId,
            o.roomPhotoId ?? null,
            o.captureFrameId ?? null,
            o.box.x1,
            o.box.y1,
            o.box.x2,
            o.box.y2,
            o.confidence,
            o.directionDeg,
            o.halfWidthDeg,
          ]
        );
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  const [rows] = await pool.query(
    "SELECT * FROM user_items WHERE user_id = ? AND room_id = ? AND source = 'ai' ORDER BY id ASC",
    [req.user.id, room.id]
  );
  res.json({
    items: await serializeWithObservations(rows),
    totalDetected: rows.length,
    isMock: false,
    provider: 'groq',
    viewsAnalyzed: result.viewsAnalyzed,
    viewsFailed: result.viewsFailed,
  });
}

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
  analyzeRoom,
};
