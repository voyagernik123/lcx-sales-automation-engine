import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KanbanSquare, RefreshCw } from 'lucide-react';
import { STAGES, STAGE_LABELS, canTransition, type DealStage } from '@lcx/shared';
import { fetchDealBoard, transitionDealStage, type BoardDeal } from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';

function fmtValue(cents: number | null): string {
  if (cents == null || cents === 0) return '—';
  return `$${(cents / 100).toLocaleString()}`;
}

const STAGE_COLORS: Record<DealStage, string> = {
  not_started: 'border-slate-300',
  contacted: 'border-sky-400',
  discovery: 'border-cyan-500',
  proposal: 'border-violet-500',
  negotiating: 'border-amber-500',
  won: 'border-emerald-500',
  lost: 'border-red-400',
};

export function DealBoard() {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<BoardDeal | null>(null);
  const [dropTarget, setDropTarget] = useState<DealStage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDeals(await fetchDealBoard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStage = useMemo(() => {
    const map = new Map<DealStage, BoardDeal[]>(STAGES.map((s) => [s, []]));
    for (const d of deals) map.get(d.stage as DealStage)?.push(d);
    return map;
  }, [deals]);

  const handleDrop = async (target: DealStage) => {
    const deal = dragging;
    setDragging(null);
    setDropTarget(null);
    if (!deal || deal.stage === target) return;
    if (!canTransition(deal.stage as DealStage, target)) {
      toast('error', `Can't move ${STAGE_LABELS[deal.stage as DealStage]} → ${STAGE_LABELS[target]}`);
      return;
    }

    const body: { stage: string; winReason?: string; lossReason?: string } = { stage: target };
    if (target === 'won') {
      const reason = window.prompt('Win reason (required):');
      if (!reason?.trim()) return;
      body.winReason = reason.trim();
    }
    if (target === 'lost') {
      const reason = window.prompt('Loss reason (required):');
      if (!reason?.trim()) return;
      body.lossReason = reason.trim();
    }

    // Optimistic move, reload on settle
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage: target } : d)));
    try {
      await transitionDealStage(deal.id, body);
      toast('success', `${deal.projectName} → ${STAGE_LABELS[target]}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Transition failed');
    } finally {
      void load();
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <KanbanSquare size={18} /> Deal Board
        </h1>
        <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {loading && deals.length === 0 && <p className="py-8 text-center text-[12px] text-grey">Loading board…</p>}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const cards = byStage.get(stage) ?? [];
          const totalValue = cards.reduce((s, d) => s + (d.packageValue ?? 0), 0);
          const validTarget = dragging && dragging.stage !== stage && canTransition(dragging.stage as DealStage, stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                if (validTarget) {
                  e.preventDefault();
                  setDropTarget(stage);
                }
              }}
              onDragLeave={() => setDropTarget((t) => (t === stage ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(stage);
              }}
              className={`w-60 shrink-0 rounded-lg border-t-4 ${STAGE_COLORS[stage]} bg-slate-50 dark:bg-slate-900/40 p-2 transition-colors ${
                dropTarget === stage ? 'ring-2 ring-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : ''
              } ${dragging && !validTarget && dragging.stage !== stage ? 'opacity-50' : ''}`}
            >
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wide">{STAGE_LABELS[stage]}</span>
                <span className="text-[10px] text-grey font-mono">
                  {cards.length}{totalValue > 0 && ` · ${fmtValue(totalValue)}`}
                </span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {cards.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => setDragging(d)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    onClick={() => navigate(`/bd-pipeline/${d.projectId}`)}
                    className="cursor-grab rounded border border-line bg-white dark:bg-slate-800 p-2 shadow-sm hover:shadow active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[12px] font-semibold leading-tight">{d.projectName}</span>
                      <span className="rounded bg-indigo-50 dark:bg-indigo-950/40 px-1 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 font-mono shrink-0">P{d.priorityScore}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-grey">
                      <span>{d.packageType ?? '—'} · {fmtValue(d.packageValue)}</span>
                      {d.stage !== 'won' && d.stage !== 'lost' && d.daysSinceUpdate >= 7 && (
                        <span className={`font-bold ${d.daysSinceUpdate >= 21 ? 'text-red-600' : 'text-amber-600'}`}>
                          {d.daysSinceUpdate}d stale
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <div className="rounded border border-dashed border-line/70 p-3 text-center text-[10px] text-grey">empty</div>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-grey">
        Drag a card to advance it. Skipping ahead is allowed; moving backwards isn't. Won/Lost ask for a reason —
        wins auto-create the 30/60/90 post-listing triggers.
      </p>
    </div>
  );
}
