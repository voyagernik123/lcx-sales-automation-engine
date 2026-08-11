/**
 * E1 · THE THEATRE — the command deck as a room you are standing in.
 *
 * `3D_VFX_1000X.md` §2: "panels are lit planes floating in depth on a dark deck plate ... a
 * shallow-DOF camera that racks focus to the panel you address." §5 puts it second, after E8,
 * because it is the other screen a stranger sees.
 *
 * ── THE FOCUS RACK IS THE WHOLE POINT ───────────────────────────────────────────────
 * Five panels at five depths is a composition. Five panels of which ONE is sharp is a statement
 * about where to look, and it is the one thing a flat grid of cards cannot make. So the geometry
 * here exists to give depth of field something to act on: the depths are deliberately unequal —
 * 6.1 m to 11.1 m from the eye, no two alike — and `dof=0` renders the identical scene with the
 * rack off as the control.
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
 * total and keep every model matrix a rotation plus a translation, a property the normal matrix
 * below depends on.
 */
import {
  createStage, isStage, box, plane, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion, createDepthOfField,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal,
} from '@lcx/gl';

/* EVERY PARAMETER IS READ FIRST, before any of them is used. `docs/3d/e0/entry.ts` reads its
   `DIAG` flag from inside the draw list twelve lines above the `const` that declares it, which is
   a temporal-dead-zone throw at module evaluation — and a page that throws there never sets its
   title, so the harness reports a timeout instead of the actual fault. */
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
/*
 * A `function` DECLARATION RETURNING `never`, AND BOTH HALVES OF THAT ARE LOAD-BEARING.
 *
 * Returning void, `if ('kind' in lit) die(...)` narrows nothing, and every accessor below it is an
 * error against a `StageRefusal | T` union — `stage.gl`, `stage.blit`, every `lit.*`, `target.*`,
 * `ao.*` and `dof.*`. E0's and E8's entries have the same shape and nobody sees it, because
 * `docs/3d` is in no tsconfig and esbuild strips types without checking them; this file was run
 * against `packages/gl/tsconfig.json`'s own settings on purpose.
 *
 * And it has to be a DECLARATION: `const die = (m: string): never => ...` does not narrow either,
 * which cost a round of 27 errors to learn. A never-returning call participates in control-flow
 * analysis only where the compiler sees the return type at the declaration site, and a const
 * initialised with an annotated arrow is not that — the const itself carries no annotation.
 */
function die(m: string): never { document.title = 'REFUSED'; log.textContent = m; throw new Error(m); }

/*
 * ONE CHECKED HANDOFF PER RESOURCE, rather than E8's line of seven `if ('kind' in x) die(...)`.
 *
 * Not tidiness. Those checks establish a control-flow narrowing at module level, and a narrowing
 * does not follow a const into a function body — only its DECLARED type does, which is why the
 * fourteen accessors inside `frame()` stayed errors after `die` was fixed. Routing each outcome
 * through a function whose return type is T puts the narrowing in the declaration, where a closure
 * can see it.
 *
 * `detail` is included because it carries the driver's own words. Printing only `reason` costs a
 * round trip to learn something the compiler had already said.
 */
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
}

const out = createStage(canvas, { alpha: false });
if (!isStage(out)) die(`stage: ${out.code} — ${out.reason}`);
const stage = out;
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

const present = required('present', stage.compile(PRESENT_VERT, PRESENT_FRAG));
const lit = required('lit', createLitRenderer(stage));
const target = required('target', createTarget3D(stage, W, H));
/* 1536, not E0's and E8's 1024. Those scenes fit one object in a ~5 m frustum; this one has to
   cover the deck the shadow tails cross, which is 15 m wide — at 1024 a texel is 15 mm and the
   panel-on-panel shadows, the strongest depth cue after the rack, arrive visibly stepped. */
const shadow = required('shadow', createShadowMap(stage, 1536));
const skyBox = required('sky', createSkyBackdrop(stage));
const ao = required('ao', createAmbientOcclusion(stage, W, H));
const dof = required('dof', createDepthOfField(stage, W, H));

/*
 * THE CAMERA IS DECLARED BEFORE THE PANELS, because the panels are aimed at it.
 *
 * Eye height 1.67 m and 7.2° of downward tilt: a person standing on the deck, not a drone above
 * it. The elevation is what costs the most if it drifts — past about 15° the deck plate becomes
 * the subject and the panels read as objects on a table.
 */
const view: Viewpoint = { target: [0, 0.62, 0.1], distance: 8.4, azimuthDeg: 1.5, elevationDeg: 7.2, fovDeg: 38 };
const eye = eyeOf(view);
const FOV = view.fovDeg ?? 38;
const near = Math.max(0.01, view.distance / 100);
const far = Math.max(near + 1, view.distance * 8);

/*
 * THE ARC — CONVEX, bulging toward the camera, and asymmetric.
 *
 * Curvature was a real decision, and the first answer was wrong. The draft put the two nearest
 * panels in FRONT of the far ones, which is what "some are nearer than others" naively produces —
 * and it stood them squarely in the way: more than half of one far panel and nearly two thirds of
 * another were behind a near one. Convex instead, with the nearest at the CENTRE, lets the room
 * fall away to both sides. Measured on the grid at the bottom of this file rather than eyeballed:
 * the three inner panels are 100% visible and the outer pair 83% and 78%, the missing slivers
 * being the overlaps that give the arrangement its depth in the first place.
 *
 * The z values are not symmetric about the centre, and the widths and heights are all different,
 * for the same dull reason: five equal panels on a curve still read as a grid that has been bent,
 * and a grid is what this environment replaces.
 *
 * The two panels the lens is focused nearest — P3 and P4 — carry brand blue, so colour and focus
 * agree about which panels are being addressed. Blue on a far panel would have the frame arguing
 * with itself.
 */
const THICKNESS = 0.06;
const PANELS = [
  { id: 'P1', x: -3.55, z: -1.25, w: 1.72, h: 1.30, hex: '#16203A', roughness: 0.50 },
  { id: 'P2', x: -1.62, z: 0.75, w: 1.30, h: 1.62, hex: '#16203A', roughness: 0.46 },
  { id: 'P3', x: 0.18, z: 2.35, w: 1.44, h: 1.36, hex: '#2C6BFF', roughness: 0.42 },
  { id: 'P4', x: 1.62, z: 1.15, w: 1.20, h: 1.54, hex: '#2C6BFF', roughness: 0.44 },
  { id: 'P5', x: 3.62, z: -2.10, w: 1.78, h: 1.18, hex: '#16203A', roughness: 0.52 },
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

const deckGeo = plane(30, 24);
const panelGeo = PANELS.map((p) => box(p.w, p.h, THICKNESS));

const deckMesh = required('deck mesh', uploadMesh(stage, deckGeo));
const panelMesh = panelGeo.map((g, i) => required(`panel ${i} mesh`, uploadMesh(stage, g)));

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
  // is where the box's +Z face normal ends up, so a yaw of a aims that face at (sin a, 0, cos a).
  m[0] = c; m[2] = -s;
  m[8] = s; m[10] = c;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

/*
 * THE NORMAL MATRIX, LIFTED OUT OF THE MODEL MATRIX RATHER THAN RECONSTRUCTED.
 *
 * E0 and E8 only translate, so both pass the identity and the storage convention never comes up.
 * E1 rotates, and here it does matter: `LitDraw.normalMat` is documented as row-major but is
 * uploaded with transpose=false, so the driver reads it as column-major — and a rotation is not
 * symmetric. Fed the wrong way round, every panel is lit as though yawed the opposite way while
 * its geometry stays put, which looks like a light in the wrong place rather than like a bug.
 *
 * Copying the model's own 3×3 in the identical storage order sidesteps the question: the shader
 * gets exactly what `mat3(uModel)` would give it, and because these matrices are pure rotations —
 * orthogonal, so the inverse-transpose IS the rotation — that is the correct normal matrix by
 * construction rather than by coincidence. It stops being correct the moment a scale appears,
 * which is why the panels are five geometries rather than one scaled five ways.
 */
const normalOf = (m: Float32Array): Float32Array => new Float32Array([
  m[0]!, m[1]!, m[2]!,
  m[4]!, m[5]!, m[6]!,
  m[8]!, m[9]!, m[10]!,
]);

const placed = PANELS.map((p, i) => {
  const yaw = Math.atan2(eye[0] - p.x, eye[2] - p.z) * FACE_FRACTION;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Bases ON the deck. Floating panels would have no contact shadow and no AO in the join, and
  // those two cues are most of what makes a rendered object sit on a surface rather than hover.
  const model = modelOf(p.x, p.h / 2, p.z, yaw);
  /* A point on the lit FACE, in world space: u across the panel, v up from the deck, pushed out
     by half the thickness so the point is on the surface rather than inside it. Used for the
     focus target and for the pixel probes at the bottom of this file. */
  const facePoint = (u: number, v: number): [number, number, number] => [
    p.x + c * u + s * (THICKNESS / 2), v, p.z - s * u + c * (THICKNESS / 2),
  ];
  const centre = facePoint(0, p.h / 2);
  return {
    ...p, yaw, model, facePoint,
    mesh: panelMesh[i]!,
    normalMat: normalOf(model),
    eyeDistance: Math.hypot(eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]),
  };
});

/* Nearest by MEASUREMENT, not by declaration order. The focus target has to follow the geometry,
   or a later nudge to one z silently racks focus onto the wrong panel. */
const subject = placed.reduce((a, b) => (b.eyeDistance < a.eyeDistance ? b : a));
const focusDistance = subject.eyeDistance;

const DECK_NORMAL = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const draws: LitDraw[] = [
  /*
   * THE DECK IS BRIGHTER THAN THE NAVY PANELS STANDING ON IT, and that is the key light's
   * doing rather than a number here that wants tuning.
   *
   * Measured, because I assumed otherwise twice. The lit deck averages 32/36/48 against 26/32/50
   * on a #16203A panel face, and both obvious levers were tried and BACKFIRED: taking roughness
   * from 0.86 to 0.94 made the deck brighter rather than darker, and dropping ambientGain to 0.72
   * with the key raised to compensate made it brighter still while draining the shadow interiors.
   * The reason is that a floor under a key 33° above the horizon has N·L = 0.54 — it is one of the
   * best-lit surfaces in the room, and almost none of what it returns is diffuse, so its albedo
   * barely participates.
   *
   * Which is what a photograph of this room would do: the dark panels read as silhouettes against
   * a lit floor, separated by hue and by their own cast shadows — 16/22/39 in shadow against the
   * lit deck's 32/36/48 — rather than by being lighter than it. Left at 0.86 and #070B14: matte
   * enough not to throw a second highlight, dark enough not to compete for attention.
   */
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
 * ONE KEY LIGHT, ABOVE AND TO THE LEFT — 33° above the horizon, not 60° and not 38°.
 *
 * A steeper key lands almost entirely on the panels' 6 cm top edges and leaves the faces to the
 * ambient sky, so the frame goes flat exactly where the information lives. At 33° every face still
 * takes direct light: N·L runs 0.39 on the outermost panel to 0.70 on the one turned most toward
 * the light.
 *
 * 38° was the first answer and the survey below is why it is not the final one. A shadow that
 * falls across the panel BEHIND is the one cue in this frame that states two panels are at
 * different depths without relying on the lens, and at 38° the reach was 1.72 m against the 1.87 m
 * from P3 to P4 — the shadow stopped just short and 1% of P4's face was covered. Five degrees
 * lower lengthens the reach to 2.10 m and covers 12%, and the deck's shadowed area grows with it
 * (41 of 539 sampled deck points against 28). Measured both times rather than judged by eye.
 */
const lightDir: [number, number, number] = [0.62, -0.55, -0.58];
/* Bounds sized to the SHADOWS, not to the geometry. The panels occupy x ∈ [-4.4, 4.5]; each cast
   shadow reaches a further 1.13 × its panel height in +x and 1.06 × in -z, so a frustum fitted to
   the panels alone would clip every shadow tail mid-deck — which reads as the deck being dirty
   rather than as a shadow map that ran out of room. */
const sceneMin: [number, number, number] = [-4.8, 0, -4.6];
const sceneMax: [number, number, number] = [6.2, 1.9, 3.0];
const centre = boundsCentre(sceneMin, sceneMax);
const radius = boundsRadius(sceneMin, sceneMax);
const lightVP = lightViewProjection({ direction: lightDir, colour: [1, 1, 1], extent: 7.6 }, centre, radius);

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
      // 0.5 m, about a third of a panel height. Larger and the occlusion stops describing the
      // join between panel and deck and starts dimming whole panels that face each other.
      radius: 0.5, strength: 1.3,
    });
    target.bind(); // AO bound its own half-res framebuffer.
  }
  lit.draw({
    /* The sky fill stays at full strength: it is the only light inside a shadow, and the cheaper
       alternative was measured — 0.72 with the key raised to compensate drained the shadow
       interiors by about a fifth and bought nothing anywhere else. */
    viewProj: vp, eye, lightDir, lightColour: [3.5, 3.45, 3.3],
    ambientGain: 1.05, lightVP, shadow, shadowStrength: 0.92, draws,
    ao: AO_ON ? ao.texture : null, screenSize: [W, H],
  });

  let resolved = target.texture;
  if (DOF_ON) {
    /*
     * APERTURE 0.16, WHERE E8 USES 7, AND THAT IS NOT AN INCONSISTENCY.
     *
     * The circle of confusion is a difference of RECIPROCAL distances. E8's subject sits about a
     * metre from its lens, where 1/z changes fast; this room spans 6.1 m to 11.1 m, and its whole
     * depth range is worth 0.073 reciprocal-metres. E8's aperture here would pin every panel but
     * the nearest at maxCoc, and the rack would read as "everything except one thing is mush".
     * 0.16 spends the range instead: the second panel softens by about 5 px, the third by 7, and
     * the two far ones reach 13 and 14 px against a 17 px ceiling.
     */
    dof.apply({
      scene: target.texture, depthTexture: target.depthTexture, near, far, fovDeg: FOV,
      aspect: W / H, focusDistance, aperture: 0.16, maxCoc: 0.014,
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
 * THE REPORT EXISTS BECAUSE THE PROCESS THAT MAKES A CAPTURE CANNOT READ IT.
 *
 * A frame that renders nothing at all is a complete framebuffer full of clear colour, with every
 * program compiled and no refusal raised. So each panel reports the numbers that would be wrong
 * if it were missing or mispositioned: where its face lands in the frame, how much of it another
 * panel is standing in front of, its distance, the blur radius the lens should be giving it, and
 * the presented pixel at a point on its face.
 *
 * THE FIRST VERSION OF THIS PROBE LIED. It sampled each panel's face CENTRE, and on the earlier
 * layout two of those centres sat behind a nearer panel — so two navy panels reported themselves
 * as brand blue, to within one 8-bit code of the blue panel actually occupying that pixel. Which
 * is how the occlusion problem was found: not by looking at the frame, but by a diagnostic
 * disagreeing with the material it was supposed to be confirming. The sample point is now chosen
 * to be a point no NEARER panel covers.
 */
const vpFinal = viewProjection(view, W / H);
const quadOf = (p: (typeof placed)[number]) =>
  [p.facePoint(-p.w / 2, 0), p.facePoint(p.w / 2, 0), p.facePoint(p.w / 2, p.h), p.facePoint(-p.w / 2, p.h)]
    .map((q) => projectScreen(vpFinal, q, W, H));
const quads = placed.map(quadOf);

/* Point in convex quad, by consistent edge sign. The corners are emitted in cyclic order above,
   which is what lets four cross products settle it — an axis-aligned bounding-box test would
   claim a yawed panel covers the wedges beyond its own corners. */
const inQuad = (q: ReturnType<typeof quadOf>, x: number, y: number): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!;
    const cross = (b.sx - a.sx) * (y - a.sy) - (b.sy - a.sy) * (x - a.sx);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};

/*
 * WHERE IS THE LIGHT BLOCKED? Classified by GEOMETRY, so the render can be checked against it.
 *
 * "Shadow map" is the easiest claim in this file to make and not deliver: a light frustum sized
 * wrong, a bias too large, or a caster outside the extent all produce a fully lit scene with every
 * pass running and no error raised. So each sample point below is traced toward the light to see
 * whether it crosses a panel, and the shadowed and lit populations are then averaged SEPARATELY
 * out of the presented frame. Two means that match mean there is no shadow, whatever it looks like.
 *
 * Means, not single pixels: one sample can land in a penumbra or on a shadow's leading edge, and a
 * claim resting on one pixel is a claim resting on the luck of a rounding.
 */
const toLight: [number, number, number] = (() => {
  const l = Math.hypot(lightDir[0], lightDir[1], lightDir[2]);
  return [-lightDir[0] / l, -lightDir[1] / l, -lightDir[2] / l];
})();
/* `skip` is the panel the point belongs to. Without it every face point reports itself as
   shadowed, because the ray toward the light starts ON the plane it is being tested against. */
const shadowedPoint = (x: number, y: number, z: number, skip: number): boolean => placed.some((p, j) => {
  if (j === skip) return false;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const denom = s * toLight[0] + c * toLight[2];
  if (Math.abs(denom) < 1e-6) return false;
  /* The panel's mid-plane. It is vertical, so the plane equation carries no y term and any point
     at the panel's x,z defines it; the 6 cm of thickness is below the resolution this test needs. */
  const t = (s * (p.x - x) + c * (p.z - z)) / denom;
  if (t <= 0) return false;
  const hx = x + toLight[0] * t, hy = y + toLight[1] * t, hz = z + toLight[2] * t;
  const u = (hx - p.x) * c - (hz - p.z) * s;
  return Math.abs(u) <= p.w / 2 && hy >= 0 && hy <= p.h;
});

const surveyed = placed.map((p, i) => {
  let visible = 0, total = 0, shaded = 0;
  let best: { sx: number; sy: number; rank: number } | null = null;
  for (let gy = 1; gy <= 15; gy++) {
    for (let gx = 1; gx <= 23; gx++) {
      const u = (gx / 24 - 0.5) * p.w, v = (gy / 16) * p.h;
      const world = p.facePoint(u, v);
      const q = projectScreen(vpFinal, world, W, H);
      total++;
      /* PANEL-ON-PANEL SHADOW, counted rather than asserted. The key's 38° elevation is justified
         a few blocks up on the grounds that the shadows reach the panels behind, and geometry says
         only P3 is placed to do it to P4. If this comes back 0% everywhere, that claim is wrong. */
      if (shadowedPoint(world[0], world[1], world[2], i)) shaded++;
      if (q.behind || q.sx < 0 || q.sx >= W || q.sy < 0 || q.sy >= H) continue;
      if (placed.some((o, j) => j !== i && o.eyeDistance < p.eyeDistance && inQuad(quads[j]!, q.sx, q.sy))) continue;
      visible++;
      // Prefer a sample near the face centre: the depth-of-field gather pulls in surroundings
      // near a silhouette, so a probe at the edge would read a blend of panel and room.
      const rank = Math.abs(u) / p.w + Math.abs(v - p.h / 2) / p.h;
      if (!best || rank < best.rank) best = { sx: q.sx, sy: q.sy, rank };
    }
  }
  const buf = new Uint8Array(4);
  if (best) {
    // GL reads bottom-up; `projectScreen` returns top-down CSS coordinates.
    gl.readPixels(Math.round(best.sx), Math.round(H - best.sy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  }
  const coc = Math.min(0.014, Math.abs(1 / focusDistance - 1 / p.eyeDistance) * 0.16);
  const xs = quads[i]!.map((q) => q.sx), ys = quads[i]!.map((q) => q.sy);
  return {
    id: p.id, hex: p.hex,
    eyeDistance: Number(p.eyeDistance.toFixed(2)),
    yawDeg: Number(((p.yaw * 180) / Math.PI).toFixed(1)),
    cocPx: Number((coc * (W / SCALE)).toFixed(1)),
    visiblePct: Math.round((100 * visible) / total),
    inShadowPct: Math.round((100 * shaded) / total),
    /* IN-FRAME IS CHECKED, NOT ASSUMED. A panel behind the eye projects to a perfectly plausible
       pixel, and one off the edge is indistinguishable from one that never drew. */
    offFrame: quads[i]!.some((c) => c.behind || c.sx < 0 || c.sx > W || c.sy < 0 || c.sy > H),
    screen: [
      Math.round(Math.min(...xs) / SCALE), Math.round(Math.min(...ys) / SCALE),
      Math.round(Math.max(...xs) / SCALE), Math.round(Math.max(...ys) / SCALE),
    ],
    sample: best ? { sx: Math.round(best.sx / SCALE), sy: Math.round(best.sy / SCALE), rgb: [buf[0]!, buf[1]!, buf[2]!] } : null,
  };
});

const deck = (() => {
  const buf = new Uint8Array(4);
  // Named fields rather than a 4-array: under `noUncheckedIndexedAccess` an accumulator indexed
  // by number is `number | undefined`, and `+=` on that is an error rather than a sum.
  const acc = { lit: { r: 0, g: 0, b: 0, n: 0 }, shade: { r: 0, g: 0, b: 0, n: 0 } };
  for (let x = -5; x <= 5.001; x += 0.25) {
    for (let z = -3.5; z <= 4.001; z += 0.25) {
      const q = projectScreen(vpFinal, [x, 0, z], W, H);
      if (q.behind || q.sx < 0 || q.sx >= W || q.sy < 0 || q.sy >= H) continue;
      // A deck point behind a panel reports the panel's colour, which is how the panel probes
      // above went wrong in their first form.
      if (quads.some((qd) => inQuad(qd, q.sx, q.sy))) continue;
      gl.readPixels(Math.round(q.sx), Math.round(H - q.sy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const bin = shadowedPoint(x, 0, z, -1) ? acc.shade : acc.lit;
      bin.r += buf[0]!; bin.g += buf[1]!; bin.b += buf[2]!; bin.n += 1;
    }
  }
  /* NO SAMPLES REFUSES rather than reporting zero. A shadowed mean of 0/0/0 is exactly what a
     working scene with no shadow in frame would print, and it is also what a black frame prints. */
  const mean = (b: typeof acc.lit) => (b.n === 0 ? null : [
    Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n),
  ]);
  return { litSamples: acc.lit.n, litRgb: mean(acc.lit), shadowedSamples: acc.shade.n, shadowedRgb: mean(acc.shade) };
})();

const report = {
  dof: DOF_ON,
  ao: AO_ON,
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),
  focusPanel: subject.id,
  focusDistance: Number(focusDistance.toFixed(2)),
  panels: surveyed,
  deck,
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
frame();
document.title = 'READY';
