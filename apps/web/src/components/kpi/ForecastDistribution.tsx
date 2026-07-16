import { useMemo, useState } from 'react';
import { ChevronDown, Sigma } from 'lucide-react';
import { clsx } from 'clsx';
import type { ForecastData } from '@/lib/api/kpi';
import { ChartCard, Histogram, type HistogramMarker, type HistogramSeries } from '@/components/charts';
import { applyScenarioToValue, applyScenarioToWinProb, useInspect, useScenarioActive } from '@/stores';
import { SimPill, useScenario } from '@/components/deals/ScenarioControls';
import { STAGE_LABELS } from '@/types/kpi';
import { binTotals, simulateTotals } from './forecastSim';

const RUNS = 10_000;
const BINS = 28;
/** Cyan = the app-wide simulation/projection accent. */
const SIM_TEXT = 'text-cyan-600 dark:text-cyan-400';

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtUsdCompact = (v: number) =>
  `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, v))}`;

/**
 * The Monte Carlo forecast as a distribution instrument (plan item 0.6/4.1):
 * histogram of 10,000 simulated quarter outcomes with P10/P50/P90 markers, a
 * "See the math" disclosure whose per-deal rows open the deal inspector, and
 * a scenario overlay — when any assumption dial is off baseline the deals are
 * re-simulated with adjusted win probabilities/values and drawn in cyan.
 */
export function ForecastDistribution({ forecast }: { forecast: ForecastData }) {
  const inspect = useInspect();
  const scenario = useScenario();
  const simActive = useScenarioActive();
  const [mathOpen, setMathOpen] = useState(false);

  const baseDeals = useMemo(
    () => forecast.deals.map((d) => ({ p: d.winProbability / 100, value: d.value })),
    [forecast.deals],
  );
  const scnDeals = useMemo(
    () =>
      simActive
        ? forecast.deals.map((d) => ({
            p: applyScenarioToWinProb(d.winProbability, scenario) / 100,
            // applyScenarioToValue is unit-agnostic multiplication; values here are dollars.
            value: applyScenarioToValue(d.value, scenario),
          }))
        : null,
    [forecast.deals, scenario, simActive],
  );

  const baseSim = useMemo(() => simulateTotals(baseDeals, { runs: RUNS, seed: 42 }), [baseDeals]);
  const scnSim = useMemo(
    () => (scnDeals ? simulateTotals(scnDeals, { runs: RUNS, seed: 42 }) : null),
    [scnDeals],
  );

  const domainMax = Math.max(
    1,
    baseSim.totals[baseSim.totals.length - 1] ?? 0,
    scnSim ? scnSim.totals[scnSim.totals.length - 1] ?? 0 : 0,
  );
  const domain: [number, number] = [0, domainMax];

  const series: HistogramSeries[] = [
    { label: 'Baseline', counts: binTotals(baseSim.totals, domain, BINS) },
  ];
  if (scnSim) {
    series.push({
      label: 'Scenario',
      counts: binTotals(scnSim.totals, domain, BINS),
      className: 'text-cyan-500 dark:text-cyan-400',
    });
  }

  const view = scnSim ?? baseSim;
  const markers: HistogramMarker[] = [
    { label: 'P10', value: view.p10 },
    { label: 'P50', value: view.p50 },
    { label: 'P90', value: view.p90 },
  ].map((m) => ({ ...m, className: scnSim ? SIM_TEXT : 'text-navy' }));

  const bands: { label: string; base: number; scn: number | null }[] = [
    { label: 'P10 conservative', base: baseSim.p10, scn: scnSim?.p10 ?? null },
    { label: 'P50 median', base: baseSim.p50, scn: scnSim?.p50 ?? null },
    { label: 'P90 upside', base: baseSim.p90, scn: scnSim?.p90 ?? null },
    { label: 'Expected', base: baseSim.expected, scn: scnSim?.expected ?? null },
  ];

  return (
    <ChartCard
      title="Pipeline forecast — distribution"
      subtitle={`${RUNS.toLocaleString()} Monte Carlo simulations over ${forecast.deals.length} open deals, re-run client-side (seeded, reproducible)`}
      action={<SimPill />}
    >
      {forecast.deals.length === 0 ? (
        <p className="py-8 text-center text-xs text-grey">No open deals to simulate</p>
      ) : (
        <>
          {/* percentile tiles — scenario-adjusted in cyan, baseline kept visible */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {bands.map((b) => (
              <div key={b.label} className="rounded-lg border border-line p-2 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wide text-grey">{b.label}</div>
                {b.scn != null ? (
                  <div className="mt-0.5">
                    <span className={clsx('block text-sm font-semibold', SIM_TEXT)} title="Scenario-adjusted">
                      {fmtUsd(b.scn)}
                    </span>
                    <span className="block text-[9px] text-grey line-through" title="Baseline">
                      {fmtUsd(b.base)}
                    </span>
                  </div>
                ) : (
                  <div className="mt-0.5 text-sm font-semibold text-navy">{fmtUsd(b.base)}</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3">
            <Histogram
              domain={domain}
              series={series}
              markers={markers}
              height={160}
              formatX={fmtUsdCompact}
              formatCount={(v) => `${Math.round(v)}`}
            />
            <p className="mt-1 text-[10px] text-grey">
              X: simulated quarter revenue · Y: runs per bucket · markers show {scnSim ? 'scenario' : 'baseline'} percentiles
            </p>
          </div>

          {/* See the math — every number's "why" */}
          <div className="mt-3 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => setMathOpen((o) => !o)}
              aria-expanded={mathOpen}
              className="flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-cyan-600 dark:hover:text-cyan-400"
            >
              <Sigma size={12} aria-hidden="true" />
              See the math
              <ChevronDown size={12} className={clsx('transition-transform', mathOpen && 'rotate-180')} aria-hidden="true" />
            </button>

            {mathOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] leading-relaxed text-grey">
                  Expected = Σ winProbability × value over open deals. The distribution draws each deal as an
                  independent Bernoulli(winProbability) event {RUNS.toLocaleString()} times (mulberry32 PRNG, seed 42 — same
                  engine as the API) and sums the values that close.
                  {scnSim && (
                    <span className={SIM_TEXT}>
                      {' '}Scenario applies close-rate {scenario.closeRateDelta >= 0 ? '+' : ''}
                      {Math.round(scenario.closeRateDelta * 100)}% and value {Math.round(scenario.valueDelta * 100)}% to every deal before re-simulating.
                    </span>
                  )}
                </p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-grey">
                        <th className="px-2 py-1.5">Deal</th>
                        <th className="px-2 py-1.5">Stage</th>
                        <th className="px-2 py-1.5 text-right">Win prob</th>
                        <th className="px-2 py-1.5 text-right">Value</th>
                        <th className="px-2 py-1.5 text-right">Expected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/50">
                      {forecast.deals.map((d) => {
                        const adjP = scnSim ? applyScenarioToWinProb(d.winProbability, scenario) : d.winProbability;
                        const adjV = scnSim ? applyScenarioToValue(d.value, scenario) : d.value;
                        return (
                          <tr key={d.id} className="hover:bg-ice-soft dark:hover:bg-ice-soft/5">
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => inspect('deal', d.id)}
                                className="font-medium text-navy underline-offset-2 hover:underline"
                                title="Open deal inspector"
                              >
                                {d.projectName}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-grey">{STAGE_LABELS[d.stage] ?? d.stage}</td>
                            <td className={clsx('px-2 py-1.5 text-right font-mono', scnSim ? SIM_TEXT : 'text-navy')}>
                              {Math.round(adjP)}%
                            </td>
                            <td className={clsx('px-2 py-1.5 text-right font-mono', scnSim ? SIM_TEXT : 'text-navy')}>
                              {fmtUsd(adjV)}
                            </td>
                            <td className={clsx('px-2 py-1.5 text-right font-mono font-bold', scnSim ? SIM_TEXT : 'text-navy')}>
                              {fmtUsd((adjP / 100) * adjV)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line">
                        <td colSpan={4} className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-grey">
                          Σ expected
                        </td>
                        <td className={clsx('px-2 py-1.5 text-right font-mono font-bold', scnSim ? SIM_TEXT : 'text-navy')}>
                          {fmtUsd(view.expected)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </ChartCard>
  );
}
