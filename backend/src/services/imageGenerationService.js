/**
 * Room-visualization (product-in-room image generation) abstraction.
 *
 * Provider: Cloudflare Workers AI, FLUX.2 [klein] (image editing with
 * multiple reference images) via its REST API. Documented limits: up to 4
 * reference images named input_image_0..input_image_3, each smaller than
 * 512x512; output 256-1920px per side; 4 fixed steps; no mask/strength input.
 *
 * Two request types:
 *  - ARRANGED (AI Render of the Visualization screen): the user's exact
 *    Arrange composition (room + product layers, rebuilt by
 *    arrangeCompositionService.js) is input_image_0 — the spatial reference —
 *    and up to 3 product cutouts are input_image_1..3 as appearance
 *    references. The model is asked to make that exact scene photorealistic.
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

const CLOUDFLARE_TIMEOUT_MS = 120000;
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

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.imageAi.apiKey}` }, // Content-Type (with boundary) is set by fetch
      body: form,
      signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[imageGeneration] Cloudflare request failed:', err.message);
    throw new Error(`Image generation request failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
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

/** Products with the most visible area get the few appearance-reference slots. */
function pickAppearanceReferences(products) {
  const area = (t) => (t.width * t.width) / t.aspect;
  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => area(b.product.layer.transform) - area(a.product.layer.transform))
    .slice(0, MAX_REFERENCE_IMAGES - 1)
    .sort((a, b) => a.index - b.index)
    .map((ref, i) => ({ ...ref, imageIndex: i + 1 }));
}

function buildArrangedPrompt({ roomType, products, references }) {
  const n = products.length;
  const label = (p) => p.name || p.category || 'product';
  const list = products.map((p) => `the ${label(p)} at the ${describeArea(p.layer.transform)}`).join(', ');
  const refs = references
    .map(
      ({ product, imageIndex }) =>
        `Image ${imageIndex} is a photo of the real ${label(product)} (the one at the ${describeArea(product.layer.transform)} ` +
        "of image 0): match that product's exact shape, proportions, color, material and details. "
    )
    .join('');
  return (
    `Image 0 is a mock-up of a ${roomType || 'room'} arranged by the user: the real room photo with ` +
    `${n} product cut-out${n === 1 ? '' : 's'} pasted onto it (${list}). ` +
    'Turn image 0 into one realistic photograph of exactly this scene. ' +
    "Keep image 0's composition exactly: the same camera view and framing, the same room, and every product at the " +
    'same position, size, rotation, viewing angle and overlap as in image 0. ' +
    `Keep exactly ${n} product${n === 1 ? '' : 's'}; do not move, resize, rotate, add, remove, merge or replace any ` +
    'object, and do not redesign the room. ' +
    refs +
    'Make it photorealistic: natural lighting that matches the room, soft contact shadows where each product touches ' +
    'the floor or wall, realistic reflections and materials, and seamless edges instead of pasted cut-out edges.'
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
async function saveDiagnostics(generatedImagePath, { composition, references, config }) {
  if (!env.imageAi.debug) return;
  try {
    const dir = path.join(uploadRoot, 'render-debug');
    await fs.promises.mkdir(dir, { recursive: true });
    const base = path.basename(generatedImagePath, path.extname(generatedImagePath));
    await fs.promises.writeFile(path.join(dir, `${base}.arrange.png`), composition);
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
async function generateArrangedWithCloudflare({ roomImagePath, products, roomType }) {
  if (!roomImagePath) {
    throw new Error('A room photo is required to generate a visualization. Add a photo to this room first.');
  }

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
      references.map(({ product, imageIndex }) => [`input_image_${imageIndex}`, `appearance: ${product.name || 'product'}`])
    ),
    layers: products.map((p) => ({ name: p.name, fit: p.layer.fit, source: p.layer.source, transform: p.layer.transform })),
    prompt,
  };
  console.log(
    `[imageGeneration] AI Render: ${composition.width}x${composition.height}, input_image_0 = arrangement, ` +
      `input_image_1..${references.length} = ${references.map((r) => r.product.name || 'product').join(', ') || 'none'}`
  );

  const result = await runCloudflare(form);
  await saveDiagnostics(result.generatedImagePath, { composition: composition.buffer, references: images, config });
  return result;
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
async function generateRoomVisualization({ roomImagePath, products, roomType }) {
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
      ? generateArrangedWithCloudflare({ roomImagePath, products, roomType })
      : generateWithCloudflare({ roomImagePath, products, roomType });
  }

  throw new Error(`Image AI provider "${provider}" is not supported. Use "cloudflare".`);
}

module.exports = { generateRoomVisualization };
