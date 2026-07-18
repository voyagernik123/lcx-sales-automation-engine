import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, RefreshCw, AlertTriangle, Crosshair, TrendingUp, Clock } from 'lucide-react';
import { fetchBrief, type DailyBrief as Brief } from '@/lib/api/intel';
import { EmptyState, CardSkeleton } from '@/components/shared';
import { Button, PageTitle } from '@/components/ui';
import { EntityChip } from '@/components/entity';
import { formatMoney, formatPct } from '@/lib/format';

/**
 * The Daily Intelligence Brief — the desk's morning read. Pulse, today's
 * Indications & Warning, ripe targets to chase, market movers, and deals at
 * risk, all assembled from the intelligence spine.
 */

const WINDOW_STYLE: Record<string, string> = {
  hot: 'text-amber-600 dark:text-amber-400', warming: 'text-cyan-600 dark:text-cyan-400', quiet: 'text-grey',
};

export function DailyBrief() {
  const navigate = useNavigate();
  const [b, setB] = useState<Brief | null | 'loading' | 'error'>('loading');

  const load = () => {
    setB('loading');
    fetchBrief().then(setB).catch(() => setB('error'));
  };
  useEffect(load, []);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="p-5">
      <PageTitle
        icon={<Newspaper size={20} />}
        subtitle={`${today} · the state of the desk`}
        actions={<Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Refresh</Button>}
      >
        Daily Brief
      </PageTitle>

      {b === 'loading' ? (
        <CardSkeleton count={4} />
      ) : b === 'error' || !b ? (
        <EmptyState variant="error" title="Brief unavailable" description="Could not assemble today's brief." />
      ) : (
        <div className="space-y-4">
          {/* Pulse */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Pulse label="Open pipeline" value={formatMoney(b.pulse.openPipelineUsd)} />
            <Pulse label="Open deals" value={String(b.pulse.openDeals)} />
            <Pulse label="Ripe targets" value={String(b.pulse.targetsRipe)} accent />
            <Pulse label="Indications" value={String(b.pulse.indications)} warn={b.pulse.indications > 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Indications & Warning */}
            <Card title="Indications & Warning" icon={<AlertTriangle size={13} className="text-amber-500" />}>
              {b.indications.length === 0 ? (
                <Empty>No active indications.</Empty>
              ) : (
                b.indications.map((ind) => (
                  <div key={`${ind.projectId}:${ind.type}`} className="flex items-center gap-2 py-1 text-label">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ind.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <EntityChip type="project" id={ind.projectId} name={ind.name} meta={ind.ticker} />
                    <span className="truncate text-grey">{ind.message}</span>
                  </div>
                ))
              )}
            </Card>

            {/* Ripe targets */}
            <Card title="Chase these now" icon={<Crosshair size={13} className="text-cyan-500" />} action={{ label: 'All targets →', onClick: () => navigate('/targets') }}>
              {b.targets.length === 0 ? (
                <Empty>No ranked targets yet.</Empty>
              ) : (
                b.targets.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2 py-1 text-label">
                    <span className="w-4 shrink-0 font-mono text-grey">{i + 1}</span>
                    <EntityChip type="project" id={t.id} name={t.name} meta={t.ticker} />
                    {t.timingWindow && <span className={`font-mono text-[9px] uppercase ${WINDOW_STYLE[t.timingWindow]}`}>{t.timingWindow}</span>}
                    <span className="num-tabular ml-auto shrink-0 font-semibold text-navy">{t.conviction}</span>
                    <span className="num-tabular w-16 shrink-0 text-right text-grey">{t.dealValueUsd ? formatMoney(t.dealValueUsd) : '—'}</span>
                  </div>
                ))
              )}
            </Card>

            {/* Movers */}
            <Card title="Market movers (30d)" icon={<TrendingUp size={13} className="text-emerald-500" />}>
              {b.movers.length === 0 ? (
                <Empty>No movers.</Empty>
              ) : (
                b.movers.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1 text-label">
                    <EntityChip type="project" id={m.id} name={m.name} meta={m.ticker} />
                    <span className="num-tabular ml-auto shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">{formatPct(m.priceChange30d)}</span>
                    <span className="num-tabular w-16 shrink-0 text-right text-grey">{m.competitorCount} rivals</span>
                  </div>
                ))
              )}
            </Card>

            {/* Deals at risk */}
            <Card title="Deals at risk" icon={<Clock size={13} className="text-red-500" />}>
              {b.dealsAtRisk.length === 0 ? (
                <Empty>No stalled deals — all moving.</Empty>
              ) : (
                b.dealsAtRisk.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 py-1 text-label">
                    <EntityChip type="project" id={d.projectId} name={d.name} />
                    <span className="font-mono text-micro uppercase text-grey">{d.stage}</span>
                    <span className="num-tabular ml-auto shrink-0 font-semibold text-red-600 dark:text-red-400">{d.daysStale}d stale</span>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Pulse({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3 shadow-card">
      <div className="text-micro font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className={`num-tabular mt-0.5 text-xl font-bold ${accent ? 'text-cyan-700 dark:text-cyan-300' : warn ? 'text-amber-600 dark:text-amber-400' : 'text-navy'}`}>{value}</div>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">{icon}{title}</span>
        {action && (
          <button onClick={action.onClick} className="ml-auto text-micro font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
            {action.label}
          </button>
        )}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-micro text-grey">{children}</p>;
}

export default DailyBrief;
