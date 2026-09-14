const ApiError = require('../utils/ApiError');

/**
 * Central error handler. Keeps two promises:
 *  - known ApiErrors return their status + message as-is
 *  - anything else (bugs, MySQL errors, etc.) becomes a generic 500 and is
 *    logged server-side, but the client never sees raw internals.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Uploaded file is too large.' });
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);

  return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFoundHandler };
