import { useCallback, useEffect, useState } from 'react';
import { FileText, Printer, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { request } from '@/lib/apiClient';

type Period = 'week' | 'month' | 'quarter';

interface Delta { current: number; previous: number; change: number; pct: number | null }

interface BoardReport {
  period: Period;
  periodDays: number;
  generatedAt: string;
  funnel: { enrolled: number; replied: number; proposal: number; won: number };
  revenue: { wonTotal: number; wonCount: number; avgDealSize: number; byStream: Record<string, number> };
  topDeals: { id: string; projectName: string; stage: string; packageType: string; value: number }[];
  deltas: { enrolled: Delta; replied: Delta; proposal: Delta; won: Delta; revenue: Delta };
  execSummary: string;
}

interface Anomaly {
  kind: string;
  severity: 'low' | 'medium' | 'high';
  metric: string;
  current: number;
  expected: number;
  zScore: number | null;
  deviationPct: number | null;
  message: string;
}

interface BdRow {
  owner: string;
  dealsTotal: number;
  won: number;
  lost: number;
  open: number;
  wonValue: number;
  winRate: number;
  handoffsTotal: number;
  handoffsClosed: number;
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function DeltaBadge({ d }: { d: Delta }) {
  const Icon = d.change > 0 ? TrendingUp : d.change < 0 ? TrendingDown : Minus;
  const color = d.change > 0 ? 'text-emerald-500' : d.change < 0 ? 'text-red-500' : 'text-grey';
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-[10px] font-bold', color)}>
      <Icon size={11} />
      {d.pct != null ? `${d.pct > 0 ? '+' : ''}${d.pct}%` : d.change > 0 ? `+${d.change}` : d.change}
    </span>
  );
}

export function BoardReport() {
  const [period, setPeriod] = useState<Period>('week');
  const [report, setReport] = useState<BoardReport | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [bd, setBd] = useState<BdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rep, anom, bdRes] = await Promise.all([
        request<{ data: BoardReport }>(`/v1/analytics/board-report?period=${period}`),
        request<{ data: Anomaly[] }>(`/v1/analytics/anomalies`).catch(() => ({ data: [] })),
        request<{ data: BdRow[] }>(`/v1/analytics/bd-performance`).catch(() => ({ data: [] })),
      ]);
      setReport(rep.data);
      setAnomalies(anom.data);
      setBd(bdRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board report');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading && !report) {
    return <div className="flex h-[60vh] items-center justify-center text-grey text-sm">Loading board report…</div>;
  }
  if (error && !report) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-red-500">
        <p className="text-sm font-semibold">{error}</p>
        <button onClick={load} className="rounded border border-line px-3 py-1 text-xs font-bold">Retry</button>
      </div>
    );
  }
  if (!report) return null;

  const maxFunnel = Math.max(report.funnel.enrolled, 1);
  const funnelRows: [string, number, Delta][] = [
    ['Enrolled', report.funnel.enrolled, report.deltas.enrolled],
    ['Replied', report.funnel.replied, report.deltas.replied],
    ['Proposal', report.funnel.proposal, report.deltas.proposal],
    ['Won', report.funnel.won, report.deltas.won],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 text-navy dark:text-ice print:max-w-none">
      {/* HEADER — hidden controls on print */}
      <div className="mb-4 flex items-center gap-3 print:mb-6">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <FileText size={18} className="text-cyan-500 print:hidden" />
          Board Report
        </h1>
        <div className="ml-auto flex items-center gap-2 print:hidden">
          <div className="flex rounded border border-line overflow-hidden">
            {(['week', 'month', 'quarter'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={clsx('px-3 py-1 text-[10px] font-bold uppercase transition-colors',
                  period === p ? 'bg-cyan-500 text-white' : 'text-grey hover:bg-ice-soft dark:hover:bg-navy-deep')}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={load} className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey">
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey">
            <Printer size={12} /> Print
          </button>
        </div>
      </div>

      <p className="mb-4 text-[11px] text-grey">
        Period: last {report.periodDays} days · Generated {new Date(report.generatedAt).toLocaleString()}
      </p>

      {/* EXEC SUMMARY */}
      <div className="mb-4 rounded-lg border border-line bg-card p-4 print:border-black/20">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-grey">Executive Summary</h2>
        <p className="text-sm leading-relaxed">{report.execSummary}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* FUNNEL */}
        <div className="rounded-lg border border-line bg-card p-4 print:border-black/20">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-grey">Funnel</h2>
          <div className="space-y-2">
            {funnelRows.map(([label, value, d]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-grey">{label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-ice-soft dark:bg-navy-deep">
                  <div className="h-full rounded bg-cyan-500" style={{ width: `${Math.max((value / maxFunnel) * 100, 2)}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-bold">{value}</span>
                <span className="w-14 shrink-0 text-right"><DeltaBadge d={d} /></span>
              </div>
            ))}
          </div>
        </div>

        {/* REVENUE */}
        <div className="rounded-lg border border-line bg-card p-4 print:border-black/20">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-grey">Revenue (closed-won)</h2>
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono">{usd(report.revenue.wonTotal)}</span>
            <DeltaBadge d={report.deltas.revenue} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-line p-2 text-center">
              <div className="text-[9px] uppercase text-grey">Deals</div>
              <div className="font-bold">{report.revenue.wonCount}</div>
            </div>
            <div className="rounded border border-line p-2 text-center">
              <div className="text-[9px] uppercase text-grey">Avg size</div>
              <div className="font-bold font-mono">{usd(report.revenue.avgDealSize)}</div>
            </div>
          </div>
          {Object.entries(report.revenue.byStream).filter(([, v]) => v > 0).length > 0 && (
            <div className="mt-3 space-y-1">
              {Object.entries(report.revenue.byStream).filter(([, v]) => v > 0).map(([stream, v]) => (
                <div key={stream} className="flex justify-between text-[11px]">
                  <span className="capitalize text-grey">{stream}</span>
                  <span className="font-mono">{usd(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TOP DEALS */}
      {report.topDeals.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-card p-4 print:border-black/20">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-grey">Top Open Opportunities</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-grey">
                <th className="pb-1">Project</th><th className="pb-1">Stage</th><th className="pb-1">Package</th><th className="pb-1 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {report.topDeals.map((d) => (
                <tr key={d.id}>
                  <td className="py-1.5 font-semibold">{d.projectName}</td>
                  <td className="py-1.5 text-grey">{d.stage}</td>
                  <td className="py-1.5 text-grey capitalize">{d.packageType}</td>
                  <td className="py-1.5 text-right font-mono">{usd(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ANOMALIES */}
      {anomalies.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-card p-4 print:border-black/20">
          <h2 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-grey">
            <AlertTriangle size={13} /> Anomalies Detected
          </h2>
          <div className="space-y-2">
            {anomalies.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={clsx('inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase',
                  a.severity === 'high' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                  {a.severity}
                </span>
                <span>{a.message}</span>
                {a.zScore != null && <span className="text-grey">(z={a.zScore})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BD PERFORMANCE */}
      {bd.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-card p-4 print:border-black/20">
          <h2 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-grey">
            <Users size={13} /> BD Performance by Owner
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-grey">
                <th className="pb-1">Owner</th><th className="pb-1 text-right">Deals</th><th className="pb-1 text-right">Won</th>
                <th className="pb-1 text-right">Win rate</th><th className="pb-1 text-right">Won value</th><th className="pb-1 text-right">Handoffs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {bd.map((r) => (
                <tr key={r.owner}>
                  <td className="py-1.5 font-semibold capitalize">{r.owner}</td>
                  <td className="py-1.5 text-right">{r.dealsTotal}</td>
                  <td className="py-1.5 text-right text-emerald-500 font-bold">{r.won}</td>
                  <td className="py-1.5 text-right">{r.winRate}%</td>
                  <td className="py-1.5 text-right font-mono">{usd(r.wonValue)}</td>
                  <td className="py-1.5 text-right text-grey">{r.handoffsClosed}/{r.handoffsTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default BoardReport;
