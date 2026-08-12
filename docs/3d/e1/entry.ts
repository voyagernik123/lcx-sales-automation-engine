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
  projectQuad, isQuadRefusal,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion, createDepthOfField,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, assertBrandFidelity, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal,
  QUALITY_TIERS, qualitySettings, shadowMapSizeFor, type QualityTier,
} from '@lcx/gl';
import { installFlatFallback } from '../_shared/flatFallback.js';

/* EVERY PARAMETER IS READ FIRST, before any of them is used. `docs/3d/e0/entry.ts` reads its
   `DIAG` flag from inside the draw list twelve lines above the `const` that declares it, which is
   a temporal-dead-zone throw at module evaluation — and a page that throws there never sets its
   title, so the harness reports a timeout instead of the actual fault. */
const params = new URLSearchParams(location.search);
/* THE RACK OFF IS A CONTROL, not a fallback. The claim being made is that depth of field
   separates the addressed panel from the room, and that claim needs the same frame without it. */
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
const DOF_ON = params.get('dof') !== '0' && Q.dof;
const AO_ON = params.get('ao') !== '0' && Q.ao;
/*
 * A MISTYPED URL USED TO BE REPORTED AS A HARDWARE FAULT, and the clamp is what hid it.
 *
 * `Math.max(1, Math.min(3, Number('abc')))` is NaN — NEITHER clamp rejects NaN, because every comparison
 * against NaN is false and both functions then return it. So `?scale=abc` gave W = NaN, `canvas.width`
 * coerced that to 0, `createStage` correctly refused a 0x0 canvas with FRAMEBUFFER_INCOMPLETE, and
 * `stage.ts` printed its words to the reader: "This driver would not allocate the render targets this
 * view needs." The driver was fine. The URL was wrong, and the page blamed the machine.
 *
 * `frames` had the same shape with a quieter symptom: `for (let i = 0; i < NaN; i++)` runs ZERO times, so
 * `msPerFrame` came out NaN and serialised to null — indistinguishable from this codebase's refusal
 * convention, on a page still titled READY.
 *
 * So every numeric parameter goes through one parser that refuses a non-number BY NAME and records a
 * clamp instead of applying it silently. The refusal is taken after the flat fallback is installed, so the
 * reader keeps every row of the table and is told which parameter they mistyped.
 */
const badParams: string[] = [];
const paramClamps: string[] = [];
function numParam(name: string, dflt: number, lo: number, hi: number): number {
  const raw = params.get(name);
  if (raw === null) return dflt;
  const v = Number(raw);
  if (!Number.isFinite(v)) { badParams.push(`${name}=${raw}`); return dflt; }
  const clamped = Math.max(lo, Math.min(hi, v));
  if (clamped !== v) paramClamps.push(`${name}=${raw} used as ${clamped}`);
  return clamped;
}
const SCALE = numParam('scale', 1, 1, 3);
/* BOUNDED AT BOTH ENDS. The lower bound stops `frames=0` and `frames=-5` publishing a one-frame time as an
   n-frame sweep; the upper bound stops the count being absurd. Neither is what makes `?frames=1e9`
   survivable — the wall clock in `measure` is. */
const FRAMES = Math.trunc(numParam('frames', 300, 1, 20000));

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
function die(m: string): never {
  document.title = 'REFUSED';
  /* Resolved here rather than closed over. `die` is now reachable BEFORE the harness's own `const log`
     is initialised — the flat fallback and its forced-refusal switch both sit above the stage on
     purpose — and a closure over an uninitialised const fails with "Cannot set properties of
     undefined", which reads as a DOM problem rather than an ordering one. */
  const logEl = document.getElementById('log');
  if (logEl) logEl.textContent = m;
  const [code, ...rest] = m.split(':');
  fallbackRef?.showRefusal(code?.trim() ?? 'REFUSED', rest.join(':').trim() || m);
  throw new Error(m);
}
/* Assigned once the fallback is installed. `die` stays a declaration: a `function` returning `never` is
   what gives the compiler its control-flow narrowing, and a const arrow does not. */
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;

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

declare const __ENV_STATES__: Record<string, { id: string; name: string; verdict: string }>;

/*
 * §6 RULE 1. The fallback goes in before the stage — a shader compile failure happens during module
 * evaluation, and print and the accessibility tree are not errors there is anything to catch for.
 *
 * E1's subject IS the state of the programme, and that state is a build-time define read from each
 * environment's own README. So the flat view is not a reduction of the frame: it carries all NINE
 * environments where the geometry has room for five, which makes it the one place a reader can see the
 * whole programme at once. The 3-D view adds the focus rack and the depth ordering; it subtracts four rows.
 *
 * NINE, NOT SIX AND NOT TEN. This comment said six while the harness harvested every README under a
 * `docs/3d/eN` directory and found ten — and a glob written literally here would END this comment, which
 * is the same class of trap as a backtick inside a template literal, so it is spelled out instead.
 * `docs/3d/e9` is the AUDIT, and its README's first line parsed, so it was injected as an
 * environment and both the frame and this table listed `E9 · THE AUDIT` as one. `build.mjs` now requires an
 * `entry.ts`, which is what an environment is in this tree.
 */
const fallback = installFlatFallback({
  title: 'E1 · The Theatre — 3D programme state',
  readsAs: 'The rendered view puts five of these on lit panels at graded depths and racks focus to the '
    + 'one being built, which states where to look in a way a list cannot. This table has no such '
    + 'emphasis and no depth — and it carries every environment, including the four the five panels '
    + 'cannot show.',
  notices: ['Each verdict is read from that environment\'s own README first line at build time, not typed here.'],
  columns: [
    { key: 'id', label: 'Env' },
    { key: 'name', label: 'Name' },
    { key: 'verdict', label: 'Verdict (from its README)' },
  ],
  rows: Object.values(__ENV_STATES__).map((e) => ({ id: e.id, name: e.name, verdict: e.verdict })),
});
fallbackRef = fallback;
/* Refused HERE rather than where the parameter is parsed, because the fallback has to exist first —
   see `numParam`. A bad parameter is named to the reader instead of being reported as a driver fault. */
if (badParams.length > 0) {
  die(`BAD_PARAM: ${badParams.join(', ')} — not a number, so the theatre was refused rather than drawn `
    + 'from a nonsensical value. Every row below is unaffected; correct the URL and reload.');
}
if (params.get('refuse') === '1') {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The three-dimensional view is not being drawn.');
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
const shadow = required('shadow', createShadowMap(stage, shadowMapSizeFor(TIER, 1536)));
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
/* AND IT HAS A WALL-CLOCK CEILING, because a frame ceiling is not one. The loop is synchronous, so an
   unbounded count is an unbounded main-thread block: `?frames=1e9` left the renderer process unable to
   service a Playwright evaluation at all, and the harness reported a timeout — which names the waiter
   rather than the loop. Clamping the count alone does not fix it: 20000 frames of this room under
   SwiftShader is over an hour. The frames actually timed are reported, so a truncated sweep says so. */
/*
 * 4 SECONDS, AND THE BUDGET IS SPENT AGAINST A MEASURED FRAME COST RATHER THAN AGAINST THE CLOCK INSIDE
 * THE LOOP — because a clock inside the loop measures the wrong thing, and this cost a real measurement.
 *
 * The first version checked `performance.now() - t0 > SWEEP_BUDGET_MS` per iteration and looked correct.
 * Measured on `?frames=1e9`: it stopped after 833 frames and the page took **160 seconds**, reporting
 * `msPerFrame: 191.7`. The reason is the same one the trailing `readPixels` exists for — the driver QUEUES
 * work, so 833 frames of SwiftShader were submitted in 4 s of CPU time and the sync at the end then blocked
 * for the 156 s of GPU work behind them. An in-loop clock bounds SUBMISSION, not execution.
 *
 * So the warm-up frame — which is already followed by a `readPixels` sync, and is the most expensive frame
 * because it pays shader upload — is TIMED, and the loop count is capped at what fits the budget at that
 * cost. Conservative in the right direction: the estimate is high, so the sweep finishes early rather than
 * late. The in-loop clock stays as a second bound for the case where frames get slower mid-sweep.
 */
const SWEEP_BUDGET_MS = 4000;
function measure(n: number): { msPerFrame: number; measured: number } {
  const px = new Uint8Array(4);
  /* The warm-up, TIMED. `readPixels` cannot be satisfied until the frame exists, so this measures execution
     rather than submission — which is the whole reason it is the number the cap is computed from. */
  const warm0 = performance.now();
  frame();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const pilotMs = Math.max(0.01, performance.now() - warm0);
  const cap = Math.min(n, Math.max(1, Math.floor(SWEEP_BUDGET_MS / pilotMs)));
  const t0 = performance.now();
  let measured = 0;
  for (let i = 0; i < cap; i++) {
    frame();
    measured++;
    if (performance.now() - t0 > SWEEP_BUDGET_MS) break;
  }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { msPerFrame: (performance.now() - t0) / measured, measured };
}
const timing = measure(FRAMES);
const ms = timing.msPerFrame;

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

/*
 * ============================================================================================
 * THE HYBRID. GL RENDERS THE SURFACES, THE BROWSER RENDERS THE TEXT.
 * ============================================================================================
 *
 * This is what the README said was missing and it is the reason E1 exists at all: §6 rule 4 says
 * text stays in the DOM, so a 3D environment that carries information has to make a rasteriser it
 * does not control agree with a renderer it does. Everything above this line was a lighting study.
 *
 * WHY NOT DRAW THE TEXT IN GL. Because every one of these panels is a workstream an operator has to
 * be able to select, search, translate, zoom, and hear read aloud. Baked glyphs are none of those
 * things at any resolution, and an environment that costs the reader those four abilities to gain a
 * third dimension has failed §7(b) before it has started.
 *
 * WHAT THE CONTENT IS. The 3D programme's own state, because it is the only dataset in reach that I
 * can verify rather than invent. §6 rule 8 forbids placeholder numbers in a rendered environment for
 * the same reason it forbids them anywhere: a plausible number in a beautiful frame is the most
 * persuasive lie this codebase can tell. Every row below is checkable against this repository.
 */

/*
 * PANEL CONTENT, DERIVED. `__ENV_STATES__` is injected by build.mjs from each environment's own
 * README first line, so the frame cannot assert a state the repository does not.
 *
 * The one number still typed here is E0's frame time, and it is typed with its instrument named. The
 * previous value — 4.41 ms — was P1's, not E0's, and it was rendered under the sentence "Every row
 * below is checkable against this repository." That is the §6 rule 6 failure this whole block now
 * exists to prevent: invented content in a rendered environment is the most persuasive lie available
 * to a beautiful frame.
 *
 * A panel whose environment has no README shows a REFUSAL rather than a blank or a guess.
 */
const NOTES: Record<string, string> = {
  E0: 'GGX + shadows + AO + DOF. 1.305 ms/frame at 1x on the M1, by trailing-readPixels',
  E1: 'real DOM content projected onto lit GL surfaces — the panel you are reading',
  E2: 'seven corridors, lift monotonic with distance; no landmasses yet',
  E5: 'driven from the same input as the shipping flat engine; cell counts agree exactly',
  E6: 'depth is time; fog is the reading limit on it, and both horizons are reported',
  E8: 'on the sign-in route in both themes, with a CSS fallback and a pixel ratchet',
};
/*
 * THE ORDER IS DERIVED AND THE OMISSION IS NAMED.
 *
 * There are five panels of geometry and NINE environments, and the first version simply left E5 out — a
 * frame presenting itself as the state of the programme, silently missing a shipped environment. That is
 * the same failure as a chart dropping a row.
 *
 * The count in this block used to say six, and quoted a HUD string — `6 ENVIRONMENTS · 1 NOT SHOWN — ONLY
 * 5 PANELS: E2` — that appears in no capture in this repository: `grep -rn '6 ENVIRONMENTS' docs/3d` found
 * it only in the prose. The committed PNG at the time printed 9, the build printed 10, and neither was
 * six. Hard-coding a count in a comment beside code that derives it is the same defect as hard-coding a
 * row, so the number is stated once here as a fact about the tree (e0..e8) and everything else reads
 * `AVAILABLE` and `OMITTED`.
 *
 * The geometry is not widened: the five positions are measured (the composition survey below reports
 * 100% / 83% / 78% visibility, and a sixth panel would invalidate it). So the frame shows the five it can
 * and REPORTS which four it could not, and the HUD prints that count. Naming what is missing is the only
 * honest version of not showing it.
 *
 * Nearest-first, because the panel the lens is focused on should carry the environment currently
 * being built rather than whichever one sorts first alphabetically.
 */
const PREFERRED = ['E1', 'E8', 'E0', 'E6', 'E5', 'E2'];
const AVAILABLE = Object.keys(__ENV_STATES__).sort(
  (a, b) => (PREFERRED.indexOf(a) + 1 || 99) - (PREFERRED.indexOf(b) + 1 || 99),
);
/* Slot 3 is the nearest panel and the focus target, so the most current environment goes there. */
const SLOT_BY_RANK = ['P3', 'P4', 'P2', 'P5', 'P1'];
const PANEL_SLOTS = AVAILABLE.slice(0, SLOT_BY_RANK.length);
const OMITTED = AVAILABLE.slice(SLOT_BY_RANK.length);

/* Cut at a WORD boundary. A hard 26-character slice produced "the first shippable enviro", which is
   a truncated identifier rendered as a heading — the same class of defect as E6 serving
   `campaign.publ` as an action name. */
const headline = (verdict: string): string => {
  const clause = verdict.split(/[.·—]/)[0]!.trim();
  if (clause.length <= 26) return clause.toUpperCase();
  const cut = clause.slice(0, 26);
  const at = cut.lastIndexOf(' ');
  return (at > 8 ? cut.slice(0, at) : cut).toUpperCase();
};

const PANEL_CONTENT: Record<string, { tag: string; state: string; note: string }> = Object.fromEntries(
  PANEL_SLOTS.map((id, rank) => {
    const slot = SLOT_BY_RANK[rank]!;
    const st = __ENV_STATES__[id]!;
    return [slot, {
      tag: `${st.id} · ${st.name}`,
      state: headline(st.verdict),
      note: NOTES[id] ?? st.verdict,
    }];
  }),
);
/*
 * ONE SCALE FOR EVERY PANEL, so type size states DEPTH rather than importance.
 *
 * The tempting alternative — size each element to a fixed pixel width — is wrong in a way that is
 * hard to unsee once noticed: it makes the far panels' text the same size on screen as the near
 * one's, which contradicts the perspective the rest of the frame is at pains to establish. Fixing
 * pixels-per-METRE instead lets the projection do the foreshortening, exactly as it does to the
 * geometry. 250 px/m puts the 12 px body copy at about 4.8 cm of panel, which is a wall display read
 * from three metres rather than a phone held at arm's length.
 */
const PX_PER_METRE = 250;
/* Content sits inside the panel's own margin. Text to the very edge of a lit slab reads as a
   texture applied to it; a margin reads as a display mounted in it. */
const PAD_U = 0.11, PAD_V = 0.10;

/**
 * One styled line of TEXT, built as an element rather than as a string of markup.
 *
 * The three panel lines were interpolated into `innerHTML`, and all three come from a FILE: `build.mjs`
 * reads each environment's README first line and injects `{id, name, verdict}`. Run that same regex against
 * a first line reading `# E5 · THE SURFACE <img src=x onerror=alert(1)> — status: **AGREES & "SHIPS"**` and
 * it yields `name: 'THE SURFACE <img src=x onerror=alert(1)>'` — the markup survives the parse verbatim,
 * and so do the `&` and the `"`. `headline()`'s `toUpperCase()` does not help: HTML tag names are
 * case-insensitive, so `<IMG SRC=X ONERROR=…>` is still an element.
 *
 * The same values also go into `rows:` for the flat table, where `escText` escapes them — so a README
 * containing a bare `&` made E1's rendered panel and E1's own flat table disagree about the state of the
 * programme, inside the file whose whole claim is that they cannot ("It cannot go stale without the README
 * going stale with it").
 *
 * `textContent` does not parse. A constructor that takes text is the fix an escape is not: an escape has to
 * be remembered at the next interpolation.
 */
const textLine = (css: string, text: string): HTMLDivElement => {
  const d = document.createElement('div');
  d.style.cssText = css;
  d.textContent = text;
  return d;
};

const overlay = document.createElement('div');
/* The canvas is laid out by the document with body padding around it, so the overlay is anchored to
   the CANVAS rather than to the page. Hard-coding the padding would silently break the alignment the
   moment the harness page changes, and the failure would look like a projection bug. */
/*
 * THE CONTAINER IGNORES THE POINTER; THE CONTENT DOES NOT — and until now neither did.
 *
 * `project.ts` justifies its own existence on the grounds that "GL text is unselectable, unsearchable,
 * invisible to a screen reader" and that the homography makes "the browser rasterise real selectable
 * text". Measured: `document.elementFromPoint` at the centre of all five projected panels returned
 * `CANVAS#c`, and a mouse drag across the frame selected the empty string. Cmd/Ctrl+A reached 5,674
 * characters, so the text was IN the document and unreachable with a pointer — a reader could not point at
 * a panel and copy it, which is four of the five abilities this file says the hybrid exists to keep.
 *
 * `pointer-events:none` stays on the container, which must not swallow a gesture aimed at the canvas; each
 * projected panel re-enables it. Nothing here is interactive, so the only cost is a drag that STARTS on a
 * panel.
 */
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
const wrap = document.createElement('div');
/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to the canvas box or it
   extends the PAGE box, and a surface seen nearly edge-on produces a homography whose
   coefficients are enormous — the element's transformed bounding box then runs to millions of
   pixels and Playwright's `fullPage` screenshot fails with "Unable to capture screenshot",
   naming the screenshot rather than the transform three layers away that caused it. */
wrap.style.cssText = 'position:relative;overflow:hidden;width:1200px;height:720px';
canvas.parentNode?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
wrap.appendChild(overlay);

/*
 * PAINT ORDER, and the thing CSS cannot do for us.
 *
 * There is no depth buffer in the compositor. The GL canvas is ONE element, so every projected panel
 * necessarily paints in front of ALL of the geometry — including the panels standing nearer to the
 * camera. Sorting far-to-near fixes DOM-over-DOM, which is why it is done, but it cannot fix
 * DOM-over-GL: a label on a far panel will still paint over the near panel occluding it.
 *
 * So occlusion is MEASURED per panel below and a covered panel refuses to show its content. Refusing
 * is the honest move rather than the cautious one: content floating over the wrong surface does not
 * look like a bug, it looks like content, and the reader attributes it to whatever it is lying on.
 */
const byDepth = [...placed].map((p, i) => ({ p, i })).sort((a, b) => b.p.eyeDistance - a.p.eyeDistance);
/* Farthest is rank 0, so a nearer panel gets the higher `z-index` and paints over the one behind it —
   the same stacking the append order used to produce, expressed where it does not also dictate the
   reading order. */
const depthRankOf = new Map(byDepth.map(({ p }, rank) => [p.id, rank]));
/*
 * AND THE ELEMENTS ARE APPENDED IN READING ORDER, which is the order the report and the table use.
 *
 * `SLOT_BY_RANK` is nearest-panel-first, so this is exactly `environmentsShown` — E1, E8, E0, E6, E5. It
 * also drops any panel with no environment to show instead of dereferencing a missing `PANEL_CONTENT`
 * entry, which the depth-ordered version would have done had `AVAILABLE` ever fallen below five.
 */
const inReadingOrder = SLOT_BY_RANK.slice(0, PANEL_SLOTS.length)
  .map((slot) => byDepth.find((d) => d.p.id === slot))
  .filter((d): d is { p: (typeof placed)[number]; i: number } => d !== undefined);

/*
 * WHERE ON THE PANEL THE CONTENT GOES — SEARCHED, NOT ASSUMED, and this is the second thing the
 * measurements forced.
 *
 * Centred content put P1 and P5 straight into the refusal branch: two of each one's four corners
 * landed behind the panel standing nearer, so both outer panels went dark and three of five
 * workstreams carried no information. That is the §7(b) failure the README describes, arrived at
 * from the other direction.
 *
 * The cheap fix would have been to loosen the occlusion test until they passed. That is a fix to the
 * INSTRUMENT rather than to the frame, and it ships text lying across the wrong surface.
 *
 * So the placement is solved for instead. Each panel is occluded on ONE side — the side its nearer
 * neighbour stands on — and the layout leaves margin on the other, so a shift away from the occluder
 * recovers the whole content box without shrinking it. The search tries shifts before scales, and
 * smaller shifts before larger, so a panel takes the least intervention that works and an
 * unobstructed panel takes none at all. `contentShift 0` in the report is therefore meaningful: it
 * says this panel needed nothing, rather than that the search was not run.
 */
const SHIFTS = [0, 0.06, -0.06, 0.12, -0.12, 0.18, -0.18, 0.24, -0.24, 0.30, -0.30, 0.36, -0.36];
const SCALES = [1, 0.92, 0.84, 0.76, 0.68, 0.60];

/* The circle of confusion the lens gives a panel, in CSS pixels — the same expression the panel
   survey above reports, lifted out so the DOM and the report cannot drift apart. */
const cocOf = (d: number): number =>
  Math.min(0.014, Math.abs(1 / focusDistance - 1 / d) * 0.16) * (W / SCALE);
const maxCoc = Math.max(...placed.map((q) => cocOf(q.eyeDistance)));
/*
 * WHERE TEXT STOPS BEING TEXT — AND IT IS NOW A CONTRAST MEASUREMENT RATHER THAN A READING.
 *
 * This was 2.4 px "measured by reading it": at 2.4 px an 11.5 px note is still parseable on a lit panel.
 * Parseable by me, at 100% zoom, knowing what it says. Measured properly — screenshot the frame, screenshot
 * it again with every text leaf hidden to get the true background, keep the pixels that differ and take the
 * strongest 15% as glyph core — the 2.4 px / 0.58-opacity panel came out at **1.47:1** and 11 of 18 text
 * runs on this frame failed WCAG AA's 4.5:1. Legibility had been tuned against an intuition and the
 * intuition was wrong by a factor of three.
 *
 * The two levers are capped TOGETHER now, because they multiply: blur removes glyph core and opacity
 * removes the contrast of what is left. The pair below is the largest one whose MEASURED core contrast
 * still clears 4.5:1 on all eighteen text runs in this frame, found by bisection against the measurement
 * rather than by choosing it — 1.2/0.86 left 5 failures and 0.6/0.90 left 1, both on 11 px type.
 *
 * WHAT THAT COSTS, STATED: at 11 px, ANY perceptible blur takes the glyph core below AA on a dark panel
 * whatever colour the type is, so the DOM blur is now small enough to be nearly invisible and the rack is
 * carried by the GL frame — the panel SURFACES are still defocused by 5 to 14 px, which is the lens doing
 * its work on everything except the words. This file worried about the opposite failure ("razor-sharp text
 * on a panel the renderer has defocused by 14 px is the tell"), and that worry is real; it is also worth
 * less than the words. Recession is still ordered and still visible in the opacity ramp and in the
 * geometry. `capture.mjs` re-measures every run and fails the build below 4.5:1, so this is a floor rather
 * than a preference.
 */
const DOM_BLUR_CEILING = 0.45;
/* The recession dim, matched to the blur ceiling. 0.42 put the far panel at 0.58 opacity, and that panel's
   note measured 1.47:1. */
const DOM_DIM_MAX = 0.10;

const projections = inReadingOrder.map(({ p, i }) => {
  const content = PANEL_CONTENT[p.id]!;
  const depthRank = depthRankOf.get(p.id) ?? 0;
  const off = THICKNESS / 2 + 0.008;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const at = (u: number, v: number): [number, number, number] => [
    p.x + c * u + s * off, v, p.z - s * u + c * off,
  ];
  const cornersFor = (cw: number, ch: number, shift: number) => ({
    topLeft: at(shift - cw / 2, PAD_V + ch),
    topRight: at(shift + cw / 2, PAD_V + ch),
    bottomRight: at(shift + cw / 2, PAD_V),
    bottomLeft: at(shift - cw / 2, PAD_V),
  });
  /* Occlusion at the content's own corners, against panels the MEASUREMENT says are nearer — not
     against panels that merely appear earlier in the list. */
  const occludedAt = (screen: readonly { x: number; y: number }[]): number => screen.filter((c2) => (
    placed.some((o, j) => j !== i && o.eyeDistance < p.eyeDistance && inQuad(quads[j]!, c2.x * SCALE, c2.y * SCALE))
  )).length;

  let chosen: {
    proj: Exclude<ReturnType<typeof projectQuad>, { refusal: unknown }>;
    ew: number; eh: number; shift: number; scale: number; occluded: number;
  } | null = null;
  let lastRefusal: string | null = null;
  let bestOccluded = 4;

  outer: for (const scale of SCALES) {
    const cw = Math.max(0.2, (p.w - 2 * PAD_U) * scale);
    const ch = Math.max(0.2, (p.h - 2 * PAD_V) * scale);
    const ew = Math.round(cw * PX_PER_METRE), eh = Math.round(ch * PX_PER_METRE);
    for (const shift of SHIFTS) {
      /* A shift that would push content off the panel's own edge is not a candidate: content
         overhanging the slab it is mounted on is a worse artefact than content that is occluded. */
      if (Math.abs(shift) + cw / 2 > p.w / 2 - PAD_U * 0.5) continue;
      const proj = projectQuad(vpFinal, cornersFor(cw, ch, shift), W / SCALE, H / SCALE, ew, eh);
      if (isQuadRefusal(proj)) { lastRefusal = proj.refusal; continue; }
      const occluded = occludedAt(proj.screen);
      bestOccluded = Math.min(bestOccluded, occluded);
      if (occluded === 0 && proj.signedArea > 0) {
        chosen = { proj, ew, eh, shift, scale, occluded };
        break outer;
      }
    }
  }

  if (!chosen) {
    /* REFUSES rather than showing it anyway. Reported with the best the search managed, so the
       number says how close it came instead of only that it failed. */
    return {
      id: p.id, shown: false, refusal: lastRefusal ?? 'NO_UNOCCLUDED_PLACEMENT',
      backFacing: false, occludedCorners: bestOccluded, contentShift: null, contentScale: null,
      perspectiveX: null, elementPx: null, rectError: null,
    };
  }

  const { proj, ew, eh } = chosen;

  /*
   * THE CONTENT IS TRANSPARENT, and getting this wrong the first time is the most instructive
   * mistake in this file.
   *
   * The first version reused the harness page's `.cell` class, which carries an opaque background
   * because it was written for a flat card. The capture is unambiguous: five dark cards with a blue
   * rim, and NOTHING of the render visible. The GGX response, the cast shadows, the ambient occlusion
   * in the join, the brand blue itself — every one of them hidden behind flat DOM, surviving only as
   * the few millimetres of panel edge peeking out around the card.
   *
   * That is not a hybrid. That is a 2D layout with a 3D border, and it costs the frame everything the
   * renderer was for while keeping all of its expense. The content must be GLYPHS AND NOTHING ELSE,
   * so light that the panel is lit through it.
   *
   * Which forces the colours to come from the panel rather than from a stylesheet: #7fb2ff reads on
   * navy and disappears into brand blue.
   */
  const onBlue = p.hex === '#2C6BFF';
  /*
   * SOLID, NOT SEMI-TRANSPARENT — because the lens is already a dimmer and two dimmers stacked is how
   * the words went.
   *
   * These were `rgba(255,255,255,0.78)` and `rgba(198,212,236,0.78)`. Multiplied by the recession opacity
   * below, an 11.5 px note on the furthest panel arrived at an effective alpha of 0.45 and measured
   * **1.47:1** against the surface behind it — a 4.5:1 requirement, and 11 of 18 runs on this frame failed
   * it. The alpha was buying nothing the recession opacity was not already buying, and it was spending the
   * whole contrast budget before the lens got any. The hexes are the same colours at full strength.
   */
  const tagColour = onBlue ? '#EAF1FF' : '#7fb2ff';
  const noteColour = onBlue ? '#FFFFFF' : '#C6D4EC';

  /*
   * THE LENS APPLIES TO THE TEXT TOO — up to a ceiling, and the ceiling is a decision rather than a
   * tuning.
   *
   * Razor-sharp text on a panel the renderer has defocused by 14 px is the tell that gives the whole
   * hybrid away: the eye reads the contradiction instantly even when it cannot name it. So the DOM
   * gets a matching blur. But matched one-for-one, four of the five panels become unreadable and the
   * environment fails §7(b) outright — the frame would look correct and inform nobody.
   *
   * So blur tracks the circle of confusion up to 2.4 px and beyond that the panel RECEDES by opacity
   * instead. Blur says out-of-focus; dimming says further away; neither destroys the words. Both
   * numbers are reported next to the CoC they came from, so the compromise is auditable rather than
   * invisible — the alternative would be quietly rendering sharp text and calling the rack a success.
   */
  const cocPx = cocOf(p.eyeDistance);
  /*
   * NORMALISED AGAINST THE WORST PANEL IN THE SCENE, not against a constant — and the first version
   * was the constant, which is why this comment exists.
   *
   * `min(2.4, coc * 0.45)` clamped at 2.4 for every unfocused panel: a 5.5 px circle of confusion and
   * a 14 px one came out identically blurred, so the blur said only "not the subject" and the
   * ordering it was supposed to convey was gone. The ceiling was doing all of the work, which is
   * always the sign that a clamp has been put where a scale belongs.
   *
   * Scaling by the scene's own maximum reaches the legibility ceiling exactly once, on the panel
   * that has earned it, and keeps every step below it distinct.
   */
  /* GATED ON THE LENS ACTUALLY BEING ON. Both of these are lens effects, and with `?dof=0` the GL
     frame is sharp everywhere — so leaving them applied would put blurred text on crisp geometry,
     which is the exact contradiction this block exists to remove, merely inverted. Caught by asking
     what the control capture would look like rather than by looking at it. */
  const domBlur = DOF_ON ? DOM_BLUR_CEILING * (cocPx / Math.max(1e-6, maxCoc)) : 0;
  const domOpacity = DOF_ON ? 1 - DOM_DIM_MAX * (cocPx / Math.max(1e-6, maxCoc)) : 1;

  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    `width:${ew}px`, `height:${eh}px`,
    /* SELECTABLE CONTENT ON A NON-INTERACTIVE OVERLAY — see the note where the overlay is created. */
    'pointer-events:auto', 'user-select:text', '-webkit-user-select:text',
    /*
     * PAINT ORDER IS A z-index, NOT AN APPEND ORDER, and that is an accessibility fix rather than a
     * refactor.
     *
     * The panels are sorted far-to-near for the compositor (see `byDepth`) and were appended in that
     * order, so DOM order became CAMERA order: the measured AX tree read E6, E5, E0, E8, E1 while the
     * report lists `environmentsShown` as E1, E8, E0, E6, E5 and the flat table lists E0..E8 in index
     * order — three representations of the same rows disagreeing about sequence, and the announced order
     * changing if the camera moves. `z-index` gives the compositor the same stacking while the elements
     * are appended in the logical order below, so a screen reader hears the programme in the order the
     * report and the table use.
     */
    `z-index:${depthRank}`,
    /* THE HOMOGRAPHY IS EXPRESSED FROM THE ELEMENT'S TOP-LEFT. Any other origin shears the result,
       and CSS defaults to `50% 50%` — so omitting this line is a silent, plausible-looking error. */
    'transform-origin:0 0',
    `transform:${proj.transform}`,
    'display:flex', 'flex-direction:column', 'justify-content:flex-end', 'gap:7px',
    /* CLIPPED TO THE ELEMENT, which is clipped to the panel. Without this a note one word longer
       than the box spills past the slab it is mounted on — and text hanging in mid-air beside a
       panel is precisely the artefact the placement search above refuses to produce. */
    'overflow:hidden',
    `filter:blur(${domBlur.toFixed(2)}px)`,
    `opacity:${domOpacity.toFixed(3)}`,
    /* Sub-pixel text on a transformed surface: without this the glyphs snap to the device grid and
       the type stops sitting on the plane it is drawn on. */
    '-webkit-font-smoothing:antialiased',
  ].join(';');
  /* Three lines of text, three fixed styles, no markup — see `textLine` for what was wrong with the
     template literal these replace. */
  el.appendChild(textLine(
    `font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:${tagColour}`, content.tag,
  ));
  el.appendChild(textLine(
    'font:700 27px/1.02 system-ui,sans-serif;color:#fff;letter-spacing:-0.01em', content.state,
  ));
  el.appendChild(textLine(
    `font:400 11.5px/1.45 system-ui,sans-serif;color:${noteColour}`, content.note,
  ));
  overlay.appendChild(el);

  /*
   * THE MEASUREMENT THAT MAKES THIS CLAIM CHECKABLE — and it is the browser's number, not mine.
   *
   * Every other figure in this file is my own arithmetic reported back to me. This one asks the
   * COMPOSITOR where it actually put the element, and compares that against where the renderer said
   * the surface is. A transposed coefficient, a wrong transform-origin, an exponent-notation token
   * that made CSS reject the whole transform — all of them survive a reading of the code, and none
   * of them survive a disagreement here. It is the same discipline as reading pixels back out of the
   * framebuffer rather than trusting that the draw call happened.
   */
  let rectError: number | null = null;
  {
    const cr = canvas.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const xs = proj.screen.map((c2) => c2.x), ys = proj.screen.map((c2) => c2.y);
    rectError = Number(Math.max(
      Math.abs((er.left - cr.left) - Math.min(...xs)),
      Math.abs((er.top - cr.top) - Math.min(...ys)),
      Math.abs((er.right - cr.left) - Math.max(...xs)),
      Math.abs((er.bottom - cr.top) - Math.max(...ys)),
    ).toFixed(2));
  }

  return {
    id: p.id, shown: true,
    refusal: null as string | null,
    backFacing: false,
    occludedCorners: 0,
    /* How much intervention the placement needed. 0 and 1 mean the panel was unobstructed. */
    contentShift: Number(chosen.shift.toFixed(2)),
    contentScale: chosen.scale,
    /* The perspective coefficient, scaled back out of the element's pixel size so it is comparable
       between panels. Zero everywhere would mean every transform is affine — labels as stickers —
       which is the failure this whole file exists to avoid. */
    perspectiveX: Number((proj.matrix[6]! * 1000).toFixed(3)),
    elementPx: [ew, eh],
    cocPx: Number(cocPx.toFixed(1)),
    domBlurPx: Number(domBlur.toFixed(2)),
    domOpacity: Number(domOpacity.toFixed(3)),
    rectError,
  };
});

/* Read ONCE, before the report, because two call sites for the same string is two chances for the
   refusal below to key off something different from what is printed. */
const RENDERER = (() => {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
})();
/* Matched on the driver's own words. SwiftShader and llvmpipe are the two software rasterisers a
   headless capture actually lands on; anything else is treated as hardware, which is the safe
   direction to be wrong in — a hardware machine wrongly called software loses a number, whereas
   software wrongly called hardware publishes a fictional budget. */
const SOFTWARE = /swiftshader|llvmpipe|software/i.test(RENDERER);

/* PRINTED ON THE FRAME, not only in the report. A reader looking at the picture must be able to see
   that it is showing five of nine. */
{
  const el = document.createElement('div');
  /*
   * ON A PLATE, AND THE PLATE IS A CONTRAST FIX RATHER THAN A STYLING ONE.
   *
   * These three lines are UNBLURRED and at full opacity, and all three still failed WCAG AA: measured
   * against the rendered sky behind them, `3D PROGRAMME · 9 ENVIRONMENTS` came out at 3.82:1, `STATE
   * DERIVED FROM EACH README AT BUILD TIME` at 3.98:1, and the amber `4 NOT SHOWN` line — the one thing
   * on the picture stopping it from over-claiming, and the line the comment above calls the reason a
   * reader can see it is showing five of nine — at 3.60:1, against a 4.5:1 requirement. The cause is not
   * the colours: it is that they sit on a mid-slate gradient. `rgba(4,6,11,0.82)` under them, the same
   * device E7's HUD already uses, takes all three over 4.5:1 without moving a single hex.
   *
   * `pointer-events:auto` for the same reason as the panels: this is text a reader should be able to copy.
   */
  el.style.cssText = 'position:absolute;left:16px;top:14px;display:flex;flex-direction:column;gap:5px;'
    + 'font:500 10.5px/1.4 ui-monospace,monospace;letter-spacing:.05em;'
    + 'background:rgba(4,6,11,0.82);padding:9px 11px;border-radius:5px;'
    + 'pointer-events:auto;user-select:text;-webkit-user-select:text';
  /* textContent per line — `AVAILABLE`, `OMITTED` and their counts are derived from files, so the same
     argument as the panels applies: see `textLine`. */
  el.appendChild(textLine(
    'color:#8FB7FF;font-weight:600;letter-spacing:.15em',
    `3D PROGRAMME · ${AVAILABLE.length} ENVIRONMENTS`,
  ));
  el.appendChild(textLine(
    'color:rgba(196,212,240,0.8)', 'STATE DERIVED FROM EACH README AT BUILD TIME',
  ));
  if (OMITTED.length) {
    el.appendChild(textLine(
      'color:#E0A94A', `${OMITTED.length} NOT SHOWN — ONLY 5 PANELS: ${OMITTED.join(' ')}`,
    ));
  }
  overlay.appendChild(el);
}

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

const report = {
  /* WHICH TIER THIS FRAME IS, so the numbers beside it describe a configuration a reader can reconstruct.
     A tier that cannot be reported is a tier that cannot be trusted. */
  tier: Q.tier,
  tierDprScale: Q.dprScale,
  /* The tier SCALES this environment's own baseline (1536) rather than replacing it — the
     ladder must not change what the frame looks like at its highest tier. */
  tierShadowMapSize: shadowMapSizeFor(TIER, 1536),
  shadowBaseline: 1536,
  /* Empty means every brand hex round-tripped exactly through this frame's own pipeline. */
  brandFidelity: brandFailures,
  dof: DOF_ON,
  ao: AO_ON,
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),
  focusPanel: subject.id,
  focusDistance: Number(focusDistance.toFixed(2)),
  panels: surveyed,
  projections,
  /* Derived, so a stale row is impossible; and the omission is a field rather than a silence. */
  environments: AVAILABLE,
  environmentsShown: PANEL_SLOTS,
  environmentsOmitted: OMITTED,
  deck,
  glError: gl.getError(),
  triangles: tris,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  /* THE VALUE MEASURED, NOT THE VALUE ASKED FOR. `frames` used to report the raw parameter while the loop
     ran `Math.max(1, FRAMES)`, so `frames=0` and `frames=-5` published a single-frame time as a 0-frame
     and a -5-frame sweep. */
  frames: timing.measured,
  framesRequested: FRAMES,
  sweepTruncated: timing.measured < FRAMES,
  paramClamps,
  msPerFrame: Number(ms.toFixed(3)),
  fps: Math.round(1000 / ms),
  /*
   * HEADROOM REFUSES ON A SOFTWARE RASTERISER, and reporting it was the second half of the same
   * mistake as the broken timer.
   *
   * SwiftShader is a CPU rasteriser. Comparing its frame time to a 60 Hz budget is not a
   * conservative estimate of anything — it measures a machine nobody ships on, and the ratio to real
   * hardware is not a constant (E0 measured 1.305 ms on an M1 for a scene SwiftShader takes tens of
   * milliseconds over). So the budget comparison is REFUSED with a code rather than computed, exactly
   * as absent data refuses everywhere else in this codebase.
   *
   * The frame time itself is still reported, because it IS a real measurement — of SwiftShader.
   */
  renderer: RENDERER,
  rendererClass: SOFTWARE ? 'software' : 'hardware',
  headroom: SOFTWARE ? null : Number((16.6 - ms).toFixed(3)),
  headroomRefusal: SOFTWARE ? 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET' : null,
  /* Real-hardware timing for this environment is UNMEASURED. E0's and E8's M1 figures came from
     manual browser sessions on real hardware; this harness has only ever run under SwiftShader. */
  hardwareMsPerFrame: null,
};
(globalThis as unknown as { E1: typeof report }).E1 = report;
log.textContent = JSON.stringify(report, null, 2);
frame();
fallback.markRendered();
document.title = 'READY';
