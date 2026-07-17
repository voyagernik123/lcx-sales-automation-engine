import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Crosshair, X } from 'lucide-react';
import { fetchMarketMap, type MapPoint } from '@/lib/api/bd';
import { PageTitle, Button } from '@/components/ui';
import { ChartSkeleton, ErrorNotice } from '@/components/shared';
import { EntityChip } from '@/components/entity';
import { useInspect } from '@/stores';
import { formatMoney } from '@/lib/format';
import { MarketScatter } from '@/components/market/MarketScatter';
import {
  LENSES,
  SIZE_MODES,
  COLOR_MODES,
  getLens,
  getSizeMode,
  getColorMode,
  classifyZone,
  summarize,
  type ZoneKey,
} from '@/components/market/marketLenses';

const BAND_ORDER = ['immediate', 'high', 'nurture', 'watch', 'archive'];
const ZONE_SEQ: ZoneKey[] = ['tr', 'tl', 'br', 'bl'];

/** Semantic color-bucket → CSS color, per color mode (var() re-themes). */
const COLOR_SCALE: Record<string, Record<string, string>> = {
  band: {
    immediate: 'var(--chart-1)',
    high: 'var(--chart-2)',
    nurture: 'var(--chart-3)',
    watch: 'var(--chart-5)',
    archive: 'rgb(var(--grey))',
    unscored: 'rgb(var(--grey))',
  },
  gap: {
    'gap-strong': 'rgb(var(--red))',
    gap: 'rgb(var(--amber))',
    listed: 'var(--chart-2)',
    none: 'rgb(var(--grey))',
  },
  momentum: {
    'up-strong': 'var(--chart-2)',
    up: 'var(--chart-4)',
    down: 'rgb(var(--amber))',
    'down-strong': 'rgb(var(--red))',
    flat: 'rgb(var(--grey))',
  },
  recommendation: {
    eu: 'var(--chart-1)',
    us: 'var(--chart-3)',
    dual: 'var(--chart-2)',
    none: 'rgb(var(--grey))',
  },
};

export function MarketMap() {
  const inspect = useInspect();
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lensId, setLensId] = useState('opportunity');
  const [sizeModeId, setSizeModeId] = useState('mcap');
  const [colorModeId, setColorModeId] = useState('band');
  const [region, setRegion] = useState('');
  const [band, setBand] = useState('');
  const [listedOnly, setListedOnly] = useState<'all' | 'yes' | 'no'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setError(null);
    try {
      const data = await fetchMarketMap({ region: region || undefined, band: band || undefined });
      if (seq !== loadSeq.current) return;
      setPoints(data);
      setSelected(new Set());
    } catch (err) {
      if (seq === loadSeq.current) setError(err);
    }
  }, [region, band]);

  useEffect(() => {
    void load();
  }, [load]);

  const lens = getLens(lensId);

  // Client-side listed filter (server handles band/region).
  const visible = useMemo(() => {
    const all = points ?? [];
    if (listedOnly === 'yes') return all.filter((p) => p.listedOnLcx);
    if (listedOnly === 'no') return all.filter((p) => !p.listedOnLcx);
    return all;
  }, [points, listedOnly]);

  // Stats reflect the selection if one exists, else the whole visible set.
  const focusSet = useMemo(
    () => (selected.size > 0 ? visible.filter((p) => selected.has(p.id)) : visible),
    [visible, selected],
  );
  const stats = useMemo(() => summarize(lens, focusSet), [lens, focusSet]);

  // Ranked list: selection if any, else the target-zone points, best first.
  const ranked = useMemo(() => {
    const pool = selected.size > 0 ? focusSet : visible.filter((p) => classifyZone(lens, p) === lens.target);
    return [...pool]
      .sort((a, b) => (lens.y.value(b) ?? 0) - (lens.y.value(a) ?? 0) || (lens.x.value(b) ?? 0) - (lens.x.value(a) ?? 0))
      .slice(0, 12);
  }, [selected, focusSet, visible, lens]);

  const colorMode = getColorMode(colorModeId);
  const sizeMode = getSizeMode(sizeModeId);
  const colorFor = useCallback(
    (p: MapPoint) => COLOR_SCALE[colorMode.id]?.[colorMode.key(p)] ?? 'rgb(var(--grey))',
    [colorMode],
  );
  const sizeValue = useCallback((p: MapPoint) => sizeMode.value(p), [sizeMode]);
  const onSelect = useCallback((ids: string[], additive: boolean) => {
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-4.5rem)] flex-col p-5">
      <PageTitle
        className="mb-4"
        subtitle="The token universe positioned by opportunity, regulatory posture, momentum and scale — brush to select, click to inspect."
        actions={
          <Button variant="secondary" size="xs" onClick={() => void load()}>
            <RefreshCw size={11} /> Refresh
          </Button>
        }
      >
        Market Map
      </PageTitle>

      {error ? (
        <ErrorNotice error={error} onRetry={() => void load()} />
      ) : points === null ? (
        <ChartSkeleton />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          {/* ── Left rail: lens · filters · stats · zones ── */}
          <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto lg:w-60">
            <Panel title="Lens">
              <div className="grid grid-cols-2 gap-1.5">
                {LENSES.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLensId(l.id)}
                    className={`rounded-md border px-2 py-1.5 text-left text-micro font-semibold transition-colors ${
                      l.id === lensId
                        ? 'border-cyan-500/60 bg-cyan-500/[0.07] text-navy'
                        : 'border-line text-grey hover:border-grey-light hover:text-navy dark:hover:border-grey'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-micro leading-relaxed text-grey">{lens.desc}</p>
            </Panel>

            <Panel title="Encoding">
              <div className="space-y-2">
                <Select label="Size" value={sizeModeId} onChange={setSizeModeId} options={SIZE_MODES.map((m) => [m.id, m.label])} />
                <Select label="Color" value={colorModeId} onChange={setColorModeId} options={COLOR_MODES.map((m) => [m.id, m.label])} />
              </div>
            </Panel>

            <Panel title="Filters">
              <div className="space-y-2">
                <Select
                  label="Band"
                  value={band}
                  onChange={setBand}
                  options={[['', 'All bands'], ...BAND_ORDER.map((b) => [b, b[0].toUpperCase() + b.slice(1)] as [string, string])]}
                />
                <Select label="Region" value={region} onChange={setRegion} options={[['', 'All regions'], ['eu', 'EU'], ['us', 'US']]} />
                <Select
                  label="On LCX"
                  value={listedOnly}
                  onChange={(v) => setListedOnly(v as typeof listedOnly)}
                  options={[['all', 'All'], ['yes', 'Listed'], ['no', 'Not listed']]}
                />
              </div>
            </Panel>

            <Panel
              title={selected.size > 0 ? `Selection · ${selected.size}` : 'Universe'}
              action={
                selected.size > 0 ? (
                  <button onClick={() => setSelected(new Set())} className="flex items-center gap-0.5 text-micro font-semibold text-grey hover:text-navy">
                    <X size={11} /> clear
                  </button>
                ) : undefined
              }
            >
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Projects" value={String(stats.count)} />
                <Stat label="Total mcap" value={formatMoney(stats.totalMcap)} />
                <Stat label="On LCX" value={String(stats.listed)} />
                <Stat label="Avg propensity" value={String(stats.avgPropensity)} />
              </div>
            </Panel>

            <Panel title="Quadrants">
              <div className="space-y-1">
                {ZONE_SEQ.map((z) => (
                  <div key={z} className="flex items-center justify-between gap-2 text-micro">
                    <span className={z === lens.target ? 'font-semibold text-cyan-700 dark:text-cyan-400' : 'text-grey'}>{lens.zones[z]}</span>
                    <span className="num-tabular font-mono font-semibold text-navy">{stats.zoneCounts[z]}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-1">
              {colorMode.legend.map((item) => (
                <span key={item.key} className="flex items-center gap-1 text-[10px] text-grey">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_SCALE[colorMode.id]?.[item.key] ?? 'rgb(var(--grey))' }} />
                  {item.label}
                </span>
              ))}
              <span className="flex items-center gap-1 text-[10px] text-grey">
                <span className="h-2 w-2 rounded-full border-2 border-navy" /> on LCX
              </span>
              <span className="w-full text-[9px] text-grey/70">Dot size · {sizeMode.label.toLowerCase()}</span>
            </div>
          </aside>

          {/* ── Center: the field (the hero — always gets the space) ── */}
          <div className="min-w-[340px] flex-1 rounded-lg border border-line/80 bg-card p-2 shadow-card">
            <MarketScatter points={visible} lens={lens} colorFor={colorFor} sizeValue={sizeValue} selectedIds={selected} onSelect={onSelect} onOpen={(p) => inspect('project', p.id)} />
          </div>

          {/* ── Right rail: ranked list (only when there's room; brushing +
                quadrant counts cover it on narrow screens) ── */}
          <aside className="hidden w-64 shrink-0 flex-col rounded-lg border border-line/80 bg-card p-3 shadow-card xl:flex">
            <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
              <Crosshair size={11} className="text-cyan-500" />
              {selected.size > 0 ? 'Selected' : lens.zones[lens.target]}
            </div>
            {ranked.length === 0 ? (
              <p className="text-micro italic text-grey">Nothing here — brush a region on the map or adjust filters.</p>
            ) : (
              <div className="min-h-0 flex-1 divide-y divide-line/50 overflow-y-auto">
                {ranked.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(p) }} />
                    <EntityChip
                      type="project"
                      id={p.id}
                      name={p.name}
                      meta={p.ticker}
                      stateLine={`${lens.zones[classifyZone(lens, p) ?? lens.target]} · ${formatMoney(p.marketCapUsd)}`}
                      className="min-w-0 flex-1 text-label font-semibold"
                    />
                    <span className="num-tabular shrink-0 font-mono text-micro text-grey">
                      {lens.y.value(p) != null ? lens.y.format(lens.y.value(p)!) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line/80 bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-micro font-bold uppercase tracking-wider text-grey">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line/60 px-2 py-1.5">
      <div className="num-tabular font-mono text-sm font-semibold text-navy">{value}</div>
      <div className="text-[10px] text-grey">{label}</div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center justify-between gap-2 text-micro text-grey">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-line bg-page px-1.5 py-1 text-micro text-navy outline-none focus:border-cyan-500"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export default MarketMap;
