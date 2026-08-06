import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrategicMatrix } from '../StrategicMatrix';
import { competitors } from '@/data';
import { computeAllScores } from '@/lib/competitiveScoring';
import { useFilterStore } from '@/stores';

/**
 * This file exists because competitiveScoring.ts made marketVolume `number | null`
 * and this is the ONE surface that plots it. Before the change it plotted an
 * unmeasured competitor's 0 on the y-axis, printed "0/100" in the tooltip, and
 * silently deleted any competitor whose volume and regulatory score were both 0
 * via `s.marketVolume > 0 || s.preClarityRegulatory > 0`. There was no test file
 * here at all, so none of that had to survive a regression.
 */

beforeEach(() => {
  useFilterStore.setState({ clarityEnacted: false, spdiEquivalence: false });
});

const scores = computeAllScores(competitors);
const unmeasured = scores.filter(s => s.marketVolume === null);

describe('StrategicMatrix — an unmeasured competitor is neither plotted nor deleted', () => {
  it('plots exactly the competitors whose volume was measured', () => {
    render(<StrategicMatrix />);
    const measured = scores.filter(s => s.marketVolume !== null);
    // One focusable circle per dot (the painted circle carries the tabindex).
    const dots = document.querySelectorAll('circle[role="button"]');
    expect(dots).toHaveLength(measured.length);
    expect(measured.length).toBeLessThan(scores.length);
  });

  it('names every unmeasured competitor instead of dropping it from the page', () => {
    render(<StrategicMatrix />);
    const panel = screen.getByTestId('matrix-unmeasured');
    // The five the old visibility predicate deleted outright: volume 0 AND
    // preClarityRegulatory 0, so neither disjunct was true.
    for (const name of ['KuCoin', 'Bybit', 'Ondo Finance', 'MetaMask', 'Lido']) {
      expect(panel.textContent).toContain(name);
    }
    expect(panel.textContent).toContain(`${unmeasured.length} of ${scores.length} competitors`);
    expect(panel.textContent).toMatch(/not plotted/i);
  });

  it('says why, and does not present the gap as a zero', () => {
    render(<StrategicMatrix />);
    const panel = screen.getByTestId('matrix-unmeasured');
    expect(panel.textContent).toMatch(/absent from the plot rather than placed at zero/i);
    expect(panel.textContent).toMatch(/no quadrant verdict is assigned/i);
    // The recorded strings are shown as written, not converted to numbers.
    expect(panel.textContent).toContain('Trillions annually');
  });

  it('counts the unmeasured beside the quadrant counts', () => {
    render(<StrategicMatrix />);
    const counts = screen.getByTestId('matrix-quadrant-counts');
    expect(counts.textContent).toContain('NOT MEASURED');
    // Four quadrant counts that sum to 7 of 26 read as if 19 competitors were
    // nowhere, so the fifth tile carries them.
    expect(counts.textContent).toContain(String(unmeasured.length));
  });

  it('keeps a MEASURED zero on the chart', () => {
    // Superstate's volume is a measured 0 with regulatory 0, so the old
    // predicate deleted it — the one case where `marketVolume > 0` removed a
    // reading that had actually been taken.
    const superstate = scores.find(s => s.id === 'superstate')!;
    expect(superstate.marketVolume).toBe(0);
    render(<StrategicMatrix />);
    expect(screen.getByTestId('matrix-unmeasured').textContent).not.toContain('Superstate');
    expect(document.body.textContent).toContain('Superstate');
  });

  it('labels the volume axis as a lower bound', () => {
    render(<StrategicMatrix />);
    // competitiveScoring.ts declares the scores to be lower bounds; the surface
    // used to print them as plain "/100" values with no qualifier anywhere.
    expect(document.body.textContent).toMatch(/LOWER BOUND/);
    expect(document.body.textContent).toMatch(/never counted as zero/i);
  });
});
