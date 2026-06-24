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
- `POST /api/v1/verify/single` — auth (`X-API-Key`), body `{ "email": "..." }`.
- `POST /api/v1/verify/batch` — auth, body `{ "emails": [...] }` (max 100, sync).

## Deploying on Coolify

This repo ships a `Dockerfile` (node:20-alpine) and `.dockerignore`. Point a
Coolify **Docker** application at the repo and set the environment variables
below. The server binds `0.0.0.0:$PORT`, so Coolify's proxy can reach it.

### Environment variables to set

| Variable            | Required | Notes                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------- |
| `PORT`              | no       | Defaults to `3000`. Match Coolify's exposed port.                     |
| `DATABASE_URL`      | yes\*    | Postgres connection string. Enables DB-backed keys, credits, caching. |
| `REDIS_URL`         | no       | Reserved for the queue (Chunk 4B). Can be left empty for now.         |
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
