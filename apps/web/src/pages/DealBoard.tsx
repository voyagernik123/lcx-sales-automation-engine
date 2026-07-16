import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, KanbanSquare, Plus, RefreshCw, XCircle } from 'lucide-react';
import { STAGES, STAGE_LABELS, canTransition, type DealStage } from '@lcx/shared';
import { fetchDealBoard, transitionDealStage, type BoardDeal } from '@/lib/api/bd';
import { loadDealContexts, saveDealPlaybook, type LoadedDealContext, type PlaybookKey } from '@/lib/api/deals100x';
import { computeDealHealthSet, computePipelinePulse, type WarningCode } from '@/lib/salesIntel';
import { useInspect } from '@/stores';
import { toast } from '@/components/shared/Toast';
import { CardSkeleton } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';
import { DealCard } from '@/components/deals/DealCard';
import { PipelinePulseHeader } from '@/components/deals/PipelinePulseHeader';
import { WinLossModal } from '@/components/deals/WinLossModal';
import { ScenarioValue, SimPill } from '@/components/deals/ScenarioControls';
import { WARNING_SHORT_LABEL } from '@/components/deals/warningDisplay';

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

const WARNING_CODES: WarningCode[] = ['ghosted', 'stalled', 'overdue_close', 'no_next_step', 'telegram_silent', 'single_threaded'];

function columnClass(stage: DealStage, isDropTarget: boolean, dimmed: boolean): string {
  const base = 'flex w-64 shrink-0 flex-col rounded-xl border p-2 transition-colors';
  const tint =
    stage === 'won'
      ? 'border-emerald-500/40 bg-emerald-500/5'
      : stage === 'lost'
        ? 'border-red-500/40 bg-red-500/5'
        : 'border-line/70 bg-ice-soft/60 dark:bg-ice-soft/5';
  const drop = isDropTarget ? 'ring-2 ring-sky-400 bg-sky-500/10 dark:bg-sky-500/10' : '';
  const dim = dimmed ? 'opacity-50' : '';
  return `${base} ${tint} ${drop} ${dim}`;
}

export function DealBoard() {
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [contexts, setContexts] = useState<Record<string, LoadedDealContext>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<BoardDeal | null>(null);
  const [dropTarget, setDropTarget] = useState<DealStage | null>(null);
  const [pendingClose, setPendingClose] = useState<{ deal: BoardDeal; target: 'won' | 'lost' } | null>(null);
  const inspect = useInspect();

  /** Open the deal inspector seeded with what the board already fetched, so
   *  the why-panel renders instantly and survives API rate-limit hiccups. */
  const inspectDeal = useCallback(
    (id: string, allDeals: BoardDeal[], ctxs: Record<string, LoadedDealContext>) => {
      const ctx = ctxs[id];
      inspect('deal', id, {
        board: allDeals,
        events: ctx?.events,
        playbookDone: ctx?.playbookDone,
        playbookSource: ctx?.playbookSource,
      });
    },
    [inspect],
  );

  // Warning/stage filter — deep-linkable (?warning=ghosted&stage=proposal from
  // the Deal Desk heatmap) and driven by the pulse header chips.
  const [searchParams, setSearchParams] = useSearchParams();
  const warningParam = searchParams.get('warning');
  const warningFilter: WarningCode | null = WARNING_CODES.includes(warningParam as WarningCode)
    ? (warningParam as WarningCode)
    : null;
  const stageParam = searchParams.get('stage');
  const stageFilter: DealStage | null = STAGES.includes(stageParam as DealStage) ? (stageParam as DealStage) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchDealBoard();
      setDeals(next);
      // Per-deal context (events + playbook) is best-effort and arrives after
      // the board paints — health upgrades in place when it lands.
      const ctx = await loadDealContexts(next);
      setContexts(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const health = useMemo(() => computeDealHealthSet(deals, contexts), [deals, contexts]);
  const pulse = useMemo(() => computePipelinePulse(deals, health), [deals, health]);

  const byStage = useMemo(() => {
    const map = new Map<DealStage, BoardDeal[]>(STAGES.map((s) => [s, []]));
    for (const d of deals) map.get(d.stage as DealStage)?.push(d);
    return map;
  }, [deals]);

  const matchesFilter = useCallback(
    (d: BoardDeal): boolean => {
      if (stageFilter && d.stage !== stageFilter) return false;
      if (warningFilter) {
        const h = health.get(d.id);
        if (!h?.warnings.some((w) => w.code === warningFilter)) return false;
      }
      return true;
    },
    [warningFilter, stageFilter, health],
  );

  const toggleWarningFilter = (code: WarningCode) => {
    const next = new URLSearchParams(searchParams);
    if (warningFilter === code) {
      next.delete('warning');
      next.delete('stage');
    } else {
      next.set('warning', code);
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('warning');
    next.delete('stage');
    setSearchParams(next, { replace: true });
  };

  /** Toggle a playbook step: optimistic, PATCH w/ localStorage fallback, health recomputes. */
  const togglePlaybook = useCallback(
    async (dealId: string, key: PlaybookKey) => {
      const prev = contexts[dealId]?.playbookDone ?? [];
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      setContexts((c) => ({
        ...c,
        [dealId]: { ...(c[dealId] ?? { playbookSource: 'local' as const }), playbookDone: next },
      }));
      const saved = await saveDealPlaybook(dealId, next);
      setContexts((c) => ({
        ...c,
        [dealId]: { ...(c[dealId] ?? {}), playbookDone: saved.done, playbookSource: saved.source },
      }));
    },
    [contexts],
  );

  const applyTransition = async (
    deal: BoardDeal,
    target: DealStage,
    body: { stage: string; winReason?: string; lossReason?: string; lossCategory?: string },
  ) => {
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

  const handleDrop = async (target: DealStage) => {
    const deal = dragging;
    setDragging(null);
    setDropTarget(null);
    if (!deal || deal.stage === target) return;
    if (!canTransition(deal.stage as DealStage, target)) {
      toast('error', `Can't move ${STAGE_LABELS[deal.stage as DealStage]} → ${STAGE_LABELS[target]}`);
      return;
    }

    if (target === 'won' || target === 'lost') {
      // Proper capture dialog instead of window.prompt.
      setPendingClose({ deal, target });
      return;
    }
    await applyTransition(deal, target, { stage: target });
  };

  return (
    <div className="space-y-4 p-4">
      <PageTitle
        icon={<KanbanSquare size={20} />}
        subtitle={!loading && deals.length > 0 ? 'Health, likelihood, momentum and playbook on every card — click any judgment for its why.' : undefined}
        actions={
          <div className="flex items-center gap-2">
            <SimPill />
            <Button variant="secondary" size="xs" onClick={() => void load()}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} /> Refresh
            </Button>
          </div>
        }
      >
        Deal Board
      </PageTitle>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-label text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && deals.length > 0 && (
        <PipelinePulseHeader pulse={pulse} activeWarning={warningFilter} onToggleWarning={toggleWarningFilter} />
      )}

      {(warningFilter || stageFilter) && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-status-conditional/40 bg-status-conditional-bg px-3 py-1.5 text-label text-status-conditional">
          <span>
            Filtered to deals
            {warningFilter ? ` warned “${WARNING_SHORT_LABEL[warningFilter]}”` : ''}
            {stageFilter ? ` in ${STAGE_LABELS[stageFilter]}` : ''} — {deals.filter(matchesFilter).length} match
            {deals.filter(matchesFilter).length === 1 ? '' : 'es'}.
          </span>
          <button onClick={clearFilters} className="shrink-0 font-bold hover:underline">
            Clear
          </button>
        </div>
      )}

      {loading && deals.length === 0 ? (
        <CardSkeleton count={8} />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const cards = (byStage.get(stage) ?? []).filter(matchesFilter);
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
                <div className="mb-2 flex items-center justify-between gap-2 px-1 pt-0.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-micro font-bold uppercase tracking-wide text-navy">
                    {stage === 'won' ? (
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-500" aria-label="Won" />
                    ) : stage === 'lost' ? (
                      <XCircle size={13} className="shrink-0 text-red-500" aria-label="Lost" />
                    ) : (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[stage]}`} aria-hidden="true" />
                    )}
                    <span className="truncate">{STAGE_LABELS[stage]}</span>
                  </span>
                  <span className="num-tabular flex shrink-0 items-baseline gap-1.5 text-micro text-grey">
                    <span className="font-semibold">{cards.length}</span>
                    {totalValue > 0 && (
                      <>
                        <span className="text-grey/60" aria-hidden="true">·</span>
                        <ScenarioValue cents={totalValue} className="font-mono" />
                      </>
                    )}
                  </span>
                </div>

                <div className="min-h-[80px] space-y-2">
                  {cards.map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      health={health.get(d.id)}
                      events={contexts[d.id]?.events}
                      playbookLocal={contexts[d.id]?.playbookSource === 'local'}
                      onTogglePlaybook={(key) => void togglePlaybook(d.id, key)}
                      onWhy={() => inspectDeal(d.id, deals, contexts)}
                      onDragStart={() => setDragging(d)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      onClick={() => inspectDeal(d.id, deals, contexts)}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line p-4 text-center text-micro text-grey">
                      <Plus size={14} aria-hidden="true" />
                      {warningFilter || stageFilter ? 'No matches here' : 'Drop deals here'}
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

      {pendingClose && (
        <WinLossModal
          mode={pendingClose.target}
          dealName={pendingClose.deal.projectName}
          onCancel={() => setPendingClose(null)}
          onConfirm={({ reason, category }) => {
            const { deal, target } = pendingClose;
            setPendingClose(null);
            void applyTransition(deal, target, {
              stage: target,
              ...(target === 'won' ? { winReason: reason } : { lossReason: reason, lossCategory: category }),
            });
          }}
        />
      )}
    </div>
  );
}
