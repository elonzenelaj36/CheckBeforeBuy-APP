/**
 * MySQL connection pool (mysql2/promise).
 *
 * Every query in the app goes through this pool. Using a pool (rather than
 * one long-lived connection) lets Express handle concurrent requests safely.
 */

const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: false,
});

/**
 * Verifies the pool can actually reach MySQL. Called once at startup so we
 * fail fast (and loudly) instead of only discovering the problem on the
 * first API request.
 */
async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

module.exports = { pool, testConnection };
