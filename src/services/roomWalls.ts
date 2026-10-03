/**
 * The room picture's walls (backend GET /rooms/:id/walls) — used ONLY for the
 * starting turn of a wall-mounted product's 3D preview (paintings, mirrors,
 * TVs, wall shelves…). The preview is approximate; AI Render works out the
 * exact wall and perspective on the backend at the product's final position.
 *
 * Fetched once per picture (the backend caches its analysis too) and only
 * when a wall-mounted product is placed. Any failure just means "no walls":
 * the product keeps facing the camera, as before.
 */

import { apiGet } from './api';

export type RoomWall = {
  id: string;
  /** Visible area, corners TL, TR, BR, BL, normalized 0..1 to the picture. */
  polygon: [number, number][];
  facing: 'front' | 'left' | 'right';
  mountable: boolean;
  confidence: number;
  /** Horizontal direction the wall faces (degrees from the camera's forward, + = right); null = unknown. */
  normalDeg: number | null;
};

export type RoomWallsCamera = { fovDeg: number; aspect: number; pitchDeg: number };

export type RoomWalls = { status: 'ok' | 'unavailable'; camera: RoomWallsCamera | null; walls: RoomWall[] };

/** Below this the preview doesn't trust a wall (the backend uses its own threshold for AI Render). */
const MIN_PREVIEW_CONFIDENCE = 0.5;

const cache = new Map<string, Promise<RoomWalls>>();

export function fetchRoomWalls(roomId: string, frameId: string | null): Promise<RoomWalls> {
  const key = `${roomId}:${frameId ?? ''}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = apiGet<RoomWalls>(`/rooms/${roomId}/walls${frameId ? `?frameId=${encodeURIComponent(frameId)}` : ''}`).then(
      (result) => {
        if (result.status !== 'ok') cache.delete(key); // try again next time
        return result;
      },
      () => {
        cache.delete(key);
        return { status: 'unavailable' as const, camera: null, walls: [] };
      }
    );
    cache.set(key, pending);
  }
  return pending;
}

const WALL_WORDS =
  /\b(painting|paintings|canvas|wall ?art|artwork|art print|poster|framed|picture frame|photo frame|mirror|tv|television|wall shelf|wall shelves|floating shelf|wall[- ]mounted|wall cabinet|wall clock|tapestry|wall decor)\b/i;
/** Products that stand on the floor even when their name mentions a wall word ("TV stand", "floor mirror"…). */
const FLOOR_WORDS = /\b(stand|floor|easel|cabinet with legs|console|sideboard|dresser|table)\b/i;

/** Wall-mounted products (by name/category/characteristics). Unknown → not wall-mounted (existing behaviour). */
export function isWallMountedProduct(p: { name: string; category?: string | null; characteristics?: string[] }): boolean {
  const text = [p.name, p.category ?? '', ...(p.characteristics ?? [])].join(' ');
  return WALL_WORDS.test(text) && !FLOOR_WORDS.test(`${p.name} ${p.category ?? ''}`);
}

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The confident wall containing picture point (x, y), else null. */
export function wallAtPoint(walls: RoomWall[], x: number, y: number): RoomWall | null {
  return (
    walls
      .filter((w) => w.normalDeg !== null && w.confidence >= MIN_PREVIEW_CONFIDENCE && pointInPolygon(x, y, w.polygon))
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null
  );
}

const DEG = Math.PI / 180;

/** Same as backend wallGeometry.levelRay: camera ray (tilt removed) through (x, y). */
function levelRay(x: number, y: number, cam: RoomWallsCamera): [number, number, number] {
  const tH = Math.tan((cam.fovDeg / 2) * DEG);
  const tV = tH / cam.aspect;
  const cx = (x - 0.5) * 2 * tH;
  const cy = -(y - 0.5) * 2 * tV;
  const p = cam.pitchDeg * DEG;
  const ly = cy * Math.cos(p) - Math.sin(p);
  const lz = cy * Math.sin(p) + Math.cos(p);
  const n = Math.hypot(cx, ly, lz);
  return [cx / n, ly / n, lz / n];
}

/**
 * Same as backend wallGeometry.turnDeg: the turntable angle (relative to the
 * product's front) at which something facing `normalDeg` is seen from the
 * camera at (x, y).
 */
export function wallTurnDeg(x: number, y: number, normalDeg: number, cam: RoomWallsCamera): number {
  const r = levelRay(x, y, cam);
  const h = Math.hypot(r[0], r[2]) || 1;
  const c = [-r[0] / h, -r[2] / h];
  const n = [Math.sin(normalDeg * DEG), Math.cos(normalDeg * DEG)];
  const xm = [-n[1], n[0]];
  return Math.atan2(c[0] * xm[0] + c[1] * xm[1], c[0] * n[0] + c[1] * n[1]) / DEG;
}
