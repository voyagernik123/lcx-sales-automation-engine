# LCX Sales Engine — The 100x Plan

**Date:** 2026-07-15 · **Scope:** apps/web (+ small, additive API work) · **Basis:** full code audit of both halves of the app (3 parallel deep audits), visual walkthrough, and primary-source research on Linear, Gong, Superhuman, Clay, Attio, Clari, Apollo, Nansen, Arkham, Token Terminal, Bloomberg patterns.

---

## 1 · The Diagnosis (why the sales side feels like a school project)

The Regulatory Toolkit is **one reactive model wearing fifteen costumes**: a deep, cross-referenced dataset feeds a shared derivation layer (`lib/compliance.ts`, `lib/competitiveScoring.ts`), global what-if toggles (`clarityEnacted`, `spdiEquivalence`, safe harbors) recompute *every* view at once, and the result is presented through an opinionated instrument-panel vocabulary — inspector drawers, dependency graphs, gauges, quadrant scatters, live terminals, print-ready memos, a hash-chained audit trail.

The sales side has none of that architecture. The audit found five root causes:

1. **Drill-down by page-swap, not inspection.** `InspectorDrawer` is imported by **6 toolkit pages and 0 sales pages**. Sales drills via full-page navigation → constant context loss and dead ends.
2. **No scenario model.** No sales page subscribes to the event bus; `clarityEnacted` merely swaps one table column. Nothing on the sales side re-computes when you change an assumption — so it feels like static reports, not a living model.
3. **Derived intelligence is computed, then thrown away.** The backend already produces the "why" — and the UI discards it:
   - `scorePropensity()` returns a full explainable reason-trail (mcap band, first-CEX/expansion mode, funding, chain fit…). The UI shows **only the final integer, in an HTML tooltip** (`LeadTable.tsx:108`).
   - `usIntelSignals` (MTL difficulty, product feasibility, competitive position, Howey heuristic, red-flag count) is returned by `/v1/projects` — **zero references in the entire frontend**.
   - `checkGate()` client function exists (`lib/api/bd.ts:75`), endpoint live — **zero callers**. It answers "why can't I outreach this lead."
   - The 10,000-run Monte Carlo forecast is flattened to 4 tiles; per-deal `winProbability` never appears on the Deal Board where you'd act on it.
   - A/B significance stats (lift, z, p-value) render as prose sentences.
4. **Table-first defaults.** MarketMap proves the team can build fitted SVG; it's the lone example. Everything else is `<table>`.
5. **Entities don't link even though the data is a graph.** Audit rows carry project IDs (rendered as dead text), tasks carry `dealId`/`handoffId` (unused), news is ticker-scored to leads (chips not clickable), claims are cited by drafts (no back-reference).

> **The one-sentence thesis:** the toolkit pages are built around *decisions and their consequences*; the sales pages are built around *displaying rows*. 100x = rebuilding the sales side as a reactive decision instrument on data that already exists.

---

## 2 · The Doctrine (8 laws, distilled from the toolkit's DNA)

Every workstream below must obey these. They are what "sophistication" mechanically is:

1. **Every number carries its "why."** No scalar without a click-to-open reason trail. (The toolkit never shows a raw field; it shows a judgment.)
2. **One assumption change reflows everything.** Global scenario state lives in a store + event bus; every panel derives from it.
3. **Inspect in place; never lose context.** Drawer/split-pane first. Full-page navigation only for true workspaces.
4. **Compute client-side judgments in a shared derivation layer** — one `salesIntel.ts`, the analog of `compliance.ts` — so every view agrees.
5. **Every entity name is a link; every ID resolves.** The UI graph must match the data graph.
6. **Bespoke viz fitted to the data** — matrices, timelines, quadrants, distributions — table as the exception.
7. **Actions leave an audit trail and produce artifacts** (print-ready memos, digests) — the "commit" pattern.
8. **Mission-control narrative**: instrument naming, status vocabulary, the cyan "simulation/projection" accent, mono data blocks, live feeds.

---

## 3 · The Four Foundations (build first; everything else falls out)

### F1 — `salesIntel.ts`: the sales derivation layer  *(pure frontend, no API changes)*
A single shared module (mirroring `compliance.ts` + `competitiveScoring.ts`) that computes, from already-fetched data:
- **Deal Health record** per deal: named warnings — *Ghosted (no prospect reply Xd)*, *Single-threaded*, *Stalled in stage (vs column median)*, *Overdue expected close*, *Telegram-silent*, *No next step* (Gong AI Deal Monitor pattern).
- **Likelihood percentile** (Low/Fair/High vs rest of pipeline) from engagement recency, threading, stage velocity, project score — with a signed signal list for the "why" drawer (Gong Deal Predictor pattern; percentile framing, not fake probability).
- **Momentum** = last-7d vs prior-7d activity → ▲/▬/▼/✕ (Clari/Nansen netflow pattern).
- **Reply SLA state** (gray→yellow→orange→red aging; Linear SLA pattern).
- **Playbook completeness** — LCX listing playbook as letter chips: **T**okenomics · **K**YB · **L**egal opinion · **C**ompliance greenlight · **O**ffer sent (Gong playbook-chip pattern).
One selector feeds a dozen surfaces (board cards, queue rows, digests, heatmaps). *This is the highest-leverage single file in the plan.*

### F2 — The Universal Inspector  *(pure frontend)*
Adopt the toolkit's `InspectorDrawer` across the sales side with polymorphic payloads: **Project** (score trails, usIntelSignals gauge cluster, exchange coverage, touch history), **Deal** (health, likelihood-why, events timeline, playbook), **Contact**, **Handoff**, **Claim** (usage back-references). Then a persistent **split-pane mode** (list left, inspector right — Bloomberg Launchpad-lite). Kill every dead-end in the audit's inventory: AuditLog rows, BoardReport top-10, MarketNews tickers, WinLoss chart segments, MarketMap dots (inspect first, navigate second), SendQueue cards, MyTasks deal/handoff links.

### F3 — The Scenario Engine for sales  *(frontend + tiny API)*
- Extend the **existing** global toggles to actually reflow BD surfaces: `clarityEnacted` must re-run reason trails, MarketMap coloring, KPI/forecast assumptions — not just swap a column.
- Add **sales scenarios**: `closeRateDelta`, `discountPolicy`, `focusSegment` dials on Forecast/Deal Desk — drag an assumption, watch pipeline value, forecast band, and per-deal expected value reflow (the CapitalEstimator slider pattern aimed at revenue).
- **Saved views with radar subscriptions** (Linear custom-views pattern): saved screens over the 7,850-project universe that *notify* (in-app + Telegram) when a project enters/leaves — standing radar instead of static filters. *(needs small `saved_views` + notification-rule API)*

### F4 — The Link-Everything pass  *(pure frontend, mechanical)*
Every project name, deal, handoff, task, ticker, claim, audit row becomes a link or inspector trigger. Signals/source payloads get structured renderers instead of `JSON.stringify` dumps.

---

## 4 · Phase Plan

### Phase 0 — "Surface the buried intelligence" *(quick strikes; ~1 week-equivalent; zero schema changes)*
The backend already computed it; show it:
| # | Item | Where | Source |
|---|---|---|---|
| 0.1 | Propensity reason-trail chips ("why they'll pay") | LeadDetail + Project inspector | `scorePropensity()` ReasonTrail — currently tooltip-only |
| 0.2 | `usIntelSignals` mini gauge-cluster/radar | LeadDetail + inspector | already in `/v1/projects` payload, 0 refs |
| 0.3 | Gate banner: "why outreach is blocked" | LeadDetail next-step chip | `checkGate()` — 0 callers |
| 0.4 | Priority = propensity × gate, shown as equation | LeadTable expanded row | `combinePriority` math |
| 0.5 | Per-deal win-probability + health on board cards | DealBoard `DealCard` | `/v1/kpis/forecast` per-deal + F1 |
| 0.6 | Monte Carlo distribution histogram (not 4 tiles) | KpiDashboard ForecastCard | existing 10k-run endpoint |
| 0.7 | A/B comparison bars w/ confidence, not prose | OutreachOps | existing `AbResults` |
| 0.8 | Anomaly deviation/control-band chart | BoardReport | existing z-score payload |
| 0.9 | Link-everything pass (F4) + kill `window.prompt()` win/loss capture → proper dialog | AuditLog, BoardReport, MarketNews, SendQueue, MyTasks, DealBoard | mechanical |
| 0.10 | Adopt unused `StackedBarH`; sequence step funnel (sent→open→reply→handoff) | OutreachOps | existing message stats |

### Phase 1 — "The Work Loop" *(the daily driver: queue → session → zero)*
- **1.1 Triage grammar** on BD Engine: `1` work now · `2` enroll · `3` disqualify(+reason) · `H` snooze · `Space` peek · `J/K` move (Linear Triage).
- **1.2 Split queue with counted streams**: Hot replies / Follow-ups due / New high-scorers / Going stale (Superhuman Split Inbox).
- **1.3 Focus Session mode**: one-prospect-per-screen, "14 of 40" progress, end-of-session recap (Apollo task queue + Superhuman inbox-zero).
- **1.4 Reply SLA chips** everywhere a reply lives; breach feed (Linear SLA).
- **1.5 Snooze until date OR activity** (reply, score jump, gap change) (Linear).
- **1.6 Home → Morning Brief**: overnight replies, SLA at-risk, queue-by-split counts, slipped deals, forecast delta vs yesterday, one suggested focus deal (Linear Pulse).
- **1.7 Zero-state celebration + streaks + personal quota ring** (Superhuman) — the fun.

### Phase 2 — "Deal Intelligence" *(the Gong layer, powered by F1)*
- **2.1 Warnings engine** + pinned warnings column on Deal Desk/Board; click → mitigation drawer.
- **2.2 Likelihood percentile score** with signed-signals "why" drawer.
- **2.3 Two-tone activity timeline strip** per deal row (theirs vs ours, 3 weeks) — ghosting visible at a glance.
- **2.4 Stage-aging vs column median + "slipped ×N" badges**; weekly slip list (Clari Inspect).
- **2.5 Momentum arrows** per deal + pipeline-level weekly snapshot diff (+3 new, 2 pushed, 1 closed).
- **2.6 Playbook letter chips (T·K·L·C·O)** on every card → checklist drawer.
- **2.7 Warnings × owner coaching heatmap** (Gong Deal Drivers) — 5-user self-coaching mirror.
- **2.8 Inline edit with green flash + undo** on Deal Desk tables.

### Phase 3 — "Market Instruments" *(the crypto-native Bloomberg layer)*
- **3.1 Project Entity Page / "Token God Mode"** (Nansen): score history sparkline, component radar, exchange coverage, deal+outreach history, signals timeline, similar-projects rail — built on the F2 inspector chrome so both halves match.
- **3.2 Universe Screener**: filter chips, saved screens, **Δ-since-yesterday mode** highlighting entrants/dropouts (Nansen/Messari).
- **3.3 Watchlists + threshold alerts to Telegram** ("score crosses 85", "lists on Kraken", "reply received") — alerts land where deals close (Nansen Smart Alerts). *(small API: watch rules)*
- **3.4 Exchange-Gap Heat Matrix with action cells**: projects × exchanges grid; click a gap cell → outreach task pre-filled with the gap narrative (data already exists; makes analysis operational).
- **3.5 Standardized comp card** per project + auto-comps vs category peers → doubles as the "why list on LCX" pitch artifact, print-ready like the regulatory memos (Token Terminal).
- **3.6 Pipeline Sankey**: universe→queued→contacted→replied→handoff→negotiation→listed with drop-offs; click a band → cohort (Arkham flows).

### Phase 4 — "Forecast & Trust" *(the credibility layer)*
- **4.1 Forecast projection with "See the math"** side panel: closed-won + stage-weighted pipeline (weights from own historical conversion) + expected-deals, with a historical-window dial — the Simulator pattern aimed at revenue (Gong forecast).
- **4.2 Confidence bands + called-vs-landed**: snapshot the forecast weekly (table exists: kpi snapshots; add forecast column), chart forecast error over time (Clari).
- **4.3 Sales audit trail, hash-chained** (reuse `computeLogHash`) + **printable Deal Review memo** on the BriefGenerator chassis: deal history, health, decisions, digital seal.
- **4.4 Per-user weekly risk digest** (in-app + Telegram): riskiest deals, SLA breaches, stale counts (Gong board subscriptions).
- **4.5 Rule-based field-update suggestions**: reply mentions a date → suggest close-date update; "not now/Q4" → suggest snooze (accept/dismiss chips; LLM optional later).

### Phase 5 — "Terminal Feel" *(presentation & delight, the last 20% that reads as 80%)*
- **5.1 Command codes in Cmd+K** (`q`, `dd`, `fx`, `gap`, `p <name>`) + chorded shortcuts (Bloomberg/Superhuman).
- **5.2 Ambient KPI ticker** strip (replies today · pipeline $ · handoffs this week · top score-mover).
- **5.3 Mission-control renaming & framing** of sales pages (BD Engine → e.g. "Listing Acquisition Command"; consistent instrument subtitles, cyan projection accent, mono data blocks, legends).
- **5.4 Live ops feed** on Morning Brief from the real audit/event stream (the Dashboard terminal, but real).
- **5.5 Saved split-pane workspaces** ("Monday review" = queue + forecast + digest) persisted per user.

---

## 5 · Per-page After-State (one line each)

| Page | Becomes |
|---|---|
| Home | **Morning Brief** — daily briefing + quota ring + live ops feed |
| BD Engine | **Triage cockpit** — splits, keyboard grammar, session mode, radar-subscribed saved screens |
| LeadDetail | **Explainable dossier** — reason trails, usIntel gauges, gate banner, priority equation |
| Exchange Gaps | **Action matrix** — projects × exchanges heat grid, click-to-task |
| Deal Board | **Health board** — warnings, likelihood, momentum, playbook chips, two-tone timelines |
| Deal Desk | **Negotiation instrument** — inline edit, approval chain viz, BATNA panel, scenario dials |
| Outreach Ops | **Deliverability console** — step funnels, A/B bars, send-budget gauges |
| Send Queue / Handoffs | **SLA-driven inbox** — aging chips, split-pane detail, in-app entity hops |
| AI Console | **Dissolved into context** — same engines run inline on real replies/drafts; results persist to entities |
| Win/Loss | **Drillable** — every chart segment → its deals (inspector) |
| Market News | **Signal feed** — tickers hop to entities; bundled per-project signals |
| Market Map | **Inspect-first scatter** — dot → inspector; scenario-aware coloring |
| KPI Dashboard | **Forecast instrument** — distribution, bands, see-the-math, called-vs-landed |
| Board Report | **Linked artifact** — every row drills; anomaly control-bands |
| My Tasks | **Contextual to-dos** — deep-link to the deal stage/reply that spawned each task |
| Customer360 | Merges toward the **Entity Page** (3.1) — one canonical project view |
| Claim Library | **Cross-referenced** — "used in N drafts / N proposals" back-links |
| Audit Log | **Navigable forensics** — structured meta, entity links, hash-chain badge |

---

## 6 · Data & API Deltas (deliberately minimal)

- **None** for Phases 0, most of 1–2 (all client-side derivation over existing payloads).
- Small additive API/table work: `saved_views` + enter/leave notification rules (F3/3.2), watch rules → Telegram (3.3), weekly forecast snapshot column (4.2), snooze-until-activity triggers (1.5), digest cron (4.4). All follow existing patterns (notification rules + cron jobs already exist).
- Optional later: per-person attribution (deals.owner is currently the string `'operator'`) — unlocks real leaderboards; pairs with the parked Google-auth branch.

## 7 · Sequencing, Effort, Success

**Order:** F1+F4 → Phase 0 → F2 → Phase 1 → Phase 2 → F3 → Phase 3 → 4 → 5. (F1 first: one derived-state selector powers ~a dozen patterns. Phase 0 ships visible wow in days and de-risks everything after.)

**Rough effort** (in "focused build units" — one unit ≈ one of the prior big build sessions): F1+F4+P0 ≈ 1 · F2+P1 ≈ 1.5 · P2 ≈ 1 · F3+P3 ≈ 1.5 · P4 ≈ 1 · P5 ≈ 0.5. **Total ≈ 6.5 units.** Heavily parallelizable by page/workstream (same subagent fleet approach as the 50-feature build).

**"100x," operationalized — the plan succeeds when:**
1. Every number on the sales side has a click-to-why (0 orphan scalars; today: ~all).
2. Zero dead-end entities (today: 11 catalogued dead-end classes).
3. One assumption dial visibly reflows ≥5 sales surfaces (today: 0).
4. Daily work happens in session mode with keyboard grammar; queue-to-zero is measured and celebrated.
5. Every deal card answers *health / likelihood / momentum / next action* at a glance without opening it.
6. Weekly forecast ships with bands and a called-vs-landed record.

---

*Prepared from: toolkit design-DNA audit (interconnectivity map, interaction vocabulary, derivation patterns, data-model richness), sales-side gap audit (per-page A–H scorecards, dead-end inventory, unused-backend-richness ranking), and a 36-pattern research catalog (Linear, Gong, Superhuman, Clay, Attio, Clari, Apollo, Nansen, Arkham, Token Terminal, Bloomberg). Full reports available on request.*
