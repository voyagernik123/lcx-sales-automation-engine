import type pg from 'pg';
import { getConnector, isStale, CONNECTORS } from '@lcx/shared';
import { getDb } from '../db/index.js';
import { sql } from 'drizzle-orm';

/**
 * The collection scheduler — freshness + the intelligence-gap ledger.
 *
 * Connectors call markOk/markError to record what they collected; dueTargets
 * asks "which high-priority objects are stale or missing for this source?" so
 * collection tasks itself instead of blindly re-scraping everything.
 */

export async function markOk(pool: pg.Pool, subjectType: string, subjectId: string, source: string): Promise<void> {
  const freshDays = getConnector(source)?.freshnessDays ?? 7;
  await pool.query(
    `INSERT INTO collection_state
       (subject_type, subject_id, source, status, last_ok_at, last_attempt_at, next_due_at, runs, last_error)
     VALUES ($1,$2,$3,'ok',NOW(),NOW(), NOW() + ($4 || ' days')::interval, 1, NULL)
     ON CONFLICT (subject_type, subject_id, source) DO UPDATE SET
       status='ok', last_ok_at=NOW(), last_attempt_at=NOW(),
       next_due_at=NOW() + ($4 || ' days')::interval, last_error=NULL,
       runs=collection_state.runs+1, updated_at=NOW()`,
    [subjectType, subjectId, source, String(freshDays)],
  );
}

export async function markError(
  pool: pg.Pool, subjectType: string, subjectId: string, source: string, error: string,
): Promise<void> {
  const retryDays = 1;
  await pool.query(
    `INSERT INTO collection_state
       (subject_type, subject_id, source, status, last_attempt_at, last_error, next_due_at, runs)
     VALUES ($1,$2,$3,'error',NOW(),$4, NOW() + ($5 || ' days')::interval, 1)
     ON CONFLICT (subject_type, subject_id, source) DO UPDATE SET
       status='error', last_attempt_at=NOW(), last_error=$4,
       next_due_at=NOW() + ($5 || ' days')::interval,
       runs=collection_state.runs+1, updated_at=NOW()`,
    [subjectType, subjectId, source, (error || '').slice(0, 500), String(retryDays)],
  );
}

export interface DueTarget {
  id: string;
  identifier: string | null;
}

/**
 * Highest-priority projects that are stale or never-collected for `source`. If
 * `requireKind` is set, only projects that already have that identifier are
 * returned (and its value comes back as `identifier`).
 */
export async function dueTargets(
  pool: pg.Pool,
  source: string,
  limit: number,
  requireKind?: string,
): Promise<DueTarget[]> {
  if (requireKind) {
    const { rows } = await pool.query(
      `SELECT p.id, pid.value AS identifier
       FROM projects p
       JOIN project_identifiers pid ON pid.project_id = p.id AND pid.kind = $3
       LEFT JOIN collection_state cs
         ON cs.subject_type='project' AND cs.subject_id = p.id::text AND cs.source = $1
       LEFT JOIN LATERAL (
         SELECT priority_score FROM scores WHERE project_id = p.id ORDER BY computed_at DESC LIMIT 1
       ) s ON true
       WHERE (cs.next_due_at IS NULL OR cs.next_due_at <= NOW()) AND p.tier = 'tracked'
       ORDER BY COALESCE(s.priority_score,0) DESC, p.market_cap_usd DESC NULLS LAST
       LIMIT $2`,
      [source, limit, requireKind],
    );
    return (rows as { id: string; identifier: string | null }[]).map((r) => ({ id: r.id, identifier: r.identifier }));
  }
  const { rows } = await pool.query(
    `SELECT p.id
     FROM projects p
     LEFT JOIN collection_state cs
       ON cs.subject_type='project' AND cs.subject_id = p.id::text AND cs.source = $1
     LEFT JOIN LATERAL (
       SELECT priority_score FROM scores WHERE project_id = p.id ORDER BY computed_at DESC LIMIT 1
     ) s ON true
     WHERE (cs.next_due_at IS NULL OR cs.next_due_at <= NOW()) AND p.tier = 'tracked'
     ORDER BY COALESCE(s.priority_score,0) DESC, p.market_cap_usd DESC NULLS LAST
     LIMIT $2`,
    [source, limit],
  );
  return (rows as { id: string }[]).map((r) => ({ id: r.id, identifier: null }));
}

export interface CoverageEntry {
  id: string;
  label: string;
  source: string;
  yields: string;
  status: 'ok' | 'error' | 'pending' | 'missing';
  lastOkAt: string | null;
  fresh: boolean;
}

/** Per-object sensor coverage for the inspector (route context / getDb). */
export async function getCoverage(subjectType: string, subjectId: string): Promise<CoverageEntry[]> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT source, status, last_ok_at FROM collection_state
    WHERE subject_type = ${subjectType} AND subject_id = ${subjectId}
  `);
  const bySource = new Map<string, { status: string; last_ok_at: string | null }>();
  for (const r of (res.rows ?? []) as Record<string, unknown>[]) {
    bySource.set(r.source as string, { status: r.status as string, last_ok_at: (r.last_ok_at as string | null) ?? null });
  }
  return CONNECTORS.map((c) => {
    const st = bySource.get(c.id);
    return {
      id: c.id,
      label: c.label,
      source: c.source,
      yields: c.yields,
      status: (st?.status as CoverageEntry['status']) ?? 'missing',
      lastOkAt: st?.last_ok_at ?? null,
      fresh: st?.last_ok_at ? !isStale(st.last_ok_at, c.freshnessDays) : false,
    };
  });
}
