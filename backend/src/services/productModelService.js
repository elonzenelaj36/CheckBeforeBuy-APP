/**
 * 3D models of product photos — persistence + background generation.
 *
 * Credit/quota protection: a model is identified by (user, source_hash),
 * where source_hash is the content hash of the product's background-removed
 * cutout (uploads/cutout-<hash>.png). The UNIQUE key on that pair means a
 * photo can only ever start ONE generation — repeated requests (re-renders,
 * navigation, re-adding the same photo, app restarts) get the existing row
 * back. A failed model is only regenerated when the caller explicitly asks
 * (retry: true).
 *
 * Generation (TRELLIS.2, see trellisService.js) runs here on the server, not
 * in the app, so it completes even if the app is closed. Jobs run one at a
 * time: the free GPU quota is small, and parallel jobs would only fail
 * together. A job lives in this process — if the server restarts mid-job,
 * the row is marked failed the next time it's asked for (retry restarts it).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db/connection');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { uploadRoot } = require('../middleware/upload');
const { toAbsoluteUrl } = require('../utils/imageUrl');
const trellis = require('./trellisService');

const PROVIDER = 'trellis';
const INTERRUPTED_AFTER_MS = 15000;

/** Row ids with a generation running or waiting in this process. */
const activeJobs = new Set();
/** Serializes generations (one at a time). */
let jobChain = Promise.resolve();

function serialize(row) {
  return {
    id: String(row.id),
    status: row.status, // processing | ready | failed
    // Real state while processing: starting | queued | running | finishing | downloading
    stage: row.status === 'processing' ? row.provider_status || 'starting' : null,
    progress: row.progress ?? null,
    modelUrl: toAbsoluteUrl(row.model_path),
    message: row.error_message || null,
  };
}

async function findRow(where, params) {
  const [rows] = await pool.query(`SELECT * FROM product_models WHERE ${where} LIMIT 1`, params);
  return rows[0] || null;
}

async function markFailed(id, userMessage, technical) {
  console.error(`[productModel] #${id} failed: ${technical || userMessage}`);
  await pool.query(
    "UPDATE product_models SET status = 'failed', provider_status = NULL, error_message = ? WHERE id = ? AND status = 'processing'",
    [String(userMessage).slice(0, 500), id]
  );
}

async function setStage(id, stage) {
  await pool.query("UPDATE product_models SET provider_status = ? WHERE id = ? AND status = 'processing'", [stage, id]);
}

async function generate(id, sourceHash, imagePath) {
  const fileName = `model-${sourceHash}-${crypto.randomBytes(4).toString('hex')}.glb`;
  let lastStage = null;
  try {
    const { bytes } = await trellis.generateModel({
      imagePath,
      destPath: path.join(uploadRoot, fileName),
      onStage: (stage) => {
        if (stage === lastStage) return;
        lastStage = stage;
        setStage(id, stage).catch(() => {});
      },
    });
    await pool.query(
      "UPDATE product_models SET status = 'ready', provider_status = NULL, model_path = ?, error_message = NULL WHERE id = ?",
      [`/${env.uploadDir}/${fileName}`, id]
    );
    console.log(`[productModel] #${id} ready: ${fileName} (${Math.round(bytes / 1024)} KB)`);
  } catch (err) {
    await markFailed(id, err instanceof trellis.ModelProviderError ? err.userMessage : "3D preview couldn't be created.", err.message);
  }
}

/** Queues a generation for this row (at most one per row, one at a time overall). */
function startJob(id, sourceHash, imagePath) {
  if (activeJobs.has(id)) return;
  activeJobs.add(id);
  console.log(`[productModel] #${id} queued for ${PROVIDER}`);
  jobChain = jobChain
    .then(() => generate(id, sourceHash, imagePath))
    .catch((err) => console.error(`[productModel] #${id} job crashed:`, err))
    .finally(() => activeJobs.delete(id));
}

/**
 * Returns the model for this cutout, starting generation only if this user
 * has never generated one for it (or retry is requested after a failure).
 */
async function requestModel({ userId, sourceHash, retry = false }) {
  if (!/^[a-f0-9]{32}$/.test(sourceHash || '')) throw new ApiError(400, 'A valid cutoutId is required.');
  const cutoutPath = path.join(uploadRoot, `cutout-${sourceHash}.png`);
  if (!fs.existsSync(cutoutPath)) throw new ApiError(404, 'Product cutout not found. Please add the product again.');

  const existing = await findRow('user_id = ? AND source_hash = ?', [userId, sourceHash]);
  if (existing) {
    const wantsRetry = retry && existing.status === 'failed';
    if (!wantsRetry) return getModel({ userId, id: existing.id });
    if (!trellis.isConfigured()) throw new ApiError(503, '3D generation is not configured.', { code: 'not_configured' });
    // Claim the retry atomically so two taps can't start two tasks.
    const [claim] = await pool.query(
      `UPDATE product_models SET status = 'processing', provider_task_id = NULL, provider_status = 'starting',
         progress = NULL, model_path = NULL, error_message = NULL
       WHERE id = ? AND status = 'failed'`,
      [existing.id]
    );
    if (claim.affectedRows === 1) startJob(existing.id, sourceHash, cutoutPath);
    return serialize(await findRow('id = ?', [existing.id]));
  }

  if (!trellis.isConfigured()) throw new ApiError(503, '3D generation is not configured.', { code: 'not_configured' });

  let id;
  try {
    const [insert] = await pool.query(
      "INSERT INTO product_models (user_id, source_hash, status, provider, provider_status) VALUES (?, ?, 'processing', ?, 'starting')",
      [userId, sourceHash, PROVIDER]
    );
    id = insert.insertId;
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    // A concurrent request for the same photo won the race — use its row.
    return serialize(await findRow('user_id = ? AND source_hash = ?', [userId, sourceHash]));
  }

  startJob(id, sourceHash, cutoutPath);
  return serialize(await findRow('id = ?', [id]));
}

async function getModel({ userId, id }) {
  const row = await findRow('id = ? AND user_id = ?', [id, userId]);
  if (!row) throw new ApiError(404, '3D model not found.');

  // Processing, no job in this process and no recent update → the server
  // restarted mid-job. (The grace period covers a concurrent request that
  // just inserted the row and is about to start its job.)
  const stale = Date.now() - new Date(row.updated_at).getTime() > INTERRUPTED_AFTER_MS;
  if (row.status === 'processing' && !activeJobs.has(row.id) && stale) {
    await markFailed(row.id, "3D preview couldn't be created. Please try again.", 'interrupted (server restarted during generation)');
    return serialize(await findRow('id = ?', [row.id]));
  }
  return serialize(row);
}

module.exports = { requestModel, getModel };
