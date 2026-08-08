import { useEffect, useMemo, useRef, useState } from 'react';
import { CHART_BAD, CHART_GOOD, CHART_TRACK } from './palette';
import { resolveColour } from './gl/FlatBars';
import { useFlatDial } from './gl/FlatDial';

export interface GaugeThresholds {
  /** Value at or above which the fill is --chart-good. */
  good: number;
  /** Value at or above which the fill is amber (below `good`). */
  warn: number;
}

export interface GaugeChartProps {
  /** 0..100 */
  value: number;
  label?: string;
  /** Optional 0..100 target marker on the arc. */
  target?: number;
  thresholds?: GaugeThresholds;
}

const VW = 160;
const VH = 96;
const CX = 80;
const CY = 82;
const R = 62;
const THICKNESS = 13;

/* The band the stroke actually covers. The SVG strokes the centreline radius R, so the band
   runs half a thickness either side of it — the GL layer draws the same band as geometry. */
const R_INNER = R - THICKNESS / 2;
const R_OUTER = R + THICKNESS / 2;

/**
 * `strokeLinecap="round"` extends each end of the SVG stroke by half the band thickness
 * along the arc, so the shipped gauge's ends already sit CAP radians beyond their angle.
 * The GL layer reproduces that rather than ending flat on the true angle: if it did not,
 * the fill would stop ~3 points of the scale short of where the SVG puts it, and a reader
 * on a machine without WebGL2 would see a measurably different gauge than one with it.
 * The fallback and the GL frame have to read the same value; that is the whole contract.
 */
const CAP = THICKNESS / 2 / R;

/** Angle for a 0..100 value: π (left) → 0 (right), drawn over the top. */
function point(v: number, r: number): [number, number] {
  const t = Math.PI * (1 - v / 100);
  return [CX + r * Math.cos(t), CY - r * Math.sin(t)];
}

function arcPath(from: number, to: number, r: number): string {
  const [x0, y0] = point(from, r);
  const [x1, y1] = point(to, r);
  return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
}

/**
 * The same angle in `@lcx/gl`'s dial convention: radians, 0 = 12 o'clock, increasing
 * clockwise. Derived from `point` above, not invented alongside it — v = 0 is 9 o'clock
 * (−π/2), v = 50 is 12 o'clock (0), v = 100 is 3 o'clock (+π/2).
 */
function dialAngle(v: number): number {
  return Math.PI * (v / 100 - 0.5);
}

const A0 = dialAngle(0) - CAP;
const A1 = dialAngle(100) + CAP;

/** Semicircle meter 0..100 — fill color carries state via thresholds. */
/**
 * W2 · re-backed. The SVG below is UNCHANGED except that its two arc `<path>` marks render
 * only when the GL layer is not drawing. The target tick, the big centre number and the
 * label are still SVG and still exactly what shipped — W0 found this primitive correct, and
 * only its flat fill was wrong with it. In particular the tick stays vector: it is a
 * hairline against a band, and it is the one mark a reader compares the fill to.
 */
export function GaugeChart({
  value,
  label,
  target,
  thresholds = { good: 70, warn: 40 },
}: GaugeChartProps) {
  const v = Math.max(0, Math.min(100, value));
  // Fill by state: good / amber (chart slot 3 doubles as the amber var) / bad.
  const fill = v >= thresholds.good ? CHART_GOOD : v >= thresholds.warn ? 'var(--chart-3)' : CHART_BAD;

  const hostRef = useRef<HTMLDivElement | null>(null);
  /* The colour tokens cannot resolve until the host is on the DOM — `var(--chart-good)`
     means nothing off-document, and it differs between light and dark. Until then both
     resolve to '' , the GL layer refuses, and the SVG draws. */
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);

  const trackColour = useMemo(
    () => (hostRef.current ? resolveColour(CHART_TRACK, hostRef.current) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready],
  );
  const valueColour = useMemo(
    () => (hostRef.current ? resolveColour(fill, hostRef.current) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fill, ready],
  );

  // v = 0 fills nothing, exactly as the SVG below draws no value path at 0.
  const aValue = v > 0 ? Math.min(dialAngle(v) + CAP, A1) : A0;

  const { canvas: glCanvas, refused: glRefused } = useFlatDial({
    cx: CX, cy: CY, rInner: R_INNER, rOuter: R_OUTER,
    a0: A0, a1: A1, aValue,
    trackColour, valueColour,
    viewW: VW, viewH: VH,
  });

  return (
    <div className="relative w-full" ref={hostRef}>
      {glCanvas}
      <svg viewBox={`0 0 ${VW} ${VH}`} className="relative z-10 block w-full" style={{ height: 'auto' }} role="img">
        {/* THE FALLBACK: server render, print, no WebGL2, or first paint. */}
        {glRefused && (
          <>
            {/* unfilled track */}
            <path
              d={arcPath(0, 100, R)}
              fill="none"
              stroke={CHART_TRACK}
              strokeWidth={THICKNESS}
              strokeLinecap="round"
            />
            {v > 0 && (
              <path
                d={arcPath(0, v, R)}
                fill="none"
                stroke={fill}
                strokeWidth={THICKNESS}
                strokeLinecap="round"
              />
            )}
          </>
        )}
        {target !== undefined && target >= 0 && target <= 100 && (
          <line
            x1={point(target, R - THICKNESS / 2 - 3)[0]}
            y1={point(target, R - THICKNESS / 2 - 3)[1]}
            x2={point(target, R + THICKNESS / 2 + 3)[0]}
            y2={point(target, R + THICKNESS / 2 + 3)[1]}
            stroke="currentColor"
            strokeWidth={2}
            className="text-grey"
          />
        )}
        {/* big center value in the primary text token, never the fill color */}
        <text
          x={CX}
          y={CY - 8}
          textAnchor="middle"
          fontSize={26}
          fontWeight={600}
          fill="currentColor"
          className="text-navy"
        >
          {Math.round(v)}
        </text>
        {label && (
          <text
            x={CX}
            y={CY + 8}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            className="text-grey"
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}
