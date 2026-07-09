import { useMemo } from 'react';
import { productCatalog } from '@/data';
import { useFilterStore } from '@/stores';

const PLOT_LEFT = 70;
const PLOT_RIGHT = 780;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 520;
const PW = PLOT_RIGHT - PLOT_LEFT;
const PH = PLOT_BOTTOM - PLOT_TOP;
const MX = PLOT_LEFT + PW / 2;
const MY = PLOT_TOP + PH / 2;

const tierColors: Record<number, string> = { 1: '#f59e0b', 2: '#06b6d4', 3: '#6366f1', 4: '#94a3b8' };
const revenueRadii: Record<string, number> = { transformative: 11, high: 8, medium: 6, low: 4 };

function toX(c: number) { return PLOT_LEFT + (c / 10) * PW; }
function toY(s: number) { return PLOT_BOTTOM - (s / 10) * PH; }

export function FeasibilityMap() {
  const { clarityEnacted } = useFilterStore();

  const dots = useMemo(() => {
    return productCatalog
      .filter(p => p.usPreClarity !== 'prohibited' || p.usPostClarity !== 'prohibited')
      .map(p => {
        const preFeasible = p.usPreClarity === 'feasible';
        const postFeasible = p.usPostClarity === 'feasible';
        const preX = preFeasible ? toX(p.implementationComplexity) : toX(Math.min(10, p.implementationComplexity + 3));
        const postX = postFeasible ? toX(p.implementationComplexity) : toX(Math.min(10, p.implementationComplexity + 3));
        const y = toY(p.strategicImportance);
        return {
          id: p.id, name: p.name, category: p.category, tier: p.priorityTier,
          x: clarityEnacted ? postX : preX, y,
          preX, postX, postY: y,
          radius: revenueRadii[p.estRevenuePotential],
          preFeasible, postFeasible,
          revenue: p.estRevenuePotential,
        };
      });
  }, [clarityEnacted]);

  const gridColor = 'rgb(148 163 184 / 0.15)';
  const axisColor = 'rgb(148 163 184)';
  const labelColor = 'rgb(100 116 139)';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy dark:text-ice">US Feasibility Map</h2>
          <p className="text-xs text-grey-dark dark:text-grey-light mt-0.5">Implementation Complexity × Strategic Importance. Size = revenue potential. {clarityEnacted ? 'Post-CLARITY.' : 'Pre-CLARITY.'}</p>
        </div>
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${clarityEnacted ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' : 'border-line text-grey'}`}>{clarityEnacted ? 'Post-CLARITY View' : 'Pre-CLARITY Baseline'}</span>
      </div>

      <div className="relative bg-card border border-line rounded-lg overflow-hidden">
        <svg viewBox="0 0 820 560" className="w-full" style={{ minHeight: 340 }} preserveAspectRatio="xMidYMid meet">
          {[0, 2, 4, 6, 8, 10].map(v => (
            <g key={v}>
              <line x1={toX(v)} y1={PLOT_TOP} x2={toX(v)} y2={PLOT_BOTTOM} stroke={gridColor} strokeWidth="0.5" strokeDasharray="3,3" />
              <line x1={PLOT_LEFT} y1={toY(v)} x2={PLOT_RIGHT} y2={toY(v)} stroke={gridColor} strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={toX(v)} y={PLOT_BOTTOM + 15} textAnchor="middle" fill={labelColor} fontSize="9" fontFamily="JetBrains Mono, monospace">{v}</text>
              <text x={PLOT_LEFT - 8} y={toY(v) + 3} textAnchor="end" fill={labelColor} fontSize="9" fontFamily="JetBrains Mono, monospace">{v}</text>
            </g>
          ))}

          <line x1={MX} y1={PLOT_TOP} x2={MX} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />
          <line x1={PLOT_LEFT} y1={MY} x2={PLOT_RIGHT} y2={MY} stroke={axisColor} strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />

          {/* Quadrant labels */}
          <text x={MX + PW * 0.06} y={PLOT_TOP + PH * 0.2} fill="#f59e0b" fontSize="13" fontWeight="800" fontFamily="Inter, sans-serif" letterSpacing="2" opacity="0.45">QUICK WINS</text>
          <text x={MX + PW * 0.06} y={MY + PH * 0.2} fill="#06b6d4" fontSize="13" fontWeight="800" fontFamily="Inter, sans-serif" letterSpacing="2" opacity="0.45">STRATEGIC BETS</text>
          <text x={PLOT_LEFT + PW * 0.08} y={PLOT_TOP + PH * 0.2} fill="#94a3b8" fontSize="13" fontWeight="800" fontFamily="Inter, sans-serif" letterSpacing="2" opacity="0.4">LOW HANGING</text>
          <text x={PLOT_LEFT + PW * 0.08} y={MY + PH * 0.2} fill="#6366f1" fontSize="13" fontWeight="800" fontFamily="Inter, sans-serif" letterSpacing="2" opacity="0.4">LONG SHOTS</text>

          {/* CLARITY shift arrows */}
          {clarityEnacted && dots.filter(d => Math.abs(d.x - d.preX) > 3).map(d => (
            <g key={`arrow-${d.id}`}>
              <line x1={d.preX} y1={d.y} x2={d.x} y2={d.y} stroke="rgba(6,182,212,0.3)" strokeWidth="1" strokeDasharray="3,2" />
              <polygon points={`${d.x},${d.y} ${d.x - 4},${d.y - 2} ${d.x - 4},${d.y + 2}`} fill="rgba(6,182,212,0.4)" />
            </g>
          ))}

          {/* Dots */}
          {dots.map(d => {
            const color = tierColors[d.tier] || '#94a3b8';
            const r = d.radius;
            return (
              <g key={d.id} className="cursor-pointer">
                <circle cx={d.x} cy={d.y} r={r} fill="#fff" stroke={color} strokeWidth="1.5" opacity="0.9" />
                <text x={d.x} y={d.y + r + 10} textAnchor="middle" fill="#1e293b" fontSize="8" fontWeight="600" fontFamily="Inter, sans-serif"
                  className="dark:fill-[#e2e8f0] pointer-events-none select-none">
                  {d.name.length > 16 ? d.name.slice(0, 15) + '…' : d.name}
                </text>
              </g>
            );
          })}

          <text x={MX} y={PLOT_BOTTOM + 33} textAnchor="middle" fill={labelColor} fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif" letterSpacing="1">
            IMPLEMENTATION COMPLEXITY →
          </text>
          <text x={PLOT_LEFT - 48} y={MY} textAnchor="middle" fill={labelColor} fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif" letterSpacing="1"
            transform={`rotate(-90, ${PLOT_LEFT - 48}, ${MY})`}>
            STRATEGIC IMPORTANCE →
          </text>

          <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1" />
          <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}
