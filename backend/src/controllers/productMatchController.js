const path = require('path');
const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadRoot } = require('../middleware/upload');
const { findProductMatches } = require('../services/productMatchService');

/**
 * POST /api/product-checks/:id/matches
 *
 * Finds real, existing product pages that visually match this check's
 * photo (via Google Vision Web Detection) and returns links to them.
 * Nothing is stored server-side beyond this response — this is an
 * on-demand lookup, not a catalog.
 */
const findMatchesForCheck = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT image_path FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1', [
    req.params.id,
    req.user.id,
  ]);

  if (rows.length === 0) {
    throw new ApiError(404, 'Product check not found.');
  }

  const absoluteImagePath = path.join(uploadRoot, path.basename(rows[0].image_path));

  let result;
  try {
    result = await findProductMatches({ absoluteImagePath });
  } catch (err) {
    throw new ApiError(502, "We couldn't search for this product online. Please try again.", err.message);
  }

  res.json(result);
});

module.exports = { findMatchesForCheck };
