import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SWEEP_REFUSAL_CODES,
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
  DETECTOR_POPULATION_TIER,
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
    // `examined`, not the old `scanned`: that name was documented as "how many flagged
    // subjects the sweep looked at", which a caller reads as the population. See the
    // truncation tests below for what now travels with it.
    expect(sweep.examined).toBe(1);
    expect(sweep.examinations).toHaveLength(1);
    for (const c of calls) {
      expect(c.text).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* A TRUNCATED SWEEP IS NOT THE POPULATION                                         */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the sweep over the flagged population', () => {
  /** n distinct, well-formed subject ids, so the reader's `str()` filter keeps them all. */
  const flaggedIds = (n: number): Record<string, unknown>[] =>
    Array.from({ length: n }, (_, i) => ({
      subject_id: `${String(i).padStart(8, '0')}-2222-3333-4444-555555555555`,
    }));

  const sweep = (f: Fixtures, limit: number) =>
    crossExamineFlagged(fake(f).q, ENGINE, { environment: ENV, examinedAt: '2026-08-06T12:00:00.000Z', limit });

  it('reports the whole book as the whole book, and refuses nothing', async () => {
    const s = await sweep({ project: PROJECT(), flagged: flaggedIds(3) }, 10);
    expect(s.examined).toBe(3);
    expect(s.flaggedTotal).toBe(3);
    expect(s.limit).toBe(10);
    expect(s.truncated).toBe(false);
    expect(s.refusals).toEqual([]);
  });

  it('refuses to let a capped sweep read as the population', async () => {
    /*
     * THE DEFECT. The old return was `{ scanned, examinations }` and nothing else, with a
     * cap of 200 — so over 250 flagged projects it returned 200 and said nothing, and a
     * panel built on it would have reported "200 suppressed projects cross-examined" as
     * the whole book. That is the same shape of lie as an empty list reading as "nothing
     * happened", so the cap, the count and a refusal all travel with the result.
     */
    const s = await sweep({ project: PROJECT(), flagged: flaggedIds(7) }, 2);
    expect(s.examined).toBe(2);
    expect(s.flaggedTotal).toBe(7);
    expect(s.truncated).toBe(true);
    const ref = s.refusals.find((r) => r.code === 'XWIT_FLAGGED_POPULATION_TRUNCATED');
    expect(ref, 'a capped sweep returned no truncation refusal').toBeTruthy();
    expect(ref!.sentence).toMatch(/2 suppressed project\(s\) of 7 flagged/);
    expect(ref!.rule.provision).toBe('absent data refuses');
    // And every one of the codes it can emit is in the register beside it.
    for (const r of s.refusals) expect(SWEEP_REFUSAL_CODES).toContain(r.code);
  });

  it('keeps an uncountable population apart from an empty one, and returns BOTH refusals', async () => {
    /*
     * An unreadable `count()` is not a count of zero. And a FULL page is evidence on its
     * own that there may be more, which is what keeps `truncated` honest when the count
     * could not be read — two independent grounds, and the house pattern is to return
     * every refusal, not the first one found.
     */
    const s = await sweep({ project: PROJECT(), flagged: flaggedIds(2), flaggedTotal: null }, 2);
    expect(s.flaggedTotal).toBeNull();
    expect(s.truncated).toBe(true);
    expect(s.refusals.map((r) => r.code).sort())
      .toEqual(['XWIT_FLAGGED_POPULATION_TRUNCATED', 'XWIT_FLAGGED_POPULATION_UNCOUNTED']);
    expect(s.refusals.find((r) => r.code === 'XWIT_FLAGGED_POPULATION_TRUNCATED')!.sentence)
      .toMatch(/an unknown number/);
  });

  it('says nothing was examined without saying nothing is flagged', async () => {
    // The genuinely-empty case, which must stay distinguishable from the two above.
    const s = await sweep({ project: PROJECT(), flagged: [] }, 10);
    expect(s.examined).toBe(0);
    expect(s.flaggedTotal).toBe(0);
    expect(s.truncated).toBe(false);
    expect(s.refusals).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* A BLANK COLUMN IS AN ABSENCE, NEVER A ZERO                                      */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the coercions manufacture no zeroes', () => {
  it('refuses a whitespace-only market cap instead of reading it as a $0 cap', async () => {
    /*
     * THE DEFECT, IN THE GUARD WRITTEN TO PREVENT IT. `num()` exists because
     * `Number(null)` is 0; it checked `''` and not whitespace, and `Number('  ')` is also
     * 0. So a blank-ish numeric column became a PRESENT reading with `value: 0` — a
     * genuine zero market cap — which the engine then correctly refuses to divide by but
     * reports as a recorded figure rather than as an enrichment gap.
     */
    const w = (await read({ project: PROJECT({ market_cap_usd: '   ' }) })).readings;
    expect(w.size_projects_row.state).toBe('absent');
    expect(w.size_projects_row).not.toHaveProperty('value');
    expect(w.size_projects_row.state === 'absent' && w.size_projects_row.because).toBe('column_null');
  });

  it('refuses every other shape Number() turns into 0, because the allow-list is the point', async () => {
    // `Number('')`, `Number('  ')`, `Number('\t\n')`, `Number(false)` and `Number([])`
    // are all 0. Only a number, a bigint, or a string that parses finite gets through.
    for (const blank of ['', '  ', '\t\n', false, [], {}, 'n/a', null, undefined]) {
      const w = (await read({ project: PROJECT({ volume_24h_usd: blank }) })).readings;
      expect(
        w.volume_projects_row.state,
        `Number(${JSON.stringify(blank) ?? String(blank)}) must not become a present reading`,
      ).toBe('absent');
    }
    // …and a real numeric-as-string still gets through, or the allow-list would be a wall.
    const ok = (await read({ project: PROJECT({ volume_24h_usd: ' 1.25e8 ' }) })).readings.volume_projects_row;
    expect(isPresent(ok) && ok.value).toBe(1.25e8);
  });

  it('leaves the venue count UNKNOWN when it does not read as a number, rather than asserting zero rows', async () => {
    /*
     * The removed `int()` was `num(v) ?? 0` applied to the load-bearing venue
     * discriminator — the count that separates "no venue rows at all" from "rows that
     * record no volume". A NULL count coerced to 0 produced the asserted note "no
     * exchange_listings rows for this project", a fact the query never established.
     */
    const b = (await read({
      project: PROJECT(),
      venues: { venues: null, venues_with_volume: null, volume_sum: null },
    })).readings.volume_venue_sum;
    expect(b.state === 'absent' && b.because).toBe('column_null');
    expect(b.state === 'absent' && b.note).toMatch(/unknown/);
    expect(b.state === 'absent' && b.note).not.toMatch(/no exchange_listings rows/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE TIER IS NOT A WITNESS                                                       */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a clearance boundary rewrites no other witness\'s absence cause', () => {
  const CATALOG_NO_VENUES = {
    project: PROJECT({ tier: 'catalog' }),
    venues: { venues: 0, venues_with_volume: 0, volume_sum: null },
  };

  it('reads the tier even when BOTH project-row witnesses are withheld', async () => {
    /*
     * THE DEFECT THIS PINS. Skipping the `projects` SELECT when neither project-row
     * witness would be reported left `tier` null, which did two things at once: it erased
     * the engine's population gate, and it downgraded witness B's absence from STRUCTURAL
     * (`not_collected_for_this_tier` — the exchange sync only ever visits tier = 'tracked',
     * enrich/exchanges.ts:83) to CONTINGENT (`no_rows`). The second is the one that costs
     * a human time: it tells an operator to go and wait for enrichment that is never
     * coming. A need-to-know boundary on one witness must not do that to another.
     */
    const bundle = await readWitnesses(fake(CATALOG_NO_VENUES).q, PID, ENGINE, {
      environment: ENV,
      examinedAt: '2026-08-06T12:00:00.000Z',
      withhold: ['volume_projects_row', 'size_projects_row'],
      withholdCompartment: 'gps',
    });
    expect(bundle.readings.volume_projects_row.state).toBe('withheld');
    expect(bundle.readings.size_projects_row.state).toBe('withheld');
    expect(bundle.subjectTier).toBe('catalog');
    const b = bundle.readings.volume_venue_sum;
    expect(b.state === 'absent' && b.because).toBe('not_collected_for_this_tier');
    // …and the engine still knows production never scans this subject.
    expect(crossExamine(bundle).detectorPopulation).toBe('outside_population');
  });

  it('reads the tier — and only the tier — when neither project-row witness is in the read subset', async () => {
    const { q, calls } = fake(CATALOG_NO_VENUES);
    const bundle = await readWitnesses(q, PID, ENGINE, {
      environment: ENV,
      examinedAt: '2026-08-06T12:00:00.000Z',
      read: ['volume_venue_sum'],
    });
    // The two witness COLUMNS are genuinely never selected, so both are not-loaded …
    expect(bundle.readings.volume_projects_row.state).toBe('not_loaded');
    expect(bundle.readings.size_projects_row.state).toBe('not_loaded');
    const projectCall = calls.find((c) => c.text.includes('FROM projects'));
    expect(projectCall, 'the projects row was not read at all, so the tier is unknowable').toBeTruthy();
    expect(projectCall!.text).toContain('tier');
    expect(projectCall!.text).not.toContain('market_cap_usd');
    expect(projectCall!.text).not.toContain('volume_24h_usd');
    // … while the tier, which is not a witness, is read anyway, and witness B's absence
    // is still the structural one.
    expect(bundle.subjectTier).toBe('catalog');
    const b = bundle.readings.volume_venue_sum;
    expect(b.state === 'absent' && b.because).toBe('not_collected_for_this_tier');
  });

  it('reports the tier as unknown, not as a witness gap, when there is no projects row', async () => {
    // No row means no tier, and no tier means the engine refuses the verdict rather than
    // assuming either way. The witnesses' own absence is a separate refusal.
    const bundle = await readWitnesses(fake({ project: null }).q, PID, ENGINE, { environment: ENV });
    expect(bundle.subjectTier).toBeNull();
    expect(crossExamine(bundle).detectorPopulation).toBe('unknown');
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
    expect(codes(x)).toContain('XWIT_RATIO_DENOMINATOR_UNUSABLE');
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

  it('marks a witness outside the read subset not-loaded, distinct from absent and from zero', async () => {
    /*
     * NOT A HAND-BUILT READING ANY MORE, AND THAT WAS THE WHOLE DEFECT. The previous
     * version of this test called `ENGINE.notLoaded()` itself and injected it into an
     * already-read bundle, so it exercised the engine's own already-tested constructor
     * and proved nothing about the reader — while claiming to prove "the constructor the
     * reader depends on cannot be dropped". The reader depended on no such thing:
     * `notLoaded` appeared in crossExamine.ts only as an interface member and
     * `readWitnesses` could not emit `not_loaded` on any path, so the fourth state was an
     * overclaim. `read` is now that path, and this test goes through it.
     */
    const { q, calls } = fake({
      project: PROJECT(),
      venues: { venues: 6, venues_with_volume: 6, volume_sum: '95000000', source_count: 2, first_source: 'coinpaprika' },
      // A matchable observation IS on disk. If the reader queried it, the witness would
      // come back present — which is what makes not_loaded here a fact about the read.
      fdv: { value_num: '1e8', observed_at: null, source: 'defillama', reliability: 'A' },
    });
    const bundle = await readWitnesses(q, PID, ENGINE, {
      environment: ENV,
      examinedAt: '2026-08-06T12:00:00.000Z',
      read: ['volume_projects_row', 'volume_venue_sum', 'size_projects_row'],
    });
    const unasked = bundle.readings.size_defillama;
    expect(unasked.state).toBe('not_loaded');
    expect(unasked).not.toHaveProperty('value');
    // …and it is not-loaded because the statement was never issued, not because a
    // constructor was called on its behalf.
    expect(calls.some((c) => c.text.includes("predicate = 'fdv_usd'"))).toBe(false);

    const x = crossExamine(bundle);
    expect(x.frame.witnessesNotLoaded).toEqual(['size_defillama']);
    expect(codes(x)).toContain('XWIT_WITNESS_NOT_LOADED');
    // The one witness with nothing to say was NOT read; it is not reported as empty.
    expect(codes(x)).not.toContain('XWIT_WITNESS_ABSENT');
  });

  it('reports NO production verdict for a project the detector never scans', async () => {
    /*
     * THE HEADLINE DEFECT, AT THE SEAM BETWEEN THE TWO HALVES. The reader selected
     * `tier`, stored it, and used it two branches later to name witness B's absence — and
     * then never handed it to the engine. So the identical $2.2M-on-$1M arithmetic that
     * escalates in the first test of this block was reported as a live `wash_suspected`
     * suppression, with `escalate: true`, for a catalog-tier project `deception.ts:35`
     * never looks at. Nothing about such a project is suppressed, so nothing can flip.
     */
    const x = await examine({
      project: PROJECT({ tier: 'catalog', market_cap_usd: '1000000', volume_24h_usd: '2200000' }),
      venues: { venues: 0, venues_with_volume: 0, volume_sum: null },
      fdv: { value_num: '4000000', observed_at: null, source: 'defillama', reliability: 'A' },
    });
    expect(x.frame.subjectTier).toBe('catalog');
    expect(x.detectorPopulation).toBe('outside_population');
    expect(x.bandAsDetected).toBeNull();
    expect(x.suppressesAsDetected).toBeNull();
    expect(x.escalate).toBe(false);
    expect(codes(x)).toContain('XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION');
    // Filed as outside-the-population, which is not a weaker `immaterial`: an immaterial
    // gap is one production weighed and would decide the same way either side, while this
    // one production never weighed at all.
    expect(x.disagreements.map((d) => d.quantity)).toEqual(['size_usd']);
    expect(x.disagreements[0]!.materiality).toBe('outside_detector_population');
    expect(x.disagreements[0]!.bandUnder).toEqual([null, null]);
  });

  it('refuses the verdict rather than assuming a tier when the row records none', async () => {
    const x = await examine({ project: PROJECT({ tier: null }) });
    expect(x.frame.subjectTier).toBeNull();
    expect(x.detectorPopulation).toBe('unknown');
    expect(x.bandAsDetected).toBeNull();
    expect(codes(x)).toContain('XWIT_DETECTOR_POPULATION_UNKNOWN');
    // "We did not read the tier" and "production does not scan this tier" call for
    // different things from whoever reads it, so they never share a code.
    expect(codes(x)).not.toContain('XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION');
  });
});
