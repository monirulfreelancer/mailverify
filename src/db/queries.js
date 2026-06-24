'use strict';

const crypto = require('crypto');
const { query, getClient } = require('./pool');

/**
 * All database access lives here. Routes/engine never write SQL directly.
 *
 * Every query is parameterized ($1, $2, ...) — no string concatenation of user
 * input — to prevent SQL injection.
 */

// Domain cache freshness window: rows older than this are treated as expired.
const DOMAIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Free credits granted to a brand-new signup (env-overridable).
const SIGNUP_FREE_CREDITS = parseInt(process.env.SIGNUP_FREE_CREDITS || '25', 10);

/** SHA-256 hex helper for hashing API keys before storage. */
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/** Safe public view of a user row — never exposes password_hash. */
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
  };
}

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

// ---------------------------------------------------------------------------
// Accounts (signup / login / dashboard) — Chunk 5A
// ---------------------------------------------------------------------------

/**
 * Create a new user with a password hash and grant the signup free-credit
 * bundle. User row + credits row + ledger entry are created in one transaction.
 *
 * @param {string} email
 * @param {string} passwordHash  bcrypt hash (never the plaintext)
 * @returns {Promise<object>} public user (no password_hash)
 */
async function createUser(email, passwordHash) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'user', 'active')
       RETURNING *`,
      [email, passwordHash]
    );
    const user = userRes.rows[0];

    // Grant free signup credits + record it in the ledger.
    await client.query(
      `INSERT INTO credits (user_id, balance, updated_at)
       VALUES ($1, $2, now())`,
      [user.id, SIGNUP_FREE_CREDITS]
    );
    await client.query(
      `INSERT INTO credit_ledger (user_id, change, reason)
       VALUES ($1, $2, 'signup bonus')`,
      [user.id, SIGNUP_FREE_CREDITS]
    );

    await client.query('COMMIT');
    return publicUser(user);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Look up a user by email. Returns the FULL row (including password_hash) — for
 * internal login use only. Never send this straight to a client.
 *
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function getUserByEmail(email) {
  const { rows } = await query(
    `SELECT * FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/**
 * Look up a user by id. Returns a public user (no password_hash).
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getUserById(id) {
  const { rows } = await query(
    `SELECT * FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return publicUser(rows[0]);
}

/**
 * Generate and store a new API key for a user. Only the SHA-256 hash is stored;
 * the RAW key is returned ONCE so it can be shown to the user.
 *
 * @param {number} userId
 * @param {string} [name]
 * @returns {Promise<{ rawKey: string, id: number, name: string, created_at: Date }>}
 */
async function createApiKeyForUser(userId, name) {
  const rawKey = 'mv_' + crypto.randomBytes(24).toString('hex');
  const keyHash = sha256(rawKey);

  const { rows } = await query(
    `INSERT INTO api_keys (user_id, key_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, name, created_at`,
    [userId, keyHash, name || null]
  );

  return { rawKey, ...rows[0] };
}

/**
 * List a user's API keys (metadata only — never the hash or raw key).
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function listApiKeys(userId) {
  const { rows } = await query(
    `SELECT id, name, last_used_at, created_at, revoked_at
       FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Revoke one of a user's API keys (scoped to the owner). Idempotent: revoking an
 * already-revoked key keeps its original revoked_at.
 *
 * @param {number} userId
 * @param {number} keyId
 * @returns {Promise<boolean>} true if a key belonging to the user was revoked
 */
async function revokeApiKey(userId, keyId) {
  const { rowCount } = await query(
    `UPDATE api_keys
        SET revoked_at = COALESCE(revoked_at, now())
      WHERE id = $1 AND user_id = $2`,
    [keyId, userId]
  );
  return rowCount > 0;
}

/**
 * Recent verification results for a user, newest first, paginated.
 * @param {number} userId
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array>}
 */
async function getRecentResults(userId, limit, offset) {
  const { rows } = await query(
    `SELECT id, job_id, email, status, sub_status, score,
            role, disposable, accept_all, free_provider, mx_found, created_at
       FROM verification_results
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

/**
 * Aggregate verification stats for a user: total + counts per status.
 * @param {number} userId
 * @returns {Promise<{ total: number, valid: number, invalid: number,
 *   accept_all: number, disposable: number, unknown: number }>}
 */
async function getUserStats(userId) {
  const { rows } = await query(
    `SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'valid')              AS valid,
        COUNT(*) FILTER (WHERE status = 'invalid')            AS invalid,
        COUNT(*) FILTER (WHERE status = 'accept_all')         AS accept_all,
        COUNT(*) FILTER (WHERE status = 'disposable')         AS disposable,
        COUNT(*) FILTER (WHERE status = 'unknown')            AS unknown
       FROM verification_results
      WHERE user_id = $1`,
    [userId]
  );
  const r = rows[0] || {};
  // COUNT returns strings in pg — coerce to numbers.
  return {
    total: parseInt(r.total || 0, 10),
    valid: parseInt(r.valid || 0, 10),
    invalid: parseInt(r.invalid || 0, 10),
    accept_all: parseInt(r.accept_all || 0, 10),
    disposable: parseInt(r.disposable || 0, 10),
    unknown: parseInt(r.unknown || 0, 10),
  };
}

module.exports = {
  DOMAIN_CACHE_TTL_MS,
  SIGNUP_FREE_CREDITS,
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
  // Accounts
  createUser,
  getUserByEmail,
  getUserById,
  createApiKeyForUser,
  listApiKeys,
  revokeApiKey,
  getRecentResults,
  getUserStats,
};
