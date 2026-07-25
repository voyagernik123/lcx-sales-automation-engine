import { StatCard } from '@/components/charts';
import { CountUp } from '@/components/ui/CountUp';
import { Derived } from '@/components/lineage';
import type { KpiDashboard } from '@/types/kpi';
import { REVENUE_STREAM_LABELS } from '@/types/kpi';
import type { KpiSnapshot } from '@/lib/api/bd';
import { formatMoney } from '@/lib/format';
import { rateAggregateLineage, sumAggregateLineage } from '@/lib/lineage';
import { deltaPct, formatRate } from '@/lib/metricPolicy';

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
  // Policy: a delta against a near-zero baseline is an artifact, not a trend.
  const delta = deltaPct(series[series.length - 1], series[0]);
  return { trend: series, delta: delta ?? undefined };
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
  const replyRate = formatRate(repliedCount, sent);

  const leads = seriesOf(snapshots, (s) => s.newHighScoreLeadsWeek);
  const won = seriesOf(snapshots, (s) => s.funnelWon);
  const revenue = seriesOf(snapshots, (s) => s.totalRevenue);
  const reply = seriesOf(snapshots, snapshotReplyRate);

  return (
    <div className="grid grid-cols-2 items-stretch gap-4 xl:grid-cols-4">
      <StatCard
        label="New high-score leads (7d)"
        // T1 #18. These two tiles are counts that CHANGE UNDER THE OPERATOR without a
        // remount, so a snap here is genuinely lossy: 12 becoming 47 between two frames is
        // indistinguishable from 47 having always been there.
        //
        // WHICH CHANGE, PRECISELY — the first version of this comment credited the range
        // selector, and that was wrong. `fetchKpis()` in KpiDashboard takes no range
        // argument; `range` feeds only `windowSnapshots` (the sparklines) and `deltaLabel`,
        // so moving it leaves both numbers below untouched and the no-op guard in `CountUp`
        // correctly does nothing. The paths that DO move them in place are the auto-refresh
        // poll (30s, `load({ silent: true })`) and the manual Refresh button — neither
        // unmounts these tiles, because the loading skeleton is gated on `loading && !kpis`
        // and `kpis` is already populated by then.
        //
        // The other two tiles in this row are deliberately left alone: both are wrapped in
        // `<Derived>`, whose dotted underline is a click target for the lineage popover,
        // and rolling a number the operator is about to click on is motion in the way of an
        // action.
        value={<CountUp value={kpis.newHighScoreLeadsThisWeek} />}
        delta={leads.delta}
        deltaLabel={leads.delta !== undefined ? deltaLabel : undefined}
        trend={leads.trend}
      />
      <StatCard
        label="Deals won"
        value={<CountUp value={kpis.funnel.won} />}
        delta={won.delta}
        deltaLabel={won.delta !== undefined ? deltaLabel : undefined}
        trend={won.trend}
      />
      <StatCard
        label="Revenue closed"
        value={
          <Derived lineage={sumAggregateLineage('Revenue closed', kpis.revenueByStream, REVENUE_STREAM_LABELS)}>
            {formatMoney(Math.round(totalRevenueCents / 100))}
          </Derived>
        }
        delta={revenue.delta}
        deltaLabel={revenue.delta !== undefined ? deltaLabel : undefined}
        trend={revenue.trend}
      />
      <StatCard
        label="Reply rate"
        value={
          <Derived align="right" lineage={rateAggregateLineage('Reply rate', kpis.replyRateByChannel)}>
            {replyRate.display}
          </Derived>
        }
        delta={replyRate.suppressed ? undefined : reply.delta}
        deltaLabel={!replyRate.suppressed && reply.delta !== undefined ? deltaLabel : undefined}
        trend={replyRate.suppressed ? undefined : reply.trend}
      />
    </div>
  );
}
