#!/usr/bin/env node
'use strict';

/**
 * Manual-payments migration.
 *
 * Creates the credit_packages + payment_requests tables (and their indexes) if
 * they are missing, and seeds the four default credit bundles when the
 * credit_packages table is empty. Every statement is idempotent (IF NOT EXISTS /
 * guarded INSERT), so this is safe to run repeatedly — nothing is dropped or
 * re-seeded once the rows exist.
 *
 * The full schema.sql also contains these tables, so a fresh `npm run migrate`
 * covers them too; this script exists so an EXISTING deployment can add just the
 * payment tables without re-running the entire schema.
 *
 * Usage:  node src/db/migrate-payments.js   (or: npm run migrate:payments)
 */

const { pool, isEnabled } = require('./pool');

// Kept in sync with the credit_packages / payment_requests sections of schema.sql.
const SQL = `
CREATE TABLE IF NOT EXISTS credit_packages (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  credits      INTEGER NOT NULL,
  price_amount NUMERIC(10,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'BDT',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  package_id     INTEGER REFERENCES credit_packages(id),
  method         TEXT NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  credits        INTEGER NOT NULL,
  sender_info    TEXT,
  transaction_id TEXT,
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  admin_id       INTEGER REFERENCES users(id),
  admin_note     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON payment_requests (user_id);
`;

// Seed only when the table is empty (WHERE NOT EXISTS keeps it idempotent).
const SEED_SQL = `
INSERT INTO credit_packages (name, credits, price_amount, currency, sort_order)
SELECT v.name, v.credits, v.price_amount, 'BDT', v.sort_order
FROM (VALUES
  ('Starter',  1000,    200.00, 1),
  ('Basic',    5000,    800.00, 2),
  ('Pro',      25000,  3000.00, 3),
  ('Business', 100000, 10000.00, 4)
) AS v(name, credits, price_amount, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM credit_packages);
`;

async function main() {
  if (!isEnabled()) {
    console.error('[migrate:payments] DATABASE_URL is not set. Nothing to migrate.');
    process.exit(1);
  }

  console.log('[migrate:payments] creating credit_packages / payment_requests if missing ...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    const seeded = await client.query(SEED_SQL);
    await client.query('COMMIT');
    if (seeded.rowCount > 0) {
      console.log(`[migrate:payments] seeded ${seeded.rowCount} default credit package(s).`);
    } else {
      console.log('[migrate:payments] credit_packages already populated — no seed needed.');
    }
    console.log('[migrate:payments] done — payment tables are present.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate:payments] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate:payments] unexpected error:', err);
  process.exit(1);
});
