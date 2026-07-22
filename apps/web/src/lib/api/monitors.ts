import { request } from '../apiClient';

/** Object monitors + governed actions (Phase 3.1 / 3.2). */
export interface MonitorFilter { tier?: string; band?: string; category?: string; listedOnLcx?: boolean; minMcap?: number; maxMcap?: number }
export interface MonitorCondition { metric: string; op: string; threshold: number }
export interface MonitorAction { id: string; params?: Record<string, unknown> }

export interface Monitor {
  id: string; owner: string; name: string; enabled: boolean; subjectType: string;
  filter: MonitorFilter; condition: MonitorCondition; action: MonitorAction;
  lastRunAt: string | null; lastMatchCount: number; createdAt: string;
}

export interface RegistryActionInfo { id: string; label: string; description: string; subjectTypes: string[]; minRole: string }

export const MONITOR_METRICS = [
  { key: 'conviction', label: 'Conviction' },
  { key: 'priority_score', label: 'Priority score' },
  { key: 'propensity_score', label: 'Propensity' },
  { key: 'eu_score', label: 'EU score' },
  { key: 'us_post_score', label: 'US (post) score' },
  { key: 'market_cap_usd', label: 'Market cap (USD)' },
  { key: 'volume_24h_usd', label: '24h volume (USD)' },
  { key: 'exchange_count', label: 'Competitor venues' },
  { key: 'price_change_30d', label: '30d price change %' },
] as const;

export const MONITOR_OPS = [
  { key: 'gte', label: '≥' }, { key: 'gt', label: '>' }, { key: 'lte', label: '≤' },
  { key: 'lt', label: '<' }, { key: 'eq', label: '=' }, { key: 'neq', label: '≠' },
] as const;

export async function listActions(): Promise<RegistryActionInfo[]> {
  return (await request<{ data: RegistryActionInfo[] }>(`/v1/actions`, { auth: true })).data;
}

export async function listMonitors(): Promise<Monitor[]> {
  return (await request<{ data: Monitor[] }>(`/v1/monitors`, { auth: true })).data;
}
export async function createMonitor(m: Partial<Monitor>): Promise<{ id: string }> {
  return (await request<{ data: { id: string } }>(`/v1/monitors`, { auth: true, method: 'POST', body: m })).data;
}
export async function updateMonitor(id: string, patch: Partial<Monitor>): Promise<void> {
  await request(`/v1/monitors/${id}`, { auth: true, method: 'PATCH', body: patch });
}
export async function deleteMonitor(id: string): Promise<void> {
  await request(`/v1/monitors/${id}`, { auth: true, method: 'DELETE' });
}
export async function monitorActivity(id: string): Promise<Array<{ subjectId: string; name: string | null; ticker: string | null; firedAt: string }>> {
  return (await request<{ data: Array<{ subjectId: string; name: string | null; ticker: string | null; firedAt: string }> }>(`/v1/monitors/${id}/activity`, { auth: true })).data;
}
export async function tickMonitors(): Promise<{ monitors: number; matched: number; fired: number }> {
  return (await request<{ data: { monitors: number; matched: number; fired: number } }>(`/v1/monitors/tick`, { auth: true, method: 'POST' })).data;
}
