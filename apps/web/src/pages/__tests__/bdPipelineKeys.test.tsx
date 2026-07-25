import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BdPipeline } from '../BdPipeline';
import { useBdStore } from '@/stores/useBdStore';
import { useInspectorStore } from '@/stores';
import { _resetDismiss, dismissStack, pushDismissible, removeDismissible } from '@/lib/dismiss';
import * as bdApi from '@/lib/api/bd';

/**
 * The triage grammar on the real queue (P7 ledger T1 #14).
 *
 * Two defects, both of them "a key does something other than what the operator was
 * told", and both invisible to every existing test because the API is down in automated
 * environments so this table had never had rows under a unit test:
 *
 *  1. SPACE DID TWO THINGS. `useListNavigation` binds Enter AND Space to `onActivate`,
 *     and LeadTable passes `onSelect` — so Space OPENED the lead, while `TriageBar`
 *     renders "Space peek" and "↵ open" at the bottom of this very screen. Then the
 *     page's own `window` listener peeked as well: the row's handler calls
 *     `preventDefault` and the page listener did not look at `defaultPrevented`.
 *
 *  2. `s`, `d`, `e` AND `1`-`4` STAYED LIVE UNDER OTHER OVERLAYS. The page stood down
 *     for its OWN four dialogs (`dialogOpen`) and for nothing else, so with an
 *     inspector, the `?` manual, a PartnerDossier or the `f` hint layer up, `d` still
 *     opened the disqualify dialog for the selected lead. This is the same defect the
 *     hint layer had to defend against from its side; defending in one direction fixes
 *     one overlay.
 *
 * WHY THIS RENDERS THE REAL PAGE. A synthetic harness cannot see either bug: both are
 * about the interaction between a handler on the `<tbody>`, a handler on `window`, and a
 * module-level stack. A stand-in listener that checked `defaultPrevented` would have
 * passed while the shipped one did not check it — the mistake that let the `f` hint layer
 * ship a half-fix. Only the network is replaced here.
 */

vi.mock('@/lib/api/bd', () => ({
  fetchBdPipeline: vi.fn(),
  fetchHandoffs: vi.fn().mockResolvedValue({ data: [] }),
  fetchTasks: vi.fn().mockResolvedValue([]),
  enrollProject: vi.fn(),
}));

vi.mock('@/lib/api/queue', () => ({
  disqualifyProject: vi.fn(),
  fetchLeadRowsByIds: vi.fn().mockResolvedValue([]),
  loadSnoozeMap: vi.fn().mockReturnValue({}),
  snoozeProject: vi.fn(),
  unsnoozeProject: vi.fn(),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

/** Enough of a BdLead for a row to render. */
function lead(i: number) {
  return {
    id: `p-${i}`,
    name: `Probe Chain ${i}`,
    ticker: `PC${i}`,
    website: null,
    source: 'probe',
    chain: 'ethereum',
    jurisdiction: 'US',
    category: 'defi',
    listedOnLcx: false,
    euScore: 50 + i,
    usPreScore: 40 + i,
    usPostScore: 45 + i,
    priorityScore: 60 + i,
    propensityScore: 30 + i,
    band: 'high',
    peopleCount: 2,
    verifiedContactCount: 1,
    tier: 'tracked',
    lastEnrichedAt: null,
    recommendedMarket: null,
    snoozedUntil: null,
    createdAt: '2026-01-01T00:00:00Z',
  } as unknown as import('@/types/bd').BdLead;
}

const ROWS = 3;

beforeEach(() => {
  navigate.mockClear();
  _resetDismiss();
  useInspectorStore.setState({ stack: [] });
  useBdStore.setState({ activeSplit: 'working', showSnoozed: false, search: '', loading: false, error: null });
  vi.mocked(bdApi.fetchBdPipeline).mockResolvedValue({
    data: Array.from({ length: ROWS }, (_, i) => lead(i)),
    meta: { total: ROWS, limit: 50, offset: 0, timestamp: '', version: '' },
  } as never);
  // jsdom does not implement scrollIntoView at all, and this page calls it as soon as a row
  // is selected. Stubbed here rather than in the global setup so this file's fixture is its
  // own. (`CSS.escape`, which the same effect uses, jsdom does provide.)
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});

afterEach(() => {
  _resetDismiss();
  vi.restoreAllMocks();
});

async function renderQueue() {
  const view = render(<BdPipeline />);
  // Explicit timeout: the default is 1000ms and this renders the whole queue. A test whose
  // result depends on how loaded the machine is teaches nothing.
  await waitFor(() => expect(document.querySelectorAll('[data-list-row]').length).toBe(ROWS), { timeout: 10_000 });
  return view;
}

const rowAt = (i: number) => document.querySelector<HTMLElement>(`[data-list-row="${i}"]`)!;
const highlighted = () =>
  Array.from(document.querySelectorAll('tr[aria-selected="true"]')).map((r) => r.getAttribute('data-lead-id'));
const inspecting = () => useInspectorStore.getState().stack.map((t) => `${t.type}:${t.id}`);

/** Dispatch a key the way the browser does: at the real target, bubbling to `window`. */
function press(key: string, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

describe('Space peeks and Enter opens, one action per press', () => {
  it('Space on a focused row peeks THAT row and does not open it', async () => {
    await renderQueue();
    act(() => rowAt(0).focus());

    // `j` moves this page's selection but not focus, so the two cursors now disagree —
    // which is what makes this assertion sharp. If the page's `window` listener also ran
    // (it peeks `selectedId`), the inspector would end up on p-1.
    press('j');
    expect(highlighted()).toEqual(['p-1']);

    press(' ', rowAt(0));
    expect(inspecting(), 'the peek landed on the wrong lead — two handlers ran').toEqual(['project:p-0']);
    expect(navigate, 'Space opened the lead; TriageBar advertises it as peek').not.toHaveBeenCalled();
  });

  it('Space still peeks when the selection is what the operator moved with j/k', async () => {
    // Focus is on <body>, so no row handler is in the path at all: the page listener is
    // the only claimant and must keep working.
    await renderQueue();
    press('j');
    press('j');
    expect(highlighted()).toEqual(['p-1']);
    press(' ');
    expect(inspecting()).toEqual(['project:p-1']);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Enter on a focused row opens THAT row, exactly once', async () => {
    await renderQueue();
    act(() => rowAt(0).focus());
    press('j');
    expect(highlighted()).toEqual(['p-1']);

    press('Enter', rowAt(0));
    // Twice was the shipped behaviour: the row handler navigated to the focused lead and
    // the page listener then navigated to `selectedId`. The operator landed on p-1 having
    // pressed Enter on p-0.
    expect(navigate.mock.calls, `navigate calls: ${JSON.stringify(navigate.mock.calls)}`).toEqual([
      ['/bd-pipeline/p-0'],
    ]);
  });

  it('row focus moves the selection, so s/d/e cannot act on a row the ring is not on', async () => {
    await renderQueue();
    act(() => rowAt(0).focus());
    expect(highlighted()).toEqual(['p-0']);

    // ArrowDown is handled by the row (useListNavigation), which moves real focus. The
    // highlight — the thing `s`/`d`/`e` act on — has to follow it, or the operator sees a
    // ring on row 1 and disqualifies row 0.
    fireEvent.keyDown(rowAt(0), { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(rowAt(1)), { timeout: 10_000 });
    expect(highlighted()).toEqual(['p-1']);
  });

  it('does not fight useListNavigation for the scroll when the row already has focus', async () => {
    // The arrows are the hook's, and it scrolls the row it focuses with the operator's
    // reduced-motion setting honoured. This page's own `block: 'nearest'` call does not, so
    // running both in one frame replaces a glide with a jump. It still has to run for
    // `j`/`k`, where nothing else moves the viewport at all.
    await renderQueue();
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});

    act(() => rowAt(0).focus());
    await waitFor(() => expect(highlighted()).toEqual(['p-0']), { timeout: 10_000 });
    expect(scroll, 'scrolled a row that is already focused, cancelling the hook’s scroll').not.toHaveBeenCalled();

    act(() => rowAt(0).blur());
    press('j');
    await waitFor(() => expect(scroll).toHaveBeenCalled(), { timeout: 10_000 });
  });

  it('leaves Space alone when it is aimed at a control inside the row', async () => {
    await renderQueue();
    const peekButton = rowAt(0).querySelector<HTMLElement>('button[aria-label^="Peek"]')!;
    act(() => peekButton.focus());

    const e = press(' ', peekButton);
    // The button's activation is the BROWSER's default for Space, so the default must
    // survive. The hook's binding lives on the <tbody> these bubble through, so before
    // this it both opened the lead and cancelled the button.
    expect(e.defaultPrevented, 'the button can no longer be activated by Space').toBe(false);
    expect(navigate, 'Space on an in-row control opened the lead').not.toHaveBeenCalled();
  });
});

describe('the page grammar stands down for every overlay, not just its own dialogs', () => {
  const OVERLAY = 'a made-up inspector';

  it('d does not open the disqualify dialog under someone else’s overlay', async () => {
    await renderQueue();
    press('j');
    expect(highlighted()).toEqual(['p-0']);

    // Registered exactly the way an inspector, the manual or the hint layer registers.
    act(() => {
      pushDismissible(OVERLAY, () => {});
    });
    expect(dismissStack().map((d) => d.label)).toEqual([OVERLAY]);

    press('d');
    expect(
      screen.queryByRole('dialog', { name: /disqualify/i }),
      'a keystroke meant for the overlay on top opened a destructive dialog underneath it',
    ).toBeNull();
  });

  it('s, e and the split digits are equally quiet', async () => {
    await renderQueue();
    press('j');
    act(() => {
      pushDismissible(OVERLAY, () => {});
    });

    press('s');
    expect(screen.queryByRole('dialog', { name: /snooze/i })).toBeNull();
    press('e');
    expect(screen.queryByRole('dialog', { name: /enroll/i })).toBeNull();
    press('3');
    expect(useBdStore.getState().activeSplit, 'a digit typed into an overlay switched the split underneath').toBe(
      'working',
    );
  });

  it('and comes back the moment the overlay leaves', async () => {
    await renderQueue();
    press('j');
    const id = pushDismissible(OVERLAY, () => {});
    press('d');
    expect(screen.queryByRole('dialog', { name: /disqualify/i })).toBeNull();

    // Whatever way it closed, this is the call `useDismissible`'s cleanup makes. A guard
    // that never lifts would be a quieter but equally real defect: the queue's whole
    // grammar dead after the first tooltip.
    act(() => removeDismissible(id));
    press('d');
    expect(
      await screen.findByRole('dialog', { name: /disqualify/i }, { timeout: 10_000 }),
      'the grammar did not come back, so the guard is a one-way door',
    ).toBeTruthy();
  });
});
