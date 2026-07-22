import type pg from 'pg';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

/**
 * Indications & Warning (v2, Phase 2.5) — the standing watch, as named indicator
 * SETS with a status (quiet → warming → firing) rather than flat alerts. Each
 * indicator answers a Priority Intelligence Requirement:
 *   • listing_readiness   — ripe listing window (conviction + hot timing)
 *   • competitive_pressure — listed elsewhere, not on LCX
 *   • regulatory_heat      — recent regulator/MiCA news mentions (LCX's edge)
 * Idempotent: clears the prior scan's indications first.
 */

export type IndicatorSet = 'listing_readiness' | 'competitive_pressure' | 'regulatory_heat';
export type IndicatorStatus = 'quiet' | 'warming' | 'firing';

export interface Indication {
  projectId: string;
  name: string;
  type: IndicatorSet;
  indicatorSet: IndicatorSet;
  status: IndicatorStatus;
  severity: 'high' | 'medium';
  message: string;
  conviction: number;
}

export async function scanIndications(pool: pg.Pool): Promise<{ ripe: number; pressure: number; regulatory: number }> {
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

  // Regulatory heat (Phase 2.5) — recent regulator/MiCA news naming the token.
  const { rows: regulatory } = await pool.query(
    `SELECT p.id, p.name, count(*) AS hits
     FROM projects p
     JOIN market_news mn ON p.id = ANY(mn.matched_project_ids)
     WHERE p.tier = 'tracked'
       AND mn.source IN ('sec','sec-litigation','esma','gnews-sec','gnews-mica')
       AND mn.published_at > NOW() - INTERVAL '30 days'
     GROUP BY p.id, p.name HAVING count(*) >= 1
     ORDER BY count(*) DESC LIMIT 50`,
  );

  const inds: Indication[] = [];
  for (const r of ripe as Record<string, unknown>[]) {
    const conv = Number(r.conviction ?? 0);
    inds.push({
      projectId: r.id as string, name: r.name as string,
      type: 'listing_readiness', indicatorSet: 'listing_readiness',
      status: conv >= 60 ? 'firing' : 'warming', severity: 'high', conviction: conv,
      message: `Ripe listing window — conviction ${Math.round(conv)} and heating up now.`,
    });
  }
  for (const r of pressure as Record<string, unknown>[]) {
    const rivals = Number(r.rivals ?? 0);
    inds.push({
      projectId: r.id as string, name: r.name as string,
      type: 'competitive_pressure', indicatorSet: 'competitive_pressure',
      status: rivals >= 8 ? 'firing' : 'warming', severity: 'medium', conviction: Number(r.conviction ?? 0),
      message: `Competitive pressure — on ${rivals} competitor venues, not on LCX.`,
    });
  }
  for (const r of regulatory as Record<string, unknown>[]) {
    const hits = Number(r.hits ?? 0);
    inds.push({
      projectId: r.id as string, name: r.name as string,
      type: 'regulatory_heat', indicatorSet: 'regulatory_heat',
      status: hits >= 3 ? 'firing' : 'warming', severity: hits >= 3 ? 'high' : 'medium', conviction: 0,
      message: `Regulatory heat — ${hits} regulator/MiCA mention${hits === 1 ? '' : 's'} in 30 days.`,
    });
  }

  // Batch-insert indication signals.
  if (inds.length) {
    const values: unknown[] = [];
    const tuples = inds.map((ind, j) => {
      const b = j * 3;
      values.push(ind.projectId, 'indication', JSON.stringify({
        type: ind.type, indicatorSet: ind.indicatorSet, status: ind.status,
        severity: ind.severity, message: ind.message, conviction: ind.conviction,
      }));
      return `($${b + 1},$${b + 2},$${b + 3}::jsonb)`;
    });
    await pool.query(`INSERT INTO signals (project_id, kind, payload) VALUES ${tuples.join(',')}`, values);
  }

  return { ripe: ripe.length, pressure: pressure.length, regulatory: regulatory.length };
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
    const payload = r.payload as { type?: string; indicatorSet?: string; status?: string; severity?: string; message?: string; conviction?: number };
    return {
      projectId: r.project_id, name: r.name, ticker: r.ticker,
      type: payload.type, indicatorSet: payload.indicatorSet ?? payload.type,
      status: payload.status ?? 'warming',
      severity: payload.severity, message: payload.message,
      conviction: payload.conviction ?? null, observedAt: r.observed_at,
    };
  });
}
