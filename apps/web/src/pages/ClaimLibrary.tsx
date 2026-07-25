import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Copy } from 'lucide-react';
import { fetchClaims } from '@/lib/api/bd';
import { CLAIM_CATEGORY_LABELS, CLAIM_RISK_COLORS } from '@/types/bd';
import type { Claim, ClaimLibrarySnapshot } from '@/types/bd';
import { Button, SectionLabel } from '@/components/ui';
import { EmptyState, CardSkeleton } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import { useInspect } from '@/stores';

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
      <div className="h-[calc(100vh-6.5rem)] overflow-hidden p-4">
        <div className="max-w-[900px] mx-auto">
          <CardSkeleton count={6} />
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="flex h-[calc(100vh-6.5rem)] items-center justify-center">
        <EmptyState
          variant="error"
          title="Failed to load claims"
          description={error || 'Unknown error'}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-line bg-card">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-navy">Claim Library</h1>
          <span className="text-micro text-grey">v{snapshot.version}</span>
        </div>
        <span className="text-micro text-grey num-tabular">{snapshot.claims.length} claims · updated {new Date(snapshot.updatedAt).toLocaleDateString()}</span>
      </div>

      {/* Admin Disclaimer */}
      <div className="shrink-0 px-4 py-2 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
        <p className="text-micro text-amber-700 dark:text-amber-400">
          This content is provided for informational purposes only and does not constitute legal advice.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-line bg-card overflow-x-auto">
        <button
          onClick={() => setActiveCategory(null)}
          aria-pressed={!activeCategory}
          className={clsx(
            'whitespace-nowrap rounded-full border px-2.5 py-1 text-micro font-semibold transition-colors',
            !activeCategory
              ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
              : 'border-line text-grey hover:text-navy hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10',
          )}
        >
          All ({snapshot.claims.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            aria-pressed={activeCategory === cat}
            className={clsx(
              'whitespace-nowrap rounded-full border px-2.5 py-1 text-micro font-semibold transition-colors',
              activeCategory === cat
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                : 'border-line text-grey hover:text-navy hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10',
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
            // Two different facts: the library is empty, or the active category
            // tab hides everything. The old copy said "in this category" even
            // with no category selected, and gave no way back to All.
            activeCategory ? (
              <EmptyState
                variant="search"
                title="No claims in this category"
                description={`${CLAIM_CATEGORY_LABELS[activeCategory] ?? activeCategory} has no approved claims yet — the library holds ${snapshot.claims.length}.`}
                action={
                  <Button size="sm" variant="secondary" onClick={() => setActiveCategory(null)}>
                    Show all {snapshot.claims.length} claims
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No claims yet"
                description="The claim library is empty — approved messaging appears here once legal has signed it off."
              />
            )
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
  const inspect = useInspect();

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(claim.text);
      toast('success', `Claim ${claim.id} copied to clipboard`);
    } catch {
      toast('error', 'Copy failed');
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inspect('claim', claim.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inspect('claim', claim.id);
        }
      }}
      title="Inspect claim"
      className="rounded-lg border border-line/70 bg-card shadow-card overflow-hidden cursor-pointer text-left lift hover:border-cyan-400 focus-ring"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-ice-soft dark:bg-ice-soft/5">
        <span className="text-micro font-mono font-bold text-grey">{claim.id}</span>
        <span className="text-micro text-grey num-tabular">v{claim.version}</span>
        <span className={`inline-flex h-[18px] items-center rounded px-1.5 text-micro font-semibold capitalize ${CLAIM_RISK_COLORS[claim.riskLevel]}`}>
          {claim.riskLevel}
        </span>
        {claim.requiresHumanReview && (
          <span className="inline-flex h-[18px] items-center rounded bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 px-1.5 text-micro font-semibold">Review Required</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {claim.jurisdiction.map(j => (
            <span key={j} className="inline-flex h-[18px] items-center rounded border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-1.5 text-micro font-semibold text-grey-dark uppercase">{j}</span>
          ))}
          <button
            onClick={e => void copy(e)}
            className="ml-1 inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-micro font-bold text-grey hover:bg-card hover:text-navy transition-colors"
            title="Copy claim text"
          >
            <Copy size={9} /> Copy
          </button>
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-label leading-relaxed">{claim.text}</p>
      </div>
      <div className="px-4 py-1.5 border-t border-line/50 bg-ice-soft dark:bg-ice-soft/5">
        <SectionLabel className="text-grey">{CLAIM_CATEGORY_LABELS[claim.category] ?? claim.category}</SectionLabel>
      </div>
    </div>
  );
}

export default ClaimLibrary;
