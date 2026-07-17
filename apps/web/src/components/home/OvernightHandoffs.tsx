import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { computeReplySla, SLA_CLS, type ReplySla } from '@/lib/salesIntel';
import { useInspect } from '@/stores';
import { EmptyState } from '@/components/shared';
import { EntityChip } from '@/components/entity';
import type { HandoffRecord } from '@/types/bd';

export interface OvernightHandoffsProps {
  handoffs: HandoffRecord[];
  max?: number;
}

const SLA_RANK: Record<ReplySla['state'], number> = { breached: 3, urgent: 2, aging: 1, fresh: 0 };

export function SlaChip({ sla }: { sla: ReplySla }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-micro font-bold ${SLA_CLS[sla.state]}`}
      title={`Reply SLA: ${Math.round(sla.ageHours * 10) / 10}h of a ${sla.budgetHours}h budget`}
    >
      <span className="uppercase">{sla.state}</span>
      {Math.floor(sla.ageHours)}h
    </span>
  );
}

/**
 * "Overnight & waiting" — open handoffs ranked worst-SLA-first. Every row
 * opens the handoff inspector in place; the header link goes to the inbox.
 */
export function OvernightHandoffs({ handoffs, max = 6 }: OvernightHandoffsProps) {
  const inspect = useInspect();
  const navigate = useNavigate();

  const rows = handoffs
    .map(h => ({ h, sla: computeReplySla(h.createdAt) }))
    .sort((a, b) => SLA_RANK[b.sla.state] - SLA_RANK[a.sla.state] || b.sla.ageHours - a.sla.ageHours)
    .slice(0, max);

  if (rows.length === 0) {
    return (
      <EmptyState
        variant="done"
        title="Nothing waiting on you"
        description="No open replies overnight. Any inbound reply pauses automation and lands here."
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {rows.map(({ h, sla }) => (
        <button
          key={h.id}
          type="button"
          onClick={() => inspect('handoff', h.id)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10"
        >
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare size={12} className="shrink-0 text-grey" />
            <EntityChip
              type="project"
              id={h.projectId}
              name={h.projectName ?? 'Unknown project'}
              stateLine={`reply waiting · via ${h.channel}`}
              className="text-label font-bold"
            />
            <span className="shrink-0 rounded-md border border-line/70 px-1.5 py-0.5 text-micro font-semibold capitalize text-grey">
              {h.channel}
            </span>
            {h.personName && h.personId && (
              <span className="hidden min-w-0 sm:inline-flex">
                <EntityChip
                  type="contact"
                  id={`${h.projectId}:${h.personId}`}
                  name={h.personName}
                  stateLine={h.projectName ? `at ${h.projectName}` : undefined}
                  className="text-micro !text-grey"
                />
              </span>
            )}
          </div>
          <SlaChip sla={sla} />
        </button>
      ))}
      {handoffs.length > max && (
        <button
          type="button"
          onClick={() => navigate('/outreach')}
          className="w-full cursor-pointer rounded-lg border border-dashed border-line p-1.5 text-center text-micro font-semibold text-grey transition-colors hover:bg-ice-soft/50 hover:text-navy dark:hover:bg-ice-soft/10"
        >
          +{handoffs.length - max} more in the inbox →
        </button>
      )}
    </div>
  );
}
