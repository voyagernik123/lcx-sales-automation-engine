# LCX Sales Automation Engine — Complete Handover to Fable

*Share this document + the full repo directory with Fable (or whoever takes over).*

---

## Role

You are Fable, an elite full-stack engineer taking over the LCX Sales Automation Engine — a production token-listing BD platform for LCX (Liechtenstein-based crypto exchange). You have the entire monorepo. Read all key files before taking action.

---

## Project Overview

Full-stack automated BD pipeline for token listings targeting EU (MiCA) and US (pre/post CLARITY) markets. Currently imports **7,800+ projects** from 8+ CSV/XLSX sources and free CoinGecko API, dedupes them, scores them with dual-regulatory frameworks, enriches with market data, runs multi-channel sequenced outreach (email via Resend, LinkedIn via Phantombuster + manual queue, Telegram DM queue), handles replies via a handoff queue with Telegram conversion, manages a deal desk with proposal generation, tracks KPIs, creates post-listing 30/60/90 triggers, and performs automated contact discovery via polite website crawling.

**Stack:** Monorepo (npm workspaces) — Hono + Postgres 16 + Drizzle ORM (API), Vite + React 18 + TS + Tailwind + Zustand + Recharts (web SPA), Cloudflare Pages (frontend), CF Pages Functions (API catch-all), CF Workers (inbound email), GitHub Actions (scheduled jobs)

---

## Repository Structure

```
lcx-sales-automation-engine/
├── apps/
│   ├── api/                    # Hono Node.js API server
│   │   ├── src/
│   │   │   ├── db/             # Drizzle schema, 15 migrations (0000-0014), pool
│   │   │   ├── enrich/         # CoinGecko enrichment engine
│   │   │   ├── import/         # CSV/XLSX import pipeline + dedupe
│   │   │   ├── kpi/            # KPI aggregation service (15+ metrics, CSV export)
│   │   │   ├── lib/            # Env config
│   │   │   ├── middleware/     # Auth (API key), rate limiting (60/300 req/min)
│   │   │   ├── outreach/       # Resend email, LinkedIn, handoffs, scheduler, send queue
│   │   │   ├── routes/         # Hono route handlers
│   │   │   ├── score/          # CLI score commands
│   │   │   ├── seed/           # Database seed scripts
│   │   │   ├── discovery/      # Polite website crawler + email verification
│   │   │   ├── jobs/           # CLI job runner for scheduled tasks
│   │   │   └── forecasting/    # (placeholder) Predictive deal forecasting
│   │   ├── Dockerfile
│   │   └── .dockerignore
│   └── web/                    # Vite React SPA
│       ├── src/
│       │   ├── components/     # React components (LeadTable, Sidebar, filters)
│       │   ├── lib/api/        # API client modules
│       │   ├── pages/          # 20+ page components
│       │   ├── stores/         # Zustand stores with localStorage persistence
│       │   └── types/          # TypeScript types (500+ lines)
│       ├── public/_redirects   # CF Pages SPA routing
│       └── index.html
├── packages/
│   └── shared/                 # Shared TypeScript library
│       ├── src/
│       │   ├── scoring/        # EU/MiCA + US (pre/post CLARITY) scoring engines
│       │   ├── claims/         # Claim library (20+ claims), draft engine, reply engine, templates
│       │   ├── deals/          # Deal desk: packages, stages, proposals, state machine
│       │   ├── enrich/         # CoinGecko, CoinPaprika, DefiLlama, GeckoTerminal clients
│       │   ├── outreach/       # Cadence constants, mix channel definitions
│       │   ├── analytics/      # (placeholder) Win/loss analysis
│       │   ├── forecast/       # (placeholder) Monte Carlo forecasting
│       │   └── types/          # Shared type definitions
│       └── src/index.ts        # Public API barrel
├── functions/api/
│   └── [[catchall]].ts         # CF Pages Function — /api/* returns 503 JSON
├── workers/inbound-email/      # CF Worker — receives reply@ emails → API webhook
│   ├── worker.js
│   └── wrangler.toml
├── ops/github-workflows/
│   └── jobs.yml                # 6 scheduled cron jobs (market refresh, discovery, scoring, KPIs, universe sync, signal prune)
├── data/seeds/                 # CSV/XLSX import files (gitignored)
├── scripts/
│   ├── backup.sh               # PostgreSQL backup/restore
│   └── smoke-e2e.sh            # 20-step E2E smoke test
├── fly.toml                    # Fly.io deployment config
├── wrangler.toml               # CF Pages build config
├── docker-compose.yml          # Local Postgres
└── OPERATOR_SOP.md             # Daily/weekly/incident runbook
```

---

## What Is Already Built

### Foundation (Original 15 Slices)
| Slice | What | Status |
|-------|------|--------|
| 1 | Monorepo skeleton + Hono API + Vite React + auth + health | ✅ |
| 2 | Import pipeline + dedupe (7,800+ projects, 906 people) | ✅ |
| 3 | Dual scoring engine (EU/MiCA + US pre/post CLARITY) | ✅ |
| 4 | CoinGecko market-data enrichment | ✅ |
| 5 | BD Pipeline UI (sortable table, filters, pagination) | ✅ |
| 6 | Lead Detail cockpit (identity, scoring, people, signals) | ✅ |
| 7 | Contact Graph (people CRUD, enrollment gate) | ✅ |
| 8 | Claim Library (20 approved claims) + Draft Engine | ✅ |
| 9 | Email sequences (Resend, scheduler, webhooks) | ✅ |
| 10 | LinkedIn automation (Phantombuster, cap enforcement) | ✅ |
| 11 | Reply Handoff Queue (human takeover on reply) | ✅ |
| 12 | Deal Desk + Proposals (6 packages, 7 stages) | ✅ |
| 13 | US Intelligence Wiring (signal extractors, Recc. Market) | ✅ |
| 14 | KPIs + Post-Listing Triggers (30/60/90, funnel, CSV) | ✅ |
| 15 | Deploy prep, hardening, audit log, E2E, runbook | ✅ |

### P1-P8 New Features (Built by previous engineer)
| Feature | Files | Description |
|---------|-------|-------------|
| **P1: Polite crawler** | `discovery/crawler.ts` | robots.txt-respecting website crawler, extracts emails + socials |
| **P2: Email ranking + verification** | `discovery/rank.ts`, `verifyEmail.ts` | MX lookup + syntax check; rank by person match > BD inbox > generic |
| **P3: Discovery orchestration** | `discovery/service.ts` | Queue, batch enqueue, cron tick, auto-create people from discovered emails |
| **P4: Free-API universe** | Various | 7,800+ projects from CoinGecko free tier + bulk enrichment pipeline |
| **P5: Assisted send queue** | `outreach/queue.ts`, `routes/queue.ts`, `pages/SendQueue.tsx` | LinkedIn/Telegram human queue with caps, copy, mark-sent, skip, snooze |
| **P6: Email channel completion** | `routes/outreach.ts`, `outreach/scheduler.ts` | Full 5-touch auto-send via Resend with send window compliance |
| **P7: Reply-to-Telegram conversion** | `replyEngine.ts`, handoffs overhaul, `workers/inbound-email/` | 3-angle LLM drafts → every draft ends with Telegram pull |
| **P8: Priority queue UI + scheduled jobs** | `ops/github-workflows/jobs.yml`, send queue page | 6 daily/weekly cron jobs, manual dispatch, GH Actions free tier |

### Database Migrations (0000-0014)
| Migration | Purpose |
|-----------|---------|
| 0000 | Core tables: projects, scores, people, signals, project_sources |
| 0001 | People enrichment columns |
| 0002 | Drafts table |
| 0003 | Outreach sequences, messages, enrollments, suppression |
| 0004 | LinkedIn usage tracking |
| 0005 | Handoffs + handoff events |
| 0006 | Deals enhanced + deal_events + deal_objections |
| 0007 | US intel signals |
| 0008 | KPI snapshots + post-listing triggers |
| 0009 | Market columns on projects, pg_trgm indexes, people-count triggers |
| 0010 | outreach_tasks table (send queue) |
| 0011 | Staging-first ingestion (project_sources content_hash, job_runs) |
| 0012 | project_external_ids (provider ID mapping, no more fuzzy matching) |
| 0013 | listing_labels, propensity/priority scores, KPI snapshot upsert |
| 0014 | discovery_jobs table |

---

## Deployment Status

### Frontend (Cloudflare Pages) — **LIVE**
- **URL:** https://lcx-sales-automation-engine.pages.dev
- **Account:** 860ae98c4a3a4767c147b580a49ace4f
- **Build:** `npm install && npm run build` (output: `apps/web/dist`)
- **Branch:** main → auto-deploys on push
- **API catch-all:** CF Pages Function at `functions/api/[[catchall]].ts` returns `503 {"error":"API server not available"}` for all `/api/*`

### API Server — **NOT DEPLOYED (blocker)**
- All API-dependent pages show error/retry states
- Needs container host: Fly.io (fly.toml ready), Railway, or Cloud Run
- 15 migrations must run against managed Postgres 16

### Frontend Pages (all wired, some blocked by API)
| Route | Component | Status |
|---|---|---|
| `/` | Dashboard | ✅ Working |
| `/simulator` | Simulator | ✅ Working |
| `/bd-pipeline` | BdPipeline (filterable table) | 🔴 Needs API |
| `/bd-pipeline/:id` | LeadDetail (cockpit) | 🔴 Needs API |
| `/outreach` | Handoffs (inbox) | 🔴 Needs API |
| `/send-queue` | SendQueue (human queue) | 🔴 Needs API |
| `/bd-kpis` | KpiDashboard | 🔴 Needs API |
| `/audit-log` | Audit Log | 🔴 Needs API |
| `/claim-library` | Claim Library | ✅ Working (local data) |
| Research pages | Ontology, States, Product Intel | ✅ Working (static data) |

---

## What Fable Must Do IMMEDIATELY

### 1. Deploy the API Server

```bash
# Option A — Fly.io (fly.toml already in repo)
fly launch --from fly.toml
fly secrets set DATABASE_URL=postgresql://... OPERATOR_API_KEY=<generated> CORS_ORIGINS=https://lcx-sales-automation-engine.pages.dev
fly deploy

# Option B — Railway: connect repo, build command `docker build -f apps/api/Dockerfile .`
# Option C — Cloud Run: gcloud run deploy lcx-sales-api --source . --dockerfile apps/api/Dockerfile
```

Generate `OPERATOR_API_KEY`: `openssl rand -hex 32`

### 2. Set Up Managed Postgres 16
Options: Neon (free tier), Aiven, Supabase, AWS RDS.

```bash
# Run all 15 migrations
for f in apps/api/src/db/migrations/00*.sql; do
  psql $DATABASE_URL -f "$f"
done
```

### 3. Configure Environment Secrets

**API host secrets:**
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `OPERATOR_API_KEY` | ✅ | Auth for all API calls |
| `CORS_ORIGINS` | ✅ | Frontend origins (comma-sep) |
| `RESEND_API_KEY` | ❓ | Email sending (Resend.com) |
| `COINGECKO_API_KEY` | ❓ | CoinGecko Pro (free demo key works for limited data) |
| `PHANTOMBUSTER_API_KEY` | ❓ | LinkedIn automation |
| `TELEGRAM_BOT_TOKEN` | ❓ | Telegram bot for DM notifications |

**Frontend env vars (CF Pages dashboard):**
| Variable | Value |
|---|---|
| `VITE_API_URL` | API origin (e.g. `https://lcx-sales-api.fly.dev`) |
| `VITE_API_KEY` | Same as `OPERATOR_API_KEY` |
| `NODE_VERSION` | `20` |

**GitHub Actions secrets (for scheduled jobs):**
| Variable | Value |
|---|---|
| `DATABASE_URL` | Session pooler string (IPv4-compatible) |
| `COINGECKO_API_KEY` | Demo or Pro key |

### 4. Import Seed Data
```bash
npx tsx apps/api/src/seed/index.ts
```

### 5. Deploy CF Inbound Email Worker
```bash
cd workers/inbound-email
wrangler deploy
# Set secrets: API_URL, INBOUND_SECRET
# Configure Cloudflare Email Routing: reply@<domain> → this worker
```

### 6. Verify E2E
```bash
./scripts/smoke-e2e.sh <api_url> <api_key>
```
All 20 steps must pass.

---

## Architecture Details

### Auth
- Single operator API key via `Authorization: Bearer <key>` or `X-API-Key: <key>`
- Constant-time comparison via `safeEqual()`
- Rate limiting: 60 req/min global, 300 for authenticated (DDoS protection)

### Database (18+ tables)
Key tables: `projects`, `scores`, `people`, `signals`, `project_sources`, `outreach_sequences`, `messages`, `sequence_enrollments`, `linkedin_usage`, `handoffs`, `handoff_events`, `outreach_tasks`, `deals`, `deal_events`, `deal_objections`, `drafts`, `suppression`, `audit_log`, `post_listing_triggers`, `kpi_daily_snapshots`, `discovery_jobs`, `job_runs`, `project_external_ids`, `listing_labels`

### API Routes (all under `/v1/`)
| Group | Endpoints |
|-------|-----------|
| Health | `GET /health`, `GET /v1/me` |
| Projects | `GET/POST /v1/projects`, `POST /:id/score|enrich|approve|suppress` |
| People | `GET/POST/PATCH /v1/projects/:id/people`, `GET /gate` |
| Drafts | `POST generate|save`, `GET/PATCH drafts` |
| Claims | `GET /v1/projects/claims` |
| Outreach | `POST enroll|pause|resume`, `GET sequences|messages`, `POST tick`, `POST webhooks/email|inbound` |
| Send Queue | `GET /v1/outreach/queue`, `POST :id/sent|skip|snooze` |
| Handoffs | `GET/POST list|claim|notes|status|re-enroll|moved-to-telegram|reply-drafts|reply` |
| Deals | `GET/POST list|create|stage|proposal|events|objections` |
| KPIs | `GET /v1/kpis`, `GET /export`, `GET/POST/PATCH triggers` |
| Discovery | `POST /v1/discovery/projects/:id|enqueue-batch|tick`, `GET jobs` |
| Audit | `GET /v1/audit` (filterable, paginated) |

---

## Key Files & Their Locations

| Purpose | Path |
|---|---|
| DB schema (all tables) | `apps/api/src/db/schema.ts` |
| DB migrations | `apps/api/src/db/migrations/` |
| API entry point | `apps/api/src/index.ts` |
| App setup (CORS, routes) | `apps/api/src/app.ts` |
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Rate limit middleware | `apps/api/src/middleware/rateLimit.ts` |
| Scoring engine | `packages/shared/src/scoring/` |
| Propensity scoring | `packages/shared/src/scoring/propensity/` |
| Claim library + drafts | `packages/shared/src/claims/` |
| Reply engine (Telegram conversion) | `packages/shared/src/claims/replyEngine.ts` |
| Deal desk logic | `packages/shared/src/deals/` |
| CoinGecko enrichment | `packages/shared/src/enrich/` |
| Outreach cadence | `packages/shared/src/outreach/` |
| Email + LinkedIn outreach | `apps/api/src/outreach/` |
| Send queue | `apps/api/src/outreach/queue.ts` |
| Handoff service | `apps/api/src/outreach/handoffs.ts` |
| Scheduler | `apps/api/src/outreach/scheduler.ts` |
| KPI service | `apps/api/src/kpi/service.ts` |
| Contact discovery | `apps/api/src/discovery/` |
| Jobs CLI | `apps/api/src/jobs/cli.ts` |
| Frontend types | `apps/web/src/types/bd.ts` |
| API client | `apps/web/src/lib/apiClient.ts` |
| BD API calls | `apps/web/src/lib/api/bd.ts` |
| Page components | `apps/web/src/pages/` |
| Sidebar navigation | `apps/web/src/components/layout/Sidebar.tsx` |
| Router | `apps/web/src/router.tsx` |
| Stores | `apps/web/src/stores/` |
| Vite config | `apps/web/vite.config.ts` |
| Dockerfile | `apps/api/Dockerfile` |
| Fly.io config | `fly.toml` |
| CF Pages config | `wrangler.toml` |
| CF Pages Functions | `functions/api/[[catchall]].ts` |
| Inbound email worker | `workers/inbound-email/worker.js` |
| GH Actions jobs | `ops/github-workflows/jobs.yml` |
| E2E smoke test | `scripts/smoke-e2e.sh` |
| Backup script | `scripts/backup.sh` |
| Operator runbook | `OPERATOR_SOP.md` |
| Docker Compose (local PG) | `docker-compose.yml` |

---

## Testing

```bash
npm run ci-check   # type-check + test + build (must pass before push)
npm test           # 166+ tests across all 3 packages
npm run smoke      # E2E against local API
```

Test files:
- `packages/shared/src/scoring/scoring.test.ts` — 30 scoring tests
- `packages/shared/src/claims/claims.test.ts` — 26 draft/claim tests
- `packages/shared/src/claims/replyEngine.test.ts` — 5 reply draft tests
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

**NOTE:** P1-P8 features (discovery queue, send queue, reply drafts, scheduled jobs) have ZERO integration tests. These MUST be added.

---

## Key System Rules (NON-NEGOTIABLE)

1. **Reply = full stop** — any reply auto-creates a handoff and pauses ALL active sequences. Never auto-reply.
2. **Post-listing triggers are draft-only** — ALL 30/60/90 tasks are human-send. Never auto-send.
3. **Telegram never auto-messaged** — Telegram is ALWAYS manual. The queue creates drafts for humans to copy-paste.
4. **LinkedIn never auto-messaged** — same as Telegram. Human must click "Mark sent".
5. **"Not legal advice" banner** — all scoring UIs display this disclaimer.
6. **No secrets in frontend bundle** — API key stored in localStorage, never in Vite env at build time.
7. **PII retention** — emails, LinkedIn, Telegram stored for outreach; suppression table honors opt-out.
8. **Rate limit** — 60 req/min default, 300 for authenticated. Adjust in `rateLimit.ts`.
9. **Every draft ends with Telegram pull** — "t.me/{handle}" is mandatory in every reply draft.

---

# THE 50-FEATURE MASTER PLAN

This is the FULL road map to make this system an insanely capable sales intelligence platform.

| Key | Meaning |
|-----|---------|
| P0 | Ship-blocker. System unusable without it. |
| P1 | Important. Major productivity/revenue impact. |
| P1-P2 | Build after P0s. |
| P2 | Differentiator. High value but not blocking. |

---

## PHASE 1: DEPLOY + FOUNDATION (Weeks 1-2)

These are the absolute prerequisites. Nothing else works without them.

### Must Do Before Anything Else
| # | Task | Why |
|---|------|-----|
| 1 | Deploy API server to Fly.io/Railway | System has no backend |
| 2 | Deploy Postgres + run 15 migrations | No database |
| 3 | Set all env vars (API host, CF Pages, GH Actions) | No connections |
| 4 | Import seed data | No projects, no people |
| 5 | Deploy CF inbound-email worker | No email reply handling |
| 6 | Run E2E smoke test | Verify all 20 steps pass |

---

## PHASE 2: CRM & TEAM COLLABORATION (Weeks 3-8)

Turn the single-operator tool into a multi-user team platform.

### P0 — Ship Now
| # | Feature | Effort | Files to Create/Modify |
|---|---------|--------|----------------------|
| 2-1 | **Team model + lead assignment** | 2-3 weeks | New: `users`, `teams`, `team_members`, `project_assignments`, `assignment_rules` tables. New: `apps/api/src/routes/users.ts`. Modify: middleware/auth.ts (multi-user), routes/handoffs.ts (assignment aware), routes/projects.ts |
| 2-2 | **User roles & permissions** | 1-2 weeks | New: `permissions` table. New: `requirePermission()` middleware. Modify: all route handlers to check permissions. Frontend: `PermissionGate` component, role-based button visibility |
| 2-3 | **Web push + in-app notifications** | 2-3 weeks | New: `notifications`, `web_push_subscriptions`, `notification_preferences` tables. New: `apps/api/src/notifications/` module. WebSocket or SSE transport. Frontend: `NotificationBell`, `NotificationToast`, service worker |

### P1 — Important
| # | Feature | Effort | Files to Create/Modify |
|---|---------|--------|----------------------|
| 2-4 | **Unified activity timeline** | 2 weeks | New: `activity_feed` table (denormalized). New: `GET /v1/projects/:id/timeline`. Frontend: `UnifiedTimeline` component integrating handoff_events + deal_events + messages + signals + audit_log |
| 2-5 | **Drag-and-drop Kanban pipeline** | 2-3 weeks | New: `GET /v1/deals/board` (grouped by stage). Frontend: `PipelineBoard` with react-beautiful-dnd, board card, view toggle (table/board). Uses existing `deals.stage` |
| 2-6 | **Customer 360 view** | 2-3 weeks | New: `GET /v1/projects/:id/360` (composite API response). Frontend: `Customer360Page` with relationship KPIs, timeline, deals, handoffs, documents, tasks, notes, meetings in section accordions |
| 2-7 | **Task management** | 2-3 weeks | New: `tasks`, `task_checklist_items`, `task_reminders` tables. Auto-generation rules (stage transitions, handoffs, stalling triggers). Frontend: `TaskBoard`, `MyTasksPage`, `TaskCreateDrawer` |
| 2-8 | **Rich notes + document sharing** | 2 weeks | New: `project_notes`, `note_versions`, `project_documents` tables. File upload to R2/S3. Frontend: Tiptap rich text editor, `DocumentLibrary`, file uploader |

### P2 — Growth
| # | Feature | Effort |
|---|---------|--------|
| 2-9 | **Meeting scheduling** | 2-3 weeks | Calendly-style booking pages, Google Calendar integration, auto-detect "let's talk" replies |
| 2-10 | **Gmail/Outlook sync** | 4-6 weeks | OAuth 2.0, two-way email sync, thread matching, `EmailThreadView` component |

---

## PHASE 3: AI/ML INTELLIGENCE (Weeks 3-8, parallel with Phase 2)

Add LLM reasoning at every level — drafting, scoring, enrichment, forecasting.

### P0 — Ship Now
| # | Feature | Effort | Weekly LLM Cost | Files to Create/Modify |
|---|---------|--------|-----------------|----------------------|
| 3-1 | **LLM reply drafting** | 2 weeks | $50-100 | Modify: `replyEngine.ts` (add Claude call), `routes/handoffs.ts` (?llm=true param), `handoffs.ts` (pass reply text). UI: toggle between deterministic/LLM drafts |
| 3-2 | **Sentiment analysis on replies** | 1 week | $1-5 | Modify: `handoffs.ts` `createHandoff()` (add LLM classification). DB: add `sentiment`, `signalType` cols to handoffs. Frontend: sentiment badge, auto-sort positive first |

### P1 — Important
| # | Feature | Effort | Weekly LLM Cost | Description |
|---|---------|--------|-----------------|-------------|
| 3-3 | **Narrative scoring** | 3 weeks | $25-50 | LLM analyzes website + whitepaper + team → 40% weight blended with deterministic score |
| 3-4 | **Personalized content generation** | 2 weeks | $9-15 | LLM generates outreach referencing real project details, news, market conditions |
| 3-5 | **Auto objection handling** | 2 weeks | $2-5 | LLM suggests responses per objection using past successful resolutions |
| 3-6 | **LLM enrichment** | 2 weeks | $10-30 | Given project URL, extract team, funding, competitors via LLM |
| 3-7 | **Predictive deal forecasting** | 2 weeks | $0 | ML model (XGBoost/logistic regression) on 36+ historical deals → win probability |
| 3-8 | **Conversation intelligence** | 1 week | $5-10 | One-click thread summary + action items + topics for every handoff |

### P2 — Growth
| # | Feature | Effort |
|---|---------|--------|
| 3-9 | **Smart scheduling optimization** | 2 weeks | Per-recipient timezone detection, adaptive cadence, ML-optimized send times |
| 3-10 | **Win/loss analysis** | 2 weeks | SQL analytics + LLM narrative: which jurisdictions/packages/channels actually win |

---

## PHASE 4: MULTI-CHANNEL OUTREACH ORCHESTRATION (Weeks 4-10)

Expand beyond 5-touch email into omnichannel sequences across 6+ surfaces.

### P0 — Ship Now
| # | Feature | Effort | Files to Create/Modify |
|---|---------|--------|----------------------|
| 4-1 | **Omnichannel sequencing** | 3-4 weeks | New: `sequence_templates` table (DB + CRUD). Modify: `scheduler.ts`, `queue.ts` to support N-step sequences with branch rules. Frontend: sequence builder UI with drag-and-drop step reordering |
| 4-2 | **Smart throttling + anti-burn** | 2-3 weeks | New: `sending_domains` table. Adaptive rate limiter (reply-rate-aware). Domain rotation. Per-LinkedIn-account rotation |
| 4-3 | **LinkedIn advanced automation** | 3-4 weeks | New: `linkedin_accounts` table. Profile viewing engine. Post engagement (like + comment). Connection note personalization. Multi-account round-robin |
| 4-4 | **Mailbox health monitoring** | 1-2 weeks | Real-time bounce/spam/deliverability per domain. Auto-pause on threshold breach. Alert integration |

### P1 — Important
| # | Feature | Effort | Description |
|---|---------|--------|-------------|
| 4-5 | **A/B testing for outreach** | 2-3 weeks | Subject line/body/channel variants with statistical significance engine |
| 4-6 | **Multi-workspace/team orchestration** | 3-4 weeks | Multiple team members' accounts, coordinated sequences, "colleague intro" pattern |
| 4-7 | **Twitter/X social selling** | 3-4 weeks | Monitor target tweets, auto-engage, DM sequences, Twitter API v2 |
| 4-8 | **Warmup automation** | 2-3 weeks | Automated 2-4 week account warmup before sending to prospects |

### P2 — Growth
| # | Feature | Effort |
|---|---------|--------|
| 4-9 | **Telegram/Discord monitoring** | 3-4 weeks | Monitor project channels for listing mentions → auto-create leads |
| 4-10 | **Calendar meeting integration** | 2-3 weeks | Auto-create calendar events from "let's talk" replies, reminders, no-show followup |

---

## PHASE 5: DEAL DESK & CLOSING (Weeks 6-12)

Make the deal closing process world-class — proposals, negotiation, payments, onboarding.

### P0 — Ship Now
| # | Feature | Effort | Files to Create/Modify |
|---|---------|--------|----------------------|
| 5-1 | **Smart proposal generation** | 3-4 weeks | New: `proposal_templates`, `proposal_pricing_rules`, `proposal_tiers` tables. LLM generates dynamic tiered proposals. Comparison table. Frontend: `ProposalWizard` |
| 5-2 | **Negotiation playbook** | 2-3 weeks | New: `negotiation_playbooks`, `playbook_steps`, `batna_tracker` tables. Guided concessions, talking points, competitor offer tracking |
| 5-3 | **Approval workflows** | 2-3 weeks | New: `approval_authority`, `approval_requests`, `approval_steps` tables. Multi-level approval with SLA escalation. Frontend: `ApprovalsDashboard` |

### P1 — Important
| # | Feature | Effort | Description |
|---|---------|--------|-------------|
| 5-4 | **E-signature integration** | 2-3 weeks | DocuSign/HelloSign/PandaDoc. Self-serve signing links. Auto-follow-up on unsigned proposals |
| 5-5 | **Payment & billing** | 3-4 weeks | Invoices, crypto payments (USDC/USDT), milestone-based plans, overdue escalation |
| 5-6 | **Listing launchpad (onboarding)** | 2-3 weeks | Post-sale checklist across Engineering/Compliance/Marketing/Ops with department task assignment |
| 5-7 | **Post-listing success automation** | 2-3 weeks | Enhanced 30/60/90 triggers, liquidity monitoring dashboard, QBR scheduling |

### P2 — Growth
| # | Feature | Effort |
|---|---------|--------|
| 5-8 | **Partner/referral management** | 2-3 weeks | Partner portal, referral tracking, commission auto-calculation |
| 5-9 | **Competitive deal intelligence** | 2-3 weeks | Track competitor offers per deal, "deal coach" AI for positioning |
| 5-10 | **Virtual data room** | 2-3 weeks | Secure per-deal docs, stage-gated access, activity tracking |

---

## PHASE 6: ANALYTICS & INTELLIGENCE (Weeks 6-14)

Turn data into decisions — competitive tracking, forecasting, alerts, board reporting.

### P0 — Ship Now
| # | Feature | Effort | Files to Create/Modify |
|---|---------|--------|----------------------|
| 6-1 | **Competitive exchange tracking** | 3-4 weeks | New: `exchange_listings`, `exchanges`, `listing_gaps` tables. Collect listings from CoinGecko + exchange blogs. Gap analysis: projects listed elsewhere but not LCX |

### P1 — Important
| # | Feature | Effort | Description |
|---|---------|--------|-------------|
| 6-2 | **KPI dashboard with drill-down** | 2-3 weeks | Clickable metrics → filtered pipeline views. Date ranges. Saved views. PDF/PPT export |
| 6-3 | **Revenue forecasting (Monte Carlo)** | 2-3 weeks | Weighted pipeline + 10K simulations → P10/P50/P90 quarterly ranges |
| 6-4 | **Automated board reporting** | 2-3 weeks | Weekly/monthly PDF with LLM-written exec summary. Emailed to execs |
| 6-5 | **Market intelligence feed** | 2-3 weeks | RSS from CryptoPanic + SEC/ESMA. AI-summarized daily briefing. Relevance-scored to pipeline |
| 6-6 | **Trigger-based alerts** | 2-3 weeks | Configurable rules: competitor listed your lead, deal stalled, regulatory change → push notify |

### P2 — Growth
| # | Feature | Effort |
|---|---------|--------|
| 6-7 | **BD performance analytics** | 2-3 weeks | Per-member leaderboard, coaching insights, ramp tracking |
| 6-8 | **Custom report builder** | 3-4 weeks | Drag-and-drop visual builder + SQL mode. Scheduled delivery |
| 6-9 | **Market map visualization** | 2-3 weeks | Interactive bubble chart of 7,800+ projects by category/jurisdiction/mcap |
| 6-10 | **Anomaly detection** | 2-3 weeks | Auto-detect reply rate drops, pipeline crashes, enrichment failures |

---

## PHASE 7: HARDENING & SCALE (Ongoing)

| # | Task | Why |
|---|------|-----|
| 1 | **Integration tests for P1-P8** | Discovery queue, send queue, handoff state machine, reply drafts have zero coverage |
| 2 | **Structured logging** | Replace console.log with structured logger (pino/winston) → Datadog/Sentry |
| 3 | **Error rate monitoring** | Track enrichment failure rates, discovery failure rates, API error rates |
| 4 | **Query performance** | Review slow queries, add missing indexes, materialized views for KPI snapshots |
| 5 | **CI/CD pipeline** | Auto-run tests + deploy on merge to main |
| 6 | **Database backups** | Set up automated daily backups (script exists at `scripts/backup.sh`) |
| 7 | **LLM cost tracking** | Log every LLM call to `ai_usage_log` table. Set budget alerts |
| 8 | **A/B testing framework** | Feature flags for each AI feature to measure lift vs deterministic baseline |

---

## Implementation Summary

| Phase | Focus | Duration | P0 Count | P1 Count | P2 Count |
|-------|-------|----------|----------|----------|----------|
| 1 | Deploy + Foundation | 2 weeks | 6 ops tasks | - | - |
| 2 | CRM & Team Collab | 6 weeks | 3 | 5 | 2 |
| 3 | AI/ML Intelligence | 6 weeks | 2 | 6 | 2 |
| 4 | Multi-Channel Outreach | 7 weeks | 4 | 4 | 2 |
| 5 | Deal Desk & Closing | 7 weeks | 3 | 4 | 3 |
| 6 | Analytics & Intelligence | 8 weeks | 1 | 5 | 4 |
| 7 | Hardening & Scale | Ongoing | 8 ops tasks | - | - |

**Total: 50 features + 14 ops tasks across 7 phases.**

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM API costs spiral | Medium | Medium | Budget alerts, cache identical requests, fallback to deterministic logic |
| LinkedIn account bans | High | High | Warmup mandatory, per-account proxies, conservative defaults, auto-pause on restriction signals |
| Email domain reputation damage | Medium | High | Domain rotation, strict bounce/spam thresholds, mailbox health monitoring (Phase 4 P0) |
| Database performance at scale | Medium | Medium | Index review, materialized views, connection pooling (already in place) |
| Multi-user security breach | Low | Critical | Row-level permissions, audit log, encrypted tokens, proper OAuth |
| New features stall while building Phase 2-6 | High | Medium | Ship Phase 1 first (system is usable). Then parallelize Phase 2-4 |

---

## Git Remotes
- `lcx-sales` → `https://github.com/voyagernik123/lcx-sales-automation-engine.git` (CF Pages connected, auto-deploys main)
- `origin` → `https://github.com/nikcygnusx1/usclaude.git`

## Costs Summary

**Infrastructure:**
- Cloudflare Pages: Free
- API host (Fly.io/Railway): ~$15-50/month
- Managed Postgres (Neon free tier or Aiven ~$20/month)
- GitHub Actions: Free (2000 min/month, jobs use ~5 min/run)
- Cloudflare Workers: Free tier (100k req/day)

**LLM API costs (full rollout):**
- P0 features (reply drafting + sentiment): ~$55-105/week
- P1 features (scoring, enrichment, drafting, forecasting): ~$50-100/week
- Total at full rollout: ~$400-860/month
- ROI: Even 1-2% improvement in close rate generates tens of thousands in additional revenue

**Testing:**
```bash
npm run ci-check   # must pass before any push
npm test           # 166+ tests
npm run smoke      # E2E against live API
```
