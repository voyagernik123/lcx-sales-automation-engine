import { useEffect, useMemo, useRef, useState } from 'react';
import { CHART_GRID, seriesVar } from './palette';
import { resolveColour } from './gl/FlatBars';
import { useFlatBand, type FlatBandStroke } from './gl/FlatBand';
import { formatNumber, niceTicks } from './utils';
import { ChartTooltip, useTooltip } from './tooltip';

export interface ControlBandPoint {
  /** X label (e.g. an ISO date). Points render in array order, evenly spaced. */
  x: string;
  /**
   * Lower edge of the band (e.g. P10). NULL = no reading for this x — the band BREAKS
   * here and is not interpolated across.
   *
   * These were `number` until a refusal was found rendering as a real $0 band. The
   * forecast snapshot job deliberately persists a day it could not price as null
   * percentiles beside a refusal code (`apps/api/src/kpi/snapshot.ts:88-97`, whose comment
   * says a zero "would draw a line down to it and back"), and the route then coerced that
   * null to 0 and this chart drew it. Nulls have to survive all the way to the renderer or
   * the refusal is only preserved in the database.
   */
  lo: number | null;
  /** Upper edge of the band (e.g. P90). Null = no reading; the band breaks. */
  hi: number | null;
  /** The center line (e.g. expected / P50). Null = no reading; the line breaks. */
  mid: number | null;
  /** Optional overlaid actual (e.g. landed revenue). null/undefined = no reading. */
  actual?: number | null;
}

/** Contiguous runs of readable points. A gap ends a run; it is never bridged. */
function runsOf<T>(data: readonly T[], read: (d: T) => boolean): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  data.forEach((d, i) => {
    if (read(d)) run.push(i);
    else if (run.length > 0) { runs.push(run); run = []; }
  });
  if (run.length > 0) runs.push(run);
  return runs;
}

type XY = readonly [number, number];

/**
 * The PAINTED intervals of an SVG dash pattern, measured along the path.
 *
 * `@lcx/gl` draws a continuous ribbon and has no dash, so the dash has to exist as
 * geometry or not at all — and it is not decoration here. The centre line and the actual
 * overlay are told apart by `solid vs dashed` as well as by hue, and this kit's own rule
 * (see the legend below) is that identity is never colour-alone. Dropping the dash to get
 * a lit line would trade an accessibility property for a finish, so the runs are split.
 *
 * `cap` is half the stroke width, added at BOTH ends of every dash, because the SVG's
 * `stroke-linecap="round"` extends each dash by exactly that much: `5 3` at width 2 paints
 * 7 and leaves 1, and reproducing the nominal 5/3 instead would visibly thin the series.
 * The first and last caps are clamped to the path rather than extrapolated past its ends —
 * a one-unit difference at two places, against inventing geometry beyond the data.
 */
function dashRuns(pts: readonly XY[], on: number, off: number, cap: number): Float32Array[] {
  if (pts.length < 2) return [];
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (!(total > 0)) return [];

  /** The point at arc length `s`, interpolated inside the segment that contains it. */
  const at = (s: number): XY => {
    const t = Math.min(total, Math.max(0, s));
    let i = 1;
    while (i < pts.length - 1 && cum[i] < t) i++;
    const seg = cum[i] - cum[i - 1];
    const u = seg > 0 ? (t - cum[i - 1]) / seg : 0;
    return [
      pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u,
    ];
  };

  const out: Float32Array[] = [];
  const period = on + off;
  for (let k = 0; k * period < total; k++) {
    const a = Math.max(0, k * period - cap);
    const b = Math.min(total, k * period + on + cap);
    if (b - a < 1e-6) continue;
    // Every ORIGINAL vertex strictly inside the dash is kept, so a dash that spans a corner
    // turns the corner instead of cutting it.
    const vs: XY[] = [at(a)];
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] > a + 1e-6 && cum[i] < b - 1e-6) vs.push(pts[i]);
    }
    vs.push(at(b));
    const f = new Float32Array(vs.length * 2);
    vs.forEach((p, i) => { f[i * 2] = p[0]; f[i * 2 + 1] = p[1]; });
    out.push(f);
  }
  return out;
}

export interface ControlBandProps {
  data: ControlBandPoint[];
  height?: number;
  formatValue?: (v: number) => string;
  formatX?: (x: string) => string;
  /** Legend names — keep these honest about what each series really is. */
  bandLabel?: string;
  midLabel?: string;
  actualLabel?: string;
}

const VW = 480;
const ML = 46;
const MR = 8;
const MT = 10;
const MB = 18;

/**
 * `halfWidth` is 1.3, not 1, for a 2-unit stroke. `createStrokeBatch` feathers a polyline
 * across its WHOLE width and the additive pass squares that coverage, so a ribbon built at
 * exactly half the SVG's stroke-width renders visibly thinner than the line it replaces.
 * 1.3 puts the solid core back at ~2 units and spends the rest on the falloff.
 */
const HALF = 1.3;

/**
 * Control-band time chart: a shaded lo..hi envelope with a center line and an
 * optional overlaid "actual" series (drawn only where readings exist — gaps
 * are not interpolated). Hairline grid, tooltips per x, legend below.
 */
/**
 * W2 · re-backed, PARTIALLY and on purpose. Every coordinate, tick, label and null below is
 * the one that shipped — W0 found this primitive correct. What changed: the centre line and
 * the actual overlay render through `@lcx/gl` when a context exists, and the SVG's own
 * `<polyline>`s draw whenever it does not.
 *
 * ── THE ENVELOPE STAYS SVG, ON BOTH PATHS ───────────────────────────────────────────
 * It is not gated and it is not drawn in GL, for two independent reasons:
 *
 *  1. `createStrokeBatch.area` takes a single scalar `baselineY`. Its lower edge is a
 *     horizontal line, and this band's lower edge is the `lo` SERIES. Rendering it there
 *     would flatten a moving P10 to a constant — a change to a number, which this pass is
 *     not allowed to make, in the one chart whose whole subject is that a number can be
 *     absent.
 *  2. The additive pass writes full coverage into the frame's alpha, so a 14 % wash is not
 *     something it can express: on a light card the tint would land as a solid block of
 *     hue. `Sparkline` declined its own 10 % wash for exactly this.
 *
 * The consequence is deliberate and worth naming: with the GL layer live the envelope is
 * SVG ABOVE the canvas, so it tints the two lines by 14 % of `--chart-1` where they run
 * inside it. On the centre line that is 14 % of its own hue and invisible; on the actual it
 * is a slight shift toward the band's hue. Both series are treated identically, so nothing
 * about their relative weight moves — which is the property this chart is read for.
 *
 * ── AND THE MARKS THAT CANNOT BE RIBBONS ────────────────────────────────────────────
 * An isolated reading is a DOT and a single-day band is an ERROR BAR. A polyline batch has
 * neither, and both are exactly the marks that say "one day, no neighbours" — so they stay
 * SVG too, ungated, rather than disappearing when the renderer succeeds.
 */
export function ControlBand({
  data,
  height = 190,
  formatValue = formatNumber,
  formatX = (x) => x,
  bandLabel = 'Band',
  midLabel = 'Expected',
  actualLabel = 'Actual',
}: ControlBandProps) {
  const { tip, show, hide } = useTooltip();
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* The colour token cannot resolve until the host is on the DOM — `var(--chart-1)` means
     nothing off-document, and it differs between light and dark. */
  const [ready, setReady] = useState(false);
  useEffect(() => { if (hostRef.current) setReady(true); }, []);

  /* EVERY HOOK RUNS BEFORE THE EMPTY-DATA RETURN AT THE BOTTOM. Computing the geometry of an
     empty series is harmless (every map produces an empty array); returning early from the
     middle of the hook list is not, because a series that goes from empty to populated would
     then change the number of hooks between renders. */
  const VH = height;
  const plotW = VW - ML - MR;
  const plotH = VH - MT - MB;

  // Nulls are excluded from the domain: a day with no reading must not pull the axis.
  const readings = data.flatMap((d) => [d.hi, d.mid, d.actual].filter((v): v is number => v != null));
  const maxVal = Math.max(1e-9, ...readings);
  const ticks = niceTicks(maxVal, 3);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => MT + plotH - (Math.max(0, v) / top) * plotH;
  const n = data.length;
  const x = (i: number) => (n === 1 ? ML + plotW / 2 : ML + (i / (n - 1)) * plotW);

  const hasActual = data.some((d) => d.actual != null);

  /* Every series renders as contiguous RUNS and gaps stay gaps. `actual` always worked
     this way; the band and the centre line did not, which is how a refused day became a
     line drawn down to $0 and back. The x positions are unchanged either side of a gap,
     so a missing day leaves a visible hole rather than silently compressing the axis —
     dropping the point entirely would be a second, quieter lie. */
  const bandRuns = runsOf(data, (d) => d.lo != null && d.hi != null);
  const midRuns = runsOf(data, (d) => d.mid != null);
  const actualRuns = runsOf(data, (d) => d.actual != null);

  const bandPathFor = (run: number[]) =>
    `M${run.map((i) => `${x(i)},${y(data[i].hi as number)}`).join(' L')} L${[...run]
      .reverse()
      .map((i) => `${x(i)},${y(data[i].lo as number)}`)
      .join(' L')} Z`;

  /* THE GL GEOMETRY IS BUILT FROM THE SAME RUNS THE SVG DRAWS, in the SVG's own viewBox
     units, so the two layers cannot drift and a gap cannot close in one of them.
     MEMOISED ON THE VALUES, not on the array identity: callers build `data` inline from an
     API response, so a fresh array arrives every render and an identity-keyed memo would
     repaint the GL layer on every render of the page around it. */
  const dataKey = data.map((d) => `${d.x}|${d.lo}|${d.hi}|${d.mid}|${d.actual ?? ''}`).join(';');
  const glStrokes = useMemo<FlatBandStroke[]>(() => {
    const el = hostRef.current;
    if (!el) return [];
    const out: FlatBandStroke[] = [];
    const mid = resolveColour(seriesVar(1), el);
    const actual = resolveColour(seriesVar(2), el);
    const pointsOf = (run: number[], read: (d: ControlBandPoint) => number): XY[] =>
      run.map((i) => [x(i), y(read(data[i]))] as XY);

    for (const run of midRuns) {
      // A run of ONE is a dot in the SVG and stays one; see the header.
      if (run.length < 2) continue;
      const pts = pointsOf(run, (d) => d.mid as number);
      const f = new Float32Array(pts.length * 2);
      pts.forEach((p, i) => { f[i * 2] = p[0]; f[i * 2 + 1] = p[1]; });
      out.push({ points: f, colour: mid, halfWidth: HALF });
    }
    for (const run of actualRuns) {
      if (run.length < 2) continue;
      // 5 on, 3 off, 1 of cap at each end — the SVG's `strokeDasharray="5 3"` at width 2.
      for (const dash of dashRuns(pointsOf(run, (d) => d.actual as number), 5, 3, 1)) {
        out.push({ points: dash, colour: actual, halfWidth: HALF });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, height, top, n, ready]);

  const { canvas: glCanvas, refused: glRefused } = useFlatBand({
    strokes: glStrokes, viewW: VW, viewH: VH,
  });

  if (data.length === 0) return null;

  // Sparse x labels: first, last, and the middle when there is room.
  const xLabelIdx = n <= 2 ? data.map((_, i) => i) : n <= 6 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div className="w-full">
      <div className="relative w-full" ref={hostRef}>
        {glCanvas}
        <svg viewBox={`0 0 ${VW} ${VH}`} className="relative z-10 block w-full" style={{ height: 'auto' }} role="img">
          {/* hairline gridlines + value ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={VW - MR} y1={y(t)} y2={y(t)} stroke={CHART_GRID} strokeWidth={1} />
              <text x={ML - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-grey">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {/* band envelope: one closed path per run; an isolated day is an error bar.
              NOT GATED, ON PURPOSE — see the header. The GL layer cannot draw a region
              between two moving edges, and cannot draw a 14 % wash at all. */}
          {bandRuns.map((run, ri) =>
            run.length > 1 ? (
              <path key={`b-${ri}`} d={bandPathFor(run)} fill={seriesVar(1)} fillOpacity={0.14} stroke={seriesVar(1)} strokeOpacity={0.3} strokeWidth={1} />
            ) : (
              <line
                key={`b-${ri}`}
                x1={x(run[0])} x2={x(run[0])}
                y1={y(data[run[0]].lo as number)} y2={y(data[run[0]].hi as number)}
                stroke={seriesVar(1)} strokeOpacity={0.4} strokeWidth={4} strokeLinecap="round"
              />
            )
          )}

          {/* center line: runs only, isolated readings render as dots.
              THE FALLBACK: server render, print, no WebGL2, or first paint. The dot is a
              mark the ribbon batch has no shape for, so it is never gated. */}
          {midRuns.map((run, ri) =>
            run.length > 1 ? (
              glRefused && (
                <polyline
                  key={`m-${ri}`}
                  points={run.map((i) => `${x(i)},${y(data[i].mid as number)}`).join(' ')}
                  fill="none" stroke={seriesVar(1)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                />
              )
            ) : (
              <circle key={`m-${ri}`} cx={x(run[0])} cy={y(data[run[0]].mid as number)} r={3.5} fill={seriesVar(1)} />
            )
          )}

          {/* actual overlay: runs only, isolated readings render as dots */}
          {actualRuns.map((run, ri) =>
            run.length > 1 ? (
              glRefused && (
                <polyline
                  key={`a-${ri}`}
                  points={run.map((i) => `${x(i)},${y(data[i].actual as number)}`).join(' ')}
                  fill="none"
                  stroke={seriesVar(2)}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )
            ) : (
              <circle key={`a-${ri}`} cx={x(run[0])} cy={y(data[run[0]].actual as number)} r={3} fill={seriesVar(2)} />
            )
          )}

          {/* x edge labels */}
          {xLabelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={VH - 4}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize={10}
              fill="currentColor"
              className="text-grey"
            >
              {formatX(data[i].x)}
            </text>
          ))}

          {/* hit bands per x index */}
          {data.map((d, i) => {
            const bw = n === 1 ? plotW : plotW / (n - 1);
            const bx = Math.max(ML, x(i) - bw / 2);
            return (
              <rect
                key={`hit-${i}`}
                x={bx}
                y={MT}
                width={Math.min(bw, VW - MR - bx)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() =>
                  show(
                    (x(i) / VW) * 100,
                    (y(d.hi ?? d.mid ?? 0) / VH) * 100,
                    <span>
                      <span className="font-medium">{formatX(d.x)}</span>
                      {/* A day with no reading says so. Printing "$0" here would restate
                          the defect this file was changed to fix, one layer down. */}
                      {d.mid == null && d.lo == null && d.hi == null ? (
                        <>
                          <span className="opacity-80"> · </span>
                          no reading
                        </>
                      ) : (
                        <>
                          {d.mid != null && (
                            <>
                              <span className="opacity-80"> · </span>
                              {midLabel} {formatValue(d.mid)}
                            </>
                          )}
                          {d.lo != null && d.hi != null && (
                            <>
                              <span className="opacity-80"> · </span>
                              {bandLabel} {formatValue(d.lo)}–{formatValue(d.hi)}
                            </>
                          )}
                        </>
                      )}
                      {d.actual != null && (
                        <>
                          <span className="opacity-80"> · </span>
                          {actualLabel} {formatValue(d.actual)}
                        </>
                      )}
                    </span>
                  )
                }
                onMouseLeave={hide}
              />
            );
          })}
        </svg>
        <ChartTooltip tip={tip} />
      </div>

      {/* legend — identity is never color-alone */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seriesVar(1), opacity: 0.25 }} aria-hidden="true" />
          <span className="text-grey">{bandLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="h-0.5 w-3.5 shrink-0 rounded-full" style={{ background: seriesVar(1) }} aria-hidden="true" />
          <span className="text-grey">{midLabel}</span>
        </span>
        {hasActual && (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-0.5 w-3.5 shrink-0 rounded-full" style={{ background: seriesVar(2) }} aria-hidden="true" />
            <span className="text-grey">{actualLabel}</span>
          </span>
        )}
      </div>
    </div>
  );
}
