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
| S1 ONE CLOCK | DONE · LIVE | 6e0e939 | `docs/instrument/audit/after-s1/BASELINE.md` | rAF loops at rest **76 → 0** · live intervals **8 → 2 under vite dev = 1 heartbeat + the HMR ping (`@vite/client:620`), so 1 in production** · timer call sites 25 → 13 · fake Dashboard feed removed · ratchet `oneClock.test.ts` |
| S2 ONE MATERIAL | DONE · LIVE (gate #3 clean, 6,660 tests) | 180c939 | `docs/instrument/audit/after-s2/BASELINE.md` | seam on every twin pair **0.00** both themes (was 2.78 / 3.09 / 3.13); `theme.ts` gained the `page` radiance role after the first derivation (page ← ground) was refused by measurement; scenery block in tokens.css GENERATED (`npm run gen:tokens -w apps/web`), index.html pre-hydration colours generated; ratchet `oneMaterial.test.ts`; 8 contrast/corridor records re-recorded with reasons (all moves ≤ 1 level, two improvements) |
| S3 ONE CAMERA | DONE · **LIVE both surfaces** (Pages needles probe 3; Render deployment 6209660953 `success`) | 6a2c04b | `docs/instrument/audit/after-s3/BASELINE.md` | routes attempting a view transition on a REAL client navigation **0 → 76 of 79** (the 3 at zero — /lcxos /portal /select — have `linkCount 0`: no in-app link, so "not navigated", not "cut"); continuity call sites 0 → 3; rAF at rest still 0; intervals still heartbeat + `@vite/client` only; WebKit visible run `ready` 212 ms / `finished` 452 ms; ratchet `oneCamera.test.ts`; the instrument caught the `viewTransition: undefined` clobber |
| S4 THE WATCH | **IN PROGRESS** (drafts in scratchpad `s4/`: watch.shared.ts, watch.api.ts, routes-watch.ts, useArrival.ts (zustand store — ONE arrival, three readers), WatchStrip.tsx, oneWatch.test.ts) | — | — | build per "S4 BUILD SPEC" below; ambient 49 is the number to move |
| S5 FLOORS ARE DATA | not started | — | — | |
| S6 THE TERMINAL | not started | — | — | |
| S7 THE OBJECT | not started | — | — | |

**NEXT ACTION (S4 close-out, 2026-09-02):** S4 is built, gate #3 clean (five totals), files STAGED. Steps, in
order: (1) after-s4 capture finishes → `/tmp/instrument-after-s4.log` ends `exit=0`; (2) `node
scratchpad/s4-numbers.mjs` prints after-s3 → after-s4 deltas; (3) fill `<AMB>/<BREAKDOWN>/<REST>/<FEEL>` in
`scratchpad/s4-commit-msg.txt` (add "initial JS 813 → 820 / 850 KB"); (4) `git add docs/instrument/audit/after-s4
docs/instrument/LEDGER.md && git commit -F …` from the REPO ROOT; (5) `git push lcx-sales dev:main`; (6) `bash
scratchpad/verify-live.sh <sha> --js 'stated prior' --js '/v1/watch?since=' --css-absent 'pulse-beacon'` (a
deletion is live only when the bytes are GONE); (7) flip S4 → DONE · LIVE with the sha, S5 → IN PROGRESS, promote
the S5 BUILD SPEC below from DRAFT; update memory `instrument-100x-plan.md`. THEN S5, starting with X1's removal
(its own header is the proof) — never concurrent with a gate or a capture.

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

### S5 BUILD SPEC (grounded 2026-09-02 while S4's gate ran; execute after S4 commits — DRAFT until S4 is DONE)

**The test, per environment (plan §3.1):** does the third dimension carry information the flat version
loses, measured — S0's chroma-above-floor in BOTH themes plus the environment's own README claim. An
environment that fails is retired to its flat fallback (already built, rule 1). Apple is subtraction.

**1 · X1 `SignatureBackdrop` — REMOVE.** Its own header is the measurement: in the DEFAULT (light) theme
it draws NOTHING (any plate loses 31+ levels; five certified roles fall under 4.5:1 at ZERO amplitude), and
in dark it draws an empty vignetted plate behind 77 routes — the S0 runtime's "77 routes created a GL
context" is this layer, and it is the sole eager importer of `useFlatChart` (3,883 B / 1,879 B eager).
The plan's "convert into the watch's canvas" was tested against the same header before writing a line:
a canvas BEHIND text fails the contrast invariant in light by X1's own proof, and S4 already made the
rooms visible as DOM (switcher dots + counts, per compartment held). So it cannot earn the role and the
plan's clause applies. Work: delete `components/command/SignatureBackdrop.tsx`, its mount at
`AppLayout.tsx:265` and the comment above it, `__tests__/ambientBackdrop.test.tsx` (pins of a removed
component go with it — after copying the two DERIVED facts it carries into `docs/instrument/LEDGER.md`:
the light-corridor pair and the "zero amplitude already fails" proof), and the `useSoleOwner` seam.
Keep `--ground/--structure/--sky-*` tokens (S2) — E2–E7 surrounds use them. **Measured after:** GL
contexts at rest 77 → 7 (the seven opt-in environments, only when their routes are open and data is
present); eager JS −3.9 KB (perf budget line); light theme unchanged by construction (ambientBackdrop's own
"a refusal paints NOTHING" property, now trivially true).

**2 · E1 `DeckReliefGl` — RETIRE THE GL ROOM, KEEP THE DOM DECK, WRITE THE DECISION DOWN.**
FINAL_SCORECARD §4 states the dichotomy exactly: "either E1's reading is agreed to live in DOM — in which
case no chroma-based instrument will ever score it, and that should be written down — or the geometry
should carry a mark that clears the floor." The README's own defence is the first branch (the panel TEXT is
projected DOM, §6 rule 4; the geometry contributes depth ORDER = the deck's sequence = emphasis, not a
value). Under §3.1 the third dimension therefore carries nothing the flat deck loses — a list already
carries its order — and the scorecard measured it WORSE in light (flattened to 42%). No further measurement
is needed to decide; the measurement already exists. Work: `/command-deck` renders the DOM deck only (its
existing flat fallback path); `DeckReliefGl.tsx` (1,585 lines) is removed with its harness README's first
line rewritten to the decision and the date; `docs/3d/e1/README.md` records "reading lives in DOM; GL room
retired 2026-09 under INSTRUMENT_100X_PLAN §3.1". Measured after: GL contexts on /command-deck 1 → 0,
figures-in-viewport unchanged (the reading was never in the GL), lazy chunk count −1.

**3 · Keep and BIND (each with a measured claim, not a look):**
- E5 `SurfaceReliefGl` (margin over price × effort IS a volatility surface) — already bound to the
  underwriting engine; S5 adds the S4 change marks: engagements accepted/deposit-paid since the watermark
  lit on the surface at their (price, effort) coordinate (still, state colour).
- E4 `OntologyOrreryGl` — real once the join lands (below): the orrery traverses the widened union.
- E3 `PipelineReliefGl` — stage × value × age is real; bind the watch's `deal` items as marks.
- E6 `VaultReliefGl` — audit marks; bind `audit` watch items (a burst of refusals since the watermark is a
  visible stack).
- E2 `GlobeReliefGl` — KEEP STATIC; replace the TWELVE PLACEHOLDER CITIES (its header records them as
  outstanding) with the sites the platform actually holds: `gps_client.jurisdiction` (0047:73, text) and
  ONLY — `PARTNER_BENCH` is `[]` (`packages/shared/src/gps/partners.ts:471`; the named partner is still an
  owner input) and the LIVE `gps_partner_registry` (0075) carries NO location column (partner_id, name,
  attribution, capacity), so partners are not globe sites and must not be invented as such. Jurisdiction
  text → coordinates through the compiled `PERIMETER_PROFILES` labels (a jurisdiction the profile table
  does not know is reported, not guessed). No spin. If no client carries a jurisdiction on an environment,
  the globe says so (rule 1) — and on production today that is the likely state, which is itself the
  honest render.

**Sweep mechanics:** `scripts/3d-audit-app.mjs` — port 5188 (`APP_AUDIT_PORT`), `APP_SWEEP_OUT_DIR=<dir>`
redirects a whole run (report + captures) so S5's before/after can sit side by side under
`docs/instrument/audit/after-s5/app-sweep/`; `APP_SWEEP_THEME_ONLY=1` runs the theme pass alone. Never
concurrent with the gate or the S0 instrument (5189).

**Kill-test instrument:** the S0 instrument has NO chroma metric (grep confirmed); the data-chroma floor
(derived 60, FINAL_SCORECARD §1) lives in `scripts/3d-audit-app.mjs` — the app sweep that seeds an
operator, reaches each relief surface by its accessible control and reads the drawing buffer. S5's
verdicts on E1 (and the post-binding re-checks on E2–E6) run through THAT sweep, both themes, and the
per-surface `docs/3d/eN/README.md` first line is updated with the verdict, as the harness rule demands.
- E7 `StormReliefGl` — data-gated and refusing correctly; unchanged.

**4 · THE PALANTIR JOIN.** Extend `InspectorType` (apps/api/src/graph/links.ts:19) AND its web mirror
`InspectorEntityType` (apps/web/src/stores/useInspectorStore.ts:12) with `engagement | target | partner |
draft | asset | holding`; add `RELATED_RESOLVERS` for them AND for the two existing members with none
(`claim`, `jurisdiction`). Resolvers gain the actor's `EntitlementMap` (route has `c.get('operator')`;
`loadEntitlements` + `capAtLeast` as the watch does) and return a group ONLY for compartments held — a
withheld group is reported as `{ key, label, withheld: true, count: null }` so absence is said, not
silent (mirror of S4's `absent`). Web: `components/inspect/payloads/` gets a payload per new type
(engagement → dossier facts + invoices + milestones; target → cure form link; partner → seat + capacity;
draft/asset/holding → marketing record objects), each reading existing `lib/api/*` clients — no new
endpoints beyond `related`. `RelatedPanel` renders withheld groups as a locked line with the compartment
name. **Measured after:** `/graph` search-around reaches gps + marketing objects (count of resolvable
types 9 → 17); an operator without gps sees the withheld line, never the rows (test).

**Ratchet `oneFloor.test.ts`:** no `SignatureBackdrop` import anywhere; every `*ReliefGl`/`*OrreryGl`
mount site passes `onRefused` and renders a flat fallback (grep-provable); `InspectorType` and
`InspectorEntityType` unions are IDENTICAL sets (a drift test — the API comment says "mirrors" and
nothing enforced it); every `RELATED_RESOLVERS` key has a web payload.

**Budgets:** GL stays lazy (15 chunks, 0 eager after X1 goes — actually −3.9 KB eager); initial JS ≤ 820 KB
(S5 adds no eager bytes; payloads are lazy with the drawer).

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
- 2026-09-02 · **S3 COMMITTED 6a2c04b AND PUSHED `lcx-sales dev:main`.** After-s3: **76 of 79** routes attempt a
  view transition on a real client navigation; the three zeros (/lcxos, /portal, /select) each carry
  `nav.linkCount = 0` — no in-app link exists on those surfaces, so nothing was navigated; the instrument's
  attribution field is exactly what made that distinction checkable instead of argued. Second live interval on
  77 routes attributed by call-site stack to `@vite/client:620` (dev only). Live check running:
  `bash scratchpad/verify-s3.sh 6a2c04b…` → `/tmp/verify-s3.log` (needles `::view-transition-old(root)`,
  `::view-transition-group(*)`, JS `viewTransition:` + `viewTransitionName`, deployments API SHA). S4 opened.
- 2026-09-02 · **S3 LIVE.** Pages: CSS `/assets/index-C49G7fIm.css` and JS `/assets/index-B2WvAUs9.js` carry
  all four needles (probe 3); Render deployments API latest = `6a2c04b`. DEFECT IN MY CHECK: `verify-s3.sh`
  compared the API's SHORT sha to the full sha and so printed "waiting" forever after the deploy had landed —
  fix before reusing for S4 (compare by prefix). **S4 BUILT IN TREE** (tsc clean shared/api/web; targeted
  suites green; api `watch.test.ts` 5/5): `packages/shared/src/watch.ts` (+ barrel), `apps/api/src/watch/watch.ts`
  (every column checked against its migration — fixes vs draft: `gps_milestone.name`, `marketing_record` has
  no `state` → derived from cleared/published/withdrawn, `decisions.review_by` deadline added, invoice aging
  reported from `openCount/openAmountCents/brackets` with no bracket-order assumption), `routes/watch.ts` mounted
  `/v1/watch` in app.ts, `lib/useArrival.ts` (zustand store, one driver), `WatchStrip.tsx` in TopNav (4th
  no-drag subtree — topNavChrome pin 3 → 4), `WorkspaceSwitcher` rooms (still dot + count), `KpiTicker` lead
  item, `invoke.ts` plays commit/refuse (optional anchor, default activeElement), `Skeleton` primitive in
  LoadingSkeleton + 7 sites, 10 beacons + 11 pulses retired, keyframe deleted, ratchet `oneWatch.test.ts`.
  Gate running → `/tmp/gate-s4.log`; then after-s4 capture (NOT concurrently — worker-shift flakes), commit.
- 2026-09-02 · S4 GATE #1 RED, correctly: `routeCompartmentCoverage.test.ts` refused the new ungated mount —
  `/v1/watch` spans compartments by design, so it is DECLARED in the desk-level register as
  `filters-per-reader` with its mechanism (entitlements loaded first; unheld rooms never queried, no key),
  pinned by `watch.test.ts`. Gate #2 running. S3 live check finished exit 0 (Pages needles; Render success).
- 2026-09-02 · S4 GATE #2 WAS NOT A GATE: launched after a `cd apps/api && npx vitest …` — the shell's cwd
  PERSISTED, so `npm run ci-check` ran inside the api workspace ("Missing script") and the log had seven npm
  lines and no stage totals. Second time this trap has bitten (§5 2026-09-01). RULE, now mechanical: every
  gate command begins `cd /Users/nik/Downloads/usclaude-main && …`, and a gate log without all FIVE stage totals
  is not a gate regardless of its exit code. Gate #3 running from the root.
- 2026-09-02 · **S4 GATE #3 CLEAN** (0 npm errors; 1,997 + 358 + 3,525 + 2,771 + 20; perf budget OK — initial
  JS 813 → **820 / 850 KB**, the watch's cost, ≈7 KB; largest chunk 417/440; fonts 434/440 unchanged). After-s4
  capture running → `/tmp/instrument-after-s4.log` → `docs/instrument/audit/after-s4/`. S4 files staged.
- 2026-09-02 · **S4 MEASURED AFTER** (`docs/instrument/audit/after-s4/BASELINE.md`, HEAD 6a2c04b): ambient
  **49 → 28** (beacon 10 → 0 · pulse 13 → 2 in LoadingSkeleton · spin 24 · slide-in 2); shell ambient 8 → 4;
  routes with CSS motion at rest **77 → 1** — /ontology ×3 = React Flow `animated: true` edges
  (OntologyExplorer.tsx:153), the graph's direction marks → S5 decides with the orrery; feel files 5 → 6
  (invoke.ts, the seam); vt 76, rAF 0, intervals 2, GL 77, errors 0. Committing S4 with this body.
- 2026-09-02 · **S5 GROUNDING (read while S4's gate ran — cite, don't re-derive).** (1) The plan's `InspectorType`
  IS at **`apps/api/src/graph/links.ts:19`** (API side — my first grep searched web/shared only and I wrote
  "no longer exists"; corrected): 11 members `project deal handoff contact claim task signal listing decision
  jurisdiction document`, mirroring the web's `InspectorEntityType`; `RELATED_RESOLVERS` (links.ts:164) covers
  9 of them (none for `claim`, `jurisdiction`), mostly `viaProjectId`. The join seam is
  `graphRoutes.get('/:type/:id/related')` (routes/graph.ts:71) → web `lib/api/graph.ts`
  (`RelatedItem/RelatedGroup/fetchRelated/fetchObjectSearch`). S5 adds `engagement target partner draft asset
  holding` to BOTH unions with resolvers that check entitlement per group. (2) The always-on shell
  backdrop is **X1** `SignatureBackdrop` (AppLayout:265), NOT E8 — E8 is the sign-in `ForgeBackdrop`
  (`docs/3d/e8`). X1's own header proves it draws NOTHING in the default light theme (any plate loses 31+
  levels; five certified roles drop under 4.5:1 at ZERO amplitude) and an empty vignetted plate in dark on 77
  routes, costing 3,883 B eager as the sole eager importer of `useFlatChart`. The plan's own clause applies: "if
  it cannot earn that, it is removed". (3) Kept environments and their mounts: E2 `GlobeReliefGl` (1,103 lines;
  twelve PLACEHOLDER cities recorded outstanding in its header), E3 `PipelineReliefGl`, E4 `OntologyOrreryGl`
  (OntologyExplorer), E5 `SurfaceReliefGl`, E6 `VaultReliefGl` (1,716), E7 `StormReliefGl`, E1 `DeckReliefGl`
  (draws NO data marks in either theme per FINAL_SCORECARD §4 — a retire candidate); every one refuses to its
  flat fallback via `onRefused` (rule 1 already enforced). (4) `PARTNER_BENCH` is `[]` (partners.ts:471) and
  `gps_partner_registry` (0075) has NO location column — partners are not globe sites; `gps_client.jurisdiction`
  (0047:73) is the only real site source. (5) The S0 instrument has NO chroma metric; the data-chroma floor
  (60, derived) lives in `scripts/3d-audit-app.mjs` (port 5188; `APP_SWEEP_OUT_DIR`, `APP_SWEEP_THEME_ONLY=1`) —
  S5's kill tests run through it. Draft spec: scratchpad `s5-spec-draft.md` (X1 REMOVE with its own header as
  the proof; E1 measure-then-retire; join widens THREE unions — `InspectorType` API, `InspectorEntityType` web,
  `ObjectType` in `lib/objectRegistry.ts` — plus `INSPECTOR_TO_OBJECT`/`OBJECT_TYPES`, with a drift test).
- 2026-09-02 · **S6 GROUNDING.** Key-address model `components/command/gpsGrammar.ts` (`GPS_NOUNS`,
  `destinationForNoun`, `GPS_DESKS_WITHOUT_NOUN`); existing figure primitive `components/charts/StatCard.tsx`;
  `num-tabular` on 69 files; `text-micro` = 11px/1.3 in tailwind.config ("reserved for dense data-table cells").
  **Baseline figures-in-first-viewport (after-s3, dark):** /regulatory-dashboard 63 · /bd-pipeline 12 · /gps 10 ·
  /deal-board 8 · /governance/controls 2 · /distribution 1 · /marketing 1 · /command-deck 1 · median over all
  routes **1**, max 86. **CAVEAT THAT DECIDES S6's MEASUREMENT:** the instrument aborts `**/v1/**` by design, so
  desks render EMPTY STATES and the "1" is the empty-state sentence's number, not a density reading. S6's ×3
  claim needs a seeded-fixture mode in the instrument (deterministic canned responses for the desk endpoints)
  or a static count of `<Fig>` mounts per desk — decide before building, not after. `scripts/3d-audit-app.mjs`
  already carries per-route FIXTURES (§ FIXTURES ~line 856) parsed by the app — S6 borrows that mechanism
  rather than inventing one.
- 2026-09-02 · **S7 GROUNDING.** Blender **5.2.0 LTS** is installed (`/Applications/Blender.app`,
  `/opt/homebrew/bin/blender`). The plan's "DMG background missing" is STALE: `apps/desktop/src-tauri/tauri.conf.json:54`
  already sets `dmg.background: ../scripts/dmg-plate.png` — a **1320×840 PNG, 29.8 KB, generated by
  `apps/desktop/scripts/make-dmg-plate.mjs` (2026-08-06)**, not a render; icon set present (`icons/icon.icns`,
  32/128/128@2x, icon.png, from `make-icons.mjs`). S7's question for the plate is whether a machined render
  earns replacing a generated flat one — measured by brand hex from bytes, byte budget, and one look from Nik.
  CONSTRAINTS ALREADY DERIVED in `make-dmg-plate.mjs` (do not re-derive): Finder draws the two icon labels in
  DARK system text and a DMG background cannot change that, so the ground MUST stay light (#FAFAFA LCX White —
  a black plate ships unreadable labels); the mark is READ from `apps/web/public/lcx-mark.svg`, never redrawn
  (brand book); layout positions are read from `tauri.conf.json`, never duplicated; no wording (Inter is not
  an installed font on the volume). A Blender plate inherits all four. S7's remaining objects are therefore: verify the plate's provenance/resolution (below), the launch
  and empty states, the `/lcxos` hero, the print sheets' plate — rendered headless with `view_transform =
  "Standard"` (AgX renders #2C6BFF as #467ECF), brand hex decoded from PNG bytes. Never in CI; never data.
