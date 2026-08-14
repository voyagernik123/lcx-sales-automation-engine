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
  qualitySettings, shadowMapSizeFor, pickQualityTier,
  type LitDraw, type Viewpoint,
} from '@lcx/gl';
import { isProjectedSurface, type SurfaceOutcome } from '@lcx/shared';
import {
  useResolvedQualityTier, needsQualityProbe, measureFrameMs, recordQualityProbe,
} from '../shared/useQualityTier';

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

/**
 * THIS SCENE'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * The surface and its plinth sit inside 5 m, so 1024 puts a texel at about 5 mm. `env/quality.ts:91` records
 * what happens if the tier's absolute `shadowMapSize` is used instead: E0, E2 and E8 had each chosen 1024 and
 * were handed 1536 at the default tier — a 2.25x bigger map and three captures that changed without anyone
 * saying so. A ladder that alters the look at its HIGHEST tier is not a ladder, it is a redesign.
 */
const SHADOW_BASELINE = 1024;

/** The dataset this renderer draws: the mesh, plus the iso-levels the caller asked for. */
interface SurfaceInput {
  readonly surface: SurfaceOutcome;
  readonly contourLevels: readonly number[];
}

export default function SurfaceReliefGl({
  surface, heightPx, onRefused, contourLevels = [],
}: SurfaceReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /*
   * THE TIER, AND WHY THIS ONE SUBSCRIBES TO CHANGES.
   *
   * This surface renders one frame into an offscreen target and only then blits it to the canvas, so if the
   * probe below resolves a lower tier the scene can be rebuilt before ANYTHING has been painted — the reader
   * never sees a frame change under them, which is the property `env/quality.ts` bans a feedback loop for
   * failing to have.
   */
  const tier = useResolvedQualityTier();

  /**
   * THE REDRAW LIVES IN A REF, AND THAT IS WHAT KEEPS ONE GL CONTEXT ACROSS A DATA CHANGE.
   *
   * `surface` and `contourLevels` used to be in the setup effect's dependency list, so a new reading of the
   * grid disposed the stage and built another one. Measured with a counting WebGL2 context, one change to
   * `surface` cost **1 context, 5 programs, 10 shaders, 5 vertex arrays, 17 bufferData calls, 6 textures and 5
   * framebuffers** — of which only the heightfield and the ribbons are actually data. That is §6 rule 7's
   * hazard on every data update, and `DeckReliefGl.tsx:205-213` already ships the fix for its own click path.
   *
   * `contourLevels` MADE IT WORSE THAN ONCE PER DATASET. `SurfaceRelief.tsx:78` defaults it to `[]` and passes
   * it straight down, so the array had a new identity on EVERY parent render — the toggle's own `useState`
   * included — and each one rebuilt the context. That is why the redraw below compares the levels by value.
   */
  const drawRef = useRef<((d: SurfaceInput) => 'STALE_TIER' | undefined) | null>(null);
  /*
   * THE LATEST DATASET, so a TIER change can redraw it. The setup effect re-runs when the probe resolves a
   * lower tier, and at that moment the draw effect below does NOT re-run — its dependencies did not change —
   * so without this the rebuilt context would have nothing to put on the canvas.
   */
  const inputRef = useRef<SurfaceInput>({ surface, contourLevels });

  /*
   * THE DRAW EFFECT IS DECLARED FIRST, AND THE ORDER IS LOAD-BEARING. React runs effects in declaration order,
   * so on MOUNT this one runs before the setup below has published a draw function: it records the dataset and
   * returns, and the setup effect draws it. On a DATA CHANGE only this one re-runs, and the context is untouched.
   *
   * THE LEVELS ARE JOINED RATHER THAN COMPARED BY IDENTITY. See the `contourLevels` note above: the caller hands
   * down a fresh array every render, so an identity dependency would redraw the frame on every keystroke
   * elsewhere on the page. The joined string changes exactly when a level does.
   */
  const levelKey = contourLevels.join(',');
  useEffect(() => {
    const input: SurfaceInput = { surface, contourLevels: levelKey === '' ? [] : levelKey.split(',').map(Number) };
    inputRef.current = input;
    drawRef.current?.(input);
  }, [surface, levelKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRef.current = null;
    /* THE ENGINE'S OWN REFUSAL STILL COMES BEFORE THE RENDERER. A surface the engine declined to project must
       not cost a WebGL context to be told so. Read through the ref rather than the prop, so this check does not
       put the data back in the dependency list below; `draw` makes the same judgement on every later surface. */
    if (!isProjectedSurface(inputRef.current.surface)) { onRefused('SURFACE_REFUSED_BY_ENGINE'); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map
     * there is no point rendering: the frame would be off-brand by an amount too small to see and too large to
     * be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    /* DPR CAPPED BY THE TIER. Everything in this frame is fill-bound, so a 3× display would triple the cost
       of a surface whose whole justification is that an operator reads it faster. The cap WAS a literal 2;
       it is now `Q.dprScale`, which is 2 at `full` and `reduced` and 1 at `minimum` — resolution multiplies
       every fill-bound pass, which is all of them, so it is the largest single thing the ladder can drop. */
    const Q = qualitySettings(tier);
    const dpr = Math.min(Q.dprScale, Math.max(1, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 640;
    const W = Math.round(cssW * dpr), H = Math.round(heightPx * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    /*
     * TWO DISPOSAL LISTS, BECAUSE TWO LIFETIMES.
     *
     * `disposers` holds what the SIZE and the TIER own — the context, the programs, the targets, the deck and
     * the plinth — and is released once, on unmount. `dataDisposers` holds the two meshes whose VERTICES ARE
     * THE DATA: the heightfield and the contour ribbons. Those really do have to be re-uploaded when the grid
     * changes, because their vertex count changes with the number of drawn cells and `MeshBuffer` exposes no
     * sub-range update. Everything else in this scene does not, and that is the difference the split buys.
     */
    const data: { disposers: (() => void)[] } = { disposers: [] };
    const releaseData = (): void => {
      for (const d of data.disposers.reverse()) d();
      data.disposers = [];
    };
    /* Set by whichever of `refuse` and the cleanup runs first. A redraw can refuse now, so both paths can be
       reached in one mount, and `disposers.reverse()` MUTATES — running it twice disposes forwards, with the
       stage killed before the resources built on it. */
    let dead = false;
    const releaseAll = (): void => {
      if (dead) return;
      dead = true;
      releaseData();
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST. It owns the context; releasing it before the resources built on it leaves each
         `delete*` call operating on a dead context, which is silent rather than fatal and leaks on every
         remount — and this component remounts whenever a reader toggles it. */
      stage.dispose();
    };
    const refuse = (code: string): void => {
      drawRef.current = null;
      releaseAll();
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
    const shadow = createShadowMap(stage, shadowMapSizeFor(tier, SHADOW_BASELINE));
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());
    const skyBox = createSkyBackdrop(stage);
    if ('kind' in skyBox) { refuse(skyBox.code); return; }
    disposers.push(() => skyBox.dispose());

    /* THE DECK AND THE PLINTH ARE THE SAME FOR EVERY DATASET, so they are uploaded once and survive every
       redraw. The heightfield that used to be uploaded beside them is now built inside `draw`. */
    const deckGeo = plane(26, 1);
    const plinthGeo = box(SURF_W + 0.5, PLINTH_H, SURF_D + 0.5);
    const staticMeshes = [uploadMesh(stage, deckGeo), uploadMesh(stage, plinthGeo)];
    for (const m of staticMeshes) if ('kind' in m) { refuse(m.code); return; }
    const [deckMesh, plinthMesh] = staticMeshes as Exclude<typeof staticMeshes[number], { kind: 'refused' }>[];
    for (const m of [deckMesh!, plinthMesh!]) disposers.push(() => m.dispose());

    const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const translate = (x: number, y: number, z: number): Float32Array => {
      /* `IDENTITY` is a FACTORY: `new Float32Array(IDENTITY)` is length 0, every vertex collapses to the
         origin, and the frame is a clear colour with no error. It cost E0 a day. */
      const m = IDENTITY();
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    };

    const staticDraws: LitDraw[] = [
      { mesh: deckMesh!, model: translate(0, 0, 0), normalMat: N3,
        material: { baseColour: hexToLinear('#070B14'), roughness: 0.88, metalness: 0 } },
      { mesh: plinthMesh!, model: translate(0, PLINTH_H / 2, 0), normalMat: N3,
        material: { baseColour: hexToLinear('#101A31'), roughness: 0.62, metalness: 0.04 } },
    ];

    /* Dielectric, so §6 rule 5's hex survives: a metal has no diffuse lobe and #2C6BFF would arrive only
       through the specular F0 as a blue-tinted mirror of the sky. */
    /*
         * ── WHY THE ANISOTROPIC ROUGHNESS VALUES LOOK ODD: THEY ARE sqrt() OF WHAT THEY WERE ────────────────
         * Re-authored 2026-08-13. The RENDERED RESULT IS INTENDED TO BE UNCHANGED; only the units moved.
         *
         * `distributionGGXAniso` used to receive at/ab derived from PERCEPTUAL roughness, so its effective alpha
         * was ~rough, while the isotropic branch has always used alpha = rough^2. Commit 38c01b1 made the two
         * branches agree — correct, and verified symbolically. But every anisotropic material in this repo had been
         * AUTHORED against the old convention, so correcting it made all eleven of them sharper: the E8 disc's lobe
         * half-width by 3.33x, the ring's by 7.9x along the highlight and 7.7x across.
         *
         * That is a redesign, not a fix. `docs/3d/e8/README.md` states the intent in as many words — the highlight
         * "has to TRAVEL", the disc is "brushed, not mirror — a broad travelling highlight instead of a hotspot",
         * and it "shows a BAR of light rather than a dot". A lobe 3.3x narrower works against that.
         *
         * So each value is now sqrt() of the authored one, which restores the effective alpha exactly
         * (sqrt(r)^2 == r) while the number finally means what the type says it means. Isotropic materials are
         * untouched: they always used rough^2, so they were never affected.
         * Pinned by `packages/gl/src/env/anisoPreserved.test.ts`.
     */
    const SURFACE_MAT = {
      baseColour: hexToLinear('#2C6BFF'), roughness: 0.5831, metalness: 0.05, anisotropy: 0.55,
    };

    /**
     * THE ONLY TWO MESHES IN THIS SCENE THAT ARE ACTUALLY DATA, rebuilt on a new grid and on nothing else.
     *
     * The heightfield's vertex COUNT changes with the number of drawn cells and the ribbons' with the number of
     * iso-segments, so neither can be updated in place — `MeshBuffer` (`packages/gl/src/env/lit.ts:596`) hands
     * back a VAO and four `STATIC_DRAW` buffers and no way to rewrite a range of one. Reallocation is therefore
     * correct here, and it is the whole GPU cost of a data change on this surface.
     */
    const dataDraws = (input: SurfaceInput): LitDraw[] | { refusal: string } => {
      /*
       * THE GRID COMES FROM THE ENGINE'S OWN QUADS, not from a second read of the caller's rows.
       *
       * `SurfaceGeometry` carries `quads` with `col`/`row`/`zMean` and `holes` with the corners it refused.
       * Taking the heights from there means this drawing and the flat one cannot disagree about a single cell —
       * which is the property E5's harness asserts as `agreesWithFlat`, and it is the whole basis for putting a
       * 3-D view in front of an operator at all.
       */
      const s = input.surface;
      /* The engine's own refusal, re-made on every dataset rather than once at mount: the SECOND surface a
         filter produces can be one the engine declined to project, and drawing it would be a picture of a
         geometry that does not exist. */
      if (!isProjectedSurface(s)) return { refusal: 'SURFACE_REFUSED_BY_ENGINE' };
      const cols = s.xTicks.length, rows = s.yTicks.length;
      const observed = new Map<string, number>();
      for (const q of s.quads) {
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
      if (field.cellsDrawn === 0) return { refusal: 'NO_OBSERVED_CELLS' };

      const surfMesh = uploadMesh(stage, field.geometry);
      if ('kind' in surfMesh) return { refusal: surfMesh.code };
      data.disposers.push(() => surfMesh.dispose());

      const out: LitDraw[] = [
        { mesh: surfMesh, model: translate(0, PLINTH_H, 0), normalMat: N3, material: SURFACE_MAT },
      ];

      /* Contour ribbons, if the caller asked for levels. Built exactly as E5 builds them, including the rule
         that a cell with any unmeasured corner emits nothing — an iso-line through data nobody took is a
         fabricated line, and worse than a gap because it is indistinguishable from a real one. */
      if (input.contourLevels.length > 0 && field.observedRange) {
        const [lo, hi] = field.observedRange;
        const yOf = (v: number): number => (hi === lo ? 0 : ((v - lo) / (hi - lo)) * SURF_H);
        const contours = contourSegments(cols, rows, sampleAt, input.contourLevels);
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
            data.disposers.push(() => rm.dispose());
            out.push({
              mesh: rm, model: translate(0, PLINTH_H, 0), normalMat: N3,
              material: { baseColour: hexToLinear('#7FB2FF'), roughness: 0.72, metalness: 0 },
            });
          }
        }
      }
      return out;
    };

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
    /*
     * THE SCENE IS A FUNCTION NOW, SO IT CAN BE MEASURED. It ends with `target` still bound, which is what
     * `probeSync` requires: a `readPixels` only guarantees completion of work affecting the framebuffer it
     * reads, and this frame lands in an offscreen HDR target rather than in the default one.
     */
    const renderScene = (draws: readonly LitDraw[]): void => {
      lit.shadowPass(lightVP, draws, shadow);
      target.bind();
      gl.clear(gl.DEPTH_BUFFER_BIT);
      skyBox.draw({ eye, target: view.target, fovDeg: view.fovDeg ?? 34, aspect: W / H });
      lit.depthPrepass(vp, draws);
      lit.draw({
        viewProj: vp, eye, lightDir, lightColour: [3.4, 3.35, 3.2],
        ambientGain: 1.0, lightVP, shadow, shadowStrength: 0.9, shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws,
        ao: null, screenSize: [W, H],
      });
    };
    const presentFrame = (): void => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
    };

    /*
     * ONE REDRAW, WHICH IS THE WHOLE RESPONSE TO A NEW GRID — no context, no program, no target, no sky.
     *
     * THE PREVIOUS GRID'S MESHES ARE RELEASED FIRST. Building the new heightfield before disposing the old one
     * would hold two grids on the GPU at once, and the failure of forgetting the release altogether is silent:
     * `Stage` owns programs and its own targets and knows nothing about a VAO, so an undisposed mesh is one
     * vertex array and four buffers stranded per data change — and this surface changes on every filter.
     */
    const draw = (input: SurfaceInput): 'STALE_TIER' | undefined => {
      releaseData();
      const data = dataDraws(input);
      if ('refusal' in data) { refuse(data.refusal); return undefined; }
      const draws = [...staticDraws, ...data];

      /*
       * THE PROBE, AND WHY THIS SURFACE IS ALLOWED TO TAKE IT.
       *
       * `pickQualityTier` needs a frame time from a KNOWN tier and had no caller anywhere in the repo. This is
       * one: the scene is rendered a discarded warm-up frame first (the first frame pays shader upload, and
       * charging that to the GPU would downgrade every machine), then two sync-bounded samples are taken and
       * the cheaper is used. All of it happens BEFORE the first blit, so the extra frames cost the reader a few
       * milliseconds of latency and cost the picture nothing.
       *
       * It runs on at most one mount per page load — `needsQualityProbe` is false the moment a tier resolves —
       * so no reader ever pays for this twice, and no REDRAW ever pays for it: a data update that re-timed the
       * machine would make the quality ladder follow the dataset instead of the GPU.
       */
      if (needsQualityProbe()) {
        const ms = measureFrameMs(gl, () => renderScene(draws));
        const r = recordQualityProbe({
          pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'SurfaceReliefGl',
        });
        /*
         * A LOWER TIER MEANS THIS BUILD IS STALE, so nothing is presented. `useResolvedQualityTier` has already
         * been notified, the effect re-runs with the new tier, and the FIRST thing the reader sees is the
         * resolved tier rather than a full-tier frame that then changes.
         */
        if (r.tier !== tier) return 'STALE_TIER';
      }

      renderScene(draws);
      presentFrame();
      /* STAMPED ON THE CANVAS. `env/quality.ts` is explicit that a tier which cannot be reported cannot be
         trusted; the harnesses print it in their report and this is the app's equivalent. */
      canvas.dataset.qualityTier = tier;

      const err = gl.getError();
      if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return undefined; }
      return undefined;
    };

    /* THE FIRST FRAME COMES FROM THE SETUP, NOT FROM THE DRAW EFFECT ABOVE. On a tier rebuild that effect does
       not re-run — its dependencies did not change — so a rebuilt context with no draw would leave the reader a
       blank canvas where a measured surface was. */
    if (draw(inputRef.current) === 'STALE_TIER') {
      /* No context-lost listener on this path: there is no picture on screen to go stale, and `onRefused`
         must not fire — the scene is about to be rebuilt, not refused. */
      return releaseAll;
    }
    /* A REFUSAL ON THE FIRST DRAW HAS ALREADY DISPOSED EVERYTHING, so there is nothing left to arm a redraw
       against and nothing left to clean up. Publishing `draw` here would leave a closure over a dead stage
       that a later data change would call — silently, because GL does not throw on a disposed context. */
    if (dead) return;
    drawRef.current = draw;

    /*
     * CONTEXT LOSS RESOLVES TO THE FLAT SURFACE. Without this the canvas keeps its last frame on screen for
     * ever while the GPU has dropped the context — a stale picture presented as live data, which is worse than
     * no picture. Registered on the canvas rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      drawRef.current = null;
      releaseAll();
    };
    /* `tier` IS A DEPENDENCY, and that is the whole rebuild mechanism: when the probe resolves something
       lower, this effect tears the context down and builds the scene again at the resolved tier. `surface` and
       `contourLevels` ARE NOT, and that is the fix this file exists to carry. */
  }, [heightPx, onRefused, tier]);

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
