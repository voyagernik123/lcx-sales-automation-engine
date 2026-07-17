# LCX OS — Final Master Plan
## Palantir depth × Apple clarity × Fortune-500 rigor

**Date:** 2026-07-17
**Supersedes:** `INSTITUTIONAL_GRADE_OVERHAUL.md` (absorbed here as Track A) and the visual sections of `UPGRADE_100X_PLAN.md`.
**Scope:** the definitive end-state specification and execution plan for the platform. No code in this document.

---

# Part 1 — The three pillars, properly understood

The previous plan treated the problem as *visual grade*. That was one layer. The actual target is a synthesis of three disciplines that almost no product achieves simultaneously — which is exactly why achieving it reads as "years of work":

### 1. Palantir — depth and interconnection (the *architecture* pillar)
What makes Foundry/Gotham feel bottomless is not their styling — it's the **ontology**. Everything on screen is an *object* with an identity, relationships, history, and provenance:

- **Everything is an object, everywhere the same.** A "contact" isn't a string on one page and a row on another — it is one canonical object with one canonical rendering at every zoom level, in every context, across the whole platform.
- **Every relationship is traversable.** From any object you can pivot to anything connected to it: person → their projects → those projects' deals → those deals' warnings. The graph *is* the navigation.
- **Every derived number has lineage.** Click any score, forecast, or recommendation and see the evidence tree: raw signal → transformation → value, with timestamps. Nothing is asserted; everything is *shown*.
- **Time is a first-class dimension.** Objects have histories. The system can answer "what changed since Friday?" — not as a log page, but on the objects themselves.
- **Analysis closes the loop.** Insights carry action affordances; actions write back; outcomes feed the models. A report is a live artifact, not an export.

**The brutal insight for us:** we already built fragments of this — the universal inspector with a back stack, click-to-why on warnings, command codes, saved screens. But they're *features on some pages*, not *laws of the platform*. Palantir-grade means promoting them to invariants: no mention without a pivot, no derived number without lineage, no object without history.

### 2. Apple — clarity (the *experience* pillar)
Apple's actual doctrine (HIG: *clarity, deference, depth*) is not minimalism — it is **complexity, mastered**:

- **Progressive disclosure.** Every screen answers one question at rest; every deeper layer is one gesture away. Nothing is imposed, nothing is hidden.
- **Deference.** Chrome recedes; content is the interface. Typography and spacing carry hierarchy, not boxes and colors.
- **Direct manipulation.** You edit the thing itself, where it is — no "edit mode," no detour dialogs.
- **Spatial continuity.** Panels emerge from where you invoked them; back always returns you *exactly* where you were, scroll position included; nothing teleports.
- **Forgiveness over friction.** Undo, not confirmation dialogs. Optimistic response, graceful rollback.
- **Copy as design.** Every word earns its place. Labels are verbs or nouns, never explanations of the UI itself.

**The brutal insight for us:** the app currently *explains itself* ("Everything below opens in place", "Drag a card to advance it") instead of being self-evident, exposes 12 filter controls at rest, and hides depth (glyph codes) without offering disclosure. Apple-grade means every surface passes the test: *obvious at level one, bottomless at level two, and never in your way.*

### 3. Fortune-500 — rigor (the *engineering* pillar)
What a Fortune-500 platform team ships that a school project never has:

- **Every journey completes.** No dead ends: every empty state proposes the next action, every error is recoverable with human-actionable language, every loading state resolves or explains itself.
- **Trust surfaces.** Sync state, data freshness, environment badges, permission visibility — the system continuously proves it's alive and truthful.
- **Governance.** Who can do what is modeled and visible; every write is attributable; approvals have actors and timestamps.
- **Performance as a budget, not an aspiration.** Interaction <100ms, navigation <400ms, cold load <1.5s — enforced, measured, regressed against.
- **Accessibility as table stakes.** Full keyboard operation, focus management, WCAG AA contrast — in both themes.
- **Regression armor.** A screenshot/behavior test harness that makes quality a ratchet: once won, never silently lost.

---

# Part 2 — Where the platform stands against each pillar

**Against Palantir:** ~25%. The inspector (4 payload types, back stack), click-to-why on warnings/likelihood, and cmd-codes are genuine ontology seeds. But: entities render differently on every page; most mentions are dead text; lineage covers 2 of ~9 derived-number families; history lives only in a segregated Audit Log page; reports are snapshots; contact/person is barely an object at all.

**Against Apple:** ~20%. Progressive disclosure exists only in the inspector. Filters sprawl. Editing routes through dialogs. Tutorial copy is permanent. Codes have no disclosure. Motion is ad-hoc. Two voices (gamified + debug) fight across surfaces. The greeting band spends the best pixels on the least information.

**Against Fortune-500:** ~35%. Tests exist and gates are real (123 web / 105 api / 87 shared) — genuinely above average. But: no font is loaded (!), degenerate statistics render unchecked (400% reply rate, single-segment donut), seed data is labeled [DEMO] with round numbers, errors surface as raw strings, no undo anywhere, no perf budgets, no screenshot regression, dark theme is an inversion trick that keeps producing contrast bugs.

*(The full surface-grade audit — fonts, small-n discipline, shell, geometry, seed realism — is in `INSTITUTIONAL_GRADE_OVERHAUL.md` and remains valid. It is now Track A of this plan.)*

---

# Part 3 — The Ontology (Palantir layer)

## 3.1 The object model
Eleven object types. This is the platform's periodic table — every pixel that names one of these must behave identically everywhere:

| # | Object | Identity | Core vitals (the "3 numbers") |
|---|--------|----------|-------------------------------|
| 1 | **Project** | token/company (ticker) | score, market rec, stage |
| 2 | **Contact** | person | role, thread state, last touch |
| 3 | **Deal** | commercial pursuit | value, likelihood, momentum |
| 4 | **Listing** | live asset post-win | volume, 30/60/90 status, health |
| 5 | **Interaction** | email/telegram/call/meeting | channel, direction, sentiment |
| 6 | **Claim** | regulatory/marketing claim | approval state, evidence count, jurisdiction |
| 7 | **Jurisdiction state** | per-market posture | scenario (pre/post-CLARITY), gate status |
| 8 | **Signal** | market/news/on-chain event | type, severity, freshness |
| 9 | **Task** | work item | due, owner, source |
| 10 | **Document** | proposal/agreement/report | type, version, state |
| 11 | **Decision** | approval / win-loss / disqualify | actor, rationale, timestamp |

**Relations (traversable, both directions):** Deal↔Project, Deal↔Contact(role), Interaction↔{Deal, Contact}, Claim↔{Project, Jurisdiction, Evidence-Document}, Signal↔Project, Task↔{Deal, Contact, source-object}, Decision↔anything, Listing↔Deal.

## 3.2 The four zoom levels (canonical renderers — the core build)
Every object type gets exactly four renderings, used *everywhere* with zero exceptions:

- **L1 · Mention** — inline entity chip: name (+ticker/role glyph), state dot. Always interactive. *Law: a dead entity name anywhere in the app is a bug.*
- **L2 · Peek** — hover card (300ms delay): identity, the 3 vitals, state, last-activity stamp, 2 primary actions. Cheap curiosity, zero navigation cost.
- **L3 · Inspector** — the existing drawer, generalized to all 11 types: full vitals, **relation rails** (pivot lists: "3 contacts · 12 interactions · 2 claims"), lineage panel, history strip, actions. Pivots push onto the existing back stack — the breadcrumb of the traversal (`AetherSwap ▸ Marta Keller ▸ Solaris deal`) is visible and clickable.
- **L4 · Workspace** — the full page (exists for most types; Contact and Signal need promotion from strings to pages).

This single subsystem — an object registry mapping `type → {chip, peek, inspector-payload, route}` — is the highest-leverage build in the entire plan. Once it exists, every page that renders a name gets Palantir-grade connectivity by construction.

## 3.3 Lineage — "why?" as a universal right
Current: warnings and likelihood explain themselves. Target: **every derived value in the platform implements the same contract**:

- Families: propensity/priority scores, likelihood percentile, momentum, forecast (called + Monte Carlo), SLA state, market recommendation, playbook next-step, warning set, report aggregates.
- Uniform affordance: derived values render with a subtle dotted underline. Click → **evidence tree** in the inspector: `source fact (timestamp) → transform → contribution → value`. Signed contributions shown as +/− bars (the likelihood panel already does this — it becomes the template).
- Evidence facts are themselves L1 mentions (an interaction, a signal, a decision) — so lineage is *also* navigation. This is the exact mechanic that makes Foundry feel bottomless.

## 3.4 Time — objects remember
- **History strip on every inspector**: last N changes (stage moves, score changes, decisions, outreach) rendered as a compact timeline — sourced from the existing audit tables, surfaced per-object instead of only on the Audit Log page.
- **"Since you were here" diffs**: per-user last-seen watermark per surface; objects changed since then carry a discreet delta marker (Home already computes overnight — generalize the mechanic).
- **As-of context for forecasts**: forecast history (migration 0028) renders called-vs-landed *as of each week* — the trust layer already planned, now framed as time-travel on the Forecast object.

## 3.5 Closing the loop — analysis writes back
- Every insight surface carries its action *in place*: warning → "queue the fix" (exists in places — make law); gap matrix cell → open the outreach composer pre-filled; forecast miss → annotate cause.
- **Decisions are objects**: win/loss reasons, disqualifications, approvals — all captured with actor + rationale, all feeding back (win/loss reasons visibly re-weight likelihood signals; the lineage tree shows the feedback: *"likelihood −8: 2 losses citing 'fee structure' in this segment"*). The platform demonstrably *learns*, which is the deepest possible signal of seriousness.
- **Reports are live**: Board Report blocks are queries with an as-of stamp, re-run on open; annotations persist as Decision objects pinned to the report.

---

# Part 4 — The design language (Apple layer)

## 4.1 The interaction grammar (five rules, no exceptions)
1. **One question per screen at rest.** Each surface has a declared primary question (Home: "what needs me now?" · Deal Board: "where is the money?" · BD Engine: "who's next?"). Everything not answering it starts collapsed.
2. **Three depths, one gesture apart.** Glance (L1/L2) → inspect (L3) → work (L4). Hover is free, click is cheap, navigation is rare and intentional.
3. **Edit in place.** Deal value, stage, owner, next step, notes: click-to-edit inline with optimistic save. Dialogs are reserved for compound creations and true forks (win/loss reasons).
4. **Undo, don't confirm.** Reversible actions execute immediately with a 6-second undo toast (snooze, disqualify, stage move, enroll). Confirmation dialogs only where genuinely irreversible (send, approve, delete).
5. **Spatial continuity.** Inspector slides from the click side; back restores scroll and focus exactly; pivot breadcrumbs preserve the path; page transitions never white-flash.

## 4.2 Deference — chrome recedes
- The Track-A shell (single-tone chrome, hairlines, status bar) is the prerequisite; on top of it: content typography carries hierarchy — boxes and background tints are demoted from "decoration" to "meaning only".
- **Filter tokens replace filter rows** (the single biggest visible Apple-ism): one 32px bar reading like a sentence — `Market: EU × · Band: Immediate × · +Filter` — with typeahead. BD Engine's current 12-control strip collapses to this. Saved screens become saved token-sets.
- Density with calm: dense *tables*, quiet *chrome*. Bloomberg density inside Apple frames.

## 4.3 Disclosure of complexity (the codes get their dignity)
- Every glyph/code (`P86`, `T·K·L·C·O`, momentum arrows, percentile pills) gets: hover = plain-language tooltip; surface-level `?` = legend popover; first-ever encounter = one-time 2-line explainer. Complexity stays; confusion dies.
- Advanced instruments (scenario dials, Monte Carlo, gap matrix) present the *conclusion first*, mechanics behind a disclosure ("How this is computed" → the lineage tree from 3.3 — one mechanism, two pillars served).

## 4.4 Motion & materials
- One timing system: 120ms hover / 160ms state / 200ms panel, ease-out, transform+opacity only. Live values crossfade (300ms); nothing jumps, nothing bounces.
- Overlay hierarchy: peek (no scrim) → inspector (soft scrim, page stays visible = context preserved) → dialog (full scrim, rare by rule 4).
- Focus is designed: opening a panel moves focus in; Esc walks the stack back out; keyboard path exists for every mouse path (J/K/Space grammar already proves the muscle — extend it platform-wide).

## 4.5 Copy — one voice
- Register: calm, declarative, specific — a senior operator talking to another. Sentence case universally.
- Deletions: all self-explanation ("opens in place", drag tutorials → `?` popovers), all gamification on work surfaces (streaks/rings shrink to one quiet line in a personal corner), all exclamation marks.
- Numbers in copy obey the formatting bible (Track A): "$48.5K · 3d ago · 2 of 4" — never "$48,500.00", never "400%".

---

# Part 5 — The rigor layer (Fortune-500)

## 5.1 Reliability surfaces
- **Status bar** (Track A) carries: connection dot + latency, last-sync age per data family, environment badge, version, identity, SIM indicator when scenario dials are hot.
- Optimistic updates everywhere with rollback toasts; SSE already streams — reconnection states become visible ("reconnecting… 3s") instead of silent.
- Error taxonomy: every API error maps to one of 5 user-facing classes (auth, permission, validation, conflict, system) with designed recovery copy. Raw error strings on screen = release blocker.

## 5.2 Governance
- Role model formalized: **viewer / operator / approver** (approval flows in Deal Desk already imply it). Affordances users can't exercise render disabled-with-reason, not hidden — visibility of governance *is* the professionalism signal.
- Every write attributable (actor stamps already exist in audit — surface them at the point of data: "stage moved by Sam · Tue").
- Freshness SLOs: each data family declares its expected refresh cadence; staleness beyond SLO surfaces amber in the status bar.

## 5.3 Performance budgets (enforced, not aspired)
- Interaction <100ms · route change <400ms · cold load <1.5s · any list >200 rows virtualized (BD Engine's 7,870 rows are the forcing function).
- Code-split by route (the 500KB-chunk warning in every build is the current debt); measure via Lighthouse CI on the two heaviest pages per release.

## 5.4 Accessibility
- WCAG AA contrast in **both** themes (the parallel dark palette from Track A makes this provable instead of whack-a-mole); full keyboard completeness audit; focus traps in all overlays; charts get text equivalents (the tooltip-as-data pattern already helps).

## 5.5 Regression armor
- Playwright screenshot suite: 12 flagship states × 2 themes, diffed per PR. Interaction smoke: open peek → pivot inspector → back-stack → edit inline → undo. This is what makes every quality win permanent — the ratchet.

---

# Part 6 — Flagship surfaces under all three pillars

**Home → "Desk".** One status line (date · attention count · quota). Two instruments: *Queue* (4-row mini-table, ages, all rows = L1 mentions) and *Pipeline* (value, weighted, stage micro-distribution). At-risk list: each row peek-able, each warning lineage-clickable. "Since Friday" diff markers on changed objects. Ops feed stays terminal-styled, matching the status bar.

**BD Engine → the instrument of record.** Virtualized grid; filter tokens; score cells = number + inline bar with lineage-click (evidence tree: the signals behind 92); every project/contact cell = L1 mention with L2 peek (vitals without leaving the list); splits/triage/session grammar untouched — it's already the best surface; it becomes the template, not the exception.

**Deal Board.** Empty stages collapse to rails; header = open/weighted/stage totals; cards keep the pass-3 hierarchy; every element peek/lineage-wired; stage moves = optimistic + undo toast; win/loss dialog captures the Decision object that visibly feeds likelihood (the learning loop, on stage).

**Deal Desk.** Approvals show actor/role/timestamp trails; invoices/partners rows all L1-wired; scenario dials present conclusion-first with "how computed" disclosure; playbook steps write history to the deal's timeline.

**KPI / Forecast → "Instruments".** All Track-A fixes (small-n, real axes), plus: every aggregate lineage-clicks to its underlying object list ("Deals won: 1" → that deal); called-vs-landed as-of view; annotations on misses persist as Decisions.

**Contact → promoted to a first-class object** (the biggest ontology gap): workspace page with thread state, all interactions across all projects, relationship map, reply-SLA history. Single-threaded warnings finally pivot to *the person they're about*.

**Board Report → live document.** Query-backed blocks, as-of stamps, annotation layer, one-click "open the underlying list" on every figure. The report a Fortune-500 board actually gets.

---

# Part 7 — Execution plan

Four tracks. A is the prerequisite; B is the soul; C is the feel; D is the armor. Sizes assume focused agent-sessions with the standard gate (tsc · vitest · build · both-theme screenshots).

| Phase | Track | Scope | Size | Unlocks |
|-------|-------|-------|------|---------|
| **A1** | Grade | Fonts self-hosted · geometry/elevation rebalance · formatting bible module | S | Everything visual after |
| **A2** | Grade | Shell: single-tone chrome, command bar, status bar, sidebar refit | M | The identity |
| **A3** | Grade | Small-n metric policy · seed realism (45–60 deals, 9mo history, no [DEMO]) | M | Credibility; makes B/C visible |
| **B1** | Depth | **Object registry + L1 chips + L2 peeks** for all 11 types; inspector generalized; pivot rails + breadcrumb | L | The ontology — largest single lever in the plan |
| **B2** | Depth | Lineage contract: dotted-underline affordance + evidence trees for all 9 derived-value families | M | "Why?" as a right |
| **B3** | Depth | Object history strips · "since you were here" diffs · Contact workspace page | M | Time + the missing object |
| **B4** | Depth | Decisions-as-objects feeding likelihood · live Board Report | M | The learning loop |
| **C1** | Clarity | Filter tokens (BD Engine first, then app-wide) · inline editing · undo-toast pattern | M | The Apple feel |
| **C2** | Clarity | Copy sweep (one voice) · legends/disclosure for all codes · Home/Deal Board recomposition | S–M | Coherence |
| **C3** | Clarity | Motion system + focus/spatial-continuity audit | S | Polish that stays |
| **D1** | Rigor | Dark theme as parallel palette · error taxonomy · optimistic/rollback sweep | M | Ends the bug classes |
| **D2** | Rigor | Virtualized grid (BD Engine + all >200-row lists) · route code-splitting · perf budgets in CI | M | Scale honesty |
| **D3** | Rigor | Playwright screenshot+interaction suite · a11y audit · roles/permissions surfacing | M | The ratchet |

**Order:** A1→A2→A3 → B1 → C1 (needs B1's chips in the grid) → B2 → D1 → B3 → C2 → B4 → D2 → C3 → D3. B/C/D phases interleave and several can run as parallel agents with disjoint file ownership (the proven fleet pattern).

**Budget guidance:**
- **A1–A3** = "no longer a school project" (as before).
- **+B1+B2+C1** = the platform crosses into *"how long has this team been building this?"* — this is the 100x moment, because interconnection is the one quality that cannot be faked with styling.
- Everything after compounds toward the full Palantir × Apple × F500 synthesis.

# Part 8 — Acceptance: the three blind tests

1. **The Palantir test.** Pick any noun on any screen. It must peek on hover, open on click, pivot to every relation, show its history, and every number near it must explain itself on demand. *A single dead name or unexplained number = fail.*
2. **The Apple test.** Put a new team member in front of any flagship with zero training. They must state the screen's purpose in one sentence, complete its primary action without help, and discover one deeper layer on their own — while a power user beside them never touches the mouse. *Confusion or a required tutorial = fail.*
3. **The Fortune-500 test.** Pull the network cable mid-session, restore it, force an API error, tab-navigate an entire approval flow, and diff release screenshots. Everything recovers, everything is attributable, nothing regressed silently. *Any raw error, dead end, or silent regression = fail.*
