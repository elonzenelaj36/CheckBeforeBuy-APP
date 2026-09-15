const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { optionalNumber, requireString } = require('../utils/validate');
const { relativeUploadPath, uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { analyzeProductImage } = require('../services/aiService');
const path = require('path');

function serializeCheck(row) {
  return {
    id: String(row.id),
    product: {
      id: row.product_id ? String(row.product_id) : null,
      name: row.detected_name,
      category: row.detected_category,
      brand: row.detected_brand,
    },
    analysis: {
      description: row.description,
      estimatedPrice:
        row.estimated_price !== null && row.estimated_price !== undefined ? Number(row.estimated_price) : null,
      estimatedPriceMin: row.estimated_price_min !== null ? Number(row.estimated_price_min) : null,
      estimatedPriceMax: row.estimated_price_max !== null ? Number(row.estimated_price_max) : null,
      currency: row.currency,
      userPrice: row.user_price !== null ? Number(row.user_price) : null,
      priceAssessment: row.price_assessment,
      recommendation: row.recommendation,
      confidence: row.confidence !== null ? Number(row.confidence) : null,
      isMock: !!row.is_mock,
    },
    imageUrl: toAbsoluteUrl(row.image_path),
    hasVisualization: !!row.has_visualization,
    createdAt: row.created_at,
  };
}

/**
 * POST /api/product-checks
 * multipart/form-data: image (required), userPrice (optional)
 *
 * Flow: save uploaded photo -> call AI service -> upsert a `products` row
 * -> insert a `product_checks` row -> (if a price was estimated) record it
 * in `price_history` -> return the structured analysis.
 */
const createProductCheck = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'An "image" file is required.');
  }

  const userPrice = optionalNumber(req.body.userPrice);
  const userProductName = req.body.productName?.trim() || null;
  const relativeImagePath = relativeUploadPath(req.file);
  const absoluteImagePath = path.join(uploadRoot, path.basename(req.file.path));

  const [ownedItems] = await pool.query(
    'SELECT name, category FROM user_items WHERE user_id = ? LIMIT 50',
    [req.user.id]
  );

  let aiResult;
  try {
    aiResult = await analyzeProductImage({
      absoluteImagePath,
      userPrice,
      userItems: ownedItems,
    });
  } catch (err) {
    throw new ApiError(502, "We couldn't analyze this product. Please try again.", err.message);
  }

  const { product, analysis, isMock, provider, model } = aiResult;
  const finalProductName = userProductName || product.name;

  const estimatedPrice =
    analysis.estimatedPriceMin !== null && analysis.estimatedPriceMax !== null
      ? Number(((analysis.estimatedPriceMin + analysis.estimatedPriceMax) / 2).toFixed(2))
      : null;

  const [productResult] = await pool.query(
    `INSERT INTO products (name, category, brand, description, estimated_price, currency, image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      finalProductName,
      product.category,
      product.brand,
      analysis.description,
      estimatedPrice,
      analysis.currency || 'EUR',
      relativeImagePath,
    ]
  );
  const productId = productResult.insertId;

  if (estimatedPrice !== null) {
    await pool.query(
      'INSERT INTO price_history (product_id, price, currency, source) VALUES (?, ?, ?, ?)',
      [productId, estimatedPrice, analysis.currency || 'EUR', isMock ? 'mock' : 'ai_estimate']
    );
  }

  const [checkResult] = await pool.query(
    `INSERT INTO product_checks (
       user_id, product_id, image_path, detected_name, detected_category, detected_brand,
       description, estimated_price, estimated_price_min, estimated_price_max, currency,
       user_price, price_assessment, recommendation, confidence, ai_provider, ai_model,
       ai_raw_response, is_mock
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      productId,
      relativeImagePath,
      finalProductName,
      product.category,
      product.brand,
      analysis.description,
      estimatedPrice,
      analysis.estimatedPriceMin,
      analysis.estimatedPriceMax,
      analysis.currency || 'EUR',
      userPrice,
      analysis.priceAssessment,
      analysis.recommendation,
      analysis.confidence,
      provider,
      model,
      JSON.stringify(aiResult.raw ?? null),
      isMock ? 1 : 0,
    ]
  );

  const [rows] = await pool.query('SELECT * FROM product_checks WHERE id = ?', [checkResult.insertId]);

  res.status(201).json(serializeCheck(rows[0]));
});

/** GET /api/product-checks */
const listProductChecks = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM product_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
    [req.user.id]
  );
  res.json({ productChecks: rows.map(serializeCheck) });
});

/** GET /api/product-checks/:id */
const getProductCheck = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1', [
    req.params.id,
    req.user.id,
  ]);

  if (rows.length === 0) {
    throw new ApiError(404, 'Product check not found.');
  }

  res.json(serializeCheck(rows[0]));
});

/** DELETE /api/product-checks — clears the user's entire check history. */
const clearProductChecks = asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM product_checks WHERE user_id = ?', [req.user.id]);
  res.status(204).end();
});










/** PATCH /api/product-checks/:id — update the user's product name. */
const updateProductCheck = asyncHandler(async (req, res) => {
  const name = requireString(req.body.name, 'Product name', {
    maxLength: 255,
  });

  const [rows] = await pool.query(
    'SELECT id, product_id FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1',
    [req.params.id, req.user.id]
  );

  if (rows.length === 0) {
    throw new ApiError(404, 'Product check not found.');
  }

  const productCheck = rows[0];

  await pool.query(
    'UPDATE product_checks SET detected_name = ? WHERE id = ? AND user_id = ?',
    [name, req.params.id, req.user.id]
  );

  if (productCheck.product_id) {
    await pool.query(
      'UPDATE products SET name = ? WHERE id = ?',
      [name, productCheck.product_id]
    );
  }

  // Any room visualization generated from this check shares its name —
  // generated_images.product_name is a denormalized copy that reads
  // actually resolve live from product_checks (see
  // generatedImageController.js), but this keeps the raw column itself
  // truthful too.
  await pool.query('UPDATE generated_images SET product_name = ? WHERE product_check_id = ?', [
    name,
    req.params.id,
  ]);

  const [updatedRows] = await pool.query(
    'SELECT * FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1',
    [req.params.id, req.user.id]
  );

  res.json(serializeCheck(updatedRows[0]));
});














module.exports = {
  createProductCheck,
  listProductChecks,
  getProductCheck,
  updateProductCheck,
  clearProductChecks,
  serializeCheck,
};