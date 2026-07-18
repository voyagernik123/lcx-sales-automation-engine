import { sql } from 'drizzle-orm';
import type pg from 'pg';
import {
  confidenceFrom,
  getSource,
  type Credibility,
  type Observation,
  type Reliability,
} from '@lcx/shared';
import { getDb } from '../db/index.js';

/** The fixed id of the default LCX org (see migration 0029). */
export const DEFAULT_ORG_ID = '11111111-1111-1111-1111-111111111111';

export interface RecordObservationInput {
  subjectType: string;
  subjectId: string;
  predicate: string;
  value: unknown;
  valueNum?: number | null;
  unit?: string | null;
  source: string;
  sourceUrl?: string | null;
  reliability?: Reliability;
  credibility?: Credibility;
  observedAt?: Date;
  jobRunId?: string | null;
  actor?: string | null;
}

/** Coerce a possibly-numeric value into a numeric column value (or null). */
function toNum(value: unknown, explicit?: number | null): number | null {
  if (explicit !== undefined) return explicit;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function mapObservation(r: Record<string, unknown>): Observation {
  return {
    id: r.id as string,
    subjectType: r.subject_type as string,
    subjectId: r.subject_id as string,
    predicate: r.predicate as string,
    value: r.value_json,
    valueNum: r.value_num != null ? Number(r.value_num) : null,
    unit: (r.unit as string | null) ?? null,
    source: r.source as string,
    sourceUrl: (r.source_url as string | null) ?? null,
    reliability: (r.reliability as Reliability) ?? 'C',
    credibility: (Number(r.credibility ?? 3) as Credibility),
    confidence: Number(r.confidence ?? 0),
    observedAt: r.observed_at as string,
    collectedAt: r.collected_at as string,
    actor: (r.actor as string | null) ?? null,
  };
}

/**
 * Write a sourced fact. Confidence is derived from reliability × credibility ×
 * freshness so callers only supply the raw signal, never a hand-tuned number.
 */
export async function recordObservation(input: RecordObservationInput): Promise<string> {
  const db = getDb();
  const src = getSource(input.source);
  const reliability = input.reliability ?? src.defaultReliability;
  const credibility: Credibility = input.credibility ?? 2;
  const observedAt = input.observedAt ?? new Date();
  const freshnessDays = Math.max(0, (Date.now() - observedAt.getTime()) / 86_400_000);
  const confidence = confidenceFrom(reliability, credibility, freshnessDays);
  const valueNum = toNum(input.value, input.valueNum);

  const res = await db.execute(sql`
    INSERT INTO observations
      (org_id, subject_type, subject_id, predicate, value_json, value_num, unit,
       source, source_url, reliability, credibility, confidence, observed_at, job_run_id, actor)
    VALUES
      (${DEFAULT_ORG_ID}, ${input.subjectType}, ${input.subjectId}, ${input.predicate},
       ${JSON.stringify(input.value ?? null)}::jsonb, ${valueNum}, ${input.unit ?? null},
       ${input.source}, ${input.sourceUrl ?? null}, ${reliability}, ${credibility}, ${confidence},
       ${observedAt.toISOString()}, ${input.jobRunId ?? null}, ${input.actor ?? null})
    RETURNING id
  `);
  return res.rows![0].id as string;
}

export interface ObservationRow {
  subjectType: string;
  subjectId: string;
  predicate: string;
  value: unknown;
  valueNum?: number | null;
  unit?: string | null;
  source: string;
  sourceUrl?: string | null;
  reliability: Reliability;
  credibility: Credibility;
  observedAt: Date;
  jobRunId?: string | null;
  actor?: string | null;
}

/**
 * Batched pool-based observation writer for connectors/jobs — chunked to stay
 * under Postgres' 65535-param cap. Confidence is derived per row (same rule as
 * recordObservation) so connectors never hand-tune it.
 */
export async function insertObservations(pool: pg.Pool, rows: ObservationRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const COLS = 14;
  const CHUNK = 700;
  const now = Date.now();
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = slice.map((r, j) => {
      const b = j * COLS;
      const freshnessDays = Math.max(0, (now - r.observedAt.getTime()) / 86_400_000);
      const confidence = confidenceFrom(r.reliability, r.credibility, freshnessDays);
      const valueNum =
        r.valueNum !== undefined
          ? r.valueNum
          : typeof r.value === 'number' && Number.isFinite(r.value)
            ? r.value
            : null;
      values.push(
        DEFAULT_ORG_ID, r.subjectType, r.subjectId, r.predicate,
        JSON.stringify(r.value ?? null), valueNum, r.unit ?? null,
        r.source, r.sourceUrl ?? null, r.reliability, r.credibility, confidence,
        r.observedAt.toISOString(), r.jobRunId ?? null,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::jsonb,$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14})`;
    });
    await pool.query(
      `INSERT INTO observations
         (org_id, subject_type, subject_id, predicate, value_json, value_num, unit,
          source, source_url, reliability, credibility, confidence, observed_at, job_run_id)
       VALUES ${tuples.join(',')}`,
      values,
    );
    total += slice.length;
  }
  return total;
}

/** Latest observation per predicate for an object — the current sourced picture. */
export async function listObservations(
  subjectType: string,
  subjectId: string,
  limit = 100,
): Promise<Observation[]> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT DISTINCT ON (predicate)
      id, subject_type, subject_id, predicate, value_json, value_num, unit,
      source, source_url, reliability, credibility, confidence, observed_at, collected_at, actor
    FROM observations
    WHERE subject_type = ${subjectType} AND subject_id = ${subjectId}
    ORDER BY predicate, observed_at DESC
    LIMIT ${limit}
  `);
  return (res.rows ?? []).map((r) => mapObservation(r as Record<string, unknown>));
}
