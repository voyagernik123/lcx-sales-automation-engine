import { request } from '../apiClient';

/** AI Operator (Phase 5) client — mirrors apps/api/src/routes/aiOperator.ts. */
export interface EvidenceCitation { id: string; grade: string; predicate: string; source: string; confidence: number }
export interface DossierAnswer { answer: string; citations: EvidenceCitation[]; usedLlm: boolean; evidenceCount: number }
export interface ActionProposal { actionId: string; subjectType: string; subjectId: string; params: Record<string, unknown>; rationale: string; source: 'ai' | 'deterministic' }
export interface OutreachDraft { draft: string; rationale: string; usedLlm: boolean }
export type SignalClass = 'true_signal' | 'data_artifact' | 'deception_suspect' | 'unclear';
export interface TriageResult { classification: SignalClass; rationale: string; suggestedAction: string; usedLlm: boolean }

type Meta = { aiAvailable?: boolean };

export async function askDossier(projectId: string, question: string): Promise<{ data: DossierAnswer; meta: Meta }> {
  return request<{ data: DossierAnswer; meta: Meta }>(`/v1/ai/dossier/${projectId}`, { auth: true, method: 'POST', body: { question } });
}
export async function estimateOutlook(projectId: string): Promise<{ data: DossierAnswer; meta: Meta }> {
  return request<{ data: DossierAnswer; meta: Meta }>(`/v1/ai/estimate/${projectId}`, { auth: true, method: 'POST' });
}
export async function proposeActions(projectId: string): Promise<{ proposals: ActionProposal[]; usedLlm: boolean }> {
  return (await request<{ data: { proposals: ActionProposal[]; usedLlm: boolean } }>(`/v1/ai/propose/${projectId}`, { auth: true, method: 'POST' })).data;
}
export async function confirmProposal(p: ActionProposal): Promise<void> {
  await request(`/v1/ai/confirm`, { auth: true, method: 'POST', body: { actionId: p.actionId, subjectType: p.subjectType, subjectId: p.subjectId, params: p.params } });
}
export async function draftOutreach(projectId: string): Promise<OutreachDraft> {
  return (await request<{ data: OutreachDraft }>(`/v1/ai/draft-outreach/${projectId}`, { auth: true, method: 'POST' })).data;
}
export async function triageSignal(projectId: string, signal: string): Promise<TriageResult> {
  return (await request<{ data: TriageResult }>(`/v1/ai/triage`, { auth: true, method: 'POST', body: { projectId, signal } })).data;
}
export async function wbrNarrative(): Promise<{ narrative: string; usedLlm: boolean; deterministic: string }> {
  return (await request<{ data: { narrative: string; usedLlm: boolean; deterministic: string } }>(`/v1/ai/wbr-narrative`, { auth: true, method: 'POST' })).data;
}
