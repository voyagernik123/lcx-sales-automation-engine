/**
 * DATA GEOMETRY — coordinates in, coordinates out. The last capability in the 100x plan.
 *
 * WHY THIS IS A PURE MODULE AND NOT A RENDERED IMAGE (plan §6.1). Blender renders nothing
 * whose shape encodes a number. A margin surface baked to a bitmap is a screenshot that
 * will be lying within a month: no date, no source, not re-derivable. So the geometry of
 * every figure is COMPUTED HERE — no I/O, no DOM, no React, no clock, no randomness — and
 * `apps/web/src/components/geometry/SurfacePlot.tsx` turns the coordinates into SVG
 * elements and computes NOTHING. An auditor holding the inputs can recompute every vertex.
 * That split is also what makes this testable: the tests assert NUMBERS, not pixels.
 *
 * WHAT THE THIRD AXIS CARRIES, AND WHAT THE FLAT VERSION CANNOT SHOW. The sanctioned
 * subject is a QUANTITY OVER TWO INDEPENDENT VARIABLES, and the one worked example is GPS
 * margin as a function of (price band, effort). Margin is not separable in those two: at a
 * low price a small effort overrun eats the whole margin, and at a high price it does not,
 * so the SHAPE of the margin/effort curve changes as price moves. A 2-D line has to fix one
 * of the two — margin against price AT ONE EFFORT, or margin against effort AT ONE PRICE —
 * and a reader looking at that line cannot tell whether the curve they are shown is
 * representative of the next band along or the opposite of it. The interaction is the whole
 * commercial question ("where does raising the price stop protecting us?") and it lives in
 * the second derivative across the two axes, which is exactly the information a slice
 * deletes. The same argument holds for win probability over (stage, staleness); it does NOT
 * hold for a time series, a ranking or a share, and this module should not be used to draw
 * one. A surface over one real variable and one decorative one is decoration.
 *
 * DOCTRINE APPLIES TO A PICTURE HARDER THAN TO A TABLE, because a picture reads as
 * authoritative and nobody audits a polygon:
 *   · ABSENT DATA REFUSES. A grid cell with no value is NOT z=0 — zero is a real height and
 *     a real margin, and drawing a missing measurement at the height of "we broke even" is
 *     a fabrication a reader cannot detect. A cell whose corners are not all observed
 *     becomes a `SurfaceHole`: it is emitted, positioned and paint-ordered like a quad, so
 *     the renderer draws a visible GAP where the surface would have been. A grid with
 *     nothing in it refuses (`GEOMETRY_ALL_CELLS_ABSENT`) instead of drawing an empty box,
 *     which is the same lie with more ink.
 *   · NEVER INTERPOLATE ACROSS AN ABSENCE. There is no code path in this file that averages
 *     neighbours, and `INTERPOLATION_POLICY` exists so a surface can say so on its face. A
 *     quad needs FOUR observed corners; two known points either side of a missing one do
 *     not license a smooth sheet through it, because that invents a measurement nobody took.
 *   · THREE STATES ARE NEVER COLLAPSED, at the grid level AND at the cell level. At the grid
 *     level: `rows: null` is NOT-LOADED and refuses with `GEOMETRY_GRID_NOT_LOADED`;
 *     `rows: []` is GENUINELY-EMPTY and refuses with `GEOMETRY_GRID_EMPTY`. At the CELL
 *     level a cell is one of three things and each has its own representation: a number is
 *     observed, `null` is genuinely-not-measured, and `WITHHELD` is PRESENT-BUT-WITHHELD —
 *     a height the caller holds and will not put on a figure (need-to-know). Withheld is
 *     not absent: it counts separately on the frame (`pointsWithheld`), lists separately on
 *     a hole (`withheldCorners`), and an all-withheld grid refuses under its own
 *     `GEOMETRY_ALL_CELLS_WITHHELD` rather than under the absence code. Collapsing the two
 *     would tell a reader nobody measured a cell that was measured and then classified.
 *   · A NaN IS NOT AN ABSENCE. `GEOMETRY_Z_NOT_FINITE` is separate from every absence code
 *     on purpose: a NaN is a broken computation upstream, and quietly treating it as "no
 *     data" would launder a bug into a hole in the chart and hide it forever. That holds for
 *     a whole grid of NaNs too — an all-NaN grid raises the NaN code and NOT an absence
 *     code, because "every cell is missing" is a different fact from "every cell is broken".
 *   · A CALLER-SUPPLIED VERTICAL DOMAIN IS AN INPUT AND IS CHECKED LIKE ONE. `zDomain` goes
 *     through the same finiteness gate as the values in `rows`: a NaN arriving through the
 *     domain would otherwise draw a full figure, with an environment label and a cell count,
 *     whose every coordinate is NaN. It must also be strictly increasing, and where the
 *     observed values fall outside it the figure says so (`OBSERVED_RANGE_OUTSIDE_DOMAIN`)
 *     rather than letting the clamped shading and the unclamped height disagree in silence.
 *   · A DOMAIN OVERRIDE NEVER BECOMES A CLAIM ABOUT THE DATA. `flat` is computed from the
 *     OBSERVED values only. `SURFACE_IS_FLAT` quotes the observed constant, so the figure
 *     cannot state a measurement that was never taken.
 *   · A PROJECTION IS A CHOICE, NOT A FACT. `describeProjection` returns the sentence the
 *     renderer must print, naming the azimuth, the elevation, the z-box and the fact that
 *     there is no perspective. A reader who knows they are seeing ONE view can ask for
 *     another; a reader who does not thinks they are seeing the data.
 *   · EVERY FIGURE CARRIES ITS FRAME. `SurfaceObservationFrame` travels on the geometry and
 *     an empty environment refuses. The frame counts observed and absent cells separately,
 *     so "34 of 40 cells observed" is on the picture rather than inferable from it.
 *
 * WHAT THIS MODULE DELIBERATELY IS NOT: it is not a charting library, it has no colours, it
 * has no fonts, it does not know what an SVG is, and it will not hidden-surface-remove
 * anything more general than a single-valued height field over a rectilinear grid. Those
 * limits are why the paint order below can be exact rather than approximate.
 */

/* ══════════════════════════════════════════════════════════════════════════════ */
/* REFUSALS — a stable code, a sentence, the rule it applies                        */
/* ══════════════════════════════════════════════════════════════════════════════ */

export const GEOMETRY_REFUSAL_CODES = [
  /** The grid was never read. NOT the same as it being empty (`rows: null`). */
  'GEOMETRY_GRID_NOT_LOADED',
  /** The grid was read and holds no cells. NOT the same as never having been read. */
  'GEOMETRY_GRID_EMPTY',
  /** Row lengths disagree with the x axis, or row count with the y axis. No mesh exists. */
  'GEOMETRY_GRID_RAGGED',
  /**
   * The grid was read and not one cell holds a value. Refuse, do not draw an empty box.
   * Fires ONLY for genuine absence: an all-NaN grid raises `GEOMETRY_Z_NOT_FINITE` and this
   * code stays silent, because a broken computation reported as an absence is the laundering
   * the two separate codes exist to prevent.
   */
  'GEOMETRY_ALL_CELLS_ABSENT',
  /**
   * The grid was read and every cell is PRESENT BUT WITHHELD. Its own code, because the
   * operator's next move is a permission question, not a measurement one — and because
   * telling a reader "nothing was measured" about data that was measured is a lie.
   */
  'GEOMETRY_ALL_CELLS_WITHHELD',
  /**
   * Values are present but no cell has all four corners observed, so nothing can be drawn
   * without inventing a corner. Separate from ALL_CELLS_ABSENT because the operator's next
   * move differs: this one says "the holes are in the wrong PLACES", not "there is no data".
   */
  'GEOMETRY_NO_COMPLETE_QUAD',
  /**
   * A z value is NaN or Infinite. A broken computation, not an absence — see the docblock.
   * Also raised for a non-finite `zDomain` endpoint: the same number arriving by a different
   * door is the same defect, and refusing it in `rows` while drawing it from the domain would
   * be one laundering path for exactly the value the other path refuses.
   */
  'GEOMETRY_Z_NOT_FINITE',
  /**
   * An axis has no usable extent. Fewer than two coordinates (a line is not a surface), a
   * non-finite coordinate, coordinates that are not strictly ascending (a repeated or
   * out-of-order coordinate folds the mesh over itself and makes the paint order meaningless),
   * or a caller-supplied vertical domain whose low end is not below its high end.
   */
  'GEOMETRY_AXIS_DEGENERATE',
  /**
   * The requested view collapses a dimension: elevation 90° is the plan view (the third
   * axis carries nothing, which is the flat chart this module exists to replace), elevation
   * 0° flattens both plan axes onto one screen line, and an azimuth on a right angle maps
   * one plan axis to a constant screen x. Any of them draws a picture that looks like a
   * surface and is not one.
   */
  'GEOMETRY_PROJECTION_DEGENERATE',
  /** No environment label. A figure from a database that will not say which one. */
  'GEOMETRY_ENVIRONMENT_NOT_STATED',
  /** No `observedAt`. A dated figure with no date is a screenshot — plan §6.1 verbatim. */
  'GEOMETRY_OBSERVATION_NOT_DATED',
] as const;
export type GeometryRefusalCode = typeof GEOMETRY_REFUSAL_CODES[number];

export function isGeometryRefusalCode(v: unknown): v is GeometryRefusalCode {
  return typeof v === 'string' && (GEOMETRY_REFUSAL_CODES as readonly string[]).includes(v);
}

/**
 * The rule a refusal applies. `instrument` is the house doctrine, not a regulation — these
 * refusals are about drawing, and dressing them as MiCA provisions would devalue the
 * citations that really are MiCA provisions. Same reasoning, same shape as
 * `marks/mark.ts:299`.
 */
export interface GeometryRuleCitation {
  readonly instrument: 'LCX_HOUSE_DOCTRINE';
  readonly provision: string;
  readonly text: string;
}

const RULE_ABSENT_REFUSES: GeometryRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list '
    + 'that reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
};

const RULE_THREE_STATES: GeometryRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'three states are never collapsed',
  text: 'Three states are never collapsed: not-loaded / present-but-withheld / genuinely-empty.',
};

const RULE_NO_LAUNDERING: GeometryRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'an inference is never laundered into a certainty',
  text: 'An inference is never laundered into a certainty. If you cannot know, say you cannot know.',
};

const RULE_ENVIRONMENT_LABEL: GeometryRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'every figure from a database carries an ObservationFrame and an environment label',
  text: 'Every figure carries an ObservationFrame and an environment label where it came from a database.',
};

const RULE_PLACEHOLDERS_LOOK_LIKE_PLACEHOLDERS: GeometryRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'a projection is a choice, not a fact',
  text: 'Placeholders must look like placeholders, and a view must name itself. A picture that '
    + 'does not state its projection is read as the data rather than as one view of it.',
};

export interface GeometryRefusal {
  readonly code: GeometryRefusalCode;
  /** One sentence, to the operator, active voice. Names the cell or axis where there is one. */
  readonly sentence: string;
  readonly rule: GeometryRuleCitation;
  /** `[col, row]` of the offending cell, where the refusal is about one. */
  readonly cell: readonly [number, number] | null;
  /** `null` only where the refusal is not about a database read at all. */
  readonly environment: string | null;
}

/**
 * The stated policy, exported so the renderer can print it under the surface rather than
 * the reader having to trust that it holds. Every word of it is enforced by
 * `buildSurfaceMesh` requiring four observed corners per quad.
 */
export const INTERPOLATION_POLICY =
  'No interpolation. A cell is drawn only where all four of its corners were observed; '
  + 'a missing corner leaves a hole and is never smoothed over from its neighbours.';

/**
 * Bumped when the refusal set or the projection maths changes. Stamped onto the frame.
 *
 * 2 — `GEOMETRY_ALL_CELLS_WITHHELD` added; `zDomain` endpoints now checked for finiteness and
 * ordering; grid-axis coordinates now checked for finiteness and strict ascent; grid ticks
 * moved onto the view's NEAR floor edges; `flat` computed from observed values only.
 *
 * 3 — THE NOTICES STOPPED COLLAPSING THE STATES THEY REPORT, AND THE COUNTS STOPPED LYING.
 * `HOLES_PRESENT` and `CELLS_WITHHELD` now partition on the ACTUAL corner states rather than on
 * withheld-ness alone, so a cell holding a never-measured corner AND a withheld one counts under
 * BOTH — the two counts overlap and the sentences say so. `OBSERVED_RANGE_OUTSIDE_DOMAIN` counts
 * on CORNERS instead of the cell mean (a cell straddling the box while averaging inside it was
 * reported as compliant) and quotes the extreme excursion. `SurfaceQuad` gained `outsideDomain`
 * and `shadeClamped`, so clamped ink is distinguishable from real ceiling ink. Grid tick labels
 * are anchored at `min(zLo, observedLo)` so the label plane is never above the lowest drawn
 * vertex, which under a caller-supplied `zDomain` the data escapes it could be. And
 * `xTickOutward`/`yTickOutward` are new: WHICH WAY IS OUT is a projection fact, and the renderer
 * was guessing it with a hard-coded leftward push that is inward at azimuths 91–98 and 271.
 */
export const GEOMETRY_RULESET_VERSION = 3;

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE PROJECTION                                                                  */
/* ══════════════════════════════════════════════════════════════════════════════ */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ProjectedPoint {
  readonly sx: number;
  readonly sy: number;
  /**
   * Distance along the view direction, larger = NEARER THE CAMERA. Exposed so a test can
   * assert paint order by comparing depths instead of by looking at the picture, which is
   * the only way an ordering bug gets caught before an operator sees it.
   */
  readonly depth: number;
}

export interface ViewParams {
  /** Rotation about the vertical axis, degrees. Must not sit on a right angle. */
  readonly azimuthDeg: number;
  /** Angle above the horizon, degrees. Must be strictly inside (0, 90). */
  readonly elevationDeg: number;
  /** Projection units per unit of box space. Uniform — this is an ORTHOGRAPHIC view. */
  readonly scale: number;
}

/**
 * The classic isometric pair. 35.264° is `atan(1/√2)` in degrees: the elevation at which
 * the three box axes project to equal lengths. Named rather than inlined because a reader
 * who sees `35.264` in a component has no way to know it is a definition and not a taste.
 */
export const ISOMETRIC_ELEVATION_DEG = (Math.atan(1 / Math.SQRT2) * 180) / Math.PI;

export const DEFAULT_VIEW: ViewParams = {
  azimuthDeg: 45,
  elevationDeg: ISOMETRIC_ELEVATION_DEG,
  scale: 1,
};

const RAD = Math.PI / 180;

/**
 * Axonometric (orthographic, no perspective) projection of a world point.
 *
 * World frame: x and y span the plan, z is up. Camera sits on the unit vector
 * `c = (cos el cos az, cos el sin az, sin el)` looking at the origin, with the horizontal
 * right vector `r = (-sin az, cos az, 0)` and up `u = c × r`. Screen x is `p · r`, screen y
 * is `-(p · u)` because SVG's y grows DOWNWARD, and depth is `p · c`.
 *
 * No perspective is deliberate: under perspective, two equal margins at different corners
 * of the grid project to different heights, so the picture would encode the camera as well
 * as the data and a reader could no longer compare two cells by eye.
 */
export function project(p: Vec3, view: ViewParams = DEFAULT_VIEW): ProjectedPoint {
  const az = view.azimuthDeg * RAD;
  const el = view.elevationDeg * RAD;
  const sinAz = Math.sin(az);
  const cosAz = Math.cos(az);
  const sinEl = Math.sin(el);
  const cosEl = Math.cos(el);
  return {
    sx: (-p.x * sinAz + p.y * cosAz) * view.scale,
    sy: (p.x * sinEl * cosAz + p.y * sinEl * sinAz - p.z * cosEl) * view.scale,
    depth: p.x * cosEl * cosAz + p.y * cosEl * sinAz + p.z * sinEl,
  };
}

/**
 * THE PAINT-ORDER KEY, AND THE ONE GENUINELY HARD PART OF THIS FILE.
 *
 * Painter's algorithm on a height field: draw far cells first, near cells last. The key is
 * the depth of the cell's FOOTPRINT — its (x, y) centroid with z EXCLUDED — and excluding z
 * is not an approximation, it is the correctness condition.
 *
 * WHY z MUST BE EXCLUDED. In an orthographic view a ray into the scene moves monotonically
 * toward smaller `x·cos el·cos az + y·cos el·sin az` (the plan part of the depth) while
 * descending in z. So of any two surface points that overlap on screen, the one whose
 * FOOTPRINT depth is larger is the nearer one — regardless of how tall either is. Sorting
 * by full 3-D depth instead is the classic bug: a tall peak at the BACK of the grid earns a
 * large `z·sin el` term, sorts as though it were at the front, and paints straight over the
 * ridge that stands in front of it. The picture then looks inside-out in exactly the region
 * an operator is reading, and nothing about it looks broken enough to distrust.
 *
 * TIES, AND WHAT ACTUALLY DECIDES THEM. Equidistant cells are NOT a rarity reserved for
 * pathological azimuths. At the shipped DEFAULT_VIEW azimuth of 45° the anti-diagonal cells
 * are exactly equidistant IN EXACT ARITHMETIC — `cx·cos az + cy·sin az` is symmetric there —
 * and the order the sort actually produces between them is decided by the ~1e-16 difference
 * between `Math.cos(π/4)` and `Math.sin(π/4)`, not by the stable sort keeping grid order.
 * That is legitimate rather than lucky, and the reason is geometric, not numerical: two cells
 * equidistant in plan are displaced purely along the SCREEN-X direction (plan depth and screen
 * x are perpendicular in plan), so on an evenly spaced grid their screen extents meet along a
 * line and share no area — measured at the default view, the tied pair covers sx −70.711…0 and
 * 0…70.711 — and neither can occlude the other whichever is painted first. The limit of that
 * argument is stated rather than hidden: on an UNEVENLY spaced grid two exactly-equidistant
 * cells could in principle overlap in area, and then the order between them is arbitrary,
 * because this module splits no cells (no BSP — see the module docblock's stated limits).
 * What `Array.prototype.sort` being stable per spec
 * (ES2019) buys is only determinism where two keys are bit-identical — reproducibility, not
 * correctness. `geometry.test.ts` therefore asserts the emitted order against an
 * INDEPENDENTLY RE-DERIVED stable sort of the same key rather than against a hand-written
 * expectation, and asserts the far-vs-near inversion under a TALL box, because at the default
 * box height a full-3-D sort key produces the same order and a spike test proves nothing.
 */
export function footprintDepth(x: number, y: number, view: ViewParams = DEFAULT_VIEW): number {
  const az = view.azimuthDeg * RAD;
  const el = view.elevationDeg * RAD;
  return x * Math.cos(el) * Math.cos(az) + y * Math.cos(el) * Math.sin(az);
}

/** True when the view collapses a dimension. See `GEOMETRY_PROJECTION_DEGENERATE`. */
export function isDegenerateView(view: ViewParams): boolean {
  if (!Number.isFinite(view.azimuthDeg) || !Number.isFinite(view.elevationDeg)) return true;
  if (!Number.isFinite(view.scale) || view.scale <= 0) return true;
  const el = ((view.elevationDeg % 360) + 360) % 360;
  if (el <= 0 || el >= 90) return true;
  // An azimuth on a right angle maps one plan axis to a constant screen x.
  const az = ((view.azimuthDeg % 90) + 90) % 90;
  return az < 1e-9 || Math.abs(az - 90) < 1e-9;
}

/** The sentence the renderer prints on the figure. A view that will not name itself is a lie. */
export function describeProjection(view: ViewParams, box: BoxSpec): string {
  const az = round(view.azimuthDeg, 1);
  const el = round(view.elevationDeg, 1);
  const zRatio = round(box.height / box.width, 2);
  return `Axonometric projection, orthographic (no perspective): azimuth ${az}°, elevation ${el}°. `
    + `Vertical axis drawn at ${zRatio}× the plan width — a CHOICE of exaggeration, not a property `
    + `of the data. One view of two; ask for another azimuth to see the far face.`;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE INPUT                                                                       */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** A tick on a grid axis: the world coordinate and the words that go beside it. */
export interface AxisTickSpec {
  readonly value: number;
  readonly label: string;
}

/** One of the two independent variables. Its ticks ARE the grid coordinates. */
export interface GridAxisSpec {
  readonly label: string;
  /** e.g. `'USD'`, `'hours'`, `'days stale'`. Shown; never guessed. */
  readonly unit: string;
  /** Ascending. One entry per grid coordinate along this axis. */
  readonly ticks: readonly AxisTickSpec[];
}

/** The dependent variable. Tick VALUES are derived from the observed domain, not supplied. */
export interface ValueAxisSpec {
  readonly label: string;
  readonly unit: string;
  /** Target tick count; the real count lands on a round step. Default 4. */
  readonly tickCount?: number;
  /**
   * How a tick value reads on the axis. Supplied by whoever owns the units — cents want
   * `'$12,000'`, a probability wants `'62%'` — so the renderer never has to know what the
   * numbers mean, which is the same reason it is handed coordinates rather than data.
   * Default is the raw number.
   */
  readonly formatTick?: (v: number) => string;
}

/** The box in projection space the data range is mapped onto before projecting. */
export interface BoxSpec {
  /** Along the x (first independent variable) axis. */
  readonly width: number;
  /** Along the y (second independent variable) axis. */
  readonly depth: number;
  /** Along z. The exaggeration knob, and named as one by `describeProjection`. */
  readonly height: number;
}

export const DEFAULT_BOX: BoxSpec = { width: 100, depth: 100, height: 62 };

/* ══════════════════════════════════════════════════════════════════════════════ */
/* LABEL METRICS — the one place this pure module assumes something about drawing  */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * The font size the renderer draws tick labels at, in the same user units as every
 * coordinate here. This module cannot MEASURE text — it has no DOM and draws nothing — so
 * the viewBox reserves room using the size the renderer is known to use.
 *
 * `apps/web/src/components/geometry/__tests__/surfacePlot.test.tsx` asserts `SurfacePlot`
 * renders tick text at exactly this size. If someone changes the renderer's `fontSize` and
 * not this constant, that test fails — which matters because the failure mode of a silent
 * drift is labels clipped by the viewBox again, with every other test still green.
 */
export const LABEL_FONT_SIZE = 4;

/**
 * Mean glyph advance as a fraction of font size, for the UI's sans stack.
 *
 * Deliberately generous (a proportional sans averages nearer 0.5 for mixed case; digits and
 * `$`/`,` in a money label run wider). Over-reserving costs a slightly smaller figure;
 * under-reserving costs a clipped label, and only one of those is a legibility failure.
 */
export const LABEL_ADVANCE_EM = 0.62;

/** Gap between a tick's anchor point and the near edge of its text box. */
export const LABEL_GAP = 2;

/** Every extent finite and positive. A zero extent projects the whole grid onto one place. */
export function isUsableBox(box: BoxSpec): boolean {
  return [box.width, box.depth, box.height].every((v) => Number.isFinite(v) && v > 0);
}

/** What the caller must say about where the numbers came from. Every field is required. */
export interface SurfaceFrameInput {
  /** Which database. Empty refuses (`GEOMETRY_ENVIRONMENT_NOT_STATED`). */
  readonly environment: string;
  /** When the grid was observed. Empty refuses (`GEOMETRY_OBSERVATION_NOT_DATED`). */
  readonly observedAt: string;
  /** The window the observation covers. `null` where the figure is a snapshot, not a window. */
  readonly windowFrom: string | null;
  readonly windowTo: string | null;
  /** The engine or table the z values came from, e.g. `'gps/underwrite.ts marginDistribution'`. */
  readonly source: string;
  /**
   * Set where the z values are placeholders rather than measurements — GPS price bands and
   * effort triples both are today (`gps/catalogue.ts:58`, `gps/underwrite.ts:126`). Carried
   * onto the frame so the renderer can make the surface LOOK like a placeholder.
   */
  readonly valuesArePlaceholders?: boolean;
}

/**
 * PRESENT BUT WITHHELD — the third of the house's three states, at cell level.
 *
 * A caller who HAS a height but may not put it on this figure (need-to-know, an unreleased
 * quarter, a counterparty who has not consented) writes `WITHHELD`, not `null`. The two are
 * kept apart everywhere downstream: they count separately on the frame, they list separately
 * on a hole, and an all-withheld grid refuses under its own code. Writing `null` for a
 * withheld height would tell the reader nobody measured a cell that was measured and then
 * classified, which is the collapse the doctrine forbids.
 */
export const WITHHELD = 'withheld';

/** One grid cell as supplied: observed / genuinely-not-measured / present-but-withheld. */
export type GridCellValue = number | null | typeof WITHHELD;

export interface SurfaceGridInput {
  /**
   * Row-major z values: `rows[j][i]` is z at `(xAxis.ticks[i].value, yAxis.ticks[j].value)`.
   * A number is an observation, `null` is a genuine absence (never measured), and `WITHHELD`
   * is present-but-withheld. `rows` itself being `null` is not-loaded — a fourth state, about
   * the READ rather than about a cell, with its own code.
   */
  readonly rows: readonly (readonly GridCellValue[])[] | null;
  readonly xAxis: GridAxisSpec;
  readonly yAxis: GridAxisSpec;
  readonly zAxis: ValueAxisSpec;
  readonly frame: SurfaceFrameInput;
  readonly view?: ViewParams;
  readonly box?: BoxSpec;
  /**
   * Force the vertical domain, e.g. to hold two surfaces comparable. Omitted, it is taken
   * from the OBSERVED values only — never padded to zero, because padding to zero puts a
   * "we broke even" line on a chart where nothing broke even.
   *
   * SUPPLIED, IT IS AN INPUT AND IT IS CHECKED. Both endpoints must be finite
   * (`GEOMETRY_Z_NOT_FINITE`) and `lo` must be strictly below `hi`
   * (`GEOMETRY_AXIS_DEGENERATE`). A caller computing a shared domain with
   * `Math.min(...[])`/`Math.max(...[])` over an empty surface gets `[Infinity, -Infinity]`,
   * which is exactly the input that used to draw a fully-labelled figure with `NaN` on every
   * vertex. It never makes a claim about the DATA either: `flat` and `SURFACE_IS_FLAT` come
   * from the observed values, so `[5, 5]` cannot make a figure say every margin is 5.
   */
  readonly zDomain?: readonly [number, number];
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE OUTPUT                                                                      */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** A drawable cell: four observed corners. */
export interface SurfaceQuad {
  readonly kind: 'quad';
  /** Grid indices of the cell's low corner. */
  readonly col: number;
  readonly row: number;
  readonly corners: readonly [ProjectedPoint, ProjectedPoint, ProjectedPoint, ProjectedPoint];
  /** Footprint depth of the centroid. The sort key. See `footprintDepth`. */
  readonly paintDepth: number;
  /** Mean of the four OBSERVED corner z values. Not a smoothed estimate of anything. */
  readonly zMean: number;
  readonly zMin: number;
  readonly zMax: number;
  /** `zMean` normalised into `zDomain`, clamped to [0,1]. `0.5` on a flat surface. */
  readonly shade: number;
  /**
   * At least one CORNER of this cell is outside the drawn vertical domain, so the cell is
   * physically drawn through a face of the box. Per-corner because the GEOMETRY is per-corner
   * and deliberately unclamped: a cell whose corners straddle the box while AVERAGING inside it
   * punches through both faces, and anything computed from `zMean` calls it compliant.
   */
  readonly outsideDomain: boolean;
  /**
   * `shade` WAS CLAMPED, so for this cell the ink no longer encodes the height — the cell mean
   * itself fell outside the drawn domain and the normalised value was pulled back to 0 or 1.
   *
   * A SEPARATE FLAG FROM `outsideDomain`, because they are separate facts: a cell can be drawn
   * through both faces of the box while its mean sits comfortably inside it, in which case the
   * shade is a faithful encoding of the mean and a false impression of the corners. Implication
   * runs one way only — a clamped shade always means the cell is outside the domain.
   *
   * WHY THE CLAMP STAYS. Unclamping would not fix anything: `shade` becomes a fill opacity, and
   * an opacity of 372 (which is what a cell 6,000 units above a 10-unit box produces) is clamped
   * by the renderer anyway — the clamp would merely move somewhere undocumented. So the clamp is
   * kept and LABELLED, and the renderer marks the cell rather than pretending its ink is honest.
   */
  readonly shadeClamped: boolean;
}

/**
 * A cell that cannot be drawn. Emitted, positioned and paint-ordered exactly like a quad so
 * the renderer draws a visible gap in the sheet — the whole point being that a reader sees
 * the absence rather than a surface that quietly closed over it.
 */
export interface SurfaceHole {
  readonly kind: 'hole';
  readonly col: number;
  readonly row: number;
  /**
   * The cell's footprint, projected at the low end of the vertical domain — the BASE of the
   * box. No z is invented for it. One exception, and it is a consequence rather than a
   * choice: where the domain has no extent at all (every observed height identical, no
   * override) `bz` maps every z to the middle of the box, so the footprint is coplanar with
   * the flat sheet instead of below it. Nothing is fabricated either way; the outline is
   * simply level with the sheet rather than under it.
   */
  readonly footprint: readonly [ProjectedPoint, ProjectedPoint, ProjectedPoint, ProjectedPoint];
  readonly paintDepth: number;
  /** `[col, row]` of each corner that was never measured. Named, not counted. */
  readonly absentCorners: readonly (readonly [number, number])[];
  /**
   * `[col, row]` of each corner that WAS measured and is withheld. A separate list from
   * `absentCorners` because they are separate states — see `WITHHELD`.
   */
  readonly withheldCorners: readonly (readonly [number, number])[];
}

export type SurfaceCell = SurfaceQuad | SurfaceHole;

export interface ProjectedTick {
  readonly value: number;
  readonly label: string;
  /** Where the tick sits, projected. The renderer places text here and computes nothing. */
  readonly at: ProjectedPoint;
}

/** A finding that does not stop the drawing but must appear beside it. */
export interface SurfaceNotice {
  readonly code:
    | 'HOLES_PRESENT'
    | 'CELLS_WITHHELD'
    | 'SURFACE_IS_FLAT'
    | 'Z_DOMAIN_OVERRIDDEN'
    | 'OBSERVED_RANGE_OUTSIDE_DOMAIN'
    | 'VALUES_ARE_PLACEHOLDERS'
    | 'Z_DOMAIN_EXCLUDES_ZERO';
  readonly sentence: string;
}

export interface SurfaceObservationFrame {
  readonly environment: string;
  readonly observedAt: string;
  readonly windowFrom: string | null;
  readonly windowTo: string | null;
  readonly source: string;
  readonly xLabel: string;
  readonly xUnit: string;
  readonly yLabel: string;
  readonly yUnit: string;
  readonly zLabel: string;
  readonly zUnit: string;
  /** Grid cells in the mesh: `(xTicks-1) × (yTicks-1)`. */
  readonly cellsTotal: number;
  /** Cells with all four corners observed. The n the surface is over. */
  readonly cellsDrawn: number;
  /** Cells left as holes. Shown on the figure, never subtracted silently. */
  readonly cellsHoles: number;
  /**
   * Grid POINTS by state — a different count from cells, and all three are reported. Absent
   * and withheld are never added together: one is a gap in the measurement, the other is a
   * gap in what may be shown, and an operator does something different about each.
   */
  readonly pointsObserved: number;
  readonly pointsAbsent: number;
  readonly pointsWithheld: number;
  readonly interpolation: typeof INTERPOLATION_POLICY;
  readonly valuesArePlaceholders: boolean;
  readonly ruleSetVersion: number;
}

export interface SurfaceGeometry {
  readonly kind: 'projected';
  readonly view: ViewParams;
  readonly box: BoxSpec;
  /** The sentence naming the projection. Print it; do not paraphrase it. */
  readonly projectionLabel: string;
  readonly viewBox: { readonly minX: number; readonly minY: number; readonly width: number; readonly height: number };
  /** Quads AND holes, BACK-TO-FRONT. Paint in array order. */
  readonly cells: readonly SurfaceCell[];
  readonly quads: readonly SurfaceQuad[];
  readonly holes: readonly SurfaceHole[];
  readonly xTicks: readonly ProjectedTick[];
  readonly yTicks: readonly ProjectedTick[];
  readonly zTicks: readonly ProjectedTick[];
  /**
   * WHICH WAY IS *OUT* ON SCREEN, for the plan tick text. A unit vector in screen space pointing
   * from the far plan edge to the NEAR one the ticks were anchored on.
   *
   * This exists because "outward" is a fact about the PROJECTION and a renderer offsetting its
   * text by a hard-coded `dx` is only outward at some azimuths. The engine chooses the near edge
   * from the view (see `xTickY`/`yTickX`); at azimuths where that choice flips, a fixed leftward
   * offset points INTO the figure and the label lands on the sheet — measured, at azimuths 91–98
   * and 271, with the engine's own anchors all correctly clear of every quad. The renderer scales
   * these by its text offset and takes its text anchor from the sign; it invents no direction.
   */
  readonly xTickOutward: { readonly dx: number; readonly dy: number };
  readonly yTickOutward: { readonly dx: number; readonly dy: number };
  /** The base rectangle, projected: 4 corners, drawn first. */
  readonly floor: readonly [ProjectedPoint, ProjectedPoint, ProjectedPoint, ProjectedPoint];
  /** The vertical axis, from the box base to its top at the far corner. */
  readonly zAxis: readonly [ProjectedPoint, ProjectedPoint];
  /** The observed (or overridden) vertical domain, in z units. */
  readonly zDomain: readonly [number, number];
  /**
   * The z=0 plane, projected, or `null` when the domain does not span zero. A margin surface
   * needs it: the reader's first question is which cells are below the line.
   */
  readonly zeroPlane: readonly [ProjectedPoint, ProjectedPoint, ProjectedPoint, ProjectedPoint] | null;
  /**
   * Every OBSERVED value is the same. A real measurement, drawn flat, said out loud. Never
   * derived from `zDomain`: a caller-supplied `[x, x]` is a statement about the AXIS, and
   * reporting it as `flat` would put a measurement nobody took on the figure.
   */
  readonly flat: boolean;
  /** The observed range, always, even where `zDomain` overrode the drawn domain. */
  readonly observedDomain: readonly [number, number];
  readonly frame: SurfaceObservationFrame;
  readonly notices: readonly SurfaceNotice[];
}

export type SurfaceOutcome =
  | SurfaceGeometry
  | { readonly kind: 'refused'; readonly refusals: readonly GeometryRefusal[] };

export function isProjectedSurface(o: SurfaceOutcome): o is SurfaceGeometry {
  return o.kind === 'projected';
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* TICKS                                                                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Round to `dp` places, and DO NOTHING where scaling by `10^dp` would destroy the value.
 *
 * `Math.round(v * 1e9) / 1e9` lies at both ends of the double range: at 5e307 the product
 * overflows to Infinity and the "rounded" value comes back as Infinity, and at 1e-320 the
 * product underflows to 0 so three distinct subnormals round onto the same tick. Both were
 * live: `valueAxisTicks(-500, 1e308, 4)` returned `[-0, Infinity, Infinity]` and put the
 * literal text "Infinity" on an axis. Returning `v` untouched is correct in both cases — a
 * value that cannot survive the scaling is already at full precision for its magnitude.
 */
function round(v: number, dp: number): number {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** dp;
  const scaled = v * f;
  if (!Number.isFinite(scaled)) return v;
  if (scaled === 0 && v !== 0) return v;
  return Math.round(scaled) / f;
}

/** `-0` prints as "-0" and compares equal to `0`. An axis tick at zero is `0`. */
function unsignZero(v: number): number {
  return v === 0 ? 0 : v;
}

/**
 * Ticks on a round 1/2/5×10^k step covering `[min, max]`, and unlike the 2-D kit's
 * `niceTicks` this one does NOT assume the domain starts at zero. Margin goes negative, and
 * a vertical axis that silently began at 0 would hide every cell delivered at a loss —
 * which is the only part of a margin surface anybody urgently needs to see.
 */
export function valueAxisTicks(min: number, max: number, count = 4): readonly number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [unsignZero(min)];
  // An inverted domain has no axis. `buildSurfaceMesh` refuses one before it gets here; this
  // guard is for direct callers, and it returns [] rather than looping on a negative step.
  if (min > max) return [];
  const rawStep = (max - min) / Math.max(1, count);
  const exp = Math.floor(Math.log10(rawStep));
  if (!Number.isFinite(exp)) return [];

  /*
   * PICK THE STEP BY HOW MANY TICKS IT ACTUALLY PRODUCES, not by rounding the raw step up.
   *
   * This was `f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10`, which always rounds UP. On the live
   * GPS margin surface the domain is -34..48 % and the target is 4 ticks, so the raw step is
   * 20.5 and `f` is 2.05 — a hair over 2, rounded to 5, making the step 50. The only multiple
   * of 50 between -34 and 48 is zero, so THE WHOLE VERTICAL AXIS CARRIED ONE TICK: a surface
   * spanning 82 points of margin, drawn against a scale that says only "0%".
   *
   * Found by rendering the figure and looking at it. Every geometry test passed — they assert
   * that ticks are ascending, distinct and inside the domain, and a single tick satisfies all
   * three. "Ascending and distinct" is not the same claim as "you can read a height off this".
   *
   * Choosing among the 1/2/5/10 candidates by resulting COUNT is what the function's own
   * comment already promised ("a real axis wants ~4 ticks"). Ties go to the DENSER axis: a
   * reader can ignore a tick they do not need and cannot recover one that was never drawn.
   */
  const countFor = (s: number): number => {
    if (!Number.isFinite(s) || s <= 0) return 0;
    const first = Math.ceil(min / s - 1e-9) * s;
    if (!Number.isFinite(first)) return 0;
    return Math.max(0, Math.floor((max - first) / s + 1e-9) + 1);
  };

  let step = 0;
  let best = Infinity;
  for (const nf of [1, 2, 5, 10] as const) {
    const cand = nf * 10 ** exp;
    const n = countFor(cand);
    // An axis with fewer than two ticks states no scale at all; never prefer one.
    if (n < 2) continue;
    const err = Math.abs(n - count);
    if (err < best || (err === best && cand < step)) {
      best = err;
      step = cand;
    }
  }
  // Every candidate produced under two ticks — a domain too narrow for a round step to land
  // in twice. Fall back to the raw step so the axis still carries a scale.
  if (step <= 0) step = rawStep;
  if (!Number.isFinite(step) || step <= 0) return [];
  const first = Math.ceil(min / step - 1e-9) * step;
  if (!Number.isFinite(first)) return [];
  // DE-DUPLICATED, because two ticks at one value are two labels on one point — and the
  // module's own assertion that no two ticks on an axis coincide would have caught it only on
  // a subnormal domain, where `round` used to collapse distinct steps onto 0.
  const seen = new Set<number>();
  const out: number[] = [];
  // The 4096 cap is not a tuning knob: it stops a step that is tiny relative to the domain
  // (a float artefact, not a legitimate axis) from spinning here. A real axis wants ~4 ticks.
  for (let t = first, n = 0; t <= max + step * 1e-9 && n < 4096; t += step, n++) {
    const v = unsignZero(round(t, 9));
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE MESH                                                                        */
/* ══════════════════════════════════════════════════════════════════════════════ */

function refuse(
  code: GeometryRefusalCode,
  sentence: string,
  rule: GeometryRuleCitation,
  cell: readonly [number, number] | null,
  environment: string | null,
): GeometryRefusal {
  return { code, sentence, rule, cell, environment };
}

/** Maps a data coordinate onto `[0, span]` in box space. Degenerate ranges are pre-refused. */
function mapTo(value: number, lo: number, hi: number, span: number): number {
  return hi === lo ? span / 2 : ((value - lo) / (hi - lo)) * span;
}

/**
 * The whole capability: a 2-D grid of possibly-absent z values in, projected polygons in
 * correct back-to-front paint order out, or EVERY refusal that applies.
 *
 * Returns every refusal rather than the first found — the house pattern
 * (`routes/marketingDesk.ts:1207-1214`). An operator whose grid is both ragged and undated
 * should learn both facts from one call, because fixing one and re-running to discover the
 * other is how a wave gets spent.
 */
export function buildSurfaceMesh(input: SurfaceGridInput): SurfaceOutcome {
  const view = input.view ?? DEFAULT_VIEW;
  const box = input.box ?? DEFAULT_BOX;
  const env = input.frame.environment.trim();
  const refusals: GeometryRefusal[] = [];

  /* ── Checks that do not need the grid at all, so they always run ───────────── */
  if (env.length === 0) {
    refusals.push(refuse(
      'GEOMETRY_ENVIRONMENT_NOT_STATED',
      'This surface will not draw: the caller did not say which database the heights came from, '
      + 'and a picture without an environment label is read as being about production.',
      RULE_ENVIRONMENT_LABEL,
      null,
      null,
    ));
  }
  if (input.frame.observedAt.trim().length === 0) {
    refusals.push(refuse(
      'GEOMETRY_OBSERVATION_NOT_DATED',
      'This surface will not draw: no observation date was supplied, and an undated figure is a '
      + 'screenshot that will be lying within a month.',
      RULE_ENVIRONMENT_LABEL,
      null,
      env || null,
    ));
  }
  if (isDegenerateView(view)) {
    refusals.push(refuse(
      'GEOMETRY_PROJECTION_DEGENERATE',
      `This surface will not draw at azimuth ${view.azimuthDeg}° / elevation ${view.elevationDeg}°: `
      + 'that view collapses a dimension, so the picture would look like a surface while carrying '
      + 'the information of a flat chart.',
      RULE_PLACEHOLDERS_LOOK_LIKE_PLACEHOLDERS,
      null,
      env || null,
    ));
  } else if (!isUsableBox(box)) {
    // Same code, because the failure is the same one: a box with a zero or non-finite extent
    // projects every cell onto the same place, and `describeProjection` would divide by it.
    refusals.push(refuse(
      'GEOMETRY_PROJECTION_DEGENERATE',
      `The projection box is ${box.width}×${box.depth}×${box.height}. Every extent must be a finite `
      + 'positive number or the cells project on top of one another.',
      RULE_PLACEHOLDERS_LOOK_LIKE_PLACEHOLDERS,
      null,
      env || null,
    ));
  }
  const xs = input.xAxis.ticks;
  const ys = input.yAxis.ticks;
  if (xs.length < 2) {
    refusals.push(refuse(
      'GEOMETRY_AXIS_DEGENERATE',
      `The ${input.xAxis.label} axis has ${xs.length} coordinate${xs.length === 1 ? '' : 's'}. `
      + 'A surface needs at least two on each axis — one is a line, and a line drawn in three '
      + 'dimensions still only carries what a line carries.',
      RULE_NO_LAUNDERING,
      null,
      env || null,
    ));
  }
  if (ys.length < 2) {
    refusals.push(refuse(
      'GEOMETRY_AXIS_DEGENERATE',
      `The ${input.yAxis.label} axis has ${ys.length} coordinate${ys.length === 1 ? '' : 's'}. `
      + 'A surface needs at least two on each axis.',
      RULE_NO_LAUNDERING,
      null,
      env || null,
    ));
  }

  /*
   * AXIS COORDINATE VALUES. The type says "Ascending" and the docblock leans on it — the
   * paint order is exact only because the mesh is a single-valued height field over a
   * RECTILINEAR grid, and a repeated or out-of-order coordinate folds the sheet over itself
   * so that "which cell is in front" stops having an answer. A non-finite coordinate is worse
   * still: it drew a fully-labelled figure whose viewBox and every vertex were NaN. An
   * unchecked precondition on a doctrine module is a refusal that was written down instead of
   * written, so both are checked here.
   */
  const axisFault = (a: GridAxisSpec): string | null => {
    for (let i = 0; i < a.ticks.length; i++) {
      if (!Number.isFinite(a.ticks[i].value)) {
        return `coordinate ${i} ("${a.ticks[i].label}") is ${String(a.ticks[i].value)}, not a finite number`;
      }
    }
    for (let i = 1; i < a.ticks.length; i++) {
      if (a.ticks[i].value <= a.ticks[i - 1].value) {
        return `coordinate ${i} (${a.ticks[i].value}) does not exceed coordinate ${i - 1} `
          + `(${a.ticks[i - 1].value}), so the coordinates are not strictly ascending`;
      }
    }
    return null;
  };
  let axesUnusable = false;
  for (const a of [input.xAxis, input.yAxis]) {
    if (a.ticks.length < 2) continue; // already refused above; do not report the same axis twice
    const fault = axisFault(a);
    if (fault === null) continue;
    axesUnusable = true;
    refusals.push(refuse(
      'GEOMETRY_AXIS_DEGENERATE',
      `The ${a.label} axis cannot carry a mesh: ${fault}. A surface is a single-valued height `
      + 'field over a rectilinear grid, and that is the premise the exact paint order rests on — '
      + 'a folded or non-finite axis draws overlapping polygons in a meaningless order.',
      RULE_NO_LAUNDERING,
      null,
      env || null,
    ));
  }

  /*
   * THE CALLER-SUPPLIED VERTICAL DOMAIN, CHECKED LIKE THE VALUES IT REPLACES. Every
   * finiteness guard below applies to `rows`; without this block the identical NaN arriving
   * through `zDomain` drew a full figure with an environment label, a "4 of 4 cells observed"
   * caption and `points="0,NaN …"` on every polygon — one laundering path for exactly the
   * number the other path refuses.
   */
  let zDomainUnusable = false;
  if (input.zDomain) {
    const [dLo, dHi] = input.zDomain;
    if (!Number.isFinite(dLo) || !Number.isFinite(dHi)) {
      zDomainUnusable = true;
      refusals.push(refuse(
        'GEOMETRY_Z_NOT_FINITE',
        `The caller set the ${input.zAxis.label} domain to ${String(dLo)}–${String(dHi)}. That is a `
        + 'broken computation upstream, not a wide axis — a domain like this is what '
        + '`Math.min(...[])`/`Math.max(...[])` over an empty surface returns — and it is refused here '
        + 'rather than drawn as a figure whose every coordinate is NaN.',
        RULE_NO_LAUNDERING,
        null,
        env || null,
      ));
    } else if (dLo >= dHi) {
      zDomainUnusable = true;
      refusals.push(refuse(
        'GEOMETRY_AXIS_DEGENERATE',
        `The caller set the ${input.zAxis.label} domain to ${dLo}–${dHi}, which is `
        + `${dLo === dHi ? 'a single point' : 'inverted'}. `
        + (dLo === dHi
          ? 'A vertical axis with no extent shades every cell identically and would make the figure '
            + 'state a flatness that is a property of the axis, not of the data.'
          : 'An inverted domain draws the highest value as the deepest trough and leaves the axis with '
            + 'no ticks at all — a picture that is upside-down and unlabelled, not merely unusual.'),
        RULE_NO_LAUNDERING,
        null,
        env || null,
      ));
    }
  }

  /* ── THREE STATES, THREE CODES. Not-loaded and empty do not share a branch. ── */
  if (input.rows === null) {
    refusals.push(refuse(
      'GEOMETRY_GRID_NOT_LOADED',
      'The grid was never read, which is not the same as it being empty. Nothing is drawn and '
      + 'no cell count is reported, because zero cells observed would read as zero cells existing.',
      RULE_THREE_STATES,
      null,
      env || null,
    ));
    return { kind: 'refused', refusals };
  }
  const rows = input.rows;
  if (rows.length === 0 || rows.every((r) => r.length === 0)) {
    refusals.push(refuse(
      'GEOMETRY_GRID_EMPTY',
      'The grid was read and holds no cells. That is a genuine emptiness, not a failed read, '
      + 'and it is reported as such rather than drawn as a flat sheet at zero.',
      RULE_THREE_STATES,
      null,
      env || null,
    ));
    return { kind: 'refused', refusals };
  }
  const ragged = rows.length !== ys.length || rows.some((r) => r.length !== xs.length);
  if (ragged) {
    refusals.push(refuse(
      'GEOMETRY_GRID_RAGGED',
      `The grid is ${rows.length} row${rows.length === 1 ? '' : 's'} of `
      + `[${[...new Set(rows.map((r) => r.length))].join(', ')}] against a ${ys.length}×${xs.length} `
      + 'axis pair. No mesh exists over that, and padding the short rows would invent cells.',
      RULE_ABSENT_REFUSES,
      null,
      env || null,
    ));
    return { kind: 'refused', refusals };
  }

  /* ── Value checks. Four cell states, four outcomes, no shared branch. ───────── */
  let pointsObserved = 0;
  let pointsAbsent = 0;
  let pointsWithheld = 0;
  let pointsTotal = 0;
  const observed: number[] = [];
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      pointsTotal++;
      const z = rows[j][i];
      if (z === WITHHELD) {
        pointsWithheld++;
        continue;
      }
      if (z === null) {
        pointsAbsent++;
        continue;
      }
      if (!Number.isFinite(z)) {
        refusals.push(refuse(
          'GEOMETRY_Z_NOT_FINITE',
          `${input.zAxis.label} at (${input.xAxis.ticks[i].label}, ${input.yAxis.ticks[j].label}) is `
          + `${String(z)}. That is a broken computation upstream, not a missing measurement, and it is `
          + 'refused here rather than drawn as a hole where it would hide.',
          RULE_NO_LAUNDERING,
          [i, j],
          env || null,
        ));
        continue;
      }
      pointsObserved++;
      observed.push(z);
    }
  }
  if (pointsObserved === 0) {
    /*
     * NOT ONE HEIGHT WAS OBSERVED — but WHY decides the code, and a broken computation is not
     * an absence. On an all-NaN grid this used to raise `GEOMETRY_ALL_CELLS_ABSENT` alongside a
     * NaN code per cell and say "All 0 grid points are absent": a bug reported as a missing
     * measurement, with a count that was not the count being described. The NaN codes are
     * already on the refusal list and they are the whole story, so the absence codes stay silent.
     * Each count below is interpolated only from the counter that measures the thing named.
     */
    const anyNotFinite = refusals.some((r) => r.code === 'GEOMETRY_Z_NOT_FINITE');
    if (!anyNotFinite && pointsAbsent > 0) {
      refusals.push(refuse(
        'GEOMETRY_ALL_CELLS_ABSENT',
        `${pointsAbsent} of ${pointsTotal} grid points were never measured`
        + `${pointsWithheld > 0 ? ` and the other ${pointsWithheld} are present but withheld` : ''}, `
        + 'so not one height was observed. An empty box with axes on it reads as a measured flat '
        + 'surface, so nothing is drawn at all.',
        RULE_ABSENT_REFUSES,
        null,
        env || null,
      ));
    }
    if (!anyNotFinite && pointsWithheld > 0) {
      refusals.push(refuse(
        'GEOMETRY_ALL_CELLS_WITHHELD',
        `${pointsWithheld} of ${pointsTotal} grid points are present but WITHHELD`
        + `${pointsAbsent > 0 ? ` and the other ${pointsAbsent} were never measured` : ''}. `
        + 'These heights exist and are not shown here; that is a permission fact, not a measurement '
        + 'gap, and it refuses under its own code so nobody reads it as "nothing was measured".',
        RULE_THREE_STATES,
        null,
        env || null,
      ));
    }
    return { kind: 'refused', refusals };
  }
  if (xs.length < 2 || ys.length < 2 || axesUnusable || zDomainUnusable) {
    // Already refused above. The grid is indexable, but there is no honest mesh to build over a
    // folded axis or a broken vertical domain, and every applicable refusal is on the list.
    return { kind: 'refused', refusals };
  }

  /*
   * ── The vertical domain ─────────────────────────────────────────────────────
   *
   * `observedLo/observedHi` are facts about the data and are reported as such whatever the
   * caller does to the drawn domain. `flat` is derived from THEM and never from `zDomain`,
   * which is the difference between "the data does not vary" and "the axis has no extent" —
   * a `zDomain` of `[5, 5]` over values spanning −500…6000 used to make the figure state that
   * every observed margin was 5. (It now refuses upstream; `flat` is computed from the
   * observations regardless, because the derivation was the defect.)
   */
  // Folded rather than spread: `Math.min(...observed)` throws RangeError once a grid gets large
  // enough to exhaust the argument limit, and a crash is a worse answer than a number.
  let observedLo = observed[0];
  let observedHi = observed[0];
  for (const z of observed) {
    if (z < observedLo) observedLo = z;
    if (z > observedHi) observedHi = z;
  }
  const zLo = input.zDomain ? input.zDomain[0] : observedLo;
  const zHi = input.zDomain ? input.zDomain[1] : observedHi;
  const flat = observedHi === observedLo;
  // A separate predicate from `flat`, and about the AXIS: no extent to map heights into, which
  // can only happen now on a flat observed domain with no override (an override with no extent
  // is refused above). It governs the geometry; `flat` governs what the figure SAYS.
  const domainDegenerate = zHi === zLo;

  const xLo = xs[0].value;
  const xHi = xs[xs.length - 1].value;
  const yLo = ys[0].value;
  const yHi = ys[ys.length - 1].value;
  // No `xHi === xLo` check here: `axisFault` above requires strictly ascending coordinates, so
  // with two or more of them the extent is positive by construction. One check, one place.

  const bx = (v: number) => mapTo(v, xLo, xHi, box.width);
  const by = (v: number) => mapTo(v, yLo, yHi, box.depth);
  const bz = (v: number) => (domainDegenerate ? box.height / 2 : mapTo(v, zLo, zHi, box.height));

  const at = (i: number, j: number, z: number): ProjectedPoint =>
    project({ x: bx(xs[i].value), y: by(ys[j].value), z: bz(z) }, view);

  /* ── Cells. FOUR OBSERVED CORNERS OR A HOLE. There is no third branch. ─────── */
  const cells: SurfaceCell[] = [];
  const zSpanForShade = domainDegenerate ? 1 : zHi - zLo;
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const idx: readonly (readonly [number, number])[] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const zz = idx.map(([ci, cj]) => rows[cj][ci]);
      // Three states, three lists. `absentCorners` is "never measured", `withheldCorners` is
      // "measured and not shown"; a corner that is neither and still not a usable number cannot
      // occur here, because a non-finite z refused above and this code is unreachable then.
      const absentCorners = idx.filter((_, k) => zz[k] === null);
      const withheldCorners = idx.filter((_, k) => zz[k] === WITHHELD);
      const cx = (bx(xs[i].value) + bx(xs[i + 1].value)) / 2;
      const cy = (by(ys[j].value) + by(ys[j + 1].value)) / 2;
      const paintDepth = footprintDepth(cx, cy, view);

      if (absentCorners.length + withheldCorners.length > 0) {
        // A HOLE: the footprint at the BASE of the box (see `SurfaceHole.footprint` for the one
        // degenerate-domain consequence). No height is invented for it, and no neighbour is
        // consulted — that consultation is the interpolation the policy forbids.
        const base = zLo;
        cells.push({
          kind: 'hole',
          col: i,
          row: j,
          footprint: [
            project({ x: bx(xs[i].value), y: by(ys[j].value), z: bz(base) }, view),
            project({ x: bx(xs[i + 1].value), y: by(ys[j].value), z: bz(base) }, view),
            project({ x: bx(xs[i + 1].value), y: by(ys[j + 1].value), z: bz(base) }, view),
            project({ x: bx(xs[i].value), y: by(ys[j + 1].value), z: bz(base) }, view),
          ],
          paintDepth,
          absentCorners,
          withheldCorners,
        });
        continue;
      }

      const z4 = zz as readonly number[];
      const zMean = (z4[0] + z4[1] + z4[2] + z4[3]) / 4;
      const zMin = Math.min(...z4);
      const zMax = Math.max(...z4);
      // The raw normalised height is kept so the CLAMP is observable. `shade === rawShade` is the
      // whole definition of "this ink means what it looks like"; recomputing the comparison in the
      // renderer would need the domain, and the renderer computes nothing.
      const rawShade = domainDegenerate ? 0.5 : (zMean - zLo) / zSpanForShade;
      const shade = Math.min(1, Math.max(0, rawShade));
      cells.push({
        kind: 'quad',
        col: i,
        row: j,
        corners: [
          at(i, j, z4[0]),
          at(i + 1, j, z4[1]),
          at(i + 1, j + 1, z4[2]),
          at(i, j + 1, z4[3]),
        ],
        paintDepth,
        zMean,
        zMin,
        zMax,
        shade,
        outsideDomain: zMin < zLo || zMax > zHi,
        shadeClamped: shade !== rawShade,
      });
    }
  }

  // BACK TO FRONT. Ascending footprint depth: larger depth is nearer the camera, so it is
  // painted last. The sort is stable per spec, which makes bit-identical keys reproducible;
  // what makes the ORDER right is that the key excludes z (see `footprintDepth`).
  cells.sort((a, b) => a.paintDepth - b.paintDepth);

  const quads = cells.filter((c): c is SurfaceQuad => c.kind === 'quad');
  const holes = cells.filter((c): c is SurfaceHole => c.kind === 'hole');
  if (quads.length === 0) {
    refusals.push(refuse(
      'GEOMETRY_NO_COMPLETE_QUAD',
      `${pointsObserved} grid point${pointsObserved === 1 ? ' was' : 's were'} observed but no cell has `
      + 'all four corners, so every polygon would need a corner invented. The values are present; the '
      + 'holes are in the wrong places.',
      RULE_ABSENT_REFUSES,
      null,
      env || null,
    ));
  }
  if (refusals.length > 0) return { kind: 'refused', refusals };

  /* ── Axes ─────────────────────────────────────────────────────────────────── */
  /*
   * WHICH EDGE A GRID TICK SITS ON IS DECIDED HERE, FROM THE VIEW.
   *
   * It has to be, and it was not: the ticks were anchored unconditionally at `y = yLo` and
   * `x = xLo` with no reference to `view` at all, under a comment claiming the near edges were
   * used and that the choice depended on the azimuth. At the shipped DEFAULT_VIEW, (xLo, yLo)
   * is the FARTHEST floor corner — measured footprint depths of the four corners are 0, 57.74,
   * 115.47, 57.74 — so five of seven grid labels landed geometrically INSIDE a drawn quad,
   * marching diagonally out of the middle of the figure.
   *
   * A tick label must sit on the near edge, because the sheet rises from the floor toward the
   * viewer's up direction: at a plan point the sheet is at or above the floor on screen, so a
   * label offset outward from the NEAR floor edge is clear of every quad. Near is the larger
   * footprint depth. This is a projection fact, so the renderer is handed the answer.
   *
   * AND WHICH PLANE IT SITS ON IS DECIDED HERE TOO — `min(zLo, observedLo)`, NOT `zLo`.
   *
   * The paragraph above holds only while every drawn vertex is inside `[zLo, zHi]`, which is
   * true of an observed domain and NOT true of a caller-supplied one the data escapes. `mapTo`
   * returns a NEGATIVE box height for `z < zLo`, screen y grows downward, and the sheet then
   * descends BELOW the near floor edge and covers the label positions the renderer offsets
   * outward from it — so the plan tick labels read as annotations sitting ON the surface. The
   * label plane therefore drops to the lowest DRAWN height whenever that is below the box floor.
   *
   * WHY LOWER THE PLANE RATHER THAN REFUSE THE DOMAIN. Refusing is idiomatic here (this module
   * refuses degenerate and non-finite domains), but it would delete a capability the module
   * deliberately has: `OBSERVED_RANGE_OUTSIDE_DOMAIN` exists precisely so two surfaces can be
   * held on ONE comparable axis while one of them pokes out of it, with the disagreement between
   * the true height and the clamped ink said out loud. Refusing would make the honest,
   * annotated, out-of-box figure undrawable to protect a LABEL POSITION. And the z of a plan
   * tick is not a claim: the tick's VALUE is a price or an effort, and its z is only where the
   * text is put — moving it makes the figure state nothing new, whereas losing the labels under
   * the sheet destroys the axis. The box itself (floor, hole footprints, z axis) does NOT move:
   * those are box features and dropping them would misreport where the domain is.
   */
  const midX = box.width / 2;
  const midY = box.depth / 2;
  const xTickY = footprintDepth(midX, by(yLo), view) > footprintDepth(midX, by(yHi), view) ? yLo : yHi;
  const yTickX = footprintDepth(bx(xLo), midY, view) > footprintDepth(bx(xHi), midY, view) ? xLo : xHi;
  // Equal to `zLo` whenever the observations are inside the domain, which is every surface with
  // no override — so this changes no figure that was already correct.
  const tickPlaneZ = Math.min(zLo, observedLo);
  const xTicks: ProjectedTick[] = xs.map((t) => ({
    value: t.value,
    label: t.label,
    at: project({ x: bx(t.value), y: by(xTickY), z: bz(tickPlaneZ) }, view),
  }));
  const yTicks: ProjectedTick[] = ys.map((t) => ({
    value: t.value,
    label: t.label,
    at: project({ x: bx(yTickX), y: by(t.value), z: bz(tickPlaneZ) }, view),
  }));
  /*
   * AND WHICH WAY IS *OUT* — also a projection fact, and also not the renderer's to guess.
   *
   * Choosing the near edge is only half of "the label is clear of the sheet": the text is then
   * pushed off the edge, and the direction of that push has to be away from the figure. The
   * renderer pushed y-tick text LEFT unconditionally, which is outward only while the near x
   * edge is the left one. It is not, just past the right angles: sweeping every whole azimuth
   * with the module's own ray cast puts the rendered "40h"/"60h"/"80h" labels INSIDE a drawn quad
   * at 91–98 and 271, while these anchors — the engine's half — are clear at every one of them.
   * So the direction is measured here, from the far edge midpoint to the near edge midpoint, and
   * handed over as a unit screen vector.
   */
  const screenOutward = (near: ProjectedPoint, far: ProjectedPoint) => {
    const dx = near.sx - far.sx;
    const dy = near.sy - far.sy;
    const len = Math.hypot(dx, dy);
    // Unreachable on a drawable view — a degenerate azimuth is refused above and the two edge
    // midpoints then differ — but a zero vector would silently pull every label onto the anchor,
    // so it falls back to "down the screen", which is outward from a floor at every legal view.
    return len === 0 ? { dx: 0, dy: 1 } : { dx: dx / len, dy: dy / len };
  };
  const xTickOutward = screenOutward(
    project({ x: midX, y: by(xTickY), z: bz(tickPlaneZ) }, view),
    project({ x: midX, y: by(xTickY === yLo ? yHi : yLo), z: bz(tickPlaneZ) }, view),
  );
  const yTickOutward = screenOutward(
    project({ x: bx(yTickX), y: midY, z: bz(tickPlaneZ) }, view),
    project({ x: bx(yTickX === xLo ? xHi : xLo), y: midY, z: bz(tickPlaneZ) }, view),
  );

  /*
   * THE VERTICAL AXIS STANDS AT THE LEFTMOST FLOOR CORNER, also chosen from the view.
   *
   * Screen x is linear in (x, y) and does not depend on z at all, so the floor corner with the
   * smallest `sx` is the leftmost point of the entire figure — sheet included. A vertical line
   * there touches the drawn quads only along their boundary, and labels anchored outward from
   * it are outside the sheet by construction, at every legal azimuth. The old anchor was
   * (xLo, yLo) unconditionally, which at the default view is the far corner: behind the sheet.
   */
  const floorCorners: readonly (readonly [number, number])[] = [
    [xLo, yLo], [xHi, yLo], [xHi, yHi], [xLo, yHi],
  ];
  const cornerSx = (c: readonly [number, number]) => project({ x: bx(c[0]), y: by(c[1]), z: 0 }, view).sx;
  const zCorner = floorCorners.reduce((best, c) => (cornerSx(c) < cornerSx(best) ? c : best));
  const zTickValues = domainDegenerate ? [zLo] : valueAxisTicks(zLo, zHi, input.zAxis.tickCount ?? 4);
  const fmtZ = input.zAxis.formatTick ?? ((v: number) => `${v}`);
  const zTicks: ProjectedTick[] = zTickValues.map((v) => ({
    value: v,
    label: fmtZ(v),
    at: project({ x: bx(zCorner[0]), y: by(zCorner[1]), z: bz(v) }, view),
  }));

  const floorAt = (z: number) =>
    [
      project({ x: bx(xLo), y: by(yLo), z: bz(z) }, view),
      project({ x: bx(xHi), y: by(yLo), z: bz(z) }, view),
      project({ x: bx(xHi), y: by(yHi), z: bz(z) }, view),
      project({ x: bx(xLo), y: by(yHi), z: bz(z) }, view),
    ] as const;
  const floor = floorAt(zLo);
  const spansZero = !domainDegenerate && zLo < 0 && zHi > 0;
  const zeroPlane = spansZero ? floorAt(0) : null;

  const zAxis: readonly [ProjectedPoint, ProjectedPoint] = [
    project({ x: bx(zCorner[0]), y: by(zCorner[1]), z: bz(zLo) }, view),
    project({ x: bx(zCorner[0]), y: by(zCorner[1]), z: domainDegenerate ? box.height / 2 : box.height }, view),
  ];

  /* ── viewBox over everything that will be drawn ────────────────────────────── */
  const all: ProjectedPoint[] = [
    ...floor,
    ...zAxis,
    ...(zeroPlane ?? []),
    ...xTicks.map((t) => t.at),
    ...yTicks.map((t) => t.at),
    ...zTicks.map((t) => t.at),
  ];
  for (const c of cells) all.push(...(c.kind === 'quad' ? c.corners : c.footprint));

  /*
   * ── THE VIEWBOX MUST RESERVE ROOM FOR TEXT, NOT FOR POINTS ──────────────────────
   *
   * This was a constant `pad = 8` around the projected POINTS. Tick labels are TEXT drawn
   * AT those points and extending outward from them, so any label wider than 8 user units —
   * which is four characters — was clipped by the viewBox.
   *
   * FOUND BY RENDERING THE FIGURE AND LOOKING AT IT, after twenty passing DOM tests did not.
   * On the live GPS margin surface `baseline` rendered as "line" and `$200,000` as "$200,00C".
   * A DOM test reads `textContent`, which is the full string whatever the viewBox does, so
   * no amount of asserting on the tree could have caught it. That is the whole reason this
   * repo's rule says a passing DOM test proves polygon ORDER, not legibility.
   *
   * Each tick now reserves a box the size of its own rendered text, centred just outside its
   * anchor along the direction the renderer draws it — which the engine already computes as
   * `xTickOutward`/`yTickOutward`. Vertical ticks sit to the left of the vertical axis.
   *
   * THE FONT METRICS ARE AN ASSUMPTION, AND THEY ARE NAMED. This module draws nothing, so it
   * cannot measure text; it reserves space using the size the renderer is known to use.
   * `apps/web/src/components/geometry/__tests__` asserts `SurfacePlot` still uses exactly
   * `LABEL_FONT_SIZE`, so the two cannot drift apart silently — which is the failure mode
   * that would bring the clipping back with every test still green.
   */
  const labelBoxCorners = (
    ticks: readonly ProjectedTick[],
    outward: { dx: number; dy: number },
  ): ProjectedPoint[] => {
    const out: ProjectedPoint[] = [];
    const len = Math.hypot(outward.dx, outward.dy) || 1;
    const ux = outward.dx / len;
    const uy = outward.dy / len;
    for (const t of ticks) {
      const w = t.label.length * LABEL_FONT_SIZE * LABEL_ADVANCE_EM;
      const h = LABEL_FONT_SIZE;
      // Centre of the text box: just outside the anchor, far enough that the whole box clears.
      const cx = t.at.sx + ux * (w / 2 + LABEL_GAP);
      const cy = t.at.sy + uy * (h / 2 + LABEL_GAP);
      for (const [sx, sy] of [
        [cx - w / 2, cy - h],
        [cx + w / 2, cy - h],
        [cx - w / 2, cy + h],
        [cx + w / 2, cy + h],
      ] as const) {
        out.push({ sx, sy, depth: t.at.depth });
      }
    }
    return out;
  };

  all.push(
    ...labelBoxCorners(xTicks, xTickOutward),
    ...labelBoxCorners(yTicks, yTickOutward),
    // The vertical axis is drawn at a floor corner and its labels sit to its left.
    ...labelBoxCorners(zTicks, { dx: -1, dy: 0 }),
  );

  const pad = 4;
  const minX = Math.min(...all.map((p) => p.sx)) - pad;
  const maxX = Math.max(...all.map((p) => p.sx)) + pad;
  const minY = Math.min(...all.map((p) => p.sy)) - pad;
  const maxY = Math.max(...all.map((p) => p.sy)) + pad;

  /* ── Notices: true things that do not stop the drawing ─────────────────────── */
  const cellsTotal = (xs.length - 1) * (ys.length - 1);
  const notices: SurfaceNotice[] = [];
  /*
   * PARTITIONED ON THE ACTUAL CORNER STATES, AND THE TWO LISTS OVERLAP ON PURPOSE.
   *
   * The partition here used to be on withheld-ness ALONE — `withheldCorners.length === 0` against
   * `> 0` — which is the three-state collapse this whole module exists to prevent, committed in
   * the very sentences that report the states. A cell holding one never-measured corner AND one
   * present-but-withheld corner fell only into the withheld list: `HOLES_PRESENT` never counted
   * it, and `CELLS_WITHHELD` claimed it as purely withheld. A reader was told nobody had measured
   * anything in a cell that also contained a measurement somebody classified, and told nothing at
   * all about the absence.
   *
   * So each list holds every cell for which its fact is TRUE, and a mixed cell is in both. The
   * consequence is that the two counts can sum PAST the number of open cells, which a reader
   * would otherwise discover by subtracting and getting a wrong answer — so the sentences say so
   * out loud instead of leaving the arithmetic to close by luck.
   */
  const holesWithAbsent = holes.filter((h) => h.absentCorners.length > 0);
  const holesWithWithheld = holes.filter((h) => h.withheldCorners.length > 0);
  const mixedCount = holes
    .filter((h) => h.absentCorners.length > 0 && h.withheldCorners.length > 0).length;
  const overlapClause = mixedCount === 0
    ? ''
    : ` Counts overlap: ${mixedCount} of the ${holes.length} open cells `
      + `${mixedCount === 1 ? 'has' : 'have'} a never-measured corner AND a withheld one, so `
      + `${mixedCount === 1 ? 'it is' : 'they are'} counted in this notice and in the other alike — `
      + 'the two counts do not sum to the number of open cells.';
  if (holesWithAbsent.length > 0) {
    notices.push({
      code: 'HOLES_PRESENT',
      sentence: `${holesWithAbsent.length} of ${cellsTotal} cells are open because a corner was never `
        + 'measured, so the surface has a genuine gap there. The gap is the measurement, not a '
        + `rendering fault.${overlapClause}`,
    });
  }
  if (holesWithWithheld.length > 0) {
    notices.push({
      code: 'CELLS_WITHHELD',
      sentence: `${holesWithWithheld.length} of ${cellsTotal} cells are open because a corner is PRESENT BUT `
        + 'WITHHELD. Those heights were measured and are not shown here — a permission decision, not a '
        + `gap in the data, and a different fact from the cells nobody measured.${overlapClause}`,
    });
  }
  if (flat) {
    // Quotes `observedLo`, not `zLo`. Derived from the caller's domain instead, this sentence
    // once read "Every observed Margin is 5 USD" over values spanning −500…6000: a measurement
    // nobody took, explicitly denying variation that WAS observed.
    notices.push({
      code: 'SURFACE_IS_FLAT',
      sentence: `Every observed ${input.zAxis.label} is ${observedLo} ${input.zAxis.unit}. The surface is `
        + 'flat because the data is flat — an observed constant, not a failure to vary.',
    });
  }
  if (input.zDomain) {
    notices.push({
      code: 'Z_DOMAIN_OVERRIDDEN',
      sentence: `The vertical domain was set by the caller to ${zLo}–${zHi} ${input.zAxis.unit}, not `
        + `taken from these values, which run ${observedLo}–${observedHi}. Heights are comparable across `
        + 'surfaces and not to this grid alone.',
    });
  }
  if (input.zDomain && (observedLo < zLo || observedHi > zHi)) {
    /*
     * COUNTED ON THE CORNERS, NEVER ON THE CELL MEAN.
     *
     * The geometry is NOT clamped — clamping would move a cell to a height nobody measured — but
     * `shade` is, so beyond the box the shading and the height stop agreeing. This count used to
     * read `q.zMean < zLo || q.zMean > zHi`, which is a test of a number the drawing does not use:
     * a quad whose corners straddle the box while AVERAGING inside it is drawn punching through
     * BOTH faces and was counted as compliant. The sentence then said "0 of 1 drawn cells sit
     * beyond the box" over a cell drawn 300 units below the floor and 400 above the ceiling.
     *
     * AND THE SIZE OF THE EXCURSION IS QUOTED, because a count cannot distinguish one unit over
     * the ceiling from thirty thousand, and those are different pictures. The extremes are read
     * off the offending CELLS rather than off `observedDomain`, which can be set by a point that
     * belongs to no drawn cell at all (a hole corner).
     */
    const outsideQuads = quads.filter((q) => q.zMin < zLo || q.zMax > zHi);
    let excursion = '';
    if (outsideQuads.length > 0) {
      let lo = outsideQuads[0].zMin;
      let hi = outsideQuads[0].zMax;
      for (const q of outsideQuads) {
        if (q.zMin < lo) lo = q.zMin;
        if (q.zMax > hi) hi = q.zMax;
      }
      excursion = `, reaching ${lo} at the lowest corner and ${hi} at the highest`;
    }
    /*
     * TWO CLAUSES, TWO FACTS, EACH TIED TO ITS OWN COUNT. Where the cells are DRAWN is a fact
     * about the corners; whether the INK still means anything is a fact about the mean, and the
     * two do not have to agree. A single sentence asserting both from one number is how the
     * corner-blind count survived: it read as a statement about the drawing while measuring
     * something the drawing does not use.
     */
    const clamped = quads.filter((q) => q.shadeClamped).length;
    const cornerClause = outsideQuads.length === 0
      ? 'No DRAWN cell leaves the box: the excursion is at a grid point that belongs to no complete '
        + 'cell, so it is in the counts and not in the sheet.'
      : `${outsideQuads.length} of ${quads.length} drawn cells sit beyond the box on at least one `
        + `CORNER${excursion}. Those heights are true and are never clamped, and the renderer marks them.`;
    const inkClause = clamped === 0
      ? ' No cell MEAN leaves the box, so every shading still encodes the height it is drawn at.'
      : ` The SHADING of ${clamped} of them is clamped, so for those cells the ink and the height disagree.`;
    notices.push({
      code: 'OBSERVED_RANGE_OUTSIDE_DOMAIN',
      sentence: `The observed ${input.zAxis.label} runs ${observedLo}–${observedHi} ${input.zAxis.unit}, `
        + `outside the caller's vertical domain of ${zLo}–${zHi}. ${cornerClause}${inkClause} `
        + 'Widen the domain or drop the override.',
    });
  }
  if (!domainDegenerate && !spansZero) {
    /*
     * ZERO IS NOT INSIDE THE DOMAIN, so no break-even plane is on the figure — and the reader
     * has to be told on the surface where that matters MOST. This used to fire only for
     * `zLo > 0`, which meant an all-loss surface (the case `valueAxisTicks`'s own docblock
     * calls "the only part of a margin surface anybody urgently needs to see") was the one
     * carrying no zero plane AND no notice at all.
     */
    /*
     * EVERY CLAUSE BELOW IS TIED TO THE FACT THAT LICENSES IT, and the two facts are different
     * ones. Where the break-even line is comes from the DOMAIN; whether the cells are all losses
     * comes from the OBSERVATIONS. With an override the two can disagree (a domain of −100…−10
     * over an observed value of 5), so the loss claim is never made from the domain.
     */
    const domainClause = zLo === 0
      ? `The vertical axis starts exactly at zero ${input.zAxis.unit}, so the FLOOR of the box is the `
        + 'break-even line and no separate zero plane is drawn.'
      : zHi === 0
        ? `The vertical axis ends exactly at zero ${input.zAxis.unit}, so the TOP of the box is the `
          + 'break-even line and no separate zero plane is drawn.'
        : `The vertical domain runs ${zLo}–${zHi} ${input.zAxis.unit} and zero is not inside it, so no `
          + 'break-even line is drawn.';
    const readingClause = observedHi < 0
      ? ' EVERY cell on this surface is at or below break-even: read the whole sheet as loss-making — '
        + 'a tall cell here is a smaller loss, not a profit.'
      : observedLo > 0
        ? ' Relative heights are exaggerated by a floor above zero; do not read a tall cell as a large '
          + 'multiple of a short one.'
        : '';
    notices.push({ code: 'Z_DOMAIN_EXCLUDES_ZERO', sentence: domainClause + readingClause });
  }
  if (input.frame.valuesArePlaceholders === true) {
    notices.push({
      code: 'VALUES_ARE_PLACEHOLDERS',
      sentence: 'The heights are PLACEHOLDERS. The shape of this surface is arithmetic over numbers '
        + 'nobody has agreed, and no decision may rest on it.',
    });
  }

  return {
    kind: 'projected',
    view,
    box,
    projectionLabel: describeProjection(view, box),
    viewBox: { minX, minY, width: maxX - minX, height: maxY - minY },
    cells,
    quads,
    holes,
    xTicks,
    yTicks,
    zTicks,
    xTickOutward,
    yTickOutward,
    floor,
    zAxis,
    zDomain: [zLo, zHi],
    zeroPlane,
    flat,
    observedDomain: [observedLo, observedHi],
    frame: {
      environment: env,
      observedAt: input.frame.observedAt,
      windowFrom: input.frame.windowFrom,
      windowTo: input.frame.windowTo,
      source: input.frame.source,
      xLabel: input.xAxis.label,
      xUnit: input.xAxis.unit,
      yLabel: input.yAxis.label,
      yUnit: input.yAxis.unit,
      zLabel: input.zAxis.label,
      zUnit: input.zAxis.unit,
      cellsTotal,
      cellsDrawn: quads.length,
      cellsHoles: holes.length,
      pointsObserved,
      pointsAbsent,
      pointsWithheld,
      interpolation: INTERPOLATION_POLICY,
      valuesArePlaceholders: input.frame.valuesArePlaceholders === true,
      ruleSetVersion: GEOMETRY_RULESET_VERSION,
    },
    notices,
  };
}
