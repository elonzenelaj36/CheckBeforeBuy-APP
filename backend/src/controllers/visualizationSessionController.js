const fs = require('fs');
const path = require('path');
const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { relativeUploadPath, uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { generateRoomVisualization } = require('../services/imageGenerationService');

const MAX_PRODUCTS = 8;

function discardUploads(files) {
  Object.values(files || {})
    .flat()
    .forEach((f) => fs.promises.unlink(f.path).catch(() => {}));
}

function parseProducts(raw) {
  let products;
  try {
    products = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new ApiError(400, 'products must be valid JSON.');
  }
  if (!Array.isArray(products) || products.length === 0) throw new ApiError(400, 'At least one product is required.');
  if (products.length > MAX_PRODUCTS) throw new ApiError(400, `At most ${MAX_PRODUCTS} products are allowed.`);
  return products;
}

/** Keeps only a well-formed { x, y, width } in 0..1; anything else is ignored. */
function parsePlacement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const nums = [raw.x, raw.y, raw.width].map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return null;
  const [x, y, width] = nums;
  return { x, y, width };
}

/**
 * The product's layer in the user's Arrange composition, or null if missing
 * or malformed (then the request falls back to the legacy placement prompt).
 *   raw: { x, y, width, rotation, aspect, zIndex, source: 'frame'|'cutout'|'photo', cutoutId? }
 *   x/y/width normalized to the room image (0..1), rotation in radians.
 */
function parseLayer(raw, { layerFile, cutoutPath, photoPath }) {
  if (!raw || typeof raw !== 'object') return null;
  const [x, y, width, rotation, aspect, zIndex] = [raw.x, raw.y, raw.width, raw.rotation, raw.aspect, raw.zIndex].map(Number);
  if (![x, y, width, rotation, aspect, zIndex].every(Number.isFinite)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1 || width <= 0 || width > 1 || aspect < 0.05 || aspect > 20) return null;

  // The image the layer shows in the app: a 3D view (uploaded), the cutout, or the original photo.
  let imagePath = null;
  if (raw.source === 'frame') imagePath = layerFile ? layerFile.path : null;
  else if (raw.source === 'cutout') imagePath = cutoutPath;
  else if (raw.source === 'photo') imagePath = photoPath;
  if (!imagePath) return null;

  return {
    imagePath,
    source: raw.source,
    fit: raw.source === 'photo' ? 'cover' : 'contain',
    transform: { x, y, width, rotation, aspect, zIndex },
  };
}

/** Absolute path of a background-removed cutout, if it exists on this server. */
function cutoutFile(cutoutId) {
  if (!/^[a-f0-9]{32}$/.test(String(cutoutId || ''))) return null;
  const file = path.join(uploadRoot, `cutout-${cutoutId}.png`);
  return fs.existsSync(file) ? file : null;
}

/**
 * POST /api/generated-images/session   (multipart/form-data)
 *   roomId, products (JSON: [{ name, category?, brand?, model?, characteristics?, productCheckId?,
 *     placement? { x, y, width } — normalized 0..1, only for products the user arranged,
 *     layer? — the product's Arrange layer, see parseLayer() }]),
 *   productImage0..productImage7 (file per product, in the same order; omit for a
 *   product that has productCheckId — its saved photo is used),
 *   layerImage0..layerImage7 (the 3D view a layer shows, for layers with source 'frame').
 *
 * When every product has a layer, AI Render uses the exact Arrange composition
 * (room photo + layers) as its spatial reference. Only the room's ORIGINAL
 * saved photo, the product photos/cutouts and the current Arrange layers are
 * inputs; a previous generation is never fed back in.
 *
 * Calls the existing Cloudflare generation service and stores the result as a
 * generated_images row (same as POST /generated-images does for one product).
 */
const generateSession = asyncHandler(async (req, res) => {
  const files = req.files || {};
  try {
    const roomId = Number(req.body.roomId);
    if (!roomId) throw new ApiError(400, 'roomId is required.');
    const products = parseProducts(req.body.products);

    const [roomRows] = await pool.query('SELECT * FROM rooms WHERE id = ? AND user_id = ?', [roomId, req.user.id]);
    if (roomRows.length === 0) throw new ApiError(404, 'Room not found.');
    const roomType = roomRows[0].room_type;

    const [photoRows] = await pool.query(
      'SELECT image_path FROM room_photos WHERE room_id = ? ORDER BY is_primary DESC, created_at ASC LIMIT 1',
      [roomId]
    );
    const roomImagePath = photoRows[0]?.image_path || null;
    if (!roomImagePath) throw new ApiError(400, 'This room has no photo yet. Add a photo to the room first.');

    const resolved = [];
    for (let i = 0; i < products.length; i += 1) {
      const meta = products[i] || {};
      const file = files[`productImage${i}`]?.[0];
      let storedPath = file ? relativeUploadPath(file) : null;
      let checkId = null;

      if (meta.productCheckId) {
        const [checkRows] = await pool.query('SELECT id, image_path FROM product_checks WHERE id = ? AND user_id = ?', [
          Number(meta.productCheckId),
          req.user.id,
        ]);
        if (checkRows.length === 0) throw new ApiError(400, 'productCheckId does not belong to you.');
        checkId = checkRows[0].id;
        storedPath = storedPath || checkRows[0].image_path;
      }
      if (!storedPath) throw new ApiError(400, `Product ${i + 1} has no image.`);

      const imagePath = path.join(uploadRoot, path.basename(storedPath));
      const cutoutPath = cutoutFile(meta.layer?.cutoutId);
      resolved.push({
        storedPath,
        checkId,
        imagePath,
        // What the product really looks like: its cutout (no background), else the photo.
        appearancePath: cutoutPath || imagePath,
        layer: parseLayer(meta.layer, { layerFile: files[`layerImage${i}`]?.[0], cutoutPath, photoPath: imagePath }),
        name: String(meta.name || `Product ${i + 1}`).slice(0, 120),
        category: meta.category || null,
        brand: meta.brand || null,
        model: meta.model || null,
        placement: parsePlacement(meta.placement),
      });
    }

    const names = resolved.map((p) => p.name).join(', ').slice(0, 255);
    const [insert] = await pool.query(
      `INSERT INTO generated_images
         (user_id, room_id, product_check_id, product_name, source_room_image_path, source_product_image_path, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, roomId, resolved[0].checkId, names, roomImagePath, resolved[0].storedPath]
    );
    const generatedImageId = insert.insertId;

    const arranged = resolved.every((p) => p.layer);
    console.log(
      `[imageGeneration] REAL generation (${arranged ? 'arranged' : 'legacy'}): room ${roomId} + ${resolved.length} product(s): ${names}`
    );
    let generation;
    try {
      generation = await generateRoomVisualization({
        roomImagePath: path.join(uploadRoot, path.basename(roomImagePath)),
        products: resolved,
        roomType,
      });
    } catch (err) {
      generation = { status: 'failed', generatedImagePath: null, provider: null, message: err.message };
    }

    await pool.query('UPDATE generated_images SET status = ?, generated_image_path = ?, provider = ? WHERE id = ?', [
      generation.status,
      generation.generatedImagePath,
      generation.provider,
      generatedImageId,
    ]);
    for (const id of new Set(resolved.map((p) => p.checkId).filter(Boolean))) {
      await pool.query('UPDATE product_checks SET has_visualization = TRUE WHERE id = ?', [id]);
    }

    res.status(201).json({
      success: generation.status === 'completed',
      status: generation.status,
      id: String(generatedImageId),
      generatedImage: toAbsoluteUrl(generation.generatedImagePath),
      productsUsed: resolved.length,
      message: generation.message || null,
    });
  } finally {
    // A request that failed validation must not leave uploads behind; on success the
    // product photos are kept because generated_images references them. Layer
    // images (3D views) are only needed for this one generation.
    if (!res.headersSent) discardUploads(files);
    else discardUploads(Object.fromEntries(Object.entries(files).filter(([field]) => field.startsWith('layerImage'))));
  }
});

module.exports = { generateSession };
