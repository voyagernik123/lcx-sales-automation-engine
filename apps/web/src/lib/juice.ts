import { prefersReducedMotion } from './motion';

/**
 * The juice layer (TERMINAL Phase 5).
 *
 * Four one-shot feedbacks, triggered imperatively because they are events rather
 * than states: a flash, a shake, a snap, a tick. The CSS lives in globals.css;
 * this module is only the trigger and the bookkeeping.
 *
 * WHY IMPERATIVE, when the rest of the app is declarative. A React-idiomatic
 * version would hold `justCommitted` in state, render a class from it, and clear
 * it on a timer. That is three renders and a piece of state that means nothing
 * once the animation is over, per animated element — and on a 200-row table it is
 * a render storm for decoration. Adding and removing one class on one node
 * touches no React state at all.
 *
 * NON-VISUAL PARITY IS NOT OPTIONAL HERE. A shake conveys exactly nothing to a
 * screen-reader user, and a refusal is the single most important thing this app
 * ever says — it is the governed write that did NOT happen. So `refuse()` speaks
 * the reason into a live region as well as shaking. Any feedback that exists only
 * as motion is a feedback that some operators do not receive.
 */

export type JuiceKind = 'flash' | 'shake' | 'snap' | 'tick';

const CLASS: Record<JuiceKind, string> = {
  flash: 'juice-flash',
  shake: 'juice-shake',
  snap: 'juice-snap',
  tick: 'juice-tick',
};

/**
 * Longest juice animation is 340ms (shake). The fallback timer only exists
 * because `animationend` can be missed — the element is removed mid-animation, or
 * the tab is hidden so no frames are produced — and a class left behind would
 * suppress the NEXT play of the same animation, which reads as "the feedback
 * works intermittently". Generous rather than tight: firing late is invisible,
 * firing early would cut the animation short.
 */
const FALLBACK_MS = 600;

/** Semantic tints for `flash`, mapping a meaning to a token. */
export type Tint = 'live' | 'blocked' | 'warn' | 'info';

/**
 * Play a one-shot animation on an element.
 *
 * Safe to call with null (every call site holds a ref that may not be attached
 * yet), and safe to call repeatedly — a play already in flight is restarted
 * rather than ignored, because the second event is as real as the first.
 */
export function playJuice(el: Element | null | undefined, kind: JuiceKind, tint?: Tint): void {
  if (!el) return;
  const className = CLASS[kind];

  // Restart rather than skip. Removing the class and forcing a reflow before
  // re-adding is the only way to replay a CSS animation on the same element;
  // without the reflow the browser coalesces remove+add into no change at all.
  el.classList.remove(className);
  void (el as HTMLElement).offsetWidth;

  if (tint) {
    for (const t of ['tint-live', 'tint-blocked', 'tint-warn', 'tint-info']) el.classList.remove(t);
    el.classList.add(`tint-${tint}`);
  }

  el.classList.add(className);

  let done = false;
  const clear = () => {
    if (done) return;
    done = true;
    el.classList.remove(className);
    el.removeEventListener('animationend', clear);
  };
  // This is the app's first real consumer of `animationend`, which is what makes
  // the `animation-duration: 0.01ms` (rather than `0s`) choice in the
  // reduced-motion block genuinely load-bearing: at exactly 0s some browsers
  // dispatch no end event, and this class would never come off for precisely the
  // operators who asked for less motion.
  el.addEventListener('animationend', clear, { once: true });
  setTimeout(clear, FALLBACK_MS);
}

/**
 * A refusal: shake the thing that refused, and SAY WHY.
 *
 * The plan calls for "gate rejections that shake-and-explain", and the second
 * half is the important half. A shake with no reason is the app being annoyed at
 * the operator; a shake plus "needs a premortem before you can decide this" is
 * the app doing its job. The reason is also announced, so it reaches an operator
 * who cannot see the shake.
 */
export function refuse(el: Element | null | undefined, reason: string): void {
  playJuice(el, 'shake');
  announce(reason, 'assertive');
}

/** A governed write landed. The one place the overshoot easing is used. */
export function commit(el: Element | null | undefined): void {
  playJuice(el, 'snap');
}

/** A status became something. */
export function flash(el: Element | null | undefined, tint: Tint = 'info'): void {
  playJuice(el, 'flash', tint);
}

/* ── The live region ─────────────────────────────────────────────────────────
 * One node, created on demand, reused. Kept here rather than rendered by a React
 * provider so that non-React code (the dismiss stack, the command grammar) can
 * speak too, and so a page that has crashed can still announce why.
 */

let region: HTMLElement | null = null;

function liveRegion(politeness: 'polite' | 'assertive'): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (!region) {
    region = document.createElement('div');
    region.id = 'lcx-live';
    // Visually hidden but readable: `display:none` and `visibility:hidden` are
    // both skipped by screen readers, and `width:0` collapses some of them. The
    // 1px-clip idiom is the one that is actually announced.
    region.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    document.body.appendChild(region);
  }
  region.setAttribute('aria-live', politeness);
  return region;
}

/**
 * Speak a message to assistive technology.
 *
 * The text is cleared first: a live region whose content does not CHANGE is not
 * re-announced, so refusing twice for the same reason would be silent the second
 * time — and "I pressed it again and nothing happened" is exactly the confusion
 * this is meant to prevent.
 */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const node = liveRegion(politeness);
  if (!node) return;
  node.textContent = '';
  // A frame, not a microtask: the clear has to be committed for the change to
  // register as a change.
  const set = () => {
    node.textContent = message;
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(set);
  else set();
}

/** Test-only. */
export function _resetJuice(): void {
  region?.remove();
  region = null;
}

/**
 * Is the juice worth playing at all?
 *
 * Exported so callers that would do real WORK to animate — computing a count
 * roll-up, laying out a shimmer — can skip the work rather than doing it and
 * having CSS discard the result. The class-toggling helpers above deliberately do
 * NOT check this: the stylesheet already reduces them to ~0ms, and skipping the
 * class would also skip the `animationend` bookkeeping.
 */
export function juiceEnabled(): boolean {
  return !prefersReducedMotion();
}

/**
 * Read a duration from the motion vocabulary, in ms, for motion that JAVASCRIPT has to
 * time — a count roll-up interpolated frame by frame, which no CSS transition can do
 * because the animated thing is text content rather than a style.
 *
 * The point is that the number does not get hardcoded here. `--t-state: 160ms` lives in
 * `globals.css` next to the four transition classes that spend it, and Phase D's ratchet
 * exists precisely because a hand-typed `0.16s` that "happens to equal --t-state" is how
 * a vocabulary drifts into decoration. A JS animation is outside that ratchet's reach —
 * it parses stylesheets and Tailwind class names, and would never see a literal `160` in
 * a `.tsx` file — so the only thing keeping this honest is reading the token.
 *
 * `fallback` covers jsdom and pre-paint (`getPropertyValue` returns '' for a custom
 * property that has not resolved). It matches the token's declared value; a fallback that
 * disagreed with the stylesheet would be the drift this function exists to prevent.
 */
export function motionDurationMs(token: string, fallback: number): number {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  // `160ms` and `0.16s` are both legal CSS for the same duration — and the SHIPPED
  // stylesheet says `.16s`, because the minifier rewrites the authored `160ms` into its
  // shortest form. Measured in Chromium against the production build, not assumed:
  // `getPropertyValue('--t-state')` → `".16s"`. Drop this branch and the roll-up becomes a
  // 0.16ms one-frame snap in the artifact while every test that writes `40ms` stays green.
  return raw.endsWith('ms') ? n : n * 1000;
}
