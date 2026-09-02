/**
 * E1 REBUILT (THE PRODUCTION, P4): the readiness gauge CARRIES the deck's figures. The old dial drew an arc and a needle and
 * no data marks, which is why it was retired; this one must show one segment per dial, sized by weight and toned by score,
 * plus the composite needle and number. Rendered against a fixed Readiness, the marks are counted and read back.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';


const READINESS = { score: 62, dials: [
  { key: 'liquidity', label: 'Liquidity', score: 71, weight: 0.3 }, { key: 'compliance', label: 'Compliance', score: 55, weight: 0.25 },
  { key: 'rails', label: 'Rails', score: 48, weight: 0.15 }, { key: 'distribution', label: 'Distribution', score: 74, weight: 0.15 },
  { key: 'team', label: 'Team', score: 66, weight: 0.15 },
] };

vi.mock('@/lib/api/command', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/api/command')>();
  return { ...mod, fetchReadiness: vi.fn(async () => READINESS) };
});

describe('E1 — the readiness gauge carries the deck\'s figures', () => {
  it('draws one weighted segment per dial, the needle at the composite, and the number', async () => {
    const { ReadinessDial } = await import('../CockpitPanels');
    render(<ReadinessDial />);
    const svg = await waitFor(() => screen.getByTestId('readiness-gauge'));
    const segments = svg.querySelectorAll('path[data-dial]');
    expect(segments, 'one segment per dial').toHaveLength(READINESS.dials.length);
    const weights = [...segments].map((p) => Number(p.getAttribute('data-weight')));
    expect(weights).toEqual(READINESS.dials.map((d) => d.weight));
    const needle = screen.getByTestId('readiness-needle');
    expect(Number(needle.getAttribute('data-angle'))).toBeCloseTo((62 / 100) * 270 - 135, 0);
    expect(screen.getByText('62')).toBeTruthy();
    expect(svg.getAttribute('aria-label')).toContain('62 of 100');
  });
});
