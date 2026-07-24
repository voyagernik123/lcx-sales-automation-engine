import type pg from 'pg';
import {
  type Capability,
  type EntitlementMap,
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
      // Roster member with zero rows = pre-backfill state (or a brand-new
      // roster addition): the no-lockout covenant applies, not default-deny.
      // Full revocation is not a Phase-1 flow; rows only shrink one at a time.
      map = legacyEntitlements(member.role);
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
      map = legacyEntitlements(member.role); // 0042 not applied yet
    } else {
      throw err;
    }
  }

  cache.set(actorId, { at: Date.now(), map });
  return map;
}
