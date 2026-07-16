import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLead } from '@/lib/api/bd';
import type { LeadDetail } from '@/types/bd';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui';

export interface InspectorPayloadProps {
  id: string;
  seed?: Record<string, unknown>;
}

/**
 * Project entity inspector — the "Token God Mode" seed. Wave-1 agents extend
 * this with score trails, usIntelSignals gauges, exchange coverage and
 * signal timelines; the shell guarantees every surface can already open it.
 */
export function ProjectInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLead(null);
    setError(null);
    fetchLead(id)
      .then(res => {
        if (!cancelled) setLead(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState variant="error" title="Failed to load project" description={error} />;
  if (!lead) return <CardSkeleton count={3} />;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-navy">{lead.name}</span>
          {lead.ticker && (
            <span className="rounded bg-ice-soft dark:bg-ice-soft/10 px-1.5 py-0.5 font-mono text-micro font-bold text-grey">
              {lead.ticker}
            </span>
          )}
        </div>
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noreferrer" className="text-label text-cyan-600 hover:underline">
            {lead.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <ScoreTile label="EU" value={lead.score?.euScore ?? null} />
        <ScoreTile label="US (pre)" value={lead.score?.usPreScore ?? null} />
        <ScoreTile label="US (post)" value={lead.score?.usPostScore ?? null} />
      </div>

      <Button size="sm" variant="secondary" onClick={() => navigate(`/bd-pipeline/${lead.id}`)}>
        Open full dossier →
      </Button>
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
