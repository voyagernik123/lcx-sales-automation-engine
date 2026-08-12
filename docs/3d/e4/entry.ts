/**
 * E4 · THE ORRERY — the ontology as a gravitational system.
 *
 * `3D_VFX_1000X.md` §2: "entities orbiting, relationship strength as orbital coupling, a
 * compartment you fly into." It replaces `OntologyExplorer`, a node-link diagram.
 *
 * ── THE ONE THING A NODE-LINK DIAGRAM CANNOT DO, STATED AS A NUMBER ───────────────────
 * A 2-D graph drawing has two spatial axes and must spend both on layout, so the moment it also
 * wants to encode relationship distance (radius) and entity kind (angle) it has nothing left with
 * which to keep edges apart — and edges then CROSS. A crossing in a plane is not a cosmetic
 * problem: at the crossing point both edges occupy the same pixels at the same depth, so the reader
 * cannot tell which edge continues where. Two relationships become four possible relationships.
 *
 * Inclination is the third axis, and it is spent on exactly that. The claim is not "3-D looks
 * better" and not even "fewer lines cross on screen" — from most viewpoints MORE of them cross
 * here, and the report says so. The claim is that no crossing is AMBIGUOUS, and it is proven
 * camera-independently: two tubes can only fuse into an unreadable X if their minimum separation in
 * 3-D is less than the sum of their radii, which does not depend on where the camera is. That count
 * is `grazingPairs3D`, it is 0, and therefore no viewpoint whatsoever produces an ambiguous
 * crossing. The flat layout's count is the same routine run on the same graph with every
 * inclination set to zero, which is what `?flat=1` renders.
 *
 * ── WHAT EACH DIMENSION IS SPENT ON, AND WHY NONE OF IT IS DECORATION ─────────────────
 * · ORBITAL RADIUS = hops from the core entity, computed by breadth-first search over the SAME
 *   relationship list that is drawn. Not authored: if an edge is added, the shell moves.
 * · BODY SIZE = record count, log10. A count that was never measured cannot have a size, so it
 *   does not get one — see below.
 * · ORBIT INCLINATION = entity kind. Four kinds, four planes, and that is the axis the flat
 *   version does not have.
 * · TUBE THICKNESS = relationship strength, and `linkPx` reports the thinnest and thickest in
 *   SCREEN pixels, because a thickness encoding measured in world units can be sub-pixel and
 *   therefore fictional.
 *
 * ── THREE STATES, THREE SHAPES ───────────────────────────────────────────────────────
 * OBSERVED, ABSENT (never measured) and WITHHELD (measured, may not be shown) are never collapsed.
 * Size is the value here, so a non-observed count must not get a size at all — it gets a SHAPE that
 * is not on the size scale: a hollow amber ring for absent, a sealed steel drum for withheld. The
 * withheld compartment additionally carries no label, because a label is what the reader is not
 * cleared for. All three are counted separately in the report.
 */
import {
  createStage, isStage, plane, sphere, cylinder, torus, uploadMesh, createLitRenderer,
  createTarget3D, createShadowMap, createAmbientOcclusion,
  projectQuad, isQuadRefusal,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, assertBrandFidelity, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal, type QuadCorners,
  QUALITY_TIERS, qualitySettings, shadowMapSizeFor, type QualityTier,
} from '@lcx/gl';
import { installFlatFallback } from '../_shared/flatFallback.js';

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
const AO_ON = params.get('ao') !== '0' && Q.ao;
/* THE CONTROL THAT MATTERS HERE. `?flat=1` zeroes every inclination and looks straight down, which
   is precisely the node-link diagram this replaces — same entities, same radii, same strengths, one
   axis fewer. The crossing counts in the report are computed for BOTH layouts on every run, so the
   comparison is not a claim about a picture nobody measured. */
const FLAT = params.get('flat') === '1';
/*
 * NO SHADOW IN THE FLAT CONTROL, and that is not a second difference smuggled in.
 *
 * A shadow is a depth cue. The flat control has no depth to cue: its whole graph lies in one plane, so
 * the only thing its shadows could report is the arbitrary 2.6 m gap between that plane and the plate
 * below it. In the capture they came out as eleven detached black discs beside the bodies, which read
 * as eleven more entities. The crossing counts the comparison rests on are computed from geometry and
 * are unaffected by this; what changes is only that the control shows what a flat diagram shows.
 *
 * `FLAT` IS DECLARED ABOVE THIS LINE, and it was not when this was written. Reading a `const` before
 * its declaration is a TEMPORAL DEAD ZONE throw, and a page that throws never sets `document.title`,
 * so the harness would have reported a 90-second timeout naming nothing. One line's worth of ordering
 * between a clear error and a silent one.
 */
const SHADOW_ON = params.get('shadow') !== '0' && !FLAT;
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
 * clamp instead of applying it silently. The refusal is taken after the flat fallback is installed, so
 * the reader keeps every row of the table and is told which parameter they mistyped.
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
const log = document.getElementById('log')!;

function die(m: string): never {
  document.title = 'REFUSED';
  /* Resolved here rather than closed over: `die` is reachable before the harness's own `const log`,
     because the fallback and its forced-refusal switch both sit above the stage on purpose. */
  const logEl = document.getElementById('log');
  if (logEl) logEl.textContent = m;
  const [code, ...rest] = m.split(':');
  fallbackRef?.showRefusal(code?.trim() ?? 'REFUSED', rest.join(':').trim() || m);
  throw new Error(m);
}
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
}

type Count =
  | { readonly state: 'observed'; readonly records: number }
  | { readonly state: 'absent' }
  | { readonly state: 'withheld' };

interface EntityDef { readonly id: string; readonly kind: Kind; readonly thetaDeg: number; readonly count: Count }

const CORE = 'PROGRAMME';
const ENTITIES: readonly EntityDef[] = [
  { id: CORE, kind: 'CORE', thetaDeg: 0, count: { state: 'observed', records: 9 } },
  { id: 'PARTNER', kind: 'PARTY', thetaDeg: 18, count: { state: 'observed', records: 412 } },
  { id: 'PERSON', kind: 'PARTY', thetaDeg: 128, count: { state: 'observed', records: 1940 } },
  /* NEVER MEASURED. The counterparty table is federated and this deployment has no read on it. */
  { id: 'COUNTERPARTY', kind: 'PARTY', thetaDeg: 236, count: { state: 'absent' } },
  { id: 'LISTING', kind: 'INSTRUMENT', thetaDeg: 196, count: { state: 'observed', records: 128 } },
  { id: 'TOKEN', kind: 'INSTRUMENT', thetaDeg: 52, count: { state: 'observed', records: 64 } },
  { id: 'SETTLEMENT', kind: 'INSTRUMENT', thetaDeg: 300, count: { state: 'observed', records: 22806 } },
  /* 258, NOT 288. At 288 the LISTING~TOKEN tube passed straight through this body, which the report's
     `linksThroughBodies` caught and the capture did not — a link through a body hides the body, and a
     hidden entity is the one failure mode this layout exists to avoid. */
  { id: 'CAMPAIGN', kind: 'EVENT', thetaDeg: 258, count: { state: 'observed', records: 37 } },
  { id: 'QUEST', kind: 'EVENT', thetaDeg: 8, count: { state: 'observed', records: 1204 } },
  /* MEASURED, MAY NOT BE SHOWN. A need-to-know compartment: the body is on its orbit, the count is
     not on the frame, and there is no label — which is the actual state of the thing.
     At 270 on a 62-degree plane it sits 2.7 m ABOVE the reference plane and clear of the tangle at the
     centre: the one body whose whole job is to be seen and not read cannot be the one that is hard to
     see, and at its first angle it was buried behind four tubes. */
  { id: 'COMPARTMENT', kind: 'CONTROL', thetaDeg: 270, count: { state: 'withheld' } },
  { id: 'JURISDICTION', kind: 'CONTROL', thetaDeg: 214, count: { state: 'observed', records: 31 } },
];

interface RelDef { readonly a: string; readonly b: string; readonly strength: number | null }
const RELATIONS: readonly RelDef[] = [
  { a: CORE, b: 'PARTNER', strength: 0.92 },
  { a: CORE, b: 'LISTING', strength: 0.71 },
  { a: CORE, b: 'CAMPAIGN', strength: 0.64 },
  { a: CORE, b: 'COMPARTMENT', strength: 0.55 },
  { a: 'PARTNER', b: 'PERSON', strength: 0.80 },
  { a: 'PARTNER', b: 'COUNTERPARTY', strength: 0.34 },
  { a: 'LISTING', b: 'TOKEN', strength: 0.88 },
  { a: 'TOKEN', b: 'SETTLEMENT', strength: 0.76 },
  { a: 'CAMPAIGN', b: 'QUEST', strength: 0.58 },
  { a: 'QUEST', b: 'PERSON', strength: 0.41 },
  { a: 'JURISDICTION', b: 'LISTING', strength: 0.67 },
  { a: 'SETTLEMENT', b: 'COUNTERPARTY', strength: 0.29 },
  /* THE RELATIONSHIP EXISTS AND ITS STRENGTH WAS NEVER MEASURED. Drawing it at the minimum
     thickness would assert a weak coupling nobody observed, and leaving it out would assert no
     relationship at all. It is drawn as a line of pips instead: visibly present, visibly not on the
     thickness scale, because a sphere is not a tube. */
  { a: 'JURISDICTION', b: 'PERSON', strength: null },
];


/*
 * §6 RULE 1. Installed above the stage, because a shader compile failure happens during module
 * evaluation and anything built afterwards never runs on the failure it exists for. Print and the
 * accessibility tree are not errors there is anything to catch for at all.
 *
 * The flat view is a NODE LIST plus an EDGE LIST, which is honest about what it loses. The orrery's whole
 * claim is that a 3-D layout separates coupling strength from grouping without crossing lines; two lists
 * carry every entity and every relationship and none of that separation. What they do keep is the part
 * that must never be lost: an ABSENT record count and a WITHHELD compartment stay distinguishable from
 * each other and from a measured zero.
 */
const fallback = installFlatFallback({
  title: 'E4 · The Orrery — ontology entities and couplings',
  readsAs: 'The rendered view places each entity on an orbit whose radius is its distance from the core '
    + 'and whose inclination separates its kind, so coupling strength and grouping are read at once '
    + 'without crossing lines. These two lists carry every entity and every relationship, and none of '
    + 'that structure.',
  notices: [
    'A SYNTHETIC ontology — the shape is deliberate, the counts are not measurements.',
    'Absent (never measured) and withheld (measured, not shown) are separate states here, as in the render.',
  ],
  columns: [
    { key: 'entity', label: 'Entity' },
    { key: 'kind', label: 'Kind' },
    { key: 'records', label: 'Records', numeric: true },
    { key: 'couplings', label: 'Couplings', numeric: true },
  ],
  rows: [
    ...ENTITIES.map((e) => ({
      entity: e.id,
      kind: e.kind,
      /* `null` renders as a named "absent" rather than a blank or a zero. A withheld count is NOT absent,
         so it says so in words — collapsing the two here would break rule 6 with the very thing meant to
         satisfy rule 1. */
      records: e.count.state === 'observed' ? e.count.records
        : e.count.state === 'withheld' ? 'withheld' : null,
      couplings: RELATIONS.filter((r) => r.a === e.id || r.b === e.id).length,
    })),
    ...RELATIONS.map((r) => ({
      entity: `${r.a} → ${r.b}`,
      kind: 'COUPLING',
      /* An unmeasured strength is absent, not weak. Printing a minimum would assert a coupling nobody
         observed — which is exactly why the render refuses to draw it at minimum thickness. */
      records: r.strength === null ? null : r.strength.toFixed(2),
      couplings: '',
    })),
  ],
});
fallbackRef = fallback;
/* Refused HERE rather than where the parameter is parsed, because the fallback has to exist first —
   see `numParam`. A bad parameter is named to the reader instead of being reported as a driver fault. */
if (badParams.length > 0) {
  die(`BAD_PARAM: ${badParams.join(', ')} — not a number, so the system was refused rather than drawn `
    + 'from a nonsensical value. Every entity below is unaffected; correct the URL and reload.');
}
if (new URLSearchParams(location.search).get('refuse') === '1') {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The three-dimensional view is not being drawn.');
}

const out = createStage(canvas, { alpha: false });
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

const present = required('present', stage.compile(PRESENT_VERT, PRESENT_FRAG));
const lit = required('lit', createLitRenderer(stage));
const target = required('target', createTarget3D(stage, W, H));
const shadow = required('shadow', createShadowMap(stage, shadowMapSizeFor(TIER, 1536)));
const ao = required('ao', createAmbientOcclusion(stage, W, H));

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE ONTOLOGY. Synthetic, and said so ON THE FRAME in amber rather than in a comment.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The SHAPE is what has to be real, because it is what the layout is being tested on. A record
 * count spread over four orders of magnitude (9 to 22,806) is what makes a log size scale
 * necessary rather than decorative; a graph that is not a tree — `JURISDICTION` reaches `LISTING`
 * and `PERSON`, `SETTLEMENT` reaches `COUNTERPARTY` — is what produces crossings at all. A star
 * would have none and would prove nothing.
 */
/* CORE is a kind with no plane. The root entity sits at the origin and has no orbit, so giving it
   one of the four kinds would put a fifth body on a plane it does not belong to and would print a
   kind on its label that is not true of it. */
type Kind = 'CORE' | 'PARTY' | 'INSTRUMENT' | 'EVENT' | 'CONTROL';
/* Three states, one union, so a call site cannot read `records` off a count nobody took. */

/*
 * HOPS ARE COMPUTED, NOT AUTHORED — which is the difference between radius ENCODING relationship
 * distance and radius being a number I typed next to one.
 *
 * Breadth-first over the same list that is drawn. An entity the search cannot reach has no
 * relationship distance and so cannot be placed on a shell: it REFUSES with a code rather than
 * being dropped on the outermost ring, which would read as "three hops away".
 */
const adjacency = new Map<string, string[]>(ENTITIES.map((e) => [e.id, []]));
for (const r of RELATIONS) {
  adjacency.get(r.a)?.push(r.b);
  adjacency.get(r.b)?.push(r.a);
}
const hops = new Map<string, number>([[CORE, 0]]);
for (let frontier = [CORE]; frontier.length > 0;) {
  const next: string[] = [];
  for (const id of frontier) {
    for (const n of adjacency.get(id) ?? []) {
      if (!hops.has(n)) { hops.set(n, (hops.get(id) ?? 0) + 1); next.push(n); }
    }
  }
  frontier = next;
}
const unreachable = ENTITIES.filter((e) => !hops.has(e.id)).map((e) => e.id);

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE LAYOUT.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const RAD = Math.PI / 180;
type V3 = [number, number, number];

/* Shells are linear in hops rather than logarithmic: hops is a small integer and the reader has to
   count rings, so equal spacing is what makes "two rings out" mean two hops. */
const shellRadius = (h: number): number => 1.0 + h * 2.1;

/*
 * FOUR PLANES, AND THE ANGLES ARE CHOSEN AGAINST TWO FAILURES RATHER THAN FOR LOOKS.
 *
 * · A plane at 0 is deliberate: one kind stays in the reference plane, so the frame contains its
 *   own flat baseline and the other three are visibly lifted out of it.
 * · No two inclinations may be close, or their planes intersect at a shallow angle and bodies on
 *   them appear to share a ring — which is the flat layout's ambiguity reintroduced through the
 *   back door. 0 / 34 / -29 / 62 are separated by at least 29 degrees pairwise-signed.
 * · The ascending node (rotation about Y) is also varied, because four planes sharing a node line
 *   all cross the same diameter and every body near that diameter piles up there.
 */
const PLANE: Readonly<Record<Kind, { incDeg: number; nodeDeg: number }>> = {
  CORE: { incDeg: 0, nodeDeg: 0 },
  PARTY: { incDeg: 0, nodeDeg: 0 },
  INSTRUMENT: { incDeg: 34, nodeDeg: 64 },
  EVENT: { incDeg: -29, nodeDeg: -58 },
  CONTROL: { incDeg: 62, nodeDeg: 118 },
};

/* R = Ry(node) · Rx(inc) applied to an in-plane point. Written out rather than composed from two
   matrix helpers so the ONE convention it has to agree with — the ring's model matrix below — is
   visible next to it. */
function orbitPoint(r: number, thetaDeg: number, incDeg: number, nodeDeg: number): V3 {
  const t = thetaDeg * RAD, i = incDeg * RAD, n = nodeDeg * RAD;
  const x0 = r * Math.cos(t), z0 = r * Math.sin(t);
  const y1 = -z0 * Math.sin(i), z1 = z0 * Math.cos(i);
  return [x0 * Math.cos(n) + z1 * Math.sin(n), y1, -x0 * Math.sin(n) + z1 * Math.cos(n)];
}

/* Rotation for the orbit RINGS, which `torus` emits in the XZ plane. Column-major, and the
   inverse-transpose of a rotation is the rotation itself, so the same nine numbers serve as the
   normal matrix — no separate derivation to get out of step with this one. */
function orbitBasis(incDeg: number, nodeDeg: number): { model: Float32Array; normal: Float32Array } {
  const i = incDeg * RAD, n = nodeDeg * RAD;
  const ci = Math.cos(i), si = Math.sin(i), cn = Math.cos(n), sn = Math.sin(n);
  const r9 = new Float32Array([cn, 0, -sn, sn * si, ci, cn * si, sn * ci, -si, cn * ci]);
  const m = IDENTITY();
  m[0] = r9[0]!; m[1] = r9[1]!; m[2] = r9[2]!;
  m[4] = r9[3]!; m[5] = r9[4]!; m[6] = r9[5]!;
  m[8] = r9[6]!; m[9] = r9[7]!; m[10] = r9[8]!;
  return { model: m, normal: r9 };
}

/*
 * SIZE IS log10 OF THE RECORD COUNT, and the counts span 9 to 22,806 on purpose.
 *
 * Linear in the count, `CAMPAIGN` at 37 rows would be 1/600th the radius of `SETTLEMENT` — one
 * body a smear and the other filling the shell. The reader is being asked "which of these is the
 * big table", which is an order-of-magnitude question, and a log radius is the encoding that
 * answers it. The label prints the count as a number as well, so size is a redundant reading
 * rather than the only one.
 */
const R_BASE = 0.15, R_PER_DECADE = 0.115;
const observedRadius = (records: number): number => R_BASE + R_PER_DECADE * Math.log10(Math.max(1, records));
/*
 * A BODY WITH NO OBSERVED COUNT STILL HAS TO BE VISIBLE, AND THERE IS NO HONEST SIZE FOR IT.
 *
 * Any radius at all sits somewhere on the scale and therefore asserts a count. The resolution is
 * not a cleverer number, it is to leave the scale: the absent body is a hollow RING and the
 * withheld body is a sealed DRUM, and neither is a sphere. A reader who reads their extent as a
 * record count is reading a shape the legend explicitly says is not on the scale — which is the
 * best that can be done, and it is stated in the README rather than hidden here.
 *
 * The two nominal extents below are the SOURCE of the meshes' dimensions rather than a copy of them,
 * because the label geometry, the screen-overlap test and the mesh all have to agree about how big
 * these bodies are — and two constants that mean the same thing are two constants that drift.
 */
const ABSENT_RING_R = 0.34, ABSENT_TUBE_R = 0.115;
const ABSENT_OUTER = ABSENT_RING_R + ABSENT_TUBE_R;
const WITHHELD_R = 0.30, WITHHELD_H = 0.44;
const radiusOf = (c: Count): number => (
  c.state === 'observed' ? observedRadius(c.records) : c.state === 'absent' ? ABSENT_OUTER : WITHHELD_R
);

interface Body {
  readonly def: EntityDef; readonly hops: number; readonly shell: number;
  readonly pos: V3; readonly flatPos: V3; readonly radius: number;
}
const bodies: Body[] = ENTITIES.filter((e) => hops.has(e.id)).map((def) => {
  const h = hops.get(def.id)!;
  const shell = shellRadius(h);
  const pl = PLANE[def.kind];
  return {
    def, hops: h, shell,
    pos: def.id === CORE ? [0, 0, 0] : orbitPoint(shell, def.thetaDeg, pl.incDeg, pl.nodeDeg),
    /* THE FLAT BASELINE IS THIS LAYOUT WITH THE INCLINATIONS ZEROED — not a different drawing with
       different radii, so the crossing comparison isolates the one axis under test. */
    flatPos: def.id === CORE ? [0, 0, 0] : orbitPoint(shell, def.thetaDeg, 0, 0),
    radius: radiusOf(def.count),
  };
});
const byId = new Map(bodies.map((b) => [b.def.id, b]));
/* Kinds that actually have an orbit. Driven off the data so a kind added to `PLANE` without an
   entity does not get a ring and a plane label claiming a population of zero. */
const ORBITED_KINDS = (Object.keys(PLANE) as Kind[]).filter(
  (k) => bodies.some((b) => b.def.kind === k && b.def.id !== CORE),
);
const posOf = (b: Body): V3 => (FLAT ? b.flatPos : b.pos);

/* Strength → tube radius, over the OBSERVED strengths only. An absent strength has no place on a
   scale derived from measurements. */
const strengths = RELATIONS.map((r) => r.strength).filter((s): s is number => s !== null);
const S_MIN = Math.min(...strengths), S_MAX = Math.max(...strengths);
const LINK_R_MIN = 0.026, LINK_R_MAX = 0.086;
const linkRadius = (s: number): number =>
  LINK_R_MIN + (LINK_R_MAX - LINK_R_MIN) * ((s - S_MIN) / Math.max(1e-6, S_MAX - S_MIN));
const PIP_R = 0.052;

interface Seg {
  readonly rel: RelDef; readonly a: V3; readonly b: V3; readonly r: number;
  readonly dotted: boolean; readonly aId: string; readonly bId: string;
}
const segsOf = (flat: boolean): Seg[] => RELATIONS.flatMap((rel) => {
  const A = byId.get(rel.a), B = byId.get(rel.b);
  if (!A || !B) return [];
  return [{
    rel, aId: rel.a, bId: rel.b,
    a: flat ? A.flatPos : A.pos, b: flat ? B.flatPos : B.pos,
    r: rel.strength === null ? PIP_R : linkRadius(rel.strength),
    dotted: rel.strength === null,
  }];
});
const segs3D = segsOf(false);
const segsFlat = segsOf(true);

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CAMERA. 36 degrees, because a wide lens cannot render a deep space.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * A 46-degree lens on a system 15 metres across throws the outer shells past the frame edge and
 * exaggerates the depth between the near and far side of the same ring, so a circle reads as an
 * egg and two bodies on one shell read as two different distances from the core — destroying the
 * exact encoding radius is carrying. 36 compresses less; the rings stay round enough to be read as
 * rings.
 *
 * Elevation 26 rather than a plan view: at 0 the four planes collapse onto one line and the
 * environment has no argument left, and at 60 the reader is looking at a diagram again.
 */
/*
 * AZIMUTH 60 IS A MEASURED CHOICE, NOT A COMPOSITION. `cleanAzimuths` in the report lists the 12 of
 * 36 sweep positions at which no two bodies' projected discs merge; 34 — where this started — was not
 * one of them, and PARTNER and CAMPAIGN overlapped by 13 px there. A merged silhouette misreads a
 * record count, so the camera is picked from that list.
 */
const NEAR = 0.5, FAR = 90;
const AZIMUTH = 60;
const view: Viewpoint = FLAT
  /* THE FLAT CONTROL LOOKS STRAIGHT DOWN, because that is the only honest way to photograph a
     drawing that lives in one plane. 89 rather than 90: at the pole the azimuth is undefined. */
  ? { target: [0, 0, 0], distance: 22, azimuthDeg: AZIMUTH, elevationDeg: 89, fovDeg: 36, near: NEAR, far: FAR }
  : { target: [0, 0.4, 0], distance: 22, azimuthDeg: AZIMUTH, elevationDeg: 26, fovDeg: 36, near: NEAR, far: FAR };
const eye = eyeOf(view);
const FOV = view.fovDeg ?? 36;

/* CSS pixels per metre at a given distance from the eye, from the same fov the matrix uses. This is
   what converts every world-space size claim in this file into something a reader can actually
   resolve — a 2 cm tube is not an encoding if it lands on half a pixel. */
const CSS_W = W / SCALE, CSS_H = H / SCALE;
const pxPerMetreAt = (dist: number): number => (CSS_H / 2) / (Math.max(0.01, dist) * Math.tan((FOV / 2) * RAD));
const distFromEye = (p: V3): number => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CROSSING ANALYSIS — §7(b)'s argument, as numbers rather than as a picture.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const at3 = (p: V3, d: V3, t: number): V3 => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];

/** Closest points between two segments (Ericson). Returns their separation and both points. */
function segSeg(p1: V3, q1: V3, p2: V3, q2: V3): { dist: number; c1: V3; c2: V3 } {
  const d1 = sub3(q1, p1), d2 = sub3(q2, p2), r = sub3(p1, p2);
  const a = dot3(d1, d1), e = dot3(d2, d2), f = dot3(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return { dist: len3(r), c1: p1, c2: p2 };
  if (a <= 1e-12) { t = Math.min(1, Math.max(0, f / e)); } else {
    const c = dot3(d1, r);
    if (e <= 1e-12) { s = Math.min(1, Math.max(0, -c / a)); } else {
      const b = dot3(d1, d2), denom = a * e - b * b;
      s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const c1 = at3(p1, d1, s), c2 = at3(p2, d2, t);
  return { dist: len3(sub3(c1, c2)), c1, c2 };
}

/** Pairs that do not share an endpoint. Two edges meeting at a shared entity meet by design. */
const disjointPairs = (segs: readonly Seg[]): [Seg, Seg][] => {
  const outp: [Seg, Seg][] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]!, t = segs[j]!;
      if (s.aId === t.aId || s.aId === t.bId || s.bId === t.aId || s.bId === t.bId) continue;
      outp.push([s, t]);
    }
  }
  return outp;
};

/*
 * THE CAMERA-INDEPENDENT PART, AND IT IS THE WHOLE ARGUMENT.
 *
 * A screen crossing is only AMBIGUOUS — an X the reader cannot resolve — if the two tubes actually
 * graze in 3-D, because if they are further apart than the sum of their radii then one visibly
 * passes IN FRONT of the other at every viewpoint from which they cross at all. So the number of
 * grazing pairs is an upper bound on ambiguous crossings from ANY camera, and it does not depend on
 * one. In the flat layout every crossing pair grazes with separation exactly 0, which is not an
 * assumption here: the same routine measures it.
 */
function grazing(segs: readonly Seg[]): { pairs: number; minSeparation: number; worst: string[] } {
  let pairs = 0, minSep = Infinity;
  const worst: string[] = [];
  for (const [s, t] of disjointPairs(segs)) {
    const d = segSeg(s.a, s.b, t.a, t.b).dist;
    minSep = Math.min(minSep, d);
    if (d < s.r + t.r) { pairs++; worst.push(`${s.aId}~${s.bId} × ${t.aId}~${t.bId}`); }
  }
  return { pairs, minSeparation: Number.isFinite(minSep) ? minSep : 0, worst };
}

/** 2-D segment crossing, strictly interior. Returns the two parameters or null. */
function cross2(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): { t: number; u: number } | null {
  const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy;
  const den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const sx = cx - ax, sy = cy - ay;
  const t = (sx * r2y - sy * r2x) / den;
  const u = (sx * r1y - sy * r1x) / den;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return { t, u };
}

/* The view ray through a CSS pixel, built from the camera basis rather than from a matrix inverse
   (`@lcx/gl`'s math has no inverse and adding one for this would be a spine change for a
   diagnostic). Needed because the screen parameter of a projected segment is NOT its world
   parameter under perspective, so reading the depth off the 2-D t would be wrong by a few percent
   at the near end — small, and exactly the kind of small that turns a 0 into a 1. */
function rayThrough(v: Viewpoint, e: V3, sx: number, sy: number): V3 {
  const fwd = ((): V3 => { const d = sub3(v.target as V3, e); const l = len3(d) || 1; return [d[0] / l, d[1] / l, d[2] / l]; })();
  /* right = cross(fwd, +Y), which for up = (0,1,0) is (-f.z, 0, f.x). Written out because the sign
     is the entire content: I had it negated first, which mirrors the ray horizontally, and a mirrored
     ray still returns plausible finite depths — the crossing analysis would have reported separations
     measured at the wrong point with nothing looking wrong. Checked against the case fwd = (0,0,-1),
     where right must come out (1,0,0). */
  const rgt = ((): V3 => {
    const c: V3 = [-fwd[2], 0, fwd[0]];
    const l = len3(c) || 1; return [c[0] / l, c[1] / l, c[2] / l];
  })();
  const up: V3 = [rgt[1] * fwd[2] - rgt[2] * fwd[1], rgt[2] * fwd[0] - rgt[0] * fwd[2], rgt[0] * fwd[1] - rgt[1] * fwd[0]];
  const tanH = Math.tan((FOV / 2) * RAD);
  const ndcX = (sx / CSS_W) * 2 - 1, ndcY = 1 - (sy / CSS_H) * 2;
  const dx = fwd[0] + rgt[0] * ndcX * tanH * (CSS_W / CSS_H) + up[0] * ndcY * tanH;
  const dy = fwd[1] + rgt[1] * ndcX * tanH * (CSS_W / CSS_H) + up[1] * ndcY * tanH;
  const dz = fwd[2] + rgt[2] * ndcX * tanH * (CSS_W / CSS_H) + up[2] * ndcY * tanH;
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

/** Screen crossings at one viewpoint, and how many of them the depth order does not resolve. */
function screenCrossings(segs: readonly Seg[], v: Viewpoint): { total: number; ambiguous: number; minSep: number } {
  const e = eyeOf(v) as V3;
  const vp = viewProjection(v, CSS_W / CSS_H);
  const proj = new Map<Seg, { a: { sx: number; sy: number; behind: boolean }; b: { sx: number; sy: number; behind: boolean } }>();
  for (const s of segs) proj.set(s, { a: projectScreen(vp, s.a, CSS_W, CSS_H), b: projectScreen(vp, s.b, CSS_W, CSS_H) });
  let total = 0, ambiguous = 0, minSep = Infinity;
  for (const [s, t] of disjointPairs(segs)) {
    const ps = proj.get(s)!, pt = proj.get(t)!;
    if (ps.a.behind || ps.b.behind || pt.a.behind || pt.b.behind) continue;
    const x = cross2(ps.a.sx, ps.a.sy, ps.b.sx, ps.b.sy, pt.a.sx, pt.a.sy, pt.b.sx, pt.b.sy);
    if (!x) continue;
    total++;
    /* The separation MEASURED ALONG THE VIEW RAY through the crossing pixel, which is the quantity
       a reader's eye is being asked to resolve. */
    const sxp = ps.a.sx + (ps.b.sx - ps.a.sx) * x.t, syp = ps.a.sy + (ps.b.sy - ps.a.sy) * x.t;
    const dir = rayThrough(v, e, sxp, syp);
    const far: V3 = [e[0] + dir[0] * 400, e[1] + dir[1] * 400, e[2] + dir[2] * 400];
    const ca = segSeg(s.a, s.b, e, far).c1;
    const cb = segSeg(t.a, t.b, e, far).c1;
    const sep = len3(sub3(ca, cb));
    minSep = Math.min(minSep, sep);
    if (sep < s.r + t.r) ambiguous++;
  }
  return { total, ambiguous, minSep: Number.isFinite(minSep) ? minSep : 0 };
}

/*
 * TWO BODIES WHOSE PROJECTED DISCS MERGE, at an arbitrary viewpoint.
 *
 * Depth resolves an ambiguous link crossing, because one tube visibly passes in front of the other. It
 * does NOT resolve two spheres whose silhouettes merge: the nearer one eats the further one's outline
 * and the pair reads as one body with a lump on it. Size is an encoding here, so a merged silhouette is
 * a misread record count rather than untidiness — and it is the one failure of this layout that is
 * purely a function of where the camera is.
 */
function discsAt(v: Viewpoint): { id: string; cx: number; cy: number; r: number; behind: boolean }[] {
  const e = eyeOf(v) as V3;
  const vp = viewProjection(v, CSS_W / CSS_H);
  return bodies.map((b) => {
    const p = posOf(b);
    const q = projectScreen(vp, p, CSS_W, CSS_H);
    const d = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
    return { id: b.def.id, cx: q.sx, cy: q.sy, r: b.radius * pxPerMetreAt(d), behind: q.behind };
  });
}
function mergedDiscs(v: Viewpoint): string[] {
  const ds = discsAt(v);
  const hits: string[] = [];
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i]!, b = ds[j]!;
      if (a.behind || b.behind) continue;
      const gap = Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.r + b.r);
      if (gap < 0) hits.push(`${a.id}/${b.id} overlap ${(-gap).toFixed(1)}px`);
    }
  }
  return hits;
}

/** Crossings of the flat layout IN ITS OWN PLANE — camera-independent, because it is a drawing. */
function inPlaneCrossings(segs: readonly Seg[]): number {
  let n = 0;
  for (const [s, t] of disjointPairs(segs)) {
    if (cross2(s.a[0], s.a[2], s.b[0], s.b[2], t.a[0], t.a[2], t.b[0], t.b[2])) n++;
  }
  return n;
}

/** A link that passes through a body it is not attached to hides that body, in either layout. */
function throughBodies(segs: readonly Seg[], flat: boolean): string[] {
  const hits: string[] = [];
  for (const s of segs) {
    for (const b of bodies) {
      if (b.def.id === s.aId || b.def.id === s.bId) continue;
      const p = flat ? b.flatPos : b.pos;
      if (segSeg(s.a, s.b, p, p).dist < b.radius + s.r) hits.push(`${s.aId}~${s.bId} through ${b.def.id}`);
    }
  }
  return hits;
}

/*
 * IS THE FLAT LAYOUT'S CROSSING COUNT JUST A BAD ORDERING? Answered by search rather than by
 * assertion: the angular positions are permuted among the entities and the best result kept. If a
 * reordering could get the flat diagram to zero crossings then inclination would be buying nothing
 * and this environment would not be entitled to exist.
 */
const orderSearchStart = performance.now();
const ORDERINGS = 120000;
let flatBest = Infinity;
{
  const thetas = ENTITIES.filter((e) => e.id !== CORE).map((e) => e.thetaDeg);
  const ids = ENTITIES.filter((e) => e.id !== CORE).map((e) => e.id);
  const pos = new Map<string, V3>([[CORE, [0, 0, 0]]]);
  const perm = thetas.slice();
  for (let k = 0; k < ORDERINGS; k++) {
    if (k > 0) for (let i = perm.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = perm[i]!; perm[i] = perm[j]!; perm[j] = tmp;
    }
    for (let i = 0; i < ids.length; i++) {
      const b = byId.get(ids[i]!)!;
      pos.set(ids[i]!, orbitPoint(b.shell, perm[i]!, 0, 0));
    }
    const trial = RELATIONS.flatMap((rel): Seg[] => {
      const a = pos.get(rel.a), b = pos.get(rel.b);
      if (!a || !b) return [];
      return [{ rel, aId: rel.a, bId: rel.b, a, b, r: rel.strength === null ? PIP_R : linkRadius(rel.strength), dotted: rel.strength === null }];
    });
    const c = inPlaneCrossings(trial);
    if (c < flatBest) flatBest = c;
    if (flatBest === 0) break;
  }
}
const orderSearchMs = performance.now() - orderSearchStart;

const flatPlane = inPlaneCrossings(segsFlat);
const graze3D = grazing(segs3D);
const grazeFlat = grazing(segsFlat);
const hereCrossings = screenCrossings(FLAT ? segsFlat : segs3D, view);
/*
 * THE AZIMUTH SWEEP. The camera-independent bound above says no viewpoint can produce an ambiguous
 * crossing; this is the empirical check on that claim at 36 viewpoints, because a proof and a
 * measurement disagreeing is how a wrong proof gets found.
 */
const sweep = Array.from({ length: 36 }, (_, i) => {
  const v: Viewpoint = { ...view, azimuthDeg: i * 10 };
  const c = screenCrossings(segs3D, v);
  return { azimuthDeg: i * 10, total: c.total, ambiguous: c.ambiguous, mergedDiscs: mergedDiscs(v).length };
});
const sweepWorstAmbiguous = Math.max(...sweep.map((s) => s.ambiguous));
const sweepTotals = [Math.min(...sweep.map((s) => s.total)), Math.max(...sweep.map((s) => s.total))];
/* THE AZIMUTH IS CHOSEN BY MEASUREMENT. Merged silhouettes are the one defect that depends only on
   where the camera is, so the sweep counts them at every 10 degrees and this lists the clean ones.
   The capture's azimuth is one of them; if the layout changes and that stops being true, this number
   says so instead of the frame quietly gaining a body with a lump on it. */
const cleanAzimuths = sweep.filter((s) => s.mergedDiscs === 0).map((s) => s.azimuthDeg);

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * GEOMETRY AND THE DRAW LIST.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
/*
 * THE PLATE HAS EDGES, AND THE FIRST ONE DID NOT.
 *
 * A 64 m deck fills the entire frame, and a frame that is 85% mid-grey plate reads as dark scribbles
 * on paper: the bodies stop being lit objects in space and become marks on a surface. A 26 m plate
 * shows all four of its own edges inside the frame, so it reads as an INSTRUMENT the system stands
 * on, with dark space around it doing the framing.
 *
 * It also rose from -3.6 to -2.6, and that is about attribution rather than composition. A body's gap
 * from its own shadow IS its height above the plane; at 3.6 m of drop, with the camera at 26 degrees,
 * the shadows landed in a heap at the bottom of the frame where no reader could match one to its
 * body, and an unattributable shadow is a depth cue that does not cue anything.
 */
const DECK_Y = -2.6;
const deckGeo = plane(26, 52);
/* ONE UNIT SPHERE, SCALED PER BODY. A uniform scale leaves a normal's DIRECTION unchanged, so the
   identity normal matrix is correct here — the shader normalises what it is handed. */
const unitSphereGeo = sphere(1, 22, 30);
const pipGeo = sphere(PIP_R, 10, 14);
/*
 * A FAT TUBE, BECAUSE A THIN RING FACING THE CAMERA IS LIT BY NOTHING.
 *
 * Once the ring aims its axis at the eye, its surface normals point at the READER — and the key light
 * comes from above, so almost none of the ring takes the light and a 6 cm tube came back as a faint
 * amber outline barely separable from the plate. The lit part of a camera-facing torus is the top of
 * its tube, so the tube has to be thick enough for that arc to be a shape: 9.5 cm gives an 8 px band.
 * Roughness up and metalness down for the same reason — the diffuse term is all there is here.
 */
const absentGeo = torus(ABSENT_RING_R, ABSENT_TUBE_R, 48, 16);
const withheldGeo = cylinder(WITHHELD_R, WITHHELD_H, 40);
/* A UNIT CYLINDER along Y, radius 1, height 1, so the link's model matrix carries the thickness in
   two columns and the length in the third and nothing has to be re-uploaded per link. */
const linkGeo = cylinder(1, 1, 16);
/*
 * THE RING TUBE IS 3.2 cm BECAUSE 1.4 cm WAS SUB-PIXEL, and I chose the first number by eye.
 *
 * At this camera the system centre is 190 px per metre in the vertical sense but only ~44 px per
 * metre at 25 m of distance, so a 1.4 cm tube is a 1.2 px line: anti-aliased to a smear, and the
 * orbit structure the whole layout rests on was almost absent from the frame. It read as "the rings
 * are a dark colour" and it was not a colour problem at all. 3.2 cm is 2.8 px, which `ringPx` in the
 * report states so the next camera move cannot quietly lose them again.
 */
const RING_TUBE = 0.032;
const ringGeos = [1, 2, 3].map((h) => torus(shellRadius(h), RING_TUBE, 96, 8));

const deckMesh = required('deck', uploadMesh(stage, deckGeo));
const sphereMesh = required('sphere', uploadMesh(stage, unitSphereGeo));
const pipMesh = required('pip', uploadMesh(stage, pipGeo));
const absentMesh = required('absent', uploadMesh(stage, absentGeo));
const withheldMesh = required('withheld', uploadMesh(stage, withheldGeo));
const linkMesh = required('link', uploadMesh(stage, linkGeo));
const ringMeshes = ringGeos.map((g, i) => required(`ring${i}`, uploadMesh(stage, g)));

const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
/* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0, and every vertex then collapses
   to the origin with a complete framebuffer and no error raised anywhere. It cost E0 a day. */
const scaledAt = (p: V3, s: number): Float32Array => {
  const m = IDENTITY();
  m[0] = s; m[5] = s; m[10] = s;
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  return m;
};

/*
 * A LINK'S MODEL MATRIX IS A BASIS, NOT A ROTATION I SOLVED FOR.
 *
 * Two of the columns are the tube's radial directions scaled by its thickness and the third is the
 * link direction scaled by its length; the translation is the midpoint. Building it this way means
 * there is no axis-angle to get backwards and no gimbal case to special-case — only the degenerate
 * one where the two entities coincide, which cannot happen here and refuses anyway.
 *
 * The normal matrix is the inverse transpose, which for M = [u·r | d·L | v·r] is [u/r | d/L | v/r].
 * Getting this wrong under non-uniform scale does not throw: it lights the tube as though it were
 * round when it is thin, which reads as a material that is subtly wrong and nothing more.
 */
function linkTransform(a: V3, b: V3, r: number): { model: Float32Array; normal: Float32Array } | null {
  const d = sub3(b, a); const L = len3(d);
  if (L < 1e-6) return null;
  const dn: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: V3 = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0: V3 = [dn[1] * ref[2] - dn[2] * ref[1], dn[2] * ref[0] - dn[0] * ref[2], dn[0] * ref[1] - dn[1] * ref[0]];
  const ul = len3(u0) || 1;
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [dn[1] * u[2] - dn[2] * u[1], dn[2] * u[0] - dn[0] * u[2], dn[0] * u[1] - dn[1] * u[0]];
  const m = IDENTITY();
  m[0] = u[0] * r; m[1] = u[1] * r; m[2] = u[2] * r;
  m[4] = dn[0] * L; m[5] = dn[1] * L; m[6] = dn[2] * L;
  m[8] = v[0] * r; m[9] = v[1] * r; m[10] = v[2] * r;
  m[12] = (a[0] + b[0]) / 2; m[13] = (a[1] + b[1]) / 2; m[14] = (a[2] + b[2]) / 2;
  const n = new Float32Array([
    u[0] / r, u[1] / r, u[2] / r,
    dn[0] / L, dn[1] / L, dn[2] / L,
    v[0] / r, v[1] / r, v[2] / r,
  ]);
  return { model: m, normal: n };
}

/*
 * THE ABSENT RING HAS TO FACE THE READER, AND ITS FIRST VERSION DID NOT.
 *
 * `torus` lies in the XZ plane, so an unrotated ring is HORIZONTAL — and at a 26-degree camera a
 * horizontal ring is a 3-pixel-tall sliver. The capture showed an amber smear that read as a
 * rendering fault rather than as a ring, which destroys the whole point: the ring's job is to be
 * visibly NOT a sphere, and a ring nobody can see is on the size scale after all.
 *
 * So its axis aims at the eye. That is the same measured-facing trick E1 and E6 use for their panels,
 * and for the same reason: a facing derived from a convention can be backwards, while one aimed at the
 * camera cannot be.
 */
function facingBasis(p: V3, towards: V3): { model: Float32Array; normal: Float32Array } {
  const d = sub3(towards, p); const L = len3(d) || 1;
  const ax: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0: V3 = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]];
  const ul = len3(u0) || 1;
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  const m = IDENTITY();
  m[0] = u[0]; m[1] = u[1]; m[2] = u[2];
  m[4] = ax[0]; m[5] = ax[1]; m[6] = ax[2];
  m[8] = v[0]; m[9] = v[1]; m[10] = v[2];
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  /* A rotation's inverse transpose is itself, so the same nine numbers serve. */
  return { model: m, normal: new Float32Array([u[0], u[1], u[2], ax[0], ax[1], ax[2], v[0], v[1], v[2]]) };
}

/*
 * COLOUR CARRIES THE DATA STATE, NOT THE ENTITY KIND — and that is a deliberate division.
 *
 * Kind is already encoded by inclination, which is the axis this environment exists to spend. Using
 * colour for it as well would leave nothing for the distinction the honesty rules actually require:
 * observed versus absent versus withheld. So every observed body is the same brand blue and the
 * palette stays exact under `assertBrandFidelity`; four invented kind hues would not have.
 */
const OBSERVED_HEX = '#2C6BFF';
const LINK_HEX = '#7FB2FF';
const ABSENT_HEX = '#FF8A3D';
const WITHHELD_HEX = '#6B7A99';
/* The rings are the AXIS and the tubes are the DATA, so the rings must lose on value. At #33497A they
   were the same weight as the links and nine of them read as spaghetti competing with thirteen
   relationships. Same thickness, lower value: structure recedes. */
const RING_HEX = '#22355E';
/* Darker than the palette's `plate` (#0E1628), and deliberately: a horizontal plane takes the key
   light at nearly N·L = 1, so the plate's own albedo is the only thing holding it below the bodies
   in value. At #0E1628 it came back a mid grey that the brand blue had to fight. */
const DECK_HEX = '#090F1C';
const CLEAR_HEX = '#05070E';

const draws: LitDraw[] = [
  { mesh: deckMesh, model: scaledAt([0, DECK_Y, 0], 1), normalMat: N3,
    material: { baseColour: hexToLinear(DECK_HEX), roughness: 0.90, metalness: 0 } },
];
/*
 * STRUCTURE DOES NOT CAST. The orbit rings are reference geometry — the axis, not the data — and in
 * the first capture nine of them dropped nine concentric shadow ellipses onto the plate. The result
 * was a plate covered in rings that looked exactly like more orbits, sitting where the BODIES'
 * shadows are the only thing a reader is meant to be reading. The lie is subtle and total: a shadow
 * of an axis is indistinguishable from an axis, so the frame appeared to have twice as many orbits
 * as the ontology has shells.
 *
 * Then the LINKS came out too. Their shadows were near-vertical black stripes down the plate, and a
 * dark stripe on a plate covered in tubes reads as another tube. The shadow is here to say how high
 * each BODY sits above the reference plane; anything else it says is noise on top of that, so the
 * caster list is bodies only and the plate carries exactly eleven ellipses.
 */
const casters: LitDraw[] = [];

/*
 * One ring per (kind, shell) that is actually occupied. A ring drawn where no entity sits would be
 * a structure claiming a population it does not have.
 *
 * IN THE FLAT CONTROL THE RINGS DEDUPE BY SHELL, and that is not a rendering convenience. With
 * inclinations zeroed, PARTY's one-hop ring and INSTRUMENT's one-hop ring are the SAME circle —
 * coincident geometry, which z-fights. The collapse is the point being demonstrated: the flat layout
 * has one ring per shell because it has no axis left on which to keep the kinds' rings apart.
 */
const ringsDrawn: { kind: Kind; hops: number }[] = [];
let ringsCollapsed = 0;
for (const kind of ORBITED_KINDS) {
  for (const h of [1, 2, 3]) {
    if (!bodies.some((b) => b.def.kind === kind && b.hops === h && b.def.id !== CORE)) continue;
    if (FLAT && ringsDrawn.some((r) => r.hops === h)) { ringsCollapsed++; continue; }
    const pl = PLANE[kind];
    const basis = orbitBasis(FLAT ? 0 : pl.incDeg, FLAT ? 0 : pl.nodeDeg);
    draws.push({
      mesh: ringMeshes[h - 1]!, model: basis.model, normalMat: basis.normal,
      material: { baseColour: hexToLinear(RING_HEX), roughness: 0.55, metalness: 0.2 },
    });
    ringsDrawn.push({ kind, hops: h });
  }
}

/* Links BEFORE bodies in the list only affects shadow-pass order, which is order-independent; the
   depth buffer settles the rest. Grouped for readability, not for correctness. */
const linkDraws = (FLAT ? segsFlat : segs3D).flatMap((s): LitDraw[] => {
  if (s.dotted) {
    /* A LINE OF PIPS, spaced by their own diameter so the gaps read as gaps. Deliberately not a
       tube: an unmeasured strength must not land anywhere on the thickness scale. */
    const L = len3(sub3(s.b, s.a));
    const n = Math.max(3, Math.round(L / (PIP_R * 4.2)));
    return Array.from({ length: n - 1 }, (_, i) => {
      const t = (i + 1) / n;
      const p: V3 = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + (s.b[2] - s.a[2]) * t];
      return {
        mesh: pipMesh, model: scaledAt(p, 1), normalMat: N3,
        material: { baseColour: hexToLinear(ABSENT_HEX), roughness: 0.42, metalness: 0.1 },
      };
    });
  }
  const tf = linkTransform(s.a, s.b, s.r);
  if (!tf) return [];
  return [{
    mesh: linkMesh, model: tf.model, normalMat: tf.normal,
    material: { baseColour: hexToLinear(LINK_HEX), roughness: 0.34, metalness: 0.12 },
  }];
});
draws.push(...linkDraws);

for (const b of bodies) {
  const p = posOf(b);
  const facing = facingBasis(p, eye as V3);
  const d: LitDraw = b.def.count.state === 'absent'
    ? {
      mesh: absentMesh, model: facing.model, normalMat: facing.normal,
      material: { baseColour: hexToLinear(ABSENT_HEX), roughness: 0.52, metalness: 0.04 },
    }
    : b.def.count.state === 'withheld'
      ? {
        mesh: withheldMesh, model: scaledAt(p, 1), normalMat: N3,
        /*
         * METALNESS 0.15, NOT 0.58 — and this was a material error, not a taste one.
         *
         * A metal has no diffuse term: it shows its ENVIRONMENT. The environment here is
         * `DEFAULT_SKY`, a dark instrument interior whose zenith is 0.012, so a 0.58-metal drum in
         * this scene reflected almost nothing and came back very nearly black. The one body whose
         * job is to say "a record is here and you may not read it" was the hardest thing on the
         * frame to see. Steel that reads as steel needs the diffuse term in a dark room.
         */
        material: { baseColour: hexToLinear(WITHHELD_HEX), roughness: 0.42, metalness: 0.15 },
      }
      : {
        mesh: sphereMesh, model: scaledAt(p, b.radius), normalMat: N3,
        material: {
          baseColour: hexToLinear(OBSERVED_HEX),
          roughness: b.def.id === CORE ? 0.22 : 0.34,
          metalness: b.def.id === CORE ? 0.36 : 0.08,
        },
      };
  draws.push(d);
  casters.push(d);
}

/*
 * THE LIGHT IS MOSTLY OVERHEAD, AND THE SHADOWS IT DROPS ARE LOAD-BEARING.
 *
 * A sphere floating over a plate is at an ambiguous height: the eye cannot separate "small and
 * close to the plate" from "large and high above it", which is the whole reading inclination
 * depends on. Its shadow on the plate resolves it — the gap between a body and its own shadow IS
 * the height, and `?shadow=0` is the control that shows the layout losing its third axis while
 * every other pass still runs.
 */
/* Nearly vertical, at 0.14 / 0.20 off plumb. A more oblique key throws each shadow a metre and a
   half sideways, and at that offset the reader cannot tell whether the gap between a body and a
   shadow is the body's HEIGHT or the light's ANGLE — which is the one thing the shadow is here to
   say. Steep enough to attribute, tilted enough that the spheres keep a terminator. */
const lightDir: [number, number, number] = [0.14, -0.966, -0.22];
const sceneMin: [number, number, number] = [-8.2, DECK_Y, -8.2];
const sceneMax: [number, number, number] = [8.2, 5.0, 8.2];
const lightVP = lightViewProjection(
  { direction: lightDir, colour: [1, 1, 1], extent: 10.5 },
  boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
);

const tris = triangleCount(deckGeo)
  + ringsDrawn.reduce((n, r) => n + triangleCount(ringGeos[r.hops - 1]!), 0)
  + bodies.filter((b) => b.def.count.state === 'observed').length * triangleCount(unitSphereGeo)
  + triangleCount(absentGeo) + triangleCount(withheldGeo)
  + linkDraws.filter((d) => d.mesh === linkMesh).length * triangleCount(linkGeo)
  + linkDraws.filter((d) => d.mesh === pipMesh).length * triangleCount(pipGeo);

/* MUTABLE, so the AO pass can be measured against its own absence in one page rather than by diffing
   two screenshots outside the harness. Initialised from the URL and restored after the measurement. */
let aoEnabled = AO_ON;

function frame() {
  const vp = viewProjection(view, W / H);
  if (SHADOW_ON) lit.shadowPass(lightVP, casters, shadow);
  target.bind();
  /*
   * NO SKY BACKDROP. `skyColour` is an environment, not a background, and the orrery is a system on
   * a plate in the dark: a gradient dome behind it would put its brightest region at the top of the
   * frame, exactly where the outer bodies are, and the silhouettes that carry the layout would go.
   * The sky still lights the specular term through `bindSky`, which is the part of it doing work.
   */
  const cc = hexToLinear(CLEAR_HEX);
  gl.clearColor(cc[0], cc[1], cc[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  lit.depthPrepass(vp, draws);
  if (aoEnabled) {
    /* NEAR AND FAR COME FROM THE SAME TWO CONSTANTS THE PROJECTION USED. AO linearises the depth
       buffer, so a near/far here that does not match the matrix that wrote it reconstructs the
       wrong world positions and the occlusion radius silently means something else — a mismatch
       that produces a plausible, wrong AO rather than an error. */
    ao.compute({ depthTexture: target.depthTexture, near: NEAR, far: FAR, fovDeg: FOV, aspect: W / H, radius: 0.9, strength: 2.0 });
    target.bind();
  }
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [3.1, 3.05, 2.95],
    ambientGain: 0.52, lightVP, shadow: SHADOW_ON ? shadow : null, shadowStrength: 0.92, draws,
    ao: aoEnabled ? ao.texture : null, screenSize: [W, H],
    fog: null,
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  stage.blit(present, (prog) => gl.uniform1i(gl.getUniformLocation(prog, 'uScene'), 0));
}

/*
 * THE INSTRUMENT. `gl.finish()` returns once the command buffer is FLUSHED, not once the GPU has
 * finished, and that error published two frame times in this programme that were 140x wrong. A
 * trailing `readPixels` cannot be satisfied until the frame it reads actually exists. The warm-up
 * frame matters too: the first frame pays shader upload and texture allocation.
 */
/*
 * AND IT HAS A WALL-CLOCK CEILING, because a frame ceiling is not one. This loop is synchronous, so an
 * unbounded count is an unbounded main-thread block: `?frames=1e9` left the renderer process unable to
 * service a Playwright evaluation at all — the harness reported a timeout, which names the waiter rather
 * than the loop, and E9's task page polls the same title through an iframe. Clamping the COUNT alone does
 * not fix it: 20000 frames of this system under SwiftShader is over an hour. The sweep therefore stops on
 * the clock and reports how many frames it actually timed, because a truncated sweep that says so is a
 * measurement and one that does not is a lie about n.
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
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { msPerFrame: (performance.now() - t0) / measured, measured };
}
/* `timing`, not `sweep`: this file already has a `sweep` — the 36-azimuth crossing survey above — and two
   different sweeps under one name is the kind of collision a minifier resolves silently. */
const timing = measure(FRAMES);
const ms = timing.msPerFrame;

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS THE AO PASS ACTUALLY WORTH? Measured in the page, against its own absence.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * §6.3.3 assigns L2.7 to E4, so the pass is here and it runs. Whether it does anything is a separate
 * question, and "the AO is on" is the easiest claim in this file to make and not deliver: a broken AO
 * pass, a wrongly linearised depth, or an occlusion term multiplying a near-zero ambient all produce a
 * complete, plausible frame with every program compiled and no error raised.
 *
 * So the frame is rendered twice — once with the pass, once without — and the two are compared pixel
 * for pixel. It is the same shape of check as E1's shadow probe: two populations that come out equal
 * mean the pass is doing nothing, whatever the code says.
 */
interface AoEffect {
  maxDelta: number; changed: number; fraction: number; sampled: number;
  meanWith: number; meanWithout: number; glErrorInProbe: number; refusal: string | null;
}
function aoEffect(): AoEffect {
  const none = { maxDelta: 0, changed: 0, fraction: 0, sampled: 0, meanWith: 0, meanWithout: 0, glErrorInProbe: 0 };
  if (!AO_ON) return { ...none, refusal: 'AO_DISABLED_BY_PARAM' };
  /*
   * THE PROBE REFUSES WITHOUT THE SHADOW PASS, and finding out why found a defect in `@lcx/gl`.
   *
   * In the `?flat=1` and `?shadow=0` captures the probe came back with `maxDelta: 739` of 765 and 96%
   * of the frame changed — a hundred times the live figure — and `glErrorInProbe: 1282`
   * (GL_INVALID_OPERATION). The mean pixel value fell from 28.3 to 8.67: the second render was more
   * than three times darker, and nothing about ambient occlusion can do that.
   *
   * The cause is the COMBINATION. `lit.draw` handles a missing shadow map by setting
   * `uShadowStrength` to 0 and a missing AO texture by setting `uAOEnabled` to 0 — but in neither case
   * does it bind anything to the sampler, so with BOTH absent `uShadowMap` and `uAO` are left pointing
   * at texture units that hold whatever the last pass left there, which after the composite blit is
   * the RGBA16F scene target. Sampling a float colour target through those samplers is the invalid
   * operation, and its undefined result is what collapses the frame. Each guard is individually
   * correct and the two together are not — which is worth reporting upstream, because that pairing is
   * exactly what a low-end quality tier would select.
   *
   * So the probe refuses rather than publishing 739. A difference that large is not attributable to
   * the pass under test, and a number that measures the engine's null-resource path while claiming to
   * measure occlusion is worse than no number.
   */
  if (!SHADOW_ON) return { ...none, refusal: 'AO_PROBE_REQUIRES_SHADOW_PASS' };
  const withAO = new Uint8Array(W * H * 4);
  const without = new Uint8Array(W * H * 4);
  gl.getError();
  aoEnabled = true; frame();
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, withAO);
  aoEnabled = false; frame();
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, without);
  /* Read INSIDE the probe. `getError` reports the first error since the last call and clears it, so a
     single check in the report cannot say whether an error came from the probe or from the scene. */
  const glErrorInProbe = gl.getError();
  aoEnabled = AO_ON;
  let sumWith = 0, sumWithout = 0;
  for (let i = 0; i < withAO.length; i += 4) {
    sumWith += withAO[i]! + withAO[i + 1]! + withAO[i + 2]!;
    sumWithout += without[i]! + without[i + 1]! + without[i + 2]!;
  }
  let maxDelta = 0, changed = 0;
  for (let i = 0; i < withAO.length; i += 4) {
    const d = Math.abs(withAO[i]! - without[i]!) + Math.abs(withAO[i + 1]! - without[i + 1]!)
      + Math.abs(withAO[i + 2]! - without[i + 2]!);
    if (d > maxDelta) maxDelta = d;
    /* 6 out of a possible 765: three channels' worth of one code each, which is the floor below which a
       difference is dithering rather than shading. */
    if (d > 6) changed++;
  }
  const sampled = W * H;
  return {
    maxDelta, changed, fraction: Number((changed / sampled).toFixed(5)), sampled,
    meanWith: Number((sumWith / (sampled * 3)).toFixed(2)),
    meanWithout: Number((sumWithout / (sampled * 3)).toFixed(2)),
    glErrorInProbe, refusal: null,
  };
}
const aoMeasured = aoEffect();

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DOM LAYER.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const vpFinal = viewProjection(view, W / H);

const wrap = document.createElement('div');
/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to the canvas box or it extends
   the PAGE box, and a surface seen nearly edge-on produces a homography whose coefficients are
   enormous — the element's transformed box then runs to millions of pixels and Playwright's
   `fullPage` screenshot fails with "Unable to capture screenshot", naming the screenshot rather
   than the transform three layers away that caused it. */
wrap.style.cssText = `position:relative;overflow:hidden;width:${CSS_W}px;height:${CSS_H}px`;
canvas.parentNode?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
const overlay = document.createElement('div');
/*
 * THE CONTAINER IGNORES THE POINTER; THE CONTENT DOES NOT — and until now neither did.
 *
 * `project.ts` justifies its own existence on the grounds that "GL text is unselectable, unsearchable,
 * invisible to a screen reader" and that the homography makes "the browser rasterise real selectable
 * text". Measured across the six environments that project: `document.elementFromPoint` at the centre of
 * every label returned the canvas, and a real mouse drag across the frame selected the empty string.
 * Cmd/Ctrl+A still reached the words, so the text was IN the document and unreachable with a pointer — a
 * reader could not point at an entity's record count and copy it.
 *
 * `pointer-events:none` stays on the container, which must not swallow a gesture aimed at the canvas; each
 * label re-enables it and asks for `user-select:text`. Nothing here is interactive, so the only cost is a
 * drag that STARTS inside a label.
 */
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);
/* Appended to every label below. One string so the label kinds cannot drift apart. */
const SELECTABLE = 'pointer-events:auto;user-select:text;-webkit-user-select:text';

/**
 * One styled line of TEXT, built as an element rather than as a string of markup.
 *
 * An entity id and its meta line were interpolated into `innerHTML`. Both are strings a real ontology
 * supplies rather than this file, and `innerHTML` PARSES its argument: `&` in an id corrupts the label
 * silently and `<` starts an element, on the surface a reader trusts most. The same values go through
 * `escText` in the flat table, so the frame and the fallback would have disagreed about the same entity.
 *
 * Deliberately a text constructor rather than an escaping helper: an escape has to be remembered at every
 * future interpolation, and `textContent` does not parse at all.
 */
const textLine = (css: string, text: string): HTMLDivElement => {
  const d = document.createElement('div');
  d.style.cssText = css;
  d.textContent = text;
  return d;
};
/** The same, for the inline `<span>` the ticks use beside their anchor dot. */
const textSpan = (text: string): HTMLSpanElement => {
  const sp = document.createElement('span');
  sp.textContent = text;
  return sp;
};
/** The anchor dot the ticks put before their text. Markup-free, so it cannot carry a value at all. */
const anchorDot = (background: string): HTMLSpanElement => {
  const sp = document.createElement('span');
  sp.style.cssText = `width:5px;height:5px;border-radius:50%;background:${background};flex:0 0 auto`;
  return sp;
};

/*
 * ENTITY LABELS ARE SCREEN-SPACE, AND THE 26 px SURFACE FLOOR DOES NOT TRANSFER HERE.
 *
 * E5 settled the principle: content belongs ON a surface, annotation belongs IN FRONT of it. A
 * record slab in E6 is content and is therefore projected onto its own face with `projectQuad`,
 * where a 26 px minimum projected width is the honest legibility floor. An entity name is
 * annotation of a body seen from outside, and projecting it onto a world-space plate would size it
 * by the body's world size: a 1.3 m billboard beside a 0.4 m sphere is 58 px wide at this distance,
 * so its type would render at 3 px. Enlarging the billboard until the type worked would make the
 * labels larger than the system they annotate.
 *
 * So the labels are constant-size and anchored by `projectScreen`, and the legibility floor moves
 * to the SUBJECT rather than the text: a body whose projected diameter is under 9 px is an
 * anti-aliased dot, and a name attached to it names a smudge. `bodyPx` is reported per entity so
 * that floor is checkable. The one thing here that IS content on a surface — the caption on the
 * reference plane — does use `projectQuad`, and does carry the 26 px floor.
 */
const MIN_BODY_PX = 9;

type Rect = { x: number; y: number; w: number; h: number };
const overlapArea = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/*
 * EVERY BOX IS MEASURED BY THE BROWSER, NOT ESTIMATED FROM A CHARACTER WIDTH.
 *
 * The first version computed each label's width as `chars × 6.6`, and 6.6 px is wrong for 9.5 px
 * monospace carrying `letter-spacing: .08em`. The under-estimate did not overflow visibly — it made
 * the box narrow, so `SETTLEMENT`'s second line WRAPPED, and the capture showed the word "REC" alone
 * on a third line under a two-line label. Worse, the collision test was then using boxes that were
 * not the boxes on screen, so it was certifying an arrangement that did not exist.
 *
 * There is a browser here. It knows exactly how wide the text is, and asking it removes the entire
 * class of error rather than tuning the constant.
 */
function measured(el: HTMLElement): Rect {
  el.style.left = '-99999px';
  el.style.top = '0px';
  el.style.visibility = 'hidden';
  overlay.appendChild(el);
  const r = el.getBoundingClientRect();
  return { x: 0, y: 0, w: Math.ceil(r.width), h: Math.ceil(r.height) };
}
function place(el: HTMLElement, at: Rect): void {
  el.style.left = `${at.x.toFixed(1)}px`;
  el.style.top = `${at.y.toFixed(1)}px`;
  el.style.visibility = 'visible';
}

/*
 * ONE OBSTACLE SET, FILLED IN PRIORITY ORDER, AND THAT ORDER IS AN EDITORIAL DECISION.
 *
 * In the first capture the entity labels were tested only against each other, so `3 HOPS` landed on
 * top of `PERSON`, `CONTROL 62°` on top of `COUNTERPARTY`, and `EVENT −29°` inside `QUEST`'s box.
 * Each system was individually correct and the frame had five collisions.
 *
 * The axis keys go down FIRST and win, because a body whose name is missing is one unnamed body,
 * whereas a missing plane label makes the inclination encoding unreadable for every body on that
 * plane — the labels are the only place the reader learns which plane is which kind. Then entity
 * labels compete, nearest first.
 */
const counts = {
  observed: bodies.filter((b) => b.def.count.state === 'observed').length,
  absent: bodies.filter((b) => b.def.count.state === 'absent').length,
  withheld: bodies.filter((b) => b.def.count.state === 'withheld').length,
};

const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px;'
  + SELECTABLE;
hud.innerHTML =
  `<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">`
  + `ONTOLOGY AS ORBITS · ${FLAT ? 'FLAT CONTROL — INCLINATIONS ZEROED' : 'RADIUS = HOPS · SIZE = RECORDS · TUBE = STRENGTH'}</div>`
  + `<div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.84)">`
  + `${FLAT
    ? `${flatPlane} CROSSINGS IN PLANE &nbsp;·&nbsp; ${grazeFlat.pairs} AMBIGUOUS (NO DEPTH TO RESOLVE THEM)`
    : `${hereCrossings.total} CROSSINGS ON SCREEN &nbsp;·&nbsp; ${hereCrossings.ambiguous} AMBIGUOUS &nbsp;·&nbsp; FLAT LAYOUT: ${flatPlane} OF ${flatPlane}`}<br>`
  + `INCLINATION SEPARATES ${ORBITED_KINDS.length} ENTITY KINDS &nbsp;·&nbsp; ${bodies.length} ENTITIES, ${RELATIONS.length} RELATIONSHIPS</div>`
  + `<div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC ONTOLOGY</div>`;
overlay.appendChild(hud);

/* A THICKNESS SCALE, because an encoding nobody can calibrate is not an encoding. The bar heights
   are the ACTUAL projected pixel thicknesses at the system's centre distance, computed from the
   same radius mapping the tubes were built with — so a reader comparing a bar to a tube is
   comparing like with like rather than to a legend somebody drew by hand. */
const centreDist = distFromEye([0, 0, 0]);
const ppmCentre = pxPerMetreAt(centreDist);
const legend = document.createElement('div');
legend.style.cssText = 'position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;'
  + 'gap:7px;align-items:flex-end;font:500 10px/1 ui-monospace,monospace;color:rgba(196,212,240,0.85);'
  + SELECTABLE;
const bar = (s: number): string => {
  const px = Math.max(1, 2 * linkRadius(s) * ppmCentre);
  return `<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH ${s.toFixed(2)}</span>`
    + `<span style="width:46px;height:${px.toFixed(1)}px;background:${LINK_HEX};display:inline-block"></span></div>`;
};
legend.innerHTML = bar(S_MIN) + bar((S_MIN + S_MAX) / 2) + bar(S_MAX)
  /* THE PARENTHESES ARE THE FIX. `'a' + X + 'b'.repeat(5)` binds `.repeat` to the LAST literal only,
     so this legend row rendered as `">">">">` — five copies of a closing tag fragment, printed as
     text, in the middle of the legend. Member access binds tighter than `+`, and a template literal
     hid it from any linter that might have asked. */
  + `<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH NEVER MEASURED</span>`
  + `<span style="width:46px;display:inline-flex;gap:3px;justify-content:space-between">`
  + `${('<span style="width:5px;height:5px;border-radius:50%;background:' + ABSENT_HEX + '"></span>').repeat(5)}</span></div>`
  + `<div style="height:4px"></div>`
  + `<div style="display:flex;align-items:center;gap:8px"><span>RECORDS OBSERVED · ${counts.observed}</span>`
  + `<span style="width:11px;height:11px;border-radius:50%;background:${OBSERVED_HEX};display:inline-block"></span></div>`
  + `<div style="display:flex;align-items:center;gap:8px"><span>RECORDS ABSENT · ${counts.absent} (RING — NOT ON THE SIZE SCALE)</span>`
  + `<span style="width:11px;height:11px;border-radius:50%;border:3px solid ${ABSENT_HEX};box-sizing:border-box;display:inline-block"></span></div>`
  + `<div style="display:flex;align-items:center;gap:8px"><span>WITHHELD · ${counts.withheld} (DRUM — PRESENT, UNLABELLED)</span>`
  + `<span style="width:11px;height:11px;background:${WITHHELD_HEX};display:inline-block"></span></div>`;
overlay.appendChild(legend);
/*
 * THE HUD AND THE LEGEND ARE OBSTACLES, and leaving them out cost a collision that four other
 * systems were individually right about.
 *
 * They are placed FIRST and pushed into the obstacle set, because they are the key to every encoding
 * on the frame — a plane label that lands on the legend has destroyed the legend to say one word. In
 * the flat control `INSTRUMENT 0°` did exactly that, printing itself through `RECORDS ABSENT · 1`.
 * Measured against the wrapper rather than assumed from the CSS, because `bottom: 16px` is not a
 * number this code knows the top edge of.
 */
const rectOf = (el: HTMLElement): Rect => {
  const a = el.getBoundingClientRect(), b = wrap.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
};

const obstacles: Rect[] = [rectOf(hud), rectOf(legend)];
/* From `discsAt`, the same routine the azimuth sweep uses. A second projection of the same spheres
   here would be two pieces of code that have to agree about where a body is. */
const bodyDiscs = discsAt(view).map((d) => ({
  id: d.id, behind: d.behind,
  box: { x: d.cx - d.r, y: d.cy - d.r, w: 2 * d.r, h: 2 * d.r } as Rect,
}));
/*
 * TEXT NEVER HIDES A BODY. A box over an entity's disc costs the reader the datum, and the label is
 * only its name.
 *
 * 12% OF THE DISC, NOT 30%. Thresholded at all rather than at any touch, because a one-pixel graze
 * costs nothing and refusing on it drops labels for no gain — but 30% was chosen without looking, and
 * at 30% the capture put `1 HOP · 412 REC` across the bottom of PARTNER's sphere at 19% coverage:
 * within tolerance, and text on a sphere. 12% is roughly where a corner clips and nothing more.
 */
const COVER_TOLERANCE = 0.12;
const coversABody = (r: Rect, exceptId: string | null): boolean => bodyDiscs.some(
  (d) => d.id !== exceptId && !d.behind && overlapArea(r, d.box) > COVER_TOLERANCE * Math.max(1, d.box.w * d.box.h),
);
const onFrame = (r: Rect): boolean => r.x >= 2 && r.y >= 2 && r.x + r.w <= CSS_W - 2 && r.y + r.h <= CSS_H - 2;
const freeAt = (r: Rect, exceptId: string | null): boolean =>
  onFrame(r) && !obstacles.some((o) => overlapArea(o, r) > 0) && !coversABody(r, exceptId);

/*
 * THE ONE PIECE OF CONTENT THAT IS ON A SURFACE: a caption on the reference plane, with `projectQuad`.
 *
 * It belongs there rather than in a corner because the plane is what it is about — in the flat
 * control that plane holds the entire diagram, and here it holds nothing but the shadows.
 *
 * TWO THINGS WENT WRONG AND BOTH ARE ABOUT SIZING THE SOURCE BOX.
 *
 * 1 · The plate was axis-aligned in world space, so at azimuth 34 it projected as a rotated
 *     parallelogram and its caption ran diagonally down the frame — a correct transform producing
 *     text a reader has to tilt their head for, which is E5's lesson arriving from a new direction.
 *     Text on a floor is oriented to the READER, like a stage marking, so the plate is now built on
 *     the camera's own horizontal basis.
 *
 * 2 · The element was sized to the projected BOUNDING BOX, which for a rotated quad is nothing like
 *     the quad: a 4.2:1 plate measured 496 × 274, so the homography stretched 12 px type by 1.8 in
 *     one axis. Sized to the mean projected EDGE LENGTHS instead, the source box has the quad's own
 *     aspect and authored pixels are rendered pixels — which is what makes the 26 px floor mean
 *     something on both axes.
 */
const PLATE_W = 10.4, PLATE_D = 2.4, PLATE_OUT = 4.6;
const PLATE_HTML =
  `<div style="font:600 12px/1.1 ui-monospace,monospace;letter-spacing:.16em;color:rgba(143,183,255,0.90)">`
  + `REFERENCE PLANE · INCLINATION 0</div>`
  + `<div style="font:400 11px/1.2 ui-monospace,monospace;color:rgba(196,212,240,0.66)">`
  + (FLAT
    ? `THE FLAT DIAGRAM LIVES HERE · ${flatPlane} CROSSINGS, ALL AMBIGUOUS`
    : `WHAT A FLAT DIAGRAM HAS TO FIT INTO · ${flatPlane} CROSSINGS`)
  + `</div>`;
const plateCorners: QuadCorners = ((): QuadCorners => {
  const az = view.azimuthDeg * RAD;
  /* The camera's horizontal right and its horizontal direction back toward the eye. */
  const u: V3 = [Math.cos(az), 0, -Math.sin(az)];
  const v: V3 = [Math.sin(az), 0, Math.cos(az)];
  const y = DECK_Y + 0.03;
  const c: V3 = [v[0] * PLATE_OUT, y, v[2] * PLATE_OUT];
  const corner = (su: number, sv: number): V3 => [
    c[0] + u[0] * su * PLATE_W / 2 + v[0] * sv * PLATE_D / 2, y,
    c[2] + u[2] * su * PLATE_W / 2 + v[2] * sv * PLATE_D / 2,
  ];
  /* "top" is the edge AWAY from the viewer, which projects higher on screen for a camera above the
     plane. The winding is checked by `signedArea` below rather than reasoned about. */
  return { topLeft: corner(-1, -1), topRight: corner(1, -1), bottomRight: corner(1, 1), bottomLeft: corner(-1, 1) };
})();
type PlateReport = { mode: string; reason: string | null; widthPx: number; heightPx: number; signedArea: number };
/* THE SCREEN FALLBACK, reported either way — E5's pattern. A caption that refuses its surface must
   still be readable somewhere, and a camera that later does present the plane gets the projected
   version back without anyone remembering to re-enable it. */
function plateInScreenSpace(): void {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:18px;bottom:16px;display:flex;flex-direction:column;gap:3px';
  el.innerHTML = PLATE_HTML;
  overlay.appendChild(el);
}
const plateReport = ((): PlateReport => {
  const probe = projectQuad(vpFinal, plateCorners, CSS_W, CSS_H, 100, 40);
  if (isQuadRefusal(probe)) {
    plateInScreenSpace();
    return { mode: 'screen', reason: probe.refusal, widthPx: 0, heightPx: 0, signedArea: 0 };
  }
  const s = probe.screen;
  const edge = (a: number, b: number): number => Math.hypot(s[a]!.x - s[b]!.x, s[a]!.y - s[b]!.y);
  const ew = Math.round((edge(0, 1) + edge(3, 2)) / 2);
  const eh = Math.round((edge(0, 3) + edge(1, 2)) / 2);
  /* A NEGATIVE SIGNED AREA IS THE BACK OF THE PLATE, and text on it renders mirror-imaged. Measured
     rather than reasoned about: E6 derived a facing from the winding convention, got it backwards,
     and silently lost 19 elements. */
  const xs = s.map((p) => p.x), ys = s.map((p) => p.y);
  const bbox: Rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const give = (reason: string): PlateReport => {
    plateInScreenSpace();
    return { mode: 'screen', reason, widthPx: ew, heightPx: eh, signedArea: Math.round(probe.signedArea) };
  };
  if (probe.signedArea <= 0) return give('BACK_FACING');
  /* 26 px, the floor E5 and E6 independently landed on, on BOTH axes: a plate seen nearly edge-on has
     ample width and no height, and a two-line caption in a 9 px box is not a caption. */
  if (ew < 26 || eh < 26) return give('BELOW_26PX');
  /* AND IT HAS TO BE ON THE FRAME, which the first version never checked. Pulling the camera in from
     25 m to 22 m pushed the plate's near edge past the bottom of the canvas and `overflow:hidden`
     silently served half a caption — the second line simply gone, with every other number in the
     report still correct. A projected element that is partly off-frame is a truncated sentence. */
  if (!onFrame(bbox)) return give('OFF_FRAME');
  const proj = projectQuad(vpFinal, plateCorners, CSS_W, CSS_H, ew, eh);
  if (isQuadRefusal(proj)) return give(proj.refusal);
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:0;top:0;width:${ew}px;height:${eh}px;transform-origin:0 0;`
    + `transform:${proj.transform};display:flex;flex-direction:column;justify-content:center;`
    + `align-items:center;gap:3px;overflow:hidden`;
  el.innerHTML = PLATE_HTML;
  overlay.appendChild(el);
  obstacles.push(bbox);
  return { mode: 'projected', reason: null, widthPx: ew, heightPx: eh, signedArea: Math.round(probe.signedArea) };
})();

/*
 * PLANE LABELS. Each kind's plane is named ON its own outermost ring, so "inclination separates
 * kinds" is a marked axis rather than an assertion.
 *
 * Several candidate angles, tried in order, because one fixed angle per plane lands wherever the
 * bodies happen to be — and a key that covers the thing it is keying is worse than no key.
 */
const TICK_ANGLES = [0, 22, -22, 48, -48, 74, -74, 120, -120, 160];
const planeTicks = ORBITED_KINDS.map((kind) => {
  const outer = Math.max(...bodies.filter((b) => b.def.kind === kind && b.def.id !== CORE).map((b) => b.hops));
  const pl = PLANE[kind];
  const r = shellRadius(outer);
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;'
    + 'font:600 9.5px/1.25 ui-monospace,monospace;letter-spacing:.14em;'
    + 'color:rgba(127,178,255,0.82);text-shadow:0 1px 3px rgba(0,0,0,0.95);' + SELECTABLE;
  /* AN ANCHOR DOT, because a floating word is not a tick. Centred on the projected point with the text
     running off to its right, so the reader can see WHICH ellipse the plane name belongs to — without
     it the four plane names sat in open space and named nothing in particular. */
  el.appendChild(anchorDot('rgba(127,178,255,0.9)'));
  el.appendChild(textSpan(`${kind} ${FLAT ? 0 : pl.incDeg}°`));
  const box = measured(el);
  for (const a of TICK_ANGLES) {
    const p = orbitPoint(r, a, FLAT ? 0 : pl.incDeg, FLAT ? 0 : pl.nodeDeg);
    const q = projectScreen(vpFinal, p, CSS_W, CSS_H);
    if (q.behind) continue;
    const at: Rect = { x: q.sx - 2.5, y: q.sy - box.h / 2, w: box.w, h: box.h };
    if (!freeAt(at, null)) continue;
    place(el, at);
    obstacles.push(at);
    return { kind, incDeg: FLAT ? 0 : pl.incDeg, thetaDeg: a, sx: Math.round(q.sx), sy: Math.round(q.sy), onFrame: true };
  }
  el.remove();
  return { kind, incDeg: FLAT ? 0 : pl.incDeg, thetaDeg: null, sx: 0, sy: 0, onFrame: false };
});

/* Hop rings, marked on the PARTY plane: it is the one at inclination 0, so its radius is the one not
   foreshortened by a plane rotation, which makes it the honest place to calibrate a radius. */
const HOP_ANGLES = [152, 205, 118, 250, 90, 20];
const hopTicks = [1, 2, 3].map((h) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;'
    + 'font:500 9.5px/1.25 ui-monospace,monospace;letter-spacing:.1em;'
    + 'color:rgba(196,212,240,0.70);text-shadow:0 1px 3px rgba(0,0,0,0.95);' + SELECTABLE;
  el.appendChild(anchorDot('rgba(196,212,240,0.8)'));
  el.appendChild(textSpan(`${h} HOP${h > 1 ? 'S' : ''}`));
  const box = measured(el);
  for (const a of HOP_ANGLES) {
    const p = orbitPoint(shellRadius(h), a, 0, 0);
    const q = projectScreen(vpFinal, p, CSS_W, CSS_H);
    if (q.behind) continue;
    const at: Rect = { x: q.sx - 2.5, y: q.sy - box.h / 2, w: box.w, h: box.h };
    if (!freeAt(at, null)) continue;
    place(el, at);
    obstacles.push(at);
    return { hops: h, thetaDeg: a, sx: Math.round(q.sx), sy: Math.round(q.sy), onFrame: true };
  }
  el.remove();
  return { hops: h, thetaDeg: null, sx: 0, sy: 0, onFrame: false };
});

/*
 * ENTITY LABELS. Four candidate placements around the body — above, below, right, left — and the
 * kind is NOT among the fields, deliberately.
 *
 * Printing the kind on every label would make inclination decoration: the reader would never need
 * the planes, and the axis this environment spends its third dimension on would be carrying nothing.
 * The kind is read from which plane the body sits on, and the plane labels above are the key. That
 * is a real cost — a reader who cannot trace the ring loses the kind — and it is the cost that makes
 * the encoding load-bearing rather than ornamental. `perEntity` still reports the kind, because a
 * script asserting on the layout is not reading the picture.
 */
const labelSubjects = bodies.map((b) => {
  const p = posOf(b);
  const dist = distFromEye(p);
  const anchor = projectScreen(vpFinal, p, CSS_W, CSS_H);
  const bodyPx = 2 * b.radius * pxPerMetreAt(dist);
  const meta = b.def.count.state === 'observed'
    ? `${b.hops === 0 ? 'CORE' : `${b.hops} HOP${b.hops > 1 ? 'S' : ''}`} · ${b.def.count.records.toLocaleString('en-US')} REC`
    : b.def.count.state === 'absent'
      ? `${b.hops} HOPS · RECORDS ABSENT`
      : '';
  return { b, p, dist, anchor, bodyPx, meta };
});

/*
 * DECIDED NEAR TO FAR, AND THERE IS NO SEPARATE PAINT ORDER — which is a claim, so here is why.
 *
 * E6 needed two opposite orders: decide near-to-far, because the already-accepted quads must be the
 * ones IN FRONT of the element under test, and paint far-to-near, because a later DOM element covers
 * an earlier one. Getting that backwards is how it reported zero occlusions against a picture that
 * visibly had them.
 *
 * Here overlaps between committed labels are REFUSED rather than layered, so the committed boxes are
 * pairwise disjoint and DOM order cannot change what the reader sees. The only overlap permitted is a
 * label over a body's disc, up to 30% — and that is canvas pixels, which are always under the whole
 * overlay whatever order the elements are in. The near-to-far decision order still matters, because
 * it decides WHO gets the contested pixels: the nearer entity.
 *
 * The overlap test is a rectangle intersection, which is SYMMETRIC by construction — E6's second
 * occlusion bug was a corner-containment test that missed a large near quad covering the MIDDLE of a
 * small far one, with neither quad's corners inside the other. An axis-aligned box test cannot have
 * that failure, which is why it is the right tool for constant-size labels.
 */
const decided = [...labelSubjects].sort((a, b) => a.dist - b.dist).map((s) => {
  const withheld = s.b.def.count.state === 'withheld';
  const anchorOff = s.anchor.behind || s.anchor.sx < 0 || s.anchor.sx > CSS_W || s.anchor.sy < 0 || s.anchor.sy > CSS_H;
  const subLegible = s.bodyPx < MIN_BODY_PX;
  /*
   * BEHIND THE CORE is its own reason, and it exists only in three dimensions.
   *
   * A body the core sphere hides is not on the frame, so a label pointing at it points at the core.
   * Ray-sphere against the core, counting only hits NEARER than the body — the flat layout cannot
   * produce this state, and folding it into "off frame" would hide a real cost of the third axis.
   */
  const behindCore = ((): boolean => {
    if (s.b.def.id === CORE) return false;
    const core = byId.get(CORE)!;
    const c = posOf(core);
    const d = sub3(s.p, eye as V3); const L = len3(d) || 1;
    const dn: V3 = [d[0] / L, d[1] / L, d[2] / L];
    const oc = sub3(c, eye as V3);
    const tca = dot3(oc, dn);
    if (tca <= 0 || tca >= L) return false;
    return dot3(oc, oc) - tca * tca < core.radius * core.radius;
  })();

  if (withheld || anchorOff || subLegible || behindCore) {
    return {
      s, shown: false, placement: null as string | null, tried: 0,
      reason: withheld ? 'WITHHELD' : anchorOff ? 'ANCHOR_OFF_FRAME' : behindCore ? 'BEHIND_CORE' : 'BODY_BELOW_9PX',
      blocked: { offFrame: 0, collision: 0, coversBody: 0 },
    };
  }

  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;display:inline-flex;flex-direction:column;gap:2px;'
    + 'align-items:center;text-align:center;white-space:nowrap;'
    + 'text-shadow:0 1px 3px rgba(0,0,0,0.95);-webkit-font-smoothing:antialiased;' + SELECTABLE;
  const metaColour = s.b.def.count.state === 'absent' ? ABSENT_HEX : 'rgba(196,212,240,0.80)';
  /* textContent per line — see `textLine`. The id and the meta string are the two values here a dataset
     supplies, and they were the two being parsed as markup. */
  el.appendChild(textLine('font:700 11px/1.1 ui-monospace,monospace;color:#fff;letter-spacing:.02em', s.b.def.id));
  el.appendChild(textLine(
    `font:500 9.5px/1.15 ui-monospace,monospace;letter-spacing:.08em;color:${metaColour}`, s.meta,
  ));
  const box = measured(el);
  const gap = 6, side = 9;
  const candidates: [string, Rect][] = [
    ['above', { x: s.anchor.sx - box.w / 2, y: s.anchor.sy - s.bodyPx / 2 - gap - box.h, w: box.w, h: box.h }],
    ['below', { x: s.anchor.sx - box.w / 2, y: s.anchor.sy + s.bodyPx / 2 + gap, w: box.w, h: box.h }],
    ['right', { x: s.anchor.sx + s.bodyPx / 2 + side, y: s.anchor.sy - box.h / 2, w: box.w, h: box.h }],
    ['left', { x: s.anchor.sx - s.bodyPx / 2 - side - box.w, y: s.anchor.sy - box.h / 2, w: box.w, h: box.h }],
  ];
  const blocked = { offFrame: 0, collision: 0, coversBody: 0 };
  for (const [where, at] of candidates) {
    if (!onFrame(at)) { blocked.offFrame++; continue; }
    if (obstacles.some((o) => overlapArea(o, at) > 0)) { blocked.collision++; continue; }
    if (coversABody(at, s.b.def.id)) { blocked.coversBody++; continue; }
    place(el, at);
    obstacles.push(at);
    return { s, shown: true, placement: where, tried: candidates.length, reason: null as string | null, blocked };
  }
  el.remove();
  /* NAMED BY WHAT BLOCKED THE MAJORITY, and the full tally travels with it. "4 hidden" is useless;
     "all four placements blocked, three by other labels and one by a body" is actionable. */
  const worst = blocked.collision >= blocked.coversBody && blocked.collision >= blocked.offFrame ? 'LABEL_COLLISION'
    : blocked.coversBody >= blocked.offFrame ? 'WOULD_COVER_A_BODY' : 'NO_PLACEMENT_ON_FRAME';
  return { s, shown: false, placement: null as string | null, tried: candidates.length, reason: worst, blocked };
});


/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE REPORT. The process that makes a capture cannot read it, so every claim above has to be a
 * number here.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const perLink = (FLAT ? segsFlat : segs3D).map((s) => {
  const mid: V3 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2];
  return {
    edge: `${s.aId}~${s.bId}`,
    strength: s.rel.strength,
    radius: Number(s.r.toFixed(4)),
    /* THICKNESS IN SCREEN PIXELS. A strength encoding measured in metres can be sub-pixel, and a
       sub-pixel tube is a claim the reader cannot see. */
    px: Number((2 * s.r * pxPerMetreAt(distFromEye(mid))).toFixed(2)),
    dotted: s.dotted,
  };
});
const solidPx = perLink.filter((l) => !l.dotted).map((l) => l.px);

const perEntity = decided.map(({ s, shown, placement, reason, blocked }) => ({
  id: s.b.def.id, kind: s.b.def.kind, hops: s.b.hops,
  countState: s.b.def.count.state,
  records: s.b.def.count.state === 'observed' ? s.b.def.count.records : null,
  radius: Number(s.b.radius.toFixed(3)),
  bodyPx: Number(s.bodyPx.toFixed(1)),
  distance: Number(s.dist.toFixed(2)),
  labelShown: shown,
  labelPlacement: placement,
  /* NAMED, NOT COUNTED. An operator does something different about each of these, and the per-
     candidate tally says which of the four placements failed and why. */
  labelHiddenBecause: reason,
  labelBlockedBy: shown ? null : blocked,
}));

/*
 * §6 RULE 5 — "Brand hex exact. `assertBrandFidelity` runs on every new material."
 *
 * E4 mentioned this function in a comment ("the palette stays exact under `assertBrandFidelity`") and
 * never imported or called it. The ratchet caught it because it checks for the CALL and not merely the
 * name — a citation is not a check, and a comment claiming a property is the weakest possible evidence
 * for it.
 *
 * It dies rather than warns: a frame that has silently moved the brand blue will be screenshotted into
 * a deck.
 */
const brandFailures = assertBrandFidelity();
if (brandFailures.length > 0) {
  const msg = 'BRAND FIDELITY FAILED — '
    + brandFailures.map((f) => `${f.key}: expected ${f.expected}, got ${f.actual}`).join('; ');
  document.title = 'REFUSED';
  const bfLog = document.getElementById('log');
  if (bfLog) bfLog.textContent = msg;
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
  layout: FLAT ? 'flat' : 'orrery',
  ao: AO_ON,
  /*
   * AND WHAT THE AO PASS IS WORTH, WHICH IS ALMOST NOTHING HERE.
   *
   * `maxDelta` is out of a possible 765 (three 8-bit channels) and `fraction` is the share of the frame
   * it moves by more than 6. Both are tiny, and the reason is structural rather than a bug: AO
   * modulates the AMBIENT term only, the ambient here is a dark instrument sky at gain 0.52, and a
   * system of separated spheres in open space has almost no concavities to occlude. The pass is wired
   * correctly — pushing the gain to 1.8 with radius 1.2 and strength 3.0 takes `maxDelta` to 52 over
   * 2.0% of the frame — but at honest lighting L2.7 does not earn its place in an orrery, and that is
   * a measurement rather than an opinion.
   */
  aoEffect: aoMeasured,
  shadow: SHADOW_ON,
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),
  entities: bodies.length,
  relationships: RELATIONS.length,
  /* If this is ever non-empty an entity has no relationship distance and therefore no shell, and it
     is REFUSED rather than parked on the outer ring. */
  unreachableEntities: unreachable,
  hopsPerEntity: Object.fromEntries(bodies.map((b) => [b.def.id, b.hops])),
  shellRadii: { 1: shellRadius(1), 2: shellRadius(2), 3: shellRadius(3) },
  inclinationsByKind: Object.fromEntries(ORBITED_KINDS.map((k) => [k, PLANE[k].incDeg])),
  ringsDrawn: ringsDrawn.length,
  /* Non-zero only in the flat control, where two kinds' rings at the same shell ARE the same circle. */
  ringsCollapsedOntoAnother: ringsCollapsed,

  /* ── §7(b): THE NUMBER THIS ENVIRONMENT IS ENTITLED TO EXIST ON ── */
  crossings: {
    /* The flat layout is this layout with every inclination zeroed. Camera-independent, because a
       drawing in one plane has no camera. */
    flatInPlane: flatPlane,
    flatAmbiguous: grazeFlat.pairs,
    flatMinSeparationM: Number(grazeFlat.minSeparation.toFixed(4)),
    /* The best of a search over angular orderings. If this were 0 the flat layout could reorder its
       way out of the problem and inclination would be buying nothing. */
    flatBestOverOrderings: flatBest,
    orderingsTried: ORDERINGS,
    orderingSearchMs: Number(orderSearchMs.toFixed(1)),
    /* CAMERA-INDEPENDENT UPPER BOUND on ambiguous crossings in 3-D: two tubes can only fuse into an
       unreadable X if they graze. 0 means no viewpoint can produce one. */
    grazingPairs3D: graze3D.pairs,
    grazingPairs3DDetail: graze3D.worst,
    minSeparation3DM: Number(graze3D.minSeparation.toFixed(4)),
    atThisCamera: { total: hereCrossings.total, ambiguous: hereCrossings.ambiguous, minSepM: Number(hereCrossings.minSep.toFixed(3)) },
    /* The empirical check on the bound, at 36 azimuths. MORE crossings appear on screen here than
       the flat layout has — that is stated rather than hidden; the claim is that none of them is
       ambiguous, not that there are fewer. */
    sweepAzimuths: sweep.length,
    sweepScreenCrossings: sweepTotals,
    sweepWorstAmbiguous,
    ambiguousCrossingsAvoided: flatPlane - sweepWorstAmbiguous,
  },
  /* A link crossing a body it is not attached to hides that body. Counted in both layouts, because
     it is the other cost a plane cannot avoid, and NAMED, because "1" is not a thing anyone can fix. */
  linksThroughBodies: {
    orrery: throughBodies(segs3D, false).length,
    flat: throughBodies(segsFlat, true).length,
    orreryDetail: throughBodies(segs3D, false),
    flatDetail: throughBodies(segsFlat, true),
  },

  /* ── the three states, never summed ── */
  countStates: counts,
  sizeScale: {
    base: R_BASE, perDecade: R_PER_DECADE,
    observedRange: [Number(Math.min(...bodies.filter((b) => b.def.count.state === 'observed').map((b) => b.radius)).toFixed(3)),
      Number(Math.max(...bodies.filter((b) => b.def.count.state === 'observed').map((b) => b.radius)).toFixed(3))],
    /* The non-observed extents. They necessarily land SOMEWHERE on the observed range, which is why the
       shape rather than the size is what says they are not measurements. */
    absentOuter: ABSENT_OUTER, withheldOuter: WITHHELD_R,
  },
  bodyPx: {
    min: Number(Math.min(...labelSubjects.map((s) => s.bodyPx)).toFixed(1)),
    max: Number(Math.max(...labelSubjects.map((s) => s.bodyPx)).toFixed(1)),
    floor: MIN_BODY_PX,
  },
  /*
   * TWO BODIES THAT TOUCH ON SCREEN, which no other number here would have caught.
   *
   * Depth resolves an ambiguous LINK crossing, because one tube visibly passes in front of the other.
   * It does NOT resolve two spheres whose projected discs merge: the nearer one simply eats the
   * further one's silhouette and the pair reads as one body with a lump on it, which is exactly how
   * PARTNER and CAMPAIGN looked before their angles moved. Size is an encoding here, so a merged
   * silhouette is a misread record count and not just untidiness. Camera-dependent, and reported for
   * this camera — the sweep does not cover it, which is named in the README.
   */
  bodyOverlapsOnScreen: { pairs: mergedDiscs(view).length, detail: mergedDiscs(view) },
  /* Which of the 36 sweep azimuths have no merged silhouettes at all. The capture's azimuth is one of
     them, chosen from this list rather than by eye. */
  cleanAzimuths,
  strengthScale: { min: S_MIN, max: S_MAX, radiusMin: LINK_R_MIN, radiusMax: LINK_R_MAX },
  /* The orbit rings' projected thickness at the outermost shell. A sub-pixel ring is a structure the
     reader cannot see, and the whole radius encoding is read off these. */
  ringPx: Number((2 * RING_TUBE * pxPerMetreAt(distFromEye([0, 0, -shellRadius(3)]))).toFixed(2)),
  linkPx: { thinnest: Math.min(...solidPx), thickest: Math.max(...solidPx) },
  /* A thickness encoding whose thinnest tube lands under ~1.5 px is not readable, whatever the
     radius says. Reported rather than assumed, and the capture script asserts on it. */
  strengthLegible: Math.min(...solidPx) >= 1.5,

  labelsShown: perEntity.filter((e) => e.labelShown).length,
  /* Grouped by REASON. "4 hidden" is useless; these four reasons need four different actions. */
  labelsHiddenBy: perEntity.filter((e) => !e.labelShown).reduce<Record<string, number>>((acc, e) => {
    const k = e.labelHiddenBecause ?? 'UNKNOWN';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {}),
  plate: plateReport,
  planeTicks,
  planeTicksOffFrame: planeTicks.filter((t) => !t.onFrame).length,
  hopTicks,
  hopTicksOffFrame: hopTicks.filter((t) => !t.onFrame).length,
  perEntity,
  perLink,
  sweepDetail: sweep,

  glError: gl.getError(),
  triangles: tris,
  drawCalls: draws.length,
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
  renderer: '',
  rendererClass: '',
  headroom: null as number | null,
  headroomRefusal: null as string | null,
  hardwareMsPerFrame: null as number | null,
};

/* Read ONCE, before the refusal that keys off it, because two call sites for the same string is two
   chances for the refusal to disagree with what is printed. */
const RENDERER = (() => {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
})();
/* Matched on the driver's own words. SwiftShader and llvmpipe are the two software rasterisers a
   headless capture lands on; anything else is treated as hardware, which is the safe direction to be
   wrong in — a hardware machine wrongly called software loses a number, whereas software wrongly
   called hardware publishes a fictional budget. */
const SOFTWARE = /swiftshader|llvmpipe|software/i.test(RENDERER);
report.renderer = RENDERER;
report.rendererClass = SOFTWARE ? 'software' : 'hardware';
/*
 * HEADROOM REFUSES ON A SOFTWARE RASTERISER. SwiftShader is a CPU rasteriser, and comparing its
 * frame time to a 60 Hz budget is not a conservative estimate of anything: it measures a machine
 * nobody ships on, and the ratio to real hardware is not a constant — E0 measured 1.305 ms on an M1
 * for a scene SwiftShader takes tens of milliseconds over. So the comparison is refused with a code
 * rather than computed. The frame time itself is still reported, because it IS a real measurement
 * of SwiftShader.
 */
report.headroom = SOFTWARE ? null : Number((16.6 - ms).toFixed(3));
report.headroomRefusal = SOFTWARE ? 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET' : null;
/* Real-hardware timing for this environment is UNMEASURED. E0's and E8's M1 figures came from manual
   browser sessions; this harness has only ever run under SwiftShader. */
report.hardwareMsPerFrame = null;

(globalThis as unknown as { E4: typeof report }).E4 = report;
/*
 * THE PRINTED REPORT IS SUMMARISED; THE FULL ONE STAYS ON `globalThis`. `fullPage: true` screenshots
 * the log along with the frame, and a pretty-printed per-item report grows with the data until the
 * page passes Chrome's capture height and `Page.captureScreenshot` fails outright — naming the
 * screenshot rather than the cause.
 */
const { perEntity: pe, perLink: pl2, planeTicks: _pt, hopTicks: _ht, sweepDetail: _sd, ...summary } = report;
log.textContent = JSON.stringify(summary, null, 2)
  + `\n\nperEntity (${pe.length}, full detail on globalThis.E4):\n`
  + pe.map((e) => (
    `  ${e.id.padEnd(13)} ${e.kind.padEnd(11)} h${e.hops} ${e.countState.padEnd(9)}`
    + ` r ${e.radius.toFixed(2)} ${String(e.bodyPx).padStart(5)}px ${String(e.distance).padStart(6)}m`
    + ` ${e.labelShown ? 'LABEL' : `no label: ${e.labelHiddenBecause}`}`
  )).join('\n')
  + `\n\nperLink (${pl2.length}):\n`
  + pl2.map((l) => (
    `  ${l.edge.padEnd(28)} s ${l.strength === null ? 'ABSENT' : l.strength.toFixed(2)}`
    + ` r ${l.radius.toFixed(3)} ${String(l.px).padStart(5)}px${l.dotted ? ' (pips)' : ''}`
  )).join('\n');
frame();
fallback.markRendered();
document.title = 'READY';
