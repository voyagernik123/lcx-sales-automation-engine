import { TrendingUp } from 'lucide-react';
import type { ReasonTrail } from '@lcx/shared';

/**
 * Propensity reason-trail — "why they'll pay", rendered as evidence rows.
 * Each reason carries a factor label, a points/max mini meter and the note
 * explaining the judgment. Degrades to a "trail pending re-score" hint when
 * the score row predates the propensity model — never blank.
 */
export function PropensityTrail({
  score,
  reasons,
  limit,
  compact = false,
  id,
}: {
  score?: number | null;
  reasons?: ReasonTrail[] | null;
  /** Show only the top-N contributors (sorted by points). */
  limit?: number;
  compact?: boolean;
  id?: string;
}) {
  const hasScore = score != null;
  const trail = reasons ?? [];
  const shown = limit != null
    ? [...trail].sort((a, b) => b.points - a.points).slice(0, limit)
    : trail;

  return (
    <div id={id} className="rounded-lg border border-line overflow-hidden">
      <div className={`flex items-center gap-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
        <TrendingUp size={12} className="text-cyan-500 shrink-0" />
        <span className="text-micro font-bold uppercase tracking-wider text-navy">Propensity</span>
        <span className="text-[9px] text-grey">why they&apos;ll pay</span>
        <span
          className="ml-auto rounded bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 px-1.5 py-0.5 font-mono text-micro font-bold text-cyan-700 dark:text-cyan-300"
          title="Propensity score 0–100: how likely this project is to pay for a listing, from market cap band, funding, chain/category fit and exchange footprint."
        >
          {hasScore ? score : '—'}
        </span>
      </div>
      <div className={compact ? 'p-2 space-y-1.5' : 'p-3 space-y-2'}>
        {shown.length === 0 ? (
          <p className="text-micro text-grey italic">
            {hasScore
              ? 'Reason trail pending re-score — force a re-score to see why.'
              : 'Not scored for propensity yet — trail pending re-score.'}
          </p>
        ) : (
          shown.map((r, i) => <ReasonRow key={`${r.code}-${i}`} reason={r} compact={compact} />)
        )}
        {limit != null && trail.length > shown.length && (
          <p className="text-[9px] text-grey">+ {trail.length - shown.length} more factor(s) on the full dossier</p>
        )}
      </div>
    </div>
  );
}

function ReasonRow({ reason, compact }: { reason: ReasonTrail; compact: boolean }) {
  const capped = reason.max <= 0;
  const ratio = capped ? 0 : Math.max(0, Math.min(1, reason.points / reason.max));
  const negative = reason.points < 0;
  const fill = negative
    ? 'bg-red-500'
    : ratio >= 0.7
      ? 'bg-emerald-500'
      : ratio >= 0.4
        ? 'bg-amber-500'
        : 'bg-slate-400';

  return (
    <div className="rounded border border-line/70 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-micro font-bold uppercase tracking-wider text-navy truncate">{reason.factor}</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {capped ? (
            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[8px] font-bold uppercase text-grey">cap</span>
          ) : (
            <div
              className={`${compact ? 'w-10' : 'w-14'} h-1.5 rounded-full bg-ice-soft dark:bg-ice-soft/10 overflow-hidden`}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={reason.max}
              aria-valuenow={reason.points}
              aria-label={`${reason.factor}: ${reason.points} of ${reason.max}`}
            >
              <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
          )}
          <span className="font-mono text-micro font-bold text-navy">
            {reason.points}{reason.max > 0 ? `/${reason.max}` : ''}
          </span>
        </div>
      </div>
      {reason.note && <p className="mt-0.5 text-[9px] text-grey leading-snug">{reason.note}</p>}
    </div>
  );
}
