import { useCallback, useEffect, useState } from 'react';
import {
  Activity, RefreshCw, ShieldCheck, Database, AlertTriangle,
  CheckCircle2, XCircle, Clock, ExternalLink, ScrollText, Play,
} from 'lucide-react';
import { fetchOps, triggerIntelJob, type OpsHealth } from '@/lib/api/intel';
import { EmptyState, CardSkeleton, toast } from '@/components/shared';
import { Button, PageTitle } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { PirPanel } from '@/components/intel/PirPanel';
import { SloPanel } from '@/components/ops/SloPanel';

/**
 * Ops Health (Wave 7 · governance) — the intelligence apparatus watching
 * itself. Four questions a desk lead needs answered before trusting an
 * autonomous system: are the jobs running, is the data fresh enough to act on,
 * where are the blind spots, and are we inside the terms of every free source
 * we pull from. All derived from what the system already records.
 */

const JOB_STATUS: Record<string, { cls: string; icon: typeof CheckCircle2 }> = {
  ok: { cls: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  running: { cls: 'text-cyan-600 dark:text-cyan-400', icon: Clock },
  failed: { cls: 'text-red-600 dark:text-red-400', icon: XCircle },
};

const HEALTH: Record<OpsHealth['freshness'][number]['health'], { label: string; cls: string }> = {
  ok: { label: 'Within SLA', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  degraded: { label: 'Degraded', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  stale: { label: 'Stale', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  down: { label: 'Down', cls: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' },
  idle: { label: 'Idle', cls: 'border-line bg-page text-grey' },
};

const TIER: Record<OpsHealth['compliance'][number]['tier'], { label: string; cls: string }> = {
  free: { label: 'Free · keyless', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  'free-rate-limited': { label: 'Free · rate-limited', cls: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  paid: { label: 'Paid', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000 / 60)}m`;
}

export function Ops() {
  const [ops, setOps] = useState<OpsHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setOps(null);
    fetchOps().then(setOps).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(load, [load]);

  // Kick off a pipeline job server-side (fire-and-forget). The outcome lands in
  // job_runs, so we just tell the operator to refresh in a moment.
  const run = useCallback(async (job: 'collect' | 'alpha', label: string) => {
    setBusy(job);
    try {
      await triggerIntelJob(job);
      toast('success', `${label} started — running server-side. Refresh in ~1 min for results.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : `Failed to start ${label}`);
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div className="p-5">
      <PageTitle
        icon={<ShieldCheck size={20} />}
        subtitle="The collection apparatus, watching itself — job health, data-freshness SLAs, the intelligence-gap ledger, and source compliance."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void run('collect', 'Collection')} disabled={busy !== null} title="Pull fresh data from the free sources (DefiLlama · CoinPaprika · GitHub)">
              <Play size={12} /> {busy === 'collect' ? 'Starting…' : 'Collect'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void run('alpha', 'Alpha recompute')} disabled={busy !== null} title="Recompute scores, I&W and calibration from current observations">
              <Play size={12} /> {busy === 'alpha' ? 'Starting…' : 'Recompute'}
            </Button>
            <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>
          </div>
        }
      >
        Ops Health
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Ops health unavailable" description={error} />
      ) : !ops ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Jobs tracked" value={String(ops.summary.jobsTracked)} />
            <Tile label="Jobs failing" value={String(ops.summary.jobsFailing)} tone={ops.summary.jobsFailing > 0 ? 'bad' : 'good'} />
            <Tile label="Sources within SLA" value={`${ops.summary.sourcesWithinSla}/${ops.summary.sourcesTotal}`} tone={ops.summary.sourcesWithinSla === ops.summary.sourcesTotal ? 'good' : 'warn'} />
            <Tile label="Open gaps" value={String(ops.summary.openGaps)} tone={ops.summary.openGaps > 0 ? 'warn' : 'good'} />
            <Tile label="Last collection" value={ops.summary.lastCollectionAt ? formatDate(ops.summary.lastCollectionAt) : '—'} />
          </div>

          {/* SLOs & error budgets (Phase 4.3) */}
          <SloPanel />

          {/* Data freshness vs SLA */}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Database size={12} /> Data freshness · SLA compliance
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {ops.freshness.map((f) => {
                const h = HEALTH[f.health];
                return (
                  <div key={f.source} className="rounded-lg border border-line p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-navy">{f.label}</span>
                      <span className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10px] font-medium ${h.cls}`}>{h.label}</span>
                    </div>
                    <div className="mb-2 text-[10px] text-grey">{f.yields}</div>
                    <div className="grid grid-cols-4 gap-1 text-center">
                      <MiniStat label="Tracked" value={f.tracked} />
                      <MiniStat label="Fresh" value={f.fresh} tone="good" />
                      <MiniStat label="Stale" value={f.stale} tone={f.stale > 0 ? 'warn' : undefined} />
                      <MiniStat label="Errored" value={f.errored} tone={f.errored > 0 ? 'bad' : undefined} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-grey">
                      <span>SLA {f.slaDays}d</span>
                      <span>{f.oldestOkAt ? `oldest ${formatDate(f.oldestOkAt)}` : 'never collected'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Job runs */}
          <div className="rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Activity size={12} /> Job runs · latest per job
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-label">
                <thead>
                  <tr className="text-micro font-bold uppercase tracking-wider text-grey">
                    <th className="py-1 pr-2 text-left">Job</th>
                    <th className="py-1 px-2 text-left">Status</th>
                    <th className="py-1 px-2 text-right">Last run</th>
                    <th className="py-1 px-2 text-right">Duration</th>
                    <th className="py-1 px-2 text-right">Success (7d)</th>
                    <th className="py-1 pl-2 text-left">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.jobs.map((j) => {
                    const s = JOB_STATUS[j.status] ?? { cls: 'text-grey', icon: Clock };
                    const StatusIcon = s.icon;
                    return (
                      <tr key={j.jobName} className="border-t border-line/50 align-top">
                        <td className="py-1.5 pr-2 font-mono text-[11px] text-navy">{j.jobName}</td>
                        <td className="py-1.5 px-2">
                          <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase ${s.cls}`}>
                            <StatusIcon size={11} /> {j.status}
                          </span>
                        </td>
                        <td className="num-tabular py-1.5 px-2 text-right text-grey" title={j.startedAt ? formatDateTime(j.startedAt) : ''}>
                          {j.startedAt ? formatDate(j.startedAt) : '—'}
                        </td>
                        <td className="num-tabular py-1.5 px-2 text-right text-grey">{fmtDuration(j.durationMs)}</td>
                        <td className="num-tabular py-1.5 px-2 text-right text-navy">
                          {j.successRate != null ? `${j.successRate}%` : '—'}
                          {j.runsWindow > 0 && <span className="ml-1 text-[10px] text-grey">·{j.runsWindow}</span>}
                        </td>
                        <td className="py-1.5 pl-2 text-[10px] text-grey">
                          {j.error ? <span className="text-red-600 dark:text-red-400">{j.error}</span> : <JobStat stats={j.stats} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Intelligence-gap ledger */}
            <div className="rounded-lg border border-line bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
                <AlertTriangle size={12} /> Intelligence-gap ledger
                {ops.summary.openGaps > 25 && <span className="text-[10px] font-normal normal-case text-grey">(showing 25 of {ops.summary.openGaps})</span>}
              </div>
              {ops.gaps.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-label text-grey">
                  <CheckCircle2 size={14} className="text-emerald-500" /> No open gaps — every tracked subject has been collected.
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-label">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-micro font-bold uppercase tracking-wider text-grey">
                        <th className="py-1 pr-2 text-left">Subject</th>
                        <th className="py-1 px-2 text-left">Source</th>
                        <th className="py-1 px-2 text-left">Why</th>
                        <th className="py-1 pl-2 text-right">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ops.gaps.map((g) => (
                        <tr key={`${g.source}-${g.subjectId}`} className="border-t border-line/50">
                          <td className="py-1.5 pr-2 text-navy">
                            {g.subjectLabel ?? <span className="font-mono text-[10px] text-grey">{g.subjectType}:{g.subjectId.slice(0, 8)}</span>}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-[10px] text-grey">{g.source}</td>
                          <td className="py-1.5 px-2 text-[10px]">
                            {g.status === 'error'
                              ? <span className="text-red-600 dark:text-red-400">{g.lastError ?? 'error'}</span>
                              : <span className="text-grey">never collected</span>}
                          </td>
                          <td className="num-tabular py-1.5 pl-2 text-right text-grey">{g.lastAttemptAt ? formatDate(g.lastAttemptAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Source compliance */}
            <div className="rounded-lg border border-line bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
                <ScrollText size={12} /> Source compliance
              </div>
              <div className="space-y-2">
                {ops.compliance.map((c) => {
                  const t = TIER[c.tier];
                  return (
                    <div key={c.source} className="rounded-lg border border-line p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-navy">{c.label}</span>
                          {c.termsUrl && (
                            <a href={c.termsUrl} target="_blank" rel="noreferrer" className="text-grey hover:text-cyan-600" title="Terms / API docs">
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                        <span className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10px] font-medium ${t.cls}`}>{t.label}</span>
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                        <dt className="text-grey">Auth</dt><dd className="text-navy">{c.auth}</dd>
                        <dt className="text-grey">Rate limit</dt><dd className="text-navy">{c.rateLimit}</dd>
                        <dt className="text-grey">Attribution</dt><dd className="text-navy">{c.attribution}</dd>
                      </dl>
                      {c.note && <p className="mt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">{c.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Collection vs. requirements — PIRs (Phase 3.4) */}
          <PirPanel sources={ops.freshness.map((f) => ({ source: f.source, health: f.health }))} />

          <p className="text-[10px] text-grey/70">Generated {formatDateTime(ops.generatedAt)} · derived from job_runs + collection_state, no external calls.</p>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const cls =
    tone === 'good' ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'warn' ? 'text-amber-700 dark:text-amber-300'
    : tone === 'bad' ? 'text-red-700 dark:text-red-300'
    : 'text-navy';
  return (
    <div className="rounded-lg border border-line bg-card p-3 shadow-card">
      <div className="text-[9px] font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className={`num-tabular text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' | 'bad' }) {
  const cls =
    tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'bad' ? 'text-red-600 dark:text-red-400'
    : 'text-navy';
  return (
    <div>
      <div className={`num-tabular text-sm font-bold ${cls}`}>{value.toLocaleString()}</div>
      <div className="text-[9px] uppercase tracking-wider text-grey">{label}</div>
    </div>
  );
}

/** Compact one-line render of a job's stats blob — the useful counters, not the whole tree. */
function JobStat({ stats }: { stats: Record<string, unknown> }) {
  const parts: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      if (parts.length >= 4) return;
      if (typeof v === 'number') parts.push(`${prefix}${k} ${v.toLocaleString()}`);
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v as Record<string, unknown>, `${k}.`);
    }
  };
  walk(stats);
  return <span className="text-grey">{parts.length ? parts.join(' · ') : '—'}</span>;
}

export default Ops;
