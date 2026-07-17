/**
 * The formatting bible — the single source of truth for how numbers, money,
 * dates and durations render anywhere in the platform. No surface formats
 * its own values; charts, tables, stats and copy all route through here.
 *
 * Rules (FINAL_MASTER_PLAN Part 4.8):
 * - Money: compact from $10K up ($48.5K, $1.2M), exact below; never eight
 *   digits on a dashboard. `exact` gives the full figure for detail/hover.
 * - Percent: 1 decimal max, no trailing ".0".
 * - Dates: relative under 7 days ("3d ago"), then "Jul 13" (year added only
 *   when it isn't the current year). Full UTC timestamp for hovers.
 * - Durations: minutes under an hour, hours under 2 days, then days/weeks.
 *   SLA-style ages can be capped ("7d+") — an age beyond the cap is an
 *   incident to escalate, not a number to admire.
 * - Counts: exact with separators below 100K, compact above.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Trim a fixed(1) string's trailing ".0" — "48.0" → "48". */
function trim1(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

export interface MoneyOptions {
  /** Full figure with separators ($48,500) — for detail views and hovers. */
  exact?: boolean;
}

/** $8,400 · $48.5K · $1.2M · −$3.4K. Input is whole dollars. */
export function formatMoney(amount: number, opts: MoneyOptions = {}): string {
  if (!Number.isFinite(amount)) return '—';
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  if (opts.exact || abs < 10_000) {
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
  }
  if (abs < 1_000_000) return `${sign}$${trim1(abs / 1_000)}K`;
  if (abs < 1_000_000_000) return `${sign}$${trim1(abs / 1_000_000)}M`;
  return `${sign}$${trim1(abs / 1_000_000_000)}B`;
}

/** 42.4% · 8% · −3.1%. Input is a percentage number (42.37, not 0.4237). */
export function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  const sign = pct < 0 ? '−' : '';
  return `${sign}${trim1(Math.abs(pct))}%`;
}

/** 7,870 · 124 · 1.2M. Exact below 100K, compact above. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs < 100_000) return `${sign}${Math.round(abs).toLocaleString('en-US')}`;
  if (abs < 1_000_000) return `${sign}${trim1(abs / 1_000)}K`;
  return `${sign}${trim1(abs / 1_000_000)}M`;
}

export interface DurationOptions {
  /** Cap display at this many days — "7d+" instead of "283h". */
  capDays?: number;
}

/** 45m · 4h · 36h · 3d · 2w — from a duration in minutes. */
export function formatDuration(minutes: number, opts: DurationOptions = {}): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const days = minutes / 1440;
  if (opts.capDays !== undefined && days >= opts.capDays) return `${opts.capDays}d+`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h`;
  if (days < 14) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}

/** "just now" · "2h ago" · "3d ago" · "Jul 13" · "Nov 2, 2025". */
export function formatDate(value: string | number | Date, now: Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = now.getTime() - d.getTime();
  const diffMin = diffMs / 60_000;
  if (diffMin >= 0 && diffMin < 7 * 1440) {
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${Math.round(diffMin)}m ago`;
    if (diffMin < 36 * 60) return `${Math.round(diffMin / 60)}h ago`;
    return `${Math.round(diffMin / 1440)}d ago`;
  }
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}

/** "Jul 13, 14:02 UTC" — the hover/detail companion to formatDate. */
export function formatDateTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${hh}:${mm} UTC`;
}
