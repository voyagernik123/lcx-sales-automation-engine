import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, LayoutGrid, RefreshCw, Star, Table2 } from 'lucide-react';
import { createTask, fetchExchangeGaps, type GapRow } from '@/lib/api/bd';
import { EmptyState, TableSkeleton, toast } from '@/components/shared';
import { Button, PageTitle } from '@/components/ui';
import { EntityChip } from '@/components/entity';
import { FilterChip } from '@/components/market/FilterChip';
import { GapHeatMatrix } from '@/components/market/GapHeatMatrix';
import { GapMiniAnalytics } from '@/components/market/GapMiniAnalytics';
import { buildGapMatrix, findNewIds, fmtUsd, formatSince } from '@/components/market/gapMatrix';
import { useLastVisit, useWatchlist } from '@/components/market/marketMemory';
import { useInspect } from '@/stores';

type ViewMode = 'matrix' | 'table';

export function ExchangeGaps() {
  const inspect = useInspect();
  const { watched, toggleWatch } = useWatchlist();
  const { prev, commit } = useLastVisit('gaps');

  const [rows, setRows] = useState<GapRow[]>([]);
  const [total, setTotal] = useState(0);
  const [minExchanges, setMinExchanges] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>('matrix');
  const [watchOnly, setWatchOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    // Out-of-order guard: the minExchanges control fires rapid values —
    // drop every response but the newest so the grid can't show stale rows.
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');
    try {
      const res = await fetchExchangeGaps(minExchanges);
      if (seq !== loadSeq.current) return;
      setRows(res.rows);
      setTotal(res.total);
      commit(res.rows.map((r) => r.id));
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load gaps');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [minExchanges, commit]);

  useEffect(() => {
    void load();
  }, [load]);

  /* screener Δ: entrants since the stamp left by the previous visit.
     Payload reality: gap rows carry no updatedAt/createdAt, so "new" =
     first time this project shows up on this screen. */
  const newIds = useMemo(() => findNewIds(rows.map((r) => r.id), prev), [rows, prev]);

  const watchingCount = useMemo(() => rows.filter((r) => watched.has(r.id)).length, [rows, watched]);

  const displayRows = useMemo(
    () =>
      rows.filter(
        (r) => (!watchOnly || watched.has(r.id)) && (!newOnly || newIds.has(r.id)),
      ),
    [rows, watchOnly, watched, newOnly, newIds],
  );

  const model = useMemo(() => buildGapMatrix(displayRows, 12), [displayRows]);

  const handleCreateTask = useCallback(async (project: GapRow) => {
    const venues = project.topExchanges.slice(0, 5).map((e) => e.name).join(', ');
    try {
      await createTask(
        `Gap pitch: ${project.name} — live on ${project.exchangeCount} exchanges, absent from LCX`,
        {
          projectId: project.id,
          detail:
            `Live on ${project.exchangeCount} exchanges${venues ? ` (top: ${venues})` : ''} — a proven listing budget with no LCX presence. ` +
            `Priority ${project.priorityScore}, propensity ${project.propensityScore}, mcap ${fmtUsd(project.marketCapUsd)}.`,
        },
      );
      toast('success', `Outreach task created — Gap pitch: ${project.name}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create the outreach task');
    }
  }, []);

  const viewButton = (mode: ViewMode, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setView(mode)}
      aria-pressed={view === mode}
      className={`flex items-center gap-1 px-2 py-1 text-micro font-bold transition-colors ${
        view === mode
          ? 'bg-ice-soft text-navy dark:bg-ice-soft/10'
          : 'bg-card text-grey hover:text-navy'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <PageTitle
        icon={<Layers size={20} />}
        actions={
          <div className="flex items-center gap-2 text-label">
            <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="View mode">
              {viewButton('matrix', <LayoutGrid size={11} />, 'Matrix')}
              <span className="w-px bg-line" aria-hidden="true" />
              {viewButton('table', <Table2 size={11} />, 'Table')}
            </div>
            <label className="text-grey">Min exchanges:</label>
            <select
              value={minExchanges}
              onChange={(e) => setMinExchanges(Number(e.target.value))}
              className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 outline-none focus:border-cyan-500 transition-colors"
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>{n}+</option>
              ))}
            </select>
            <Button variant="secondary" size="xs" onClick={() => void load()}>
              <RefreshCw size={11} /> Refresh
            </Button>
          </div>
        }
      >
        Exchange Gaps
      </PageTitle>

      <p className="text-label text-grey">
        Projects already listed on {minExchanges}+ exchanges but <span className="font-bold">not on LCX</span> — proven
        listing budgets, ranked by likelihood to pay.{' '}
        {total > 0 && (
          <span className="font-semibold text-navy">
            {total} gaps found{rows.length < total ? ` · showing top ${rows.length} by priority` : ''}
            {view === 'matrix' && model.exchanges.length > 0 ? ` · ${model.exchanges.length} venues compared` : ''}.
          </span>
        )}
      </p>

      {/* watchlist + screener-Δ chips */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={watchOnly}
            dotColor="#f59e0b"
            title="Show only watched projects"
            onClick={() => setWatchOnly((v) => !v)}
          >
            Watching ({watchingCount})
          </FilterChip>
          {prev && newIds.size > 0 && (
            <FilterChip
              active={newOnly}
              dotColor="#10b981"
              title="Show only projects that entered this screen since your last visit"
              onClick={() => setNewOnly((v) => !v)}
            >
              +{newIds.size} new since {formatSince(prev.ts)}
            </FilterChip>
          )}
        </div>
      )}

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-label text-red-700 dark:text-red-300">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <EmptyState
          variant="search"
          title="No gap data yet"
          description="The exchange_sync job populates this daily, top-priority projects first."
        />
      )}
      {!loading && !error && rows.length > 0 && displayRows.length === 0 && (
        <EmptyState
          variant="search"
          title="Nothing matches the active chips"
          description="Clear the Watching / new-since filters to see the full screen again."
        />
      )}

      {!loading && !error && displayRows.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-2">
            {view === 'matrix' ? (
              <>
                <GapHeatMatrix
                  model={model}
                  watched={watched}
                  newIds={newIds}
                  onToggleWatch={toggleWatch}
                  onInspect={(id) => inspect('project', id)}
                  onCreateTask={handleCreateTask}
                />
                {/* legend */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-grey">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-3 w-4 items-center justify-center rounded-sm border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                      <span className="h-1 w-1 rounded-full bg-amber-500" />
                    </span>
                    LCX gap — click to act
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-4 rounded-sm border border-slate-300 bg-slate-200/70 dark:border-slate-600 dark:bg-slate-700/40" />
                    listed (project&apos;s top venues by 24h volume)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star size={10} className="text-amber-500" fill="currentColor" /> watching
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="rounded bg-emerald-100 px-1 text-micro font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                      NEW
                    </span>
                    entered since last visit
                  </span>
                </div>
              </>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line/70 bg-card shadow-card">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-micro font-medium uppercase tracking-wider text-grey">
                      <th className="py-2.5 px-2 w-8" aria-label="Watch" />
                      <th className="py-2.5 px-3">Project</th>
                      <th className="py-2.5 px-3 text-right">Priority</th>
                      <th className="py-2.5 px-3 text-right">Mcap</th>
                      <th className="py-2.5 px-3 text-right"># Exch.</th>
                      <th className="py-2.5 px-3">Listed on</th>
                      <th className="py-2.5 px-3">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/50">
                    {displayRows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => inspect('project', r.id)}
                        tabIndex={0}
                        // Stays a table row (role="button" would strip the row
                        // semantics) and it holds its own controls, so: Enter/Space
                        // activate, Space prevented so the page does not scroll, and
                        // the target guard keeps Enter on the watch star or the
                        // EntityChip from also inspecting the row.
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            inspect('project', r.id);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10 focus-ring"
                      >
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWatch(r.id);
                            }}
                            title={watched.has(r.id) ? 'Remove from watchlist' : 'Add to watchlist'}
                            aria-pressed={watched.has(r.id)}
                            className={`rounded p-0.5 transition-colors ${
                              watched.has(r.id) ? 'text-amber-500' : 'text-grey/40 hover:text-amber-500'
                            }`}
                          >
                            <Star size={12} fill={watched.has(r.id) ? 'currentColor' : 'none'} />
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <EntityChip
                            type="project"
                            id={r.id}
                            name={r.name}
                            stateLine={`live on ${r.exchangeCount} exchanges · not on LCX`}
                            vitals={[
                              { label: 'Priority', value: String(r.priorityScore) },
                              { label: 'Mcap', value: fmtUsd(r.marketCapUsd) },
                            ]}
                            className="font-semibold"
                          />
                          {r.ticker && <span className="ml-1.5 text-micro text-grey font-mono">{r.ticker}</span>}
                          {newIds.has(r.id) && (
                            <span className="ml-1.5 rounded bg-emerald-100 px-1 text-micro font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                              NEW
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className="num-tabular font-mono text-xs font-semibold text-navy">{r.priorityScore}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono num-tabular">{fmtUsd(r.marketCapUsd)}</td>
                        <td className="py-2 px-3 text-right font-mono num-tabular font-semibold">{r.exchangeCount}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {r.topExchanges.slice(0, 5).map((e) => (
                              <span key={e.id} className="inline-flex h-[18px] items-center rounded border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-1.5 text-micro font-medium text-grey-dark">{e.name}</span>
                            ))}
                            {r.exchangeCount > 5 && <span className="text-micro text-grey num-tabular">+{r.exchangeCount - 5}</span>}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-micro">{r.verifiedContactCount > 0 ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* sidebar mini-analytics */}
          <aside className="w-full shrink-0 lg:w-72">
            <GapMiniAnalytics rows={displayRows} />
          </aside>
        </div>
      )}
    </div>
  );
}
