import { request } from '../apiClient';

/** LCX COMMAND (Wave 1) — mirrors apps/api/src/routes/command.ts + overview.ts. */
export interface CommandOverview {
  generatedAt: string;
  counts: { products: number; partners: number; workstreams: number; tasks: number; decisions: number; risks: number };
  workstreams: Array<{ id: string; name: string; owner: string | null; total: number; done: number; open: number; blocked: number }>;
  partnersByType: Array<{ type: string; total: number; recommended: number; inProgress: number }>;
  riskHeat: Array<{ impact: string; likelihood: string; count: number }>;
  topRisks: Array<{ id: string; title: string; category: string; likelihood: string; impact: string; mitigation: string }>;
  launch: {
    anchor: string;
    anchorConfirmed: boolean;
    targets: Array<{ id: string; name: string; targetDate: string | null; confirmed: boolean; note: string | null }>;
    gating: Array<{ id: string; title: string; status: string; done: boolean }>;
    gatingDone: number;
    gatingTotal: number;
  };
  decisions: { open: number; total: number; byPhase: Record<string, number> };
  gaps: { partnersMissingContact: number; partnersMissingTerms: number; planningAssumptions: number; unconfirmedTargets: number; notes: string[] };
}

export interface CommandPartner {
  id: string; name: string; type: string; subtype: string | null; pipeline_stage: string | null;
  capability_score: number | null; tier: string | null; primary_contact: string | null; terms: string | null; notes: string | null; source: string | null;
}
export interface CommandTask {
  id: string; workstream: string | null; title: string; owner: string | null; target_date: string | null;
  status: string; depends_on: string[]; notes: string | null; source: string | null;
}
export interface CommandDecision { id: string; phase: string | null; decision: string; recommendation: string | null; status: string; chosen: string | null }
export interface CommandRisk { id: string; category: string | null; title: string; likelihood: string | null; impact: string | null; mitigation: string | null; phase: string | null }
export interface CommandFinancial { id: string; area: string | null; item: string; value: string | null; unit: string | null; assumption: boolean; source: string | null }
export interface CommandProduct { id: string; name: string; type: string | null; status: string | null; owner: string | null; notes: string | null }

const get = async <T>(path: string): Promise<T> => (await request<{ data: T }>(`/v1/command${path}`, { auth: true })).data;

export const fetchCommandOverview = () => get<CommandOverview>('/overview');
export const fetchCommandPartners = () => get<CommandPartner[]>('/partners');
export const fetchCommandTasks = () => get<CommandTask[]>('/tasks');
export const fetchCommandDecisions = () => get<CommandDecision[]>('/decisions');
export const fetchCommandRisks = () => get<CommandRisk[]>('/risks');
export const fetchCommandFinancials = () => get<CommandFinancial[]>('/financials');
export const fetchCommandProducts = () => get<CommandProduct[]>('/products');

/** Governed (re)seed of the strategy extract. */
export async function seedCommand(): Promise<Record<string, number>> {
  return (await request<{ data: Record<string, number> }>(`/v1/command/seed`, { auth: true, method: 'POST' })).data;
}
