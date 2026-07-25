/**
 * The dismiss stack (TERMINAL Phase 4).
 *
 * Escape had sixteen claimants and no owner. Nine of them installed their own
 * `document`/`window` keydown listener, three of those in the CAPTURE phase with
 * `stopPropagation()` and a comment conceding the consequence: "one Escape closes
 * two things at once". The patch for that was a module-level `isCommandOpen()`
 * flag each of the three had to remember to consult — a special case that grows
 * by one line per overlay and is silent when someone forgets it.
 *
 * The real problem is that "which overlay does Escape close?" was decided by
 * listener registration order, which is mount order, which has nothing to do with
 * what the operator sees on top. So: one listener, one stack, last-opened-wins.
 * Nothing else in the app may listen for Escape at the document level.
 *
 * Two decisions worth defending, because both look wrong at a glance:
 *
 * BUBBLE, NOT CAPTURE. A document-level capture listener runs before the focused
 * element's own handler, so it would beat the revert-on-Escape behaviour of
 * InlineEdit, the rename fields in SavedScreens, and the token bar — Escape would
 * close the surrounding panel instead of abandoning the edit, and the operator
 * would lose keystrokes. Bubbling gives the innermost interested element the first
 * claim and the stack the last. Innermost-first is also just what Escape means:
 * back out of the smallest thing you are in.
 *
 * BUT THE INNER HANDLERS DO NOT ACTUALLY DEFEND THEMSELVES, and this docstring
 * used to say they did ("it calls `stopPropagation`, which React forwards to the
 * native event, so the key never reaches us"). Measured, Phase F: five inline
 * editors handle Escape with NEITHER `stopPropagation` nor `preventDefault` —
 * `ui/InlineEdit.tsx`, `queue/SavedScreens.tsx` (×2) and `CommandDeck.tsx` (×2).
 * What actually protects them is `handleKeyDown`'s `stack.length === 0` early
 * return, plus the fact that a non-empty stack today always means a modal with a
 * backdrop, which no inline field can hold focus behind. So the property is held
 * up by EMPTINESS, not by the inner handlers.
 *
 * The consequence, and the reason this paragraph is here rather than a TODO: the
 * first NON-MODAL entry pushed onto this stack re-opens "one Escape closes two
 * things" — the exact defect Phase 4 existed to kill — for every one of those five
 * fields. It is why the Phase F evidence pane is deliberately NOT on this stack
 * (`components/inspect/EvidencePane.tsx`) and why a third "dismissible but not
 * keyboard-owning" entry kind was rejected rather than added. Anyone adding one
 * must first make those five fields stop the event themselves.
 *
 * FOCUS RESTORATION LIVES HERE. It is the same lifecycle: something took over the
 * screen, so something has to give focus back when it leaves. Doing it per-overlay
 * meant exactly one of sixteen actually did (InspectorDrawer), and every other
 * close dropped focus to `<body>` — after which Tab restarts from the top of the
 * document and a keyboard operator has lost their place entirely. That is the
 * single worst keyboard defect in the app and it is invisible to anyone using a
 * mouse.
 */

/** What Escape would close right now, top last. For tests and the P6 manual. */
export interface DismissEntry {
  readonly id: number;
  readonly label: string;
}

interface Entry {
  id: number;
  label: string;
  dismiss: () => void;
  /** Where focus was when this opened, so it can be handed back. */
  origin: Element | null;
  /**
   * The overlay's root, when it wants Tab confined to it. Optional because not
   * everything on this stack is modal — a tooltip and a lineage popover are
   * dismissible without being a trap, and confining Tab inside a tooltip would be
   * actively hostile.
   */
  container: (() => Element | null) | null;
}

let seq = 0;
const stack: Entry[] = [];
let installed = false;

/** Origins queued for restoration, with the stack depth each was removed from. */
let pendingRestore: Array<{ depth: number; origin: Element | null }> = [];
let restoreScheduled = false;

/**
 * Elements Tab can actually reach, in document order.
 *
 * `tabindex="-1"` is deliberately excluded — it means "focusable by script, not by
 * Tab", which is exactly the roving-tabindex rows in a list. Including them would put
 * 200 stops back inside a trap that exists to make navigation predictable.
 */
function tabbable(root: Element): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex], audio[controls], video[controls], [contenteditable]',
  );
  return Array.from(candidates).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    if ((el.getAttribute('tabindex') ?? '0').startsWith('-')) return false;
    // `offsetParent` is null for display:none and for anything in a collapsed
    // subtree — cheaper and more reliable here than reading computed styles for
    // every candidate on every Tab press.
    return el.offsetParent !== null || el.tagName === 'AREA';
  });
}

/**
 * Confine Tab to the topmost modal overlay.
 *
 * WHY A KEY HANDLER RATHER THAN `inert`. Setting `inert` on everything else is the
 * modern answer and is one line, but this app's shipping container is a WKWebView on
 * whatever macOS the operator happens to run; `inert` landed in Safari 16.4 and this
 * is not a feature worth a version floor. A Tab handler works everywhere, is testable
 * in jsdom, and needs no cleanup on unmount.
 *
 * Only the TOP entry traps. A drawer with the manual open over it must not fight the
 * manual for the key.
 */
function handleTab(e: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  const root = top?.container?.();
  if (!root) return;

  const items = tabbable(root);
  if (items.length === 0) {
    // Nothing to move to, so Tab must not leave. Park focus on the container itself
    // (it carries tabIndex={-1} for exactly this) rather than letting the browser
    // walk out to the page behind.
    e.preventDefault();
    (root as HTMLElement).focus?.();
    return;
  }

  const active = document.activeElement;
  const first = items[0]!;
  const last = items[items.length - 1]!;

  // Focus outside the overlay entirely — it drifted, or the overlay just opened.
  // Pull it to the appropriate edge rather than letting Tab continue from wherever
  // it was on the page underneath.
  if (!active || !root.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return;
  }

  if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  }
  // Otherwise let the browser do it: native Tab order inside the overlay is correct
  // and re-implementing it would be a second, worse focus model.
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Tab') {
    if (!e.defaultPrevented) handleTab(e);
    return;
  }
  if (e.key !== 'Escape') return;
  // `defaultPrevented` respects any element that already handled this Escape
  // without stopping propagation — a browser-native combobox, say.
  if (e.defaultPrevented) return;
  if (stack.length === 0) return;
  // Claimed: prevents Safari from treating a stray Escape as "stop loading" and
  // stops a second overlay further out from also reacting.
  e.preventDefault();
  e.stopPropagation();
  dismissTop();
}

function install(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Register an open dismissible. Returns a token to hand back on close.
 *
 * Prefer `useDismissible`; this is exported for the handful of non-React callers
 * and for tests.
 */
export function pushDismissible(
  label: string,
  dismiss: () => void,
  container?: () => Element | null,
): number {
  install();
  const id = ++seq;
  stack.push({ id, label, dismiss, origin: activeElement(), container: container ?? null });
  snapshot = null;
  emit();
  return id;
}

/**
 * Unregister a dismissible, whichever way it closed — Escape, a click on the
 * backdrop, choosing an option, or a route change unmounting it. Focus goes back
 * to wherever it came from, if it has been orphaned in the meantime.
 */
export function removeDismissible(id: number): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const [entry] = stack.splice(index, 1);
  snapshot = null;
  emit();
  queueRestore(index, entry.origin);
}

/** Dismiss the topmost entry. Exported so the command grammar can spell it. */
export function dismissTop(): string | null {
  const top = stack[stack.length - 1];
  if (!top) return null;
  // Deliberately does NOT pop: the owner's own close path pops it, via the effect
  // cleanup in useDismissible. Popping here too would double-remove, and worse
  // would hide a controlled overlay whose parent ignores onClose — that overlay
  // SHOULD stay on the stack and keep swallowing Escape, because it is still on
  // screen. `dismissStack()` makes such a leak visible instead of mysterious.
  top.dismiss();
  return top.label;
}

/** Top-of-stack label, or null. */
export function topDismissible(): string | null {
  return stack[stack.length - 1]?.label ?? null;
}

/* ── Subscription ────────────────────────────────────────────────────────────
 * Added in Phase 7 because the manual's Escape section was NOT the report it claimed
 * to be. `Manual.tsx` read `dismissStack()` inside a `useMemo` keyed on `[open, …]`
 * with no way to learn the stack had changed — so with the manual open you could press
 * ⌘K, the real stack would become `['Command line', 'Manual']`, and the manual's text
 * stayed byte-identical: "Nothing else is open, so Escape just closes this manual."
 * It told the operator what Escape would do and was wrong.
 *
 * A subscription rather than polling, and exposed as a plain listener set so the
 * consumer can use `useSyncExternalStore` — which is precisely the React primitive for
 * "an external mutable thing that renders" and gets the tearing semantics right without
 * this module knowing anything about React.
 */

const listeners = new Set<() => void>();

/** Subscribe to stack changes. Returns an unsubscribe. */
export function subscribeDismiss(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  // Copied before iterating: a listener that unsubscribes during notification would
  // otherwise mutate the set mid-loop.
  for (const l of [...listeners]) l();
}

/**
 * A cached snapshot, because `useSyncExternalStore` demands referential stability —
 * returning a fresh array each call makes React re-render forever. Invalidated on every
 * mutation and rebuilt lazily.
 */
let snapshot: readonly DismissEntry[] | null = null;

/**
 * Is anything on screen that owns the keyboard?
 *
 * The global grammar (the `g` prefix, the `f` hints, the single-letter queue keys)
 * must go quiet while an overlay is up, or typing `g` into a dialog navigates the
 * page out from under it. Every component used to hand-build this guard —
 * SessionMode still carries one for its letter keys, and three others checked an
 * `isCommandOpen` flag. Asking the stack is the same question with one answer.
 */
export function isOverlayOpen(): boolean {
  return stack.length > 0;
}

/**
 * Does the topmost entry confine Tab?
 *
 * Exported so a component can decide whether it may honestly claim
 * `aria-modal="true"`. Declaring modality while focus can walk out is worse than not
 * declaring it: it scopes a screen reader's virtual cursor to a panel that the
 * keyboard can still leave, so the two disagree about where the user is.
 */
export function topTraps(): boolean {
  return !!stack[stack.length - 1]?.container?.();
}

/**
 * Introspection: what Escape will close, in order, bottom first.
 *
 * Returns a STABLE reference until the stack actually changes, so it can be used
 * directly as a `useSyncExternalStore` snapshot.
 */
export function dismissStack(): readonly DismissEntry[] {
  if (!snapshot) snapshot = stack.map(({ id, label }) => ({ id, label }));
  return snapshot;
}

function activeElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement;
  // `<body>` is not a place focus meaningfully was; treating it as an origin
  // would make restoration a no-op that looks like it worked.
  return el && el !== document.body ? el : null;
}

function queueRestore(depth: number, origin: Element | null): void {
  if (!origin) return;
  pendingRestore.push({ depth, origin });
  if (restoreScheduled) return;
  restoreScheduled = true;
  // Deferred a frame because at cleanup time the overlay may still hold focus,
  // so "has focus been orphaned?" cannot be answered yet.
  const schedule =
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: () => void) => setTimeout(fn, 0);
  schedule(flushRestore);
}

function flushRestore(): void {
  const queued = pendingRestore;
  pendingRestore = [];
  restoreScheduled = false;
  if (queued.length === 0) return;

  // When a nest of overlays closes together, restore to the origin of the
  // OUTERMOST one — the shallowest stack depth. Its origin is the only one
  // guaranteed to sit outside everything that just left the screen; a deeper
  // entry's origin is typically a control inside a now-unmounted panel. Chosen by
  // recorded depth rather than by arrival order because React's teardown order
  // for a deleted subtree is not something this module should depend on.
  const best = queued.reduce((a, b) => (b.depth < a.depth ? b : a));
  const target = best.origin;
  if (!target?.isConnected) return;

  // Only step in if focus was actually orphaned. If the operator moved it
  // somewhere deliberately — clicked a field, tabbed on — yanking it back would
  // be worse than the bug being fixed.
  const current = document.activeElement;
  if (current && current !== document.body && current.isConnected) return;

  if (typeof (target as HTMLElement).focus === 'function') {
    (target as HTMLElement).focus();
  }
}

/** Test-only. */
export function _resetDismiss(): void {
  stack.length = 0;
  snapshot = null;
  listeners.clear();
  seq = 0;
  pendingRestore = [];
  restoreScheduled = false;
}
