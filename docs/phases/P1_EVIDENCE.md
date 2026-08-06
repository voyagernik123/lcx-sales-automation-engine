# P1 — EVIDENCE

Written after the fact, from commands I ran myself. Agent-reported numbers do not appear here
unless I re-ran them; where a lane's claim is the only source for something, it says so.

## GATE — `npm run ci-check`, exit 0, at `e009970`

```
✓ doctrine-lint: clean
  ✓ absences: 8 registered refusals, each present in source and test
  ✓ notif-scope: 10 INSERTs all carry a compartment; read path filtered
  ✓ honesty-ceiling: assertHonestPayload has 1 caller(s) — F1/P1 moves this to middleware
  ✓ test-barrier: 203 async React test block(s) checked
  ✓ phase-evidence: 2 phase(s) checked
  packages/shared   1,733 passed (46 files)
  apps/api          2,880 passed | 9 skipped (134 files)
  apps/web          2,006 passed (134 files)
✓ built in 4.54s
perf budget · REAL initial 1380KB (JS 835/850 · CSS 111/140 · fonts 434/440)
            · largest chunk 433/440 · passthrough 720/1024 · 168 lazy page chunks
✓ perf budget OK
```

`npm run ci-mirror`, exit 0 — the api suite against a database built from **all 75 migrations in
order from zero**, which is what CI does and what the local gate could not previously see.
`verify-ci --wait`: **both jobs green on `e009970f`**, including the playwright job, which is
`needs: gate` and therefore proves nothing when it is skipped.

## ACCEPTANCE CRITERIA — the table from `P1_CLAIM.md` §5, row by row

| claim | verdict | what proves it |
|---|---|---|
| the parser | **MET** | `packages/shared/src/money.ts` + tests. A null price no longer divides to 0 — the defect was that `null / 100` is `0` in JavaScript, so every refused price became a $0 deal. Nulls pass through the forecast, and `kpi/snapshot.ts` persists the refusal counts, because a 0 in trend history is a point a chart draws a line through. |
| the ceiling | **MET** | Depth-exceeded refuses: `PAYLOAD_TOO_DEEP_TO_VERIFY` replaces the whole unread sub-tree at the descent site. Cycle-detected refuses via the `cleared` memo (the per-path guard it replaced was O(paths), 1,840ms at L=22 — a DoS). `assertHonestPayloadAll` returns EVERY violation, not the first. |
| F1 | **MET** | Mounted at `app.ts`, ahead of the compartment gates. Both live marketing routes still answer (2,880 api tests pass with it mounted) and a payload naming a forbidden metric still refuses. The legitimate ordinal `reach` (`routes/distribution.ts:119`) and `ReachAssessment` (`routes/marketingDesk.ts:972`) are explicit must-pass tests — that distinction previously caused nine false positives. |
| MARK | **MET** | `packages/shared/src/marks/mark.ts` + tests. `MARK_ENVIRONMENT_NOT_STATED` is registered in `ABSENCES.md` and proven. |
| BINDING | **MET** | `SE_EXCEEDS_MAGNITUDE` in `packages/shared/src/launchSim.ts`, proven in `forecast.test.ts`; unpriced deals are named on the surface, not silently dropped. |

All five refusal codes were verified present in **both** source and test before being registered,
and `doctrine-lint` rule 1 now enforces that for all eight.

## WHAT THE PHASE ACTUALLY SHIPPED

Eight build lanes, each BUILD → ADVERSARY → FIX. The adversary passes were not a formality: they
returned DEFECTIVE on five of eight lanes and produced roughly sixty defects, several of which
would have shipped a false number to a human.

**The single most important thing in this phase is that a fix can introduce a new lie.** Four did:

- **The Postgres escape.** 0072's trim predicate was written `E' \t\n\r\f\v'`. Postgres defines
  `\b \f \n \r \t` and the numeric forms and takes any other escaped character LITERALLY, so `\v`
  is the letter v. Verified against a live server:
  `ascii(right(E' \t\n\r\f\v',1))` → **118**. The set trimmed a letter and never contained
  U+000B, so a stored `'SOL'||chr(11)` was refused by the code and invisible to the index whose
  only job is to find the rows the code refuses. Now `\x0B` (ascii 11), checked over eleven
  fixtures.
- **A code emitted by nothing.** `EMISSION_CAP_DECLARATION_INVALID` was in the refusal union and
  in the rules map and was emitted nowhere, so a cap declared as `NaN` was correctly rejected and
  then reported as `EMISSION_CAP_NOT_DECLARED` — "No owner has declared a cap" — which is false
  and sends the owner to do the thing he had just done.
- **A crash laundered into a compliance fact.** `gateFailure` stamps `ASSET_STATE_UNKNOWN`, which
  is itself a perimeter code, so fifty connection resets made the report assert *as fact* that the
  embargo and holdings registers were the cause.
- **A perimeter inferred from one row.** `explainSignalCollision` said "the perimeter is OPEN"
  about an ASSET from a single lifted row, though 0060 requires a new event per state change — so
  "marketing lifted this deal's entry and entered its own" leaves a different live entry holding
  the asset.

And **the contamination fix, the whole point of the F2 lane, did not hold**: `asOfAnchors`
anchored on `max(predicted_at)`, and 0074's trigger only relates a forecast to its own outcome, so
a pass recording a forecast for an already-won project becomes the anchor. A probe returned the
post-outcome value 1,000 where the truth was 5,000,000, with `frame.observed` still claiming
`observation_value_as_of_prediction_instant` and zero refusals. Now `min()`, bounded by
`deals.won_at`, excluding post-outcome-anchored subjects under a named code.

## FOUR DEFECTS IN MY OWN WORK, FOUND WHILE DOING THIS

1. **The local gate could not see what a migration does.** CI builds an empty Postgres and
   migrates it; a laptop tests a long-lived database. 0070's append-only trigger correctly refused
   a test's `DELETE FROM audit_log`, and a suite testing the ledger-ABSENT branch resolved
   `entitlement_events` through its `search_path`'s public fallback — so it was **writing test
   revocation events into the real append-only ledger**. Closed permanently by `npm run
   ci-mirror`. `perf-budget` was also a separate CI step the local gate never ran; it is in
   `ci-check` now.
2. **I measured bytes with `du`.** It rounds to 4KB blocks. Every figure in the first draft of
   `check-bundle.mjs` was inflated by it, which set the preloaded-font budget to 528KB — and a
   third preloaded font measures **527KB**, one kilobyte under, so the budget would have passed
   the exact regression it was written to stop. Mutation-testing found it; it is 440 now.
3. **I put the auth fix in the wrong place.** Routing `deskPasscode` through `required()` throws
   at boot, so a deploy without the variable would not start — trading a quiet hole for an outage
   of eight compartments, including every request that authenticates perfectly well by JWT or
   `OPERATOR_API_KEY`. It fails closed at the DOOR now. And my first version of that guard
   `return`ed instead of falling through, which would have refused a colleague signing in with
   `SECONDARY_PASSCODE` — a credential the guard has nothing to do with.
4. **A backtick inside a template literal, five times.** It broke two workflow scripts,
   `extract.ts`, and two harness patches. It is in memory as a standing rule and I still did it;
   I now scan the template body before launching.

## WHAT IS STILL OUTSTANDING

- **L16's readout has had no adversary pass** — its reviewer was killed by the spend limit. I
  verified myself that it was **dead code in four files, reachable from none**, and wired it; the
  code inside it is unreviewed.
- **Attack angles not yet run**: A3 compartment (its exploit agent died). A2 injection, A5
  client/AI and A7 the new surface are in flight at the time of writing.
- **A4 confirmed one MEDIUM**: the application's own database role owns `audit_log`, so it can
  `ALTER TABLE … DISABLE TRIGGER ALL`, rewrite history, and re-chain using the DB's own published
  functions — and `verifyAuditSeal` then reports the forged log as intact, because nothing
  anchors the head digest outside the database. Fix is a separate owner role the app never
  connects as, plus an external head anchor. Not exploitable today: 0070 is not applied to
  production and `verifyAuditSeal` has no production caller.
- **`DESK_PASSCODE` on Render** is the owner's, and it no longer blocks a deploy — it is the
  difference between email sign-in working and email sign-in refusing.
- **Migrations 0068–0074 are not applied to production.** `docs/MIGRATION_HANDOFF_0068_0071.md`
  covers the first four with each one's real blast radius; 0072–0074 are documented in
  `db/migrationLedger.ts` and owe the same handoff treatment.
