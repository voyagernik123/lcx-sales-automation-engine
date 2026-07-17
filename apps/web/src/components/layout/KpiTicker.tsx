import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDealBoard, fetchHandoffs } from '@/lib/api/bd';
import { formatMoney } from '@/lib/format';
import { useSalesScenarioStore, useScenarioActive } from '@/stores';

interface TickerItem {
  text: string;
  to: string;
}

/**
 * Ambient KPI ticker for the TopNav — the Bloomberg strip, sized for an
 * internal tool: a few live pipeline facts cycling every 6s, each clickable.
 * Fetches once on mount + every 5 minutes; renders nothing until data lands
 * (the confidential tagline holds the space).
 */
export function KpiTicker() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TickerItem[]>([]);
  const [index, setIndex] = useState(0);
  const scenarioActive = useScenarioActive();
  const resetScenario = useSalesScenarioStore(s => s.reset);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [board, handoffs] = await Promise.allSettled([
        fetchDealBoard(),
        fetchHandoffs({ status: 'open,in_progress', limit: 1 }),
      ]);
      if (cancelled) return;
      const next: TickerItem[] = [];
      if (board.status === 'fulfilled') {
        const open = board.value.filter(d => d.stage !== 'won' && d.stage !== 'lost');
        const value = open.reduce((s, d) => s + (d.packageValue ?? 0), 0);
        next.push({ text: `PIPELINE ${formatMoney(Math.round(value / 100))} · ${open.length} DEALS`, to: '/deal-board' });
        const stale = open.filter(d => d.daysSinceUpdate >= 7).length;
        if (stale > 0) next.push({ text: `${stale} DEAL${stale === 1 ? '' : 'S'} GOING QUIET`, to: '/deal-board' });
      }
      if (handoffs.status === 'fulfilled' && handoffs.value.meta.total > 0) {
        next.push({ text: `${handoffs.value.meta.total} REPLIES WAITING`, to: '/outreach' });
      }
      setItems(next);
    };
    void load();
    const interval = setInterval(() => void load(), 300_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIndex(i => (i + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [items.length]);

  return (
    <div className="flex items-center gap-3">
      {scenarioActive && (
        <button
          onClick={resetScenario}
          title="A what-if scenario is active — numbers are simulated. Click to reset."
          className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-px font-mono text-[10px] font-bold tracking-wider text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:text-cyan-300"
        >
          <span className="h-1.5 w-1.5 animate-pulse-beacon rounded-full bg-cyan-500" />
          SIM
        </button>
      )}
      {items.length > 0 && (
        <button
          key={index}
          onClick={() => navigate(items[index].to)}
          className="animate-fadeIn font-mono text-[10px] font-medium tracking-wide text-grey transition-colors hover:text-navy"
        >
          {items[index].text}
        </button>
      )}
    </div>
  );
}
