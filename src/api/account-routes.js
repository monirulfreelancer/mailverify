'use strict';

const express = require('express');
const db = require('../db/pool');
const queries = require('../db/queries');
const { hashPassword, verifyPassword } = require('../auth/password');
const { signToken } = require('../auth/jwt');
const { requireUser } = require('../auth/middleware');

/**
 * Auth + account routes (Chunk 5A), mounted under /api/v1 by server.js:
 *   POST   /auth/signup
 *   POST   /auth/login
 *   GET    /auth/me                 (requireUser)
 *   GET    /account/credits         (requireUser)
 *   GET    /account/usage           (requireUser)
 *   GET    /account/history         (requireUser)
 *   GET    /account/api-keys        (requireUser)
 *   POST   /account/api-keys        (requireUser)
 *   DELETE /account/api-keys/:id    (requireUser)
 *
 * All of these need persistence; if no database is configured they return 503.
 */

const router = express.Router();

// Pragmatic email check for signup (the engine does deeper validation at verify
// time; here we just reject obvious junk before creating an account).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// History pagination defaults/caps.
const HISTORY_DEFAULT_LIMIT = 25;
const HISTORY_MAX_LIMIT = 100;

/** Guard: account features require a database. Responds 503 and returns false. */
function ensureDb(res) {
  if (!db.isEnabled()) {
    res.status(503).json({ error: 'account features require a configured database' });
    return false;
  }
  return true;
}

/** Build the public-facing user + balance payload. */
async function userWithBalance(userId, fallback) {
  const user = (await queries.getUserById(userId)) || fallback;
  const balance = await queries.getCreditBalance(userId);
  return { user, credits: balance };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// POST /auth/signup  { email, password }
router.post('/auth/signup', async (req, res, next) => {
  try {
    if (!ensureDb(res)) return;

    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'a valid "email" is required' });
    }
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `"password" is required and must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const normEmail = email.trim().toLowerCase();

    // Reject duplicates up front.
    const existing = await queries.getUserByEmail(normEmail);
    if (existing) {
      return res.status(409).json({ error: 'an account with that email already exists' });
    }

    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = await queries.createUser(normEmail, passwordHash);
    } catch (err) {
      // Handle a race where the email was taken between the check and insert.
      if (err && err.code === '23505') {
        return res.status(409).json({ error: 'an account with that email already exists' });
      }
      throw err;
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return res.status(201).json({ token, user });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/login  { email, password }
router.post('/auth/login', async (req, res, next) => {
  try {
    if (!ensureDb(res)) return;

    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: '"email" and "password" are required' });
    }

    const normEmail = String(email).trim().toLowerCase();
    const row = await queries.getUserByEmail(normEmail);

    // Use the same generic message whether the email or password is wrong, to
    // avoid leaking which emails have accounts.
    const ok = row && (await verifyPassword(password, row.password_hash));
    if (!ok) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    if (row.status !== 'active') {
      return res.status(403).json({ error: 'account is not active' });
    }

    const user = { id: row.id, email: row.email, role: row.role, status: row.status };
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return res.json({ token, user });
  } catch (err) {
    return next(err);
  }
});

// GET /auth/me
router.get('/auth/me', requireUser, async (req, res, next) => {
  try {
    const payload = await userWithBalance(req.authUser.id, req.authUser);
    if (!payload.user) {
      return res.status(404).json({ error: 'user not found' });
    }
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

// GET /account/credits
router.get('/account/credits', requireUser, async (req, res, next) => {
  try {
    const balance = await queries.getCreditBalance(req.authUser.id);
    return res.json({ credits: balance });
  } catch (err) {
    return next(err);
  }
});

// GET /account/usage
router.get('/account/usage', requireUser, async (req, res, next) => {
  try {
    const stats = await queries.getUserStats(req.authUser.id);
    return res.json(stats);
  } catch (err) {
    return next(err);
  }
});

// GET /account/history?limit=&offset=
router.get('/account/history', requireUser, async (req, res, next) => {
  try {
    // Parse + clamp pagination params.
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = HISTORY_DEFAULT_LIMIT;
    if (limit > HISTORY_MAX_LIMIT) limit = HISTORY_MAX_LIMIT;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const results = await queries.getRecentResults(req.authUser.id, limit, offset);
    return res.json({ results, limit, offset, count: results.length });
  } catch (err) {
    return next(err);
  }
});

// GET /account/api-keys
router.get('/account/api-keys', requireUser, async (req, res, next) => {
  try {
    const keys = await queries.listApiKeys(req.authUser.id);
    return res.json({ api_keys: keys });
  } catch (err) {
    return next(err);
  }
});

// POST /account/api-keys  { name }
router.post('/account/api-keys', requireUser, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    const created = await queries.createApiKeyForUser(
      req.authUser.id,
      typeof name === 'string' ? name.trim() : null
    );

    // The raw key is returned exactly once — make that explicit to the client.
    return res.status(201).json({
      id: created.id,
      name: created.name,
      created_at: created.created_at,
      api_key: created.rawKey,
      note: 'Store this key now — it will not be shown again.',
    });
  } catch (err) {
    return next(err);
  }
});

// DELETE /account/api-keys/:id
router.delete('/account/api-keys/:id', requireUser, async (req, res, next) => {
  try {
    const keyId = parseInt(req.params.id, 10);
    if (!Number.isFinite(keyId)) {
      return res.status(400).json({ error: 'invalid api key id' });
    }

    const revoked = await queries.revokeApiKey(req.authUser.id, keyId);
    if (!revoked) {
      return res.status(404).json({ error: 'api key not found' });
    }
    return res.json({ revoked: true, id: keyId });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
