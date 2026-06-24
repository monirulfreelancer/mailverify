'use strict';

const bcrypt = require('bcryptjs');

/**
 * Password hashing helpers (bcryptjs).
 *
 * We use a cost factor of 10 — a sensible balance between security and latency
 * for an API login path.
 */

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password.
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
