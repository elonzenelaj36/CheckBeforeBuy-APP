const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { toPublicUser } = require('./authController');

const getMe = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);

  if (rows.length === 0) {
    throw new ApiError(404, 'User not found.');
  }

  res.json({ user: toPublicUser(rows[0]) });
});

module.exports = { getMe };
