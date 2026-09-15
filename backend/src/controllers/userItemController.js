const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { requireString } = require('../utils/validate');
const { relativeUploadPath } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');

function serialize(row) {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category,
    description: row.description || null,
    imageUri: toAbsoluteUrl(row.image_path),
    roomId: row.room_id ? String(row.room_id) : null,
    source: row.source || 'manual',
    createdAt: row.created_at,
  };
}

/** GET /api/items?roomId= */
const listUserItems = asyncHandler(async (req, res) => {
  const { roomId } = req.query;

  const [rows] = roomId
    ? await pool.query('SELECT * FROM user_items WHERE user_id = ? AND room_id = ? ORDER BY created_at DESC', [
        req.user.id,
        roomId,
      ])
    : await pool.query('SELECT * FROM user_items WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);

  res.json({ items: rows.map(serialize) });
});

/** POST /api/items — multipart/form-data: name, category, roomId (optional), image (optional) */
const createUserItem = asyncHandler(async (req, res) => {
  const name = requireString(req.body.name, 'Item name', { maxLength: 255 });
  const category = req.body.category ? String(req.body.category).trim() : 'Other';
  const roomId = req.body.roomId ? Number(req.body.roomId) : null;
  const relativeImagePath = req.file ? relativeUploadPath(req.file) : null;

  if (roomId) {
    const [roomRows] = await pool.query('SELECT id FROM rooms WHERE id = ? AND user_id = ?', [
      roomId,
      req.user.id,
    ]);
    if (roomRows.length === 0) throw new ApiError(400, 'That room does not belong to you.');
  }

  const [result] = await pool.query(
    'INSERT INTO user_items (user_id, room_id, name, category, image_path) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, roomId, name, category, relativeImagePath]
  );

  const [rows] = await pool.query('SELECT * FROM user_items WHERE id = ?', [result.insertId]);
  res.status(201).json(serialize(rows[0]));
});

/** PUT /api/items/:id */
const updateUserItem = asyncHandler(async (req, res) => {
  const [existingRows] = await pool.query('SELECT * FROM user_items WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (existingRows.length === 0) throw new ApiError(404, 'Item not found.');
  const existing = existingRows[0];

  const name = req.body.name !== undefined ? requireString(req.body.name, 'Item name', { maxLength: 255 }) : existing.name;
  const category = req.body.category !== undefined ? String(req.body.category).trim() : existing.category;
  const roomId = req.body.roomId !== undefined ? (req.body.roomId ? Number(req.body.roomId) : null) : existing.room_id;

  await pool.query('UPDATE user_items SET name = ?, category = ?, room_id = ? WHERE id = ? AND user_id = ?', [
    name,
    category,
    roomId,
    req.params.id,
    req.user.id,
  ]);

  const [rows] = await pool.query('SELECT * FROM user_items WHERE id = ?', [req.params.id]);
  res.json(serialize(rows[0]));
});

/** DELETE /api/items/:id */
const deleteUserItem = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM user_items WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Item not found.');
  res.status(204).end();
});

module.exports = {
  listUserItems,
  createUserItem,
  updateUserItem,
  deleteUserItem,
  serializeUserItem: serialize,
};
