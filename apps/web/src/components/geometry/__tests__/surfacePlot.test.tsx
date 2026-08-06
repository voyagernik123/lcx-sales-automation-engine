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

  it('draws a WITHHELD gap differently from a never-measured one, and counts it separately', () => {
    /*
     * Present-but-withheld is the third of the house's three states and it has to be visible AS
     * such: a reader looking at a gap must be able to tell "nobody measured this" from "this was
     * measured and you may not see it", because those are different questions to ask next. Both
     * would have rendered as one identical dashed cross while the frame reported them in one
     * "absent" number.
     */
    const withheldRows: SurfaceGridInput['rows'] = [
      [1000, 3000, 6000, 9000],
      [400, 2200, 5100, 8100],
      [-800, WITHHELD, null, 7000],
    ];
    const g = mesh(input(withheldRows));
    const { container } = plot(g);
    const holes = [...container.querySelectorAll('[data-hole]')];
    const withheldHoles = holes.filter((h) => h.getAttribute('data-withheld') === 'true');
    const absentHoles = holes.filter((h) => h.getAttribute('data-withheld') === null);
    expect(withheldHoles.length).toBeGreaterThan(0);
    expect(absentHoles.length).toBeGreaterThan(0);
    // Different dash, and only the never-measured gap carries the cross.
    for (const h of withheldHoles) {
      expect(h.querySelector('polygon')?.getAttribute('stroke-dasharray')).toBe('0.8 1.2');
      expect(h.querySelectorAll('line').length).toBe(0);
    }
    for (const h of absentHoles) {
      expect(h.querySelector('polygon')?.getAttribute('stroke-dasharray')).toBe('2 2');
      expect(h.querySelectorAll('line').length).toBe(2);
    }
    // Three counts on the frame, and two separate notices — never one merged "missing" number.
    expect(screen.getByTestId('surface-frame').textContent)
      .toMatch(/10 grid points observed, 1 never measured, 1 present but withheld/);
    const notices = screen.getByTestId('surface-notices').textContent ?? '';
    expect(notices).toMatch(/HOLES_PRESENT/);
    expect(notices).toMatch(/CELLS_WITHHELD/);
    expect(notices).toMatch(/measured and are not shown here/);
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

  it('puts no RENDERED tick label on the sheet, at every azimuth the engine will draw', () => {
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
     * of where a label actually lands, and they live here rather than in the engine.
     */
    for (const azimuthDeg of [10, 45, 100, 170, 200, 260, 350]) {
      const view = { azimuthDeg, elevationDeg: 35.264389682754654, scale: 1 };
      const { container, unmount } = plot(mesh(input(FULL, { view })));
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
              + `at azimuth ${azimuthDeg}`,
            );
          }
        }
      }
      unmount();
    }
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
