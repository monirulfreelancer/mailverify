'use strict';

const IORedis = require('ioredis');

/**
 * Shared Redis connection for BullMQ (queue + worker).
 *
 * Like the Postgres pool (src/db/pool.js), this is created lazily and ONLY when
 * REDIS_URL is set. When it is missing the bulk-verification feature runs in a
 * "disabled" state: the queue/worker are never created and the HTTP endpoints
 * return 503 rather than crashing the process.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connection (it manages
 * blocking commands itself); using the default would make BullMQ throw.
 */

let connection = null;

if (process.env.REDIS_URL) {
  connection = new IORedis(process.env.REDIS_URL, {
    // Required by BullMQ — do not change.
    maxRetriesPerRequest: null,
    // Keep trying to (re)connect rather than giving up after the first failure.
    enableReadyCheck: false,
  });

  // A connection-level error should be logged, not crash the server. ioredis
  // emits 'error' on transient network blips and keeps retrying on its own.
  connection.on('error', (err) => {
    console.error('[queue] redis connection error:', err.message);
  });
} else {
  console.warn(
    '[queue] REDIS_URL is not set — bulk verification is DISABLED. ' +
      'Bulk endpoints will return 503 until REDIS_URL is configured.'
  );
}

/**
 * Is the queue/Redis configured and available?
 * @returns {boolean}
 */
function isEnabled() {
  return connection !== null;
}

module.exports = { connection, isEnabled };
