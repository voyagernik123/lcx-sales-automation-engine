import { useCallback, useEffect, useRef, useState } from 'react';
// TYPE-ONLY, so it is erased at build and the runtime import below stays the sole entry
// point for @lcx/gl. A value import here would pull the renderer into every page chunk
// that merely mentions a chart.
import type { Stage } from '@lcx/gl';

/**
 * W2 + W3 · the one hook every re-backed chart primitive uses.
 *
 * It owns four things that would otherwise be re-solved (and re-broken) in thirteen places:
 * the shared context, device-pixel sizing, the refusal fallback, and the entrance motion.
 *
 * ── THE FALLBACK IS THE DEFAULT, NOT THE EXCEPTION ──────────────────────────────────
 * `refused` starts TRUE and only becomes false once a frame has actually been drawn. A
 * primitive renders its existing SVG whenever `refused` is true, so:
 *   - server-side render → SVG (there is no canvas on the server)
 *   - the print path      → SVG (vector, at the printer's resolution)
 *   - no WebGL2           → SVG
 *   - the first paint     → SVG, until the GL frame replaces it
 * There is no flash of empty chart and no state in which a reader sees nothing. W0 found
 * these primitives to be CORRECT; this hook is not allowed to make any of them worse.
 *
 * ── W3 · MOTION ─────────────────────────────────────────────────────────────────────
 * One purpose only: `entrance`, and it runs ONCE. `@lcx/gl`'s motion layer refuses a
 * looping entrance by construction, so there is no idle animation to accidentally add.
 * Under `prefers-reduced-motion` the tween resolves to its final state on the first frame —
 * the reader sees the same chart, without the movement — which is what the media query
 * asks for and not "the same animation, faster".
 *
 * A chart that re-renders with NEW DATA does not replay the entrance. Re-animating on every
 * poll would make a dashboard that refreshes on a timer permanently in motion, which is the
 * idle animation the policy forbids, arrived at from the other direction.
 */

export interface FlatChartFrame {
  /** Progress of the current transition, 0→1. Always 1 immediately under reduced motion. */
  readonly t: number;
  /**
   * WHICH transition `t` belongs to, and the two are drawn completely differently.
   *
   * `enter` — first paint. A bar grows from its baseline, a line reveals left to right.
   * `update` — the data changed under a chart that is already on screen. The caller
   *   interpolates from the geometry it last drew to the new geometry, so a value that
   *   moved from 14 to 11 SLIDES; it does not collapse to zero and regrow.
   *
   * Replaying the entrance on every data change is the failure this distinction exists to
   * prevent: on a dashboard that refreshes on a timer, it would leave every chart
   * permanently in motion — the idle animation the motion policy forbids, arrived at from
   * the other direction.
   */
  readonly phase: 'enter' | 'update';
  readonly width: number;
  readonly height: number;
}

export interface UseFlatChartOptions {
  /** CSS pixel size. Device pixels are derived from devicePixelRatio. */
  readonly width: number;
  readonly height: number;
  /** Milliseconds for the entrance. Ignored entirely under reduced motion. */
  readonly entranceMs?: number;
  /** Changing this runs an UPDATE transition — not a replayed entrance. */
  readonly deps?: readonly unknown[];
  /** Milliseconds for an update. Shorter than the entrance: the reader is already looking. */
  readonly updateMs?: number;
}

export interface UseFlatChart {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** TRUE until a frame has actually been drawn. Render the SVG while it is true. */
  readonly refused: boolean;
  /** Present when the renderer refused, for a surface that wants to name the reason. */
  readonly reason: string | null;
}

export function useFlatChart(
  draw: (stage: Stage, frame: FlatChartFrame) => void,
  opts: UseFlatChartOptions,
): UseFlatChart {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [refused, setRefused] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  /* Entrance state lives in a REF, not in state: it must survive a data change without
     replaying, and it must not schedule a React render per animation frame. */
  const entered = useRef(false);
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const { width, height, entranceMs = 420, updateMs = 260 } = opts;
  const deps = opts.deps ?? [];

  const paint = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Dynamic import so @lcx/gl never enters a page chunk that does not render a chart.
    const { sharedRenderer } = await import('@lcx/gl');
    const renderer = sharedRenderer();
    if ('kind' in renderer) {
      setRefused(true);
      setReason(renderer.reason);
      return;
    }

    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const reduced = typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Cannot read the preference ⇒ assume reduced. Defaulting the other way would invent
      // consent from a reader who never gave it.
      : true;

    const phase: 'enter' | 'update' = entered.current ? 'update' : 'enter';
    const runFrame = (t: number) => {
      renderer.render(canvas, ({ width: fw, height: fh }) => {
        drawRef.current(renderer.stage, { t, width: fw, height: fh, phase });
      });
      setRefused(false);
      setReason(null);
    };

    const ms = phase === 'enter' ? entranceMs : updateMs;
    // Reduced motion resolves to the FINAL STATE on the first frame — for an update exactly
    // as for an entrance. The reader sees the new numbers, without the movement.
    if (reduced || ms <= 0) {
      entered.current = true;
      runFrame(1);
      return;
    }

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const t0 = performance.now();
    const step = () => {
      const raw = Math.min(1, (performance.now() - t0) / ms);
      // Cubic ease-in-out, matching @lcx/gl's motion layer: symmetric, because an
      // asymmetric ease implies a direction the data does not have.
      const t = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
      runFrame(t);
      if (raw < 1) rafRef.current = requestAnimationFrame(step);
      else { rafRef.current = null; entered.current = true; }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [width, height, entranceMs, updateMs]);

  useEffect(() => {
    void paint();
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, ...deps]);

  return { canvasRef, refused, reason };
}
