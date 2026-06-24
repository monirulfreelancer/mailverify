'use strict';

const { verifyToken } = require('./jwt');
const db = require('../db/pool');

/**
 * requireUser — JWT session auth for the dashboard/account endpoints.
 *
 * Reads a Bearer token from the Authorization header, verifies it, and attaches
 * req.authUser = { id, email, role }. Returns:
 *   - 503 if no database is configured (account auth requires the DB).
 *   - 401 if the token is missing, malformed, invalid, or expired.
 */

/**
 * Extract a Bearer token from the Authorization header, or null.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractBearer(req) {
  const header = req.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Express middleware enforcing a valid JWT session.
 */
function requireUser(req, res, next) {
  // Account/session features need persistence; fail clearly without a DB.
  if (!db.isEnabled()) {
    return res.status(503).json({
      error: 'account features require a configured database',
    });
  }

  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'missing or invalid authorization token' });
  }

  try {
    const decoded = verifyToken(token);
    req.authUser = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
    return next();
  } catch (err) {
    // Invalid signature, expired, malformed, etc.
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

module.exports = { requireUser, extractBearer };
