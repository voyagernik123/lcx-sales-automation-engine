import { request } from '../apiClient';

/** MY DESK (Phase 4.4) — mirrors GET /v1/me/desk + the governed assign action. */
export interface DeskDeal {
  id: string; stage: string; projectName: string; ticker: string | null;
  packageValue: number | null; daysSinceUpdate: number;
}
export interface DeskMonitorFire { monitorId: string; name: string; subjectId: string; firedAt: string }
export interface DeskCommitment { id: string; title: string; dueAt: string | null; projectName: string | null; overdue: boolean }
export interface DeskDecision { id: string; title: string; reviewBy: string | null; subjectType: string | null; subjectId: string | null }

export interface MyDesk {
  owner: string;
  deals: DeskDeal[];
  monitorFires: DeskMonitorFire[];
  commitments: DeskCommitment[];
  decisions: DeskDecision[];
}

export async function fetchMyDesk(): Promise<MyDesk> {
  return (await request<{ data: MyDesk }>(`/v1/me/desk`, { auth: true })).data;
}

/** Assign a deal/monitor/pir owner through the governed action registry. */
export async function assignOwner(subjectType: 'deal' | 'monitor' | 'pir', subjectId: string, owner: string): Promise<void> {
  await request(`/v1/actions/assign/invoke`, {
    auth: true, method: 'POST',
    body: { subjectType, subjectId, params: { owner } },
  });
}
