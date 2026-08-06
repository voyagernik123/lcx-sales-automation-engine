import { Competitor } from '@/types/competitors';
import { lowerBoundCents, parseMoney, type MoneyRefusalCode } from '@/lib/money';

/**
 * The old parsers here were NOT a reference implementation, they were the worst
 * of the four: the char class /[^0-9.BbMmTtKk]/ preserved B/M/T/K inside
 * English words, so the suffix tests matched prose. Measured consequences:
 *   - 'Trillions annually' and 'Institutional OTC only' tested positive for the
 *     T multiplier (they produced NaN, which then silently dropped the
 *     dimension).
 *   - '$500M-$1B+ est. annual' became $500 TRILLION — the 't' in 'est.' — and
 *     since scores are normalised against the cohort maximum, that one string
 *     drove every other competitor's revenue score to ~0.13% of its weight.
 *   - '$1.6T+ total AUM' in the USERS field became 1,600,000 users, from the M
 *     in 'AUM'.
 *
 * Everything now routes through the one parser, which refuses anything that
 * does not round-trip.
 *
 * SCORING CONVENTION, stated because the doctrine requires it to be stated:
 * these scores are computed from LOWER BOUNDS. '$312B+' contributes $312B and
 * '$50,000-$100,000' contributes $50,000. A lower bound is not a value, so
 * every score here reads "at least", and any surface printing one must say so.
 * A figure with no readable bound at all is EXCLUDED from the weighting rather
 * than counted as zero, and every exclusion is reported on the result.
 */

/** Dollars, as a lower bound, or null when the string yields no bound. */
export function lowerBoundDollars(raw: string | undefined): number | null {
  const cents = lowerBoundCents(parseMoney(raw));
  return cents === null ? null : cents / 100;
}

/**
 * A headcount as a lower bound. A '$' anywhere is a category error — the users
 * field of several competitors holds a dollar figure ('$1.6T+ total AUM',
 * 'USDT: $90B+ circulation'), and reading those as people is how a custodian
 * with no retail users acquired 1.6 million of them.
 */
export function lowerBoundCount(raw: string | undefined): number | null {
  if (raw === undefined || raw.includes('$')) return null;
  const cents = lowerBoundCents(parseMoney(raw));
  return cents === null ? null : cents / 100;
}

export type VolumeDimension = 'users' | 'quarterlyVolume' | 'assetsOnPlatform' | 'revenue';

export interface UnvaluedFigure {
  dimension: VolumeDimension;
  /** Printed verbatim by any surface that shows the gap. */
  source: string;
  code: MoneyRefusalCode;
}

export type Quadrant = 'leaders' | 'regulatoryHedge' | 'volumeRiders' | 'outsiders';

export interface CompetitorScores {
  id: string;
  name: string;
  regulatoryCoverage: number;
  /**
   * NULL when NOT ONE of the four volume dimensions was readable — 19 of the 26
   * competitors in data/competitors.ts, today.
   *
   * It used to be 0 with a `marketVolumeMeasured: false` flag beside it, and the
   * flag was advisory: StrategicMatrix plotted the 0 on the y-axis and printed
   * "0/100" in the tooltip for ten competitors whose four volume figures were
   * all unreadable, while its visibility predicate (`marketVolume > 0 ||
   * preClarityRegulatory > 0`) DELETED five more rather than showing them as
   * unmeasured. The type is null now so that a surface cannot plot it without
   * first deciding, in code, what an unmeasured competitor looks like.
   */
  marketVolume: number | null;
  preClarityRegulatory: number;
  postClarityRegulatory: number;
  marketShare: number;
  threatLevel: string;
  /**
   * NULL whenever marketVolume is null. A quadrant is a published verdict —
   * 'OUTSIDERS — Limited or no US access' — and it cannot be reached for a
   * competitor whose volume was never measured: the verdict would be an artefact
   * of the missing data, not a reading of it.
   */
  quadrant: Quadrant | null;
  postClarityQuadrant: Quadrant | null;
  /** Sugar for `marketVolume !== null`. The null is the load-bearing signal. */
  marketVolumeMeasured: boolean;
  /** Every figure that could not be valued, with its source string. */
  unvaluedFigures: UnvaluedFigure[];
}

export function computeRegulatoryScore(competitor: Competitor, postClarity: boolean): number {
  if (!postClarity) {
    let score = 0;
    const mtlCount = competitor.statePresence.length;
    score += (mtlCount / 50) * 40;
    if (competitor.licenses.fincenMSB) score += 10;
    if (competitor.licenses.bitLicense) score += 15;
    if (competitor.licenses.spdiCharter || competitor.licenses.nyTrustCharter) score += 15;
    if (competitor.licenses.occTrustCharter) score += 10;
    if (competitor.licenses.cfdtcDCO) score += 5;
    if (competitor.licenses.finraBD) score += 5;
    return Math.min(100, score);
  }

  let score = 0;
  if (competitor.licenses.fincenMSB) score += 15;
  if (competitor.licenses.bitLicense) score += 10;
  if (competitor.licenses.spdiCharter || competitor.licenses.nyTrustCharter) score += 20;
  if (competitor.licenses.occTrustCharter) score += 25;
  if (competitor.licenses.cfdtcDCO) score += 10;
  if (competitor.licenses.finraBD) score += 10;
  if (competitor.licenses.euMiCA) score += 10;
  return Math.min(100, score);
}

/** The four volume dimensions and their weights, in one place. */
const VOLUME_WEIGHTS: Record<VolumeDimension, number> = {
  users: 30,
  quarterlyVolume: 30,
  assetsOnPlatform: 25,
  revenue: 15,
};

interface VolumeBounds {
  /** null = no readable bound; 0 = a figure that really is zero. */
  bounds: Record<VolumeDimension, number | null>;
  unvalued: UnvaluedFigure[];
}

function readVolumeBounds(competitor: Competitor): VolumeBounds {
  const raw: Record<VolumeDimension, string> = {
    users: competitor.users,
    quarterlyVolume: competitor.financials.quarterlyVolume,
    assetsOnPlatform: competitor.financials.assetsOnPlatform,
    revenue: competitor.financials.revenue,
  };

  const bounds = {} as Record<VolumeDimension, number | null>;
  const unvalued: UnvaluedFigure[] = [];

  for (const dimension of Object.keys(raw) as VolumeDimension[]) {
    const source = raw[dimension];
    const value = dimension === 'users' ? lowerBoundCount(source) : lowerBoundDollars(source);
    bounds[dimension] = value;
    if (value === null) {
      const parsed = parseMoney(source);
      unvalued.push({
        dimension,
        source,
        // A '$' in the users field yields no MoneyRefusalCode of its own — the
        // string parses fine as money, it is simply not a headcount.
        code: parsed.kind === 'unparseable' ? parsed.code : 'MONEY_NOT_NUMERIC',
      });
    }
  }

  return { bounds, unvalued };
}

/** The score, or null when no dimension was readable. Never 0-as-unmeasured. */
function computeMarketVolumeScore(
  bounds: Record<VolumeDimension, number | null>,
  maxima: Record<VolumeDimension, number | null>
): number | null {
  let totalWeight = 0;
  let score = 0;

  for (const dimension of Object.keys(VOLUME_WEIGHTS) as VolumeDimension[]) {
    const value = bounds[dimension];
    const max = maxima[dimension];
    // A dimension with no readable bound is dropped from the denominator, not
    // scored as zero. A dimension whose value is genuinely 0 stays in.
    if (value === null || max === null || max <= 0) continue;
    score += (value / max) * VOLUME_WEIGHTS[dimension];
    totalWeight += VOLUME_WEIGHTS[dimension];
  }

  if (totalWeight === 0) return null;
  return Math.round((score / totalWeight) * 100);
}

/** No volume, no verdict. */
function determineQuadrant(regulatory: number, volume: number | null): Quadrant | null {
  if (volume === null) return null;
  if (regulatory >= 50 && volume >= 50) return 'leaders';
  if (regulatory >= 50 && volume < 50) return 'regulatoryHedge';
  if (regulatory < 50 && volume >= 50) return 'volumeRiders';
  return 'outsiders';
}

export function computeAllScores(competitors: Competitor[]): CompetitorScores[] {
  const read = competitors.map(readVolumeBounds);

  // The cohort maximum per dimension, over readable bounds only. Null means no
  // member of the cohort had a readable figure for that dimension, so it scores
  // for nobody — that is a gap in the data, not a tie at zero.
  const maxima = {} as Record<VolumeDimension, number | null>;
  for (const dimension of Object.keys(VOLUME_WEIGHTS) as VolumeDimension[]) {
    const values = read
      .map(r => r.bounds[dimension])
      .filter((v): v is number => v !== null);
    maxima[dimension] = values.length === 0 ? null : Math.max(...values);
  }

  return competitors.map((c, i) => {
    const preClarityReg = computeRegulatoryScore(c, false);
    const postClarityReg = computeRegulatoryScore(c, true);
    const marketVol = computeMarketVolumeScore(read[i].bounds, maxima);

    return {
      id: c.id,
      name: c.name,
      regulatoryCoverage: preClarityReg,
      marketVolume: marketVol,
      preClarityRegulatory: preClarityReg,
      postClarityRegulatory: postClarityReg,
      marketShare: c.marketShare,
      threatLevel: c.threatLevel,
      quadrant: determineQuadrant(preClarityReg, marketVol),
      postClarityQuadrant: determineQuadrant(postClarityReg, marketVol),
      marketVolumeMeasured: marketVol !== null,
      unvaluedFigures: read[i].unvalued,
    };
  });
}

export const QUADRANT_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  leaders: {
    fill: 'rgba(6, 182, 212, 0.15)',
    stroke: 'rgba(6, 182, 212, 0.6)',
    text: 'rgb(6, 182, 212)',
  },
  regulatoryHedge: {
    fill: 'rgba(34, 197, 94, 0.12)',
    stroke: 'rgba(34, 197, 94, 0.5)',
    text: 'rgb(34, 197, 94)',
  },
  volumeRiders: {
    fill: 'rgba(245, 158, 11, 0.12)',
    stroke: 'rgba(245, 158, 11, 0.5)',
    text: 'rgb(245, 158, 11)',
  },
  outsiders: {
    fill: 'rgba(239, 68, 68, 0.08)',
    stroke: 'rgba(239, 68, 68, 0.35)',
    text: 'rgb(239, 68, 68)',
  },
};

export const QUADRANT_LABELS: Record<string, string> = {
  leaders: 'LEADERS',
  regulatoryHedge: 'REGULATORY HEDGE',
  volumeRiders: 'VOLUME RIDERS',
  outsiders: 'OUTSIDERS',
};

export const QUADRANT_DESCRIPTIONS: Record<string, string> = {
  leaders: 'Dominant coverage + maximum volume',
  regulatoryHedge: 'Strong licenses, niche focus',
  volumeRiders: 'High volume, building coverage',
  outsiders: 'Limited or no US access',
};
