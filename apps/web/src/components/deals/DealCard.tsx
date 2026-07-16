import type { BoardDeal } from '@/lib/api/bd';
import type { DealEvent } from '@/types/bd';
import { LIKELIHOOD_BAND_CLS, MOMENTUM_GLYPH, type DealHealth, type PlaybookChip } from '@/lib/salesIntel';
import { ownerInitials, packageAccentClass, packageLabel, relativeTime } from './dealFormat';
import { ActivityStrip } from './ActivityStrip';
import { PlaybookChips } from './PlaybookChips';
import { ScenarioValue } from './ScenarioControls';
import { WARNING_SHORT_LABEL, severityChipCls } from './warningDisplay';

export interface DealCardProps {
  deal: BoardDeal;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  /** Derived health from computeDealHealthSet — card degrades gracefully without it. */
  health?: DealHealth;
  /** This deal's events, for the two-tone activity strip. */
  events?: DealEvent[];
  /** Click-to-why: opens the deal inspector with the full reason trail. */
  onWhy?: () => void;
  /** Toggle a playbook step (PATCH w/ localStorage fallback upstream). */
  onTogglePlaybook?: (key: PlaybookChip['key']) => void;
  /** True when playbook persistence fell back to localStorage. */
  playbookLocal?: boolean;
}

/** Chip color for days-in-stage: neutral ≤7d, amber >7d, red >21d. Closed deals stay neutral. */
function daysChipClass(days: number, closed: boolean): string {
  if (!closed && days > 21) return 'bg-red-500/10 text-red-600 dark:text-red-400';
  if (!closed && days > 7) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  return 'bg-ice-soft dark:bg-ice-soft/10 text-grey';
}

/** Suffix for percentile display: 62 → "62nd". */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Kanban card, health edition: every deal answers likelihood / momentum /
 * warnings / activity / playbook at a glance. Every judgment chip is a
 * click-to-why into the deal inspector.
 */
export function DealCard({
  deal,
  onDragStart,
  onDragEnd,
  onClick,
  health,
  events,
  onWhy,
  onTogglePlaybook,
  playbookLocal,
}: DealCardProps) {
  const closed = deal.stage === 'won' || deal.stage === 'lost';
  const initials = ownerInitials(deal.owner);
  const topWarnings = health?.warnings.slice(0, 2) ?? [];
  const moreWarnings = (health?.warnings.length ?? 0) - topWarnings.length;

  const why = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    (onWhy ?? onClick)();
  };

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
        <span className="min-w-0 truncate text-label font-semibold leading-tight text-navy">
          {deal.projectName}
        </span>
        {deal.projectTicker && (
          <span className="shrink-0 rounded bg-ice-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-navy dark:bg-ice-soft/10">
            {deal.projectTicker}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <ScenarioValue cents={deal.packageValue} className="text-label font-semibold text-navy" />
        <span className="truncate text-micro text-grey">{packageLabel(deal.packageType)}</span>
      </div>

      {/* Health row: likelihood percentile + momentum, each a click-to-why. */}
      {health && !closed && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={why}
            title={`Likelihood: ${ordinal(health.likelihood.percentile)} percentile of the open pipeline (${health.likelihood.band}). Click for the signal trail.`}
            className={`rounded px-1 py-0.5 font-mono text-[9px] font-bold ${LIKELIHOOD_BAND_CLS[health.likelihood.band]} hover:opacity-80`}
          >
            {ordinal(health.likelihood.percentile)}
          </button>
          <button
            type="button"
            onClick={why}
            title={`Momentum: ${health.momentum} — ${health.momentumDetail}. Click for the full why.`}
            className={`px-0.5 font-mono text-[10px] font-bold ${MOMENTUM_GLYPH[health.momentum].cls} hover:opacity-75`}
            aria-label={`Momentum ${health.momentum}: ${health.momentumDetail}`}
          >
            {MOMENTUM_GLYPH[health.momentum].glyph}
          </button>
          {topWarnings.map(w => (
            <button
              key={w.code}
              type="button"
              onClick={why}
              title={`${w.label}: ${w.detail} · ${w.mitigation}`}
              className={`rounded px-1 py-0.5 text-[9px] font-bold ${severityChipCls(w.severity)} hover:opacity-80`}
            >
              {WARNING_SHORT_LABEL[w.code]}
            </button>
          ))}
          {moreWarnings > 0 && (
            <button
              type="button"
              onClick={why}
              title={`${moreWarnings} more warning${moreWarnings === 1 ? '' : 's'} — click for all`}
              className="rounded px-1 py-0.5 text-[9px] font-bold text-grey hover:text-navy"
            >
              +{moreWarnings}
            </button>
          )}
        </div>
      )}

      {/* Two-tone 21-day activity strip (navy = our touches, green = stage moves). */}
      {events && events.length > 0 && <ActivityStrip events={events} className="mt-1.5 block" />}

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
            title={
              health
                ? `${Math.floor(health.daysInStage)}d in stage${health.stageMedianDays != null ? ` (median ${Math.round(health.stageMedianDays)}d)` : ''}`
                : 'Days in current stage'
            }
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
        {health && !closed ? (
          <PlaybookChips
            playbook={health.playbook}
            onToggle={onTogglePlaybook}
            local={playbookLocal}
            className="shrink-0"
          />
        ) : (
          <span className="shrink-0 text-[9px] text-grey">{relativeTime(deal.updatedAt)}</span>
        )}
      </div>
    </div>
  );
}
