import { useEffect, useState } from 'react';
import { fetchDealBoard, fetchDealEvents, type BoardDeal } from '@/lib/api/bd';
import type { DealEvent } from '@/types/bd';
import { computeDealHealthSet, type DealHealth } from '@/lib/salesIntel';
import { CardSkeleton, EmptyState } from '@/components/shared';
import type { InspectorPayloadProps } from './ProjectInspector';

/**
 * Deal entity inspector stub — Wave-1 (deals agent) replaces the body with
 * warnings, likelihood why-panel, momentum, playbook chips and the events
 * timeline. The shell already computes health so consumers can rely on it.
 */
export function DealInspector({ id }: InspectorPayloadProps) {
  const [deal, setDeal] = useState<BoardDeal | null>(null);
  const [health, setHealth] = useState<DealHealth | null>(null);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDeal(null);
    setError(null);
    (async () => {
      try {
        const [board, ev] = await Promise.all([fetchDealBoard(), fetchDealEvents(id)]);
        if (cancelled) return;
        const d = board.find(b => b.id === id) ?? null;
        setDeal(d);
        setEvents(ev.data);
        if (d) {
          const set = computeDealHealthSet(board, { [id]: { events: ev.data } });
          setHealth(set.get(id) ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState variant="error" title="Failed to load deal" description={error} />;
  if (!deal) return <CardSkeleton count={3} />;

  return (
    <div className="space-y-3">
      <div className="text-base font-bold text-navy">{deal.projectName}</div>
      <div className="text-label text-grey">
        {deal.stage.replace(/_/g, ' ')} · {deal.packageType ?? '—'} ·{' '}
        {deal.packageValue != null ? `$${(deal.packageValue / 100).toLocaleString()}` : '—'}
      </div>
      {health && (
        <div className="text-label text-grey">
          Likelihood {health.likelihood.percentile}th percentile ({health.likelihood.band}) ·{' '}
          {health.warnings.length} warning{health.warnings.length === 1 ? '' : 's'} · {events.length} events
        </div>
      )}
    </div>
  );
}
