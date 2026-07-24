# LCX COMMAND 100X — Palantir × CIA × Apple × Fortune 500 × LCX

*The current three panels render the strategy's conclusions. The 100x build makes the panels
carry the strategy's REASONING — every weighted model, commercial schema, readiness register,
and dependency in the source workbooks becomes live, governed, simulated, and AI-readable
machinery. A CEO doesn't read the strategy; they operate it.*

## What the source material actually contains (mined 2026-07-24)

| Source | The machinery inside it | Captured today |
|---|---|---|
| P1 LP Matrix | **10-dimension weighted scorecard** (US Reg .15, Spot Liquidity .15, RFQ .12, Options .12, OES .12, OTC .10, Serves-Exchanges .10, Fiat .05, FinStrength .05, …) × 9 LPs × 1–5 scores → weighted rank/tier; Capability Detail; Connectivity & Settlement; **21-field RFI schema** (spreads bps by asset class, min/max ticket, credit, settlement cycle, OES venues, fee model, fiats, FIX/REST/WS, US entity) | score+tier only |
| P2 Rails Matrix | Architecture Options (rent vs sponsor-bank vs hybrid × 12 attributes); **19-provider matrix** (category, US standing, custody-at-LCX fit, economics); GENIUS per-coin policy; Licensing & Compliance checklist; 16-field RFI | 1 stage field |
| P3 Waitlist Workbook | **12-channel weighted scorecard** (Reach .18, CAC .22, Speed .15, Compliance .15, Fit .15, Effort .15) + per-channel notes; **Funnel & Budget model** (per-channel budget ÷ CAC → signups; organic estimates; ×0.55 verified ×0.45 funded; Lean/Base/Aggressive scenarios); referral mechanic + compliance; 90-Day Plan; tooling | 3 budget numbers |
| P4 Listing Workbook | Two-Path options (A: non-securities now / B: BD-ATS × 10 attributes); **12-blocker register** (severity, owner, resolves-via); **14-requirement checklist** (Path A/B/Both, status); **Token DD framework** (6 weighted dims, Legal = 30% GATE); listing policy outline | 12 risk rows |
| Master Workbook | Consolidated scorecards; decisions (7 cols); **cross-phase dependency map** (● hard / ○ soft); **10-line budget view**; roadmap; **Sources sheets in every workbook** (~110 source rows) | partial decisions |

**The gap in one sentence:** we stored the answers; the strategy contains the models that
*produce* the answers. 100x = ship the models.

---

## PHASE 1 — FULL-FIDELITY ONTOLOGY & PROVENANCE  *(the CIA spine)*
*Every number in the panels becomes traceable to a graded source. Nothing is a naked claim.*

**1.1 Deep seed compiler.** A committed script (`apps/api/scripts/compile-command-seed.ts`)
reads the source workbooks (checked into `apps/api/src/seed/command/source/`) and emits
`data2.ts` — deterministic, re-runnable when the strategy is revised. The non-fabrication rule
survives: empty cells stay null.

**1.2 Migration 0041 — the deep tables** (all RLS, all namespaced):
- `command_scorecards` (scorecard_id, subject_id, dimension, weight, score, note) — LP × 10 dims and channels × 6 dims in ONE shape.
- `command_rfi` (partner_id, 21 typed commercial fields + status + owner + returned_at) — seeded with the schema + B2C2 example row; the desk fills the rest as RFIs return.
- `command_rail_providers` (19 rows: category, provides, us_standing, custody_fit, economics, notes).
- `command_arch_options` + `command_two_path` (the rent/bank/hybrid and Path A/B option matrices).
- `command_channels` + `command_funnel_model` (channel budget/CAC/organic-estimate rows + conversion params + the three scenarios).
- `command_blockers` (12), `command_requirements` (14, path, status), `command_dd_dimensions` (6, weight, gate flag).
- `command_budget_lines` (10), `command_dependency_edges` (phase×phase, hard/soft).
- `command_sources` (~110 rows from every Sources sheet) + `source_refs text[]` on EVERY deep row.
**Provenance grading (Admiralty, reused from Phase-2 tradecraft):** public research = C3,
RFI-returned = B2, signed contract = A1 — stored per row, rendered as grade chips everywhere.

**1.3 API.** `/v1/command/deep/*` reads + a `command_seed` v2 job. Everything degrades pre-0041.

**Acceptance:** every panel figure can pop a provenance chip → source row → document; seed
re-runs are idempotent and preserve desk-entered RFI/status data.

## PHASE 2 — THE DECISION ENGINES  *(deterministic analytics, pure + unit-tested in @lcx/shared)*

**2.1 LP optimizer.** `lpScore.ts`: weighted re-scoring with LIVE weight editing → re-rank;
**sensitivity analysis** (which single dimension flips rank 1↔2; tornado of weight elasticity);
coverage/overlap analysis (options flow, OES venue, fiat rails across the chosen 3-LP set);
counterparty concentration index for the LP portfolio.

**2.2 RFI economics engine.** `rfiEconomics.ts`: returned terms → **effective cost model** —
blended bps at a given volume mix (BTC/ETH vs majors vs alts) + credit/settlement quality
score; ranks LPs by real cost once quotes exist, not just capability.

**2.3 Funnel simulator.** `waitlistSim.ts`: per-channel budget sliders → CAC sampled from the
benchmark ranges (triangular) → Monte Carlo signups → verified → funded distributions
(P10/P50/P90); marginal-CAC ranking ("next $10k goes to channel X"); gate-aware (mainstream
paid locked until MSB/MTL tasks done — reads the live task graph).

**2.4 Readiness engines.** `listingReadiness.ts`: blockers × severity + requirements × status →
per-category readiness %, path-aware (A vs B); `tokenDd.ts`: the 6-dim weighted scorer with the
30% legal **GATE** (no score can pass without counsel opinion = the same premortem-gate pattern).
`programReadiness.ts`: the composite — gating chain × blockers × funnel × partner pipeline →
**one 0–100 launch-readiness number with sub-dials**, the deck's headline instrument.

**Acceptance:** ~40 new unit tests; every engine deterministic and seedable; weight edits and
what-ifs never mutate stored truth (scenario overlay only).

## PHASE 3 — THE WORKING SURFACES  *(Apple execution — the three panels become instruments)*

**3.1 US Launch Deck → the cockpit.** Readiness dial (composite + 4 sub-dials) at top;
phase lanes with dependency edges (the master map, hard ● vs soft ○); the launch sim upgraded
with per-task duration override UI + saved scenarios (reuse Phase-3.3 scenarios) + what-if
("mark BSA hired → P50 moves how much?"); decision queue sorted by blocking-weight; a
**Board Pack print** (the whole deck as an A4 program review, reusing WBR print machinery).

**3.2 Partner Pipeline → the dossier room.** Partner inspector (slide-over, reusing the
inspector pattern): 10-dim **radar vs tier-1 average**, weight-adjusted rank, capability detail,
connectivity/settlement facts, the **RFI form** (all 21 fields, governed writes, provenance
auto-upgrades C3→B2 on return), effective-cost readout once terms exist, BD cross-links,
stage timeline from object_actions. Pipeline board stays; adds RFI-status lane + tier filter.

**3.3 Command Ops → program operations.** Rails architecture chooser (rent/bank/hybrid
matrix + provider shortlist per role: sponsor bank, stablecoin, on-ramp, KYC — with custody-fit
and GENIUS policy chips); funnel simulator panel (sliders + P10/50/90 + marginal-CAC table +
90-day plan checklist); listing readiness panel (blocker heat by category, requirements
checklist with governed status flips, token-DD calculator); budget view vs desk-entered
actuals; org RACI from owners.

**Acceptance:** all three panels operate the models live; every figure carries provenance;
both themes; perf budget holds (each engine panel lazy).

## PHASE 4 — THE GOVERNED OPERATIONS LOOP  *(Fortune-500 rhythm on the program)*

**4.1 RFI lifecycle.** Governed actions: `command_rfi_issue`, `command_rfi_record` (typed
21-field payload, zod), `command_requirement_status`, `command_blocker_status` — all audited;
recording an RFI re-runs the economics engine and re-ranks live.

**4.2 Decision dossiers.** Each open decision links its evidence: the relevant matrix rows +
sources + a drafted options table; the two CRITICAL decisions (exchange model dec_01, listing
path dec_19) get mandatory SATs (premortem + devil's advocate) via the existing analytic-reviews
machinery before `command_decide` allows them — the $25k-deal gate pattern, program-grade.

**4.3 Program WBR + monitors.** WBR gains a program section (readiness delta WoW, sim P50
drift, RFIs returned, decisions closed); monitors on program metrics (readiness drop, sim
slip > 14d, funnel actuals < P10 once live, RFI stale > 14d) → governed notify/task.

**Acceptance:** the full loop — issue RFI → record terms → re-rank → decide with SAT → task
status → readiness moves → WBR narrates it — runs end-to-end with zero ungoverned writes.

## PHASE 5 — THE PROGRAM AI OPERATOR  *(the brain over the whole machine)*

**5.1 Cited program Q&A v2.** Ask-the-program grounds in the DEEP ontology and cites
`[[source-id]]` chips with grades — "why FalconX over Cumberland?" answers from the scorecard
deltas + notes + sources, not vibes.

**5.2 Decision-memo copilot.** Drafts the memo for any open decision from its dossier
(options × criteria × evidence, recommendation with ICD-203 confidence); human edits, SAT-gated
where critical, files through `command_decide`.

**5.3 RFI extractor.** Paste an LP's reply email → LLM extracts the 21 fields → shown as a
diff → human confirms → `command_rfi_record`. (The proven propose→confirm pattern; never
auto-writes.)

**5.4 Slippage & board narratives.** Weekly: sim-drift and readiness-delta narrative into the
WBR; on-demand Board Pack executive summary. All deterministic-fallback like everything else.

**Acceptance:** with the key set — cited answers, drafted memos, extracted RFIs, all
human-confirmed; without — deterministic readouts everywhere; AI still cannot write anything
uncomfirmed.

---

## Sizing & order
Migrations: **0041** (Phase 1) + **0042** (Phase 4 RFI/actuals if split needed). Each phase
independently shippable behind the standing gate (tsc ×3, vitest ×3, build, perf, browser
verify, deploy, prod-verify). Estimated ~12–15k new LOC. Phases build strictly 1→5; every
phase leaves prod better and never breaks degradation.

**Standing preset:** maximum rigor, solo, NO subagents; user green-lights each phase.
