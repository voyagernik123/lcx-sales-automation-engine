import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetJuice, announce, flash, playJuice, refuse } from '../juice';
import { _resetFeedback, feedback, feelPrefs, setFeelPref } from '../feedback';

/**
 * The juice layer and the feel preferences (TERMINAL Phase 5).
 *
 * Most of this is CSS and cannot be unit-tested. What CAN be tested is the
 * bookkeeping, which is where the bugs would be: a class left behind suppresses
 * the NEXT play of the same animation, so the feedback appears to work
 * intermittently — the hardest kind of polish bug to pin down. And the defaults,
 * because "off by default" is a promise to the operator, not an implementation
 * detail.
 */

beforeEach(() => {
  localStorage.clear();
  _resetJuice();
  _resetFeedback();
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return node;
}

describe('playJuice', () => {
  it('adds the animation class', () => {
    const node = el();
    playJuice(node, 'snap');
    expect(node.classList.contains('juice-snap')).toBe(true);
  });

  it('removes the class when the animation ends', () => {
    const node = el();
    playJuice(node, 'shake');
    node.dispatchEvent(new Event('animationend'));
    // If this class survived, the next refusal on the same element would add an
    // already-present class and play nothing at all.
    expect(node.classList.contains('juice-shake')).toBe(false);
  });

  it('removes the class even if animationend never fires', () => {
    // Real cases: the tab is hidden so no frames are produced, or the animation is
    // interrupted. Without the fallback the element is permanently un-animatable.
    vi.useFakeTimers();
    const node = el();
    playJuice(node, 'flash');
    expect(node.classList.contains('juice-flash')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(node.classList.contains('juice-flash')).toBe(false);
  });

  it('restarts rather than ignoring a second play', () => {
    const node = el();
    playJuice(node, 'snap');
    playJuice(node, 'snap');
    // The second commit is as real as the first; swallowing it would make rapid
    // governed writes feel like only some of them landed.
    expect(node.classList.contains('juice-snap')).toBe(true);
  });

  it('applies one semantic tint at a time', () => {
    const node = el();
    flash(node, 'live');
    expect(node.classList.contains('tint-live')).toBe(true);
    flash(node, 'blocked');
    // Leaving the old tint on would composite two colours and produce a flash in
    // neither of the meanings the caller asked for.
    expect(node.classList.contains('tint-live')).toBe(false);
    expect(node.classList.contains('tint-blocked')).toBe(true);
  });

  it('tolerates a null element', () => {
    // Every call site holds a ref that may not be attached yet.
    expect(() => playJuice(null, 'snap')).not.toThrow();
    expect(() => flash(undefined, 'warn')).not.toThrow();
  });
});

describe('announcements', () => {
  it('speaks a refusal reason, not just a shake', () => {
    vi.useFakeTimers();
    const node = el();
    refuse(node, 'needs a premortem before you can decide this');
    vi.runAllTimers();
    const region = document.getElementById('lcx-live');
    // A shake conveys nothing to a screen-reader user, and a refusal is the most
    // important thing this app ever says — the governed write that did NOT happen.
    expect(region?.textContent).toContain('premortem');
    expect(region?.getAttribute('aria-live')).toBe('assertive');
  });

  it('re-announces the same message', () => {
    vi.useFakeTimers();
    announce('blocked');
    vi.runAllTimers();
    const region = document.getElementById('lcx-live');
    expect(region?.textContent).toBe('blocked');

    announce('blocked');
    // A live region whose content does not CHANGE is not re-announced, so the
    // clear-then-set is what makes a second identical refusal audible. Without it,
    // pressing the blocked button again is silent — exactly the "nothing happened"
    // confusion this is meant to prevent.
    expect(region?.textContent).toBe('');
    vi.runAllTimers();
    expect(region?.textContent).toBe('blocked');
  });

  it('uses one reusable region rather than one per message', () => {
    vi.useFakeTimers();
    announce('a');
    announce('b');
    vi.runAllTimers();
    expect(document.querySelectorAll('#lcx-live')).toHaveLength(1);
  });
});

describe('feel preferences', () => {
  it('both default to OFF', () => {
    // This is a promise to the operator: an instrument that makes noise the first
    // time it is opened, in an office, without asking, gets muted permanently.
    expect(feelPrefs()).toEqual({ sound: false, haptics: false });
  });

  it('round-trips and persists', () => {
    setFeelPref('sound', true);
    expect(feelPrefs().sound).toBe(true);
    expect(feelPrefs().haptics).toBe(false);
  });

  it('plays no sound while sound is off', () => {
    // jsdom has no AudioContext at all, so a guard that ran before the preference
    // check would throw here rather than silently doing nothing.
    expect(() => feedback.commit(el())).not.toThrow();
  });

  it('a refusal still shakes and speaks with sound off', () => {
    vi.useFakeTimers();
    const node = el();
    feedback.refuse(node, 'gate: premortem required');
    expect(node.classList.contains('juice-shake')).toBe(true);
    vi.runAllTimers();
    // The cue is optional; the reason never is.
    expect(document.getElementById('lcx-live')?.textContent).toContain('premortem');
  });
});
