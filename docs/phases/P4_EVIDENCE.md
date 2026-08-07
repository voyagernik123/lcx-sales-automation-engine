# P4 — THE MARKS — EVIDENCE

CLAIM: `LCX_OS_100X_PLAN.md` §8 — *"F2, TWO WITNESSES, the contamination fix, RECESSION RATE. **Its
honest headline is likely a refusal** — too little history to claim calibration — and that is
stated up front rather than discovered later."*

**The plan predicted its own headline would be a refusal. It was right, and the code says so.**

## WHAT SHIPPED

| capability | where | state |
|---|---|---|
| **F2 — `platform_forecast`** | `kpi/platformForecast.ts` + `0074` (2 tables, append-only by trigger) | built, tested |
| **TWO WITNESSES** | `packages/shared/src/intel/witnesses.ts`, `api/src/intel/crossExamine.ts` | built, tested |
| **the contamination fix** | `intel/calibration.ts` | built, tested |
| **RECESSION RATE** | — | **DROPPED, deliberately** |

## THE HEADLINE IS A REFUSAL, AND THAT IS THE DELIVERABLE

There is far too little resolved history to claim calibration.

**AND I NOW KNOW WHY, WHICH CHANGES WHAT THE REFUSAL MEANS.** When this file was first written it
said only "too little history", implying a young platform that needs to wait. The real cause is
that **`score_refresh` has never run** — the eight scheduled jobs are defined in
`ops/github-workflows/jobs.yml`, which is not under `.github/workflows/`, so GitHub has never read
it. Score vintages never accumulated because nothing was collecting them. "We have not measured
long enough" and "we never started measuring" are different facts, and only one of them is fixed by
waiting. See `docs/SCHEDULED_JOBS.md`; the same cause explains `wbr_reports` having
one row, which this programme repeatedly cited as the reason RECESSION RATE was unmeasurable.

The code returns **the refusal and the real N**, never a percentage, below a named floor justified
in a comment rather than a magic number. A calibration figure computed from a handful of resolved forecasts is the single most
dangerous number this platform could print, because it is precisely the number a human would act
on. Three states are distinct: *we hold none* / *we hold some and can read none as of the anchor* /
*too few* — three codes, not one empty result.

## THE CONTAMINATION FIX DID NOT HOLD THE FIRST TIME

This is the most important thing in the phase. The whole point of the lane was that the calibration
loop **measures its own penalty** — it read the latest observation per subject while `alpha.ts`
deliberately applies −40 and −50 once `listed_on_lcx` is true.

The first fix anchored the as-of read on `max(f.predicted_at)` over resolved forecasts. `0074`'s
trigger only relates a forecast to **its own** outcome, so a pass that records a forecast for an
already-won project and resolves it against the win it can read today is perfectly legal — and
`max()` deliberately picks that one. A probe returned the post-outcome value **1,000** where the
truth was **5,000,000**, while `frame.observed` still declared
`observation_value_as_of_prediction_instant` and carried **zero refusals**.

Now `min(predicted_at)` — the earliest defensible call, which a later after-the-fact pass cannot
drag forward — and because the ledger cannot see `deals`, calibration bounds the read by
`deals.won_at` and **excludes** any won subject whose earliest call does not precede its win, naming
the count under `CALIBRATION_ANCHOR_POSTDATES_OUTCOME`.

## TWO MORE THAT WOULD HAVE PRINTED A CONFIDENT WRONG NUMBER

**Two of the four "signal" metrics have their history deleted, and the file asserted the opposite as
fact.** `calibration.ts` said of `SIGNAL_METRICS`: *"Signals from outside the platform. Nothing
deletes these, so their history is real and an as-of read means something."* `intel/backfill.ts:34`
runs `DELETE FROM observations WHERE source IN ('coingecko','internal') …` and the predicate list
contains `market_cap_usd` and `priority_score`. Exactly one row per subject survives and it is
always the newest — the identical mechanism the file diagnoses for the alpha scores, routed into the
branch that computes a lift and a verdict instead of refusing. And `priority_score` is not "from
outside the platform" at all: it is the internal model's own output. The refusal branch is now
selected by a `MetricSpec.historyDestroyedBy`, not by `kind`, because routing on kind is exactly how
those two reached the lift branch.

**A GPS group that could only ever score 0% agreement.** `engagement_won` predicted the label
`'quoted'` and resolved against a disposition (`won`/`lost`). `'quoted'` can never equal a
disposition, so agreement was 0 for every row forever — and above the floor of 8 the platform would
have expressed a real-looking accuracy figure asserting the underwriting engine was wrong 100% of
the time. Nothing in GPS produces a win probability, so the win side is now **omitted and reported
as omitted** rather than invented.

## RECESSION RATE IS DROPPED, NOT FORGOTTEN

`wbr_reports` has ONE row, so a rate computed over it would be fiction. It is recorded here as a
deliberate absence so nobody rebuilds it from the same basis.

**The reason it has one row is now known, and it is not that the schedule is "a comment"** — which
is how this programme described it more than once, including earlier in this file. `kpi_snapshot` is
a real cron, and as of 2026-08-07 it is installed under `.github/workflows/` — but ARMED BY A SECRET
the owner must add, so it has still never run. So RECESSION RATE is
not permanently unmeasurable: it is unmeasurable until that file is installed, and then it needs
weeks of accumulated rows. Reinstating it before those rows exist would rebuild the same fiction.

## OUTSTANDING

- **`0074` is not applied to production**, so `platform_forecast` does not exist there and nothing
  is recording predictions yet. Until it is, F2's capability is real and inert.
- After it is applied, `intel/alpha.ts` should record each scheduled pass as a forecast — and note
  the trap the fix above closed: recording each pass at the pass instant is what produced the
  post-outcome anchor in the first place.
- The append-only triggers on `platform_forecast` mean a correction is an APPEND. Nothing may
  update a prediction.
