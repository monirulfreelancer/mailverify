'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * JWT signing / verification.
 *
 * The secret comes from JWT_SECRET. Behavior when it is unset:
 *   - production (NODE_ENV=production): log a clear error and fall back to a
 *     RANDOM per-boot secret. This deliberately invalidates tokens across
 *     restarts so the misconfiguration is obvious and cannot rely on a known
 *     default — set JWT_SECRET to fix it.
 *   - otherwise (dev/test): warn and use a fixed insecure dev default so local
 *     development just works.
 */

const DEV_DEFAULT_SECRET = 'dev-insecure-secret-change-me';
const TOKEN_TTL = process.env.JWT_TTL || '7d';

let SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[jwt] ERROR: JWT_SECRET is not set in production. Using a random per-boot ' +
        'secret — issued tokens will NOT survive restarts. Set JWT_SECRET.'
    );
    SECRET = crypto.randomBytes(32).toString('hex');
  } else {
    console.warn(
      '[jwt] WARNING: JWT_SECRET not set — using an insecure dev default. ' +
        'Do NOT use this in production.'
    );
    SECRET = DEV_DEFAULT_SECRET;
  }
}

/**
 * Sign a JWT for the given payload.
 * @param {object} payload  e.g. { id, email, role }
 * @param {object} [options] passed through to jsonwebtoken (e.g. { expiresIn })
 * @returns {string} signed token
 */
function signToken(payload, options = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL, ...options });
}

/**
 * Verify a JWT. Throws if invalid/expired (callers should catch).
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken, TOKEN_TTL };
