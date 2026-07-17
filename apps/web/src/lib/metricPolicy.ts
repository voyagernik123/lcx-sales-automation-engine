import { formatPct } from './format';

/**
 * Small-sample discipline (FINAL_MASTER_PLAN 4.6) — the single policy layer
 * between raw metrics and the screen. A dashboard must never render a
 * statistic the data can't support:
 *
 * - Rates need a denominator floor. Below it, show the absolute form
 *   ("3 of 4") — a percentage computed on four events is noise.
 * - Rates can never exceed 100%. If numerator > denominator the data is
 *   inconsistent (e.g. replies attributed to sends outside the window) —
 *   show the counts, never the impossible percentage.
 * - Deltas need a baseline. "▲1000%" against a baseline of 1 is not a
 *   trend, it's an artifact — suppress it.
 * - Funnels must be monotone non-increasing; when the data violates that,
 *   the funnel form itself is a lie and the caller should fall back to
 *   plain stage counts.
 */

export const MIN_RATE_DENOMINATOR = 8;
export const MIN_DELTA_BASELINE = 5;
export const MIN_TREND_POINTS = 8;

export interface RateDisplay {
  /** What to render: "38.2%" or "3 of 4". */
  display: string;
  /** True when the percentage form was withheld. */
  suppressed: boolean;
  /** Hover explanation when suppressed. */
  title?: string;
}

/** Rate with a denominator floor and an impossibility guard. */
export function formatRate(
  numerator: number,
  denominator: number,
  minDenominator: number = MIN_RATE_DENOMINATOR,
): RateDisplay {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return { display: '—', suppressed: true, title: 'No events yet' };
  }
  if (numerator > denominator) {
    return {
      display: `${Math.round(numerator)} of ${Math.round(denominator)}`,
      suppressed: true,
      title: 'Counts are inconsistent (more outcomes than events) — showing raw counts instead of a rate',
    };
  }
  if (denominator < minDenominator) {
    return {
      display: `${Math.round(numerator)} of ${Math.round(denominator)}`,
      suppressed: true,
      title: `Sample too small for a rate (${Math.round(denominator)} events, needs ${minDenominator})`,
    };
  }
  return { display: formatPct((numerator / denominator) * 100), suppressed: false };
}

/**
 * Period-over-period percent change, or null when the baseline is too small
 * to mean anything. Callers omit the delta chip entirely on null.
 */
export function deltaPct(
  current: number,
  baseline: number,
  minBaseline: number = MIN_DELTA_BASELINE,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (Math.abs(baseline) < minBaseline) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

/** A funnel is only a funnel if each stage holds at most the previous one. */
export function isMonotoneFunnel(stageValues: number[]): boolean {
  for (let i = 1; i < stageValues.length; i++) {
    if (stageValues[i] > stageValues[i - 1]) return false;
  }
  return true;
}

/** Trend lines need enough points to be a line and not an anecdote. */
export function hasTrend(points: unknown[], min: number = MIN_TREND_POINTS): boolean {
  return points.length >= min;
}
