import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, RefreshCw, Sparkles, X } from 'lucide-react';
import { clsx } from 'clsx';
import { request } from '@/lib/apiClient';
import { fetchDealBoard, type BoardDeal } from '@/lib/api/bd';
import { BarChartH, ChartCard, StatCard } from '@/components/charts';
import { CardSkeleton, ChartSkeleton, EmptyState, TableSkeleton } from '@/components/shared';
import { GroupedColumnChart } from '@/components/deals/GroupedColumnChart';
import { PageTitle, Button } from '@/components/ui';
import { EntityChip } from '@/components/entity';

interface Bucket {
  key: string;
  won: number;
  lost: number;
  total: number;
  winRate: number;
  wonValueUsd: number;
}

interface WinLossData {
  overall: Bucket;
  byJurisdiction: Bucket[];
  byPackage: Bucket[];
  bySource: Bucket[];
  topLossReasons: Array<{ reason: string; count: number }>;
  narrative: string;
  usedLlm: boolean;
}

type Pool = 'all' | 'eu' | 'us';
type Period = 'all' | 'quarter' | 'month';

const PERIODS: Array<{ id: Period; label: string; days: number | null }> = [
  { id: 'all', label: 'All Time', days: null },
  { id: 'quarter', label: 'Last Quarter', days: 90 },
  { id: 'month', label: 'Last Month', days: 30 },
];

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function fmtUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** Close timestamp for a board deal: wonAt for wins, last update for losses. */
function closedAt(d: BoardDeal): number {
  const iso = d.stage === 'won' ? (d.wonAt ?? d.updatedAt) : d.updatedAt;
  return new Date(iso).getTime();
}

/** Group closed board deals into win/loss buckets by package type. */
function bucketsByPackage(deals: BoardDeal[]): Bucket[] {
  const map = new Map<string, { won: number; lost: number; wonValueUsd: number }>();
  for (const d of deals) {
    const key = d.packageType ?? 'unknown';
    const b = map.get(key) ?? { won: 0, lost: 0, wonValueUsd: 0 };
    if (d.stage === 'won') {
      b.won += 1;
      b.wonValueUsd += (d.packageValue ?? 0) / 100;
    } else {
      b.lost += 1;
    }
    map.set(key, b);
  }
  return [...map.entries()]
    .map(([key, b]) => {
      const total = b.won + b.lost;
      return { key, ...b, total, winRate: total > 0 ? b.won / total : 0 };
    })
    .sort((a, b) => b.won - a.won || b.lost - a.lost);
}

/**
 * Map a click inside a GroupedColumnChart wrapper back to its column index.
 * The chart draws in a fixed 480-wide viewBox with 40/8 left/right margins,
 * so the ratio math holds at any rendered width.
 */
function columnIndexFromClick(e: React.MouseEvent<HTMLElement>, count: number): number | null {
  const svg = e.currentTarget.querySelector('svg');
  if (!svg || count === 0) return null;
  const rect = svg.getBoundingClientRect();
  if (e.clientY < rect.top || e.clientY > rect.bottom) return null; // legend clicks don't drill
  const relX = ((e.clientX - rect.left) / rect.width) * 480;
  const ML = 40;
  const MR = 8;
  if (relX < ML || relX > 480 - MR) return null;
  const idx = Math.floor((relX - ML) / ((480 - ML - MR) / count));
  return idx >= 0 && idx < count ? idx : null;
}

/** Drill selection: which cohort of closed board deals to list inline. */
interface Drill {
  /** Human title for the panel. */
  label: string;
  /** packageType to match (null = any; 'unknown' matches deals without one). */
  packageKey: string | null;
  stage: 'all' | 'won' | 'lost';
}

/** Small "All time" tag for cards the API only exposes as lifetime aggregates. */
function AllTimeTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      title="The API aggregates this breakdown over all time; the period filter doesn't apply here."
      className="rounded-md border border-line/70 bg-ice-soft/50 px-1.5 py-0.5 text-micro font-semibold text-grey dark:bg-ice-soft/10"
    >
      All time
    </span>
  );
}

export function WinLoss() {
  const [data, setData] = useState<WinLossData | null>(null);
  const [boardDeals, setBoardDeals] = useState<BoardDeal[]>([]);
  const [pool, setPool] = useState<Pool>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [drill, setDrill] = useState<Drill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Board deals power the client-side time filter (the win/loss endpoint
      // has no date params). Best-effort: the page works without them.
      const [res, board] = await Promise.all([
        request<{ data: WinLossData }>(`/v1/ai/win-loss?pool=${pool}`),
        fetchDealBoard().catch(() => [] as BoardDeal[]),
      ]);
      setData(res.data);
      setBoardDeals(board);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load win/loss');
    } finally {
      setLoading(false);
    }
  }, [pool]);

  useEffect(() => {
    void load();
  }, [load]);

  // Client-side period stats from board deals (win/loss endpoint has no date
  // params). Board data has no region, so the period view always spans regions.
  const periodStats = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)?.days;
    if (days == null) return null;
    const cutoff = Date.now() - days * 86_400_000;
    const closed = boardDeals.filter(
      (d) => (d.stage === 'won' || d.stage === 'lost') && Number.isFinite(closedAt(d)) && closedAt(d) >= cutoff,
    );
    const won = closed.filter((d) => d.stage === 'won');
    const lost = closed.filter((d) => d.stage === 'lost');
    const total = won.length + lost.length;
    return {
      won: won.length,
      lost: lost.length,
      total,
      winRate: total > 0 ? won.length / total : 0,
      wonValueUsd: won.reduce((s, d) => s + (d.packageValue ?? 0), 0) / 100,
      byPackage: bucketsByPackage(closed),
    };
  }, [boardDeals, period]);

  const overall = periodStats ?? data?.overall ?? null;
  const packageBuckets = periodStats ? periodStats.byPackage : (data?.byPackage ?? []);
  const timeFiltered = period !== 'all';
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? '';

  // Inline cohort behind the clicked segment (client-side from the deal
  // board; respects the active period window).
  const drillDeals = useMemo(() => {
    if (!drill) return [];
    const days = PERIODS.find((p) => p.id === period)?.days;
    const cutoff = days != null ? Date.now() - days * 86_400_000 : null;
    return boardDeals
      .filter((d) => d.stage === 'won' || d.stage === 'lost')
      .filter((d) => (cutoff == null ? true : Number.isFinite(closedAt(d)) && closedAt(d) >= cutoff))
      .filter((d) => (drill.packageKey == null ? true : (d.packageType ?? 'unknown') === drill.packageKey))
      .filter((d) => (drill.stage === 'all' ? true : d.stage === drill.stage))
      .sort((a, b) => closedAt(b) - closedAt(a));
  }, [boardDeals, drill, period]);

  const isEmpty = !loading && !error && data !== null && data.overall.total === 0 && boardDeals.every((d) => d.stage !== 'won' && d.stage !== 'lost');

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <PageTitle
        icon={<BarChart3 size={20} />}
        subtitle="Closed-deal outcomes across regions, packages, and sources — click any figure to see the deals behind it"
        actions={
          <>
            <select
              value={pool}
              onChange={(e) => setPool(e.target.value as Pool)}
              disabled={timeFiltered}
              title={timeFiltered ? 'Region filter applies to all-time data only' : undefined}
              className="rounded-lg border border-line bg-card px-2 py-1.5 text-label text-navy disabled:opacity-50"
            >
              <option value="all">All regions</option>
              <option value="eu">EU</option>
              <option value="us">US</option>
            </select>
            <Button variant="secondary" size="xs" onClick={() => void load()}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} /> Refresh
            </Button>
          </>
        }
      >
        Win / Loss Analysis
      </PageTitle>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Time period">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPeriod(p.id);
              if (p.id !== 'all') setPool('all');
            }}
            title={p.days ? `Deals closed in the last ${p.days} days` : undefined}
            aria-pressed={period === p.id}
            className={`rounded-full px-3 py-1 text-label font-semibold transition-colors ${
              period === p.id
                ? 'bg-navy text-white dark:bg-ice dark:text-navy'
                : 'border border-line bg-card text-grey hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-label text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <CardSkeleton count={4} />
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-line/70 bg-card p-5 shadow-card">
                <ChartSkeleton height={180} />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-line/70 bg-card p-5 shadow-card">
            <TableSkeleton rows={4} cols={5} />
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-xl border border-line/70 bg-card shadow-card">
          <EmptyState
            icon={<BarChart3 size={28} className="text-grey" />}
            title="No closed deals yet"
            description="Win/loss analysis populates as deals on the board reach Won or Lost."
          />
        </div>
      )}

      {!error && data && !isEmpty && (
        <>
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Overall win rate"
              value={overall ? pct(overall.winRate) : '—'}
              deltaLabel={timeFiltered ? periodLabel : 'All time'}
              onClick={() => setDrill({ label: 'All closed deals', packageKey: null, stage: 'all' })}
            />
            <StatCard
              label="Deals won"
              value={String(overall?.won ?? 0)}
              deltaLabel={timeFiltered ? periodLabel : 'All time'}
              onClick={() => setDrill({ label: 'Deals won', packageKey: null, stage: 'won' })}
            />
            <StatCard
              label="Deals lost"
              value={String(overall?.lost ?? 0)}
              deltaLabel={timeFiltered ? periodLabel : 'All time'}
              onClick={() => setDrill({ label: 'Deals lost', packageKey: null, stage: 'lost' })}
            />
            <StatCard
              label="Revenue won"
              value={overall ? fmtUsd(overall.wonValueUsd) : '—'}
              deltaLabel={timeFiltered ? periodLabel : 'All time'}
              onClick={() => setDrill({ label: 'Deals won', packageKey: null, stage: 'won' })}
            />
          </div>

          {drill && (
            <ChartCard
              title={`Deals — ${drill.label}`}
              subtitle={`Client-side from the deal board (all regions)${timeFiltered ? ` · ${periodLabel.toLowerCase()}` : ''} · click a name to inspect`}
              action={
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1" role="group" aria-label="Stage filter">
                    {(['all', 'won', 'lost'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setDrill({ ...drill, stage: s })}
                        aria-pressed={drill.stage === s}
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-micro font-semibold capitalize transition-colors',
                          drill.stage === s
                            ? 'bg-navy text-white dark:bg-ice dark:text-navy'
                            : 'border border-line text-grey hover:bg-ice-soft/50 hover:text-navy dark:hover:bg-ice-soft/10',
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <Button variant="secondary" size="xs" onClick={() => setDrill(null)} className="text-grey" aria-label="Close deal list">
                    <X size={11} /> Close
                  </Button>
                </div>
              }
            >
              {drillDeals.length === 0 ? (
                <p className="py-6 text-center text-xs text-grey">No matching closed deals on the board.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-line text-left text-micro font-medium uppercase tracking-wide text-grey">
                        <th className="py-2.5 pl-2">Project</th>
                        <th className="py-2.5">Outcome</th>
                        <th className="py-2.5">Package</th>
                        <th className="py-2.5 text-right">Value</th>
                        <th className="py-2.5 pr-2 text-right">Closed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/50">
                      {drillDeals.map((d) => (
                        <tr key={d.id} className="hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10">
                          <td className="py-2.5 pl-2">
                            <EntityChip
                              type="decision"
                              id={d.id}
                              name={d.projectName}
                              seed={{ outcome: d.stage }}
                              stateLine={`${d.stage} · ${(d.packageType ?? 'unknown').replace(/_/g, ' ')}`}
                              vitals={[{ label: 'Value', value: fmtUsd((d.packageValue ?? 0) / 100) }]}
                              className="font-semibold"
                            />
                            {d.projectTicker && <span className="ml-1.5 font-mono text-micro text-grey">{d.projectTicker}</span>}
                          </td>
                          <td className="py-2.5">
                            <span
                              className={clsx(
                                'inline-flex items-center gap-1.5 rounded-md border border-line/70 px-1.5 py-0.5 text-micro font-semibold capitalize',
                                d.stage === 'won'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400',
                              )}
                            >
                              <span
                                className={clsx('h-1.5 w-1.5 rounded-full', d.stage === 'won' ? 'bg-emerald-500' : 'bg-red-500')}
                                aria-hidden="true"
                              />
                              {d.stage}
                            </span>
                          </td>
                          <td className="py-2.5 capitalize text-grey">{(d.packageType ?? 'unknown').replace(/_/g, ' ')}</td>
                          <td className="num-tabular py-2.5 text-right font-mono text-navy">{fmtUsd((d.packageValue ?? 0) / 100)}</td>
                          <td className="num-tabular py-2.5 pr-2 text-right text-grey">
                            {new Date(d.stage === 'won' ? (d.wonAt ?? d.updatedAt) : d.updatedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          )}

          <ChartCard
            title="Insights"
            subtitle="Generated from your win/loss data"
            action={
              <div className="flex items-center gap-2">
                {data.usedLlm && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-line/70 bg-ice-soft/50 px-1.5 py-0.5 text-micro font-semibold text-navy dark:bg-ice-soft/10">
                    <Sparkles size={9} /> LLM
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setInsightsOpen((o) => !o)}
                  aria-expanded={insightsOpen}
                  className="text-grey"
                >
                  {insightsOpen ? 'Hide' : 'Show'}
                  <ChevronDown size={12} className={`transition-transform ${insightsOpen ? 'rotate-180' : ''}`} />
                </Button>
              </div>
            }
          >
            {insightsOpen && (
              <div className="space-y-3">
                <p className="text-body leading-relaxed text-navy">{data.narrative}</p>
                <div className="flex flex-wrap gap-2 text-label">
                  <span className="num-tabular rounded-md border border-line/70 bg-ice-soft/50 px-2 py-1 font-mono text-navy dark:bg-ice-soft/10">
                    Overall {pct(data.overall.winRate)} · {data.overall.won}W / {data.overall.lost}L
                  </span>
                  <span className="num-tabular rounded-md border border-line/70 bg-ice-soft/50 px-2 py-1 font-mono text-navy dark:bg-ice-soft/10">
                    Won value {fmtUsd(data.overall.wonValueUsd)}
                  </span>
                  {data.topLossReasons[0] && (
                    <span className="rounded-md border border-line/70 bg-ice-soft/50 px-2 py-1 font-mono text-navy dark:bg-ice-soft/10">
                      Top loss reason: {data.topLossReasons[0].reason}
                    </span>
                  )}
                </div>
              </div>
            )}
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard
              title="Win vs loss by jurisdiction"
              subtitle="Closed deals split by project jurisdiction"
              action={<AllTimeTag show={timeFiltered} />}
            >
              {data.byJurisdiction.length === 0 ? (
                <EmptyState title="No closed deals" description="Jurisdiction breakdown appears once deals close." />
              ) : (
                <GroupedColumnChart
                  data={data.byJurisdiction.map((b) => ({ label: b.key, values: [b.won, b.lost] }))}
                  series={['Won', 'Lost']}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Win vs loss by package type"
              subtitle={`${timeFiltered ? `Deals closed — ${periodLabel.toLowerCase()}` : 'Closed deals split by package'} · click a column to list its deals`}
            >
              {packageBuckets.length === 0 ? (
                <EmptyState title="No closed deals" description={timeFiltered ? 'No deals closed in this period.' : 'Package breakdown appears once deals close.'} />
              ) : (
                <div
                  className="cursor-pointer"
                  onClick={(e) => {
                    const idx = columnIndexFromClick(e, packageBuckets.length);
                    if (idx == null) return;
                    const b = packageBuckets[idx];
                    setDrill({ label: `Package — ${b.key}`, packageKey: b.key, stage: 'all' });
                  }}
                >
                  <GroupedColumnChart
                    data={packageBuckets.map((b) => ({ label: b.key, values: [b.won, b.lost] }))}
                    series={['Won', 'Lost']}
                  />
                </div>
              )}
            </ChartCard>

            <ChartCard title="Top loss reasons" subtitle="Most common reasons deals were lost" action={<AllTimeTag show={timeFiltered} />}>
              {data.topLossReasons.length === 0 ? (
                <EmptyState title="No losses recorded" description="Loss reasons appear when a deal is marked lost." />
              ) : (
                <BarChartH data={data.topLossReasons.map((l) => ({ label: l.reason, value: l.count }))} maxBars={8} />
              )}
            </ChartCard>

            <section className="rounded-xl border border-line/70 bg-card p-5 shadow-card">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-navy">By source</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-grey">Lead source performance</p>
                </div>
                <AllTimeTag show={timeFiltered} />
              </div>
              {data.bySource.length === 0 ? (
                <EmptyState title="No closed deals" description="Source performance appears once deals close." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line text-left text-micro font-medium uppercase tracking-wide text-grey">
                        <th className="py-2.5 pl-2">Source</th>
                        <th className="py-2.5 text-right">Won</th>
                        <th className="py-2.5 text-right">Lost</th>
                        <th className="py-2.5 text-right">Win rate</th>
                        <th className="py-2.5 pr-2 text-right">Won value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/50">
                      {data.bySource.map((r) => (
                        <tr key={r.key} className="hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10">
                          <td className="py-2.5 pl-2 font-semibold text-navy">{r.key}</td>
                          <td className="num-tabular py-2.5 text-right font-mono text-navy">{r.won}</td>
                          <td className="num-tabular py-2.5 text-right font-mono text-grey">{r.lost}</td>
                          <td className="num-tabular py-2.5 text-right font-mono font-semibold text-navy">{pct(r.winRate)}</td>
                          <td className="num-tabular py-2.5 pr-2 text-right font-mono text-navy">{fmtUsd(r.wonValueUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
