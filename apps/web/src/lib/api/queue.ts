/**
 * Work-Loop queue fetchers — snooze/disqualify transport plus id→row joins.
 *
 * The snooze endpoints are being added by a parallel API workstream:
 *   POST   /v1/projects/:id/snooze {days?, until?, reason?} → { snoozeUntil }
 *   DELETE /v1/projects/:id/snooze
 * If they 404 at runtime we fall back to a localStorage snooze map
 * ('lcx-os:snooze:v1', id → wake ISO) so the UX works either way. The map is
 * also written on API success — it doubles as the client-side index the
 * Follow-ups split uses to enumerate snoozes (no list endpoint exists).
 */
import { request, ApiError } from '../apiClient';
import { fetchLead } from './bd';
import type { BdLead } from '@/types/bd';

/* ────────────────────────────── Types ───────────────────────────────── */

/**
 * Projects-list row incl. the queue-era extras, typed locally — types/bd.ts
 * is owned by another workstream.
 */
export interface QueueLead extends BdLead {
  /** Wake timestamp when the row is snoozed (added to the list payload). */
  snoozedUntil?: string | null;
  /** Propensity reason trail, when the payload carries it (degrade if not). */
  reasons?: { code: string; factor: string; points: number; note: string }[];
}

export interface SnoozeOpts {
  days?: number;
  until?: string;
  reason?: string;
}

/* ───────────────────── Local snooze mirror (fallback) ───────────────── */

export const SNOOZE_MAP_KEY = 'lcx-os:snooze:v1';

export function loadSnoozeMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SNOOZE_MAP_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveSnoozeMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(SNOOZE_MAP_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

export function writeLocalSnooze(projectId: string, untilIso: string): void {
  const map = loadSnoozeMap();
  map[projectId] = untilIso;
  saveSnoozeMap(map);
}

export function clearLocalSnooze(projectId: string): void {
  const map = loadSnoozeMap();
  delete map[projectId];
  saveSnoozeMap(map);
}

/* ─────────────────────────── Snooze transport ───────────────────────── */

/** Raw API call — throws ApiError(404) on older API builds. */
export async function snoozeProjectApi(id: string, opts: SnoozeOpts): Promise<{ snoozeUntil: string }> {
  const res = await request<{ data?: { snoozeUntil?: string }; snoozeUntil?: string }>(
    `/v1/projects/${id}/snooze`,
    { auth: true, method: 'POST', body: opts },
  );
  const snoozeUntil = res?.data?.snoozeUntil ?? res?.snoozeUntil;
  if (!snoozeUntil) throw new ApiError('Malformed snooze response', 502);
  return { snoozeUntil };
}

export async function unsnoozeProjectApi(id: string): Promise<void> {
  await request(`/v1/projects/${id}/snooze`, { auth: true, method: 'DELETE' });
}

/**
 * Snooze with graceful degradation: API first, localStorage on 404.
 * Mirrors the wake date locally in both cases (see module docblock).
 */
export async function snoozeProject(
  id: string,
  opts: SnoozeOpts,
  now = Date.now(),
): Promise<{ snoozeUntil: string; viaFallback: boolean }> {
  const fallbackUntil = opts.until ?? new Date(now + (opts.days ?? 1) * 86_400_000).toISOString();
  try {
    const { snoozeUntil } = await snoozeProjectApi(id, opts);
    writeLocalSnooze(id, snoozeUntil);
    return { snoozeUntil, viaFallback: false };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      writeLocalSnooze(id, fallbackUntil);
      return { snoozeUntil: fallbackUntil, viaFallback: true };
    }
    throw err;
  }
}

export async function unsnoozeProject(id: string): Promise<{ viaFallback: boolean }> {
  try {
    await unsnoozeProjectApi(id);
    clearLocalSnooze(id);
    return { viaFallback: false };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      clearLocalSnooze(id);
      return { viaFallback: true };
    }
    throw err;
  }
}

/* ─────────────────────────── Disqualify ─────────────────────────────── */

/**
 * Disqualify = suppress with a captured reason. The reason rides in the body
 * (audit-friendly); older API builds simply ignore the extra field.
 */
export async function disqualifyProject(id: string, reason: string): Promise<void> {
  await request(`/v1/projects/${id}/suppress`, { auth: true, method: 'POST', body: { reason } });
}

/* ───────────────────────── id → row resolution ──────────────────────── */

/**
 * Resolve project ids to table rows via the detail endpoint (the list API
 * has no ids filter). Concurrency-capped; failed ids drop out silently so a
 * single dead project can't sink a split. Input order is preserved.
 * NOTE: the detail payload has no priority/propensity — those render as "—".
 */
export async function fetchLeadRowsByIds(ids: string[], concurrency = 6): Promise<QueueLead[]> {
  const out: QueueLead[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const { data: d } = await fetchLead(id);
        out.push({
          id: d.id,
          name: d.name,
          ticker: d.ticker,
          website: d.website,
          source: d.source,
          chain: d.chain,
          jurisdiction: d.jurisdiction,
          category: d.category,
          listedOnLcx: d.listedOnLcx,
          euScore: d.score?.euScore ?? 0,
          usPreScore: d.score?.usPreScore ?? 0,
          usPostScore: d.score?.usPostScore ?? 0,
          band: d.score?.band ?? 'unscored',
          reasons: (d.score?.reasons as QueueLead['reasons']) ?? undefined,
          peopleCount: d.people.length,
          verifiedContactCount: d.people.filter(p => p.verified).length,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          hasContact: d.people.some(p => p.verified),
          marketTag: null,
        });
      } catch {
        /* dropped — dead ids must not sink the split */
      }
    }
  });
  await Promise.all(workers);
  const rank = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
