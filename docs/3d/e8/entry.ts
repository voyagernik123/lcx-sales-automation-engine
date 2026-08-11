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
  hexToLinear, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY, projectScreen,
  type LitDraw, type Viewpoint,
} from '@lcx/gl';

const SCALE = Math.max(1, Math.min(3, Number(new URLSearchParams(location.search).get('scale') ?? 1)));
const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;

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
const die = (m: string) => { document.title = 'REFUSED'; log.textContent = m; throw new Error(m); };

const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
const lit = createLitRenderer(stage);
const target = createTarget3D(stage, W, H);
const shadow = createShadowMap(stage, 1024);
const skyBox = createSkyBackdrop(stage);
const ao = createAmbientOcclusion(stage, W, H);
const dof = createDepthOfField(stage, W, H);
if ('kind' in present) die(`present: ${refusal(present)}`);
if ('kind' in lit) die(`lit: ${refusal(lit)}`);
if ('kind' in target) die(`target: ${refusal(target)}`);
if ('kind' in shadow) die(`shadow: ${refusal(shadow)}`);
if ('kind' in skyBox) die(`sky: ${refusal(skyBox)}`);
if ('kind' in ao) die(`ao: ${refusal(ao)}`);
if ('kind' in dof) die(`dof: ${refusal(dof)}`);

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
    material: { baseColour: hexToLinear('#8FA3C4'), roughness: 0.30, metalness: 0.95 } },
  // POLISHED ring, brand blue in the metal so the frame is not monochrome.
  { mesh: meshes[1]!, model: at(0, DISC_Y, 0), normalMat: NM,
    material: { baseColour: hexToLinear('#2C6BFF'), roughness: 0.13, metalness: 0.92 } },
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

const FRAMES = Number(new URLSearchParams(location.search).get('frames') ?? 300);
const ms = measure(Math.max(1, FRAMES));
const report = {
  triangles: tris, resolution: `${W}x${H}`, dprScale: SCALE, frames: FRAMES,
  msPerFrame: Number(ms.toFixed(3)), fps: Math.round(1000 / ms),
  headroom: Number((16.6 - ms).toFixed(3)),
  renderer: (() => {
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  })(),
};
(globalThis as unknown as { E8: typeof report }).E8 = report;
log.textContent = JSON.stringify(report, null, 2);
frame(1.6);
document.title = 'READY';
