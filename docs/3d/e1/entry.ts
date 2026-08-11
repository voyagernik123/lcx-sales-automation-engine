/**
 * E1 · THE THEATRE — the command deck as a room you are standing in.
 *
 * `3D_VFX_1000X.md` §2: "panels are lit planes floating in depth on a dark deck plate ... a
 * shallow-DOF camera that racks focus to the panel you address." §5 puts it second, after E8,
 * because it is the other screen a stranger sees.
 *
 * ── THE FOCUS RACK IS THE WHOLE POINT ───────────────────────────────────────────────
 * Five panels at five different depths is a composition. Five panels of which ONE is sharp is a
 * statement about where to look, and it is the one thing a flat grid of cards cannot make. So the
 * geometry here exists to give depth of field something to act on: the depths are deliberately
 * unequal, and `dof=0` renders the identical scene with the rack off as the control.
 *
 * ── WHY BOXES AND NOT PLANES ────────────────────────────────────────────────────────
 * §2 says planes; boxes are the better reading of it. A zero-thickness plane has no side edge to
 * catch the key light, casts a shadow with no width, and disappears entirely when the camera
 * crosses its plane because the far side is culled. 6 cm of thickness gives every panel a lit
 * edge and a shadow that is a slab rather than a line — which is what makes the arrangement read
 * as objects standing in a room instead of as decals hanging in fog.
 *
 * ── WHY EACH PANEL IS ITS OWN GEOMETRY ──────────────────────────────────────────────
 * Five panel sizes could be one box scaled per draw. That would put a NON-UNIFORM scale in every
 * model matrix, and the normal matrix would then stop being a rotation — normals would tilt off
 * the surface and the lighting would rotate as the panel stretched. Five boxes cost 60 triangles
 * total and keep every model matrix a rotation plus a translation, which is a property the normal
 * matrix below depends on.
 */
import {
  createStage, isStage, box, plane, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion, createDepthOfField,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint,
} from '@lcx/gl';

/* EVERY PARAMETER IS READ FIRST, before any of them is used. `docs/3d/e0/entry.ts` reads its
   `DIAG` flag from inside the draw list twelve lines above the `const` that declares it, which is
   a temporal-dead-zone throw at module evaluation — and a page that throws there never sets its
   title, so the harness reports a timeout rather than the actual fault. */
const params = new URLSearchParams(location.search);
/* THE RACK OFF IS A CONTROL, not a fallback. The claim being made is that depth of field
   separates the addressed panel from the room, and that claim needs the same frame without it. */
const DOF_ON = params.get('dof') !== '0';
const AO_ON = params.get('ao') !== '0';
const SCALE = Math.max(1, Math.min(3, Number(params.get('scale') ?? 1)));
const FRAMES = Number(params.get('frames') ?? 300);

const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;

const log = document.getElementById('log')!;
const die = (m: string) => { document.title = 'REFUSED'; log.textContent = m; throw new Error(m); };
/* `detail` carries the driver's own words. Printing only `reason` costs a round trip to learn
   something the compiler had already said. */
const refusal = (r: { reason: string; detail?: string }) => `${r.reason} ${r.detail ?? ''}`;

const out = createStage(canvas, { alpha: false });
if (!isStage(out)) die(`stage: ${out.code} — ${out.reason}`);
const stage = out as Extract<typeof out, { gl: WebGL2RenderingContext }>;
const gl = stage.gl;

/* Present through the pipeline's OWN tone curve. A second tone map here would fork the one thing
   in this renderer whose output is verified brand-exact. */
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

/*
 * THE CAMERA IS DECLARED BEFORE THE PANELS, because the panels are aimed at it.
 *
 * Eye height 1.68 m and 8° of downward tilt: a person standing on the deck, not a drone above it.
 * The elevation is what costs the most if it drifts — past about 15° the deck plate becomes the
 * subject and the panels read as objects on a table.
 */
const view: Viewpoint = { target: [0, 0.62, 0.1], distance: 7.6, azimuthDeg: 1.5, elevationDeg: 8, fovDeg: 38 };
const eye = eyeOf(view);
const FOV = view.fovDeg ?? 38;
const near = Math.max(0.01, view.distance / 100);
const far = Math.max(near + 1, view.distance * 8);

/*
 * THE ARC. Five panels, five DEPTHS, five sizes.
 *
 * The depths are the load-bearing column: 5.6 m to 9.0 m from the eye, every one distinct, so the
 * circle of confusion at each panel is a different number rather than two panels sharing a blur.
 * The widths and heights are deliberately irregular for a duller reason — five equal panels on an
 * arc still read as a grid that has been bent, and a grid is what this environment replaces.
 *
 * The two NEAREST carry brand blue. Nearest is also what the lens is focused on, so the colour
 * and the focus agree about which panels are being addressed; putting the blue on a far panel
 * would have the frame arguing with itself.
 */
const THICKNESS = 0.06;
const PANELS = [
  { id: 'P0', x: -1.06, z: 2.30, w: 1.46, h: 1.34, hex: '#2C6BFF', roughness: 0.42 },
  { id: 'P1', x: 1.64, z: 1.62, w: 1.22, h: 1.58, hex: '#2C6BFF', roughness: 0.44 },
  { id: 'P2', x: -2.36, z: 0.66, w: 1.62, h: 1.18, hex: '#16203A', roughness: 0.50 },
  { id: 'P3', x: 2.74, z: -0.28, w: 1.34, h: 1.46, hex: '#16203A', roughness: 0.52 },
  { id: 'P4', x: -0.10, z: -1.34, w: 1.86, h: 1.66, hex: '#16203A', roughness: 0.48 },
] as const;

/*
 * PANELS TURN TOWARD THE CAMERA, BUT NOT ALL THE WAY.
 *
 * At a full 1.0 every panel presents its face square-on, the 6 cm edges vanish, and the arc
 * flattens into five parallel rectangles — the grid again. At 0.72 each panel is still legible
 * face-on while the outer ones show a sliver of side, which is what states that they are turned
 * and therefore that the arrangement curves.
 */
const FACE_FRACTION = 0.72;
const yawOf = (x: number, z: number) => Math.atan2(eye[0] - x, eye[2] - z) * FACE_FRACTION;

const deckGeo = plane(30, 24);
const panelGeo = PANELS.map((p) => box(p.w, p.h, THICKNESS));

const upload = (g: Parameters<typeof uploadMesh>[1]) => {
  const m = uploadMesh(stage, g);
  if ('kind' in m) die(`mesh: ${refusal(m)}`);
  return m as Exclude<typeof m, { kind: 'refused' }>;
};
const deckMesh = upload(deckGeo);
const panelMesh = panelGeo.map(upload);

/*
 * `IDENTITY` IS A FACTORY, NOT A CONSTANT — `export const IDENTITY = (): Mat4 => ...`. Passing it
 * as a value yields a ZERO-LENGTH Float32Array, `uniformMatrix4fv` raises GL_INVALID_VALUE, and
 * every vertex collapses to the origin with a complete framebuffer and no refusal anywhere. It
 * cost E0 a day.
 */
const modelOf = (x: number, y: number, z: number, yaw: number): Float32Array => {
  const m = IDENTITY();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Column-major, matching the layout `uniformMatrix4fv` is given with transpose=false: column 2
  // is where the box's +Z face normal ends up, so a yaw of `a` aims that face at (sin a, 0, cos a).
  m[0] = c; m[2] = -s;
  m[8] = s; m[10] = c;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

/*
 * THE NORMAL MATRIX, LIFTED OUT OF THE MODEL MATRIX RATHER THAN RECONSTRUCTED.
 *
 * E0 and E8 only translate, so both pass the identity and the storage convention never comes up.
 * E1 rotates, and here it does: `LitDraw.normalMat` is documented as row-major but is uploaded
 * with transpose=false, which means the driver reads it as column-major, and a rotation is not
 * symmetric — feed it the wrong way round and every panel is lit as though yawed the opposite
 * way while the geometry stays put.
 *
 * Copying the model's own 3×3 in the identical storage order sidesteps the question entirely: the
 * shader gets exactly what `mat3(uModel)` would give it, and because these matrices are pure
 * rotations — orthogonal, so the inverse-transpose IS the rotation — that is the correct normal
 * matrix by construction, not by coincidence. It stops being correct the moment a scale appears,
 * which is why the panels are five geometries rather than one scaled five ways.
 */
const normalOf = (m: Float32Array): Float32Array => new Float32Array([
  m[0]!, m[1]!, m[2]!,
  m[4]!, m[5]!, m[6]!,
  m[8]!, m[9]!, m[10]!,
]);

const placed = PANELS.map((p, i) => {
  const yaw = yawOf(p.x, p.z);
  // Bases ON the deck. Floating panels would need no contact shadow and no AO in the join, and
  // those two cues are most of what makes a rendered object sit on a surface rather than hover.
  const model = modelOf(p.x, p.h / 2, p.z, yaw);
  const faceNormal: [number, number, number] = [Math.sin(yaw), 0, Math.cos(yaw)];
  const faceCentre: [number, number, number] = [
    p.x + faceNormal[0] * (THICKNESS / 2), p.h / 2, p.z + faceNormal[2] * (THICKNESS / 2),
  ];
  return {
    ...p, yaw, model, faceCentre,
    mesh: panelMesh[i]!,
    normalMat: normalOf(model),
    eyeDistance: Math.hypot(eye[0] - faceCentre[0], eye[1] - faceCentre[1], eye[2] - faceCentre[2]),
  };
});

/* Nearest by MEASUREMENT, not by declaration order. The focus target has to follow the geometry,
   or a later nudge to one z silently racks focus onto the wrong panel. */
const subject = placed.reduce((a, b) => (b.eyeDistance < a.eyeDistance ? b : a));
const focusDistance = subject.eyeDistance;

const DECK_NORMAL = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const draws: LitDraw[] = [
  /* The deck plate is nearly black and quite rough. It exists to receive shadows and to give the
     panels a floor to stand on; a lighter or glossier deck competes with them for attention. */
  { mesh: deckMesh, model: modelOf(0, 0, 0, 0), normalMat: DECK_NORMAL,
    material: { baseColour: hexToLinear('#070B14'), roughness: 0.86, metalness: 0.0 } },
  ...placed.map((p): LitDraw => ({
    mesh: p.mesh, model: p.model, normalMat: p.normalMat,
    /*
     * NEAR-DIELECTRIC, and that is a brand constraint before it is a taste one. A metal has no
     * diffuse lobe: its colour arrives only through the specular F0, so pushing metalness up
     * turns #2C6BFF into a blue-tinted mirror of the sky rather than the brand hex. §6 rule 5
     * says the hex stays exact, so the panels stay dielectric with a faint sheen — glass-fronted
     * displays, which is what they are.
     */
    material: { baseColour: hexToLinear(p.hex), roughness: p.roughness, metalness: 0.06 },
  })),
];

/*
 * ONE KEY LIGHT, ABOVE AND TO THE LEFT — 38° above the horizon, not 60°.
 *
 * A steeper key lands almost entirely on the panels' 6 cm top edges and leaves the faces to the
 * ambient sky, so the frame goes flat exactly where the information lives. At 38° every face
 * takes direct light (N·L runs 0.39 to 0.66 across the five) and the shadows are long enough to
 * cross the deck and fall on the panels behind, which is the strongest depth cue in the frame
 * after the focus rack itself.
 */
const lightDir: [number, number, number] = [0.55, -0.62, -0.56];
/* Bounds sized to the shadows, NOT to the geometry. The panels occupy x ∈ [-3.2, 3.4]; their cast
   shadows reach roughly 1.5 m further in +x and -z, and a frustum fitted to the panels alone
   would clip every shadow tail mid-deck. */
const sceneMin: [number, number, number] = [-4.6, 0, -4.4];
const sceneMax: [number, number, number] = [5.4, 1.9, 3.2];
const centre = boundsCentre(sceneMin, sceneMax);
const radius = boundsRadius(sceneMin, sceneMax);
const lightVP = lightViewProjection({ direction: lightDir, colour: [1, 1, 1], extent: 6.0 }, centre, radius);

const tris = [deckGeo, ...panelGeo].reduce((n, g) => n + triangleCount(g), 0);

function frame() {
  const vp = viewProjection(view, W / H);

  lit.shadowPass(lightVP, draws, shadow);

  target.bind();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  /* The backdrop replaces a flat clear, and it is the same function the materials reflect — so a
     panel's sheen and the room behind it agree about what the room looks like. */
  skyBox.draw({ eye, target: view.target, fovDeg: FOV, aspect: W / H });

  /* PREPASS → AO → LIT. Forced by the data: AO reads depth and the lit pass reads AO. */
  lit.depthPrepass(vp, draws);
  if (AO_ON) {
    ao.compute({
      depthTexture: target.depthTexture, near, far, fovDeg: FOV, aspect: W / H,
      // 0.5 m: about a third of a panel height. Larger and the occlusion stops describing the
      // join between panel and deck and starts dimming whole panels that face each other.
      radius: 0.5, strength: 1.3,
    });
    target.bind(); // AO bound its own half-res framebuffer.
  }
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [3.5, 3.45, 3.3],
    ambientGain: 1.05, lightVP, shadow, shadowStrength: 0.92, draws,
    ao: AO_ON ? ao.texture : null, screenSize: [W, H],
  });

  let resolved = target.texture;
  if (DOF_ON) {
    /*
     * APERTURE 0.22, WHERE E8 USES 7, AND THAT IS NOT AN INCONSISTENCY.
     *
     * The circle of confusion is a difference of RECIPROCAL distances. E8's subject sits about a
     * metre from its lens, where 1/z changes fast; this room spans 5.6 m to 9.0 m, where the
     * whole depth range is worth 0.068 reciprocal-metres. E8's aperture here would pin every
     * panel but the nearest at maxCoc and the rack would read as "everything except one thing is
     * mush". 0.22 spends the range instead: the second panel softens by about 4 px, the third and
     * fourth by 12 and 15, and the back panel and the foreground deck reach the 17 px ceiling.
     */
    dof.apply({
      scene: target.texture, depthTexture: target.depthTexture, near, far, fovDeg: FOV,
      aspect: W / H, focusDistance, aperture: 0.22, maxCoc: 0.014,
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

/* A batch sweep, not a per-frame timer: `performance.now()` is clamped to ~100 µs and
   `gl.finish()` returns on flush rather than on completion, so one frame is noise. The trailing
   `readPixels` forces the GPU to finish before the clock is read. */
function measure(n: number): number {
  frame();
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) frame();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return (performance.now() - t0) / n;
}
const ms = measure(Math.max(1, FRAMES));

/*
 * THE REPORT EXISTS BECAUSE A CAPTURE CANNOT BE READ BY THE PROCESS THAT MADE IT.
 *
 * A frame that renders nothing at all is a complete framebuffer full of the clear colour, with
 * every program compiled and no refusal raised. So each panel reports the numbers that would be
 * wrong if it were missing: where its face lands in the frame, how far it is from the eye, the
 * blur radius the lens should be giving it, and the presented pixel AT its face centre. A blue
 * panel whose sampled pixel is not blue is a bug, whatever the screenshot looks like.
 */
const vpFinal = viewProjection(view, W / H);
const pixelAt = (world: readonly [number, number, number]) => {
  const p = projectScreen(vpFinal, [world[0], world[1], world[2]], W, H);
  if (p.behind || p.sx < 0 || p.sx >= W || p.sy < 0 || p.sy >= H) return null;
  const buf = new Uint8Array(4);
  // GL reads bottom-up; `projectScreen` returns top-down CSS coordinates.
  gl.readPixels(Math.round(p.sx), Math.round(H - p.sy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return { sx: Math.round(p.sx / SCALE), sy: Math.round(p.sy / SCALE), rgb: [buf[0]!, buf[1]!, buf[2]!] };
};

const report = {
  dof: DOF_ON,
  ao: AO_ON,
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),
  focusPanel: subject.id,
  focusDistance: Number(focusDistance.toFixed(2)),
  panels: placed.map((p) => {
    const coc = Math.min(0.014, Math.abs(1 / focusDistance - 1 / p.eyeDistance) * 0.22);
    const corners = [[-p.w / 2, 0], [p.w / 2, 0], [-p.w / 2, p.h], [p.w / 2, p.h]].map(([sx, sy]) =>
      projectScreen(vpFinal, [p.x + Math.cos(p.yaw) * sx!, sy!, p.z - Math.sin(p.yaw) * sx!], W / SCALE, H / SCALE));
    return {
      id: p.id, hex: p.hex,
      eyeDistance: Number(p.eyeDistance.toFixed(2)),
      yawDeg: Number(((p.yaw * 180) / Math.PI).toFixed(1)),
      cocPx: Number((coc * (W / SCALE)).toFixed(1)),
      /* IN-FRAME IS CHECKED, NOT ASSUMED. A panel behind the eye projects to a perfectly
         plausible pixel, and one off the edge is indistinguishable from one that never drew. */
      offFrame: corners.some((c) => c.behind || c.sx < 0 || c.sx > W / SCALE || c.sy < 0 || c.sy > H / SCALE),
      screen: [
        Math.round(Math.min(...corners.map((c) => c.sx))), Math.round(Math.min(...corners.map((c) => c.sy))),
        Math.round(Math.max(...corners.map((c) => c.sx))), Math.round(Math.max(...corners.map((c) => c.sy))),
      ],
      facePixel: pixelAt(p.faceCentre),
    };
  }),
  deckPixel: pixelAt([0.2, 0.0, 3.6]),
  glError: gl.getError(),
  triangles: tris,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  frames: FRAMES,
  msPerFrame: Number(ms.toFixed(3)),
  fps: Math.round(1000 / ms),
  budget60: 16.6,
  headroom: Number((16.6 - ms).toFixed(3)),
  renderer: (() => {
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  })(),
};
(globalThis as unknown as { E1: typeof report }).E1 = report;
log.textContent = JSON.stringify(report, null, 2);
// The readPixels probes above left the default framebuffer as the last thing bound, but the
// screenshot is taken from whatever is on screen — so present one clean frame last.
frame();
document.title = 'READY';
