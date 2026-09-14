/**
 * A known, intentional API error (bad input, not found, unauthorized, ...).
 * Anything else that throws is treated as an unexpected 500 and never
 * leaks its raw message (e.g. a MySQL error) to the client.
 */
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = ApiError;
