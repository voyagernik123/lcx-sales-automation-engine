/**
 * THE LP SCORE SURFACE — the grid the ranked list was throwing away.
 *
 * These drive the REAL `buildScorecardSurface`, exported from `CockpitPanels.tsx` for exactly
 * this purpose, rather than a copy of its logic. A test that rebuilds the grid itself asserts
 * its own fixture and keeps passing through any change to the thing it claims to cover.
 *
 * ── WHAT EACH BLOCK DEFENDS ───────────────────────────────────────────────────────
 *  1. REACHABILITY. The surface is mounted in the panel's own JSX, unconditionally on a
 *     loaded response — not behind a control, not after a submission. Read off the source,
 *     because a `render()` of a component whose fetch is mocked passes just as happily when
 *     the figure has been deleted from the tree; that is how the one shipped surface got to
 *     be reachable from nowhere.
 *  2. THE THREE STATES. Absent, withheld and malformed are four different renderings, and an
 *     absent cell is a HOLE — never a zero, never the row's average, never a neighbour.
 *  3. LEGIBILITY, ASSERTED GEOMETRICALLY. Adjacent tick labels must not overlap. A DOM test
 *     cannot see this at all (`textContent` is the full string whatever the geometry does),
 *     which is the whole reason this repo's rule says a passing DOM test proves polygon ORDER
 *     and not legibility. The boxes here are computed from the engine's OWN exported font
 *     metrics and its own projected anchors, so the check cannot drift from what is drawn.
 *  4. THE FRAME. Environment named as the API host, the observation dated, a snapshot rather
 *     than a window, and no placeholder claim this panel cannot observe.
 *
 * NO `waitFor` ANYWHERE: `buildScorecardSurface` is pure and the reachability checks read a
 * file. Nothing is asynchronous, so a barrier would only open a window in which a negative
 * assertion passes against a value that has not been built yet.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isProjectedSurface,
  LABEL_ADVANCE_EM,
  LABEL_FONT_SIZE,
  LABEL_GAP,
  WITHHELD,
  type ProjectedTick,
  type SurfaceGeometry,
} from '@lcx/shared';
import {
  buildScorecardSurface,
  dimToken,
  scorecardCell,
  scorecardCellState,
  scorecardCoverage,
  subjectToken,
  SCORECARD_SCALE_MAX,
  type ScorecardSurfaceInput,
} from '../CockpitPanels';

/*
 * Resolved from the package root, NOT from `import.meta.url`: under jsdom Vite serves modules
 * over http, so `import.meta.url` carries an http scheme and `readFileSync` rejects it outright.
 */
const PANEL_PATH = resolve(process.cwd(), 'src/components/command/CockpitPanels.tsx');
const PANEL_SRC = readFileSync(PANEL_PATH, 'utf8');

/**
 * THE REAL SHAPE OF THE SHIPPED LP SCORECARD: ten dimensions, nine partners, every cell scored.
 *
 * The dimension labels and partner names are the ones in `apps/api/src/seed/command/data2.ts`
 * verbatim, because their LENGTHS are what the legibility block is about — a fixture with tidy
 * short names would pass the overlap check and prove nothing about the figure an operator opens.
 * The scores are a synthetic pattern, deliberately: this file is about the geometry, and copying
 * ninety authored analyst judgements in would make it a second copy of the seed that goes stale.
 */
const DIM_LABELS = [
  'US Reg & Entity',
  'Spot Liquidity (depth/breadth)',
  'OTC Block Desk',
  'Electronic RFQ / Streaming API',
  'Options / Derivatives Flow',
  'Off-Exch Settlement / Custody-at-LCX Fit',
  'Serves Exchanges as an LP',
  'Fiat Settlement Rails',
  'Financial Strength / Backing',
  'Integration / White-label Fit',
] as const;

const SUBJECT_LABELS = [
  'B2C2  (incumbent / baseline)',
  'Cumberland (DRW)',
  'FalconX',
  'Wintermute',
  'Galaxy Digital',
  'GSR',
  'Flowdesk',
  'DV Chain (DV Trading)',
  'Keyrock',
] as const;

const DIMENSIONS = DIM_LABELS.map((label, i) => ({ key: `d${i}`, label }));

/** A ridge on d2 and a trench on d5 — the two facts the ranked list cannot state. */
const score = (subject: number, dim: number): number => {
  if (dim === 2) return 5;
  if (dim === 5) return 2;
  return 3 + ((subject + dim) % 2);
};

function fullRows() {
  return SUBJECT_LABELS.map((subjectLabel, j) => ({
    subjectLabel,
    ordinal: j + 1,
    scores: Object.fromEntries(DIMENSIONS.map((d, i) => [d.key, score(j, i)])) as Record<string, unknown>,
  }));
}

const INPUT: ScorecardSurfaceInput = {
  dimensions: DIMENSIONS,
  rows: fullRows(),
  observedAt: '2026-08-08T09:00:00.000Z',
  source: 'POST /v1/command/engines/lp-rescore → rescoreDetailed().ranked[].scores',
  yLabel: 'Partner, by live rank',
  yUnit: 'rank under the weights set above, #1 best',
};

/** Narrows once so every assertion below reads without a guard. */
function projected(input: ScorecardSurfaceInput): SurfaceGeometry {
  const out = buildScorecardSurface(input);
  if (!isProjectedSurface(out)) {
    throw new Error(`expected a projected surface, got refusals: ${out.refusals.map((r) => r.code).join(', ')}`);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════════ */
/* 1 · REACHABILITY — a capability nobody can reach is not a capability                */
/* ══════════════════════════════════════════════════════════════════════════════════ */

describe('the LP score surface is REACHABLE, not merely built', () => {
  it('is mounted in the optimizer panel’s own JSX', () => {
    // MUTATION OBSERVED: delete the `<LpScoreSurface …>` line from `LpOptimizerPanel` and this
    // fails with `expected '…' to contain '<LpScoreSurface res={res} observedAt={readAt} />'`.
    expect(PANEL_SRC).toContain('<LpScoreSurface res={res} observedAt={readAt} />');
    expect(PANEL_SRC).toMatch(/function LpScoreSurface\(\{ res, observedAt \}/);
  });

  it('renders through SurfacePlot, so a refusal reaches the screen as a refusal', () => {
    // `SurfacePlot` draws a refused outcome as a refusal. A panel that drew the mesh itself
    // would turn a refusal into a blank region — a missing answer that looks like an answer.
    expect(PANEL_SRC).toContain("from '@/components/geometry/SurfacePlot'");
    expect(PANEL_SRC).toContain('<SurfacePlot');
  });

  it('sits beside the ranked list rather than replacing it', () => {
    // The list answers WHO WINS, the surface answers ON WHAT. Deleting either leaves the panel
    // unable to answer a question it could answer before, which is the test for two figures of
    // the same data both earning their space.
    expect(PANEL_SRC).toContain('{r.weighted.toFixed(2)}');
    expect(PANEL_SRC).toContain('<LpScoreSurface');
  });

  it('never dates the figure from the render clock', () => {
    /*
     * The trap: `observedAt: new Date().toISOString()` inside the component satisfies the
     * engine's dating requirement and re-dates the figure on every render — so it reads as
     * freshly observed on a response fetched ten minutes ago, and moves under a reader who
     * changed nothing. The instant is captured in the fetch callback instead.
     */
    expect(PANEL_SRC).toContain('setRes(r); setReadAt(new Date().toISOString());');
    expect(PANEL_SRC).not.toMatch(/observedAt=\{new Date\(\)/);
    expect(PANEL_SRC).not.toMatch(/observedAt:\s*new Date\(\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════ */
/* 2 · THE GRID PROJECTS, AND IT IS THE WHOLE GRID                                     */
/* ══════════════════════════════════════════════════════════════════════════════════ */

describe('buildScorecardSurface projects the real 10 × 9 bench', () => {
  const out = projected(INPUT);

  it('PROJECTS rather than refusing — the anti-vacuity check', () => {
    // Without this every assertion below could be satisfied by a refusal that happened to carry
    // the right shape, and the suite would be green while the panel showed no figure at all.
    expect(isProjectedSurface(buildScorecardSurface(INPUT))).toBe(true);
  });

  it('draws (10-1) × (9-1) = 72 cells, all of them quads', () => {
    expect(out.frame.cellsTotal).toBe(72);
    expect(out.frame.cellsDrawn).toBe(72);
    expect(out.frame.cellsHoles).toBe(0);
    expect(out.frame.pointsObserved).toBe(90);
    expect(out.frame.pointsAbsent).toBe(0);
    expect(out.frame.pointsWithheld).toBe(0);
  });

  it('carries the AUTHORED cell, never the weighted average', () => {
    /*
     * THE WHOLE POINT OF THE LANE, as an assertion. Every height must be a cell the workbook
     * authored. If a future edit reached for `r.weighted` — the collapse this figure exists to
     * undo — every row would be flat and the ridge/trench structure would vanish.
     */
    const heights = new Set<number>();
    for (const q of out.quads) { heights.add(q.zMin); heights.add(q.zMax); }
    expect([...heights].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    expect(out.observedDomain).toEqual([2, 5]);
    expect(out.flat).toBe(false);
  });

  it('holds the ridge and the trench apart — the two facts the list cannot state', () => {
    // d2 is 5 for every partner and d5 is 2 for every partner. In the flat panel both partners
    // and both dimensions are invisible: they are inside one weighted average per row.
    const spanning = (col: number) => out.quads.filter((q) => q.col === col);
    // The ridge cell (col 2 spans dims 2→3) has a maximum at the top of the scale…
    expect(spanning(2).every((q) => q.zMax === 5)).toBe(true);
    // …and the trench (col 4 spans dims 4→5, col 5 spans 5→6) bottoms out at the floor of it.
    expect(spanning(4).every((q) => q.zMin === 2)).toBe(true);
    expect(spanning(5).every((q) => q.zMin === 2)).toBe(true);
  });

  it('orders y by rank, so the surface and the ranked list agree by construction', () => {
    const values = out.yTicks.map((t) => t.value);
    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(out.yTicks.map((t) => t.label)).toEqual(values.map(subjectToken));

    // And it holds when the caller hands them over shuffled — the builder sorts rather than
    // trusting the response's order, so a route that stopped sorting cannot fold the mesh.
    const shuffled = projected({ ...INPUT, rows: [...INPUT.rows].reverse() });
    expect(shuffled.yTicks.map((t) => t.value)).toEqual(values);
  });

  it('keeps the x axis in AUTHORED order, so the figure does not breathe when a weight moves', () => {
    // The heights are scores and a weight is an opinion about scores. Ordering x by live weight
    // would make the ridge migrate across the floor for a reason that is not in the data.
    expect(out.xTicks.map((t) => t.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(out.xTicks.map((t) => t.label)).toEqual(DIMENSIONS.map((_, i) => dimToken(i)));
  });

  it('refuses a duplicated rank rather than folding the sheet', () => {
    const rows = fullRows();
    rows[3] = { ...rows[3], ordinal: rows[2].ordinal };
    const out2 = buildScorecardSurface({ ...INPUT, rows });
    expect(isProjectedSurface(out2)).toBe(false);
    if (isProjectedSurface(out2)) return;
    expect(out2.refusals.map((r) => r.code)).toContain('GEOMETRY_AXIS_DEGENERATE');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════ */
/* 3 · THREE STATES, NEVER COLLAPSED                                                   */
/* ══════════════════════════════════════════════════════════════════════════════════ */

describe('an unscored dimension is a HOLE, and the three states stay apart', () => {
  it('reads the four runtime conditions of a cell', () => {
    expect(scorecardCellState({}, 'd0')).toBe('absent');
    expect(scorecardCellState({ d0: null }, 'd0')).toBe('withheld');
    expect(scorecardCellState({ d0: undefined }, 'd0')).toBe('withheld');
    expect(scorecardCellState({ d0: 'high' }, 'd0')).toBe('malformed');
    expect(scorecardCellState({ d0: NaN }, 'd0')).toBe('malformed');
    expect(scorecardCellState({ d0: Infinity }, 'd0')).toBe('malformed');
    expect(scorecardCellState({ d0: 4 }, 'd0')).toBe('scored');
    // THE HALF EVERYONE FORGETS: a genuine 0 is a measurement, not an absence.
    expect(scorecardCellState({ d0: 0 }, 'd0')).toBe('scored');
    expect(scorecardCell({ d0: 0 }, 'd0')).toBe(0);
  });

  it('never turns an absence into a zero', () => {
    // MUTATION OBSERVED: change `scorecardCell`'s absent branch to `return 0` and this fails
    // with `expected 0 to be null`, and the hole assertions two tests down fail with
    // `expected 0 to be greater than 0` on cellsHoles.
    expect(scorecardCell({}, 'd0')).toBeNull();
    expect(scorecardCell({ d0: null }, 'd0')).toBe(WITHHELD);
    expect(scorecardCell({ d0: 'high' }, 'd0')).toBeNull();
  });

  it('leaves a hole where a partner was never scored on a dimension, and does not smooth it', () => {
    const rows = fullRows();
    const scores = { ...rows[4].scores };
    delete scores.d7;
    rows[4] = { ...rows[4], scores };

    const out = projected({ ...INPUT, rows });
    expect(out.frame.pointsAbsent).toBe(1);
    expect(out.frame.pointsWithheld).toBe(0);
    expect(out.frame.pointsObserved).toBe(89);

    // One missing CORNER kills the four cells that share it — no interpolation, by policy.
    expect(out.frame.cellsHoles).toBe(4);
    expect(out.frame.cellsDrawn).toBe(68);
    expect(out.holes).toHaveLength(4);
    for (const h of out.holes) {
      expect(h.col === 6 || h.col === 7).toBe(true);
      expect(h.row === 3 || h.row === 4).toBe(true);
    }

    // And the absence never becomes a height: the observed domain is unchanged, so nothing
    // was substituted for the missing cell — not a zero and not the row's mean.
    expect(out.observedDomain).toEqual([2, 5]);
    expect(out.notices.map((n) => n.code)).toContain('HOLES_PRESENT');
  });

  it('keeps WITHHELD apart from never-measured, in the counts and in the notices', () => {
    const rows = fullRows();
    const scoresA = { ...rows[1].scores }; delete scoresA.d3;
    rows[1] = { ...rows[1], scores: scoresA };
    rows[2] = { ...rows[2], scores: { ...rows[2].scores, d3: null } };

    const out = projected({ ...INPUT, rows });
    // Two absences would be the collapse. One of each is the point.
    expect(out.frame.pointsAbsent).toBe(1);
    expect(out.frame.pointsWithheld).toBe(1);
    const codes = out.notices.map((n) => n.code);
    expect(codes).toContain('HOLES_PRESENT');
    expect(codes).toContain('CELLS_WITHHELD');
  });

  it('refuses outright when not one cell was ever scored', () => {
    // The dangerous alternative is a flat sheet at zero: a bench that looks uniformly assessed
    // and uniformly bad, drawn from nothing at all.
    const rows = fullRows().map((r) => ({ ...r, scores: {} }));
    const out = buildScorecardSurface({ ...INPUT, rows });
    expect(isProjectedSurface(out)).toBe(false);
    if (isProjectedSurface(out)) return;
    expect(out.refusals.map((r) => r.code)).toContain('GEOMETRY_ALL_CELLS_ABSENT');
    for (const r of out.refusals) expect(r.code, 'a refusal with no code is not a refusal').toBeTruthy();
  });

  it('gives an all-withheld grid its own code, not the absence one', () => {
    const rows = fullRows().map((r) => ({
      ...r,
      scores: Object.fromEntries(DIMENSIONS.map((d) => [d.key, null])) as Record<string, unknown>,
    }));
    const out = buildScorecardSurface({ ...INPUT, rows });
    expect(isProjectedSurface(out)).toBe(false);
    if (isProjectedSurface(out)) return;
    expect(out.refusals.map((r) => r.code)).toContain('GEOMETRY_ALL_CELLS_WITHHELD');
    expect(out.refusals.map((r) => r.code)).not.toContain('GEOMETRY_ALL_CELLS_ABSENT');
  });

  it('counts the four states for the caption without merging any pair of them', () => {
    const rows = fullRows();
    const a = { ...rows[0].scores }; delete a.d0;
    rows[0] = { ...rows[0], scores: a };
    rows[1] = { ...rows[1], scores: { ...rows[1].scores, d0: null } };
    rows[2] = { ...rows[2], scores: { ...rows[2].scores, d0: 'high' } };
    expect(scorecardCoverage({ ...INPUT, rows })).toEqual({
      scored: 87, absent: 1, withheld: 1, malformed: 1,
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════ */
/* 4 · LEGIBILITY, ASSERTED AS GEOMETRY                                                */
/* ══════════════════════════════════════════════════════════════════════════════════ */

/**
 * The label box the RENDERER will draw, computed from the engine's own exported metrics.
 *
 * `SurfacePlot` is asserted elsewhere to use exactly `LABEL_FONT_SIZE`, and the advance and gap
 * come from the same module the viewBox padding uses — so this is the drawn box, not an
 * approximation of it.
 */
function labelBox(t: ProjectedTick, outward: { dx: number; dy: number }) {
  const len = Math.hypot(outward.dx, outward.dy) || 1;
  const w = t.label.length * LABEL_FONT_SIZE * LABEL_ADVANCE_EM;
  const h = LABEL_FONT_SIZE;
  const cx = t.at.sx + (outward.dx / len) * (w / 2 + LABEL_GAP);
  const cy = t.at.sy + (outward.dy / len) * (h / 2 + LABEL_GAP);
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, label: t.label };
}

function worstOverlap(ticks: readonly ProjectedTick[], outward: { dx: number; dy: number }) {
  const boxes = ticks.map((t) => labelBox(t, outward));
  let worst = { overlap: -Infinity, a: '', b: '' };
  for (let i = 1; i < boxes.length; i++) {
    const p = boxes[i - 1];
    const q = boxes[i];
    const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
    const oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    // Two axis-aligned boxes intersect only when they overlap on BOTH axes.
    const overlap = Math.min(ox, oy);
    if (overlap > worst.overlap) worst = { overlap, a: p.label, b: q.label };
  }
  return worst;
}

/** How much of the viewBox the DRAWN SHEET gets, once the label furniture has taken its room. */
function sheetWidthFraction(g: SurfaceGeometry) {
  const pts = g.cells.flatMap((c) => (c.kind === 'quad' ? [...c.corners] : [...c.footprint]));
  const xs = pts.map((p) => p.sx);
  return (Math.max(...xs) - Math.min(...xs)) / g.viewBox.width;
}

describe('the axis labels are legible, which no DOM assertion can see', () => {
  const out = projected(INPUT);

  it('leaves the SHEET most of the viewBox instead of a fan of axis text', () => {
    /*
     * THIS IS THE CHECK THAT ACTUALLY BINDS ON THE LABEL CHOICE, and finding that out cost a
     * wrong comment in the first draft of this file.
     *
     * The engine pads the viewBox by each label's own text box, so long tick labels do not
     * collide — they push the viewBox outward and CRUSH the figure inside it. Measured on this
     * exact 10 × 9 fixture at the shipped box:
     *
     *   tick labels           sheet width / viewBox width
     *   D1…D10, #1…#9                    0.8869
     *   the full authored labels         0.5798   ← the surface renders at 65% of its size,
     *                                               the other third being axis text
     *
     * MUTATION OBSERVED: swap `dimToken(i)` for `d.label` and `subjectToken` for `r.subjectLabel`
     * on the two plan axes and this fails with `the sheet has been squeezed into 58.0% of the
     * viewBox by axis labels: expected 0.5798... to be greater than 0.75`.
     *
     * The threshold has resolution rather than being a rubber stamp: padding the tokens to 12
     * characters measures 0.7359 and fails too.
     */
    const frac = sheetWidthFraction(out);
    expect(frac, `the sheet has been squeezed into ${(frac * 100).toFixed(1)}% of the viewBox by axis labels`)
      .toBeGreaterThan(0.75);
  });

  it('leaves no two adjacent tick labels intersecting on either plan axis', () => {
    /*
     * WHAT THIS DOES *NOT* CATCH, said plainly, because the first draft of this file claimed it
     * was the guard on the token scheme and it is not.
     *
     * A label is pushed outward by half its OWN width, so widening one moves its centre out by
     * roughly the amount its half-width grows and adjacent boxes never actually converge to zero.
     * Re-measured on the shipped 10 × 9 bench at `SCORECARD_BOX`, because the first draft of this
     * comment quoted ONE column of the table as if it were both and then drew a conclusion from
     * it — the gaps do move with label length, they just never close:
     *
     *   tick labels                 worst adjacent gap, x      y
     *   D1…D10 / #1…#9                        3.10          6.71
     *   the full authored labels              1.99          2.74
     *
     * So this check is NOT the guard on the token scheme (the sheet-fraction check above is), and
     * it is not "blind to label length by construction" as the first draft claimed — it is merely
     * a long way from firing on either choice. Note the 3.10 is the same number `SCORECARD_BOX`'s
     * own comment quotes for the shipped box, which is the pair that should agree and did not.
     *
     * It is kept because it binds on the two things that close the gap fastest: tick DENSITY and
     * the projection box. Adding partners to the bench or shrinking `SCORECARD_BOX` reduces the
     * vertical stagger between adjacent anchors toward `LABEL_FONT_SIZE`, and at that point the
     * boxes really do intersect. On the shipped tokens the headroom is 3.10 units of a 4-unit
     * line, which is the number a future edit is spending.
     */
    const x = worstOverlap(out.xTicks, out.xTickOutward);
    expect(x.overlap, `x labels "${x.a}" / "${x.b}" intersect by ${x.overlap.toFixed(2)} units`).toBeLessThan(0);
    const y = worstOverlap(out.yTicks, out.yTickOutward);
    expect(y.overlap, `y labels "${y.a}" / "${y.b}" intersect by ${y.overlap.toFixed(2)} units`).toBeLessThan(0);
  });

  it('does not print the vertical axis ON TOP of the first plan tick', () => {
    /*
     * THE DEFECT THIS FILE SHIPPED WITH, found by rendering to PNG and reading it — no assertion
     * in this suite could see it, because both labels are perfectly good DOM nodes with their
     * full `textContent`, and the two checks above only ever compare ticks to OTHER TICKS ON THE
     * SAME AXIS.
     *
     * `buildSurfaceMesh` stands the vertical axis on the LEFTMOST floor corner and runs the y
     * ticks along a whole floor edge that ends at that corner, so the bottom z tick and the
     * first y tick project to the SAME POINT — measured at (-93.34, 53.89) on the shipped bench —
     * and `SurfacePlot` draws both right-aligned two units to its left. The rendered figure
     * printed `0#01`: `0.0` and `#1` on top of each other, destroying the label of the
     * top-ranked partner.
     *
     * MUTATION OBSERVED: restore `formatTick: (v) => v.toFixed(1)` and drop `tickCount`, and this
     * fails with `z label "0.0" lands on plan label "#1", intersecting by 2.00 units: expected 2
     * to be less than 0`.
     *
     * It is a caller-side workaround (the floor tick keeps its mark and loses its text) because
     * the fix belongs in the renderer's tick offsets, which this lane may not edit. Sweeping every
     * legal whole azimuth showed the two boxes intersect at all of them — worst +3.96, best exactly
     * 0.00, never separating — so no choice of `view` was available to this caller either.
     */
    const zb = out.zTicks.map((t) => labelBox(t, { dx: -1, dy: 0 })).filter((b) => b.label !== '');
    const plan = [
      ...out.xTicks.map((t) => labelBox(t, out.xTickOutward)),
      ...out.yTicks.map((t) => labelBox(t, out.yTickOutward)),
    ];
    let worst = { overlap: -Infinity, a: '', b: '' };
    for (const z of zb) {
      for (const p of plan) {
        const ox = Math.min(z.x1, p.x1) - Math.max(z.x0, p.x0);
        const oy = Math.min(z.y1, p.y1) - Math.max(z.y0, p.y0);
        const overlap = Math.min(ox, oy);
        if (overlap > worst.overlap) worst = { overlap, a: z.label, b: p.label };
      }
    }
    expect(
      worst.overlap,
      `z label "${worst.a}" lands on plan label "${worst.b}", intersecting by ${worst.overlap.toFixed(2)} units`,
    ).toBeLessThan(0);
  });

  it('still states a scale on the vertical axis, including the top of its own box', () => {
    /*
     * The other half of the fix, and the reason it is not just "delete a label". Suppressing the
     * floor label on the DEFAULT tick count would have left an axis reading `2.0` and `4.0` — two
     * labels over a 0–5 domain, with the top of the box unnamed. `valueAxisTicks`'s own comment
     * calls a thin axis out as the defect that shipped on the GPS surface. Ticks now land on every
     * integer point of the workbook scale.
     */
    const labels = out.zTicks.map((t) => t.label);
    expect(labels).toEqual(['', '1.0', '2.0', '3.0', '4.0', '5.0']);
    expect(labels.filter((l) => l !== '').length).toBeGreaterThanOrEqual(4);
    // The floor value is never merely dropped: the frame prints it in words under every figure.
    expect(out.zDomain).toEqual([0, SCORECARD_SCALE_MAX]);
    expect(out.notices.map((n) => n.code)).toContain('Z_DOMAIN_EXCLUDES_ZERO');
  });

  it('reserves viewBox room for every label instead of clipping it', () => {
    // The engine pads the viewBox by each label's own box. Assert the widest one fits, because
    // a clipped label reads as a DIFFERENT label ("baseline" → "line" on the GPS surface) and
    // `textContent` is the full string either way.
    const all = [
      ...out.xTicks.map((t) => labelBox(t, out.xTickOutward)),
      ...out.yTicks.map((t) => labelBox(t, out.yTickOutward)),
      ...out.zTicks.map((t) => labelBox(t, { dx: -1, dy: 0 })),
    ];
    const vb = out.viewBox;
    for (const b of all) {
      expect(b.x0, `"${b.label}" is clipped at the left edge`).toBeGreaterThanOrEqual(vb.minX);
      expect(b.x1, `"${b.label}" is clipped at the right edge`).toBeLessThanOrEqual(vb.minX + vb.width);
      expect(b.y0, `"${b.label}" is clipped at the top`).toBeGreaterThanOrEqual(vb.minY);
      expect(b.y1, `"${b.label}" is clipped at the bottom`).toBeLessThanOrEqual(vb.minY + vb.height);
    }
  });

  it('prints the full labels in a legend, so no token is unresolvable', () => {
    // A token with no key is worse than a collided label. The legend is part of the figure.
    expect(PANEL_SRC).toContain('data-testid="lp-surface-legend"');
    expect(PANEL_SRC).toContain('{dimToken(i)}</span> {d.label}');
    expect(PANEL_SRC).toContain('{subjectToken(r.rank)}</span> {r.subjectLabel}');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════ */
/* 5 · THE FRAME — a figure that will not say where it came from does not draw          */
/* ══════════════════════════════════════════════════════════════════════════════════ */

describe('the frame names the environment, the date and the engine', () => {
  const out = projected(INPUT);

  it('names the API it asked, never a database it cannot see', () => {
    expect(out.frame.environment).toMatch(/^API /);
    expect(out.frame.observedAt).toBe(INPUT.observedAt);
    expect(out.frame.source).toContain('lp-rescore');
    // A snapshot at one instant, not a window over one.
    expect(out.frame.windowFrom).toBeNull();
    expect(out.frame.windowTo).toBeNull();
  });

  it('refuses an undated figure rather than drawing it', () => {
    const out2 = buildScorecardSurface({ ...INPUT, observedAt: '' });
    expect(isProjectedSurface(out2)).toBe(false);
    if (isProjectedSurface(out2)) return;
    expect(out2.refusals.map((r) => r.code)).toContain('GEOMETRY_OBSERVATION_NOT_DATED');
  });

  it('claims no placeholder grade it cannot observe', () => {
    /*
     * These cells are authored analyst judgements and no server flag says otherwise, so the
     * panel passes no flag at all. A literal `true` would hatch a figure whose values are real;
     * a literal `false` would be this panel asserting a grade it has no field for. The GPS
     * surface threads a server field precisely because one exists there.
     */
    expect(out.frame.valuesArePlaceholders).toBe(false);
    expect(PANEL_SRC).not.toMatch(/valuesArePlaceholders:\s*(true|false)\b/);
  });

  it('holds the vertical axis on the workbook scale the panel already uses', () => {
    // The bar beside it is `(r.weighted / 5) * 100`. One scale, so the two cannot disagree and
    // the figure's shape does not change when the ranking does.
    expect(SCORECARD_SCALE_MAX).toBe(5);
    expect(out.zDomain).toEqual([0, SCORECARD_SCALE_MAX]);
    expect(out.notices.map((n) => n.code)).toContain('Z_DOMAIN_OVERRIDDEN');
    // The OBSERVED range is still reported separately, so the override cannot hide the data.
    expect(out.observedDomain).toEqual([2, 5]);
  });

  it('carries the interpolation policy and the ruleset version onto the figure', () => {
    expect(out.frame.interpolation).toContain('No interpolation');
    expect(out.frame.ruleSetVersion).toBeGreaterThanOrEqual(3);
  });
});
