import { request } from '../apiClient';
import type { BdPipelineResponse, BdFilters, LeadDetailResponse, DraftGenerateRequest, DraftOutput, SavedDraft, ClaimLibrarySnapshot } from '@/types/bd';

export async function fetchBdPipeline(
  filters: BdFilters,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<BdPipelineResponse> {
  const params = new URLSearchParams();

  if (filters.market) params.set('market', filters.market);
  if (filters.minScore > 0) params.set('minEu', String(filters.minScore));
  if (filters.source) params.set('source', filters.source);
  if (filters.band) params.set('band', filters.band);
  if (filters.listedOnLcx !== null) params.set('listed', String(filters.listedOnLcx));
  if (filters.hasContact !== null) params.set('hasContact', String(filters.hasContact));
  if (filters.marketRecommendation) params.set('marketRecommendation', filters.marketRecommendation);
  if (filters.search) params.set('search', filters.search);
  params.set('sort', filters.sort);
  params.set('order', filters.order);
  params.set('limit', String(page.limit ?? 50));
  if (page.offset) params.set('offset', String(page.offset));

  const qs = params.toString();
  return request<BdPipelineResponse>(`/v1/projects${qs ? `?${qs}` : ''}`, { auth: true, signal });
}

export async function fetchLead(id: string, signal?: AbortSignal): Promise<LeadDetailResponse> {
  return request<LeadDetailResponse>(`/v1/projects/${id}`, { auth: true, signal });
}

export async function approveLead(id: string): Promise<void> {
  await request<{ data: { projectId: string; status: string } }>(
    `/v1/projects/${id}/approve`,
    { auth: true, method: 'POST' },
  );
}

export async function suppressLead(id: string): Promise<void> {
  await request<{ data: { projectId: string; status: string } }>(
    `/v1/projects/${id}/suppress`,
    { auth: true, method: 'POST' },
  );
}

export async function triggerRescore(id: string): Promise<void> {
  await request<{ data: { projectId: string } }>(
    `/v1/projects/${id}/score`,
    { auth: true, method: 'POST' },
  );
}

export async function triggerEnrich(id: string): Promise<void> {
  await request<{ data: { projectId: string } }>(
    `/v1/projects/${id}/enrich`,
    { auth: true, method: 'POST' },
  );
}

export async function addPerson(
  projectId: string,
  data: { name: string; title?: string; role?: string; linkedin?: string; email?: string; telegram?: string },
): Promise<{ data: import('@/types/bd').LeadPerson }> {
  return request(`/v1/projects/${projectId}/people`, { auth: true, method: 'POST', body: data });
}

export async function updatePerson(
  projectId: string,
  personId: string,
  data: Partial<{ name: string; title: string; role: string; linkedin: string; email: string; telegram: string; emailStatus: string }>,
): Promise<{ data: import('@/types/bd').LeadPerson }> {
  return request(`/v1/projects/${projectId}/people/${personId}`, { auth: true, method: 'PATCH', body: data });
}

export async function checkGate(projectId: string): Promise<{ data: import('@/types/bd').GateCheck }> {
  return request(`/v1/projects/${projectId}/gate`, { auth: true });
}

/* ── Drafts ── */

export async function generateDraft(
  projectId: string,
  data: DraftGenerateRequest,
): Promise<{ data: DraftOutput; warnings: string[] }> {
  return request(`/v1/projects/${projectId}/drafts/generate`, { auth: true, method: 'POST', body: data });
}

export async function saveDraft(
  projectId: string,
  data: {
    contactName: string;
    subject: string;
    body: string;
    channel?: string;
    touchIndex?: number;
    claimsUsed?: string[];
    requiresHumanReview?: boolean;
    operatorEdited?: boolean;
  },
): Promise<{ data: SavedDraft }> {
  return request(`/v1/projects/${projectId}/drafts/save`, { auth: true, method: 'POST', body: data });
}

export async function fetchDrafts(projectId: string): Promise<{ data: SavedDraft[] }> {
  return request(`/v1/projects/${projectId}/drafts`, { auth: true });
}

export async function updateDraft(
  projectId: string,
  draftId: string,
  data: { subject?: string; body?: string; approved?: boolean; operatorEdited?: boolean },
): Promise<{ data: SavedDraft }> {
  return request(`/v1/projects/${projectId}/drafts/${draftId}`, { auth: true, method: 'PATCH', body: data });
}

/* ── Claims ── */

export async function fetchClaims(): Promise<{ data: ClaimLibrarySnapshot }> {
  return request(`/v1/projects/claims`, { auth: true });
}

/* ── Outreach Sequences ── */

export async function enrollProject(
  projectId: string,
  data: { personId?: string; contactName?: string; channel?: string },
): Promise<{ data: { sequenceId: string; steps: number; contactName: string } }> {
  return request(`/v1/outreach/enroll/${projectId}`, { auth: true, method: 'POST', body: data });
}

export async function pauseSequence(sequenceId: string): Promise<void> {
  await request(`/v1/outreach/sequences/${sequenceId}/pause`, { auth: true, method: 'POST' });
}

export async function resumeSequence(sequenceId: string): Promise<void> {
  await request(`/v1/outreach/sequences/${sequenceId}/resume`, { auth: true, method: 'POST' });
}

export async function fetchProjectSequences(projectId: string): Promise<{ data: import('@/types/bd').SequenceRecord[] }> {
  return request(`/v1/outreach/projects/${projectId}/sequences`, { auth: true });
}

export async function fetchProjectMessages(projectId: string): Promise<{ data: import('@/types/bd').MessageRecord[] }> {
  return request(`/v1/outreach/projects/${projectId}/messages`, { auth: true });
}

// ── Handoffs ──
export async function fetchHandoffs(params?: {
  status?: string;
  projectId?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: import('@/types/bd').HandoffRecord[]; meta: { total: number } }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.projectId) qs.set('projectId', params.projectId);
  if (params?.assignedTo) qs.set('assignedTo', params.assignedTo);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const qstr = qs.toString();
  return request(`/v1/handoffs${qstr ? `?${qstr}` : ''}`, { auth: true });
}

export async function fetchHandoff(id: string): Promise<{ data: import('@/types/bd').HandoffRecord }> {
  return request(`/v1/handoffs/${id}`, { auth: true });
}

export async function claimHandoff(id: string): Promise<void> {
  await request(`/v1/handoffs/${id}/claim`, { auth: true, method: 'POST' });
}

export async function updateHandoffStatus(id: string, status: string): Promise<void> {
  await request(`/v1/handoffs/${id}/status`, { auth: true, method: 'PATCH', body: { status } });
}

export async function addHandoffNote(id: string, content: string): Promise<void> {
  await request(`/v1/handoffs/${id}/notes`, { auth: true, method: 'POST', body: { content } });
}

export async function reEnrollHandoff(id: string): Promise<void> {
  await request(`/v1/handoffs/${id}/re-enroll`, { auth: true, method: 'POST' });
}

export async function simulateReply(data: { sequenceId?: string; projectId?: string; channel?: string }): Promise<void> {
  await request(`/v1/handoffs/reply`, { auth: true, method: 'POST', body: data });
}

// ── Deals ──
export async function fetchProjectDeal(projectId: string): Promise<{ data: import('@/types/bd').DealRecord | null }> {
  return request(`/v1/deals/projects/${projectId}`, { auth: true });
}

export async function createDeal(projectId: string, body?: { packageType?: string; packageValue?: number }): Promise<{ data: import('@/types/bd').DealRecord }> {
  return request(`/v1/deals/projects/${projectId}`, { auth: true, method: 'POST', body });
}

export async function updateDeal(id: string, body: { packageType?: string; packageValue?: number; notes?: string; owner?: string }): Promise<{ data: import('@/types/bd').DealRecord }> {
  return request(`/v1/deals/${id}`, { auth: true, method: 'PATCH', body });
}

export async function transitionDealStage(id: string, body: { stage: string; winReason?: string; lossReason?: string; lossCategory?: string }): Promise<{ data: import('@/types/bd').DealRecord }> {
  return request(`/v1/deals/${id}/stage`, { auth: true, method: 'POST', body });
}

export async function generateProposal(id: string): Promise<{ data: import('@/types/bd').DealRecord }> {
  return request(`/v1/deals/${id}/proposal`, { auth: true, method: 'POST' });
}

export async function fetchDealEvents(id: string): Promise<{ data: import('@/types/bd').DealEvent[] }> {
  return request(`/v1/deals/${id}/events`, { auth: true });
}

export async function fetchDealObjections(id: string): Promise<{ data: import('@/types/bd').DealObjection[] }> {
  return request(`/v1/deals/${id}/objections`, { auth: true });
}

export async function addDealObjection(id: string, body: { category: string; description: string; severity?: string }): Promise<{ data: import('@/types/bd').DealObjection }> {
  return request(`/v1/deals/${id}/objections`, { auth: true, method: 'POST', body });
}

export async function resolveDealObjection(dealId: string, objId: string, body: { resolution?: string }): Promise<void> {
  await request(`/v1/deals/${dealId}/objections/${objId}`, { auth: true, method: 'PATCH', body });
}

/* ── Assisted send queue ── */

export interface QueueItem {
  id: string;
  sequenceId: string | null;
  projectId: string;
  projectName: string;
  projectTicker: string | null;
  band: string;
  priorityScore: number;
  personId: string | null;
  personName: string | null;
  personTitle: string | null;
  personLinkedin: string | null;
  personTelegram: string | null;
  stepIndex: number;
  touchIndex: number;
  channel: string;
  action: string;
  subject: string | null;
  body: string;
  dueAt: string;
  status: string;
}

export interface QueueCaps {
  connectionsToday: number;
  connectionsWeek: number;
  messagesToday: number;
  limits: { dailyConnections: number; weeklyConnections: number; dailyMessages: number };
}

export async function fetchSendQueue(
  filters?: { channel?: string; status?: string },
  signal?: AbortSignal,
): Promise<{ items: QueueItem[]; caps: QueueCaps }> {
  const params = new URLSearchParams();
  if (filters?.channel) params.set('channel', filters.channel);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const res = await request<{ data: { items: QueueItem[]; caps: QueueCaps } }>(
    `/v1/outreach/queue${qs ? `?${qs}` : ''}`,
    { auth: true, signal },
  );
  return res.data;
}

export async function markQueueItemSent(id: string, body?: string): Promise<void> {
  await request(`/v1/outreach/queue/${id}/sent`, { auth: true, method: 'POST', body: { body } });
}

export async function skipQueueItem(id: string): Promise<void> {
  await request(`/v1/outreach/queue/${id}/skip`, { auth: true, method: 'POST', body: {} });
}

export async function snoozeQueueItem(id: string, until?: string): Promise<void> {
  await request(`/v1/outreach/queue/${id}/snooze`, { auth: true, method: 'POST', body: { until } });
}

export async function fetchOutreachConfig(): Promise<{ lcxTelegramHandle: string | null }> {
  const res = await request<{ data: { lcxTelegramHandle: string | null } }>(
    '/v1/outreach/queue/config',
    { auth: true },
  );
  return res.data;
}

/* ── Reply drafts + telegram conversion ── */

export interface ReplyDraft {
  angle: 'meeting' | 'telegram' | 'info';
  subject: string;
  body: string;
}

export async function fetchReplyDrafts(handoffId: string): Promise<{ drafts: ReplyDraft[]; warnings: string[] }> {
  const res = await request<{ data: { drafts: ReplyDraft[]; warnings: string[] } }>(
    `/v1/handoffs/${handoffId}/reply-drafts`,
    { auth: true },
  );
  return res.data;
}

export async function markHandoffMovedToTelegram(handoffId: string): Promise<void> {
  await request(`/v1/handoffs/${handoffId}/moved-to-telegram`, { auth: true, method: 'POST', body: {} });
}

export async function logManualReply(projectId: string, channel: 'email' | 'linkedin'): Promise<void> {
  await request('/v1/handoffs/reply', { auth: true, method: 'POST', body: { projectId, channel } });
}

/* ── Contact discovery ── */

export async function enqueueContactDiscovery(projectId: string): Promise<void> {
  await request(`/v1/discovery/projects/${projectId}`, { auth: true, method: 'POST', body: {} });
}

export async function runDiscoveryTick(): Promise<{ processed: number; emailsFound: number; failed: number }> {
  const res = await request<{ data: { processed: number; emailsFound: number; failed: number } }>(
    '/v1/discovery/tick',
    { auth: true, method: 'POST', body: {} },
  );
  return res.data;
}
