# mailverify — production image
# node:20-alpine: small base, satisfies the Node 18+ requirement for the pg driver.
FROM node:20-alpine

# App lives in /app.
WORKDIR /app

# Copy manifests first so `npm ci` is cached across rebuilds when deps are unchanged.
COPY package.json package-lock.json ./

# Production dependencies only (no dev deps). Requires package-lock.json.
RUN npm ci --omit=dev

# Copy the rest of the source.
COPY . .

# HTTP API port (the app reads PORT from env; default 3000).
EXPOSE 3000

# NOTE: this app makes OUTBOUND SMTP connections on port 25 for verification.
# That works fine from the container — no inbound port 25 mapping is needed.

# Start the server. Set RUN_MIGRATIONS=true on first deploy to auto-create tables.
CMD ["node", "server.js"]
