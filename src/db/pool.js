'use strict';

const { Pool } = require('pg');

/**
 * Shared PostgreSQL connection pool.
 *
 * The pool is created lazily and only when DATABASE_URL is set. When it is not
 * set the rest of the app runs in "degraded mode" (no persistence, no credits),
 * so consumers must always check isEnabled() / handle a null pool.
 */

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Conservative defaults; tune later for production load.
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // A pool-level error (e.g. a backend dropping an idle client) should be
  // logged, not crash the process.
  pool.on('error', (err) => {
    console.error('[db] unexpected idle client error:', err.message);
  });
}

/**
 * Is a database configured/available?
 * @returns {boolean}
 */
function isEnabled() {
  return pool !== null;
}

/**
 * Run a parameterized query. Throws if the DB is not configured — callers that
 * support degraded mode should guard with isEnabled() first.
 *
 * @param {string} text  SQL with $1, $2 placeholders
 * @param {Array} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
function query(text, params) {
  if (!pool) {
    throw new Error('database not configured (DATABASE_URL is unset)');
  }
  return pool.query(text, params);
}

/**
 * Acquire a dedicated client (for multi-statement transactions).
 * Caller MUST release it. Throws if DB not configured.
 * @returns {Promise<import('pg').PoolClient>}
 */
function getClient() {
  if (!pool) {
    throw new Error('database not configured (DATABASE_URL is unset)');
  }
  return pool.connect();
}

module.exports = { pool, query, getClient, isEnabled };
