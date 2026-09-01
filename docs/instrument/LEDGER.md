# THE INSTRUMENT — the living ledger

> **This file is the second brain for the build of `INSTRUMENT_100X_PLAN.md`.** It is rewritten at every
> checkpoint. Any fresh context — after a compaction, a crash, a new session — reads this file FIRST, then
> the plan, then the memory index. It exists because the build is solo by the owner's instruction and longer
> than any one context window, and because quality that lives only in a mind dies with the context.
>
> **Approval:** S0–S7 approved end to end by the owner on 2026-09-01. Solo. No subagents, no workflows.
> **Quality bar (his words):** "when I say hundred x, I mean hundred x." Nothing merges on a claim.

---

## 0 · RESUME PROTOCOL — do these in order on any fresh context

1. Read this file top to bottom. Do not skim §2 (status) or §4 (open defects).
2. Read `INSTRUMENT_100X_PLAN.md` §3 (doctrine) and the section for the system marked **IN PROGRESS** below.
3. Read memory `instrument-100x-plan.md` and `hard-rule-finish-the-work.md`.
4. Run `git log --oneline -8` and `git status`; reconcile against §2. **The repo is the truth, this file is
   the map** — if they disagree, fix the map, then continue.
5. Re-run the gate before touching anything if the last entry in §5 says a gate was in flight.
6. Continue from the **NEXT ACTION** line in §2. Do not re-plan. Do not re-derive §1's numbers.

## 1 · BASELINE — measured at HEAD 2e0340a, 2026-09-01 (S0 re-measures; these are the "before")

| Metric | Before |
|---|---|
| Routes | 80 |
| Routes carrying GL | 7 (8.75%) |
| Independent clocks | ≥5 (Footer 1 s, KpiTicker 6 s + 5 min, AppLayout route-commit, one rAF per environment, online.ts) |
| Route commits with continuity | 0 / 80 |
| Palettes authored | 2 (tokens.css, look/theme.ts AUTHORED_HEX) |
| Ambient motion occurrences | 64 (spin 24 · pulse 28 · beacon 10 · slide-in 2) |
| Files wiring the feel layer | 4 |
| Ontology types (InspectorType) | 11, none newer than 2025 |
| Initial JS / largest chunk / CSS / fonts / passthrough | 813/850 · 411/440 · 112/140 · 434/440 · 722/1024 KB |
| E1/E3/E6 light-theme regressions | FIXED in 338db4f — do not re-open |

**S0 MEASURED (`docs/instrument/audit/BASELINE.md`, 79 routes × 2 themes, frozen clock, no API, HEAD 2e0340a):**

| S0 metric | Before | Owner system · target |
|---|---|---|
| routes reached in both themes / theme applied correctly | 79 / 79 · 79 / 79 | (harness sound; 0 page errors) |
| routes attempting a view transition on client navigation | **0** | S3 · 79 |
| routes with a rAF loop at rest (> 10 fps) | **76** — `lib/perf.ts startFrameSampler()` started by `Footer.tsx:103`, 60 fps forever, on every seated route | S1 · **0** (sampler measures only frames that exist) |
| max live `setInterval`s on one route | **8** on every seated route (Footer ×2, KpiTicker ×2, SidebarFieldNotes, NotificationBell, online.ts, perfFlush) · **9** on `/regulatory-dashboard` (the fake feed) | S1 · **1** (the heartbeat) |
| routes with CSS motion still running at rest | **77** — `SidebarFieldNotes` unconditional `animate-pulse-beacon`; `/regulatory-dashboard` 5, `/red-flags` 5, `/products` 4, `/competition` 3 | S4 · 0 |
| routes that created a GL context | **77** — `SignatureBackdrop` in the shell, one static context per route (no loop; rule 2 honoured) | S5 · decides its fate |
| material seam ΔE2000 (DOM token vs GL field) | light page-bg↔ground **2.78** · dark page-bg↔ground **3.09** · dark card↔plate 0.80 · dark line↔rule **3.13** | S2 · < 1.0 |
| static: ambient `animate-*` in route closures (union) | **49** (spin 24 · pulse 13 · beacon 10 · slide 2) | S4 |
| static: files wiring the feel layer | **5** | S4 |
| static: `setInterval`/`rAF` call sites · `Date.now()`/`new Date()` reads | **25 · 99** | S1 ratchet |
| static: hex literals outside the token system | **125** | S2 |
| median numeric figures in first viewport (no-API state) | 1 | S6 (re-measure with fixtures) |

## 2 · STATUS — one row per system; exactly one row is IN PROGRESS at any time

| System | Status | Commit(s) | Measured after | Notes |
|---|---|---|---|---|
| S0 MEASURE | DONE | e211c1a | `docs/instrument/audit/BASELINE.md` | `scripts/instrument-audit.mjs`, 79 routes × 2 themes, six metrics |
| S1 ONE CLOCK | DONE (this commit) | — | `docs/instrument/audit/after-s1/BASELINE.md` | rAF loops at rest **76 → 0** · live intervals **8 → 2 under vite dev = 1 heartbeat + the HMR ping (`@vite/client:620`), so 1 in production** · timer call sites 25 → 13 · fake Dashboard feed removed · ratchet `oneClock.test.ts` |
| S2 ONE MATERIAL | **IN PROGRESS** | — | — | drafts written (renderer, tsx generator, ratchet); move into tree after S1 commit |
| S3 ONE CAMERA | not started | — | — | desktop WKWebView probe FIRST |
| S4 THE WATCH | not started | — | — | |
| S5 FLOORS ARE DATA | not started | — | — | |
| S6 THE TERMINAL | not started | — | — | |
| S7 THE OBJECT | not started | — | — | |

**NEXT ACTION:** S2 — place `apps/web/src/lib/sceneryTokens.ts`, `apps/web/scripts/gen-scenery-tokens.ts`,
`apps/web/src/lib/__tests__/oneMaterial.test.ts` (drafts exist in the session scratchpad `s2/`; if lost,
re-derive from INSTRUMENT_100X_PLAN.md §4 S2 and this ledger's §1 seam table); insert the `@generated
scenery` marker blocks into `tokens.css` `:root`/`.dark` (replacing `--card`, `--page-bg`, `--line`) and
around `--card-fill` in both chart blocks; run `npx tsx apps/web/scripts/gen-scenery-tokens.ts`; add
`"gen:tokens"` to apps/web/package.json; run oneMaterial + contrast tests; gate; commit S2 with the seam
table before/after (expect 0.00 on every pair).

## 3 · THE STANDING RULES OF THIS BUILD — the quality bar, made mechanical

1. **Measured before claimed.** A system merges only with its S0 before/after in the commit body.
2. **Gate, then grep.** `npm run ci-check > log; grep -c 'npm error' log` must print 0. `| tail` masks exits.
3. **Deploy is proven by content** (chunk-graph walk for a runtime string) and by the GitHub deployments API
   for the exact SHA. Never by a filename, never by uptime alone.
4. **Every flipped test pin guards the inverse.** A pin that merely stops failing is a pin removed.
5. **No idle motion; nothing moves while a table is read; reduced motion checked at call time.**
6. **Data never moves; scenery must.** Brand hex is proven off a framebuffer or not claimed.
7. **Absent data refuses**, in a sentence that says what is absent. Never a fake calm, never a fake zero.
8. **Ratchets are added, never loosened.** S1 adds one-clock; S2 adds one-material. Contrast 3:1 outranks
   any aesthetic.
9. **Commit per system**, narrative commit body in the repo's voice, push via `git push lcx-sales dev:main`.
10. **This ledger and the memory file are updated at every checkpoint** — before the push, not after.

## 4 · OPEN DEFECTS AND PENDING ITEMS — kept open, worked after S7 unless they block

- **GPS:** owner has not yet run `APPLY_GPS_PACKETS.sql`; migration `0083` stays in `PENDING_MIGRATIONS` until
  his six-line verification arrives, then moves to SHIPPED with its digest.
- **GPS:** named partner + rate card (owner), coordination hours (owner), Monty's perimeter review at launch.
- **Web:** worker-shift flake class (BriefGenerator, silenceAndProvenance, marketingCrisis) — task chip open.
- **DUMMY DATA FOUND BY S0's TIMER INVENTORY:** `pages/Dashboard.tsx` (route `/regulatory-dashboard`) runs a
  `Math.random` simulation every 4 s that fabricates "System" log lines (`isReal: false`) and merges them
  with real audit rows — indistinguishable on screen. **S1 removes the simulation** (a fake feed cannot be
  given a clock); the panel then shows only real audit logs, and says so when there are none.

## 5 · CHECKPOINT LOG — append-only, newest last

- 2026-09-01 · plan approved end to end · ledger created · S0 begun.
- 2026-09-01 · S0 instrument built (`scripts/instrument-audit.mjs`), baseline captured 79×2; THE FINDING: the
  shell runs a 60 fps rAF loop (perf frame sampler) + 8 intervals under every route; `lib/clock.ts` core
  written and green (11 tests), NOT yet integrated; gate for S0 in flight.
- 2026-09-01 · S0 committed e211c1a (Render success). S1 integrated: Footer/SelectOperator/MarketingCrisis/
  CacheAge/SidebarFieldNotes/KpiTicker/NotificationBell/KpiDashboard/MarketNews/online.ts/perfFlush on
  `every()`/`useClock()`; perf frame sampler → `observeFrames()`; Dashboard fake feed deleted; hook split to
  `lib/useClock.ts` so clock.ts stays React-free. Gate clean (6,672 tests). After-measure: rAF loops 76→0,
  intervals 8→2 (attributed: 1 heartbeat + vite HMR ping → 1 in prod). Committing S1.
