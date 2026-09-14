/**
 * Multer config for image uploads (product photos, room photos).
 *
 * Files are written to disk under `UPLOAD_DIR` (default: backend/uploads),
 * which is served statically at /uploads. Only the relative path is ever
 * stored in MySQL — see utils/imageUrl.js for turning that into a URL.
 *
 * This is intentionally a simple local-disk implementation for development.
 * Swapping it for cloud storage (S3/Cloudinary/etc.) later only means
 * changing this file and imageUrl.js — nothing else in the app needs to
 * know where images physically live.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');

const uploadRoot = path.isAbsolute(env.uploadDir)
  ? env.uploadDir
  : path.join(__dirname, '..', '..', env.uploadDir);

fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadRoot);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error('Unsupported image type. Use JPEG, PNG, WEBP, or HEIC.'));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

/** Relative path (as stored in MySQL) for a file multer just saved. */
function relativeUploadPath(file) {
  return `/${env.uploadDir}/${path.basename(file.path)}`;
}

module.exports = { upload, uploadRoot, relativeUploadPath };
