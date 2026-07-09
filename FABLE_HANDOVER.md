# LCX Sales Automation Engine — Handover to Fable

*Attach the full repo directory when sharing this prompt.*

---

## Role

You are Fable, an elite full-stack engineer taking over the LCX Sales Automation Engine — a production token-listing business development system for LCX (a Liechtenstein-based crypto exchange). You have the entire monorepo. Read all key files before taking action.

---

## Project Overview

Full-stack automated BD pipeline for token listings targeting EU (MiCA) and US (pre/post CLARITY) markets. It imports 1,889 projects from 8 CSV/XLSX sources, dedupes them, scores them with dual-regulatory frameworks, enriches with CoinGecko market data, runs multi-channel sequenced outreach (email via Resend, LinkedIn via Phantombuster), handles replies via a handoff queue, manages a deal desk with proposal generation, tracks KPIs, and creates post-listing 30/60/90 triggers.

**Stack:** Monorepo (npm workspaces) — Hono + Postgres 16 + Drizzle ORM (API), Vite + React 18 + TS + Tailwind + Zustand (web SPA)

---

## Repository Structure

```
lcx-sales-automation-engine/
├── apps/
│   ├── api/          # Hono Node.js API server
│   │   ├── src/
│   │   │   ├── db/         # Drizzle schema, migrations, pool
│   │   │   ├── enrich/     # CoinGecko enrichment engine
│   │   │   ├── import/     # CSV/XLSX import pipeline + dedupe
│   │   │   ├── kpi/        # KPI aggregation service
│   │   │   ├── lib/        # Env config
│   │   │   ├── middleware/  # Auth (API key), rate limiting
│   │   │   ├── outreach/   # Resend email, LinkedIn, handoffs, scheduler
│   │   │   ├── routes/     # Hono route handlers
│   │   │   ├── score/      # CLI score commands
│   │   │   └── seed/       # Database seed scripts
│   │   ├── Dockerfile
│   │   └── .dockerignore
│   └── web/          # Vite React SPA
│       ├── src/
│       │   ├── components/ # React components
│       │   ├── lib/api/    # API client modules
│       │   ├── pages/      # Page components
│       │   ├── stores/     # Zustand stores
│       │   └── types/      # TypeScript types
│       ├── public/
│       │   └── _redirects  # CF Pages SPA routing
│       └── index.html
├── packages/
│   └── shared/       # Shared TypeScript library
│       └── src/
│           ├── claims/     # Claim library + draft engine
│           ├── deals/      # Deal desk + proposals
│           ├── enrich/     # CoinGecko client
│           ├── outreach/   # Cadence templates
│           └── scoring/    # EU/MiCA + US scoring engines
├── functions/
│   └── api/
│       └── [[catchall]].ts # CF Pages Function for /api/* 503
├── data/
│   └── seeds/        # CSV/XLSX import files (gitignored)
├── scripts/
│   ├── backup.sh     # PostgreSQL backup/restore
│   └── smoke-e2e.sh  # 20-step E2E smoke test
├── fly.toml          # Fly.io deployment config
├── wrangler.toml     # CF Pages build config
├── OPERATOR_SOP.md   # Daily/weekly/incident runbook
└── docker-compose.yml # Local Postgres
```

---

## What Is Already Built (Slices 1-15 Complete)

### Slice 1 — Monorepo Skeleton
- npm workspaces with Hono API + Vite React web
- Postgres pool, health endpoint, operator API-key auth
- Vite proxy, CORS, type-check + tests + build green

### Slice 2 — Import + Dedupe
- Drizzle ORM schema, migration applied, 1,889 projects + 906 people imported
- 8-source CSV/XLSX import pipeline with dedupe
- Projects API with pagination, filters, sorting

### Slice 3 — Dual Scoring Engine
- EU/MiCA (8 factors, 100pts) and US pre/post CLARITY (6 factors, dual weights)
- Orchestrator with combined band, CLI score commands, API endpoints
- 30 golden fixture tests

### Slice 4 — Market-Data Enrichment
- CoinGecko client with rate-limiting, retry, coin list caching
- Project matching (ticker-exact → ticker-fuzzy → name-substring)
- Enrichment engine with delta detection, CLI + API endpoint

### Slice 5 — BD Pipeline UI
- `/bd-pipeline` with sortable score columns, band badge, market tag
- Filters (market/min score/source/band/listed/has contact/search)
- Global CLARITY toggle, Zustand persist for filters

### Slice 6 — Lead Cockpit
- `/bd-pipeline/:id` with identity, dual score breakdown, evidence chips
- People table, signals timeline, source payloads, actions bar
- Approve/Suppress/Re-score/Enrich wired to API

### Slice 7 — Contact Graph
- People CRUD + gate endpoint, editable people section
- Role/email-status badges, contact completeness % on queue table
- 7 enrollment gate tests

### Slice 8 — Claim Library + Draft Engine
- 20 approved claim snippets, 5-touch cadence templates, 6 message rules
- Deterministic draft generator, Draft preview with editor
- Claim Library page at `/claim-library`

### Slice 9 — Email Sequences
- Migration 0003, Resend email client + webhook signature verification
- Scheduler (rate limits, daily cap, step advancement)
- Webhook handler (delivery/bounce/complaint → auto-suppress)
- Enroll/pause/resume/sequences/messages/tick/webhook endpoints
- Enroll button, Pause/Resume, message log on LeadDetail

### Slice 10 — LinkedIn Automation
- Migration 0004, LinkedIn provider interface (Phantombuster + mock)
- Cap enforcement (7/day connections, 50/week, 20/day messages)
- Scheduler updated for LinkedIn channel
- LinkedIn status badge, 9 LinkedIn tests

### Slice 11 — Reply Handoff + Human Queue
- Migration 0005 (handoffs, handoff_events tables)
- Handoff service (create/pause/list/claim/status/notes/re-enroll)
- 7 handoff API endpoints, LinkedIn reply polling
- Frontend Handoff inbox at `/outreach`
- LeadDetail handoff status badge, 7 tests

### Slice 12 — Deal Desk + Proposals
- Package pricing (Listing $20K, Marketing $20K, Liquidity $10K, Dual $50K, EMT $30K)
- canTransition validator, generateProposal with 30-day validity
- Migration 0006 (deals enhanced, deal_events, deal_objections)
- 9 deal API endpoints, DealSection on LeadDetail
- 12 deal tests

### Slice 13 — US Intelligence Wiring
- us-intel.ts signal extractors (state MTL, product feasibility, competitive position, Howey/red flag heuristics)
- recommendedMarket computation (eu_first/us_first/dual/none)
- Migration 0007, US score explainer in orchestrator
- Recommended market filter on BD pipeline
- Tests

### Slice 14 — KPIs + Post-Listing Revenue Loops
- Migration 0008 (kpi_daily_snapshots, post_listing_triggers)
- KPI service: leads/week, reply rate, funnel, revenue by stream, objections, stalled deals, expansion
- `/bd-kpis` dashboard page with stat cards, funnel bars, reply rates, weekly view, revenue table, stalled deals, triggers table
- 30/60/90 triggers auto-created on deal won (12 per deal: 3 days × 4 types)
- CSV export for board updates
- 7 KPI tests

### Slice 15 — Deploy, Harden, Audit, Cutover
- Dockerfile + .dockerignore for API deployment
- Rate limiting middleware (60/300 req/min)
- Audit log UI at `/audit-log` with filters + pagination
- Backup/restore script (`scripts/backup.sh`)
- E2E smoke test (`scripts/smoke-e2e.sh`, 20 steps)
- OPERATOR_SOP.md runbook (daily/weekly/incident/rollback)
- CF Pages Functions for `/api/*` 503 catch-all
- wrangler.toml, fly.toml

---

## Deployment Status

### Frontend (Cloudflare Pages)
- **URL:** https://lcx-sales-automation-engine.pages.dev
- **Account:** 860ae98c4a3a4767c147b580a49ace4f
- **Build:** `npm install && npm run build`
- **Output dir:** `apps/web/dist`
- **Branch:** main
- **Status:** LIVE (auto-deploys from GitHub on push to `main`)

### API Server
- **Status:** NOT DEPLOYED
- The frontend is live but ALL API-dependent features (BD Pipeline, KPI Dashboard, Audit Log, Handoffs, Lead Detail, Deal Desk) show error/retry states because there's no backend.
- CF Pages Functions serve a `503` JSON for `/api/*` as a placeholder.

---

## What Fable Must Do Next

### Immediate: Deploy the API Server

The API is a Node.js Hono app using `pg` (node-postgres), `drizzle-orm`, and `@hono/node-server`. It needs a container-based host.

**Option A — Fly.io** (fly.toml already in repo):
```bash
fly launch --from fly.toml
fly secrets set DATABASE_URL=postgresql://... OPERATOR_API_KEY=<generated> CORS_ORIGINS=https://lcx-sales-automation-engine.pages.dev
fly deploy
```

**Option B — Railway:** Connect the GitHub repo, set build command `docker build -f apps/api/Dockerfile .`, set env vars, deploy.

**Option C — Cloud Run:** `gcloud run deploy lcx-sales-api --source . --dockerfile apps/api/Dockerfile`

After deploying, set `VITE_API_URL=<api-origin>` in the CF Pages dashboard environment variables.

### Set Up Managed Postgres

The API needs Postgres 16. Options:
- **Neon** (serverless, generous free tier)
- **Aiven** (managed Postgres)
- **Supabase** (Postgres + auth)
- **AWS RDS / GCP Cloud SQL**

Run migrations after connecting:
```bash
psql $DATABASE_URL -f apps/api/src/db/migrations/0000_*.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/0001_*.sql
... etc through 0008
```

Or import a dump if one exists.

### Configure External Services (API Keys)

Set these as secrets on the API host:

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | YES | Postgres connection string |
| `OPERATOR_API_KEY` | YES | Auth for all API calls |
| `CORS_ORIGINS` | YES | Comma-separated frontend origins |
| `RESEND_API_KEY` | No (email dead) | Resend.com for sending emails |
| `COINGECKO_API_KEY` | No (rate limited) | CoinGecko Pro for market data |
| `PHANTOMBUSTER_API_KEY` | No (LinkedIn dead) | Phantombuster for LinkedIn automation |

Generate `OPERATOR_API_KEY`:
```bash
openssl rand -hex 32
```

### Set Frontend Env Vars (CF Pages Dashboard)

| Variable | Value |
|---|---|
| `VITE_API_URL` | The API origin (e.g. `https://lcx-sales-api.fly.dev`) |
| `VITE_API_KEY` | Same as `OPERATOR_API_KEY` |
| `NODE_VERSION` | `20` |

### Import Seed Data

The `data/seeds/` directory contains CSV/XLSX files from ESMA, LCX Pipeline, etc. Run:
```bash
npx tsx apps/api/src/seed/index.ts
```
Or use the import API endpoint.

### Verify E2E

```bash
./scripts/smoke-e2e.sh <api_url> <api_key>
```

All 20 steps should pass: health → auth → projects → score → gate → enroll → handoff → deal → proposal → KPIs → triggers → audit → rate limit headers.

---

## Architecture Details

### Auth
- Single operator API key, sent as `Authorization: Bearer <key>` or `X-API-Key: <key>`
- Constant-time comparison via `safeEqual()`
- Rate limiting: 60 req/min global, 300 for authenticated

### Database
- 18+ tables: projects, scores, people, signals, project_sources, outreach_sequences, messages, sequence_enrollments, linkedin_usage, handoffs, handoff_events, deals, deal_events, deal_objections, drafts, suppression, audit_log, post_listing_triggers, kpi_daily_snapshots
- All migrations in `apps/api/src/db/migrations/` (0000-0008)
- Drizzle ORM schema in `apps/api/src/db/schema.ts`

### API Routes (all under `/v1/`)
- `GET /health` — public health check
- `GET /v1/me` — auth verification
- `GET/POST /v1/projects` — list/create projects
- `POST /v1/projects/:id/score` — score a project
- `POST /v1/projects/:id/enrich` — enrich with CoinGecko
- `POST /v1/projects/:id/approve|suppress` — moderation
- `GET/POST/PATCH /v1/projects/:id/people` — people CRUD
- `GET /v1/projects/:id/gate` — enrollment gate check
- `POST /v1/outreach/projects/:id/enroll` — start sequence
- `POST /v1/outreach/tick` — scheduler advancement
- `POST /v1/outreach/webhook` — Resend webhook receiver
- `GET /v1/handoffs` — list handoffs
- `POST /v1/handoffs/synthetic` — create test reply
- `GET/POST/PATCH /v1/deals` — deal desk
- `POST /v1/deals/:id/proposal` — generate proposal
- `GET /v1/deals/:id/events|objections` — deal sub-resources
- `GET /v1/kpis` — KPI dashboard data
- `GET /v1/kpis/export` — CSV download
- `GET/POST/PATCH /v1/kpis/triggers` — post-listing triggers
- `GET /v1/audit` — audit log with filters

### Frontend Pages
| Route | Page | Status |
|---|---|---|
| `/` | Dashboard | Working |
| `/simulator` | Simulator | Working |
| `/bd-pipeline` | BD Engine (ranked queue) | Needs API |
| `/bd-pipeline/:id` | Lead Detail (cockpit) | Needs API |
| `/outreach` | Handoff Queue | Needs API |
| `/bd-kpis` | KPI Dashboard | Needs API |
| `/audit-log` | Audit Log | Needs API |
| `/claim-library` | Claim Library | Working (local data) |
| Other research pages | Ontology, States, etc. | Working (static data) |

### Git Remotes
- `lcx-sales` → `https://github.com/voyagernik123/lcx-sales-automation-engine.git` (CF Pages connected)
- `origin` → `https://github.com/nikcygnusx1/usclaude.git`

---

## Key Files & Their Locations

| Purpose | Path |
|---|---|
| Scoring engine | `packages/shared/src/scoring/` |
| Claim library + drafts | `packages/shared/src/claims/` |
| Deal desk logic | `packages/shared/src/deals/` |
| CoinGecko enrichment | `packages/shared/src/enrich/` |
| Outreach cadence | `packages/shared/src/outreach/` |
| DB schema (all tables) | `apps/api/src/db/schema.ts` |
| DB migrations | `apps/api/src/db/migrations/` |
| API routes | `apps/api/src/routes/` |
| Email + LinkedIn outreach | `apps/api/src/outreach/` |
| Handoff service | `apps/api/src/outreach/handoffs.ts` |
| KPI service | `apps/api/src/kpi/service.ts` |
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Rate limit middleware | `apps/api/src/middleware/rateLimit.ts` |
| API entry point | `apps/api/src/index.ts` |
| App setup (CORS, routes) | `apps/api/src/app.ts` |
| Frontend types/constants | `apps/web/src/types/bd.ts`, `types/kpi.ts` |
| API client | `apps/web/src/lib/apiClient.ts` |
| API endpoint modules | `apps/web/src/lib/api/*.ts` |
| Page components | `apps/web/src/pages/` |
| Sidebar navigation | `apps/web/src/components/layout/Sidebar.tsx` |
| Router | `apps/web/src/router.tsx` |
| Stores | `apps/web/src/stores/` |
| Vite config | `apps/web/vite.config.ts` |
| Dockerfile (API) | `apps/api/Dockerfile` |
| Fly.io config | `fly.toml` |
| CF Pages config | `wrangler.toml` |
| CF Pages Functions | `functions/api/[[catchall]].ts` |
| E2E smoke test | `scripts/smoke-e2e.sh` |
| Backup script | `scripts/backup.sh` |
| Operator runbook | `OPERATOR_SOP.md` |
| Docker Compose (local PG) | `docker-compose.yml` |

---

## Testing

```bash
npm run ci-check   # type-check + test + build (must pass before push)
npm test           # 166 tests across all 3 packages
npm run smoke      # E2E against local API
```

Test files:
- `packages/shared/src/scoring/scoring.test.ts` — 30 scoring tests
- `packages/shared/src/claims/claims.test.ts` — 26 draft/claim tests
- `packages/shared/src/deals/__tests__/deals.test.ts` — 12 deal tests
- `apps/api/src/import/import.test.ts` — 12 import tests
- `apps/api/src/outreach/__tests__/handoffs.test.ts` — 7 handoff tests
- `apps/api/src/outreach/__tests__/linkedin.test.ts` — 9 LinkedIn tests
- `apps/api/src/routes/__tests__/enrich.test.ts` — 2 enrich tests
- `apps/api/src/health.test.ts` — 5 health/auth tests
- `apps/api/src/kpi/__tests__/kpi.test.ts` — 7 KPI tests
- `apps/web/src/types/__tests__/bd.test.ts` — 14 type tests
- `apps/web/src/components/bd/__tests__/ScoreBadge.test.tsx` — 8 badge tests
- `apps/web/src/pages/__tests__/LeadDetail.test.tsx` — 14 component tests
- `apps/web/src/data/__tests__/` — 22 data tests

---

## Key Rules & Constraints

1. **Reply = full stop** — any reply auto-creates a handoff and pauses all active sequences. Never auto-reply.
2. **Post-listing triggers are draft-only** — all 30/60/90 tasks are human-send. Never auto-send.
3. **Telegram never auto-messaged** — even if a contact has telegram, it's manual only.
4. **Planning heuristics disclaimer** — all scoring UIs show "not legal advice" banner.
5. **No secrets in frontend bundle** — API key stored only in localStorage, never in Vite env at build time.
6. **PII retention** — emails, linkedin, telegram stored for outreach; suppression table honors opt-out.
7. **Rate limit** — 60 req/min default, 300 for authenticated. Adjust in `rateLimit.ts`.

---

## Next Phase Priorities (After Deployment)

1. Run CoinGecko enrichment: `npx tsx apps/api/src/enrich/index.ts enrich:all --concurrency 3` (needs API key for acceptable rate limits)
2. Write integration tests for handoff HTTP routes and deal stage transitions via API
3. Set up automated daily KPI snapshots (cron job calling `GET /v1/kpis`)
4. Configure automated Postgres backups (cron job running `scripts/backup.sh`)
5. Optional: Set up Attio sync webhooks for CRM export
6. Optional: Phase 2 — simple logistic regression for dynamic scoring weights
