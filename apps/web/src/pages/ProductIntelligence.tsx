import { useState, useMemo } from 'react';
import { ProductGrid, FeasibilityMap, RoadmapTimeline, GapAnalysis } from '@/components/productIntel';
import { InspectorDrawer } from '@/components/ui';
import { useFilterStore } from '@/stores';
import { productCatalog, competitors } from '@/data';
import { Sparkles, Target, Clock, Layers } from 'lucide-react';

export function ProductIntelligence() {
  const { clarityEnacted, toggleFilterStoreField } = useFilterStore();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => productCatalog.find(p => p.id === selectedProductId) ?? null,
    [selectedProductId],
  );

  const stats = useMemo(() => {
    const tier1 = productCatalog.filter(p => p.priorityTier === 1).length;
    const competitorCount = competitors.length;
    const postClarityFeasible = productCatalog.filter(p => p.usPostClarity === 'feasible').length;
    const preClarityFeasible = productCatalog.filter(p => p.usPreClarity === 'feasible').length;
    const feasibleNow = clarityEnacted ? postClarityFeasible : preClarityFeasible;
    return { total: productCatalog.length, tier1, competitorCount, feasibleNow };
  }, [clarityEnacted]);

  return (
    <>
      <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy dark:text-ice overflow-hidden">

        {/* TOOLBAR */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card overflow-x-auto">
          <h1 className="text-lg font-bold shrink-0 flex items-center gap-1.5">
            <Target size={17} className="text-cyan-500" />
            Product Intelligence
          </h1>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-3 text-[9px] text-grey">
              <span className="flex items-center gap-1"><Layers size={11} /> {stats.total} products</span>
              <span className="flex items-center gap-1"><Sparkles size={11} className="text-amber-500" /> {stats.tier1} critical</span>
              <span className="flex items-center gap-1"><Clock size={11} className="text-emerald-500" /> {stats.feasibleNow} feasible (US)</span>
            </div>

            <button
              onClick={() => toggleFilterStoreField('clarityEnacted')}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold transition-all duration-300 ${
                clarityEnacted
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:border-cyan-400 dark:bg-cyan-400/10 dark:text-cyan-400 shadow-sm shadow-cyan-500/10'
                  : 'border-line text-grey hover:bg-ice-soft'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${clarityEnacted ? 'bg-cyan-500' : 'bg-slate-400'}`} />
              {clarityEnacted ? 'CLARITY Enacted' : 'CLARITY Inactive'}
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-4 space-y-5">
            <ProductGrid onProductClick={setSelectedProductId} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <FeasibilityMap />
              <RoadmapTimeline />
            </div>
            <GapAnalysis />
          </div>
        </div>
      </div>

      {/* PRODUCT INSPECTOR */}
      <InspectorDrawer
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProductId(null)}
        title={selectedProduct?.name ?? ''}
      >
        {selectedProduct && (
          <div className="space-y-4 text-xs leading-relaxed text-navy dark:text-ice">
            <div className="flex flex-wrap gap-2">
              <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${
                selectedProduct.priorityTier === 1 ? 'border-amber-400/40 bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                selectedProduct.priorityTier === 2 ? 'border-cyan-400/30 bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400' :
                'border-line bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                Tier {selectedProduct.priorityTier} Priority
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-full border border-line bg-ice-soft dark:bg-navy-deep font-mono">{selectedProduct.category}</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full border border-line bg-ice-soft dark:bg-navy-deep font-mono">{selectedProduct.audience}</span>
            </div>

            <p className="text-xs leading-snug">{selectedProduct.description}</p>

            <div className="space-y-2 border-t border-line pt-3">
              <Section label="Target Customer" value={selectedProduct.targetCustomer} />
              <Section label="Pain Point" value={selectedProduct.painPoint} />
              <Section label="Value Proposition" value={selectedProduct.valueProposition} />
              <Section label="Revenue Model" value={selectedProduct.revenueModel} />
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block mb-1">US Pre-CLARITY</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  selectedProduct.usPreClarity === 'feasible' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                  selectedProduct.usPreClarity === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                  'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                }`}>{selectedProduct.usPreClarity}</span>
                {selectedProduct.usPreClarity !== 'prohibited' && selectedProduct.usPreClarity !== 'uncertain' && (
                  <p className="text-[9px] text-grey mt-1">Est. timeline: {selectedProduct.usTimelineMonths} months</p>
                )}
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block mb-1">US Post-CLARITY</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  selectedProduct.usPostClarity === 'feasible' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                  selectedProduct.usPostClarity === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                  'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                }`}>{selectedProduct.usPostClarity}</span>
              </div>
            </div>

            {selectedProduct.usLicensingRequired.length > 0 && (
              <div className="border-t border-line pt-3">
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block mb-1">Licensing Required (US)</span>
                <div className="flex flex-wrap gap-1">
                  {selectedProduct.usLicensingRequired.map(l => (
                    <span key={l} className="text-[9px] px-1.5 py-0.5 rounded bg-ice-soft dark:bg-navy-deep border border-line font-mono">{l}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedProduct.dependencies.length > 0 && (
              <div className="border-t border-line pt-3">
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block mb-1">Dependencies</span>
                <div className="flex flex-wrap gap-1">
                  {selectedProduct.dependencies.map(d => (
                    <span key={d} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 font-mono text-purple-700 dark:text-purple-400">{d}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-[10px]">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block">Complexity</span>
                <span className="font-mono font-bold text-navy dark:text-ice">{selectedProduct.implementationComplexity}/10</span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block">Strategic Importance</span>
                <span className="font-mono font-bold text-navy dark:text-ice">{selectedProduct.strategicImportance}/10</span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block">Revenue Potential</span>
                <span className="font-mono font-bold text-navy dark:text-ice capitalize">{selectedProduct.estRevenuePotential}</span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block">Current Status</span>
                <span className="font-mono font-bold text-navy dark:text-ice capitalize">{selectedProduct.currentStatus.replace('_', ' ')}</span>
              </div>
            </div>

            {selectedProduct.topCompetitors.length > 0 && (
              <div className="border-t border-line pt-3">
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block mb-1">Top Competitors</span>
                <div className="flex flex-wrap gap-1">
                  {selectedProduct.topCompetitors.map(cid => {
                    const comp = competitors.find(c => c.id === cid);
                    return (
                      <span key={cid} className="text-[9px] px-1.5 py-0.5 rounded bg-ice-soft dark:bg-navy-deep border border-line font-mono">
                        {comp?.name || cid}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedProduct.notes && (
              <div className="border-t border-line pt-3">
                <span className="text-[8px] font-bold uppercase tracking-wider text-grey block mb-1">Notes</span>
                <p className="text-[10px] text-grey-dark dark:text-grey-light leading-snug italic">{selectedProduct.notes}</p>
              </div>
            )}
          </div>
        )}
      </InspectorDrawer>
    </>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[8px] font-bold uppercase tracking-wider text-grey block">{label}</span>
      <p className="text-[10px] mt-0.5 leading-snug">{value}</p>
    </div>
  );
}

export default ProductIntelligence;
