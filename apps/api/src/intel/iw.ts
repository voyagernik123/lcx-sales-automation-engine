import type pg from 'pg';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

/**
 * Indications & Warning — the standing watch. Scans the alpha layer for
 * leading-indicator patterns that mean "act now" and records them as
 * indication signals the desk can read. v1 covers the two strongest free
 * patterns: a ripe listing window, and competitive-listing pressure.
 * Idempotent: clears the prior scan's indications first.
 */

export interface Indication {
  projectId: string;
  name: string;
  type: 'ripe_window' | 'competitive_pressure';
  severity: 'high' | 'medium';
  message: string;
  conviction: number;
}

export async function scanIndications(pool: pg.Pool): Promise<{ ripe: number; pressure: number }> {
  await pool.query(`DELETE FROM signals WHERE kind='indication'`);

  const { rows: ripe } = await pool.query(
    `WITH conv AS (
       SELECT DISTINCT ON (subject_id) subject_id, value_num FROM observations
       WHERE predicate='conviction' ORDER BY subject_id, observed_at DESC),
     tw AS (
       SELECT DISTINCT ON (subject_id) subject_id, value_json FROM observations
       WHERE predicate='timing_window' ORDER BY subject_id, observed_at DESC)
     SELECT p.id, p.name, conv.value_num AS conviction
     FROM conv
     JOIN projects p ON p.id::text = conv.subject_id
     JOIN tw ON tw.subject_id = conv.subject_id
     WHERE p.listed_on_lcx = false AND conv.value_num >= 40 AND (tw.value_json->>'window') IN ('hot','warming')
       AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.project_id = p.id
         AND d.stage IN ('contacted','discovery','proposal','negotiating','won'))
     ORDER BY conv.value_num DESC LIMIT 50`,
  );

  const { rows: pressure } = await pool.query(
    `WITH conv AS (
       SELECT DISTINCT ON (subject_id) subject_id, value_num FROM observations
       WHERE predicate='conviction' ORDER BY subject_id, observed_at DESC)
     SELECT p.id, p.name, COALESCE(conv.value_num,0) AS conviction,
            (SELECT count(*) FROM exchange_listings el WHERE el.project_id = p.id) AS rivals
     FROM projects p
     LEFT JOIN conv ON conv.subject_id = p.id::text
     WHERE p.tier = 'tracked'
       AND p.listed_on_lcx = false
       AND (SELECT count(*) FROM exchange_listings el WHERE el.project_id = p.id) >= 5
       AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.project_id = p.id
         AND d.stage IN ('contacted','discovery','proposal','negotiating','won'))
     ORDER BY rivals DESC LIMIT 50`,
  );

  const inds: Indication[] = [];
  for (const r of ripe as Record<string, unknown>[]) {
    inds.push({
      projectId: r.id as string, name: r.name as string, type: 'ripe_window', severity: 'high',
      conviction: Number(r.conviction ?? 0),
      message: `Ripe listing window — high conviction (${Math.round(Number(r.conviction ?? 0))}) and heating up now.`,
    });
  }
  for (const r of pressure as Record<string, unknown>[]) {
    inds.push({
      projectId: r.id as string, name: r.name as string, type: 'competitive_pressure', severity: 'medium',
      conviction: Number(r.conviction ?? 0),
      message: `Competitive pressure — on ${Number(r.rivals ?? 0)} competitor venues, not on LCX.`,
    });
  }

  // Batch-insert indication signals.
  if (inds.length) {
    const values: unknown[] = [];
    const tuples = inds.map((ind, j) => {
      const b = j * 3;
      values.push(ind.projectId, 'indication', JSON.stringify({
        type: ind.type, severity: ind.severity, message: ind.message, conviction: ind.conviction,
      }));
      return `($${b + 1},$${b + 2},$${b + 3}::jsonb)`;
    });
    await pool.query(`INSERT INTO signals (project_id, kind, payload) VALUES ${tuples.join(',')}`, values);
  }

  return { ripe: ripe.length, pressure: pressure.length };
}

/** Current indications (route context) — newest, strongest first. */
export async function listIndications(limit = 50) {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT s.project_id, p.name, p.ticker, s.payload, s.observed_at
    FROM signals s JOIN projects p ON p.id = s.project_id
    WHERE s.kind='indication'
    ORDER BY CASE (s.payload->>'severity') WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
             (s.payload->>'conviction')::numeric DESC NULLS LAST
    LIMIT ${limit}
  `);
  return (res.rows ?? []).map((r: Record<string, unknown>) => {
    const payload = r.payload as { type?: string; severity?: string; message?: string; conviction?: number };
    return {
      projectId: r.project_id, name: r.name, ticker: r.ticker,
      type: payload.type, severity: payload.severity, message: payload.message,
      conviction: payload.conviction ?? null, observedAt: r.observed_at,
    };
  });
}
