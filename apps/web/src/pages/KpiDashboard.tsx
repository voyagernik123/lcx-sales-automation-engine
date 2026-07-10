import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Download, Clock, TrendingUp, Target, MessageSquare, DollarSign, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchKpis, exportKpisCsv, fetchTriggers, updateTriggerStatus, fetchForecast, type ForecastData } from '@/lib/api/kpi';
import type { KpiDashboard, PostListingTrigger } from '@/types/kpi';
import { TRIGGER_TYPE_LABELS, TRIGGER_DAY_LABELS, REVENUE_STREAM_LABELS, STAGE_LABELS } from '@/types/kpi';

function StatCard({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 flex items-center gap-3">
      <div className={clsx('shrink-0 h-9 w-9 rounded-lg flex items-center justify-center', accent ?? 'bg-cyan-500/10 text-cyan-500')}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-grey">{label}</p>
        <p className="text-lg font-bold text-navy dark:text-ice truncate">{value}</p>
      </div>
    </div>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-grey shrink-0">{label}</span>
      <div className="flex-1 h-5 rounded bg-ice-soft dark:bg-navy-deep overflow-hidden">
        <div className={clsx('h-full rounded transition-all duration-500', color)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className="w-12 text-xs font-bold text-right text-navy dark:text-ice shrink-0">{value}</span>
    </div>
  );
}

export function KpiDashboard() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<KpiDashboard | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [triggers, setTriggers] = useState<PostListingTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const [kpiData, triggerData] = await Promise.all([
        fetchKpis(controller.signal),
        fetchTriggers(undefined, controller.signal),
      ]);
      fetchForecast(controller.signal).then(setForecast).catch(() => setForecast(null));
      if (!controller.signal.aborted) {
        setKpis(kpiData);
        setTriggers(triggerData);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load KPIs');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportKpisCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lcx-kpis-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const handleTriggerAction = async (trigger: PostListingTrigger, action: 'drafted' | 'completed' | 'skipped') => {
    try {
      await updateTriggerStatus(trigger.id, action);
      setTriggers(prev => prev.map(t => t.id === trigger.id ? { ...t, status: action } : t));
    } catch (err) {
      console.error('Trigger update failed', err);
    }
  };

  const maxFunnel = kpis ? Math.max(kpis.funnel.enrolled, 1) : 1;

  if (loading && !kpis) {
    return (
      <div className="flex h-[calc(100vh-6.5rem)] items-center justify-center text-grey">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <span className="text-sm">Loading KPIs...</span>
        </div>
      </div>
    );
  }

  if (error && !kpis) {
    return (
      <div className="flex h-[calc(100vh-6.5rem)] flex-col items-center justify-center text-red-500 gap-3">
        <p className="text-sm font-semibold">Failed to load KPIs</p>
        <p className="text-xs text-grey">{error}</p>
        <button onClick={load} className="rounded border border-red-200 px-3 py-1 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy dark:text-ice overflow-hidden">
      {/* HEADER */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card">
        <h1 className="text-lg font-bold flex items-center gap-1.5">
          <BarChart3 size={17} className="text-cyan-500" />
          KPI Dashboard
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey hover:text-navy dark:hover:text-ice hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors disabled:opacity-50"
          >
            <Download size={12} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey hover:text-navy dark:hover:text-ice hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {kpis && (
          <>
            {/* TOP ROW STATS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="New High-Score Leads (7d)"
                value={kpis.newHighScoreLeadsThisWeek}
                icon={<TrendingUp size={16} />}
                accent="bg-emerald-500/10 text-emerald-500"
              />
              <StatCard
                label="Avg Days: Touch → Handoff"
                value={kpis.avgDaysFirstTouchToHandoff != null ? `${kpis.avgDaysFirstTouchToHandoff}d` : 'N/A'}
                icon={<Clock size={16} />}
                accent="bg-blue-500/10 text-blue-500"
              />
              <StatCard
                label="Avg Days: Handoff → Proposal"
                value={kpis.avgDaysHandoffToProposal != null ? `${kpis.avgDaysHandoffToProposal}d` : 'N/A'}
                icon={<Clock size={16} />}
                accent="bg-purple-500/10 text-purple-500"
              />
              <StatCard
                label="Avg Days: Proposal → Won"
                value={kpis.avgDaysProposalToWon != null ? `${kpis.avgDaysProposalToWon}d` : 'N/A'}
                icon={<DollarSign size={16} />}
                accent="bg-amber-500/10 text-amber-500"
              />
            </div>

            {/* SECOND ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* FUNNEL */}
              <div className="rounded-lg border border-line bg-card p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                  <Target size={13} /> Funnel
                </h2>
                <div className="space-y-2">
                  <FunnelBar label="Enrolled" value={kpis.funnel.enrolled} max={maxFunnel} color="bg-blue-500" />
                  <FunnelBar label="Replied" value={kpis.funnel.replied} max={maxFunnel} color="bg-cyan-500" />
                  <FunnelBar label="Proposal" value={kpis.funnel.proposal} max={maxFunnel} color="bg-purple-500" />
                  <FunnelBar label="Won" value={kpis.funnel.won} max={maxFunnel} color="bg-emerald-500" />
                </div>
                {kpis.funnel.enrolled > 0 && (
                  <div className="mt-2 text-[10px] text-grey">
                    Reply rate: {Math.round((kpis.funnel.replied / kpis.funnel.enrolled) * 100)}%
                    &nbsp;· Won rate: {Math.round((kpis.funnel.won / Math.max(kpis.funnel.proposal, 1)) * 100)}%
                  </div>
                )}
              </div>

              {/* REPLY RATES */}
              <div className="rounded-lg border border-line bg-card p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                  <MessageSquare size={13} /> Reply Rate by Channel
                </h2>
                {Object.keys(kpis.replyRateByChannel).length === 0 ? (
                  <p className="text-xs text-grey">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(kpis.replyRateByChannel).map(([ch, stats]) => (
                      <div key={ch}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="capitalize font-medium">{ch}</span>
                          <span className="text-grey">{stats.sent} sent · {stats.replied} replied</span>
                        </div>
                        <div className="h-2 rounded-full bg-ice-soft dark:bg-navy-deep overflow-hidden">
                          <div
                            className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                            style={{ width: `${stats.rate}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-grey mt-0.5">{stats.rate}% reply rate</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* WEEKLY VIEW */}
              <div className="rounded-lg border border-line bg-card p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Weekly Operator View
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Hot (active)</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{kpis.weeklyView.hot}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-amber-500/10">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Stalled (7-21d)</span>
                    <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{kpis.weeklyView.stalled}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-red-500/10">
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">Overdue (21d+)</span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">{kpis.weeklyView.overdue}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* REVENUE FORECAST (Monte Carlo) */}
            {forecast && forecast.deals.length > 0 && (
              <div className="rounded-lg border border-line bg-card p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                  <TrendingUp size={13} /> Pipeline Forecast — {forecast.runs.toLocaleString()} simulations
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  {([['P10 (conservative)', forecast.p10], ['P50 (median)', forecast.p50], ['P90 (upside)', forecast.p90], ['Expected value', forecast.expected]] as const).map(([label, v]) => (
                    <div key={label} className="rounded border border-line p-2.5 text-center">
                      <div className="text-[9px] font-bold uppercase text-grey">{label}</div>
                      <div className="text-lg font-bold font-mono">${Math.round(v).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {forecast.deals.slice(0, 8).map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-40 truncate font-semibold">{d.projectName}</span>
                      <span className="w-20 text-grey uppercase text-[9px]">{d.stage}</span>
                      <div className="flex-1 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${d.winProbability}%` }} />
                      </div>
                      <span className="w-10 text-right font-mono font-bold">{d.winProbability}%</span>
                      <span className="w-20 text-right font-mono text-grey">${d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* REVENUE + OBJECTIONS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-line bg-card p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                  <DollarSign size={13} /> Revenue by Stream (cents)
                </h2>
                {Object.keys(kpis.revenueByStream).length === 0 ? (
                  <p className="text-xs text-grey">No deals closed yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(kpis.revenueByStream).filter(([, v]) => v > 0).map(([stream, rev]) => (
                      <div key={stream} className="flex items-center justify-between py-1 border-b border-line/30 last:border-0">
                        <span className="text-xs">{REVENUE_STREAM_LABELS[stream] ?? stream}</span>
                        <span className="text-xs font-bold font-mono">${(rev / 100).toLocaleString()}</span>
                      </div>
                    ))}
                    {Object.values(kpis.revenueByStream).some(v => v > 0) && (
                      <div className="flex items-center justify-between pt-1 font-bold text-sm border-t border-line">
                        <span>Total</span>
                        <span className="font-mono">
                          ${(Object.values(kpis.revenueByStream).reduce((a, b) => a + b, 0) / 100).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {/* TOP OBJECTIONS */}
                <div className="rounded-lg border border-line bg-card p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                    <AlertTriangle size={13} /> Top Objections
                  </h2>
                  {kpis.topObjections.length === 0 ? (
                    <p className="text-xs text-grey">No objections logged</p>
                  ) : (
                    <div className="space-y-1.5">
                      {kpis.topObjections.map((obj) => (
                        <div key={obj.category} className="flex items-center justify-between py-1">
                          <span className="text-xs capitalize">{obj.category.replace(/_/g, ' ')}</span>
                          <span className="text-xs font-bold font-mono">{obj.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* POST-LISTING EXPANSION */}
                <div className="rounded-lg border border-line bg-card p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                    <TrendingUp size={13} /> Post-Listing Expansion
                  </h2>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-navy dark:text-ice">{kpis.postListingExpansion.totalWon}</p>
                      <p className="text-[10px] text-grey">Total Won</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{kpis.postListingExpansion.withExpansion}</p>
                      <p className="text-[10px] text-grey">With Expansion</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        ${(kpis.postListingExpansion.expansionRevenue / 100).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-grey">Expansion Rev</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STALLED DEALS */}
            {kpis.stalledDeals.length > 0 && (
              <div className="rounded-lg border border-line bg-card p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                  <Clock size={13} /> Stalled Deals
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Project</th>
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Stage</th>
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Stalled (days)</th>
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Blocker</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/30">
                      {kpis.stalledDeals.map((deal) => (
                        <tr
                          key={deal.id}
                          onClick={() => navigate(`/bd-pipeline/${deal.id}`)}
                          className="hover:bg-ice-soft dark:hover:bg-ice-soft/5 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-2 font-medium">{deal.projectName}</td>
                          <td className="py-2 px-2">
                            <span className="text-grey">{STAGE_LABELS[deal.stage] ?? deal.stage}</span>
                          </td>
                          <td className="py-2 px-2">
                            <span className={clsx(
                              'font-bold',
                              deal.daysSinceUpdate >= 21 ? 'text-red-500' : deal.daysSinceUpdate >= 7 ? 'text-amber-500' : 'text-grey',
                            )}>
                              {deal.daysSinceUpdate}d
                            </span>
                          </td>
                          <td className="py-2 px-2 text-grey max-w-[200px] truncate">{deal.blocker}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* POST-LISTING TRIGGERS */}
            {triggers.length > 0 && (
              <div className="rounded-lg border border-line bg-card p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grey mb-3 flex items-center gap-1.5">
                  <Target size={13} /> Post-Listing 30/60/90 Triggers
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Project</th>
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Trigger</th>
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Due</th>
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Status</th>
                        <th className="text-left py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-grey">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/30">
                      {triggers.slice(0, 20).map((t) => {
                        const isOverdue = new Date(t.dueAt) < new Date() && t.status === 'pending';
                        return (
                          <tr key={t.id} className={clsx(isOverdue && 'bg-red-50/30 dark:bg-red-950/10')}>
                            <td className="py-2 px-2 font-medium">{t.projectName}</td>
                            <td className="py-2 px-2">
                              <span className="font-medium">{TRIGGER_DAY_LABELS[t.triggerDay]}</span>
                              <span className="text-grey ml-1">{TRIGGER_TYPE_LABELS[t.triggerType] ?? t.triggerType}</span>
                            </td>
                            <td className="py-2 px-2">
                              <span className={clsx(isOverdue ? 'text-red-500 font-bold' : 'text-grey')}>
                                {new Date(t.dueAt).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <span className={clsx(
                                'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                                t.status === 'completed' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                t.status === 'drafted' && 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
                                t.status === 'skipped' && 'bg-slate-500/10 text-slate-500',
                                t.status === 'pending' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                              )}>
                                {t.status}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1">
                                {t.status === 'pending' && (
                                  <>
                                    <button onClick={() => handleTriggerAction(t, 'drafted')} className="rounded border border-line px-2 py-0.5 text-[10px] font-bold hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors">Draft</button>
                                    <button onClick={() => handleTriggerAction(t, 'completed')} className="rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors">Done</button>
                                    <button onClick={() => handleTriggerAction(t, 'skipped')} className="rounded border border-line px-2 py-0.5 text-[10px] font-bold text-grey hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors">Skip</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default KpiDashboard;
