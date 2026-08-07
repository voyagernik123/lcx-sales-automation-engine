/**
 * THE SCORECARD TABLE STOPPED RENDERING AN UNSCORED CELL AS A FAILING ONE.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────
 * `DeepOntologyPanel`'s cell was:
 *
 *     const v = r.scores[d.key];
 *     <span className={v >= 5 ? emerald : v >= 4 ? cyan : v >= 3 ? grey : RED}>{v}</span>
 *
 * `scores` is typed `Record<string, number>` and `noUncheckedIndexedAccess` is off, so `v`
 * types as `number` while at runtime it is whatever the JSON held. Every comparison against
 * `undefined` is false, so a dimension NOBODY ASSESSED fell through to the last branch and
 * rendered as an empty box on the RED ground — visually the worst score on the card. A value
 * recorded as `null` ("there is no value here") rendered identically. That is the
 * absent-is-not-zero collapse that was taken out of the ranking engine this week
 * (`commandEngines.ts:105`), still live on the table displaying the same rows.
 *
 * ── WHAT THESE TESTS CAN AND CANNOT SEE ───────────────────────────────────────────
 * jsdom has no layout and no paint, so "the red tint is gone" is asserted here as
 * `data-cell-state` and as the absence of the red utility class in `className`. That is a
 * real regression guard on the branch taken; it is not a claim about what a human perceives,
 * and nothing in this file should be read as one.
 *
 * The fixture is deliberately NOT the shipped seed. Every cell in `data2.ts` is scored today,
 * so a test over it would pass against the broken code as happily as the fixed code — the
 * defect is latent until the first partial scorecard lands, which is exactly when nobody will
 * be looking. The states are induced here instead.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { CommandDeep, Scorecard } from '@/lib/api/command';
import * as api from '@/lib/api/command';
import { DeepOntologyPanel } from '../DeepOntologyPanel';
import { scorecardCellState } from '../CockpitPanels';

vi.mock('@/lib/api/command', async () => {
  const real = await vi.importActual<typeof import('@/lib/api/command')>('@/lib/api/command');
  return { ...real, fetchCommandDeep: vi.fn() };
});
const mocked = api.fetchCommandDeep as unknown as ReturnType<typeof vi.fn>;

const DIMS = [
  { key: 'reg', label: 'US Reg & Entity', weight: 0.3 },
  { key: 'depth', label: 'Spot Liquidity', weight: 0.3 },
  { key: 'rails', label: 'Fiat Settlement Rails', weight: 0.2 },
  { key: 'fit', label: 'Integration Fit', weight: 0.2 },
];

/**
 * One row per state, so a single render exercises all four branches. `scores` is cast because
 * the declared type cannot express the runtime conditions this test is entirely about — which
 * is the reason the defect existed.
 */
const ROWS = [
  { subjectId: 'p_all', subjectLabel: 'Fully scored', scores: { reg: 5, depth: 4, rails: 3, fit: 2 }, weighted: 3.6, rank: 1, tier: 'A' },
  { subjectId: 'p_absent', subjectLabel: 'Never assessed on rails', scores: { reg: 5, depth: 4, fit: 2 }, weighted: 3.9, rank: 2, tier: 'B' },
  { subjectId: 'p_withheld', subjectLabel: 'Rails withheld', scores: { reg: 5, depth: 4, rails: null, fit: 2 }, weighted: 3.9, rank: 3, tier: 'B' },
  { subjectId: 'p_junk', subjectLabel: 'Rails malformed', scores: { reg: 5, depth: 4, rails: 'high', fit: 2 }, weighted: 3.9, rank: 4, tier: 'C' },
  { subjectId: 'p_zero', subjectLabel: 'Genuine zero on rails', scores: { reg: 5, depth: 4, rails: 0, fit: 2 }, weighted: 2.6, rank: 5, tier: 'D' },
] as unknown as Scorecard['rows'];

const SCORECARD: Scorecard = { dimensions: DIMS, rows: ROWS };

function deep(): CommandDeep {
  return {
    reference: {
      defaultGrade: 'C3',
      scorecards: { lp: SCORECARD, channel: SCORECARD, arch: SCORECARD, twoPath: SCORECARD },
      stablecoinPolicy: [],
      ddDimensions: [],
      sources: [{ id: '1', phase: 'p1', label: 'a source', url: null }],
    },
  } as unknown as CommandDeep;
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue(deep());
});

/** The rendered cell for one subject on one dimension, found by its row label. */
async function cellOf(subjectLabel: string, colIndex: number): Promise<HTMLElement> {
  const row = (await screen.findByText(subjectLabel)).closest('tr');
  expect(row, `no row rendered for ${subjectLabel}`).not.toBeNull();
  // +1: the first cell of the row is the subject name.
  const td = row!.querySelectorAll('td')[colIndex + 1];
  expect(td, `no cell at column ${colIndex} for ${subjectLabel}`).toBeTruthy();
  const span = td.querySelector('[data-cell-state]');
  expect(span, `cell ${colIndex} for ${subjectLabel} carries no state`).not.toBeNull();
  return span as HTMLElement;
}

describe('the four runtime states of a scorecard cell are kept apart', () => {
  it('reads each state off the raw object exactly as the ranking engine does', () => {
    // The predicate itself, with no rendering in the way. `commandEngines.ts:184` is the
    // reference implementation; both files must agree about which cells exist or the surface
    // and the ranking will disagree about the same bench.
    expect(scorecardCellState({ reg: 5 }, 'rails')).toBe('absent');
    expect(scorecardCellState({ rails: null }, 'rails')).toBe('withheld');
    expect(scorecardCellState({ rails: 'high' }, 'rails')).toBe('malformed');
    expect(scorecardCellState({ rails: 0 }, 'rails')).toBe('scored');
  });

  it('renders a never-scored dimension as an absence and not as a low score', async () => {
    render(<DeepOntologyPanel />);
    await waitFor(async () => {
      const cell = await cellOf('Never assessed on rails', 2);
      expect(cell.getAttribute('data-cell-state')).toBe('absent');
      // MUTATION OBSERVED: restore the old inline cell and five of the seven tests here go red.
      // This one fails inside `cellOf`, before its own assertions run, with
      // `cell 2 for Never assessed on rails carries no state: expected null not to be null` —
      // the old markup emits no `data-cell-state` at all, because it had no state to emit.
      expect(cell.textContent).toBe('—');
      expect(cell.className, 'an unscored cell must not be tinted like a failing one')
        .not.toContain('red');
    });
  });

  it('renders a withheld dimension under its own state, not merged with absence', async () => {
    render(<DeepOntologyPanel />);
    await waitFor(async () => {
      const cell = await cellOf('Rails withheld', 2);
      expect(cell.getAttribute('data-cell-state')).toBe('withheld');
      expect(cell.className).not.toContain('red');
    });
    // The two are never the same rendering — the negative, deliberately outside the barrier.
    const absent = await cellOf('Never assessed on rails', 2);
    const withheld = await cellOf('Rails withheld', 2);
    expect(withheld.getAttribute('data-cell-state')).not.toBe(absent.getAttribute('data-cell-state'));
    expect(withheld.textContent).not.toBe(absent.textContent);
  });

  it('marks a malformed value as junk rather than as data', async () => {
    render(<DeepOntologyPanel />);
    await waitFor(async () => {
      const cell = await cellOf('Rails malformed', 2);
      expect(cell.getAttribute('data-cell-state')).toBe('malformed');
      // The string must not be printed as if it were the score.
      expect(cell.textContent).not.toContain('high');
    });
  });

  it('still renders a GENUINE ZERO as a measurement, in the failing band', async () => {
    /*
     * THE HALF EVERYONE FORGETS, and the half that makes this a fix rather than a swap. The
     * naive repair is `if (!v) render an absence`, which erases a real 0 — the engine's own
     * comment calls this out as wrong in both directions. A 0 is a measurement and it belongs
     * in the red band; an absence is not, and does not.
     */
    render(<DeepOntologyPanel />);
    await waitFor(async () => {
      const cell = await cellOf('Genuine zero on rails', 2);
      expect(cell.getAttribute('data-cell-state')).toBe('scored');
      expect(cell.textContent).toBe('0');
      expect(cell.className, 'a real zero is a low score and should read as one').toContain('red');
    });
  });

  it('leaves every fully-scored cell exactly as it rendered before', async () => {
    // The fix must be invisible on the shipped data — all four tiers unchanged. Otherwise it is
    // a redesign wearing a bug fix's clothes.
    render(<DeepOntologyPanel />);
    await waitFor(async () => {
      const row = (await screen.findByText('Fully scored')).closest('tr')!;
      const cells = within(row).getAllByText(/^[0-9]$/);
      expect(cells.map((c) => c.textContent)).toEqual(['5', '4', '3', '2']);
    });
    const row = (await screen.findByText('Fully scored')).closest('tr')!;
    const states = [...row.querySelectorAll('[data-cell-state]')].map((n) => n.getAttribute('data-cell-state'));
    expect(states).toEqual(['scored', 'scored', 'scored', 'scored']);
  });

  it('says on the panel what each non-numeric glyph means', async () => {
    // A glyph with no key is a different kind of unreadable. The legend is part of the table.
    render(<DeepOntologyPanel />);
    await waitFor(() => {
      expect(screen.getByText(/was never scored/)).toBeTruthy();
      expect(screen.getByText(/recorded as withheld/)).toBeTruthy();
      expect(screen.getByText(/None of the three is a zero/)).toBeTruthy();
    });
  });
});
