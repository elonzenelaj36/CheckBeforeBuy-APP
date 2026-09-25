/**
 * Turns a product cutout into a standardized input for image → 3D:
 * transparent background, tight crop around the actual product, centered on a
 * square canvas with even padding, fixed resolution. Proportions are never
 * changed (no stretching) — only uniform scaling.
 *
 * This matches what single-image 3D models are trained on (one centered
 * object on an empty background) and makes the input independent of how the
 * photo was framed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

/** TRELLIS.2's preprocessing works at up to 1024px (see trellisService.js). */
const MODEL_INPUT_SIZE = 1024;
/** Empty margin on each side, as a share of the canvas. */
const PADDING = 0.05;

/**
 * @param {string} cutoutPath - transparent product PNG (background already removed)
 * @returns {Promise<string>} path of a temporary PNG; the caller deletes it
 */
async function prepareModelInput(cutoutPath) {
  // Tight crop to the non-transparent pixels (cutouts are trimmed already; this also covers older ones).
  const trimmed = await sharp(cutoutPath).ensureAlpha().trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;

  const inner = Math.round(MODEL_INPUT_SIZE * (1 - 2 * PADDING));
  const scale = inner / Math.max(width, height);
  const fitWidth = Math.max(1, Math.round(width * scale));
  const fitHeight = Math.max(1, Math.round(height * scale));

  const product = await sharp(trimmed.data)
    // fit 'fill' with proportional target dimensions = uniform scaling (≤1px rounding).
    .resize({ width: fitWidth, height: fitHeight, fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const output = path.join(os.tmpdir(), `model-input-${crypto.randomBytes(6).toString('hex')}.png`);
  await sharp({
    create: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: product,
        left: Math.round((MODEL_INPUT_SIZE - fitWidth) / 2),
        top: Math.round((MODEL_INPUT_SIZE - fitHeight) / 2),
      },
    ])
    .png()
    .toFile(output);
  return output;
}

async function discardModelInput(filePath) {
  await fs.promises.unlink(filePath).catch(() => {});
}

module.exports = { prepareModelInput, discardModelInput, MODEL_INPUT_SIZE };
