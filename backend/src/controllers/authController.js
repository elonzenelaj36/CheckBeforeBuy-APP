const { pool } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/token');
const { requireString, requireEmail, requirePassword } = require('../utils/validate');

function toPublicUser(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  };
}

const register = asyncHandler(async (req, res) => {
  const name = requireString(req.body.name, 'Name', { maxLength: 120 });
  const email = requireEmail(req.body.email);
  const password = requirePassword(req.body.password);

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length > 0) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);

  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, passwordHash]
  );

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
  const user = toPublicUser(rows[0]);
  const token = signToken(user);

  res.status(201).json({ user, token });
});

const login = asyncHandler(async (req, res) => {
  const email = requireEmail(req.body.email);
  const password = requireString(req.body.password, 'Password');

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  if (rows.length === 0) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const isValid = await verifyPassword(password, rows[0].password_hash);
  if (!isValid) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const user = toPublicUser(rows[0]);
  const token = signToken(user);

  res.json({ user, token });
});

module.exports = { register, login, toPublicUser };
