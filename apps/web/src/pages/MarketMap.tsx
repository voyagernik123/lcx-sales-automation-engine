import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScatterChart as ScatterIcon, RefreshCw } from 'lucide-react';
import { fetchMarketMap, type MapPoint } from '@/lib/api/bd';

const BAND_COLOR: Record<string, string> = {
  immediate: '#dc2626',
  high: '#ea580c',
  nurture: '#0891b2',
  watch: '#64748b',
  archive: '#cbd5e1',
  unscored: '#e2e8f0',
};

const W = 900;
const H = 460;
const PAD = { l: 60, r: 20, t: 20, b: 40 };

export function MarketMap() {
  const navigate = useNavigate();
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [band, setBand] = useState('');
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<MapPoint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPoints(await fetchMarketMap({ band: band || undefined, region: region || undefined }));
    } finally {
      setLoading(false);
    }
  }, [band, region]);

  useEffect(() => {
    void load();
  }, [load]);

  const { plotted, xTicks } = useMemo(() => {
    // x = log10(mcap) mapped across [4, 11] ($10k … $100B); y = priority 0..60
    const xMin = 4;
    const xMax = 11;
    const yMax = 60;
    const xScale = (mcap: number) => {
      const lx = Math.log10(Math.max(1, mcap));
      return PAD.l + ((Math.min(xMax, Math.max(xMin, lx)) - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
    };
    const yScale = (pri: number) => H - PAD.b - (Math.min(yMax, pri) / yMax) * (H - PAD.t - PAD.b);
    const plotted = points.map((p) => ({
      p,
      cx: xScale(p.marketCapUsd),
      cy: yScale(p.priorityScore),
      r: 3 + (p.propensityScore / 100) * 9,
    }));
    const xTicks = [4, 5, 6, 7, 8, 9, 10, 11].map((lx) => ({
      x: PAD.l + ((lx - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r),
      label: lx >= 9 ? `$${10 ** (lx - 9)}B` : lx >= 6 ? `$${10 ** (lx - 6)}M` : `$${10 ** (lx - 3)}k`,
    }));
    return { plotted, xTicks };
  }, [points]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <ScatterIcon size={18} /> Market Map
        </h1>
        <div className="flex items-center gap-2 text-[11px]">
          <select value={band} onChange={(e) => setBand(e.target.value)} className="rounded border border-line px-2 py-1">
            <option value="">All bands</option>
            {['immediate', 'high', 'nurture', 'watch'].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded border border-line px-2 py-1">
            <option value="">All regions</option>
            <option value="eu">EU</option>
            <option value="us">US</option>
          </select>
          <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      <p className="text-[11px] text-grey">
        Each dot is a project: <b>x</b> = market cap (log), <b>y</b> = priority score, <b>size</b> = propensity, <b>color</b> = band.
        Top-left = high-priority small caps (the sweet spot). {points.length} plotted.
      </p>

      <div className="overflow-x-auto rounded-lg border border-line bg-card p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 640 }}>
          {/* axes */}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.2} />
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.2} />
          {xTicks.map((t) => (
            <g key={t.x}>
              <line x1={t.x} y1={H - PAD.b} x2={t.x} y2={H - PAD.b + 4} stroke="currentColor" strokeOpacity={0.3} />
              <text x={t.x} y={H - PAD.b + 16} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity={0.5}>{t.label}</text>
            </g>
          ))}
          {[0, 20, 40, 60].map((p) => {
            const y = H - PAD.b - (p / 60) * (H - PAD.t - PAD.b);
            return (
              <g key={p}>
                <line x1={PAD.l - 4} y1={y} x2={PAD.l} y2={y} stroke="currentColor" strokeOpacity={0.3} />
                <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity={0.5}>{p}</text>
              </g>
            );
          })}
          {/* points */}
          {plotted.map(({ p, cx, cy, r }) => (
            <circle
              key={p.id}
              cx={cx}
              cy={cy}
              r={r}
              fill={BAND_COLOR[p.band] ?? '#e2e8f0'}
              fillOpacity={0.6}
              stroke={p.listedOnLcx ? '#059669' : 'none'}
              strokeWidth={p.listedOnLcx ? 2 : 0}
              className="cursor-pointer hover:fill-opacity-100"
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onClick={() => navigate(`/bd-pipeline/${p.id}`)}
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-grey">
        {Object.entries(BAND_COLOR).filter(([b]) => b !== 'unscored').map(([b, color]) => (
          <span key={b} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {b}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-emerald-600" /> on LCX
        </span>
      </div>

      {hover && (
        <div className="rounded border border-line bg-card p-2 text-[11px]">
          <span className="font-bold">{hover.name}</span>
          {hover.ticker && <span className="ml-1.5 text-grey font-mono">{hover.ticker}</span>}
          <span className="ml-2">· priority {hover.priorityScore} · propensity {hover.propensityScore} · ${(hover.marketCapUsd / 1e6).toFixed(1)}M · {hover.band}</span>
        </div>
      )}
      {loading && <p className="text-center text-[12px] text-grey">Loading…</p>}
    </div>
  );
}
