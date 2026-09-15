const { pool } = require('../db/connection');
const asyncHandler = require('../utils/asyncHandler');
const { optionalNumber } = require('../utils/validate');
const { analyzeHomeNeeds } = require('../services/aiService');
const { searchProducts } = require('../services/productService');
const { getApproximateLocationFromIp, getClientIp } = require('../services/locationService');

/**
 * POST /api/find-for-my-home
 * body (all optional): { category, budget, city }
 *
 * Understands the user's actual home (rooms + AI-detected items, plus a
 * little recent product-check context), searches real-product-source
 * candidates (mock for now — see productService.js), and asks the AI to
 * decide which candidates are genuinely useful and why — never simply
 * "here is furniture", and it is correct for it to recommend nothing.
 */
const findForMyHome = asyncHandler(async (req, res) => {
  const category = req.body.category ? String(req.body.category).trim() : null;
  const budget = optionalNumber(req.body.budget);
  const manualCity = req.body.city ? String(req.body.city).trim() : null;

  const [roomRows] = await pool.query('SELECT id, name, room_type FROM rooms WHERE user_id = ?', [req.user.id]);
  const rooms = roomRows.map((r) => ({ id: String(r.id), name: r.name, roomType: r.room_type }));

  const [itemRows] = await pool.query(
    `SELECT ui.name, ui.category, r.name AS room_name
     FROM user_items ui
     LEFT JOIN rooms r ON r.id = ui.room_id
     WHERE ui.user_id = ?`,
    [req.user.id]
  );
  const userItems = itemRows.map((i) => ({ name: i.name, category: i.category, roomName: i.room_name || null }));

  const [checkRows] = await pool.query(
    `SELECT detected_name AS name, detected_category AS category
     FROM product_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
    [req.user.id]
  );

  // Location: an explicit city the user typed always wins. Otherwise, try a
  // best-effort IP lookup — which resolves to "unknown" for any private/dev
  // IP (see locationService.js) rather than fabricating a location. The raw
  // IP itself is never stored or returned.
  let location = { city: manualCity, source: manualCity ? 'manual' : 'unknown' };
  if (!manualCity) {
    const geo = await getApproximateLocationFromIp(getClientIp(req));
    if (geo?.city) {
      location = { city: geo.city, region: geo.region, country: geo.country, source: 'ip' };
    }
  }

  const { isMock: productsAreMock, products: candidateProducts } = await searchProducts({
    category,
    city: location.city,
  });

  const affordableProducts =
    budget != null ? candidateProducts.filter((p) => p.price == null || p.price <= budget) : candidateProducts;

  const aiResult = await analyzeHomeNeeds({
    rooms,
    userItems,
    candidateProducts: affordableProducts,
    recentProductChecks: checkRows,
  });

  const productsById = new Map(affordableProducts.map((p) => [p.id, p]));
  const recommendations = aiResult.recommendations
    .map((r) => {
      const product = productsById.get(r.productId);
      return product ? { ...product, reason: r.reason } : null;
    })
    .filter(Boolean);

  res.json({
    summary: aiResult.summary,
    isMock: aiResult.isMock || productsAreMock,
    location,
    recommendations,
  });
});

module.exports = { findForMyHome };
