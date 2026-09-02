import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, RefreshCw, Star, Briefcase, AlertTriangle, Activity, Sparkles } from 'lucide-react';
import {
  fetchTargets, fetchIndications, fetchBacktest, executeAction,
  type TargetRow, type Indication, type Backtest,
} from '@/lib/api/intel';
import { EmptyState, TableSkeleton, toast } from '@/components/shared';
import { Button, PageTitle } from '@/components/ui';
import { EntityChip } from '@/components/entity';
import { DraftPanel } from '@/components/intel/DraftPanel';
import { formatMoney } from '@/lib/format';

/**
 * Targets — the payoff of the intelligence stack. A conviction-ranked list of
 * projects to chase now: what it's worth, the timing window, why (ACH + drivers)
 * and the warm path — excluding anything already listed or in active play.
 */

const WINDOW_STYLE: Record<string, string> = {
  hot: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
  warming: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/40',
  quiet: 'bg-ice-soft text-grey border-line dark:bg-ice-soft/10',
};
const VERDICT_LABEL: Record<string, string> = {
  list_soon: 'List soon', list_later: 'Candidate', no_list: 'Unlikely',
};

function convColor(c: number): string {
  if (c >= 45) return 'bg-emerald-500';
  if (c >= 28) return 'bg-cyan-500';
  return 'bg-grey/50';
}

export function Targets() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TargetRow[] | null>(null);
  const [indications, setIndications] = useState<Indication[]>([]);
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    const mine = ++seq.current;
    setRows(null);
    setError(null);
    fetchTargets(30)
      .then((d) => mine === seq.current && setRows(d))
      .catch((e) => mine === seq.current && setError(e instanceof Error ? e.message : 'Failed to load'));
    // Both are garnish on the target list and render only when present (the
    // backtest chip behind `backtest?.lift != null`, the indications strip behind
    // `indications.length > 0`), so absent is a designed rendering rather than a
    // hidden failure. `rows` above is the page's real payload and carries the error.
    fetchIndications(8).then((d) => mine === seq.current && setIndications(d)).catch(() => {});
    fetchBacktest().then((d) => mine === seq.current && setBacktest(d)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const watch = useCallback(async (t: TargetRow) => {
    setBusy(t.id);
    try {
      await executeAction('project', t.id, 'watchlist_add');
      toast('success', `${t.name} added to watchlist`);
    } catch {
      toast('error', 'Could not add to watchlist');
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div className="p-5">
      <PageTitle
        icon={<Crosshair size={20} />}
        subtitle="Conviction-ranked projects to chase now — worth, window and why. Excludes listed + active deals."
        actions={
          <div className="flex items-center gap-2">
            {backtest?.lift != null && (
              <span
                className="hidden items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-grey sm:inline-flex"
                title={backtest.note}
              >
                <Activity size={11} className="text-emerald-500" />
                Won deals {backtest.lift}× universe conviction
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={load}>
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        }
      >
        Targets
      </PageTitle>

      {/* Indications & Warning */}
      {indications.length > 0 && (
        <div className="mb-4 rounded-lg border border-line bg-card p-3 shadow-card">
          <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
            <AlertTriangle size={12} className="text-amber-500" /> Indications &amp; Warning
          </div>
          <div className="flex flex-col gap-1.5">
            {indications.map((ind) => (
              <div key={`${ind.projectId}:${ind.type}`} className="flex items-center gap-2 text-label">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${ind.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`}
                />
                <EntityChip type="project" id={ind.projectId} name={ind.name} meta={ind.ticker} />
                <span className="truncate text-grey">{ind.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <EmptyState variant="error" title="Failed to load targets" description={error} />
      ) : rows === null ? (
        <TableSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="search"
          title="No targets yet"
          description="Run the alpha job (compute_alpha) after collection to rank the universe by conviction."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
          <table className="w-full min-w-[820px] text-label">
            <thead>
              <tr className="border-b border-line text-micro font-bold uppercase tracking-wider text-grey">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Project</th>
                <th className="px-3 py-2 text-left">Conviction</th>
                <th className="px-3 py-2 text-left">Window</th>
                <th className="px-3 py-2 text-right">Worth</th>
                <th className="px-3 py-2 text-right">Win</th>
                <th className="px-3 py-2 text-left">Read</th>
                <th className="px-3 py-2 text-right">Rivals</th>
                <th className="px-3 py-2 text-right">Act</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} className="border-b border-line/60 last:border-b-0 hover:bg-ice-soft/40 dark:hover:bg-ice-soft/[0.05]">
                  <td className="px-3 py-2 font-mono text-grey">{i + 1}</td>
                  <td className="px-3 py-2">
                    <EntityChip
                      type="project"
                      id={t.id}
                      name={t.name}
                      meta={t.ticker}
                      vitals={[
                        { label: 'Conviction', value: String(t.conviction) },
                        { label: 'Worth', value: t.dealValueUsd ? formatMoney(t.dealValueUsd) : '—' },
                      ]}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2" title={(t.drivers ?? []).map((d) => `${d.label} +${d.points}`).join(' · ')}>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                        <span className={`block h-full ${convColor(t.conviction)}`} style={{ width: `${t.conviction}%` }} />
                      </span>
                      <span className="num-tabular font-semibold text-navy">{t.conviction}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {t.timingWindow && (
                      <span className={`inline-block rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider ${WINDOW_STYLE[t.timingWindow] ?? WINDOW_STYLE.quiet}`}>
                        {t.timingWindow}
                      </span>
                    )}
                  </td>
                  <td className="num-tabular px-3 py-2 text-right font-semibold text-navy">
                    {t.dealValueUsd ? formatMoney(t.dealValueUsd) : '—'}
                  </td>
                  <td className="num-tabular px-3 py-2 text-right text-grey">{t.winnability ?? '—'}</td>
                  <td className="px-3 py-2 text-grey">{t.achVerdict ? (VERDICT_LABEL[t.achVerdict] ?? t.achVerdict) : '—'}</td>
                  <td className="num-tabular px-3 py-2 text-right text-grey">{t.competitorCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDraftFor(t.id)}
                        title="Draft outreach"
                        className="rounded p-1 text-grey transition-colors hover:bg-ice-soft hover:text-accent-icon dark:hover:bg-ice-soft/10"
                      >
                        <Sparkles size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={busy === t.id}
                        onClick={() => watch(t)}
                        title="Add to watchlist"
                        className="rounded p-1 text-grey transition-colors hover:bg-ice-soft hover:text-amber-500 disabled:opacity-50 dark:hover:bg-ice-soft/10"
                      >
                        <Star size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/bd-pipeline/${t.id}`)}
                        title="Start deal / open dossier"
                        className="rounded p-1 text-grey transition-colors hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
                      >
                        <Briefcase size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draftFor && <DraftPanel subjectId={draftFor} onClose={() => setDraftFor(null)} />}
    </div>
  );
}

export default Targets;
