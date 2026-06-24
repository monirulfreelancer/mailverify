'use strict';

const express = require('express');
const { verify } = require('../engine');
const { requireApiKey } = require('./auth');
const config = require('../config');

/**
 * API route definitions, mounted under /api/v1 by server.js.
 *
 * - /health          : public liveness probe.
 * - /verify/single   : auth'd, verify one address.
 * - /verify/batch    : auth'd, verify up to config.batchLimit addresses (sync).
 */

const router = express.Router();

// --- Health (no auth) ------------------------------------------------------
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- Single verification (auth required) -----------------------------------
router.post('/verify/single', requireApiKey, async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res
        .status(400)
        .json({ error: 'missing or invalid "email" in request body' });
    }

    const result = await verify(email);
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
router.post('/verify/batch', requireApiKey, async (req, res, next) => {
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
    // so one bad address never rejects the whole batch.
    const results = await Promise.all(emails.map((email) => verify(email)));

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
