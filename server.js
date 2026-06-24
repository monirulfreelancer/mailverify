'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./src/config');
const routes = require('./src/api/routes');
const { warnIfAuthDisabled } = require('./src/api/auth');
const db = require('./src/db/pool');

/**
 * mailverify HTTP API server (Chunk 3).
 *
 * Thin Express layer over the existing verification engine (src/engine/). No
 * engine logic lives here — routes call verify() and shape HTTP responses.
 */

const app = express();

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
app.use('/api/v1', routes);

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
    if (config.apiKeys.length > 0) {
      console.log(`  auth:    X-API-Key required (${config.apiKeys.length} key(s) loaded)`);
    }
  });
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
