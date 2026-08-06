/**
 * THE MARGIN SURFACE — the wiring test, and the one that would have caught the readout.
 *
 * Two failures are being guarded here, and they are different in kind.
 *
 * 1. THE SURFACE IS DEAD CODE. `notifications/readout.ts`, `routes/readout.ts`,
 *    `pages/Readout.tsx` and `lib/api/readout.ts` all existed, all passed their own tests,
 *    and NOTHING REFERENCED ANY OF THEM — no `app.route`, no router entry. It read as
 *    delivered for as long as nobody grepped for a caller. A geometry module is even easier
 *    to leave in that state, because a pure projector's unit tests pass beautifully while it
 *    is mounted on no page at all. So one test here asserts the MOUNT, from the page source.
 *
 * 2. THE FIGURE IS PERSUASIVE AND WRONG. Every expected number below is computed BY HAND in
 *    its comment, never by re-running the expression under test. `marginPct` is the same
 *    function `underwrite.ts:843` uses to publish `p50MarginPct`, so a test that asserted
 *    `marginPct(…) === marginPct(…)` would pass against any arithmetic whatsoever.
 *
 * The fixture reads through `@lcx/shared`, not through a deep relative path, because the
 * barrel export is itself part of what shipped and a test that bypasses it would not notice
 * the barrel entry being dropped.
 *
 * NO `waitFor`: `buildMarginSurface` is pure and synchronous (doctrine-lint rule 5).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isProjectedSurface, marginPct } from '@lcx/shared';
import { buildMarginSurface, type MarginSurfaceInput } from '../GpsUnderwriting';

/*
 * A $20,000 quote. Costs are stated as the ENGINE states them — as a median MARGIN at the
 * quoted price — because that is the only cost figure `OverrunPoint` carries, and recovering
 * the cost from it is the whole arithmetic under test.
 *
 *   overrun   p50 margin      ⇒ median cost = 2,000,000 − margin
 *   baseline  1,200,000c        800,000c
 *   +10%      1,120,000c        880,000c
 *   +25%      1,000,000c      1,000,000c
 *   +50%        800,000c      1,200,000c
 */
const QUOTE: MarginSurfaceInput = {
  priceCents: 2_000_000,
  currency: 'CHF',
  asOf: '2026-08-07T09:00:00.000Z',
  points: [
    { effortUpliftPct: 0, p50MarginCents: 1_200_000 },
    { effortUpliftPct: 10, p50MarginCents: 1_120_000 },
    { effortUpliftPct: 25, p50MarginCents: 1_000_000 },
    { effortUpliftPct: 50, p50MarginCents: 800_000 },
  ],
  placeholders: true,
};

const PAGE_SRC = readFileSync(join(__dirname, '..', 'GpsUnderwriting.tsx'), 'utf8');

describe('the margin surface carries a fact the 2-D table cannot', () => {
  it('holds the interaction: +50% overrun needs $24,000 to match the baseline at $16,000', () => {
    /*
     * THIS IS THE WHOLE JUSTIFICATION FOR A THIRD AXIS, as one equality.
     *
     *   baseline cost   800,000c at a 1,600,000c price → 800,000/1,600,000  = 50%
     *   +50% cost     1,200,000c at a 2,400,000c price → 1,200,000/2,400,000 = 50%
     *
     * Two cells, far apart on both floor axes, at the same height. `SensitivityTable` holds
     * the price at 2,000,000c, so BOTH of these cells are off its edge and the fact that
     * they are equal — the price rise that buys back an overrun — has nowhere to appear in
     * it. Remove the third dimension and this becomes unstateable, which is the test the
     * plan sets for the whole geometry track.
     */
    expect(marginPct(1_600_000, 800_000)).toBe(50);
    expect(marginPct(2_400_000, 1_200_000)).toBe(50);
  });

  it('projects, and spans exactly the hand-computed margin extremes', () => {
    const s = buildMarginSurface(QUOTE);

    // ANTI-VACUITY. Everything below reads `cells`, and an empty or refused surface would
    // satisfy a `.every()` over nothing.
    expect(isProjectedSurface(s), 'the surface refused on legitimate inputs').toBe(true);
    if (!isProjectedSurface(s)) return;

    // 5 prices × 4 overruns → 4 × 3 quads between the grid points.
    expect(s.cells).toHaveLength(12);
    expect(s.cells.every((c) => c.kind === 'quad'), 'a legitimate grid produced a hole').toBe(true);

    const zs = s.cells.flatMap((c) => (c.kind === 'quad' ? [c.zMin, c.zMax] : []));

    /*
     * Worst cell: cheapest price against the highest cost.
     *   (1,600,000 − 1,200,000) / 1,600,000 = 25%
     * Best cell: dearest price against the lowest cost.
     *   (2,400,000 − 800,000) / 2,400,000 = 66.67% → 67% (marginPct rounds)
     */
    expect(Math.min(...zs)).toBe(25);
    expect(Math.max(...zs)).toBe(67);
  });

  it('states the API host as the API host, and never invents a database name', () => {
    const s = buildMarginSurface(QUOTE);
    expect(isProjectedSurface(s)).toBe(true);
    if (!isProjectedSurface(s)) return;

    // The response carries no database identity. Labelling this 'production' would be the
    // exact laundering the observation frame exists to prevent.
    expect(s.frame.environment).toMatch(/^API /);
    expect(s.frame.environment).not.toMatch(/production|staging|supabase/i);
    expect(s.frame.observedAt).toBe(QUOTE.asOf);
    // A snapshot, not a window — so neither endpoint may be quietly filled with `asOf`.
    expect(s.frame.windowFrom).toBeNull();
    expect(s.frame.windowTo).toBeNull();
    expect(s.frame.source).toContain('marginPct');
  });

  it('refuses rather than drawing a figure when there is no price to divide by', () => {
    /*
     * `marginPct` returns null at a non-positive price — "no price yet" is not "zero margin".
     * Every cell is therefore absent, and the surface must REFUSE. Which code fires is not
     * asserted: a zero price legitimately trips both the nothing-observed rule and the
     * degenerate-x-axis rule, and pinning one would make this test a hostage to their order.
     * The property that matters is that no figure is produced and the refusals are returned.
     */
    const s = buildMarginSurface({ ...QUOTE, priceCents: 0 });
    expect(isProjectedSurface(s)).toBe(false);
    if (isProjectedSurface(s)) return;
    expect(s.refusals.length).toBeGreaterThan(0);
    expect(s.refusals.every((r) => typeof r.code === 'string' && r.code.length > 0)).toBe(true);
  });
});

describe('the surface is reachable, which is the part that has been got wrong before', () => {
  it('is mounted on the page, not merely defined in it', () => {
    // The readout check: a component that exists and is never rendered is not a capability.
    expect(PAGE_SRC).toContain('<MarginSurface res={res} />');
    // And it is inside `Distribution`, next to the 2-D slice it adds a dimension to, rather
    // than in a branch that only some verdict reaches.
    const dist = PAGE_SRC.slice(PAGE_SRC.indexOf('function Distribution('));
    expect(dist.slice(0, dist.indexOf('function MarginSurface('))).toContain('<MarginSurface');
  });

  it('takes the placeholder flag from the server and never asserts it', () => {
    /*
     * The effort triples behind these costs are still `TODO_EFFORT_DAYS`, so the figure has to
     * LOOK like a placeholder. Wiring that to a literal would leave the surface hatching
     * itself forever after real triples land — or, worse the other way, claiming measured
     * costs the day someone flipped it for a demo.
     */
    expect(PAGE_SRC).toContain('placeholders: res.effortTriplesArePlaceholders');
    expect(PAGE_SRC).not.toMatch(/valuesArePlaceholders:\s*(true|false)\b/);
  });
});
