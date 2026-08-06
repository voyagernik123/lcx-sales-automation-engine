# P2 — THE PERIMETER — EVIDENCE

Its CLAIM is `LCX_OS_100X_PLAN.md` §8: *"F4, THE OTHER LEDGER, THE EMISSION WARRANT, ONE MOUTH in
shadow mode — producing the number that justifies enforcement rather than assuming it."*

Written from commands I ran. Where a lane's report is the only source for something, it says so.

## WHAT SHIPPED

| capability | where | state |
|---|---|---|
| **F4 — the verdict broker** | `apps/api/src/access/verdictBroker.ts` | built, tested, **not wired to a route** |
| **THE OTHER LEDGER** | `apps/api/src/access/otherLedger.ts` + `0072` | built, tested, **flag default-DENY** |
| **THE EMISSION WARRANT** | `apps/api/src/marketing/emissionWarrant.ts` | built, tested, **not wired to a route** |
| **ONE MOUTH (shadow)** | `apps/api/src/marketing/oneMouth.ts` + `0073` | built, tested, **no caller** |

Gate at `e009970`: doctrine-lint clean · shared 1,733 · api 2,880 · web 2,006 · perf OK ·
`ci-mirror` green against a database built from all 75 migrations. Both CI jobs green.

## ⚠ WHAT "BUILT" DOES NOT MEAN HERE

**None of P2 is doing anything yet, and that is stated rather than discovered.** Three of the four
capabilities have no production caller, `0072`/`0073` are not applied to production, and the
verdict broker's GPS→listing read is **default-deny pending the owner's decision** (one env var,
his call — the mechanism is complete and tested in both flag states). ONE MOUTH's shadow table
will be empty until something calls `observeOneMouth`; an empty shadow table must read as
"recording, nothing observed in this window", never as "zero violations", and the surface carries
an ObservationFrame for exactly that reason.

So P2's honest status is: **the perimeter exists and is not yet switched on.** Wiring it is the
next phase's work, and switching the GPS read on is the owner's.

## WHAT THE ADVERSARY PASS CAUGHT — the reason this phase is not slop

Both P2 lanes returned **DEFECTIVE**. The five that mattered most, all fixed:

1. **An unpopulated register reported as a genuine absence.** `total === 0` became "we looked, and
   marketing holds no record about this subject — a genuine absence". `0060` seeds nothing, so on
   the current database that was the DEFAULT answer for every asset. The platform already had the
   opposite precedent in the file that owns the table (`abuseRegister.ts:399-410` refuses with
   `register_empty`); the broker had copied the withholding pattern and skipped the one guard.
2. **The verdict ignored `state` and stated the result as fact.** Any live row yielded
   `restricted`, but `0060` allows four states and three mean the opposite — `clear`, `announced`,
   `exempt_offer`. A live `clear` row is the register saying the asset CAN be named. Not returning
   the state is correct under Art 90(1); silently not USING it was the defect.
3. **The project entry point queried before any entitlement check**, so a caller with no
   entitlements and the flag OFF still learned whether a project existed, whether it had a ticker,
   and whether that ticker was denormalised — contradicting the module's own claim that entitlement
   is decided before any query.
4. **A refusal code in the union, in the rules map, and emitted by nothing.**
   `EMISSION_CAP_DECLARATION_INVALID` existed and never fired, so a cap declared as `NaN` was
   correctly rejected and then reported as `EMISSION_CAP_NOT_DECLARED` — "No owner has declared a
   cap", which is false and sends the owner to do what he had just done.
5. **A gate CRASH laundered into a compliance fact.** `gateFailure` stamps `ASSET_STATE_UNKNOWN`,
   which is itself a perimeter code, so fifty connection resets made the report assert *as fact*
   that the embargo and holdings registers were the cause.

And one defect that only a real database would show: **`0072`'s trim predicate was written
`E' \t\n\r\f\v'`.** Postgres defines `\b \f \n \r \t` and takes any other escaped character
literally, so `\v` is **the letter v**. Verified against a live server —
`ascii(right(E' \t\n\r\f\v',1))` → **118**. The set stripped a letter and never contained U+000B,
so a stored `'SOL'||chr(11)` was refused by the code and invisible to the index whose only job is
to find the rows the code refuses. Now `\x0B`, checked over eleven fixtures.

## THE SHADOW-MODE DECISION IS DELIBERATE

ONE MOUTH records and blocks nothing. That is not timidity: enforcing a Title VI text gate on live
traffic with no measured base rate is how a desk gets an outage and then turns the control off
permanently. The warrant, by contrast, **does** block — because Art 91(3)(c) is personal liability
of roughly EUR 700k for the human whose name is on a token-incentivised launch, and there is no
version of "let it through and count it" that is survivable for that person.

## OUTSTANDING

- **Wiring**: `observeOneMouth`, `sweepOneMouth`, the warrant gate on campaign status transitions,
  and the verdict broker into GPS's conflict check. A source-walk test makes the "NOT WIRED"
  disclosure falsifiable — it fails the day anyone calls `observeOneMouth`.
- **His**: the quarterly LCX emission cap (a number, or `no cap` — the gate then refuses rather
  than passes), and whether GPS may read the listing pipeline verdict-only.
- **Migrations 0072/0073 not applied to production.**
