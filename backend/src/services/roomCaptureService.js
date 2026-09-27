/**
 * Spatial room capture: turns a slow 180°/360° room sweep (video + the
 * phone's rotation track) into a set of real viewpoints for the room viewer.
 *
 * No AI, no interpolation, no new viewpoints — only real video frames:
 *   1. ffmpeg (ffmpeg-static) decodes the video into candidate frames
 *      (CANDIDATE_FPS per second, longest side ≤ FULL_SIDE).
 *   2. Every candidate gets a video timestamp, and — when the phone's
 *      rotation track is usable — the angle the phone faced at that moment.
 *      Without a usable track, angles assume a steady turn over the chosen
 *      range (angle_source 'time') and the capture is marked approximate.
 *   3. The chosen range is split into slots (LENS_PROFILES[lens].slotDeg); each slot keeps its
 *      best candidate (sharpness × exposure × turning-speed penalty).
 *      Near-duplicates collapse into one slot; empty slots stay empty
 *      (nothing is invented).
 *   4. The capture is rejected with a clear message when it covers too
 *      little, misses too many slots, or was turned too fast.
 *
 * Rotation track (sent by the app, see src/services/roomCaptureMotion.ts):
 *   { v: 1, available: boolean, reason?: string, stopAtMs: number,
 *     samples: [[tMs, yawDeg], ...] }
 *   tMs is measured from the moment the app asked the camera to record;
 *   stopAtMs is when it asked it to stop. yawDeg is the phone's turn around
 *   the vertical (gravity) axis, integrated from the gyroscope.
 *   The camera reports no "recording started" event, so the video is
 *   aligned to the track by its END: the video's first frame is taken to be
 *   at stopAtMs − videoDuration (camera start-up delay is larger and more
 *   variable than the stop delay). Expect roughly ±0.2 s of misalignment,
 *   i.e. a few degrees at a slow turn.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');

/**
 * Per-lens capture rules. The app records with the 1× 'wide' lens, or on
 * iPhones with the physical 0.5× 'ultra-wide' lens when it has one. The
 * ultra-wide sees roughly twice as much of the room per frame, so:
 *   - slotDeg: views can be further apart for the same overlap between neighbours;
 *   - fastTurnDegS / tooFastDegS: the same turning speed smears about half as
 *     many pixels, so the user may turn faster before frames blur;
 *   - maxGapDeg: the largest stretch of directions without a view that the
 *     viewer can still bridge (~60% of the lens's field of view, so the two
 *     views on either side still overlap). It also sets how close to a full
 *     turn a 360° capture must get (360 − maxGapDeg) — a target, not an exact number.
 * The app's matching guidance lives in src/services/roomCaptures.ts (CAPTURE_LENSES).
 */
const LENS_PROFILES = {
  wide: { slotDeg: 5, fastTurnDegS: 40, tooFastDegS: 45, maxGapDeg: 25 },
  'ultra-wide': { slotDeg: 8, fastTurnDegS: 60, tooFastDegS: 70, maxGapDeg: 45 },
};
const CANDIDATE_FPS = 10;
const FULL_SIDE = 1280;
const PREVIEW_SIDE = 640;
const ANALYSIS_SIDE = 320;
const MIN_DURATION_MS = 3000;
const MAX_DURATION_MS = 120000;
/** 180° mode: accept from here (the target is 180°, not an exact requirement). */
const MIN_COVERAGE_180 = 150;
/** 180° mode: views are kept up to here, so a slightly longer turn (185°, 190°) loses nothing. */
const MAX_RANGE_180 = 200;
/** More empty slots than this → the user turned too fast (or the video dropped frames). */
const MAX_MISSING_SLOT_RATIO = 0.25;
const MIN_FRAMES = 8;
/** Track must have a sample at least this often to be trusted. */
const MAX_SAMPLE_GAP_MS = 350;
const FFMPEG_TIMEOUT_MS = 180000;

class CaptureError extends Error {
  /** @param {string} code machine-readable reason  @param {string} message shown to the user */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── Rotation track ───────────────────────────────────────────────────────────

/** Validates the app's JSON rotation track. Returns null when there is none. */
function parseMotion(raw) {
  if (raw == null || raw === '') return null;
  let m;
  try {
    m = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const samples = Array.isArray(m.samples)
    ? m.samples
        .filter((s) => Array.isArray(s) && s.length >= 2 && s.every((n) => Number.isFinite(Number(n))))
        .map(([t, yaw]) => [Number(t), Number(yaw)])
        .sort((a, b) => a[0] - b[0])
    : [];
  return {
    available: m.available !== false && samples.length > 0,
    reason: typeof m.reason === 'string' ? m.reason.slice(0, 200) : null,
    stopAtMs: Number.isFinite(Number(m.stopAtMs)) ? Number(m.stopAtMs) : null,
    samples,
  };
}

/** Linear interpolation of the yaw track at motion time t (clamped to the ends). */
function yawAt(samples, t) {
  if (t <= samples[0][0]) return samples[0][1];
  const last = samples[samples.length - 1];
  if (t >= last[0]) return last[1];
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const [t0, y0] = samples[lo];
  const [t1, y1] = samples[hi];
  return t1 === t0 ? y0 : y0 + ((y1 - y0) * (t - t0)) / (t1 - t0);
}

/**
 * Maps video time → angle using the rotation track, or explains why the
 * track can't be used. Angles grow in the direction the user mostly turned
 * and start at 0 at the video's first frame.
 * @returns {{ ok: true, angleAt: (tv:number)=>number, speedAt: (tv:number)=>number, coverage: number, offsetMs: number }
 *         | { ok: false, reason: string }}
 */
function buildAngleTrack(motion, durationMs) {
  if (!motion) return { ok: false, reason: 'No rotation data was sent.' };
  if (!motion.available) return { ok: false, reason: motion.reason || 'Rotation sensor unavailable on this device.' };
  const { samples } = motion;
  if (samples.length < 10 || motion.stopAtMs == null) return { ok: false, reason: 'Too little rotation data.' };

  const offsetMs = Math.min(Math.max(motion.stopAtMs - durationMs, 0), motion.stopAtMs);
  const start = offsetMs;
  const end = offsetMs + durationMs;
  if (samples[0][0] > start + MAX_SAMPLE_GAP_MS || samples[samples.length - 1][0] < end - MAX_SAMPLE_GAP_MS) {
    return { ok: false, reason: 'Rotation data does not cover the whole video.' };
  }
  for (let i = 1; i < samples.length; i += 1) {
    const [t0] = samples[i - 1];
    const [t1] = samples[i];
    if (t1 > start && t0 < end && t1 - t0 > MAX_SAMPLE_GAP_MS) {
      return { ok: false, reason: 'Rotation data has gaps.' };
    }
  }

  const yaw0 = yawAt(samples, start);
  // Direction = the way the user turned furthest from the start.
  let maxPos = 0;
  let maxNeg = 0;
  for (const [t, yaw] of samples) {
    if (t < start || t > end) continue;
    maxPos = Math.max(maxPos, yaw - yaw0);
    maxNeg = Math.min(maxNeg, yaw - yaw0);
  }
  const dir = maxPos >= -maxNeg ? 1 : -1;
  const coverage = dir > 0 ? maxPos : -maxNeg;

  const angleAt = (tv) => dir * (yawAt(samples, tv + offsetMs) - yaw0);
  const speedAt = (tv) => {
    const h = 100; // ms, ± around tv
    return Math.abs(yawAt(samples, tv + offsetMs + h) - yawAt(samples, tv + offsetMs - h)) / ((2 * h) / 1000);
  };
  return { ok: true, angleAt, speedAt, coverage, offsetMs };
}

// ── Frame selection (pure) ───────────────────────────────────────────────────

/** 1 at a slow turn, falling off above the lens's fastTurnDegS (motion blur grows with speed). */
function speedFactor(speed, fastTurnDegS) {
  if (speed == null) return 1;
  return 1 / (1 + (speed / fastTurnDegS) ** 2);
}

/** Frames that are nearly black or blown out lose to a well exposed neighbour. */
function exposureFactor(brightness) {
  return brightness < 20 || brightness > 240 ? 0.5 : 1;
}

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Decides the capture's angular range and picks one frame per slot.
 * @param {Array<{timeMs:number, angle:number, speed:number|null, sharpness:number, brightness:number}>} candidates
 * @param {{ mode: '180'|'360', angleSource: 'gyro'|'time', coverage: number, lens?: 'wide'|'ultra-wide' }} info
 * @returns {{ frames: Array<object>, rangeDeg: number, loops: boolean, warnings: string[] }}
 * @throws {CaptureError}
 */
function selectFrames(candidates, { mode, angleSource, coverage, lens = 'wide' }) {
  const profile = LENS_PROFILES[lens] || LENS_PROFILES.wide;
  const slotDeg = profile.slotDeg;
  const target = Number(mode);
  const warnings = [];
  const approx = Math.round(coverage);

  if (angleSource === 'gyro') {
    const minCoverage = minCoverageFor(mode, lens);
    if (coverage < minCoverage) {
      if (mode === '360') {
        throw new CaptureError(
          'INCOMPLETE_360',
          `The 360° turn wasn't completed — we measured about ${approx}° (about ${minCoverage}° is enough). Keep ` +
            "turning until you're back near where you started, or record a 180° capture instead."
        );
      }
      throw new CaptureError(
        'INSUFFICIENT_COVERAGE',
        `Only about ${approx}° of the room was captured. Turn further, until the progress bar turns green ` +
          `(about ${minCoverage}°).`
      );
    }
    if (mode === '180' && coverage > MAX_RANGE_180) {
      warnings.push(`You turned about ${approx}°; the first ${MAX_RANGE_180}° were kept.`);
    }
  } else {
    warnings.push(
      'Rotation data was not available, so view angles are estimated from time and assume you turned at a steady ' +
        'speed. They may be off.'
    );
  }

  // 360 loops only when the gyro confirmed the full turn; the time estimate can't prove it.
  const loops = mode === '360' && angleSource === 'gyro';
  const rangeDeg = loops
    ? 360
    : angleSource === 'gyro'
      ? Math.min(coverage, mode === '180' ? MAX_RANGE_180 : 360)
      : target;
  const slotCount = loops ? Math.round(360 / slotDeg) : Math.floor(rangeDeg / slotDeg) + 1;
  const upper = rangeDeg + slotDeg / 2;

  const best = new Map();
  for (const c of candidates) {
    if (c.angle < -slotDeg / 2 || c.angle >= upper) continue;
    let slot = Math.round(c.angle / slotDeg);
    if (loops) slot %= slotCount;
    if (slot < 0 || slot >= slotCount) continue;
    // Mild preference for the slot centre keeps the views evenly spaced (smoother swiping).
    const d = Math.abs(c.angle - slot * slotDeg) % 360;
    const offCentre = Math.min(Math.min(d, 360 - d), slotDeg / 2) / (slotDeg / 2);
    const score = c.sharpness * exposureFactor(c.brightness) * speedFactor(c.speed, profile.fastTurnDegS) * (1 - 0.3 * offCentre);
    const prev = best.get(slot);
    if (!prev || score > prev.score) best.set(slot, { ...c, score, slot });
  }

  // Directions the user actually turned through. A 360° capture that stopped a
  // little short leaves a known gap before the start; it isn't "missing".
  const coveredSlots = loops ? Math.min(slotCount, Math.floor(Math.min(coverage, 360) / slotDeg) + 1) : slotCount;
  const missing = Math.max(0, coveredSlots - best.size);
  if (best.size < MIN_FRAMES) {
    throw new CaptureError(
      'INSUFFICIENT_FRAMES',
      'Not enough usable views could be extracted. Record again, turning slowly and steadily.'
    );
  }
  if (missing / coveredSlots > MAX_MISSING_SLOT_RATIO) {
    throw new CaptureError(
      'COVERAGE_GAPS',
      `Parts of the room are missing (${Math.round((missing / coveredSlots) * 100)}% of directions have no clear view). ` +
        'Turn more slowly and steadily.'
    );
  }

  const frames = [...best.values()]
    .map((f) => ({ ...f, angle: loops ? ((f.angle % 360) + 360) % 360 : Math.max(0, f.angle) }))
    .sort((a, b) => a.angle - b.angle);

  // Useful coverage: no stretch of the room so wide that neighbouring views stop overlapping
  // (for a 360° capture this includes the stretch from the last view back to the first).
  const gaps = frames.slice(1).map((f, i) => ({ from: frames[i].angle, size: f.angle - frames[i].angle }));
  if (loops) gaps.push({ from: frames[frames.length - 1].angle, size: frames[0].angle + 360 - frames[frames.length - 1].angle });
  const widest = gaps.reduce((a, b) => (b.size > a.size ? b : a), { from: 0, size: 0 });
  // + one slot: each view sits up to half a slot from its slot centre.
  if (widest.size > profile.maxGapDeg + slotDeg) {
    throw new CaptureError(
      'COVERAGE_GAPS',
      `Part of the room has no clear view (about ${Math.round(widest.size)}° starting at ` +
        `${Math.round(widest.from)}°). Record again, turning slowly and steadily.`
    );
  }

  // Turning speed is a physical measure of motion blur (the gyro knows it; pixels can't prove it).
  if (angleSource === 'gyro') {
    const fast = frames.filter((f) => f.speed != null && f.speed > profile.tooFastDegS).length;
    if (fast / frames.length > 0.4) {
      const [s180, s360] = lens === 'ultra-wide' ? [12, 25] : [18, 35];
      throw new CaptureError(
        'TOO_FAST',
        `You turned too fast, so most views are blurry. Record again and take about ${s180} seconds for 180° ` +
          `(${s360} seconds for 360°).`
      );
    }
  }
  // Relative blur: a frame much softer than its neighbours (same scene, similar texture).
  const blurry = frames.filter((f, i) => {
    const near = frames.filter((g, j) => j !== i && Math.abs(g.angle - f.angle) <= 20).map((g) => g.sharpness);
    return near.length >= 2 && f.sharpness < 0.55 * median(near);
  }).length;
  if (blurry / frames.length > 0.35) {
    throw new CaptureError('BLURRY', 'Most views are blurry. Record again, holding the phone steady and turning slowly.');
  }
  if (blurry > 0) warnings.push(`${blurry} view${blurry === 1 ? '' : 's'} may look slightly blurry.`);
  if (missing > 0) warnings.push(`${missing} direction${missing === 1 ? '' : 's'} had no clear frame and ${missing === 1 ? 'is' : 'are'} skipped.`);
  if (median(frames.map((f) => f.brightness)) < 35) warnings.push('The video is very dark; views may be hard to see.');

  return { frames, rangeDeg, loops, warnings };
}

/**
 * How far the user must turn for the capture to be accepted. 180°: 150°.
 * 360°: close enough that the gap back to the start is one the viewer can
 * bridge (360 − the lens's maxGapDeg: 335° at 1×, 315° at 0.5×).
 */
function minCoverageFor(mode, lens = 'wide') {
  const profile = LENS_PROFILES[lens] || LENS_PROFILES.wide;
  return mode === '360' ? 360 - profile.maxGapDeg : MIN_COVERAGE_180;
}

// ── Video decoding (ffmpeg) ─────────────────────────────────────────────────

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-20000);
    });
    const timer = setTimeout(() => proc.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/**
 * Decodes the video into JPEG candidates, CANDIDATE_FPS per second, longest
 * side ≤ FULL_SIDE, honouring the video's rotation metadata.
 * @returns {Promise<{ durationMs: number, files: Array<{ file: string, timeMs: number }> }>}
 */
async function extractCandidates(videoPath, dir) {
  const { code, stderr } = await runFfmpeg([
    '-hide_banner', '-nostats', '-threads', '2',
    '-i', videoPath,
    '-an',
    '-vf', `fps=${CANDIDATE_FPS},scale=${FULL_SIDE}:${FULL_SIDE}:force_original_aspect_ratio=decrease`,
    '-q:v', '3',
    path.join(dir, 'c_%05d.jpg'),
  ]);
  const files = (await fs.promises.readdir(dir)).filter((f) => /^c_\d+\.jpg$/.test(f)).sort();
  if (code !== 0 || files.length === 0) {
    console.warn('[roomCapture] ffmpeg failed:', stderr.split('\n').slice(-4).join(' | '));
    throw new CaptureError('UNSUPPORTED_VIDEO', "We couldn't read this video. Please record it again in the app.");
  }
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationMs = match
    ? Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000)
    : Math.round((files.length / CANDIDATE_FPS) * 1000);
  return {
    durationMs,
    files: files.map((f, i) => ({ file: path.join(dir, f), timeMs: Math.round((i * 1000) / CANDIDATE_FPS) })),
  };
}

/** Laplacian sharpness + mean brightness on a small greyscale copy (same size for every frame). */
async function analyzeFrame(file) {
  const small = await sharp(file)
    .resize(ANALYSIS_SIDE, ANALYSIS_SIDE, { fit: 'inside' })
    .greyscale()
    .toBuffer();
  const stats = await sharp(small).stats();
  return { sharpness: stats.sharpness, brightness: stats.channels[0].mean };
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.videoPath - uploaded video (deleted by the caller)
 * @param {'180'|'360'} params.mode
 * @param {'wide'|'ultra-wide'} [params.lens] - lens that recorded the video (default 'wide')
 * @param {unknown} params.motion - raw rotation track (JSON string or object)
 * @param {string} params.outputDir - where final frames are written (uploads/)
 * @returns {Promise<{ mode, lens, angleSource, coverageDeg, loops, durationMs, warnings: string[],
 *   frames: Array<{ index, angleDeg, timeMs, sharpness, brightness, fileName, previewFileName }> }>}
 * @throws {CaptureError} for anything the user can fix by recording again
 */
async function processCapture({ videoPath, mode, motion, outputDir, lens = 'wide' }) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cbb-capture-'));
  const written = [];
  try {
    const { durationMs, files } = await extractCandidates(videoPath, tmp);
    if (durationMs < MIN_DURATION_MS) {
      throw new CaptureError('TOO_SHORT', 'The video is too short. Turn slowly — about 20 seconds for 180°.');
    }
    if (durationMs > MAX_DURATION_MS) {
      throw new CaptureError('TOO_LONG', 'The video is too long (2 minutes at most). Please record again.');
    }

    const track = buildAngleTrack(parseMotion(motion), durationMs);
    const angleSource = track.ok ? 'gyro' : 'time';
    if (!track.ok) console.warn(`[roomCapture] using time-based angles: ${track.reason}`);

    const candidates = [];
    for (const { file, timeMs } of files) {
      const quality = await analyzeFrame(file);
      candidates.push({
        file,
        timeMs,
        angle: track.ok ? track.angleAt(timeMs) : (timeMs / durationMs) * Number(mode),
        speed: track.ok ? track.speedAt(timeMs) : null,
        ...quality,
      });
    }

    const coverage = track.ok ? track.coverage : Number(mode);
    const selection = selectFrames(candidates, { mode, angleSource, coverage, lens });

    const key = crypto.randomBytes(8).toString('hex');
    const frames = [];
    for (let i = 0; i < selection.frames.length; i += 1) {
      const f = selection.frames[i];
      const fileName = `capture-${key}-${String(i).padStart(3, '0')}.jpg`;
      const previewFileName = `capture-${key}-${String(i).padStart(3, '0')}-p.jpg`;
      await fs.promises.copyFile(f.file, path.join(outputDir, fileName));
      written.push(fileName);
      await sharp(f.file)
        .resize(PREVIEW_SIDE, PREVIEW_SIDE, { fit: 'inside' })
        .jpeg({ quality: 78 })
        .toFile(path.join(outputDir, previewFileName));
      written.push(previewFileName);
      frames.push({
        index: i,
        angleDeg: Math.round(f.angle * 100) / 100,
        timeMs: f.timeMs,
        sharpness: Math.round(f.sharpness * 1000) / 1000,
        brightness: Math.round(f.brightness * 10) / 10,
        fileName,
        previewFileName,
      });
    }

    console.log(
      `[roomCapture] ${mode}° capture (${lens} lens): ${durationMs} ms video, ${files.length} candidates → ${frames.length} views, ` +
        `angles from ${angleSource}${track.ok ? ` (turned ${Math.round(track.coverage)}°, video offset ${track.offsetMs} ms)` : ''}`
    );
    return {
      mode,
      lens,
      angleSource,
      coverageDeg: Math.round(selection.rangeDeg * 10) / 10,
      loops: selection.loops,
      durationMs,
      warnings: selection.warnings,
      frames,
    };
  } catch (err) {
    await Promise.all(written.map((f) => fs.promises.unlink(path.join(outputDir, f)).catch(() => {})));
    throw err;
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  processCapture,
  CaptureError,
  // exported for tests
  parseMotion,
  buildAngleTrack,
  selectFrames,
  minCoverageFor,
  LENS_PROFILES,
};
