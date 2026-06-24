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

/**
 * requireAdmin — gate a route to admin users only.
 *
 * Runs AFTER requireUser, so req.authUser is already populated from the verified
 * JWT. Responds 403 (not 401) when a valid session simply lacks the admin role,
 * to distinguish "not logged in" from "not allowed".
 */
function requireAdmin(req, res, next) {
  if (!req.authUser) {
    // Defensive: should never happen if requireUser ran first.
    return res.status(401).json({ error: 'authentication required' });
  }
  if (req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'admin access required' });
  }
  return next();
}

/**
 * requireManagerOrAdmin — gate a route to managers or admins.
 *
 * Same contract as requireAdmin: runs after requireUser, returns 403 when the
 * authenticated user's role is neither 'manager' nor 'admin'.
 */
function requireManagerOrAdmin(req, res, next) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'authentication required' });
  }
  if (req.authUser.role !== 'admin' && req.authUser.role !== 'manager') {
    return res.status(403).json({ error: 'manager or admin access required' });
  }
  return next();
}

module.exports = {
  requireUser,
  extractBearer,
  requireAdmin,
  requireManagerOrAdmin,
};
