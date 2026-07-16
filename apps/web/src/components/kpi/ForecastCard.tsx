import { BarChartH, ChartCard } from '@/components/charts';
import type { ForecastData } from '@/lib/api/kpi';

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`;

/** Monte Carlo pipeline forecast: P10/P50/P90/expected bands + top open deals. */
export function ForecastCard({ forecast }: { forecast: ForecastData }) {
  const bands = [
    { label: 'P10 conservative', value: forecast.p10 },
    { label: 'P50 median', value: forecast.p50 },
    { label: 'P90 upside', value: forecast.p90 },
    { label: 'Expected', value: forecast.expected },
  ];

  return (
    <ChartCard
      title="Pipeline forecast"
      subtitle={`${forecast.runs.toLocaleString()} Monte Carlo simulations over open deals`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {bands.map((b) => (
          <div key={b.label} className="rounded-lg border border-line/70 p-2.5 text-center">
            <div className="text-micro font-medium uppercase tracking-wide text-grey">{b.label}</div>
            <div className="num-tabular mt-0.5 text-base font-semibold text-navy">{fmtUsd(b.value)}</div>
          </div>
        ))}
      </div>
      {forecast.deals.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-grey">Win probability — top open deals</div>
          <BarChartH
            data={forecast.deals.map((d) => ({ label: d.projectName, value: d.winProbability }))}
            maxBars={8}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      )}
    </ChartCard>
  );
}
