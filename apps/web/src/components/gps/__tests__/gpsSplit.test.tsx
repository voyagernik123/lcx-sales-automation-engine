import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _resetDismiss, isOverlayOpen, pushDismissible } from '@/lib/dismiss';
import { GO_WINDOW_MS } from '@/lib/navGrammar';
import { SPLIT_MIN_WIDTH } from '@/lib/split';
import { useUIStore } from '@/stores';
import {
  DESK_KEYS_NOT_STOOD_DOWN,
  GPS_INSPECTOR_PANE_ATTR,
  GPS_SPLIT_KEY,
  GpsSplit,
} from '../GpsSplit';
import { GPS_SPLIT_TOGGLE_ATTR, type GpsLens } from '../GpsInspector';
import { gpsKeysBelongToSurface } from '../gpsPaneFocus';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SPLIT — tested on the four things that make it an instrument
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  1. ONE KEY, TWO CONTAINERS, NEVER BOTH. The list stays on screen and the object moves
 *     beside it; the drawer and the pane are mutually exclusive by construction.
 *  2. IT DOES NOT BECOME A SECOND KEYBOARD OWNER. It binds `i` and nothing else. The
 *     drawer's own dismiss-stack entry is forgiven — that is the moment the key is FOR —
 *     and every other overlay still refuses, in BOTH directions. The docked direction is
 *     the one `hooks/useSplitView.ts` records having shipped broken, so it is asserted
 *     separately rather than assumed to follow.
 *  3. FOCUS SURVIVES THE MODE CHANGE AND COMES BACK ON CLOSE. Not stolen when the pane
 *     merely appears — that is what keeps peeking free — but caught when the container
 *     holding it is unmounted, and handed back to the row on close.
 *  4. THE PANE IS CHROME. No dialog role, nothing on the dismiss stack, so the desk's own
 *     grammar keeps working beside it.
 *
 * EVERY ASSERTION HERE FAILED BEFORE THE COMPONENT EXISTED, and the mechanisms were each
 * verified by reverting them: drop the overlay exception and (2) reports the key refusing
 * with the drawer open; drop `focusHeldByInspector`'s container branch and (3) reports
 * focus on `<body>`; put the pane on the dismiss stack and (4) reports `isOverlayOpen()`
 * true, which is what silences the desks' digits.
 */

interface Row { id: string; client: string }

const lens: GpsLens<Row> = (r) => ({
  kind: 'engagement',
  title: r.client,
  fields: [{ label: 'Client', value: r.client, standing: { kind: 'measured', source: 'gps_engagement.client_id' } }],
  refusals: [],
  links: [],
});

const ROW: Row = { id: 'e-1', client: 'Acme' };
/** A second row, so "open another one into the docked pane" is a real state change. */
const ROW2: Row = { id: 'e-2', client: 'Borden' };

const setWidth = (px: number) =>
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });

const pane = () => document.querySelector(`[${GPS_INSPECTOR_PANE_ATTR}]`);
const drawer = () => screen.queryByRole('dialog', { name: /engagement · Acme/i });
const toggleBtn = () => document.querySelector<HTMLElement>(`[${GPS_SPLIT_TOGGLE_ATTR}]`);

function press(key = GPS_SPLIT_KEY, init: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

/** How many times the desk's list mounted. A toggle that remounts it loses its state. */
let listMounts = 0;

function List({ onOpen }: { onOpen: (r: Row) => void }) {
  useEffect(() => { listMounts += 1; }, []);
  return (
    <>
      <button type="button" onClick={() => onOpen(ROW)}>open Acme</button>
      <button type="button" onClick={() => onOpen(ROW2)}>open Borden</button>
    </>
  );
}

/** A desk: a list, a selection, and the split that shows both. */
function Desk() {
  const [subject, setSubject] = useState<Row | null>(null);
  return (
    <GpsSplit
      label="engagements"
      list={<List onOpen={setSubject} />}
      subject={subject}
      lens={lens}
      onClose={() => setSubject(null)}
    />
  );
}

/** Open the object the way an operator does — from a control on the list. */
function openFromList(which: 'Acme' | 'Borden' = 'Acme') {
  act(() => { screen.getByText(`open ${which}`).click(); });
}

beforeEach(() => {
  _resetDismiss();
  listMounts = 0;
  setWidth(1440);
  useUIStore.setState({ evidenceDocked: false });
});

afterEach(() => { _resetDismiss(); });

describe('one key, two containers, never both', () => {
  it('opens over the list, and `i` moves it beside the list without closing it', () => {
    render(<Desk />);
    openFromList();
    expect(drawer()).toBeTruthy();
    expect(pane()).toBeNull();

    press();
    expect(pane()).toBeTruthy();
    expect(drawer()).toBeNull();
    // The whole point: the list is still there, and so is the object.
    expect(screen.getByText('open Acme')).toBeTruthy();
    expect(pane()!.textContent).toContain('Acme');

    press();
    expect(drawer()).toBeTruthy();
    expect(pane()).toBeNull();
  });

  it('does not remount the desk\'s list when the mode changes', () => {
    render(<Desk />);
    openFromList();
    expect(listMounts).toBe(1);
    press();
    press();
    // A conditional wrapper around the list would have thrown away its scroll position
    // and its own keyboard cursor on every toggle.
    expect(listMounts).toBe(1);
  });

  it('renders neither container when nothing is open', () => {
    render(<Desk />);
    expect(drawer()).toBeNull();
    expect(pane()).toBeNull();
    press();
    expect(pane()).toBeNull();
  });
});

describe('it does not become a second keyboard owner', () => {
  it('is forgiven the drawer\'s own dismiss-stack entry — the moment the key is for', () => {
    render(<Desk />);
    openFromList();
    // The drawer registers exactly one entry through `InspectorDrawer` → `useDismissible`.
    expect(isOverlayOpen()).toBe(true);
    press();
    expect(pane()).toBeTruthy();
  });

  it('refuses behind a foreign overlay in the drawer direction', () => {
    render(<Desk />);
    openFromList();
    act(() => { pushDismissible('the ? manual', () => {}); });
    press();
    expect(pane()).toBeNull();
    expect(drawer()).toBeTruthy();
  });

  it('refuses behind a foreign overlay in the DOCKED direction too', () => {
    // The regression `useSplitView.ts` measured: docked, this component contributes ZERO
    // stack entries, so forgiving one there forgives an entry belonging to something else
    // and reshapes the desk behind a scrim.
    render(<Desk />);
    openFromList();
    press();
    expect(pane()).toBeTruthy();
    expect(isOverlayOpen()).toBe(false);

    act(() => { pushDismissible('the ? manual', () => {}); });
    press();
    expect(pane()).toBeTruthy();
    expect(drawer()).toBeNull();
  });

  it('stands down while the operator is typing', () => {
    render(<Desk />);
    openFromList();
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: GPS_SPLIT_KEY, bubbles: true, cancelable: true }));
    });
    expect(pane()).toBeNull();
    input.remove();
  });

  it('does not answer the tail of a mistyped `g` sequence', () => {
    // `lib/navGrammar.ts` returns `claim: false` for an unrecognised second key, so it
    // neither preventDefaults nor stops propagation and `g i` reaches this listener. Its
    // own docstring calls running "whatever x happens to be bound to" the one outcome an
    // operator cannot predict; this is that, closed.
    //
    // DOCKED, because that is the only state where it can happen: behind the drawer
    // `isOverlayOpen()` is true, so the grammar refuses to arm at all — the first draft of
    // this test asserted from the drawer side and could not fail.
    render(<Desk />);
    openFromList();
    press();
    expect(pane()).toBeTruthy();
    press('g');
    press();
    expect(pane()).toBeTruthy();
    expect(drawer()).toBeNull();
  });

  it('answers again once the `g` window has expired', () => {
    render(<Desk />);
    openFromList();
    press();
    press('g');
    // The guard reads `Date.now()` and the window is the constant imported from the
    // grammar itself, so the two cannot drift apart.
    const real = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(real + GO_WINDOW_MS + 1);
    press();
    expect(pane()).toBeNull();
    expect(drawer()).toBeTruthy();
    clock.mockRestore();
  });

  it('does not arm on a `g` that was itself typed into a field', () => {
    // The mirror inherits the grammar's precedence: typing wins, so this `g` never armed
    // there and must not have armed here either.
    render(<Desk />);
    openFromList();
    press();
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }));
    });
    press();
    expect(pane()).toBeNull();
    expect(drawer()).toBeTruthy();
    input.remove();
  });

  it('leaves every modified press to whoever owns it', () => {
    render(<Desk />);
    openFromList();
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }]) {
      press(GPS_SPLIT_KEY, init);
      expect(pane()).toBeNull();
    }
  });
});

describe('the pane is chrome, not an overlay', () => {
  it('declares no dialog role and puts nothing on the dismiss stack', () => {
    render(<Desk />);
    openFromList();
    press();
    const el = pane()!;
    expect(el.tagName).toBe('ASIDE');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-modal')).toBeNull();
    // One entry here and `isOverlayOpen()` would silence the section digits on
    // `GpsDelivery` and `d`/`p` on `GpsLoop` — the keys docking exists to preserve.
    expect(isOverlayOpen()).toBe(false);
  });

  it('has a name, so a screen reader can tell the two halves apart', () => {
    render(<Desk />);
    openFromList();
    press();
    expect(screen.getByText('engagements · inspector')).toBeTruthy();
  });
});

describe('focus', () => {
  it('travels with the operator across the mode change', () => {
    render(<Desk />);
    openFromList();
    // `InspectorDrawer` focuses its own panel on open, which is the body's CONTAINER —
    // the case the naive predicate missed.
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        press();
        expect(pane()).toBeTruthy();
        expect(document.activeElement).toBe(toggleBtn());
        expect(document.activeElement).not.toBe(document.body);
        resolve();
      });
    });
  });

  it('is NOT taken when the pane merely appears with focus outside it', () => {
    render(<Desk />);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    openFromList();
    press();
    expect(pane()).toBeTruthy();
    outside.focus();
    // A DIFFERENT object opening into an already-docked pane must not pull the keyboard off
    // the desk — that is what makes peeking free (`lib/split.ts`). A different row, so the
    // subject really changes and React does not simply bail out of the re-render.
    openFromList('Borden');
    expect(pane()!.textContent).toContain('Borden');
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('contains no focus call that could fire on open — asserted against this source', () => {
    // An ABSENCE, so it cannot be verified by reverting a line: there is nothing to
    // revert. `splitFocus.test.tsx` pins the evidence pane's equivalent absence the same
    // way. Exactly two `focus()` calls are permitted here, and both are documented above
    // the code that makes them: the mode-change handoff and the close restore. A third
    // would be the pane stealing the keyboard on every peek.
    const src = readFileSync(join(__dirname, '..', 'GpsSplit.tsx'), 'utf8');
    expect(src).not.toContain('autoFocus');
    expect(src.match(/\.focus\(\)/g) ?? []).toHaveLength(2);
  });

  it('gives focus back to the row when the pane is closed', () => {
    render(<Desk />);
    const opener = screen.getByText('open Acme');
    opener.focus();
    openFromList();
    press();
    // Focus has to genuinely LEAVE the row first, or the assertion is satisfied by a
    // click that never moved it — jsdom's `.click()` does not focus, so an earlier draft
    // of this test passed with the restore deleted.
    const close = screen.getByLabelText('Close the engagements inspector');
    act(() => { close.focus(); });
    expect(document.activeElement).toBe(close);
    act(() => { close.click(); });
    // Focus is now orphaned: the node holding it left the document with the pane.
    expect(document.activeElement === document.body || !document.activeElement?.isConnected).toBe(true);
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(document.activeElement).toBe(opener);
        resolve();
      });
    });
  });

  it('does not yank focus back if the operator moved it deliberately', () => {
    render(<Desk />);
    const opener = screen.getByText('open Acme');
    opener.focus();
    openFromList();
    press();
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    act(() => { screen.getByLabelText('Close the engagements inspector').click(); });
    elsewhere.focus();
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(document.activeElement).toBe(elsewhere);
        elsewhere.remove();
        resolve();
      });
    });
  });

  it('can be closed from the pane without a mouse — the close control is a real button', () => {
    render(<Desk />);
    openFromList();
    press();
    const close = screen.getByLabelText('Close the engagements inspector');
    expect(close.tagName).toBe('BUTTON');
    // Said on the control, because Escape does NOT reach this pane and an operator who has
    // learned Escape everywhere else needs telling once rather than by pressing it.
    expect(close.getAttribute('title')).toContain('Escape does not close this pane');
    act(() => { close.focus(); close.click(); });
    expect(pane()).toBeNull();
  });
});

describe('when a split would be worse than a drawer, it is absent rather than unhelpful', () => {
  it('offers nothing below the measured breakpoint', () => {
    setWidth(SPLIT_MIN_WIDTH - 1);
    render(<Desk />);
    openFromList();
    expect(toggleBtn()).toBeNull();
    press();
    expect(pane()).toBeNull();
    expect(drawer()).toBeTruthy();
  });

  it('stands down while the universal evidence pane already holds that half of the screen', () => {
    useUIStore.setState({ evidenceDocked: true });
    render(<Desk />);
    openFromList();
    // Two panes at 1424 leaves the desk a strip, so the split does not fight `⌘\` for it.
    expect(toggleBtn()).toBeNull();
    press();
    expect(pane()).toBeNull();
    expect(drawer()).toBeTruthy();
  });

  it('offers the toggle as a button as well as a key, so docking is not keyboard-only', () => {
    render(<Desk />);
    openFromList();
    const btn = toggleBtn()!;
    expect(btn.textContent).toContain(GPS_SPLIT_KEY);
    act(() => { btn.click(); });
    expect(pane()).toBeTruthy();
  });
});

describe('the recorded absence is closed, in the files that had the problem', () => {
  /*
   * THIS WAS THE NEGATIVE FORM. It asserted `DESK_KEYS_NOT_STOOD_DOWN` had two entries and
   * that neither `GpsLoop.tsx` nor `GpsDelivery.tsx` contained `keysBelongToSurface` — a
   * correct record of a defect the split's lane could not reach, since the fix is a guard
   * inside two page files. The wiring pass owned them and added it, so the assertion is
   * inverted here rather than deleted: the guard coming back out is the regression, and the
   * empty list is only true while both calls are there.
   */
  it('each desk that binds a bare letter now stands it down for a docked pane', () => {
    const root = join(__dirname, '..', '..', '..', 'pages');
    const loop = readFileSync(join(root, 'GpsLoop.tsx'), 'utf8');
    const delivery = readFileSync(join(root, 'GpsDelivery.tsx'), 'utf8');

    expect(DESK_KEYS_NOT_STOOD_DOWN).toHaveLength(0);

    // The keys are still bound — the fix was a guard, not a removal.
    expect(loop).toContain("e.key === 'd'");
    expect(loop).toContain("e.key === 'p'");
    expect(delivery).toContain('SECTIONS.find((s) => s.key === e.key)');

    // And both now ask. `gpsKeysBelongToSurface` covers BOTH docked panes; the universal
    // one is the reason this mattered before any desk mounted the GPS split.
    expect(loop).toContain('if (!gpsKeysBelongToSurface()) return;');
    expect(delivery).toContain('if (!gpsKeysBelongToSurface()) return;');
    // `GpsLoop` had no overlay guard at all, so `p` opened a print dialog behind a scrim.
    expect(loop).toContain('if (isOverlayOpen()) return;');
  });

  it('the guard really answers false inside the GPS pane, docked', () => {
    // Not just present in the source — it works. THE MUTATION THAT PROVES THIS: drop the
    // `closest(GPS_INSPECTOR_PANE_ATTR)` branch from `gpsPaneFocus.ts` and this goes red.
    setWidth(SPLIT_MIN_WIDTH);
    render(<Desk />);
    openFromList();
    act(() => { toggleBtn()!.click(); });
    const inside = pane()!.querySelector('button')!;
    expect(gpsKeysBelongToSurface(inside)).toBe(false);
    expect(gpsKeysBelongToSurface(document.body)).toBe(true);
  });

  it('and true when nothing is docked, which is every desk on most days', () => {
    expect(gpsKeysBelongToSurface(null)).toBe(true);
  });
});

describe('the key is not one this app already owns', () => {
  it('is not the chord that moves the universal inspector', () => {
    // `⌘\` has exactly one call site by construction (`lib/__tests__/split.test.ts`) and it
    // moves `useInspectorStore`, which GPS rows are not in.
    expect(GPS_SPLIT_KEY).not.toBe('\\');
  });

  it('is not a letter the shell or the GPS desks already bind', () => {
    const shell = join(__dirname, '..', '..', '..');
    const hints = readFileSync(join(shell, 'hooks', 'useHints.ts'), 'utf8');
    expect(hints).toContain(`export const HINT_KEY = 'f'`);
    // Measured against the two desks that bind bare letters.
    const loop = readFileSync(join(shell, 'pages', 'GpsLoop.tsx'), 'utf8');
    expect(loop).not.toContain(`e.key === '${GPS_SPLIT_KEY}'`);
    expect(['f', 'g', 'd', 'p', 'j', 'k', 's', 'e']).not.toContain(GPS_SPLIT_KEY);
  });
});

describe('the lens is called with the desk\'s own row and nothing else', () => {
  it('passes the row through untouched in both containers', () => {
    const spy = vi.fn(lens);
    const { rerender } = render(
      <GpsSplit label="engagements" list={<span>list</span>} subject={ROW} lens={spy} onClose={() => {}} />,
    );
    expect(spy).toHaveBeenCalledWith(ROW);
    spy.mockClear();
    press();
    rerender(
      <GpsSplit label="engagements" list={<span>list</span>} subject={ROW} lens={spy} onClose={() => {}} />,
    );
    expect(pane()).toBeTruthy();
    expect(spy).toHaveBeenCalledWith(ROW);
  });
});
