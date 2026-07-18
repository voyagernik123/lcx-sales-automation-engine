import { request } from '@/lib/apiClient';
import type { ActionDef, Observation } from '@lcx/shared';

/**
 * Intelligence-spine client (Wave 0): observations (provenance) + governed
 * actions on any ontology object.
 */

export interface ObjectState {
  watchlisted: boolean;
  flagged: boolean;
}

export interface WatchlistEntry {
  id: string;
  subjectType: string;
  subjectId: string;
  note: string | null;
  addedBy: string;
  createdAt: string;
}

const q = (subjectType: string, subjectId: string) =>
  `subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`;

export function fetchObservations(subjectType: string, subjectId: string): Promise<Observation[]> {
  return request<{ data: Observation[] }>(`/v1/intel/observations?${q(subjectType, subjectId)}`).then((r) => r.data);
}

export function fetchActions(
  subjectType: string,
  subjectId: string,
): Promise<{ available: ActionDef[]; state: ObjectState }> {
  return request<{ data: { available: ActionDef[]; state: ObjectState } }>(
    `/v1/intel/actions?${q(subjectType, subjectId)}`,
  ).then((r) => r.data);
}

export function executeAction(
  subjectType: string,
  subjectId: string,
  action: string,
  params?: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; state: ObjectState }> {
  return request<{ data: { result: Record<string, unknown>; state: ObjectState } }>(`/v1/intel/actions`, {
    method: 'POST',
    body: { subjectType, subjectId, action, params },
  }).then((r) => r.data);
}

export function recordObservation(input: {
  subjectType: string;
  subjectId: string;
  predicate: string;
  value: unknown;
  unit?: string;
  source?: string;
  sourceUrl?: string;
}): Promise<{ id: string }> {
  return request<{ data: { id: string } }>(`/v1/intel/observations`, { method: 'POST', body: input }).then((r) => r.data);
}

export function fetchWatchlist(subjectType?: string): Promise<WatchlistEntry[]> {
  const qs = subjectType ? `?subjectType=${encodeURIComponent(subjectType)}` : '';
  return request<{ data: WatchlistEntry[] }>(`/v1/intel/watchlist${qs}`).then((r) => r.data);
}
