const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { relativeUploadPath, uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { generateRoomVisualization } = require('../services/imageGenerationService');
const path = require('path');

function serialize(row) {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    roomName: row.room_name || null,
    productName: row.product_name,
    productImageUri: toAbsoluteUrl(row.source_product_image_path),
    roomImageUri: toAbsoluteUrl(row.source_room_image_path),
    generatedImageUri: toAbsoluteUrl(row.generated_image_path),
    status: row.status,
    createdAt: row.created_at,
  };
}

const SELECT_BASE = `
  SELECT gi.*, r.name AS room_name
  FROM generated_images gi
  JOIN rooms r ON r.id = gi.room_id
`;

/** GET /api/generated-images */
const listGeneratedImages = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `${SELECT_BASE} WHERE gi.user_id = ? ORDER BY gi.created_at DESC`,
    [req.user.id]
  );
  res.json({ generatedImages: rows.map(serialize) });
});

/** GET /api/generated-images/room/:roomId */
const listGeneratedImagesForRoom = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `${SELECT_BASE} WHERE gi.user_id = ? AND gi.room_id = ? ORDER BY gi.created_at DESC`,
    [req.user.id, req.params.roomId]
  );
  res.json({ generatedImages: rows.map(serialize) });
});

/**
 * POST /api/generated-images
 * multipart/form-data: roomId (required), productName, productCheckId (optional),
 *   productImage (file, optional if productCheckId given), roomImage (file, optional
 *   if the room already has a primary photo)
 */
const createGeneratedImage = asyncHandler(async (req, res) => {
  const roomId = Number(req.body.roomId);
  if (!roomId) throw new ApiError(400, 'roomId is required.');

  const [roomRows] = await pool.query('SELECT * FROM rooms WHERE id = ? AND user_id = ?', [
    roomId,
    req.user.id,
  ]);
  if (roomRows.length === 0) throw new ApiError(404, 'Room not found.');

  const files = req.files || {};
  const productImageFile = files.productImage?.[0] || null;
  const roomImageFile = files.roomImage?.[0] || null;

  let sourceRoomImagePath = roomImageFile ? relativeUploadPath(roomImageFile) : null;
  if (!sourceRoomImagePath) {
    const [photoRows] = await pool.query(
      'SELECT image_path FROM room_photos WHERE room_id = ? ORDER BY is_primary DESC, created_at ASC LIMIT 1',
      [roomId]
    );
    sourceRoomImagePath = photoRows[0]?.image_path || null;
  }

  let sourceProductImagePath = productImageFile ? relativeUploadPath(productImageFile) : null;
  const productCheckId = req.body.productCheckId ? Number(req.body.productCheckId) : null;
  let productName = req.body.productName || null;

  if (productCheckId) {
    const [checkRows] = await pool.query('SELECT * FROM product_checks WHERE id = ? AND user_id = ?', [
      productCheckId,
      req.user.id,
    ]);
    if (checkRows.length === 0) throw new ApiError(400, 'productCheckId does not belong to you.');
    sourceProductImagePath = sourceProductImagePath || checkRows[0].image_path;
    productName = productName || checkRows[0].detected_name;
  }

  if (!sourceProductImagePath) {
    throw new ApiError(400, 'A product image (file or productCheckId) is required.');
  }

  const [insertResult] = await pool.query(
    `INSERT INTO generated_images
       (user_id, room_id, product_check_id, product_name, source_room_image_path, source_product_image_path, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [req.user.id, roomId, productCheckId, productName, sourceRoomImagePath, sourceProductImagePath]
  );
  const generatedImageId = insertResult.insertId;

  let generationResult;
  try {
    generationResult = await generateRoomVisualization({
      roomImagePath: sourceRoomImagePath ? path.join(uploadRoot, path.basename(sourceRoomImagePath)) : null,
      productImagePath: path.join(uploadRoot, path.basename(sourceProductImagePath)),
      roomType: roomRows[0].room_type,
    });
  } catch (err) {
    generationResult = { status: 'failed', generatedImagePath: null, provider: null, message: err.message };
  }

  await pool.query('UPDATE generated_images SET status = ?, generated_image_path = ?, provider = ? WHERE id = ?', [
    generationResult.status,
    generationResult.generatedImagePath,
    generationResult.provider,
    generatedImageId,
  ]);

  if (productCheckId) {
    await pool.query('UPDATE product_checks SET has_visualization = TRUE WHERE id = ?', [productCheckId]);
  }

  const [rows] = await pool.query(`${SELECT_BASE} WHERE gi.id = ?`, [generatedImageId]);

  res.status(201).json({
    ...serialize(rows[0]),
    message: generationResult.message || null,
  });
});

/** DELETE /api/generated-images/:id */
const deleteGeneratedImage = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM generated_images WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Generated image not found.');
  res.status(204).end();
});

module.exports = {
  listGeneratedImages,
  listGeneratedImagesForRoom,
  createGeneratedImage,
  deleteGeneratedImage,
};
