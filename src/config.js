'use strict';

/**
 * Central configuration, read once from environment variables.
 *
 * The SMTP_* vars are consumed directly by the engine (src/engine/smtp.js);
 * we surface them here only so they are documented in one place and logged at
 * startup. Changing them here has no effect unless the engine reads them — it
 * reads process.env, so just set the env vars.
 */

/**
 * Parse a comma-separated list into a trimmed, non-empty array.
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseList(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const config = {
  // HTTP port for the Express server.
  port: parseInt(process.env.PORT || '3000', 10),

  // Allowed API keys (comma-separated). Empty => auth disabled (dev only).
  apiKeys: parseList(process.env.API_KEYS),

  // SMTP settings — read by the engine from env; mirrored here for visibility.
  smtp: {
    heloDomain: process.env.SMTP_HELO_DOMAIN || 'verify.mailverify.app',
    fromAddress: process.env.SMTP_FROM_ADDRESS || 'probe@verify.mailverify.app',
    timeoutMs: parseInt(process.env.SMTP_TIMEOUT_MS || '10000', 10),
  },

  // Max emails accepted by the synchronous batch endpoint.
  batchLimit: 100,

  // Allowed CORS origins for the frontend (comma-separated FRONTEND_URL).
  // Empty => fall back to localhost dev origins (with a warning at startup).
  frontendUrls: parseList(process.env.FRONTEND_URL),

  // Free credits granted on signup (mirrors queries.SIGNUP_FREE_CREDITS).
  signupFreeCredits: parseInt(process.env.SIGNUP_FREE_CREDITS || '25', 10),
};

module.exports = config;
