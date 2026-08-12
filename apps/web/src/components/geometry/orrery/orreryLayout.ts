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
 * The claim is NOT "fewer lines cross". From most viewpoints more of them cross here, and the numbers below
 * say so. The claim is that a crossing is not AMBIGUOUS, and it is proven without reference to a camera: two
 * tubes can only fuse into an unreadable X if their minimum separation in 3-D is less than the sum of their
 * radii, and that quantity does not depend on where the camera is. So the number is computable, testable, and
 * belongs in a file a unit test can import — which a WebGL2 component under jsdom is not.
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
  /** Wall-clock ceiling for the viewpoint search, in ms. A truncated sweep that says so is a measurement. */
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
  /** Links that pass through a body they are not attached to. A hidden entity, counted in both layouts. */
  readonly throughBodies3D: number;
  readonly throughBodiesFlat: number;
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
  /** What the search did: viewpoints tried, how many were clean, which spacing survived, and how long. */
  readonly search: {
    readonly tried: number;
    readonly clean: number;
    readonly attempts: number;
    readonly spacing: number;
    readonly truncated: boolean;
    readonly ms: number;
  };
  /** One ring per shell instead of one per kind per shell — what the third axis buys, as a count. */
  readonly flatRingsCollapsed: number;
}

export type OrreryOutcome = OrreryLayout | OrreryRefusal;

const refuse = (code: OrreryRefusalCode, reason: string): OrreryRefusal => ({ kind: 'refused', code, reason });

/**
 * Build the whole system, or refuse it.
 *
 * Pure: no canvas, no GL context, and no clock other than the search budget. Every claim in the result is
 * computed here so a test can assert it and a HUD can print it without either of them re-deriving it.
 */
export function buildOrrery(input: OrreryInput): OrreryOutcome {
  const t0 = performance.now();
  const deadline = t0 + (input.searchBudgetMs ?? 400);
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

    /* ── THE CAMERA ── 36 degrees, because a wide lens cannot render a deep space: it throws the outer shells
       past the frame edge and exaggerates the depth across one ring, so a circle reads as an egg and two
       bodies on one shell read as two different distances from the core, destroying the exact encoding radius
       is carrying. Distance is FRAMED from the system's own extent rather than authored, because the extent
       depends on the reader's filters. ── */
    const FOV = 36;
    const aspect = cssWidth / cssHeight;
    const extent = Math.max(
      outerShell + Math.max(...bodies.map((b) => b.radius)),
      offSystem.length > 0 ? Math.hypot(railSpan / 2, railZ) : 0,
    );
    const halfV = (FOV / 2) * RAD;
    /* The vertical field governs a wide canvas and the horizontal one governs a narrow canvas, so both are
       computed and the larger distance wins. Framing the vertical alone put half the outer shell off a
       portrait canvas with every number in the report still correct. */
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const distance = Math.max(extent / Math.sin(halfV), extent / Math.sin(halfH)) * 1.06;
    const NEAR = 0.5, FAR = Math.max(120, distance * 3);
    const baseView: Viewpoint = {
      target: [0, 0.35, 0], distance, azimuthDeg: 0, elevationDeg: 26, fovDeg: FOV, near: NEAR, far: FAR,
    };
    const pxPerMetreAt = (dist: number): number => (cssHeight / 2) / (Math.max(0.01, dist) * Math.tan(halfV));
    const centrePx = pxPerMetreAt(distance);
    /* Pixels first, metres second — see `LINK_PX`. */
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

    const discsAt = (v: Viewpoint): { cx: number; cy: number; r: number; behind: boolean }[] => {
      const e = eyeOf(v) as V3;
      const vp = viewProjection(v, aspect);
      return bodies.map((b) => {
        const q = projectScreen(vp, b.pos, cssWidth, cssHeight);
        const d = Math.hypot(b.pos[0] - e[0], b.pos[1] - e[1], b.pos[2] - e[2]);
        return { cx: q.sx, cy: q.sy, r: b.radius * pxPerMetreAt(d), behind: q.behind };
      });
    };
    /*
     * TWO BODIES WHOSE PROJECTED DISCS MERGE, which depth does NOT resolve.
     *
     * Depth resolves an ambiguous link crossing, because one tube visibly passes in front of the other. It does
     * not resolve two spheres whose silhouettes overlap: the nearer eats the further one's outline and the pair
     * reads as one body with a lump on it. Size is an encoding here, so a merged silhouette is a misread
     * coupling count, and it is the one failure of this layout that is purely a function of where the camera
     * is. So the camera is CHOSEN by this count rather than composed, and when no viewpoint is clean the view
     * refuses rather than shipping a frame with a hidden entity in it.
     */
    const mergedAt = (v: Viewpoint): number => {
      const ds = discsAt(v).filter((d) => !d.behind);
      let n = 0;
      for (let i = 0; i < ds.length; i++) {
        for (let j = i + 1; j < ds.length; j++) {
          const a = ds[i]!, b = ds[j]!;
          if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r) n++;
        }
      }
      return n;
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
    for (const elevationDeg of [26, 33, 40, 47, 55, 63]) {
      for (let i = 0; i < 24; i++) candidates.push({ ...baseView, azimuthDeg: i * 15, elevationDeg });
    }
    /*
     * The FIRST clean viewpoint is the one drawn, and the sweep then continues only to COUNT the others —
     * which is what makes "39 of 144 viewpoints are clean" a fact rather than a claim. Because nothing after
     * the first clean hit can change the camera, the budget may truncate the COUNT without changing the frame,
     * and `search.truncated` says when it did.
     */
    let tried = 0, clean = 0, truncated = false;
    let bestMerged = Infinity;
    let chosen: Viewpoint | null = null;
    for (const v of candidates) {
      if (tried > 0 && performance.now() > deadline) { truncated = true; break; }
      tried++;
      const merged = mergedAt(v);
      if (merged < bestMerged) bestMerged = merged;
      if (merged === 0) { clean++; if (chosen === null) chosen = v; }
    }
    if (chosen === null) {
      return refuse('BODIES_MERGE_AT_EVERY_VIEWPOINT',
        'at ' + (truncated ? 'each of the first ' : 'every one of the ') + tried + ' viewpoints'
        + (truncated ? ' the search had time for' : ' tried') + ', at least ' + bestMerged
        + ' pair of entities overlaps on screen. Size encodes the coupling count here, so a merged pair is a '
        + 'misread number and a hidden entity. Turn off a layer and this system will fit.');
    }
    const view = chosen;
    const eye = eyeOf(view) as V3;

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

    /** A link passing through a body it is not attached to hides that body, in either layout. */
    const throughBodies = (segs: readonly Seg[], flat: boolean): number => {
      let n = 0;
      for (const s of segs) {
        for (const b of bodies) {
          if (b.id === s.aId || b.id === s.bId) continue;
          const p = flat ? b.flatPos : b.pos;
          if (segSeg(s.a, s.b, p, p).dist < b.radius + s.r) n++;
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
    const through3D = throughBodies(segs3D, false);
    const throughFlat = throughBodies(segsFlat, true);

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
    if (ambiguous > 0 && ambiguous >= flatControlInPlane) {
      return refuse('THIRD_AXIS_BUYS_NOTHING',
        'the orbital layout leaves ' + ambiguous + ' crossing(s) a reader cannot resolve, against '
        + flatControlInPlane + ' in the same layout flattened. Inclination is supposed to buy that number '
        + 'down; here it does not, so the diagram is the better reading and this view will not pretend '
        + 'otherwise.');
    }
    if (through3D > 0 && through3D >= throughFlat) {
      return refuse('THIRD_AXIS_BUYS_NOTHING',
        through3D + ' link(s) pass through an entity they are not attached to, against ' + throughFlat
        + ' in the same layout flattened. A link through a body hides the body, and a hidden entity is the '
        + 'failure this layout exists to avoid.');
    }

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
      },
      counts,
      px: {
        smallestBody: Number(smallestBody.toFixed(1)),
        largestBody: Number(largestBody.toFixed(1)),
        ring: Number((2 * ringTube * centrePx).toFixed(1)),
        link: Number((2 * linkR * centrePx).toFixed(1)),
      },
      search: {
        tried, clean, attempts: SPACING_LADDER.indexOf(crowd) + 1, spacing: crowd, truncated,
        ms: Number((performance.now() - t0).toFixed(1)),
      },
      flatRingsCollapsed: inclinedRings - flatRings,
    };
  };

  let last: OrreryRefusal = refuse('BODIES_MERGE_AT_EVERY_VIEWPOINT', 'no spacing was tried');
  for (const crowd of SPACING_LADDER) {
    const out = attempt(crowd);
    if (!isOrreryRefusal(out)) return out;
    last = out;
    /* A refusal that is not about crowding will not be cured by more room, so the ladder stops. Retrying a
       kind with no plane at a wider spacing would just spend the budget three times to print the same
       sentence. */
    if (out.code !== 'BODIES_MERGE_AT_EVERY_VIEWPOINT' && out.code !== 'THIRD_AXIS_BUYS_NOTHING') break;
    if (performance.now() > deadline) break;
  }
  return last;
}
