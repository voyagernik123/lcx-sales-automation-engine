# LCX Sales Automation Engine

Full-stack token-listing BD system: EU/MiCA + US pre/post CLARITY.

## Structure

```
apps/web          React SPA (Vite) — regulatory cockpit + BD UI
apps/api          Hono API + Postgres
packages/shared   Shared types & contracts
```

## Prerequisites

- Node.js 20+
- Docker Desktop (for local Postgres) — optional until DB-backed slices

## Quick start

```bash
# Install all workspaces
npm install

# Start Postgres (requires Docker)
npm run db:up

# Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Run web + API
npm run dev
```

- Web: http://localhost:5173  
- API health: http://localhost:8787/health  

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Web + API concurrently |
| `npm run dev:web` | SPA only |
| `npm run dev:api` | API only |
| `npm run build` | Shared + web production build |
| `npm run type-check` | All packages |
| `npm run test` | API + web tests |
| `npm run ci-check` | type-check + test + build |
| `npm run db:up` | Start Postgres via Docker Compose |

## Auth (v1)

Operator requests to protected routes send:

```
Authorization: Bearer <OPERATOR_API_KEY>
```

or

```
X-API-Key: <OPERATOR_API_KEY>
```

`GET /health` is public.

## Deploy

- **Web:** Cloudflare Pages (`apps/web`, build `npm run build`, output `apps/web/dist` or root build script)
- **API:** container host (Slice 15) — not on Pages
