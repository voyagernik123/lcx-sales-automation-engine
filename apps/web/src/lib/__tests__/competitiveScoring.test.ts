import { describe, expect, it } from 'vitest';
import { Competitor } from '@/types/competitors';
import { competitors as realCompetitors } from '@/data';
import {
  computeAllScores,
  lowerBoundDollars,
  lowerBoundCount,
} from '../competitiveScoring';

describe('lowerBoundDollars', () => {
  it('does not read a suffix letter out of an English word', () => {
    // REGRESSION: the old char class /[^0-9.BbMmTtKk]/ kept the letters inside
    // words, so 'Trillions annually' matched the T multiplier and
    // 'Institutional OTC only' matched both T and K.
    expect(lowerBoundDollars('Trillions annually')).toBeNull();
    expect(lowerBoundDollars('Institutional OTC only')).toBeNull();
    expect(lowerBoundDollars('N/A (oracle network)')).toBeNull();
    expect(lowerBoundDollars('Unknown (declining)')).toBeNull();
    expect(lowerBoundDollars('Undisclosed (significantly diminished)')).toBeNull();
    expect(lowerBoundDollars('Consolidated into Robinhood')).toBeNull();
    expect(lowerBoundDollars('Negligible in US')).toBeNull();
  });

  it('does not turn $500M-$1B+ into $500 trillion', () => {
    // REGRESSION: the 't' in 'est.' selected the T multiplier, so this single
    // revenue string became 5e14 and became the cohort maximum, driving every
    // other competitor's revenue score to ~0.
    expect(lowerBoundDollars('$500M-$1B+ est. annual')).toBeNull();
    expect(lowerBoundDollars('$120M+ ARR (2023)')).toBeNull();
    expect(lowerBoundDollars('$1.67B (H1 2024)')).toBeNull();
  });

  it('reads clean figures, ranges as their low end and floors as floors', () => {
    expect(lowerBoundDollars('$6.56B')).toBe(6_560_000_000);
    expect(lowerBoundDollars('$207B')).toBe(207_000_000_000);
    expect(lowerBoundDollars('$312B+')).toBe(312_000_000_000);
    expect(lowerBoundDollars('$50,000-$100,000')).toBe(50_000);
  });
});

describe('lowerBoundCount', () => {
  it('reads a plain or open-ended headcount', () => {
    expect(lowerBoundCount('15M')).toBe(15_000_000);
    expect(lowerBoundCount('108M+')).toBe(108_000_000);
    expect(lowerBoundCount('170M+')).toBe(170_000_000);
  });

  it('refuses a dollar figure sitting in a headcount field', () => {
    // REGRESSION: '$1.6T+ total AUM' in the users field parsed to 1,600,000
    // users, because parseNumericUsers kept only [0-9.MmKk] and read the M
    // from 'AUM'.
    expect(lowerBoundCount('$1.6T+ total AUM')).toBeNull();
    expect(lowerBoundCount('USDT: $90B+ circulation')).toBeNull();
    expect(lowerBoundCount('USDC: $56B+ circulation')).toBeNull();
  });

  it('refuses a headcount buried in prose', () => {
    expect(lowerBoundCount('27.4M funded customers')).toBeNull();
    expect(lowerBoundCount('1,800+ institutional clients')).toBeNull();
    expect(lowerBoundCount('Institutional only (300+ institutions)')).toBeNull();
    expect(lowerBoundCount('Unknown (declining)')).toBeNull();
  });
});

/** Only the fields the scorer reads. Everything else is left off deliberately —
 *  a fixture that fills 20 unread fields hides which ones drive the result. */
interface CompetitorOverrides {
  id: string;
  name?: string;
  users?: string;
  marketShare?: number;
  threatLevel?: Competitor['threatLevel'];
  statePresence?: string[];
  licenses?: Partial<Competitor['licenses']>;
  financials?: Partial<Competitor['financials']>;
}

function competitor(over: CompetitorOverrides): Competitor {
  return {
    id: over.id,
    name: over.name ?? over.id,
    statePresence: over.statePresence ?? [],
    marketShare: over.marketShare ?? 0,
    threatLevel: over.threatLevel ?? 'Low',
    users: over.users ?? 'Not disclosed',
    licenses: {
      fincenMSB: false,
      bitLicense: false,
      spdiCharter: false,
      nyTrustCharter: false,
      occTrustCharter: false,
      cfdtcDCO: false,
      finraBD: false,
      euMiCA: false,
      otherLicenses: [],
      ...(over.licenses ?? {}),
    },
    financials: {
      revenue: 'Undisclosed',
      revenueYear: 2024,
      quarterlyVolume: 'N/A',
      assetsOnPlatform: 'Not disclosed',
      ...(over.financials ?? {}),
    },
  } as unknown as Competitor;
}

describe('computeAllScores', () => {
  it('records every figure it could not value instead of scoring it as zero', () => {
    const scores = computeAllScores([
      competitor({
        id: 'a',
        users: '108M+',
        financials: {
          revenue: '$500M-$1B+ est. annual',
          quarterlyVolume: 'Trillions annually',
          assetsOnPlatform: '$516B',
        },
      }),
    ]);
    expect(scores[0].unvaluedFigures.map(f => f.dimension).sort()).toEqual([
      'quarterlyVolume',
      'revenue',
    ]);
    expect(scores[0].unvaluedFigures.find(f => f.dimension === 'revenue')!.source).toBe(
      '$500M-$1B+ est. annual'
    );
  });

  it('gives a competitor with no readable figure NO volume score at all', () => {
    // It used to return `{ score: 0, measured: false }`, and the flag was
    // advisory: StrategicMatrix plotted the 0 on the y-axis and printed "0/100"
    // in the tooltip. A null has no coordinate, so no surface can plot it
    // without deciding what an unmeasured competitor looks like.
    const scores = computeAllScores([
      competitor({ id: 'measured', users: '15M' }),
      competitor({ id: 'dark' }),
    ]);
    const dark = scores.find(s => s.id === 'dark')!;
    expect(dark.marketVolume).toBeNull();
    expect(dark.marketVolume).not.toBe(0);
    expect(dark.marketVolumeMeasured).toBe(false);
    expect(dark.unvaluedFigures).toHaveLength(4);
    expect(scores.find(s => s.id === 'measured')!.marketVolumeMeasured).toBe(true);
    expect(scores.find(s => s.id === 'measured')!.marketVolume).not.toBeNull();
  });

  it('publishes no quadrant verdict for an unmeasured competitor', () => {
    // determineQuadrant returned 'outsiders' — published as
    // 'OUTSIDERS — Limited or no US access' — for competitors whose four volume
    // figures were all unreadable. That verdict was an artefact of the missing
    // data, not a reading of it.
    const scores = computeAllScores([
      competitor({ id: 'dark' }),
      competitor({ id: 'measured', users: '15M', licenses: { fincenMSB: true } }),
    ]);
    const dark = scores.find(s => s.id === 'dark')!;
    expect(dark.quadrant).toBeNull();
    expect(dark.postClarityQuadrant).toBeNull();
    expect(dark.quadrant).not.toBe('outsiders');
    const measured = scores.find(s => s.id === 'measured')!;
    expect(measured.quadrant).not.toBeNull();
    expect(measured.postClarityQuadrant).not.toBeNull();
  });

  it('goes null and non-null together, so a surface can narrow on either', () => {
    // StrategicMatrix relies on this: it tests all three and the compiler proves
    // the dot is fully coordinated.
    for (const s of computeAllScores(realCompetitors)) {
      expect(s.quadrant === null).toBe(s.marketVolume === null);
      expect(s.postClarityQuadrant === null).toBe(s.marketVolume === null);
      expect(s.marketVolumeMeasured).toBe(s.marketVolume !== null);
    }
  });

  it('leaves nobody in the real corpus scored at a fabricated zero', () => {
    // 19 of the 26 competitors in data/competitors.ts have no readable volume
    // figure. Under the old shape all 19 carried marketVolume 0; ten of them
    // were plotted at the origin with '0/100' in the tooltip and five more were
    // deleted from the chart by `marketVolume > 0 || preClarityRegulatory > 0`.
    const scores = computeAllScores(realCompetitors);
    const unmeasured = scores.filter(s => s.marketVolume === null);
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const s of unmeasured) expect(s.marketVolume).toBeNull();
    // A MEASURED zero is still a zero and still plots. Superstate is one: it was
    // deleted by the old visibility predicate despite having been measured.
    const measuredZero = scores.filter(s => s.marketVolume === 0);
    for (const s of measuredZero) expect(s.marketVolumeMeasured).toBe(true);
    expect(scores.find(s => s.id === 'superstate')).toMatchObject({
      marketVolume: 0,
      marketVolumeMeasured: true,
    });
  });

  it('does not let one poisoned figure crush the rest of the cohort', () => {
    // With the old parser the '$500M-$1B+ est. annual' member set maxRevenue to
    // 5e14, so the $6.56B member scored 0.0013% of the revenue weight.
    const scores = computeAllScores([
      competitor({ id: 'poison', financials: { revenue: '$500M-$1B+ est. annual', quarterlyVolume: 'N/A', assetsOnPlatform: 'Not disclosed' } }),
      competitor({ id: 'clean', financials: { revenue: '$6.56B', quarterlyVolume: 'N/A', assetsOnPlatform: 'Not disclosed' } }),
    ]);
    expect(scores.find(s => s.id === 'clean')!.marketVolume).toBe(100);
    expect(scores.find(s => s.id === 'poison')!.marketVolumeMeasured).toBe(false);
  });

  it('counts an exact zero as a measured figure', () => {
    const scores = computeAllScores([
      competitor({ id: 'zero', financials: { revenue: '$0', quarterlyVolume: 'N/A', assetsOnPlatform: 'Not disclosed' } }),
      competitor({ id: 'some', financials: { revenue: '$1B', quarterlyVolume: 'N/A', assetsOnPlatform: 'Not disclosed' } }),
    ]);
    const zero = scores.find(s => s.id === 'zero')!;
    expect(zero.marketVolumeMeasured).toBe(true);
    expect(zero.marketVolume).toBe(0);
    expect(zero.unvaluedFigures.map(f => f.dimension)).not.toContain('revenue');
  });
});
