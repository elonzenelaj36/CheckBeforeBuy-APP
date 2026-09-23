const fs = require('fs');
const path = require('path');
const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { removeBackground, BackgroundRemovalError } = require('../services/backgroundRemovalService');

/**
 * POST /api/product-cutouts   (multipart/form-data)
 *   image          — the ORIGINAL product photo, or
 *   productCheckId — an analyzed product; its saved photo is used.
 *
 * Returns a transparent PNG of the product for use as a movable layer:
 *   { cutoutId, cutoutImageUri, width, height, cached }
 * cutoutId (the content hash) identifies the product photo for 3D generation.
 *
 * Nothing is written to the database: cutouts are files cached by the
 * content hash of the original photo (see backgroundRemovalService.js).
 * The uploaded original is not kept here — the app keeps its own original
 * and still sends it to image generation exactly as before.
 */
const createProductCutout = asyncHandler(async (req, res) => {
  const upload = req.file || null;
  try {
    let imagePath = upload ? upload.path : null;

    if (!imagePath && req.body.productCheckId) {
      const [rows] = await pool.query('SELECT image_path FROM product_checks WHERE id = ? AND user_id = ?', [
        Number(req.body.productCheckId),
        req.user.id,
      ]);
      if (rows.length === 0) throw new ApiError(404, 'Product not found.');
      if (!rows[0].image_path) throw new ApiError(400, 'This product has no photo.');
      imagePath = path.join(uploadRoot, path.basename(rows[0].image_path));
    }
    if (!imagePath) throw new ApiError(400, 'A product photo (image) or productCheckId is required.');

    let result;
    try {
      result = await removeBackground({ imagePath });
    } catch (err) {
      if (err instanceof BackgroundRemovalError) throw new ApiError(err.status, err.message);
      throw err;
    }

    res.status(result.cached ? 200 : 201).json({
      cutoutId: path.basename(result.imagePath, '.png').replace(/^cutout-/, ''),
      cutoutImageUri: toAbsoluteUrl(result.imagePath),
      width: result.width,
      height: result.height,
      cached: result.cached,
    });
  } finally {
    if (upload) fs.promises.unlink(upload.path).catch(() => {});
  }
});

module.exports = { createProductCutout };
