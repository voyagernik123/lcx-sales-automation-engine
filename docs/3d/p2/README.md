# P2 · THE THREE THAT EARN IT — adjudicated, and none of them do

`3D_WORK_100X.md` §7 defines P2 as **S1 GPS cloud · S2 intel fan · S3 the ontology object**,
three parallel lanes, gated on *"each looked at; each `readsAs` survives an adversary"*.

Eight agents established what data actually exists before anything was built. Every
factual claim below is cited to `file:line`, and the load-bearing ones were re-verified by
hand afterwards.

**All three surfaces are REFUSED.** Not because 3D is wrong — P0 and P1 proved the renderer
— but because in each case the third dimension would have to carry a quantity the data does
not contain.

This repo has already written that judgement down once, on a richer dataset than any of
these, and deleted the surface:

> `apps/web/src/components/command/DeepOntologyPanel.tsx:151-175` — *"This table collapses
> NOTHING… A surface over it would show the same numbers as heights: better SHAPE
> PERCEPTION, no additional information. That is the definition of decoration, and
> decoration on a decision surface reads as authority."* Its size clause: *"a surface over
> three rows is a ribbon."*

---

## S1 · GPS RISK CLOUD — REFUSE

The plan opens with *"the 10,000-sample Monte Carlo that already runs on every quote"*
(§5:199). Three things are wrong with that sentence.

**It is 4,000, not 10,000.** `DEFAULT_SAMPLE_COUNT = 4000`
(`packages/shared/src/gps/underwrite.ts:730`), and it is the only call site
(`apps/api/src/gps/underwrite.ts:1116`). Had the lane shipped, "10,000" would have reached
production in a caption written from the plan rather than from the response.

**The samples never leave the function that makes them.** `SimOutput` is declared *without*
`export` (`underwrite.ts:749`). `marginsAsc` appears four times in the entire repo, all four
in that one file. `buildDistribution` reduces 4,000 integers to 16 scalars and the array is
garbage. The browser gets seven order statistics per quote — the existing flat band's own
comment already says so: a smooth curve *"asserts a shape for the 3,993 samples nobody
sent"* (`apps/web/src/pages/GpsUnderwriting.tsx:1028`).

**And the distribution is a triangle.** This is the decisive one. With zero recorded
outcomes `outcomeBlend` returns `weight = 0`, so the mixture branch at `underwrite.ts:806-811`
always takes the constant arm, and margin collapses to an affine, order-reversing image of a
**single** Triangular(min, mode, max) variate. The engine says so itself on the wire:
`varianceDriver` carries *"Only one input varies in this model… That is a statement about
the model's shape, not evidence that it is the real driver"* (`underwrite.ts:995-997`).

So of the four payoffs §5 promises:

| promised | reality |
|---|---|
| bimodality | **impossible** — a monotone map of a unimodal density is unimodal |
| the fat tail p90 conceals | **impossible** — triangular support is bounded, and both bounds already ship as `minMarginCents`/`maxMarginCents` |
| skew | fixed by `(mode−min)/(max−min)`, and min/mode/max **already ship** as `Underwriting.effortDays` (`underwrite.ts:1063`) |
| tight vs merely centred | already ships as `spreadCents` |

**The flat view loses a picture of a triangle whose three parameters it was already sent** —
and `effortDays` is rendered on no screen. That is a real gap, and it is a two-line fix, not
a GPU surface.

The reframe dies on the same arithmetic. Three percentile sheets over price × overrun are
*rigidly parallel*: with price fixed, margin is strictly decreasing in cost, so
`spread(P,u) = cost_p90(u) − cost_p10(u)` — **price-invariant**. Rotating the sheets yields
four numbers, which `SensitivityTable` already prints.

**And on production the surface cannot draw at all.** `RATE_CARDS_ARE_PLACEHOLDERS = true`
(`apps/api/src/gps/underwrite.ts:310`), no `gps_rate_card` row exists, and
`placeholderRateCard` is built with `amountCents: -1` and `validUntil: null` so it refuses
before arithmetic. Every environment returns `refused_rate_card_no_validity_stated` and
`distribution: null`.

> The sharpest form of the objection, and it is not the arithmetic: **S1 would be built,
> demoed, reviewed and merged without anyone ever seeing the state it ships in.** A
> developer necessarily works against a fixture with a valid rate card, and in that fixture
> the cloud looks superb. Everything the reviewer sees is real. Nothing the operator sees
> is.

---

## S2 · INTEL FORECAST FAN — REFUSE

The plan asks for *"time × value × path-density"* (§5:209). **There is no time axis, and it
is absent by construction rather than thin.**

`monteCarloForecast` writes exactly one number per simulated path — `totals[i] = total`
(`packages/shared/src/forecast/index.ts:239`) — and then `totals.sort()` destroys run
identity outright. `ForecastDealInput` (`index.ts:29-35`) has no date field; its only
time-shaped input is `daysSinceUpdate`, consumed as a *backward*-looking staleness decay.
`computeForecast`'s SQL has no date predicate. Nothing anywhere records when a deal closes.

The lane then did the thing that makes this verdict worth trusting: **it changed the axis to
the best available candidate, built it, and measured it into the ground.**

Deal × commitment-threshold × percentage-point lift in `P(book ≥ t | deal lands)` — a real
two-dimensional field, buildable from one cheap engine change and no new data. Run over the
repo's own proxy book, 10,000 runs, seed 42, 26 deals × 11 thresholds:

- **a best rank-1 approximation explains 95.60% of the sheet's energy** — i.e. it is, to that
  accuracy, a per-deal scalar times a per-threshold scalar: a bar chart beside a line chart,
  drawn as a terrain
- peak threshold is a near-pure function of package value, which is **already a printed
  column**
- the entire novel content is one reversal among seven whales — one sentence and two rows

Four other candidate axes were evaluated and rejected on evidence, including the one most
likely to be fabricated by accident: `timelineShiftDays` is a live −30…+30 day slider
(`ScenarioControls.tsx:203-211`) that **currently drives nothing**.

**What flat genuinely loses here is real, and both fixes are 2-D.** `BINS = 28`
(`ForecastDistribution.tsx:12`) is a fixed editorial choice the engine explicitly refuses to
make for callers, over a portfolio total that is atomic. And **per-deal decisiveness is
computed on every single forecast call and thrown away at the API boundary**: `p50SwingPct`
with Agresti–Coull standard errors and its own refusal codes is returned by the engine
(`index.ts:393`) and omitted from `ForecastSummary` (`apps/api/src/kpi/forecast.ts:34-59`).
Which deal actually decides whether the book clears its own median is computed, and invisible.

---

## S3 · THE PLATFORM ONTOLOGY OBJECT — REFUSE

The plan calls this *"the Palantir move"*. The dataset is: **8 compartment records**
(`packages/shared/src/workspaces.ts:88-252`, pinned at 8 by its own test), **24 grant cells**
(3 roster members × 8 compartments), and **exactly one declared cross-compartment edge,
which no route can reach** (`apps/api/src/gps/conflict.ts:1801` has zero route callers).

An 8-node graph with 1 edge is not a structure that "is genuinely in more than two
dimensions". It is two nodes and a line.

**There is no third axis available, and that is the finding rather than a gap.** No route
anywhere reports rows-held, reads, or traffic per compartment. The only per-compartment
integers that exist count records *withheld from the reader*, and `verdictBroker.ts:232-243`
states in terms that this "is a number of RECORDS WITHHELD, not a metric, not a rate, and it
has no denominator to make one from."

The two quantities a builder would actually reach for are anti-correlated with reality:
`regulatory` declares 14 webPaths and `apiPrefixes: []`, while `gps` declares one webPath and
owns nine routes. **Sizing volumes off either would make the compartment holding third-party
confidential terms the smallest object on the figure.** That is a number derived from an
incidental property of a registry row — the same defect class as `3 + ((i * 2) % 3)`.

Nothing is collapsed today: `AccessControl.tsx:243-283` already renders every one of the 24
cells with its own capability, `granted_by` and justification. There is no hidden quantity
for a third dimension to reveal.

It is also the most expensive lane: the plan's geometry ("volumes… surfaces you can see
through but not past") needs a translucent mesh primitive and a transparency-ordering
policy. `@lcx/gl` exports `createPointCloud` and `createLineBatch` only — `instancedQuads` is
named in the barrel's docblock but is not implemented. **Two spine requests, the largest
renderer expansion of any of the nine lanes, spent on eight rows.**

---

## What the sweep found on the way, which was worth more than the surfaces

**A live defect, now fixed** (`edd2ffd`). `kpi/snapshot.ts:88-97` deliberately persists a day
the simulation could not price as null percentiles beside a refusal code — its comment says
*"a zero is a data point and would draw a line down to it and back"*. `routes/kpis.ts` then
read it through `Number(v ?? 0)`, dropped `distributionRefusal` from the response, and
`CalledVsLanded` **plotted the refusal as a real $0 control band.** The refusal was preserved
in the database and destroyed on the way out.

Still open, all of them flat:

| # | what | where |
|---|---|---|
| 1 | `decisiveness` computed every forecast call, dropped at the API boundary | `apps/api/src/kpi/forecast.ts:34-59` omits it; engine returns it at `forecast/index.ts:393` |
| 2 | `effortDays` (min/mode/max) — the triple that fully determines the margin distribution — is on the wire and rendered on no screen | `underwrite.ts:1063` |
| 3 | `BINS = 28` is an editorial choice the engine refuses to make, applied silently to atomic data | `ForecastDistribution.tsx:12` |
| 4 | `timelineShiftDays` is a live −30…+30 slider that drives nothing | `ScenarioControls.tsx:203-211` |

---

## The decision this leaves

Three routes forward, and the ranking is §9.3's — yours, not mine:

1. **Unblock S1 properly.** Author real rate cards and effort triples, then thread
   `marginsAsc` onto the response. The pipe is a day's work; the data is the blocker, and
   it is the same blocker as GPS price bands. *S1 becomes the strongest surface in the
   programme the moment recorded outcomes exist* — `outcomeBlend` turns on and the
   distribution becomes genuinely bimodal, which is exactly what the plan promised.
2. **Re-rank and build from the P3 set** — S5 command terrain, S6 sales-in-motion, S7 seal
   chain.
3. **Take the four flat fixes above** and stop the 3D programme at P1 with the spine banked.

My recommendation is **2, scoped to S6 first**, with 1 queued behind whoever authors the GPS
inputs.

### Why S6, checked rather than assumed

Recommending a surface on the strength of a plan sentence is the exact error that produced
three refusals above, so S6's time axis was verified before it was recommended.

`deal_events` (`apps/api/src/db/schema.ts:376-390`) carries `dealId`, `oldStage`, `newStage`,
`actor` and `createdAt`. Every stage transition writes one, **inside the same transaction as
the deal update itself** (`apps/api/src/routes/deals.ts:510-521`), alongside its audit row.
That is a genuine per-transition history: the third axis is a timestamp the database
records, not an ordering inferred from a list.

Note that `listing_labels.stage_trail` is **not** the same thing and would not do — it is a
comma-separated sequence of stage names beside a *single* `stage_changed_at`, which gives
order but not time. Building on it would repeat S2's mistake exactly.

`deals` supplies the other two axes directly: `stage` and `packageValue`. Velocity is the
interval between consecutive events; **stalling is a long gap, which is visible as flatness
and is invisible on a Kanban board** — the original recorded seed of this whole track,
*"TIME is the missing axis nearly everywhere"*.

**The one thing I could not check is row count on production.** "The table exists and is
written correctly" is not "the table has enough transitions to show motion" — that is the
question that killed S2's vintages, and it must be answered against the live database before
the lane starts, not after.
