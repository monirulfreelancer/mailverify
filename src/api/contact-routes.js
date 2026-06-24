'use strict';

const express = require('express');
const db = require('../db/pool');
const queries = require('../db/queries');

/**
 * Public "Contact us" form route, mounted under /api/v1/contact by server.js.
 *
 *   POST /  (i.e. POST /api/v1/contact)   NO AUTH — public contact form
 *     body { name, email, subject?, message } -> { ok: true }
 *
 * The matching ADMIN endpoints (list / update status / delete) live in
 * admin-routes.js behind the JWT + role gates, mounted under /api/v1/admin.
 *
 * Submissions are stored as plain text and never echoed back, so there is no
 * stored-XSS surface here — any HTML in the body is persisted verbatim and only
 * displayed as text by the admin UI.
 */

const router = express.Router();

// --- Validation limits -----------------------------------------------------
const MAX_NAME = 200;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;

// A deliberately permissive email shape check — we only reject obvious garbage,
// not edge-case-but-valid addresses. Real deliverability is out of scope here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Lightweight in-memory rate limit --------------------------------------
// Per-IP sliding window: at most RATE_MAX submissions per RATE_WINDOW_MS. This
// is best-effort abuse mitigation only (single-process, resets on restart) — not
// a substitute for an edge/CDN limiter in production.
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const hits = new Map(); // ip -> number[] (timestamps, ms)

/**
 * Record a hit for an IP and report whether it is now over the limit.
 * Prunes timestamps outside the window so the map can't grow unbounded per IP.
 * @param {string} ip
 * @param {number} now  current epoch ms
 * @returns {boolean} true if the request is allowed, false if rate-limited
 */
function allowRequest(ip, now) {
  const cutoff = now - RATE_WINDOW_MS;
  const recent = (hits.get(ip) || []).filter((t) => t > cutoff);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent); // keep pruned list; do not record this rejected hit
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

// Periodically drop IPs whose entire window has expired, so the Map doesn't
// accumulate stale keys over a long uptime. unref() so it never holds the event
// loop open (e.g. in tests).
const sweep = setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, times] of hits) {
    const recent = times.filter((t) => t > cutoff);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  }
}, RATE_WINDOW_MS);
if (typeof sweep.unref === 'function') sweep.unref();

// ---------------------------------------------------------------------------
// POST /  — submit a contact message (public, no auth)
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    // Persistence is required to store the message; fail clearly without a DB.
    if (!db.isEnabled()) {
      return res.status(503).json({
        error: 'contact form requires a configured database',
      });
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!allowRequest(ip, Date.now())) {
      return res.status(429).json({
        error: 'too many submissions; please try again later',
      });
    }

    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const subjectRaw = typeof body.subject === 'string' ? body.subject.trim() : '';

    if (!name) {
      return res.status(400).json({ error: '"name" is required' });
    }
    if (name.length > MAX_NAME) {
      return res.status(400).json({ error: `"name" must be at most ${MAX_NAME} characters` });
    }
    if (!email || !EMAIL_RE.test(email) || email.length > MAX_NAME) {
      return res.status(400).json({ error: '"email" must be a valid email address' });
    }
    if (!message) {
      return res.status(400).json({ error: '"message" is required' });
    }
    if (message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: `"message" must be at most ${MAX_MESSAGE} characters` });
    }
    let subject = subjectRaw || null;
    if (subject && subject.length > MAX_SUBJECT) {
      subject = subject.slice(0, MAX_SUBJECT);
    }

    await queries.insertContactMessage({ name, email, subject, message, ip });

    // Do NOT echo back the stored row — just acknowledge.
    return res.status(201).json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
