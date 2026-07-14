import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KanbanSquare, Plus, RefreshCw, XCircle } from 'lucide-react';
import { STAGES, STAGE_LABELS, canTransition, type DealStage } from '@lcx/shared';
import { fetchDealBoard, transitionDealStage, type BoardDeal } from '@/lib/api/bd';
import { toast } from '@/components/shared/Toast';
import { CardSkeleton } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { DealCard } from '@/components/deals/DealCard';
import { DealDetailPanel } from '@/components/deals/DealDetailPanel';
import { fmtMoneyCents } from '@/components/deals/dealFormat';

/** Stage dot color for column headers (won/lost get icons instead). */
const STAGE_DOT: Record<DealStage, string> = {
  not_started: 'bg-slate-400',
  contacted: 'bg-sky-400',
  discovery: 'bg-cyan-500',
  proposal: 'bg-violet-500',
  negotiating: 'bg-amber-500',
  won: 'bg-emerald-500',
  lost: 'bg-red-400',
};

function columnClass(stage: DealStage, isDropTarget: boolean, dimmed: boolean): string {
  const base = 'flex w-64 shrink-0 flex-col rounded-xl border p-2 transition-colors';
  const tint =
    stage === 'won'
      ? 'border-emerald-500/40 bg-emerald-500/5'
      : stage === 'lost'
        ? 'border-red-500/40 bg-red-500/5'
        : 'border-line bg-ice-soft/60 dark:bg-ice-soft/5';
  const drop = isDropTarget ? 'ring-2 ring-sky-400 bg-sky-500/10 dark:bg-sky-500/10' : '';
  const dim = dimmed ? 'opacity-50' : '';
  return `${base} ${tint} ${drop} ${dim}`;
}

export function DealBoard() {
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<BoardDeal | null>(null);
  const [dropTarget, setDropTarget] = useState<DealStage | null>(null);
  const [selected, setSelected] = useState<BoardDeal | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchDealBoard();
      setDeals(next);
      // Keep the open panel in sync with fresh data.
      setSelected((prev) => (prev ? (next.find((d) => d.id === prev.id) ?? prev) : prev));
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

  const summary = useMemo(() => {
    const open = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
    const pipeline = open.reduce((s, d) => s + (d.packageValue ?? 0), 0);
    return { open: open.length, pipeline };
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
      toast('success', `Deal advanced to ${STAGE_LABELS[target]} — ${deal.projectName}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Transition failed');
    } finally {
      void load();
    }
  };

  return (
    <div className="space-y-4 p-4">
      <PageTitle
        icon={<KanbanSquare size={20} />}
        subtitle={
          !loading && deals.length > 0
            ? `${summary.open} open ${summary.open === 1 ? 'deal' : 'deals'} · ${fmtMoneyCents(summary.pipeline)} in pipeline`
            : undefined
        }
        actions={
          <Button variant="secondary" size="xs" onClick={() => void load()}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
        }
      >
        Deal Board
      </PageTitle>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-label text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && deals.length === 0 ? (
        <CardSkeleton count={8} />
      ) : (
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
                className={columnClass(stage, dropTarget === stage, Boolean(dragging && !validTarget && dragging.stage !== stage))}
              >
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-micro font-bold uppercase tracking-wide text-navy">
                    {stage === 'won' ? (
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-500" aria-label="Won" />
                    ) : stage === 'lost' ? (
                      <XCircle size={13} className="shrink-0 text-red-500" aria-label="Lost" />
                    ) : (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[stage]}`} aria-hidden="true" />
                    )}
                    <span className="truncate">{STAGE_LABELS[stage]}</span>
                    <span className="shrink-0 rounded-full border border-line bg-card px-1.5 text-micro font-semibold text-grey">
                      {cards.length}
                    </span>
                  </span>
                  {totalValue > 0 && <span className="shrink-0 font-mono text-micro text-grey">{fmtMoneyCents(totalValue)}</span>}
                </div>

                <div className="min-h-[80px] space-y-2">
                  {cards.map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      onDragStart={() => setDragging(d)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      onClick={() => setSelected(d)}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line p-4 text-center text-micro text-grey">
                      <Plus size={14} aria-hidden="true" />
                      Drop deals here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-micro text-grey">
        Drag a card to advance it. Skipping ahead is allowed; moving backwards isn't. Won/Lost ask for a reason —
        wins auto-create the 30/60/90 post-listing triggers.
      </p>

      {selected && <DealDetailPanel deal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
