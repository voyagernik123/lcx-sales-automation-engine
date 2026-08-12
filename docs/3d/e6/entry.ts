/**
 * E6 · THE VAULT — audit and governance as a deep architectural space.
 *
 * `3D_VFX_1000X.md` §2: "audit + governance as a deep architectural space; every governed action a
 * lit record receding into fog. Depth *is* the time axis." It replaces `AuditLog`, a table.
 *
 * ── WHAT A TABLE CANNOT SAY, AND THIS CAN ────────────────────────────────────────────
 * §7(b) is the clause that stops this programme becoming a showreel, so the first question is what
 * an operator learns here that the table does not tell them faster. Three things, and all three are
 * consequences of depth being time rather than decoration:
 *
 * 1 · HOW FAR BACK YOU CAN SEE IS A NUMBER. Fog gives the corridor a horizon, and because depth is
 *     calibrated in days that horizon converts to a date. A table has 50 rows; the vault says "you
 *     can read 9 days back, you can see shapes for 17, and before that there is nothing" — and the
 *     report below prints those numbers rather than implying them.
 *
 * 2 · A WITHHELD RECORD IS VISIBLY PRESENT. In a table a row you may not read either shows or is
 *     absent, and both look like an empty result. Here the slab is lit, at its own moment in time,
 *     and carries no text. You can see that something happened then and that you are not being shown
 *     it — which is the actual state of a need-to-know compartment, and is information the table
 *     destroys.
 *
 * 3 · DENSITY IS SHAPE. A burst of blocked actions in one afternoon is a cluster of amber slabs at
 *     one depth. Sorting a table by verdict finds the same rows and loses when they happened.
 *
 * ── THE FOG IS LOAD-BEARING, NOT ATMOSPHERE ──────────────────────────────────────────
 * If depth is the time axis then fog is the reading limit on that axis, so its density is a claim
 * about legibility and is calibrated against one: `DAYS_PER_METRE` and the fog's e-folding height are
 * chosen so the distance at which fog reaches 95% lands where DOM text has become unreadable anyway.
 * A fog tuned by eye would put the visual horizon and the legibility horizon in different places, and
 * the frame would then promise a record it cannot deliver.
 */
import {
  createStage, isStage, box, plane, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion,
  projectQuad, isQuadRefusal, uprightPanelCorners,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, assertBrandFidelity, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal,
} from '@lcx/gl';
import { installFlatFallback } from '../_shared/flatFallback.js';

const params = new URLSearchParams(location.search);
const AO_ON = params.get('ao') !== '0';
/* THE CONTROL THAT MATTERS HERE. With fog off the corridor still renders, and every record — including
   ones nine metres away that no reader could resolve — is presented at full contrast as though it were
   available. That is the frame lying about its own reading limit, which is exactly what the fog is
   for, so `?fog=0` is the capture that shows what the honesty costs. */
const FOG_ON = params.get('fog') !== '0';
const SCALE = Math.max(1, Math.min(3, Number(params.get('scale') ?? 1)));
const FRAMES = Number(params.get('frames') ?? 300);

const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
const log = document.getElementById('log')!;

function die(m: string): never {
  document.title = 'REFUSED';
  /* Resolved here rather than closed over. `die` is now reachable BEFORE the harness's own `const log`
     is initialised — the flat fallback and its forced-refusal switch both sit above the stage on
     purpose — and a closure over an uninitialised const fails with "Cannot set properties of
     undefined", which reads as a DOM problem rather than an ordering one. */
  const logEl = document.getElementById('log');
  if (logEl) logEl.textContent = m;
  /* The refusal goes ABOVE the table, not instead of it. A reader who cannot be shown the corridor is
     still entitled to the records, and to be told which of the two is missing. */
  const [code, ...rest] = m.split(':');
  fallbackRef?.showRefusal(code?.trim() ?? 'REFUSED', rest.join(':').trim() || m);
  throw new Error(m);
}
/* Assigned once `installFlatFallback` has run. `die` is declared first because a `function` declaration
   returning `never` is what gives the compiler its control-flow narrowing — a const arrow does not. */
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
}

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE RECORDS. Synthetic, and said so ON THE FRAME rather than in a comment nobody opens.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The SHAPE is the part that has to be real, because it is what the environment is being tested on:
 * a governed-action log has far more allows than blocks, blocks arrive in CLUSTERS (one bad
 * afternoon, not one a day), and some records exist in a compartment the reader is not cleared for.
 * A uniform sprinkle of one record per day would exercise none of that and would make the density
 * claim above untestable.
 */
type Verdict = 'ALLOWED' | 'BLOCKED' | 'WITHHELD';
interface Record { hoursAgo: number; actor: string; action: string; verdict: Verdict }

const RECORDS: readonly Record[] = [
  { hoursAgo: 3, actor: 'n.sharma', action: 'campaign.publish', verdict: 'ALLOWED' },
  { hoursAgo: 9, actor: 'n.sharma', action: 'budget.raise', verdict: 'ALLOWED' },
  { hoursAgo: 14, actor: 'svc.payagent', action: 'x402.settle', verdict: 'ALLOWED' },
  { hoursAgo: 26, actor: 'a.reiter', action: 'listing.approve', verdict: 'ALLOWED' },
  { hoursAgo: 31, actor: 'svc.operator', action: 'memo.generate', verdict: 'ALLOWED' },
  /* The cluster. One afternoon, four blocks — the shape a table sorted by verdict cannot show. */
  { hoursAgo: 44, actor: 'j.kohler', action: 'compartment.read', verdict: 'BLOCKED' },
  { hoursAgo: 45, actor: 'j.kohler', action: 'compartment.read', verdict: 'BLOCKED' },
  { hoursAgo: 46, actor: 'j.kohler', action: 'export.bulk', verdict: 'BLOCKED' },
  { hoursAgo: 47, actor: 'j.kohler', action: 'export.bulk', verdict: 'BLOCKED' },
  { hoursAgo: 58, actor: 'svc.payagent', action: 'x402.settle', verdict: 'ALLOWED' },
  { hoursAgo: 70, actor: '—', action: '—', verdict: 'WITHHELD' },
  { hoursAgo: 83, actor: 'a.reiter', action: 'quest.close', verdict: 'ALLOWED' },
  { hoursAgo: 95, actor: 'n.sharma', action: 'rfi.extract', verdict: 'ALLOWED' },
  { hoursAgo: 110, actor: '—', action: '—', verdict: 'WITHHELD' },
  { hoursAgo: 128, actor: 'svc.operator', action: 'sat.gate', verdict: 'BLOCKED' },
  { hoursAgo: 141, actor: 'a.reiter', action: 'listing.approve', verdict: 'ALLOWED' },
  { hoursAgo: 163, actor: 'n.sharma', action: 'campaign.draft', verdict: 'ALLOWED' },
  { hoursAgo: 190, actor: 'svc.payagent', action: 'x402.settle', verdict: 'ALLOWED' },
  { hoursAgo: 214, actor: '—', action: '—', verdict: 'WITHHELD' },
  { hoursAgo: 246, actor: 'a.reiter', action: 'quest.close', verdict: 'ALLOWED' },
  { hoursAgo: 280, actor: 'n.sharma', action: 'budget.raise', verdict: 'ALLOWED' },
  { hoursAgo: 320, actor: 'svc.operator', action: 'memo.generate', verdict: 'ALLOWED' },
  { hoursAgo: 366, actor: 'j.kohler', action: 'compartment.read', verdict: 'BLOCKED' },
  { hoursAgo: 410, actor: 'a.reiter', action: 'listing.approve', verdict: 'ALLOWED' },
  { hoursAgo: 462, actor: 'n.sharma', action: 'campaign.publish', verdict: 'ALLOWED' },
];

/*
 * THE FLAT FALLBACK IS INSTALLED BEFORE THE STAGE EXISTS — §6 rule 1.
 *
 * Deliberately above `createStage`, because a shader compile failure happens during module evaluation:
 * anything built after the renderer is constructed is code that never runs on the failure it exists
 * for. Print and the accessibility tree are not errors either, so there is nothing to catch for those
 * cases at all.
 *
 * The table is not a consolation prize. It carries every field the 3-D view carries, with absent named
 * rather than blank, so a reader who cannot see the corridor loses the SHAPE of the history — the
 * cluster, the reach, the horizon — and none of the records. That is what "not a downgrade in
 * INFORMATION" has to mean.
 */
const fallback = installFlatFallback({
  title: 'E6 · The Vault — governed actions',
  readsAs: 'Depth is time in the rendered view: the corridor states how far back the record is readable '
    + 'at all, a cluster of blocked actions in one afternoon reads as a stack at one depth, and a '
    + 'withheld record is visibly present without being readable. This table carries every record and '
    + 'every verdict; what it cannot carry is the shape.',
  notices: ['SYNTHETIC RECORDS — the shape is deliberate, the values are not measurements.'],
  columns: [
    { key: 'when', label: 'When', numeric: true },
    { key: 'verdict', label: 'Verdict' },
    { key: 'action', label: 'Action' },
    { key: 'actor', label: 'Actor' },
  ],
  /* WITHHELD rows carry `null`, which the fallback renders as a named "absent" rather than as a blank
     or an em dash — the flat view has to keep the three states apart or rule 1 is broken by the very
     thing meant to satisfy it. */
  rows: RECORDS.map((r) => ({
    when: r.hoursAgo < 24 ? `${r.hoursAgo} h ago` : `${(r.hoursAgo / 24).toFixed(1)} d ago`,
    verdict: r.verdict,
    action: r.verdict === 'WITHHELD' ? null : r.action,
    actor: r.verdict === 'WITHHELD' ? null : r.actor,
  })),
});
fallbackRef = fallback;

/*
 * A SYNTHETIC REFUSAL, SO THE FALLBACK CAN BE CAPTURED. §6 rule 8 is "every claim gets a capture", and
 * rule 1's claim — that a refusal resolves to the flat surface without losing information — is the one
 * claim in this programme that had never been photographed, because you cannot switch off WebGL from
 * inside the page.
 *
 * `?refuse=1` takes the refusal branch deliberately. It is not a mock: it calls the same `die` a failed
 * shader compile calls, so what the capture shows is the real path.
 */
if (params.get('refuse') === '1') {
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
const shadow = required('shadow', createShadowMap(stage, 1536));
const skyBox = required('sky', createSkyBackdrop(stage));
const ao = required('ao', createAmbientOcclusion(stage, W, H));


/*
 * THE CALIBRATION. Every number below is fixed by a legibility requirement rather than by taste, and
 * the report checks that they still agree.
 */
/*
 * 12 h PER METRE, not 26 — and the reason is a collision, not a preference.
 *
 * At 26 h/m the four-block cluster at 44-47 h spans 0.115 m of corridor while each record is 0.62 m
 * wide. Five records deep in one slot: the capture was a pile of slabs with text over text, and the
 * "density is shape" claim this environment rests on was the thing it destroyed. Doubling the scale
 * fixes the ordinary gaps; it does NOT fix a cluster, which is what `TIER_H` below is for.
 */
const HOURS_PER_METRE = 12;
const REC_W = 0.62, REC_H = 0.40, REC_T = 0.05;
const CORRIDOR_HALF = 1.34;          // where the walls stand, so records mount clear of them
const FLOOR_Y = 0;
const REC_Y = 0.78;                  // eye height, so records are read rather than looked down on
/* 13 m: measured against the type, not chosen. At 190 px/m a 0.62 m record is a 118 px element; at
   13 m its 10.5 px body copy is about 4 px on screen, which is the floor at which a word is still a
   word. Past that the DOM is not withheld out of caution — it would be a grey smear claiming to be
   one. Moved from 9 m with the camera, because the limit is a distance from the EYE and the eye
   moved; leaving it at 9 would have gone on hiding records that are now perfectly legible. */
const LEGIBLE_M = 13.0;
/* Density such that fog reaches ~95% at 17 m, where the corridor ends. Solved rather than dialled:
   1 - exp(-d * 26) = 0.95  ->  d = ln(20)/26. The 26 is the corridor's visible depth from the
   eye, so widening the time scale had to move this too — a density left at the old length would put
   the visual horizon short of the geometry and hide records the frame implies are there. */
const FOG_DENSITY = FOG_ON ? Math.log(20) / 26 : 0;

/*
 * "NOW" IS A PLANE 3.4 m AHEAD OF THE VIEWER, not at their feet.
 *
 * With the time axis starting at z = 0 the three-hour-old record sat 0.25 m down the corridor and
 * 1.14 m to the side — about 78 degrees off the view axis, which no sensible lens contains. The newest
 * governed action was permanently half off-frame, and no camera distance fixes it: moving back shrinks
 * every other record, moving in pushes it further into the periphery.
 *
 * Offsetting the origin costs nothing the environment claims. Depth stays strictly linear in time and
 * the hours-per-metre scale is untouched; only the zero moves, so "now" is a wall the reader faces
 * rather than a line they are standing on.
 */
const NOW_OFFSET_M = 3.4;
const zOf = (hoursAgo: number): number => -(hoursAgo / HOURS_PER_METRE) - NOW_OFFSET_M;
/* A cluster stacks UPWARD rather than crowding along the axis. Depth stays strictly linear in time —
   which is the environment's whole premise — and the collision is resolved perpendicular to it, so
   four blocks in one afternoon read as a stack of four at one depth. That is not a workaround for the
   overlap; it is the clearest possible statement of what the overlap MEANT. */
const TIER_H = REC_H + 0.10;
const MAX_TIERS = 4;

const CORRIDOR_LEN = 44;
const CORRIDOR_MID = -CORRIDOR_LEN / 2 + 3;
const floorGeo = plane(6, CORRIDOR_LEN);
const wallGeo = box(0.22, 3.0, CORRIDOR_LEN);
const ceilGeo = box(2 * CORRIDOR_HALF + 0.44, 0.18, CORRIDOR_LEN);
/* THE FAR END IS CAPPED. Without it the analytic sky shows straight through the corridor's mouth and
   the deepest, most fogged part of the frame is its BRIGHTEST — the exact inverse of the reading. */
const endGeo = box(2 * CORRIDOR_HALF + 0.44, 3.0, 0.2);
const recGeo = box(REC_W, REC_H, REC_T);

const floorMesh = required('floor', uploadMesh(stage, floorGeo));
const wallMesh = required('wall', uploadMesh(stage, wallGeo));
const ceilMesh = required('ceiling', uploadMesh(stage, ceilGeo));
const endMesh = required('end wall', uploadMesh(stage, endGeo));
const recMesh = required('record', uploadMesh(stage, recGeo));

const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const modelOf = (x: number, y: number, z: number, yaw = 0): Float32Array => {
  /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0 and every vertex collapses to
     the origin with a complete framebuffer and no refusal anywhere. It cost E0 a day. */
  const m = IDENTITY();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

/*
 * THE EYE STANDS BACK FROM THE NEWEST RECORD, and the first camera did not.
 *
 * At distance 5.4 the eye sat at z ~ +0.2 while the three-hour-old record sits at z = -0.12 and
 * x = +/-1.18 — beside the viewer, not in front. `projectQuad` refused five records with
 * CORNER_BEHIND_CAMERA, which is the correct refusal and completely the wrong frame: the five most
 * RECENT governed actions, the ones an operator opens this surface to see, were the five it dropped.
 *
 * A "records receding into fog" composition fails at the near end first, and the count is what said
 * so. Looking at the capture would have shown a handsome corridor.
 */
/*
 * 33 DEGREES, NOT 46 — and the field of view was the actual problem, not the distance.
 *
 * Three framings were measured. At distance 9.6 / 46° the eye stood 2.7 m from the newest record,
 * which filled a third of the frame with its own text clipped by the edge: the most recent governed
 * action, the reason anyone opens this surface, was the least readable thing on it. Backing off to 13 m
 * fixed the clipping and made every record too small to read.
 *
 * Neither was a distance problem. A 46° lens on a 2.7 m-wide corridor throws the walls past the frame
 * edge at the near end, so the architecture arrives as two dark wedges — an X — rather than as a
 * space, and the depth it exaggerates is what shrank the far records. A longer lens compresses less:
 * the walls stay in frame, the corridor reads as a corridor, and records hold their size down its
 * length. §2 asks for a "deep architectural space", and a wide angle is the one lens choice that
 * cannot deliver one.
 */
const view: Viewpoint = { target: [0, 0.80, -9.0], distance: 8.6, azimuthDeg: 0, elevationDeg: 3.5, fovDeg: 33 };
const eye = eyeOf(view);

/*
 * RECORDS ARE ANGLED SIGNAGE, NOT WALL PLAQUES — and the first version was plaques.
 *
 * Mounted flat on the wall, a record's normal points across the corridor at the centre line. That
 * sounds right and is exactly wrong: the reader STANDS on the centre line, so they see each record
 * almost along its own plane. 16 of 25 came back EDGE_ON, and the elements' homographies grew large
 * enough to blow out the page box and break the screenshot entirely.
 *
 * Turned toward the corridor axis instead, at 0.42 of a right angle, which is how signage in a real
 * corridor is hung — angled at oncoming traffic rather than parallel to it. At a full 1.0 they are
 * plaques and unreadable; at 0 they are five identical rectangles facing the camera and the corridor
 * stops reading as a corridor. This is the same trade E1's FACE_FRACTION makes, for the same reason,
 * which is why the number is close to it.
 *
 * Records alternate walls, so two actions minutes apart do not occlude each other.
 */
const RECORD_FACE = 0.42;
const SIDE_X = CORRIDOR_HALF - 0.20;
/* Per-wall occupancy, walked in time order: a record whose depth is within one record-width of the
   last one placed on its wall goes up a tier instead of overlapping it. */
const lastOnWall: { z: number; tier: number }[] = [
  { z: Infinity, tier: -1 }, { z: Infinity, tier: -1 },
];
const placed = RECORDS.map((r, i) => {
  const left = i % 2 === 0;
  const wall = left ? 0 : 1;
  const x = left ? -SIDE_X : SIDE_X;
  /*
   * AIMED AT THE MEASURED EYE, NOT AT A SIGN I REASONED OUT.
   *
   * I derived the sign from the winding convention and got it backwards: all 19 front-facing records
   * came back BACK_FACING, pointing into their own walls. `signedArea` caught it — nothing rendered
   * wrong, 19 records simply went quiet — but reasoning about a winding through two coordinate
   * conventions and a camera azimuth is how that happens, and it will happen again to the next
   * environment that hard-codes a facing.
   *
   * So the record aims at the eye and is turned back by `1 - RECORD_FACE`. Correct at any azimuth, and
   * it is what E1 already does for its panels — the sign cannot be wrong because it is measured.
   */
  /* `z` FIRST. Aiming at the eye reads `z`, and declaring it below cost a
     "Cannot access 'z' before initialization" — the same temporal-dead-zone shape as E0's DIAG flag,
     and a page that throws there never sets its title, so the harness reported it as a screenshot
     failure two layers away. */
  const z = zOf(r.hoursAgo);
  const toEye = Math.atan2(eye[0] - x, eye[2] - z);
  const yaw = toEye * RECORD_FACE + (left ? 1 : -1) * (Math.PI / 2) * (1 - RECORD_FACE);

  const prev = lastOnWall[wall]!;
  const crowded = Math.abs(z - prev.z) < REC_W * 1.05;
  /* Tiers wrap at MAX_TIERS rather than climbing into the ceiling. A cluster deeper than four is a
     real possibility and a record 2 m up is a record nobody reads; `tierOverflow` is reported so a
     wrapped stack is a KNOWN loss rather than a silent one. */
  const tier = crowded ? (prev.tier + 1) % MAX_TIERS : 0;
  const tierOverflow = crowded && prev.tier + 1 >= MAX_TIERS;
  lastOnWall[wall] = { z, tier };
  const y = REC_Y + tier * TIER_H;

  return { ...r, i, left, x, y, yaw, z, tier, tierOverflow, distance: 0 };
});

for (const p of placed) p.distance = Math.hypot(p.x - eye[0], p.y - eye[1], p.z - eye[2]);

const VERDICT_MATERIAL: Record2 = {
  ALLOWED: { hex: '#2C6BFF', roughness: 0.36, metalness: 0.06 },
  BLOCKED: { hex: '#C9552B', roughness: 0.42, metalness: 0.05 },
  /* Withheld is neither an allow nor a block: it is the ABSENCE OF A READING, and giving it either
     colour would assert a verdict nobody is entitled to know. Steel says "a record is here". */
  WITHHELD: { hex: '#5C6880', roughness: 0.30, metalness: 0.55 },
};
type Record2 = Record3<Verdict, { hex: string; roughness: number; metalness: number }>;
type Record3<K extends string, V> = { [P in K]: V };

const draws: LitDraw[] = [
  { mesh: floorMesh, model: modelOf(0, FLOOR_Y, CORRIDOR_MID), normalMat: N3,
    material: { baseColour: hexToLinear('#080C15'), roughness: 0.84, metalness: 0 } },
  { mesh: wallMesh, model: modelOf(-CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
    material: { baseColour: hexToLinear('#141F35'), roughness: 0.62, metalness: 0.03 } },
  { mesh: wallMesh, model: modelOf(CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
    material: { baseColour: hexToLinear('#141F35'), roughness: 0.62, metalness: 0.03 } },
  { mesh: ceilMesh, model: modelOf(0, 2.86, CORRIDOR_MID), normalMat: N3,
    material: { baseColour: hexToLinear('#0A101C'), roughness: 0.80, metalness: 0 } },
  { mesh: endMesh, model: modelOf(0, 1.5, CORRIDOR_MID - CORRIDOR_LEN / 2), normalMat: N3,
    material: { baseColour: hexToLinear('#0B1220'), roughness: 0.86, metalness: 0 } },
  ...placed.map((p): LitDraw => {
    const m = VERDICT_MATERIAL[p.verdict];
    return {
      mesh: recMesh, model: modelOf(p.x, p.y, p.z, p.yaw), normalMat: N3,
      material: { baseColour: hexToLinear(m.hex), roughness: m.roughness, metalness: m.metalness },
    };
  }),
];

/* Down the corridor and slightly to one side, so records on both walls take light at a grazing angle
   and their 5 cm edges catch it. A light down the axis would flatten every slab against its wall. */
const lightDir: [number, number, number] = [0.34, -0.42, -0.84];
const sceneMin: [number, number, number] = [-2.2, 0, -26];
const sceneMax: [number, number, number] = [2.2, 3.4, 3.0];
const lightVP = lightViewProjection(
  { direction: lightDir, colour: [1, 1, 1], extent: 11 },
  boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
);

const tris = triangleCount(floorGeo) + 2 * triangleCount(wallGeo) + triangleCount(ceilGeo) + triangleCount(endGeo)
  + placed.length * triangleCount(recGeo);
const near = 0.1, far = 60;

function frame() {
  const vp = viewProjection(view, W / H);
  lit.shadowPass(lightVP, draws, shadow);
  target.bind();
  /*
   * NO SKY BACKDROP, AND THE AMBIENT IS CUT TO A THIRD — because a vault has no sky, and the first
   * capture is what proved how much that matters.
   *
   * `skyColour` is a DAYLIGHT environment: the analytic zenith is bright, and a floor plane's normal
   * points straight at it. Inside a sealed corridor at ambientGain 0.86 the floor and ceiling became
   * two glowing wedges brighter than anything the key light was doing, the far end showed open sky
   * through the corridor's mouth, and the fog — the entire point of the environment — was invisible
   * against it. It read as a bright tunnel, not a vault.
   *
   * Clearing to the FOG colour instead means every surface converges on the value the clear already
   * has, so distance goes genuinely dark rather than washing toward a horizon that is not there. The
   * sky is still the specular environment for the records' sheen, at a third strength, which is the
   * part of it that was doing real work.
   */
  const fc = hexToLinear('#0B1220');
  gl.clearColor(fc[0], fc[1], fc[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  lit.depthPrepass(vp, draws);
  if (AO_ON) {
    ao.compute({ depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 46, aspect: W / H, radius: 0.42, strength: 1.35 });
    target.bind();
  }
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [3.0, 2.95, 2.85],
    ambientGain: 0.46, lightVP, shadow, shadowStrength: 0.94, draws,
    ao: AO_ON ? ao.texture : null, screenSize: [W, H],
    /*
     * A LITERAL COLOUR, NOT 'sky'. The vault is enclosed — there is no sky for a distant surface to
     * agree with, and taking the analytic sky here would fade the far end of a sealed corridor toward
     * a daylight horizon that nothing in the room could produce. The hex is the wall's own colour
     * lifted slightly, so distance converges on the architecture rather than on a haze.
     */
    fog: FOG_DENSITY > 0
      ? { density: FOG_DENSITY, height: 6.0, floor: 0, colour: hexToLinear('#0B1220') }
      : null,
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  stage.blit(present, (prog) => gl.uniform1i(gl.getUniformLocation(prog, 'uScene'), 0));
}

/*
 * THE INSTRUMENT, CORRECTED. The first version was `gl.finish()` over a 4-frame batch with no
 * warm-up, and it reported 0.45 ms for a shadow-mapped, AO'd 1200x720 frame under a CPU rasteriser —
 * a number that is not physically plausible and that I published in a README and a commit message
 * as fact.
 *
 * `gl.finish()` returns once the command buffer is FLUSHED, not once the GPU has finished; this repo
 * had already written that down twice (docs/3d/p1/README.md and E1's own comment) and E0, E1, E2 and
 * E8 all use the trailing-readPixels form. E5 and E6 did not. A pixel read cannot be satisfied until
 * the frame it reads actually exists, which is what makes the clock mean something.
 *
 * The warm-up frame matters too: the first frame pays shader upload and texture allocation, and
 * averaged over a 4-frame batch that alone can dominate the result.
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
 * THE DOM LAYER, AND THE HORIZON IT IS HONEST ABOUT.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const vpFinal = viewProjection(view, W / H);
const CSS_W = W / SCALE, CSS_H = H / SCALE;

const wrap = document.createElement('div');
/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to the canvas box or it
   extends the PAGE box, and a surface seen nearly edge-on produces a homography whose
   coefficients are enormous — the element's transformed bounding box then runs to millions of
   pixels and Playwright's `fullPage` screenshot fails with "Unable to capture screenshot",
   naming the screenshot rather than the transform three layers away that caused it. */
wrap.style.cssText = `position:relative;overflow:hidden;width:${CSS_W}px;height:${CSS_H}px`;
canvas.parentNode?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);

/* The fog fraction at a distance, from the SAME constants the shader was given. Computed here so the
   report's legibility claims and the render's appearance cannot drift — a second hand-tuned curve for
   the instrumentation would let the numbers stay true while the picture stopped being. */
const fogAt = (dist: number): number => (FOG_DENSITY <= 0 ? 0 : 1 - Math.exp(-FOG_DENSITY * dist));

const PX_PER_METRE = 190;
/*
 * SCREEN-SPACE OCCLUSION, because per-wall depth spacing is not enough.
 *
 * Tiering fixes records that collide ALONG the corridor. It does nothing for a record on the left wall
 * whose projected quad lands on top of a nearer record on the right — different depths, different
 * walls, same pixels. The capture showed `x402.settle` written across `svc.payagent` and
 * `listing.approve` across `ALLOWED · 9h`, which is unreadable in the specific way that still looks
 * like text and so does not announce itself as broken.
 *
 * There is no depth buffer in the compositor, so the only honest move is E1's: a record whose content
 * is covered REFUSES to show text. It costs shown records — which is why the count is reported by
 * reason, so the loss is visible rather than absorbed.
 */
const shownQuads: { x: number; y: number }[][] = [];
const inQuad = (q: { x: number; y: number }[], x: number, y: number): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const sg = cross > 0 ? 1 : -1;
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
  }
  return true;
};

const decided = [...placed].sort((a, b) => a.distance - b.distance).map((p) => {
  /*
   * THREE REASONS NOT TO SHOW TEXT, AND THEY ARE DIFFERENT REASONS.
   *
   * · WITHHELD — the record exists and may not be read. The slab stays lit and stays at its own
   *   moment in time. This is the state a table destroys by either showing a row or not.
   * · TOO FAR — the record may be read but at this distance the type would be a smear. Withholding
   *   it is honesty about resolution, not about permission.
   * · OFF FRAME / BEHIND — geometry, handled by `projectQuad`'s own refusal.
   *
   * Collapsing any two of these into one "hidden" flag would make the report unable to answer the
   * only question an operator actually has, which is whether they are being denied or merely
   * standing too far away.
   */
  const withheld = p.verdict === 'WITHHELD';
  const tooFar = p.distance > LEGIBLE_M;
  const ew = Math.round(REC_W * PX_PER_METRE), eh = Math.round(REC_H * PX_PER_METRE);
  const corners = uprightPanelCorners(p.x, p.z, p.y - REC_H / 2, REC_W, REC_H, p.yaw, REC_T / 2 + 0.004);
  const proj = projectQuad(vpFinal, corners, CSS_W, CSS_H, ew, eh);

  const refusal = isQuadRefusal(proj) ? proj.refusal : null;
  const backFacing = !isQuadRefusal(proj) && proj.signedArea <= 0;
  /*
   * EDGE-ON IS A FOURTH REASON, and it took a failed screenshot to find it.
   *
   * Records are yawed to face the corridor's centre line, which is exactly where the reader stands —
   * so a record beside the eye is seen almost along its own plane. `projectQuad` is right to accept
   * it: every corner is in front of the camera and the quad is front-facing. But the projected width
   * collapses toward zero, the homography's coefficients grow without bound, and the DOM element's
   * transformed box runs off to millions of pixels. Legibility aside, that is not text a reader could
   * use; measured against the same 26 px floor E5 settled on.
   */
  const widthPx = isQuadRefusal(proj) ? 0 : Math.max(
    Math.hypot(proj.screen[0]!.x - proj.screen[1]!.x, proj.screen[0]!.y - proj.screen[1]!.y),
    Math.hypot(proj.screen[3]!.x - proj.screen[2]!.x, proj.screen[3]!.y - proj.screen[2]!.y),
  );
  const edgeOn = widthPx < 26;
  /*
   * TESTED AGAINST NEARER RECORDS, WHICH MEANS THIS PASS WALKS NEAR TO FAR — and the first version
   * walked the other way and therefore found nothing.
   *
   * Sorting far-to-near is right for PAINTING, because a later DOM element covers an earlier one. It
   * is exactly wrong for deciding occlusion: the already-accepted quads are then the ones BEHIND the
   * record being tested, so the check asked whether a near record was hidden by a far one. It reported
   * zero occlusions against a capture that visibly had them, which is the most useful kind of wrong —
   * a test that agrees with the code and disagrees with the picture.
   *
   * So the two orders are now separate: decide near-to-far, paint far-to-near.
   *
   * Two corners is the threshold. One corner clipped by a nearer record still leaves the action name
   * and the actor legible; two does not.
   */
  /*
   * SYMMETRIC, because one-directional corner containment misses the commonest case.
   *
   * Testing only "is a corner of the far record inside a nearer quad" reported ZERO occlusions against
   * a capture with visibly overlapping text. The reason is that a large near record covers the MIDDLE
   * of a smaller far one without either quad's corners landing inside the other — so both corner tests
   * pass and the words still sit on top of each other. Checking both directions catches it, and is
   * still four cheap point-in-quad tests per pair rather than a general polygon clip.
   */
  const coveredCorners = isQuadRefusal(proj) ? 0 : (
    proj.screen.filter((c) => shownQuads.some((q) => inQuad(q, c.x, c.y))).length
    + shownQuads.reduce((n, q) => n + q.filter((c) => inQuad(
      proj.screen.map((v) => ({ x: v.x, y: v.y })), c.x, c.y,
    )).length, 0)
  );
  const occluded = coveredCorners >= 2;
  const shown = !refusal && !backFacing && !withheld && !tooFar && !edgeOn && !occluded;
  if (shown && !isQuadRefusal(proj)) shownQuads.push(proj.screen.map((c) => ({ x: c.x, y: c.y })));

  /* `ew`/`eh` travel with the decision, because the paint pass below is a separate loop and the
     element size is computed here. */
  return { p, proj, shown, ew, eh, refusal, backFacing, withheld, tooFar, edgeOn, occluded, widthPx, coveredCorners };
});

/* PAINTED FAR TO NEAR, so a nearer element covers a further one — the opposite order to the decision
   pass above, and for the opposite reason. */
for (const d of [...decided].sort((a, b) => b.p.distance - a.p.distance)) {
  const { p, proj, shown, ew, eh } = d;
  if (shown && !isQuadRefusal(proj)) {
    /* Contrast tracks the fog, so a record two-thirds hazed does not present crisp black-on-white
       text over a wall that has visibly faded. The text obeys the same atmosphere as the slab. */
    const haze = fogAt(p.distance);
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:0;top:0;width:${ew}px;height:${eh}px;`
      + `transform-origin:0 0;transform:${proj.transform};display:flex;flex-direction:column;`
      + `justify-content:center;gap:5px;padding:0 5px;overflow:hidden;`
      + `opacity:${(1 - 0.75 * haze).toFixed(3)};-webkit-font-smoothing:antialiased`;
    const hrs = p.hoursAgo;
    const when = hrs < 24 ? `${hrs}h ago` : `${(hrs / 24).toFixed(hrs < 72 ? 1 : 0)}d ago`;
    el.innerHTML =
      `<div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.15em;color:rgba(255,255,255,0.66)">`
      + `${p.verdict} · ${when}</div>`
      /* 12 px, not 14. `campaign.publish` is 16 characters, and at 14 px monospace that is 134 px in a
         118 px box — `overflow:hidden` then silently served `campaign.publ` as though it were the
         action's name. A truncated identifier in an audit record is worse than no record, so this is
         sized against the LONGEST action present (16 chars) with the padding cut to 5 px: 16 x 6.6 px
         is 106 px inside a 108 px box. `actionOverflow` in the report re-checks it, because the next
         action name someone adds will be longer than this one. */
      + `<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${p.action}</div>`
      + `<div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.74)">${p.actor}</div>`;
    overlay.appendChild(el);
  }
}

const projected = decided.map(({ p, shown, refusal, backFacing, withheld, tooFar, edgeOn, occluded, widthPx, coveredCorners }) => {
  return {
    i: p.i, verdict: p.verdict, hoursAgo: p.hoursAgo,
    distance: Number(p.distance.toFixed(2)),
    fog: Number(fogAt(p.distance).toFixed(3)),
    widthPx: Math.round(widthPx),
    coveredCorners,
    shown,
    /* NAMED, NOT COUNTED. Three states, three fields, never summed. */
    hiddenBecause: shown ? null : withheld ? 'WITHHELD' : refusal ? refusal
      : backFacing ? 'BACK_FACING' : edgeOn ? 'EDGE_ON' : tooFar ? 'BEYOND_LEGIBLE_RANGE' : 'OCCLUDED',
  };
});

/*
 * THE HORIZON, PRINTED ON THE FRAME. This is the reading a table cannot give: not "here are 25 rows"
 * but "this is how far back you can see, and this is where it stops".
 */
const legibleHours = Math.max(0, ...projected.filter((p) => p.shown).map((p) => p.hoursAgo));
const visibleHours = Math.max(...placed.map((p) => p.hoursAgo));
const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px';
hud.innerHTML =
  `<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">`
  + `GOVERNED ACTIONS · DEPTH IS TIME</div>`
  + `<div style="font:400 10.5px/1.5 ui-monospace,monospace;color:rgba(196,212,240,0.84)">`
  + `READABLE TO ${(legibleHours / 24).toFixed(1)} d &nbsp;·&nbsp; VISIBLE TO ${(visibleHours / 24).toFixed(1)} d<br>`
  + `${HOURS_PER_METRE} h PER METRE &nbsp;·&nbsp; ${FOG_ON ? 'FOG ON' : 'FOG OFF — reading limit NOT shown'}</div>`
  + `<div style="font:500 10px/1.4 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RECORDS</div>`;
overlay.appendChild(hud);

const counts = {
  ALLOWED: placed.filter((p) => p.verdict === 'ALLOWED').length,
  BLOCKED: placed.filter((p) => p.verdict === 'BLOCKED').length,
  WITHHELD: placed.filter((p) => p.verdict === 'WITHHELD').length,
};
const legend = document.createElement('div');
legend.style.cssText = 'position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;'
  + 'gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace';
legend.innerHTML = ([
  ['#2C6BFF', `ALLOWED · ${counts.ALLOWED}`],
  ['#C9552B', `BLOCKED · ${counts.BLOCKED}`],
  ['#5C6880', `WITHHELD · ${counts.WITHHELD} (present, unreadable)`],
] as const).map(([c, t]) => (
  `<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)">`
  + `<span>${t}</span><span style="width:11px;height:11px;background:${c};display:inline-block"></span></div>`
)).join('');
overlay.appendChild(legend);

/* A depth ruler down the floor, so "depth is time" is a marked axis rather than an assertion. Screen
   space, because it annotates the corridor rather than sitting on a surface in it. */
const rulerTicks = [1, 3, 7, 14].map((days) => {
  const z = zOf(days * 24);
  const p = projectScreen(vpFinal, [-CORRIDOR_HALF + 0.30, 0.035, z], CSS_W, CSS_H);
  const haze = fogAt(Math.hypot(eye[0] + CORRIDOR_HALF - 0.30, eye[1] - 0.035, eye[2] - z));
  if (!p.behind && p.sx > 0 && p.sx < CSS_W && p.sy > 0 && p.sy < CSS_H) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${p.sx.toFixed(1)}px;top:${p.sy.toFixed(1)}px;`
      + `transform:translate(-50%,-50%);font:500 10px/1 ui-monospace,monospace;letter-spacing:.08em;`
      + `color:rgba(196,212,240,${(0.85 * (1 - haze)).toFixed(3)});white-space:nowrap`;
    el.textContent = `${days}d`;
    overlay.appendChild(el);
  }
  return { days, sx: Math.round(p.sx), sy: Math.round(p.sy), fog: Number(haze.toFixed(3)), onFrame: !p.behind && p.sx > 0 && p.sx < CSS_W };
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
  /* Empty means every brand hex round-tripped exactly through this frame's own pipeline. */
  brandFidelity: brandFailures,
  ao: AO_ON,
  fog: FOG_ON,
  fogDensity: Number(FOG_DENSITY.toFixed(4)),
  hoursPerMetre: HOURS_PER_METRE,
  legibleMetres: LEGIBLE_M,
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),
  /* THE HEADLINE PAIR. Readable-to and visible-to are DIFFERENT horizons, and a frame that reported
     only one of them would be claiming either more or less reach than it has. */
  readableToDays: Number((legibleHours / 24).toFixed(2)),
  visibleToDays: Number((visibleHours / 24).toFixed(2)),
  records: placed.length,
  /* A record whose action name will not fit its own box. Zero today; the check exists because the
     next action added will be longer, and a silently truncated identifier is worse than none. */
  actionOverflow: placed.filter((p) => p.action.length * 6.6 > REC_W * PX_PER_METRE - 10).map((p) => p.action),
  /* Tiers used, and whether any stack wrapped. A wrapped stack loses a record behind another, so it
     is reported rather than left to be discovered in a capture. */
  tiersUsed: Math.max(...placed.map((p) => p.tier)) + 1,
  tierOverflows: placed.filter((p) => p.tierOverflow).length,
  counts,
  shown: projected.filter((p) => p.shown).length,
  /* Grouped by REASON, because "17 hidden" is useless and "3 withheld, 14 too far" is actionable. */
  hiddenBy: projected.filter((p) => !p.shown).reduce<Record3<string, number>>((acc, p) => {
    const k = p.hiddenBecause ?? 'UNKNOWN';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {}),
  /* Fog at the nearest and furthest record. If these are equal the fog is doing nothing, whatever
     the density says — which is the failure mode a screenshot cannot distinguish from subtlety. */
  fogNearest: Math.min(...projected.map((p) => p.fog)),
  fogFurthest: Math.max(...projected.map((p) => p.fog)),
  rulerTicks,
  rulerOffFrame: rulerTicks.filter((t) => !t.onFrame).length,
  perRecord: projected,
  glError: gl.getError(),
  triangles: tris,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  frames: FRAMES,
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
(globalThis as unknown as { E6: typeof report }).E6 = report;
/*
 * THE PRINTED REPORT IS SUMMARISED; THE FULL ONE STAYS ON `globalThis`.
 *
 * `perRecord` has an entry per record and `fullPage: true` screenshots the log along with the frame.
 * Pretty-printed, 25 records pushed the page past Chrome's capture height and `Page.captureScreenshot`
 * failed outright — so a harness whose report grows with its data eventually stops being able to
 * capture at all, and the error names the screenshot rather than the cause.
 *
 * The capture script reads `globalThis.E6`, not this text, so nothing is lost by summarising here.
 */
const { perRecord, rulerTicks: _rt, ...summary } = report;
log.textContent = JSON.stringify(summary, null, 2)
  + `\n\nperRecord (${perRecord.length}, full detail on globalThis.E6):\n`
  + perRecord.map((r) => (
    `  #${String(r.i).padStart(2)} ${r.verdict.padEnd(9)} ${String(r.hoursAgo).padStart(4)}h`
    + ` ${String(r.distance).padStart(6)}m fog ${r.fog.toFixed(3)}`
    + ` ${r.shown ? 'SHOWN' : `hidden: ${r.hiddenBecause}`}`
  )).join('\n');
frame();
/* AFTER the final frame, never before: the table is hidden only once a frame demonstrably exists. The
   failure mode of this ordering is a visible table under a working canvas, which is loud and
   self-announcing — the right direction for a fallback to fail in. */
fallback.markRendered();
document.title = 'READY';
