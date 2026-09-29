/**
 * Capture alignment — checks the rotation-sensor angles of a 180°/360° room
 * capture against the pictures themselves, and corrects them.
 *
 * Why: the gyro total over a whole sweep is reliable, but locally the video and
 * the motion track can drift (uneven turning, sensor/video timing), and the
 * lens's real horizontal field of view differs from the nominal one (measured
 * 2026-09-29 on room 16: the 0.5× lens shows ≈58° in portrait, not 75°). Both
 * make swiping look messy: the room stalls then jumps, and products placed by
 * angle slide against the room.
 *
 * How (pure image maths, no AI, nothing downloaded):
 *   1. For each pair of neighbouring views, find the horizontal pixel shift
 *      that best lines them up (normalised cross-correlation on small
 *      greyscale copies, ±a few px vertically).
 *   2. Field of view: shift ≈ f·tan(Δangle), so f (and the FOV) follows from
 *      the reliable pairs' shifts against the gyro steps.
 *   3. Each step's angle is re-derived from its own shift (atan(shift/f)),
 *      then all steps are rescaled so the total turn stays the gyro's total.
 *   4. Pairs that don't line up (low correlation, blank walls, motion) keep the
 *      gyro step and are flagged (align score) so the viewer snaps instead of
 *      cross-fading two pictures that don't match.
 * If too few pairs line up reliably, nothing is changed.
 */

const sharp = require('sharp');

const ANALYSIS_WIDTH = 120;
const MAX_DY = 6; // px (at analysis size) of vertical wobble allowed
const MIN_OVERLAP = 0.35; // share of the width that must overlap
const RELIABLE_SCORE = 0.5; // normalised correlation for a trustworthy match
const MIN_STEP_RATIO = 0.3; // corrected step vs gyro step, clamp range
const MAX_STEP_RATIO = 2.5;
const FOV_RANGE = [30, 100];

async function loadGray(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(ANALYSIS_WIDTH, null)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: Float32Array.from(data), w: info.width, h: info.height };
}

/**
 * Horizontal shift s (px) such that b(x, y) ≈ a(x + s, y + dy): positive when
 * the picture moved left, i.e. the camera turned right.
 * @returns {{shift: number, score: number}} score = normalised cross-correlation (−1..1)
 */
function bestShift(a, b) {
  const { w, h } = a;
  const y0 = Math.floor(h * 0.1);
  const y1 = Math.floor(h * 0.9);
  const maxDx = Math.floor(w * (1 - MIN_OVERLAP));
  let best = { shift: 0, score: -2, dy: 0 };
  const scoreAt = (s, dy) => {
    const xa0 = Math.max(0, s);
    const xa1 = Math.min(w, w + s);
    let n = 0;
    let sa = 0;
    let sb = 0;
    let saa = 0;
    let sbb = 0;
    let sab = 0;
    for (let y = y0; y < y1; y += 1) {
      const ya = y + dy;
      if (ya < 0 || ya >= h) continue;
      const rowA = ya * w;
      const rowB = y * w;
      for (let xa = xa0; xa < xa1; xa += 1) {
        const va = a.data[rowA + xa];
        const vb = b.data[rowB + xa - s];
        sa += va;
        sb += vb;
        saa += va * va;
        sbb += vb * vb;
        sab += va * vb;
        n += 1;
      }
    }
    if (n < 100) return -2;
    const cov = sab - (sa * sb) / n;
    const va = saa - (sa * sa) / n;
    const vb = sbb - (sb * sb) / n;
    return va > 1e-6 && vb > 1e-6 ? cov / Math.sqrt(va * vb) : -1;
  };
  for (let dy = -MAX_DY; dy <= MAX_DY; dy += 2) {
    for (let s = -maxDx; s <= maxDx; s += 1) {
      const score = scoreAt(s, dy);
      if (score > best.score) best = { shift: s, score, dy };
    }
  }
  // Sub-pixel: fit a parabola through the peak and its neighbours (1 px ≈ 0.5° here).
  const left = scoreAt(best.shift - 1, best.dy);
  const right = scoreAt(best.shift + 1, best.dy);
  const curve = left - 2 * best.score + right;
  const offset = left > -2 && right > -2 && curve < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curve)) : 0;
  return { shift: best.shift + offset, score: best.score };
}

const DEG = Math.PI / 180;
const median = (v) => {
  const s = [...v].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Pure solver (tested separately): gyro angles + measured pair shifts → FOV and corrected angles.
 * @param {number[]} angles gyro angles, in capture order
 * @param {Array<{shift:number, score:number}>} pairs pairs[i] = frames i → i+1
 * @param {number} width analysis width (px)
 * @returns {{ok: boolean, reason?: string, fovDeg?: number, angles?: number[], pairScores?: Array<number|null>}}
 */
function solveAlignment(angles, pairs, width) {
  const steps = angles.slice(1).map((a, i) => a - angles[i]);
  const reliable = steps
    .map((d, i) => ({ i, d, ...pairs[i] }))
    .filter((p) => p.score >= RELIABLE_SCORE && Math.abs(p.d) > 0.5 && Math.sign(p.shift) === Math.sign(p.d) && p.shift !== 0);
  if (reliable.length < Math.max(4, Math.ceil(steps.length * 0.5))) {
    return { ok: false, reason: `only ${reliable.length} of ${steps.length} neighbouring views line up reliably` };
  }

  // f in px: shift = f·tan(step). Median ratio, then a pooled estimate over the pairs near it.
  const ratios = reliable.map((p) => Math.abs(p.shift) / Math.tan(Math.abs(p.d) * DEG));
  const mid = median(ratios);
  const agree = reliable.filter((_, k) => ratios[k] > mid * 0.6 && ratios[k] < mid * 1.6);
  const f =
    agree.reduce((s, p) => s + Math.abs(p.shift), 0) / agree.reduce((s, p) => s + Math.tan(Math.abs(p.d) * DEG), 0);
  const fovDeg = (2 * Math.atan(width / 2 / f)) / DEG;
  if (!(fovDeg >= FOV_RANGE[0] && fovDeg <= FOV_RANGE[1])) {
    return { ok: false, reason: `measured field of view ${fovDeg.toFixed(1)}° is implausible` };
  }

  const reliableSet = new Set(reliable.map((p) => p.i));
  const corrected = steps.map((d, i) => {
    if (!reliableSet.has(i)) return d;
    const fromImage = Math.sign(d) * (Math.atan(Math.abs(pairs[i].shift) / f) / DEG);
    const ratio = Math.min(MAX_STEP_RATIO, Math.max(MIN_STEP_RATIO, fromImage / d));
    return d * ratio;
  });
  // Keep the gyro's total turn (reliable over a whole sweep); only the distribution changes.
  const total = steps.reduce((s, d) => s + d, 0);
  const correctedTotal = corrected.reduce((s, d) => s + d, 0);
  const scale = correctedTotal !== 0 ? total / correctedTotal : 1;
  const out = [angles[0]];
  for (const d of corrected) out.push(out[out.length - 1] + d * scale);

  // Per pair: the correlation when it lined up, else 0 (viewer snaps there).
  const pairScores = steps.map((_, i) => (reliableSet.has(i) ? Math.round(pairs[i].score * 1000) / 1000 : 0));
  return { ok: true, fovDeg: Math.round(fovDeg * 10) / 10, angles: out.map((a) => Math.round(a * 100) / 100), pairScores };
}

/**
 * @param {Array<{angleDeg:number, path:string}>} frames in capture order (preview images are enough)
 * @returns {Promise<{ok:boolean, reason?:string, fovDeg?:number, angles?:number[], pairScores?:Array<number>, pairs?:Array}>}
 */
async function alignCapture(frames) {
  if (frames.length < 5) return { ok: false, reason: 'too few views' };
  const images = [];
  for (const f of frames) images.push(await loadGray(f.path));
  const pairs = [];
  for (let i = 0; i + 1 < images.length; i += 1) pairs.push(bestShift(images[i], images[i + 1]));
  const solved = solveAlignment(
    frames.map((f) => f.angleDeg),
    pairs,
    images[0].w
  );
  return { ...solved, pairs };
}

module.exports = { alignCapture, solveAlignment, bestShift, RELIABLE_SCORE };
