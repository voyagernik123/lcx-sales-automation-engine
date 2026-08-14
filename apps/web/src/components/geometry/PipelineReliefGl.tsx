/**
 * E3 THE PIPELINE, as a product component rather than a harness.
 *
 * `docs/3d/e3` proved the environment; this is the part that ships. Every quantity it draws comes from
 * `buildChannel` — the same object the caption beside the frame is printed from — so the picture and the
 * number cannot disagree, which is the property E3's README is built around.
 *
 * ── THE READING A BAR LIST CANNOT GIVE ───────────────────────────────────────────────
 * A stalled lead sits LOWER in the channel. Value, stage and movement are three columns of one row in
 * `LeadTable`, sortable one at a time, so the quantity an operator actually wants — how much market cap has
 * cleared the warm gate and then stopped moving — takes two sorts and arithmetic there. Here it is the large
 * objects lying on the deck in the near half of the channel, and the caption prints the figure the shape shows.
 *
 * ── THIS FILE IS ONLY EVER REACHED THROUGH A LAZY IMPORT ─────────────────────────────
 * `PipelineRelief` imports it with `lazy()`, so neither it nor any of `@lcx/gl` lands in the initial bundle.
 * The perf budget measures RAW pre-gzip initial JS against 850 KB with roughly 11 KB of headroom for the whole
 * application, and the environment layer alone is 35.7 KB. An eager import would spend all of it and more, on a
 * view most readers never open.
 *
 * ── IT REFUSES RATHER THAN DEGRADING, AND THE CALLER SHOWS THE TABLE ─────────────────
 * Every resource is checked. On any refusal — no WebGL2, a failed shader, a refused float target, a missing
 * extension, a brand-fidelity failure, a dataset the derivation would not accept, or a lost context — this
 * calls `onRefused` with a code and the parent falls back to `LeadTable`. §6 rule 1, and the reason the parent
 * owns the fallback: a component that cannot construct its renderer cannot be trusted to draw its own escape
 * hatch.
 *
 * ── WHAT IS DELIBERATELY NOT HERE, AND WHY ───────────────────────────────────────────
 * · NO PARTICLE STREAMS. The harness maps one particle to $800 of package value crossing a gate inside a
 *   90-day window, which needs an observed FLOW. `BdPipeline` has no flow: there is no per-gate throughput and
 *   no window on a `BdLead`, so a stream here would be a rate this page never measured, primed to steady state
 *   to make it look measured. E3's second reading is not promoted because its input does not exist yet.
 * · NO PER-OBJECT LABELS. The harness projects a tag per deal and refuses the occluded ones. Here the flat
 *   table is one click away and carries every name, cap and date in the DOM, so the caption carries the axis
 *   and the table carries the identities — §6 rule 4 without a screen-space occlusion test in a product.
 * · NO ANIMATION AT ALL. One frame, then nothing: no `requestAnimationFrame`, no interval. §6 rule 2, and it
 *   is also why reduced motion needs no branch — a still frame is already the final frame.
 */
import { useEffect, useRef } from 'react';
import {
  createStage, isStage, box, plane, sphere, torus, uploadMesh,
  createLitRenderer, createTarget3D, createShadowMap, createAmbientOcclusion, createLineBatch,
  viewProjection, eyeOf, lightViewProjection, boundsCentre, boundsRadius,
  hexToLinear, mixLinear, assertBrandFidelity, IDENTITY,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  qualitySettings, shadowMapSizeFor, pickQualityTier,
  type LitDraw, type MeshBuffer, type Viewpoint,
} from '@lcx/gl';
import {
  useResolvedQualityTier, needsQualityProbe, measureFrameMs, recordQualityProbe,
} from '../shared/useQualityTier';
import {
  GATE_BANDS, STALL_DAYS, MAX_PER_GATE, type Channel, type ChannelDeal,
} from '@/components/geometry/pipelineChannel';

/**
 * The refusals that belong to the DATASET rather than to the GPU, in one place because two callers make the
 * judgement: the setup effect, so a refused channel never costs a WebGL context, and every redraw, so the
 * second channel is judged as strictly as the first.
 */
const channelRefusal = (c: Channel): string | null => {
  if (c.refusal !== null) return c.refusal;
  if (c.deals.length === 0) return 'NO_DRAWABLE_LEADS';
  return null;
};

export interface PipelineReliefGlProps {
  /** Already derived and already validated by `buildChannel`. */
  readonly channel: Channel;
  readonly heightPx: number;
  /** Called with a stable code when the renderer cannot draw. The parent then shows the table. */
  readonly onRefused: (code: string) => void;
}

/* Shader comments live ABOVE the literal. A backtick inside a template literal terminates it — that has bitten
   this repo twelve times — and a comment inside the string is shipped bytes a minifier cannot reach. */
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

/* ── THE CALIBRATION, carried over from the harness where every number is fixed by a reading requirement ── */

/** How far a lead touched today rides above the deck. A settled lead's underside is AT the deck, so
    "settled" is CONTACT rather than a low number — the only version of this a still frame can state. */
const RAIL_LIFT = 0.86;
/** MASS IS VOLUME, so the edge is the CUBE ROOT of value. An edge linear in value would make the largest
    name forty times the edge of the smallest and put it through the channel walls; a linear ramp between two
    chosen sizes looks better and silently asserts a scale nobody can invert. */
const EDGE_MAX = 0.46;
/** The size given to an object whose value is unreadable. It encodes NOTHING, which is why the states that
    use it do not use a cube: a reference-sized cube among value-sized cubes is a lie. */
const REF_SIZE = 0.11;

const CHANNEL_HALF = 1.45;
const STAGE_LEN = 2.2;
const GATE_H = 1.15;
const Z_GATE0 = -10.6;
const CHANNEL_Z_FAR = Z_GATE0 - 2.6;
/** The channel runs past the eye plane rather than stopping short of it: those faces are culled, and it is
    the difference between looking at the pipeline and standing in it. */
const CHANNEL_Z_NEAR = 1.7;
const CHANNEL_LEN = CHANNEL_Z_NEAR - CHANNEL_Z_FAR;
const CHANNEL_MID = (CHANNEL_Z_NEAR + CHANNEL_Z_FAR) / 2;
const gateZ = (i: number): number => Z_GATE0 + i * STAGE_LEN;

/**
 * THREE LANES × TWO DEPTH ROWS, which is where `MAX_PER_GATE = 6` comes from.
 *
 * The harness used two lanes at a 0.38 m depth pitch and reported the consequence: depth and height both map
 * to screen y, so two objects in one stage at different depths have their settling partly cancelled by their
 * spacing, and the tightest pair measured 24 px of separation against 56–71 px elsewhere. Three lanes buy a
 * 0.62 m pitch for the same capacity, which is a wider depth separation than the harness had — the confound is
 * smaller here than in the environment this is promoted from.
 */
const LANES = [-0.85, 0, 0.85] as const;
const SLOT_Z0 = 0.55;
const ROW_DZ = 0.62;

const FRESH_HEX = '#2C6BFF';
const STALLED_HEX = '#C9552B';
const ABSENT_HEX = '#E0A94A';
const WITHHELD_HEX = '#5C6880';
const FOG_HEX = '#0C1322';

/**
 * The haze reaches half at 13.5 m — the distance at which a word stops being a word in the harness's DOM
 * layer, so the visual limit and the reading limit are ONE distance rather than two.
 *
 * The first attempt solved for fog 90% converged at the intake wall and took the architecture with it: the
 * NEAREST object was already 50% fogged and the floor and walls, whose albedo is close to the fog colour,
 * converged to indistinguishable black across the whole frame. Fog that erases the space it is giving depth to
 * is an exposure bug, not atmosphere.
 */
const FOG_DENSITY = Math.log(2) / 13.5;

const NEAR = 0.1, FAR = 40;
/**
 * 35° AND 14° OF TILT, both bounded from two sides by the harness's measurements.
 *
 * A wide lens cannot render a channel — at 46° the side walls leave the frame within two metres of the eye, so
 * the architecture arrives as two dark wedges instead of as a space. The elevation has a floor because the
 * horizon sits at tan(elevation)/tan(fov/2) in NDC, so at 10° a quarter of the frame is empty above a channel
 * with no sky to put there; and a ceiling because every degree of tilt maps depth more strongly into screen y,
 * which is the confound that cancels the settling. Azimuth 9° keeps the eye INSIDE the channel: 19° puts it
 * 2.54 m off the centre line against a wall at 1.54, and the whole frame is then shot over the wall from
 * outside it. `near`/`far` are pinned rather than defaulted because the AO pass is handed the same two numbers
 * to linearise depth with, and a hand-written pair that disagrees with the projection is silently wrong.
 */
const VIEW: Viewpoint = {
  target: [0, 0.70, -5.2], distance: 8.2, azimuthDeg: 9, elevationDeg: 14,
  fovDeg: 35, near: NEAR, far: FAR,
};

/**
 * GRAZING, AND FROM THE SIDE THE CAMERA IS ON.
 *
 * Two corrections, both measured in the harness. Overhead — two thirds of the direction straight down — gave
 * the floor an order more irradiance than the walls, so an almost-black deck rendered as the palest thing in
 * the frame and every object read as a dark shape ON a bright plane. And `lightDir` is the direction light
 * TRAVELS, so a positive x means it arrives from the left: with the eye standing right of the centre line,
 * every surface in shot was the one facing away from the source and the channel rendered as gates floating in
 * an unlit void, correctly.
 */
const LIGHT_DIR: [number, number, number] = [-0.62, -0.38, -0.69];
const SCENE_MIN: [number, number, number] = [-2.0, 0, CHANNEL_Z_FAR];
const SCENE_MAX: [number, number, number] = [2.0, 1.9, CHANNEL_Z_NEAR];

const GATE_STROKE = { colour: hexToLinear('#4E8CFF'), gain: 1.5 } as const;
const AXIS_STROKE = { colour: hexToLinear('#7FB2FF'), gain: 1.1 } as const;

/** Slate, not brand blue. Brand blue is reserved for a LEAD; the architecture is the ruler, not the reading,
    and a dark blue rail beside a brand-blue cube is one hue doing two jobs. */
const GATE_MAT = { baseColour: hexToLinear('#31415C'), roughness: 0.36, metalness: 0.20 };
const CHANNEL_MAT = { baseColour: hexToLinear('#1E2A42'), roughness: 0.60, metalness: 0.03 };

/**
 * The three marks on the movement axis. `0d` is the rail, `45d+` is deck height.
 *
 * THE FLOOR TICK NEEDS REAL CLEARANCE, NOT AN EPSILON. At 12 mm above the deck, seen from eye height at a
 * shallow angle, a hairline projects into the SAME PIXELS as the plane and the depth test ties — the tick was
 * not occluded and not missing but COINCIDENT, which looks identical to both and is neither. 5.5 cm is a third
 * of a rail slot's pitch: unambiguously below every rail position and above the deck.
 */
const TICK_FLOOR_CLEARANCE = 0.055;
const AXIS_TICK_DAYS = [0, 20, STALL_DAYS] as const;
/**
 * THIS SCENE'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * `env/quality.ts:91` records why that distinction matters: wiring the ladder in with the tier's ABSOLUTE
 * `shadowMapSize` silently enlarged three environments — E0, E2 and E8 had each chosen 1024 and were handed
 * 1536 at the default tier, a 2.25x bigger map and three captures that changed without anyone saying so.
 */
const SHADOW_BASELINE = 1024;

export default function PipelineReliefGl({ channel, heightPx, onRefused }: PipelineReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* Subscribed rather than read once: this surface renders one frame into an offscreen target and only then
     blits it, so a resolved lower tier can rebuild the scene before anything has been painted. */
  const tier = useResolvedQualityTier();

  /**
   * THE REDRAW LIVES IN A REF, AND THAT IS WHAT KEEPS ONE GL CONTEXT ACROSS A DATA CHANGE.
   *
   * `channel` used to be in the setup effect's dependency list, so filtering the lead table disposed the stage
   * and built a new one: measured with a counting WebGL2 context, one change to `channel` cost **1 context, 7
   * programs, 14 shaders, 9 vertex arrays, 52 bufferData calls, 8 textures, 7 framebuffers and 142,092 bytes**
   * of re-upload — all of it identical to what was already on the GPU. That is §6 rule 7's hazard happening on
   * every data update, and `DeckReliefGl.tsx:205-213` already ships the fix for its own click path.
   *
   * NOT ONE BYTE OF THIS SCENE'S GEOMETRY IS DATA. Every lead is the SAME unit cube, ring or sphere placed by a
   * model matrix (see the "ONE UNIT CUBE, SCALED PER LEAD" note below), so a new channel changes a JavaScript
   * array of draw descriptors and nothing else. After the split a data change uploads nothing at all.
   */
  const drawRef = useRef<((c: Channel) => 'STALE_TIER' | undefined) | null>(null);
  /*
   * THE LATEST CHANNEL, so a TIER change can redraw it. The setup effect re-runs when the probe resolves a
   * lower tier, and at that moment the draw effect below does NOT re-run — its dependency did not change — so
   * without this the rebuilt context would have nothing to put on the canvas and the reader would be left with
   * a blank one under a caption describing a channel.
   */
  const channelRef = useRef<Channel>(channel);

  /*
   * THE DRAW EFFECT IS DECLARED FIRST, AND THE ORDER IS LOAD-BEARING. React runs effects in declaration order,
   * so on MOUNT this one runs before the setup below has published a draw function: it records the channel and
   * returns, and the setup effect draws it. On a DATA CHANGE only this one re-runs, and the context is untouched.
   */
  useEffect(() => {
    channelRef.current = channel;
    drawRef.current?.(channel);
  }, [channel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRef.current = null;

    /*
     * THE DERIVATION STILL REFUSES BEFORE THE RENDERER EXISTS. A channel the caption declined to describe must
     * not be handed to a mesh builder — that is the worst possible direction for a disagreement to run — and
     * discovering it after `createStage` would cost a context to be told so.
     *
     * READ THROUGH THE REF, NOT THE PROP: this is a check on the data, but it must not put the data back in the
     * dependency list below. `draw` makes the identical judgement on every later channel, at `channelRefusal`.
     */
    const firstRefusal = channelRefusal(channelRef.current);
    if (firstRefusal !== null) { onRefused(firstRefusal); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map
     * there is no point rendering: the frame would be off-brand by an amount too small to see and too large to
     * be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    /* DPR CAPPED BY THE TIER. This frame is fill-bound — AO, shadow, fog, a full-screen composite — so a 3×
       display would triple the cost of a view whose whole justification is that it answers faster. The cap WAS
       a literal 2; `Q.dprScale` is 2 at `full` and `reduced` and 1 at `minimum`, and resolution multiplies
       every fill-bound pass, which is all of them. */
    const Q = qualitySettings(tier);
    const dpr = Math.min(Q.dprScale, Math.max(1, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 960;
    const W = Math.round(cssW * dpr), H = Math.round(heightPx * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    /* Set by whichever of `refuse` and the cleanup runs first. A redraw can refuse now, so the two paths can
       both be reached in one mount and `disposers.reverse()` mutates — running it twice disposes forwards. */
    let dead = false;
    const refuse = (code: string): void => {
      drawRef.current = null;
      if (!dead) {
        dead = true;
        for (const d of disposers.reverse()) d();
        stage.dispose();
      }
      onRefused(code);
    };

    const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
    if ('kind' in present) { refuse(present.code); return; }
    const lit = createLitRenderer(stage);
    if ('kind' in lit) { refuse(lit.code); return; }
    disposers.push(() => lit.dispose());
    const target = createTarget3D(stage, W, H);
    if ('kind' in target) { refuse(target.code); return; }
    disposers.push(() => target.dispose());
    const shadow = createShadowMap(stage, shadowMapSizeFor(tier, SHADOW_BASELINE));
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());
    /* AO IS THE TIER'S SECOND DROP, after depth of field. Not allocated at all when the tier says no — a
       half-res R8 pair plus two programs is not free to hold, and the `null` below is the same path the lit
       renderer already takes for the environments that never had AO. */
    const ao = Q.ao ? createAmbientOcclusion(stage, W, H) : null;
    if (ao && 'kind' in ao) { refuse(ao.code); return; }
    if (ao) disposers.push(() => ao.dispose());
    const strokes = createLineBatch(stage);
    if ('kind' in strokes) { refuse(strokes.code); return; }
    disposers.push(() => strokes.dispose());

    /*
     * ONE UNIT CUBE, SCALED PER LEAD, rather than one geometry per object.
     *
     * N uploads of `box(e,e,e)` is N vertex arrays for one shape, and it also puts the size in the GEOMETRY
     * where nothing can read it back — so the scale then lives in two places the moment anything wants to know
     * how big a lead is. Scaling in the model matrix keeps `edgeOf` the single authority, and a UNIFORM scale
     * leaves normals alone so the normal matrix stays the identity.
     */
    const floorGeo = plane(2 * CHANNEL_HALF, 40);
    const wallGeo = box(0.18, 1.25, CHANNEL_LEN);
    const postGeo = box(0.10, GATE_H, 0.10);
    const sillGeo = box(2 * CHANNEL_HALF, 0.05, 0.13);
    const dealGeo = box(1, 1, 1);
    const absentGeo = torus(REF_SIZE * 1.25, REF_SIZE * 0.34, 40, 14);
    const withheldGeo = sphere(REF_SIZE, 20, 28);

    /*
     * UPLOADED ONE AT A TIME, EACH REGISTERED BEFORE THE NEXT IS ATTEMPTED. Uploading all seven and then
     * registering the disposers afterwards is correct on the happy path and leaks on the only path that
     * matters: a refusal on the seventh upload calls `refuse` while the first six are on the GPU with no
     * disposer recorded, and `Stage` owns programs and targets — it knows nothing about a VAO. So the six
     * vertex arrays and twenty-four buffers are stranded on exactly the branch that is hardest to reach and
     * most likely to repeat, because this component remounts every time a reader toggles the view.
     */
    const uploaded: MeshBuffer[] = [];
    for (const g of [floorGeo, wallGeo, postGeo, sillGeo, dealGeo, absentGeo, withheldGeo]) {
      const m = uploadMesh(stage, g);
      if ('kind' in m) { refuse(m.code); return; }
      uploaded.push(m);
      disposers.push(() => m.dispose());
    }
    const [floorMesh, wallMesh, postMesh, sillMesh, dealMesh, absentMesh, withheldMesh] = uploaded;

    const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    /* The ring stands UPRIGHT so its hole faces down the channel and reads as a hole rather than as a thin
       ellipse seen from above. It is therefore the one draw whose normal matrix is NOT the identity: a rotated
       mesh handed `N3` is lit as though it had never been rotated, which is a shading error no capture
       announces. For a pure rotation the inverse-transpose IS the rotation. */
    const N3_ROT_X90 = new Float32Array([1, 0, 0, 0, 0, 1, 0, -1, 0]);

    const modelAt = (x: number, y: number, z: number, s = 1): Float32Array => {
      /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0, every vertex collapses to the
         origin, and the frame is a clear colour with a complete framebuffer and no error anywhere. */
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

    /* THE FLOOR IS STRETCHED BY ITS MODEL MATRIX, because `plane(size, segments)` is SQUARE. A neighbouring
       environment calls `plane(6, LEN)` and gets a 6 × 6 deck with LEN subdivisions under a LEN-metre corridor;
       its fog hides the shortfall. Safe here only because the plane's single normal is +y and scaling z leaves
       it alone. */
    const floorModel = modelAt(0, 0, CHANNEL_MID, 1);
    floorModel[10] = CHANNEL_LEN / (2 * CHANNEL_HALF);

    /* THE ARCHITECTURE, which is the same for every dataset this channel can hold. Built once and reused by
       every redraw; only the leads below it are rebuilt when the data changes. */
    const staticDraws: LitDraw[] = [
      { mesh: floorMesh!, model: floorModel, normalMat: N3,
        material: { baseColour: hexToLinear('#22304A'), roughness: 0.82, metalness: 0 } },
      { mesh: wallMesh!, model: modelAt(-(CHANNEL_HALF + 0.09), 0.625, CHANNEL_MID), normalMat: N3,
        material: CHANNEL_MAT },
      { mesh: wallMesh!, model: modelAt(CHANNEL_HALF + 0.09, 0.625, CHANNEL_MID), normalMat: N3,
        material: CHANNEL_MAT },
    ];

    /*
     * A GATE IS A PORTAL, NOT A PANE.
     *
     * §2 asks for a luminous membrane across the channel. A thin box spanning the aperture is exactly that and
     * it is OPAQUE, so five in a row make the channel a wall and nothing past the first gate exists — which
     * destroys the depth the whole environment is built on. So the membrane is its EDGE: two posts and a deck
     * sill as lit geometry that casts shadow, plus an additive outline traced on the full rectangle below. The
     * luminous half of "luminous membrane" comes from the outline, and the aperture stays open.
     */
    for (let i = 0; i < GATE_BANDS.length; i++) {
      const z = gateZ(i);
      staticDraws.push(
        { mesh: postMesh!, model: modelAt(-(CHANNEL_HALF + 0.05), GATE_H / 2, z), normalMat: N3, material: GATE_MAT },
        { mesh: postMesh!, model: modelAt(CHANNEL_HALF + 0.05, GATE_H / 2, z), normalMat: N3, material: GATE_MAT },
        { mesh: sillMesh!, model: modelAt(0, 0.025, z), normalMat: N3, material: GATE_MAT },
      );
    }

    /*
     * MASS FROM VALUE, HEIGHT FROM MOVEMENT — and three shapes, because two absences that a blank cell
     * destroys have to stay apart in three dimensions exactly as they do in the table.
     *
     * · a readable lead is a CUBE, its edge the cube root of its market cap, its height its last touch;
     * · a lead with NO recorded market cap is a RING — a hole where the mass should be, at a reference size
     *   that encodes nothing. Its date is known, so it still sits on the movement axis;
     * · a lead with no readable last touch floats 0.30 m CLEAR of the rail rather than at it. The rail means
     *   "touched today", so parking an unreadable date there would assert the freshest possible reading about
     *   the one record nobody can check — the exact inversion of what the absence means;
     * · a lead missing BOTH is a dull steel SPHERE, off both scales, neither fresh-coloured nor stalled-
     *   coloured because either would assert a movement reading it does not have.
     *
     * ALL THREE ARE SHARED, UNIT-SIZED MESHES. That is what makes this function cheap enough to be the whole
     * response to a data change: it allocates nothing on the GPU, it only decides where the shapes go.
     */
    const leadDraws = (c: Channel): LitDraw[] | { refusal: string } => {
      const values = c.deals.map((d) => d.valueUsd).filter((v): v is number => v !== null);
      const valueMax = values.length > 0 ? Math.max(...values) : 0;
      const edgeOf = (v: number): number =>
        valueMax <= 0 ? REF_SIZE : EDGE_MAX * Math.cbrt(v / valueMax);

      const settleOf = (d: ChannelDeal): number | null =>
        d.daysSinceUpdate === null ? null : Math.min(1, d.daysSinceUpdate / STALL_DAYS);

      const placed = c.deals.map((d) => {
        const row = Math.floor(d.slot / LANES.length);
        const lane = d.slot % LANES.length;
        const x = LANES[lane] ?? 0;
        const z = gateZ(d.gateIndex) + SLOT_Z0 + row * ROW_DZ;
        const edge = d.valueUsd === null ? null : edgeOf(d.valueUsd);
        const settle = settleOf(d);
        const half = edge !== null ? edge / 2 : REF_SIZE;
        const baseY = settle === null ? RAIL_LIFT + 0.30 : (1 - settle) * RAIL_LIFT;
        return { d, x, z, edge, settle, centreY: baseY + half };
      });

      /* Does every slot stay inside its own gate's segment? A lead drawn past its next gate has, by this
         environment's own rule, cleared a gate it has not cleared — a data error the picture presents as a fact.
         Checked rather than trusted, because the slot pitch, the cap and the stage length are three constants a
         future edit will change one of. */
      const escaped = placed.filter((p) => {
        const half = p.edge !== null ? p.edge / 2 : REF_SIZE;
        const rel = p.z - gateZ(p.d.gateIndex);
        return rel - half < 0.05 || rel + half > STAGE_LEN - 0.05;
      });
      if (escaped.length > 0 || MAX_PER_GATE > LANES.length * 2) return { refusal: 'SLOT_ESCAPED_ITS_GATE' };

      const out: LitDraw[] = [];
      for (const p of placed) {
        if (p.d.known === 'BOTH_ABSENT') {
          out.push({
            mesh: withheldMesh!, model: modelAt(p.x, p.centreY, p.z), normalMat: N3,
            /* Roughness 0.55 and metalness 0.25, not a polish: under a sky environment a mirror finish put the
               hardest specular in the frame on the one object that says "there is nothing here to read", and it
               drew the eye first. */
            material: { baseColour: hexToLinear(WITHHELD_HEX), roughness: 0.55, metalness: 0.25 },
          });
        } else if (p.edge === null) {
          out.push({
            mesh: absentMesh!, model: modelRingAt(p.x, p.centreY, p.z), normalMat: N3_ROT_X90,
            material: { baseColour: hexToLinear(ABSENT_HEX), roughness: 0.44, metalness: 0.10 },
          });
        } else {
          /* Colour REPEATS the height, deliberately. A single-channel encoding of the thing this environment
             exists to show fails for anyone reading at a glance or in greyscale, and the redundancy costs a
             channel that has nothing else to carry. */
          const col = mixLinear(hexToLinear(FRESH_HEX), hexToLinear(STALLED_HEX), p.settle ?? 0);
          out.push({
            mesh: dealMesh!, model: modelAt(p.x, p.centreY, p.z, p.edge), normalMat: N3,
            /* Dielectric, so §6 rule 5's hex survives: a metal has no diffuse lobe and the brand blue would
               arrive only through the specular F0, as a blue-tinted mirror of the sky. */
            material: { baseColour: col, roughness: 0.34 + 0.16 * (p.settle ?? 0), metalness: 0.06 },
          });
        }
      }
      return out;
    };

    const eye = eyeOf(VIEW);
    const lightVP = lightViewProjection(
      { direction: LIGHT_DIR, colour: [1, 1, 1], extent: 9.6 },
      boundsCentre(SCENE_MIN, SCENE_MAX), boundsRadius(SCENE_MIN, SCENE_MAX),
    );
    const vp = viewProjection(VIEW, W / H);

    /*
     * THE AXIS STANDS INSIDE THE CHANNEL, and that took four attempts in the harness, three of which were
     * fixes that did not fix. Outboard of the far wall it was off frame; outboard of the near wall a bounds
     * count read 0 while a framebuffer probe showed two of three ticks OCCLUDED by the wall slab itself. It is
     * resolved by DEPTH rather than by lateral offset: the strokes stand at one gate's z, inboard of the wall
     * and outboard of the rails, sharing a plane with no object.
     */
    const axisSide = eye[0] >= 0 ? 1 : -1;
    const axisXInner = axisSide * (CHANNEL_HALF - 0.42);
    const axisXOuter = axisSide * (CHANNEL_HALF - 0.12);
    const axisZ = gateZ(Math.min(3, GATE_BANDS.length - 1));

    /*
     * ONE FRAME, THEN NOTHING. Stepped in the order the passes depend on each other: shadow, then a depth-only
     * prepass, then AO off that depth, then the lit pass, then the additive strokes, then the composite. AO is
     * computed between the prepass and the lit pass because it needs depth and the lit pass needs it — and the
     * prepass is not a tax, it lets the lit pass reject occluded fragments before their GGX evaluation.
     */
    const renderScene = (draws: readonly LitDraw[]): void => {
      lit.shadowPass(lightVP, draws, shadow);
      target.bind();
      /* NO SKY BACKDROP, AND THE CLEAR IS THE FOG COLOUR. The channel is open-topped, so the sky stays as the
         irradiance environment; what it must not get is the sky DRAWN, which would make the most fogged part of
         the frame its brightest — the exact inverse of the reading. Clearing to the fog colour means every
         distant surface converges on a value the frame already has. */
      const fc = hexToLinear(FOG_HEX);
      gl.clearColor(fc[0], fc[1], fc[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      lit.depthPrepass(vp, draws);
      if (ao) {
        ao.compute({
          depthTexture: target.depthTexture, near: NEAR, far: FAR, fovDeg: VIEW.fovDeg ?? 35,
          aspect: W / H, radius: 0.36, strength: 1.25,
        });
        target.bind();
      }
      lit.draw({
        viewProj: vp, eye, lightDir: LIGHT_DIR, lightColour: [3.4, 3.3, 3.14],
        ambientGain: 0.44, lightVP, shadow, shadowStrength: 0.92, shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws,
        ao: ao ? ao.texture : null, screenSize: [W, H],
        fog: { density: FOG_DENSITY, height: 5.0, floor: 0, colour: fc },
      });

      /*
       * ADDITIVE, DEPTH-TESTED, NOT DEPTH-WRITING — set by hand rather than with a helper that disables the
       * depth test. An untested outline draws over the objects in front of it, so every gate would appear nearer
       * than every lead that has already cleared it: the one thing this geometry exists to state, inverted.
       * Testing keeps the ordering; not writing keeps two crossing strokes from fighting over which is nearer.
       */
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      for (let i = 0; i < GATE_BANDS.length; i++) {
        const z = gateZ(i);
        strokes.ruleAtDepth(vp, -CHANNEL_HALF, 0.02, CHANNEL_HALF, 0.02, z, 0.012, GATE_STROKE);
        strokes.ruleAtDepth(vp, -CHANNEL_HALF, GATE_H, CHANNEL_HALF, GATE_H, z, 0.010, GATE_STROKE);
        strokes.ruleAtDepth(vp, -CHANNEL_HALF, 0.02, -CHANNEL_HALF, GATE_H, z, 0.010, GATE_STROKE);
        strokes.ruleAtDepth(vp, CHANNEL_HALF, 0.02, CHANNEL_HALF, GATE_H, z, 0.010, GATE_STROKE);
      }
      for (const days of AXIS_TICK_DAYS) {
        const y = (1 - Math.min(1, days / STALL_DAYS)) * RAIL_LIFT + TICK_FLOOR_CLEARANCE;
        strokes.ruleAtDepth(vp, axisXOuter, y, axisXInner, y, axisZ, 0.006, AXIS_STROKE);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      /* ENDS WITH `target` BOUND, which is what `probeSync` needs: a `readPixels` only guarantees completion of
         work affecting the framebuffer it reads, and this whole frame lands in the offscreen HDR target. */
    };
    const presentFrame = (): void => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
    };

    /*
     * ONE REDRAW, WHICH IS THE WHOLE RESPONSE TO A NEW CHANNEL — no context, no program, no buffer.
     *
     * The derivation's own refusals live here rather than above the stage because they are properties of the
     * DATA: a channel the caption declined to describe must not be handed to a mesh builder, and that judgement
     * has to be made again on the second dataset as well as on the first.
     */
    const draw = (c: Channel): 'STALE_TIER' | undefined => {
      const refusal = channelRefusal(c);
      if (refusal !== null) { refuse(refusal); return undefined; }
      const leads = leadDraws(c);
      if ('refusal' in leads) { refuse(leads.refusal); return undefined; }
      const draws = [...staticDraws, ...leads];

      /*
       * THE PROBE. `pickQualityTier` exists to choose a tier from a measured frame and had no caller in the
       * repo; this is one. A discarded warm-up frame first, because the first frame pays shader upload and
       * charging that to the GPU would downgrade every machine, then two sync-bounded samples of which the
       * cheaper is used. All of it before the first blit, so it costs latency and not the picture. At most one
       * mount per page load takes it, and `needsQualityProbe()` is false for every LATER redraw — a data
       * update must never re-time the machine, or the ladder would follow the dataset instead of the GPU.
       */
      if (needsQualityProbe()) {
        const ms = measureFrameMs(gl, () => renderScene(draws));
        const r = recordQualityProbe({
          pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'PipelineReliefGl',
        });
        /* A LOWER TIER MEANS THIS BUILD IS STALE. Nothing is presented, the effect re-runs on the new tier, and
           the first thing the reader sees is the resolved tier — not a full frame that then changes. */
        if (r.tier !== tier) return 'STALE_TIER';
      }

      renderScene(draws);
      presentFrame();
      /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted. */
      canvas.dataset.qualityTier = tier;

      const err = gl.getError();
      if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return undefined; }
      return undefined;
    };

    /* THE FIRST FRAME COMES FROM THE SETUP, NOT FROM THE DRAW EFFECT ABOVE. On a tier rebuild that effect does
       not re-run — its dependency did not change — so a rebuilt context with no draw would leave a blank canvas
       under a caption describing a channel. */
    if (draw(channelRef.current) === 'STALE_TIER') {
      /* No context-lost listener on this path: there is no picture on screen to go stale, and `onRefused` must
         not fire — the scene is about to be rebuilt at the resolved tier, not refused. */
      return () => {
        if (dead) return;
        dead = true;
        for (const d of disposers.reverse()) d();
        stage.dispose();
      };
    }
    /* A REFUSAL ON THE FIRST DRAW HAS ALREADY DISPOSED EVERYTHING, so there is nothing left to arm a redraw
       against and nothing left to clean up. Publishing `draw` here would leave a closure over a dead stage
       that a later data change would call — silently, because GL does not throw on a disposed context. */
    if (dead) return;
    drawRef.current = draw;

    /*
     * CONTEXT LOSS RESOLVES TO THE TABLE. Without this the canvas keeps its last frame on screen for ever
     * while the GPU has dropped the context — a stale picture presented as live data, which is worse than no
     * picture. Registered on the canvas rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      drawRef.current = null;
      /* ALREADY RELEASED ON THE REFUSAL PATH, and `disposers.reverse()` MUTATES — running it twice would
         restore the original order and dispose forwards, with the stage killed before the resources built on
         it. `refuse` can now fire from a REDRAW as well as from the build, so this guard is reachable. */
      if (dead) return;
      dead = true;
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST. It owns the context; releasing it before the resources built on it leaves every
         `delete*` call operating on a dead context, which is silent rather than fatal and leaks on every
         remount — and this component remounts whenever a reader toggles it. */
      stage.dispose();
    };
    /* `tier` IS A DEPENDENCY, and that is the rebuild mechanism: a resolved lower tier tears this context
       down and builds the scene again at it. `channel` IS NOT, and that is the fix this file exists to carry. */
  }, [heightPx, onRefused, tier]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${heightPx}px`, display: 'block' }}
      /* The channel carries the same rows the table beside it carries, so it is not announced twice; the
         caption underneath and the table itself are what a screen reader reads. */
      aria-hidden="true"
      data-testid="pipeline-relief-canvas"
    />
  );
}
