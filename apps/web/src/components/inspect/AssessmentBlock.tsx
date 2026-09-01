import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/shared/LoadingSkeleton';
import { Crosshair } from 'lucide-react';
import { fetchAssessment, type Assessment } from '@/lib/api/intel';
import { formatMoney } from '@/lib/format';
import { Estimate } from '@/components/intel/Estimate';

/**
 * The alpha read on a single target (Wave 2). Leads with Conviction (the
 * attention-allocation call), then the four levers, the timing window, and the
 * ACH verdict with its most diagnostic evidence — all explainable, all sourced
 * from stored alpha observations.
 */

const VERDICT_LABEL: Record<string, string> = {
  list_soon: 'Will pursue a listing soon',
  list_later: 'A candidate, not imminent',
  no_list: 'Unlikely to list',
};
const WINDOW_STYLE: Record<string, string> = {
  hot: 'text-amber-600 dark:text-amber-400',
  warming: 'text-cyan-700 dark:text-cyan-400',
  quiet: 'text-grey',
};

function convColor(c: number): string {
  if (c >= 45) return 'bg-emerald-500';
  if (c >= 28) return 'bg-cyan-500';
  return 'bg-grey/50';
}

export function AssessmentBlock({ subjectId }: { subjectId: string }) {
  const [a, setA] = useState<Assessment | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    setA('loading');
    fetchAssessment(subjectId)
      .then((d) => !cancelled && setA(d))
      .catch(() => !cancelled && setA(null));
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  if (a === 'loading') {
    return <Skeleton className="mt-5 h-24 rounded-lg" />;
  }
  if (!a || !a.conviction) {
    return (
      <section className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
          <Crosshair size={12} /> Assessment
        </div>
        <p className="text-micro text-grey">Not yet assessed. Run the alpha job to score this target.</p>
      </section>
    );
  }

  const conv = a.conviction.score;
  return (
    <section className="mt-5 border-t border-line pt-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <Crosshair size={12} /> Assessment
      </div>

      {/* Conviction hero */}
      <div className="rounded-lg border border-line p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-micro font-bold uppercase tracking-wider text-grey">Conviction</span>
          <span className="num-tabular text-xl font-bold text-navy">{conv}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
          <span className={`block h-full ${convColor(conv)}`} style={{ width: `${conv}%` }} />
        </div>
        {a.conviction.drivers?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {a.conviction.drivers.map((d) => (
              <span key={d.label} className="rounded border border-line px-1.5 py-px font-mono text-[9px] text-grey">
                {d.label} <span className="text-navy">+{d.points}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Four levers */}
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        <Lever label="Propensity" value={a.propensity?.score ?? null} />
        <Lever label="Winnability" value={a.winnability?.score ?? null} />
        <Lever
          label="Timing"
          value={a.timing?.score ?? null}
          badge={a.timing?.window ? <span className={`font-mono text-[9px] uppercase ${WINDOW_STYLE[a.timing.window]}`}>{a.timing.window}</span> : null}
        />
        <div className="rounded-lg border border-line p-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-grey">Worth</div>
          <div className="num-tabular text-sm font-bold text-navy">{a.value?.usd ? formatMoney(a.value.usd) : '—'}</div>
        </div>
      </div>

      {/* ACH verdict */}
      {a.ach && (
        <div className="mt-2 rounded-lg border border-line p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-label font-semibold text-navy">{VERDICT_LABEL[a.ach.verdict] ?? a.ach.verdict}</span>
            <span className="num-tabular font-mono text-[10px] text-grey">{a.ach.confidence}% margin</span>
          </div>
          {a.propensity && (
            <div className="mt-1 text-micro text-grey">
              Listing likelihood:{' '}
              <Estimate
                p={a.propensity.score}
                confidence={a.propensity.confidence >= 65 ? 'high' : a.propensity.confidence >= 40 ? 'moderate' : 'low'}
                className="text-micro"
              />
            </div>
          )}
          {a.ach.evidence?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {a.ach.evidence.slice(0, 4).map((e) => (
                <li key={e.label} className="flex items-center gap-1.5 text-micro text-grey">
                  <span className={`h-1 w-1 shrink-0 rounded-full ${e.leans === 'list_soon' ? 'bg-emerald-500' : e.leans === 'no_list' ? 'bg-red-500' : 'bg-grey/50'}`} />
                  {e.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Lever({ label, value, badge }: { label: string; value: number | null; badge?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className="num-tabular text-sm font-bold text-navy">{value ?? '—'}</div>
      {badge}
    </div>
  );
}
