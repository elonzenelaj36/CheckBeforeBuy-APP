/**
 * Cleans a background-removed product image and measures how suitable it is
 * for single-image 3D generation. Pure image math on the pixels (sharp +
 * typed arrays) — no AI calls, no network.
 *
 * cleanAndMeasure()  — drops small detached fragments (background-removal
 *                      specks), then measures the product.
 * assessQuality()    — turns the measurements into user-facing warnings.
 *                      Thresholds are deliberately conservative: a warning
 *                      only means "this may give an inaccurate 3D model",
 *                      and the user can always continue.
 */

const sharp = require('sharp');

const ALPHA_ON = 128;
/** Detached pieces smaller than this share of the main piece are removed. */
const ISLAND_MAX_SHARE = 0.015;
/** Products smaller than this (longest side, px) are too low-resolution for good 3D. */
const MIN_PRODUCT_SIDE = 320;
/** Longest side the sharpness metric is computed at (so it doesn't depend on photo resolution). */
const SHARPNESS_SIDE = 512;

/** 4-connected components of the opaque mask; returns labels + areas (index = label). */
function labelComponents(alpha, width, height) {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const areas = [0];
  let next = 0;
  for (let start = 0; start < alpha.length; start++) {
    if (alpha[start] < ALPHA_ON || labels[start]) continue;
    next += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = next;
    let area = 0;
    while (head < tail) {
      const i = queue[head++];
      area += 1;
      const x = i % width;
      if (x > 0 && !labels[i - 1] && alpha[i - 1] >= ALPHA_ON) (labels[i - 1] = next), (queue[tail++] = i - 1);
      if (x < width - 1 && !labels[i + 1] && alpha[i + 1] >= ALPHA_ON) (labels[i + 1] = next), (queue[tail++] = i + 1);
      if (i >= width && !labels[i - width] && alpha[i - width] >= ALPHA_ON) (labels[i - width] = next), (queue[tail++] = i - width);
      if (i < alpha.length - width && !labels[i + width] && alpha[i + width] >= ALPHA_ON) {
        labels[i + width] = next;
        queue[tail++] = i + width;
      }
    }
    areas.push(area);
  }
  return { labels, areas };
}

/**
 * Sharpness = standard deviation of the Laplacian inside the product (edges
 * of the mask excluded), at a fixed scale. Low values = blurry.
 */
async function measureSharpness(rgba, width, height, box) {
  const cropW = box.maxX - box.minX + 1;
  const cropH = box.maxY - box.minY + 1;
  const { data, info } = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left: box.minX, top: box.minY, width: cropW, height: cropH })
    .resize({ width: SHARPNESS_SIDE, height: SHARPNESS_SIDE, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const grey = new Float32Array(w * h);
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    inside[i] = data[i * 4 + 3] >= 250 ? 1 : 0;
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      // only where the whole 5x5 neighbourhood is product, so the cut-out edge doesn't count as detail
      let ok = 1;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) ok = inside[i + dy * w + dx];
      if (!ok) continue;
      const lap = grey[i - 1] + grey[i + 1] + grey[i - w] + grey[i + w] - 4 * grey[i];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n < 500) return null; // too little interior to judge (e.g. very thin products)
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
}

/**
 * @param {Buffer} transparentPng - background-removed image at the ORIGINAL photo size
 * @returns {Promise<{png: Buffer, metrics: object|null}>} cleaned PNG (same size) + measurements
 */
async function cleanAndMeasure(transparentPng) {
  const { data, info } = await sharp(transparentPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = width * height;
  const alpha = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) alpha[i] = data[i * 4 + 3];

  const { labels, areas } = labelComponents(alpha, width, height);
  if (areas.length <= 1) return { png: transparentPng, metrics: null }; // nothing opaque

  // Keep the main piece and every piece that isn't a tiny detached speck.
  let mainLabel = 1;
  for (let l = 2; l < areas.length; l++) if (areas[l] > areas[mainLabel]) mainLabel = l;
  const minKeep = areas[mainLabel] * ISLAND_MAX_SHARE;
  let removedPieces = 0;
  const keep = new Uint8Array(areas.length);
  for (let l = 1; l < areas.length; l++) {
    keep[l] = areas[l] >= minKeep ? 1 : 0;
    if (!keep[l]) removedPieces += 1;
  }

  let opaque = 0;
  let lumaSum = 0;
  const box = { minX: width, minY: height, maxX: -1, maxY: -1 };
  const edge = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let i = 0; i < pixels; i++) {
    const label = labels[i];
    if (label && !keep[label]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    if (!label) continue;
    opaque += 1;
    lumaSum += 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    const x = i % width;
    const y = (i - x) / width;
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
    if (y === 0) edge.top += 1;
    if (y === height - 1) edge.bottom += 1;
    if (x === 0) edge.left += 1;
    if (x === width - 1) edge.right += 1;
  }

  const boxW = box.maxX - box.minX + 1;
  const boxH = box.maxY - box.minY + 1;
  const metrics = {
    photoWidth: width,
    photoHeight: height,
    productWidth: boxW,
    productHeight: boxH,
    /** Share of the photo the product's bounding box covers. */
    boxShare: (boxW * boxH) / pixels,
    /** Share of the bounding box that is product (low = spindly or a broken mask). */
    fill: opaque / (boxW * boxH),
    /**
     * How much of the product's own width/height runs into each photo edge
     * (0..1) — relative to the product, so thin legs cut by the frame count.
     */
    edgeContact: {
      top: edge.top / boxW,
      bottom: edge.bottom / boxW,
      left: edge.left / boxH,
      right: edge.right / boxH,
    },
    brightness: lumaSum / opaque,
    // Not judged for tiny products: they'd be upscaled and always look soft (they get "small" instead).
    sharpness: Math.max(boxW, boxH) >= MIN_PRODUCT_SIDE ? await measureSharpness(data, width, height, box) : null,
    removedPieces,
  };

  const png = removedPieces
    ? await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer()
    : transparentPng;
  return { png, metrics };
}

/**
 * @returns {{ok: boolean, warnings: Array<{code: string, message: string}>}}
 */
function assessQuality(m) {
  if (!m) return { ok: true, warnings: [] };
  const warnings = [];
  const add = (code, message) => warnings.push({ code, message });

  // Product runs into the photo edge (e.g. legs cut off by the frame) — more than a graze.
  const contactPx = {
    top: m.edgeContact.top * m.productWidth,
    bottom: m.edgeContact.bottom * m.productWidth,
    left: m.edgeContact.left * m.productHeight,
    right: m.edgeContact.right * m.productHeight,
  };
  const cut = Object.keys(contactPx).some((side) => m.edgeContact[side] > 0.02 && contactPx[side] >= 6);
  const coversPhoto = m.boxShare > 0.9 && m.fill > 0.9;
  if (coversPhoto) add('background', 'The background may not have been fully removed.');
  else if (cut) add('cut_off', 'Part of the product seems to be cut off at the edge of the photo.');

  if (Math.max(m.productWidth, m.productHeight) < MIN_PRODUCT_SIDE) add('small', 'The product is small in the photo — move closer.');
  if (m.fill < 0.12) add('sparse', 'Only a small part of the product was found in the photo.');
  if (m.brightness < 40) add('dark', 'The photo is very dark.');
  else if (m.brightness > 240) add('bright', 'The photo is very bright or washed out.');
  if (m.sharpness !== null && m.sharpness < 2.5) add('blurry', 'The photo looks blurry.');

  return { ok: warnings.length === 0, warnings };
}

module.exports = { cleanAndMeasure, assessQuality };
