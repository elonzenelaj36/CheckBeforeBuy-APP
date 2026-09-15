const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { requireString } = require('../utils/validate');
const { relativeUploadPath } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');

function serialize(row) {
  return {
    id: String(row.saved_id),
    productId: String(row.product_id),
    productCheckId: row.product_check_id ? String(row.product_check_id) : null,
    name: row.name,
    category: row.category,
    imageUri: toAbsoluteUrl(row.image_path),
    savedAt: row.saved_at,
  };
}

const SELECT_SAVED = `
  SELECT sp.id AS saved_id, sp.created_at AS saved_at, sp.product_check_id,
         p.id AS product_id, p.name, p.category, p.image_path
  FROM saved_products sp
  JOIN products p ON p.id = sp.product_id
  WHERE sp.user_id = ?
  ORDER BY sp.created_at DESC
`;

const SELECT_ONE_SAVED = `
  SELECT sp.id AS saved_id, sp.created_at AS saved_at, sp.product_check_id,
         p.id AS product_id, p.name, p.category, p.image_path
  FROM saved_products sp
  JOIN products p ON p.id = sp.product_id
  WHERE sp.user_id = ? AND p.id = ?
  LIMIT 1
`;

/** GET /api/saved-products */
const listSavedProducts = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(SELECT_SAVED, [req.user.id]);
  res.json({ savedProducts: rows.map(serialize) });
});

/**
 * POST /api/saved-products
 * multipart/form-data: name (required), category (optional), image (optional file),
 * productId (optional — link an existing product instead of creating a new one),
 * productCheckId (optional — link an existing, already-checked product: reuses
 * that check's product row instead of creating a new one, and records the
 * relationship so History and Saved Products stay in sync)
 *
 * One "checked product" must not silently become two unrelated `products`
 * rows just because the user saved it — see the comment on the
 * saved_products table in database/schema.sql.
 */
const createSavedProduct = asyncHandler(async (req, res) => {
  const name = requireString(req.body.name, 'Product name', { maxLength: 255 });
  const category = req.body.category ? String(req.body.category).trim() : null;

  let productId = req.body.productId ? Number(req.body.productId) : null;
  const requestedProductCheckId = req.body.productCheckId ? Number(req.body.productCheckId) : null;
  let productCheckId = null;

  if (requestedProductCheckId) {
    // Saving a product that was already checked (opened from History, or
    // right after analysis): reuse that check's product, don't duplicate it.
    const [checkRows] = await pool.query(
      'SELECT id, product_id FROM product_checks WHERE id = ? AND user_id = ? LIMIT 1',
      [requestedProductCheckId, req.user.id]
    );
    if (checkRows.length === 0) {
      throw new ApiError(400, 'productCheckId does not belong to you.');
    }
    if (!checkRows[0].product_id) {
      throw new ApiError(400, 'That product check has no associated product.');
    }
    productId = checkRows[0].product_id;
    productCheckId = requestedProductCheckId;

    // Respect a name the user typed on this screen (e.g. they tweaked it
    // right before saving) by keeping the shared product row — and any
    // room visualization generated from this same check — in sync.
    await pool.query('UPDATE products SET name = ? WHERE id = ?', [name, productId]);
    await pool.query('UPDATE product_checks SET detected_name = ? WHERE id = ?', [
      name,
      requestedProductCheckId,
    ]);
    await pool.query('UPDATE generated_images SET product_name = ? WHERE product_check_id = ?', [
      name,
      requestedProductCheckId,
    ]);
  } else if (!productId) {
    // Brand-new capture, never analyzed or opened from an existing record.
    // Create the shared product row, and — if we actually have a photo —
    // a matching "unanalyzed" product_checks row too, so this save also
    // shows up in History instead of requiring a separate action.
    const relativeImagePath = req.file ? relativeUploadPath(req.file) : null;

    const [productResult] = await pool.query(
      'INSERT INTO products (name, category, image_path) VALUES (?, ?, ?)',
      [name, category, relativeImagePath]
    );
    productId = productResult.insertId;

    if (relativeImagePath) {
      const [checkResult] = await pool.query(
        `INSERT INTO product_checks (user_id, product_id, image_path, detected_name, detected_category)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, productId, relativeImagePath, name, category]
      );
      productCheckId = checkResult.insertId;
    }
  }

  await pool.query(
    'INSERT INTO saved_products (user_id, product_id, product_check_id) VALUES (?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE product_check_id = COALESCE(VALUES(product_check_id), product_check_id)',
    [req.user.id, productId, productCheckId]
  );

  const [rows] = await pool.query(SELECT_ONE_SAVED, [req.user.id, productId]);

  res.status(201).json(serialize(rows[0]));
});

/** DELETE /api/saved-products/:id */
const deleteSavedProduct = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM saved_products WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Saved product not found.');
  res.status(204).end();
});

module.exports = { listSavedProducts, createSavedProduct, deleteSavedProduct };
