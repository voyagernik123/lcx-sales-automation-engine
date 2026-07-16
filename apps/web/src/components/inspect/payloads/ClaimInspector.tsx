import { useEffect, useState } from 'react';
import { fetchClaims } from '@/lib/api/bd';
import type { Claim } from '@/types/bd';
import { CardSkeleton, EmptyState } from '@/components/shared';
import type { InspectorPayloadProps } from './ProjectInspector';

/** Claim inspector stub — Wave-1 (comms agent) adds usage back-references. */
export function ClaimInspector({ id }: InspectorPayloadProps) {
  const [claim, setClaim] = useState<Claim | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setClaim(undefined);
    setError(null);
    fetchClaims()
      .then(res => {
        if (!cancelled) setClaim(res.data.claims.find(c => c.id === id) ?? null);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState variant="error" title="Failed to load claim" description={error} />;
  if (claim === undefined) return <CardSkeleton count={2} />;
  if (claim === null) return <EmptyState variant="search" title="Claim not found" description={`No claim with id ${id}.`} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-micro font-bold text-grey">{claim.id}</span>
        <span className="rounded bg-ice-soft dark:bg-ice-soft/10 px-1.5 py-0.5 text-micro font-bold">{claim.riskLevel}</span>
      </div>
      <p className="text-label leading-relaxed text-navy">{claim.text}</p>
    </div>
  );
}
