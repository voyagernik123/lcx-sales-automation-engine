import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, Briefcase } from 'lucide-react';
import { fetchLead, fetchProjectDeal, fetchProjectTimeline, type TimelineEntry } from '@/lib/api/bd';
import type { DealRecord, LeadDetail } from '@/types/bd';
import type { ScoreBand } from '@lcx/shared';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui';
import { BandBadge } from '@/components/bd';
import { RelationRail } from '../RelationRail';
import { HistoryStrip } from '../HistoryStrip';
import { ProvenancePanel } from '../ProvenancePanel';
import { AssessmentBlock } from '../AssessmentBlock';
import { PropensityTrail } from '@/components/bd/PropensityTrail';
import { UsIntelGauges } from '@/components/bd/UsIntelGauges';
import { GateBanner, useGateCheck } from '@/components/bd/GateBanner';
import { PriorityEquation } from '@/components/bd/PriorityEquation';
import { useInspectorStore } from '@/stores';

export interface InspectorPayloadProps {
  id: string;
  seed?: Record<string, unknown>;
}

function scrollToInDrawer(elementId: string) {
  document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Project entity inspector — a mini entity page: identity header, the
 * priority equation, top propensity reasons, usIntel gauge cluster, gate
 * status, contacts (drill to contact inspector) and the latest timeline
 * entries, plus hops to the full dossier and the deal inspector.
 */
export function ProjectInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const push = useInspectorStore(s => s.push);
  const close = useInspectorStore(s => s.close);
  const gateState = useGateCheck(id);

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<DealRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLead(null);
    setError(null);
    setDeal(null);
    setTimeline(null);

    fetchLead(id)
      .then(res => {
        if (!cancelled) setLead(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });

    // Secondary payloads degrade silently — the drawer must never dead-end.
    Promise.resolve()
      .then(() => fetchProjectDeal(id))
      .then(res => {
        if (!cancelled) setDeal(res.data);
      })
      .catch(() => {});
    Promise.resolve()
      .then(() => fetchProjectTimeline(id))
      .then(entries => {
        if (!cancelled) setTimeline(entries);
      })
      .catch(() => {
        if (!cancelled) setTimeline([]);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState variant="error" title="Failed to load project" description={error} />;
  if (!lead) return <CardSkeleton count={3} />;

  const band: ScoreBand = (lead.score?.band as ScoreBand) ?? 'unscored';
  const verifiedCount = lead.people.filter(p => p.verified).length;

  return (
    <div className="space-y-4">
      {/* Identity header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-navy">{lead.name}</span>
          {lead.ticker && (
            <span className="rounded bg-ice-soft dark:bg-ice-soft/10 px-1.5 py-0.5 font-mono text-micro font-bold text-grey">
              {lead.ticker}
            </span>
          )}
          <BandBadge band={band} />
        </div>
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noreferrer" className="text-label text-cyan-600 hover:underline">
            {lead.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      {/* Relation pivots — the graph is the navigation */}
      <RelationRail
        items={[
          {
            label: lead.people.length === 1 ? 'contact' : 'contacts',
            count: lead.people.length,
            icon: Users,
            onClick: () => scrollToInDrawer('insp-contacts'),
          },
          {
            label: 'deal',
            count: deal ? 1 : 0,
            icon: Briefcase,
            onClick: () => deal && push('deal', deal.id),
          },
          {
            label: (timeline ?? []).length === 1 ? 'event' : 'events',
            count: (timeline ?? []).length,
            icon: Activity,
            onClick: () => scrollToInDrawer('insp-activity'),
          },
        ]}
      />

      {/* Priority equation — every term hops to its explanation below */}
      <PriorityEquation
        compact
        propensity={lead.score?.propensityScore}
        priority={lead.score?.priorityScore}
        euScore={lead.score?.euScore}
        usPostScore={lead.score?.usPostScore}
        onExplainPropensity={() => scrollToInDrawer('insp-propensity')}
        onExplainGate={() => scrollToInDrawer('insp-gate')}
      />

      <div className="grid grid-cols-3 gap-2 text-center">
        <ScoreTile label="EU" value={lead.score?.euScore ?? null} />
        <ScoreTile label="US (pre)" value={lead.score?.usPreScore ?? null} />
        <ScoreTile label="US (post)" value={lead.score?.usPostScore ?? null} />
      </div>

      {/* Outreach gate */}
      <div id="insp-gate">
        <GateBanner check={gateState} compact />
      </div>

      {/* Top-3 propensity reasons */}
      <PropensityTrail
        id="insp-propensity"
        compact
        limit={3}
        score={lead.score?.propensityScore}
        reasons={lead.score?.propensityReasons}
      />

      {/* usIntel gauge cluster */}
      <UsIntelGauges compact signals={lead.score?.usIntelSignals} />

      {/* Contacts → contact inspector */}
      <div id="insp-contacts">
        <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
          <Users size={11} className="text-cyan-500" />
          Contacts ({verifiedCount} verified / {lead.people.length})
        </div>
        {lead.people.length === 0 ? (
          <p className="text-micro text-grey italic">No contacts recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {lead.people.slice(0, 5).map(person => (
              <button
                key={person.id}
                type="button"
                onClick={() => push('contact', `${lead.id}:${person.id}`)}
                className="flex w-full items-center gap-2 rounded border border-line px-2 py-1 text-left text-micro hover:border-cyan-400 hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
              >
                <span className="font-semibold text-navy truncate">{person.name}</span>
                {person.title && <span className="text-grey truncate">{person.title}</span>}
                {person.verified && (
                  <span className="ml-auto shrink-0 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">verified</span>
                )}
              </button>
            ))}
            {lead.people.length > 5 && (
              <p className="text-[9px] text-grey">+ {lead.people.length - 5} more on the full dossier</p>
            )}
          </div>
        )}
      </div>

      {/* Object history — the uniform strip (plan 3.4) */}
      <div id="insp-activity">
        <HistoryStrip
          entries={(timeline ?? []).map(e => ({ ts: e.ts, kind: e.kind, title: e.title, detail: e.detail ?? undefined }))}
          loading={timeline === null}
          max={3}
        />
      </div>

      {/* Alpha assessment — conviction, levers, timing, ACH (Wave 2) */}
      <AssessmentBlock subjectId={lead.id} />

      {/* Intelligence spine — sourced observations + governed actions (Wave 0) */}
      <ProvenancePanel subjectType="project" subjectId={lead.id} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            close();
            navigate(`/bd-pipeline/${lead.id}`);
          }}
        >
          Open full dossier →
        </Button>
        {deal && (
          <Button size="sm" variant="secondary" onClick={() => push('deal', deal.id)}>
            <Briefcase size={12} /> Inspect deal
          </Button>
        )}
      </div>
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="text-micro font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className="font-mono text-lg font-bold text-navy">{value ?? '—'}</div>
    </div>
  );
}
