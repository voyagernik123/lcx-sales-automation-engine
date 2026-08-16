/**
 * E4 · THE ORRERY — the layout and the MEASUREMENT, with no GL in it.
 *
 * `docs/3d/e4` proved the environment. This module is the half of it that can be checked without a
 * rasteriser: where every body goes, and the numbers that decide whether the drawing is entitled to exist.
 *
 * ── WHY THIS FILE IS SEPARATE FROM THE RENDERER ──────────────────────────────────────
 * E4's whole claim is a COUNT, not a picture: a drawing in a plane has two axes and must spend both on
 * layout, so once it also encodes relationship distance as radius it has nothing left with which to keep
 * edges apart — and edges cross. A crossing in a plane is not untidiness: both edges occupy the same pixels
 * at the same depth, so two relationships become four possible relationships. Inclination is the third axis
 * and it is spent on exactly that.
 *
 * The claim is NOT "fewer lines cross". From most viewpoints MORE of them cross here — the fifty-state view
 * measures 284 on screen against 182 in the plane — and the claim is about how many of them a reader cannot
 * RESOLVE: 7 against 182. The bound behind that is camera-independent: two tubes can only fuse into an
 * unreadable X if their minimum separation in 3-D is less than the sum of their radii, and that quantity does
 * not depend on where the camera is. It is not always zero on this ontology, so it is measured and published
 * rather than asserted — which is why it belongs in a file a unit test can import, and a WebGL2 component under
 * jsdom is not one.
 *
 * ── EVERY NUMBER HERE COMES FROM THE ONTOLOGY BEING DRAWN ────────────────────────────
 * Nothing is carried over from the harness. Hops are a breadth-first search over the same couplings that are
 * drawn; the size scale is the coupling count in the full ontology; the flat comparison is measured twice —
 * once on this layout with every inclination zeroed, which isolates the one axis under test, and once on the
 * SHIPPING node-link diagram's own coordinates, which the harness could not do because it had no shipping
 * diagram to read.
 *
 * ── AND IT REFUSES ───────────────────────────────────────────────────────────────────
 * Six of the codes in `ORRERY_REFUSALS` are geometry, not plumbing: an entity kind with no plane, bodies that
 * merge at every viewpoint, bodies below the pixel floor, and a third axis that measurably buys nothing. The
 * shipped ontology reaches three of them at its default filter, and the honest outcome of that is a reader
 * who is told which one and what to change — not a frame with a hidden entity in it.
 */
import { eyeOf, viewProjection, projectScreen, type Viewpoint } from '@lcx/gl';

/* ── INPUT ─────────────────────────────────────────────────────────────────────────── */

/**
 * What this module needs to know about an entity, which is deliberately less than `RegulatoryNode` carries.
 * `record` is the node's own payload, read ONLY through `magnitudeOf` below.
 */
export interface OrreryEntityInput {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly record: unknown;
}

export interface OrreryCouplingInput {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** The relationship's own kind — `requires`, `governs`, `enables`. Reported, not encoded. See `LINK_PX`. */
  readonly kind: string;
}

/** A node centre in the SHIPPING diagram's own coordinate space, in its own pixels. */
export interface FlatNodeCentre {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface OrreryInput {
  readonly entities: readonly OrreryEntityInput[];
  /** The couplings the flat diagram is currently drawing. Hops and crossings are both computed from these. */
  readonly couplings: readonly OrreryCouplingInput[];
  /**
   * EVERY coupling in the ontology, filtered or not. The size scale reads this rather than `couplings`, and
   * the difference is the whole point: a reader who turns off a layer has not made an entity less connected,
   * they have stopped looking at some of its connections. Sizing bodies from the filtered set would shrink an
   * entity because of a UI toggle, which is a measurement changing under a control that does not measure.
   */
  readonly allCouplings: readonly { readonly source: string; readonly target: string }[];
  /** The reader's selection, which becomes the core if it is in view. Null means the core is computed. */
  readonly selectedId: string | null;
  /** Canvas size in CSS pixels. Every pixel claim in the result is against these. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** The shipping diagram's node centres and half-width, for the flat crossing count. */
  readonly flatCentres?: readonly FlatNodeCentre[];
  readonly flatHalfWidth?: number;
  /**
   * CEILING ON THE VIEWPOINT SEARCH, COUNTED IN CANDIDATES EVALUATED — across the WHOLE build, every rung of
   * the spacing ladder included. Defaults to `SEARCH_CANDIDATE_BUDGET`, which is the whole sweep, so the
   * default never truncates and `search.truncated` is only reachable by a caller that asks for less.
   *
   * ── WHY THIS IS NOT A MILLISECOND DEADLINE, WHICH IS WHAT IT USED TO BE ──────────────
   * A deadline is not a stopwatch. It does MORE work on a fast machine and LESS on a loaded one, so the
   * viewpoint it settles on — and therefore the frame, and therefore every pixel statistic taken from that
   * frame — was a function of CPU contention at the moment of render rather than of the ontology.
   *
   * That was not theoretical. Measured on the shipped fifty-state ontology at 1184x768 with the old
   * `searchBudgetMs: 100` — which is exactly this machine standing in for one four times slower, because a
   * search that reaches candidate i at t_i here reaches it at k·t_i on a k-times-slower machine, so budget
   * B/k is that machine at budget B — under 32 competing CPU-bound processes, 40 IDENTICAL CALLS PRODUCED
   * SEVEN DIFFERENT RESULTS: 32 swept all 144, and the rest came back at `tried` 91, 76, 72, 45 and 25 with
   * the published `clean` count falling from 4 to 2 and then to 1, while THREE of the forty refused the
   * surface outright with `BODIES_MERGE_AT_EVERY_VIEWPOINT` — the same input drawing a frame or drawing
   * nothing depending on how busy the laptop was. Both counts are printed on the page (`OntologyOrrery.tsx`,
   * "N clean viewpoints of M tried"), so this reached the reader.
   *
   * At the shipped 400 ms it did NOT reproduce here: 80 calls under 48 competing processes all agreed, though
   * the slowest took 476.8 ms against 16.2 ms for the fastest — 119% of the deadline, spent after the search
   * rather than inside it. That is luck holding, not a guarantee, and it is why the weaker claim is stated.
   *
   * Counting candidates instead makes the work — and therefore the frame — a function of the input alone.
   * Freezing the clock was NOT the alternative: `performance.now()` has to keep running or
   * `requestAnimationFrame` and React's scheduler stop with it.
   */
  readonly searchBudgetCandidates?: number;
  /**
   * @deprecated IGNORED, and deliberately still declared rather than deleted.
   *
   * Three call sites still pass it — `orrery/__tests__/orreryViewport.test.ts:82` (5000),
   * `geometry/__tests__/ontologyOrrery.test.tsx:433` and `:472` (900) — and all three pass it for one reason:
   * "do not let a CI machine's clock truncate the sweep". The candidate budget above gives them that
   * unconditionally, so the right change is to DELETE those three lines. Removing the field before they go
   * would fail the excess-property check on their object literals and break the build, so it outlives them by
   * one commit. It is read nowhere in this module, which `wallClockReadsIn` is the standing proof of.
   */
  readonly searchBudgetMs?: number;
}

/* ── THE THREE STATES OF A COUNT ───────────────────────────────────────────────────── */

/**
 * OBSERVED, ABSENT and WITHHELD are never collapsed, and they are a union rather than a nullable number so
 * that a call site cannot read a count off a state nobody took.
 *
 * Size is the value here, so a count that is not observed must not get a size AT ALL — any radius sits
 * somewhere on the scale and therefore asserts a count. The resolution is not a cleverer number, it is to
 * leave the scale: absent is a hollow ring and withheld is a sealed drum, and neither is a sphere.
 */
export type OrreryMagnitude =
  | { readonly state: 'observed'; readonly couplings: number }
  | { readonly state: 'absent' }
  | { readonly state: 'withheld' };

/**
 * The one place an entity's payload is read, so there is exactly one answer to "is this measured".
 *
 * ── ABSENT IS REAL IN THIS ONTOLOGY, AND IT IS `confidence: 'Low'` ───────────────────
 * A coupling count is only as measured as the classification it is built from. Four states carry
 * `confidence: 'Low'` at `sourceAuthority: 3`, and their own pain points say why in words — "UMSA does not
 * explicitly include virtual currency in its definition of money transmission", "has not classified virtual
 * currency as money transmission". The ontology declines to say what regime those states run, so the number
 * of couplings authored for them is not a measurement of their place in the requirement web; it is the
 * absence of one. Putting it on the log scale would assert a structure nobody established, and it would be
 * indistinguishable from a state whose zero IS measured — Montana, `regimeType: "No general MTL"` at
 * `sourceAuthority: 1`, which genuinely requires no state licence. Those two must not render the same, so
 * they do not: one is the smallest sphere on the scale, the other is not a sphere at all.
 *
 * ── WITHHELD IS AN ARM NOTHING IN THIS ONTOLOGY CURRENTLY SETS, AND IT STAYS ─────────
 * No record here is "measured, and you may not see it". The arm exists because collapsing it into `absent`
 * would mean that the day a restricted record arrives, this view reports it as NEVER MEASURED — a different
 * and worse claim than "you are not cleared for this one". The legend prints all three counts, so a zero
 * reads as a zero rather than as an omission, and `ontologyOrrery.test.tsx` drives the arm directly.
 */
export function magnitudeOf(record: unknown, couplingsInFullOntology: number): OrreryMagnitude {
  const r = (record ?? {}) as { confidence?: string; restricted?: boolean };
  if (r.restricted === true) return { state: 'withheld' };
  if (r.confidence === 'Low') return { state: 'absent' };
  return { state: 'observed', couplings: Math.max(0, Math.trunc(couplingsInFullOntology)) };
}

/* ── PLANES ────────────────────────────────────────────────────────────────────────── */

/**
 * FIVE PLANES, AND THE ANGLES ARE CHOSEN AGAINST TWO FAILURES RATHER THAN FOR LOOKS.
 *
 * · `state` sits at inclination 0 on purpose. One kind stays in the reference plane, so the frame contains
 *   its own flat baseline and every other kind is visibly lifted out of it.
 * · No two inclinations may be close, or their planes intersect at a shallow angle and bodies on them appear
 *   to share a ring — which is the flat layout's ambiguity reintroduced through the back door. The minimum
 *   pairwise separation here is 27 degrees, and the test asserts it rather than trusting this comment.
 * · The ascending node is varied too, because planes sharing a node line all cross the same diameter and
 *   every body near that diameter piles up there.
 *
 * A kind with no plane REFUSES rather than being parked on someone else's. The page's layer pills expose
 * exactly these five; `domain` and `phase` exist in the ontology with no pill, and if either ever gets one
 * this refuses by name instead of quietly drawing two kinds as one.
 */
export const ORRERY_PLANES: Readonly<Record<string, { readonly incDeg: number; readonly nodeDeg: number }>> = {
  state: { incDeg: 0, nodeDeg: 0 },
  license: { incDeg: 34, nodeDeg: 64 },
  requirement: { incDeg: -29, nodeDeg: -58 },
  product: { incDeg: 62, nodeDeg: 118 },
  competitor: { incDeg: -56, nodeDeg: -142 },
};
/** Fixed order, so the angular placement is stable across renders and across sessions. */
const KIND_ORDER = ['state', 'license', 'requirement', 'product', 'competitor'];

/* ── SCALES ────────────────────────────────────────────────────────────────────────── */

const RAD = Math.PI / 180;
export type V3 = [number, number, number];

/** Shells are LINEAR in hops. Hops is a small integer and the reader counts rings, so equal spacing is what
    makes "two rings out" mean two hops. A log shell would make the third hop the same step as the tenth. */
const SHELL_BASE = 1.0, SHELL_STEP = 2.1;
/** Two rings closer than this read as one ring with a thick line. */
const SHELL_MIN_GAP = 1.15;
/**
 * Angular room per body on its shell, as a multiple of its own diameter, TRIED IN THIS ORDER.
 *
 * Tight spacing keeps the camera close and the bodies large; wide spacing separates silhouettes. Which one a
 * given ontology needs is not knowable in advance — it depends on how many entities are the same number of
 * hops from the core — so the layout is BUILT at the tightest spacing, measured, and rebuilt wider only if the
 * measurement failed. The spacing that was used is in the result, because a frame whose geometry was chosen
 * by a retry has to be able to say which retry it is.
 */
const SPACING_LADDER = [1.45, 1.9, 2.4];

/**
 * THE VIEWPOINT SWEEP, HOISTED OUT OF THE SEARCH SO THE BUDGET CAN BE DERIVED FROM IT RATHER THAN TYPED.
 *
 * These two were literals inside `attempt()`. They are here because the default candidate budget is "the
 * whole sweep", and a default that is a hand-copied `432` stops being the whole sweep the day somebody adds a
 * seventh elevation. Why these elevations and why 24 azimuths is argued where the sweep is run.
 */
const ELEVATION_LADDER = [26, 33, 40, 47, 55, 63];
const AZIMUTH_STEPS = 24;

/** Candidates one rung of the spacing ladder evaluates when nothing stops it. */
export const SEARCH_CANDIDATES_PER_ATTEMPT = ELEVATION_LADDER.length * AZIMUTH_STEPS;

/**
 * THE DEFAULT SEARCH BUDGET: every candidate at every rung, so the default sweep is exhaustive and the
 * published count in `search` is a count over the whole space rather than over the prefix a clock allowed.
 *
 * It is affordable because it is SMALL AND FIXED, which a millisecond deadline could never claim. Measured on
 * this machine (M-series, 8 cores, itself under other load at the time), median of 7, timing the whole
 * `buildOrrery` call including every measurement taken after the search:
 *
 *     shipped fifty-state ontology, 1184x768, all three rungs   20.5 ms
 *     synthetic 1,200-body graph — sixteen times the above      100.6 ms
 *
 * A machine five times slower therefore spends about 103 ms on the real input and one twenty times slower
 * about 410 ms, and the 1,200-body figure is the ceiling on inputs this app cannot even produce: at five
 * kinds the shipped ontology refuses on merged silhouettes long before it gets that large. Those are FIXED
 * costs a reader can re-measure, not a race a fast machine wins and a loaded one loses.
 */
export const SEARCH_CANDIDATE_BUDGET = SEARCH_CANDIDATES_PER_ATTEMPT * SPACING_LADDER.length;

/**
 * SIZE IS log10 OF THE COUPLING COUNT, and the counts here span 0 to 44 in the shipped ontology.
 *
 * Linear in the count, the money-transmitter licence at 44 couplings would be 44 times the radius of a
 * requirement with one: one body filling the shell and the rest dots. The reader is being asked "which of
 * these holds the web together", which is an order-of-magnitude question, and a log radius is the encoding
 * that answers it. `1 +` rather than a clamp, because a MEASURED ZERO is a real reading here — Montana
 * requires no state licence — and it must render as the smallest sphere rather than as a refusal or as a body
 * the same size as a one-coupling entity.
 */
const R_BASE = 0.20, R_PER_DECADE = 0.235;
export const observedRadius = (couplings: number): number =>
  R_BASE + R_PER_DECADE * Math.log10(1 + Math.max(0, couplings));

const ABSENT_RING_R = 0.30, ABSENT_TUBE_R = 0.105;
export const ABSENT_GEOM = { ringRadius: ABSENT_RING_R, tubeRadius: ABSENT_TUBE_R } as const;
export const ABSENT_OUTER = ABSENT_RING_R + ABSENT_TUBE_R;
export const WITHHELD_R = 0.28, WITHHELD_H = 0.42;

export const radiusOf = (m: OrreryMagnitude): number => (
  m.state === 'observed' ? observedRadius(m.couplings) : m.state === 'absent' ? ABSENT_OUTER : WITHHELD_R
);

/**
 * HOW OFTEN A SET OF DRAWN BODIES READS ITS OWN SIZE ENCODING BACKWARDS.
 *
 * `observedRadius` is monotonic in the coupling count, so in WORLD units the ordering is exact by
 * construction. On SCREEN it is not: perspective divides by the distance to the eye, so a well-connected
 * entity on the far side of the system can draw smaller than a sparse one near the camera, and the reader has
 * no way to tell that apart from a genuine difference in the data. That is a misread coupling count — the same
 * failure `BODIES_MERGE_AT_EVERY_VIEWPOINT` refuses — reaching the frame through depth rather than overlap.
 *
 * Only OBSERVED bodies are comparable: an absent ring and a withheld drum have deliberately left the size
 * scale, so their diameters assert nothing and comparing them would invent a reading. Equal counts are not
 * compared either — two entities with the same number of couplings are not in an order to get wrong.
 *
 * Exported, and it is the ONE implementation: the viewpoint search uses it to refuse a camera that reads more
 * pairs backwards than the incumbent, and the published `sizeOrder` is the same function over the frame that
 * ships. Two copies would let the constraint and the report describe different cameras.
 *
 * The count is invariant to the field of view — a lens change scales every diameter by one factor, so every
 * comparison survives — which is why it can bound a viewpoint choice that also changes the lens.
 */
export function misreadSizePairs(
  readings: readonly { readonly couplings: number; readonly px: number }[],
): { readonly comparablePairs: number; readonly misread: number; readonly worstPx: number } {
  let comparablePairs = 0, misread = 0, worstPx = 0;
  for (let i = 0; i < readings.length; i++) {
    for (let j = i + 1; j < readings.length; j++) {
      const a = readings[i]!, b = readings[j]!;
      if (a.couplings === b.couplings) continue;
      comparablePairs++;
      const more = a.couplings > b.couplings ? a : b;
      const less = a.couplings > b.couplings ? b : a;
      if (more.px <= less.px) { misread++; worstPx = Math.max(worstPx, less.px - more.px); }
    }
  }
  return { comparablePairs, misread, worstPx };
}

/**
 * TUBE AND RING THICKNESS ARE SPECIFIED IN PIXELS AND CONVERTED TO METRES, NOT THE OTHER WAY ROUND.
 *
 * E4's second defect was a 1.4 cm ring tube that came out 1.2 px at 22 m — anti-aliased to a smear, so the
 * orbit structure the whole radius encoding is read off was almost absent from the frame, and it was
 * misdiagnosed as a colour problem. Here the camera distance is not even authored: it is framed from an
 * extent that changes with the reader's filters, so a world-space thickness cannot be checked once and
 * trusted. These are the pixel widths the frame is entitled to claim, and the metres come out of the
 * measured camera.
 *
 * EVERY TUBE IS THE SAME THICKNESS, and that is a refusal rather than a simplification. E4 spent thickness on
 * relationship strength; this ontology does not measure relationship strength. A coupling carries a KIND
 * (`requires`, `governs`, `enables`, `classifies`, `holds_license`) and nothing ordinal. Thickness per kind
 * would invent an ordering the data does not have, and drawing the unmeasured ones thin would assert a weak
 * coupling nobody observed. With no strength measured anywhere there is no scale for a reader to misread, so
 * one thickness is the honest drawing and the legend says the axis is unspent.
 */
export const LINK_PX = 3.2;
export const RING_PX = 2.8;
/** The plate. A body's gap from its own shadow IS its height above the reference plane. */
export const DECK_Y = -2.6;
/** A body under this many pixels across is an anti-aliased dot, and a size encoding on a dot is fiction. */
export const BODY_PX_FLOOR = 9;

/**
 * HOW MUCH OF THE FRAME THE DRAWING MAY FILL, per axis, as a fraction of the half-frame. `fitLens` solves the
 * field of view against this, so the gutter is (1 − FRAME_FILL)/2 of the full canvas on every side: at 0.86
 * that is 7% — 54 px on a 768-px-tall canvas, 83 px on an 1184-px-wide one.
 *
 * IT IS NOT A SAFETY MARGIN FOR THE MATHS, WHICH IS EXACT. It is chrome clearance, and it was measured rather
 * than chosen: `OntologyOrrery` overlays a 360×123 px card on the top-left of the canvas and `OntologyExplorer`
 * a 252×108 px timeline card on the bottom-right, both effectively opaque. Filling the frame outright pushed
 * the drawing under both. Measured in Chrome at 1440x900 and 1366x768 on the shipped ontology, 0.86 is the
 * largest fill at which no body, no ring and no link lands inside either card, and it still clears the pixel
 * floor at both — see `theDrawingStaysClearOfTheCards`.
 *
 * The honest limit of that number: it is measured against THIS page's chrome. A host that overlays something
 * larger would need it re-measured, which is why the measurement is a test rather than a comment.
 */
const FRAME_FILL = 0.92;
/**
 * Samples per circle when the rings are handed to `fitLens`. 128 puts the chord's sagitta at 3.0e-4 of the
 * ring radius — under 6 thousandths of a world unit on the largest shell the shipped ontology produces, an
 * order below the ring's own tube — and it is added back to each sample's radius anyway, so the count is a
 * cost question rather than a correctness one.
 */
const RING_SAMPLES = 128;

/* ── VECTOR AND SEGMENT MATH ───────────────────────────────────────────────────────── */

const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const at3 = (p: V3, d: V3, t: number): V3 => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];

/** Closest points between two segments (Ericson). Returns their separation and both points. */
export function segSeg(p1: V3, q1: V3, p2: V3, q2: V3): { dist: number; c1: V3; c2: V3 } {
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

/** 2-D segment crossing, strictly interior. Returns the two parameters or null. */
export function cross2(
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

/** R = Ry(node) · Rx(inc) applied to an in-plane point. Written out rather than composed from two matrix
    helpers, so the ONE convention the orbit ring's model matrix has to agree with is visible in one place. */
export function orbitPoint(r: number, thetaDeg: number, incDeg: number, nodeDeg: number): V3 {
  const t = thetaDeg * RAD, i = incDeg * RAD, n = nodeDeg * RAD;
  const x0 = r * Math.cos(t), z0 = r * Math.sin(t);
  const y1 = -z0 * Math.sin(i), z1 = z0 * Math.cos(i);
  return [x0 * Math.cos(n) + z1 * Math.sin(n), y1, -x0 * Math.sin(n) + z1 * Math.cos(n)];
}

/* ── OUTPUT ────────────────────────────────────────────────────────────────────────── */

export interface OrreryBody {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly magnitude: OrreryMagnitude;
  /** Hops from the core over the DRAWN couplings. `null` means the search never reached it. */
  readonly hops: number | null;
  readonly shell: number;
  readonly thetaDeg: number;
  readonly pos: V3;
  /** The same body with every inclination zeroed — the flat control, isolating the one axis under test. */
  readonly flatPos: V3;
  readonly radius: number;
  readonly isCore: boolean;
  /** True when this body has no relationship distance and is therefore NOT on a shell. */
  readonly offSystem: boolean;
}

export interface OrreryLink {
  readonly id: string;
  readonly kind: string;
  readonly aId: string;
  readonly bId: string;
  readonly a: V3;
  readonly b: V3;
  readonly flatA: V3;
  readonly flatB: V3;
  readonly r: number;
}

export const ORRERY_REFUSALS = [
  'NOTHING_TO_ORBIT',
  'NO_COUPLINGS_TO_READ',
  'KIND_HAS_NO_PLANE',
  'BODIES_MERGE_AT_EVERY_VIEWPOINT',
  'BODIES_BELOW_LEGIBILITY_FLOOR',
  'THIRD_AXIS_BUYS_NOTHING',
  'CANVAS_HAS_NO_SIZE',
] as const;
export type OrreryRefusalCode = (typeof ORRERY_REFUSALS)[number];

export interface OrreryRefusal {
  readonly kind: 'refused';
  readonly code: OrreryRefusalCode;
  /** In the reader's words, and it names the number that caused the refusal. */
  readonly reason: string;
}
export const isOrreryRefusal = (v: OrreryOutcome): v is OrreryRefusal => 'kind' in v;

export interface OrreryCrossings {
  /** Crossings of the orrery's tubes on screen at the chosen viewpoint. */
  readonly onScreen: number;
  /** How many of those the depth order does NOT resolve. This is the number the environment lives on. */
  readonly ambiguous: number;
  /** Minimum separation along the view ray at a crossing, in world units. */
  readonly minSeparationM: number;
  /**
   * CAMERA-INDEPENDENT UPPER BOUND on ambiguous crossings from ANY viewpoint: two tubes can only fuse into an
   * unreadable X if they graze in 3-D, and grazing does not depend on where the camera is.
   */
  readonly grazingPairs3D: number;
  readonly minSeparation3DM: number;
  /** This layout with every inclination zeroed: crossings in its own plane, every one of them ambiguous. */
  readonly flatControlInPlane: number;
  readonly flatControlGrazing: number;
  /** The SHIPPING node-link diagram, measured from its own coordinates. `null` if they were not supplied. */
  readonly shippingDiagram: number | null;
  /** Links whose tube touches a body they are not attached to. Counted in both layouts; depth resolves it. */
  readonly throughBodies3D: number;
  readonly throughBodiesFlat: number;
  /** Links whose AXIS is inside such a body. Nothing resolves that, so this one is the gate. */
  readonly piercedBodies3D: number;
  readonly piercedBodiesFlat: number;
}

export interface OrreryLayout {
  readonly bodies: readonly OrreryBody[];
  readonly links: readonly OrreryLink[];
  readonly core: OrreryBody;
  readonly view: Viewpoint;
  readonly eye: V3;
  readonly shells: readonly number[];
  readonly outerRadius: number;
  readonly deckSize: number;
  readonly ringTube: number;
  readonly kindsPresent: readonly string[];
  readonly crossings: OrreryCrossings;
  readonly counts: {
    readonly observed: number;
    readonly absent: number;
    readonly withheld: number;
    readonly offSystem: number;
  };
  /** Measured legibility, in CSS pixels, so a camera change cannot quietly lose an encoding. */
  readonly px: {
    readonly smallestBody: number;
    readonly largestBody: number;
    readonly ring: number;
    readonly link: number;
  };
  /**
   * HOW OFTEN THE FRAME READS ITS OWN SIZE ENCODING BACKWARDS.
   *
   * `comparablePairs` is every pair of OBSERVED entities whose coupling counts differ; `misread` is how many
   * of those draw the wrong way round, because perspective makes a further body smaller regardless of its
   * data. `worstMisreadPx` is the largest such gap, so a reader can see whether the failures are hairline or
   * gross. `fovDeg` is the lens that was fitted to this drawing, against `FOV_REF` = 36.
   *
   * This is a REPORTED COST, not a refusal, and it is not caused by the fitted lens: the count is identical
   * at any field of view because a lens change scales every diameter by one factor. It is published because
   * it was previously a defect nobody could see — on the shipped fifty-state ontology 480 of 2,056 pairs
   * read backwards — and because the viewpoint choice is now bounded by it.
   */
  readonly sizeOrder: {
    readonly comparablePairs: number;
    readonly misread: number;
    readonly worstMisreadPx: number;
    readonly fovDeg: number;
  };
  /**
   * THE FRAME THAT WOULD HAVE BEEN DRAWN, so the choice can be audited instead of believed.
   *
   * The incumbent is the lowest azimuth that came up clean at the lowest clean elevation — exactly what this
   * module drew before the lens was fitted to the content and the azimuth stopped being a tie-break.
   * `smallestBodyPx` is measured at the REFERENCE lens, so it is literally the old number, and the two
   * guarantees the change is allowed to make are then arithmetic a test can check on any input:
   *
   *     px.smallestBody   >= incumbent.smallestBodyPx     — no ontology comes out smaller than before
   *     sizeOrder.misread <= incumbent.misread            — no ontology reads more pairs backwards
   */
  readonly incumbent: {
    readonly azimuthDeg: number;
    readonly smallestBodyPx: number;
    readonly misread: number;
  };
  /**
   * What the search did: viewpoints tried, how many were clean, which spacing survived, and what it spent.
   *
   * `candidates` is what the elapsed-milliseconds field here used to be, and the swap is the point: a number
   * in this object is a claim about the drawing, and a millisecond reading is a claim about the machine. Every
   * field here is now a function of the input alone.
   */
  readonly search: {
    readonly tried: number;
    readonly clean: number;
    readonly attempts: number;
    readonly spacing: number;
    readonly truncated: boolean;
    /** Candidates evaluated by the WHOLE build up to this point, every earlier rung included. */
    readonly candidates: number;
  };
  /** One ring per shell instead of one per kind per shell — what the third axis buys, as a count. */
  readonly flatRingsCollapsed: number;
}

export type OrreryOutcome = OrreryLayout | OrreryRefusal;

const refuse = (code: OrreryRefusalCode, reason: string): OrreryRefusal => ({ kind: 'refused', code, reason });

/**
 * THE GATE E4 PUT ON ITSELF, as a function so it can be proven rather than described.
 *
 * E4's own words: "if a reordering could get the flat diagram to zero crossings then inclination would be
 * buying nothing and this environment would not be entitled to exist." The orbital layout is compared against
 * the SAME graph flattened. If it leaves as many crossings a reader cannot resolve as the plane does, it has
 * spent a dimension and bought nothing, and the honest move is to keep the reader on the diagram they had.
 *
 * The `> 0` guard is the whole subtlety: a small system where BOTH readings are clean is a win for neither, and
 * a bare `>=` would refuse the easiest case there is. Extracted because it is the one refusal here that no
 * input in the shipped ontology triggers, and a refusal with no test is a silent default waiting to happen.
 */
export function thirdAxisBuysNothing(ambiguous: number, flatControlInPlane: number): boolean {
  return ambiguous > 0 && ambiguous >= flatControlInPlane;
}

/**
 * Build the whole system, or refuse it.
 *
 * Pure: no canvas, no GL context, and NO CLOCK AT ALL. Every claim in the result is computed here so a test
 * can assert it and a HUD can print it without either of them re-deriving it — and, since the search budget
 * stopped being a deadline, the same input produces the same result on any machine at any load.
 */
export function buildOrrery(input: OrreryInput): OrreryOutcome {
  /* THE ONE COUNTER THE SEARCH IS BOUNDED BY. Shared by every rung of the spacing ladder, because the budget
     is a ceiling on the BUILD and a per-rung ceiling would let three rungs spend three budgets. */
  const budget = Math.max(1, Math.floor(input.searchBudgetCandidates ?? SEARCH_CANDIDATE_BUDGET));
  let spent = 0;
  const { entities, couplings, allCouplings, cssWidth, cssHeight } = input;

  if (!(cssWidth > 1) || !(cssHeight > 1)) {
    return refuse('CANVAS_HAS_NO_SIZE',
      'the canvas measured ' + Math.round(cssWidth) + ' by ' + Math.round(cssHeight)
      + ' pixels, and every size claim this view makes is against those pixels');
  }
  if (entities.length < 2) {
    return refuse('NOTHING_TO_ORBIT',
      'an orbital system needs a core and something orbiting it, and this view has '
      + entities.length + ' entities');
  }

  const present = new Set(entities.map((e) => e.id));
  const drawn = couplings.filter((c) => present.has(c.source) && present.has(c.target) && c.source !== c.target);
  if (drawn.length === 0) {
    return refuse('NO_COUPLINGS_TO_READ',
      'radius encodes relationship distance, and there are no relationships in view to measure it from');
  }

  const kindsPresent = [...new Set(entities.map((e) => e.kind))].sort(
    (a, b) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99),
  );
  const orphanKind = kindsPresent.find((k) => ORRERY_PLANES[k] === undefined);
  if (orphanKind !== undefined) {
    return refuse('KIND_HAS_NO_PLANE',
      'entity kind "' + orphanKind + '" has no orbital plane, and inclination is what encodes kind here — '
      + 'putting it on the plane of another kind would print a kind that is not true of it');
  }

  /* ── HOPS ARE COMPUTED, NOT AUTHORED, which is the difference between radius ENCODING relationship distance
     and radius being a number somebody typed. Breadth-first over the same couplings that are drawn: add an
     edge and the shell moves. ── */
  const adjacency = new Map<string, string[]>(entities.map((e) => [e.id, []]));
  for (const c of drawn) {
    adjacency.get(c.source)?.push(c.target);
    adjacency.get(c.target)?.push(c.source);
  }

  /* THE CORE IS THE READER'S SELECTION WHEN THERE IS ONE, and otherwise the most-coupled entity in view —
     measured, and named on the frame, because "distance from the core" says nothing without it. Ties break on
     the id, so the same graph always produces the same drawing. */
  const selected = input.selectedId !== null && present.has(input.selectedId) ? input.selectedId : null;
  const computedCore = entities
    .map((e) => [e.id, adjacency.get(e.id)?.length ?? 0] as const)
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? entities[0]!.id;
  const coreId = selected ?? computedCore;

  /*
   * A CORE WITH NOTHING ORBITING IT IS NOT A SYSTEM, and this is reachable by one click: the reader selects
   * Montana — which requires no state licence and therefore has no couplings at all — and asks for the orbital
   * view. Every other entity would then have no path to the core, the whole graph would land on the off-system
   * rail, and radius would be encoding nothing while still looking like an encoding.
   */
  if ((adjacency.get(coreId)?.length ?? 0) === 0) {
    return refuse('NOTHING_TO_ORBIT',
      (selected === coreId ? 'the selected entity, ' : 'the most-coupled entity in view, ')
      + coreId + ', has no couplings in this view, so there is no relationship distance to measure from it'
      + (selected === coreId ? '. Select a coupled entity, or clear the selection.' : '.'));
  }

  const hops = new Map<string, number>([[coreId, 0]]);
  for (let frontier = [coreId]; frontier.length > 0;) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adjacency.get(id) ?? []) {
        if (!hops.has(n)) { hops.set(n, (hops.get(id) ?? 0) + 1); next.push(n); }
      }
    }
    frontier = next;
  }

  /* Couplings in the FULL ontology, per entity. Undirected, because "how much of the web runs through this"
     does not care which way an authored edge happens to point. */
  const fullDegree = new Map<string, number>();
  for (const c of allCouplings) {
    fullDegree.set(c.source, (fullDegree.get(c.source) ?? 0) + 1);
    fullDegree.set(c.target, (fullDegree.get(c.target) ?? 0) + 1);
  }

  interface Draft {
    readonly e: OrreryEntityInput;
    readonly hops: number | null;
    readonly magnitude: OrreryMagnitude;
    readonly radius: number;
  }
  const drafts: Draft[] = entities.map((e) => {
    const magnitude = magnitudeOf(e.record, fullDegree.get(e.id) ?? 0);
    return { e, hops: hops.get(e.id) ?? null, magnitude, radius: radiusOf(magnitude) };
  });

  /*
   * AN ENTITY WITH NO PATH TO THE CORE HAS NO RELATIONSHIP DISTANCE, so it does not get a radius.
   *
   * The shipped ontology is not connected: turn on states, licences, requirements and products and ten of the
   * seventy-four entities sit in components of their own — New York's licence and its requirement reach each
   * other and nothing else. E4's rule is that such an entity REFUSES a shell rather than being parked on the
   * outer ring, which would read as "three hops away".
   *
   * Dropping them is not available either: a missing entity is worse than a hole, because the reader cannot
   * see that it is missing. So they go on a RAIL beyond the outermost ring, in the reference plane, visibly on
   * no orbit — the move the absent ring makes with size, applied to position — and the count is on the frame.
   * That is strictly more than the flat diagram says about them, where the force layout parks an unconnected
   * node wherever the simulation pushed it, indistinguishable from a connected one.
   */
  const onSystem = drafts.filter((d) => d.hops !== null);
  const offSystem = drafts.filter((d) => d.hops === null);

  /**
   * One complete attempt at a readable system, at a given angular spacing. Everything from the shells to the
   * crossing counts depends on it, so the whole thing is retried rather than patched.
   */
  const attempt = (crowd: number): OrreryOutcome => {
    /* ── SHELLS ── One per hop, grown to hold their own population. A shell whose circumference cannot fit its
       bodies `crowd` diameters apart draws them touching, and two touching bodies read as one body with a lump
       on it — which, since size is an encoding here, is a MISREAD COUPLING COUNT. ── */
    const hopValues = [...new Set(onSystem.map((d) => d.hops!))].filter((h) => h > 0).sort((a, b) => a - b);
    const shellOf = new Map<number, number>();
    let previous = 0;
    for (const h of hopValues) {
      const members = onSystem.filter((d) => d.hops === h);
      const wanted = members.reduce((sum, m) => sum + 2 * m.radius * crowd, 0) / (2 * Math.PI);
      const r = Math.max(SHELL_BASE + h * SHELL_STEP, wanted, previous + SHELL_MIN_GAP);
      shellOf.set(h, r);
      previous = r;
    }
    const shells = hopValues.map((h) => shellOf.get(h)!);
    const outerShell = shells.length > 0 ? shells[shells.length - 1]! : SHELL_BASE;

    /*
     * ANGLES ARE ASSIGNED, NOT AUTHORED, and they are assigned PER SHELL rather than per plane: the members of
     * one shell are spread over the whole circle in a fixed order, so two bodies at the same radius are as far
     * apart as that shell allows. A per-plane spread would put a licence and a requirement at the same angle on
     * the same shell, and two bodies at one radius and one angle differ only by inclination — which is exactly
     * the pair a reader cannot separate.
     *
     * Sorted by kind then id, so the drawing is stable: the same graph produces the same frame, and no body
     * moves because a filter re-ordered an array.
     */
    const thetaOf = new Map<string, number>();
    for (const h of hopValues) {
      const members = onSystem.filter((d) => d.hops === h).sort((a, b) => {
        const ka = KIND_ORDER.indexOf(a.e.kind), kb = KIND_ORDER.indexOf(b.e.kind);
        return ka !== kb ? ka - kb : (a.e.id < b.e.id ? -1 : 1);
      });
      /* Odd shells get a half-step offset so bodies on consecutive shells are not radially aligned, which is
         what makes a link between two shells pass over its neighbours rather than through them. */
      const offset = (h % 2 === 1 ? 0.5 : 0) * (360 / Math.max(1, members.length));
      members.forEach((m, i) => thetaOf.set(m.e.id, offset + (360 * i) / members.length));
    }

    const railZ = outerShell + 1.9;
    const railSpan = Math.max(1, offSystem.length - 1) * 1.25;
    const bodies: OrreryBody[] = drafts.map((d): OrreryBody => {
      const isCore = d.e.id === coreId;
      const h = d.hops;
      if (h === null) {
        const i = offSystem.indexOf(d);
        const x = offSystem.length === 1 ? 0 : -railSpan / 2 + (railSpan * i) / (offSystem.length - 1);
        const p: V3 = [x, 0, railZ];
        return {
          id: d.e.id, label: d.e.label, kind: d.e.kind, magnitude: d.magnitude, hops: null,
          shell: 0, thetaDeg: 0, pos: p, flatPos: p, radius: d.radius, isCore: false, offSystem: true,
        };
      }
      const shell = isCore ? 0 : shellOf.get(h) ?? SHELL_BASE;
      const theta = thetaOf.get(d.e.id) ?? 0;
      const plane = ORRERY_PLANES[d.e.kind]!;
      return {
        id: d.e.id, label: d.e.label, kind: d.e.kind, magnitude: d.magnitude, hops: h,
        shell, thetaDeg: theta,
        pos: isCore ? [0, 0, 0] : orbitPoint(shell, theta, plane.incDeg, plane.nodeDeg),
        flatPos: isCore ? [0, 0, 0] : orbitPoint(shell, theta, 0, 0),
        radius: d.radius, isCore, offSystem: false,
      };
    });
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const core = byId.get(coreId)!;

    /* ── THE CAMERA'S DISTANCE ── Framed from the system's own extent rather than authored, because the extent
       depends on the reader's filters. `FOV_REF` is NOT the lens the frame ships with — see `fitLens` below;
       it is the reference field the distance is solved against, and its only job is to fix HOW STRONG the
       perspective is. Distance over depth is the entire depth cue and it is also the entire distortion: at
       this distance the nearest body on the outer shell is about a quarter closer to the eye than the
       furthest, so its screen size is about a quarter larger for reasons that have nothing to do with its
       coupling count. Sizing is an encoding here, so that ratio is a budget, and it is spent here once. ── */
    const FOV_REF = 36;
    const aspect = cssWidth / cssHeight;
    const extent = Math.max(
      outerShell + Math.max(...bodies.map((b) => b.radius)),
      offSystem.length > 0 ? Math.hypot(railSpan / 2, railZ) : 0,
    );
    const halfVRef = (FOV_REF / 2) * RAD;
    /* The vertical field governs a wide canvas and the horizontal one governs a narrow canvas, so both are
       computed and the larger distance wins. Framing the vertical alone put half the outer shell off a
       portrait canvas with every number in the report still correct. */
    const halfHRef = Math.atan(Math.tan(halfVRef) * aspect);
    const distance = Math.max(extent / Math.sin(halfVRef), extent / Math.sin(halfHRef)) * 1.06;
    const NEAR = 0.5, FAR = Math.max(120, distance * 3);
    const baseView: Viewpoint = {
      target: [0, 0.35, 0], distance, azimuthDeg: 0, elevationDeg: 26, fovDeg: FOV_REF, near: NEAR, far: FAR,
    };
    /* At the reference lens — what the viewpoint search sees. `pxPerMetre`, the one the FRAME is measured
       with, is defined after the lens is fitted and is the only one any published number may use. */
    const pxPerMetreRef = (dist: number): number =>
      (cssHeight / 2) / (Math.max(0.01, dist) * Math.tan(halfVRef));

    /*
     * DOES ANY PAIR OF BODIES MERGE ON SCREEN AT THIS VIEWPOINT? Depth does NOT resolve that one.
     *
     * Depth resolves an ambiguous link crossing, because one tube visibly passes in front of the other. It does
     * not resolve two spheres whose silhouettes overlap: the nearer eats the further one's outline and the pair
     * reads as one body with a lump on it. Size is an encoding here, so a merged silhouette is a misread
     * coupling count, and it is the one failure of this layout that is purely a function of where the camera
     * is. So the camera is CHOSEN by this test rather than composed, and when no viewpoint passes it the view
     * refuses rather than shipping a frame with a hidden entity in it.
     *
     * It answers CLEAN or NOT rather than counting the overlaps, and that is what makes the whole
     * `SEARCH_CANDIDATE_BUDGET` sweep affordable inside a click: a dirty viewpoint exits at its first
     * overlapping pair, which is usually within a few comparisons, while only a clean one pays the full n².
     * Counting them all instead cost 400 ms on the 74-entity system and truncated its own search — a number
     * about the budget masquerading as a number about the layout. Squared distances, no `hypot`, and flat
     * arrays, because this is the innermost loop in the module.
     *
     * IT RUNS AT THE REFERENCE LENS AND THAT COSTS NOTHING, which is a property rather than an approximation.
     * At a fixed eye, target and orientation, changing the field of view multiplies EVERY screen offset from
     * the principal point and EVERY projected radius by the same factor `tan(halfV_ref)/tan(halfV_fitted)` —
     * an image crop and scale, nothing more. The predicate below compares a distance against a sum of radii,
     * so both sides scale together and its verdict is exactly invariant. `lensChangeIsAnExactZoom` in the
     * tests re-measures that on the shipped ontology rather than trusting this paragraph.
     */
    const isCleanAt = (v: Viewpoint): boolean => {
      const e = eyeOf(v) as V3;
      const vp = viewProjection(v, aspect);
      const n = bodies.length;
      const cx = new Float64Array(n), cy = new Float64Array(n), rr = new Float64Array(n);
      let m = 0;
      for (const b of bodies) {
        const q = projectScreen(vp, b.pos, cssWidth, cssHeight);
        if (q.behind) continue;
        const dx = b.pos[0] - e[0], dy = b.pos[1] - e[1], dz = b.pos[2] - e[2];
        cx[m] = q.sx; cy[m] = q.sy;
        rr[m] = b.radius * pxPerMetreRef(Math.sqrt(dx * dx + dy * dy + dz * dz));
        m++;
      }
      for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
          const ddx = cx[i]! - cx[j]!, ddy = cy[i]! - cy[j]!, sum = rr[i]! + rr[j]!;
          if (ddx * ddx + ddy * ddy < sum * sum) return false;
        }
      }
      return true;
    };

    /*
     * ELEVATION IS SEARCHED, LOWEST FIRST, AND THE ORDER IS A MEASURED PREFERENCE RATHER THAN A TASTE.
     *
     * At 0 the planes collapse onto one line and the environment has no argument left; the higher the camera,
     * the more the reader is looking at a diagram again. So low is preferred. But a shell seen at 26 degrees is
     * an ellipse whose minor axis is compressed by sin(26) = 0.44, and that compression lands on exactly the
     * part of the ring where bodies are already closest together on screen — so a populous shell with ample
     * room IN THE PLANE still merges silhouettes at a low camera. Raising the elevation decompresses it.
     *
     * The alternative was to spread the shells by 1/sin(elevation) instead, which pushes the camera back and
     * shrinks every body toward the 9-pixel floor: the same crowding, paid for out of legibility. So the
     * search takes the LOWEST elevation at which nothing merges, and the spacing ladder is the second lever.
     */
    const candidates: Viewpoint[] = [];
    for (const elevationDeg of ELEVATION_LADDER) {
      for (let i = 0; i < AZIMUTH_STEPS; i++) {
        candidates.push({ ...baseView, azimuthDeg: (i * 360) / AZIMUTH_STEPS, elevationDeg });
      }
    }

    /*
     * ── THE LENS IS FITTED TO THE DRAWING, AND THAT IS WHERE THE MISSING PIXELS WERE ──────
     *
     * `distance` above frames the system's BOUNDING SPHERE at tangency. The drawing is not a sphere. It is a
     * stack of tilted rings and a rail, so the frame it produced left empty canvas the reader had paid for,
     * and every body came out smaller than the window allowed. That is what put the 9-pixel floor out of
     * reach of a 13-inch MacBook: the floor was not being failed by the ontology, it was being failed by the
     * lens.
     *
     * MEASURED, at 1184x768 over every body silhouette and every drawn ring, and corrected — the first
     * version of this paragraph said 64% of height and 38% of width, and a skeptic could reproduce neither:
     *
     *     all content   66.5% h / 51.7% w   →   88.2% h / 68.6% w
     *     bodies only   64.2% h / 44.6% w   →   85.2% h / 59.2% w
     *
     * The 38.2% was unreachable by any method — swept over 24 azimuths and 6 elevations the minimum width
     * fill is 51.7% — and the 92% it claimed to reach was the `FRAME_FILL` constant restated as though it
     * were an observation. The two together implied 1.433 vertical against 1.675 horizontal, two different
     * factors, which THIS FILE'S OWN exact-zoom property forbids: at this canvas the shipped azimuth already
     * equals the incumbent's, so the change is a pure zoom and it measures 1.327 on BOTH axes.
     *
     * Recorded at length because the number was not a stray line in a report. It was the headline
     * justification for the change, written into this comment and restated as its complement in the test —
     * and no test guarded it, which is exactly why it survived.
     *
     * THE FIELD OF VIEW IS THE ONE CAMERA PARAMETER THAT COSTS NOTHING TO CHANGE. At a fixed eye and
     * orientation, narrowing it is exactly a crop and a scale of the same image:
     *
     *   · relative body sizes            — unchanged, every projected radius scales by the same factor;
     *   · the merge test                 — unchanged, both sides of `d < r_i + r_j` scale together;
     *   · the depth cue AND its cost     — unchanged, near-versus-far magnification is set by distance alone,
     *                                      so the perspective distortion budget spent at `FOV_REF` is not
     *                                      re-spent here;
     *   · what a body's size MEANS       — unchanged. `observedRadius` is untouched: still
     *                                      `0.20 + 0.235·log10(1 + couplings)`, still an order-of-magnitude
     *                                      reading of the coupling count in the FULL ontology.
     *
     * So this is not a tuning that trades legibility against honesty. It hands back canvas that was being
     * discarded. The clamp to `FOV_REF` is what makes that a guarantee rather than an intention: the fitted
     * lens is never WIDER than the reference, so no input can come out smaller than it does today.
     *
     * WHAT IS FRAMED IS WHAT IS DRAWN, DERIVED FROM THE SAME ARRAYS THE RENDERER READS — every body with its
     * radius, one inclined ring per occupied (kind, shell) off `bodies`, and one flat control ring per shell
     * on the plate. Links join bodies, so they are inside that hull already. The DECK is deliberately excluded:
     * it is a ground plane `3.4 · extent` across whose job is to run past the frame, and framing it would frame
     * the floor instead of the system. `theFitFramesEverythingTheRendererDraws` reads the renderer's own source
     * and fails if it ever draws a sixth kind of thing.
     */
    const fitLens = (v: Viewpoint): number => {
      const e = eyeOf(v) as V3;
      /* Exactly `lookAt`'s basis, so the fit is measured in the frame the projection will actually use. */
      const zAx = ((): V3 => { const d = sub3(e, v.target as V3); const l = len3(d) || 1; return [d[0] / l, d[1] / l, d[2] / l]; })();
      /* right = cross(up, z) with up = (0,1,0), written out: the sign is the whole content, and a mirrored
         basis still returns plausible finite numbers. Checked against z = (0,0,1), where right must be
         (1,0,0). */
      const xRaw: V3 = [zAx[2], 0, -zAx[0]];
      const xl = len3(xRaw);
      /* up × z is degenerate only when the camera looks straight down, which `ELEVATION_LIMIT` forbids. If it
         ever happens the reference lens is returned rather than a narrower guess at a basis nobody has. */
      if (xl < 1e-8) return FOV_REF;
      const xAx: V3 = [xRaw[0] / xl, xRaw[1] / xl, xRaw[2] / xl];
      const yAx: V3 = [
        zAx[1] * xAx[2] - zAx[2] * xAx[1],
        zAx[2] * xAx[0] - zAx[0] * xAx[2],
        zAx[0] * xAx[1] - zAx[1] * xAx[0],
      ];

      /* The ring tube at the REFERENCE lens, which is the widest it can be: the tube is specified in pixels,
         so narrowing the lens shrinks it in metres. Using the reference value keeps the fit conservative
         without needing to solve the tube and the lens together. */
      const refTube = RING_PX / (2 * pxPerMetreRef(distance));
      const pts: { readonly p: V3; readonly r: number }[] = bodies.map((b) => ({ p: b.pos, r: b.radius }));
      /* A sampled circle cuts the corner between samples; the sagitta is added back so the fit is an upper
         bound on the real ring rather than an upper bound on the samples. */
      const sag = 1 - Math.cos(Math.PI / RING_SAMPLES);
      const addRing = (r: number, incDeg: number, nodeDeg: number, y: number): void => {
        for (let i = 0; i < RING_SAMPLES; i++) {
          const q = orbitPoint(r, (i * 360) / RING_SAMPLES, incDeg, nodeDeg);
          pts.push({ p: [q[0], q[1] + y, q[2]], r: refTube + r * sag });
        }
      };
      /* THE SAME DERIVATION `OntologyOrreryGl` USES for its inclined rings — one per (kind, shell) that is
         actually occupied, off the bodies themselves, from the one plane table. */
      const inclined = new Map<string, readonly [number, number, number]>();
      for (const b of bodies) {
        if (b.offSystem || b.isCore || b.hops === null) continue;
        const pl = ORRERY_PLANES[b.kind];
        if (pl === undefined) continue;
        inclined.set(b.kind + '@' + String(b.hops), [b.shell, pl.incDeg, pl.nodeDeg]);
      }
      for (const [r, inc, node] of inclined.values()) addRing(r, inc, node, 0);
      /* The flat control rings, on the plate, one per shell radius. */
      for (const s of shells) addRing(s, 0, 0, DECK_Y);

      let need = 0;
      for (const { p, r } of pts) {
        const d = sub3(p, e);
        const depth = -dot3(d, zAx);
        /* Content at or behind the near plane has no finite projection to fit against. The reference lens is
           returned rather than a number derived from a division that is about to blow up. */
        if (!(depth > NEAR)) return FOV_REF;
        const vertical = (Math.abs(dot3(d, yAx)) + r) / (depth * FRAME_FILL);
        const horizontal = (Math.abs(dot3(d, xAx)) + r) / (aspect * depth * FRAME_FILL);
        if (vertical > need) need = vertical;
        if (horizontal > need) need = horizontal;
      }
      if (!(need > 0) || !Number.isFinite(need)) return FOV_REF;
      return Math.min(FOV_REF, (2 * Math.atan(need)) / RAD);
    };

    /*
     * THE WHOLE SWEEP IS RUN, SO THE PUBLISHED COUNT IS STILL A COUNT — "3 of 118 viewpoints are clean" is a
     * fact about all 118, not about the prefix the search happened to stop in. Truncation therefore shortens
     * the sweep, and `search.truncated` says when it did.
     *
     * At the DEFAULT budget that is now unconditional rather than probable: the ceiling is exactly the sweep,
     * so `truncated` is false for every input on every machine, and it is reachable only by a caller that
     * asks for fewer candidates than there are. It used to be reachable by a caller who was merely unlucky.
     *
     * ELEVATION IS STILL DECIDED FIRST AND LOWEST WINS. The azimuth was NOT decided at all: the old search
     * drew the first clean viewpoint, which is the lowest azimuth that happened to pass, and that is a
     * tie-break masquerading as a choice. It is not free. Measured on the shipped fifty-state ontology, the
     * lens the content needs at elevation 26 ranges from 24.9 to 32.3 degrees across the 24 azimuths — the
     * same system, the same distance, the same clean verdict, and a 29% difference in how much of the canvas
     * the drawing gets.
     *
     * So among the viewpoints that are clean AT THE LOWEST CLEAN ELEVATION, the one drawn is the one that
     * makes THE SMALLEST ENTITY LARGEST. Every one of them is equally admissible — the angular positions are
     * assigned from the data, so no azimuth means anything the others do not — and the smallest body is the
     * quantity the pixel floor is about, so this maximises exactly what the refusal below measures.
     *
     * IT IS NOT THE SAME AS THE NARROWEST LENS, WHICH IS WHAT THIS TRIED FIRST AND MEASURED ITS WAY OUT OF.
     * A body's pixels are `2r / (dist_to_eye · tan(halfV))`, so an azimuth can buy a narrower lens and spend
     * more than it bought by swinging the smallest body to the far side of the system. Measured on
     * states+licences+requirements at 1184x768, minimising the lens took 26.59° to 25.83° and took the
     * smallest body from 15.4 px DOWN to 11.9 px. Optimising the objective the guard states fixes that by
     * construction, and because the old first-clean viewpoint is itself a candidate here, the chosen frame
     * can never be worse than it. Ties break on the lowest azimuth, so the same graph still produces the
     * same frame.
     */
    let tried = 0, clean = 0, truncated = false;
    let lowestCleanElevation = Infinity;
    const cleanAtLowest: Viewpoint[] = [];
    for (const v of candidates) {
      /* The budget is spent in CANDIDATES, so which prefix a truncated sweep sees is a property of the input
         and not of the machine. `tried > 0` keeps the old guarantee that every rung evaluates at least one
         viewpoint, so a budget smaller than the ladder still returns a frame rather than an empty search. */
      if (tried > 0 && spent >= budget) { truncated = true; break; }
      spent++;
      tried++;
      if (!isCleanAt(v)) continue;
      clean++;
      if (v.elevationDeg < lowestCleanElevation) { lowestCleanElevation = v.elevationDeg; cleanAtLowest.length = 0; }
      if (v.elevationDeg === lowestCleanElevation) cleanAtLowest.push(v);
    }
    /** Screen diameters at a viewpoint, in CSS pixels, through a given lens. */
    const bodyPxAt = (v: Viewpoint, fovDeg: number): number[] => {
      const e = eyeOf(v) as V3;
      const scale = (cssHeight / 2) / Math.tan((fovDeg / 2) * RAD);
      return bodies.map((b) => (2 * b.radius * scale)
        / Math.max(0.01, Math.hypot(b.pos[0] - e[0], b.pos[1] - e[1], b.pos[2] - e[2])));
    };

    /*
     * PAIRS THE FRAME READS THE WRONG WAY ROUND: two OBSERVED entities whose coupling counts differ, where the
     * one with more couplings draws the same size or SMALLER. That is a misread coupling count — the identical
     * failure the merge test refuses — arriving through depth instead of through overlap, because perspective
     * makes a body's screen size depend on how far it happens to be from the eye as well as on its data.
     *
     * IT IS NOT NEW AND IT IS NOT SMALL. Measured on the shipped fifty-state ontology at HEAD, 480 of 2,056
     * comparable pairs already read backwards, the worst by 7.7 px. This module has never refused on it and
     * does not start now — refusing would refuse every ontology it has — but it is published rather than left
     * invisible, and it CONSTRAINS the viewpoint choice below.
     *
     * The count does not depend on the lens: a field-of-view change scales every diameter by one factor, so
     * every comparison survives it exactly. It depends only on where the camera is.
     */
    const sizeReadings = (v: Viewpoint, fovDeg: number): { couplings: number; px: number }[] => {
      const px = bodyPxAt(v, fovDeg);
      const out: { couplings: number; px: number }[] = [];
      bodies.forEach((b, i) => {
        if (b.magnitude.state === 'observed') out.push({ couplings: b.magnitude.couplings, px: px[i]! });
      });
      return out;
    };
    const misreadPairsAt = (v: Viewpoint): number => misreadSizePairs(sizeReadings(v, FOV_REF)).misread;

    /*
     * THE PIXELS ARE TAKEN ONLY WHERE THE ENCODING IS NOT PAID FOR THEM.
     *
     * `cleanAtLowest[0]` is the lowest azimuth that passed at the lowest clean elevation — exactly the frame
     * this module drew before any of this existed. Its misread count is therefore the fidelity the reader
     * already had, and it is the ceiling: a viewpoint that reads MORE pairs backwards is not admissible no
     * matter how many pixels it buys. Measured, that constraint has teeth — on licences+requirements at
     * 1184x1000 the largest-smallest-body azimuth read 12 pairs backwards against the incumbent's 4, and it
     * is now rejected.
     *
     * Because the incumbent is always inside its own budget, the search cannot come back empty and cannot
     * come back worse: `theFittedFrameIsNeverWorseThanHead` pins both halves of that on the shipped ontology.
     */
    const incumbent = cleanAtLowest[0];
    if (incumbent === undefined) {
      return refuse('BODIES_MERGE_AT_EVERY_VIEWPOINT',
        'at ' + (truncated ? 'each of the first ' : 'every one of the ') + tried + ' viewpoints'
        + (truncated ? ' the search had time for' : ' tried') + ', at least two entities overlap on screen. '
        + 'Size encodes the coupling count here, so a merged pair is a misread number and a hidden entity. '
        + 'Turn off a layer and this system will fit.');
    }
    const orderBudget = misreadPairsAt(incumbent);
    const incumbentReading = {
      azimuthDeg: incumbent.azimuthDeg,
      smallestBodyPx: Number(Math.min(...bodyPxAt(incumbent, FOV_REF)).toFixed(1)),
      misread: orderBudget,
    };
    let chosen: Viewpoint = incumbent;
    let chosenFov = fitLens(incumbent);
    let chosenSmallest = Math.min(...bodyPxAt(incumbent, chosenFov));
    for (const v of cleanAtLowest) {
      if (v === incumbent || misreadPairsAt(v) > orderBudget) continue;
      const f = fitLens(v);
      const s = Math.min(...bodyPxAt(v, f));
      if (s > chosenSmallest) { chosen = v; chosenFov = f; chosenSmallest = s; }
    }
    const eye = eyeOf(chosen) as V3;
    const view: Viewpoint = { ...chosen, fovDeg: chosenFov };
    const halfV = ((view.fovDeg ?? FOV_REF) / 2) * RAD;
    /* THE ONLY SCALE ANY PUBLISHED PIXEL MAY USE, because it is the lens the frame is drawn through. */
    const pxPerMetreAt = (dist: number): number => (cssHeight / 2) / (Math.max(0.01, dist) * Math.tan(halfV));
    const centrePx = pxPerMetreAt(distance);
    /* Pixels first, metres second — see `LINK_PX`. Derived AFTER the fit, so a tube is 3.2 px through the lens
       that ships rather than 3.2 px through the lens the search happened to use. */
    const linkR = LINK_PX / (2 * centrePx);
    const ringTube = RING_PX / (2 * centrePx);

    const links: OrreryLink[] = drawn.flatMap((c): OrreryLink[] => {
      const A = byId.get(c.source), B = byId.get(c.target);
      if (!A || !B) return [];
      return [{
        id: c.id, kind: c.kind, aId: c.source, bId: c.target,
        a: A.pos, b: B.pos, flatA: A.flatPos, flatB: B.flatPos, r: linkR,
      }];
    });

    /* ── LEGIBILITY, IN PIXELS, because a world-space size claim can be sub-pixel and therefore fictional. ── */
    const bodyPx = bodies.map((b) => 2 * b.radius * pxPerMetreAt(
      Math.hypot(b.pos[0] - eye[0], b.pos[1] - eye[1], b.pos[2] - eye[2]),
    ));
    const smallestBody = Math.min(...bodyPx), largestBody = Math.max(...bodyPx);
    if (smallestBody < BODY_PX_FLOOR) {
      return refuse('BODIES_BELOW_LEGIBILITY_FLOOR',
        'the smallest entity would be ' + smallestBody.toFixed(1) + ' pixels across against a floor of '
        + BODY_PX_FLOOR + ', and a size encoding on an anti-aliased dot is not an encoding. This system '
        + 'needs either fewer entities or a larger window.');
    }

    /* ── THE CROSSING ANALYSIS ── */
    type Seg = { aId: string; bId: string; a: V3; b: V3; r: number };
    const disjointPairs = (segs: readonly Seg[]): [Seg, Seg][] => {
      const out: [Seg, Seg][] = [];
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const s = segs[i]!, t = segs[j]!;
          if (s.aId === t.aId || s.aId === t.bId || s.bId === t.aId || s.bId === t.bId) continue;
          out.push([s, t]);
        }
      }
      return out;
    };
    const segs3D: Seg[] = links.map((l) => ({ aId: l.aId, bId: l.bId, a: l.a, b: l.b, r: l.r }));
    const segsFlat: Seg[] = links.map((l) => ({ aId: l.aId, bId: l.bId, a: l.flatA, b: l.flatB, r: l.r }));

    const grazing = (segs: readonly Seg[]): { pairs: number; minSeparation: number } => {
      let pairs = 0, minSep = Infinity;
      for (const [s, t] of disjointPairs(segs)) {
        const d = segSeg(s.a, s.b, t.a, t.b).dist;
        minSep = Math.min(minSep, d);
        if (d < s.r + t.r) pairs++;
      }
      return { pairs, minSeparation: Number.isFinite(minSep) ? minSep : 0 };
    };

    /* The view ray through a CSS pixel, built from the camera basis rather than from a matrix inverse
       (`@lcx/gl`'s math has no inverse, and adding one for a diagnostic would be a spine change). Needed
       because the screen parameter of a projected segment is NOT its world parameter under perspective, so
       reading the depth off the 2-D t is wrong by a few percent at the near end — small, and exactly the kind
       of small that turns a 0 into a 1. */
    const rayThrough = (sx: number, sy: number): V3 => {
      const d = sub3(view.target as V3, eye); const l = len3(d) || 1;
      const fwd: V3 = [d[0] / l, d[1] / l, d[2] / l];
      /* right = cross(fwd, +Y), which for up = (0,1,0) is (-f.z, 0, f.x). Written out because the sign is the
         entire content: negated, it mirrors the ray horizontally, and a mirrored ray still returns plausible
         finite depths — the analysis would report separations measured at the wrong point with nothing looking
         wrong. Checked against fwd = (0,0,-1), where right must come out (1,0,0). */
      const c: V3 = [-fwd[2], 0, fwd[0]];
      const cl = len3(c) || 1;
      const rgt: V3 = [c[0] / cl, c[1] / cl, c[2] / cl];
      const up: V3 = [
        rgt[1] * fwd[2] - rgt[2] * fwd[1],
        rgt[2] * fwd[0] - rgt[0] * fwd[2],
        rgt[0] * fwd[1] - rgt[1] * fwd[0],
      ];
      const tanH = Math.tan(halfV);
      const ndcX = (sx / cssWidth) * 2 - 1, ndcY = 1 - (sy / cssHeight) * 2;
      const dx = fwd[0] + rgt[0] * ndcX * tanH * aspect + up[0] * ndcY * tanH;
      const dy = fwd[1] + rgt[1] * ndcX * tanH * aspect + up[1] * ndcY * tanH;
      const dz = fwd[2] + rgt[2] * ndcX * tanH * aspect + up[2] * ndcY * tanH;
      const dl = Math.hypot(dx, dy, dz) || 1;
      return [dx / dl, dy / dl, dz / dl];
    };

    const vp = viewProjection(view, aspect);
    const projected = new Map<Seg, { a: { sx: number; sy: number; behind: boolean }; b: { sx: number; sy: number; behind: boolean } }>();
    for (const s of segs3D) {
      projected.set(s, {
        a: projectScreen(vp, s.a, cssWidth, cssHeight),
        b: projectScreen(vp, s.b, cssWidth, cssHeight),
      });
    }
    let onScreen = 0, ambiguous = 0, minSepScreen = Infinity;
    for (const [s, t] of disjointPairs(segs3D)) {
      const ps = projected.get(s)!, pt = projected.get(t)!;
      if (ps.a.behind || ps.b.behind || pt.a.behind || pt.b.behind) continue;
      const x = cross2(ps.a.sx, ps.a.sy, ps.b.sx, ps.b.sy, pt.a.sx, pt.a.sy, pt.b.sx, pt.b.sy);
      if (!x) continue;
      onScreen++;
      /* The separation MEASURED ALONG THE VIEW RAY through the crossing pixel, which is the quantity a
         reader's eye is being asked to resolve. */
      const sxp = ps.a.sx + (ps.b.sx - ps.a.sx) * x.t, syp = ps.a.sy + (ps.b.sy - ps.a.sy) * x.t;
      const dir = rayThrough(sxp, syp);
      const far: V3 = [eye[0] + dir[0] * FAR, eye[1] + dir[1] * FAR, eye[2] + dir[2] * FAR];
      const ca = segSeg(s.a, s.b, eye, far).c1;
      const cb = segSeg(t.a, t.b, eye, far).c1;
      const sep = len3(sub3(ca, cb));
      minSepScreen = Math.min(minSepScreen, sep);
      if (sep < s.r + t.r) ambiguous++;
    }

    /** Crossings of a layout IN ITS OWN PLANE — camera-independent, because it is a drawing. */
    const inPlane = (segs: readonly Seg[]): number => {
      let n = 0;
      for (const [s, t] of disjointPairs(segs)) {
        if (cross2(s.a[0], s.a[2], s.b[0], s.b[2], t.a[0], t.a[2], t.b[0], t.b[2])) n++;
      }
      return n;
    };

    /**
     * A link passing through a body it is not attached to hides that body, in either layout — and there are two
     * degrees of it, which E4 did not separate and which matter differently here.
     *
     * GRAZES: the tube's surface touches the body's silhouette (`dist < r_body + r_tube`). That is E4's test and
     * it is reported, because at up to a hundred entities it is common and it does cost the reader something.
     * But depth still resolves it: the tube visibly passes in front of, or behind, a body whose outline is
     * otherwise intact.
     *
     * PIERCES: the tube's axis is INSIDE the body (`dist < 0.8 · r_body`). Nothing resolves that — the entity is
     * behind a tube through its middle — so it is the gate, and grazes are not. Gating on grazes was tried and
     * refused a six-entity system where the flat control happened to have none: a threshold that fails the
     * easiest case is measuring the wrong thing.
     */
    const throughBodies = (segs: readonly Seg[], flat: boolean, pierce: boolean): number => {
      let n = 0;
      for (const s of segs) {
        for (const b of bodies) {
          if (b.id === s.aId || b.id === s.bId) continue;
          const p = flat ? b.flatPos : b.pos;
          const limit = pierce ? b.radius * 0.8 : b.radius + s.r;
          if (segSeg(s.a, s.b, p, p).dist < limit) n++;
        }
      }
      return n;
    };

    /*
     * THE SHIPPING DIAGRAM, MEASURED ON ITS OWN COORDINATES. E4's harness could not do this — it compared
     * against its own layout with the inclinations zeroed, and its README says so: "the flat baseline is my
     * construction of the flat layout, not the shipping component". Here the component's own force-layout
     * positions arrive as an input, so the comparison is against what the reader is actually looking at.
     *
     * TWO CAVEATS, both carried onto the frame: the diagram routes each edge with `smoothstep` from one node's
     * right edge to the next node's left edge, and this measures a straight chord between those two anchors —
     * an orthogonal route bends around obstacles, so this is an approximation of its own layout rather than a
     * trace of it. And every crossing counted here is AMBIGUOUS, which is not an assumption: a drawing in a
     * plane has no depth with which to resolve one.
     */
    let shippingDiagram: number | null = null;
    if (input.flatCentres && input.flatCentres.length > 0) {
      const half = input.flatHalfWidth ?? 0;
      const at = new Map(input.flatCentres.map((c) => [c.id, c]));
      type Flat2 = { aId: string; bId: string; ax: number; ay: number; bx: number; by: number };
      const flat2: Flat2[] = [];
      for (const c of drawn) {
        const s = at.get(c.source), t = at.get(c.target);
        if (!s || !t) continue;
        flat2.push({ aId: c.source, bId: c.target, ax: s.x + half, ay: s.y, bx: t.x - half, by: t.y });
      }
      let n = 0;
      for (let i = 0; i < flat2.length; i++) {
        for (let j = i + 1; j < flat2.length; j++) {
          const s = flat2[i]!, t = flat2[j]!;
          if (s.aId === t.aId || s.aId === t.bId || s.bId === t.aId || s.bId === t.bId) continue;
          if (cross2(s.ax, s.ay, s.bx, s.by, t.ax, t.ay, t.bx, t.by)) n++;
        }
      }
      shippingDiagram = n;
    }

    const graze3D = grazing(segs3D);
    const grazeFlat = grazing(segsFlat);
    const flatControlInPlane = inPlane(segsFlat);
    const through3D = throughBodies(segs3D, false, false);
    const throughFlat = throughBodies(segsFlat, true, false);
    const pierced3D = throughBodies(segs3D, false, true);
    const piercedFlat = throughBodies(segsFlat, true, true);

    /*
     * THE GATE E4 PUT ON ITSELF: "if a reordering could get the flat diagram to zero crossings then inclination
     * would be buying nothing and this environment would not be entitled to exist."
     *
     * Two readings are compared against the flat control built from the same graph. If the third axis leaves as
     * many ambiguous crossings as the plane does, or hides as many entities behind links, then it has spent a
     * dimension and bought nothing, and the honest thing is to keep the reader on the diagram they had. The
     * `> 0` guards matter: a small system where both layouts are clean is a WIN for neither, and refusing it
     * would refuse the easiest case there is.
     */
    if (thirdAxisBuysNothing(ambiguous, flatControlInPlane)) {
      return refuse('THIRD_AXIS_BUYS_NOTHING',
        'the orbital layout leaves ' + ambiguous + ' crossing(s) a reader cannot resolve, against '
        + flatControlInPlane + ' in the same layout flattened. Inclination is supposed to buy that number '
        + 'down; here it does not, so the diagram is the better reading and this view will not pretend '
        + 'otherwise.');
    }
    /*
     * A PIERCED BODY IS A REPORTED COST, NOT A REFUSAL, and the difference is where E4 landed too: its harness
     * counted `linksThroughBodies` and fixed it by MOVING an entity by hand, rather than declining to draw.
     * Nothing here can move an entity — the angles are derived from the data so that the same graph always
     * produces the same frame — so the spacing ladder is what tries, and the count is what is published when it
     * fails. Gating on it refused a six-entity system over one grazing link while the diagram beside it had
     * crossing edges everywhere, which is a threshold measuring its own strictness.
     */

    const counts = {
      observed: bodies.filter((b) => b.magnitude.state === 'observed').length,
      absent: bodies.filter((b) => b.magnitude.state === 'absent').length,
      withheld: bodies.filter((b) => b.magnitude.state === 'withheld').length,
      offSystem: offSystem.length,
    };

    /* One ring per (kind, shell) that is occupied, against one ring per shell with the inclinations zeroed.
       The difference is what the third axis buys as a count rather than as an impression: flattened, a
       licence's one-hop ring and a requirement's one-hop ring are the SAME circle. */
    const inclinedRings = new Set(
      bodies.filter((b) => !b.offSystem && !b.isCore).map((b) => b.kind + '@' + String(b.hops)),
    ).size;
    const flatRings = new Set(
      bodies.filter((b) => !b.offSystem && !b.isCore).map((b) => String(b.hops)),
    ).size;

    return {
      bodies, links, core, view, eye, shells, outerRadius: outerShell,
      deckSize: Math.max(20, extent * 3.4),
      ringTube,
      kindsPresent,
      crossings: {
        onScreen, ambiguous,
        minSeparationM: Number((Number.isFinite(minSepScreen) ? minSepScreen : 0).toFixed(4)),
        grazingPairs3D: graze3D.pairs,
        minSeparation3DM: Number(graze3D.minSeparation.toFixed(4)),
        flatControlInPlane,
        flatControlGrazing: grazeFlat.pairs,
        shippingDiagram,
        throughBodies3D: through3D,
        throughBodiesFlat: throughFlat,
        piercedBodies3D: pierced3D,
        piercedBodiesFlat: piercedFlat,
      },
      counts,
      px: {
        smallestBody: Number(smallestBody.toFixed(1)),
        largestBody: Number(largestBody.toFixed(1)),
        ring: Number((2 * ringTube * centrePx).toFixed(1)),
        link: Number((2 * linkR * centrePx).toFixed(1)),
      },
      sizeOrder: ((): OrreryLayout['sizeOrder'] => {
        /* Measured off the same `bodyPx` array the floor was checked against, so the number cannot describe a
           different camera from the one drawn. */
        const readings: { couplings: number; px: number }[] = [];
        bodies.forEach((b, i) => {
          if (b.magnitude.state === 'observed') readings.push({ couplings: b.magnitude.couplings, px: bodyPx[i]! });
        });
        const m = misreadSizePairs(readings);
        return {
          comparablePairs: m.comparablePairs,
          misread: m.misread,
          worstMisreadPx: Number(m.worstPx.toFixed(2)),
          fovDeg: Number((view.fovDeg ?? FOV_REF).toFixed(2)),
        };
      })(),
      incumbent: incumbentReading,
      search: {
        tried, clean, attempts: SPACING_LADDER.indexOf(crowd) + 1, spacing: crowd, truncated,
        candidates: spent,
      },
      flatRingsCollapsed: inclinedRings - flatRings,
    };
  };

  /*
   * THE LADDER. Tightest spacing first, because tight keeps the camera close and the bodies large, and a wider
   * one is only better if the tighter one actually failed a measurement. Stops at the first spacing that both
   * draws AND hides nothing behind a link; if none manages that, the fewest-hidden result is drawn and the count
   * goes on the frame. Ties go to the tightest, which is the first.
   */
  let last: OrreryRefusal = refuse('BODIES_MERGE_AT_EVERY_VIEWPOINT', 'no spacing was tried');
  let best: OrreryLayout | null = null;
  for (const crowd of SPACING_LADDER) {
    const out = attempt(crowd);
    if (isOrreryRefusal(out)) {
      last = out;
      /* A refusal that is not about crowding will not be cured by more room, so the ladder stops: retrying a
         kind with no plane at a wider spacing spends the budget three times to print the same sentence. */
      if (out.code !== 'BODIES_MERGE_AT_EVERY_VIEWPOINT' && out.code !== 'THIRD_AXIS_BUYS_NOTHING') break;
    } else {
      if (out.crossings.piercedBodies3D === 0) return out;
      if (best === null || out.crossings.piercedBodies3D < best.crossings.piercedBodies3D) best = out;
    }
    /* Same budget, same counter: three rungs share one ceiling, so the ladder stops on a count rather than on
       a clock and a loaded machine climbs exactly as far as an idle one. */
    if (spent >= budget) break;
  }
  return best ?? last;
}

/* ── THE STANDING PROOF THAT THE DEADLINE DOES NOT COME BACK ───────────────────────── */

/**
 * EVERY CLOCK READ IN A PIECE OF SOURCE, with comments and string literals removed first.
 *
 * A behavioural test cannot prove this module is machine-independent: it can only fail to catch a machine it
 * did not simulate. What CAN be proven is the property that made it machine-dependent — that the search
 * consulted a clock — so this reads the source and names every read. Applied to `orreryLayout.ts` itself the
 * answer must be the empty list, and the day somebody reaches for `performance.now()` again the assertion
 * that used to pass fails with the line in its message.
 *
 * Comments and strings are stripped rather than matched around, because this module's own prose says
 * "performance.now()" several times and a guard that trips on its own documentation is a guard that gets
 * deleted. The scanner is a character state machine for that reason and not a regular expression.
 *
 * TEMPLATE SUBSTITUTIONS ARE SCANNED AS CODE, not skipped with the literal around them: `${Date.now()}` is a
 * clock read, and a guard that steps over it would pass the exact line it exists to catch. Its brace depth is
 * tracked per substitution so a nested block inside one does not end it early. The one construct this
 * misreads is a `//` inside a regular-expression literal, and this file contains no regex literals.
 */
export function wallClockReadsIn(source: string): readonly string[] {
  let code = '';
  /* 'c' code · 'l' line comment · 'b' block comment · 'q' quoted string · 't' template literal */
  let state: 'c' | 'l' | 'b' | 'q' | 't' = 'c';
  let quote = '';
  /* One entry per template literal we are inside the `${…}` of; the number is that substitution's brace depth. */
  const substitutions: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!, next = source[i + 1] ?? '';
    if (state === 'c') {
      if (ch === '/' && next === '/') { state = 'l'; i++; continue; }
      if (ch === '/' && next === '*') { state = 'b'; i++; continue; }
      if (ch === '"' || ch === "'") { state = 'q'; quote = ch; continue; }
      if (ch === '`') { state = 't'; continue; }
      if (substitutions.length > 0) {
        if (ch === '{') substitutions[substitutions.length - 1]!++;
        else if (ch === '}') {
          if (substitutions[substitutions.length - 1]! === 0) { substitutions.pop(); state = 't'; continue; }
          substitutions[substitutions.length - 1]!--;
        }
      }
      code += ch;
      continue;
    }
    /* Newlines are kept in every state so the reported line numbers are the file's own. */
    if (ch === '\n') code += '\n';
    if (state === 'l') { if (ch === '\n') state = 'c'; continue; }
    if (state === 'b') { if (ch === '*' && next === '/') { state = 'c'; i++; } continue; }
    if (ch === '\\') { i++; continue; }
    if (state === 'q' && ch === quote) state = 'c';
    else if (state === 't' && ch === '`') state = 'c';
    else if (state === 't' && ch === '$' && next === '{') { substitutions.push(0); state = 'c'; i++; }
  }
  /* Every way this runtime hands out a wall clock or a monotonic one. `new Date` is included because a
     deadline built from it is the same defect wearing a different constructor. */
  const CLOCKS = /\b(?:performance\s*\.\s*(?:now|timeOrigin)|Date\s*\.\s*now|new\s+Date|process\s*\.\s*hrtime)/g;
  /* Matched over the WHOLE stripped source rather than line by line, and the line derived from the match
     offset: a per-line scan missed `performance\n  .now()`, which is one formatter away from being written. */
  const out: string[] = [];
  for (const m of code.matchAll(CLOCKS)) {
    const line = 1 + (code.slice(0, m.index).match(/\n/g)?.length ?? 0);
    out.push(`line ${line}: ${m[0].replace(/\s+/g, ' ')}`);
  }
  return out;
}
