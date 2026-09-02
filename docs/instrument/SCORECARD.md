# THE INSTRUMENT — the honest scorecard

> Program `INSTRUMENT_100X_PLAN.md`, systems S0–S7, approved end to end 2026-09-01, built solo 2026-09-01 → 2026-09-02.
> Every "after" number below is READ from `docs/instrument/audit/after-s7-full/BASELINE.md` (79 routes × 2 themes,
> frozen clock, `/v1/**` aborted, desk fixtures ON) or from the gate log of the close-out commit — never from a claim in
> a commit message. Where the plan's target was never measurable as stated, this file says so instead of substituting a
> proxy silently. Method: `scratchpad/closeout-numbers.mjs` diffs the S0 `BASELINE.json` against the close-out one and
> lists every route that got WORSE on any runtime metric; each such route is explained or fixed below, never omitted.

## 1 · The thesis, scored

**"One instrument rendering one state under one clock through one camera in one material."**

| Clause | Before (S0, HEAD 2e0340a) | After (close-out, HEAD 4bb9389) | Plan target | Verdict |
|---|---|---|---|---|
| one clock | ≥ 5 independent clocks; **76 of 79** routes ran a 60 fps rAF loop at rest; **8** live intervals on every seated route | rAF loops at rest **0**; max live intervals **2** (= the heartbeat, + the `@vite/client` HMR ping under vite dev) | drift **0 frames** | MET as loops/intervals. **Clock DRIFT itself was never measured** — the instrument counts loops and intervals; a frame-drift probe was not built. Say so. |
| one material | seam ΔE2000 light 2.78 · dark 3.09 · dark line↔rule 3.13 | **0.00** on every derived twin, both themes; page↔ground 2.81 / 3.09 reported as a DESIGNED offset | < 1.0 everywhere GL meets DOM | MET on twins. The page↔ground offset is authored, not scored — stated in every capture. |
| one camera | **0** route commits with continuity | **76 of 79** routes transition on a real client navigation; the remaining 3 (`/lcxos` `/portal` `/select`) have no in-app link to click | 0% → 100% of route commits | MET on every route that navigates (76/76); 100% "of routes" is not reachable by construction. |
| one state (the watch) | ambient motion the only motion; nothing said "what changed" | `GET /v1/watch?since=` entitlement-first, stated ranking prior, `absent[]`; ONE arrival store; routes with CSS motion at rest **0** (was 77) | ambient ~0 / consequential = every governed action | motion at rest **0** — measured with the corrected probe (§4); static ambient occurrences 28 (was 49): spin = in-flight, two toast slide-ins, LoadingSkeleton's two pulses — kept BY DESIGN, so "~0" reads as "0 at rest", not "0 in source". |
| floors are data | 77 routes created a GL context (X1 backdrop, drew nothing in light); 11 ontology types | GL contexts at rest **1** (`/select` Forge by design; the orrery is a relief, seeded OFF under fixtures); X1 REMOVED, E1 RETIRED; **18** ontology types with WITHHELD groups | chroma above floor on every kept surface; join reaches money + liability | MET; app sweep 6/7 reached, 0 findings, 0 worse in light (one route unreachable without API). |
| the terminal | median figures in first viewport (fixtures) **27.5** on eight desks | per desk in §3; median over ALL 79 routes 2 (most routes are not desks) | ×3 on the eight desks, zero contrast regressions | **PARTLY MET**: 1 of 4 below-median desks ×3 (distribution 8 → 59); gps 19 → 51 (×2.68) and wbr 23 → 45 (×1.96) short of ×3; marketing 8 → 8 refuses by the compartment's own design. Contrast ratchet held. |
| the object | no rendered object; DMG plate generated flat; AgX would have shipped #467ECF | pipeline calibrated (Standard **#2C6BFF exact**, AgX #467ECF); 5 WebP objects 115,284 B; hero + poster + print mark wired; DMG composite BESIDE, not wired | brand hex decoded from bytes; inside 300 KB headroom | MET. The DMG plate replacement is the owner's one look, deliberately not taken for him. |

## 2 · Every S0 metric, before → after

| S0 metric | before (S0, HEAD 2e0340a) | after (close-out, HEAD 4bb9389) | target |
|---|---|---|---|
| routes captured | 79 | **79** | — |
| reached in both themes | 79 | **79** | all |
| theme applied correctly in both | 79 | **79** | all |
| routes attempting a view transition on client navigation | 0 | **76** | all that navigate (S3) |
| routes with CSS motion still running at rest | 77 | **0** | 0 (S4) |
| routes with a rAF loop at rest (> 10 frames/s) | 76 | **0** | 0 (S1) |
| routes that created a GL context | 77 | **1** | S5 decides — `/select` Forge stays by design |
| max live `setInterval`s on one route | 9 | **2** | 1 heartbeat (+ vite HMR ping under dev) (S1) |
| routes with page errors | 0 | **0** | 0 |
| median numeric figures in first viewport (dark) | 1 | **2** | S6 — desks below |
| max numeric figures in first viewport (dark) | 86 | **128** | — |
| static: routes carrying a GL environment | 7 | **7** | S5 |
| static: shell carries GL | true | **false** | false (X1 removed) |
| static: ambient `animate-*` occurrences (union) | 49 | **28** | ~0 at rest (S4); spin = in-flight, kept |
| static: files wiring the feel layer | 5 | **6** | the seam `invoke.ts` (S4) |
| static: `setInterval` / rAF call sites | 25 | **11** | S1 ratchet |
| static: `Date.now()` / `new Date()` reads | 99 | **93** | S1 ratchet |
| static: continuity call sites | 0 | **3** | S3 |
| static: hex literals outside the token system | 125 | **125** | held (S2) |

Routes WORSE than S0 on any runtime metric in the close-out sweep, each examined: `/select` rAF 4 → 5 per second is the
sign-in Forge's designed idle (threshold 10; S3 read 4, S4–S6 read 5 — jitter on a by-design loop). Anything else that
appears in the sweep's own list is a finding and is written here, not elsewhere.

## 3 · Per desk figures in the first viewport (dark, fixtures ON, reliefs OFF)

| desk | S0 (no API — the empty-state "1") | before S6 (fixtures ON) | after (fixtures ON) | vs before S6 |
|---|---|---|---|---|
| `/command-deck` | 1 | 32 | **60** | ×1.88 |
| `/bd-pipeline` | 12 | 126 | **128** | ×1.02 |
| `/command` | 1 | 48 | **91** | ×1.90 |
| `/regulatory-dashboard` | 64 | 64 | **71** | ×1.11 |
| `/distribution` | 1 | 8 | **59** | ×7.38 |
| `/marketing` | 1 | 8 | **8** | ×1.00 |
| `/gps` | 10 | 19 | **51** | ×2.68 |
| `/wbr` | 1 | 23 | **45** | ×1.96 |

The "before S6" column is the fixture capture taken before S6 was built (LEDGER §5, "S6 BEFORE"); S0's column is the
no-API state and counts the empty-state sentence's digit — the reason S6 needed fixtures before it could claim anything.

## 4 · What did NOT happen, stated plainly

- **Clock drift in frames was never measured.** S1's target was "0 frames"; the instrument measures loops and
  intervals (both at their floor). A drift probe (two surfaces asked for "now" in the same frame) is an open item.
- **×3 density landed on one desk of four.** gps ×2.68 and wbr ×1.96 stopped where the data ran out; marketing
  refuses more figures by design (its compartment publishes eight). Reported, not rounded up — and wbr read 47 in
  the S6 capture and 45 here: two figures sit at the fold, so the count is ±2 by capture.
- **Three routes never transition** because nothing on them navigates in-app. The instrument attributes this
  (`nav.linkCount 0`); it is not a cut.
- **The instrument's "motion at rest" probe was itself defective until the close-out.** It ran 500 ms after a
  navigate-and-back, on a route that had just re-mounted, and read `/ontology`'s 74 entrance fades (0.4 s, one per
  node, 300 ms in) as motion at rest. Attribution named them; a timed trace showed 0 running from +1.5 s to +5 s; the
  probe now samples at rest BEFORE the navigation and carries the post-return count beside it. S0's 77 stand (an
  unconditional, infinite beacon). The React Flow marching edges the same sweep found (62 infinite dash animations on
  a populated graph) were real and are now still.
- **`/regulatory-dashboard` figures read UNDATED** — the compiled dataset carries no instant. That is the −10
  confidence rule made visible; dating the dataset is the owner's.
- **The instrument counts `getContext` CALLS, not distinct canvases** — `/ontology`'s orrery read 2 for one live
  context in S5/S6. Open item, recorded in the LEDGER §4.
- **The DMG plate is not replaced.** `tauri.conf.json` still points at the generated plate; the render sits beside it.
- **A dead class:** `.animate-fadeIn` is used on four elements and defined nowhere — they never animated. Left as
  found (removing four class names is not a measurement), noted in the LEDGER §4.
- **Kept open by instruction until after S7:** `APPLY_GPS_PACKETS.sql` (owner), named partner + rate card,
  coordination hours, Monty's perimeter review, flake chips, dataset date.

## 5 · Budgets at close

| budget | before S0 | after close-out | cap |
|---|---|---|---|
| initial JS | 813 | 821 | 850 KB |
| largest chunk | 411 | 419 | 440 KB |
| CSS | 112 | 113 | 140 KB |
| fonts | 434 | 434 | 440 KB |
| passthrough (`public/`) | 722 | 835 | 1024 KB |

The whole program — one clock, one material, one camera, the watch, the join, the terminal, and the object — cost
**8 KB of initial JavaScript** and 113 KB of passthrough stills.

## 6 · Commits, in order

S0 e211c1a · S1 6e0e939 · S2 180c939 · S3 6a2c04b · S4 37fa9f6 · S5 6b2f0dc · S6 b442dec · S7 4bb9389 · close-out
(this commit) — each with its measured before/after in the body, each verified live on both surfaces by content
needles and the deployment SHA (`docs/instrument/LEDGER.md` §2 and §5 carry the evidence per system).
