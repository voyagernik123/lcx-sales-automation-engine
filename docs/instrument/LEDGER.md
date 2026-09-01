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
| S2 ONE MATERIAL | DONE (this commit; gate #3 clean, 6,660 tests) | — | `docs/instrument/audit/after-s2/BASELINE.md` | seam on every twin pair **0.00** both themes (was 2.78 / 3.09 / 3.13); `theme.ts` gained the `page` radiance role after the first derivation (page ← ground) was refused by measurement; scenery block in tokens.css GENERATED (`npm run gen:tokens -w apps/web`), index.html pre-hydration colours generated; ratchet `oneMaterial.test.ts`; 8 contrast/corridor records re-recorded with reasons (all moves ≤ 1 level, two improvements) |
| S3 ONE CAMERA | **IN PROGRESS** | — | — | WebKit measured (skip path clean, 87 ms); router wrap + CSS + drawer name + LeadTable→LeadDetail exemplar + probe `--visible` + ratchet `oneCamera.test.ts` |
| S4 THE WATCH | not started | — | — | |
| S5 FLOORS ARE DATA | not started | — | — | |
| S6 THE TERMINAL | not started | — | — | |
| S7 THE OBJECT | not started | — | — | |

**NEXT ACTION:** when the S2 gate (`/tmp/gate-s2.log`) is clean (`grep -c 'npm error'` = 0), commit S2:
`packages/gl/src/look/theme.ts`, `apps/web/src/lib/sceneryTokens.ts`, `apps/web/scripts/gen-scenery-tokens.ts`,
`apps/web/src/lib/__tests__/oneMaterial.test.ts`, `apps/web/src/styles/tokens.css`, `apps/web/index.html`,
`apps/web/package.json`, `apps/web/src/lib/__tests__/contrast.test.ts`,
`apps/web/src/components/layout/__tests__/ambientBackdrop.test.tsx`, `scripts/instrument-audit.mjs`,
`docs/instrument/audit/after-s2/`, this ledger. Push; verify Pages by content (needle: the generated comment is
stripped, so use the CSS value `--page-bg:244 247 252` or `244 247 252` in the deployed CSS asset) + Render via
deployments API. Then S3: wrap `router.navigate` at the end of `apps/web/src/router.tsx` (after the `]);` that
closes `createBrowserRouter`) to default `viewTransition: !prefersReducedMotion()`; add `::view-transition-old/new(root)`
180 ms rules + reduced-motion `animation: none` in `globals.css` beside the reduced-motion block (~line 515);
`style={{ viewTransitionName: 'inspector' }}` on the `InspectorDrawer` panel div; extend
`apps/desktop/scripts/webview-capability-probe.mjs` with an async `startViewTransition` behavioural check
(Swift host: delay `evaluateJavaScript` ~1.5 s) and RUN it (`swiftc` present) before wiring; ratchet
`oneCamera.test.ts`; re-measure continuity (S0 runtime `vt` count) → expect 79.

### S4 BUILD SPEC (grounded 2026-09-01; execute after S3 commits)
**Sources, all already held (cite):** `audit_log(actor, action, entity, entity_id, meta, created_at)` — 13 write
sites; compartment by entity prefix exactly as `routes/audit.ts` does (`^gps_`→gps, `^marketing_`→marketing;
extend: `^command_`→command, `^dist_`→distribution, `deals|projects|handoffs|tasks|deal_|project_|outreach_|
sequence_`→sales, `decisions|entitlement_|approval_|purpose:`→governance). Deltas by `updated_at` since the
watermark: deals (stage, won_at), handoffs, tasks (due_at, completed_at), gps_engagement (accepted_at,
deposit_paid_at), gps_target, gps_demand_candidate (created_at, decided_at), gps_invoice (issued_at, paid_at,
disputed_at, voided_at — via `invoiceAgingSummary(pool, asOf)` for open aging), gps_jurisdiction_profile
(`entry.reviewBy` within `reviewWarningDays` or past — via `loadPerimeter`+`perimeterView`), gps_deliverable
(accepted_at), gps_milestone (due_by), marketing_record (cleared_at/published_at), decisions (outcome_at),
notifications (has `workspace` since 0067; bus `notificationBus`/`emitNotification` in
`apps/api/src/notifications/events.ts`; SSE `/v1/notifications/stream` with stream-token).
**Entitlements:** `loadEntitlements(pool, actorId): EntitlementMap` + `capAtLeast(map[ws], 'view')` (shared).
**Endpoint:** `GET /v1/watch?since=<ISO>` (requireOperator; no workspace gate — it filters by entitlement per item).
Response `{ since, asOf, items: WatchItem[], byWorkspace: Record<ws, {changed: n, top: WatchItem|null}>,
unranked: n, absent: string[] }`. `WatchItem = { id, workspace, kind: 'money'|'liability'|'deadline'|'activity',
rank, title, detail, href, at, source: 'audit'|'table'|'notification'|'perimeter'|'invoice' }`.
**Ranking prior (stated, owner may override — one constant):** money (invoice paid/disputed/issued, deal won/lost/
stage moved, engagement accepted/deposit) > liability (perimeter review expiring ≤ reviewWarningDays or past,
conflict check amended, marketing gate refusal, refusal-shaped audit actions) > deadline (tasks due ≤ 48 h,
milestones due_by, target deadline_at) > activity (everything else). Cap 12; the rest is one count line.
**Refusals:** no rows since watermark → `absent` carries the sentence "nothing recorded since <since> — a
statement about the record, not the world"; a missing register → named in `absent`; Render asleep → the shell
shows the last watermark and says the watch is unavailable, never animates a guess.
**Web:** `lib/api/watch.ts` fetch; `lib/useArrival.ts` — on mount and on `visibilitychange`→visible after ≥ 5 min
hidden, read `useLastSeen('watch')`-style global watermark (scoped key), fetch, then ONE sweep phase-locked to
`lib/clock.ts`: `WatchStrip` (TopNav, beside the bell) reveals ranked items in rank order at 120 ms steps
(reduced motion → all at once, no motion); `Sidebar` rooms with `byWorkspace[ws].changed > 0` get a lit dot
(state colour, STILL — not a beacon); `KpiTicker` first item = top watch item. Everything else still.
**Feel wiring:** `components/command/invoke.ts` is the single governed-action seam (15 client sites route
through `/v1/actions/:id/invoke`; VerbPanel already uses `commit`/`refuse`) — add `commit(el)` on success and
`refuse(el, reason)` on a refusal INSIDE `invoke()` (accept an optional anchor element), so every governed
action reacts without per-page wiring.
**Ambient retirement (S0 list, non-test):** `animate-pulse-beacon` ×10 → still dots (Badge blocked, Footer red,
Sidebar unread, KpiTicker SIM, SidebarFieldNotes, Settings, SelectOperator, Roadmap, Dashboard,
CustomOntologyNode); `animate-pulse` ×13 → still skeletons/placeholders with a dated "loading since" where a
request is in flight (LoadingSkeleton ×2, LeadDetail ×3, Monitors, MarketNews, KpiDashboard, Dashboard,
SessionMode, DraftPanel, ProvenancePanel, ConversationPanel, AssessmentBlock, LiveOpsFeed, DealDetailPanel,
BatnaPanel, GateBanner). `animate-spin` ×24 stay ONLY where a request is genuinely in flight and carry
`.motion-essential` (already the rule); `animate-slide-in` ×2 (toasts) stay — a toast is a reaction.
**Ratchet `oneWatch.test.ts`:** no `animate-pulse-beacon` in src; `animate-pulse` only inside LoadingSkeleton
with an in-flight guard; `invoke.ts` calls `commit`/`refuse`; the watch route filters by entitlement (test with a
gps-less operator sees no gps items); ranking prior is one exported constant with the four kinds in order.
**Measure after:** S0 runtime `routesWithMotionAtRest` 77 → 0 (except in-flight spinners); static ambient 49 → ≤ 24
(spins) ; feel files 5 → (invoke.ts + strip).

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
- **API:** `routes/__tests__/distGate.test.ts` "lets a NON-token campaign advance to live freely" returned 403 in
  the S2 full gate, passes in isolation, API tree untouched by S2 — same order-dependent class. Re-run per the
  3-run procedure before any claim; if it recurs, it is a latent race in the test's fixture isolation, not S2.
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
- 2026-09-01 · S1 committed 6e0e939 — VERIFIED LIVE both surfaces ('UTC (local)' in the deployed footer
  chunk; Render 6e0e939 success). S2 in progress: FIRST CUT REFUSED BY MEASUREMENT — deriving the page from
  the GL ground cost status-green text 10 levels of WCAG headroom (4.93→4.54:1) and killed the dark
  backdrop's gradient (0.03 < 0.05). The rig's own comment says ground = page DEEPENED, so the derivation
  ran backwards. Fix: `theme.ts` gains a `page` RADIANCE role (light = skyZenith #F4F7FC, dark authored
  #090E1B with reasons); `--page-bg ← page`, `--ground` exposed for GL surrounds (S5). GL theme tests 15/15.
- 2026-09-01 · S2 gate #1 red on `distGate.test.ts` (API, untouched by S2) → passes alone, fresh full API run
  green (3,520) → order-dependent flake, logged in §4. Gate #2 running. S3 PRECONDITION MEASURED on the
  shipping WebKit via a patched copy of the desktop probe: `startViewTransition` present; `finished` resolves in
  87 ms, `ran = true`; `ready` rejects "skipped because document visibility state is hidden" (probe window is
  off-screen) — the instant/skip path is clean, which is the reduced-motion fallback S3 relies on. The animated
  path needs a visible window: S3's probe edit adds an opt-in `--visible` flag and re-measures.
- 2026-09-01 · S2 gate #2: shared/api clean; web red on TWO PRINT RATCHETS (marketingCrisis, marketingRecord:
  "pins, for paper, every dark-mode token this page can reach") — the four NEW scenery tokens are dark-overridden
  with no print pin. Correct catch, not a flake: pinned `--ground/--structure/--sky-horizon/--sky-zenith` at
  their light values in `PrintStyles.tsx` (with the token, not with the use). Gate #3 next.
- 2026-09-01 · S2 gate #3 clean (0 npm errors; 358 + 3,520 + 2,762 + 20 + shared 1,997) → committed 180c939,
  pushed; live verification running. S3 wired: router wrap (default `viewTransition: !prefersReducedMotion()`,
  numeric `to` passes through), `::view-transition-old/new(root)` 180 ms + reduced-motion `animation: none`,
  InspectorDrawer named `inspector`, LeadTable row ↔ LeadDetail `<h1>` share `lead-<id>`, ratchet
  `oneCamera.test.ts`; probe gained the behavioural check + `--visible`. ANIMATED PATH MEASURED on the shipping
  WebKit with the window visible: `ready` 212 ms, `finished` 452 ms, `ran = true`.
- 2026-09-01 · S2 VERIFIED LIVE 180c939 both surfaces (deployed CSS carries `--page-bg:244 247 252` and
  `--ground`; index.html pre-hydration `#F4F7FC`; Render success). S3 gate running. Instrument fix: the
  continuity probe's synthetic pushState/popstate never reached `router.navigate` (React Router serves popstate
  from its history listener) and its click on a hidden link failed silently — it now clicks a VISIBLE in-app
  link and records href / url-after / error beside `vt`, so zero can never mean "never navigated".
- 2026-09-01 · THE INSTRUMENT CAUGHT A REAL S3 BUG: with a proven navigation, `vt` stayed 0 because `<Link>`
  forwards `viewTransition: undefined` and `{ viewTransition: true, ...opts }` was clobbered by the explicit
  undefined. Fix: `viewTransition: opts?.viewTransition ?? !prefersReducedMotion()`. Sanity re-run: **vt = 2**
  per theme on /states and /gps (click + return both transition). S3 gate #1 red only on `reducedMotion.test`
  (it reads the FIRST prefers-reduced-motion block; mine had landed first) → override folded into the Phase-4
  block. Gate #2 + after-s3 runtime capture next.
- 2026-09-01 · S3 ROOT GATE CLEAN (0 npm errors; 1,997 + 358 + 3,520 + 2,766 + 20; perf OK). NOTE FOR THE RESUME
  PROTOCOL: an earlier "gate" ran from `apps/web` (cwd slip) and printed only web totals — a gate log that lacks
  all five stage totals is NOT a gate. After-s3 capture in flight; S3 commits with its `routesWithContinuity`.
