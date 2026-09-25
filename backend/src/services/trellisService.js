/**
 * TRELLIS.2 (Microsoft, MIT license) — image → 3D model (GLB). The ONLY
 * module that talks to the 3D provider.
 *
 * Runs on the public Hugging Face Space "microsoft/TRELLIS.2" (ZeroGPU). Free,
 * but meant for development: each HF account gets a small daily ZeroGPU
 * quota, and each of the two GPU steps below reserves 120s of it, so only a
 * few models fit per day.
 *
 * Talks to the Space over Gradio's HTTP queue protocol (the same one its web
 * page uses; the official JS client's streaming stalls under Node here, and
 * the simpler /call API can't share a session between steps):
 *   GET  /config                             dependency list → fn_index per api_name
 *   POST /gradio_api/upload                  multipart "files" → [server path]
 *   POST /gradio_api/queue/join              { data, fn_index, session_hash } → { event_id }
 *   GET  /gradio_api/queue/data?session_hash SSE: estimation | process_starts | process_completed …
 * The Space keeps the generated model in per-session state (checked in its
 * app.py), so every step runs in one session:
 *   preprocess_image(input)                       uses the PNG's alpha, crops/centers
 *   image_to_3d(image, seed, resolution, …)       GPU; result kept in session state
 *   extract_glb(<state>, decimation_target, texture_size)  GPU; → GLB file
 * Unlike a task API there is no job id to resume: if our server restarts
 * mid-generation, that generation is lost (productModelService marks it failed).
 */

const fs = require('fs');
const crypto = require('crypto');
const env = require('../config/env');

const SPACE_URL = 'https://microsoft-trellis-2.hf.space';
const SPACE_API = `${SPACE_URL}/gradio_api`;
const STEP_TIMEOUT_MS = 6 * 60 * 1000;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_MODEL_BYTES = 150 * 1024 * 1024;

/**
 * Settings for furniture shown on a phone. Resolution 512 instead of the
 * Space's default 1024: measured on the free ZeroGPU quota, 1024 used ~68s of
 * GPU for image_to_3d alone (512: ~40-46s for the whole model), i.e. far
 * fewer models per day, and a quota that runs out between the two steps
 * wastes the first one. 1024 may give finer thin parts — untested here; try it
 * with more quota (e.g. HF PRO). decimation/texture are the Space's minimums,
 * which keep the GLB light for a mobile WebView.
 */
const GENERATION_SETTINGS = {
  seed: 0,
  resolution: '512',
  decimation_target: 100000,
  texture_size: 1024,
};

/** The Space's own defaults for the sampler settings of /image_to_3d (from /gradio_api/info). */
const SAMPLER_DEFAULTS = [7.5, 0.7, 12, 5.0, 7.5, 0.5, 12, 3.0, 1.0, 0.0, 12, 3.0];

/** Error with a technical message (for logs) and a user-facing one. */
class ModelProviderError extends Error {
  /** @param {string|null} reason - machine-readable cause, e.g. 'quota' (daily free GPU limit reached) */
  constructor(message, userMessage = "3D preview couldn't be created.", reason = null) {
    super(message);
    this.name = 'ModelProviderError';
    this.userMessage = userMessage;
    this.reason = reason;
  }
}

function isConfigured() {
  return !!env.huggingFace.token;
}

function toProviderError(err, step) {
  if (err instanceof ModelProviderError) return err;
  const text = String(err?.message ?? err?.detail ?? err ?? 'unknown error');
  const technical = `TRELLIS.2 ${step} failed: ${text}`;
  if (/quota/i.test(text)) {
    return new ModelProviderError(technical, 'Daily free 3D limit reached — try again tomorrow.', 'quota');
  }
  if (/sleeping|building|starting|paused|not_found|runtime_error|config_error|503/i.test(text)) {
    return new ModelProviderError(technical, 'The 3D generation service is starting up. Please try again in a few minutes.');
  }
  if (/401|403|unauthori[sz]ed|invalid.*token|token.*invalid/i.test(text)) {
    return new ModelProviderError(`${technical} — check HF_TOKEN`, '3D generation is temporarily unavailable.');
  }
  if (/timed? ?out|timeout|fetch failed|network|ECONN|ENOTFOUND/i.test(text)) {
    return new ModelProviderError(technical, "3D generation couldn't be reached. Please try again.");
  }
  return new ModelProviderError(technical);
}

function authHeaders() {
  return env.huggingFace.token ? { Authorization: `Bearer ${env.huggingFace.token}` } : {};
}

/** Uploads a file to the Space; returns Gradio FileData for it. */
async function upload(filePath, fileName) {
  const form = new FormData();
  form.append('files', new Blob([await fs.promises.readFile(filePath)], { type: 'image/png' }), fileName);
  const response = await fetch(`${SPACE_API}/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`upload HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const [serverPath] = await response.json();
  return { path: serverPath, orig_name: fileName, meta: { _type: 'gradio.FileData' } };
}

/** fn_index of each named endpoint, read from the Space's config (so Space updates don't break silently). */
async function loadEndpoints() {
  const response = await fetch(`${SPACE_URL}/config`, { headers: authHeaders(), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`config HTTP ${response.status}`);
  const config = await response.json();
  const byName = {};
  (config.dependencies || []).forEach((dep, index) => {
    if (dep.api_name) byName[dep.api_name] = dep.id ?? index;
  });
  for (const name of ['preprocess_image', 'image_to_3d', 'extract_glb']) {
    if (byName[name] === undefined) throw new Error(`Space has no "${name}" endpoint (API changed?)`);
  }
  return byName;
}

/**
 * Runs one queued function in the session and resolves with its output list.
 * Reports the real queue state: 'queued' while waiting (with position), then
 * `runningStage` once the Space starts processing.
 */
async function runQueued(fnIndex, data, sessionHash, { label, runningStage, onStage }) {
  const joined = await fetch(`${SPACE_API}/queue/join`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, event_data: null, fn_index: fnIndex, trigger_id: null, session_hash: sessionHash }),
    signal: AbortSignal.timeout(60000),
  });
  if (!joined.ok) throw new Error(`${label} join HTTP ${joined.status}: ${(await joined.text()).slice(0, 200)}`);
  const { event_id: eventId } = await joined.json();

  const stream = await fetch(`${SPACE_API}/queue/data?session_hash=${sessionHash}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
  });
  if (!stream.ok) throw new Error(`${label} stream HTTP ${stream.status}`);

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const line = /^data: *(.*)$/m.exec(block)?.[1];
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.event_id && message.event_id !== eventId) continue;
      if (message.msg === 'estimation') onStage?.('queued', message.rank ?? null);
      else if (message.msg === 'process_starts') onStage?.(runningStage, null);
      else if (message.msg === 'unexpected_error') throw new Error(`${label}: ${message.message || 'unexpected error'}`);
      else if (message.msg === 'process_completed') {
        if (!message.success) {
          const error = message.output?.error ?? message.output?.title ?? 'failed';
          throw new Error(`${label}: ${typeof error === 'string' ? error : JSON.stringify(error)}`);
        }
        return message.output?.data ?? [];
      }
    }
  }
  throw new Error(`${label} ended without a result`);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ModelProviderError('TRELLIS.2 job timed out', '3D generation took too long. Please try again.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function downloadGlb(fileUrl, destPath) {
  const response = await fetch(fileUrl, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`GLB download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MODEL_BYTES) throw new Error(`GLB too large: ${buffer.length} bytes`);
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('Downloaded model is not a GLB file');
  const tmpPath = `${destPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.promises.writeFile(tmpPath, buffer);
  await fs.promises.rename(tmpPath, destPath);
  return buffer.length;
}

/**
 * Generates a 3D model from a (background-removed, transparent) product PNG
 * and saves it as a GLB at destPath.
 *
 * @param {object} params
 * @param {string} params.imagePath - absolute path of the transparent product PNG
 * @param {string} params.destPath - where to write the GLB
 * @param {(stage: 'queued'|'running'|'finishing'|'downloading', queuePosition: number|null) => void} [params.onStage]
 *   the provider's real state (queue position comes from the Space's own estimate)
 * @returns {Promise<{bytes: number}>}
 */
async function generateModel({ imagePath, destPath, onStage }) {
  // Like the Space's web page: a random session id shared by every step.
  const sessionHash = crypto.randomBytes(6).toString('hex');
  let step = 'config';
  try {
    return await withTimeout(
      (async () => {
        const fn = await loadEndpoints();

        step = 'upload';
        const image = await upload(imagePath, 'product.png');

        step = 'preprocess_image';
        const [prepared] = await runQueued(fn.preprocess_image, [image], sessionHash, { label: step });

        step = 'image_to_3d';
        await runQueued(
          fn.image_to_3d,
          [prepared, GENERATION_SETTINGS.seed, GENERATION_SETTINGS.resolution, ...SAMPLER_DEFAULTS],
          sessionHash,
          { label: step, runningStage: 'running', onStage }
        );

        step = 'extract_glb';
        // null = the session's State (the model from image_to_3d), filled in by the Space.
        const [glb] = await runQueued(
          fn.extract_glb,
          [null, GENERATION_SETTINGS.decimation_target, GENERATION_SETTINGS.texture_size],
          sessionHash,
          { label: step, runningStage: 'finishing', onStage }
        );
        if (!glb?.url) throw new Error('extract_glb returned no file');

        step = 'download';
        onStage?.('downloading', null);
        return { bytes: await downloadGlb(glb.url, destPath) };
      })(),
      JOB_TIMEOUT_MS
    );
  } catch (err) {
    throw toProviderError(err, step);
  }
}

module.exports = { isConfigured, generateModel, ModelProviderError, GENERATION_SETTINGS };
