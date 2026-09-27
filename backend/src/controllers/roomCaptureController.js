const fs = require('fs');
const path = require('path');
const { pool } = require('../db/connection');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const { processCapture, CaptureError } = require('../services/roomCaptureService');

/**
 * Optional 180°/360° room capture attached to a room (see
 * services/roomCaptureService.js). A room keeps at most one capture: a new
 * successful capture replaces the previous one. The room's own photos are
 * never touched — the capture's frames are separate files and rows.
 */

const storedPath = (fileName) => `/${env.uploadDir}/${fileName}`;

async function ownedRoom(roomId, userId) {
  const [rows] = await pool.query('SELECT id FROM rooms WHERE id = ? AND user_id = ? LIMIT 1', [roomId, userId]);
  if (rows.length === 0) throw new ApiError(404, 'Room not found.');
  return rows[0];
}

function serializeFrame(f) {
  return {
    id: String(f.id),
    index: f.frame_index,
    angleDeg: Number(f.angle_deg),
    timeMs: f.video_time_ms,
    imageUri: toAbsoluteUrl(f.image_path),
    previewUri: toAbsoluteUrl(f.preview_path),
    sharpness: f.sharpness,
    /** How far the camera looked down for this view (null = not recorded, older captures). */
    pitchDeg: f.pitch_deg == null ? null : Number(f.pitch_deg),
  };
}

function parseWarnings(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Summary included in every room response (null when the room has no capture).
 * `selectedView` is the view chosen with "USE THIS VIEW".
 */
function serializeCaptureSummary(c, selectedFrame, coverFrame) {
  return {
    id: String(c.id),
    mode: c.mode,
    /** Lens that recorded it; older captures have none → the normal 1× lens. */
    lens: c.lens || 'wide',
    angleSource: c.angle_source,
    coverageDeg: Number(c.coverage_deg),
    loops: !!c.loops,
    frameCount: c.frame_count,
    coverImageUri: coverFrame ? toAbsoluteUrl(coverFrame.preview_path) : null,
    selectedView: selectedFrame
      ? {
          frameId: String(selectedFrame.id),
          angleDeg: Number(selectedFrame.angle_deg),
          imageUri: toAbsoluteUrl(selectedFrame.image_path),
          previewUri: toAbsoluteUrl(selectedFrame.preview_path),
        }
      : null,
    createdAt: c.created_at,
  };
}

/** Latest capture summary per room id (Map roomId → summary). One query each for captures and their key frames. */
async function loadCaptureSummaries(roomIds) {
  const result = new Map();
  if (roomIds.length === 0) return result;
  const [captures] = await pool.query(
    `SELECT * FROM room_captures WHERE room_id IN (${roomIds.map(() => '?').join(',')}) ORDER BY created_at DESC, id DESC`,
    roomIds
  );
  const latest = new Map();
  for (const c of captures) if (!latest.has(c.room_id)) latest.set(c.room_id, c);
  if (latest.size === 0) return result;

  const ids = [...latest.values()].map((c) => c.id);
  const selectedIds = [...latest.values()].map((c) => c.selected_frame_id).filter(Boolean);
  const [frames] = await pool.query(
    `SELECT * FROM room_capture_frames
      WHERE capture_id IN (${ids.map(() => '?').join(',')})
        AND (frame_index = 0${selectedIds.length ? ` OR id IN (${selectedIds.map(() => '?').join(',')})` : ''})`,
    [...ids, ...selectedIds]
  );
  for (const [roomId, c] of latest) {
    const selected = frames.find((f) => f.capture_id === c.id && String(f.id) === String(c.selected_frame_id)) || null;
    const cover = selected || frames.find((f) => f.capture_id === c.id && f.frame_index === 0) || null;
    result.set(roomId, serializeCaptureSummary(c, selected, cover));
  }
  return result;
}

async function loadCaptureWithFrames(roomId, captureId = null) {
  const [rows] = await pool.query(
    captureId
      ? 'SELECT * FROM room_captures WHERE room_id = ? AND id = ? LIMIT 1'
      : 'SELECT * FROM room_captures WHERE room_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    captureId ? [roomId, captureId] : [roomId]
  );
  if (rows.length === 0) return null;
  const c = rows[0];
  const [frames] = await pool.query(
    'SELECT * FROM room_capture_frames WHERE capture_id = ? ORDER BY frame_index ASC',
    [c.id]
  );
  const selected = frames.find((f) => String(f.id) === String(c.selected_frame_id)) || null;
  return {
    ...serializeCaptureSummary(c, selected, selected || frames[0] || null),
    roomId: String(c.room_id),
    videoDurationMs: c.video_duration_ms,
    warnings: parseWarnings(c.warnings),
    frames: frames.map(serializeFrame),
  };
}

/** Deletes captures (rows + frame files). Frame files belong only to the capture. */
async function deleteCaptures(captureIds) {
  if (captureIds.length === 0) return;
  const placeholders = captureIds.map(() => '?').join(',');
  const [frames] = await pool.query(
    `SELECT image_path, preview_path FROM room_capture_frames WHERE capture_id IN (${placeholders})`,
    captureIds
  );
  await pool.query(`DELETE FROM room_captures WHERE id IN (${placeholders})`, captureIds); // frames cascade
  await Promise.all(
    frames
      .flatMap((f) => [f.image_path, f.preview_path])
      .map((p) => fs.promises.unlink(path.join(uploadRoot, path.basename(p))).catch(() => {}))
  );
}

/**
 * POST /api/rooms/:id/capture   (multipart/form-data)
 *   video  — the recorded sweep (MP4/MOV)
 *   mode   — '180' | '360'
 *   lens   — 'wide' (1×, default) | 'ultra-wide' (0.5×) — which lens recorded the video
 *   motion — JSON rotation track from the app (optional; without it angles are time-based)
 */
const createCapture = asyncHandler(async (req, res) => {
  const videoPath = req.file?.path;
  try {
    await ownedRoom(req.params.id, req.user.id);
    if (!req.file) throw new ApiError(400, 'A "video" file is required.');
    const mode = String(req.body.mode || '');
    if (mode !== '180' && mode !== '360') throw new ApiError(400, 'mode must be "180" or "360".');
    const lens = req.body.lens === 'ultra-wide' ? 'ultra-wide' : 'wide';

    let result;
    try {
      result = await processCapture({ videoPath, mode, lens, motion: req.body.motion, outputDir: uploadRoot });
    } catch (err) {
      if (err instanceof CaptureError) throw new ApiError(422, err.message, { code: err.code });
      console.error('[roomCapture] processing failed:', err);
      throw new ApiError(500, "We couldn't process this video. Please try again.");
    }

    const [previous] = await pool.query('SELECT id FROM room_captures WHERE room_id = ?', [req.params.id]);
    const conn = await pool.getConnection();
    let captureId;
    try {
      await conn.beginTransaction();
      const [insert] = await conn.query(
        `INSERT INTO room_captures
           (room_id, mode, angle_source, lens, coverage_deg, loops, frame_count, video_duration_ms, warnings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          result.mode,
          result.angleSource,
          result.lens,
          result.coverageDeg,
          result.loops,
          result.frames.length,
          result.durationMs,
          JSON.stringify(result.warnings),
        ]
      );
      captureId = insert.insertId;
      await conn.query(
        `INSERT INTO room_capture_frames
           (capture_id, frame_index, angle_deg, video_time_ms, sharpness, brightness, pitch_deg, image_path, preview_path)
         VALUES ?`,
        [
          result.frames.map((f) => [
            captureId,
            f.index,
            f.angleDeg,
            f.timeMs,
            f.sharpness,
            f.brightness,
            f.pitchDeg,
            storedPath(f.fileName),
            storedPath(f.previewFileName),
          ]),
        ]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      await Promise.all(
        result.frames
          .flatMap((f) => [f.fileName, f.previewFileName])
          .map((f) => fs.promises.unlink(path.join(uploadRoot, f)).catch(() => {}))
      );
      throw err;
    } finally {
      conn.release();
    }

    // Only after the new capture is safely stored.
    await deleteCaptures(previous.map((p) => p.id));

    res.status(201).json({ capture: await loadCaptureWithFrames(req.params.id, captureId) });
  } finally {
    if (videoPath) fs.promises.unlink(videoPath).catch(() => {});
  }
});

/** GET /api/rooms/:id/capture — the room's capture with all frames, or { capture: null }. */
const getCapture = asyncHandler(async (req, res) => {
  await ownedRoom(req.params.id, req.user.id);
  res.json({ capture: await loadCaptureWithFrames(req.params.id) });
});

/**
 * PATCH /api/rooms/:id/capture/:captureId — body { selectedFrameId: string | null }
 * "USE THIS VIEW": the frame becomes the room image for new visualizations.
 * null goes back to the room's primary photo. The room's photos are unchanged.
 */
const selectView = asyncHandler(async (req, res) => {
  await ownedRoom(req.params.id, req.user.id);
  const capture = await loadCaptureWithFrames(req.params.id, req.params.captureId);
  if (!capture) throw new ApiError(404, 'Room capture not found.');

  const raw = req.body?.selectedFrameId;
  let frameId = null;
  if (raw !== null && raw !== undefined) {
    const frame = capture.frames.find((f) => f.id === String(raw));
    if (!frame) throw new ApiError(400, 'That view does not belong to this room capture.');
    frameId = frame.id;
  }
  await pool.query('UPDATE room_captures SET selected_frame_id = ? WHERE id = ?', [frameId, capture.id]);
  res.json({ capture: await loadCaptureWithFrames(req.params.id, capture.id) });
});

/** DELETE /api/rooms/:id/capture/:captureId */
const deleteCapture = asyncHandler(async (req, res) => {
  await ownedRoom(req.params.id, req.user.id);
  const [rows] = await pool.query('SELECT id FROM room_captures WHERE id = ? AND room_id = ?', [
    req.params.captureId,
    req.params.id,
  ]);
  if (rows.length === 0) throw new ApiError(404, 'Room capture not found.');
  await deleteCaptures([rows[0].id]);
  res.status(204).end();
});

/**
 * A captured view's stored image path, if `frameId` is a frame of a capture
 * of this user's room. Used by AI Render to render on the chosen view.
 */
async function roomViewImagePath({ frameId, roomId, userId }) {
  if (!/^\d+$/.test(String(frameId || ''))) return null;
  const [rows] = await pool.query(
    `SELECT f.image_path
       FROM room_capture_frames f
       JOIN room_captures c ON c.id = f.capture_id
       JOIN rooms r ON r.id = c.room_id
      WHERE f.id = ? AND r.id = ? AND r.user_id = ?
      LIMIT 1`,
    [frameId, roomId, userId]
  );
  return rows[0]?.image_path || null;
}

module.exports = {
  createCapture,
  getCapture,
  selectView,
  deleteCapture,
  loadCaptureSummaries,
  roomViewImagePath,
};
