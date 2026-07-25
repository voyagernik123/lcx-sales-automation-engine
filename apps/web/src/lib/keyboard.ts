/**
 * Keyboard authority (TERMINAL Phase 3).
 *
 * Deliberately tiny and dependency-free, because it is one of very few modules
 * that must stay in the EAGER bundle: the command line itself is lazily loaded,
 * so something already-resident has to own the key that opens it and has to be
 * able to answer "is the command line open?" without importing it.
 *
 * It also settles a conflict the recon found. Three components install
 * capture-phase Escape handlers that call stopPropagation
 * (deals/DealReviewMemo, lineage/Derived, queue/SnoozeMenu), so a single Escape
 * could close two overlays at once — the local one swallowing the key before the
 * command line ever saw it. They now defer while the command line is open, which
 * needs a shared flag rather than a React context, since capture-phase listeners
 * run outside the tree.
 */

/**
 * True while the command line is showing. Module-level rather than in a store: it
 * is read from raw DOM event handlers that have no access to React context, and
 * it must be readable synchronously in the middle of an event.
 */
let commandOpen = false;

export function isCommandOpen(): boolean {
  return commandOpen;
}

export function setCommandOpen(open: boolean): void {
  commandOpen = open;
}

/**
 * Is the event target something the operator is typing into?
 *
 * Promoted out of components/queue/logic.ts so the eager keyboard layer can use
 * it without pulling the queue module (and its data imports) into the initial
 * bundle. The queue re-exports from here, so there is still one definition.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  // Coerced: `isContentEditable` is typed boolean by the DOM lib but is undefined
  // on a plain element in jsdom, so the bare `||` chain returned undefined from a
  // function that promises a boolean.
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

/** The chord that opens the command line, on either platform. */
export function isCommandChord(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
}

/**
 * Guard against a double-fire of the open chord.
 *
 * In LCX TERMINAL the same ⌘K can arrive twice — once from the native menu item
 * (added in Phase 1 so the shortcut is discoverable) and once from the webview's
 * own keydown. Toggling twice in the same instant would open and immediately
 * close, which reads as "the shortcut is broken".
 */
const CHORD_DEDUPE_MS = 250;
/**
 * -Infinity, not 0: with 0 the very first press is indistinguishable from a
 * repeat of a press that happened at epoch, so `now - lastChordAt` is 0 and the
 * first chord gets swallowed. Harmless with a real clock, wrong with any injected
 * one — and wrong logic that only works by accident is a trap for the next reader.
 */
let lastChordAt = Number.NEGATIVE_INFINITY;

export function acceptCommandChord(now: number = Date.now()): boolean {
  if (now - lastChordAt < CHORD_DEDUPE_MS) return false;
  lastChordAt = now;
  return true;
}

/** Test-only. */
export function _resetKeyboard(): void {
  commandOpen = false;
  lastChordAt = Number.NEGATIVE_INFINITY;
}
