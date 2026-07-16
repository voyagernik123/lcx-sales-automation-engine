import { clsx } from 'clsx';
import { MOMENTUM_GLYPH, type PipelinePulse, type WarningCode } from '@/lib/salesIntel';
import { WARNING_SHORT_LABEL } from './warningDisplay';
import { ScenarioValue } from './ScenarioControls';

/**
 * Board header instrument: open count/value, clickable warning-count chips
 * (click filters the board to deals carrying that warning), and momentum
 * buckets ▲N ▬N ▼N ✕N. Every number here is derived from computePipelinePulse
 * over the same health set the cards use — one derivation layer, one truth.
 */

export interface PipelinePulseHeaderProps {
  pulse: PipelinePulse;
  activeWarning: WarningCode | null;
  onToggleWarning: (code: WarningCode) => void;
  className?: string;
}

const WARNING_ORDER: WarningCode[] = [
  'ghosted',
  'stalled',
  'overdue_close',
  'single_threaded',
  'no_next_step',
  'telegram_silent',
];

export function PipelinePulseHeader({ pulse, activeWarning, onToggleWarning, className }: PipelinePulseHeaderProps) {
  const steady = Math.max(0, pulse.openCount - pulse.accelerating - pulse.cooling - pulse.cold);
  const momentum: { key: keyof typeof MOMENTUM_GLYPH; count: number; title: string }[] = [
    { key: 'accelerating', count: pulse.accelerating, title: 'Accelerating — more activity last 7d than prior 7d' },
    { key: 'steady', count: steady, title: 'Steady — activity flat week over week' },
    { key: 'cooling', count: pulse.cooling, title: 'Cooling — less activity last 7d than prior 7d' },
    { key: 'cold', count: pulse.cold, title: 'Cold — no meaningful activity in 14d' },
  ];

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line/70 bg-card px-4 py-2.5 shadow-card',
        className,
      )}
      aria-label="Pipeline pulse"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="num-tabular font-mono text-sm font-bold text-navy">{pulse.openCount}</span>
        <span className="text-micro uppercase tracking-wide text-grey">open</span>
        <ScenarioValue cents={pulse.openValue} className="num-tabular ml-1 font-mono text-sm font-bold text-navy" />
        <span className="text-micro uppercase tracking-wide text-grey">pipeline</span>
      </div>

      <span className="hidden h-4 w-px bg-line sm:block" aria-hidden="true" />

      <div className="flex items-center gap-1.5" role="group" aria-label="Warning filters">
        {WARNING_ORDER.filter(code => pulse.warningCounts[code] > 0).map(code => {
          const active = activeWarning === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onToggleWarning(code)}
              aria-pressed={active}
              title={
                active
                  ? 'Clear this warning filter'
                  : `Filter the board to deals warned: ${WARNING_SHORT_LABEL[code]}`
              }
              className={clsx(
                'num-tabular rounded-full border px-2 py-0.5 text-micro font-bold transition-colors',
                active
                  ? 'border-status-conditional bg-status-conditional-bg text-status-conditional'
                  : 'border-line bg-transparent text-grey hover:border-status-conditional/60 hover:text-navy',
              )}
            >
              {WARNING_SHORT_LABEL[code]} {pulse.warningCounts[code]}
            </button>
          );
        })}
        {WARNING_ORDER.every(code => pulse.warningCounts[code] === 0) && (
          <span className="text-micro text-grey">No warnings across open deals</span>
        )}
      </div>

      <span className="hidden h-4 w-px bg-line sm:block" aria-hidden="true" />

      <div className="num-tabular flex items-center gap-2 font-mono text-label" aria-label="Momentum buckets">
        {momentum.map(m => (
          <span key={m.key} title={m.title} className={clsx('inline-flex items-center gap-0.5', MOMENTUM_GLYPH[m.key].cls)}>
            {MOMENTUM_GLYPH[m.key].glyph}
            {m.count}
          </span>
        ))}
      </div>
    </div>
  );
}
