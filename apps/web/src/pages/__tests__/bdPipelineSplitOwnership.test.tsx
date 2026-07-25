import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BdPipeline } from '../BdPipeline';
import { EvidencePane } from '@/components/inspect/EvidencePane';
import { useBdStore } from '@/stores/useBdStore';
import { useInspectorStore, useUIStore } from '@/stores';
import { _resetDismiss, dismissStack } from '@/lib/dismiss';
import { EVIDENCE_PANE_ATTR } from '@/lib/split';
import * as bdApi from '@/lib/api/bd';

/**
 * `⌘\` — which pane a keystroke lands in, on the one surface where the answer is a
 * mutation (T1 #12).
 *
 * ── WHY THIS TEST IS THE POINT OF THE WHOLE ITEM ─────────────────────────────
 *
 * Docking the evidence beside the queue is only worth building because the pane does NOT
 * register with the dismiss stack, which is what keeps `s` snooze, `d` disqualify and `e`
 * enroll alive while the operator reads the evidence. That is the feature. It is also,
 * without one guard, a data-integrity defect: Tab from a row reaches the pane's own links,
 * and `d` pressed there would open the disqualify dialog for whichever lead was still
 * HIGHLIGHTED — a destructive dialog aimed at a record the operator's focus is nowhere
 * near. This page already had that exact defect once, fixed by `syncSelectionToFocus`; a
 * docked pane is how it comes back.
 *
 * ── WHY THE REAL PANE AND THE REAL PAGE ──────────────────────────────────────
 *
 * The guard is `keysBelongToSurface()`, which asks a DOM containment question about
 * `document.activeElement` at press time. A harness with a stand-in `<div data-…>` would
 * pass while the shipped pane forgot the attribute, and a harness with a stand-in listener
 * would pass while the page's real `window` handler ran before the guard. Both are the shape
 * of half-fix this programme keeps catching. So: the real page, the real pane, mounted as
 * siblings exactly as `AppLayout` mounts them. Only the network is replaced.
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

// The pane renders the universal inspector's payloads, and `ProjectInspector` reads. The
// pane's CHROME is what this file is about — its containment, its focus behaviour and the
// keys that reach past it — so the payload is stubbed to a single focusable link. That is
// the honest minimum: a payload with no focusable descendant could not produce the defect
// at all, and one with the real thing would make this a test about the project API.
vi.mock('@/components/inspect/InspectorBody', () => ({
  inspectorTitle: () => 'PROJECT',
  InspectorBody: () => (
    <a href="#evidence" data-testid="evidence-link">
      the premortem
    </a>
  ),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

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
  // Docked AND wide enough. `window.innerWidth` is 1024 in jsdom and `matchMedia` is
  // undefined here, so the hook's initial read is the only source — see useSplitView.
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true });
  useUIStore.setState({ evidenceDocked: true });
  useInspectorStore.setState({ stack: [{ type: 'project', id: 'p-0' }] });
  useBdStore.setState({ activeSplit: 'working', showSnoozed: false, search: '', loading: false, error: null });
  vi.mocked(bdApi.fetchBdPipeline).mockResolvedValue({
    data: Array.from({ length: ROWS }, (_, i) => lead(i)),
    meta: { total: ROWS, limit: 50, offset: 0, timestamp: '', version: '' },
  } as never);
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});

afterEach(() => {
  _resetDismiss();
  useUIStore.setState({ evidenceDocked: false });
  useInspectorStore.setState({ stack: [] });
  vi.restoreAllMocks();
});

/** The shell's arrangement: the surface, and the pane beside it. */
async function renderDocked() {
  const view = render(
    <>
      <BdPipeline />
      <EvidencePane />
    </>,
  );
  await waitFor(() => expect(document.querySelectorAll('[data-list-row]').length).toBe(ROWS), { timeout: 10_000 });
  return view;
}

const rowAt = (i: number) => document.querySelector<HTMLElement>(`[data-list-row="${i}"]`)!;
const highlighted = () =>
  Array.from(document.querySelectorAll('tr[aria-selected="true"]')).map((r) => r.getAttribute('data-lead-id'));

function press(key: string, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

describe('the surface keeps its keys while the evidence is docked', () => {
  it('d still opens the disqualify dialog — this is the entire reason to dock', async () => {
    /*
     * The BEFORE state, stated so the regression is legible: peeking used to open an
     * InspectorDrawer, which registers with the dismiss stack, which makes
     * `isOverlayOpen()` true, which is the guard four lines above the one this file is
     * about. So `d` did nothing, and reading a lead's evidence and disqualifying it were
     * mutually exclusive. If this assertion ever fails, the pane has started behaving like
     * an overlay and the item is worthless.
     */
    await renderDocked();
    act(() => rowAt(0).focus());
    expect(highlighted()).toEqual(['p-0']);

    // Nothing on the dismiss stack: the pane is chrome, not an overlay.
    expect(dismissStack().map((d) => d.label)).toEqual([]);

    press('d');
    expect(
      screen.queryByRole('dialog', { name: /disqualify/i }),
      'the docked pane silenced the queue verbs — it is behaving like the drawer it replaces',
    ).not.toBeNull();
  });

  it('and the arrows still move the cursor row', async () => {
    await renderDocked();
    act(() => rowAt(0).focus());
    press('j');
    expect(highlighted()).toEqual(['p-1']);
  });
});

describe('the pane-ownership rule', () => {
  it('a mutating letter pressed inside the evidence pane does NOT reach the highlighted lead', async () => {
    /*
     * THE MUTATION PROOF. Delete `if (!keysBelongToSurface()) return;` from the window
     * listener in BdPipeline.tsx and this fails with the disqualify dialog open for p-0 —
     * a destructive dialog for a lead the operator's focus is two panes away from. Verified
     * by doing exactly that.
     */
    await renderDocked();
    act(() => rowAt(0).focus());
    expect(highlighted()).toEqual(['p-0']);

    const evidence = screen.getByTestId('evidence-link');
    act(() => evidence.focus());
    expect(document.activeElement).toBe(evidence);
    // The highlight has NOT moved — which is the whole hazard. The operator can still see a
    // cyan row while their keyboard is somewhere else.
    expect(highlighted()).toEqual(['p-0']);

    press('d', evidence);
    expect(
      screen.queryByRole('dialog', { name: /disqualify/i }),
      'a keystroke aimed at the evidence pane opened a destructive dialog for the highlighted lead',
    ).toBeNull();

    press('s', evidence);
    expect(screen.queryByRole('dialog', { name: /snooze/i })).toBeNull();
    press('e', evidence);
    expect(screen.queryByRole('dialog', { name: /enroll/i })).toBeNull();
  });

  it('the split digits do not switch the surface out from under the evidence either', async () => {
    await renderDocked();
    const evidence = screen.getByTestId('evidence-link');
    act(() => evidence.focus());
    press('3', evidence);
    expect(
      useBdStore.getState().activeSplit,
      'a digit typed while reading the evidence re-filtered the queue behind it',
    ).toBe('working');
  });

  it('the arrows are covered by the SAME guard as the letters, not by structure', async () => {
    /*
     * THIS TEST'S NAME USED TO BE "the arrows need no guard: the hook never sees a press from
     * the pane", and the Phase F verifier showed that was false. It rested on
     * `useListNavigation` binding through `containerProps` on the `<tbody>` — true of that
     * hook, and beside the point, because `BdPipeline` does not use it. `LeadTable` does, while
     * the PAGE handles `ArrowDown`/`ArrowUp` next to `j`/`k` on its own `window` listener
     * (BdPipeline.tsx:596), which a press from the pane reaches exactly like a letter.
     *
     * MEASURED: delete `if (!keysBelongToSurface()) return;` and this assertion goes red with
     * "an arrow pressed in the evidence pane moved the queue cursor: expected [ 'p-1' ] to
     * deeply equal [ 'p-0' ]" — so it was never testing structure, it was testing the guard.
     * Which is the useful thing to know: the guard covers strictly more than the `case '[sde]'`
     * labels, and narrowing it to the letters would silently unscope the arrows.
     */
    await renderDocked();
    act(() => rowAt(0).focus());
    expect(highlighted()).toEqual(['p-0']);

    const evidence = screen.getByTestId('evidence-link');
    act(() => evidence.focus());
    press('ArrowDown', evidence);
    expect(highlighted(), 'an arrow pressed in the evidence pane moved the queue cursor').toEqual(['p-0']);
    expect(document.activeElement, 'an arrow pressed in the evidence pane moved focus to a row').toBe(evidence);
  });

  it('the keys come back the moment focus returns to the surface', async () => {
    await renderDocked();
    const evidence = screen.getByTestId('evidence-link');
    act(() => evidence.focus());
    press('d', evidence);
    expect(screen.queryByRole('dialog', { name: /disqualify/i })).toBeNull();

    act(() => rowAt(1).focus());
    expect(highlighted()).toEqual(['p-1']);
    press('d', rowAt(1));
    expect(screen.queryByRole('dialog', { name: /disqualify/i })).not.toBeNull();
  });

  it('the pane tells the operator which side owns the keys, in words', async () => {
    // A silence the operator cannot explain is a bug report. The readout is derived from the
    // same predicate as the guard, so it cannot claim the surface has the keys while the
    // guard is standing it down.
    await renderDocked();
    act(() => rowAt(0).focus());
    expect(screen.getByText(/keys → the surface/)).toBeInTheDocument();

    act(() => screen.getByTestId('evidence-link').focus());
    await waitFor(() => expect(screen.getByText(/keys → this pane/)).toBeInTheDocument());
    expect(screen.queryByText(/keys → the surface/)).toBeNull();
  });
});

describe('the pane is chrome, not an overlay', () => {
  it('is marked so the guard can find it, and declares no dialog role', async () => {
    await renderDocked();
    const pane = document.querySelector(`[${EVIDENCE_PANE_ATTR}]`);
    expect(pane, 'the pane lost the attribute the ownership guard queries').not.toBeNull();
    expect(pane!.getAttribute('role')).toBeNull();
    expect(pane!.getAttribute('aria-modal')).toBeNull();
  });

  it('does not take focus when it opens', async () => {
    /*
     * The absence that makes the whole thing work: the operator peeks, focus STAYS on the
     * row, and the verbs above never went away. A pane that focused itself would hand the
     * keyboard to the pane on every peek, the guard would stand the surface down constantly,
     * and docking would be strictly worse than the drawer — while looking correct in a
     * screenshot.
     */
    await renderDocked();
    act(() => rowAt(0).focus());
    // Re-open with a different target, which is what a peek does.
    act(() => useInspectorStore.setState({ stack: [{ type: 'project', id: 'p-2' }] }));
    expect(document.activeElement, 'the evidence pane stole focus from the row on peek').toBe(rowAt(0));
  });

  it('Escape does nothing to it, and the pane says which key does', async () => {
    /*
     * The trade, asserted rather than described. Registering with the dismiss stack is the
     * only way Escape could close this, and one entry there is what silences the queue
     * verbs — see the first describe block. So Escape is a no-op here, and the key that
     * does work is rendered ON the pane, for the same reason the tour panel says "Skip".
     */
    await renderDocked();
    press('Escape');
    expect(useInspectorStore.getState().stack, 'Escape cleared a pane that is not on the dismiss stack').toHaveLength(1);
    expect(screen.getByRole('button', { name: /undock the evidence pane/i })).toBeInTheDocument();
  });
});
