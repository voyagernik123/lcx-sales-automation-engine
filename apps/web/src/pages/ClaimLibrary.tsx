import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { fetchClaims } from '@/lib/api/bd';
import { CLAIM_CATEGORY_LABELS, CLAIM_RISK_COLORS } from '@/types/bd';
import type { Claim, ClaimLibrarySnapshot } from '@/types/bd';

export function ClaimLibrary() {
  const [snapshot, setSnapshot] = useState<ClaimLibrarySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchClaims();
        setSnapshot(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load claims');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = snapshot
    ? [...new Set(snapshot.claims.map(c => c.category))]
    : [];

  const filtered = snapshot
    ? activeCategory
      ? snapshot.claims.filter(c => c.category === activeCategory)
      : snapshot.claims
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-6.5rem)]">
        <div className="flex items-center gap-2 text-grey">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <span className="text-sm">Loading claim library...</span>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-6.5rem)] text-red-500">
        <p className="text-sm font-semibold">Failed to load claims</p>
        <p className="text-xs mt-1 text-grey">{error || 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy dark:text-ice overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-line bg-card">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">Claim Library</h1>
          <span className="text-[10px] text-grey">v{snapshot.version}</span>
        </div>
        <span className="text-[9px] text-grey">{snapshot.claims.length} claims · updated {new Date(snapshot.updatedAt).toLocaleDateString()}</span>
      </div>

      {/* Admin Disclaimer */}
      <div className="shrink-0 px-4 py-2 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
        <p className="text-[10px] text-amber-700 dark:text-amber-400">
          This content is provided for informational purposes only and does not constitute legal advice.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-line bg-card overflow-x-auto">
        <button
          onClick={() => setActiveCategory(null)}
          className={clsx(
            'whitespace-nowrap rounded px-2.5 py-1 text-[10px] font-bold transition-colors',
            !activeCategory
              ? 'bg-cyan-600 text-white'
              : 'border border-line text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10',
          )}
        >
          All ({snapshot.claims.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={clsx(
              'whitespace-nowrap rounded px-2.5 py-1 text-[10px] font-bold transition-colors',
              activeCategory === cat
                ? 'bg-cyan-600 text-white'
                : 'border border-line text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10',
            )}
          >
            {CLAIM_CATEGORY_LABELS[cat] ?? cat} ({snapshot.claims.filter(c => c.category === cat).length})
          </button>
        ))}
      </div>

      {/* Claim List */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[900px] mx-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-grey italic">No claims in this category.</p>
          ) : (
            filtered.map(claim => (
              <ClaimCard key={claim.id} claim={claim} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ClaimCard({ claim }: { claim: Claim }) {
  return (
    <div className="rounded-lg border border-line bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5">
        <span className="text-[10px] font-mono font-bold text-grey">{claim.id}</span>
        <span className="text-[9px] text-grey">v{claim.version}</span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${CLAIM_RISK_COLORS[claim.riskLevel]}`}>
          {claim.riskLevel}
        </span>
        {claim.requiresHumanReview && (
          <span className="rounded bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-bold">Review Required</span>
        )}
        <span className="ml-auto flex gap-1">
          {claim.jurisdiction.map(j => (
            <span key={j} className="rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400 px-1.5 py-0.5 text-[9px] font-bold uppercase">{j}</span>
          ))}
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] leading-relaxed">{claim.text}</p>
      </div>
      <div className="px-4 py-1.5 border-t border-line/50 bg-ice-soft dark:bg-ice-soft/5">
        <span className="text-[9px] text-grey font-bold uppercase">{CLAIM_CATEGORY_LABELS[claim.category] ?? claim.category}</span>
      </div>
    </div>
  );
}

export default ClaimLibrary;
