/**
 * Straight line segments in a room picture — raw material for wall geometry
 * (wallGeometry.js): horizontal room edges give a wall's direction, vertical
 * ones the camera's tilt. Deterministic image maths, no AI:
 *
 *   grey image (≤ 640 px) → light blur → Sobel gradients →
 *   "line-support regions": neighbouring edge pixels whose edge direction
 *   agrees within ±22.5° (the region-growing idea of the LSD line detector) →
 *   each region's principal axis (PCA) → a segment, kept only if it is long
 *   and thin enough to be a real straight edge.
 *
 * Coordinates are normalised 0..1 on the (EXIF-rotated) picture.
 */

const sharp = require('sharp');

const ANALYSIS_SIDE = 640;
const ANGLE_TOLERANCE = Math.PI / 8; // ±22.5°
const MIN_GRADIENT = 18;
const MIN_LENGTH_PX = 22;
const MIN_ELONGATION = 5; // length / thickness
const MAX_SEGMENTS = 400;

async function loadGrey(imagePath) {
  const { data, info } = await sharp(imagePath)
    .rotate()
    .resize(ANALYSIS_SIDE, ANALYSIS_SIDE, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .blur(0.8)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function orientationDiff(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

function detect({ data, w, h }) {
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h); // edge (level-line) orientation in [0, π)
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1] - data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1];
      const gy = data[i + w - 1] + 2 * data[i + w] + data[i + w + 1] - data[i - w - 1] - 2 * data[i - w] - data[i - w + 1];
      mag[i] = Math.hypot(gx, gy);
      let a = (Math.atan2(gy, gx) + Math.PI / 2) % Math.PI;
      if (a < 0) a += Math.PI;
      dir[i] = a;
    }
  }
  const order = [];
  for (let i = 0; i < w * h; i += 1) if (mag[i] > MIN_GRADIENT) order.push(i);
  order.sort((a, b) => mag[b] - mag[a]);

  const used = new Uint8Array(w * h);
  const segments = [];
  const stack = [];
  for (const seed of order) {
    if (used[seed]) continue;
    let sumC = Math.cos(2 * dir[seed]);
    let sumS = Math.sin(2 * dir[seed]);
    let regionAngle = dir[seed];
    const pixels = [seed];
    used[seed] = 1;
    stack.length = 0;
    stack.push(seed);
    while (stack.length) {
      const p = stack.pop();
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
          const q = ny * w + nx;
          if (used[q] || mag[q] <= MIN_GRADIENT || orientationDiff(dir[q], regionAngle) > ANGLE_TOLERANCE) continue;
          used[q] = 1;
          pixels.push(q);
          stack.push(q);
          sumC += Math.cos(2 * dir[q]);
          sumS += Math.sin(2 * dir[q]);
          regionAngle = Math.atan2(sumS, sumC) / 2;
          if (regionAngle < 0) regionAngle += Math.PI;
        }
      }
    }
    if (pixels.length < MIN_LENGTH_PX) continue;

    let sw = 0;
    let mx = 0;
    let my = 0;
    for (const p of pixels) {
      sw += mag[p];
      mx += mag[p] * (p % w);
      my += mag[p] * Math.floor(p / w);
    }
    mx /= sw;
    my /= sw;
    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (const p of pixels) {
      const dx = (p % w) - mx;
      const dy = Math.floor(p / w) - my;
      cxx += mag[p] * dx * dx;
      cyy += mag[p] * dy * dy;
      cxy += mag[p] * dx * dy;
    }
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    let tMin = Infinity;
    let tMax = -Infinity;
    let sMax = 0;
    for (const p of pixels) {
      const dx = (p % w) - mx;
      const dy = Math.floor(p / w) - my;
      const t = dx * ux + dy * uy;
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
      sMax = Math.max(sMax, Math.abs(-dx * uy + dy * ux));
    }
    const length = tMax - tMin;
    if (length < MIN_LENGTH_PX || length / Math.max(1, 2 * sMax) < MIN_ELONGATION) continue;
    segments.push([(mx + ux * tMin) / w, (my + uy * tMin) / h, (mx + ux * tMax) / w, (my + uy * tMax) / h, length]);
  }
  segments.sort((a, b) => b[4] - a[4]);
  const round = (v) => Math.round(v * 10000) / 10000;
  return {
    aspect: w / h,
    segments: segments.slice(0, MAX_SEGMENTS).map((s) => [round(s[0]), round(s[1]), round(s[2]), round(s[3])]),
  };
}

/** @returns {Promise<{aspect: number, segments: Array<[x1, y1, x2, y2]>}>} normalised 0..1, longest first */
async function lineSegments(imagePath) {
  return detect(await loadGrey(imagePath));
}

module.exports = { lineSegments };
