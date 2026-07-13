import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, FileText, Mail, RefreshCw, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { ApiError } from '@/lib/apiClient';
import {
  fetchBoardReport,
  fetchBoardAnomalies,
  fetchBdPerformance,
  fetchBoardEmailStatus,
  sendBoardReportEmail,
  type BoardReportData,
  type BoardReportPeriod,
  type BoardAnomaly,
  type BdPerformanceRow,
} from '@/lib/api/bd';
import { FunnelChart, TrendDelta, StatCard } from '@/components/charts';
import { EmptyState, PageSkeleton, toast } from '@/components/shared';
import { ReportSection, NoDataRow } from '@/components/report/ReportSection';
import { SeverityBadge } from '@/components/report/SeverityBadge';
import { PrintStyles } from '@/components/report/PrintStyles';
import { EmailRecipientsDialog } from '@/components/report/EmailRecipientsDialog';

const PERIOD_TABS: { value: BoardReportPeriod; label: string }[] = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
];

const PERIOD_TITLES: Record<BoardReportPeriod, string> = {
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
};

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** Client-side template summary, used only if the API returns no execSummary. */
function fallbackSummary(r: BoardReportData): string {
  const label = r.period === 'week' ? 'this week' : r.period === 'month' ? 'this month' : 'this quarter';
  const parts = [
    `Pipeline ${label}: ${r.funnel.enrolled} new enrollments, ${r.funnel.replied} replies, and ${r.funnel.proposal} deals at proposal stage or later.`,
    r.revenue.wonCount > 0
      ? `Closed ${r.revenue.wonCount} deal${r.revenue.wonCount === 1 ? '' : 's'} worth ${usd(r.revenue.wonTotal)} (avg ${usd(r.revenue.avgDealSize)}).`
      : `No deals closed ${label}.`,
  ];
  if (r.topDeals.length > 0) {
    parts.push(`Largest open opportunity: ${r.topDeals[0].projectName} (${usd(r.topDeals[0].value)}).`);
  }
  return parts.join(' ');
}

export function BoardReport() {
  const [period, setPeriod] = useState<BoardReportPeriod>('week');
  const [report, setReport] = useState<BoardReportData | null>(null);
  const [anomalies, setAnomalies] = useState<BoardAnomaly[]>([]);
  const [bd, setBd] = useState<BdPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rep, anom, bdRows] = await Promise.all([
        fetchBoardReport(period),
        fetchBoardAnomalies().catch(() => [] as BoardAnomaly[]),
        fetchBdPerformance().catch(() => [] as BdPerformanceRow[]),
      ]);
      setReport(rep);
      setAnomalies(anom);
      setBd(bdRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board report');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchBoardEmailStatus()
      .then((s) => setEmailConfigured(s.configured))
      .catch(() => setEmailConfigured(null)); // unknown — keep the button, detect on send
  }, []);

  const handleDownloadPdf = () => {
    // Print in light mode so the deck renders on white, then restore.
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (wasDark) root.classList.remove('dark');
    try {
      window.print();
    } finally {
      if (wasDark) root.classList.add('dark');
    }
  };

  const handleSendEmail = async (recipients: string[]) => {
    try {
      const res = await sendBoardReportEmail(recipients, period);
      toast('success', `Board report emailed to ${res.recipients} recipient${res.recipients === 1 ? '' : 's'}.`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIGURED') {
        setEmailConfigured(false);
        setEmailDialogOpen(false);
        toast('warning', 'Demo mode — connect Resend to email reports.');
        return;
      }
      toast('error', err instanceof Error ? err.message : 'Failed to send report');
      throw err; // keep the dialog open for retry
    }
  };

  if (loading && !report) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-4">
        <PageSkeleton />
      </div>
    );
  }

  if (error && !report) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} className="text-red-500" />}
        title="Board report unavailable"
        description={error}
        action={
          <button onClick={load} className="rounded border border-line px-3 py-1.5 text-xs font-bold text-navy">
            Retry
          </button>
        }
      />
    );
  }

  if (!report) return null;

  const funnelStages = [
    { label: 'Enrolled', value: report.funnel.enrolled },
    { label: 'Replied', value: report.funnel.replied },
    { label: 'Proposal+', value: report.funnel.proposal },
    { label: 'Won', value: report.funnel.won },
  ];
  const funnelEmpty = funnelStages.every((s) => s.value === 0);
  const revenueEmpty = report.revenue.wonCount === 0 && report.revenue.wonTotal === 0;
  const byStream = Object.entries(report.revenue.byStream).filter(([, v]) => v > 0);
  const execSummary = report.execSummary || fallbackSummary(report);
  const generatedAt = new Date(report.generatedAt);

  const kpis: { label: string; value: string; pct: number | null }[] = [
    { label: 'New enrollments', value: String(report.funnel.enrolled), pct: report.deltas.enrolled.pct },
    { label: 'Replies', value: String(report.funnel.replied), pct: report.deltas.replied.pct },
    { label: 'Deals won', value: String(report.funnel.won), pct: report.deltas.won.pct },
    { label: 'Closed-won revenue', value: usd(report.revenue.wonTotal), pct: report.deltas.revenue.pct },
  ];

  const revenueRows: { label: string; current: string; previous: string; pct: number | null }[] = [
    {
      label: 'Closed-won revenue',
      current: usd(report.deltas.revenue.current),
      previous: usd(report.deltas.revenue.previous),
      pct: report.deltas.revenue.pct,
    },
    {
      label: 'Deals won',
      current: String(report.deltas.won.current),
      previous: String(report.deltas.won.previous),
      pct: report.deltas.won.pct,
    },
    {
      label: 'Avg deal size',
      current: usd(report.revenue.avgDealSize),
      previous: '—',
      pct: null,
    },
  ];

  return (
    <div className="br-page mx-auto max-w-5xl px-4 py-4 text-navy">
      <PrintStyles />

      {/* CONTROLS — hidden on print */}
      <div className="br-no-print mb-4 flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <FileText size={18} className="text-cyan-500" />
          Board Report
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded border border-line" role="tablist" aria-label="Report period">
            {PERIOD_TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={period === t.value}
                onClick={() => setPeriod(t.value)}
                className={clsx(
                  'px-3 py-1 text-[10px] font-bold uppercase transition-colors',
                  period === t.value ? 'bg-cyan-500 text-white' : 'text-grey hover:bg-ice-soft dark:hover:bg-navy-deep',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey disabled:opacity-50"
          >
            <RefreshCw size={12} className={clsx(loading && 'animate-spin')} /> Refresh
          </button>
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1 text-[10px] font-bold text-grey"
          >
            <Download size={12} /> Download PDF (print)
          </button>
          {emailConfigured !== false && (
            <button
              onClick={() => setEmailDialogOpen(true)}
              className="flex items-center gap-1.5 rounded bg-cyan-500 px-3 py-1 text-[10px] font-bold text-white hover:bg-cyan-600"
            >
              <Mail size={12} /> Email to Execs
            </button>
          )}
        </div>
      </div>

      {emailConfigured === false && (
        <div className="br-no-print mb-4 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle size={13} className="shrink-0" />
          Demo mode — connect Resend to email reports
        </div>
      )}

      {/* DECK PAGE */}
      <div className="br-deck overflow-hidden rounded-xl border border-line bg-card shadow-sm">
        {/* Title block */}
        <div className="px-6 pb-5 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xl font-black tracking-tight text-navy">
              LCX<span className="text-cyan-500">.</span>
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-grey">Confidential — board use only</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold">{PERIOD_TITLES[report.period]} Board Report</h1>
          <p className="mt-1 text-xs text-grey">
            Reporting window: last {report.periodDays} days · Generated {generatedAt.toLocaleDateString()}{' '}
            {generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Executive summary */}
        <ReportSection title="Executive summary">
          <p className="text-sm leading-relaxed">{execSummary}</p>
        </ReportSection>

        {/* KPI row */}
        <ReportSection title="Key metrics" subtitle="Deltas compare against the immediately preceding period of equal length.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <StatCard key={k.label} label={k.label} value={k.value} delta={k.pct ?? undefined} deltaLabel="vs prior period" />
            ))}
          </div>
        </ReportSection>

        {/* Funnel */}
        <ReportSection title="Pipeline funnel" empty={funnelEmpty}>
          <FunnelChart stages={funnelStages} />
        </ReportSection>

        {/* Revenue */}
        <ReportSection title="Revenue" empty={revenueEmpty}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-grey">
                <th className="pb-1.5">Metric</th>
                <th className="pb-1.5 text-right">This period</th>
                <th className="pb-1.5 text-right">Prior period</th>
                <th className="pb-1.5 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {revenueRows.map((r) => (
                <tr key={r.label}>
                  <td className="py-1.5 font-semibold">{r.label}</td>
                  <td className="py-1.5 text-right font-mono">{r.current}</td>
                  <td className="py-1.5 text-right font-mono text-grey">{r.previous}</td>
                  <td className="py-1.5 text-right"><TrendDelta value={r.pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {byStream.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-grey">By package</div>
              {byStream.map(([stream, v]) => (
                <div key={stream} className="flex justify-between border-t border-line/50 py-1 text-[11px] first:border-t-0">
                  <span className="capitalize text-grey">{stream}</span>
                  <span className="font-mono">{usd(v)}</span>
                </div>
              ))}
            </div>
          )}
        </ReportSection>

        {/* Top deals */}
        <ReportSection title="Top 10 open opportunities" empty={report.topDeals.length === 0}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-grey">
                <th className="pb-1.5 pr-2">#</th>
                <th className="pb-1.5">Project</th>
                <th className="pb-1.5">Stage</th>
                <th className="pb-1.5">Package</th>
                <th className="pb-1.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {report.topDeals.slice(0, 10).map((d, i) => (
                <tr key={d.id}>
                  <td className="py-1.5 pr-2 text-grey">{i + 1}</td>
                  <td className="py-1.5 font-semibold">{d.projectName}</td>
                  <td className="py-1.5 capitalize text-grey">{d.stage.replace(/_/g, ' ')}</td>
                  <td className="py-1.5 capitalize text-grey">{d.packageType.replace(/_/g, ' ')}</td>
                  <td className="py-1.5 text-right font-mono">{usd(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        {/* Anomalies */}
        <ReportSection
          title="Anomalies"
          empty={anomalies.length === 0}
          emptyMessage="No anomalies detected this period"
        >
          <div className="space-y-2">
            {anomalies.map((a, i) => (
              <div key={`${a.kind}-${a.metric}-${i}`} className="flex items-start gap-2 text-xs">
                <SeverityBadge severity={a.severity} />
                <span className="leading-relaxed">{a.message}</span>
                {a.zScore != null && <span className="ml-auto shrink-0 font-mono text-[10px] text-grey">z={a.zScore}</span>}
              </div>
            ))}
          </div>
        </ReportSection>

        {/* BD leaderboard */}
        <ReportSection title="BD performance leaderboard" empty={bd.length === 0}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-grey">
                <th className="pb-1.5">
                  <span className="flex items-center gap-1"><Users size={11} /> Owner</span>
                </th>
                <th className="pb-1.5 text-right">Deals</th>
                <th className="pb-1.5 text-right">Won</th>
                <th className="pb-1.5 text-right">Open</th>
                <th className="pb-1.5 text-right">Win rate</th>
                <th className="pb-1.5 text-right">Won value</th>
                <th className="pb-1.5 text-right">Handoffs closed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {bd.map((r) => (
                <tr key={r.owner}>
                  <td className="py-1.5 font-semibold capitalize">{r.owner}</td>
                  <td className="py-1.5 text-right">{r.dealsTotal}</td>
                  <td className="py-1.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{r.won}</td>
                  <td className="py-1.5 text-right">{r.open}</td>
                  <td className="py-1.5 text-right">{r.winRate}%</td>
                  <td className="py-1.5 text-right font-mono">{usd(r.wonValue)}</td>
                  <td className="py-1.5 text-right text-grey">{r.handoffsClosed}/{r.handoffsTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        {/* Deck footer */}
        <div className="border-t border-line px-6 py-3 text-[10px] text-grey">
          LCX Sales Engine · {PERIOD_TITLES[report.period]} board report · {generatedAt.toISOString().slice(0, 10)}
        </div>
      </div>

      {/* Inline refresh error (report still shown) */}
      {error && report && (
        <div className="br-no-print mt-3">
          <NoDataRow message={`Refresh failed: ${error}`} />
        </div>
      )}

      <EmailRecipientsDialog open={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} onSend={handleSendEmail} />
    </div>
  );
}

export default BoardReport;
