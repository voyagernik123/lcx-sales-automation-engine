import { request } from '../apiClient';
import type { Capability, EntitlementMap, WorkspaceId } from '@lcx/shared';

/** LCX OS (LCX ONE Phase 1) — mirrors apps/api/src/routes/access.ts + the governed access actions. */

export interface AccessWorkspaceMeta {
  id: WorkspaceId;
  name: string;
  mission: string;
  icon: string;
  defaultLanding: string;
  sensitivity: 'standard' | 'elevated';
}

export interface AccessMe {
  memberId: string;
  role: 'operator' | 'approver';
  entitlements: EntitlementMap;
  profile: { unit: string | null; title: string | null } | null;
  workspaces: AccessWorkspaceMeta[];
  dbLive: boolean;
}

export interface AccessRequestRow {
  id: string;
  member_id: string;
  workspace: WorkspaceId;
  capability: Capability;
  justification: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export const fetchAccessMe = async (): Promise<AccessMe> =>
  (await request<{ data: AccessMe }>(`/v1/access/me`, { auth: true })).data;

export async function submitAccessRequest(workspace: WorkspaceId, justification: string, capability: Capability = 'view'): Promise<{ id: string; status: string }> {
  return (await request<{ data: { id: string; status: string } }>(`/v1/access/requests`, {
    auth: true, method: 'POST', body: { workspace, capability, justification },
  })).data;
}

export const fetchAccessRequests = async (status?: 'pending' | 'approved' | 'denied'): Promise<AccessRequestRow[]> =>
  (await request<{ data: AccessRequestRow[] }>(`/v1/access/requests${status ? `?status=${status}` : ''}`, { auth: true })).data;

export interface AccessMatrixMember {
  id: string; name: string; email: string; role: string;
  profile: { member_id: string; unit: string | null; title: string | null } | null;
  entitlements: Array<{ member_id: string; workspace: WorkspaceId; capability: Capability; granted_by: string; justification: string | null; granted_at: string }>;
}

export const fetchAccessMatrix = async (): Promise<{ members: AccessMatrixMember[]; dbLive: boolean }> =>
  (await request<{ data: { members: AccessMatrixMember[]; dbLive: boolean } }>(`/v1/access/matrix`, { auth: true })).data;

/** The governed writes — grant/revoke/decide flow through the action registry (audited, approver-only). */
async function invokeAccessAction(actionId: string, subjectType: string, subjectId: string, params: Record<string, unknown>): Promise<void> {
  await request(`/v1/actions/${actionId}/invoke`, {
    auth: true, method: 'POST',
    body: { subjectType, subjectId, params },
  });
}

export const grantEntitlement = (memberId: string, workspace: WorkspaceId, capability: Capability, justification: string) =>
  invokeAccessAction('grant_entitlement', 'member', memberId, { workspace, capability, justification });

export const revokeEntitlement = (memberId: string, workspace: WorkspaceId, justification: string) =>
  invokeAccessAction('revoke_entitlement', 'member', memberId, { workspace, justification });

export const decideAccessRequest = (requestId: string, decision: 'approved' | 'denied', note?: string) =>
  invokeAccessAction('decide_access_request', 'access_request', requestId, note ? { decision, note } : { decision });
