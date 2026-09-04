import { useEffect, useRef, useState } from 'react';
import { FORGE_GLB_URL, swapForgeMeshes } from './forgeObjects';
/* The tier only; no `@lcx/gl` runtime import comes with it — see that module's header on why it takes
   `pickQualityTier` as an argument rather than importing it. Static-importing the package here once pushed the
   shell chunk to 441 KB against a 440 KB ceiling. */
import { resolveQualityTier } from '../shared/useQualityTier';

/**
 * E8 · THE FORGE, on the sign-in screen.
 *
 * `3D_VFX_1000X.md` §2 E8: the LCX mark as a machined metal object, a single moving key light,
 * five seconds, once. Sign-in is the one screen every operator and every stranger passes through,
 * which is why §5 ships it first.
 *
 * ── FIVE SECONDS, ONCE — NOT AN IDLE ANIMATION ──────────────────────────────────────
 * §6 rule 2 forbids animation that carries no information, and a key light orbiting forever is
 * exactly that. So the sweep runs ONE arc and stops, holding the frame where the highlight sits
 * best. `prefers-reduced-motion` skips straight to that final frame — the reader sees the same
 * object, without the movement, which is what the media query asks for and not "the same
 * animation, faster".
 *
 * ── THE CSS PLATE IS ALWAYS UNDERNEATH, AND IT LIVES IN `ForgePlate` ────────────────
 * §6 rule 1. Server render, print, no WebGL2, a GPU that refuses a float target, and the first
 * paint before this chunk is fetched all resolve to that gradient. Nothing on this screen is
 * unreadable without the GL layer — the sign-in form sits above it and never depends on it. That
 * property is what makes shipping a renderer to the FRONT DOOR defensible at all.
 *
 * This component is LAZY for a measured reason: imported statically into the eagerly-loaded
 * sign-in route it pushed the shell chunk to 441 KB against a 440 KB ceiling.
 *
 * ── TWO LIGHTING ENVIRONMENTS, NOT ONE ─────────────────────────────────────────────
 * The sign-in screen is a designed light/dark pair, and the first version of this rendered one
 * near-black room regardless — which would have blacked out the light theme. Machined metal reads
 * beautifully on a bright ground, so light mode gets a studio sky and a brighter key, dark mode
 * keeps the room. The object is identical; only the light around it changes, which is exactly what
 * a real product shot does.
 *
 * ── ITS OWN CONTEXT, DELIBERATELY ───────────────────────────────────────────────────
 * The chart kit shares one context across thirteen primitives because a dashboard can hold sixty
 * canvases and an 8 GB M1 will exhaust contexts. This screen has exactly one, and it needs a DEPTH
 * buffer and five render targets the shared 2-D stage does not carry. One dedicated context here
 * is correct; the moment a second environment appears on the same route, they must share.
 */

/*
 * ── ELEVEN SPECIFIERS, NOT THE BARREL, AND THE REASON IS NOT TREE-SHAKING ───────────
 * `docs/3d/w2/SUBPATH_COST.md` measured all three candidate fixes. Named imports from the barrel
 * shake to within FOUR BYTES of importing the same names from their own modules, and destructuring
 * at the call site was measured NOT fixing it. Rollup groups a module by the set of ENTRIES that
 * reach it, so while a chart route and this screen both resolve to `src/index.ts` the union of both
 * lanes is one chunk by construction. SPECIFIER IDENTITY is the only lever.
 *
 * Migrated because the HALF STATE is worse than either end, measured: with the four flat adapters
 * moved and this file left on the barrel, the sign-in shell went from 13 chunks / 100,709 B to
 * 18 / 102,832 B — +2,123 B and five extra round trips — on the one screen every reader meets first.
 * That is precisely the loss SUBPATH_COST.md section 5 predicts for a partial migration.
 *
 * The member list is DERIVED from the frame, not transcribed: every `gl3.` reference in this file,
 * resolved to the module that actually exports it. It is a type, so it is erased and costs nothing
 * at runtime — the saving is entirely in which specifiers the dynamic import names below.
 */
interface GlMod {
  readonly createStage: typeof import('@lcx/gl/stage.js')['createStage'];
  readonly isStage: typeof import('@lcx/gl/stage.js')['isStage'];
  readonly IDENTITY: typeof import('@lcx/gl/math.js')['IDENTITY'];
  readonly hexToLinear: typeof import('@lcx/gl/look/colour.js')['hexToLinear'];
  readonly TONE_MAP_GLSL: typeof import('@lcx/gl/look/tonemap.js')['TONE_MAP_GLSL'];
  readonly SRGB_ENCODE_GLSL: typeof import('@lcx/gl/look/tonemap.js')['SRGB_ENCODE_GLSL'];
  readonly qualitySettings: typeof import('@lcx/gl/env/quality.js')['qualitySettings'];
  readonly shadowMapSizeFor: typeof import('@lcx/gl/env/quality.js')['shadowMapSizeFor'];
  readonly plane: typeof import('@lcx/gl/env/mesh.js')['plane'];
  readonly cylinder: typeof import('@lcx/gl/env/mesh.js')['cylinder'];
  readonly torus: typeof import('@lcx/gl/env/mesh.js')['torus'];
  readonly createLitRenderer: typeof import('@lcx/gl/env/lit.js')['createLitRenderer'];
  readonly uploadMesh: typeof import('@lcx/gl/env/lit.js')['uploadMesh'];
  readonly parseGlb: typeof import('@lcx/gl/env/gltf.js')['parseGlb'];
  readonly createTarget3D: typeof import('@lcx/gl/env/target3d.js')['createTarget3D'];
  readonly createShadowMap: typeof import('@lcx/gl/env/target3d.js')['createShadowMap'];
  readonly createSkyBackdrop: typeof import('@lcx/gl/env/sky.js')['createSkyBackdrop'];
  readonly createAmbientOcclusion: typeof import('@lcx/gl/env/ao.js')['createAmbientOcclusion'];
  readonly createDepthOfField: typeof import('@lcx/gl/env/dof.js')['createDepthOfField'];
  readonly eyeOf: typeof import('@lcx/gl/env/camera.js')['eyeOf'];
  readonly viewProjection: typeof import('@lcx/gl/env/camera.js')['viewProjection'];
  readonly lightViewProjection: typeof import('@lcx/gl/env/camera.js')['lightViewProjection'];
  readonly boundsRadius: typeof import('@lcx/gl/env/camera.js')['boundsRadius'];
  readonly boundsCentre: typeof import('@lcx/gl/env/camera.js')['boundsCentre'];
  /* The exposure solve reaches these through `ExposureMath`, not through a `gl3.` reference, so a
     census of `gl3.` alone missed both and the compiler is what caught it — the same
     derive-do-not-enumerate failure this file's neighbours keep hitting, one scope over. */
  readonly inverseToneMap: typeof import('@lcx/gl/look/precompensate.js')['inverseToneMap'];
  readonly skyIrradiance: typeof import('@lcx/gl/env/sky.js')['skyIrradiance'];
}

/**
 * THE MARK'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * 1024 because the subject is one disc on one plinth. `env/quality.ts:91` records the alternative and what it
 * cost: handing over the tier's absolute `shadowMapSize` gave E0, E2 and E8 a 1536 map where each had chosen
 * 1024 — a 2.25x bigger map and three captures that changed without anyone saying so.
 */
const SHADOW_BASELINE = 1024;

/** How long the key light takes to travel its arc. Then it stops. */
const SWEEP_MS = 5000;

/**
 * THE ARC, factored out of `render` because the EXPOSURE SOLVE below has to know the strongest
 * light the sweep ever reaches — not the one at whichever frame it happens to be drawing. An
 * exposure derived from the live direction would change while the arc travels, which is an
 * auto-exposure pumping the whole frame's brightness for five seconds.
 *
 * `eased` is 0..1 across the sweep; `a` therefore runs -1.35 to 0.15 radians.
 */
const lightDirAt = (eased: number): [number, number, number] => {
  const a = -1.35 + eased * 1.5;
  return [Math.sin(a) * 0.85, -0.95, Math.cos(a) * 0.55];
};

/**
 * THE LARGEST N·L ANYTHING IN THIS SCENE REACHES, over the whole arc.
 *
 * The light's y component is a constant -0.95, so for the FLOOR — the only large area whose normal
 * IS the up axis — N·L is |dir.y| / |dir|, and that peaks where the horizontal component is
 * smallest. Every other surface here is curved and takes less: the plinth is a lathe, the disc and
 * the ring are turned metal, and none of them presents a flat face to the key across any real area.
 * That asymmetry is the whole reason the GROUND is what blows out while the object does not.
 *
 * Sampled rather than solved, so it stays correct if the arc's endpoints move. 512 samples put it
 * within 1e-7 of the closed form 0.95 / sqrt(0.85² sin²a + 0.95² + 0.55² cos²a) at a = 0.
 */
const PEAK_NDOTL = ((): number => {
  let peak = 0;
  for (let i = 0; i <= 512; i++) {
    const d = lightDirAt(i / 512);
    peak = Math.max(peak, Math.abs(d[1]) / Math.hypot(d[0], d[1], d[2]));
  }
  return peak;
})();

/** The key's warm tint. ONE gain, three channels — `lightColour` and the solve share it or drift. */
const KEY_TINT = [1, 0.96, 0.885] as const;

/**
 * THE TWO RIGS, AND THE ONE AXIS THAT WAS MISSING FROM BOTH.
 *
 * These three numbers are the LOOK: how hard the key is relative to the fill, and how far the
 * shadows go down. Their light/dark direction is the counter-intuitive one and it is unchanged —
 * light takes a key 1.42x dark's against an ambient 0.54x of it, because on a bright ground bounced
 * light already fills the scene and form has to come from the key.
 *
 * What they are NOT is an EXPOSURE. Where the frame sits on the tone curve is a different question
 * from how the light is shaped, and until now one number answered both — so the answer was tuned by
 * eye and landed 1.17x past the point where the tone map stops encoding. `LIGHT_EXPOSURE` below is
 * that second axis, solved.
 */
const KEY_GAIN = { dark: 5.2, light: 7.4 } as const;
const AMBIENT_GAIN = { dark: 1.15, light: 0.62 } as const;
/** A 0..1 mix, not a radiance — nothing here can clip, so the exposure does not touch it. */
const SHADOW_STRENGTH = { dark: 0.9, light: 0.62 } as const;

/** The ground albedo per theme. `look/theme.ts` records this pair as its worked example. */
const GROUND = { dark: '#080C15', light: '#D7DEEA' } as const;

/**
 * The light theme's studio sky. Hoisted out of `skyStopsFor` because the exposure solve needs its
 * irradiance at the up normal, and a second copy of these nine numbers is a second thing to keep in
 * step. Dark keeps `sky.ts`'s authored room, which is why `skyStopsFor` returns `undefined` there.
 */
const LIGHT_SKY = {
  zenith: [0.72, 0.78, 0.90], horizon: [0.95, 0.96, 0.99], ground: [0.42, 0.46, 0.55],
} as const;

/** The three pure functions the solve needs. Passed in, because this file may not import
    `@lcx/gl` statically — see the header on the 441 KB shell chunk. */
type ExposureMath = Pick<GlMod, 'hexToLinear' | 'inverseToneMap' | 'skyIrradiance'>;

/**
 * ══ THE LIGHT GROUND RENDERED AS PURE WHITE, AND THIS IS THE TERM THAT DID IT ══════════
 *
 * MEASURED on the deployed sign-in screen, headless chromium 1280x800 @2, the app's own theme
 * switch, a real rAF wait: 37.07% of the light frame was FULLY CLIPPED — every channel at 254 or
 * above. The page background is rgb(244,246,250), below that threshold on all three, so the clipped
 * third was not the page. It was this canvas's ground plane. Segmenting the frame by dropping each
 * draw in turn puts a number on it: the floor is 40.09% of the frame and 94.86% OF THE FLOOR was
 * clipped — 1.64M pixels holding one value.
 *
 * ── THE ARITHMETIC ──────────────────────────────────────────────────────────────────
 * `lcxToneMap` is c/(1 + 0.4c). It reaches 1.0 — pure white BEFORE the sRGB encode — at
 * c = 1/(1-0.4) = 1.6667, which `look/precompensate.ts` already names `PRECOMP_CLIP`. Every
 * radiance at or above it is the same pixel.
 *
 * The ground is Lambertian (metalness 0), so its radiance is albedo·(tint·key·N·L/π + sky·ambient).
 * With albedo #D7DEEA, key 7.4, ambient 0.62 and N·L at its arc maximum 0.865426:
 *
 *          albedo   key diffuse   ambient      total    vs the 1.6667 clip
 *   R     0.67954       1.38525    0.30335    1.68860        1.013x   OVER
 *   G     0.73046       1.42949    0.35325    1.78274        1.070x   OVER
 *   B     0.82279       1.48437    0.45911    1.94348        1.166x   OVER
 *
 * THE KEY'S DIFFUSE TERM IS THE ONE THAT CLIPS. It is 82%, 80% and 76% of those totals, and it
 * alone is 0.83x, 0.86x and 0.89x of the entire tone-map range before ambient is added. The ambient
 * is 18-24% and is not the cause; zeroing it would stop the clip but only because it takes 24% of a
 * budget the key had already spent 89% of. Confirmed on the GPU: a CPU transcription of `lit.ts`'s
 * fragment shader agrees with the rendered framebuffer to 0/255 on all 12 on-screen floor pixels in
 * DARK, where nothing clips and a disagreement could not hide behind a saturated channel.
 *
 * ── AND THE ARITHMETIC PREDICTED THE FRAME THE ARC STARTS FAILING AT ────────────────
 * "Fully clipped" needs all three channels at 254, so the binding channel is the DIMMEST one, red.
 * Solving 0.67954·(7.4·N·L/π + 0.72·0.62) = 1.6667 puts that crossing at N·L = 0.85183. Rendered
 * with the arc frozen at six positions — the shipped shader, one intercepted easing line, no race
 * between reading `t` and capturing — the frame goes from 0.00% clipped at N·L 0.821011 to 37.98%
 * at N·L 0.858015. The predicted threshold falls between those two samples, and the worst position
 * of the whole sweep is `PEAK_NDOTL` itself, a = 0, at 38.18%. After the fix all six read 0.00%.
 *
 * ── WHY THE GROUND AND NOT THE OBJECT ───────────────────────────────────────────────
 * `PEAK_NDOTL` above. The floor is the only large area whose normal is the up axis, so it takes the
 * key's full 0.865; the plinth, the disc and the ring are all turned surfaces and never do. And the
 * disc is metalness 0.95, which has essentially no diffuse lobe at all. So the term that clips is
 * the term the OBJECT barely has — which is why turning the key down "until the metal looks right"
 * could never have found this.
 *
 * ── THE FIX, AND WHY IT IS NOT "TURN THE KEY DOWN" ──────────────────────────────────
 * The key/ambient RATIO is unchanged: 11.94:1 in light against 4.52:1 in dark, exactly as authored.
 * What changes is the absolute scale, and it is SOLVED rather than picked — the exposure at which
 * the ground's brightest pixel leaves the pipeline at THE COLOUR IT WAS AUTHORED WITH, #D7DEEA,
 * instead of at white. `inverseToneMap(albedo)` is the radiance that tone-maps and encodes back to
 * that albedo; divide it by the peak above, per channel, and take the binding one so no channel
 * renders brighter than authored. That is 0.552649, and it is a derivation, not a taste: an albedo
 * of 215 rendering at 255 was the defect, and after this an albedo of 215 renders at 215.
 *
 * MEASURED AFTER, same instrument: ground clipped 94.86% -> 0.00%, whole frame 37.06% -> 0.00%,
 * the ground's median pixel rgb(255,255,255) -> rgb(215,218,224) against the authored rgb(215,222,234),
 * and the brightest pixel in the frame moved OFF the floor and onto the metal, where a product shot
 * needs it. The plinth's silhouette step against the ground doubled, 1.0 -> 2.0 levels.
 *
 * ── DARK CANNOT MOVE, BY CONSTRUCTION ───────────────────────────────────────────────
 * `forgeRig` multiplies by `dark ? 1 : LIGHT_EXPOSURE`, and multiplication by 1.0 is exact in
 * IEEE 754 — `5.2 * 1 * intensity` is bit-for-bit `5.2 * intensity`. The dark rig is not re-derived,
 * re-tuned or re-checked; it is the same expression it always was with an exact identity in it. The
 * solve is deliberately NOT gated on `Math.min(1, ...)` instead: run against the dark scene it
 * returns 0.692, because dark's ground peaks at 0.0021-0.0060x the clip point and the criterion
 * "render at your albedo" would DARKEN a room that was authored to lift a near-black floor off
 * black. The criterion is a light-studio criterion and it says so.
 */
export function lightExposure(m: ExposureMath): number {
  const albedo = m.hexToLinear(GROUND.light);
  const sky = m.skyIrradiance([0, 1, 0], LIGHT_SKY);
  /* The radiance that tone-maps and encodes back to the authored albedo. Exact: `inverseToneMap`
     is the true inverse of `toneMapComposite` below the pole at 1/0.4, and 0.82 is far under it. */
  const target = m.inverseToneMap(albedo);
  const peak = (c: 0 | 1 | 2): number =>
    albedo[c] * ((KEY_TINT[c] * KEY_GAIN.light * PEAK_NDOTL) / Math.PI + sky[c] * AMBIENT_GAIN.light);
  /*
   * kd = (1-F)(1-metalness) is dropped, and so is the key's SPECULAR lobe on the floor. They pull
   * in opposite directions and nearly cancel: measured against the full BRDF the estimate above is
   * 1.04% high, which makes the solved exposure 1.04% conservative. A model that erred the other way
   * would put the clip back, so the sign of the approximation is the one to have.
   */
  return Math.min(target[0] / peak(0), target[1] / peak(1), target[2] / peak(2));
}

/** The gains actually handed to the renderer, per theme. Exported so a test can read the shipped
    numbers rather than a transcription of them. */
export interface ForgeRig {
  readonly keyGain: number;
  readonly ambientGain: number;
  readonly shadowStrength: number;
  /** Exactly 1 in dark. Not approximately — see the header. */
  readonly exposure: number;
}

/**
 * Everything the ground's radiance depends on, in one frozen record.
 *
 * Exported so `__tests__/forgeExposure.test.ts` can rebuild that radiance from the SHIPPED values
 * and check them against `@lcx/gl`'s own tone map and encode. A test that re-typed these four
 * numbers would pass forever after someone changed one of them here.
 */
export const FORGE_GROUND = Object.freeze({
  hex: GROUND, sky: LIGHT_SKY, keyTint: KEY_TINT, peakNdotL: PEAK_NDOTL,
});

export function forgeRig(dark: boolean, m: ExposureMath): ForgeRig {
  const exposure = dark ? 1 : lightExposure(m);
  const t = dark ? 'dark' : 'light';
  return {
    keyGain: KEY_GAIN[t] * exposure,
    ambientGain: AMBIENT_GAIN[t] * exposure,
    shadowStrength: SHADOW_STRENGTH[t],
    exposure,
  };
}

export interface ForgeBackdropProps {
  /** Set on the sign-in screen. Kept as a prop so a marketing page can dial it back. */
  readonly intensity?: number;
  /* Where the canvas sits relative to its siblings. `behind` (default) is the sign-in: the form floats over the object.
     `cover` is the /lcxos hero (P6): the canvas lies OVER the S7 still inside the figure and replaces it pixel-for-pixel
     once the first frame is ready — the still is what remains where GL refuses. */
  readonly layer?: 'behind' | 'cover';
}

export function ForgeBackdrop({ intensity = 1, layer = 'behind' }: ForgeBackdropProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  /* The refusal REASON is kept even though nothing renders it: a surface that wants to name why it
     degraded can read it, and discarding it would make the three states indistinguishable. */
  const [, setReason] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  /* `layer` is read through a ref so it never sits in the effect's dependency list: a mount is either the sign-in
     backdrop or the /lcxos hero for its whole life, and rebuilding a GL context because a prop changed is exactly what
     reliefRedrawRatchet forbids. A changed layer would apply on the next mount, which is the only time it can change. */
  const layerRef = useRef(layer);
  layerRef.current = layer;

  useEffect(() => {
    let alive = true;

    // Dynamic import so @lcx/gl never enters the shell chunk. The sign-in screen is the first
    // thing loaded, so putting a renderer in its critical path would be the worst possible place.
    /* One `Promise.all`, so `start` can never run against a half-built kit. Each symbol is named
       individually rather than spread: a retained namespace has no unused exports, so a spread
       would move the specifier and keep whole-module retention — the defect, not the fix. */
    void Promise.all([
      import('@lcx/gl/stage.js'),
      import('@lcx/gl/math.js'),
      import('@lcx/gl/look/colour.js'),
      import('@lcx/gl/look/tonemap.js'),
      import('@lcx/gl/env/quality.js'),
      import('@lcx/gl/env/mesh.js'),
      import('@lcx/gl/env/lit.js'),
      import('@lcx/gl/env/target3d.js'),
      import('@lcx/gl/env/sky.js'),
      import('@lcx/gl/env/ao.js'),
      import('@lcx/gl/env/dof.js'),
      import('@lcx/gl/env/camera.js'),
      import('@lcx/gl/look/precompensate.js'),
      import('@lcx/gl/env/gltf.js'),
    ]).then(([stg, mth, col, tm, q, mesh, lit, t3d, sky, ao, dof, cam, pre, gltf]) => {
      if (!alive) return;
      start({
        createStage: stg.createStage, isStage: stg.isStage,
        IDENTITY: mth.IDENTITY,
        hexToLinear: col.hexToLinear,
        TONE_MAP_GLSL: tm.TONE_MAP_GLSL, SRGB_ENCODE_GLSL: tm.SRGB_ENCODE_GLSL,
        qualitySettings: q.qualitySettings, shadowMapSizeFor: q.shadowMapSizeFor,
        plane: mesh.plane, cylinder: mesh.cylinder, torus: mesh.torus,
        createLitRenderer: lit.createLitRenderer, uploadMesh: lit.uploadMesh, parseGlb: gltf.parseGlb,
        createTarget3D: t3d.createTarget3D, createShadowMap: t3d.createShadowMap,
        createSkyBackdrop: sky.createSkyBackdrop,
        createAmbientOcclusion: ao.createAmbientOcclusion,
        createDepthOfField: dof.createDepthOfField,
        eyeOf: cam.eyeOf, viewProjection: cam.viewProjection,
        lightViewProjection: cam.lightViewProjection,
        boundsRadius: cam.boundsRadius, boundsCentre: cam.boundsCentre,
        inverseToneMap: pre.inverseToneMap, skyIrradiance: sky.skyIrradiance,
      });
    }).catch(() => {
      if (alive) setReason('The renderer could not be loaded.');
    });

    function start(gl3: GlMod) {
      const canvas = canvasRef.current;
      const host = hostRef.current;
      if (!canvas || !host) return;

      /*
       * THE QUALITY TIER, READ ONCE AND NOT SUBSCRIBED TO — and this is the one surface where that is the whole
       * point.
       *
       * `3D_VFX_1000X.md:316` records the ladder as the decided answer to §3.2 and says it is "wired into all
       * nine" harnesses. It was wired into none of the eight shipping components: this file hard-coded a 1024
       * shadow map, ran AO and DOF unconditionally and never passed `shadowTaps`, so a weak machine got the full
       * frame with nothing to drop — through a FIVE-SECOND ANIMATION, on the one screen every visitor passes.
       *
       * It reads `resolveQualityTier()` instead of `useResolvedQualityTier()` because a resolution arriving
       * mid-sweep must NOT restart the arc. `env/quality.ts` bans a tier that changes while the reader looks at
       * it — "ambient occlusion appearing three seconds in is not a graceful degradation, it is the frame
       * contradicting itself" — and an arc that jumps back to its start so the lens can switch off is exactly
       * that. So this mount lives with the tier it began at, and picks up a resolved one the next time it mounts.
       *
       * IT ALSO TAKES NO PROBE. `render` blits straight to the default framebuffer, so the discarded warm-up
       * frame a measurement needs would be a PRESENTED frame; and on the reduced-motion path there is only one
       * frame, which is also its warm-up. The five reliefs that render into an offscreen target take the probe.
       */
      const tier = resolveQualityTier();
      const Q = gl3.qualitySettings(tier);
      /* CAPPED BY THE TIER, where it was a literal 2. Every pass here is fill-bound. */
      const dpr = Math.min(Q.dprScale, Math.max(1, globalThis.devicePixelRatio || 1));
      const cssW = Math.max(1, host.clientWidth);
      const cssH = Math.max(1, host.clientHeight);
      const W = Math.round(cssW * dpr);
      const H = Math.round(cssH * dpr);
      canvas.width = W;
      canvas.height = H;

      /*
       * THE THEME IS READ PER FRAME, NOT ONCE AT MOUNT — and the e2e pixel ratchet is what caught
       * that. The first version captured it in a `const` during setup, so toggling to dark left the
       * canvas holding a stale WHITE STUDIO underneath dark-theme form controls: the heading came
       * out white-on-white and unreadable. A one-line snapshot of mutable global state.
       *
       * Read from the DOM class rather than a media query, because the app has an explicit toggle
       * and the media query would disagree with what is actually on screen.
       */
      const isDark = () => document.documentElement.classList.contains('dark');
      // `skyStops`, not `sky` — `sky` is the backdrop RESOURCE below, and shadowing it compiles
      // into a scene lit by a framebuffer object.
      const skyStopsFor = (dark: boolean) => (dark
        ? undefined                                    // the authored default room
        : LIGHT_SKY);

      /* SOLVED ONCE PER MOUNT, not per frame: every input is a constant, and re-solving inside the
         loop would allocate three small arrays on each of the arc's ~300 frames for an identical
         answer. See the header for what it solves and why dark's is exactly 1. */
      const rigs = { dark: forgeRig(true, gl3), light: forgeRig(false, gl3) };

      const outcome = gl3.createStage(canvas, { alpha: false });
      if (!gl3.isStage(outcome)) { setReason(outcome.reason); return; }
      const stage = outcome;
      const gl = stage.gl;

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
${gl3.TONE_MAP_GLSL}
${gl3.SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`;

      const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
      const lit = gl3.createLitRenderer(stage);
      const target = gl3.createTarget3D(stage, W, H);
      /* `shadowMapSizeFor`, NOT the tier's absolute `shadowMapSize`. `env/quality.ts:91` records what the
         absolute value did: E8 — this same mark, in its harness — had chosen 1024 and was handed 1536 at the
         default tier, so its capture changed without anyone saying so. 1024 is the mark's own choice because its
         subject is one disc; the tier scales it. */
      const shadow = gl3.createShadowMap(stage, gl3.shadowMapSizeFor(tier, SHADOW_BASELINE));
      const sky = gl3.createSkyBackdrop(stage);
      /* NOT ALLOCATED AT ALL when the tier declines them. DOF is the ladder's first drop and AO its second, in
         E0's measured cost order: the lens is ~6.4 ms of an 11.328 ms frame. */
      const ao = Q.ao ? gl3.createAmbientOcclusion(stage, W, H) : null;
      const dof = Q.dof ? gl3.createDepthOfField(stage, W, H) : null;

      /*
       * EVERY RESOURCE IS NARROWED INDIVIDUALLY, not checked in a loop.
       *
       * The loop version needed a double cast to compile, and a cast is precisely the mechanism by
       * which a refused resource gets used anyway — which renders a black frame with NO error, the
       * most expensive failure mode this renderer has produced. Seven explicit guards cost seven
       * lines and make that unrepresentable.
       */
      const bail = (reason: string) => { setReason(reason); stage.dispose(); };
      if ('kind' in present) return bail(present.reason);
      if ('kind' in lit) return bail(lit.reason);
      if ('kind' in target) return bail(target.reason);
      if ('kind' in shadow) return bail(shadow.reason);
      if ('kind' in sky) return bail(sky.reason);
      if (ao && 'kind' in ao) return bail(ao.reason);
      if (dof && 'kind' in dof) return bail(dof.reason);
      const P = present, R = lit, T = target, S = shadow, K = sky, A = ao, D = dof;

      const discGeo = gl3.cylinder(0.92, 0.16, 96);
      const ringGeo = gl3.torus(1.06, 0.055, 128, 32);
      const plinthGeo = gl3.cylinder(1.9, 0.09, 96);
      const floorGeo = gl3.plane(16, 24);
      const uploaded = [discGeo, ringGeo, plinthGeo, floorGeo].map((g) => gl3.uploadMesh(stage, g));
      if (uploaded.some((m) => 'kind' in m)) {
        setReason('The GPU refused a vertex buffer.');
        stage.dispose();
        return;
      }
      const [discM, ringM, plinthM, floorM] = uploaded as Array<
        Exclude<ReturnType<GlMod['uploadMesh']>, { kind: 'refused' }>
      >;
      /*
       * THE OBJECTS (THE PRODUCTION P6). The four primitives above are the FIRST FRAME — the same shapes the S7 still
       * was rendered from, so nothing waits on a fetch and the still and the live frame agree from the first pixel.
       * The machined meshes (bevels, the LCX mark engraved into the disc) arrive from /objects/forge.glb, parsed by the
       * engine's own loader, and REPLACE three buffers in place while the materials stay HERE, per theme
       * (anisoPreserved.test.ts pins them). `parts` is the one mutable seam: `buildDraws` reads it every frame, so a
       * swap is visible on the next frame with no other state. A refusal (fetch, parse, upload) leaves the primitives
       * standing and is written on the canvas for the instrument to read — never a black frame, never a partial swap
       * (forgeObjects.ts refuses those as a unit).
       */
      type Mesh = Exclude<ReturnType<GlMod['uploadMesh']>, { kind: 'refused' }>;
      const parts: { disc: Mesh; ring: Mesh; plinth: Mesh } = { disc: discM!, ring: ringM!, plinth: plinthM! };

      const at = (x: number, y: number, z: number) => {
        const m = gl3.IDENTITY(); m[12] = x; m[13] = y; m[14] = z; return m;
      };
      const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const DISC_Y = 0.30;
      /* Rebuilt per frame from the live theme. Four small objects; the GEOMETRY is uploaded once
         and shared, so this costs nothing measurable and cannot go stale. */
      const buildDraws = (dark: boolean) => [
        { mesh: floorM!, model: at(0, 0, 0), normalMat: NM,
          /* THE SAME CONSTANT THE EXPOSURE SOLVE READS. Inlining the hex here again is how the
             solve and the surface it is solving for would come to disagree. */
          material: { baseColour: gl3.hexToLinear(dark ? GROUND.dark : GROUND.light), roughness: 0.88, metalness: 0 } },
        { mesh: parts.plinth, model: at(0, 0.045, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear(dark ? '#161D2E' : '#AEBACD'), roughness: 0.52, metalness: 0.35 } },
        { mesh: parts.disc, model: at(0, DISC_Y, 0), normalMat: NM,
          /* GUNMETAL in light mode: #8FA3C4 against a white studio is white-on-white and the
             object dissolves. Dark mode keeps the brighter alloy because it needs to lift off a
             near-black room. Same object, different ground, different value. */
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
          material: { baseColour: gl3.hexToLinear(dark ? '#8FA3C4' : '#5E6C85'), roughness: 0.5477, metalness: 0.95, anisotropy: 0.86 } },
        { mesh: parts.ring, model: at(0, DISC_Y, 0), normalMat: NM,
          material: { baseColour: gl3.hexToLinear('#2C6BFF'), roughness: 0.3606, metalness: 0.92, anisotropy: 0.72 } },
      ];

      /*
       * THE OBJECT SINKS BELOW THE FORM, and the first attempt got this wrong in a way only a
       * screenshot could show: centred behind the card, the ring cut straight through the email
       * field and the body copy sat on top of a specular highlight. A hero object directly behind
       * a centred form is a conflict, not a backdrop.
       *
       * Raising the camera's look-at target pushes the object DOWN in frame, so it reads as a
       * machined plinth the form floats above and is cropped by the bottom edge. Nothing the
       * operator has to read sits over anything bright.
       */
      const view = layerRef.current === 'cover'
        /* THE STILL'S OWN CAMERA (build_forge.py:133 ← docs/3d/e8/entry.ts:257): target (0, 0.34, 0), distance 5.0,
           azimuth 22°, elevation 24°, vertical fov 30°. The /lcxos hero lies OVER the S7 still, so the live frame must
           land on the still's framing — same object, same eye — or the swap reads as a jump. */
        ? { target: [0, 0.34, 0] as const, distance: 5.0, azimuthDeg: 22, elevationDeg: 24, fovDeg: 30 }
        : {
          /* y 2.35 rather than 1.55: at 1.55 the disc's specular highlight sat directly under the
             status footer and made "LOCAL / API DOWN / UTC" hard to read. Nothing an operator has to
             read may sit over anything bright — the object is cropped by the bottom edge instead. */
          target: [0, 2.35, 0] as const, distance: 6.2,
          azimuthDeg: 22, elevationDeg: 14, fovDeg: 34,
        };
      const centre = gl3.boundsCentre([-2, 0, -2], [2, 0.55, 2]);
      const radius = gl3.boundsRadius([-2, 0, -2], [2, 0.55, 2]);
      const near = Math.max(0.01, view.distance / 100);
      const far = Math.max(near + 1, view.distance * 8);

      const render = (t: number) => {
        const dark = isDark();
        const skyStops = skyStopsFor(dark);
        const draws = buildDraws(dark);
        // t 0..1 across the sweep. One arc, easing to a stop rather than halting mid-travel.
        const eased = t < 1 ? 1 - (1 - t) * (1 - t) : 1;
        const lightDir = lightDirAt(eased);
        const lightVP = gl3.lightViewProjection(
          { direction: lightDir, colour: [1, 1, 1], extent: radius * 0.9 }, centre, radius,
        );
        const vp = gl3.viewProjection(view, W / H);
        const eye = gl3.eyeOf(view);

        R.shadowPass(lightVP, draws, S);
        T.bind();
        gl.clear(gl.DEPTH_BUFFER_BIT);
        K.draw({ eye, target: view.target, fovDeg: view.fovDeg, aspect: W / H, sky: skyStops });
        R.depthPrepass(vp, draws);
        if (A) {
          A.compute({ depthTexture: T.depthTexture, near, far, fovDeg: view.fovDeg, aspect: W / H, radius: 0.42, strength: 1.3 });
          /* AO binds its OWN half-res framebuffer, so the rebind stays INSIDE the gate. Outside it, a tier with
             AO off would render the rest of the frame at half resolution. */
          T.bind();
        }
        /*
         * A studio needs a stronger key and a WEAKER ambient than a dark room — on a bright ground
         * the bounce already fills the scene, so ambient adds haze rather than form. That direction
         * is unchanged. The previous sentence here claimed "much more ambient", which the code has
         * never done (0.62 against dark's 1.15) and which `look/theme.ts` contradicts in as many
         * words; it was the wrong half of the argument that let the key run past the tone map.
         *
         * The EXPOSURE is the axis this rig never had. See the header for the solve.
         */
        const rig = dark ? rigs.dark : rigs.light;
        const keyGain = rig.keyGain * intensity;
        R.draw({
          viewProj: vp, eye, lightDir,
          lightColour: [keyGain * KEY_TINT[0], keyGain * KEY_TINT[1], keyGain * KEY_TINT[2]],
          ambientGain: rig.ambientGain, sky: skyStops, lightVP, shadow: S, shadowStrength: rig.shadowStrength, draws,
          ao: A ? A.texture : null, screenSize: [W, H], shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE,
        });
        /* WHAT THE PRESENT READS FROM depends on whether the lens ran. Reading `D.texture` with the DOF pass
           skipped would present whatever that buffer last held, which on the first frame is uninitialised —
           a black or garbage screen behind the sign-in form. */
        let resolved = T.texture;
        if (D) {
          const focus = Math.hypot(eye[0], eye[1] - DISC_Y, eye[2]);
          D.apply({
            scene: T.texture, depthTexture: T.depthTexture, near, far,
            fovDeg: view.fovDeg, aspect: W / H, focusDistance: focus, aperture: 7, maxCoc: 0.009,
          });
          resolved = D.texture;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.disable(gl.DEPTH_TEST);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, resolved);
        stage.blit(P, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
        /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted.
           This file was one of the two that never did it, so the app sweep could reach `/select`, watch this
           surface draw, and still report "0 of 1 canvases" for the tier it drew at.
           It is a DOM write and not a GL call, so it does not disturb the reason above at :104 that this
           surface takes NO frame probe — nothing here is presented that was not going to be presented. The
           write repeats on each of the arc's frames and is idempotent: `tier` is read once at :108 and, by
           that same paragraph, deliberately does not change while this mount lives. */
        canvas.dataset.qualityTier = tier;
      };

      const reduced = typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
        // Cannot read the preference ⇒ assume reduced. Defaulting the other way would invent
        // consent from a reader who never gave it.
        : true;

      const forceOff = () => { disposeRef.current?.(); disposeRef.current = null; canvas.style.display = 'none'; canvas.dataset.forceOff = '1'; };
      const teardown = () => {
        window.removeEventListener('lcx:gl-force-off', forceOff);
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        D?.dispose(); A?.dispose(); K.dispose(); S.dispose(); T.dispose(); R.dispose();
        stage.dispose();
      };
      disposeRef.current = teardown;
      /* THE INSTRUMENT'S OFF SWITCH (P5 → P6). The shell's stage disposes on `lcx:gl-force-off` so a capture pair can be
         read from ONE page load; the Forge did not, so /select's pair was identical and its coverage read 0 in every
         sweep. Same contract here: dispose, hide the canvas, and the still beneath is the OFF frame. */
      window.addEventListener('lcx:gl-force-off', forceOff, { once: true });

      /* The glb is fetched AFTER the first frame is scheduled and never preloaded: initial weight is unchanged and the
         sign-in never waits on it (the plan's "no eager bytes"). `alive` is the effect's own flag, so a swap can never
         land on a torn-down stage; a late upload is disposed rather than kept. */
      void (async () => {
        try {
          const res = await fetch(FORGE_GLB_URL);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const bytes = await res.arrayBuffer();
          if (!alive) return;
          const asset = gl3.parseGlb(bytes);
          if (asset.kind === 'refused') { canvas.dataset.objects = `refused: ${asset.reason}`; return; }
          const swapped = swapForgeMeshes<Mesh>(asset, (g) => gl3.uploadMesh(stage, g));
          if ('kind' in swapped) { canvas.dataset.objects = `refused: ${swapped.reason}`; return; }
          if (!alive) { swapped.disc.dispose(); swapped.ring.dispose(); swapped.plinth.dispose(); return; }
          const old = { ...parts };
          parts.disc = swapped.disc; parts.ring = swapped.ring; parts.plinth = swapped.plinth;
          old.disc.dispose(); old.ring.dispose(); old.plinth.dispose();
          canvas.dataset.objects = `glb ${asset.bytes} bytes · ${asset.meshes.map((m) => m.name).join(',')}`;
          if (rafRef.current == null) render(1);
        } catch (e) {
          if (alive) canvas.dataset.objects = `unavailable: ${e instanceof Error ? e.message : String(e)}`;
        }
      })();

      /*
       * A THEME CHANGE AFTER THE SWEEP HAS FINISHED HAS NO FRAME LOOP TO PICK IT UP. The arc stops
       * by design (§6 rule 2), so without this the canvas holds whichever theme was live when it
       * stopped. One re-render of the final frame, not a replayed sweep — a theme toggle is not an
       * event that warrants an animation.
       */
      const themeWatch = new MutationObserver(() => { if (rafRef.current == null) render(1); });
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      const stopWatch = () => themeWatch.disconnect();

      if (reduced) {
        canvas.dataset.arc = 'done';
        render(1);
        setReady(true);
        disposeRef.current = () => { stopWatch(); teardown(); };
        return;
      }

      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / SWEEP_MS);
        render(t);
        setReady(true);
        // STOPS. No trailing rAF once the arc completes — see the header on rule 2.
        if (t < 1) rafRef.current = requestAnimationFrame(step);
        else rafRef.current = null;
        // The arc says when it has ended (P6): the instrument waits for `done` before its rest window, so the arc's
        // own tail is never read as idle motion. Set after the stop, which reliefFallback reads in that exact form.
        if (t >= 1) canvas.dataset.arc = 'done';
      };
      /* THE ARC IS BOUNDED (SWEEP_MS) AND SAYS SO: the instrument's rest window on /lcxos read 14 rAF/s — the arc's tail,
         not idle motion — because nothing told it when the arc ended. `data-arc` does; it waits for `done`. */
      canvas.dataset.arc = 'running';
      rafRef.current = requestAnimationFrame(step);
      disposeRef.current = () => { stopWatch(); teardown(); };
    }

    return () => {
      alive = false;
      disposeRef.current?.();
      disposeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intensity]);

  return (
    <div ref={hostRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden print:hidden ${layer === 'cover' ? 'z-0' : '-z-10'}`}>
      {/* NO PLATE HERE. `ForgePlate` owns it and paints on the first frame, before this chunk has
          even been fetched — duplicating the gradient in two files is how they drift apart. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: ready ? 'block' : 'none' }}
        data-forge="live"
        data-layer={layer}
      />
    </div>
  );
}
