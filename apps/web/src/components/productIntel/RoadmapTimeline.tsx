import { useMemo } from 'react';
import { productCatalog } from '@/data';

interface Phase { label: string; start: number; end: number; color: string; }
const phases: Phase[] = [
  { label: 'Now (Q3 2026)', start: 0, end: 1, color: '#10b981' },
  { label: 'Phase 1 (Q4 2026)', start: 1, end: 3, color: '#06b6d4' },
  { label: 'Phase 2 (2027)', start: 3, end: 7, color: '#f59e0b' },
  { label: 'Phase 3+ (2028+)', start: 7, end: 12, color: '#8b5cf6' },
];

function timelinePos(months: number): number {
  const maxM = 36;
  return Math.min(95, (months / maxM) * 95);
}

export function RoadmapTimeline() {
  const tierProducts = useMemo(() => {
    const t1 = productCatalog.filter(p => p.priorityTier === 1).slice(0, 10);
    const t2 = productCatalog.filter(p => p.priorityTier === 2).slice(0, 10);
    const t3 = productCatalog.filter(p => p.priorityTier === 3).slice(0, 10);
    return { t1, t2, t3 };
  }, []);

  const renderSwimLane = (label: string, products: typeof productCatalog, color: string) => (
    <div className="flex items-start gap-3 py-2 border-b border-line last:border-0">
      <div className="w-20 shrink-0 pt-1">
        <span className="text-[9px] font-bold text-navy dark:text-ice">{label}</span>
        <div className="text-[8px] text-grey">{products.length} products</div>
      </div>
      <div className="flex-1 relative h-16">
        {/* Phase backgrounds */}
        {phases.map(ph => (
          <div key={ph.label} className="absolute top-0 h-full rounded opacity-15" style={{
            left: `${timelinePos(ph.start * 3)}%`, width: `${timelinePos(ph.end * 3) - timelinePos(ph.start * 3)}%`,
            backgroundColor: ph.color,
          }} />
        ))}
        {/* Products as bars */}
        {products.map((p, i) => {
          const left = timelinePos(p.usTimelineMonths);
          const w = Math.max(2, p.implementationComplexity * 1.2);
          const y = 4 + i * 5;
          return (
            <div key={p.id} className="absolute h-1 rounded-full group cursor-default"
              style={{ left: `${left}%`, width: w, top: y, backgroundColor: color }}
              title={`${p.name} — ${p.usTimelineMonths}mo est. · Complexity: ${p.implementationComplexity}/10`}>
              <span className="absolute -top-1 left-full ml-1 text-[7px] font-mono text-grey opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                {p.name.length > 20 ? p.name.slice(0, 19) + '…' : p.name} ({p.usTimelineMonths}mo)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-navy dark:text-ice">Product Roadmap</h2>

      <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
        {/* Timeline axis */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-20 shrink-0" />
          <div className="flex-1 relative h-4">
            {phases.map(ph => (
              <div key={ph.label} className="absolute top-0 text-[8px] font-bold font-mono" style={{ left: `${timelinePos(ph.start * 3)}%`, color: ph.color }}>
                {ph.label}
              </div>
            ))}
          </div>
        </div>

        {/* Today marker */}
        <div className="relative">
          <div className="absolute left-[20px] top-0 bottom-0 w-px bg-cyan-500 z-10" style={{ left: `${timelinePos(1.5 * 3)}%` }}>
            <span className="absolute -top-3 -translate-x-1/2 text-[8px] font-bold text-cyan-500 font-mono">TODAY</span>
          </div>

          {renderSwimLane('Tier 1 · Critical', tierProducts.t1, '#f59e0b')}
          {renderSwimLane('Tier 2 · High', tierProducts.t2, '#06b6d4')}
          {renderSwimLane('Tier 3 · Medium', tierProducts.t3, '#6366f1')}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line text-[9px] text-grey">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#f59e0b] shrink-0" /> T1 Critical</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#06b6d4] shrink-0" /> T2 High</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#6366f1] shrink-0" /> T3 Medium</span>
          <span className="ml-auto font-mono">Bar length = implementation complexity</span>
        </div>
      </div>
    </div>
  );
}
