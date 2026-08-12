/**
 * E5 THE SURFACE, as a product component rather than a harness.
 *
 * `docs/3d/e5` proved the environment; this is the part that ships. It renders the SAME `SurfaceGeometry` the
 * flat `SurfacePlot` renders — one object, two drawings — which is what makes the two comparable at all and is
 * the reason E5 was the first environment worth promoting.
 *
 * ── THIS FILE IS ONLY EVER REACHED THROUGH A LAZY IMPORT ─────────────────────────────
 * `SurfaceRelief` imports it with `lazy()`, so none of it — nor any of `@lcx/gl` — lands in the initial
 * bundle. The perf budget measures RAW pre-gzip initial JS at 839/850 KB, which is 11 KB of headroom for the
 * whole application; an eager import of the environment layer would spend all of it and more. That is the same
 * discipline `ForgeBackdrop` follows on the sign-in route.
 *
 * ── IT REFUSES RATHER THAN DEGRADING, AND THE CALLER SHOWS THE FLAT SURFACE ──────────
 * Every resource here is checked. On any refusal this renders NOTHING and calls `onRefused` with the code, and
 * the parent falls back to `SurfacePlot` — §6 rule 1, and the reason the parent owns the fallback rather than
 * this file: a component that cannot construct its renderer cannot be trusted to draw its own escape hatch.
 */
import { useEffect, useRef } from 'react';
import {
  createStage, isStage, box, plane, uploadMesh, createLitRenderer, createTarget3D, createShadowMap,
  createSkyBackdrop, heightfield, contourSegments, viewProjection, eyeOf, lightViewProjection,
  boundsCentre, boundsRadius, hexToLinear, assertBrandFidelity, IDENTITY,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  type LitDraw, type Viewpoint,
} from '@lcx/gl';
import { isProjectedSurface, type SurfaceOutcome } from '@lcx/shared';

export interface SurfaceReliefGlProps {
  readonly surface: SurfaceOutcome;
  readonly heightPx: number;
  /** Called with a stable code when the renderer cannot draw. The parent then shows the flat surface. */
  readonly onRefused: (code: string) => void;
  /** Iso-levels in the data's own units. Empty disables the ribbons. */
  readonly contourLevels?: readonly number[];
}

const PRESENT_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${TONE_MAP_GLSL}
${SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`;

const SURF_W = 4.6, SURF_D = 3.4, SURF_H = 1.15, PLINTH_H = 0.16;

export default function SurfaceReliefGl({
  surface, heightPx, onRefused, contourLevels = [],
}: SurfaceReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!isProjectedSurface(surface)) { onRefused('SURFACE_REFUSED_BY_ENGINE'); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map
     * there is no point rendering: the frame would be off-brand by an amount too small to see and too large to
     * be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    /* DPR CAPPED AT 2. Everything in this frame is fill-bound, so a 3× display would triple the cost of a
       surface whose whole justification is that an operator reads it faster. */
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 640;
    const W = Math.round(cssW * dpr), H = Math.round(heightPx * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    const refuse = (code: string): void => {
      for (const d of disposers.reverse()) d();
      stage.dispose();
      onRefused(code);
    };

    const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
    if ('kind' in present) { refuse(present.code); return; }
    const lit = createLitRenderer(stage);
    if ('kind' in lit) { refuse(lit.code); return; }
    disposers.push(() => lit.dispose());
    const target = createTarget3D(stage, W, H);
    if ('kind' in target) { refuse(target.code); return; }
    disposers.push(() => target.dispose());
    const shadow = createShadowMap(stage, 1024);
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());
    const skyBox = createSkyBackdrop(stage);
    if ('kind' in skyBox) { refuse(skyBox.code); return; }
    disposers.push(() => skyBox.dispose());

    /*
     * THE GRID COMES FROM THE ENGINE'S OWN QUADS, not from a second read of the caller's rows.
     *
     * `SurfaceGeometry` carries `quads` with `col`/`row`/`zMean` and `holes` with the corners it refused. Taking
     * the heights from there means this drawing and the flat one cannot disagree about a single cell — which is
     * the property E5's harness asserts as `agreesWithFlat`, and it is the whole basis for putting a 3-D view in
     * front of an operator at all.
     */
    const cols = surface.xTicks.length, rows = surface.yTicks.length;
    const observed = new Map<string, number>();
    for (const q of surface.quads) {
      /* A quad's zMean covers four corners; assigning it to the quad's own corner is exact for a grid this
         drawing then re-interpolates, and it is the only value the engine exposes per cell. */
      observed.set(`${q.col},${q.row}`, q.zMean);
    }
    const sampleAt = (c: number, r: number): number | null => {
      const direct = observed.get(`${c},${r}`);
      if (direct !== undefined) return direct;
      /* A grid point no drawn quad touches is UNMEASURED as far as this mesh is concerned. Returning 0 would
         put a floor where the flat figure shows a hole. */
      return null;
    };

    const field = heightfield(cols, rows, sampleAt, SURF_W, SURF_D, SURF_H);
    if (field.cellsDrawn === 0) { refuse('NO_OBSERVED_CELLS'); return; }

    const deckGeo = plane(26, 1);
    const plinthGeo = box(SURF_W + 0.5, PLINTH_H, SURF_D + 0.5);
    const meshes = [uploadMesh(stage, deckGeo), uploadMesh(stage, plinthGeo), uploadMesh(stage, field.geometry)];
    for (const m of meshes) if ('kind' in m) { refuse(m.code); return; }
    const [deckMesh, plinthMesh, surfMesh] = meshes as Exclude<typeof meshes[number], { kind: 'refused' }>[];

    const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const translate = (x: number, y: number, z: number): Float32Array => {
      /* `IDENTITY` is a FACTORY: `new Float32Array(IDENTITY)` is length 0, every vertex collapses to the
         origin, and the frame is a clear colour with no error. It cost E0 a day. */
      const m = IDENTITY();
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    };

    const draws: LitDraw[] = [
      { mesh: deckMesh!, model: translate(0, 0, 0), normalMat: N3,
        material: { baseColour: hexToLinear('#070B14'), roughness: 0.88, metalness: 0 } },
      { mesh: plinthMesh!, model: translate(0, PLINTH_H / 2, 0), normalMat: N3,
        material: { baseColour: hexToLinear('#101A31'), roughness: 0.62, metalness: 0.04 } },
      { mesh: surfMesh!, model: translate(0, PLINTH_H, 0), normalMat: N3,
        /* Dielectric, so §6 rule 5's hex survives: a metal has no diffuse lobe and #2C6BFF would arrive only
           through the specular F0 as a blue-tinted mirror of the sky. */
        material: { baseColour: hexToLinear('#2C6BFF'), roughness: 0.34, metalness: 0.05, anisotropy: 0.55 } },
    ];

    /* Contour ribbons, if the caller asked for levels. Built exactly as E5 builds them, including the rule that
       a cell with any unmeasured corner emits nothing — an iso-line through data nobody took is a fabricated
       line, and worse than a gap because it is indistinguishable from a real one. */
    let ribbonMeshRef: { dispose?: () => void } | null = null;
    if (contourLevels.length > 0 && field.observedRange) {
      const [lo, hi] = field.observedRange;
      const yOf = (v: number): number => (hi === lo ? 0 : ((v - lo) / (hi - lo)) * SURF_H);
      const contours = contourSegments(cols, rows, sampleAt, contourLevels);
      const pos: number[] = [], nrm: number[] = [], uv: number[] = [], tan: number[] = [], idx: number[] = [];
      const at = (gc: number, gr: number): [number, number, number] => {
        const v = sampleAt(Math.round(gc), Math.round(gr));
        return [
          -SURF_W / 2 + (gc / Math.max(1, cols - 1)) * SURF_W,
          (v === null ? 0 : yOf(v)) + 0.006,
          -SURF_D / 2 + (gr / Math.max(1, rows - 1)) * SURF_D,
        ];
      };
      for (const seg of contours.segments) {
        const a = at(seg.from[0], seg.from[1]);
        const b = at(seg.to[0], seg.to[1]);
        const dx = b[0] - a[0], dz = b[2] - a[2];
        const len = Math.hypot(dx, dz);
        if (len < 1e-9) continue;
        const px = (-dz / len) * 0.009, pz = (dx / len) * 0.009;
        const base = pos.length / 3;
        for (const [x, y, z] of [
          [a[0] - px, a[1], a[2] - pz], [a[0] + px, a[1], a[2] + pz],
          [b[0] + px, b[1], b[2] + pz], [b[0] - px, b[1], b[2] - pz],
        ] as [number, number, number][]) {
          pos.push(x, y, z); nrm.push(0, 1, 0); uv.push(0, 0); tan.push(1, 0, 0);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      if (idx.length > 0) {
        const rm = uploadMesh(stage, {
          positions: new Float32Array(pos), normals: new Float32Array(nrm),
          uvs: new Float32Array(uv), tangents: new Float32Array(tan),
          indices: idx.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
          min: [-SURF_W, 0, -SURF_D] as const, max: [SURF_W, SURF_H, SURF_D] as const,
        });
        if (!('kind' in rm)) {
          ribbonMeshRef = rm;
          draws.push({
            mesh: rm, model: translate(0, PLINTH_H, 0), normalMat: N3,
            material: { baseColour: hexToLinear('#7FB2FF'), roughness: 0.72, metalness: 0 },
          });
        }
      }
    }

    const view: Viewpoint = {
      target: [0, 0.52, 0.05], distance: 8.5, azimuthDeg: 38, elevationDeg: 26, fovDeg: 34,
    };
    const eye = eyeOf(view);
    const lightDir: [number, number, number] = [0.48, -0.62, -0.62];
    const lightVP = lightViewProjection(
      { direction: lightDir, colour: [1, 1, 1], extent: 6.4 },
      boundsCentre([-3.6, 0, -2.8], [4.2, 1.8, 3.2]),
      boundsRadius([-3.6, 0, -2.8], [4.2, 1.8, 3.2]),
    );

    /*
     * ONE FRAME, then nothing. §6 rule 2 forbids idle animation, and there is no interaction here yet — so
     * there is no `requestAnimationFrame` at all, which is also why the reduced-motion case needs no branch:
     * a still frame is already the final frame.
     */
    const vp = viewProjection(view, W / H);
    lit.shadowPass(lightVP, draws, shadow);
    target.bind();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    skyBox.draw({ eye, target: view.target, fovDeg: view.fovDeg ?? 34, aspect: W / H });
    lit.depthPrepass(vp, draws);
    lit.draw({
      viewProj: vp, eye, lightDir, lightColour: [3.4, 3.35, 3.2],
      ambientGain: 1.0, lightVP, shadow, shadowStrength: 0.9, draws,
      ao: null, screenSize: [W, H],
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));

    const err = gl.getError();
    if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return; }

    /*
     * CONTEXT LOSS RESOLVES TO THE FLAT SURFACE. Without this the canvas keeps its last frame on screen for
     * ever while the GPU has dropped the context — a stale picture presented as live data, which is worse than
     * no picture. Registered on the canvas rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      ribbonMeshRef?.dispose?.();
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST. It owns the context; releasing it before the resources built on it leaves each
         `delete*` call operating on a dead context, which is silent rather than fatal and leaks on every
         remount — and this component remounts whenever a reader toggles it. */
      stage.dispose();
    };
  }, [surface, heightPx, onRefused, contourLevels]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${heightPx}px`, display: 'block' }}
      /* The relief is the same measurements the table beside it carries, so it is not announced twice; the
         figure's own caption and the flat surface underneath it are what a screen reader reads. */
      aria-hidden="true"
    />
  );
}
