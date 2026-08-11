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
  createShadowMap, createSkyBackdrop, viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre,
  triangleCount, hexToLinear, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint,
} from '@lcx/gl';

const W = 1280, H = 800;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;

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

const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
const lit = createLitRenderer(stage);
const target = createTarget3D(stage, W, H);
const shadow = createShadowMap(stage, 1024);
const skyBox = createSkyBackdrop(stage);

const fail = (m: string) => { document.title = 'REFUSED'; document.getElementById('log')!.textContent = m; throw new Error(m); };
/* `detail` carries the compiler's own words. Printing only `reason` cost one round trip to
   learn that a function name was wrong — the driver had already said so. */
const refusalText = (r: { reason: string; detail?: string }) => `${r.reason}\n${r.detail ?? ''}`;
if ('kind' in present) fail(`present: ${refusalText(present)}`);
if ('kind' in lit) fail(`lit: ${refusalText(lit)}`);
if ('kind' in target) fail(`target: ${refusalText(target)}`);
if ('kind' in shadow) fail(`shadow: ${refusalText(shadow)}`);
if ('kind' in skyBox) fail(`sky: ${refusalText(skyBox)}`);

const groundGeo = plane(14, 24);
const boxGeo = box(1.4, 1.4, 1.4);
const ballGeo = sphere(0.75, 32, 48);

const meshes = [groundGeo, boxGeo, ballGeo].map((g) => {
  const m = uploadMesh(stage, g);
  if ('kind' in m) fail(`mesh: ${m.reason}`);
  return m as Exclude<typeof m, { kind: 'refused' }>;
});

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
    material: { baseColour: hexToLinear('#C9D4E4'), roughness: DIAG ? 0.045 : 0.18, metalness: 0.92 } },
];

const light = { direction: [-0.45, -1, -0.35] as const, colour: [3.4, 3.3, 3.05] as const };
const sceneMin: [number, number, number] = [-7, 0, -7];
const sceneMax: [number, number, number] = [7, 2.2, 7];
const centre = boundsCentre(sceneMin, sceneMax);
const radius = boundsRadius(sceneMin, sceneMax);
const lightVP = lightViewProjection({ ...light, extent: radius * 0.8 }, centre, radius);

const view: Viewpoint = { target: [0, 0.6, 0], distance: 7.2, azimuthDeg: 34, elevationDeg: 22, fovDeg: 36 };

const DIAG = new URLSearchParams(location.search).get('diag') === '1';
/* RED above, GREEN below, BLUE at the horizon. If a mirror sphere shows red where it faces the
   sky and green where it faces the floor, the sample direction is right. A grey gradient cannot
   distinguish that from its own inverse, which is why the first look was inconclusive. */
const DIAG_SKY = { zenith: [1.6, 0.05, 0.05] as const, horizon: [0.05, 0.08, 1.6] as const, ground: [0.05, 1.2, 0.05] as const };
const SKY = DIAG ? DIAG_SKY : undefined;
const REPEAT = Math.max(1, Number(new URLSearchParams(location.search).get('repeat') ?? 1));
function frame() {
  const vp = viewProjection(view, W / H);
  const eye = eyeOf(view);

  lit.shadowPass(lightVP, draws, shadow);

  target.bind();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  /* THE BACKDROP REPLACES THE FLAT CLEAR. A clear colour is a void; this is an environment, and
     it is the same function the material reflects — so a metal and its surroundings agree. */
  skyBox.draw({ eye, target: view.target, fovDeg: view.fovDeg ?? 36, aspect: W / H, sky: SKY });
  for (let r = 0; r < REPEAT; r++) {
    lit.draw({
      viewProj: vp, eye, lightDir: light.direction, lightColour: light.colour,
      ambientGain: 1, sky: SKY, lightVP, shadow, shadowStrength: 0.92, draws,
    });
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
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
const FRAMES = Number(new URLSearchParams(location.search).get('frames') ?? 600);
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
const report = {
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
  frames: FRAMES,
  repeat: REPEAT,
  msPerFrame: Number(msPerFrame.toFixed(3)),
  fps: Math.round(1000 / msPerFrame),
  budget60: 16.6,
  headroom: Number((16.6 - msPerFrame).toFixed(3)),
  renderer: (() => {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  })(),
};
(globalThis as unknown as { E0: typeof report }).E0 = report;
document.getElementById('log')!.textContent = JSON.stringify(report, null, 2);
frame();
document.title = 'READY';
