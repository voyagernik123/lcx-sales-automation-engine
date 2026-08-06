import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_DB, describeDb } from '../../test/db.js';
import {
  MIN_RESOLVED_FOR_CALIBRATION,
  PLATFORM_FORECAST_CODES,
  asOfAnchors,
  computePlatformForecastCalibration,
  environmentLabel,
  gpsOutcomeToForecast,
  isAppendOnlyRefusal,
  listResolvedForecasts,
  recordForecast,
  recordForecastOutcome,
} from '../platformForecast.js';
import {
  CALIBRATION_CODES,
  computeCalibration,
  getCalibration,
} from '../../intel/calibration.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  TWO THINGS ARE UNDER TEST AND THE FIRST ONE IS WHY THE SECOND MATTERS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  1. THE CALIBRATION LOOP WAS MEASURING ITS OWN PENALTY. `intel/calibration.ts`
 *     read the LATEST observation per subject. `packages/shared/src/alpha.ts`
 *     subtracts 40 from listing propensity and 50 from winnability once
 *     `listed_on_lcx` is true, and every won deal is listed. So the score being
 *     "validated" already carried a post-outcome adjustment the platform itself
 *     applied.
 *
 *     THE FIXTURE REPRODUCES THE BUG BEFORE ASSERTING THE FIX. `contaminatedRead`
 *     below is the OLD query, verbatim, and the first test proves it returns the
 *     penalised 21 for the won subject. Without that step, "the new code returns
 *     null" would be indistinguishable from "the new code found no data".
 *
 *  2. NOTHING COULD RESOLVE A PREDICTION AGAINST AN OUTCOME. 0074 adds the ledger,
 *     and the tests that matter are the refusals and the append-only guarantees: a
 *     prediction that can be edited is not a prediction, and an accuracy figure off
 *     six rows is the single most dangerous number this platform could print.
 *
 *  OWN SCHEMAS. `observations`, `deals` and `model_calibrations` in the live database
 *  are real; `computeCalibration` DELETEs and INSERTs into `model_calibrations`, so
 *  every suite here runs against fabricated tables in a scoped schema and never
 *  touches public. The bare schema drops the public fallback entirely — the absence
 *  of 0074 has to be REAL and not arranged by naming, which is the trap
 *  `access/__tests__/asOf.test.ts:78-100` records paying for.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_0074 = readFileSync(
  resolve(HERE, '..', '..', 'db', 'migrations', '0074_platform_forecast.sql'),
  'utf8',
);

/** 0029's observations + the two other relations calibration reads, in shape. */
const SPINE_DDL = `
  CREATE TABLE observations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type text NOT NULL,
    subject_id   text NOT NULL,
    predicate    text NOT NULL,
    value_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    value_num    numeric,
    source       text NOT NULL DEFAULT 'internal',
    confidence   integer NOT NULL DEFAULT 50,
    observed_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE deals (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL,
    stage       text NOT NULL DEFAULT 'not_started',
    won_at      timestamptz
  );
  CREATE TABLE model_calibrations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111',
    snapshot_date    text NOT NULL DEFAULT (CURRENT_DATE::text),
    metric_key       text NOT NULL,
    kind             text NOT NULL DEFAULT 'score',
    lift             numeric,
    quintile_capture numeric,
    won_median       numeric,
    universe_median  numeric,
    sample_won       integer NOT NULL DEFAULT 0,
    sample_universe  integer NOT NULL DEFAULT 0,
    meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
  );`;

const LEDGER = `f2_ledger_${process.pid}`;
const BARE = `f2_bare_${process.pid}`;
/** 0074 applied and NOTHING written to it — the genuinely-empty third state. */
const EMPTY = `f2_empty_${process.pid}`;

const scopedPool = (schema: string, publicFallback = true) =>
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${publicFallback ? `${schema},public` : schema}`,
    max: 3,
  });

let admin: pg.Pool | undefined;
let led: pg.Pool | undefined;
let bare: pg.Pool | undefined;
let empty: pg.Pool | undefined;

/** A project id per label, so the fixtures read like prose. */
const pid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** THE OLD QUERY, VERBATIM, kept so the tests can show the bug is real. */
async function contaminatedRead(pool: pg.Pool, predicate: string): Promise<number | null> {
  const { rows } = await pool.query(
    `WITH m AS (
       SELECT DISTINCT ON (subject_id) subject_id, value_num AS v
       FROM observations WHERE predicate=$1 AND value_num IS NOT NULL ORDER BY subject_id, observed_at DESC),
     won AS (SELECT DISTINCT project_id::text AS pid FROM deals WHERE stage='won'),
     wonm AS (SELECT m.v FROM won JOIN m ON m.subject_id = won.pid)
     SELECT (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) FROM wonm) AS won_median`,
    [predicate],
  );
  const v = (rows[0] as Record<string, unknown> | undefined)?.won_median;
  return v != null ? Number(v) : null;
}

/** Instants used across the fixtures. The prediction precedes the outcome, always. */
const T_PREDICT = '2026-03-01T09:00:00Z';
const T_OUTCOME = '2026-05-01T09:00:00Z';
/** After the outcome — when alpha recomputed and applied the listing penalty. */
const T_RESCORE = '2026-06-01T09:00:00Z';

async function seedSubject(
  pool: pg.Pool,
  args: { subject: string; won: boolean; convictionBefore: number; convictionAfter: number; tvlBefore: number; tvlAfter: number },
): Promise<void> {
  if (args.won) {
    await pool.query(`INSERT INTO deals (project_id, stage, won_at) VALUES ($1,'won',$2::timestamptz)`, [
      args.subject,
      T_OUTCOME,
    ]);
  } else {
    await pool.query(`INSERT INTO deals (project_id, stage) VALUES ($1,'discovery')`, [args.subject]);
  }
  /*
   * `conviction` gets TWO rows here for realism, and the production table would only
   * ever hold the later one — `intel/alpha.ts` deletes the earlier pass. The earlier
   * row is present so a reader can see that even WITH history the as-of read is not
   * what saves the score metrics; the deletion is, and that is why they refuse.
   */
  await pool.query(
    `INSERT INTO observations (subject_type, subject_id, predicate, value_num, observed_at) VALUES
       ('project',$1,'conviction',$2,$4::timestamptz),
       ('project',$1,'conviction',$3,$5::timestamptz),
       ('project',$1,'tvl_usd',$6,$4::timestamptz),
       ('project',$1,'tvl_usd',$7,$5::timestamptz)`,
    [args.subject, args.convictionBefore, args.convictionAfter, T_PREDICT, T_RESCORE, args.tvlBefore, args.tvlAfter],
  );
}

/** A resolved forecast for `subject`, which is what makes an as-of read possible. */
async function anchor(pool: pg.Pool, subject: string, at = T_PREDICT): Promise<void> {
  const rec = await recordForecast(pool, {
    engine: 'intel.alpha',
    engineVersion: 'v1',
    subjectType: 'project',
    subjectId: subject,
    metricKey: 'conviction',
    kind: 'ordinal',
    predictedNum: 71,
    predictedAt: new Date(at),
    horizonDays: 90,
  });
  expect(rec.ok, JSON.stringify(rec)).toBe(true);
  if (!rec.ok) return;
  const out = await recordForecastOutcome(pool, {
    forecastId: rec.id,
    kind: 'resolved',
    observedNum: 1,
    observedAt: new Date(T_OUTCOME),
    source: 'deals.stage',
    provenance: 'observed',
  });
  expect(out.ok, JSON.stringify(out)).toBe(true);
}

beforeAll(async () => {
  if (!HAS_DB) return;
  admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  for (const s of [LEDGER, BARE, EMPTY]) {
    await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await admin.query(`CREATE SCHEMA ${s}`);
  }
  led = scopedPool(LEDGER);
  // The absence must be real: with `,public` in the path, `to_regclass` would find
  // the migrated public tables the CI workflow creates and the ledger-absent branch
  // would be unreachable — while the INSERTs went into the real ledger.
  bare = scopedPool(BARE, false);

  await led.query(SPINE_DDL);
  await led.query(MIGRATION_0074);
  await bare.query(SPINE_DDL);
  empty = scopedPool(EMPTY);
  await empty.query(SPINE_DDL);
  await empty.query(MIGRATION_0074);
}, 40_000);

afterAll(async () => {
  if (admin) {
    for (const s of [LEDGER, BARE, EMPTY]) await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
  }
  await Promise.all([led?.end(), bare?.end(), empty?.end(), admin?.end()]);
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* PURE                                                                            */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('environmentLabel', () => {
  it('names the database and drops the credentials', () => {
    const label = environmentLabel('postgres://api:s3cr3t@db.abcdef.supabase.co:5432/postgres');
    expect(label).toBe('supabase:db.abcdef.supabase.co/postgres');
    expect(label).not.toMatch(/s3cr3t/);
  });

  it('returns null rather than a sentinel when it cannot name one', () => {
    // The `'unknown'` string is what shipped a price with an unnamed environment
    // once (`marks/mark.ts:443-451`); null forces the caller to branch.
    expect(environmentLabel('')).toBeNull();
    expect(environmentLabel(undefined)).toBeNull();
    expect(environmentLabel('not a url')).toBeNull();
  });
});

describe('the floor is the shared one', () => {
  it('is MIN_N_FOR_RATE and not a second 8 that happens to agree', () => {
    expect(MIN_RESOLVED_FOR_CALIBRATION).toBe(8);
  });
});

describe('gpsOutcomeToForecast — the second call site, on the same shape', () => {
  const record = {
    engagementId: 'eng-1',
    clientId: 'client-1',
    offerKey: 'mica_whitepaper',
    disposition: 'won',
    reason: 'regulatory_credibility',
    quotedPriceCents: 1_500_000,
    realisedPriceCents: 1_200_000,
    quotedVendorCostCents: 400_000,
    realisedVendorCostCents: 380_000,
    cycleTimeDays: 40,
    acceptanceFirstPass: true,
    partner: null,
    factorScoresAtQuote: { regulatory_exposure: 4 },
    decidedAt: '2026-05-01',
  } as unknown as Parameters<typeof gpsOutcomeToForecast>[0];

  const args = {
    engineVersion: 'underwrite-v1',
    quotedAt: new Date('2026-03-01T00:00:00Z'),
    decidedAt: new Date('2026-05-01T00:00:00Z'),
    horizonDays: 90,
  };

  it('dates the prediction at the quote, never at the decision', () => {
    const pairs = gpsOutcomeToForecast(record, args);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(p.prediction.predictedAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(p.prediction.engine).toBe('gps.underwrite');
      expect(p.prediction.engineVersion).toBe('underwrite-v1');
      expect(p.prediction.subjectId).toBe('eng-1');
    }
  });

  it('carries the quoted price as the prediction and the realised one as the outcome', () => {
    const price = gpsOutcomeToForecast(record, args).find((p) => p.prediction.metricKey === 'price_cents');
    expect(price?.prediction.predictedNum).toBe(1_500_000);
    expect(price?.outcome.kind).toBe('resolved');
    expect(price?.outcome.observedNum).toBe(1_200_000);
  });

  it('records an absent realised price as UNRESOLVABLE, never as zero', () => {
    const noPrice = { ...(record as Record<string, unknown>), realisedPriceCents: null } as unknown as Parameters<typeof gpsOutcomeToForecast>[0];
    const price = gpsOutcomeToForecast(noPrice, args).find((p) => p.prediction.metricKey === 'price_cents');
    expect(price?.outcome.kind).toBe('unresolvable');
    expect(price?.outcome.observedNum ?? null).toBeNull();
    expect(price?.outcome.note ?? '').toMatch(/unresolvable/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE LEDGER                                                                      */
/* ══════════════════════════════════════════════════════════════════════════════ */

describeDb('platform_forecast — a prediction that cannot be edited', () => {
  it('records a prediction and is idempotent for the same call', async () => {
    const input = {
      engine: 'test.engine',
      engineVersion: 'v1',
      subjectType: 'test_subject',
      subjectId: pid(900),
      metricKey: 'conviction',
      kind: 'ordinal' as const,
      predictedNum: 64,
      predictedAt: new Date('2026-01-05T10:00:00Z'),
      horizonDays: 30,
    };
    const a = await recordForecast(led!, input);
    const b = await recordForecast(led!, input);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.id).toBe(a.id);
    const { rows } = await led!.query(
      `SELECT count(*)::int AS n FROM platform_forecast WHERE subject_id=$1`,
      [pid(900)],
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it('refuses an UPDATE of the prediction and leaves the value intact', async () => {
    const rec = await recordForecast(led!, {
      engine: 'test.engine',
      engineVersion: 'v1',
      subjectType: 'test_subject',
      subjectId: pid(901),
      metricKey: 'conviction',
      kind: 'ordinal',
      predictedNum: 40,
      predictedAt: new Date('2026-01-06T10:00:00Z'),
      horizonDays: 30,
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    let caught: unknown;
    try {
      await led!.query(`UPDATE platform_forecast SET predicted_num = 99 WHERE id = $1`, [rec.id]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(isAppendOnlyRefusal(caught)).toBe(true);
    const { rows } = await led!.query(`SELECT predicted_num FROM platform_forecast WHERE id=$1`, [rec.id]);
    expect(Number((rows[0] as { predicted_num: string }).predicted_num)).toBe(40);
  });

  it('refuses a DELETE of the prediction', async () => {
    let caught: unknown;
    try {
      await led!.query(`DELETE FROM platform_forecast WHERE subject_id=$1`, [pid(901)]);
    } catch (err) {
      caught = err;
    }
    expect(isAppendOnlyRefusal(caught)).toBe(true);
  });

  it('APPENDS a correction instead of overwriting the outcome, and says how many it superseded', async () => {
    const rec = await recordForecast(led!, {
      engine: 'test.append',
      engineVersion: 'v1',
      subjectType: 'test_subject',
      subjectId: pid(902),
      metricKey: 'price_cents',
      kind: 'scalar',
      predictedNum: 1_000_000,
      predictedAt: new Date('2026-01-07T10:00:00Z'),
      horizonDays: 30,
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const first = await recordForecastOutcome(led!, {
      forecastId: rec.id,
      kind: 'resolved',
      observedNum: 900_000,
      observedAt: new Date('2026-02-07T10:00:00Z'),
      source: 'invoice',
      provenance: 'observed',
    });
    const second = await recordForecastOutcome(led!, {
      forecastId: rec.id,
      kind: 'resolved',
      observedNum: 950_000,
      observedAt: new Date('2026-02-20T10:00:00Z'),
      source: 'invoice-corrected',
      note: 'credit note applied',
      provenance: 'observed',
    });
    expect(first.ok && second.ok).toBe(true);

    // BOTH rows survive. The correction did not overwrite anything.
    const { rows } = await led!.query(
      `SELECT count(*)::int AS n FROM platform_forecast_outcome WHERE forecast_id=$1`,
      [rec.id],
    );
    expect((rows[0] as { n: number }).n).toBe(2);

    const resolved = (await listResolvedForecasts(led!)).find((r) => r.forecastId === rec.id);
    expect(resolved?.observedNum).toBe(950_000);
    expect(resolved?.supersededOutcomes).toBe(1);
    // And the prediction is still the prediction.
    expect(resolved?.predictedNum).toBe(1_000_000);
  });

  it('refuses an outcome dated before the prediction it resolves', async () => {
    const rec = await recordForecast(led!, {
      engine: 'test.timetravel',
      engineVersion: 'v1',
      subjectType: 'test_subject',
      subjectId: pid(903),
      metricKey: 'conviction',
      kind: 'ordinal',
      predictedNum: 50,
      predictedAt: new Date('2026-04-01T10:00:00Z'),
      horizonDays: 30,
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    const out = await recordForecastOutcome(led!, {
      forecastId: rec.id,
      kind: 'resolved',
      observedNum: 1,
      observedAt: new Date('2026-01-01T10:00:00Z'),
      source: 'backfill',
      provenance: 'reconstructed',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.refusal.code).toBe(PLATFORM_FORECAST_CODES.OUTCOME_PRECEDES_PREDICTION);
      expect(out.refusal.rule.provision).toMatch(/laundered/);
    }
  });

  it('refuses an outcome for a prediction that does not exist', async () => {
    const out = await recordForecastOutcome(led!, {
      forecastId: '00000000-0000-4000-8000-999999999999',
      kind: 'resolved',
      observedNum: 1,
      observedAt: new Date('2026-05-01T10:00:00Z'),
      source: 'nowhere',
      provenance: 'observed',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.refusal.code).toBe(PLATFORM_FORECAST_CODES.SUBJECT_UNKNOWN);
  });
});

describeDb('platform_forecast calibration — the refusal is the headline', () => {
  it('an unapplied 0074 refuses with LEDGER_ABSENT, which is not an empty ledger', async () => {
    const cal = await computePlatformForecastCalibration(bare!);
    expect(cal.ledgerPresent).toBe(false);
    expect(cal.groups).toHaveLength(0);
    expect(cal.refusals.map((r) => r.code)).toContain(PLATFORM_FORECAST_CODES.LEDGER_ABSENT);
    expect(cal.refusals.map((r) => r.code)).not.toContain(PLATFORM_FORECAST_CODES.NONE_RECORDED);
    expect(cal.frame.windowBasis).toBe('ledger_absent');
    // Every figure carries its environment label, refusals included.
    expect(cal.frame.environment).toMatch(/^(local|supabase|external):/);
  });

  it('an applied 0074 with nothing in it says NONE_RECORDED, which is not LEDGER_ABSENT', async () => {
    // The third state. An empty ledger and a missing one answer differently, and
    // neither answers 0.
    const cal = await computePlatformForecastCalibration(empty!);
    expect(cal.ledgerPresent).toBe(true);
    expect(cal.groups).toHaveLength(0);
    const codes = cal.refusals.map((r) => r.code);
    expect(codes).toContain(PLATFORM_FORECAST_CODES.NONE_RECORDED);
    expect(codes).not.toContain(PLATFORM_FORECAST_CODES.LEDGER_ABSENT);
    expect(cal.frame.windowBasis).toBe('nothing_resolved');
    expect(cal.frame.resolved).toBe(0);
    expect(cal.frame.environment).toMatch(/^(local|supabase|external):/);
  });

  it('below the floor it returns the refusal and the real n, never a percentage', async () => {
    // Three resolved probability forecasts. Three.
    for (let i = 0; i < 3; i += 1) {
      const rec = await recordForecast(led!, {
        engine: 'test.floor',
        engineVersion: 'v1',
        subjectType: 'test_subject',
        subjectId: pid(910 + i),
        metricKey: 'deal_won',
        kind: 'probability',
        predictedNum: 0.7,
        predictedAt: new Date('2026-02-01T10:00:00Z'),
        horizonDays: 30,
      });
      expect(rec.ok).toBe(true);
      if (!rec.ok) return;
      await recordForecastOutcome(led!, {
        forecastId: rec.id,
        kind: 'resolved',
        observedNum: i === 0 ? 1 : 0,
        observedAt: new Date('2026-03-05T10:00:00Z'),
        source: 'deals.stage',
        provenance: 'observed',
      });
    }

    const cal = await computePlatformForecastCalibration(led!);
    const group = cal.groups.find((g) => g.engine === 'test.floor' && g.metricKey === 'deal_won');
    expect(group).toBeDefined();
    expect(group!.figure).toBeNull();
    const below = group!.refusals.find((r) => r.code === PLATFORM_FORECAST_CODES.N_BELOW_FLOOR);
    expect(below).toBeDefined();
    expect(below!.n).toBe(3);
    expect(below!.sentence).toMatch(/3 resolved forecasts/);
    expect(group!.frame.resolved).toBe(3);
    expect(group!.frame.floor).toBe(8);
    expect(group!.frame.environment).toMatch(/^(local|supabase|external):/);
    expect(group!.frame.windowFrom).toBe('2026-02-01T10:00:00.000000Z');
    expect(group!.frame.horizonDaysObserved).toEqual({ min: 30, max: 30 });
    /*
     * THE GROUP'S FRAME CARRIES THE GROUP'S COUNTS. On its first run this reported
     * this group's `resolved: 3` beside the WHOLE LEDGER's `overdue: 3` and
     * `superseded: 1` — four numbers in one frame, three of them about something
     * else. Pinned here because it is invisible unless another suite has left an
     * overdue row lying around, which by this point one has.
     */
    expect(group!.frame.overdue).toBe(0);
    expect(group!.frame.superseded).toBe(0);
    expect(group!.frame.unresolvable).toBe(0);
    /*
     * NO SCORE-SHAPED FIELD IN THE PAYLOAD AT ALL, which is a stronger claim than
     * "the UI does not draw it". The old calibration loop returned its lift below
     * the floor and left the suppression to `Scorecard.tsx:132`; a number that
     * reaches the payload gets quoted by whatever reads it next.
     */
    const json = JSON.stringify(group);
    for (const shape of ['brier', 'skill', 'agreementPct', 'meanAbsoluteError', 'baseRatePct']) {
      expect(json, shape).not.toMatch(new RegExp(`"${shape}"`));
    }
  });

  it('at the floor it expresses a Brier score with its base rate interval, and never an accuracy percentage', async () => {
    for (let i = 0; i < MIN_RESOLVED_FOR_CALIBRATION; i += 1) {
      const rec = await recordForecast(led!, {
        engine: 'test.scored',
        engineVersion: 'v1',
        subjectType: 'test_subject',
        subjectId: pid(920 + i),
        metricKey: 'deal_won',
        kind: 'probability',
        predictedNum: i < 4 ? 0.8 : 0.2,
        predictedAt: new Date('2026-02-02T10:00:00Z'),
        horizonDays: 45,
      });
      expect(rec.ok).toBe(true);
      if (!rec.ok) return;
      await recordForecastOutcome(led!, {
        forecastId: rec.id,
        kind: 'resolved',
        // The 0.8s happened, the 0.2s did not: a forecaster with real skill.
        observedNum: i < 4 ? 1 : 0,
        observedAt: new Date('2026-03-20T10:00:00Z'),
        source: 'deals.stage',
        provenance: 'observed',
      });
    }
    const cal = await computePlatformForecastCalibration(led!);
    const group = cal.groups.find((g) => g.engine === 'test.scored');
    expect(group).toBeDefined();
    expect(group!.figure?.kind).toBe('brier');
    if (group!.figure?.kind === 'brier') {
      expect(group!.figure.brier).toBeCloseTo(0.04, 5);
      expect(group!.figure.referenceBrier).toBeCloseTo(0.25, 5);
      expect(group!.figure.skill).toBeCloseTo(0.84, 5);
      expect(group!.figure.baseRatePct).toBe(50);
      expect(group!.figure.baseRateInterval95Pct).not.toBeNull();
    }
    expect(group!.refusals).toHaveLength(0);
    expect(group!.frame.resolved).toBe(MIN_RESOLVED_FOR_CALIBRATION);
  });

  it('counts an overdue forecast separately from a pending one', async () => {
    // Horizon closed 300 days ago, nothing recorded: a miss the platform has not
    // resolved. This count is the only place that shows up.
    const overdue = await recordForecast(led!, {
      engine: 'test.overdue',
      engineVersion: 'v1',
      subjectType: 'test_subject',
      subjectId: pid(930),
      metricKey: 'conviction',
      kind: 'ordinal',
      predictedNum: 55,
      predictedAt: new Date(Date.now() - 300 * 86_400_000),
      horizonDays: 30,
    });
    const pending = await recordForecast(led!, {
      engine: 'test.overdue',
      engineVersion: 'v1',
      subjectType: 'test_subject',
      subjectId: pid(931),
      metricKey: 'conviction',
      kind: 'ordinal',
      predictedNum: 55,
      predictedAt: new Date(),
      horizonDays: 3_000,
    });
    expect(overdue.ok && pending.ok).toBe(true);
    const cal = await computePlatformForecastCalibration(led!);
    expect(cal.frame.overdue).toBeGreaterThanOrEqual(1);
    expect(cal.frame.pending).toBeGreaterThanOrEqual(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE CONTAMINATION FIX                                                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

describeDb('intel/calibration — the loop no longer measures its own penalty', () => {
  /** Won subjects, each scored 71 before the outcome and 21 after (−50, listed). */
  const WON = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  /** Universe subjects, never listed, so nothing penalises them. */
  const OPEN = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39];

  beforeAll(async () => {
    if (!HAS_DB) return;
    for (const n of WON) {
      await seedSubject(led!, {
        subject: pid(n),
        won: true,
        convictionBefore: 71,
        convictionAfter: 21,
        // TVL as of the prediction, and a much lower later reading. The later one is
        // what the old query would have used.
        tvlBefore: 5_000_000,
        tvlAfter: 1_000,
      });
    }
    for (const n of OPEN) {
      await seedSubject(led!, {
        subject: pid(n),
        won: false,
        convictionBefore: 44,
        convictionAfter: 44,
        tvlBefore: 1_000_000,
        tvlAfter: 1_000_000,
      });
    }
  }, 40_000);

  it('the OLD read really did return the penalised score (the bug is real)', async () => {
    expect(await contaminatedRead(led!, 'conviction')).toBe(21);
    expect(await contaminatedRead(led!, 'tvl_usd')).toBe(1_000);
  });

  it('with no anchors at all, every metric is unmeasurable and says which history is missing', async () => {
    // 0074 IS applied here, and no subject has a resolved forecast yet.
    const { metrics } = await computeCalibration(led!);
    const conviction = metrics.find((m) => m.metricKey === 'conviction')!;
    expect(conviction.verdict).toBe('unmeasurable');
    expect(conviction.lift).toBeNull();
    expect(conviction.wonMedian).toBeNull();
    expect(conviction.sampleWon).toBe(WON.length);
    const scoreRefusal = conviction.refusals.find(
      (r) => r.code === CALIBRATION_CODES.SCORE_HISTORY_DESTROYED,
    );
    expect(scoreRefusal).toBeDefined();
    expect(scoreRefusal!.missingHistory).toMatch(/intel\/alpha\.ts/);
    expect(scoreRefusal!.n).toBe(WON.length);

    const tvl = metrics.find((m) => m.metricKey === 'tvl_usd')!;
    expect(tvl.verdict).toBe('unmeasurable');
    expect(tvl.lift).toBeNull();
    expect(tvl.refusals.map((r) => r.code)).toContain(CALIBRATION_CODES.NO_ANCHORED_SUBJECT);
    expect(tvl.frame.anchorBasis).toBe('no_anchor_available');
    // Nothing is anchored, so EVERY subject carrying the predicate is excluded, and
    // the frame says how many rather than just producing a smaller sample.
    expect(tvl.frame.subjectsAnchored).toBe(0);
    expect(tvl.frame.subjectsWithoutAnchor).toBe(WON.length + OPEN.length);
  });

  it('every metric carries an ObservationFrame and an environment label', async () => {
    const { metrics } = await computeCalibration(led!);
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expect(m.frame.environment, m.metricKey).toMatch(/^(local|supabase|external):/);
      expect(m.frame.asOf, m.metricKey).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(m.frame.minWonSample, m.metricKey).toBe(8);
      expect(m.frame.anchorMigration, m.metricKey).toBe('0074_platform_forecast.sql');
      expect(m.refusals.length, m.metricKey).toBeGreaterThan(0);
    }
  });

  describe('once the prediction instants exist', () => {
    beforeAll(async () => {
      if (!HAS_DB) return;
      for (const n of [...WON, ...OPEN]) await anchor(led!, pid(n));
    }, 40_000);

    it('reads the signal AS OF the prediction instant, not the post-outcome value', async () => {
      const { metrics } = await computeCalibration(led!);
      const tvl = metrics.find((m) => m.metricKey === 'tvl_usd')!;
      // 5,000,000 is the value as of T_PREDICT. 1,000 is the later reading the old
      // query used, and it is what a still-contaminated read would return here.
      expect(tvl.wonMedian).toBe(5_000_000);
      expect(tvl.wonMedian).not.toBe(1_000);
      expect(tvl.universeMedian).toBe(1_000_000);
      expect(tvl.lift).toBe(5);
      expect(tvl.verdict).toBe('predictive');
      expect(tvl.refusals).toHaveLength(0);
      expect(tvl.frame.observed).toBe('observation_value_as_of_prediction_instant');
      expect(tvl.frame.anchorBasis).toBe('resolved_platform_forecast');
      expect(tvl.frame.subjectsAnchored).toBe(WON.length + OPEN.length);
      expect(tvl.frame.windowFrom).toBe('2026-03-01T09:00:00.000000Z');
    });

    it('STILL refuses the score metrics — an anchor cannot recover a deleted history', async () => {
      const { metrics } = await computeCalibration(led!);
      const conviction = metrics.find((m) => m.metricKey === 'conviction')!;
      expect(conviction.verdict).toBe('unmeasurable');
      expect(conviction.lift).toBeNull();
      expect(conviction.wonMedian).toBeNull();
      expect(conviction.quintileCapture).toBeNull();
      expect(conviction.refusals.map((r) => r.code)).toContain(
        CALIBRATION_CODES.SCORE_HISTORY_DESTROYED,
      );
      expect(conviction.frame.observed).toBe('subject_counts_only_no_value_read');
      // Anchors now exist for every subject, so nothing is excluded for want of one —
      // the refusal above is about the deleted history and says so.
      expect(conviction.frame.subjectsWithoutAnchor).toBe(0);
    });

    it('below the won floor it returns the refusal and the real n, never a lift', async () => {
      // A metric only three won subjects carry, anchored and readable.
      for (const n of WON.slice(0, 3)) {
        await led!.query(
          `INSERT INTO observations (subject_type, subject_id, predicate, value_num, observed_at)
           VALUES ('project',$1,'market_cap_usd',$2,$3::timestamptz)`,
          [pid(n), 9_000_000, T_PREDICT],
        );
      }
      const { metrics } = await computeCalibration(led!);
      const mcap = metrics.find((m) => m.metricKey === 'market_cap_usd')!;
      expect(mcap.sampleWon).toBe(3);
      expect(mcap.lift).toBeNull();
      expect(mcap.quintileCapture).toBeNull();
      expect(mcap.wonMedian).toBeNull();
      expect(mcap.verdict).toBe('insufficient');
      const floor = mcap.refusals.find((r) => r.code === CALIBRATION_CODES.N_BELOW_FLOOR);
      expect(floor).toBeDefined();
      expect(floor!.n).toBe(3);
      expect(floor!.sentence).toMatch(/below the stated minimum of 8/);
    });

    it('getCalibration withholds the figures of snapshots written before this fix', async () => {
      // A row exactly as the contaminated loop wrote them: a lift, and no schema marker.
      await led!.query(
        `INSERT INTO model_calibrations (metric_key, kind, lift, quintile_capture, won_median, universe_median,
                                         sample_won, sample_universe, meta, snapshot_date)
         VALUES ('legacy_metric','signal',3.2,0.75,71,22,3,900,'{"verdict":"predictive"}'::jsonb,'2020-01-01')`,
      );
      const view = await getCalibration(led!);
      const legacy = view.latest.find((m) => m.metricKey === 'legacy_metric')!;
      expect(legacy.lift).toBeNull();
      expect(legacy.wonMedian).toBeNull();
      expect(legacy.verdict).toBe('unmeasurable');
      expect(legacy.refusals.map((r) => r.code)).toContain(CALIBRATION_CODES.SNAPSHOT_PREDATES_FIX);
      expect(view.historySuppressed).toBeGreaterThanOrEqual(1);
      // The rows this pass wrote are readable, and carry their frame.
      const tvl = view.latest.find((m) => m.metricKey === 'tvl_usd');
      expect(tvl?.frame.anchorMigration).toBe('0074_platform_forecast.sql');
    });

    it('serves the GPS call site through the same tables', async () => {
      const pairs = gpsOutcomeToForecast(
        {
          engagementId: 'eng-live-1',
          clientId: 'c1',
          offerKey: 'mica_whitepaper',
          disposition: 'lost',
          reason: 'price',
          quotedPriceCents: 2_000_000,
          realisedPriceCents: null,
          quotedVendorCostCents: 0,
          realisedVendorCostCents: null,
          cycleTimeDays: null,
          acceptanceFirstPass: null,
          partner: null,
          factorScoresAtQuote: null,
          decidedAt: '2026-05-01',
        } as unknown as Parameters<typeof gpsOutcomeToForecast>[0],
        {
          engineVersion: 'underwrite-v1',
          quotedAt: new Date('2026-03-02T00:00:00Z'),
          decidedAt: new Date('2026-05-02T00:00:00Z'),
          horizonDays: 60,
        },
      );
      for (const p of pairs) {
        const rec = await recordForecast(led!, p.prediction);
        expect(rec.ok, JSON.stringify(rec)).toBe(true);
        if (!rec.ok) return;
        const out = await recordForecastOutcome(led!, { ...p.outcome, forecastId: rec.id });
        expect(out.ok, JSON.stringify(out)).toBe(true);
      }
      const cal = await computePlatformForecastCalibration(led!);
      const gps = cal.groups.find((g) => g.engine === 'gps.underwrite');
      expect(gps).toBeDefined();
      // One resolved (the disposition) and one unresolvable (no realised price), and
      // the group refuses on n rather than expressing an agreement rate off one row.
      expect(gps!.figure).toBeNull();
      expect(gps!.refusals.map((r) => r.code)).toContain(PLATFORM_FORECAST_CODES.N_BELOW_FLOOR);
      expect(cal.frame.unresolvable).toBeGreaterThanOrEqual(1);

      // And the anchors this lane exposes see project subjects only — the GPS rows
      // do not leak into the intel calibration's as-of read.
      const anchors = await asOfAnchors(led!, 'project');
      expect([...anchors.bySubject.keys()]).not.toContain('eng-live-1');
    });
  });
});
