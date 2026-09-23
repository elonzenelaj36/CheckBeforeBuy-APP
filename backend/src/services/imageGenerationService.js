/**
 * Room-visualization (product-in-room image generation) abstraction.
 *
 * Provider: Cloudflare Workers AI, FLUX.2 [klein] (image editing with
 * multiple reference images) via its REST API. The room photo and the
 * product photo are both sent as reference images and the model is asked to
 * place the product into the room.
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
const env = require('../config/env');
const { uploadRoot } = require('../middleware/upload');

const CLOUDFLARE_TIMEOUT_MS = 120000;
const MAX_SIDE = 1024;

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

/**
 * @param {object} params
 * @param {string|null} params.roomImagePath - absolute path to the room photo
 * @param {Array<{imagePath: string, name?: string, category?: string, brand?: string, placement?: {x: number, y: number, width: number}|null}>} params.products - ORIGINAL product photos (absolute paths), 1..N, in order
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
    return generateWithCloudflare({ roomImagePath, products, roomType });
  }

  throw new Error(`Image AI provider "${provider}" is not supported. Use "cloudflare".`);
}

module.exports = { generateRoomVisualization };
