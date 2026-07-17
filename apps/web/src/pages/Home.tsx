import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useOperatorStore } from '@/stores';
import { fetchHandoffs, fetchDealBoard, type BoardDeal } from '@/lib/api/bd';
import {
  fetchOpsFeed,
  fetchQueuePulse,
  fetchForecastDelta,
  readTodaySessionStats,
  syncDayHistory,
  computeStreak,
  type OpsFeedLine,
  type QueuePulse,
  type ForecastDelta,
} from '@/lib/api/loop';
import { computeDealHealthSet, type DealHealth } from '@/lib/salesIntel';
import { useLastSeen } from '@/lib/useLastSeen';
import { StatCard, ChartCard } from '@/components/charts';
import { CardSkeleton } from '@/components/shared';
import { PageTitle } from '@/components/ui';
import {
  QuotaRing,
  LiveOpsFeed,
  OvernightHandoffs,
  AtRiskDeals,
  FocusSuggestion,
  ForecastDeltaCard,
} from '@/components/home';
import type { HandoffRecord } from '@/types/bd';

const DAILY_QUOTA = 20;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home → the Morning Brief (plan 1.6/1.7 + 5.4). Still greets whoever is
 * driving, but instead of four static tiles it answers the actual morning
 * questions: what came in overnight, what's at risk, how deep is the queue,
 * did the forecast move, what should I focus on — plus the personal quota
 * ring/streak and a live ops terminal streaming the real audit record.
 * Every entity shown opens the inspector in place; nothing dead-ends.
 */
export function Home() {
  const operator = useOperatorStore(s => s.operator);
  const navigate = useNavigate();
  const lastSeen = useLastSeen('home');

  const [handoffs, setHandoffs] = useState<HandoffRecord[] | null>(null);
  const [board, setBoard] = useState<BoardDeal[] | null>(null);
  const [pulse, setPulse] = useState<QueuePulse | null>(null);
  const [forecast, setForecast] = useState<ForecastDelta | null | 'unavailable'>(null);
  const [ops, setOps] = useState<OpsFeedLine[]>([]);
  const [opsLoading, setOpsLoading] = useState(true);

  // Local contracts (session stats may be absent — everything degrades).
  const stats = useMemo(() => readTodaySessionStats(), []);
  const streak = useMemo(() => computeStreak(syncDayHistory()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ho, bd, qp, fc, feed] = await Promise.allSettled([
        fetchHandoffs({ status: 'open,in_progress', limit: 100 }),
        fetchDealBoard(),
        fetchQueuePulse(),
        fetchForecastDelta(),
        fetchOpsFeed(30),
      ]);
      if (cancelled) return;
      setHandoffs(ho.status === 'fulfilled' ? ho.value.data : []);
      setBoard(bd.status === 'fulfilled' ? bd.value : []);
      setPulse(qp.status === 'fulfilled' ? qp.value : { immediate: null, high: null, followUpsDue: null });
      setForecast(fc.status === 'fulfilled' && fc.value ? fc.value : 'unavailable');
      setOps(feed.status === 'fulfilled' ? feed.value : []);
      setOpsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const health: Map<string, DealHealth> = useMemo(
    () => (board ? computeDealHealthSet(board) : new Map()),
    [board],
  );

  const name = operator?.name ?? 'there';
  const accent = operator?.colorVar ?? 'var(--chart-1)';
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const openHandoffCount = handoffs?.filter(h => h.status === 'open').length ?? 0;

  return (
    <div className="mx-auto max-w-[1200px] p-5">
      <PageTitle
        className="mb-5"
        icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />}
        subtitle={`Desk brief — ${today}`}
        actions={
          <button
            onClick={() => navigate('/select')}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-micro font-semibold text-grey hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10 transition-colors"
          >
            <LogOut size={11} />
            Switch identity
          </button>
        }
      >
        {greeting()}, {name}
      </PageTitle>

      {/* Queue pulse — counted streams that navigate. */}
      {pulse ? (
        <div className="mb-6 grid grid-cols-2 items-stretch gap-4 sm:grid-cols-4">
          <StatCard
            label="Immediate leads"
            value={pulse.immediate === null ? '—' : String(pulse.immediate)}
            onClick={() => navigate('/bd-pipeline')}
          />
          <StatCard
            label="High-priority leads"
            value={pulse.high === null ? '—' : String(pulse.high)}
            onClick={() => navigate('/bd-pipeline')}
          />
          <StatCard
            label="Follow-ups due"
            value={pulse.followUpsDue === null ? '—' : String(pulse.followUpsDue)}
            deltaLabel="overdue + today"
            onClick={() => navigate('/tasks')}
          />
          <StatCard
            label="Replies waiting"
            value={handoffs === null ? '—' : String(openHandoffCount)}
            deltaLabel="pause automation"
            onClick={() => navigate('/outreach')}
          />
        </div>
      ) : (
        <div className="mb-6">
          <CardSkeleton count={4} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ChartCard
            title="Overnight & waiting"
            subtitle="Open replies ranked worst SLA first — a breach means automation has been paused for hours"
          >
            {handoffs === null ? <CardSkeleton count={3} /> : <OvernightHandoffs handoffs={handoffs.filter(h => h.status === 'open' || h.status === 'in_progress')} isNew={lastSeen.isNew} />}
          </ChartCard>

          <ChartCard title="At risk" subtitle="Open deals carrying the most health warnings — click through for the full why-trail">
            {board === null ? <CardSkeleton count={2} /> : <AtRiskDeals deals={board} health={health} isNew={lastSeen.isNew} />}
          </ChartCard>

          <ChartCard title="Focus suggestion" subtitle="One deal — the most value going quiet">
            {board === null ? <CardSkeleton count={1} /> : <FocusSuggestion deals={board} health={health} />}
          </ChartCard>

          <ChartCard title="Forecast delta" subtitle="Latest daily snapshot vs the previous one">
            {forecast === null ? (
              <CardSkeleton count={1} />
            ) : forecast === 'unavailable' ? (
              <p className="text-label text-grey">
                No KPI snapshots yet — the nightly snapshot job populates this after its first run.
              </p>
            ) : (
              <ForecastDeltaCard forecast={forecast} />
            )}
          </ChartCard>
        </div>

        <div className="space-y-4">
          <ChartCard
            title="Your day"
            subtitle={`Quota: ${DAILY_QUOTA} prospects worked`}
            action={
              <button
                type="button"
                onClick={() => navigate('/bd-pipeline')}
                className="text-micro font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
              >
                Work the queue →
              </button>
            }
          >
            <QuotaRing stats={stats} target={DAILY_QUOTA} streak={streak} />
          </ChartCard>

          <LiveOpsFeed lines={ops} loading={opsLoading} />
        </div>
      </div>
    </div>
  );
}

export default Home;
