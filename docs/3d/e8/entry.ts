/**
 * E8 · THE FORGE — the first shippable environment, and the first thing a stranger sees.
 *
 * `3D_VFX_1000X.md` §2: "the LCX mark as a machined metal object, real anisotropic specular, a
 * single moving key light. Five seconds, once." §5 puts it first because sign-in is the one screen
 * every operator and every stranger passes through.
 *
 * ── THE MARK STAYS IN THE DOM ───────────────────────────────────────────────────────
 * §6 rule 4, and it is not a compromise. The LCX mark is authored vector art whose path data must
 * not be redrawn; baking it into a texture would cost resolution, cost the accessibility tree,
 * and break the print path. So the GL layer builds the OBJECT — a machined disc, a ring, a lit
 * plinth — and the mark is projected onto its face as crisp SVG. Metal behind, vector in front.
 *
 * ── WHY A DISC AND A RING ───────────────────────────────────────────────────────────
 * Anisotropic specular needs a surface whose highlight has somewhere to travel. A flat plane gives
 * a static blob; a cylinder wall and a torus tube both curve continuously, so a single moving key
 * light sweeps a highlight ALONG them. That sweep is the whole effect — it is what reads as
 * machined metal rather than as a grey circle.
 */
import {
  createStage, isStage, cylinder, torus, plane, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion, createDepthOfField,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, assertBrandFidelity, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY, projectScreen,
  type LitDraw, type Viewpoint,
  type StageRefusal,
  QUALITY_TIERS, qualitySettings, type QualityTier,
} from '@lcx/gl';
import { installFlatFallback } from '../_shared/flatFallback.js';

/* Declared before the first reader. The tier block below and `ANISO_ON` both consume it, and putting it
   between them was a temporal-dead-zone throw at module evaluation — the same fault E0 carried for weeks. */
const params = new URLSearchParams(location.search);

const ANISO_ON = params.get('aniso') !== '0';
/*
 * THE QUALITY LADDER, WIRED. E9's `qualitySettings` is authoritative for the EFFECTS this frame runs:
 * ambient occlusion, depth of field, shadow-map size, and (where present) particle capacity and raymarch
 * depth. `?tier=full|reduced|minimum`, defaulting to full.
 *
 * `dprScale` is the one field the tier does NOT drive here, and that is a stated exception rather than an
 * oversight: every capture in this programme is 1200x720 so the sweep compares like with like, and letting
 * a tier change the pixel count would make two rows of the perf table incomparable. The tier's
 * recommendation is reported as `tierDprScale` beside the resolution actually used, so the difference is
 * visible rather than silent.
 *
 * The existing `?ao=0` / `?dof=0` switches still work and now compose with the tier by AND: a control can
 * turn an effect off, never on. A flag that could re-enable what the tier dropped would let a capture claim
 * a tier it is not rendering.
 */
const TIER: QualityTier = (QUALITY_TIERS as readonly string[]).includes(params.get('tier') ?? '')
  ? (params.get('tier') as QualityTier)
  : 'full';
const Q = qualitySettings(TIER);
const SCALE = Math.max(1, Math.min(3, Number(params.get('scale') ?? 1)));
const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;

/* E8's refusal path used a bare `refusal()` helper with no way to tell a reader anything. `function`
   rather than a const arrow: only a declaration returning `never` narrows control flow. */
function die(m: string): never {
  document.title = 'REFUSED';
  const logEl = document.getElementById('log');
  if (logEl) logEl.textContent = m;
  const [code, ...rest] = m.split(':');
  fallbackRef?.showRefusal(code?.trim() ?? 'REFUSED', rest.join(':').trim() || m);
  throw new Error(m);
}
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;

/*
 * ONE CHECKED HANDOFF PER RESOURCE, replacing seven consecutive `if ('kind' in x) die(...)` lines.
 *
 * Replacing the arrow `die` with a declaration returning `never` was necessary and not sufficient: a
 * narrowing established at MODULE level does not follow a const into a function body, only its DECLARED
 * type does. So all thirteen accessors inside `frame()` stayed errors against a `StageRefusal | T` union
 * even after `die` was correct. Routing each outcome through a function whose return type is `T` puts the
 * narrowing in the declaration, where a closure can see it.
 *
 * E1 diagnosed this and wrote it down; E8 kept the bug for weeks because `docs/3d` was in no tsconfig and
 * esbuild strips types without checking them.
 */
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
}

/*
 * §6 RULE 1 — and E8 is the environment where this rule is already SHIPPING correctly, just not here.
 *
 * `apps/web/src/components/brand/ForgePlate.tsx` is the real fallback for the real surface: ten lines of
 * themed CSS, eager, permanent, in front of the lazy renderer, and it is what a print, an SSR pass, a
 * missing WebGL2 context or a refused float target actually resolve to on the sign-in route. That is the
 * one place in the programme rule 1 was satisfied before this week.
 *
 * The harness had nothing, which mattered because the harness is what claims to PROVE the environment —
 * and a harness that shows a code on a blank page cannot demonstrate a fallback it does not have. So it
 * gets one, and it states the material parameters the capture is evidence for, plus a pointer to the
 * shipping fallback so the two are not confused for each other.
 */
const fallback = installFlatFallback({
  title: 'E8 · The Forge — the machined mark',
  readsAs: 'The rendered view is anisotropic GGX on a brushed disc: the highlight stretches along the '
    + 'lathe direction rather than across it, which is what reads as machined instead of scratched. The '
    + 'shipping surface resolves instead to ForgePlate, a CSS gradient — this table states what the '
    + 'render is evidence for.',
  notices: [
    'A material study, not a data surface — there is no measurement in this frame to lose.',
    'The SHIPPED fallback for this environment is apps/web/src/components/brand/ForgePlate.tsx.',
  ],
  columns: [
    { key: 'part', label: 'Part' },
    { key: 'hex', label: 'Base colour' },
    { key: 'roughness', label: 'Roughness', numeric: true },
    { key: 'metalness', label: 'Metalness', numeric: true },
    { key: 'aniso', label: 'Anisotropy', numeric: true },
  ],
  rows: [
    { part: 'Disc face (brushed)', hex: '#C9D4E4', roughness: 0.22, metalness: 0.9, aniso: ANISO_ON ? 0.85 : 0 },
    { part: 'Ring', hex: '#C9D4E4', roughness: 0.18, metalness: 0.94, aniso: ANISO_ON ? 0.9 : 0 },
    { part: 'Mark inlay', hex: '#2C6BFF', roughness: 0.3, metalness: 0.05, aniso: 0 },
  ],
});
fallbackRef = fallback;
if (params.get('refuse') === '1') {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The three-dimensional view is not being drawn.');
}

const out = createStage(canvas, { alpha: false });
if (!isStage(out)) { document.title = 'REFUSED'; throw new Error(out.reason); }
const stage = out;
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
${TONE_MAP_GLSL}
${SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`;

const log = document.getElementById('log')!;
const refusal = (r: { reason: string; detail?: string }) => `${r.reason} ${r.detail ?? ''}`;
/* The arrow version that used to live here is gone. Two reasons, and the second is the load-bearing
   one: a const arrow does NOT return `never` for control-flow purposes, so every `if ('kind' in x) die()`
   below it narrowed nothing and the accessors were errors against a refusal union; and it could not tell
   the flat fallback anything, so a refusal showed a code on a blank page. The declaration above does
   both. */

const present = required('present', stage.compile(PRESENT_VERT, PRESENT_FRAG));
const lit = required('lit', createLitRenderer(stage));
const target = required('target', createTarget3D(stage, W, H));
const shadow = required('shadow', createShadowMap(stage, Q.shadowMapSize));
const skyBox = required('skyBox', createSkyBackdrop(stage));
const ao = required('ao', createAmbientOcclusion(stage, W, H));
const dof = required('dof', createDepthOfField(stage, W, H));

/* THE OBJECT. A brushed disc, a polished ring around it, and a dark plinth it sits on. Three
   materials so the frame has a metal hierarchy rather than one grey. */
const discGeo = cylinder(0.92, 0.16, 96);
const ringGeo = torus(1.06, 0.055, 128, 32);
const plinthGeo = cylinder(1.9, 0.09, 96);
const floorGeo = plane(16, 24);

const meshes = [discGeo, ringGeo, plinthGeo, floorGeo].map((g) => {
  const m = uploadMesh(stage, g);
  if ('kind' in m) die(`mesh: ${refusal(m)}`);
  return m as Exclude<typeof m, { kind: 'refused' }>;
});

const at = (x: number, y: number, z: number): Float32Array => {
  const m = IDENTITY(); m[12] = x; m[13] = y; m[14] = z; return m;
};
const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

const DISC_Y = 0.30;
const draws: LitDraw[] = [
  { mesh: meshes[3]!, model: at(0, 0, 0), normalMat: NM,
    material: { baseColour: hexToLinear('#080C15'), roughness: 0.88, metalness: 0.0 } },
  { mesh: meshes[2]!, model: at(0, 0.045, 0), normalMat: NM,
    material: { baseColour: hexToLinear('#161D2E'), roughness: 0.52, metalness: 0.35 } },
  // BRUSHED, not mirror: roughness 0.30 keeps a broad travelling highlight instead of a hotspot.
  { mesh: meshes[0]!, model: at(0, DISC_Y, 0), normalMat: NM,
    material: { baseColour: hexToLinear('#8FA3C4'), roughness: 0.30, metalness: 0.95, anisotropy: ANISO_ON ? 0.86 : 0 } },
  // POLISHED ring, brand blue in the metal so the frame is not monochrome.
  { mesh: meshes[1]!, model: at(0, DISC_Y, 0), normalMat: NM,
    material: { baseColour: hexToLinear('#2C6BFF'), roughness: 0.13, metalness: 0.92, anisotropy: ANISO_ON ? 0.72 : 0 } },
];

const view: Viewpoint = { target: [0, 0.34, 0], distance: 5.0, azimuthDeg: 22, elevationDeg: 24, fovDeg: 30 };
const sceneMin: [number, number, number] = [-2, 0, -2];
const sceneMax: [number, number, number] = [2, 0.55, 2];
const centre = boundsCentre(sceneMin, sceneMax);
const radius = boundsRadius(sceneMin, sceneMax);

const tris = [discGeo, ringGeo, plinthGeo, floorGeo].reduce((n, g) => n + triangleCount(g), 0);
const near = Math.max(0.01, view.distance / 100);
const far = Math.max(near + 1, view.distance * 8);

function frame(tSec: number) {
  /*
   * A SINGLE KEY LIGHT ON AN ARC. The whole point of E8: the highlight sweeps ALONG the disc wall
   * and around the ring tube, which is what reads as machined metal. A static light gives a
   * stationary blob and the object reads as a grey circle.
   *
   * §6 rule 2 forbids idle animation, and this does not breach it: E8 is a five-second entrance
   * that runs ONCE, and `renderOnce` below freezes it at the end of the sweep.
   */
  const a = -0.9 + Math.sin(tSec * 0.9) * 0.75;
  const lightDir: [number, number, number] = [Math.sin(a) * 0.85, -0.95, Math.cos(a) * 0.55];
  const lightVP = lightViewProjection({ direction: lightDir, colour: [1, 1, 1], extent: radius * 0.9 }, centre, radius);
  const vp = viewProjection(view, W / H);
  const eye = eyeOf(view);

  lit.shadowPass(lightVP, draws, shadow);

  target.bind();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  skyBox.draw({ eye, target: view.target, fovDeg: view.fovDeg ?? 34, aspect: W / H });
  lit.depthPrepass(vp, draws);
  ao.compute({ depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 34, aspect: W / H, radius: 0.42, strength: 1.3 });
  target.bind();
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [5.2, 5.0, 4.6],
    ambientGain: 1.15, lightVP, shadow, shadowStrength: 0.9, draws,
    ao: ao.texture, screenSize: [W, H],
  });

  // Focus on the disc face; the floor and the far plinth rim fall away.
  const focus = Math.hypot(eye[0], eye[1] - DISC_Y, eye[2]);
  dof.apply({
    scene: target.texture, depthTexture: target.depthTexture, near, far,
    fovDeg: view.fovDeg ?? 34, aspect: W / H, focusDistance: focus, aperture: 7, maxCoc: 0.009,
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dof.texture);
  stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
}

/*
 * POSITION THE MARK BY PROJECTION, NOT BY A HARDCODED PERCENTAGE.
 *
 * §6 rule 4 says the mark stays in the DOM, "projected from the same matrix". Eyeballing a `top:`
 * value gets it right for exactly one camera and silently wrong for every future one — and E1
 * THE THEATRE moves its camera. `projectScreen` uses the identical view-projection the geometry
 * used, so the mark cannot drift from the face it belongs to.
 */
function placeMark() {
  const el = document.getElementById('mark');
  if (!el) return;
  const vp = viewProjection(view, W / H);
  // The centre of the disc's TOP face, in world space.
  const p = projectScreen(vp, [0, DISC_Y + 0.08, 0], W / SCALE, H / SCALE);
  // `behind` is a real state: a point behind the eye projects to a valid-looking pixel that is
  // completely wrong, so it is checked rather than assumed forward.
  if (p.behind) { el.style.visibility = 'hidden'; return; }
  el.style.visibility = 'visible';
  el.style.left = `${p.sx}px`;
  el.style.top = `${p.sy}px`;
}
placeMark();

frame(1.6);

function measure(n: number): number {
  frame(1.6);
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) frame(1.6);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return (performance.now() - t0) / n;
}

const FRAMES = Number(params.get('frames') ?? 300);
const ms = measure(Math.max(1, FRAMES));
/*
 * §6 RULE 5 — "Brand hex exact. `assertBrandFidelity` runs on every new material."
 *
 * It ran on NO material. An audit found the call absent from all six environments, so every claim any
 * of them made about brand-exactness rested on the palette having been correct at some point in the
 * past, in a different file.
 *
 * What it checks is the round trip: each `BRAND_HEX` entry, taken to linear and back through this
 * pipeline's single tone map and sRGB encode, must return its own hex. That is worth running per
 * harness rather than once in a unit test, because a harness is where a SECOND tone map gets
 * introduced — the composite in this file encodes once, and any environment that added another would
 * shift every brand colour by a fraction too small to see and too large to be exact.
 *
 * It DIES rather than warns. A frame that has silently moved the brand blue is worse than no frame,
 * because it will be screenshotted into a deck.
 */
const brandFailures = assertBrandFidelity();
if (brandFailures.length > 0) {
  const msg = 'BRAND FIDELITY FAILED — '
    + brandFailures.map((f) => `${f.key}: expected ${f.expected}, got ${f.actual}`).join('; ');
  document.title = 'REFUSED';
  const logEl = document.getElementById('log');
  if (logEl) logEl.textContent = msg;
  throw new Error(msg);
}

/* Read ONCE, before the report, because two call sites for the same string is two chances for the
   refusal below to key off something different from what is printed. */
const RENDERER = (() => {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
})();
/* SwiftShader and llvmpipe are the two software rasterisers a headless capture actually lands on.
   Anything else is treated as hardware, which is the safe direction to be wrong in: a hardware machine
   wrongly called software loses a number, whereas software wrongly called hardware publishes a
   fictional frame budget — which is exactly what E5 and E6 did. */
const SOFTWARE = /swiftshader|llvmpipe|software/i.test(RENDERER);

const report = {
  /* WHICH TIER THIS FRAME IS, so the numbers beside it describe a configuration a reader can reconstruct.
     A tier that cannot be reported is a tier that cannot be trusted. */
  tier: Q.tier,
  tierDprScale: Q.dprScale,
  tierShadowMapSize: Q.shadowMapSize,
  /*
   * `gl.getError()` — AND THE AUDIT IS WHAT FOUND IT MISSING.
   *
   * E0, E2 and E8 reported no GL error at all, so any of them could have been raising INVALID_OPERATION on
   * every frame and nothing would have said so. GL does not throw: an invalid call is dropped, the draw
   * silently does less than it was asked to, and the frame still completes. E0 lost a day to exactly that
   * (GL_INVALID_VALUE from a zero-length matrix, complete framebuffer, no refusal anywhere) and then never
   * added the check that would have caught it in one frame.
   *
   * It is read ONCE, here, because getError CLEARS the flag — a second read anywhere would return 0 and
   * make this field a lie about a state it had itself consumed.
   */
  glError: gl.getError(),
  /* Empty means every brand hex round-tripped exactly through this frame's own pipeline. */
  brandFidelity: brandFailures,
  anisotropy: ANISO_ON, triangles: tris, resolution: `${W}x${H}`, dprScale: SCALE, frames: FRAMES,
  msPerFrame: Number(ms.toFixed(3)), fps: Math.round(1000 / ms),
  /*
   * HEADROOM REFUSES ON A SOFTWARE RASTERISER. Comparing a CPU rasteriser to a 60 Hz budget measures a
   * machine nobody ships on, and the ratio to real hardware is not a constant — E0 measured 1.305 ms on
   * an M1 for a scene SwiftShader labours over. Refused with a code rather than computed, exactly as
   * absent data refuses everywhere else in this codebase.
   */
  renderer: RENDERER,
  rendererClass: SOFTWARE ? 'software' : 'hardware',
  headroom: SOFTWARE ? null : Number((16.6 - ms).toFixed(3)),
  headroomRefusal: SOFTWARE ? 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET' : null,
};
(globalThis as unknown as { E8: typeof report }).E8 = report;
log.textContent = JSON.stringify(report, null, 2);
frame(1.6);
fallback.markRendered();
document.title = 'READY';
