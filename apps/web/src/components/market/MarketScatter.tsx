import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MapPoint } from '@/lib/api/bd';
import { formatMoney } from '@/lib/format';
import { type Lens, type ZoneKey, histogram, isPlottable, normalize } from './marketLenses';

/**
 * The positioning field. The SVG viewBox is measured to equal the pane's pixel
 * size, so one unit is one CSS pixel — dots stay perfectly circular and text
 * stays legible at any pane size (a fixed landscape viewBox would stretch dots
 * ~2.7× taller than wide in a portrait pane). Hover uses ONE mousemove doing
 * nearest-point hit-testing (not 1500 per-point listeners); a drag brushes a
 * rectangular selection; a click without drag opens the point. Marginal
 * histograms line the top and right edges. Built for the full universe
 * (≤1500 pts) at 60fps.
 */

const PAD = { l: 52, r: 46, t: 40, b: 40 };
const MARG = 26; // marginal strip thickness (px)

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
  sizeValue: (p: MapPoint) => number;
  selectedIds: Set<string>;
  onSelect: (ids: string[], additive: boolean) => void;
  onOpen: (p: MapPoint) => void;
}

export function MarketScatter({ points, lens, colorFor, sizeValue, selectedIds, onSelect, onOpen }: MarketScatterProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  // Measure the pane; the viewBox equals its pixel size so scaling is 1:1.
  const [size, setSize] = useState({ w: 800, h: 520 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = size;
  const PLOT_W = Math.max(1, W - PAD.l - PAD.r);
  const PLOT_H = Math.max(1, H - PAD.t - PAD.b);

  const ZONE_POS = useMemo<Record<ZoneKey, { x: number; y: number; anchor: 'start' | 'end' | 'middle' }>>(
    () => ({
      tl: { x: PAD.l + 8, y: PAD.t + 15, anchor: 'start' },
      tr: { x: PAD.l + PLOT_W - 8, y: PAD.t + 15, anchor: 'end' },
      bl: { x: PAD.l + 8, y: PAD.t + PLOT_H - 8, anchor: 'start' },
      br: { x: PAD.l + PLOT_W - 8, y: PAD.t + PLOT_H - 8, anchor: 'end' },
    }),
    [PLOT_W, PLOT_H],
  );

  const { screens, marginX, marginY } = useMemo(() => {
    const plot = points.filter((p) => isPlottable(lens, p));
    const maxSize = Math.max(...plot.map(sizeValue), 1);
    const scr: Screen[] = plot.map((p) => {
      const nx = normalize(lens.x, lens.x.value(p)!);
      const ny = normalize(lens.y, lens.y.value(p)!);
      const r = 3 + Math.sqrt(Math.max(0, sizeValue(p)) / maxSize) * 13;
      return { p, x: PAD.l + nx * PLOT_W, y: PAD.t + PLOT_H - ny * PLOT_H, r };
    });
    return {
      screens: scr,
      marginX: histogram(lens.x, plot.map((p) => lens.x.value(p)!)),
      marginY: histogram(lens.y, plot.map((p) => lens.y.value(p)!)),
    };
  }, [points, lens, sizeValue, PLOT_W, PLOT_H]);

  const splitX = PAD.l + normalize(lens.x, lens.x.split) * PLOT_W;
  const splitY = PAD.t + PLOT_H - normalize(lens.y, lens.y.split) * PLOT_H;
  const maxMx = Math.max(...marginX, 1);
  const maxMy = Math.max(...marginY, 1);

  const toVB = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const nearest = (vx: number, vy: number): Screen | null => {
    let best: Screen | null = null;
    let bd = 16 * 16;
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
      moved.current = Math.abs(x - brush.x0) > 5 || Math.abs(y - brush.y0) > 5;
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
      const { x, y } = toVB(e);
      const hit = nearest(x, y);
      if (hit) onOpen(hit.p);
    }
    setBrush(null);
    moved.current = false;
  };

  const hover = screens.find((s) => s.p.id === hoverId) ?? null;
  const binW = PLOT_W / marginX.length;
  const binH = PLOT_H / marginY.length;

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
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
        {/* marginal distributions (faint) */}
        {marginX.map((c, i) =>
          c > 0 ? (
            <rect
              key={`mx${i}`}
              x={PAD.l + i * binW + 0.5}
              y={PAD.t - MARG - 4 + (MARG - (c / maxMx) * MARG)}
              width={Math.max(0.5, binW - 1)}
              height={(c / maxMx) * MARG}
              fill="rgb(var(--grey))"
              opacity={0.3}
            />
          ) : null,
        )}
        {marginY.map((c, i) =>
          c > 0 ? (
            <rect
              key={`my${i}`}
              x={PAD.l + PLOT_W + 4}
              y={PAD.t + PLOT_H - (i + 1) * binH + 0.5}
              width={(c / maxMy) * MARG}
              height={Math.max(0.5, binH - 1)}
              fill="rgb(var(--grey))"
              opacity={0.3}
            />
          ) : null,
        )}

        {/* plot frame + quadrant guides */}
        <rect x={PAD.l} y={PAD.t} width={PLOT_W} height={PLOT_H} fill="none" stroke="rgb(var(--line))" strokeWidth={1} />
        <line x1={splitX} y1={PAD.t} x2={splitX} y2={PAD.t + PLOT_H} stroke="rgb(var(--line))" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
        <line x1={PAD.l} y1={splitY} x2={PAD.l + PLOT_W} y2={splitY} stroke="rgb(var(--line))" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />

        {/* zone labels */}
        {(Object.keys(ZONE_POS) as ZoneKey[]).map((z) => (
          <text
            key={z}
            x={ZONE_POS[z].x}
            y={ZONE_POS[z].y}
            textAnchor={ZONE_POS[z].anchor}
            // fill-cyan-700, not -600: this is TEXT, and the Phase 7 sweep that moved
            // cyan off 4.5:1-failing text sites grepped `text-cyan-600` and so walked
            // straight past the one site that spells it `fill-`. cyan-600 measures
            // 3.68:1 on white, 3.22 composited at the 0.9 below; cyan-700 is 5.36 and
            // 4.43. Still short of 4.5, and the remaining 0.07 is the inline opacity,
            // not the hue — the same alpha-on-text defect the three `fill-grey`
            // siblings have far worse at 0.5 (2.16:1). Recorded in contrast.test.ts.
            className={`font-mono ${z === lens.target ? 'fill-cyan-700 dark:fill-cyan-400' : 'fill-grey'}`}
            style={{ fontSize: 11, fontWeight: z === lens.target ? 700 : 500, opacity: z === lens.target ? 0.9 : 0.5 }}
          >
            {(lens.plotZones ?? lens.zones)[z].toUpperCase()}
          </text>
        ))}

        {/* axis labels */}
        <text x={PAD.l + PLOT_W / 2} y={H - 8} textAnchor="middle" className="fill-grey" style={{ fontSize: 12 }}>
          {lens.x.label} →
        </text>
        <text x={-(PAD.t + PLOT_H / 2)} y={14} textAnchor="middle" transform="rotate(-90)" className="fill-grey" style={{ fontSize: 12 }}>
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
              fillOpacity={sel ? 0.82 : 0.1}
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

      {/* tooltip — HTML overlay positioned by % so it tracks the SVG.
          Anchor flips near the edges so it never clips out of the plot. */}
      {hover &&
        !dragging.current &&
        (() => {
          const fx = hover.x / W;
          const fy = hover.y / H;
          // horizontal: right-align near the right edge, left-align near the left, else centered
          const tx = fx > 0.72 ? 'translateX(-100%)' : fx < 0.28 ? 'translateX(0%)' : 'translateX(-50%)';
          // vertical: drop below the point when it sits near the top edge, else float above
          const below = fy < 0.2;
          const ty = below ? 'translateY(14px)' : 'translateY(-100%)';
          const top = below ? `calc(${fy * 100}% + 6px)` : `calc(${fy * 100}% - 10px)`;
          return (
            <div
              className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line bg-card p-2.5 shadow-overlay"
              style={{ left: `${fx * 100}%`, top, transform: `${tx} ${ty}` }}
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
                <Row label="Competitors" value={`${hover.p.exchangeCount} exchange${hover.p.exchangeCount === 1 ? '' : 's'}`} />
              </div>
              <div className="mt-1.5 border-t border-line/60 pt-1 text-[9px] text-grey">Click to inspect →</div>
            </div>
          );
        })()}
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
