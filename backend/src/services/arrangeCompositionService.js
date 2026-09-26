/**
 * Rebuilds the user's ARRANGE composition as one flat image — the exact
 * picture the app's RoomComposer shows — so AI Render can use it as its
 * spatial reference instead of placing products on its own.
 *
 * Mirrors RoomComposer.tsx (keep them in sync):
 *   - canvas aspect = room photo aspect clamped to 0.5..2; the room photo is
 *     stretched to fill it (resizeMode "stretch")
 *   - each product layer: box width = transform.width × canvas width,
 *     box height = box width / transform.aspect, centered at
 *     (transform.x, transform.y) × canvas size, rotated by transform.rotation
 *     (radians, clockwise) around its center
 *   - the layer image is drawn "contain" in its box (3D frame or cutout) or
 *     "cover" (original photo, when no cutout exists yet)
 *   - layers are drawn in zIndex order (higher = on top)
 *
 * Pure pixel work with sharp — no AI, no network.
 */

const sharp = require('sharp');

/** Same clamp as the Visualization screen's canvas. */
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2;

/**
 * Canvas size for a room photo: its (clamped) aspect ratio, longest side
 * `maxSide`, both sides multiples of 16 (what FLUX.2 expects for output sizes).
 */
async function canvasSize(roomImagePath, maxSide) {
  const meta = await sharp(roomImagePath).metadata();
  // EXIF orientations 5-8 are rotated by 90°: the displayed width/height are swapped.
  const swap = meta.orientation && meta.orientation >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width && height ? width / height : 4 / 3));
  const round16 = (n) => Math.max(256, Math.round(n / 16) * 16);
  return aspect >= 1
    ? { width: round16(maxSide), height: round16(maxSide / aspect) }
    : { width: round16(maxSide * aspect), height: round16(maxSide) };
}

/** Renders one layer (fit into its box, then rotated). Returns the RGBA PNG and its size. */
async function renderLayer(layer, canvasW) {
  const boxW = Math.max(1, Math.round(layer.transform.width * canvasW));
  const boxH = Math.max(1, Math.round(boxW / layer.transform.aspect));
  let image = await sharp(layer.imagePath)
    .rotate() // honor EXIF orientation of original photos
    .ensureAlpha()
    .resize({
      width: boxW,
      height: boxH,
      fit: layer.fit === 'cover' ? 'cover' : 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const degrees = (layer.transform.rotation * 180) / Math.PI;
  if (Math.abs(degrees % 360) > 0.01) {
    // sharp rotates clockwise for positive angles (like React Native's rotate) and grows the canvas around the center.
    image = await sharp(image).rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  const meta = await sharp(image).metadata();
  return { image, width: meta.width, height: meta.height };
}

/**
 * Places a rendered layer centered at (cx, cy), clipped to the canvas
 * (a layer may hang over the room's edge, as it can in the app).
 */
async function placeLayer(rendered, cx, cy, canvasW, canvasH) {
  const left = Math.round(cx - rendered.width / 2);
  const top = Math.round(cy - rendered.height / 2);
  const cropLeft = Math.max(0, -left);
  const cropTop = Math.max(0, -top);
  const visibleW = Math.min(rendered.width - cropLeft, canvasW - Math.max(0, left));
  const visibleH = Math.min(rendered.height - cropTop, canvasH - Math.max(0, top));
  if (visibleW <= 0 || visibleH <= 0) return null; // entirely off the room
  const input =
    cropLeft || cropTop || visibleW < rendered.width || visibleH < rendered.height
      ? await sharp(rendered.image).extract({ left: cropLeft, top: cropTop, width: visibleW, height: visibleH }).png().toBuffer()
      : rendered.image;
  return { input, left: Math.max(0, left), top: Math.max(0, top) };
}

/**
 * @param {object} params
 * @param {string} params.roomImagePath - absolute path of the ORIGINAL room photo
 * @param {Array<{imagePath: string, fit: 'contain'|'cover', transform: {x: number, y: number, width: number, rotation: number, aspect: number, zIndex: number}}>} params.layers
 * @param {number} params.maxSide - longest side of the composition
 * @returns {Promise<{buffer: Buffer, width: number, height: number}>} PNG of the arranged scene
 */
async function composeArrangement({ roomImagePath, layers, maxSide }) {
  const { width, height } = await canvasSize(roomImagePath, maxSide);
  const room = await sharp(roomImagePath).rotate().resize({ width, height, fit: 'fill' }).png().toBuffer();

  const composites = [];
  const ordered = [...layers].sort((a, b) => a.transform.zIndex - b.transform.zIndex);
  for (const layer of ordered) {
    const rendered = await renderLayer(layer, width);
    const placed = await placeLayer(rendered, layer.transform.x * width, layer.transform.y * height, width, height);
    if (placed) composites.push(placed);
  }

  const buffer = await sharp(room).composite(composites).png().toBuffer();
  return { buffer, width, height };
}

module.exports = { composeArrangement };
