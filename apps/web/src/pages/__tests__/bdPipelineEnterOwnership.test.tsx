import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { BdPipeline } from '../BdPipeline';
import { useBdStore } from '@/stores/useBdStore';
import { useInspectorStore } from '@/stores';
import { _resetDismiss, pushDismissible } from '@/lib/dismiss';
import * as bdApi from '@/lib/api/bd';
import * as queueApi from '@/lib/api/queue';

/**
 * WHO OWNS ENTER ON THIS PAGE.
 *
 * `BdPipeline`'s `window` listener called `preventDefault()` on `case 'Enter'` whenever a
 * lead was selected — regardless of what focus was on. The skip link is the FIRST Tab stop
 * in the whole app and its entire job is jumping past 24 stops of chrome
 * (`AppLayout` counts them). It is a plain fragment anchor, so the browser performs the
 * jump as the key's DEFAULT ACTION. Cancel that default and Enter on the skip link opens a
 * lead detail page instead of skipping the chrome: the operator's fast way in became a
 * navigation they did not ask for, and the one affordance the shell offers keyboard users
 * was unusable exactly when the queue had a selection — which is most of the time.
 *
 * `e2e/keyboardday.spec.ts:539-546` already names this as a live hazard, found while
 * mutation-testing that file. This is the unit guard for it.
 *
 * THE FIX IS ABOUT OWNERSHIP, NOT ABOUT THE SKIP LINK. A listener on `window` is the last
 * node in the bubble path; by the time it runs, anything closer to the operator has had
 * its say. Enter and Space mean "activate me" to every link, button and summary in the
 * document, so the page must not claim them when focus is on something that owns them.
 * `isTypingTarget` already draws the analogous line for text entry. Special-casing the
 * skip link's `href` would fix one anchor and leave every other one broken.
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
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});

afterEach(() => {
  _resetDismiss();
  document.querySelectorAll('[data-probe-chrome]').forEach((el) => el.remove());
  vi.restoreAllMocks();
});

async function renderQueue() {
  const view = render(<BdPipeline />);
  await settle();
  return view;
}

/**
 * Wait until the table is not about to vanish.
 *
 * NOT padding, and the flake it removes was real and instructive: this page refetches once
 * on mount (a `setPage(0)` effect fires on the filter identity), and while `loading` is true
 * the working split renders a `TableSkeleton` INSTEAD of the table. So "rows are present" is
 * a state the page passes through twice, and a harness that only waited for it could press
 * `j`, have the selection taken correctly, and then read `aria-selected` off a table that
 * had been replaced by a skeleton. It only ever bit under full-suite load — the first
 * symptom was `expected [] to deeply equal [ 'p-0' ]` in one of seven tests, which reads
 * exactly like the guard's verdict and is not.
 *
 * Waiting on `loading` as well as on the rows pins the settled state rather than either
 * pass through it.
 */
async function settle(): Promise<void> {
  await waitFor(() => {
    expect(useBdStore.getState().loading).toBe(false);
    expect(document.querySelectorAll('[data-list-row]').length).toBe(ROWS);
  }, { timeout: 10_000 });
}

/**
 * The shell's skip link, mounted OUTSIDE the page the way `AppLayout` mounts it.
 *
 * Built here rather than by rendering `AppLayout`, which would drag the router, the
 * sidebar, TopNav and the workspace guard into a test about one keystroke. What matters
 * is reproduced exactly: a real `<a href="#…">` that is not a descendant of BdPipeline,
 * so the page's `window` listener is the only thing between the key and the browser.
 */
function mountSkipLink(): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('data-probe-chrome', '');
  a.href = '#main-content';
  a.textContent = 'Skip to content';
  document.body.prepend(a);
  return a;
}

/**
 * Let `Modal`'s `requestAnimationFrame` actually run.
 *
 * Not padding, and its absence was a decoration. The container-focus race is entirely about a
 * rAF landing AFTER React's commit, so an assertion that reads `document.activeElement`
 * synchronously reads the state BEFORE the theft. Mutation-tested: with `Modal`'s
 * `contains(document.activeElement)` condition removed — the shipped defect restored — the
 * `TEXTAREA` assertion below still PASSED. It was measuring the one moment the bug is not yet
 * visible. Two frames because `lib/dismiss`'s restore path defers one of its own.
 */
async function frame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  });
}

/** Dispatch a key at a real target, bubbling to `window` as the browser does. */
function press(key: string, target: EventTarget): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

/**
 * The precondition every assertion here shares: a lead is selected.
 *
 * That is the whole reason the defect survived — `case 'Enter'` only fires when
 * `selectedId` resolves to a row, so a queue with nothing selected behaves correctly and
 * the bug is invisible until the operator has done the first thing they always do.
 *
 * A synchronous assertion rather than `waitFor`, deliberately. `press` wraps the dispatch
 * in `act`, so the selection is committed by the time it returns; a `waitFor` here raced
 * the page's own re-render and failed with `expected +0 to be 1` — a flake that would have
 * been read as this guard's verdict rather than as the harness's.
 */
async function selectFirst(): Promise<void> {
  await settle();
  press('j', document.body);
  expect(
    Array.from(document.querySelectorAll('tr[aria-selected="true"]')).map((r) => r.getAttribute('data-lead-id')),
    'the precondition failed: `j` did not select a lead, so nothing below tests what it claims',
  ).toEqual(['p-0']);
}

describe('Enter on the skip link skips the chrome, even with a lead selected', () => {
  it('does not cancel the anchor’s default navigation', async () => {
    await renderQueue();
    const link = mountSkipLink();

    // A selection is the precondition: `case 'Enter'` only fired when one existed, which
    // is why this survived — a queue with nothing selected behaves correctly.
    await selectFirst();

    act(() => link.focus());
    const e = press('Enter', link);

    expect(
      e.defaultPrevented,
      'the page cancelled Enter on the skip link — the browser can no longer perform the fragment jump, ' +
        'so the one affordance that skips 24 chrome stops does nothing',
    ).toBe(false);
    expect(
      navigate.mock.calls,
      'Enter on the skip link navigated into a lead instead of skipping the chrome',
    ).toEqual([]);
  });

  it('leaves Enter alone for any activatable control in the chrome, not just this anchor', async () => {
    // A button, a summary and a link all treat Enter as "activate me". Fixing the anchor by
    // its href would have left the other two broken, so the guard covers the class.
    await renderQueue();
    await selectFirst();

    const cases: Array<[string, HTMLElement]> = [
      ['a[href]', (() => { const a = document.createElement('a'); a.href = '#x'; a.setAttribute('data-probe-chrome', ''); return a; })()],
      ['button', (() => { const b = document.createElement('button'); b.setAttribute('data-probe-chrome', ''); return b; })()],
      ['summary', (() => {
        const d = document.createElement('details');
        d.setAttribute('data-probe-chrome', '');
        const s = document.createElement('summary');
        s.tabIndex = 0;
        d.append(s);
        document.body.append(d);
        return s;
      })()],
    ];
    for (const [what, el] of cases) {
      if (!el.isConnected) document.body.append(el);
      act(() => el.focus());
      const e = press('Enter', el);
      expect(e.defaultPrevented, `the page claimed Enter aimed at a focused ${what}`).toBe(false);
    }
    expect(navigate.mock.calls).toEqual([]);
  });

  it('Space is equally not the page’s when an activatable control has focus', async () => {
    // Space PEEKS on this page, and it is the OTHER key that activates a focused button.
    // A page-level claim on it is the same defect wearing a different key.
    await renderQueue();
    await selectFirst();

    const b = document.createElement('button');
    b.setAttribute('data-probe-chrome', '');
    document.body.append(b);
    act(() => b.focus());
    const e = press(' ', b);
    expect(e.defaultPrevented, 'the page claimed Space aimed at a focused button in the chrome').toBe(false);
    expect(useInspectorStore.getState().stack, 'Space on a chrome button peeked a lead').toEqual([]);
  });
});

describe('and Enter still opens the selected lead everywhere it should', () => {
  it('opens from <body> — the j/k path, where nothing else owns the key', async () => {
    // The negative half. A guard that made Enter unreachable would pass every assertion
    // above and break the surface's primary verb.
    await renderQueue();
    await selectFirst();

    press('Enter', document.body);
    expect(navigate.mock.calls).toEqual([['/bd-pipeline/p-0']]);
  });

  it('opens when focus is on a non-activatable element such as <main>', async () => {
    // Where `enterMain()` leaves focus: a `tabIndex={-1}` container. Enter means nothing
    // to it, so the page keeps the key.
    await renderQueue();
    const main = document.createElement('div');
    main.setAttribute('data-probe-chrome', '');
    main.tabIndex = -1;
    document.body.append(main);
    await selectFirst();

    act(() => main.focus());
    press('Enter', main);
    expect(navigate.mock.calls).toEqual([['/bd-pipeline/p-0']]);
  });

  it('and the triage verbs are NOT given up merely because a button has focus', async () => {
    // The scoping decision, pinned. `d` means nothing to a button, so standing down for
    // every key whenever focus sits on a control would kill the triage grammar across the
    // whole page — a far bigger regression than the bug being fixed. Only the two keys a
    // control actually owns are conceded.
    await renderQueue();
    await selectFirst();

    const b = document.createElement('button');
    b.setAttribute('data-probe-chrome', '');
    document.body.append(b);
    act(() => b.focus());
    press('d', b);
    const dialog = document.querySelector('[role="dialog"]');
    // Existence asserted before content: `toContain` on `undefined` reports a chai type
    // complaint rather than the defect, which is a guard that goes red with the wrong words.
    expect(dialog, '`d` stopped working because focus was on a button somewhere on the page').not.toBeNull();
    expect(dialog!.textContent).toContain('will be suppressed from the queue');
  });

  /**
   * THE PRESS COST, pinned as a number rather than described.
   *
   * Phase C measured 69 presses to triage one lead, 7 of them wasted recovering from the
   * focus defect above.
   *
   * NO NEW END-TO-END TOTAL IS CLAIMED, and an earlier version of this comment claimed one:
   * "re-measured by `e2e/keyboardday.spec.ts` flow 1 on one machine: 66 → 59". That number is
   * withdrawn because flow 1 CANNOT BE RUN in this environment and therefore cannot have
   * produced it. Measured: every seated Playwright spec now stops on the desk's sign-in gate
   * ("AUTHORIZED ACCESS ONLY … Both are verified server-side"), because P7 made the desk
   * passcode server-verified while `e2e/seat.ts` still seeds a literal `'e2e-no-api'` into
   * localStorage, and the local API answers `/v1/me` with 401. `keyboardday.spec.ts` flow 1
   * and all 8 of `populated.spec.ts` fail at "rows not visible", upstream of any keystroke.
   * A press total that only an unrunnable spec can produce is exactly the "verified against
   * the idea of the artifact" failure this programme keeps finding, so it is not asserted
   * here and not reported as a result.
   *
   * What IS measured is below, in jsdom, against the real components: the cheap path costs 2
   * presses, and the Tab presses spent inside the dialog reaching its only required field went
   * 7 → 0 — that half follows directly from the field being focused on open, which is asserted
   * rather than described.
   *
   * The remaining Tab traversal from `<main>` to the first queue row is in-page chrome, and
   * cutting it means restructuring the highest-traffic surface in the app for a keystroke
   * count — the churn Phase 5 declined on `DealBoard` for the same reason. So it is NOT done.
   *
   * What IS worth pinning is that the cheap path already exists and does not require the
   * traversal at all: the grammar is live from any non-activatable focus, so `j` then `d`
   * reaches the dialog in TWO presses, without tabbing to the table at all. (No "instead of
   * N" is given: the Tab-stop count between `<main>` and the first row is a real-browser
   * measurement, and jsdom cannot produce it — `offsetParent` is null for every element, which
   * is the same environment gap that made this file's sibling `modalFocus` Tab test vacuous
   * until it was stubbed.) That is the path `TriageBar` advertises,
   * and it is now the thing most easily broken by a future guard on this listener — the
   * over-broad version of my own fix broke exactly it (mutation M4). Hence a test, not a
   * comment.
   */
  it('costs 2 presses from <main> to an open disqualify dialog, and 4 to a write', async () => {
    await renderQueue();
    const main = document.createElement('div');
    main.setAttribute('data-probe-chrome', '');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.append(main);
    act(() => main.focus());

    let presses = 0;
    press('j', main); presses++;
    press('d', main); presses++;
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog, 'j then d from <main> did not open the disqualify dialog').not.toBeNull();
    expect(presses, 'the cheap path to the dialog got more expensive').toBe(2);

    // And the write completes without a single Tab, because the field is focused on open —
    // which is the whole of defect A expressed as a number. The `frame()` is what makes this
    // an assertion rather than a decoration: see its comment.
    await frame();
    const field = document.activeElement as HTMLTextAreaElement;
    expect(field.tagName, 'the dialog did not open with its required field focused').toBe('TEXTAREA');
    // `fireEvent.change`, not `field.value = …`: React's controlled `value` is set through a
    // descriptor on the prototype, so assigning the property directly updates the DOM and
    // never reaches `onChange` — the reason this assertion first failed with an unfired mock.
    act(() => {
      fireEvent.change(field, { target: { value: 'Dead project' } });
    });
    press('Enter', field); // no modifier: must NOT submit
    expect(vi.mocked(queueApi.disqualifyProject), 'bare Enter submitted a destructive dialog').not.toHaveBeenCalled();

    const submit = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true });
    act(() => { field.dispatchEvent(submit); });
    presses += 2; // the typed reason aside: ⌘⏎ plus the bare Enter probe above
    await waitFor(() => expect(vi.mocked(queueApi.disqualifyProject)).toHaveBeenCalledWith('p-0', 'Dead project'));
    // Asserted, because the title of this test states it. Without this the "4" is a comment.
    expect(presses, 'the keystroke cost of a complete disqualify changed').toBe(4);
  });

  it('still stands down under an overlay and for typing targets', async () => {
    // The Phase A guards this change must not regress.
    await renderQueue();
    await selectFirst();

    const id = pushDismissible('someone else’s overlay', () => {});
    press('Enter', document.body);
    expect(navigate.mock.calls, 'Enter opened a lead under an overlay').toEqual([]);
    act(() => {
      // Same call `useDismissible`'s cleanup makes.
      void id;
      _resetDismiss();
    });

    const input = document.createElement('input');
    input.setAttribute('data-probe-chrome', '');
    document.body.append(input);
    act(() => input.focus());
    press('Enter', input);
    expect(navigate.mock.calls, 'Enter typed into a field opened a lead').toEqual([]);

    /*
     * AND THE HALF THAT ACTUALLY PINS `isTypingTarget`, which the two assertions above do
     * NOT. Measured by mutation: deleting `if (isTypingTarget(e.target)) return;` from the
     * listener left all eight tests in this file GREEN. The reason is my own guard —
     * `ACTIVATION_OWNER` lists `input`, `select` and `textarea`, so for Enter and Space it
     * SHADOWS `isTypingTarget` completely. An `Enter`-into-an-input probe therefore proves
     * the new guard and says nothing about the old one, while reading exactly as though it
     * proved both.
     *
     * What `isTypingTarget` uniquely holds is every OTHER key: `d`, `s`, `e`, `j`, `1`-`4`
     * are letters an operator types into the queue's search box, and they are not keys a
     * text field "owns" in the activation sense, so the new guard deliberately does not
     * concede them. Typing the letter `d` into a field must not open a destructive dialog.
     */
    press('d', input);
    expect(
      document.querySelector('[role="dialog"]'),
      'typing the letter `d` into a text field opened the disqualify dialog — `isTypingTarget` is not holding',
    ).toBeNull();

    /*
     * Contenteditable is the other thing only `isTypingTarget` knows about: no tag name gives
     * it away, and `ACTIVATION_OWNER` does not list it.
     *
     * `isContentEditable` is defined explicitly because jsdom does not derive it from the
     * attribute — `lib/keyboard.ts` says so in a comment and `lib/__tests__/keyboard.test.ts`
     * stubs it the same way. Without the stub this probe went red reporting "`d` typed into a
     * contenteditable opened the disqualify dialog", which would have been read as a product
     * defect and is purely the environment. Recorded because that is a plausible false finding
     * on the exact surface this file is about.
     */
    const rich = document.createElement('div');
    rich.setAttribute('data-probe-chrome', '');
    rich.setAttribute('contenteditable', 'true');
    Object.defineProperty(rich, 'isContentEditable', { value: true });
    rich.tabIndex = 0;
    document.body.append(rich);
    act(() => rich.focus());
    press('d', rich);
    expect(
      document.querySelector('[role="dialog"]'),
      '`d` typed into a contenteditable opened the disqualify dialog',
    ).toBeNull();
    expect(navigate.mock.calls).toEqual([]);
  });
});
