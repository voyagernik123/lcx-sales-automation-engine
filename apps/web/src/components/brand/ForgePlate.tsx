/**
 * E8's plate — the CSS half, deliberately separate from the renderer.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────────────
 * `SelectOperator` is the sign-in route and is loaded EAGERLY, so anything it imports statically
 * lands in the shell chunk. Importing `ForgeBackdrop` directly pushed `index.js` to 441 KB against
 * a 440 KB ceiling and the perf budget refused the build — correctly.
 *
 * So the two halves split along the line that actually matters: this file is ten lines of CSS with
 * no dependencies and pays for itself immediately, while the renderer is lazy. The result is
 * better than the original, not a compromise — the plate paints on the FIRST frame, before any
 * chunk has been fetched, so there is no moment of bare page and no layout shift when the GL layer
 * arrives on top of it.
 *
 * It is also the permanent fallback: server render, print, no WebGL2 and a refused float target all
 * end here, and this file cannot fail because there is nothing in it to fail.
 */
export function ForgePlate() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-20"
      style={{ background: 'radial-gradient(120% 95% at 38% 62%, #101a2e 0%, #080d18 55%, #04060b 100%)' }}
    />
  );
}
