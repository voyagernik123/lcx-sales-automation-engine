import type pg from 'pg';
import {
  type Capability,
  type EntitlementMap,
  type WorkspaceId,
  FOUNDING_MEMBER_IDS,
  WORKSPACES,
  WORKSPACE_IDS,
  findMemberById,
  getWorkspace,
  legacyEntitlements,
} from '@lcx/shared';

/**
 * LCX OS — the entitlement loader (LCX ONE Phase 1).
 *
 * WHO MAY ENTER lives in Postgres (migration 0042, governed grants only);
 * WHAT EXISTS lives in the compiled workspace constitution (@lcx/shared).
 * This module joins them for the request path, with two covenants:
 *
 *  FAIL-OPEN, NARROWLY: if 0042 has not landed yet (42P01) the roster falls
 *  back to legacyEntitlements() — exactly the access everyone had before
 *  LCX OS existed. Deploy order can never lock the desk out. Any OTHER
 *  database error propagates: a broken DB must not silently grant access.
 *
 *  MACHINES ARE OPERATORS, NEVER APPROVERS, AND NOT EVERYWHERE: the shared API
 *  key ('operator'), monitors ('monitor:<id>') and the AI ('ai') hold 'operate'
 *  on every compartment that declares `machineAccess` — cron and automation keep
 *  working — while approve-tier stays human-only. Compartments holding a third
 *  party's confidential material opt out (`gps`); see machineMap() below.
 */

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; map: EntitlementMap }>();

/** Drop cached entitlements — called by every governed grant/revoke/decide. */
export function invalidateEntitlements(memberId?: string): void {
  if (memberId) cache.delete(memberId);
  else cache.clear();
}

/**
 * What a NON-ROSTER actor holds: the shared `OPERATOR_API_KEY`, `monitor:<id>`, `ai`.
 *
 * This used to loop every workspace, which is correct for the compartments that
 * have automation — the 15-minute marketing tick (`routes/marketing.ts:149`) posts
 * with the shared key, and jobs across command/sales/intel/regulatory/distribution/
 * governance depend on the same blanket grant. Narrowing it wholesale would break
 * cron, which is why the decision is declared per compartment on the WorkspaceDef
 * rather than inferred from `legacy` here.
 *
 * What it must NOT do is hand a machine a compartment holding a THIRD PARTY's
 * confidential commercial terms. `gps` sets `machineAccess: false`: it has no cron,
 * and the shared key is the least attributable principal in the system — every
 * integration and monitor carries it, so a `gps_conflict_check.decided_by` of
 * "operator" would be an audit row naming nobody. Approve-tier was already
 * human-only; this closes the read.
 */
function machineMap(): EntitlementMap {
  const map: EntitlementMap = {};
  for (const ws of WORKSPACES) {
    if (ws.machineAccess) map[ws.id] = 'operate' as Capability;
  }
  return map;
}

/**
 * THE THREE MACHINE PRINCIPALS, BY NAME. An allowlist, because the alternative was
 * "anything we do not recognise", and that set turned out to be non-empty.
 *
 * `!findMemberById(actorId) → machineMap()` read as "non-roster actors are
 * machines", and that was true when the only credentials were the shared key,
 * `monitor:<id>` and `ai`. Then the second-tier sign-in landed
 * (`middleware/auth.ts`): any `@lcx.com` address plus `SECONDARY_PASSCODE` mints
 * `ext:<local-part>`, which is not on the roster — so every colleague holding a
 * short shared secret was classified as a MACHINE and handed seven compartments at
 * `operate` with no grant row, `governance` among them. `governance` owns
 * `/v1/audit`, whose rows carry GPS action params verbatim: `checkPerformed` (the
 * client conflict narrative) and `disclosureTextUsed` (the verbatim text a client
 * was given). The one boolean written to keep machines out of client data
 * (`gps.machineAccess: false`) does not cover a second compartment's read of the
 * same material.
 *
 * So: recognised machine ids get the machine map; everything else gets NOTHING.
 * An unknown principal is not a machine and is not a member — it is unknown, and
 * unknown is the case that must default to empty. Adding a fourth machine
 * credential now requires editing this list, which is a code review.
 *
 * `ext:` principals are deliberately NOT added here — a colleague on a shared
 * passcode is not a machine. They start with NOTHING, and they earn compartments
 * the same way a member does: a request, an approver, a grant row. See
 * `isSecondTierPrincipal` below for the path that makes that true rather than
 * decorative.
 */
const MACHINE_IDS: readonly string[] = ['operator', 'ai'];
const MACHINE_ID_PATTERNS: readonly RegExp[] = [/^monitor:/];

export function isMachinePrincipal(actorId: string): boolean {
  return MACHINE_IDS.includes(actorId) || MACHINE_ID_PATTERNS.some((re) => re.test(actorId));
}

/**
 * SECOND-TIER PRINCIPALS ARE PEOPLE, AND THEY MUST HAVE A DOOR.
 *
 * `middleware/auth.ts` mints `ext:<local-part>` for any @lcx.com address plus
 * SECONDARY_PASSCODE (Nik, 2026-08-01). Once unknown principals correctly stopped
 * being treated as machines, that sign-in became a DEAD END in the exact sense
 * `middleware/workspace.ts` promises never to produce: the colleague authenticated,
 * held zero compartments, `loadEntitlements` never even LOOKED at the grant table
 * for them, and `routes/access.ts` refused their access request as NOT_A_MEMBER.
 * Every surface said "ask for access"; nothing could give it.
 *
 * So an `ext:` principal now reads its governed grants from `entitlements` exactly
 * like a member — `decide_access_request` already writes rows keyed by the
 * requester's id without a roster check, so approve→grant works end to end — under
 * a hard ceiling applied AFTER the query, so no row in the database can exceed it:
 *
 *   NO ELEVATED COMPARTMENT, EVER. `gps` holds third parties' unpublished filings
 *   and legal work product; `command`, `distribution` and `governance` are elevated
 *   too, and `governance` re-exposes GPS action params verbatim through /v1/audit.
 *   A shared, guessable, unattributable secret does not reach any of them, even if
 *   an approver clicks approve — the request surface refuses first
 *   (`routes/access.ts`) and this filter refuses again if a row appears anyway.
 *
 *   NEVER 'approve'. `auth.ts` already pins the ROLE to 'operator'; this pins the
 *   CAPABILITY to match, so the two ladders cannot disagree.
 *
 * Widening either bound is a roster edit — i.e. a named person — which is the
 * point. There is also NO fail-open here: pre-0042 (42P01) a second-tier principal
 * gets nothing, because the no-lockout covenant exists for the founding desk, not
 * for a shared password.
 */
const SECOND_TIER_PREFIX = 'ext:';
const SECOND_TIER_MAX_CAPABILITY: Capability = 'operate';

export function isSecondTierPrincipal(actorId: string): boolean {
  return actorId.startsWith(SECOND_TIER_PREFIX) && actorId.length > SECOND_TIER_PREFIX.length;
}

/** May a second-tier principal ever hold this compartment? Elevated: no. */
export function secondTierMayHold(ws: WorkspaceId): boolean {
  return getWorkspace(ws).sensitivity !== 'elevated';
}

/** Clamp a grant map to what a second-tier principal is allowed to hold. */
function capSecondTier(map: EntitlementMap): EntitlementMap {
  const out: EntitlementMap = {};
  for (const [ws, cap] of Object.entries(map) as Array<[WorkspaceId, Capability]>) {
    if (!secondTierMayHold(ws)) continue;
    out[ws] = cap === 'approve' ? SECOND_TIER_MAX_CAPABILITY : cap;
  }
  return out;
}

/**
 * The governed grant rows for one principal, or null if 0042 has not landed.
 * Rows naming a workspace the constitution does not declare are ignored.
 */
async function queryGrants(
  pool: pg.Pool,
  actorId: string,
): Promise<{ count: number; map: EntitlementMap } | null> {
  try {
    const { rows } = await pool.query<{ workspace: string; capability: Capability }>(
      `SELECT workspace, capability FROM entitlements WHERE member_id = $1`,
      [actorId],
    );
    const map: EntitlementMap = {};
    for (const r of rows) {
      if ((WORKSPACE_IDS as readonly string[]).includes(r.workspace)) {
        map[r.workspace as keyof EntitlementMap] = r.capability;
      }
    }
    return { count: rows.length, map };
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return null;
    throw err;
  }
}

export async function loadEntitlements(pool: pg.Pool, actorId: string): Promise<EntitlementMap> {
  const member = findMemberById(actorId);
  // Recognised machines get the machine map. A second-tier `ext:<local>` principal
  // gets its governed grants, capped (see isSecondTierPrincipal). Anything else is
  // neither a machine nor a person we can name, and gets nothing.
  if (!member) {
    if (isMachinePrincipal(actorId)) return machineMap();
    if (!isSecondTierPrincipal(actorId)) return {};

    const extHit = cache.get(actorId);
    if (extHit && Date.now() - extHit.at < TTL_MS) return extHit.map;
    const granted = await queryGrants(pool, actorId);
    // 42P01 → nothing: the no-lockout fail-open is for the founding desk only.
    const extMap = granted ? capSecondTier(granted.map) : {};
    cache.set(actorId, { at: Date.now(), map: extMap });
    return extMap;
  }

  const hit = cache.get(actorId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;

  let map: EntitlementMap;
  const grants = await queryGrants(pool, actorId);
  if (grants) {
    if (grants.count === 0) {
      // ZERO ROWS IS TWO DIFFERENT SITUATIONS, AND THIS USED TO CONFLATE THEM.
      //
      // (a) A FOUNDING member whose backfill row is missing — a botched 0042, a
      //     restored database, a manual delete. Locking Nik or Monty out of the
      //     desk over a missing row is the failure the covenant exists to stop,
      //     so they still get the legacy (pre-LCX-OS) compartments.
      //
      // (b) A member added to `operators.ts` AFTER the backfill — a marketing
      //     hire, a delivery specialist, an analyst. This branch used to hand
      //     them `legacyEntitlements`, which before today meant EVERY workspace
      //     at their role capability. So the sequence "add to the roster, deploy,
      //     grant them their compartment tomorrow" gave them US COMMAND and
      //     GOVERNANCE in the interim, at `approve` if their role was approver.
      //     Default-deny was a property of having a grant row, not of the
      //     `legacy: false` flag — which nothing read.
      //
      // (b) now gets NOTHING and lands on the request-access surface, which is
      // the documented intent of a default-deny compartment. Two independent
      // protections, because this guards third-party client data in `gps`:
      // this allowlist, and `legacyEntitlements` itself now filtering on
      // `legacy` so even (a) cannot reach a post-LCX-OS compartment.
      map = FOUNDING_MEMBER_IDS.includes(actorId) ? legacyEntitlements(member.role) : {};
    } else {
      map = grants.map;
    }
  } else {
    // 0042 not applied yet. Same split as the zero-rows branch above: a
    // founding member keeps the pre-LCX-OS desk so a deploy-order accident
    // cannot lock them out, and anyone added later gets nothing — on a
    // database with no `entitlements` table there is no grant to honour, and
    // guessing in their favour would be the same hole through a second door.
    map = FOUNDING_MEMBER_IDS.includes(actorId) ? legacyEntitlements(member.role) : {};
  }

  cache.set(actorId, { at: Date.now(), map });
  return map;
}
