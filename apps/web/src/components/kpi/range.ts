/** Date-range helpers for the KPI dashboard: chips window the snapshot history client-side. */

export type RangeKey = '7d' | '30d' | 'qtd' | 'ytd';

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7' },
  { key: '30d', label: 'Last 30' },
  { key: 'qtd', label: 'QTD' },
  { key: 'ytd', label: 'YTD' },
];

export const RANGE_DELTA_LABELS: Record<RangeKey, string> = {
  '7d': 'vs 7d ago',
  '30d': 'vs 30d ago',
  qtd: 'vs quarter start',
  ytd: 'vs year start',
};

/** Inclusive ISO-date (YYYY-MM-DD) lower bound for a range key. */
export function rangeCutoff(key: RangeKey, now = new Date()): string {
  if (key === '7d') return new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  if (key === '30d') return new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  if (key === 'qtd') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return `${now.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`;
  }
  return `${now.getFullYear()}-01-01`;
}

/**
 * Period-over-period % change between the first and last value of a window.
 * Returns undefined when there is no meaningful base (first = 0 with movement).
 */
export function pctChange(first: number, last: number): number | undefined {
  if (first === last) return 0;
  if (first === 0) return undefined;
  return ((last - first) / first) * 100;
}
