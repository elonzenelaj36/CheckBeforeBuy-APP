const path = require('path');
const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadRoot } = require('../middleware/upload');
const sharp = require('sharp');
const { detectWalls, wallForLayer } = require('../services/wallDetectionService');
const { wallQuad, wallQuadToVanishingPoint } = require('../services/wallGeometry');
const { warpLayerToQuad } = require('../services/arrangeCompositionService');
const { LENS_FOV_DEG } = require('../services/roomItemDetectionService');

/**
 * The picture products are arranged on — a room's primary photo, or one view
 * of its 180°/360° capture — and what is known about its camera.
 * @returns {Promise<{ imagePath: string, fovDeg: number|null, recordedPitchDeg: number|null, capture?: object } | null>}
 */
async function roomPicture({ roomId, userId, frameId = null }) {
  if (frameId) {
    if (!/^\d+$/.test(String(frameId))) return null;
    const [rows] = await pool.query(
      `SELECT f.capture_id, f.angle_deg, f.image_path, f.pitch_deg, c.fov_deg, c.lens
         FROM room_capture_frames f
         JOIN room_captures c ON c.id = f.capture_id
         JOIN rooms r ON r.id = c.room_id
        WHERE f.id = ? AND r.id = ? AND r.user_id = ? LIMIT 1`,
      [frameId, roomId, userId]
    );
    if (!rows.length) return null;
    const f = rows[0];
    const [frames] = await pool.query('SELECT image_path, angle_deg FROM room_capture_frames WHERE capture_id = ?', [f.capture_id]);
    return {
      imagePath: path.join(uploadRoot, path.basename(f.image_path)),
      fovDeg: f.fov_deg != null ? Number(f.fov_deg) : LENS_FOV_DEG[f.lens] || LENS_FOV_DEG.wide,
      recordedPitchDeg: f.pitch_deg != null ? Number(f.pitch_deg) : null,
      // The recording's other views: walls are checked against the whole room (wallDetectionService.alignToCapture).
      capture: {
        angleDeg: Number(f.angle_deg),
        frames: frames.map((fr) => ({ imagePath: path.join(uploadRoot, path.basename(fr.image_path)), angleDeg: Number(fr.angle_deg) })),
      },
    };
  }
  const [rows] = await pool.query(
    `SELECT p.image_path FROM room_photos p JOIN rooms r ON r.id = p.room_id
      WHERE p.room_id = ? AND r.user_id = ? ORDER BY p.is_primary DESC, p.created_at ASC LIMIT 1`,
    [roomId, userId]
  );
  if (!rows.length) return null;
  return { imagePath: path.join(uploadRoot, path.basename(rows[0].image_path)), fovDeg: null, recordedPitchDeg: null };
}

/**
 * GET /api/rooms/:id/walls?frameId=…
 * The walls of the room picture (wallDetectionService): regions, facing,
 * mountable, confidence, and the picture's camera. Analysed once per picture.
 */
const getRoomWalls = asyncHandler(async (req, res) => {
  const picture = await roomPicture({ roomId: Number(req.params.id), userId: req.user.id, frameId: req.query.frameId || null });
  if (!picture) throw new ApiError(404, 'Room picture not found.');
  res.json(await detectWalls(picture.imagePath, picture));
});

/** The preview image covers the layer's box × this, so the wall's perspective can reach past the box. */
const PREVIEW_BOX_SCALE = 1.6;
const PREVIEW_MAX_SIDE = 480;

/**
 * GET /api/rooms/:id/walls/preview?frameId&wallId&cutoutId&x&y&width&aspect
 * A wall-mounted product's Arrange preview: its real photo (cutout) drawn flat
 * on that wall, in the wall's exact perspective — the same geometry and warp
 * AI Render uses, so the preview matches the generated picture.
 * → transparent PNG covering the layer's box scaled by PREVIEW_BOX_SCALE (same centre).
 */
const getWallPreview = asyncHandler(async (req, res) => {
  const q = req.query;
  const [x, y, width, aspect] = [q.x, q.y, q.width, q.aspect].map(Number);
  if (![x, y, width, aspect].every(Number.isFinite) || width <= 0 || aspect <= 0) throw new ApiError(400, 'Invalid layer.');
  if (!/^[a-f0-9]{32}$/.test(String(q.cutoutId || ''))) throw new ApiError(400, 'Invalid cutout.');
  const cutoutPath = path.join(uploadRoot, `cutout-${q.cutoutId}.png`);
  const picture = await roomPicture({ roomId: Number(req.params.id), userId: req.user.id, frameId: q.frameId || null });
  if (!picture) throw new ApiError(404, 'Room picture not found.');
  const { camera, walls } = await detectWalls(picture.imagePath, picture);
  const wall = wallForLayer(walls, q.wallId, x, y);
  if (!wall || wall.normalDeg === null) throw new ApiError(404, 'Wall not found.');
  const meta = await sharp(cutoutPath).metadata().catch(() => null);
  if (!meta?.width) throw new ApiError(404, 'Cutout not found.');
  const objectAspect = meta.width / meta.height;

  // Same sizing as AI Render (imageGenerationService.resolveWallLayers).
  const height = (width * camera.aspect) / aspect;
  let quad = wallQuad(x, y, height, objectAspect, wall.normalDeg, camera);
  if (!quad) throw new ApiError(422, 'The wall is seen edge-on here.');
  if (wall.vp) quad = wallQuadToVanishingPoint(quad, wall.vp, camera.aspect);

  const bw = width * PREVIEW_BOX_SCALE;
  const bh = height * PREVIEW_BOX_SCALE;
  const k = PREVIEW_MAX_SIDE / Math.max(bw * camera.aspect, bh);
  const W = Math.max(1, Math.round(bw * camera.aspect * k));
  const H = Math.max(1, Math.round(bh * k));
  const warped = await warpLayerToQuad(
    {
      transform: { x: 0.5, y: 0.5, width, rotation: 0, aspect },
      quad: quad.map(([qx, qy]) => [(qx - (x - bw / 2)) / bw, (qy - (y - bh / 2)) / bh]),
      quadAspect: objectAspect,
      quadImagePath: cutoutPath,
    },
    W,
    H
  );
  const canvas = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const png = await (warped ? canvas.composite([warped]) : canvas).png().toBuffer();
  res.set('Cache-Control', 'private, max-age=3600').type('image/png').send(png);
});

module.exports = { getRoomWalls, getWallPreview, roomPicture, PREVIEW_BOX_SCALE };
