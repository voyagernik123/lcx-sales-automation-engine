import { useCallback, useRef } from 'react';
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
 *
 * THE TABLIST IS ONE TAB STOP, not four.
 *
 * Measured on the real surface before this change: reaching the first row of the
 * ranked queue from `<main>` cost 17 Tab presses, and four of them were spent
 * walking these tabs — a control the operator already has four single-digit
 * shortcuts for. It is also a conformance defect and not only a cost one: the
 * ARIA authoring practice for `role="tablist"` is a roving tabindex with the
 * arrows moving between tabs, because someone who Tabs into a tablist expects the
 * NEXT Tab to leave it for the panel. With every tab tabbable, Tab walks the set
 * and the data is four stops further away than it reads.
 *
 * Activation follows focus (the APG's preferred model when switching is cheap,
 * which it is here — every split's rows are already in memory, so an arrow press
 * costs no fetch). That also keeps the arrows and the digits meaning the same
 * thing, which is what each tab's `title` promises.
 *
 * `stopPropagation` on the arrows, deliberately. BdPipeline's window-level
 * listener binds ArrowDown/ArrowUp to the row cursor, and this component sits
 * above that table in the same page; Left/Right are not in that set today, so
 * this is defence against the next person adding them rather than a live fix.
 * `preventDefault` alone would not have stopped it — that exact distinction has
 * already cost this surface one double-fire bug (see BdPipeline's claimRowKeys).
 */
export function SplitTabs({ active, counts, onSelect }: SplitTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const from = SPLIT_ORDER.indexOf(active);
      let to: number;
      switch (e.key) {
        case 'ArrowRight': to = Math.min(SPLIT_ORDER.length - 1, from + 1); break;
        case 'ArrowLeft': to = Math.max(0, from - 1); break;
        case 'Home': to = 0; break;
        case 'End': to = SPLIT_ORDER.length - 1; break;
        default: return;
      }
      e.preventDefault();
      e.stopPropagation();
      // Clamped, not wrapping — the same choice the row cursor makes, so the two
      // keyboard models on this surface do not disagree with each other.
      if (to === from) return;
      onSelect(SPLIT_ORDER[to]);
      refs.current[to]?.focus();
    },
    [active, onSelect],
  );

  return (
    <div
      className="shrink-0 flex items-end gap-0.5 px-4 pt-1 border-b border-line bg-card overflow-x-auto"
      role="tablist"
      aria-label="Queue splits"
      onKeyDown={onKeyDown}
    >
      {SPLIT_ORDER.map((split, i) => {
        const isActive = split === active;
        const count = counts[split];
        return (
          <button
            key={split}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={`${SPLIT_HINTS[split]} — press ${i + 1}`}
            onClick={() => onSelect(split)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap transition-colors',
              isActive
                ? 'border-cyan-500 text-navy font-semibold'
                : 'border-transparent text-grey font-medium hover:text-navy hover:border-line',
            )}
          >
            <kbd
              className={clsx(
                'rounded border px-1.5 font-mono text-micro leading-4',
                isActive
                  ? 'border-cyan-500/40 bg-cyan-500/5 text-cyan-700 dark:text-cyan-400'
                  : 'border-line bg-ice-soft dark:bg-navy-deep text-grey',
              )}
            >
              {i + 1}
            </kbd>
            {SPLIT_LABELS[split]}
            <span
              className={clsx(
                'rounded-full px-1.5 text-micro font-mono font-semibold num-tabular',
                isActive
                  ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
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
