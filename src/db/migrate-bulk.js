#!/usr/bin/env node
'use strict';

/**
 * Bulk-verification migration.
 *
 * Creates the bulk_jobs + bulk_results tables (and their indexes) if they are
 * missing. Every statement is idempotent (IF NOT EXISTS), so this is safe to run
 * against a database that already has them — nothing is dropped or rewritten.
 *
 * The full schema.sql also contains these tables, so a fresh `npm run migrate`
 * covers them too; this script exists so an EXISTING deployment can add just the
 * bulk tables without re-running the entire schema.
 *
 * Usage:  node src/db/migrate-bulk.js   (or: npm run migrate:bulk)
 */

const { pool, isEnabled } = require('./pool');

// Kept in sync with the bulk_jobs / bulk_results sections of schema.sql.
const SQL = `
CREATE TABLE IF NOT EXISTS bulk_jobs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  filename        TEXT,
  total_emails    INTEGER NOT NULL DEFAULT 0,
  processed       INTEGER NOT NULL DEFAULT 0,
  valid           INTEGER NOT NULL DEFAULT 0,
  invalid         INTEGER NOT NULL DEFAULT 0,
  catch_all       INTEGER NOT NULL DEFAULT 0,
  unknown         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'queued',
  credits_charged INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_user_id ON bulk_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bulk_results (
  id           SERIAL PRIMARY KEY,
  bulk_job_id  INTEGER NOT NULL REFERENCES bulk_jobs(id),
  email        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  sub_status   TEXT,
  score        INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bulk_results_job_id ON bulk_results (bulk_job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_results_pending ON bulk_results (bulk_job_id, status);
`;

async function main() {
  if (!isEnabled()) {
    console.error('[migrate:bulk] DATABASE_URL is not set. Nothing to migrate.');
    process.exit(1);
  }

  console.log('[migrate:bulk] creating bulk_jobs / bulk_results if missing ...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('[migrate:bulk] done — bulk tables are present.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate:bulk] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate:bulk] unexpected error:', err);
  process.exit(1);
});
