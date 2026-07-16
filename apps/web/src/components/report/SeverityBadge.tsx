import { clsx } from 'clsx';

export type Severity = 'low' | 'medium' | 'high';

/** Red / amber / grey severity chip for the anomalies list. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={clsx(
        'inline-block shrink-0 rounded-md px-1.5 py-0.5 text-micro font-semibold capitalize',
        severity === 'high' && 'bg-red-500/10 text-red-600 dark:text-red-400',
        severity === 'medium' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        severity === 'low' && 'bg-grey/10 text-grey',
      )}
    >
      {severity}
    </span>
  );
}
