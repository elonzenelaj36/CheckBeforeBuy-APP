/**
 * Previews background removal (Cloudflare Worker, BiRefNet) on a folder of
 * photos — no 3D, no TRELLIS quota. For each photo it writes one sheet:
 *
 *   original | cutout
 *
 * with the cutout on a checkerboard, plus the raw PNG, and prints the same
 * quality measurements the app uses (productImageQuality.js).
 *
 *   node scripts/preview-cutouts.js <photo-folder> [out-folder]
 *
 * Needs CUTOUT_WORKER_URL + CUTOUT_WORKER_SECRET in backend/.env. Each photo
 * counts once toward the 5,000/month free limit (repeats of the same photo don't).
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { fetchRawCutout, EXT_TO_MIME } = require('../src/services/backgroundRemovalService');
const { cleanAndMeasure, assessQuality } = require('../src/services/productImageQuality');

const TILE = 512;
const GAP = 8;

/** Grey checkerboard, so transparent areas and stray semi-transparent pixels are visible. */
async function checkerboard(size, cell = 16) {
  const data = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 200 : 235;
      data.fill(v, (y * size + x) * 3, (y * size + x) * 3 + 3);
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

async function tile(image, background) {
  const fitted = await sharp(image)
    .resize({ width: TILE, height: TILE, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(background).composite([{ input: fitted }]).png().toBuffer();
}

function describe(metrics, quality) {
  if (!metrics) return 'nothing opaque';
  const warnings = quality.warnings.map((w) => w.code).join(',') || 'ok';
  return `fill ${metrics.fill.toFixed(2)}  specks removed ${metrics.removedPieces}  warnings ${warnings}`;
}

async function main() {
  const [inDir, outArg] = process.argv.slice(2);
  if (!inDir) {
    console.error('Usage: node scripts/preview-cutouts.js <photo-folder> [out-folder]');
    process.exit(1);
  }
  const outDir = outArg || path.join(inDir, 'cutout-preview');
  await fs.promises.mkdir(outDir, { recursive: true });

  const photos = (await fs.promises.readdir(inDir)).filter((f) => EXT_TO_MIME[path.extname(f).toLowerCase()]).sort();
  if (photos.length === 0) throw new Error(`No JPG/PNG/WEBP/HEIC photos in ${inDir}`);
  const board = await checkerboard(TILE);

  for (const file of photos) {
    const input = await fs.promises.readFile(path.join(inDir, file));
    const mime = EXT_TO_MIME[path.extname(file).toLowerCase()];
    const name = path.parse(file).name;
    const tiles = [await tile(input, board).catch(() => board)];

    const started = Date.now();
    try {
      const raw = await fetchRawCutout(input, mime);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      await fs.promises.writeFile(path.join(outDir, `${name}.cutout.png`), raw);
      const { png, metrics } = await cleanAndMeasure(raw);
      console.log(`${file}  ${seconds}s  ${describe(metrics, assessQuality(metrics))}`);
      tiles.push(await tile(png, board));
    } catch (err) {
      console.log(`${file}  FAILED: ${err.message}`);
      tiles.push(board);
    }

    const width = tiles.length * TILE + (tiles.length - 1) * GAP;
    await sharp({ create: { width, height: TILE, channels: 3, background: '#ffffff' } })
      .composite(tiles.map((input, i) => ({ input, left: i * (TILE + GAP), top: 0 })))
      .png()
      .toFile(path.join(outDir, `${name}.preview.png`));
  }
  console.log(`\nSheets: ${outDir}  (original | cutout)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
