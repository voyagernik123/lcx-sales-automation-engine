import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stage } from '@lcx/gl';
import { useFlatChart } from '@/components/charts/gl/useFlatChart';

/**
 * W5 · SIGNATURE — the deck's plate, built in linear light instead of declared in CSS.
 *
 * ── WHY THIS IS THE FIRST W5 SURFACE AND NOT A THIRD DATA AXIS ───────────────────────
 * `PLATFORM_VFX_100X.md`'s audit found nine of ten "this looks like a webpage" tells need no
 * third axis at all, and ranked "dead negative space → plate gradient + vignette in linear
 * space" among them. It is also the only one that changes the WHOLE screen rather than one
 * panel, so it is the cheapest way to move the deck's grade — eleven panels inherit it for
 * free.
 *
 * ── WHY IT CANNOT BE A CSS GRADIENT, WHICH IS THE OBVIOUS OBJECTION ──────────────────
 * A CSS gradient interpolates in sRGB. Across a large dark field that produces visible
 * banding and a muddy midpoint, because sRGB is perceptually spaced and the interpolation is
 * not. The pipeline's composite builds the same gradient in LINEAR space and tone maps once on
 * the way out — the identical mathematics the 3-D surfaces use, applied to negative space. The
 * difference is most obvious in exactly the region a dashboard has most of: near-black.
 *
 * ── WHY NO GEOMETRY IS DRAWN ─────────────────────────────────────────────────────────
 * `pipeline.resolve` composites `plate + scene + bloom` and tone maps the sum. With an empty
 * scene target the plate and vignette ARE the frame, so this is a legitimate use of the
 * existing pass rather than a new one — no shader is added and the spine does not grow.
 * `bloomGain: 0` because there is no highlight to bloom; a gain here would only lift the
 * gradient's own noise.
 *
 * ── THE FALLBACK IS A CSS GRADIENT, DELIBERATELY ─────────────────────────────────────
 * `useFlatChart` starts `refused` and only clears it once a frame has actually been drawn, so
 * SSR, print, no-WebGL and the first paint all get the CSS plate. It is the worse gradient and
 * it is entirely adequate as a backdrop — nothing is unreadable without this layer, which is
 * the property that makes shipping it safe.
 */

export interface SignatureBackdropProps {
  /** Brand-derived plate colour in LINEAR space. Kept as a prop so a surface can differ. */
  readonly plate?: readonly [number, number, number];
  /** 0 = flat field, 1 = heavy falloff to the edges. */
  readonly vignetteDepth?: number;
  /** Where the light sits, in 0..1 of the viewport. Off-centre reads as intent, not symmetry. */
  readonly vignetteCentre?: readonly [number, number];
}

/* The deck's own near-black, in linear light. Cool rather than neutral so the brand blue in the
   panels above reads as the same family rather than as a colour laid on grey. */
const DECK_PLATE = [0.0052, 0.0086, 0.0224] as const;

export function SignatureBackdrop({
  plate = DECK_PLATE,
  vignetteDepth = 0.66,
  vignetteCentre = [0.42, 0.3],
}: SignatureBackdropProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  /*
   * MEASURED, NOT ASSUMED. A backdrop has no intrinsic size, and rendering at a guessed one
   * then stretching the canvas would soften the gradient and misplace the vignette centre —
   * the two things this layer exists to get right.
   */
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (!r) return;
      /* Rounded to 8px steps so a one-pixel scrollbar reflow does not reallocate render
         targets on every frame — the vignette is a smooth field and cannot show the step. */
      const w = Math.max(1, Math.round(r.width / 8) * 8);
      const h = Math.max(1, Math.round(r.height / 8) * 8);
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [mod, setMod] = useState<typeof import('@lcx/gl') | null>(null);
  useEffect(() => {
    let alive = true;
    void import('@lcx/gl').then((m) => { if (alive) setMod(m); });
    return () => { alive = false; };
  }, []);

  const cache = useRef<{ stage: Stage; pipeline: ReturnType<typeof import('@lcx/gl').createPipeline> } | null>(null);

  const draw = useCallback((stage: Stage) => {
    if (!mod) return;
    const { createPipeline } = mod;
    if (cache.current?.stage !== stage) {
      cache.current = { stage, pipeline: createPipeline(stage) };
    }
    const { pipeline } = cache.current;
    if ('kind' in pipeline) return;

    /* An EMPTY scene target. The composite adds `plate + scene + bloom`, so with nothing drawn
       the plate and its vignette are the entire frame. */
    const gl = stage.gl;
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    pipeline.resolve({
      plate: plate as unknown as never,
      vignetteCentre,
      vignetteDepth,
      // No highlight exists to bloom; a gain here lifts the gradient's own quantisation noise.
      bloomGain: 0,
      // OPAQUE: this is the bottom of the stack and it owns the background.
      transparent: false,
    });
  }, [mod, plate, vignetteCentre, vignetteDepth]);

  const { canvasRef, refused } = useFlatChart(draw as never, {
    width: size?.w ?? 1,
    height: size?.h ?? 1,
    // NO ENTRANCE. A backdrop that fades in announces itself, and the motion policy forbids
    // movement that carries no information. It is simply there on the first frame.
    entranceMs: 0,
    deps: [mod, size?.w, size?.h, plate, vignetteDepth],
  });

  const ready = mod !== null && size !== null && !refused;

  return (
    <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* The CSS plate. Always present, always underneath — it is the fallback AND it stops a
          single frame of unpainted page showing through before the GL frame lands. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 42% 30%, #0b1220 0%, #070b14 55%, #04060b 100%)',
        }}
      />
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        className="absolute inset-0 h-full w-full"
        style={{ display: ready ? 'block' : 'none' }}
      />
    </div>
  );
}
