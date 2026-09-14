const { pool } = require('../db/connection');
const asyncHandler = require('../utils/asyncHandler');
const { toAbsoluteUrl } = require('../utils/imageUrl');

/**
 * GET /api/history
 *
 * History is simply the authenticated user's product checks, in the shape
 * the mobile app's history screens expect. There is no separate "history"
 * table — every check is, by definition, a checked product.
 */
const getHistory = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM product_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
    [req.user.id]
  );

  const history = rows.map((row) => ({
    id: String(row.id),
    name: row.detected_name || 'Unnamed product',
    imageUri: toAbsoluteUrl(row.image_path),
    checkedAt: row.created_at,
    // A row created purely by "Save Product" on a fresh capture (never run
    // through AI) has no ai_provider and isn't a mock result either — it's
    // an unanalyzed placeholder, so don't claim it was analyzed.
    hasAnalysis: !!(row.ai_provider || row.is_mock),
    hasVisualization: !!row.has_visualization,
  }));

  res.json({ history });
});

module.exports = { getHistory };
