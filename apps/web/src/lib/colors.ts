import { Status, Phase } from '@/types/ontology';

export const STATUS_DOT_BG: Record<string, string> = {
  Ready: 'bg-status-ready',
  Conditional: 'bg-status-conditional',
  Blocked: 'bg-status-blocked',
  Deferred: 'bg-status-deferred',
  'Needs verification': 'bg-status-unverified',
};

export const STATUS_TILE_BG: Record<string, string> = {
  Ready: 'bg-green-50 border-green-300 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400',
  Conditional: 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400',
  Blocked: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400',
  Deferred: 'bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800/30 dark:border-slate-700 dark:text-slate-400',
  'Needs verification': 'bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-400',
};

export const STATUS_FILL_COLOR: Record<Status, string> = {
  Ready: '#1e7a4a',
  Conditional: '#9a6b00',
  Blocked: '#a32035',
  Deferred: 'rgba(90, 98, 114, 0.5)',
  'Needs verification': '#5a6272',
};

export const MAP_FILL: Record<string, string> = {
  ready: '#1e7a4a',
  blocked: '#a32035',
  conditional: '#9a6b00',
  default: '#5a6272',
  unresearched: 'rgba(90, 98, 114, 0.25)',
  filtered: 'rgba(90, 98, 114, 0.08)',
};

export const PHASE_COLORS: Record<Phase, string> = {
  'Pre-launch': '#4f46e5',
  'Phase 1': '#1e7a4a',
  'Phase 2': '#4f46e5',
  'Phase 3': '#a32035',
  'Post-CLARITY': '#9a6b00',
};

export function getDomainColor(domainName: string): string {
  if (domainName.includes('Entity')) return '#4f46e5';
  if (domainName.includes('Federal')) return '#1e7a4a';
  if (domainName.includes('State')) return '#4f46e5';
  if (domainName.includes('Custody')) return '#1e7a4a';
  if (domainName.includes('Payments')) return '#4f46e5';
  if (domainName.includes('Asset')) return '#9a6b00';
  if (domainName.includes('Surveillance')) return '#a32035';
  if (domainName.includes('Product')) return '#1e7a4a';
  return '#5a6272';
}

export function howeyScoreColor(score: number): string {
  if (score >= 70) return 'text-red-700 dark:text-red-400';
  if (score >= 40) return 'text-amber-700 dark:text-amber-400';
  return 'text-green-700 dark:text-green-400';
}

export function howeyScoreBg(score: number): string {
  if (score >= 70) return 'bg-status-blocked-bg';
  if (score >= 40) return 'bg-status-conditional-bg';
  return 'bg-status-ready-bg';
}

export function howeyScoreLabel(score: number): string {
  if (score >= 75) return 'Critical Risk';
  if (score >= 45) return 'Medium Risk';
  return 'Low Risk';
}
