import { request } from '../apiClient';

/** SLOs & error budgets (Phase 4.3) — mirrors apps/api/src/intel/slo.ts. */
export type SloUnit = 'pct' | 'ms' | 'hours';
export type SloStatus = 'ok' | 'warn' | 'breach' | 'no_data';

export interface Slo {
  key: string;
  label: string;
  description: string;
  unit: SloUnit;
  target: number;
  current: number | null;
  higherIsBetter: boolean;
  status: SloStatus;
  budgetBurnPct: number | null;
  window: string;
  detail: string;
}
export interface SloReport { generatedAt: string; slos: Slo[]; anyBreach: boolean; anyWarn: boolean }

export async function fetchSlos(): Promise<SloReport> {
  return (await request<{ data: SloReport }>(`/v1/intel/slo`, { auth: true })).data;
}

export function fmtSlo(v: number | null, unit: SloUnit): string {
  if (v == null) return '—';
  if (unit === 'pct') return `${v}%`;
  if (unit === 'ms') return `${v}ms`;
  return `${v}h`;
}
