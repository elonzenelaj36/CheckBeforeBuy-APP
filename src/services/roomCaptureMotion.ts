/**
 * Turn tracking for room capture — pure math, no React / Expo imports.
 *
 * Measures how far the phone has turned around the VERTICAL axis while the
 * user records a room sweep, from expo-sensors DeviceMotion events:
 *   - rotationRate (deg/s) — its alpha/beta/gamma names map to DIFFERENT device
 *     axes per platform (see deviceRotationRate); the docs don't match either.
 *   - gravity = accelerationIncludingGravity − acceleration (m/s², device axes x/y/z,
 *     pointing down on both platforms)
 * The turn rate is the rotation rate projected on the gravity direction, so
 * it doesn't matter whether the phone is held upright, tilted or in
 * landscape. It is integrated over time into a yaw angle (gyro drift over a
 * 20–60 s sweep is typically a few degrees).
 *
 * The backend (services/roomCaptureService.js) turns this track into frame
 * angles; the capture screen uses the same number for its progress bar.
 */

export type Vec3 = { x: number; y: number; z: number };

export type MotionEvent = {
  rotationRate: { alpha: number; beta: number; gamma: number } | null;
  accelerationIncludingGravity: Vec3 | null;
  acceleration: Vec3 | null;
};

/** [ms since the app asked the camera to record, yaw in degrees] */
export type MotionSample = [number, number];

/** What is uploaded with the video (see the backend's parseMotion()). */
export type MotionTrack = {
  v: 1;
  available: boolean;
  reason?: string;
  /** ms (same clock as samples) when the app asked the camera to stop. */
  stopAtMs: number | null;
  samples: MotionSample[];
};

/**
 * DeviceMotion's rotationRate in DEVICE axes (x right, y up, z out of the
 * screen; deg/s, right-hand rule). expo-sensors 57 fills alpha/beta/gamma
 * differently per platform (read from its native source):
 *   Android (DeviceMotionModule.kt):    alpha = x, beta = y, gamma = z
 *   iOS     (DeviceMotionModule.swift): alpha = z, beta = y, gamma = x
 * Getting this wrong measures the wrong axis (e.g. screen roll instead of the
 * turn), which made a real 180° turn read as ~2°.
 */
export function deviceRotationRate(
  rate: { alpha: number; beta: number; gamma: number },
  platform: string
): Vec3 {
  return platform === 'ios'
    ? { x: rate.gamma, y: rate.beta, z: rate.alpha }
    : { x: rate.alpha, y: rate.beta, z: rate.gamma };
}

/** Longer gaps between events are not integrated (app paused, sensor hiccup). */
const MAX_STEP_S = 0.25;
/** Low-pass factor for the gravity direction (hand shake shouldn't tilt the axis). */
const GRAVITY_SMOOTHING = 0.85;

export type YawTracker = {
  /** Feeds one DeviceMotion event received at `tMs`; returns the current yaw (deg). */
  push(event: MotionEvent, tMs: number): number;
  /** Current yaw (deg); positive or negative depending on the turn direction. */
  yaw(): number;
  /** Recorded [tMs, yaw] samples, rounded for upload. */
  samples(): MotionSample[];
};

/** `platform`: Platform.OS — decides how rotationRate maps to device axes. */
export function createYawTracker(platform: string): YawTracker {
  let yaw = 0;
  let lastT: number | null = null;
  let gravity: Vec3 | null = null;
  const recorded: MotionSample[] = [];

  return {
    push(event, tMs) {
      const g = gravityOf(event);
      if (g) {
        gravity = gravity
          ? {
              x: GRAVITY_SMOOTHING * gravity.x + (1 - GRAVITY_SMOOTHING) * g.x,
              y: GRAVITY_SMOOTHING * gravity.y + (1 - GRAVITY_SMOOTHING) * g.y,
              z: GRAVITY_SMOOTHING * gravity.z + (1 - GRAVITY_SMOOTHING) * g.z,
            }
          : g;
      }
      const rate = event.rotationRate ? deviceRotationRate(event.rotationRate, platform) : null;
      if (rate && gravity && lastT !== null) {
        const dt = (tMs - lastT) / 1000;
        if (dt > 0 && dt <= MAX_STEP_S) {
          const n = Math.hypot(gravity.x, gravity.y, gravity.z);
          if (n > 1) {
            const turnRate = (rate.x * gravity.x + rate.y * gravity.y + rate.z * gravity.z) / n;
            yaw += turnRate * dt;
          }
        }
      }
      lastT = tMs;
      recorded.push([Math.round(tMs), Math.round(yaw * 100) / 100]);
      return yaw;
    },
    yaw: () => yaw,
    samples: () => recorded,
  };
}

function gravityOf(event: MotionEvent): Vec3 | null {
  const withG = event.accelerationIncludingGravity;
  if (!withG) return null;
  const a = event.acceleration;
  return a ? { x: withG.x - a.x, y: withG.y - a.y, z: withG.z - a.z } : withG;
}
