import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Building2,
  Gauge,
  Briefcase,
  Send,
  Inbox,
  ListChecks,
  FileText,
  Paperclip,
  Activity,
  ExternalLink,
  Pin,
  AlertTriangle,
} from 'lucide-react';
import { request } from '@/lib/apiClient';
import { PageTitle, SectionLabel, Button } from '@/components/ui';
import { PageSkeleton, EmptyState } from '@/components/shared';
import { EntityChip } from '@/components/entity';
import { BandBadge } from '@/components/bd';
import { PropensityTrail } from '@/components/bd/PropensityTrail';
import { GateBanner, useGateCheck } from '@/components/bd/GateBanner';
import { PriorityEquation } from '@/components/bd/PriorityEquation';
import { useInspect } from '@/stores';
import {
  fetchProjectSequences,
  fetchProjectMessages,
  fetchHandoffs,
  fetchTasks,
  fetchProjectTimeline,
  type TimelineEntry,
  type OperatorTask,
} from '@/lib/api/bd';
import type { HandoffRecord, MessageRecord, SequenceRecord, UsIntelSignals } from '@/types/bd';
import { SEQUENCE_STATUS_COLORS, MESSAGE_STATUS_COLORS } from '@/types/bd';
import type { ScoreBand, ReasonTrail } from '@lcx/shared';

/* ── Types (mirror GET /v1/projects/:id/360) ── */

type Customer360Data = {
  project: {
    id: string;
    name: string;
    website: string | null;
    ticker: string | null;
    chain: string | null;
    category: string | null;
    region: string | null;
    jurisdiction: string | null;
    listedOnLcx: boolean;
    marketCapUsd: number | null;
    marketCapRank: number | null;
    volume24hUsd: number | null;
    priceUsd: number | null;
    peopleCount: number;
    verifiedContactCount: number;
    source: string;
    createdAt: string;
    lastEnrichedAt: string | null;
  };
  score: {
    band: string;
    euScore: number;
    usPreScore: number;
    usPostScore: number;
    propensityScore: number;
    priorityScore: number;
    recommendedMarket: string | null;
    reasons: unknown[];
    computedAt: string;
    /* Optional until the re-score lands — render only when present. */
    propensityReasons?: ReasonTrail[];
    usIntelSignals?: UsIntelSignals;
  } | null;
  people: {
    id: string;
    name: string;
    title: string | null;
    role: string;
    email: string | null;
    emailStatus: string;
    telegram: string | null;
    linkedin: string | null;
    verified: boolean;
    contactabilityScore: number;
  }[];
  deals: {
    id: string;
    stage: string;
    packageType: string | null;
    packageValue: number | null;
    owner: string | null;
    notes: string | null;
    wonAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  counts: { handoffs: number; handoffsOpen: number; tasks: number; tasksOpen: number };
  lastActivity: string | null;
};

type NoteItem = {
  id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  updatedAt: string;
};

type DocItem = {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  url: string | null;
  createdAt: string;
};

type Extras = {
  sequences: SequenceRecord[];
  messages: MessageRecord[];
  handoffs: HandoffRecord[];
  tasks: OperatorTask[];
  notes: NoteItem[];
  docs: DocItem[];
  timeline: TimelineEntry[];
};

const EMPTY_EXTRAS: Extras = {
  sequences: [],
  messages: [],
  handoffs: [],
  tasks: [],
  notes: [],
  docs: [],
  timeline: [],
};

/* ── Formatting helpers ── */

function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── Section scaffolding ── */

const NAV: { id: string; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'score', label: 'Score' },
  { id: 'deals', label: 'Deals' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'handoffs', label: 'Handoffs' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
  { id: 'documents', label: 'Documents' },
  { id: 'timeline', label: 'Timeline' },
];

function anchorId(section: string): string {
  return `c360-${section}`;
}

function SectionCard({
  id,
  icon,
  title,
  badge,
  headerLink,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  headerLink?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section id={anchorId(id)} className="scroll-mt-14 rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-cyan-500">{icon}</span>
        <h2 className="text-label font-bold uppercase tracking-wider text-navy">{title}</h2>
        {badge != null && <span className="text-xs text-grey">{badge}</span>}
        {headerLink && (
          <Link
            to={headerLink.to}
            className="ml-auto text-xs font-bold text-cyan-600 hover:underline dark:text-cyan-400"
          >
            {headerLink.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function NoneYet({ label, to, cta }: { label: string; to: string; cta: string }) {
  return (
    <p className="text-label text-grey">
      {label}{' '}
      <Link to={to} className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
        {cta}
      </Link>
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-micro font-bold uppercase tracking-wider text-grey">{label}</dt>
      <dd className="text-label font-semibold text-navy">{children}</dd>
    </div>
  );
}

function ScoreStat({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-grey">{label}</span>
        <span className="text-label font-bold text-navy">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
        <div className="h-full rounded-full bg-cyan-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Timeline (vertical line + dots) ── */

const TIMELINE_DOT: Record<string, string> = {
  message: 'bg-sky-500',
  handoff: 'bg-violet-500',
  deal: 'bg-emerald-500',
  signal: 'bg-amber-500',
  discovery: 'bg-cyan-500',
  audit: 'bg-slate-400',
};

function TimelineList({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="relative max-h-96 overflow-y-auto pr-1">
      <div className="absolute bottom-1 left-[5px] top-1 w-px bg-line" aria-hidden="true" />
      {entries.map((e, i) => (
        <div key={i} className="relative pb-3 pl-5 last:pb-0">
          <span
            className={`absolute left-0 top-[3px] h-[11px] w-[11px] rounded-full ring-2 ring-card ${TIMELINE_DOT[e.kind] ?? 'bg-slate-400'}`}
            aria-hidden="true"
          />
          <div className="flex items-start gap-2 text-label">
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-navy">{e.title}</span>
              {e.detail && <span className="text-grey"> — {e.detail}</span>}
              {e.badge && (
                <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-micro font-semibold text-grey dark:bg-slate-800">
                  {e.badge}
                </span>
              )}
              <div className="text-micro uppercase tracking-wide text-grey">{e.kind}</div>
            </div>
            <span className="shrink-0 text-xs text-grey">{fmtDateTime(e.ts)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Data loading ── */

async function loadExtras(id: string): Promise<Extras> {
  const [seq, msg, hand, tasks, notes, docs, timeline] = await Promise.allSettled([
    fetchProjectSequences(id),
    fetchProjectMessages(id),
    fetchHandoffs({ projectId: id, limit: 20 }),
    fetchTasks('open'),
    request<{ data: NoteItem[] }>(`/v1/projects/${id}/notes`),
    request<{ data: DocItem[] }>(`/v1/projects/${id}/documents`),
    fetchProjectTimeline(id),
  ]);
  return {
    sequences: seq.status === 'fulfilled' ? seq.value.data : [],
    messages: msg.status === 'fulfilled' ? msg.value.data : [],
    handoffs: hand.status === 'fulfilled' ? hand.value.data : [],
    tasks: tasks.status === 'fulfilled' ? tasks.value.filter((t) => t.projectId === id) : [],
    notes: notes.status === 'fulfilled' ? notes.value.data : [],
    docs: docs.status === 'fulfilled' ? docs.value.data : [],
    timeline: timeline.status === 'fulfilled' ? timeline.value : [],
  };
}

/* ── Page ── */

export function Customer360() {
  const { id } = useParams<{ id: string }>();
  const inspect = useInspect();
  const gateState = useGateCheck(id);
  const [data, setData] = useState<Customer360Data | null>(null);
  const [extras, setExtras] = useState<Extras>(EMPTY_EXTRAS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [main, extra] = await Promise.all([
        request<{ data: Customer360Data }>(`/v1/projects/${id}/360`),
        loadExtras(id),
      ]);
      setData(main.data);
      setExtras(extra);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const scrollTo = (section: string) => {
    document.getElementById(anchorId(section))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <PageSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} className="text-grey" />}
        title="Failed to load customer 360"
        description={error || 'Something went wrong while loading this customer.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={12} /> Retry
          </Button>
        }
      />
    );
  }

  const { project, score, people, deals, counts, lastActivity } = data;
  const band = (score?.band ?? 'unscored') as ScoreBand;
  const notesPath = `/notes/${project.id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-4 text-navy">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/bd-pipeline/${project.id}`}
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs font-bold text-grey hover:bg-ice-soft/50 hover:text-navy dark:hover:bg-ice-soft/10 transition-colors"
        >
          <ArrowLeft size={11} /> Back to Lead
        </Link>
        <PageTitle
          className="mb-0 flex-1"
          actions={
            <>
              <span className="text-xs text-grey">Last activity: {fmtDate(lastActivity)}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                <RefreshCw size={12} /> Refresh
              </Button>
            </>
          }
        >
          {project.name}
          {project.ticker && (
            <span className="rounded bg-ice-soft px-1.5 py-0.5 font-mono text-xs font-bold text-grey dark:bg-navy-deep">
              {project.ticker}
            </span>
          )}
          <BandBadge band={band} />
          {project.listedOnLcx && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              on LCX
            </span>
          )}
        </PageTitle>
      </div>

      {/* Sticky mini-nav */}
      <nav className="sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-lg border border-line bg-card/95 px-2 py-1.5 backdrop-blur">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => scrollTo(n.id)}
            className="whitespace-nowrap rounded px-2 py-1 text-xs font-bold uppercase tracking-wide text-grey hover:bg-ice-soft/50 hover:text-navy dark:hover:bg-ice-soft/10 transition-colors"
          >
            {n.label}
          </button>
        ))}
      </nav>

      {/* Profile */}
      <SectionCard id="profile" icon={<Building2 size={14} />} title="Profile">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Region">{project.region ?? '—'}</Field>
          <Field label="Category">{project.category ?? '—'}</Field>
          <Field label="Chain">{project.chain ?? '—'}</Field>
          <Field label="Jurisdiction">{project.jurisdiction ?? '—'}</Field>
          <Field label="Market cap">{fmtMoney(project.marketCapUsd)}</Field>
          <Field label="24h volume">{fmtMoney(project.volume24hUsd)}</Field>
          <Field label="Price">{fmtMoney(project.priceUsd)}</Field>
          <Field label="Rank">{project.marketCapRank ?? '—'}</Field>
          <Field label="Source">{project.source}</Field>
          <Field label="Added">{fmtDate(project.createdAt)}</Field>
          <Field label="Last enriched">{fmtDate(project.lastEnrichedAt)}</Field>
          <Field label="Website">
            {project.website ? (
              <a
                href={project.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-cyan-600 hover:underline dark:text-cyan-400"
              >
                link <ExternalLink size={10} />
              </a>
            ) : (
              '—'
            )}
          </Field>
        </dl>

        <div className="mt-4 border-t border-line pt-3">
          <SectionLabel as="h3" className="mb-2 block">
            Contacts ({people.length} · {project.verifiedContactCount} verified)
          </SectionLabel>
          {people.length === 0 ? (
            <NoneYet label="None yet." to={`/bd-pipeline/${project.id}`} cta="Add contacts on the lead" />
          ) : (
            <div className="space-y-1">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => inspect('contact', `${project.id}:${p.id}`)}
                  title="Inspect contact"
                  className="flex w-full flex-wrap items-center gap-2 rounded border border-transparent px-1.5 py-1 text-left text-label hover:border-line hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
                >
                  <EntityChip
                    type="contact"
                    id={`${project.id}:${p.id}`}
                    name={p.name}
                    stateLine={`at ${project.name}`}
                    vitals={[{ label: 'Contactability', value: String(p.contactabilityScore) }]}
                    className="font-semibold"
                  />
                  {p.title && <span className="text-grey">· {p.title}</span>}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-micro font-semibold text-grey dark:bg-slate-800">
                    {p.role}
                  </span>
                  {p.verified && (
                    <span className="text-micro font-bold text-emerald-600 dark:text-emerald-400">verified</span>
                  )}
                  {p.email && <span className="ml-auto text-grey">{p.email}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Score */}
      <SectionCard
        id="score"
        icon={<Gauge size={14} />}
        title="Score"
        badge={score ? `computed ${fmtDate(score.computedAt)}` : undefined}
      >
        {score ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-label">
              <BandBadge band={band} />
              {score.recommendedMarket && (
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-micro font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {score.recommendedMarket.replace('_', ' ')}
                </span>
              )}
              {score.reasons.length > 0 && (
                <span className="text-xs text-grey">{score.reasons.length} scoring reason(s)</span>
              )}
            </div>
            <div className="mb-3">
              <PriorityEquation
                propensity={score.propensityScore}
                priority={score.priorityScore}
                euScore={score.euScore}
                usPostScore={score.usPostScore}
                onExplainPropensity={() =>
                  document.getElementById('c360-propensity')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                onExplainGate={() =>
                  document.getElementById('c360-gate-banner')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              <ScoreStat label="Priority" value={score.priorityScore} />
              <ScoreStat label="Propensity" value={score.propensityScore} />
              <ScoreStat label="EU / MiCA" value={score.euScore} />
              <ScoreStat label="US pre-CLARITY" value={score.usPreScore} />
              <ScoreStat label="US post-CLARITY" value={score.usPostScore} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <PropensityTrail
                id="c360-propensity"
                score={score.propensityScore}
                reasons={score.propensityReasons}
              />
              <div className="space-y-2">
                <GateBanner check={gateState} id="c360-gate-banner" />
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <NoneYet label="None yet." to={`/bd-pipeline/${project.id}`} cta="Trigger a re-score on the lead" />
            <GateBanner check={gateState} id="c360-gate-banner" />
          </div>
        )}
      </SectionCard>

      {/* Deals */}
      <SectionCard
        id="deals"
        icon={<Briefcase size={14} />}
        title="Deals"
        badge={`${deals.length}`}
        headerLink={{ to: `/deal-desk?projectId=${project.id}`, label: 'Deal Desk' }}
      >
        {deals.length === 0 ? (
          <NoneYet label="None yet." to={`/deal-desk?projectId=${project.id}`} cta="Open Deal Desk" />
        ) : (
          <div className="space-y-1.5">
            {deals.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 text-label">
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-micro font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {d.stage}
                </span>
                <span className="text-grey">{d.packageType ?? '—'}</span>
                {d.packageValue != null && (
                  <span className="font-semibold">{fmtMoney(d.packageValue / 100)}</span>
                )}
                {d.owner && <span className="text-grey">owner {d.owner}</span>}
                {d.wonAt && (
                  <span className="text-micro font-bold text-emerald-600 dark:text-emerald-400">
                    won {fmtDate(d.wonAt)}
                  </span>
                )}
                <span className="ml-auto text-grey">updated {fmtDate(d.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Outreach */}
      <SectionCard
        id="outreach"
        icon={<Send size={14} />}
        title="Outreach"
        badge={`${extras.sequences.length} sequence(s) · ${extras.messages.length} message(s)`}
        headerLink={{ to: '/outreach-ops', label: 'Outreach Ops' }}
      >
        {extras.sequences.length === 0 && extras.messages.length === 0 ? (
          <NoneYet label="None yet." to="/outreach-ops" cta="Enroll in Outreach Ops" />
        ) : (
          <div className="space-y-3">
            {extras.sequences.length > 0 && (
              <div className="space-y-1.5">
                {extras.sequences.map((seq) => (
                  <div key={seq.id} className="flex flex-wrap items-center gap-2 text-label">
                    <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${SEQUENCE_STATUS_COLORS[seq.status] ?? ''}`}>
                      {seq.status}
                    </span>
                    <span className="text-grey">step {seq.currentStep}</span>
                    <span className="text-grey">{seq.channel}</span>
                    {seq.startedAt && <span className="ml-auto text-grey">started {fmtDate(seq.startedAt)}</span>}
                  </div>
                ))}
              </div>
            )}
            {extras.messages.length > 0 && (
              <div className="space-y-1.5 border-t border-line pt-2">
                {extras.messages.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 text-label">
                    <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${MESSAGE_STATUS_COLORS[m.status] ?? ''}`}>
                      {m.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{m.subject}</span>
                    <span className="text-grey">touch {m.touchIndex}</span>
                    {m.sentAt && <span className="text-grey">{fmtDateTime(m.sentAt)}</span>}
                  </div>
                ))}
                {extras.messages.length > 5 && (
                  <p className="text-xs text-grey">+ {extras.messages.length - 5} more message(s)</p>
                )}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Handoffs */}
      <SectionCard
        id="handoffs"
        icon={<Inbox size={14} />}
        title="Handoffs"
        badge={`${counts.handoffsOpen} open / ${counts.handoffs}`}
        headerLink={{ to: '/outreach', label: 'Handoffs' }}
      >
        {extras.handoffs.length === 0 ? (
          <NoneYet label="None yet." to="/outreach" cta="Go to Handoffs" />
        ) : (
          <div className="space-y-1.5">
            {extras.handoffs.slice(0, 5).map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 text-label">
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-micro font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                  {h.status}
                </span>
                <EntityChip
                  type="interaction"
                  id={h.id}
                  name={h.triggerReason}
                  stateLine={`${h.status}${h.channel ? ` · via ${h.channel}` : ''}`}
                  className="font-semibold"
                />
                {h.assignedTo && <span className="text-grey">→ {h.assignedTo}</span>}
                <span className="ml-auto text-grey">{fmtDate(h.updatedAt)}</span>
              </div>
            ))}
            {extras.handoffs.length > 5 && (
              <p className="text-xs text-grey">+ {extras.handoffs.length - 5} more handoff(s)</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Tasks */}
      <SectionCard
        id="tasks"
        icon={<ListChecks size={14} />}
        title="Tasks"
        badge={`${counts.tasksOpen} open / ${counts.tasks}`}
        headerLink={{ to: '/tasks', label: 'My Tasks' }}
      >
        {extras.tasks.length === 0 ? (
          <NoneYet label="None yet." to="/tasks" cta="Create one in My Tasks" />
        ) : (
          <div className="space-y-1.5">
            {extras.tasks.slice(0, 5).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 text-label">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-micro font-semibold text-grey dark:bg-slate-800">
                  {t.kind}
                </span>
                <EntityChip
                  type="task"
                  id={t.id}
                  name={t.title}
                  seed={{ ...t }}
                  stateLine={t.dueAt ? `due ${fmtDate(t.dueAt)}` : undefined}
                  className="font-semibold"
                />
                {t.dueAt && <span className="ml-auto text-grey">due {fmtDate(t.dueAt)}</span>}
              </div>
            ))}
            {extras.tasks.length > 5 && (
              <p className="text-xs text-grey">+ {extras.tasks.length - 5} more open task(s)</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Notes */}
      <SectionCard
        id="notes"
        icon={<FileText size={14} />}
        title="Notes"
        badge={`${extras.notes.length}`}
        headerLink={{ to: notesPath, label: 'Open Notes' }}
      >
        {extras.notes.length === 0 ? (
          <NoneYet label="None yet." to={notesPath} cta="Write the first note" />
        ) : (
          <div className="space-y-1.5">
            {extras.notes.slice(0, 5).map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-2 text-label">
                {n.pinned && <Pin size={10} className="text-amber-500" />}
                <EntityChip
                  type="document"
                  id={n.id}
                  name={n.title || 'Untitled'}
                  seed={{
                    title: n.title || 'Untitled',
                    content: n.body,
                    kind: 'note',
                    projectId: project.id,
                    projectName: project.name,
                    updatedAt: n.updatedAt,
                  }}
                  className="font-semibold"
                />
                <span className="min-w-0 flex-1 truncate text-grey">{n.body}</span>
                <span className="ml-auto shrink-0 text-grey">{fmtDate(n.updatedAt)}</span>
              </div>
            ))}
            {extras.notes.length > 5 && (
              <p className="text-xs text-grey">+ {extras.notes.length - 5} more note(s)</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Documents */}
      <SectionCard
        id="documents"
        icon={<Paperclip size={14} />}
        title="Documents"
        badge={`${extras.docs.length}`}
        headerLink={{ to: notesPath, label: 'Manage' }}
      >
        {extras.docs.length === 0 ? (
          <NoneYet label="None yet." to={notesPath} cta="Attach a document" />
        ) : (
          <div className="space-y-1.5">
            {extras.docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 text-label">
                <Paperclip size={11} className="text-grey" />
                <EntityChip
                  type="document"
                  id={d.id}
                  name={d.name}
                  seed={{
                    title: d.name,
                    kind: 'document',
                    projectId: project.id,
                    projectName: project.name,
                    updatedAt: d.createdAt,
                  }}
                  className="font-semibold"
                />
                <span className="text-grey">{d.mime}</span>
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-600 hover:underline dark:text-cyan-400"
                  >
                    open <ExternalLink size={10} />
                  </a>
                )}
                <span className="ml-auto text-grey">{fmtDate(d.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Timeline */}
      <SectionCard id="timeline" icon={<Activity size={14} />} title="Timeline" badge={`${extras.timeline.length}`}>
        {extras.timeline.length === 0 ? (
          <NoneYet label="None yet." to={`/bd-pipeline/${project.id}`} cta="Activity will appear as you work the lead" />
        ) : (
          <TimelineList entries={extras.timeline} />
        )}
      </SectionCard>
    </div>
  );
}
