import { useEffect, useMemo, useRef, useState } from 'react';
import { CHART_GOOD, CHART_GRID, seriesVar } from './palette';
import { useFlatBars, resolveColour } from './gl/FlatBars';
import { niceTicks, roundedTopRect, truncate } from './utils';
import { ChartTooltip, useTooltip } from './tooltip';

export interface CompareBarDatum {
  label: string;
  /** Conversion rate, 0..1. */
  rate: number;
  /** Sample size (assignments); powers the 95% CI whisker. n=0 → no whisker. */
  n: number;
  /** Optional numerator for the tooltip ("12/240"). */
  converted?: number;
  /** Marks the statistically significant winner (accent + tag). */
  winner?: boolean;
}

export interface CompareBarsProps {
  data: CompareBarDatum[];
  height?: number;
  /** Formats a 0..1 rate for labels/tooltips. */
  formatRate?: (v: number) => string;
}

const VW = 480;
const ML = 40;
const MR = 8;
const MT = 22; // value label + whisker headroom
const MB = 20;

const defaultFormat = (v: number) => `${(v * 100).toFixed(1)}%`;

/** 95% confidence interval, normal approximation, clamped to [0,1]. */
export function rateCI(rate: number, n: number): [number, number] {
  if (n <= 0) return [rate, rate];
  const half = 1.96 * Math.sqrt(Math.max(0, rate * (1 - rate)) / n);
  return [Math.max(0, rate - half), Math.min(1, rate + half)];
}

/**
 * Variant-comparison columns (A/B tests): one hue for the shared measure,
 * 95% CI whiskers from each variant's sample size, and a good-color accent
 * on the significant winner. Rates label every column — small samples make
 * wide whiskers visible instead of hiding uncertainty.
 */
/**
 * W2 · re-backed. The SVG below is UNCHANGED except that its column `<path>` renders only
 * when the GL layer is not drawing. Nothing that carries a number moved: the gridlines and
 * their tick labels, the rate labels, the variant labels, the hit targets, the tooltip and
 * — above all — THE 95% CI WHISKERS are still SVG, still drawn on top, and still exactly
 * what shipped. The whisker is the uncertainty; it is not a fill and it does not go on the
 * GPU, where a sub-pixel stroke would be the first thing bloom ate.
 */
export function CompareBars({ data, height = 190, formatRate = defaultFormat }: CompareBarsProps) {
  const { tip, show, hide } = useTooltip();
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* The colour tokens cannot resolve until the host is on the DOM — `var(--chart-1)` means
     nothing off-document, and it differs between light and dark. */
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);

  const VH = height;
  const plotW = VW - ML - MR;
  const plotH = VH - MT - MB;

  const cis = data.map((d) => rateCI(d.rate, d.n));
  const maxPct = Math.max(1, ...data.map((d, i) => Math.max(d.rate, cis[i][1]) * 100));
  const ticks = niceTicks(maxPct, 3);
  const top = ticks[ticks.length - 1];
  const y = (pct: number) => MT + plotH - (Math.max(0, pct) / top) * plotH;
  // Sub-percent grids need a decimal or adjacent ticks round to the same label.
  const fmtTick = (t: number) => (Number.isInteger(t) ? `${t}%` : `${t.toFixed(1)}%`);

  const band = plotW / data.length;
  const colW = Math.max(4, Math.min(24, band - 10));
  const maxLabelChars = Math.max(3, Math.floor(band / 6));

  /* ONE source of truth for the column rectangle. The SVG fallback path and the GL rect are
     two renderings of the SAME geometry, in the SAME viewBox units, so neither is allowed
     to recompute it independently — a formula copied into two places is a formula that
     drifts, and here a drift would put the fill somewhere the whisker is not. */
  const colX = (i: number) => ML + i * band + band / 2 - colW / 2;
  const colTopY = (rate: number) => y(rate * 100);

  const rects = useMemo(
    () => data
      .map((d, i) => ({
        x: colX(i),
        y: colTopY(d.rate),
        w: colW,
        h: MT + plotH - colTopY(d.rate),
        colour: hostRef.current
          ? resolveColour(d.winner ? CHART_GOOD : seriesVar(1), hostRef.current)
          // First frame only, before the host exists: the SVG is what the reader is seeing
          // at this point (`refused` is still true), and the resolved token replaces this
          // as soon as `ready` flips. The winner keeps its OWN placeholder (the literal
          // value of --chart-good, identical in both themes) — falling back to the series
          // hue would paint the accent that means "significant" in the colour that means
          // "not", for however long that first frame lasts.
          : (d.winner ? '#0ca30c' : '#2C6BFF'),
      }))
      .filter((r) => r.h > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, top, plotH, band, colW, ready],
  );

  const { canvas: glCanvas, refused: glRefused } = useFlatBars({
    rects, viewW: VW, viewH: VH, orientation: 'vertical',
  });

  /* AFTER the hooks, not before. This early return used to sit at the top of the component;
     with hooks below it, a variants list that arrives empty and then fills — which is
     exactly what `OutreachOps` does while an experiment loads — changes the hook count
     between renders and React throws. Returning null is still the behaviour. */
  if (data.length === 0) return null;

  return (
    <div className="relative w-full" ref={hostRef}>
      {/* THE CANVAS IS SIZED BY ITS POSITIONED PARENT, so that parent has to be the SVG's
          box and nothing else. This wrapper exists because the outer div also holds the
          whisker caption below the chart: with `absolute inset-0` measured against that
          taller box, the GL layer would be stretched ~12% vertically and every bar would
          end above its own whisker. The tooltip stays OUTSIDE this wrapper, so its
          percentage anchors still resolve against the same element they always did. */}
      <div className="relative w-full">
        {glCanvas}
        <svg viewBox={`0 0 ${VW} ${VH}`} className="relative z-10 block w-full" style={{ height: 'auto' }} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={VW - MR} y1={y(t)} y2={y(t)} stroke={CHART_GRID} strokeWidth={1} />
              <text x={ML - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-grey">
                {fmtTick(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = ML + i * band + band / 2;
            const xLeft = colX(i);
            const colTop = colTopY(d.rate);
            const h = MT + plotH - colTop;
            const [lo, hi] = cis[i];
            const fill = d.winner ? CHART_GOOD : seriesVar(1);
            return (
              <g key={i}>
                {/* THE FALLBACK: server render, print, no WebGL2, or first paint. */}
                {h > 0 && glRefused && <path d={roundedTopRect(xLeft, colTop, colW, h)} fill={fill} />}

                {/* 95% CI whisker (annotation → text token via currentColor) */}
                {d.n > 0 && hi > lo && (
                  <g className="text-navy" stroke="currentColor" strokeWidth={1.25}>
                    <line x1={cx} x2={cx} y1={y(hi * 100)} y2={y(lo * 100)} />
                    <line x1={cx - 4} x2={cx + 4} y1={y(hi * 100)} y2={y(hi * 100)} />
                    <line x1={cx - 4} x2={cx + 4} y1={y(lo * 100)} y2={y(lo * 100)} />
                  </g>
                )}

                {/* direct rate label above the whisker */}
                <text
                  x={cx}
                  y={Math.min(colTop, y(hi * 100)) - 5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="currentColor"
                  className="text-navy"
                >
                  {formatRate(d.rate)}
                  {d.winner ? ' ★' : ''}
                </text>

                <text x={cx} y={VH - 6} textAnchor="middle" fontSize={10} fill="currentColor" className="text-grey">
                  {truncate(d.label, maxLabelChars)}
                </text>

                {/* hit target = full column band */}
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
                      <span>
                        <span className="font-medium">{d.label}</span>
                        <span className="opacity-80"> · </span>
                        {formatRate(d.rate)}
                        {d.converted != null && ` (${d.converted}/${d.n})`}
                        {d.n > 0 && (
                          <>
                            <span className="opacity-80"> · </span>
                            95% CI {formatRate(lo)}–{formatRate(hi)}
                          </>
                        )}
                      </span>
                    )
                  }
                  onMouseLeave={hide}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <ChartTooltip tip={tip} />
      <p className="mt-1.5 text-[10px] text-grey">Whiskers: 95% confidence interval (normal approximation) from each variant's sample size. ★ significant winner.</p>
    </div>
  );
}
