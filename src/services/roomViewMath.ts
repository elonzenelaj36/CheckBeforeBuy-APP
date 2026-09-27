/**
 * Room viewer math — pure, no React imports.
 *
 * The viewer works in ANGLE space: the user's drag moves a continuous
 * viewing direction, and the two real frames on either side of it are
 * cross-faded. Frames are never synthesized; a gap in the capture simply
 * means a longer cross-fade between its two neighbours.
 *   - loops (verified 360°): the direction wraps around 0°/360°.
 *   - otherwise (180°, or a 360° whose full turn couldn't be verified): the
 *     direction is clamped to the first..last frame — no wrap.
 */

export type ViewFrame = { angleDeg: number };

export type ViewBlend = {
  /** Frame drawn underneath (fully opaque). */
  lower: number;
  /** Frame drawn on top with opacity `weight` (same as lower when exactly on a frame). */
  upper: number;
  weight: number;
  /** The frame the user is "on" (for USE THIS VIEW and the angle label). */
  nearest: number;
};

export const wrap360 = (a: number) => ((a % 360) + 360) % 360;

/** Direction the viewer is allowed to show: wrapped (loops) or clamped to the captured span. */
export function normalizeAngle(frames: ViewFrame[], loops: boolean, angle: number): number {
  if (frames.length === 0) return 0;
  if (loops) return wrap360(angle);
  const first = frames[0].angleDeg;
  const last = frames[frames.length - 1].angleDeg;
  return Math.min(Math.max(angle, first), last);
}

/** Frames must be sorted by angle (the backend returns them that way). */
export function blendAt(frames: ViewFrame[], loops: boolean, angle: number): ViewBlend {
  const n = frames.length;
  if (n === 0) return { lower: 0, upper: 0, weight: 0, nearest: 0 };
  if (n === 1) return { lower: 0, upper: 0, weight: 0, nearest: 0 };
  const a = normalizeAngle(frames, loops, angle);

  // Index of the last frame at or before `a`.
  let lower = -1;
  for (let i = 0; i < n; i += 1) {
    if (frames[i].angleDeg <= a) lower = i;
    else break;
  }
  let upper: number;
  let span: number;
  let offset: number;
  if (lower === -1) {
    // Only possible when looping: between the last frame and the first (across 360°).
    lower = n - 1;
    upper = 0;
    span = frames[0].angleDeg + 360 - frames[n - 1].angleDeg;
    offset = a + 360 - frames[n - 1].angleDeg;
  } else if (lower === n - 1) {
    if (!loops) return { lower, upper: lower, weight: 0, nearest: lower };
    upper = 0;
    span = frames[0].angleDeg + 360 - frames[n - 1].angleDeg;
    offset = a - frames[n - 1].angleDeg;
  } else {
    upper = lower + 1;
    span = frames[upper].angleDeg - frames[lower].angleDeg;
    offset = a - frames[lower].angleDeg;
  }
  const weight = span > 0 ? Math.min(Math.max(offset / span, 0), 1) : 0;
  return { lower, upper, weight, nearest: weight < 0.5 ? lower : upper };
}

/**
 * Degrees the view turns for a drag of `dx` pixels across a view `width`
 * pixels wide. A full-width drag = the capture lens's field of view
 * (`fovDeg`, ~42° for 1×, ~75° for 0.5× in portrait), so the room moves with
 * the finger 1:1. Dragging left looks further right (like pushing a panorama).
 */
export const FULL_WIDTH_DRAG_DEG = 60;
export function dragToDegrees(dx: number, width: number, fovDeg: number = FULL_WIDTH_DRAG_DEG): number {
  return width > 0 ? (-dx / width) * fovDeg : 0;
}

/** Step to the previous/next frame from the one currently nearest. */
export function stepFrame(frames: ViewFrame[], loops: boolean, nearest: number, step: 1 | -1): number {
  const n = frames.length;
  if (n === 0) return 0;
  const next = nearest + step;
  if (loops) return (next + n) % n;
  return Math.min(Math.max(next, 0), n - 1);
}
