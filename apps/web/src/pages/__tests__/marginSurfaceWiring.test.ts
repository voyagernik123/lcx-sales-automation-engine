/**
 * THE MARGIN SURFACE IS WIRED, AND THAT IS THE THING BEING ASSERTED.
 *
 * The geometry engine and its renderer both shipped as DEAD CODE — a pure module and a
 * component that nothing imported. That is the identical failure the 07:00 readout almost
 * shipped with (`docs/phases/P3_EVIDENCE.md`): four files, reachable from none, sitting in
 * the tree reading as delivered. Nothing in a unit suite catches it, because every unit
 * passes; the capability is simply unreachable.
 *
 * So the first two tests here are REACHABILITY tests against the page's own source. They
 * are deliberately not `render()` tests: mounting `GpsUnderwriting` proves the component
 * renders, not that a human can get to it, and a `render` of a page whose fetch is mocked
 * would pass just as happily if the surface were deleted from the JSX.
 *
 * The rest drive the REAL `buildMarginSurface` — exported from the page for this purpose —
 * rather than a copy of its logic. A test that rebuilds the grid itself asserts its own
 * fixture and would keep passing through any change to the thing it claims to cover.
 *
 * NO `waitFor`: `buildMarginSurface` is pure and the reachability checks read a file.
 * Nothing here is asynchronous, so a barrier would only open a window in which a negative
 * assertion passes against an unbuilt value (doctrine-lint rule 5).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isProjectedSurface, marginPct } from '@lcx/shared';
import { buildMarginSurface, type MarginSurfaceInput } from '../GpsUnderwriting';

/*
 * Resolved from the package root, NOT from `import.meta.url`: under jsdom Vite serves
 * modules over http, so `import.meta.url` has an http scheme and `readFileSync` rejects it
 * outright. (The api suite's source-reading ratchets use `import.meta.url` and are correct
 * to — they run on the node environment, where it is a file URL.)
 */
const PAGE_PATH = resolve(process.cwd(), 'src/pages/GpsUnderwriting.tsx');
const PAGE_SRC = readFileSync(PAGE_PATH, 'utf8');

/**
 * A realistic quote: $250,000 at a median cost that leaves ~38% margin, walked out to a
 * +50% overrun that takes it underwater. The overrun points are the four the engine
 * actually returns (`underwrite.ts` — 0, 10, 25, 50).
 */
const PRICE = 25_000_000;
const INPUT: MarginSurfaceInput = {
  priceCents: PRICE,
  currency: 'EUR',
  asOf: '2026-08-07T09:00:00.000Z',
  points: [
    { effortUpliftPct: 0, p50MarginCents: 9_500_000 },
    { effortUpliftPct: 10, p50MarginCents: 7_200_000 },
    { effortUpliftPct: 25, p50MarginCents: 3_800_000 },
    { effortUpliftPct: 50, p50MarginCents: -1_900_000 },
  ],
  placeholders: true,
};

describe('the margin surface is REACHABLE, not merely built', () => {
  it('is mounted in the page that renders the distribution', () => {
    // The whole finding, in one assertion. `<MarginSurface` must appear in JSX, not just
    // be defined: a defined-but-unrendered component is exactly the readout's defect.
    expect(PAGE_SRC).toContain('<MarginSurface res={res} />');

    // And the definition must exist, so the assertion above cannot be satisfied by a
    // comment or a string somewhere in the file.
    expect(PAGE_SRC).toMatch(/function MarginSurface\(\{ res \}/);
  });

  it('renders through SurfacePlot, so a refusal reaches the screen as a refusal', () => {
    // `SurfacePlot` returns `<Refused>` on a refused outcome. If the page ever drew the
    // mesh itself, a refusal would become a blank region — a missing answer that looks
    // like an answered nothing.
    expect(PAGE_SRC).toContain("from '@/components/geometry/SurfacePlot'");
    expect(PAGE_SRC).toContain('<SurfacePlot');
  });
});

describe('the placeholder flag comes from the server, never from a literal', () => {
  it('threads res.effortTriplesArePlaceholders into the frame', () => {
    expect(PAGE_SRC).toContain('placeholders: res.effortTriplesArePlaceholders');
  });

  it('never hard-codes valuesArePlaceholders', () => {
    /*
     * The trap this closes: the effort triples behind these costs are still
     * `TODO_EFFORT_DAYS`, so the figure must hatch itself as a placeholder TODAY. A
     * literal `true` would be correct today and become a lie on the day real triples
     * land — and nobody would remember this figure exists to go and flip it.
     */
    expect(PAGE_SRC).not.toMatch(/valuesArePlaceholders:\s*(true|false)\b/);
  });

  it('carries the flag through to the built frame in both directions', () => {
    const on = buildMarginSurface(INPUT);
    const off = buildMarginSurface({ ...INPUT, placeholders: false });
    expect(isProjectedSurface(on)).toBe(true);
    expect(isProjectedSurface(off)).toBe(true);
    if (!isProjectedSurface(on) || !isProjectedSurface(off)) return;
    expect(on.frame.valuesArePlaceholders).toBe(true);
    expect(off.frame.valuesArePlaceholders).toBe(false);
  });
});

describe('buildMarginSurface projects a real figure from a real quote', () => {
  const out = buildMarginSurface(INPUT);

  it('PROJECTS rather than refusing — the anti-vacuity check', () => {
    /*
     * Without this, every assertion below could be satisfied by a refusal that happens to
     * carry the right shape, and the suite would pass while the page showed no figure at
     * all. This is the same guard the ratchet tests carry for the same reason.
     */
    expect(isProjectedSurface(out), `refused: ${JSON.stringify(out)}`).toBe(true);
  });

  it('draws (5-1)×(4-1) = 12 cells, all of them quads', () => {
    if (!isProjectedSurface(out)) return;
    expect(out.frame.cellsTotal).toBe(12);
    expect(out.frame.cellsDrawn).toBe(12);
    expect(out.frame.cellsHoles).toBe(0);
    // 5 prices × 4 overruns, every one observed, none absent and none withheld.
    expect(out.frame.pointsObserved).toBe(20);
    expect(out.frame.pointsAbsent).toBe(0);
    expect(out.frame.pointsWithheld).toBe(0);
  });

  it('reproduces the engine’s own median margin percent in the quoted-price column', () => {
    if (!isProjectedSurface(out)) return;
    /*
     * THE INVARIANT THAT MAKES THIS FIGURE ARITHMETIC RATHER THAN A SECOND MODEL.
     *
     * `underwrite.ts:843` computes `p50MarginPct` as exactly
     * `marginPct(priceCents, priceCents - p50)`. The surface's quoted-price column is the
     * same expression, so the two cannot drift — and if someone re-derives cost some other
     * way, the observed domain stops matching and this fails.
     */
    const engineColumn = INPUT.points.map(
      (p) => marginPct(PRICE, PRICE - p.p50MarginCents) as number,
    );
    expect(engineColumn).toEqual([38, 29, 15, -8]);

    // Every one of those heights must be inside the surface's observed domain.
    const [lo, hi] = out.observedDomain;
    for (const z of engineColumn) {
      expect(z, `${z}% is outside the observed domain [${lo}, ${hi}]`).toBeGreaterThanOrEqual(lo);
      expect(z).toBeLessThanOrEqual(hi);
    }
  });

  it('never pads the vertical domain to zero, so a loss reads as a loss', () => {
    if (!isProjectedSurface(out)) return;
    // The +50% row is underwater at every price in the sweep's lower half. The domain must
    // reach below zero because the DATA does, not because anything padded it.
    expect(out.observedDomain[0]).toBeLessThan(0);
    expect(out.flat).toBe(false);
  });

  it('labels five distinct prices with five distinct labels', () => {
    if (!isProjectedSurface(out)) return;
    const labels = out.xTicks.map((t) => t.label);
    expect(labels).toHaveLength(5);
    expect(new Set(labels).size, `collapsed price labels: ${labels.join(' ')}`).toBe(5);
    const values = out.xTicks.map((t) => t.value);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('names the API it asked and the engine the heights came from', () => {
    if (!isProjectedSurface(out)) return;
    // Never a database name — the response carries no database identity, and inventing one
    // is the laundering the frame exists to prevent.
    expect(out.frame.environment).toMatch(/^API /);
    expect(out.frame.source).toContain('gps/underwrite.ts');
    expect(out.frame.source).toContain('marginPct');
    expect(out.frame.observedAt).toBe(INPUT.asOf);
    // A snapshot, not a window.
    expect(out.frame.windowFrom).toBeNull();
    expect(out.frame.windowTo).toBeNull();
  });
});

describe('an unquotable price becomes a HOLE, never a zero', () => {
  it('refuses outright when no price can be read', () => {
    /*
     * `marginPct` returns null at a non-positive price — "no price yet" is not "zero
     * margin". At price 0 every cell is null, so there is nothing observed at all and the
     * engine must refuse rather than draw a flat sheet at the height of zero, which is the
     * single most dangerous thing this figure could render: a break-even-looking surface
     * for a quote that has no margin to state.
     */
    const out = buildMarginSurface({ ...INPUT, priceCents: 0 });
    expect(isProjectedSurface(out)).toBe(false);
    if (isProjectedSurface(out)) return;
    expect(out.refusals.length).toBeGreaterThan(0);
    for (const r of out.refusals) {
      expect(r.code, 'a refusal with no code is not a refusal').toBeTruthy();
    }
  });
});
