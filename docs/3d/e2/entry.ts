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
 *   REAL   sphere earth, a shell that brightens at the limb, eight sited cities, an orbital ring
 *          in polished metal, one key light producing a genuine day/night terminator, shadow map,
 *          depth prepass, SSAO, environment reflections, depth of field.
 *   ABSENT  continents, and this is the largest gap. `LIT_FRAG` has no texture sampler and
 *          `Material` carries no map of any kind, so the earth is a plain blue ball. Without an
 *          albedo the eight sited markers cannot be READ as geography by anyone looking at them —
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
  hexToLinear, assertBrandFidelity, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal,
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
const SCALE = Math.max(1, Math.min(3, Number(params.get('scale') ?? 1)));
const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;

const HUB = { lat: 47.14, lon: 9.52 };
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
 * §6 RULE 1 — and for E2 this is also a partial answer to its rule 4 violation.
 *
 * E2 renders no DOM text at all: eight sited cities and seven corridors carry no labels, so nothing
 * enters the accessibility tree and nothing survives printing. That is still a violation and is named in
 * the README. But the flat fallback is always in the DOM, so the names, coordinates and corridor
 * distances are now reachable by a screen reader and present in the print path — which they were not.
 *
 * What the flat view cannot carry is the whole point of the globe: that a corridor's arc height rises
 * with distance, that three endpoints are behind the limb, and that two desks are on the night side.
 */
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
  rows: CORRIDORS.map((c) => {
    /* The angular separation the arc's lift is derived from, so the table states the quantity the
       geometry encodes rather than merely the endpoints. */
    const toRad = (d: number): number => (d * Math.PI) / 180;
    const cosw = Math.sin(toRad(HUB.lat)) * Math.sin(toRad(c.lat))
      + Math.cos(toRad(HUB.lat)) * Math.cos(toRad(c.lat)) * Math.cos(toRad(c.lon - HUB.lon));
    const deg = (Math.acos(Math.min(1, Math.max(-1, cosw))) * 180) / Math.PI;
    return { to: c.to, lat: c.lat.toFixed(2), lon: c.lon.toFixed(2), sep: `${deg.toFixed(1)}°` };
  }),
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
/* Assigned once the fallback is installed. `die` stays a declaration: a `function` returning `never` is
   what gives the compiler its control-flow narrowing, and a const arrow does not. */
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;

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
const shadow = need('shadow', createShadowMap(stage, 1024));
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
 * The coordinates are real city coordinates; the claim that these eight are LCX's partner and
 * listing corridor is NOT — no such list is an input to this harness, and inventing one and
 * presenting it as geography would be the exact failure this repo refuses elsewhere. What is being
 * proven here is the SITING MECHANISM: swapping in the real corridor is an edit to this array and
 * nothing else. Vaduz is the one entry that is not a placeholder.
 *
 * A single fixed camera sees one hemisphere, so the eight are drawn from a span the frame can
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
const RING_MAT = { baseColour: hexToLinear('#8FA3C4'), roughness: 0.14, metalness: 0.95, anisotropy: 0.8 };
const CITY_MAT = { baseColour: hexToLinear('#2C6BFF'), roughness: 0.5, metalness: 0.0 };
/* Anisotropy 0.85 with `arcTube`'s along-the-path tangent, so the highlight runs DOWN the corridor.
   An isotropic tube bands into rings and reads as a ribbed hose rather than a lit route. */
const CORRIDOR_MAT = { baseColour: hexToLinear('#4C86FF'), roughness: 0.22, metalness: 0.85, anisotropy: 0.85 };

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
 * gain. Depth is already resolved by the prepass, so the second pass costs eight small spheres of
 * fill and nothing else.
 *
 * 140 IS NOT A TUNED NUMBER, it is a ratio, and it is worth stating what it is a ratio of. A
 * marker's only light is the sky reflected off it, the sky now sits at plate level, and brand blue
 * against the middle of that gradient returns about 0.021 of linear radiance. Reaching the ~3.0
 * that encodes at the top of the blue channel therefore costs a factor of 140. The size of that
 * number IS the missing emission channel, and it has a second symptom: because the glow is a
 * reflection, a marker's brightness varies slightly with the sky gradient at its own latitude, so
 * eight identical cities are not quite identically bright. Filed as a spine request.
 *
 * BODY_AMBIENT stays low. A brighter one would lift the night hemisphere, and the night side of a
 * planet IS dark — what makes it read in real imagery is city lights, which is a texture channel
 * this renderer does not have either. The eight markers are the stand-in for it.
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
  ao.compute({
    depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 34, aspect: W / H,
    radius: 0.35, strength: 1.1,
  });
  target.bind();

  const common = {
    viewProj: vp, eye, lightDir,
    /* Warm sun against the cool sky in `sky.ts`. The colour separation is doing real work: it is
       what distinguishes the daylit hemisphere from the ambient-lit one, and a neutral white key
       against a blue ambient reads as an exposure difference instead of as sunlight. */
    lightColour: [6.6, 6.2, 5.5] as [number, number, number],
    sky: SKY,
    /* A null shadow map is FULLY LIT in `lit.ts`, never fully shadowed, so the control is a
       genuine no-shadow render rather than a black frame. */
    lightVP, shadow: SHADOW_ON ? shadow : null, shadowStrength: 0.92,
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
  dof.apply({
    scene: target.texture, depthTexture: target.depthTexture, near, far,
    fovDeg: view.fovDeg ?? 34, aspect: W / H, focusDistance: focus, aperture: 0.12, maxCoc: 0.006,
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dof.texture);
  stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
}

frame();

/*
 * WHAT THE CAPTURE ACTUALLY SHOWS, MEASURED RATHER THAN ASSUMED.
 *
 * Eight markers are placed; a fixed camera sees one hemisphere and a fixed sun lights one. Both
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

function measure(n: number): number {
  frame();
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) frame();
  // Read back once at the end: the driver queues work, and timing without a sync measures the
  // queue rather than the frame.
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
  /* Empty means every brand hex round-tripped exactly through this frame's own pipeline. */
  brandFidelity: brandFailures,
  atmosphere: ATMOS_ON, shadow: SHADOW_ON,
  triangles: tris, resolution: `${W}x${H}`, dprScale: SCALE, frames: FRAMES,
  msPerFrame: Number(ms.toFixed(3)), fps: Math.round(1000 / ms),
  centralMeridian: CENTRAL_MERIDIAN, subSolar: `${SUB_SOLAR.lat}N ${SUB_SOLAR.lon}E`,
  cities: seen.length,
  citiesFacing: seen.filter((c) => c.facing).length,
  citiesSunlit: seen.filter((c) => c.sunlit).length,
  corridors: CORRIDORS.length,
  corridorTriangles: corridorGeos.reduce((n, g) => n + triangleCount(g), 0),
  /* Peak lift per corridor, so "does a long haul climb higher than a short hop" is a number in the
     report rather than an impression from the picture. */
  corridorPeakLift: corridorGeos.map((g, i) => {
    let m = 0;
    for (let k = 0; k < g.positions.length; k += 3) {
      m = Math.max(m, Math.hypot(g.positions[k]!, g.positions[k + 1]!, g.positions[k + 2]!));
    }
    return { to: CORRIDORS[i]!.to, lift: Number((m - EARTH_R).toFixed(4)) };
  }),
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
log.textContent = JSON.stringify(report, null, 2);
frame();
fallback.markRendered();
document.title = 'READY';
