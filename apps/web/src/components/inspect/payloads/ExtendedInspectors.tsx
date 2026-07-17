import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Boxes, Briefcase, CalendarClock, ExternalLink } from 'lucide-react';
import { fetchDealBoard, fetchDealEvents, fetchTasks, type BoardDeal, type OperatorTask } from '@/lib/api/bd';
import { fetchTriggers } from '@/lib/api/kpi';
import type { PostListingTrigger } from '@/types/kpi';
import type { DealEvent } from '@/types/bd';
import { TRIGGER_DAY_LABELS, TRIGGER_TYPE_LABELS } from '@/types/kpi';
import { states } from '@/data';
import { formatDate, formatMoney } from '@/lib/format';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui';
import { useInspectorStore } from '@/stores';
import { RelationRail } from '../RelationRail';
import type { InspectorPayloadProps } from './ProjectInspector';

/**
 * Thin L3 payloads for the ontology's long-tail types (FINAL_MASTER_PLAN 3.2).
 * Each is deliberately small: identity, vitals, relation pivots, one action —
 * enough that no object type ever dead-ends. Seed-tolerant: rows that open
 * these usually pass everything needed, and fetches only fill gaps.
 */

const SECTION = 'mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey';
const FACT_ROW = 'flex items-baseline justify-between gap-3 text-label';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={FACT_ROW}>
      <span className="text-grey">{label}</span>
      <span className="num-tabular min-w-0 truncate text-right font-semibold text-navy">{value}</span>
    </div>
  );
}

/* ─────────────────────────── Task ─────────────────────────── */

export function TaskInspector({ id, seed }: InspectorPayloadProps) {
  const push = useInspectorStore(s => s.push);
  const [task, setTask] = useState<OperatorTask | null>((seed as OperatorTask | undefined)?.id === id ? (seed as unknown as OperatorTask) : null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (task) return;
    let cancelled = false;
    Promise.all([fetchTasks('open'), fetchTasks('done')])
      .then(lists => {
        if (cancelled) return;
        const found = lists.flat().find(t => t.id === id);
        if (found) setTask(found);
        else setMissing(true);
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [id, task]);

  if (missing) return <EmptyState variant="error" title="Task not found" description="It may have been deleted." />;
  if (!task) return <CardSkeleton count={2} />;

  const overdue = task.status === 'open' && task.dueAt && Date.parse(task.dueAt) < Date.now();
  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-bold text-navy">{task.title}</div>
        {task.detail && <p className="mt-1 text-label text-grey">{task.detail}</p>}
      </div>
      <RelationRail
        items={[
          { label: 'project', count: task.projectId ? 1 : 0, icon: Boxes, onClick: () => task.projectId && push('project', task.projectId) },
          { label: 'deal', count: task.dealId ? 1 : 0, icon: Briefcase, onClick: () => task.dealId && push('deal', task.dealId) },
        ]}
      />
      <div className="space-y-1.5">
        <Fact label="Status" value={task.status} />
        <Fact label="Kind" value={task.kind} />
        {task.dueAt && <Fact label="Due" value={`${formatDate(task.dueAt)}${overdue ? ' · overdue' : ''}`} />}
        <Fact label="Created" value={formatDate(task.createdAt)} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Signal ─────────────────────────── */

interface SignalSeed {
  title?: string;
  detail?: string;
  kind?: string;
  severity?: string;
  projectId?: string;
  projectName?: string;
  ts?: string;
  url?: string;
}

export function SignalInspector({ seed }: InspectorPayloadProps) {
  const push = useInspectorStore(s => s.push);
  const navigate = useNavigate();
  const close = useInspectorStore(s => s.close);
  const s = (seed ?? {}) as SignalSeed;

  if (!s.title) {
    return (
      <EmptyState
        variant="default"
        title="Signal detail unavailable"
        description="This mention carried no payload — open Market News for the full feed."
        action={<Button size="sm" variant="secondary" onClick={() => { close(); navigate('/market-news'); }}>Open Market News</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-bold text-navy">{s.title}</div>
        {s.detail && <p className="mt-1 text-label text-grey">{s.detail}</p>}
      </div>
      <RelationRail
        items={[{ label: 'project', count: s.projectId ? 1 : 0, icon: Boxes, onClick: () => s.projectId && push('project', s.projectId) }]}
      />
      <div className="space-y-1.5">
        {s.kind && <Fact label="Type" value={s.kind} />}
        {s.severity && <Fact label="Severity" value={s.severity} />}
        {s.ts && <Fact label="Observed" value={formatDate(s.ts)} />}
      </div>
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-label font-semibold text-cyan-600 hover:underline">
          <ExternalLink size={12} /> Source
        </a>
      )}
    </div>
  );
}

/* ─────────────────────────── Listing (won deal + 30/60/90) ─────────────────────────── */

export function ListingInspector({ id }: InspectorPayloadProps) {
  const push = useInspectorStore(s => s.push);
  const [deal, setDeal] = useState<BoardDeal | null>(null);
  const [triggers, setTriggers] = useState<PostListingTrigger[] | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDealBoard()
      .then(deals => {
        if (cancelled) return;
        const found = deals.find(d => d.id === id);
        if (!found) return setMissing(true);
        setDeal(found);
        fetchTriggers(found.projectId)
          .then(t => !cancelled && setTriggers(t))
          .catch(() => !cancelled && setTriggers([]));
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) return <EmptyState variant="error" title="Listing not found" description="No deal record backs this listing." />;
  if (!deal) return <CardSkeleton count={2} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-base font-bold text-navy">{deal.projectName}</span>
        {deal.projectTicker && (
          <span className="rounded bg-ice-soft px-1.5 py-0.5 font-mono text-micro font-bold text-grey dark:bg-ice-soft/10">
            {deal.projectTicker}
          </span>
        )}
      </div>
      <RelationRail
        items={[
          { label: 'project', count: 1, icon: Boxes, onClick: () => push('project', deal.projectId) },
          { label: 'deal', count: 1, icon: Briefcase, onClick: () => push('deal', deal.id) },
        ]}
      />
      <div className="space-y-1.5">
        <Fact label="Package" value={`${deal.packageType ?? '—'} · ${deal.packageValue != null ? formatMoney(Math.round(deal.packageValue / 100)) : '—'}`} />
        {deal.wonAt && <Fact label="Listed" value={formatDate(deal.wonAt)} />}
      </div>
      <div>
        <div className={SECTION}>
          <CalendarClock size={11} className="text-cyan-500" />
          30/60/90 post-listing triggers
        </div>
        {triggers === null ? (
          <p className="text-micro italic text-grey">Loading…</p>
        ) : triggers.length === 0 ? (
          <p className="text-micro italic text-grey">No triggers scheduled for this listing.</p>
        ) : (
          <div className="space-y-1">
            {triggers.map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded border border-line px-2 py-1 text-micro">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.status === 'done' ? 'bg-emerald-500' : Date.parse(t.dueAt) < Date.now() ? 'bg-red-500' : 'bg-amber-500'}`} />
                <span className="font-semibold text-navy">{TRIGGER_DAY_LABELS[t.triggerDay]}</span>
                <span className="min-w-0 truncate text-grey">{TRIGGER_TYPE_LABELS[t.triggerType] ?? t.triggerType}</span>
                <span className="num-tabular ml-auto shrink-0 text-grey">{formatDate(t.dueAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Decision (win/loss call on a deal) ─────────────────────────── */

interface DecisionSeed {
  outcome?: 'won' | 'lost';
  reason?: string;
  category?: string;
}

export function DecisionInspector({ id, seed }: InspectorPayloadProps) {
  const push = useInspectorStore(s => s.push);
  const s = (seed ?? {}) as DecisionSeed;
  const [deal, setDeal] = useState<BoardDeal | null>(null);
  const [events, setEvents] = useState<DealEvent[] | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDealBoard()
      .then(deals => {
        if (cancelled) return;
        const found = deals.find(d => d.id === id);
        if (!found) return setMissing(true);
        setDeal(found);
      })
      .catch(() => !cancelled && setMissing(true));
    fetchDealEvents(id)
      .then(res => !cancelled && setEvents(res.data))
      .catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) return <EmptyState variant="error" title="Decision not found" description="No deal record backs this decision." />;
  if (!deal) return <CardSkeleton count={2} />;

  const outcome = s.outcome ?? (deal.stage === 'won' ? 'won' : deal.stage === 'lost' ? 'lost' : deal.stage);
  const terminalEvent = (events ?? []).find(e => e.newStage === 'won' || e.newStage === 'lost');

  return (
    <div className="space-y-4">
      <div>
        <span
          className={`rounded-md px-2 py-0.5 text-label font-bold uppercase ${
            outcome === 'won'
              ? 'bg-status-ready-bg text-status-ready'
              : 'bg-status-blocked-bg text-status-blocked'
          }`}
        >
          {outcome}
        </span>
        <span className="ml-2 text-base font-bold text-navy">{deal.projectName}</span>
      </div>
      <RelationRail
        items={[
          { label: 'deal', count: 1, icon: Briefcase, onClick: () => push('deal', deal.id) },
          { label: 'project', count: 1, icon: Boxes, onClick: () => push('project', deal.projectId) },
        ]}
      />
      <div className="space-y-1.5">
        {s.category && <Fact label="Category" value={s.category} />}
        <Fact label="Value" value={deal.packageValue != null ? formatMoney(Math.round(deal.packageValue / 100)) : '—'} />
        {(terminalEvent || deal.wonAt) && (
          <Fact label="Decided" value={formatDate(terminalEvent?.createdAt ?? deal.wonAt!)} />
        )}
        {terminalEvent?.actor && <Fact label="Actor" value={terminalEvent.actor} />}
      </div>
      {s.reason && (
        <div>
          <div className={SECTION}>
            <Activity size={11} className="text-cyan-500" />
            Rationale
          </div>
          <p className="rounded-md border border-line bg-ice-soft/40 p-2.5 text-label text-navy dark:bg-ice-soft/5">{s.reason}</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Jurisdiction ─────────────────────────── */

export function JurisdictionInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const close = useInspectorStore(st => st.close);
  const state = states.find(st => st.abbreviation.toLowerCase() === id.toLowerCase());

  if (!state) {
    // Non-US market codes (LI, DE, SG…) have no state dossier — offer posture context, never a dead end.
    return (
      <div className="space-y-4">
        <div className="text-base font-bold text-navy">{id.toUpperCase()}</div>
        <p className="text-label text-grey">
          Market outside the US state framework — regulatory posture is tracked at venue level (MiCA / local regime).
        </p>
        <Button size="sm" variant="secondary" onClick={() => { close(); navigate('/states'); }}>
          Open the jurisdiction map →
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-bold text-navy">{state.name}</div>
        <span className="font-mono text-micro font-bold uppercase tracking-wider text-grey">{state.abbreviation}</span>
      </div>
      <div className="space-y-1.5">
        <Fact label="Status" value={state.status} />
        <Fact label="Regime" value={state.regimeType} />
        <Fact label="Phase" value={String(state.phase)} />
        <Fact label="Priority" value={state.priority} />
        {state.regulator && <Fact label="Regulator" value={state.regulator} />}
        {state.estTimeline && <Fact label="Est. timeline" value={state.estTimeline} />}
      </div>
      {state.primaryPainPoint && <p className="text-label text-grey">{state.primaryPainPoint}</p>}
      <Button size="sm" variant="secondary" onClick={() => { close(); navigate('/states'); }}>
        Open on the state map →
      </Button>
    </div>
  );
}

/* ─────────────────────────── Document ─────────────────────────── */

interface DocumentSeed {
  title?: string;
  content?: string;
  kind?: string;
  projectId?: string;
  projectName?: string;
  updatedAt?: string;
}

export function DocumentInspector({ seed }: InspectorPayloadProps) {
  const push = useInspectorStore(st => st.push);
  const navigate = useNavigate();
  const close = useInspectorStore(st => st.close);
  const s = (seed ?? {}) as DocumentSeed;

  if (!s.title && !s.content) {
    return (
      <EmptyState
        variant="default"
        title="Document detail unavailable"
        description="This mention carried no payload — open Notes & Docs for the library."
        action={<Button size="sm" variant="secondary" onClick={() => { close(); navigate('/notes'); }}>Open Notes & Docs</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-bold text-navy">{s.title ?? 'Untitled document'}</div>
        {s.kind && <span className="font-mono text-micro font-bold uppercase tracking-wider text-grey">{s.kind}</span>}
      </div>
      <RelationRail
        items={[{ label: 'project', count: s.projectId ? 1 : 0, icon: Boxes, onClick: () => s.projectId && push('project', s.projectId) }]}
      />
      {s.updatedAt && <Fact label="Updated" value={formatDate(s.updatedAt)} />}
      {s.content && (
        <p className="whitespace-pre-wrap rounded-md border border-line bg-ice-soft/40 p-2.5 text-label leading-relaxed text-navy dark:bg-ice-soft/5">
          {s.content}
        </p>
      )}
    </div>
  );
}
