const fs = require('fs');
const path = require('path');
const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadRoot } = require('../middleware/upload');
const { detectProductRoute, parsePolygon, cropToSelection } = require('../services/productSelectionService');

/**
 * The photo to work on: an uploaded file (multipart "image"), or an analyzed
 * product's saved photo (productCheckId). Uploads are temporary.
 */
async function resolvePhoto(req) {
  if (req.file) return req.file.path;
  if (req.body.productCheckId) {
    const [rows] = await pool.query('SELECT image_path FROM product_checks WHERE id = ? AND user_id = ?', [
      Number(req.body.productCheckId),
      req.user.id,
    ]);
    if (rows.length === 0) throw new ApiError(404, 'Product not found.');
    if (!rows[0].image_path) throw new ApiError(400, 'This product has no photo.');
    return path.join(uploadRoot, path.basename(rows[0].image_path));
  }
  throw new ApiError(400, 'A product photo (image) or productCheckId is required.');
}

function discardUpload(req) {
  if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
}

/**
 * POST /api/product-selection/detect   (multipart: image | productCheckId)
 * → { route: 'auto'|'select', reason, products }
 * 'auto' = one clear product: continue with the photo as it is.
 */
const detectProduct = asyncHandler(async (req, res) => {
  try {
    res.json(await detectProductRoute({ imagePath: await resolvePhoto(req) }));
  } finally {
    discardUpload(req);
  }
});

/**
 * POST /api/product-selection/crop   (multipart: image | productCheckId, polygon)
 * polygon: JSON [{x, y}, …] normalized to the displayed image (0..1).
 * → image/png of just the outlined product (outside = white), cropped around it.
 */
const cropSelection = asyncHandler(async (req, res) => {
  try {
    const polygon = parsePolygon(req.body.polygon);
    if (!polygon) throw new ApiError(400, 'Draw around the product first.');
    let png;
    try {
      png = await cropToSelection({ imagePath: await resolvePhoto(req), polygon });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error('[productSelection] crop failed:', err.message);
      throw new ApiError(422, "We couldn't use that selection. Please draw around the product again.");
    }
    res.type('image/png').send(png);
  } finally {
    discardUpload(req);
  }
});

module.exports = { detectProduct, cropSelection };
