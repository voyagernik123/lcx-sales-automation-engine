import { seriesVar, CHART_GRID } from '@/components/charts';
import { formatNumber, niceTicks, roundedTopRect, truncate } from '@/components/charts/utils';
import { ChartTooltip, TipContent, useTooltip } from '@/components/charts/tooltip';

export interface GroupedColumnDatum {
  label: string;
  /** One value per series, in series order. */
  values: number[];
}

export interface GroupedColumnChartProps {
  data: GroupedColumnDatum[];
  /** Series names in fixed order — series i renders in chart slot i+1. */
  series: string[];
  height?: number;
  formatValue?: (v: number) => string;
}

const VW = 480;
const ML = 40;
const MR = 8;
const MT = 16;
const MB = 20;
const INNER_GAP = 2; // gap between columns inside a group

/**
 * Grouped vertical columns (2+ series side by side per category) following the
 * chart-kit conventions: hairline grid, one axis, ≤24px columns, legend below.
 */
export function GroupedColumnChart({ data, series, height = 180, formatValue = formatNumber }: GroupedColumnChartProps) {
  const { tip, show, hide } = useTooltip();
  if (data.length === 0 || series.length === 0) return null;

  const VH = height;
  const plotW = VW - ML - MR;
  const plotH = VH - MT - MB;
  const maxValue = Math.max(0, ...data.flatMap((d) => d.values.map((v) => Math.max(0, v))));
  const ticks = niceTicks(maxValue);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => MT + plotH - (Math.max(0, v) / top) * plotH;

  const band = plotW / data.length;
  const groupW = Math.max(series.length * 3, band - 10);
  const colW = Math.max(2, Math.min(18, (groupW - INNER_GAP * (series.length - 1)) / series.length));
  const usedW = colW * series.length + INNER_GAP * (series.length - 1);
  const maxLabelChars = Math.max(3, Math.floor(band / 6));

  return (
    <div className="w-full">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="block w-full" style={{ height: 'auto' }} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={VW - MR} y1={y(t)} y2={y(t)} stroke={CHART_GRID} strokeWidth={1} />
              <text x={ML - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" className="text-grey">
                {formatNumber(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const bandX = ML + i * band;
            const cx = bandX + band / 2;
            const startX = cx - usedW / 2;
            return (
              <g key={i}>
                {series.map((s, j) => {
                  const v = Math.max(0, d.values[j] ?? 0);
                  const colX = startX + j * (colW + INNER_GAP);
                  const colTop = y(v);
                  const h = MT + plotH - colTop;
                  return (
                    <g key={j}>
                      {h > 0 && <path d={roundedTopRect(colX, colTop, colW, h, 3)} fill={seriesVar(j + 1)} />}
                      {/* hit target = the column's slice of the band, full plot height */}
                      <rect
                        x={colX - INNER_GAP / 2}
                        y={MT}
                        width={colW + INNER_GAP}
                        height={plotH}
                        fill="transparent"
                        onMouseEnter={() =>
                          show(
                            ((colX + colW / 2) / VW) * 100,
                            (colTop / VH) * 100,
                            <TipContent label={`${d.label} — ${s}`} value={formatValue(v)} />
                          )
                        }
                        onMouseLeave={hide}
                      />
                    </g>
                  );
                })}
                <text x={cx} y={VH - 6} textAnchor="middle" fontSize={10} fill="currentColor" className="text-grey">
                  {truncate(d.label, maxLabelChars)}
                </text>
              </g>
            );
          })}
        </svg>
        <ChartTooltip tip={tip} />
      </div>

      {/* legend: always present for ≥2 series; text in text tokens */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, j) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seriesVar(j + 1) }} aria-hidden="true" />
            <span className="text-grey">{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
