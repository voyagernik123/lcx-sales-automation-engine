import type { OfferKey } from './types.js';
import type { PerimeterEntry, ServiceGateDecision } from './perimeter.js';

/**
 * THE PERIMETER GRID'S WIRE SHAPE — declared ONCE, here, for both sides.
 *
 * These types were born in `apps/api/src/gps/conflict.ts` and the conflict-wall
 * page could not import them (a browser cannot reach into apps/api), so the page
 * rendered only the COMPILED perimeter and its comment named the gap: "move
 * `PerimeterView` into `packages/shared/src/gps/`, then read it here" — with the
 * warning that hand-mirroring a wire shape is the defect that once shipped a
 * guaranteed crash behind a green build (`lib/api/gps.ts:80`).
 *
 * This file is that move, made when the gap stopped being theoretical: the G0
 * perimeter packet entered 30 REAL rows into `gps_jurisdiction_profile`, at which
 * point a page showing only the compiled placeholders was out of date about the
 * thing it exists to show. The API imports these declarations and re-exports them,
 * so its `perimeterView()` composer cannot drift from what the page reads — same
 * one-declaration discipline as `UnderwriteResponse`.
 *
 * TYPES ONLY. The composer stays in the API: it reads database rows, and this
 * module keeps the shared layer's rule of touching no pool and no clock.
 */

export type PerimeterSource = 'database' | 'compiled_placeholder';

/** One (jurisdiction, offer) cell of the grid, however it is sourced. */
export interface PerimeterCell {
  /** Row id when a human entered it; null for a compiled placeholder. */
  id: string | null;
  jurisdiction: string;
  jurisdictionLabel: string;
  offerKey: OfferKey;
  offerName: string;
  entry: PerimeterEntry;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** `perimeterEntryDefects` — [] for a well-formed row. */
  defects: readonly string[];
  unconditional: ServiceGateDecision;
}

/** A (jurisdiction, offer) pair nobody has classified. The hole, named. */
export interface PerimeterHole {
  jurisdiction: string;
  jurisdictionLabel: string;
  offerKey: OfferKey;
  offerName: string;
  /** The refusal a quote into this cell would receive, with its remedy. */
  refusal: ServiceGateDecision;
}

export interface PerimeterView {
  asOf: string;
  source: PerimeterSource;
  sourceReason: string;
  /** Rows a human entered. Zero is a fact worth showing, not an empty state. */
  storedRowCount: number;
  /** `PERIMETER_REVIEW_WARNING_DAYS` — how early `expiringSoon` starts warning. */
  reviewWarningDays: number;
  /** True while the compiled placeholders are what is being enforced. */
  placeholdersAreUnreviewed: boolean;
  /** The one sentence a surface must show when it renders placeholders. */
  unreviewedReason: string;
  cells: readonly PerimeterCell[];
  holes: readonly PerimeterHole[];
  /** Cells where a review is overdue or due within the warning window. */
  reviewDue: readonly PerimeterCell[];
}
