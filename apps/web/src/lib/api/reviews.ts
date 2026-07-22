import { request } from '../apiClient';

/**
 * Analytic reviews (Phase 2.3) — human structured analytic techniques.
 */
export type ReviewKind = 'key_assumptions' | 'premortem' | 'devils_advocate';
export type ReviewStatus = 'draft' | 'active' | 'resolved';

export interface AnalyticReview {
  id: string;
  kind: ReviewKind;
  subjectType: 'deal' | 'project';
  subjectId: string;
  title: string;
  content: Record<string, unknown>;
  author: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export async function listReviews(subjectType: 'deal' | 'project', subjectId: string, signal?: AbortSignal): Promise<AnalyticReview[]> {
  const res = await request<{ data: AnalyticReview[] }>(
    `/v1/reviews?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`,
    { auth: true, signal },
  );
  return res.data;
}

export async function suggestReview(kind: ReviewKind, subjectType: 'deal' | 'project', subjectId: string, llm = false): Promise<{ title: string; content: Record<string, unknown> }> {
  const res = await request<{ data: { title: string; content: Record<string, unknown> } }>(
    `/v1/reviews/suggest${llm ? '?llm=true' : ''}`,
    { auth: true, method: 'POST', body: { kind, subjectType, subjectId } },
  );
  return res.data;
}

export async function createReview(input: {
  kind: ReviewKind; subjectType: 'deal' | 'project'; subjectId: string; title: string; content: unknown; status?: ReviewStatus;
}): Promise<{ id: string }> {
  const res = await request<{ data: { id: string } }>(`/v1/reviews`, { auth: true, method: 'POST', body: input });
  return res.data;
}

export async function updateReview(id: string, patch: { title?: string; content?: unknown; status?: ReviewStatus }): Promise<void> {
  await request(`/v1/reviews/${id}`, { auth: true, method: 'PATCH', body: patch });
}

export async function deleteReview(id: string): Promise<void> {
  await request(`/v1/reviews/${id}`, { auth: true, method: 'DELETE' });
}
