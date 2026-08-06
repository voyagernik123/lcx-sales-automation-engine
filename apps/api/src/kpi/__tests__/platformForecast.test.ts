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
/** A universe with no spread at all: every value 0. Its own schema so nothing else sees it. */
const DEGEN = `f2_degen_${process.pid}`;
/**
 * 0074 applied and its two finite-value constraints DROPPED, so the suite can hold the
 * rows a database written before those constraints existed would hold. Dropping them is
 * the only honest way to test the reader's own defence: with the constraints in place the
 * row cannot be inserted at all, and "the reader copes" would be untested and assumed.
 */
const LEGACY = `f2_legacy_${process.pid}`;

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
let degen: pg.Pool | undefined;
let legacy: pg.Pool | undefined;

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

/** The instant a post-outcome pass would record, and when it would resolve. */
const T_LATE_PREDICT = T_RESCORE;
const T_LATE_OUTCOME = '2026-06-15T09:00:00Z';

/** A resolved forecast for `subject`, which is what makes an as-of read possible. */
async function anchor(
  pool: pg.Pool,
  subject: string,
  at = T_PREDICT,
  outcomeAt = T_OUTCOME,
): Promise<void> {
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
    observedAt: new Date(outcomeAt),
    source: 'deals.stage',
    provenance: 'observed',
  });
  expect(out.ok, JSON.stringify(out)).toBe(true);
}

/** One observation, at one instant. Used by the tests that seed their own predicate. */
async function observe(
  pool: pg.Pool,
  subject: string,
  predicate: string,
  value: number,
  at = T_PREDICT,
): Promise<void> {
  await pool.query(
    `INSERT INTO observations (subject_type, subject_id, predicate, value_num, observed_at)
     VALUES ('project',$1,$2,$3,$4::timestamptz)`,
    [subject, predicate, value, at],
  );
}

beforeAll(async () => {
  if (!HAS_DB) return;
  admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  for (const s of [LEDGER, BARE, EMPTY, DEGEN, LEGACY]) {
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

  degen = scopedPool(DEGEN);
  await degen.query(SPINE_DDL);
  await degen.query(MIGRATION_0074);

  legacy = scopedPool(LEGACY);
  await legacy.query(SPINE_DDL);
  await legacy.query(MIGRATION_0074);
  await legacy.query(
    `ALTER TABLE platform_forecast DROP CONSTRAINT platform_forecast_predicted_num_finite;
     ALTER TABLE platform_forecast_outcome DROP CONSTRAINT platform_forecast_outcome_observed_num_finite;`,
  );
}, 60_000);

afterAll(async () => {
  if (admin) {
    for (const s of [LEDGER, BARE, EMPTY, DEGEN, LEGACY]) {
      await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    }
  }
  await Promise.all([led?.end(), bare?.end(), empty?.end(), degen?.end(), legacy?.end(), admin?.end()]);
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
    const { pairs } = gpsOutcomeToForecast(record, args);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(p.prediction.predictedAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(p.prediction.engine).toBe('gps.underwrite');
      expect(p.prediction.engineVersion).toBe('underwrite-v1');
      expect(p.prediction.subjectId).toBe('eng-1');
    }
  });

  it('carries the quoted price as the prediction and the realised one as the outcome', () => {
    const price = gpsOutcomeToForecast(record, args).pairs.find((p) => p.prediction.metricKey === 'price_cents');
    expect(price?.prediction.predictedNum).toBe(1_500_000);
    expect(price?.outcome.kind).toBe('resolved');
    expect(price?.outcome.observedNum).toBe(1_200_000);
  });

  it('records an absent realised price as UNRESOLVABLE, never as zero', () => {
    const noPrice = { ...(record as Record<string, unknown>), realisedPriceCents: null } as unknown as Parameters<typeof gpsOutcomeToForecast>[0];
    const price = gpsOutcomeToForecast(noPrice, args).pairs.find((p) => p.prediction.metricKey === 'price_cents');
    expect(price?.outcome.kind).toBe('unresolvable');
    expect(price?.outcome.observedNum ?? null).toBeNull();
    expect(price?.outcome.note ?? '').toMatch(/unresolvable/i);
  });

  /*
   * THE WIN SIDE IS OMITTED AND SAYS SO.
   *
   * The first cut recorded `engagement_won` as a CATEGORY prediction labelled 'quoted'
   * and resolved it with the disposition ('won' | 'lost'). 'quoted' can never equal a
   * disposition, so the agreement branch scored 0 for every row forever — and above the
   * floor of 8 the platform would have printed a real-looking figure saying the
   * underwriting engine was wrong 100% of the time. These two assertions are what make
   * that unreachable: no such pair, and the absence is reported rather than silent.
   */
  it('records NO win forecast, and reports the omission instead of dropping it', () => {
    const { pairs, omitted } = gpsOutcomeToForecast(record, args);
    expect(pairs.map((p) => p.prediction.metricKey)).toEqual(['price_cents']);
    expect(omitted.map((o) => o.metricKey)).toContain('engagement_won');
    expect(omitted.find((o) => o.metricKey === 'engagement_won')!.reason).toMatch(/no win probability|win probability/i);
    // The label that could only ever disagree with a disposition.
    expect(JSON.stringify(pairs)).not.toMatch(/"quoted"/);
    expect(JSON.stringify(pairs)).not.toMatch(/engagement_won/);
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
      /*
       * `github_commits_30d`, and NOT `market_cap_usd`, which is what this test used to
       * seed. market_cap_usd is one of the two predicates `intel/backfill.ts` DELETEs on
       * every run, so it cannot have an as-of read at all and now refuses for that
       * reason — see the test below. github_commits_30d is written by
       * `connectors/github.ts` and nothing deletes it.
       *
       * Three won subjects carry it, anchored and readable. Distinct values, because a
       * later test in this file needs the median of an even-sized set to be interesting.
       */
      const values = [10, 20, 30];
      for (const [i, n] of WON.slice(0, 3).entries()) {
        await observe(led!, pid(n), 'github_commits_30d', values[i]!);
      }
      const { metrics } = await computeCalibration(led!);
      const commits = metrics.find((m) => m.metricKey === 'github_commits_30d')!;
      expect(commits.sampleWon).toBe(3);
      expect(commits.lift).toBeNull();
      expect(commits.quintileCapture).toBeNull();
      expect(commits.wonMedian).toBeNull();
      expect(commits.verdict).toBe('insufficient');
      const floor = commits.refusals.find((r) => r.code === CALIBRATION_CODES.N_BELOW_FLOOR);
      expect(floor).toBeDefined();
      expect(floor!.n).toBe(3);
      expect(floor!.sentence).toMatch(/below the stated minimum of 8/);
    });

    /*
     * THE FILE USED TO STATE THE OPPOSITE OF THIS AS A FACT: "Signals from outside the
     * platform. Nothing deletes these, so their history is real and an as-of read means
     * something." `intel/backfill.ts:34` deletes `market_cap_usd` (written back at :74,
     * source 'coingecko') and `priority_score` (:85, source 'internal' — the internal
     * model's own output, not an outside signal at all) on every run. One row per
     * subject survives and it is always the newest: the same mechanism that makes the
     * alpha scores unmeasurable, routed into the branch that computed a lift.
     */
    it('refuses the two "signals" whose history intel/backfill.ts deletes, and names it', async () => {
      // Seeded exactly as the below-floor test seeds the append-only signal, so the only
      // difference between the two outcomes is who deletes the predicate.
      for (const n of WON) await observe(led!, pid(n), 'market_cap_usd', 9_000_000);
      for (const n of OPEN) await observe(led!, pid(n), 'market_cap_usd', 1_000_000);
      const { metrics } = await computeCalibration(led!);
      for (const key of ['market_cap_usd', 'priority_score']) {
        const m = metrics.find((x) => x.metricKey === key)!;
        expect(m.verdict, key).toBe('unmeasurable');
        expect(m.lift, key).toBeNull();
        expect(m.quintileCapture, key).toBeNull();
        expect(m.wonMedian, key).toBeNull();
        const refusal = m.refusals.find((r) => r.code === CALIBRATION_CODES.BACKFILL_HISTORY_DESTROYED);
        expect(refusal, key).toBeDefined();
        expect(refusal!.missingHistory, key).toMatch(/intel\/backfill\.ts/);
        expect(m.frame.observed, key).toBe('subject_counts_only_no_value_read');
      }
      // And the coverage is real: 9 won subjects carry market_cap_usd here, so "we hold
      // nothing" and "we hold it and may not read it" cannot render the same way.
      const mcap = metrics.find((x) => x.metricKey === 'market_cap_usd')!;
      expect(mcap.frame.wonSubjectsWithMetric).toBe(WON.length);
      expect(mcap.frame.subjectsWithMetric).toBe(WON.length + OPEN.length);
      // priority_score has no observations at all — the other of the three states.
      const prio = metrics.find((x) => x.metricKey === 'priority_score')!;
      expect(prio.frame.subjectsWithMetric).toBe(0);
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
      const { pairs, omitted } = gpsOutcomeToForecast(
        {
          engagementId: 'eng-live-1',
          clientId: 'c1',
          offerKey: 'mica_whitepaper',
          disposition: 'lost',
          reason: 'price',
          quotedPriceCents: 2_000_000,
          realisedPriceCents: 1_800_000,
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
      // A second engagement with no realised price, so the unresolvable count below is
      // about something real rather than about a leftover row from another suite.
      const noPrice = gpsOutcomeToForecast(
        {
          engagementId: 'eng-live-2',
          clientId: 'c2',
          offerKey: 'mica_whitepaper',
          disposition: 'lost',
          reason: 'price',
          quotedPriceCents: 900_000,
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
          quotedAt: new Date('2026-03-03T00:00:00Z'),
          decidedAt: new Date('2026-05-03T00:00:00Z'),
          horizonDays: 60,
        },
      );
      for (const p of [...pairs, ...noPrice.pairs]) {
        const rec = await recordForecast(led!, p.prediction);
        expect(rec.ok, JSON.stringify(rec)).toBe(true);
        if (!rec.ok) return;
        const out = await recordForecastOutcome(led!, { ...p.outcome, forecastId: rec.id });
        expect(out.ok, JSON.stringify(out)).toBe(true);
      }
      const cal = await computePlatformForecastCalibration(led!);
      const gps = cal.groups.find((g) => g.engine === 'gps.underwrite');
      expect(gps).toBeDefined();
      // One resolved price and one unresolvable one, and the group refuses on n rather
      // than expressing a figure off a single row.
      expect(gps!.figure).toBeNull();
      expect(gps!.refusals.map((r) => r.code)).toContain(PLATFORM_FORECAST_CODES.N_BELOW_FLOOR);
      expect(cal.frame.unresolvable).toBeGreaterThanOrEqual(1);
      // NO category group exists for GPS at all: the win side is omitted, not recorded
      // as a label that could only ever disagree with the disposition.
      expect(cal.groups.filter((g) => g.engine === 'gps.underwrite' && g.kind === 'category')).toHaveLength(0);
      expect(omitted.map((o) => o.metricKey)).toContain('engagement_won');

      // And the anchors this lane exposes see project subjects only — the GPS rows
      // do not leak into the intel calibration's as-of read.
      const anchors = await asOfAnchors(led!, 'project');
      expect([...anchors.bySubject.keys()]).not.toContain('eng-live-1');
    });

    /*
     * ══════════════════════════════════════════════════════════════════════════════
     *  THE ANCHOR ITSELF WAS THE HOLE, AND THIS IS THE TEST THAT WAS MISSING.
     * ══════════════════════════════════════════════════════════════════════════════
     *  `asOfAnchors` anchored on `max(predicted_at)`, justified by 0074's guard trigger:
     *  an outcome cannot predate its prediction, so a resolved prediction is at or
     *  before its own outcome. True, and beside the point — the trigger relates a
     *  forecast to ITS OWN outcome row and knows nothing about when the DEAL was won. A
     *  pass that records a forecast for an already-won project and resolves it against
     *  the win it can read today is perfectly legal, and max() picks exactly that row.
     *
     *  This test records that row for EVERY won subject, which is what the handover
     *  instructs `intel/alpha.ts` to start doing. Against `max()` every won subject's
     *  as-of read returns the post-outcome 1,000 and `wonMedian` collapses from
     *  5,000,000 to 1,000 while the frame still claims
     *  `observation_value_as_of_prediction_instant` and carries no refusal.
     */
    it('anchors on the EARLIEST resolved prediction, so a post-outcome pass cannot move it', async () => {
      for (const n of WON) await anchor(led!, pid(n), T_LATE_PREDICT, T_LATE_OUTCOME);

      const anchors = await asOfAnchors(led!, 'project');
      const a = anchors.bySubject.get(pid(WON[0]!))!;
      expect(a.asOf).toBe('2026-03-01T09:00:00.000000Z');
      expect(a.asOf).not.toBe('2026-06-01T09:00:00.000000Z');
      // And the ledger says out loud that it holds calls made after the subject was
      // decided, rather than quietly using one of them.
      expect(a.predictionsAtOrAfterOwnOutcome).toBeGreaterThanOrEqual(1);
      expect(a.outcomeAt).toBe('2026-05-01T09:00:00.000000Z');

      const { metrics } = await computeCalibration(led!);
      const tvl = metrics.find((m) => m.metricKey === 'tvl_usd')!;
      expect(tvl.wonMedian).toBe(5_000_000);
      expect(tvl.wonMedian).not.toBe(1_000);
      expect(tvl.lift).toBe(5);
      expect(tvl.frame.observed).toBe('observation_value_as_of_prediction_instant');
    });

    /*
     * And when the EARLIEST call also postdates the win, there is no honest instant at
     * all. The subject is excluded from both sides and the exclusion is named — the one
     * thing the old code could not do, because it had no way to know when the deal
     * closed. `deals.won_at` is where that comes from.
     */
    it('excludes a won subject whose earliest anchor postdates its win, and says how many', async () => {
      const late = pid(50);
      await led!.query(
        `INSERT INTO deals (project_id, stage, won_at) VALUES ($1,'won',$2::timestamptz)`,
        [late, T_OUTCOME],
      );
      // A high value before the win and a wrecked one after it: if this subject were
      // read at the instant on file, 1 is what the loop would see.
      await observe(led!, late, 'tvl_usd', 7_000_000, T_PREDICT);
      await observe(led!, late, 'tvl_usd', 1, T_RESCORE);
      await anchor(led!, late, T_LATE_PREDICT, T_LATE_OUTCOME);

      const { metrics } = await computeCalibration(led!);
      const tvl = metrics.find((m) => m.metricKey === 'tvl_usd')!;
      const excluded = tvl.refusals.find((r) => r.code === CALIBRATION_CODES.ANCHOR_POSTDATES_OUTCOME);
      expect(excluded).toBeDefined();
      expect(excluded!.n).toBe(1);
      expect(excluded!.sentence).toMatch(/postdates|after the deal closed/i);
      expect(tvl.frame.wonSubjectsAnchorPostdatesOutcome).toBe(1);
      // The subject contributed to neither side: nine won subjects, not ten.
      expect(tvl.sampleWon).toBe(WON.length);
      expect(tvl.wonMedian).toBe(5_000_000);
    });

    /*
     * `percentile_cont` interpolates: at an even n it returns the MEAN of the two middle
     * values, which is a number no subject ever had. `kpi/platformForecast.ts:median`
     * argues the opposite rule for itself in as many words — "every number reported is
     * one that was measured" — and the interpolated one was the figure reaching the
     * screen. Eight won subjects at 10…80: nearest rank is 40, interpolation is 45.
     */
    it('reports a median that some subject actually had, not an interpolated one', async () => {
      const more = [40, 50, 60, 70, 80];
      for (const [i, n] of WON.slice(3, 8).entries()) {
        await observe(led!, pid(n), 'github_commits_30d', more[i]!);
      }
      for (const n of OPEN) await observe(led!, pid(n), 'github_commits_30d', 20);

      const { metrics } = await computeCalibration(led!);
      const commits = metrics.find((m) => m.metricKey === 'github_commits_30d')!;
      expect(commits.sampleWon).toBe(8);
      expect(commits.wonMedian).toBe(40);
      expect(commits.wonMedian).not.toBe(45);
      expect(commits.universeMedian).toBe(20);
      expect(commits.lift).toBe(2);
      expect(commits.quintileCapture).toBe(0.5);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE WRITE PATH — a refusal is a return value, not an exception                   */
/* ══════════════════════════════════════════════════════════════════════════════ */

describeDb('recordForecast — what it refuses instead of throwing', () => {
  const base = {
    engine: 'test.refuse',
    engineVersion: 'v1',
    subjectType: 'test_subject',
    metricKey: 'conviction',
    kind: 'ordinal' as const,
    horizonDays: 30,
  };

  /*
   * THE IDENTITY INDEX DOES NOT COVER THE VALUE. `ON CONFLICT DO NOTHING` therefore
   * swallowed a genuinely DIFFERENT prediction at the same (engine, version, subject,
   * metric, instant) and the UNION-ALL fallback handed back the pre-existing id with
   * ok:true — the caller was told its number was on file and the ledger held someone
   * else's. 0074 will not let it be overwritten; this must not let it be dropped either.
   */
  it('refuses a DIFFERENT prediction at an identity that is already taken', async () => {
    const at = new Date('2026-01-20T10:00:00Z');
    const first = await recordForecast(led!, { ...base, subjectId: pid(940), predictedNum: 64, predictedAt: at });
    expect(first.ok, JSON.stringify(first)).toBe(true);

    const same = await recordForecast(led!, { ...base, subjectId: pid(940), predictedNum: 64, predictedAt: at });
    expect(same.ok).toBe(true);
    if (same.ok && first.ok) expect(same.id).toBe(first.id);

    const different = await recordForecast(led!, { ...base, subjectId: pid(940), predictedNum: 65, predictedAt: at });
    expect(different.ok).toBe(false);
    if (!different.ok) {
      expect(different.refusal.code).toBe(PLATFORM_FORECAST_CODES.IDENTITY_HOLDS_DIFFERENT_PREDICTION);
      expect(different.refusal.sentence).toMatch(/64/);
      expect(different.refusal.sentence).toMatch(/65/);
    }
    // A different HORIZON at the same identity is a different prediction too.
    const otherHorizon = await recordForecast(led!, {
      ...base, subjectId: pid(940), predictedNum: 64, predictedAt: at, horizonDays: 60,
    });
    expect(otherHorizon.ok).toBe(false);

    // And the stored row is untouched: one row, still 64.
    const { rows } = await led!.query(
      `SELECT count(*)::int AS n, min(predicted_num)::float8 AS v FROM platform_forecast WHERE subject_id=$1`,
      [pid(940)],
    );
    expect(rows[0] as { n: number; v: number }).toEqual({ n: 1, v: 64 });
  });

  it('refuses an Invalid Date rather than throwing "Invalid time value"', async () => {
    const out = await recordForecast(led!, {
      ...base, subjectId: pid(941), predictedNum: 10, predictedAt: new Date('not a date'),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.refusal.code).toBe(PLATFORM_FORECAST_CODES.INSTANT_INVALID);
      expect(out.refusal.sentence).toMatch(/not defaulted to now/i);
    }

    // The outcome writer has the same promise to keep.
    const rec = await recordForecast(led!, {
      ...base, subjectId: pid(944), predictedNum: 10, predictedAt: new Date('2026-01-24T10:00:00Z'),
    });
    expect(rec.ok, JSON.stringify(rec)).toBe(true);
    if (!rec.ok) return;
    const badDate = await recordForecastOutcome(led!, {
      forecastId: rec.id,
      kind: 'resolved',
      observedNum: 9,
      observedAt: new Date('also not a date'),
      source: 'deals.stage',
      provenance: 'observed',
    });
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) expect(badDate.refusal.code).toBe(PLATFORM_FORECAST_CODES.INSTANT_INVALID);

    const badNum = await recordForecastOutcome(led!, {
      forecastId: rec.id,
      kind: 'resolved',
      observedNum: Number.POSITIVE_INFINITY,
      observedAt: new Date('2026-02-24T10:00:00Z'),
      source: 'deals.stage',
      provenance: 'observed',
    });
    expect(badNum.ok).toBe(false);
    if (!badNum.ok) expect(badNum.refusal.code).toBe(PLATFORM_FORECAST_CODES.VALUE_NOT_FINITE);
  });

  it('refuses a NaN before it reaches the ledger', async () => {
    const out = await recordForecast(led!, {
      ...base, subjectId: pid(942), predictedNum: Number.NaN, predictedAt: new Date('2026-01-21T10:00:00Z'),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.refusal.code).toBe(PLATFORM_FORECAST_CODES.VALUE_NOT_FINITE);
  });

  /*
   * A probability of 1.0000000000000002 is what ordinary floating point hands a
   * calibration job, and 0074 is right to refuse it. `RecordResult` promises a refusal
   * path and this used to reject with a raw Postgres error instead.
   */
  it('turns a constraint 0074 raises into a refusal, naming the constraint', async () => {
    const out = await recordForecast(led!, {
      engine: 'test.refuse',
      engineVersion: 'v1',
      subjectType: 'test_subject',
      subjectId: pid(943),
      metricKey: 'deal_won',
      kind: 'probability',
      predictedNum: 1.0000000000000002,
      predictedAt: new Date('2026-01-22T10:00:00Z'),
      horizonDays: 30,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.refusal.code).toBe(PLATFORM_FORECAST_CODES.REJECTED_BY_LEDGER);
      expect(out.refusal.sentence).toMatch(/value_matches_kind/);
    }
  });

  it('0074 refuses NaN and ±Infinity in a numeric column at the database', async () => {
    for (const bad of ['NaN', 'Infinity', '-Infinity']) {
      let caught: unknown;
      try {
        await led!.query(
          `INSERT INTO platform_forecast (engine, engine_version, subject_type, subject_id, metric_key,
             prediction_kind, predicted_num, predicted_at, horizon_days, environment)
           VALUES ('test.nan','v1','test_subject',$2,'conviction','scalar',$1::numeric,
                   '2026-01-23T10:00:00Z',30,'local:test/db')`,
          [bad, `nan-${bad}`],
        );
      } catch (err) {
        caught = err;
      }
      expect(caught, bad).toBeDefined();
      expect(String(caught), bad).toMatch(/predicted_num_finite/);
    }
  });
});

/*
 * THE READER'S OWN DEFENCE, tested against rows a database written before 0074's finite
 * constraints would hold. The constraints are DROPPED in this schema on purpose: with
 * them in place the row cannot exist, and "the reader copes" would be an assumption.
 */
describeDb('a non-finite value already in the ledger', () => {
  const seedLegacy = async (i: number, predicted: string, observed: string): Promise<void> => {
    const { rows } = await legacy!.query<{ id: string }>(
      `INSERT INTO platform_forecast (engine, engine_version, subject_type, subject_id, metric_key,
         prediction_kind, predicted_num, predicted_at, horizon_days, environment)
       VALUES ('legacy.nan','v1','test_subject',$1,'price_cents','scalar',$2::numeric,
               '2026-01-02T00:00:00Z',30,'local:test/db')
       RETURNING id`,
      [`legacy-${i}`, predicted],
    );
    await legacy!.query(
      `INSERT INTO platform_forecast_outcome (forecast_id, outcome_kind, observed_num, observed_at, source, provenance)
       VALUES ($1,'resolved',$2::numeric,'2026-02-02T00:00:00Z','invoice','observed')`,
      [rows[0]!.id, observed],
    );
  };

  it('is excluded WITH a refusal, never serialised as a null figure', async () => {
    // Eight usable rows, each off by 2, so the group is above the floor and a figure IS
    // expressed — the point being that the bad row shrinks it visibly rather than
    // turning the whole figure into null.
    for (let i = 0; i < MIN_RESOLVED_FOR_CALIBRATION; i += 1) {
      await seedLegacy(i, String(100 + i), String(102 + i));
    }
    await seedLegacy(99, '5', 'NaN');

    const cal = await computePlatformForecastCalibration(legacy!);
    const group = cal.groups.find((g) => g.engine === 'legacy.nan')!;
    expect(group).toBeDefined();
    expect(group.figure?.kind).toBe('absolute_error');
    if (group.figure?.kind === 'absolute_error') {
      expect(group.figure.meanAbsoluteError).toBe(2);
      expect(group.figure.medianAbsoluteError).toBe(2);
    }
    const notFinite = group.refusals.find((r) => r.code === PLATFORM_FORECAST_CODES.VALUE_NOT_FINITE);
    expect(notFinite).toBeDefined();
    expect(notFinite!.n).toBe(1);
    // THE SHAPE THE DOCTRINE FORBIDS: a figure key that is present and null.
    expect(JSON.stringify(group)).not.toMatch(/"meanAbsoluteError":null/);
    expect(JSON.stringify(group)).not.toMatch(/"medianAbsoluteError":null/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* A DISTRIBUTION WITH NO SPREAD, AND AN ENVIRONMENT WITH NO NAME                  */
/* ══════════════════════════════════════════════════════════════════════════════ */

describeDb('a universe with no spread refuses instead of printing 100%', () => {
  /** Won and universe subjects that all measured exactly 0. */
  const ZERO_WON = [60, 61, 62, 63, 64, 65, 66, 67];
  const ZERO_OPEN = [70, 71, 72, 73, 74, 75, 76, 77, 78, 79];

  beforeAll(async () => {
    if (!HAS_DB) return;
    for (const n of [...ZERO_WON, ...ZERO_OPEN]) {
      const won = ZERO_WON.includes(n);
      await degen!.query(
        won
          ? `INSERT INTO deals (project_id, stage, won_at) VALUES ($1,'won',$2::timestamptz)`
          : `INSERT INTO deals (project_id, stage, won_at) VALUES ($1,'discovery',NULL)`,
        won ? [pid(n), T_OUTCOME] : [pid(n)],
      );
      await observe(degen!, pid(n), 'github_commits_30d', 0, T_PREDICT);
      await anchor(degen!, pid(n));
    }
  }, 40_000);

  /*
   * A universe median of 0 gave lift = null with an EMPTY refusals array, verdict 'weak'
   * — a stated FINDING about the metric — and a quintileCapture of 1, which
   * `Scorecard.tsx:132` draws because it only blanks a cell on verdict 'insufficient'.
   * Every value ties the 80th percentile, so 100% capture was arithmetic, not a result.
   */
  it('refuses the lift AND the capture, with codes, and never reads as weak', async () => {
    const { metrics } = await computeCalibration(degen!);
    const m = metrics.find((x) => x.metricKey === 'github_commits_30d')!;
    expect(m.sampleWon).toBe(ZERO_WON.length);
    expect(m.sampleUniverse).toBe(ZERO_WON.length + ZERO_OPEN.length);
    expect(m.lift).toBeNull();
    expect(m.quintileCapture).toBeNull();
    expect(m.wonMedian).toBeNull();
    expect(m.verdict).toBe('unmeasurable');
    expect(m.verdict).not.toBe('weak');
    const codes = m.refusals.map((r) => r.code);
    expect(codes).toContain(CALIBRATION_CODES.LIFT_UNDEFINED);
    expect(codes).toContain(CALIBRATION_CODES.QUINTILE_DEGENERATE);
  });

  /*
   * ANCHORS, ROWS, AND NOTHING READABLE AS OF ANY OF THEM. This used to fall through to
   * "0 won subjects … below the stated minimum of 8" with verdict 'insufficient' —
   * telling the operator to wait for a sample that cannot arrive, and collapsing three
   * states (no rows / rows that cannot be read as of / genuinely too few) into one.
   */
  it('separates "we hold none" from "we hold some and can read none as of"', async () => {
    // tvl_usd: every value recorded AFTER every anchor.
    for (const n of ZERO_OPEN) await observe(degen!, pid(n), 'tvl_usd', 1_000, T_RESCORE);
    const { metrics } = await computeCalibration(degen!);

    const tvl = metrics.find((x) => x.metricKey === 'tvl_usd')!;
    expect(tvl.refusals.map((r) => r.code)).toContain(CALIBRATION_CODES.NO_VALUE_AS_OF_ANCHOR);
    expect(tvl.verdict).toBe('unmeasurable');
    expect(tvl.frame.observed).toBe('no_value_readable_as_of_prediction_instant');
    // The coverage is on the record even though nothing could be read.
    expect(tvl.frame.subjectsWithMetric).toBe(ZERO_OPEN.length);
    expect(tvl.refusals.map((r) => r.code)).not.toContain(CALIBRATION_CODES.N_BELOW_FLOOR);
  });
});

describeDb('an environment that cannot be named', () => {
  /*
   * `{ databaseUrl: null }` IS THE DOCUMENTED WAY TO SAY "I CANNOT NAME ONE" and it
   * silently borrowed the process's database name instead, because every entry point
   * read `opts?.databaseUrl ?? process.env.DATABASE_URL`. Only the empty string reached
   * the refusal. Neither of these two refusals had a single test.
   */
  it('refuses the platform forecast figures and keeps the group\'s OTHER refusals', async () => {
    const cal = await computePlatformForecastCalibration(led!, { databaseUrl: null });
    expect(cal.frame.environment).toBeNull();
    expect(cal.refusals.map((r) => r.code)).toContain(PLATFORM_FORECAST_CODES.ENVIRONMENT_UNNAMED);
    const floor = cal.groups.find((g) => g.engine === 'test.floor')!;
    expect(floor).toBeDefined();
    expect(floor.figure).toBeNull();
    const codes = floor.refusals.map((r) => r.code);
    expect(codes).toContain(PLATFORM_FORECAST_CODES.ENVIRONMENT_UNNAMED);
    // AND the reason it was already refusing. Replacing the whole scoring call with the
    // environment refusal deleted this one, which breaks "return every refusal".
    expect(codes).toContain(PLATFORM_FORECAST_CODES.N_BELOW_FLOOR);
    // The counts still travel — a count is a fact about our own records, not a figure
    // about the world.
    expect(floor.frame.resolved).toBe(3);
  });

  it('refuses a calibration figure and does not borrow the process database name', async () => {
    const { metrics } = await computeCalibration(led!, { databaseUrl: null });
    const tvl = metrics.find((m) => m.metricKey === 'tvl_usd')!;
    expect(tvl.frame.environment).toBeNull();
    expect(tvl.lift).toBeNull();
    expect(tvl.wonMedian).toBeNull();
    expect(tvl.universeMedian).toBeNull();
    expect(tvl.verdict).toBe('unmeasurable');
    expect(tvl.refusals.map((r) => r.code)).toContain(CALIBRATION_CODES.ENVIRONMENT_UNNAMED);
    // The process DOES have a DATABASE_URL here, which is exactly why this is testable:
    // the refusal has to come from the explicit null and not from the absence of one.
    expect(environmentLabel(process.env.DATABASE_URL)).not.toBeNull();
    expect(JSON.stringify(tvl.frame)).not.toMatch(/local:|supabase:|external:/);
  });

  it('refuses to record a forecast at all when no database can be named', async () => {
    const out = await recordForecast(
      led!,
      {
        engine: 'test.noenv',
        engineVersion: 'v1',
        subjectType: 'test_subject',
        subjectId: pid(950),
        metricKey: 'conviction',
        kind: 'ordinal',
        predictedNum: 5,
        predictedAt: new Date('2026-01-25T10:00:00Z'),
        horizonDays: 30,
      },
      { databaseUrl: null },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.refusal.code).toBe(PLATFORM_FORECAST_CODES.ENVIRONMENT_UNNAMED);
      expect(out.refusal.environment).toBeNull();
    }
    const { rows } = await led!.query(
      `SELECT count(*)::int AS n FROM platform_forecast WHERE subject_id=$1`,
      [pid(950)],
    );
    expect((rows[0] as { n: number }).n).toBe(0);
  });
});
