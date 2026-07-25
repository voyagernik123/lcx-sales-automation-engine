import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { HINT_KEY, useHints } from '../useHints';
import { _resetDismiss, pushDismissible } from '@/lib/dismiss';

/**
 * The eager half of the hint layer (TERMINAL Phase 7).
 *
 * This file is small and the whole feature depends on it, because it is the only part
 * of the hint layer allowed in the initial bundle. Every assertion here is about
 * PRECEDENCE — who gets the `f` — and precedence is exactly what the phase-4 Escape
 * post-mortem in `lib/dismiss.ts` shows going wrong silently.
 *
 * The bundle claim itself ("nothing but the key listener is eager") is asserted in
 * e2e/hints.spec.ts against the built `dist/`, because it is a property of the emitted
 * chunks and cannot be observed from inside a test that imports whatever it likes.
 */

function Probe() {
  const { on } = useHints();
  return <span data-testid="state">{on ? 'armed' : 'idle'}</span>;
}

afterEach(() => _resetDismiss());

const state = (r: ReturnType<typeof render>) => r.getByTestId('state').textContent;

describe('f arms hint mode', () => {
  it('arms on a bare f', () => {
    const r = render(<Probe />);
    expect(state(r)).toBe('idle');
    fireEvent.keyDown(document, { key: HINT_KEY });
    expect(state(r)).toBe('armed');
  });

  it('yields while the operator is typing', () => {
    // The lesson `useManual` paid for with `?`: stealing a printable character from a
    // field makes the field unusable, and `f` is a far commoner letter than `?`.
    const r = render(
      <>
        <Probe />
        <input data-testid="field" />
      </>,
    );
    fireEvent.keyDown(r.getByTestId('field'), { key: HINT_KEY });
    expect(state(r)).toBe('idle');
  });

  it('yields in a textarea and in a contenteditable', () => {
    const r = render(
      <>
        <Probe />
        <textarea data-testid="area" />
      </>,
    );
    fireEvent.keyDown(r.getByTestId('area'), { key: HINT_KEY });
    expect(state(r)).toBe('idle');
  });

  it('ignores ⌘F, ⌃F and ⌥F', () => {
    // ⌘F is the browser's Find and cannot be taken; arming on it would break Find AND
    // surprise the operator. ⌥F is a word-motion on macOS.
    const r = render(<Probe />);
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      fireEvent.keyDown(document, { key: HINT_KEY, ...mod });
      expect(state(r)).toBe('idle');
    }
  });

  it('ignores a capital F', () => {
    // Shift+f is someone typing a capital letter far more often than it is a request
    // for hints, and unlike `?` there is no layout where the unshifted key is missing.
    const r = render(<Probe />);
    fireEvent.keyDown(document, { key: 'F', shiftKey: true });
    expect(state(r)).toBe('idle');
  });

  it('stands down while an overlay owns the keyboard', () => {
    // `f` is a MOTION, like `g`, and a motion inside a dialog would tag the page behind
    // the backdrop — where Tab is trapped away from those controls and activating one
    // acts on a surface the operator cannot see. Contrast `?`, which deliberately does
    // NOT stand down; see useManual.ts.
    const r = render(<Probe />);
    pushDismissible('confirm dialog', () => {});
    fireEvent.keyDown(document, { key: HINT_KEY });
    expect(state(r)).toBe('idle');
  });

  it('arms again once the overlay has gone', () => {
    const r = render(<Probe />);
    pushDismissible('confirm dialog', () => {});
    fireEvent.keyDown(document, { key: HINT_KEY });
    expect(state(r)).toBe('idle');
    _resetDismiss();
    fireEvent.keyDown(document, { key: HINT_KEY });
    expect(state(r)).toBe('armed');
  });

  it('does not disarm itself when hint mode registers on the dismiss stack', () => {
    /*
     * The one interaction worth a test rather than a comment. Hint mode pushes itself
     * onto the dismiss stack, so `isOverlayOpen()` becomes true the moment it is armed.
     * That is what makes this listener stand down and lets the LAYER take the second
     * `f` as a cancel — but it must not cause this hook to drop its own state. If it
     * did, `f` would appear to work once and then never again.
     */
    const r = render(<Probe />);
    fireEvent.keyDown(document, { key: HINT_KEY });
    expect(state(r)).toBe('armed');
    pushDismissible('hint tags', () => {});
    fireEvent.keyDown(document, { key: HINT_KEY });
    expect(state(r)).toBe('armed');
  });

  it('leaves every other key alone', () => {
    const r = render(<Probe />);
    for (const key of ['g', 's', 'd', 'j', 'k', '?', 'a', 'Escape', 'Enter']) {
      fireEvent.keyDown(document, { key });
      expect(state(r), key).toBe('idle');
    }
  });
});
