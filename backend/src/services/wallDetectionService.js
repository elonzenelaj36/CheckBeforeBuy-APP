/**
 * Wall detection — "Items Detected" for the room's WALLS, so wall-mounted
 * products (paintings, mirrors, TVs, wall shelves…) can be generated on the
 * right wall in its real perspective.
 *
 * Two parts, each doing what it is good at:
 *   1. WHERE the walls are — the project's existing Groq vision model (the
 *      same one and the same call path as Items Detected): each visible wall's
 *      region (4 corners), which way it faces (front / left side / right side),
 *      whether something can be hung on it, and a confidence.
 *   2. WHICH WAY each wall faces exactly — deterministic geometry
 *      (wallGeometry.js): the straight horizontal edges detected INSIDE that
 *      wall's region (lineSegmentService.js) give the wall's 3D direction for
 *      the picture's camera; without enough of them, the region's own top and
 *      bottom edges (its lines with the ceiling and floor) are used.
 * The result is honest about uncertainty: `confidence` drops when the edges
 * and the region disagree, and a wall without usable geometry has no normal.
 *
 * Cached next to the picture (`<image>.walls.json`): each picture is analysed
 * once (1 Groq call), only when a wall-mounted product is placed on it.
 */

const fs = require('fs');
const sharp = require('sharp');
const { askGroqAboutImage, isAvailable } = require('./roomItemDetectionService');
const { lineSegments } = require('./lineSegmentService');
const geo = require('./wallGeometry');

/** Version of the geometry (angles) — bump when wallNormal changes; Groq's regions are kept. */
const CACHE_VERSION = 5;
/** Version of the Groq regions (the prompt) — bump only when PROMPT/parseWalls change. */
const REGIONS_VERSION = 1;
/** Lines this close to a wall's region still belong to it (its floor and ceiling lines lie ON its border). */
const BORDER_MARGIN = 0.05;
/** Lines within this many degrees of each other run the same way (one wall direction). */
const CLUSTER_DEG = 12;
const MIN_CONFIDENCE = 0.4;

const PROMPT =
  'Find the WALLS visible in this room photo: vertical wall surfaces only — not doors, windows, ' +
  'curtains, wardrobes, cabinets or other furniture fronts. Ignore the floor and the ceiling.\n' +
  'For each wall give the corners of its visible area on a 0-1000 scale, in this order: top-left, ' +
  'top-right, bottom-right, bottom-left. Follow the wall: its top edge is where it meets the ceiling ' +
  '(or the top of the photo), its bottom edge where it meets the floor (or furniture standing in front).\n' +
  'facing: "front" if the wall faces the camera, "left" if it is a side wall on the left running away ' +
  'from the camera, "right" if it is a side wall on the right running away.\n' +
  'mountable: true if a picture could be hung on a clear part of it (false if it is mostly covered by ' +
  'windows, curtains or tall furniture). confidence: 0-1.\n' +
  'Return JSON only: {"walls":[{"corners":[[0,0],[0,0],[0,0],[0,0]],"facing":"front","mountable":true,"confidence":0.0}]}';

/** Model's 0–1000 longer-side scale → picture 0..1 (same conversion as Items Detected). */
function toPicture([x, y], width, height) {
  const L = Math.max(width, height);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return [clamp(((x / 1000) * L) / width), clamp(((y / 1000) * L) / height)];
}

function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The room's two horizontal directions. Rooms are built at right angles, so
 * nearly every horizontal line in the picture — wall/floor and wall/ceiling
 * lines, skirting, window and door tops, beds, dressers, frames — runs along
 * one of two perpendicular directions. All lines vote; the best pair wins.
 * Lines that aren't horizontal in the room (a sloped attic ceiling) don't fit
 * either direction and barely count. Returns { axis, share } (axis and
 * axis + 90 are the two directions; share = how much of the line evidence
 * agrees) or null when there are too few lines.
 */
function roomAxes(segments, cam) {
  const items = [];
  for (const s of segments) {
    const deg = geo.segmentDirectionDeg(s, cam);
    if (deg !== null) items.push({ deg, w: Math.hypot((s[2] - s[0]) * cam.aspect, s[3] - s[1]) });
  }
  const total = items.reduce((sum, d) => sum + d.w, 0);
  if (total < 0.3) return null;
  let axis = 0;
  let support = -1;
  for (let t = 0; t < 90; t += 0.5) {
    let score = 0;
    for (const d of items) {
      const diff = Math.min(geo.axisDiff(d.deg, t), geo.axisDiff(d.deg, t + 90));
      score += d.w * Math.exp(-((diff / 4) ** 2));
    }
    if (score > support) {
      support = score;
      axis = t;
    }
  }
  return { axis, share: support / total };
}

/** Minimum share of the line evidence the room's two directions must explain to be trusted. */
const MIN_AXES_SHARE = 0.3;

/** Distance (aspect-corrected) from a point to a polygon's border. */
function distanceToPolygon([px, py], poly, aspect) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const ax = poly[j][0] * aspect;
    const ay = poly[j][1];
    const bx = poly[i][0] * aspect;
    const by = poly[i][1];
    const x = px * aspect;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
  }
  return best;
}

/** Parses the model's answer into wall regions (drops malformed / tiny ones). */
function parseWalls(raw, width, height) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.walls) ? raw.walls : [];
  const out = [];
  for (const w of list) {
    if (!Array.isArray(w?.corners) || w.corners.length !== 4) continue;
    const pts = w.corners.map((c) => (Array.isArray(c) && c.length === 2 ? c.map(Number) : null));
    if (!pts.every((p) => p && p.every(Number.isFinite))) continue;
    const polygon = pts.map((p) => toPicture(p, width, height));
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    if ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) < 0.01) continue;
    const confidence = Number.isFinite(Number(w.confidence)) ? Math.min(1, Math.max(0, Number(w.confidence))) : 0.5;
    out.push({
      polygon,
      facing: ['front', 'left', 'right'].includes(w.facing) ? w.facing : 'front',
      mountable: w.mountable !== false,
      confidence,
    });
  }
  return out;
}

/**
 * The wall's facing direction from geometry: horizontal edges inside its
 * region, else its region's top/bottom edges; checked against the model's
 * front/left/right answer. Returns { normalDeg, source, agreement } or null.
 */
function wallNormal(wall, segments, cam, axes = null) {
  const [tl, tr, br, bl] = wall.polygon;
  const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4;
  const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;

  // Direction from the region's own edges with ceiling and floor.
  const edgeDirs = [
    [tl[0], tl[1], tr[0], tr[1]],
    [bl[0], bl[1], br[0], br[1]],
  ]
    .map((s) => ({ deg: geo.segmentDirectionDeg(s, cam), w: Math.hypot((s[2] - s[0]) * cam.aspect, s[3] - s[1]) }))
    .filter((d) => d.deg !== null);
  const edgeAxis = edgeDirs.length ? geo.meanAxis(edgeDirs) : null;

  // Direction from the room's own straight lines on (or at the border of) the region: wall/floor and
  // wall/ceiling lines, skirting, frames… They follow the wall's perspective exactly; the model's
  // corners are only a rough box (often just the photo's edges).
  const near = [];
  for (const s of segments) {
    const mid = [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2];
    if (!pointInPolygon(mid, wall.polygon) && distanceToPolygon(mid, wall.polygon, cam.aspect) > BORDER_MARGIN) continue;
    const deg = geo.segmentDirectionDeg(s, cam);
    if (deg === null) continue;
    near.push({ deg, w: Math.hypot((s[2] - s[0]) * cam.aspect, s[3] - s[1]) });
  }
  // The strongest group of lines that run the same way is the wall's direction.
  let cluster = [];
  let clusterWeight = 0;
  for (const c of near) {
    const group = near.filter((d) => geo.axisDiff(d.deg, c.deg) <= CLUSTER_DEG);
    const weight = group.reduce((sum, d) => sum + d.w, 0);
    if (weight > clusterWeight) {
      cluster = group;
      clusterWeight = weight;
    }
  }

  let axis = null;
  let source = null;
  if (clusterWeight >= 0.15) {
    axis = geo.meanAxis(cluster);
    source = 'lines';
  } else if (edgeAxis !== null) {
    axis = edgeAxis;
    source = 'edges';
  }
  // Which way a normal faces as seen from the camera: 0 = straight back at it, − = a left side wall, + = right.
  const ray = geo.levelRay(cx, cy, cam);
  const rayDeg = Math.atan2(ray[0], ray[2]) / (Math.PI / 180);
  const relOf = (n) => geo.wrap180(n - rayDeg - 180);
  const facingOf = (rel) => (Math.abs(rel) < 25 ? 'front' : rel < 0 ? 'left' : 'right');

  // The room's two directions: the wall runs along one of them — the one that faces the way the model
  // says (front / left / right); if neither or both do, the one closer to the region's own lines/edges.
  if (axes) {
    const cands = [axes.axis, axes.axis + 90].map((a) => {
      const n = geo.normalFacingCamera(a, cx, cy, cam);
      return { n, rel: relOf(n) };
    });
    let pick = null;
    if (wall.facing === 'front') {
      const sorted = [...cands].sort((p, q) => Math.abs(p.rel) - Math.abs(q.rel));
      if (Math.abs(sorted[0].rel) < 35 && Math.abs(sorted[1].rel) >= 35) pick = sorted[0];
    } else {
      const sign = wall.facing === 'left' ? -1 : 1;
      const ok = cands.filter((c) => Math.sign(c.rel) === sign && Math.abs(c.rel) >= 20);
      if (ok.length === 1) pick = ok[0];
    }
    if (pick) return { normalDeg: pick.n, source: 'room-lines', agreement: 1 };
    if (axis !== null) {
      const own = geo.normalFacingCamera(axis, cx, cy, cam);
      const near = cands.sort((p, q) => Math.abs(geo.wrap180(p.n - own)) - Math.abs(geo.wrap180(q.n - own)))[0];
      return { normalDeg: near.n, source: 'room-lines', agreement: 0.6 };
    }
  }

  if (axis === null) return null;
  const normalDeg = geo.normalFacingCamera(axis, cx, cy, cam);
  const agreement = facingOf(relOf(normalDeg)) === wall.facing ? 1 : 0.6;
  return { normalDeg, source, agreement };
}

/**
 * @param {string} imagePath absolute path of the room picture
 * @param {{ fovDeg?: number|null, recordedPitchDeg?: number|null }} camera hints (captures: measured FOV / recorded tilt)
 * @returns {Promise<{ status: 'ok'|'unavailable', camera: object, walls: Array }>}
 */
/** Analyses running now, per picture: concurrent requests (walls, preview, Generate) share one Groq call. */
const running = new Map();
/** Pictures the model just found no walls in: not asked again for a while (each drop would spend Groq's rate limit). */
const noWallsUntil = new Map();
const NO_WALLS_RETRY_MS = 2 * 60 * 1000;

/**
 * The walls of a room picture. `capture` (a 180°/360° view): { angleDeg, frames: [{ imagePath, angleDeg }] }
 * — the other views of the same recording, used to correct walls that disagree with the room (alignToCapture).
 */
async function detectWalls(imagePath, options = {}) {
  let pending = running.get(imagePath);
  if (!pending) {
    pending = analyse(imagePath, options).finally(() => running.delete(imagePath));
    running.set(imagePath, pending);
  }
  const result = await pending;
  return options.capture ? alignToCapture(result, options.capture) : result;
}

/** Side check shared with the vanishing point: a side wall must really turn that way, a front wall roughly face the camera. */
function onItsSide(facing, rel) {
  return facing === 'left' ? rel <= -15 : facing === 'right' ? rel >= 15 : Math.abs(rel) <= 50;
}

/** Direction (degrees, + = right of the camera's forward) a wall faces relative to the camera ray through its middle: 0 = straight at it. */
function relToCamera(wall, normalDeg, camera) {
  const cx = wall.polygon.reduce((sum, p) => sum + p[0], 0) / wall.polygon.length;
  const cy = wall.polygon.reduce((sum, p) => sum + p[1], 0) / wall.polygon.length;
  const ray = geo.levelRay(cx, cy, camera);
  return geo.wrap180(normalDeg - Math.atan2(ray[0], ray[2]) / (Math.PI / 180) - 180);
}

/** A wall this far from every room direction is a misreading (e.g. a sloped attic ceiling taken for a horizontal line). */
const CAPTURE_OUTLIER_DEG = 20;
const MIN_CAPTURE_WALLS = 6;
const MIN_CAPTURE_VIEWS = 4;
const MIN_CAPTURE_SHARE = 0.45;

/**
 * A 180°/360° recording sees the same room from many directions, each view's
 * direction known from the gyroscope. Rooms are built at right angles, so
 * every wall of every view faces one of four room directions (axis + k·90°).
 * Those are voted by all analysed views; a wall in this view that is far off
 * all of them (a plain wall, a sloped ceiling, a rough region) is turned to
 * the nearest room direction that keeps it on the side the model saw it.
 * Walls that roughly agree keep their own measurement. Views analysed later
 * add to the vote, so this runs on every request (not cached).
 */
async function alignToCapture(result, capture) {
  if (result.status !== 'ok' || !result.walls.length) return result;
  const votes = [];
  const views = new Set();
  for (const frame of capture.frames) {
    let cached;
    try {
      cached = JSON.parse(await fs.promises.readFile(`${frame.imagePath}.walls.json`, 'utf8'));
    } catch {
      continue; // not analysed yet
    }
    if (cached.version !== CACHE_VERSION) continue;
    for (const w of cached.result.walls) {
      if (w.normalDeg === null) continue;
      votes.push({ deg: geo.wrap180(w.normalDeg + frame.angleDeg), w: w.confidence * (w.geometry === 'vanishing-point' ? 1 : 0.6) });
      views.add(frame.imagePath);
    }
  }
  const total = votes.reduce((sum, v) => sum + v.w, 0);
  if (votes.length < MIN_CAPTURE_WALLS || views.size < MIN_CAPTURE_VIEWS) return result;
  const off = (deg, t) => {
    const d = Math.abs(geo.wrap180(deg - t)) % 90;
    return Math.min(d, 90 - d);
  };
  let axis = 0;
  let support = -1;
  for (let t = 0; t < 90; t += 0.5) {
    const score = votes.reduce((sum, v) => sum + v.w * Math.exp(-((off(v.deg, t) / 6) ** 2)), 0);
    if (score > support) {
      support = score;
      axis = t;
    }
  }
  if (support / total < MIN_CAPTURE_SHARE) return result;

  const walls = result.walls.map((w) => {
    if (w.normalDeg === null) return w;
    const roomDeg = geo.wrap180(w.normalDeg + capture.angleDeg);
    if (off(roomDeg, axis) < CAPTURE_OUTLIER_DEG) return w;
    const choices = [0, 1, 2, 3]
      .map((k) => geo.wrap180(axis + k * 90 - capture.angleDeg))
      .filter((n) => onItsSide(w.facing, relToCamera(w, n, result.camera)))
      .sort((a, b) => Math.abs(geo.wrap180(a - w.normalDeg)) - Math.abs(geo.wrap180(b - w.normalDeg)));
    if (!choices.length || Math.abs(geo.wrap180(choices[0] - w.normalDeg)) > 50) return w;
    // Its own vanishing point was the misreading: the quad follows the corrected direction instead.
    return { ...w, normalDeg: Math.round(choices[0] * 10) / 10, geometry: 'room-capture', vp: null };
  });
  return { ...result, walls };
}

async function analyse(imagePath, { fovDeg = null, recordedPitchDeg = null } = {}) {
  const cachePath = `${imagePath}.walls.json`;
  let regions = null;
  try {
    const cached = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
    if (cached.version === CACHE_VERSION) return cached.result;
    // Geometry changed since: keep Groq's regions (no new call, same wall ids), recompute the angles.
    if (cached.regionsVersion === REGIONS_VERSION && Array.isArray(cached.regions)) regions = cached.regions;
  } catch {
    // not analysed yet
  }

  const meta = await sharp(imagePath).rotate().metadata();
  const swap = meta.orientation && meta.orientation >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  const { segments } = await lineSegments(imagePath);
  const camera = geo.pictureCamera({ aspect: width / height, fovDeg, recordedPitchDeg, segments });

  if (!regions) {
    if (!isAvailable()) return { status: 'unavailable', camera, walls: [] };
    if ((noWallsUntil.get(imagePath) || 0) > Date.now()) return { status: 'ok', camera, walls: [] };
    try {
      // The model now and then answers with no walls at all for a picture it reads fine the next time: ask once more.
      for (let attempt = 0; attempt < 2 && !regions?.length; attempt += 1) {
        const { content, width: w, height: h } = await askGroqAboutImage(imagePath, PROMPT);
        regions = parseWalls(content, w, h);
      }
    } catch (err) {
      console.warn('[walls] detection failed:', err.message);
      return { status: 'unavailable', camera, walls: [] }; // not cached: try again next time
    }
  }

  const found = roomAxes(segments, camera);
  const axes = found && found.share >= MIN_AXES_SHARE ? found : null;
  const walls = regions
    .map((r, i) => {
      let n = wallNormal(r, segments, camera, axes);
      // The wall's own vanishing point (its lines meeting in the picture) is the most direct evidence:
      // it decides the angle unless it puts the wall on the other side than the model saw it.
      const vanishing = geo.vanishingPoint(segments, r.polygon, camera.aspect);
      let vp = null;
      if (vanishing) {
        const [cx, cy] = [r.polygon.reduce((sum, p) => sum + p[0], 0) / 4, r.polygon.reduce((sum, p) => sum + p[1], 0) / 4];
        const normalDeg = geo.normalFacingCamera(geo.vanishingDirectionDeg(vanishing.vp, camera), cx, cy, camera);
        // A side wall must really turn that way; a front wall must roughly face the camera.
        if (onItsSide(r.facing, relToCamera(r, normalDeg, camera))) {
          n = { normalDeg, source: 'vanishing-point', agreement: 1 };
          vp = vanishing.vp.map((v) => Math.round(v * 1e6) / 1e6);
        }
      }
      const round = (v) => Math.round(v * 1000) / 1000;
      return {
        id: `wall_${i + 1}`,
        polygon: r.polygon.map(([x, y]) => [round(x), round(y)]),
        facing: r.facing,
        mountable: r.mountable,
        // The model's confidence, lowered when the geometry disagrees with its front/left/right.
        confidence: round(r.confidence * (n ? n.agreement : 0.5)),
        normalDeg: n ? Math.round(n.normalDeg * 10) / 10 : null,
        // 'vanishing-point' | 'room-lines' (the room's two directions) | 'lines' | 'edges' | null (no usable geometry)
        geometry: n ? n.source : null,
        // Its vanishing point (homogeneous, aspect-corrected), when found: a painting's top and bottom edges aim at it.
        vp,
      };
    })
    .filter((w) => w.confidence >= MIN_CONFIDENCE);

  const result = { status: 'ok', camera: { ...camera, fovDeg: Math.round(camera.fovDeg * 10) / 10 }, walls };
  // No walls found: not kept on disk, asked again after a short while (a room picture practically always shows one).
  if (!regions.length) noWallsUntil.set(imagePath, Date.now() + NO_WALLS_RETRY_MS);
  else await fs.promises.writeFile(cachePath, JSON.stringify({ version: CACHE_VERSION, regionsVersion: REGIONS_VERSION, regions, result })).catch(() => {});
  console.log(`[walls] ${walls.length} wall(s): ${walls.map((w) => `${w.facing} n=${w.normalDeg} (${w.geometry}, ${w.confidence})`).join('; ')}`);
  return result;
}

/** The wall a product at picture point (x, y) hangs on: the confident wall containing it, else the nearest close one. */
function wallAt(walls, x, y) {
  const usable = walls.filter((w) => w.normalDeg !== null);
  const containing = usable.filter((w) => pointInPolygon([x, y], w.polygon)).sort((a, b) => b.confidence - a.confidence);
  if (containing.length) return containing[0];
  let best = null;
  let bestD = 0.12;
  for (const w of usable) {
    const cx = w.polygon.reduce((s, p) => s + p[0], 0) / 4;
    const cy = w.polygon.reduce((s, p) => s + p[1], 0) / 4;
    const d = Math.hypot(x - cx, y - cy) - 0.25;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/**
 * The wall a layer hangs on: the one the app attached it to, if that wall still
 * contains its position (ids can change when a picture is re-analysed), else
 * the wall at its position.
 */
function wallForLayer(walls, wallId, x, y) {
  const chosen = wallId ? walls.find((w) => w.id === wallId) : null;
  if (chosen && chosen.normalDeg !== null && pointInPolygon([x, y], chosen.polygon)) return chosen;
  return wallAt(walls, x, y);
}

module.exports = { detectWalls, wallAt, wallForLayer, parseWalls, pointInPolygon };
