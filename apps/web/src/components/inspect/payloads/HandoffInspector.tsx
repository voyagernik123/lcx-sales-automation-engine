import { useEffect, useState } from 'react';
import { fetchHandoff } from '@/lib/api/bd';
import type { HandoffRecord } from '@/types/bd';
import { computeReplySla, SLA_CLS } from '@/lib/salesIntel';
import { CardSkeleton, EmptyState } from '@/components/shared';
import type { InspectorPayloadProps } from './ProjectInspector';

/** Handoff inspector stub — Wave-1 (comms agent) extends with events + AI drafts. */
export function HandoffInspector({ id }: InspectorPayloadProps) {
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

  return (
    <div className="space-y-3">
      <div className="text-base font-bold text-navy">{handoff.projectName ?? 'Handoff'}</div>
      <div className="text-label text-grey">
        {handoff.channel} · {handoff.status.replace(/_/g, ' ')}
        {handoff.personName ? ` · ${handoff.personName}` : ''}
      </div>
      {sla && (
        <div className={`text-label font-bold ${SLA_CLS[sla.state]}`}>
          Reply SLA: {sla.state} ({Math.round(sla.ageHours * 10) / 10}h of {sla.budgetHours}h)
        </div>
      )}
    </div>
  );
}
