'use strict';

const express = require('express');
const config = require('../config');
const queries = require('../db/queries');
const { requireUser } = require('../auth/middleware');

/**
 * Manual payment / credit top-up routes (customer-facing), mounted under
 * /api/v1/payments by server.js. No external gateway — the customer sends money
 * manually (bKash / Rocket / bank transfer), submits a request here, and an
 * admin/manager later verifies + approves it (see admin-routes.js) which credits
 * their account.
 *
 *   GET  /payments/packages   (requireUser)  active credit bundles
 *   GET  /payments/methods    (requireUser)  manual payment instructions
 *   POST /payments/requests   (requireUser)  submit a top-up request
 *   GET  /payments/requests   (requireUser)  the user's own requests
 *
 * requireUser already returns 503 when no database is configured.
 */

const router = express.Router();

// Allowed manual payment methods.
const PAYMENT_METHODS = ['bkash', 'rocket', 'bank'];

// Light rate-limit: a user may not stack more than this many pending requests.
const MAX_PENDING_REQUESTS = 5;

/** Trim a value to a non-empty string, or return null. */
function cleanStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// GET /payments/packages  — active credit bundles
// ---------------------------------------------------------------------------
router.get('/packages', requireUser, async (req, res, next) => {
  try {
    const packages = await queries.listActivePackages();
    return res.json({ packages });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /payments/methods  — manual payment instructions (from config/env)
// ---------------------------------------------------------------------------
router.get('/methods', requireUser, (req, res) => {
  const { bkashNumber, rocketNumber, bankDetails, note } = config.payments;
  return res.json({
    methods: PAYMENT_METHODS,
    bkash: { number: bkashNumber },
    rocket: { number: rocketNumber },
    bank: bankDetails,
    note,
  });
});

// ---------------------------------------------------------------------------
// POST /payments/requests  — submit a manual top-up request
//   body { package_id?, method, amount, credits, sender_info, transaction_id, note? }
// ---------------------------------------------------------------------------
router.post('/requests', requireUser, async (req, res, next) => {
  try {
    const body = req.body || {};
    const method = typeof body.method === 'string' ? body.method.trim() : '';

    if (!PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({
        error: `"method" must be one of: ${PAYMENT_METHODS.join(', ')}`,
      });
    }

    const senderInfo = cleanStr(body.sender_info);
    if (!senderInfo) {
      return res.status(400).json({
        error: '"sender_info" is required (your bKash/Rocket number or bank reference)',
      });
    }
    const transactionId = cleanStr(body.transaction_id);
    if (!transactionId) {
      return res.status(400).json({ error: '"transaction_id" is required' });
    }
    const note = cleanStr(body.note);

    // Determine amount + credits. When a package is supplied, the package row is
    // the source of truth — never trust client-sent numbers for it.
    let amount;
    let credits;
    let packageId = null;

    if (body.package_id !== undefined && body.package_id !== null) {
      const pid = parseInt(body.package_id, 10);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ error: 'invalid "package_id"' });
      }
      const pkg = await queries.getActivePackageById(pid);
      if (!pkg) {
        return res.status(404).json({ error: 'credit package not found' });
      }
      packageId = pkg.id;
      credits = pkg.credits;
      amount = pkg.price_amount; // NUMERIC -> string; stored back as NUMERIC
    } else {
      amount = Number(body.amount);
      credits = Number(body.credits);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: '"amount" must be a positive number' });
      }
      if (!Number.isInteger(credits) || credits <= 0) {
        return res.status(400).json({ error: '"credits" must be a positive integer' });
      }
    }

    // Light rate-limit: cap the number of outstanding pending requests.
    const pending = await queries.countPendingPaymentRequests(req.authUser.id);
    if (pending >= MAX_PENDING_REQUESTS) {
      return res.status(429).json({
        error: `you already have ${pending} pending payment requests; ` +
          'please wait for them to be reviewed before submitting more',
      });
    }

    const created = await queries.createPaymentRequest({
      userId: req.authUser.id,
      packageId,
      method,
      amount,
      credits,
      senderInfo,
      transactionId,
      note,
    });

    return res.status(201).json({ request: created });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /payments/requests  — the current user's own requests
// ---------------------------------------------------------------------------
router.get('/requests', requireUser, async (req, res, next) => {
  try {
    const requests = await queries.listUserPaymentRequests(req.authUser.id);
    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
