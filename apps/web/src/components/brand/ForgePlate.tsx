/**
 * E8's plate — the CSS half, deliberately separate from the renderer, and THEME-AWARE.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────────────
 * `SelectOperator` is the sign-in route and is loaded EAGERLY, so anything it imports statically
 * lands in the shell chunk. Importing `ForgeBackdrop` directly pushed `index.js` to 441 KB against
 * a 440 KB ceiling and the perf budget refused the build — correctly.
 *
 * So the halves split along the line that matters: this is CSS with no dependencies and pays for
 * itself on the first frame, while the renderer is lazy. The plate therefore paints BEFORE any
 * chunk is fetched, so there is no bare page and no shift when the GL layer arrives on top of it.
 * It is also the permanent fallback — server render, print, no WebGL2, a refused float target — and
 * it cannot fail because there is nothing in it to fail.
 *
 * ── THE LIGHT THEME IS NOT AN AFTERTHOUGHT, AND THE FIRST VERSION BROKE IT ──────────
 * The sign-in screen is a designed light/dark PAIR: `--page-bg` is #f4f6fb light and #090E1B dark
 * (`styles/tokens.css`). The first version of this file painted a fixed near-black gradient, which
 * covered the light theme's page background entirely and would have shipped a black sign-in screen
 * with dark-navy text on it to every operator not in dark mode. `e2e/smoke.spec.ts` screenshots
 * BOTH themes, which is the ratchet that would have caught it — and `ci-check` does not run e2e,
 * only `gate` does, which is why it got past me.
 *
 * The fix is not to hide the object in light mode. Machined metal reads beautifully on a bright
 * ground — a steel watch on white — so light mode gets a BRIGHT STUDIO and dark mode keeps the
 * near-black room. Same object, two lighting environments, which is what a real product shot does.
 */
import { ForgeStill } from './ForgeStill';

export function ForgePlate() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20">
      {/* LIGHT: a cool studio sweep, bright enough that the navy type above it keeps its contrast. */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{ background: 'radial-gradient(125% 100% at 36% 64%, #ffffff 0%, #e7ecf5 48%, #cdd6e6 100%)' }}
      />
      {/* DARK: the near-black room the capture harness was authored against. */}
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ background: 'radial-gradient(120% 95% at 38% 62%, #101a2e 0%, #080d18 55%, #04060b 100%)' }}
      />
      {/* S7: THE POSTER. The same object the live GL layer draws, as a still — it paints as soon as its bytes
        * arrive (before the GL chunk) and it IS the fallback for no WebGL2, a refused target and reduced motion.
        * `ForgeBackdrop` creates its stage with `alpha: false`, so when the live object draws it covers this
        * completely; the two never composite. Rule 1: the flat fallback is the object, not a gradient. */}
      <ForgeStill variant="poster" priority className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}
