# mailverify — frontend

A React + Vite single-page app for the **mailverify** email verification SaaS.
Signup/login (JWT), a dashboard with credits + usage, real-time single-email
verification, paginated history, and API-key management.

## Tech

- React 18 + Vite
- React Router for routing
- Plain CSS (design tokens in `src/index.css`), Inter font
- No heavy UI library

## Run locally

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:5173.

### Configure the API URL

All requests go to `${VITE_API_URL}/api/v1/...`. Set the backend base URL via the
`VITE_API_URL` env var (Vite inlines `VITE_*` vars at build/dev time):

```bash
cp .env.example .env
# edit .env:
# VITE_API_URL=http://localhost:3000
```

If unset, it defaults to `http://localhost:3000`.

> **CORS:** make sure the backend allows this origin. The backend reads
> `FRONTEND_URL` — set it to `http://localhost:5173` for local dev.

## Build

```bash
npm run build      # outputs static files to dist/
npm run preview    # preview the production build locally
```

## Project structure

```
src/
  api.js                  fetch wrapper (base URL + Bearer auth + error handling)
  context/AuthContext.jsx JWT/session state: login, signup, logout, restore
  components/             Navbar, Logo, Spinner, StatusBadge, ResultCard
  pages/                  Login, Signup, Dashboard, Verify, History, ApiKeys
  index.css               global design system
  App.jsx                 routes + auth gating
  main.jsx                entry point
```

## Deploying on Coolify

This repo ships a multi-stage `Dockerfile` (build with Node, serve `dist/` with
nginx) and an SPA-aware `nginx.conf` (client-side routes work on refresh).

1. Create a Coolify application from this repo using the **Dockerfile** build pack.
2. Set **`VITE_API_URL`** as a **build-time** environment variable / build arg
   (e.g. `https://api.yourdomain.com`). This is critical — Vite bakes the value
   into the bundle at build time, so it must be present when the image builds,
   not just at runtime.
3. The container serves on **port 80**. Point Coolify's proxy/domain at it.
4. Ensure the backend's `FRONTEND_URL` includes this app's public origin so CORS
   requests succeed.

### Why build-time?

Vite is a static-site bundler: `import.meta.env.VITE_API_URL` is replaced with a
literal string during `npm run build`. Changing it later requires a rebuild.
