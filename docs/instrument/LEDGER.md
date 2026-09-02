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
| S4 THE WATCH | DONE · **LIVE both surfaces** (Pages probe 3: JS has `stated prior` + `/v1/watch?since=`, CSS FREE of `pulse-beacon`; Render deployment 6210174494 `success`) | 37fa9f6 | `docs/instrument/audit/after-s4/BASELINE.md` | ambient **49 → 28** (beacon 10 → 0, pulse 13 → 2 in LoadingSkeleton; spin/slide-in unchanged by design); routes with CSS motion at rest **77 → 1** (/ontology = React Flow animated edges → S5); `GET /v1/watch?since=` entitlement-first, stated prior, `absent[]`; ONE arrival store, three readers; feel wired in `invoke.ts`; initial JS 813 → 820/850; ratchets `oneWatch.test.ts` + api `watch.test.ts`; `/v1/watch` declared in the compartment register |
| S5 FLOORS ARE DATA | DONE · **LIVE both surfaces** (Pages probe 1: `do not hold` + `Holdings declaration` present, `import("./shared-` ABSENT from the entry; Render deployment 6213239582 `success`; entry chunk 427,034 → 426,848 B) | 6b2f0dc | `docs/instrument/audit/after-s5/BASELINE.md` + `APP_SWEEP.md` | GL contexts at rest **77 → 2** (/select Forge by design; /ontology orrery default-ON, census counts calls); shell carries GL true → false; X1 REMOVED by its own header's measurement; E1 RETIRED by the scorecard's dichotomy; GL budget re-pinned 3 → 1 with a pinned count of 15 routes at cap; THE JOIN: 18 inspector types across API/web/registry with per-group entitlement and WITHHELD groups (pre-S5 sales leak closed); 7 lazy payloads; `ReliefWatchLine` on six reliefs; app sweep 6/7 reached, 0 findings, 0 worse in light (sweep fixed for default-ON toggles); initial JS 820/850, largest 417/440; hex census held at 125 after catching my own +7; ratchets `oneFloor.test.ts` + api `links.test.ts`; four gates, each red one real |
| S6 THE TERMINAL | DONE · **LIVE both surfaces** (Pages probe 1: `fig-marks` in the entry; Render deployment 6213884207 `success`) | b442dec | `docs/instrument/audit/after-s6-fixtures/BASELINE.md` + `after-s6/` | fixture mode made the density measure honest (before median **27.5** with fixtures, reliefs off); `<Fig>` (value by kind, delta since the ARRIVAL mark, age by staleness on the one clock, source kind, `compare`, `frame`, undated/— refusals, anchor) + `figAddress` registry (g-chord chip, palette rows); all eight desks re-laid; 11 px floor enforced (23 literals); density after: distribution 8 → 59 (×3 MET), gps 19 → 51, wbr 23 → 47, marketing 8 → 8 (refuses by design), command-deck 32 → 60, intel 48 → 91, regulatory 64 → 71 (all UNDATED — dataset has no instant), pipeline 126 → 128; **median 27.5 → 59.5 (×2.16); 1 of 4 targets met, 2 short, 1 refused — reported as measured**; standing metrics held; gate clean first run |
| S7 THE OBJECT | **IN PROGRESS** | — | — | per "S7 BUILD SPEC" below — the PIPELINE and its calibration first (Standard vs AgX on a #2C6BFF patch, decoded from bytes), then the objects in order: /lcxos hero, launch poster, DMG plate beside the generated one, print-sheet mark; ratchet `oneObject.test.ts` |

**NEXT ACTION (S7, 2026-09-02):** Steps (1)–(6) of S7 are DONE and recorded in §5 (pipeline + calibration pair
Standard `#2C6BFF` exact / AgX `#467ECF`; four objects: `/lcxos` hero + sign-in poster via `ForgeStill.tsx`, DMG
composite beside the generated plate NOT wired, print mark in `GpsPrint.tsx`; ratchet `oneObject.test.ts` 6/6).
(7) gate from ROOT is RUNNING → scratchpad `gate-s7-1.log` (needs 0 `npm error` AND all five stage totals);
(8) after the gate — never concurrently, both build into `apps/web/dist` — instrument capture of `/lcxos` + `/select`
both themes into `docs/instrument/audit/after-s7/` (`INSTRUMENT_ROUTES=/lcxos,/select INSTRUMENT_STATIC_ONLY=1`),
checking the still is the ONLY new bytes (no new GL context, no new animation, no CLS from a missing width/height);
(9) commit with bytes + brand-hex evidence (draft: scratchpad `s7-commit-msg.txt`); push `lcx-sales dev:main`;
`scratchpad/verify-live.sh <sha> --js 'data-object' --lazy-js 'forge-print.webp'` (ForgePlate is eager in the entry;
Launch and GpsPrint are lazy — follow imports two levels); (10) flip S7 → DONE · LIVE here, in §2's table, and in
memory `instrument-100x-plan.md`. THEN the program's close-out: re-measure ALL of §1 against the plan's targets
with the instrument (full route sweep, both themes, fixtures ON for the desks) and write the honest scorecard —
what was met, what fell short, what was refused by design — as `docs/instrument/SCORECARD.md`.

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

### S5 BUILD SPEC (grounded 2026-09-02; IN FORCE from S4's commit 37fa9f6)

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

### S6 BUILD SPEC (grounded 2026-09-02; IN FORCE from S5's commit 6b2f0dc)

**The claim under test (plan §S6):** REACH and COMPRESSION — a screen holds three times the figures, every
figure is live and dated, and every figure is one keystroke away. Kill tests CERTAINTY (a figure carries
its own date and delta) and COMPRESSION (figures per viewport ×3 on the eight desks, zero contrast
regressions — `contrast.test.ts` is the judge).

**The eight desks (from `WORKSPACES[].defaultLanding`, not remembered):** `/command-deck` (command),
`/bd-pipeline` (sales), `/command` (intel), `/regulatory-dashboard` (regulatory), `/distribution`,
`/marketing`, `/gps`, `/wbr` (governance).

**1 · `<Fig>` — one figure system (`components/fig/Fig.tsx`, ~2 KB).** Props: `value` (number | null),
`format` (money | int | pct | ratio | duration), `label`, `source: { at: ISO | null; kind: 'record' |
'derived' | 'estimate' }`, `mark?: { value: number; at: ISO }` (the last mark), `state?: StatusRole`,
`address?: string` (the ⌘K noun/verb that reaches it). Renders IBM Plex Mono `tabular-nums` (`num-tabular`
is already on 69 files — Fig makes it the one place), the value, then on ONE line beneath: the delta since
the mark (▲▼ + when, formatted from S1's clock: "▲ 12% · 3 h"), the age of the source instant coloured by
staleness (fresh / aging / stale thresholds per format kind, state tokens only), and the key address as a
kbd chip. **Refuses:** `source.at === null` renders the value UNDATED with a visible "undated" mark and no
delta — the −10 confidence rule made visible, never hidden; `value === null` renders the named absence
("—", with the label) and never a zero.

**2 · The mark.** `useLastSeen(surface)` keeps per-surface marks for hints; S6 adds `lib/figMarks.ts`
(scoped key `fig-marks:v1`, per operator): `{ [figId]: { value, at } }`, written on ARRIVAL (S4's store —
one write per arrival, not per render), read by every Fig. Delta = value − mark.value, when = mark.at.
First arrival: no mark → "first reading" instead of a delta. Under S1: `useClock(1000)` drives the age
text; no private timer.

**3 · The address.** `components/command/gpsGrammar.ts` is the model (nouns → destinations). S6 adds a
`figAddress(figId)` registry: each desk figure declares the ⌘K phrase and `g`-chord that lands on it
(existing grammar entries where they exist; a FIG_ADDRESSES table otherwise), and `<Fig>` shows it. The
palette gains "go to figure" over that table (one entry per figure, deduplicated with existing nouns —
`searchNoun.test` guards the collision).

**4 · The terminal grid on the eight desks.** Replace `StatCard` (7 sites: MetricStatCards, WinLoss,
Dashboard, KpiDashboard, BoardReport) with `<Fig>` rows on a dense grid: no cards inside cards; `text-micro`
(11 px) becomes the ONLY small size (the tailwind scale's smaller sizes are removed and a ratchet forbids
`text-[10px]`/`text-[9px]` literals outside the strip/ticker chrome that already uses 10 px — decide: keep
10 px for TopNav chrome only, listed); `PageTitle` and `SectionLabel` the only headings (ratchet: no `<h2>`/
`<h3>` with ad-hoc classes on the eight desks). Contrast is unchanged by construction (tokens only) and the
ratchet proves it.

**5 · MEASUREMENT — decided before building.** The S0 instrument aborts `**/v1/**`, so today's "figures in
first viewport" on the desks is the empty-state sentence's number (median 1). S6 adds a FIXTURE MODE to
`scripts/instrument-audit.mjs` (`INSTRUMENT_FIXTURES=1`): per-desk canned responses for the endpoints each
landing reads (borrowed from `scripts/3d-audit-app.mjs` § FIXTURES, which already mirrors `lib/api/*`
shapes; extended for the eight landings), deterministic under the frozen clock. Baseline is re-taken WITH
fixtures BEFORE the re-layout (an honest "before"), then after. Target ×3 on each desk; the report prints
both numbers per desk and the median. Density that comes from fixtures is a property of the layout, not of
the data — stated in the report header.

**Per-desk endpoints the fixture mode must answer (read from the pages 2026-09-02, not remembered):**
`/command-deck` CommandDeck.tsx → fetchCommandOverview, fetchCommandDecisions, fetchCommandFinancials,
fetchCommandPartners, fetchCommandRisks, fetchCommandTasks, fetchLaunchSim · `/bd-pipeline` BdPipeline.tsx →
fetchBdPipeline, fetchHandoffs, fetchLeadRowsByIds, fetchTasks · `/command` CommandCenter.tsx → fetchForecast,
fetchPortfolio, fetchSlos · `/regulatory-dashboard` Dashboard.tsx → NO fetchers (compiled state data) ·
`/distribution` DistributionCockpit.tsx → fetchDistCampaigns, fetchDistributionDeep, fetchPresence ·
`/marketing` Marketing.tsx (58 lines) → NO fetchers (a landing) · `/gps` Gps.tsx → fetchGpsClients,
fetchGpsEngagements, fetchGpsSummary · `/wbr` Wbr.tsx → fetchWbr. `scripts/3d-audit-app.mjs` already stubs the
command set (COMMAND_STUBS) and bd leads — reuse those payloads.

**Ratchet `oneTerminal.test.ts`:** no `num-tabular` + digit rendering outside `<Fig>` on the eight desks
(grep-provable by page closure); every `<Fig>` on a desk declares `source`; no `text-[N px]` literal below
11 px outside the listed chrome; the eight desks have no `StatCard`.

**Budgets:** `<Fig>` ~2 KB eager (shell chunk) — initial JS must stay ≤ 850 (was 820 after S4; S5's X1
removal recovers ~3.9 KB); fonts unchanged (Plex Mono is already loaded — NO third preloaded font).

### S7 BUILD SPEC (grounded 2026-09-02; IN FORCE from S6's commit b442dec)

**What S7 is, and is not (plan §S7, §3.3):** the things that reach a hand — rendered in Blender 5.2 headless on
this M1, shipped as WebP beside their `.blend` and `render.py`, NEVER in CI, NEVER encoding a number. Exempt from
the five kill tests as a brand artefact; bound by the byte budget and by brand fidelity DECODED FROM THE PNG BYTES
(not read back through Blender's colour management). `view_transform = "Standard"` is the only transform that
round-trips `#2C6BFF` exactly; AgX renders it `#467ECF` — that pair IS the calibration test, run on every render.

**Grounded facts (§5, not remembered):** the repo holds NO `.blend`, `render.py` or Blender script; Blender
**5.2.0 LTS** is installed (`/Applications/Blender.app`, `/opt/homebrew/bin/blender`); the DMG plate EXISTS
(`apps/desktop/scripts/dmg-plate.png`, 1320×840, 29.8 KB, generated by `make-dmg-plate.mjs`, four derived
constraints: light ground because Finder draws the labels dark, mark read from `lcx-mark.svg` never redrawn,
positions read from `tauri.conf.json`, no wording); `/lcxos` is `pages/Launch.tsx` whose hero is `<LcxMark>` + an
`<h1>` with no image; `SelectOperator` mounts the live E8 `ForgeBackdrop` over `ForgePlate` (a CSS sweep); `public/`
= fonts + `lcx-mark.svg` + favicon (744 K; passthrough 722/1024 KB → ~300 KB headroom, budgeted PER ASSET).

**1 · The pipeline (`scripts/blender/`).** `forge.blend` (the E8 object: machined disc on a plinth inside a
polished ring, the materials E8's README authored — disc r0.30/m0.95 brushed, ring r0.13/m0.92 brand blue,
plinth r0.52/m0.35, floor r0.88 dielectric; anisotropic values carried as the README says), `render.py`
(headless: `blender -b scripts/blender/forge.blend -P scripts/blender/render.py -- --out <png> --scale 2
--transform Standard`, EEVEE first, Cycles+OIDN on Metal only if a material needs it), `calibrate.py` (renders a
flat patch of `#2C6BFF` under the same transform), `encode.mjs` (2× PNG → 1× WebP via Blender's own WEBP output
at 1× after downsample, or `sips`+`cwebp` if present — whichever is on this machine, recorded), and
`brand-hex.mjs`: a dependency-free PNG decoder (zlib inflate + filter reversal) that reads the calibration patch's
bytes and asserts `#2C6BFF` exactly, with the AgX render as the NEGATIVE CONTROL (`#467ECF`) — an instrument that
cannot move is not reading. Every render writes a sidecar `.render.json` (blender version, transform, seed,
samples, digest) beside the asset.
**Tooling, checked on this Mac 2026-09-02:** no `cwebp`, `avifenc` or ImageMagick → Blender writes WebP DIRECTLY
(`WEBP` output confirmed in 5.2.0) and `sips` downsamples the 2× PNG; **PIL 11.3 is installed**, so `brand-hex`
decodes the calibration patch from the PNG bytes with PIL (no hand-rolled decoder, and still outside Blender's
colour management); AVIF is therefore NOT shipped (no encoder) — WebP only, said in the sidecar. In `-b` mode the
view-transform enum enumerates lazily; `render.py` sets `scene.view_settings.view_transform = 'Standard'`
explicitly and the sidecar records what was set AND what the calibration decoded.

**2 · The objects, in order, each with its budget:**
- **/lcxos hero** — the Forge object as `<picture>` (AVIF if the encoder exists, WebP always) at 1×/2×, ≤ 120 KB
  total, `loading="eager"` `decoding="async"` with explicit width/height (no layout shift), alt text that names
  the object, and a `prefers-reduced-motion`-independent STILL image (S4 rule: the arrival is the only motion).
  Light AND dark variants (the page is themed), each calibrated.
- **Launch / empty states** — `SelectOperator`'s no-WebGL and reduced-motion path today is `ForgePlate` (CSS). S7
  adds the rendered poster as that fallback (rule 1: the flat fallback should be the object, not a gradient) at
  ≤ 80 KB; the live GL Forge stays for capable hardware.
- **DMG plate** — a Blender render of the SAME composition the generator draws, honouring all four constraints
  (light ground, mark placed from `lcx-mark.svg` geometry — the mark itself is never re-modelled — positions from
  `tauri.conf.json`, no wording). Produced BESIDE the generated plate; the choice is the owner's ("DMG background
  needs one look", plan §9). Zero web bytes either way.
- **Print sheets' plate** — the GPS proposal sheet (`GpsPrintSheets.tsx`) gets a small rendered mark in its
  header (≤ 30 KB, printable `<img>`); paper is the budget: no full-bleed plate.
- **App icon** — exists, generated from the mark's geometry (`make-icons.mjs`); S7 does NOT re-render it (the
  brand book forbids redrawing the mark; a 3-D icon would be a redraw).

**3 · Measured.** Per asset: brand hex from bytes (the calibration patch), bytes vs budget, dimensions; the
`perf-budget` passthrough line before/after; `/lcxos` and `/select` captured by the instrument both themes with
the images present (0 page errors, no layout shift — width/height attributes pinned by a test). **Refuses:** a
render whose calibration patch is not `#2C6BFF` is not shipped; a render over budget is not shipped.

**Ratchet `oneObject.test.ts`:** every shipped WebP under `public/objects/` has a sidecar with
`transform: "Standard"` and `brandHex: "#2C6BFF"`; every `<img>` of them declares width and height; total
`public/objects/` bytes ≤ the budget; no `.blend` is imported by web code; nothing under `scripts/blender/` is
referenced from CI config.

## 3 · THE STANDING RULES OF THIS BUILD — the quality bar, made mechanical
- **zsh trap (bit 2026-09-02):** `path` is zsh's PATH array — a loop variable named `path` empties PATH for the rest
  of the command ("command not found: head"). Never name a shell variable `path`; each Bash call is a fresh shell.

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
- 2026-09-02 · **S5 · X1 REMOVED.** `SignatureBackdrop.tsx` (638 lines), its AppLayout mount, and
  `ambientBackdrop.test.tsx` deleted. THE DERIVED FACTS THAT TEST PINNED, kept here so nobody re-derives them
  (one rounding convention: a LEVEL is round(255·linearToSrgb(L))): through the shipped tone map + encode,
  dark `--page-bg` #090e1b → 9 14 27 (plate to the byte; vignette darkest 3 5 13) but light #f4f6fb →
  **213 214 217 at ZERO vignette amplitude** (31/32/34 levels lost; darkest 149 150 153 at 0.62) — so five
  certified roles fall under 4.5:1 (`--chart-4` 4.574 → 3.403, `--green` 4.932 → 3.669, `--amber` 5.224 →
  3.887, `--grey` 5.671 → 4.219, `--indigo` 5.815 → 4.326) and "ship it flat" is the same defect. The light
  DOWN corridor is TWO numbers: 10 levels against the ratchet's text roles, 2 levels against every token
  darker than the canvas (`--chart-4` at 4.574:1). Negative vignette depth brightens only the EDGES (centre
  meets the curve unmultiplied) so no shipped uniform yields a light backdrop. A subtractive plate can only
  RAISE dark-theme contrast (every pixel ≤ page luminance). Verdict under plan §3.1: a layer that draws
  nothing on the default theme and an empty plate on the other carries no information; removed.
- 2026-09-02 · X1 follow-through: web tsc clean; `glContextBudget.test` shell assertion INVERTED with the reason
  in its message (the shell must reach NO `sharedRenderer()` caller; routes at zero must exist again);
  `printStylesAmbientCanvas` header, `PrintStyles.tsx`, `CommandDeck.tsx` comments, `lane-closure.mjs` lane and
  `3d-audit-app.mjs` prose rewritten. THE CENSUS THEN WENT RED CORRECTLY: `/command-deck` = **2** contexts (E1 +
  E5; its charts are SVG, so the shared context on that page came only from the shell) against the pin of 3.
  The pin moves ONCE, after E1's retirement (next), not twice.
- 2026-09-02 · **STANDBY CHECKPOINT (owner's usage limit; resume 2.5 h later). TREE IS DIRTY AND UNCOMMITTED —
  do NOT gate or commit until the list below is clear; do NOT run git reset/checkout/stash.** DONE in tree:
  X1 removed (+ its 6 references), E1 files `git rm`'d (`DeckRelief.tsx`, `DeckReliefGl.tsx`, `deckSlots.ts`,
  `geometry/__tests__/deckRelief.test.tsx`), CommandDeck unwrapped (DOM deck kept; retirement comment),
  `docs/3d/e1/README.md` first line = RETIRED verdict, `reliefFallback`/`reliefAccessibility`/`useQualityTier`
  (list 8 → 7)/`glContextBudget` (owners ≥ 8; shell assertion inverted) partly fixed, `reliefPrintPath` guard
  re-pointed E1 → E5 (counts `svg`; VERIFY the default state counts exactly 1 svg — if not, count the plot's
  root another way), comments in useQualityTier.ts / PrintStyles.tsx / reliefRedrawRatchet / reliefTheme.
  **REMAINING (all one kind: "eight surfaces" enumerations → seven, and E1-only tests deleted):** tsc:
  `reliefAccessibility.test.tsx:382` dynamic `import('@/components/geometry/DeckRelief')`;
  `reliefFallback.test.tsx:560` DeckRelief/PANELS render; `reliefPrintPath.test.tsx:452` DeckRelief/PANELS
  render. Failing (20): glContextBudget — worst route is now **AuditLog = 1** (no route reaches 2 any more:
  relief pages' flats are SVG, chart pages have no relief) → CONCURRENT_CAP 3 → **1** and replace the single
  WORST_ROUTE pin with the SET of routes at the cap (the six relief routes) so ties are not a diff; "each
  relief has exactly one mount site" (read its message — likely `censused >= 9` → 8); shadowBaselineCensus ×2
  (an E1 `SHADOW_SIZE` exception to drop / count 8 → 7); reliefTheme ×3 (owner list 8 → 7); reliefRedrawRatchet
  ×3 + "E1 DeckReliefGl schedules no frame" (delete the E1-only test; counts 8 → 7); reliefFallback "covers all
  eight" / "renders all eight" → seven, "no relief file touches document…" (list); reliefPrintPath "E1 DeckRelief
  ships on CommandDeck" + "E1 keeps the flat figure" (delete), "all three printable surfaces … four unprintable"
  → two printable / four unprintable (SurfaceRelief on CommandDeck, StormRelief on MarketingCrisis), "two print
  attributes declared by the wrappers and the sheet" (re-read). THEN: tsc → suites → S5 step 3 (binds) and step
  4 (the join) per the S5 BUILD SPEC → gate from ROOT → after-s5 capture (5189) then app sweep (5188) →
  commit → push → verify-live → flip S5.
- 2026-09-02 (resumed 05:09 IST) · **E1 RETIREMENT COMPLETE IN TREE.** Web tsc clean. Every "eight surfaces"
  pin moved to seven (reliefFallback roster + GL_ENTRY_POINTS + 16 → 14 files + server-render cases;
  reliefAccessibility SURFACES/nouns/FILES 7 → 6 and its refusal test RE-POINTED E1 → E5 SurfaceRelief rather
  than deleted; reliefPrintPath PRINTABLE/printable lists, wrapper pair list, loading-state guard re-pointed to
  E5 counting `svg`; reliefRedrawRatchet floors 8/7/7/7 → 7/6/6/6; reliefTheme 8/7/6/6/5 → 7/6/5/5/4;
  shadowBaselineCensus KNOWN_OWNERS 8 → 7; useQualityTier list 8 → 7; glContextBudget owners ≥ 8). **GL
  BUDGET RE-PINNED ON MEASUREMENT:** CONCURRENT_CAP **3 → 1** (no route can hold two contexts any more) and
  the single worst-route name replaced by a pinned COUNT of routes at the cap = **15** (six relief routes +
  nine flat-chart routes), with CommandDeck required among them. All relief suites green.
- 2026-09-02 · **TWO CORRECTIONS TO THE S5 SPEC, FROM THE SOURCE.** (a) E2's "twelve placeholder cities" are
  ALREADY GONE — `GlobeReliefGl.tsx:51-52`: "This file has a real book and no cities"; the globe sites the
  market-map book (`buildGlobeBook(points).sites`) and refuses with NO_PLACEABLE_REGION when empty. E2 is KEPT
  AS IS; the gps_client bind is dropped (it was aimed at a stale reading of the header). (b) "Watch marks on
  E3/E5/E6" are bound in the WRAPPERS' DOM captions from `useArrivalStore` (per-compartment changed count +
  top item, still, entitlement-aware) — not as per-renderer GL marks, which the instrument's no-API capture
  could never see and which would be three shader/mesh programmes for a mark a caption states in words.
  NEXT: step 4 (the join) then step 3 (captions), then gate.
- 2026-09-02 · **S5 STEP 4 — THE JOIN — BUILT.** API `graph/links.ts`: `InspectorType` 11 → **18**
  (`engagement target partner client draft holding asset`), resolvers for all of them AND for `jurisdiction`
  (had a payload, no resolver); `RelatedResolver(pool, id, ctx)` takes the reader's entitlements from the
  route (`loadEntitlements` + `capAtLeast`, per GROUP — `/v1/graph` stays outside the workspace gates because
  it spans compartments); a group the reader does not hold is returned **WITHHELD** `{count 0, items [],
  withheld: ws}` — and the PRE-S5 LEAK IS CLOSED: sales groups were served to every operator regardless of
  compartment; now they are withheld below sales:view. `graph/__tests__/links.test.ts` (7) pins: withheld
  groups never query the register, sales/gps/marketing each withheld for the reader without them, the
  engagement's sales parent is a locked line for a gps-only reader. Web: `InspectorEntityType`, `ObjectType`,
  `OBJECT_TYPES`, `INSPECTOR_TO_OBJECT`, `SalesGraph.NODE_COLOR` all widened; `RelatedPanel` renders withheld
  groups as a locked line naming the compartment; payloads `GpsInspectors.tsx` (engagement, client, target,
  partner, draft — through the desks' existing clients; drafts carry `engagementId` as seed because the
  factory reads per engagement) and `MarketingInspectors.tsx` (asset, holding — from the one perimeter view,
  showing its own "absence is not clearance" sentence; holdings keyed by member+asset seed since the view
  carries no row ids). Ratchet `lib/__tests__/oneFloor.test.ts`: removed layers cannot return by import;
  the six wrappers refuse to a flat form; the THREE unions are identical sets (18) and the registry maps
  all; every resolvable type has an InspectorBody case; the panel says what is withheld. Suites: api 7/7,
  web 50/50. **STEP 3 — captions:** `components/shared/ReliefWatchLine.tsx` reads the ACTIVE workspace's
  room from `useArrivalStore` and is mounted in all six wrappers' control rows (DOM, still, no fetch).
- 2026-09-02 · S5 tree COMPLETE: api + web tsc clean; 37 web suites / 467 tests touched by S5 green after two
  more eight→seven pins (`qualityTierStamp.test` `KNOWN_SURFACES` 8 → 7; SalesGraph `NODE_COLOR` widened to
  18; lucide has no `Handshake` → `HeartHandshake`). **S5 GATE #1 running from the ROOT →
  `/tmp/gate-s5.log`.** Then, sequentially: after-s5 capture (`INSTRUMENT_OUT_DIR=…/after-s5`, port 5189) →
  app sweep (`APP_SWEEP_OUT_DIR=…/after-s5/app-sweep`, port 5188 — FIRST drop E1 from its roster) → commit
  with GL contexts 77 → N, eager bytes, chroma verdicts → push → `verify-live.sh <sha> --js 'do not hold'
  --js 'Open holdings desk' --js-absent 'Theatre view'` (E1's toggle label is the deletion needle).
- 2026-09-02 · **S5 GATE #1 RED, correctly, twice** (stage 4 = the web workspace's own full run, 2,737):
  `aiProse.test` — the draft payload rendered MODEL OUTPUT in a `<pre>`; the repo's rule is that model output
  is data rendered through `<AiProse>`, never markup → fixed. `marketingCeiling.test` — a new file naming a
  `/v1/marketing` route (in my header comment) is a red by design; the payload reads only through the
  ceilinged `fetchAbusePerimeter`, so the comment stops naming the route instead of widening the enumeration.
  After-s5 capture launched meanwhile (no gate running); gate #2 AFTER the capture completes.
- 2026-09-02 · **LIVE-CHECK DESIGN FOR S5, corrected before use.** My script fetches only assets the index
  references (entry chunk + CSS), so E1's "Theatre view" label — in a LAZY page chunk — would pass a
  `--js-absent` check vacuously; and X1's class string `inset-0 -z-10 overflow-hidden` is shared with the
  sign-in ForgeBackdrop, so it is not a clean needle either. DELETION EVIDENCE IS NUMERIC: today's live entry
  chunk `/assets/index-CDAxB4p2.js` = **427,034 B** and contains that class string ×1; after the deploy the
  entry must be smaller by about X1's 3.9 KB eager cost and the count should be 0 if the ×1 was X1's (if it
  stays 1, it is Forge's — say so, do not claim). POSITIVE needles prove the S5 build: `do not hold` (RelatedPanel
  locked line) and `Open holdings desk` (marketing payload) are 0 in today's entry and must become present.
  THE CLEAN DELETION NEEDLE: today's entry chunk contains `import("./shared-Ck7dlPah.js")` ×1 — the flat
  renderer's shared-context chunk, reached from the entry ONLY through `useFlatChart`, whose sole eager importer
  was X1. After the deploy the entry must contain NO `import("./shared-` at all →
  `verify-live.sh <sha> --js 'do not hold' --js 'Open holdings desk' --js-absent 'import("./shared-'`.
- 2026-09-02 · **S5 MEASURED (after-s5, HEAD 37fa9f6 tree + S5 edits):** routes creating a GL context at rest
  **77 → 2** (`/select` = the sign-in Forge, by design; `/ontology` = 2 WebGL contexts — attribution below);
  shell carries GL **true → false**; timer call sites 13 → 11; files in union 410 → 407; CSS motion at rest
  still 1 (/ontology's React Flow edges); vt 76; rAF 0; intervals 2; errors 0. **ONE REGRESSION CAUGHT BY THE
  CENSUS AND FIXED BEFORE COMMIT:** hex literals outside the token system 125 → **132** = my seven SalesGraph
  `NODE_COLOR` hex values; replaced by `rgb(var(--green|--chart-2|--amber|--indigo|--chart-4|--chart-5|--red))`
  (a node style is DOM, so token triples work) and confirmed by `INSTRUMENT_STATIC_ONLY=1` into a scratch dir:
  **125**. The committed after-s5 report is RE-CAPTURED after the gate so its static block matches the tree.
  Gate #2 running.
  ATTRIBUTION of /ontology's "2": the orrery defaults ON (`reliefPreference.ts:50`, evidence-backed) and the
  ontology explorer runs on COMPILED data — the one relief route the no-API capture does not starve into flat;
  `createStage` rebuilds in place on the SAME canvas when size step / tier settles and `getContext('webgl2')`
  returns the same object (`packages/gl/src/stage.ts:519-526`), and the probe counts CALLS → one live context.
  OPEN ITEM (§4): the instrument should count DISTINCT canvases, not getContext calls.
- 2026-09-02 · **S5 GATE #2 RED, correctly, once more:** `aiProseValidIds.test` — every `<AiProse>` call site must
  declare the citation set it can back; a factory draft carries none → `validIds={[]}` ("say none, do not guess
  a set into existence"). Fixed; gate #3 next, then the app sweep, then the full after-s5 RE-CAPTURE.
- 2026-09-02 · **S5 GATE #3: five test stages GREEN (1,997 · 358 · 3,532 · 2,737 · 20), PERF BUDGET RED** —
  initial JS **854 / 850** (was 820), largest chunk **452 / 440** (was 417): the seven join payloads were
  imported STATICALLY by `InspectorBody` (eager in the shell) and dragged `lib/api/gps.ts`,
  `gpsOrigination.ts` and `marketing.ts` (+ its honesty ceiling) into the entry — my own commit draft had
  claimed "the payloads are lazy with the drawer", which was false until now. FIX: the seven cases are
  `React.lazy` picks over two dynamic imports with a `Suspense` skeleton; the eleven original payloads stay
  static (already eager). The budget is proved by `build` + `perf-budget` BEFORE gate #4, not by hope.
- 2026-09-02 · **S5 GATE #4 CLEAN** (0 npm errors; 1,997 · 358 · 3,532 · 2,737 · 20; perf budget OK — initial JS
  **820 / 850**, largest chunk **417 / 440**, 208 lazy page chunks). App sweep launched DETACHED (`nohup`, log
  `/tmp/app-sweep-s5.log`, `APP_SWEEP_OUT_DIR=…/after-s5` → `after-s5/APP_SWEEP.md` + `after-s5/app-sweep/`,
  captures git-ignored). Then the full after-s5 RE-CAPTURE (5189), then commit.
- 2026-09-02 · **APP SWEEP RUN #1: 1/7 reached — E2–E6 `TOGGLE_DID_NOT_ENGAGE` in both themes.** Not a regression
  of S5: the six kept reliefs DEFAULT ON since cafb955 (2026-08-21) and the sweep last ran 2026-08-14 (bd4f1c2)
  against default-OFF toggles — it clicks an already-pressed toggle (turning the relief OFF) then waits for
  `aria-pressed="true"`. A stale instrument, not six broken surfaces. FIX in `3d-audit-app.mjs`: if the toggle
  is pressed before the sweep touches it, turn it OFF first (wait for the flip; `TOGGLE_STUCK_ON` if it never
  does), take `preClick`/`flatBefore` with the relief genuinely off, then click to ENGAGE; rows carry
  `defaultOn`. Sweep run #2 launched detached. (E7 `TOGGLE_DISABLED` is by design: no forward risk feed.)
- 2026-09-02 · **APP SWEEP RUN #2: 6/7 reached in both themes, 0 findings, 0 worse in light** (E8 forge, E4
  orrery, E3 pipeline, E2 globe, E6 vault, E5 surface; E7 disabled by design). Light/dark sd ratios 123–302%.
  Reports at `docs/instrument/audit/after-s5/APP_SWEEP.md` + `app-sweep/README.md` (captures ignored). Full
  after-s5 RE-CAPTURE launched detached (`/tmp/instrument-after-s5.log`); commit follows it.
- 2026-09-02 · **S5 COMMITTED 6b2f0dc, PUSHED, VERIFIED LIVE** — recapture matched the draft (hex 125, GL 2, shell
  false, errors 0); Pages needles all present/absent as designed at probe 1; Render 6213239582 `success`. Entry
  chunk **427,034 → 426,848 B**: X1's eager bytes left, the join's eager registry/panel growth took most of it
  back — a net −186 B, said rather than rounded up to "3.9 KB saved". S6 opened.
- 2026-09-02 · **S6 STEP 1 — FIXTURE MODE.** `scripts/instrument-fixtures.mjs`: the smallest deterministic payloads
  that render the eight desk landings POPULATED (shapes mirror `lib/api/*.ts`, read on the day; command +
  pipeline follow the sweep's own fixtures, duplicated because that file sweeps on import; instants anchored to
  the frozen clock; NO report number is read off a fixture value). `instrument-audit.mjs`: `INSTRUMENT_FIXTURES=1`
  registers them AFTER the abort floor on desk routes only; totals carry `fixtures`; the runtime header says
  density is a property of the LAYOUT; a per-desk figures line (dark/light) is printed. First before-capture
  (eight desks, fixtures on): `/regulatory-dashboard` 64 · `/bd-pipeline` 13 · `/command` 48 · `/wbr` 23 ·
  `/distribution` 8 · `/marketing` 2 · `/gps` 19 · `/command-deck` 2 — AND TWO FINDINGS BEFORE TRUSTING IT:
  (a) `/command-deck` = 2 because it CRASHED (4 page errors "reading 'length'"): my launch-sim fixture lacked
  `warnings[]` (LaunchSim's full shape read from command.ts and fixed); (b) `/bd-pipeline` = 13 with GL 4 and 5
  running animations: the E3 relief is DEFAULT ON, so under fixtures the desk mounted its GL channel view and
  the DOM table's figures were not in the viewport. The density claim is about the DOM terminal, so fixture mode
  ALSO SEEDS every `relief:*` preference OFF and says so in the header. The wiring slip: my first python pass
  aborted on an anchor and wrote nothing, and the "before" that ran was a plain no-API run — caught by the
  header line not appearing; re-applied and re-run. Honest BEFORE re-taken after both fixes.
- 2026-09-02 · **S6 HONEST BEFORE (fixtures on, reliefs OFF, 0 page errors, HEAD 6b2f0dc)** — figures in the first
  viewport per desk: `/regulatory-dashboard` **64** · `/bd-pipeline` **126** · `/command` **48** · `/wbr` **23** ·
  `/distribution` **8** · `/marketing` **2** · `/gps` **19** · `/command-deck` **32**; median **27.5**. HOW THE ×3
  APPLIES, decided before building so it cannot be re-read to fit the result: the pipeline desk is already a dense
  table (126) and the regulatory dashboard a wall of compiled figures (64) — tripling them would be gaming the
  count, so those two get the CERTAINTY half of S6 (every figure dated, with its delta since the mark) and no
  density target; the ×3 is the target for the desks BELOW the median — `/distribution` (8 → 24), `/marketing`
  (2 → 6), `/gps` (19 → 57), `/wbr` (23 → 69) — and `/command-deck` (32) and `/command` (48) are reported as
  measured with the same `<Fig>` conversion. The after is taken with the SAME fixture mode; both numbers go in the
  commit body per desk, with the median.
- 2026-09-02 · **S6 BUILT SO FAR:** `components/fig/Fig.tsx` (`<Fig>` + `<FigGrid>`: value by kind in `num-tabular`
  Plex Mono, delta since the MARK with ▲▼ and tone, age by staleness in STATUS tokens from `useClock(1000)`,
  source kind record/derived/estimate, `undated` and `—` refusals visible, `id=fig-<id>` anchor + scroll on hash);
  `lib/figMarks.ts` (current → mark promoted by `useArrivalStore.arrive` via `rollover()`; first reading said);
  `components/fig/figAddress.ts` (registry → `g<key>` chip from `lib/destinations.ts`, `figPaletteItems()` spread
  into `PAGE_COMMANDS`); `/distribution` re-laid as the first terminal (20 registered figures; engine outputs dated
  by the instant they were computed, records by their newest timestamp). CORRECTION: `/marketing`'s landing
  renders `MarketingDesk`, which fetches (summary, queue, perimeter, …) — my "no fetchers" note was wrong and its
  before of 2 is an aborted-API reading; the marketing ceiling is a plain unwrap, so it is fixtured (summary +
  queue + perimeter) and that desk's before RE-TAKEN before its conversion: **`/marketing` = 8** (fixtures on, 0
  errors; ×3 target → 24). The eight-desk before is therefore 64 · 126 · 48 · 23 · 8 · **8** · 19 · 32, median 27.5
  (unchanged). Converted so far: `/distribution` (20 figs), `/wbr`, `/command` (intel), `/bd-pipeline` header,
  `/regulatory-dashboard` (its compiled dataset carries NO instant → its figures read `undated` — a finding about
  the data, kept visible). Fig gained `compare` (the record's own comparison beside the arrival delta).
- 2026-09-02 · S6 conversions continued: `/gps` (12 figs: live, clients, engagements, open value/margin/vendor
  cost PER CURRENCY — largest shown, others counted, never summed —, collected, awaiting deposit, oldest accepted
  as a duration, three gaps; dated by the instant the summary was computed), `/command-deck` (16 figs: counts
  strip, gating, gap register; dated by the overview's `generatedAt`), registry now covers distribution,
  governance, intel, gps, command, regulatory, sales (+ prefixes for data-keyed WBR metrics and SLOs). Ratchet
  `lib/__tests__/oneTerminal.test.ts` written: per-desk `<Fig>` minimums WITH reasons, no private figure
  components, every id registered or prefixed, chords resolve, 11 px floor, Fig still. REMAINING: `/marketing`'s
  `DeskMeasurement` (its `LowerBoundTile` carries an observation FRAME — an honesty device the figure must keep,
  so Fig gains a `frame` slot), then gate → after-s6 capture (fixtures) → commit.
- 2026-09-02 · S6 conversions COMPLETE on all eight desks: `/marketing`'s `DeskMeasurement` → 4 `<Fig>` with
  `frame` (the lower-bound sentence + `ObservationFrameNote` travel with each count; the coverage explanation
  `<p data-testid="mkt-post-time-coverage">` kept verbatim as the frame). THE FLOOR ENFORCED: 22 `text-[9|10px]`
  literals on the desks → `text-micro` (CommandDeck 8, DeskMeasurement 7, Gps 4, Dashboard 3) + one `text-[7px]`
  on Dashboard. Ratchet minimum for `/distribution` stated as 16 LITERALS (one `<Fig` inside a map renders four).
  Web tsc clean; 47 suites / 748 tests green around the desks. NEXT: gate from ROOT → after-s6 capture (fixtures
  on, reliefs off, eight desks + a full 79-route run for the other metrics) → commit with per-desk before/after.
- 2026-09-02 · **S6 GATE #1 CLEAN, first run** (0 npm errors; 1,997 · 358 · 3,532 · 2,743 · 20; perf OK 820/850,
  418/440, 209 lazy chunks). **DENSITY MEASURED** (after-s6-fixtures, 0 errors): distribution 8 → **59** (×7.4, MET);
  gps 19 → 51 (×2.7, 6 short of 57); wbr 23 → 47 (×2.0 — the review's narrative + executive summary sit above its
  figures by the WBR's own form; left); marketing 8 → 8 (×1.0 — BY DESIGN: the desk's four lower bounds are all it
  can observe and it refuses the rest in its own table; a figure system cannot honestly add what the desk refuses);
  command-deck 32 → 60; intel 48 → 91; regulatory 64 → 71 (certainty; all six UNDATED — dataset has no instant);
  pipeline 126 → 128 (certainty). **Median 27.5 → 59.5 (×2.16). One of four targets met, two short, one refused —
  reported as measured.** The honest `/marketing` before (8) copied into `before-s6-fixtures/marketing/`. Full
  79-route capture launched detached → `after-s6/`; commit follows.
- 2026-09-02 · **S7 GROUNDING (cont.):** the repo holds NO `.blend`, no `render.py`, no Blender script — S7 starts
  from zero on the render side (Blender 5.2.0 LTS is installed). `/lcxos` is `pages/Launch.tsx` (261 lines): its
  hero is `<LcxMark size={36}>` + an `<h1>` — no image; `SelectOperator` mounts `ForgeBackdrop` over `ForgePlate`
  (a CSS studio sweep). `public/` = fonts + `lcx-mark.svg` + favicon + apple-touch-icon (744 K; passthrough
  722/1024 → ~300 KB headroom). GPS print sheets: `components/gps/GpsPrint.tsx`, `GpsPrintSheets.tsx`.
  TOOLING checked: no cwebp/avifenc/ImageMagick; Blender 5.2.0 writes WEBP directly; `sips` present; **PIL 11.3
  present** → brand hex decoded from PNG bytes via PIL (never through Blender's colour management); AVIF not
  shippable here. S7 spec DRAFT in scratchpad `s7-spec-draft.md` (pipeline `scripts/blender/`, objects in order:
  /lcxos hero ≤ 120 KB, launch/empty poster ≤ 80 KB, DMG plate render BESIDE the generated one for Nik's one look,
  print-sheet mark ≤ 30 KB; app icon NOT re-rendered — a 3-D icon would redraw the mark; ratchet `oneObject.test.ts`).
- 2026-09-02 · **S7 STEP 1 — THE PIPELINE, CALIBRATED.** `scripts/blender/`: `render.py` (headless wrapper; SETS
  `display sRGB / view_transform / look None / exposure 0 / gamma 1` explicitly, never trusting the file; sidecar
  `.render.json` with version, engine, transform, samples, bytes, digest), `calibrate.py` (a scene from nothing:
  ortho camera, emission plane of the linearised hex, no world light), `brand_hex.py` (PIL decodes the PNG BYTES —
  outside Blender's colour management — mode + mean over a 16² box; `--expect` refuses on mismatch; writes the
  reading into the sidecar), `build_forge.py` (the E8 object FROM `docs/3d/e8/entry.ts` numbers: disc cyl r0.92
  h0.16 @y0.30, ring torus R1.06 r0.055, plinth cyl r1.9 h0.09 @y0.045, floor plane 16; materials at the README's
  AUTHORED perceptual values with RADIAL anisotropy tangents; camera target (0,0.34,0) d5.0 az22° el24° fov30°;
  key light direction from the harness's arc at one phase; Y-up → Z-up mapping (x,y,z)→(x,−z,y); the `.blend` is
  DERIVED and regenerated, not committed), `encode.py` (PIL LANCZOS 2×→1×, WebP 1×+2×, budget refusal, sidecar
  carried). **CALIBRATION MEASURED:** Standard → **#2C6BFF exact** (mode = mean over 256 px); AgX → **#467ECF** —
  the plan's negative control, reproduced to the byte. Nothing ships without this pair.
- 2026-09-02 · **S6 VERIFIED LIVE** (Pages probe 1 after the live-check script learned to follow the entry's imports
  two levels — `<Fig>` is shared by eight page chunks and Vite split it to depth 2; Render 6213884207 `success`).
- 2026-09-02 · **S7 STEP 2 — FIRST RENDERS, LOOKED AT.** EEVEE @2× (15 s dark / 9 s light): the disc showed a
  HOTSPOT, not the README's bar — EEVEE does not render anisotropic specular (the inputs were set; the engine
  ignores them), so the object needs CYCLES, which the plan reserves for exactly "when a material needs it";
  Metal GPU (Apple M1, 8 cores) exposed in `-b`; Cycles 96 spp + OIDN at 2400×1440 = 54 s. Also fixed from the
  look: the harness's 16-unit floor showed its far edge as a band at this camera (→ 40), and brushed metal under
  a flat world read dead (→ a zenith→horizon gradient sky per theme). Cycles v1: the radial anisotropic lobe
  renders (correct for a lathe-brushed disc — the harness's tangents are radial too) but the 6° sun at energy 5
  blew the centre to a white crescent → v2: 18° sun at 3.0 (dark) / 2.4 (light). Every iteration is a diff to
  `build_forge.py`; the `.blend` is regenerated and git-ignored.
- 2026-09-02 · **S7 v3 ACCEPTED (looked at, both themes).** v2 still blew the centre — the cause was GEOMETRIC, not
  exposure: a RADIAL brush tangent on a flat cap collapses the anisotropic lobe into a starburst at the axis. A
  lathe-brushed disc's grooves run CONCENTRIC (tangential), and the highlight stretches along the grooves — that
  is the README's "broad swept bar" bending around the face. Blender expresses it as `Anisotropic Rotation 0.25`
  (90°) with the RADIAL tangent node; the material VALUES stay as authored. Also v3: an AREA key (disk, 2.2 units,
  260/180 W) replaced the point-like sun, with the harness's steep −0.95 drop relaxed to `--key-drop 0.62` so the
  bar lands on the wall and ring; light theme world 0.9 and a slightly darker floor/plinth (`#DDE5F0`/`#B9C5D8`)
  cured the wash-out. Cycles/Metal 53 s + 61 s @2400×1440, 96 spp, OIDN. Result: brushed metal with a soft bar, a
  brand-blue polished ring, grounded plinth, no band, no blow-out — SHIPPABLE as hero and poster.
- 2026-09-02 · **S7 OBJECTS 1–2 SHIPPED IN TREE.** Encoded (PIL LANCZOS 2×→1×, WebP q86): dark 13,470 + 33,974 B =
  46.3 KB, light 16,712 + 40,982 B = 56.3 KB (budget 120 each); `public/objects/` 124 KB incl. sidecars and
  `calibration.json` (Standard #2C6BFF exact, AgX #467ECF — written from the patches). `components/brand/ForgeStill.tsx`
  renders ONE `<img>` for the document's theme (class read on mount + MutationObserver; two hidden images would
  fetch both), width/height 1200×720 declared, eager for the hero. Wired: `/lcxos` hero (`Launch.tsx`, a figure under
  the positioning sentence) and the sign-in POSTER inside `ForgePlate` beneath the live Forge (which draws
  `alpha: false`, so it covers the poster completely when it runs; the poster is the pre-chunk paint and the
  no-WebGL/refusal fallback — rule 1: the fallback is the object). Ratchet `lib/__tests__/oneObject.test.ts`
  (sidecar Standard/None/sRGB + withinBudget + 1× bytes match; calibration pair; ≤ 300 KB; every object `<img>`
  declares width+height and is not animated; no `.blend` import; CI never references `scripts/blender/`). tsc
  clean; oneObject + brand + launch + selectOperator suites 36/36. NEXT: DMG plate composite BESIDE the generated
  plate (Nik's one look), print-sheet mark, then gate → capture /lcxos + /select → commit.
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
- 2026-09-02 · **S7 OBJECTS 3–4 (DMG plate beside; print mark).** (3) `scripts/blender/compose_dmg.py` pastes a
  TRANSPARENT Cycles render (`build_forge.py --shadow-catcher --fov 36`: the floor is a shadow catcher, so the
  film carries the object and its soft shadow only — the first composite, without it, was a photo RECTANGLE of
  studio ground in the band; fov 36 clears the plinth from the frame edge) at 280×168 px centred in the lower
  band of the GENERATED plate → `apps/desktop/scripts/dmg-plate.rendered.png` 1320×840, **35,570 B**, sidecar
  `wired: false`. All four `make-dmg-plate.mjs` constraints inherited (LCX White ground, mark read from the SVG,
  positions from tauri.conf.json, no wording). **NOT wired** — `tauri.conf.json:54` still points at the generated
  plate; whether a render earns replacing a flat one is Nik's one look (§4). (4) `public/objects/forge-print.webp`
  600×360 q84 **6,618 B** (sidecar purpose `print`; no @2x — paper is the budget) placed as a 9 mm mark at the
  right of `GpsPrintArtefact`'s dateline (`GpsPrint.tsx`; a DIV, since PrintStyles hides `header`), width/height
  declared, `alt=""`, PRINTS (not `br-no-print`). Ratchet `oneObject.test.ts` exempts the twin rule by the
  sidecar's own `purpose`, 6/6 green; gps suites 110/110. Objects dir now 5 webp + 4 sidecars + calibration.
