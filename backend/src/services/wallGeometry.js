/**
 * Wall geometry from ONE room picture — pure, deterministic maths.
 *
 * The camera: horizontal field of view (measured for 180°/360° captures, a
 * typical phone camera for photos), tilt (recorded by the phone, or measured
 * from the picture's vertical edges, which converge with tilt) and the
 * picture's width/height.
 *
 * A horizontal room edge (wall/ceiling line, skirting, door or window top)
 * spans a plane through the camera; that plane's horizontal direction IS the
 * edge's 3D direction — exact for any camera tilt. A wall runs along its
 * horizontal edges; its NORMAL (perpendicular, facing the camera side) is the
 * way something hung on it faces.
 *
 * Frame (top-down, camera without tilt): x right, z forward, y up. Horizontal
 * angles are degrees from the view's forward direction, + = right.
 *
 * Honest limits: walls are assumed vertical and the camera unrolled; this is
 * the geometry of the picture, not a 3D reconstruction of the room.
 */

const DEG = Math.PI / 180;

/** A typical phone main camera (~26 mm equivalent): ≈69.4° across the long side. */
const PHOTO_LONG_SIDE_FOV_DEG = 69.4;
const PHOTO_DEFAULT_PITCH_DEG = 5;

/** Unit camera ray (tilt removed) through picture point (x, y). */
function levelRay(x, y, cam) {
  const tH = Math.tan((cam.fovDeg / 2) * DEG);
  const tV = tH / cam.aspect;
  const cx = (x - 0.5) * 2 * tH;
  const cy = -(y - 0.5) * 2 * tV;
  const p = cam.pitchDeg * DEG; // + = looking down
  const ly = cy * Math.cos(p) - Math.sin(p);
  const lz = cy * Math.sin(p) + Math.cos(p);
  const n = Math.hypot(cx, ly, lz);
  return [cx / n, ly / n, lz / n];
}

/** Tilt-removed point → picture (x, y); null behind the camera. */
function project(v, cam) {
  const p = cam.pitchDeg * DEG;
  const cy = v[1] * Math.cos(p) + v[2] * Math.sin(p);
  const cz = -v[1] * Math.sin(p) + v[2] * Math.cos(p);
  if (cz <= 1e-3) return null;
  const tH = Math.tan((cam.fovDeg / 2) * DEG);
  const tV = tH / cam.aspect;
  return [0.5 + v[0] / (cz * 2 * tH), 0.5 - cy / (cz * 2 * tV)];
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Horizontal 3D direction (axis, [0, 180)) of a picture segment, or null if it isn't a usable horizontal edge. */
function segmentDirectionDeg([x1, y1, x2, y2], cam) {
  if (Math.abs((x2 - x1) * cam.aspect) < 0.36 * Math.abs(y2 - y1)) return null; // ~vertical edge
  const m = cross(levelRay(x1, y1, cam), levelRay(x2, y2, cam));
  const len = Math.hypot(...m);
  if (len < 1e-6 || Math.hypot(m[0], m[2]) / len < 0.15) return null; // lies along the horizon: ill-defined
  const deg = Math.atan2(-m[2], m[0]) / DEG;
  return ((deg % 180) + 180) % 180;
}

/** Camera tilt measured from the picture's near-vertical edges; null when there are too few. */
function estimatePitchDeg(segments, cam) {
  const level = { ...cam, pitchDeg: 0 };
  const normals = [];
  let spread = 0;
  let minX = 1;
  let maxX = 0;
  for (const s of segments) {
    const dx = (s[2] - s[0]) * cam.aspect;
    const dy = s[3] - s[1];
    if (Math.abs(dx) > 0.25 * Math.abs(dy)) continue;
    const m = cross(levelRay(s[0], s[1], level), levelRay(s[2], s[3], level));
    const len = Math.hypot(...m);
    if (len < 1e-6) continue;
    normals.push({ m: m.map((v) => v / len), w: Math.abs(dy) });
    spread += Math.abs(dy);
    minX = Math.min(minX, (s[0] + s[2]) / 2);
    maxX = Math.max(maxX, (s[0] + s[2]) / 2);
  }
  if (normals.length < 3 || spread < 0.6 || maxX - minX < 0.3) return null;
  let best = 0;
  let bestCost = Infinity;
  for (let p10 = -300; p10 <= 450; p10 += 5) {
    const p = (p10 / 10) * DEG;
    const up = [0, Math.cos(p), -Math.sin(p)];
    let cost = 0;
    for (const { m, w } of normals) cost += w * Math.min((m[0] * up[0] + m[1] * up[1] + m[2] * up[2]) ** 2, 0.01);
    if (cost < bestCost) {
      bestCost = cost;
      best = p10 / 10;
    }
  }
  return best;
}

/** Camera of a picture: field of view, tilt (+ where it came from) and width/height. */
function pictureCamera({ aspect, fovDeg = null, recordedPitchDeg = null, segments = [] }) {
  // Photos: the long side spans ~69°; portrait photos then see less horizontally.
  const fov =
    fovDeg ??
    (aspect >= 1 ? PHOTO_LONG_SIDE_FOV_DEG : (2 * Math.atan(Math.tan((PHOTO_LONG_SIDE_FOV_DEG / 2) * DEG) * aspect)) / DEG);
  const base = { fovDeg: fov, aspect, pitchDeg: 0 };
  if (recordedPitchDeg != null) return { ...base, pitchDeg: recordedPitchDeg, pitchSource: 'recorded' };
  const measured = estimatePitchDeg(segments, base);
  if (measured != null) return { ...base, pitchDeg: measured, pitchSource: 'measured' };
  return { ...base, pitchDeg: fovDeg ? 0 : PHOTO_DEFAULT_PITCH_DEG, pitchSource: 'assumed' };
}

/** The normal (facing the camera side) of a wall running along axis `dirDeg`, seen at picture point (x, y). */
function normalFacingCamera(dirDeg, x, y, cam) {
  const ray = levelRay(x, y, cam);
  const n1 = dirDeg + 90;
  const dot = Math.sin(n1 * DEG) * ray[0] + Math.cos(n1 * DEG) * ray[2];
  const n = dot < 0 ? n1 : n1 - 180;
  return ((((n + 180) % 360) + 360) % 360) - 180;
}

const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** Weighted mean of axis directions (mod 180). */
function meanAxis(items) {
  let c = 0;
  let s = 0;
  for (const { deg, w } of items) {
    c += w * Math.cos(2 * deg * DEG);
    s += w * Math.sin(2 * deg * DEG);
  }
  if (!c && !s) return null;
  const d = Math.atan2(s, c) / 2 / DEG;
  return (d + 180) % 180;
}

const axisDiff = (a, b) => {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
};

/**
 * Corners (TL, TR, BR, BL; picture 0..1) of a flat object of real
 * width/height `objectAspect` mounted on a wall with normal `normalDeg`,
 * centred at (x, y), whose picture height at its centre is `height` (share of
 * the picture height). Exact pinhole projection; null if seen edge-on.
 */
function wallQuad(x, y, height, objectAspect, normalDeg, cam) {
  const c = levelRay(x, y, cam);
  const n0 = Math.sin(normalDeg * DEG);
  const n2 = Math.cos(normalDeg * DEG);
  if (Math.abs(n0 * c[0] + n2 * c[2]) < 0.12) return null;
  let u = [n2, 0, -n0];
  const right = project([c[0] + u[0] * 0.01, c[1], c[2] + u[2] * 0.01], cam);
  const centre = project(c, cam);
  if (!right || !centre) return null;
  if (right[0] < centre[0]) u = [-u[0], 0, -u[2]];
  let h3 = 0.1;
  for (let k = 0; k < 2; k += 1) {
    const top = project([c[0], c[1] + h3 / 2, c[2]], cam);
    const bottom = project([c[0], c[1] - h3 / 2, c[2]], cam);
    if (!top || !bottom || bottom[1] - top[1] <= 1e-6) return null;
    h3 *= height / (bottom[1] - top[1]);
  }
  const w3 = h3 * objectAspect;
  const corner = (su, sv) => project([c[0] + u[0] * (w3 / 2) * su, c[1] + (h3 / 2) * sv, c[2] + u[2] * (w3 / 2) * su], cam);
  const quad = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
  return quad.every(Boolean) ? quad : null;
}

/**
 * A wall's VANISHING POINT in the picture: where its horizontal lines (its
 * line with the ceiling and the floor, skirting, door and window tops,
 * frames…) meet. Found from the picture alone — no camera model — so it
 * matches what the eye sees even when the camera (lens width, tilt) is only
 * roughly known. Pairs of the longest lines on/around the wall's region give
 * candidates; the one most lines point at (within 2°) wins, if at least two
 * lines at different heights agree. Homogeneous, in aspect-corrected
 * coordinates (x·aspect, y): [a, b, c] (c ≈ 0 = a direction, lines parallel).
 */
function vanishingPoint(segments, polygon, aspect, margin = 0.06) {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const [bx1, bx2, by1, by2] = [Math.min(...xs) - margin, Math.max(...xs) + margin, Math.min(...ys) - margin, Math.max(...ys) + margin];
  const lines = [];
  for (const s of segments) {
    const mx = (s[0] + s[2]) / 2;
    const my = (s[1] + s[3]) / 2;
    if (mx < bx1 || mx > bx2 || my < by1 || my > by2) continue;
    const dx = (s[2] - s[0]) * aspect;
    const dy = s[3] - s[1];
    if (Math.abs(dy) > Math.abs(dx) * 1.2) continue; // (near-)vertical: not a horizontal room line
    const len = Math.hypot(dx, dy);
    const p = [s[0] * aspect, s[1], 1];
    const q = [s[2] * aspect, s[3], 1];
    const l = cross(p, q);
    const n = Math.hypot(l[0], l[1]);
    lines.push({ l: l.map((v) => v / n), w: len, mid: [mx * aspect, my], dir: [dx / len, dy / len] });
  }
  lines.sort((a, b) => b.w - a.w);
  const support = (vp) => {
    let weight = 0;
    let count = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of lines) {
      const t = Math.abs(vp[2]) < 1e-9 ? [vp[0], vp[1]] : [vp[0] / vp[2] - it.mid[0], vp[1] / vp[2] - it.mid[1]];
      const tn = Math.hypot(t[0], t[1]);
      if (!tn) continue;
      const cos = Math.min(1, Math.abs((t[0] * it.dir[0] + t[1] * it.dir[1]) / tn));
      if (Math.acos(cos) / DEG > 2) continue;
      weight += it.w;
      count += 1;
      lo = Math.min(lo, it.mid[1]);
      hi = Math.max(hi, it.mid[1]);
    }
    return { weight, count, spread: count ? hi - lo : 0 };
  };
  const top = lines.slice(0, 25);
  let best = null;
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      const vp = cross(top[i].l, top[j].l);
      const n = Math.hypot(...vp);
      if (!n) continue;
      const v = vp.map((x) => x / n);
      const sup = support(v);
      if (sup.count >= 2 && sup.spread > 0.08 && (!best || sup.weight > best.weight)) best = { vp: v, ...sup };
    }
  }
  return best;
}

/** Horizontal direction (axis, [0, 180)) of the room lines that meet at vanishing point `vp` (see vanishingPoint). */
function vanishingDirectionDeg(vp, cam) {
  // Parallel in the picture (c ≈ 0): the lines run across the view, perpendicular to forward.
  if (Math.abs(vp[2]) < 1e-9) return 90;
  const r = levelRay(vp[0] / vp[2] / cam.aspect, vp[1] / vp[2], cam);
  const deg = Math.atan2(r[0], r[2]) / DEG; // same convention as segmentDirectionDeg
  return ((deg % 180) + 180) % 180;
}

/**
 * wallQuad, with its top and bottom edges aimed exactly at the wall's
 * vanishing point (the picture's own lines), keeping its size, centre and
 * sides. The camera model gives how foreshortened it is; the vanishing point
 * gives the slopes the eye compares with the room's lines.
 */
function wallQuadToVanishingPoint(quad, vp, aspect) {
  const P = (p) => [p[0] * aspect, p[1], 1];
  const [tl, tr, br, bl] = quad.map(P);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1];
  const topLine = cross(mid(tl, tr), vp);
  const bottomLine = cross(mid(bl, br), vp);
  const leftLine = cross(tl, bl);
  const rightLine = cross(tr, br);
  const meet = (a, b) => {
    const p = cross(a, b);
    return Math.abs(p[2]) < 1e-12 ? null : [p[0] / p[2] / aspect, p[1] / p[2]];
  };
  const out = [meet(topLine, leftLine), meet(topLine, rightLine), meet(bottomLine, rightLine), meet(bottomLine, leftLine)];
  return out.every(Boolean) ? out : quad;
}

/**
 * Turntable angle at which an object facing along `normalDeg` is seen from
 * the camera at picture point (x, y) (model-viewer convention: + = camera on
 * the model's +X side). Used for the 3D preview's starting turn.
 */
function turnDeg(x, y, normalDeg, cam) {
  const r = levelRay(x, y, cam);
  const h = Math.hypot(r[0], r[2]) || 1;
  const c = [-r[0] / h, -r[2] / h];
  const n = [Math.sin(normalDeg * DEG), Math.cos(normalDeg * DEG)];
  const xm = [-n[1], n[0]];
  return Math.atan2(c[0] * xm[0] + c[1] * xm[1], c[0] * n[0] + c[1] * n[1]) / DEG;
}

module.exports = {
  levelRay,
  project,
  segmentDirectionDeg,
  estimatePitchDeg,
  pictureCamera,
  normalFacingCamera,
  meanAxis,
  axisDiff,
  wrap180,
  wallQuad,
  turnDeg,
  vanishingPoint,
  vanishingDirectionDeg,
  wallQuadToVanishingPoint,
};
