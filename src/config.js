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

// Default manual-payment bank details (overridable via PAY_BANK_DETAILS env).
const DEFAULT_BANK_DETAILS = {
  bank_name: 'First Century Bank',
  address: '1731 N Elm St, Commerce, GA 30529, USA',
  swift: 'FCNSUS32',
  routing: '061120084',
  account_number: '4015474546031',
  account_type: 'CHECKING',
  beneficiary: 'Monirul Islam',
};

/**
 * Bank details may be supplied as JSON (parsed into an object) or as a plain
 * multiline string (returned as-is). Falls back to the built-in default object.
 * @param {string|undefined} raw
 * @returns {object|string}
 */
function parseBankDetails(raw) {
  if (!raw || !raw.trim()) return DEFAULT_BANK_DETAILS;
  try {
    return JSON.parse(raw);
  } catch (_) {
    // Not JSON — treat it as a human-readable multiline string.
    return raw;
  }
}

const DEFAULT_PAY_NOTE =
  'Send the exact amount to the number/account shown above, then submit this ' +
  'request with your sender number and transaction ID. An admin will verify ' +
  'and credit your account, usually within a few hours.';

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

  // Redis connection string for the BullMQ bulk-verify queue. Empty => bulk
  // verification is disabled (endpoints return 503, worker never starts).
  redisUrl: process.env.REDIS_URL || '',

  // Background bulk-verification tuning.
  bulk: {
    // Hard cap on addresses accepted in a single upload.
    maxEmails: parseInt(process.env.BULK_MAX_EMAILS || '50000', 10),
    // Credits charged per address (reserved up front at upload).
    creditsPerEmail: 1,
    // How many addresses the worker pulls from the DB per batch.
    batchSize: parseInt(process.env.BULK_BATCH_SIZE || '200', 10),
    // How many addresses are verified concurrently at any moment.
    concurrency: parseInt(process.env.BULK_CONCURRENCY || '5', 10),
    // Minimum gap between two probes to the SAME domain (politeness throttle),
    // so we never hammer one mail server.
    perDomainDelayMs: parseInt(process.env.BULK_PER_DOMAIN_DELAY_MS || '2000', 10),
  },

  // Manual payment / top-up instructions shown to customers. Read from env so
  // they can be changed without code edits. No external gateway is involved —
  // customers send money manually and an admin verifies + approves.
  payments: {
    bkashNumber: process.env.PAY_BKASH_NUMBER || '+8801710363553',
    rocketNumber: process.env.PAY_ROCKET_NUMBER || '+8801710363553',
    nagadNumber: process.env.PAY_NAGAD_NUMBER || '+8801710363553',
    bankDetails: parseBankDetails(process.env.PAY_BANK_DETAILS),
    note: process.env.PAY_NOTE || DEFAULT_PAY_NOTE,
  },
};

module.exports = config;
