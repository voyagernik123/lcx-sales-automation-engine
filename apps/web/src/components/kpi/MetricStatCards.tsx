import { StatCard } from '@/components/charts';
import type { KpiDashboard } from '@/types/kpi';
import type { KpiSnapshot } from '@/lib/api/bd';
import { pctChange } from './range';

interface MetricStatCardsProps {
  kpis: KpiDashboard;
  /** Snapshots inside the selected range, ascending by date. */
  snapshots: KpiSnapshot[];
  deltaLabel: string;
}

function seriesOf(
  snapshots: KpiSnapshot[],
  pick: (s: KpiSnapshot) => number,
): { trend?: number[]; delta?: number } {
  if (snapshots.length < 2) return {};
  const series = snapshots.map(pick);
  return { trend: series, delta: pctChange(series[0], series[series.length - 1]) };
}

function snapshotReplyRate(s: KpiSnapshot): number {
  const sent = s.emailSent + s.linkedinSent;
  return sent > 0 ? ((s.emailReplied + s.linkedinReplied) / sent) * 100 : 0;
}

/** Top metric row: current value + period-over-period delta + history sparkline. */
export function MetricStatCards({ kpis, snapshots, deltaLabel }: MetricStatCardsProps) {
  const totalRevenueCents = Object.values(kpis.revenueByStream).reduce((a, b) => a + b, 0);
  const sent = Object.values(kpis.replyRateByChannel).reduce((a, s) => a + s.sent, 0);
  const repliedCount = Object.values(kpis.replyRateByChannel).reduce((a, s) => a + s.replied, 0);
  const replyRate = sent > 0 ? (repliedCount / sent) * 100 : 0;

  const leads = seriesOf(snapshots, (s) => s.newHighScoreLeadsWeek);
  const won = seriesOf(snapshots, (s) => s.funnelWon);
  const revenue = seriesOf(snapshots, (s) => s.totalRevenue);
  const reply = seriesOf(snapshots, snapshotReplyRate);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard
        label="New high-score leads (7d)"
        value={String(kpis.newHighScoreLeadsThisWeek)}
        delta={leads.delta}
        deltaLabel={deltaLabel}
        trend={leads.trend}
      />
      <StatCard
        label="Deals won"
        value={String(kpis.funnel.won)}
        delta={won.delta}
        deltaLabel={deltaLabel}
        trend={won.trend}
      />
      <StatCard
        label="Revenue closed"
        value={`$${Math.round(totalRevenueCents / 100).toLocaleString()}`}
        delta={revenue.delta}
        deltaLabel={deltaLabel}
        trend={revenue.trend}
      />
      <StatCard
        label="Reply rate"
        value={`${Math.round(replyRate)}%`}
        delta={reply.delta}
        deltaLabel={deltaLabel}
        trend={reply.trend}
      />
    </div>
  );
}
