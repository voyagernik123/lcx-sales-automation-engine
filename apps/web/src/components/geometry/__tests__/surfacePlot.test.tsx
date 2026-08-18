/**
 * The renderer's tests assert STRUCTURE against the engine's numbers, never pixels: that the
 * DOM order of the polygons is the engine's back-to-front order, that an absent cell becomes a
 * visible hole and not a polygon at the height of zero, and that the frame, the environment
 * label and the projection all reach the screen.
 *
 * NO `waitFor` ANYWHERE. Nothing here is asynchronous — `buildSurfaceMesh` is pure and the
 * component takes its output as a prop — so a barrier would only add a window in which a
 * negative assertion could pass against an unrendered DOM (doctrine-lint rule 5). The render
 * is synchronous and the assertions run against a settled tree.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurfacePlot } from '../SurfacePlot';
import {
  WITHHELD,
  buildSurfaceMesh,
  isProjectedSurface,
  type SurfaceGridInput,
  type SurfaceOutcome,
} from '../../../../../../packages/shared/src/geometry/index';

/**
 * Point in the INTERIOR of a rendered SVG polygon, read off its own `points` attribute.
 *
 * The polygon is shrunk one part in a million about its centroid before the ray cast, because a
 * tick legitimately sits ON the silhouette — the vertical axis stands at a floor corner, and its
 * top tick coincides exactly with a sheet corner when the tallest cell is at that corner — and a
 * bare ray cast answers arbitrarily for a point on a vertex. "Inside" here means "on the sheet",
 * which is the thing a label must never be.
 */
function insideRenderedPolygon(px: number, py: number, pointsAttr: string): boolean {
  const poly = pointsAttr.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
  if (poly.length < 3) return false;
  const cx = poly.reduce((s, q) => s + q.x, 0) / poly.length;
  const cy = poly.reduce((s, q) => s + q.y, 0) / poly.length;
  const k = 1 - 1e-6;
  const sh = poly.map((q) => ({ x: cx + (q.x - cx) * k, y: cy + (q.y - cy) * k }));
  let hits = 0;
  for (let i = 0, j = sh.length - 1; i < sh.length; j = i++) {
    const a = sh[i];
    const b = sh[j];
    if ((a.y > py) !== (b.y > py)) {
      const x = a.x + ((py - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (px < x) hits++;
    }
  }
  return hits % 2 === 1;
}

const FRAME = {
  environment: 'test:web-fixture',
  observedAt: '2026-08-07T00:00:00.000Z',
  windowFrom: '2026-01-01',
  windowTo: '2026-08-07',
  source: 'gps/underwrite.ts marginDistribution (fixture)',
} as const;

/** GPS margin over (price band, effort hours) — the sanctioned subject, four price bands. */
function input(rows: SurfaceGridInput['rows'], over: Partial<SurfaceGridInput> = {}): SurfaceGridInput {
  return {
    rows,
    xAxis: {
      label: 'Price',
      unit: 'USD',
      ticks: [10000, 15000, 20000, 25000].map((v) => ({ value: v, label: `$${v / 1000}k` })),
    },
    yAxis: {
      label: 'Effort',
      unit: 'hours',
      ticks: [40, 60, 80].map((v) => ({ value: v, label: `${v}h` })),
    },
    zAxis: { label: 'Margin', unit: 'USD', formatTick: (v) => `$${Math.round(v / 100) / 10}k` },
    frame: FRAME,
    ...over,
  };
}

const FULL: SurfaceGridInput['rows'] = [
  [1000, 3000, 6000, 9000],
  [400, 2200, 5100, 8100],
  [-800, 900, 4000, 7000],
];

const HOLED: SurfaceGridInput['rows'] = [
  [1000, 3000, 6000, 9000],
  [400, 2200, 5100, 8100],
  [-800, 900, null, 7000],
];

const READS_AS =
  'Margin over price AND effort together: the effort at which a band stops protecting us moves '
  + 'with the band, and a single margin-vs-price line has to fix effort and therefore hides it.';

function mesh(i: SurfaceGridInput) {
  const out = buildSurfaceMesh(i);
  if (!isProjectedSurface(out)) throw new Error(`fixture refused: ${out.refusals.map((r) => r.code).join(', ')}`);
  return out;
}

function plot(surface: SurfaceOutcome) {
  return render(<SurfacePlot surface={surface} title="GPS margin surface" readsAs={READS_AS} />);
}

describe('SurfacePlot — paint order', () => {
  it('emits cells in the engine\'s back-to-front order and does not reorder them', () => {
    const g = mesh(input(FULL));
    const { container } = plot(g);
    const drawn = [...container.querySelectorAll('[data-cell]')].map((el) => el.getAttribute('data-cell'));
    expect(drawn).toEqual(g.cells.map((c) => `${c.col},${c.row}`));
    // The order is genuinely back-to-front, asserted from the projected depths rather than by
    // eye: each cell's footprint depth is >= the one painted before it.
    for (let i = 1; i < g.cells.length; i++) {
      expect(g.cells[i].paintDepth).toBeGreaterThanOrEqual(g.cells[i - 1].paintDepth);
    }
    expect(drawn.length).toBe(g.frame.cellsTotal);
  });

  it('draws every observed cell and nothing extra', () => {
    const g = mesh(input(FULL));
    const { container } = plot(g);
    expect(container.querySelectorAll('[data-kind="quad"]').length).toBe(g.quads.length);
    expect(container.querySelectorAll('[data-hole]').length).toBe(0);
  });
});

describe('SurfacePlot — absence', () => {
  it('renders an absent cell as a HOLE, never as a polygon at z=0', () => {
    const g = mesh(input(HOLED));
    const { container } = plot(g);

    const holes = [...container.querySelectorAll('[data-hole]')];
    expect(holes.length).toBe(g.holes.length);
    expect(holes.length).toBe(2);
    expect(holes.map((el) => el.getAttribute('data-cell')).sort()).toEqual(['1,1', '2,1']);

    // A hole has NO FILL: the reader sees through the sheet. `fill="none"` is the assertion
    // that matters — a hole rendered with a fill is a cell, and a cell is a claim.
    for (const h of holes) {
      const poly = h.querySelector('polygon');
      expect(poly?.getAttribute('fill')).toBe('none');
    }

    // The absent cells are not ALSO emitted as quads at some invented height.
    const quadCells = [...container.querySelectorAll('[data-kind="quad"]')].map((el) => el.getAttribute('data-cell'));
    expect(quadCells).not.toContain('1,1');
    expect(quadCells).not.toContain('2,1');
    expect(quadCells.length).toBe(4);

    // ...and z=0 is not where the hole was drawn: the engine put its footprint at the base of
    // the box (−800), which under this view is BELOW the zero plane on screen.
    const zeroPlane = container.querySelector('[data-testid="surface-zero-plane"]');
    expect(zeroPlane).toBeTruthy();
  });

  it('reports the hole in the frame and in a notice, rather than shrinking the denominator', () => {
    plot(mesh(input(HOLED)));
    const frame = screen.getByTestId('surface-frame');
    expect(frame.textContent).toMatch(/4 of 6 cells/);
    expect(frame.textContent).toMatch(/11 grid points observed, 1 never measured, 0 present but withheld/);
    expect(screen.getByTestId('surface-notices').textContent).toMatch(/HOLES_PRESENT/);
  });

  it('draws a WITHHELD gap differently from a never-measured one, marks a MIXED cell as both, and counts them separately', () => {
    /*
     * Present-but-withheld is the third of the house's three states and it has to be visible AS
     * such: a reader looking at a gap must be able to tell "nobody measured this" from "this was
     * measured and you may not see it", because those are different questions to ask next. Both
     * would have rendered as one identical dashed cross while the frame reported them in one
     * "absent" number.
     *
     * AND A CELL CAN BE BOTH. This fixture has always contained one — cell (1,1) touches the
     * withheld corner at grid point (1,2) and the never-measured corner at (2,2) — and the
     * component collapsed it: `const withheld = h.withheldCorners.length > 0` chose the tight dash
     * and SUPPRESSED the cross, so a gap containing a genuine absence was drawn as a pure
     * permission decision. This test used to PIN that behaviour, asserting `lines.length === 0`
     * over every hole carrying a withheld corner, the mixed one included.
     */
    const withheldRows: SurfaceGridInput['rows'] = [
      [1000, 3000, 6000, 9000],
      [400, 2200, 5100, 8100],
      [-800, WITHHELD, null, 7000],
    ];
    const g = mesh(input(withheldRows));
    const { container } = plot(g);
    const holes = [...container.querySelectorAll('[data-hole]')];
    const byCell = new Map(holes.map((h) => [h.getAttribute('data-cell') ?? '', h] as const));
    expect([...byCell.keys()].sort()).toEqual(['0,1', '1,1', '2,1']);
    const dash = (el: Element) => el.querySelector('polygon')?.getAttribute('stroke-dasharray');
    const crossCount = (el: Element) => el.querySelectorAll('line').length;
    const engineHole = (id: string) => g.holes.find((h) => `${h.col},${h.row}` === id);

    // (0,1) — only the WITHHELD corner. Tight dash, no cross: something is known here.
    expect(engineHole('0,1')?.withheldCorners.length).toBe(1);
    expect(engineHole('0,1')?.absentCorners.length).toBe(0);
    const withheldOnly = byCell.get('0,1') as Element;
    expect(withheldOnly.getAttribute('data-withheld')).toBe('true');
    expect(withheldOnly.getAttribute('data-absent')).toBeNull();
    expect(dash(withheldOnly)).toBe('0.8 1.2');
    expect(crossCount(withheldOnly)).toBe(0);

    // (2,1) — only the never-measured corner. Sparse dash and the cross: nothing is known here.
    expect(engineHole('2,1')?.absentCorners.length).toBe(1);
    expect(engineHole('2,1')?.withheldCorners.length).toBe(0);
    const absentOnly = byCell.get('2,1') as Element;
    expect(absentOnly.getAttribute('data-absent')).toBe('true');
    expect(absentOnly.getAttribute('data-withheld')).toBeNull();
    expect(dash(absentOnly)).toBe('2 2');
    expect(crossCount(absentOnly)).toBe(2);

    // (1,1) — BOTH. The tight dash AND the cross, because both statements are true of it, and
    // both states on the element rather than one of them swallowing the other.
    expect(engineHole('1,1')?.absentCorners.length).toBe(1);
    expect(engineHole('1,1')?.withheldCorners.length).toBe(1);
    const mixed = byCell.get('1,1') as Element;
    expect(mixed.getAttribute('data-withheld')).toBe('true');
    expect(mixed.getAttribute('data-absent')).toBe('true');
    expect(dash(mixed)).toBe('0.8 1.2');
    expect(crossCount(mixed)).toBe(2);

    // Three counts on the frame, and two separate notices — never one merged "missing" number.
    expect(screen.getByTestId('surface-frame').textContent)
      .toMatch(/10 grid points observed, 1 never measured, 1 present but withheld/);
    const notices = screen.getByTestId('surface-notices').textContent ?? '';
    expect(notices).toMatch(/HOLES_PRESENT/);
    expect(notices).toMatch(/CELLS_WITHHELD/);
    expect(notices).toMatch(/measured and are not shown here/);
    // The mixed cell is counted under BOTH notices — 2 and 2 over 3 open cells — and the reader
    // is told the counts overlap rather than left to subtract and get a wrong answer.
    const holesNotice = container.querySelector('[data-notice="HOLES_PRESENT"]')?.textContent ?? '';
    const withheldNotice = container.querySelector('[data-notice="CELLS_WITHHELD"]')?.textContent ?? '';
    expect(holesNotice).toMatch(/2 of 6 cells are open because a corner was never measured/);
    expect(withheldNotice).toMatch(/2 of 6 cells are open because a corner is PRESENT BUT WITHHELD/);
    for (const n of [holesNotice, withheldNotice]) {
      expect(n).toMatch(/Counts overlap: 1 of the 3 open cells has a never-measured corner AND a withheld one/);
    }
  });

  it('refuses an all-withheld grid under a DIFFERENT code from an all-absent one', () => {
    const allWithheld = plot(buildSurfaceMesh(input([
      [WITHHELD, WITHHELD, WITHHELD, WITHHELD],
      [WITHHELD, WITHHELD, WITHHELD, WITHHELD],
      [WITHHELD, WITHHELD, WITHHELD, WITHHELD],
    ])));
    expect(allWithheld.container.querySelector('[data-refusal="GEOMETRY_ALL_CELLS_WITHHELD"]')).toBeTruthy();
    expect(allWithheld.container.querySelector('[data-refusal="GEOMETRY_ALL_CELLS_ABSENT"]')).toBeNull();
    expect(allWithheld.container.querySelector('svg')).toBeNull();
  });

  it('states the no-interpolation policy on the figure', () => {
    plot(mesh(input(FULL)));
    expect(screen.getByTestId('surface-interpolation').textContent).toMatch(/No interpolation/);
    expect(screen.getByTestId('surface-interpolation').textContent).toMatch(/never smoothed over from its neighbours/);
  });
});

describe('SurfacePlot — refusal', () => {
  it('refuses an entirely-absent grid with its code instead of drawing an empty box', () => {
    const out = buildSurfaceMesh(input([
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]));
    const { container } = plot(out);
    expect(screen.getByTestId('surface-refused')).toBeInTheDocument();
    expect(container.querySelector('[data-refusal="GEOMETRY_ALL_CELLS_ABSENT"]')).toBeTruthy();
    // No box, no axes, no polygons — an empty box reads as a measured flat surface.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelectorAll('[data-cell]').length).toBe(0);
    expect(screen.queryByTestId('surface-plot')).toBeNull();
  });

  it('refuses a not-loaded grid with a DIFFERENT code from an empty one', () => {
    const notLoaded = plot(buildSurfaceMesh(input(null)));
    expect(notLoaded.container.querySelector('[data-refusal="GEOMETRY_GRID_NOT_LOADED"]')).toBeTruthy();
    notLoaded.unmount();
    const empty = plot(buildSurfaceMesh(input([])));
    expect(empty.container.querySelector('[data-refusal="GEOMETRY_GRID_EMPTY"]')).toBeTruthy();
  });

  it('shows every refusal with the rule it cites, not just the first', () => {
    const out = buildSurfaceMesh(input(FULL, {
      frame: { ...FRAME, environment: '', observedAt: '' },
    }));
    const { container } = plot(out);
    expect(container.querySelector('[data-refusal="GEOMETRY_ENVIRONMENT_NOT_STATED"]')).toBeTruthy();
    expect(container.querySelector('[data-refusal="GEOMETRY_OBSERVATION_NOT_DATED"]')).toBeTruthy();
    expect(screen.getByTestId('surface-refused').textContent).toMatch(/LCX_HOUSE_DOCTRINE/);
  });
});

describe('SurfacePlot — the frame a picture needs more than a table does', () => {
  it('shows the environment label, the window, the source and the vertical domain', () => {
    plot(mesh(input(FULL)));
    expect(screen.getByTestId('surface-environment').textContent).toBe('test:web-fixture');
    const frame = screen.getByTestId('surface-frame');
    expect(frame.textContent).toMatch(/window 2026-01-01 → 2026-08-07/);
    expect(frame.textContent).toMatch(/gps\/underwrite\.ts marginDistribution \(fixture\)/);
    expect(frame.textContent).toMatch(/Price \(USD\) × Effort \(hours\) → Margin \(USD\)/);
    expect(frame.textContent).toMatch(/-800 … 9000 USD/);
  });

  it('names the projection and its parameters, so the view reads as one view', () => {
    const g = mesh(input(FULL));
    plot(g);
    const shown = screen.getByTestId('surface-projection').textContent ?? '';
    expect(shown).toBe(g.projectionLabel);
    expect(shown).toMatch(/azimuth 45°/);
    expect(shown).toMatch(/CHOICE of exaggeration/);
  });

  it('marks a snapshot as a snapshot rather than inventing a window', () => {
    plot(mesh(input(FULL, { frame: { ...FRAME, windowFrom: null, windowTo: null } })));
    expect(screen.getByTestId('surface-frame').textContent).toMatch(/snapshot, not a window/);
  });

  it('makes placeholder heights LOOK like placeholders', () => {
    const g = mesh(input(FULL, { frame: { ...FRAME, valuesArePlaceholders: true } }));
    const { container } = plot(g);
    expect(screen.getByTestId('surface-placeholder-tag')).toBeInTheDocument();
    expect(screen.getByTestId('surface-notices').textContent).toMatch(/VALUES_ARE_PLACEHOLDERS/);
    // Every quad is dashed, so the sheet cannot be mistaken for a measurement at a glance.
    const quads = [...container.querySelectorAll('[data-kind="quad"]')];
    expect(quads.length).toBeGreaterThan(0);
    for (const q of quads) expect(q.getAttribute('stroke-dasharray')).toBe('2 1.5');
  });

  it('carries the caller\'s statement of what the third axis adds', () => {
    plot(mesh(input(FULL)));
    expect(screen.getByTestId('surface-reads-as').textContent).toMatch(/has to fix effort and therefore hides it/);
  });

  it('takes its viewBox from the engine and computes no coordinates of its own', () => {
    const g = mesh(input(FULL));
    const { container } = plot(g);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox'))
      .toBe(`${g.viewBox.minX} ${g.viewBox.minY} ${g.viewBox.width} ${g.viewBox.height}`);
    // Every polygon vertex is a vertex the engine produced, verbatim.
    const first = g.cells[0];
    const pts = first.kind === 'quad' ? first.corners : first.footprint;
    const el = container.querySelector(`[data-cell="${first.col},${first.row}"]`);
    const poly = el?.tagName.toLowerCase() === 'polygon' ? el : el?.querySelector('polygon');
    expect(poly?.getAttribute('points')).toBe(pts.map((p) => `${p.sx},${p.sy}`).join(' '));
  });

  it('projects the axis ticks the engine placed, with the labels it was given', () => {
    const g = mesh(input(FULL));
    const { container } = plot(g);
    expect(container.querySelectorAll('[data-testid="surface-z-tick"]').length).toBe(g.zTicks.length);
    for (const t of g.xTicks) expect(screen.getByText(t.label)).toBeInTheDocument();
    for (const t of g.yTicks) expect(screen.getByText(t.label)).toBeInTheDocument();
  });

  it('puts no RENDERED tick label on the sheet, at every azimuth the engine will draw AND under a caller domain the data escapes', () => {
    /*
     * THE ASSERTION THAT WAS MISSING, and the one that would have caught the shipped anchoring:
     * the engine hard-coded grid ticks to the (xLo, yLo) floor corner, which at the DEFAULT view
     * is the FARTHEST corner, so five of seven labels landed geometrically inside a drawn quad —
     * marching diagonally out of the middle of the figure. The old tests could not see it: the
     * engine's only tick test checked that no two ticks coincide, and this file's only tick test
     * checked that the label text existed in the DOM.
     *
     * This reads the label positions and the polygons back out of the RENDERED SVG, so it covers
     * the component's own dx/dy offsets as well as the engine's placement — the offsets are part
     * of where a label actually lands, and the MAGNITUDE of them lives here. (Their DIRECTION
     * does not: the engine hands over `xTickOutward`/`yTickOutward`, because which way is out is
     * a fact about the projection. See the azimuth band below.)
     *
     * AND IT NOW SUPPLIES A zDomain, which is the input that broke the claim it makes. The loop
     * never did, so it could not see the second half of the same defect: with a caller-supplied
     * domain the observed values escape, `mapTo` returns a NEGATIVE box height below `zLo`, and
     * the sheet descends below the near floor edge the labels were anchored to — every plan tick
     * then reads as an annotation sitting ON the surface. [4000, 8000] puts the sheet below the
     * box (observed low is −800); [−10000, −5000] puts it entirely above, the direction that was
     * already safe and is covered so the fix is not mistaken for a one-sided patch.
     */
    const domains: readonly (readonly [number, number] | undefined)[] = [
      undefined, [4000, 8000], [-10000, -5000],
    ];
    /*
     * 91–98 AND 271 ARE NOT DECORATION ON THIS LIST — they are the band the seven sampled
     * azimuths stepped over. The engine picks the near x edge from the view, and just past a
     * right angle that choice flips while the renderer went on pushing the y labels LEFT; a
     * sweep of every whole azimuth put "40h"/"60h"/"80h" inside a drawn quad at 91, 92, 93, 94,
     * 95, 96, 97, 98 and 271, with the engine's own anchors clear at every one of them. A title
     * saying "at every azimuth" over a list that misses the only failing band is how the second
     * half of this defect survived the suite written to catch the first half.
     */
    for (const azimuthDeg of [10, 45, 91, 93, 95, 98, 100, 170, 200, 260, 271, 350]) {
      for (const zDomain of domains) {
        const view = { azimuthDeg, elevationDeg: 35.264389682754654, scale: 1 };
        const { container, unmount } = plot(mesh(input(FULL, zDomain ? { view, zDomain } : { view })));
        const polys = [...container.querySelectorAll('[data-kind="quad"]')]
          .map((el) => el.getAttribute('points') ?? '');
        const labels = [...container.querySelectorAll('text')];
        expect(labels.length).toBeGreaterThan(0);
        expect(polys.length).toBeGreaterThan(0);
        for (const label of labels) {
          const px = Number(label.getAttribute('x'));
          const py = Number(label.getAttribute('y'));
          for (const points of polys) {
            if (insideRenderedPolygon(px, py, points)) {
              throw new Error(
                `label "${label.textContent}" at (${px.toFixed(2)}, ${py.toFixed(2)}) is on the sheet `
                + `at azimuth ${azimuthDeg}, zDomain ${zDomain ? `${zDomain[0]}–${zDomain[1]}` : 'observed'}`,
              );
            }
          }
        }
        unmount();
      }
    }
  });

  it('marks a cell drawn through a face of the box, so clamped ink is not read as ceiling ink', () => {
    /*
     * The engine does not clamp the geometry but DOES clamp `shade`, so a cell beyond the box
     * arrives at the maximum ink `fillOpacityFor` can produce — pixel-identical to a legitimate
     * cell at the ceiling. Under this domain every cell of FULL (−800…9000) is outside 4000…8000
     * on at least one corner, and the ones whose MEAN is outside also carry the clamp flag.
     */
    const g = mesh(input(FULL, { zDomain: [4000, 8000] }));
    const { container } = plot(g);
    const outside = [...container.querySelectorAll('[data-kind="quad"][data-outside-domain="true"]')];
    expect(g.quads.filter((q) => q.outsideDomain).length).toBe(g.quads.length);
    expect(outside.length).toBe(g.quads.length);
    // The mark is drawn, not merely recorded in an attribute nobody sees.
    expect(container.querySelectorAll('[data-outside-domain-mark="true"]').length).toBe(g.quads.length);
    // The clamped subset is labelled separately, because a cell can be drawn through both faces
    // while its mean sits inside the box and its ink is honest.
    const clamped = g.quads.filter((q) => q.shadeClamped);
    expect(clamped.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-shade-clamped="true"]').length).toBe(clamped.length);
    // An in-domain surface carries neither flag: this is not decoration on every cell.
    const plain = plot(mesh(input(FULL)));
    expect(plain.container.querySelectorAll('[data-outside-domain="true"]').length).toBe(0);
    expect(plain.container.querySelectorAll('[data-outside-domain-mark="true"]').length).toBe(0);
  });

  it('draws no zero plane when the margins never cross zero', () => {
    const allPositive: SurfaceGridInput['rows'] = [
      [1000, 3000, 6000, 9000],
      [900, 2200, 5100, 8100],
      [800, 900, 4000, 7000],
    ];
    const { container } = plot(mesh(input(allPositive)));
    expect(container.querySelector('[data-testid="surface-zero-plane"]')).toBeNull();
    expect(screen.getByTestId('surface-notices').textContent).toMatch(/Z_DOMAIN_EXCLUDES_ZERO/);
  });
});

/**
 * ── THE GAP LEGEND MUST DESCRIBE WHAT `Hole()` ACTUALLY DRAWS ───────────────────────
 *
 * Two absences are drawn differently — a cross for never-measured, a fine 0.8-1.2 dash for
 * withheld — and for a long time NOTHING on the panel said which was which. The frame reported
 * how MANY cells were of each kind, so the counts were honest while the picture was undecodable:
 * a reader could see two sorts of gap and had no way to tell which sort they were looking at.
 *
 * The reason this is worth a test rather than a comment is that a caption drifted from this exact
 * renderer and inverted the meaning. `docs/3d/e5/entry.ts` told an operator "Holes are cells never
 * measured; hatched cells are withheld" — both kinds are dashed holes, so that sentence sends a
 * reader to the wrong cells. It survived because nothing tied the words to the marks.
 *
 * So these assertions read the SVG and the sentence and require them to agree. If someone changes
 * the dash, drops the cross, or rewords the legend, exactly one of these fails.
 */
describe('SurfacePlot — the gap legend and the marks agree', () => {
  const BOTH: SurfaceGridInput['rows'] = [
    [1000, 3000, 6000, 9000],
    [400, WITHHELD, 5100, 8100],
    [-800, 900, null, 7000],
  ];

  it('names both marks when both kinds of gap are on screen', () => {
    plot(mesh(input(BOTH)));
    const dd = screen.getByText(/a cross marks cells touching a never-measured point/);
    expect(dd.textContent).toMatch(/a fine dash marks cells touching a withheld one/);
    /* The two properties are independent in `Hole()`, so the legend must not imply exclusivity —
       a cell touching an absent corner AND a withheld one carries a cross AND a fine dash. */
    expect(dd.textContent).toMatch(/a cell touching both carries both/);
  });

  it('the CROSS appears on exactly the cells the legend attributes it to', () => {
    const { container } = plot(mesh(input(BOTH)));
    const holes = [...container.querySelectorAll('g[data-hole="true"]')];
    expect(holes.length).toBeGreaterThan(0);
    for (const h of holes) {
      const hasCross = h.querySelectorAll('line').length === 2;
      /* `data-absent` is the renderer's own record of touching a never-measured corner. The
         legend says "a cross marks cells touching a never-measured point", so these must be the
         same set of cells — not merely overlapping. */
      expect(hasCross).toBe(h.getAttribute('data-absent') === 'true');
    }
  });

  it('the FINE DASH appears on exactly the cells the legend attributes it to', () => {
    const { container } = plot(mesh(input(BOTH)));
    const holes = [...container.querySelectorAll('g[data-hole="true"]')];
    for (const h of holes) {
      const dash = h.querySelector('polygon')?.getAttribute('stroke-dasharray');
      /* 0.8 1.2 is the withheld dash; 2 2 is the fallback. Asserting the literal values on
         purpose: a legend that says "fine dash" is a claim about the STROKE, and a test that only
         checked "the dash differs" would pass if the two were swapped. */
      expect(dash).toBe(h.getAttribute('data-withheld') === 'true' ? '0.8 1.2' : '2 2');
    }
  });

  it('says nothing at all when the surface has no gaps', () => {
    plot(mesh(input(FULL)));
    /* A legend for a mark that is not on screen is noise on a panel whose every line is read by
       someone deciding whether to trust the surface. */
    expect(screen.queryByText(/a cross marks cells/)).toBeNull();
    expect(screen.queryByText(/a fine dash marks cells/)).toBeNull();
  });
});
