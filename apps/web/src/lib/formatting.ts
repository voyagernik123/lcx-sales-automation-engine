import { Status, Tier, ReadinessStatus } from '@/types/ontology';

export function parseMonetaryValue(cost: string | undefined): number {
  if (!cost) return 0;
  const cleaned = cost.replace(/[^0-9.Kk]/g, '');
  if (/[Kk]/.test(cleaned)) {
    const num = parseFloat(cleaned.replace(/[Kk]/, ''));
    return isNaN(num) ? 0 : Math.round(num * 1000);
  }
  if (/[Mm]/.test(cleaned)) {
    const num = parseFloat(cleaned.replace(/[Mm]/, ''));
    return isNaN(num) ? 0 : Math.round(num * 1_000_000);
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function formatUSD(amount: number): string {
  if (amount === 0) return '$0';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000).toLocaleString()}K`;
  return `$${Math.round(amount).toLocaleString()}`;
}

export function parseTimelineMonths(timeline: string | undefined): number {
  if (!timeline) return 0;
  const match = timeline.match(/(\d+)\s*-\s*(\d+)/);
  if (match) return parseInt(match[2], 10);
  const single = parseInt(timeline, 10);
  return isNaN(single) ? 0 : single;
}

export function toBadgeStatus(status: Status | ReadinessStatus): BadgeStatusKey {
  switch (status) {
    case 'Ready':
    case 'Complete':
      return 'ready';
    case 'Conditional':
    case 'Counsel Review':
      return 'conditional';
    case 'Blocked':
      return 'blocked';
    case 'Deferred':
    case 'Not Started':
      return 'deferred';
    case 'Needs verification':
    case 'In Progress':
    default:
      return 'unverified';
  }
}

export type BadgeStatusKey = 'ready' | 'conditional' | 'blocked' | 'deferred' | 'unverified';

export function tierAbbreviated(tier: Tier): string {
  return tier.replace(/^Tier \d - /, '');
}

export function truncateDomain(domain: string, maxLen: number = 18): string {
  return domain.length > maxLen ? domain.slice(0, maxLen - 2) + '…' : domain;
}
