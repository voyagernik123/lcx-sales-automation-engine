import { useMemo, useRef, useState } from 'react';
import type { MapPoint } from '@/lib/api/bd';
import { formatMoney } from '@/lib/format';
import { type Lens, type ZoneKey, isPlottable, normalize } from './marketLenses';

/**
 * The positioning field. SVG with a fixed viewBox scaled to the container, so
 * theming stays in CSS vars and layout is responsive. Hover uses ONE
 * mousemove doing nearest-point hit-testing (not 1500 per-point listeners),
 * and a drag brushes a rectangular selection; a click without drag opens the
 * point. Built for the full universe (≤1500 pts) at 60fps.
 */

const VB = { w: 1000, h: 620 };
const PAD = { l: 46, r: 16, t: 16, b: 40 };
const PLOT = { w: VB.w - PAD.l - PAD.r, h: VB.h - PAD.t - PAD.b };
const ZONE_POS: Record<ZoneKey, { x: number; y: number; anchor: 'start' | 'end' | 'middle' }> = {
  tl: { x: PAD.l + 10, y: PAD.t + 20, anchor: 'start' },
  tr: { x: PAD.l + PLOT.w - 10, y: PAD.t + 20, anchor: 'end' },
  bl: { x: PAD.l + 10, y: PAD.t + PLOT.h - 10, anchor: 'start' },
  br: { x: PAD.l + PLOT.w - 10, y: PAD.t + PLOT.h - 10, anchor: 'end' },
};

interface Screen {
  p: MapPoint;
  x: number;
  y: number;
  r: number;
}

export interface MarketScatterProps {
  points: MapPoint[];
  lens: Lens;
  colorFor: (p: MapPoint) => string;
  selectedIds: Set<string>;
  onSelect: (ids: string[], additive: boolean) => void;
  onOpen: (p: MapPoint) => void;
}

export function MarketScatter({ points, lens, colorFor, selectedIds, onSelect, onOpen }: MarketScatterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  const screens = useMemo<Screen[]>(() => {
    const maxMcap = Math.max(...points.map((p) => p.marketCapUsd || 0), 1);
    return points
      .filter((p) => isPlottable(lens, p))
      .map((p) => {
        const nx = normalize(lens.x, lens.x.value(p)!);
        const ny = normalize(lens.y, lens.y.value(p)!);
        const r = 3 + Math.sqrt((p.marketCapUsd || 0) / maxMcap) * 13;
        return { p, x: PAD.l + nx * PLOT.w, y: PAD.t + PLOT.h - ny * PLOT.h, r };
      });
  }, [points, lens]);

  const splitX = PAD.l + normalize(lens.x, lens.x.split) * PLOT.w;
  const splitY = PAD.t + PLOT.h - normalize(lens.y, lens.y.split) * PLOT.h;

  /** Cursor → viewBox coords (accounts for the SVG scaling to its box). */
  const toVB = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VB.w,
      y: ((e.clientY - rect.top) / rect.height) * VB.h,
    };
  };

  const nearest = (vx: number, vy: number): Screen | null => {
    let best: Screen | null = null;
    let bd = 18 * 18;
    for (const s of screens) {
      const d = (s.x - vx) ** 2 + (s.y - vy) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };

  const onMove = (e: React.MouseEvent) => {
    const { x, y } = toVB(e);
    if (dragging.current && brush) {
      moved.current = Math.abs(x - brush.x0) > 6 || Math.abs(y - brush.y0) > 6;
      setBrush({ ...brush, x1: x, y1: y });
    } else {
      setHoverId(nearest(x, y)?.p.id ?? null);
    }
  };

  const onDown = (e: React.MouseEvent) => {
    const { x, y } = toVB(e);
    dragging.current = true;
    moved.current = false;
    setBrush({ x0: x, y0: y, x1: x, y1: y });
  };

  const onUp = (e: React.MouseEvent) => {
    dragging.current = false;
    if (brush && moved.current) {
      const lo = { x: Math.min(brush.x0, brush.x1), y: Math.min(brush.y0, brush.y1) };
      const hi = { x: Math.max(brush.x0, brush.x1), y: Math.max(brush.y0, brush.y1) };
      const ids = screens.filter((s) => s.x >= lo.x && s.x <= hi.x && s.y >= lo.y && s.y <= hi.y).map((s) => s.p.id);
      onSelect(ids, e.shiftKey);
    } else {
      const hit = nearest(...(Object.values(toVB(e)) as [number, number]));
      if (hit) onOpen(hit.p);
    }
    setBrush(null);
    moved.current = false;
  };

  const hover = screens.find((s) => s.p.id === hoverId) ?? null;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        preserveAspectRatio="none"
        className="h-full w-full cursor-crosshair select-none"
        onMouseMove={onMove}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onMouseLeave={() => {
          setHoverId(null);
          if (dragging.current) {
            dragging.current = false;
            setBrush(null);
          }
        }}
      >
        {/* plot frame */}
        <rect x={PAD.l} y={PAD.t} width={PLOT.w} height={PLOT.h} fill="none" stroke="rgb(var(--line))" strokeWidth={1} />
        {/* quadrant guides */}
        <line x1={splitX} y1={PAD.t} x2={splitX} y2={PAD.t + PLOT.h} stroke="rgb(var(--line))" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
        <line x1={PAD.l} y1={splitY} x2={PAD.l + PLOT.w} y2={splitY} stroke="rgb(var(--line))" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
        {/* zone labels */}
        {(Object.keys(ZONE_POS) as ZoneKey[]).map((z) => (
          <text
            key={z}
            x={ZONE_POS[z].x}
            y={ZONE_POS[z].y}
            textAnchor={ZONE_POS[z].anchor}
            className={`font-mono ${z === lens.target ? 'fill-cyan-600 dark:fill-cyan-400' : 'fill-grey'}`}
            style={{ fontSize: 11, fontWeight: z === lens.target ? 700 : 500, opacity: z === lens.target ? 0.9 : 0.5 }}
          >
            {lens.zones[z].toUpperCase()}
          </text>
        ))}
        {/* axis labels */}
        <text x={PAD.l + PLOT.w / 2} y={VB.h - 10} textAnchor="middle" className="fill-grey" style={{ fontSize: 12 }}>
          {lens.x.label} →
        </text>
        <text x={-(PAD.t + PLOT.h / 2)} y={14} textAnchor="middle" transform="rotate(-90)" className="fill-grey" style={{ fontSize: 12 }}>
          {lens.y.label} →
        </text>

        {/* points */}
        {screens.map((s) => {
          const sel = selectedIds.size === 0 || selectedIds.has(s.p.id);
          const isHover = s.p.id === hoverId;
          return (
            <circle
              key={s.p.id}
              cx={s.x}
              cy={s.y}
              r={isHover ? s.r + 2 : s.r}
              fill={colorFor(s.p)}
              fillOpacity={sel ? 0.82 : 0.12}
              stroke={s.p.listedOnLcx ? 'rgb(var(--navy))' : isHover ? 'rgb(var(--navy))' : 'none'}
              strokeWidth={s.p.listedOnLcx ? 2 : isHover ? 1.5 : 0}
            />
          );
        })}

        {/* brush rectangle */}
        {brush && moved.current && (
          <rect
            x={Math.min(brush.x0, brush.x1)}
            y={Math.min(brush.y0, brush.y1)}
            width={Math.abs(brush.x1 - brush.x0)}
            height={Math.abs(brush.y1 - brush.y0)}
            fill="rgb(8 145 178 / 0.08)"
            stroke="rgb(8 145 178 / 0.6)"
            strokeWidth={1}
          />
        )}
      </svg>

      {/* tooltip — HTML overlay positioned by % so it tracks the scaled SVG */}
      {hover && !dragging.current && (
        <div
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-card p-2.5 shadow-overlay"
          style={{ left: `${(hover.x / VB.w) * 100}%`, top: `calc(${(hover.y / VB.h) * 100}% - 10px)` }}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-label font-semibold text-navy">{hover.p.name}</span>
            {hover.p.ticker && <span className="font-mono text-[10px] text-grey">{hover.p.ticker}</span>}
            {hover.p.listedOnLcx && <span className="ml-auto text-[9px] font-bold text-emerald-600 dark:text-emerald-400">LISTED</span>}
          </div>
          <div className="mt-1.5 space-y-0.5 border-t border-line/60 pt-1.5 text-micro text-grey">
            <Row label={lens.x.label} value={lens.x.value(hover.p) != null ? lens.x.format(lens.x.value(hover.p)!) : '—'} />
            <Row label={lens.y.label} value={lens.y.value(hover.p) != null ? lens.y.format(lens.y.value(hover.p)!) : '—'} />
            <Row label="Market cap" value={formatMoney(hover.p.marketCapUsd)} />
            <Row label="Band" value={hover.p.band} />
          </div>
          <div className="mt-1.5 border-t border-line/60 pt-1 text-[9px] text-grey">Click to inspect →</div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate">{label}</span>
      <span className="num-tabular shrink-0 font-semibold text-navy">{value}</span>
    </div>
  );
}
