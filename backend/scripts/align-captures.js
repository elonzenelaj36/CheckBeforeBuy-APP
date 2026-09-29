/**
 * Aligns EXISTING 180°/360° room captures with their pictures (new captures
 * are aligned automatically on upload — see captureAlignmentService.js).
 *
 *   node scripts/align-captures.js           # every capture
 *   node scripts/align-captures.js 28 31     # only these capture ids
 *
 * Per capture: measures the field of view, re-times each view's angle from the
 * pictures (the rotation sensor's angle is kept in gyro_angle_deg, so running
 * it again starts from the sensor angles, not from a previous correction),
 * flags neighbours that don't line up, and recomputes the room directions of
 * detected items (room_item_observations) with the new angles and field of view.
 * Files are never touched.
 */

require('dotenv').config();
const path = require('path');
const { pool } = require('../src/db/connection');
const { uploadRoot } = require('../src/middleware/upload');
const { alignCapture } = require('../src/services/captureAlignmentService');

const DEG = Math.PI / 180;
const wrap360 = (a) => ((a % 360) + 360) % 360;
const directionAt = (x, frameDeg, fovDeg) => frameDeg + Math.atan((x - 0.5) * 2 * Math.tan((fovDeg / 2) * DEG)) / DEG;

async function alignOne(capture) {
  const [frames] = await pool.query(
    'SELECT id, angle_deg, gyro_angle_deg, preview_path FROM room_capture_frames WHERE capture_id = ? ORDER BY frame_index ASC',
    [capture.id]
  );
  const sensor = frames.map((f) => Number(f.gyro_angle_deg ?? f.angle_deg));
  const result = await alignCapture(
    frames.map((f, i) => ({ angleDeg: sensor[i], path: path.join(uploadRoot, path.basename(f.preview_path)) }))
  );
  if (!result.ok) {
    console.log(`capture ${capture.id}: unchanged (${result.reason})`);
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE room_captures SET fov_deg = ? WHERE id = ?', [result.fovDeg, capture.id]);
    for (let i = 0; i < frames.length; i += 1) {
      await conn.query('UPDATE room_capture_frames SET angle_deg = ?, gyro_angle_deg = ?, align_score = ? WHERE id = ?', [
        result.angles[i],
        sensor[i],
        i < result.pairScores.length ? result.pairScores[i] : null,
        frames[i].id,
      ]);
    }
    // Detected items: same boxes, directions from the corrected angles and field of view.
    const angleOf = new Map(frames.map((f, i) => [String(f.id), result.angles[i]]));
    const [obs] = await conn.query(
      `SELECT id, capture_frame_id, box_x1, box_x2 FROM room_item_observations
        WHERE capture_frame_id IN (${frames.map(() => '?').join(',')})`,
      frames.map((f) => f.id)
    );
    for (const o of obs) {
      const frameDeg = angleOf.get(String(o.capture_frame_id));
      const left = directionAt(Number(o.box_x1), frameDeg, result.fovDeg);
      const right = directionAt(Number(o.box_x2), frameDeg, result.fovDeg);
      const mid = (left + right) / 2;
      await conn.query('UPDATE room_item_observations SET direction_deg = ?, half_width_deg = ? WHERE id = ?', [
        capture.loops ? wrap360(mid) : mid,
        (right - left) / 2,
        o.id,
      ]);
    }
    await conn.commit();
    const snaps = result.pairScores.filter((s) => s === 0).length;
    console.log(
      `capture ${capture.id}: field of view ${result.fovDeg}° (lens ${capture.lens || 'wide'}), ${frames.length} views re-timed, ` +
        `${snaps} neighbour pair(s) will snap, ${obs.length} item observation(s) updated`
    );
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

(async () => {
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  const [captures] = await pool.query(
    `SELECT id, lens, loops FROM room_captures${ids.length ? ` WHERE id IN (${ids.map(() => '?').join(',')})` : ''}`,
    ids
  );
  for (const c of captures) await alignOne(c);
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
