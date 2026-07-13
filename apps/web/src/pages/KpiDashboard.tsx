import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchKpis, exportKpisCsv, fetchTriggers, updateTriggerStatus, fetchForecast, type ForecastData } from '@/lib/api/kpi';
import { fetchKpiHistory, type KpiSnapshot } from '@/lib/api/bd';
import type { KpiDashboard as KpiData, PostListingTrigger } from '@/types/kpi';
import { REVENUE_STREAM_LABELS } from '@/types/kpi';
import { ChartCard, ColumnChart, DonutChart, GaugeChart } from '@/components/charts';
import { ChartSkeleton, EmptyState, PageSkeleton, toast } from '@/components/shared';
import { MetricStatCards } from '@/components/kpi/MetricStatCards';
import { FunnelSection } from '@/components/kpi/FunnelSection';
import { ForecastCard } from '@/components/kpi/ForecastCard';
import { StalledDealsTable, TriggersTable } from '@/components/kpi/OpsTables';
import { RANGE_DELTA_LABELS, RANGE_OPTIONS, rangeCutoff, type RangeKey } from '@/components/kpi/range';

/** GET /v1/kpis also returns telegramConversion; the shared web type predates it. */
type KpiPayload = KpiData & {
  telegramConversion?: { handoffs: number; moved: number; rate: number };
};

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`;

const CHANNEL_LABELS: Record<string, string> = { email: 'Email', linkedin: 'LinkedIn' };

export function KpiDashboard() {
  const [kpis, setKpis] = useState<KpiPayload | null>(null);
  const [history, setHistory] = useState<KpiSnapshot[]>([]);
  // undefined = still loading, null = unavailable
  const [forecast, setForecast] = useState<ForecastData | null | undefined>(undefined);
  const [triggers, setTriggers] = useState<PostListingTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState<RangeKey>('30d');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!opts.silent) setLoading(true);
    setError(null);

    try {
      const [kpiData, triggerData, historyData] = await Promise.all([
        fetchKpis(controller.signal) as Promise<KpiPayload>,
        fetchTriggers(undefined, controller.signal),
        // Sparklines/deltas degrade gracefully if snapshots are unavailable.
        fetchKpiHistory(365, controller.signal).catch(() => [] as KpiSnapshot[]),
      ]);
      fetchForecast(controller.signal)
        .then((f) => { if (!controller.signal.aborted) setForecast(f); })
        .catch(() => { if (!controller.signal.aborted) setForecast(null); });
      if (!controller.signal.aborted) {
        setKpis(kpiData);
        setTriggers(triggerData);
        setHistory(historyData);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load KPIs');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void load({ silent: true }); }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

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
    } catch {
      toast('error', 'CSV export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleTriggerAction = async (trigger: PostListingTrigger, action: 'drafted' | 'completed' | 'skipped') => {
    try {
      await updateTriggerStatus(trigger.id, action);
      setTriggers(prev => prev.map(t => t.id === trigger.id ? { ...t, status: action } : t));
    } catch {
      toast('error', 'Failed to update trigger');
    }
  };

  if (loading && !kpis) {
    return (
      <div className="h-[calc(100vh-6.5rem)] overflow-hidden px-4 py-4">
        <PageSkeleton />
      </div>
    );
  }

  if ((error && !kpis) || !kpis) {
    return (
      <div className="flex h-[calc(100vh-6.5rem)] items-center justify-center">
        <EmptyState
          icon={<BarChart3 size={28} className="text-grey" />}
          title="Couldn't load KPIs"
          description={error ?? 'No KPI data returned'}
          action={
            <button
              onClick={() => void load()}
              className="rounded border border-line px-3 py-1.5 text-xs font-bold text-navy hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors"
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  const cutoff = rangeCutoff(range);
  const windowSnapshots = history.filter((s) => s.date >= cutoff);
  const deltaLabel = RANGE_DELTA_LABELS[range];

  const revenueSlices = Object.entries(kpis.revenueByStream)
    .filter(([, cents]) => cents > 0)
    .map(([stream, cents]) => ({ label: REVENUE_STREAM_LABELS[stream] ?? stream, value: cents / 100 }));
  const totalRevenue = revenueSlices.reduce((a, s) => a + s.value, 0);

  const channelColumns = Object.entries(kpis.replyRateByChannel).map(([ch, stats]) => ({
    label: CHANNEL_LABELS[ch] ?? ch,
    value: stats.rate,
  }));
  const totalSent = Object.values(kpis.replyRateByChannel).reduce((a, s) => a + s.sent, 0);
  const totalReplied = Object.values(kpis.replyRateByChannel).reduce((a, s) => a + s.replied, 0);

  const tg = kpis.telegramConversion;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy overflow-hidden">
      {/* HEADER */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b border-line bg-card">
        <h1 className="text-lg font-bold flex items-center gap-1.5">
          <BarChart3 size={17} className="text-cyan-500" />
          KPI Dashboard
        </h1>

        {/* DATE RANGE CHIPS */}
        <div className="flex items-center gap-1" role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              aria-pressed={range === opt.key}
              className={clsx(
                'rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors',
                range === opt.key
                  ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40'
                  : 'border border-line text-grey hover:text-navy hover:bg-ice-soft dark:hover:bg-navy-deep',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            aria-pressed={autoRefresh}
            className={clsx(
              'flex items-center gap-1.5 rounded border px-3 py-1 text-[10px] font-bold transition-colors',
              autoRefresh
                ? 'border-emerald-400/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                : 'border-line text-grey hover:text-navy hover:bg-ice-soft dark:hover:bg-navy-deep',
            )}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-grey')} />
            Auto 30s
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey hover:text-navy hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors disabled:opacity-50"
          >
            <Download size={12} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey hover:text-navy hover:bg-ice-soft dark:hover:bg-navy-deep transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* METRIC CARDS */}
        <MetricStatCards kpis={kpis} snapshots={windowSnapshots} deltaLabel={deltaLabel} />

        {/* FUNNEL / REVENUE / TELEGRAM */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <FunnelSection funnel={kpis.funnel} />

          <ChartCard title="Revenue by stream" subtitle={revenueSlices.length > 0 ? `${fmtUsd(totalRevenue)} closed` : undefined}>
            {revenueSlices.length > 0 ? (
              <DonutChart
                data={revenueSlices}
                legend="bottom"
                centerLabel="total"
                centerValue={fmtUsd(totalRevenue)}
                formatValue={fmtUsd}
              />
            ) : (
              <p className="py-8 text-center text-xs text-grey">No deals closed yet</p>
            )}
          </ChartCard>

          {tg && (
            <ChartCard title="Telegram conversion" subtitle="Handoffs moved into a Telegram group">
              <div className="mx-auto max-w-[220px]">
                <GaugeChart value={tg.rate} label="% moved" thresholds={{ good: 40, warn: 20 }} />
              </div>
              <p className="mt-2 text-center text-xs text-grey">
                {tg.moved} of {tg.handoffs} handoffs moved to Telegram
              </p>
            </ChartCard>
          )}
        </div>

        {/* REPLY RATES / DEAL HEALTH / FORECAST */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Reply rate by channel"
            subtitle={totalSent > 0 ? `${totalReplied} replies on ${totalSent} sent` : undefined}
          >
            {channelColumns.length > 0 ? (
              <ColumnChart data={channelColumns} height={170} showValues="all" formatValue={(v) => `${Math.round(v)}%`} />
            ) : (
              <p className="py-8 text-center text-xs text-grey">No outreach sent yet</p>
            )}
          </ChartCard>

          <ChartCard title="Deal health" subtitle="Open deals by staleness">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded p-2 bg-emerald-500/10">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Hot (active)</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{kpis.weeklyView.hot}</span>
              </div>
              <div className="flex items-center justify-between rounded p-2 bg-amber-500/10">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Stalled (7–21d)</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{kpis.weeklyView.stalled}</span>
              </div>
              <div className="flex items-center justify-between rounded p-2 bg-red-500/10">
                <span className="text-xs font-bold text-red-600 dark:text-red-400">Overdue (21d+)</span>
                <span className="text-lg font-bold text-red-600 dark:text-red-400">{kpis.weeklyView.overdue}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-line pt-2 text-center">
                <div>
                  <p className="text-base font-semibold">{kpis.postListingExpansion.totalWon}</p>
                  <p className="text-[10px] text-grey">Won</p>
                </div>
                <div>
                  <p className="text-base font-semibold">{kpis.postListingExpansion.withExpansion}</p>
                  <p className="text-[10px] text-grey">With expansion</p>
                </div>
                <div>
                  <p className="text-base font-semibold">{fmtUsd(kpis.postListingExpansion.expansionRevenue / 100)}</p>
                  <p className="text-[10px] text-grey">Expansion rev</p>
                </div>
              </div>
            </div>
          </ChartCard>

          {forecast === undefined ? (
            <ChartCard title="Pipeline forecast">
              <ChartSkeleton height={170} />
            </ChartCard>
          ) : forecast ? (
            <ForecastCard forecast={forecast} />
          ) : null}
        </div>

        {/* OPERATIONAL TABLES */}
        <StalledDealsTable deals={kpis.stalledDeals} />
        <TriggersTable triggers={triggers} onAction={(t, a) => void handleTriggerAction(t, a)} />
      </div>
    </div>
  );
}

export default KpiDashboard;
