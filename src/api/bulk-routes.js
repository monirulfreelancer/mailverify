'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const db = require('../db/pool');
const queries = require('../db/queries');
const { authenticateVerify } = require('./auth');
const { extractEmails } = require('./bulk-extract');
const { bulkQueue, isQueueEnabled } = require('../queue/queue');

/**
 * Bulk verification routes, mounted under /api/v1 by server.js:
 *   POST /bulk/upload              — upload a .csv/.txt, reserve credits, enqueue.
 *   GET  /bulk/jobs                — list the caller's bulk jobs.
 *   GET  /bulk/jobs/:id            — one job's live status/progress.
 *   GET  /bulk/jobs/:id/download   — stream the job's results as CSV.
 *
 * Auth accepts either an X-API-Key header or a Bearer JWT (same as the verify
 * endpoints). Everything here needs BOTH a database (persistence) and Redis (the
 * queue); when either is missing we respond 503 rather than crashing.
 */

const router = express.Router();

// In-memory upload: files are small (≤ ~a few MB for 50k addresses) and we parse
// them immediately, so there's no need to touch disk. The size limit is a coarse
// guard; the real cap is enforced on the extracted address count below.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

/**
 * Guard for every bulk endpoint: requires a configured database, a configured
 * queue (Redis), and an authenticated user. Returns false (after responding) if
 * any precondition is unmet.
 */
function ensureBulkAvailable(req, res) {
  if (!db.isEnabled()) {
    res.status(503).json({ error: 'bulk verification requires a configured database' });
    return false;
  }
  if (!isQueueEnabled()) {
    res.status(503).json({ error: 'bulk temporarily unavailable' });
    return false;
  }
  if (!req.user || !req.user.id) {
    // authenticateVerify only omits req.user in degraded (no-DB) mode, which the
    // check above already covers — but guard anyway so we never run unscoped.
    res.status(401).json({ error: 'authentication required for bulk verification' });
    return false;
  }
  return true;
}

/** CSV-escape one field (quote if it contains comma, quote, or newline). */
function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ---------------------------------------------------------------------------
// POST /bulk/upload  (multipart, field "file")
// ---------------------------------------------------------------------------
router.post('/bulk/upload', authenticateVerify, (req, res, next) => {
  // Run multer manually so we can turn its errors into clean JSON responses
  // instead of letting them bubble to the generic 500 handler.
  upload.single('file')(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        const msg =
          uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'file too large'
            : `upload error: ${uploadErr.message}`;
        return res.status(400).json({ error: msg });
      }

      if (!ensureBulkAvailable(req, res)) return;

      if (!req.file || !req.file.buffer || req.file.size === 0) {
        return res.status(400).json({ error: 'no file uploaded (use multipart field "file")' });
      }

      const name = req.file.originalname || '';
      if (!/\.(csv|txt)$/i.test(name)) {
        return res.status(400).json({ error: 'unsupported file type — upload a .csv or .txt file' });
      }

      // --- Parse + clean the address list --------------------------------
      const { emails, duplicates, invalid } = extractEmails(req.file.buffer, name);

      if (emails.length === 0) {
        return res.status(400).json({
          error: 'no valid email addresses found in the file',
          duplicates_removed: duplicates,
          invalid_skipped: invalid,
        });
      }

      const max = config.bulk.maxEmails;
      if (emails.length > max) {
        return res.status(400).json({
          error: `too many emails: max ${max} per upload (found ${emails.length} unique valid addresses)`,
        });
      }

      const userId = req.user.id;
      const need = emails.length * config.bulk.creditsPerEmail;

      // --- Credit check (report have-vs-need before charging) ------------
      const balance = await queries.getCreditBalance(userId);
      if (balance < need) {
        return res.status(402).json({
          error: 'insufficient credits',
          credits_available: balance,
          credits_required: need,
        });
      }

      // --- Reserve credits up front (atomic) -----------------------------
      // Charging now (rather than as the worker runs) prevents two concurrent
      // uploads from both passing the balance check and overspending.
      const charged = await queries.spendCredits(userId, need, 'bulk verify reservation');
      if (!charged) {
        // Lost a race against another concurrent spend — balance moved.
        return res.status(402).json({
          error: 'insufficient credits',
          credits_available: await queries.getCreditBalance(userId),
          credits_required: need,
        });
      }

      // --- Create the job + seed pending result rows ---------------------
      let job;
      try {
        job = await queries.createBulkJob(userId, name, emails.length, need);
        await queries.insertBulkResults(job.id, emails);
      } catch (err) {
        // Persisting the job failed after we charged — refund so we don't eat
        // the user's credits for nothing.
        await queries.addCredits(userId, need, 'bulk verify refund (job create failed)').catch(() => {});
        throw err;
      }

      // --- Enqueue the background job ------------------------------------
      try {
        await bulkQueue.add(
          'verify',
          { bulkJobId: job.id, userId },
          { jobId: `bulk-${job.id}` } // idempotent id; prevents duplicate enqueues
        );
      } catch (err) {
        // Couldn't enqueue — refund and mark the job failed so it isn't orphaned
        // in 'queued' forever.
        await queries.finishBulkJob(job.id, 'failed').catch(() => {});
        await queries.addCredits(userId, need, 'bulk verify refund (enqueue failed)').catch(() => {});
        return res.status(503).json({ error: 'bulk temporarily unavailable' });
      }

      return res.status(202).json({
        bulkJobId: job.id,
        totalEmails: emails.length,
        creditsCharged: need,
        duplicates_removed: duplicates,
        invalid_skipped: invalid,
        status: job.status,
      });
    } catch (err) {
      return next(err);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /bulk/jobs  — list caller's jobs (most recent first)
// ---------------------------------------------------------------------------
router.get('/bulk/jobs', authenticateVerify, async (req, res, next) => {
  try {
    if (!ensureBulkAvailable(req, res)) return;
    const jobs = await queries.listBulkJobs(req.user.id);
    return res.json({ jobs });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /bulk/jobs/:id  — single job status/progress (owner only)
// ---------------------------------------------------------------------------
router.get('/bulk/jobs/:id', authenticateVerify, async (req, res, next) => {
  try {
    if (!ensureBulkAvailable(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'invalid job id' });
    }
    const job = await queries.getBulkJob(req.user.id, id);
    if (!job) {
      return res.status(404).json({ error: 'bulk job not found' });
    }
    return res.json({ job });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /bulk/jobs/:id/download  — stream results as CSV (owner only)
// ---------------------------------------------------------------------------
router.get('/bulk/jobs/:id/download', authenticateVerify, async (req, res, next) => {
  try {
    if (!ensureBulkAvailable(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'invalid job id' });
    }
    const job = await queries.getBulkJob(req.user.id, id);
    if (!job) {
      return res.status(404).json({ error: 'bulk job not found' });
    }

    const rows = await queries.getBulkResults(id);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bulk-${id}-results.csv"`
    );
    // Surface a hint when the job hasn't finished — the CSV still streams what
    // has been verified so far (partial download allowed).
    if (job.status !== 'completed') {
      res.setHeader('X-Job-Status', job.status);
      res.setHeader('X-Job-Note', 'partial results — job not yet completed');
    }

    res.write('email,status,sub_status,score\n');
    for (const r of rows) {
      res.write(
        [csvField(r.email), csvField(r.status), csvField(r.sub_status), csvField(r.score)].join(',') +
          '\n'
      );
    }
    return res.end();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
