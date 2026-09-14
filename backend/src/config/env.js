/**
 * Central place that loads and validates environment variables.
 * Every other module reads configuration from here instead of
 * touching `process.env` directly.
 */

require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  return value;
}

const env = {
  nodeEnv: required('NODE_ENV', 'development'),
  port: Number(required('PORT', '5000')),
  corsOrigin: required('CORS_ORIGIN', '*'),

  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(required('DB_PORT', '3306')),
    name: required('DB_NAME', 'check_before_buy'),
    user: required('DB_USER', 'root'),
    password: required('DB_PASSWORD', ''),
  },

  jwt: {
    secret: required('JWT_SECRET', ''),
    expiresIn: required('JWT_EXPIRES_IN', '7d'),
  },

  ai: {
    apiKey: required('AI_API_KEY', ''),
    model: required('AI_MODEL', 'claude-sonnet-5'),
  },

  imageAi: {
    provider: required('IMAGE_AI_PROVIDER', ''),
    apiKey: required('IMAGE_AI_API_KEY', ''),
  },

  uploadDir: required('UPLOAD_DIR', 'uploads'),
  publicBaseUrl: required('PUBLIC_BASE_URL', `http://localhost:${required('PORT', '5000')}`),
};

if (env.nodeEnv === 'production' && !env.jwt.secret) {
  throw new Error('JWT_SECRET must be set in production. See .env.example.');
}

if (!env.jwt.secret) {
  // Development fallback so the server can still boot; auth tokens will not
  // survive a server restart with a consistent secret across environments.
  env.jwt.secret = 'dev-only-insecure-secret-change-me';
  // eslint-disable-next-line no-console
  console.warn(
    '[env] JWT_SECRET is not set. Using an insecure development default. ' +
      'Set JWT_SECRET in backend/.env before deploying.'
  );
}

module.exports = env;
