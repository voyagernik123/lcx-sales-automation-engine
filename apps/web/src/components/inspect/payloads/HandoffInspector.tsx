import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Boxes, Inbox, User, Zap } from 'lucide-react';
import { RelationRail } from '../RelationRail';
import { fetchHandoff } from '@/lib/api/bd';
import type { HandoffRecord } from '@/types/bd';
import { HANDOFF_STATUS_COLORS, HANDOFF_STATUS_LABELS } from '@/types/bd';
import { computeReplySla, SLA_CLS } from '@/lib/salesIntel';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui';
import { useInspectorStore } from '@/stores';
import { scrollToId } from '@/lib/motion';
import type { InspectorPayloadProps } from './ProjectInspector';

const EVENT_STYLE: Record<string, string> = {
  created: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  note: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  status_change: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  assigned: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
};

/**
 * Handoff entity inspector — SLA state, trigger reason, the event timeline,
 * and hops to the project / contact inspectors or the full Handoffs inbox.
 */
export function HandoffInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const push = useInspectorStore(s => s.push);
  const close = useInspectorStore(s => s.close);

  const [handoff, setHandoff] = useState<HandoffRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHandoff(null);
    setError(null);
    fetchHandoff(id)
      .then(res => {
        if (!cancelled) setHandoff(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState variant="error" title="Failed to load handoff" description={error} />;
  if (!handoff) return <CardSkeleton count={2} />;

  const sla = handoff.status === 'open' ? computeReplySla(handoff.createdAt) : null;
  const events = handoff.events ?? [];
  const rail = (
    <RelationRail
      items={[
        { label: 'project', count: 1, icon: Boxes, onClick: () => push('project', handoff.projectId) },
        {
          label: 'contact',
          count: handoff.personId ? 1 : 0,
          icon: User,
          onClick: () => handoff.personId && push('contact', `${handoff.projectId}:${handoff.personId}`),
        },
        {
          label: events.length === 1 ? 'event' : 'events',
          count: events.length,
          icon: Activity,
          onClick: () => scrollToId('insp-handoff-timeline'),
        },
      ]}
    />
  );

  return (
    <div className="space-y-4">
      {/* Identity header — project hops to its inspector */}
      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => push('project', handoff.projectId)}
            className="text-base font-bold text-navy hover:text-cyan-700 dark:hover:text-cyan-400 hover:underline text-left"
            title="Inspect project"
          >
            {handoff.projectName ?? 'Handoff'}
          </button>
          {handoff.projectTicker && (
            <span className="rounded bg-ice-soft dark:bg-ice-soft/10 px-1.5 py-0.5 font-mono text-micro font-bold text-grey">
              {handoff.projectTicker}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex rounded px-1.5 py-0.5 text-micro font-bold leading-none ${HANDOFF_STATUS_COLORS[handoff.status] ?? ''}`}>
            {HANDOFF_STATUS_LABELS[handoff.status] ?? handoff.status}
          </span>
          <span className="rounded bg-ice-soft dark:bg-ice-soft/10 px-1.5 py-0.5 text-micro font-bold uppercase text-grey">
            {handoff.channel}
          </span>
          {handoff.assignedTo && (
            <span className="inline-flex items-center gap-1 text-micro text-grey">
              <User size={9} /> {handoff.assignedTo}
            </span>
          )}
        </div>
      </div>

      {/* Relation pivots — the graph is the navigation */}
      {rail}

      {/* SLA state */}
      {sla && (
        <div className={`text-label font-bold ${SLA_CLS[sla.state]}`}>
          Reply SLA: {sla.state} — {Math.round(sla.ageHours * 10) / 10}h of {sla.budgetHours}h budget
        </div>
      )}

      {/* Trigger reason */}
      <div className="flex items-start gap-1.5 text-label">
        <Zap size={12} className="mt-0.5 shrink-0 text-amber-500" />
        <div>
          <span className="font-bold text-navy">Trigger:</span>{' '}
          <span className="text-grey">{handoff.triggerReason.replace(/_/g, ' ')}</span>
          <span className="block text-micro text-grey">
            {new Date(handoff.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Contact hop */}
      {handoff.personName && (
        handoff.personId ? (
          <button
            type="button"
            onClick={() => push('contact', `${handoff.projectId}:${handoff.personId}`)}
            className="flex w-full items-center gap-2 rounded border border-line px-2 py-1.5 text-left text-micro hover:border-cyan-400 hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
          >
            <User size={11} className="shrink-0 text-cyan-500" />
            <span className="font-semibold text-navy truncate">{handoff.personName}</span>
            {handoff.personEmail && <span className="text-grey truncate">{handoff.personEmail}</span>}
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded border border-line px-2 py-1.5 text-micro">
            <User size={11} className="shrink-0 text-grey" />
            <span className="font-semibold text-navy truncate">{handoff.personName}</span>
            {handoff.personEmail && <span className="text-grey truncate">{handoff.personEmail}</span>}
          </div>
        )
      )}

      {/* Reply snippet */}
      {handoff.summary && (
        <div className="rounded border border-line p-2">
          <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Their reply</div>
          <p className="text-micro leading-relaxed whitespace-pre-wrap text-navy">{handoff.summary}</p>
        </div>
      )}

      {/* Event timeline */}
      <div id="insp-handoff-timeline">
        <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
          <Inbox size={11} className="text-cyan-500" />
          Timeline ({events.length})
        </div>
        {events.length === 0 ? (
          <p className="text-micro text-grey italic">No events yet.</p>
        ) : (
          <div className="space-y-1.5">
            {events.map(e => (
              <div key={e.id} className="flex items-start gap-2 text-micro">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${EVENT_STYLE[e.eventType] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {e.eventType.replace(/_/g, ' ')}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-navy">{e.actor}</span>
                  {e.content && <span className="text-grey"> — {e.content}</span>}
                  {e.oldStatus && e.newStatus && (
                    <span className="text-grey"> {HANDOFF_STATUS_LABELS[e.oldStatus] ?? e.oldStatus} → {HANDOFF_STATUS_LABELS[e.newStatus] ?? e.newStatus}</span>
                  )}
                </div>
                <span className="shrink-0 text-[9px] text-grey">
                  {new Date(e.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            close();
            navigate(`/outreach?handoff=${handoff.id}`);
          }}
        >
          Open in Handoffs →
        </Button>
        <Button size="sm" variant="secondary" onClick={() => push('project', handoff.projectId)}>
          Inspect project
        </Button>
      </div>
    </div>
  );
}
