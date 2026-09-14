const ApiError = require('./ApiError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireString(value, fieldName, { minLength = 1, maxLength = 1000 } = {}) {
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new ApiError(400, `${fieldName} is required.`);
  }
  if (value.trim().length > maxLength) {
    throw new ApiError(400, `${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

function requireEmail(value) {
  const email = requireString(value, 'Email', { maxLength: 190 }).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new ApiError(400, 'Email is not valid.');
  }
  return email;
}

function requirePassword(value) {
  if (typeof value !== 'string' || value.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters.');
  }
  return value;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new ApiError(400, 'Expected a number.');
  }
  return num;
}

module.exports = { requireString, requireEmail, requirePassword, optionalNumber };
