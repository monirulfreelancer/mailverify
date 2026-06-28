#!/usr/bin/env node
'use strict';

/**
 * Blog migration.
 *
 * Creates the blog_posts table (and its status/published_at index) if it is
 * missing. Every statement is idempotent (IF NOT EXISTS), so this is safe to run
 * repeatedly — nothing is dropped or altered once the table exists.
 *
 * The full schema.sql also contains this table, so a fresh `npm run migrate`
 * covers it too; this script exists so an EXISTING deployment can add just the
 * blog table without re-running the entire schema.
 *
 * Usage:  node src/db/migrate-blog.js   (or: npm run migrate:blog)
 */

const { pool, isEnabled } = require('./pool');

// Kept in sync with the blog_posts section of schema.sql. The UNIQUE on slug is
// declared inline on the column, so no separate unique index is needed.
const SQL = `
CREATE TABLE IF NOT EXISTS blog_posts (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  excerpt         TEXT,
  content         TEXT NOT NULL,
  cover_image_url TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  author_id       INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts (status, published_at DESC);
`;

async function main() {
  if (!isEnabled()) {
    console.error('[migrate:blog] DATABASE_URL is not set. Nothing to migrate.');
    process.exit(1);
  }

  console.log('[migrate:blog] creating blog_posts if missing ...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('[migrate:blog] done — blog_posts table is present.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate:blog] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate:blog] unexpected error:', err);
  process.exit(1);
});
