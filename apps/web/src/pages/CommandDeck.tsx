import { AiProse } from '@/components/ai/AiProse';
import { Fig, FigGrid } from '@/components/fig/Fig';
import { chordFor } from '@/components/fig/figAddress';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Command, RefreshCw, AlertTriangle, Rocket, Layers, Users, ShieldAlert,
  GitBranch, Scale, DollarSign, HelpCircle, CheckCircle2, Circle, Ban,
  Dices, Bot, Send, Check,
} from 'lucide-react';
import {
  fetchCommandOverview, fetchCommandPartners, fetchCommandTasks, fetchCommandDecisions,
  fetchCommandRisks, fetchCommandFinancials, seedCommand,
  fetchLaunchSim, invokeCommandAction, askProgram, draftDecisionMemo,
  type CommandOverview, type CommandPartner, type CommandTask, type CommandDecision,
  type CommandRisk, type CommandFinancial, type LaunchSim, type ProgramAnswer,
} from '@/lib/api/command';
import { EmptyState, PageSkeleton, toast } from '@/components/shared';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import { verbsFor, blockedExplanation, type Principal } from '@/components/command/grammar';
import { invoke } from '@/components/command/invoke';
import { useAccessStore } from '@/stores/useAccessStore';
import { useOperatorStore } from '@/stores';
import { DeepOntologyPanel } from '@/components/command/DeepOntologyPanel';
import { ReadinessDial, LpOptimizerPanel, FunnelSimPanel } from '@/components/command/CockpitPanels';
import { AnalyticReviews } from '@/components/intel/AnalyticReviews';
import { PrintStyles } from '@/components/report/PrintStyles';
import { PageTitle, Button } from '@/components/ui';
import { safeHref } from '@/lib/safeHref';
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
  in_progress: 'text-cyan-700 dark:text-cyan-400', open: 'text-cyan-700 dark:text-cyan-400',
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
    /* `relative` so W5's backdrop has a positioned ancestor to fill, and `isolate` so its
       negative z-index cannot escape behind this page's own container and vanish. */
    <div className="br-page relative isolate mx-auto max-w-[1400px] p-5">
      {/* W5 · THE SIGNATURE BACKDROP IS GONE. It moved from this page to the shell on 2026-08-15
          (two mounts seamed at this container's edge), and the shell's copy was removed on
          2026-09-02 under INSTRUMENT_100X_PLAN S5: it drew nothing in the default theme and an
          empty plate in dark, on 77 routes — see docs/instrument/LEDGER.md §5 for the measured
          reasons. `relative isolate` above stays: it is what keeps this page's own negative
          z-index layers (E1/E5 when open) inside the page. */}
      <PrintStyles />
      <PageTitle
        icon={<Command size={20} />}
        subtitle="The US-launch operating picture — products, partners, workstreams, the critical path, risks, and decisions as one deck for the CEO."
        actions={
          <div className="br-no-print flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={printBoardPack}>Board Pack (print)</Button>
            <Button size="sm" variant="secondary" onClick={reseed} disabled={busy}><RefreshCw size={13} className={busy ? 'animate-spin motion-essential' : ''} /> Re-seed</Button>
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
      {/* S6 · the counts strip as figures — dated by the overview's own `generatedAt`, each with its delta since
          the operator's last arrival, each one keystroke away. */}
      <FigGrid cols={6}>
        <Fig id="command.products" address={chordFor('command')} label="products" value={o.counts.products} kind="int" source={{ at: o.generatedAt, kind: 'record' }} />
        <Fig id="command.partners" address={chordFor('command')} label="partners" value={o.counts.partners} kind="int" source={{ at: o.generatedAt, kind: 'record' }} />
        <Fig id="command.workstreams" address={chordFor('command')} label="workstreams" value={o.counts.workstreams} kind="int" source={{ at: o.generatedAt, kind: 'record' }} />
        <Fig id="command.tasks" address={chordFor('command')} label="tasks" value={o.counts.tasks} kind="int" source={{ at: o.generatedAt, kind: 'record' }} />
        <Fig id="command.decisions-open" address={chordFor('command')} label="open decisions" value={o.decisions.open} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} />
        <Fig id="command.risks" address={chordFor('command')} label={o.topRisks.some((r) => r.impact === 'Critical') ? 'risks · critical present' : 'risks'} value={o.counts.risks} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} />
      </FigGrid>
      <FigGrid cols={6} className="mt-1">
        <Fig id="command.gating-done" address={chordFor('command')} label="gates passed" value={o.launch.gatingDone} kind="int" source={{ at: o.generatedAt, kind: 'record' }} />
        <Fig id="command.gating-total" address={chordFor('command')} label="gates total" value={o.launch.gatingTotal} kind="int" source={{ at: o.generatedAt, kind: 'record' }} />
        <Fig id="command.gating-pct" address={chordFor('command')} label="gating complete" value={o.launch.gatingTotal > 0 ? (o.launch.gatingDone / o.launch.gatingTotal) * 100 : null} kind="pct" source={{ at: o.generatedAt, kind: 'derived' }} />
        <Fig id="command.decisions-total" address={chordFor('command')} label="decisions recorded" value={o.decisions.total} kind="int" source={{ at: o.generatedAt, kind: 'record' }} />
        <Fig id="command.targets-unconfirmed" address={chordFor('command')} label="unconfirmed targets" value={o.gaps.unconfirmedTargets} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} />
        <Fig id="command.assumptions" address={chordFor('command')} label="planning assumptions" value={o.gaps.planningAssumptions} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} />
      </FigGrid>

      {/* E1 THE THEATRE — RETIRED 2026-09-02 (INSTRUMENT_100X_PLAN S5, §3.1). The GL room that wrapped
          this deck carried depth ORDER only — the sequence the flat deck below already carries as a list —
          and FINAL_SCORECARD §4 measured no data mark above the chroma floor in either theme and a light
          render flattened to 42%. The reading always lived in DOM (§6 rule 4); the room is gone and the
          reading is unchanged. docs/3d/e1/README.md carries the decision. */}
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
                  <span className="text-cyan-700 dark:text-cyan-400">{w.open} open</span>
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
                {f.assumption && <span className="shrink-0 rounded bg-amber-500/10 px-1 text-micro font-semibold text-amber-600 dark:text-amber-400">assumption</span>}
              </div>
            ))}
          </div>
        </Panel>

        {/* Data gaps — the non-fabrication ledger */}
        <Panel icon={<HelpCircle size={13} />} title="Data gaps (nothing fabricated)">
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Fig id="command.gap-partners-contact" address={chordFor('command')} label="partners missing contact" value={o.gaps.partnersMissingContact} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} className="border-t-0" />
            <Fig id="command.gap-partners-terms" address={chordFor('command')} label="partners missing terms" value={o.gaps.partnersMissingTerms} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} className="border-t-0" />
            <Fig id="command.gap-assumptions" address={chordFor('command')} label="planning assumptions" value={o.gaps.planningAssumptions} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} className="border-t-0" />
            <Fig id="command.gap-targets" address={chordFor('command')} label="unconfirmed targets" value={o.gaps.unconfirmedTargets} kind="int" source={{ at: o.generatedAt, kind: 'record' }} goodIsUp={false} className="border-t-0" />
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
      <div className="mt-1 flex justify-between px-1 text-micro text-grey"><span>← likelihood</span><span>impact →</span></div>
    </div>
  );
}

/**
 * The WRITE vocabulary for a program task — mirrors the zod enum on
 * apps/api/src/actions/registry.ts:233, which is the gate that actually validates
 * the governed action, so any status added here and not there is rejected server-side.
 *
 * ── THE SPLIT WITH `FINISHED_STATUSES` IS DELIBERATE AND PENDING THE OWNER'S CALL ──
 * The only TERMINAL status an operator can set here is 'done'. The read-side set
 * `FINISHED_STATUSES` below treats four ('done', 'complete', 'completed', 'live')
 * as finished, because seeded rows and direct SQL writes carry those. Unifying the
 * two would change what counts as finished on a live surface — see the note at
 * `FINISHED_STATUSES` for why neither side is being moved here.
 */
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
              {(indeg.get(t.id) ?? 0) >= 2 && <span className="shrink-0 rounded bg-cyan-500/10 px-1 text-micro font-bold text-cyan-700 dark:text-cyan-300">unblocks {indeg.get(t.id)}</span>}
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
      <p className="text-micro text-grey">Status changes run through the governed action registry — audited, attributed.</p>
    </div>
  );
}

/** Program-critical decisions gated on tradecraft (100X Phase 4.2). */
const CRITICAL_DECISIONS = new Set(['dec_01', 'dec_19']);

/**
 * One decision row with the governed decide flow (Wave 2) + SAT gate (Phase 4)
 * + the reopen affordance (TERMINAL Phase 7, T1 #28).
 *
 * `command_reopen_decision` was already reachable — ⌘K generates every verb from
 * the manifest — but no SURFACE named it, so an operator looking at a decision
 * recorded on evidence that later turned out wrong had nothing telling them the
 * capability exists. Reachable is not discoverable.
 *
 * Which verb to show, and whether it is runnable, is NOT decided here: `verbsFor`
 * decides, from the same generated manifest the command line uses, so this row and
 * ⌘K cannot disagree about the rules. That also means the Phase 3 judgement calls
 * come for free and stay tested in grammar.test.ts:
 *   - wrong state (status='open') → the precondition filters it out → ABSENT;
 *   - insufficient authority (not approver, or no 'approve' on `command`) → PRESENT
 *     and blocked, with what to request. Hiding it would teach the operator the
 *     capability does not exist.
 * And the write goes through `invoke`, i.e. POST /v1/actions/:id/invoke — the same
 * single audited door. No second write path.
 */
function DecisionRow({ d, onChange }: { d: CommandDecision; onChange: () => void }) {
  const [deciding, setDeciding] = useState(false);
  const [chosen, setChosen] = useState(d.recommendation ?? '');
  const [busy, setBusy] = useState(false);
  const [tradecraft, setTradecraft] = useState(false);
  const [memo, setMemo] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const critical = CRITICAL_DECISIONS.has(d.id);

  const operator = useOperatorStore((s) => s.operator);
  const accessMe = useAccessStore((s) => s.me);
  const reopen = useMemo(() => {
    const principal: Principal = {
      role: operator?.role === 'approver' ? 'approver' : 'operator',
      entitlements: (accessMe?.entitlements ?? {}) as Principal['entitlements'],
    };
    return verbsFor(
      ACTION_MANIFEST,
      { type: 'command_decision', id: d.id, label: d.decision, state: { status: d.status } },
      principal,
    ).find((v) => v.action.id === 'command_reopen_decision') ?? null;
  }, [operator, accessMe, d.id, d.decision, d.status]);

  const doReopen = async () => {
    // The server requires a NON-BLANK reason (registry.ts: min(1) plus a refine that
    // rejects whitespace), because un-recording a decision without a justification in
    // the audit beside it is the one thing this action must not permit. Trimming here
    // is a courtesy so the operator is not round-tripped for a stray space; it is not
    // the enforcement.
    if (!reason.trim() || busy) return;
    setBusy(true);
    const out = await invoke('command_reopen_decision', 'command_decision', d.id, { reason: reason.trim() });
    setBusy(false);
    if (!out.ok) { toast('error', out.remedy); return; }
    toast('success', 'Reopened — the reason is in the audit, and the decision log says it was superseded');
    setReopening(false);
    setReason('');
    onChange();
  };

  const decide = async () => {
    if (!chosen.trim() || busy) return;
    setBusy(true);
    try {
      await invokeCommandAction('command_decide', 'command_decision', d.id, { chosen: chosen.trim() });
      toast('success', 'Decision recorded — mirrored to the decision log');
      setDeciding(false);
      onChange();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Decide failed';
      toast('error', msg);
      if (msg.includes('tradecraft')) setTradecraft(true); // open the SAT panel right here
    }
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
          <button onClick={() => setDeciding(true)} className="shrink-0 text-micro font-semibold text-cyan-700 hover:underline dark:text-cyan-400">Decide</button>
        )}
        {reopen && !reopening && (
          reopen.blocked ? (
            // Shown refused, not hidden: the operator learns the capability exists
            // and what authority it needs. The reason renders as visible text below
            // rather than a `title` tooltip — a tooltip is not reachable by keyboard,
            // and "why can't I do this?" is exactly the sentence that must not hide.
            <span className="inline-flex shrink-0 items-center gap-1 text-micro font-semibold text-amber-600 dark:text-amber-400">
              <ShieldAlert size={11} /> Reopen — blocked
            </span>
          ) : (
            <button
              onClick={() => setReopening(true)}
              className="shrink-0 text-micro font-semibold text-amber-600 hover:underline dark:text-amber-400"
            >
              Reopen
            </button>
          )
        )}
      </div>
      {reopen?.blocked && !reopening && (
        <p className="mt-0.5 text-micro text-amber-700 dark:text-amber-300">{blockedExplanation(reopen.blocked)}</p>
      )}
      {reopen && !reopen.blocked && reopening && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doReopen(); if (e.key === 'Escape') setReopening(false); }}
            placeholder="Why is this being un-decided? (recorded in the audit)"
            maxLength={500}
            aria-label={`Reason for reopening ${d.decision}`}
            className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1 text-micro text-navy outline-none focus:border-amber-500"
          />
          <Button size="xs" onClick={() => void doReopen()} disabled={!reason.trim() || busy}>{busy ? '…' : 'Reopen'}</Button>
          <Button size="xs" variant="secondary" onClick={() => { setReopening(false); setReason(''); }}>Cancel</Button>
        </div>
      )}
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
      {d.status !== 'decided' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {critical && (
            <button onClick={() => setTradecraft((v) => !v)}
              className="text-micro font-semibold text-amber-600 hover:underline dark:text-amber-400">
              ⚠ Program-critical — premortem + devil's advocate required {tradecraft ? '▾' : '▸'}
            </button>
          )}
          <button
            onClick={() => { setBusy(true); draftDecisionMemo(d.id).then((m) => { setMemo(m.memo); }).catch(() => toast('error', 'Memo failed')).finally(() => setBusy(false)); }}
            disabled={busy}
            className="text-micro font-semibold text-cyan-700 hover:underline disabled:opacity-50 dark:text-cyan-400">
            🤖 Draft memo (AI)
          </button>
        </div>
      )}
      {memo && d.status !== 'decided' && (
        <div className="mt-1.5 rounded border border-cyan-500/30 p-2"><AiProse text={memo} className="text-micro" /></div>
      )}
      {critical && tradecraft && d.status !== 'decided' && (
        <div className="mt-1.5"><AnalyticReviews subjectType="command_decision" subjectId={d.id} /></div>
      )}
    </div>
  );
}

/**
 * The one definition of "finished" this panel uses for READING, for BOTH lists on
 * it. These are exactly the statuses whose duration default is 0/0/0 in
 * packages/shared/src/launchSim.ts, and they match the set
 * apps/api/src/ai/commandOperator.ts:82 and apps/api/src/command/overview.ts:29
 * use. The criticality list previously filtered the single status 'done' while the
 * days-bought list filtered nothing, so a finished task appeared in the withheld
 * line — "we cannot tell you" for work that is over. Zero of the 24 production
 * tasks are in any terminal state today, so nothing visible moves; it is fixed now
 * because it is cheap now.
 *
 * ── THE SPLIT WITH `TASK_STATUSES` IS DELIBERATE AND PENDING THE OWNER'S CALL ──
 * `TASK_STATUSES` above (this file, the status <select> on CriticalPath) is the
 * WRITE vocabulary, and its only terminal member is 'done'. So an operator can
 * only ever mark a task 'done', while this READ set treats four statuses as
 * finished. The other three can therefore only arrive from the seed extract or a
 * direct SQL write — they are not reachable through the UI.
 * The two are NOT unified here on purpose: widening the write list would let an
 * operator create states nothing else in the program models, and narrowing this
 * read set to 'done' alone would reclassify any already-seeded 'complete' /
 * 'completed' / 'live' task as unfinished — which changes what counts as finished
 * on a live surface. That is the owner's decision, not this lane's.
 */
const FINISHED_STATUSES = new Set(['done', 'complete', 'completed', 'live']);
const isFinished = (status: string) => FINISHED_STATUSES.has(status);

/**
 * Days-of-launch bought per day of compression — the MAGNITUDE ranking, beside
 * the frequency one. Already sorted by the API (launchSim.ts), so this renders
 * in order and does not re-sort. Withheld slopes are shown as their refusal
 * code: a null slope means "the question does not apply", which is not 0.
 */
function CompressionList({ sim }: { sim: LaunchSim }) {
  const rows = sim.compression;
  // Three states kept apart: field absent (API predates this limb) / present but
  // every row withheld / genuinely nothing to rank.
  if (!rows) return <p className="text-micro text-grey">Days-bought ranking not returned by this API build.</p>;
  if (rows.length === 0) return <p className="text-micro text-grey">No tasks in the simulated graph.</p>;

  const ranked = rows.filter((c) => c.daysBoughtPerDay !== null);
  // FOUR states, not three: scored / withheld with a reason / already finished /
  // absent. A finished task is not withheld information.
  const finished = rows.filter((c) => c.daysBoughtPerDay === null && isFinished(c.status));
  const withheld = rows.filter((c) => c.daysBoughtPerDay === null && !isFinished(c.status));
  const step = sim.compressionStepDays ?? 1;
  // The ObservationFrame is PER ROW: slopeRuns is the number of runs that row's
  // slope was averaged over, which is not the makespan run count and need not be
  // the same for two rows. Borrowing row 0's count and printing it under every
  // row was accidentally right only because every status default has min > 0.
  const slopeRunCounts = ranked.map((c) => c.slopeRuns);
  const runsLo = slopeRunCounts.length ? Math.min(...slopeRunCounts) : null;
  const runsHi = slopeRunCounts.length ? Math.max(...slopeRunCounts) : null;

  return (
    <div className="mt-3">
      <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">
        Days of launch bought per day of compression
      </div>
      {ranked.length === 0 ? (
        <p className="text-micro text-grey">Every task's slope is withheld — see the codes below.</p>
      ) : (
        <div className="space-y-1">
          {ranked.slice(0, 5).map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-micro text-grey-dark">{c.title}</span>
              <span className="shrink-0 font-mono text-micro text-grey">
                {/*
                  The shared `TaskCompression.meanSlackDays` is NON-nullable by
                  design, so this guard is unreachable through the type. It stays
                  because JSON.stringify turns a non-finite number into `null` on
                  the wire, and printing "nulld float" is worse than saying n/a.
                */}
                {c.meanSlackDays != null ? `${c.meanSlackDays}d float` : 'float n/a'}
                {/*
                  The binding edge is MODAL, not certain: bindingPredecessorRuns
                  is the number of runs in which that predecessor set the start.
                  Measured 34% of runs on three symmetric predecessors — "bound
                  by X" flat told the reader a dependency binds the task when in
                  fact it does not in two runs out of three.
                */}
                {c.bindingPredecessor
                  ? ` · bound by ${c.bindingPredecessor} in ${Math.round((c.bindingPredecessorRuns / Math.max(1, sim.runs)) * 100)}% of runs`
                  : ''}
              </span>
              <span className="w-24 shrink-0 text-right font-mono text-micro text-navy">
                {c.daysBoughtPerDay!.toFixed(3)} ±{(c.slopeStdErr ?? 0).toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      )}
      {withheld.length > 0 && (
        <p className="mt-1 text-micro text-grey">
          {withheld.length} task{withheld.length === 1 ? '' : 's'} withheld, not scored 0:{' '}
          {withheld.slice(0, 4).map((c) => `${c.title} (${c.code})`).join(' · ')}
          {withheld.length > 4 ? ' …' : ''}
        </p>
      )}
      {finished.length > 0 && (
        <p className="mt-1 text-micro text-grey">
          {finished.length} task{finished.length === 1 ? '' : 's'} not ranked because the work is finished (nothing to compress):{' '}
          {finished.slice(0, 4).map((c) => c.title).join(' · ')}
          {finished.length > 4 ? ' …' : ''}
        </p>
      )}
      <p className="mt-1 text-micro text-grey">
        Finite {step}-day compression, mean ± standard error.{' '}
        {runsLo != null && runsHi != null
          ? runsLo === runsHi
            ? `Every slope above is averaged over ${runsLo.toLocaleString()} of the ${sim.runs.toLocaleString()} simulation runs.`
            : `Each slope is averaged over its OWN run count (${runsLo.toLocaleString()}–${runsHi.toLocaleString()} of the ${sim.runs.toLocaleString()} simulation runs).`
          : `${sim.runs.toLocaleString()} simulation runs.`}{' '}
        A slope of 0 is measured: compressing that task buys nothing because a parallel branch takes over.
      </p>
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
            {/*
              Was "Highest criticality (drives the date)" — a causal claim about
              a frequency. `criticality` is the SHARE OF RUNS a task sat on the
              critical path; it does not say compressing it moves the date. Two
              tasks can both be critical in every run while shortening one buys
              nothing. The magnitude ranking is CompressionList below.
              Both lists on this panel now use ONE definition of finished
              (FINISHED_STATUSES above) instead of this list filtering 'done'
              and the days-bought list filtering nothing.
              Neither list is sorted here; both arrive ordered from launchSim.ts.
            */}
            <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">
              Most often on the critical path <span className="normal-case text-grey">(frequency, not days)</span>
            </div>
            <div className="space-y-1">
              {sim.criticality.filter((c) => !isFinished(c.status)).slice(0, 5).map((c) => (
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
          <CompressionList sim={sim} />
          {sim.warnings.length > 0 && <p className="mt-2 text-micro text-amber-600 dark:text-amber-400">⚠ {sim.warnings.join(' · ')}</p>}
          <p className="mt-2 text-micro text-grey">{sim.disclaimer} {sim.runs.toLocaleString()} runs, seeded.</p>
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
          <AiProse text={res.answer} />
          {res.citations && res.citations.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {res.citations.map((s) => (
                /* `?? '#'` used to stand in for a missing source URL, which made an
                   uncited citation LOOK navigable and then go nowhere. An absent href
                   renders the chip as plain text — not-navigable is the honest state,
                   and safeHref returns that same undefined for a hostile scheme. */
                <a key={s.id} href={safeHref(s.url)} target="_blank" rel="noreferrer"
                  className="rounded border border-cyan-500/40 bg-cyan-500/5 px-1.5 py-0.5 font-mono text-micro font-bold text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300"
                  title={s.label}>
                  {s.id}
                </a>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-micro text-grey">
            Grounded in the command graph + deep ontology + planning simulation{res.usedLlm ? ' · AI-composed, source-cited' : ' · deterministic readout (no AI answer; this engine does not report the cause)'}
          </p>
        </div>
      )}
    </Panel>
  );
}
