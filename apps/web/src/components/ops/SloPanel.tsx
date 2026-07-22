import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { fetchSlos, fmtSlo, type SloReport, type Slo } from '@/lib/api/slo';
import { clsx } from 'clsx';

/**
 * SLO panel (Phase 4.3) — the desk's service-level objectives with their 30-day
 * error budgets. Each row shows target vs current and how much budget is burned;
 * a breached budget is the management-by-exception signal.
 */
const STATUS_TONE: Record<Slo['status'], string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  breach: 'text-red-600 dark:text-red-400',
  no_data: 'text-grey',
};
const STATUS_DOT: Record<Slo['status'], string> = {
  ok: 'bg-emerald-500', warn: 'bg-amber-500', breach: 'bg-red-500', no_data: 'bg-grey/40',
};

export function SloPanel() {
  const [rep, setRep] = useState<SloReport | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetchSlos().then(setRep).catch(() => setErr(true)); }, []);

  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <Gauge size={12} /> SLOs & error budgets
        {rep?.anyBreach && <span className="ml-auto rounded bg-red-500/10 px-1.5 py-0.5 text-micro font-bold text-red-600 dark:text-red-400">budget breached</span>}
      </div>
      {err ? (
        <p className="py-2 text-label text-grey">SLOs unavailable.</p>
      ) : !rep ? (
        <p className="py-2 text-label text-grey">Loading…</p>
      ) : (
        <div className="space-y-2">
          {rep.slos.map((s) => <SloRow key={s.key} s={s} />)}
        </div>
      )}
    </div>
  );
}

function SloRow({ s }: { s: Slo }) {
  const burn = s.budgetBurnPct;
  return (
    <div className="rounded border border-line/70 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className={clsx('h-1.5 w-1.5 rounded-full', STATUS_DOT[s.status])} />
        <span className="text-label font-semibold text-navy">{s.label}</span>
        <span className="ml-auto text-label font-bold tabular-nums">
          <span className={STATUS_TONE[s.status]}>{fmtSlo(s.current, s.unit)}</span>
          <span className="text-grey"> / {fmtSlo(s.target, s.unit)}{s.higherIsBetter ? ' min' : ' max'}</span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-micro text-grey">
        <span>{s.detail}</span>
        <span className="font-mono">{s.window}</span>
      </div>
      {burn != null && (
        <div className="mt-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
            <div
              className={clsx('h-full rounded-full', s.status === 'breach' ? 'bg-red-500' : s.status === 'warn' ? 'bg-amber-500' : 'bg-emerald-500')}
              style={{ width: `${Math.min(burn, 100)}%` }}
            />
          </div>
          <div className="mt-0.5 text-micro text-grey">{burn}% of error budget {burn >= 100 ? 'exhausted' : 'used'}</div>
        </div>
      )}
    </div>
  );
}
