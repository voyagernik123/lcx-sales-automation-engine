import { CHART_GRID, seriesVar } from './palette';
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
 * Control-band time chart: a shaded lo..hi envelope with a center line and an
 * optional overlaid "actual" series (drawn only where readings exist — gaps
 * are not interpolated). Hairline grid, tooltips per x, legend below.
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
  if (data.length === 0) return null;

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

  // Sparse x labels: first, last, and the middle when there is room.
  const xLabelIdx = n <= 2 ? data.map((_, i) => i) : n <= 6 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div className="w-full">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="block w-full" style={{ height: 'auto' }} role="img">
          {/* hairline gridlines + value ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={VW - MR} y1={y(t)} y2={y(t)} stroke={CHART_GRID} strokeWidth={1} />
              <text x={ML - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-grey">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {/* band envelope: one closed path per run; an isolated day is an error bar */}
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

          {/* center line: runs only, isolated readings render as dots */}
          {midRuns.map((run, ri) =>
            run.length > 1 ? (
              <polyline
                key={`m-${ri}`}
                points={run.map((i) => `${x(i)},${y(data[i].mid as number)}`).join(' ')}
                fill="none" stroke={seriesVar(1)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              />
            ) : (
              <circle key={`m-${ri}`} cx={x(run[0])} cy={y(data[run[0]].mid as number)} r={3.5} fill={seriesVar(1)} />
            )
          )}

          {/* actual overlay: runs only, isolated readings render as dots */}
          {actualRuns.map((run, ri) =>
            run.length > 1 ? (
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
