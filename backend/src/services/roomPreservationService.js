/**
 * Keeps the ORIGINAL room in AI Render results — deterministic pixel work, no AI.
 *
 * FLUX.2 [klein] on Workers AI has no mask / strength / inpainting input (the
 * request is a prompt plus up to 4 reference images under 512 px), so it
 * always redraws the WHOLE picture — walls, windows and furniture drift, and
 * products can move. So the AI output is only trusted where products are:
 *
 *   1. the AI output is lined up with the room (small shifts are common) and
 *      tone-matched in a ring just outside the products;
 *   2. each FLOOR product is taken as the AI drew it — realistic, from the
 *      product photo — even when the AI drew it a little off or in a slightly
 *      different shape: the pixels it changed near the arranged spot, moved so
 *      its feet stand where the user put it (aiProduct) — its outline cut by
 *      background removal of the AI picture (whole, nothing half see-through);
 *   3. its shadow (an ellipse under it, plus the 3D view's own faint ground
 *      shadow) may only darken the real floor; safety net: a product the AI
 *      didn't draw there at all keeps its arranged (3D) pixels;
 *   4. WALL-MOUNTED products placed on a detected wall (`exact`) are not taken
 *      from the AI at all: their real photo is projected into the exact
 *      wall-shaped quad at the room photo's full resolution, with a soft wall
 *      shadow, taking only the AI's lighting tone when the AI drew them in
 *      place. (AI pixels around such a frame ghost the AI's slightly misplaced
 *      copy over its edges — a faded bottom edge.)
 *   5. everything is built on the ORIGINAL room photo at its own resolution
 *      (≤ MAX_NATIVE_SIDE) and saved as PNG: every pixel nothing was placed on
 *      IS the original photo's — verified on every render
 *      (stats.backgroundPixelsChanged must be 0).
 */

const sharp = require('sharp');
const { warpLayerToQuad } = require('./arrangeCompositionService');
const { fetchRawCutout } = require('./backgroundRemovalService');

const EDGE_GROW = 0.005;
/** A layer pixel at least this opaque is the product itself; fainter ones are its (3D viewer's) shadow. */
const SOLID_ALPHA = 200;

/** How far around its arranged spot the AI's version of a floor product is looked for (share of its size). */
const AI_SEARCH = 0.6;
/** An AI pixel belongs to something the AI drew when its colour differs this much from the room photo. */
const AI_DIFF = 45;
/** The AI's product must cover the arranged one at least this well (overlap / union) once moved, or it isn't it. */
const MIN_AI_OVERLAP = 0.35;
/** How far around a product's outline (share of its size, as a soft blur) the AI's version of it may reach. */
const NEAR_PRODUCT = 0.12;
/** The AI's product is grown this much (share of its size) so its edges are whole, then feathered this much outside. */
const PRODUCT_GROW = 0.015;
/** The matted product may reach this far (share of its size) beyond what the AI visibly changed. */
const MATTE_ALLOWANCE = 0.06;
/** Dents up to about this deep (share of its size) along the AI product's edge are closed. */
const PRODUCT_CLOSE = 0.07;
const PRODUCT_FEATHER = 0.008;

/**
 * The floor product AS THE AI DREW IT: FLUX often draws it a little off its
 * arranged spot and in a slightly different shape — but realistic, from the
 * product photo. Near the arranged spot, the pixels the AI changed from the
 * room form the product; the largest such shape that overlaps the arranged
 * one (holes filled) is taken, and moved so its feet stand where the user put
 * the product (user placement stays authoritative).
 * Returns { x0, y0, w, h, mask, dx, dy, ratio } (window + mask in the AI
 * picture, the move onto the arranged spot) or null when the AI didn't draw
 * it there (then the arranged view is used).
 */
const debugNull = (why) => {
  console.log(`[roomPreservation] AI product not found (${why}): the arranged view is used`);
  return null;
};

async function aiProduct(l, room, gen, gains, width, height) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -1;
  let y2 = -1;
  let area = 0;
  for (let y = 0; y < l.h; y += 1) {
    for (let x = 0; x < l.w; x += 1) {
      const cx = l.left + x;
      const cy = l.top + y;
      if (cx < 0 || cy < 0 || cx >= width || cy >= height || l.data[(y * l.w + x) * 4 + 3] < SOLID_ALPHA) continue;
      area += 1;
      x1 = Math.min(x1, cx);
      x2 = Math.max(x2, cx);
      y1 = Math.min(y1, cy);
      y2 = Math.max(y2, cy);
    }
  }
  if (area < 30) return null;
  const bw = x2 - x1 + 1;
  const bh = y2 - y1 + 1;
  const m = Math.round(AI_SEARCH * Math.max(bw, bh));
  const x0 = Math.max(0, x1 - m);
  const y0 = Math.max(0, y1 - m);
  const w = Math.min(width - 1, x2 + m) - x0 + 1;
  const h = Math.min(height - 1, y2 + m) - y0 + 1;

  // FLUX also relights the room around a product (the floor a bit lighter or darker, smoothly). The room
  // is tone-matched to the AI picture LOCALLY — from the area around the product only (normalised
  // blur) — so only what the AI actually drew there stands out.
  const around = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const gx = x0 + x;
      const gy = y0 + y;
      around[y * w + x] = gx < x1 - bw * 0.2 || gx > x2 + bw * 0.2 || gy < y1 - bh * 0.2 || gy > y2 + bh * 0.2 ? 1 : 0;
    }
  }
  const sigma = 0.15 * Math.max(bw, bh);
  const weight = await blurMask(around, w, h, sigma);
  const localGain = [];
  for (let c = 0; c < 3; c += 1) {
    const g = new Float32Array(w * h);
    const r = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = ((y0 + y) * width + x0 + x) * 3 + c;
        g[y * w + x] = (around[y * w + x] * gen[i]) / 255;
        r[y * w + x] = (around[y * w + x] * room[i]) / 255;
      }
    }
    const gb = await blurMask(g, w, h, sigma);
    const rb = await blurMask(r, w, h, sigma);
    localGain.push(Float32Array.from(gb, (v, k) => (weight[k] > 0.02 && rb[k] > 0.004 ? Math.min(1.6, Math.max(0.6, v / rb[k])) : gains[c])));
  }

  // What the AI changed (against the locally tone-matched room), gaps closed.
  const changed = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * width + x0 + x) * 3;
      let d = 0;
      for (let c = 0; c < 3; c += 1) d += (gen[i + c] - Math.min(255, room[i + c] * localGain[c][y * w + x])) ** 2;
      changed[y * w + x] = Math.sqrt(d) > AI_DIFF ? 1 : 0;
    }
  }
  const closed = await blurMask(changed, w, h, 2);
  const on = Uint8Array.from(closed, (v) => (v > 0.35 ? 1 : 0));

  // Shapes (4-connected); keep the largest that overlaps the arranged box (grown 15%).
  const label = new Int32Array(w * h);
  const ex = 0.15;
  const bx1 = x1 - x0 - bw * ex;
  const bx2 = x2 - x0 + bw * ex;
  const by1 = y1 - y0 - bh * ex;
  const by2 = y2 - y0 + bh * ex;
  let best = 0;
  let bestArea = 0;
  let next = 0;
  const stack = [];
  for (let start = 0; start < w * h; start += 1) {
    if (!on[start] || label[start]) continue;
    next += 1;
    label[start] = next;
    stack.push(start);
    let n = 0;
    let hits = false;
    while (stack.length) {
      const p = stack.pop();
      n += 1;
      const px = p % w;
      const py = (p - px) / w;
      if (px >= bx1 && px <= bx2 && py >= by1 && py <= by2) hits = true;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || label[q] || !on[q]) continue;
        if ((q === p - 1 && px === 0) || (q === p + 1 && px === w - 1)) continue;
        label[q] = next;
        stack.push(q);
      }
    }
    if (hits && n > bestArea) {
      bestArea = n;
      best = next;
    }
  }
  if (!best) return debugNull('no changed shape near it');

  // Fill SMALL holes (fabric the colour of the floor); big ones — the floor seen between legs or under
  // a seat — stay the real room unless the AI changed them (its shadow is part of the shape already).
  const drawn = Uint8Array.from(label, (v) => (v === best ? 1 : 0));
  const seen = new Uint8Array(w * h);
  const maxHole = 0.04 * area;
  for (let start = 0; start < w * h; start += 1) {
    if (drawn[start] || seen[start]) continue;
    const region = [];
    let touchesBorder = false;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      region.push(p);
      const px = p % w;
      const py = (p - px) / w;
      if (px === 0 || py === 0 || px === w - 1 || py === h - 1) touchesBorder = true;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || drawn[q]) continue;
        if ((q === p - 1 && px === 0) || (q === p + 1 && px === w - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (!touchesBorder && region.length <= maxHole) for (const p of region) drawn[p] = 1;
  }
  let drawnArea = 0;
  for (let i = 0; i < w * h; i += 1) drawnArea += drawn[i];
  if (drawnArea < 0.4 * area) return debugNull(`changed area ${(drawnArea / area).toFixed(2)}× the product`);

  // The move that makes the AI's shape cover the arranged one best (overlap / union): coarse on a
  // 4× smaller grid, then 1 px. (The AI's own shadow is part of its shape, so its bottom can't be used.)
  const arranged = new Uint8Array(w * h);
  for (let y = 0; y < l.h; y += 1) {
    for (let x = 0; x < l.w; x += 1) {
      const ax = l.left + x - x0;
      const ay = l.top + y - y0;
      if (ax < 0 || ay < 0 || ax >= w || ay >= h || l.data[(y * l.w + x) * 4 + 3] < SOLID_ALPHA) continue;
      arranged[ay * w + ax] = 1;
    }
  }
  // Judged only around the arranged spot: changes the AI made further away (things on a nearby
  // dresser) may join the same shape but don't count.
  const rx1 = Math.max(0, Math.floor(x1 - x0 - bw * 0.3));
  const rx2 = Math.min(w - 1, Math.ceil(x2 - x0 + bw * 0.3));
  const ry1 = Math.max(0, Math.floor(y1 - y0 - bh * 0.3));
  const ry2 = Math.min(h - 1, Math.ceil(y2 - y0 + bh * 0.3));
  const fit = (dx, dy, step) => {
    let inter = 0;
    let union = 0;
    for (let y = ry1; y <= ry2; y += step) {
      for (let x = rx1; x <= rx2; x += step) {
        const a = arranged[y * w + x];
        const sx = x - dx;
        const sy = y - dy;
        const d = sx >= 0 && sy >= 0 && sx < w && sy < h ? drawn[sy * w + sx] : 0;
        if (a && d) inter += 1;
        if (a || d) union += 1;
      }
    }
    return union ? inter / union : 0;
  };
  const range = Math.round(AI_SEARCH * Math.max(bw, bh));
  let move = { dx: 0, dy: 0, score: -1 };
  for (let dy = -range; dy <= range; dy += 4) {
    for (let dx = -range; dx <= range; dx += 4) {
      const score = fit(dx, dy, 4) - 0.0005 * Math.hypot(dx, dy);
      if (score > move.score) move = { dx, dy, score };
    }
  }
  const coarse = move;
  for (let dy = coarse.dy - 4; dy <= coarse.dy + 4; dy += 1) {
    for (let dx = coarse.dx - 4; dx <= coarse.dx + 4; dx += 1) {
      const score = fit(dx, dy, 1) - 0.0005 * Math.hypot(dx, dy);
      if (score > move.score) move = { dx, dy, score };
    }
  }
  if (move.score < MIN_AI_OVERLAP) return debugNull(`overlap ${move.score.toFixed(2)}`);
  const { dx, dy } = move;

  // The product is taken WHOLE, as one solid piece: what the AI changed near the arranged spot (where
  // the product lands once moved; its shadow further out is the soft darken-only zone, step 4, never a
  // pasted block whose straight edges show) — changes further away (the
  // curtain next to it, things on a dresser) are left out — then grown a little and every hole
  // filled, because parts of a product the colour of what's behind it (a grey chair against a grey
  // curtain) don't show as changed. Only a thin border just OUTSIDE the product is soft, where the
  // AI's floor and the real floor match; nothing inside it is half see-through.
  const size = Math.max(bw, bh);
  const near = await blurMask(arranged, w, h, NEAR_PRODUCT * size);
  const core = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!drawn[y * w + x]) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      if (near[ty * w + tx] > 0.05) core[y * w + x] = 1;
    }
  }
  // Closed (grown, then shrunk back): an edge the colour of the floor (a grey arm's underside) leaves
  // a dent; small holes are filled too. Big holes — the floor between legs — stay the real room
  // unless the AI changed them (its shadow is part of the shape already).
  const grown = await growMask(core, w, h, PRODUCT_CLOSE * size);
  const shrunk = await growMask(Float32Array.from(grown, (v) => (v >= 0.5 ? 0 : 1)), w, h, PRODUCT_CLOSE * size);
  const sealed = Uint8Array.from(shrunk, (v, i) => (v < 0.5 || core[i] ? 1 : 0));
  const seenHole = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start += 1) {
    if (sealed[start] || seenHole[start]) continue;
    const region = [];
    let touchesBorder = false;
    seenHole[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      region.push(p);
      const px = p % w;
      const py = (p - px) / w;
      if (px === 0 || py === 0 || px === w - 1 || py === h - 1) touchesBorder = true;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seenHole[q] || sealed[q]) continue;
        if ((q === p - 1 && px === 0) || (q === p + 1 && px === w - 1)) continue;
        seenHole[q] = 1;
        stack.push(q);
      }
    }
    if (!touchesBorder && region.length <= maxHole) for (const p of region) sealed[p] = 1;
  }
  let kept = 0;
  for (let i = 0; i < w * h; i += 1) kept += core[i];
  const ratio = kept / area;
  // Nothing drawn, or a whole area changed (the product with its own shadow is up to ~3× its size).
  if (ratio < 0.4 || ratio > 3) return debugNull(`changed area ${ratio.toFixed(2)}× the product`);

  // Its exact outline: the AI's picture around it through background removal (the same BiRefNet as the
  // product cutouts) — colour differences can't tell a grey chair from a floor the AI also repainted.
  // Kept only near where the AI changed things (another object the matting picks up is dropped).
  const matte = await matteOf(gen, width, height, x0, y0, w, h, sealed, size);
  if (matte) {
    const allowed = await growMask(Float32Array.from(sealed), w, h, MATTE_ALLOWANCE * size);
    const mask = Float32Array.from(matte, (v, i) => (allowed[i] >= 0.5 ? v : 0));
    let solidArea = 0;
    for (let i = 0; i < w * h; i += 1) solidArea += mask[i] >= 0.5 ? 1 : 0;
    if (solidArea >= 0.4 * area && solidArea <= 2 * area) return { x0, y0, w, h, mask, dx, dy, ratio: Math.round((solidArea / area) * 100) / 100, outline: 'matte' };
    console.log(`[roomPreservation] AI product matte ${(solidArea / area).toFixed(2)}× the product: its changed pixels are used`);
  }
  const solid = await growMask(Float32Array.from(sealed), w, h, PRODUCT_GROW * size);
  const mask = await blurMask(solid, w, h, PRODUCT_FEATHER * size);
  return { x0, y0, w, h, mask, dx, dy, ratio: Math.round(ratio * 100) / 100, outline: 'changed' };
}

/**
 * Background removal of the AI picture around the product (window coordinates), as alpha 0..1 —
 * or null when the Worker isn't available (then the changed pixels decide the outline).
 */
async function matteOf(gen, width, height, x0, y0, w, h, sealed, size) {
  let bx1 = w;
  let by1 = h;
  let bx2 = -1;
  let by2 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!sealed[y * w + x]) continue;
      bx1 = Math.min(bx1, x);
      bx2 = Math.max(bx2, x);
      by1 = Math.min(by1, y);
      by2 = Math.max(by2, y);
    }
  }
  if (bx2 < 0) return null;
  const pad = Math.round(0.15 * size);
  const cx1 = Math.max(0, bx1 - pad);
  const cy1 = Math.max(0, by1 - pad);
  const cw = Math.min(w - 1, bx2 + pad) - cx1 + 1;
  const ch = Math.min(h - 1, by2 + pad) - cy1 + 1;
  const crop = Buffer.alloc(cw * ch * 3);
  for (let y = 0; y < ch; y += 1) {
    const from = ((y0 + cy1 + y) * width + x0 + cx1) * 3;
    gen.copy(crop, y * cw * 3, from, from + cw * 3);
  }
  try {
    const png = await sharp(crop, { raw: { width: cw, height: ch, channels: 3 } }).png().toBuffer();
    const cut = await fetchRawCutout(png, 'image/png');
    const { data, info } = await sharp(cut).ensureAlpha().resize(cw, ch, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const alpha = new Float32Array(w * h);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) alpha[(cy1 + y) * w + cx1 + x] = data[(y * cw + x) * info.channels + 3] / 255;
    }
    return alpha;
  } catch (err) {
    console.log(`[roomPreservation] AI product matte unavailable (${err.message}): its changed pixels are used`);
    return null;
  }
}
const SHADOW_WIDTH = 0.65;
const SHADOW_HEIGHT = 0.14;
const FEATHER = 0.006;
/** In the shadow area the AI may only darken the real floor (its shadow), down to this share of the light. */
const MIN_SHADE = 0.45;
const MAX_SHIFT = 0.03;
const MAX_NATIVE_SIDE = 2048;
const MIN_TONE_MATCH = 0.5;
const WALL_SHADOW_OFFSET = 0.025;
const WALL_SHADOW_STRENGTH = 0.28;

async function blurMask(mask, width, height, sigma) {
  if (sigma < 0.3) return mask;
  const bytes = Buffer.from(Uint8Array.from(mask, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)));
  // (sharp hands back three channels for a one-channel raw input: keep the first.)
  const out = await sharp(bytes, { raw: { width, height, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
  return Float32Array.from(out, (v) => v / 255);
}

async function growMask(mask, width, height, radius) {
  const blurred = await blurMask(mask, width, height, Math.max(0.5, radius / 2));
  return Float32Array.from(blurred, (v, i) => Math.max(mask[i], v > 0.02 ? 1 : 0));
}

function addEllipse(mask, width, height, cx, cy, rx, ry) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, Math.ceil(cx + rx)); x += 1) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) mask[y * width + x] = 1;
    }
  }
}

/**
 * What the AI may change for the given (refined) products, feathered:
 *   body   — their own pixels, grown a little: taken from the AI picture;
 *   shadow — where their shadow belongs (an ellipse under each), outside the
 *            body: the AI may only DARKEN the real floor there, so its texture
 *            stays and no repainted patch shows around the product.
 * zone = either (alignment / tone ring use it).
 */
async function productZone(layers, width, height) {
  const short = Math.min(width, height);
  const solid = new Float32Array(width * height);
  // A 3D view also carries the viewer's soft ground shadow (faint, semi-transparent pixels): that's
  // shadow, not product — the AI may only darken the real floor there.
  const faint = new Float32Array(width * height);
  const boxes = [];
  for (const l of layers) {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -1;
    let y2 = -1;
    for (let y = 0; y < l.h; y += 1) {
      const cy = l.top + y;
      if (cy < 0 || cy >= height) continue;
      for (let x = 0; x < l.w; x += 1) {
        const cx = l.left + x;
        const a = l.data[(y * l.w + x) * 4 + 3];
        if (cx < 0 || cx >= width || a < 13) continue;
        if (a >= SOLID_ALPHA) solid[cy * width + cx] = 1;
        else faint[cy * width + cx] = 1;
        x1 = Math.min(x1, cx);
        x2 = Math.max(x2, cx);
        y1 = Math.min(y1, cy);
        y2 = Math.max(y2, cy);
      }
    }
    if (x2 >= 0) boxes.push({ x1, y1, x2, y2 });
  }
  const body = await blurMask(await growMask(solid, width, height, EDGE_GROW * short), width, height, FEATHER * short);
  const ellipses = new Float32Array(width * height);
  for (const b of boxes) {
    const bw = b.x2 - b.x1 + 1;
    const bh = b.y2 - b.y1 + 1;
    addEllipse(ellipses, width, height, (b.x1 + b.x2) / 2, b.y2, bw * SHADOW_WIDTH, Math.max(bh * SHADOW_HEIGHT, short * 0.02));
  }
  for (let i = 0; i < width * height; i += 1) ellipses[i] = Math.max(ellipses[i], faint[i]);
  const soft = await blurMask(ellipses, width, height, 3 * FEATHER * short);
  const shadow = Float32Array.from(soft, (v, i) => Math.min(1, v) * (1 - body[i]));
  const zone = Float32Array.from(body, (v, i) => Math.max(v, shadow[i]));
  return { body, shadow, zone };
}

const lum = (rgb, i) => 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];

function correlation(pairs) {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (const [a, b] of pairs) {
    sa += a;
    sb += b;
    saa += a * a;
    sbb += b * b;
    sab += a * b;
    n += 1;
  }
  const den = Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
  return n > 30 && den > 0 ? (sab - (sa * sb) / n) / den : 0;
}

/** Shift (dx, dy) such that generated(x + dx, y + dy) ≈ room(x, y), outside the zone: coarse, then 1-px fine. */
function findShift(room, generated, zone, width, height) {
  const scan = (dx, dy, step) => {
    const pairs = [];
    const m = Math.ceil(MAX_SHIFT * width) + 2;
    for (let y = m; y < height - m; y += step) {
      for (let x = m; x < width - m; x += step) {
        if (zone[y * width + x] > 0.01) continue;
        pairs.push([lum(room, (y * width + x) * 3), lum(generated, ((y + dy) * width + (x + dx)) * 3)]);
      }
    }
    return correlation(pairs);
  };
  const maxS = Math.max(1, Math.round(MAX_SHIFT * width));
  let best = { dx: 0, dy: 0, score: -Infinity };
  for (let dy = -maxS; dy <= maxS; dy += 4) {
    for (let dx = -maxS; dx <= maxS; dx += 4) {
      const score = scan(dx, dy, 12);
      if (score > best.score) best = { dx, dy, score };
    }
  }
  const coarse = best;
  for (let dy = coarse.dy - 3; dy <= coarse.dy + 3; dy += 1) {
    for (let dx = coarse.dx - 3; dx <= coarse.dx + 3; dx += 1) {
      const score = scan(dx, dy, 6);
      if (score > best.score) best = { dx, dy, score };
    }
  }
  return best;
}

/**
 * @param {object} p
 * @param {Buffer} p.room - the room at the composition's size
 * @param {Buffer} p.generated - the AI output
 * @param {Buffer} p.arranged - the Arrange composition (room + layers)
 * @param {string} p.roomImagePath - the ORIGINAL room photo (the final image is built on it)
 * @param {number} p.width
 * @param {number} p.height
 * @param {Array<{image: Buffer, left: number, top: number, kind: string, exact: boolean, layer: object}>} p.layers
 * @returns {Promise<{buffer: Buffer, format: 'png', stats: object}>}
 */
async function preserveRoom({ room, generated, arranged, roomImagePath, width, height, layers }) {
  const roomRgb = await sharp(room).removeAlpha().resize(width, height, { fit: 'fill' }).raw().toBuffer();
  const arrangedRgb = await sharp(arranged).removeAlpha().resize(width, height, { fit: 'fill' }).raw().toBuffer();
  let genRgb = await sharp(generated).removeAlpha().resize(width, height, { fit: 'fill' }).raw().toBuffer();

  const placed = [];
  for (const l of layers) {
    const { data, info } = await sharp(l.image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    placed.push({ ...l, data, w: info.width, h: info.height });
  }
  const refined = placed.filter((l) => !l.exact);
  const { shadow, zone } = await productZone(refined, width, height);

  // 1. Line the AI output up with the room.
  const shift = findShift(roomRgb, genRgb, zone, width, height);
  if (shift.dx || shift.dy) {
    const shifted = Buffer.alloc(genRgb.length);
    for (let y = 0; y < height; y += 1) {
      const sy = Math.min(height - 1, Math.max(0, y + shift.dy));
      for (let x = 0; x < width; x += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + shift.dx));
        genRgb.copy(shifted, (y * width + x) * 3, (sy * width + sx) * 3, (sy * width + sx) * 3 + 3);
      }
    }
    genRgb = shifted;
  }

  // 2. Tone-match the AI output to the room in a ring around the zone.
  const outer = await growMask(Float32Array.from(zone, (v) => (v > 0.02 ? 1 : 0)), width, height, 0.03 * Math.min(width, height));
  const sums = [0, 0, 0, 0, 0, 0];
  let ringN = 0;
  for (let i = 0; i < width * height; i += 1) {
    if (outer[i] < 0.5 || zone[i] >= 0.02) continue;
    for (let c = 0; c < 3; c += 1) {
      sums[c] += roomRgb[i * 3 + c];
      sums[c + 3] += genRgb[i * 3 + c];
    }
    ringN += 1;
  }
  const gains = [0, 1, 2].map((c) => (ringN > 200 && sums[c + 3] > 0 ? Math.min(1.2, Math.max(0.83, sums[c] / sums[c + 3])) : 1));

  // 2b. Each floor product as the AI drew it (aiProduct), moved onto its arranged spot: `ai` is the AI
  //     picture with those moves, `body` what of it is product. Where the AI didn't draw it there,
  //     the arranged view is kept (fallback).
  const ai = Buffer.from(genRgb);
  const bodyMask = new Float32Array(width * height);
  const fallback = new Float32Array(width * height);
  const productMatch = [];
  for (const l of refined) {
    const found = await aiProduct(l, roomRgb, genRgb, gains, width, height);
    productMatch.push(found ? { size: found.ratio, moved: [found.dx, found.dy] } : null);
    if (!found) {
      for (let y = 0; y < l.h; y += 1) {
        for (let x = 0; x < l.w; x += 1) {
          const cx = l.left + x;
          const cy = l.top + y;
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
          const a = l.data[(y * l.w + x) * 4 + 3];
          if (a >= SOLID_ALPHA) fallback[cy * width + cx] = 1;
        }
      }
      continue;
    }
    for (let y = 0; y < found.h; y += 1) {
      const ty = found.y0 + y + found.dy;
      if (ty < 0 || ty >= height) continue;
      for (let x = 0; x < found.w; x += 1) {
        const tx = found.x0 + x + found.dx;
        if (tx < 0 || tx >= width) continue;
        const from = ((found.y0 + y) * width + found.x0 + x) * 3;
        genRgb.copy(ai, (ty * width + tx) * 3, from, from + 3);
        const k = found.mask[y * found.w + x];
        if (k > bodyMask[ty * width + tx]) bodyMask[ty * width + tx] = k;
      }
    }
  }
  const body = await blurMask(bodyMask, width, height, 1);

  // 3. Wall products: their pixels are exact; only the AI's lighting tone is taken, when it drew them in place.
  const exactOverlays = [];
  for (const l of placed.filter((p) => p.exact)) {
    const pairs = [];
    const tone = [0, 0, 0, 0, 0, 0];
    for (let y = 0; y < l.h; y += 2) {
      for (let x = 0; x < l.w; x += 2) {
        const cx = l.left + x;
        const cy = l.top + y;
        if (cx >= width || cy >= height || l.data[(y * l.w + x) * 4 + 3] < 200) continue;
        const i = (cy * width + cx) * 3;
        pairs.push([lum(arrangedRgb, i), lum(genRgb, i)]);
        for (let c = 0; c < 3; c += 1) {
          tone[c] += genRgb[i + c];
          tone[c + 3] += arrangedRgb[i + c];
        }
      }
    }
    const match = Math.round(correlation(pairs) * 1000) / 1000;
    const gain =
      match >= MIN_TONE_MATCH ? [0, 1, 2].map((c) => (tone[c + 3] > 0 ? Math.min(1.12, Math.max(0.9, tone[c] / tone[c + 3])) : 1)) : [1, 1, 1];
    exactOverlays.push({ layer: l.layer, gain, match });
  }

  // 4. The refined products at composition size (room outside the body), and the shadow
  //    as a darkening factor for the real floor (1 = unchanged).
  const out = Buffer.alloc(roomRgb.length);
  const shade = new Float32Array(width * height).fill(1);
  let drift = 0;
  let driftN = 0;
  for (let i = 0; i < width * height; i += 1) {
    const z = body[i];
    if (zone[i] <= 0) driftN += 1;
    if (shadow[i] > 0 && z < 1) {
      const lr = lum(roomRgb, i * 3);
      const lg = 0.299 * ai[i * 3] * gains[0] + 0.587 * ai[i * 3 + 1] * gains[1] + 0.114 * ai[i * 3 + 2] * gains[2];
      const ratio = lr > 1 ? Math.min(1, Math.max(MIN_SHADE, lg / lr)) : 1;
      shade[i] = 1 - shadow[i] * (1 - z) * (1 - ratio);
    }
    for (let c = 0; c < 3; c += 1) {
      const r = roomRgb[i * 3 + c];
      if (zone[i] <= 0) drift += Math.abs(genRgb[i * 3 + c] - r);
      const blended = r * (1 - z) + Math.min(255, ai[i * 3 + c] * gains[c]) * z;
      const f = fallback[i];
      out[i * 3 + c] = Math.round(blended * (1 - f) + arrangedRgb[i * 3 + c] * f);
    }
  }

  // 5. On the original photo at its own resolution.
  // Where the product came from the arranged view (fallback) it is placed too.
  const placedMask = Float32Array.from(body, (v, i) => Math.max(v, fallback[i]));
  const native = await onOriginal(roomImagePath, out, placedMask, shade, width, height, exactOverlays);
  return {
    buffer: native.buffer,
    format: 'png',
    stats: {
      ...native.stats,
      aiDriftOutsideProducts: Math.round((drift / Math.max(1, driftN * 3)) * 10) / 10, // how much the AI had changed the room (discarded)
      shift: { dx: shift.dx, dy: shift.dy, match: Math.round(shift.score * 1000) / 1000 },
      toneGains: gains.map((g) => Math.round(g * 1000) / 1000),
      productMatch,
      productsKeptFromArrange: productMatch.filter((m) => m === null).length,
      wallProducts: exactOverlays.map((o) => ({ aiMatch: o.match, aiToneUsed: o.gain.some((g) => g !== 1) })),
    },
  };
}

async function onOriginal(roomImagePath, out, zone, shade, width, height, exactOverlays) {
  const meta = await sharp(roomImagePath).metadata();
  const swap = meta.orientation && meta.orientation >= 5;
  let nw = swap ? meta.height : meta.width;
  let nh = swap ? meta.width : meta.height;
  const scale = Math.min(1, MAX_NATIVE_SIDE / Math.max(nw, nh));
  nw = Math.round(nw * scale);
  nh = Math.round(nh * scale);

  let original = sharp(roomImagePath).rotate();
  if (scale < 1) original = original.resize(nw, nh, { fit: 'fill' });
  const orig = await original.removeAlpha().raw().toBuffer();
  const productUp = await sharp(out, { raw: { width, height, channels: 3 } }).resize(nw, nh, { fit: 'fill' }).raw().toBuffer();
  const zoneBytes = Buffer.from(Uint8Array.from(zone, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)));
  const zoneUp = await sharp(zoneBytes, { raw: { width, height, channels: 1 } })
    .resize(nw, nh, { fit: 'fill', kernel: 'linear' })
    .extractChannel(0)
    .raw()
    .toBuffer();

  const shadeBytes = Buffer.from(Uint8Array.from(shade, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)));
  const shadeUp = await sharp(shadeBytes, { raw: { width, height, channels: 1 } })
    .resize(nw, nh, { fit: 'fill', kernel: 'linear' })
    .extractChannel(0)
    .raw()
    .toBuffer();

  const final = Buffer.from(orig);
  const touched = new Uint8Array(nw * nh);
  for (let i = 0; i < nw * nh; i += 1) {
    if (zoneUp[i] === 0 && shadeUp[i] === 255) continue;
    const z = zoneUp[i] / 255;
    const k = shadeUp[i] / 255; // the shadow: the real floor, only darker
    for (let c = 0; c < 3; c += 1) final[i * 3 + c] = Math.round(orig[i * 3 + c] * k * (1 - z) + productUp[i * 3 + c] * z);
    touched[i] = 1;
  }

  for (const { layer, gain } of exactOverlays) {
    const warped = await warpLayerToQuad(layer, nw, nh);
    if (!warped) continue;
    const { data: px, info } = await sharp(warped.input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const lw = info.width;
    const lh = info.height;
    // Soft shadow on the wall: the silhouette, shifted down a little and blurred.
    const dy = Math.max(1, Math.round(lh * WALL_SHADOW_OFFSET));
    const pad = Math.max(4, Math.round(lh * 0.06));
    const sw = lw + pad * 2;
    const sh = lh + pad * 2 + dy;
    const sil = Buffer.alloc(sw * sh);
    for (let y = 0; y < lh; y += 1) for (let x = 0; x < lw; x += 1) sil[(y + pad + dy) * sw + x + pad] = px[(y * lw + x) * 4 + 3];
    const shadow = await sharp(sil, { raw: { width: sw, height: sh, channels: 1 } })
      .blur(Math.max(1, lh * 0.02))
      .extractChannel(0)
      .raw()
      .toBuffer();
    for (let y = 0; y < sh; y += 1) {
      const fy = warped.top - pad + y;
      if (fy < 0 || fy >= nh) continue;
      for (let x = 0; x < sw; x += 1) {
        const fx = warped.left - pad + x;
        if (fx < 0 || fx >= nw) continue;
        const a = (shadow[y * sw + x] / 255) * WALL_SHADOW_STRENGTH;
        if (a <= 0) continue;
        const i = fy * nw + fx;
        for (let c = 0; c < 3; c += 1) final[i * 3 + c] = Math.round(final[i * 3 + c] * (1 - a));
        touched[i] = 1;
      }
    }
    for (let y = 0; y < lh && warped.top + y < nh; y += 1) {
      for (let x = 0; x < lw && warped.left + x < nw; x += 1) {
        const a = px[(y * lw + x) * 4 + 3] / 255;
        if (a <= 0) continue;
        const i = (warped.top + y) * nw + warped.left + x;
        for (let c = 0; c < 3; c += 1) {
          final[i * 3 + c] = Math.round(final[i * 3 + c] * (1 - a) + Math.min(255, px[(y * lw + x) * 4 + c] * gain[c]) * a);
        }
        touched[i] = 1;
      }
    }
  }

  const buffer = await sharp(final, { raw: { width: nw, height: nh, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer();
  // Verification: decode what will be saved; everywhere nothing was placed it must equal the photo.
  const check = await sharp(buffer).raw().toBuffer();
  let changed = 0;
  let untouched = 0;
  for (let i = 0; i < nw * nh; i += 1) {
    if (touched[i]) continue;
    untouched += 1;
    if (check[i * 3] !== orig[i * 3] || check[i * 3 + 1] !== orig[i * 3 + 1] || check[i * 3 + 2] !== orig[i * 3 + 2]) changed += 1;
  }
  return {
    buffer,
    stats: {
      output: { width: nw, height: nh, scaledFromOriginal: scale < 1 },
      backgroundPixelsUntouched: Math.round((untouched / (nw * nh)) * 1000) / 10,
      backgroundPixelsChanged: changed,
    },
  };
}

module.exports = { preserveRoom, productZone };
