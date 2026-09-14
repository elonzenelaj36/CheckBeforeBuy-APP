/**
 * Images are stored in MySQL as relative paths (e.g. "/uploads/abc.jpg"),
 * never as blobs. This turns a stored path into an absolute URL the mobile
 * app can load directly, using PUBLIC_BASE_URL from the environment.
 */

const env = require('../config/env');

function toAbsoluteUrl(relativePath) {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const base = env.publicBaseUrl.replace(/\/$/, '');
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${path}`;
}

module.exports = { toAbsoluteUrl };
