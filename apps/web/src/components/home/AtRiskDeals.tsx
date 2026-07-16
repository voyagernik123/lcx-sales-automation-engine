import { useInspect } from '@/stores';
import { EmptyState } from '@/components/shared';
import { MOMENTUM_GLYPH, type DealHealth } from '@/lib/salesIntel';
import type { BoardDeal } from '@/lib/api/bd';

export interface AtRiskDealsProps {
  deals: BoardDeal[];
  health: Map<string, DealHealth>;
  max?: number;
}

function fmtValue(cents: number | null): string {
  if (cents == null) return '—';
  const n = cents / 100;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * "At risk" — the open deals carrying the most health warnings (slipped /
 * stale / ghosted), top N, each opening the deal inspector with the full
 * why-trail. Warning evidence is spelled out inline, never just a count.
 */
export function AtRiskDeals({ deals, health, max = 3 }: AtRiskDealsProps) {
  const inspect = useInspect();

  const atRisk = deals
    .map(d => ({ d, h: health.get(d.id) }))
    .filter((x): x is { d: BoardDeal; h: DealHealth } => !!x.h && x.h.warnings.length > 0)
    .sort(
      (a, b) =>
        b.h.warnings.length - a.h.warnings.length ||
        Math.max(...b.h.warnings.map(w => w.severity), 0) - Math.max(...a.h.warnings.map(w => w.severity), 0),
    )
    .slice(0, max);

  if (atRisk.length === 0) {
    return (
      <EmptyState
        variant="done"
        title="No deals flashing warnings"
        description="Every open deal is inside its stage medians and reply windows."
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {atRisk.map(({ d, h }) => {
        const glyph = MOMENTUM_GLYPH[h.momentum];
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => inspect('deal', d.id)}
            className="w-full rounded border border-line p-2 text-left transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-label font-bold text-navy">{d.projectName}</span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-micro text-grey">
                <span className={glyph.cls} title={h.momentumDetail}>{glyph.glyph}</span>
                {fmtValue(d.packageValue)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {h.warnings.map(w => (
                <span
                  key={w.code}
                  title={`${w.detail} — ${w.mitigation}`}
                  className={`rounded px-1.5 py-0.5 text-micro font-bold ${
                    w.severity >= 3
                      ? 'bg-status-blocked-bg text-status-blocked'
                      : 'bg-status-conditional-bg text-status-conditional'
                  }`}
                >
                  {w.label}
                </span>
              ))}
              <span className="text-micro text-grey">{h.warnings[0]?.detail}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
