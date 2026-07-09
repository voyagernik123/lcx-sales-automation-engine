import { useState, useMemo, useCallback, useEffect } from 'react';
import { competitors } from '@/data';
import { useFilterStore } from '@/stores';
import {
  computeAllScores,
  QUADRANT_COLORS,
  QUADRANT_LABELS,
  CompetitorScores,
} from '@/lib/competitiveScoring';
import { clsx } from 'clsx';

function useIsDark() {
  const [dark, setDark] = useState(typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

interface StrategicMatrixProps {
  onCompetitorClick?: (competitorId: string) => void;
}

interface PlacedDot extends CompetitorScores {
  x: number;
  y: number;
  postX: number;
  postY: number;
}

const PLOT_LEFT = 100;
const PLOT_RIGHT = 850;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 510;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const MID_X = PLOT_LEFT + PLOT_WIDTH / 2;
const MID_Y = PLOT_TOP + PLOT_HEIGHT / 2;

const dotLabelOffsets: Record<string, { dx: number; dy: number }> = {
  coinbase: { dx: -8, dy: -14 },
  kraken: { dx: 12, dy: 4 },
  gemini: { dx: 12, dy: -8 },
  robinhood: { dx: -14, dy: 8 },
  crypto_com: { dx: -12, dy: -12 },
  okx: { dx: 14, dy: -4 },
  binance_us: { dx: 10, dy: 10 },
  kucoin: { dx: 10, dy: 10 },
  bybit: { dx: -10, dy: 12 },
  bitstamp: { dx: 10, dy: -10 },
};

const tickValues = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function toX(score: number): number {
  return PLOT_LEFT + (score / 100) * PLOT_WIDTH;
}

function toY(score: number): number {
  return PLOT_BOTTOM - (score / 100) * PLOT_HEIGHT;
}

export function StrategicMatrix({ onCompetitorClick }: StrategicMatrixProps) {
  const { clarityEnacted } = useFilterStore();
  const isDark = useIsDark();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const allScores = useMemo(() => computeAllScores(competitors), []);
  const activeScores = useMemo(() => {
    return allScores.filter(s => {
      if (clarityEnacted) return true;
      return s.marketVolume > 0 || s.preClarityRegulatory > 0;
    });
  }, [allScores, clarityEnacted]);

  const dots: PlacedDot[] = useMemo(() => {
    return activeScores.map(s => ({
      ...s,
      x: toX(clarityEnacted ? s.postClarityRegulatory : s.preClarityRegulatory),
      y: toY(s.marketVolume),
      postX: toX(s.postClarityRegulatory),
      postY: toY(s.marketVolume),
    }));
  }, [activeScores, clarityEnacted]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>, dot: PlacedDot) => {
    const svg = e.currentTarget.closest('svg');
    if (!svg) return;
    const parent = svg.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left + 16,
      y: e.clientY - rect.top - 10,
    });
    setHoveredId(dot.id);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  const hoveredDot = hoveredId ? dots.find(d => d.id === hoveredId) : null;

  const gridColor = 'rgb(148 163 184 / 0.2)';
  const axisColor = 'rgb(148 163 184)';
  const labelColor = 'rgb(100 116 139)';
  const bgColor = isDark ? 'rgb(15 23 42)' : 'rgb(255 255 255)';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const dotFill = isDark ? 'rgb(30 41 59)' : '#ffffff';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy dark:text-ice">
            Strategic Positioning Matrix
          </h2>
          <p className="text-xs text-grey-dark dark:text-grey-light mt-0.5">
            Regulatory Coverage Index × Market Volume &amp; Foothold. Click a dot to inspect.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-grey">
          <span className={clsx('h-2 w-2 rounded-full', clarityEnacted ? 'bg-cyan-500' : 'bg-slate-400')} />
          <span>{clarityEnacted ? 'CLARITY Enacted' : 'CLARITY Inactive'}</span>
        </div>
      </div>

      <div className="relative bg-card border border-line rounded-lg overflow-hidden shadow-sm">
        <svg
          viewBox="0 0 920 580"
          className="w-full"
          style={{ minHeight: 420, background: bgColor }}
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x="0" y="0" width="920" height="580" fill={bgColor} />

          {tickValues.map(v => {
            const x = toX(v);
            const y = toY(v);
            return (
              <g key={`grid-${v}`}>
                <line x1={x} y1={PLOT_TOP} x2={x} y2={PLOT_BOTTOM} stroke={gridColor} strokeWidth="0.5" strokeDasharray="4,4" />
                <line x1={PLOT_LEFT} y1={y} x2={PLOT_RIGHT} y2={y} stroke={gridColor} strokeWidth="0.5" strokeDasharray="4,4" />
                <text x={x} y={PLOT_BOTTOM + 18} textAnchor="middle" fill={labelColor} fontSize="10" fontFamily="JetBrains Mono, monospace">{v}</text>
                <text x={PLOT_LEFT - 10} y={y + 4} textAnchor="end" fill={labelColor} fontSize="10" fontFamily="JetBrains Mono, monospace">{v}</text>
              </g>
            );
          })}

          <line x1={MID_X} y1={PLOT_TOP} x2={MID_X} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1.5" strokeDasharray="8,4" opacity="0.6" />
          <line x1={PLOT_LEFT} y1={MID_Y} x2={PLOT_RIGHT} y2={MID_Y} stroke={axisColor} strokeWidth="1.5" strokeDasharray="8,4" opacity="0.6" />

          {(['leaders', 'regulatoryHedge', 'volumeRiders', 'outsiders'] as const).map(q => {
            const colors = QUADRANT_COLORS[q];
            const isRight = q === 'leaders' || q === 'regulatoryHedge';
            const isTop = q === 'leaders' || q === 'volumeRiders';
            return (
              <g key={`quadrant-${q}`}>
                <rect
                  x={isRight ? MID_X : PLOT_LEFT + 2}
                  y={isTop ? PLOT_TOP + 2 : MID_Y}
                  width={PLOT_WIDTH / 2 - 4}
                  height={PLOT_HEIGHT / 2 - 4}
                  fill={colors.fill}
                  stroke="none"
                  rx="6"
                />
                <text
                  x={isRight ? MID_X + PLOT_WIDTH * 0.1 : PLOT_LEFT + PLOT_WIDTH * 0.1}
                  y={isTop ? PLOT_TOP + PLOT_HEIGHT * 0.3 : MID_Y + PLOT_HEIGHT * 0.3}
                  fill={colors.text}
                  fontSize="14"
                  fontWeight="800"
                  fontFamily="Inter, system-ui, sans-serif"
                  letterSpacing="3"
                  opacity="0.55"
                >
                  {QUADRANT_LABELS[q]}
                </text>
              </g>
            );
          })}

          {clarityEnacted && dots.map(dot => {
            const preX = toX(dot.preClarityRegulatory);
            const preY = toY(dot.marketVolume);
            if (Math.abs(dot.x - preX) < 2) return null;
            return (
              <g key={`arrow-${dot.id}`}>
                <line x1={preX} y1={preY} x2={dot.x} y2={dot.y} stroke="rgba(6,182,212,0.35)" strokeWidth="1" strokeDasharray="4,3" />
                <polygon points={`${dot.x},${dot.y} ${dot.x - 5},${dot.y - 3} ${dot.x - 5},${dot.y + 3}`} fill="rgba(6,182,212,0.5)" />
              </g>
            );
          })}

          {dots.map(dot => {
            const q = clarityEnacted ? dot.postClarityQuadrant : dot.quadrant;
            const colors = QUADRANT_COLORS[q];
            const radius = Math.max(6, Math.min(16, dot.marketShare * 0.4 + 4));
            const isHovered = hoveredId === dot.id;
            const offset = dotLabelOffsets[dot.id] || { dx: 10, dy: -10 };

            let dotColor = colors.stroke;
            if (dot.threatLevel === 'Critical' || dot.threatLevel === 'High') dotColor = 'rgb(239,68,68)';
            else if (dot.threatLevel === 'Medium') dotColor = 'rgb(245,158,11)';

            const tag = dot.name.length > 12 ? dot.name.slice(0, 11) + '\u2026' : dot.name;
            const lx = Math.max(PLOT_LEFT + 15, Math.min(PLOT_RIGHT - 15, dot.x + offset.dx));
            const ly = Math.max(PLOT_TOP + 8, Math.min(PLOT_BOTTOM - 4, dot.y + offset.dy));

            return (
              <g key={`dot-${dot.id}`} style={{ cursor: 'pointer' }}>
                <circle cx={dot.x} cy={dot.y} r={radius}
                  fill={isHovered ? colors.fill : dotFill}
                  stroke={isHovered ? dotColor : colors.stroke}
                  strokeWidth={isHovered ? 3 : 2}
                  style={{ transition: 'all 0.3s', opacity: isHovered ? 1 : 0.85 }}
                  onMouseMove={(e) => handleMouseMove(e, dot)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => onCompetitorClick?.(dot.id)}
                />
                <text x={lx} y={ly}
                  fill={textColor}
                  fontSize="10" fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {tag}
                </text>
                <circle cx={dot.x} cy={dot.y} r={radius + 6}
                  fill="transparent" stroke="transparent"
                  onMouseMove={(e) => handleMouseMove(e, dot)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => onCompetitorClick?.(dot.id)}
                />
              </g>
            );
          })}

          <text x={MID_X} y={PLOT_BOTTOM + 38}
            textAnchor="middle" fill={labelColor}
            fontSize="11" fontWeight="600"
            fontFamily="Inter, system-ui, sans-serif" letterSpacing="1"
          >
            REGULATORY COVERAGE INDEX →
          </text>
          <text x={PLOT_LEFT - 62} y={MID_Y}
            textAnchor="middle" fill={labelColor}
            fontSize="11" fontWeight="600"
            fontFamily="Inter, system-ui, sans-serif" letterSpacing="1"
            transform={`rotate(-90, ${PLOT_LEFT - 62}, ${MID_Y})`}
          >
            MARKET VOLUME &amp; FOOTHOLD →
          </text>

          <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1.5" />
          <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1.5" />
        </svg>

        {hoveredDot && (
          <div
            className="absolute z-50 pointer-events-none bg-slate-950 text-slate-100 rounded-lg border border-slate-700 px-3 py-2.5 text-[10px] shadow-xl font-mono leading-relaxed"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            <div className="font-bold text-xs text-cyan-400 mb-1">{hoveredDot.name}</div>
            <div className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Regulatory:</span>
                <span className="font-bold">{clarityEnacted ? hoveredDot.postClarityRegulatory : hoveredDot.preClarityRegulatory}/100</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Volume:</span>
                <span className="font-bold">{hoveredDot.marketVolume}/100</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Share:</span>
                <span className="font-bold">{hoveredDot.marketShare}%</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Quadrant:</span>
                <span className="font-bold text-cyan-400">{QUADRANT_LABELS[clarityEnacted ? hoveredDot.postClarityQuadrant : hoveredDot.quadrant]}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
        {(['leaders', 'regulatoryHedge', 'volumeRiders', 'outsiders'] as const).map(q => {
          const colors = QUADRANT_COLORS[q];
          const count = dots.filter(d => (clarityEnacted ? d.postClarityQuadrant : d.quadrant) === q).length;
          return (
            <div key={q} className="flex items-center gap-2 bg-card border border-line rounded px-2.5 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.stroke }} />
              <span className="text-grey-dark dark:text-grey-light font-semibold">{QUADRANT_LABELS[q]}</span>
              <span className="ml-auto font-mono font-bold text-navy dark:text-ice">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
