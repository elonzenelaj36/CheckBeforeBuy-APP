/**
 * Room capture service — the OPTIONAL 180°/360° room sweep attached to a room
 * (backend /api/rooms/:id/capture, see backend/src/services/roomCaptureService.js).
 *
 * A room without a capture works exactly as before. A capture never replaces
 * the room's photos: "USE THIS VIEW" only records which captured frame new
 * visualizations should start from; the primary photo stays the room photo
 * everywhere else.
 */

import { apiDelete, apiGet, apiPatch, apiUploadMultipart } from './api';
import type { MotionTrack } from './roomCaptureMotion';

export type CaptureMode = '180' | '360';

/** Camera lens a capture was recorded with: 'ultra-wide' = the physical 0.5× lens (iPhones that have one). */
export type CaptureLens = 'wide' | 'ultra-wide';

/**
 * Capture guidance per lens. The ultra-wide sees roughly twice as much of the
 * room per frame, so the same turning speed blurs about half as much and the
 * user can turn faster. These are tuned estimates (not measurements) and pair
 * with the backend's LENS_PROFILES (slot spacing and "too fast" rejection).
 *   fovDeg       — approximate horizontal field of view in portrait (viewer drag scale)
 *   tooSlowDegS  — below this the screen says "you can go a bit faster"
 *   goodMaxDegS  — above this the screen says "slow down"
 *   seconds      — suggested duration per range
 *   maxGapDeg    — widest direction gap the viewer can bridge (same as the backend's LENS_PROFILES)
 */
export const CAPTURE_LENSES: Record<
  CaptureLens,
  {
    label: string;
    fovDeg: number;
    tooSlowDegS: number;
    goodMaxDegS: number;
    seconds: Record<CaptureMode, number>;
    maxGapDeg: number;
  }
> = {
  wide: { label: '1×', fovDeg: 42, tooSlowDegS: 4, goodMaxDegS: 25, seconds: { '180': 18, '360': 35 }, maxGapDeg: 25 },
  'ultra-wide': {
    label: '0.5×',
    // ≈60° measured from real 0.5× captures in portrait (was 75°). Captures carry their own measured value.
    fovDeg: 60,
    tooSlowDegS: 6,
    goodMaxDegS: 40,
    seconds: { '180': 12, '360': 25 },
    maxGapDeg: 45,
  },
};

/**
 * How far the user must turn for the backend to accept the capture (mirrors
 * minCoverageFor() in backend/src/services/roomCaptureService.js). 180° and
 * 360° are targets, not exact requirements: 180° accepts from 150°; 360°
 * accepts once the gap back to the start is one the viewer can bridge.
 */
export function minCoverageDeg(mode: CaptureMode, lens: CaptureLens): number {
  return mode === '360' ? 360 - CAPTURE_LENSES[lens].maxGapDeg : 150;
}

export type RoomViewRef = {
  frameId: string;
  angleDeg: number;
  /** Full-size frame (Arrange / AI Render). */
  imageUri: string;
  /** Small copy for swiping and thumbnails. */
  previewUri: string;
};

/** Included in every Room (null when the room has no capture). */
export type RoomCaptureSummary = {
  id: string;
  mode: CaptureMode;
  lens: CaptureLens;
  /** 'gyro' = angles measured by the phone's rotation sensor; 'time' = estimated (steady-turn assumption). */
  angleSource: 'gyro' | 'time';
  coverageDeg: number;
  /** True only for a 360° capture whose full turn was confirmed — the viewer then wraps around. */
  loops: boolean;
  frameCount: number;
  coverImageUri: string | null;
  selectedView: RoomViewRef | null;
  /** Field of view measured from the capture's own views (null/absent = not measured). */
  fovDeg?: number | null;
  createdAt: string;
};

/** Horizontal field of view to use for a capture: measured from its views when known, else the lens's nominal value. */
export function captureFovDeg(capture: { fovDeg?: number | null; lens?: CaptureLens | null }): number {
  return capture.fovDeg ?? CAPTURE_LENSES[capture.lens ?? 'wide']?.fovDeg ?? CAPTURE_LENSES.wide.fovDeg;
}

export type RoomCaptureFrame = {
  id: string;
  index: number;
  angleDeg: number;
  timeMs: number;
  imageUri: string;
  previewUri: string;
  sharpness: number;
  /** How far the camera looked down for this view (null = not recorded; treat as level). */
  pitchDeg?: number | null;
  /** How well this view lines up with the next (0 = they don't match: the viewer snaps instead of cross-fading). */
  alignScore?: number | null;
};

export type RoomCapture = RoomCaptureSummary & {
  roomId: string;
  videoDurationMs: number;
  warnings: string[];
  frames: RoomCaptureFrame[];
};

export async function getRoomCapture(roomId: string): Promise<RoomCapture | null> {
  const { capture } = await apiGet<{ capture: RoomCapture | null }>(`/rooms/${roomId}/capture`);
  return capture;
}

/**
 * Uploads the recorded sweep; the backend extracts the views and returns the
 * new capture (replacing the room's previous capture, if any). Throws the
 * backend's user-facing message when the recording can't be used.
 */
export async function uploadRoomCapture(
  roomId: string,
  videoUri: string,
  mode: CaptureMode,
  motion: MotionTrack,
  lens: CaptureLens
): Promise<RoomCapture> {
  const { capture } = await apiUploadMultipart<{ capture: RoomCapture }>(
    `/rooms/${roomId}/capture`,
    { video: videoUri },
    { mode, lens, motion: JSON.stringify(motion) }
  );
  return capture;
}

/** "USE THIS VIEW" (frameId) or back to the room's primary photo (null). */
export async function selectRoomView(roomId: string, captureId: string, frameId: string | null): Promise<RoomCapture> {
  const { capture } = await apiPatch<{ capture: RoomCapture }>(`/rooms/${roomId}/capture/${captureId}`, {
    selectedFrameId: frameId,
  });
  return capture;
}

export async function deleteRoomCapture(roomId: string, captureId: string): Promise<void> {
  await apiDelete(`/rooms/${roomId}/capture/${captureId}`);
}

/**
 * A room with a 180°/360° capture is a SPATIAL room: the swipeable capture is
 * its main visual (My Home, room page, Arrange). A room without one is a
 * photo room and behaves exactly as before. Its photos are kept either way.
 */
export function isSpatialRoom(room: { capture?: RoomCaptureSummary | null }): boolean {
  return !!room.capture && room.capture.frameCount > 0;
}

/** Still image for a room: the capture's view for spatial rooms, else the primary photo. */
export function roomCoverImage(room: { primaryImageUri: string | null; capture?: RoomCaptureSummary | null }): string | null {
  return (isSpatialRoom(room) ? room.capture?.coverImageUri : null) ?? room.primaryImageUri ?? room.capture?.coverImageUri ?? null;
}

/**
 * The image a new visualization of this room starts from: the selected
 * captured view if there is one, else the primary photo (exactly as before).
 * (Spatial sessions then load all views and follow the direction the user looks.)
 */
export function roomWorkingImage(room: {
  primaryImageUri: string | null;
  capture?: RoomCaptureSummary | null;
}): { imageUri: string | null; view: SessionRoomView | null } {
  const capture = room.capture ?? null;
  const selected = capture?.selectedView ?? null;
  if (capture && selected) {
    return {
      imageUri: selected.imageUri,
      view: { captureId: capture.id, frameId: selected.frameId, angleDeg: selected.angleDeg, mode: capture.mode },
    };
  }
  return { imageUri: room.primaryImageUri, view: null };
}

/** Which captured view a visualization session is using (null = the primary photo). */
export type SessionRoomView = {
  captureId: string;
  frameId: string;
  angleDeg: number;
  mode: CaptureMode;
};
