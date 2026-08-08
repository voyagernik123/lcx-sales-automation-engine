import { describe, expect, it } from 'vitest';
import {
  buildMotionGeometry, isMotionGeometry, STAGE_DEPTH,
  type MotionPayload, type MotionDeal,
} from '../motionGeometry';

/**
 * S6's whole claim is "a long flat run is a deal that stopped moving", and the FIRST
 * version of this geometry made that claim unreadable: it drew each move as a diagonal
 * from one stage to the next, so there was not one flat run in the capture. The arithmetic
 * was right and the figure said nothing.
 *
 * So the first thing pinned here is the STAIRCASE — a dwell is horizontal and its length is
 * the time. Everything else follows from that.
 *
 * The refusal paths get the most attention, because on the current book NOTHING exercises
 * them: every deal has a value and every deal has transitions. A branch no data reaches is
 * a branch that will be wrong the first time it matters — which is exactly what the P1
 * refusal capture caught.
 */

const T0 = '2026-01-01T00:00:00Z';
const day = (n: number) => new Date(Date.parse(T0) + n * 86_400_000).toISOString();

const deal = (over: Partial<MotionDeal> = {}): MotionDeal => ({
  dealId: 'd1', label: 'ACME', currentStage: 'proposal', valueCents: 1_000_000,
  transitions: [
    { at: day(0), from: null, to: 'not_started' },
    { at: day(10), from: 'not_started', to: 'contacted' },
    { at: day(50), from: 'contacted', to: 'proposal' },
  ],
  ...over,
});

const payload = (over: Partial<MotionPayload> = {}): MotionPayload => ({
  window: { from: day(0), to: day(50) },
  deals: [deal()],
  withoutHistory: [],
  unpriced: [],
  observedAt: day(60),
  ...over,
});

const built = (p: MotionPayload) => {
  const g = buildMotionGeometry(p);
  if (!isMotionGeometry(g)) throw new Error(`expected geometry, got ${g.code}`);
  return g;
};

describe('a dwell is HORIZONTAL and its length is the time', () => {
  it('every dwell has equal start and end height — a diagonal would hide the stall', () => {
    /*
     * THE REGRESSION THAT MATTERS. Drawing (t₀,stage₀) → (t₁,stage₁) as one diagonal
     * encodes the same two numbers and destroys the only thing the figure is for. A dwell
     * belongs to ONE stage: the one the deal was sitting in.
     */
    for (const d of built(payload()).dwells) expect(d.ay).toBe(d.by);
  });

  it('the run is longer for a longer wait, proportionally', () => {
    const g = built(payload());
    const closed = g.dwells.filter((d) => !d.open);
    const [tenDay, fortyDay] = [closed[0]!, closed[1]!];
    expect(tenDay.dwellDays).toBeCloseTo(10, 6);
    expect(fortyDay.dwellDays).toBeCloseTo(40, 6);
    // Length carries the time, which is what makes it comparable by eye.
    const len = (d: { ax: number; bx: number }) => d.bx - d.ax;
    expect(len(fortyDay) / len(tenDay)).toBeCloseTo(4, 4);
  });

  it('a riser is vertical and sits at the instant the move was recorded', () => {
    const g = built(payload());
    expect(g.risers).toHaveLength(2);
    for (const r of g.risers) expect(r.y1).toBeGreaterThan(r.y0);
    // The riser lands where the dwell that preceded it ended.
    expect(g.risers[0]!.x).toBeCloseTo(g.dwells[0]!.bx, 9);
  });
});

describe('an open deal is still dwelling, and that is the bar that matters', () => {
  it('its last run reaches the OBSERVATION time, not its last recorded move', () => {
    // A board cannot show this at all: a card that arrived yesterday and one that has sat
    // for seven weeks are the same rectangle.
    const g = built(payload());
    const open = g.dwells.filter((d) => d.open);
    expect(open).toHaveLength(1);
    expect(open[0]!.dwellDays).toBeCloseTo(10, 6); // day(50) → observedAt day(60)
  });

  it('a WON deal stops — there is no dwell after an outcome', () => {
    const g = built(payload({ deals: [deal({ currentStage: 'won' })] }));
    expect(g.dwells.some((d) => d.open)).toBe(false);
    expect(g.terminals[0]!.outcome).toBe('won');
  });

  it('the axis extends to the observation time only when something is still open', () => {
    const openBook = built(payload());
    const closedBook = built(payload({ deals: [deal({ currentStage: 'lost' })] }));
    expect(openBook.window.to).toBe(Date.parse(day(60)));
    // Extending a closed book's axis to today would add empty space asserting an
    // observation nobody made.
    expect(closedBook.window.to).toBe(Date.parse(day(50)));
  });
});

describe('the refusals — none of which the current book exercises', () => {
  it('a deal with NO value is excluded and NAMED, never placed at zero', () => {
    /*
     * Depth is value. A null value at z=0 would put an unpriced deal at the cheapest point
     * on that axis and it would read as a measurement.
     */
    const g = built(payload({
      deals: [deal(), deal({ dealId: 'd2', label: 'NOPRICE', valueCents: null })],
      unpriced: [{ dealId: 'd2', label: 'NOPRICE', reason: 'No package value recorded.' }],
    }));
    expect(g.drawnDeals).toBe(1);
    expect(g.dwells.every((d) => d.dealId === 'd1')).toBe(true);
    expect(g.excluded.map((e) => e.label)).toContain('NOPRICE');
  });

  it('a deal with NO transitions is excluded and NAMED', () => {
    // "Missing from the figure" and "has not moved" look identical on screen.
    const g = built(payload({
      withoutHistory: [{ dealId: 'd9', label: 'QUIET', currentStage: 'contacted', reason: 'No stage transitions recorded.' }],
    }));
    expect(g.excluded.map((e) => e.label)).toContain('QUIET');
    expect(g.excluded.find((e) => e.label === 'QUIET')!.reason.length).toBeGreaterThan(20);
  });

  it('a book with nothing drawable REFUSES, and says it is not an empty pipeline', () => {
    const out = buildMotionGeometry(payload({ deals: [], window: null }));
    expect(isMotionGeometry(out)).toBe(false);
    if (isMotionGeometry(out)) throw new Error('unreachable');
    expect(out.code).toBe('NO_RECORDED_MOTION');
    // The distinction the reader needs: the deals exist, the HISTORY does not.
    expect(out.reason).toMatch(/not an empty pipeline/i);
  });

  it('a single-transition deal is a MARK, not a flat run', () => {
    // A flat run means "stalled". One transition is a position with no measured dwell, and
    // drawing it as a run would assert a stall nobody observed.
    const g = built(payload({
      deals: [deal(), deal({
        dealId: 'd3', label: 'ONE', currentStage: 'lost',
        transitions: [{ at: day(5), from: null, to: 'not_started' }],
      })],
    }));
    expect(g.pointsOnly.map((p) => p.label)).toEqual(['ONE']);
    expect(g.dwells.some((d) => d.dealId === 'd3')).toBe(false);
  });
});

describe('the stall ramp is anchored on the book, not on a number somebody liked', () => {
  it('the anchors are the observed p25 and p90, and they are returned for printing', () => {
    // A fixed "14 days is slow" would be a claim about this business nobody has made.
    const g = built(payload());
    expect(g.stallAnchors.fast).toBeGreaterThan(0);
    expect(g.stallAnchors.slow).toBeGreaterThan(g.stallAnchors.fast);
  });

  it('stallT saturates rather than running past 1 on an extreme wait', () => {
    const g = built(payload({
      deals: [deal({ transitions: [
        { at: day(0), from: null, to: 'not_started' },
        { at: day(2), from: 'not_started', to: 'contacted' },
        { at: day(400), from: 'contacted', to: 'proposal' },
      ] })],
      window: { from: day(0), to: day(400) },
      observedAt: day(400),
    }));
    for (const d of g.dwells) expect(d.stallT).toBeLessThanOrEqual(1);
  });
});

describe('the censoring disclosure', () => {
  it('counts deals too recent to be ABLE to show a long stall', () => {
    /*
     * Without this the figure lies by omission: the right-hand side is always cooler,
     * because a deal that entered last week cannot have a 40-day dwell yet. A reader
     * concludes the desk got faster. It is the observation window, not performance.
     */
    const g = built(payload({
      deals: [
        deal(),
        deal({ dealId: 'new', label: 'FRESH', transitions: [
          { at: day(58), from: null, to: 'not_started' },
          { at: day(59), from: 'not_started', to: 'contacted' },
        ] }),
      ],
    }));
    expect(g.censoredRecent).toBeGreaterThanOrEqual(1);
  });
});

describe('the stage ordering is the repo\'s, not this file\'s invention', () => {
  it('won and lost share a rung because the codebase declares them both terminal', () => {
    // Giving `lost` its own lower rung would invent an ordering nothing else states.
    expect(STAGE_DEPTH.won).toBe(STAGE_DEPTH.lost);
    expect(STAGE_DEPTH.not_started).toBeLessThan(STAGE_DEPTH.negotiating);
  });

  it('the terminal rung gets a label but NO full-width rule', () => {
    // Nothing dwells at "closed"; a rule across the frame there implied a stage deals sit
    // in, and read as a border artifact in the capture.
    const g = built(payload());
    const closed = g.stageTicks.find((t) => t.label === 'Closed')!;
    expect(closed.rule).toBe(false);
    expect(g.stageTicks.filter((t) => t.rule)).toHaveLength(5);
  });
});
