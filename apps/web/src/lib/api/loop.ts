/**
 * loop — fetchers and local contracts for the daily work loop
 * (Morning Brief on Home, Send Queue, Handoffs, Audit forensics).
 *
 * Aggregates EXISTING endpoints only — no new API surface. Everything
 * degrades gracefully: failed fetches collapse to empty results and the
 * localStorage contracts written by the queue session (which may be absent)
 * are read defensively.
 */
import { fetchAuditLog } from './audit';
import { fetchBdPipeline, fetchKpiHistory, fetchNotifications, fetchTasks, type KpiSnapshot } from './bd';
import { storage } from '@/lib/persistence';
import type { InspectorEntityType } from '@/stores';
import type { BdFilters } from '@/types/bd';

/* ────────────────── Audit entity → inspector mapping ────────────────── */

/**
 * Audit rows name their entity with the table-ish strings the API writes
 * (`projects`, `deals`, `handoffs`, …). Only some of those resolve to an
 * inspector payload — unknown kinds stay plain text (no fake links).
 */
export const AUDIT_ENTITY_TO_INSPECTOR: Partial<Record<string, InspectorEntityType>> = {
  projects: 'project',
  deals: 'deal',
  handoffs: 'handoff',
};

/* ─────────────────────────── Live ops feed ───────────────────────────── */

export interface OpsFeedLine {
  id: string;
  ts: string;
  category: 'audit' | 'alert';
  message: string;
  /** Present when the line resolves to an inspectable entity. */
  entity: { type: InspectorEntityType; id: string } | null;
}

/**
 * The Morning Brief terminal feed: latest audit-log entries merged with
 * in-app notifications, newest first. Either source failing simply thins
 * the feed — the panel never errors.
 */
export async function fetchOpsFeed(limit = 30): Promise<OpsFeedLine[]> {
  const [audit, notifs] = await Promise.allSettled([
    fetchAuditLog({ page: 1, limit }),
    fetchNotifications(),
  ]);

  const lines: OpsFeedLine[] = [];
  if (audit.status === 'fulfilled') {
    for (const e of audit.value.data) {
      const type = e.entity ? AUDIT_ENTITY_TO_INSPECTOR[e.entity] : undefined;
      lines.push({
        id: `a-${e.id}`,
        ts: e.createdAt,
        category: 'audit',
        message: `${e.actor} · ${e.action.replace(/_/g, ' ')}${e.projectName ? ` · ${e.projectName}` : ''}`,
        entity: type && e.entityId ? { type, id: e.entityId } : null,
      });
    }
  }
  if (notifs.status === 'fulfilled') {
    for (const n of notifs.value.items) {
      lines.push({
        id: `n-${n.id}`,
        ts: n.createdAt,
        category: 'alert',
        message: `${n.rule.replace(/_/g, ' ')} · ${n.title}${n.detail ? ` — ${n.detail}` : ''}`,
        entity: n.projectId ? { type: 'project', id: n.projectId } : null,
      });
    }
  }
  return lines.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit);
}

/* ─────────────────────────── Queue pulse ─────────────────────────────── */

const PULSE_FILTERS: BdFilters = {
  market: null,
  minScore: 0,
  source: '',
  band: '',
  listedOnLcx: null,
  hasContact: null,
  marketRecommendation: '',
  sort: 'priority',
  order: 'desc',
  search: '',
  tier: 'tracked',
};

export interface QueuePulse {
  /** null = that count failed to load (render an em dash, not a fake 0). */
  immediate: number | null;
  high: number | null;
  followUpsDue: number | null;
}

/** Counted streams for the Morning Brief: hot bands + follow-ups due today. */
export async function fetchQueuePulse(): Promise<QueuePulse> {
  const [imm, high, tasks] = await Promise.allSettled([
    fetchBdPipeline({ ...PULSE_FILTERS, band: 'immediate' }, { limit: 1 }),
    fetchBdPipeline({ ...PULSE_FILTERS, band: 'high' }, { limit: 1 }),
    fetchTasks(),
  ]);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return {
    immediate: imm.status === 'fulfilled' ? imm.value.meta.total : null,
    high: high.status === 'fulfilled' ? high.value.meta.total : null,
    followUpsDue:
      tasks.status === 'fulfilled'
        ? tasks.value.filter(t => t.dueAt && new Date(t.dueAt) <= endOfToday).length
        : null,
  };
}

/* ─────────────────────────── Forecast delta ──────────────────────────── */

export interface ForecastDelta {
  latest: KpiSnapshot;
  /** null when only one snapshot exists yet — deltas render as “—”. */
  previous: KpiSnapshot | null;
  /** Revenue trend across the window, oldest → newest (for the sparkline). */
  revenueTrend: number[];
}

/** Latest vs previous daily KPI snapshot. History arrives oldest-first. */
export async function fetchForecastDelta(days = 30): Promise<ForecastDelta | null> {
  const hist = await fetchKpiHistory(days);
  if (!hist.length) return null;
  return {
    latest: hist[hist.length - 1],
    previous: hist.length > 1 ? hist[hist.length - 2] : null,
    revenueTrend: hist.map(s => s.totalRevenue / 100),
  };
}

/** Percent change helper shared by the brief cards (null-safe). */
export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/* ──────────── Session stats + day history (localStorage) ─────────────── */

/**
 * Written by the queue focus-session as `lcx-os:session-stats:v1`. That
 * writer may not have shipped/run yet on this machine — every reader here
 * treats the key as optional and shape-checks what it finds.
 */
export interface SessionStats {
  date: string; // YYYY-MM-DD
  worked: number;
  enrolled: number;
  snoozed: number;
  disqualified: number;
}

/** Local calendar day as YYYY-MM-DD (session stats are local-day scoped). */
export function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** Raw session-stats record regardless of date; null when absent/malformed. */
export function readSessionStats(): SessionStats | null {
  const raw = storage.get<Partial<SessionStats> | null>('session-stats', null);
  if (!raw || typeof raw !== 'object' || typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    return null;
  }
  return {
    date: raw.date,
    worked: num(raw.worked),
    enrolled: num(raw.enrolled),
    snoozed: num(raw.snoozed),
    disqualified: num(raw.disqualified),
  };
}

/** Session stats only if they are from today — stale days read as null. */
export function readTodaySessionStats(now = new Date()): SessionStats | null {
  const stats = readSessionStats();
  return stats && stats.date === localDay(now) ? stats : null;
}

export interface DayHistoryEntry {
  date: string; // YYYY-MM-DD
  worked: number;
}

const DAY_HISTORY_KEY = 'day-history'; // → lcx-os:day-history:v1
const DAY_HISTORY_CAP = 90;

/**
 * Merge whatever session-stats day exists into the rolling per-day history
 * (`lcx-os:day-history:v1`), persist, and return it oldest-first. This is
 * how streaks survive the queue page overwriting session-stats each day.
 */
export function syncDayHistory(): DayHistoryEntry[] {
  const raw = storage.get<DayHistoryEntry[]>(DAY_HISTORY_KEY, []);
  const history = (Array.isArray(raw) ? raw : []).filter(
    (e): e is DayHistoryEntry =>
      !!e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.worked === 'number',
  );

  const stats = readSessionStats();
  if (stats) {
    const existing = history.find(e => e.date === stats.date);
    if (existing) existing.worked = Math.max(existing.worked, stats.worked);
    else history.push({ date: stats.date, worked: stats.worked });
  }

  history.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = history.slice(-DAY_HISTORY_CAP);
  storage.set(DAY_HISTORY_KEY, trimmed);
  return trimmed;
}

/**
 * Consecutive days with worked > 0 ending today — or ending yesterday when
 * today has no work yet (the day isn't over; the streak isn't broken yet).
 */
export function computeStreak(history: DayHistoryEntry[], now = new Date()): number {
  const workedDays = new Set(history.filter(e => e.worked > 0).map(e => e.date));
  const cursor = new Date(now);
  if (!workedDays.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (workedDays.has(localDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
