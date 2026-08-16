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

## TRACK B — the geometry engine's eleven codes (`2550ac4`)

Registered here because a 3-D surface is the most persuasive thing this platform can put on a
screen, so its refusals matter more than any panel's, not less. All eleven are in
`GEOMETRY_REFUSAL_CODES` (`packages/shared/src/geometry/index.ts:81`) and every one carries a rule
citation rather than a bare string.

| code | means |
|---|---|
| `GEOMETRY_GRID_NOT_LOADED` | the grid was never read (`rows: null`) |
| `GEOMETRY_GRID_EMPTY` | read, and holds no cells |
| `GEOMETRY_GRID_RAGGED` | row lengths disagree with the axes — no mesh exists over that |
| `GEOMETRY_ALL_CELLS_ABSENT` | read, and not one cell holds a value |
| `GEOMETRY_ALL_CELLS_WITHHELD` | every cell was measured and may not be shown |
| `GEOMETRY_NO_COMPLETE_QUAD` | values present, but no cell has four observed corners |
| `GEOMETRY_Z_NOT_FINITE` | a NaN or Infinite height — a broken computation, **not** an absence |
| `GEOMETRY_AXIS_DEGENERATE` | an axis with no usable extent, or non-ascending coordinates |
| `GEOMETRY_PROJECTION_DEGENERATE` | a view that collapses a dimension — a picture that looks like a surface and is not one |
| `GEOMETRY_ENVIRONMENT_NOT_STATED` | a figure from a database that will not say which one |
| `GEOMETRY_OBSERVATION_NOT_DATED` | a dated figure with no date is a screenshot (plan §6.1) |

**FOUR PAIRS THAT LOOK REDUNDANT AND ARE NOT.** Each pair exists because collapsing it would
launder one fact into another:

- `GRID_NOT_LOADED` vs `GRID_EMPTY` — the read failed, versus the read succeeded and found nothing.
- `ALL_CELLS_ABSENT` vs `ALL_CELLS_WITHHELD` — nobody measured, versus it was measured and
  classified. The operator's next move is a measurement question in one case and a permission
  question in the other.
- `ALL_CELLS_ABSENT` vs `Z_NOT_FINITE` — an all-`NaN` grid raises the latter and the former stays
  **silent**, because a broken computation reported as an absence is the exact laundering the two
  codes exist to prevent.
- `ALL_CELLS_ABSENT` vs `NO_COMPLETE_QUAD` — "there is no data" versus "the holes are in the wrong
  places".

At cell level the same discipline holds without a refusal: `null` is never-measured and draws as a
HOLE, `WITHHELD` was measured and is counted and listed **separately**, and neither is ever drawn at
a height. The frame counts them apart.

### Stated absences in this track, so nothing reads as delivered that is not

- **The surface has exactly ONE consumer.** Nothing else imports `buildSurfaceMesh`, because no
  other page has a grid-shaped reading to give it. A second renderer built before its data source
  would be the decoration Track B exists to refuse.
- **`GEOMETRY_PROJECTION_DEGENERATE` has no caller that can trigger it today** — the mounted surface
  uses `DEFAULT_VIEW` and no surface exposes a view control. The code is correct and currently
  unreachable from the UI; it is registered as a guard, not as a behaviour anyone has seen.
- **Two rendering defects are open, found by rendering the figure and measuring it rather than by
  testing it.** The viewBox reserves a constant pad around projected POINTS while tick labels are
  TEXT, so a label longer than ~4 characters is clipped (`baseline` by 11.6 units); and both floor
  axes anchor on the near edge, whose two tick runs meet at one corner, so the last tick of each
  collides (`$24,000` with `+50%`, by 5.7 units). Neither affects a NUMBER — the heights, counts and
  frame are correct — but a clipped axis label is a legibility failure on the one figure that most
  needs to be read precisely. Written up with measurements, owed a fix and the three tests that
  would have caught them.

## TWO ROUTES WHOSE COMPARTMENT IS UNDECIDED (`51543d1`)

`app.ts` mounts `requireWorkspace` only for paths inside a workspace's `apiPrefixes`. Thirteen
mounted paths sit outside that set. Two of them were leaking and are fixed — `/v1/reviews` (five
handlers, no gate, a copilot composing the sales dossier and feeding it to a model) and
`/v1/tasks` (`'Unstick deal: ' || p.name` with each deal's stage and staleness, to any
authenticated principal). The remaining thirteen are now a **declared register** asserted by
`apps/api/src/__tests__/routeCompartmentCoverage.test.ts`, so a fourteenth cannot appear quietly.

Two entries in that register are **OPEN**, and are recorded here because a decision that lives
only in a test file is half-recorded:

| path | what is undecided |
|---|---|
| `/v1/integrations` | `GET /email-threads/:projectId` and `/social-mentions/:projectId` return per-project counterparty communications with no per-reader filter. Same shape as the tasks defect. |
| `/v1/users` | `GET /:id/assignments` joins `project_assignments` to `projects`, so it names which projects a person works. The roster itself (id/email/name/role) is desk-level; the join is the open part. |

**Not fixed on purpose.** Both turn on a question I cannot answer from the code: whether "who is
working what" and "what a counterparty emailed about a project" are desk-level facts at LCX.
Guessing would either break the desk for three people who currently see everything, or write down
a need-to-know decision nobody made. The register test fails if either is closed without updating
it, so the answer lands in the same commit as the change.

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

---

## OPEN, and only the owner can close it: the forward-risk feed (E7 THE STORM)

**Status: an instrument that does not exist, not a bug.** Recorded here rather than in a 3-D document
because closing it is a decision about what the monitor reports, not a rendering choice.

`apps/web/src/pages/MarketingCrisis.tsx` mounts `StormRelief` with a field built by
`riskFieldUnavailable(...)`, and that is the only call site outside tests. Its own stated reason:

> Marketing risk by day, channel and severity band is not produced anywhere in this system today —
> not by the crisis engine, which is pure text and gates, and not by the record compartment, which
> looks backwards at what was published. So there is nothing to draw and nothing to accumulate.
> **This is NOT an all-clear for the days ahead: it is the absence of an instrument.**

**The renderer is finished.** E7 is built, gated on data, correct, and unreachable — it is the one
environment of the eight that has never drawn a frame outside its harness, and the accessibility fix
applied to it in August 2026 was to a state no operator can currently reach. That is why the defect
survived four passing suites.

**Do not invent a fixture to light it.** Manufacturing a risk field to make the surface render would
put a picture of forward risk in a compliance record while the underlying measurement does not exist,
which is the exact failure the three empty states above are designed to prevent — an absence
rendering as a reading.

**What closing it requires:** a decision about whether this desk reports forward marketing risk at
all, and if so, what produces it. The renderer needs no further work once a real field exists.
