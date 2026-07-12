/**
 * 4-5 — A/B testing for outreach.
 *
 * Deterministic variant assignment (hash of test + sequence), outcome recording,
 * and a two-proportion z-test for significance. All math is deterministic — no
 * RNG — so results are reproducible.
 */
import { sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export interface AbTest {
  id: string;
  name: string;
  variants: string[];
  metric: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

function mapTest(r: Record<string, unknown>): AbTest {
  const raw = r.variants;
  const variants = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? (JSON.parse(raw) as string[])
      : [];
  return {
    id: String(r.id),
    name: String(r.name),
    variants,
    metric: String(r.metric ?? 'reply_rate'),
    status: String(r.status ?? 'running'),
    createdAt: (r.created_at as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

export async function listTests(): Promise<AbTest[]> {
  const db = getDb();
  const res = await db.execute(sql`SELECT * FROM ab_tests ORDER BY created_at DESC`);
  return (res.rows ?? []).map((r) => mapTest(r as Record<string, unknown>));
}

export async function getTest(id: string): Promise<AbTest | null> {
  const db = getDb();
  const res = await db.execute(sql`SELECT * FROM ab_tests WHERE id = ${id} LIMIT 1`);
  const row = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
  return row ? mapTest(row) : null;
}

export async function createTest(input: {
  name: string;
  variants: string[];
  metric?: string;
}): Promise<AbTest> {
  const db = getDb();
  const id = randomUUID();
  const variants = (input.variants ?? []).map((v) => String(v)).filter(Boolean);
  const metric = input.metric?.trim() || 'reply_rate';
  const res = await db.execute(sql`
    INSERT INTO ab_tests (id, name, variants, metric, status)
    VALUES (${id}, ${input.name}, ${JSON.stringify(variants)}::jsonb, ${metric}, 'running')
    RETURNING *
  `);
  return mapTest((res.rows ?? [])[0] as Record<string, unknown>);
}

/**
 * Deterministically assign a sequence to a variant. The same (test, sequence)
 * pair always maps to the same variant; assignment is persisted (idempotent).
 */
export async function assignVariant(testId: string, sequenceId: string): Promise<string | null> {
  const db = getDb();
  const test = await getTest(testId);
  if (!test || test.variants.length === 0) return null;

  const digest = createHash('sha256').update(`${testId}:${sequenceId}`).digest();
  // First 4 bytes → unsigned int → modulo variant count.
  const bucket = digest.readUInt32BE(0) % test.variants.length;
  const variant = test.variants[bucket];

  await db.execute(sql`
    INSERT INTO ab_assignments (id, test_id, sequence_id, variant)
    VALUES (${randomUUID()}, ${testId}, ${sequenceId}, ${variant})
    ON CONFLICT (test_id, sequence_id) DO NOTHING
  `);

  // Return the persisted variant (a prior assignment wins over a re-hash).
  const res = await db.execute(sql`
    SELECT variant FROM ab_assignments WHERE test_id = ${testId} AND sequence_id = ${sequenceId} LIMIT 1
  `);
  const row = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
  return row ? String(row.variant) : variant;
}

/** Record whether a sequence hit the test's success metric. */
export async function recordOutcome(
  testId: string,
  sequenceId: string,
  converted: boolean,
): Promise<boolean> {
  const db = getDb();
  const res = await db.execute(sql`
    UPDATE ab_assignments
    SET outcome = ${converted}, recorded_at = NOW()
    WHERE test_id = ${testId} AND sequence_id = ${sequenceId}
    RETURNING id
  `);
  return (res.rows ?? []).length > 0;
}

export interface VariantStat {
  variant: string;
  assigned: number;
  converted: number;
  rate: number;
}

export interface SignificanceResult {
  metric: string;
  variants: VariantStat[];
  comparison: {
    a: string;
    b: string;
    rateA: number;
    rateB: number;
    lift: number; // (rateB - rateA) / rateA
    z: number;
    pValue: number;
    significant: boolean; // p < 0.05
    winner: string | null;
  } | null;
}

// Abramowitz-Stegun erf approximation → normal CDF. Deterministic.
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Two-proportion z-test over the first two variants (the primary A/B compare).
 * Deterministic. Returns per-variant stats plus the significance verdict.
 */
export async function computeSignificance(testId: string): Promise<SignificanceResult | null> {
  const db = getDb();
  const test = await getTest(testId);
  if (!test) return null;

  const res = await db.execute(sql`
    SELECT variant,
           COUNT(*) AS assigned,
           COUNT(*) FILTER (WHERE outcome IS TRUE) AS converted
    FROM ab_assignments
    WHERE test_id = ${testId}
    GROUP BY variant
  `);
  const byVariant = new Map<string, { assigned: number; converted: number }>();
  for (const row of res.rows ?? []) {
    const r = row as Record<string, unknown>;
    byVariant.set(String(r.variant), {
      assigned: Number(r.assigned ?? 0),
      converted: Number(r.converted ?? 0),
    });
  }

  // Report every declared variant, even ones with no assignments yet.
  const variants: VariantStat[] = test.variants.map((v) => {
    const s = byVariant.get(v) ?? { assigned: 0, converted: 0 };
    return {
      variant: v,
      assigned: s.assigned,
      converted: s.converted,
      rate: s.assigned > 0 ? s.converted / s.assigned : 0,
    };
  });

  let comparison: SignificanceResult['comparison'] = null;
  if (variants.length >= 2) {
    const [A, B] = variants;
    const nA = A.assigned;
    const nB = B.assigned;
    if (nA > 0 && nB > 0) {
      const pA = A.converted / nA;
      const pB = B.converted / nB;
      const pPool = (A.converted + B.converted) / (nA + nB);
      const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
      const z = se > 0 ? (pB - pA) / se : 0;
      const pValue = 2 * (1 - normCdf(Math.abs(z)));
      const significant = pValue < 0.05;
      comparison = {
        a: A.variant,
        b: B.variant,
        rateA: pA,
        rateB: pB,
        lift: pA > 0 ? (pB - pA) / pA : 0,
        z,
        pValue,
        significant,
        winner: significant ? (pB > pA ? B.variant : A.variant) : null,
      };
    }
  }

  return { metric: test.metric, variants, comparison };
}
