import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScatterChart as ScatterIcon, RefreshCw, Plus, Minus, AlertTriangle, Star } from 'lucide-react';
import { fetchMarketMap, type MapPoint } from '@/lib/api/bd';
import { PageTitle, Button } from '@/components/ui';
import { ChartSkeleton, EmptyState } from '@/components/shared';
import { FilterChip } from '@/components/market/FilterChip';
import { findNewIds, formatSince } from '@/components/market/gapMatrix';
import { useLastVisit, useWatchlist } from '@/components/market/marketMemory';
import { useInspect, useInspectorStore } from '@/stores';

const BAND_COLOR: Record<string, string> = {
  immediate: '#dc2626',
  high: '#ea580c',
  nurture: '#0891b2',
  watch: '#64748b',
  archive: '#cbd5e1',
  unscored: '#e2e8f0',
};
const BAND_ORDER = ['immediate', 'high', 'nurture', 'watch', 'archive', 'unscored'];

const W = 900;
const H = 460;
const PAD = { l: 60, r: 20, t: 20, b: 40 };
const PLOT = { x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

// x = log10(mcap) mapped across [4, 11] ($10k … $100B); y = priority 0..60
const X_MIN = 4;
const X_MAX = 11;
const Y_MAX = 60;
const MIN_K = 0.5;
const MAX_K = 32;

function xScale(mcap: number): number {
  const lx = Math.log10(Math.max(1, mcap));
  return PLOT.x + ((Math.min(X_MAX, Math.max(X_MIN, lx)) - X_MIN) / (X_MAX - X_MIN)) * PLOT.w;
}
function yScale(pri: number): number {
  return H - PAD.b - (Math.min(Y_MAX, pri) / Y_MAX) * PLOT.h;
}

function fmtMcap(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v)}`;
}

interface Transform {
  k: number;
  x: number;
  y: number;
}
const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

export function MarketMap() {
  const navigate = useNavigate();
  const clipId = useId();
  const inspect = useInspect();
  const closeInspector = useInspectorStore((s) => s.close);
  const { watched, toggleWatch } = useWatchlist();
  const { prev, commit } = useLastVisit('map');
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hiddenBands, setHiddenBands] = useState<Set<string>>(new Set());
  const [hideLcx, setHideLcx] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<{ p: MapPoint; x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMarketMap({ region: region || undefined });
      setPoints(data);
      commit(data.map((p) => p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load market map');
    } finally {
      setLoading(false);
    }
  }, [region, commit]);

  useEffect(() => {
    void load();
  }, [load]);

  const bandsInData = useMemo(() => {
    const present = new Set(points.map((p) => p.band));
    return BAND_ORDER.filter((b) => present.has(b));
  }, [points]);

  /* screener Δ — map points carry no timestamps, so "new" = entrants
     (ids never seen on this page before the previous visit's stamp). */
  const newIds = useMemo(() => findNewIds(points.map((p) => p.id), prev), [points, prev]);
  const watchingCount = useMemo(() => points.filter((p) => watched.has(p.id)).length, [points, watched]);

  const visible = useMemo(
    () =>
      points.filter(
        (p) =>
          !hiddenBands.has(p.band) &&
          !(hideLcx && p.listedOnLcx) &&
          (!watchOnly || watched.has(p.id)) &&
          (!newOnly || newIds.has(p.id)),
      ),
    [points, hiddenBands, hideLcx, watchOnly, watched, newOnly, newIds],
  );

  const plotted = useMemo(
    () =>
      visible.map((p) => ({
        p,
        cx: xScale(p.marketCapUsd),
        cy: yScale(p.priorityScore),
        r: 3 + (p.propensityScore / 100) * 9,
      })),
    [visible],
  );

  /* ── zoom / pan ── */

  const tx = useCallback((v: number) => transform.x + transform.k * v, [transform]);
  const ty = useCallback((v: number) => transform.y + transform.k * v, [transform]);

  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, t.k * factor));
      const f = k / t.k;
      if (f === 1) return t;
      const cx = PLOT.x + PLOT.w / 2;
      const cy = PLOT.y + PLOT.h / 2;
      return { k, x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f };
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, moved: false };
    setPanning(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg) return;
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    drag.moved = true;
    drag.px = e.clientX;
    drag.py = e.clientY;
    const rect = svg.getBoundingClientRect();
    const sx = W / rect.width;
    const sy = H / rect.height;
    setTransform((t) => ({ ...t, x: t.x + dx * sx, y: t.y + dy * sy }));
  }, []);

  const onPointerUp = useCallback(() => {
    suppressClickRef.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setPanning(false);
  }, []);

  /* the tooltip is interactive (watchlist star), so hide on a short delay
     and cancel while the pointer is over either the dot or the tooltip */
  const cancelHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => setHover(null), 160);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  const setHoverAt = useCallback(
    (p: MapPoint, e: React.MouseEvent) => {
      cancelHide();
      const rect = plotRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHover({ p, x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [cancelHide],
  );

  /* ── axis ticks under the current transform ── */

  const xTicks = useMemo(() => {
    const ticks: { x: number; label: string }[] = [];
    for (let lx = X_MIN; lx <= X_MAX; lx++) {
      const x = tx(PLOT.x + ((lx - X_MIN) / (X_MAX - X_MIN)) * PLOT.w);
      if (x < PLOT.x - 1 || x > PLOT.x + PLOT.w + 1) continue;
      ticks.push({ x, label: lx >= 9 ? `$${10 ** (lx - 9)}B` : lx >= 6 ? `$${10 ** (lx - 6)}M` : `$${10 ** (lx - 3)}k` });
    }
    return ticks;
  }, [tx]);

  const yTicks = useMemo(() => {
    const step = transform.k >= 4 ? 5 : transform.k >= 2 ? 10 : 20;
    const ticks: { y: number; label: number }[] = [];
    for (let v = 0; v <= Y_MAX; v += step) {
      const y = ty(yScale(v));
      if (y < PLOT.y - 1 || y > PLOT.y + PLOT.h + 1) continue;
      ticks.push({ y, label: v });
    }
    return ticks;
  }, [transform.k, ty]);

  const plotWidth = plotRef.current?.clientWidth ?? 640;
  const tooltipLeft = hover ? Math.max(4, Math.min(hover.x + 14, plotWidth - 235)) : 0;
  const tooltipTop = hover ? Math.max(4, hover.y + 14) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <PageTitle
        icon={<ScatterIcon size={20} />}
        actions={
          <>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded border border-line bg-card px-2 py-1 text-label text-navy"
            >
              <option value="">All regions</option>
              <option value="eu">EU</option>
              <option value="us">US</option>
            </select>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCw size={12} /> Refresh
            </Button>
          </>
        }
      >
        Market Map
      </PageTitle>

      <p className="text-micro text-grey">
        Each dot is a project: <b>x</b> = market cap (log), <b>y</b> = priority score, <b>size</b> = propensity,{' '}
        <b>color</b> = band. Top-left = high-priority small caps (the sweet spot). Click a dot to inspect in
        place; double-click it for the full dossier. Drag to pan, use +/− to zoom, double-click the background
        to reset. {visible.length} of {points.length} plotted.
      </p>

      {/* band visibility chips + LCX toggle */}
      {points.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {bandsInData.map((b) => (
            <FilterChip
              key={b}
              active={!hiddenBands.has(b)}
              dotColor={BAND_COLOR[b] ?? '#e2e8f0'}
              title={`Toggle ${b} band visibility`}
              onClick={() =>
                setHiddenBands((prev) => {
                  const next = new Set(prev);
                  if (next.has(b)) next.delete(b);
                  else next.add(b);
                  return next;
                })
              }
            >
              {b}
            </FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
          <FilterChip active={hideLcx} title="Hide projects already listed on LCX" onClick={() => setHideLcx((v) => !v)}>
            Hide LCX-listed
          </FilterChip>
          <FilterChip
            active={watchOnly}
            dotColor="#f59e0b"
            title="Show only watched projects"
            onClick={() => setWatchOnly((v) => !v)}
          >
            Watching ({watchingCount})
          </FilterChip>
          {prev && newIds.size > 0 && (
            <FilterChip
              active={newOnly}
              dotColor="#10b981"
              title="Show only projects that entered the map since your last visit"
              onClick={() => setNewOnly((v) => !v)}
            >
              +{newIds.size} new since {formatSince(prev.ts)}
            </FilterChip>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-line bg-card p-2">
          <ChartSkeleton height={380} />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-line bg-card">
          <EmptyState
            icon={<AlertTriangle size={28} className="text-grey" />}
            title="Couldn't load the market map"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        </div>
      ) : points.length === 0 ? (
        <div className="rounded-lg border border-line bg-card">
          <EmptyState
            icon={<ScatterIcon size={28} className="text-grey" />}
            title="No scored projects to plot"
            description="The map shows projects with a market cap and a priority score. Run scoring or widen the region filter."
          />
        </div>
      ) : (
        <div className="relative">
          <div className="overflow-x-auto rounded-lg border border-line bg-card p-2">
            <div ref={plotRef} className="relative" style={{ minWidth: 600 }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className={`w-full select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{ touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={() => setTransform(IDENTITY)}
              >
                <defs>
                  <clipPath id={clipId}>
                    <rect x={PLOT.x} y={PLOT.y} width={PLOT.w} height={PLOT.h} />
                  </clipPath>
                </defs>

                {/* axes */}
                <line x1={PLOT.x} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.2} />
                <line x1={PLOT.x} y1={PLOT.y} x2={PLOT.x} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.2} />
                {xTicks.map((t) => (
                  <g key={t.label}>
                    <line x1={t.x} y1={H - PAD.b} x2={t.x} y2={H - PAD.b + 4} stroke="currentColor" strokeOpacity={0.3} />
                    <text x={t.x} y={H - PAD.b + 16} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity={0.5}>
                      {t.label}
                    </text>
                  </g>
                ))}
                {yTicks.map((t) => (
                  <g key={t.label}>
                    <line x1={PLOT.x - 4} y1={t.y} x2={PLOT.x} y2={t.y} stroke="currentColor" strokeOpacity={0.3} />
                    <text x={PLOT.x - 8} y={t.y + 3} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity={0.5}>
                      {t.label}
                    </text>
                  </g>
                ))}

                {/* points (screen-constant radius; positions follow zoom/pan) */}
                <g clipPath={`url(#${clipId})`}>
                  {plotted.map(({ p, cx, cy, r }) => (
                    <circle
                      key={p.id}
                      cx={tx(cx)}
                      cy={ty(cy)}
                      r={r}
                      fill={BAND_COLOR[p.band] ?? '#e2e8f0'}
                      fillOpacity={hover?.p.id === p.id ? 1 : 0.6}
                      stroke={p.listedOnLcx ? '#059669' : 'none'}
                      strokeWidth={p.listedOnLcx ? 2 : 0}
                      className="cursor-pointer"
                      onMouseEnter={(e) => setHoverAt(p, e)}
                      onMouseMove={(e) => setHoverAt(p, e)}
                      onMouseLeave={scheduleHide}
                      onClick={() => {
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        inspect('project', p.id);
                      }}
                      onDoubleClick={(e) => {
                        // keep the svg's double-click zoom-reset from firing,
                        // close the drawer (single clicks opened it), go deep
                        e.stopPropagation();
                        closeInspector();
                        navigate(`/bd-pipeline/${p.id}`);
                      }}
                    />
                  ))}
                  {/* subtle star markers on watched projects */}
                  {plotted
                    .filter(({ p }) => watched.has(p.id))
                    .map(({ p, cx, cy, r }) => (
                      <text
                        key={`star-${p.id}`}
                        x={tx(cx) + r * 0.85 + 2}
                        y={ty(cy) - r * 0.85}
                        fontSize="8"
                        fill="#f59e0b"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        ★
                      </text>
                    ))}
                  {visible.length === 0 && (
                    <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity={0.5}>
                      All points hidden — re-enable a band chip above.
                    </text>
                  )}
                </g>
              </svg>

              {/* hover tooltip */}
              {hover && (
                <div
                  className="absolute z-10 w-[220px] rounded-md border border-line bg-card p-2 text-label shadow-lg"
                  style={{ left: tooltipLeft, top: tooltipTop }}
                  onMouseEnter={cancelHide}
                  onMouseLeave={() => {
                    cancelHide();
                    setHover(null);
                  }}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-navy">{hover.p.name}</span>
                    {hover.p.ticker && <span className="font-mono text-micro text-grey">{hover.p.ticker}</span>}
                    <button
                      type="button"
                      onClick={() => toggleWatch(hover.p.id)}
                      title={watched.has(hover.p.id) ? 'Remove from watchlist' : 'Add to watchlist'}
                      aria-pressed={watched.has(hover.p.id)}
                      className={`ml-auto shrink-0 rounded p-0.5 transition-colors ${
                        watched.has(hover.p.id) ? 'text-amber-500' : 'text-grey/40 hover:text-amber-500'
                      }`}
                    >
                      <Star size={12} fill={watched.has(hover.p.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-grey">
                    <span>Market cap</span>
                    <span className="text-right font-semibold text-navy">{fmtMcap(hover.p.marketCapUsd)}</span>
                    <span>Priority</span>
                    <span className="text-right font-semibold text-navy">{hover.p.priorityScore}</span>
                    <span>Propensity</span>
                    <span className="text-right font-semibold text-navy">{hover.p.propensityScore}</span>
                    <span>Band</span>
                    <span className="text-right">
                      <span
                        className="inline-flex items-center gap-1 font-semibold text-navy"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLOR[hover.p.band] ?? '#e2e8f0' }} />
                        {hover.p.band}
                      </span>
                    </span>
                    {hover.p.listedOnLcx && (
                      <>
                        <span>LCX</span>
                        <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">listed</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* zoom controls */}
          <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-line bg-card shadow-sm">
            <button
              onClick={() => zoomBy(1.5)}
              title="Zoom in"
              aria-label="Zoom in"
              className="p-1.5 text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10"
            >
              <Plus size={13} />
            </button>
            <div className="h-px bg-line" />
            <button
              onClick={() => zoomBy(1 / 1.5)}
              title="Zoom out"
              aria-label="Zoom out"
              className="p-1.5 text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10"
            >
              <Minus size={13} />
            </button>
          </div>
        </div>
      )}

      {/* always-visible legend */}
      <div className="flex flex-wrap items-center gap-3 text-micro text-grey">
        {BAND_ORDER.filter((b) => b !== 'unscored').map((b) => (
          <span key={b} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLOR[b] }} /> {b}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-emerald-600 dark:border-emerald-400" /> ringed green
          = listed on LCX
        </span>
        <span className="inline-flex items-center gap-1">
          <Star size={10} className="text-amber-500" fill="currentColor" /> = watching (star in the tooltip to toggle)
        </span>
        <span className="inline-flex items-center gap-1">
          click = inspect · double-click = full dossier
        </span>
      </div>
    </div>
  );
}
