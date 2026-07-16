/**
 * Pure logic for "The Work Loop" queue — split definitions, SLA ordering,
 * snooze arithmetic, session-stats merging, saved-screen deltas.
 *
 * No fetching, no store access, no DOM (except the guarded localStorage
 * helpers and one event-target predicate) — everything here is unit-testable.
 */
import { computeReplySla, type SlaState } from '@/lib/salesIntel';
import type { BdFilters } from '@/types/bd';

export const DAY_MS = 86_400_000;

/* ─────────────────────────────── Splits ─────────────────────────────── */

export type SplitId = 'hot' | 'followups' | 'new' | 'working';

/** Tab order — digit keys 1–4 map onto this. */
export const SPLIT_ORDER: SplitId[] = ['hot', 'followups', 'new', 'working'];

export const SPLIT_LABELS: Record<SplitId, string> = {
  hot: 'Hot replies',
  followups: 'Follow-ups due',
  new: 'New high-scorers',
  working: 'Working set',
};

export const SPLIT_HINTS: Record<SplitId, string> = {
  hot: 'Open handoffs waiting on your reply — ordered by SLA, worst first.',
  followups: 'Snoozes that woke up + open tasks due today.',
  new: 'Immediate/high band, added within 7 days, not yet in play.',
  working: 'The full filterable queue.',
};

/* ─────────────────────────── SLA ordering ───────────────────────────── */

/** breached → urgent → aging → fresh; within a state, oldest first. */
export const SLA_RANK: Record<SlaState, number> = { breached: 0, urgent: 1, aging: 2, fresh: 3 };

export function sortBySlaUrgency<T>(rows: T[], createdAtOf: (row: T) => string, now = Date.now()): T[] {
  return [...rows].sort((a, b) => {
    const sa = computeReplySla(createdAtOf(a), now);
    const sb = computeReplySla(createdAtOf(b), now);
    return SLA_RANK[sa.state] - SLA_RANK[sb.state] || sb.ageHours - sa.ageHours;
  });
}

/** Compact age for SLA chips: 48m · 5.2h · 1.3d. */
export function formatAgeHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h < 10 ? h.toFixed(1) : Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

/* ─────────────────────── New high-scorer split ──────────────────────── */

/** Immediate/high band AND created inside the window (default 7d). */
export function isNewHighScorer(
  lead: { band: string; createdAt: string },
  now = Date.now(),
  windowDays = 7,
): boolean {
  if (lead.band !== 'immediate' && lead.band !== 'high') return false;
  const age = now - Date.parse(lead.createdAt);
  return age <= windowDays * DAY_MS; // future-dated rows (clock skew) still count as new
}

/* ────────────────────────────── Snooze ──────────────────────────────── */

/** A snooze is awake once its wake time has passed. */
export const isAwake = (untilIso: string, now = Date.now()): boolean => Date.parse(untilIso) <= now;

/** Server field wins when present; local fallback mirror otherwise. */
export function effectiveSnoozeUntil(
  server: string | null | undefined,
  local: string | undefined,
): string | null {
  return server ?? local ?? null;
}

/** Still sleeping → hidden from the working set by default. */
export function isSnoozed(untilIso: string | null, now = Date.now()): boolean {
  return untilIso !== null && !isAwake(untilIso, now);
}

/** Wake timestamp for {days} from now, or a caller-supplied ISO. */
export function computeWakeIso(opts: { days?: number; until?: string }, now = Date.now()): string {
  return opts.until ?? new Date(now + (opts.days ?? 1) * DAY_MS).toISOString();
}

/** Wake-date chip label: "awake" / "tomorrow" / "Jul 23". */
export function formatWakeDate(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (t <= now) return 'awake';
  const days = Math.ceil((t - now) / DAY_MS);
  if (days <= 1) return 'tomorrow';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ──────────────────────── Follow-ups helpers ────────────────────────── */

/** A task counts as "due today" when dueAt is today or already overdue. */
export function isDueToday(dueAtIso: string | null, now = new Date()): boolean {
  if (!dueAtIso) return false;
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return Date.parse(dueAtIso) <= endOfDay.getTime();
}

/* ─────────── Session stats (Home reads this EXACT contract) ─────────── */

export const SESSION_STATS_KEY = 'lcx-os:session-stats:v1';

export interface SessionStats {
  date: string; // YYYY-MM-DD
  worked: number;
  enrolled: number;
  snoozed: number;
  disqualified: number;
}

export type SessionDelta = Omit<SessionStats, 'date'>;

export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Cumulative merge when the stored record is the same day; fresh otherwise. */
export function mergeSessionStats(
  existing: SessionStats | null,
  delta: SessionDelta,
  date: string,
): SessionStats {
  if (existing && existing.date === date) {
    return {
      date,
      worked: existing.worked + delta.worked,
      enrolled: existing.enrolled + delta.enrolled,
      snoozed: existing.snoozed + delta.snoozed,
      disqualified: existing.disqualified + delta.disqualified,
    };
  }
  return { date, ...delta };
}

/* ───────────────────── Saved screens (radar-lite) ───────────────────── */

export const SCREENS_KEY = 'lcx-os:screens:v1';

export interface SavedScreen {
  id: string;
  name: string;
  filters: BdFilters;
  /** ISO of the last time this screen was applied — the Δ baseline. */
  lastVisited: string;
}

/** Δ badge: rows created or updated after the screen's last visit. */
export function countNewSince(
  rows: { createdAt: string; updatedAt?: string | null }[],
  lastVisitedIso: string,
): number {
  const t = Date.parse(lastVisitedIso);
  return rows.filter(
    r => Date.parse(r.createdAt) > t || (r.updatedAt ? Date.parse(r.updatedAt) > t : false),
  ).length;
}

/* ─────────────────────── Keyboard / storage utils ───────────────────── */

/** True when a key event originates in a typing context — triage keys must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — degrade silently */
  }
}
