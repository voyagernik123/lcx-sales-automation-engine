/**
 * E7 · THE STORM — marketing risk as a volumetric field over a calendar floor.
 *
 * `3D_VFX_1000X.md` §2: "marketing crisis / risk as a volumetric field — pressure, rotation, a front
 * advancing on a calendar floor." It replaces `MarketingCrisis`, a heatmap.
 *
 * ── THE ONE SENTENCE AN OPERATOR IS TOLD, AND WHY IT IS LITERALLY TRUE ───────────────
 * *The depth of colour here is the total risk between you and that day.*
 *
 * That is not a metaphor for "darker means worse". The volume layer has NO procedural noise term by
 * construction (`env/volume.ts` says so and means it), so the only thing the raymarch does is
 * integrate an uploaded grid. Front-to-back accumulation with `1 - alpha` weighting gives
 * `alpha = 1 - exp(-tau)` exactly, where `tau` is the line integral of density along the ray. The grid
 * is built so that the integral across ONE DAY of one channel and one severity band equals that cell's
 * measured risk times `RISK_TO_TAU`. So the opacity you see at a point is a stated function of the sum
 * of the table between the eye and there, and `axialCheck` in the report marches the field on the CPU
 * with the engine's own tested `rayBoxSlab`/`marchPlan` and prints the disagreement as a percentage.
 * If that number is not small, the picture is not the data and the environment has no claim to exist.
 *
 * A heatmap of (channel × day) shows every cell and cannot show a SUM. Accumulation along a line of
 * sight is the one reading a 2-D grid structurally cannot give, and it is the reading an operator
 * actually wants: not "is day 11 bad" but "how much do I walk through to get to day 11".
 *
 * ── THE THING THAT WOULD BE WORST TO GET WRONG, GOT RIGHT ────────────────────────────
 * A density field is a scalar. Zero means "no risk". There is no value that means "we did not look",
 * so a day the monitor did not cover CANNOT be represented in the volume at all — and writing zero
 * there would state, in the most convincing way this renderer has, that a day nobody measured was calm.
 *
 * So the refusal is carried by everything EXCEPT the density:
 *   · the floor has no tile on an unmeasured day — a hole you can see the void through;
 *   · the DOM says NOT MEASURED at that gap, and WITHHELD is a different marker on an intact tile;
 *   · and the accumulated reading itself REFUSES past the gap. Any ray to a day beyond an unmeasured
 *     day integrates across a hole, so "total risk between you and that day" is not available for it.
 *     `integrableToDay` is that horizon, and it is reported next to `visibleToDay` — two different
 *     numbers, exactly as E6 reports readable-to next to visible-to.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────────────
 * §2 also says "rotation". There is no rotational term, because there is no measured rotational
 * quantity, and a curl-noise swirl over a compliance calendar is weather. The README names it.
 */
import { installFlatFallback } from '../_shared/flatFallback.js';
import {
  createStage, isStage, box, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createAmbientOcclusion, createVolumeField, rayBoxSlab, marchPlan,
  projectQuad, isQuadRefusal, uprightPanelCorners,
  viewProjection, eyeOf, lightViewProjection, boundsRadius, boundsCentre, triangleCount,
  hexToLinear, assertBrandFidelity, projectScreen, normalise, sub, cross,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL, IDENTITY,
  type LitDraw, type Viewpoint, type StageRefusal, type Vec3, type QuadCorners, type VolumeField,
  QUALITY_TIERS, qualitySettings, type QualityTier,
} from '@lcx/gl';

const params = new URLSearchParams(location.search);
/* THE CONTROL THAT MATTERS HERE. `?vol=0` is the flat surface's information: the calendar, the day
   grid, the states — everything except the accumulation, which is the only thing a heatmap cannot do. */
const VOL_ON = params.get('vol') !== '0';
/* THE SECOND CONTROL, and the one that shows a specific engineering lie. `?depth=0` hands the march a
   depth texture cleared to the far plane, so the volume stops reading the scene and paints straight
   over the gate, the lids and the floor. `env/volume.ts` calls that "fog on the lens"; this is the
   capture that shows what it looks like, and `glOcclusionPixels` is how many pixels differ. */
const DEPTH_ON = params.get('depth') !== '0';
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
const SCALE = Math.max(1, Math.min(3, Number(params.get('scale') ?? 1)));
const FRAMES = Number(params.get('frames') ?? 300);

const W = 1200 * SCALE, H = 720 * SCALE;
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
const log = document.getElementById('log')!;

function die(m: string): never {
  document.title = 'REFUSED';
  log.textContent = m;
  /* THE REFUSAL GOES ABOVE THE TABLE, NOT INSTEAD OF IT. A reader who cannot be shown the field is
     still entitled to every cell of it, and to be told which of the two is missing. */
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
 * THE DATA. Synthetic, and said so ON THE FRAME in amber rather than in a comment.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * HAND-AUTHORED EVENTS, NOT A GENERATOR. 7 channels × 28 days × 3 bands is 588 cells and I am not
 * going to pretend to have authored 588 numbers, so the table is DERIVED from two things a compliance
 * monitor actually produces:
 *
 *   · a per-channel background advisory rate — the median count of low-severity flagged items a
 *     channel produces on an ordinary day;
 *   · a list of FLAGGED ITEMS, each already scheduled for a specific day at a specific severity.
 *
 * That is the real shape of the input: the risk on a future day is the weight of items already known
 * to land on it, not a forecast. And it is why the front below is a front — a disclosure failure in
 * INFLUENCER on day 4 propagates to PAID_SOCIAL, then COMMUNITY, then PR_EARNED, escalating in
 * severity as it goes. A uniform sprinkle would render as a fog bank and would exercise none of the
 * accumulation this environment exists to show.
 */
const CHANNELS = [
  'PAID_SEARCH', 'PAID_SOCIAL', 'INFLUENCER', 'EMAIL', 'PR_EARNED', 'AFFILIATE', 'COMMUNITY',
] as const;
const BANDS = ['ADVISORY', 'ELEVATED', 'SEVERE'] as const;
const DAYS = 28;

/* Measured 30-day median advisory rate per channel, in risk units per day. */
const BASELINE = [0.050, 0.070, 0.040, 0.025, 0.020, 0.055, 0.045];

interface Flagged { ch: number; day: number; band: number; w: number }
const FLAGGED: readonly Flagged[] = [
  { ch: 0, day: 1, band: 1, w: 0.30 },
  { ch: 3, day: 2, band: 1, w: 0.25 },
  { ch: 6, day: 3, band: 1, w: 0.20 },
  /* THE FRONT. One disclosure failure, four channels, ten days, severity climbing as it spreads. */
  { ch: 2, day: 4, band: 1, w: 0.50 },
  { ch: 2, day: 5, band: 1, w: 0.80 },
  { ch: 2, day: 6, band: 2, w: 0.70 },
  { ch: 2, day: 7, band: 2, w: 1.00 },
  { ch: 2, day: 8, band: 2, w: 0.90 },
  { ch: 2, day: 9, band: 1, w: 0.60 },
  { ch: 2, day: 10, band: 1, w: 0.35 },
  { ch: 1, day: 6, band: 1, w: 0.40 },
  { ch: 1, day: 7, band: 1, w: 0.75 },
  { ch: 1, day: 8, band: 2, w: 0.85 },
  { ch: 1, day: 9, band: 2, w: 1.05 },
  { ch: 1, day: 10, band: 2, w: 0.80 },
  { ch: 1, day: 11, band: 1, w: 0.50 },
  { ch: 1, day: 12, band: 1, w: 0.30 },
  { ch: 6, day: 8, band: 1, w: 0.30 },
  { ch: 6, day: 9, band: 1, w: 0.55 },
  { ch: 6, day: 10, band: 2, w: 0.70 },
  { ch: 6, day: 11, band: 2, w: 0.95 },
  { ch: 6, day: 12, band: 2, w: 0.75 },
  { ch: 6, day: 13, band: 1, w: 0.45 },
  { ch: 6, day: 14, band: 1, w: 0.25 },
  { ch: 4, day: 10, band: 1, w: 0.35 },
  { ch: 4, day: 11, band: 1, w: 0.60 },
  { ch: 4, day: 12, band: 2, w: 0.80 },
  { ch: 4, day: 13, band: 2, w: 0.60 },
  { ch: 4, day: 14, band: 1, w: 0.40 },
  /* A second, unrelated system: a disclosure deadline lands on paid and owned channels together. */
  { ch: 0, day: 13, band: 1, w: 0.45 },
  { ch: 0, day: 14, band: 2, w: 0.75 },
  { ch: 0, day: 15, band: 2, w: 0.60 },
  { ch: 0, day: 16, band: 1, w: 0.30 },
  { ch: 3, day: 14, band: 1, w: 0.40 },
  { ch: 3, day: 15, band: 1, w: 0.55 },
  { ch: 3, day: 16, band: 1, w: 0.30 },
  /* Late, and PAST THE OUTAGE — deliberately. Its accumulated reading cannot be delivered, and that
     is the whole point of putting real mass on the far side of an unmeasured gap. */
  { ch: 5, day: 24, band: 1, w: 0.50 },
  { ch: 5, day: 25, band: 2, w: 0.70 },
  { ch: 5, day: 26, band: 1, w: 0.40 },
];

/*
 * THREE STATES, NEVER COLLAPSED — `3D_VFX_1000X.md` §6 rule 6 and this programme's whole posture.
 *
 * OBSERVED  the monitor covered the day.
 * ABSENT    the monitor's feed dropped. NOT zero risk. Rendered as a HOLE in the floor.
 * WITHHELD  measured, and this reader may not see it. Rendered as a STEEL LID on an intact tile —
 *           the same distinction E5 draws between a hole and an amber plate, deliberately mirrored
 *           rather than reinvented, because two environments disagreeing on what a hole means is
 *           worse than either choice.
 */
type DayState = 'OBSERVED' | 'ABSENT' | 'WITHHELD';
/*
 * THE OUTAGE SITS ON THE FRONT, AND THAT IS THE POINT.
 *
 * It was on days 17-19 first, which is late, deep in the frame, past everything, and cost nothing: the
 * hole was almost invisible and no flagged item fell into it, so `flaggedLostToNonObservedDays` read 0
 * and the whole apparatus for reporting swallowed signal was untested by its own data.
 *
 * Days 13-15 is where a monitoring outage actually hurts — mid-advance, with nine already-scheduled
 * flagged items landing inside it. Their weight is in no cell of the table and cannot be, and the frame
 * says so with a count rather than by leaving three days looking calm.
 */
const ABSENT_DAYS = [13, 14, 15];
const WITHHELD_DAYS = [22, 23];
const dayState = (d: number): DayState =>
  ABSENT_DAYS.includes(d) ? 'ABSENT' : WITHHELD_DAYS.includes(d) ? 'WITHHELD' : 'OBSERVED';

/* table[channel][day][band], in risk units. Non-observed days stay at zero here and are NEVER read
   as data — every consumer branches on `dayState` first. */
const table: number[][][] = CHANNELS.map((_, c) => (
  Array.from({ length: DAYS }, (_, d) => {
    const cell = [0, 0, 0];
    if (dayState(d) === 'OBSERVED') cell[0] = BASELINE[c]!;
    return cell;
  })
));
for (const f of FLAGGED) {
  if (dayState(f.day) !== 'OBSERVED') continue;
  table[f.ch]![f.day]![f.band]! += f.w;
}
/* Dropped because the item lands on a day nobody measured. Reported, not silently absorbed: a flagged
   item that vanished into an outage is exactly the thing an operator needs told. */
const flaggedOnNonObserved = FLAGGED.filter((f) => dayState(f.day) !== 'OBSERVED');

let MAX_CELL = 0;
for (const ch of table) for (const day of ch) for (const v of day) MAX_CELL = Math.max(MAX_CELL, v);

/*
 * THE FRONT, AS A NUMBER AND THEN AS A GATE.
 *
 * `REVIEW_THRESHOLD` is a stated escalation trigger in risk units, and `frontDay` is the first day at
 * which the accumulated risk across every channel and band reaches it. That is a derived quantity with
 * one input, so the gate stands where the data puts it — and if the outage arrives before the
 * threshold does, `frontDay` REFUSES rather than reporting the last integrable day as though the
 * crossing had been observed there.
 */
const REVIEW_THRESHOLD = 8.0;
let cumulative = 0;
let frontDay = -1;
let frontRefusal: string | null = null;
const cumulativeByDay: number[] = [];
for (let d = 0; d < DAYS; d++) {
  if (dayState(d) !== 'OBSERVED') {
    cumulativeByDay.push(cumulative);
    if (frontDay < 0 && frontRefusal === null) {
      frontRefusal = dayState(d) === 'ABSENT'
        ? 'THRESHOLD_NOT_REACHED_BEFORE_UNMEASURED_DAY' : 'THRESHOLD_NOT_REACHED_BEFORE_WITHHELD_DAY';
    }
    continue;
  }
  for (let c = 0; c < CHANNELS.length; c++) for (let b = 0; b < BANDS.length; b++) cumulative += table[c]![d]![b]!;
  cumulativeByDay.push(cumulative);
  if (frontDay < 0 && cumulative >= REVIEW_THRESHOLD) { frontDay = d; frontRefusal = null; }
}

/*
 * THE READING STATE OF EVERY DAY — the part that makes absence cost something.
 *
 * A day's own state is not the whole story. "Total risk between you and day 25" requires every day in
 * between, so a day BEYOND an unmeasured one carries no accumulated reading at all. Two refusal codes,
 * never merged, because an operator does something different about each: an outage is a vendor
 * problem, a compartment is a clearance problem.
 */
type Reading = 'INTEGRABLE' | 'DAY_NOT_MEASURED' | 'DAY_WITHHELD'
  | 'INTEGRAL_CROSSES_UNMEASURED_DAY' | 'INTEGRAL_CROSSES_WITHHELD_DAY';
const firstAbsent = Math.min(...ABSENT_DAYS);
const firstWithheld = Math.min(...WITHHELD_DAYS);
const readingOf = (d: number): Reading => {
  const st = dayState(d);
  if (st === 'ABSENT') return 'DAY_NOT_MEASURED';
  if (st === 'WITHHELD') return 'DAY_WITHHELD';
  if (d > firstAbsent) return 'INTEGRAL_CROSSES_UNMEASURED_DAY';
  if (d > firstWithheld) return 'INTEGRAL_CROSSES_WITHHELD_DAY';
  return 'INTEGRABLE';
};
const integrableToDay = Math.max(...Array.from({ length: DAYS }, (_, d) => d)
  .filter((d) => readingOf(d) === 'INTEGRABLE'));


/*
 * THE FLAT FALLBACK IS INSTALLED BEFORE THE STAGE EXISTS — §6 rule 1.
 *
 * Above `createStage` on purpose: a shader compile failure happens during module evaluation, so
 * anything built after the renderer is constructed is code that never runs on the failure it exists
 * for. Print and the accessibility tree are not errors either, and there is nothing to catch for those.
 *
 * THE TABLE IS THE FIELD'S OWN CELLS, and one column the 3-D view has no way to show as a number: the
 * running cumulative. That is deliberate. The rendered view is better at the accumulation as a SHAPE —
 * where the front is, how it spreads across channels, how much stands between you and a given day —
 * and worse at the exact figure. So the fallback is not a consolation prize with fewer fields; it is
 * the same data with the arithmetic done for you and the shape thrown away.
 *
 * ABSENT AND WITHHELD BOTH CARRY `null`, which the fallback renders as a named "absent" rather than a
 * blank or a zero, and the STATE column keeps them apart. A flat view that collapsed them would break
 * rule 6 in the very thing meant to satisfy rule 1.
 */
const fallback = installFlatFallback({
  title: 'E7 · The Storm — marketing risk by day, channel and severity',
  readsAs: 'Depth is days ahead in the rendered view, and the opacity along any line of sight is the '
    + 'total risk between the viewer and that day — an accumulation a per-cell table cannot show. The '
    + 'front advancing across channels, the three-day hole where the monitor was down, and the two days '
    + 'that are measured but withheld are all shapes there and rows here. This table carries every '
    + 'cell; what it cannot carry is what lies between you and a day.',
  notices: [
    `SYNTHETIC RISK DATA — ${FLAGGED.length} hand-authored flagged items over ${DAYS} days. `
    + 'The shape is deliberate; the values are not measurements.',
    `D${Math.min(...ABSENT_DAYS)}-D${Math.max(...ABSENT_DAYS)} were NOT MEASURED, and `
    + `${flaggedOnNonObserved.length} already-scheduled flagged items landed inside them: their weight `
    + 'is in no cell below and is not zero. Every cumulative figure past that day is REFUSED.',
  ],
  columns: [
    { key: 'day', label: 'Day' },
    { key: 'state', label: 'State' },
    { key: 'reading', label: 'Cumulative reading' },
    { key: 'advisory', label: 'Advisory', numeric: true },
    { key: 'elevated', label: 'Elevated', numeric: true },
    { key: 'severe', label: 'Severe', numeric: true },
    { key: 'total', label: 'Day total', numeric: true },
    { key: 'cumulative', label: 'Cumulative', numeric: true },
  ],
  rows: Array.from({ length: DAYS }, (_, d) => {
    const st = dayState(d);
    const obs = st === 'OBSERVED';
    const reading = readingOf(d);
    const band = (b: number): number | null => (
      obs ? Number(CHANNELS.reduce((n, _c, c) => n + table[c]![d]![b]!, 0).toFixed(3)) : null
    );
    const total = obs
      ? Number(BANDS.reduce((n, _b, b) => n + CHANNELS.reduce((m, _c, c) => m + table[c]![d]![b]!, 0), 0).toFixed(3))
      : null;
    return {
      day: `D${d}`,
      state: st,
      /* The cumulative is REFUSED past the hole rather than continued. Continuing it would be the
         table's version of writing zero into the density. */
      reading: reading === 'INTEGRABLE' ? 'integrable' : reading,
      advisory: band(0), elevated: band(1), severe: band(2), total,
      cumulative: reading === 'INTEGRABLE' ? Number(cumulativeByDay[d]!.toFixed(2)) : null,
    };
  }),
});
fallbackRef = fallback;

/*
 * A SYNTHETIC REFUSAL, SO THE FALLBACK CAN BE CAPTURED. Rule 8 is "every claim gets a capture", and
 * rule 1's claim — that a refusal resolves to the flat surface without losing information — cannot be
 * photographed any other way, because a page cannot switch off its own WebGL.
 *
 * `?refuse=1` is not a mock: it calls the same `die` a failed shader compile calls.
 */
if (params.get('refuse') === '1') {
  die('FORCED_REFUSAL: a deliberate refusal, taken so the flat fallback can be captured. '
    + 'The volumetric field is not being drawn.');
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

/*
 * THE VOLUME IS DRAWN INTO ITS OWN TARGET AND COMPOSITED, AND THAT IS NOT AN OPTIMISATION.
 *
 * The march samples the scene's DEPTH texture. That texture is the depth attachment of the scene
 * framebuffer, so drawing the volume straight into the scene target while sampling its own depth is a
 * feedback loop — which WebGL2 does not leave undefined, it raises INVALID_OPERATION and draws
 * nothing. The gate for this whole programme is `glError 0`, so the loop would have failed it loudly
 * rather than quietly; a separate target is the honest fix rather than detaching the attachment and
 * hoping.
 *
 * The composite carries premultiplied colour and coverage, so it blends ONE / ONE_MINUS_SRC_ALPHA and
 * does NOT tone map. The present pass owns the only tone map in the pipeline.
 */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVolume;
out vec4 frag;
void main(){ frag = texture(uVolume, vUv); }`;

const present = required('present', stage.compile(PRESENT_VERT, PRESENT_FRAG));
const composite = required('composite', stage.compile(PRESENT_VERT, COMPOSITE_FRAG));
const lit = required('lit', createLitRenderer(stage));
const target = required('target', createTarget3D(stage, W, H));
const volTarget = required('volume target', createTarget3D(stage, W, H));
/*
 * A 4×4 TARGET WHOSE DEPTH IS CLEARED TO THE FAR PLANE — the `?depth=0` control, and the reference the
 * occlusion measurement differences against. Four texels is enough because every sample of an all-far
 * depth map returns the same number; allocating it at full size to make that point would cost 3.4 MB
 * on an 8 GB machine for no information.
 */
const farDepth = required('far depth', createTarget3D(stage, 4, 4));
const shadow = required('shadow', createShadowMap(stage, Q.shadowMapSize));
const ao = required('ao', createAmbientOcclusion(stage, W, H));

farDepth.bind();
gl.clearDepth(1);
gl.clear(gl.DEPTH_BUFFER_BIT);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);


/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CALENDAR, IN METRES. Every number here is a unit conversion, not a taste.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const DAY_M = 0.5;
const NOW_OFFSET = 2.6;
const CAL_LEN = DAYS * DAY_M;
/*
 * A 2.5 cm PLATE, NOT A 6 cm SLAB — and the thickness is what decides whether a day gridline exists.
 *
 * With 6 cm tiles the day gaps did not read at all, and the reason is geometry rather than contrast: at
 * 21° of elevation a line of sight entering an 11 cm gap has to run 15.6 cm to clear a 6 cm edge, so no
 * ray through the gap ever reached the void behind the floor. Every gap showed the LIT +z face of the
 * next tile instead, at very nearly the brightness of the tile tops, and the calendar rendered as seven
 * smooth strips. Thinning the plate to 2.5 cm needs only 6.5 cm of run, so the gap shows the clear
 * colour and the gridline is the absence it is supposed to be.
 */
const LANE_PITCH = 0.62, LANE_W = 0.46, TILE_T = 0.025, TILE_D = DAY_M * 0.78;
const GUTTER_W = 0.56;
const FLOOR_TOP = TILE_T / 2;
const laneX = (c: number): number => (c - (CHANNELS.length - 1) / 2) * LANE_PITCH;
const LANE_HALF = laneX(CHANNELS.length - 1) + LANE_W / 2;
const GUTTER_X = laneX(0) - LANE_W / 2 - 0.03 - GUTTER_W / 2;
const FLOOR_MIN_X = GUTTER_X - GUTTER_W / 2;
/* The camera is offset so the floor INCLUDING its date gutter is centred. Centring on the lanes
   instead pushed the gutter — and therefore every date label — into the left margin. */
const SCENE_X = (FLOOR_MIN_X + LANE_HALF) / 2;
const zNearOfDay = (d: number): number => -NOW_OFFSET - d * DAY_M;
const zMidOfDay = (d: number): number => zNearOfDay(d) - DAY_M / 2;

/*
 * 0.60 m PER BAND, NOT 0.42 — and the field's height is a function of the CAMERA, which is not obvious.
 *
 * A view ray descends. At 21° elevation it loses 0.39 m of height per metre travelled down the day
 * axis, so a 1.26 m field is crossed top to bottom in 3.2 m — six days — and no ray can accumulate
 * more than six days of anything however honest the integral is. Raising the bands to 0.60 m takes that
 * to 4.6 m, about nine days, which is what `eyeRayDaysSpanned` in the report now measures rather than
 * assumes. The field's height is not a look; it is the length of the reading.
 */
const BAND_H = 0.60;
const FIELD_Y0 = FLOOR_TOP + 0.02;
const FIELD_Y1 = FIELD_Y0 + BANDS.length * BAND_H;
const bandCentreY = (b: number): number => FIELD_Y0 + (b + 0.5) * BAND_H;

const BOX_MIN: [number, number, number] = [-LANE_HALF, FIELD_Y0, zNearOfDay(DAYS)];
const BOX_MAX: [number, number, number] = [LANE_HALF, FIELD_Y1, zNearOfDay(0)];

/*
 * THE UNIT CONVERSION THAT MAKES THE OPERATOR SENTENCE TRUE.
 *
 * `RISK_TO_TAU` is optical depth per risk unit, and it is the ONLY free parameter in the reading. The
 * grid is uploaded normalised to 0..1 (the layer's contract), and `DENSITY_SCALE` is what turns that
 * back into an integral in risk units: one day's slab is DAY_M long, so density × DAY_M must equal
 * cell × RISK_TO_TAU, which fixes the scale rather than leaving it to be dialled until it looked good.
 */
const RISK_TO_TAU = 0.70;
const DENSITY_SCALE = (MAX_CELL * RISK_TO_TAU) / DAY_M;

const GRID_X = 76, GRID_Y = 42, GRID_Z = 112;
const gridIndex = (ix: number, iy: number, iz: number): number => ix + GRID_X * (iy + GRID_Y * iz);

const laneOfX = (x: number): number => {
  for (let c = 0; c < CHANNELS.length; c++) if (Math.abs(x - laneX(c)) <= LANE_W / 2) return c;
  /* BETWEEN LANES IS NOT A CHANNEL. Interpolating risk across the gap between EMAIL and PR_EARNED
     would invent a value for a channel that does not exist, so the gaps are hard zero and the field
     reads as seven separate columns — which is what seven separate channels are. */
  return -1;
};
const dayOfZ = (z: number): number => {
  const d = Math.floor((-z - NOW_OFFSET) / DAY_M);
  return d >= 0 && d < DAYS ? d : -1;
};
const bandOfY = (y: number): number => {
  const b = Math.floor((y - FIELD_Y0) / BAND_H);
  return b >= 0 && b < BANDS.length ? b : -1;
};

/*
 * THE FIELD, EVALUATED PER VOXEL FROM THE TABLE. Three resampling rules, each stated because each one
 * is a place a lie could hide:
 *
 *   x — piecewise constant per lane, hard zero in the gaps. Channels are categories.
 *   z — piecewise constant per day. The field STEPS AT MIDNIGHT because a day is a measurement
 *       bucket; a volume that flowed smoothly across the boundary would assert intra-day structure
 *       nobody measured.
 *   y — a PLATEAU across the middle 62% of the band, tapering to zero at its edges.
 *
 * ── THE y PROFILE WAS A TENT, AND `axialCheck` REJECTED IT AT 8.07% ──────────────────
 * The first version peaked at the band's centre and fell linearly to its edges, which sounds like a
 * plume and reads as one. The verification refused it, and the reason is a discretisation nobody would
 * find by looking: the band's centre falls exactly BETWEEN two voxel centres, so the highest value the
 * grid ever holds is the tent evaluated half a voxel off its peak — 0.9286 instead of 1 — and the
 * marched integral came back 7.1% light on every one of the 21 rays. A uniform 7% under-report of
 * accumulated risk, systematic and invisible.
 *
 * The plateau fixes it and is the better statement anyway: within a severity band there IS no
 * gradation — ELEVATED is ELEVATED — so a profile that peaks in the middle of a band was asserting a
 * continuum the data does not have. Now every voxel near the band centre holds exactly the cell value,
 * the reading is exact over a 0.37 m thick slice rather than along an infinitesimal line, and the
 * residual error is the Riemann sum alone.
 */
const BAND_PLATEAU = 0.62;
const fieldAt = (x: number, y: number, z: number): number => {
  const c = laneOfX(x); if (c < 0) return 0;
  const d = dayOfZ(z); if (d < 0) return 0;
  if (dayState(d) !== 'OBSERVED') return 0;
  const b = bandOfY(y); if (b < 0) return 0;
  const s = Math.abs(y - bandCentreY(b)) / (BAND_H / 2);
  const profile = Math.max(0, Math.min(1, (1 - s) / (1 - BAND_PLATEAU)));
  return profile <= 0 ? 0 : (table[c]![d]![b]! * profile) / MAX_CELL;
};

const grid = new Float32Array(GRID_X * GRID_Y * GRID_Z);
for (let iz = 0; iz < GRID_Z; iz++) {
  const z = BOX_MIN[2] + ((iz + 0.5) / GRID_Z) * (BOX_MAX[2] - BOX_MIN[2]);
  for (let iy = 0; iy < GRID_Y; iy++) {
    const y = BOX_MIN[1] + ((iy + 0.5) / GRID_Y) * (BOX_MAX[1] - BOX_MIN[1]);
    for (let ix = 0; ix < GRID_X; ix++) {
      const x = BOX_MIN[0] + ((ix + 0.5) / GRID_X) * (BOX_MAX[0] - BOX_MIN[0]);
      grid[gridIndex(ix, iy, iz)] = fieldAt(x, y, z);
    }
  }
}
let fMin = Infinity, fMax = -Infinity, fSum = 0, fNonZero = 0;
for (const v of grid) {
  if (v < fMin) fMin = v;
  if (v > fMax) fMax = v;
  fSum += v;
  if (v > 0) fNonZero++;
}

/*
 * THE VOLUME MAY REFUSE, AND THE FRAME STILL HAS TO STAND UP.
 *
 * `createVolumeField` refuses without OES_texture_float_linear, because a float sampler3D silently
 * falls back to NEAREST and the field would ship as a voxel aesthetic. A refusal here is not fatal:
 * the calendar, the day grid, the three states and every count are still true and still rendered — the
 * accumulation is what is lost, so that is what the frame says is lost.
 */
const volumeOut = VOL_ON ? createVolumeField(stage, GRID_X, GRID_Y, GRID_Z) : null;
const volumeRefusal = volumeOut && 'kind' in volumeOut
  ? `${volumeOut.code} — ${volumeOut.reason}`
  : null;
const volume: VolumeField | null = volumeOut && !('kind' in volumeOut) ? volumeOut : null;
if (volume) volume.upload(grid);

/* One voxel per step, and enough steps to cross the box corner to corner. `marchReachM` against
   `boxDiagonalM` is in the report because a reach shorter than the diagonal truncates the far side of
   the field, and a truncated march looks exactly like the data ending. */
const WORLD_STEP = 0.125;
const MAX_STEPS = 128;

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CAMERA — and the first one put five sixths of the calendar in the top eighth of the frame.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The first framing was 15.3° of elevation with the eye 4.8 m from day 0. That is a low, dramatic angle
 * down a 14 m calendar and it produced a capture in which day 0 filled the bottom half of the frame,
 * days 10 to 27 were compressed into about a hundred pixels at the top, the three state markers piled
 * on top of one another because there was nowhere for them to be, and the bottom quarter of the frame
 * was empty floor. The numbers said it fitted — the far edge was 8.7° off axis, inside the half-FOV —
 * and it did fit. It fitted the way a corridor fits when you stand on its centre line: everything
 * present, nothing readable.
 *
 * 21.3° with the eye 6.5 m back is the framing that puts the near edge of day 0 and the far edge of
 * day 27 SYMMETRICALLY about the view axis, ±10.3°, so the calendar occupies 61% of the frame's height
 * centred rather than 15% of it wedged at the top. Both numbers are checked in the report as
 * `nearEdgeOffAxisDeg`/`farEdgeOffAxisDeg` against `halfFovDeg`, because "it fits" was exactly the
 * thing that was true and useless last time.
 *
 * 33°, not 36: a longer lens compresses depth less, so the far weeks hold their size, and the
 * horizontal room lost is room the calendar never needed — the widest part of it subtends 63% of the
 * frame at the near edge.
 */
const NEAR = 2.5, FAR = 32;
const view: Viewpoint = {
  target: [SCENE_X, 0.366, zMidOfDay(5.13)], distance: 10.0,
  azimuthDeg: 0, elevationDeg: 21.3, fovDeg: 33, near: NEAR, far: FAR,
};
const eye = eyeOf(view);
const forward = normalise(sub(view.target as Vec3, eye));
const camRight = normalise(cross(forward, [0, 1, 0]));
const camUp = normalise(cross(camRight, forward));
const TAN_HALF = Math.tan(((view.fovDeg ?? 36) * Math.PI) / 360);
const ASPECT = W / H;

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE FLOOR, AND THE THREE STATES MADE PHYSICAL.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const tileGeo = box(LANE_W, TILE_T, TILE_D);
const gutterGeo = box(GUTTER_W, TILE_T, TILE_D);
const lidGeo = box(2 * LANE_HALF, 0.42, TILE_D);
const railGeo = box(2 * LANE_HALF + GUTTER_W + 0.06, 0.10, 0.05);
const weekGeo = box(2 * LANE_HALF, 0.07, 0.05);
/*
 * THE GATE IS A FENCE, NOT A WALL — and the wall version was 56 px of solid blue across the frame.
 *
 * A 0.52 m slab at day 7 stands 11 m from the eye, which is a band a fifteenth of the frame's height
 * spanning its whole width, and everything in the lower severity band beyond it was gone. The
 * threshold is a line in time, so it renders as a line of posts on the lane boundaries plus a low
 * sill: it still occludes — that is measured, and `glOcclusionPixels` is how — but it occludes eight
 * thin vertical strips rather than the lower half of three weeks.
 */
const gateGeo = box(2 * LANE_HALF, 0.11, 0.05);
const postGeo = box(0.075, 1.05, 0.075);

const tileMesh = required('tile', uploadMesh(stage, tileGeo));
const gutterMesh = required('gutter', uploadMesh(stage, gutterGeo));
const lidMesh = required('lid', uploadMesh(stage, lidGeo));
const railMesh = required('rail', uploadMesh(stage, railGeo));
const weekMesh = required('week bar', uploadMesh(stage, weekGeo));
const gateMesh = required('gate', uploadMesh(stage, gateGeo));
const postMesh = required('post', uploadMesh(stage, postGeo));

const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const modelOf = (x: number, y: number, z: number): Float32Array => {
  /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0 and every vertex collapses to
     the origin with a complete framebuffer and no refusal anywhere. It cost E0 a day. */
  const m = IDENTITY();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

const MAT = {
  /*
   * LIFTED FROM #101B2F, and the day gridlines are the reason. A day gap shows the void behind the
   * floor, which clears to #070B14 — and against a #101B2F tile the two are within 0.02 of linear
   * radiance of each other, so the gaps vanished and seven lanes rendered as seven smooth strips. §2
   * asks for day gridlines; a gridline nobody can see is not one. The gap also widened from 16% of a
   * day to 22%.
   */
  tile: { baseColour: hexToLinear('#22315A'), roughness: 0.74, metalness: 0.03 },
  gutter: { baseColour: hexToLinear('#131E36'), roughness: 0.84, metalness: 0 },
  withheldTile: { baseColour: hexToLinear('#1B2540'), roughness: 0.55, metalness: 0.10 },
  /* Steel, and the same reasoning E6's WITHHELD slab uses: a withheld day is neither calm nor bad, it
     is the ABSENCE OF A READING, and giving it a colour from the risk ramp would assert a finding
     nobody is entitled to.
     ROUGH, not polished. At roughness 0.28 against a key light of 2.6 the lid and the gate came back as
     two pale bars brighter than any part of the field, so the two objects whose whole job is to mark a
     REFUSAL were the loudest things in the frame. */
  lid: { baseColour: hexToLinear('#6B7A99'), roughness: 0.62, metalness: 0.35 },
  rail: { baseColour: hexToLinear('#6B7A99'), roughness: 0.58, metalness: 0.25 },
  week: { baseColour: hexToLinear('#26355A'), roughness: 0.60, metalness: 0.05 },
  gate: { baseColour: hexToLinear('#2C6BFF'), roughness: 0.52, metalness: 0.06 },
} as const;

interface Solid { min: [number, number, number]; max: [number, number, number] }
const solids: Solid[] = [];
const draws: LitDraw[] = [];
const addBox = (
  cx: number, cy: number, cz: number, w: number, h: number, d: number,
  mesh: typeof tileMesh, material: LitDraw['material'],
): void => {
  draws.push({ mesh, model: modelOf(cx, cy, cz), normalMat: N3, material });
  solids.push({
    min: [cx - w / 2, cy - h / 2, cz - d / 2],
    max: [cx + w / 2, cy + h / 2, cz + d / 2],
  });
};

let tilesDrawn = 0, tilesOmitted = 0;
for (let d = 0; d < DAYS; d++) {
  const st = dayState(d);
  const z = zMidOfDay(d);
  if (st === 'ABSENT') {
    /* NO TILE. The hole IS the refusal, and the gap runs the full width of the calendar so it cannot
       be read as one channel going quiet. */
    tilesOmitted += CHANNELS.length + 1;
    continue;
  }
  addBox(GUTTER_X, 0, z, GUTTER_W, TILE_T, TILE_D, gutterMesh, MAT.gutter);
  for (let c = 0; c < CHANNELS.length; c++) {
    addBox(laneX(c), 0, z, LANE_W, TILE_T, TILE_D, tileMesh,
      st === 'WITHHELD' ? MAT.withheldTile : MAT.tile);
  }
  tilesDrawn += CHANNELS.length + 1;
  if (st === 'WITHHELD') {
    addBox(0, FLOOR_TOP + 0.21, z, 2 * LANE_HALF, 0.42, TILE_D, lidMesh, MAT.lid);
  }
}
/*
 * THE HOLE IS FENCED AT BOTH ENDS, and the low rail on its own was not enough — twice over.
 *
 * Read at 16 m the two 10 cm rails were a pair of faint lines, and the three-day gap they bounded read
 * as the calendar simply being darker there. An outage is the most important thing on this frame and it
 * was the least visible. So each edge now carries a row of posts on the lane boundaries, the same
 * height as the review gate's and in the refusal grey rather than the brand blue.
 *
 * It also fixed a measurement. `glOcclusionPixels` had fallen to 3,943 — under the capture script's
 * floor — because raising the field clear of the floor left almost no geometry standing INSIDE the
 * volume for the depth cap to bite on. Sixteen posts inside the field is both the honest marker and the
 * thing that gives the occlusion claim something to be true about.
 */
const absentRailZ = [
  zNearOfDay(Math.min(...ABSENT_DAYS)) + 0.02,
  zNearOfDay(Math.max(...ABSENT_DAYS) + 1) - 0.02,
];
for (const z of absentRailZ) {
  addBox(SCENE_X, FLOOR_TOP + 0.05, z, 2 * LANE_HALF + GUTTER_W + 0.06, 0.10, 0.05, railMesh, MAT.rail);
  for (let c = 0; c <= CHANNELS.length; c++) {
    addBox(laneX(0) - LANE_PITCH / 2 + c * LANE_PITCH, FLOOR_TOP + 0.525, z,
      0.075, 1.05, 0.075, postMesh, MAT.rail);
  }
}
/*
 * A WEEK GRIDLINE IS SUPPRESSED WHERE IT WOULD BRIDGE THE HOLE, and the first version did not.
 *
 * The week 2 boundary falls between day 13 and day 14 — inside the outage — so the bar was drawn as a
 * solid full-width rib straight across the middle of the three-day gap, filling in a third of the one
 * piece of geometry whose entire job is to be missing. It is the same class of error as writing zero
 * into the density: a structural element continuing across an unmeasured region asserts that the region
 * is there. Suppressed, and counted, because a suppressed gridline is itself a thing a reader should be
 * told about rather than left to wonder at.
 */
const WEEK_DAYS = [7, 14, 21, 28];
const weekBarDrawn = WEEK_DAYS.filter((d) => (
  dayState(d - 1) !== 'ABSENT' && dayState(Math.min(d, DAYS - 1)) !== 'ABSENT'
));
for (const d of weekBarDrawn) {
  addBox(0, FLOOR_TOP + 0.035, zNearOfDay(d), 2 * LANE_HALF, 0.07, 0.05, weekMesh, MAT.week);
}

if (frontDay >= 0) {
  const gz = zNearOfDay(frontDay);
  addBox(0, FLOOR_TOP + 0.055, gz, 2 * LANE_HALF, 0.11, 0.05, gateMesh, MAT.gate);
  for (let c = 0; c <= CHANNELS.length; c++) {
    addBox(laneX(0) - LANE_PITCH / 2 + c * LANE_PITCH, FLOOR_TOP + 0.525, gz,
      0.075, 1.05, 0.075, postMesh, MAT.gate);
  }
}


const lightDir: [number, number, number] = [0.44, -0.66, -0.61];
const sceneMin: [number, number, number] = [FLOOR_MIN_X - 0.2, 0, zNearOfDay(DAYS) - 0.3];
const sceneMax: [number, number, number] = [LANE_HALF + 0.2, FIELD_Y1, -NOW_OFFSET + 0.3];
const lightVP = lightViewProjection(
  { direction: lightDir, colour: [1, 1, 1], extent: 9.5 },
  boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
);

const tris = draws.reduce((n, d) => n + (
  d.mesh === tileMesh ? triangleCount(tileGeo)
    : d.mesh === gutterMesh ? triangleCount(gutterGeo)
      : d.mesh === lidMesh ? triangleCount(lidGeo)
        : d.mesh === railMesh ? triangleCount(railGeo)
          : d.mesh === weekMesh ? triangleCount(weekGeo)
            : d.mesh === gateMesh ? triangleCount(gateGeo) : triangleCount(postGeo)
), 0);

const CLEAR = hexToLinear('#070B14');
/* Darker than DEFAULT_SKY on every stop. The sky is the specular environment and nothing else here —
   there is no backdrop pass — but a volumetric composited over a lifted floor reads as haze over
   daylight rather than as accumulated risk, so the environment is dimmed rather than the volume
   brightened. */
const SKY = {
  zenith: [0.010, 0.014, 0.030] as Vec3,
  horizon: [0.030, 0.044, 0.080] as Vec3,
  ground: [0.006, 0.007, 0.012] as Vec3,
};
/*
 * THE LOW END OF THE RAMP WAS 4× TOO BRIGHT, AND IT ERASED THE CALENDAR.
 *
 * At 2.2× the brand blue, the baseline advisory haze — which covers every observed day of every channel
 * and therefore the whole floor — contributed about 0.24 of linear radiance against a floor tile whose
 * own colour is 0.03. Eight times brighter. The capture came back with seven smooth purple lanes and NO
 * DAY GRIDLINES ANYWHERE, and the coverage was only 18%: the field was not hiding the calendar by being
 * opaque, it was hiding it by being brighter than it. §2 asks for a front advancing ON a calendar
 * floor, and a floor nobody can see is not a calendar.
 *
 * Low end down to 0.55×, so the background tints the floor instead of replacing it. The high end went
 * the other way for the same reason: at 2.6× the front's core clipped to a flat white-orange blob with
 * no internal structure at all, so nine days of escalating severity rendered as one cylinder. 1.45×
 * keeps the core hot and lets consecutive days differ. Same data, same integral, four times the reading.
 */
const RAMP_LOW = hexToLinear('#2C6BFF');
const RAMP_HIGH = hexToLinear('#FF8A3D');
const COL_LOW: [number, number, number] = [RAMP_LOW[0] * 0.55, RAMP_LOW[1] * 0.55, RAMP_LOW[2] * 0.55];
const COL_HIGH: [number, number, number] = [RAMP_HIGH[0] * 1.45, RAMP_HIGH[1] * 1.45, RAMP_HIGH[2] * 1.45];
/*
 * WHERE THE COLOUR RAMP STOPS SAYING ANYTHING, stated as a risk figure rather than left to be noticed.
 *
 * The layer mixes low to high on `clamp(density, 0, 1)`, and density is fixed by the integral
 * calibration — so the ramp saturates at exactly one risk value and every cell above it renders the
 * same colour. Severity is still carried, by HEIGHT, and magnitude is still carried, by opacity; but a
 * reader told "colour is risk" would over-read the top of the ramp, so the saturation point and the
 * number of cells past it are in the report.
 */
const RAMP_SATURATION_RISK = DAY_M / RISK_TO_TAU;
const cellsAboveRampSaturation = table.reduce((n, ch) => (
  n + ch.reduce((m, day) => m + day.filter((v) => v > RAMP_SATURATION_RISK).length, 0)
), 0);

function frame(depthOn = DEPTH_ON) {
  const vp = viewProjection(view, ASPECT);
  lit.shadowPass(lightVP, draws, shadow);
  target.bind();
  gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  lit.depthPrepass(vp, draws);
  if (AO_ON) {
    ao.compute({
      depthTexture: target.depthTexture, near: NEAR, far: FAR,
      fovDeg: view.fovDeg ?? 36, aspect: ASPECT, radius: 0.34, strength: 1.15,
    });
    target.bind();
  }
  lit.draw({
    viewProj: vp, eye, lightDir, lightColour: [2.05, 2.0, 1.92],
    ambientGain: 0.62, sky: SKY, lightVP, shadow, shadowStrength: 0.92, draws,
    ao: AO_ON ? ao.texture : null, screenSize: [W, H],
  });
  if (volume) {
    volTarget.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    volume.draw({
      eye, forward, right: camRight, up: camUp,
      fovDeg: view.fovDeg ?? 36, aspect: ASPECT, near: NEAR, far: FAR,
      sceneDepth: depthOn ? target.depthTexture : farDepth.depthTexture,
      boxMin: BOX_MIN, boxMax: BOX_MAX,
      worldStep: WORLD_STEP, maxSteps: MAX_STEPS, densityScale: DENSITY_SCALE,
      colourLow: COL_LOW, colourHigh: COL_HIGH,
      lightDir, lightSteps: 6, emission: 0.26,
    });
    target.bind();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, volTarget.texture);
    stage.blit(composite, (prog) => gl.uniform1i(gl.getUniformLocation(prog, 'uVolume'), 0));
    gl.disable(gl.BLEND);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  stage.blit(present, (prog) => gl.uniform1i(gl.getUniformLocation(prog, 'uScene'), 0));
}

/*
 * THE INSTRUMENT. Copied from E6 deliberately, including the warm-up frame.
 *
 * `gl.finish()` returns once the command buffer is FLUSHED, not once the GPU has finished, and that
 * mistake published two numbers in this repo that were 140× wrong. A pixel read cannot be satisfied
 * until the frame it reads actually exists, which is what makes the clock mean something. The warm-up
 * matters too: the first frame pays shader upload and texture allocation.
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
 * IS SCENE DEPTH ACTUALLY DOING ANYTHING? MEASURED, NOT ASSERTED.
 *
 * `env/volume.ts` says a volumetric drawn without scene depth "looks like fog on the lens". That is a
 * claim about this frame, so it gets a number: render once with the real depth texture and once with
 * one cleared to the far plane, read both back, and count the pixels that differ. Zero would mean the
 * depth cap is decorative — that nothing in the scene ever stands in front of the field — and the
 * capture script throws on it rather than shipping a volume that only appears to be in the room.
 */
function occlusionDelta(): { pixels: number; pct: number; meanDelta: number; maxDelta: number } {
  if (!volume) return { pixels: 0, pct: 0, meanDelta: 0, maxDelta: 0 };
  const a = new Uint8Array(W * H * 4);
  const b = new Uint8Array(W * H * 4);
  frame(true);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a);
  frame(false);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
  let n = 0, sum = 0, max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(
      Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!),
    );
    /* A COUNT ALONE IS NOT ENOUGH. Dimming the ramp's low end cut the count almost in half without
       changing what the depth cap does, because most of the affected pixels moved by one or two levels
       rather than none. The magnitude is reported next to the count so a threshold effect cannot be
       mistaken for the effect disappearing. */
    if (d > 2) { n++; sum += d; if (d > max) max = d; }
  }
  return {
    pixels: n, pct: Number(((100 * n) / (W * H)).toFixed(2)),
    meanDelta: Number((sum / Math.max(1, n)).toFixed(1)), maxDelta: max,
  };
}
const occlusion = occlusionDelta();

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CPU MIRROR — the instrument that decides whether the picture is the data.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * It samples the SAME uploaded grid with the same trilinear rule the sampler uses, walks it with the
 * engine's own `rayBoxSlab` and `marchPlan` (exported and unit-tested precisely so a disagreement
 * between the reference and the shader is a findable thing), and reproduces the shader's two skips:
 * out-of-box samples are zero, and samples below 0.0005 are dropped.
 */
const sampleGrid = (x: number, y: number, z: number): number => {
  const u = (x - BOX_MIN[0]) / (BOX_MAX[0] - BOX_MIN[0]);
  const v = (y - BOX_MIN[1]) / (BOX_MAX[1] - BOX_MIN[1]);
  const w = (z - BOX_MIN[2]) / (BOX_MAX[2] - BOX_MIN[2]);
  if (u < 0 || u > 1 || v < 0 || v > 1 || w < 0 || w > 1) return 0;
  const fx = u * GRID_X - 0.5, fy = v * GRID_Y - 0.5, fz = w * GRID_Z - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const tx = fx - x0, ty = fy - y0, tz = fz - z0;
  const cl = (i: number, n: number): number => (i < 0 ? 0 : i > n - 1 ? n - 1 : i);
  let acc = 0;
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const wt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty) * (k ? tz : 1 - tz);
        if (wt <= 0) continue;
        acc += wt * grid[gridIndex(cl(x0 + i, GRID_X), cl(y0 + j, GRID_Y), cl(z0 + k, GRID_Z))]!;
      }
    }
  }
  return acc * DENSITY_SCALE;
};

interface MarchResult {
  tau: number; truncated: boolean; capped: boolean; hit: boolean; tStart: number; tEnd: number;
}
const marchRay = (
  o: readonly [number, number, number], dir: readonly [number, number, number], tCap: number,
): MarchResult => {
  const box3 = rayBoxSlab(o, dir, BOX_MIN, BOX_MAX);
  if (!box3) return { tau: 0, truncated: false, capped: false, hit: false, tStart: 0, tEnd: 0 };
  const tFar = Math.min(box3.tFar, tCap);
  const capped = tCap < box3.tFar;
  if (tFar <= box3.tNear) {
    return { tau: 0, truncated: false, capped, hit: true, tStart: box3.tNear, tEnd: box3.tNear };
  }
  const plan = marchPlan(tFar - box3.tNear, WORLD_STEP, MAX_STEPS);
  let tau = 0;
  for (let i = 0; i < plan.steps; i++) {
    const t = box3.tNear + (i + 0.5) * plan.step;
    if (t > tFar) break;
    const d = sampleGrid(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t);
    if (d <= 0.0005) continue;
    tau += d * plan.step;
  }
  return { tau, truncated: plan.truncated, capped, hit: true, tStart: box3.tNear, tEnd: tFar };
};

/*
 * THE AXIAL CHECK — the operator sentence, verified in its exact form.
 *
 * One ray per (channel, band) straight down the day axis at the lane's centre and the band's centre
 * height, from outside the near face to beyond the far one. Its optical depth divided by RISK_TO_TAU
 * must equal the sum of that channel and band over every OBSERVED day. Any disagreement is the grid's
 * discretisation plus the Riemann sum, and it is printed as a percentage rather than trusted.
 */
const axialRays = CHANNELS.flatMap((name, c) => BANDS.map((band, b) => {
  const expect = table[c]!.reduce((n, day, d) => n + (dayState(d) === 'OBSERVED' ? day[b]! : 0), 0);
  const r = marchRay([laneX(c), bandCentreY(b), BOX_MAX[2] + 1], [0, 0, -1], Infinity);
  const got = r.tau / RISK_TO_TAU;
  return {
    channel: name, band, expected: Number(expect.toFixed(4)), measured: Number(got.toFixed(4)),
    errorPct: expect > 1e-6 ? Number((100 * Math.abs(got - expect) / expect).toFixed(2)) : 0,
    truncated: r.truncated,
  };
}));
const axialMaxErrorPct = Math.max(...axialRays.map((r) => r.errorPct));
const axialMeanErrorPct = Number(
  (axialRays.reduce((n, r) => n + r.errorPct, 0) / axialRays.length).toFixed(3),
);

/*
 * THE EYE SWEEP. A sparse grid of pixels marched exactly as the shader builds its rays, so the march
 * facts §2 asks for — worldStep, maxSteps, whether any ray truncated — are measured on the real camera
 * rather than deduced from the box's diagonal. `geometryCapped` is the count of rays that a solid cut
 * short, which is the same claim `glOcclusionPixels` makes from the other end.
 */
const nearestSolid = (dir: readonly [number, number, number]): number => {
  let t = Infinity;
  for (const s of solids) {
    const h = rayBoxSlab(eye, dir, s.min, s.max);
    if (h && h.tNear > 0 && h.tNear < t) t = h.tNear;
  }
  return t;
};
/*
 * WHERE THE EXACT READING STOPS BEING EXACT, MEASURED ON THE RAYS THAT EXIST.
 *
 * Two things spoil the clean form of the reading and both are properties of a perspective camera:
 *
 *   · LANE DRIFT. A ray fans out, so one entering the near face inside INFLUENCER can leave the far
 *     face inside EMAIL, and its accumulation is then a mixture of two channels rather than one
 *     channel's total.
 *   · BAND CROSSING. A ray descends, so it also slides down through the severity bands.
 *
 * The exact instrument for "total risk between you and that day, in this channel and this band" is an
 * orthographic camera down the day axis — which is a heatmap. Perspective buys presence and costs this,
 * and the cost is a number rather than a caveat. The first version measured drift on the two rays at
 * the frame's horizontal edges and reported 0.00 lanes, which was arithmetically right and completely
 * misleading: those rays leave the field's x range before they ever reach its near face, so they miss
 * the box entirely and there was no drift to measure. Measured over the rays that actually hit.
 */
const SWEEP_X = 61, SWEEP_Y = 37;
let hitBox = 0, capped = 0, truncatedRays = 0, tauMin = Infinity, tauMax = 0, tauSum = 0;
let driftMax = 0, driftSum = 0, daysMax = 0, daysSum = 0, bandsMax = 0, bandsSum = 0;
for (let py = 0; py < SWEEP_Y; py++) {
  for (let px = 0; px < SWEEP_X; px++) {
    const nx = (2 * (px + 0.5)) / SWEEP_X - 1;
    const ny = (2 * (py + 0.5)) / SWEEP_Y - 1;
    const dir = normalise([
      forward[0] + camRight[0] * nx * TAN_HALF * ASPECT + camUp[0] * ny * TAN_HALF,
      forward[1] + camRight[1] * nx * TAN_HALF * ASPECT + camUp[1] * ny * TAN_HALF,
      forward[2] + camRight[2] * nx * TAN_HALF * ASPECT + camUp[2] * ny * TAN_HALF,
    ]);
    const r = marchRay(eye, dir, nearestSolid(dir));
    if (!r.hit) continue;
    hitBox++;
    if (r.capped) capped++;
    if (r.truncated) truncatedRays++;
    tauMin = Math.min(tauMin, r.tau);
    tauMax = Math.max(tauMax, r.tau);
    tauSum += r.tau;
    const at = (t: number, a: number): number => eye[a]! + dir[a]! * t;
    const drift = Math.abs(at(r.tEnd, 0) - at(r.tStart, 0)) / LANE_PITCH;
    const days = Math.abs(at(r.tEnd, 2) - at(r.tStart, 2)) / DAY_M;
    const bands = Math.abs(at(r.tEnd, 1) - at(r.tStart, 1)) / BAND_H;
    driftMax = Math.max(driftMax, drift); driftSum += drift;
    daysMax = Math.max(daysMax, days); daysSum += days;
    bandsMax = Math.max(bandsMax, bands); bandsSum += bands;
  }
}
if (!Number.isFinite(tauMin)) tauMin = 0;
const perRay = (v: number): number => Number((v / Math.max(1, hitBox)).toFixed(2));

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE DOM LAYER.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
const vpFinal = viewProjection(view, ASPECT);
const CSS_W = W / SCALE, CSS_H = H / SCALE;

const wrap = document.createElement('div');
/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to the canvas box or it extends
   the PAGE box, and a surface seen nearly edge-on produces a homography whose coefficients are
   enormous — the element's transformed box then runs to millions of pixels and Playwright's fullPage
   screenshot fails with "Unable to capture screenshot", naming the screenshot rather than the
   transform three layers away. */
wrap.style.cssText = `position:relative;overflow:hidden;width:${CSS_W}px;height:${CSS_H}px`;
canvas.parentNode?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
wrap.appendChild(overlay);

/*
 * SIZE THE ELEMENT TO THE PROJECTION, NOT TO THE WORLD RECTANGLE — and this is the fix that made
 * floor labels readable at all.
 *
 * A date tile is 0.56 m × 0.42 m, so the obvious element is square-ish. Lying on the floor and seen at
 * 16° above it, that square projects to a strip roughly four times wider than it is tall, and the
 * homography then squashes 10 px type into 2.5 px of screen. The transform was right and the text was
 * gone — E5's lesson, on a horizontal surface. Fitting the element box to the PROJECTED quad's own
 * edge lengths makes the homography near-unit-scale, so the type renders at its stated size and the
 * only distortion left is the perspective shear that belongs there.
 */
const fitElement = (screen: readonly { x: number; y: number }[]): { ew: number; eh: number } => {
  const len = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
  const p0 = screen[0]!, p1 = screen[1]!, p2 = screen[2]!, p3 = screen[3]!;
  return {
    ew: Math.max(1, Math.round(Math.max(len(p0, p1), len(p3, p2)))),
    eh: Math.max(1, Math.round(Math.max(len(p0, p3), len(p1, p2)))),
  };
};
/* 26 px, the floor E5 and E6 independently landed on: below it a word is a smear claiming to be a
   word. 15 px of HEIGHT is the separate constraint a horizontal surface adds — a strip 200 px wide and
   6 px tall passes the width test and holds no legible type at all. Two limits, two refusal codes. */
const MIN_W = 26, MIN_H = 15;

const shownQuads: { x: number; y: number }[][] = [];
const inQuad = (q: { x: number; y: number }[], x: number, y: number): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!;
    const crossZ = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(crossZ) < 1e-9) continue;
    const sg = crossZ > 0 ? 1 : -1;
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
  }
  return true;
};

interface Decided {
  key: string;
  proj: ReturnType<typeof projectQuad>;
  ew: number; eh: number;
  distance: number;
  shown: boolean;
  reason: string | null;
  widthPx: number; heightPx: number;
}
/*
 * DECIDE NEAR TO FAR, PAINT FAR TO NEAR. They are opposite orders and conflating them makes the test
 * report zero occlusions against a picture that visibly has them — E6 hit both halves of that. And the
 * overlap test is SYMMETRIC, because a big near label covers the MIDDLE of a small far one with
 * neither quad's corners inside the other.
 */
const decide = (key: string, corners: QuadCorners, centre: Vec3, veto: string | null): Decided => {
  const distance = Math.hypot(centre[0] - eye[0], centre[1] - eye[1], centre[2] - eye[2]);
  const probe = projectQuad(vpFinal, corners, CSS_W, CSS_H, 100, 100);
  if (isQuadRefusal(probe)) {
    return { key, proj: probe, ew: 0, eh: 0, distance, shown: false, reason: probe.refusal, widthPx: 0, heightPx: 0 };
  }
  const { ew, eh } = fitElement(probe.screen);
  const proj = projectQuad(vpFinal, corners, CSS_W, CSS_H, ew, eh);
  const backFacing = probe.signedArea <= 0;
  const reason = veto ?? (backFacing ? 'BACK_FACING'
    : ew < MIN_W ? 'EDGE_ON'
      : eh < MIN_H ? 'TOO_FLAT'
        : probe.screen.filter((c) => shownQuads.some((q) => inQuad(q, c.x, c.y))).length
          + shownQuads.reduce((n, q) => n + q.filter((c) => inQuad(
            probe.screen.map((v) => ({ x: v.x, y: v.y })), c.x, c.y,
          )).length, 0) >= 2 ? 'OCCLUDED' : null);
  const shown = reason === null && !isQuadRefusal(proj);
  if (shown) shownQuads.push(probe.screen.map((c) => ({ x: c.x, y: c.y })));
  return { key, proj, ew, eh, distance, shown, reason, widthPx: ew, heightPx: eh };
};

/* Channel labels first, near-to-far by construction: they stand at the calendar's near end, and they
   are what makes a lane mean a channel rather than a column. */
const channelDecisions = CHANNELS.map((name, c) => {
  const corners = uprightPanelCorners(laneX(c), zNearOfDay(0) + 0.04, FLOOR_TOP + 0.02, LANE_W, 0.15,
    Math.atan2(eye[0] - laneX(c), eye[2] - zNearOfDay(0)), 0.01);
  return {
    ...decide(`ch:${name}`, corners, [laneX(c), FLOOR_TOP + 0.09, zNearOfDay(0) + 0.04], null),
    name, total: Number(table[c]!.reduce((n, day, d) => (
      n + (dayState(d) === 'OBSERVED' ? day.reduce((a, v) => a + v, 0) : 0)
    ), 0).toFixed(2)),
  };
});

/* The date labels lie ON the floor gutter, which is the whole reason the gutter exists. Non-observed
   days get their state as the label rather than a date alone, so a hole is annotated at the hole. */
const dateDecisions = Array.from({ length: DAYS }, (_, d) => d).map((d) => {
  const st = dayState(d);
  const zN = zNearOfDay(d) - (DAY_M - TILE_D) / 2;
  const zF = zN - TILE_D;
  const y = FLOOR_TOP + 0.004;
  const corners: QuadCorners = {
    topLeft: [GUTTER_X - GUTTER_W / 2, y, zF],
    topRight: [GUTTER_X + GUTTER_W / 2, y, zF],
    bottomRight: [GUTTER_X + GUTTER_W / 2, y, zN],
    bottomLeft: [GUTTER_X - GUTTER_W / 2, y, zN],
  };
  /* An absent day has no tile for a label to lie on. It is vetoed here with its own code and marked in
     screen space below instead — the label is not missing, it has moved off a surface that is missing. */
  const veto = st === 'ABSENT' ? 'DAY_NOT_MEASURED' : null;
  return { ...decide(`day:${d}`, corners, [GUTTER_X, y, zMidOfDay(d)], veto), day: d, state: st };
})
  .sort((a, b) => a.distance - b.distance);

const groupBy = (rows: readonly { shown: boolean; reason: string | null }[]): Record<string, number> =>
  rows.filter((r) => !r.shown).reduce<Record<string, number>>((acc, r) => {
    const k = r.reason ?? 'UNKNOWN';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

for (const d of [...channelDecisions].sort((a, b) => b.distance - a.distance)) {
  if (!d.shown || isQuadRefusal(d.proj)) continue;
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:0;top:0;width:${d.ew}px;height:${d.eh}px;`
    + `transform-origin:0 0;transform:${d.proj.transform};display:flex;align-items:center;`
    + `justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;
  el.innerHTML = `<div style="font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.08em;`
    + `color:rgba(220,232,255,0.92);white-space:nowrap">${d.name}</div>`;
  overlay.appendChild(el);
}
for (const d of [...dateDecisions].sort((a, b) => b.distance - a.distance)) {
  if (!d.shown || isQuadRefusal(d.proj)) continue;
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:0;top:0;width:${d.ew}px;height:${d.eh}px;`
    + `transform-origin:0 0;transform:${d.proj.transform};display:flex;align-items:center;`
    + `justify-content:center;overflow:hidden;-webkit-font-smoothing:antialiased`;
  const tag = d.state === 'WITHHELD' ? 'WITHHELD' : `D${d.day}`;
  const colour = d.state === 'WITHHELD' ? '#B7C2D8' : 'rgba(200,216,244,0.88)';
  el.innerHTML = `<div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;`
    + `color:${colour};white-space:nowrap">${tag}</div>`;
  overlay.appendChild(el);
}

/* Screen-space markers, for the things that are NOT on a readable surface: the hole, the lids, the
   gate, and the week ruler past the point where a floor label refuses. */
const pill = (
  world: Vec3, text: string, colour: string, border: string,
): { onFrame: boolean; sx: number; sy: number } => {
  const p = projectScreen(vpFinal, world, CSS_W, CSS_H);
  const onFrame = !p.behind && p.sx > -60 && p.sx < CSS_W + 60 && p.sy > 0 && p.sy < CSS_H;
  if (onFrame) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${p.sx.toFixed(1)}px;top:${p.sy.toFixed(1)}px;`
      + `transform:translate(-50%,-50%);font:600 9.5px/1 ui-monospace,monospace;letter-spacing:.1em;`
      + `color:${colour};border:1px solid ${border};padding:3px 6px;white-space:nowrap;`
      + `background:rgba(6,10,18,0.72)`;
    el.textContent = text;
    overlay.appendChild(el);
  }
  return { onFrame, sx: Math.round(p.sx), sy: Math.round(p.sy) };
};

/* ANCHORED OFF THE RIGHT EDGE OF THE CALENDAR, not over its centre line. Centred, the three of them
   projected within forty pixels of each other and of the field's densest region, so the markers
   obscured exactly the thing they were annotating and each other. The week ruler owns the left margin,
   the state markers own the right. */
const MARK_X = LANE_HALF + 0.34;
const absentMarker = pill(
  [MARK_X, FLOOR_TOP + 0.22, zMidOfDay((Math.min(...ABSENT_DAYS) + Math.max(...ABSENT_DAYS)) / 2)],
  `D${Math.min(...ABSENT_DAYS)}-D${Math.max(...ABSENT_DAYS)} NOT MEASURED`,
  '#E0A94A', 'rgba(224,169,74,0.55)',
);
const withheldMarker = pill(
  [MARK_X, FLOOR_TOP + 0.22, zMidOfDay(firstWithheld + 0.5)],
  `D${firstWithheld}-D${Math.max(...WITHHELD_DAYS)} WITHHELD`,
  '#B7C2D8', 'rgba(183,194,216,0.5)',
);
const gateMarker = frontDay >= 0
  ? pill([MARK_X, FLOOR_TOP + 0.22, zNearOfDay(frontDay)],
    `REVIEW THRESHOLD ${REVIEW_THRESHOLD} · D${frontDay}`, '#9EC4FF', 'rgba(158,196,255,0.5)')
  : { onFrame: false, sx: 0, sy: 0 };

/*
 * THE WEEK RULER, AND THE REFUSAL IT CARRIES.
 *
 * Past the outage the accumulated reading is not available, so those ticks say so instead of quietly
 * continuing the scale. A ruler that looks the same on both sides of a hole is a ruler claiming the
 * hole is not there.
 */
const weekTicks = WEEK_DAYS.map((d) => {
  const readable = d - 1 <= integrableToDay;
  const world: Vec3 = [FLOOR_MIN_X - 0.10, FLOOR_TOP + 0.02, zNearOfDay(d)];
  const p = projectScreen(vpFinal, world, CSS_W, CSS_H);
  const onFrame = !p.behind && p.sx > -40 && p.sx < CSS_W && p.sy > 0 && p.sy < CSS_H;
  if (onFrame) {
    const el = document.createElement('div');
    /* PINNED TO THE LEFT MARGIN, y ONLY FROM THE PROJECTION. Following the floor's own left edge in x
       walked the ruler inward with depth — by D28 it sat 420 px in, on top of the front's brightest
       mass, which is where a scale is least readable and most in the way. x is the margin, y is the
       measurement. */
    el.style.cssText = `position:absolute;left:16px;`
      + `top:${p.sy.toFixed(1)}px;transform:translate(0,-50%);`
      + `font:500 10px/1.35 ui-monospace,monospace;letter-spacing:.07em;white-space:nowrap;`
      + `color:${readable ? 'rgba(196,212,240,0.85)' : '#E0A94A'}`;
    el.innerHTML = readable ? `D${d}` : `D${d}<br>NO INTEGRAL`;
    overlay.appendChild(el);
  }
  return { day: d, readable, onFrame, sx: Math.round(p.sx), sy: Math.round(p.sy) };
});

const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:18px;top:16px;display:flex;flex-direction:column;gap:7px';
hud.innerHTML =
  `<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;color:#8FB7FF">`
  + `MARKETING RISK · DEPTH IS DAYS AHEAD</div>`
  + `<div style="font:400 10.5px/1.55 ui-monospace,monospace;color:rgba(196,212,240,0.86)">`
  + `THE DEPTH OF COLOUR IS THE TOTAL RISK BETWEEN YOU AND THAT DAY<br>`
  + `${DAY_M} m PER DAY &nbsp;·&nbsp; ${RISK_TO_TAU} OPTICAL DEPTH PER RISK UNIT<br>`
  /* THE MIXING IS ON THE FRAME, not only in the report. The integral is exactly the risk along the line
     of sight, which is what the line above claims — but that line invites the reader to attribute it to
     one channel and one band, and a perspective ray does not stay in either. Printing the measured span
     is what stops the correct sentence being read as a stronger one. */
  + `A PIXEL INTEGRATES ~${perRay(daysSum).toFixed(0)} DAYS AND `
  + `~${perRay(bandsSum).toFixed(1)} BANDS — ONE CHANNEL ONLY DOWN THE AXIS<br>`
  + `INTEGRABLE TO D${integrableToDay} &nbsp;·&nbsp; CALENDAR VISIBLE TO D${DAYS - 1}`
  + `${volume ? '' : ' &nbsp;·&nbsp; FIELD NOT RENDERED'}</div>`
  + `<div style="font:500 10px/1.45 ui-monospace,monospace;color:#E0A94A">SYNTHETIC RISK DATA`
  + ` · ${FLAGGED.length} HAND-AUTHORED FLAGGED ITEMS`
  + `${volumeRefusal ? `<br>VOLUME REFUSED · ${volumeRefusal.split(' — ')[0]}` : ''}`
  + `${DEPTH_ON ? '' : '<br>SCENE DEPTH OFF — THE FIELD IS PAINTED OVER THE GEOMETRY'}</div>`;
overlay.appendChild(hud);

const dayCounts = {
  OBSERVED: Array.from({ length: DAYS }, (_, d) => d).filter((d) => dayState(d) === 'OBSERVED').length,
  ABSENT: ABSENT_DAYS.length,
  WITHHELD: WITHHELD_DAYS.length,
};
const legend = document.createElement('div');
legend.style.cssText = 'position:absolute;right:18px;bottom:16px;display:flex;flex-direction:column;'
  + 'gap:6px;align-items:flex-end;font:500 10.5px/1 ui-monospace,monospace';
/* NO SWATCH FOR THE MIDDLE OF THE RAMP. An earlier draft printed a hand-picked mauve for ELEVATED,
   which is a colour the renderer never produces — the ramp is a two-stop mix and its midpoint is
   whatever the shader computes. A gradient bar states the mapping without inventing a stop, and the
   bands are labelled by HEIGHT, because height is what encodes severity here and colour does not. */
legend.innerHTML =
  `<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;`
  + `color:rgba(196,212,240,0.85)">`
  + `<span>RISK IN THAT CELL — LOW TO HIGH</span>`
  + `<span style="width:132px;height:9px;display:inline-block;`
  + `background:linear-gradient(90deg,#2C6BFF,#FF8A3D);border:1px solid rgba(196,212,240,0.4)"></span>`
  + `</div>`
  + `<div style="color:rgba(196,212,240,0.85);text-align:right">SEVERITY IS HEIGHT<br>`
  + `<span style="opacity:.8">${[...BANDS].reverse().join(' / ')}</span></div>`
  + ([
    ['#101B2F', `OBSERVED · ${dayCounts.OBSERVED} days`],
    ['transparent', `NOT MEASURED · ${dayCounts.ABSENT} days — hole in the floor`],
    ['#6B7A99', `WITHHELD · ${dayCounts.WITHHELD} days — lid, measured, not shown`],
  ] as const).map(([c, t]) => (
    `<div style="display:flex;align-items:center;gap:7px;color:rgba(196,212,240,0.85)">`
    + `<span>${t}</span><span style="width:11px;height:11px;background:${c};`
    + `border:1px solid rgba(196,212,240,0.45);display:inline-block"></span></div>`
  )).join('');
overlay.appendChild(legend);

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
 * §6 RULE 5 — brand hex exact. It DIES rather than warns: a frame that has silently moved the brand
 * blue is worse than no frame, because it will be screenshotted into a deck. This harness adds a
 * second full-screen pass (the volume composite), which is exactly the kind of change that introduces
 * a second tone map, so running the check here rather than trusting a unit test is the point.
 */
const brandFailures = assertBrandFidelity();
if (brandFailures.length > 0) {
  const msg = 'BRAND FIDELITY FAILED — '
    + brandFailures.map((f) => `${f.key}: expected ${f.expected}, got ${f.actual}`).join('; ');
  document.title = 'REFUSED';
  log.textContent = msg;
  throw new Error(msg);
}

const offAxisDeg = (world: Vec3): number => {
  const d = normalise(sub(world, eye));
  return Number(((Math.acos(Math.max(-1, Math.min(1, d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2])))
    * 180) / Math.PI).toFixed(2));
};

const report = {
  /* WHICH TIER THIS FRAME IS, so the numbers beside it describe a configuration a reader can reconstruct.
     A tier that cannot be reported is a tier that cannot be trusted. */
  tier: Q.tier,
  tierDprScale: Q.dprScale,
  tierShadowMapSize: Q.shadowMapSize,
  /* Empty means every brand hex round-tripped exactly through this frame's own pipeline. */
  brandFidelity: brandFailures,
  volume: VOL_ON,
  volumeRefusal,
  sceneDepth: DEPTH_ON,
  ao: AO_ON,
  hdr: stage.hdr,
  eye: eye.map((v) => Number(v.toFixed(2))),

  /* ── THE HEADLINE PAIR. Two different horizons, and reporting one would claim more reach or less
     than the frame has. `integrableToDay` is where the accumulated reading stops; the calendar keeps
     going, which is why both numbers exist. */
  integrableToDay,
  visibleToDay: DAYS - 1,
  metresPerDay: DAY_M,
  calendarLengthM: CAL_LEN,
  riskToTau: RISK_TO_TAU,
  reviewThreshold: REVIEW_THRESHOLD,
  frontDay,
  frontRefusal,
  totalObservedRisk: Number(cumulative.toFixed(3)),

  /* ── THE THREE STATES, COUNTED SEPARATELY AND NEVER SUMMED. */
  days: dayCounts,
  absentDays: ABSENT_DAYS,
  withheldDays: WITHHELD_DAYS,
  /* How each state is RENDERED, named so a script can assert the states did not collapse into one
     another. If two of these are ever equal the frame has stopped distinguishing them. */
  absentRenderedAs: 'FLOOR_HOLE_PLUS_EDGE_RAILS',
  withheldRenderedAs: 'STEEL_LID_ON_INTACT_TILE',
  observedRenderedAs: 'TILE_PLUS_VOLUMETRIC_MASS',
  readingStates: Array.from({ length: DAYS }, (_, d) => d).reduce<Record<string, number>>((acc, d) => {
    const k = readingOf(d);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {}),
  flaggedItems: FLAGGED.length,
  /* Items that landed on a day nobody measured, so their weight is in no cell of the table. Named
     rather than dropped: an operator needs told that the outage swallowed real signal. */
  flaggedLostToNonObservedDays: flaggedOnNonObserved.length,

  /* ── THE FIELD ITSELF, so the picture and the data can be checked against each other. */
  gridSize: [GRID_X, GRID_Y, GRID_Z],
  gridVoxels: grid.length,
  fieldMin: Number(fMin.toFixed(5)),
  fieldMax: Number(fMax.toFixed(5)),
  fieldMean: Number((fSum / grid.length).toFixed(6)),
  fieldNonZeroVoxels: fNonZero,
  fieldOccupancyPct: Number(((100 * fNonZero) / grid.length).toFixed(2)),
  densityScale: Number(DENSITY_SCALE.toFixed(4)),
  maxCell: Number(MAX_CELL.toFixed(3)),
  /* Colour saturates here. Above it the ramp says nothing more; height and opacity still do. */
  rampSaturatesAtRiskUnits: Number(RAMP_SATURATION_RISK.toFixed(3)),
  cellsAboveRampSaturation,

  /* ── THE MARCH. §2 asks for worldStep, maxSteps and whether any ray truncated. */
  worldStep: WORLD_STEP,
  maxSteps: MAX_STEPS,
  marchReachM: Number((WORLD_STEP * MAX_STEPS).toFixed(2)),
  boxDiagonalM: Number(Math.hypot(
    BOX_MAX[0] - BOX_MIN[0], BOX_MAX[1] - BOX_MIN[1], BOX_MAX[2] - BOX_MIN[2],
  ).toFixed(2)),
  longestRayPlan: marchPlan(Math.hypot(
    BOX_MAX[0] - BOX_MIN[0], BOX_MAX[1] - BOX_MIN[1], BOX_MAX[2] - BOX_MIN[2],
  ), WORLD_STEP, MAX_STEPS),
  eyeRays: {
    sweep: `${SWEEP_X}x${SWEEP_Y}`,
    total: SWEEP_X * SWEEP_Y,
    hitBox,
    missedBox: SWEEP_X * SWEEP_Y - hitBox,
    /* Rays a solid cut short. Zero would mean the depth cap is decorative. */
    geometryCapped: capped,
    truncated: truncatedRays,
    tauMin: Number(tauMin.toFixed(4)),
    tauMax: Number(tauMax.toFixed(4)),
    tauMean: Number((tauSum / Math.max(1, hitBox)).toFixed(4)),
    alphaMax: Number((1 - Math.exp(-tauMax)).toFixed(3)),
  },

  /* ── DOES THE PICTURE INTEGRATE THE DATA? The one number that entitles E7 to exist. */
  axialCheck: {
    rays: axialRays.length,
    maxErrorPct: axialMaxErrorPct,
    meanErrorPct: axialMeanErrorPct,
    truncated: axialRays.filter((r) => r.truncated).length,
  },
  /* Where the exact reading degrades. Exact instrument = orthographic = a heatmap; these are what
     perspective costs, per ray that actually crosses the field. */
  eyeRayLaneDriftMax: Number(driftMax.toFixed(2)),
  eyeRayLaneDriftMean: perRay(driftSum),
  eyeRayDaysSpannedMax: Number(daysMax.toFixed(2)),
  eyeRayDaysSpannedMean: perRay(daysSum),
  eyeRayBandsSpannedMax: Number(bandsMax.toFixed(2)),
  eyeRayBandsSpannedMean: perRay(bandsSum),

  /* ── IS SCENE DEPTH LOAD-BEARING? Measured against a far-plane depth texture. */
  glOcclusionPixels: occlusion.pixels,
  glOcclusionPct: occlusion.pct,
  glOcclusionMeanDelta: occlusion.meanDelta,
  glOcclusionMaxDelta: occlusion.maxDelta,

  /* ── FRAMING, checked rather than eyeballed. Both must be inside the half-FOV. */
  halfFovDeg: Number((((view.fovDeg ?? 36) / 2)).toFixed(2)),
  nearEdgeOffAxisDeg: offAxisDeg([SCENE_X, 0, zNearOfDay(0)]),
  farEdgeOffAxisDeg: offAxisDeg([SCENE_X, 0, zNearOfDay(DAYS)]),

  /* ── THE DOM, grouped by REASON. "21 hidden" is useless; these lines are actionable. */
  channelLabels: { shown: channelDecisions.filter((d) => d.shown).length, refusedBy: groupBy(channelDecisions) },
  dateLabels: { shown: dateDecisions.filter((d) => d.shown).length, refusedBy: groupBy(dateDecisions) },
  weekTicksOffFrame: weekTicks.filter((t) => !t.onFrame).length,
  /* Week gridlines that would have crossed the hole. Never drawn, always counted. */
  weekBarsSuppressedForAbsence: WEEK_DAYS.length - weekBarDrawn.length,
  weekTicksRefusingIntegral: weekTicks.filter((t) => !t.readable).length,
  markersOnFrame: {
    absent: absentMarker.onFrame, withheld: withheldMarker.onFrame, gate: gateMarker.onFrame,
  },

  triangles: tris,
  tilesDrawn,
  tilesOmittedForAbsence: tilesOmitted,
  solids: solids.length,
  shadowMap: shadow.size,
  resolution: `${W}x${H}`,
  dprScale: SCALE,
  frames: FRAMES,
  msPerFrame: Number(ms.toFixed(3)),
  fps: Math.round(1000 / ms),
  glError: gl.getError(),

  /*
   * HEADROOM REFUSES ON A SOFTWARE RASTERISER. SwiftShader is a CPU rasteriser; comparing its frame
   * time to a 60 Hz budget measures a machine nobody ships on, and the ratio to real hardware is not a
   * constant. The frame time itself is still reported, because it IS a real measurement — of
   * SwiftShader.
   */
  renderer: RENDERER,
  rendererClass: SOFTWARE ? 'software' : 'hardware',
  headroom: SOFTWARE ? null : Number((16.6 - ms).toFixed(3)),
  headroomRefusal: SOFTWARE ? 'SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET' : null,
  /* Real-hardware timing for this environment is UNMEASURED. This harness has only ever run under
     SwiftShader; E0's and E8's M1 figures came from manual browser sessions. */
  hardwareMsPerFrame: null,

  axialRays,
  cumulativeByDay: cumulativeByDay.map((v) => Number(v.toFixed(2))),
  weekTicks,
};
(globalThis as unknown as { E7: typeof report }).E7 = report;

/*
 * THE PRINTED REPORT IS SUMMARISED; THE FULL ONE STAYS ON `globalThis`.
 *
 * `fullPage: true` screenshots the log along with the frame, and a pretty-printed per-ray table pushed
 * E6 past Chrome's capture height so `Page.captureScreenshot` failed outright — naming the screenshot
 * rather than the cause. A harness whose report grows with its data eventually cannot capture at all.
 */
const { axialRays: _ar, cumulativeByDay: _cd, weekTicks: _wt, ...summary } = report;
log.textContent = JSON.stringify(summary, null, 2)
  + `\n\naxialCheck per (channel, band) — ${axialRays.length} rays, full detail on globalThis.E7:\n`
  + axialRays.map((r) => (
    `  ${r.channel.padEnd(12)} b${r.band} expected ${String(r.expected).padStart(7)}`
    + ` measured ${String(r.measured).padStart(7)} err ${String(r.errorPct).padStart(5)}%`
  )).join('\n');
frame();
/* THE FALLBACK IS HIDDEN ONLY NOW, and only by CSS. A frame exists, so the table is redundant on
   screen — and it stays in the accessibility tree and the print path, where the canvas is opaque. */
fallback.markRendered();
document.title = 'READY';
