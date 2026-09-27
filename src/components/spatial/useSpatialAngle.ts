/**
 * Viewing direction of a captured 180°/360° room — shared by the room viewer,
 * the room page / My Home cards and Arrange, so the room turns the same way
 * everywhere: drag moves the direction, a flick keeps it gliding, and it
 * comes to rest exactly on a real captured frame.
 *
 * The live angle is kept in a shared value (read by gestures/animations
 * without rebuilding them) and mirrored into React state for rendering.
 */

import React from 'react';
import { useSharedValue } from 'react-native-reanimated';

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
  const angleNow = useSharedValue(angle);
  const dragStart = useSharedValue(0);
  const animation = useSharedValue<number | null>(null);

  const moveTo = React.useCallback(
    (a: number) => {
      const next = normalizeAngle(frames, loops, a);
      angleNow.set(next);
      setAngle(next);
    },
    [frames, loops, angleNow]
  );

  const stopAnimation = React.useCallback(() => {
    const id = animation.get();
    if (id != null) cancelAnimationFrame(id);
    animation.set(null);
  }, [animation]);

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
      const from = angleNow.get();
      let delta = target - from;
      if (loops) delta = ((delta + 540) % 360) - 180;
      const started = Date.now();
      const tick = () => {
        const t = Math.min((Date.now() - started) / SNAP_MS, 1);
        moveTo(from + delta * (1 - (1 - t) ** 3));
        if (t < 1) {
          animation.set(requestAnimationFrame(tick));
        } else {
          animation.set(null);
          onSettle?.(angleNow.get());
        }
      };
      animation.set(requestAnimationFrame(tick));
    },
    [loops, moveTo, stopAnimation, angleNow, animation, onSettle]
  );

  const snapToNearest = React.useCallback(() => {
    if (frames.length === 0) return;
    const { nearest } = blendAt(frames, loops, angleNow.get());
    snapTo(frames[nearest].angleDeg);
  }, [frames, loops, snapTo, angleNow]);

  const fling = React.useCallback(
    (velocityDegS: number) => {
      stopAnimation();
      let v = velocityDegS;
      let last = Date.now();
      const tick = () => {
        const now = Date.now();
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const before = angleNow.get();
        moveTo(before + v * dt);
        v *= FLING_DECAY ** (dt / 0.016);
        const hitEnd = !loops && angleNow.get() === before && v !== 0;
        if (Math.abs(v) < FLING_STOP_DEG_S || hitEnd) {
          animation.set(null);
          snapToNearest();
          return;
        }
        animation.set(requestAnimationFrame(tick));
      };
      animation.set(requestAnimationFrame(tick));
    },
    [loops, moveTo, snapToNearest, stopAnimation, angleNow, animation]
  );

  /** Drag handlers (JS thread) for a view `width` px wide showing `fovDeg` degrees. */
  const drag = React.useMemo(
    () => ({
      begin: () => {
        stopAnimation();
        dragStart.set(angleNow.get());
      },
      update: (translationX: number, width: number, fovDeg: number) =>
        moveTo(dragStart.get() + dragToDegrees(translationX, width, fovDeg)),
      end: (velocityX: number, width: number, fovDeg: number) => fling(dragToDegrees(velocityX, width, fovDeg)),
    }),
    [stopAnimation, dragStart, angleNow, moveTo, fling]
  );

  return { angle, angleNow, jumpTo, snapTo, snapToNearest, fling, stopAnimation, drag };
}
