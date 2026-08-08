import { useEffect, useMemo, useRef, useState } from 'react';
import { seriesVar, CHART_GRID } from './palette';
import { useFlatBars, resolveColour } from './gl/FlatBars';
import { formatNumber, niceTicks, roundedTopRect, truncate } from './utils';
import { ChartTooltip, TipContent, useTooltip } from './tooltip';

export interface ColumnDatum {
  label: string;
  value: number;
  /** Per-column override; default is series slot 1 for every column (one series → one color). */
  color?: string;
}

export interface ColumnChartProps {
  data: ColumnDatum[];
  height?: number;
  formatValue?: (v: number) => string;
  /** Direct value labels: 'max' (default) labels only the tallest column. */
  showValues?: 'all' | 'max' | 'none';
}

const VW = 480; // internal coordinate width; SVG scales to 100% of container
const ML = 40;
const MR = 8;
const MT = 16; // room for value labels above the tallest cap
const MB = 20; // x-axis label band (inside the height, never clipped)

/** Vertical columns: ≤24px thick, 4px rounded caps, hairline grid, one axis. */
/**
 * W2 · re-backed. The SVG below is UNCHANGED except that its column `<path>` renders only
 * when the GL layer is not drawing. Gridlines, y ticks, value labels, x labels, hit targets
 * and the tooltip are all still SVG and still exactly what shipped — W0 found this primitive
 * correct, and only its flat fill was wrong with it. No number, tick or label moved.
 */
export function ColumnChart({
  data,
  height = 180,
  formatValue = formatNumber,
  showValues = 'max',
}: ColumnChartProps) {
  const { tip, show, hide } = useTooltip();
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* The colour token cannot resolve until the host is on the DOM — `var(--chart-1)` means
     nothing off-document, and it differs between light and dark. */
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);

  const VH = height;
  const plotW = VW - ML - MR;
  const plotH = VH - MT - MB;
  const maxValue = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(maxValue);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => MT + plotH - (Math.max(0, v) / top) * plotH;

  const band = plotW / data.length;
  // 2px gap between touching columns; cap thickness at 24px.
  const colW = Math.max(2, Math.min(24, band - 2));
  const maxIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const maxLabelChars = Math.max(3, Math.floor(band / 6));

  /* Column rectangles in the SVG's own viewBox units, so the two layers cannot drift.
     MEMOISED: a fresh array each render made `draw` a new function each render, which
     re-ran the paint effect on every render. */
  const rects = useMemo(
    () => data
      .map((d, i) => {
        const colTop = y(d.value);
        return {
          x: ML + i * band + band / 2 - colW / 2,
          y: colTop,
          w: colW,
          h: MT + plotH - colTop,
          colour: hostRef.current ? resolveColour(d.color ?? seriesVar(1), hostRef.current) : '#2C6BFF',
        };
      })
      .filter((r) => r.h > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, top, band, colW, plotH, ready],
  );

  /* Vertical: the entrance grows each column UP FROM THE BASELINE, which is the only motion
     that carries the data — the column arrives at its value rather than fading in at it. */
  const { canvas: glCanvas, refused: glRefused } = useFlatBars({
    rects, viewW: VW, viewH: VH, orientation: 'vertical',
  });

  /* AFTER every hook, deliberately: an empty→populated data prop must not change the hook
     count between renders. */
  if (data.length === 0) return null;

  return (
    <div className="relative w-full" ref={hostRef}>
      {glCanvas}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="relative z-10 block w-full"
        style={{ height: 'auto' }}
        role="img"
      >
        {/* hairline horizontal gridlines + clean y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={VW - MR} y1={y(t)} y2={y(t)} stroke={CHART_GRID} strokeWidth={1} />
            <text
              x={ML - 6}
              y={y(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              className="text-grey"
            >
              {formatNumber(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = ML + i * band + band / 2;
          const x = cx - colW / 2;
          const colTop = y(d.value);
          const h = MT + plotH - colTop;
          const labeled =
            showValues === 'all' || (showValues === 'max' && i === maxIndex && d.value > 0);
          return (
            <g key={i}>
              {/* THE FALLBACK: server render, print, no WebGL2, or first paint. */}
              {h > 0 && glRefused && (
                <path d={roundedTopRect(x, colTop, colW, h)} fill={d.color ?? seriesVar(1)} />
              )}
              {labeled && (
                <text
                  x={cx}
                  y={colTop - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={500}
                  fill="currentColor"
                  className="text-navy"
                >
                  {formatValue(d.value)}
                </text>
              )}
              <text
                x={cx}
                y={VH - 6}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
                className="text-grey"
              >
                {truncate(d.label, maxLabelChars)}
              </text>
              {/* hit target = full column band, larger than the mark */}
              <rect
                x={ML + i * band}
                y={MT}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() =>
                  show(
                    (cx / VW) * 100,
                    (colTop / VH) * 100,
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
