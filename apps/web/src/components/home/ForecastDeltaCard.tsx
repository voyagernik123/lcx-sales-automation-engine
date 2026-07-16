import { useNavigate } from 'react-router-dom';
import { Sparkline, TrendDelta, CHART_MUTED } from '@/components/charts';
import { pctChange, type ForecastDelta } from '@/lib/api/loop';

export interface ForecastDeltaCardProps {
  forecast: ForecastDelta;
}

function fmtUsd(cents: number): string {
  const n = cents / 100;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * "Forecast delta" — latest daily KPI snapshot vs the previous one. Revenue
 * leads with the trend line; the funnel and risk counters ride below, each
 * with its own signed delta. Clicking through lands on the KPI instrument.
 */
export function ForecastDeltaCard({ forecast }: ForecastDeltaCardProps) {
  const navigate = useNavigate();
  const { latest, previous, revenueTrend } = forecast;

  const rows: { label: string; value: string; delta: number | null; goodIsUp: boolean }[] = [
    {
      label: 'Won deals',
      value: String(latest.funnelWon),
      delta: pctChange(latest.funnelWon, previous?.funnelWon),
      goodIsUp: true,
    },
    {
      label: 'Replies',
      value: String(latest.funnelReplied),
      delta: pctChange(latest.funnelReplied, previous?.funnelReplied),
      goodIsUp: true,
    },
    {
      label: 'Stalled deals',
      value: String(latest.stalledDeals),
      delta: pctChange(latest.stalledDeals, previous?.stalledDeals),
      goodIsUp: false,
    },
    {
      label: 'Overdue actions',
      value: String(latest.overdueActions),
      delta: pctChange(latest.overdueActions, previous?.overdueActions),
      goodIsUp: false,
    },
  ];

  return (
    <button
      type="button"
      onClick={() => navigate('/bd-kpis')}
      className="w-full rounded-lg border border-line p-3 text-left transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/5"
      title="Open the KPI dashboard"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-micro font-bold uppercase tracking-wider text-grey">Revenue (snapshot {latest.date})</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold text-navy">{fmtUsd(latest.totalRevenue)}</span>
            <TrendDelta value={pctChange(latest.totalRevenue, previous?.totalRevenue)} />
            <span className="text-micro text-grey">{previous ? `vs ${previous.date}` : 'first snapshot'}</span>
          </div>
        </div>
        {revenueTrend.length > 1 && <Sparkline data={revenueTrend} stroke={CHART_MUTED} width={110} height={30} />}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between gap-1.5 sm:flex-col sm:items-start sm:gap-0">
            <span className="text-micro text-grey">{r.label}</span>
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-label font-bold text-navy">{r.value}</span>
              <TrendDelta value={r.delta} goodIsUp={r.goodIsUp} />
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}
