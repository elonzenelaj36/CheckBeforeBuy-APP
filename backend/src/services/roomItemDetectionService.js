/**
 * Room item detection — finds the existing furniture in a room and where it
 * appears, for "Items Detected".
 *
 * Provider: the project's existing Groq vision model (AI_PROVIDER=groq,
 * AI_API_KEY, AI_MODEL — the same one product analysis/detection uses). No
 * new service and nothing installed. The model is asked for furniture-sized
 * objects only, each with a box.
 *
 * Box coordinates: the model returns 0–1000 coordinates measured against the
 * image's LONGER side on both axes (verified on portrait room views and
 * landscape/square photos), so they are converted with that side here.
 *
 * Room types:
 *   - photo room: the primary photo (the room's main picture) → one
 *     observation per item. Other photos are not used: without a shared
 *     coordinate system, the same sofa in two photos can't be told apart
 *     from two sofas.
 *   - 180°/360° room: a few evenly spaced captured views (not every frame),
 *     each box turned into the room DIRECTION range it covers (the capture is
 *     one camera turning in place), and repeated sightings of the same kind of
 *     item over overlapping directions are merged into ONE item with several
 *     observations. Directions are 2D (left/right around the room), not 3D
 *     coordinates.
 *
 * Free tier: Groq limits this model to ~7,000 input tokens/minute and
 * reserves ~2,250 per image, so about 3 views per minute; requests follow
 * Groq's "try again in …" hint.
 */

const sharp = require('sharp');
const env = require('../config/env');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_NETWORK_RETRIES = 2;
const SEND_SIDE = 1280;

/** Furniture-oriented categories (what the model is allowed to return). */
const CATEGORIES = [
  'sofa', 'armchair', 'chair', 'dining chair', 'bed', 'coffee table', 'dining table', 'table', 'desk',
  'nightstand', 'dresser', 'cabinet', 'wardrobe', 'bookshelf', 'tv stand', 'tv', 'lamp', 'floor lamp',
  'mirror', 'rug', 'fireplace', 'plant',
];
/** Kinds the model may name differently from one view to the next — merged as the same item. */
const MERGE_GROUPS = [
  ['chair', 'dining chair', 'armchair'],
  ['table', 'coffee table', 'dining table'],
  ['lamp', 'floor lamp'],
  ['dresser', 'cabinet'],
];
const MIN_CONFIDENCE = 0.5;
/** Boxes smaller than this share of the image are specks (clutter is excluded by CATEGORIES; far furniture can be small). */
const MIN_AREA = 0.0015;

/** Horizontal field of view per capture lens (mirrors CAPTURE_LENSES in src/services/roomCaptures.ts). */
const LENS_FOV_DEG = { wide: 42, 'ultra-wide': 60 }; // 0.5×: ≈60° measured in portrait (was 75°)
/** Views are this share of a field of view apart, so every object is fully in at least one view. */
const VIEW_SPACING_OF_FOV = 0.7;
const MAX_VIEWS = 8;
/** Two sightings are one item when their direction ranges overlap this much (of the narrower one). */
const MIN_DIRECTION_OVERLAP = 0.5;
const MIN_VERTICAL_OVERLAP = 0.3;

const PROMPT =
  'Detect the furniture and large home objects in this room photo.\n' +
  `Only these categories: ${CATEGORIES.join(', ')}.\n` +
  'Skip small items (cups, bottles, cables, books, decorations) and anything smaller than 2% of the image. ' +
  'List each physical object once.\n' +
  'For each object return a tight bounding box in coordinates normalized 0-1000 (x1,y1 = top-left, x2,y2 = ' +
  'bottom-right) and your confidence 0-1.\n' +
  'Also give its main visible color (1-3 words, e.g. "dark brown", "light gray") and main material if you can tell ' +
  '(e.g. "wood", "fabric", "leather", "metal", "glass"; "" if unsure).\n' +
  'Return JSON only: {"items":[{"label":"short name","category":"one of the categories","x1":0,"y1":0,"x2":0,"y2":0,"confidence":0.0,"color":"","material":""}]}';

class DetectionUnavailableError extends Error {}

function isAvailable() {
  return env.ai.provider === 'groq' && !!env.ai.apiKey;
}

const DEG = Math.PI / 180;
const wrap360 = (a) => ((a % 360) + 360) % 360;
const angleDelta = (a, b, loops) => {
  const d = a - b;
  return loops ? wrap360(d + 180) - 180 : d;
};
/** Room direction at horizontal position x (0..1) of a view taken at frameDeg (same model as the app's roomViewMath). */
const directionAt = (x, frameDeg, fovDeg) => frameDeg + Math.atan((x - 0.5) * 2 * Math.tan((fovDeg / 2) * DEG)) / DEG;

function groupOf(category) {
  const g = MERGE_GROUPS.find((members) => members.includes(category));
  return g ? g[0] : category;
}

/**
 * Model output → validated detections with boxes normalized 0..1 on the image
 * (converted from the model's longer-side scale). Drops unknown categories,
 * low confidence and tiny boxes.
 */
function parseDetections(raw, width, height) {
  // Usually {"items":[…]}, but the model sometimes returns the bare array (seen 2026-09-29).
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const L = Math.max(width, height);
  const out = [];
  for (const it of items) {
    const category = String(it?.category || '').trim().toLowerCase();
    if (!CATEGORIES.includes(category)) continue;
    const nums = [it.x1, it.y1, it.x2, it.y2].map(Number);
    if (!nums.every(Number.isFinite)) continue;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const box = {
      x1: clamp(((nums[0] / 1000) * L) / width),
      y1: clamp(((nums[1] / 1000) * L) / height),
      x2: clamp(((nums[2] / 1000) * L) / width),
      y2: clamp(((nums[3] / 1000) * L) / height),
    };
    if (box.x2 <= box.x1 || box.y2 <= box.y1) continue;
    if ((box.x2 - box.x1) * (box.y2 - box.y1) < MIN_AREA) continue;
    const confidence = Number.isFinite(Number(it.confidence)) ? Math.min(1, Math.max(0, Number(it.confidence))) : null;
    if (confidence != null && confidence < MIN_CONFIDENCE) continue;
    const label = String(it.label || category).trim().slice(0, 60) || category;
    const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase().slice(0, 40) : null);
    out.push({ category, label, confidence, box, color: text(it.color), material: text(it.material) });
  }
  return out;
}

/** One image → detections. Throws on provider failure (after following rate-limit hints). */
async function detectInImage(absoluteImagePath) {
  const { content, width, height } = await askGroqAboutImage(absoluteImagePath, PROMPT);
  return parseDetections(content, width, height);
}

/**
 * One room picture + a JSON-answer prompt → the model's parsed JSON and the
 * picture size it saw (boxes come back on the 0–1000 longer-side scale).
 * Shared by Items Detected and wall detection (wallDetectionService.js).
 * Throws on provider failure (after following rate-limit hints).
 */
async function askGroqAboutImage(absoluteImagePath, prompt) {
  if (!isAvailable()) throw new DetectionUnavailableError('Item detection needs AI_PROVIDER=groq and AI_API_KEY.');
  const buffer = await sharp(absoluteImagePath)
    .rotate()
    .resize(SEND_SIDE, SEND_SIDE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const { width, height } = await sharp(buffer).metadata();
  const body = JSON.stringify({
    model: env.ai.model,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` } },
        ],
      },
    ],
  });

  let networkRetries = 0;
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ai.apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body,
      });
    } catch (err) {
      // A dropped connection ("fetch failed") is usually transient: retry a couple of times.
      if (networkRetries < MAX_NETWORK_RETRIES && err.name !== 'TimeoutError') {
        networkRetries += 1;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      throw err;
    }
    const text = await response.text();
    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      // Free tier: wait as long as Groq asks (plus a little), then retry.
      const hint = /try again in ([0-9.]+)(ms|s)/.exec(text);
      const waitMs = hint ? Number(hint[1]) * (hint[2] === 's' ? 1000 : 1) + 500 : 15000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 65000)));
      continue;
    }
    if (!response.ok) throw new Error(`Groq item detection failed: HTTP ${response.status}`);
    let content;
    try {
      content = JSON.parse(JSON.parse(text).choices?.[0]?.message?.content);
    } catch {
      throw new Error('Groq returned a non-JSON item detection.');
    }
    return { content, width, height };
  }
}

/**
 * Evenly spaced views of a capture: one about every 0.7 field of view, so
 * each object is fully inside at least one view, at most MAX_VIEWS.
 * @param {Array<{angleDeg:number}>} frames sorted by angle
 */
function pickViews(frames, { loops, fovDeg }) {
  if (frames.length === 0) return [];
  const first = frames[0].angleDeg;
  const range = loops ? 360 : frames[frames.length - 1].angleDeg - first;
  const wanted = VIEW_SPACING_OF_FOV * fovDeg;
  const count = Math.min(MAX_VIEWS, loops ? Math.ceil(360 / wanted) : Math.ceil(range / wanted) + 1);
  // Spread evenly over what was captured (never past its ends).
  const spacing = loops ? 360 / count : count > 1 ? range / (count - 1) : 0;
  const picked = new Map();
  for (let i = 0; i < count; i += 1) {
    const target = first + i * spacing;
    let best = frames[0];
    for (const f of frames) {
      if (Math.abs(angleDelta(f.angleDeg, target, loops)) < Math.abs(angleDelta(best.angleDeg, target, loops))) best = f;
    }
    picked.set(best.id ?? best.angleDeg, best);
  }
  return [...picked.values()];
}

/** Overlap of two 1-D intervals as a share of the narrower one. */
function overlapShare(a1, a2, b1, b2) {
  const inter = Math.min(a2, b2) - Math.max(a1, b1);
  const narrower = Math.min(a2 - a1, b2 - b1);
  return inter > 0 && narrower > 0 ? inter / narrower : 0;
}

/** True when two sightings are probably the same physical object. */
function sameObject(a, b, loops) {
  if (groupOf(a.category) !== groupOf(b.category)) return false;
  // Compare in a frame centred on `b` so 360° captures wrap correctly.
  const d = angleDelta(a.directionDeg, b.directionDeg, loops);
  const dir = overlapShare(-b.halfWidthDeg, b.halfWidthDeg, d - a.halfWidthDeg, d + a.halfWidthDeg);
  const vert = overlapShare(b.box.y1, b.box.y2, a.box.y1, a.box.y2);
  return dir >= MIN_DIRECTION_OVERLAP && vert >= MIN_VERTICAL_OVERLAP;
}

/**
 * Merges sightings from several views into items: same kind of object (see
 * MERGE_GROUPS), overlapping room-direction ranges and overlapping vertical
 * extent → same item. Groups are the connected sets of such pairs, so the
 * result doesn't depend on the order the views were analysed in.
 * @param {Array<{category,label,confidence,box,directionDeg,halfWidthDeg}>} observations
 * @returns {Array<{category,label,confidence,observations:Array}>}
 */
function mergeObservations(observations, { loops }) {
  const parent = observations.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      if (sameObject(observations[i], observations[j], loops)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  observations.forEach((o, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(o);
  });
  return [...groups.values()].map((obsList) => {
    // Name it after its clearest sighting: highest confidence, not cut off at a view edge.
    const clear = obsList.filter((o) => o.box.x1 > 0.01 && o.box.x2 < 0.99);
    const best = [...(clear.length ? clear : obsList)].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    const known = obsList.map((o) => o.confidence).filter((c) => c != null);
    // Color/material: from the clearest sighting, else the first one that has it.
    const ranked = [best, ...obsList.filter((o) => o !== best)];
    return {
      category: best.category,
      label: best.label,
      confidence: known.length ? Math.max(...known) : null,
      color: ranked.find((o) => o.color)?.color ?? null,
      material: ranked.find((o) => o.material)?.material ?? null,
      observations: [...obsList].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
    };
  });
}

/**
 * @param {object} input
 * @param {{ id: string|number, path: string }} [input.photo] - photo room: the primary photo
 * @param {{ loops: boolean, lens: string, frames: Array<{id, angleDeg:number, path:string}> }} [input.capture] - spatial room
 * @returns {Promise<{ items: Array<{category,label,confidence,observations}>, viewsAnalyzed: number, viewsFailed: number }>}
 */
async function detectRoomItems({ photo, capture }) {
  if (!isAvailable()) throw new DetectionUnavailableError('Item detection needs AI_PROVIDER=groq and AI_API_KEY.');

  if (capture) {
    // The field of view measured from this capture's own views when known (captureAlignmentService).
    const fovDeg = capture.fovDeg || LENS_FOV_DEG[capture.lens] || LENS_FOV_DEG.wide;
    const views = pickViews(capture.frames, { loops: capture.loops, fovDeg });
    const observations = [];
    let failed = 0;
    for (const view of views) {
      let detections;
      try {
        detections = await detectInImage(view.path);
      } catch (err) {
        failed += 1;
        console.warn(`[roomItems] view ${view.angleDeg}° failed: ${err.message}`);
        continue;
      }
      for (const d of detections) {
        const left = directionAt(d.box.x1, view.angleDeg, fovDeg);
        const right = directionAt(d.box.x2, view.angleDeg, fovDeg);
        const mid = (left + right) / 2;
        observations.push({
          ...d,
          captureFrameId: view.id,
          directionDeg: capture.loops ? wrap360(mid) : mid,
          halfWidthDeg: (right - left) / 2,
        });
      }
    }
    if (failed === views.length) throw new Error('Item detection failed for every view.');
    const items = mergeObservations(observations, { loops: capture.loops });
    console.log(
      `[roomItems] ${views.length} views (${failed} failed) → ${observations.length} sightings → ${items.length} items`
    );
    return { items, viewsAnalyzed: views.length - failed, viewsFailed: failed };
  }

  if (photo) {
    const detections = await detectInImage(photo.path);
    return {
      items: detections.map((d) => ({
        category: d.category,
        label: d.label,
        confidence: d.confidence,
        color: d.color,
        material: d.material,
        observations: [{ ...d, roomPhotoId: photo.id, directionDeg: null, halfWidthDeg: null }],
      })),
      viewsAnalyzed: 1,
      viewsFailed: 0,
    };
  }
  return { items: [], viewsAnalyzed: 0, viewsFailed: 0 };
}

module.exports = {
  detectRoomItems,
  isAvailable,
  DetectionUnavailableError,
  askGroqAboutImage,
  // exported for tests
  parseDetections,
  pickViews,
  mergeObservations,
  directionAt,
  CATEGORIES,
  LENS_FOV_DEG,
};
