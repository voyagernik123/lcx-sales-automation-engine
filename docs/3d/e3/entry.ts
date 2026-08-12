/**
 * E3 · THE PIPELINE — deals as physical objects in a lit channel.
 *
 * `3D_VFX_1000X.md` §2: "Deals as physical objects moving down a lit channel; stage gates as
 * luminous membranes; a deal's mass = package value, its velocity = days-since-update. Stalls
 * visibly settle." It replaces `BdPipeline`, a table of leads with one sort key at a time.
 *
 * ── WHAT A BAR LIST CANNOT SAY, AND THIS CAN ──────────────────────────────────────────
 * §7(b) is the clause that stops this programme becoming a showreel, so the first question is what an
 * operator learns here that a sorted table does not tell them faster. Three things, and all three are
 * consequences of value, stage and movement occupying three ORTHOGONAL axes of one object rather than
 * three columns of one row:
 *
 * 1 · VALUE AT REST IS ONE LOOK. A table gives value in one column and days-since-update in another;
 *     the quantity an operator actually wants — how much money has cleared the hard gates and then
 *     stopped moving — needs two sorts and arithmetic. Here it is the large objects lying on the floor
 *     in the near half of the channel, and the report prints the figure the picture shows.
 *
 * 2 · ATTRITION IS A DENSITY. Each gate emits a particle stream whose LINEAR DENSITY is the value per
 *     day clearing it, so the funnel narrowing is visible as the streams thinning toward the close
 *     end. A table can show five stage counts; it cannot show the flow between them.
 *
 * 3 · AN UNPRICED DEAL IS SHAPED DIFFERENTLY FROM A WITHHELD ONE. In a table both are a blank cell.
 *     Here one is a ring — a hole where the mass should be — and the other is a sealed steel sphere
 *     floating OFF the movement scale entirely, because a deal whose last-touch date may not be read
 *     has no position on that axis and putting it at zero would assert freshness nobody measured.
 *
 * ── WHERE THIS DEPARTS FROM §2, DELIBERATELY ──────────────────────────────────────────
 * §2 says a deal's VELOCITY is days-since-update. A still frame has no velocity, and §6 rule 2 forbids
 * idle animation — a channel of objects drifting forever is an idle animation with a budget. So the
 * same datum is rendered as HEIGHT: a deal updated today rides at the rail, a deal untouched for
 * `STALL_DAYS` rests on the floor. "Stalls visibly settle" is the part of the brief that survives into
 * a static frame, and it is the part that carries the reading.
 */
import {
  createStage, isStage, box, plane, sphere, torus, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createAmbientOcclusion, createLineBatch, createParticleField,
  projectQuad, isQuadRefusal, uprightPanelCorners,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, mixLinear, projectScreen, TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal, type ParticleSource, type Linear,
} from '@lcx/gl';

const params = new URLSearchParams(location.search);
/*
 * THE CONTROL THAT MATTERS HERE. `?settle=0` pins every deal to the rail, which is exactly what the
 * bar list does: value and stage, and movement demoted to a number in a column. The separation
 * measured below goes to zero in that variant, so the claim that the third axis carries something is
 * a number the capture script asserts across two runs rather than a sentence in this comment.
 */
const SETTLE_ON = params.get('settle') !== '0';
const PARTICLES_ON = params.get('particles') !== '0';
const FOG_ON = params.get('fog') !== '0';
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
/* The gate outlines, the movement axis and the tag leaders are additive strokes, not meshes.
   `ruleAtDepth` is exact for a segment lying in a constant-depth plane and the primitive says so in
   its own signature — every stroke here is a gate frame, an axis tick or a vertical leader at one z,
   so every one of them qualifies. The wake a moving object wants runs ALONG the channel and therefore
   slants through depth, which this primitive explicitly refuses to fake. It is not drawn. */
const strokes = required('strokes', createLineBatch(stage));

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DEALS. Synthetic, and said so ON THE FRAME in amber rather than in a comment nobody opens.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The SHAPE is the part that has to be real, because it is what the environment is being tested on: a
 * pipeline is a FUNNEL (four sourced, one signed), value is heavily skewed to a couple of names, and
 * the deals that have stalled are not the small ones — the two biggest items past diligence are the
 * two that have stopped, which is the actual pathology this surface exists to find. A uniform spread
 * of twelve equal deals would exercise none of that and would make the headline number below true by
 * construction rather than by measurement.
 */
type StageId = 'SOURCED' | 'QUALIFIED' | 'DILIGENCE' | 'TERMS' | 'SIGNED';
/** Of the VALUE and the last-touch date, which are separate readings and fail separately. */
type Known = 'OBSERVED' | 'VALUE_ABSENT' | 'WITHHELD';
interface Deal {
  name: string;
  stage: StageId;
  /** `null` = never measured. Never 0, never inferred from a neighbour. */
  valueUsd: number | null;
  daysSinceUpdate: number | null;
  known: Known;
}

const STAGE_ORDER: readonly StageId[] = ['SOURCED', 'QUALIFIED', 'DILIGENCE', 'TERMS', 'SIGNED'];

const DEALS: readonly Deal[] = [
  { name: 'SABLE TREASURY', stage: 'SOURCED', valueUsd: 240_000, daysSinceUpdate: 63, known: 'OBSERVED' },
  /* Priced never, not priced zero. The mass axis REFUSES for this one. */
  { name: 'PRAXIS DESK', stage: 'SOURCED', valueUsd: null, daysSinceUpdate: 9, known: 'VALUE_ABSENT' },
  { name: 'CASTOR LABS', stage: 'SOURCED', valueUsd: 150_000, daysSinceUpdate: 34, known: 'OBSERVED' },
  { name: 'LUMEN CUSTODY', stage: 'SOURCED', valueUsd: 95_000, daysSinceUpdate: 17, known: 'OBSERVED' },
  { name: 'TIBER CLEARING', stage: 'QUALIFIED', valueUsd: 310_000, daysSinceUpdate: 4, known: 'OBSERVED' },
  { name: 'VANTA MARKETS', stage: 'QUALIFIED', valueUsd: 620_000, daysSinceUpdate: 28, known: 'OBSERVED' },
  /* A compartment the reader is not cleared for. It exists, it is in a stage, and that is ALL that
     may be read: no name, no value, no last touch. Both other axes therefore refuse. */
  { name: '—', stage: 'QUALIFIED', valueUsd: null, daysSinceUpdate: null, known: 'WITHHELD' },
  { name: 'HELIOS EXCHANGE', stage: 'DILIGENCE', valueUsd: 1_750_000, daysSinceUpdate: 52, known: 'OBSERVED' },
  { name: 'KESTREL FUND', stage: 'DILIGENCE', valueUsd: 430_000, daysSinceUpdate: 11, known: 'OBSERVED' },
  { name: 'MERIDIAN PAY', stage: 'TERMS', valueUsd: 2_600_000, daysSinceUpdate: 41, known: 'OBSERVED' },
  { name: 'NORDIC CUSTODY', stage: 'TERMS', valueUsd: 880_000, daysSinceUpdate: 6, known: 'OBSERVED' },
  { name: 'ATLAS OTC', stage: 'SIGNED', valueUsd: 4_200_000, daysSinceUpdate: 3, known: 'OBSERVED' },
];

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CALIBRATION. Every number is fixed by a reading requirement, and the report re-checks them.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
/* 45 DAYS IS THE FLOOR OF THE MOVEMENT AXIS, and it is a policy number rather than a taste one: the
   point past which a deal is treated as dead rather than slow. Beyond it the axis CLAMPS instead of
   extending, so a 63-day deal and a 90-day deal both rest on the floor — the axis does not pretend to
   resolve a difference nobody acts on. `settleClamped` counts how many are on the clamp. */
const STALL_DAYS = 45;
/* How far a fresh deal rides above the channel floor. A settled deal's underside is AT the floor, so
   "settled" is contact rather than a low number — the only version of this a still frame can state
   without a legend. */
const RAIL_LIFT = 0.86;
/* MASS IS VOLUME, so the edge is the CUBE ROOT of value. An edge linear in value would make the 4.2 M
   deal 44 times the edge of the 95 k one and put it through the channel walls; a linear-in-edge ramp
   between two chosen sizes looks better and silently asserts a scale nobody can invert. The cost of
   the honest choice is that the small end is perceptually weak, which is named in the README and is
   why every readable deal also carries its number in the DOM. */
const EDGE_MAX = 0.46;
const VALUE_MAX = Math.max(...DEALS.map((d) => d.valueUsd ?? 0));
const edgeOf = (v: number): number => EDGE_MAX * Math.cbrt(v / VALUE_MAX);
/* The size given to an object whose value is unreadable. It encodes NOTHING, which is why the two
   states that use it are also the two that do not use a box: a reference-sized cube among value-sized
   cubes is a lie in the one visual channel a reader trusts most. */
const REF_SIZE = 0.11;

const CHANNEL_HALF = 1.45;
const STAGE_LEN = 2.8;
const Z_GATE0 = -13.0;
const CHANNEL_Z_FAR = Z_GATE0 - 2.6;
const CHANNEL_Z_NEAR = 0.4;
const CHANNEL_LEN = CHANNEL_Z_NEAR - CHANNEL_Z_FAR;
const CHANNEL_MID = (CHANNEL_Z_NEAR + CHANNEL_Z_FAR) / 2;
const GATE_H = 1.15;
const gateZ = (i: number): number => Z_GATE0 + i * STAGE_LEN;

/*
 * Deals occupy SLOTS inside their stage's segment, alternating lanes so two neighbours do not sit on
 * one sight line. The slot index is a PACKING position, not a datum: what is data is which gates the
 * deal is past. That every slot stays inside its own segment is checked below rather than trusted.
 *
 * `SLOT_DZ` WAS 0.58 AND IS NOW 0.40, because depth and height are both mapped to screen y by a camera
 * that looks slightly down, so two deals in one stage at different depths have their settling partly
 * cancelled by their spacing. The first measurement put the SOURCED pair 13 px apart when their
 * world-space heights differ by half a metre. Tightening the slot pitch shrinks the cancellation but
 * cannot remove it, which is why the primary proof below is each deal's displacement from its OWN rail
 * position — a measure with no depth term in it at all.
 */
const SLOT_Z0 = 0.62, SLOT_DZ = 0.40, LANE_X = 0.60;

const TAG_W = 0.66, TAG_H = 0.30, TAG_GAP = 0.16;
const PX_PER_METRE = 190;
/*
 * 13.5 m, DERIVED FROM THE TYPE rather than chosen. A tag is 0.30 m tall and its element is 57 px, so
 * at distance d the CSS scale is (0.30 * (H/2) / (d * tan(fov/2))) / 57 ≈ 6.0/d. The smallest type in
 * a tag is 9 px, which lands at 4 px on screen at d = 13.5 — the floor at which a word is still a
 * word. Past that the DOM is not withheld out of caution; it would be a grey smear claiming to be a
 * counterparty's name, which is worse than an unlabelled object.
 */
const LEGIBLE_M = 13.5;
/* Solved rather than dialled: 1 - exp(-density * 17.5) = 0.90, where 17.5 m is the eye-to-intake
   distance measured below, so the intake end fades toward the clear colour instead of stopping at a
   hard edge. If the camera moves this has to move with it. */
const FOG_DENSITY = FOG_ON ? Math.log(10) / 17.5 : 0;
const FOG_HEX = '#080D18';

/* Value cleared per day, and the window it is measured over. A rate needs a window and a window needs
   stating: quoting "$/day" off twelve open deals with no period is a number with no units. */
const WINDOW_DAYS = 90;
/* ONE PARTICLE IS $1,600 OF PACKAGE VALUE CROSSING THIS GATE, and one second of simulation is one day
   of pipeline. Both halves are needed for `rate` (particles per SECOND) to mean anything — a rate
   derived from a dollar figure with no time compression is a number that happens to look busy. */
const USD_PER_PARTICLE = 1_600;
const PARTICLE_SPEED = 1.4;
const PARTICLE_CAPACITY = 1024;
/* Enough steps at 1/60 s to exceed the longest particle life, so the field the capture photographs is
   at STEADY STATE. Photographing a filling field would make the density — the whole reading — a
   function of how many frames the harness happened to run. */
const PRIME_STEPS = 150;

const FRESH_HEX = '#2C6BFF';
const STALLED_HEX = '#C9552B';
const ABSENT_HEX = '#E0A94A';
const WITHHELD_HEX = '#5C6880';

/* 40 segments, not 96. The subdivision exists so shadow-map depth interpolation does not go
   degenerate across one enormous quad at a grazing angle; 96 was 18,432 triangles of flat floor
   rasterised three times a frame (shadow, prepass, lit) for no additional shading detail, and it was
   worth 40 ms of the frame under SwiftShader. */
const floorGeo = plane(2 * CHANNEL_HALF, 40);
const wallGeo = box(0.18, 1.25, CHANNEL_LEN);
const postGeo = box(0.10, GATE_H, 0.10);
const lintelGeo = box(2 * CHANNEL_HALF + 0.20, 0.10, 0.10);
const sillGeo = box(2 * CHANNEL_HALF, 0.05, 0.13);
/*
 * ONE UNIT CUBE, SCALED PER DEAL, rather than twelve box geometries.
 *
 * Twelve `box(e,e,e)` uploads is twelve VAOs and twelve buffer sets for one shape, and it also puts
 * the size in the GEOMETRY where nothing can read it back — the scale then lives in two places the
 * moment anything wants to know how big a deal is. Scaling in the model matrix keeps `edgeOf` the
 * single authority, and a UNIFORM scale leaves normals alone so the normal matrix stays the identity.
 */
const dealGeo = box(1, 1, 1);
const absentGeo = torus(REF_SIZE * 1.25, REF_SIZE * 0.34, 40, 14);
const withheldGeo = sphere(REF_SIZE, 20, 28);

const floorMesh = required('floor', uploadMesh(stage, floorGeo));
const wallMesh = required('wall', uploadMesh(stage, wallGeo));
const postMesh = required('post', uploadMesh(stage, postGeo));
const lintelMesh = required('lintel', uploadMesh(stage, lintelGeo));
const sillMesh = required('sill', uploadMesh(stage, sillGeo));
const dealMesh = required('deal', uploadMesh(stage, dealGeo));
const absentMesh = required('absent', uploadMesh(stage, absentGeo));
const withheldMesh = required('withheld', uploadMesh(stage, withheldGeo));

const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
/* The ring stands UPRIGHT, so its hole faces down the channel and reads as a hole rather than as a
   thin ellipse seen from above. Its normal matrix is therefore NOT the identity, and this is the one
   draw in the scene where that is true — a rotated mesh handed `N3` is lit as though it had never been
   rotated, which is a shading error no capture announces. (E6 hands `N3` to twenty-five yawed record
   slabs; see the README.) For a pure rotation the inverse-transpose IS the rotation. */
const N3_ROT_X90 = new Float32Array([1, 0, 0, 0, 0, 1, 0, -1, 0]);

const modelAt = (x: number, y: number, z: number, s = 1): Float32Array => {
  /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0 and every vertex collapses to
     the origin with a complete framebuffer and no refusal anywhere. It cost E0 a day. */
  const m = IDENTITY();
  m[0] = s; m[5] = s; m[10] = s;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};
const modelRingAt = (x: number, y: number, z: number): Float32Array => {
  const m = IDENTITY();
  m[5] = 0; m[6] = 1; m[9] = -1; m[10] = 0;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

/*
 * 35 DEGREES AND STANDING IN THE CHANNEL'S MOUTH.
 *
 * A wide lens cannot render a channel: at 46° the side walls leave the frame within two metres of the
 * eye, so the architecture arrives as two dark wedges instead of as a space, and the depth it
 * exaggerates shrinks the intake end past reading. E6 measured the same thing and landed on 33°.
 *
 * The elevation is 12.5° rather than level, and that is load-bearing rather than pretty: the movement
 * axis is VERTICAL, so an eye at deck height sees a settled deal and a fresh one at the same screen
 * row and the environment's only claim disappears. `minSeparationPx` below is the number that says
 * whether the chosen elevation actually separates them; it is measured, not assumed.
 *
 * NEAR AND FAR ARE PINNED rather than defaulted, because the AO pass is given the same two numbers to
 * linearise the depth buffer with. `viewProjection` defaults them from the orbit distance, so a
 * hand-written pair in the AO call is a pair that silently disagrees with the projection — the
 * occlusion radius then means a different number of metres than it says. (E6 and E5 both pass
 * near/far to AO that their own camera does not use.)
 */
const NEAR = 0.1, FAR = 44;
const view: Viewpoint = {
  target: [0, 0.85, -6.6], distance: 8.0, azimuthDeg: 19, elevationDeg: 12.5,
  fovDeg: 35, near: NEAR, far: FAR,
};
const eye = eyeOf(view);

interface Placed {
  d: Deal; i: number; stageIndex: number; slot: number;
  x: number; z: number;
  /** Cube edge in metres, or null when the value was never measured or may not be read. */
  edge: number | null;
  /** 0 = updated today, 1 = at or past the stall floor. Null when the date may not be read. */
  settle: number | null;
  settleClamped: boolean;
  baseY: number; centreY: number; topY: number;
  massRefusal: string | null;
  settleRefusal: string | null;
  distance: number;
}

const slotCounter = new Map<StageId, number>();
const placed: Placed[] = DEALS.map((d, i) => {
  const stageIndex = STAGE_ORDER.indexOf(d.stage);
  const slot = slotCounter.get(d.stage) ?? 0;
  slotCounter.set(d.stage, slot + 1);
  const z = gateZ(stageIndex) + SLOT_Z0 + slot * SLOT_DZ;
  const x = slot % 2 === 0 ? -LANE_X : LANE_X;

  const edge = d.valueUsd === null ? null : edgeOf(d.valueUsd);
  const massRefusal = d.known === 'VALUE_ABSENT' ? 'MASS_REFUSED_VALUE_NEVER_MEASURED'
    : d.known === 'WITHHELD' ? 'MASS_REFUSED_VALUE_WITHHELD' : null;

  const settleRaw = d.daysSinceUpdate === null ? null : d.daysSinceUpdate / STALL_DAYS;
  const settle = settleRaw === null ? null : (SETTLE_ON ? Math.min(1, settleRaw) : 0);
  const settleRefusal = d.daysSinceUpdate === null ? 'SETTLE_REFUSED_LAST_TOUCH_WITHHELD' : null;

  /*
   * A DEAL WITH NO READABLE DATE SITS ABOVE THE TOP OF THE AXIS, not at the top of it.
   *
   * The rail means "updated today". Parking an unreadable deal there would assert the freshest
   * possible reading about the one deal nobody is allowed to check, which is the exact inversion of
   * what a withheld state means. 0.30 m clear of the rail puts it OFF the scale, where its height says
   * only that it has no height on this axis.
   */
  const half = edge !== null ? edge / 2 : REF_SIZE;
  const baseY = settle === null ? RAIL_LIFT + 0.30 : (1 - settle) * RAIL_LIFT;
  const centreY = baseY + half;

  return {
    d, i, stageIndex, slot, x, z, edge, settle,
    settleClamped: settleRaw !== null && settleRaw > 1,
    baseY, centreY, topY: baseY + 2 * half,
    massRefusal, settleRefusal,
    distance: Math.hypot(x - eye[0], centreY - eye[1], z - eye[2]),
  };
});

/* Does a deal's slot stay inside its own stage's segment? A deal drawn past its next gate has, by this
   environment's own rule, cleared a gate it has not cleared — a data error the picture presents as a
   fact. Checked rather than trusted, because the slot spacing and the stage length are two constants a
   future edit will change one of. */
const outOfSegment = placed.filter((p) => {
  const half = p.edge !== null ? p.edge / 2 : REF_SIZE;
  const rel = p.z - gateZ(p.stageIndex);
  return rel - half < 0.05 || rel + half > STAGE_LEN - 0.05;
}).map((p) => p.d.name);

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THROUGHPUT: A PARTICLE IS $1,600 OF PACKAGE VALUE.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `particles.ts` states the rule this layer has to earn — A PARTICLE IS A UNIT OF SOMETHING — and the
 * unit here is dollars of package value that have crossed this gate inside the window. Value in stages
 * at or past gate i has, by construction, cleared gate i.
 *
 * TWO DEALS ARE EXCLUDED AND THE REPORT SAYS SO. The withheld deal's value may not be read and the
 * unpriced one's was never measured; folding either into an aggregate would leak a compartment by
 * subtraction or invent a number. So the streams are honestly LIGHT by whatever those two are worth,
 * which is a stated deficiency rather than a silent estimate.
 *
 * VELOCITY IS CONSTANT ACROSS GATES ON PURPOSE. Linear density is rate / speed, so holding speed fixed
 * makes particles-per-metre proportional to dollars-per-day and nothing else. Varying both would give
 * two visual variables mapping to one reading, and neither would be recoverable.
 */
const valueInStagesFrom = (from: number): number => placed
  .filter((p) => p.stageIndex >= from && p.d.known === 'OBSERVED' && p.d.valueUsd !== null)
  .reduce((s, p) => s + (p.d.valueUsd ?? 0), 0);

const gates = STAGE_ORDER.map((label, i) => {
  const z = gateZ(i);
  const clearedUsd = valueInStagesFrom(i);
  const usdPerDay = clearedUsd / WINDOW_DAYS;
  const ratePerSec = usdPerDay / USD_PER_PARTICLE;
  /* Life sets how FAR a stream reaches, not how dense it is. The last gate's reach is cut so its
     particles die before leaving the channel's near lip — a particle outside the channel is a unit of
     value in a place the environment does not model, and the bounds check below would count it. */
  const reach = Math.min(STAGE_LEN, CHANNEL_Z_NEAR - z - 0.2);
  const life = Math.max(0.2, reach / PARTICLE_SPEED);
  return {
    label, index: i, z, clearedUsd, usdPerDay, ratePerSec, life,
    linearDensityPerMetre: ratePerSec / PARTICLE_SPEED,
  };
});

const PARTICLE_COLOUR: Linear = [0.055, 0.16, 0.62];
const sources: readonly ParticleSource[] = gates.map((g) => ({
  at: [0, 0.52, g.z + 0.06] as const,
  rate: g.ratePerSec,
  velocity: [0, 0, PARTICLE_SPEED] as const,
  /* The aperture is the gate, so the stream is as wide as the channel rather than a laser down its
     middle. 0.44 keeps the jitter box clear of the walls; the bounds check confirms it. */
  spread: 0.44,
  colour: PARTICLE_COLOUR,
  life: g.life,
}));

const fieldOut = PARTICLES_ON ? createParticleField(stage, PARTICLE_CAPACITY) : null;
const field = fieldOut !== null && !('kind' in fieldOut) ? fieldOut : null;
/* THE REFUSAL IS HANDLED, NOT ASSUMED AWAY. `EXT_color_buffer_float` is an extension: without it the
   state textures never update and the field renders as a frozen spray that looks like a working system
   on its first frame. The channel still draws; the report and the frame name what is missing. */
const particleRefusal = fieldOut !== null && 'kind' in fieldOut
  ? `${fieldOut.code} — ${fieldOut.reason}`
  : PARTICLES_ON ? null : 'DISABLED_BY_PARAM';

const aliveExpected = Math.round(gates.reduce((s, g) => s + g.ratePerSec * g.life, 0));
const emissionPerSec = gates.reduce((s, g) => s + g.ratePerSec, 0);
/* If a slot is recycled sooner than a particle's life, emission kills particles that should still be
   alive and the density stops tracking the rate — the stream thins for an indexing reason rather than a
   pipeline one. Reported so that failure is a number rather than a subtlety in a screenshot. */
const slotRecycleSeconds = emissionPerSec > 0 ? (field?.slots ?? PARTICLE_CAPACITY) / emissionPerSec : Infinity;
const maxLifeSeconds = Math.max(...gates.map((g) => g.life));
const stepOpts = { sources, dtSeconds: 1 / 60, noiseScale: 0.55, noiseStrength: 0.22, drag: 0.5 };

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DRAW LIST.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const CHANNEL_MAT = { baseColour: hexToLinear('#131D31'), roughness: 0.60, metalness: 0.03 };
const GATE_MAT = { baseColour: hexToLinear('#2C6BFF'), roughness: 0.28, metalness: 0.18 };

/*
 * THE FLOOR IS STRETCHED BY ITS MODEL MATRIX, WHICH `plane` DOES NOT DO FOR YOU.
 *
 * `plane(size, segments)` is SQUARE — E6 calls `plane(6, CORRIDOR_LEN)` and gets a 6×6 floor with 44
 * subdivisions under a 44 m corridor rather than a 6×44 one; its fog and its darkness hide the
 * shortfall. Here the plane is built at the channel's WIDTH and scaled along z instead. That is a
 * non-uniform scale, whose normal matrix would normally need care and does not here because the
 * plane's only normal is +y and scaling z leaves it alone.
 */
const floorModel = modelAt(0, 0, CHANNEL_MID, 1);
floorModel[10] = CHANNEL_LEN / (2 * CHANNEL_HALF);

const draws: LitDraw[] = [
  { mesh: floorMesh, model: floorModel, normalMat: N3,
    material: { baseColour: hexToLinear('#080D17'), roughness: 0.82, metalness: 0 } },
  { mesh: wallMesh, model: modelAt(-(CHANNEL_HALF + 0.09), 0.625, CHANNEL_MID), normalMat: N3, material: CHANNEL_MAT },
  { mesh: wallMesh, model: modelAt(CHANNEL_HALF + 0.09, 0.625, CHANNEL_MID), normalMat: N3, material: CHANNEL_MAT },
];

/*
 * A GATE IS A PORTAL, NOT A PANE — and the first version was a pane.
 *
 * §2 asks for a "luminous membrane across the channel". A thin box spanning the full aperture is
 * exactly that and it is opaque, so five of them in a row make the channel a wall: nothing past the
 * first gate is visible at all, which destroys the depth the environment is built on. Translucency
 * would compound five times over and wash the intake end out.
 *
 * So the membrane is its EDGE: two posts, a lintel, a floor sill as real lit geometry that casts
 * shadow, and an additive outline traced on the same rectangle. The luminous part of "luminous
 * membrane" then comes from the outline and from the particle stream crossing it, and the aperture
 * stays open.
 */
for (const g of gates) {
  draws.push(
    { mesh: postMesh, model: modelAt(-(CHANNEL_HALF + 0.05), GATE_H / 2, g.z), normalMat: N3, material: GATE_MAT },
    { mesh: postMesh, model: modelAt(CHANNEL_HALF + 0.05, GATE_H / 2, g.z), normalMat: N3, material: GATE_MAT },
    { mesh: lintelMesh, model: modelAt(0, GATE_H, g.z), normalMat: N3, material: GATE_MAT },
    { mesh: sillMesh, model: modelAt(0, 0.025, g.z), normalMat: N3, material: GATE_MAT },
  );
}

for (const p of placed) {
  if (p.d.known === 'WITHHELD') {
    draws.push({
      mesh: withheldMesh, model: modelAt(p.x, p.centreY, p.z), normalMat: N3,
      /* Steel, following E6: neither the fresh colour nor the stalled one, because both would assert a
         movement reading about the one deal whose movement may not be read. */
      material: { baseColour: hexToLinear(WITHHELD_HEX), roughness: 0.28, metalness: 0.58 },
    });
  } else if (p.edge === null) {
    draws.push({
      mesh: absentMesh, model: modelRingAt(p.x, p.centreY, p.z), normalMat: N3_ROT_X90,
      material: { baseColour: hexToLinear(ABSENT_HEX), roughness: 0.44, metalness: 0.10 },
    });
  } else {
    /* Colour REPEATS the height, deliberately. A single-channel encoding of the thing this environment
       exists to show fails for anyone reading the frame at a glance or in greyscale, and the redundancy
       costs a channel that has nothing else to carry. */
    const c = mixLinear(hexToLinear(FRESH_HEX), hexToLinear(STALLED_HEX), p.settle ?? 0);
    draws.push({
      mesh: dealMesh, model: modelAt(p.x, p.centreY, p.z, p.edge), normalMat: N3,
      material: { baseColour: c, roughness: 0.34 + 0.16 * (p.settle ?? 0), metalness: 0.06 },
    });
  }
}

/* Down the channel and across it, so a deal's side and its top take light differently and the contact
   shadow of a settled deal lands where a reader can see it. A light along the axis would flatten every
   object against the floor and delete the shadow that reinforces the settling. */
const lightDir: [number, number, number] = [0.42, -0.66, -0.62];
const sceneMin: [number, number, number] = [-2.0, 0, CHANNEL_Z_FAR];
const sceneMax: [number, number, number] = [2.0, 1.9, CHANNEL_Z_NEAR];
const lightVP = lightViewProjection(
  { direction: lightDir, colour: [1, 1, 1], extent: 9.6 },
  boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
);

const tris = triangleCount(floorGeo) + 2 * triangleCount(wallGeo)
  + gates.length * (2 * triangleCount(postGeo) + triangleCount(lintelGeo) + triangleCount(sillGeo))
  + placed.filter((p) => p.d.known === 'OBSERVED').length * triangleCount(dealGeo)
  + placed.filter((p) => p.d.known === 'VALUE_ABSENT').length * triangleCount(absentGeo)
  + placed.filter((p) => p.d.known === 'WITHHELD').length * triangleCount(withheldGeo);

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE PROJECTION DECISIONS, MADE BEFORE THE FIRST FRAME.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Deliberately ahead of `frame()`: the leader strokes are GL and must only be drawn for tags that are
 * actually shown, so the decision has to exist before the first frame does. It is pure projection
 * arithmetic and touches neither the DOM nor a GL call, so there is nothing to gain by deferring it —
 * and a `frame()` that read a `const` declared below it would throw a temporal-dead-zone error on line
 * one, which never sets `document.title` and so reaches the harness as a 30-second timeout instead of
 * as the one-line fault it is.
 */
const vpFinal = viewProjection(view, W / H);
const CSS_W = W / SCALE, CSS_H = H / SCALE;

/* The fog fraction at a distance, from the SAME constants the shader is given, so the report's
   legibility claims and the render's appearance cannot drift. */
const fogAt = (dist: number): number => (FOG_DENSITY <= 0 ? 0 : 1 - Math.exp(-FOG_DENSITY * dist));
const fmtUsd = (v: number): string => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}k`);

/*
 * SCREEN-SPACE OCCLUSION. There is no depth buffer in the compositor, so a tag whose content is
 * covered by a nearer tag must REFUSE to show text — E1's rule. The alternative is text over text,
 * which is unreadable in the specific way that still looks like text and so does not announce itself.
 *
 * The test is SYMMETRIC because one-directional corner containment misses the commonest case: a large
 * near tag covers the MIDDLE of a smaller far one with neither quad's corners inside the other.
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

/** Projected vertical extent of an object, in CSS pixels, by projecting its own top and bottom. */
const projectedHeightPx = (p: Placed): number => {
  const a = projectScreen(vpFinal, [p.x, p.baseY, p.z], CSS_W, CSS_H);
  const b = projectScreen(vpFinal, [p.x, p.topY, p.z], CSS_W, CSS_H);
  return a.behind || b.behind ? 0 : Math.abs(a.sy - b.sy);
};
/** Screen y of an object's centre — what the settling actually has to separate. */
const centreScreenY = (p: Placed): number | null => {
  const s = projectScreen(vpFinal, [p.x, p.centreY, p.z], CSS_W, CSS_H);
  return s.behind ? null : s.sy;
};
/*
 * HOW FAR THIS DEAL HAS VISIBLY FALLEN, in CSS pixels — the same object at its own x and z, at its
 * actual height and at the rail.
 *
 * This is the measure the environment should be judged on, and comparing two DIFFERENT deals is not.
 * A camera that looks down maps depth to screen y as well as height, so a far settled deal and a near
 * fresh one can project to the same row while every world coordinate is correct: the first
 * measurement here returned 13 px for a pair whose heights differ by 0.51 m. Holding x and z fixed
 * removes the depth term entirely, so what is left is the settling and nothing else — and `?settle=0`
 * drives every one of these to zero, which is what makes it a proof rather than a statistic.
 */
const settleDisplacementPx = (p: Placed): number | null => {
  if (p.settle === null) return null;
  const half = p.edge !== null ? p.edge / 2 : REF_SIZE;
  const now = projectScreen(vpFinal, [p.x, p.baseY + half, p.z], CSS_W, CSS_H);
  const rail = projectScreen(vpFinal, [p.x, RAIL_LIFT + half, p.z], CSS_W, CSS_H);
  return now.behind || rail.behind ? null : Math.abs(now.sy - rail.sy);
};

/*
 * FOUR REASONS NOT TO SHOW A TAG, AND THEY ARE DIFFERENT REASONS.
 *
 * · WITHHELD — the deal exists and may not be read. The sphere stays lit, in its stage, off the
 *   movement axis. This is the state a table destroys by either showing a row or omitting it.
 * · BEYOND_LEGIBLE_RANGE — the deal may be read, but at this distance the type would be a smear.
 * · EDGE_ON / BACK_FACING / CORNER_BEHIND_CAMERA — geometry; `projectQuad` refuses on its own.
 * · OCCLUDED — a nearer tag is over it.
 *
 * Collapsing any two would make the report unable to answer the only question an operator has, which
 * is whether they are being denied a name or merely standing too far from it.
 *
 * DECIDED NEAR TO FAR. The already-accepted quads must be the ones IN FRONT of the tag being tested;
 * sorting the other way asks whether a near tag is hidden by a far one, and reports zero occlusions
 * against a picture that visibly has them.
 */
const decided = [...placed].sort((a, b) => a.distance - b.distance).map((p) => {
  const withheld = p.d.known === 'WITHHELD';
  const tooFar = p.distance > LEGIBLE_M;
  const ew = Math.round(TAG_W * PX_PER_METRE), eh = Math.round(TAG_H * PX_PER_METRE);
  /* AIMED AT THE MEASURED EYE, not at a facing reasoned out from the winding convention. E6 derived
     the sign by hand and put nineteen of twenty-five slabs face-first into their own walls;
     `signedArea` caught it and nothing else would have. A tag that aims at the eye cannot be wrong at
     any azimuth, and it is also the most legible orientation there is. */
  const yaw = Math.atan2(eye[0] - p.x, eye[2] - p.z);
  const corners = uprightPanelCorners(p.x, p.z, p.topY + TAG_GAP, TAG_W, TAG_H, yaw, 0);
  const proj = projectQuad(vpFinal, corners, CSS_W, CSS_H, ew, eh);

  const refusal = isQuadRefusal(proj) ? proj.refusal : null;
  /* NEGATIVE SIGNED AREA IS BACK-FACING, and rendering it produces mirror-imaged text rather than an
     error. Cheap to check, invisible when it is wrong. */
  const backFacing = !isQuadRefusal(proj) && proj.signedArea <= 0;
  const widthPx = isQuadRefusal(proj) ? 0 : Math.max(
    Math.hypot(proj.screen[0]!.x - proj.screen[1]!.x, proj.screen[0]!.y - proj.screen[1]!.y),
    Math.hypot(proj.screen[3]!.x - proj.screen[2]!.x, proj.screen[3]!.y - proj.screen[2]!.y),
  );
  /* 26 px, the floor E5 and E6 landed on independently. Below it the element is a smear claiming to be
     a word, and its homography's coefficients are large enough to threaten the page box. */
  const edgeOn = widthPx < 26;
  const coveredCorners = isQuadRefusal(proj) ? 0 : (
    proj.screen.filter((c) => shownQuads.some((q) => inQuad(q, c.x, c.y))).length
    + shownQuads.reduce((n, q) => n + q.filter((c) => inQuad(
      proj.screen.map((v) => ({ x: v.x, y: v.y })), c.x, c.y,
    )).length, 0)
  );
  const occluded = coveredCorners >= 2;
  const shown = !refusal && !backFacing && !withheld && !tooFar && !edgeOn && !occluded;
  if (shown && !isQuadRefusal(proj)) shownQuads.push(proj.screen.map((c) => ({ x: c.x, y: c.y })));
  return { p, proj, shown, ew, eh, refusal, backFacing, withheld, tooFar, edgeOn, occluded, widthPx, coveredCorners };
});

/* A leader is drawn only where a tag survived, so the frame never carries a line pointing at nothing. */
const leaders = decided.filter((d) => d.shown).map((d) => d.p);

const GATE_STROKE = { colour: hexToLinear('#4E8CFF'), gain: 2.4 } as const;
const AXIS_STROKE = { colour: hexToLinear('#7FB2FF'), gain: 1.1 } as const;
const LEADER_STROKE = { colour: hexToLinear('#7FB2FF'), gain: 0.85 } as const;
/* The movement axis, MARKED. Ticks on the inside of the near wall at three known day counts, so the
   vertical scale is an axis rather than an assertion. At the nearest gate's z only: it is the least
   fogged and largest on screen, and three ticks at every gate would be fifteen marks competing with
   the objects they exist to measure. The 12 mm lift keeps the bottom tick off the floor plane, because
   an additive stroke exactly coplanar with a surface shimmers. */
const AXIS_Z = gateZ(gates.length - 1);
const AXIS_TICKS = [0, 20, STALL_DAYS].map((days) => ({
  days,
  y: (1 - Math.min(1, days / STALL_DAYS)) * RAIL_LIFT + 0.012,
  label: days >= STALL_DAYS ? `${days}d+` : `${days}d`,
}));

function frame() {
  const vp = viewProjection(view, W / H);
  /* Stepped FIRST, because `step` binds its own framebuffer and viewport and leaves the default
     framebuffer bound. Between the shadow pass and the lit pass it would silently retarget the
     simulation's output at whatever was current. */
  if (field) field.step(stepOpts);
  lit.shadowPass(lightVP, draws, shadow);
  target.bind();
  /*
   * NO SKY BACKDROP, AND THE CLEAR IS THE FOG COLOUR.
   *
   * The channel is OPEN-TOPPED, so unlike E6's sealed vault an overhead ambient dome is physically
   * what it gets and the sky stays as the irradiance environment. What it must NOT get is the sky
   * DRAWN: an analytic daylight backdrop behind the intake end makes the most fogged part of the frame
   * its brightest, which is the exact inverse of the reading, and it puts a horizon behind a channel
   * standing in a dark hall. Clearing to the fog colour means every distant surface converges on a
   * value the frame already has.
   */
  const fc = hexToLinear(FOG_HEX);
  gl.clearColor(fc[0], fc[1], fc[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  lit.depthPrepass(vp, draws);
  ao.compute({
    depthTexture: target.depthTexture, near: NEAR, far: FAR, fovDeg: view.fovDeg ?? 35,
    aspect: W / H, radius: 0.36, strength: 1.25,
  });
  target.bind();
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [3.1, 3.02, 2.9],
    ambientGain: 0.42, lightVP, shadow, shadowStrength: 0.92, draws,
    ao: ao.texture, screenSize: [W, H],
    fog: FOG_DENSITY > 0
      ? { density: FOG_DENSITY, height: 5.0, floor: 0, colour: hexToLinear(FOG_HEX) }
      : null,
  });

  /*
   * ADDITIVE, DEPTH-TESTED, NOT DEPTH-WRITING — set by hand rather than with `beginAdditive`.
   *
   * `beginAdditive` disables the depth test, which is right for a density field whose quantity is a
   * SUM and wrong for a gate outline: an untested outline draws over the deals in front of it, so
   * every gate would appear nearer than every object that has already cleared it — the one thing this
   * geometry exists to state, inverted. Testing keeps the ordering; not writing keeps two crossing
   * strokes from fighting over which is nearer.
   */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(false);
  for (const g of gates) {
    strokes.ruleAtDepth(vp, -CHANNEL_HALF, 0.02, CHANNEL_HALF, 0.02, g.z, 0.012, GATE_STROKE);
    strokes.ruleAtDepth(vp, -CHANNEL_HALF, GATE_H, CHANNEL_HALF, GATE_H, g.z, 0.010, GATE_STROKE);
    strokes.ruleAtDepth(vp, -CHANNEL_HALF, 0.02, -CHANNEL_HALF, GATE_H, g.z, 0.010, GATE_STROKE);
    strokes.ruleAtDepth(vp, CHANNEL_HALF, 0.02, CHANNEL_HALF, GATE_H, g.z, 0.010, GATE_STROKE);
  }
  for (const t of AXIS_TICKS) {
    strokes.ruleAtDepth(vp, CHANNEL_HALF - 0.30, t.y, CHANNEL_HALF - 0.02, t.y, AXIS_Z, 0.006, AXIS_STROKE);
  }
  for (const p of leaders) {
    strokes.ruleAtDepth(vp, p.x, p.topY, p.x, p.topY + TAG_GAP, p.z, 0.005, LEADER_STROKE);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  if (field) field.draw({ viewProj: vp, sources, pointScale: 22 });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  stage.blit(present, (prog) => gl.uniform1i(gl.getUniformLocation(prog, 'uScene'), 0));
}

/*
 * THE INSTRUMENT. `gl.finish()` returns once the command buffer is FLUSHED, not once the GPU has
 * finished, and it produced two published numbers in this programme that were 140× wrong. A pixel read
 * cannot be satisfied until the frame it reads actually exists, which is what makes the clock mean
 * something. The warm-up frame matters too: the first frame pays shader upload and texture allocation,
 * and over a short batch that alone dominates the result.
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

/* Primed to steady state BEFORE the clock starts, so the measurement is of a full field and the
   capture is of a field whose density is the rate rather than the frame count. */
if (field) for (let i = 0; i < PRIME_STEPS; i++) field.step(stepOpts);
const ms = measure(Math.max(1, FRAMES));

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DOM LAYER.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const wrap = document.createElement('div');
/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to the canvas box or it extends
   the PAGE box, and a surface seen nearly edge-on produces a homography whose coefficients are
   enormous — the element's transformed bounding box then runs to millions of pixels and Playwright's
   fullPage screenshot fails with "Unable to capture screenshot", naming the screenshot rather than the
   transform three layers away that caused it. */
wrap.style.cssText = `position:relative;overflow:hidden;width:${CSS_W}px;height:${CSS_H}px`;
canvas.parentNode?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);

/* PAINTED FAR TO NEAR, so a nearer element covers a further one — the opposite order to the decision
   pass above, and for the opposite reason. Conflating the two is what made the first occlusion test in
   this programme report zero against a picture that had four. */
for (const d of [...decided].sort((a, b) => b.p.distance - a.p.distance)) {
  const { p, proj, shown, ew, eh } = d;
  if (!shown || isQuadRefusal(proj)) continue;
  const haze = fogAt(p.distance);
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:0;top:0;width:${ew}px;height:${eh}px;`
    + `transform-origin:0 0;transform:${proj.transform};display:flex;flex-direction:column;`
    + `justify-content:center;gap:3px;padding:0 5px;overflow:hidden;`
    + `opacity:${(1 - 0.7 * haze).toFixed(3)};-webkit-font-smoothing:antialiased`;
  const value = p.d.valueUsd === null
    ? `<span style="color:${ABSENT_HEX}">VALUE ABSENT</span>`
    : fmtUsd(p.d.valueUsd);
  const days = p.d.daysSinceUpdate === null ? '—' : `${p.d.daysSinceUpdate} d`;
  el.innerHTML =
    `<div style="font:700 11px/1.05 ui-monospace,monospace;color:#fff">${p.d.name}</div>`
    + `<div style="font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)">`
    + `${value} · ${days}</div>`
    + `<div style="font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;`
    + `color:rgba(255,255,255,0.60)">${p.d.stage}</div>`;
  overlay.appendChild(el);
}

/* ── Gate labels: ANNOTATION, so screen space rather than a projected plate ──────────────
   E5's rule, reached there from both sides: content belongs ON a surface, annotation belongs in front
   of it. A gate's throughput is a fact about the gate, not writing on it, so it is a screen-space tag
   above the lintel. Off-frame labels are counted, because an axis missing its outermost mark is worse
   than no axis and the capture looks fine either way. */
const gateLabels = gates.map((g) => {
  const s = projectScreen(vpFinal, [0, GATE_H + 0.30, g.z], CSS_W, CSS_H);
  const haze = fogAt(Math.hypot(eye[0], eye[1] - GATE_H, eye[2] - g.z));
  const onFrame = !s.behind && s.sx > 30 && s.sx < CSS_W - 30 && s.sy > 8 && s.sy < CSS_H - 8;
  if (onFrame) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${s.sx.toFixed(1)}px;top:${s.sy.toFixed(1)}px;`
      + `transform:translate(-50%,-100%);text-align:center;white-space:nowrap;`
      + `opacity:${(1 - 0.72 * haze).toFixed(3)}`;
    el.innerHTML =
      `<div style="font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF">`
      + `${g.label}</div>`
      + `<div style="font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)">`
      + `${fmtUsd(g.usdPerDay)}/d</div>`;
    overlay.appendChild(el);
  }
  return { stage: g.label, sx: Math.round(s.sx), sy: Math.round(s.sy), onFrame };
});

/* ── The movement axis' own labels, against the ticks drawn in GL ─────────────────────── */
const axisLabels = AXIS_TICKS.map((t) => {
  const s = projectScreen(vpFinal, [CHANNEL_HALF + 0.06, t.y, AXIS_Z], CSS_W, CSS_H);
  const onFrame = !s.behind && s.sx > 0 && s.sx < CSS_W && s.sy > 0 && s.sy < CSS_H;
  if (onFrame) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${s.sx.toFixed(1)}px;top:${s.sy.toFixed(1)}px;`
      + `transform:translate(2px,-50%);font:500 9.5px/1 ui-monospace,monospace;`
      + `letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap`;
    el.textContent = t.label;
    overlay.appendChild(el);
  }
  return { label: t.label, onFrame };
});

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE READINGS. Every one of these is a number the capture script asserts on.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
/*
 * DOES THE SETTLING SEPARATE ANYTHING ON SCREEN?
 *
 * The claim this environment rests on is that a stalled deal is visibly lower than a fresh one at the
 * same stage. That is a claim about PIXELS, not about world coordinates: a camera at deck height, or a
 * stage seen nearly along the axis, projects both to the same screen row and the claim silently
 * evaporates while every world-space number stays correct. So it is measured per stage, between the
 * most and least settled readable deal in it, in CSS pixels — and `?settle=0` drives it to zero, which
 * is what makes it a proof rather than a statistic.
 */
const perStageSeparation = STAGE_ORDER.map((label, i) => {
  const inStage = placed.filter((p) => p.stageIndex === i && p.settle !== null && p.edge !== null);
  if (inStage.length < 2) return { stage: label, readable: inStage.length, separationPx: null as number | null };
  const most = inStage.reduce((a, b) => ((b.settle ?? 0) > (a.settle ?? 0) ? b : a));
  const least = inStage.reduce((a, b) => ((b.settle ?? 0) < (a.settle ?? 0) ? b : a));
  const ya = centreScreenY(most), yb = centreScreenY(least);
  return {
    stage: label, readable: inStage.length,
    separationPx: ya === null || yb === null ? null : Math.round(Math.abs(ya - yb)),
  };
});
const measurable = perStageSeparation.map((s) => s.separationPx).filter((v): v is number => v !== null);
const minSeparationPx = measurable.length > 0 ? Math.min(...measurable) : 0;

/*
 * AND DOES A SETTLED DEAL EVER PROJECT HIGHER THAN A FRESHER ONE IN ITS OWN STAGE?
 *
 * The depth confound above does not merely weaken the reading; if the slot pitch is large enough it
 * INVERTS it, and an inverted reading is worse than a missing one. Screen y grows downward, so a more
 * settled deal must have the larger sy. Any pair that fails is counted and named, because "the picture
 * looks right" is exactly the evidence that cannot see this.
 */
const settleInversions: string[] = [];
for (const a of placed) {
  for (const b of placed) {
    if (a.i >= b.i || a.stageIndex !== b.stageIndex) continue;
    if (a.settle === null || b.settle === null) continue;
    const [low, high] = (a.settle > b.settle) ? [a, b] : [b, a];
    const ys = centreScreenY(low), yf = centreScreenY(high);
    if (ys !== null && yf !== null && ys < yf) settleInversions.push(`${low.d.name} above ${high.d.name}`);
  }
}

/*
 * PERSPECTIVE CONFOUNDS THE MASS ENCODING ACROSS DEPTHS, AND HERE IS THE COUNT.
 *
 * Size means value and distance also means size, so a near small deal can project larger than a far
 * big one. Within a stage the depths are nearly equal and the comparison is sound; across stages it is
 * not, and pretending otherwise is exactly the kind of claim this programme keeps being caught making.
 * Measured by projecting each object's own top and bottom rather than by an angular approximation.
 */
const observed = placed.filter((p) => p.edge !== null && p.d.known === 'OBSERVED');
const projectedPx = new Map<number, number>();
for (const p of observed) projectedPx.set(p.i, projectedHeightPx(p));
let massAmbiguousPairs = 0, massAmbiguousWithinStage = 0;
for (const a of observed) {
  for (const b of observed) {
    if (a.i >= b.i) continue;
    const [big, small] = (a.d.valueUsd ?? 0) > (b.d.valueUsd ?? 0) ? [a, b] : [b, a];
    if ((projectedPx.get(big.i) ?? 0) < (projectedPx.get(small.i) ?? 0)) {
      massAmbiguousPairs++;
      if (big.stageIndex === small.stageIndex) massAmbiguousWithinStage++;
    }
  }
}

/* THE HEADLINE. Value that has cleared the diligence gate and then stopped moving — the quantity a
   table gives only after two sorts and some arithmetic, and the one the picture shows as large objects
   lying on the floor in the near half of the channel. */
const STALLED_AT = 0.6;
const totalObservedUsd = observed.reduce((s, p) => s + (p.d.valueUsd ?? 0), 0);
const stalled = observed.filter((p) => (p.settle ?? 0) >= STALLED_AT);
const stalledUsd = stalled.reduce((s, p) => s + (p.d.valueUsd ?? 0), 0);
const deepStalled = stalled.filter((p) => p.stageIndex >= STAGE_ORDER.indexOf('DILIGENCE'));
const deepStalledUsd = deepStalled.reduce((s, p) => s + (p.d.valueUsd ?? 0), 0);

/* The un-confounded proof, over the deals that are supposed to have visibly fallen. */
const stalledDisplacements = stalled
  .map((p) => settleDisplacementPx(p))
  .filter((v): v is number => v !== null);
const minStalledDisplacementPx = stalledDisplacements.length > 0
  ? Math.round(Math.min(...stalledDisplacements)) : 0;
const maxDisplacementPx = Math.round(Math.max(0, ...placed
  .map((p) => settleDisplacementPx(p)).filter((v): v is number => v !== null)));

const counts = {
  OBSERVED: placed.filter((p) => p.d.known === 'OBSERVED').length,
  VALUE_ABSENT: placed.filter((p) => p.d.known === 'VALUE_ABSENT').length,
  WITHHELD: placed.filter((p) => p.d.known === 'WITHHELD').length,
};

const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px';
hud.innerHTML =
  `<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">`
  + `PIPELINE · SIZE IS VALUE, HEIGHT IS MOVEMENT</div>`
  + `<div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)">`
  + `<b style="color:#FF9B76">${fmtUsd(deepStalledUsd)}</b> PAST DILIGENCE AND SETTLED`
  + ` &nbsp;·&nbsp; ${Math.round(100 * deepStalledUsd / Math.max(1, totalObservedUsd))}% OF THE READABLE BOOK<br>`
  + `${STALL_DAYS} d = ON THE FLOOR &nbsp;·&nbsp; 1 PARTICLE = ${fmtUsd(USD_PER_PARTICLE)}/d CLEARED<br>`
  + `${SETTLE_ON ? 'MOVEMENT AXIS ON' : 'MOVEMENT AXIS OFF — every deal pinned to the rail'}`
  + ` &nbsp;·&nbsp; ${particleRefusal === null ? 'THROUGHPUT ON' : `THROUGHPUT OFF — ${particleRefusal.split(' — ')[0]}`}`
  + `</div>`
  + `<div style="font:500 10px/1.4 ui-monospace,monospace;color:${ABSENT_HEX}">SYNTHETIC DEALS</div>`;
overlay.appendChild(hud);

const legend = document.createElement('div');
legend.style.cssText = 'position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;'
  + 'gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace';
legend.innerHTML = ([
  [FRESH_HEX, 'UPDATED · rides the rail'],
  [STALLED_HEX, `SETTLED · ${stalled.length} of ${counts.OBSERVED} on the floor`],
  [ABSENT_HEX, `VALUE ABSENT · ${counts.VALUE_ABSENT} (ring: no mass to give)`],
  [WITHHELD_HEX, `WITHHELD · ${counts.WITHHELD} (off the movement axis)`],
] as const).map(([c, t]) => (
  `<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)">`
  + `<span>${t}</span><span style="width:11px;height:11px;background:${c};display:inline-block"></span></div>`
)).join('');
overlay.appendChild(legend);

/* ── The particle field, READ BACK rather than admired ────────────────────────────────── */
const particleState = field ? field.readState() : null;
let aliveActual = 0, outOfChannel = 0;
let pMinZ = Infinity, pMaxZ = -Infinity;
if (particleState && field) {
  for (let s = 0; s < field.slots; s++) {
    const x = particleState[s * 4]!, y = particleState[s * 4 + 1]!, z = particleState[s * 4 + 2]!;
    const age = particleState[s * 4 + 3]!;
    if (age < 0) continue;
    aliveActual++;
    if (z < pMinZ) pMinZ = z;
    if (z > pMaxZ) pMaxZ = z;
    if (Math.abs(x) > CHANNEL_HALF || y < -0.15 || y > GATE_H + 0.25
      || z < CHANNEL_Z_FAR || z > CHANNEL_Z_NEAR) outOfChannel++;
  }
}

/* Read ONCE, before the report, because two call sites for the same string is two chances for the
   refusal below to key off something different from what is printed. */
const RENDERER = (() => {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
})();
/* Matched on the driver's own words. A hardware machine wrongly called software loses a number;
   software wrongly called hardware publishes a fictional budget. */
const SOFTWARE = /swiftshader|llvmpipe|software/i.test(RENDERER);

const perDeal = decided.map((d) => ({
  name: d.p.d.name, stage: d.p.d.stage, known: d.p.d.known,
  valueUsd: d.p.d.valueUsd, days: d.p.d.daysSinceUpdate,
  edgeM: d.p.edge === null ? null : Number(d.p.edge.toFixed(3)),
  settle: d.p.settle === null ? null : Number(d.p.settle.toFixed(3)),
  settleClamped: d.p.settleClamped,
  baseY: Number(d.p.baseY.toFixed(3)),
  distance: Number(d.p.distance.toFixed(2)),
  screenHeightPx: Math.round(projectedHeightPx(d.p)),
  fallenPx: (() => { const v = settleDisplacementPx(d.p); return v === null ? null : Math.round(v); })(),
  fog: Number(fogAt(d.p.distance).toFixed(3)),
  tagWidthPx: Math.round(d.widthPx),
  tagShown: d.shown,
  massRefusal: d.p.massRefusal,
  settleRefusal: d.p.settleRefusal,
  /* NAMED, NOT COUNTED. Four reasons, four names, never summed. */
  hiddenBecause: d.shown ? null : d.withheld ? 'WITHHELD' : d.refusal ? d.refusal
    : d.backFacing ? 'BACK_FACING' : d.edgeOn ? 'EDGE_ON'
      : d.tooFar ? 'BEYOND_LEGIBLE_RANGE' : 'OCCLUDED',
}));

const report = {
  settleAxis: SETTLE_ON,
  particlesRequested: PARTICLES_ON,
  fog: FOG_ON,
  fogDensity: Number(FOG_DENSITY.toFixed(4)),
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),

  deals: placed.length,
  counts,
  /* Two of twelve carry no readable value, so every aggregate here is short by whatever they are
     worth. Stated rather than estimated. */
  aggregateExcludes: {
    valueAbsent: counts.VALUE_ABSENT,
    withheld: counts.WITHHELD,
    code: 'AGGREGATE_EXCLUDES_UNREADABLE_VALUE',
  },
  totalObservedUsd,

  /* ── THE HEADLINE READING ── */
  stallDays: STALL_DAYS,
  stalledFrom: STALLED_AT,
  stalledCount: stalled.length,
  stalledUsd,
  stalledShare: Number((stalledUsd / Math.max(1, totalObservedUsd)).toFixed(3)),
  deepStalledUsd,
  deepStalledShare: Number((deepStalledUsd / Math.max(1, totalObservedUsd)).toFixed(3)),
  settleClamped: placed.filter((p) => p.settleClamped).length,

  /* ── DOES THE PICTURE ACTUALLY SHOW IT ──
     `minStalledDisplacementPx` is the primary: the smallest visible fall among the deals that are
     supposed to have fallen, with no depth term in it. `minSeparationPx` is the reading a viewer
     actually performs — one deal against another in the same stage — and it is DEPTH-CONFOUNDED, which
     is why both are here and why the smaller of the two is the honest one to quote. */
  minStalledDisplacementPx,
  maxDisplacementPx,
  minSeparationPx,
  settleInversions,
  railLiftM: RAIL_LIFT,

  /* ── THE MASS AXIS, AND WHAT IT CANNOT DO ── */
  edgeMaxM: EDGE_MAX,
  edgeMinM: Number(Math.min(...observed.map((p) => p.edge ?? 0)).toFixed(3)),
  referenceSizeM: REF_SIZE,
  massAmbiguousPairs,
  massAmbiguousWithinStage,
  outOfSegment,

  /* ── THROUGHPUT ── */
  windowDays: WINDOW_DAYS,
  usdPerParticle: USD_PER_PARTICLE,
  particleSpeed: PARTICLE_SPEED,
  /* Attrition down the funnel is the reading the stream density carries, so it is asserted rather than
     left to the eye: if this is ever false the density is describing something else. */
  rateMonotoneDown: gates.every((g, i) => i === 0 || g.ratePerSec <= gates[i - 1]!.ratePerSec + 1e-9),
  rateRatioFirstLast: Number((gates[0]!.ratePerSec / Math.max(1e-9, gates[gates.length - 1]!.ratePerSec)).toFixed(2)),
  particleField: {
    refusal: particleRefusal,
    capacity: PARTICLE_CAPACITY,
    slots: field?.slots ?? 0,
    aliveExpected,
    aliveActual,
    outOfChannel,
    zRange: aliveActual > 0 ? [Number(pMinZ.toFixed(2)), Number(pMaxZ.toFixed(2))] : null,
    channelZ: [CHANNEL_Z_FAR, CHANNEL_Z_NEAR],
    slotRecycleSeconds: Number(slotRecycleSeconds.toFixed(2)),
    maxLifeSeconds: Number(maxLifeSeconds.toFixed(2)),
    /* Emission is a rolling cursor over the slots. If a slot comes round again before a particle's
       life is up, the field kills particles for an indexing reason and the density stops tracking the
       rate. One boolean; the alternative is a stream that thins for no stated reason. */
    recycleSafe: slotRecycleSeconds > maxLifeSeconds,
    primeSteps: PRIME_STEPS,
  },

  /* ── LABELS ── */
  tagsShown: decided.filter((d) => d.shown).length,
  /* Grouped by REASON, because "4 hidden" is useless and "1 withheld, 1 too far, 2 occluded" is
     actionable — an operator does something different about each. */
  hiddenBy: perDeal.filter((d) => !d.tagShown).reduce<{ [k: string]: number }>((acc, d) => {
    const k = d.hiddenBecause ?? 'UNKNOWN';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {}),
  /* A name that will not fit its own tag. Zero today; the check exists because the next name added
     will be longer, and `overflow:hidden` serving a truncated counterparty is worse than no tag. */
  nameOverflow: placed.filter((p) => p.d.known !== 'WITHHELD'
    && p.d.name.length * 6.6 > TAG_W * PX_PER_METRE - 10).map((p) => p.d.name),
  gateLabelsOffFrame: gateLabels.filter((g) => !g.onFrame).map((g) => g.stage),
  axisLabelsOffFrame: axisLabels.filter((a) => !a.onFrame).length,
  fogNearest: Math.min(...perDeal.map((d) => d.fog)),
  fogFurthest: Math.max(...perDeal.map((d) => d.fog)),

  glError: gl.getError(),
  triangles: tris,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  frames: FRAMES,
  msPerFrame: Number(ms.toFixed(3)),
  fps: Math.round(1000 / ms),
  /*
   * HEADROOM REFUSES ON A SOFTWARE RASTERISER. SwiftShader is a CPU rasteriser; comparing its frame
   * time to a 60 Hz budget measures a machine nobody ships on, and the ratio to real hardware is not a
   * constant — E0 measured 1.305 ms on an M1 for a scene SwiftShader takes tens of milliseconds over.
   * So the comparison is REFUSED with a code rather than computed. The frame time itself stays, because
   * it IS a real measurement — of SwiftShader.
   */
  renderer: RENDERER,
  rendererClass: SOFTWARE ? 'software' : 'hardware',
  headroom: SOFTWARE ? null : Number((16.6 - ms).toFixed(3)),
  headroomRefusal: SOFTWARE ? 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET' : null,
  /* Real-hardware timing for this environment is UNMEASURED. E0's and E8's M1 figures came from manual
     browser sessions on real hardware; this harness has only ever run under SwiftShader. */
  hardwareMsPerFrame: null,

  gates: gates.map((g) => ({
    stage: g.label, z: g.z,
    clearedUsd: g.clearedUsd,
    usdPerDay: Math.round(g.usdPerDay),
    ratePerSec: Number(g.ratePerSec.toFixed(2)),
    perMetre: Number(g.linearDensityPerMetre.toFixed(2)),
    lifeSeconds: Number(g.life.toFixed(2)),
  })),
  perStageSeparation,
  perDeal,
};
(globalThis as unknown as { E3: typeof report }).E3 = report;

/*
 * THE PRINTED REPORT IS SUMMARISED; THE FULL ONE STAYS ON `globalThis`.
 *
 * `fullPage: true` screenshots the log along with the frame, and a pretty-printed per-item report
 * pushes the page past Chrome's capture height until `Page.captureScreenshot` fails outright — naming
 * the screenshot rather than the report that grew. The capture script reads `globalThis.E3`.
 */
const { perDeal: rows, gates: gateRows, perStageSeparation: seps, ...summary } = report;
log.textContent = JSON.stringify(summary, null, 2)
  + `\n\ngates (${gateRows.length}):\n`
  + gateRows.map((g) => (
    `  ${g.stage.padEnd(10)} $${String(g.usdPerDay).padStart(7)}/d`
    + ` ${String(g.ratePerSec).padStart(7)} p/s ${String(g.perMetre).padStart(7)} p/m`
    + ` life ${g.lifeSeconds}s`
  )).join('\n')
  + `\n\nsettle separation on screen:\n`
  + seps.map((s) => (
    `  ${s.stage.padEnd(10)} ${s.separationPx === null ? 'n/a (needs 2 readable)' : `${s.separationPx} px`}`
  )).join('\n')
  + `\n\nperDeal (${rows.length}, full detail on globalThis.E3):\n`
  + rows.map((r) => (
    `  ${r.name.padEnd(16)} ${r.stage.padEnd(10)}`
    + ` ${(r.valueUsd === null ? 'ABSENT' : fmtUsd(r.valueUsd)).padStart(7)}`
    + ` ${(r.days === null ? '—' : `${r.days}d`).padStart(4)}`
    + ` base ${r.baseY.toFixed(2)} fallen ${String(r.fallenPx ?? '—').padStart(3)}px`
    + ` ${String(r.distance).padStart(5)}m ${String(r.screenHeightPx).padStart(3)}px`
    + ` ${r.tagShown ? 'TAG' : `no tag: ${r.hiddenBecause}`}`
  )).join('\n');

frame();
document.title = 'READY';
