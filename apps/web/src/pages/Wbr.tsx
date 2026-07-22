import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Download, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, ListChecks, Activity, Bot } from 'lucide-react';
import { fetchWbr, regenerateWbr, type WbrReport, type WbrMetric, type WbrSparkline } from '@/lib/api/wbr';
import { wbrNarrative } from '@/lib/api/aiOperator';
import { EmptyState, PageSkeleton, toast } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { PrintStyles } from '@/components/report/PrintStyles';
import { clsx } from 'clsx';

/**
 * Weekly Business Review (Phase 4.1) — the auto-composed Monday review. Reads
 * the report the `wbr` job persists (or a live one before the first cron),
 * printable as-is. Fortune-500 operating rhythm, on the free-data stack.
 */
function fmtMetric(v: number, unit: WbrMetric['unit']): string {
  if (unit === 'usd_cents') return `$${Math.round(v / 100).toLocaleString('en-US')}`;
  if (unit === 'pct') return `${v}%`;
  return v.toLocaleString('en-US');
}
function fmtDelta(m: WbrMetric): string {
  const s = m.delta > 0 ? '+' : '';
  if (m.unit === 'usd_cents') return `${s}$${Math.round(m.delta / 100).toLocaleString('en-US')}`;
  if (m.unit === 'pct') return `${s}${m.delta}%`;
  return `${s}${m.delta.toLocaleString('en-US')}`;
}

export function Wbr() {
  const navigate = useNavigate();
  const [report, setReport] = useState<WbrReport | null>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiNarr, setAiNarr] = useState<{ text: string; usedLlm: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const genNarrative = async () => {
    setAiBusy(true);
    try { const r = await wbrNarrative(); setAiNarr({ text: r.narrative, usedLlm: r.usedLlm }); }
    catch { toast('error', 'Narrative failed'); }
    finally { setAiBusy(false); }
  };

  const load = useCallback((w?: string) => {
    setError(null); setReport(null);
    fetchWbr(w).then((d) => { setReport(d.report); setWeeks(d.weeks); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(() => { load(week); }, [load, week]);

  const regenerate = async () => {
    setBusy(true);
    try { await regenerateWbr(); toast('success', 'Review regenerated'); setWeek(undefined); load(undefined); }
    catch { toast('error', 'Regeneration failed'); }
    finally { setBusy(false); }
  };

  const doPrint = () => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (wasDark) root.classList.remove('dark');
    setTimeout(() => { window.print(); if (wasDark) root.classList.add('dark'); }, 60);
  };

  return (
    <div className="br-page p-5">
      <PrintStyles />
      <PageTitle
        icon={<CalendarClock size={20} />}
        subtitle="Auto-composed every Monday from the week's data — activity in, results out, and what needs attention."
        actions={
          <div className="br-no-print flex items-center gap-2">
            {weeks.length > 0 && (
              <select
                value={week ?? weeks[0] ?? ''}
                onChange={(e) => setWeek(e.target.value)}
                className="rounded border border-line bg-card px-2 py-1 text-label text-navy"
              >
                {weeks.map((w) => <option key={w} value={w}>Week of {w}</option>)}
              </select>
            )}
            <Button size="sm" variant="secondary" onClick={regenerate} disabled={busy}>
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Regenerate
            </Button>
            <Button size="sm" variant="secondary" onClick={doPrint}><Download size={13} /> Print</Button>
          </div>
        }
      >
        Weekly Business Review
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Review unavailable" description={error} />
      ) : !report ? (
        <PageSkeleton />
      ) : (
        <div className="br-deck space-y-5">
          {/* Narrative */}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="flex items-center gap-2">
              <span className="text-micro font-bold uppercase tracking-wider text-grey">Week of {report.weekStart}</span>
              {report.live && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-micro font-bold text-amber-600 dark:text-amber-400">LIVE · not yet snapshotted</span>}
            </div>
            <p className="mt-1.5 text-body text-navy">{report.narrative}</p>
          </div>

          {/* AI executive summary (Phase 5.4) — grounded in the report above; falls back to the deterministic line. */}
          <div className="rounded-lg border border-cyan-500/30 bg-card p-4 shadow-card">
            <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Bot size={12} className="text-cyan-600 dark:text-cyan-400" /> Executive summary
              <Button size="xs" variant="secondary" className="br-no-print ml-auto" onClick={() => void genNarrative()} disabled={aiBusy}>
                <RefreshCw size={11} className={aiBusy ? 'animate-spin' : ''} /> {aiNarr ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
            {aiNarr ? (
              <p className="text-body text-navy">
                {aiNarr.text}
                {!aiNarr.usedLlm && <span className="ml-1 text-micro text-grey">(deterministic — no AI key set)</span>}
              </p>
            ) : (
              <p className="text-label text-grey">Generate an AI executive paragraph grounded strictly in this week's figures.</p>
            )}
          </div>

          {/* Inputs / Outputs */}
          <div className="grid gap-5 lg:grid-cols-2">
            <MetricGroup title="Activity in" subtitle="What the desk controlled" metrics={report.inputs} />
            <MetricGroup title="Results out" subtitle="What it produced, week-over-week" metrics={report.outputs} />
          </div>

          {/* Sparklines */}
          {report.sparklines.some((s) => s.points.length > 1) && (
            <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
              <SectionHead icon={<TrendingUp size={13} />} title="Trailing 8 weeks" />
              <div className="grid gap-4 sm:grid-cols-3">
                {report.sparklines.map((s) => <SparkCard key={s.key} spark={s} />)}
              </div>
            </section>
          )}

          {/* Exceptions */}
          <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
            <SectionHead icon={<AlertTriangle size={13} />} title={`Exceptions (${report.exceptions.length})`} />
            {report.exceptions.length === 0 ? (
              <p className="py-2 text-label text-grey">Nothing flagged — sources fresh, no stalled deals, jobs healthy.</p>
            ) : (
              <div className="space-y-1.5">
                {report.exceptions.map((e, i) => (
                  <button
                    key={i}
                    onClick={() => e.href && navigate(e.href)}
                    className={clsx(
                      'flex w-full items-start gap-2 rounded border px-3 py-2 text-left',
                      e.severity === 'critical'
                        ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10'
                        : 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10',
                    )}
                  >
                    <span className={clsx('mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full', e.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500')} />
                    <span className="min-w-0">
                      <span className="block text-label font-semibold text-navy">{e.label}</span>
                      <span className="block text-micro text-grey">{e.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Commitments */}
          <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
            <SectionHead icon={<ListChecks size={13} />} title={`Commitments carried forward (${report.commitments.length})`} />
            {report.commitments.length === 0 ? (
              <p className="py-2 text-label text-grey">No open commitments.</p>
            ) : (
              <div className="divide-y divide-line/60">
                {report.commitments.map((cm) => (
                  <div key={cm.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-label text-navy">{cm.title}</span>
                    {cm.projectName && <span className="shrink-0 text-micro text-grey">{cm.projectName}</span>}
                    <span className="shrink-0 rounded bg-ice-soft px-1.5 py-0.5 text-micro font-semibold text-grey-dark dark:bg-ice-soft/10">{cm.ownerLabel}</span>
                    {cm.dueAt && (
                      <span className={clsx('shrink-0 text-micro font-mono', cm.overdue ? 'text-red-500' : 'text-grey')}>
                        {cm.overdue ? 'overdue' : new Date(cm.dueAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="br-no-print flex items-center gap-1 text-micro text-grey">
            <Activity size={11} /> Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
      {icon} {title}
    </div>
  );
}

function MetricGroup({ title, subtitle, metrics }: { title: string; subtitle: string; metrics: WbrMetric[] }) {
  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3">
        <h3 className="text-label font-bold text-navy">{title}</h3>
        <p className="text-micro text-grey">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => <MetricCard key={m.key} m={m} />)}
      </div>
    </section>
  );
}

function MetricCard({ m }: { m: WbrMetric }) {
  const good = m.delta === 0 ? null : (m.delta > 0) === m.higherIsBetter;
  const Icon = m.delta === 0 ? Minus : m.delta > 0 ? TrendingUp : TrendingDown;
  const tone = good === null ? 'text-grey' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500';
  return (
    <div className="rounded border border-line/70 p-2.5">
      <div className="text-micro text-grey">{m.label}</div>
      <div className="mt-0.5 text-h3 font-bold tabular-nums text-navy">{fmtMetric(m.current, m.unit)}</div>
      <div className={clsx('mt-0.5 flex items-center gap-1 text-micro font-semibold', tone)}>
        <Icon size={11} /> {fmtDelta(m)} <span className="font-normal text-grey">{m.kind === 'flow' ? 'this week' : 'WoW'}</span>
      </div>
    </div>
  );
}

function SparkCard({ spark }: { spark: WbrSparkline }) {
  const pts = spark.points;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const range = max - min || 1;
  const W = 120, H = 32;
  const path = pts.map((p, i) => {
    const x = (i / Math.max(pts.length - 1, 1)) * W;
    const y = H - ((p - min) / range) * H;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = pts[pts.length - 1] ?? 0;
  return (
    <div className="rounded border border-line/70 p-2.5">
      <div className="text-micro text-grey">{spark.label}</div>
      <div className="mt-1 text-label font-bold tabular-nums text-navy">
        {spark.unit === 'usd_cents' ? `$${Math.round(last / 100).toLocaleString('en-US')}` : last.toLocaleString('en-US')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-8 w-full" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-500" />
      </svg>
    </div>
  );
}
