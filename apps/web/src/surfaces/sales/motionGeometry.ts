/**
 * S6 · PIPELINE IN MOTION — the geometry, kept pure so it can be argued with.
 *
 * `3D_WORK_100X.md` §5 S6: "stage × time × value, with each deal a body moving through it;
 * velocity is slope, stalling is visible as flatness. A Kanban board shows WHERE deals are
 * and never HOW THEY ARE MOVING."
 *
 * This surface sits beside `DealBoard.tsx`, which is that Kanban. The board can tell you a
 * deal is in Proposal. It cannot tell you the deal has been in Proposal for seven weeks,
 * because a column has no time in it. On the current book, dwell between stages runs from
 * 3 days to 49 — that spread is the whole subject, and the board renders every one of those
 * deals as an identical card.
 *
 * ── WHY THE TIME AXIS IS REAL HERE ──────────────────────────────────────────────────
 * `docs/3d/p2/README.md` refused three surfaces this month, one of them for having no time
 * axis at all. This one was checked before it was built: every stage transition writes a
 * `deal_events` row inside the same transaction as the deal update, so each x position is a
 * recorded timestamp. Nothing here infers a date from an ordering.
 *
 * ── THE THREE THINGS THIS REFUSES TO DRAW ───────────────────────────────────────────
 *   1. A deal with no recorded transitions has no path. It is NAMED, never omitted —
 *      "missing from the figure" and "has not moved" look identical on screen.
 *   2. A deal with no package value has no position on the depth axis. It is NAMED and
 *      excluded, never placed at zero, which would put it at the cheapest point.
 *   3. A single-transition deal has a position but no VELOCITY. It is drawn as a point,
 *      not as a segment of zero slope, because a flat segment here means "stalled" and
 *      that would be a claim nobody measured.
 */

import { STAGES, STAGE_LABELS, type DealStage } from '@lcx/shared';

export interface MotionTransition {
  /** ISO timestamp of the recorded transition. */
  at: string;
  from: DealStage | null;
  to: DealStage;
}

export interface MotionDeal {
  dealId: string;
  label: string;
  currentStage: DealStage;
  /** NULL = nobody has priced this deal. Never 0. */
  valueCents: number | null;
  transitions: MotionTransition[];
}

export interface MotionPayload {
  window: { from: string; to: string } | null;
  deals: MotionDeal[];
  withoutHistory: { dealId: string; label: string; currentStage: DealStage; reason: string }[];
  unpriced: { dealId: string; label: string; reason: string }[];
  observedAt: string;
}

/**
 * Progression depth per stage. TAKEN FROM THE REPO, not invented here — `won` and `lost`
 * are both terminal and both sit at 5 in `packages/shared/src/deals/index.ts`. That is a
 * statement about progression, not about outcome, so the two are separated by COLOUR
 * rather than by height. Giving `lost` its own lower rung would be inventing an ordering
 * the codebase does not declare.
 */
export const STAGE_DEPTH: Record<DealStage, number> = {
  not_started: 0, contacted: 1, discovery: 2, proposal: 3, negotiating: 4, won: 5, lost: 5,
};
export const MAX_DEPTH = 5;

/* World box. */
export const X0 = -1.50, X1 = 1.50, XW = X1 - X0;
/* Y1 leaves headroom above the terminal rung: at 0.86 the top rung sat on the plate
   edge and its label projected clean off the canvas. */
export const Y0 = -0.52, Y1 = 0.74, YH = Y1 - Y0;
export const ZR = 0.42;

/**
 * A DWELL — the deal sitting in one stage, drawn HORIZONTALLY.
 *
 * The first version of this drew each move as a diagonal from one stage to the next, and
 * the capture killed it: there was not one flat run in the figure, and "stalling is visible
 * as flatness" is the entire claim. A diagonal encodes the same two numbers and makes the
 * one that matters unreadable.
 *
 * The correct shape is a STAIRCASE. A deal holds stage S from t₀ to t₁ — a horizontal run
 * whose LENGTH IS THE DWELL — and then steps up at t₁. Length is now the thing the eye is
 * already good at comparing, which is what the Kanban cannot do at all.
 */
export interface Dwell {
  readonly ax: number; readonly ay: number;
  readonly bx: number; readonly by: number;
  readonly z: number;
  /** Days the deal sat in this stage. The quantity the length AND the colour encode. */
  readonly dwellDays: number;
  /** 0 = fastest anchor or below, 1 = slowest anchor or above. */
  readonly stallT: number;
  /**
   * TRUE when this dwell is still running — the deal has not moved since, and the run ends
   * at the observation time rather than at a recorded transition. This is the most
   * decision-relevant bar on the figure and the one a board hides most completely: a card
   * that has sat in Proposal for seven weeks looks exactly like one that arrived yesterday.
   */
  readonly open: boolean;
  readonly dealId: string;
  readonly stage: DealStage;
}

/** The vertical step between two stages, at the instant it was recorded. */
export interface Riser {
  readonly x: number;
  readonly y0: number; readonly y1: number;
  readonly z: number;
  readonly dealId: string;
}

export interface Terminal {
  readonly x: number; readonly y: number; readonly z: number;
  readonly outcome: 'won' | 'lost' | 'open';
  readonly dealId: string;
  readonly label: string;
}

export interface MotionGeometry {
  readonly kind: 'geometry';
  readonly dwells: readonly Dwell[];
  readonly risers: readonly Riser[];
  readonly terminals: readonly Terminal[];
  /** Deals with exactly one transition: a position, but no measured velocity. */
  readonly pointsOnly: readonly Terminal[];
  readonly window: { readonly from: number; readonly to: number };
  readonly valueRange: { readonly min: number; readonly max: number };
  /**
   * The dwell values the stall ramp is anchored on, in days. A DECLARED CHOICE — the data
   * does not pick them — so they are returned for printing rather than buried.
   */
  readonly stallAnchors: { readonly fast: number; readonly slow: number };
  readonly stageTicks: readonly { readonly y: number; readonly label: string; readonly rule: boolean }[];
  readonly drawnDeals: number;
  /**
   * Deals that entered too recently to be ABLE to show a long stall.
   *
   * A deal whose first recorded move is more recent than the slow anchor cannot yet have a
   * dwell that reaches it — there has not been enough calendar time. The right edge of this
   * figure is therefore systematically cooler than the left, and a reader who does not know
   * that will conclude the desk got faster. It is censoring, not improvement, and the count
   * is surfaced so the figure can say so out loud.
   */
  readonly censoredRecent: number;
  readonly excluded: readonly { readonly dealId: string; readonly label: string; readonly reason: string }[];
}

export type MotionOutcome =
  | MotionGeometry
  | { readonly kind: 'refused'; readonly code: string; readonly reason: string };

const DAY = 86_400_000;

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

export function buildMotionGeometry(payload: MotionPayload): MotionOutcome {
  const priced = payload.deals.filter((d) => d.valueCents != null && d.transitions.length > 0);

  if (payload.window == null || priced.length === 0) {
    return {
      kind: 'refused',
      code: 'NO_RECORDED_MOTION',
      reason:
        'No deal in this book has both a recorded stage transition and a package value, so there is '
        + 'nothing to place on the time or value axes. This is not an empty pipeline — the deals are '
        + 'listed below with the reason each one could not be drawn.',
    };
  }

  const from = Date.parse(payload.window.from);
  /*
   * The axis runs to the OBSERVATION TIME when any deal is still open, not to the last
   * recorded transition. An open deal's current stall runs from its last move until now,
   * so an axis that stopped at the last transition would clip exactly the bars that matter
   * most — and would also imply the book was last looked at on the day something last
   * happened, which is a different claim.
   *
   * With no open deals the axis stops at the last transition: extending it to today would
   * add empty space that asserts observation nobody made.
   */
  const anyOpen = payload.deals.some(
    (d) => d.currentStage !== 'won' && d.currentStage !== 'lost'
      && d.valueCents != null && d.transitions.length > 0,
  );
  const to = anyOpen
    ? Math.max(Date.parse(payload.window.to), Date.parse(payload.observedAt))
    : Date.parse(payload.window.to);
  const span = Math.max(1, to - from);
  const values = priced.map((d) => d.valueCents!);
  const vMin = Math.min(...values), vMax = Math.max(...values);
  const vSpan = vMax - vMin;

  const x = (iso: string) => X0 + ((Date.parse(iso) - from) / span) * XW;
  const y = (s: DealStage) => Y0 + (STAGE_DEPTH[s] / MAX_DEPTH) * YH;
  /* Depth is VALUE, mapped linearly over the observed range. Linear rather than by rank:
     rank would space a $8k deal and a $95k deal equally and destroy the one comparison the
     axis exists to support. A single-value book collapses to the mid plane, which is
     correct — there is no spread to show. */
  const z = (cents: number) => (vSpan === 0 ? 0 : ((cents - vMin) / vSpan - 0.5) * 2 * ZR);

  /* Anchors for the stall ramp, from the OBSERVED dwell distribution rather than a
     hard-coded "14 days is slow". A fixed threshold would be a claim about this business
     that nobody has made; percentiles of the book describe the book. Printed on the
     figure so the reader knows what "stalled" was measured against. */
  const observedMs = Date.parse(payload.observedAt);
  const allDwells: number[] = [];
  for (const d of priced) {
    for (let i = 1; i < d.transitions.length; i++) {
      allDwells.push((Date.parse(d.transitions[i]!.at) - Date.parse(d.transitions[i - 1]!.at)) / DAY);
    }
  }
  allDwells.sort((a, b) => a - b);
  const fast = percentile(allDwells, 0.25);
  const slow = Math.max(fast + 1e-6, percentile(allDwells, 0.9));
  const stallT = (days: number) => Math.min(1, Math.max(0, (days - fast) / (slow - fast)));

  const dwells: Dwell[] = [];
  const risers: Riser[] = [];
  const terminals: Terminal[] = [];
  const pointsOnly: Terminal[] = [];

  for (const d of priced) {
    const dz = z(d.valueCents!);
    const ts = d.transitions;
    const outcome = d.currentStage === 'won' ? 'won' : d.currentStage === 'lost' ? 'lost' : 'open';

    for (let i = 1; i < ts.length; i++) {
      const a = ts[i - 1]!, b = ts[i]!;
      const days = (Date.parse(b.at) - Date.parse(a.at)) / DAY;
      const ya = y(a.to);
      // The DWELL: flat, at the stage the deal was actually sitting in.
      dwells.push({
        ax: x(a.at), ay: ya, bx: x(b.at), by: ya, z: dz,
        dwellDays: days, stallT: stallT(days), open: false, dealId: d.dealId, stage: a.to,
      });
      // The MOVE: vertical, at the instant it was recorded.
      risers.push({ x: x(b.at), y0: ya, y1: y(b.to), z: dz, dealId: d.dealId });
    }

    const last = ts[ts.length - 1]!;
    /* AN OPEN DEAL IS STILL DWELLING. The run from its last recorded move to now is its
       CURRENT stall, and it is the single most decision-relevant length on the figure —
       a board renders a card that arrived yesterday and one that has sat for seven weeks
       as the same rectangle. Won and lost deals stop: there is no dwell after an outcome. */
    if (outcome === 'open') {
      const days = Math.max(0, (observedMs - Date.parse(last.at)) / DAY);
      dwells.push({
        ax: x(last.at), ay: y(last.to), bx: x(payload.observedAt), by: y(last.to), z: dz,
        dwellDays: days, stallT: stallT(days), open: true, dealId: d.dealId, stage: last.to,
      });
    }

    const t: Terminal = {
      x: x(last.at), y: y(last.to), z: dz, outcome, dealId: d.dealId, label: d.label,
    };
    // ONE transition is a position without a measured dwell. It is a mark, not a run —
    // a flat run would read as "stalled", which is a measurement nobody took.
    (ts.length === 1 && outcome !== 'open' ? pointsOnly : terminals).push(t);
  }

  const excluded = [
    ...payload.withoutHistory.map((d) => ({ dealId: d.dealId, label: d.label, reason: d.reason })),
    ...payload.unpriced.map((d) => ({ dealId: d.dealId, label: d.label, reason: d.reason })),
  ];

  return {
    kind: 'geometry',
    dwells, risers, terminals, pointsOnly,
    window: { from, to },
    valueRange: { min: vMin, max: vMax },
    stallAnchors: { fast, slow },
    /* The terminal rung gets a label but NO full-width rule: nothing dwells at 'closed', so
       a rule across the whole frame there implied a stage deals sit in, and read as a border
       artifact. The rules mark the five stages a deal can actually wait in. */
    stageTicks: STAGES.filter((s) => s !== 'lost' && s !== 'won')
      .map((s) => ({ y: y(s), label: STAGE_LABELS[s], rule: true }))
      .concat([{ y: y('won'), label: 'Closed', rule: false }]),
    drawnDeals: priced.length,
    censoredRecent: priced.filter((d) => {
      const first = Date.parse(d.transitions[0]!.at);
      return (observedMs - first) / DAY < slow;
    }).length,
    excluded,
  };
}

export function isMotionGeometry(o: MotionOutcome): o is MotionGeometry {
  return o.kind === 'geometry';
}
