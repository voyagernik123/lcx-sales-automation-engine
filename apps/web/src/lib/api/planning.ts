import { request } from '../apiClient';
import type { SalesScenario } from '@/stores/useSalesScenarioStore';

/** Named scenarios (3.3) + PIRs (3.4). */
export interface SavedScenario { id: string; owner: string; name: string; deltas: SalesScenario; shared: boolean; updatedAt: string }
export interface Pir { id: string; owner: string; name: string; question: string; sources: string[]; priority: number; updatedAt: string }

export async function listScenarios(): Promise<SavedScenario[]> {
  return (await request<{ data: SavedScenario[] }>(`/v1/scenarios`, { auth: true })).data;
}
export async function saveScenario(name: string, deltas: SalesScenario): Promise<{ id: string }> {
  return (await request<{ data: { id: string } }>(`/v1/scenarios`, { auth: true, method: 'POST', body: { name, deltas } })).data;
}
export async function deleteScenario(id: string): Promise<void> {
  await request(`/v1/scenarios/${id}`, { auth: true, method: 'DELETE' });
}

export async function listPirs(): Promise<Pir[]> {
  return (await request<{ data: Pir[] }>(`/v1/pirs`, { auth: true })).data;
}
export async function savePir(input: { name: string; question?: string; sources?: string[]; priority?: number }): Promise<{ id: string }> {
  return (await request<{ data: { id: string } }>(`/v1/pirs`, { auth: true, method: 'POST', body: input })).data;
}
export async function updatePir(id: string, patch: Partial<Pick<Pir, 'name' | 'question' | 'sources' | 'priority'>>): Promise<void> {
  await request(`/v1/pirs/${id}`, { auth: true, method: 'PATCH', body: patch });
}
export async function deletePir(id: string): Promise<void> {
  await request(`/v1/pirs/${id}`, { auth: true, method: 'DELETE' });
}
