# P5 — THE RECORD — EVIDENCE

CLAIM: `LCX_OS_100X_PLAN.md` §8 — *"THE SEAL, AS OF, the audit index that was declared and never
created."*

## WHAT SHIPPED

| capability | where | state |
|---|---|---|
| **F6 — THE SEAL** | `access/seal.ts` + `0070` (3 columns, 6 functions, 5 triggers) | built, tested, **not applied to prod** |
| **AS OF** | `access/asOf.ts` + `0071` (`entitlement_events`, append-only) | built, tested, **not applied to prod** |
| **the audit index declared and never created** | `0069` `idx_audit_actor` | built, **not applied to prod** |

## THE INDEX THAT NEVER EXISTED

`db/schema.ts` declared `index('idx_audit_actor')` **with no `.on()` columns**, so Drizzle emitted
nothing and the index has never existed in any environment — while the schema file asserted it. Every
actor-filtered `/v1/audit` read is a full scan today. `0069` creates it, along with two partial
indexes over the marker families `actions/registry.ts` has been WRITING since 2026-07-24 and nothing
has ever read.

## THE SEAL WORKS, AND PROVED IT BY BREAKING A TEST

`audit_log` becomes hash-chained and append-only by trigger. SHA-256 comes from the Postgres 11+
built-in, so no extension. **Nothing is retro-sealed**: rows written before it keep `seal_seq IS
NULL` and `seal.ts` reports them as `AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE` — a third state that is
neither intact nor broken, because those rows were mutable for their whole life and a digest computed
now would assert an integrity that was never held.

Its correctness is not a claim: when `0070` reached CI's database it **refused a test's `DELETE FROM
audit_log`** with `AUDIT_SEAL_APPEND_ONLY`. The cleanup was removed rather than the control weakened,
because 0070 was given **no bypass on purpose** — a switch a test can flip is a switch an attacker can
flip. I verified before applying it that **no production code path mutates `audit_log`**; the only
non-test match in the tree is a comment documenting this exact hazard.

## ⚠ F9 — THE SEAL'S OWN LIMIT, FOUND BY ATTACKING IT

An attack pass established, against the CI mirror, that **`audit_log` and `audit_seal_state` are both
owned by the role the API connects as** — and ownership alone permits `ALTER TABLE … DISABLE TRIGGER
ALL`. An attacker holding that credential can rewrite history and re-chain it using the database's own
published digest functions, because the chain is keyless and rooted at a published genesis constant.
The probe drove the **real** `verifyAuditSeal` and it reported the forged log as **intact, whole chain
covered** — only the head digest differed, and nothing records the expected head.

**Not exploitable today**: `0070` is not applied to production and `verifyAuditSeal` has no production
caller. **The fix is structural and is the owner's to schedule**: own the audit tables with a role the
application never connects as, and anchor the head digest outside the database so a re-chain becomes
detectable. Optionally HMAC the digest with a key the connection role cannot read.

The repo's own claim that ownership-level tampering is "still DETECTED after the fact" is **false**
once the attacker re-chains, and that overclaim is worth more than the finding.

## AS OF — AND THE TEST THAT WAS WRITING INTO THE REAL LEDGER

`asOf.ts` replays `entitlement_events` at an instant, so revoking stops destroying the grant it
revokes. Two triggers sit on `entitlements`: every insert/update writes an event row, and an
unattributed DELETE writes one too.

Its own suite exposed something worse than a wrong assertion. It fabricates a database with **no**
grant ledger to test the ledger-absent branch, but its pool's `search_path` fell back to `public` —
where CI's `npm run migrate` had just created `entitlement_events`. So the branch was unreachable
**and the suite was writing test revocation events into the real append-only ledger**, where they
cannot be cleaned up. The absence now has to be real: no public fallback for that pool. That is also
what produced `npm run ci-mirror`, since no populated dev database could have shown it.

## OUTSTANDING

- **0069, 0070 and 0071 are not applied to production.** `docs/MIGRATION_HANDOFF_0068_0071.md`
  carries each one's real blast radius. Until 0070 lands, `verifyAuditSeal` returns
  `AUDIT_SEAL_NOT_INSTALLED` rather than a green chain, so nothing reads as sealed while it is not.
- **`verifyAuditSeal` has no production caller.** The seal is evidence nobody is yet reading; wiring
  it to a governance surface is owed.
- **F9 is open** and is the owner's: a separate owner role plus an external head anchor.
