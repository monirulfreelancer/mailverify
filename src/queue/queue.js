'use strict';

const { Queue } = require('bullmq');
const { connection, isEnabled } = require('./connection');

/**
 * The "bulk-verify" BullMQ queue.
 *
 * Producers (the upload route) add one job per uploaded file carrying
 * { bulkJobId, userId }; the worker (src/queue/worker.js) consumes them.
 *
 * When REDIS_URL is unset the queue is null — callers must guard with
 * isQueueEnabled() (or queue == null) and respond 503 instead of enqueuing.
 */

// Shared queue name, exported so the worker references the exact same string.
const BULK_QUEUE_NAME = 'bulk-verify';

let bulkQueue = null;

if (isEnabled()) {
  bulkQueue = new Queue(BULK_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      // One automatic retry on unexpected failure, then leave it failed.
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      // Keep finished jobs out of Redis — the source of truth is Postgres.
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });

  bulkQueue.on('error', (err) => {
    console.error('[queue] bulk-verify queue error:', err.message);
  });
}

/**
 * Is the bulk queue available (i.e. REDIS_URL configured)?
 * @returns {boolean}
 */
function isQueueEnabled() {
  return bulkQueue !== null;
}

module.exports = { bulkQueue, BULK_QUEUE_NAME, isQueueEnabled };
