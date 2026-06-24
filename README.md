# mailverify

Email verification engine + HTTP API (syntax, disposable/role detection, MX/DNS,
SMTP mailbox probe, catch-all detection), backed by PostgreSQL for API keys,
credits, results, and a domain cache.

## Quick start (local)

```bash
npm install
node server.js            # boots on http://0.0.0.0:3000 (degraded mode if no DATABASE_URL)
```

Useful scripts:

| Script            | What it does                                            |
| ----------------- | ------------------------------------------------------- |
| `npm start`       | Start the API server (`node server.js`).                |
| `npm test`        | Run the engine sample harness.                          |
| `npm run verify`  | CLI verify: `node cli.js someone@example.com`.          |
| `npm run migrate` | Apply `src/db/schema.sql` to `DATABASE_URL`.            |
| `npm run seed`    | Create the admin user + one API key (prints raw key).   |

Without `DATABASE_URL` the app still runs (no persistence, no credits, auth falls
back to the `API_KEYS` env list — see `.env.example`).

## API

- `GET  /api/v1/health` — public liveness probe.
- `POST /api/v1/verify/single` — auth (`X-API-Key` or Bearer JWT), body `{ "email": "..." }`.
- `POST /api/v1/verify/batch` — auth, body `{ "emails": [...] }` (max 100, sync).

### Bulk verification (background queue)

Large lists are verified asynchronously by a background worker (BullMQ on Redis),
so the request returns immediately and you poll for progress. All endpoints
require auth (`X-API-Key` or Bearer JWT) **and** both a database and `REDIS_URL`
configured — otherwise they return `503`.

| Method & path                         | What it does                                                        |
| ------------------------------------- | ------------------------------------------------------------------- |
| `POST /api/v1/bulk/upload`            | Multipart upload (field **`file`**, `.csv` or `.txt`). Returns `{ bulkJobId, totalEmails }`. |
| `GET  /api/v1/bulk/jobs`              | List your bulk jobs (most recent first).                            |
| `GET  /api/v1/bulk/jobs/:id`          | One job's live status + progress counters.                          |
| `GET  /api/v1/bulk/jobs/:id/download` | Stream the job's results as CSV (`email,status,sub_status,score`).  |

How it works:

- The upload is parsed (CSV with/without headers, or a plain one-per-line list),
  addresses are **de-duplicated and syntax-filtered**, then capped at **50,000**
  per upload (`BULK_MAX_EMAILS`).
- Credits are **reserved up front** — 1 per address — so concurrent uploads can't
  overspend. Not enough credits ⇒ `402` with `credits_available` vs
  `credits_required`. If a job fails wholesale, the unprocessed remainder is
  refunded automatically.
- The worker verifies with the same engine as single-verify (SMTP + catch-all),
  with a small concurrency and a **per-domain delay** (~2s) so one mail server is
  never hammered. It reuses `domain_cache` to avoid re-checking a domain's MX.
- Progress counters (`processed`, `valid`, `invalid`, `catch_all`, `unknown`)
  update live as the worker runs.

Example:

```bash
# Upload a list (JWT or API key)
curl -X POST http://localhost:3000/api/v1/bulk/upload \
  -H "X-API-Key: $KEY" -F "file=@emails.csv"
# => { "bulkJobId": 12, "totalEmails": 3400, ... }

# Poll progress
curl http://localhost:3000/api/v1/bulk/jobs/12 -H "X-API-Key: $KEY"

# Download results when completed
curl http://localhost:3000/api/v1/bulk/jobs/12/download -H "X-API-Key: $KEY" -o results.csv
```

The bulk worker runs **in-process** with the API server and starts automatically
when `REDIS_URL` is set. The bulk tables (`bulk_jobs`, `bulk_results`) are part
of `schema.sql`; on an existing database add just them with `npm run migrate:bulk`.

## Deploying on Coolify

This repo ships a `Dockerfile` (node:20-alpine) and `.dockerignore`. Point a
Coolify **Docker** application at the repo and set the environment variables
below. The server binds `0.0.0.0:$PORT`, so Coolify's proxy can reach it.

### Environment variables to set

| Variable            | Required | Notes                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------- |
| `PORT`              | no       | Defaults to `3000`. Match Coolify's exposed port.                     |
| `DATABASE_URL`      | yes\*    | Postgres connection string. Enables DB-backed keys, credits, caching. |
| `REDIS_URL`         | for bulk | Enables the bulk-verify queue + worker. If unset, bulk endpoints return `503`; single/batch verify are unaffected. |
| `BULK_MAX_EMAILS`   | no       | Max addresses per upload (default `50000`).                           |
| `BULK_CONCURRENCY`  | no       | Addresses verified concurrently per job (default `5`).                |
| `BULK_PER_DOMAIN_DELAY_MS` | no | Min gap between probes to the same domain (default `2000`).          |
| `API_KEYS`          | no       | Legacy/fallback keys; ignored once `DATABASE_URL` is set. Keep empty. |
| `RUN_MIGRATIONS`    | first deploy | Set to `"true"` once to auto-create tables on boot, then remove.  |
| `SMTP_HELO_DOMAIN`  | recommended | Domain announced in EHLO (e.g. `verify.yourdomain.com`).           |
| `SMTP_FROM_ADDRESS` | recommended | MAIL FROM address for the probe (no mail is ever sent).            |
| `SMTP_TIMEOUT_MS`   | no       | Per-connection SMTP timeout, default `10000`.                         |

\* Without `DATABASE_URL` the service runs in degraded mode (no persistence/credits).

### First deploy

1. Provision a PostgreSQL database and set `DATABASE_URL`.
2. Set `RUN_MIGRATIONS=true` and deploy. On boot the server applies
   `schema.sql` (idempotent) to create all tables, then starts serving.
   - A migration failure is logged clearly and the server still starts — check
     the logs and rerun if needed.
3. **Remove `RUN_MIGRATIONS`** (or set it to anything other than `"true"`) for
   subsequent deploys so it doesn't run every boot.
4. **Run the seed once** to create the admin user + API key:
   ```bash
   npm run seed
   ```
   Run it from a one-off container/exec against the deployed environment (so it
   uses the production `DATABASE_URL`). It prints the **raw API key once** —
   copy it; only its SHA-256 hash is stored.

### Outbound SMTP note

Verification opens **outbound** TCP connections on port **25**. This works fine
from the container — no inbound port-25 mapping is needed. If your host provider
blocks outbound port 25, SMTP probes will return `unknown` (the rest of the
pipeline still works).
