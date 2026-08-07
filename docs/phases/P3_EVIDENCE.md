# P3 — TOLD, NOT ASKED — EVIDENCE

CLAIM: `LCX_OS_100X_PLAN.md` §8 — *"THE 07:00 READOUT with its own observation frame and withheld
count; THE CONTROL THAT DID NOT RUN; PRODUCE OR ADMIT."*

## WHAT SHIPPED

| capability | where | state |
|---|---|---|
| **THE 07:00 READOUT** | `notifications/readout.ts`, `routes/readout.ts`, `pages/Readout.tsx` | built, **wired**, review in flight |
| **THE CONTROL THAT DID NOT RUN** | `access/controlRegister.ts`, `routes/governanceRegister.ts`, `pages/ControlRegister.tsx` + `0069` | built, tested |
| **PRODUCE OR ADMIT** | `marketing/__tests__/produceOrAdmit.test.ts` + the marketing gate | built, tested |

## THE THING THIS PHASE ALMOST SHIPPED AS A LIE

**The readout was DEAD CODE IN FOUR FILES, REACHABLE FROM NONE.** `notifications/readout.ts`,
`routes/readout.ts`, `pages/Readout.tsx` and `lib/api/readout.ts` all existed and nothing referenced
any of them — no `app.route`, no router entry. Its own lane's adversary and fix agents were killed
by a spend limit, so nothing reported it; I found it by grepping for a reference and finding none.

That is the exact failure the plan names as the reason an earlier GPS phase was slop: **an engine
surfaced in zero reachable files.** A capability nobody can reach is not a capability, and it would
have sat in the tree reading as delivered.

Now mounted at `/v1/readout` and lazy-routed at `/readout`. Measured after wiring: **168 lazy
chunks** (was 167), initial JS **unchanged at 835KB** — so the capability cost zero initial bytes,
which is what "on an already-lazy route" has to mean in practice.

**Desk-level on purpose, like notifications, and for the same reason:** the readout is ONE ranked
brief PER READER across every compartment that reader holds, so a single workspace gate would be
wrong in both directions — it would deny a reader entitled to two compartments, and it would make
"which compartment does this belong to" a question with no answer. It is not ungated:
`requireOperator` authenticates it and the filtering happens INSIDE, per reader, through the same
parameterised `scopesFor`/`scopeList` that closed P0's live notification leak.

## ⚠ THE READOUT'S INTERNALS ARE UNDER REVIEW AS THIS IS WRITTEN

I verified the WIRING myself. The CODE INSIDE IT had no adversary pass at all — the only lane in
the wave with none. Every other lane returned DEFECTIVE with roughly a dozen defects, five of them
SHIPS_A_LIE, so the prior that this one is clean is weak. A combined attack-and-fix pass is running
against it now, aimed at the things this specific capability gets wrong: whether the withheld count
is an oracle for a compartment the reader holds nothing in, whether `limit` is applied before or
after the scope filter (a shortfall is a second channel), whether the rank names its own basis, and
whether the three empty states stay distinct on every path including errors.

**Until that lands, treat the readout as wired but unverified.**

## THE 07:00 IN THE NAME IS NOT A SCHEDULE

Nothing fires it at 07:00. It is a computed, requestable surface that is correct whenever it is
asked for, and the file says so. That was a deliberate instruction, because the precedent is
sitting in this repo: `wbr_reports` has ONE row, which is why RECESSION RATE was dropped from P4 as
unmeasurable. A capability that claims a schedule it does not have is precisely the defect this
platform is being rebuilt to remove.

**AND THE PRECEDENT IS WORSE THAN "ITS SCHEDULE IS A COMMENT", WHICH IS HOW I DESCRIBED IT.**
Reviewing this readout is what turned it up: the schedule is not a comment, it is a complete
workflow file that sat in a directory GitHub never read. **As of 2026-08-07 it is installed under
`.github/workflows/` and ARMED BY A SECRET the owner must add** — so the cause changed from "wrong
directory" to "no credential", and until that secret exists the consequence below is unchanged.
Eight cron jobs — including `kpi_snapshot`, which fills the ledger the readout ranks — have STILL
never run. See
`docs/SCHEDULED_JOBS.md`. So the readout's empty window is a claim about its LEDGER
and not about the platform, and the surface now says exactly that.

## OUTSTANDING

- The readout review, in flight.
- **`0069` is not applied to production**, so the control-marker indexes do not exist there yet.
  It changes no result — `controlRegister.ts` reads the markers correctly without it, just
  sequentially — so leaving it unapplied costs query time and no correctness.
- Nothing fires the readout at 07:00. A scheduler is a separate decision, and building one on the
  same basis as `wbr_reports` would repeat the defect above rather than fix it.
