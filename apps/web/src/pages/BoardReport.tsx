import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, FileText, Mail, RefreshCw, Users, X } from 'lucide-react';
import { useOperatorStore } from '@/stores';
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
import { PageTitle, Button } from '@/components/ui';
import { EntityChip } from '@/components/entity';
import { ReportSection, NoDataRow } from '@/components/report/ReportSection';
import { SeverityBadge } from '@/components/report/SeverityBadge';
import { AnomalyDeviation } from '@/components/report/AnomalyDeviation';
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
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
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
    <div className="br-page mx-auto max-w-5xl p-5 text-navy">
      <PrintStyles />

      {/* CONTROLS — hidden on print */}
      <PageTitle
        className="br-no-print mb-5"
        icon={<FileText size={20} className="text-cyan-500" />}
        subtitle="Live document — every figure is re-queried on open; print or email it as-is"
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-line" role="tablist" aria-label="Report period">
              {PERIOD_TABS.map((t) => (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={period === t.value}
                  onClick={() => setPeriod(t.value)}
                  className={clsx(
                    'px-3 py-1 text-micro font-semibold transition-colors',
                    period === t.value ? 'bg-cyan-500 text-white' : 'text-grey hover:bg-ice-soft/50 dark:hover:bg-navy-deep',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="xs" onClick={load} disabled={loading} className="text-grey">
              <RefreshCw size={12} className={clsx(loading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="secondary" size="xs" onClick={handleDownloadPdf} className="text-grey">
              <Download size={12} /> Download PDF (print)
            </Button>
            {emailConfigured !== false && (
              <button
                onClick={() => setEmailDialogOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1 text-micro font-bold text-white hover:bg-cyan-600"
              >
                <Mail size={12} /> Email to Execs
              </button>
            )}
          </>
        }
      >
        Board Report
      </PageTitle>

      {emailConfigured === false && (
        <div className="br-no-print mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle size={13} className="shrink-0" />
          Demo mode — connect Resend to email reports
        </div>
      )}

      {/* DECK PAGE */}
      <div className="br-deck overflow-hidden rounded-xl border border-line/70 bg-card shadow-card-md">
        {/* Title block */}
        <div className="px-6 pb-5 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xl font-black tracking-tight text-navy">
              LCX<span className="text-cyan-500">.</span>
            </span>
            <span className="text-micro font-semibold uppercase tracking-wider text-grey">Confidential — board use only</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{PERIOD_TITLES[report.period]} Board Report</h1>
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
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <tr className="text-left text-micro font-medium uppercase tracking-wide text-grey">
                <th className="pb-2.5">Metric</th>
                <th className="pb-2.5 text-right">This period</th>
                <th className="pb-2.5 text-right">Prior period</th>
                <th className="pb-2.5 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {revenueRows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2.5 font-semibold">{r.label}</td>
                  <td className="num-tabular py-2.5 text-right font-mono">{r.current}</td>
                  <td className="num-tabular py-2.5 text-right font-mono text-grey">{r.previous}</td>
                  <td className="py-2.5 text-right"><TrendDelta value={r.pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {byStream.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-micro font-medium uppercase tracking-wide text-grey">By package</div>
              {byStream.map(([stream, v]) => (
                <div key={stream} className="flex justify-between border-t border-line/50 py-1.5 text-label first:border-t-0">
                  <span className="capitalize text-grey">{stream}</span>
                  <span className="num-tabular font-mono">{usd(v)}</span>
                </div>
              ))}
            </div>
          )}
        </ReportSection>

        {/* Top deals */}
        <ReportSection title="Top 10 open opportunities" empty={report.topDeals.length === 0}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-micro font-medium uppercase tracking-wide text-grey">
                <th className="pb-2.5 pr-2">#</th>
                <th className="pb-2.5">Project</th>
                <th className="pb-2.5">Stage</th>
                <th className="pb-2.5">Package</th>
                <th className="pb-2.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {report.topDeals.slice(0, 10).map((d, i) => (
                <tr key={d.id} className="transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10">
                  <td className="num-tabular py-2.5 pr-2 text-grey">{i + 1}</td>
                  <td className="py-2.5">
                    <EntityChip
                      type="deal"
                      id={d.id}
                      name={d.projectName}
                      stateLine={`${d.stage.replace(/_/g, ' ')} · ${d.packageType.replace(/_/g, ' ')}`}
                      vitals={[{ label: 'Value', value: usd(d.value) }]}
                      className="font-semibold"
                    />
                  </td>
                  <td className="py-2.5 capitalize text-grey">{d.stage.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 capitalize text-grey">{d.packageType.replace(/_/g, ' ')}</td>
                  <td className="num-tabular py-2.5 text-right font-mono">{usd(d.value)}</td>
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
                {/* deviation bullet: current bar vs expected tick — the z-score, drawn */}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <AnomalyDeviation current={a.current} expected={a.expected} severity={a.severity} />
                  <span className="num-tabular whitespace-nowrap font-mono text-micro text-grey">
                    {a.current} vs ~{Math.round(a.expected * 10) / 10}
                    {a.zScore != null && ` · z=${a.zScore}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </ReportSection>

        {/* BD leaderboard */}
        <ReportSection title="BD performance leaderboard" empty={bd.length === 0}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-micro font-medium uppercase tracking-wide text-grey">
                <th className="pb-2.5">
                  <span className="flex items-center gap-1"><Users size={11} /> Owner</span>
                </th>
                <th className="pb-2.5 text-right">Deals</th>
                <th className="pb-2.5 text-right">Won</th>
                <th className="pb-2.5 text-right">Open</th>
                <th className="pb-2.5 text-right">Win rate</th>
                <th className="pb-2.5 text-right">Won value</th>
                <th className="pb-2.5 text-right">Handoffs closed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {bd.map((r) => (
                <tr key={r.owner}>
                  <td className="py-2.5 font-semibold capitalize">{r.owner}</td>
                  <td className="num-tabular py-2.5 text-right">{r.dealsTotal}</td>
                  <td className="num-tabular py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{r.won}</td>
                  <td className="num-tabular py-2.5 text-right">{r.open}</td>
                  <td className="num-tabular py-2.5 text-right">{r.winRate}%</td>
                  <td className="num-tabular py-2.5 text-right font-mono">{usd(r.wonValue)}</td>
                  <td className="num-tabular py-2.5 text-right text-grey">{r.handoffsClosed}/{r.handoffsTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        {/* Deck footer */}
        <div className="border-t border-line px-6 py-3 text-micro text-grey">
          LCX Sales Engine · {PERIOD_TITLES[report.period]} board report · {generatedAt.toISOString().slice(0, 10)}
        </div>
      </div>

      {/* Annotations — decisions & context pinned to this report (plan B4).
          Internal working layer: excluded from print and email on purpose. */}
      <ReportAnnotations period={period} />

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

/* ── Annotations — the report's decision layer (plan B4) ──────────────
   Each note is a Decision-flavored object: author, timestamp, rationale,
   pinned to a period. Stored locally per browser until the API grows a
   report_annotations table; excluded from print/email by design. */

interface ReportNote {
  id: string;
  period: BoardReportPeriod;
  text: string;
  author: string;
  ts: string;
}

const NOTES_KEY = 'lcx-os:report-notes:v1';

function readNotes(): ReportNote[] {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]') as ReportNote[];
  } catch {
    return [];
  }
}

function ReportAnnotations({ period }: { period: BoardReportPeriod }) {
  const operator = useOperatorStore(s => s.operator);
  const [notes, setNotes] = useState<ReportNote[]>(() => readNotes());
  const [draft, setDraft] = useState('');

  const forPeriod = notes.filter(n => n.period === period);

  const save = (next: ReportNote[]) => {
    setNotes(next);
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — the session still shows the note
    }
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    save([
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        period,
        text,
        author: operator?.name ?? 'Operator',
        ts: new Date().toISOString(),
      },
      ...notes,
    ]);
    setDraft('');
  };

  return (
    <section className="br-no-print mt-4 rounded-lg border border-line/80 bg-card p-5 shadow-card">
      <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-navy">Annotations</h3>
      <p className="mt-0.5 text-micro text-grey">
        Decisions and context pinned to the {PERIOD_TITLES[period].toLowerCase()} report — internal only, never
        printed or emailed.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') add();
          }}
          placeholder="Add context the numbers can't say — 'Q3 dip is the Solaris slip, recovery signed Friday'…"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-page px-2.5 text-label text-navy placeholder:text-grey/60 focus:border-cyan-500 focus:outline-none"
        />
        <Button size="xs" variant="secondary" onClick={add} disabled={!draft.trim()}>
          Pin note
        </Button>
      </div>

      {forPeriod.length > 0 && (
        <div className="mt-3 space-y-2">
          {forPeriod.map(n => (
            <div key={n.id} className="group flex items-start gap-2.5 rounded-md border border-line/60 px-3 py-2">
              <span className="mt-0.5 shrink-0 rounded bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-fuchsia-600 dark:text-fuchsia-400">
                Note
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-label leading-relaxed text-navy">{n.text}</p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-grey">
                  {n.author} · {new Date(n.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => save(notes.filter(x => x.id !== n.id))}
                className="shrink-0 rounded p-0.5 text-grey opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                aria-label="Remove note"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default BoardReport;
