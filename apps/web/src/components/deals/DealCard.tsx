import type { BoardDeal } from '@/lib/api/bd';
import { fmtMoneyCents, ownerInitials, packageAccentClass, packageLabel, relativeTime } from './dealFormat';

export interface DealCardProps {
  deal: BoardDeal;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}

/** Chip color for days-in-stage: neutral ≤7d, amber >7d, red >21d. Closed deals stay neutral. */
function daysChipClass(days: number, closed: boolean): string {
  if (!closed && days > 21) return 'bg-red-500/10 text-red-600 dark:text-red-400';
  if (!closed && days > 7) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  return 'bg-ice-soft dark:bg-ice-soft/10 text-grey';
}

/** Kanban card: name, ticker, value, owner, staleness, priority, last activity. */
export function DealCard({ deal, onDragStart, onDragEnd, onClick }: DealCardProps) {
  const closed = deal.stage === 'won' || deal.stage === 'lost';
  const initials = ownerInitials(deal.owner);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`cursor-grab rounded-lg border border-line border-l-[3px] ${packageAccentClass(deal.packageType)} bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 active:cursor-grabbing`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] font-semibold leading-tight text-navy">
          {deal.projectName}
        </span>
        {deal.projectTicker && (
          <span className="shrink-0 rounded bg-ice-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-navy dark:bg-ice-soft/10">
            {deal.projectTicker}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-navy">{fmtMoneyCents(deal.packageValue)}</span>
        <span className="truncate text-[10px] text-grey">{packageLabel(deal.packageType)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/60 pt-1.5">
        <div className="flex items-center gap-1.5">
          {initials && (
            <span
              title={deal.owner ?? undefined}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ice-soft text-[8px] font-bold text-navy dark:bg-ice-soft/10"
            >
              {initials}
            </span>
          )}
          <span
            title="Days in current stage"
            className={`rounded px-1 py-0.5 text-[9px] font-semibold ${daysChipClass(deal.daysSinceUpdate, closed)}`}
          >
            {deal.daysSinceUpdate}d
          </span>
          <span
            title={`Priority score ${deal.priorityScore}`}
            className="rounded bg-ice-soft px-1 py-0.5 font-mono text-[9px] font-bold text-navy dark:bg-ice-soft/10"
          >
            P{deal.priorityScore}
          </span>
        </div>
        <span className="shrink-0 text-[9px] text-grey">{relativeTime(deal.updatedAt)}</span>
      </div>
    </div>
  );
}
