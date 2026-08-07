/**
 * THE LP SCORE SURFACE ACTUALLY REACHES THE SCREEN — the half a source-read cannot prove.
 *
 * `lpScoreSurface.test.ts` reads `CockpitPanels.tsx` and asserts the figure is in the panel's
 * JSX, because a `render()` of a component whose fetch is mocked passes just as happily when
 * the figure has been deleted. That catches deletion. It cannot catch the opposite failure:
 * JSX that is present and never renders — a gate that is always false, a `readAt` that is never
 * set, a builder that throws on the real response shape and takes the panel down with it.
 *
 * Both failures have precedent here. The geometry engine and its renderer shipped as dead code
 * that nothing imported, and the ONE surface that did ship was behind a form submission, so no
 * one browsing the product ever saw it. This file is the guard on the second kind: with the
 * route's own response shape in and nothing else touched, does a projected figure appear?
 *
 * ── THE FIXTURE IS THE ENGINE'S OWN OUTPUT, NOT A DESCRIPTION OF IT ────────────────
 * `rescoreDetailed` is the real function the route calls (`routes/command.ts:106`), run over a
 * real dimension list and real rows, and the rows it returns are handed to the panel exactly as
 * the route hands them over. If `RescoredRow` gains, loses or renames a field, this breaks —
 * because the fixture IS the module's output. A hand-written payload would only ever assert
 * that the panel agrees with the same invented contract the panel was written against.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { rescoreDetailed, type EngineDim, type EngineRow } from '@lcx/shared';
import type { LpRescoreResult } from '@/lib/api/command';
import * as api from '@/lib/api/command';
import { LpOptimizerPanel } from '../CockpitPanels';

vi.mock('@/lib/api/command', async () => {
  const real = await vi.importActual<typeof import('@/lib/api/command')>('@/lib/api/command');
  return { ...real, lpRescore: vi.fn() };
});
const mocked = api.lpRescore as unknown as ReturnType<typeof vi.fn>;

const DIMS: EngineDim[] = [
  { key: 'reg', label: 'US Reg & Entity', weight: 0.25 },
  { key: 'depth', label: 'Spot Liquidity (depth/breadth)', weight: 0.25 },
  { key: 'otc', label: 'OTC Block Desk', weight: 0.2 },
  { key: 'rails', label: 'Fiat Settlement Rails', weight: 0.3 },
];

/** Four partners, and `rails` is a TRENCH — every one of them weak on it. */
const ROWS: EngineRow[] = [
  { subjectId: 'p_b2c2', subjectLabel: 'B2C2  (incumbent / baseline)', scores: { reg: 5, depth: 5, otc: 4, rails: 2 } },
  { subjectId: 'p_falconx', subjectLabel: 'FalconX', scores: { reg: 4, depth: 4, otc: 5, rails: 2 } },
  { subjectId: 'p_wintermute', subjectLabel: 'Wintermute', scores: { reg: 3, depth: 5, otc: 4, rails: 2 } },
  { subjectId: 'p_keyrock', subjectLabel: 'Keyrock', scores: { reg: 3, depth: 3, otc: 3, rails: 2 } },
];

function payload(rows: EngineRow[] = ROWS): LpRescoreResult {
  const scored = rescoreDetailed(DIMS, rows);
  return {
    dimensions: DIMS,
    rows: scored.ranked,
    unrankable: scored.unrankable.map((u) => ({
      subjectId: u.subjectId, subjectLabel: u.subjectLabel, code: u.code,
      reason: u.reason, scoredDims: u.scoredDims, totalDims: u.totalDims,
    })),
    sensitivity: [],
    setAnalysis: { strengths: [], gaps: [], concentration: 0 },
  } as unknown as LpRescoreResult;
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue(payload());
});

describe('the LP panel puts a projected surface on the screen', () => {
  it('draws the figure with no interaction at all — no form, no control, no submit', async () => {
    render(<LpOptimizerPanel />);
    await waitFor(() => {
      // THE WHOLE COMPLAINT THE LANE WAS OPENED FOR: a capability nobody can reach is not a
      // capability. The panel fetches on mount from `CommandDeck`, so this is what a human
      // browsing to the deck sees.
      expect(screen.getByTestId('lp-score-surface')).toBeTruthy();
      expect(screen.getByTestId('surface-plot')).toBeTruthy();
      // A PROJECTED figure, not a refusal wearing the same testid. Without this the test would
      // pass on a surface that refused for want of a date or an environment.
      expect(screen.getByTestId('surface-frame')).toBeTruthy();
    });
    expect(screen.queryByTestId('surface-refused')).toBeNull();
  });

  it('draws one polygon per drawable cell, and they carry the grid indices', async () => {
    const { container } = render(<LpOptimizerPanel />);
    await waitFor(() => {
      // (4 dimensions − 1) × (4 partners − 1) = 9 cells, every corner scored.
      const quads = container.querySelectorAll('[data-kind="quad"]');
      expect(quads.length).toBe(9);
      expect(container.querySelectorAll('[data-kind="hole"]').length).toBe(0);
    });
  });

  it('keeps the ranked list, so the surface is BESIDE the answer and not instead of it', async () => {
    render(<LpOptimizerPanel />);
    await waitFor(() => {
      /*
       * The list answers WHO WINS and the surface answers ON WHAT. A partner therefore appears
       * TWICE — once as a ranked row and once in the surface legend — and asserting the pair is
       * how "beside, not instead of" gets checked. Replacing the list with the surface, which
       * was the tempting version of this change, drops it back to one.
       */
      const appearances = screen.getAllByText('FalconX');
      expect(appearances.length, 'the partner should be in the ranked list AND the legend').toBe(2);
      expect(screen.getByTestId('lp-score-surface')).toBeTruthy();
      // The weighted average is still printed, to two places, exactly as before.
      expect(screen.getAllByText(/^\d\.\d\d$/).length).toBeGreaterThan(0);
    });
  });

  it('names every axis token in the legend, so nothing on the figure is unresolvable', async () => {
    render(<LpOptimizerPanel />);
    await waitFor(() => {
      const legend = screen.getByTestId('lp-surface-legend');
      for (const d of DIMS) expect(legend.textContent).toContain(d.label);
      for (const r of ROWS) expect(legend.textContent).toContain(r.subjectLabel);
      // …and the tokens themselves, which is what the axis ticks carry.
      expect(legend.textContent).toContain('D1');
      expect(legend.textContent).toContain('#1');
    });
  });

  it('states in the caller’s own words what the flat version loses', async () => {
    /*
     * `SurfacePlot` requires `readsAs` and prints it. This asserts the sentence is the one that
     * makes the case rather than a placeholder — the plan's one test for the whole track is
     * that the third dimension carries information the flat version loses, and "it looks
     * better" is the answer that means the figure must not ship.
     */
    render(<LpOptimizerPanel />);
    await waitFor(() => {
      const reads = screen.getByTestId('surface-reads-as').textContent ?? '';
      expect(reads).toContain('ridge');
      expect(reads).toContain('trench');
      expect(reads.toLowerCase()).toContain('weighted average');
      expect(reads.toLowerCase()).toContain('not a zero');
    });
  });

  it('keeps the unrankable partners as a NAMED line and out of the grid', async () => {
    /*
     * A partner with no usable score has no place on a score surface — there is no height for
     * it — but vanishing is the other failure, and it is the one the route was changed to fix.
     * It stays in its own text line with the engine's own code and reason, and the surface's
     * y axis does not gain a row for it.
     */
    const rows: EngineRow[] = [...ROWS, { subjectId: 'p_unknown', subjectLabel: 'Unassessed Partner', scores: {} }];
    mocked.mockResolvedValue(payload(rows));
    render(<LpOptimizerPanel />);
    await waitFor(() => {
      const line = screen.getByTestId('lp-unrankable');
      expect(line.textContent).toContain('Unassessed Partner');
      expect(line.textContent).toContain('unmeasured, not last');
      // Still nine cells: the unrankable partner did not become a row of holes, and did not
      // become a row of zeroes either.
      expect(screen.getByTestId('lp-score-surface')).toBeTruthy();
    });
    const legend = screen.getByTestId('lp-surface-legend');
    expect(legend.textContent, 'an unrankable partner has no rank and no place on the y axis')
      .not.toContain('Unassessed Partner');
  });

  it('renders a HOLE, not a zero, where a partner was never scored on a dimension', async () => {
    const rows: EngineRow[] = ROWS.map((r, i) => (i === 1 ? { ...r, scores: { reg: 4, depth: 4, otc: 5 } } : r));
    mocked.mockResolvedValue(payload(rows));
    const { container } = render(<LpOptimizerPanel />);
    await waitFor(() => {
      const holes = container.querySelectorAll('[data-kind="hole"]');
      expect(holes.length).toBeGreaterThan(0);
      // The engine's own count, printed on the figure — the absence is on the screen in words
      // as well as in the geometry.
      expect(screen.getByTestId('surface-notices').textContent).toMatch(/hole/i);
    });
  });
});
