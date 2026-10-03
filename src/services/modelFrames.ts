/**
 * On-device cache of a 3D model's turntable frames — transparent PNGs of the
 * model seen from evenly spaced angles, rendered once by TurntableRenderer and
 * used as the product's layer in the room. Keyed by the GLB file name, so a
 * model is rendered once per device, and turning a product just swaps frames.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { TURNTABLE_ELEVATION_DEG } from '@/components/model3d/modelViewerHtml';

export const TURNTABLE_FRAMES = 16;
export const MAX_FRAME_SIZE = 512;
/**
 * Default camera elevation of the turntable (degrees above the product):
 * slightly above, like a phone photo of a room. Spatial rooms render each
 * product from the room's own perspective instead (see productElevationDeg).
 */
export const DEFAULT_ELEVATION_DEG = TURNTABLE_ELEVATION_DEG;

export type ModelFrames = {
  frames: string[];
  /** width / height — the same for every frame. */
  aspect: number;
  /** Frame that shows the photographed (front) side; 0 when unknown. */
  frontIndex: number;
};

const memory = new Map<string, ModelFrames>();

/** One frame set per model AND elevation; the default elevation keeps the original key (existing caches stay valid). */
function cacheKey(modelUrl: string, elevationDeg: number): string {
  const name = modelUrl.split('?')[0].split('/').pop() || modelUrl;
  const base = name.replace(/\.glb$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return elevationDeg === DEFAULT_ELEVATION_DEG ? base : `${base}-e${Math.round(elevationDeg)}`;
}

function folder(modelUrl: string, elevationDeg: number): Directory {
  return new Directory(Paths.cache, 'model3d', cacheKey(modelUrl, elevationDeg));
}

export function loadCachedFrames(modelUrl: string, elevationDeg: number = DEFAULT_ELEVATION_DEG): ModelFrames | null {
  const key = cacheKey(modelUrl, elevationDeg);
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const manifest = new File(folder(modelUrl, elevationDeg), 'manifest.json');
    if (!manifest.exists) return null;
    const parsed = JSON.parse(manifest.textSync()) as { count: number; aspect: number; frontIndex?: number };
    // Rendered before the front was detected: render once more so the product shows its front.
    if (parsed.frontIndex === undefined) return null;
    const frames = Array.from({ length: parsed.count }, (_, i) => new File(folder(modelUrl, elevationDeg), `frame-${i}.png`));
    if (!frames.every((f) => f.exists)) return null;
    const result = {
      frames: frames.map((f) => f.uri),
      aspect: parsed.aspect,
      frontIndex: parsed.frontIndex,
    };
    memory.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/** Writes one frame (base64 PNG) and returns its file URI. */
export function saveFrame(modelUrl: string, index: number, base64: string, elevationDeg: number = DEFAULT_ELEVATION_DEG): string {
  const dir = folder(modelUrl, elevationDeg);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `frame-${index}.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/** Marks the frame set complete; only then is it reused. */
export function saveManifest(
  modelUrl: string,
  frames: string[],
  aspect: number,
  elevationDeg: number = DEFAULT_ELEVATION_DEG,
  frontIndex = 0
): ModelFrames {
  const manifest = new File(folder(modelUrl, elevationDeg), 'manifest.json');
  if (manifest.exists) manifest.delete();
  manifest.create();
  manifest.write(JSON.stringify({ count: frames.length, aspect, frontIndex }));
  const result = { frames, aspect, frontIndex };
  memory.set(cacheKey(modelUrl, elevationDeg), result);
  return result;
}

/** Nearest rendered frame for a turn angle (degrees). */
export function frameIndexForYaw(yawDeg: number, count: number): number {
  const normalized = ((yawDeg % 360) + 360) % 360;
  return Math.round((normalized / 360) * count) % count;
}
