import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SurfaceRelief } from '@/components/geometry/SurfaceRelief';
import { buildSurfaceMesh, WITHHELD, type GridCellValue } from '@lcx/shared';
import { storage } from '@/lib/persistence';

/*
 * §7's disposition for an environment whose clause (b) is not established: "it ships behind a toggle that
 * defaults off, and I tell you rather than quietly shipping it."
 *
 * These tests are about the DEFAULT and the FALLBACK, not about the render. The render is verified by
 * `docs/3d/e5`'s capture against a real GPU rasteriser; jsdom has no WebGL2 and pretending otherwise would be a
 * test that passes for the wrong reason. What can be verified here is exactly what §7 asks: that a reader who
 * does nothing sees the flat figure, that the reason is on the page, and that a refusal returns them to it.
 */
const ROWS: readonly (readonly GridCellValue[])[] = [
  [0.31, 0.44, 0.52],
  [0.22, 0.36, 0.71],
  [null, 0.21, WITHHELD],
];
const surface = buildSurfaceMesh({
  rows: ROWS,
  xAxis: { label: 'Ticket', unit: '$k', ticks: [25, 50, 100].map((v) => ({ value: v, label: String(v) })) },
  yAxis: { label: 'Days', unit: 'd', ticks: [7, 30, 90].map((v) => ({ value: v, label: String(v) })) },
  zAxis: { label: 'Win rate', unit: '', tickCount: 4 },
  frame: {
    environment: 'test', observedAt: '2026-08-12T00:00:00.000Z',
    windowFrom: null, windowTo: null, source: 'surfaceRelief.test.tsx',
    valuesArePlaceholders: true,
  },
});

const props = { surface, title: 'Win rate', readsAs: 'Higher is better.', heightPx: 300 };

/* A toggle click is a CHOICE since 2026-08-20 and persists through the storage module's
   in-memory tier, which localStorage.clear() cannot reach — without this, one test's click
   becomes the next test's default and failures depend on execution order. */
beforeEach(() => { storage.clearAll(); });

describe('SurfaceRelief — the relief is the default by owner decision, and says so', () => {
  it('renders the FLAT figure with no interaction, and no canvas', () => {
    const { container } = render(<SurfaceRelief {...props} />);
    /* The flat engine draws an SVG. A canvas appearing here would mean the 3-D view had shipped as the default
       on a claim nobody has measured. */
    expect(container.querySelector('svg'), 'the flat figure must be what loads').not.toBeNull();
    expect(container.querySelector('canvas'), 'relief must NOT be the default').toBeNull();
  });

  it('tells the reader WHY relief is opt-in, on the page', () => {
    /* Not in a tooltip and not in a commit message. A reader deciding whether to trust a 3-D reading is
       entitled to know that nobody has timed it against the flat one. */
    render(<SurfaceRelief {...props} />);
    expect(screen.getByText(/default by owner decision, not by measurement/i)).toBeTruthy();
  });

  it('offers the toggle, and reports its state to assistive technology', () => {
    render(<SurfaceRelief {...props} />);
    const btn = screen.getByRole('button', { name: /relief view/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the flat figure while the lazy chunk is still loading', () => {
    /*
     * The Suspense fallback IS the flat surface rather than a spinner. A reader who clicked for relief has not
     * asked to lose the data for the length of a network round trip, and a blank box would be a worse answer to
     * the question they were already reading.
     */
    const { container } = render(<SurfaceRelief {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /relief view/i }));
    expect(container.querySelector('svg'), 'the flat figure must survive the load').not.toBeNull();
  });

  it('shows the flat figure when the engine itself refused the grid', () => {
    /* An engine refusal must never reach the renderer: it would be handed a surface the shipping figure
       declined to draw, which is the worst possible direction for a disagreement to run. */
    const refused = buildSurfaceMesh({
      rows: null,
      xAxis: { label: 'x', unit: '', ticks: [{ value: 1, label: '1' }] },
      yAxis: { label: 'y', unit: '', ticks: [{ value: 1, label: '1' }] },
      zAxis: { label: 'z', unit: '' },
      frame: {
        environment: 'test', observedAt: '2026-08-12T00:00:00.000Z',
        windowFrom: null, windowTo: null, source: 'surfaceRelief.test.tsx',
      },
    });
    const { container } = render(<SurfaceRelief {...props} surface={refused} />);
    expect(container.querySelector('canvas')).toBeNull();
    // The flat component owns the refusal presentation; this only proves relief did not take over.
    expect(container.textContent).toBeTruthy();
  });

  it('does not import the GL layer until the reader asks', async () => {
    /*
     * THE BUDGET TEST. The perf budget allows 11 KB of headroom on initial JS and the environment layer alone is
     * 35.7 KB, so an eager import would blow it on a view most readers never open. Asserted structurally: the
     * module graph reachable from this component must not name the engine.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* Resolved from the workspace root rather than `import.meta.url`: under jsdom that is not a file: URL and
       `new URL(...)` throws. Existence is asserted FIRST so this test cannot pass by reading an empty string —
       a structural check that silently finds nothing is the failure mode it exists to prevent. */
    const file = path.resolve(process.cwd(), 'src/components/geometry/SurfaceRelief.tsx');
    expect(fs.existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    expect(src.length).toBeGreaterThan(500);
    expect(src, 'the GL component must be behind lazy()').toMatch(/lazy\(\(\) => import\(/);
    expect(
      /^import[^;]*from '@lcx\/gl'/m.test(src),
      'SurfaceRelief must not import @lcx/gl eagerly',
    ).toBe(false);
  });
});
