#!/usr/bin/env node
'use strict';

/**
 * Seed script: create one admin user, mint one API key, grant 1000 credits.
 *
 * The RAW API key is printed ONCE to the console (we only ever store its
 * SHA-256 hash). Copy it now — it cannot be recovered later.
 *
 * Usage:  node src/db/seed.js   (or: npm run seed)
 *
 * Env overrides:
 *   SEED_ADMIN_EMAIL   (default: admin@mailverify.local)
 *   SEED_CREDITS       (default: 1000)
 */

const crypto = require('crypto');
const { pool, isEnabled } = require('./pool');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@mailverify.local';
const CREDITS = parseInt(process.env.SEED_CREDITS || '1000', 10);

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function main() {
  if (!isEnabled()) {
    console.error('[seed] DATABASE_URL is not set. Cannot seed.');
    process.exit(1);
  }

  // Generate a random, URL-safe raw API key.
  const rawKey = 'mv_' + crypto.randomBytes(24).toString('hex');
  const keyHash = sha256(rawKey);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert the admin user (idempotent on email).
    const userRes = await client.query(
      `INSERT INTO users (email, role, status)
       VALUES ($1, 'admin', 'active')
       ON CONFLICT (email) DO UPDATE SET role = 'admin'
       RETURNING id, email, role`,
      [ADMIN_EMAIL]
    );
    const user = userRes.rows[0];

    // 2. Insert the API key (store only the hash).
    await client.query(
      `INSERT INTO api_keys (user_id, key_hash, name)
       VALUES ($1, $2, $3)`,
      [user.id, keyHash, 'seed admin key']
    );

    // 3. Grant credits (upsert balance) + ledger entry.
    await client.query(
      `INSERT INTO credits (user_id, balance, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id)
       DO UPDATE SET balance = credits.balance + $2, updated_at = now()`,
      [user.id, CREDITS]
    );
    await client.query(
      `INSERT INTO credit_ledger (user_id, change, reason)
       VALUES ($1, $2, 'seed grant')`,
      [user.id, CREDITS]
    );

    await client.query('COMMIT');

    // Print the raw key clearly — this is the only time it is shown.
    console.log('\n========================================================');
    console.log(' mailverify seed complete');
    console.log('--------------------------------------------------------');
    console.log(` admin user : ${user.email} (id=${user.id}, role=${user.role})`);
    console.log(` credits    : ${CREDITS}`);
    console.log('');
    console.log(' RAW API KEY (copy now — stored only as a hash):');
    console.log('');
    console.log('   ' + rawKey);
    console.log('');
    console.log('========================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] unexpected error:', err);
  process.exit(1);
});
