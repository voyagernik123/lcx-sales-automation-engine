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
  /**
   * PRESENT WHEN THE GRANTS COULD NOT BE READ AT ALL — the third state, and the reason it
   * exists is that `entitlements: {}` on its own is a definite claim ("you hold nothing")
   * that the server is in no position to make when Postgres is unreachable.
   *
   * When this is set, `entitlements` is empty because it is UNKNOWN, not because it is
   * empty. The shell must name the refusal rather than render an operator's workspace list
   * as absent — see `useMyWorkspaces`, which used to return `[]` here and produced an empty
   * launcher on 2026-08-10.
   */
  entitlementsUnavailable?: { code: string; reason: string } | null;
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

/** Destructive → step-up: the caller re-supplies the desk passcode. */
export const revokeEntitlement = (memberId: string, workspace: WorkspaceId, justification: string, stepUpPasscode: string) =>
  invokeAccessAction('revoke_entitlement', 'member', memberId, { workspace, justification, stepUpPasscode });

export const decideAccessRequest = (requestId: string, decision: 'approved' | 'denied', note?: string) =>
  invokeAccessAction('decide_access_request', 'access_request', requestId, note ? { decision, note } : { decision });

export const setMemberProfile = (memberId: string, unit: string, title: string) =>
  invokeAccessAction('set_member_profile', 'member', memberId, { unit, title });

/* ── Directorate depth (Phase 2) — dossier + activity telemetry ── */

export interface MemberDossier {
  member: { id: string; name: string; email: string; role: string };
  profile: { unit: string | null; title: string | null; updated_by: string | null; updated_at: string } | null;
  entitlements: Array<{ workspace: WorkspaceId; capability: Capability; granted_by: string; justification: string | null; granted_at: string }>;
  activity: Array<{ action: string; subject_type: string; subject_id: string; created_at: string }>;
  dbLive: boolean;
}

/** Purpose-gated read — the reason rides in X-Purpose and is itself audited. */
export const fetchMemberDossier = async (memberId: string, purpose: string): Promise<MemberDossier> =>
  (await request<{ data: MemberDossier }>(`/v1/access/members/${memberId}`, { auth: true, headers: { 'X-Purpose': purpose } })).data;

export interface AccessActivityRow {
  actor: string; action: string; entity: string | null; entity_id: string | null;
  meta: Record<string, unknown>; created_at: string;
}
export const fetchAccessActivity = async (): Promise<AccessActivityRow[]> =>
  (await request<{ data: AccessActivityRow[] }>(`/v1/access/activity`, { auth: true })).data;
