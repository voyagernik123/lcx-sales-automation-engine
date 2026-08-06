# THE DELIBERATE-ABSENCES REGISTER

`LCX_OS_100X_PLAN.md` §7.6. This programme is full of capabilities whose correct output is a
refusal — no comparables, no rate card, no second witness, no stored history. **An untested
refusal is a silent default waiting to happen**, so every one is registered here with the code,
the file that must refuse, and the test that proves it does.

`npm run doctrine-lint` parses the table below and fails when a row's code is missing from either
its source file or its test file. Reviewed at every SHIP.

## Format

Three columns, all required. `code` is the stable refusal identifier. `refuses in` is the file
that must emit it. `proven by` is the test that asserts it. Paths are repo-relative.

<!-- ABSENCES:BEGIN -->

| code | refuses in | proven by |
|---|---|---|
| `NOTIF_NOT_IN_SCOPE` | apps/api/src/routes/notifications.ts | apps/api/src/notifications/__tests__/streamScope.test.ts |
| `NOTIF_ERROR` | apps/api/src/routes/notifications.ts | apps/api/src/notifications/__tests__/streamScope.test.ts |
| `UNAUTHORIZED` | apps/api/src/routes/notifications.ts | apps/api/src/notifications/__tests__/streamScope.test.ts |
| `SE_EXCEEDS_MAGNITUDE` | packages/shared/src/launchSim.ts | packages/shared/src/forecast/forecast.test.ts |
| `MARK_ENVIRONMENT_NOT_STATED` | packages/shared/src/marks/mark.ts | packages/shared/src/marks/mark.test.ts |
| `ALL_OPEN_DEALS_UNPRICEABLE` | packages/shared/src/forecast/index.ts | apps/web/src/components/kpi/__tests__/ForecastDistribution.test.tsx |
| `UNRATEABLE_STAGE_EXCLUDED` | packages/shared/src/forecast/index.ts | apps/web/src/components/kpi/__tests__/ForecastDistribution.test.tsx |
| `PAYLOAD_TOO_DEEP_TO_VERIFY` | packages/shared/src/marketing/observation.ts | apps/web/src/lib/api/__tests__/marketingCeiling.test.ts |

<!-- ABSENCES:END -->

## Why each is here

**`NOTIF_NOT_IN_SCOPE`** — `markRead(id)` on a notification in a compartment the actor does not
hold. It returns **404 with one code for both "no such row" and "not yours"**, deliberately:
distinguishing them would confirm that a notification exists in a compartment the actor cannot
read, which is the same leak through a narrower channel. If this ever silently returns
`{ ok: true }`, an operator believes they actioned something they never touched.

**`NOTIF_ERROR`** — the list failed. It must not degrade to an empty list, because an empty bell
reads as "nothing happened" and this is "we do not know".

**`UNAUTHORIZED`** — an absent, expired, tampered or non-canonical stream token. The pre-0067
token carried no subject, so this code could only ever mean "not signed by us"; it now also
covers "not resolvable to an actor", which is what makes per-subscriber filtering possible.

## Not yet registered, and owed by the phase that introduces them

These are named so they are not forgotten, not because they exist:

- **P1** — `refused_no_comparables` (MARK TO CONTRACT below *K* comparables), plus the existing
  GPS `refused_no_rate_card` / `refused_card_expired` / `refused_currency_mismatch` which THE
  FLOOR reuses and must therefore prove it reuses.
- **P2** — `EMBARGO_REGISTER_ABSENT`, `HOLDINGS_DECLARATION_MISSING`, `TREASURY_CAP_NOT_DECLARED`.
  All three exist in code already; none is in this register yet, which is itself a gap.
- **P3** — the Art 8(2) `hash_differs` bucket, which is a third state and not a failure.
- **P4** — the refusal that is likely to be P4's headline: too little stored history to claim
  calibration.

## The three empty states this register exists to protect

Written out because collapsing them is the specific error the governance compartment is built to
catch, and P0 hit it twice:

| state | means | must render as |
|---|---|---|
| not loaded | the API did not answer | "not loaded", never an empty list |
| empty + withheld | alerts exist, in compartments you do not hold | the count, stated |
| empty | genuinely nothing | "nothing yet" |

`apps/web/src/components/layout/NotificationBell.tsx` renders all three separately. Before P0 it
rendered one.
