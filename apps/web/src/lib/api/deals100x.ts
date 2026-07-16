/**
 * deals100x — fetchers for the Deal Intelligence layer (100x Phase 2).
 *
 * New surface area only: per-deal playbook state (API with localStorage
 * fallback so the chips always work), BATNA figures from the deal desk,
 * and the board-context loader that assembles the per-deal inputs for
 * `computeDealHealthSet`. Existing fetchers stay in bd.ts / kpi.ts.
 */
import { request } from '../apiClient';
import { fetchDealEvents, type BoardDeal } from './bd';
import type { DealContext, PlaybookChip } from '@/lib/salesIntel';

/* ─────────────────────────── Playbook ─────────────────────────── */

export type PlaybookKey = PlaybookChip['key'];

const PLAYBOOK_KEYS: readonly PlaybookKey[] = ['T', 'K', 'L', 'C', 'O'];

/** localStorage fallback map: dealId → completed playbook keys. */
export const PLAYBOOK_LOCAL_KEY = 'lcx-os:playbook:v1';

/** Keep only valid playbook keys, deduped, in canonical T·K·L·C·O order. */
export function sanitizePlaybookKeys(keys: unknown): PlaybookKey[] {
  if (!Array.isArray(keys)) return [];
  const present = new Set<string>(keys.filter((k): k is string => typeof k === 'string'));
  return PLAYBOOK_KEYS.filter(k => present.has(k));
}

/** Read the whole local playbook map. Corrupt/missing storage → {}. */
export function readLocalPlaybook(): Record<string, PlaybookKey[]> {
  try {
    const raw = localStorage.getItem(PLAYBOOK_LOCAL_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, PlaybookKey[]> = {};
    for (const [dealId, keys] of Object.entries(parsed as Record<string, unknown>)) {
      out[dealId] = sanitizePlaybookKeys(keys);
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist one deal's completed keys into the local fallback map. */
export function writeLocalPlaybook(dealId: string, done: PlaybookKey[]): void {
  try {
    const map = readLocalPlaybook();
    map[dealId] = sanitizePlaybookKeys(done);
    localStorage.setItem(PLAYBOOK_LOCAL_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — chips degrade to in-memory state for the session */
  }
}

export interface DealPlaybookState {
  done: PlaybookKey[];
  /** 'api' when the endpoint answered; 'local' when we fell back to localStorage. */
  source: 'api' | 'local';
}

/** GET /v1/deals/:id/playbook — falls back to localStorage when unavailable. */
export async function fetchDealPlaybook(dealId: string): Promise<DealPlaybookState> {
  try {
    const res = await request<{ data: { done?: string[] } }>(`/v1/deals/${dealId}/playbook`, { auth: true });
    return { done: sanitizePlaybookKeys(res.data?.done), source: 'api' };
  } catch {
    return { done: readLocalPlaybook()[dealId] ?? [], source: 'local' };
  }
}

/**
 * PATCH /v1/deals/:id/playbook {done}. The API may answer 409
 * {code:'PLAYBOOK_UNAVAILABLE'} (or the endpoint may not be deployed yet) —
 * either way we persist to localStorage so the chips always work.
 */
export async function saveDealPlaybook(dealId: string, done: PlaybookKey[]): Promise<DealPlaybookState> {
  const clean = sanitizePlaybookKeys(done);
  try {
    const res = await request<{ data: { done?: string[] } }>(`/v1/deals/${dealId}/playbook`, {
      auth: true,
      method: 'PATCH',
      body: { done: clean },
    });
    return { done: sanitizePlaybookKeys(res.data?.done ?? clean), source: 'api' };
  } catch {
    writeLocalPlaybook(dealId, clean);
    return { done: clean, source: 'local' };
  }
}

/* ──────────────────────────── BATNA ───────────────────────────── */

export interface Batna {
  id: string;
  dealId: string;
  ourFloorCents: number | null;
  theirOfferCents: number | null;
  competitorOfferCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatnaInput {
  ourFloorCents?: number | null;
  theirOfferCents?: number | null;
  competitorOfferCents?: number | null;
  notes?: string | null;
}

/** GET /v1/dealdesk/deals/:dealId/batna — null when none tracked yet. */
export async function fetchBatna(dealId: string): Promise<Batna | null> {
  const res = await request<{ data: Batna | null }>(`/v1/dealdesk/deals/${dealId}/batna`, { auth: true });
  return res.data;
}

/** POST /v1/dealdesk/deals/:dealId/batna — the API upserts on deal_id. */
export async function saveBatna(dealId: string, input: BatnaInput): Promise<Batna> {
  const res = await request<{ data: Batna }>(`/v1/dealdesk/deals/${dealId}/batna`, {
    auth: true,
    method: 'POST',
    body: input,
  });
  return res.data;
}

/* ────────────────────── Board context loader ───────────────────── */

export interface LoadedDealContext extends DealContext {
  playbookSource: 'api' | 'local';
}

/**
 * Assemble per-deal contexts (events + playbook) for `computeDealHealthSet`.
 * The real dataset is ~6 deals, so N parallel fetches are fine; every fetch
 * is best-effort (allSettled) — a deal with no context still gets health.
 */
export async function loadDealContexts(deals: BoardDeal[]): Promise<Record<string, LoadedDealContext>> {
  const settled = await Promise.allSettled(
    deals.map(async d => {
      const [ev, pb] = await Promise.allSettled([fetchDealEvents(d.id), fetchDealPlaybook(d.id)]);
      const playbook: DealPlaybookState =
        pb.status === 'fulfilled' ? pb.value : { done: readLocalPlaybook()[d.id] ?? [], source: 'local' };
      const ctx: LoadedDealContext = {
        events: ev.status === 'fulfilled' ? ev.value.data : undefined,
        playbookDone: playbook.done,
        playbookSource: playbook.source,
      };
      return [d.id, ctx] as const;
    }),
  );
  const out: Record<string, LoadedDealContext> = {};
  for (const s of settled) {
    if (s.status === 'fulfilled') out[s.value[0]] = s.value[1];
  }
  return out;
}
