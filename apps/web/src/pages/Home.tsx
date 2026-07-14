import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Send, KanbanSquare, MessageSquare, BarChart3, Layers, LogOut } from 'lucide-react';
import { useOperatorStore } from '@/stores';
import { useBdStore } from '@/stores/useBdStore';
import { fetchBdPipeline, fetchHandoffs, fetchDealBoard } from '@/lib/api/bd';
import { StatCard, ChartCard } from '@/components/charts';
import { CardSkeleton } from '@/components/shared';
import { PageTitle } from '@/components/ui';

interface HomeStats {
  immediateLeads: number;
  highLeads: number;
  openHandoffs: number;
  dealsInMotion: number;
  pipelineValue: number;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fmtUsd(cents: number): string {
  const n = cents / 100;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const QUICK_JUMPS = [
  { to: '/bd-pipeline', label: 'BD Engine', icon: Target, desc: 'The ranked queue' },
  { to: '/send-queue', label: 'Send Queue', icon: Send, desc: 'Assisted touches' },
  { to: '/deal-board', label: 'Deal Board', icon: KanbanSquare, desc: 'Kanban pipeline' },
  { to: '/outreach', label: 'Handoff Queue', icon: MessageSquare, desc: 'Replies to work' },
  { to: '/bd-kpis', label: 'KPI Dashboard', icon: BarChart3, desc: 'Funnel & forecast' },
  { to: '/exchange-gaps', label: 'Exchange Gaps', icon: Layers, desc: 'Proven budgets' },
];

/**
 * The app's front door once an operator has picked their name. Same
 * aggregate data for everyone today (no per-person attribution yet — deals
 * default owner:'operator' until real accounts land) but greets by name and
 * gives a fast on-ramp into the tool instead of dropping straight into a
 * dense table.
 */
export function Home() {
  const operator = useOperatorStore(s => s.operator);
  const navigate = useNavigate();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const defaultBdFilters = useBdStore(s => ({
    market: s.market, minScore: s.minScore, source: s.source, band: s.band,
    listedOnLcx: s.listedOnLcx, hasContact: s.hasContact,
    marketRecommendation: s.marketRecommendation, sort: s.sort, order: s.order, search: s.search,
  }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [immediate, high, handoffs, board] = await Promise.allSettled([
        fetchBdPipeline({ ...defaultBdFilters, band: 'immediate' }, { limit: 1 }),
        fetchBdPipeline({ ...defaultBdFilters, band: 'high' }, { limit: 1 }),
        fetchHandoffs({ status: 'open,in_progress', limit: 1 }),
        fetchDealBoard(),
      ]);
      if (cancelled) return;
      const open = board.status === 'fulfilled' ? board.value.filter(d => d.stage !== 'won' && d.stage !== 'lost') : [];
      setStats({
        immediateLeads: immediate.status === 'fulfilled' ? immediate.value.meta.total : 0,
        highLeads: high.status === 'fulfilled' ? high.value.meta.total : 0,
        openHandoffs: handoffs.status === 'fulfilled' ? handoffs.value.meta.total : 0,
        dealsInMotion: open.length,
        pipelineValue: open.reduce((sum, d) => sum + (d.packageValue ?? 0), 0),
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = operator?.name ?? 'there';
  const accent = operator?.colorVar ?? 'var(--chart-1)';

  return (
    <div className="p-4 max-w-[1100px] mx-auto">
      <PageTitle
        icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />}
        subtitle="Here's where things stand right now."
        actions={
          <button
            onClick={() => navigate('/select')}
            className="flex items-center gap-1.5 rounded border border-line px-2.5 py-1 text-micro font-bold text-grey hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors"
          >
            <LogOut size={11} />
            Switch identity
          </button>
        }
      >
        {greeting()}, {name}
      </PageTitle>

      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Immediate leads" value={String(stats.immediateLeads)} onClick={() => navigate('/bd-pipeline')} />
          <StatCard label="High-priority leads" value={String(stats.highLeads)} onClick={() => navigate('/bd-pipeline')} />
          <StatCard label="Open handoffs" value={String(stats.openHandoffs)} onClick={() => navigate('/outreach')} />
          <StatCard label="Deals in motion" value={`${stats.dealsInMotion} · ${fmtUsd(stats.pipelineValue)}`} onClick={() => navigate('/deal-board')} />
        </div>
      ) : (
        <div className="mb-6"><CardSkeleton count={4} /></div>
      )}

      <ChartCard title="Jump back in">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_JUMPS.map(({ to, label, icon: Icon, desc }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex flex-col items-start gap-2 rounded-lg border border-line p-3 text-left hover:border-cyan-300 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/10 transition-colors"
            >
              <Icon size={18} className="text-cyan-600 dark:text-cyan-400" />
              <span className="text-sm font-semibold text-navy dark:text-ice">{label}</span>
              <span className="text-micro text-grey">{desc}</span>
            </button>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

export default Home;
