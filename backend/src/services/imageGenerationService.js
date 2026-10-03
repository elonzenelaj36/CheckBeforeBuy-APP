/**
 * Room-visualization (product-in-room image generation) abstraction.
 *
 * Provider: Cloudflare Workers AI, FLUX.2 [klein] 4B (image editing with
 * multiple reference images) via its REST API. Documented limits: up to 4
 * reference images named input_image_0..input_image_3, each smaller than
 * 512x512; output 256-1920px per side; 4 fixed steps; no mask/strength input.
 * The 4B weights are Apache-2.0; the 9B variant is under BFL's
 * non-commercial license, so it is not the default.
 *
 * Two request types:
 *  - ARRANGED (AI Render of the Visualization screen): the user's exact
 *    Arrange composition (room + product layers, rebuilt by
 *    arrangeCompositionService.js) is input_image_0 — the authority for
 *    position/size/rotation — and up to 3 ORIGINAL product photos (their
 *    background-removed cutouts) are input_image_1..3 — the authority for
 *    appearance. A layer showing a 3D view is treated as a stand-in whose
 *    reconstruction errors the model should correct from the product photo.
 *  - LEGACY (single product, no arrangement): the room photo and the product
 *    photos are sent and the model places the products itself.
 *
 * If IMAGE_AI_PROVIDER / IMAGE_AI_API_KEY / IMAGE_AI_ACCOUNT_ID are not all
 * set, the request stays "pending" with a clear message (no fake image).
 * Real provider failures are thrown so the controller records "failed".
 *
 * Keys live only in backend/.env.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const env = require('../config/env');
const { uploadRoot } = require('../middleware/upload');
const { composeArrangement } = require('./arrangeCompositionService');
const { preserveRoom } = require('./roomPreservationService');
const { detectWalls, wallForLayer } = require('./wallDetectionService');
const { wallQuad, levelRay } = require('./wallGeometry');

/** A wall below this confidence isn't used: the product renders the way it always did. */
const MIN_WALL_CONFIDENCE = 0.5;

/**
 * Wall-mounted products: which detected wall each one hangs on, at its FINAL
 * arranged position (the user decides where), and the exact shape it has on
 * that wall — facing = the wall's normal + the user's own turn of the product.
 * Adds `quad` (+ the real photo to draw in it) and `wall` to those layers.
 * Without a confident wall the layer is left exactly as it was (old behaviour).
 */
async function resolveWallLayers(products, roomImagePath, pictureHints) {
  if (!products.some((p) => p.layer?.kind === 'wall')) return null;
  let walls;
  try {
    walls = await detectWalls(roomImagePath, pictureHints || {});
  } catch (err) {
    console.warn('[imageGeneration] wall detection unavailable:', err.message);
    return null;
  }
  for (const p of products) {
    const layer = p.layer;
    if (layer?.kind !== 'wall') continue;
    const t = layer.transform;
    // Size = the layer's on-screen height (the user's scale); proportions = the real product photo
    // (cutouts are cropped to the product). A 3D frame's box is wider than the product itself.
    const height = (t.width * walls.camera.aspect) / t.aspect;
    let objectAspect = t.aspect;
    if (layer.cutoutPath) {
      const meta = await sharp(layer.cutoutPath).metadata().catch(() => null);
      if (meta?.width && meta?.height) objectAspect = meta.width / meta.height;
    }
    // The wall the app attached it to (same detection, cached per picture); older apps: the wall at its position.
    const wall = wallForLayer(walls.walls, layer.wallId, t.x, t.y);
    let facing;
    if (wall && wall.confidence >= MIN_WALL_CONFIDENCE && wall.normalDeg !== null) {
      // Flat on the wall: the wall alone decides its angle (no turn or tilt of its own).
      facing = wall.normalDeg;
      layer.transform = { ...t, rotation: 0 };
      layer.wall = { used: true, id: wall.id, facing: wall.facing, normalDeg: wall.normalDeg, confidence: wall.confidence };
    } else {
      // No trustworthy wall here: it faces the camera (plus the user's own turn) — still the real photo, never the 3D copy.
      const ray = levelRay(t.x, t.y, walls.camera);
      facing = Math.atan2(-ray[0], -ray[2]) / (Math.PI / 180) + (layer.userYawDeg || 0);
      layer.wall = { used: false, reason: wall ? 'low confidence' : 'no wall at this position', facing: 'camera' };
    }
    let quad = wallQuad(t.x, t.y, height, objectAspect, facing, walls.camera);
    if (!quad && layer.wall.used) {
      // Seen edge-on on that wall: show it facing the camera instead.
      const ray = levelRay(t.x, t.y, walls.camera);
      quad = wallQuad(t.x, t.y, height, objectAspect, Math.atan2(-ray[0], -ray[2]) / (Math.PI / 180), walls.camera);
      layer.wall = { used: false, reason: 'wall seen edge-on', facing: 'camera' };
    }
    if (!quad || !layer.cutoutPath) continue; // no real photo to draw: previous behaviour
    layer.quad = quad;
    layer.quadAspect = objectAspect;
    layer.quadImagePath = layer.cutoutPath; // the real product photo (faithful design)
    layer.source = 'cutout';
  }
  return walls;
}

const CLOUDFLARE_TIMEOUT_MS = 120000;
const CLOUDFLARE_FIRST_TRY_MS = 60000;
const MAX_SIDE = 1024;
/** Documented FLUX.2 [klein] limits on Workers AI. */
const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_SIDE = 512;

const EXT_TO_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Reads pixel dimensions from a JPEG/PNG buffer; null if unknown. */
function imageSize(buf) {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Output size that keeps the room's aspect ratio, max 1024px, multiples of 16. */
function outputSize(roomBuf) {
  const dims = imageSize(roomBuf);
  if (!dims || !dims.width || !dims.height) return { width: MAX_SIDE, height: MAX_SIDE };
  const scale = MAX_SIDE / Math.max(dims.width, dims.height);
  const round16 = (n) => Math.max(256, Math.round((n * scale) / 16) * 16);
  return { width: round16(dims.width), height: round16(dims.height) };
}

function toBlob(filePath) {
  const mime = EXT_TO_MIME[path.extname(filePath).toLowerCase()];
  if (!mime) {
    throw new Error(`Unsupported image type for generation: ${path.extname(filePath) || 'unknown'} (use JPEG, PNG or WEBP).`);
  }
  const buf = fs.readFileSync(filePath);
  return { buf, blob: new Blob([buf], { type: mime }), name: path.basename(filePath) };
}

/** "the lower left of the room, about 30% of the image width" — coarse words the model can follow. */
function describePlacement({ x, y, width }) {
  const horizontal = x < 0.34 ? 'left' : x > 0.66 ? 'right' : 'center';
  const vertical = y < 0.34 ? 'upper' : y > 0.66 ? 'lower' : 'middle';
  const area = vertical === 'middle' && horizontal === 'center' ? 'center' : `${vertical} ${horizontal}`;
  return `in the ${area} of the room, about ${Math.round(width * 100)}% of the image width`;
}

/** Only products the user arranged on the app's layout editor carry a placement. */
function placementSentence(products) {
  const hints = products
    .map((p, i) => (p.placement ? `the product from image ${i + 1} ${describePlacement(p.placement)}` : null))
    .filter(Boolean);
  return hints.length ? `Position ${hints.join('; ')}. ` : '';
}

/**
 * Same wording as the original single-product prompt; with several products it
 * additionally lists them and asks for all of them to appear together.
 */
function buildPrompt({ roomType, products }) {
  const n = products.length;
  const room = `Image 0 is a photo of a ${roomType || 'room'}. `;
  if (n === 1) {
    return (
      room +
      'Image 1 is a product photo. ' +
      'Place the product from image 1 naturally into the room from image 0, at realistic scale, ' +
      'with matching perspective, lighting and shadows. ' +
      placementSentence(products) +
      'Keep the room, its layout, walls, floor and ' +
      'existing furniture exactly as they are. Photorealistic result.'
    );
  }
  const list = products
    .map((p, i) => `image ${i + 1}: ${[p.name, p.category, p.brand].filter(Boolean).join(', ')}`)
    .join('; ');
  return (
    room +
    `Images 1 to ${n} are product photos (${list}). ` +
    `Place ALL ${n} products naturally into the room from image 0 at the same time, each where it naturally belongs, ` +
    'at realistic scale, with matching perspective, lighting and shadows. Use each original product as accurately ' +
    'as possible (shape, color, material, proportions, design) and do not replace it with a similar object. ' +
    placementSentence(products) +
    'Keep the room, its layout, walls, floor and existing furniture exactly as they are. ' +
    'All products must appear together in the same final image. Photorealistic result.'
  );
}

async function generateWithCloudflare({ roomImagePath, products, roomType }) {
  if (!roomImagePath) {
    throw new Error('A room photo is required to generate a visualization. Add a photo to this room first.');
  }

  const room = toBlob(roomImagePath);
  const { width, height } = outputSize(room.buf);

  const prompt = buildPrompt({ roomType, products });

  // Same request format as before: original room photo = input_image_0, the
  // original product photos = input_image_1..N (array order).
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(width));
  form.append('height', String(height));
  form.append('input_image_0', room.blob, room.name);
  products.forEach((p, i) => {
    const product = toBlob(p.imagePath);
    form.append(`input_image_${i + 1}`, product.blob, product.name);
  });

  return runCloudflare(form);
}

/** Sends a prepared multipart request to Workers AI and stores the returned image in uploads/. */
async function runCloudflare(form) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.imageAi.accountId)}/ai/run/${env.imageAi.model}`;

  // Workers AI is sometimes very slow for one request; a fresh attempt usually returns in ~10–20 s.
  // First try: CLOUDFLARE_FIRST_TRY_MS; after a timeout, one more try with the full limit.
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.imageAi.apiKey}` }, // Content-Type (with boundary) is set by fetch
        body: form,
        signal: AbortSignal.timeout(attempt === 1 ? CLOUDFLARE_FIRST_TRY_MS : CLOUDFLARE_TIMEOUT_MS),
      });
      break;
    } catch (err) {
      if (err.name === 'TimeoutError' && attempt === 1) {
        console.warn('[imageGeneration] Cloudflare was slow — trying once more.');
        continue;
      }
      console.error('[imageGeneration] Cloudflare request failed:', err.message);
      throw new Error(`Image generation request failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
    }
  }

  const contentType = response.headers.get('content-type') || '';
  let imageBuffer = null;

  if (contentType.startsWith('image/')) {
    imageBuffer = Buffer.from(await response.arrayBuffer());
  } else {
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success === false) {
      const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${response.status}`;
      console.error('[imageGeneration] Cloudflare error:', detail); // never includes the token
      throw new Error(`Image generation failed (${detail})`);
    }
    const b64 = body?.result?.image ?? body?.image;
    if (typeof b64 !== 'string') {
      console.error('[imageGeneration] Unexpected Cloudflare response keys:', Object.keys(body?.result || body || {}));
      throw new Error('Image generation returned no image.');
    }
    imageBuffer = Buffer.from(b64, 'base64');
  }

  const isJpeg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8;
  const fileName = `generated-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${isJpeg ? '.jpg' : '.png'}`;
  fs.writeFileSync(path.join(uploadRoot, fileName), imageBuffer);

  return {
    status: 'completed',
    generatedImagePath: `/${env.uploadDir}/${fileName}`,
    provider: 'cloudflare',
  };
}

/** Where a layer sits in the composition, in words ("lower left"). */
function describeArea({ x, y }) {
  const horizontal = x < 0.34 ? 'left' : x > 0.66 ? 'right' : 'center';
  const vertical = y < 0.34 ? 'upper' : y > 0.66 ? 'lower' : 'middle';
  return vertical === 'middle' && horizontal === 'center' ? 'center' : `${vertical} ${horizontal}`;
}

/**
 * Picks the few appearance-reference slots. Layers showing a 3D view come
 * first: a 3D reconstruction can drift from the real product (proportions,
 * arms, legs, colors), while a cutout/photo layer already IS the original
 * photo. Within each group the products with the most visible area win.
 */
function pickAppearanceReferences(products) {
  const area = (t) => (t.width * t.width) / t.aspect;
  const needsFix = (p) => (p.layer.source === 'frame' ? 1 : 0);
  return products
    .map((product, index) => ({ product, index }))
    .sort(
      (a, b) =>
        needsFix(b.product) - needsFix(a.product) || area(b.product.layer.transform) - area(a.product.layer.transform)
    )
    .slice(0, MAX_REFERENCE_IMAGES - 1)
    .sort((a, b) => a.index - b.index)
    .map((ref, i) => ({ ...ref, imageIndex: i + 1 }));
}

/**
 * One product's entry in the prompt's product list. The Arrange layer is the
 * authority for WHERE the product is; the original product photo is the
 * authority for WHAT it looks like. A 3D-view layer is only a stand-in.
 */
function productEntry(product, imageIndex) {
  const name = product.name || product.category || 'product';
  const wall = product.layer.wall?.used ? product.layer.wall : null;
  // A wall-mounted product on a detected wall: say which wall, so lighting/shadow go the right way.
  const where = wall
    ? `the ${name} hanging flat on the ${wall.facing === 'front' ? 'wall facing the camera' : `${wall.facing} side wall`} at the ${describeArea(product.layer.transform)}`
    : `the ${name} at the ${describeArea(product.layer.transform)}`;
  if (product.layer.source === 'frame') {
    return imageIndex ? `${where} (3D preview; real product: image ${imageIndex})` : `${where} (3D preview)`;
  }
  return imageIndex ? `${where} (cut from its real photo, image ${imageIndex})` : `${where} (cut from its real photo)`;
}

/**
 * Prompt for the arranged AI Render, in the product's priority order:
 * 1 arrangement, 2 original product appearance, 3 room, 4 realism,
 * 5 (conservative) removal of incidental clutter. Kept short: the text
 * encoder only reads a limited number of tokens.
 */
function buildArrangedPrompt({ roomType, products, references }) {
  const n = products.length;
  const refIndex = new Map(references.map(({ product, imageIndex }) => [product, imageIndex]));
  const list = products.map((p) => productEntry(p, refIndex.get(p))).join('; ');
  const any3D = products.some((p) => p.layer.source === 'frame');
  return (
    `Image 0 is a mock-up of a ${roomType || 'room'} arranged by the user: the real room photo with ` +
    `${n} product${n === 1 ? '' : 's'} pasted onto it: ${list}. ` +
    'Turn image 0 into one realistic photograph of this exact scene. ' +
    // 1. Arrangement
    "Keep image 0's camera view and every product's position, size, rotation, facing direction and overlap exactly. " +
    `Keep exactly ${n} product${n === 1 ? '' : 's'}; do not add, remove, merge or replace any. ` +
    // 2. Original product appearance
    (any3D
      ? 'A 3D preview is a rough 3D-model render: use it only for where the product stands, its size and which way ' +
        'it faces; its shape, proportions, colors and materials may be wrong. Redraw it to look like its real product ' +
        'photo (same design, silhouette, proportions, color, material and details) seen from that direction, ' +
        "correcting the preview's distortions instead of copying them. "
      : '') +
    (products.some((p) => p.layer.source !== 'frame')
      ? 'Products cut from their real photo already show the real product: keep their shape, color and material. '
      : '') +
    'Never design a different product. Where a photo does not show a side, keep it simple and consistent with the ' +
    'visible design. ' +
    // 3. Room
    'Keep the room as it is: layout, walls, floor, ceiling, doors, windows, curtains, fixtures and existing furniture. ' +
    // 4. Visual refinement
    'Photorealistic: lighting that matches the room, soft contact shadows under each product, realistic materials ' +
    'and reflections, seamless edges instead of pasted cut-out edges. ' +
    // 5. Incidental clutter (conservative)
    'You may remove only small loose clutter such as towels, loose clothes, packaging or bottles; if unsure, keep it.'
  );
}

/** A reference image within the documented size limit, as JPEG (transparent areas → `background`). */
async function toReference(input, background = '#ffffff') {
  const buffer = await sharp(input)
    .rotate()
    .resize({ width: MAX_REFERENCE_SIDE, height: MAX_REFERENCE_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background })
    .jpeg({ quality: 92 })
    .toBuffer();
  return buffer;
}

/** Temporary copies of what AI Render sent, only when IMAGE_AI_DEBUG=1 (uploads/render-debug/). */
async function saveDiagnostics(generatedImagePath, { composition, references, config, raw = null }) {
  if (!env.imageAi.debug) return;
  try {
    const dir = path.join(uploadRoot, 'render-debug');
    await fs.promises.mkdir(dir, { recursive: true });
    const base = path.basename(generatedImagePath, path.extname(generatedImagePath));
    await fs.promises.writeFile(path.join(dir, `${base}.arrange.png`), composition);
    if (raw) await fs.promises.writeFile(path.join(dir, `${base}.ai-raw${raw[0] === 0xff ? '.jpg' : '.png'}`), raw);
    await Promise.all(references.map((buf, i) => fs.promises.writeFile(path.join(dir, `${base}.input_image_${i}.jpg`), buf)));
    await fs.promises.writeFile(path.join(dir, `${base}.json`), JSON.stringify(config, null, 2));
    console.log(`[imageGeneration] diagnostics: uploads/render-debug/${base}.*`);
  } catch (err) {
    console.warn('[imageGeneration] diagnostics not saved:', err.message);
  }
}

/**
 * AI Render of an arranged scene: the exact composition is the spatial
 * reference, product cutouts are appearance references.
 */
async function generateArrangedWithCloudflare({ roomImagePath, products, roomType, pictureHints }) {
  if (!roomImagePath) {
    throw new Error('A room photo is required to generate a visualization. Add a photo to this room first.');
  }

  const walls = await resolveWallLayers(products, roomImagePath, pictureHints);
  const composition = await composeArrangement({
    roomImagePath,
    layers: products.map((p) => p.layer),
    maxSide: MAX_SIDE,
  });
  const references = pickAppearanceReferences(products);
  const prompt = buildArrangedPrompt({ roomType, products, references });

  const images = [await toReference(composition.buffer)];
  for (const { product } of references) images.push(await toReference(product.appearancePath));

  const form = new FormData();
  form.append('prompt', prompt);
  // Same size and aspect as the composition, so the render lines up with Arrange.
  form.append('width', String(composition.width));
  form.append('height', String(composition.height));
  images.forEach((buf, i) => form.append(`input_image_${i}`, new Blob([buf], { type: 'image/jpeg' }), `input_image_${i}.jpg`));

  const config = {
    model: env.imageAi.model,
    output: { width: composition.width, height: composition.height },
    input_image_0: `arranged composition (${products.length} product layer${products.length === 1 ? '' : 's'})`,
    ...Object.fromEntries(
      references.map(({ product, imageIndex }) => [
        `input_image_${imageIndex}`,
        `appearance: ${product.name || 'product'} (original photo${product.appearancePath === product.imagePath ? '' : ' cutout'})`,
      ])
    ),
    layers: products.map((p) => ({
      name: p.name,
      fit: p.layer.fit,
      source: p.layer.source,
      kind: p.layer.kind,
      wall: p.layer.wall ?? null,
      transform: p.layer.transform,
    })),
    prompt,
  };
  console.log(
    `[imageGeneration] AI Render: ${composition.width}x${composition.height}, input_image_0 = arrangement, ` +
      `input_image_1..${references.length} = ${references.map((r) => r.product.name || 'product').join(', ') || 'none'}`
  );

  const result = await runCloudflare(form);

  // The model redraws the whole picture (no mask input): the final image is built on the
  // ORIGINAL room photo — room pixels untouched, AI output only where products are refined,
  // wall-mounted products on their detected wall exactly as arranged.
  const rawPath = path.join(uploadRoot, path.basename(result.generatedImagePath));
  const raw = await fs.promises.readFile(rawPath);
  const { buffer: final, stats } = await preserveRoom({
    room: composition.room,
    generated: raw,
    arranged: composition.buffer,
    roomImagePath,
    width: composition.width,
    height: composition.height,
    layers: composition.placed,
  });
  if (stats.backgroundPixelsChanged) {
    console.error(`[imageGeneration] ${stats.backgroundPixelsChanged} room pixels changed outside the products`);
  }
  const finalName = `${path.basename(rawPath, path.extname(rawPath))}.png`;
  await fs.promises.writeFile(path.join(uploadRoot, finalName), final);
  if (finalName !== path.basename(rawPath)) await fs.promises.unlink(rawPath).catch(() => {});
  console.log(
    `[imageGeneration] room kept: ${stats.backgroundPixelsUntouched}% of the photo untouched, ${stats.backgroundPixelsChanged} changed elsewhere ` +
      `(the AI had drifted ${stats.aiDriftOutsideProducts}/255 there); wall products: ${JSON.stringify(products.filter((p) => p.layer.kind === 'wall').map((p) => p.layer.wall))}`
  );
  await saveDiagnostics(`/${env.uploadDir}/${finalName}`, {
    composition: composition.buffer,
    references: images,
    config: { ...config, walls: walls ? { camera: walls.camera, count: walls.walls.length } : null, roomPreservation: stats },
    raw,
  });
  return { ...result, generatedImagePath: `/${env.uploadDir}/${finalName}` };
}

/**
 * @param {object} params
 * @param {string|null} params.roomImagePath - absolute path to the room photo
 * @param {Array<{imagePath: string, name?: string, category?: string, brand?: string, placement?: {x: number, y: number, width: number}|null, appearancePath?: string, layer?: {imagePath: string, fit: 'contain'|'cover', source: string, transform: object}}>} params.products
 *   ORIGINAL product photos (absolute paths), 1..N, in order. When EVERY product has a `layer` (its Arrange
 *   layer), the arranged AI Render is used; otherwise the legacy placement request.
 * @param {string} params.roomType
 * @returns {Promise<{status: 'pending'|'completed'|'failed', generatedImagePath: string|null, provider: string|null, message?: string}>}
 */
async function generateRoomVisualization({ roomImagePath, products, roomType, pictureHints = null }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('At least one product is required.');
  }
  const { provider, apiKey, accountId } = env.imageAi;

  if (!provider || !apiKey || (provider === 'cloudflare' && !accountId)) {
    return {
      status: 'pending',
      generatedImagePath: null,
      provider: null,
      message:
        'Room visualization AI is not configured on this server yet. Set IMAGE_AI_PROVIDER=cloudflare, ' +
        'IMAGE_AI_API_KEY and IMAGE_AI_ACCOUNT_ID in backend/.env. See backend/README.md → "Room visualization AI".',
    };
  }

  if (provider === 'cloudflare') {
    return products.every((p) => p.layer)
      ? generateArrangedWithCloudflare({ roomImagePath, products, roomType, pictureHints })
      : generateWithCloudflare({ roomImagePath, products, roomType });
  }

  throw new Error(`Image AI provider "${provider}" is not supported. Use "cloudflare".`);
}

module.exports = { generateRoomVisualization };
