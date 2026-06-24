'use strict';

const express = require('express');
const { verify } = require('../engine');
const { authenticateVerify } = require('./auth');
const config = require('../config');
const db = require('../db/pool');
const queries = require('../db/queries');

/**
 * API route definitions, mounted under /api/v1 by server.js.
 *
 * - /health          : public liveness probe.
 * - /verify/single   : auth'd, verify one address (+ credits + persistence when DB on).
 * - /verify/batch    : auth'd, verify up to config.batchLimit addresses (sync).
 */

const router = express.Router();

// Domain-cache adapter injected into the engine. Only wired when a database is
// configured; otherwise null and the engine runs un-cached (degraded mode).
const domainCache = db.isEnabled()
  ? {
      get: (domain) => queries.getDomainCache(domain),
      set: (domain, data) => queries.setDomainCache(domain, data),
    }
  : null;

// --- Health (no auth) ------------------------------------------------------
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- Single verification (auth required) -----------------------------------
// Accepts either an X-API-Key header or a Bearer JWT (dashboard). Either way,
// req.user is resolved and the credit-spend + result-save logic below applies.
router.post('/verify/single', authenticateVerify, async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res
        .status(400)
        .json({ error: 'missing or invalid "email" in request body' });
    }

    // Charge BEFORE verifying (only in DB mode with an authenticated user).
    // Degraded mode (no DB / no user) skips credits entirely.
    if (req.user) {
      const charged = await queries.spendCredits(
        req.user.id,
        1,
        'single verify'
      );
      if (!charged) {
        return res.status(402).json({
          error: 'insufficient credits',
        });
      }
    }

    const result = await verify(email, { domainCache });

    // Persist the result (best-effort) when we have an authenticated user.
    if (req.user) {
      try {
        await queries.saveResult(null, req.user.id, result);
      } catch (err) {
        // Don't fail the response just because persistence hiccuped.
        console.error('[verify/single] saveResult failed:', err.message);
      }
    }

    return res.json(result);
  } catch (err) {
    // Hand off to the centralized error handler (never crash).
    return next(err);
  }
});

// --- Batch verification (auth required, synchronous) -----------------------
// TODO(queue): Real bulk verification will move to a background queue/worker in
// a later chunk (jobs + polling/webhooks). This synchronous endpoint is only
// for testing and is intentionally capped at config.batchLimit addresses.
// TODO(billing): batch credit-charging + per-row persistence will be handled by
// the job/worker flow in Chunk 4B; this sync path stays lightweight for now.
router.post('/verify/batch', authenticateVerify, async (req, res, next) => {
  try {
    const { emails } = req.body || {};

    if (!Array.isArray(emails)) {
      return res
        .status(400)
        .json({ error: 'missing or invalid "emails" array in request body' });
    }

    if (emails.length === 0) {
      return res.status(400).json({ error: '"emails" array is empty' });
    }

    if (emails.length > config.batchLimit) {
      return res.status(400).json({
        error: `too many emails: max ${config.batchLimit} per batch (got ${emails.length})`,
      });
    }

    // Verify each address. We run them concurrently but bounded by the array
    // size (already capped at batchLimit). Each verify() resolves on its own,
    // so one bad address never rejects the whole batch. The domain cache is
    // shared across the batch, so repeated domains are cheap.
    const results = await Promise.all(
      emails.map((email) => verify(email, { domainCache }))
    );

    // Build the summary counts.
    const summary = {
      total: results.length,
      valid: 0,
      invalid: 0,
      accept_all: 0,
      disposable: 0,
      unknown: 0,
    };
    for (const r of results) {
      if (Object.prototype.hasOwnProperty.call(summary, r.status)) {
        summary[r.status] += 1;
      } else {
        // Any unexpected status falls into "unknown" for the summary.
        summary.unknown += 1;
      }
    }

    return res.json({ results, summary });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
