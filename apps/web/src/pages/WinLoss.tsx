import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { fetchDealBoard, type BoardDeal } from '@/lib/api/bd';
import { BarChartH, ChartCard, StatCard } from '@/components/charts';
import { CardSkeleton, ChartSkeleton, EmptyState, TableSkeleton } from '@/components/shared';
import { GroupedColumnChart } from '@/components/deals/GroupedColumnChart';

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

/** Small "All time" tag for cards the API only exposes as lifetime aggregates. */
function AllTimeTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      title="The API aggregates this breakdown over all time; the period filter doesn't apply here."
      className="rounded bg-ice-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-grey dark:bg-ice-soft/10"
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

  const isEmpty = !loading && !error && data !== null && data.overall.total === 0 && boardDeals.every((d) => d.stage !== 'won' && d.stage !== 'lost');

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-bold text-navy">
          <BarChart3 size={18} /> Win / Loss Analysis
        </h1>
        <div className="flex items-center gap-2 text-[11px]">
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value as Pool)}
            disabled={timeFiltered}
            title={timeFiltered ? 'Region filter applies to all-time data only' : undefined}
            className="rounded-lg border border-line bg-card px-2 py-1.5 text-navy disabled:opacity-50"
          >
            <option value="all">All regions</option>
            <option value="eu">EU</option>
            <option value="us">US</option>
          </select>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 font-semibold text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} /> Refresh
          </button>
        </div>
      </div>

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
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              period === p.id
                ? 'bg-navy text-white dark:bg-ice dark:text-navy'
                : 'border border-line bg-card text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <CardSkeleton count={4} />
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-line bg-card p-4">
                <ChartSkeleton height={180} />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-card p-4">
            <TableSkeleton rows={4} cols={5} />
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState
            icon={<BarChart3 size={28} className="text-grey" />}
            title="No closed deals yet"
            description="Win/loss analysis populates as deals on the board reach Won or Lost."
          />
        </div>
      )}

      {!error && data && !isEmpty && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Overall win rate" value={overall ? pct(overall.winRate) : '—'} deltaLabel={timeFiltered ? periodLabel : 'All time'} />
            <StatCard label="Deals won" value={String(overall?.won ?? 0)} deltaLabel={timeFiltered ? periodLabel : 'All time'} />
            <StatCard label="Deals lost" value={String(overall?.lost ?? 0)} deltaLabel={timeFiltered ? periodLabel : 'All time'} />
            <StatCard label="Revenue won" value={overall ? fmtUsd(overall.wonValueUsd) : '—'} deltaLabel={timeFiltered ? periodLabel : 'All time'} />
          </div>

          <ChartCard
            title="Insights"
            subtitle="Generated from your win/loss data"
            action={
              <div className="flex items-center gap-2">
                {data.usedLlm && (
                  <span className="inline-flex items-center gap-1 rounded bg-ice-soft px-1.5 py-0.5 text-[9px] font-bold text-navy dark:bg-ice-soft/10">
                    <Sparkles size={9} /> LLM
                  </span>
                )}
                <button
                  onClick={() => setInsightsOpen((o) => !o)}
                  aria-expanded={insightsOpen}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10"
                >
                  {insightsOpen ? 'Hide' : 'Show'}
                  <ChevronDown size={12} className={`transition-transform ${insightsOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            }
          >
            {insightsOpen && (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-navy">{data.narrative}</p>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <span className="rounded bg-ice-soft px-2 py-1 font-mono text-navy dark:bg-ice-soft/10">
                    Overall {pct(data.overall.winRate)} · {data.overall.won}W / {data.overall.lost}L
                  </span>
                  <span className="rounded bg-ice-soft px-2 py-1 font-mono text-navy dark:bg-ice-soft/10">
                    Won value {fmtUsd(data.overall.wonValueUsd)}
                  </span>
                  {data.topLossReasons[0] && (
                    <span className="rounded bg-ice-soft px-2 py-1 font-mono text-navy dark:bg-ice-soft/10">
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
              subtitle={timeFiltered ? `Deals closed — ${periodLabel.toLowerCase()}` : 'Closed deals split by package'}
            >
              {packageBuckets.length === 0 ? (
                <EmptyState title="No closed deals" description={timeFiltered ? 'No deals closed in this period.' : 'Package breakdown appears once deals close.'} />
              ) : (
                <GroupedColumnChart
                  data={packageBuckets.map((b) => ({ label: b.key, values: [b.won, b.lost] }))}
                  series={['Won', 'Lost']}
                />
              )}
            </ChartCard>

            <ChartCard title="Top loss reasons" subtitle="Most common reasons deals were lost" action={<AllTimeTag show={timeFiltered} />}>
              {data.topLossReasons.length === 0 ? (
                <EmptyState title="No losses recorded" description="Loss reasons appear when a deal is marked lost." />
              ) : (
                <BarChartH data={data.topLossReasons.map((l) => ({ label: l.reason, value: l.count }))} maxBars={8} />
              )}
            </ChartCard>

            <section className="rounded-xl border border-line bg-card p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-navy">By source</h3>
                  <p className="mt-0.5 text-xs text-grey">Lead source performance</p>
                </div>
                <AllTimeTag show={timeFiltered} />
              </div>
              {data.bySource.length === 0 ? (
                <EmptyState title="No closed deals" description="Source performance appears once deals close." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-grey">
                        <th className="pb-2 pl-2">Source</th>
                        <th className="pb-2 text-right">Won</th>
                        <th className="pb-2 text-right">Lost</th>
                        <th className="pb-2 text-right">Win rate</th>
                        <th className="pb-2 pr-2 text-right">Won value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bySource.map((r) => (
                        <tr key={r.key} className="even:bg-ice-soft/50 dark:even:bg-ice-soft/5">
                          <td className="py-2 pl-2 font-semibold text-navy">{r.key}</td>
                          <td className="py-2 text-right font-mono text-navy">{r.won}</td>
                          <td className="py-2 text-right font-mono text-grey">{r.lost}</td>
                          <td className="py-2 text-right font-mono font-bold text-navy">{pct(r.winRate)}</td>
                          <td className="py-2 pr-2 text-right font-mono text-navy">{fmtUsd(r.wonValueUsd)}</td>
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
