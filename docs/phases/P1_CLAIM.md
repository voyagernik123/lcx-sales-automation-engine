# P1 — CLAIM

**Status:** GATED — all five acceptance criteria in §5 are met, each verified against source AND
test rather than against a lane's report, and `P1_EVIDENCE.md` records the gate output, the four
defects in my own work, and what is still outstanding. Shipped at `e009970` with both CI jobs
green and `ci-mirror` green against a database built from all 75 migrations.

**What "GATED" does NOT mean.** It does not mean the surfaces P1 touched are now beyond doubt.
L16's readout has had no adversary pass, three attack angles are unrun, and migrations 0068–0074
are not applied to production — so nothing that depends on those tables is doing anything yet.
Those are named in the EVIDENCE file rather than left for someone to discover.

Per `LCX_OS_100X_PLAN.md` §7.1. **This CLAIM re-scopes P1**, because a verification pass over the
~30 claims P1 rested on overturned enough of them that building the plan as written would have
produced a phase that fails on its own headline.

Method: 5 lanes verified every claim against the code, executing the shipped functions and querying
the database rather than reading; 1 adversarial pass tried to break their findings. Migration number
leased: **0068**.

---

## 1. THE FINDING THAT RE-SCOPES THE PHASE

`LCX_OS_100X_PLAN.md:617-618` promises P1 ships *"real prices, a floor, and two lists ranked by days
rather than frequency."* Measured, four of five workstreams ship **a refusal**, and P1's success
criteria cannot tell a correct refusal from a failure:

| workstream | what it actually ships on day one | evidence |
|---|---|---|
| THE FLOOR | **a refusal** — no rate card on any observable environment | `gps_rate_card` absent; `underwrite.ts:419,436` substitute `placeholderRateCard`; refuses at `underwrite.ts:393-398` |
| MARK TO CONTRACT | **a refusal** on every stratified read | mid band n=1, large band 0 fee-bearing; `category` present on **1 of 36**, `market_cap_usd` NULL on **14 of 36** |
| BINDING — recession rate | **nothing.** `SELECT count(*) FROM wbr_reports` → **0** | a slope needs k≥4; the "Monday 06:00" schedule is a *comment* (`kpi/wbr.ts:5-6`), `.github/workflows` holds only `ci.yml`, and the sole trigger is a manual operator POST |
| F1 | the scope it already has | 1 caller, per `doctrine-lint` |
| **the money parser** | **a real, large, visible fix** — ×217,618 on a surety-bond total, reproduced | `formatting.ts:3-16` |

**The one workstream that delivers visible truth today is the one the plan treats as a footnote.**
So P1 is re-ordered to lead with it, and every refusing workstream gets an acceptance criterion
that names the refusal as the expected result. Without that, P1's own report becomes the fifth
thing in this repo that renders an absence as a result.

## 2. WHAT WAS OVERTURNED

**F1 cannot "move into API middleware unchanged" — FALSE, verified by execution.** Two live
non-marketing routes refuse on their first request the day it becomes `app.use('*')`:
`POST /v1/distribution/engines/channel-mix` → `METRIC_NOT_OBSERVABLE @ data.rows[0].scores.reach`
(an ordinal 1–5 scoring dimension), and `GET /v1/intel/conversation` → refusal @
`data.sentimentScore`. Both have live web callers (`GrowthEngines.tsx:28`,
`ConversationPanel.tsx:66`).

This is **the same false-positive class `scripts/doctrine-lint.mjs:100-107` already records** — the
rule I wrote wrong in P0 and deliberately did not satisfy by editing correct code. F1 as planned
would do at runtime, on live traffic, the thing already established as wrong at build time. It is
not a move; it is a new per-compartment blocklist plus a parameterised rule citation, because the
refusal currently cites `INSTRUMENTS.desk_policy` — *"LCX marketing desk policy — this
compartment's own rules, not law"* — which is a mis-citation on a GPS or distribution payload.

**`assertHonestPayload` must be fixed before it is promoted.** Three defects, all executed:
- **Depth truncation returns `null` silently** (`observation.ts:549,573`). `MAX_PAYLOAD_DEPTH = 8`;
  caught at nesting ≤9, **missed from 10**; arrays consume a level, so an alternating array/object
  payload misses from 4 alternations. **"Clean" and "not checked" are the same return value** — an
  inference laundered into a certainty, which is precisely the error class F1 is cited to prevent.
- **The WeakSet is a permanent first-visit-wins dedupe, not a cycle guard** (`:570,574-575`, never
  removed). Reproduced: the same object in the same payload yields opposite verdicts depending on
  `Object.keys` order.
- **It returns the FIRST violation and stops** (`:601`), contradicting the house pattern two files
  over — *"EVERY refusal, then one 422 — never the first one found"* (`marketingDesk.ts:1207-1214`).

**A second production client bypasses the ceiling entirely.** `marketing.ts:118` asserts *"This is
the one place every marketing read passes through"* and that is **false**:
`apps/web/src/components/marketing/deskApi.ts` imports `unwrapWithMeta` directly (`:2`) and calls it
at `:186-231` without the ceiling — including `recordTriage`, whose body carries `reach` (`:215`).

**"No migration" is false three times.** `:112` and `:154` both claim it. MARK needs **0068**:
`idx_labels_source_record` is a unique index on `(source, record_name)` that **silently destroys a
contract** — "Vulcan Forged" appears twice in the closed book and one row is collapsed. THE FLOOR
needs **0052 and 0066 applied**, neither of which exists on any observable environment.

**Two claimed refusal codes are invented.** `refused_no_rate_card` does not exist and *cannot* —
a missing card is not a verdict in that engine; `underwrite.ts:434-446` substitutes
`placeholderRateCard` and refuses with `refused_rate_card_no_validity_stated`, **a code that names
the wrong defect**. `refused_card_expired` is really `refused_rate_card_expired`.

**BINDING: P(zero slack) is not new information.** It is numerically identical to the `criticality`
already returned (`launchSim.ts:221`) — 20,000 of 20,000 runs. The adversarial pass declines to
accept the proof (the back-walk enumerates one chain from one of **7 measured sink nodes**), and I
accept that objection: **the slack-magnitude half is what gets built; the P(zero slack) half is
dropped until re-derived.**

**`forecast/index.ts:78` does NOT name and exclude unpriced deals — FALSE.** They are silently
valued at **zero cents** and left in the simulation, depressing p10/p50/p90 and `expectedCents` as
if a real $0 deal. That is a live doctrine violation the claim credited as compliance, and
`forecast.test.ts` does not cover it.

## 3. WHAT ONLY YOU CAN SETTLE — one new item, and it blocks scoping

**Do `gps_rate_card` and `gps_effort_triple` exist on production?** This cannot be answered from
inside the repository and the two sources disagree: `gpsInputs.test.ts:52-56` asserts in prose that
they do; `migrationLedger.ts:173` says 0052 is pending. Locally none of the three exist. THE FLOOR's
day-one behaviour depends entirely on the answer.

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('gps_rate_card','gps_effort_triple','gps_price_band');
```

Zero rows means THE FLOOR ships as a refusal and 0052 + 0066 must be applied first.

Also still open and unchanged: **decision #1** (may a named human assert a partner name and rate
card). `LCX_OS_100X_PLAN.md:714` already marks it as gating THE FLOOR, and the verification confirms
there is no code-only path around it — the only `INSERT INTO gps_rate_card` sits behind the 409.

## 4. THE RE-SCOPED P1

**P1a — THE PARSER (leads, because it is the only visible truth today).** One shared parser, tests
first, five call-site conversions, both dead `computeBriefDigest` copies deleted. Every monetary
string must round-trip or the surface prints the source string and refuses to sum it. Open-ended
values (`'$300K+'`, 14 of 50 `estCost`, 1 bond) have **no numeric value by construction**, so a
cohort aggregate containing one is a refusal, not a number.

**P1b — FIX THE CEILING ITSELF.** Depth truncation refuses instead of returning null; the WeakSet
becomes a per-path cycle guard; all violations returned, not the first. Then wire `deskApi.ts`.
This is a prerequisite for F1, not part of it.

**P1c — F1 AS PER-COMPARTMENT SCOPING.** A blocklist and a rule citation per compartment, gated on
`content-type: application/json`, explicitly excluding SSE (`/v1/notifications/stream` — buffering
it kills the bell) and the three non-JSON bodies. Cost is not the obstacle: p95 **0.68ms** on a
realistic 200-row payload.

**P1d — MARK TO CONTRACT, with an environment label on every figure.** Migration 0068 first. Every
"N of 36" carries the environment it was measured on — the verified numbers came from a **local
laptop database**, not LCX's book, and reporting them as statements about the business is the error
class this whole phase exists to remove.

**P1e — THE BINDING ITEM, slack-magnitude only.** Plus two one-line correctness fixes that must
precede any slope: `ORDER BY id` on the task read (heap order changes on UPDATE — measured p50
spread of 1–2 days across 12 permutations of identical data at the same seed), and unpriced deals
named and excluded rather than valued at zero.

**Dropped from P1:** RECESSION RATE. `wbr_reports` has zero rows, nothing in the repository creates
one, and the stored series would not be comparable to the surfaced one anyway (500 runs stored vs
2000 surfaced — measured SE 1.5d vs 0.9d on a value rounded to whole days). It returns when a
schedule exists.

## 5. ACCEPTANCE CRITERIA — written before the build, because four lanes refuse

A refusal is a pass **only if** it names the missing input, cites its rule, and is registered in
`docs/phases/ABSENCES.md` with a test proving it. A refusal that renders as `0`, as an empty list,
or as a silent omission is a **failure** regardless of how correct the reasoning behind it was.

| claim | pass | fail |
|---|---|---|
| the parser | every monetary string round-trips or the source string is printed and refused | any figure changes silently |
| the ceiling | depth-exceeded and cycle-detected both **refuse**; all violations returned | any path returns `null` for "not checked" |
| F1 | the two live routes still answer; a marketing payload with `reach` still refuses | either route breaks, or the citation names the wrong instrument |
| MARK | every figure carries its environment and its stratum n; thin strata refuse | any mark emitted from n<K, or any figure without an environment |
| BINDING | slack in days per task, with an SE; unpriced deals named | any slope whose SE exceeds its magnitude presented as a number |
