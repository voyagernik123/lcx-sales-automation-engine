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
export interface CommandWorkstream { id: string; name: string; owner: string | null; status: string | null }
export const fetchCommandWorkstreamsList = () => get<CommandWorkstream[]>('/workstreams');

/** Governed (re)seed of the strategy extract. */
export async function seedCommand(): Promise<Record<string, number>> {
  return (await request<{ data: Record<string, number> }>(`/v1/command/seed`, { auth: true, method: 'POST' })).data;
}

/* ── Wave 2: launch Monte Carlo + governed program actions ── */

export interface LaunchSim {
  runs: number;
  p10Days: number; p50Days: number; p90Days: number; meanDays: number;
  p10Date: string; p50Date: string; p90Date: string;
  criticality: Array<{ id: string; title: string; status: string; criticality: number; meanDuration: number }>;
  warnings: string[];
  assumptions: Array<{ id: string; title: string; status: string; min: number; mode: number; max: number }>;
  disclaimer: string;
}

export const fetchLaunchSim = () => get<LaunchSim>('/launch-sim');

/**
 * Invoke a governed LCX COMMAND action through the Phase-3 registry — the one
 * audited write path (actor = the signed-in operator).
 */
export async function invokeCommandAction(
  actionId: 'command_set_task_status' | 'command_decide' | 'command_set_partner_stage' | 'command_set_partner_details',
  subjectType: 'command_task' | 'command_decision' | 'command_partner',
  subjectId: string,
  params: Record<string, unknown>,
): Promise<void> {
  await request(`/v1/actions/${actionId}/invoke`, {
    auth: true, method: 'POST',
    body: { subjectType, subjectId, params },
  });
}

/* ── Wave 3: AI over the program + BD cross-links ── */

export interface ProgramAnswer {
  answer: string;
  usedLlm: boolean;
  context: {
    gating: Array<{ id: string; title: string; status: string; done: boolean }>;
    blocked: Array<{ id: string; title: string; workstream: string | null }>;
    nextUnblocked: Array<{ id: string; title: string; status: string }>;
    topCritical: Array<{ id: string; title: string; criticality: number }>;
    simP50Days: number; simP90Days: number;
    openDecisions: number;
    topRisks: Array<{ title: string; impact: string; likelihood: string }>;
    anchorConfirmed: boolean;
    warnings: string[];
  };
}

export async function askProgram(question: string): Promise<ProgramAnswer> {
  return (await request<{ data: ProgramAnswer }>(`/v1/command/ask`, { auth: true, method: 'POST', body: { question } })).data;
}

export interface BdMatch { id: string; name: string; ticker: string | null; tier: string | null }
export const fetchBdMatches = (partnerId: string) => get<BdMatch[]>(`/partners/${partnerId}/bd-matches`);

/* ── 100X Phase 1: the full-fidelity deep ontology ── */

export interface ScorecardDim { key: string; label: string; weight: number }
export interface ScorecardRow {
  subjectId: string; subjectLabel: string; meta?: Record<string, string | null>;
  scores: Record<string, number>; weighted: number | null; rank: number | null; tier: string | null; note?: string;
}
export interface Scorecard { dimensions: ScorecardDim[]; rows: ScorecardRow[] }
export interface CommandSource { id: string; phase: string; label: string; url: string | null }

export interface CommandDeep {
  reference: {
    defaultGrade: string;
    scorecards: { lp: Scorecard; channel: Scorecard; arch: Scorecard; twoPath: Scorecard };
    capabilityDetail: Array<Record<string, unknown>>;
    connectivity: Array<Record<string, unknown>>;
    rfi: { fields: Array<{ key: string; label: string }>; example: { provider: string; values: Record<string, unknown> } };
    railProviders: Array<Record<string, unknown>>;
    stablecoinPolicy: Array<{ coin: string; issuer: string; status: string; action: string; sourceRefs: string[] }>;
    licensingChecklist: Array<Record<string, unknown>>;
    funnel: {
      channels: Array<{ channelId: string; label: string; type: string; budget: number; cac: number | null; signupsEst: number | null }>;
      conversions: { waitlistToVerified: number; verifiedToFunded: number };
      scenarios: Array<{ name: string; budget: number | null; waitlist: number | null; funded: number | null }>;
    };
    referralMechanics: Array<{ component: string; design: string }>;
    guardrails: Array<Record<string, unknown>>;
    ninetyDayPlan: Array<Record<string, unknown>>;
    tooling: Array<Record<string, unknown>>;
    ddDimensions: Array<{ dimension: string; assess: string | null; criteria: string | null; weightPct: number; gate: boolean; sourceRefs: string[] }>;
    listingPolicyOutline: Array<{ section: string; contents: string }>;
    budgetLines: Array<Record<string, unknown>>;
    dependencyEdges: Array<{ fromWs: string; onWs: string; strength: 'hard' | 'soft'; note: string }>;
    execDashboard: Array<Record<string, unknown>>;
    masterRoadmap: Array<Record<string, unknown>>;
    consolidatedRisks: Array<Record<string, unknown>>;
    decisionEnrichment: Array<{ decisionId: string; options: string | null; owner: string | null }>;
    sources: CommandSource[];
  };
  rfi: Array<{ partner_id: string; status: string; owner: string | null; grade: string | null; values: Record<string, unknown> }>;
  requirements: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown>>;
  live: { requirements: boolean; blockers: boolean };
}

export const fetchCommandDeep = () => get<CommandDeep>('/deep');
