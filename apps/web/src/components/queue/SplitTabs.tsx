import { clsx } from 'clsx';
import { SPLIT_ORDER, SPLIT_LABELS, SPLIT_HINTS, type SplitId } from './logic';

interface SplitTabsProps {
  active: SplitId;
  /** null = still counting. */
  counts: Record<SplitId, number | null>;
  onSelect: (split: SplitId) => void;
}

/**
 * Superhuman-style split tabs over the queue. Digit keys 1–4 (handled by the
 * page-level triage grammar) mirror the click targets here.
 */
export function SplitTabs({ active, counts, onSelect }: SplitTabsProps) {
  return (
    <div
      className="shrink-0 flex items-end gap-0.5 px-4 pt-1 border-b border-line bg-card overflow-x-auto"
      role="tablist"
      aria-label="Queue splits"
    >
      {SPLIT_ORDER.map((split, i) => {
        const isActive = split === active;
        const count = counts[split];
        return (
          <button
            key={split}
            role="tab"
            aria-selected={isActive}
            title={`${SPLIT_HINTS[split]} — press ${i + 1}`}
            onClick={() => onSelect(split)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors',
              isActive
                ? 'border-cyan-500 text-navy'
                : 'border-transparent text-grey hover:text-navy hover:border-line',
            )}
          >
            <kbd
              className={clsx(
                'rounded border px-1 font-mono text-micro leading-4',
                isActive ? 'border-cyan-500/40 text-cyan-600 dark:text-cyan-400' : 'border-line text-grey',
              )}
            >
              {i + 1}
            </kbd>
            {SPLIT_LABELS[split]}
            <span
              className={clsx(
                'rounded-full px-1.5 text-micro font-mono font-bold',
                isActive
                  ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                  : 'bg-ice-soft dark:bg-navy-deep text-grey',
              )}
            >
              {count === null ? '…' : count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
