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
const ApiError = require('../utils/ApiError');

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

/**
 * Room-capture videos (see services/roomCaptureService.js). Separate from the
 * image uploader so image limits/types stay exactly as they were. The file
 * is only kept while it is processed; the frames are what gets stored.
 */
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/3gpp', 'video/x-m4v']);

const videoUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, uploadRoot);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname) || '.mp4';
      cb(null, `capture-src-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  fileFilter(req, file, cb) {
    if (!VIDEO_MIME_TYPES.has(file.mimetype)) {
      cb(new ApiError(415, 'Unsupported video format. Please record the room with the app (MP4 or MOV).'));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 150 * 1024 * 1024, fieldSize: 2 * 1024 * 1024 }, // 150MB video, 2MB rotation track
});

/** Relative path (as stored in MySQL) for a file multer just saved. */
function relativeUploadPath(file) {
  return `/${env.uploadDir}/${path.basename(file.path)}`;
}

module.exports = { upload, videoUpload, uploadRoot, relativeUploadPath };
