const path = require('path');
const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadRoot } = require('../middleware/upload');
const { findProductMatches } = require('../services/productMatchService');
const webSearch = require('../services/webSearchService');
const { getApproximateLocationFromIp, getClientIp } = require('../services/locationService');

/**
 * POST /api/product-checks/:id/matches
 *
 * Finds real, existing product pages that visually match this check's
 * photo (via Google Vision Web Detection) and returns links to them.
 * Nothing is stored server-side beyond this response — this is an
 * on-demand lookup, not a catalog.
 */
const findMatchesForCheck = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT image_path, detected_name, detected_brand, detected_category, confidence
     FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1`,
    [
    req.params.id,
    req.user.id,
  ]
  );

  if (rows.length === 0) {
    throw new ApiError(404, 'Product check not found.');
  }

  const absoluteImagePath = path.join(uploadRoot, path.basename(rows[0].image_path));

  // Real web search (SerpApi) when configured. Coarse city only: one the
  // client sent, else a best-effort IP lookup (null on private/dev IPs).
  // Never stored, never sent to SerpApi as anything but a word in the query.
  if (webSearch.isConfigured()) {
    const row = rows[0];
    let city = req.body?.city ? String(req.body.city).trim().slice(0, 60) : null;
    if (!city) city = (await getApproximateLocationFromIp(getClientIp(req)))?.city || null;

    try {
      return res.json(
        await webSearch.searchProductWeb({
          name: row.detected_name,
          brand: row.detected_brand,
          category: row.detected_category,
          confidence: row.confidence !== null ? Number(row.confidence) : null,
          city,
        })
      );
    } catch (err) {
      throw new ApiError(502, "We couldn't search for this product online. Please try again.", err.message);
    }
  }

  let result;
  try {
    result = await findProductMatches({ absoluteImagePath });
  } catch (err) {
    throw new ApiError(502, "We couldn't search for this product online. Please try again.", err.message);
  }

  res.json(result);
});

module.exports = { findMatchesForCheck };
