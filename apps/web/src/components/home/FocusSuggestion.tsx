import { Crosshair } from 'lucide-react';
import { useInspect } from '@/stores';
import { MOMENTUM_GLYPH, type DealHealth } from '@/lib/salesIntel';
import type { BoardDeal } from '@/lib/api/bd';

export interface FocusSuggestionProps {
  deals: BoardDeal[];
  health: Map<string, DealHealth>;
}

const OPEN_STAGES = new Set(['contacted', 'discovery', 'proposal', 'negotiating']);

function fmtValue(cents: number | null): string {
  if (cents == null) return 'unsized';
  const n = cents / 100;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * "Focus suggestion" — ONE deal: the highest-value open deal whose momentum
 * is cooling or cold. Money going quiet is the day's leverage point; the
 * reason is spelled out so the pick is auditable, not oracular.
 */
export function FocusSuggestion({ deals, health }: FocusSuggestionProps) {
  const inspect = useInspect();

  const pick = deals
    .filter(d => OPEN_STAGES.has(d.stage))
    .map(d => ({ d, h: health.get(d.id) }))
    .filter((x): x is { d: BoardDeal; h: DealHealth } => !!x.h && (x.h.momentum === 'cooling' || x.h.momentum === 'cold'))
    .sort((a, b) => (b.d.packageValue ?? 0) - (a.d.packageValue ?? 0))[0];

  if (!pick) {
    return (
      <p className="text-label text-grey">
        No cooling deals to rescue — momentum is steady or better across the open pipeline. Work the queue instead.
      </p>
    );
  }

  const { d, h } = pick;
  const glyph = MOMENTUM_GLYPH[h.momentum];
  const topWarning = h.warnings[0];

  return (
    <button
      type="button"
      onClick={() => inspect('deal', d.id)}
      className="w-full rounded-lg border border-cyan-300/60 bg-cyan-50/40 p-3 text-left transition-colors hover:bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/30"
    >
      <div className="flex items-center gap-2">
        <Crosshair size={14} className="text-cyan-600 dark:text-cyan-400" />
        <span className="text-sm font-bold text-navy">{d.projectName}</span>
        {d.projectTicker && <span className="font-mono text-micro text-grey">{d.projectTicker}</span>}
        <span className={`ml-auto font-mono text-micro font-bold ${glyph.cls}`}>
          {glyph.glyph} {h.momentum}
        </span>
      </div>
      <p className="mt-1.5 text-label leading-relaxed text-navy">
        Worth <span className="font-mono font-bold">{fmtValue(d.packageValue)}</span> in{' '}
        {d.stage.replace(/_/g, ' ')}, but {h.momentumDetail}
        {topWarning ? ` — and it's flagged “${topWarning.label.toLowerCase()}” (${topWarning.detail})` : ''}. Highest
        value at risk of going quiet today.
      </p>
      {topWarning && <p className="mt-1 text-micro text-grey">Suggested move: {topWarning.mitigation}</p>}
    </button>
  );
}
