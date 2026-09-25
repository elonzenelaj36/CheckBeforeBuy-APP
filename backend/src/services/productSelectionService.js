/**
 * Choosing WHICH product in a photo becomes the 3D object.
 *
 * decideRoute()     — automatic (the photo clearly shows one product) or
 *                     manual selection (several / unclear / none / unknown).
 * cropToSelection() — turns the user's freehand outline into a product image
 *                     that goes into the SAME existing pipeline (background
 *                     removal → 3D) as an automatic photo.
 *
 * Neither function generates anything or calls a paid API; detection uses
 * the existing Groq analysis provider (aiService.detectProductsInImage).
 */

const sharp = require('sharp');
const { detectProductsInImage, DetectionUnavailableError } = require('./aiService');

/** Below this self-reported confidence a "single product" answer is treated as uncertain. */
const MIN_CONFIDENCE = 0.6;
const MAX_OUTPUT_SIDE = 2048;
/** Margin kept around the outline, as a fraction of the selection size. */
const CROP_PADDING = 0.04;

/**
 * Automatic only when the AI clearly sees exactly one, fully visible product.
 * Anything else — more candidates, a cut-off/hidden product, nothing
 * recognisable, low confidence — asks the user, so the wrong object is never
 * converted.
 *
 * @returns {{route: 'auto'|'select', reason: 'single'|'multiple'|'uncertain'|'none'}}
 */
function decideRoute({ products, singleClearProduct, confidence }) {
  if (products.length === 0) return { route: 'select', reason: 'none' };
  if (products.length > 1) return { route: 'select', reason: 'multiple' };
  const [only] = products;
  const confident = confidence === null || confidence >= MIN_CONFIDENCE;
  if (singleClearProduct && only.fullyVisible && confident) return { route: 'auto', reason: 'single' };
  return { route: 'select', reason: 'uncertain' };
}

/**
 * @returns {Promise<{route: 'auto'|'select', reason: 'single'|'multiple'|'uncertain'|'none'|'unavailable', products: string[]}>}
 */
async function detectProductRoute({ imagePath }) {
  try {
    const detection = await detectProductsInImage({ absoluteImagePath: imagePath });
    return { ...decideRoute(detection), products: detection.products.map((p) => p.name) };
  } catch (err) {
    // Can't tell → let the user choose rather than guess.
    if (!(err instanceof DetectionUnavailableError)) console.error('[productSelection] detection failed:', err.message);
    return { route: 'select', reason: 'unavailable', products: [] };
  }
}

/** Validates [{x, y}] points normalized to the image (0..1). */
function parsePolygon(raw) {
  let points;
  try {
    points = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(points) || points.length < 3 || points.length > 2000) return null;
  const clean = points.map((p) => ({ x: Number(p?.x), y: Number(p?.y) }));
  if (clean.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  return clean.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }));
}

/**
 * Keeps only what's inside the outline (outside → white), crops around it and
 * returns a PNG. The original photo is only read, never modified.
 *
 * @param {object} params
 * @param {string} params.imagePath - the ORIGINAL photo
 * @param {Array<{x: number, y: number}>} params.polygon - normalized to the displayed (EXIF-oriented) image
 * @returns {Promise<Buffer>}
 */
async function cropToSelection({ imagePath, polygon }) {
  // Orient like the phone displays it, so normalized points line up.
  const { data: oriented, info } = await sharp(imagePath).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pts = polygon.map((p) => [p.x * width, p.y * height]);

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const padX = (box.maxX - box.minX) * CROP_PADDING;
  const padY = (box.maxY - box.minY) * CROP_PADDING;
  const left = Math.max(0, Math.floor(box.minX - padX));
  const top = Math.max(0, Math.floor(box.minY - padY));
  const cropWidth = Math.min(width, Math.ceil(box.maxX + padX)) - left;
  const cropHeight = Math.min(height, Math.ceil(box.maxY + padY)) - top;
  if (cropWidth < 16 || cropHeight < 16) throw new Error('Selection is too small.');

  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="#fff"/></svg>`
  );

  const masked = await sharp(oriented)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp(masked)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .flatten({ background: '#ffffff' }) // plain white outside the outline — safe input for every later step
    .resize({ width: MAX_OUTPUT_SIDE, height: MAX_OUTPUT_SIDE, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

module.exports = { decideRoute, detectProductRoute, parsePolygon, cropToSelection };
