# Eight scheduled jobs are defined. None has ever run.

Found while reviewing the 07:00 readout, which asserted on screen that "the jobs CLI that already
runs the daily alert sweep" exists. It does not. Chasing that one false sentence turned up the
cause, and the cause is bigger than the sentence.

## THE FACT

`ops/github-workflows/jobs.yml` is a **complete, valid GitHub Actions workflow**. It declares
`name: scheduled-jobs`, an `on: schedule:` block with eight crons, and a dispatcher that maps each
cron to a job CLI. Its own header lists the repo secrets it needs.

**It is not under `.github/workflows/`, so GitHub has never read it.**

Verified:

```
.github/workflows/          →  ci.yml, and nothing else
grep -rn "schedule:|cron:" .github/   →  no matches
render.yaml                 →  one service, type: web. No cron.
```

So there is no scheduler anywhere. The eight jobs:

| cron (UTC) | job | what has therefore never happened |
|---|---|---|
| 05:00 daily | `market_refresh` | market data is only ever as fresh as the last manual run |
| 05:30 daily | `exchange_sync` | per-venue volume (witness B of TWO WITNESSES) is not being collected |
| 06:00 daily | `discover_new_tokens` | no new project has been discovered automatically |
| 07:00 daily | `score_refresh` | **no score vintages accumulate** |
| 07:30 daily | `daily_rules` | **no alert rule has ever been evaluated** |
| 23:50 daily | `kpi_snapshot` | **no KPI trend history accumulates** |
| Mon 03:00 | `universe_sync` | the tracked universe is static |
| Sun 04:00 | `signals_prune` | nothing is pruned |

## WHY THIS MATTERS MORE THAN A MISSING CRON

**It changes the meaning of refusals this platform is currently emitting.** Several honest-looking
"not enough history" statements are not statements about a young platform — they are statements
about a collection job that was never installed:

- **P4's calibration refusal.** `docs/phases/P4_EVIDENCE.md` said "far too little resolved history
  to claim calibration". True, but the reason is `score_refresh` has never run, so score vintages
  never accumulated. "We have not measured long enough" and "we never started measuring" are
  different facts and only one of them is fixed by waiting.
- **`wbr_reports` has ONE row**, which this programme cited repeatedly as the reason RECESSION RATE
  was dropped as unmeasurable — describing its schedule as "a comment". The schedule is not a
  comment; it is a file in the wrong directory.
- **`monitor_fires` and monitor `last_run_at`.** The A2 attack pass found that a monitor with a
  prototype-chain metric key would never fire and read as live. It is now correct — and *no monitor
  fires anyway*, because `daily_rules` never runs.
- **TWO WITNESSES' witness B** is `SUM(exchange_listings.volume_24h_usd)`, filled by
  `exchange_sync`. A cross-examination whose second witness is structurally absent will refuse
  correctly and refuse *always*.
- **F2 `platform_forecast`** will hold nothing until something records a prediction on a schedule.

None of that is a code defect. Every one of those refusals is behaving correctly. The problem is
that the platform is refusing because it has no inputs, and the reason it has no inputs is one
`git mv` and two secrets.

## WHY I DID NOT JUST INSTALL IT

Moving the file is one command. Doing it unilaterally would be wrong for three reasons:

1. **It needs secrets only you can add.** The header names `DATABASE_URL` (the Supabase **session
   pooler** string — GitHub runners need IPv4) and `COINGECKO_API_KEY`, as **repo** secrets under
   Settings → Secrets and variables → Actions. Installed without them, all eight jobs fail on their
   first run and keep failing daily.
2. **Actions minutes are exhausted.** No CI run has been created since `e009970` — two pushes after
   it produced no run at all, on a private repo where minutes are metered. Installing eight daily
   crons into an account with no remaining minutes adds nothing but noise.
3. **These jobs write to production.** `market_refresh`, `score_refresh` and `kpi_snapshot` mutate
   real tables on Supabase. Switching on eight writers at once, unattended, on a schedule, is not
   something to do on someone's behalf without them knowing the hour it starts.

## TO INSTALL IT

```bash
git mv ops/github-workflows/jobs.yml .github/workflows/jobs.yml
```

Then, before pushing:

1. Add the two repo secrets (`DATABASE_URL` session-pooler, `COINGECKO_API_KEY`).
2. Confirm Actions minutes are available.
3. Consider enabling **one** cron first — `kpi_snapshot` at 23:50 is the safest: it writes one row
   per day to `kpi_daily_snapshots` and nothing reads it destructively — watch a run, then enable
   the rest.

`workflow_dispatch` is worth adding at the same time, to both this file and `ci.yml`: neither can be
triggered manually today, which is why a dropped push event left CI unable to run at all.

## THE READOUT'S OWN CLAIM, CORRECTED

The sentence that started this is fixed. `frame.scheduleStatement` now names the uninstalled
template, says nothing runs it on a cadence, and states the consequence — with no sweep running, an
unevaluated alert rule and a genuinely quiet platform produce the **same** observation, so
`READOUT_WINDOW_GENUINELY_EMPTY` is a claim about the LEDGER and not about the platform. The page
carries that caveat where a human reads it.
