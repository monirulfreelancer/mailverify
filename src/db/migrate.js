#!/usr/bin/env node
'use strict';

/**
 * Database migration runner.
 *
 * Reads src/db/schema.sql and executes it against DATABASE_URL. All statements
 * are idempotent (IF NOT EXISTS), so this is safe to run repeatedly.
 *
 * Usage:  node src/db/migrate.js   (or: npm run migrate)
 */

const fs = require('fs');
const path = require('path');
const { pool, isEnabled } = require('./pool');

async function main() {
  if (!isEnabled()) {
    console.error('[migrate] DATABASE_URL is not set. Nothing to migrate.');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('[migrate] applying schema.sql ...');
  const client = await pool.connect();
  try {
    // Run the whole schema in a single transaction so a failure rolls back.
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[migrate] done — schema applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] unexpected error:', err);
  process.exit(1);
});
