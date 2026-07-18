import type pg from 'pg';
import { confidenceFrom, type Credibility, type Reliability } from '@lcx/shared';
import { DEFAULT_ORG_ID } from './observations.js';

/**
 * Seed the provenance spine from what the platform already knows: turn each
 * project's enrichment columns and latest score into sourced observations. This
 * is the bridge from "system of record" to "provenance spine" — after it runs,
 * every project has a sourced, confidence-tagged picture the inspector can show.
 * Idempotent: clears prior backfilled rows for these predicates before writing.
 */

const BACKFILL_PREDICATES = [
  'market_cap_usd', 'volume_24h_usd', 'price_usd', 'price_change_30d', 'token_age_days',
  'listed_on_lcx', 'propensity_score', 'eu_score', 'us_post_score', 'priority_score', 'band',
];

interface Row {
  subjectId: string;
  predicate: string;
  value: unknown;
  valueNum: number | null;
  unit: string | null;
  source: string;
  reliability: Reliability;
  credibility: Credibility;
  observedAt: Date;
}

const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

export async function backfillObservations(pool: pg.Pool): Promise<{ projects: number; observations: number }> {
  await pool.query(
    `DELETE FROM observations WHERE source IN ('coingecko','internal') AND predicate = ANY($1::text[])`,
    [BACKFILL_PREDICATES],
  );

  const pageSize = 500;
  let offset = 0;
  let projects = 0;
  let observations = 0;

  for (;;) {
    const { rows } = await pool.query(
      `SELECT p.id, p.market_cap_usd, p.volume_24h_usd, p.price_usd, p.price_change_30d,
              p.token_age_days, p.listed_on_lcx, p.last_enriched_at,
              s.propensity_score, s.eu_score, s.us_post_score, s.priority_score, s.band, s.computed_at
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT propensity_score, eu_score, us_post_score, priority_score, band, computed_at
         FROM scores WHERE project_id = p.id ORDER BY computed_at DESC LIMIT 1
       ) s ON true
       ORDER BY p.id LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    if (rows.length === 0) break;

    const batch: Row[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      projects++;
      const id = r.id as string;
      const enrichedAt = r.last_enriched_at ? new Date(r.last_enriched_at as string) : new Date();
      const scoredAt = r.computed_at ? new Date(r.computed_at as string) : new Date();
      const add = (
        predicate: string, value: unknown, valueNum: number | null, unit: string | null,
        source: string, reliability: Reliability, credibility: Credibility, observedAt: Date,
      ) => {
        if (value === null || value === undefined) return;
        batch.push({ subjectId: id, predicate, value, valueNum, unit, source, reliability, credibility, observedAt });
      };

      // Market data — CoinGecko (reliability A, probably-true credibility)
      add('market_cap_usd', num(r.market_cap_usd), num(r.market_cap_usd), 'USD', 'coingecko', 'A', 2, enrichedAt);
      add('volume_24h_usd', num(r.volume_24h_usd), num(r.volume_24h_usd), 'USD', 'coingecko', 'A', 2, enrichedAt);
      add('price_usd', num(r.price_usd), num(r.price_usd), 'USD', 'coingecko', 'A', 2, enrichedAt);
      add('price_change_30d', num(r.price_change_30d), num(r.price_change_30d), '%', 'coingecko', 'A', 2, enrichedAt);
      add('token_age_days', num(r.token_age_days), num(r.token_age_days), 'days', 'coingecko', 'A', 2, enrichedAt);
      add('listed_on_lcx', !!r.listed_on_lcx, r.listed_on_lcx ? 1 : 0, null, 'internal', 'A', 1, enrichedAt);

      // Scores — internal model (reliability B)
      add('propensity_score', num(r.propensity_score), num(r.propensity_score), null, 'internal', 'B', 2, scoredAt);
      add('eu_score', num(r.eu_score), num(r.eu_score), null, 'internal', 'B', 2, scoredAt);
      add('us_post_score', num(r.us_post_score), num(r.us_post_score), null, 'internal', 'B', 2, scoredAt);
      add('priority_score', num(r.priority_score), num(r.priority_score), null, 'internal', 'B', 2, scoredAt);
      if (r.band) add('band', r.band, null, null, 'internal', 'B', 2, scoredAt);
    }

    observations += await insertBatch(pool, batch);
    offset += pageSize;
  }

  return { projects, observations };
}

/** 13 columns per row; chunked to stay well under Postgres' 65535-param cap. */
async function insertBatch(pool: pg.Pool, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const COLS = 13;
  const CHUNK = 800;
  let total = 0;
  const now = Date.now();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = slice.map((r, j) => {
      const b = j * COLS;
      const freshnessDays = Math.max(0, (now - r.observedAt.getTime()) / 86_400_000);
      const confidence = confidenceFrom(r.reliability, r.credibility, freshnessDays);
      values.push(
        DEFAULT_ORG_ID, 'project', r.subjectId, r.predicate,
        JSON.stringify(r.value ?? null), r.valueNum, r.unit,
        r.source, r.reliability, r.credibility, confidence, r.observedAt.toISOString(), null,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::jsonb,$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13})`;
    });
    await pool.query(
      `INSERT INTO observations
         (org_id, subject_type, subject_id, predicate, value_json, value_num, unit,
          source, reliability, credibility, confidence, observed_at, actor)
       VALUES ${tuples.join(',')}`,
      values,
    );
    total += slice.length;
  }
  return total;
}
