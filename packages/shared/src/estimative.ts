/**
 * Estimative language (Palantir-grade Phase 2.2) — ICD-203 tradecraft.
 *
 * Intelligence never says "72%". It says "likely" with a stated confidence,
 * because a bare number implies a precision the evidence rarely supports. This
 * maps a 0–1 probability to the seven ICD-203 likelihood bands, and derives a
 * SEPARATE confidence (low / moderate / high) from how much and how good the
 * evidence is — likelihood and confidence are orthogonal (you can be highly
 * confident something is unlikely).
 *
 * Pure + deterministic. The one vocabulary the whole platform speaks when it
 * states a probability.
 */

export type LikelihoodTerm =
  | 'almost no chance'
  | 'very unlikely'
  | 'unlikely'
  | 'roughly even chance'
  | 'likely'
  | 'very likely'
  | 'almost certain';

export interface LikelihoodBand {
  term: LikelihoodTerm;
  /** Inclusive-exclusive percentage bounds per ICD-203. */
  min: number;
  max: number;
}

/** ICD-203 (Analytic Standards) probability lexicon. */
export const LIKELIHOOD_BANDS: LikelihoodBand[] = [
  { term: 'almost no chance', min: 0, max: 5 },
  { term: 'very unlikely', min: 5, max: 20 },
  { term: 'unlikely', min: 20, max: 45 },
  { term: 'roughly even chance', min: 45, max: 55 },
  { term: 'likely', min: 55, max: 80 },
  { term: 'very likely', min: 80, max: 95 },
  { term: 'almost certain', min: 95, max: 100 },
];

export interface Likelihood {
  term: LikelihoodTerm;
  /** Rounded whole-percent, 0–100. */
  pct: number;
}

/**
 * Map a probability to its ICD-203 term. Accepts either a 0–1 fraction or a
 * 0–100 percentage (auto-detected: values >1 are treated as already-percent).
 */
export function likelihood(p: number): Likelihood {
  if (!Number.isFinite(p)) return { term: 'roughly even chance', pct: 50 };
  const pct = Math.max(0, Math.min(100, p <= 1 ? p * 100 : p));
  const band = LIKELIHOOD_BANDS.find((b) => pct >= b.min && pct < b.max) ?? LIKELIHOOD_BANDS[LIKELIHOOD_BANDS.length - 1];
  return { term: band.term, pct: Math.round(pct) };
}

export type ConfidenceLevel = 'low' | 'moderate' | 'high';

export interface ConfidenceInput {
  /** How many independent observations/sources fed the estimate. */
  sampleSize?: number;
  /** Mean 0–100 confidence of the evidence (Admiralty-derived). */
  meanConfidence?: number;
  /** Count of load-bearing assumptions not yet validated (lowers confidence). */
  openAssumptions?: number;
}

/**
 * Analytic confidence — how much to trust the estimate itself, separate from
 * the likelihood. High needs both corroboration (sample) and quality (grade);
 * open assumptions knock it down. Mirrors ICD-203's confidence dimension.
 */
export function estimativeConfidence(input: ConfidenceInput): ConfidenceLevel {
  const n = input.sampleSize ?? 0;
  const q = input.meanConfidence ?? 0;
  const open = input.openAssumptions ?? 0;
  let level: ConfidenceLevel;
  if (n >= 3 && q >= 65) level = 'high';
  else if (n >= 1 && q >= 40) level = 'moderate';
  else level = 'low';
  // Two-plus unvalidated load-bearing assumptions cap confidence at moderate;
  // knock high→moderate, and 3+ knocks moderate→low.
  if (open >= 2 && level === 'high') level = 'moderate';
  if (open >= 3 && level === 'moderate') level = 'low';
  return level;
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: 'low confidence',
  moderate: 'moderate confidence',
  high: 'high confidence',
};

/** One-line estimative phrasing, e.g. "Likely (72%) · moderate confidence". */
export function estimativePhrase(p: number, conf: ConfidenceInput | ConfidenceLevel): string {
  const l = likelihood(p);
  const level = typeof conf === 'string' ? conf : estimativeConfidence(conf);
  const term = l.term.charAt(0).toUpperCase() + l.term.slice(1);
  return `${term} (${l.pct}%) · ${CONFIDENCE_LABEL[level]}`;
}
