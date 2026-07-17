import type { MapPoint } from '@/lib/api/bd';
import { formatMoney, formatPct } from '@/lib/format';

/**
 * Market-map lenses — the analytical axes of the token universe.
 *
 * Each lens reframes the same points on a different pair of dimensions with
 * named quadrants, so the desk can read the universe as opportunity,
 * regulatory posture, momentum, or scale. Pure config + math so it can be
 * unit-tested and reused by the scatter and the selection stats.
 */

export type ZoneKey = 'tr' | 'tl' | 'br' | 'bl';

export interface Axis {
  label: string;
  value: (p: MapPoint) => number | null;
  domain: [number, number];
  scale: 'linear' | 'log';
  format: (v: number) => string;
  /** Quadrant split in data space. */
  split: number;
}

export interface Lens {
  id: string;
  label: string;
  desc: string;
  x: Axis;
  y: Axis;
  zones: Record<ZoneKey, string>;
  /** The quadrant the desk wants targets to land in. */
  target: ZoneKey;
}

const pct100: Pick<Axis, 'domain' | 'scale' | 'format'> = {
  domain: [0, 100],
  scale: 'linear',
  format: (v) => String(Math.round(v)),
};

/** Best regulatory score across venues — the eligibility signal. */
const eligibility = (p: MapPoint): number | null => {
  const eu = p.euScore ?? 0;
  const us = p.usPostScore ?? 0;
  const best = Math.max(eu, us);
  return best > 0 ? best : null;
};

export const LENSES: Lens[] = [
  {
    id: 'opportunity',
    label: 'Opportunity',
    desc: 'Regulatory eligibility × commercial propensity — where to spend the week.',
    x: { label: 'Eligibility (best EU/US)', value: eligibility, split: 60, ...pct100 },
    y: { label: 'Propensity to pay', value: (p) => p.propensityScore || null, split: 50, ...pct100 },
    zones: { tr: 'Prime targets', tl: 'Keen, not eligible', br: 'Eligible, low intent', bl: 'Long tail' },
    target: 'tr',
  },
  {
    id: 'regulatory',
    label: 'Regulatory',
    desc: 'EU readiness vs US (post-CLARITY) readiness — which venue leads.',
    x: { label: 'EU readiness', value: (p) => p.euScore, split: 60, ...pct100 },
    y: { label: 'US readiness (post)', value: (p) => p.usPostScore, split: 60, ...pct100 },
    zones: { tr: 'Dual-ready', tl: 'US-first', br: 'EU-first', bl: 'Neither yet' },
    target: 'tr',
  },
  {
    id: 'momentum',
    label: 'Momentum',
    desc: '30-day price move × 24h liquidity — who is heating up right now.',
    x: {
      label: '30d price change',
      value: (p) => p.priceChange30d,
      split: 0,
      domain: [-50, 50],
      scale: 'linear',
      format: (v) => formatPct(v),
    },
    y: {
      label: '24h volume',
      value: (p) => (p.volume24hUsd && p.volume24hUsd > 0 ? p.volume24hUsd : null),
      split: 5_000_000,
      domain: [50_000, 2_000_000_000],
      scale: 'log',
      format: (v) => formatMoney(v),
    },
    zones: { tr: 'Heating & liquid', tl: 'Fading, liquid', br: 'Heating, thin', bl: 'Quiet' },
    target: 'tr',
  },
  {
    id: 'scale',
    label: 'Scale × Fit',
    desc: 'Market cap × priority score — size the prize against effort.',
    x: {
      label: 'Market cap',
      value: (p) => (p.marketCapUsd > 0 ? p.marketCapUsd : null),
      split: 100_000_000,
      domain: [1_000_000, 5_000_000_000],
      scale: 'log',
      format: (v) => formatMoney(v),
    },
    y: { label: 'Priority score', value: (p) => p.priorityScore || null, split: 60, ...pct100 },
    zones: { tr: 'Big & priority', tl: 'Priority, small', br: 'Big, deprioritized', bl: 'Small & low' },
    target: 'tr',
  },
];

export function getLens(id: string): Lens {
  return LENSES.find((l) => l.id === id) ?? LENSES[0];
}

/** Which quadrant a point falls in for a lens; null if it lacks either axis. */
export function classifyZone(lens: Lens, p: MapPoint): ZoneKey | null {
  const x = lens.x.value(p);
  const y = lens.y.value(p);
  if (x == null || y == null) return null;
  const right = x >= lens.x.split;
  const top = y >= lens.y.split;
  return top ? (right ? 'tr' : 'tl') : right ? 'br' : 'bl';
}

/** A point is plottable on a lens only if both axes resolve. */
export function isPlottable(lens: Lens, p: MapPoint): boolean {
  return lens.x.value(p) != null && lens.y.value(p) != null;
}

export interface UniverseStats {
  count: number;
  totalMcap: number;
  listed: number;
  avgPropensity: number;
  zoneCounts: Record<ZoneKey, number>;
}

export function summarize(lens: Lens, points: MapPoint[]): UniverseStats {
  const zoneCounts: Record<ZoneKey, number> = { tr: 0, tl: 0, br: 0, bl: 0 };
  let totalMcap = 0;
  let listed = 0;
  let propSum = 0;
  let propN = 0;
  for (const p of points) {
    totalMcap += p.marketCapUsd || 0;
    if (p.listedOnLcx) listed += 1;
    if (p.propensityScore) {
      propSum += p.propensityScore;
      propN += 1;
    }
    const z = classifyZone(lens, p);
    if (z) zoneCounts[z] += 1;
  }
  return {
    count: points.length,
    totalMcap,
    listed,
    avgPropensity: propN > 0 ? Math.round(propSum / propN) : 0,
    zoneCounts,
  };
}

/** Normalize a data value to [0,1] within an axis domain (linear or log). */
export function normalize(axis: Axis, v: number): number {
  const [lo, hi] = axis.domain;
  if (axis.scale === 'log') {
    const l = Math.log10(Math.max(lo, 1));
    const h = Math.log10(Math.max(hi, 10));
    const c = Math.log10(Math.min(Math.max(v, lo), hi));
    return (c - l) / (h - l || 1);
  }
  return (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo || 1);
}
