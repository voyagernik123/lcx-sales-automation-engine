/**
 * The geometry is deterministic, so these tests assert COORDINATES. Nothing here renders,
 * nothing here looks at a picture, and the paint-order tests compare projected depths rather
 * than eyeballing a screenshot — which is the only reason an ordering bug can be caught
 * before an operator reads an inside-out surface as a commercial fact.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOX,
  DEFAULT_VIEW,
  GEOMETRY_REFUSAL_CODES,
  GEOMETRY_RULESET_VERSION,
  INTERPOLATION_POLICY,
  ISOMETRIC_ELEVATION_DEG,
  WITHHELD,
  buildSurfaceMesh,
  describeProjection,
  footprintDepth,
  isDegenerateView,
  isGeometryRefusalCode,
  isProjectedSurface,
  isUsableBox,
  project,
  valueAxisTicks,
  type GeometryRefusalCode,
  type ProjectedPoint,
  type SurfaceGridInput,
  type SurfaceQuad,
} from './index.js';

/* ── Independent geometry the assertions need, re-derived rather than imported ──── */

/**
 * Point strictly inside a screen polygon, by ray cast against the polygon SHRUNK about its
 * centroid by one part in a million.
 *
 * The shrink is not a fudge, it is the definition being tested. Ticks legitimately land ON the
 * silhouette — the vertical axis stands at a floor corner, and its top tick coincides exactly
 * with a sheet corner whenever the tallest observed cell is at that corner — and a bare ray
 * cast answers "inside" or "outside" arbitrarily for a point sitting on a vertex. What the
 * assertion means is "not in the INTERIOR of the sheet", and shrinking the polygon says exactly
 * that. The labels the old anchoring produced were deep inside their quads (tens of units from
 * any edge), so a 1e-6 contraction costs the test no sensitivity — verified by mutation against
 * a build with the old hard-coded (xLo, yLo) anchor, which this still catches.
 */
function strictlyInside(p: { sx: number; sy: number }, poly: readonly ProjectedPoint[]): boolean {
  const cx = poly.reduce((s, q) => s + q.sx, 0) / poly.length;
  const cy = poly.reduce((s, q) => s + q.sy, 0) / poly.length;
  const k = 1 - 1e-6;
  const shrunk = poly.map((q) => ({ sx: cx + (q.sx - cx) * k, sy: cy + (q.sy - cy) * k }));
  let hits = 0;
  for (let i = 0, j = shrunk.length - 1; i < shrunk.length; j = i++) {
    const a = shrunk[i];
    const b = shrunk[j];
    if ((a.sy > p.sy) !== (b.sy > p.sy)) {
      const x = a.sx + ((p.sy - a.sy) / (b.sy - a.sy)) * (b.sx - a.sx);
      if (p.sx < x) hits++;
    }
  }
  return hits % 2 === 1;
}

/**
 * THE PAINT ORDER, RE-DERIVED FROM THE INPUT WITHOUT ASKING THE ENGINE FOR IT.
 *
 * `mapTo` is replicated bit-for-bit on purpose: the claim under test is the SORT (which key,
 * which direction, which tie behaviour), and a re-derivation that computed the centroid by a
 * different-but-equivalent expression would differ from the engine's by float noise and make
 * the tied cells at the default azimuth flaky. This is why the assertion below can be exact.
 */
function derivedPaintOrder(input: SurfaceGridInput): readonly string[] {
  const view = input.view ?? DEFAULT_VIEW;
  const box = input.box ?? DEFAULT_BOX;
  const xs = input.xAxis.ticks;
  const ys = input.yAxis.ticks;
  const map = (v: number, lo: number, hi: number, span: number) =>
    (hi === lo ? span / 2 : ((v - lo) / (hi - lo)) * span);
  const bx = (v: number) => map(v, xs[0].value, xs[xs.length - 1].value, box.width);
  const by = (v: number) => map(v, ys[0].value, ys[ys.length - 1].value, box.depth);
  const keyed: { id: string; key: number; gridIndex: number }[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (bx(xs[i].value) + bx(xs[i + 1].value)) / 2;
      const cy = (by(ys[j].value) + by(ys[j + 1].value)) / 2;
      keyed.push({ id: `${i},${j}`, key: footprintDepth(cx, cy, view), gridIndex: keyed.length });
    }
  }
  return [...keyed]
    .sort((a, b) => (a.key === b.key ? a.gridIndex - b.gridIndex : a.key - b.key))
    .map((e) => e.id);
}

/* ── Fixtures. GPS margin over (price band, effort hours) — the worked example. ── */

const FRAME = {
  environment: 'test:fixture',
  observedAt: '2026-08-07T00:00:00.000Z',
  windowFrom: '2026-01-01',
  windowTo: '2026-08-07',
  source: 'geometry.test.ts fixture',
} as const;

function grid(rows: SurfaceGridInput['rows'], over: Partial<SurfaceGridInput> = {}): SurfaceGridInput {
  // A 3×3 default. An EMPTY grid keeps its 3×3 axes on purpose: the point of the empty-grid
  // test is to isolate `GEOMETRY_GRID_EMPTY`, and shrinking the axes with it would drag a
  // second (correct, but unrelated) `GEOMETRY_AXIS_DEGENERATE` into the assertion.
  const cols = rows && rows.length > 0 && rows[0].length > 0 ? rows[0].length : 3;
  const rowCount = rows && rows.length > 0 ? rows.length : 3;
  return {
    rows,
    xAxis: {
      label: 'Price',
      unit: 'USD',
      ticks: Array.from({ length: cols }, (_, i) => ({ value: 10000 + i * 5000, label: `$${10000 + i * 5000}` })),
    },
    yAxis: {
      label: 'Effort',
      unit: 'hours',
      ticks: Array.from({ length: rowCount }, (_, j) => ({ value: 40 + j * 20, label: `${40 + j * 20}h` })),
    },
    zAxis: { label: 'Margin', unit: 'USD' },
    frame: FRAME,
    ...over,
  };
}

const FULL: readonly (readonly (number | null)[])[] = [
  [1000, 3000, 6000],
  [500, 2000, 5000],
  [-500, 900, 4000],
];

function ok(input: SurfaceGridInput) {
  const out = buildSurfaceMesh(input);
  if (!isProjectedSurface(out)) {
    throw new Error(`expected a surface, got refusals: ${out.refusals.map((r) => r.code).join(', ')}`);
  }
  return out;
}

function codes(input: SurfaceGridInput): readonly GeometryRefusalCode[] {
  const out = buildSurfaceMesh(input);
  if (isProjectedSurface(out)) throw new Error('expected refusals, got a surface');
  return out.refusals.map((r) => r.code);
}

/* ══════════════════════════════════════════════════════════════════════════════ */

describe('projection', () => {
  it('is deterministic and matches the derived axonometric formula', () => {
    // az=45°, el=isometric. sx = (-x+y)/√2 ; sy = (x+y)·sinEl/√2 − z·cosEl.
    const p = project({ x: 3, y: 5, z: 7 }, DEFAULT_VIEW);
    const s = Math.SQRT1_2;
    const el = (ISOMETRIC_ELEVATION_DEG * Math.PI) / 180;
    expect(p.sx).toBeCloseTo((-3 + 5) * s, 12);
    expect(p.sy).toBeCloseTo((3 + 5) * s * Math.sin(el) - 7 * Math.cos(el), 12);
    // Same input, same output — twice, because "deterministic" is the claim being made.
    expect(project({ x: 3, y: 5, z: 7 }, DEFAULT_VIEW)).toEqual(p);
  });

  it('sends increasing z UPWARD on screen (SVG y grows downward)', () => {
    const low = project({ x: 0, y: 0, z: 0 });
    const high = project({ x: 0, y: 0, z: 10 });
    expect(high.sy).toBeLessThan(low.sy);
    expect(high.depth).toBeGreaterThan(low.depth);
  });

  it('scales uniformly — orthographic, no perspective', () => {
    const a = project({ x: 2, y: 3, z: 4 }, { ...DEFAULT_VIEW, scale: 1 });
    const b = project({ x: 2, y: 3, z: 4 }, { ...DEFAULT_VIEW, scale: 3 });
    expect(b.sx).toBeCloseTo(a.sx * 3, 12);
    expect(b.sy).toBeCloseTo(a.sy * 3, 12);
    // Depth is NOT scaled: it is an ordering key, not a screen length.
    expect(b.depth).toBeCloseTo(a.depth, 12);
  });

  it('ISOMETRIC_ELEVATION_DEG is atan(1/√2), the true-isometric elevation', () => {
    expect(ISOMETRIC_ELEVATION_DEG).toBeCloseTo(35.264389682754654, 9);
  });

  it('footprintDepth EXCLUDES z — the correctness condition of the paint order', () => {
    // Two cells with the same footprint and wildly different heights must be indistinguishable
    // to the sort key. If z leaked in, a tall far peak would sort as near and paint over the
    // ridge in front of it.
    expect(footprintDepth(4, 6)).toBeCloseTo(footprintDepth(4, 6), 12);
    const near = footprintDepth(90, 90);
    const far = footprintDepth(10, 10);
    expect(near).toBeGreaterThan(far);
    // And the full 3-D depth of the FAR point with a huge z beats the near one — which is
    // exactly the inversion `footprintDepth` exists to avoid.
    expect(project({ x: 10, y: 10, z: 400 }).depth).toBeGreaterThan(project({ x: 90, y: 90, z: 0 }).depth);
  });

  it('names degenerate views: plan view, edge-on, and right-angle azimuths', () => {
    expect(isDegenerateView({ azimuthDeg: 45, elevationDeg: 90, scale: 1 })).toBe(true);
    expect(isDegenerateView({ azimuthDeg: 45, elevationDeg: 0, scale: 1 })).toBe(true);
    expect(isDegenerateView({ azimuthDeg: 90, elevationDeg: 30, scale: 1 })).toBe(true);
    expect(isDegenerateView({ azimuthDeg: 180, elevationDeg: 30, scale: 1 })).toBe(true);
    expect(isDegenerateView({ azimuthDeg: 45, elevationDeg: 30, scale: 0 })).toBe(true);
    expect(isDegenerateView({ azimuthDeg: 45, elevationDeg: Number.NaN, scale: 1 })).toBe(true);
    expect(isDegenerateView(DEFAULT_VIEW)).toBe(false);
  });

  it('describeProjection states the parameters and calls the exaggeration a choice', () => {
    const s = describeProjection(DEFAULT_VIEW, DEFAULT_BOX);
    expect(s).toMatch(/azimuth 45°/);
    expect(s).toMatch(/elevation 35\.3°/);
    expect(s).toMatch(/0\.62× the plan width/);
    expect(s).toMatch(/CHOICE/);
    expect(s).toMatch(/no perspective/);
  });

  it('isUsableBox rejects a zero or non-finite extent', () => {
    expect(isUsableBox(DEFAULT_BOX)).toBe(true);
    expect(isUsableBox({ width: 0, depth: 10, height: 10 })).toBe(false);
    expect(isUsableBox({ width: 10, depth: 10, height: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('value axis ticks', () => {
  it('does not assume the domain starts at zero — margin goes negative', () => {
    // The 2-D kit's `niceTicks` always begins at 0, which on a loss-making margin axis would
    // put the FLOOR of the box at break-even and hide every cell below it.
    const loss = valueAxisTicks(-5000, -1000, 4);
    expect(loss.length).toBeGreaterThan(1);
    expect(loss.every((v) => v < 0)).toBe(true);
    // Ticks stay INSIDE the domain: one outside it would be drawn off the box.
    for (const [min, max] of [[-500, 6000], [-5000, -1000], [0.02, 0.09]] as const) {
      for (const v of valueAxisTicks(min, max, 4)) {
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
      }
    }
  });

  it('returns a single tick for a flat domain and nothing for a non-finite one', () => {
    expect(valueAxisTicks(7, 7)).toEqual([7]);
    expect(valueAxisTicks(Number.NaN, 3)).toEqual([]);
  });

  it('survives the ends of the double range instead of emitting Infinity or duplicates', () => {
    /*
     * `round(v, 9)` computed `v * 1e9`, which OVERFLOWS at 5e307 and UNDERFLOWS at 1e-320. Both
     * shipped: `valueAxisTicks(-500, 1e308, 4)` returned [-0, Infinity, Infinity] and put the
     * literal text "Infinity" on a vertical axis, and a subnormal domain returned three ticks at
     * one value — which would have broken this module's own "no two ticks coincide" assertion.
     */
    const huge = valueAxisTicks(-500, 1e308, 4);
    expect(huge.every((v) => Number.isFinite(v))).toBe(true);
    expect(new Set(huge).size).toBe(huge.length);
    for (const v of huge) {
      expect(v).toBeGreaterThanOrEqual(-500);
      expect(v).toBeLessThanOrEqual(1e308);
    }
    const tiny = valueAxisTicks(0, 1e-320, 4);
    expect(new Set(tiny).size).toBe(tiny.length);
    for (const v of tiny) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1e-320);
    }
    // An inverted domain has no axis, and it returns [] rather than looping on a negative step.
    expect(valueAxisTicks(100, 0, 4)).toEqual([]);
  });

  it('emits 0, never -0, for the zero tick', () => {
    // `-0` renders as the string "-0" on an axis label, which reads as a distinct value.
    for (const t of [valueAxisTicks(-500, 6000, 4), valueAxisTicks(0, 100, 4), valueAxisTicks(-500, 1e308, 4)]) {
      for (const v of t) expect(Object.is(v, -0)).toBe(false);
    }
    expect(valueAxisTicks(-500, 6000, 4)).toContain(0);
  });
});

describe('paint order', () => {
  it('is back-to-front: every cell is nearer than the one painted before it', () => {
    const g = ok(grid(FULL));
    expect(g.cells.length).toBe(4);
    for (let i = 1; i < g.cells.length; i++) {
      expect(g.cells[i].paintDepth).toBeGreaterThanOrEqual(g.cells[i - 1].paintDepth);
    }
    // And the LAST cell painted is the one whose footprint centroid is genuinely nearest.
    const maxDepth = Math.max(...g.cells.map((c) => c.paintDepth));
    expect(g.cells[g.cells.length - 1].paintDepth).toBe(maxDepth);
  });

  it('re-orders when the azimuth moves, because paint order is a fact about the view', () => {
    const front = ok(grid(FULL)).cells.map((c) => `${c.col},${c.row}`);
    const behind = ok(grid(FULL, { view: { ...DEFAULT_VIEW, azimuthDeg: 225 } })).cells.map((c) => `${c.col},${c.row}`);
    expect(behind).toEqual([...front].reverse());
    // The whole-list reversal is partly the anti-diagonal TIE flipping, which is float noise and
    // proves nothing about occlusion. The load-bearing part is the EXTREMES swapping: the cell
    // painted first at azimuth 45 is the cell painted last at 225.
    expect(front[0]).toBe('0,0');
    expect(front[front.length - 1]).toBe('1,1');
    expect(behind[0]).toBe('1,1');
    expect(behind[behind.length - 1]).toBe('0,0');
  });

  it('does not let a tall far cell jump to the front — asserted under a TALL box', () => {
    /*
     * THIS IS THE TEST THAT WOULD FAIL IF z LEAKED INTO THE SORT KEY, and the reason it uses a
     * 400-unit box is that the obvious version does NOT fail. A 9,000,000 spike at the far
     * corner proves nothing: `bz()` normalises z into `box.height` BEFORE projection, so at the
     * default height of 62 that spike contributes 8.95 of depth against a 28.87 footprint
     * separation and a full-3-D sort key still puts the far cell first. Verified by mutation —
     * a build of index.ts whose only change was sorting by the 3-D centroid depth passed the
     * spike test. `box.height` is the documented exaggeration knob and 400 is a legal caller
     * choice, which is exactly where the bug becomes visible.
     *
     * The grid is 4×4 so the far cell (0,0) and the near cell (2,2) share NO corner: the far
     * block sits at the top of the domain and the near block at the bottom.
     */
    const cliff: readonly (readonly (number | null)[])[] = [
      [1000, 1000, 500, 500],
      [1000, 1000, 500, 500],
      [500, 500, 0, 0],
      [500, 500, 0, 0],
    ];
    const tall = { box: { width: 100, depth: 100, height: 400 } };
    const g = ok(grid(cliff, tall));
    const order = g.cells.map((c) => `${c.col},${c.row}`);
    // Measured against the 3-D-key mutant, this same input yields ['2,2', …, '0,0'] — exactly
    // inverted. Both ends are asserted so either half of that inversion fails the test.
    expect(order[0]).toBe('0,0');
    expect(order[order.length - 1]).toBe('2,2');
    expect(order.indexOf('0,0')).toBeLessThan(order.indexOf('2,2'));
    // And the far cell really is the tall one, so the inversion the mutant produces is the
    // occlusion bug and not some other reordering.
    const far = g.quads.find((q) => q.col === 0 && q.row === 0) as SurfaceQuad;
    const near = g.quads.find((q) => q.col === 2 && q.row === 2) as SurfaceQuad;
    expect(far.zMean).toBe(1000);
    expect(near.zMean).toBe(0);
    expect(far.paintDepth).toBeLessThan(near.paintDepth);
  });

  it('matches an independently re-derived stable sort of the footprint key, box and all', () => {
    // Re-derived from the input rather than compared against a hand-written list, so a changed
    // key is caught even on a grid where the wrong order happens to look plausible.
    for (const over of [
      {},
      { view: { ...DEFAULT_VIEW, azimuthDeg: 225 } },
      { view: { ...DEFAULT_VIEW, azimuthDeg: 10 } },
      { box: { width: 100, depth: 100, height: 400 } },
      { box: { width: 40, depth: 220, height: 9 } },
    ] as const) {
      const input = grid(FULL, over);
      expect(ok(input).cells.map((c) => `${c.col},${c.row}`)).toEqual(derivedPaintOrder(input));
    }
  });

  it('leaves the exactly-tied anti-diagonal pair in whichever order the key produces', () => {
    /*
     * At the SHIPPED DEFAULT azimuth of 45° the anti-diagonal cells are equidistant in exact
     * arithmetic, and the order between them is decided by the ~1e-16 gap between
     * `Math.cos(π/4)` and `Math.sin(π/4)` — not by the stable sort keeping grid order, which
     * the module used to claim. That is fine, and the reason is geometric: equidistant
     * footprints are disjoint, so they cannot overlap on screen and either order draws the same
     * picture. This test asserts the reality rather than the claim.
     */
    const g = ok(grid(FULL));
    const order = g.cells.map((c) => `${c.col},${c.row}`);
    const a = g.quads.find((q) => q.col === 1 && q.row === 0) as SurfaceQuad;
    const b = g.quads.find((q) => q.col === 0 && q.row === 1) as SurfaceQuad;
    // Tied to within float noise, and NOT bit-identical — so grid order is not what decides.
    expect(Math.abs(a.paintDepth - b.paintDepth)).toBeLessThan(1e-12);
    expect(a.paintDepth).not.toBe(b.paintDepth);
    // They are adjacent in the paint order, and the emitted order is ascending by the key.
    expect(Math.abs(order.indexOf('1,0') - order.indexOf('0,1'))).toBe(1);
    expect(order.indexOf('0,1')).toBeLessThan(order.indexOf('1,0')); // b's key is the smaller one
    /*
     * Either order is correct because the two cannot overlap IN AREA on screen, and this is the
     * measured reason: at the azimuth that ties them the pair is displaced purely along the
     * screen-x direction, so on an evenly spaced grid their sx extents meet exactly at a line
     * and share nothing else. Measured here: (1,0) covers sx −70.711…0 and (0,1) covers
     * 0…70.711. THIS is what makes the tie harmless — not the sort being stable.
     */
    const aMaxSx = Math.max(...a.corners.map((p) => p.sx));
    const bMinSx = Math.min(...b.corners.map((p) => p.sx));
    expect(aMaxSx).toBeLessThanOrEqual(bMinSx);
    expect(aMaxSx).toBeCloseTo(0, 9);
    // And with the extents merely touching, no corner of either is in the other's interior.
    for (const p of a.corners) expect(strictlyInside(p, b.corners)).toBe(false);
    for (const p of b.corners) expect(strictlyInside(p, a.corners)).toBe(false);
  });

  it('is reproducible: two builds of one input give one order', () => {
    const a = ok(grid(FULL)).cells.map((c) => `${c.col},${c.row}`);
    const b = ok(grid(FULL)).cells.map((c) => `${c.col},${c.row}`);
    expect(a).toEqual(b);
  });
});

describe('absence', () => {
  it('renders an absent cell as a HOLE and never as z=0', () => {
    // ONE absent point in the middle of a 3×3 is a corner of ALL FOUR cells, so there is no
    // drawable quad at all and the whole surface refuses. That is the doctrine working, not a
    // gap in this test: the alternative was four quads with an invented centre.
    const centreMissing: readonly (readonly (number | null)[])[] = [
      [1000, 3000, 6000],
      [500, null, 5000],
      [-500, 900, 4000],
    ];
    expect(codes(grid(centreMissing))).toEqual(['GEOMETRY_NO_COMPLETE_QUAD']);

    // On a 4×3 grid the hole is local, so the surface draws AROUND it.
    const wide: readonly (readonly (number | null)[])[] = [
      [1000, 3000, 6000, 8000],
      [500, 2000, 5000, 7000],
      [-500, 900, null, 6000],
    ];
    const h = ok(grid(wide, {
      xAxis: {
        label: 'Price',
        unit: 'USD',
        ticks: [10000, 15000, 20000, 25000].map((v) => ({ value: v, label: `$${v}` })),
      },
    }));
    expect(h.holes.length).toBe(2);
    expect(h.quads.length).toBe(4);
    // No quad anywhere carries the absent cell's indices, and no z of 0 was invented.
    for (const q of h.quads) expect(q.zMin === 0 && q.zMax === 0).toBe(false);
    expect(h.holes.map((x) => `${x.col},${x.row}`).sort()).toEqual(['1,1', '2,1']);
    for (const hole of h.holes) {
      expect(hole.absentCorners).toContainEqual([2, 2]);
      expect(hole.footprint).toHaveLength(4);
      // A hole is paint-ordered like a quad, so the renderer can draw the gap in place.
      expect(Number.isFinite(hole.paintDepth)).toBe(true);
    }
  });

  it('NEVER interpolates across an absence — a quad is the mean of its four OWN corners', () => {
    const wide: readonly (readonly (number | null)[])[] = [
      [100, 200, 300, 400],
      [110, 210, 310, 410],
      [120, 220, null, 420],
    ];
    const g = ok(grid(wide, {
      xAxis: {
        label: 'Price',
        unit: 'USD',
        ticks: [10000, 15000, 20000, 25000].map((v) => ({ value: v, label: `$${v}` })),
      },
    }));
    const byIdx = new Map(g.quads.map((q) => [`${q.col},${q.row}`, q] as const));
    // Cell (0,0) spans z 100,200,110,210. Its mean must be exactly that, unpolluted.
    const q00 = byIdx.get('0,0') as SurfaceQuad;
    expect(q00.zMean).toBe((100 + 200 + 110 + 210) / 4);
    expect(q00.zMin).toBe(100);
    expect(q00.zMax).toBe(210);
    // The two cells touching the hole are absent from the quad list entirely: nothing was
    // smoothed through (2,2) from 310 and 420 either side of it.
    expect(byIdx.has('1,1')).toBe(false);
    expect(byIdx.has('2,1')).toBe(false);
    // And the total accounting closes: drawn + holes = every cell in the mesh.
    expect(g.frame.cellsDrawn + g.frame.cellsHoles).toBe(g.frame.cellsTotal);
    expect(g.frame.pointsAbsent).toBe(1);
    expect(g.frame.pointsObserved).toBe(11);
  });

  it('refuses an entirely-absent grid instead of drawing an empty box', () => {
    const empty = [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ];
    expect(codes(grid(empty))).toContain('GEOMETRY_ALL_CELLS_ABSENT');
  });

  it('refuses when values are present but no cell has four corners', () => {
    // A checkerboard: every cell has at least one absent corner.
    const checker = [
      [1, null, 3],
      [null, 5, null],
      [7, null, 9],
    ];
    expect(codes(grid(checker))).toEqual(['GEOMETRY_NO_COMPLETE_QUAD']);
  });

  it('separates not-loaded from genuinely-empty from never-measured from withheld', () => {
    // FOUR inputs, four codes, no shared branch. The house triple is
    // not-loaded / present-but-withheld / genuinely-empty, and all three are here — plus
    // never-measured, which is a fourth state about the CELLS rather than about the read.
    expect(codes(grid(null))).toEqual(['GEOMETRY_GRID_NOT_LOADED']);
    expect(codes(grid([]))).toEqual(['GEOMETRY_GRID_EMPTY']);
    expect(codes(grid([[null, null], [null, null]]))).toEqual(['GEOMETRY_ALL_CELLS_ABSENT']);
    expect(codes(grid([[WITHHELD, WITHHELD], [WITHHELD, WITHHELD]]))).toEqual(['GEOMETRY_ALL_CELLS_WITHHELD']);
    // Mixed: both facts are reported, because an operator does something different about each.
    expect(codes(grid([[WITHHELD, null], [null, WITHHELD]])))
      .toEqual(['GEOMETRY_ALL_CELLS_ABSENT', 'GEOMETRY_ALL_CELLS_WITHHELD']);
  });

  it('keeps PRESENT-BUT-WITHHELD apart from NEVER-MEASURED on the figure itself', () => {
    /*
     * A cell the caller HOLDS and will not show is not a cell nobody measured. Written as `null`
     * they would be one hole with one sentence, and the reader would be told nobody measured a
     * height that was measured and then classified — the collapse the doctrine forbids.
     */
    const mixed: readonly (readonly (number | null | typeof WITHHELD)[])[] = [
      [100, 200, 300, 400],
      [110, 210, 310, 410],
      [120, WITHHELD, null, 420],
    ];
    const g = ok(grid(mixed, {
      xAxis: {
        label: 'Price', unit: 'USD',
        ticks: [10000, 15000, 20000, 25000].map((v) => ({ value: v, label: `$${v}` })),
      },
    }));
    expect(g.frame.pointsObserved).toBe(10);
    expect(g.frame.pointsAbsent).toBe(1);
    expect(g.frame.pointsWithheld).toBe(1);
    // The counts are three separate numbers and they close against the grid.
    expect(g.frame.pointsObserved + g.frame.pointsAbsent + g.frame.pointsWithheld).toBe(12);
    const byIdx = new Map(g.holes.map((h) => [`${h.col},${h.row}`, h] as const));
    // Cell (0,1) touches only the WITHHELD corner: withheld listed, absent empty.
    const withheldOnly = byIdx.get('0,1');
    expect(withheldOnly?.withheldCorners).toEqual([[1, 2]]);
    expect(withheldOnly?.absentCorners).toEqual([]);
    // Cell (2,1) touches only the never-measured corner: the reverse.
    const absentOnly = byIdx.get('2,1');
    expect(absentOnly?.absentCorners).toEqual([[2, 2]]);
    expect(absentOnly?.withheldCorners).toEqual([]);
    // And the two states get two different notices, not one merged count.
    const seen = g.notices.map((n) => n.code);
    expect(seen).toContain('HOLES_PRESENT');
    expect(seen).toContain('CELLS_WITHHELD');
  });

  it('counts a cell that is BOTH never-measured and withheld under BOTH notices, and says the counts overlap', () => {
    /*
     * THE COLLAPSE THE NOTICES THEMSELVES USED TO COMMIT. The partition ran on withheld-ness
     * alone — `withheldCorners.length === 0` against `> 0` — so a cell holding one never-measured
     * corner AND one withheld corner fell only into the withheld list. `HOLES_PRESENT` never
     * counted it and `CELLS_WITHHELD` claimed it as purely withheld: a reader was told nobody
     * measured anything in a cell that also held a measurement somebody had classified, and told
     * nothing whatever about the absence. The three states are the module's whole subject and the
     * sentences that report them were the place they got merged.
     *
     * The same fixture as the test above, whose holes are (0,1) withheld-only, (1,1) MIXED and
     * (2,1) absent-only — computed by hand from the corner map, never by re-running the engine:
     * cell (i,j) owns grid points (i,j) (i+1,j) (i+1,j+1) (i,j+1), row 2 is
     * [120, WITHHELD, null, 420], so (1,1) touches the withheld point (1,2) AND the absent (2,2).
     */
    const mixedRows: readonly (readonly (number | null | typeof WITHHELD)[])[] = [
      [100, 200, 300, 400],
      [110, 210, 310, 410],
      [120, WITHHELD, null, 420],
    ];
    const g = ok(grid(mixedRows, {
      xAxis: {
        label: 'Price', unit: 'USD',
        ticks: [10000, 15000, 20000, 25000].map((v) => ({ value: v, label: `$${v}` })),
      },
    }));
    const byIdx = new Map(g.holes.map((h) => [`${h.col},${h.row}`, h] as const));
    expect(g.holes).toHaveLength(3);
    expect(byIdx.get('1,1')?.absentCorners).toEqual([[2, 2]]);
    expect(byIdx.get('1,1')?.withheldCorners).toEqual([[1, 2]]);

    const holesNotice = g.notices.find((n) => n.code === 'HOLES_PRESENT');
    const withheldNotice = g.notices.find((n) => n.code === 'CELLS_WITHHELD');
    // TWO of the six cells hold a never-measured corner ((1,1) and (2,1)) and TWO hold a withheld
    // one ((0,1) and (1,1)). Under the old partition the first number was 1: the mixed cell was
    // missing from the absence count entirely.
    expect(holesNotice?.sentence).toMatch(/^2 of 6 cells are open because a corner was never measured/);
    expect(withheldNotice?.sentence).toMatch(/^2 of 6 cells are open because a corner is PRESENT BUT WITHHELD/);
    // 2 + 2 = 4 against 3 open cells, so the overlap is stated rather than left to be discovered
    // by a reader subtracting and getting a wrong answer.
    for (const n of [holesNotice, withheldNotice]) {
      expect(n?.sentence)
        .toMatch(/Counts overlap: 1 of the 3 open cells has a never-measured corner AND a withheld one/);
      expect(n?.sentence).toMatch(/do not sum to the number of open cells/);
    }
    /*
     * With no mixed cell there is no overlap clause: the sentence does not warn about arithmetic
     * that closes. A 4×4 grid, with the withheld point at (1,1) and the never-measured one at the
     * far corner (3,3), so no cell touches both — (1,1) opens cells (0,0) (1,0) (0,1) (1,1) and
     * (3,3) opens only (2,2), leaving four drawable quads.
     */
    const unmixed = ok(grid([
      [100, 200, 300, 400],
      [110, WITHHELD, 310, 410],
      [120, 220, 320, 420],
      [130, 230, 330, null],
    ]));
    expect(unmixed.holes.some((h) => h.absentCorners.length > 0 && h.withheldCorners.length > 0)).toBe(false);
    expect(unmixed.notices.map((n) => n.code)).toContain('HOLES_PRESENT');
    expect(unmixed.notices.map((n) => n.code)).toContain('CELLS_WITHHELD');
    for (const n of unmixed.notices) expect(n.sentence).not.toMatch(/Counts overlap/);
  });

  it('treats a NaN as a broken computation, not as an absence', () => {
    const broken = [
      [1000, 3000, 6000],
      [500, Number.NaN, 5000],
      [-500, 900, 4000],
    ];
    const c = codes(grid(broken));
    expect(c).toContain('GEOMETRY_Z_NOT_FINITE');
    expect(c).not.toContain('GEOMETRY_ALL_CELLS_ABSENT');
  });

  it('reports an ALL-NaN grid as broken, never as an absence, and never with a false count', () => {
    /*
     * The previous test only covers ONE NaN among eight good values, so it never reached the
     * `pointsObserved === 0` branch. An all-NaN grid used to raise GEOMETRY_ALL_CELLS_ABSENT
     * alongside the nine NaN codes, with the sentence "All 0 grid points are absent." — a broken
     * computation reported as an absence, and a count that was not the count being described.
     */
    const allBroken = [
      [Number.NaN, Number.NaN, Number.NaN],
      [Number.NaN, Number.NaN, Number.NaN],
      [Number.NaN, Number.NaN, Number.NaN],
    ];
    const out = buildSurfaceMesh(grid(allBroken));
    if (isProjectedSurface(out)) throw new Error('expected refusals');
    expect(out.refusals).toHaveLength(9);
    expect(out.refusals.every((r) => r.code === 'GEOMETRY_Z_NOT_FINITE')).toBe(true);
    expect(out.refusals.map((r) => r.code)).not.toContain('GEOMETRY_ALL_CELLS_ABSENT');
    expect(out.refusals.map((r) => r.code)).not.toContain('GEOMETRY_ALL_CELLS_WITHHELD');
    // Every count that reaches a sentence is the count that sentence describes.
    for (const r of out.refusals) expect(r.sentence).not.toMatch(/\b0 grid points\b/);
    // Infinity is the same defect through the same door.
    expect(codes(grid([[1, 2, 3], [4, Number.POSITIVE_INFINITY, 6], [7, 8, 9]])))
      .toEqual(['GEOMETRY_Z_NOT_FINITE']);
  });
});

describe('the caller-supplied vertical domain is an input, and is checked like one', () => {
  it('refuses a non-finite domain with the same code a non-finite VALUE gets', () => {
    /*
     * `zDomain: [NaN, 6000]` used to draw a full figure: viewBox "…NaN…", every polygon
     * `points="0,NaN …"`, `shade` NaN, and the frame still captioning "4 of 4 cells observed"
     * next to a production environment label. One laundering path for exactly the number the
     * `rows` check refuses. `[Infinity, -Infinity]` is what a caller computing a shared domain
     * with Math.min(...[])/Math.max(...[]) over an empty surface actually produces.
     */
    for (const d of [
      [Number.NaN, 6000], [-500, Number.NaN],
      [0, Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY, 0],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ] as const) {
      expect(codes(grid(FULL, { zDomain: d as readonly [number, number] })))
        .toEqual(['GEOMETRY_Z_NOT_FINITE']);
    }
  });

  it('refuses a domain with no extent or an inverted one', () => {
    // [5, 5]: shades every cell identically and used to make the figure state that every
    // observed Margin was 5 — over values running −500…6000.
    expect(codes(grid(FULL, { zDomain: [5, 5] }))).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
    // [1000, −1000]: drew the highest margin as the deepest trough, with zero z ticks.
    expect(codes(grid(FULL, { zDomain: [1000, -1000] }))).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
  });

  it('never lets an overridden domain make a claim about the data', () => {
    // `flat` is a fact about the OBSERVED values. A wide override does not un-flatten flat data,
    // and (the defect) a no-extent override cannot flatten data that varies — it refuses.
    const g = ok(grid([[5, 5, 5], [5, 5, 5], [5, 5, 5]], { zDomain: [0, 10] }));
    expect(g.flat).toBe(true);
    expect(g.observedDomain).toEqual([5, 5]);
    expect(g.zDomain).toEqual([0, 10]);
    const flatNotice = g.notices.find((n) => n.code === 'SURFACE_IS_FLAT');
    // The sentence quotes the OBSERVED constant, not the domain endpoint.
    expect(flatNotice?.sentence).toMatch(/Every observed Margin is 5 USD/);
    // A varying surface under a wide override is not called flat.
    const varying = ok(grid(FULL, { zDomain: [-10000, 10000] }));
    expect(varying.flat).toBe(false);
    expect(varying.notices.map((n) => n.code)).not.toContain('SURFACE_IS_FLAT');
    expect(varying.observedDomain).toEqual([-500, 6000]);
  });

  it('says so when the observed values fall outside the domain the caller set', () => {
    // Geometry is NOT clamped (that would draw a height nobody measured) but `shade` IS, so
    // beyond the box the ink and the height stop agreeing. The figure says which cells.
    const g = ok(grid(FULL, { zDomain: [0, 10] }));
    const n = g.notices.find((x) => x.code === 'OBSERVED_RANGE_OUTSIDE_DOMAIN');
    expect(n).toBeDefined();
    expect(n?.sentence).toMatch(/runs -500–6000 USD/);
    expect(n?.sentence).toMatch(/outside the caller's vertical domain of 0–10/);
    expect(n?.sentence).toMatch(/4 of 4 drawn cells sit beyond the box/);
    // Inside the domain, no such notice.
    expect(ok(grid(FULL, { zDomain: [-10000, 10000] })).notices.map((x) => x.code))
      .not.toContain('OBSERVED_RANGE_OUTSIDE_DOMAIN');
  });

  it('counts the out-of-box cells on their CORNERS, so a cell that averages inside is not called compliant', () => {
    /*
     * THE FALSE COUNT. The notice counted `q.zMean < zLo || q.zMean > zHi` — a test of a number
     * the drawing does not use. Geometry is per-CORNER and deliberately unclamped, so a quad whose
     * corners straddle the box while AVERAGING inside it is drawn punching through BOTH faces and
     * was reported as compliant: "0 of 1 drawn cells sit beyond the box" over a cell drawn 300
     * units below the floor and 400 above the ceiling.
     *
     * Hand-computed, never re-run from the expression under test: corners −300, 400, 0, 0 give a
     * mean of (−300 + 400 + 0 + 0)/4 = 25, which sits comfortably inside a 0–100 box, while zMin
     * is −300 (300 below the floor) and zMax is 400 (300 above the ceiling).
     */
    const straddle = ok(grid([[-300, 400], [0, 0]], { zDomain: [0, 100] }));
    expect(straddle.quads).toHaveLength(1);
    const q = straddle.quads[0];
    expect(q.zMean).toBe(25);
    expect(q.zMin).toBe(-300);
    expect(q.zMax).toBe(400);
    // Drawn through both faces, and the shade is nevertheless honest — the mean IS inside the
    // box, so 25/100 is a faithful encoding of the mean and a false impression of the corners.
    // Two separate booleans because those are two separate facts.
    expect(q.outsideDomain).toBe(true);
    expect(q.shadeClamped).toBe(false);
    expect(q.shade).toBeCloseTo(0.25, 12);

    const n = straddle.notices.find((x) => x.code === 'OBSERVED_RANGE_OUTSIDE_DOMAIN');
    expect(n?.sentence).toMatch(/1 of 1 drawn cells sit beyond the box on at least one CORNER/);
    // The SIZE of the excursion is legible, because a count cannot tell one unit over the ceiling
    // from thirty thousand and those are different pictures.
    expect(n?.sentence).toMatch(/reaching -300 at the lowest corner and 400 at the highest/);
    // The ink clause is tied to the MEAN and says nothing about the corners: here the shade is
    // honest and the corners are not, and the sentence keeps those two facts apart.
    expect(n?.sentence).toMatch(/No cell MEAN leaves the box, so every shading still encodes the height/);
  });

  it('flags the cells whose INK was clamped, so maximum ink is not read as a cell at the ceiling', () => {
    /*
     * `shade` is clamped into [0,1] while the geometry is not, so a cell far beyond the box
     * arrives at the maximum fill opacity the renderer can produce — indistinguishable from a
     * legitimate cell sitting at the ceiling. The clamp stays (an unclamped `shade` becomes an
     * opacity of 372, which the renderer clamps anyway, moving the clamp somewhere undocumented)
     * and is LABELLED instead. Every cell mean of FULL — 1625, 4000, 725, 2975, all hand-computed
     * from the four corners — is above a 0–10 box.
     */
    const g = ok(grid(FULL, { zDomain: [0, 10] }));
    expect(g.quads).toHaveLength(4);
    expect(g.quads.every((x) => x.shadeClamped)).toBe(true);
    expect(g.quads.every((x) => x.outsideDomain)).toBe(true);
    expect(g.quads.every((x) => x.shade === 1)).toBe(true);
    // A clamped shade always implies the cell is out of the box; the converse is the test above.
    for (const x of g.quads) if (x.shadeClamped) expect(x.outsideDomain).toBe(true);
    expect(g.notices.find((x) => x.code === 'OBSERVED_RANGE_OUTSIDE_DOMAIN')?.sentence)
      .toMatch(/The SHADING of 4 of them is clamped, so for those cells the ink and the height disagree/);
    // And an in-domain surface flags nothing: this is not a label every cell wears.
    const plain = ok(grid(FULL));
    expect(plain.quads.some((x) => x.shadeClamped || x.outsideDomain)).toBe(false);
  });
});

describe('axis coordinates are a precondition, so they are enforced and not assumed', () => {
  const withXTicks = (values: readonly number[]) => grid(FULL, {
    xAxis: { label: 'Price', unit: 'USD', ticks: values.map((v, i) => ({ value: v, label: `t${i}` })) },
  });

  it('refuses a non-finite coordinate instead of drawing a NaN viewBox', () => {
    // Drew a fully-labelled figure whose viewBox and every vertex were NaN. `ticks.length < 2`
    // and `xHi === xLo` were the only checks, and neither sees this.
    expect(codes(withXTicks([10000, Number.NaN, 20000]))).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
    expect(codes(withXTicks([10000, 15000, Number.POSITIVE_INFINITY]))).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
  });

  it('refuses non-ascending or repeated coordinates, which fold the mesh over itself', () => {
    // The type doc says "Ascending" and the exact paint order rests on it. Non-monotonic drew
    // four overlapping quads with a viewBox 228 wide against a 100-wide box, and zero notices.
    expect(codes(withXTicks([10000, 20000, 15000]))).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
    expect(codes(withXTicks([10000, 15000, 15000]))).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
    expect(codes(withXTicks([20000, 15000, 10000]))).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
    // The y axis is checked identically, and the sentence names the axis that is wrong.
    const out = buildSurfaceMesh(grid(FULL, {
      yAxis: { label: 'Effort', unit: 'hours', ticks: [40, 40, 80].map((v) => ({ value: v, label: `${v}h` })) },
    }));
    if (isProjectedSurface(out)) throw new Error('expected refusals');
    expect(out.refusals.map((r) => r.code)).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
    expect(out.refusals[0].sentence).toMatch(/^The Effort axis cannot carry a mesh/);
  });

  it('reports one refusal per broken axis, not one per broken check', () => {
    const c = codes(grid(FULL, {
      xAxis: { label: 'Price', unit: 'USD', ticks: [1, 1, 1].map((v) => ({ value: v, label: '$1' })) },
      yAxis: { label: 'Effort', unit: 'hours', ticks: [40, 30, 20].map((v) => ({ value: v, label: `${v}h` })) },
    }));
    expect(c).toEqual(['GEOMETRY_AXIS_DEGENERATE', 'GEOMETRY_AXIS_DEGENERATE']);
  });
});

describe('refusals', () => {
  it('returns EVERY refusal, not the first one found', () => {
    const c = codes(grid(FULL, {
      frame: { ...FRAME, environment: '  ', observedAt: '' },
      view: { azimuthDeg: 90, elevationDeg: 90, scale: 1 },
    }));
    expect(c).toContain('GEOMETRY_ENVIRONMENT_NOT_STATED');
    expect(c).toContain('GEOMETRY_OBSERVATION_NOT_DATED');
    expect(c).toContain('GEOMETRY_PROJECTION_DEGENERATE');
    expect(c.length).toBe(3);
  });

  it('refuses an undated or unlabelled surface', () => {
    expect(codes(grid(FULL, { frame: { ...FRAME, environment: '' } }))).toEqual(['GEOMETRY_ENVIRONMENT_NOT_STATED']);
    expect(codes(grid(FULL, { frame: { ...FRAME, observedAt: '   ' } }))).toEqual(['GEOMETRY_OBSERVATION_NOT_DATED']);
  });

  it('refuses a ragged grid rather than padding the short rows', () => {
    expect(codes(grid([[1, 2, 3], [4, 5], [6, 7, 8]]))).toEqual(['GEOMETRY_GRID_RAGGED']);
  });

  it('refuses a one-coordinate axis — a line is not a surface', () => {
    const oneCol = grid([[1], [2], [3]], {
      xAxis: { label: 'Price', unit: 'USD', ticks: [{ value: 10000, label: '$10000' }] },
    });
    expect(codes(oneCol)).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
  });

  it('refuses an axis whose ticks all hold the same value', () => {
    const noExtent = grid(FULL, {
      xAxis: { label: 'Price', unit: 'USD', ticks: [1, 1, 1].map((v) => ({ value: v, label: '$1' })) },
    });
    expect(codes(noExtent)).toEqual(['GEOMETRY_AXIS_DEGENERATE']);
  });

  it('refuses an unusable projection box', () => {
    expect(codes(grid(FULL, { box: { width: 0, depth: 100, height: 62 } })))
      .toEqual(['GEOMETRY_PROJECTION_DEGENERATE']);
  });

  it('every refusal carries a stable code, a sentence and the rule it applies', () => {
    const out = buildSurfaceMesh(grid(null));
    if (isProjectedSurface(out)) throw new Error('expected refusals');
    for (const r of out.refusals) {
      expect(isGeometryRefusalCode(r.code)).toBe(true);
      expect(r.sentence.length).toBeGreaterThan(20);
      expect(r.rule.instrument).toBe('LCX_HOUSE_DOCTRINE');
      expect(r.rule.provision.length).toBeGreaterThan(0);
      expect(r.rule.text.length).toBeGreaterThan(0);
    }
    expect(isGeometryRefusalCode('GEOMETRY_NOPE')).toBe(false);
    expect(new Set(GEOMETRY_REFUSAL_CODES).size).toBe(GEOMETRY_REFUSAL_CODES.length);
  });
});

describe('the frame and the notices', () => {
  it('carries the environment label, the window, the source and the counts', () => {
    const g = ok(grid(FULL));
    expect(g.frame.environment).toBe('test:fixture');
    expect(g.frame.observedAt).toBe('2026-08-07T00:00:00.000Z');
    expect(g.frame.windowFrom).toBe('2026-01-01');
    expect(g.frame.windowTo).toBe('2026-08-07');
    expect(g.frame.source).toBe('geometry.test.ts fixture');
    expect(g.frame.xLabel).toBe('Price');
    expect(g.frame.yUnit).toBe('hours');
    expect(g.frame.zLabel).toBe('Margin');
    expect(g.frame.cellsTotal).toBe(4);
    expect(g.frame.cellsDrawn).toBe(4);
    expect(g.frame.cellsHoles).toBe(0);
    // All three point states are reported as separate numbers, never summed into "missing".
    expect(g.frame.pointsObserved).toBe(9);
    expect(g.frame.pointsAbsent).toBe(0);
    expect(g.frame.pointsWithheld).toBe(0);
    expect(g.observedDomain).toEqual([-500, 6000]);
    expect(g.frame.interpolation).toBe(INTERPOLATION_POLICY);
    expect(g.frame.ruleSetVersion).toBe(GEOMETRY_RULESET_VERSION);
    expect(g.frame.valuesArePlaceholders).toBe(false);
  });

  it('stamps the CURRENT ruleset version, which is a contract and not a free variable', () => {
    /*
     * `frame.ruleSetVersion === GEOMETRY_RULESET_VERSION` above is a tautology: it holds against
     * any value whatsoever and cannot notice a semantics change shipped under an unchanged
     * number. A stamped version exists so a reader of an old figure can tell which rules produced
     * it, which is worth nothing if the number does not move when the rules do. 3 is the bump for
     * the notice partition, the corner-based out-of-box count and the tick anchor plane; changing
     * it is meant to be a deliberate edit here as well as there.
     */
    expect(GEOMETRY_RULESET_VERSION).toBe(3);
  });

  it('states the projection on the geometry so a reader knows it is one view', () => {
    const g = ok(grid(FULL));
    expect(g.projectionLabel).toBe(describeProjection(DEFAULT_VIEW, DEFAULT_BOX));
  });

  it('notices holes, placeholders and a caller-set vertical domain', () => {
    const wide = grid([
      [100, 200, 300, 400],
      [110, 210, 310, 410],
      [120, 220, null, 420],
    ], {
      xAxis: {
        label: 'Price', unit: 'USD',
        ticks: [10000, 15000, 20000, 25000].map((v) => ({ value: v, label: `$${v}` })),
      },
      zDomain: [0, 1000],
      frame: { ...FRAME, valuesArePlaceholders: true },
    });
    const g = ok(wide);
    const seen = g.notices.map((n) => n.code);
    expect(seen).toContain('HOLES_PRESENT');
    expect(seen).toContain('Z_DOMAIN_OVERRIDDEN');
    expect(seen).toContain('VALUES_ARE_PLACEHOLDERS');
    expect(g.zDomain).toEqual([0, 1000]);
    expect(g.frame.valuesArePlaceholders).toBe(true);
  });

  it('calls a flat surface flat instead of drawing it as noise', () => {
    const g = ok(grid([[5, 5, 5], [5, 5, 5], [5, 5, 5]]));
    expect(g.flat).toBe(true);
    expect(g.notices.map((n) => n.code)).toContain('SURFACE_IS_FLAT');
    expect(g.quads.every((q) => q.shade === 0.5)).toBe(true);
    expect(g.zTicks).toHaveLength(1);
  });

  it('warns when the vertical axis does not start at zero', () => {
    const g = ok(grid([[100, 200, 300], [110, 210, 310], [120, 220, 320]]));
    expect(g.notices.map((n) => n.code)).toContain('Z_DOMAIN_EXCLUDES_ZERO');
    expect(g.zeroPlane).toBeNull();
  });

  it('warns HARDEST on the all-loss surface, which used to be the one with no notice at all', () => {
    /*
     * The notice fired only for `zLo > 0`, so an ALL-NEGATIVE surface — every cell below
     * break-even, the case `valueAxisTicks`'s own docblock calls the only part of a margin
     * surface anybody urgently needs to see — carried no zero plane AND no notice: identical
     * exaggeration to the all-positive case, and nothing on the figure to say so.
     */
    const loss = ok(grid([[-5000, -4000, -3000], [-4500, -3500, -2500], [-4000, -3000, -1000]]));
    expect(loss.zeroPlane).toBeNull();
    const n = loss.notices.find((x) => x.code === 'Z_DOMAIN_EXCLUDES_ZERO');
    expect(n).toBeDefined();
    expect(n?.sentence).toMatch(/EVERY cell on this surface is at or below break-even/);
    expect(n?.sentence).toMatch(/no break-even line is drawn/);
    expect(n?.sentence).toMatch(/a tall cell here is a smaller loss, not a profit/);
    // A domain whose floor IS zero says that, rather than claiming zero is excluded.
    const touching = ok(grid([[0, 200, 300], [110, 210, 310], [120, 220, 320]]));
    expect(touching.zeroPlane).toBeNull();
    expect(touching.notices.find((x) => x.code === 'Z_DOMAIN_EXCLUDES_ZERO')?.sentence)
      .toMatch(/starts exactly at zero USD, so the FLOOR of the box is the break-even line/);
    // And a surface that DOES straddle zero gets the plane and no notice about its absence.
    const straddling = ok(grid(FULL));
    expect(straddling.zeroPlane).not.toBeNull();
    expect(straddling.notices.map((x) => x.code)).not.toContain('Z_DOMAIN_EXCLUDES_ZERO');
    // The "every cell is a loss" clause is an OBSERVED fact and is never taken from the domain:
    // an all-negative DOMAIN with a positive observation says where the line is and nothing more.
    const contradicted = ok(grid([[5, 5, 5], [5, 5, 5], [5, 5, 6]], { zDomain: [-100, -10] }));
    const c = contradicted.notices.find((x) => x.code === 'Z_DOMAIN_EXCLUDES_ZERO');
    expect(c?.sentence).toMatch(/The vertical domain runs -100–-10 USD and zero is not inside it/);
    expect(c?.sentence).not.toMatch(/loss-making/);
  });

  it('draws the z=0 plane only when the observed margins straddle it', () => {
    const g = ok(grid(FULL)); // spans −500 … 6000
    expect(g.zeroPlane).not.toBeNull();
    expect(g.zeroPlane).toHaveLength(4);
    // The zero plane sits above the floor on screen, because the floor is at −500.
    expect((g.zeroPlane as ReadonlyArray<{ sy: number }>)[0].sy).toBeLessThan(g.floor[0].sy);
  });
});

describe('the drawable output', () => {
  it('gives the renderer a viewBox that contains every point it will draw', () => {
    const g = ok(grid(FULL));
    const pts = [
      ...g.floor, ...g.zAxis, ...g.xTicks.map((t) => t.at), ...g.yTicks.map((t) => t.at),
      ...g.zTicks.map((t) => t.at), ...g.quads.flatMap((q) => q.corners),
    ];
    for (const p of pts) {
      expect(p.sx).toBeGreaterThanOrEqual(g.viewBox.minX);
      expect(p.sx).toBeLessThanOrEqual(g.viewBox.minX + g.viewBox.width);
      expect(p.sy).toBeGreaterThanOrEqual(g.viewBox.minY);
      expect(p.sy).toBeLessThanOrEqual(g.viewBox.minY + g.viewBox.height);
    }
    expect(g.viewBox.width).toBeGreaterThan(0);
    expect(g.viewBox.height).toBeGreaterThan(0);
  });

  it('puts the grid ticks on the view\'s NEAR floor edges, not on a hard-coded corner', () => {
    /*
     * THE DEFECT THIS TEST EXISTS FOR. Ticks were anchored unconditionally at `y = yLo` and
     * `x = xLo` under a comment claiming the near edges were used and that the choice depended
     * on the azimuth. It depended on nothing — and at the SHIPPED DEFAULT view (xLo, yLo) is the
     * FARTHEST floor corner (measured footprint depths of the four corners: 0, 57.74, 115.47,
     * 57.74), so five of seven grid labels landed geometrically inside a drawn quad.
     */
    const g = ok(grid(FULL));
    const near = project({ x: DEFAULT_BOX.width / 2, y: DEFAULT_BOX.depth, z: 0 });
    const far = project({ x: DEFAULT_BOX.width / 2, y: 0, z: 0 });
    expect(near.depth).toBeGreaterThan(far.depth);
    // x ticks are on y = yHi (the near edge) and y ticks on x = xHi — the OPPOSITE of the old
    // (xLo, yLo) anchor on both counts. The floor of the box is at z = zLo, i.e. box z 0.
    expect(g.xTicks[1].at).toEqual(project({ x: 50, y: DEFAULT_BOX.depth, z: 0 }, DEFAULT_VIEW));
    expect(g.yTicks[1].at).toEqual(project({ x: DEFAULT_BOX.width, y: 50, z: 0 }, DEFAULT_VIEW));
    // The vertical axis stands at the LEFTMOST floor corner, which is the leftmost point of the
    // whole figure (screen x is linear in the plan and independent of z), so the axis and its
    // labels sit on the silhouette rather than across the sheet.
    const everySx = [
      ...g.quads.flatMap((q) => q.corners), ...g.holes.flatMap((h) => h.footprint), ...g.floor,
    ].map((p) => p.sx);
    expect(g.zAxis[0].sx).toBeCloseTo(Math.min(...everySx), 9);
    expect(g.zAxis[1].sx).toBeCloseTo(g.zAxis[0].sx, 12);
  });

  it('places no axis tick inside the sheet, at any legal azimuth AND under a domain the data escapes', () => {
    // The assertion the old tests never made: geometry:464 only checked that no two ticks
    // coincide, and the renderer's test only checked that the label text was in the DOM.
    //
    // The loop supplies a zDomain as well, because that is the input under which the placement
    // argument fails: below `zLo` the box height goes NEGATIVE, the sheet descends under the near
    // floor edge the ticks are anchored to, and the plan labels end up on the surface. Both
    // directions are covered — [4000, 8000] drops the sheet below the box, [-10000, -5000] lifts
    // it entirely above — so the fix is not mistaken for a one-sided patch.
    const domains: readonly (readonly [number, number] | undefined)[] = [
      undefined, [4000, 8000], [-10000, -5000],
    ];
    for (const azimuthDeg of [10, 45, 100, 170, 200, 260, 350]) {
      for (const zDomain of domains) {
        const view = { ...DEFAULT_VIEW, azimuthDeg };
        const g = ok(grid(FULL, zDomain ? { view, zDomain } : { view }));
        const sheet = g.quads.map((q) => q.corners);
        for (const t of [...g.xTicks, ...g.yTicks, ...g.zTicks]) {
          for (const poly of sheet) {
            if (strictlyInside(t.at, poly)) {
              throw new Error(
                `tick "${t.label}" at (${t.at.sx.toFixed(2)}, ${t.at.sy.toFixed(2)}) `
                + `falls inside a quad at azimuth ${azimuthDeg}, `
                + `zDomain ${zDomain ? `${zDomain[0]}–${zDomain[1]}` : 'observed'}`,
              );
            }
          }
        }
      }
    }
  });

  it('anchors the grid tick plane at the LOWEST DRAWN HEIGHT, not at a box floor the sheet has sunk below', () => {
    /*
     * Every number here is computed by hand rather than by re-running the engine.
     *
     * With no override the plane is the box floor and nothing moves: `bz(zLo) === 0`, and the
     * test above already pins `xTicks[1]` to `project({x: 50, y: 100, z: 0})`.
     *
     * With `zDomain: [4000, 8000]` over FULL (observed −500 … 6000) the sheet leaves the box
     * downward. `mapTo(-500, 4000, 8000, 62)` = (−4500 / 4000) × 62 = −69.75 — a NEGATIVE box
     * height, below the floor — so a tick anchored at `bz(zLo) = 0` sits ABOVE the lowest drawn
     * vertex, and since screen y grows downward the sheet covers the label positions the renderer
     * offsets outward from the near edge. The plane therefore drops to −69.75.
     */
    const g = ok(grid(FULL, { zDomain: [4000, 8000] }));
    expect(g.xTicks[1].at).toEqual(project({ x: 50, y: DEFAULT_BOX.depth, z: -69.75 }, DEFAULT_VIEW));
    expect(g.yTicks[1].at).toEqual(project({ x: DEFAULT_BOX.width, y: 50, z: -69.75 }, DEFAULT_VIEW));
    // Which is BELOW the floor on screen (SVG y grows downward), where the old anchor put it.
    expect(g.xTicks[1].at.sy).toBeGreaterThan(project({ x: 50, y: DEFAULT_BOX.depth, z: 0 }, DEFAULT_VIEW).sy);

    /*
     * THE BOX DOES NOT MOVE WITH THE LABELS. The floor and the vertical axis report where the
     * DOMAIN is, and dropping them to follow the data would misstate the domain the caller set.
     * The z axis stands at the leftmost floor corner, which at azimuth 45° is (xHi, yLo):
     * sx = (−x + y)/√2 gives 0, −70.71, 0, 70.71 for the four corners in box space.
     */
    expect(g.floor[0]).toEqual(project({ x: 0, y: 0, z: 0 }, DEFAULT_VIEW));
    expect(g.zAxis[0]).toEqual(project({ x: DEFAULT_BOX.width, y: 0, z: 0 }, DEFAULT_VIEW));

    // Where the observations stay inside the caller's domain the plane is the floor, unchanged.
    const inside = ok(grid(FULL, { zDomain: [-10000, 10000] }));
    expect(inside.xTicks[1].at).toEqual(project({ x: 50, y: DEFAULT_BOX.depth, z: 0 }, DEFAULT_VIEW));
  });

  it('hands the renderer WHICH WAY IS OUT, and the direction FLIPS with the azimuth', () => {
    /*
     * THE OTHER HALF OF "the label is clear of the sheet", and the half that was still the
     * renderer's to guess. Choosing the near edge (above) only decides WHERE the anchor is; the
     * text is then pushed off that edge, and `SurfacePlot` pushed the y labels LEFT with a
     * hard-coded `dx={-2}`. That is outward only while the near x edge is the left one, and just
     * past a right angle the engine's own choice flips: sweeping every whole azimuth with this
     * file's ray cast puts the RENDERED y labels inside a drawn quad at 91–98 and 271, while
     * every engine anchor stays clear. So the direction is a projection fact and is computed
     * here, not guessed there.
     *
     * The claim is checked as a claim, not as a constant: for every legal azimuth the vector
     * must agree with the screen direction from the far plan edge to the near one — re-derived
     * below from `project` and `footprintDepth` rather than read back out of the engine.
     */
    for (let azimuthDeg = 1; azimuthDeg <= 359; azimuthDeg += 1) {
      if (azimuthDeg % 90 === 0) continue;
      const view = { ...DEFAULT_VIEW, azimuthDeg };
      const g = ok(grid(FULL, { view }));
      const [w, d] = [DEFAULT_BOX.width, DEFAULT_BOX.depth];
      // Re-derived: near is the larger footprint depth, and the vector runs far → near.
      const yNearIsHi = footprintDepth(w, d / 2, view) > footprintDepth(0, d / 2, view);
      const near = project({ x: yNearIsHi ? w : 0, y: d / 2, z: 0 }, view);
      const far = project({ x: yNearIsHi ? 0 : w, y: d / 2, z: 0 }, view);
      const len = Math.hypot(near.sx - far.sx, near.sy - far.sy);
      expect(g.yTickOutward.dx).toBeCloseTo((near.sx - far.sx) / len, 12);
      expect(g.yTickOutward.dy).toBeCloseTo((near.sy - far.sy) / len, 12);
      // A unit vector, because the renderer scales it.
      expect(Math.hypot(g.yTickOutward.dx, g.yTickOutward.dy)).toBeCloseTo(1, 12);
      expect(Math.hypot(g.xTickOutward.dx, g.xTickOutward.dy)).toBeCloseTo(1, 12);
      // The x labels are pushed DOWN the screen, and always will be: screen y for a plan point
      // is `tan(elevation) × footprintDepth × scale` with elevation strictly inside (0°, 90°),
      // so the NEAR edge is the lower one at every legal view. That is why the renderer's fixed
      // downward offset never produced a hit while its fixed leftward one did.
      expect(g.xTickOutward.dy).toBeGreaterThan(0);
    }
    // And it genuinely flips: leftward at the default view, rightward inside the band that the
    // renderer's fixed `dx={-2}` got wrong. A vector that never changed sign would be a constant
    // dressed as a computation.
    expect(ok(grid(FULL, { view: DEFAULT_VIEW })).yTickOutward.dx).toBeLessThan(0);
    expect(ok(grid(FULL, { view: { ...DEFAULT_VIEW, azimuthDeg: 93 } })).yTickOutward.dx).toBeGreaterThan(0);
    expect(ok(grid(FULL, { view: { ...DEFAULT_VIEW, azimuthDeg: 271 } })).yTickOutward.dx).toBeGreaterThan(0);
  });

  it('projects every axis tick with its own position and its supplied label', () => {
    const g = ok(grid(FULL, { zAxis: { label: 'Margin', unit: 'USD', formatTick: (v) => `$${v / 1000}k` } }));
    expect(g.xTicks.map((t) => t.label)).toEqual(['$10000', '$15000', '$20000']);
    expect(g.yTicks.map((t) => t.label)).toEqual(['40h', '60h', '80h']);
    expect(g.zTicks.every((t) => t.label.startsWith('$'))).toBe(true);
    // Ticks on the same axis must not land on the same point, or the labels stack.
    expect(new Set(g.xTicks.map((t) => `${t.at.sx},${t.at.sy}`)).size).toBe(3);
    expect(new Set(g.yTicks.map((t) => `${t.at.sx},${t.at.sy}`)).size).toBe(3);
    expect(new Set(g.zTicks.map((t) => `${t.at.sx},${t.at.sy}`)).size).toBe(g.zTicks.length);
  });

  it('shades from the observed domain, not from an assumed zero floor', () => {
    const g = ok(grid(FULL));
    const lowest = g.quads.reduce((a, b) => (a.zMean <= b.zMean ? a : b));
    const highest = g.quads.reduce((a, b) => (a.zMean >= b.zMean ? a : b));
    expect(lowest.shade).toBeGreaterThanOrEqual(0);
    expect(highest.shade).toBeLessThanOrEqual(1);
    expect(highest.shade).toBeGreaterThan(lowest.shade);
    expect(g.zDomain).toEqual([-500, 6000]);
  });

  it('is pure: two builds of the same input are deeply equal', () => {
    expect(ok(grid(FULL))).toEqual(ok(grid(FULL)));
  });
});

/**
 * THE VERTICAL AXIS MUST CARRY A SCALE, NOT A SINGLE TICK.
 *
 * `valueAxisTicks` rounded its step UP always (`f <= 2 ? 2 : f <= 5 ? 5 : 10`). On the live
 * GPS margin surface the domain is -34..48 % with a target of 4, so the raw step of 20.5 gave
 * `f = 2.05`, rounded to 5, step 50 — and the only multiple of 50 in that range is zero. The
 * whole vertical axis of a surface spanning 82 points of margin read "0%".
 *
 * Every existing tick test passed throughout: they assert ascending, distinct, and inside the
 * domain, and ONE tick satisfies all three. This asserts the property those miss — that the
 * axis says enough to read a height off.
 */
describe('valueAxisTicks produces an axis a reader can use', () => {
  it('gives the live margin domain a real scale (regression: it gave [0])', () => {
    expect(valueAxisTicks(-34, 48, 4)).toEqual([-20, 0, 20, 40]);
  });

  it('never returns fewer than two ticks for a domain with real width', () => {
    // Swept rather than sampled: the old bug only appeared where the raw step landed just
    // past a 1/2/5 boundary, which a handful of round fixtures walks straight past.
    for (let lo = -100; lo <= 0; lo += 7) {
      for (let width = 1; width <= 200; width += 3) {
        const ticks = valueAxisTicks(lo, lo + width, 4);
        expect(ticks.length, `domain ${lo}..${lo + width} produced ${JSON.stringify(ticks)}`)
          .toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('still refuses what it always refused', () => {
    expect(valueAxisTicks(10, -3, 4)).toEqual([]);
    expect(valueAxisTicks(Number.NaN, 5, 4)).toEqual([]);
    expect(valueAxisTicks(Infinity, 5, 4)).toEqual([]);
    // A zero-width domain is one value, and one tick is the honest answer for it.
    expect(valueAxisTicks(5, 5, 4)).toEqual([5]);
  });

  it('keeps ticks ascending, distinct and inside the domain', () => {
    for (const [lo, hi] of [[-34, 48], [-8, 38], [0, 100], [-1, 1], [-0.004, 0.004]] as const) {
      const t = valueAxisTicks(lo, hi, 4);
      expect([...t].sort((a, b) => a - b)).toEqual([...t]);
      expect(new Set(t).size).toBe(t.length);
      for (const v of t) {
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
    }
  });
});
