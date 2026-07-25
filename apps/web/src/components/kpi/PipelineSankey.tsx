import { formatNumber, truncate } from '@/components/charts/utils';
import { ChartTooltip, TipContent, useTooltip } from '@/components/charts/tooltip';

export interface SankeyStage {
  key: string;
  label: string;
  value: number;
  /** Makes the stage column clickable (hop to its workspace) — no terminal segments. */
  onClick?: () => void;
}

export interface PipelineSankeyProps {
  stages: SankeyStage[];
  height?: number;
  formatValue?: (v: number) => string;
}

const VW = 480;
const NODE_W = 10;
const MT = 24; // value labels above nodes
const MB = 18; // stage labels below
const MIN_H = 2; // keep collapsed stages visible

/** Ordinal opacity ramp on --chart-1, matching the kit's FunnelChart. */
function stageOpacity(i: number): number {
  const steps = [1, 0.85, 0.7, 0.55, 0.4];
  return steps[Math.min(i, steps.length - 1)];
}

/**
 * Pipeline Sankey (plan 3.6, Arkham-flows pattern): proportional top-aligned
 * bands universe → contacted → replied → handoff → won, with the carried-%
 * labeled on every link so the drop-off is the headline. Pure SVG; stage
 * columns are clickable hops into the matching workspace.
 */
export function PipelineSankey({ stages, height = 150, formatValue = formatNumber }: PipelineSankeyProps) {
  const { tip, show, hide } = useTooltip();
  const drawn = stages.filter((s) => s.value >= 0);
  if (drawn.length < 2) return null;

  const VH = height;
  const plotH = VH - MT - MB;
  const first = Math.max(1, drawn[0].value);
  const h = (v: number) => Math.max(MIN_H, (Math.max(0, v) / first) * plotH);
  const n = drawn.length;
  const nodeX = (i: number) => (i * (VW - NODE_W)) / (n - 1);

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="block w-full" style={{ height: 'auto' }} role="img">
        {/* flow bands between consecutive stages */}
        {drawn.slice(0, -1).map((s, i) => {
          const next = drawn[i + 1];
          const x1 = nodeX(i) + NODE_W;
          const x2 = nodeX(i + 1);
          const h1 = h(s.value);
          const h2 = h(next.value);
          const midX = (x1 + x2) / 2;
          const carried = s.value > 0 ? Math.round((next.value / s.value) * 100) : null;
          const lost = Math.max(0, s.value - next.value);
          const d = [
            `M${x1},${MT}`,
            `L${x2},${MT}`,
            `L${x2},${MT + h2}`,
            `C${midX},${MT + h2} ${midX},${MT + h1} ${x1},${MT + h1}`,
            'Z',
          ].join(' ');
          return (
            <g key={`flow-${s.key}`}>
              <path d={d} fill="var(--chart-1)" opacity={0.15} />
              {/* carried % — the drop-off is the story */}
              <text
                x={midX}
                y={MT + Math.max(h1, h2) + 12}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill="currentColor"
                className="text-grey"
              >
                {carried != null ? `${carried}% →` : '—'}
              </text>
              <rect
                x={x1}
                y={MT}
                width={Math.max(1, x2 - x1)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() =>
                  show(
                    (midX / VW) * 100,
                    (MT / VH) * 100,
                    <TipContent
                      label={`${s.label} → ${next.label}`}
                      value={
                        carried != null
                          ? `${carried}% carried · −${formatValue(lost)} dropped`
                          : `${formatValue(next.value)}`
                      }
                    />
                  )
                }
                onMouseLeave={hide}
              />
            </g>
          );
        })}

        {/* stage nodes */}
        {drawn.map((s, i) => {
          const x = nodeX(i);
          const hh = h(s.value);
          const cx = x + NODE_W / 2;
          const clickable = Boolean(s.onClick);
          return (
            // The <g> keeps the click and the hover, so the whole column stays one
            // target. Focus moved off it onto the painted <rect>: WebKit paints no
            // `outline` on an SVG container, measured in a WKWebView at 0 ring
            // pixels for a `<g>` against 4352 for a `<rect>`, so a keyboard user in
            // the shipped Tauri build had no indicator here at all. The old
            // `outline-none` on this element was doubly wrong — it was suppressing a
            // ring that WebKit was never going to paint anyway.
            <g
              key={s.key}
              onClick={s.onClick}
              onMouseEnter={() =>
                show((cx / VW) * 100, (MT / VH) * 100, <TipContent label={s.label} value={formatValue(s.value)} />)
              }
              onMouseLeave={hide}
              className={clickable ? 'cursor-pointer' : undefined}
            >
              <rect
                x={x}
                y={MT}
                width={NODE_W}
                height={hh}
                rx={2}
                fill="var(--chart-1)"
                // fillOpacity, not opacity, now that this element is the focus
                // target. Element `opacity` fades everything the element paints,
                // which would have dimmed the focus stroke to the ramp value — 0.4
                // on the last stage — and an outline with it, since opacity forms a
                // stacking context. The rect declares no stroke when unfocused, so
                // moving the ramp onto the fill is pixel-identical in the resting
                // state and leaves the ring at full strength.
                fillOpacity={stageOpacity(i)}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') s.onClick?.();
                      }
                    : undefined
                }
                className={clickable ? 'focus-ring-svg' : undefined}
                aria-label={clickable ? `${s.label}: ${formatValue(s.value)} — open workspace` : undefined}
              />
              <text
                x={cx}
                y={MT - 6}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontSize={10}
                fontWeight={600}
                fill="currentColor"
                className="text-navy"
              >
                {formatValue(s.value)}
              </text>
              <text
                x={cx}
                y={VH - 5}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontSize={10}
                fill="currentColor"
                className={clickable ? 'text-grey underline decoration-dotted underline-offset-2' : 'text-grey'}
              >
                {truncate(s.label, 12)}
              </text>
              {/* hit target: full column band */}
              <rect x={Math.max(0, cx - 18)} y={MT - 14} width={36} height={VH - MT + 8} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );
}
