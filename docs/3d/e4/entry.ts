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
  hexToLinear, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal, type QuadCorners,
} from '@lcx/gl';

const params = new URLSearchParams(location.search);
const AO_ON = params.get('ao') !== '0';
const SHADOW_ON = params.get('shadow') !== '0';
/* THE CONTROL THAT MATTERS HERE. `?flat=1` zeroes every inclination and looks straight down, which
   is precisely the node-link diagram this replaces — same entities, same radii, same strengths, one
   axis fewer. The crossing counts in the report are computed for BOTH layouts on every run, so the
   comparison is not a claim about a picture nobody measured. */
const FLAT = params.get('flat') === '1';
const SCALE = Math.max(1, Math.min(3, Number(params.get('scale') ?? 1)));
const FRAMES = Number(params.get('frames') ?? 300);

const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
const log = document.getElementById('log')!;

function die(m: string): never { document.title = 'REFUSED'; log.textContent = m; throw new Error(m); }
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
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
const shadow = required('shadow', createShadowMap(stage, 1536));
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
  { id: 'CAMPAIGN', kind: 'EVENT', thetaDeg: 288, count: { state: 'observed', records: 37 } },
  { id: 'QUEST', kind: 'EVENT', thetaDeg: 8, count: { state: 'observed', records: 1204 } },
  /* MEASURED, MAY NOT BE SHOWN. A need-to-know compartment: the body is on its orbit, the count is
     not on the frame, and there is no label — which is the actual state of the thing. */
  { id: 'COMPARTMENT', kind: 'CONTROL', thetaDeg: 96, count: { state: 'withheld' } },
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
 */
const NOMINAL_R = 0.30;
const radiusOf = (c: Count): number => (c.state === 'observed' ? observedRadius(c.records) : NOMINAL_R);

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
const NEAR = 0.5, FAR = 90;
const view: Viewpoint = FLAT
  /* THE FLAT CONTROL LOOKS STRAIGHT DOWN, because that is the only honest way to photograph a
     drawing that lives in one plane. 89 rather than 90: at the pole the azimuth is undefined. */
  ? { target: [0, 0, 0], distance: 25, azimuthDeg: 34, elevationDeg: 89, fovDeg: 36, near: NEAR, far: FAR }
  : { target: [0, 0.4, 0], distance: 25, azimuthDeg: 34, elevationDeg: 26, fovDeg: 36, near: NEAR, far: FAR };
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

/** Crossings of the flat layout IN ITS OWN PLANE — camera-independent, because it is a drawing. */
function inPlaneCrossings(segs: readonly Seg[]): number {
  let n = 0;
  for (const [s, t] of disjointPairs(segs)) {
    if (cross2(s.a[0], s.a[2], s.b[0], s.b[2], t.a[0], t.a[2], t.b[0], t.b[2])) n++;
  }
  return n;
}

/** A link that passes through a body it is not attached to hides that body, in either layout. */
function throughBodies(segs: readonly Seg[], flat: boolean): number {
  let n = 0;
  for (const s of segs) {
    for (const b of bodies) {
      if (b.def.id === s.aId || b.def.id === s.bId) continue;
      const p = flat ? b.flatPos : b.pos;
      if (segSeg(s.a, s.b, p, p).dist < b.radius + s.r) n++;
    }
  }
  return n;
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
  return { azimuthDeg: i * 10, total: c.total, ambiguous: c.ambiguous };
});
const sweepWorstAmbiguous = Math.max(...sweep.map((s) => s.ambiguous));
const sweepTotals = [Math.min(...sweep.map((s) => s.total)), Math.max(...sweep.map((s) => s.total))];

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
const absentGeo = torus(0.24, 0.062, 44, 14);
const withheldGeo = cylinder(0.26, 0.36, 40);
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
const RING_HEX = '#33497A';
/* Darker than the palette's `plate` (#0E1628), and deliberately: a horizontal plane takes the key
   light at nearly N·L = 1, so the plate's own albedo is the only thing holding it below the bodies
   in value. At #0E1628 it came back a mid grey that the brand blue had to fight. */
const DECK_HEX = '#090F1C';
const CLEAR_HEX = '#05070E';

const posOf = (b: Body): V3 => (FLAT ? b.flatPos : b.pos);

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
 * So the shadow pass gets its own list. Bodies and relationships cast; the rings and the plate do
 * not. That is a statement about what the shadows are FOR, not an optimisation.
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
casters.push(...linkDraws);

for (const b of bodies) {
  const p = posOf(b);
  const d: LitDraw = b.def.count.state === 'absent'
    ? {
      mesh: absentMesh, model: scaledAt(p, 1), normalMat: N3,
      material: { baseColour: hexToLinear(ABSENT_HEX), roughness: 0.38, metalness: 0.15 },
    }
    : b.def.count.state === 'withheld'
      ? {
        mesh: withheldMesh, model: scaledAt(p, 1), normalMat: N3,
        material: { baseColour: hexToLinear(WITHHELD_HEX), roughness: 0.28, metalness: 0.58 },
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
  if (AO_ON) {
    /* NEAR AND FAR COME FROM THE SAME TWO CONSTANTS THE PROJECTION USED. AO linearises the depth
       buffer, so a near/far here that does not match the matrix that wrote it reconstructs the
       wrong world positions and the occlusion radius silently means something else — a mismatch
       that produces a plausible, wrong AO rather than an error. */
    ao.compute({ depthTexture: target.depthTexture, near: NEAR, far: FAR, fovDeg: FOV, aspect: W / H, radius: 0.5, strength: 1.2 });
    target.bind();
  }
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [3.1, 3.05, 2.95],
    ambientGain: 0.52, lightVP, shadow: SHADOW_ON ? shadow : null, shadowStrength: 0.92, draws,
    ao: AO_ON ? ao.texture : null, screenSize: [W, H],
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
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);

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
const CHAR_W = 6.6, META_CHAR_W = 5.8, LABEL_H = 30;

type Rect = { x: number; y: number; w: number; h: number };
const overlapArea = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const labelSubjects = bodies.map((b) => {
  const p = posOf(b);
  const dist = distFromEye(p);
  const ppm = pxPerMetreAt(dist);
  const anchor = projectScreen(vpFinal, p, CSS_W, CSS_H);
  const bodyPx = 2 * b.radius * ppm;
  const name = b.def.id;
  const meta = b.def.count.state === 'observed'
    ? `${b.def.kind} · ${b.hops === 0 ? 'CORE' : `${b.hops} HOP${b.hops > 1 ? 'S' : ''}`} · ${b.def.count.records.toLocaleString('en-US')} REC`
    : b.def.count.state === 'absent'
      ? `${b.def.kind} · ${b.hops} HOPS · RECORDS ABSENT`
      : '';
  const w = Math.ceil(Math.max(name.length * CHAR_W, meta.length * META_CHAR_W)) + 10;
  return { b, p, dist, ppm, anchor, bodyPx, name, meta, w };
});

/*
 * DECIDED NEAR TO FAR, PAINTED FAR TO NEAR. They are opposite orders and conflating them is how E6
 * reported zero occlusions against a picture that visibly had them: sorting far-to-near is right
 * for painting, because a later DOM element covers an earlier one, and exactly wrong for deciding,
 * because the already-accepted boxes are then the ones behind the label under test.
 *
 * The overlap test itself is a rectangle intersection, which is SYMMETRIC by construction — E6's
 * second occlusion bug was a corner-containment test that missed a large near quad covering the
 * MIDDLE of a small far one. An axis-aligned box test cannot have that failure, which is the reason
 * to prefer it here over reprojecting a quad.
 */
const shownRects: Rect[] = [];
const decided = [...labelSubjects].sort((a, b) => a.dist - b.dist).map((s) => {
  const withheld = s.b.def.count.state === 'withheld';
  const offFrame = s.anchor.behind || s.anchor.sx < 0 || s.anchor.sx > CSS_W || s.anchor.sy < 0 || s.anchor.sy > CSS_H;
  const subLegible = s.bodyPx < MIN_BODY_PX;
  /*
   * BEHIND THE CORE is its own reason, and it only exists in three dimensions.
   *
   * A body the core sphere hides is not on the frame, so a label pointing at it points at the
   * core. Ray-sphere against the core, testing only hits NEARER than the body itself — the flat
   * layout cannot produce this state, and collapsing it into "off frame" would hide a real cost of
   * the third axis.
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
    const d2 = dot3(oc, oc) - tca * tca;
    return d2 < core.radius * core.radius;
  })();

  const rect: Rect = { x: s.anchor.sx - s.w / 2, y: s.anchor.sy - s.bodyPx / 2 - LABEL_H - 6, w: s.w, h: LABEL_H };
  const collides = shownRects.some((r) => overlapArea(r, rect) > 0);
  /*
   * TEXT NEVER HIDES A BODY. A label box sitting over another entity's disc costs the reader the
   * body — and a body is the datum here, while the label is only its name. Thresholded at 30% of
   * the disc's own box rather than at any touch, because a one-pixel graze costs nothing and
   * refusing on it would silently drop labels for no gain.
   */
  const coversBody = labelSubjects.some((o) => {
    if (o.b.def.id === s.b.def.id) return false;
    const box: Rect = { x: o.anchor.sx - o.bodyPx / 2, y: o.anchor.sy - o.bodyPx / 2, w: o.bodyPx, h: o.bodyPx };
    return overlapArea(rect, box) > 0.3 * Math.max(1, box.w * box.h);
  });

  const shown = !withheld && !offFrame && !subLegible && !behindCore && !collides && !coversBody;
  if (shown) shownRects.push(rect);
  return { s, rect, shown, withheld, offFrame, subLegible, behindCore, collides, coversBody };
});

for (const d of [...decided].sort((a, b) => b.s.dist - a.s.dist)) {
  if (!d.shown) continue;
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${d.rect.x.toFixed(1)}px;top:${d.rect.y.toFixed(1)}px;`
    + `width:${d.s.w}px;height:${LABEL_H}px;display:flex;flex-direction:column;justify-content:flex-end;`
    + `gap:2px;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,0.9);-webkit-font-smoothing:antialiased`;
  const metaColour = d.s.b.def.count.state === 'absent' ? ABSENT_HEX : 'rgba(196,212,240,0.80)';
  el.innerHTML =
    `<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff;letter-spacing:.02em">${d.s.name}</div>`
    + `<div style="font:500 9.5px/1.1 ui-monospace,monospace;letter-spacing:.08em;color:${metaColour}">${d.s.meta}</div>`;
  overlay.appendChild(el);
}

/*
 * THE ONE PIECE OF CONTENT THAT IS ON A SURFACE: a caption on the reference plane, projected with
 * `projectQuad`.
 *
 * It belongs there rather than in the corner because the plane is what it is about — in the flat
 * control that plane holds the entire diagram, and here it holds nothing but the shadows.
 *
 * THE ELEMENT IS SIZED TO ITS OWN PROJECTED EXTENT, which is the fix for the problem E6 hit from
 * the other side. `projectQuad` maps the element box onto the quad, so authoring at a fixed
 * px-per-metre means the type is scaled by however much the homography happens to shrink the plate
 * — 12 px of source becoming 5 px on screen with nothing reporting it. Projecting once to measure
 * the screen box and then re-projecting at that size makes authored pixels and rendered pixels the
 * same thing, so a 12 px caption is 12 px.
 */
const PLATE_W = 11.0, PLATE_D = 2.6, PLATE_Z = 5.4;
const plateCorners: QuadCorners = {
  topLeft: [-PLATE_W / 2, DECK_Y + 0.03, PLATE_Z - PLATE_D / 2],
  topRight: [PLATE_W / 2, DECK_Y + 0.03, PLATE_Z - PLATE_D / 2],
  bottomRight: [PLATE_W / 2, DECK_Y + 0.03, PLATE_Z + PLATE_D / 2],
  bottomLeft: [-PLATE_W / 2, DECK_Y + 0.03, PLATE_Z + PLATE_D / 2],
};
const plateReport = ((): { mode: string; reason: string | null; widthPx: number; heightPx: number; signedArea: number } => {
  const probe = projectQuad(vpFinal, plateCorners, CSS_W, CSS_H, 100, 40);
  if (isQuadRefusal(probe)) return { mode: 'refused', reason: probe.refusal, widthPx: 0, heightPx: 0, signedArea: 0 };
  const xs = probe.screen.map((p) => p.x), ys = probe.screen.map((p) => p.y);
  const ew = Math.round(Math.max(...xs) - Math.min(...xs));
  const eh = Math.round(Math.max(...ys) - Math.min(...ys));
  /* A NEGATIVE SIGNED AREA IS THE BACK OF THE PLATE, and rendering text on it would mirror-image
     it. Measured rather than reasoned about: E6 derived a facing from the winding convention, got
     it backwards, and silently lost 19 elements. */
  if (probe.signedArea <= 0) return { mode: 'refused', reason: 'BACK_FACING', widthPx: ew, heightPx: eh, signedArea: probe.signedArea };
  /* 26 px, the floor E5 and E6 independently landed on, applied to BOTH axes here: a plate seen
     nearly edge-on has ample width and no height, and a two-line caption in a 9 px box is not a
     caption. */
  if (ew < 26 || eh < 26) return { mode: 'refused', reason: 'BELOW_26PX', widthPx: ew, heightPx: eh, signedArea: probe.signedArea };
  const proj = projectQuad(vpFinal, plateCorners, CSS_W, CSS_H, ew, eh);
  if (isQuadRefusal(proj)) return { mode: 'refused', reason: proj.refusal, widthPx: ew, heightPx: eh, signedArea: probe.signedArea };
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:0;top:0;width:${ew}px;height:${eh}px;transform-origin:0 0;`
    + `transform:${proj.transform};display:flex;flex-direction:column;justify-content:center;`
    + `align-items:center;gap:3px;overflow:hidden`;
  el.innerHTML =
    `<div style="font:600 12px/1.1 ui-monospace,monospace;letter-spacing:.16em;color:rgba(143,183,255,0.92)">`
    + `REFERENCE PLANE · INCLINATION 0</div>`
    + `<div style="font:400 11px/1.2 ui-monospace,monospace;color:rgba(196,212,240,0.72)">`
    + (FLAT
      ? `THE FLAT DIAGRAM LIVES HERE · ${flatPlane} CROSSINGS, ALL AMBIGUOUS`
      : `WHAT THE FLAT DIAGRAM HAS TO FIT INTO · ${flatPlane} CROSSINGS`)
    + `</div>`;
  overlay.appendChild(el);
  return { mode: 'projected', reason: null, widthPx: ew, heightPx: eh, signedArea: Math.round(probe.signedArea) };
})();

/*
 * PLANE LABELS. Each kind's plane is named at its own outermost ring, so "inclination separates
 * kinds" is a marked axis rather than an assertion — a reader can see WHICH plane is which.
 */
const planeTicks = (Object.keys(PLANE) as Kind[]).map((kind) => {
  const outer = Math.max(...bodies.filter((b) => b.def.kind === kind && b.def.id !== CORE).map((b) => b.hops), 0);
  const pl = PLANE[kind];
  const r = shellRadius(Math.max(1, outer));
  /* Placed at the plane's own ascending node, which is the one point on the ring whose position
     does not depend on the inclination — so the label sits ON the visible ellipse at any camera. */
  const p = orbitPoint(r, 0, FLAT ? 0 : pl.incDeg, FLAT ? 0 : pl.nodeDeg);
  const q = projectScreen(vpFinal, p, CSS_W, CSS_H);
  const onFrame = !q.behind && q.sx > 4 && q.sx < CSS_W - 4 && q.sy > 4 && q.sy < CSS_H - 4;
  if (onFrame) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${q.sx.toFixed(1)}px;top:${q.sy.toFixed(1)}px;`
      + `transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.14em;`
      + `color:rgba(127,178,255,0.78);white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9)`;
    el.textContent = `${kind} ${FLAT ? 0 : pl.incDeg}°`;
    overlay.appendChild(el);
  }
  return { kind, incDeg: FLAT ? 0 : pl.incDeg, sx: Math.round(q.sx), sy: Math.round(q.sy), onFrame };
});

/* Hop rings, marked on the PARTY plane because it is the one at inclination 0 and therefore the
   one whose radius is not foreshortened by a plane rotation. */
const hopTicks = [1, 2, 3].map((h) => {
  const p = orbitPoint(shellRadius(h), 152, 0, 0);
  const q = projectScreen(vpFinal, p, CSS_W, CSS_H);
  const onFrame = !q.behind && q.sx > 4 && q.sx < CSS_W - 4 && q.sy > 4 && q.sy < CSS_H - 4;
  if (onFrame) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${q.sx.toFixed(1)}px;top:${q.sy.toFixed(1)}px;`
      + `transform:translate(-50%,-50%);font:500 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;`
      + `color:rgba(196,212,240,0.62);white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.9)`;
    el.textContent = `${h} HOP${h > 1 ? 'S' : ''}`;
    overlay.appendChild(el);
  }
  return { hops: h, sx: Math.round(q.sx), sy: Math.round(q.sy), onFrame };
});

const counts = {
  observed: bodies.filter((b) => b.def.count.state === 'observed').length,
  absent: bodies.filter((b) => b.def.count.state === 'absent').length,
  withheld: bodies.filter((b) => b.def.count.state === 'withheld').length,
};

const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px';
hud.innerHTML =
  `<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">`
  + `ONTOLOGY AS ORBITS · ${FLAT ? 'FLAT CONTROL — INCLINATIONS ZEROED' : 'RADIUS = HOPS · SIZE = RECORDS · TUBE = STRENGTH'}</div>`
  + `<div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.84)">`
  + `${FLAT
    ? `${flatPlane} CROSSINGS IN PLANE &nbsp;·&nbsp; ${grazeFlat.pairs} AMBIGUOUS (NO DEPTH TO RESOLVE THEM)`
    : `${hereCrossings.total} CROSSINGS ON SCREEN &nbsp;·&nbsp; ${hereCrossings.ambiguous} AMBIGUOUS &nbsp;·&nbsp; FLAT LAYOUT: ${flatPlane} OF ${flatPlane}`}<br>`
  + `INCLINATION SEPARATES ${(Object.keys(PLANE) as Kind[]).length} ENTITY KINDS &nbsp;·&nbsp; ${bodies.length} ENTITIES, ${RELATIONS.length} RELATIONSHIPS</div>`
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
  + 'gap:7px;align-items:flex-end;font:500 10px/1 ui-monospace,monospace;color:rgba(196,212,240,0.85)';
const bar = (s: number): string => {
  const px = Math.max(1, 2 * linkRadius(s) * ppmCentre);
  return `<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH ${s.toFixed(2)}</span>`
    + `<span style="width:46px;height:${px.toFixed(1)}px;background:${LINK_HEX};display:inline-block"></span></div>`;
};
legend.innerHTML = bar(S_MIN) + bar((S_MIN + S_MAX) / 2) + bar(S_MAX)
  + `<div style="display:flex;align-items:center;gap:8px"><span>STRENGTH NEVER MEASURED</span>`
  + `<span style="width:46px;display:inline-flex;gap:3px;justify-content:space-between">`
  + `${'<span style="width:5px;height:5px;border-radius:50%;background:' + ABSENT_HEX + '"></span>'.repeat(5)}</span></div>`
  + `<div style="height:4px"></div>`
  + `<div style="display:flex;align-items:center;gap:8px"><span>RECORDS OBSERVED · ${counts.observed}</span>`
  + `<span style="width:11px;height:11px;border-radius:50%;background:${OBSERVED_HEX};display:inline-block"></span></div>`
  + `<div style="display:flex;align-items:center;gap:8px"><span>RECORDS ABSENT · ${counts.absent} (RING — NOT ON THE SIZE SCALE)</span>`
  + `<span style="width:11px;height:11px;border-radius:50%;border:3px solid ${ABSENT_HEX};box-sizing:border-box;display:inline-block"></span></div>`
  + `<div style="display:flex;align-items:center;gap:8px"><span>WITHHELD · ${counts.withheld} (DRUM — PRESENT, UNLABELLED)</span>`
  + `<span style="width:11px;height:11px;background:${WITHHELD_HEX};display:inline-block"></span></div>`;
overlay.appendChild(legend);

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

const perEntity = decided.map(({ s, shown, withheld, offFrame, subLegible, behindCore, collides, coversBody }) => ({
  id: s.b.def.id, kind: s.b.def.kind, hops: s.b.hops,
  countState: s.b.def.count.state,
  records: s.b.def.count.state === 'observed' ? s.b.def.count.records : null,
  radius: Number(s.b.radius.toFixed(3)),
  bodyPx: Number(s.bodyPx.toFixed(1)),
  distance: Number(s.dist.toFixed(2)),
  labelShown: shown,
  /* NAMED, NOT COUNTED. An operator does something different about each of these. */
  labelHiddenBecause: shown ? null
    : withheld ? 'WITHHELD'
      : offFrame ? 'OFF_FRAME'
        : behindCore ? 'BEHIND_CORE'
          : subLegible ? 'BODY_BELOW_9PX'
            : coversBody ? 'WOULD_COVER_A_BODY'
              : collides ? 'LABEL_COLLISION' : 'UNKNOWN',
}));

const report = {
  layout: FLAT ? 'flat' : 'orrery',
  ao: AO_ON,
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
  inclinationsByKind: Object.fromEntries((Object.keys(PLANE) as Kind[]).map((k) => [k, PLANE[k].incDeg])),
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
       it is the other cost a plane cannot avoid. */
  linksThroughBodies: { orrery: throughBodies(segs3D, false), flat: throughBodies(segsFlat, true) },

  /* ── the three states, never summed ── */
  countStates: counts,
  sizeScale: { base: R_BASE, perDecade: R_PER_DECADE, nominalForNonObserved: NOMINAL_R },
  bodyPx: {
    min: Number(Math.min(...labelSubjects.map((s) => s.bodyPx)).toFixed(1)),
    max: Number(Math.max(...labelSubjects.map((s) => s.bodyPx)).toFixed(1)),
    floor: MIN_BODY_PX,
  },
  strengthScale: { min: S_MIN, max: S_MAX, radiusMin: LINK_R_MIN, radiusMax: LINK_R_MAX },
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
  frames: FRAMES,
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
document.title = 'READY';
