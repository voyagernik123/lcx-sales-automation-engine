import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Download, RefreshCw, TrendingUp, AlertTriangle, ListChecks, Activity, Bot } from 'lucide-react';
import { fetchWbr, regenerateWbr, type WbrReport, type WbrMetric, type WbrSparkline, type GpsWbrDisposition } from '@/lib/api/wbr';
import { wbrNarrative } from '@/lib/api/aiOperator';
import { AiProse } from '@/components/ai/AiProse';
import { EmptyState, PageSkeleton, toast } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { PrintStyles } from '@/components/report/PrintStyles';
import { clsx } from 'clsx';
import { Fig, FigGrid } from '@/components/fig/Fig';
import { chordFor } from '@/components/fig/figAddress';

/**
 * Weekly Business Review (Phase 4.1) — the auto-composed Monday review. Reads
 * the report the `wbr` job persists (or a live one before the first cron),
 * printable as-is. Fortune-500 operating rhythm, on the free-data stack.
 */

export function Wbr() {
  const navigate = useNavigate();
  const [report, setReport] = useState<WbrReport | null>(null);
  /* The services limb's disposition ALWAYS arrives, included or not, so a withheld
     compartment is a visible redaction rather than a section nobody knows exists. */
  const [gpsDisp, setGpsDisp] = useState<GpsWbrDisposition | null>(null);
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
    setError(null); setReport(null); setGpsDisp(null); setAiNarr(null); // clear stale AI narrative when the week changes
    fetchWbr(w).then((d) => { setReport(d.report); setWeeks(d.weeks); setGpsDisp(d.gpsDisposition ?? null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(() => { load(week); }, [load, week]);

  const regenerate = async () => {
    setBusy(true);
    try { await regenerateWbr(); toast('success', 'Review regenerated'); setWeek(undefined); load(undefined); }
    catch { toast('error', 'Regeneration failed'); }
    finally { setBusy(false); }
  };

  // Was: strip `.dark`, wait 60ms, print, put it back. Three problems — it could not
  // help a plain ⌘P, it restored the class under the print job if `window.print()`
  // blocked longer than the timer, and 60ms was a guess. `PrintStyles` now pins the
  // light tokens inside the media query, which needs no timing and covers both paths.
  const doPrint = () => window.print();

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
              <RefreshCw size={13} className={busy ? 'animate-spin motion-essential' : ''} /> Regenerate
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
            <AiProse className="mt-1.5" text={report.narrative} validIds={[]} />
          </div>

          {/* AI executive summary (Phase 5.4) — grounded in the report above; falls back to the deterministic line. */}
          <div className="rounded-lg border border-cyan-500/30 bg-card p-4 shadow-card">
            <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Bot size={12} className="text-cyan-600 dark:text-cyan-400" /> Executive summary
              <Button size="xs" variant="secondary" className="br-no-print ml-auto" onClick={() => void genNarrative()} disabled={aiBusy}>
                <RefreshCw size={11} className={aiBusy ? 'animate-spin motion-essential' : ''} /> {aiNarr ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
            {aiNarr ? (
              <>
                {/* The narrative goes in a board report, so it has to read as
                    prose. It was a bare <p>, which showed the model's own
                    `**bold**` to whoever the WBR was printed for. */}
                <AiProse text={aiNarr.text} validIds={[]} />
                {!aiNarr.usedLlm && (
                  <p className="mt-1 text-micro text-grey">(deterministic — no AI answer; cause not reported by this engine)</p>
                )}
              </>
            ) : (
              <p className="text-label text-grey">Generate an AI executive paragraph grounded strictly in this week's figures.</p>
            )}
          </div>

          {/* S6 · the review's own counts as dated figures, one row, before the groups */}
          <FigGrid cols={6}>
            <Fig id="governance.exceptions" address={chordFor('governance')} label="exceptions" value={report.exceptions.length} kind="int" source={{ at: report.generatedAt, kind: 'record' }} goodIsUp={false} />
            <Fig id="governance.exceptions-critical" address={chordFor('governance')} label="critical" value={report.exceptions.filter((e) => e.severity === 'critical').length} kind="int" source={{ at: report.generatedAt, kind: 'record' }} goodIsUp={false} />
            <Fig id="governance.commitments" address={chordFor('governance')} label="commitments carried" value={report.commitments.length} kind="int" source={{ at: report.generatedAt, kind: 'record' }} goodIsUp={false} />
            <Fig id="governance.commitments-overdue" address={chordFor('governance')} label="overdue" value={report.commitments.filter((c) => c.overdue).length} kind="int" source={{ at: report.generatedAt, kind: 'record' }} goodIsUp={false} />
            <Fig id="governance.inputs" address={chordFor('governance')} label="input metrics" value={report.inputs.length} kind="int" source={{ at: report.generatedAt, kind: 'record' }} />
            <Fig id="governance.outputs" address={chordFor('governance')} label="output metrics" value={report.outputs.length} kind="int" source={{ at: report.generatedAt, kind: 'record' }} />
          </FigGrid>
          {/* Inputs / Outputs */}
          <div className="grid gap-5 lg:grid-cols-2">
            <MetricGroup title="Activity in" subtitle="What the desk controlled" metrics={report.inputs} at={report.generatedAt} />
            <MetricGroup title="Results out" subtitle="What it produced, week-over-week" metrics={report.outputs} at={report.generatedAt} />
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

          <GpsLimbSection disposition={gpsDisp} />

          <p className="br-no-print flex items-center gap-1 text-micro text-grey">
            <Activity size={11} /> Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * GLOBAL SERVICES on the weekly review — included, or withheld with its reason.
 *
 * Three things this section refuses to do. It never renders a withheld limb as an
 * empty one (a reader who cannot tell redaction from a quiet week learns nothing). It
 * never prints a cross-currency total, because `invoiceAging` sums cents across every
 * currency present and a mixed book would be dollars added to euros. And it prints the
 * block's own `lines` verbatim rather than re-deriving figures the engine already
 * composed — a second formatter is a second place for the number to be wrong.
 */
function GpsLimbSection({ disposition }: { disposition: GpsWbrDisposition | null }) {
  if (disposition === null) return null;

  if (disposition.state !== 'included') {
    return (
      <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card" data-testid="wbr-gps-withheld">
        <SectionHead icon={<Activity size={13} />} title={disposition.headline} />
        <p className="py-2 text-label leading-relaxed text-grey">{disposition.detail}</p>
      </section>
    );
  }

  const { block, cash } = disposition;
  const money = (cents: number, ccy: string) =>
    `${ccy === 'USD' ? '$' : `${ccy} `}${Math.round(cents / 100).toLocaleString('en-US')}`;

  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card" data-testid="wbr-gps">
      <SectionHead icon={<Activity size={13} />} title="Global Services — the services book" />

      <div className="space-y-1 py-2">
        {block.lines.map((line, i) => (
          <p key={i} className="text-label leading-relaxed text-navy">{line}</p>
        ))}
      </div>

      {cash.state === 'register_absent' ? (
        <p className="text-micro leading-relaxed text-grey" data-testid="wbr-gps-cash-absent">{cash.note}</p>
      ) : (
        <div className="mt-2 border-t border-line pt-2" data-testid="wbr-gps-cash">
          <p className="font-mono text-micro uppercase tracking-wider text-grey">Cash, per currency</p>
          <div className="mt-1 space-y-0.5 text-label text-navy">
            {cash.open.length === 0
              ? <p className="text-grey">Nothing open.</p>
              : cash.open.map((r) => (
                  <p key={`o-${r.currency}`}>
                    Open: {money(r.amountCents, r.currency)} across {r.count} invoice(s)
                  </p>
                ))}
            {cash.paidThisWeek.map((r) => (
              <p key={`p-${r.currency}`} className="text-status-ready">
                Settled this week: {money(r.amountCents, r.currency)} ({r.count})
              </p>
            ))}
            {cash.disputed.map((r) => (
              <p key={`d-${r.currency}`} className="text-status-blocked">
                Disputed: {money(r.amountCents, r.currency)} ({r.count}) — still owed, still ageing
              </p>
            ))}
            {cash.oldestOpen !== null && (
              <p className="text-grey">
                Oldest open: {cash.oldestOpen.number}, {cash.oldestOpen.ageDays} day(s),{' '}
                {money(cash.oldestOpen.amountCents, cash.oldestOpen.currency)}
              </p>
            )}
          </div>
          <p className="mt-1 text-micro leading-relaxed text-grey">{cash.note}</p>
        </div>
      )}

      {block.caveats.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-micro leading-relaxed text-grey">
          {block.caveats.map((cv, i) => <li key={i}>· {cv}</li>)}
        </ul>
      )}
    </section>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
      {icon} {title}
    </div>
  );
}

function MetricGroup({ title, subtitle, metrics, at }: { title: string; subtitle: string; metrics: WbrMetric[]; at: string }) {
  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3">
        <h3 className="text-label font-bold text-navy">{title}</h3>
        <p className="text-micro text-grey">{subtitle}</p>
      </div>
      <FigGrid cols={2}>
        {metrics.map((m) => <MetricCard key={m.key} m={m} at={at} />)}
      </FigGrid>
    </section>
  );
}

/**
 * S6: a WBR metric is a `<Fig>` — the value in the review's own unit, dated by `generatedAt`, with the arrival
 * delta AND the review's own week-over-week (`compare`), which are different questions and both answered.
 * Money metrics arrive in cents and are shown in dollars, as `fmtMetric` always did.
 */
function MetricCard({ m, at }: { m: WbrMetric; at: string }) {
  const kind = m.unit === 'usd_cents' ? 'money' : m.unit === 'pct' ? 'pct' : 'int';
  const scale = m.unit === 'usd_cents' ? 1 / 100 : 1;
  return (
    <Fig
      id={`governance.${m.key}`}
      label={`${m.label} · ${m.kind === 'flow' ? 'this week' : 'stock'}`}
      value={m.current * scale}
      kind={kind}
      currency="USD"
      goodIsUp={m.higherIsBetter}
      compare={{ value: m.previous * scale, label: m.kind === 'flow' ? 'vs last week' : 'WoW' }}
      source={{ at, kind: 'record' }}
      address={chordFor('governance')}
    />
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
