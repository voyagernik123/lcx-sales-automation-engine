/**
 * E4 · THE ORRERY, as a product component rather than a harness.
 *
 * `docs/3d/e4` proved the environment; this is the part that ships. It draws the SAME entities and the SAME
 * couplings the node-link diagram beside it is drawing — one graph, two drawings — which is what makes the
 * two comparable at all and is the whole basis for putting a 3-D reading in front of an operator.
 *
 * ── THIS FILE IS ONLY EVER REACHED THROUGH A LAZY IMPORT ─────────────────────────────
 * `OntologyOrrery` imports it with `lazy()`, so none of it — nor any of `@lcx/gl` — lands in the initial
 * bundle. The perf budget measures RAW pre-gzip initial JS with about 11 KB of headroom for the whole
 * application, and the environment layer alone is 35.7 KB. An eager import would spend all of it and more on
 * a view most readers never open. Same discipline as `ForgeBackdrop` and `SurfaceReliefGl`.
 *
 * ── THE GEOMETRY DECISIONS ARE NOT HERE ──────────────────────────────────────────────
 * `orrery/orreryLayout.ts` owns every position, every scale and every count, because those are the claims and
 * a claim needs a unit test rather than a screenshot. This file turns them into draw calls and refuses when
 * the GPU will not do it. On any refusal it renders NOTHING and calls `onRefused`, and the parent puts the
 * reader back on the diagram — §6 rule 1, and the reason the parent owns the fallback: a component that
 * cannot construct its renderer cannot be trusted to draw its own escape hatch.
 *
 * ── NO IDLE ANIMATION, AND THEREFORE NO ORBITAL MOTION ───────────────────────────────
 * §6 rule 2. The orbits are a single frozen phase: one frame is rendered and the renderer stops. There is no
 * `requestAnimationFrame` and no `setInterval` anywhere in this file, which is also why reduced motion needs
 * no branch — a still frame is already the final frame. A still of an orrery invites the assumption that it
 * turns; it does not, and the caption says so.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createStage, isStage, plane, sphere, cylinder, torus, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, viewProjection, lightViewProjection, boundsCentre, boundsRadius, projectScreen,
  hexToLinear, mixLinear, assertBrandFidelity, IDENTITY,
  createPresenter, loadEnvironmentMap, uploadEnvironment,
  qualitySettings, shadowMapSizeFor, pickQualityTier,
  type LitDraw, type Geometry, type Linear,
} from '@lcx/gl';
/* A SUB-PATH IMPORT, NOT THE BARREL — `docs/3d/w2/SUBPATH_COST.md`; `SurfaceReliefGl.tsx` carries the reason. */
import { sceneTheme, liveTheme, type SceneTheme, type ThemeName } from '@lcx/gl/look/theme.js';
import {
  useResolvedQualityTier, needsQualityProbe, measureFrameMs, recordQualityProbe,
} from '../shared/useQualityTier';
import {
  buildOrrery, isOrreryRefusal, ORRERY_PLANES, ABSENT_GEOM, WITHHELD_R, WITHHELD_H, DECK_Y,
  type OrreryInput, type OrreryLayout, type V3,
} from '@/components/geometry/orrery/orreryLayout';

/** What the renderer hands back to the wrapper: the numbers, plus where two labels landed on screen. */
export interface OrreryReading {
  readonly layout: OrreryLayout;
  readonly labels: readonly { readonly id: string; readonly label: string; readonly xPct: number; readonly yPct: number; readonly role: 'core' | 'selected' }[];
  readonly triangles: number;
  readonly drawCalls: number;
}

export interface OntologyOrreryGlProps {
  readonly input: Omit<OrreryInput, 'cssWidth' | 'cssHeight'>;
  /** Called with a stable code when the view cannot be drawn. The parent then shows the flat diagram. */
  readonly onRefused: (code: string, reason: string) => void;
  /** Called once per successful frame with everything the HUD prints. */
  readonly onReading: (r: OrreryReading) => void;
}

/* Comments live ABOVE the shader literals, never inside them: a comment inside a template literal is shipped
   bytes a minifier cannot reach, and a backtick inside one terminates it. That has bitten twelve times here. */
/* The present shaders that used to live here moved into the engine's ONE present path (look/present.ts, P4). */

/*
 * COLOUR CARRIES THE DATA STATE, NOT THE ENTITY KIND — a deliberate division, and E4's.
 *
 * Kind is already encoded by inclination, which is the axis this environment exists to spend. Using colour for
 * it as well would leave nothing for the distinction the honesty rules actually require: observed against
 * absent against withheld. So every observed body is the same brand blue and the palette stays exact under
 * `assertBrandFidelity`; five invented kind hues would not have.
 */
const OBSERVED_HEX = '#2C6BFF';
const CORE_HEX = '#7FB2FF';
const LINK_HEX = '#7FB2FF';
/**
 * ══ THE ABSENT RING IS DRAWN IN THE PALETTE'S `reference` HEX, AND THAT IS A COLLISION ══════════════
 *
 * Recorded rather than fixed, and recorded HERE because the next reader's instinct is to swap it for a
 * grey and that is measurably worse. Full working: `docs/3d/w2/COLOUR_LANGUAGE.md` §9.3.
 *
 * WHAT IT ENCODES HERE. `magnitudeOf` maps `confidence: 'Low'` to `{ state: 'absent' }`, and this ring is
 * the only thing that draws it. Four records in `apps/web/src/data/states.ts` carry that confidence, so
 * this mark is on the frame — unlike the withheld drum, whose `restricted: true` arm nothing in the
 * shipped ontology sets (`orreryLayout.ts` says so, and the only occurrences are in the test file). The
 * claim it makes is ABSENCE: no measurement exists.
 *
 * WHAT THE PALETTE SAYS IT IS. `colour.ts` reserves `#FF8A3D` for "REFERENCE marks — percentiles,
 * thresholds, targets. Deliberately not a data hue", and `categorical.ts` DERIVES the same answer from
 * chroma: 70.5, well above the density ramp's floor of 40.2, so the partition files it as `annotation`.
 * An absence mark has no hue to be read by; that is what makes it read as absence rather than as a value.
 *
 * AND WHAT THE PRODUCT ACTUALLY DOES WITH IT IS WORSE THAN "ANNOTATION". `StormReliefGl.tsx:350` and its
 * flat twin `RiskCalendar.tsx:58` use this exact literal as the HIGH END OF THE RISK RAMP — the most
 * severe MEASURED day. So one hex says "the largest value on the scale" two surfaces away and "there is
 * no value" here, which is precisely the confusion §6 rule 6 exists to prevent, one level up from a
 * single frame. `COLOUR_LANGUAGE.md` §4.1 refuses to retint that ramp, with a good argument — it is the
 * one place a figure and its 3-D twin were deliberately made to agree — so the ramp is not the end that
 * can move.
 *
 * WHY THIS END DOES NOT MOVE EITHER, AND IT IS A MEASUREMENT. The absence family has exactly ONE member
 * — `refusal` #6B7A99 — and this surface has already spent it on the withheld drum. Measured on a lit
 * sphere under this rig, `refusal` at ten exposures against `refusal` itself (p05, dark/light):
 *
 *   -1.8 stops #3a4355  11.09 / 13.98      0 stops #6b7a99   1.45 /  1.07
 *   -1.2 stops #485268   7.60 / 10.22   +0.7 stops #8698be   6.73 /  6.49
 *   -0.7 stops #55617a   4.14 /  5.94   +1.5 stops #adc4f4  15.60 / 14.64
 *
 * Nothing within 1.5 stops of `refusal` clears the floor against it. The two ends that do are a
 * near-black and a colour lighter than every observed body — an absence mark parked at one end of the
 * value scale, which is the failure rule 6 names in as many words. So a SEPARATED move needs a second
 * absence entry in `colour.ts`: low-chroma, and ≥ 10 CIEDE2000 from `refusal` through a lit rig without
 * being darker or lighter than the data.
 *
 * THE OTHER MOVE IS REAL AND IS NOT REFUSED, IT IS UNOWNED. `COLOUR_LANGUAGE.md` §7.2 proposes exactly
 * this for E3 — its amber absent ring becomes `refusal`, and E3 keeps its two absences apart by SHAPE.
 * E4 could take the same move: this file already distinguishes them by shape on purpose (`orreryLayout.ts`
 * — "absent is a hollow ring and withheld is a sealed drum, and neither is a sphere"), and measured, a
 * grey absent ring clears every governed pair on this surface once the core is a dielectric. The
 * difference from E3 is what it costs: E3's two absences stay two different values, E4's would become the
 * SAME value — absent against withheld falls from p05 32.82 to 1.45, so the ring and the drum would be
 * one colour and the reader would have shape alone. That is a product decision, and it is not this file's
 * alone to take, because of the caption below.
 *
 * TWO THINGS THAT KEEP IT SAFE INSIDE THIS FRAME, neither of which excuses the collision. This surface
 * draws no reference or threshold mark at all — grep it: the only claim colours are the five above — so
 * `#FF8A3D` is unambiguous WITHIN the frame. And the two absence states stay far apart here: absent
 * against withheld measures p05 32.82 dark / 33.36 light, where two greys would measure 1.45.
 *
 * AND IT CANNOT MOVE ALONE: `OntologyOrrery.tsx:252` captions this mark to the reader as "amber ring",
 * so the hex and that caption change in one commit or the surface starts lying about itself.
 */
const ABSENT_HEX = '#FF8A3D';
const WITHHELD_HEX = '#6B7A99';
/**
 * ══ THE SCENERY, AND THE THREE-WAY ORDERING THAT IS THE READING ═════════════════════════════════════
 *
 * The rings are the AXIS and the tubes are the DATA, so the rings must lose on value: same thickness, lower
 * value, structure recedes. The collapsed rings on the plate are the flat control and lose again. The deck is
 * darker than the palette's plate (#0E1628) deliberately: a horizontal plane takes the key light at nearly
 * N·L = 1, so its own albedo is the only thing holding it below the bodies in value.
 *
 * ── WHY THE LIGHT VALUES ARE SOLVED RATHER THAN PICKED ───────────────────────────────
 * `theme.ts` has two role colours in the right family — `ground` and `rule` — but three surfaces need places on
 * that ramp, and the ORDER between them is the whole point. Measured WCAG luminance of the three dark albedos:
 * deck #090F1C 0.0048, flat ring #141F38 0.0141, inclined ring #22355E 0.0369. The flat ring sits at
 * (0.0141 − 0.0048) / (0.0369 − 0.0048) = 0.2898 of the way from the deck to the inclined ring, so the light
 * value is that same fraction of the way from `ground` to `rule` — 0.29 is a solved number, not a taste.
 *
 * The result carries the relationship the dark frame was authored with. Inclined ring against the deck measures
 * 1.586:1 on dark and 1.463:1 on light — 0.12 apart, which `reliefTheme.test.tsx` pins with a 0.15 bound — and
 * the flat control lands between the deck and the ring on both. (An earlier draft of this note said 1.55 for the
 * light pair; that was arithmetic done by eye, and the test that computes it is what caught it.)
 *
 * CLEAR is the void the deck floats in, and on dark it is BELOW the deck (#05070E under #090F1C). On light
 * "below" inverts, so it takes `plate` (#FFFFFF, luminance 1.0) — above `ground` (0.8438) and therefore above
 * the deck, which is the same statement mirrored. `structure` is not used here: at 0.6113 it would land between
 * `rule` and `ground` and put the void on the wrong side of the deck.
 */
const RING_HEX = '#22355E';
const FLAT_RING_HEX = '#141F38';
const DECK_HEX = '#090F1C';
const CLEAR_HEX = '#05070E';
/** Solved from the dark albedo luminances above. Anything else here would be a value nobody derived. */
const FLAT_RING_T = 0.2898;

const scenery = (th: SceneTheme, darkHex: string, light: Linear): Linear =>
  (th.name === 'dark' ? hexToLinear(darkHex) : light);

/** The dark theme's record, held only as the denominator of the light rig's ratio — see `SurfaceReliefGl.tsx`,
    THE LIGHT RIG MOVES BY RATIO. Nothing reads a colour out of it. */
const TH_DARK = sceneTheme('dark');
const rigFor = (th: SceneTheme) => ({
  key: th.keyGain / TH_DARK.keyGain,
  ambient: th.ambientGain / TH_DARK.ambientGain,
  shadow: th.shadowStrength / TH_DARK.shadowStrength,
});

const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` has length 0, every vertex collapses to the origin,
   and the frame comes back a clear colour with a complete framebuffer and no error raised. It cost E0 a day. */
const scaledAt = (p: V3, s: number): Float32Array => {
  const m = IDENTITY();
  m[0] = s; m[5] = s; m[10] = s;
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  return m;
};

/**
 * A LINK'S MODEL MATRIX IS A BASIS, NOT A ROTATION SOLVED FOR.
 *
 * Two columns are the tube's radial directions scaled by its thickness and the third is the link direction
 * scaled by its length; the translation is the midpoint. Built this way there is no axis-angle to get
 * backwards and no gimbal case, only the degenerate one where two entities coincide — which refuses.
 *
 * The normal matrix is the inverse transpose, which for M = [u·r | d·L | v·r] is [u/r | d/L | v/r]. Getting it
 * wrong under non-uniform scale does not throw: it lights a thin tube as though it were round, which reads as
 * a material that is subtly wrong and nothing more.
 */
function linkTransform(a: V3, b: V3, r: number): { model: Float32Array; normal: Float32Array } | null {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  if (L < 1e-6) return null;
  const dn: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: V3 = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0: V3 = [
    dn[1] * ref[2] - dn[2] * ref[1],
    dn[2] * ref[0] - dn[0] * ref[2],
    dn[0] * ref[1] - dn[1] * ref[0],
  ];
  const ul = Math.hypot(u0[0], u0[1], u0[2]) || 1;
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [
    dn[1] * u[2] - dn[2] * u[1],
    dn[2] * u[0] - dn[0] * u[2],
    dn[0] * u[1] - dn[1] * u[0],
  ];
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

/**
 * THE ABSENT RING HAS TO FACE THE READER.
 *
 * `torus` lies in the XZ plane, so an unrotated ring is HORIZONTAL, and at a 26-degree camera a horizontal
 * ring is a three-pixel sliver — an amber smear that reads as a rendering fault rather than as a ring, which
 * destroys the whole point: the ring's job is to be visibly NOT a sphere. So its axis aims at the eye. A
 * facing derived from a convention can be backwards; one aimed at the camera cannot.
 */
function facingBasis(p: V3, towards: V3): { model: Float32Array; normal: Float32Array } {
  const d: V3 = [towards[0] - p[0], towards[1] - p[1], towards[2] - p[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1;
  const ax: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0: V3 = [
    ax[1] * ref[2] - ax[2] * ref[1],
    ax[2] * ref[0] - ax[0] * ref[2],
    ax[0] * ref[1] - ax[1] * ref[0],
  ];
  const ul = Math.hypot(u0[0], u0[1], u0[2]) || 1;
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [
    ax[1] * u[2] - ax[2] * u[1],
    ax[2] * u[0] - ax[0] * u[2],
    ax[0] * u[1] - ax[1] * u[0],
  ];
  const m = IDENTITY();
  m[0] = u[0]; m[1] = u[1]; m[2] = u[2];
  m[4] = ax[0]; m[5] = ax[1]; m[6] = ax[2];
  m[8] = v[0]; m[9] = v[1]; m[10] = v[2];
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  /* A rotation's inverse transpose is itself, so the same nine numbers serve as the normal matrix. */
  return { model: m, normal: new Float32Array([u[0], u[1], u[2], ax[0], ax[1], ax[2], v[0], v[1], v[2]]) };
}

/** Rotation for an orbit RING, which `torus` emits in the XZ plane. Same convention as `orbitPoint`. */
function orbitBasis(incDeg: number, nodeDeg: number): { model: Float32Array; normal: Float32Array } {
  const RAD = Math.PI / 180;
  const i = incDeg * RAD, n = nodeDeg * RAD;
  const ci = Math.cos(i), si = Math.sin(i), cn = Math.cos(n), sn = Math.sin(n);
  const r9 = new Float32Array([cn, 0, -sn, sn * si, ci, cn * si, sn * ci, -si, cn * ci]);
  const m = IDENTITY();
  m[0] = r9[0]!; m[1] = r9[1]!; m[2] = r9[2]!;
  m[4] = r9[3]!; m[5] = r9[4]!; m[6] = r9[5]!;
  m[8] = r9[6]!; m[9] = r9[7]!; m[10] = r9[8]!;
  return { model: m, normal: r9 };
}

/**
 * THIS SCENE'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * `env/quality.ts:91` records why: wiring the ladder in with the tier's ABSOLUTE `shadowMapSize` silently
 * enlarged three environments — E0, E2 and E8 had each chosen 1024 and were handed 1536 at the default tier, a
 * 2.25x bigger map and three captures that changed without anyone saying so. The shadows here are load-bearing
 * (the gap between a body and its shadow IS the height), so this baseline is a reading decision, not a budget.
 */
const SHADOW_BASELINE = 1024;

export default function OntologyOrreryGl({ input, onRefused, onReading }: OntologyOrreryGlProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* Subscribed rather than read once: this surface renders one frame into an offscreen target and only then
     blits it, so a resolved lower tier can rebuild the scene before anything has been painted. */
  const tier = useResolvedQualityTier();
  /*
   * THE SIZE IS MEASURED, AND IT IS ROUNDED TO A STEP ON PURPOSE.
   *
   * This canvas lives in a flex column that resizes with the window, and every pixel claim the layout makes —
   * the 9-pixel body floor, the 3.2-pixel tube — is against these numbers, so a stale size is a false claim
   * rather than a blurry picture. But rebuilding a GL context per resize event would rebuild it sixty times
   * during one window drag. Snapping to 32-pixel steps bounds that to the handful of steps a drag crosses, and
   * it is also what stops the measure-then-set-state pair from oscillating.
   */
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  /**
   * THE REDRAW LIVES IN A REF, AND THAT IS WHAT KEEPS ONE GL CONTEXT ACROSS A DATA CHANGE.
   *
   * `input` used to be in the render effect's dependency list at :575, so every filter AND every SELECTION —
   * `selectedId` is a member of the memoised `input` — disposed the stage and built a new one. Measured with a
   * counting WebGL2 context, one change to `input` cost **1 context, 4 programs, 8 shaders, 10 vertex arrays,
   * 37 bufferData calls, 6 textures, 5 framebuffers and 399,612 bytes**. Clicking an entity is not a new scene.
   *
   * (The `[]` at the end of the ResizeObserver effect below is that observer's dependency list, not this one.
   * An earlier reading of this file mistook the two and recorded E4 as already inert.)
   *
   * WHAT IS ACTUALLY DATA HERE is the deck plane, whose size is `L.deckSize`, and one ring torus per shell
   * radius. The unit sphere, the absent ring, the withheld cylinder and the unit link cylinder are shared by
   * every body in every ontology and are uploaded once.
   */
  const drawRef = useRef<((i: OntologyOrreryGlProps['input']) => 'STALE_TIER' | undefined) | null>(null);
  /* THE LATEST GRAPH, so a TIER or SIZE change can redraw it: the setup effect re-runs on those while the draw
     effect below does not, and a rebuilt context with no draw is a blank canvas over the flat diagram. */
  const inputRef = useRef<OntologyOrreryGlProps['input']>(input);

  /* THE DRAW EFFECT IS DECLARED FIRST, AND THE ORDER IS LOAD-BEARING. React runs effects in declaration order,
     so on MOUNT this one records the graph and returns (nothing is published yet) and the setup effect draws
     it. On a DATA CHANGE only this one re-runs, and the context is untouched. */
  useEffect(() => {
    inputRef.current = input;
    drawRef.current?.(input);
  }, [input]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const snap = (n: number): number => Math.max(0, Math.round(n / 32) * 32);
    const measure = (): void => {
      const w = snap(host.clientWidth), h = snap(host.clientHeight);
      setSize((prev) => (prev !== null && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    /*
     * MEASURE FIRST, OBSERVE ONLY IF THE OBSERVER EXISTS — copied deliberately from
     * `market/GlobeRelief.tsx:135-142`, which guards the identical call for the identical reason.
     *
     * Unguarded, `new ResizeObserver` throws when the API is absent, and it throws INSIDE an effect, which
     * React escalates to unmounting the WHOLE SUBTREE. Measured both ways, `<OntologyOrrery>` rendered with
     * `ResizeObserver` deleted from the global and the relief toggled on:
     *
     *   unguarded: `container.innerHTML.length` = 0. The flat diagram was GONE, no refusal was announced
     *              (`[role="alert"]` null), and an uncaught `ReferenceError: ResizeObserver is not defined`
     *              escaped as an unhandled error that any other test file in the run could inherit.
     *   guarded:   1,047 bytes of DOM, the flat diagram present, and the refusal announced as
     *              `NO_WEBGL2` with its reason — E4's fallback, doing its job.
     *
     * So the failure of the relief was DESTROYING the surface §6 rule 1 exists to preserve: not a downgrade
     * in information, the loss of all of it, and silently.
     *
     * Honestly: every browser since Safari 13.1 (March 2020) has `ResizeObserver`, so this line fixes
     * nothing a reader will hit. Its real value is that the refusal path is now REACHABLE FROM A TEST at
     * all — an environment without the API can exercise E4's fallback instead of taking the suite with it.
     * Without the observer the orrery simply keeps the size it was first measured at.
     */
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size === null) return;
    drawRef.current = null;

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map
     * there is no point rendering: the frame would be off-brand by an amount too small to see and too large to
     * be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) {
      onRefused('BRAND_FIDELITY_FAILED', 'the brand palette does not survive this pipeline unchanged');
      return;
    }

    /* THE LAYOUT AND ITS REFUSALS COME FIRST, before a context is created. A geometry refusal — an entity kind
       with no plane, a system that merges at every viewpoint — is not the GPU's fault and must not cost a
       WebGL context to discover.
       READ THROUGH THE REF, NOT THE PROP: this is a check on the data, but it must not put the data back in the
       dependency list below; `draw` runs the same layout on every later graph. */
    const firstOutcome = buildOrrery({ ...inputRef.current, cssWidth: size.w, cssHeight: size.h });
    if (isOrreryRefusal(firstOutcome)) { onRefused(firstOutcome.code, firstOutcome.reason); return; }

    /* DPR CAPPED BY THE TIER. Everything in this frame is fill-bound, so a 3× display would triple the cost of
       a reading whose whole justification is that an operator gets an answer faster. The cap WAS a literal 2;
       `Q.dprScale` is 2 at `full` and `reduced` and 1 at `minimum`. */
    const Q = qualitySettings(tier);
    const dpr = Math.min(Q.dprScale, Math.max(1, window.devicePixelRatio || 1));
    const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code, out.reason); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    /*
     * TWO DISPOSAL LISTS, BECAUSE TWO LIFETIMES. `disposers` holds what the SIZE and the TIER own — the context,
     * the programs, the target, the shadow map and the four shared body meshes. `shapeDisposers` holds the deck
     * plane and the ring tori, whose dimensions are `L.deckSize` and `L.shells` and therefore the ontology. A
     * graph that keeps the same deck size and shell radii — which is every SELECTION change — reuses both.
     */
    const shape: { key: string | null; disposers: (() => void)[] } = { key: null, disposers: [] };
    const releaseShape = (): void => {
      for (const d of shape.disposers.reverse()) d();
      shape.disposers = [];
      shape.key = null;
    };
    /* Set by whichever of `refuse` and the cleanup runs first. A redraw can refuse now, so both are reachable in
       one mount, and `disposers.reverse()` MUTATES — running it twice disposes forwards. */
    let dead = false;
    const releaseAll = (): void => {
      if (dead) return;
      dead = true;
      releaseShape();
      /* DISPOSE IN REVERSE, AND THE STAGE LAST. It owns the context; releasing it first leaves every other
         delete* call operating on a dead context — silent rather than fatal, and it leaks on every remount. */
      for (const d of disposers.reverse()) d();
      stage.dispose();
    };
    const refuse = (code: string, reason: string): void => {
      drawRef.current = null;
      releaseAll();
      onRefused(code, reason);
    };

    // THE ONE PRESENT PATH (P4): copy → pipeline (bloom, the one tone map, the one encode) → FXAA → canvas.
    const presenter = createPresenter(stage);
    if ('kind' in presenter) { refuse(presenter.code, presenter.reason); return; }
    presenter.resize(W, H);
    disposers.push(() => presenter.dispose());
    // THE STUDIO ON THE HERO (P4): the rendered environment lights this surface too — diffuse from a soft LOD, reflections by
    // roughness (env/sky.ts). Loaded once per context; the frame redraws when it lands; a failed fetch leaves the stops.
    let env: WebGLTexture | null = null;
    const HERO_ENV_GAIN = { dark: 0.6, light: 1.0 } as const;
    const withEnv = <S extends object | undefined>(s: S, th: { name: 'dark' | 'light' }) => (env ? { ...(s ?? {}), envMap: env, envGain: HERO_ENV_GAIN[th.name] } : s);
    // `redrawForTheme` returns early when the theme is unchanged; the map landing IS a change, so the guard is reset first.
    disposers.push(loadEnvironmentMap(gl, liveTheme(), (t) => { env = t; drawnTheme = null; redrawForTheme(); }, uploadEnvironment));
    const lit = createLitRenderer(stage);
    if ('kind' in lit) { refuse(lit.code, lit.reason); return; }
    disposers.push(() => lit.dispose());
    const target = createTarget3D(stage, W, H);
    if ('kind' in target) { refuse(target.code, target.reason); return; }
    disposers.push(() => target.dispose());
    /*
     * SHADOWS YES, AMBIENT OCCLUSION NO, AND THE OMISSION IS A MEASUREMENT RATHER THAN A SAVING.
     *
     * The shadows are load-bearing: a sphere floating over a plate is at an ambiguous height — the eye cannot
     * separate "small and close to the plate" from "large and high above it" — and the gap between a body and
     * its own shadow IS the height, which is the reading inclination depends on.
     *
     * Ambient occlusion was measured in the harness at E4's own settings and changed 0.44% of the frame: it
     * modulates the AMBIENT term only, the ambient here is a dark instrument sky, and a system of separated
     * spheres in open space has almost no concavities to occlude. Running it would cost a half-resolution
     * depth gather for a difference no reader can see. It also happens to avoid a live `@lcx/gl` defect where
     * a missing shadow map and a missing AO texture together leave two samplers bound to the float scene
     * target; the shadow map is present here, so that pairing cannot arise.
     */
    const shadow = createShadowMap(stage, shadowMapSizeFor(tier, SHADOW_BASELINE));
    if ('kind' in shadow) { refuse(shadow.code, shadow.reason); return; }
    disposers.push(() => shadow.dispose());

    /* ── THE SHARED MESHES. One unit sphere scaled per body: a uniform scale leaves a normal's DIRECTION
       unchanged, so the identity normal matrix is correct and the shader normalises what it is handed. These
       four are the same for every ontology, so they are uploaded once and survive every redraw. ── */
    const sphereGeo = sphere(1, 20, 28);
    const absentGeo = torus(ABSENT_GEOM.ringRadius, ABSENT_GEOM.tubeRadius, 44, 14);
    const withheldGeo = cylinder(WITHHELD_R, WITHHELD_H, 36);
    /* A UNIT CYLINDER along Y, radius 1, height 1, so a link's model matrix carries its thickness in two
       columns and its length in the third and nothing is re-uploaded per link. */
    const linkGeo = cylinder(1, 1, 14);

    type Mesh = { vao: WebGLVertexArrayObject; indexCount: number; indexType: number; dispose(): void };
    const meshes = new Map<string, Mesh>();
    const shared: readonly (readonly [string, Geometry])[] = [
      ['sphere', sphereGeo], ['absent', absentGeo], ['withheld', withheldGeo], ['link', linkGeo],
    ];
    for (const [k, g] of shared) {
      const m = uploadMesh(stage, g);
      if ('kind' in m) { refuse(m.code, m.reason); return; }
      meshes.set(k, m);
      disposers.push(() => m.dispose());
    }
    const meshOf = (k: string) => meshes.get(k)!;

    /*
     * ONE REDRAW, WHICH IS THE WHOLE RESPONSE TO A NEW GRAPH — no context, no program, no target, no shadow map.
     *
     * The DECK and the RINGS are the only geometry the ontology sizes: the plate is `L.deckSize` across and
     * there is one torus per shell radius. They are keyed, so a change that leaves the deck and the shells where
     * they were — which is every SELECTION change, the commonest interaction on this surface — reuses them too.
     */
    /* Which theme the frame on screen was drawn at — see `SurfaceReliefGl.tsx`, A THEME CHANGE IS A REDRAW. */
    let drawnTheme: ThemeName | null = null;

    const draw = (graph: OntologyOrreryGlProps['input']): 'STALE_TIER' | undefined => {
      /* READ PER FRAME, NOT CAPTURED AT SETUP — `ForgeBackdrop.tsx:120-127` records what the snapshot cost. */
      const th = sceneTheme(liveTheme());
      const rig = rigFor(th);
      /* NO SKY BACKDROP IS DRAWN HERE, so the sky is purely the irradiance environment and has no backdrop to
         stay in step with. `undefined` on dark so that frame takes the path it shipped on. */
      const sky = withEnv(th.name === 'dark' ? undefined : {
        zenith: th.skyZenith, horizon: th.skyHorizon, ground: th.ground,
      }, th);
      const outcome = buildOrrery({ ...graph, cssWidth: size.w, cssHeight: size.h });
      if (isOrreryRefusal(outcome)) { refuse(outcome.code, outcome.reason); return undefined; }
      const L = outcome;

      const key = `${L.deckSize}:${L.ringTube}:${L.shells.join(',')}`;
      if (key !== shape.key) {
        releaseShape();
        /* One ring geometry per shell radius. Each is used twice: inclined above the plate for a (kind, shell)
           that is occupied, and flat on the plate as the collapsed control. */
        const shaped: readonly (readonly [string, Geometry])[] = [
          ['deck', plane(L.deckSize, 48)],
          ...L.shells.map((r, i) => ['ring' + i, torus(r, L.ringTube, 128, 8)] as const),
        ];
        for (const [k, g] of shaped) {
          const m = uploadMesh(stage, g);
          if ('kind' in m) { refuse(m.code, m.reason); return undefined; }
          const prev = meshes.get(k);
          if (prev) prev.dispose();
          meshes.set(k, m);
          shape.disposers.push(() => m.dispose());
        }
        shape.key = key;
      }

      const draws: LitDraw[] = [
        {
          mesh: meshOf('deck'), model: scaledAt([0, DECK_Y, 0], 1), normalMat: N3,
          material: { baseColour: scenery(th, DECK_HEX, th.ground), roughness: 0.9, metalness: 0 },
        },
      ];
      /*
       * STRUCTURE DOES NOT CAST. In E4's first capture the orbit rings dropped concentric shadow ellipses onto
       * the plate, and a shadow of an axis is indistinguishable from an axis: the frame appeared to have twice as
       * many shells as the ontology has. The links came out too — their shadows were near-vertical black stripes,
       * and a dark stripe on a plate covered in tubes reads as another tube. The shadow says how high each BODY
       * sits above the reference plane; anything else it says is noise on top of that.
       */
      const casters: LitDraw[] = [];

      /*
       * THE FLAT ALTERNATIVE IS IN THE SAME FRAME, AS THE REFERENCE PLANE.
       *
       * One faint ring per SHELL is drawn flat on the plate, against one ring per (kind, shell) inclined above
       * it. That is the collapse the third axis undoes, drawn rather than argued: flattened, a licence's one-hop
       * ring and a requirement's one-hop ring are the same circle. `flatRingsCollapsed` is the count.
       */
      L.shells.forEach((_, i) => {
        draws.push({
          mesh: meshOf('ring' + i), model: scaledAt([0, DECK_Y + 0.02, 0], 1), normalMat: N3,
          material: {
            baseColour: scenery(th, FLAT_RING_HEX, mixLinear(th.ground, th.rule, FLAT_RING_T)),
            roughness: 0.7, metalness: 0.1,
          },
        });
      });

      /* One inclined ring per (kind, shell) that is actually occupied. A ring drawn where no entity sits would
         be a structure claiming a population it does not have. */
      const ringKeys = new Set<string>();
      for (const b of L.bodies) {
        if (b.offSystem || b.isCore || b.hops === null) continue;
        const key = b.kind + '@' + String(b.hops);
        if (ringKeys.has(key)) continue;
        ringKeys.add(key);
        const shellIndex = L.shells.indexOf(b.shell);
        if (shellIndex < 0) continue;
        /* THE SAME PLANE TABLE THE POSITIONS CAME FROM. Two copies of these angles is how a ring ends up drawn
           through bodies that are not on it — the layout would be right and the axis it is read off would be a
           few degrees wrong, which is invisible and total. */
        const pl = ORRERY_PLANES[b.kind] ?? { incDeg: 0, nodeDeg: 0 };
        const basis = orbitBasis(pl.incDeg, pl.nodeDeg);
        draws.push({
          mesh: meshOf('ring' + shellIndex), model: basis.model, normalMat: basis.normal,
          material: { baseColour: scenery(th, RING_HEX, th.rule), roughness: 0.55, metalness: 0.2 },
        });
      }

      for (const l of L.links) {
        const tf = linkTransform(l.a, l.b, l.r);
        if (!tf) continue;
        draws.push({
          mesh: meshOf('link'), model: tf.model, normalMat: tf.normal,
          material: { baseColour: hexToLinear(LINK_HEX), roughness: 0.34, metalness: 0.12 },
        });
      }

      for (const b of L.bodies) {
        const d: LitDraw = b.magnitude.state === 'absent'
          ? ((): LitDraw => {
            const f = facingBasis(b.pos, L.eye);
            return {
              mesh: meshOf('absent'), model: f.model, normalMat: f.normal,
              /* Roughness up and metalness down: once the ring faces the reader its normals point at the reader
                 and the key light comes from above, so the diffuse term along the top of the tube is all there
                 is. A metal here reflects a dark interior sky and comes back nearly black. */
              material: { baseColour: hexToLinear(ABSENT_HEX), roughness: 0.52, metalness: 0.04 },
            };
          })()
          : b.magnitude.state === 'withheld'
            ? {
              mesh: meshOf('withheld'), model: scaledAt(b.pos, 1), normalMat: N3,
              /* METALNESS 0.15, NOT 0.58, and that was a material error rather than a taste one: a metal has no
                 diffuse term, it shows its environment, and this environment is a dark instrument interior. The
                 one body whose job is to be seen and not read was the hardest thing on the frame to find. */
              material: { baseColour: hexToLinear(WITHHELD_HEX), roughness: 0.42, metalness: 0.15 },
            }
            : {
              mesh: meshOf('sphere'), model: scaledAt(b.pos, b.radius), normalMat: N3,
              /*
               * EVERY BODY IS A DIELECTRIC, AND THE CORE IS THE POLISHED ONE. Measured 2026-08-15;
               * the whole curve is in `docs/3d/w2/COLOUR_LANGUAGE.md` §9.
               *
               * The core shipped at metalness 0.36, and metalness is not a look on a data mark — it is the
               * fraction of the albedo REPLACED by a mirror of the sky. `lit.ts` says it outright ("metals
               * have no diffuse lobe — the energy went into the specular"), so at 0.36 a third of the core's
               * colour stopped being the datum and became the environment. The environment is the same for
               * every body on the frame, so two marks whose colour is partly the same sky converge on it.
               *
               * HOW FAR THEY CONVERGED. The core (#7FB2FF, MEASURED) and the withheld drum (#6B7A99, NO
               * MEASUREMENT EXISTS) are CIEDE2000 20.9 apart in the palette and arrived **7.21** apart in
               * dark and **8.55** in light at the p05 fragment of a lit sphere under this file's own rig —
               * under the categorical floor of 10, in BOTH themes. `packages/gl/src/look/categorical.ts`
               * carries the invariant and why order preservation does not imply it.
               *
               * AND ROUGHNESS WAS NOT THE MECHANISM, which had to be measured rather than assumed because
               * 0.22 is a fairly polished surface and looked like a co-defendant:
               *
               *   metalness 0.36 -> 0.08, roughness held at 0.22:  p05 7.21 -> 12.92 dark, 8.55 -> 12.76 light
               *   roughness 0.10 -> 0.60, metalness held at 0.36:  p05 6.79 ->  8.40 dark, 7.78 -> 10.02 light
               *
               * The whole legal roughness range moves dark by 1.6 and never clears the floor. One metalness
               * step of the same size moves it by 5.7. Turning the core matte would have changed the look and
               * left the defect.
               *
               * THE CORE IS MORE DISTINGUISHED AFTER THIS, NOT LESS, and that is the part that is not
               * intuition. The mirror was dragging the core toward the same washed sky the ordinary bodies
               * sit in: core against OBSERVED rose from p05 9.55 to 13.70 in dark and 10.50 to 13.93 in
               * light. What the core gives up is its difference from a LINK, which shares its hex — and a
               * link is a 3.2 px tube nobody confuses with the largest sphere on the frame. What it keeps is
               * the biggest specular on the frame: 0.48% of the mark within a tenth of clipping, against a
               * link's 0.37% and an observed body's 0.00%. The mirror bought 0.85% there; a third of a
               * percent of highlight is what this costs, and 5.7 CIEDE2000 is what it buys.
               *
               * ROUGHNESS 0.22 IS UNCHANGED, deliberately — but NOT because it maximises the highlight.
               * This comment used to claim it was "the setting with the LARGEST highlight", citing 0.23% at
               * roughness 0.14 and 0.00% at 0.42. Both of those figures are real and both are SMALLER, and
               * quoting only the settings that lose is how a false claim reads as a measured one. The sweep
               * derived the whole curve, and two settings beat 0.22 in both themes:
               *
               *     roughness   dark    light
               *       0.22      0.48%   0.80%   ← kept
               *       0.26      0.54%   0.85%   ← larger in BOTH
               *       0.30      0.43%   0.88%   ← the light-theme maximum
               *
               * So 0.22 is second-largest in dark and third in light. The honest reason it stays is the
               * first half of this paragraph and nothing more: it is the gloss the surface was authored
               * with, and it was never the defect — the metalness was. Changing it to chase 0.06% of
               * highlight area would be retuning an unrelated dial to justify a sentence.
               *
               * Recorded because the sweep's own table was on screen when the claim was written. A number
               * selected from a table that contradicts it is worse than an unmeasured guess: it carries the
               * authority of having been measured.
               */
              material: {
                baseColour: hexToLinear(b.isCore ? CORE_HEX : OBSERVED_HEX),
                roughness: b.isCore ? 0.22 : 0.34,
                /* NOT A TERNARY ANY MORE. The core and an ordinary body are the same substance; the core is
                   told apart by its hex, its size, its label and its polish, and every one of those is a
                   statement about the datum rather than about the room it is standing in. */
                metalness: 0.08,
              },
            };
        draws.push(d);
        casters.push(d);
      }

      /*
       * THE LIGHT IS NEARLY OVERHEAD, at 0.14 / 0.22 off plumb, and that is about attribution. A more oblique
       * key throws each shadow a metre and a half sideways, and at that offset the reader cannot tell whether the
       * gap between a body and a shadow is the body's HEIGHT or the light's ANGLE — which is the one thing the
       * shadow is here to say. Steep enough to attribute, tilted enough that the spheres keep a terminator.
       */
      const lightDir: [number, number, number] = [0.14, -0.966, -0.22];
      const span = L.outerRadius + 3;
      const sceneMin: [number, number, number] = [-span, DECK_Y, -span];
      const sceneMax: [number, number, number] = [span, span * 0.6, span];
      const lightVP = lightViewProjection(
        { direction: lightDir, colour: [1, 1, 1], extent: span * 1.5 },
        boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
      );

      /* ONE FRAME, then nothing. See the file header: §6 rule 2, and the reason reduced motion needs no branch. */
      const vp = viewProjection(L.view, W / H);
      const cc = scenery(th, CLEAR_HEX, th.plate);
      /* A FUNCTION NOW, SO IT CAN BE MEASURED — and it ends with `target` bound, which is what `probeSync`
         requires: a `readPixels` only guarantees completion of work affecting the framebuffer it reads. */
      const renderScene = (): void => {
        lit.shadowPass(lightVP, casters, shadow);
        target.bind();
        gl.clearColor(cc[0], cc[1], cc[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        lit.depthPrepass(vp, draws);
        lit.draw({
          viewProj: vp, eye: L.eye, lightDir,
          lightColour: [3.1 * rig.key, 3.05 * rig.key, 2.95 * rig.key], sky,
          /* AO stays `null` at every tier: it was measured in E4's harness at 0.44% of the frame, so there is
             nothing here for the ladder to drop. See the allocation comment above. */
          ambientGain: 0.52 * rig.ambient, lightVP, shadow,
          shadowStrength: 0.92 * rig.shadow,
          shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws,
          ao: null, screenSize: [W, H], fog: null,
        });
      };

      /*
       * THE PROBE, TAKEN BEFORE ANYTHING IS PRESENTED. `pickQualityTier` exists to choose a tier from one
       * measured frame and had no caller in this repo; this is one. A discarded warm-up frame first — the first
       * frame pays shader upload, and charging that to the GPU would downgrade every machine — then two
       * sync-bounded samples of which the cheaper is used, because one sample can catch a GC pause and a single
       * unlucky 40 ms would drop a fast machine for the rest of the page load.
       */
      if (needsQualityProbe()) {
        const ms = measureFrameMs(gl, renderScene);
        const r = recordQualityProbe({
          pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'OntologyOrreryGl',
        });
        /* A LOWER TIER MEANS THIS BUILD IS STALE. Nothing is presented and `onReading` is NOT called — a reading
           published off a frame the reader will never see is a number about nothing. The effect re-runs on the
           new tier and publishes then.
           AND IT NEVER RUNS ON A REDRAW: `needsQualityProbe()` is false the moment a tier resolves, so selecting
           an entity cannot re-time the machine and make the ladder follow the graph instead of the GPU. */
        if (r.tier !== tier) return 'STALE_TIER';
      }

      renderScene();
      presenter.present(target, { theme: liveTheme() });
      /* RECORDED ONLY ONCE THE FRAME IS PRESENTED, so a STALE_TIER return cannot leave the observer believing a
         theme is on screen that never reached it. */
      drawnTheme = th.name;
      /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted. */
      canvas.dataset.qualityTier = tier;

      const err = gl.getError();
      if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW', 'the driver reported error ' + err + ' after the frame'); return undefined; }

      /*
       * TWO LABELS, IN THE DOM, PROJECTED FROM THE SAME MATRIX THE FRAME USED. §6 rule 4: text is the
       * accessibility tree and the print path, so it is never baked into a texture.
       *
       * Only two: the core, because "distance from the core" says nothing without naming it, and the reader's
       * selection, because that is the entity they asked about. Labelling all of them needs the harness's
       * obstacle system — one obstacle set filled in priority order with four candidate placements each — and at
       * up to a hundred entities that system does not have room to succeed. The absence is a real cost and it is
       * stated next to the toggle rather than discovered: naming a specific entity is what the diagram is for.
       */
      const labels: { id: string; label: string; xPct: number; yPct: number; role: 'core' | 'selected' }[] = [];
      const pushLabel = (id: string, role: 'core' | 'selected'): void => {
        const b = L.bodies.find((x) => x.id === id);
        if (!b) return;
        const q = projectScreen(vp, b.pos, size.w, size.h);
        if (q.behind) return;
        labels.push({
          id: b.id, label: b.label, role,
          xPct: (q.sx / size.w) * 100, yPct: (q.sy / size.h) * 100,
        });
      };
      pushLabel(L.core.id, 'core');
      if (graph.selectedId !== null && graph.selectedId !== L.core.id) pushLabel(graph.selectedId, 'selected');

      onReading({
        layout: L,
        labels,
        /* Counted from the geometry that was uploaded rather than estimated: `draws.length` and this number are
           the two costs a frame is entitled to state about itself. */
        triangles: draws.reduce((n, d) => n + Math.floor(d.mesh.indexCount / 3), 0),
        drawCalls: draws.length,
      });
      return undefined;
    };

    /* THE FIRST FRAME COMES FROM THE SETUP, NOT FROM THE DRAW EFFECT ABOVE. On a tier or size rebuild that
       effect does not re-run — its dependency did not change — so a rebuilt context with no draw would leave a
       blank canvas over the flat diagram, with the HUD still printing the previous reading. */
    if (draw(inputRef.current) === 'STALE_TIER') {
      /* No context-lost listener on this path: nothing is on screen to go stale, and `onRefused` must not fire —
         the orrery is about to be rebuilt at the resolved tier, not refused. */
      return releaseAll;
    }
    if (dead) return;
    drawRef.current = draw;

    /*
     * CONTEXT LOSS RESOLVES TO THE FLAT DIAGRAM. Without this the canvas keeps its last frame on screen for
     * ever while the GPU has dropped the context — a stale picture presented as live data, which is worse than
     * no picture. Registered on the canvas rather than the document, so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => {
      e.preventDefault();
      onRefused('CONTEXT_LOST', 'the browser dropped this canvas GPU context, so the frame on it is stale');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    /* A THEME CHANGE IS A REDRAW, NOT A REBUILD — the full reasoning, including why `beforeprint` is needed for
       `BoardReport.tsx:105-109` specifically and why the `drawnTheme` guard is what makes the other three print
       handlers free, is in `SurfaceReliefGl.tsx` under that heading. */
    const redrawForTheme = (): void => {
      if (liveTheme() === drawnTheme) return;
      drawRef.current?.(inputRef.current);
    };
    const themeWatch = new MutationObserver(redrawForTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('beforeprint', redrawForTheme);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      themeWatch.disconnect();
      window.removeEventListener('beforeprint', redrawForTheme);
      drawRef.current = null;
      releaseAll();
    };
    /* `tier` AND `size` ARE DEPENDENCIES, and that is the rebuild mechanism: a resolved lower tier or a window
       drag across a 32-pixel step tears this context down and builds the orrery again at it. `input` IS NOT,
       and that is the fix this file exists to carry — selecting an entity is a redraw, not a new context. */
  }, [size, onRefused, onReading, tier]);

  return (
    <div ref={hostRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        /* The relief carries the same entities the diagram and the inspector carry, so it is not announced
           twice; the HUD beside it is DOM text and is what a screen reader reads. */
        aria-hidden="true"
      />
    </div>
  );
}
