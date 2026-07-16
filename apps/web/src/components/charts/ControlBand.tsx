import { CHART_GRID, seriesVar } from './palette';
import { formatNumber, niceTicks } from './utils';
import { ChartTooltip, useTooltip } from './tooltip';

export interface ControlBandPoint {
  /** X label (e.g. an ISO date). Points render in array order, evenly spaced. */
  x: string;
  /** Lower edge of the band (e.g. P10). */
  lo: number;
  /** Upper edge of the band (e.g. P90). */
  hi: number;
  /** The center line (e.g. expected / P50). */
  mid: number;
  /** Optional overlaid actual (e.g. landed revenue). null/undefined = no reading. */
  actual?: number | null;
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

  const maxVal = Math.max(1e-9, ...data.flatMap((d) => [d.hi, d.mid, d.actual ?? 0]));
  const ticks = niceTicks(maxVal, 3);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => MT + plotH - (Math.max(0, v) / top) * plotH;
  const n = data.length;
  const x = (i: number) => (n === 1 ? ML + plotW / 2 : ML + (i / (n - 1)) * plotW);

  const hasActual = data.some((d) => d.actual != null);

  // Actual series renders as contiguous runs; gaps (null readings) stay gaps.
  const actualRuns: { i: number; v: number }[][] = [];
  {
    let run: { i: number; v: number }[] = [];
    data.forEach((d, i) => {
      if (d.actual != null) {
        run.push({ i, v: d.actual });
      } else if (run.length > 0) {
        actualRuns.push(run);
        run = [];
      }
    });
    if (run.length > 0) actualRuns.push(run);
  }

  const bandPath =
    n > 1
      ? `M${data.map((d, i) => `${x(i)},${y(d.hi)}`).join(' L')} L${[...data]
          .reverse()
          .map((d, ri) => `${x(n - 1 - ri)},${y(d.lo)}`)
          .join(' L')} Z`
      : null;

  const midPoints = data.map((d, i) => `${x(i)},${y(d.mid)}`).join(' ');

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

          {/* band envelope */}
          {bandPath ? (
            <path d={bandPath} fill={seriesVar(1)} fillOpacity={0.14} stroke={seriesVar(1)} strokeOpacity={0.3} strokeWidth={1} />
          ) : (
            /* single point: vertical lo..hi error bar */
            <line x1={x(0)} x2={x(0)} y1={y(data[0].lo)} y2={y(data[0].hi)} stroke={seriesVar(1)} strokeOpacity={0.4} strokeWidth={4} strokeLinecap="round" />
          )}

          {/* center line */}
          {n > 1 ? (
            <polyline points={midPoints} fill="none" stroke={seriesVar(1)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : (
            <circle cx={x(0)} cy={y(data[0].mid)} r={3.5} fill={seriesVar(1)} />
          )}

          {/* actual overlay: runs only, isolated readings render as dots */}
          {actualRuns.map((run, ri) =>
            run.length > 1 ? (
              <polyline
                key={ri}
                points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
                fill="none"
                stroke={seriesVar(2)}
                strokeWidth={2}
                strokeDasharray="5 3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <circle key={ri} cx={x(run[0].i)} cy={y(run[0].v)} r={3} fill={seriesVar(2)} />
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
                    (y(d.hi) / VH) * 100,
                    <span>
                      <span className="font-medium">{formatX(d.x)}</span>
                      <span className="opacity-80"> · </span>
                      {midLabel} {formatValue(d.mid)}
                      <span className="opacity-80"> · </span>
                      {bandLabel} {formatValue(d.lo)}–{formatValue(d.hi)}
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
