/**
 * Viewing direction of a captured 180°/360° room — shared by the room viewer,
 * the room page / My Home cards and Arrange, so the room turns the same way
 * everywhere: drag moves the direction, a flick keeps it gliding, and it
 * comes to rest exactly on a real captured frame.
 *
 * The live angle, the drag's start angle and the running animation are kept
 * in plain refs (read by the drag/animation callbacks without rebuilding them)
 * and the angle is mirrored into React state for rendering. Everything here
 * runs on the JS thread. (These used to be Reanimated shared values: a value
 * written from the JS thread reaches the UI runtime asynchronously, so the
 * first drag update could read the PREVIOUS drag's start angle — the room
 * flashed back to where the last swipe began for one frame at every touch.)
 */

import React from 'react';

import { blendAt, dragToDegrees, normalizeAngle, type ViewFrame } from '@/services/roomViewMath';

/** Fling: velocity multiplier per 16 ms frame, and the speed (deg/s) at which it stops. */
const FLING_DECAY = 0.93;
const FLING_STOP_DEG_S = 4;
const SNAP_MS = 160;

export type SpatialAngle = ReturnType<typeof useSpatialAngle>;

export function useSpatialAngle(
  frames: ViewFrame[],
  loops: boolean,
  options: { initialAngle?: number; onSettle?: (angleDeg: number) => void } = {}
) {
  const { onSettle } = options;
  const [angle, setAngle] = React.useState(options.initialAngle ?? frames[0]?.angleDeg ?? 0);
  const angleRef = React.useRef(angle);
  const dragStart = React.useRef(0);
  const animation = React.useRef<number | null>(null);

  const moveTo = React.useCallback(
    (a: number) => {
      const next = normalizeAngle(frames, loops, a);
      angleRef.current = next;
      setAngle(next);
    },
    [frames, loops]
  );

  /** The live angle right now (also between renders), for callbacks. */
  const getAngle = React.useCallback(() => angleRef.current, []);

  const stopAnimation = React.useCallback(() => {
    const id = animation.current;
    if (id != null) cancelAnimationFrame(id);
    animation.current = null;
  }, []);

  React.useEffect(() => stopAnimation, [stopAnimation]);

  /** Jumps without animation (e.g. to the starting view once frames load). */
  const jumpTo = React.useCallback(
    (a: number) => {
      stopAnimation();
      moveTo(a);
    },
    [moveTo, stopAnimation]
  );

  /** Glides to an angle (shortest way round when looping), then reports it as settled. */
  const snapTo = React.useCallback(
    (target: number) => {
      stopAnimation();
      const from = angleRef.current;
      let delta = target - from;
      if (loops) delta = ((delta + 540) % 360) - 180;
      const started = Date.now();
      const tick = () => {
        const t = Math.min((Date.now() - started) / SNAP_MS, 1);
        moveTo(from + delta * (1 - (1 - t) ** 3));
        if (t < 1) {
          animation.current = requestAnimationFrame(tick);
        } else {
          animation.current = null;
          onSettle?.(angleRef.current);
        }
      };
      animation.current = requestAnimationFrame(tick);
    },
    [loops, moveTo, stopAnimation, onSettle]
  );

  const snapToNearest = React.useCallback(() => {
    if (frames.length === 0) return;
    const { nearest } = blendAt(frames, loops, angleRef.current);
    snapTo(frames[nearest].angleDeg);
  }, [frames, loops, snapTo]);

  const fling = React.useCallback(
    (velocityDegS: number) => {
      stopAnimation();
      let v = velocityDegS;
      let last = Date.now();
      const tick = () => {
        const now = Date.now();
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const before = angleRef.current;
        moveTo(before + v * dt);
        v *= FLING_DECAY ** (dt / 0.016);
        const hitEnd = !loops && angleRef.current === before && v !== 0;
        if (Math.abs(v) < FLING_STOP_DEG_S || hitEnd) {
          animation.current = null;
          snapToNearest();
          return;
        }
        animation.current = requestAnimationFrame(tick);
      };
      animation.current = requestAnimationFrame(tick);
    },
    [loops, moveTo, snapToNearest, stopAnimation]
  );

  /**
   * Stops a glide right away and rests on the nearest real frame (reported as
   * settled). Used when a finger lands on the room or a product mid-glide, so
   * nothing keeps moving under the finger.
   */
  const settleNow = React.useCallback(() => {
    if (animation.current == null || frames.length === 0) return;
    stopAnimation();
    const target = frames[blendAt(frames, loops, angleRef.current).nearest].angleDeg;
    moveTo(target);
    onSettle?.(target);
  }, [frames, loops, moveTo, stopAnimation, onSettle]);

  /** Drag handlers (JS thread) for a view `width` px wide showing `fovDeg` degrees. */
  const drag = React.useMemo(
    () => ({
      begin: () => {
        stopAnimation();
        dragStart.current = angleRef.current;
      },
      update: (translationX: number, width: number, fovDeg: number) =>
        moveTo(dragStart.current + dragToDegrees(translationX, width, fovDeg)),
      end: (velocityX: number, width: number, fovDeg: number) => fling(dragToDegrees(velocityX, width, fovDeg)),
    }),
    [stopAnimation, moveTo, fling]
  );

  return { angle, getAngle, jumpTo, snapTo, snapToNearest, fling, stopAnimation, settleNow, drag };
}
