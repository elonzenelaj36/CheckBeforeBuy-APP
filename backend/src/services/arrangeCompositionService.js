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
 *   - a wall-mounted product placed on a detected wall comes with `quad` (its
 *     corners on that wall, from wallGeometry.wallQuad) and `quadImagePath`
 *     (its real photo): the photo is projected into that four-cornered shape
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

/** Projective map of the unit square onto quad q (TL, TR, BR, BL), as a 3×3 matrix (row-major). */
function squareToQuadMatrix(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

function invert3([a, b, c, d, e, f, g, h, i]) {
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/**
 * A wall-mounted product's real photo projected into its quad on a canvas of
 * canvasW × canvasH (any size — the final image uses the photo's own), turned
 * by the layer's 2D rotation around its centre like the app does. The photo
 * sits in the layer box without stretching ("contain"). Returns an RGBA PNG
 * covering the quad's bounding box and its position, or null if off-canvas.
 */
async function warpLayerToQuad(layer, canvasW, canvasH) {
  const cx = layer.transform.x * canvasW;
  const cy = layer.transform.y * canvasH;
  const cos = Math.cos(layer.transform.rotation);
  const sin = Math.sin(layer.transform.rotation);
  const quad = layer.quad.map(([qx, qy]) => {
    const px = qx * canvasW - cx;
    const py = qy * canvasH - cy;
    return [cx + px * cos - py * sin, cy + px * sin + py * cos];
  });
  const left = Math.max(0, Math.floor(Math.min(...quad.map((p) => p[0]))));
  const top = Math.max(0, Math.floor(Math.min(...quad.map((p) => p[1]))));
  const w = Math.min(canvasW, Math.ceil(Math.max(...quad.map((p) => p[0])))) - left;
  const h = Math.min(canvasH, Math.ceil(Math.max(...quad.map((p) => p[1])))) - top;
  if (w <= 0 || h <= 0) return null;

  const { data: src, info } = await sharp(layer.quadImagePath || layer.imagePath)
    .rotate()
    .ensureAlpha()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sw = info.width;
  const sh = info.height;
  const srcAspect = sw / sh;
  const boxAspect = layer.quadAspect || layer.transform.aspect;
  const fillW = srcAspect >= boxAspect ? 1 : srcAspect / boxAspect;
  const fillH = srcAspect >= boxAspect ? boxAspect / srcAspect : 1;
  const inv = invert3(squareToQuadMatrix(quad));
  const span = Math.max(w, h) * Math.min(fillW, fillH); // output px per unit (soft 1-px edge)
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const X = left + x + 0.5;
      const Y = top + y + 0.5;
      const den = inv[6] * X + inv[7] * Y + inv[8];
      const u = ((inv[0] * X + inv[1] * Y + inv[2]) / den - (1 - fillW) / 2) / fillW;
      const v = ((inv[3] * X + inv[4] * Y + inv[5]) / den - (1 - fillH) / 2) / fillH;
      const edge = Math.min(u, 1 - u, v, 1 - v) * span;
      if (edge <= -0.5) continue;
      const coverage = Math.min(1, edge + 0.5);
      const fx = Math.min(sw - 1, Math.max(0, u * sw - 0.5));
      const fy = Math.min(sh - 1, Math.max(0, v * sh - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top2 = src[(y0 * sw + x0) * 4 + c] * (1 - ax) + src[(y0 * sw + x1) * 4 + c] * ax;
        const bottom2 = src[(y1 * sw + x0) * 4 + c] * (1 - ax) + src[(y1 * sw + x1) * 4 + c] * ax;
        out[o + c] = Math.round(top2 * (1 - ay) + bottom2 * ay);
      }
      out[o + 3] = Math.round(out[o + 3] * coverage);
    }
  }
  return { input: await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left, top };
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
  const placedLayers = [];
  const ordered = [...layers].sort((a, b) => a.transform.zIndex - b.transform.zIndex);
  for (const layer of ordered) {
    const exact = Array.isArray(layer.quad) && layer.quad.length === 4;
    let placed;
    if (exact) {
      placed = await warpLayerToQuad(layer, width, height);
    } else {
      const rendered = await renderLayer(layer, width);
      placed = await placeLayer(rendered, layer.transform.x * width, layer.transform.y * height, width, height);
    }
    if (placed) {
      composites.push(placed);
      placedLayers.push({ image: placed.input, left: placed.left, top: placed.top, kind: layer.kind || 'floor', exact, layer });
    }
  }

  const buffer = await sharp(room).composite(composites).png().toBuffer();
  return { buffer, width, height, room, placed: placedLayers };
}

module.exports = { composeArrangement, warpLayerToQuad };
