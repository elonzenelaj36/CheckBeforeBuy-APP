const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Requires a valid `Authorization: Bearer <token>` header. On success,
 * attaches `req.user = { id, email }` for downstream handlers.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Missing or invalid Authorization header.');
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired token.');
  }
});

module.exports = { requireAuth };
