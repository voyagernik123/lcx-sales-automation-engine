import { GO_KEYS, type Destination } from './destinations';
import { isOverlayOpen } from './dismiss';
import { isTypingTarget } from './keyboard';

/**
 * The `g` prefix — "go" (TERMINAL Phase 4).
 *
 * The native menu binds ⌘1-6 to the six workspaces, and Phase 4 was supposed to
 * port those chords to the webview so the motion model felt the same in a browser
 * tab as in the app. It cannot be done, and the reason is worth writing down so
 * nobody spends an afternoon on it again: MEASURED in Chrome with a capture-phase
 * listener on `document`, a real ⌘2 produces ZERO keydown events in the page.
 * ⌘1-⌘9 are reserved for tab switching and are never delivered, so a web handler
 * for them is dead code that reads like a feature. ⌘0 (reset zoom) and ⌘[ / ⌘]
 * (history, which already do the right thing) are the same story.
 *
 * So the webview gets a prefix grammar instead: `g` then a digit. Nothing reserves
 * a bare letter, it needs no modifier gymnastics, and it is the convention an
 * operator will already know from Gmail, GitHub, Linear and Vim. The digits are
 * deliberately the same digits as the ⌘ accelerators, so the two triggers read as
 * one grammar rather than two — and both resolve through the same DESTINATIONS
 * table, so they cannot come to mean different things.
 *
 * Kept as a pure reducer because the interesting parts are all timing and
 * precedence, and those are miserable to test through a DOM.
 */

export interface GoState {
  /** True once `g` has been pressed and we are waiting for the second key. */
  armed: boolean;
  /** When `g` was pressed, for the expiry window. */
  armedAt: number;
}

export const GO_IDLE: GoState = { armed: false, armedAt: 0 };

/**
 * How long `g` stays armed. Long enough not to punish a slow second key, short
 * enough that a `g` typed by accident minutes ago cannot turn an innocent `4` into
 * a navigation.
 */
export const GO_WINDOW_MS = 1_500;

export interface GoStep {
  state: GoState;
  /** Set when the sequence completed and the app should navigate. */
  go?: Destination;
  /** True when we consumed the key and the caller should preventDefault. */
  claim: boolean;
}

/**
 * Advance the grammar by one keypress.
 *
 * Precedence is the whole design, in this order:
 *  1. Typing wins. `g` in a search box is the letter g.
 *  2. Modifiers disarm. ⌘G is Find Again and ⌃G is a terminal bell; neither is us,
 *     and quietly arming on them would make the next digit navigate by surprise.
 *  3. Overlays win. While a dialog is up it owns the keyboard — see isOverlayOpen.
 */
export function stepGoGrammar(state: GoState, e: KeyboardEvent, now: number): GoStep {
  if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || isOverlayOpen()) {
    return { state: GO_IDLE, claim: false };
  }

  if (state.armed) {
    // An expired prefix is not a failure, it is simply not armed any more: fall
    // through and let this key start a fresh sequence.
    if (now - state.armedAt <= GO_WINDOW_MS) {
      const go = GO_KEYS[e.key];
      // An unrecognised second key cancels silently. Falling back to "treat it as
      // a fresh first key" would mean `g x` behaved like `x`, so a mistyped
      // sequence would run whatever `x` happens to be bound to — the one outcome
      // an operator cannot predict.
      return go ? { state: GO_IDLE, go, claim: true } : { state: GO_IDLE, claim: false };
    }
  }

  if (e.key === 'g' || e.key === 'G') {
    return { state: { armed: true, armedAt: now }, claim: true };
  }

  return { state: GO_IDLE, claim: false };
}
