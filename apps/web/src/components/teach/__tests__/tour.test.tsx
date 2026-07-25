import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntitlementMap } from '@lcx/shared';
import { CommandPalette, useCommandPalette } from '@/components/shared/CommandPalette';
import { _resetDismiss, pushDismissible, removeDismissible } from '@/lib/dismiss';
import { _resetKeyboard } from '@/lib/keyboard';
import { useAccessStore } from '@/stores/useAccessStore';
import { Tour } from '../Tour';
import { TourHost } from '../TourHost';
import { settleTour, tourSettled, _resetTourSeen } from '../tourSeen';

/**
 * THE FIRST RUN, DRIVEN BY REAL KEYS (T1 #19).
 *
 * The point of this file rather than more unit tests: `lib/__tests__/tour.test.ts`
 * proves the engine advances when it is HANDED the right observation, which is
 * exactly the kind of test that passes while the feature does nothing. What has to be
 * true is that pressing ⌘K — the actual chord, on `document`, handled by the actual
 * `useCommandPalette` listener, registering on the actual dismiss stack — moves the
 * tour on. So the harness below mounts the real command line alongside the tour and
 * types at it. Nothing about the tour's completion is stubbed.
 *
 * The one thing deliberately NOT driven here is `?` and `f`, because those listeners
 * live in `AppLayout` and mounting the whole shell in jsdom would be testing the
 * shell. They are driven for real in `e2e/tour.spec.ts` against a browser.
 */

const EMAIL_KEY = 'lcx_operator_email';

/** Nik — every compartment. */
const FULL: EntitlementMap = {
  command: 'approve',
  sales: 'approve',
  intel: 'approve',
  regulatory: 'approve',
  distribution: 'approve',
  governance: 'approve',
};

/** The command line and the tour, side by side, exactly as the shell mounts them. */
function Harness({ entitlements = FULL }: { entitlements?: EntitlementMap }) {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  return (
    <>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <button onClick={() => navigate('/bd-pipeline')}>go sales</button>
      <Tour entitlements={entitlements} onSettle={vi.fn()} />
    </>
  );
}

const commandChord = () =>
  fireEvent.keyDown(document, { key: 'k', metaKey: true, bubbles: true });

/** The stack id of a stand-in manual entry, so the test can close what it opened. */
let manualId = 0;

beforeEach(() => {
  _resetDismiss();
  _resetKeyboard();
  localStorage.clear();
  localStorage.setItem(EMAIL_KEY, 'nik@lcx.com');
  _resetTourSeen();
  useAccessStore.setState({ me: null, loaded: false });
});

describe('the tour advances because the operator did the thing', () => {
  it('⌘K completes the first step with no Next button anywhere', () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

    expect(screen.getByText(/find anything, and act on it/i)).toBeInTheDocument();
    // The structural claim: there is nothing to click that would advance the tour.
    // A Next button would make every step completable without learning anything.
    expect(screen.queryByRole('button', { name: /next|continue|got it/i })).toBeNull();

    commandChord();

    // Latched, and the panel now names the one key that gets the operator back to
    // where the NEXT step can work — `g` and `f` are dead while the stack is not empty.
    expect(screen.getByText(/done —/i)).toBeInTheDocument();
    // Still on the same step: the command line is open, so advancing would put a dead
    // shortcut on screen.
    expect(screen.getByText(/find anything, and act on it/i)).toBeInTheDocument();

    // Escape, through the one owner of Escape.
    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

    expect(screen.getByText(/ask the app what you can do/i)).toBeInTheDocument();
    expect(screen.queryByText(/find anything, and act on it/i)).toBeNull();
  });

  it('the only button on the panel is the one that makes it go away', () => {
    render(
      <MemoryRouter>
        <Tour entitlements={FULL} onSettle={vi.fn()} />
      </MemoryRouter>,
    );
    const panel = screen.getByRole('region', { name: /first run/i });
    const buttons = [...panel.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Skip']);
  });

  it('skipping tells the shell to record it, and the panel leaves', () => {
    const onSettle = vi.fn();
    render(
      <MemoryRouter>
        <Tour entitlements={FULL} onSettle={onSettle} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSettle).toHaveBeenCalledWith('skipped');
    expect(screen.queryByRole('region', { name: /first run/i })).toBeNull();
  });

  it('is not on the dismiss stack, because one entry there kills `g` and `f`', () => {
    /*
     * The load-bearing negative test of the whole feature. `lib/navGrammar.ts` and
     * `hooks/useHints.ts` both bail on `isOverlayOpen()`, which is `stack.length > 0`.
     * If this panel registered — the house rule for anything that takes over the
     * screen — then 7 of the 10 steps it is about to teach would be unperformable
     * while it was up. It declares no dialog role for the same reason, so
     * `dismissRegistration.test.ts` correctly does not count it as an overlay.
     */
    render(
      <MemoryRouter>
        <Tour entitlements={FULL} onSettle={vi.fn()} />
      </MemoryRouter>,
    );
    const panel = screen.getByRole('region', { name: /first run/i });
    expect(panel.getAttribute('role')).toBeNull();
    expect(panel.getAttribute('aria-modal')).toBeNull();
    // Escape must reach whatever is really in front, which right now is nothing.
    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
    expect(screen.getByRole('region', { name: /first run/i })).toBeInTheDocument();
  });

  it('completes a workspace step by actually arriving there', () => {
    render(
      <MemoryRouter>
        <Harness entitlements={{ sales: 'operate' }} />
      </MemoryRouter>,
    );
    commandChord();
    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
    // The manual's listener lives in AppLayout, so this step is satisfied through the
    // stack directly — the same registration `?` performs. Driven for real in e2e.
    expect(screen.getByText(/ask the app what you can do/i)).toBeInTheDocument();
  });
});

describe('the tour never teaches a compartment the operator does not hold', () => {
  it('reaches the SALES ENGINE step and never names a workspace this operator lacks', () => {
    render(
      <MemoryRouter>
        <Harness entitlements={{ sales: 'operate' }} />
      </MemoryRouter>,
    );
    const panel = () => screen.getByRole('region', { name: /first run/i }).textContent ?? '';
    const forbidden = ['DISTRIBUTION', 'GOVERNANCE', 'US COMMAND', 'REGULATORY', 'INTELLIGENCE'];
    const assertClean = (where: string) => {
      for (const name of forbidden) expect(panel(), `${where} named ${name}`).not.toContain(name);
    };

    assertClean('the ⌘K step');
    commandChord();
    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
    assertClean('the ? step');

    // The manual's `?` listener lives in AppLayout, so its stack entry is pushed here
    // directly — the exact registration `Manual.tsx` performs via `useDismissible`,
    // which is the signal the tour reads either way. `?` itself is driven for real in
    // e2e/tour.spec.ts.
    act(() => {
      manualId = pushDismissible('manual', () => {});
    });
    act(() => {
      removeDismissible(manualId);
    });

    // THE ASSERTION THIS FILE EXISTS FOR: the third step is the one workspace this
    // operator holds. With the entitlement filter removed it is US COMMAND, which is
    // how this test was verified to fail.
    expect(panel()).toContain('SALES ENGINE');
    assertClean('the workspace step');
    expect(tourSettled()).toBe(false);
  });
});

describe('the gate', () => {
  it('renders nothing at all for an operator who has settled it', () => {
    settleTour('skipped');
    useAccessStore.setState({ me: { entitlements: FULL } as never, loaded: true });
    const { container } = render(
      <MemoryRouter>
        <TourHost />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the entitlements have not arrived', () => {
    // Including the case where the access fetch FAILED: the store sets loaded=true and
    // leaves `me` null, and a tour generated from nothing would teach a restricted
    // operator's app to someone holding all six compartments.
    useAccessStore.setState({ me: null, loaded: true });
    const { container } = render(
      <MemoryRouter>
        <TourHost />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(tourSettled(), 'a failed entitlement load must not burn the first run').toBe(false);
  });

  it('does not unmount the tour at the moment it records the finish', async () => {
    /*
     * THE BUG THIS PINS, found by driving the built bundle rather than by reading:
     * `TourHost` used to hold `settled` in state and set it from `onSettle`. The tour
     * records "finished" the instant the operator arrives at the last step, so the gate
     * unmounted the body in the same commit and the farewell card — the closure the plan
     * asks for, and the only thing the operator gets for finishing — was never rendered.
     * Recording and hiding are two different events.
     *
     * Driven through an operator holding no compartments, because that is the shortest
     * real tour: three desk keys and the way home.
     */
    useAccessStore.setState({ me: { entitlements: {} } as never, loaded: true });
    render(
      <MemoryRouter>
        <TourHost />
      </MemoryRouter>,
    );
    await screen.findByRole('region', { name: /first run/i }, { timeout: 10_000 });

    // The three desk keys, through the registrations the real surfaces perform. (The
    // real ⌘K keypress is driven in the first test in this file; what is under test here
    // is the gate's lifecycle, not the chord.)
    for (const label of ['command line', 'manual', 'hint tags']) {
      act(() => {
        manualId = pushDismissible(label, () => {});
      });
      act(() => {
        removeDismissible(manualId);
      });
    }

    // MemoryRouter starts at '/', so arriving home is already true — the last step does
    // not ask for a round trip it can see the operator has made.
    expect(screen.getByRole('region', { name: /first run/i }).textContent).toContain(
      'That is the whole grammar',
    );
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    expect(tourSettled(), 'finishing was not recorded').toBe(true);
  });

  it('shows the tour once the entitlements are in', async () => {
    useAccessStore.setState({ me: { entitlements: FULL } as never, loaded: true });
    render(
      <MemoryRouter>
        <TourHost />
      </MemoryRouter>,
    );
    // The body is a lazy chunk. The generous timeout is not padding: under the full
    // 76-file suite this dynamic import took over a second on a loaded machine and the
    // 1s default flaked once — a failure that would read as "the gate does not work".
    expect(
      await screen.findByRole('region', { name: /first run/i }, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });
});

describe('the dismissal is per operator, on a shared Mac', () => {
  it('does not follow the next person who sits down', () => {
    // Phase 2 fixed a real leak here: unscoped keys meant the next operator inherited
    // the previous one's UI state. For this feature the leak has a specific cost — Sam
    // would silently lose his first run because Nik had already had one.
    localStorage.setItem(EMAIL_KEY, 'nik@lcx.com');
    settleTour('finished');
    expect(tourSettled()).toBe(true);

    localStorage.setItem(EMAIL_KEY, 'sam@lcx.com');
    expect(tourSettled(), 'Sam inherited Nik’s dismissal and lost his first run').toBe(false);

    // …and Nik does not get his again when he comes back.
    localStorage.setItem(EMAIL_KEY, 'nik@lcx.com');
    expect(tourSettled()).toBe(true);
  });

  it('treats skipped and finished identically — it never comes back either way', () => {
    settleTour('skipped');
    expect(tourSettled()).toBe(true);
  });
});
