import { useState, useMemo, useCallback, useEffect } from 'react';
import { competitors } from '@/data';
import { useFilterStore } from '@/stores';
import {
  computeAllScores,
  QUADRANT_COLORS,
  QUADRANT_LABELS,
  CompetitorScores,
  type Quadrant,
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

/**
 * A dot exists only for a competitor that HAS a y coordinate. marketVolume is
 * `number | null` on CompetitorScores and a null has no position on this axis —
 * plotting it lands an unmeasured competitor at the origin, which is a reading
 * nobody took. So the coordinate fields are non-nullable here and the narrowing
 * happens once, where the dots are built.
 */
interface PlacedDot extends Omit<CompetitorScores, 'marketVolume' | 'quadrant' | 'postClarityQuadrant'> {
  marketVolume: number;
  quadrant: Quadrant;
  postClarityQuadrant: Quadrant;
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

  /*
   * THE VISIBILITY RULE, and why the old one was a defect rather than a taste
   * call. It read:
   *
   *     if (clarityEnacted) return true;
   *     return s.marketVolume > 0 || s.preClarityRegulatory > 0;
   *
   * `marketVolume > 0` was doing two incompatible jobs. As a proxy for "we
   * measured something" it DELETED five competitors outright — KuCoin, Bybit,
   * Ondo Finance, MetaMask and Lido, each with preClarityRegulatory 0 — so the
   * matrix showed 16 dots and gave the reader no sign that ten more existed.
   * And it was not even a reliable proxy: it also deleted Superstate, whose
   * volume is a MEASURED 0 and which belongs at the origin, while ten unmeasured
   * competitors sailed through on their regulatory score and were plotted at
   * y=0 with "0/100" in the tooltip.
   *
   * Absent data refuses; it does not vanish and it does not render as 0. So the
   * split is now on the one thing that decides whether a y coordinate exists:
   * measured competitors are plotted (including a real 0), unmeasured ones are
   * named under the plot as unmeasured. Nobody is dropped.
   */
  const dots: PlacedDot[] = useMemo(() => {
    const placed: PlacedDot[] = [];
    for (const s of allScores) {
      // The three go null together (determineQuadrant returns null exactly when
      // volume is null); testing all three is what lets the compiler prove the
      // dot is fully coordinated rather than trusting this comment.
      if (s.marketVolume === null || s.quadrant === null || s.postClarityQuadrant === null) continue;
      placed.push({
        ...s,
        marketVolume: s.marketVolume,
        quadrant: s.quadrant,
        postClarityQuadrant: s.postClarityQuadrant,
        x: toX(clarityEnacted ? s.postClarityRegulatory : s.preClarityRegulatory),
        y: toY(s.marketVolume),
        postX: toX(s.postClarityRegulatory),
        postY: toY(s.marketVolume),
      });
    }
    return placed;
  }, [allScores, clarityEnacted]);

  /** Competitors with no readable volume figure at all. Not plotted, not hidden. */
  const unmeasured = useMemo(
    () => allScores.filter(s => s.marketVolume === null),
    [allScores]
  );

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
          <h2 className="text-lg font-bold text-navy">
            Strategic Positioning Matrix
          </h2>
          <p className="text-xs text-grey-dark mt-0.5">
            Regulatory Coverage Index × Market Volume &amp; Foothold. Click a dot to inspect. Volume
            scores are lower bounds — an open-ended figure counts only its floor and an unreadable
            one is dropped from the weighting, never counted as zero.
          </p>
        </div>

        <div className="flex items-center gap-2 text-micro font-mono text-grey">
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
              // The group still carries the CLICK, because the visible dot and the
              // larger transparent hit ring below are one target and one click path.
              //
              // It no longer carries the FOCUS, and that was a real defect rather
              // than a tidying: this <g> had role="button" tabIndex={0}
              // class="focus-ring", and WebKit paints no `outline` on an SVG
              // container element, so all 14 dots were reachable by Tab with no
              // visible indicator at all in the engine that ships. Verified in a
              // WKWebView (see the note on `.focus-ring-svg` in globals.css): under
              // real keyboard focus the <g> matches :focus-visible and computes
              // `outline: solid 2px rgb(8,145,178)` and still paints ZERO ring
              // pixels, while a <circle> in the same document paints the full ring.
              // Chromium paints the <g>, which is exactly why the dev server never
              // showed it. The tabindex therefore lives on the painted <circle>,
              // and `focus-ring-svg` adds a stroke change so the signal does not
              // rest on the outline alone. One tab stop still, since only one child
              // is focusable.
              <g key={`dot-${dot.id}`} style={{ cursor: 'pointer' }}
                onClick={() => onCompetitorClick?.(dot.id)}
              >
                <circle cx={dot.x} cy={dot.y} r={radius}
                  role="button"
                  tabIndex={0}
                  aria-label={`${dot.name} — open competitor detail`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCompetitorClick?.(dot.id);
                    }
                  }}
                  className="focus-ring-svg"
                  fill={isHovered ? colors.fill : dotFill}
                  stroke={isHovered ? dotColor : colors.stroke}
                  strokeWidth={isHovered ? 3 : 2}
                  // fillOpacity, not the element `opacity` this used to carry, for
                  // the same reason PipelineSankey moved off `opacity` — and here it
                  // was measurably breaking the ring this change exists to add.
                  // Element opacity fades everything the element paints, INCLUDING
                  // the focus outline: at 0.85 the ring composites to 2.67-2.81:1
                  // against the four quadrant washes it actually sits on, under the
                  // 3:1 in SC 1.4.11; at full strength it is 3.20-3.36:1. Measured
                  // in a WKWebView on the focused shape: element `opacity: .85`
                  // leaves 0 pixels of full-strength ring, `stroke-opacity: .85`
                  // also fades it (WebKit paints an SVG element's outline through
                  // the stroke pipeline), and `fill-opacity` alone leaves the ring
                  // pixel-identical to a shape with no opacity at all. The resting
                  // 2px data stroke is the one thing that changes — it now paints at
                  // full alpha, over quadrant colours that already carry 0.5-0.6.
                  fillOpacity={isHovered ? 1 : 0.85}
                  style={{ transition: 'all 0.3s' }}
                  onMouseMove={(e) => handleMouseMove(e, dot)}
                  onMouseLeave={handleMouseLeave}
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
            MARKET VOLUME &amp; FOOTHOLD (LOWER BOUND) →
          </text>

          <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1.5" />
          <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke={axisColor} strokeWidth="1.5" />
        </svg>

        {hoveredDot && (
          <div
            className="absolute z-50 pointer-events-none bg-slate-950 text-slate-100 rounded-lg border border-slate-700 px-3 py-2.5 text-micro shadow-xl font-mono leading-relaxed"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            <div className="font-bold text-xs text-cyan-400 mb-1">{hoveredDot.name}</div>
            <div className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Regulatory:</span>
                <span className="font-bold">{clarityEnacted ? hoveredDot.postClarityRegulatory : hoveredDot.preClarityRegulatory}/100</span>
              </div>
              {/* The score is built from LOWER BOUNDS ('$312B+' contributes
                  $312B, '$50,000-$100,000' contributes $50,000) and unreadable
                  dimensions are dropped from the denominator. It therefore reads
                  "at least", and competitiveScoring.ts says every surface
                  printing one must say so. */}
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Volume:</span>
                <span className="font-bold">at least {hoveredDot.marketVolume}/100</span>
              </div>
              {hoveredDot.unvaluedFigures.length > 0 && (
                <div className="text-[9px] text-amber-300/90 leading-snug max-w-[220px] whitespace-normal">
                  {hoveredDot.unvaluedFigures.length} of 4 volume figures unreadable:{' '}
                  {hoveredDot.unvaluedFigures.map(f => f.dimension).join(', ')}
                </div>
              )}
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-micro" data-testid="matrix-quadrant-counts">
        {(['leaders', 'regulatoryHedge', 'volumeRiders', 'outsiders'] as const).map(q => {
          const colors = QUADRANT_COLORS[q];
          const count = dots.filter(d => (clarityEnacted ? d.postClarityQuadrant : d.quadrant) === q).length;
          return (
            <div key={q} className="flex items-center gap-2 bg-card border border-line rounded px-2.5 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.stroke }} />
              <span className="text-grey-dark font-semibold">{QUADRANT_LABELS[q]}</span>
              <span className="ml-auto font-mono font-bold text-navy">{count}</span>
            </div>
          );
        })}
        {/* A fifth tile, because four quadrant counts that sum to 7 of 26
            competitors read as if the other 19 were nowhere. */}
        <div className="flex items-center gap-2 bg-card border border-dashed border-line rounded px-2.5 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full shrink-0 border border-grey" />
          <span className="text-grey-dark font-semibold">NOT MEASURED</span>
          <span className="ml-auto font-mono font-bold text-navy">{unmeasured.length}</span>
        </div>
      </div>

      {/* Absent data refuses; it is not a dot at the origin and it is not an
          omission. Every competitor with no readable volume figure is named
          here, with what was recorded in its place. */}
      {unmeasured.length > 0 && (
        <div
          className="bg-card border border-line rounded-lg p-3 space-y-1.5 text-micro"
          data-testid="matrix-unmeasured"
        >
          <div className="font-bold text-navy">
            {unmeasured.length} of {allScores.length} competitors are not plotted — market volume
            not measured
          </div>
          <p className="text-grey-dark leading-snug">
            None of the four volume dimensions (users, quarterly volume, assets on platform,
            revenue) held a figure that could be read without guessing, so these competitors have no
            position on the vertical axis. They are absent from the plot rather than placed at zero,
            and no quadrant verdict is assigned to them. The recorded values are shown below as
            written.
          </p>
          <ul className="divide-y divide-line">
            {unmeasured.map(s => (
              <li key={s.id} className="py-1 flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
                <span className="font-semibold text-navy">{s.name}</span>
                <span className="font-mono text-[9px] text-grey">
                  reg {clarityEnacted ? s.postClarityRegulatory : s.preClarityRegulatory}/100
                </span>
                <span className="font-mono text-[9px] text-grey-dark">
                  {s.unvaluedFigures
                    .map(f => `${f.dimension}: ${f.source.trim() === '' ? 'NOT RECORDED' : f.source}`)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
