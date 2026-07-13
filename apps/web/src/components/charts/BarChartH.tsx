import { seriesVar } from './palette';
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
export function BarChartH({ data, formatValue = formatNumber, maxBars }: BarChartHProps) {
  const { tip, show, hide } = useTooltip();
  const rows = maxBars !== undefined ? data.slice(0, Math.max(0, maxBars)) : data;
  if (rows.length === 0) return null;

  const VH = rows.length * ROW_H;
  const plotW = VW - LABEL_W - VALUE_W;
  const max = Math.max(0, ...rows.map((d) => d.value));
  const w = (v: number) => (max > 0 ? (Math.max(0, v) / max) * plotW : 0);

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="block w-full" style={{ height: 'auto' }} role="img">
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
              {bw > 0 && (
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
