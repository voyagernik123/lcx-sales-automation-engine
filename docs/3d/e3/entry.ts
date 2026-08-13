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
  hexToLinear, mixLinear, assertBrandFidelity, projectScreen,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal, type ParticleSource, type Linear,
  QUALITY_TIERS, qualitySettings, shadowMapSizeFor, type QualityTier,
} from '@lcx/gl';
import { installFlatFallback } from '../_shared/flatFallback.js';

const params = new URLSearchParams(location.search);
/*
 * THE CONTROL THAT MATTERS HERE. `?settle=0` pins every deal to the rail, which is exactly what the
 * bar list does: value and stage, and movement demoted to a number in a column. The separation
 * measured below goes to zero in that variant, so the claim that the third axis carries something is
 * a number the capture script asserts across two runs rather than a sentence in this comment.
 */
const SETTLE_ON = params.get('settle') !== '0';
const PARTICLES_ON = params.get('particles') !== '0';
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
const FOG_ON = params.get('fog') !== '0';
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
 * `msPerFrame` came out NaN and serialised to null — indistinguishable from this file's own refusal
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
  log.textContent = m;
  /* THE REFUSAL GOES ABOVE THE TABLE, NOT INSTEAD OF IT. A reader who cannot be shown the channel is
     still entitled to every row of it, and to be told which of the two is missing. */
  const [code, ...rest] = m.split(':');
  fallbackRef?.showRefusal(code?.trim() ?? 'REFUSED', rest.join(':').trim() || m);
  throw new Error(m);
}
/* Assigned once `installFlatFallback` has run. `die` is declared FIRST because a `function` declaration
   returning `never` is what gives the compiler its control-flow narrowing — a const arrow does not. */
let fallbackRef: ReturnType<typeof installFlatFallback> | null = null;
function required<T extends object>(what: string, v: T | StageRefusal): T {
  if ('kind' in v) die(`${what}: ${v.code} — ${v.reason} ${v.detail ?? ''}`);
  return v;
}

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
 * ABSENCE WAS DEFENDED EVERYWHERE AND VALIDITY NOWHERE, and the frame published the difference.
 *
 * `valueUsd: number | null` is documented above as "`null` = never measured. Never 0, never inferred",
 * and the null case is checked in five places — `massRefusal`, `settleRefusal`, `edge === null`, the
 * fallback's absent cells, every aggregate. Nothing anywhere asked whether a PRESENT number was a
 * number. Fed `Number.NaN`, `Number.POSITIVE_INFINITY` and `-500_000` as OBSERVED values, this harness
 * reached `document.title = 'READY'` with `glError: 0`, `brandFidelity: []`, nothing in `hiddenBy`, and
 * printed onto the frame: `NEGATIVE VALUE $-500.0k`, `DILIGENCE $InfinityM/d`, `QUALIFIED $NaNk/d`, and
 * `NaN% OF THE READABLE BOOK`. A negative value also produces a negative cube root at `edgeOf`, so the
 * box edge goes negative silently.
 *
 * E5 does not have this hole because it hands its input to the shipping flat engine and refuses whatever
 * that refuses (`GEOMETRY_Z_NOT_FINITE`). E3 owns its geometry, so it owns the check: one pass over the
 * dataset, before `placed` exists, refusing any present field that is not a finite non-negative number —
 * and any `known` state that disagrees with which fields are present, because the two axes read those
 * independently and a disagreement makes one of them lie.
 *
 * It is COLLECTED here and refused below, after the flat fallback is installed: a bad dataset is exactly
 * the case where the reader is still entitled to the table and to be told what is wrong with it.
 */
const dataFaults: string[] = DEALS.flatMap((d) => {
  const out: string[] = [];
  const check = (field: string, v: number | null): void => {
    if (v === null) return;  // absence is a state this file renders; it is not a fault
    if (!Number.isFinite(v)) out.push(`${d.name}: ${field} is ${v}`);
    else if (v < 0) out.push(`${d.name}: ${field} is negative (${v})`);
  };
  check('valueUsd', d.valueUsd);
  check('daysSinceUpdate', d.daysSinceUpdate);
  if (d.known === 'OBSERVED' && (d.valueUsd === null || d.daysSinceUpdate === null)) {
    out.push(`${d.name}: state is OBSERVED but a field is absent`);
  }
  if (d.known === 'WITHHELD' && (d.valueUsd !== null || d.daysSinceUpdate !== null)) {
    out.push(`${d.name}: state is WITHHELD but a field carries a value`);
  }
  if (d.known === 'VALUE_ABSENT' && d.valueUsd !== null) {
    out.push(`${d.name}: state is VALUE_ABSENT but a value is present`);
  }
  return out;
});

/* 45 DAYS IS THE FLOOR OF THE MOVEMENT AXIS, and it is a policy number rather than a taste one: the
   point past which a deal is treated as dead rather than slow. Beyond it the axis CLAMPS instead of
   extending, so a 63-day deal and a 90-day deal both rest on the floor — the axis does not pretend to
   resolve a difference nobody acts on. `settleClamped` counts how many are on the clamp. */
const STALL_DAYS = 45;

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * §6 RULE 1 — THE FLAT FALLBACK, INSTALLED BEFORE ANY GL EXISTS.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Not in a catch block, and not after the stage: a shader that fails to compile fails during module
 * evaluation, so anything built afterwards never runs on the failure it exists for. Print and the
 * accessibility tree are not errors at all, and a canvas is opaque to both whether or not it drew.
 *
 * THE TABLE IS THE THING E3 REPLACES, WHICH MAKES THIS AN UNUSUALLY HONEST FALLBACK: `BdPipeline` is a
 * lead table, so the flat view here is not a consolation with fewer fields — it is the incumbent, with
 * every field the environment uses. What it cannot carry is the joint reading: value, stage and movement
 * are three columns you can sort one at a time, and the figure an operator wants is the product of all
 * three. Naming that in `readsAs` is the point; a fallback that pretends to lose nothing is worse than
 * one that says what it costs.
 *
 * ABSENT AND WITHHELD BOTH CARRY `null` HERE, which the fallback renders as a named "absent" rather than
 * a blank or a zero, and the STATE column keeps them apart. A flat view that collapsed them would break
 * rule 6 inside the very thing meant to satisfy rule 1.
 */
const fallback = installFlatFallback({
  title: 'E3 · The Pipeline — deals by stage, package value and days since update',
  readsAs: 'In the rendered view a deal is an object: its size is package value, its position along the '
    + 'channel is the gates it has cleared, and its HEIGHT is movement — a deal untouched for '
    + `${STALL_DAYS} days rests on the floor of the channel. That is what this table cannot do. Every `
    + 'figure below is here, and sorting by any one column hides the other two, which is why the '
    + 'quantity that matters — value that has cleared diligence and then stopped — takes two sorts and '
    + 'arithmetic here and one look there.',
  notices: [
    `SYNTHETIC DEALS — ${DEALS.length} hand-authored records. The shape is deliberate (a funnel, value `
    + 'skewed to two names, the two largest late-stage deals stalled); the values are not measurements.',
    'One deal was never priced and one is in a compartment that may not be read. Both are ABSENT below '
    + 'rather than blank or zero, the STATE column separates them, and every aggregate in the rendered '
    + 'view excludes both rather than estimating them.',
  ],
  columns: [
    { key: 'name', label: 'Deal' },
    { key: 'stage', label: 'Stage' },
    { key: 'state', label: 'State' },
    { key: 'value', label: 'Package value (USD)', numeric: true },
    { key: 'days', label: 'Days since update', numeric: true },
    { key: 'movement', label: 'Movement' },
  ],
  rows: DEALS.map((d) => ({
    name: d.known === 'WITHHELD' ? 'withheld' : d.name,
    stage: d.stage,
    state: d.known,
    value: d.valueUsd,
    days: d.daysSinceUpdate,
    /* The one derived column, and it REFUSES rather than guessing: a deal whose last touch may not be
       read has no position on the movement scale, which is exactly what the rendered view says by
       floating it off the top of the axis. */
    movement: d.daysSinceUpdate === null ? null
      : d.daysSinceUpdate >= STALL_DAYS ? 'stalled — on the floor'
        : d.daysSinceUpdate >= 0.6 * STALL_DAYS ? 'stalled'
          : 'moving',
  })),
});
fallbackRef = fallback;

/* Refused HERE rather than where they are detected, because the fallback has to exist first — a reader
   handed a broken dataset or a mistyped URL is still entitled to every row of the table and to be told
   which of the two went wrong. See `dataFaults` and `numParam` for what each one caught. */
if (dataFaults.length > 0) {
  die(`INVALID_DEAL_DATA: ${dataFaults.join('; ')} — a value that is present must be a finite `
    + 'non-negative number, and the state column must agree with which fields are present. The channel '
    + 'was not drawn rather than drawn from a value that cannot be a package value.');
}
if (badParams.length > 0) {
  die(`BAD_PARAM: ${badParams.join(', ')} — not a number, so the channel was refused rather than drawn `
    + 'from a nonsensical value. Every deal below is unaffected; correct the URL and reload.');
}

/*
 * A FORCED REFUSAL, SO THE FALLBACK CAN BE CAPTURED. Rule 8 is "every claim gets a capture", and rule
 * 1's claim — that a refusal resolves to the flat surface without losing information — cannot be
 * photographed any other way, because a page cannot switch off its own WebGL.
 *
 * `?refuse=1` is not a mock: it calls the same `die` a failed shader compile calls.
 */
if (params.get('refuse') === '1') {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The channel is not being drawn.');
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
/* The gate outlines, the movement axis and the tag leaders are additive strokes, not meshes.
   `ruleAtDepth` is exact for a segment lying in a constant-depth plane and the primitive says so in
   its own signature — every stroke here is a gate frame, an axis tick or a vertical leader at one z,
   so every one of them qualifies. The wake a moving object wants runs ALONG the channel and therefore
   slants through depth, which this primitive explicitly refuses to fake. It is not drawn. */
const strokes = required('strokes', createLineBatch(stage));


/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CALIBRATION. Every number is fixed by a reading requirement, and the report re-checks them.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
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
/*
 * 2.2 m PER STAGE, DOWN FROM 2.8, and the reason is a collision between two calibrated numbers.
 *
 * The eye has to stand about 3 m back from the SIGNED deal for it to be inside the frame at all, and
 * `LEGIBLE_M` says a tag stops being a word past 13.5 m. Five stages at 2.8 m put the intake deals
 * 15.4 m out, so the first camera that framed the near end correctly silently dropped the label off
 * every deal in SOURCED — four of twelve — and the capture looked composed. The channel is now short
 * enough that both ends fit inside one lens and one legibility limit.
 */
const STAGE_LEN = 2.2;
const Z_GATE0 = -10.6;
const CHANNEL_Z_FAR = Z_GATE0 - 2.6;
/*
 * THE CHANNEL RUNS PAST THE EYE, at 1.7 rather than 0.4.
 *
 * Ending it at 0.4 stopped the floor 2.4 m short of the camera, so the bottom quarter of the frame was
 * empty clear colour and the viewer was standing outside a channel looking in. Running the geometry
 * behind the eye plane costs nothing — those faces are culled — and it is the difference between
 * looking at the pipeline and standing in it.
 */
const CHANNEL_Z_NEAR = 1.7;
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
const SLOT_Z0 = 0.58, SLOT_DZ = 0.38, LANE_X = 0.60;

const TAG_W = 0.66, TAG_H = 0.30, TAG_GAP = 0.16;
/*
 * TAGS IN ONE STAGE STAGGER IN HEIGHT, because adjacent slots are 0.38 m apart and a tag is 0.66 m
 * wide — so two neighbours' tags overlap by construction and the occlusion test then correctly refuses
 * one of them. Four of twelve tags were being dropped that way, which is a real loss caused by the
 * layout rather than by the camera. Alternate slots ride a tag-height higher: the leader gets longer,
 * which is what a leader is for.
 */
const tagGapOf = (slot: number): number => (slot % 2 === 0 ? TAG_GAP : TAG_GAP + TAG_H + 0.06);
/*
 * AND THE TAG SITS OUTBOARD OF ITS DEAL, toward the nearer wall, by 0.45 m.
 *
 * Height stagger alone was not enough — it separated slots 0 and 1 and then put slot 1's tag into the
 * band belonging to the stage in front, so the occlusion refusals went UP rather than down. Offsetting
 * each tag toward its own side of the channel gives the two lanes disjoint horizontal bands: a tag at
 * x = -1.05 spans -1.38 to -0.72 and one at +1.05 spans +0.72 to +1.38, so lane-to-lane collision at a
 * shared depth becomes impossible rather than unlikely.
 *
 * The leader is then a diagonal from the object's top corner to the tag's bottom edge — still inside one
 * constant-z plane, which is exactly the case `ruleAtDepth` is specified for and the reason it can draw
 * it exactly rather than approximately.
 */
const TAG_DX = 0.45;
const PX_PER_METRE = 190;
/*
 * 13.5 m, DERIVED FROM THE TYPE rather than chosen. A tag is 0.30 m tall and its element is 57 px, so
 * at distance d the CSS scale is (0.30 * (H/2) / (d * tan(fov/2))) / 57 ≈ 6.0/d. The smallest type in
 * a tag is 9 px, which lands at 4 px on screen at d = 13.5 — the floor at which a word is still a
 * word. Past that the DOM is not withheld out of caution; it would be a grey smear claiming to be a
 * counterparty's name, which is worse than an unlabelled object.
 */
const LEGIBLE_M = 13.5;
/*
 * THE FOG REACHES HALF AT EXACTLY THE DISTANCE THE LABELS STOP, which is the second calibration and
 * the only one with an anchor worth having.
 *
 * The first solved 1 - exp(-density * 15.5) = 0.90 — fog 90% converged at the intake wall — on the
 * reasoning that the far end should fade rather than stop at a hard edge. It does, and it took the
 * architecture with it: at that density the NEAREST deal was already 50% fogged and the floor and walls,
 * whose albedo is close to the fog colour to begin with, converged to indistinguishable black across the
 * whole frame. The capture was five luminous gates and six cubes floating in a void, with no channel.
 * Fog that erases the space it is supposed to give depth to is not atmosphere, it is an exposure bug.
 *
 * `ln(2) / LEGIBLE_M` puts the half-way point of the haze at the distance where a tag stops being a
 * word, so the visual limit and the reading limit are ONE distance rather than two — and the report
 * prints the fog at the nearest and furthest deal so "the fog is doing nothing" stays a number.
 */
const FOG_DENSITY = FOG_ON ? Math.log(2) / LEGIBLE_M : 0;
const FOG_HEX = '#0C1322';

/* Value cleared per day, and the window it is measured over. A rate needs a window and a window needs
   stating: quoting "$/day" off twelve open deals with no period is a number with no units. */
const WINDOW_DAYS = 90;
/* ONE PARTICLE IS $1,600 OF PACKAGE VALUE CROSSING THIS GATE, and one second of simulation is one day
   of pipeline. Both halves are needed for `rate` (particles per SECOND) to mean anything — a rate
   derived from a dollar figure with no time compression is a number that happens to look busy. */
const USD_PER_PARTICLE = 800;
const PARTICLE_SPEED = 1.4;
const PARTICLE_CAPACITY = 2048;
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
 * 35 DEGREES, AND THREE THINGS THE FIRST FRAMING GOT WRONG.
 *
 * A wide lens cannot render a channel: at 46° the side walls leave the frame within two metres of the
 * eye, so the architecture arrives as two dark wedges instead of as a space, and the depth it
 * exaggerates shrinks the intake end past reading. E6 measured the same thing and landed on 33°.
 *
 * 1 · AZIMUTH 19° PUT THE EYE OUTSIDE THE CHANNEL. `sin 19° x cos 12.5° x 8.0` is 2.54 m from the
 *     centre line and the wall stands at 1.54 m, so the whole frame was shot over the right wall from
 *     the outside — and the SIGNED deal, the largest object in the scene, sat 58° off the view axis,
 *     completely off frame. `projectQuad` accepted its tag: every corner was in front of the camera
 *     and front-facing, which is all that function claims to check. Nothing counted it, because
 *     nothing was counting FRAMED. `objectsOffFrame` now does, and it is fatal in the capture.
 *
 * 2 · THE ELEVATION IS BOUNDED FROM BOTH SIDES, and it took three values to find that out. The horizon
 *     sits at tan(elevation)/tan(fov/2) in NDC, which is arithmetic rather than taste: at 10° that is
 *     0.56, so a quarter of the frame is empty space above a channel that has no sky and no ceiling to
 *     put there. Tilting down fills the frame — and every degree of tilt also maps DEPTH more strongly
 *     into screen y, which is precisely the confound that cancels the settling when two deals in one
 *     stage sit at different slots. So the ceiling on the elevation is not aesthetic: it is
 *     `minSeparationPx`, and 14° is where that measurement still passes.
 *
 * 3 · NEAR AND FAR ARE PINNED rather than defaulted, because the AO pass is given the same two numbers
 *     to linearise the depth buffer with. `viewProjection` defaults them from the orbit distance, so a
 *     hand-written pair in the AO call is a pair that silently disagrees with the projection and the
 *     occlusion radius then means a different number of metres than it says. (E5 and E6 both pass
 *     near/far to AO that their own cameras do not use.)
 *
 * The elevation is not zero, and that is load-bearing rather than pretty: some downward tilt is what
 * makes a settled deal read as ON the floor rather than merely low against it.
 */
const NEAR = 0.1, FAR = 40;
const view: Viewpoint = {
  target: [0, 0.70, -5.2], distance: 8.2, azimuthDeg: 9, elevationDeg: 14,
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

const PARTICLE_COLOUR: Linear = [0.10, 0.30, 1.15];
const sources: readonly ParticleSource[] = gates.map((g) => ({
  at: [0, 0.34, g.z + 0.06] as const,
  rate: g.ratePerSec,
  velocity: [0, 0, PARTICLE_SPEED] as const,
  /* The aperture is a slot in the gate, not the whole gate. At 0.44 with the flow field turned up the
     five streams diffused into one even haze over the channel and the density difference the gates
     exist to show — 2.7x between the first gate and the last — stopped being visible at all. Narrow
     enough to stay a stream; the bounds check confirms it stays inside the walls. */
  spread: 0.26,
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
const stepOpts = { sources, dtSeconds: 1 / 60, noiseScale: 0.55, noiseStrength: 0.12, drag: 0.5 };

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DRAW LIST.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const CHANNEL_MAT = { baseColour: hexToLinear('#1E2A42'), roughness: 0.60, metalness: 0.03 };
/*
 * SLATE, NOT BRAND BLUE — twice corrected, and the second correction is the interesting one.
 *
 * At full #2C6BFF the gate frames were the brightest objects in the frame by a wide margin: five
 * saturated bars that read as the subject with the deals as decoration between them. The gate is the
 * RULER and the deals are the reading, so the rails came down to a dark blue. That was still wrong,
 * because a dark blue rail and a brand-blue cube are the same hue and a glance cannot tell the
 * structure from the data. Brand blue is now reserved for a DEAL, and the architecture is neutral
 * slate. The additive outline supplies the luminosity §2 asks for, and it reads better over a dark
 * rail than over a bright one.
 */
const GATE_MAT = { baseColour: hexToLinear('#31415C'), roughness: 0.36, metalness: 0.20 };

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
    material: { baseColour: hexToLinear('#22304A'), roughness: 0.82, metalness: 0 } },
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
 * So the membrane is its EDGE: two posts and a floor sill as real lit geometry that casts shadow, plus
 * an additive outline traced on the full rectangle. The luminous part of "luminous membrane" then comes
 * from the outline and from the particle stream crossing it, and the aperture stays open.
 *
 * THE SOLID LINTEL IS GONE TOO, for the same reason one step further in. A 10 cm bar across the top of
 * the aperture blocks nothing at the gate's own depth — and five of them, seen from a camera tilted 14°
 * down, lay as five dark bands across the deals BEHIND them, because a lintel 2 m nearer than a deal
 * projects lower than its own height. The capture read as scaffolding with cubes between the beams. The
 * top edge is now only the additive stroke, which is 2 cm of luminous line and occludes nothing.
 */
for (const g of gates) {
  draws.push(
    { mesh: postMesh, model: modelAt(-(CHANNEL_HALF + 0.05), GATE_H / 2, g.z), normalMat: N3, material: GATE_MAT },
    { mesh: postMesh, model: modelAt(CHANNEL_HALF + 0.05, GATE_H / 2, g.z), normalMat: N3, material: GATE_MAT },
    { mesh: sillMesh, model: modelAt(0, 0.025, g.z), normalMat: N3, material: GATE_MAT },
  );
}

for (const p of placed) {
  if (p.d.known === 'WITHHELD') {
    draws.push({
      mesh: withheldMesh, model: modelAt(p.x, p.centreY, p.z), normalMat: N3,
      /* Steel, following E6: neither the fresh colour nor the stalled one, because both would assert a
         movement reading about the one deal whose movement may not be read. */
      /* Roughness 0.55 and metalness 0.25, NOT 0.28/0.58. Polished steel under a sky environment put a
         hard specular highlight on the one object in the scene that is meant to say "there is nothing
         here for you to read" — it was the brightest thing in the frame and drew the eye first. */
      material: { baseColour: hexToLinear(WITHHELD_HEX), roughness: 0.55, metalness: 0.25 },
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

/*
 * GRAZING, NOT OVERHEAD — and the first version was overhead.
 *
 * At (0.42, -0.66, -0.62) two thirds of the key light's direction pointed straight down, so the floor
 * received 0.66 x 3.1 of irradiance against a wall's small fraction of it: an almost black floor
 * albedo rendered as the palest thing in the frame, and every object read as a dark shape ON a bright
 * plane rather than as a lit object in a dark channel. The fix is the direction, not the albedo — a
 * darker floor under an overhead light is just a slightly less bright floor.
 *
 * Still across the channel as well as down it, so a deal's side and its top take light differently and
 * the contact shadow of a settled deal lands where a reader can see it. A light along the axis would
 * flatten every object against the floor and delete the shadow that reinforces the settling.
 *
 * IT CROSSES FROM THE SIDE THE CAMERA IS ON, and the first grazing version crossed from the other one.
 * `lightDir` is the direction light TRAVELS, so an x of +0.56 means it arrives from the left and lights
 * every face whose normal points left. The eye stands right of the centre line, so every surface it can
 * see — the left wall's inner face, the deals' right-hand faces — was the surface facing away from the
 * source: the channel rendered as five luminous gates floating in an unlit void, correctly. Negating x
 * lights the half of the room that is actually in shot.
 */
const lightDir: [number, number, number] = [-0.62, -0.38, -0.69];
const sceneMin: [number, number, number] = [-2.0, 0, CHANNEL_Z_FAR];
const sceneMax: [number, number, number] = [2.0, 1.9, CHANNEL_Z_NEAR];
const lightVP = lightViewProjection(
  { direction: lightDir, colour: [1, 1, 1], extent: 9.6 },
  boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
);

const tris = triangleCount(floorGeo) + 2 * triangleCount(wallGeo)
  + gates.length * (2 * triangleCount(postGeo) + triangleCount(sillGeo))
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
/* The sub-10k branch is not tidiness: `Math.round(1600/1000)` is 2, so the frame printed
   "1 PARTICLE = $2k/d CLEARED" against a constant of $1,600 — a 25% error in the one number that
   defines what a particle MEANS, produced by a rounding rule written for deal values. */
const fmtUsd = (v: number): string => (
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1e4 ? `$${Math.round(v / 1e3)}k`
      : `$${(v / 1e3).toFixed(1)}k`
);

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
/*
 * IS THE OBJECT ITSELF IN THE PICTURE?
 *
 * `projectQuad` refuses on depth and on degeneracy and nothing else — a quad 58° off the view axis is
 * in front of the camera, front-facing and perfectly well conditioned, and it is also not on the
 * screen. The first framing here put the SIGNED deal, the single largest object in the scene, entirely
 * outside the frame with its tag reported as SHOWN; `overflow:hidden` then quietly clipped a label for
 * an object nobody could see. Every other count agreed with the code.
 *
 * So framing is its own measurement, taken on the OBJECT rather than on its tag, because a deal whose
 * label is merely off frame is a labelling problem and a deal that is itself off frame is not in the
 * environment at all. Measured with the object's own projected half-height as the margin, so an object
 * grazing the edge counts as out.
 */
const objectOnFrame = (p: Placed): boolean => {
  const c = projectScreen(vpFinal, [p.x, p.centreY, p.z], CSS_W, CSS_H);
  if (c.behind) return false;
  const top = projectScreen(vpFinal, [p.x, p.topY, p.z], CSS_W, CSS_H);
  const m = Math.max(6, Math.abs(c.sy - top.sy));
  return c.sx > m && c.sx < CSS_W - m && c.sy > m && c.sy < CSS_H - m;
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
  const tagX = p.x < 0 ? p.x - TAG_DX : p.x + TAG_DX;
  const yaw = Math.atan2(eye[0] - tagX, eye[2] - p.z);
  const corners = uprightPanelCorners(tagX, p.z, p.topY + tagGapOf(p.slot), TAG_W, TAG_H, yaw, 0);
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
  /* A tag entirely outside the canvas box is not a tag. `overflow:hidden` makes it invisible either
     way, so without this it is counted as SHOWN and the shown-tag total is a fiction. */
  const offFrame = isQuadRefusal(proj) ? false : proj.screen.every(
    (c) => c.x < 0 || c.x > CSS_W || c.y < 0 || c.y > CSS_H,
  );
  const coveredCorners = isQuadRefusal(proj) ? 0 : (
    proj.screen.filter((c) => shownQuads.some((q) => inQuad(q, c.x, c.y))).length
    + shownQuads.reduce((n, q) => n + q.filter((c) => inQuad(
      proj.screen.map((v) => ({ x: v.x, y: v.y })), c.x, c.y,
    )).length, 0)
  );
  const occluded = coveredCorners >= 2;
  const shown = !refusal && !backFacing && !withheld && !tooFar && !edgeOn && !offFrame && !occluded;
  if (shown && !isQuadRefusal(proj)) shownQuads.push(proj.screen.map((c) => ({ x: c.x, y: c.y })));
  return {
    p, proj, shown, ew, eh, refusal, backFacing, withheld, tooFar, edgeOn, offFrame, occluded,
    widthPx, coveredCorners,
  };
});

/* A leader is drawn only where a tag survived, so the frame never carries a line pointing at nothing. */
const leaders = decided.filter((d) => d.shown).map((d) => d.p);

const GATE_STROKE = { colour: hexToLinear('#4E8CFF'), gain: 1.5 } as const;
const AXIS_STROKE = { colour: hexToLinear('#7FB2FF'), gain: 1.1 } as const;
/* Dimmer and wider than the first attempt: at gain 0.85 and 5 mm the leaders aliased into dotted lines
   brighter than the objects they pointed at, so the frame read as a diagram of lines with cubes
   attached. A leader should be the least interesting mark on the frame. */
const LEADER_STROKE = { colour: hexToLinear('#7FB2FF'), gain: 0.45 } as const;
/*
 * The movement axis, MARKED, so the vertical scale is an axis rather than an assertion.
 *
 * ON THE LEFT WALL, AT THE TERMS GATE — and the first version was on the right wall at the nearest
 * gate, which put all three ticks off frame. The eye sits to the RIGHT of the centre line, so the right
 * wall's inner face is the one turned away from it; and the nearest gate is nearly beside the viewer.
 * `axisLabelsOffFrame` reported 3 of 3 while the capture looked complete, which is the whole reason
 * that count exists. Three ticks at every gate would be fifteen marks competing with the objects they
 * exist to measure, so it stays at one gate — just a visible one.
 *
 * The 12 mm lift keeps the bottom tick off the floor plane: an additive stroke exactly coplanar with a
 * surface shimmers, and the shimmer is the tell rather than the z-fighting.
 */
/*
 * THE AXIS IS INSIDE THE CHANNEL, and it took four attempts and two decisive experiments to get here.
 *
 * The history matters because three of the four were fixes that did not fix:
 *
 *   1 · Originally drawn inside the channel, where the ticks ran through the tag of whichever deal shared that
 *       stage — a ruler drawn across the thing it measures.
 *   2 · Moved outboard of the LEFT wall. `axisLabelsOffFrame` went 3 -> 0 and the README recorded it fixed. It
 *       was not: the camera stands right of the centre line, so the left wall was between the eye and every
 *       tick. All three occluded, count reporting 0 because it only tested frame bounds.
 *   3 · Moved outboard of the RIGHT wall, the side the eye is on. `0d` came back and the two lower ticks did
 *       not. A framebuffer probe replaced the bounds count, which is what finally made the defect visible:
 *       `0d:yes (527 vs 65)  20d:NO (96 vs 96)  45d+:NO (92 vs 93)`.
 *
 * Then two experiments settled it, neither of which was a guess:
 *
 *   · WIDTH x5 (0.006 -> 0.030) changed nothing, and `0d`'s luminance stayed byte-identical at 527. So the
 *     strokes were not sub-pixel, and whatever `0d` was reading was reading the same thing either way.
 *   · MOVING THE AXIS INSIDE the channel made all three read 527. So the strokes were always emitted, the two
 *     lower ones were OCCLUDED, and `0d` had genuinely been drawing all along — it sits high enough to clear
 *     what the others do not.
 *
 * Inside is therefore the only position where the axis is fully visible, which means the real trade is against
 * failure 1 rather than against visibility. It is resolved by depth rather than by lateral offset: the axis
 * stands at one gate's z, inboard of the wall and outboard of the rails, so it shares a plane with no deal tag.
 * The tag-occlusion test that already guards the deal labels covers the rest, and it is fatal in the capture.
 */
const AXIS_SIDE = eye[0] >= 0 ? 1 : -1;
const AXIS_X_INNER = AXIS_SIDE * (CHANNEL_HALF - 0.42);
const AXIS_X_OUTER = AXIS_SIDE * (CHANNEL_HALF - 0.12);
/* The label sits OUTBOARD of its own tick — outside the channel, where it has the wall behind it
   rather than a deal. Only the strokes need to be inside; text does not occlude geometry. */
const AXIS_X_LABEL = AXIS_SIDE * (CHANNEL_HALF + 0.20);
const AXIS_Z = gateZ(3);
/*
 * THE FLOOR TICK NEEDS REAL CLEARANCE, NOT AN EPSILON — and this is the third thing wrong with this axis.
 *
 * A fully stalled deal sits ON the deck, so the 45d+ tick belongs at deck height, and it was placed 12 mm
 * above it. That is not enough: viewed from eye height 2.68 m at a shallow angle, a hairline 12 mm above a
 * plane projects into the SAME PIXELS as the plane, and the depth test ties. The tick was not occluded and
 * it was not missing — it was coincident, which looks identical to both and is neither.
 *
 * 5.5 cm is measured against the geometry rather than nudged until it appeared: it is a third of a rail
 * slot's pitch, so the lowest tick is unambiguously below every rail position and unambiguously above the
 * deck. The label keeps saying 45d+ because the QUANTITY has not moved; only the mark drawing it has.
 */
const TICK_FLOOR_CLEARANCE = 0.055;
const AXIS_TICKS = [0, 20, STALL_DAYS].map((days) => ({
  days,
  y: (1 - Math.min(1, days / STALL_DAYS)) * RAIL_LIFT + TICK_FLOOR_CLEARANCE,
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
    viewProj: vp, eye, lightDir, lightColour: [3.4, 3.3, 3.14],
    ambientGain: 0.44, lightVP, shadow, shadowStrength: 0.92, shadowTaps: Q.shadowTaps, draws,
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
    strokes.ruleAtDepth(vp, AXIS_X_OUTER, t.y, AXIS_X_INNER, t.y, AXIS_Z, 0.006, AXIS_STROKE);
  }
  for (const p of leaders) {
    const lx = p.x < 0 ? p.x - TAG_DX : p.x + TAG_DX;
    strokes.ruleAtDepth(vp, p.x, p.topY, lx, p.topY + tagGapOf(p.slot), p.z, 0.008, LEADER_STROKE);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  /*
   * 18 px AT ONE WORLD UNIT, and this number is a compromise the report has to admit rather than hide.
   *
   * Point size divides by w, so at 30 the stream crossing the SIGNED gate — a metre from the eye — was
   * 15 px blobs scattered across the near third of the frame and read as dust rather than as flow,
   * while at 8 the intake stream falls under a pixel and its density stops being visible at all. There
   * is no value that makes SCREEN density proportional to linear density at both ends of a perspective
   * channel; that is why the throughput is also printed as a number at every gate.
   */
  if (field) field.draw({ viewProj: vp, sources, pointScale: 18 });

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
/*
 * AND IT HAS A WALL-CLOCK CEILING, because a frame ceiling is not one. This loop is synchronous, so an
 * unbounded count is an unbounded main-thread block: `?frames=1e9` left the renderer process unable to
 * service a Playwright evaluation at all — the harness reported a timeout, which names the waiter rather
 * than the loop, and E9's task page polls the same title through an iframe. Clamping the COUNT alone does
 * not fix it: 20000 frames of this channel under SwiftShader is over an hour. The sweep therefore stops on
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

/* Primed to steady state BEFORE the clock starts, so the measurement is of a full field and the
   capture is of a field whose density is the rate rather than the frame count. */
if (field) for (let i = 0; i < PRIME_STEPS; i++) field.step(stepOpts);
const sweep = measure(FRAMES);
const ms = sweep.msPerFrame;

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DOM LAYER.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * One styled line of TEXT, built as an element rather than as a string of markup.
 *
 * Every projected label in this file was a template literal assigned to `innerHTML` with a deal name, a
 * stage id or a gate label interpolated into it. Those three are the strings a real dataset supplies, and
 * `innerHTML` PARSES its argument: `&` corrupts the label silently and `<` starts an element. The flat
 * table escapes the same values (`escText` in `_shared/flatFallback.ts`), so the rendered frame and the
 * fallback would have disagreed about the same record — inside the one file whose subject is that the two
 * cannot disagree.
 *
 * `textContent` does not parse. This is deliberately not an escaping helper: an escape has to be
 * remembered at every future interpolation, and a constructor that takes text cannot be got wrong.
 */
const textLine = (css: string, text: string): HTMLDivElement => {
  const d = document.createElement('div');
  d.style.cssText = css;
  d.textContent = text;
  return d;
};

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
/*
 * THE CONTAINER IGNORES THE POINTER; THE CONTENT DOES NOT — and until now neither did.
 *
 * `project.ts` justifies its own existence on the grounds that "GL text is unselectable, unsearchable,
 * invisible to a screen reader" and that the homography makes "the browser rasterise real selectable
 * text". Measured: `document.elementFromPoint` at the centre of every projected tag returned `CANVAS#c`,
 * and a real mouse drag across the middle of the canvas selected the empty string. Cmd/Ctrl+A still
 * reached the words, so the text was IN the document and unreachable with a pointer — a reader could not
 * point at a deal's value and copy it.
 *
 * `pointer-events:none` stays on the container, which must not swallow a gesture aimed at the canvas; each
 * projected leaf re-enables it and asks for `user-select:text`. Nothing here is interactive, so the only
 * cost is a drag that STARTS inside a tag.
 */
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);
/* Applied to every projected leaf below. One string so the two label kinds cannot drift apart. */
const SELECTABLE = 'pointer-events:auto;user-select:text;-webkit-user-select:text';

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
    + `justify-content:center;gap:3px;padding:0 5px;overflow:hidden;${SELECTABLE};`
    + `opacity:${(1 - 0.7 * haze).toFixed(3)};-webkit-font-smoothing:antialiased`;
  const days = p.d.daysSinceUpdate === null ? '—' : `${p.d.daysSinceUpdate} d`;
  /*
   * textContent PER LINE, NOT ONE innerHTML — and the deal NAME is the reason.
   *
   * `${p.d.name}` was interpolated straight into markup. A counterparty name is the one string here that
   * a real dataset supplies rather than this file, so the moment `DEALS` stops being literals, a name
   * containing `<` or `&` is parsed as markup on the surface a reader trusts most: an ampersand corrupts
   * the name silently, and a tag executes. The same values already go through `escText` in the flat
   * table, so the rendered tag and the fallback disagreed about the same record by construction.
   *
   * `textLine` sets `textContent`, which does not parse its argument at all — the fix that cannot be
   * got wrong later, as opposed to an escape that the next interpolation forgets.
   */
  el.appendChild(textLine('font:700 11px/1.05 ui-monospace,monospace;color:#fff', p.d.name));
  const valueLine = textLine(
    'font:400 10.5px/1.2 ui-monospace,monospace;color:rgba(255,255,255,0.80)',
    p.d.valueUsd === null ? `VALUE ABSENT · ${days}` : `${fmtUsd(p.d.valueUsd)} · ${days}`,
  );
  /* The absent colour applies to the whole line rather than to a nested span: the line IS the absence
     when there is no value to print, and one element is one fewer place for markup to appear. */
  if (p.d.valueUsd === null) valueLine.style.color = ABSENT_HEX;
  el.appendChild(valueLine);
  el.appendChild(textLine(
    'font:600 9px/1 ui-monospace,monospace;letter-spacing:.14em;color:rgba(255,255,255,0.60)', p.d.stage,
  ));
  overlay.appendChild(el);
}

/* ── Gate labels: ANNOTATION, so screen space rather than a projected plate ──────────────
   E5's rule, reached there from both sides: content belongs ON a surface, annotation belongs in front
   of it. A gate's throughput is a fact about the gate, not writing on it, so it is a screen-space tag
   above the lintel. Off-frame labels are counted, because an axis missing its outermost mark is worse
   than no axis and the capture looks fine either way. */
/*
 * ALTERNATING SIDES, AND A CROWDING REFUSAL — because "on frame" is not "readable".
 *
 * All five labels first went above the channel's centre line at one height. The gates converge toward
 * the vanishing point, so the three deepest labels landed within a few pixels of each other and printed
 * as one illegible stack — while `gateLabelsOffFrame` reported 0, which was true and useless. That is
 * the same failure shape as the axis ticks and as E6's occlusion test: a count that agrees with the
 * code and disagrees with the picture.
 *
 * Two fixes, and the second is the one that generalises. Labels alternate to the outside of the left
 * and right posts, which spreads them horizontally as well as by depth. And they are placed NEAR TO
 * FAR with a 30 px minimum separation, so a label that would land on an already-placed one is REFUSED
 * and counted rather than drawn on top of it. A refused gate label is a real loss — that gate's
 * throughput number is then unreadable — so it is reported by name.
 */
const placedLabels: { x: number; y: number }[] = [];
const gateLabels = [...gates].reverse().map((g) => {
  const left = g.index % 2 === 0;
  /*
   * ANCHORED AT y = 2.10, which is above the tallest possible tag rather than above the gate.
   *
   * At 1.45 the SIGNED gate's throughput label printed straight through the ATLAS OTC tag: the deal
   * tags are inside the occlusion test with each other and a screen-space annotation is not in it at
   * all, so the clearance has to be geometric. The tallest tag in the scene tops out at 1.84
   * (a fresh deal, biggest odd-slot gap, its own edge), so 2.10 clears it with margin — and the extra
   * height spreads the five labels further apart, which the crowding check below then has less to do.
   */
  const s = projectScreen(
    vpFinal, [left ? -(CHANNEL_HALF + 0.14) : CHANNEL_HALF + 0.14, 2.10, g.z], CSS_W, CSS_H,
  );
  const haze = fogAt(Math.hypot(eye[0], eye[1] - GATE_H, eye[2] - g.z));
  const onFrame = !s.behind && s.sx > 30 && s.sx < CSS_W - 30 && s.sy > 8 && s.sy < CSS_H - 8;
  const crowded = onFrame && placedLabels.some((q) => Math.hypot(q.x - s.sx, q.y - s.sy) < 30);
  if (onFrame && !crowded) {
    placedLabels.push({ x: s.sx, y: s.sy });
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${s.sx.toFixed(1)}px;top:${s.sy.toFixed(1)}px;`
      + `transform:translate(${left ? '-100%' : '0'},-100%);text-align:${left ? 'right' : 'left'};`
      + `white-space:nowrap;opacity:${(1 - 0.72 * haze).toFixed(3)};${SELECTABLE}`;
    /*
     * textContent, NOT innerHTML, and the stage label is why. `g.label` is a StageId today and every
     * other interpolation here is a number, so nothing in this string is currently hostile — but this is
     * the tag that will carry a stage name the moment the dataset stops being literals in this file, and
     * a `<` in it would be parsed as markup at exactly the position a reader trusts most. Two styled
     * lines of one string each is what `textLine` is for; there is no markup left to get wrong.
     *
     * The throughput REFUSES with the book: with nothing readable, `fmtUsd(0)` printed "$0.0k/d" on the
     * frame, which asserts a measured throughput of zero where the truth is that none was readable.
     */
    el.appendChild(textLine(
      'font:600 10px/1.25 ui-monospace,monospace;letter-spacing:.16em;color:#9CC2FF', g.label,
    ));
    el.appendChild(textLine(
      'font:400 9.5px/1.25 ui-monospace,monospace;color:rgba(196,212,240,0.72)',
      READABLE_BOOK ? `${fmtUsd(g.usdPerDay)}/d` : 'THROUGHPUT ABSENT',
    ));
    overlay.appendChild(el);
  }
  return { stage: g.label, sx: Math.round(s.sx), sy: Math.round(s.sy), onFrame, crowded };
});

/* ── The movement axis' own labels, against the ticks drawn in GL ───────────────────────
   OUTBOARD OF THE WALL, not on it. Inside the channel the ticks ran straight through the tag of
   whichever deal shared that stage — a ruler drawn across the thing it is measuring. A scale beside the
   space is E5's rule again: content on a surface, annotation in front of it. */
const axisLabels = [
  { y: RAIL_LIFT + 0.15, label: 'DAYS SINCE UPDATE' },
  ...AXIS_TICKS,
].map((t) => {
  const s = projectScreen(vpFinal, [AXIS_X_LABEL, t.y, AXIS_Z], CSS_W, CSS_H);
  const onFrame = !s.behind && s.sx > 0 && s.sx < CSS_W && s.sy > 0 && s.sy < CSS_H;
  if (onFrame) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${s.sx.toFixed(1)}px;top:${s.sy.toFixed(1)}px;`
      /* Anchored AWAY from the channel, which flips with the side. Left-aligned text on a
         right-hand axis would run back over its own tick. */
      + `transform:translate(${AXIS_SIDE > 0 ? '0' : '-100%'},-50%);`
      + `text-align:${AXIS_SIDE > 0 ? 'left' : 'right'};font:500 9.5px/1 ui-monospace,monospace;`
      + `letter-spacing:.08em;color:rgba(196,212,240,0.78);white-space:nowrap;`
      + `${AXIS_SIDE > 0 ? 'padding-left' : 'padding-right'}:5px;${SELECTABLE}`;
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
/* NULL WHEN NOTHING WAS MEASURABLE, not 0. Zero is the value the flat control legitimately reports — every
   deal pinned to the rail — so returning it for "there was no pair to measure" makes the one number that
   distinguishes the environment from the bar list mean two opposite things. */
const minSeparationPx: number | null = measurable.length > 0 ? Math.min(...measurable) : null;

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
/*
 * ABSENT IS NOT ZERO, AND `Math.max(1, totalObservedUsd)` MADE IT ZERO ON THE FRAME.
 *
 * Every share below was `deepStalledUsd / Math.max(1, totalObservedUsd)`. That guard stops a
 * divide-by-zero and in doing so MANUFACTURES a reading: with every deal withheld, `totalObservedUsd` is
 * 0 because there is nothing to sum, not because the book is empty — and the frame printed
 * `$0.0k PAST DILIGENCE AND STALLED · 0% OF THE READABLE BOOK` under a title of READY, with
 * `rateMonotoneDown: true` passing vacuously. Measured on a scratch copy fed twelve WITHHELD records.
 *
 * §6 rule 6 says absent data refuses, and this file already does it correctly twice — `edgeMinM` and
 * `particleField.zRange` come back null on the same input. So the shares refuse the same way, the gate
 * throughputs go null rather than 0, and the HUD prints the refusal instead of a percentage. `share` is
 * the ONE place the division happens, so there is nowhere left for a 1 to be substituted for a book.
 */
const READABLE_BOOK = observed.length > 0 && totalObservedUsd > 0;
const bookRefusal = READABLE_BOOK ? null : 'NO_READABLE_VALUE_IN_THE_BOOK';
const share = (v: number): number | null =>
  READABLE_BOOK ? Number((v / totalObservedUsd).toFixed(3)) : null;
const stalled = observed.filter((p) => (p.settle ?? 0) >= STALLED_AT);
const stalledUsd = stalled.reduce((s, p) => s + (p.d.valueUsd ?? 0), 0);
const deepStalled = stalled.filter((p) => p.stageIndex >= STAGE_ORDER.indexOf('DILIGENCE'));
const deepStalledUsd = deepStalled.reduce((s, p) => s + (p.d.valueUsd ?? 0), 0);

/* The un-confounded proof, over the deals that are supposed to have visibly fallen. */
const stalledDisplacements = stalled
  .map((p) => settleDisplacementPx(p))
  .filter((v): v is number => v !== null);
/* NULL, NOT 0, WHEN THERE WAS NOTHING TO MEASURE — see `minSeparationPx`. 0 is what the flat control
   reports and it is also what "no stalled deal is on screen" used to report. */
const minStalledDisplacementPx: number | null = stalledDisplacements.length > 0
  ? Math.round(Math.min(...stalledDisplacements)) : null;
const allDisplacements = placed.map((p) => settleDisplacementPx(p)).filter((v): v is number => v !== null);
const maxDisplacementPx: number | null = allDisplacements.length > 0
  ? Math.round(Math.max(...allDisplacements)) : null;

const counts = {
  OBSERVED: placed.filter((p) => p.d.known === 'OBSERVED').length,
  VALUE_ABSENT: placed.filter((p) => p.d.known === 'VALUE_ABSENT').length,
  WITHHELD: placed.filter((p) => p.d.known === 'WITHHELD').length,
};

const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px;'
  + SELECTABLE;
/*
 * THE HEADLINE REFUSES WHEN THERE IS NOTHING TO HEAD, and it used to print a measurement instead.
 *
 * The share was `Math.round(100 * deepStalledUsd / Math.max(1, totalObservedUsd))`. On a book where every
 * value is withheld or unpriced, `totalObservedUsd` is 0 — because there is nothing to sum, not because
 * the pipeline is empty — and that expression rendered `$0.0k PAST DILIGENCE AND STALLED · 0% OF THE
 * READABLE BOOK` onto the frame under a READY title. Two false statements about a pipeline nobody was
 * allowed to read, in the largest type on the picture.
 *
 * `share()` is now the only divider and it returns null instead of borrowing a 1, so the frame says what
 * the report says. The line is assembled from text nodes rather than one `innerHTML` string for the reason
 * given at `textLine`.
 */
hud.appendChild(textLine(
  'font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF',
  'PIPELINE · SIZE IS VALUE, HEIGHT IS MOVEMENT',
));
{
  const body = document.createElement('div');
  body.style.cssText = 'font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)';
  const headline = document.createElement('div');
  if (READABLE_BOOK) {
    const amount = document.createElement('b');
    amount.style.color = '#FF9B76';
    amount.textContent = fmtUsd(deepStalledUsd);
    headline.appendChild(amount);
    headline.appendChild(document.createTextNode(
      ` PAST DILIGENCE AND STALLED  ·  ${Math.round(100 * (share(deepStalledUsd) ?? 0))}% OF THE READABLE BOOK`,
    ));
  } else {
    const refused = document.createElement('b');
    refused.style.color = ABSENT_HEX;
    refused.textContent = 'NO READABLE VALUE IN THE BOOK';
    headline.appendChild(refused);
    headline.appendChild(document.createTextNode(
      ` — ${counts.WITHHELD} withheld, ${counts.VALUE_ABSENT} never priced, so no share is computable`,
    ));
  }
  body.appendChild(headline);
  body.appendChild(textLine('', `${STALL_DAYS} d = ON THE FLOOR  ·  1 PARTICLE = ${fmtUsd(USD_PER_PARTICLE)}/d CLEARED`));
  body.appendChild(textLine('', `${SETTLE_ON ? 'MOVEMENT AXIS ON' : 'MOVEMENT AXIS OFF — every deal pinned to the rail'}`
    + `  ·  ${particleRefusal === null ? 'THROUGHPUT ON' : `THROUGHPUT OFF — ${particleRefusal.split(' — ')[0]}`}`));
  hud.appendChild(body);
}
hud.appendChild(textLine(
  `font:500 10px/1.4 ui-monospace,monospace;color:${ABSENT_HEX}`, 'SYNTHETIC DEALS',
));
overlay.appendChild(hud);

const legend = document.createElement('div');
legend.style.cssText = 'position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;'
  + 'gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace;' + SELECTABLE;
legend.innerHTML = ([
  [FRESH_HEX, 'UPDATED · rides the rail'],
  [STALLED_HEX, `STALLED · ${stalled.length} of ${counts.OBSERVED} at ${Math.round(STALLED_AT * STALL_DAYS)} d+`],
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

/*
 * §6 RULE 5 — BRAND HEX EXACT, AND IT DIES RATHER THAN WARNS.
 *
 * A frame that has silently moved the brand blue is worse than no frame, because it will be
 * screenshotted into a deck. E3 has a specific reason to run the check rather than trust a unit test:
 * it is the first environment to mix a LIT surface colour with an ADDITIVE pass over the same HDR
 * target, and the deal colour is an interpolation between two hexes rather than a hex — both are the
 * kind of change that quietly introduces a second tone map.
 */
const brandFailures = assertBrandFidelity();
if (brandFailures.length > 0) {
  const msg = 'BRAND FIDELITY FAILED — '
    + brandFailures.map((f) => `${f.key}: expected ${f.expected}, got ${f.actual}`).join('; ');
  document.title = 'REFUSED';
  log.textContent = msg;
  throw new Error(msg);
}

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
    : d.backFacing ? 'BACK_FACING' : d.offFrame ? 'OFF_FRAME' : d.edgeOn ? 'EDGE_ON'
      : d.tooFar ? 'BEYOND_LEGIBLE_RANGE' : 'OCCLUDED',
  objectOnFrame: objectOnFrame(d.p),
}));

const report = {
  /* WHICH TIER THIS FRAME IS, so the numbers beside it describe a configuration a reader can reconstruct.
     A tier that cannot be reported is a tier that cannot be trusted. */
  tier: Q.tier,
  tierDprScale: Q.dprScale,
  /* The tier SCALES this environment's own baseline (1536) rather than replacing it — the
     ladder must not change what the frame looks like at its highest tier. */
  tierShadowMapSize: shadowMapSizeFor(TIER, 1536),
  shadowBaseline: 1536,
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
  stalledShare: share(stalledUsd),
  deepStalledUsd,
  deepStalledShare: share(deepStalledUsd),
  /* Null shares are not a gap in the report — they are the report saying the denominator was unreadable.
     Named, so the reason travels with the absence. */
  bookRefusal,
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
  /* REFUSES ALONGSIDE THE BOOK. With nothing readable every gate rate is 0, so `<=` held between five
     zeroes and this boolean — described two lines below as the assertion that catches the density
     describing something else — passed vacuously on the one input where it is meaningless. */
  rateMonotoneDown: READABLE_BOOK
    ? gates.every((g, i) => i === 0 || g.ratePerSec <= gates[i - 1]!.ratePerSec + 1e-9)
    : null,
  rateRatioFirstLast: READABLE_BOOK
    ? Number((gates[0]!.ratePerSec / Math.max(1e-9, gates[gates.length - 1]!.ratePerSec)).toFixed(2))
    : null,
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
  /* THE OBJECTS, not their labels. A deal that is not in the picture is not in the environment, whatever
     the report says about its tag. Fatal in the capture. */
  objectsOffFrame: placed.filter((p) => !objectOnFrame(p)).map((p) => p.d.name),
  gateLabelsOffFrame: gateLabels.filter((g) => !g.onFrame).map((g) => g.stage),
  /* A gate whose throughput number was suppressed to keep it off another one. Named, because the
     alternative is two numbers printed on top of each other and neither readable. */
  gateLabelsCrowded: gateLabels.filter((g) => g.crowded).map((g) => g.stage),
  axisLabelsOffFrame: axisLabels.filter((a) => !a.onFrame).length,
  /*
   * WHETHER EACH TICK STROKE IS ACTUALLY ON THE GLASS — read back from the framebuffer, not inferred.
   *
   * `axisLabelsOffFrame` counts frame bounds and has now been wrong about this axis twice: once when all
   * three ticks sat behind a wall, and again now, when the 45d+ stroke is absent while its label is not. Two
   * fixes have failed to bring it back (moving the axis to the eye's side, and giving the floor tick 55 mm of
   * clearance instead of 12), and I do not have a mechanism. What I can do is stop the harness being ABLE to
   * hide it: each stroke's midpoint is sampled against a point just above it, and a tick that does not raise
   * the local luminance is reported as not drawn.
   *
   * This is the pattern that has worked all session — a pixel read beats looking — and it means the next
   * person to touch this axis is told by the report rather than by a paragraph.
   */
  axisTicksDrawn: AXIS_TICKS.map((tk) => {
    const mid = projectScreen(vpFinal, [(AXIS_X_INNER + AXIS_X_OUTER) / 2, tk.y, AXIS_Z], W, H);
    if (mid.behind || mid.sx < 2 || mid.sx > W - 2 || mid.sy < 4 || mid.sy > H - 4) {
      return { label: tk.label, drawn: false, why: 'OFF_FRAME' };
    }
    /*
     * A BAND, NOT A PIXEL. The strokes are hairlines about a pixel wide, and a single-texel read at the
     * projected midpoint misses one by a rounding — the first version of this probe reported 20d as absent
     * while the capture plainly showed it. A probe less sensitive than the thing it measures produces false
     * defects, which is the same error as a noise floor drawn tighter than its comparison.
     */
    const band = (dyFrom: number, dyTo: number): number => {
      const h = dyTo - dyFrom + 1;
      const px = new Uint8Array(4 * h);
      // GL reads bottom-up; projectScreen returns top-down.
      gl.readPixels(Math.round(mid.sx), Math.round(H - mid.sy) + dyFrom, 1, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let best = 0;
      for (let i = 0; i < h; i++) best = Math.max(best, px[i * 4]! + px[i * 4 + 1]! + px[i * 4 + 2]!);
      return best;
    };
    const onStroke = band(-2, 2);
    /* Compared against a band clear of the stroke rather than against a fixed threshold: the background is a
       fogged wall whose brightness varies down the frame, so an absolute cutoff would pass at the top of the
       axis and fail at the bottom for reasons unrelated to the stroke. */
    const nearby = band(8, 12);
    return { label: tk.label, drawn: onStroke > nearby + 12, lum: onStroke, background: nearby };
  }),
  /*
   * THE FIELD THE OLD COUNT SHOULD HAVE BEEN. `axisLabelsOffFrame` tested frame bounds only and reported
   * 0 while all three ticks sat behind a wall. Occlusion by a channel wall is now impossible by
   * construction — the axis and the eye are on the same side of both slabs — and this states that
   * rather than re-measuring it, because the measurement was what went wrong.
   */
  axisSide: AXIS_SIDE > 0 ? 'right' : 'left',
  axisOnEyeSide: (AXIS_SIDE > 0) === (eye[0] >= 0),
  fogNearest: Math.min(...perDeal.map((d) => d.fog)),
  fogFurthest: Math.max(...perDeal.map((d) => d.fog)),

  brandFidelity: brandFailures,
  glError: gl.getError(),
  triangles: tris,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  /* THE VALUE MEASURED, NOT THE VALUE ASKED FOR. `frames` used to report the raw parameter while the loop
     ran `Math.max(1, FRAMES)`, so `frames=0` and `frames=-5` published a single-frame time as a 0-frame
     and a -5-frame sweep. */
  frames: sweep.measured,
  framesRequested: FRAMES,
  sweepTruncated: sweep.measured < FRAMES,
  paramClamps,
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

  /* THROUGHPUT REFUSES WITH THE BOOK. `clearedUsd` of 0 means "no readable value has crossed this gate",
     which is a different statement from "no value has crossed it" — and the second is what a 0 in a
     dollars-per-day column reads as. */
  gates: gates.map((g) => ({
    stage: g.label, z: g.z,
    clearedUsd: READABLE_BOOK ? g.clearedUsd : null,
    usdPerDay: READABLE_BOOK ? Math.round(g.usdPerDay) : null,
    ratePerSec: READABLE_BOOK ? Number(g.ratePerSec.toFixed(2)) : null,
    perMetre: READABLE_BOOK ? Number(g.linearDensityPerMetre.toFixed(2)) : null,
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
  /* `absent` rather than `null` in the printed diagnostic: these fields refuse when the book has no
     readable value, and a printed `$null/d` reads as a bug in the formatter rather than as a refusal. */
  + gateRows.map((g) => (
    `  ${g.stage.padEnd(10)} ${(g.usdPerDay === null ? 'absent' : `$${g.usdPerDay}`).padStart(8)}/d`
    + ` ${String(g.ratePerSec ?? 'absent').padStart(7)} p/s ${String(g.perMetre ?? 'absent').padStart(7)} p/m`
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
/* THE FALLBACK IS HIDDEN ONLY NOW, and only by CSS. A frame exists, so the table is redundant on
   screen — and it stays in the accessibility tree and the print path, where the canvas is opaque. */
fallback.markRendered();
document.title = 'READY';
