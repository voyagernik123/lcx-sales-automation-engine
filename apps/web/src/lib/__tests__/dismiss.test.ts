import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetDismiss,
  dismissStack,
  dismissTop,
  pushDismissible,
  removeDismissible,
  topDismissible,
  topTraps,
} from '../dismiss';

/**
 * The contract of the dismiss stack (TERMINAL Phase 4).
 *
 * The bug being locked out: Escape had sixteen claimants and no owner, so which
 * overlay it closed was decided by listener registration order — mount order —
 * which bears no relation to what is on top of the screen. Three components had
 * already noticed and papered over it with capture-phase `stopPropagation` plus a
 * shared `isCommandOpen()` flag they each had to remember to consult.
 *
 * These tests are written against the real `document`, not a mock, because the
 * whole point of the module is how it interacts with the browser's event
 * dispatch — a mocked `addEventListener` would assert the implementation rather
 * than the behaviour, and would have happily passed with the capture/bubble
 * mistake still in place.
 */

function press(key = 'Escape', target: EventTarget = document.body): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => _resetDismiss());
afterEach(() => {
  _resetDismiss();
  document.body.innerHTML = '';
});

describe('the dismiss stack', () => {
  it('Escape closes the most recently opened thing, not the first', () => {
    const order: string[] = [];
    pushDismissible('drawer', () => order.push('drawer'));
    pushDismissible('snooze menu', () => order.push('snooze menu'));

    press();
    // The defect this replaces would have fired the drawer, or both.
    expect(order).toEqual(['snooze menu']);
  });

  it('unwinds one layer per press, in reverse order of opening', () => {
    const order: string[] = [];
    const ids: number[] = [];
    ['drawer', 'modal', 'command line'].forEach((label, i) => {
      ids[i] = pushDismissible(label, () => {
        order.push(label);
        // A real dismissible closes itself, which unregisters it. Simulating that
        // is the only honest way to test the unwind: the stack deliberately does
        // not pop on its own (see dismissTop). Each closure must remove ITS OWN
        // id — deriving the index from how many have fired so far removes the
        // bottom entry every time, leaving the top in place to fire forever.
        removeDismissible(ids[i]);
      });
    });
    press();
    press();
    press();
    expect(order).toEqual(['command line', 'modal', 'drawer']);
    expect(dismissStack()).toEqual([]);
  });

  it('claims the Escape it consumes, and leaves alone the one it does not', () => {
    // preventDefault matters: an unclaimed Escape in Safari can mean "stop
    // loading", and an unstopped one lets a second overlay further out react to
    // the same press.
    expect(press(), 'nothing open — Escape must pass through untouched').toBe(false);

    pushDismissible('modal', () => {});
    expect(press(), 'something open — Escape is ours').toBe(true);
  });

  it('ignores every key that is not Escape', () => {
    const dismiss = vi.fn();
    pushDismissible('modal', dismiss);
    for (const key of ['Enter', 'Tab', 'k', 'Backspace', 'Esc']) press(key);
    // 'Esc' is in that list on purpose: it is the legacy IE name and is NOT what
    // any current browser sends. Matching it would be dead code that looks careful.
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('defers to an inner element that already handled the key', () => {
    // This is the InlineEdit / rename-field case: Escape inside a text field means
    // "abandon this edit", not "close the panel around it". Those handlers live on
    // the element and call preventDefault or stopPropagation.
    const dismiss = vi.fn();
    pushDismissible('rename panel', dismiss);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.addEventListener('keydown', (e) => e.preventDefault());

    press('Escape', input);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('is not reachable by a capture-phase listener racing it', () => {
    // The module MUST listen in the bubble phase. If it listened in capture it
    // would beat every element-level handler in the app and break the case above.
    // Asserted by proving an element handler runs first.
    const seen: string[] = [];
    pushDismissible('panel', () => seen.push('stack'));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.addEventListener('keydown', () => seen.push('element'));

    press('Escape', input);
    expect(seen).toEqual(['element', 'stack']);
  });

  it('removes by identity, so closing a lower layer does not disturb the top', () => {
    const low = pushDismissible('drawer', () => {});
    pushDismissible('modal', () => {});
    removeDismissible(low);
    expect(topDismissible()).toBe('modal');
    expect(dismissStack().map((e) => e.label)).toEqual(['modal']);
  });

  it('tolerates a double removal', () => {
    // Effect cleanups can run twice under StrictMode, and a component may close
    // itself and then unmount. Neither may corrupt the stack.
    const id = pushDismissible('modal', () => {});
    removeDismissible(id);
    removeDismissible(id);
    expect(dismissStack()).toEqual([]);
    expect(() => press()).not.toThrow();
  });

  it('reports what Escape would close, for the manual to read', () => {
    pushDismissible('deal drawer', () => {});
    pushDismissible('snooze menu', () => {});
    expect(dismissStack().map((e) => e.label)).toEqual(['deal drawer', 'snooze menu']);
    expect(topDismissible()).toBe('snooze menu');
  });

  it('dismissTop reports the label it fired, and null when empty', () => {
    expect(dismissTop()).toBeNull();
    pushDismissible('modal', () => {});
    expect(dismissTop()).toBe('modal');
  });
});

describe('focus restoration', () => {
  // jsdom has no rAF by default in every config, and the module falls back to
  // setTimeout; fake timers drive whichever it picked.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function settle(): void {
    vi.runAllTimers();
  }

  it('gives focus back to whatever had it when the overlay opened', () => {
    // The bug: fifteen of sixteen overlays dropped focus to <body> on close, after
    // which Tab restarts from the top of the document and a keyboard operator has
    // lost their place completely. Invisible to anyone using a mouse.
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const id = pushDismissible('modal', () => {});
    (document.activeElement as HTMLElement)?.blur();
    expect(document.activeElement).toBe(document.body);

    removeDismissible(id);
    settle();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not yank focus the operator moved deliberately', () => {
    const trigger = document.createElement('button');
    const elsewhere = document.createElement('input');
    document.body.append(trigger, elsewhere);
    trigger.focus();

    const id = pushDismissible('modal', () => {});
    elsewhere.focus(); // the operator tabbed on, or clicked a field

    removeDismissible(id);
    settle();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('does not try to focus an element that has left the document', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const id = pushDismissible('modal', () => {});
    trigger.remove(); // the route changed underneath
    (document.activeElement as HTMLElement)?.blur();

    removeDismissible(id);
    expect(settle).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('restores to the outermost origin when a nest closes at once', () => {
    // Two overlays unwinding together: the deeper one's origin is typically a
    // control inside the panel that just unmounted, so restoring to it would be a
    // no-op or worse. Only the shallowest entry's origin is guaranteed to sit
    // outside everything that left the screen. Chosen by recorded stack depth
    // rather than by removal order, because React's teardown order for a deleted
    // subtree is not something this module should depend on.
    const outer = document.createElement('button');
    outer.id = 'outer';
    const inner = document.createElement('button');
    inner.id = 'inner';
    document.body.append(outer, inner);

    outer.focus();
    const drawerId = pushDismissible('drawer', () => {}); // origin: outer, depth 0
    inner.focus();
    const modalId = pushDismissible('modal', () => {}); // origin: inner, depth 1

    // Remove the SHALLOWER one first, so arrival order and depth order disagree.
    removeDismissible(drawerId);
    removeDismissible(modalId);
    (document.activeElement as HTMLElement)?.blur();
    settle();

    expect((document.activeElement as HTMLElement)?.id).toBe('outer');
  });

  it('treats body as no origin at all', () => {
    // Recording <body> as the origin would make restoration a no-op that looks
    // like it worked, and would mask a genuinely missing origin.
    document.body.focus();
    const id = pushDismissible('modal', () => {});
    removeDismissible(id);
    expect(settle).not.toThrow();
  });
});

describe('the focus trap', () => {
  /**
   * The Phase 7 audit measured this and it was NOT true: with the manual open, one
   * Shift+Tab reached a "Retry" button on the page behind it, and 4 of 5 forward stops
   * were outside the dialog. The auditor correctly refused to add `aria-modal="true"`
   * while that was the case — declaring modality that focus can walk out of makes a
   * screen reader's virtual cursor and the keyboard disagree about where the user is,
   * which is worse than claiming nothing.
   *
   * Tab is handled on the SAME single document listener as Escape, so there is still
   * exactly one place that arbitrates keys between overlays.
   */
  function overlay(...labels: string[]): HTMLElement {
    const root = document.createElement('div');
    root.tabIndex = -1;
    for (const label of labels) {
      const b = document.createElement('button');
      b.textContent = label;
      // jsdom reports offsetParent as null for everything, so the visibility filter
      // has to be satisfied explicitly for the test to exercise the real path.
      Object.defineProperty(b, 'offsetParent', { value: root, configurable: true });
      root.appendChild(b);
    }
    document.body.appendChild(root);
    return root;
  }

  function tab(shift = false): boolean {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  }

  const btn = (root: HTMLElement, i: number) => root.querySelectorAll('button')[i] as HTMLElement;

  it('wraps forward from the last control to the first', () => {
    const root = overlay('one', 'two');
    pushDismissible('modal', () => {}, () => root);
    btn(root, 1).focus();
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(btn(root, 0));
  });

  it('wraps backward from the first control to the last', () => {
    const root = overlay('one', 'two');
    pushDismissible('modal', () => {}, () => root);
    btn(root, 0).focus();
    expect(tab(true)).toBe(true);
    expect(document.activeElement).toBe(btn(root, 1));
  });

  it('leaves Tab alone in the middle of the overlay', () => {
    // Re-implementing intra-overlay Tab order would be a second, worse focus model.
    const root = overlay('one', 'two', 'three');
    pushDismissible('modal', () => {}, () => root);
    btn(root, 0).focus();
    expect(tab(), 'the browser should handle this one').toBe(false);
  });

  it('pulls focus in when it is outside the overlay', () => {
    // The measured defect: focus sitting on the page behind, so Tab continued from
    // there instead of entering the dialog.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const root = overlay('one', 'two');
    pushDismissible('modal', () => {}, () => root);
    outside.focus();
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(btn(root, 0));
  });

  it('does not let Tab escape an overlay with nothing focusable in it', () => {
    const root = overlay();
    pushDismissible('modal', () => {}, () => root);
    expect(tab()).toBe(true);
    expect(document.activeElement, 'focus must land on the container, not the page').toBe(root);
  });

  it('only the TOP overlay traps', () => {
    const lower = overlay('lower-one', 'lower-two');
    pushDismissible('drawer', () => {}, () => lower);
    const upper = overlay('upper-one', 'upper-two');
    pushDismissible('manual', () => {}, () => upper);

    btn(upper, 1).focus();
    tab();
    // A drawer with the manual over it must not fight the manual for the key.
    expect(document.activeElement).toBe(btn(upper, 0));
  });

  it('does not trap for a dismissible that declares no container', () => {
    // A tooltip and a lineage popover belong on the stack — Escape should close them —
    // but confining Tab inside a tooltip would strand the operator.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    pushDismissible('tooltip', () => {});
    expect(tab(), 'Tab must pass through to the browser').toBe(false);
    expect(document.activeElement).toBe(outside);
  });

  it('ignores tabindex="-1" rows, so a roving list does not become 200 stops', () => {
    const root = overlay('real');
    const row = document.createElement('div');
    row.tabIndex = -1;
    Object.defineProperty(row, 'offsetParent', { value: root, configurable: true });
    root.appendChild(row);
    pushDismissible('modal', () => {}, () => root);

    const real = btn(root, 0);
    real.focus();
    // One tabbable control means forward Tab wraps to itself, which proves the
    // tabindex=-1 row was not counted.
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(real);
  });

  it('reports whether the top entry traps, so a component can claim aria-modal honestly', () => {
    expect(topTraps()).toBe(false);
    pushDismissible('tooltip', () => {});
    expect(topTraps(), 'a non-modal entry must not license aria-modal').toBe(false);
    const root = overlay('one');
    pushDismissible('modal', () => {}, () => root);
    expect(topTraps()).toBe(true);
  });

  it('defers to an element that already handled Tab', () => {
    const root = overlay('one', 'two');
    pushDismissible('modal', () => {}, () => root);
    btn(root, 1).focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    e.preventDefault();
    document.body.dispatchEvent(e);
    // A component implementing its own grid navigation keeps its claim.
    expect(document.activeElement).toBe(btn(root, 1));
  });
});
