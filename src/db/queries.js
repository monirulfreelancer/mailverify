'use strict';

const { query, getClient } = require('./pool');

/**
 * All database access lives here. Routes/engine never write SQL directly.
 *
 * Every query is parameterized ($1, $2, ...) — no string concatenation of user
 * input — to prevent SQL injection.
 */

// Domain cache freshness window: rows older than this are treated as expired.
const DOMAIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Users / API keys
// ---------------------------------------------------------------------------

/**
 * Look up the user that owns a given API-key hash, joining api_keys + users.
 * Only returns active (non-revoked) keys.
 *
 * @param {string} hash SHA-256 hex of the raw API key
 * @returns {Promise<object|null>} user row (with key_id) or null
 */
async function getUserByApiKeyHash(hash) {
  const sql = `
    SELECT u.id, u.email, u.role, u.status,
           k.id AS key_id, k.revoked_at
    FROM api_keys k
    JOIN users u ON u.id = k.user_id
    WHERE k.key_hash = $1
      AND k.revoked_at IS NULL
    LIMIT 1
  `;
  const { rows } = await query(sql, [hash]);
  return rows[0] || null;
}

/**
 * Record that an API key was just used (best-effort, fire-and-forget friendly).
 * @param {string} keyHash
 * @returns {Promise<void>}
 */
async function touchApiKeyLastUsed(keyHash) {
  const sql = `UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1`;
  await query(sql, [keyHash]);
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

/**
 * Current credit balance for a user (0 if no credits row exists).
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function getCreditBalance(userId) {
  const { rows } = await query(
    `SELECT balance FROM credits WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ? rows[0].balance : 0;
}

/**
 * Atomically spend credits: decrement balance + append a ledger row, inside a
 * transaction. Returns false (and changes nothing) if the balance is
 * insufficient.
 *
 * The conditional UPDATE (`balance >= amount`) makes the spend atomic even under
 * concurrent requests — only one can drive the balance below the threshold.
 *
 * @param {number} userId
 * @param {number} amount   positive number of credits to spend
 * @param {string} reason
 * @param {number|null} [jobId]
 * @returns {Promise<boolean>} true if charged, false if insufficient balance
 */
async function spendCredits(userId, amount, reason, jobId = null) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Only succeeds if there is enough balance — atomic guard.
    const upd = await client.query(
      `UPDATE credits
         SET balance = balance - $2, updated_at = now()
       WHERE user_id = $1 AND balance >= $2
       RETURNING balance`,
      [userId, amount]
    );

    if (upd.rowCount === 0) {
      // Insufficient balance (or no credits row) — abort, charge nothing.
      await client.query('ROLLBACK');
      return false;
    }

    // Record the spend in the append-only ledger (negative change).
    await client.query(
      `INSERT INTO credit_ledger (user_id, change, reason, job_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, -Math.abs(amount), reason, jobId]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Add credits to a user: upsert the balance + append a ledger row, in a
 * transaction.
 *
 * @param {number} userId
 * @param {number} amount   positive number of credits to add
 * @param {string} reason
 * @returns {Promise<number>} the new balance
 */
async function addCredits(userId, amount, reason) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const upd = await client.query(
      `INSERT INTO credits (user_id, balance, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id)
       DO UPDATE SET balance = credits.balance + $2, updated_at = now()
       RETURNING balance`,
      [userId, Math.abs(amount)]
    );

    await client.query(
      `INSERT INTO credit_ledger (user_id, change, reason)
       VALUES ($1, $2, $3)`,
      [userId, Math.abs(amount), reason]
    );

    await client.query('COMMIT');
    return upd.rows[0].balance;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * Create a verification job.
 * @param {number|null} userId
 * @param {'single'|'batch'|'bulk'} type
 * @param {number} total
 * @returns {Promise<object>} the created job row
 */
async function createJob(userId, type, total) {
  const { rows } = await query(
    `INSERT INTO verification_jobs (user_id, type, total, status)
     VALUES ($1, $2, $3, 'processing')
     RETURNING *`,
    [userId, type, total]
  );
  return rows[0];
}

/**
 * Update a job's progress counters.
 *
 * @param {number} jobId
 * @param {object} counts
 * @param {number} [counts.processed]
 * @param {number} [counts.valid]
 * @param {number} [counts.invalid]
 * @param {number} [counts.catchall]
 * @param {number} [counts.unknown]
 * @param {number} [counts.disposable]
 * @returns {Promise<object>} the updated job row
 */
async function updateJobProgress(jobId, counts = {}) {
  // COALESCE lets callers pass only the counters they want to set; the rest
  // keep their current value.
  const { rows } = await query(
    `UPDATE verification_jobs SET
       processed        = COALESCE($2, processed),
       valid_count      = COALESCE($3, valid_count),
       invalid_count    = COALESCE($4, invalid_count),
       catchall_count   = COALESCE($5, catchall_count),
       unknown_count    = COALESCE($6, unknown_count),
       disposable_count = COALESCE($7, disposable_count)
     WHERE id = $1
     RETURNING *`,
    [
      jobId,
      counts.processed ?? null,
      counts.valid ?? null,
      counts.invalid ?? null,
      counts.catchall ?? null,
      counts.unknown ?? null,
      counts.disposable ?? null,
    ]
  );
  return rows[0];
}

/**
 * Mark a job done and stamp completed_at.
 * @param {number} jobId
 * @returns {Promise<object>} the updated job row
 */
async function completeJob(jobId) {
  const { rows } = await query(
    `UPDATE verification_jobs
       SET status = 'done', completed_at = now()
     WHERE id = $1
     RETURNING *`,
    [jobId]
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Persist a single engine result.
 *
 * Maps the engine result shape (which uses `catch_all`) onto the
 * verification_results column `accept_all`.
 *
 * @param {number|null} jobId
 * @param {number|null} userId
 * @param {object} result  an engine verify() result object
 * @returns {Promise<object>} the inserted row
 */
async function saveResult(jobId, userId, result) {
  const { rows } = await query(
    `INSERT INTO verification_results
       (job_id, user_id, email, status, sub_status, score,
        role, disposable, accept_all, free_provider, mx_found)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      jobId,
      userId,
      result.email,
      result.status,
      result.sub_status,
      result.score,
      result.role,
      result.disposable,
      // Engine exposes catch-all as `catch_all`; column is `accept_all`.
      result.catch_all ?? (result.status === 'accept_all'),
      result.free_provider,
      result.mx_found,
    ]
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Domain cache
// ---------------------------------------------------------------------------

/**
 * Get a cached domain row, but only if it is fresh (within the TTL).
 * Returns null if missing or expired.
 *
 * @param {string} domain
 * @returns {Promise<object|null>}
 */
async function getDomainCache(domain) {
  const { rows } = await query(
    `SELECT domain, mx_records, has_mx, is_catch_all, is_disposable, checked_at
       FROM domain_cache
      WHERE domain = $1`,
    [domain]
  );
  const row = rows[0];
  if (!row) return null;

  const age = Date.now() - new Date(row.checked_at).getTime();
  if (age > DOMAIN_CACHE_TTL_MS) {
    return null; // expired — caller should re-check and upsert
  }
  return row;
}

/**
 * Upsert a domain cache entry.
 *
 * @param {string} domain
 * @param {object} data
 * @param {Array} [data.mx_records]
 * @param {boolean} [data.has_mx]
 * @param {boolean} [data.is_catch_all]
 * @param {boolean} [data.is_disposable]
 * @returns {Promise<object>} the upserted row
 */
async function setDomainCache(domain, data = {}) {
  const { rows } = await query(
    `INSERT INTO domain_cache
       (domain, mx_records, has_mx, is_catch_all, is_disposable, checked_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (domain) DO UPDATE SET
       mx_records    = EXCLUDED.mx_records,
       has_mx        = EXCLUDED.has_mx,
       is_catch_all  = EXCLUDED.is_catch_all,
       is_disposable = EXCLUDED.is_disposable,
       checked_at    = now()
     RETURNING *`,
    [
      domain,
      // JSONB column — pg serializes JS arrays/objects when stringified.
      data.mx_records ? JSON.stringify(data.mx_records) : null,
      data.has_mx ?? null,
      data.is_catch_all ?? null,
      data.is_disposable ?? null,
    ]
  );
  return rows[0];
}

module.exports = {
  DOMAIN_CACHE_TTL_MS,
  getUserByApiKeyHash,
  touchApiKeyLastUsed,
  getCreditBalance,
  spendCredits,
  addCredits,
  createJob,
  updateJobProgress,
  completeJob,
  saveResult,
  getDomainCache,
  setDomainCache,
};
