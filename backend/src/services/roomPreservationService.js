/**
 * Keeps the ORIGINAL room in AI Render results — deterministic pixel work, no AI.
 *
 * FLUX.2 [klein] on Workers AI has no mask / strength / inpainting input (the
 * request is a prompt plus up to 4 reference images under 512 px), so it
 * always redraws the WHOLE picture — walls, windows and furniture drift, and
 * products can move. So the AI output is only trusted where products are:
 *
 *   1. product zone = each refined product's own pixels (alpha), grown a
 *      little, plus where its shadow belongs (a contact-shadow ellipse under
 *      floor furniture), feathered;
 *   2. the AI output is lined up with the room (small shifts are common) and
 *      tone-matched in a ring just outside the zone;
 *   3. safety net: a product the AI didn't draw where it was arranged keeps
 *      its arranged pixels;
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

const EDGE_GROW = 0.012;
const SHADOW_WIDTH = 0.65;
const SHADOW_HEIGHT = 0.14;
const FEATHER = 0.01;
const MAX_SHIFT = 0.03;
const MAX_NATIVE_SIDE = 2048;
const MIN_PRODUCT_MATCH = 0.35;
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

/** Zone the AI may change for the given (refined) products: their pixels + shadow areas, feathered. */
async function productZone(layers, width, height) {
  const short = Math.min(width, height);
  const solid = new Float32Array(width * height);
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
        if (cx < 0 || cx >= width || l.data[(y * l.w + x) * 4 + 3] < 13) continue;
        solid[cy * width + cx] = 1;
        x1 = Math.min(x1, cx);
        x2 = Math.max(x2, cx);
        y1 = Math.min(y1, cy);
        y2 = Math.max(y2, cy);
      }
    }
    if (x2 >= 0) boxes.push({ x1, y1, x2, y2 });
  }
  const zone = await growMask(solid, width, height, EDGE_GROW * short);
  for (const b of boxes) {
    const bw = b.x2 - b.x1 + 1;
    const bh = b.y2 - b.y1 + 1;
    addEllipse(zone, width, height, (b.x1 + b.x2) / 2, b.y2, bw * SHADOW_WIDTH, Math.max(bh * SHADOW_HEIGHT, short * 0.02));
  }
  return blurMask(zone, width, height, FEATHER * short);
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
  const zone = await productZone(refined, width, height);

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

  // 3. How well the AI kept each product where it was arranged (safety net / tone for exact ones).
  const fallback = new Float32Array(width * height);
  const productMatch = [];
  const exactOverlays = [];
  for (const l of placed) {
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
    if (l.exact) {
      const gain =
        match >= MIN_TONE_MATCH ? [0, 1, 2].map((c) => (tone[c + 3] > 0 ? Math.min(1.12, Math.max(0.9, tone[c] / tone[c + 3])) : 1)) : [1, 1, 1];
      exactOverlays.push({ layer: l.layer, gain, match });
      continue;
    }
    productMatch.push(match);
    if (match >= MIN_PRODUCT_MATCH) continue;
    for (let y = 0; y < l.h; y += 1) {
      for (let x = 0; x < l.w; x += 1) {
        const cx = l.left + x;
        const cy = l.top + y;
        if (cx >= width || cy >= height) continue;
        const i = cy * width + cx;
        fallback[i] = Math.max(fallback[i], l.data[(y * l.w + x) * 4 + 3] / 255);
      }
    }
  }

  // 4. The refined products at composition size (room outside the zone).
  const out = Buffer.alloc(roomRgb.length);
  let drift = 0;
  let driftN = 0;
  for (let i = 0; i < width * height; i += 1) {
    const z = zone[i];
    if (z <= 0) driftN += 1;
    for (let c = 0; c < 3; c += 1) {
      const r = roomRgb[i * 3 + c];
      if (z <= 0) drift += Math.abs(genRgb[i * 3 + c] - r);
      const blended = r * (1 - z) + Math.min(255, genRgb[i * 3 + c] * gains[c]) * z;
      const f = fallback[i];
      out[i * 3 + c] = Math.round(blended * (1 - f) + arrangedRgb[i * 3 + c] * f);
    }
  }

  // 5. On the original photo at its own resolution.
  const native = await onOriginal(roomImagePath, out, zone, width, height, exactOverlays);
  return {
    buffer: native.buffer,
    format: 'png',
    stats: {
      ...native.stats,
      aiDriftOutsideProducts: Math.round((drift / Math.max(1, driftN * 3)) * 10) / 10, // how much the AI had changed the room (discarded)
      shift: { dx: shift.dx, dy: shift.dy, match: Math.round(shift.score * 1000) / 1000 },
      toneGains: gains.map((g) => Math.round(g * 1000) / 1000),
      productMatch,
      productsKeptFromArrange: productMatch.filter((m) => m < MIN_PRODUCT_MATCH).length,
      wallProducts: exactOverlays.map((o) => ({ aiMatch: o.match, aiToneUsed: o.gain.some((g) => g !== 1) })),
    },
  };
}

async function onOriginal(roomImagePath, out, zone, width, height, exactOverlays) {
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

  const final = Buffer.from(orig);
  const touched = new Uint8Array(nw * nh);
  for (let i = 0; i < nw * nh; i += 1) {
    if (zoneUp[i] === 0) continue;
    const z = zoneUp[i] / 255;
    for (let c = 0; c < 3; c += 1) final[i * 3 + c] = Math.round(orig[i * 3 + c] * (1 - z) + productUp[i * 3 + c] * z);
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
