'use strict';

const crypto = require('crypto');
const config = require('../config');
const db = require('../db/pool');
const queries = require('../db/queries');
const { verifyToken } = require('../auth/jwt');
const { extractBearer } = require('../auth/middleware');

/**
 * API-key authentication middleware.
 *
 * Two modes, chosen automatically:
 *
 *  1. DATABASE mode (DATABASE_URL set): the X-API-Key header is SHA-256 hashed
 *     and looked up in the api_keys table (joined to users). A matching,
 *     non-revoked key attaches `req.user` and refreshes last_used_at. No match
 *     => 401.
 *
 *  2. ENV-FALLBACK mode (no DATABASE_URL): the legacy behavior — the raw header
 *     is checked against config.apiKeys (the API_KEYS env list). If that list is
 *     also empty, auth is DISABLED (dev only). This keeps Chunk-3 tests working.
 */

/** SHA-256 hex of a string. */
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Express middleware enforcing the X-API-Key header.
 */
async function requireApiKey(req, res, next) {
  const provided = req.get('X-API-Key');

  // --- Mode 1: database-backed keys --------------------------------------
  if (db.isEnabled()) {
    if (!provided) {
      return res.status(401).json({ error: 'invalid or missing API key' });
    }
    try {
      const keyHash = sha256(provided);
      const user = await queries.getUserByApiKeyHash(keyHash);
      if (!user) {
        return res.status(401).json({ error: 'invalid or missing API key' });
      }

      // Attach the authenticated user for downstream handlers.
      req.user = user;
      req.apiKeyHash = keyHash;

      // Best-effort "last used" update — don't block the request on it.
      queries.touchApiKeyLastUsed(keyHash).catch((err) => {
        console.error('[auth] failed to update last_used_at:', err.message);
      });

      return next();
    } catch (err) {
      // DB hiccup during auth — surface as 500 via the error handler.
      return next(err);
    }
  }

  // --- Mode 2: env-based fallback (no database) --------------------------
  if (config.apiKeys.length === 0) {
    // No DB and no configured keys => auth disabled (dev convenience).
    req.authDisabled = true;
    return next();
  }

  if (!provided || !config.apiKeys.includes(provided)) {
    return res.status(401).json({ error: 'invalid or missing API key' });
  }

  return next();
}

/**
 * authenticateVerify — auth for the verification endpoints, accepting EITHER an
 * X-API-Key header (existing behavior) OR a Bearer JWT (dashboard sessions).
 *
 * Resolution order (DB mode):
 *   1. If X-API-Key is present, resolve it against api_keys (as before).
 *   2. Else if a Bearer token is present, verify the JWT and load the user.
 *   3. Else 401.
 * On success, attaches a normalized `req.user = { id, email, role }` so the
 * shared credit-spend + result-save logic in the route works for both paths.
 *
 * Degraded mode (no DB): preserves the legacy env-API_KEYS fallback (or
 * auth-disabled) behavior; JWTs can't be resolved without the DB.
 */
async function authenticateVerify(req, res, next) {
  const apiKey = req.get('X-API-Key');
  const bearer = extractBearer(req);

  // --- DB mode -----------------------------------------------------------
  if (db.isEnabled()) {
    try {
      // 1. API key takes precedence (keeps existing integrations working).
      if (apiKey) {
        const keyHash = sha256(apiKey);
        const user = await queries.getUserByApiKeyHash(keyHash);
        if (!user) {
          return res.status(401).json({ error: 'invalid or missing API key' });
        }
        // Suspended/banned accounts may hold a valid key but must not verify.
        if (user.status !== 'active') {
          return res.status(403).json({ error: 'account suspended' });
        }
        req.user = { id: user.id, email: user.email, role: user.role };
        req.apiKeyHash = keyHash;
        queries.touchApiKeyLastUsed(keyHash).catch((err) => {
          console.error('[auth] failed to update last_used_at:', err.message);
        });
        return next();
      }

      // 2. Bearer JWT (dashboard session).
      if (bearer) {
        let decoded;
        try {
          decoded = verifyToken(bearer);
        } catch (err) {
          return res.status(401).json({ error: 'invalid or expired token' });
        }
        // Confirm the user still exists.
        const user = await queries.getUserById(decoded.id);
        if (!user) {
          return res.status(401).json({ error: 'invalid or expired token' });
        }
        // Suspended/banned accounts keep a valid token but cannot verify.
        if (user.status !== 'active') {
          return res.status(403).json({ error: 'account suspended' });
        }
        req.user = { id: user.id, email: user.email, role: user.role };
        return next();
      }

      // 3. No credentials at all.
      return res
        .status(401)
        .json({ error: 'missing credentials: provide X-API-Key or Bearer token' });
    } catch (err) {
      return next(err);
    }
  }

  // --- Degraded mode (no DB): legacy env-API_KEYS fallback ---------------
  if (config.apiKeys.length === 0) {
    req.authDisabled = true; // auth disabled (dev) — no user, no credits
    return next();
  }
  if (!apiKey || !config.apiKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'invalid or missing API key' });
  }
  return next();
}

/**
 * Log a one-time warning at startup describing the active auth mode.
 */
function warnIfAuthDisabled() {
  if (db.isEnabled()) {
    console.log('[auth] database-backed API keys enabled.');
    return;
  }
  if (config.apiKeys.length === 0) {
    console.warn(
      '[auth] WARNING: no DATABASE_URL and API_KEYS is empty — authentication ' +
        'is DISABLED. All requests will be allowed. Set DATABASE_URL (and seed ' +
        'a key) or API_KEYS for production.'
    );
  } else {
    console.warn(
      '[auth] no DATABASE_URL — using env API_KEYS fallback ' +
        `(${config.apiKeys.length} key(s)).`
    );
  }
}

module.exports = { requireApiKey, authenticateVerify, warnIfAuthDisabled, sha256 };
