#!/usr/bin/env node
'use strict';

/**
 * Contact-form migration.
 *
 * Creates the contact_messages table (and its status/created_at index) if it is
 * missing. Every statement is idempotent (IF NOT EXISTS), so this is safe to run
 * repeatedly — nothing is dropped or altered once the table exists.
 *
 * The full schema.sql also contains this table, so a fresh `npm run migrate`
 * covers it too; this script exists so an EXISTING deployment can add just the
 * contact table without re-running the entire schema.
 *
 * Usage:  node src/db/migrate-contact.js   (or: npm run migrate:contact)
 */

const { pool, isEnabled } = require('./pool');

// Kept in sync with the contact_messages section of schema.sql.
const SQL = `
CREATE TABLE IF NOT EXISTS contact_messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages (status, created_at DESC);
`;

async function main() {
  if (!isEnabled()) {
    console.error('[migrate:contact] DATABASE_URL is not set. Nothing to migrate.');
    process.exit(1);
  }

  console.log('[migrate:contact] creating contact_messages if missing ...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('[migrate:contact] done — contact_messages table is present.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate:contact] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate:contact] unexpected error:', err);
  process.exit(1);
});
