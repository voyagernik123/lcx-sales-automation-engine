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
  hexToLinear, mixLinear, assertBrandFidelity, IDENTITY, statusAlbedo,
  createPresenter, loadEnvironmentMap, uploadEnvironment, skyIrradiance, inverseToneMap,
  qualitySettings, shadowMapSizeFor, pickQualityTier,
  type LitDraw, type MeshBuffer, type Viewpoint, type Linear,
} from '@lcx/gl';
/* A SUB-PATH IMPORT, NOT THE BARREL — `docs/3d/w2/SUBPATH_COST.md`; `SurfaceReliefGl.tsx` carries the reason. */
import { sceneTheme, liveTheme, type SceneTheme, type ThemeName } from '@lcx/gl/look/theme.js';
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
/* The present shaders that used to live here moved into the engine's ONE present path (look/present.ts, P4). */

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
/*
 * ── T4, DELIVERED RATHER THAN MEASURED ──────────────────────────────────────────────
 * `STALLED_HEX` was `#C9552B` and is gone: a stalled lead is a STATUS, and the platform already
 * owns a colour for that status. The 3-D surfaces were encoding it in burnt orange while every
 * other surface in the product used the token — one product, two colour languages, which is what
 * `look/semantic.ts` was built to end. The module was built, measured to three decimals, and
 * exported from nowhere; making it reachable was a precondition, and THIS is the delivery.
 *
 * The role is `conditional` (--amber), NOT `blocked`. A stalled lead is a warning about staleness,
 * not a refusal, and picking `blocked` would assert a finding the data does not carry.
 *
 * `ABSENT_HEX` MOVES TOO, AND THAT IS NOT OPTIONAL. `#E0A94A` measures 0.7 degrees from --amber in
 * light and 3.0 in dark — it IS the conditional hue already. Retiring the stall colour to
 * `conditional` without moving this would put a WARNING and an ABSENCE 0.7 degrees apart in one
 * frame. Absence is not a status: it takes the absence grey the rest of the programme uses, which
 * `look/categorical.ts` files below the ramp's chroma floor by construction.
 *
 * ══ THE FAR END STILL FOLLOWS THE THEME, AND PINNING IT WAS TRIED AND MEASURED WORSE ═══════════
 *
 * `statusAlbedo(role, theme)` returns the PLATFORM's per-theme token: `conditional` is [230,160,40]
 * in dark and [138,95,0] in light, so this ramp's far end IS a different albedo on each page.
 * `look/semantic.ts` argues that is not a rule 5 breach — a scene defers to "the platform's own
 * definition of a word" — and rests it on one stated guarantee: "illumination is (near enough)
 * achromatic here and the tone map is per channel, so the hue survives... A red slab renders as a
 * red slab."
 *
 * EVERY RENDERED FIGURE IN THE REST OF THIS BLOCK IS PRE-FOG-FIX and is kept as the record of what the
 * fog was doing, not as a description of what ships. `dataFogRatio` below now cuts the light mark pass's
 * haze to 0.0058 of the scenery's, so the light column of the table two paragraphs down — chroma 24, a
 * warm grey — is the frame that was measured, not the frame that renders. The REFUTATION it supports is
 * unaffected: pinning the far end was measured worse on the working range, and that is a property of the
 * mix, not of the haze.
 *
 * THAT GUARANTEE FAILED AT THIS RAMP'S FAR END, and this file's own fog was why. Measured off the
 * drawing buffer with every lead forced to `settle = 1` and the strokes excluded so the population
 * is the marks and nothing else (chroma floor 60, derived):
 *
 *                                     rendered mark          chroma   above the floor
 *   dark   [230,160,40]               rgb(155,112,36)          118         0.71%
 *   light  [138,95,0]   as shipped    rgb(162,147,137)          24         0.00%
 *   light  [230,160,40] pinned        rgb(206,174,140)          65         0.44%
 *
 * A fully stalled lead renders at chroma 24 on a white page — a warm GREY, less saturated than
 * `ABSENT_HEX`, so the surface's WARNING reads as its ABSENCE. The arithmetic is exact: `#8A5F00`
 * is (0.2543, 0.1145, 0.0000) linear and its whole hue is that zero blue, while the haze mixes in
 * 0.305 x (0.716, 0.784, 0.896) at the depth these marks sit at — the fog MANUFACTURES the channel
 * the hue depended on being absent. `#E6A028` carries a red of 0.7915 and survives it.
 *
 * ── SO THE OBVIOUS FIX WAS BUILT, RUN, AND REVERTED ─────────────────────────────────
 * Pinning the far end to `'dark'` on both pages is rule 5 by the letter and it cannot move dark by
 * construction. Measured on the audit's own channel it made the LIGHT frame strictly worse on every
 * row, because the fixture's leads sit at `settle` 0.07–0.36 and never reach the end that was fixed:
 *
 *                          p99.9 chroma   max   above floor   data:scenery
 *   light, far end = theme        77       81       0.52%        1.59:1
 *   light, far end pinned         59       59       0.00%        none measurable
 *
 * 59 is the STROKE ink; at 0.00% there is no mark population left at all. The cause is at the mix
 * below and it is not the endpoint: a straight line in linear light from brand blue to an amber
 * crosses the neutral axis, and WHERE it crosses depends on the endpoint — red equals blue at
 * `settle` 0.79 for [138,95,0] and at 0.56 for [230,160,40]. Pinning moved the grey zone off the
 * far end and onto the working range. Both endpoints are symptoms of one theme-independent defect,
 * recorded at the mix itself, and neither can be fixed while the dark frame is held.
 */
const ABSENT_HEX = '#6B7A99';
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

/**
 * ══ THE STROKES ARE THE ONE THING IN THESE SEVEN SURFACES A THEME SWAP ALONE CANNOT FIX ═════════════
 *
 * The gate is a PORTAL, and its membrane exists only as the additive outline traced below — the posts and the
 * sill are its edge. So the outline is not decoration on this frame; it is the object a lead's position is read
 * against. `lines.ts` writes `uColour * uGain` with alpha hard-coded to 1.0 and the calls below blend
 * `ONE, ONE`, which can only ADD light. On a bright ground that is arithmetically hopeless, and it measures
 * exactly as badly as it sounds. Contrast of the stroke against the fog it is drawn over, through this
 * pipeline's own tone map and sRGB encode:
 *
 *                              DARK, additive        LIGHT fog, additive kept
 *   gate  #4E8CFF gain 1.5     6.89:1                1.28:1
 *   axis  #7FB2FF gain 1.1     7.89:1                1.36:1
 *
 * 1.28:1 is not a weak line, it is no line: the gates and the movement axis disappear and the frame becomes
 * cubes floating in a white box with nothing to read them against.
 *
 * ── THE FIX IS THE BLEND STATE, NOT A NEW PASS ───────────────────────────────────────
 * A reference is emissive because on a dark ground light is how a mark is made. On a light ground INK is how a
 * mark is made, and `lines.ts` already writes alpha 1.0 — so with blending simply OFF the same call writes an
 * opaque rule at its own depth, still depth-tested, still not depth-writing. One ink colour serves both strokes
 * and the SHIPPED GAINS are kept, which is what preserves their ordering: the gate's larger gain makes it the
 * lighter, more recessive of the two on light exactly as the axis is the brighter of the two on dark. Measured
 * against the same light fog:
 *
 *   gate  #26355A gain 1.5     6.17:1        (dark was 6.89:1)
 *   axis  #26355A gain 1.1     7.18:1        (dark was 7.89:1)
 *
 * Both within 0.72 of the dark theme's own numbers, both far above the 3:1 WCAG 1.4.11 floor for a graphical
 * object that carries information, and in the same order. `#26355A` is `BRAND_HEX.rule`, whose own comment reads
 * "Structure — axes, rules, ticks. Recedes" — the role these strokes have.
 */
const STROKE_INK_HEX = '#26355A';
const strokesFor = (th: SceneTheme) => {
  const light = th.name !== 'dark';
  const colour = light ? hexToLinear(STROKE_INK_HEX) : null;
  return {
    /* `additive` drives the blend state at the call site, so there is ONE owner of the light/dark decision and
       the colour and the blend cannot end up disagreeing — an ink drawn additively is invisible, and a luminous
       stroke drawn opaquely paints a bright rectangle over the geometry behind it. */
    additive: !light,
    gate: { colour: colour ?? hexToLinear('#4E8CFF'), gain: 1.5 },
    axis: { colour: colour ?? hexToLinear('#7FB2FF'), gain: 1.1 },
  };
};

/**
 * THE ARCHITECTURE'S ALBEDOS, AND THE ORDERING THAT HAD TO BE PRESERVED RATHER THAN GUESSED.
 *
 * Slate, not brand blue: brand blue is reserved for a LEAD; the architecture is the ruler, not the reading, and
 * a dark blue rail beside a brand-blue cube is one hue doing two jobs.
 *
 * Measured WCAG luminance of the three dark albedos: wall #1E2A42 0.0233 < floor #22304A 0.0295 < gate #31415C
 * 0.0521. The wall RECEDES below the floor and the gate STANDS OUT above it, and that ordering is the reading.
 * On a light ground "recede" and "stand out" both invert, so the light values have to run the other way, and the
 * theme's roles happen to be ordered to take them: gate `rule` 0.5608 < floor `ground` 0.8438 < wall `plate`
 * 1.0000. Same three-way ordering, mirrored — derived from the measurement rather than assigned by eye.
 *
 * `structure` is deliberately NOT used here even though "wall" sounds like it: at 0.6113 it sits between `rule`
 * and `ground` and would put the wall on the wrong side of the floor, collapsing the gate and the wall together.
 * A role name is not a substitute for checking which way the numbers go in THIS scene.
 */
const scenery = (th: SceneTheme, darkHex: string, light: Linear): Linear =>
  (th.name === 'dark' ? hexToLinear(darkHex) : light);
const gateMatFor = (th: SceneTheme) => (
  { baseColour: scenery(th, '#31415C', th.rule), roughness: 0.36, metalness: 0.20 });
const channelMatFor = (th: SceneTheme) => (
  { baseColour: scenery(th, '#1E2A42', th.plate), roughness: 0.60, metalness: 0.03 });

/**
 * ══ THE FOG WAS SPENDING ITS WHOLE BUDGET ON THE DATA, AND ONLY ON THE LIGHT PAGE ═══════════════
 *
 * The light frame held 53% of dark's mark chroma and 28% of its data-to-scenery contrast, and a
 * luminance-only check called it a pass because the luminance spread went the OTHER way — sd 19.18
 * against dark's 13.96, 137%. This is where it went, and the haze below is the whole of it.
 *
 * ── THE POPULATION IS DEFINED BY THE FOG ITSELF, NOT BY A COLOUR TEST ───────────────
 * Splitting the lit pass in two makes the mark-pass fog independently switchable, so the marks can be
 * identified as THE PIXELS THAT MOVE WHEN IT IS SWITCHED — 4529 px in dark, 4338 in light, 0.85% and
 * 0.81% of a 1160x460 buffer. Nothing else in the frame can move: the scenery's mean luma across the
 * two captures is 21.4458 / 21.4458 in dark and 225.0289 / 225.0289 in light, identical to four
 * decimals. That population is what every number below is measured over, and it is the one thing a
 * chroma threshold could not have given: the failing marks are exactly the ones a chroma threshold
 * stops counting.
 *
 * ── WHAT THE FOG COSTS THE MARKS, MEASURED ON THAT POPULATION ───────────────────────
 *                                        DARK              LIGHT
 *   mean Lab chroma, fog off            41.169            55.949
 *   mean Lab chroma, fog on             38.099            31.272
 *   the fog's cost                       7.46%            44.10%      5.9x
 *   mean luma shift                 -12.84 codes     +46.71 codes     OPPOSITE SIGN
 *
 * The sign is the mechanism. `env/lit.ts:599` is `mix(lit, fogCol, 1 - exp(-depth))`: a MULTIPLY by
 * (1-a), which is a per-channel scale and preserves a mark's chromaticity, plus an ADD of a·F, which
 * is a pedestal of foreign light. Dark's `#0C1322` is linear (0.0037, 0.0065, 0.0160) and its pedestal
 * is nothing, so the mix is very nearly pure attenuation. Light's `th.fog` is radiance (1.0028, 1.1412,
 * 1.3972) — brighter than the marks it is added to.
 *
 * ── AND THE CIEDE2000 DECOMPOSITION SAYS THE SAME THING IN THE METRIC THE PLATFORM USES ──
 * Mean |dL/SL|, |dC/SC|, |dH/SH| between each mark pixel with the fog and the same pixel without it:
 *
 *                      lightness   chroma    hue     chroma+hue    total
 *     dark               4.704      1.201    0.153      1.218      4.898
 *     light             13.945      8.335    3.125      8.904     16.565
 *
 * DARK'S FOG IS 96% LIGHTNESS. It dims a distant mark and barely touches its colour, which is what
 * atmosphere is. Light's moves the mark's chroma and hue 7.3x as far — that is not depth cueing, it is
 * a theme-dependent retint of the data, and `look/theme.ts` says a theme may not do that.
 *
 * ── THREE STATEMENTS OF THE INVARIANT WERE SOLVED, AND THE BINDING ONE WINS ─────────
 * Density is the only lever this file owns, so each was solved as a light mark-pass density ratio,
 * measured on a ten-point ladder rather than argued:
 *
 *   (i)  CHROMA-AND-HUE PARITY — the fog may move a mark's colour no further in light than in dark.
 *        Light's chroma+hue displacement is 0.723 at r=0.05 and 1.343 at r=0.10, so dark's 1.218
 *        solves at r = 0.090. Re-solved on three depth terciles it gives 0.114, 0.096, 0.070.
 *   (ii) THE MARK MUST STAY NEARER ITS OWN COLOUR THAN THE ARCHITECTURE'S. Classified against the
 *        audit's exposure loci, the share of mark pixels nearest a DATA locus runs 8.13% -> 8.48% in
 *        dark: dark's fog costs the marks no attribution at all. In light it runs 21.53% at r=0,
 *        7.65% at r=0.05 and 0.00% from r=0.10 to r=0.25 — the fogged marks land on `rule`, the light
 *        theme's own pale blue-grey ARCHITECTURE colour. (i)'s answer sits inside that dead
 *        band — at r=0.10, the measured point just above it, not one mark pixel in the frame is nearest a
 *        data colour — so (i) fails (ii) outright.
 *   (iii) PEDESTAL PARITY — the fog may inject no more foreign light into a mark in light than in dark.
 *        This is the one the mechanism above names, and it is the only one that needs no fitted number:
 *        the pedestal is a·F, `a` is first-order in the density, so the ratio is the ratio of the two
 *        fog LUMINANCES. It is the literal 1 on dark because both sides are the same expression.
 *
 * (i) is refuted by (ii) and (ii) is satisfied only near zero, which is where (iii) independently
 * lands. So (iii) is what ships. It is not "fog off": it is a continuous function of the theme, and a
 * theme that authored a darker fog would get proportionally more of it on its marks, up to the clamp.
 *
 * ── WHY THE CLAMP, AND WHY LUMINANCE ────────────────────────────────────────────────
 * A theme whose fog is DARKER than dark's would solve above 1 and hand the data more haze than the
 * scenery it is read against — the same defect with the sign flipped. Clamped at 1: the data pass never
 * takes more haze than the room does. Luminance rather than a per-channel match because the density is
 * one scalar and cannot match three channels — and the choice between the plausible norms decides nothing
 * here. Over the same two triples the max-channel norm solves 0.011449, the Euclidean 0.008555 and the
 * mean-channel 0.007394 against luminance's 0.005834; the ladder is linear in r across that span (0.723 at
 * r=0.05, 1.343 at r=0.10), so even the WIDEST of them displaces a light mark's colour by about 0.14
 * against dark's 1.218. Every norm lands an order of magnitude inside dark's own figure.
 *
 * ── AND THE MUTATION WAS RUN, WHICH `lightExposure`'S WAS NOT ───────────────────────
 * `lightExposure` below records an experiment that a skeptic performed and that PASSED, because a guard
 * two lines away swallowed it. So this one was performed rather than described: replacing the `Math.min`
 * with `Math.max` makes the light ratio 1, and every light figure goes straight back to its pre-fix value —
 * p99.9 chroma 138 -> 82, max 142 -> 84, data:scenery 3.23:1 -> 1.67:1, `data-data-fog` stamping 1.0000
 * instead of 0.0058. Dark does not move, which is the point: on dark BOTH branches return the same 1.
 *
 * ── WHAT THIS DOES NOT FIX, STATED BECAUSE THE NEXT READER WILL MEASURE IT ──────────
 * Light's data-to-scenery contrast recovers to 3.23:1 against dark's 5.86:1 and stops there. The
 * remainder is not the fog: with the fog off in BOTH themes the split is still 3.21 against 5.93. It is
 * the scenery. Light's architecture is `plate` #FFFFFF and `ground` #E8EDF6 against dark's #1E2A42 and
 * #22304A, so the same mark has far less room to separate from a white page than from a black one.
 * That is a theme-level fact about the authored albedos, not something this file can compose away.
 */
const FOG_DARK: Linear = hexToLinear(FOG_HEX);
/** ONE OWNER for the clear colour, the scenery's haze and the mark pass's haze — see `renderScene`. */
const fogColour = (th: SceneTheme): Linear => scenery(th, FOG_HEX, th.fog);
const Y709 = (c: Linear): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const dataFogRatio = (th: SceneTheme): number => {
  const y = Y709(fogColour(th));
  /* A theme with a black fog injects nothing and needs no reduction; it also cannot be a denominator. */
  return y > 0 ? Math.min(1, Y709(FOG_DARK) / y) : 1;
};

/** The dark theme's record, held only as the denominator of the light rig's ratio — see `SurfaceReliefGl.tsx`,
    THE LIGHT RIG MOVES BY RATIO. Nothing reads a colour out of it. */
const TH_DARK = sceneTheme('dark');

/** The key's tint and the ambient base, hoisted out of the draw call so the exposure solve below is fed by
    the SAME two numbers the renderer is handed. A solve against a transcription is not a solve. */
const KEY_TINT: readonly [number, number, number] = [3.4, 3.3, 3.14];
const AMBIENT_BASE = 0.44;

/** The unit direction TO the key. `LIGHT_DIR` is the direction light TRAVELS, so this is its negation, and
    the shipped vector is not unit length (|LIGHT_DIR| = 1.0025) — an unnormalised dot would report an N·L
    the shader does not use. */
const LIGHT_TO: readonly [number, number, number] = (() => {
  const m = Math.hypot(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
  return [-LIGHT_DIR[0] / m, -LIGHT_DIR[1] / m, -LIGHT_DIR[2] / m];
})();

/**
 * ══ THE ABSOLUTE EXPOSURE, SOLVED — THE RATIO WAS NEVER THE PROBLEM ═════════════════════════════
 *
 * `rigFor` moved the light rig by RATIO and stopped there, which holds key-against-ambient exactly and says
 * nothing about where the frame lands on the curve. Measured on the drawing buffer, that is where it landed:
 *
 *   · NOTHING IN THE LIGHT FRAME CLIPPED. 0.00% of channels at 255, p01..p99 = 134..219. A lit interior that
 *     never reaches the top of the range is UNDER-exposed — it is spending about a fifth of the encode on
 *     nothing — and it is the opposite sign of `ForgeBackdrop`'s defect, not a different defect.
 *   · THE THEME'S OWN ORDERING CAME OUT INVERTED. `theme.ts` authors light `ground` at Rec.709 luminance
 *     0.8438 and derives `fog` from `skyHorizon` at 0.7772, so the deck is authored ABOVE the haze. Rendered,
 *     the nearest deck rows read luma 191.6 against a backdrop of 202.4 — the haze came out brighter than the
 *     floor it is meant to dissolve, which is the ordering this file's own clear-colour note refuses.
 *
 * ── WHAT IS SOLVED FOR, AND WHY THIS SURFACE AND NOT THE FLOOR ──────────────────────
 * `ForgeBackdrop.lightExposure` solves so its GROUND leaves the pipeline at the colour it was authored with,
 * and takes `Math.min` across channels so the binding one decides. The same rule, extended across SURFACES
 * because this scene has more than one: the exposure is the largest scalar at which no authored albedo
 * renders ABOVE the value it was authored with. Solved per surface, the floor takes 1.8494 and the wall
 * 1.4850 — `plate` is #FFFFFF, the scene's maximum albedo, and it also presents the larger N·L of the two
 * (0.6185 against the floor's 0.3791), so THE WALL BINDS at 1.4850 and the floor stays a little under its
 * hex. Taking the floor's number instead would put the wall through the clip, which is the failure being
 * repaired — and it is not hypothetical: FORCING the exposure to 2.0567, the floor's blue channel, clips
 * 11.54% of the light frame with p99 pinned at 255, measured on the real frame.
 *
 * ── AND THE EXPERIMENT THAT SENTENCE ORIGINALLY DESCRIBED DOES NOT WORK ─────────────
 * It used to read "replacing this `Math.min` with `Math.max` solves 2.0567". A skeptic performed
 * exactly that substitution and the solve returned **1.0000**, not 2.0567, so the frame came back
 * byte-identical to the pre-fix baseline rather than going red.
 *
 * The reason is two lines below: `out` is initialised to `Infinity`, so `Math.max(Infinity, x)` is
 * `Infinity`, and the refusal guard's `Number.isFinite(out) && out > 0 ? out : 1` converts that
 * straight to 1. THE GUARD SWALLOWS THE MUTATION. Reaching 2.0567 needs the initialiser changed too,
 * which the original claim never mentioned.
 *
 * The conclusion was right and the experiment offered for it was not, which is the worse of the two
 * errors: a reader who ran the stated mutation would have seen it pass and concluded the `Math.min`
 * was decorative. Corrected to name what was actually measured — the value forced directly — because
 * a comment describing an experiment nobody can reproduce is exactly the failure mode this file's
 * own doctrine calls out.
 *
 * ── WHAT THE MODEL DROPS, AND THE SIGN OF EVERY OMISSION ────────────────────────────
 * kd = (1-F)(1-metalness), the key's specular lobe, the shadow term, and the fog. `ForgeBackdrop` records
 * that the first two nearly cancel at 1.04%; the last two can only REDUCE a surface's radiance here — a
 * shadowed fragment is darker, and the fog colour (0.716, 0.784, 0.896) sits well below a lit white wall, so
 * mixing toward it pulls the peak down. Every omission therefore makes the solved exposure conservative,
 * which is the only direction that is safe: an over-estimate puts the clip back.
 *
 * MEASURED AGAINST THAT MODEL, and this is the check the model cannot perform on itself: swept on the real
 * frame, clipping is 0.00% at 1.72 and 5.90% at 1.80, so the true onset is ~1.75 and the solved value has
 * about 18% of margin — the sign the paragraph above predicts.
 *
 * DARK IS UNCHANGED BY CONSTRUCTION. `exposure` is the literal 1 there, and both ratios are 1 because their
 * numerator and denominator are the same record — so the two arguments the renderer receives are the same
 * expressions, not merely the same values.
 */
const lightExposure = (th: SceneTheme): number => {
  const key = th.keyGain / TH_DARK.keyGain;
  const ambient = th.ambientGain / TH_DARK.ambientGain;
  const sky = { zenith: th.skyZenith, horizon: th.skyHorizon, ground: th.ground };
  /* The floor and the walls, which are the two `scenery()` albedos this scene hands the lit pass over a large
     area. The gate is deliberately absent: at metalness 0.20 its radiance is dominated by a specular
     reflection of the sky that a Lambertian estimate does not model, and it is the smallest of the three —
     so it is left to the measurement above rather than guessed at here. */
  const surfaces: readonly { readonly albedo: Linear; readonly n: readonly [number, number, number] }[] = [
    { albedo: th.ground, n: [0, 1, 0] },
    { albedo: th.plate, n: [1, 0, 0] },
  ];
  let out = Infinity;
  for (const s of surfaces) {
    /* ABSOLUTE, because both walls are drawn: whichever way the key points, one of them presents this N·L. */
    const ndl = Math.abs(s.n[0] * LIGHT_TO[0] + s.n[1] * LIGHT_TO[1] + s.n[2] * LIGHT_TO[2]);
    const irr = skyIrradiance(s.n as [number, number, number], sky);
    const target = inverseToneMap(s.albedo);
    for (const c of [0, 1, 2] as const) {
      const peak = s.albedo[c] * ((KEY_TINT[c] * key * ndl) / Math.PI + irr[c] * AMBIENT_BASE * ambient);
      if (peak > 0) out = Math.min(out, target[c] / peak);
    }
  }
  /* A theme whose albedos are all black would divide by nothing and hand the renderer Infinity. Refused
     back to 1 rather than propagated: an unsolvable exposure must leave the rig exactly where it was. */
  return Number.isFinite(out) && out > 0 ? out : 1;
};

const rigFor = (th: SceneTheme) => {
  const exposure = th.name === 'dark' ? 1 : lightExposure(th);
  return {
    /* THE RATIO STILL COMES FROM THE THEME AND THE EXPOSURE MULTIPLIES BOTH TERMS, so key-against-ambient is
       untouched — the only thing that moved is where the pair sits on the curve. */
    key: (th.keyGain / TH_DARK.keyGain) * exposure,
    ambient: (th.ambientGain / TH_DARK.ambientGain) * exposure,
    shadow: th.shadowStrength / TH_DARK.shadowStrength,
    exposure,
  };
};

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

    // THE ONE PRESENT PATH (P4): copy → pipeline (bloom, the one tone map, the one encode) → FXAA → canvas.
    const presenter = createPresenter(stage);
    if ('kind' in presenter) { refuse(presenter.code); return; }
    presenter.resize(W, H);
    disposers.push(() => presenter.dispose());
    // THE STUDIO ON THE HERO (P4): the rendered environment lights this surface too — diffuse from a soft LOD, reflections by
    // roughness (env/sky.ts). Loaded once per context; the frame redraws when it lands; a failed fetch leaves the stops.
    let env: WebGLTexture | null = null;
    // Measured 2026-09-03: a dark env gain of 1.3 read the same panel coverage as .6 (.42 vs .43) — the channel's dark
    // shortfall is not lighting, so the gain stays at the heroes' common value.
    const HERO_ENV_GAIN = { dark: 0.6, light: 1.0 } as const;
    const withEnv = <S extends object | undefined>(s: S, th: { name: 'dark' | 'light' }) => (env ? { ...(s ?? {}), envMap: env, envGain: HERO_ENV_GAIN[th.name] } : s);
    // `redrawForTheme` returns early when the theme is unchanged; the map landing IS a change, so the guard is reset first.
    disposers.push(loadEnvironmentMap(gl, liveTheme(), (t) => { env = t; drawnTheme = null; redrawForTheme(); }, uploadEnvironment));
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

    /* THE ARCHITECTURE, which is the same for every dataset this channel can hold — so it carries no geometry
       cost per redraw. It is rebuilt as a JavaScript array per frame rather than held as one, because its
       ALBEDOS follow the theme and a `const` array would be the stale-theme snapshot `ForgeBackdrop.tsx:120-127`
       records the cost of. Eighteen draw descriptors — floor, two walls and three per gate across the five
       `GATE_BANDS` — over shared, already-uploaded meshes, so the whole rebuild is a JavaScript array. */
    const staticDrawsFor = (th: SceneTheme): LitDraw[] => {
      const gate = gateMatFor(th), channel = channelMatFor(th);
      const out: LitDraw[] = [
        { mesh: floorMesh!, model: floorModel, normalMat: N3,
          material: { baseColour: scenery(th, '#22304A', th.ground), roughness: 0.82, metalness: 0 } },
        { mesh: wallMesh!, model: modelAt(-(CHANNEL_HALF + 0.09), 0.625, CHANNEL_MID), normalMat: N3,
          material: channel },
        { mesh: wallMesh!, model: modelAt(CHANNEL_HALF + 0.09, 0.625, CHANNEL_MID), normalMat: N3,
          material: channel },
      ];

      /*
       * A GATE IS A PORTAL, NOT A PANE.
       *
       * §2 asks for a luminous membrane across the channel. A thin box spanning the aperture is exactly that and
       * it is OPAQUE, so five in a row make the channel a wall and nothing past the first gate exists — which
       * destroys the depth the whole environment is built on. So the membrane is its EDGE: two posts and a deck
       * sill as lit geometry that casts shadow, plus an outline traced on the full rectangle below — additive on
       * dark, opaque ink on light, for the measured reason at `strokesFor`. The aperture stays open either way.
       */
      for (let i = 0; i < GATE_BANDS.length; i++) {
        const z = gateZ(i);
        out.push(
          { mesh: postMesh!, model: modelAt(-(CHANNEL_HALF + 0.05), GATE_H / 2, z), normalMat: N3, material: gate },
          { mesh: postMesh!, model: modelAt(CHANNEL_HALF + 0.05, GATE_H / 2, z), normalMat: N3, material: gate },
          { mesh: sillMesh!, model: modelAt(0, 0.025, z), normalMat: N3, material: gate },
        );
      }
      return out;
    };

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
     *
     */
    const leadDraws = (c: Channel, th: SceneTheme): LitDraw[] | { refusal: string } => {
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
          /*
           * Colour REPEATS the height, deliberately: a single-channel encoding of the thing this environment
           * exists to show fails for anyone reading at a glance, and the redundancy costs a channel that has
           * nothing else to carry.
           *
           * ── WHAT THAT REDUNDANCY DOES NOT SURVIVE, MEASURED AND NOT FIXED HERE ──────────────
           * A STRAIGHT LINE IN LINEAR LIGHT BETWEEN TWO OPPOSING HUES PASSES THROUGH GREY, and this one
           * does. Forcing every lead to a fixed `settle` and reading the drawing buffer back (marks only,
           * derived chroma floor 60):
           *
           *                        settle 0      settle 0.6      settle 1
           *   dark   max chroma        134            31            119
           *          above floor      0.83%         0.00%          0.71%
           *   light  max chroma        110            41             38
           *          above floor      0.85%         0.00%          0.00%
           *
           * `pipelineChannel.ts:45` puts `STALL_ONSET` at 0.6 x `STALL_DAYS`, so settle 0.6 is the exact
           * point at which the page's own caption starts calling a lead stalled — and it is where the ramp
           * has NO hue left, on BOTH pages: not one pixel of either frame clears the floor there. Solved
           * from the albedos rather than read off the captures, red equals blue at settle 0.7932 for
           * [138,95,0] and 0.5587 for [230,160,40], and the measured collapse straddles both.
           *
           * IT IS RECORDED RATHER THAN FIXED because it is not a light-theme defect: the collapse is the
           * same in dark, so the path this mix takes cannot be changed without moving the dark frame, and
           * this pass is bounded by leaving dark untouched. The fix is a ramp that travels around the
           * neutral axis rather than through it, and it belongs to a change that owns both themes.
           */
          const col = mixLinear(hexToLinear(FRESH_HEX), statusAlbedo('conditional', th.name), p.settle ?? 0);
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
    const renderScene = (
      th: SceneTheme,
      /*
       * THE TWO POPULATIONS ARE HANDED IN SEPARATELY, and that split is the fix at `dataFogRatio`. Only
       * the LIT pass is split; the shadow pass and the depth prepass are still taken over `all`, because a
       * mark that stopped casting a shadow or stopped occluding would be a different scene, not a
       * differently fogged one.
       */
      parts: { readonly scenery: readonly LitDraw[]; readonly marks: readonly LitDraw[] },
    ): void => {
      const rig = rigFor(th);
      const stroke = strokesFor(th);
      const all = [...parts.scenery, ...parts.marks];
      lit.shadowPass(lightVP, all, shadow);
      target.bind();
      /* NO SKY BACKDROP, AND THE CLEAR IS THE FOG COLOUR. The channel is open-topped, so the sky stays as the
         irradiance environment; what it must not get is the sky DRAWN, which would make the most fogged part of
         the frame its brightest — the exact inverse of the reading. Clearing to the fog colour means every
         distant surface converges on a value the frame already has.
         THE FOG IS SCENERY and takes the theme: `theme.ts` derives `fog` from the sky rather than declaring it,
         because a fog colour that does not match what is behind it produces a seam exactly where the scene is
         meant to dissolve. Dark keeps this file's own #0C1322; light takes #DCE5F3. */
      const fc = fogColour(th);
      gl.clearColor(fc[0], fc[1], fc[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      lit.depthPrepass(vp, all);
      if (ao) {
        ao.compute({
          depthTexture: target.depthTexture, near: NEAR, far: FAR, fovDeg: VIEW.fovDeg ?? 35,
          aspect: W / H, radius: 0.36, strength: 1.25,
        });
        target.bind();
      }
      /* THE SKY IS AN IRRADIANCE ENVIRONMENT HERE AND NOTHING ELSE — it is never drawn — so it takes the theme's
         stops without any backdrop to keep in step. `undefined` on dark so the dark frame goes down the same path
         it shipped on rather than one that recomputes the same numbers. */
      const sky = withEnv(th.name === 'dark' ? undefined : {
        zenith: th.skyZenith, horizon: th.skyHorizon, ground: th.ground,
      }, th);
      /* EVERY ARGUMENT BUT THE DRAW LIST AND THE FOG DENSITY IS SHARED BY CONSTRUCTION, spread into both
         calls from one object rather than written twice. Two hand-maintained copies of a fourteen-field
         lighting call is how a mark pass ends up lit differently from the scenery it is measured against —
         the exact class of defect this split exists to remove, reintroduced by the fix for it. */
      const litCommon = {
        viewProj: vp, eye, lightDir: LIGHT_DIR,
        lightColour: [KEY_TINT[0] * rig.key, KEY_TINT[1] * rig.key, KEY_TINT[2] * rig.key] as const,
        ambientGain: AMBIENT_BASE * rig.ambient, sky, lightVP, shadow,
        shadowStrength: 0.92 * rig.shadow,
        shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE,
        ao: ao ? ao.texture : null, screenSize: [W, H] as const,
      };
      const haze = (density: number) => ({ density, height: 5.0, floor: 0, colour: fc });
      /* THE SCENERY TAKES THE FOG IT ALWAYS TOOK. Same expression, both themes. */
      lit.draw({ ...litCommon, draws: parts.scenery, fog: haze(FOG_DENSITY) });
      /* THE MARKS TAKE THE SAME EXPRESSION SCALED BY A RATIO THAT IS THE LITERAL 1 ON DARK. */
      lit.draw({ ...litCommon, draws: parts.marks, fog: haze(FOG_DENSITY * dataFogRatio(th)) });

      /*
       * DEPTH-TESTED, NOT DEPTH-WRITING — set by hand rather than with a helper that disables the depth test. An
       * untested outline draws over the objects in front of it, so every gate would appear nearer than every lead
       * that has already cleared it: the one thing this geometry exists to state, inverted. Testing keeps the
       * ordering; not writing keeps two crossing strokes from fighting over which is nearer.
       *
       * THE BLEND IS THE THEME'S, and `strokesFor` carries the measurement. Additive on dark: a reference is
       * emissive because on a dark ground light is how a mark is made. OFF on light: `lines.ts` writes alpha 1.0,
       * so with no blend the same call lays an opaque ink rule — which is how a mark is made on a bright ground.
       * The depth state is identical either way, so the ordering above is unaffected by which branch runs.
       */
      if (stroke.additive) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        gl.disable(gl.BLEND);
      }
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      for (let i = 0; i < GATE_BANDS.length; i++) {
        const z = gateZ(i);
        strokes.ruleAtDepth(vp, -CHANNEL_HALF, 0.02, CHANNEL_HALF, 0.02, z, 0.012, stroke.gate);
        strokes.ruleAtDepth(vp, -CHANNEL_HALF, GATE_H, CHANNEL_HALF, GATE_H, z, 0.010, stroke.gate);
        strokes.ruleAtDepth(vp, -CHANNEL_HALF, 0.02, -CHANNEL_HALF, GATE_H, z, 0.010, stroke.gate);
        strokes.ruleAtDepth(vp, CHANNEL_HALF, 0.02, CHANNEL_HALF, GATE_H, z, 0.010, stroke.gate);
      }
      for (const days of AXIS_TICK_DAYS) {
        const y = (1 - Math.min(1, days / STALL_DAYS)) * RAIL_LIFT + TICK_FLOOR_CLEARANCE;
        strokes.ruleAtDepth(vp, axisXOuter, y, axisXInner, y, axisZ, 0.006, stroke.axis);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      /* ENDS WITH `target` BOUND, which is what `probeSync` needs: a `readPixels` only guarantees completion of
         work affecting the framebuffer it reads, and this whole frame lands in the offscreen HDR target. */
    };
    const presentFrame = (): void => {
      presenter.present(target, { theme: liveTheme() });
    };

    /*
     * ONE REDRAW, WHICH IS THE WHOLE RESPONSE TO A NEW CHANNEL — no context, no program, no buffer.
     *
     * The derivation's own refusals live here rather than above the stage because they are properties of the
     * DATA: a channel the caption declined to describe must not be handed to a mesh builder, and that judgement
     * has to be made again on the second dataset as well as on the first.
     */
    /* Which theme the frame on screen was drawn at — see `SurfaceReliefGl.tsx`, A THEME CHANGE IS A REDRAW. */
    let drawnTheme: ThemeName | null = null;

    const draw = (c: Channel): 'STALE_TIER' | undefined => {
      /* READ PER FRAME, NOT CAPTURED AT SETUP — `ForgeBackdrop.tsx:120-127` records what the snapshot cost. */
      const th = sceneTheme(liveTheme());
      const refusal = channelRefusal(c);
      if (refusal !== null) { refuse(refusal); return undefined; }
      const leads = leadDraws(c, th);
      if ('refusal' in leads) { refuse(leads.refusal); return undefined; }
      /* THE SPLIT IS MADE HERE, WHERE THE TWO POPULATIONS ARE ALREADY SEPARATE OBJECTS, rather than by
         filtering a merged list on a material property downstream: a filter would have to recognise a mark
         by its colour, and the whole failure being repaired is that a mark's colour is not stable. */
      const parts = { scenery: staticDrawsFor(th), marks: leads };

      /*
       * THE PROBE. `pickQualityTier` exists to choose a tier from a measured frame and had no caller in the
       * repo; this is one. A discarded warm-up frame first, because the first frame pays shader upload and
       * charging that to the GPU would downgrade every machine, then two sync-bounded samples of which the
       * cheaper is used. All of it before the first blit, so it costs latency and not the picture. At most one
       * mount per page load takes it, and `needsQualityProbe()` is false for every LATER redraw — a data
       * update must never re-time the machine, or the ladder would follow the dataset instead of the GPU.
       */
      if (needsQualityProbe()) {
        const ms = measureFrameMs(gl, () => renderScene(th, parts));
        const r = recordQualityProbe({
          pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'PipelineReliefGl',
        });
        /* A LOWER TIER MEANS THIS BUILD IS STALE. Nothing is presented, the effect re-runs on the new tier, and
           the first thing the reader sees is the resolved tier — not a full frame that then changes. */
        if (r.tier !== tier) return 'STALE_TIER';
      }

      renderScene(th, parts);
      presentFrame();
      /* RECORDED ONLY ONCE THE FRAME IS PRESENTED, so a STALE_TIER return cannot leave the observer believing a
         theme is on screen that never reached it. */
      drawnTheme = th.name;
      /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted. */
      canvas.dataset.qualityTier = tier;
      /* AND THE SOLVED EXPOSURE, for the same reason. It is a number nothing in the frame announces, its
         whole justification is a measurement, and an audit that cannot read it back has to take the solve on
         trust. Four decimals: the solve is a ratio of continuous quantities, not a chosen constant. */
      canvas.dataset.lightExposure = rigFor(th).exposure.toFixed(4);
      /* AND THE SOLVED DATA-FOG RATIO, for exactly the same reason: it is a number the picture cannot
         announce, its whole justification is the measurement above, and the audit must be able to read it
         back rather than take it on trust. Four decimals — it is a ratio of two radiances, not a constant. */
      canvas.dataset.dataFog = dataFogRatio(th).toFixed(4);

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

    /* A THEME CHANGE IS A REDRAW, NOT A REBUILD — the full reasoning, including why `beforeprint` is needed for
       `BoardReport.tsx:105-109` specifically and why the `drawnTheme` guard is what makes the other three print
       handlers free, is in `SurfaceReliefGl.tsx` under that heading. */
    const redrawForTheme = (): void => {
      if (liveTheme() === drawnTheme) return;
      drawRef.current?.(channelRef.current);
    };
    const themeWatch = new MutationObserver(redrawForTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('beforeprint', redrawForTheme);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      themeWatch.disconnect();
      window.removeEventListener('beforeprint', redrawForTheme);
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
