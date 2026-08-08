# P3 / P4 — adjudicated. One builds, three refuse, and the plan itself was wrong twice.

`3D_WORK_100X.md` §7: **P3** is S4 regulatory · S5 command · S6 sales · S7 governance;
**P4** is S8 marketing cube plus the motion / a11y / perf passes.

**S6 is built and shipped** (`568136a`) — the pipeline in motion, on `/deal-board`.

Of the remaining four: **S5 REFRAMES**, and S4, S7, S8 refuse. Every number below was
produced by *executing* the code, not by reading it.

---

## The plan's own text was false in two places

Worth stating first, because both would have been discovered late and expensively.

**§5 S7 says "(0070 is now applied)".** It is not. `0070_audit_seal.sql` is listed in
`PENDING_MIGRATIONS`. The seal chain does not exist in any environment, so the surface
described over it has no data at all — not thin data, none.

**§5 S4 says "OntologyExplorer already holds nodes/edges with layers and a timeline step"**
and treats that step as depth. The step filter is a cumulative subset over a **5-value
authored enum**; there is no date field on any regulatory type. And the final slice — post-
CLARITY, the entire point of the axis — **adds one node and zero edges**. Steps 3 and 4 render
identically at 74 nodes / 67 edges.

---

## S4 · REGULATORY LATTICE — REFUSE

The largest dataset any lane examined: 114 nodes, 473 edges. It still fails.

**There is no (jurisdiction, product) cell.** The `offers_product` edge type is declared in
`types/ontology.ts:83` and constructed nowhere — that string appears exactly once in the
repo, in its own declaration. The join has to be manufactured through license→requirement,
and when built: of 400 cells, 238 are non-empty and **234 of them carry the identical value
`STATE_MTL` — 98.32%**. The whole lattice holds four distinct values.

S2 was refused because a rank-1 approximation explained 95.6%. Here **a single constant
explains 98.32%.**

**And the depth axis is already a rendered column.** For all 50 states `phase` is a strict
function of `tier` — with Tiers 1 and 2 *collapsed*, so depth would lose information rather
than add it. For 41 of 114 nodes `phase` is a literal in the source: `'Phase 2'` for all six
licences, `'Phase 1'` for all 26 competitors. That is the `3 + ((i * 2) % 3)` class.

---

## S5 · COMMAND BENCH — **REFRAME**, and this one passes the test S2 failed

The measurement that matters, independently reproduced: a two-way additive model
`v = grand + partner + dimension` — literally *a bar chart of partner means beside a bar
chart of dimension means* — explains only **43.36%** of the variance about the grand mean.

**56.64% is genuine partner × dimension interaction.** S2 died because a rank-1
approximation explained 95.6% of it; this bench is the mirror image, and the residuals are
procurement facts rather than noise: DV Chain **+1.60** on Fiat Settlement Rails and **−1.51**
on Options/Derivatives Flow; Flowdesk **+1.27** on both Serves-Exchanges-as-an-LP and
Integration/White-label.

That is why the SVG surface shipped at `1905067`, and it deserved to.

**So what is actually missing is not a renderer — it is interaction, and two live numbers:**

1. **Live rank order.** The flat table reads the *frozen* seed, so its row order and its
   weighted column never move with the sliders. The live order is genuinely mobile: 359
   distinct rank orders over 20,000 samples of the weight grid, **three different partners
   can hold #1**, and the authored order survives only **5.11%** of random weightings.
2. **Live weighted score for ranks 7–9**, which appears on **no screen** once a slider moves:
   the bar list stops at six and the legend prints rank and label only.
3. **Azimuth.** One face of a 10 × 9 sheet is one face. The scrub must move the *viewpoint*,
   not the data — and must say so, because a cell that emerges as you drag was always there.

The contract's own conclusion is that this belongs **in SVG, not on the GPU**: the existing
`SurfacePlot` already renders the mesh honestly, including holes and withheld cells. The GPU
buys nothing here that 90 cells cannot already do.

**Not yet built.** It is the one genuine remaining build in P3/P4 and it is queued.

---

## S7 · GOVERNANCE SEAL CHAIN — REFUSE

`0070` is unapplied, so there is nothing to draw. Granting the migration, the geometry is
still *a line parametrised by time with one marked point on it* — the seam where sealing
began. That is one fact, and it is a caption, not a third dimension.

---

## S8 · MARKETING PERIMETER CUBE — REFUSE, on a measurement rather than on missing data

**The cube is computable and dense.** It is a pure function, so the lane built all 285 cells
(19 claims × 3 jurisdictions × 5 channels) by calling the real `checkClaimSafety`. Then:

> distinct (claim, jurisdiction, verdict) = **57 = 19 × 3, exactly**
> distinct (claim, channel, verdict) = **190 = 19 × 2 × 5, exactly**

An approximate answer would mean a corpus was sampled. **An exact identity means a structure
was measured** — and the structure is the call graph, not the text. In 1,411 lines, `channel`
reaches the rule engine through exactly one function, `resolveRecovery`, whose result is
passed as the *fourth argument to `refusal(...)`* — after the decision to refuse has already
been taken. No adversarial text can change that, because no text changes which functions
call which.

The production cube is **1 × 1 × 2**, and the 2 is a tie.

What it found instead is worth more: **nine of eighteen (category, jurisdiction) cells hold
no claim at all**, and an empty cell is not a small number — it is a guaranteed future
`CLAIM_LIBRARY_COVERAGE_NONE`. That is a flat grid on the claim-library page, and it is
queued with S5.

---

## Fixed in this pass

| what | why it mattered |
|---|---|
| **`DraftingRoom.tsx` told operators the claim-safety engine "is not mounted on any router" and "has no route caller anywhere in the API"** | Both false. The route is at `routes/marketingGates.ts:526`, mounted at `marketing.ts:885`, with a mount test. Declaring an axis UNEXAMINED when it has been examined is the inverse of this programme's failure mode, and the worse direction — a reader either redoes settled work or stops trusting the parts that are true. Only the claim-safety half was wrong; there genuinely is no `/abuse-check` route, so that half was left standing. |
| **`CHANNEL_FOR_SURFACE` was `satisfies Record<string, SafetyChannel>`** while its docblock promised it "fails to compile when a surface is added to the vocabulary" | `Record<string, …>` is satisfied by any key set. A ninth `ContentSurface` would have compiled and fallen through. A stated invariant that is not enforced is worse than an unstated one, because it stops the next reader checking. |
| **`decisiveness` computed on every forecast call, dropped at the API boundary** (`dc75ba2`) | Which deal decides whether the book clears its own median — computed from the same 10,000 paths, returned by the engine, omitted from `ForecastSummary`. Now surfaced, with both withheld-reasons kept apart and the scenario gap disclosed. |
| **A refusal drawn as a real $0 forecast band** (`edd2ffd`) | `snapshot.ts` stores a day it could not price as null-with-a-code, saying in terms that a zero "would draw a line down to it and back". `routes/kpis.ts` read it through `Number(v ?? 0)`. |

---

## Still open

- **S5's reframe** — live rank order, live weighted scores for ranks 7–9, azimuth scrub. In
  SVG. The one real remaining build.
- **S8's coverage grid** — 18 cells, flat, on the claim-library page. Empty cells carry the
  refusal code, never the digit 0.
- **`writeClaims`** (`marketing/record.ts:2497`) has zero callers repo-wide, so
  `marketing_record_claim` is read at `record.ts:2181` and written by nothing. A read with no
  producer.
- **S9** stays blocked. Its scores are still `3 + ((i * 2) % 3)`.
