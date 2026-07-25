/**
 * Keyboard authority (TERMINAL Phase 3).
 *
 * Deliberately tiny and dependency-free, because it is one of very few modules
 * that must stay in the EAGER bundle: the command line itself is lazily loaded,
 * so something already-resident has to own the key that opens it and has to be
 * able to answer "is the command line open?" without importing it.
 *
 * It used to also carry an `isCommandOpen` flag, so that three components with
 * capture-phase Escape handlers could defer to the command line. Phase 4 deleted
 * it: `lib/dismiss` now owns Escape for every overlay including this one, and
 * last-opened-wins makes the deferral structural instead of something each new
 * overlay has to remember to ask about. A flag that nothing sets any more is worse
 * than no flag — the next reader would call it and always get `false`.
 */

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
  lastChordAt = Number.NEGATIVE_INFINITY;
}
