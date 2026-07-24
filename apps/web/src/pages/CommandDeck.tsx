import { useCallback, useEffect, useState } from 'react';
import {
  Command, RefreshCw, AlertTriangle, Rocket, Layers, Users, ShieldAlert,
  GitBranch, Scale, DollarSign, HelpCircle, CheckCircle2, Circle, Ban,
  Dices, Bot, Send, Check,
} from 'lucide-react';
import {
  fetchCommandOverview, fetchCommandPartners, fetchCommandTasks, fetchCommandDecisions,
  fetchCommandRisks, fetchCommandFinancials, seedCommand,
  fetchLaunchSim, invokeCommandAction, askProgram,
  type CommandOverview, type CommandPartner, type CommandTask, type CommandDecision,
  type CommandRisk, type CommandFinancial, type LaunchSim, type ProgramAnswer,
} from '@/lib/api/command';
import { EmptyState, PageSkeleton, toast } from '@/components/shared';
import { DeepOntologyPanel } from '@/components/command/DeepOntologyPanel';
import { ReadinessDial, LpOptimizerPanel, FunnelSimPanel } from '@/components/command/CockpitPanels';
import { PrintStyles } from '@/components/report/PrintStyles';
import { PageTitle, Button } from '@/components/ui';
import { clsx } from 'clsx';

/**
 * LCX COMMAND — the CEO's US-launch command deck (Wave 1). A single deck of
 * panels over the program ontology: launch readiness + the unconfirmed anchor,
 * the workstream rollup, the partner pipeline, the critical path, the risk
 * heatmap, the decisions register, financial assumptions, and an honest
 * data-gaps ledger. Seeded from the strategy extract; nothing is fabricated.
 */
const IMPACT_TONE: Record<string, string> = {
  Critical: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40',
  High: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40',
  Medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  Low: 'bg-grey/10 text-grey-dark border-line',
};
const STATUS_TONE: Record<string, string> = {
  in_progress: 'text-cyan-600 dark:text-cyan-400', open: 'text-cyan-600 dark:text-cyan-400',
  blocked: 'text-red-500', tentative: 'text-amber-600 dark:text-amber-400',
  pending: 'text-amber-600 dark:text-amber-400', not_started: 'text-grey', future: 'text-grey',
};

interface Deck {
  overview: CommandOverview; partners: CommandPartner[]; tasks: CommandTask[];
  decisions: CommandDecision[]; risks: CommandRisk[]; financials: CommandFinancial[];
}

export function CommandDeck() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null); setDeck(null);
    Promise.all([
      fetchCommandOverview(), fetchCommandPartners(), fetchCommandTasks(),
      fetchCommandDecisions(), fetchCommandRisks(), fetchCommandFinancials(),
    ])
      .then(([overview, partners, tasks, decisions, risks, financials]) =>
        setDeck({ overview, partners, tasks, decisions, risks, financials }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(load, [load]);

  const reseed = async () => {
    setBusy(true);
    try { const r = await seedCommand(); toast('success', `Seeded ${r.partners} partners · ${r.tasks} tasks · ${r.decisions} decisions`); load(); }
    catch { toast('error', 'Seed failed'); }
    finally { setBusy(false); }
  };

  const printBoardPack = () => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (wasDark) root.classList.remove('dark');
    setTimeout(() => { window.print(); if (wasDark) root.classList.add('dark'); }, 60);
  };

  return (
    <div className="br-page mx-auto max-w-[1400px] p-5">
      <PrintStyles />
      <PageTitle
        icon={<Command size={20} />}
        subtitle="The US-launch operating picture — products, partners, workstreams, the critical path, risks, and decisions as one deck for the CEO."
        actions={
          <div className="br-no-print flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={printBoardPack}>Board Pack (print)</Button>
            <Button size="sm" variant="secondary" onClick={reseed} disabled={busy}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Re-seed</Button>
          </div>
        }
      >
        LCX Command · US Launch
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Command deck unavailable" description={error} />
      ) : !deck ? (
        <PageSkeleton />
      ) : deck.overview.counts.partners === 0 ? (
        <EmptyState variant="default" title="No launch data yet" description="Run Re-seed to load the US-launch strategy extract into the command deck." />
      ) : (
        <Loaded deck={deck} onChange={load} />
      )}
    </div>
  );
}

function Loaded({ deck, onChange }: { deck: Deck; onChange: () => void }) {
  const { overview: o } = deck;
  return (
    <div className="space-y-4">
      {/* Anchor banner — the launch date is the unconfirmed variable everything keys off. */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <span className="text-label font-bold text-navy">Launch anchor — UNCONFIRMED. </span>
          <span className="text-label text-grey-dark">{o.launch.anchor}</span>
        </div>
      </div>

      {/* The headline instrument — composite launch readiness (100X Phase 3) */}
      <ReadinessDial />

      {/* Counts strip */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Products" value={o.counts.products} />
        <Stat label="Partners" value={o.counts.partners} />
        <Stat label="Workstreams" value={o.counts.workstreams} />
        <Stat label="Tasks" value={o.counts.tasks} />
        <Stat label="Open decisions" value={o.decisions.open} tone="warn" />
        <Stat label="Risks" value={o.counts.risks} tone={o.topRisks.some((r) => r.impact === 'Critical') ? 'bad' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Launch readiness */}
        <Panel icon={<Rocket size={13} />} title="Launch readiness — gating chain">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${o.launch.gatingTotal ? (o.launch.gatingDone / o.launch.gatingTotal) * 100 : 0}%` }} />
            </div>
            <span className="text-label font-bold tabular-nums text-navy">{o.launch.gatingDone}/{o.launch.gatingTotal}</span>
          </div>
          <div className="space-y-1">
            {o.launch.gating.map((g) => (
              <div key={g.id} className="flex items-center gap-1.5 text-label">
                {g.done ? <CheckCircle2 size={12} className="shrink-0 text-emerald-500" /> : <Circle size={12} className={clsx('shrink-0', STATUS_TONE[g.status] ?? 'text-grey')} />}
                <span className="min-w-0 flex-1 truncate text-grey-dark">{g.title}</span>
                <span className={clsx('shrink-0 font-mono text-micro', STATUS_TONE[g.status] ?? 'text-grey')}>{g.status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line/60 pt-2">
            <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Milestone targets</div>
            {o.launch.targets.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 py-0.5 text-micro">
                <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', t.confirmed ? 'bg-emerald-500' : 'bg-amber-500')} />
                <span className="min-w-0 flex-1 truncate text-grey-dark">{t.name}</span>
                <span className="shrink-0 font-mono text-grey">{t.targetDate ?? '—'}{!t.confirmed && ' · tentative'}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Workstream rollup */}
        <Panel icon={<Layers size={13} />} title="Workstreams">
          <div className="space-y-2">
            {o.workstreams.map((w) => (
              <div key={w.id} className="rounded border border-line/70 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-label font-semibold text-navy">{w.name}</span>
                  {w.owner && <span className="shrink-0 text-micro text-grey">{w.owner}</span>}
                </div>
                <div className="mt-1 flex items-center gap-3 text-micro">
                  <span className="text-grey">{w.total} tasks</span>
                  {w.done > 0 && <span className="text-emerald-600 dark:text-emerald-400">{w.done} done</span>}
                  <span className="text-cyan-600 dark:text-cyan-400">{w.open} open</span>
                  {w.blocked > 0 && <span className="text-red-500">{w.blocked} blocked</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Partner pipeline by type */}
        <Panel icon={<Users size={13} />} title={`Partner pipeline (${o.counts.partners})`}>
          <div className="space-y-1.5">
            {o.partnersByType.map((p) => {
              const max = Math.max(...o.partnersByType.map((x) => x.total), 1);
              return (
                <div key={p.type} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-micro text-grey-dark">{p.type}</span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded bg-ice-soft dark:bg-ice-soft/10">
                    <div className="h-full rounded bg-cyan-500/70" style={{ width: `${(p.total / max) * 100}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-micro text-navy">{p.total}{p.recommended > 0 && <span className="text-emerald-600 dark:text-emerald-400"> ·{p.recommended}★</span>}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-micro text-grey">★ = recommended / onboarding. Contacts &amp; terms unfilled (Phase 1/2 RFIs).</p>
        </Panel>

        {/* Risk heatmap */}
        <Panel icon={<ShieldAlert size={13} />} title="Risk heatmap">
          <RiskHeat risks={deck.risks} />
          <div className="mt-2 space-y-1 border-t border-line/60 pt-2">
            {o.topRisks.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 text-micro">
                <span className={clsx('shrink-0 rounded border px-1 py-0.5 font-bold', IMPACT_TONE[r.impact] ?? IMPACT_TONE.Low)}>{r.impact}</span>
                <span className="min-w-0 flex-1 truncate text-grey-dark" title={r.mitigation}>{r.title}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Launch Monte Carlo (Wave 2) */}
        <LaunchSimPanel />
        {/* Ask the program (Wave 3) */}
        <AskProgramPanel />
      </div>

      {/* The engines as instruments (100X Phase 3) */}
      <LpOptimizerPanel />
      <FunnelSimPanel />

      {/* Deep ontology — the strategy's own models, fully traceable (100X Phase 1) */}
      <DeepOntologyPanel />

      {/* Critical path — the gating tasks + anything blocked */}
      <Panel icon={<GitBranch size={13} />} title="Critical path to launch">
        <CriticalPath tasks={deck.tasks} onChange={onChange} />
      </Panel>

      {/* Decisions register — governed decide flow (Wave 2) */}
      <Panel icon={<Scale size={13} />} title={`Decisions register (${o.decisions.open} open)`}>
        <div className="grid gap-2 md:grid-cols-2">
          {deck.decisions.map((d) => <DecisionRow key={d.id} d={d} onChange={onChange} />)}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Financials */}
        <Panel icon={<DollarSign size={13} />} title="Financial assumptions">
          <div className="space-y-1">
            {deck.financials.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-micro">
                <span className="min-w-0 flex-1 truncate text-grey-dark">{f.item}</span>
                <span className="shrink-0 font-mono text-navy">{f.value}{f.unit && f.unit !== 'model' ? ` ${f.unit}` : ''}</span>
                {f.assumption && <span className="shrink-0 rounded bg-amber-500/10 px-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">assumption</span>}
              </div>
            ))}
          </div>
        </Panel>

        {/* Data gaps — the non-fabrication ledger */}
        <Panel icon={<HelpCircle size={13} />} title="Data gaps (nothing fabricated)">
          <div className="mb-2 grid grid-cols-2 gap-2">
            <GapStat label="Partners missing contact" value={o.gaps.partnersMissingContact} />
            <GapStat label="Partners missing terms" value={o.gaps.partnersMissingTerms} />
            <GapStat label="Planning assumptions" value={o.gaps.planningAssumptions} />
            <GapStat label="Unconfirmed targets" value={o.gaps.unconfirmedTargets} />
          </div>
          <ul className="space-y-0.5">
            {o.gaps.notes.map((note, i) => (
              <li key={i} className="flex items-start gap-1.5 text-micro text-grey-dark"><span className="mt-1 text-grey">•</span>{note}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">{icon} {title}</div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-card p-2.5 shadow-card">
      <div className="text-micro text-grey">{label}</div>
      <div className={clsx('text-h3 font-bold tabular-nums', tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-navy')}>{value}</div>
    </div>
  );
}

function GapStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-line/70 p-2">
      <div className="text-h3 font-bold tabular-nums text-navy">{value}</div>
      <div className="text-micro text-grey">{label}</div>
    </div>
  );
}

/** Likelihood × impact grid. */
function RiskHeat({ risks }: { risks: CommandRisk[] }) {
  const likelihoods = ['High', 'Medium', 'Low'];
  const impacts = ['Low', 'Medium', 'High', 'Critical'];
  const cell = (lk: string, im: string) => risks.filter((r) => r.likelihood === lk && r.impact === im).length;
  const tone = (im: string, count: number) => {
    if (count === 0) return 'bg-ice-soft/40 text-grey/40 dark:bg-ice-soft/5';
    return IMPACT_TONE[im] ?? IMPACT_TONE.Low;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-micro">
        <thead>
          <tr><th className="w-16" />{impacts.map((im) => <th key={im} className="font-semibold text-grey">{im}</th>)}</tr>
        </thead>
        <tbody>
          {likelihoods.map((lk) => (
            <tr key={lk}>
              <td className="text-right font-semibold text-grey">{lk}</td>
              {impacts.map((im) => {
                const count = cell(lk, im);
                return <td key={im} className={clsx('rounded border py-1.5 font-bold', tone(im, count))}>{count || ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex justify-between px-1 text-[10px] text-grey"><span>← likelihood</span><span>impact →</span></div>
    </div>
  );
}

const TASK_STATUSES = ['not_started', 'pending', 'open', 'in_progress', 'blocked', 'tentative', 'future', 'done'] as const;

/** Critical path: the gating/unblocker tasks + anything blocked, with governed status control. */
function CriticalPath({ tasks, onChange }: { tasks: CommandTask[]; onChange: () => void }) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Unblockers = tasks that many others depend on (high in-degree) + blocked tasks.
  const indeg = new Map<string, number>();
  for (const t of tasks) for (const dep of t.depends_on) indeg.set(dep, (indeg.get(dep) ?? 0) + 1);
  const unblockers = [...indeg.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).map(([id]) => byId.get(id)).filter(Boolean) as CommandTask[];
  const blocked = tasks.filter((t) => t.status === 'blocked');
  const rows = [...new Map([...unblockers, ...blocked].map((t) => [t.id, t])).values()];

  const setStatus = async (t: CommandTask, status: string) => {
    if (status === t.status || savingId) return;
    setSavingId(t.id);
    try {
      await invokeCommandAction('command_set_task_status', 'command_task', t.id, { status });
      toast('success', `${t.title} → ${status.replace(/_/g, ' ')}`);
      onChange();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Update failed'); }
    finally { setSavingId(null); }
  };

  if (rows.length === 0) return <p className="text-label text-grey">No blocking dependencies surfaced.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded border border-line/70 p-2">
          {t.status === 'blocked' ? <Ban size={13} className="shrink-0 text-red-500" /> : <GitBranch size={13} className="shrink-0 text-cyan-600 dark:text-cyan-400" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-label font-semibold text-navy">{t.title}</span>
              {(indeg.get(t.id) ?? 0) >= 2 && <span className="shrink-0 rounded bg-cyan-500/10 px-1 text-[10px] font-bold text-cyan-700 dark:text-cyan-300">unblocks {indeg.get(t.id)}</span>}
            </div>
            {t.depends_on.length > 0 && (
              <div className="mt-0.5 text-micro text-grey">needs: {t.depends_on.map((d) => byId.get(d)?.title ?? d).join(' · ')}</div>
            )}
          </div>
          <select
            value={t.status}
            disabled={savingId === t.id}
            onChange={(e) => void setStatus(t, e.target.value)}
            className={clsx('shrink-0 rounded border border-line bg-card px-1 py-0.5 font-mono text-micro outline-none focus:border-cyan-500 disabled:opacity-50', STATUS_TONE[t.status] ?? 'text-grey')}
            aria-label={`Status of ${t.title}`}
          >
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      ))}
      <p className="text-[10px] text-grey">Status changes run through the governed action registry — audited, attributed.</p>
    </div>
  );
}

/** One decision row with the governed decide flow (Wave 2). */
function DecisionRow({ d, onChange }: { d: CommandDecision; onChange: () => void }) {
  const [deciding, setDeciding] = useState(false);
  const [chosen, setChosen] = useState(d.recommendation ?? '');
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    if (!chosen.trim() || busy) return;
    setBusy(true);
    try {
      await invokeCommandAction('command_decide', 'command_decision', d.id, { chosen: chosen.trim() });
      toast('success', 'Decision recorded — mirrored to the decision log');
      setDeciding(false);
      onChange();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Decide failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className={clsx('rounded border p-2', d.status === 'decided' ? 'border-emerald-500/40' : 'border-line/70')}>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 rounded bg-ice-soft px-1.5 py-0.5 text-micro font-bold text-grey-dark dark:bg-ice-soft/10">{d.phase}</span>
        <span className="min-w-0 flex-1 truncate text-label font-semibold text-navy">{d.decision}</span>
        {d.status === 'decided' ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-micro font-semibold text-emerald-600 dark:text-emerald-400"><Check size={11} /> decided</span>
        ) : deciding ? null : (
          <button onClick={() => setDeciding(true)} className="shrink-0 text-micro font-semibold text-cyan-600 hover:underline dark:text-cyan-400">Decide</button>
        )}
      </div>
      {d.status === 'decided' && d.chosen ? (
        <p className="mt-0.5 text-micro text-emerald-700 dark:text-emerald-300">✓ {d.chosen}</p>
      ) : d.recommendation ? (
        <p className="mt-0.5 text-micro text-grey">→ {d.recommendation}</p>
      ) : null}
      {deciding && d.status !== 'decided' && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            autoFocus value={chosen} onChange={(e) => setChosen(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void decide(); if (e.key === 'Escape') setDeciding(false); }}
            placeholder="The chosen option…"
            className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-micro text-navy outline-none focus:border-cyan-500"
          />
          <Button size="xs" onClick={() => void decide()} disabled={!chosen.trim() || busy}>{busy ? '…' : 'Record'}</Button>
          <Button size="xs" variant="secondary" onClick={() => setDeciding(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

/** Launch-schedule Monte Carlo panel (Wave 2) — planning simulation, clearly labeled. */
function LaunchSimPanel() {
  const [sim, setSim] = useState<LaunchSim | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchLaunchSim().then(setSim).catch((e) => setErr(e instanceof Error ? e.message : 'unavailable')); }, []);

  return (
    <Panel icon={<Dices size={13} />} title="Launch simulation (planning)">
      {err ? (
        <p className="text-label text-grey">{err}</p>
      ) : !sim ? (
        <p className="text-label text-grey">Simulating…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {([['P10', sim.p10Date, sim.p10Days], ['P50', sim.p50Date, sim.p50Days], ['P90', sim.p90Date, sim.p90Days]] as const).map(([label, date, days]) => (
              <div key={label} className="rounded border border-line/70 p-2 text-center">
                <div className="text-micro font-bold uppercase tracking-wider text-grey">{label}</div>
                <div className="font-mono text-label font-bold text-navy">{date}</div>
                <div className="text-micro text-grey">~{days}d</div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Highest criticality (drives the date)</div>
            <div className="space-y-1">
              {sim.criticality.filter((c) => c.status !== 'done').slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-micro text-grey-dark">{c.title}</span>
                  <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
                    <div className="h-full rounded-full bg-orange-500/80" style={{ width: `${Math.round(c.criticality * 100)}%` }} />
                  </div>
                  <span className="w-9 shrink-0 text-right font-mono text-micro text-navy">{Math.round(c.criticality * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          {sim.warnings.length > 0 && <p className="mt-2 text-micro text-amber-600 dark:text-amber-400">⚠ {sim.warnings.join(' · ')}</p>}
          <p className="mt-2 text-[10px] text-grey">{sim.disclaimer} {sim.runs.toLocaleString()} runs, seeded.</p>
        </>
      )}
    </Panel>
  );
}

/** Ask-the-program panel (Wave 3) — grounded AI over the command ontology. */
function AskProgramPanel() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ProgramAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setRes(null);
    try { setRes(await askProgram(question.trim())); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Query failed'); }
    finally { setBusy(false); }
  };

  return (
    <Panel icon={<Bot size={13} />} title="Ask the program">
      <div className="flex gap-1.5">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ask(q); }}
          placeholder="e.g. what unblocks if we hire the BSA officer this week?"
          className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-label text-navy outline-none focus:border-cyan-500"
        />
        <Button size="xs" onClick={() => void ask(q)} disabled={!q.trim() || busy}><Send size={11} /></Button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {['What is the critical path to launch?', 'What can start today?', 'Biggest risk right now?'].map((p) => (
          <button key={p} onClick={() => { setQ(p); void ask(p); }} disabled={busy}
            className="rounded border border-line px-1.5 py-0.5 text-micro text-grey hover:border-cyan-500/50 hover:text-navy disabled:opacity-50">
            {p}
          </button>
        ))}
      </div>
      {busy && <p className="mt-2 text-micro text-grey">Reading the program graph…</p>}
      {res && (
        <div className="mt-2 rounded border border-line/70 p-2.5">
          <p className="whitespace-pre-wrap text-label text-navy">{res.answer}</p>
          <p className="mt-1.5 text-[10px] text-grey">
            Grounded in the command graph + planning simulation{res.usedLlm ? ' · AI-composed' : ' · deterministic readout (no AI key set)'}
          </p>
        </div>
      )}
    </Panel>
  );
}
