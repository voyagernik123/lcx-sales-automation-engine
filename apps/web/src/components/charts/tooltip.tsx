import { ReactNode, useState } from 'react';

/**
 * Internal hover-tooltip primitives for the chart kit — not exported from the
 * barrel. Tooltips enhance, they never gate: every value they show is also
 * present as a direct label, legend entry, or axis tick.
 *
 * Coordinates are percentages of the relatively-positioned chart wrapper so
 * they stay correct when the SVG scales with its container.
 */

export interface TipState {
  /** Anchor x as a percentage of the wrapper width. */
  xPct: number;
  /** Anchor y as a percentage of the wrapper height. */
  yPct: number;
  content: ReactNode;
}

export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  return {
    tip,
    show: (xPct: number, yPct: number, content: ReactNode) => setTip({ xPct, yPct, content }),
    hide: () => setTip(null),
  };
}

/** Render inside a `relative` wrapper, after the SVG. */
export function ChartTooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-navy px-2 py-1 text-xs text-white shadow-lg dark:bg-navy-deep"
      style={{ left: `${tip.xPct}%`, top: `calc(${tip.yPct}% - 6px)` }}
      role="status"
    >
      {tip.content}
    </div>
  );
}

/** Standard "Label · value" tooltip content. */
export function TipContent({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-medium">{label}</span>
      <span className="opacity-80"> · </span>
      {value}
    </span>
  );
}
