'use strict';

const { Worker } = require('bullmq');
const { connection, isEnabled } = require('./connection');
const { BULK_QUEUE_NAME } = require('./queue');
const config = require('../config');
const db = require('../db/pool');
const queries = require('../db/queries');
const { verify } = require('../engine');

/**
 * BullMQ worker for the "bulk-verify" queue.
 *
 * One BullMQ job == one uploaded file == one bulk_jobs row. The processor:
 *   1. Reads still-'pending' addresses from bulk_results in batches.
 *   2. Verifies each with the existing engine (SMTP + catch-all, etc.), bounded
 *      by a small concurrency AND a per-domain politeness delay so we never
 *      hammer a single mail server.
 *   3. Writes each verdict back to its bulk_results row and bumps the job's live
 *      counters so progress is observable in real time.
 *   4. Marks the job 'completed' (or 'failed', with a refund of the unprocessed
 *      portion, on unrecoverable error).
 *
 * Designed to run inside the main server process (started from server.js) but
 * could be split into its own process unchanged.
 */

// Domain-cache adapter (same one the single/batch routes inject). Lets the
// engine skip repeated DNS / catch-all probes for a domain we've already seen.
const domainCache = db.isEnabled()
  ? {
      get: (domain) => queries.getDomainCache(domain),
      set: (domain, data) => queries.setDomainCache(domain, data),
    }
  : null;

/** Promise-based sleep. */
function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Extract the lowercased domain from an address (or '' if malformed). */
function domainOf(email) {
  const at = String(email).lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

/**
 * Map an engine result's status onto the four job counters.
 * disposable addresses count as invalid; accept_all counts as catch_all.
 * @param {string} status
 * @returns {'valid'|'invalid'|'catch_all'|'unknown'}
 */
function counterBucket(status) {
  switch (status) {
    case 'valid':
      return 'valid';
    case 'invalid':
    case 'disposable':
      return 'invalid';
    case 'accept_all':
      return 'catch_all';
    default:
      return 'unknown'; // 'unknown' or anything unexpected
  }
}

/**
 * A per-domain throttling scheduler shared across the whole job.
 *
 * For each domain we track the earliest time the NEXT probe to it may start.
 * Reserving a slot for a domain pushes that time forward by perDomainDelayMs, so
 * two probes to the same domain are always spaced out — while different domains
 * proceed in parallel up to the worker's concurrency.
 */
function makeDomainThrottle(delayMs) {
  const nextAllowed = new Map();
  return {
    /** Reserve a slot for `domain`; returns ms to wait before probing it. */
    reserve(domain) {
      const now = Date.now();
      const earliest = Math.max(now, nextAllowed.get(domain) || 0);
      nextAllowed.set(domain, earliest + delayMs);
      return earliest - now;
    },
  };
}

/**
 * Run `tasks` (thunks returning promises) with a bounded number in flight.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} limit
 */
async function runPool(tasks, limit) {
  let cursor = 0;
  const workers = [];
  const n = Math.max(1, limit);
  for (let i = 0; i < n; i += 1) {
    workers.push(
      (async () => {
        while (cursor < tasks.length) {
          const idx = cursor;
          cursor += 1;
          await tasks[idx]();
        }
      })()
    );
  }
  await Promise.all(workers);
}

/**
 * Verify one address row: throttle by domain, run the engine, persist the
 * verdict. Never throws — an engine error becomes an 'unknown' verdict so a
 * single bad address can't fail the whole job. Returns the counter bucket.
 *
 * @param {{id: number, email: string}} row
 * @param {ReturnType<makeDomainThrottle>} throttle
 * @returns {Promise<'valid'|'invalid'|'catch_all'|'unknown'>}
 */
async function processRow(row, throttle) {
  const domain = domainOf(row.email);
  // Space out repeated hits to the same mail server.
  await sleep(throttle.reserve(domain));

  let result;
  try {
    result = await verify(row.email, { domainCache });
  } catch (err) {
    result = { status: 'unknown', sub_status: 'engine_error', score: 0 };
  }

  await queries.updateBulkResult(row.id, {
    status: result.status,
    sub_status: result.sub_status,
    score: result.score,
  });

  return counterBucket(result.status);
}

/**
 * The BullMQ job processor.
 * @param {import('bullmq').Job} job  job.data = { bulkJobId, userId }
 */
async function processBulkJob(job) {
  const { bulkJobId } = job.data;
  const { batchSize, concurrency, perDomainDelayMs } = config.bulk;

  await queries.markBulkJobProcessing(bulkJobId);

  const throttle = makeDomainThrottle(perDomainDelayMs);

  // Drain pending rows batch by batch. Rows leave the pending set as soon as we
  // write their verdict, so this loop naturally terminates and resumes cleanly
  // on retry (already-done rows are skipped).
  for (;;) {
    const batch = await queries.getPendingBulkResults(bulkJobId, batchSize);
    if (batch.length === 0) break;

    const deltas = { processed: 0, valid: 0, invalid: 0, catch_all: 0, unknown: 0 };

    const tasks = batch.map((row) => async () => {
      const bucket = await processRow(row, throttle);
      deltas[bucket] += 1;
      deltas.processed += 1;
    });

    await runPool(tasks, concurrency);

    // One counter update per batch keeps progress live without a write storm.
    await queries.incrementBulkJobCounters(bulkJobId, deltas);
  }

  await queries.finishBulkJob(bulkJobId, 'completed');
  return { bulkJobId, status: 'completed' };
}

let worker = null;

/**
 * Create and start the bulk-verify worker. Safe to call unconditionally — it
 * no-ops (returning null) when Redis isn't configured. Returns the Worker.
 *
 * @returns {import('bullmq').Worker|null}
 */
function startWorker() {
  if (!isEnabled()) {
    console.warn('[worker] REDIS_URL not set — bulk worker not started.');
    return null;
  }
  if (worker) return worker; // already running (idempotent)

  worker = new Worker(BULK_QUEUE_NAME, processBulkJob, {
    connection,
    // How many FILES we process at once. Per-file address concurrency + the
    // per-domain throttle are handled inside the processor.
    concurrency: parseInt(process.env.BULK_WORKER_CONCURRENCY || '2', 10),
  });

  worker.on('completed', (job) => {
    console.log(`[worker] bulk job ${job.data.bulkJobId} completed.`);
  });

  // On final failure (all attempts exhausted) mark the DB job failed and refund
  // the credits for addresses we never got to.
  worker.on('failed', async (job, err) => {
    if (!job) {
      console.error('[worker] bulk job failed (no job ref):', err && err.message);
      return;
    }
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = (job.opts && job.opts.attempts) || 1;
    console.error(
      `[worker] bulk job ${job.data.bulkJobId} attempt ${attemptsMade}/${maxAttempts} failed:`,
      err && err.message
    );
    if (attemptsMade < maxAttempts) return; // BullMQ will retry — wait it out

    try {
      const bulkJob = await queries.getBulkJobById(job.data.bulkJobId);
      await queries.finishBulkJob(job.data.bulkJobId, 'failed');
      // Refund only the unprocessed remainder (charged up front at upload).
      const remaining = await queries.countPendingBulkResults(job.data.bulkJobId);
      if (bulkJob && remaining > 0) {
        const refund = remaining * config.bulk.creditsPerEmail;
        await queries.addCredits(bulkJob.user_id, refund, 'bulk verify refund (job failed)');
        console.log(
          `[worker] refunded ${refund} credits to user ${bulkJob.user_id} for ${remaining} unprocessed addresses.`
        );
      }
    } catch (refundErr) {
      console.error('[worker] failed to mark job failed / refund:', refundErr.message);
    }
  });

  worker.on('error', (err) => {
    console.error('[worker] worker error:', err.message);
  });

  console.log('[worker] bulk-verify worker started.');
  return worker;
}

module.exports = { startWorker, processBulkJob };
