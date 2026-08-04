# P0 — EVIDENCE

Per `LCX_OS_100X_PLAN.md` §7.1: the command and its output, or it did not happen.

## GATE — `npm run ci-check`, exit 0

```
doctrine-lint  clean (4 rules)
shared         1587 passed (1587)
api            2310 passed | 9 skipped (2319)
web            1765 passed (1765)
──────────────────────────────────────
               5662 passed, 0 failed
perf           initial under budget; largest chunk 435.93 kB (ceiling 440)
```

Baseline before P0 was shared 1587 / api 2277 / web 1765. The +33 in api are this phase's tests
(21 need-to-know + 12 stream/refusal-code).

**CI job 2** (`playwright screenshots + interaction smoke`) runs only on push. It is declared
`needs: gate`, so it is *absent* rather than failed when the gate fails — which is why a green job
1 proves nothing about it, and why `scripts/verify-ci.mjs` now exists. Verified after push with
`npm run verify-ci -- --wait`.

## MIGRATION 0067 — applied locally, verified

```
$ psql … -f apps/api/src/db/migrations/0067_notifications_workspace.sql
ALTER TABLE / DO / UPDATE 16 / CREATE INDEX ×2 / COMMENT
```

Backfill result, after the correction below:

| workspace | rows | rules |
|---|---|---|
| sales | 14 | competitor_listing, deal_stage_change, deal_stalled, discovery_found, reply_received, weekly_digest |
| governance | 2 | access |
| **unattributed (NULL)** | **0** | — |

CHECK constraint verified by attempting an invalid insert:

```
$ INSERT INTO notifications (rule,title,workspace) VALUES ('t','t','not_a_workspace');
ERROR:  new row for relation "notifications" violates check constraint
        "notifications_workspace_check"
```

## CLAIMS — outcome

| # | Claim | Result |
|---|---|---|
| C1 | read path scoped to held compartments | **pass** — `WHERE workspace IN ($1,$2)` |
| C2 | withholding is visible (`withheld` count) | **pass** |
| C3 | `unread` scoped, not global | **pass** |
| C4 | `markRead('all')` scoped | **pass** |
| C5 | `markRead(id)` out of scope changes nothing, refuses | **pass** — `NOTIF_NOT_IN_SCOPE`, 404 |
| C6 | SSE delivers only entitled events | **pass** — `streamScope.test.ts` opens the route and asserts distribution/gps/marketing events do not arrive at a sales-only subscriber, desk events do, and an empty workspace is not treated as desk |
| C7 | stream token subject-bound, not replayable | **pass** — 8 tests incl. two regressions |
| C8 | omitting a scope is a compile error | **pass** — it found 5 call sites I had not seen |
| C9 | all rules write a non-null workspace | **pass** — 13 rules |
| C10 | NULL rows withheld from everyone, counted | **pass** |
| C11 | 0067 backfills every known rule; CHECK enforced | **pass, after correction** |
| C12 | gate cannot report green while job 2 is red | **pass** — `scripts/verify-ci.mjs` treats a `skipped` second job as a failure, by name |

## TRACK C — the machine, built and mutation-tested

`npm run doctrine-lint` is wired into `ci-check`, so it runs ahead of type-check on every gate.
Four rules, and **every one was proven to bite** by breaking it and confirming a non-zero exit:

```
baseline: exit 0  CLEAN
  ✓ absences / stale code                        exit 1 → CAUGHT
  ✓ notif-scope / INSERT drops the column         exit 1 → CAUGHT
  ✓ notif-scope / unfiltered read path returns    exit 1 → CAUGHT
  ✓ honesty-ceiling / the last caller disappears  exit 1 → CAUGHT
  ✓ phase-evidence / claim with no evidence       exit 1 → CAUGHT
restored: exit 0  CLEAN
```

A guard nobody has watched fail is not a guard. The `unfiltered read path returns` mutation is the
important one: it reintroduces the exact `FROM notifications ORDER BY …` statement that was the
production leak, and the linter rejects it.

**One rule was written wrong and is recorded rather than quietly replaced.** The first
forbidden-metric rule grepped for `reach:` / `impressions:` as field names and produced **nine
false positives against correct code**: `reach` is an ordinal 1–5 scoring dimension in the
channel-mix matrix (`routes/distribution.ts:119`, beside `cost` and `effort`), a typed
`ReachAssessment` triage input (`routes/marketingDesk.ts:972`), and an English word inside a
comment (`routes/marketingGates.ts:1343` — my comment detection matched `^\s*\*` and missed a line
opening `/*`). Editing nine correct sites to satisfy a bad rule is how a linter earns deletion. The
rule now guards the failure that actually happened — `assertHonestPayload` reaching production with
**zero** callers — and defers payload-walking to F1 in P1, which is the only place it can be done
without static-analysis guesswork.

## Three defects found in my own work while doing this

Recorded because the plan's §7 says loud rework beats silent rework.

**1. `encodeURIComponent` does not escape `.`** — it is an unreserved character. The first
subject-bound token was `${expires}.${encodeURIComponent(subject)}.${sig}`, and second-tier
sign-in mints ids like `ext:nikhil.sharma`. That produced a four-segment token which failed a
three-segment parse, **silently killing the live notification stream for every second-tier
colleague**. Caught by my own test, not in production. Fixed with base64url, whose alphabet
contains no `.`, plus a canonical-re-encoding check so a value cannot be accepted in a second
spelling. Pinned by a regression test naming the exact id shape.

**2. The migration backfilled 10 rules; there are 13.** `P0_CLAIM.md` asserted ten — the eight in
`evaluateAlertRules` plus `deal_stage_change` and `access`. The type system later surfaced
`reply_received`, `weekly_digest` and `monitor`, and I patched the code without returning to the
migration. Applying it locally left **4 rows unattributed and named them**. The data corrected a
document that asserted a count. `monitor` remains deliberately unbackfilled: its compartment
depends on an operator-supplied href, so historic rows stay NULL rather than guessed.

**3. `weekly_digest` was nearly scoped to the desk.** Its href is `/`, which is desk-level, and
`workspaceForPath('/')` returns null. But the body is entirely deals and handoffs — project names,
stages, owners. Desk-scoping it would have put sales content in every member's bell. **The href is
routing; the content decides the scope.**

## What is still outstanding, and why

- **0067 is not on production.** Applied locally only. **This gates the push**, and the order is
  not negotiable: the read path now SELECTs `workspace` and every write INSERTs it, so deploying
  the code first breaks the bell outright until the column exists. SQL first, then push.
- **CI job 2 has not run**, because nothing has been pushed. `npm run verify-ci -- --wait` is the
  command, and it fails rather than shrugs when the playwright job is skipped.
- **F1, the honesty middleware, is P1 — not P0.** `assertHonestPayload` still has exactly one
  caller, in a browser file. The linter now stops that becoming zero; moving it server-side is P1's
  job, and the doctrine stays unenforced across 223 API files until then. Stated because
  "doctrine-lint is clean" could otherwise be read as "the doctrine is enforced". It is not.
- **`monitor` rows predating 0067 stay unattributed** by design — their compartment depends on an
  operator-supplied href the migration cannot resolve. There are none locally; production may
  differ, and any that exist are counted rather than shown.

## Files

```
NEW  apps/api/src/db/migrations/0067_notifications_workspace.sql
NEW  apps/api/src/notifications/__tests__/needToKnow.test.ts   (21 tests)
NEW  apps/api/src/notifications/__tests__/streamScope.test.ts  (12 tests)
NEW  scripts/doctrine-lint.mjs                  4 rules, all mutation-tested
NEW  scripts/verify-ci.mjs                      both-jobs check; skipped == failed
NEW  docs/phases/ABSENCES.md                    the deliberate-absences register
NEW  docs/phases/P0_CLAIM.md, docs/phases/P0_EVIDENCE.md
MOD  package.json                               doctrine-lint wired into ci-check
MOD  apps/api/src/notifications/service.ts      scoped read + write, 13 rules
MOD  apps/api/src/notifications/events.ts       subject-bound token, workspace on event
MOD  apps/api/src/routes/notifications.ts       entitlement resolution, stream filter, refusal
MOD  apps/api/src/actions/registry.ts           3 notify sites
MOD  apps/api/src/notifications/digest.ts       weekly_digest -> sales
MOD  apps/api/src/outreach/handoffs.ts          reply_received -> sales
MOD  apps/api/src/routes/{deals,access}.ts      2 notify sites
MOD  apps/api/src/db/migrationLedger.ts         0067 registered as pending
MOD  apps/web/src/lib/api/bd.ts                 NotificationPage type
MOD  apps/web/src/components/layout/NotificationBell.tsx   3 empty states, withheld footer
```
