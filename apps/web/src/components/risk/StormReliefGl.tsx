/**
 * E7 THE STORM, as a product component rather than a harness.
 *
 * `docs/3d/e7` proved the environment; this is the part that ships. It marches the SAME `RiskField` the
 * flat `RiskCalendar` tabulates — one object, two drawings — which is what makes the two comparable at
 * all, and it is the only reason a volumetric belongs in front of an operator.
 *
 * ── WHAT MAKES THIS A READING AND NOT WEATHER ────────────────────────────────────────
 * `createVolumeField` has no procedural noise term by construction: the density grid is UPLOADED from a
 * `Float32Array` this file builds out of measured cells, and the shader's only job is to integrate it.
 * There is nowhere for a plausible shape to sneak in. Front-to-back accumulation makes
 * `alpha = 1 - exp(-tau)` exact, and the grid is scaled so the integral across one day of one channel in
 * one band equals that cell's risk times `RISK_TO_TAU` — so *the depth of colour here is the total risk
 * between you and that day* is a unit conversion. `docs/3d/e7` checks it on the CPU with the engine's own
 * exported `rayBoxSlab`/`marchPlan` and agrees with the sum of the table to 0.00% on all 21 axial rays.
 *
 * Nothing here adds curl noise, rotation or drift. §2 asks for "rotation"; there is no measured
 * rotational quantity, so there is no rotational term, and that absence is deliberate.
 *
 * ── THIS FILE IS ONLY EVER REACHED THROUGH A LAZY IMPORT ─────────────────────────────
 * `StormRelief` imports it with `lazy()`, so none of it — nor any of `@lcx/gl` — lands in the initial
 * bundle. The env layer alone is 35.7 KB against single-digit KB of budget headroom.
 *
 * ── AN ABSENT DAY IS A HOLE, NEVER A ZERO ────────────────────────────────────────────
 * A density field is a scalar and zero means NO RISK. There is no value that means "we did not look", so
 * an unmeasured day is not represented in the density at all: the refusal is carried by the FLOOR —
 * omitted tiles, a fence of posts at each edge of the gap, a suppressed week gridline — and by the flat
 * calendar's own counts. Writing zero into those voxels would state, in the most convincing way this
 * renderer has, that the days nobody measured were calm.
 *
 * ── IT REFUSES RATHER THAN DEGRADING, AND THE CALLER SHOWS THE CALENDAR ──────────────
 * Every resource is checked. On any refusal this renders NOTHING and calls `onRefused` with the code, and
 * the parent falls back to `RiskCalendar` — §6 rule 1, and the reason the parent owns the fallback: a
 * component that cannot construct its renderer cannot be trusted to draw its own escape hatch.
 *
 * `OES_texture_float_linear` is the one refusal peculiar to this environment. Without it a float
 * `sampler3D` silently drops to NEAREST and the field renders as axis-aligned voxel blocks, which looks
 * like a deliberate aesthetic and would ship as one — so the layer refuses, and this component refuses
 * WHOLE rather than drawing a calendar floor with no accumulation on it. A storm view with the
 * accumulation removed is strictly worse than the calendar it replaced, and the calendar is one state
 * change away.
 */
import { useEffect, useRef } from 'react';
import {
  createStage, isStage, box, uploadMesh, createLitRenderer, createTarget3D, createShadowMap,
  createVolumeField, viewProjection, eyeOf, lightViewProjection, boundsCentre, boundsRadius,
  hexToLinear, assertBrandFidelity, IDENTITY, sub, cross, normalise,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  qualitySettings, shadowMapSizeFor, pickQualityTier,
  type LitDraw, type MeshBuffer, type Viewpoint, type Vec3,
} from '@lcx/gl';
import {
  useResolvedQualityTier, needsQualityProbe, measureFrameMs, recordQualityProbe,
} from '../shared/useQualityTier';
import type { RiskField } from './riskField';
import { BAND_H, DAY_M, MAX_STEPS, RISK_TO_TAU, WORLD_STEP, ELEVATION_DEG } from './stormCalibration';

export interface StormReliefGlProps {
  readonly field: RiskField;
  readonly heightPx: number;
  /** Called with a stable code when the renderer cannot draw. The parent then shows the calendar. */
  readonly onRefused: (code: string) => void;
}

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
 * THE VOLUME GOES INTO ITS OWN TARGET AND IS COMPOSITED, AND THAT IS NOT AN OPTIMISATION.
 *
 * The march samples the scene's DEPTH texture, which is the depth attachment of the scene framebuffer —
 * so drawing the volume straight into the scene target while sampling its own depth is a feedback loop.
 * WebGL2 does not leave that undefined: it raises INVALID_OPERATION and draws nothing, and the layer now
 * returns a FEEDBACK_LOOP refusal rather than issuing a draw the driver will discard.
 *
 * The composite carries premultiplied colour and coverage, so it blends ONE / ONE_MINUS_SRC_ALPHA and
 * does NOT tone map: the present pass owns the only tone map in the pipeline.
 */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVolume;
out vec4 frag;
void main(){ frag = texture(uVolume, vUv); }`;

/* ── The calendar, in metres. Every number is a unit conversion, not a taste. ── */
const NOW_OFFSET = 2.6;
const LANE_PITCH = 0.62;
const LANE_W = 0.46;
/* A 2.5 cm PLATE, NOT A 6 cm SLAB. With 6 cm tiles a line of sight entering the gap at 21° has to run
   15.6 cm to clear the edge, so no ray through any gap ever reached the void behind the floor and the
   calendar rendered as smooth strips with no day gridlines at all. */
const TILE_T = 0.025;
const TILE_D = DAY_M * 0.78;
const GUTTER_W = 0.56;
const FLOOR_TOP = TILE_T / 2;
/* Four voxels per day, and the march step equals the voxel pitch (DAY_M / 4 === WORLD_STEP). That is
   what makes the midpoint rule land on voxel centres and conserve the integral; change either number on
   its own and the 0.00% axial agreement stops being zero. */
const VOX_PER_DAY = 4;
const VOX_PER_BAND = 14;
const VOX_X_PITCH = 0.055;
/* An 8 GB M1 is genuinely tight and a 3-D float texture is the largest thing this environment allocates.
   Refused rather than silently coarsened, because coarsening breaks the integral the whole reading rests
   on. 2 M voxels is 8 MB as R32F — E7's own field is 357,504. */
const MAX_VOXELS = 2_000_000;
const BAND_PLATEAU = 0.62;
/**
 * THIS SCENE'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * `env/quality.ts:91` records why: wiring the ladder in with the tier's ABSOLUTE `shadowMapSize` silently
 * enlarged three environments — E0, E2 and E8 had each chosen 1024 and were handed 1536 at the default tier, a
 * 2.25x bigger map and three captures that changed without anyone saying so.
 */
const SHADOW_BASELINE = 1024;

export default function StormReliefGl({ field, heightPx, onRefused }: StormReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* Subscribed rather than read once: this surface renders one frame into an offscreen target and only then
     blits it, so a resolved lower tier can rebuild the scene before anything has been painted. */
  const tier = useResolvedQualityTier();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const lanes = field.lanes.length;
    const bands = field.bands.length;
    const days = field.days.length;
    if (lanes === 0 || bands === 0 || days === 0) { onRefused('EMPTY_FIELD'); return; }
    if (field.observedDays === 0) { onRefused('NO_OBSERVED_DAYS'); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone
     * map there is no point rendering: the frame would be off-brand by an amount too small to see and too
     * large to be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    const laneX = (c: number): number => (c - (lanes - 1) / 2) * LANE_PITCH;
    const LANE_HALF = laneX(lanes - 1) + LANE_W / 2;
    const GUTTER_X = laneX(0) - LANE_W / 2 - 0.03 - GUTTER_W / 2;
    const FLOOR_MIN_X = GUTTER_X - GUTTER_W / 2;
    /* The camera is offset so the floor INCLUDING its date gutter is centred; centring on the lanes alone
       pushed the gutter into the left margin. */
    const SCENE_X = (FLOOR_MIN_X + LANE_HALF) / 2;
    const zNearOfDay = (d: number): number => -NOW_OFFSET - d * DAY_M;
    const zMidOfDay = (d: number): number => zNearOfDay(d) - DAY_M / 2;

    const FIELD_Y0 = FLOOR_TOP + 0.02;
    const FIELD_Y1 = FIELD_Y0 + bands * BAND_H;
    const bandCentreY = (b: number): number => FIELD_Y0 + (b + 0.5) * BAND_H;

    const BOX_MIN: [number, number, number] = [-LANE_HALF, FIELD_Y0, zNearOfDay(days)];
    const BOX_MAX: [number, number, number] = [LANE_HALF, FIELD_Y1, zNearOfDay(0)];

    const GRID_X = Math.max(2, Math.round((2 * LANE_HALF) / VOX_X_PITCH));
    const GRID_Y = Math.max(2, bands * VOX_PER_BAND);
    const GRID_Z = Math.max(2, days * VOX_PER_DAY);
    if (GRID_X * GRID_Y * GRID_Z > MAX_VOXELS) { onRefused('FIELD_TOO_LARGE_FOR_EXACT_INTEGRAL'); return; }

    /* DPR CAPPED BY THE TIER, where it was a literal 2. Two full-resolution HDR targets and a raymarch are
       all fill-bound, so resolution is the largest single thing the ladder can drop here: `Q.dprScale` is 2 at
       `full` and `reduced` and 1 at `minimum`. */
    const Q = qualitySettings(tier);
    const dpr = Math.min(Q.dprScale, Math.max(1, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 640;
    const W = Math.round(cssW * dpr), H = Math.round(heightPx * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    const refuse = (code: string): void => {
      /* REVERSE, AND THE STAGE LAST. It owns the context; releasing it first leaves every other delete*
         operating on a dead context — silent rather than fatal, and it leaks on every remount. */
      for (const d of disposers.reverse()) d();
      stage.dispose();
      onRefused(code);
    };

    const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
    if ('kind' in present) { refuse(present.code); return; }
    const composite = stage.compile(PRESENT_VERT, COMPOSITE_FRAG);
    if ('kind' in composite) { refuse(composite.code); return; }
    const lit = createLitRenderer(stage);
    if ('kind' in lit) { refuse(lit.code); return; }
    disposers.push(() => lit.dispose());
    const target = createTarget3D(stage, W, H);
    if ('kind' in target) { refuse(target.code); return; }
    disposers.push(() => target.dispose());
    const volTarget = createTarget3D(stage, W, H);
    if ('kind' in volTarget) { refuse(volTarget.code); return; }
    disposers.push(() => volTarget.dispose());
    const shadow = createShadowMap(stage, shadowMapSizeFor(tier, SHADOW_BASELINE));
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());

    /* The one refusal peculiar to this environment, and it is fatal here on purpose — see the header. */
    const volume = createVolumeField(stage, GRID_X, GRID_Y, GRID_Z);
    if ('kind' in volume) { refuse(volume.code); return; }
    disposers.push(() => volume.dispose());

    /*
     * ── THE FIELD, EVALUATED PER VOXEL FROM THE CELLS. Three resampling rules, each stated because each
     * one is a place a lie could hide:
     *
     *   x — piecewise constant per lane, HARD ZERO in the gaps. Channels are categories; interpolating
     *       risk across the gap between two of them would invent a channel that does not exist.
     *   z — piecewise constant per day. The field STEPS AT MIDNIGHT, because a day is a measurement
     *       bucket and a volume flowing smoothly across the boundary would assert intra-day structure
     *       nobody measured.
     *   y — a PLATEAU across the middle 62% of the band, tapering to zero at its edges. A tent peaking at
     *       the band centre under-reported every axial ray by 7.1% in E7 — the centre falls exactly
     *       between two voxel centres — and it was also the wrong statement: within a severity band there
     *       IS no gradation.
     */
    const laneOfX = (x: number): number => {
      for (let c = 0; c < lanes; c++) if (Math.abs(x - laneX(c)) <= LANE_W / 2) return c;
      return -1;
    };
    const dayOfZ = (z: number): number => {
      const d = Math.floor((-z - NOW_OFFSET) / DAY_M);
      return d >= 0 && d < days ? d : -1;
    };
    const bandOfY = (y: number): number => {
      const b = Math.floor((y - FIELD_Y0) / BAND_H);
      return b >= 0 && b < bands ? b : -1;
    };
    const maxCell = field.maxCell;
    const fieldAt = (x: number, y: number, z: number): number => {
      const c = laneOfX(x); if (c < 0) return 0;
      const d = dayOfZ(z); if (d < 0) return 0;
      /* NOT ZERO BECAUSE IT IS CALM — zero because there is no value that means "we did not look", and
         the floor carries that refusal instead. */
      if (field.days[d]!.state !== 'observed') return 0;
      const b = bandOfY(y); if (b < 0) return 0;
      const cell = field.cell(c, d, b);
      if (cell === null || cell <= 0) return 0;
      const s = Math.abs(y - bandCentreY(b)) / (BAND_H / 2);
      const profile = Math.max(0, Math.min(1, (1 - s) / (1 - BAND_PLATEAU)));
      return profile <= 0 ? 0 : (cell * profile) / maxCell;
    };

    const grid = new Float32Array(GRID_X * GRID_Y * GRID_Z);
    for (let iz = 0; iz < GRID_Z; iz++) {
      const z = BOX_MIN[2] + ((iz + 0.5) / GRID_Z) * (BOX_MAX[2] - BOX_MIN[2]);
      for (let iy = 0; iy < GRID_Y; iy++) {
        const y = BOX_MIN[1] + ((iy + 0.5) / GRID_Y) * (BOX_MAX[1] - BOX_MIN[1]);
        for (let ix = 0; ix < GRID_X; ix++) {
          const x = BOX_MIN[0] + ((ix + 0.5) / GRID_X) * (BOX_MAX[0] - BOX_MIN[0]);
          grid[ix + GRID_X * (iy + GRID_Y * iz)] = fieldAt(x, y, z);
        }
      }
    }
    let nonZero = 0;
    for (const v of grid) if (v > 0) nonZero++;
    /* AN EMPTY GRID IS A REFUSAL, not a clear frame. It means every observed cell resampled to nothing,
       and a transparent volume over a calendar reads as "no risk ahead". */
    if (nonZero === 0) { refuse('FIELD_RESAMPLED_TO_EMPTY'); return; }
    volume.upload(grid);

    /* density × DAY_M must equal cell × RISK_TO_TAU. This is the whole calibration. */
    const DENSITY_SCALE = (maxCell * RISK_TO_TAU) / DAY_M;

    /* ── The floor, and the three states made physical. ── */
    const tileGeo = box(LANE_W, TILE_T, TILE_D);
    const gutterGeo = box(GUTTER_W, TILE_T, TILE_D);
    const lidGeo = box(2 * LANE_HALF, 0.42, TILE_D);
    const railGeo = box(2 * LANE_HALF + GUTTER_W + 0.06, 0.1, 0.05);
    const weekGeo = box(2 * LANE_HALF, 0.07, 0.05);
    /* THE GATE IS A FENCE, NOT A WALL. A slab across the calendar removed everything in the lower band
       beyond it; posts on the lane boundaries occlude eight thin strips instead. */
    const gateGeo = box(2 * LANE_HALF, 0.11, 0.05);
    const postGeo = box(0.075, 1.05, 0.075);

    /*
     * UPLOADED ONE AT A TIME, EACH REGISTERED FOR DISPOSAL BEFORE THE NEXT IS ATTEMPTED — and this file
     * shipped without the registration at all, which is the reason the loop is written this way now rather
     * than as a `.map()` with the check afterwards.
     *
     * `uploadMesh` creates a VAO and four buffers and hands back the ONLY thing that frees them; `Stage`
     * tracks its programs and its own targets and knows nothing about a mesh. Seven meshes therefore meant
     * seven vertex arrays and twenty-eight buffers stranded on the GPU on every unmount — and this component
     * unmounts every time a reader toggles back to the calendar, so the leak was per toggle rather than per
     * session. Nothing errors, nothing is visible, and the frame is correct: the only symptom is a context
     * that grows until the browser drops it, at which point `webglcontextlost` fires and the refusal names
     * the wrong cause.
     *
     * Mapping first and checking after has a second failure on top of the first: a refusal on the seventh
     * upload leaves the six that succeeded with no disposer recorded, so even a correct cleanup could not
     * reach them.
     */
    const uploaded: MeshBuffer[] = [];
    for (const g of [tileGeo, gutterGeo, lidGeo, railGeo, weekGeo, gateGeo, postGeo]) {
      const m = uploadMesh(stage, g);
      if ('kind' in m) { refuse(m.code); return; }
      uploaded.push(m);
      disposers.push(() => m.dispose());
    }
    const [tileMesh, gutterMesh, lidMesh, railMesh, weekMesh, gateMesh, postMesh] = uploaded;

    const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const modelOf = (x: number, y: number, z: number): Float32Array => {
      /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0, every vertex collapses to the
         origin, and the frame is a clear colour with no error anywhere. It cost E0 a day. */
      const m = IDENTITY();
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    };

    const MAT = {
      /* Lifted from #101B2F: against that tile the day gaps were within 0.02 of linear radiance of the
         void behind the floor, so the gridlines vanished and the lanes read as smooth strips. */
      tile: { baseColour: hexToLinear('#22315A'), roughness: 0.74, metalness: 0.03 },
      gutter: { baseColour: hexToLinear('#131E36'), roughness: 0.84, metalness: 0 },
      withheldTile: { baseColour: hexToLinear('#1B2540'), roughness: 0.55, metalness: 0.1 },
      /* Steel, ROUGH not polished. A withheld day is neither calm nor bad — it is the absence of a
         reading — so giving it a colour from the risk ramp would assert a finding nobody is entitled to;
         and at roughness 0.28 the two objects whose whole job is to mark a REFUSAL came back as the
         brightest things in the frame. */
      lid: { baseColour: hexToLinear('#6B7A99'), roughness: 0.62, metalness: 0.35 },
      rail: { baseColour: hexToLinear('#6B7A99'), roughness: 0.58, metalness: 0.25 },
      week: { baseColour: hexToLinear('#26355A'), roughness: 0.6, metalness: 0.05 },
      gate: { baseColour: hexToLinear('#2C6BFF'), roughness: 0.52, metalness: 0.06 },
    } as const;

    const draws: LitDraw[] = [];
    const add = (mesh: typeof tileMesh, x: number, y: number, z: number, material: LitDraw['material']): void => {
      draws.push({ mesh: mesh!, model: modelOf(x, y, z), normalMat: N3, material });
    };

    for (let d = 0; d < days; d++) {
      const st = field.days[d]!.state;
      const z = zMidOfDay(d);
      if (st === 'not_measured') {
        /* NO TILE. The hole IS the refusal, and it runs the full width of the calendar so it cannot be
           read as one channel going quiet. */
        continue;
      }
      add(gutterMesh, GUTTER_X, 0, z, MAT.gutter);
      for (let c = 0; c < lanes; c++) {
        add(tileMesh, laneX(c), 0, z, st === 'withheld' ? MAT.withheldTile : MAT.tile);
      }
      if (st === 'withheld') add(lidMesh, 0, FLOOR_TOP + 0.21, z, MAT.lid);
    }

    /*
     * EVERY HOLE IS FENCED AT BOTH ENDS, and a low rail alone was not enough: read at 16 m two 10 cm
     * rails were a pair of faint lines and the gap read as the calendar simply being darker there. The
     * posts are also what give the depth cap some geometry to bite on inside the volume.
     */
    for (let d = 0; d < days; d++) {
      if (field.days[d]!.state !== 'not_measured') continue;
      const startsRun = d === 0 || field.days[d - 1]!.state !== 'not_measured';
      const endsRun = d === days - 1 || field.days[d + 1]!.state !== 'not_measured';
      const edges: number[] = [];
      if (startsRun) edges.push(zNearOfDay(d) + 0.02);
      if (endsRun) edges.push(zNearOfDay(d + 1) - 0.02);
      for (const z of edges) {
        add(railMesh, SCENE_X, FLOOR_TOP + 0.05, z, MAT.rail);
        for (let c = 0; c <= lanes; c++) {
          add(postMesh, laneX(0) - LANE_PITCH / 2 + c * LANE_PITCH, FLOOR_TOP + 0.525, z, MAT.rail);
        }
      }
    }

    /*
     * A WEEK GRIDLINE IS SUPPRESSED WHERE IT WOULD BRIDGE A HOLE. A solid rib across an unmeasured gap
     * fills in the one piece of geometry whose entire job is to be missing — the same class of error as
     * writing zero into the density.
     */
    for (let d = 7; d < days; d += 7) {
      const before = field.days[d - 1]!.state;
      const after = field.days[d]!.state;
      if (before === 'not_measured' || after === 'not_measured') continue;
      add(weekMesh, 0, FLOOR_TOP + 0.035, zNearOfDay(d), MAT.week);
    }

    if (field.frontDay !== null) {
      const gz = zNearOfDay(field.frontDay);
      add(gateMesh, 0, FLOOR_TOP + 0.055, gz, MAT.gate);
      for (let c = 0; c <= lanes; c++) {
        add(postMesh, laneX(0) - LANE_PITCH / 2 + c * LANE_PITCH, FLOOR_TOP + 0.525, gz, MAT.gate);
      }
    }

    /*
     * THE CAMERA. 21.3° with the eye far enough back to put the near edge of day 0 and the far edge of
     * the last day SYMMETRICALLY about the view axis. E7's first framing was 15.3° and it fitted — the
     * way a corridor fits when you stand on its centre line: everything present, nothing readable.
     * 33° rather than 36 because a longer lens compresses depth less, so the far weeks hold their size.
     */
    const CAL_LEN = days * DAY_M;
    const NEAR = 2.5, FAR = Math.max(24, CAL_LEN * 2.3);
    const view: Viewpoint = {
      target: [SCENE_X, FIELD_Y0 + bands * BAND_H * 0.2, zMidOfDay(days * 0.183)],
      distance: Math.max(6, Math.min(20, CAL_LEN * 0.715)),
      azimuthDeg: 0, elevationDeg: ELEVATION_DEG, fovDeg: 33, near: NEAR, far: FAR,
    };
    const eye = eyeOf(view);
    const forward = normalise(sub(view.target as Vec3, eye));
    const camRight = normalise(cross(forward, [0, 1, 0]));
    const camUp = normalise(cross(camRight, forward));
    const ASPECT = W / H;

    const lightDir: [number, number, number] = [0.44, -0.66, -0.61];
    const sceneMin: [number, number, number] = [FLOOR_MIN_X - 0.2, 0, zNearOfDay(days) - 0.3];
    const sceneMax: [number, number, number] = [LANE_HALF + 0.2, FIELD_Y1, -NOW_OFFSET + 0.3];
    const lightVP = lightViewProjection(
      { direction: lightDir, colour: [1, 1, 1], extent: Math.max(6, CAL_LEN * 0.68) },
      boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
    );

    const CLEAR = hexToLinear('#070B14');
    /* Darker than the default sky on every stop. A volumetric composited over a lifted floor reads as
       haze over daylight rather than as accumulated risk, so the environment is dimmed rather than the
       volume brightened. */
    const SKY = {
      zenith: [0.01, 0.014, 0.03] as [number, number, number],
      horizon: [0.03, 0.044, 0.08] as [number, number, number],
      ground: [0.006, 0.007, 0.012] as [number, number, number],
    };
    /*
     * BOTH ENDS OF THE RAMP ARE LEGIBILITY DECISIONS AND THEY FAIL IN OPPOSITE DIRECTIONS. At 2.2× the
     * brand blue the baseline haze — which covers every observed day of every channel — was eight times
     * brighter than the floor tile it sat on, and the calendar disappeared underneath its own field. At
     * 2.6× the high end clipped nine days of escalating severity into one flat blob. 0.55× and 1.45×.
     */
    const LOW = hexToLinear('#2C6BFF');
    const HIGH = hexToLinear('#FF8A3D');
    const COL_LOW: [number, number, number] = [LOW[0] * 0.55, LOW[1] * 0.55, LOW[2] * 0.55];
    const COL_HIGH: [number, number, number] = [HIGH[0] * 1.45, HIGH[1] * 1.45, HIGH[2] * 1.45];

    /*
     * ONE FRAME, THEN NOTHING. §6 rule 2 forbids idle animation — there is no `requestAnimationFrame` and
     * no `setInterval` here at all, which is also why the reduced-motion case needs no branch: a still
     * frame is already the final frame.
     */
    const vp = viewProjection(view, ASPECT);
    /*
     * A FUNCTION NOW, SO IT CAN BE MEASURED. It ends with `target` bound, which is what `probeSync` requires —
     * a `readPixels` only guarantees completion of work affecting the framebuffer it reads, and both halves of
     * this frame land in offscreen HDR targets.
     */
    const renderScene = (): { code: string } | undefined => {
      lit.shadowPass(lightVP, draws, shadow);
      target.bind();
      gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      lit.depthPrepass(vp, draws);
      lit.draw({
        viewProj: vp, eye, lightDir, lightColour: [2.05, 2.0, 1.92],
        ambientGain: 0.62, sky: SKY, lightVP, shadow, shadowStrength: 0.92, shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws,
        ao: null, screenSize: [W, H],
      });

      volTarget.bind();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const failed = volume.draw({
        eye, forward, right: camRight, up: camUp,
        fovDeg: view.fovDeg ?? 33, aspect: ASPECT, near: NEAR, far: FAR,
        /* The SCENE's depth, from a DIFFERENT framebuffer than the one being drawn into. Marching only as
           far as the depth buffer says the ray is unoccluded is the difference between a volume that is IN
           the scene and a wash over the lens. */
        sceneDepth: target.depthTexture,
        boxMin: BOX_MIN, boxMax: BOX_MAX,
        /*
         * `maxSteps` IS NOT A QUALITY KNOB HERE, AND THE TIER IS DELIBERATELY NOT ALLOWED TO TOUCH IT.
         *
         * `env/quality.ts` USED TO OFFER `volumeMaxSteps` (128/96/48), and applying it would have looked like a saving and
         * be a data change. `volume.ts:230` caps the view-ray march at `uMaxSteps`, so the step count fixes
         * `MARCH_REACH_M = WORLD_STEP * MAX_STEPS` = 16.0 m — and `stormCalibration.ts` PRINTS that reach to
         * the operator in `calibrationSentence`. At 48 steps the reach is 6.0 m, the far side of the field is
         * truncated, and distant days show less risk than they have while the sentence under the frame still
         * claims 16.0 m. That is the "gaps never zeros" rule with the sign flipped.
         *
         * `lightSteps` IS a look knob and does follow the tier: `volume.ts:200-210` feeds it only to
         * `lightTransmittance`, which modulates accumulated RADIANCE. `alpha` — the channel this reading
         * assigns to magnitude — never sees it, so dropping the self-shadow march costs depth in the cloud
         * and costs the reading nothing.
         * THE FIELD IS NOW DELETED (2026-08-13), so this refusal is structural rather than a promise in a
         * comment: steps are REACH at a fixed world step, not quality. E7's box is 14.00 m in z and the
         * printed `marchReachM` claims 16.0; 96 steps reach 12.0 m and 48 reach 6.0 m, so both truncate
         * while the sentence still says 16.0. Distant days would read as lower risk than they are.
         */
        worldStep: WORLD_STEP, maxSteps: MAX_STEPS, densityScale: DENSITY_SCALE,
        colourLow: COL_LOW, colourHigh: COL_HIGH,
        lightDir, lightSteps: Math.min(6, Q.volumeLightSteps), emission: 0.26,
      });
      if (failed !== undefined) return failed;

      target.bind();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, volTarget.texture);
      stage.blit(composite, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uVolume'), 0));
      gl.disable(gl.BLEND);
      return undefined;
    };

    /* THE REFUSAL CHECK RUNS ON A REAL FRAME, BEFORE THE PROBE. A march that refused produces a frame that is
       not this scene, and timing it would resolve the page load's tier from a broken picture. */
    const marched = renderScene();
    if (marched !== undefined) { refuse(marched.code); return; }

    /*
     * THE PROBE. `pickQualityTier` exists to choose a tier from a measured frame and had no caller in the repo;
     * this is one. It takes its own discarded warm-up frame — the first frame pays shader upload and charging
     * that to the GPU would downgrade every machine — then two sync-bounded samples of which the cheaper is
     * used, because one sample can catch a GC pause and a single unlucky 40 ms would drop a fast machine for
     * the rest of the page load. At most one mount per page load pays for it.
     */
    if (needsQualityProbe()) {
      const ms = measureFrameMs(gl, renderScene);
      const r = recordQualityProbe({
        pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'StormReliefGl',
      });
      /* A LOWER TIER MEANS THIS BUILD IS STALE. Nothing is presented; the effect re-runs on the new tier and
         the first thing the reader sees is the resolved tier rather than a frame that then changes. */
      if (r.tier !== tier) {
        return () => {
          for (const d of disposers.reverse()) d();
          stage.dispose();
        };
      }
      /* NO REDRAW HERE. The probe's last timed sample left a complete frame in `target`, and nothing in this
         scene depends on the clock, so the frame about to be presented is byte-identical to one that a fifth
         render would produce. A fifth render would only make the probe's cost visible. */
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
    /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted. */
    canvas.dataset.qualityTier = tier;

    const err = gl.getError();
    if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return; }

    /*
     * CONTEXT LOSS RESOLVES TO THE CALENDAR. Without this the canvas keeps its last frame on screen for
     * ever while the GPU has dropped the context — a stale picture presented as live data, which is worse
     * than no picture. Registered on the canvas rather than the document so it cannot fire for someone
     * else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST — it owns the context, and this component remounts whenever a reader toggles it. */
      stage.dispose();
    };
    /* `tier` IS A DEPENDENCY, and that is the rebuild mechanism: a resolved lower tier tears this context down
       and builds the storm again at it. */
  }, [field, heightPx, onRefused, tier]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${heightPx}px`, display: 'block' }}
      /* The storm is the same measurements the calendar carries, so it is not announced twice; the
         figure's own caption and the flat calendar underneath it are what a screen reader reads. */
      aria-hidden="true"
    />
  );
}
