import { useEffect, useMemo, useRef, useState } from 'react';
import { seriesVar } from './palette';
import { useFlatBars, resolveColour } from './gl/FlatBars';
import { formatNumber, roundedRightRect, truncate } from './utils';
import { ChartTooltip, TipContent, useTooltip } from './tooltip';

export interface BarDatum {
  label: string;
  value: number;
  /** Per-bar override; default is series slot 1 for every bar (one series → one color). */
  color?: string;
}

export interface BarChartHProps {
  data: BarDatum[];
  formatValue?: (v: number) => string;
  /** Show at most this many bars (top of the list). */
  maxBars?: number;
}

const VW = 480;
const LABEL_W = 110;
const VALUE_W = 52;
const ROW_H = 26;
const BAR_H = 18; // ≤24px thick

/** Horizontal bars: 4px rounded data-end, value at the bar tip in a text token. */
/**
 * W2 · re-backed. The SVG below is UNCHANGED except that its bar `<path>` renders only when
 * the GL layer is not drawing. Every label, value, hit target and tooltip is still SVG and
 * still exactly what shipped — W0 found this primitive correct, and only its flat fill was
 * wrong with it.
 */
export function BarChartH({ data, formatValue = formatNumber, maxBars }: BarChartHProps) {
  const { tip, show, hide } = useTooltip();
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* The colour token cannot resolve until the host is on the DOM — `var(--chart-1)` means
     nothing off-document, and it differs between light and dark. */
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);
  const rows = maxBars !== undefined ? data.slice(0, Math.max(0, maxBars)) : data;
  if (rows.length === 0) return null;

  const VH = rows.length * ROW_H;
  const plotW = VW - LABEL_W - VALUE_W;
  const max = Math.max(0, ...rows.map((d) => d.value));
  const w = (v: number) => (max > 0 ? (Math.max(0, v) / max) * plotW : 0);

  /* Bar rectangles in the SVG's own viewBox units, so the two layers cannot drift.
     MEMOISED: a fresh array each render made `draw` a new function each render, which
     re-ran the paint effect on every render. */
  const rects = useMemo(
    () => rows
      .map((d, i) => ({
        x: LABEL_W,
        y: i * ROW_H + (ROW_H - BAR_H) / 2,
        w: w(d.value),
        h: BAR_H,
        colour: hostRef.current ? resolveColour(d.color ?? seriesVar(1), hostRef.current) : '#2C6BFF',
      }))
      .filter((r) => r.w > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, max, ready],
  );

  const { canvas: glCanvas, refused: glRefused } = useFlatBars({
    rects, viewW: VW, viewH: VH, orientation: 'horizontal',
  });

  return (
    <div className="relative w-full" ref={hostRef}>
      {glCanvas}
      <svg viewBox={`0 0 ${VW} ${VH}`} className="relative z-10 block w-full" style={{ height: 'auto' }} role="img">
        {rows.map((d, i) => {
          const yTop = i * ROW_H + (ROW_H - BAR_H) / 2;
          const cy = i * ROW_H + ROW_H / 2;
          const bw = w(d.value);
          return (
            <g key={i}>
              <text
                x={LABEL_W - 8}
                y={cy + 3.5}
                textAnchor="end"
                fontSize={11}
                fill="currentColor"
                className="text-grey"
              >
                {truncate(d.label, 18)}
              </text>
              {/* THE FALLBACK: server render, print, no WebGL2, or first paint. */}
              {bw > 0 && glRefused && (
                <path d={roundedRightRect(LABEL_W, yTop, bw, BAR_H)} fill={d.color ?? seriesVar(1)} />
              )}
              <text
                x={LABEL_W + bw + 6}
                y={cy + 3.5}
                textAnchor="start"
                fontSize={11}
                fontWeight={500}
                fill="currentColor"
                className="text-navy"
              >
                {formatValue(d.value)}
              </text>
              {/* hit target = full row, larger than the mark */}
              <rect
                x={0}
                y={i * ROW_H}
                width={VW}
                height={ROW_H}
                fill="transparent"
                onMouseEnter={() =>
                  show(
                    ((LABEL_W + bw) / VW) * 100,
                    (yTop / VH) * 100,
                    <TipContent label={d.label} value={formatValue(d.value)} />
                  )
                }
                onMouseLeave={hide}
              />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );
}
