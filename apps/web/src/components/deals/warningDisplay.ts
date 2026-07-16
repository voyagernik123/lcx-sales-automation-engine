import type { WarningCode } from '@/lib/salesIntel';

/** Short chip labels per warning code (full labels live on the warning itself). */
export const WARNING_SHORT_LABEL: Record<WarningCode, string> = {
  ghosted: 'Ghosted',
  stalled: 'Stalled',
  overdue_close: 'Overdue close',
  no_next_step: 'No next step',
  telegram_silent: 'TG silent',
  single_threaded: 'Single-thread',
};

/** Severity chip classes: 1 advisory · 2 attention · 3 critical. */
export function severityChipCls(severity: 1 | 2 | 3): string {
  if (severity >= 3) return 'bg-status-blocked-bg text-status-blocked';
  if (severity === 2) return 'bg-status-conditional-bg text-status-conditional';
  return 'bg-ice-soft text-grey dark:bg-ice-soft/10';
}
