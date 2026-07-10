import { getApiKey, request } from '../apiClient';
import type { KpiDashboard, PostListingTrigger } from '@/types/kpi';

export async function fetchKpis(signal?: AbortSignal): Promise<KpiDashboard> {
  const res = await request<{ data: KpiDashboard }>('/v1/kpis', { auth: true, signal });
  return res.data;
}

export async function exportKpisCsv(): Promise<Blob> {
  const apiKey = getApiKey();

  const base = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL ?? '');

  const res = await fetch(`${base}/v1/kpis/export`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) throw new Error('Failed to export KPIs');
  return res.blob();
}

export async function fetchTriggers(projectId?: string, signal?: AbortSignal): Promise<PostListingTrigger[]> {
  const params = projectId ? `?projectId=${projectId}` : '';
  const res = await request<{ data: PostListingTrigger[] }>(`/v1/kpis/triggers${params}`, { auth: true, signal });
  return res.data;
}

export async function updateTriggerStatus(
  triggerId: string,
  status: 'pending' | 'drafted' | 'completed' | 'skipped',
  draftContent?: string,
): Promise<void> {
  await request(`/v1/kpis/triggers/${triggerId}`, {
    auth: true,
    method: 'PATCH',
    body: { status, draftContent },
  });
}

export interface ForecastData {
  runs: number;
  p10: number;
  p50: number;
  p90: number;
  expected: number;
  deals: { id: string; projectName: string; stage: string; value: number; winProbability: number; daysSinceUpdate: number }[];
}

export async function fetchForecast(signal?: AbortSignal): Promise<ForecastData> {
  const res = await request<{ data: ForecastData }>('/v1/kpis/forecast', { auth: true, signal });
  return res.data;
}
