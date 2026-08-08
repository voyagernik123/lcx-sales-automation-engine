import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ForecastDistribution, type ForecastWithCoverage } from '../ForecastDistribution';

/**
 * WHICH DEAL DECIDES THE QUARTER was computed on every forecast request and thrown away.
 *
 * `monteCarloForecast` recovers it from the 10,000 paths it already walks and returns it at
 * `packages/shared/src/forecast/index.ts:393`. `ForecastSummary` in
 * `apps/api/src/kpi/forecast.ts` simply had no such field, so it was dropped at the API
 * boundary on every call — the same defect shape as the `?? 0` that turned a refusal into a
 * $0 band: no layer is obviously wrong, and the loss happens at a seam.
 *
 * The interesting half is the WITHHELD rows. The engine refuses a swing for two distinct
 * reasons and both must survive to the screen as reasons, not as zeros or dashes.
 */

/** The full ranking lives behind "See the math"; the headline does not. */
const openMath = () => fireEvent.click(screen.getByText(/See the math/i));

const base = (over: Partial<ForecastWithCoverage> = {}): ForecastWithCoverage => ({
  runs: 10_000,
  p10: 100_000, p50: 200_000, p90: 300_000, expected: 205_000,
  simulatedDealCount: 3,
  deals: [
    { id: 'a', projectName: 'ALPHA', stage: 'proposal', value: 50_000, winProbability: 50, daysSinceUpdate: 3 },
    { id: 'b', projectName: 'BRAVO', stage: 'negotiating', value: 200_000, winProbability: 95, daysSinceUpdate: 1 },
    { id: 'c', projectName: 'CHARLIE', stage: 'discovery', value: 9_000, winProbability: 20, daysSinceUpdate: 9 },
  ],
  ...over,
} as ForecastWithCoverage);

describe('the decisiveness ranking reaches the reader', () => {
  it('shows the swing in percentage points with its standard error', () => {
    render(<ForecastDistribution forecast={base({
      decisiveness: [
        { id: 'a', projectName: 'ALPHA', p50SwingPct: 31.4, p50SwingStdErr: 0.92, p50SwingCode: null, swing: 25_000, swingCode: null, wonRuns: 5000, lostRuns: 5000 },
      ],
    })} />);
    openMath();
    // Scoped to the ranking: the deal also appears in the always-visible headline above,
    // so an unscoped query is ambiguous — which is itself worth pinning, because BOTH
    // places are supposed to name it.
    const panel = within(screen.getByTestId('forecast-decisiveness'));
    expect(panel.getByText(/\+31\.4 pp/)).toBeTruthy();
    // The SE is shown BESIDE the estimate, not hidden. A swing without its noise is a
    // ranking that cannot be argued with.
    expect(panel.getByText(/0\.92/)).toBeTruthy();
    expect(panel.getByText('ALPHA')).toBeTruthy();
    expect(screen.getByTestId('decisiveness-headline').textContent).toContain('ALPHA');
  });

  it('it is NOT the expected-value ordering — that is the whole point', () => {
    /*
     * BRAVO is worth 4x ALPHA and is 95% certain, so it tops any p·value list. It moves the
     * ODDS least, because it is already priced into the median. If this table ever agreed
     * with the value column it would be redundant and should be deleted.
     */
    render(<ForecastDistribution forecast={base({
      decisiveness: [
        { id: 'a', projectName: 'ALPHA', p50SwingPct: 31.4, p50SwingStdErr: 0.9, p50SwingCode: null, swing: 25_000, swingCode: null, wonRuns: 5000, lostRuns: 5000 },
        { id: 'b', projectName: 'BRAVO', p50SwingPct: 4.1, p50SwingStdErr: 0.4, p50SwingCode: null, swing: 190_000, swingCode: null, wonRuns: 9500, lostRuns: 500 },
      ],
    })} />);
    openMath();
    const list = screen.getByTestId('forecast-decisiveness').textContent ?? '';
    expect(list.indexOf('ALPHA')).toBeLessThan(list.indexOf('BRAVO'));
  });
});

describe('a withheld swing is not a swing of zero', () => {
  it('names the refusal code instead of printing a number', () => {
    render(<ForecastDistribution forecast={base({
      decisiveness: [
        { id: 'a', projectName: 'ALPHA', p50SwingPct: 12, p50SwingStdErr: 0.5, p50SwingCode: null, swing: 1000, swingCode: null, wonRuns: 5000, lostRuns: 5000 },
        { id: 'c', projectName: 'CHARLIE', p50SwingPct: null, p50SwingStdErr: null, p50SwingCode: 'SE_EXCEEDS_MAGNITUDE', swing: null, swingCode: 'SE_EXCEEDS_MAGNITUDE', wonRuns: 2000, lostRuns: 8000 },
      ],
    })} />);
    openMath();
    const note = screen.getByTestId('decisiveness-withheld');
    expect(note.textContent).toContain('SE_EXCEEDS_MAGNITUDE');
    expect(note.textContent).toMatch(/not a swing of zero/i);
  });

  it('keeps the TWO refusal reasons apart — they are different facts', () => {
    // INSUFFICIENT_ARM = too few paths either way to have a mean worth quoting.
    // SE_EXCEEDS_MAGNITUDE = plenty of paths, estimate inside its own noise.
    render(<ForecastDistribution forecast={base({
      decisiveness: [
        { id: 'a', projectName: 'ALPHA', p50SwingPct: 12, p50SwingStdErr: 0.5, p50SwingCode: null, swing: 1000, swingCode: null, wonRuns: 5000, lostRuns: 5000 },
        { id: 'c', projectName: 'CHARLIE', p50SwingPct: null, p50SwingStdErr: null, p50SwingCode: 'SE_EXCEEDS_MAGNITUDE', swing: null, swingCode: 'SE_EXCEEDS_MAGNITUDE', wonRuns: 2000, lostRuns: 8000 },
        { id: 'd', projectName: 'DELTA', p50SwingPct: null, p50SwingStdErr: null, p50SwingCode: 'INSUFFICIENT_ARM', swing: null, swingCode: 'INSUFFICIENT_ARM', wonRuns: 1, lostRuns: 9999 },
      ],
    })} />);
    openMath();
    const note = screen.getByTestId('decisiveness-withheld').textContent ?? '';
    expect(note).toContain('SE_EXCEEDS_MAGNITUDE');
    expect(note).toContain('INSUFFICIENT_ARM');
  });

  it('every row withheld says so, rather than rendering an empty ranking', () => {
    render(<ForecastDistribution forecast={base({
      decisiveness: [
        { id: 'c', projectName: 'CHARLIE', p50SwingPct: null, p50SwingStdErr: null, p50SwingCode: 'SE_EXCEEDS_MAGNITUDE', swing: null, swingCode: 'SE_EXCEEDS_MAGNITUDE', wonRuns: 2000, lostRuns: 8000 },
      ],
    })} />);
    // "No deal is decisive" would be a finding. "The simulation cannot resolve it at this
    // run count" is the truth, and they are not the same sentence.
    openMath();
    expect(screen.getByTestId('decisiveness-none-measured').textContent)
      .toMatch(/resolution.*not a finding|not a finding/i);
  });
});

describe('absent is not empty, and unadjusted is not adjusted', () => {
  it('an API build without the field renders NOTHING, not an empty ranking', () => {
    // Absent = this deployment predates the field. Rendering an empty table would assert a
    // measurement that was never taken.
    render(<ForecastDistribution forecast={base()} />);
    expect(screen.queryByTestId('decisiveness-headline')).toBeNull();
    openMath();
    expect(screen.queryByTestId('forecast-decisiveness')).toBeNull();
  });

  it('the source keeps the scenario disclosure — these swings are not scenario-adjusted', () => {
    /*
     * Everything else on this card re-simulates client-side under the scenario dials.
     * Decisiveness comes from the server's run over the real book. Sitting silently beside
     * adjusted numbers it would read as adjusted too, so the component says otherwise.
     */
    const src = readFileSync(resolve(process.cwd(), 'src/components/kpi/ForecastDistribution.tsx'), 'utf8');
    expect(src).toContain('decisiveness-unscenarioed');
    expect(src).toMatch(/NOT adjusted for it/);
  });

  it('the API actually carries the field — the seam this fixed', () => {
    const api = readFileSync(resolve(process.cwd(), '../api/src/kpi/forecast.ts'), 'utf8');
    expect(api, 'ForecastSummary dropped decisiveness again').toContain('decisiveness: ForecastDecisiveness[]');
    expect(api, 'the engine ordering was re-sorted on the way out')
      .toMatch(/decisiveness:\s*mc\.decisiveness\.map/);
  });
});
