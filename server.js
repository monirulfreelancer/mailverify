'use strict';

const express = require('express');
const config = require('./src/config');
const routes = require('./src/api/routes');
const { warnIfAuthDisabled } = require('./src/api/auth');

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

// --- Start -----------------------------------------------------------------
function start() {
  warnIfAuthDisabled();
  const server = app.listen(config.port, () => {
    console.log(`mailverify API listening on http://localhost:${config.port}`);
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
  start();
}

module.exports = { app, start };
