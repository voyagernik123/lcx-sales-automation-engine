# PALANTIR × CIA × FORTUNE-500 × LCX — The 100× Institutional-Grade Plan

**Date:** 2026-07-22 · **Baseline:** commit `69723f5` (54,314-token two-tier universe live)
**Constraint honored:** free-tier infra (Supabase 500MB / Render 512MB / no paid APIs), no subagents used to produce this plan.

---

## 0. Research foundation — what each DNA strand actually means

Grounded in primary sources (Palantir ontology & AIP docs read directly; Palantir insider account
[nabeelqu.co/reflections-on-palantir]; CIA *Tradecraft Primer* (2009) 12 structured analytic
techniques + ICD-203 analytic standards + Admiralty source-grading — canonical public doctrine).

### Palantir's DNA = the Ontology
> "The Ontology is an operational layer for the organization … containing both the **semantic**
> elements (objects, properties, links) and **kinetic** elements (actions, functions, dynamic
> security)." — Palantir Foundry docs

1. **Everything is an object with links** — and every object is *navigable*: search-around
   (pivot from any object to its linked objects), saved explorations, graph views (Vertex),
   object views with consistent tabs.
2. **Writes are first-class and governed** — Action types with typed parameters, validation,
   permissions, audit. Apps don't scatter ad-hoc endpoints; they invoke governed actions.
3. **Object Monitors** — standing watches: *conditions* on object sets → evaluation → notify →
   **act**. The machine watches so analysts don't have to.
4. **Scenarios** — named temporary worlds: fork reality, change assumptions, compare, merge back.
5. The insider account (Airbus A350 4× manufacturing surge): the product is "disparate sources of
   data — work orders, missing parts, quality issues — in one interface, with the ability to
   check off work, see what other teams are doing, and semantically search history."
   **Context is that which is scarce.** Security at the data layer *unlocks* data, not blocks it.

### CIA's DNA = tradecraft that disciplines judgment
1. **Source grading (Admiralty system):** every report carries reliability (A–F) × credibility
   (1–6). Analysts never consume an ungraded claim.
2. **ICD-203 estimative language:** probabilities communicated in calibrated bands
   ("remote… almost certainly"), confidence stated separately from likelihood.
3. **Structured Analytic Techniques:** Key Assumptions Check, Quality-of-Information Check,
   ACH, Indicators/I&W, Devil's Advocacy, What-If, High-Impact/Low-Probability, Premortem.
4. **Collection management:** Priority Intelligence Requirements (PIRs) drive collection;
   gaps are tracked as first-class objects; every sensor serves a named question.
5. **Deception detection:** assume adversarial data (in crypto: wash trading, fake volume,
   sybil communities).

### Fortune-500 DNA = operating rigor
1. **WBR (Weekly Business Review, Amazon-style):** input metrics (not just outputs), WoW deltas,
   exception lists, owner per metric, commitments carried week to week.
2. **Decision log:** decisions are memo objects — context, options considered, rationale,
   owner, review-by date — linked to the entities they touch. Institutional memory ≠ chat history.
3. **SLOs + error budgets:** explicit service levels on data freshness, pipeline health,
   response latency; budget burn visible; management by exception.
4. **Single-threaded ownership:** every deal, metric, and monitor has exactly one named owner.

### LCX's DNA = the regulatory edge
MiCA/ESMA posture, compliance-first listing, the 5-person desk. Already a moat in the data
(ESMA feeds, MiCA registry signal, regulatory news) — must become a first-class *object*, not
a scattering of signals.

---

## 1. Honest gap audit (what exists today vs. the bar)

| Capability | Today (real, shipped) | Institutional bar | Gap |
|---|---|---|---|
| Entity links | EntityChip in 24 files, InspectorHost + payloads | Search-around from ANY object to ALL linked objects; saved explorations; graph view of the sales graph | No pivot/"related" model, no saved explorations, graph exists only for the regulatory toolkit |
| Watches | Hardcoded `ALERT_RULES` (daily cron), flat watchlist table | User-defined monitors: condition builder → evaluate → notify → **act** | No user-defined conditions, no actions on fire |
| Scenarios | One global dial set (closeRate/value/timeline deltas) on 4 surfaces | Named, saved, comparable, shareable scenario objects | Ephemeral, single, local-only |
| Actions | ~40 ad-hoc REST endpoints; approvals + audit_log exist | One governed action registry: typed params, validation, permission, audit, undo | Kinetics scattered; audit coverage uneven |
| Source quality | ProvenancePanel (which source, when) | Admiralty grade on every observation/signal/news item, rolled into conviction | Provenance ≠ graded reliability; conviction ignores source quality |
| Estimative language | Raw numbers (61%, rel 3, conviction 0.42) | ICD-203 bands + separate confidence, everywhere a probability appears | No shared estimative vocabulary |
| SATs | ACH (auto), I&W scan, calibration lift | + KAC, premortem, devil's advocate, what-if on deals; ACH with graded evidence | Human-in-the-loop SATs missing |
| Collection | collection_state SLAs, ops gap ledger | PIR objects driving collection priorities; gaps tied to named questions | Sensors run blind of decisions |
| Weekly rigor | BoardReport (on-demand), KPI snapshots | Auto-WBR: input metrics, WoW deltas, exceptions, commitments, owners | No weekly cadence artifact |
| Decisions | audit_log events, deal events, approvals | Decision-memo objects w/ rationale + review-by, linked to entities | Events ≠ decisions |
| Ownership | `deals.owner` defaults `'operator'`; email auth gives identity | Single-threaded owner on deals/monitors/metrics; "my" views | Attribution exists, ownership not enforced/surfaced |
| AI | Deterministic fallbacks everywhere (no key on prod) | AI operator grounded in the ontology, acting through governed actions | Key-gated seam exists, nothing built on it |

**The thesis:** the platform has world-class *sensors* and *derivations* (universe 54k, conviction,
ACH, I&W, calibration, news). What separates it from Palantir-grade is the **connective tissue**:
objects that pivot, watches that act, judgments that carry grades, decisions that leave memos,
and an AI that operates the machine rather than decorating it.

---

## 2. The five phases

Sequencing logic: **semantic → analytic → kinetic → operating → autonomous.** Each phase is
independently shippable, gate-tested, and free-tier safe. Estimated at ~1 build-unit each
(a unit ≈ the two-tier-universe build).

---

### PHASE 1 — THE ONTOLOGY: every object navigable, the graph visible
*Palantir strand. Foundation for everything after.*

**1.1 Entity registry + search-around API.**
One endpoint: `GET /v1/graph/:type/:id/related` returning typed, counted link groups
(project → people, deals, notes, tasks, news mentions, signals, observations, exchange listings,
competitors-by-category, watchers). Implementation: a `LINK_RESOLVERS` map in
`apps/api/src/graph/links.ts` — each resolver one indexed SQL query. No schema change:
the links already exist as FKs; this makes them *navigable*.

**1.2 "Related" tab in every inspector.**
`components/inspect/RelatedPanel.tsx` — renders the link groups as pivot chips with counts;
click = push next inspector (stack already exists). This is Object-Explorer-style search-around
inside the drawer the app already has everywhere.

**1.3 The Sales Graph (Vertex-lite).**
`/graph` page: force-directed graph (reuse the d3-force machinery from the toolkit's
OntologyExplorer — it's already in the bundle) seeded from any entity, expanding via 1.1.
Depth-capped (2 hops, ≤150 nodes), band-colored, click = inspect. The toolkit half already
proves this pattern works in this codebase.

**1.4 Saved explorations & real search.**
- Save an exploration (seed + expanded set + layout) to a new `explorations` table (JSONB, tiny).
- Upgrade search: `pg_trgm` GIN index on `projects(name, ticker)` + a unified
  `/v1/search?q=` across projects/people/deals/notes/news → Cmd-K becomes a true object
  search over 54k tokens (ILIKE at 54k rows needs the trgm index anyway).

**1.5 Regulatory posture object.**
Fold the scattered regulatory signals (ESMA registry, MiCA flags, jurisdiction, SEC/ESMA news
mentions) into a `regulatoryPosture` block on the project object view — LCX's moat, surfaced
on every dossier.

**Acceptance:** from any project, ≤2 clicks to any linked object; graph renders for any seed;
Cmd-K finds any of 54k tokens in <150ms; explorations persist.

---

### PHASE 2 — TRADECRAFT: graded sources, calibrated language, human SATs
*CIA strand. Makes every number trustworthy and every judgment disciplined.*

**2.1 Admiralty source grading.**
- `packages/shared/src/intel/sourceGrades.ts`: reliability A–F per source (DefiLlama=B,
  CoinPaprika=C, CoinGecko=B, GitHub=A, news outlets individually, gnews=D…), credibility 1–6
  per observation (corroboration count, freshness, variance vs. peers).
- Stamp `grade` into observations/signals/news at write time (no migration: `value_json`/payload).
- **Conviction v2:** weight evidence by grade in `intel/alpha.ts`; ACH matrix shows grades.
- UI: `GradeBadge` (e.g. `B2`) on every evidence row, ProvenancePanel, news items.

**2.2 Estimative language (ICD-203).**
`packages/shared/src/intel/estimative.ts`: map 0–1 → seven bands (remote / very unlikely /
unlikely / roughly even / likely / very likely / almost certain) + separate confidence
(low/med/high from sample size + grade mix). One `<Estimate>` component; sweep every surface
that prints a probability (Targets, forecast, win-prob, propensity, calibration).

**2.3 Human-in-the-loop SATs on deals & targets.**
New `assessments` table (one, generic: kind, subject, content JSONB, author, status):
- **Key Assumptions Check** — structured list w/ "load-bearing? evidence? what breaks?"
- **Premortem** — "it's 6 months later, the listing failed — why?" prompted fields.
- **Devil's advocate** — one-click contrarian brief on any `list_soon` verdict (auto-drafted
  from the negative evidence the ACH already has, human-edited).
- Gate: deals >$25k cannot advance past `negotiating` without a premortem (soft-block w/ override,
  override audited — Fortune-500 governance meets tradecraft).

**2.4 Deception & anomaly widening.**
Extend `anomaly_scan`: wash-trading heuristics (volume/mcap outliers vs. band, volume spikes
w/o news corroboration, exchange-concentration risk). Flag → observation w/ grade F → visibly
poisons conviction (honest, explainable).

**2.5 Indicator trees (I&W v2).**
Upgrade `scan_iw` indications to named indicator sets per play (listing-readiness, migration-risk,
regulatory-heat) with status transitions (quiet → warming → firing) and history — the I&W board
becomes a real warning system.

**Acceptance:** no ungraded evidence visible anywhere; no raw probability without band+confidence;
premortem gate live; anomaly flags demonstrably move conviction.

---

### PHASE 3 — KINETICS: monitors that act, actions that govern, scenarios that fork
*Palantir strand, part 2. The machine starts watching and doing.*

**3.1 Object Monitors (the crown jewel).**
- `monitors` table: owner, name, object-set filter (tier/band/category/mcap/custom), condition
  (predicate + operator + threshold + window: "conviction Δ > 0.15 in 7d", "competitor_count ≥ 5
  and not on LCX", "regulatory-heat indicator firing"), actions (notify / create task / queue
  outreach / promote to tracked / raise priority), cadence.
- Evaluator job `monitors_tick` (cron, reuses withJobRun) — conditions compile to SQL over
  projects/scores/observations; fires → executes actions **through the 3.2 registry** → activity
  log per monitor (fired-when, on-what, did-what).
- UI: `/monitors` — builder (filter chips + condition rows), activity feed, per-monitor
  mute/pause. Watchlist v1 migrates in as trivial monitors.

**3.2 Governed action registry.**
`apps/api/src/actions/registry.ts`: every mutating verb (approve, suppress, snooze, track,
enroll, stage-move, decide-approval, queue-task…) declared once — id, params schema (zod),
permission (operator/approver), audit payload, undo-fn where feasible. Existing routes become
thin wrappers; monitors and (later) AI invoke actions by id. One audit spine, one permission
gate, one place undo lives. `POST /v1/actions/:id/invoke` for generic invocation.

**3.3 Named scenarios.**
Scenario store v2: named saved scenarios (`scenarios` table: name, deltas JSONB, owner,
shared flag) — fork, edit, **compare side-by-side** (forecast distribution A vs B overlay —
the chart kit already draws distributions), apply-to-view (existing mechanics), share with desk.

**3.4 PIR-driven collection.**
`pirs` table: named priority intelligence requirements ("Which top-500 tokens hit listing-
readiness this quarter?", "Which LCX-listed face delisting risk?") linked to monitors,
indicator sets, and collection sources. Ops Health gains a "Collection vs. Requirements" panel:
every sensor row shows *which PIR it serves*; the existing gap ledger becomes gaps *against PIRs*.

**Acceptance:** a monitor created in the UI fires within one tick and executes its action with
full audit; every legacy mutation flows through the registry; two scenarios compare side-by-side;
Ops shows zero orphan sensors (all mapped to a PIR).

---

### PHASE 4 — THE OPERATING SYSTEM: WBR, decision log, SLOs, ownership
*Fortune-500 strand. Turns the tool into an institution.*

**4.1 Auto-WBR.**
`wbr` job (cron, Monday 06:00 UTC) composes from existing data: input metrics (prospects worked,
outreach sent, replies, contacts verified, collection coverage) → output metrics (stage moves,
deals, pipeline $) week-over-week with sparklines; exception list (SLA breaches, stalled deals,
fired monitors unactioned, budget burn); commitments (open tasks w/ owners) carried forward.
Rendered as `/wbr` page + print (BoardReport machinery reused). WoW deltas from kpi_daily_snapshots
(already accruing since 07-13).

**4.2 Decision log.**
`decisions` table: title, context, options-considered, decision, rationale, owner,
review-by date, linked entities (project/deal ids), outcome (filled at review).
- Capture points: deal stage transitions past `negotiating`, approval decisions, suppress-with-
  reason, monitor creation — each offers a 60-second structured memo (prefilled from context).
- `/decisions` page + Decision entries in the entity timeline + review-by reminders via the
  existing notification bell. Six months from now, "why did we pass on X?" has an answer.

**4.3 SLOs & error budgets.**
Formalize what Ops Health half-does: per-source freshness SLO (already), plus API p95 latency,
job success-rate (from job_runs), news-pipeline lag. Each with target, current, 30-day budget
burn. Red budget = banner on Command Center. Management by exception, visible to the desk.

**4.4 Ownership everywhere.**
- `owner` (member id) on deals (real, not `'operator'`), monitors, PIRs, WBR metrics.
- Assignment action (governed, 3.2); "MY DESK" home view: my deals, my monitors' fires,
  my commitments, my review-by decisions. The 5-person desk finally has lanes.

**Acceptance:** WBR waiting every Monday with real WoW deltas; every stage-advance past
negotiating has a decision memo; SLO panel live with budgets; zero ownerless deals/monitors.

---

### PHASE 5 — THE AI OPERATOR: intelligence that acts through the machine
*AIP strand. Gated on `ANTHROPIC_API_KEY` (Render env); every surface degrades to the current
deterministic behavior without it — the seam the codebase already has.*

**5.1 Ontology-grounded dossier Q&A.**
"Ask the dossier" on any project: context assembled from the object graph (1.1) — scores,
graded evidence, news, people, deals, decisions — one Claude call, answers **cite evidence ids
with grades** (renders as EntityChips). No RAG infra needed: the ontology *is* the retrieval.

**5.2 AI through governed actions only.**
The operator proposes; actions execute through the 3.2 registry with `actor='ai'` + full audit +
operator confirm (one-click apply). Palantir's exact model: LLM scoped by the platform's own
security. Surfaces: draft outreach from dossier context, propose plays, propose monitor
conditions ("desks tracking X also watch Y"), triage the queue with reasons.

**5.3 SAT copilots.**
Auto-draft premortems (from negative ACH evidence), devil's-advocate briefs, KAC candidate
assumptions — human edits and owns; AI never files an assessment alone. Tradecraft × AI:
the techniques exist (Phase 2 tables), AI removes the blank-page cost.

**5.4 Narrative layer.**
Morning brief and WBR gain an executive narrative paragraph (grounded strictly in the computed
tables it accompanies; regenerate button; falls back to today's deterministic brief).
Weekly "estimative summary" per top-10 target in ICD-203 language.

**5.5 Anomaly triage.**
New anomaly/monitor fires get an AI first-pass: corroborate against news + graph, classify
(true signal / data artifact / deception-suspect), suggested action — queued for human decision.

**Acceptance:** with key set — dossier Q&A cites graded evidence, every AI write is an audited
registry action w/ confirm; without key — platform identical to Phase-4 state.

---

## 3. Sequencing & safety rails

- **Dependency chain:** 1 (graph) → 2 (grades ride observations) → 3 (monitors act via registry)
  → 4 (WBR/decisions consume all prior) → 5 (AI needs graph + registry + SATs).
- **Storage discipline (Supabase 500MB, currently ~300):** all new tables are JSONB-light and
  desk-scale (assessments, decisions, monitors, scenarios, pirs, explorations — hundreds of rows,
  not thousands). Grades ride inside existing JSONB. No per-catalog-token writes anywhere.
  Projected total impact: <10MB.
- **Migration cadence:** one idempotent migration per phase (0035–0039), same Supabase SQL-editor
  flow as 0034.
- **Gate per phase:** tsc (api/web/shared) + full test suites + build + browser verification
  light/dark + prod smoke — the standing gate.
- **No new paid dependencies.** d3-force is in-bundle; pg_trgm is built into Postgres; Claude
  key is the only optional spend (Phase 5, user's call, everything degrades without it).
- **Rollback:** every phase is additive; feature surfaces mount behind routes — reverting a
  phase is reverting its commit.

## 4. What this buys, in one paragraph

Today the platform *computes* intelligence. After Phase 3 it *acts* on intelligence under
governance; after Phase 4 it *remembers and reviews* like an institution; after Phase 5 it
*converses and proposes* like an analyst — with every claim graded (CIA), every object one
pivot away (Palantir), every decision on the record (Fortune 500), and the regulatory moat
front and center (LCX). That is the difference between a very good internal tool and a system
that feels like it was built by people who run wars, factories, and balance sheets.

---
*Prepared solo (no subagents). Note: WebSearch/WebFetch backends were erroring during research;
primary sources were read directly through the browser pane (Palantir ontology/AIP docs, the
Palantir insider essay), and CIA/Amazon doctrine is cited from canonical public documents
(Tradecraft Primer 2009, ICD-203, Admiralty code, Amazon WBR practice).*
