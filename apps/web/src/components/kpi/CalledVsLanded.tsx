import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { fetchForecastHistory, type ForecastHistoryPoint } from '@/lib/api/kpi';
import type { KpiSnapshot } from '@/lib/api/bd';
import { ChartCard, ControlBand, type ControlBandPoint } from '@/components/charts';
import { ChartSkeleton, EmptyState } from '@/components/shared';

const fmtUsdCompact = (v: number) =>
  `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, v))}`;

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * Called-vs-landed (plan 4.2): daily forecast snapshots drawn as a P10–P90
 * control band with the expected line, overlaid with the revenue that
 * actually landed. Honest labels — the KPI snapshots expose only *cumulative*
 * closed-won revenue, so the overlay is "closed-won to date", not a
 * same-window comparison; forecast history starts empty until the daily
 * snapshot job has run.
 */
export function CalledVsLanded({ snapshots }: { snapshots: KpiSnapshot[] }) {
  // undefined = loading, null = failed
  const [history, setHistory] = useState<ForecastHistoryPoint[] | null | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    fetchForecastHistory(90, controller.signal)
      .then((h) => setHistory(h))
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setHistory(null);
      });
    return () => controller.abort();
  }, []);

  const revenueByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of snapshots) m.set(s.date, s.totalRevenue / 100); // cents → dollars
    return m;
  }, [snapshots]);

  const points: ControlBandPoint[] = useMemo(
    () =>
      (history ?? []).map((h) => ({
        x: h.date,
        lo: h.p10,
        hi: h.p90,
        mid: h.expected,
        actual: revenueByDate.get(h.date) ?? null,
      })),
    [history, revenueByDate],
  );

  const hasActual = points.some((p) => p.actual != null);

  /* Days the simulation refused. They stay in `points` with null bands, so the chart
     leaves a visible hole rather than dropping them and quietly compressing the axis —
     but a hole with no caption reads as missing data, and this is not missing data. It is
     a recorded refusal with a code, so it gets named. */
  const refusedDays = (history ?? []).filter((h) => h.p50 == null);

  return (
    <ChartCard
      title="Called vs landed"
      subtitle="Daily forecast snapshots (P10–P90 band + expected) against closed-won revenue to date"
    >
      {history === undefined ? (
        <ChartSkeleton height={190} />
      ) : history === null ? (
        <p className="py-8 text-center text-xs text-grey">Forecast history unavailable</p>
      ) : points.length === 0 ? (
        <EmptyState
          icon={<History size={24} className="text-grey" />}
          title="Collecting history — snapshots record daily"
          description="The daily KPI snapshot job stores each day's forecast band; the called-vs-landed record builds from there."
        />
      ) : (
        <>
          <ControlBand
            data={points}
            height={190}
            formatValue={fmtUsdCompact}
            formatX={fmtDate}
            bandLabel="P10–P90 called"
            midLabel="Expected (called)"
            actualLabel="Closed-won to date (landed)"
          />
          {refusedDays.length > 0 && (
            <p className="mt-1.5 text-micro text-amber" data-testid="forecast-history-refusals">
              {refusedDays.length === 1 ? '1 day is' : `${refusedDays.length} days are`} missing from
              the band because the simulation could not price the open book that day — not because
              the quarter was forecast at nothing.{' '}
              {refusedDays[0]?.distributionRefusal?.rule ??
                refusedDays[0]?.distributionRefusal?.code ??
                'The stored snapshot carries the refusal without a stated rule.'}
            </p>
          )}
          <p className="mt-1.5 text-micro text-grey">
            {hasActual
              ? 'Honest caveat: "landed" is cumulative lifetime closed-won revenue from the same daily snapshots — the forecast band covers open pipeline, so compare shapes, not levels.'
              : 'KPI snapshots carry no matching revenue readings yet — the landed overlay appears as both series accumulate.'}
          </p>
        </>
      )}
    </ChartCard>
  );
}
