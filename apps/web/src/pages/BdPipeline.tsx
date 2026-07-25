import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore, useInspect } from '@/stores';
import { useBdStore } from '@/stores/useBdStore';
import { fetchBdPipeline, fetchHandoffs, fetchTasks, enrollProject, type OperatorTask } from '@/lib/api/bd';
import {
  disqualifyProject,
  fetchLeadRowsByIds,
  loadSnoozeMap,
  snoozeProject,
  unsnoozeProject,
  type QueueLead,
  type SnoozeOpts,
} from '@/lib/api/queue';
import { LeadTable } from '@/components/bd';
import { DisqualifyDialog, SavedScreens, SessionMode, SnoozeMenu, SplitTabs, TriageBar } from '@/components/queue';
import {
  SPLIT_HINTS,
  SPLIT_LABELS,
  SPLIT_ORDER,
  effectiveSnoozeUntil,
  formatWakeDate,
  isAwake,
  isDueToday,
  isNewHighScorer,
  isSnoozed,
  isTypingTarget,
  sortBySlaUrgency,
  type SplitId,
} from '@/components/queue/logic';
import { Target, Moon, Play } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui';
import { ConfirmDialog, EmptyState, TableSkeleton, toast, toastUndo } from '@/components/shared';
import { FilterTokenBar } from '@/components/bd/FilterTokenBar';
import type { Market, BdFilters, BdLead } from '@/types/bd';

/** Neutral filter set for the counted split probes (never the user's filters). */
const PROBE_FILTERS: BdFilters = {
  market: null,
  minScore: 0,
  source: '',
  band: '',
  listedOnLcx: null,
  hasContact: null,
  marketRecommendation: '',
  sort: 'created',
  order: 'desc',
  search: '',
  tier: 'tracked',
};

const EMPTY_SPLIT_COPY: Record<Exclude<SplitId, 'working'>, { title: string; description: string }> = {
  hot: { title: 'No replies waiting', description: 'Inbox zero on handoffs — nothing owes a reply right now.' },
  followups: { title: 'Nothing due', description: 'No woken snoozes and no tasks due today.' },
  new: { title: 'No new high-scorers', description: 'No immediate/high-band leads added in the last 7 days.' },
};

const enrichRow = (lead: BdLead): QueueLead => ({
  ...lead,
  hasContact: lead.verifiedContactCount > 0,
  marketTag: null as Market | 'both' | null,
});

interface HotSplit {
  rows: QueueLead[];
  /** projectId → oldest open-handoff ISO (the SLA clock). */
  slaBy: Record<string, string>;
}

interface FollowupSplit {
  rows: QueueLead[];
  /** projectId → one-line why-it's-here ("Task due: …" / "Snooze woke …"). */
  noteBy: Record<string, string>;
  /** projectId → wake ISO for woken snoozes (chip + unsnooze). */
  snoozeBy: Record<string, string>;
}

interface SessionSnapshot {
  leads: QueueLead[];
  slaBy?: Record<string, string>;
  contextBy?: Record<string, string>;
}

export function BdPipeline() {
  const navigate = useNavigate();
  const inspect = useInspect();
  const { clarityEnacted, toggleFilterStoreField } = useFilterStore();
  const {
    market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation,
    sort, order, search, tier,
    loading, error,
    activeSplit, showSnoozed,
    setFilter, setFilters, resetFilters, setLoading, setError, selectLead, setSplit, setShowSnoozed,
  } = useBdStore();

  /* ── Working set (paginated, filterable — unchanged contract) ── */
  const [leads, setLeads] = useState<QueueLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const abortRef = useRef<AbortController | null>(null);

  /* ── Counted splits ── */
  const [hot, setHot] = useState<HotSplit | null>(null);
  const [followups, setFollowups] = useState<FollowupSplit | null>(null);
  const [fresh, setFresh] = useState<QueueLead[] | null>(null);
  const splitsSeq = useRef(0);

  /* ── Triage state ── */
  const [snoozeMap, setSnoozeMap] = useState<Record<string, string>>(() => loadSnoozeMap());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<QueueLead | null>(null);
  const [dqFor, setDqFor] = useState<QueueLead | null>(null);
  const [enrollFor, setEnrollFor] = useState<QueueLead | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);

  const loadLeads = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const filters = { market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search, tier };
      const res = await fetchBdPipeline(filters, { limit: PAGE_SIZE, offset: page * PAGE_SIZE }, controller.signal);
      if (!controller.signal.aborted) {
        setLeads(res.data.map(enrichRow));
        setTotal(res.meta.total);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search, tier, page, setLoading, setError]);

  useEffect(() => {
    loadLeads();
    return () => abortRef.current?.abort();
  }, [loadLeads]);

  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search, tier]);

  /**
   * Load the three counted splits. Each stream degrades gracefully on failure
   * (rate limit, offline API): keep whatever loaded before, else empty — a
   * broken probe must never error the whole cockpit. First load starts from
   * null so the tabs show "…" while counting.
   */
  const loadSplits = useCallback(() => {
    const seq = ++splitsSeq.current;

    void (async () => {
      try {
        const res = await fetchHandoffs({ status: 'open', limit: 100 });
        const oldestBy = new Map<string, string>();
        for (const h of res.data) {
          const prev = oldestBy.get(h.projectId);
          if (!prev || Date.parse(h.createdAt) < Date.parse(prev)) oldestBy.set(h.projectId, h.createdAt);
        }
        const rows = await fetchLeadRowsByIds([...oldestBy.keys()]);
        const slaBy = Object.fromEntries(oldestBy);
        if (splitsSeq.current === seq) setHot({ rows: sortBySlaUrgency(rows, r => slaBy[r.id]), slaBy });
      } catch {
        if (splitsSeq.current === seq) setHot(prev => prev ?? { rows: [], slaBy: {} });
      }
    })();

    void (async () => {
      try {
        const awake = Object.entries(loadSnoozeMap()).filter(([, until]) => isAwake(until));
        const noteBy: Record<string, string> = {};
        const snoozeBy: Record<string, string> = {};
        for (const [id, until] of awake) {
          snoozeBy[id] = until;
          noteBy[id] = `Snooze woke ${new Date(until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        }
        let tasks: OperatorTask[] = [];
        try {
          tasks = await fetchTasks();
        } catch {
          /* tasks probe failed — split thins to woken snoozes */
        }
        const dueTasks = tasks.filter(t => t.projectId && isDueToday(t.dueAt));
        for (const t of dueTasks) noteBy[t.projectId as string] = `Task due: ${t.title}`;
        const ids = [...new Set([...awake.map(([id]) => id), ...dueTasks.map(t => t.projectId as string)])];
        const rows = await fetchLeadRowsByIds(ids);
        if (splitsSeq.current === seq) setFollowups({ rows, noteBy, snoozeBy });
      } catch {
        if (splitsSeq.current === seq) setFollowups(prev => prev ?? { rows: [], noteBy: {}, snoozeBy: {} });
      }
    })();

    void (async () => {
      try {
        const res = await fetchBdPipeline(PROBE_FILTERS, { limit: 100 });
        if (splitsSeq.current === seq) setFresh(res.data.filter(l => isNewHighScorer(l)).map(enrichRow));
      } catch {
        if (splitsSeq.current === seq) setFresh(prev => prev ?? []);
      }
    })();
  }, []);

  useEffect(() => {
    loadSplits();
  }, [loadSplits]);

  const refresh = useCallback(() => {
    setSnoozeMap(loadSnoozeMap());
    void loadLeads();
    loadSplits();
  }, [loadLeads, loadSplits]);

  /* ── Snooze-aware working set ── */
  const wakeOf = useCallback(
    (lead: QueueLead) => effectiveSnoozeUntil(lead.snoozedUntil, snoozeMap[lead.id]),
    [snoozeMap],
  );

  const workingSnoozed = useMemo(() => leads.filter(l => isSnoozed(wakeOf(l))), [leads, wakeOf]);

  const workingVisible = useMemo(
    () => (showSnoozed ? leads : leads.filter(l => !isSnoozed(wakeOf(l)))),
    [leads, showSnoozed, wakeOf],
  );

  /** Wake chips for snoozed rows revealed inside the working set. */
  const workingSnoozeBy = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of workingSnoozed) {
      const until = wakeOf(l);
      if (until) map[l.id] = until;
    }
    return map;
  }, [workingSnoozed, wakeOf]);

  const visibleRows: QueueLead[] = useMemo(() => {
    switch (activeSplit) {
      case 'hot': return hot?.rows ?? [];
      case 'followups': return followups?.rows ?? [];
      case 'new': return fresh ?? [];
      case 'working': return workingVisible;
    }
  }, [activeSplit, hot, followups, fresh, workingVisible]);

  const counts: Record<SplitId, number | null> = useMemo(() => ({
    hot: hot ? hot.rows.length : null,
    followups: followups ? followups.rows.length : null,
    new: fresh ? fresh.length : null,
    working: loading && leads.length === 0 ? null : total,
  }), [hot, followups, fresh, loading, leads.length, total]);

  /* ── Selection (J/K) ── */
  useEffect(() => {
    if (selectedId && !visibleRows.some(r => r.id === selectedId)) setSelectedId(null);
  }, [visibleRows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    document
      .querySelector(`[data-lead-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const move = useCallback(
    (dir: 1 | -1) => {
      if (visibleRows.length === 0) return;
      const idx = visibleRows.findIndex(r => r.id === selectedId);
      const next = idx === -1
        ? (dir === 1 ? 0 : visibleRows.length - 1)
        : Math.min(visibleRows.length - 1, Math.max(0, idx + dir));
      setSelectedId(visibleRows[next].id);
    },
    [visibleRows, selectedId],
  );

  /* ── Triage actions (shared by table shortcuts and session mode) ── */
  const doUnsnooze = useCallback(async (id: string) => {
    try {
      await unsnoozeProject(id);
      setSnoozeMap(loadSnoozeMap());
      setLeads(ls => ls.map(l => (l.id === id ? { ...l, snoozedUntil: null } : l)));
      setFollowups(f => {
        if (!f) return f;
        const { [id]: _dropped, ...rest } = f.snoozeBy;
        return { ...f, snoozeBy: rest };
      });
      toast('success', 'Snooze cleared — back in the working set');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Unsnooze failed');
    }
  }, []);

  const doSnooze = useCallback(async (lead: QueueLead, opts: SnoozeOpts): Promise<boolean> => {
    try {
      const { snoozeUntil, viaFallback } = await snoozeProject(lead.id, opts);
      setSnoozeMap(loadSnoozeMap());
      setLeads(ls => ls.map(l => (l.id === lead.id ? { ...l, snoozedUntil: snoozeUntil } : l)));
      setFresh(f => (f ? f.filter(l => l.id !== lead.id) : f));
      setFollowups(f => (f ? { ...f, rows: f.rows.filter(l => l.id !== lead.id) } : f));
      // Undo, don't confirm (plan 4.1): the snooze already happened — six
      // seconds to take it back.
      toastUndo(`${lead.name} snoozed — wakes ${formatWakeDate(snoozeUntil)}${viaFallback ? ' (saved locally)' : ''}`, () => {
        void doUnsnooze(lead.id);
      });
      return true;
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Snooze failed');
      return false;
    }
  }, [doUnsnooze]);


  const doDisqualify = useCallback(async (lead: QueueLead, reason: string): Promise<boolean> => {
    try {
      await disqualifyProject(lead.id, reason);
      setLeads(ls => ls.filter(l => l.id !== lead.id));
      setTotal(t => Math.max(0, t - 1));
      setHot(h => (h ? { ...h, rows: h.rows.filter(l => l.id !== lead.id) } : h));
      setFollowups(f => (f ? { ...f, rows: f.rows.filter(l => l.id !== lead.id) } : f));
      setFresh(f => (f ? f.filter(l => l.id !== lead.id) : f));
      toast('success', `${lead.name} disqualified — ${reason}`);
      return true;
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Disqualify failed');
      return false;
    }
  }, []);

  const doEnroll = useCallback(async (lead: QueueLead): Promise<boolean> => {
    try {
      const res = await enrollProject(lead.id, {});
      setFresh(f => (f ? f.filter(l => l.id !== lead.id) : f));
      toast('success', `${lead.name} enrolled — ${res.data.steps}-touch sequence for ${res.data.contactName}`);
      return true;
    } catch (err) {
      toast('error', `Enroll refused: ${err instanceof Error ? err.message : 'unknown error'}`);
      return false;
    }
  }, []);

  const handleSort = useCallback((field: typeof sort) => {
    if (field === sort) {
      setFilter('order', order === 'asc' ? 'desc' : 'asc');
    } else {
      setFilter('sort', field);
      setFilter('order', field === 'name' ? 'asc' : 'desc');
    }
  }, [sort, order, setFilter]);

  const handleSelect = useCallback((id: string) => {
    selectLead(id);
    navigate(`/bd-pipeline/${id}`);
  }, [navigate, selectLead]);

  const handlePeek = useCallback((id: string) => {
    setSelectedId(id);
    inspect('project', id);
  }, [inspect]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter('search', e.target.value);
  }, [setFilter]);

  const startSession = useCallback(() => {
    if (visibleRows.length === 0) return;
    setSession({
      leads: visibleRows,
      slaBy: activeSplit === 'hot' ? hot?.slaBy : undefined,
      contextBy: activeSplit === 'followups' ? followups?.noteBy : undefined,
    });
  }, [visibleRows, activeSplit, hot, followups]);

  /* ── Page-level triage grammar (session + sub-dialogs own their keys) ── */
  const dialogOpen = session !== null || snoozeFor !== null || dqFor !== null || enrollFor !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen) return;
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        setSplit(SPLIT_ORDER[Number(e.key) - 1]);
        return;
      }

      const sel = visibleRows.find(r => r.id === selectedId) ?? null;
      switch (e.key) {
        case 'j': case 'J': case 'ArrowDown':
          e.preventDefault();
          move(1);
          break;
        case 'k': case 'K': case 'ArrowUp':
          e.preventDefault();
          move(-1);
          break;
        case ' ':
          if (sel) {
            e.preventDefault();
            handlePeek(sel.id);
          }
          break;
        case 'Enter':
          if (sel) {
            e.preventDefault();
            handleSelect(sel.id);
          }
          break;
        case 's': case 'S':
          if (sel) {
            e.preventDefault();
            setSnoozeFor(sel);
          }
          break;
        case 'd': case 'D':
          if (sel) {
            e.preventDefault();
            setDqFor(sel);
          }
          break;
        case 'e': case 'E':
          if (sel) {
            e.preventDefault();
            setEnrollFor(sel);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen, visibleRows, selectedId, move, setSplit, handlePeek, handleSelect]);

  const hasActiveFilters = market || minScore > 0 || source || band || listedOnLcx !== null || hasContact !== null || marketRecommendation || search;

  const currentFilters: BdFilters = useMemo(
    () => ({ market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search, tier }),
    [market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search, tier],
  );

  const selIdx = selectedId ? visibleRows.findIndex(r => r.id === selectedId) : -1;
  const position = selIdx >= 0
    ? `${selIdx + 1} of ${visibleRows.length}`
    : `${visibleRows.length} in ${SPLIT_LABELS[activeSplit]}`;

  const activeSplitLoading =
    (activeSplit === 'hot' && hot === null) ||
    (activeSplit === 'followups' && followups === null) ||
    (activeSplit === 'new' && fresh === null);

  const noop = useCallback(() => {}, []);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy overflow-hidden">
      {/* TOOLBAR */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card overflow-x-auto">
        <h1 className="text-lg font-bold shrink-0 flex items-center gap-1.5">
          <Target size={17} className="text-cyan-500" />
          BD Engine
        </h1>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-micro text-grey font-mono num-tabular">{total.toLocaleString()} {tier === 'all' ? 'in universe' : 'leads'}</span>

          {/* Tier scope: the workable tracked core vs. the full 50k+ catalog. */}
          <div className="flex items-center rounded-full border border-line overflow-hidden shrink-0">
            {(['tracked', 'all'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter('tier', t)}
                className={clsx(
                  'px-2.5 py-1 text-micro font-bold transition-colors',
                  tier === t ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' : 'text-grey hover:bg-ice-soft',
                )}
                title={t === 'tracked' ? 'Deep-intel core — scored, contactable leads' : 'Full universe — all 50k+ tokens, promote any to track'}
              >
                {t === 'tracked' ? 'Tracked' : 'All universe'}
              </button>
            ))}
          </div>

          {/* The one ACTION in a toolbar that is otherwise all state toggles and
              counts: working the active split one lead at a time is what the
              splits exist for. It was `secondary` — pixel-identical weight to
              the CLARITY state chip beside it (both 11px/700, same border), so
              the surface's primary verb read as chrome. */}
          <Button
            size="xs"
            variant="primary"
            disabled={activeSplitLoading || visibleRows.length === 0}
            onClick={startSession}
            title={`Work ${SPLIT_LABELS[activeSplit]} one lead at a time — full-screen focus session`}
          >
            <Play size={11} /> Start session ({activeSplitLoading ? '…' : visibleRows.length})
          </Button>

          <button
            onClick={() => toggleFilterStoreField('clarityEnacted')}
            className={clsx(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-micro font-bold transition-all duration-300',
              clarityEnacted
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:border-cyan-400 dark:bg-cyan-400/10 dark:text-cyan-400 shadow-sm shadow-cyan-500/10'
                : 'border-line text-grey hover:bg-ice-soft',
            )}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', clarityEnacted ? 'bg-cyan-500' : 'bg-slate-400')} />
            {clarityEnacted ? 'CLARITY Enacted' : 'CLARITY Inactive'}
          </button>
        </div>
      </div>

      {/* SPLIT TABS */}
      <SplitTabs active={activeSplit} counts={counts} onSelect={setSplit} />

      {/* FILTERS — one token bar; every condition is a removable chip (plan 4.2) */}
      {activeSplit === 'working' ? (
        <FilterTokenBar
          filters={{ market, minScore, source, band, listedOnLcx, hasContact, marketRecommendation, sort, order, search, tier }}
          search={search}
          onSearchChange={handleSearchChange}
          onPatch={setFilters}
          onReset={resetFilters}
          hasActiveFilters={Boolean(hasActiveFilters)}
          trailing={
            (workingSnoozed.length > 0 || showSnoozed) ? (
              <button
                onClick={() => setShowSnoozed(!showSnoozed)}
                className={clsx(
                  'flex items-center gap-1 text-micro font-bold transition-colors',
                  showSnoozed ? 'text-cyan-600 dark:text-cyan-400' : 'text-grey hover:text-navy',
                )}
                title={showSnoozed ? 'Hide snoozed rows' : 'Reveal snoozed rows (greyed, with wake dates)'}
              >
                <Moon size={11} /> {workingSnoozed.length} snoozed
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-line bg-card">
          <span className="text-micro text-grey">{SPLIT_HINTS[activeSplit]}</span>
        </div>
      )}

      {/* SAVED SCREENS — named filter sets over the working set */}
      {activeSplit === 'working' && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-line bg-card overflow-x-auto">
          <span className="text-micro font-bold uppercase tracking-wider text-grey shrink-0">Screens</span>
          <SavedScreens
            filters={currentFilters}
            onApply={(f) => {
              setFilters(f);
              setSplit('working');
            }}
          />
        </div>
      )}

      {/* DISCLAIMER */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-line bg-amber-50/50 dark:bg-amber-950/10">
        <span className="text-micro text-amber-700 dark:text-amber-400 leading-tight">
          ⚠ Scores and market recommendations are planning heuristics only — not legal advice. US scoring weighs pre/post CLARITY scenarios. Consult qualified counsel for regulatory decisions.
        </span>
      </div>

      {/* TABLE AREA */}
      <div className="flex-1 overflow-auto">
        {activeSplit === 'working' ? (
          <>
            {loading && (
              <div className="p-4">
                <TableSkeleton rows={12} cols={6} />
              </div>
            )}

            {error && !loading && (
              <div
                /* Was `text-red-500`, measured 3.48:1 on the page canvas — a
                 * failure message below the 4.5:1 text minimum. The app's own
                 * --red token is 6.9:1 light / 4.93:1 dark and is theme-aware;
                 * raw red-500 is neither. */
                className="flex flex-col items-center justify-center py-20 text-status-blocked"
              >
                <p className="text-sm font-semibold">Failed to load leads</p>
                <p className="text-xs mt-1 text-grey">{error}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={loadLeads}>
                  Retry
                </Button>
              </div>
            )}

            {!loading && !error && (
              <>
                <LeadTable
                  leads={workingVisible}
                  filters={currentFilters}
                  clarityEnacted={clarityEnacted}
                  onSort={handleSort}
                  onSelect={handleSelect}
                  loading={false}
                  selectedId={selectedId}
                  snoozeBy={workingSnoozeBy}
                  onUnsnooze={doUnsnooze}
                  onPeek={handlePeek}
                />
                <div className="flex items-center justify-between px-3 py-2.5 text-micro text-grey border-t border-line/50">
                  <span className="num-tabular">
                    {total === 0 ? 'No leads' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
                    {!showSnoozed && workingSnoozed.length > 0 && ` · ${workingSnoozed.length} snoozed hidden`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="xs" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                      ← Prev
                    </Button>
                    <span className="font-mono num-tabular">page {page + 1}/{Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
                    <Button variant="secondary" size="xs" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
                      Next →
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : activeSplitLoading ? (
          <div className="p-4">
            <TableSkeleton rows={8} cols={6} />
          </div>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            variant="done"
            title={EMPTY_SPLIT_COPY[activeSplit].title}
            description={EMPTY_SPLIT_COPY[activeSplit].description}
          />
        ) : (
          <LeadTable
            leads={visibleRows}
            filters={currentFilters}
            clarityEnacted={clarityEnacted}
            onSort={noop}
            onSelect={handleSelect}
            loading={false}
            selectedId={selectedId}
            slaBy={activeSplit === 'hot' ? hot?.slaBy : undefined}
            snoozeBy={activeSplit === 'followups' ? followups?.snoozeBy : undefined}
            noteBy={activeSplit === 'followups' ? followups?.noteBy : undefined}
            onUnsnooze={activeSplit === 'followups' ? doUnsnooze : undefined}
            onPeek={handlePeek}
          />
        )}
      </div>

      {/* TRIAGE LEGEND */}
      <TriageBar position={position} />

      {/* TRIAGE SUB-DIALOGS (table scope) */}
      {snoozeFor && (
        <SnoozeMenu
          open
          leadName={snoozeFor.name}
          onClose={() => setSnoozeFor(null)}
          onSnooze={(opts) => {
            const lead = snoozeFor;
            setSnoozeFor(null);
            void doSnooze(lead, opts);
          }}
        />
      )}
      {dqFor && (
        <DisqualifyDialog
          open
          leadName={dqFor.name}
          onClose={() => setDqFor(null)}
          onConfirm={(reason) => {
            const lead = dqFor;
            setDqFor(null);
            void doDisqualify(lead, reason);
          }}
        />
      )}
      {enrollFor && (
        <ConfirmDialog
          isOpen
          onClose={() => setEnrollFor(null)}
          onConfirm={() => {
            const lead = enrollFor;
            setEnrollFor(null);
            void doEnroll(lead);
          }}
          title={`Enroll ${enrollFor.name}?`}
          message="Starts the default outreach sequence for this project's best contact. The eligibility gate may still refuse — the refusal reason will surface as a toast."
          confirmLabel="Enroll"
        />
      )}

      {/* FOCUS SESSION */}
      {session && (
        <SessionMode
          leads={session.leads}
          splitLabel={SPLIT_LABELS[activeSplit]}
          clarityEnacted={clarityEnacted}
          slaBy={session.slaBy}
          contextBy={session.contextBy}
          onClose={() => {
            setSession(null);
            refresh();
          }}
          onSnooze={doSnooze}
          onDisqualify={doDisqualify}
          onEnroll={doEnroll}
          onOpen={(id) => {
            setSession(null);
            handleSelect(id);
          }}
        />
      )}
    </div>
  );
}

export default BdPipeline;
