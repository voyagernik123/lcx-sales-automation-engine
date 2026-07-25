import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { HintTags } from '../HintTags';
import { HINT_LABEL } from '@/lib/hints';
import { _resetDismiss, dismissStack, isOverlayOpen, pushDismissible, topDismissible } from '@/lib/dismiss';

/**
 * The rendered hint layer (TERMINAL Phase 7).
 *
 * `lib/__tests__/hints.test.ts` covers the arithmetic. This file covers the two things
 * that are properties of the COMPONENT and that a pure test cannot see:
 *
 *  1. the layer is on the dismiss stack while it is up, so Escape closes it and the
 *     Phase 6 manual can report it;
 *  2. it is OFF the stack by the time it activates anything.
 *
 * (2) is the non-obvious one and it is why activation happens in an unmount cleanup
 * rather than in the keydown handler. `useListNavigation` refuses Enter while
 * `isOverlayOpen()` (src/hooks/useListNavigation.ts:199), and hint mode is an open
 * overlay by that definition — so activating from the handler would make the Enter
 * fallback silently do nothing on exactly the table rows it exists for. The ordering
 * relies on React destroying a fiber's effects in declaration order, which is a claim
 * about React rather than about this code, so it is asserted here.
 *
 * jsdom has no layout, so `getBoundingClientRect` is stubbed. That is a real limit:
 * these tests cannot tell you that a chip lands on the right pixel. e2e/hints.spec.ts
 * does that in a browser.
 */

/** Mirrors HintLayer: closing unmounts the body, which is what runs the cleanup. */
function Harness({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <HintTags
      onClose={() => {
        setOpen(false);
        onClosed?.();
      }}
    />
  );
}

/** Lay `n` buttons out in a vertical stack that a 800x600 viewport contains. */
function stackOfButtons(n: number, opts: { offscreenAfter?: number; host?: HTMLElement } = {}): HTMLElement[] {
  const host = opts.host ?? document.createElement('div');
  if (!opts.host) {
    host.id = 'targets';
    document.body.appendChild(host);
  }
  const made: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button');
    b.textContent = `t${i}`;
    b.dataset.probe = String(i);
    host.appendChild(b);
    const offscreen = opts.offscreenAfter !== undefined && i >= opts.offscreenAfter;
    // 20px apart, so 24 of them still fit inside the 600px viewport below. At 30px the
    // last four fell off the bottom and were correctly filtered out — which made three
    // tests fail for the right reason and the wrong cause.
    const top = offscreen ? 5000 + i * 30 : 20 + i * 20;
    vi.spyOn(b, 'getBoundingClientRect').mockReturnValue({
      top,
      left: 40,
      width: 90,
      height: 24,
      bottom: top + 24,
      right: 130,
      x: 40,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
    made.push(b);
  }
  return made;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  _resetDismiss();
});

const chips = () => Array.from(document.querySelectorAll('[data-hint-tag]')).map((e) => e.getAttribute('data-hint-tag'));

describe('the layer draws a tag per target', () => {
  it('tags what is in view and nothing that is not', () => {
    stackOfButtons(6, { offscreenAfter: 4 });
    render(<Harness />);
    // Four on screen, two parked at y=5000. The whole point of viewport filtering:
    // tagging 198 controls including off-screen ones produces three-character tags and
    // a screen of codes for things nobody can see.
    expect(chips()).toHaveLength(4);
    expect(chips().every((t) => t!.length === 2)).toBe(true);
  });

  it('says so out loud when there is nothing to tag', () => {
    render(<Harness />);
    // Closing silently would read as "the key is broken". The layer stays up and
    // explains itself.
    expect(document.querySelector('[data-hint-status]')!.textContent).toContain('nothing actionable in view');
  });

  it('reports how many are left as the prefix narrows', () => {
    stackOfButtons(24);
    render(<Harness />);
    expect(document.querySelector('[data-hint-status]')!.textContent).toContain('24 of 24');
    fireEvent.keyDown(document, { key: 'a' });
    expect(document.querySelector('[data-hint-status]')!.textContent).toContain('2 of 24');
  });
});

describe('typing a prefix filters', () => {
  it('removes the chips that can no longer match', () => {
    stackOfButtons(24);
    render(<Harness />);
    expect(chips()).toHaveLength(24);
    fireEvent.keyDown(document, { key: 'a' });
    // 24 targets over a 12-letter alphabet: one keystroke leaves exactly the two whose
    // tag starts with `a`. Removing them rather than dimming them is deliberate — a
    // dimmed chip at `text-navy-deep/50` on the amber fill measures 3.16:1, below the
    // 4.5:1 this repo holds text to.
    expect(chips()).toEqual(['aa', 'al']);
  });

  it('backspace puts the eliminated chips back', () => {
    stackOfButtons(24);
    render(<Harness />);
    fireEvent.keyDown(document, { key: 'a' });
    expect(chips()).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Backspace' });
    expect(chips()).toHaveLength(24);
  });
});

describe('activation', () => {
  it('clicks the element whose tag was typed', () => {
    const buttons = stackOfButtons(24);
    const clicked: string[] = [];
    for (const b of buttons) b.addEventListener('click', () => clicked.push(b.dataset.probe!));
    render(<Harness />);

    // `al` is index 12 with a 12-letter alphabet and the first character varying
    // fastest. Asserting the INDEX rather than "some button" is the point: an off-by-one
    // in the tag scheme would still click something and still look like it worked.
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'l' });
    expect(clicked).toEqual(['12']);
  });

  it('is off the dismiss stack before it activates anything', () => {
    /*
     * THE invariant. If this fails, the Enter fallback in `activateTarget` is dead on
     * every `useListNavigation` row, because that hook refuses Enter while
     * `isOverlayOpen()` — and the failure is silent: the click half still works, so
     * most targets keep behaving and only the keydown-driven ones quietly do nothing.
     */
    const buttons = stackOfButtons(2);
    let stackAtClick: string[] | null = null;
    let overlayAtClick: boolean | null = null;
    buttons[0]!.addEventListener('click', () => {
      stackAtClick = dismissStack().map((e) => e.label);
      overlayAtClick = isOverlayOpen();
    });
    render(<Harness />);
    expect(topDismissible()).toBe(HINT_LABEL);

    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(stackAtClick, 'the click never happened').not.toBeNull();
    expect(stackAtClick).toEqual([]);
    expect(overlayAtClick).toBe(false);
  });

  it('does not activate anything when the layer closes for another reason', () => {
    // The cleanup fires on every unmount, including a route change. Only a completed
    // tag may queue a target.
    const buttons = stackOfButtons(2);
    let clicks = 0;
    buttons[0]!.addEventListener('click', () => clicks++);
    const r = render(<Harness />);
    fireEvent.keyDown(document, { key: 'a' });
    r.unmount();
    expect(clicks).toBe(0);
  });

  it('a dead-end prefix closes without activating', () => {
    // Two targets means only `aa` and `la` exist. `a` then `l` matches nothing, and the
    // key must be swallowed rather than reaching a page that binds it.
    const buttons = stackOfButtons(2);
    let clicks = 0;
    for (const b of buttons) b.addEventListener('click', () => clicks++);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'l' });
    expect(closed).toHaveBeenCalled();
    expect(clicks).toBe(0);
  });
});

/**
 * A stand-in for the partner dossier: a full-screen backdrop carrying the stacking class,
 * a `role="dialog"` panel that confines Tab, controls inside it, and controls on the page
 * BEHIND it that the layer must not offer. Built as raw DOM rather than by rendering
 * `PartnerDossier` on purpose — the property under test belongs to the layer and to
 * `resolveHintScope`, and a test that mounted the real dossier would pass or fail on that
 * component's fetches.
 */
function overlayOverPage(opts: { z?: string; inside?: number; behind?: number } = {}) {
  const behind = stackOfButtons(opts.behind ?? 3);
  const backdrop = document.createElement('div');
  backdrop.className = `fixed inset-0 ${opts.z ?? 'z-40'}`;
  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Partner dossier: stand-in');
  // tabIndex -1 for the same reason the real one carries it, and it also keeps the panel
  // itself out of HINT_SELECTOR.
  panel.tabIndex = -1;
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  const inside = stackOfButtons(opts.inside ?? 5, { host: panel });
  // A container getter is what makes this entry TRAP — the same thing `topTraps()` reads
  // and the condition `useHints` now arms on.
  const id = pushDismissible('partner dossier', () => {}, () => panel);
  return { behind, inside, panel, id };
}

describe('inside an overlay, the layer scopes rather than standing down', () => {
  /*
   * WHY THIS BLOCK EXISTS. `f` used to refuse to arm whenever anything was on the dismiss
   * stack, and `e2e/keyboardday.spec.ts` measured what that cost: the partner dossier is 24
   * Tab stops and the biggest single contributor to a 52-press RFI flow, and it was the one
   * surface the layer could not see. The veto is replaced by a scope, so the assertions
   * that matter are (a) the scope really is the overlay and not the page, and (b) the
   * keystroke safety property still holds — which is the half that, if it broke, would
   * mutate records rather than merely annoy.
   */

  it('tags the controls in the overlay and nothing on the page behind it', () => {
    const { inside, behind } = overlayOverPage({ inside: 5, behind: 3 });
    render(<Harness />);
    expect(chips()).toHaveLength(5);
    // Not just the count: the tag has to belong to an element INSIDE the dialog. Counting
    // alone would pass if the layer tagged three page buttons and two dialog ones.
    const clicked: Element[] = [];
    for (const b of [...inside, ...behind]) b.addEventListener('click', () => clicked.push(b));
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(clicked).toEqual([inside[0]]);
  });

  it('does not offer the page underneath even when the overlay has nothing to tag', () => {
    // The empty-dialog case is the one where falling back to `document` would look like a
    // reasonable kindness and would be exactly the old hazard: chips on controls Tab is
    // trapped away from.
    overlayOverPage({ inside: 0, behind: 6 });
    render(<Harness />);
    expect(chips()).toHaveLength(0);
    expect(document.querySelector('[data-hint-status]')!.textContent).toContain('nothing actionable in view');
  });

  it('a swallowed key still never reaches a page verb, or the overlay’s own', () => {
    /*
     * THE non-negotiable property, re-asserted for the case that did not exist before. The
     * page-level version of this test (further down) was the one that proved
     * `preventDefault()` alone was not enough: BdPipeline binds `s` snooze / `d` disqualify
     * as a BUBBLE listener on `window` and never checks `defaultPrevented`.
     *
     * Arming inside a dialog adds a second class of listener to protect against — the
     * OVERLAY's own keys, bound between the document and the window. A capture-phase
     * listener on `document` runs before both, so both are covered by the same mechanism;
     * that is the argument, and this is the measurement of it.
     */
    const { panel } = overlayOverPage();
    render(<Harness />);

    const reachedPage: string[] = [];
    const reachedOverlay: string[] = [];
    const pageVerb = (e: Event) => reachedPage.push((e as KeyboardEvent).key);
    const overlayVerb = (e: Event) => reachedOverlay.push((e as KeyboardEvent).key);
    window.addEventListener('keydown', pageVerb);
    panel.addEventListener('keydown', overlayVerb);
    try {
      for (const key of ['d', 's', 'e', 'j', 'k', '3']) {
        // Dispatched from inside the dialog, which is where the operator's focus is.
        panel.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true }));
      }
      expect(reachedOverlay, `reached the dialog’s own verbs: ${reachedOverlay.join(',')}`).toEqual([]);
      expect(reachedPage, `reached a page verb from hint mode inside a dialog: ${reachedPage.join(',')}`).toEqual([]);
    } finally {
      window.removeEventListener('keydown', pageVerb);
      panel.removeEventListener('keydown', overlayVerb);
    }
  });

  it('leaves hint mode’s own entry, and only that one, before activating', () => {
    /*
     * The page version of this asserts the stack is EMPTY at activation time. Inside an
     * overlay it cannot be — the overlay is still open — so the invariant is narrower and
     * is stated as what it is: hint mode is gone, the overlay remains. The consequence is
     * recorded in HintTags.tsx: `useListNavigation` refuses Enter while `isOverlayOpen()`,
     * so the Enter FALLBACK is dead for a row tagged inside an overlay. The click half,
     * which is every ordinary control, is unaffected.
     */
    const { inside } = overlayOverPage({ inside: 2 });
    let labelsAtClick: string[] | null = null;
    inside[0]!.addEventListener('click', () => {
      labelsAtClick = dismissStack().map((e) => e.label);
    });
    render(<Harness />);
    expect(dismissStack().map((e) => e.label)).toEqual(['partner dossier', HINT_LABEL]);

    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(labelsAtClick, 'the click never happened').not.toBeNull();
    expect(labelsAtClick).toEqual(['partner dossier']);
  });

  it('refuses, and says so, when two overlays are open at once', () => {
    // Document order is not paint order, and this module cannot rank them — `lib/dismiss`
    // can, but exposes `topTraps()` as a boolean rather than the container. Ambiguity draws
    // nothing, which is exactly the old behaviour.
    overlayOverPage({ inside: 4 });
    const second = document.createElement('div');
    second.className = 'fixed inset-0 z-50';
    second.setAttribute('role', 'dialog');
    document.body.appendChild(second);
    render(<Harness />);
    expect(chips()).toHaveLength(0);
    expect(document.querySelector('[data-hint-status]')!.textContent).toContain('no tag scope');
  });

  it('refuses when the overlay paints above the layer, rather than drawing invisible chips', () => {
    // The manual is `z-[120]` and the chips are `z-[110]`. Tagging it would render a status
    // pill saying "4 of 4" and not one visible chip — a feature that looks broken instead
    // of one that is honestly absent.
    overlayOverPage({ inside: 4, z: 'z-[120]' });
    render(<Harness />);
    expect(chips()).toHaveLength(0);
    expect(document.querySelector('[data-hint-status]')!.textContent).toContain('no tag scope');
  });

  it('refuses when what is open never declared itself an overlay', () => {
    // SessionMode's letter-key surface and the tooltips are on the stack; something on it
    // without overlay ARIA gives the scope nothing to resolve to.
    stackOfButtons(4);
    pushDismissible('lead session', () => {});
    render(<Harness />);
    expect(chips()).toHaveLength(0);
    expect(document.querySelector('[data-hint-status]')!.textContent).toContain('no tag scope');
  });
});

describe('getting out', () => {
  it('registers on the dismiss stack under a label the manual can report', () => {
    stackOfButtons(2);
    render(<Harness />);
    expect(dismissStack().map((e) => e.label)).toEqual([HINT_LABEL]);
  });

  it('closes when the stack dismisses it, which is how Escape reaches it', () => {
    stackOfButtons(2);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    // Escape is dispatched at the document, where lib/dismiss's single listener lives.
    // Nothing in this component listens for Escape — that is the house rule.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(dismissStack()).toEqual([]);
  });

  it('the hint key itself toggles it off', () => {
    stackOfButtons(2);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    fireEvent.keyDown(document, { key: 'f' });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a scroll cancels it, because every chip position is now a lie', () => {
    stackOfButtons(4);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    // Dispatched on a nested element to prove the CAPTURE listener is doing the work:
    // scroll does not bubble, and this app's scroller is MainContent rather than the
    // window, so a bubbling document listener would never see it.
    fireEvent.scroll(document.getElementById('targets')!);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a resize cancels it', () => {
    stackOfButtons(4);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    fireEvent(window, new Event('resize'));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a pointer press cancels it', () => {
    stackOfButtons(4);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    fireEvent.pointerDown(document.body);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a modifier chord closes it without swallowing the chord', () => {
    // ⌘K must still open the command line from hint mode.
    stackOfButtons(4);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(e);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented, 'the chord was swallowed').toBe(false);
  });

  it('swallows an off-alphabet letter so a fumbled tag cannot run a page verb', () => {
    // `d` disqualifies a lead on the queue surfaces. This is the assertion that says a
    // mistyped tag cannot reach it.
    stackOfButtons(4);
    render(<Harness />);
    const e = new KeyboardEvent('keydown', { key: 'd', cancelable: true, bubbles: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  /*
   * The above was NOT enough, and this is the test that proved it.
   *
   * `preventDefault()` is not `stopPropagation()`. BdPipeline installs its triage
   * grammar as a BUBBLE listener on `window` (src/pages/BdPipeline.tsx:438) and gates it
   * on its own local dialog state only — it never asks `isOverlayOpen()`. `window` is the
   * last node in the bubble path, AFTER `document`, so the hint layer's handler runs
   * first, marks the event handled, and BdPipeline's handler runs anyway and does not
   * look at `defaultPrevented`. Measured: a fumbled `d` in hint mode opened the
   * disqualify dialog for the selected lead, which is exactly the outcome lib/hints.ts
   * rung 5 says it prevents.
   *
   * So the layer claims the key in the CAPTURE phase and stops propagation. Asserted
   * against a stand-in with the real listener's shape — `window`, bubble, no
   * `defaultPrevented` check — because the point is that the layer protects a page it
   * knows nothing about.
   */
  it('a page verb bound on window never sees a swallowed key', () => {
    stackOfButtons(4);
    render(<Harness />);

    const reached: string[] = [];
    const pageVerb = (e: Event) => {
      if (e.defaultPrevented) {
        // Deliberately NOT returning: BdPipeline does not check this, and a fix that
        // only works for pages that do is not a fix.
      }
      reached.push((e as KeyboardEvent).key);
    };
    window.addEventListener('keydown', pageVerb);
    try {
      // Off-alphabet letters the queue binds, plus a digit (1-4 switch splits).
      for (const key of ['d', 's', 'e', 'j', 'k', '3']) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true }));
      }
      expect(reached, `these keys reached a page-level verb from inside hint mode: ${reached.join(',')}`).toEqual([]);
    } finally {
      window.removeEventListener('keydown', pageVerb);
    }
  });

  it('still lets Escape, Tab, ⌘K and `?` through to their owners', () => {
    /*
     * The other half of stopping propagation: the layer must stop only what it claims.
     * Escape belongs to lib/dismiss and Tab to its focus trap (both document BUBBLE), ⌘K
     * to the command line, and `?` to `useManual` — which is also a document BUBBLE
     * listener, and which is the key this fix nearly broke. A capture-phase grab that ate
     * any of the four would trade one defect for several.
     *
     * `?` is the load-bearing one: `useManual` is deliberately the one global key that
     * does NOT stand down for overlays, and e2e/hints.spec.ts asserts you can press `?`
     * out of hint mode and land in the manual.
     */
    stackOfButtons(4);
    render(<Harness />);

    const seen: string[] = [];
    const spy = (e: Event) => seen.push((e as KeyboardEvent).key);
    window.addEventListener('keydown', spy);
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true }));
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true, bubbles: true }),
      );
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', cancelable: true, bubbles: true }));
      expect(seen).toEqual(['Tab', 'k', '?']);
    } finally {
      window.removeEventListener('keydown', spy);
    }
  });

  it('`?` closes hint mode on its way to the manual', () => {
    // Yielding the key must not also mean ignoring it: the tags have to come down, or the
    // manual opens underneath a screen of stale chips.
    stackOfButtons(4);
    const closed = vi.fn();
    render(<Harness onClosed={closed} />);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', cancelable: true, bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
