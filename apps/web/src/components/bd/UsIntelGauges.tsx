import { Radar } from 'lucide-react';
import type { UsIntelSignals } from '@/types/bd';

/**
 * usIntelSignals gauge cluster — five compact horizontal mini-bars for the
 * server-computed US market intelligence signals (MTL difficulty, product
 * feasibility, competitive position, Howey heuristic, red-flag count).
 * Renders only the signals present in the payload and degrades to a
 * "pending re-score" hint when the cluster is absent.
 */
export function UsIntelGauges({
  signals,
  compact = false,
  id,
}: {
  signals?: UsIntelSignals | null;
  compact?: boolean;
  id?: string;
}) {
  const rows: { key: string; label: string; score: number; detail?: string | null; title: string }[] = [];

  if (signals?.stateMtlDifficulty) {
    rows.push({
      key: 'mtl',
      label: 'State MTL',
      score: signals.stateMtlDifficulty.score,
      detail: signals.stateMtlDifficulty.tier ?? null,
      title:
        'State money-transmitter licensing path derived from jurisdiction. Higher = lower friction (Tier 4 states score ~70; Tier 1 NY/CA maximum-friction states score ~10).',
    });
  }
  if (signals?.productFeasibility) {
    rows.push({
      key: 'product',
      label: 'Product fit',
      score: signals.productFeasibility.score,
      detail: signals.productFeasibility.product ?? null,
      title:
        'How well the project maps onto a feasible LCX US product shape (exchange listing, EMT, etc.). Higher = stronger fit.',
    });
  }
  if (signals?.competitivePosition) {
    rows.push({
      key: 'competitive',
      label: 'Competitive',
      score: signals.competitivePosition.score,
      title:
        'Competitive position versus US-accessible venues already carrying the asset. Higher = clearer whitespace for LCX.',
    });
  }
  if (signals?.howeyHeuristic) {
    rows.push({
      key: 'howey',
      label: 'Howey',
      score: signals.howeyHeuristic.score,
      title:
        'Howey-test heuristic from project features (LCX/ESMA vetting, jurisdiction, category, security-token indicators). Higher = lower securities-classification risk.',
    });
  }

  const redFlagCount = signals?.redFlagCount;
  const empty = rows.length === 0 && redFlagCount == null;

  return (
    <div id={id} className="rounded-lg border border-line overflow-hidden">
      <div className={`flex items-center gap-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
        <Radar size={12} className="text-cyan-500 shrink-0" />
        <span className="text-micro font-bold uppercase tracking-wider text-navy">US Intel Signals</span>
        <span className="text-[9px] text-grey">market-entry readout</span>
      </div>
      <div className={compact ? 'p-2 space-y-1.5' : 'p-3 space-y-2'}>
        {empty ? (
          <p className="text-micro text-grey italic">US intel signals pending re-score.</p>
        ) : (
          <>
            {rows.map(r => (
              <GaugeRow key={r.key} label={r.label} score={r.score} detail={r.detail} title={r.title} compact={compact} />
            ))}
            {redFlagCount != null && (
              <div
                className="flex items-center gap-2"
                title="Risk-pattern scanner hits (missing entity docs, security-token indicators, …). Fewer is better; any flag locks the outreach gate."
              >
                <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-grey">Red flags</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                    redFlagCount === 0
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                  }`}
                >
                  {redFlagCount === 0 ? 'none' : `${redFlagCount} flag${redFlagCount === 1 ? '' : 's'}`}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GaugeRow({
  label,
  score,
  detail,
  title,
  compact,
}: {
  label: string;
  score: number;
  detail?: string | null;
  title: string;
  compact: boolean;
}) {
  const pct = Math.max(0, Math.min(100, score));
  const fill = pct >= 60 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="w-20 shrink-0 text-[9px] font-bold uppercase tracking-wider text-grey">{label}</span>
      <div
        className="flex-1 h-1.5 rounded-full bg-ice-soft dark:bg-ice-soft/10 overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${label}: ${score} of 100`}
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right font-mono text-micro font-bold text-navy">{score}</span>
      {!compact && detail && (
        <span className="max-w-[9rem] truncate text-[9px] text-grey" title={detail}>{detail}</span>
      )}
    </div>
  );
}
