import type pg from 'pg';
import {
  type Capability,
  type EntitlementMap,
  FOUNDING_MEMBER_IDS,
  WORKSPACE_IDS,
  findMemberById,
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
 *  MACHINES ARE OPERATORS, NEVER APPROVERS: the shared API key ('operator'),
 *  monitors ('monitor:<id>') and the AI ('ai') hold blanket 'operate' — cron
 *  and automation keep working, while approve-tier stays human-only.
 */

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; map: EntitlementMap }>();

/** Drop cached entitlements — called by every governed grant/revoke/decide. */
export function invalidateEntitlements(memberId?: string): void {
  if (memberId) cache.delete(memberId);
  else cache.clear();
}

function machineMap(): EntitlementMap {
  const map: EntitlementMap = {};
  for (const id of WORKSPACE_IDS) map[id] = 'operate' as Capability;
  return map;
}

export async function loadEntitlements(pool: pg.Pool, actorId: string): Promise<EntitlementMap> {
  const member = findMemberById(actorId);
  // Non-roster actors are machines (shared key, monitor:<id>, ai).
  if (!member) return machineMap();

  const hit = cache.get(actorId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;

  let map: EntitlementMap;
  try {
    const { rows } = await pool.query<{ workspace: string; capability: Capability }>(
      `SELECT workspace, capability FROM entitlements WHERE member_id = $1`,
      [actorId],
    );
    if (rows.length === 0) {
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
      map = {};
      for (const r of rows) {
        if ((WORKSPACE_IDS as readonly string[]).includes(r.workspace)) {
          map[r.workspace as keyof EntitlementMap] = r.capability;
        }
      }
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      // 0042 not applied yet. Same split as the zero-rows branch above: a
      // founding member keeps the pre-LCX-OS desk so a deploy-order accident
      // cannot lock them out, and anyone added later gets nothing — on a
      // database with no `entitlements` table there is no grant to honour, and
      // guessing in their favour would be the same hole through a second door.
      map = FOUNDING_MEMBER_IDS.includes(actorId) ? legacyEntitlements(member.role) : {};
    } else {
      throw err;
    }
  }

  cache.set(actorId, { at: Date.now(), map });
  return map;
}
