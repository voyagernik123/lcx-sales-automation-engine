import { request } from '../apiClient';

/** Decision log (Phase 4.2) — mirrors apps/api/src/routes/decisions.ts. */
export interface Decision {
  id: string;
  title: string;
  context: string;
  optionsConsidered: string;
  decision: string;
  rationale: string;
  owner: string;
  subjectType: string | null;
  subjectId: string | null;
  reviewBy: string | null;
  outcome: string | null;
  outcomeAt: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionFilters { owner?: string; subjectType?: string; subjectId?: string; reviewDue?: boolean; limit?: number }

export async function listDecisions(f: DecisionFilters = {}): Promise<Decision[]> {
  const q = new URLSearchParams();
  if (f.owner) q.set('owner', f.owner);
  if (f.subjectType) q.set('subjectType', f.subjectType);
  if (f.subjectId) q.set('subjectId', f.subjectId);
  if (f.reviewDue) q.set('reviewDue', '1');
  if (f.limit) q.set('limit', String(f.limit));
  const qs = q.toString();
  return (await request<{ data: Decision[] }>(`/v1/decisions${qs ? `?${qs}` : ''}`, { auth: true })).data;
}

export interface DecisionInput {
  title: string; context?: string; optionsConsidered?: string; decision?: string;
  rationale?: string; owner?: string; subjectType?: string | null; subjectId?: string | null; reviewBy?: string | null;
}

export async function createDecision(input: DecisionInput): Promise<{ id: string }> {
  return (await request<{ data: { id: string } }>(`/v1/decisions`, { auth: true, method: 'POST', body: input })).data;
}
export async function updateDecision(id: string, patch: Partial<DecisionInput> & { outcome?: string }): Promise<void> {
  await request(`/v1/decisions/${id}`, { auth: true, method: 'PATCH', body: patch });
}
export async function deleteDecision(id: string): Promise<void> {
  await request(`/v1/decisions/${id}`, { auth: true, method: 'DELETE' });
}
