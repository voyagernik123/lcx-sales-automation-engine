import { useEffect, useState } from 'react';
import { Copy, AlertTriangle } from 'lucide-react';
import { fetchClaims } from '@/lib/api/bd';
import type { Claim } from '@/types/bd';
import { CLAIM_CATEGORY_LABELS, CLAIM_RISK_COLORS } from '@/types/bd';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import type { InspectorPayloadProps } from './ProjectInspector';

/**
 * Claim entity inspector — the approved text with its risk/jurisdiction
 * envelope and a one-click copy, so drafts can cite claims without a page hop.
 */
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(claim.text);
      toast('success', `Claim ${claim.id} copied to clipboard`);
    } catch {
      toast('error', 'Copy failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Identity + risk/jurisdiction envelope */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-micro font-bold text-grey">{claim.id}</span>
        <span className="text-micro text-grey">v{claim.version}</span>
        <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${CLAIM_RISK_COLORS[claim.riskLevel] ?? 'bg-ice-soft dark:bg-ice-soft/10 text-grey'}`}>
          {claim.riskLevel} risk
        </span>
        {claim.jurisdiction.map(j => (
          <span key={j} className="rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400 px-1.5 py-0.5 text-micro font-bold uppercase">
            {j}
          </span>
        ))}
      </div>

      <div className="text-micro font-bold uppercase tracking-wider text-grey">
        {CLAIM_CATEGORY_LABELS[claim.category] ?? claim.category}
        {!claim.active && <span className="ml-2 text-status-blocked">inactive</span>}
      </div>

      {claim.requiresHumanReview && (
        <div className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-2 py-1.5 text-micro font-bold text-amber-700 dark:text-amber-400">
          <AlertTriangle size={11} /> Requires human review before use
        </div>
      )}

      {/* Approved text */}
      <div className="rounded border border-line p-2.5">
        <p className="text-label leading-relaxed text-navy">{claim.text}</p>
      </div>

      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-label font-semibold text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
      >
        <Copy size={11} /> Copy claim text
      </button>
    </div>
  );
}
