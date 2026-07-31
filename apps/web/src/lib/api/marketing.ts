import { request } from '../apiClient';

/** LCX MARKETING — mirrors apps/api/src/routes/marketing.ts. */

export type ReplyStatus = 'new' | 'triaged' | 'drafted' | 'answered' | 'ignored';

export interface MarketingReply {
  id: number;
  x_comment_id: string;
  x_post_id: string | null;
  author_handle: string;
  author_display: string | null;
  body: string;
  posted_at: string | null;
  received_at: string;
  status: ReplyStatus;
  sentiment: string | null;
  source_grade: string;
  source_kind: string;
  parse_failed: boolean;
}

export interface MarketingDraft {
  id: number;
  reply_id: number;
  body: string;
  used_llm: boolean;
  /** The sanitiser removed a link or an address from the model's output. */
  flagged: boolean;
  flag_reason: string | null;
  status: 'proposed' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface MarketingSummary {
  counts: Partial<Record<ReplyStatus, number>>;
  oldestUnansweredHours: number | null;
  /** Replies whose text looks like an attempt to steer the model. */
  suspicious: number;
  /** Emails the parser could not read — a human must look. */
  unparsed: number;
  mailConfigured: boolean;
  /**
   * False until migration 0046 is applied on this environment. The compartment
   * reports itself as not-yet-enabled rather than erroring, so the page shows a
   * banner instead of a crash during the window between deploy and migration.
   */
  migrated: boolean;
}

const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

export const fetchMarketingQueue = (status?: ReplyStatus) =>
  unwrap(request<{ data: MarketingReply[] }>(
    `/v1/marketing/queue${status ? `?status=${status}` : ''}`, { auth: true },
  ));

export const fetchMarketingSummary = () =>
  unwrap(request<{ data: MarketingSummary }>('/v1/marketing/summary', { auth: true }));

/** Paste a reply by hand — the path that works with zero mail setup. */
export const ingestReply = (body: {
  authorHandle: string; body: string; xCommentId?: string; xPostId?: string; authorDisplay?: string;
}) => unwrap(request<{ data: { result: 'inserted' | 'duplicate' } }>(
  '/v1/marketing/ingest', { method: 'POST', body, auth: true },
));

export const draftForReply = (id: number) =>
  unwrap(request<{ data: { draft: MarketingDraft; usedLlm: boolean; suspiciousInput: boolean } }>(
    `/v1/marketing/${id}/draft`, { method: 'POST', auth: true },
  ));

export const fetchDrafts = (id: number) =>
  unwrap(request<{ data: MarketingDraft[] }>(`/v1/marketing/${id}/drafts`, { auth: true }));

/** The governed act. Attribution comes from the session, never from the body. */
export const approveDraft = (draftId: number) =>
  unwrap(request<{ data: MarketingDraft }>(
    `/v1/marketing/draft/${draftId}/approve`, { method: 'POST', auth: true },
  ));

export const setReplyStatus = (id: number, status: ReplyStatus) =>
  unwrap(request<{ data: { ok: true } }>(
    `/v1/marketing/${id}/status`, { method: 'POST', body: { status }, auth: true },
  ));
