const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { requireString } = require('../utils/validate');
const { relativeUploadPath, uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { generateRoomVisualization } = require('../services/imageGenerationService');
const path = require('path');

function serialize(row) {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    roomName: row.room_name || null,
    roomType: row.room_type || null,
    productCheckId: row.product_check_id ? String(row.product_check_id) : null,
    // Resolved at read time from the linked product_checks row (the
    // canonical, always-current name — kept in sync with products.name),
    // falling back to the denormalized column only when there is no linked
    // check. This is what keeps a visualization's displayed name from going
    // stale after a rename elsewhere (Saved Products, History, product
    // check) — see updateGeneratedImage/updateProductCheck for the write side.
    productName: row.resolved_product_name,
    productImageUri: toAbsoluteUrl(row.source_product_image_path),
    roomImageUri: toAbsoluteUrl(row.source_room_image_path),
    generatedImageUri: toAbsoluteUrl(row.generated_image_path),
    status: row.status,
    createdAt: row.created_at,
  };
}

const SELECT_BASE = `
  SELECT gi.*, r.name AS room_name, r.room_type AS room_type,
         COALESCE(pc.detected_name, gi.product_name) AS resolved_product_name
  FROM generated_images gi
  JOIN rooms r ON r.id = gi.room_id
  LEFT JOIN product_checks pc ON pc.id = gi.product_check_id
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

/**
 * PATCH /api/generated-images/:id — body: { productName }
 *
 * Renames a visualization. There is no independent "visualization name" to
 * edit in isolation: if this visualization is linked to a product check
 * (product_check_id), the rename updates that check's detected_name — and
 * the shared products row — exactly like PATCH /api/product-checks/:id
 * does, so Saved Products/History/every other visualization sharing that
 * same check all pick up the new name too. Only when there is no linked
 * check (a visualization generated straight from a local photo, never
 * checked) does this fall back to renaming just this one row.
 *
 * Always scoped by user_id first, so a rename can never touch another
 * user's — or another *product's* — records; the update path is chosen
 * purely from this row's own product_check_id, never by matching names.
 */
const updateGeneratedImage = asyncHandler(async (req, res) => {
  const name = requireString(req.body.productName, 'Visualization name', { maxLength: 255 });

  const [rows] = await pool.query('SELECT * FROM generated_images WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (rows.length === 0) throw new ApiError(404, 'Generated image not found.');
  const generatedImage = rows[0];

  if (generatedImage.product_check_id) {
    await pool.query('UPDATE product_checks SET detected_name = ? WHERE id = ? AND user_id = ?', [
      name,
      generatedImage.product_check_id,
      req.user.id,
    ]);

    const [checkRows] = await pool.query('SELECT product_id FROM product_checks WHERE id = ?', [
      generatedImage.product_check_id,
    ]);
    if (checkRows[0]?.product_id) {
      await pool.query('UPDATE products SET name = ? WHERE id = ?', [name, checkRows[0].product_id]);
    }

    // Keep every visualization sharing this check's denormalized copy fresh
    // too (belt-and-suspenders — reads already resolve the live name above).
    await pool.query('UPDATE generated_images SET product_name = ? WHERE product_check_id = ?', [
      name,
      generatedImage.product_check_id,
    ]);
  } else {
    await pool.query('UPDATE generated_images SET product_name = ? WHERE id = ? AND user_id = ?', [
      name,
      req.params.id,
      req.user.id,
    ]);
  }

  const [updatedRows] = await pool.query(`${SELECT_BASE} WHERE gi.id = ?`, [req.params.id]);
  res.json(serialize(updatedRows[0]));
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
  updateGeneratedImage,
  deleteGeneratedImage,
};
