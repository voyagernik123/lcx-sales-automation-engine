# LCX ONE — THE GRAND PLATFORM: 7-PHASE IMPLEMENTATION PLAN
**Program:** the Workspace & Identity Layer for the grand LCX platform ("LCX OS") + the PayAgent **DISTRIBUTION COMMAND** platform built inside it.
**Doctrine:** Palantir (ontology, purpose-based access, provenance, decision engines) × CIA (need-to-know compartmentalization, tradecraft gates, audit-everything) × Apple (one coherent surface, zero-training-needed UX) × Fortune 500 (SLOs, compliance gates, board-grade reporting) × LCX (regulated-exchange discipline, LCX-token economics).
**Execution contract:** solo, no subagents, maximum rigor/power/depth/surgical precision/creativity; time is not a constraint. Build → full gate (tsc, 500+ tests, build, perf) → browser verify → single push `dev:main` → prod verify. Phase-by-phase approval by Nik.
**Research base:** `LCX_AGENT_DISTRIBUTION_RESEARCH.md` (2026-07-24) — the graded landscape dossier. Confirmed inputs: product = **PayAgent by LCX AI Labs**; token-incentivized growth is in-scope (compliance-gated); external keys/budgets arrive AFTER the system exists (⇒ every integration ships keyless-first with deterministic degradation, the proven `usedLlm:false` pattern); PayAgent goes x402-compatible (⇒ we build the x402 seller layer + first-seller position now).

---

## WHY A 7-PHASE ARC (the reasoning)

The platform now serves **multiple missions for multiple people**: the CEO's US-launch COMMAND, the BD desk's sales engine, the intel layer, the regulatory toolkit — and next, PayAgent distribution for LCX AI Labs. Today all 55 pages are visible to all 5 roster members; the action registry knows `minRole` but not *mission*. That was correct for one desk; it is wrong for a multi-platform. The CIA principle is **need-to-know**; the Palantir principle is **purpose-based access with audited justification**; the Apple principle is that each person opens the app and sees *their* platform, not everyone's. So the identity/workspace fabric must come FIRST (Phases 1–2), because every later platform — starting with DISTRIBUTION — inherits its guarantees. Phases 3–7 then build DISTRIBUTION COMMAND by the proven 100X arc: **ontology → engines → surfaces → governed loop → AI operator** — the arc that shipped the US COMMAND platform end-to-end.

**Current-state facts this plan is grounded in (code recon 2026-07-24):**
- Roster: `packages/shared/src/operators.ts` — 5 members, roles `viewer|operator|approver` (Monty, Nik = approver). Email-bearer auth (`middleware/auth.ts`), `requireApprover` gate, Google-SSO hardening exists on `feature/google-auth`.
- Nav: one hardcoded `Sidebar.tsx` with ~6 groups / 55 pages, no per-person filtering.
- Governance: `ACTION_REGISTRY` (30+ actions, `minRole`, zod params) → `object_actions` + `audit_log`; SAT gates live on critical decisions; monitors, WBR, SLOs, notifications, AI layer (dual-provider, $0 OpenRouter path) all operational.
- 0040/0041 applied on prod; deploy = Cloudflare Pages + Render via `lcx-sales` remote.

---

# PHASE 1 — LCX OS: IDENTITY, ENTITLEMENTS & THE WORKSPACE FABRIC
*"Who are you, and what do you need?" — answered by architecture, not by a login form.*

**1.1 Workspace taxonomy (the compiled constitution).** Zero-drift compiled registry (`packages/shared/src/workspaces.ts`) declaring the platforms-within-the-platform:
- `command` — US Launch COMMAND (exec)
- `sales` — BD/Sales Engine (desk)
- `intel` — Intelligence & Ontology (cross-cutting analyst layer)
- `regulatory` — Regulatory Toolkit
- `distribution` — PayAgent DISTRIBUTION COMMAND (new; empty shell until Phase 3)
- `governance` — Audit, decisions, WBR, SLOs, admin (approver-weighted)
Each workspace declares: id, name, mission statement, route prefixes, nav tree, default landing, sensitivity tier, owning unit. Every existing page/route is classified into exactly one home workspace (cross-links remain — the graph is shared, the *decks* are compartmented).

**1.2 Identity enrichment.** `TeamMember` grows: unit (Exec/BD/AI Labs/Legal/Ops), title, and a **clearances** map. New DB tables (migration 0042): `member_profiles` (mutable enrichment; compiled roster stays the bootstrap + break-glass source of truth), `entitlements` (member × workspace × capability: `view | operate | approve`), `access_requests` (member, workspace, justification, status, decided_by). RLS on all.
**Backfill rule (no-lockout guarantee):** current members receive entitlements exactly matching today's de-facto access; nothing anyone can do today breaks. Default-deny applies only to *new* workspaces (`distribution`) and *new* members.

**1.3 API enforcement.** Principal now carries entitlements (loaded once, cached). New middleware `requireWorkspace(ws, capability)` applied per route-namespace (`/v1/command/*` → `command`, etc.). `RegistryAction` gains `workspace`; `invokeAction` enforces entitlement *in addition to* `minRole`. API-key principal (cron/machine) gets explicit machine entitlements. 403s are structured (`WORKSPACE_FORBIDDEN`) so the web can render request-access flows instead of dead ends.

**1.4 The shell (Apple discipline).** Workspace switcher in the top chrome (⌘K-integrated); the sidebar renders ONLY the active workspace's tree from the registry (no more one-giant-menu); guarded routes redirect to a "request access" surface with justification capture (Palantir checkpoint pattern); **Home becomes persona-aware MY DESK v2** — your workspaces, your queues (tasks, approvals, monitors, notifications) aggregated across what you're entitled to see, and nothing else.

**1.5 Governed access lifecycle.** `grant_entitlement` / `revoke_entitlement` / `decide_access_request` as approver-only registry actions — every access change is an audited object action with actor + justification. Access-request → notification to approvers → decision → audit trail. CIA rule: access is *given*, never assumed; every grant answers "who, what, why, who approved".

**Gate:** migration 0042 (ELI15 handoff for Supabase), full test gate incl. new authz tests (entitlement matrix, 403 shapes, no-lockout backfill), browser verify of switcher/guards/request flow, deploy, prod verify with a real restricted probe.
**From Nik:** approve the workspace taxonomy + who on the roster belongs to which unit (one-line answers; I'll propose defaults).

---

# PHASE 2 — THE DIRECTORATE: ADMIN CONSOLE, SSO HARDENING & COMPARTMENT PROOFS
*The layer earns "CIA-grade" only when it can prove itself.*

**2.1 Directorate console** (`governance` workspace): roster & profiles manager (DB-backed enrichment over the compiled bootstrap), entitlement matrix editor (member × workspace grid with one-click governed grants), access-request inbox, per-member access dossier ("everything this person can see and every action they've taken" — the counter-intel view).
**2.2 SSO hardening.** Merge/modernize the `feature/google-auth` branch: Google SSO via Supabase JWKS as the primary web login, email-bearer retained as break-glass + API mode; sessions carry entitlement snapshots; step-up confirmation (re-auth) for approver-tier destructive actions.
**2.3 Purpose-based reads.** Sensitive surfaces (member dossiers, full audit log, cross-workspace exports) require a one-line purpose that lands in the audit log — Palantir's checkpoint, implemented in our idiom.
**2.4 Compartment proofs (red-team pass).** Adversarial test suite: privilege-escalation attempts, cross-workspace data leakage via shared endpoints (search-around, notifications, KPI ticker, report builder), IDOR probes on new tables, cron/API-key scope abuse. Fix everything found; the suite becomes part of the permanent gate.
**2.5 Fabric telemetry.** Authz SLO (p95 entitlement check overhead), workspace-scoped notification routing and KPI ticker, per-workspace usage telemetry into WBR ("who actually uses what" — utilization intelligence for the CEO).

**Gate:** full gate + red-team suite green + SSO verified on prod + no-regression sweep of all 6 workspaces.
**From Nik:** Google OAuth credentials in Supabase (I hand you the exact ELI15 steps), confirmation of approver set.

---

# PHASE 3 — DISTRIBUTION COMMAND: THE DEEP ONTOLOGY & PROVENANCE SPINE
*Store the models of distribution, not screenshots of it. (The dossier becomes data.)*

**3.1 Seed compiler.** `compile_distribution_seed.py` (layout-asserted, same discipline as the COMMAND compiler) transforms the research dossier into `distribution/data.ts`:
- **Rails** (x402/ACP/AP2/VIC/Agent Pay/WebMCP) with governance, traction, cost structures, fit-for-LCX scoring;
- **Surfaces & registries** (MCP official/Smithery/mcp.so/PulseMCP, ChatGPT Apps, Claude connectors, x402 Bazaar, Agentic Market, OKX AI, Virtuals ACP, Moltbook, Galxe/Layer3/Zealy, Kaito Studio, GEO targets) each with: type, audience, submission mechanics, telemetry available, constraint notes (e.g. **X incentivized-posting ban Jan-2026** as a hard policy fact);
- **Competitor dossiers** (Prava, Natural, Skyfire, Crossmint, Nevermined, Payman, pay3) with playbook observations;
- **PayAgent product facts** (fees, reward loop, MCP/Telegram/X assets, roadmap: AgentHire, card, Liberty Chain);
- **Gap register G1–G8** and the **channel playbooks** (§2 lessons) as first-class objects;
- **Source register** — every fact carries `srcRefs` into the graded source list (A/B/C), rendered with the existing SourceChip provenance UI.
**3.2 Mutable state (migration 0043):** `dist_listings` (surface × status: not_started|submitted|live|ranked, rank/usage telemetry, owner), `dist_campaigns` (registry of quest/incentive/content campaigns with budget, state machine), `dist_channel_facts` (RFI-style graded overrides: C3 research baseline → B2 verified by us → A1 contractual). Reseeds never clobber desk state (proven ON CONFLICT pattern).
**3.3 API + first surfaces.** `/v1/distribution/deep`, CRUD reads, seed action; inside the `distribution` workspace: **Channel Atlas** (the full landscape as an explorable, provenance-chipped map), **Rails Map** (the standards war rendered), **Competitor Room** (dossier drawers, Prava-style radar vs PayAgent).

**Gate:** compiler assertions green, full gate, browser verify, deploy, 0043 handoff, prod deep-serve verified.
**From Nik:** nothing. (Workspace access defaults: you + AI Labs lead.)

---

# PHASE 4 — THE GROWTH DECISION ENGINES + THE x402 SELLER LAYER
*The strategy contains models; ship the models. (And take the first-seller position on the rail PayAgent is adopting.)*

**4.1 `@lcx/shared` growth engines (pure, tested):**
- **Referral-loop virality sim** — the LCX-rebate loop as a K-factor Monte Carlo: link creation rate, paid-link conversion, agent-referral branching, LCX price scenarios → viral coefficient + reward-cost curves;
- **Token-emission budget engine** — rewards emitted vs fee revenue vs treasury budget; guardrail thresholds that later gate campaign launches (the economics behind "token-incentivized, done well");
- **Quest/campaign CAC Monte Carlo** — triangular cost/conversion ranges per platform (Galxe/Layer3/Zealy baselines from research), gate-aware (compliance gate locks channels the way MSB/MTL locked ads in the funnel sim);
- **Channel-mix optimizer** — weighted rescoring + rank-flip sensitivity across surfaces (reach, agent-density, cost, compliance risk, effort) — the LP-optimizer pattern aimed at channels;
- **Attribution model** — UTM/referral-code/on-chain-event merge rules → per-channel funded-agent attribution (pure logic now, adapters later);
- **Marketplace-rank & SOV scoring** — normalize "sold/uses/rank" telemetry + AI-answer share-of-voice into comparable presence scores.
**4.2 The x402 seller layer (apps/api).** A real `x402/` module: 402-challenge middleware implementing the `exact` scheme handshake shape, a priced-endpoint registry wrapping **LCX data products** (token risk snapshots, market/listing intel derived from the intel layer), facilitator client with **keyless degradation** (no facilitator configured → sandbox mode: challenge issued, settlement simulated, everything logged). The moment PayAgent's x402 work and CDP keys land, LCX flips a env var and becomes one of the first sellers in the Bazaar — and every sale is a PayAgent demo.
**4.3 Engine endpoints** under `/v1/distribution/engines/*` with compiled-default fallbacks.

**Gate:** 25+ new shared tests, x402 handshake integration tests (sandbox), full gate, deploy.
**From Nik:** nothing yet (CDP facilitator keys come later; sandbox proves the machinery).

---

# PHASE 5 — THE WORKING SURFACES: THE DISTRIBUTION COCKPIT
*Instruments a growth operator flies daily — not dashboards to admire.*

- **Distribution Deck** — the workspace flagship: **Presence Dial** (weighted composite: rails live, listings live/ranked, GEO SOV, community reach — honest zero-state like the 10/100 readiness dial was), funnel tiles (links → paid links → active agent wallets → LCX fees), campaign heat, gap-register progress (G1–G8 as living objects);
- **Listing Ops Board** — every surface from the ontology as a governed pipeline (like Partner Pipeline): status selects, rank/usage telemetry fields (manual/CSV until APIs), submission-checklist drawers generated per surface's mechanics;
- **Campaign Ops** — design a campaign against a platform, price it with the CAC Monte Carlo + emission engine *live as you type* (sliders, the funnel-sim pattern), see compliance status; lifecycle: draft → compliance-review → approved → live → measured;
- **GEO Console** — the question inventory ("how can my AI agent pay…"), per-engine answer tracking (manual capture first, Profound-style), content queue with citations;
- **Persona Fleet** — the KOL-agent roster (personas, channels, cadence, draft queues) — surfaces only; the AI drafting arrives in Phase 7;
- **Attribution Ledger** — the unified event view with per-channel attribution readouts.

**Gate:** full gate + browser E2E of every surface + deploy + prod verify.
**From Nik:** 30 minutes in the cockpit — tell me what a growth operator reaches for that isn't there.

---

# PHASE 6 — THE GOVERNED DISTRIBUTION LOOP
*Nothing posts, pays, or promises tokens without governance. This is where "token-incentivized, done well" becomes architecture.*

- **Campaign lifecycle actions** (`dist_campaign_*`): the **COMPLIANCE GATE** — any campaign flagged token-incentivized or paid-promotion requires an active compliance review (premortem + legal-check SATs on `analytic_reviews`, the proven dec_01/dec_19 gate pattern) AND approver launch; overrides audited. MiCA/Liechtenstein marketing-rule checklist compiled into the ontology so the gate cites the actual rule it protects;
- **Budget enforcement in the registry** — emission-engine thresholds enforced at `invokeAction` time: a campaign whose projected reward spend breaches the budget envelope cannot launch without approver override;
- **Listing actions** (`dist_listing_set_status`, telemetry record) — the Listing Ops board goes fully governed;
- **Policy guardrails as monitors** — the X automation-rules constraint encoded as a standing monitor class (any campaign/persona touching X gets flagged against the Jan-2026 policy facts); rank-drop, CAC-breach, stale-listing (>14d submitted without result), and reward-spend-velocity monitors wired into the daily sweep;
- **Keyless platform adapters** — Galxe/Layer3/Zealy campaign-spec **exporters** (JSON/CSV a human pastes into the platform today, the API posts tomorrow), telemetry **importers** (CSV/manual), OKX AI ASP onboarding checklist runner;
- **Growth WBR block** — presence score, funded-agent adds, CAC vs target, reward spend vs envelope, WoW deltas — into the weekly review + notifications.

**Gate:** E2E of the full lifecycle (draft → gate 409 → SATs filed → approved → launch → monitor fires), full gate, deploy, prod verify through governance (never probing prod state-changers during deploy windows — learned lesson, honored).
**From Nik:** the compliance reviewer identity (who files the legal SAT — you, or counsel later; system supports both).

---

# PHASE 7 — THE DISTRIBUTION AI OPERATOR + THE GRAND AUDIT
*The program operator pattern, aimed at growth — then the whole crown jewel gets the hostile once-over.*

**7.1 The operator fleet** (all via governed actions, human-confirmed, deterministic fallback without keys — the AI never publishes):
- **Ask-Distribution** — cited Q&A over the full distribution ontology (`[[src]]` chips, same engine as COMMAND's);
- **GEO content drafter** — answer-engine-optimized articles/FAQ drafted from ontology facts with citations → content queue for approval;
- **Listing submission drafter** — per-surface submission packets (descriptions, metadata, MCP manifests) generated from PayAgent product facts;
- **Campaign designer copilot** — proposes quest/campaign specs pre-priced by the engines, files the premortem draft alongside (SAT copilot pattern);
- **Persona post drafter** — KOL-fleet drafts routed to the approval queue, policy-checked against the platform-rules facts before they even reach a human;
- **Outreach extension** — the existing sales-engine AI aimed at the agent-developer segment (MCP builders, x402 sellers, framework authors) with distribution-specific sequences.
**7.2 The grand audit** — the full-platform hostile pass now that LCX ONE is complete: authz red-team round 2 across all 6 workspaces + new actions; cross-workspace leakage re-proof; x402 layer security (replay, signature, amount tampering); AI-output injection sweep on the new drafters; perf budget across the grown bundle; migration integrity; dead-code/consistency sweep; documentation of the whole architecture (the "crown jewel dossier": one document that explains LCX ONE end-to-end for the next engineer or the board).
**7.3 Final wrap** — prod-verified tour of every phase's flagship, updated memory, handoff list of every external key/budget now worth provisioning (X API tier, Galxe/Kaito, CDP facilitator, OKX ASP) — each one slotting into machinery that already runs without it.

**Gate:** everything. This phase ends with the same standard the 100X build ended with: all surfaces live on prod, all gates green, zero known defects.

---

## STANDING RULES (all phases)
1. **No-regression covenant:** existing workspaces keep working through every phase; the no-lockout backfill is tested, not assumed.
2. **Keyless-first:** every external integration ships with deterministic degradation and flips on via env var — the platform is never blocked on procurement.
3. **Provenance or it didn't happen:** every seeded fact carries graded sources; desk overrides upgrade the grade (C3→B2→A1), never silently replace.
4. **Governed writes only:** every state change in DISTRIBUTION flows through the action registry — audited, attributed, gate-checked.
5. **One push per phase** to `lcx-sales dev:main`; migrations handed to you as ELI15 Supabase pastes; prod verified after every deploy.
6. **Approval protocol:** I finish a phase, deliver the wrap + proof, and wait for your explicit go on the next.

**Phase 1 awaits your approval.**
