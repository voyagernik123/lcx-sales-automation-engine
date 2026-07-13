import { useState } from 'react';
import { formatNumber } from './utils';
import { TipContent } from './tooltip';

export interface FunnelStage {
  label: string;
  value: number;
}

export interface FunnelChartProps {
  stages: FunnelStage[];
  formatValue?: (v: number) => string;
}

/** Ordinal ramp: --chart-1 at decreasing opacity, floored at 0.4. */
function stageOpacity(i: number): number {
  const steps = [1, 0.85, 0.7, 0.55, 0.4];
  return steps[Math.min(i, steps.length - 1)];
}

/**
 * Vertical funnel: horizontal bars scaled so the first stage = 100%, ordinal
 * blue ramp, conversion % between stages, value labels at bar tips.
 */
export function FunnelChart({ stages, formatValue = formatNumber }: FunnelChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (stages.length === 0) return null;

  const first = Math.max(1e-9, stages[0].value);

  return (
    <div className="w-full">
      {stages.map((s, i) => {
        const pct = Math.max(0, Math.min(100, (s.value / first) * 100));
        const conversion =
          i > 0 && stages[i - 1].value > 0
            ? Math.round((s.value / stages[i - 1].value) * 100)
            : null;
        // Only place the value inside the bar when the bar leaves no room outside.
        const valueInside = pct > 80;
        return (
          <div key={i}>
            {conversion !== null && (
              <div className="ml-[7.5rem] py-0.5 text-[11px] leading-4 text-grey">
                {conversion}% →
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-28 shrink-0 truncate text-xs text-grey" title={s.label}>
                {s.label}
              </div>
              <div
                className="relative h-6 flex-1"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div
                  className="h-6 rounded-r"
                  style={{
                    width: `${pct}%`,
                    background: 'var(--chart-1)',
                    opacity: stageOpacity(i),
                  }}
                />
                {valueInside ? (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-xs font-medium text-white"
                    style={{ right: `calc(${100 - pct}% + 6px)` }}
                  >
                    {formatValue(s.value)}
                  </span>
                ) : (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-xs font-medium text-navy"
                    style={{ left: `calc(${pct}% + 6px)` }}
                  >
                    {formatValue(s.value)}
                  </span>
                )}
                {hovered === i && (
                  <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-navy px-2 py-1 text-xs text-white shadow-lg dark:bg-navy-deep"
                    style={{ left: `${pct / 2}%`, top: -4 }}
                    role="status"
                  >
                    <TipContent
                      label={s.label}
                      value={`${formatValue(s.value)} (${Math.round(pct)}% of ${stages[0].label})`}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
