# §7(b) cannot be measured on these surfaces with one operator

**Status: the trial does not run.** `task.html` disables its own start button and says why. A
deliberate run is still possible (`?acknowledge-invalid=1`); an accidental verdict is not.

This is not "the trial needs more work". It is the answer to a question, arrived at by measuring
the instrument twice and having both rounds refuted on evidence.

---

## What clause (b) asks

> An operator gets their answer at least as fast from the environment as from the flat surface
> underneath it.

Seven environments, two trials each: same data, same operator, one question per surface, timed.

## Round 1 — refuted: the surfaces printed their own answers

`INSTRUMENT_CHECK.md` has the detail. Five of seven relief frames stated the answer as text, two
verbatim — e5 printed `PEAK · 74% · $500k · 30 d` under a question asking for the peak; e7 printed
`D13-D15 NOT MEASURED`, hidden from a text search only by an en-dash/hyphen mismatch. E4 leaked its
partner trial's answer. **The owner's 25 minutes on 2026-08-18 could not have produced a valid
result**, and that was discovered after he had already spent them.

## Round 2 — refuted on four further grounds

The question set was rewritten, three environments (E2, E5, E6) were **refused rather than
reworded**, and a normalised leak check over callout groups — validated against round 1's known
failures first — graded 0 of 8 trials as leaking. An independent pass reproduced that result and
then refuted the work anyway. Every finding below was measured on the real page in Chromium.

| # | ground | measurement |
|---|---|---|
| 1 | **Partner leak on both flat-first pairs** | e4 shows the complete coupling table first, ordered 0.92 / 0.71 / 0.64 / 0.55, with trial 3's answer in the **last** row (y906) — so the timed read traverses the whole column, and trial 4 asks for that column's maximum. e7 asks two whole-column properties of the same three adjacent columns. Both run flat → relief, handing the **relief** branch the fast answer. |
| 2 | **A scroll that penalises only the flat branch** | In the trial's own 760px frame all four relief documents fit (max ink 722). Two of four flat documents do not: e4 `scrollHeight` 961 with its answer at y906; e7 1123 with its column to y1068. So 2 of 4 flat trials need an in-frame scroll and 0 of 4 relief trials do — on the exact quantity clause (b) times, introduced by the rewrite, unreported by it. |
| 3 | **E1's relief answer needs no depth judgement** | Only two panels are highlighted `#2C6BFF`, and one prints `the panel you are reading`. Rank 2 is therefore "the other blue one". The depth cue the question names is not available anyway: P4 at 7.44 m renders 183×223 px while P2 at **7.92 m** renders 185×220 px — the size cue is inverted to null, leaving only defocus (cocPx 5.5 vs 7.1). |
| 4 | **E7 asks for something its surface reports it cannot resolve** | The question wants a per-band count of days. e7's own report: `eyeRayDaysSpannedMean 5.82`, `eyeRayBandsSpannedMean 1.46` of 3 — and the frame prints exactly that: `A PIXEL INTEGRATES ~6 DAYS AND ~1.5 BANDS`. |

Two findings from round 2 were **confirmed and are worth keeping**, because both are defects
found by measurement that no reading had caught:

- `docs/3d/e1/entry.ts:825` prints `real DOM content projected onto lit GL surfaces — the panel
  you are reading` on E1's own panel. It contains no distance, ordinal, or the words
  nearest/front/focus — which is why every keyword search passed it — and it states precisely
  what round 1's E1 question asked.
- **E7's flat fallback has no channel column at all.** None of PAID_SEARCH / PAID_SOCIAL / EMAIL /
  COMMUNITY / AFFILIATE / INFLUENCER / PR_EARNED appears in its 238 visible text nodes. Round 1
  asked "which channel carries the most risk overall?" on that surface, for every operator, every
  run. It was unanswerable there, and the point was handed to the relief.

## Why there is no round 3

All seven relief frames carry a callout layer that prints their dataset in words. That is what
these surfaces *are* — E1's own caption says so: "real DOM content projected onto lit GL surfaces".
The flat branch is a complete table of the same data.

So for any within-environment pair, **whichever surface is shown first discloses the dataset the
second question is about** — and with one operator there is no second group to counterbalance
against. Round 2 demonstrated the trap precisely: flipping e4's order did not remove its leak, it
moved the beneficiary from flat to relief.

The order effect is unidentifiable by construction. Four rounds of rewording have now been tried;
each produced a different set of defects in the same class.

## What that actually tells us, which is not nothing

**On these surfaces the callouts carry the answers, not the geometry.** A question-answering race
therefore cannot show the third dimension earning its place — it measures how fast someone reads
two differently-arranged copies of the same text.

That has a product consequence, and it is the honest reading of §6's own rule:

- These are **annotated** surfaces. The relief supplies arrangement, grouping and emphasis; the
  label layer supplies the values.
- What arrangement might genuinely win is **locating** — one record among many, one gap in a
  field — not **reading** a value that is printed either way.
- Clause (b) as written times reading. It is the wrong stopwatch for what was built.

Anyone who wants to reopen this should change the task, not the wording: time *locating* across a
field large enough that the flat table cannot be scanned, with the callout layer suppressed on the
relief branch so the geometry is what is being tested. That is a different instrument and a
different piece of work, and it should not be started without deciding it is worth it.

## Three named one-line fixes in other people's files

Round 2 refused E2, E5 and E6 rather than reword them, and each refusal came with an exact fix it
was not allowed to make:

- **E5 — a caption that contradicts the render.** `docs/3d/e5/entry.ts:254` says "Holes are cells
  never measured; hatched cells are withheld", while `apps/web/src/components/geometry/SurfacePlot.tsx`
  (`Hole()`) draws never-measured with a 2-2 dash **and a cross** and withheld with a 0.8-1.2 dash
  and **no** cross — measured on the built SVG as 3 children versus 1. An operator following the
  caption answers that distinction backwards **on the flat branch only**, which lowers flat accuracy
  and pushes the verdict toward MEETS. This is a false statement in our own material regardless of
  the trial, and it is twelve words.
- **E2 — the frame states the whole dataset.** For all 7 corridor rows the relief frame prints the
  row key *and* its great-circle separation inside one callout.
- **E6 — the readable region is the labelled region.** The eight printed record callouts give
  age + verdict + action + actor; everything outside the corridor sits at fog 0.755 / 0.910 /
  0.979 / 0.992. There is no question there that is neither a text scan nor a read through 76–99%
  fog. That is what E6 is *for*, not a defect in it.

## Known stale state, left deliberately

The committed `docs/3d/e*/bundle.js` artefacts predate the `_shared/flatFallback.ts` fold fix, so on
what the trial loads today E2's and E8's flat branches still begin below the fold (first ink at 748
against 28 and 83 elsewhere). No rebuild was run. **E2 is refused and the trial does not load it, so
this is not a live defect** — and since the instrument is now gated, rebuilding the bundles would be
work in service of something nobody should run. Recorded so the next person does not read the fold
fix in the source and assume it is in the artefacts.

## Bookkeeping defect worth recording

The 534-line rewrite of `task.html` and the `_shared/flatFallback.ts` fold fix were swept into
commit `28f1d6a`, whose message describes only an API health change. Git history therefore does not
describe them. The cause was a `git add` over a working tree that concurrent agents were still
writing to. Already pushed, so not rewritten — recorded here instead.
