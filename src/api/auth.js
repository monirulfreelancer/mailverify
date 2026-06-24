'use strict';

const config = require('../config');

/**
 * API-key authentication middleware.
 *
 * Checks the X-API-Key request header against the allowed keys from config
 * (sourced from the API_KEYS env var).
 *
 * Dev convenience: if no keys are configured, authentication is DISABLED and
 * every request is allowed. A warning is logged once at startup (see
 * warnIfAuthDisabled) and the request is annotated so handlers know.
 */

/**
 * Express middleware enforcing the X-API-Key header.
 */
function requireApiKey(req, res, next) {
  // No keys configured => auth disabled (local/dev mode).
  if (config.apiKeys.length === 0) {
    req.authDisabled = true;
    return next();
  }

  const provided = req.get('X-API-Key');

  if (!provided || !config.apiKeys.includes(provided)) {
    return res.status(401).json({ error: 'invalid or missing API key' });
  }

  return next();
}

/**
 * Log a one-time warning at startup if auth is turned off.
 */
function warnIfAuthDisabled() {
  if (config.apiKeys.length === 0) {
    console.warn(
      '[auth] WARNING: API_KEYS is empty — authentication is DISABLED. ' +
        'All requests will be allowed. Set API_KEYS for production.'
    );
  }
}

module.exports = { requireApiKey, warnIfAuthDisabled };
