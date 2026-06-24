'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./src/config');
const routes = require('./src/api/routes');
const accountRoutes = require('./src/api/account-routes');
const bulkRoutes = require('./src/api/bulk-routes');
const adminRoutes = require('./src/api/admin-routes');
const paymentRoutes = require('./src/api/payment-routes');
const contactRoutes = require('./src/api/contact-routes');
const { warnIfAuthDisabled } = require('./src/api/auth');
const { startWorker } = require('./src/queue/worker');
const db = require('./src/db/pool');

/**
 * mailverify HTTP API server (Chunk 3).
 *
 * Thin Express layer over the existing verification engine (src/engine/). No
 * engine logic lives here — routes call verify() and shape HTTP responses.
 */

const app = express();

// --- CORS ------------------------------------------------------------------
// Allow separate frontends (app host + public marketing site) to call this
// API. The allow-list is the union of CORS_ORIGINS (which defaults to the
// production app/marketing hosts + Vite dev server — see config.corsOrigins),
// any legacy FRONTEND_URL entries, and common localhost dev origins. This
// covers both the app host and the public Contact form on the marketing host.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const allowedOrigins = [
  ...new Set([...config.corsOrigins, ...config.frontendUrls, ...DEV_ORIGINS]),
];
console.log(`[cors] allowed origins: ${allowedOrigins.join(', ')}`);
const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'X-API-Key', 'Content-Type'],
  credentials: true,
};
app.use(cors(corsOptions));
// Answer preflight OPTIONS for every route (incl. the public /api/v1/contact).
app.options('*', cors(corsOptions));

// Built-in JSON body parser (no third-party body parser needed).
app.use(express.json());

// --- Simple request logger -------------------------------------------------
// Logs "METHOD /path -> status (ms)" once the response is finished.
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)}ms)`
    );
  });
  next();
});

// --- Routes ----------------------------------------------------------------
app.use('/api/v1', routes); // health + verify (X-API-Key or Bearer)
app.use('/api/v1', accountRoutes); // auth (signup/login/me) + account (dashboard)
app.use('/api/v1', bulkRoutes); // bulk upload + jobs (background queue)
app.use('/api/v1/payments', paymentRoutes); // manual payments / credit top-ups (JWT)
app.use('/api/v1/contact', contactRoutes); // public contact form (NO auth)
app.use('/api/v1/admin', adminRoutes); // admin/manager dashboard (JWT + role gates)

// --- 404 fallback ----------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// --- Centralized error handler ---------------------------------------------
// Catches malformed JSON (thrown by express.json) and any error forwarded via
// next(err) from a route. Always responds with JSON; never crashes the server.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed JSON body => 400 rather than 500.
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'invalid JSON in request body' });
  }

  console.error('[error]', err && err.stack ? err.stack : err);
  return res.status(500).json({ error: 'internal server error' });
});

// --- Process-level safety nets ---------------------------------------------
// A stray rejection/exception should be logged, not silently kill the server.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

// --- Optional boot-time migration ------------------------------------------
// When RUN_MIGRATIONS=true AND a database is configured, apply schema.sql before
// serving traffic (handy for the first Coolify deploy). A failure here is logged
// clearly but does NOT throw, so the server still starts rather than crash-looping
// silently. Set RUN_MIGRATIONS=true once on first deploy, then remove it.
async function runMigrationsIfRequested() {
  if (process.env.RUN_MIGRATIONS !== 'true') {
    return; // not requested — skip quietly
  }
  if (!db.isEnabled()) {
    console.warn(
      '[migrate] RUN_MIGRATIONS=true but DATABASE_URL is unset — skipping migration.'
    );
    return;
  }

  console.log('[migrate] RUN_MIGRATIONS=true — applying schema.sql on boot ...');
  try {
    const schemaPath = path.join(__dirname, 'src', 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    // schema.sql is fully idempotent (IF NOT EXISTS), so this is safe to re-run.
    await db.query(sql);
    console.log('[migrate] schema applied successfully.');
  } catch (err) {
    // Log clearly and continue — better a running (possibly degraded) server we
    // can inspect than an opaque restart loop.
    console.error('[migrate] FAILED to apply schema on boot:', err.message);
    console.error('[migrate] continuing startup; run `npm run migrate` manually to retry.');
  }
}

// --- Start -----------------------------------------------------------------
async function start() {
  await runMigrationsIfRequested();
  warnIfAuthDisabled();

  // Bind to 0.0.0.0 so the container is reachable from outside (Coolify proxy).
  const host = '0.0.0.0';
  const server = app.listen(config.port, host, () => {
    console.log(`mailverify API listening on http://${host}:${config.port}`);
    console.log(`  health:  GET  /api/v1/health`);
    console.log(`  single:  POST /api/v1/verify/single`);
    console.log(`  batch:   POST /api/v1/verify/batch`);
    console.log(`  bulk:    POST /api/v1/bulk/upload`);
    if (config.apiKeys.length > 0) {
      console.log(`  auth:    X-API-Key required (${config.apiKeys.length} key(s) loaded)`);
    }
  });

  // Start the background bulk-verify worker IN-PROCESS, but only when Redis is
  // configured. startWorker() no-ops (and logs) without REDIS_URL, and the Worker
  // runs on its own event loop so it never blocks the HTTP server. Guard it so a
  // worker init hiccup can't take the API down.
  if (process.env.REDIS_URL) {
    try {
      startWorker();
    } catch (err) {
      console.error('[startup] failed to start bulk worker:', err && err.message);
    }
  }

  return server;
}

// Only auto-start when run directly (allows importing app in tests).
if (require.main === module) {
  start().catch((err) => {
    console.error('[startup] fatal error:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { app, start };
