import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BadgeCheck, Mail, MessageSquare, Send } from 'lucide-react';
import {
  fetchHandoffs,
  fetchLead,
  fetchProjectMessages,
  fetchProjectSequences,
} from '@/lib/api/bd';
import type { HandoffRecord, LeadPerson, MessageRecord, SequenceRecord } from '@/types/bd';
import { HANDOFF_STATUS_LABELS } from '@/types/bd';
import { computeReplySla } from '@/lib/salesIntel';
import { formatDate } from '@/lib/format';
import { useLastSeen } from '@/lib/useLastSeen';
import { PageTitle } from '@/components/ui';
import { CardSkeleton, EmptyState, TableSkeleton } from '@/components/shared';
import { EntityChip } from '@/components/entity';
import { safeHref } from '@/lib/safeHref';
import { HistoryStrip, type HistoryEntry } from '@/components/inspect/HistoryStrip';
import { SlaChip } from '@/components/home/OvernightHandoffs';
import { useInspect } from '@/stores';

/**
 * Contact workspace — the ontology's missing L4 (FINAL_MASTER_PLAN Part 6).
 * A person is finally a place: their thread state, every interaction the
 * desk has had with them, and the project relationship — all on one page.
 * Route: /contacts/:id where id is `${projectId}:${personId}`.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line/80 bg-card p-5 shadow-card">
      <h3 className="mb-4 text-[13px] font-semibold tracking-[-0.01em] text-navy">{title}</h3>
      {children}
    </section>
  );
}

export function ContactWorkspace() {
  const { id = '' } = useParams();
  const [projectId, personId] = id.split(':');
  const inspect = useInspect();
  const lastSeen = useLastSeen(`contact:${id}`);

  const [person, setPerson] = useState<LeadPerson | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectTicker, setProjectTicker] = useState<string | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffRecord[] | null>(null);
  const [messages, setMessages] = useState<MessageRecord[] | null>(null);
  const [sequences, setSequences] = useState<SequenceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !personId) {
      setError('Malformed contact reference');
      return;
    }
    let cancelled = false;
    fetchLead(projectId)
      .then(res => {
        if (cancelled) return;
        setProjectName(res.data.name);
        setProjectTicker(res.data.ticker ?? null);
        setPerson(res.data.people.find(p => p.id === personId) ?? null);
      })
      .catch(err => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load'));
    // Secondary panels degrade to empty, never dead-end.
    fetchHandoffs({ limit: 100 })
      .then(res => !cancelled && setHandoffs(res.data.filter(h => h.personId === personId)))
      .catch(() => !cancelled && setHandoffs([]));
    fetchProjectMessages(projectId)
      .then(res => !cancelled && setMessages(res.data))
      .catch(() => !cancelled && setMessages([]));
    fetchProjectSequences(projectId)
      .then(res => !cancelled && setSequences(res.data.filter(s => s.personId === personId)))
      .catch(() => !cancelled && setSequences([]));
    return () => {
      cancelled = true;
    };
  }, [projectId, personId]);

  const personMessages = useMemo(() => {
    if (!messages || !person?.email) return messages ?? [];
    return messages.filter(m => m.toEmail === person.email);
  }, [messages, person]);

  const history = useMemo<HistoryEntry[]>(() => {
    const entries: HistoryEntry[] = [];
    for (const m of personMessages) {
      if (m.sentAt) {
        entries.push({ ts: m.sentAt, kind: 'message', title: m.subject, detail: `touch ${m.touchIndex} · ${m.status}` });
      }
    }
    for (const h of handoffs ?? []) {
      entries.push({
        ts: h.createdAt,
        kind: 'reply',
        title: `Replied via ${h.channel}`,
        detail: h.summary ?? HANDOFF_STATUS_LABELS[h.status] ?? h.status,
      });
    }
    for (const s of sequences ?? []) {
      if (s.startedAt) {
        entries.push({ ts: s.startedAt, kind: 'sequence', title: `Enrolled in ${s.channel} sequence`, detail: `status ${s.status}` });
      }
    }
    return entries.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  }, [personMessages, handoffs, sequences]);

  if (error) return <EmptyState variant="error" title="Failed to load contact" description={error} />;
  if (person === null && !projectName) return <CardSkeleton count={4} />;
  if (!person) {
    return (
      <EmptyState
        variant="search"
        title="Contact not found"
        description={`Not on ${projectName}'s people list anymore.`}
      />
    );
  }

  const openHandoffs = (handoffs ?? []).filter(h => h.status === 'open' || h.status === 'in_progress');
  const loading = handoffs === null || messages === null || sequences === null;

  return (
    <div className="mx-auto max-w-[1100px] p-5">
      <PageTitle
        className="mb-5"
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {person.title ?? person.role}
            <span className="text-grey/60">·</span>
            <EntityChip type="project" id={projectId} name={projectName} meta={projectTicker} />
          </span>
        }
      >
        <span className="flex items-center gap-2">
          {person.name}
          {person.verified && (
            <span className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              <BadgeCheck size={10} /> verified
            </span>
          )}
        </span>
      </PageTitle>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Thread state">
            {loading ? (
              <TableSkeleton rows={2} cols={1} />
            ) : openHandoffs.length === 0 ? (
              <p className="text-label text-grey">
                No open replies from {person.name.split(' ')[0]} — automation runs until they answer.
              </p>
            ) : (
              <div className="space-y-1.5">
                {openHandoffs.map(h => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => inspect('handoff', h.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <MessageSquare size={12} className="shrink-0 text-grey" />
                      <span className="truncate text-label font-semibold text-navy">
                        {h.summary ?? `Reply via ${h.channel}`}
                      </span>
                    </span>
                    <SlaChip sla={computeReplySla(h.createdAt)} createdAt={h.createdAt} />
                  </button>
                ))}
              </div>
            )}
          </Section>

          <Section title="Interaction history">
            <HistoryStrip entries={history} max={10} title={null} loading={loading} />
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Channels">
            <div className="space-y-2 text-label">
              {person.email ? (
                <div className="flex items-center gap-2">
                  <Mail size={12} className="shrink-0 text-grey" />
                  <span className="min-w-0 truncate font-mono text-navy">{person.email}</span>
                  <span className="ml-auto shrink-0 text-micro text-grey">{person.emailStatus}</span>
                </div>
              ) : (
                <p className="text-micro italic text-grey">No email on file.</p>
              )}
              {person.linkedin && (
                <a
                  href={safeHref(person.linkedin)}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-cyan-700 hover:underline"
                >
                  LinkedIn profile
                </a>
              )}
              {person.telegram && <div className="font-mono text-navy">{person.telegram}</div>}
              <div className="border-t border-line/70 pt-2 text-micro text-grey">
                Contactability{' '}
                <span className="num-tabular font-semibold text-navy">{person.contactabilityScore}</span>/100
              </div>
            </div>
          </Section>

          <Section title="Sequences">
            {loading ? (
              <TableSkeleton rows={2} cols={1} />
            ) : (sequences ?? []).length === 0 ? (
              <p className="text-micro italic text-grey">Never enrolled.</p>
            ) : (
              <div className="space-y-1.5">
                {(sequences ?? []).map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-label">
                    <Send size={12} className="shrink-0 text-grey" />
                    <span className="min-w-0 flex-1 truncate capitalize text-navy">{s.channel} sequence</span>
                    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-micro font-semibold capitalize text-grey">
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {lastSeen.lastSeen && (
            <p className="px-1 text-micro text-grey/80">
              Last visited {formatDate(lastSeen.lastSeen)} — new activity since then is marked in blue.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ContactWorkspace;
