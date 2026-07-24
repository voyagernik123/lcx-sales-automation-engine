# LCX ONE — THE CROWN-JEWEL ARCHITECTURE DOSSIER
**The grand platform, end to end.** For the next engineer, the board, and future-us.
**As of:** 2026-07-24 · prod head `6c03c1a` (+ Phase-7 head after this) · Cloudflare Pages (web) + Render (api, Docker) + Supabase (Postgres).

---

## 0. WHAT THIS IS

LCX ONE is a **multi-platform within a platform** — one deployed app (~80k+ LOC monorepo) that runs several missions for LCX, each a compartmented "workspace," all sharing one identity fabric, one governed-action spine, one audit trail, and one AI substrate. It was built to the doctrine: **Palantir** (ontology, purpose-based access, provenance, decision engines) × **CIA** (need-to-know, tradecraft gates, audit-everything) × **Apple** (one coherent surface) × **Fortune 500** (SLOs, compliance gates, board reporting) × **LCX** (regulated-exchange discipline, LCX-token economics).

Two build programs produced it: the **US-launch COMMAND** platform (5-phase "100X"), then **LCX ONE** (7 phases) which added the workspace fabric and the **PayAgent DISTRIBUTION COMMAND** platform on top.

---

## 1. THE STACK

- **apps/api** — Hono + Drizzle + `pg` on Postgres/Supabase. TypeScript, ESM. Deploys as a Docker image on Render (prod runs compiled `dist/` — `tsc` does NOT copy `.json`, so all seed data is compiled `.ts`).
- **apps/web** — Vite + React 18 + TS + Tailwind. Code-split per route. Deploys to Cloudflare Pages.
- **packages/shared** — pure logic (decision engines, workspace constitution, roster), vitest-tested, consumed by both.
- **Deploy:** push `dev:main` → `lcx-sales` remote → CI builds. **The gate that matters (learned the hard way): run the real emit builds `npm run build -w @lcx/shared && -w @lcx/api && -w @lcx/web` — vitest uses esbuild and does NOT type-check, so an api type error passes tests but fails the Render Docker build silently.** See [gate-must-run-emit-build].

---

## 2. THE FABRIC (LCX OS — Phases 1–2)

**The constitution** (`packages/shared/src/workspaces.ts`): six compiled, git-versioned workspaces — `command`, `sales`, `intel`, `regulatory`, `distribution`, `governance`. Each declares its web routes, API namespaces, mission, sensitivity tier. Zero-drift: the web shell renders nav from it, the API guards namespaces from it, they can never disagree.

**Who may enter** (Postgres, migration 0042): `entitlements` (member × workspace → view/operate/approve, every row a governed grant with who/why), `member_profiles`, `access_requests` (purpose-based front door). The compiled roster (`operators.ts`) is the bootstrap + break-glass source of truth: **Nik, Monty (approvers), Sam (operator)** — all three hold every workspace today (desk decision), but compartmentalization stays live in the machinery.

**Enforcement:** `requireWorkspace(ws, cap)` middleware guards every owned `/v1` namespace (mounted in `app.ts` before routes); `RegistryAction.workspace` + `invokeAction` gate governed writes. **No-lockout covenant:** the loader fail-opens to the legacy full-desk picture on `42P01` (pre-migration) — deploy order can never strand the desk. **Machines** (shared API key, monitors, AI) hold blanket `operate`, never `approve`.

**The front door:** desk sign-in is `email:passcode` verified server-side (timing-safe) against `DESK_PASSCODE` (default `test#1234`, Render-overridable). A bare email opens nothing.

**The Directorate** (`governance` workspace, Phase 2): the `/access` console — entitlement matrix, request inbox, per-member **dossier** (everything they can see + their governed-action footprint, **purpose-gated**: `requirePurpose` writes the reason to the audit spine *before* the read). **Step-up re-auth** on the destructive `revoke_entitlement` (re-enter the passcode). A permanent **red-team suite** (`redteam.test.ts`, `grandAudit.test.ts`) proves the compartments hold: privilege escalation, path-trick bypass, purpose evasion, IDOR, machine scope — all refused.

---

## 3. THE GOVERNED-ACTION SPINE

One path for every server-side mutation: `ACTION_REGISTRY` → `invokeAction`. Each action declares subject types, `minRole`, optional `workspace`, and a zod param schema. `invokeAction` validates → enforces role + workspace entitlement → executes → writes **both** `object_actions` (ledger) and `audit_log` (hash-chained). The AI never writes directly — it proposes; a human confirms; the action records who signed off. Governance gates layer on top: the **SAT gate** (`command_decide` critical decisions need premortem + devil's-advocate), the **compliance gate** (`dist_campaign_set_status` — see §5).

---

## 4. COMMAND (the US-launch platform, `command` workspace)

Zero-drift split: the immutable strategy reference (weighted scorecards, RFI schema, funnel model, 100 graded sources) is compiled into `seed/command/data2.ts` from the strategy workbooks; Postgres (0040/0041) holds only desk-mutable state (RFI values with a C3→B2→A1 provenance ladder, requirements, blockers). Decision engines in `@lcx/shared/commandEngines.ts` (LP rescore + rank-flip sensitivity, waitlist Monte Carlo, listing readiness, token-DD hard gate, program readiness). The AI operator (`commandOperator.ts`): cited Q&A, decision-memo copilot, RFI extractor. Surfaces: US Launch Deck, Partner Pipeline, Command Ops.

---

## 5. DISTRIBUTION COMMAND (PayAgent, `distribution` workspace — LCX ONE Phases 3–7)

**The product:** PayAgent by LCX AI Labs — non-custodial payment links + agent wallets + MCP/Telegram/X + flat LCX fees with a 50% creator rebate. The thesis: agents are customer, channel, and referrer at once; distribution = machine-legibility × machine-payability, run as one closed loop.

- **Ontology** (Phase 3, `seed/distribution/data.ts`): the graded research dossier compiled to an immutable const — 6 rails (x402 top fit-for-LCX), 14 discovery surfaces, 7 competitors, the G1–G8 gap register, funnel/reward model, MiCA/TVTG/X-ban compliance checklist, GEO questions, KOL personas, 38 A/B/C-graded sources. Mutable state (0043): `dist_listings`, `dist_campaigns`, `dist_channel_facts`.
- **Growth engines** (Phase 4, `@lcx/shared/distributionEngines.ts`, pure + seeded): referral K-factor Monte Carlo, emission-budget engine (healthy/watch/breach), quest CAC Monte Carlo, channel-mix optimizer, attribution, presence score.
- **x402 seller layer** (Phase 4, `x402/seller.ts`): a real HTTP-402 handshake pricing LCX data products; **keyless sandbox** until `X402_FACILITATOR_URL` is set — one env flip makes LCX a live Bazaar seller. Public by design (payment is the auth).
- **Cockpit** (Phase 5): the workspace as multi-page — Cockpit (presence dial + funnel + gaps), Listing Ops (governed pipeline), Campaign Ops (live CAC/emission pricing under a budget slider + lifecycle), GEO & Personas, Channel Atlas.
- **The governed loop** (Phase 6): the **compliance gate** on token-incentivized campaign launch — approver authority + active premortem + `legal_check` on `analytic_reviews` + within emission budget, or an audited override; distribution sweep monitors; keyless Galxe/Layer3 exporters; the growth WBR block.
- **The AI operator** (Phase 7, `distributionOperator.ts`): cited Ask-the-Distribution, GEO content drafter, listing-packet drafter, campaign-designer copilot — all grounded in the ontology, deterministic-fallback at $0, and **display-only: the AI never files.**

---

## 6. THE CROSS-CUTTING SUBSTRATE (shared by all workspaces)

Audit log (hash-chained), notifications + daily sweep (per-workspace monitor rules), WBR composer (program + distribution blocks, WoW deltas), SLO latency ring buffer, the dual-provider LLM client (Anthropic → OpenRouter Nemotron at $0 with `reasoning:{enabled:false}` → deterministic fallback; every feature degrades gracefully with no key), `ai_usage_log` telemetry.

---

## 7. OPERATING NOTES

- **Migrations** applied by the desk via Supabase SQL Editor (staged in scratchpad as `APPLY_TO_PROD_00XX.sql`); the API fail-opens until they land. Live on prod: 0040, 0041, 0042, 0043.
- **Prod deploy discipline:** one push per phase; never probe state-changing prod endpoints during a deploy window (old code answers until the rebuild completes).
- **Keyless-first:** every external integration (x402 facilitator, Galxe/Layer3 posting, AI) ships with deterministic degradation and flips on via an env var — never blocked on procurement.
- **External keys/budgets worth provisioning next** (all optional; the platform runs without them): `X402_FACILITATOR_URL` + CDP keys (go-live x402 selling), an Anthropic key (AI quality/privacy upgrade over the free OpenRouter path), Galxe/Layer3/Kaito campaign budgets, X API tier (post-ban rules), OKX AI ASP onboarding.

---

## 8. THE PHASE LEDGER (prod SHAs)

| Program | Phase | SHA |
|---|---|---|
| COMMAND 100X | P1–P5 | f188a83 → 4703d80 |
| LCX ONE | P1 LCX OS | af35769 |
| LCX ONE | roster+passcode hardening | 47c2cd7 |
| LCX ONE | P2 Directorate | b66acb4 |
| LCX ONE | P3 distribution ontology | 2301ba1 |
| LCX ONE | P4 engines + x402 | 9cafb17 |
| LCX ONE | P5 cockpit | c40fded |
| LCX ONE | P6 governed loop | 36027a5 (+ 6c03c1a deploy fix) |
| LCX ONE | P7 AI operator + audit | _this push_ |

**Doctrine, one line:** every fact is source-graded, every write is governed and audited, every compartment is need-to-know, every integration is keyless-first, and the AI drafts but never decides.
