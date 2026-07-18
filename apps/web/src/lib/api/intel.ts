import { request } from '@/lib/apiClient';
import type { ActionDef, Observation } from '@lcx/shared';

/**
 * Intelligence-spine client (Wave 0): observations (provenance) + governed
 * actions on any ontology object.
 */

export interface ObjectState {
  watchlisted: boolean;
  flagged: boolean;
}

export interface WatchlistEntry {
  id: string;
  subjectType: string;
  subjectId: string;
  note: string | null;
  addedBy: string;
  createdAt: string;
}

export interface CoverageEntry {
  id: string;
  label: string;
  source: string;
  yields: string;
  status: 'ok' | 'error' | 'pending' | 'missing';
  lastOkAt: string | null;
  fresh: boolean;
}

export function fetchCoverage(subjectType: string, subjectId: string): Promise<CoverageEntry[]> {
  return request<{ data: CoverageEntry[] }>(`/v1/intel/coverage?${q(subjectType, subjectId)}`).then((r) => r.data);
}

/* ── Alpha (Wave 2) — predictive scores, targets, I&W, backtest ─────── */

export interface TargetRow {
  id: string;
  name: string;
  ticker: string | null;
  conviction: number;
  timingScore: number | null;
  timingWindow: 'hot' | 'warming' | 'quiet' | null;
  dealValueUsd: number | null;
  winnability: number | null;
  achVerdict: string | null;
  competitorCount: number;
  contactCount: number;
  drivers: { label: string; points: number }[];
}

export function fetchTargets(limit = 25, minConviction = 0): Promise<TargetRow[]> {
  return request<{ data: TargetRow[] }>(`/v1/intel/targets?limit=${limit}&minConviction=${minConviction}`).then((r) => r.data);
}

export interface AlphaScore {
  score: number;
  confidence: number;
  drivers: { label: string; points: number }[];
}
export interface Assessment {
  propensity: AlphaScore | null;
  timing: (AlphaScore & { window: 'hot' | 'warming' | 'quiet' }) | null;
  value: (AlphaScore & { usd: number }) | null;
  winnability: AlphaScore | null;
  conviction: AlphaScore | null;
  ach: {
    verdict: string;
    confidence: number;
    probabilities: Record<string, number>;
    evidence: { label: string; leans: string; weight: number }[];
  } | null;
}

export function fetchAssessment(subjectId: string): Promise<Assessment | null> {
  return request<{ data: Assessment | null }>(`/v1/intel/assessment?subjectId=${encodeURIComponent(subjectId)}`).then((r) => r.data);
}

export interface Indication {
  projectId: string;
  name: string;
  ticker: string | null;
  type: string;
  severity: string;
  message: string;
  conviction: number | null;
}

export function fetchIndications(limit = 50): Promise<Indication[]> {
  return request<{ data: Indication[] }>(`/v1/intel/indications?limit=${limit}`).then((r) => r.data);
}

export interface Backtest {
  wonCount: number;
  scoredWon: number;
  universeCount: number;
  wonMedianConviction: number | null;
  universeMedianConviction: number | null;
  lift: number | null;
  topQuintileCapture: number | null;
  note: string;
}

export function fetchBacktest(): Promise<Backtest> {
  return request<{ data: Backtest }>(`/v1/intel/backtest`).then((r) => r.data);
}

const q = (subjectType: string, subjectId: string) =>
  `subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`;

export function fetchObservations(subjectType: string, subjectId: string): Promise<Observation[]> {
  return request<{ data: Observation[] }>(`/v1/intel/observations?${q(subjectType, subjectId)}`).then((r) => r.data);
}

export function fetchActions(
  subjectType: string,
  subjectId: string,
): Promise<{ available: ActionDef[]; state: ObjectState }> {
  return request<{ data: { available: ActionDef[]; state: ObjectState } }>(
    `/v1/intel/actions?${q(subjectType, subjectId)}`,
  ).then((r) => r.data);
}

export function executeAction(
  subjectType: string,
  subjectId: string,
  action: string,
  params?: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; state: ObjectState }> {
  return request<{ data: { result: Record<string, unknown>; state: ObjectState } }>(`/v1/intel/actions`, {
    method: 'POST',
    body: { subjectType, subjectId, action, params },
  }).then((r) => r.data);
}

export function recordObservation(input: {
  subjectType: string;
  subjectId: string;
  predicate: string;
  value: unknown;
  unit?: string;
  source?: string;
  sourceUrl?: string;
}): Promise<{ id: string }> {
  return request<{ data: { id: string } }>(`/v1/intel/observations`, { method: 'POST', body: input }).then((r) => r.data);
}

export function fetchWatchlist(subjectType?: string): Promise<WatchlistEntry[]> {
  const qs = subjectType ? `?subjectType=${encodeURIComponent(subjectType)}` : '';
  return request<{ data: WatchlistEntry[] }>(`/v1/intel/watchlist${qs}`).then((r) => r.data);
}
