/**
 * What did the operator just touch? (ALIVE Phase 0)
 *
 * WHY THIS EXISTS. The feel layer needs an ELEMENT to animate, but the place that
 * knows a governed write succeeded is `apiClient.request()` — which knows the
 * path, the method and the action id, and nothing whatsoever about the DOM. That
 * mismatch is the entire reason the juice was wired to 5 call sites out of 62
 * pages: every surface had to remember to pass its own ref, and 60 of them
 * didn't.
 *
 * Threading a ref through every call site is the obvious fix and it is the wrong
 * one — it is exactly the "if a call site had to remember" failure that
 * `feedback.ts` already warns about for the three layers. The invariant we want
 * is *every governed write reacts*, and an invariant that depends on 62 authors
 * remembering is not an invariant.
 *
 * So: track the last thing the operator activated, globally, and let the choke
 * point ask. One listener pair, no per-surface work, and surface #63 gets the
 * behaviour for free the day it is written.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not guess. If the element the
 * operator touched is gone by the time the server answers — the row re-rendered,
 * the panel closed, the operator navigated — this returns null and the juice is
 * skipped. Animating a *different* element because it happens to still be there
 * would put a reaction on the wrong object, which is worse than no reaction: in a
 * governed tool, motion on a row is a claim that THAT row changed.
 */

/**
 * Things worth animating, most specific first. A click lands on whatever leaf is
 * under the cursor — a `<span>` inside a `<button>` inside a `<td>` — and the
 * span is never the right target. `[data-juice]` is the explicit escape hatch for
 * a surface that wants to nominate its own element (a whole card, a whole row)
 * without passing a ref anywhere.
 */
/*
 * Two entries are deliberately absent, and the reason is measured. Adding this
 * module took the initial bundle to 850.017KB against an 850KB budget — over by
 * SEVENTEEN bytes — so every character in this selector was audited:
 *
 *   `[role="switch"]` — removed because it is provably redundant. Both switches
 *     in the app (`Settings.tsx:70` and the `Switch` component at :157) are
 *     `<button role="switch">`, so `button` already matches them. Verified by
 *     reading both, not assumed.
 *   `a[href]` → `a` — an anchor with no href is not activatable, so the
 *     narrowing bought nothing; matching any `<a>` is equally correct and shorter.
 *
 * That is 22 bytes, which is what put this under budget. Trimming a selector for
 * bytes would be a bad trade if it cost behaviour; neither of these does.
 */
const TARGETS = '[data-juice],button,a,[role="button"],select,input,textarea,tr,[tabindex]';

/**
 * A plain reference, not a `WeakRef`.
 *
 * `WeakRef` is ES2021 and this app's tsconfig targets ES2020 — widening `lib` for
 * the whole web build to hold one element is the wrong trade. The retention cost
 * is one element, overwritten on the operator's very next interaction, so the
 * worst case is a single detached node surviving until the next click or
 * keystroke. `isConnected` below is what actually matters, and it is required
 * either way: a WeakRef stays live as long as we hold it, so it would not have
 * told us the element had left the document.
 */
let ref: Element | null = null;
let installed = false;

function remember(el: EventTarget | null): void {
  if (!(el instanceof Element)) return;
  // `closest` walks up from the leaf; falling back to the leaf itself is right
  // for a bare div a surface made clickable without any of the roles above.
  ref = el.closest(TARGETS) ?? el;
}

/**
 * Start watching. Idempotent, and safe to call before the DOM exists.
 *
 * CAPTURE phase, both events. Bubble would miss anything that calls
 * `stopPropagation` — which the dismiss stack and the table-stop handlers both
 * do deliberately — and those are precisely the interactions most worth
 * reacting to. Capture cannot be suppressed by a handler further down.
 *
 * `pointerdown` rather than `click`: it fires before the write is dispatched, and
 * it covers the keyboard-less paths (a drag that lands a card in a new column).
 * `keydown` covers everything the command grammar drives, where there is no
 * pointer at all and `document.activeElement` is the honest answer.
 */
export function installActivationTracking(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', (e) => remember(e.target), { capture: true, passive: true });
  document.addEventListener(
    'keydown',
    (e) => {
      // Modifier-only presses are not activations — holding ⌘ before ⌘K should
      // not retarget the juice onto whatever happened to be focused.
      if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') return;
      remember(document.activeElement);
    },
    { capture: true, passive: true },
  );
}

/**
 * The element the operator last activated, or null if it is gone.
 *
 * `isConnected` is the load-bearing check, and it is the common case rather than
 * an edge one: a row commits, the list re-renders, and only then does the server
 * answer. Animating a detached node is a silent no-op that looks exactly like the
 * feature being broken rather than correctly declining.
 */
export function lastActivated(): Element | null {
  return ref && ref.isConnected ? ref : null;
}

/** Test-only. */
export function _resetActivation(): void {
  ref = null;
}
