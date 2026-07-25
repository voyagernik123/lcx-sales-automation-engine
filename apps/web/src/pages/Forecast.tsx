import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, Activity, Trophy, Rocket, AlertTriangle } from 'lucide-react';
import { fetchForecast, type Forecast as ForecastData } from '@/lib/api/intel';
import { fetchDealBoard, type BoardDeal } from '@/lib/api/bd';
import { computeDealHealthSet, computeTrackRecord, computePipelinePulse, type DealHealth } from '@/lib/salesIntel';
import { EmptyState, CardSkeleton } from '@/components/shared';
import { Button, PageTitle } from '@/components/ui';
import { EntityChip } from '@/components/entity';
import { formatMoney } from '@/lib/format';

/**
 * Forecasting cockpit (Wave 4b) — surfaces the buried RevOps math: the Monte
 * Carlo pipeline distribution (P10/P50/P90), per-deal win probability, called-
 * vs-landed by package, a see-the-math deal-health ranking, and post-listing
 * expansion. All computed already (kpis/forecast + salesIntel) — here it's read.
 */

const BAND_STYLE: Record<string, string> = {
  high: 'text-emerald-600 dark:text-emerald-400', fair: 'text-cyan-700 dark:text-cyan-400', low: 'text-grey',
};
const MOMENTUM_STYLE: Record<string, string> = {
  accelerating: 'text-emerald-600 dark:text-emerald-400', steady: 'text-grey',
  cooling: 'text-amber-600 dark:text-amber-400', cold: 'text-red-600 dark:text-red-400',
};

/** Deterministic expansion angle for a won listing. */
function upsellFor(pkg: string | null): string {
  switch (pkg) {
    case 'listing': return 'Add market-making + a launch marketing package';
    case 'marketing': return 'Cross-sell liquidity / market-making';
    case 'liquidity': return 'Add a marketing burst + staking integration';
    case 'emt': return 'Expand to a full dual-market listing';
    case 'dual': return 'Layer staking + ecosystem co-marketing';
    default: return 'Review for marketing, liquidity and staking expansion';
  }
}

export function Forecast() {
  const [fc, setFc] = useState<ForecastData | null>(null);
  const [deals, setDeals] = useState<BoardDeal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setFc(null);
    setDeals(null);
    fetchForecast().then(setFc).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load forecast'));
    fetchDealBoard().then(setDeals).catch(() => setDeals([]));
  }, []);
  useEffect(load, [load]);

  const loading = fc === null || deals === null;
  const health: Map<string, DealHealth> = deals ? computeDealHealthSet(deals) : new Map();
  const track = deals ? computeTrackRecord(deals) : { byPackage: {} };
  const pulse = deals ? computePipelinePulse(deals, health) : null;

  const trackRows = Object.entries(track.byPackage);
  const totalWon = trackRows.reduce((s, [, r]) => s + r.won, 0);
  const totalLost = trackRows.reduce((s, [, r]) => s + r.lost, 0);
  const overallWin = totalWon + totalLost > 0 ? Math.round((totalWon / (totalWon + totalLost)) * 100) : null;

  const wonDeals = (deals ?? []).filter((d) => d.stage === 'won');

  // Open deals ranked by expected value (value × win prob).
  const ranked = fc
    ? [...fc.deals].sort((a, b) => b.value * b.winProbability - a.value * a.winProbability)
    : [];

  return (
    <div className="p-5">
      <PageTitle
        icon={<TrendingUp size={20} />}
        subtitle="The pipeline forecast, deal-by-deal win probability, and track record — see the math."
        actions={<Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>}
      >
        Forecast
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Forecast unavailable" description={error} />
      ) : loading ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="space-y-4">
          {/* Distribution hero */}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Activity size={12} /> This-quarter pipeline forecast · {fc!.runs.toLocaleString()} Monte Carlo runs
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Band label="Conservative (P10)" value={formatMoney(fc!.p10)} />
              <Band label="Likely (P50)" value={formatMoney(fc!.p50)} accent />
              <Band label="Optimistic (P90)" value={formatMoney(fc!.p90)} />
              <Band label="Expected value" value={formatMoney(fc!.expected)} />
            </div>
            {/* Range bar */}
            <div className="mt-4">
              <div className="relative h-2 rounded-full bg-line">
                <div
                  className="absolute h-full rounded-full bg-cyan-500/40"
                  style={{ left: '0%', right: '0%' }}
                />
                <div
                  className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded bg-cyan-600 dark:bg-cyan-400"
                  style={{ left: `${fc!.p90 > fc!.p10 ? ((fc!.p50 - fc!.p10) / (fc!.p90 - fc!.p10)) * 100 : 50}%` }}
                  title={`P50 ${formatMoney(fc!.p50)}`}
                />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-grey">
                <span>{formatMoney(fc!.p10)}</span>
                <span>P50 · {formatMoney(fc!.p50)}</span>
                <span>{formatMoney(fc!.p90)}</span>
              </div>
            </div>
          </div>

          {/* Pulse + called-vs-landed */}
          <div className="grid gap-4 lg:grid-cols-2">
            {pulse && (
              <div className="rounded-lg border border-line bg-card p-4 shadow-card">
                <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">Pipeline pulse</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Open deals" value={String(pulse.openCount)} />
                  <Stat label="Open value" value={formatMoney(Math.round(pulse.openValue / 100))} />
                  <Stat label="Accelerating" value={String(pulse.accelerating)} tone="good" />
                  <Stat label="Cooling / cold" value={String(pulse.cooling + pulse.cold)} tone={pulse.cooling + pulse.cold > 0 ? 'warn' : undefined} />
                </div>
              </div>
            )}
            <div className="rounded-lg border border-line bg-card p-4 shadow-card">
              <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
                <Trophy size={12} /> Called vs landed{overallWin != null ? ` · ${overallWin}% win rate` : ''}
              </div>
              {trackRows.length === 0 ? (
                <p className="text-micro text-grey">No closed deals yet.</p>
              ) : (
                <div className="space-y-1">
                  {trackRows.map(([pkg, r]) => {
                    const rate = r.won + r.lost > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : 0;
                    return (
                      <div key={pkg} className="flex items-center gap-2 text-label">
                        <span className="w-20 shrink-0 capitalize text-navy">{pkg}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                          <span className="block h-full bg-emerald-500" style={{ width: `${rate}%` }} />
                        </span>
                        <span className="num-tabular w-24 shrink-0 text-right text-grey">{r.won}W / {r.lost}L · {rate}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Deal health — see the math */}
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5 text-micro font-bold uppercase tracking-wider text-grey">
              <AlertTriangle size={12} /> Open deals — win probability &amp; health
            </div>
            {ranked.length === 0 ? (
              <p className="p-4 text-micro text-grey">No open deals.</p>
            ) : (
              <table className="w-full min-w-[680px] text-label">
                <thead>
                  <tr className="border-b border-line text-micro font-bold uppercase tracking-wider text-grey">
                    <th className="px-4 py-2 text-left">Deal</th>
                    <th className="px-3 py-2 text-left">Stage</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2 text-right">Win %</th>
                    <th className="px-3 py-2 text-right">Expected</th>
                    <th className="px-3 py-2 text-left">Momentum</th>
                    <th className="px-3 py-2 text-right">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((d) => {
                    const h = health.get(d.id);
                    // winProbability is already 0–100 from the API.
                    const expected = Math.round((d.value * d.winProbability) / 100);
                    return (
                      <tr key={d.id} className="border-b border-line/60 last:border-b-0">
                        <td className="px-4 py-2 font-semibold text-navy">{d.projectName}</td>
                        <td className="px-3 py-2 font-mono text-micro uppercase text-grey">{d.stage}</td>
                        <td className="num-tabular px-3 py-2 text-right text-navy">{formatMoney(d.value)}</td>
                        <td className={`num-tabular px-3 py-2 text-right font-semibold ${h ? BAND_STYLE[h.likelihood.band] : ''}`}>
                          {Math.round(d.winProbability)}%
                        </td>
                        <td className="num-tabular px-3 py-2 text-right font-semibold text-navy">{formatMoney(expected)}</td>
                        <td className={`px-3 py-2 ${h ? MOMENTUM_STYLE[h.momentum] : 'text-grey'}`}>{h?.momentum ?? '—'}</td>
                        <td className="num-tabular px-3 py-2 text-right text-grey">
                          {h && h.warnings.length > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400" title={h.warnings.map((w) => w.label).join(', ')}>
                              {h.warnings.length}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Post-listing / expansion */}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Rocket size={12} className="text-cyan-500" /> Post-listing &amp; expansion
            </div>
            {wonDeals.length === 0 ? (
              <p className="text-micro text-grey">No listed deals yet — expansion plays unlock after the first win.</p>
            ) : (
              <div className="space-y-1">
                {wonDeals.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 py-1 text-label">
                    <EntityChip type="project" id={d.projectId} name={d.projectName} />
                    <span className="font-mono text-micro uppercase text-emerald-600 dark:text-emerald-400">{d.packageType ?? 'listing'}</span>
                    <span className="ml-auto truncate text-grey">{upsellFor(d.packageType)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Band({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-[9px] font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className={`num-tabular mt-0.5 text-lg font-bold ${accent ? 'text-cyan-700 dark:text-cyan-300' : 'text-navy'}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-lg border border-line p-2 text-center">
      <div className="text-[9px] font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className={`num-tabular text-base font-bold ${tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-navy'}`}>{value}</div>
    </div>
  );
}

export default Forecast;
