import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPUTE_TOLERANCE,
  DETECTOR_MIRROR_SOURCE,
  DETECTOR_POPULATION_TIER,
  DETECTOR_THRESHOLDS_AS_MIRRORED,
  TURNOVER_SUSPECT_HAS_NO_RECORDED_DERIVATION,
  WITNESSES,
  WITNESS_IDS,
  absent,
  bandSuppresses,
  crossExamine,
  detectorPopulationOfTier,
  isPresent,
  notLoaded,
  observed,
  relativeGap,
  suspicionBand,
  withheld,
  type CrossExamineInput,
  type WitnessReading,
  type WitnessRefusalCode,
} from './witnesses.js';

/*
 * ══════════════════════════════════════════════════════════════════════════════
 *  WHAT THESE TESTS ARE FOR
 * ══════════════════════════════════════════════════════════════════════════════
 * The numbers below are hand-computed from the detector's own arithmetic
 * (`apps/api/src/intel/deception.ts`), NOT read off this module's output. That
 * matters here more than usual: a wash-trading flag multiplies conviction by 0.4
 * (`packages/shared/src/alpha.ts:266`), and `apps/api/src/intel/iw.ts:43` admits
 * an indication only at `conviction >= 40`. So a flag on a 95-conviction project
 * takes it to 38 and it leaves the I&W list entirely. A test written after the
 * fact would prove nothing about the number a human then acts on.
 */

/** Every reading present and plausible; individual tests override one field. */
const READINGS = (over: Partial<Record<string, WitnessReading>> = {}): CrossExamineInput['readings'] => ({
  volume_projects_row: observed(1e8, { observedAt: '2026-08-05T00:00:00.000Z', source: 'coingecko' }),
  volume_venue_sum: observed(9.5e7, { observedAt: '2026-08-05T00:00:00.000Z', source: 'coinpaprika' }),
  size_projects_row: observed(1e8, { observedAt: '2026-08-05T00:00:00.000Z', source: 'coingecko' }),
  size_defillama: notLoaded(),
  ...over,
} as CrossExamineInput['readings']);

const input = (over: Partial<CrossExamineInput> = {}): CrossExamineInput => ({
  subjectId: 'p-1',
  environment: 'localhost/lcx_sales',
  examinedAt: '2026-08-06T12:00:00.000Z',
  // TRACKED ON PURPOSE, AND NAMED IN EVERY FIXTURE. `deception.ts:35` scans only this
  // tier, so every assertion below about a production verdict is conditional on it. A
  // default inside the engine would have hidden that; the field is required and this
  // helper is where the choice is visible.
  subjectTier: 'tracked',
  readings: READINGS(),
  ...over,
});

const codes = (r: { refusals: readonly { code: WitnessRefusalCode }[] }): WitnessRefusalCode[] =>
  r.refusals.map((x) => x.code);

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE MIRROR — this module reproduces a threshold it does not own                 */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the mirrored detector', () => {
  it('reproduces deception.ts\'s three constants exactly', () => {
    // If these drift, the materiality gate is answering a question the production
    // detector is no longer asking. The api-side test reads deception.ts off disk
    // and fails on drift; this one pins the values a human can read.
    expect(DETECTOR_THRESHOLDS_AS_MIRRORED.turnoverSuspect).toBe(2.0);
    expect(DETECTOR_THRESHOLDS_AS_MIRRORED.thinCapUsd).toBe(5_000_000);
    expect(DETECTOR_THRESHOLDS_AS_MIRRORED.thinCapTurnover).toBe(1.0);
    expect(DETECTOR_MIRROR_SOURCE).toBe('apps/api/src/intel/deception.ts');
  });

  it('says out loud that 2.0 has no recorded derivation', () => {
    // The module must not present the threshold as established. This string is what
    // a surface shows beside an escalation.
    expect(TURNOVER_SUSPECT_HAS_NO_RECORDED_DERIVATION).toMatch(/no recorded derivation/i);
  });

  it('bands a turnover the way the detector does', () => {
    // turnover 3.0 ≥ 2.0
    expect(suspicionBand(3e6, 1e6)).toBe('wash_suspected');
    // turnover 1.5, cap under $5M → the thin-cap limb
    expect(suspicionBand(1.5e6, 1e6)).toBe('thin_cap_hot');
    // turnover 1.5 on a $100M cap → the thin-cap limb does not apply
    expect(suspicionBand(1.5e8, 1e8)).toBe('clean');
    // exactly at the boundary: the detector uses >=, so 2.0 flags
    expect(suspicionBand(2e8, 1e8)).toBe('wash_suspected');
    expect(suspicionBand(1.999e8, 1e8)).toBe('clean');
  });

  it('refuses rather than divides when the denominator is not usable', () => {
    expect(suspicionBand(1e6, 0)).toBeNull();
    expect(suspicionBand(1e6, -5)).toBeNull();
  });

  it('reproduces the POPULATION predicate, not only the arithmetic', () => {
    // deception.ts:35 — `WHERE tier = 'tracked'`. Three states, and 'unknown' is not
    // 'outside': one is a gap in this examination, the other a fact about production.
    expect(DETECTOR_POPULATION_TIER).toBe('tracked');
    expect(detectorPopulationOfTier('tracked')).toBe('in_population');
    expect(detectorPopulationOfTier('catalog')).toBe('outside_population');
    expect(detectorPopulationOfTier('discovery')).toBe('outside_population');
    expect(detectorPopulationOfTier(null)).toBe('unknown');
    expect(detectorPopulationOfTier('')).toBe('unknown');
  });

  it('separates the two flagging limbs but treats both as suppressing', () => {
    // BOTH limbs write the same observation, so both cost a project 60% of its
    // conviction. A move between them is therefore not a decision change.
    expect(bandSuppresses('clean')).toBe(false);
    expect(bandSuppresses('thin_cap_hot')).toBe(true);
    expect(bandSuppresses('wash_suspected')).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE THREE — four, here — STATES                                                */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a witness state never collapses into another', () => {
  it('distinguishes a genuine zero from an absence and from a value never loaded', () => {
    const zero = observed(0, { observedAt: null, source: 'coinpaprika' });
    expect(zero.state).toBe('present');
    expect(isPresent(zero) && zero.value).toBe(0);

    const gone = absent('no_rows');
    expect(gone.state).toBe('absent');
    expect(isPresent(gone)).toBe(false);
    // The defect this module answers: an absence read as a zero.
    expect(gone).not.toHaveProperty('value');

    const unasked = notLoaded();
    expect(unasked.state).toBe('not_loaded');
    expect(unasked).not.toHaveProperty('value');

    const hidden = withheld('gps');
    expect(hidden.state).toBe('withheld');
    expect(hidden).not.toHaveProperty('value');
  });

  it('refuses for every non-present witness, with a distinct code each', () => {
    const r = crossExamine(input({
      readings: READINGS({
        volume_venue_sum: absent('no_rows'),
        size_defillama: withheld('gps'),
      }),
    }));
    // EVERY refusal, not the first (the house pattern, marketingDesk.ts:1207-1214).
    expect(codes(r)).toContain('XWIT_WITNESS_ABSENT');
    expect(codes(r)).toContain('XWIT_WITNESS_WITHHELD');
    // …and a withheld witness is not reported as absent.
    const withheldRefusal = r.refusals.find((x) => x.code === 'XWIT_WITNESS_WITHHELD');
    expect(withheldRefusal?.witness).toBe('size_defillama');
    const absentRefusal = r.refusals.find((x) => x.code === 'XWIT_WITNESS_ABSENT');
    expect(absentRefusal?.witness).toBe('volume_venue_sum');
  });

  it('carries a stable code, a sentence and the rule it applies on every refusal', () => {
    const r = crossExamine(input({ readings: READINGS({ volume_venue_sum: absent('column_null') }) }));
    expect(r.refusals.length).toBeGreaterThan(0);
    for (const ref of r.refusals) {
      expect(ref.code).toMatch(/^XWIT_[A-Z_]+$/);
      expect(ref.sentence.length).toBeGreaterThan(20);
      expect(ref.rule.instrument).toBe('LCX_HOUSE_DOCTRINE');
      expect(ref.rule.text.length).toBeGreaterThan(20);
    }
  });

  it('an absent witness produces no comparison at all, rather than a comparison against zero', () => {
    const r = crossExamine(input({ readings: READINGS({ volume_venue_sum: absent('no_rows') }) }));
    expect(r.disagreements).toEqual([]);
    expect(r.corroborations).toEqual([]);
    expect(codes(r)).toContain('XWIT_NO_CORROBORATING_WITNESS');
  });

  it('a genuine zero IS compared — that is the difference an absence makes', () => {
    const r = crossExamine(input({
      readings: READINGS({ volume_venue_sum: observed(0, { observedAt: null, source: 'coinpaprika' }) }),
    }));
    expect(r.disagreements).toHaveLength(1);
    const d = r.disagreements[0]!;
    expect(d.values).toEqual([1e8, 0]);
    expect(d.relativeGap).toBe(1);
    // No ratio exists against a zero, and 1 is not a safe default for one.
    expect(d.ratio).toBeNull();
    expect(codes(r)).not.toContain('XWIT_WITNESS_ABSENT');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* CORROBORATION IS NOT PROOF                                                     */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('two witnesses that agree', () => {
  it('corroborate, and say which witnesses over what window', () => {
    // 1e8 vs 9.5e7 → relative gap 0.05, inside the 0.20 tolerance.
    const r = crossExamine(input());
    expect(r.corroborations).toHaveLength(1);
    const c = r.corroborations[0]!;
    expect(c.quantity).toBe('volume_24h_usd');
    expect(c.witnesses).toEqual(['volume_projects_row', 'volume_venue_sum']);
    expect(c.relativeGap).toBeCloseTo(0.05, 10);
    expect(r.disagreements).toEqual([]);
    expect(r.escalate).toBe(false);
  });

  it('never launder corroboration into proof', () => {
    const c = crossExamine(input()).corroborations[0]!;
    expect(c.certainty).toBe('corroborated_not_proved');
    expect(c.sentence).toMatch(/corroborat/i);
    expect(c.sentence).not.toMatch(/\b(proves|proven|proof|confirmed|certain)\b/i);
  });

  it('names both witnesses\' derivations so "second opinion" is not implied', () => {
    // B is a differently-derived sum over a real FK, not a re-read of A.
    expect(WITNESSES.volume_venue_sum.derivation).toMatch(/exchange_listings/);
    expect(WITNESSES.volume_projects_row.derivation).toMatch(/projects\.volume_24h_usd/);
    expect(WITNESS_IDS).toHaveLength(4);
  });

  it('puts an environment label on the frame, and refuses when there is none', () => {
    expect(crossExamine(input()).frame.environment).toBe('localhost/lcx_sales');
    const r = crossExamine(input({ environment: null }));
    expect(r.frame.environment).toBeNull();
    expect(codes(r)).toContain('XWIT_ENVIRONMENT_UNLABELLED');
  });

  it('records the window and the named absences of the window', () => {
    const f = crossExamine(input()).frame;
    expect(f.examinedAt).toBe('2026-08-06T12:00:00.000Z');
    expect(f.window).toBe('rolling_24h_as_reported_by_each_source');
    expect(f.witnessesPresent).toEqual(['volume_projects_row', 'volume_venue_sum', 'size_projects_row']);
    expect(f.witnessesNotLoaded).toEqual(['size_defillama']);
    expect(f.doesNotCapture.length).toBeGreaterThan(2);
    expect(f.knownBiases.join(' ')).toMatch(/outlier/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE MATERIALITY GATE — the part that makes this usable rather than noisy        */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the materiality gate', () => {
  it('RECORDS a disagreement that moves the band but not the decision', () => {
    /*
     * cap $1M. A says $3.0M traded → turnover 3.00 → wash_suspected.
     * B says $1.2M traded → turnover 1.20, and the cap is under $5M → thin_cap_hot.
     * The band moved. The SUPPRESSION did not: both limbs write the same flag, so
     * the project loses 60% of its conviction either way. Escalating this is how a
     * human learns to close the panel.
     */
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(3e6, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: observed(1.2e6, { observedAt: null, source: 'coinpaprika' }),
        size_projects_row: observed(1e6, { observedAt: null, source: 'coingecko' }),
      }),
    }));
    expect(r.disagreements).toHaveLength(1);
    const d = r.disagreements[0]!;
    expect(d.relativeGap).toBeCloseTo(0.6, 10);
    expect(d.bandUnder).toEqual(['wash_suspected', 'thin_cap_hot']);
    expect(d.bandMoved).toBe(true);
    expect(d.suppressionUnder).toEqual([true, true]);
    expect(d.suppressionFlips).toBe(false);
    expect(d.materiality).toBe('immaterial');
    expect(d.disposition).toBe('recorded');
    expect(r.escalate).toBe(false);
  });

  it('ESCALATES a disagreement that flips the suppression', () => {
    /*
     * cap $100M. A says $250M traded → turnover 2.50 → wash_suspected → suppressed.
     * B says $100M traded → turnover 1.00 → clean → not suppressed.
     * One of these two numbers decides whether the project appears in Targets, the
     * DailyBrief and the I&W list at all.
     */
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(2.5e8, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: observed(1e8, { observedAt: null, source: 'coinpaprika' }),
      }),
    }));
    expect(r.disagreements).toHaveLength(1);
    const d = r.disagreements[0]!;
    expect(d.bandUnder).toEqual(['wash_suspected', 'clean']);
    expect(d.suppressionUnder).toEqual([true, false]);
    expect(d.suppressionFlips).toBe(true);
    expect(d.materiality).toBe('material');
    expect(d.disposition).toBe('escalated');
    expect(r.escalate).toBe(true);
  });

  it('leaves a gap inside the tolerance alone entirely', () => {
    expect(DEFAULT_DISPUTE_TOLERANCE).toBe(0.2);
    // Same suppression on both sides AND inside tolerance → corroboration, no entry.
    const r = crossExamine(input());
    expect(r.disagreements).toEqual([]);
  });

  it('escalates on the band flip even when the tolerance would have let it pass', () => {
    /*
     * WHY THE TOLERANCE CANNOT SUPPRESS AN ESCALATION. 0.20 is a declared prior with
     * no measurement behind it — exactly the kind of number this lane exists to
     * distrust. So it only decides whether an immaterial gap is worth recording. A
     * gap that flips the decision is escalated whatever the tolerance says.
     * cap $100M, A = $200M (turnover 2.00 → flags), B = $199M (turnover 1.99 → clean).
     * Relative gap 0.005, far inside tolerance.
     */
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(2e8, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: observed(1.99e8, { observedAt: null, source: 'coinpaprika' }),
      }),
      disputeTolerance: 0.5,
    }));
    expect(r.disagreements).toHaveLength(1);
    expect(r.disagreements[0]!.suppressionFlips).toBe(true);
    expect(r.disagreements[0]!.disposition).toBe('escalated');
    expect(r.escalate).toBe(true);
    // …and it is not double-counted as agreement.
    expect(r.corroborations).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* WITNESS C — free evidence, read by no engine before this one                    */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('witness C, on size', () => {
  it('is actually read, and can flip the verdict on its own', () => {
    /*
     * The suppression's denominator is `projects.market_cap_usd`. DefiLlama reports a
     * size for the same token, independently. cap $1M vs DefiLlama $4M, on $2.2M of
     * volume: turnover 2.20 against the incumbent (wash_suspected, suppressed) and
     * 0.55 against DefiLlama (clean, kept — 0.55 is under the thin-cap limb's 1.00).
     */
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(2.2e6, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: notLoaded(),
        size_projects_row: observed(1e6, { observedAt: null, source: 'coingecko' }),
        size_defillama: observed(4e6, { observedAt: '2026-08-04T00:00:00.000Z', source: 'defillama' }),
      }),
    }));
    const size = r.disagreements.filter((d) => d.quantity === 'size_usd');
    expect(size).toHaveLength(1);
    expect(size[0]!.between).toEqual(['size_projects_row', 'size_defillama']);
    expect(size[0]!.bandUnder).toEqual(['wash_suspected', 'clean']);
    expect(size[0]!.materiality).toBe('material');
    expect(r.escalate).toBe(true);
  });

  it('is described as what it is, not as what its predicate is called', () => {
    // `fdv_usd` is written from DefiLlama's `mcap` field (connectors/defillama.ts:112),
    // which is not a fully diluted valuation. Claiming FDV would be laundering.
    expect(WITNESSES.size_defillama.derivation).toMatch(/fdv_usd/);
    expect(WITNESSES.size_defillama.caveat).toMatch(/not verified to be fully diluted/i);
  });

  it('returns EVERY disagreement, not the first', () => {
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(2.5e8, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: observed(1e8, { observedAt: null, source: 'coinpaprika' }),
        size_projects_row: observed(1e8, { observedAt: null, source: 'coingecko' }),
        size_defillama: observed(3e8, { observedAt: null, source: 'defillama' }),
      }),
    }));
    expect(r.disagreements.map((d) => d.quantity)).toEqual(['volume_24h_usd', 'size_usd']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* A RATIO AGAINST AN ABSENT DENOMINATOR IS NOT A RATIO                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('an absent denominator', () => {
  const noSize = () =>
    crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(2.5e8, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: observed(1e8, { observedAt: null, source: 'coinpaprika' }),
        size_projects_row: absent('column_null'),
      }),
    }));

  it('yields no band at all — not clean, not zero', () => {
    const r = noSize();
    expect(r.bandAsDetected).toBeNull();
    expect(r.suppressesAsDetected).toBeNull();
    expect(codes(r)).toContain('XWIT_RATIO_DENOMINATOR_ABSENT');
  });

  it('makes the volume dispute undeterminable rather than immaterial', () => {
    const d = noSize().disagreements[0]!;
    expect(d.bandUnder).toEqual([null, null]);
    expect(d.materiality).toBe('undeterminable');
    // Recorded, not escalated — and the reason is on the record: the production
    // detector's own query requires market_cap_usd NOT NULL, so with no size witness
    // nothing was suppressed and there is no decision to have flipped.
    expect(d.disposition).toBe('recorded');
    expect(d.sentence).toMatch(/cannot/i);
    expect(noSize().escalate).toBe(false);
  });

  it('refuses a PRESENT denominator that a division cannot use', () => {
    /*
     * The trap a presence check alone walks into: `market_cap_usd = 0` is a present
     * reading, and `volume / 0` is Infinity, which clears every threshold there is.
     * So the refusal is on usability, not on presence.
     */
    const r = crossExamine(input({
      readings: READINGS({ size_projects_row: observed(0, { observedAt: null, source: 'coingecko' }) }),
    }));
    expect(r.readings.size_projects_row.state).toBe('present');
    expect(r.bandAsDetected).toBeNull();
    expect(r.suppressesAsDetected).toBeNull();
    expect(codes(r)).toContain('XWIT_RATIO_DENOMINATOR_ABSENT');
    expect(r.refusals.find((x) => x.code === 'XWIT_RATIO_DENOMINATOR_ABSENT')?.sentence)
      .toMatch(/not a positive denominator/);
  });

  it('still reports the incumbent band when the size witness IS present', () => {
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(3e8, { observedAt: null, source: 'coingecko' }),
      }),
    }));
    expect(r.bandAsDetected).toBe('wash_suspected');
    expect(r.suppressesAsDetected).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* A SUBJECT THE DETECTOR NEVER SCANS                                             */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a subject outside the detector\'s population', () => {
  /**
   * The arithmetic that WOULD flag, if the detector looked: $3.0M traded on a $1M cap
   * is turnover 3.00, over the hardcoded 2.0. It does not look — `deception.ts:35`
   * scans `tier = 'tracked'` only — so there is no verdict, no suppression, and
   * nothing for a disagreement to flip.
   */
  const catalogTier = (tier: string | null) =>
    crossExamine(input({
      subjectTier: tier,
      readings: READINGS({
        volume_projects_row: observed(3e6, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: observed(1.2e6, { observedAt: null, source: 'coinpaprika' }),
        size_projects_row: observed(1e6, { observedAt: null, source: 'coingecko' }),
        size_defillama: observed(4e6, { observedAt: null, source: 'defillama' }),
      }),
    }));

  it('reports NO production verdict, rather than the verdict production would reach', () => {
    const r = catalogTier('catalog');
    expect(r.detectorPopulation).toBe('outside_population');
    // The defect this pins: `wash_suspected` / true / escalate, asserted about a
    // project that is not in the detector's population at all.
    expect(r.bandAsDetected).toBeNull();
    expect(r.suppressesAsDetected).toBeNull();
    expect(r.escalate).toBe(false);
    expect(codes(r)).toContain('XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION');
    const ref = r.refusals.find((x) => x.code === 'XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION');
    expect(ref?.rule.provision).toBe('an inference is never laundered into a certainty');
    expect(ref?.sentence).toMatch(/tier = 'tracked'/);
    expect(ref?.sentence).toMatch(/'catalog'/);
  });

  it('files its disagreements as outside-the-population, not as immaterial or material', () => {
    const r = catalogTier('catalog');
    // The same tracked-tier fixture escalates; this one must not, and must not read as
    // "production weighed it and would decide the same either way" either.
    expect(r.disagreements.map((d) => d.quantity)).toEqual(['volume_24h_usd', 'size_usd']);
    for (const d of r.disagreements) {
      expect(d.materiality).toBe('outside_detector_population');
      expect(d.bandUnder).toEqual([null, null]);
      expect(d.suppressionUnder).toEqual([null, null]);
      expect(d.suppressionFlips).toBe(false);
      expect(d.disposition).toBe('recorded');
      expect(d.sentence).toMatch(/changes no production decision/i);
    }
    // …and the sentence never claims the I&W consequence for a project with no flag.
    expect(r.disagreements.map((d) => d.sentence).join(' ')).not.toMatch(/opposite sides of the verdict/);
  });

  it('keeps "tier not read" apart from "tier is not tracked"', () => {
    const r = catalogTier(null);
    expect(r.detectorPopulation).toBe('unknown');
    expect(r.bandAsDetected).toBeNull();
    expect(codes(r)).toContain('XWIT_DETECTOR_POPULATION_UNKNOWN');
    expect(codes(r)).not.toContain('XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION');
    expect(r.refusals.find((x) => x.code === 'XWIT_DETECTOR_POPULATION_UNKNOWN')?.rule.provision)
      .toBe('three states are never collapsed');
    // An unknown population is not a known-empty one: undeterminable, not "no decision".
    expect(r.disagreements.every((d) => d.materiality === 'undeterminable')).toBe(true);
    expect(r.escalate).toBe(false);
    expect(r.frame.subjectTier).toBeNull();
  });

  it('still escalates the identical fixture when the tier IS tracked', () => {
    // The control. Without this, the three tests above would also pass on an engine
    // that had simply stopped escalating.
    const r = catalogTier(DETECTOR_POPULATION_TIER);
    expect(r.bandAsDetected).toBe('wash_suspected');
    expect(r.suppressesAsDetected).toBe(true);
    expect(r.escalate).toBe(true);
    expect(codes(r)).not.toContain('XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION');
    expect(r.frame.detectorPopulation).toBe('in_population');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* A NUMBER THE QUANTITY CANNOT HAVE                                              */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('a reading no quantity of this kind can have', () => {
  it('refuses a negative volume instead of formatting it into the operator sentence', () => {
    // volume_24h_usd carries no CHECK constraint; production's own query filters `> 0`
    // because the column can hold junk. The old behaviour printed "says $-100,000,000
    // … a 200% gap" and filed a ratio of -1.
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(-1e8, { observedAt: null, source: 'coingecko' }),
        volume_venue_sum: observed(1e8, { observedAt: null, source: 'coinpaprika' }),
      }),
    }));
    expect(codes(r)).toContain('XWIT_NEGATIVE_QUANTITY_REFUSED');
    expect(r.refusals.find((x) => x.code === 'XWIT_NEGATIVE_QUANTITY_REFUSED')?.witness)
      .toBe('volume_projects_row');
    // No comparison at all, so no gap and no ratio are printed from it.
    expect(r.disagreements.filter((d) => d.quantity === 'volume_24h_usd')).toEqual([]);
    expect(r.corroborations).toEqual([]);
    expect(codes(r)).toContain('XWIT_NO_CORROBORATING_WITNESS');
    // And a negative numerator produces no band — `-100/100 = -1` is under every
    // threshold, which would have read as `clean`.
    expect(r.bandAsDetected).toBeNull();
    expect(r.suppressesAsDetected).toBeNull();
  });

  it('refuses rather than returning a gap it cannot define', () => {
    // 2 is not in [0, 1], and 0 ("they agree") would be worse.
    expect(() => relativeGap(-100, 100)).toThrow(RangeError);
    expect(() => relativeGap(100, -100)).toThrow(RangeError);
    expect(() => relativeGap(Number.NaN, 100)).toThrow(RangeError);
    expect(() => relativeGap(Number.POSITIVE_INFINITY, 100)).toThrow(RangeError);
  });

  it('never lets a non-finite value into the present arm of the state machine', () => {
    // `observed` is the exported constructor, so this is the guard that matters: the
    // reader has its own `num()`, any other caller has none.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = observed(bad, { observedAt: null, source: 'coingecko' });
      expect(r.state).toBe('absent');
      expect(r).not.toHaveProperty('value');
      expect(r.state === 'absent' && r.because).toBe('column_null');
      expect(r.state === 'absent' && r.note).toMatch(/not a finite number/);
    }
    // A genuine zero is still a present reading — that distinction is the whole point.
    expect(observed(0, { observedAt: null, source: 'coingecko' }).state).toBe('present');
  });

  it('prints no $NaN and files no NaN gap end to end', () => {
    const r = crossExamine(input({
      readings: READINGS({
        volume_projects_row: observed(Number.NaN, { observedAt: null, source: 'coingecko' }),
      }),
    }));
    /*
     * The OPERATOR PROSE is what must not carry it — the old output read "says $NaN …
     * a NaN% gap". The refusal's own note naming the offending value is the opposite
     * of the defect and is asserted positively below, so the assertion is on the
     * sentences a surface renders, not on the whole object.
     */
    const prose = [
      ...r.refusals.map((x) => x.sentence),
      ...r.disagreements.map((x) => x.sentence),
      ...r.corroborations.map((x) => x.sentence),
    ].join(' ');
    expect(prose).not.toMatch(/\$NaN|NaN%|\$∞|\$Infinity/);
    // No comparison is filed at all, so there is no gap that could have been NaN.
    expect(r.disagreements).toEqual([]);
    expect(r.corroborations).toEqual([]);
    expect(codes(r)).toContain('XWIT_WITNESS_ABSENT');
    expect(r.refusals.find((x) => x.code === 'XWIT_WITNESS_ABSENT')?.sentence)
      .toMatch(/not a finite number \(NaN\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE FRAME MUST NOT CONTRADICT ITSELF                                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the frame\'s completeness label', () => {
  it('describes the quantities, not the head count', () => {
    // Two witnesses present — one per quantity — so nothing is corroborated, but the
    // old label said "single_witness_uncorroborated" beside a list of two.
    const r = crossExamine(input({
      readings: READINGS({
        volume_venue_sum: absent('no_rows'),
        size_defillama: absent('no_observation'),
      }),
    }));
    expect(r.frame.witnessesPresent).toEqual(['volume_projects_row', 'size_projects_row']);
    expect(r.frame.completeness).toBe('no_quantity_corroborated');
  });

  it('says no_witness when there is genuinely no witness, and two_witness_partial when a pair spoke', () => {
    const none = crossExamine(input({
      readings: READINGS({
        volume_projects_row: absent('column_null'),
        volume_venue_sum: absent('no_rows'),
        size_projects_row: absent('column_null'),
        size_defillama: absent('no_observation'),
      }),
    }));
    expect(none.frame.completeness).toBe('no_witness');
    expect(crossExamine(input()).frame.completeness).toBe('two_witness_partial');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* PURITY                                                                         */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('the engine is pure', () => {
  it('is deterministic — the clock is an input, not a read', () => {
    const i = input();
    expect(crossExamine(i)).toEqual(crossExamine(i));
  });

  it('computes a relative gap that is symmetric and defined at zero', () => {
    expect(relativeGap(100, 95)).toBeCloseTo(0.05, 10);
    expect(relativeGap(95, 100)).toBeCloseTo(0.05, 10);
    expect(relativeGap(0, 0)).toBe(0);
    expect(relativeGap(0, 5)).toBe(1);
  });
});
