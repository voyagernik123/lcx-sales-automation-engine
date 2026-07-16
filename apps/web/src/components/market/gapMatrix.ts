import type { GapRow } from '@/lib/api/bd';

/**
 * Pure derivation logic for the Exchange-Gap Heat Matrix and the two
 * screener-Δ / watchlist features shared by ExchangeGaps and MarketMap.
 * No React, no fetch — everything here is unit-testable.
 */

/**
 * Payload reality: /v1/analytics/gaps also returns `exchangesSyncedAt`
 * (last exchange-sync run for the project) which the typed GapRow drops.
 * Neither gaps nor map rows carry updatedAt/createdAt, so "new since last
 * visit" is primarily an entrants check (id not seen before), with the
 * timestamp clause available when a payload provides one.
 */
export type GapRowWithSync = GapRow & { exchangesSyncedAt?: string | null };

/* ── matrix pivot ── */

export interface MatrixExchange {
  id: string;
  name: string;
  /** How many gap projects in the screen are live on this venue. */
  coverage: number;
  /** Combined 24h volume across those listings (nulls ignored). */
  totalVolume: number;
}

export interface MatrixCell {
  volume: number | null;
}

export interface MatrixRow {
  project: GapRow;
  /** exchangeId → listing (only the venues in the row's topExchanges payload). */
  listed: Record<string, MatrixCell>;
}

export interface GapMatrixModel {
  exchanges: MatrixExchange[];
  rows: MatrixRow[];
}

/**
 * Pivot the gaps table into projects × exchanges. Rows keep their input
 * order (the API sorts by priority). Columns are the `maxColumns` most
 * common venues across the dataset — ranked by coverage, then combined
 * volume, then name.
 *
 * Note: the gaps payload caps `topExchanges` at 6 venues per project (by
 * 24h volume), so an unfilled cell means "not among the project's top
 * venues", not proof of absence.
 */
export function buildGapMatrix(rows: GapRow[], maxColumns = 12): GapMatrixModel {
  const tally = new Map<string, MatrixExchange>();

  for (const row of rows) {
    for (const ex of row.topExchanges) {
      const entry = tally.get(ex.id) ?? { id: ex.id, name: ex.name, coverage: 0, totalVolume: 0 };
      entry.coverage += 1;
      entry.totalVolume += ex.volume ?? 0;
      tally.set(ex.id, entry);
    }
  }

  const exchanges = [...tally.values()]
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        b.totalVolume - a.totalVolume ||
        a.name.localeCompare(b.name),
    )
    .slice(0, Math.max(0, maxColumns));

  const matrixRows: MatrixRow[] = rows.map((project) => {
    const listed: Record<string, MatrixCell> = {};
    for (const ex of project.topExchanges) listed[ex.id] = { volume: ex.volume };
    return { project, listed };
  });

  return { exchanges, rows: matrixRows };
}

/* ── sidebar mini-analytics ── */

/** Top venues by gap coverage, shaped for BarChartH. */
export function topExchangesByCoverage(rows: GapRow[], n = 8): { label: string; value: number }[] {
  return buildGapMatrix(rows, n).exchanges.map((e) => ({ label: e.name, value: e.coverage }));
}

export interface Opportunity {
  project: GapRow;
  /** priority × exchange count — "proven budget, widest footprint". */
  score: number;
  why: string;
}

/**
 * The single biggest opportunity in the screen: highest priority ×
 * exchange-count product. Every extra venue is a listing fee the project
 * already paid, so the product ranks "most likely to pay × most proven".
 */
export function biggestOpportunity(rows: GapRow[]): Opportunity | null {
  let best: GapRow | null = null;
  let bestScore = -1;
  for (const row of rows) {
    const score = row.priorityScore * Math.max(1, row.exchangeCount);
    if (score > bestScore || (score === bestScore && best !== null && row.priorityScore > best.priorityScore)) {
      best = row;
      bestScore = score;
    }
  }
  if (!best) return null;
  const venues = best.topExchanges.slice(0, 3).map((e) => e.name).join(', ');
  return {
    project: best,
    score: bestScore,
    why:
      `Priority ${best.priorityScore} × ${best.exchangeCount} venues = ${bestScore}. ` +
      `Already paid to list on ${best.exchangeCount} exchanges${venues ? ` (incl. ${venues})` : ''} — ` +
      `a proven listing budget with zero LCX presence.`,
  };
}

/* ── screener Δ: "new since last visit" ── */

export interface VisitStamp {
  /** ISO time of the previous visit's last data load. */
  ts: string;
  /** Every project id seen on this page so far (unioned across visits). */
  ids: string[];
}

/**
 * Which of the current ids are new relative to the stored stamp?
 * New = never seen before, or (when the payload carries a timestamp)
 * updated after the last visit. A null stamp (first visit) flags nothing.
 */
export function findNewIds(
  currentIds: string[],
  stamp: VisitStamp | null,
  timestamps?: Record<string, string | null | undefined>,
): Set<string> {
  if (!stamp) return new Set();
  const seen = new Set(stamp.ids);
  const visitedAt = Date.parse(stamp.ts);
  const out = new Set<string>();
  for (const id of currentIds) {
    if (!seen.has(id)) {
      out.add(id);
      continue;
    }
    const ts = timestamps?.[id];
    if (ts != null && !Number.isNaN(visitedAt) && Date.parse(ts) > visitedAt) out.add(id);
  }
  return out;
}

/**
 * Union the previously seen ids with the current dataset (so narrowing a
 * filter never wipes memory), capped to keep localStorage bounded.
 */
export function mergeVisitIds(previous: string[] | undefined, current: string[], cap = 5000): string[] {
  const merged = new Set(previous ?? []);
  for (const id of current) merged.add(id);
  const list = [...merged];
  return list.length > cap ? list.slice(list.length - cap) : list;
}

/** "since Tue" / "since Jul 2" / "since earlier today" chip fragment. */
export function formatSince(ts: string, now = Date.now()): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return 'last visit';
  const then = new Date(t);
  const days = (now - t) / 86_400_000;
  if (new Date(now).toDateString() === then.toDateString()) return 'earlier today';
  if (days < 7) return then.toLocaleDateString('en-US', { weekday: 'short' });
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── shared formatting ── */

export function fmtUsd(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
