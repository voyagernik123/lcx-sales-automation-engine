/**
 * Reduced motion, for the motion that CSS cannot reach.
 *
 * `globals.css` carries the blanket `@media (prefers-reduced-motion: reduce)`
 * rule, and it covers everything declarative: 279 `transition-*` utilities, 54
 * `animate-*` utilities, the five hand-written `transition:` declarations. It
 * does NOT cover programmatic scrolling, and the reason is a genuine trap:
 *
 *   element.scrollIntoView({ behavior: 'smooth' })
 *
 * The `behavior` option is an explicit author instruction that OVERRIDES the CSS
 * `scroll-behavior` property. So `scroll-behavior: auto !important` in the media
 * query — which looks like it closes this hole — does nothing at all to these
 * call sites. A whole-viewport smooth scroll is also the single worst offender
 * for vestibular motion sickness: it is large-area, it is unexpected, and it is
 * exactly what the OS setting is asking you not to do. Hence a JS check.
 *
 * Note `behavior: 'auto'` rather than `'instant'`. Both jump today, but `auto`
 * has been in the spec since the beginning and defers to `scroll-behavior`,
 * whereas `'instant'` is a later addition; `auto` is the safer of the two and
 * indistinguishable in the case we care about.
 */

/**
 * Whether the operator has asked the OS to reduce motion.
 *
 * Read at call time, never cached. The setting is live — macOS applies it
 * without a relaunch — and a stale boolean captured at module load would leave
 * the app animating for the rest of the session after someone turns it on to
 * stop feeling sick. Guarded for `matchMedia` because this module is imported by
 * code that runs under jsdom and, in the Tauri shell, before first paint.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scroll an element into view, smoothly for most operators and instantly for
 * anyone who asked for reduced motion. Use this instead of calling
 * `scrollIntoView` directly — a bare call is not wrong, it is just unreachable
 * by the stylesheet, which is the harder mistake to spot in review.
 *
 * Takes an id rather than an element because every call site in this app is
 * "jump to that anchor" and had its own `getElementById(...)?.` prefix; folding
 * the lookup in makes the missing-node case one no-op instead of eight.
 */
export function scrollToId(id: string, block: ScrollLogicalPosition = 'center'): void {
  document.getElementById(id)?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block,
  });
}
