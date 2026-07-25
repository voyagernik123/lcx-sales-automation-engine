import { AlertTriangle } from 'lucide-react';
import type { BoardDeal } from '@/lib/api/bd';
import type { DealEvent } from '@/types/bd';
import { MOMENTUM_GLYPH, type DealHealth, type PlaybookChip } from '@/lib/salesIntel';
import { ownerInitials, packageAccentClass, packageLabel, relativeTime } from './dealFormat';
import { ActivityStrip } from './ActivityStrip';
import { PlaybookChips } from './PlaybookChips';
import { ScenarioValue } from './ScenarioControls';
import { severityChipCls } from './warningDisplay';

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

/** Text tone for days-in-stage: neutral ≤7d, amber >7d, red >21d. Closed deals stay neutral. */
function daysToneClass(days: number, closed: boolean): string {
  if (!closed && days > 21) return 'text-status-blocked';
  if (!closed && days > 7) return 'text-status-conditional';
  return 'text-grey';
}

/** Likelihood-band dot color — the chip itself stays neutral. */
const BAND_DOT: Record<DealHealth['likelihood']['band'], string> = {
  high: 'bg-status-ready',
  fair: 'bg-status-conditional',
  low: 'bg-status-blocked',
};

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
  const warnings = health?.warnings ?? [];
  const maxSeverity = warnings.reduce<1 | 2 | 3>((m, w) => (w.severity > m ? w.severity : m), 1);

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
      className={`lift cursor-grab rounded-lg border border-line/70 border-l-[3px] ${packageAccentClass(deal.packageType)} bg-card p-3 shadow-card hover:border-grey-light focus-ring active:cursor-grabbing dark:hover:border-grey`}
    >
      {/* Identity: name leads, ticker recedes to a quiet outline tag. */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-label font-semibold leading-tight text-navy">
          {deal.projectName}
        </span>
        {deal.projectTicker && (
          <span className="shrink-0 rounded border border-line/70 px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-grey">
            {deal.projectTicker}
          </span>
        )}
      </div>

      {/* Value is the hero figure of the card. */}
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <ScenarioValue cents={deal.packageValue} className="num-tabular text-sm font-semibold tracking-tight text-navy" />
        <span className="truncate text-micro text-grey">{packageLabel(deal.packageType)}</span>
      </div>

      {/* Health row: one restrained line — neutral likelihood chip with a band
          dot, momentum glyph, warnings collapsed to a single severity-toned
          count chip. Every judgment is a click-to-why; detail lives in the
          inspector. */}
      {health && !closed && (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={why}
            title={`Likelihood: ${ordinal(health.likelihood.percentile)} percentile of the open pipeline (${health.likelihood.band}). Click for the signal trail.`}
            className="num-tabular derived inline-flex items-center gap-1 rounded-full border border-line/70 px-1.5 py-0.5 text-[9px] font-semibold text-navy transition-colors hover:border-grey-light hover:bg-ice-soft/50 dark:hover:border-grey dark:hover:bg-ice-soft/10"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${BAND_DOT[health.likelihood.band]}`} aria-hidden="true" />
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
          {warnings.length > 0 && (
            <button
              type="button"
              onClick={why}
              title={`${warnings.map(w => `${w.label} — ${w.detail}`).join('\n')}\nClick for mitigations.`}
              aria-label={`${warnings.length} warning${warnings.length === 1 ? '' : 's'} — click for details`}
              className={`num-tabular ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${severityChipCls(maxSeverity)} hover:opacity-80`}
            >
              {warnings.length}
              <AlertTriangle size={9} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Two-tone 21-day activity strip (navy = our touches, green = stage moves). */}
      {events && events.length > 0 && <ActivityStrip events={events} className="mt-2 block" />}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line/50 pt-2">
        <div className="flex items-center gap-2">
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
            className={`num-tabular text-[9px] font-semibold ${daysToneClass(deal.daysSinceUpdate, closed)}`}
          >
            {deal.daysSinceUpdate}d
          </span>
          <span
            title={`Priority score ${deal.priorityScore}`}
            className="num-tabular font-mono text-[9px] font-semibold text-grey"
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
