/**
 * Product background removal ("cutouts") for the room-visualization layers.
 *
 * Provider: ClearBackdrop (https://clearbackdrop.com/api)
 *   POST https://clearbackdrop.com/api/v1/remove-background?model=<fast|hd>
 *   multipart/form-data, field "image" (JPG/PNG/WEBP/HEIC/…, max 15MB)
 *   → 200 with the transparent PNG as the response body.
 *   No API key; limited to 100 images/hour per calling IP (our server).
 *
 * Completely separate from imageGenerationService.js (Cloudflare) — this
 * never generates anything, it only removes the background of one photo.
 *
 * The result is post-processed so it works well as a movable layer:
 * transparent borders are trimmed (the layer box hugs the product) and the
 * longest side is capped. Results are cached on disk by the SHA-256 of the
 * input photo, so the same photo is never sent to the provider twice.
 *
 * Before trimming, detached background-removal specks are removed and the
 * product is measured (size, edge contact, brightness, sharpness — plain
 * pixel math); the resulting 3D-suitability report is stored next to the
 * cutout as cutout-<hash>.json and returned as `quality`.
 *
 * Callers only see removeBackground() and BackgroundRemovalError — swapping
 * the provider later means changing this file only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const env = require('../config/env');
const { uploadRoot } = require('../middleware/upload');
const { cleanAndMeasure, assessQuality } = require('./productImageQuality');

const CLEARBACKDROP_URL = 'https://clearbackdrop.com/api/v1/remove-background';
const REQUEST_TIMEOUT_MS = 60000;
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // ClearBackdrop's documented limit
const MAX_OUTPUT_SIDE = 1200;

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

/** Error with an HTTP status and a message that is safe to show the user. */
class BackgroundRemovalError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'BackgroundRemovalError';
    this.status = status;
  }
}

const GENERIC_FAILURE = "We couldn't remove the product background. Please try again.";

/** Maps ClearBackdrop's documented status codes to user-facing errors. */
function providerError(status) {
  switch (status) {
    case 400:
    case 422:
      return new BackgroundRemovalError(422, "This photo couldn't be read. Please try another photo.");
    case 413:
      return new BackgroundRemovalError(413, 'This photo is too large (max 15MB). Please try a smaller photo.');
    case 415:
      return new BackgroundRemovalError(415, 'This image type is not supported. Please use a JPEG, PNG or WEBP photo.');
    case 429:
      return new BackgroundRemovalError(
        429,
        'Background removal is busy right now (hourly limit reached). Please try again later.'
      );
    default:
      return new BackgroundRemovalError(502, GENERIC_FAILURE);
  }
}

async function removeWithClearBackdrop(buffer, fileName, mime) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: mime }), fileName);

  let response;
  try {
    response = await fetch(`${CLEARBACKDROP_URL}?model=${encodeURIComponent(env.backgroundRemoval.model)}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[backgroundRemoval] ClearBackdrop request failed:', err.name === 'TimeoutError' ? 'timed out' : err.message);
    throw new BackgroundRemovalError(504, GENERIC_FAILURE);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.startsWith('image/')) {
    const detail = await response.text().catch(() => '');
    console.error(`[backgroundRemoval] ClearBackdrop HTTP ${response.status}: ${detail.slice(0, 200)}`);
    throw providerError(response.ok ? 500 : response.status);
  }

  const remaining = response.headers.get('x-ratelimit-remaining');
  if (remaining !== null && Number(remaining) <= 10) {
    console.warn(`[backgroundRemoval] ClearBackdrop hourly quota nearly used up: ${remaining} left`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Trims transparent borders and caps the size; keeps alpha (PNG). */
async function toLayerPng(transparentBuffer) {
  let trimmed;
  try {
    trimmed = await sharp(transparentBuffer).ensureAlpha().trim().png().toBuffer();
  } catch {
    // sharp throws when there is nothing left to keep (fully transparent).
    throw new BackgroundRemovalError(422, "We couldn't find a product in this photo. Please try another photo.");
  }
  const { data, info } = await sharp(trimmed)
    .resize({ width: MAX_OUTPUT_SIDE, height: MAX_OUTPUT_SIDE, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/**
 * @param {object} params
 * @param {string} params.imagePath - absolute path of the ORIGINAL product photo (left untouched)
 * @returns {Promise<{imagePath: string, width: number, height: number, cached: boolean, quality: {ok: boolean, warnings: Array<{code: string, message: string}>}|null}>}
 *   imagePath is the stored relative path ("/uploads/cutout-….png") of the transparent PNG.
 */
async function removeBackground({ imagePath }) {
  const { provider, model } = env.backgroundRemoval;
  if (provider !== 'clearbackdrop') {
    throw new BackgroundRemovalError(503, `Background removal provider "${provider}" is not supported.`);
  }

  let input;
  try {
    input = await fs.promises.readFile(imagePath);
  } catch {
    throw new BackgroundRemovalError(404, "The product photo couldn't be found. Please take it again.");
  }
  if (input.length > MAX_INPUT_BYTES) throw providerError(413);
  const mime = EXT_TO_MIME[path.extname(imagePath).toLowerCase()];
  if (!mime) throw providerError(415);

  // Same photo + same provider settings → same file, so it is processed once.
  const hash = crypto.createHash('sha256').update(`${provider}:${model}:`).update(input).digest('hex').slice(0, 32);
  const fileName = `cutout-${hash}.png`;
  const outputPath = path.join(uploadRoot, fileName);
  const relativePath = `/${env.uploadDir}/${fileName}`;

  const reportPath = path.join(uploadRoot, `cutout-${hash}.json`);

  if (fs.existsSync(outputPath)) {
    const meta = await sharp(outputPath).metadata();
    return { imagePath: relativePath, width: meta.width, height: meta.height, cached: true, quality: readQuality(reportPath) };
  }

  const transparent = await removeWithClearBackdrop(input, path.basename(imagePath), mime);

  // Clean + measure at full photo size (before trimming, so edge contact is known).
  // Best effort: if it fails, the cutout is used exactly as before.
  let cleaned = transparent;
  let quality = null;
  try {
    const result = await cleanAndMeasure(transparent);
    cleaned = result.png;
    quality = { ...assessQuality(result.metrics), metrics: result.metrics };
  } catch (err) {
    console.warn('[backgroundRemoval] quality analysis skipped:', err.message);
  }

  const layer = await toLayerPng(cleaned);

  const tmpPath = `${outputPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.promises.writeFile(tmpPath, layer.buffer);
  await fs.promises.rename(tmpPath, outputPath);
  if (quality) await fs.promises.writeFile(reportPath, JSON.stringify(quality)).catch(() => {});

  return { imagePath: relativePath, width: layer.width, height: layer.height, cached: false, quality };
}

/** Stored quality report of a cached cutout (null for cutouts made before reports existed). */
function readQuality(reportPath) {
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { removeBackground, BackgroundRemovalError };
