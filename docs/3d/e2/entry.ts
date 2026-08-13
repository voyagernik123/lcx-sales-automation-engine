/**
 * E2 · THE GLOBE — partner and listing geography as a place instead of a projection.
 *
 * `3D_VFX_1000X.md` §2 E2: "Rotating earth, extruded arcs for every partner and listing corridor,
 * city bloom, terminator line, atmospheric scatter at the limb." §2 also puts E2 among the three a
 * stranger sees, so it comes early.
 *
 * ── BUILT ON @lcx/gl, WHICH IS NOT WHAT §3.1 RECOMMENDED ─────────────────────────────
 * §3.1 argued for shipping E2 on a lazy three.js chunk, because earth geometry, great-circle arcs
 * and atmospheric scattering are solved and heavily tuned there. This harness answers a narrower
 * question first: how much of E2 the primitives we already have can actually carry. The value of
 * doing it this way is that what is MISSING stays visibly missing rather than being borrowed —
 * see the list below, which is the input to that byte decision rather than a workaround for it.
 *
 * ── WHAT IS REAL HERE AND WHAT IS NOT ───────────────────────────────────────────────
 *   REAL   sphere earth, a shell that brightens at the limb, twelve sited cities, an orbital ring
 *          in polished metal, one key light producing a genuine day/night terminator, shadow map,
 *          depth prepass, SSAO, environment reflections, depth of field.
 *   REAL   DOM labels projected from the frame's own matrix and occluded against the globe: at this camera
 *          seven of the twelve sites are labelled and the other five are stated in prose under the frame,
 *          because a label over the near hemisphere pointing at a city on the far side is worse than no
 *          label. §6 rule 4, which this harness was the last environment to break — see THE DOM LAYER.
 *   ABSENT  continents, and this is the largest gap. `LIT_FRAG` has no texture sampler and
 *          `Material` carries no map of any kind, so the earth is a plain blue ball. Without an
 *          albedo the twelve sited markers cannot be READ as geography by anyone looking at them —
 *          the siting is correct and it is not yet legible.
 *   ABSENT  the corridor arcs. Extruded great-circle arcs need a tube-along-a-path generator that
 *          `env/mesh.ts` does not have, and faking them with straight cylinders between two cities
 *          would draw a chord THROUGH the earth — a wrong answer, not a rough one. Named in the
 *          report as a spine request rather than approximated here.
 *   ABSENT  bloom. The city markers are lifted into HDR by ambient gain and the present pass tone
 *          maps them, but `look/pipeline.ts` (bright pass, four blurs, composite) is not wired in,
 *          so a marker glows without spilling light into the pixels around it.
 *   ABSENT  rotation. §6 rule 2 forbids idle animation and a globe that turns forever is exactly
 *          that; whether the product surface spins is a decision for the surface, not for a
 *          capture harness. The sub-solar point and the central meridian are DECLARED below, so
 *          the frame's geography is a stated fact rather than a camera that happened to stop here.
 */
import {
  createStage, isStage, sphere, torus, arcTube, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion, createDepthOfField,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, assertBrandFidelity, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal,
  QUALITY_TIERS, qualitySettings, shadowMapSizeFor, type QualityTier,
} from '@lcx/gl';
import { installFlatFallback } from '../_shared/flatFallback.js';

const params = new URLSearchParams(location.search);
/* The atmosphere shell is the one element whose contribution is impossible to judge from the lit
   capture alone — the limb rim it produces sits exactly where a sphere's own Fresnel falloff is
   strongest. `no-atmos.png` is the control that separates the two. */
const ATMOS_ON = params.get('atmos') !== '0';
/* The ring's shadow band on the sphere is the only cue that the ring is a physical object at a
   distance rather than an ellipse drawn over the globe, and a soft band is easy to mistake for
   ordinary terminator falloff. `no-shadow.png` is the control that tells them apart. */
const SHADOW_ON = params.get('shadow') !== '0';
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

/* THE TIER HAD NO REACH HERE. This harness ran ambient occlusion and depth of field unconditionally, so
   `?tier=minimum` could only shrink the shadow map — the audit's `tier drives` column read "shadow" and its
   saving was whatever a smaller depth texture happened to buy. Both passes are now gated, composed with the
   tier by AND so a control can turn an effect off and never on. */
const AO_ON = params.get('ao') !== '0' && Q.ao;
const DOF_ON = params.get('dof') !== '0' && Q.dof;
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
 * `msPerFrame` came out NaN and serialised to null — indistinguishable from this programme's refusal
 * convention, on a page still titled READY.
 *
 * So every numeric parameter goes through one parser that refuses a non-number BY NAME and records a
 * clamp instead of applying it silently. The refusal is taken after the flat fallback is installed, so
 * the reader is told which parameter they mistyped.
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
/* BOUNDED AT BOTH ENDS. The lower bound stops `frames=0` and `frames=-5` publishing a one-frame time as
   an n-frame sweep; the upper bound stops the count being absurd. Neither is what makes `?frames=1e9`
   survivable — the wall clock in `measure` is. */
const FRAMES = Math.trunc(numParam('frames', 300, 1, 20000));
const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;

const HUB = { lat: 47.14, lon: 9.52 };

/*
 * ANGULAR SEPARATION FROM THE HUB, hoisted out of the fallback's row builder so ONE expression serves
 * both the table and the report.
 *
 * It is in the report because the README's corridor claim is "lift scales with angular distance", and
 * until now the report carried only the lift — so the capture could confirm half a claim. A `function`
 * declaration rather than a const arrow: it is called from the fallback spec above its own position in
 * the file, and only a declaration hoists.
 */
function separationDeg(latDeg: number, lonDeg: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const cosw = Math.sin(toRad(HUB.lat)) * Math.sin(toRad(latDeg))
    + Math.cos(toRad(HUB.lat)) * Math.cos(toRad(latDeg)) * Math.cos(toRad(lonDeg - HUB.lon));
  return (Math.acos(Math.min(1, Math.max(-1, cosw))) * 180) / Math.PI;
}
const CORRIDORS: ReadonlyArray<{ readonly to: string; readonly lat: number; readonly lon: number }> = [
  { to: 'London', lat: 51.51, lon: -0.13 },
  { to: 'New York', lat: 40.71, lon: -74.01 },
  { to: 'Chicago', lat: 41.88, lon: -87.63 },
  { to: 'Dubai', lat: 25.20, lon: 55.27 },
  { to: 'Singapore', lat: 1.35, lon: 103.82 },
  { to: 'Tokyo', lat: 35.68, lon: 139.65 },
  { to: 'Johannesburg', lat: -26.20, lon: 28.04 },
];


/*
 * §6 RULE 1 — the flat fallback, which is a DIFFERENT job from rule 4 and was once doing rule 4's.
 *
 * While this harness projected no labels the fallback table was the only place the city names,
 * coordinates and corridor distances existed at all, and that was named here as a partial answer to the
 * rule 4 violation. It is not one any more: THE DOM LAYER below projects real labels from the frame's own
 * matrix, so rule 4 is satisfied on the frame and this table is back to being what rule 1 asks for — the
 * surface a reader gets when there is no frame.
 *
 * What the flat view cannot carry is the whole point of the globe: that a corridor's arc height rises
 * with distance, that three endpoints are behind the limb, and that two desks are on the night side.
 */
/*
 * DECLARED BEFORE IT IS ASSIGNED. `fallbackRef = fallback` sits above the stage on purpose, and the `let`
 * was 44 lines BELOW it — a temporal-dead-zone throw at module evaluation that the captures did not catch
 * because esbuild's output happened to survive it. Found only once `type-check:3d` began covering this
 * harness at all; six of the nine were checked by nothing.
 *
 * `die` itself can stay where it is: a `function` declaration hoists, and only a declaration returning
 * `never` gives the compiler the control-flow narrowing the resource handoffs depend on.
 */
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;

const fallback = installFlatFallback({
  title: 'E2 · The Globe — corridors from Vaduz',
  readsAs: 'The rendered view states reach as arc height and time-of-day as a terminator, so which '
    + 'desks are awake and how far each corridor travels are read from the geometry. This table gives '
    + 'the same endpoints as numbers, and no reach and no daylight.',
  notices: ['Coordinates are real. Corridor set is illustrative.'],
  columns: [
    { key: 'to', label: 'Corridor to' },
    { key: 'lat', label: 'Lat', numeric: true },
    { key: 'lon', label: 'Lon', numeric: true },
    { key: 'sep', label: 'Great-circle separation', numeric: true },
  ],
  rows: CORRIDORS.map((c) => ({
    to: c.to, lat: c.lat.toFixed(2), lon: c.lon.toFixed(2),
    sep: `${separationDeg(c.lat, c.lon).toFixed(1)}°`,
  })),
});
fallbackRef = fallback;
/* Refused HERE rather than where the parameter is parsed, because the fallback has to exist first —
   see `numParam`. A bad parameter is named to the reader instead of being reported as a driver fault. */
if (badParams.length > 0) {
  die(`BAD_PARAM: ${badParams.join(', ')} — not a number, so the view was refused rather than drawn `
    + 'from a nonsensical value. Nothing about the coordinates below has changed; correct the URL '
    + 'and reload.');
}
if (params.get('refuse') === '1') {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The three-dimensional view is not being drawn.');
}

const out = createStage(canvas, { alpha: false });
/*
 * THROUGH `die`, NOT `document.title = 'REFUSED'; throw`, AND THAT IS THE ONLY PATH A REAL READER TAKES.
 *
 * The old two-statement ladder set the title and threw. It never called `showRefusal`, which is the ONLY
 * code that names a refusal in the flat table and the only code that HIDES the dead canvas. Measured in a
 * browser with WebGL2 genuinely unavailable: title REFUSED, a 1200x720 `display:block` canvas above the
 * data, `#lcx-fallback .refusal` = null, and `#log` an EMPTY STRING — because the old ladder wrote to a
 * `log` const declared twenty lines further down and threw before it existed. The reader got seven rows of
 * unexplained table under a dead rectangle.
 *
 * `?refuse=1` could never catch it: that switch is handled five lines above, so the audit's "no WebGL"
 * pass never reaches this branch at all.
 */
if (!isStage(out)) die(`stage: ${out.code} — ${out.reason}`);
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
/* Declared `never` — a function, not E8's arrow — so control flow provably stops here. */
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


/*
 * UNWRAP AT CREATION, NOT AT A GUARD FURTHER DOWN.
 *
 * Every `create*` returns a resource OR a `StageRefusal`, and E8 separates the two with a row of
 * `if ('kind' in x) die(...)` guards. That reads well and it does not type: narrowing a
 * module-scope const does not reach inside `frame`, because a closure does not inherit
 * control-flow analysis. E8 therefore has thirteen type errors that nothing ever hits, since these
 * harnesses go through esbuild and are never typechecked. Refusing at the point of creation gives
 * the frame loop handles that are already the resource type, and this file checks clean under the
 * gl package's own strictness.
 */
function need<T extends object>(what: string, r: T | StageRefusal): T {
  if ('kind' in r) die(`${what}: ${refusal(r)}`);
  return r;
}

const present = need('present', stage.compile(PRESENT_VERT, PRESENT_FRAG));
const lit = need('lit', createLitRenderer(stage));
const target = need('target', createTarget3D(stage, W, H));
const shadow = need('shadow', createShadowMap(stage, shadowMapSizeFor(TIER, 1024)));
const skyBox = need('sky', createSkyBackdrop(stage));
const ao = need('ao', createAmbientOcclusion(stage, W, H));
const dof = need('dof', createDepthOfField(stage, W, H));

const RAD = Math.PI / 180;
const EARTH_R = 1.0;
const ATMOS_R = 1.06;
const RING_R = 1.38, RING_TUBE = 0.026;
const CITY_R = 0.034;

/**
 * GEOGRAPHIC TO WORLD — and it has to agree with `sphere()`'s own parameterisation, or a marker
 * sits above or below the surface it is supposed to be ON.
 *
 * `env/mesh.ts` builds a UV sphere whose polar axis is Y: a vertex at polar angle phi has
 * y = cos(phi), with phi = 0 at the north pole. Latitude is measured from the equator instead, so
 * phi = 90 - lat and y = cos(90 - lat) = sin(lat). What is left of the radius is cos(lat), and
 * longitude is the angle around Y measured from +X toward +Z — which fixes lon 0 (Greenwich) on
 * the +X axis and lon +90 on +Z.
 *
 *     x = r · cos(lat) · cos(lon)
 *     y = r · sin(lat)
 *     z = r · cos(lat) · sin(lon)
 *
 * The camera azimuth that brings a chosen meridian to the middle of the frame falls out of the
 * same convention: `eyeOf` puts the eye on horizontal bearing (sin az, cos az), which matches
 * (cos lon, sin lon) when az = 90 - lon. Every position in this file comes from this function.
 * Nothing is nudged by eye afterwards — a hand-placed dot is correct for one camera and silently
 * wrong for the next.
 */
function geoToWorld(latDeg: number, lonDeg: number, r: number): [number, number, number] {
  const lat = latDeg * RAD, lon = lonDeg * RAD;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon)];
}

/**
 * THESE ARE PLACEHOLDER SITES, AND THAT MATTERS.
 *
 * The coordinates are real city coordinates; the claim that these twelve are LCX's partner and
 * listing corridor is NOT — no such list is an input to this harness, and inventing one and
 * presenting it as geography would be the exact failure this repo refuses elsewhere. What is being
 * proven here is the SITING MECHANISM: swapping in the real corridor is an edit to this array and
 * nothing else. Vaduz is the one entry that is not a placeholder.
 *
 * A single fixed camera sees one hemisphere, so the twelve are drawn from a span the frame can
 * actually show. The report states how many are front-facing rather than assuming it.
 */
const CITY_SITES: ReadonlyArray<{ readonly name: string; readonly lat: number; readonly lon: number }> = [
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Vaduz', lat: 47.14, lon: 9.52 },
  { name: 'Istanbul', lat: 41.01, lon: 28.98 },
  { name: 'Dubai', lat: 25.20, lon: 55.27 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Lagos', lat: 6.52, lon: 3.38 },
  { name: 'Nairobi', lat: -1.29, lon: 36.82 },
  { name: 'Johannesburg', lat: -26.20, lon: 28.04 },
  /*
   * THE ORIGINAL EIGHT ALL SAT BETWEEN -0.13 AND 72.88 LONGITUDE, and with a sub-solar point at 95
   * that put every single one on the day side: the harness reported citiesSunlit 8 and onNightSide
   * empty, which makes the terminator a gradient rather than a reading. These four span the rest of
   * the globe, so the line now separates desks that are awake from desks that are not — which is
   * the whole reason a terminator is on a business globe at all.
   */
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'Chicago', lat: 41.88, lon: -87.63 },
  { name: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Tokyo', lat: 35.68, lon: 139.65 },
];

/*
 * THE CORRIDORS — §2 E2's actual payload, and what its absence made the first capture decoration.
 *
 * A hub-and-spoke from Vaduz, which is where LCX actually is. Every arc is therefore a real claim
 * about a route rather than a decorative curve, and the set reads as a reach map: the long
 * transatlantic and Asian legs climb high, the intra-European hops stay low, because `arcTube`
 * scales lift with angular distance.
 */

/* THE SUN IS DECLARED AS A SUB-SOLAR POINT, not as a direction vector, because that is what a
   terminator actually is: the great circle 90 degrees from the point the sun is overhead. Stating
   it in lat/lon makes the day/night line in the capture a checkable consequence of two numbers.
   lon 95 against a central meridian of 30 puts the terminator roughly half a disc-radius from the
   centre of the frame — near enough to read as a hard line, far enough that the lit side is still
   most of the globe. */
/*
 * SUB-SOLAR lon 60, CENTRAL MERIDIAN -15 — chosen so the terminator crosses the VISIBLE disc with
 * corridors on both sides. At 95/30 the night side was centred near lon -120, just off the edge of
 * what the camera sees, so `onNightSide` stayed empty no matter how many cities were added and the
 * day/night line was a gradient rather than a reading. A terminator with nothing behind it is
 * decoration; this is the pair of numbers that makes "which desks are awake" answerable.
 */
const SUB_SOLAR = { lat: 18, lon: 60 };
const CENTRAL_MERIDIAN = -15;  // see SUB_SOLAR: this pair is what puts the terminator on-disc

const SUN: [number, number, number] = geoToWorld(SUB_SOLAR.lat, SUB_SOLAR.lon, 1);
// `lightDir` is the direction light TRAVELS, so it is the sun direction negated.
const lightDir: [number, number, number] = [-SUN[0], -SUN[1], -SUN[2]];

const earthGeo = sphere(EARTH_R, 64, 96);
/* The shell is built AT 1.06 rather than scaled up from the earth's geometry: a scale in the model
   matrix would also scale the tangents and the shadow-frustum reasoning below, for no saving. */
const atmosGeo = sphere(ATMOS_R, 56, 84);
const ringGeo = torus(RING_R, RING_TUBE, 168, 20);
const cityGeo = sphere(CITY_R, 14, 20);

/* Four named uploads rather than a mapped array: mapping then destructuring gives four values that
   the type system only knows as possibly-undefined, and the casts needed to get back to a MeshBuffer
   are exactly the kind of assertion that hides a real refusal. */
const earthMesh = need('earth mesh', uploadMesh(stage, earthGeo));
const atmosMesh = need('atmosphere mesh', uploadMesh(stage, atmosGeo));
const ringMesh = need('ring mesh', uploadMesh(stage, ringGeo));
const cityMesh = need('city mesh', uploadMesh(stage, cityGeo));

/* One tube per corridor. Each is its own geometry because the lift and the path differ per route —
   there is nothing to instance. 96 segments keeps a transatlantic arc smooth at this camera. */
const corridorGeos = CORRIDORS.map((c) => arcTube(HUB.lat, HUB.lon, c.lat, c.lon, EARTH_R, 0.016, 0.20, 128, 12));
const corridorMeshes = corridorGeos.map((g, i) => need(`corridor ${CORRIDORS[i]!.to}`, uploadMesh(stage, g)));

const at = (x: number, y: number, z: number): Float32Array => {
  const m = IDENTITY(); m[12] = x; m[13] = y; m[14] = z; return m;
};
const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/*
 * THE ATMOSPHERE SHELL IS DRAWN INSIDE-OUT, AND THAT IS THE WHOLE TRICK.
 *
 * `lit.ts` calls gl.disable(BLEND) — every surface in this renderer is opaque. An opaque sphere at
 * 1.06 drawn the normal way would hide the earth completely, so the shell is given a model matrix
 * with a NEGATIVE determinant (mirror in x). The mirror maps the sphere onto itself, but it flips
 * triangle winding, so the renderer's fixed back-face culling now keeps the FAR hemisphere and
 * discards the near one. The far hemisphere loses the depth test to the earth everywhere the earth
 * covers it, which leaves exactly one thing on screen: an annulus at the limb.
 *
 * What lights that annulus is grazing-angle Fresnel. Its normals point away from the eye, so
 * NdotV clamps to nearly zero, Schlick returns nearly 1, and the high roughness spreads the
 * response — bright where the limb is also sunlit, dim on the night side.
 *
 * ── THIS IS A STAND-IN AND NOT SCATTERING ───────────────────────────────────────────
 * Real atmospheric scattering is a VOLUMETRIC integral along the view ray: optical depth through a
 * density that falls off exponentially with height, Rayleigh and Mie phase functions, and a second
 * integral toward the sun for in-scattered light. `3D_VFX_1000X.md` §4 lists that as L2.9 and it
 * does not exist. This shell has the right silhouette and roughly the right brightness gradient,
 * and it gets both from a surface reflection. It is not scattering, it will not respond to a
 * changing sun angle the way scattering does, and it cannot produce forward-scatter glow on the
 * night side at all.
 *
 * The inverse-transpose of a mirror is the mirror, so the normal matrix flips with it.
 */
const ATMOS_MODEL = (() => { const m = IDENTITY(); m[0] = -1; return m; })();
const ATMOS_NM = new Float32Array([-1, 0, 0, 0, 1, 0, 0, 0, 1]);

/*
 * THE SKY IS RE-AIMED AT THE PLATFORM'S PLATE, AND THE FIRST CAPTURE IS WHY.
 *
 * `DEFAULT_SKY` is documented as a dark instrument interior and it is right for E8, where a floor
 * plate fills the frame and only a strip of backdrop shows. Here the backdrop IS the frame, and at
 * its horizon stop it encodes to roughly (76, 88, 107) — a mid-slate field. A globe on mid-slate
 * reads as a product shot on a studio sweep, not as a globe.
 *
 * So the three stops are scaled from the platform's own plate colour, #0E1628. That hex is not
 * decoration: at plate-level radiance the Reinhard shoulder is within a percent of identity, so a
 * stop set to plate LINEAR survives the present pass to within half a code value. The camera looks
 * 18 degrees DOWN, which puts the horizon stop above the top edge, so the visible field is the
 * lower half of the gradient — measured (20, 29, 51) at the top edge falling to (6, 10, 22) at the
 * bottom, crossing the plate's own (14, 22, 40) near mid-height. A globe dropped onto a dark page
 * therefore has no bright seam behind it.
 *
 * NOT FLAT, though the flat version would match the plate exactly. `sky.ts` earns its keep by
 * being the same function for the backdrop AND for every reflection, and a constant environment
 * gives a metal nothing to catch — which is the defect E0 found when its metal came out black. The
 * lift through the middle band is what puts a highlight on the ring.
 *
 * ONE OBJECT, PASSED TO BOTH. The backdrop and the material read the same uniforms, so handing a
 * custom sky to one and the default to the other is how a reflection ends up disagreeing with the
 * sky it is reflecting.
 */
const PLATE = hexToLinear('#0E1628');
const fromPlate = (k: number): [number, number, number] => [PLATE[0] * k, PLATE[1] * k, PLATE[2] * k];
const SKY = { zenith: fromPlate(0.55), horizon: fromPlate(1.6), ground: fromPlate(0.35) };

/* Roughness 0.58 rather than the 0.42 this started at. At 0.42 the key light left a broad bright
   blob on the daylit hemisphere and the earth read as a shiny plastic ball — the most obvious tell
   in the first capture. An ocean does glint, but a planet-wide glint is a wide, weak one. */
const EARTH_MAT = { baseColour: hexToLinear('#0B2B5C'), roughness: 0.58, metalness: 0.06 };
const ATMOS_MAT = { baseColour: hexToLinear('#7FB2FF'), roughness: 0.86, metalness: 0.0 };
/* Steel rather than brand blue: the globe already owns the blue, and a metal hierarchy needs the
   ring to read as a different MATERIAL rather than as a brighter version of the same one.
   Anisotropy 0.8 stretches the highlight along the ring — `torus()` supplies that tangent
   analytically, which is why the bar of light follows the tube instead of crossing it. */
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
const RING_MAT = { baseColour: hexToLinear('#8FA3C4'), roughness: 0.3742, metalness: 0.95, anisotropy: 0.8 };
const CITY_MAT = { baseColour: hexToLinear('#2C6BFF'), roughness: 0.5, metalness: 0.0 };
/* Anisotropy 0.85 with `arcTube`'s along-the-path tangent, so the highlight runs DOWN the corridor.
   An isotropic tube bands into rings and reads as a ribbed hose rather than a lit route. */
const CORRIDOR_MAT = { baseColour: hexToLinear('#4C86FF'), roughness: 0.469, metalness: 0.85, anisotropy: 0.85 };

/* Markers are centred ON the surface, so half of each sphere is buried. A marker floated clear of
   the surface reads as a pin hovering over the planet and casts a detached shadow; half-buried, it
   reads as a light at that place. */
const cities = CITY_SITES.map((c) => {
  const n = geoToWorld(c.lat, c.lon, 1);
  const p = geoToWorld(c.lat, c.lon, EARTH_R);
  return { ...c, normal: n, draw: { mesh: cityMesh, model: at(p[0], p[1], p[2]), normalMat: NM, material: CITY_MAT } };
});

const earthDraw: LitDraw = { mesh: earthMesh, model: at(0, 0, 0), normalMat: NM, material: EARTH_MAT };
const atmosDraw: LitDraw = { mesh: atmosMesh, model: ATMOS_MODEL, normalMat: ATMOS_NM, material: ATMOS_MAT };
const ringDraw: LitDraw = { mesh: ringMesh, model: at(0, 0, 0), normalMat: NM, material: RING_MAT };
const cityDraws: LitDraw[] = cities.map((c) => c.draw);
const corridorDraws: LitDraw[] = corridorMeshes.map((m) => ({
  mesh: m, model: at(0, 0, 0), normalMat: NM, material: CORRIDOR_MAT,
}));

/* The body of the scene. Cities are held back for a second pass — see AMBIENT below. */
const bodyDraws: LitDraw[] = ATMOS_ON ? [earthDraw, atmosDraw, ringDraw] : [earthDraw, ringDraw];

/*
 * THE SHELL IS NOT A SHADOW CASTER, and leaving it out is a correctness fix rather than a saving.
 *
 * `shadowPass` culls FRONT faces to push depth to the far side of each object. Applied to the
 * mirrored shell that inverts back to the hemisphere FACING the light, so the shell would write a
 * full disc of depth in front of the earth and shadow the entire daylit face. An atmosphere does
 * not cast a hard shadow on its own planet either way.
 */
const shadowCasters: LitDraw[] = [earthDraw, ringDraw, ...cityDraws, ...corridorDraws];
/* Everything that will be shaded must be in the prepass, or LEQUAL rejects it. `DEPTH_VERT` is
   bit-identical to `LIT_VERT`'s transform on purpose, so the two agree to the last bit. */
const depthDraws: LitDraw[] = [...bodyDraws, ...cityDraws, ...corridorDraws];

/*
 * NO GROUND PLANE, so what does the shadow map do?
 *
 * E8 needed a floor to catch its shadow. A globe hangs in space and a floor under it would be a
 * lie about where it is. The shadow map still earns its place because the scene shadows ITSELF:
 * the orbital ring at 1.38 lies outside the earth, and with the sun 18 degrees above the
 * equatorial plane a band of that ring projects onto the sphere. That shadow band is the cue that
 * tells the eye the ring is a physical object at a distance rather than a circle drawn on top.
 */
const view: Viewpoint = {
  target: [0, 0, 0], distance: 5.4,
  azimuthDeg: 90 - CENTRAL_MERIDIAN, elevationDeg: 18, fovDeg: 30,
};
const RING_OUTER = RING_R + RING_TUBE;
const sceneMin: [number, number, number] = [-RING_OUTER, -ATMOS_R, -RING_OUTER];
const sceneMax: [number, number, number] = [RING_OUTER, ATMOS_R, RING_OUTER];
const centre = boundsCentre(sceneMin, sceneMax);
/* `boundsRadius` measures the AABB's diagonal, which for a sphere-and-ring scene overstates the
   real extent by 60 percent — the geometry never leaves a bounding sphere of RING_OUTER. The
   generous number is right for the light's stand-off distance and wrong for the shadow frustum,
   where wasted extent is wasted texels, so the two are set separately. */
const standOff = boundsRadius(sceneMin, sceneMax);
const SHADOW_EXTENT = RING_OUTER * 1.05;

const tris = triangleCount(earthGeo) + triangleCount(ringGeo)
  + (ATMOS_ON ? triangleCount(atmosGeo) : 0) + triangleCount(cityGeo) * cities.length;
const near = Math.max(0.01, view.distance / 100);
const far = Math.max(near + 1, view.distance * 8);

/*
 * AMBIENT IS A PER-PASS UNIFORM, WHICH IS WHY THE CITIES ARE A SECOND DRAW CALL.
 *
 * `Material` has baseColour, roughness, metalness and anisotropy. It has no emission channel, and
 * `uAmbientGain` is set once per `lit.draw`. So the only way to make a marker read as a light
 * source with the renderer as it stands is to draw the markers in their own pass at a much higher
 * gain. Depth is already resolved by the prepass, so the second pass costs twelve small spheres of
 * fill and nothing else.
 *
 * 140 IS NOT A TUNED NUMBER, it is a ratio, and it is worth stating what it is a ratio of. A
 * marker's only light is the sky reflected off it, the sky now sits at plate level, and brand blue
 * against the middle of that gradient returns about 0.021 of linear radiance. Reaching the ~3.0
 * that encodes at the top of the blue channel therefore costs a factor of 140. The size of that
 * number IS the missing emission channel, and it has a second symptom: because the glow is a
 * reflection, a marker's brightness varies slightly with the sky gradient at its own latitude, so
 * twelve identical cities are not quite identically bright. Filed as a spine request.
 *
 * BODY_AMBIENT stays low. A brighter one would lift the night hemisphere, and the night side of a
 * planet IS dark — what makes it read in real imagery is city lights, which is a texture channel
 * this renderer does not have either. The twelve markers are the stand-in for it.
 */
const BODY_AMBIENT = 1.6;
const CITY_AMBIENT = 140;

function frame() {
  const lightVP = lightViewProjection(
    { direction: lightDir, colour: [1, 1, 1], extent: SHADOW_EXTENT }, centre, standOff,
  );
  const vp = viewProjection(view, W / H);
  const eye = eyeOf(view);

  lit.shadowPass(lightVP, shadowCasters, shadow);

  target.bind();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  skyBox.draw({ eye, target: view.target, fovDeg: view.fovDeg ?? 34, aspect: W / H, sky: SKY });
  lit.depthPrepass(vp, depthDraws);
  if (AO_ON) {
    ao.compute({
    depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 34, aspect: W / H,
    radius: 0.35, strength: 1.1,
  });
    /* AO binds its OWN half-res framebuffer, so the scene target must be rebound INSIDE the
       gate. Rebinding unconditionally would be harmless; leaving it outside and skipping the
       compute would render the rest of the frame into AO's half-res buffer. */
    target.bind();
  }


  const common = {
    viewProj: vp, eye, lightDir,
    /* Warm sun against the cool sky in `sky.ts`. The colour separation is doing real work: it is
       what distinguishes the daylit hemisphere from the ambient-lit one, and a neutral white key
       against a blue ambient reads as an exposure difference instead of as sunlight. */
    lightColour: [6.6, 6.2, 5.5] as [number, number, number],
    sky: SKY,
    /* A null shadow map is FULLY LIT in `lit.ts`, never fully shadowed, so the control is a
       genuine no-shadow render rather than a black frame. */
    lightVP, shadow: SHADOW_ON ? shadow : null, shadowStrength: 0.92, shadowTaps: Q.shadowTaps, shadowBaseline: 1024,
    ao: ao.texture, screenSize: [W, H] as [number, number],
  };
  lit.draw({ ...common, ambientGain: BODY_AMBIENT, draws: bodyDraws });
  /* Corridors get their OWN ambient, between the body's and the cities'. They are the payload, so
     they must stay legible where they cross the night side — but lifting them as far as the city
     markers would make the route louder than its endpoints, which inverts the reading. */
  lit.draw({ ...common, ambientGain: (BODY_AMBIENT + CITY_AMBIENT) / 2, draws: corridorDraws });
  lit.draw({ ...common, ambientGain: CITY_AMBIENT, draws: cityDraws });

  /*
   * FOCUS ON THE GLOBE CENTRE — which is a point INSIDE the subject, and the arithmetic is worth
   * stating because it decides the aperture.
   *
   * `dof.ts` computes the circle of confusion as |1/focus - 1/z| * aperture, so the aperture's
   * unit is reciprocal-length. At a 5.4-unit focus the near cap of the globe sits at z = 4.34,
   * a reciprocal difference of 0.045 — nearly fifteen times the 0.0031 at the limb. E8's aperture
   * of 7 would pin the near cap at maxCoc and blur the front of the subject flat. 0.12 puts the
   * near cap at about 0.005 UV (six pixels), leaves the limb below the pass's sharp early-out
   * entirely, and softens the far arc of the ring at around four. Soft toward the viewer, crisp at
   * the silhouette: the read a long lens gives a sphere.
   */
  const focus = Math.hypot(eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]);
  /* GATED, and the PRESENTED TEXTURE follows the gate. Applying the lens unconditionally while the
     report says `dof: false` would make the report lie about the frame beside it; presenting
     `dof.texture` when nothing wrote it would show whatever the last resize left there. */
  if (DOF_ON) {
    dof.apply({
      scene: target.texture, depthTexture: target.depthTexture, near, far,
      fovDeg: view.fovDeg ?? 34, aspect: W / H, focusDistance: focus, aperture: 0.12, maxCoc: 0.006,
    });
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, DOF_ON ? dof.texture : target.texture);
  stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
}

frame();

/*
 * WHAT THE CAPTURE ACTUALLY SHOWS, MEASURED RATHER THAN ASSUMED.
 *
 * Twelve markers are placed; a fixed camera sees one hemisphere and a fixed sun lights one. Both
 * counts below are geometry, so they are computed rather than described:
 *
 *   VISIBLE   a point on a sphere of radius r seen from distance d is on the visible cap when
 *             dot(n, eyeDir) > r/d. Using dot > 0 instead is the common error and claims the whole
 *             hemisphere, including the band just past the limb that the horizon hides.
 *   SUNLIT    dot(n, sun) > 0. The terminator is where this crosses zero.
 */
const eye = eyeOf(view);
const eyeLen = Math.hypot(eye[0], eye[1], eye[2]);
const eyeDir: [number, number, number] = [eye[0] / eyeLen, eye[1] / eyeLen, eye[2] / eyeLen];
const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const HORIZON = EARTH_R / eyeLen;
const seen = cities.map((c) => ({
  name: c.name,
  facing: dot3(c.normal, eyeDir) > HORIZON,
  sunlit: dot3(c.normal, SUN) > 0,
}));

/*
 * THE SWEEP HAS A WALL-CLOCK CEILING, AND A FRAME CEILING IS NOT ONE.
 *
 * This loop is synchronous, so an unbounded count is an unbounded main-thread block: `?frames=1e9` left
 * the renderer process unable to service a Playwright evaluation at all — the harness reported a timeout,
 * which names the waiter rather than the loop, and E9's task page polls the same title through an iframe.
 * Clamping the COUNT alone does not fix it: 20000 frames of a scene like this under SwiftShader is over an
 * hour. So the sweep also stops on the clock and reports how many frames it actually timed, because a
 * truncated sweep that says so is a measurement and one that does not is a lie about n.
 */
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
  // Read back once at the end: the driver queues work, and timing without a sync measures the
  // queue rather than the frame.
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { msPerFrame: (performance.now() - t0) / measured, measured };
}

const sweep = measure(FRAMES);
const ms = sweep.msPerFrame;
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

/*
 * Peak lift per corridor, so "does a long haul climb higher than a short hop" is a number in the
 * report rather than an impression from the picture.
 *
 * HOISTED OUT OF THE REPORT because the projected label for a corridor endpoint prints the same lift.
 * Computed twice, the frame and the report could disagree about the same arc — the defect this file
 * already fixed once for `separationDeg`, which serves both the fallback table and the report from one
 * expression.
 */
const corridorPeakLift = corridorGeos.map((g, i) => {
  let m = 0;
  for (let k = 0; k < g.positions.length; k += 3) {
    m = Math.max(m, Math.hypot(g.positions[k]!, g.positions[k + 1]!, g.positions[k + 2]!));
  }
  return {
    to: CORRIDORS[i]!.to,
    lift: Number((m - EARTH_R).toFixed(4)),
    /* The quantity the lift is supposed to scale with. Reported beside it so "monotonic with distance"
       is a check the capture performs rather than a sentence in the README. */
    separationDeg: Number(separationDeg(CORRIDORS[i]!.lat, CORRIDORS[i]!.lon).toFixed(1)),
  };
});

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DOM LAYER — §6 RULE 4, WHICH THIS HARNESS WAS THE LAST ENVIRONMENT TO BREAK.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WAS WRONG WAS NOT BAKED TEXT. IT WAS NO TEXT, and the distinction decides the fix.
 *
 * The standing description of this violation was that E2 bakes its labels into a texture. It does not and
 * it could not: `LIT_FRAG` has no texture sampler and `Material` carries no map of any kind, which is the
 * same absence that leaves the earth a plain blue ball. `build.mjs` simply emitted no overlay, so twelve
 * sited cities and seven corridors carried no words at all — nothing in the accessibility tree, nothing
 * selectable, nothing translatable, nothing in a print. There was no texture to unbake; there was a layer
 * to write.
 *
 * `build.mjs`'s stated reason for the absence is real and is ANSWERED here rather than dismissed: "three
 * of these sites are within eight degrees of each other — at this camera that is ~23 px apart, closer
 * than the labels are wide. Projected text without a collision policy is text that reads as broken, and
 * this harness cannot check its own legibility." So there is a collision policy below, every label that
 * loses a contest is named in the DOM with the reason it lost, and the counts are in the report — which
 * is the part that makes the legibility claim checkable instead of asserted.
 *
 * ── THE HARD PART: A LABEL ON THE FAR SIDE OF A PLANET ──────────────────────────────
 *
 * `project.ts` says it under "WHAT THIS DELIBERATELY DOES NOT DO": CSS has no depth buffer, so a
 * projected element cannot be hidden by GL geometry in front of it. On a globe that is not a nicety.
 * Tokyo is on the far face at this camera — the report already proves it, `behindLimb` is
 * ["Mumbai", "Singapore", "Tokyo"] — and an unguarded projection puts TOKYO in the middle of the
 * Atlantic, over the near hemisphere, pointing at nothing. That is WORSE than the missing label it
 * replaces, because a label that lands on the wrong ocean reads as an address.
 *
 * The guard is one dot product, and it is deliberately THE SAME ONE the report publishes rather than a
 * second opinion about the same geometry. For a sphere of radius R seen from distance L, a surface point
 * with normal n is on the visible cap when n·ê > R/L: `HORIZON` above is that quotient, `seen[].facing`
 * is that comparison, and both are reused here. A label therefore cannot contradict the `behindLimb`
 * list printed beside it.
 *
 * ── AND A BOOLEAN IS NOT ENOUGH AT THE LIMB ─────────────────────────────────────────
 *
 * The same quantity, normalised, is the cosine of the angle between the surface normal and the direction
 * to the eye: cosFace = (L·(n·ê) − R) / |eye − p|. It is exactly 0 at the limb — the view ray is tangent
 * there — and 1 at the sub-view point, so ONE number carries both the hide test and how much to trust the
 * anchor. Two things go wrong as it approaches zero, and both are measurable rather than aesthetic:
 *
 *   1 · THE MARKER FORESHORTENS. Its radial extent on screen is cosFace × its head-on diameter, and a
 *       marker two pixels wide is not an object a label can point at — E4 settled the same argument with
 *       MIN_BODY_PX, on spheres that were merely small rather than edge-on.
 *   2 · SCREEN POSITION COMPRESSES. Near the limb, degrees of latitude move a site by a fraction of a
 *       pixel, so distinct sites pile into the same pixels and an anchor stops identifying which city it
 *       belongs to. A label with an ambiguous anchor is a label on the wrong city.
 *
 * So the threshold is DERIVED from a pixel floor rather than typed in as a dot product. `ANCHOR_FLOOR_PX`
 * is the width below which the marker stops being a thing to point at; the hide threshold is that floor
 * divided by the marker's head-on width at this camera, and full opacity is reached at twice it. Computed
 * for the shipped camera: cosHide 0.2955 and cosFull 0.5911, which are 95.4% and 80.2% of the projected
 * disc radius. Labels are therefore full strength over the inner four-fifths of the disc, fade across the
 * next fifth, and are refused in the outer 5% — and at that boundary the marker is 5.0 px wide, which is
 * the floor, arrived at rather than assumed.
 *
 * The shipped globe (`apps/web/src/components/market/GlobeReliefGl.tsx`) does the same job with
 * `LIMB_DOT = 1 / CAMERA_DISTANCE + 0.05`. The 0.05 is that same margin, chosen by eye; this is the
 * number it was standing in for, and it is reported so a capture can check it.
 *
 * ── WHAT DOES NOT MOVE INTO THE FRAME ───────────────────────────────────────────────
 *
 * Day and night are stated in WORDS on every label, not by tinting it. A colour-coded label loses its
 * meaning in the print path and in greyscale — which is exactly the path rule 4 exists to protect.
 */
const CSS_W = W / SCALE, CSS_H = H / SCALE;
/* THE MATRIX THE FRAME ACTUALLY DRAWS WITH. `view` is a module const and `frame()` recomputes
   `viewProjection(view, W / H)` from it on every call, so this is that expression on those inputs — not a
   camera that merely resembles the renderer's. Positioning DOM content from an approximation of the
   render camera is the failure `project.ts` was written to remove. */
const vpFinal = viewProjection(view, W / H);

/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to the canvas box or it extends the
   PAGE box, and Playwright then fails with "Unable to capture screenshot" — naming the screenshot rather
   than the transform that caused it. E1, E4 and E7 all carry this wrapper for the same reason. */
const wrap = document.createElement('div');
wrap.style.cssText = `position:relative;overflow:hidden;width:${CSS_W}px;height:${CSS_H}px`;
canvas.parentNode?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
const overlay = document.createElement('div');
/* The CONTAINER ignores the pointer so it cannot swallow a gesture aimed at the canvas; each label
   re-enables it and asks for selectable text. An audit of the six projecting environments found
   `elementFromPoint` at the centre of every label returning the canvas and a drag selecting the empty
   string — the words were in the document and unreachable with a mouse, which defeats half of why they
   are in the DOM. */
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);
const SELECTABLE = 'pointer-events:auto;user-select:text;-webkit-user-select:text';

/* Built as elements with `textContent` rather than interpolated into `innerHTML`. City names are data
   here and will be real partner data later; `innerHTML` PARSES its argument, so one `&` or `<` in a place
   name corrupts the label silently on the surface a reader trusts most. */
const textLine = (css: string, text: string): HTMLDivElement => {
  const d = document.createElement('div');
  d.style.cssText = css;
  d.textContent = text;
  return d;
};

/* PIXELS PER WORLD UNIT AT THE GLOBE'S CENTRE, from the camera rather than off a screenshot: the frame
   spans `fovDeg` vertically at `distance`, so half its height is tan(fov/2)·distance world units. */
const PX_PER_WORLD = (CSS_H / 2) / (Math.tan(((view.fovDeg ?? 34) * RAD) / 2) * view.distance);
/* The marker's head-on projected diameter — what the foreshortening below is a fraction OF. */
const MARKER_PX = 2 * CITY_R * PX_PER_WORLD;
/* Five pixels. A marker narrower than this is a leaning sliver, and a label attached to it names a
   smudge rather than a place. It is the one judgement call in this section; everything else is derived
   from it, and it is reported so the judgement is visible rather than buried in a dot product. */
const ANCHOR_FLOOR_PX = 5;
const COS_HIDE = ANCHOR_FLOOR_PX / MARKER_PX;
const COS_FULL = Math.min(1, 2 * COS_HIDE);
/*
 * THE FADE BOTTOMS OUT AT 0.55, NOT AT 0, and the reason is that a 10%-opacity label is not a gentler
 * label — it is an unreadable one that still occupies its pixels and still blocks a competing label from
 * being placed there. Below `COS_HIDE` a label is REFUSED and its text moves into the words under the
 * frame. There is no band in between where the reader is expected to squint.
 */
const LABEL_MIN_OPACITY = 0.55;
/* Clear of the marker's own disc plus four pixels, so the box reads as attached to the marker rather
   than as sitting on it. Derived from the marker's measured width for the same reason as above. */
const GAP_PX = MARKER_PX / 2 + 4;

type Rect = { x: number; y: number; w: number; h: number };
const overlapArea = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/*
 * EVERY BOX IS MEASURED BY THE BROWSER, NOT ESTIMATED FROM A CHARACTER WIDTH. E4 computed label widths
 * as `chars × 6.6`, which is wrong for 9.5 px monospace carrying letter-spacing: the under-estimate made
 * the boxes narrow, a line wrapped, and — worse — the collision test was then certifying an arrangement
 * that did not exist on screen. There is a browser here and it knows the width.
 */
function measured(el: HTMLElement): Rect {
  el.style.left = '-99999px';
  el.style.top = '0px';
  el.style.visibility = 'hidden';
  overlay.appendChild(el);
  const r = el.getBoundingClientRect();
  return { x: 0, y: 0, w: Math.ceil(r.width), h: Math.ceil(r.height) };
}

const lonText = (lon: number): string => (lon >= 0 ? `${lon.toFixed(2)} E` : `${(-lon).toFixed(2)} W`);
const latText = (lat: number): string => (lat >= 0 ? `${lat.toFixed(2)} N` : `${(-lat).toFixed(2)} S`);

/*
 * THE HUB'S NAME IS RESOLVED FROM THE SITE LIST, NOT TYPED A SECOND TIME.
 *
 * `HUB` is the coordinate every corridor starts from and `CITY_SITES` is what gets labelled. They are two
 * declarations of the same place, and if they drift the hub label would silently stop saying "hub" while
 * seven arcs still radiated from that dot — a frame that has lost the one endpoint they all share, with
 * nothing to report it. Refused by name instead.
 */
const hubSite = CITY_SITES.find((c) => c.lat === HUB.lat && c.lon === HUB.lon);
if (hubSite === undefined) {
  die(`HUB_NOT_SITED: no entry in CITY_SITES sits at the hub's ${HUB.lat}/${HUB.lon}, so the origin of `
    + 'all seven corridors would be an unnamed dot. The two declarations of Vaduz have drifted.');
}
const HUB_NAME = hubSite.name;

/*
 * WHAT A LABEL SAYS, and the corridor line is why the lift computation above was hoisted.
 *
 * A corridor's payload is its ENDPOINT, so the arc's peak lift and its angular separation are printed at
 * the place the arc lands rather than at the apex. An apex is not a place: a label floating over the
 * middle of the ocean names no city, and it would compete for pixels with the two labels that do. The hub
 * says how many corridors leave it, which is the one thing it knows that the spokes do not.
 */
const liftByCity = new Map(corridorPeakLift.map((c) => [c.to, c] as const));
const linesFor = (c: { name: string; lat: number; lon: number }, sunlit: boolean): string[] => {
  const lines = [`${latText(c.lat)}  ${lonText(c.lon)}`, sunlit ? 'daylight' : 'night'];
  const corridor = liftByCity.get(c.name);
  if (corridor) lines.push(`corridor from ${HUB_NAME} · ${corridor.separationDeg}° · lift ${corridor.lift}`);
  if (c.name === HUB_NAME) lines.push(`hub · ${CORRIDORS.length} corridors leave here`);
  return lines;
};

/*
 * THE ANCHOR IS THE MARKER'S OUTER CAP, at EARTH_R + CITY_R along the normal, so a label sits beside the
 * lit dot rather than beside the point where the dot is buried. The FACING TEST is taken on the surface
 * point at EARTH_R instead, because that is what `seen[].facing` and `behindLimb` are computed from — a
 * cap peeking a third of a marker-radius over the limb would otherwise be labelled while the report says
 * it is behind it.
 */
const labelPlan = cities.map((c) => {
  const n = c.normal;
  const surface: [number, number, number] = [n[0] * EARTH_R, n[1] * EARTH_R, n[2] * EARTH_R];
  const toEye: [number, number, number] = [eye[0] - surface[0], eye[1] - surface[1], eye[2] - surface[2]];
  const toEyeLen = Math.hypot(toEye[0], toEye[1], toEye[2]) || 1;
  const anchorR = EARTH_R + CITY_R;
  /* ONE evaluation, used by both the label's own words and the fade below. The report's `citiesSunlit`
     comes from `seen`, which is this same `dot3(n, SUN) > 0` on the same normal — so the label and the
     count cannot disagree about whether a desk is awake. */
  const sunlit = dot3(n, SUN) > 0;
  return {
    name: c.name,
    facing: dot3(n, eyeDir) > HORIZON,
    /* Zero exactly at the limb, one at the sub-view point. Both the hide test and the fade read it. */
    cosFace: dot3(n, toEye) / toEyeLen,
    lines: linesFor(c, sunlit),
    at: projectScreen(vpFinal, [n[0] * anchorR, n[1] * anchorR, n[2] * anchorR], CSS_W, CSS_H),
  };
});

/*
 * MARKER DISCS ARE OBSTACLES, and a label may not cover one at all.
 *
 * A marker IS the datum here — twelve of them are the whole reading — and at 16.9 px across there is no
 * "slight" overlap worth allowing. E4 tolerated 12% of a 30–60 px sphere; a tenth of a marker this size
 * is a pixel and a half, so tolerating it buys nothing and costs the reader a dot. The test is a
 * rectangle intersection, which is symmetric by construction: E6's occlusion bug was a
 * corner-containment test that missed a large box covering the MIDDLE of a small one.
 *
 * EVERY DISC IS SIZED HEAD-ON, which OVERSTATES a foreshortened one — Dubai's is 4.3 px wide on screen and
 * is avoided as though it were 16.9. Deliberately conservative: overstating costs a label a place it could
 * have had, understating costs the reader a marker, and only one of those is recoverable.
 *
 * AND THE SET INCLUDES THE MARKERS THIS LAYER REFUSED TO LABEL. Dubai and Chicago get no label because
 * they are too edge-on to point at, but they are still DRAWN, so they are still data another label may
 * not sit on.
 */
const markerDiscs = labelPlan.filter((l) => l.facing && !l.at.behind).map((l) => ({
  name: l.name,
  box: {
    x: l.at.sx - MARKER_PX / 2, y: l.at.sy - MARKER_PX / 2, w: MARKER_PX, h: MARKER_PX,
  } as Rect,
}));

const placedBoxes: Rect[] = [];
const onFrame = (r: Rect): boolean =>
  r.x >= 2 && r.y >= 2 && r.x + r.w <= CSS_W - 2 && r.y + r.h <= CSS_H - 2;

/*
 * THE DECLARATION MOVES ONTO THE FRAME BECAUSE THE NAMES DID.
 *
 * `CITY_SITES` says it plainly: the coordinates are real city coordinates, and the claim that these twelve
 * are LCX's partner and listing corridor is NOT — no such list is an input here. While the frame carried
 * no words that declaration was safe in the fallback's notices, because the picture asserted nothing a
 * reader could quote. It now prints twelve real place names, and twelve real place names on a globe read
 * as somebody's actual network. So the qualification goes where the claim is.
 *
 * AMBER, matching E4's `SYNTHETIC ONTOLOGY`, and pushed into the obstacle set BEFORE any label is placed:
 * a label that covered the sentence qualifying it would leave the strongest possible version of the claim
 * on screen. Bottom-left, in the band between the globe's silhouette and the frame edge.
 *
 * MEASURED AGAINST THE WRAPPER rather than assumed from the CSS — `bottom: 12px` is not a number this code
 * knows the top edge of, which is the mistake E4 records for exactly this rectangle.
 */
const declaration = document.createElement('div');
declaration.style.cssText = 'position:absolute;left:14px;bottom:12px;white-space:nowrap;'
  + 'font:600 10px/1.5 ui-monospace,monospace;letter-spacing:.12em;color:#E0A94A;' + SELECTABLE;
declaration.textContent = `PLACEHOLDER SITES · ${HUB_NAME.toUpperCase()} IS THE HUB`
  + ' · COORDINATES REAL, CORRIDOR SET ILLUSTRATIVE';
overlay.appendChild(declaration);
placedBoxes.push((() => {
  const a = declaration.getBoundingClientRect(), b = wrap.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
})());
const freeAt = (r: Rect, ownName: string): boolean =>
  onFrame(r)
  && !placedBoxes.some((p) => overlapArea(p, r) > 0)
  && !markerDiscs.some((d) => d.name !== ownName && overlapArea(d.box, r) > 0);

/* Four sides. Right first, then left, because a box on the same visual row as its dot is the easiest to
   attribute at a glance; above and below after. That order is a PREFERENCE and not a measurement — what
   makes it reviewable rather than a guess is that the side each label actually took is in the report. */
const SIDES = ['right', 'left', 'above', 'below'] as const;
const boxOn = (side: typeof SIDES[number], sx: number, sy: number, box: Rect): Rect => {
  if (side === 'right') return { x: sx + GAP_PX, y: sy - box.h / 2, w: box.w, h: box.h };
  if (side === 'left') return { x: sx - GAP_PX - box.w, y: sy - box.h / 2, w: box.w, h: box.h };
  if (side === 'above') return { x: sx - box.w / 2, y: sy - GAP_PX - box.h, w: box.w, h: box.h };
  return { x: sx - box.w / 2, y: sy + GAP_PX, w: box.w, h: box.h };
};

/*
 * THE RADIAL FALLBACK, AND IT EXISTS BECAUSE THE FIRST VERSION LOST THE HUB.
 *
 * Four sides at the marker is not enough on a globe, and the failure was not subtle: simulated against
 * this camera, VADUZ — the origin of all seven corridors, placed FIRST precisely so it could not lose —
 * was refused on all four sides. Its 160×52 box could not avoid London's marker 23 px away on one side or
 * Istanbul's on the other, which is exactly the collision `build.mjs` predicted when it declined to build
 * this layer at all. Six of twelve sites were labelled and the one that mattered most was in the prose.
 *
 * The way out is the empty half of the frame. Every marker is on the globe, the globe's silhouette is
 * 253 px across a 1200×720 frame, so ANY box whose inner edge is outside that silhouette cannot cover a
 * marker at all — there are none out there. So a label that cannot sit beside its dot is pushed radially
 * outward past the limb and connected back by a leader.
 *
 * OUTWARD FROM THE PROJECTED CENTRE, which is the one direction that is guaranteed to leave the planet.
 * The silhouette circle is centred on the eye-to-centre axis, so it projects concentric with the globe's
 * own centre and a ray from that centre through the anchor exits the disc without crossing it again.
 */
const discCentre = projectScreen(vpFinal, view.target, CSS_W, CSS_H);
/*
 * THE SILHOUETTE IS NOT `EARTH_R * PX_PER_WORLD`, and using that would put a label ON the limb.
 *
 * A sphere's silhouette is the circle where n·ê = R/L. That circle has world radius R·√(1−R²/L²) and it
 * lies R²/L NEARER the eye than the centre does, so it is projected at a larger pixels-per-world than the
 * centre is. At this camera the naive figure is 249 px and the true one 253 px — four pixels, which is
 * most of a marker radius, in the direction that matters.
 */
const SILHOUETTE_PX = (EARTH_R * Math.sqrt(Math.max(0, 1 - (EARTH_R * EARTH_R) / (eyeLen * eyeLen))))
  * ((CSS_H / 2) / (Math.tan(((view.fovDeg ?? 34) * RAD) / 2) * (eyeLen - (EARTH_R * EARTH_R) / eyeLen)));
/*
 * Six rings of 24 px. Six reaches 385 px from the projected centre, which is already past the frame's
 * vertical edge (half-height 360) and still well inside its horizontal one — so the bound is not
 * geometric. It is a legibility bound: a label 400 px away from a 253 px globe is nearer the frame edge
 * than the dot it names, and a leader that long stops being attributable at a glance. Past six, the
 * honest answer is the prose under the frame rather than a longer line.
 */
const RADIAL_STEPS = 6;
const RADIAL_STEP_PX = 24;
const radialBox = (step: number, sx: number, sy: number, box: Rect): Rect => {
  const dx = sx - discCentre.sx, dy = sy - discCentre.sy;
  const len = Math.hypot(dx, dy);
  /* A site at the exact sub-view point projects onto the centre and has no outward direction. Pushed
     right by convention rather than dividing by zero — which would place the box at NaN and, per
     `project.ts`'s note on CSS number syntax, silently drop the style rather than throw. */
  const ux = len < 1e-6 ? 1 : dx / len, uy = len < 1e-6 ? 0 : dy / len;
  const r = SILHOUETTE_PX + GAP_PX + step * RADIAL_STEP_PX;
  const tx = discCentre.sx + ux * r, ty = discCentre.sy + uy * r;
  return { x: ux >= 0 ? tx : tx - box.w, y: ty - box.h / 2, w: box.w, h: box.h };
};
/*
 * THE LEADER CARRIES THE ONE THING THE OFFSET COSTS: which dot this label is about.
 *
 * A label beside its marker needs no leader; a label 200 px out at the rim is unattached without one, and
 * an unattached label on a figure with twelve markers is a guess. One pixel and semi-transparent because
 * it crosses the globe's own surface on its way out — it is a pointer, not a corridor, and it must not
 * read as one of the seven arcs that ARE data.
 */
function drawLeader(sx: number, sy: number, box: Rect): number {
  /* THE NEAREST POINT ON THE BOX, by clamping the anchor into the box's own range. The first version
     picked the left or right edge from `sx >= discCentre.sx` — the same condition `radialBox` uses to
     decide which way the box extends, written a second time. Two copies of one decision is one edit away
     from a leader that crosses the label it is attached to; a clamp cannot disagree with anything. */
  const tx = Math.min(Math.max(sx, box.x), box.x + box.w);
  const ty = Math.min(Math.max(sy, box.y), box.y + box.h);
  const len = Math.hypot(tx - sx, ty - sy);
  const line = document.createElement('div');
  line.style.cssText = `position:absolute;left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px;`
    + `width:${len.toFixed(1)}px;height:1px;background:rgba(143,178,255,0.5);`
    + `transform-origin:0 50%;transform:rotate(${Math.atan2(ty - sy, tx - sx).toFixed(5)}rad)`;
  overlay.appendChild(line);
  return Math.round(len);
}

/*
 * DECIDED HUB FIRST, THEN MOST HEAD-ON FIRST, and the order is an editorial decision rather than a
 * convenience.
 *
 * Vaduz wins every contest because it is the origin of all seven corridors: a reach map whose hub is
 * unnamed has lost the one endpoint every arc shares. After that, the site with the highest `cosFace`
 * wins, because that is the site whose anchor is least ambiguous — when two labels want the same pixels,
 * they go to the one that can be certain which marker it belongs to. E4 sorted near-to-far for the same
 * reason; on a sphere, "most head-on" is the version of that which survives foreshortening.
 */
const HUB_LABEL_FIRST = (a: { name: string; cosFace: number }, b: { name: string; cosFace: number }): number =>
  (a.name === HUB_NAME ? -1 : b.name === HUB_NAME ? 1 : b.cosFace - a.cosFace);

type LabelOutcome = {
  name: string; state: string; side: string | null;
  sx: number | null; sy: number | null; opacity: number | null; cosFace: number;
  /* 0 for a label sitting beside its own marker, a length for one pushed out to the rim. Reported
     because "how many labels had to leave their dot" is the legibility cost of this camera, and it is a
     number a capture can watch rather than a thing a reader has to notice. */
  leaderPx: number | null;
};
const outcomes: LabelOutcome[] = [];
/* The full datum for every site that is NOT labelled on the frame, so a refusal costs the reader a
   position and never a number. */
const inWords: string[] = [];

for (const l of [...labelPlan].sort(HUB_LABEL_FIRST)) {
  const cos = Number(l.cosFace.toFixed(3));
  const detail = `${l.name} — ${l.lines.join(' · ')}`;
  const refuse = (state: string, why: string): void => {
    inWords.push(`${detail}. ${why}`);
    outcomes.push({
      name: l.name, state, side: null, sx: null, sy: null, opacity: null, cosFace: cos, leaderPx: null,
    });
  };
  if (!l.facing) {
    refuse('BEHIND_LIMB', 'Behind the limb on this face, so it is not labelled on the frame.');
    continue;
  }
  if (l.at.behind) {
    /* Unreachable at this camera and checked anyway: `projectScreen` reports `behind` on w <= 0, where the
       projection is inverted rather than merely inaccurate, and a facing site could reach it at a distance
       inside the near plane. A refusal by name beats a label at enormous size off-frame. */
    refuse('BEHIND_CAMERA', 'Projected behind the camera plane, so it is not labelled on the frame.');
    continue;
  }
  if (l.cosFace <= COS_HIDE) {
    refuse('EDGE_ON', `The marker is ${(MARKER_PX * l.cosFace).toFixed(1)} px wide there — inside the `
      + `${ANCHOR_FLOOR_PX} px floor, so it is too edge-on for a label to point at.`);
    continue;
  }

  const fade = Math.min(1, Math.max(0, (l.cosFace - COS_HIDE) / (COS_FULL - COS_HIDE)));
  const opacity = LABEL_MIN_OPACITY + (1 - LABEL_MIN_OPACITY) * fade;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;display:flex;flex-direction:column;gap:1px;white-space:nowrap;'
    + 'font:400 9.5px/1.35 ui-monospace,monospace;text-shadow:0 1px 3px rgba(0,0,0,0.95);'
    + `opacity:${opacity.toFixed(3)};` + SELECTABLE;
  el.appendChild(textLine('font:700 9.5px/1.2 ui-monospace,monospace;letter-spacing:.14em;color:#CFE0FF',
    l.name.toUpperCase()));
  for (const line of l.lines) {
    el.appendChild(textLine('color:rgba(196,212,240,0.86)', line));
  }
  const box = measured(el);
  /* Beside the dot first — a label that needs no leader is the one a reader cannot misattribute. Only
     then out to the rim, nearest ring first, so a pushed label travels as little as it has to. */
  const side = SIDES.find((s) => freeAt(boxOn(s, l.at.sx, l.at.sy, box), l.name));
  let at: Rect | null = side === undefined ? null : boxOn(side, l.at.sx, l.at.sy, box);
  let ring: number | null = null;
  for (let step = 0; at === null && step < RADIAL_STEPS; step++) {
    const candidate = radialBox(step, l.at.sx, l.at.sy, box);
    if (freeAt(candidate, l.name)) { at = candidate; ring = step; }
  }
  if (at === null) {
    el.remove();
    refuse('NO_FREE_PLACEMENT', `No free placement at this camera: four sides at the marker and `
      + `${RADIAL_STEPS} rings out to the rim were all blocked by another marker, an already-placed `
      + 'label, or the frame edge.');
    continue;
  }
  const leaderPx = ring === null ? 0 : drawLeader(l.at.sx, l.at.sy, at);
  el.style.left = `${at.x.toFixed(1)}px`;
  el.style.top = `${at.y.toFixed(1)}px`;
  el.style.visibility = 'visible';
  placedBoxes.push(at);
  outcomes.push({
    name: l.name, state: 'PROJECTED', side: side ?? `radial+${ring}`,
    sx: Math.round(l.at.sx), sy: Math.round(l.at.sy),
    opacity: Number(opacity.toFixed(3)), cosFace: cos, leaderPx,
  });
}

/*
 * THE UNLABELLED SITES GO INTO WORDS UNDER THE FRAME, and every part of that placement is forced.
 *
 * INTO WORDS, because these are the sites the geometry cannot show. A label over the near hemisphere
 * pointing at a city on the far side is the exact failure the limb test exists to prevent, so the reading
 * moves into prose rather than being drawn somewhere it would be wrong — the shipped globe resolves it the
 * same way, with the same distinction between a label and a sentence.
 *
 * NOT INSIDE THE OVERLAY, because the wrapper is `overflow:hidden` — the rule that stops a runaway
 * transform breaking the screenshot would crop this block for the same reason.
 *
 * AND NOT INSIDE `#stage` EITHER. `build.mjs` writes that host with an inline `height:720px`, so a block
 * appended into it does not push the page down: it overflows a fixed box and paints on top of the `#log`
 * diagnostic below, which is the element `capture.mjs` reads the report from. Inserted as a SIBLING, just
 * above the log, so the document order is frame → the sites it could not label → the numbers.
 */
const unlabelled = document.createElement('div');
unlabelled.id = 'e2-unlabelled';
unlabelled.style.cssText = `max-width:${CSS_W}px;padding:12px 0 0;`
  + 'font:400 11px/1.65 ui-monospace,monospace;color:rgba(196,212,240,0.82)';
unlabelled.appendChild(textLine(
  'font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.14em;color:#8FB7FF;padding-bottom:4px',
  inWords.length === 0
    ? 'EVERY SITE IS LABELLED ON THE FRAME'
    : `NOT LABELLED ON THIS FACE — ${inWords.length} OF ${labelPlan.length} SITES, WITH THE REASON`,
));
for (const line of inWords) unlabelled.appendChild(textLine('', line));
/* NOT `?.` HERE. An optional call would drop the whole block if the page's shape ever changed, and the
   symptom would be five sites quietly ceasing to exist for a screen reader while the frame still looked
   finished — the class of silent loss rule 4 is about. Refused by name instead. */
const wordsHost = log.parentNode;
if (wordsHost === null) {
  die('NO_WORDS_HOST: #log has no parent, so the sites that could not be labelled have nowhere to be '
    + 'stated. The frame would look complete while five readings had silently left the document.');
}
wordsHost.insertBefore(unlabelled, log);

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
  atmosphere: ATMOS_ON, shadow: SHADOW_ON,
  triangles: tris, resolution: `${W}x${H}`, dprScale: SCALE,
  /* THE VALUE MEASURED, NOT THE VALUE ASKED FOR. `frames` used to report the raw parameter while the loop
     ran `Math.max(1, FRAMES)`, so `frames=0` and `frames=-5` published a single-frame time — noise, by the
     comment on `measure` — as a 0-frame and a -5-frame sweep. */
  frames: sweep.measured,
  framesRequested: FRAMES,
  sweepTruncated: sweep.measured < FRAMES,
  paramClamps,
  msPerFrame: Number(ms.toFixed(3)), fps: Math.round(1000 / ms),
  centralMeridian: CENTRAL_MERIDIAN, subSolar: `${SUB_SOLAR.lat}N ${SUB_SOLAR.lon}E`,
  cities: seen.length,
  citiesFacing: seen.filter((c) => c.facing).length,
  citiesSunlit: seen.filter((c) => c.sunlit).length,
  corridors: CORRIDORS.length,
  corridorTriangles: corridorGeos.reduce((n, g) => n + triangleCount(g), 0),
  corridorPeakLift,
  /*
   * §6 RULE 4, REPORTED SO IT CAN BE ASSERTED RATHER THAN LOOKED AT.
   *
   * `projected + inWords` must equal `cities`: every site is either labelled on the frame or named
   * underneath it, and a site in neither is a datum this harness lost. The thresholds are published
   * beside the counts because they are derived from `anchorFloorPx` at this camera — a reader who
   * disagrees with the five-pixel floor can see exactly what it bought.
   */
  labels: {
    projected: outcomes.filter((o) => o.state === 'PROJECTED').length,
    inWords: inWords.length,
    faded: outcomes.filter((o) => o.opacity !== null && o.opacity < 1).length,
    /* How many labels could not sit beside their own dot. It rises the moment sites cluster, and it is
       the number that says whether this camera can carry the set it is being asked to label. */
    pushedToRim: outcomes.filter((o) => o.leaderPx !== null && o.leaderPx > 0).length,
    markerPx: Number(MARKER_PX.toFixed(2)),
    silhouettePx: Number(SILHOUETTE_PX.toFixed(1)),
    anchorFloorPx: ANCHOR_FLOOR_PX,
    cosHide: Number(COS_HIDE.toFixed(4)),
    cosFull: Number(COS_FULL.toFixed(4)),
    horizonDot: Number(HORIZON.toFixed(4)),
    /* One entry per reason a site went into words, so a change in the mix is visible without diffing
       twelve rows. */
    refusedBy: ['BEHIND_LIMB', 'BEHIND_CAMERA', 'EDGE_ON', 'NO_FREE_PLACEMENT'].map((state) => ({
      state, count: outcomes.filter((o) => o.state === state).length,
    })),
  },
  domLabels: outcomes,
  behindLimb: seen.filter((c) => !c.facing).map((c) => c.name),
  onNightSide: seen.filter((c) => c.facing && !c.sunlit).map((c) => c.name),
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
(globalThis as unknown as { E2: typeof report }).E2 = report;
/*
 * THE PRINTED REPORT IS SUMMARISED; THE FULL ONE STAYS ON `globalThis`, WHICH IS WHERE `capture.mjs`
 * READS IT ANYWAY.
 *
 * `fullPage: true` screenshots the log along with the frame, and a pretty-printed per-city table is
 * twelve objects deep — E6 pushed past Chrome's capture height exactly this way and
 * `Page.captureScreenshot` then fails, naming the screenshot rather than the report that grew. E7 solved
 * it by destructuring the long arrays out and printing them as one line each; the same trick here keeps
 * every label's placement visible.
 */
const { domLabels: _dl, corridorPeakLift: _cpl, ...summary } = report;
log.textContent = JSON.stringify(summary, null, 2)
  + `\n\ncorridorPeakLift — ${corridorPeakLift.length} arcs:\n`
  + corridorPeakLift.map((c) => `  ${c.to.padEnd(13)} ${String(c.separationDeg).padStart(5)}°  lift ${c.lift}`).join('\n')
  + `\n\ndomLabels — §6 rule 4, ${outcomes.length} sites, full detail on globalThis.E2:\n`
  + outcomes.map((o) => (
    `  ${o.name.padEnd(13)} ${o.state.padEnd(18)} cosFace ${String(o.cosFace).padStart(6)}`
    + (o.state === 'PROJECTED' ? `  ${o.side} at ${o.sx},${o.sy} opacity ${o.opacity}` : '')
  )).join('\n');
frame();
fallback.markRendered();
document.title = 'READY';
