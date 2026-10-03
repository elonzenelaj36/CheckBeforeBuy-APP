/**
 * What a product cutout is, and whether it hangs on a wall — so a painting,
 * mirror or wall TV is placed on a wall even when the user never named it
 * (e.g. they outlined it in a photo). One question to the project's Groq
 * vision model (same call path as Items Detected), asked once per cutout and
 * cached next to it (`cutout-<hash>.kind.json`). A failure isn't cached and
 * never blocks the cutout: the product is then just not known to be
 * wall-mounted (its name or 3D shape can still tell).
 */

const fs = require('fs');
const { askGroqAboutImage, isAvailable } = require('./roomItemDetectionService');

const TIMEOUT_MS = 15000;

const PROMPT =
  'This is a photo of one product (background removed). Name it in 2-4 words, e.g. "framed painting", ' +
  '"round wall mirror", "armchair". wallMounted: true only if it is normally hung or mounted on a wall ' +
  '(painting, framed picture, poster, mirror meant for the wall, wall-mounted TV, wall shelf, wall clock, ' +
  'wall cabinet); false for anything that stands on the floor or a table. Return JSON only: ' +
  '{"name":"...","wallMounted":false}';

/** @returns {Promise<{ name: string|null, wallMounted: boolean } | null>} null = unknown */
async function classifyCutout(cutoutPath) {
  const cachePath = cutoutPath.replace(/\.png$/, '.kind.json');
  try {
    return JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
  } catch {
    // not asked yet
  }
  if (!isAvailable()) return null;
  try {
    const { content } = await Promise.race([
      askGroqAboutImage(cutoutPath, PROMPT),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)),
    ]);
    const name = typeof content?.name === 'string' ? content.name.trim().slice(0, 60) || null : null;
    const result = { name, wallMounted: content?.wallMounted === true };
    await fs.promises.writeFile(cachePath, JSON.stringify(result)).catch(() => {});
    return result;
  } catch (err) {
    console.warn('[productKind] classification failed:', err.message);
    return null;
  }
}

module.exports = { classifyCutout };
