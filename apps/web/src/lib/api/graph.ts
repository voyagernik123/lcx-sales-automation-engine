import { request } from '../apiClient';
import type { InspectorEntityType } from '@/stores/useInspectorStore';

/**
 * Search-around client (Palantir-grade Phase 1.1). One primitive: given any
 * object, get the typed/counted groups of objects it links to, each with a
 * sample the UI pivots into.
 */
export interface RelatedItem {
  id: string;
  label: string;
  sublabel?: string;
  seed?: Record<string, unknown>;
}

export interface RelatedGroup {
  key: string;
  label: string;
  inspector: InspectorEntityType;
  count: number;
  items: RelatedItem[];
  /**
   * S5: present when the group lives in a compartment the reader does not hold. `count` is 0 and
   * `items` empty by construction; the panel renders a locked line naming the compartment instead
   * of showing a smaller world as if it were the whole one.
   */
  withheld?: string;
}

export interface RelatedResponse {
  type: string;
  id: string;
  groups: RelatedGroup[];
  totalLinks: number;
}

export async function fetchRelated(
  type: InspectorEntityType,
  id: string,
  signal?: AbortSignal,
): Promise<RelatedResponse> {
  const res = await request<{ data: RelatedResponse }>(
    `/v1/graph/${encodeURIComponent(type)}/${encodeURIComponent(id)}/related`,
    { auth: true, signal },
  );
  return res.data;
}

/** Unified object search (Phase 1.4) — groups share the RelatedGroup shape. */
export async function fetchObjectSearch(q: string, signal?: AbortSignal): Promise<RelatedGroup[]> {
  if (q.trim().length < 2) return [];
  const res = await request<{ data: { groups: RelatedGroup[] } }>(
    `/v1/search?q=${encodeURIComponent(q.trim())}`,
    { auth: true, signal },
  );
  return res.data.groups;
}

/* ── Saved explorations ── */
export interface Exploration {
  id: string;
  owner: string;
  name: string;
  payload: unknown;
  updatedAt: string;
}

export async function listExplorations(signal?: AbortSignal): Promise<Exploration[]> {
  const res = await request<{ data: Exploration[] }>(`/v1/graph/explorations`, { auth: true, signal });
  return res.data;
}

export async function saveExploration(name: string, payload: unknown): Promise<{ id: string }> {
  const res = await request<{ data: { id: string } }>(`/v1/graph/explorations`, {
    auth: true, method: 'POST', body: { name, payload },
  });
  return res.data;
}

export async function deleteExploration(id: string): Promise<void> {
  await request(`/v1/graph/explorations/${encodeURIComponent(id)}`, { auth: true, method: 'DELETE' });
}
