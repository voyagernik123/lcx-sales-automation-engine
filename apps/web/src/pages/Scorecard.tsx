import { useCallback, useEffect, useState } from 'react';
import { Gauge, RefreshCw, Trophy, Activity, Database, BrainCircuit } from 'lucide-react';
import { fetchScorecard, fetchCalibration, type Scorecard as SC, type MetricCalibration } from '@/lib/api/intel';
import { EmptyState, CardSkeleton } from '@/components/shared';
import { Button, PageTitle } from '@/components/ui';
import { formatMoney } from '@/lib/format';

/**
 * Scorecard (Wave 6) — the platform measuring itself. The North Star (listings
 * won), the funnel that produces it, and whether the intelligence feeding it is
 * any good: data coverage + calibration (does conviction actually predict wins?).
 * Snapshotted over time so we can watch the models sharpen — the flywheel made
 * visible.
 */

const VERDICT_STYLE: Record<string, string> = {
  predictive: 'text-emerald-600 dark:text-emerald-400',
  weak: 'text-amber-600 dark:text-amber-400',
  insufficient: 'text-grey',
};
const METRIC_LABEL: Record<string, string> = {
  conviction: 'Conviction', listing_propensity: 'Propensity', winnability: 'Winnability', timing_window: 'Timing',
  tvl_usd: 'TVL', github_commits_30d: 'Dev velocity', market_cap_usd: 'Market cap', priority_score: 'Priority',
};

export function Scorecard() {
  const [sc, setSc] = useState<SC | null>(null);
  const [calib, setCalib] = useState<MetricCalibration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setSc(null);
    setCalib(null);
    fetchScorecard().then(setSc).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    fetchCalibration().then((d) => setCalib(d.latest)).catch(() => setCalib([]));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="p-5">
      <PageTitle
        icon={<Gauge size={20} />}
        subtitle="The platform, measured against itself — the North Star, the funnel, and whether the intelligence predicts wins."
        actions={<Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>}
      >
        Scorecard
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Scorecard unavailable" description={error} />
      ) : !sc ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="space-y-4">
          {/* North Star */}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Trophy size={12} className="text-emerald-500" /> North Star · Listings won
            </div>
            <div className="flex items-end gap-6">
              <div>
                <div className="num-tabular text-4xl font-bold text-navy">{sc.northStar.totalWon}</div>
                <div className="text-micro text-grey">total listings won</div>
              </div>
              <div>
                <div className="num-tabular text-2xl font-bold text-cyan-700 dark:text-cyan-300">{sc.northStar.wonLast90d}</div>
                <div className="text-micro text-grey">last 90 days</div>
              </div>
            </div>
          </div>

          {/* Funnel */}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Activity size={12} /> Funnel
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Open deals" value={String(sc.funnel.openDeals)} />
              <Stat label="Open value" value={formatMoney(sc.funnel.openValueUsd)} />
              <Stat label="Win rate" value={sc.funnel.winRatePct != null ? `${sc.funnel.winRatePct}%` : '—'} accent />
              <Stat label="Avg cycle" value={sc.funnel.avgCycleDays != null ? `${sc.funnel.avgCycleDays}d` : '—'} />
            </div>
          </div>

          {/* Intelligence quality */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line bg-card p-4 shadow-card">
              <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
                <Database size={12} /> Data coverage
              </div>
              <div className="mb-2 text-label text-grey">
                <span className="font-semibold text-navy">{sc.intelligence.observations.toLocaleString()}</span> observations ·{' '}
                <span className="font-semibold text-navy">{sc.intelligence.scoredProjects.toLocaleString()}</span> scored projects
              </div>
              <div className="space-y-1.5">
                {sc.intelligence.coverage.map((c) => (
                  <div key={c.source} className="flex items-center gap-2 text-label">
                    <span className="w-24 shrink-0 text-navy">{c.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <span className="block h-full bg-cyan-500" style={{ width: `${Math.min(100, c.pct)}%` }} />
                    </span>
                    <span className="num-tabular w-20 shrink-0 text-right text-grey">{c.okCount.toLocaleString()} · {c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-card p-4 shadow-card">
              <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
                <BrainCircuit size={12} /> Does the alpha predict wins?
              </div>
              {calib === null ? (
                <p className="text-micro text-grey">Loading…</p>
              ) : calib.length === 0 ? (
                <p className="text-micro text-grey">No calibration yet — run the alpha/calibrate job.</p>
              ) : (
                <table className="w-full text-label">
                  <thead>
                    <tr className="text-micro font-bold uppercase tracking-wider text-grey">
                      <th className="py-1 text-left">Metric</th>
                      <th className="py-1 text-right">Lift</th>
                      <th className="py-1 text-right">Top-20% capture</th>
                      <th className="py-1 text-right">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calib.map((m) => (
                      <tr key={m.metricKey} className="border-t border-line/50">
                        <td className="py-1 text-navy">{METRIC_LABEL[m.metricKey] ?? m.metricKey}</td>
                        <td className="num-tabular py-1 text-right font-semibold text-navy">{m.lift != null ? `${m.lift}×` : '—'}</td>
                        <td className="num-tabular py-1 text-right text-grey">{m.quintileCapture != null ? `${Math.round(m.quintileCapture * 100)}%` : '—'}</td>
                        <td className={`py-1 text-right font-mono text-[10px] uppercase ${VERDICT_STYLE[m.verdict]}`}>{m.verdict}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-[10px] leading-snug text-grey/80">
                Lift = won-deal median ÷ universe median. Directional at this sample size; the loop sharpens weights as more deals close.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-2 text-center">
      <div className="text-[9px] font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className={`num-tabular text-base font-bold ${accent ? 'text-cyan-700 dark:text-cyan-300' : 'text-navy'}`}>{value}</div>
    </div>
  );
}

export default Scorecard;
