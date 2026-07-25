import { afterEach, describe, expect, it } from 'vitest';
import { GO_IDLE, GO_WINDOW_MS, stepGoGrammar } from '../navGrammar';
import { _resetDismiss, pushDismissible } from '../dismiss';

/**
 * The `g` prefix (TERMINAL Phase 4).
 *
 * The reason this grammar exists at all is a measurement, not a preference: a real
 * ⌘2 in Chrome produces zero keydown events in the page, because ⌘1-⌘9 are
 * reserved for tab switching. Porting the native ⌘1-6 accelerators to the webview
 * was impossible, so the webview got a prefix instead.
 *
 * The failures worth guarding are all about a bare letter being dangerous: `g` is a
 * character someone might type, and arming on it in the wrong context turns an
 * innocent later keypress into a navigation away from unsaved work.
 */

afterEach(() => _resetDismiss());

const key = (init: Partial<KeyboardEvent>) =>
  new KeyboardEvent('keydown', init as KeyboardEventInit);

describe('the go grammar', () => {
  it('g then a digit navigates', () => {
    const armed = stepGoGrammar(GO_IDLE, key({ key: 'g' }), 1_000);
    expect(armed.state.armed).toBe(true);
    expect(armed.claim, 'the prefix must be swallowed or a stray g reaches the page').toBe(true);

    const done = stepGoGrammar(armed.state, key({ key: '3' }), 1_100);
    expect(done.go?.label).toBe('INTELLIGENCE');
    expect(done.claim).toBe(true);
    expect(done.state.armed, 'the prefix must disarm after firing').toBe(false);
  });

  it('accepts an upper-case G, so caps lock does not break it', () => {
    expect(stepGoGrammar(GO_IDLE, key({ key: 'G' }), 0).state.armed).toBe(true);
  });

  it('a bare digit on its own does nothing', () => {
    const step = stepGoGrammar(GO_IDLE, key({ key: '3' }), 0);
    expect(step.go).toBeUndefined();
    expect(step.claim).toBe(false);
  });

  it('forgets the prefix after the window closes', () => {
    const armed = stepGoGrammar(GO_IDLE, key({ key: 'g' }), 1_000);
    const late = stepGoGrammar(armed.state, key({ key: '3' }), 1_000 + GO_WINDOW_MS + 1);
    // A `g` pressed and abandoned minutes ago must not turn a later digit into a
    // navigation. The stale prefix is dropped and the digit is treated as fresh.
    expect(late.go).toBeUndefined();
    expect(late.claim).toBe(false);
  });

  it('an unrecognised second key cancels silently', () => {
    const armed = stepGoGrammar(GO_IDLE, key({ key: 'g' }), 0);
    const step = stepGoGrammar(armed.state, key({ key: 'x' }), 10);
    expect(step.go).toBeUndefined();
    // Specifically NOT re-armed and NOT treated as a fresh `x`: if `g x` behaved
    // like `x`, a mistyped sequence would run whatever `x` is bound to, which is
    // the one outcome the operator cannot predict.
    expect(step.state.armed).toBe(false);
    expect(step.claim).toBe(false);
  });

  it('g in a text field is just the letter g', () => {
    const evt = new KeyboardEvent('keydown', { key: 'g' });
    // `target` is read-only and cannot be set through the event init dict, and an
    // undispatched event's target is null — which would pass this test for the
    // wrong reason.
    Object.defineProperty(evt, 'target', { value: document.createElement('input') });
    const typed = stepGoGrammar(GO_IDLE, evt, 0);
    expect(typed.state.armed, 'typing "g" in a search box must not arm navigation').toBe(false);
    expect(typed.claim).toBe(false);
  });

  it('does not arm on a modifier chord', () => {
    // ⌘G is Find Again and ⌃G is a terminal bell. Arming on either would make the
    // NEXT digit navigate by surprise, long after the operator stopped thinking
    // about it.
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      expect(stepGoGrammar(GO_IDLE, key({ key: 'g', ...mod }), 0).state.armed).toBe(false);
    }
  });

  it('goes quiet while an overlay owns the keyboard', () => {
    pushDismissible('modal', () => {});
    const step = stepGoGrammar(GO_IDLE, key({ key: 'g' }), 0);
    expect(step.state.armed, 'g inside a dialog must not navigate the page out from under it').toBe(false);
    expect(step.claim).toBe(false);
  });

  it('disarms an already-armed prefix when an overlay opens mid-sequence', () => {
    const armed = stepGoGrammar(GO_IDLE, key({ key: 'g' }), 0);
    pushDismissible('modal', () => {});
    const step = stepGoGrammar(armed.state, key({ key: '3' }), 10);
    expect(step.go, 'a dialog appearing between g and 3 must abort the sequence').toBeUndefined();
  });
});
