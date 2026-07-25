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
 * claim (it calls `stopPropagation`, which React forwards to the native event, so
 * the key never reaches us) and the stack the last. Innermost-first is also just
 * what Escape means: back out of the smallest thing you are in.
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
}

let seq = 0;
const stack: Entry[] = [];
let installed = false;

/** Origins queued for restoration, with the stack depth each was removed from. */
let pendingRestore: Array<{ depth: number; origin: Element | null }> = [];
let restoreScheduled = false;

function handleKeyDown(e: KeyboardEvent): void {
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
export function pushDismissible(label: string, dismiss: () => void): number {
  install();
  const id = ++seq;
  stack.push({ id, label, dismiss, origin: activeElement() });
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

/** Introspection: what Escape will close, in order, bottom first. */
export function dismissStack(): readonly DismissEntry[] {
  return stack.map(({ id, label }) => ({ id, label }));
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
  seq = 0;
  pendingRestore = [];
  restoreScheduled = false;
}
