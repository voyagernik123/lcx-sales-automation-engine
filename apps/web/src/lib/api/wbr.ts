import { request } from '../apiClient';
import type { WbrGpsBlock } from '@lcx/shared';

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
  /**
   * The Global Services limb. OPTIONAL and usually ABSENT: it is composed per request
   * by `routes/wbr.ts` after an entitlement check, never stored, and never present for
   * a past week — so `undefined` here means "withheld or unavailable", never "zero".
   * The reason always arrives beside it as `gpsDisposition`.
   */
  gps?: WbrGpsBlock;
}

/** Why the services limb is or is not on this report. Always present. */
export type GpsWbrDisposition =
  | { state: 'included'; block: WbrGpsBlock; cash: GpsWbrCash }
  | { state: 'withheld_no_grant'; headline: string; detail: string }
  | { state: 'withheld_historical_week'; headline: string; detail: string }
  | { state: 'unreadable'; headline: string; detail: string };

export interface GpsWbrCashRow { currency: string; count: number; amountCents: number }

export type GpsWbrCash =
  | { state: 'register_absent'; migration: string; note: string }
  | {
      state: 'measured';
      open: readonly GpsWbrCashRow[];
      paidThisWeek: readonly GpsWbrCashRow[];
      disputed: readonly GpsWbrCashRow[];
      oldestOpen: { number: string; ageDays: number; currency: string; amountCents: number } | null;
      note: string;
    };

export async function fetchWbr(
  week?: string,
): Promise<{ report: WbrReport; weeks: string[]; gpsDisposition?: GpsWbrDisposition }> {
  const q = week ? `?week=${encodeURIComponent(week)}` : '';
  return (
    await request<{ data: { report: WbrReport; weeks: string[]; gpsDisposition?: GpsWbrDisposition } }>(
      `/v1/wbr${q}`,
      { auth: true },
    )
  ).data;
}

/** Regenerate the current week's review through the standard job trigger. */
export async function regenerateWbr(): Promise<void> {
  await request(`/v1/intel/jobs/wbr?wait=1`, { auth: true, method: 'POST' });
}
