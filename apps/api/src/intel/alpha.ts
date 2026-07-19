import type pg from 'pg';
import { sql } from 'drizzle-orm';
import { assess, type Reliability, type SignalBundle } from '@lcx/shared';
import { getDb } from '../db/index.js';
import { insertObservations, type ObservationRow } from './observations.js';

/**
 * Alpha computation — runs the pure @lcx/shared scoring over each project's
 * sourced signals and writes the five composite scores + ACH verdict back as
 * observations, so the predictions themselves carry provenance and rank in SQL.
 * Deterministic + free-tier. A full recompute is idempotent (clears prior alpha
 * rows first).
 */

export const ALPHA_PREDICATES = [
  'listing_propensity', 'timing_window', 'deal_value_usd', 'winnability', 'conviction', 'ach_verdict',
] as const;

const OBS_PREDICATES = [
  'tvl_usd', 'chain_count', 'tvl_change_7d', 'defillama_category',
  'github_commits_30d', 'github_stars', 'team_size', 'dev_status',
];

function relFromConfidence(c: number): Reliability {
  return c >= 80 ? 'A' : c >= 60 ? 'B' : c >= 40 ? 'C' : 'D';
}

export async function computeAlpha(pool: pg.Pool): Promise<{ projects: number; observations: number }> {
  await pool.query(`DELETE FROM observations WHERE predicate = ANY($1::text[])`, [ALPHA_PREDICATES as unknown as string[]]);

  const pageSize = 500;
  let offset = 0;
  let projects = 0;
  let observations = 0;

  for (;;) {
    const { rows: projRows } = await pool.query(
      `SELECT p.id, p.market_cap_usd, p.volume_24h_usd, p.price_change_30d, p.token_age_days,
              p.listed_on_lcx, p.people_count,
              s.eu_score, s.us_post_score, s.propensity_score, s.priority_score, s.recommended_market,
              (SELECT count(*) FROM exchange_listings el WHERE el.project_id = p.id) AS competitor_exchange_count
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT eu_score, us_post_score, propensity_score, priority_score, recommended_market
         FROM scores WHERE project_id = p.id ORDER BY computed_at DESC LIMIT 1
       ) s ON true
       ORDER BY p.id LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    if (projRows.length === 0) break;

    const ids = projRows.map((r: Record<string, unknown>) => r.id as string);
    const { rows: obsRows } = await pool.query(
      `SELECT DISTINCT ON (subject_id, predicate) subject_id, predicate, value_json, value_num, confidence
       FROM observations
       WHERE subject_id = ANY($1::text[]) AND predicate = ANY($2::text[])
       ORDER BY subject_id, predicate, observed_at DESC`,
      [ids, OBS_PREDICATES],
    );

    // group observations by project
    const obsByProject = new Map<string, Record<string, { value: unknown; num: number | null; conf: number }>>();
    for (const o of obsRows as Record<string, unknown>[]) {
      const sid = o.subject_id as string;
      if (!obsByProject.has(sid)) obsByProject.set(sid, {});
      obsByProject.get(sid)![o.predicate as string] = {
        value: o.value_json,
        num: o.value_num != null ? Number(o.value_num) : null,
        conf: Number(o.confidence ?? 0),
      };
    }

    const now = new Date();
    const alphaRows: ObservationRow[] = [];

    for (const r of projRows as Record<string, unknown>[]) {
      projects++;
      const id = r.id as string;
      const o = obsByProject.get(id) ?? {};
      const confs = Object.values(o).map((x) => x.conf).filter((c) => c > 0);
      const dataConfidence = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 40;

      const bundle: SignalBundle = {
        marketCapUsd: r.market_cap_usd != null ? Number(r.market_cap_usd) : null,
        volume24hUsd: r.volume_24h_usd != null ? Number(r.volume_24h_usd) : null,
        priceChange30d: r.price_change_30d != null ? Number(r.price_change_30d) : null,
        tokenAgeDays: r.token_age_days != null ? Number(r.token_age_days) : null,
        tvlUsd: o.tvl_usd?.num ?? null,
        chainCount: o.chain_count?.num ?? null,
        tvlChange7d: o.tvl_change_7d?.num ?? null,
        category: (o.defillama_category?.value as string) ?? null,
        githubCommits30d: o.github_commits_30d?.num ?? null,
        githubStars: o.github_stars?.num ?? null,
        teamSize: o.team_size?.num ?? null,
        devStatus: (o.dev_status?.value as string) ?? null,
        euScore: r.eu_score != null ? Number(r.eu_score) : null,
        usPostScore: r.us_post_score != null ? Number(r.us_post_score) : null,
        propensityScore: r.propensity_score != null ? Number(r.propensity_score) : null,
        priorityScore: r.priority_score != null ? Number(r.priority_score) : null,
        listedOnLcx: !!r.listed_on_lcx,
        competitorExchangeCount: r.competitor_exchange_count != null ? Number(r.competitor_exchange_count) : 0,
        recommendedMarket: (r.recommended_market as string) ?? null,
        contactCount: r.people_count != null ? Number(r.people_count) : 0,
        dataConfidence,
      };

      const a = assess(bundle);
      const add = (predicate: string, value: unknown, valueNum: number | null, conf: number) => {
        alphaRows.push({
          subjectType: 'project', subjectId: id, predicate, value, valueNum, unit: null,
          source: 'internal', reliability: relFromConfidence(conf), credibility: 2, observedAt: now,
        });
      };
      add('listing_propensity', a.propensity, a.propensity.score, a.propensity.confidence);
      add('timing_window', a.timing, a.timing.score, a.timing.confidence);
      add('deal_value_usd', a.value, a.value.usd, a.value.confidence);
      add('winnability', a.winnability, a.winnability.score, a.winnability.confidence);
      add('conviction', a.conviction, a.conviction.score, a.conviction.confidence);
      add('ach_verdict', a.ach, null, a.ach.confidence);
    }

    observations += await insertObservations(pool, alphaRows);
    offset += pageSize;
  }

  return { projects, observations };
}

/* ── Read side (route context / getDb) ────────────────────────────── */

async function latestAlpha(subjectId: string): Promise<Record<string, { value: unknown; num: number | null }>> {
  const db = getDb();
  // Fetch the latest observation per predicate for this one subject and pick the
  // alpha predicates in JS. (Avoids `= ANY(<array>)`, which drizzle's sql
  // template expands to a tuple `($2,$3,…)` that Postgres rejects for ANY.)
  const res = await db.execute(sql`
    SELECT DISTINCT ON (predicate) predicate, value_json, value_num
    FROM observations
    WHERE subject_type='project' AND subject_id=${subjectId}
    ORDER BY predicate, observed_at DESC
  `);
  const alpha = new Set<string>(ALPHA_PREDICATES);
  const out: Record<string, { value: unknown; num: number | null }> = {};
  for (const r of (res.rows ?? []) as Record<string, unknown>[]) {
    const pred = r.predicate as string;
    if (alpha.has(pred)) out[pred] = { value: r.value_json, num: r.value_num != null ? Number(r.value_num) : null };
  }
  return out;
}

/** The full assessment for one project (inspector Assessment block). */
export async function getAssessment(subjectId: string) {
  const a = await latestAlpha(subjectId);
  if (Object.keys(a).length === 0) return null;
  return {
    propensity: a.listing_propensity?.value ?? null,
    timing: a.timing_window?.value ?? null,
    value: a.deal_value_usd?.value ?? null,
    winnability: a.winnability?.value ?? null,
    conviction: a.conviction?.value ?? null,
    ach: a.ach_verdict?.value ?? null,
  };
}

export interface TargetRow {
  id: string;
  name: string;
  ticker: string | null;
  conviction: number;
  timingScore: number | null;
  timingWindow: string | null;
  dealValueUsd: number | null;
  winnability: number | null;
  achVerdict: string | null;
  competitorCount: number;
  contactCount: number;
  drivers: unknown;
}

/** The ripe-now target list — ranked by conviction, excluding listed + active deals. */
export async function listTargets(limit = 25, minConviction = 0): Promise<TargetRow[]> {
  const db = getDb();
  // Rank first, enrich second. `ranked` applies every filter and the LIMIT using
  // only the conviction CTE + projects, so the four per-predicate LATERAL lookups
  // (and the competitor count) run for at most `limit` rows — not the whole
  // ~8k-project universe. Backed by the observations (subject_id, predicate,
  // observed_at DESC) index, this took the endpoint from ~25s to sub-second.
  // Every predicate here is project-scoped, so pinning subject_type='project'
  // lets even the existing idx_obs_pred (subject_type, subject_id, predicate,
  // observed_at) serve these lookups — the speedup lands on a plain code deploy,
  // no migration required (0032's indexes make it optimal but aren't a hard dep).
  const res = await db.execute(sql`
    WITH conv AS (
      SELECT DISTINCT ON (subject_id) subject_id, value_num, value_json
      FROM observations WHERE subject_type='project' AND predicate='conviction'
      ORDER BY subject_id, observed_at DESC
    ),
    ranked AS (
      SELECT conv.subject_id,
             conv.value_num AS conviction, conv.value_json AS conviction_json,
             p.id AS pid, p.name, p.ticker, p.people_count
      FROM conv
      JOIN projects p ON p.id::text = conv.subject_id
      WHERE p.listed_on_lcx = false
        AND conv.value_num >= ${minConviction}
        AND NOT EXISTS (
          SELECT 1 FROM deals d WHERE d.project_id = p.id
          AND d.stage IN ('contacted','discovery','proposal','negotiating','won')
        )
      ORDER BY conv.value_num DESC NULLS LAST
      LIMIT ${limit}
    )
    SELECT r.pid AS id, r.name, r.ticker, r.people_count,
           r.conviction, r.conviction_json,
           tw.value_num AS timing_score, tw.value_json AS timing_json,
           dv.value_num AS deal_value, win.value_num AS winnability, ach.value_json AS ach_json,
           (SELECT count(*) FROM exchange_listings el WHERE el.project_id = r.pid) AS competitor_count
    FROM ranked r
    LEFT JOIN LATERAL (SELECT value_num, value_json FROM observations WHERE subject_type='project' AND subject_id=r.subject_id AND predicate='timing_window' ORDER BY observed_at DESC LIMIT 1) tw ON true
    LEFT JOIN LATERAL (SELECT value_num FROM observations WHERE subject_type='project' AND subject_id=r.subject_id AND predicate='deal_value_usd' ORDER BY observed_at DESC LIMIT 1) dv ON true
    LEFT JOIN LATERAL (SELECT value_num FROM observations WHERE subject_type='project' AND subject_id=r.subject_id AND predicate='winnability' ORDER BY observed_at DESC LIMIT 1) win ON true
    LEFT JOIN LATERAL (SELECT value_json FROM observations WHERE subject_type='project' AND subject_id=r.subject_id AND predicate='ach_verdict' ORDER BY observed_at DESC LIMIT 1) ach ON true
    ORDER BY r.conviction DESC NULLS LAST
  `);
  return (res.rows ?? []).map((r: Record<string, unknown>) => {
    const timingJson = r.timing_json as { window?: string } | null;
    const achJson = r.ach_json as { verdict?: string } | null;
    const convJson = r.conviction_json as { drivers?: unknown } | null;
    return {
      id: r.id as string,
      name: r.name as string,
      ticker: (r.ticker as string | null) ?? null,
      conviction: Number(r.conviction ?? 0),
      timingScore: r.timing_score != null ? Number(r.timing_score) : null,
      timingWindow: timingJson?.window ?? null,
      dealValueUsd: r.deal_value != null ? Number(r.deal_value) : null,
      winnability: r.winnability != null ? Number(r.winnability) : null,
      achVerdict: achJson?.verdict ?? null,
      competitorCount: Number(r.competitor_count ?? 0),
      contactCount: Number(r.people_count ?? 0),
      drivers: convJson?.drivers ?? [],
    };
  });
}
