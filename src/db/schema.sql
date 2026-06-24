-- mailverify database schema (Chunk 4A)
-- All statements are idempotent (IF NOT EXISTS) so migrate.js can run repeatedly.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'manager' | 'admin'
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'banned'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- api_keys  (store only a SHA-256 hash of the key, never the raw value)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  key_hash     TEXT NOT NULL,
  name         TEXT,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);

-- ---------------------------------------------------------------------------
-- credits  (one row per user, current balance)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credits (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  balance    INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- credit_ledger  (append-only audit log of every balance change)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_ledger (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  change     INTEGER NOT NULL,               -- positive = added, negative = spent
  reason     TEXT,
  job_id     INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger (user_id);

-- ---------------------------------------------------------------------------
-- verification_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_jobs (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id),
  type             TEXT NOT NULL,                  -- 'single' | 'batch' | 'bulk'
  status           TEXT NOT NULL DEFAULT 'queued', -- queued|processing|done|failed
  total            INTEGER NOT NULL DEFAULT 0,
  processed        INTEGER NOT NULL DEFAULT 0,
  valid_count      INTEGER NOT NULL DEFAULT 0,
  invalid_count    INTEGER NOT NULL DEFAULT 0,
  catchall_count   INTEGER NOT NULL DEFAULT 0,
  unknown_count    INTEGER NOT NULL DEFAULT 0,
  disposable_count INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- verification_results  (one row per verified address)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_results (
  id            SERIAL PRIMARY KEY,
  job_id        INTEGER REFERENCES verification_jobs(id),
  user_id       INTEGER REFERENCES users(id),
  email         TEXT NOT NULL,
  status        TEXT,
  sub_status    TEXT,
  score         INTEGER,
  role          BOOLEAN,
  disposable    BOOLEAN,
  accept_all    BOOLEAN,
  free_provider BOOLEAN,
  mx_found      BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_results_job_id ON verification_results (job_id);
CREATE INDEX IF NOT EXISTS idx_results_user_email ON verification_results (user_id, email);

-- ---------------------------------------------------------------------------
-- domain_cache  (speeds up repeated DNS / catch-all / disposable lookups)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domain_cache (
  domain        TEXT PRIMARY KEY,
  mx_records    JSONB,
  has_mx        BOOLEAN,
  is_catch_all  BOOLEAN,
  is_disposable BOOLEAN,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- bulk_jobs  (one row per uploaded file / background bulk-verify job)
-- ---------------------------------------------------------------------------
-- A bulk job is enqueued on BullMQ and processed by src/queue/worker.js. The
-- counters below are incremented live as the worker churns through the list, so
-- GET /api/v1/bulk/jobs/:id reflects real-time progress.
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
  status          TEXT NOT NULL DEFAULT 'queued',  -- queued|processing|completed|failed
  credits_charged INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_user_id ON bulk_jobs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- bulk_results  (one row per address in a bulk job)
-- ---------------------------------------------------------------------------
-- Rows are inserted with status 'pending' at upload time; the worker reads them
-- from here (rather than from a huge job payload) and updates each in place with
-- the engine's verdict.
CREATE TABLE IF NOT EXISTS bulk_results (
  id           SERIAL PRIMARY KEY,
  bulk_job_id  INTEGER NOT NULL REFERENCES bulk_jobs(id),
  email        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending until verified
  sub_status   TEXT,
  score        INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bulk_results_job_id ON bulk_results (bulk_job_id);
-- Speeds up the worker's "fetch next batch of pending rows" query.
CREATE INDEX IF NOT EXISTS idx_bulk_results_pending ON bulk_results (bulk_job_id, status);
