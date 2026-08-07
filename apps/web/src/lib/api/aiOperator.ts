import { request } from '../apiClient';

/** AI Operator (Phase 5) client — mirrors apps/api/src/routes/aiOperator.ts. */
export interface EvidenceCitation { id: string; grade: string; predicate: string; source: string; confidence: number }

/**
 * WHY THERE IS A `status` AND NOT JUST `usedLlm`.
 *
 * `llm.ts` used to return an identical `{ text: '', usedLlm: false }` for four unrelated
 * conditions — no provider configured, a non-ok response, an HTTP 200 carrying
 * `stop_reason: 'refusal'`, and a transport throw — and every screen then named ONE cause,
 * "no AI key". That sentence was a false statement in three of the four cases: a rate-limited
 * provider, a model that declined, and a network failure all read as "nobody configured a key".
 *
 * A boolean cannot carry four states, so the API now returns which one it was, with a stable
 * code and an operator-facing sentence. `usedLlm` is kept because it is still the right
 * question for "did a model write this", but it is no longer the only thing a screen has, and
 * NOTHING may infer a cause from it.
 */
export type AiStatus = 'ok' | 'no_provider' | 'provider_error' | 'refused' | 'empty' | 'context_refused';

/** The outcome fields every AI engine now returns. Required — a screen must not guess. */
export interface AiOutcome {
  status: AiStatus;
  /** Stable code. `null` only on a real answer. */
  code: string | null;
  /** The sentence to SHOW. Names the actual cause; never a guess. */
  detail: string;
}

export interface DossierAnswer extends AiOutcome {
  answer: string;
  citations: EvidenceCitation[];
  usedLlm: boolean;
  evidenceCount: number;
  /** The rule the refusal cites. Empty only on a real answer. */
  rule: string;
  /** Markers the model emitted that resolve to no evidence in this dossier. */
  unbackedCitations: number;
  /** Advisory: a dossier field reads like an instruction aimed at the model. */
  looksLikeInjection: boolean;
}
export interface ActionProposal { actionId: string; subjectType: string; subjectId: string; params: Record<string, unknown>; rationale: string; source: 'ai' | 'deterministic' }
export interface OutreachDraft extends AiOutcome { draft: string; rationale: string; usedLlm: boolean }
export type SignalClass = 'true_signal' | 'data_artifact' | 'deception_suspect' | 'unclear';
export interface TriageResult extends AiOutcome { classification: SignalClass; rationale: string; suggestedAction: string; usedLlm: boolean }

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
