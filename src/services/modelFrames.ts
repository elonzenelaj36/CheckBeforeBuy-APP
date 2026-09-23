/**
 * On-device cache of a 3D model's turntable frames — transparent PNGs of the
 * model seen from evenly spaced angles, rendered once by TurntableRenderer and
 * used as the product's layer in the room. Keyed by the GLB file name, so a
 * model is rendered once per device, and turning a product just swaps frames.
 */

import { Directory, File, Paths } from 'expo-file-system';

export const TURNTABLE_FRAMES = 16;
export const MAX_FRAME_SIZE = 512;

export type ModelFrames = {
  frames: string[];
  /** width / height — the same for every frame. */
  aspect: number;
};

const memory = new Map<string, ModelFrames>();

function cacheKey(modelUrl: string): string {
  const name = modelUrl.split('?')[0].split('/').pop() || modelUrl;
  return name.replace(/\.glb$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function folder(modelUrl: string): Directory {
  return new Directory(Paths.cache, 'model3d', cacheKey(modelUrl));
}

export function loadCachedFrames(modelUrl: string): ModelFrames | null {
  const key = cacheKey(modelUrl);
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const manifest = new File(folder(modelUrl), 'manifest.json');
    if (!manifest.exists) return null;
    const parsed = JSON.parse(manifest.textSync()) as { count: number; aspect: number };
    const frames = Array.from({ length: parsed.count }, (_, i) => new File(folder(modelUrl), `frame-${i}.png`));
    if (!frames.every((f) => f.exists)) return null;
    const result = { frames: frames.map((f) => f.uri), aspect: parsed.aspect };
    memory.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/** Writes one frame (base64 PNG) and returns its file URI. */
export function saveFrame(modelUrl: string, index: number, base64: string): string {
  const dir = folder(modelUrl);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `frame-${index}.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/** Marks the frame set complete; only then is it reused. */
export function saveManifest(modelUrl: string, frames: string[], aspect: number): ModelFrames {
  const manifest = new File(folder(modelUrl), 'manifest.json');
  if (manifest.exists) manifest.delete();
  manifest.create();
  manifest.write(JSON.stringify({ count: frames.length, aspect }));
  const result = { frames, aspect };
  memory.set(cacheKey(modelUrl), result);
  return result;
}

/** Nearest rendered frame for a turn angle (degrees). */
export function frameIndexForYaw(yawDeg: number, count: number): number {
  const normalized = ((yawDeg % 360) + 360) % 360;
  return Math.round((normalized / 360) * count) % count;
}
