import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, HelpCircle, KanbanSquare, Plus, RefreshCw, XCircle } from 'lucide-react';
import { STAGES, STAGE_LABELS, canTransition, type DealStage } from '@lcx/shared';
import { fetchDealBoard, type BoardDeal } from '@/lib/api/bd';
import { transitionDealWithGate } from '@/lib/dealGate';
import { loadDealContexts, saveDealPlaybook, type LoadedDealContext, type PlaybookKey } from '@/lib/api/deals100x';
import { computeDealHealthSet, computePipelinePulse, type WarningCode } from '@/lib/salesIntel';
import { useInspect, useOperatorStore, hasRole } from '@/stores';
import { toast } from '@/components/shared/Toast';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { classifyError } from '@/lib/errors';
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
  const operator = useOperatorStore(s => s.operator);

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
      const ok = await transitionDealWithGate(deal.id, body);
      if (ok) toast('success', `Deal advanced to ${STAGE_LABELS[target]} — ${deal.projectName}`);
    } catch (err) {
      const c = classifyError(err);
      toast('error', `${c.title} — ${c.message}`);
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
      // Closing a deal is an approver-gated decision (plan 5.2). Non-approvers
      // see why, not a silent no-op.
      if (!hasRole(operator, 'approver')) {
        toast('error', `Closing a deal is an approver action — ${operator?.name ?? 'you'} is an operator. Ask Nik or Monty to sign off.`);
        return;
      }
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
            <BoardLegend />
            <Button variant="secondary" size="xs" onClick={() => void load()}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : undefined} /> Refresh
            </Button>
          </div>
        }
      >
        Deal Board
      </PageTitle>

      {error && <ErrorNotice compact error={error} onRetry={() => void load()} />}

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
            // Empty stages collapse to rails at rest (plan Part 6); any active
            // drag expands everything so every legal drop target is available.
            const collapsed = cards.length === 0 && !dragging && !warningFilter && !stageFilter;
            if (collapsed) {
              return (
                <div
                  key={stage}
                  className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl border border-line/50 bg-ice-soft/40 px-1 py-2.5 dark:bg-ice-soft/[0.03]"
                  title={`${STAGE_LABELS[stage]} — empty`}
                >
                  {stage === 'won' ? (
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-500" aria-label="Won" />
                  ) : stage === 'lost' ? (
                    <XCircle size={13} className="shrink-0 text-red-500" aria-label="Lost" />
                  ) : (
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[stage]}`} aria-hidden="true" />
                  )}
                  <span className="rotate-180 text-micro font-bold uppercase tracking-wide text-grey [writing-mode:vertical-rl]">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="num-tabular mt-auto font-mono text-micro text-grey">0</span>
                </div>
              );
            }
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
                      {warningFilter || stageFilter ? 'No matches here' : 'Drop here'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

/* ── Board legend — every code earns a disclosure (plan 4.3) ────────── */

const LEGEND_CARD: Array<[string, string]> = [
  ['● 62nd', 'Likelihood percentile among open deals — dot color is the band; click any pill for its signal trail'],
  ['▲ = ▼ ×', 'Momentum: accelerating · steady · cooling · cold (events last 7d vs prior 7d)'],
  ['2 ⚠', 'Active health warnings — hover for the list, click for evidence and mitigations'],
  ['T K L C O', 'Listing playbook: Tokenomics review · KYB / entity check · Legal opinion · Compliance greenlight · Offer sent'],
  ['O · 3d · P86', 'Owner initial · days in current stage · priority score of the underlying project'],
];

const LEGEND_RULES: string[] = [
  'Drag a card forward to advance it — skipping stages is allowed, moving backwards is not.',
  'Won and Lost both ask for a reason; closed decisions re-weight open-deal likelihood.',
  'A win auto-creates the 30/60/90 post-listing triggers.',
];

function BoardLegend() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Board legend"
        title="What the codes mean"
        className="rounded-md p-1.5 text-grey transition-colors hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-lg border border-line bg-card p-3.5 shadow-overlay">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-grey">Reading a card</div>
          <div className="mt-2 space-y-2">
            {LEGEND_CARD.map(([code, meaning]) => (
              <div key={code} className="flex items-start gap-2.5">
                <span className="num-tabular w-16 shrink-0 font-mono text-micro font-bold text-navy">{code}</span>
                <span className="text-micro leading-relaxed text-grey">{meaning}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line/70 pt-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-grey">
            Board rules
          </div>
          <ul className="mt-1.5 space-y-1">
            {LEGEND_RULES.map(r => (
              <li key={r} className="text-micro leading-relaxed text-grey">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
