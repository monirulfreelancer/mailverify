#!/usr/bin/env node
'use strict';

/**
 * Admin promotion migration.
 *
 * Promotes a fixed set of bootstrap accounts to the 'admin' role so there is at
 * least one admin who can reach the /api/v1/admin endpoints. Idempotent: it is a
 * plain UPDATE on existing rows, so running it repeatedly is a no-op once the
 * accounts are already admins. Accounts that don't exist yet are simply skipped
 * (create them via signup or `npm run seed`, then re-run this).
 *
 * It also ensures the users.role column exists (it normally does — it's in
 * schema.sql), adding it with a safe default if an older database is missing it.
 *
 * Usage:  node src/db/migrate-admin.js   (or: npm run migrate:admin)
 */

const { pool, isEnabled } = require('./pool');

// Bootstrap accounts to promote to admin.
const ADMIN_EMAILS = ['admin@mailverify.local', 'test@example.com'];

async function main() {
  if (!isEnabled()) {
    console.error('[migrate:admin] DATABASE_URL is not set. Nothing to migrate.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Defensive: make sure the role column exists on older databases.
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`
    );

    // Idempotent promotion. RETURNING tells us which rows actually matched.
    const { rows } = await client.query(
      `UPDATE users
          SET role = 'admin'
        WHERE email = ANY($1)
        RETURNING id, email, role`,
      [ADMIN_EMAILS]
    );

    await client.query('COMMIT');

    if (rows.length === 0) {
      console.log(
        `[migrate:admin] no matching accounts found for: ${ADMIN_EMAILS.join(', ')}`
      );
      console.log(
        '[migrate:admin] create them (signup or `npm run seed`) then re-run this script.'
      );
    } else {
      for (const r of rows) {
        console.log(`[migrate:admin] promoted ${r.email} (id=${r.id}) -> role=${r.role}`);
      }
    }
    console.log('[migrate:admin] done.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate:admin] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate:admin] unexpected error:', err);
  process.exit(1);
});
