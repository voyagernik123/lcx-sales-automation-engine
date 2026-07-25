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
import { isOverlayOpen } from '@/lib/dismiss';
import { keysBelongToSurface } from '@/lib/split';
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

/**
 * The standing regulatory statement. Inlined into the toolbar rather than given its
 * own band — see the chrome comment on the toolbar below. Hoisted to a constant so
 * the visible copy and the `title` are the same string by construction.
 */
const DISCLAIMER =
  'Scores and market recommendations are planning heuristics only — not legal advice. ' +
  'US scoring weighs pre/post CLARITY scenarios. Consult qualified counsel for regulatory decisions.';

const EMPTY_SPLIT_COPY: Record<Exclude<SplitId, 'working'>, { title: string; description: string }> = {
  hot: { title: 'No replies waiting', description: 'Inbox zero on handoffs — nothing owes a reply right now.' },
  followups: { title: 'Nothing due', description: 'No woken snoozes and no tasks due today.' },
  new: { title: 'No new high-scorers', description: 'No immediate/high-band leads added in the last 7 days.' },
};

/**
 * Elements for which Enter or Space ALREADY MEANS SOMETHING.
 *
 * `isTypingTarget` draws this line for text entry; this is the same line for activation.
 * A link, a button and a `<summary>` all treat Enter and/or Space as "activate me", and the
 * browser performs that as the key's DEFAULT ACTION — so a page-level `preventDefault()`
 * does not merely add a second behaviour, it CANCELS the control's only one.
 *
 * Listed as a selector rather than a tag-name check because half the class is ARIA: this
 * app's own overlays are full of `role="button"` and `role="menuitem"` on non-button
 * elements, and a check that only knew about `<button>` would be a guard with a hole in the
 * exact shape of this codebase.
 *
 * `input`, `select` and `textarea` are here as well as in `isTypingTarget` on purpose:
 * that predicate is about TEXT, so `input[type=checkbox]` and `input[type=submit]` are not
 * typing targets but do own Space and Enter. Two predicates each covering what they name is
 * better than one that quietly means both.
 */
const ACTIVATION_OWNER = [
  'a[href]', 'area[href]', 'button', 'summary', 'input', 'select', 'textarea',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]', '[role="tab"]', '[role="option"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]',
].join(', ');

/**
 * Does the focused element own the activation keys?
 *
 * Matches the TARGET only, never an ancestor, because focus lands ON a control rather than
 * inside one — an element that owns Enter IS the focused element. I first justified `matches`
 * over `closest` by claiming the latter would catch queue rows too; that was wrong and worth
 * recording as wrong. Measured: a `tr[data-lead-id]` in this table returns false from BOTH,
 * since nothing between it and the scroll container is a link or a button. The two are
 * equivalent for every case on this page, and `matches` is the one that says what it means.
 *
 * A queue row is not in the class regardless: Enter on a row does open the lead, and the
 * `defaultPrevented` guard is what stops this page opening it a second time.
 */
function ownsActivationKeys(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches(ACTIVATION_OWNER);
}

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
    const row = document.querySelector(`[data-lead-id="${CSS.escape(selectedId)}"]`);
    if (!row) return;
    // Not when the row already holds focus. Selection now follows row focus (see
    // `syncSelectionToFocus`), and the arrows are handled by useListNavigation, which has
    // ALREADY scrolled the row — respecting the operator's reduced-motion setting, which
    // this call does not. A second `auto` scroll in the same frame cancels that smooth one,
    // so every arrow press would jump instead of glide. This stays for the `j`/`k` path,
    // where nothing else moves the viewport.
    if (row.contains(document.activeElement)) return;
    row.scrollIntoView({ block: 'nearest' });
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

  /**
   * Row focus IS the selection.
   *
   * There were two cursors on this surface and they could point at different leads:
   * `useListNavigation`'s (real DOM focus, moved by the arrows inside the table) and
   * this page's `selectedId` (the cyan highlight, moved by `j`/`k`). `s`, `d` and `e`
   * act on `selectedId` — so the operator could arrow down to row 5, see the focus ring
   * on row 5, press `d`, and disqualify row 2. Making focus write the selection collapses
   * the two into the one thing the operator can see, and it is what makes the
   * `defaultPrevented` guard below safe: once the row handler has claimed an arrow press,
   * the page must NOT move the selection a second time, and it no longer needs to.
   *
   * `onFocus` on the container rather than per-row because the rows belong to LeadTable —
   * React's focus event is `focusin`, which bubbles, so the container can see it.
   */
  const syncSelectionToFocus = useCallback((e: React.FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el?.matches?.('tr[data-lead-id]')) return;
    const id = el.getAttribute('data-lead-id');
    if (id) setSelectedId(id);
  }, []);

  /**
   * Space PEEKS. Enter OPENS. Claimed here because the row would otherwise claim it first.
   *
   * `useListNavigation` binds Enter AND Space to `onActivate` (hooks/useListNavigation.ts:225),
   * and LeadTable passes `onSelect` as `onActivate` — so Space OPENED the lead, while
   * TriageBar tells the operator Space is peek and `↵` is open. Both then ran: the row's
   * handler calls `preventDefault` without stopping propagation, and the `window` listener
   * below peeked as well. One press, two actions, and the advertised one lost.
   *
   * The hook has three consumers and may not be changed for this surface alone, so the
   * key is intercepted BEFORE the row sees it: React dispatches an ancestor's capture
   * handler ahead of the target's own, and `stopPropagation` on the synthetic event calls
   * through to the native event — which is what also keeps the `window` listener out of it,
   * rather than trusting it to check `defaultPrevented`.
   *
   * Scoped to this container instead of a global capture listener on purpose. The one
   * thing this needs to beat is a handler on the table underneath it; a document- or
   * window-level capture grab would additionally cut in front of the hint layer, the
   * command line and the manual, which is how the previous Escape model rotted.
   */
  const claimRowKeys = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const el = e.target as HTMLElement | null;
    const row = el?.closest?.('tr[data-lead-id]') ?? null;
    if (!row) return;

    if (el !== row) {
      /*
       * A keystroke aimed at a control INSIDE the row belongs to that control. The peek
       * eye and the unsnooze button are reached by ArrowRight (they are parked out of the
       * tab ring by design), and the hook's Space/Enter binding fires for them too because
       * it is bound on the `<tbody>` they bubble through — so pressing Space on the peek
       * button opened the lead instead of peeking, and `preventDefault` in the hook
       * cancelled the button's own activation on the way. Propagation is stopped and the
       * default is deliberately NOT prevented, so the browser still activates the button.
       */
      e.stopPropagation();
      return;
    }
    // Enter on the row keeps its meaning — the hook opens the lead, and the guard below
    // stops this page opening it a second time.
    if (e.key !== ' ') return;
    if (dialogOpen || isOverlayOpen()) return;
    const id = row.getAttribute('data-lead-id');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    handlePeek(id);
  }, [dialogOpen, handlePeek]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen) return;
      /*
       * `dialogOpen` is only this page's OWN four dialogs. Every other overlay in the app
       * — an inspector, the `?` manual, a PartnerDossier, the `f` hint layer — left `s`
       * (snooze), `d` (disqualify), `e` (enroll) and `1`-`4` live on the selected lead
       * underneath it. That is the defect the hint layer had to defend against from its
       * side (components/help/__tests__/hintTags.test.tsx), and defending in one direction
       * only fixes one overlay. The stack knows the answer for all of them.
       */
      if (isOverlayOpen()) return;
      /*
       * AND NOT WHEN FOCUS IS IN THE DOCKED EVIDENCE PANE (T1 #12).
       *
       * `⌘\` puts the inspector BESIDE this table instead of over it, and that is the
       * whole point — the pane does not register on the dismiss stack, so the guard above
       * no longer fires and `s`, `d`, `e` and the digits stay live while the operator
       * reads the evidence. That is the feature. It is also, without this line, the
       * defect: Tab from a row reaches the pane's own links and buttons, and `d` pressed
       * there would open the disqualify dialog for whichever lead was still HIGHLIGHTED —
       * a mutation aimed at a record the operator's focus is nowhere near. That exact
       * defect was already fixed once on this page (`syncSelectionToFocus` below, and the
       * two cursors it collapsed), and a docked pane is how it comes back.
       *
       * Standing down rather than acting on the highlight, deliberately: the highlight is
       * not where the keyboard is, so there is no honest reading in which `d` means
       * "disqualify that". Shift+Tab returns to the row, and the pane's header says which
       * side owns the keys so the silence is explained before it is experienced.
       *
       * AND IT COVERS THE ARROWS, ENTER AND SPACE TOO — do not narrow it to the letters.
       * This note used to say the arrows needed no guard because `useListNavigation` binds
       * them on the `<tbody>`. That hook is real, `LeadTable` uses it, and it is beside the
       * point: THIS listener also handles `ArrowDown`/`ArrowUp` (~70 lines below, next to
       * `j`/`k`) plus `Enter` and `' '`, on `window`, where focus in the pane reaches it just
       * as a letter does. MEASURED — remove this line and
       * `pages/__tests__/bdPipelineSplitOwnership.test.tsx` reports "an arrow pressed in the
       * evidence pane moved the queue cursor", alongside the three verb failures.
       */
      if (!keysBelongToSurface()) return;
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      /*
       * Something closer to the operator already handled this key. Without this the row's
       * Enter — which opens the focused lead — was followed by this listener opening
       * `selectedId`, a second navigation to whichever lead the highlight was on. Note the
       * order this depends on: `window` is the LAST node in the bubble path, so by the time
       * this runs the row has had its say. `preventDefault` is not `stopPropagation`, and a
       * listener that ignores the difference fires on keys that were already spent.
       */
      if (e.defaultPrevented) return;
      /*
       * AND ENTER/SPACE ARE NOT THIS PAGE'S WHEN FOCUS IS ON SOMETHING THAT OWNS THEM.
       *
       * `defaultPrevented` above catches a handler that ran; it cannot catch a control whose
       * behaviour is the browser's DEFAULT, because the default has not happened yet when
       * this listener runs. The skip link is exactly that case and it is the worst one: a
       * plain `<a href="#main-content">`, the FIRST Tab stop in the app, whose only job is
       * jumping the 24 chrome stops `AppLayout` counts. With a lead selected — which is the
       * normal state of this page — `case 'Enter'` cancelled the fragment jump and navigated
       * to a lead detail page instead. The operator's fast way in silently became a
       * navigation they did not ask for, and the shell's one concession to keyboard users
       * did nothing. `e2e/keyboardday.spec.ts:539` names it as a live hazard.
       *
       * Space is the same defect on the other key, and it was broader: every button in this
       * page's own chrome — the Tracked/All toggle, "Start session", the CLARITY chip, the
       * pagination — had its Space activation cancelled in favour of a peek.
       *
       * Scoped to these two keys only. `j`, `k`, `s`, `d`, `e` and `1`-`4` mean nothing to a
       * button, so standing down for them would have made the whole triage grammar dead
       * whenever focus sat on any control on the page — a much bigger regression than the
       * bug, and the shape of fix this guard is deliberately narrower than.
       */
      if ((e.key === 'Enter' || e.key === ' ') && ownsActivationKeys(e.target)) return;

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
      {/*
       * TOOLBAR.
       *
       * THE CHROME BUDGET ON THIS SURFACE, measured rather than estimated (Playwright,
       * 12 stubbed rows, desktop viewport). Before: FIVE stacked bands totalling 183.0px
       * above the first row of data — toolbar 45.0, split tabs 40.0, filter tokens 44.0,
       * a "Screens" band 27.3, a disclaimer band 26.8 — and 17 Tab presses from <main>
       * to that row. The queue is the highest-traffic surface on the desk and Phase 5's
       * doctrine is one primary object with one primary next action; two of those five
       * bands held neither.
       *
       * The two that went: the Screens band (a label plus one button, folded into the
       * filter bar's own trailing slot, which was already `ml-auto` and empty) and the
       * disclaimer band (inlined here). Nothing was deleted — every control and the
       * whole regulatory sentence are still in the DOM, at the same tab-stop cost. What
       * changed is that they no longer each buy a 27px horizontal rule.
       *
       * The disclaimer is truncated visually, NOT shortened: `truncate` is
       * overflow+ellipsis, so the full sentence stays in the accessibility tree and is
       * read in full by a screen reader, and `title` gives it back to a sighted operator
       * on hover. Losing the amber band costs the peripheral colour signal, which is why
       * the text keeps its amber token and its ⚠.
       */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card overflow-x-auto">
        <h1 className="text-lg font-bold shrink-0 flex items-center gap-1.5">
          <Target size={17} className="text-cyan-500" />
          BD Engine
        </h1>

        <p
          className="min-w-0 flex-1 truncate text-micro leading-tight text-amber-700 dark:text-amber-400"
          title={DISCLAIMER}
        >
          ⚠ {DISCLAIMER}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-micro text-grey font-mono num-tabular">{total.toLocaleString()} {tier === 'all' ? 'in universe' : 'leads'}</span>

          {/* Tier scope: the workable tracked core vs. the full 50k+ catalog. */}
          <div className="flex items-center rounded-full border border-line overflow-hidden shrink-0">
            {(['tracked', 'all'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter('tier', t)}
                className={clsx(
                  'px-2.5 py-1 text-micro font-bold transition-colors',
                  tier === t ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400' : 'text-grey hover:bg-ice-soft',
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
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-400/10 dark:text-cyan-400 shadow-sm shadow-cyan-500/10'
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
            <>
              {(workingSnoozed.length > 0 || showSnoozed) && (
                <button
                  onClick={() => setShowSnoozed(!showSnoozed)}
                  className={clsx(
                    'flex items-center gap-1 text-micro font-bold transition-colors',
                    showSnoozed ? 'text-cyan-700 dark:text-cyan-400' : 'text-grey hover:text-navy',
                  )}
                  title={showSnoozed ? 'Hide snoozed rows' : 'Reveal snoozed rows (greyed, with wake dates)'}
                >
                  <Moon size={11} /> {workingSnoozed.length} snoozed
                </button>
              )}
              {/*
               * Saved screens live here now instead of in a band of their own. They ARE
               * filter state — a named filter set is the same object the tokens to the
               * left describe — so a second horizontal rule to say so was 27.3px spent on
               * a taxonomy the operator does not have. The "Screens" caption went with the
               * band: the button already reads "Save screen", and the chips are named.
               *
               * Honest about the one case where this is not free: once several screens are
               * saved, this flex-wrap row can wrap to a second line, where the old band
               * was a fixed 27.3px whether or not any screen existed. Nothing is worse
               * than before at one screen, and the default state — none — is 27.3px better.
               */}
              <SavedScreens
                filters={currentFilters}
                onApply={(f) => {
                  setFilters(f);
                  setSplit('working');
                }}
              />
            </>
          }
        />
      ) : (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-line bg-card">
          <span className="text-micro text-grey">{SPLIT_HINTS[activeSplit]}</span>
        </div>
      )}

      {/* TABLE AREA — owns Space/Enter on a row before the row does (see claimRowKeys) */}
      <div className="flex-1 overflow-auto" onKeyDownCapture={claimRowKeys} onFocus={syncSelectionToFocus}>
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
