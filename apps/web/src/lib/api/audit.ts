import { request } from '../apiClient';

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: Record<string, unknown>;
  projectName: string | null;
  createdAt: string;
}

export interface AuditResponse {
  data: AuditEntry[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function fetchAuditLog(params: {
  page?: number;
  limit?: number;
  entity?: string;
  action?: string;
  actor?: string;
  signal?: AbortSignal;
}): Promise<AuditResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.entity) qs.set('entity', params.entity);
  if (params.action) qs.set('action', params.action);
  if (params.actor) qs.set('actor', params.actor);

  const q = qs.toString();
  return request<AuditResponse>(`/v1/audit${q ? `?${q}` : ''}`, { auth: true, signal: params.signal });
}
