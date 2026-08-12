/**
 * E0 · THE SPIKE. One lit, shadowed scene, and a frame-time measurement on real hardware.
 *
 * `3D_VFX_1000X.md` §5 gives E0 one job: replace the estimated frame budget with a measured
 * one, before any product code exists. §3.2 estimated ~10.9 ms of a 16.6 ms budget. If that is
 * 2x out, the whole plan re-scopes here — which is exactly what P0 did to three.js.
 *
 * It also exercises every layer built so far end to end: mesh, camera, depth target, shadow map,
 * GGX material. A framebuffer that is incomplete or a matrix that is NaN both render a black
 * frame with NO error, so the capture is the only proof that any of it works.
 */
import {
  createStage, isStage, box, plane, sphere, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion, createDepthOfField, viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre,
  triangleCount, hexToLinear, assertBrandFidelity, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint,
  type StageRefusal,
  QUALITY_TIERS, qualitySettings, shadowMapSizeFor, type QualityTier,
} from '@lcx/gl';
import { installFlatFallback } from '../_shared/flatFallback.js';

/* RESOLUTION IS A PARAMETER because §3.2 reserved a decision on it: 60 fps at 1x or 30 at 2x.
   That is answerable by measurement rather than by preference, and only at the real resolution —
   every pass here is fill-bound, so a 1x number says nothing about 2x. */
const params = new URLSearchParams(location.search);
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
const W = 1280 * SCALE, H = 800 * SCALE;
const DIAG_FLAG = params.get('diag') === '1';
const REFUSE_FLAG = params.get('refuse') === '1';
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;

/* E0's own refusal path was an inline ladder with no shared helper. One is needed now, because the
   fallback has to be told. `function` rather than a const arrow: only a declaration returning `never`
   participates in the compiler's control-flow narrowing. */
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
 * ONE CHECKED HANDOFF PER RESOURCE, replacing seven consecutive `if ('kind' in x) fail(...)` lines.
 *
 * Not tidiness. Those checks establish a control-flow narrowing at MODULE level, and a narrowing does not
 * follow a const into a function body — only its DECLARED type does. That is why all fourteen accessors
 * inside `frame()` were errors against a `StageRefusal | T` union while the module-level code looked
 * clean. Routing each outcome through a function whose return type is `T` puts the narrowing in the
 * declaration, where a closure can see it. E1 worked this out and wrote it down; E0 and E8 never got the
 * fix because neither was ever type-checked.
 */
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
}

/*
 * §6 RULE 1, FOR A STUDY RATHER THAN A DATA SURFACE.
 *
 * E0 carries no dataset — it is the spike that replaced an estimated frame budget with a measured one.
 * That is a reason to treat it differently and not a reason to skip it: its INFORMATION is the material
 * parameters it renders and the cost of rendering them, and both survive perfectly well as a table.
 *
 * So the fallback states what each object in the frame is set to. A reader who cannot see the render
 * still learns which materials were tested and at what roughness and metalness, which is what the
 * capture is evidence FOR. Frame time is not listed here because it is measured after this point and
 * printed in the report — putting a stale number in the fallback would be the same defect the audit
 * found in E1's panels.
 */
const fallback = installFlatFallback({
  title: 'E0 · The Spike — material study',
  readsAs: 'The rendered view is the evidence: GGX with a Smith visibility term, a shadow map, ambient '
    + 'occlusion and a gathered depth of field, at a measured cost. The table below states what each '
    + 'surface in that frame is set to, which is what the capture is evidence for.',
  notices: ['A study, not a data surface — there is no measurement in this frame to lose.'],
  columns: [
    { key: 'object', label: 'Object' },
    { key: 'hex', label: 'Base colour' },
    { key: 'roughness', label: 'Roughness', numeric: true },
    { key: 'metalness', label: 'Metalness', numeric: true },
  ],
  rows: [
    { object: 'Deck plate', hex: '#0E1628', roughness: 0.82, metalness: 0.0 },
    { object: 'Brand-blue dielectric sphere', hex: '#2C6BFF', roughness: 0.34, metalness: 0.05 },
    /* Read from the URL directly rather than from `DIAG_FLAG`, which is declared 130 lines below this point.
       A forward reference to a const is a temporal-dead-zone throw at module evaluation, and a page that
       throws there never sets its title — so the harness reports a 30-second timeout instead of the
       actual fault. That is the same defect this file's own header comment warns about. */
    { object: 'Metal sphere', hex: '#C9D4E4', roughness: DIAG_FLAG ? 0.045 : 0.18, metalness: 0.92 },
  ],
});
fallbackRef = fallback;
if (REFUSE_FLAG) {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The three-dimensional view is not being drawn.');
}

const outcome = createStage(canvas, { alpha: false });
if (!isStage(outcome)) {
  document.title = 'REFUSED';
  document.getElementById('log')!.textContent = `refused: ${outcome.code} — ${outcome.reason}`;
  throw new Error(outcome.reason);
}
const stage = outcome;
const gl = stage.gl;

/* Present the HDR target through the pipeline's OWN tone curve. Writing a second tone map here
   would fork the one thing in this renderer whose output is verified brand-exact. */
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
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  frag = vec4(lcxEncode(lcxToneMap(c)), 1.0);
}`;

const present = required('present', stage.compile(PRESENT_VERT, PRESENT_FRAG));
const lit = required('lit', createLitRenderer(stage));
const target = required('target', createTarget3D(stage, W, H));
const shadow = required('shadow', createShadowMap(stage, shadowMapSizeFor(TIER, 1024)));
const skyBox = required('skyBox', createSkyBackdrop(stage));
const ao = required('ao', createAmbientOcclusion(stage, W, H));
const dof = required('dof', createDepthOfField(stage, W, H));

/*
 * `fail` AND `refusalText` ARE GONE, and `fail` is the more interesting loss.
 *
 * It was a const arrow, so it did NOT return `never` for control-flow purposes: every
 * `if ('kind' in x) fail(...)` above narrowed nothing, which is why fourteen accessors in `frame()` were
 * errors. It also could not tell the flat fallback anything, so a refusal showed a code on a blank page.
 * `die` and `required` above do both, and `required` prints `code`, `reason` and `detail` itself — so the
 * driver's own words still reach the reader through one formatter instead of two.
 */

const groundGeo = plane(14, 24);
const boxGeo = box(1.4, 1.4, 1.4);
const ballGeo = sphere(0.75, 32, 48);

/* Through `required` too, which removes the CAST. `as Exclude<typeof m, {kind:'refused'}>` asserted the
   very thing the line above had just established — and an assertion is not a narrowing: it would have gone
   on compiling if that check were deleted. */
const meshes = [groundGeo, boxGeo, ballGeo].map((g, i) => required(`mesh ${i}`, uploadMesh(stage, g)));

/*
 * `IDENTITY` IS A FACTORY, NOT A CONSTANT — `export const IDENTITY = (): Mat4 => ...`.
 *
 * `new Float32Array(IDENTITY)` therefore passes a FUNCTION to the constructor, which yields a
 * ZERO-LENGTH array rather than throwing. `uniformMatrix4fv` with 0 floats raises
 * GL_INVALID_VALUE, every model matrix was empty, every vertex collapsed to the origin, and the
 * frame came out as nothing but the clear colour — with every program compiled, no refusal, and
 * a COMPLETE framebuffer. The unit tests could not catch it: they prove the MATHS is finite and
 * this was a GL argument three layers below them.
 */
const translate = (x: number, y: number, z: number): Float32Array => {
  const m = IDENTITY();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};
/* Translation only, so the inverse-transpose of the 3x3 IS the identity. Stated rather than
   assumed: the moment a non-uniform scale appears this must be computed properly or the
   lighting rotates as the object squashes. */
const NORMAL_MAT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

const draws: LitDraw[] = [
  { mesh: meshes[0]!, model: translate(0, 0, 0), normalMat: NORMAL_MAT,
    material: { baseColour: hexToLinear('#0E1628'), roughness: 0.82, metalness: 0.0 } },
  { mesh: meshes[1]!, model: translate(-1.15, 0.7, 0), normalMat: NORMAL_MAT,
    material: { baseColour: hexToLinear('#2C6BFF'), roughness: 0.34, metalness: 0.05 } },
  { mesh: meshes[2]!, model: translate(1.15, 0.75, 0.3), normalMat: NORMAL_MAT,
    material: { baseColour: hexToLinear('#C9D4E4'), roughness: DIAG_FLAG ? 0.045 : 0.18, metalness: 0.92 } },
];

const light = { direction: [-0.45, -1, -0.35] as const, colour: [3.4, 3.3, 3.05] as const };
const sceneMin: [number, number, number] = [-7, 0, -7];
const sceneMax: [number, number, number] = [7, 2.2, 7];
const centre = boundsCentre(sceneMin, sceneMax);
const radius = boundsRadius(sceneMin, sceneMax);
const lightVP = lightViewProjection({ ...light, extent: radius * 0.8 }, centre, radius);

const view: Viewpoint = { target: [0, 0.6, 0], distance: 7.2, azimuthDeg: 34, elevationDeg: 22, fovDeg: 36 };

/*
 * `DIAG_FLAG` IS GONE — `DIAG_FLAG` at the top of the file is now the only name for it.
 *
 * The alias sat here at line 184 while the draw list read it at line 170: a temporal-dead-zone throw at
 * module evaluation. E1's header comment DOCUMENTS this bug in this file — "reads its DIAG_FLAG flag from
 * inside the draw list twelve lines above the const that declares it" — and it was never fixed, because
 * `docs/3d` was in no tsconfig and esbuild strips types without checking them. Minification then hid it:
 * esbuild inlines a const initialised from another const, so the bundle ran and the source was wrong.
 *
 * That is the entire argument for `type-check:3d` globbing every harness rather than pointing at p1.
 */
/* AO off is a CONTROL, not a fallback: the capture has to show the difference it makes rather
   than my asserting that it makes one. */
const AO_ON = params.get('ao') !== '0' && Q.ao;
const DOF_ON = params.get('dof') !== '0' && Q.dof;
/* RED above, GREEN below, BLUE at the horizon. If a mirror sphere shows red where it faces the
   sky and green where it faces the floor, the sample direction is right. A grey gradient cannot
   distinguish that from its own inverse, which is why the first look was inconclusive. */
const DIAG_SKY = { zenith: [1.6, 0.05, 0.05] as const, horizon: [0.05, 0.08, 1.6] as const, ground: [0.05, 1.2, 0.05] as const };
const SKY = DIAG_FLAG ? DIAG_SKY : undefined;
const REPEAT = Math.max(1, Number(params.get('repeat') ?? 1));
function frame() {
  const vp = viewProjection(view, W / H);
  const eye = eyeOf(view);

  lit.shadowPass(lightVP, draws, shadow);

  target.bind();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  /* THE BACKDROP REPLACES THE FLAT CLEAR. A clear colour is a void; this is an environment, and
     it is the same function the material reflects — so a metal and its surroundings agree. */
  skyBox.draw({ eye, target: view.target, fovDeg: view.fovDeg ?? 36, aspect: W / H, sky: SKY });

  /* DEPTH PREPASS -> AO -> LIT. The order is forced by the data: AO reads depth, and the lit
     pass reads AO. The prepass is not a tax — it gives the lit pass early-z as well. */
  const near = Math.max(0.01, view.distance / 100);
  const far = Math.max(near + 1, view.distance * 8);
  lit.depthPrepass(vp, draws);
  if (AO_ON) {
    ao.compute({
      depthTexture: target.depthTexture, near, far,
      fovDeg: view.fovDeg ?? 36, aspect: W / H, radius: 0.6, strength: 1.25,
    });
    // AO bound its own half-res framebuffer; the scene target has to be restored.
    target.bind();
  }
  for (let r = 0; r < REPEAT; r++) {
    lit.draw({
      viewProj: vp, eye, lightDir: light.direction, lightColour: light.colour,
      ambientGain: 1, sky: SKY, lightVP, shadow, shadowStrength: 0.92, draws,
      ao: AO_ON ? ao.texture : null, screenSize: [W, H],
    });
  }

  /* FOCUS ON THE SUBJECT, not on a constant: the sphere is what the eye should land on, so the
     focus distance is the distance to IT rather than to the camera target. */
  let resolved = target.texture;
  if (DOF_ON) {
    const focus = Math.hypot(eye[0] - 1.15, eye[1] - 0.75, eye[2] - 0.3);
    dof.apply({
      scene: target.texture, depthTexture: target.depthTexture, near, far,
      fovDeg: view.fovDeg ?? 36, aspect: W / H, focusDistance: focus,
      aperture: 9, maxCoc: 0.010,
    });
    resolved = dof.texture;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, resolved);
  stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
}

frame();

/* THE MEASUREMENT. A batch sweep, not a per-frame timer: `performance.now()` is clamped to
   ~100 microseconds and `gl.finish()` returns on flush rather than on completion, so a
   single-frame number is noise. 600 frames back to back, then divide — and a `readPixels`
   at the end to force the GPU to actually finish the work before the clock is read. */
function measure(frames: number): number {
  frame();
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) frame();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return (performance.now() - t0) / frames;
}

/* FRAME COUNT IS A PARAMETER, because the two things this page is for need different values.
   The capture harness runs under swiftshader (software rasterisation) where 600 frames of a
   shadowed scene takes minutes — so it asks for a handful, just enough to prove the frame is
   drawn. The real measurement runs on the actual GPU and asks for the full sweep. A number
   hardcoded for one of those is useless for the other. */
const FRAMES = Number(params.get('frames') ?? 600);
const targetProbe = (() => {
  while (gl.getError() !== gl.NO_ERROR) { /* drain errors from setup so the pass is attributable */ }
  const bad: string[] = [];
  const probeStep = (label: string) => {
    const e = gl.getError();
    if (e !== gl.NO_ERROR) bad.push(`${label}=0x${e.toString(16)}`);
  };
  lit.shadowPass(lightVP, draws, shadow, probeStep);
  target.bind(); probeStep('target.bind');
  gl.clear(gl.DEPTH_BUFFER_BIT); probeStep('clear');
  skyBox.draw({ eye: eyeOf(view), target: view.target, fovDeg: view.fovDeg ?? 36, aspect: W / H, sky: SKY }); probeStep('sky');
  lit.draw({
    viewProj: viewProjection(view, W / H), eye: eyeOf(view), lightDir: light.direction,
    lightColour: light.colour, ambientGain: 1, sky: SKY, lightVP, shadow,
    shadowStrength: 0.92, draws, onStep: probeStep,
  });
  const afterDraw = gl.getError();
  /* RGBA/UNSIGNED_BYTE, not FLOAT: readPixels from an RGBA16F attachment only guarantees the
     implementation's own colour-read type, and asking for FLOAT is itself an error on some
     drivers — which would mask the error being hunted. */
  const buf = new Uint8Array(4);
  gl.readPixels(W >> 1, H >> 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const afterRead = gl.getError();
  return { centre: Array.from(buf), afterDraw, afterRead, bad };
})();
const tris = triangleCount(groundGeo) + triangleCount(boxGeo) + triangleCount(ballGeo);
const msPerFrame = measure(Math.max(1, FRAMES));
const probe = (() => {
  const vp = viewProjection(view, W / H);
  // Where does the top of the box land in NDC? Off-screen or behind the eye both look identical
  // to "not drawn", and they have completely different causes.
  const px = -1.15, py = 1.4, pz = 0;
  const cx = vp[0]! * px + vp[4]! * py + vp[8]! * pz + vp[12]!;
  const cy = vp[1]! * px + vp[5]! * py + vp[9]! * pz + vp[13]!;
  const cw = vp[3]! * px + vp[7]! * py + vp[11]! * pz + vp[15]!;
  return { ndc: [Number((cx / cw).toFixed(3)), Number((cy / cw).toFixed(3))], w: Number(cw.toFixed(3)) };
})();
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
  /* Reported so E9's audit can state what the tier actually drives here, rather than
     inferring it from which fields happen to exist. */
  ao: AO_ON,
  dof: DOF_ON,
  /* WHICH TIER THIS FRAME IS, so the numbers beside it describe a configuration a reader can reconstruct.
     A tier that cannot be reported is a tier that cannot be trusted. */
  tier: Q.tier,
  tierDprScale: Q.dprScale,
  /* The tier SCALES this environment's own baseline (1024) rather than replacing it — the
     ladder must not change what the frame looks like at its highest tier. */
  tierShadowMapSize: shadowMapSizeFor(TIER, 1024),
  shadowBaseline: 1024,
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
  hdr: stage.hdr,
  eye: eyeOf(view).map((v) => Number(v.toFixed(2))),
  boxTopNdc: probe.ndc,
  boxTopW: probe.w,
  targetCentre: targetProbe.centre,
  failingCalls: targetProbe.bad,
  glAfterDraw: targetProbe.afterDraw,
  glAfterRead: targetProbe.afterRead,
  triangles: tris,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  aoEnabled: AO_ON,
  dofEnabled: DOF_ON,
  frames: FRAMES,
  repeat: REPEAT,
  msPerFrame: Number(msPerFrame.toFixed(3)),
  fps: Math.round(1000 / msPerFrame),
  /*
   * HEADROOM REFUSES ON A SOFTWARE RASTERISER. Comparing a CPU rasteriser to a 60 Hz budget measures a
   * machine nobody ships on, and the ratio to real hardware is not a constant — E0 measured 1.305 ms on
   * an M1 for a scene SwiftShader labours over. Refused with a code rather than computed, exactly as
   * absent data refuses everywhere else in this codebase.
   */
  renderer: RENDERER,
  rendererClass: SOFTWARE ? 'software' : 'hardware',
  headroom: SOFTWARE ? null : Number((16.6 - msPerFrame).toFixed(3)),
  headroomRefusal: SOFTWARE ? 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET' : null,
};
(globalThis as unknown as { E0: typeof report }).E0 = report;
document.getElementById('log')!.textContent = JSON.stringify(report, null, 2);
frame();
/* AFTER the frame exists. The failure mode of this ordering is a visible table under a working canvas —
   loud and self-announcing, which is the right direction for a fallback to fail in. */
fallback.markRendered();
document.title = 'READY';
