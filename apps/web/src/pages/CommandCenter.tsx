import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar, RefreshCw, Layers, Globe, Boxes, Clock } from 'lucide-react';
import { fetchPortfolio, fetchForecast, type Portfolio, type Forecast, type DimensionSlice } from '@/lib/api/intel';
import { fetchSlos, fmtSlo, type SloReport } from '@/lib/api/slo';
import { EmptyState, CardSkeleton } from '@/components/shared';
import { Button, PageTitle } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Command Center (Wave 5) — the operational picture + the portfolio lens. Fuses
 * the desk's live numbers (forecast, open pipeline) with a hedge-fund view of
 * the targetable universe: expected value, how it diversifies across band /
 * region / category / timing, and where value concentrates. Every route links
 * to the surface that drills in.
 */

const BAND_TINT: Record<string, string> = {
  immediate: 'bg-emerald-500', high: 'bg-cyan-500', nurture: 'bg-amber-500', watch: 'bg-grey/60', archive: 'bg-grey/30',
  hot: 'bg-amber-500', warming: 'bg-cyan-500', quiet: 'bg-grey/50',
};

export function CommandCenter() {
  const navigate = useNavigate();
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [slo, setSlo] = useState<SloReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setPf(null);
    setFc(null);
    setSlo(null);
    fetchPortfolio().then(setPf).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    fetchForecast().then(setFc).catch(() => setFc(null));
    fetchSlos().then(setSlo).catch(() => setSlo(null));
  }, []);
  useEffect(load, [load]);

  const concentrated = pf ? pf.concentration.top20Share >= 60 : false;

  return (
    <div className="p-5">
      <PageTitle
        icon={<Radar size={20} />}
        subtitle="The operational picture — the pipeline and the targetable universe as one portfolio."
        actions={<Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>}
      >
        Command Center
      </PageTitle>

      {error ? (
        <EmptyState variant="error" title="Command view unavailable" description={error} />
      ) : !pf ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="space-y-4">
          {/* SLO error-budget banner (Phase 4.3) — management by exception. */}
          {slo && (slo.anyBreach || slo.anyWarn) && (
            <button
              onClick={() => navigate('/ops')}
              className={clsx(
                'flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left',
                slo.anyBreach ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10',
              )}
            >
              <AlertTriangle size={15} className={clsx('mt-0.5 shrink-0', slo.anyBreach ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')} />
              <span className="text-label">
                <span className="font-semibold text-navy">
                  {slo.anyBreach ? 'Error budget breached' : 'Error budget at risk'} —{' '}
                </span>
                <span className="text-grey-dark">
                  {slo.slos.filter((s) => s.status === 'breach' || s.status === 'warn')
                    .map((s) => `${s.label} ${fmtSlo(s.current, s.unit)}/${fmtSlo(s.target, s.unit)}`)
                    .join(' · ')}. Open Ops Health →
                </span>
              </span>
            </button>
          )}

          {/* Operational picture strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Targetable universe" value={pf.totalTargets.toLocaleString()} onClick={() => navigate('/targets')} />
            <Tile label="Universe EV" value={formatMoney(pf.totalEvUsd)} accent />
            <Tile label="Avg conviction" value={String(pf.avgConviction)} />
            <Tile label="Open pipeline" value={formatMoney(pf.pipeline.openValueUsd)} onClick={() => navigate('/deal-board')} />
            <Tile label="Forecast (P50)" value={fc ? formatMoney(fc.p50) : '—'} onClick={() => navigate('/forecast')} />
            <Tile label="Top-20 concentration" value={`${pf.concentration.top20Share}%`} tone={concentrated ? 'warn' : undefined} />
          </div>

          {/* Concentration read */}
          <div className="rounded-lg border border-line bg-card p-3 text-label text-grey shadow-card">
            <span className="font-semibold text-navy">Portfolio read:</span>{' '}
            {concentrated
              ? `Concentrated — the top 20 targets hold ${pf.concentration.top20Share}% of universe EV (${formatMoney(pf.concentration.top20EvUsd)}). Diversify beyond the headline names.`
              : `Reasonably diversified — the top 20 targets are ${pf.concentration.top20Share}% of universe EV. Breadth is healthy.`}
          </div>

          {/* Composition */}
          <div className="grid gap-4 lg:grid-cols-2">
            <DimensionCard title="By band" icon={<Layers size={13} />} slices={pf.byBand} total={pf.totalEvUsd} />
            <DimensionCard title="By region" icon={<Globe size={13} />} slices={pf.byRegion} total={pf.totalEvUsd} />
            <DimensionCard title="By category" icon={<Boxes size={13} />} slices={pf.byCategory} total={pf.totalEvUsd} />
            <DimensionCard title="By timing window" icon={<Clock size={13} />} slices={pf.byTiming} total={pf.totalEvUsd} />
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent, tone, onClick }: { label: string; value: string; accent?: boolean; tone?: 'warn'; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`rounded-lg border border-line bg-card p-3 text-left shadow-card ${onClick ? 'transition-colors hover:border-cyan-400' : ''}`}
    >
      <div className="text-[9px] font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className={`num-tabular mt-0.5 text-lg font-bold ${accent ? 'text-cyan-700 dark:text-cyan-300' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-navy'}`}>{value}</div>
    </Comp>
  );
}

function DimensionCard({ title, icon, slices, total }: { title: string; icon: React.ReactNode; slices: DimensionSlice[]; total: number }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        {icon} {title}
      </div>
      {slices.length === 0 ? (
        <p className="text-micro text-grey">No data.</p>
      ) : (
        <div className="space-y-1.5">
          {slices.map((s) => {
            const share = total > 0 ? Math.round((s.evUsd / total) * 100) : 0;
            return (
              <div key={s.key} className="flex items-center gap-2 text-label">
                <span className="w-24 shrink-0 truncate capitalize text-navy" title={s.key}>{s.key}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <span className={`block h-full ${BAND_TINT[s.key.toLowerCase()] ?? 'bg-cyan-500/70'}`} style={{ width: `${share}%` }} />
                </span>
                <span className="num-tabular w-10 shrink-0 text-right text-grey">{share}%</span>
                <span className="num-tabular w-16 shrink-0 text-right font-semibold text-navy">{formatMoney(s.evUsd)}</span>
                <span className="num-tabular hidden w-12 shrink-0 text-right text-grey sm:inline">{s.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CommandCenter;
