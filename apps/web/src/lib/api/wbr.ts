import { request } from '../apiClient';

/** Weekly Business Review (Phase 4.1) — mirrors apps/api/src/kpi/wbr.ts. */
export type MetricKind = 'flow' | 'stock';
export type MetricUnit = 'count' | 'usd_cents' | 'pct';

export interface WbrMetric {
  key: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
  kind: MetricKind;
  unit: MetricUnit;
  higherIsBetter: boolean;
}
export interface WbrSparkline { key: string; label: string; points: number[]; unit: MetricUnit }
export interface WbrException {
  kind: 'sla_breach' | 'stalled_deal' | 'monitor_fire' | 'budget_burn' | 'program_risk';
  label: string; detail: string; severity: 'warn' | 'critical'; href: string | null;
}
export interface WbrCommitment {
  id: string; title: string; owner: string; ownerLabel: string;
  dueAt: string | null; overdue: boolean; projectName: string | null;
}
export interface WbrReport {
  weekStart: string;
  generatedAt: string;
  inputs: WbrMetric[];
  outputs: WbrMetric[];
  sparklines: WbrSparkline[];
  exceptions: WbrException[];
  commitments: WbrCommitment[];
  narrative: string;
  live?: boolean;
}

export async function fetchWbr(week?: string): Promise<{ report: WbrReport; weeks: string[] }> {
  const q = week ? `?week=${encodeURIComponent(week)}` : '';
  return (await request<{ data: { report: WbrReport; weeks: string[] } }>(`/v1/wbr${q}`, { auth: true })).data;
}

/** Regenerate the current week's review through the standard job trigger. */
export async function regenerateWbr(): Promise<void> {
  await request(`/v1/intel/jobs/wbr?wait=1`, { auth: true, method: 'POST' });
}
