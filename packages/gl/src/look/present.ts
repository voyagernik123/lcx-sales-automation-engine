/**
 * THE ONE PRESENT PATH (THE PRODUCTION, P4).
 *
 * Every 3D surface — the stage and the five heroes — renders its lit scene into a Target3D (colour + depth, linear HDR)
 * and then has to put it on the canvas. Before P4 each surface compiled its OWN present shader (tone map + encode) and
 * blitted; P3 gave the stage a better path: copy → the pipeline's scene target → bright/blur/composite (the ONE tone map,
 * the ONE encode) → an LDR target → FXAA → canvas. This module is that path as a reusable object, so the six surfaces
 * present identically and a change to the look is made once.
 *
 * The copy pass exists because Target3D carries depth and the pipeline reads `stage.scene`, which does not. It is a plain
 * texture copy in linear HDR — no tone map here (PIPELINE_SOURCES' single-tone-map property covers every presenter).
 */
import type { Stage, StageRefusal, RenderTarget } from '../stage.js';
import { createPipeline, type Pipeline, type PipelineOptions } from './pipeline.js';
import { createAntialias, type Antialias } from './aa.js';
import { createTarget3D, type Target3D } from '../env/target3d.js';

export const PRESENT_COPY_VERT = `#version 300 es
precision highp float; out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
export const PRESENT_COPY_FRAG = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uScene; out vec4 frag;
void main(){ frag = vec4(texture(uScene, vUv).rgb, 1.0); }`;

/** Bloom thresholds per theme: only what is brighter than the room blooms (the glows in dark, the softboxes' reflections in light). */
export const PRESENT_BLOOM: Record<'dark' | 'light', { threshold: readonly [number, number]; gain: number }> = {
  dark: { threshold: [0.55, 1.3], gain: 0.36 },
  light: { threshold: [1.05, 2.1], gain: 0.22 },
};

export interface PresentOptions {
  readonly theme: 'dark' | 'light';
  /** Override the theme's bloom; `null` disables bloom (gain 0). */
  readonly bloom?: { threshold: readonly [number, number]; gain: number } | null;
  /** Extra composite options (vignette etc.). The plate is always black: the scene fills the frame. */
  readonly composite?: Omit<PipelineOptions, 'threshold' | 'bloomGain' | 'plate' | 'into'>;
}

export interface Presenter {
  /** Size the intermediate target and the stage's region. Call whenever the canvas size changes (cheap when unchanged). */
  resize(width: number, height: number): void;
  /** Composite + anti-alias `scene` (a Target3D's colour) onto the canvas. Leaves the canvas bound, depth test off. */
  present(scene: { readonly texture: WebGLTexture }, opts: PresentOptions): void;
  dispose(): void;
}

export function createPresenter(stage: Stage): Presenter | StageRefusal {
  const copy = stage.compile(PRESENT_COPY_VERT, PRESENT_COPY_FRAG);
  if ('kind' in copy) return copy;
  const pipeline = createPipeline(stage);
  if ('kind' in pipeline) return pipeline;
  const aa = createAntialias(stage);
  if ('kind' in aa) return aa;
  const { gl } = stage;
  let ldr: Target3D | null = null;
  let W = 0, H = 0;
  return {
    resize(width, height) {
      const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
      if (w === W && h === H && ldr) return;
      W = w; H = h;
      stage.setRegion(W, H);
      ldr?.dispose();
      const t = createTarget3D(stage, W, H);
      ldr = 'kind' in t ? null : t;
    },
    present(scene, opts) {
      if (!ldr) return;
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      stage.bindTarget(stage.scene as RenderTarget);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.texture);
      stage.blit(copy, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
      const bloom = opts.bloom === undefined ? PRESENT_BLOOM[opts.theme] : opts.bloom;
      (pipeline as Pipeline).resolve({
        ...(opts.composite ?? {}),
        threshold: bloom ? bloom.threshold : [10, 20], bloomGain: bloom ? bloom.gain : 0, blurSteps: [1, 2, 2],
        plate: [0, 0, 0], vignetteDepth: opts.composite?.vignetteDepth ?? 0, into: ldr,
      });
      stage.bindTarget(null);
      gl.viewport(0, 0, W, H);
      (aa as Antialias).apply(ldr.texture, W, H);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    dispose() {
      ldr?.dispose(); (aa as Antialias).dispose(); (pipeline as Pipeline).dispose(); gl.deleteProgram(copy);
    },
  };
}

/**
 * Load the rendered studio for a theme into a mipmapped sRGB texture on this context. One texture per GL context (the
 * stage and each hero own their own contexts under the cap of two); `onReady` fires once with the texture, `cancel()`
 * makes a late arrival a no-op. The public URL is the S7/P3 object; a failed fetch leaves the procedural sky in place.
 */
export function loadEnvironmentMap(
  gl: WebGL2RenderingContext,
  theme: 'dark' | 'light',
  onReady: (texture: WebGLTexture) => void,
  upload: (gl: WebGL2RenderingContext, image: TexImageSource) => WebGLTexture,
  url = `/objects/env-${theme}.webp`,
): () => void {
  let live = true;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => { if (live) onReady(upload(gl, img)); };
  img.onerror = () => { /* the studio is an upgrade, never a dependency */ };
  img.src = url;
  return () => { live = false; };
}
