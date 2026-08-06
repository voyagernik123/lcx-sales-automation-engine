import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WITNESS_KEYS,
  crossExamineFlagged,
  crossExamineProject,
  readWitnesses,
  type AbsenceCauseKey,
  type Queryable,
  type WitnessKey,
} from '../crossExamine.js';
/*
 * THE ENGINE IS IMPORTED RELATIVELY, HERE AND NOWHERE ELSE. `apps/api/tsconfig.json`
 * excludes `src/**\/*.test.ts` from the emit build, so this specifier cannot produce
 * the TS6059 ("not under rootDir") that the same import in `crossExamine.ts` would —
 * see the "WHY THE ENGINE IS INJECTED" note at the top of that file. This is what
 * makes the two halves testable together before the barrel line lands.
 */
import {
  DETECTOR_THRESHOLDS_AS_MIRRORED,
  WITNESS_IDS,
  absent,
  crossExamine,
  isPresent,
  notLoaded,
  observed,
  withheld,
  type AbsenceCause,
  type CrossExamination,
  type WitnessId,
  type WitnessReading,
} from '../../../../../packages/shared/src/intel/witnesses.js';

const ENGINE = { notLoaded, withheld, absent, observed, crossExamine };

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV = 'localhost/lcx_sales';
const PID = '11111111-2222-3333-4444-555555555555';

interface Call { readonly text: string; readonly params: readonly unknown[] }

interface Fixtures {
  readonly project?: Record<string, unknown> | null;
  readonly venues?: Record<string, unknown>;
  readonly fdv?: Record<string, unknown> | null;
  readonly flagged?: readonly Record<string, unknown>[];
  /** What `count(DISTINCT subject_id)` returns. Defaults to `flagged.length`, as pg's string. */
  readonly flaggedTotal?: unknown;
}

/**
 * A fake `Queryable` that routes on the statement text. No Postgres, on purpose: the
 * behaviour under test is which of four STATES a row shape maps to, and a live
 * database makes that harder to provoke, not easier — an all-NULL venue aggregate is
 * a three-line fixture here and a seeding exercise there.
 */
function fake(f: Fixtures): { q: Queryable; calls: Call[] } {
  const calls: Call[] = [];
  const q: Queryable = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('count(DISTINCT subject_id)')) {
        // pg returns count() as a STRING; an explicit `flaggedTotal: null` fixture is
        // how the "the population could not be counted" branch is provoked.
        const total = 'flaggedTotal' in f ? f.flaggedTotal : String((f.flagged ?? []).length);
        return { rows: [{ flagged_total: total }] };
      }
      if (text.includes('wash_trading_flag')) {
        // HONOURS `LIMIT $1`, because a fake that ignores the cap cannot show that the
        // cap is reported. This is the shape the truncation assertions rest on.
        const cap = Number(params[0] ?? 0);
        return { rows: [...(f.flagged ?? [])].slice(0, Number.isFinite(cap) ? cap : undefined) };
      }
      if (text.includes("predicate = 'fdv_usd'")) return { rows: f.fdv ? [f.fdv] : [] };
      if (text.includes('FROM exchange_listings')) {
        return { rows: [f.venues ?? { venues: 0, venues_with_volume: 0, volume_sum: null, source_count: 0, first_source: null }] };
      }
      if (text.includes('FROM projects')) return { rows: f.project === null ? [] : [f.project ?? {}] };
      throw new Error(`unrouted statement: ${text.slice(0, 60)}`);
    },
  };
  return { q, calls };
}

/** A tracked project whose two detector columns are both populated and unremarkable. */
const PROJECT = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: PID,
  tier: 'tracked',
  // numeric arrives from pg as a STRING; the fixtures keep that shape deliberately.
  market_cap_usd: '100000000',
  volume_24h_usd: '100000000',
  last_enriched_at: new Date('2026-08-05T00:00:00.000Z'),
  exchanges_synced_at: new Date('2026-08-05T00:00:00.000Z'),
  ...over,
});

const read = (f: Fixtures) => readWitnesses(fake(f).q, PID, ENGINE, { environment: ENV, examinedAt: '2026-08-06T12:00:00.000Z' });
const examine = (f: Fixtures): Promise<CrossExamination> =>
  crossExamineProject(fake(f).q, PID, ENGINE, { environment: ENV, examinedAt: '2026-08-06T12:00:00.000Z' });

const codes = (x: CrossExamination): string[] => x.refusals.map((r) => r.code);

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE TWO PINS — a mirrored constant is a second place to forget                   */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the mirrors are pinned rather than trusted', () => {
  it('keeps the reader\'s witness keys identical to the engine\'s, in order', () => {
    // Not merely the same set: the engine fixes `values`/`between`/list order by
    // declaration order, so a reordering here would silently swap a pair's sides.
    expect([...WITNESS_KEYS]).toEqual([...WITNESS_IDS]);
    // And the compiler agrees the two unions are the same union.
    const bothWays: WitnessId = 'volume_venue_sum' satisfies WitnessKey;
    expect(bothWays).toBe('volume_venue_sum');
  });

  it('keeps the reader\'s absence causes identical to the engine\'s', () => {
    const causes: readonly AbsenceCauseKey[] = ['column_null', 'no_rows', 'no_observation', 'not_collected_for_this_tier'];
    for (const c of causes) {
      const asEngine: AbsenceCause = c;
      expect(absent(asEngine).state).toBe('absent');
    }
  });

  it('fails if deception.ts\'s thresholds have drifted from the engine\'s copy', () => {
    /*
     * THE RATCHET FOR THE COPY. `packages/shared/src/intel/witnesses.ts` reproduces
     * three constants that live in a file this lane does not own and that does not
     * export them. If they are retuned there and not here, the materiality gate goes
     * on answering a question the production detector has stopped asking — which is a
     * silent wrong answer, the worst kind. So the source is read off disk.
     */
    const src = readFileSync(resolve(HERE, '../deception.ts'), 'utf8');
    const grab = (re: RegExp): number => {
      const m = re.exec(src);
      expect(m, `pattern ${re} no longer matches deception.ts — has it been rewritten?`).toBeTruthy();
      return Number((m![1] ?? '').replace(/_/g, ''));
    };
    expect(grab(/TURNOVER_SUSPECT\s*=\s*([\d._]+)/)).toBe(DETECTOR_THRESHOLDS_AS_MIRRORED.turnoverSuspect);
    expect(grab(/THIN_CAP_USD\s*=\s*([\d._]+)/)).toBe(DETECTOR_THRESHOLDS_AS_MIRRORED.thinCapUsd);
    expect(grab(/mcap\s*<\s*THIN_CAP_USD\s*&&\s*turnover\s*>=\s*([\d._]+)/))
      .toBe(DETECTOR_THRESHOLDS_AS_MIRRORED.thinCapTurnover);
    // And the flag it writes is still the one three surfaces react to.
    expect(src).toContain("predicate: 'wash_trading_flag'");
  });

  it('fails if deception.ts\'s POPULATION predicate has drifted from the engine\'s copy', () => {
    /*
     * THE PRECONDITION THAT IS NOT A NUMBER, pinned the same way the three numbers are.
     * The detector selects `WHERE tier = 'tracked'`: outside that tier there is no
     * verdict to reproduce, and reproducing the arithmetic anyway reports a live
     * suppression for a project the detector never scans. If this predicate is widened
     * or dropped in deception.ts and not here, the engine's population gate starts
     * refusing verdicts production is in fact reaching — so this must fail, loudly.
     */
    const src = readFileSync(resolve(HERE, '../deception.ts'), 'utf8');
    expect(src).toMatch(new RegExp(`WHERE tier = '${DETECTOR_POPULATION_TIER}'`));
    expect(DETECTOR_POPULATION_TIER).toBe('tracked');
    // …and the population is still narrowed by tier at all, in the query that feeds it.
    expect(/FROM projects\s+WHERE tier =/.test(src)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE SQL                                                                        */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('every statement is parameterised', () => {
  it('never puts the subject id in the statement text', async () => {
    const { q, calls } = fake({ project: PROJECT(), fdv: { value_num: '2e8', observed_at: null, source: 'defillama', reliability: 'A' } });
    await readWitnesses(q, PID, ENGINE, { environment: ENV });
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls) {
      expect(c.text).not.toContain(PID);
      expect(c.params.length).toBeGreaterThan(0);
      expect(c.params).toContain(PID);
    }
  });

  it('reads witness C — the fdv_usd observation no engine read before', async () => {
    const { q, calls } = fake({ project: PROJECT(), fdv: { value_num: '4e8', observed_at: null, source: 'defillama', reliability: 'A' } });
    await readWitnesses(q, PID, ENGINE, { environment: ENV });
    const c = calls.find((x) => x.text.includes("predicate = 'fdv_usd'"));
    expect(c, 'witness C was never queried').toBeTruthy();
    expect(c!.text).toContain('FROM observations');
    expect(c!.text).toContain('ORDER BY observed_at DESC');
  });

  it('writes nothing — the sweep over flagged projects is read-only', async () => {
    const { q, calls } = fake({ project: PROJECT(), flagged: [{ subject_id: PID }] });
    const sweep = await crossExamineFlagged(q, ENGINE, { environment: ENV });
    expect(sweep.scanned).toBe(1);
    expect(sweep.examinations).toHaveLength(1);
    for (const c of calls) {
      expect(c.text).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE FOUR STATES, AS THEY ARISE FROM REAL ROW SHAPES                             */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('witness B, the per-venue sum', () => {
  it('refuses when venues exist but none records a volume — SUM of all-NULL is NULL, not 0', async () => {
    const b = (await read({
      project: PROJECT(),
      venues: { venues: 5, venues_with_volume: 0, volume_sum: null, source_count: 1, first_source: 'coinpaprika' },
    })).readings.volume_venue_sum as WitnessReading;
    expect(b.state).toBe('absent');
    expect(b).not.toHaveProperty('value');
    expect(b.state === 'absent' && b.because).toBe('column_null');
    expect(b.state === 'absent' && b.note).toMatch(/5 venue/);
  });

  it('refuses on zero venue rows as a coverage gap, not a volume of zero', async () => {
    const b = (await read({ project: PROJECT(), venues: { venues: 0, venues_with_volume: 0, volume_sum: null } })).readings.volume_venue_sum;
    expect(b.state).toBe('absent');
    expect(b.state === 'absent' && b.because).toBe('no_rows');
  });

  it('names a catalog-tier project\'s absence as structural, because nothing will ever fill it', async () => {
    // enrich/exchanges.ts only ever selects tier = 'tracked'. Telling an operator to
    // "wait for enrichment" on a catalog project would be advice that never comes true.
    const b = (await read({ project: PROJECT({ tier: 'catalog' }), venues: { venues: 0, venues_with_volume: 0, volume_sum: null } })).readings.volume_venue_sum;
    expect(b.state === 'absent' && b.because).toBe('not_collected_for_this_tier');
  });

  it('reports a genuine zero as a value, which is the whole point of the distinction', async () => {
    const b = (await read({
      project: PROJECT(),
      venues: { venues: 3, venues_with_volume: 3, volume_sum: '0', source_count: 1, first_source: 'coinpaprika' },
    })).readings.volume_venue_sum;
    expect(b.state).toBe('present');
    expect(isPresent(b) && b.value).toBe(0);
  });

  it('coerces pg\'s numeric-as-string and says how partial the sum is', async () => {
    const b = (await read({
      project: PROJECT(),
      venues: { venues: 7, venues_with_volume: 4, volume_sum: '95000000.5', source_count: 1, first_source: 'coinpaprika', last_seen_at: new Date('2026-08-05T06:00:00.000Z') },
    })).readings.volume_venue_sum;
    expect(isPresent(b) && b.value).toBe(95_000_000.5);
    expect(isPresent(b) && b.observedAt).toBe('2026-08-05T06:00:00.000Z');
    expect(isPresent(b) && b.caveats.join(' ')).toMatch(/4 of 7 venue/);
  });

  it('says when the second witness came from the same provider as the first', async () => {
    const b = (await read({
      project: PROJECT(),
      venues: { venues: 2, venues_with_volume: 2, volume_sum: '9e7', source_count: 1, first_source: 'coingecko' },
    })).readings.volume_venue_sum;
    // Differently derived is not independently sourced, and a panel must not imply it is.
    expect(isPresent(b) && b.caveats.join(' ')).toMatch(/same provider/i);
  });
});

describe('the project row and witness C', () => {
  it('refuses a NULL market cap rather than defaulting the denominator', async () => {
    const x = await examine({ project: PROJECT({ market_cap_usd: null }) });
    expect(x.readings.size_projects_row.state).toBe('absent');
    expect(x.bandAsDetected).toBeNull();
    expect(x.suppressesAsDetected).toBeNull();
    expect(codes(x)).toContain('XWIT_RATIO_DENOMINATOR_ABSENT');
  });

  it('refuses both project-row witnesses when the subject itself is not there', async () => {
    const w = (await read({ project: null })).readings;
    expect(w.volume_projects_row.state).toBe('absent');
    expect(w.size_projects_row.state).toBe('absent');
    expect(w.volume_projects_row).not.toHaveProperty('value');
  });

  it('refuses a missing fdv_usd observation as "never matched", not as no size', async () => {
    const c = (await read({ project: PROJECT(), fdv: null })).readings.size_defillama;
    expect(c.state === 'absent' && c.because).toBe('no_observation');
  });

  it('carries witness C\'s Admiralty grade and the symbol-collision caveat when it is not A', async () => {
    const c = (await read({
      project: PROJECT(),
      fdv: { value_num: '4e8', observed_at: new Date('2026-08-04T00:00:00.000Z'), source: 'defillama', reliability: 'B' },
    })).readings.size_defillama;
    expect(isPresent(c) && c.reliability).toBe('B');
    expect(isPresent(c) && c.caveats.join(' ')).toMatch(/symbol collision/i);
    // …and never as a fully diluted valuation, whatever the predicate is called.
    expect(isPresent(c) && c.caveats.join(' ')).toMatch(/not verified to be a fully diluted/i);
  });

  it('marks a withheld witness withheld, never absent', async () => {
    const w = (await readWitnesses(fake({ project: PROJECT() }).q, PID, ENGINE, {
      environment: ENV,
      withhold: ['size_defillama'],
      withholdCompartment: 'gps',
    })).readings;
    expect(w.size_defillama.state).toBe('withheld');
    expect(w.size_defillama.state === 'withheld' && w.size_defillama.compartment).toBe('gps');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE TWO HALVES, COMPOSED — the numbers a human then acts on                     */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the reader and the engine together', () => {
  it('escalates when witness C\'s size flips the suppression', async () => {
    /*
     * $2.2M of volume on a $1M recorded cap → turnover 2.20, over the hardcoded 2.0,
     * so today this project is flagged and drops out of Targets, the DailyBrief and
     * the I&W list. DefiLlama says the token is $4M, which puts turnover at 0.55 —
     * under both limbs. The suppression rests entirely on which size is believed.
     */
    const x = await examine({
      project: PROJECT({ market_cap_usd: '1000000', volume_24h_usd: '2200000' }),
      venues: { venues: 0, venues_with_volume: 0, volume_sum: null },
      fdv: { value_num: '4000000', observed_at: new Date('2026-08-04T00:00:00.000Z'), source: 'defillama', reliability: 'A' },
    });
    expect(x.bandAsDetected).toBe('wash_suspected');
    expect(x.suppressesAsDetected).toBe(true);
    const d = x.disagreements.find((y) => y.quantity === 'size_usd');
    expect(d?.between).toEqual(['size_projects_row', 'size_defillama']);
    expect(d?.suppressionUnder).toEqual([true, false]);
    expect(d?.materiality).toBe('material');
    expect(d?.disposition).toBe('escalated');
    expect(x.escalate).toBe(true);
    // The escalation must not read as an accusation.
    expect(d?.sentence).toMatch(/no recorded derivation/i);
  });

  it('records, without escalating, a gap that only moves between the two flagging limbs', async () => {
    // $1M cap. Project row says $3.0M traded (turnover 3.00 → wash_suspected); the
    // venue sum says $1.2M (turnover 1.20 on a sub-$5M cap → thin_cap_hot). Both
    // limbs write the same flag, so nothing a human acts on has changed.
    const x = await examine({
      project: PROJECT({ market_cap_usd: '1000000', volume_24h_usd: '3000000' }),
      venues: { venues: 4, venues_with_volume: 4, volume_sum: '1200000', source_count: 1, first_source: 'coinpaprika' },
    });
    const d = x.disagreements.find((y) => y.quantity === 'volume_24h_usd');
    expect(d?.bandUnder).toEqual(['wash_suspected', 'thin_cap_hot']);
    expect(d?.bandMoved).toBe(true);
    expect(d?.suppressionFlips).toBe(false);
    expect(d?.disposition).toBe('recorded');
    expect(x.escalate).toBe(false);
  });

  it('corroborates two agreeing volume witnesses without claiming they are right', async () => {
    const x = await examine({
      project: PROJECT(),
      venues: { venues: 6, venues_with_volume: 6, volume_sum: '95000000', source_count: 2, first_source: 'coinpaprika' },
    });
    expect(x.corroborations.map((c) => c.quantity)).toContain('volume_24h_usd');
    expect(x.corroborations[0]!.certainty).toBe('corroborated_not_proved');
    expect(x.disagreements.filter((d) => d.quantity === 'volume_24h_usd')).toEqual([]);
    expect(x.escalate).toBe(false);
  });

  it('returns every refusal, and an environment label on the frame', async () => {
    const x = await examine({
      project: PROJECT(),
      venues: { venues: 0, venues_with_volume: 0, volume_sum: null },
      fdv: null,
    });
    expect(x.frame.environment).toBe(ENV);
    // Two absent witnesses and two uncorroborated quantities — all four reported.
    expect(codes(x).filter((c) => c === 'XWIT_WITNESS_ABSENT')).toHaveLength(2);
    expect(codes(x).filter((c) => c === 'XWIT_NO_CORROBORATING_WITNESS')).toHaveLength(2);
    expect(codes(x)).not.toContain('XWIT_ENVIRONMENT_UNLABELLED');
  });

  it('refuses the environment label rather than inventing one', async () => {
    const x = await crossExamineProject(fake({ project: PROJECT() }).q, PID, ENGINE, { examinedAt: '2026-08-06T12:00:00.000Z' });
    expect(x.environment).toBeNull();
    expect(codes(x)).toContain('XWIT_ENVIRONMENT_UNLABELLED');
  });

  it('marks an unqueried witness not-loaded, distinct from absent and from zero', async () => {
    // `notLoaded` is the state a caller reaches for when it deliberately reads a
    // subset; asserted here so the constructor the reader depends on cannot be
    // dropped from the engine without this failing.
    const bundle = await read({
      project: PROJECT(),
      venues: { venues: 6, venues_with_volume: 6, volume_sum: '95000000', source_count: 2, first_source: 'coinpaprika' },
    });
    const unasked = ENGINE.notLoaded();
    expect(unasked.state).toBe('not_loaded');
    expect(unasked).not.toHaveProperty('value');
    const x = crossExamine({ ...bundle, readings: { ...bundle.readings, size_defillama: unasked } });
    expect(x.frame.witnessesNotLoaded).toEqual(['size_defillama']);
    expect(codes(x)).toContain('XWIT_WITNESS_NOT_LOADED');
    // The one witness with nothing to say was NOT read; it is not reported as empty.
    expect(codes(x)).not.toContain('XWIT_WITNESS_ABSENT');
  });
});
