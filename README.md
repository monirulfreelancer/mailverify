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
| `npm run migrate:admin` | Promote the bootstrap accounts to the `admin` role. |
| `npm run migrate:payments` | Create the payment tables + seed default credit packages. |
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

## Admin API

The platform has three roles, stored in `users.role`:

| Role      | Can do                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| `user`    | Normal customer — verify, bulk, manage own account.                           |
| `manager` | Read the admin dashboard (stats, users, user detail) **and** adjust credits.  |
| `admin`   | Everything a manager can, **plus** change any user's status and role.         |

All admin endpoints are mounted under **`/api/v1/admin`** and require a **Bearer
JWT** (dashboard session — not an API key). Each route runs the normal JWT auth
first, then a role gate that returns **403** if the role is insufficient. Without
a configured database they return `503`.

| Method & path                          | Role          | Body / query                              | What it does                                                              |
| -------------------------------------- | ------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `GET   /api/v1/admin/stats`            | manager/admin | —                                         | Platform totals (users by status, verifications, credits outstanding, bulk jobs, verifications today). |
| `GET   /api/v1/admin/users`            | manager/admin | `?limit&offset&search`                    | Paginated user list (default limit 50) with credits + usage count; `search` filters by email substring. Returns `{ users, total }`. |
| `GET   /api/v1/admin/users/:id`        | manager/admin | —                                         | One user's detail: profile, credits, recent-activity counts.             |
| `POST  /api/v1/admin/users/:id/credits`| manager/admin | `{ amount, mode }` (`mode`=`add`\|`set`)  | Adjust credits. `add` increments (may be negative, clamped at 0); `set` sets an absolute balance (≥0). Recorded in `credit_ledger`. Returns the new balance. |
| `PATCH /api/v1/admin/users/:id/status` | **admin**     | `{ status }` (`active`\|`suspended`\|`banned`) | Change account status. Suspended/banned users are rejected (`403 account suspended`) on verify + bulk. An admin can't suspend/ban themselves. |
| `PATCH /api/v1/admin/users/:id/role`   | **admin**     | `{ role }` (`user`\|`manager`\|`admin`)   | Change a user's role. An admin can't demote themselves, and the change is rejected if it would leave zero admins. |

### Making yourself an admin

1. Make sure your account exists (sign up, or `npm run seed` for `admin@mailverify.local`).
2. Run the admin migration, which promotes `admin@mailverify.local` and
   `test@example.com` to `admin` (idempotent):
   ```bash
   npm run migrate:admin
   ```
   To promote a different account, sign up with one of those emails first, or
   edit `ADMIN_EMAILS` in `src/db/migrate-admin.js`.
3. Log in (`POST /api/v1/auth/login`) to get a fresh JWT — the new role is
   embedded in the token — and call the `/api/v1/admin/*` endpoints with
   `Authorization: Bearer <token>`.

Example:

```bash
# Stats (manager or admin)
curl http://localhost:3000/api/v1/admin/stats -H "Authorization: Bearer $JWT"

# Grant 500 credits to user 42
curl -X POST http://localhost:3000/api/v1/admin/users/42/credits \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"amount":500,"mode":"add"}'

# Suspend user 42 (admin only)
curl -X PATCH http://localhost:3000/api/v1/admin/users/42/status \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'
```

## Manual payments (credit top-ups)

There is **no external payment gateway**. Customers send money manually (bKash,
Rocket, or bank transfer), submit a top-up request, and an admin/manager verifies
it and approves — which credits the account. Approval is transactional and writes
a `credit_ledger` entry (`reason = 'manual_topup'`, `job_id =` the payment id).

Two new tables back this:

- **`credit_packages`** — purchasable bundles shown to customers. Seeded with
  four defaults (1,000 cr / 200 BDT · 5,000 / 800 · 25,000 / 3,000 · 100,000 /
  10,000) the first time the table is empty.
- **`payment_requests`** — one row per top-up request (`pending` → `approved` /
  `rejected`).

Both are part of `schema.sql`; on an existing database add just them (and seed
the packages) with:

```bash
npm run migrate:payments
```

### Customer endpoints

All require a **Bearer JWT** (mounted under **`/api/v1/payments`**); without a
configured database they return `503`.

| Method & path                     | Body / query                                                                  | What it does                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET  /api/v1/payments/packages`  | —                                                                             | List active credit packages (`id, name, credits, price_amount, currency`).  |
| `GET  /api/v1/payments/methods`   | —                                                                             | Manual payment instructions (bKash/Rocket numbers, bank details, note) from env. |
| `POST /api/v1/payments/requests`  | `{ package_id?, method, amount, credits, sender_info, transaction_id, note? }` | Submit a top-up request. `method` ∈ `bkash`\|`rocket`\|`nagad`\|`bank`. If `package_id` is given, the package's `credits`/`amount` are the source of truth (client numbers ignored). Capped at 5 pending requests per user (`429`). |
| `GET  /api/v1/payments/requests`  | —                                                                             | The user's own requests, most recent first (status, amount, credits, etc.). |

### Admin endpoints

Mounted under **`/api/v1/admin`**, all require a **Bearer JWT** + the
`manager`/`admin` role gate.

| Method & path                              | Role          | Body / query             | What it does                                                                 |
| ------------------------------------------ | ------------- | ------------------------ | --------------------------------------------------------------------------- |
| `GET  /api/v1/admin/payments`              | manager/admin | `?status&limit&offset`   | List payment requests joined with user email (pending first). Returns `{ requests, total }`. |
| `POST /api/v1/admin/payments/:id/approve`  | manager/admin | —                        | Approve a **pending** request: credit the user by `credits` in a transaction, stamp reviewer. Double-approval is rejected (`409`). Returns the request + new balance. |
| `POST /api/v1/admin/payments/:id/reject`   | manager/admin | `{ admin_note? }`        | Reject a **pending** request (no credit granted). Returns the updated request. |

### Payment method details (env)

Configure the manual payment instructions via env (sensible defaults so it works
out of the box):

| Variable            | Default                                                       |
| ------------------- | ------------------------------------------------------------ |
| `PAY_BKASH_NUMBER`  | `+8801710363553`                                             |
| `PAY_ROCKET_NUMBER` | `+8801710363553`                                             |
| `PAY_NAGAD_NUMBER`  | `+8801710363553`                                             |
| `PAY_BANK_DETAILS`  | JSON or multiline string; defaults to First Century Bank (SWIFT `FCNSUS32`, Routing `061120084`, Account `4015474546031`, CHECKING, Beneficiary "Monirul Islam"). If valid JSON it is returned as an object; otherwise as a string. |
| `PAY_NOTE`          | Instruction text shown to customers.                         |

```bash
# Submit a top-up request for a package
curl -X POST http://localhost:3000/api/v1/payments/requests \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"package_id":2,"method":"bkash","sender_info":"+8801XXXXXXXXX","transaction_id":"TXN123"}'

# Admin: approve it (credits the user)
curl -X POST http://localhost:3000/api/v1/admin/payments/7/approve \
  -H "Authorization: Bearer $ADMIN_JWT"
```

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
| `PAY_BKASH_NUMBER`  | no       | bKash number shown for manual top-ups (default `+8801710363553`).     |
| `PAY_ROCKET_NUMBER` | no       | Rocket number shown for manual top-ups (default `+8801710363553`).    |
| `PAY_NAGAD_NUMBER`  | no       | Nagad number shown for manual top-ups (default `+8801710363553`).     |
| `PAY_BANK_DETAILS`  | no       | Bank details (JSON or multiline string) for manual top-ups; sensible default. |
| `PAY_NOTE`          | no       | Instruction text shown with the payment methods.                      |

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
