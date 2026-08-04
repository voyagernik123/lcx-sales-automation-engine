# P0 — CLAIM

Per `LCX_OS_100X_PLAN.md` §7.1, the phase opens with falsifiable claims and the command that
would disprove each. A claim with no disproof has no exit condition.

**Scope:** the need-to-know leak in the notification bell (§3), F3 (`notifications.workspace`),
and Track C's own build. Migration number leased: **0067** (latest was 0066).

---

## What was actually found — three leak surfaces, not one

The plan named one. Reading the code found three, all in production:

1. **`listNotifications`** (`apps/api/src/notifications/service.ts:54-76`) —
   `SELECT … FROM notifications ORDER BY created_at DESC LIMIT n`. No workspace filter, no
   entitlement check. Every operator's bell shows every compartment's alerts.
2. **`markRead('all')`** (`:78-85`) — `UPDATE notifications SET read_at = NOW() WHERE read_at IS
   NULL` marks **every** compartment's alerts read, including ones the actor cannot see. And
   `markRead(id)` updates by id with no scope check, so a guessed id is actionable.
3. **The SSE stream** (`apps/api/src/notifications/events.ts`, `routes/notifications.ts:21-49`) —
   `notificationBus` broadcasts every event to every connected client. Worse, `mintStreamToken`
   derives the token from the operator key with **no subject in it**, so the stream cannot filter
   by entitlement even in principle. This one is structural, not a missing `WHERE`.

Ten rules write notifications and none records a compartment: eight in `evaluateAlertRules`
(`:88-228`) plus `deals.ts:359` (`deal_stage_change`) and `access.ts:123` (`access`).

## A distinction that must not be collapsed

`workspaceForPath()` (`packages/shared/src/workspaces.ts:270`) returns `null` for **desk-level**
surfaces "which every member always has". So a null workspace is ambiguous:

- **desk-level by design** — every member should see it; or
- **a legacy row written before the column existed**, whose provenance is unknown.

Treating those as one value would repeat the error §4.8 of the plan warns about: absence of a
marker on a pre-marker row means *unknown*, not *clean*. So they are encoded distinctly:
`workspace = '_desk'` is deliberate desk-level; `workspace IS NULL` is unattributed, withheld from
everyone, and **counted visibly**.

---

## CLAIMS

| # | Claim | Disproved by |
|---|---|---|
| C1 | `listNotifications` returns only rows whose workspace the actor holds at ≥`view`, plus `_desk` rows. | Test: actor holds `sales` only, a `distribution` row exists → row absent from `items`. |
| C2 | Withholding is **visible**: the response carries a `withheld` count. Never silent. | Test: same fixture asserts `withheld === 1`. |
| C3 | `unread` counts only what the actor may see. | Test: an out-of-scope unread row does not raise `unread`. |
| C4 | `markRead('all')` marks only in-scope rows. | Test: out-of-scope unread row still has `read_at IS NULL` afterwards. |
| C5 | `markRead(id)` on an out-of-scope id changes nothing and reports a refusal. | Test: row unchanged, refusal code returned. |
| C6 | The SSE stream delivers only events the subscriber is entitled to. | Test: token minted for a sales-only actor; a `distribution` event is emitted and not received. |
| C7 | The stream token is **subject-bound** — a token cannot be replayed as a different actor. | Test: a token minted for actor A does not verify as actor B. |
| C8 | Every `notify()` call site supplies a scope; omission is a compile error. | `npm run ci-check` — `tsc` fails if any call omits it. |
| C9 | All ten rules write a non-null workspace. | Test asserting zero rows with `workspace IS NULL` after a sweep over seeded fixtures. |
| C10 | Unattributed (`NULL`) rows are withheld from everyone and reported separately as `unattributed`. | Test: a hand-inserted NULL row appears in neither `items` nor `withheld`, and `unattributed === 1`. |
| C11 | 0067 backfills all ten known rules and CHECKs the column against the 8 ids + `_desk`. | Migration applied to a scratch DB; `SELECT DISTINCT workspace` matches the mapping; an invalid insert is rejected. |
| C12 | The gate cannot report green while CI job 2 is red. | Run the gate with job 2 forced red → non-zero exit. |

## Rule → workspace, derived from the registry not invented

`webPaths` in `packages/shared/src/workspaces.ts` owns the mapping. Verified: `decisions` and
`access` belong to **governance**, not command — which contradicts the guess I would have made.

| rule | href | workspace |
|---|---|---|
| `deal_stalled` | `/deal-board` | sales |
| `deal_stage_change` | `/deal-board` | sales |
| `competitor_listing` | `/bd-pipeline/:id` | sales |
| `discovery_found` | `/bd-pipeline/:id` | sales |
| `decision_review_due` | `/decisions` | **governance** |
| `command_rfi_stale` | `/command-partners` | command |
| `command_critical_open` | `/command-deck` | command |
| `dist_listing_stale` | `/distribution/listings` | distribution |
| `dist_campaign_uncleared` | `/distribution/campaigns` | distribution |
| `access` | `/access` | **governance** |

## Not in scope for P0, stated so it is not assumed

- No change to who is entitled to what. This filters by existing entitlements; it grants nothing.
- The machine principal (`machineMap()`) keeps its blanket `operate`, so cron keeps working. A
  machine reading the bell is not a new exposure — it already holds those compartments.
- The bell's web surface gets the withheld count rendered; no redesign.
