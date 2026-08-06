import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ForecastDistribution, type ForecastWithCoverage } from '../ForecastDistribution';

/**
 * This file exists because the subtitle on this card printed
 * `forecast.deals.length` as the size of the simulated set. The forecast
 * (apps/api/src/kpi/forecast.ts) EXCLUDES deals it cannot price and deals whose
 * stage it cannot rate, and reports both exclusions plus `simulatedDealCount`.
 * So the card told a human "10,000 simulations over 5 open deals" when it had
 * simulated 3 — and the client-side re-run put the two excluded deals into the
 * histogram at $0, which is a priced deal somebody agreed to do for nothing.
 *
 * There was no test file here at all, so none of that had to survive a
 * regression. Every assertion below is synchronous: this component renders from
 * props with no fetch, so there is nothing to wait for and no waitFor to go
 * stale against.
 */

afterEach(cleanup);

type Deal = ForecastWithCoverage['deals'][number];

const deal = (over: Partial<Deal> & { id: string }): Deal => ({
  projectName: `Project ${over.id}`,
  stage: 'proposal',
  value: 100_000,
  winProbability: 50,
  daysSinceUpdate: 3,
  ...over,
});

/** Five open deals: three priced+rateable, one unpriced, one unrateable stage. */
const FIVE_DEALS: Deal[] = [
  deal({ id: 'a' }),
  deal({ id: 'b', value: 250_000, winProbability: 30 }),
  deal({ id: 'c', value: 40_000, winProbability: 80 }),
  deal({ id: 'd', value: null }),
  deal({ id: 'e', stage: 'mystery_stage' }),
];

const forecast = (over: Partial<ForecastWithCoverage> = {}): ForecastWithCoverage => ({
  runs: 10_000,
  p10: 0,
  p50: 100_000,
  p90: 300_000,
  expected: 137_000,
  deals: FIVE_DEALS,
  simulatedDealCount: 3,
  unpriced: {
    code: 'UNPRICED_DEAL_EXCLUDED',
    rule: 'An open deal with no marked package value is excluded from the simulation, never priced at 0.',
    count: 1,
    ids: ['d'],
  },
  unrateable: {
    code: 'UNRATEABLE_STAGE_EXCLUDED',
    rule: 'A stage with no calibrated base rate is excluded rather than given an invented 5%.',
    count: 1,
    ids: ['e'],
  },
  distributionRefusal: null,
  ...over,
});

describe('ForecastDistribution — the subtitle reports coverage, not the input list', () => {
  it('prints the simulated count and not deals.length', () => {
    render(<ForecastDistribution forecast={forecast()} />);
    const sub = screen.getByTestId('forecast-coverage').textContent ?? '';
    expect(sub).toContain('3 simulated deals');
    // The bug: five open deals in, three simulated, "5 open deals" printed.
    expect(sub).not.toMatch(/5 (simulated|open) deals/);
  });

  it('names both exclusions with their code and rule, and the deals they cover', () => {
    render(<ForecastDistribution forecast={forecast()} />);
    const block = screen.getByTestId('forecast-exclusions').textContent ?? '';
    expect(block).toContain('UNPRICED_DEAL_EXCLUDED');
    expect(block).toContain('UNRATEABLE_STAGE_EXCLUDED');
    expect(block).toContain('never priced at 0');
    expect(block).toContain('invented 5%');
    // Named by project, not by an opaque id the reader cannot resolve.
    expect(block).toContain('Project d');
    expect(block).toContain('Project e');
  });

  it('says nothing about exclusions when the API reported none', () => {
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: FIVE_DEALS.slice(0, 3),
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r', count: 0, ids: [] },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
        })}
      />,
    );
    expect(screen.queryByTestId('forecast-exclusions')).not.toBeInTheDocument();
    expect(screen.getByTestId('forecast-coverage').textContent).toContain('3 simulated deals');
  });
});

describe('ForecastDistribution — an absent exclusion limb is not an empty one', () => {
  /** The older-API-build payload: the coverage limbs do not exist at all. */
  const withoutLimbs = (): ForecastWithCoverage => {
    const f = forecast();
    delete (f as { unpriced?: unknown }).unpriced;
    delete (f as { unrateable?: unknown }).unrateable;
    return f;
  };

  it('says the exclusion detail was not returned rather than rendering silence', () => {
    render(<ForecastDistribution forecast={withoutLimbs()} />);
    const block = screen.getByTestId('forecast-exclusions-absent').textContent ?? '';
    expect(block).toContain('EXCLUSION_DETAIL_NOT_RETURNED_CLIENT_SIDE');
    expect(block).toMatch(/not returned by this API build/i);
    expect(block).toMatch(/unpriced and unrateable/);
    // It must say the drawn set cannot honour exclusions it was never told about.
    expect(block).toMatch(/cannot honour exclusions the API did not name/i);
    expect(block).toMatch(/card's own, not the engine's/i);
  });

  it('does not render identically to a reported zero (the collapse this closes)', () => {
    // count: 0 = the engine looked and excluded nothing → no exclusion block.
    render(
      <ForecastDistribution
        forecast={forecast({
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r', count: 0, ids: [] },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
        })}
      />,
    );
    expect(screen.queryByTestId('forecast-exclusions-absent')).not.toBeInTheDocument();
    cleanup();
    // Absent limbs = not-loaded → the block exists. Two states, two renders.
    render(<ForecastDistribution forecast={withoutLimbs()} />);
    expect(screen.getByTestId('forecast-exclusions-absent')).toBeInTheDocument();
  });

  it('names a deal it withheld itself with its own code, never as an engine rule', () => {
    // Deal d is unpriced but the API named no exclusion for it.
    render(<ForecastDistribution forecast={withoutLimbs()} />);
    const own = screen.getByTestId('forecast-card-exclusions').textContent ?? '';
    expect(own).toContain('UNPRICED_NOT_NAMED_BY_API_CLIENT_SIDE');
    expect(own).toContain('Project d');
    expect(own).toMatch(/withheld by THIS CARD, not by the engine/);
    fireEvent.click(screen.getByRole('button', { name: /see the math/i }));
    // The row's own withheld cell marks its provenance on screen, not only in a
    // tooltip that reads exactly like the engine's rule text.
    expect(screen.getByTestId('forecast-math-row-d').textContent).toContain('this card');
    // The authored sentence that used to sit in the engine's tooltip slot is gone.
    expect(document.body.innerHTML).not.toContain('No package value was ever marked on this deal.');
  });
});

describe('ForecastDistribution — a withheld deal is named even with no table to fall back to', () => {
  const SIX_UNPRICED: Deal[] = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((id) => deal({ id, value: null }));

  it('names every excluded deal when the refusal removes the math table', () => {
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: SIX_UNPRICED,
          simulatedDealCount: 0,
          unpriced: {
            code: 'UNPRICED_DEAL_EXCLUDED',
            rule: 'r1',
            count: 6,
            ids: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
          },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
          distributionRefusal: { code: 'ALL_OPEN_DEALS_UNPRICEABLE', rule: 'Nothing could be priced.' },
        })}
      />,
    );
    // No table exists in the refused state, so the block is the only surface
    // that can name them — it must not truncate at 4.
    expect(screen.queryByRole('button', { name: /see the math/i })).not.toBeInTheDocument();
    const block = screen.getByTestId('forecast-exclusions').textContent ?? '';
    for (const n of ['Project d1', 'Project d2', 'Project d3', 'Project d4', 'Project d5', 'Project d6']) {
      expect(block).toContain(n);
    }
    expect(block).not.toMatch(/\(\+2 more/);
  });

  it('still abbreviates when the math table is there to carry the full list', () => {
    const ids = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'];
    render(
      <ForecastDistribution
        forecast={forecast({
          // One priced deal keeps the distribution (and its table) alive.
          deals: [deal({ id: 'ok' }), ...ids.map((id) => deal({ id, value: null }))],
          simulatedDealCount: 1,
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r1', count: 6, ids },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
        })}
      />,
    );
    const block = screen.getByTestId('forecast-exclusions').textContent ?? '';
    expect(block).toContain('(+2 more, named in "See the math")');
    fireEvent.click(screen.getByRole('button', { name: /see the math/i }));
    expect(screen.getByTestId('forecast-math-row-x6')).toBeInTheDocument();
  });

  it('states what an unrateable exclusion actually did, not "not scored 0"', () => {
    render(<ForecastDistribution forecast={forecast()} />);
    const block = screen.getByTestId('forecast-exclusions').textContent ?? '';
    expect(block).toMatch(/UNPRICED_DEAL_EXCLUDED · 1 open deal excluded from the simulation, not scored 0/);
    // The unrateable deal WAS priced — only its win probability was refused.
    expect(block).toMatch(/the win probability was refused rather than invented/);
    expect(block).not.toMatch(/UNRATEABLE_STAGE_EXCLUDED · 1 open deal excluded from the simulation, not scored 0/);
  });
});

describe('ForecastDistribution — an unusable price refuses, it does not print $NaN', () => {
  it('does not simulate a deal whose value key is absent', () => {
    const d2 = deal({ id: 'b' });
    delete (d2 as { value?: number | null }).value;
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: [deal({ id: 'a' }), d2],
          simulatedDealCount: 1,
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r', count: 0, ids: [] },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
        })}
      />,
    );
    // Pre-fix: "P10 conservative $NaN … P90 upside $100,000" — partly plausible,
    // which is the worst shape of the failure.
    expect(document.body.textContent ?? '').not.toContain('NaN');
    expect(screen.getByTestId('forecast-coverage').textContent).toContain('1 simulated deal');
    // And it is named as withheld by this card, since the API excluded nothing.
    expect(screen.getByTestId('forecast-card-exclusions').textContent).toContain('Project b');
  });

  it('does not simulate a non-finite value either', () => {
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: [deal({ id: 'a' }), deal({ id: 'b', value: Number.NaN })],
          simulatedDealCount: 1,
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r', count: 0, ids: [] },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
        })}
      />,
    );
    expect(document.body.textContent ?? '').not.toContain('$NaN');
    fireEvent.click(screen.getByRole('button', { name: /see the math/i }));
    expect(screen.getByTestId('forecast-math-row-b').textContent).toMatch(/price not numeric/);
  });
});

describe('ForecastDistribution — null coverage is not-loaded, never zero', () => {
  it('reports a null simulatedDealCount as not returned rather than as 0 deals', () => {
    render(<ForecastDistribution forecast={forecast({ simulatedDealCount: null })} />);
    const sub = screen.getByTestId('forecast-coverage').textContent ?? '';
    expect(sub).toMatch(/not returned by this API build/i);
    expect(sub).not.toMatch(/0 simulated/);
  });

  it('treats an absent field the same way (an older API build is not a zero)', () => {
    const f = forecast();
    delete (f as { simulatedDealCount?: number | null }).simulatedDealCount;
    render(<ForecastDistribution forecast={f} />);
    const sub = screen.getByTestId('forecast-coverage').textContent ?? '';
    expect(sub).toMatch(/not returned by this API build/i);
    expect(sub).not.toMatch(/0 simulated/);
  });

  it('names the disagreement when the API count and the drawn set differ', () => {
    // 3 deals are drawable here; an API claiming 4 is a coverage claim this card
    // cannot corroborate, so both numbers are shown rather than one chosen.
    render(<ForecastDistribution forecast={forecast({ simulatedDealCount: 4 })} />);
    const sub = screen.getByTestId('forecast-coverage').textContent ?? '';
    expect(sub).toContain('4 simulated deals per the API');
    expect(sub).toContain('3 drawn here');
  });

  it('does not print "1 simulated deals" on the mismatch branch', () => {
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: [deal({ id: 'e', stage: 'mystery_stage' })],
          simulatedDealCount: 1,
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r', count: 0, ids: [] },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 1, ids: ['e'] },
        })}
      />,
    );
    const sub = screen.getByTestId('forecast-coverage').textContent ?? '';
    expect(sub).toContain('1 simulated deal per the API');
    expect(sub).not.toContain('1 simulated deals');
  });
});

describe('ForecastDistribution — a refusal is not a distribution', () => {
  it('suppresses the histogram and the percentile tiles when distributionRefusal is set', () => {
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: [deal({ id: 'd', value: null }), deal({ id: 'e', value: null })],
          simulatedDealCount: 0,
          unpriced: {
            code: 'UNPRICED_DEAL_EXCLUDED',
            rule: 'An open deal with no marked package value is excluded.',
            count: 2,
            ids: ['d', 'e'],
          },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
          distributionRefusal: {
            code: 'ALL_OPEN_DEALS_UNPRICEABLE',
            rule: 'No open deal carries a package value, so no quarter total can be simulated.',
          },
        })}
      />,
    );
    const refusal = screen.getByTestId('forecast-refusal').textContent ?? '';
    expect(refusal).toContain('ALL_OPEN_DEALS_UNPRICEABLE');
    expect(refusal).toContain('no quarter total can be simulated');
    // No chart, no bands: an empty histogram reads as a measured $0 quarter.
    expect(screen.queryByTestId('forecast-distribution-body')).not.toBeInTheDocument();
    expect(document.querySelector('svg')).toBeNull();
    expect(screen.queryByText('P50 median')).not.toBeInTheDocument();
  });

  it('keeps genuinely-empty distinct from refused', () => {
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: [],
          simulatedDealCount: 0,
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r', count: 0, ids: [] },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 0, ids: [] },
        })}
      />,
    );
    expect(screen.getByTestId('forecast-empty').textContent).toMatch(/no open deals/i);
    expect(screen.queryByTestId('forecast-refusal')).not.toBeInTheDocument();
  });

  it('withholds the distribution when every open deal was excluded but no refusal arrived', () => {
    // Defensive: simulating zero deals yields 10,000 totals of exactly 0, i.e. a
    // $0 quarter asserted as certain. That is a fabrication, not an empty chart.
    render(
      <ForecastDistribution
        forecast={forecast({
          deals: [deal({ id: 'e', stage: 'mystery_stage' })],
          simulatedDealCount: 0,
          unpriced: { code: 'UNPRICED_DEAL_EXCLUDED', rule: 'r', count: 0, ids: [] },
          unrateable: { code: 'UNRATEABLE_STAGE_EXCLUDED', rule: 'r', count: 1, ids: ['e'] },
          distributionRefusal: null,
        })}
      />,
    );
    expect(screen.getByTestId('forecast-nothing-simulable').textContent).toMatch(/withheld/i);
    expect(document.querySelector('svg')).toBeNull();
  });
});

describe('ForecastDistribution — the math table', () => {
  it('shows an excluded deal as excluded instead of as $0 expected', () => {
    render(<ForecastDistribution forecast={forecast()} />);
    fireEvent.click(screen.getByRole('button', { name: /see the math/i }));
    const rowD = screen.getByTestId('forecast-math-row-d').textContent ?? '';
    expect(rowD).toMatch(/not priced/i);
    expect(rowD).not.toContain('$0');
    const rowE = screen.getByTestId('forecast-math-row-e').textContent ?? '';
    expect(rowE).toMatch(/stage not rated/i);
    expect(rowE).not.toContain('$0');
    // A simulated row still shows its arithmetic.
    expect(screen.getByTestId('forecast-math-row-a').textContent).toContain('$50,000');
  });

  it('states that Σ expected covers the simulated rows only', () => {
    render(<ForecastDistribution forecast={forecast()} />);
    fireEvent.click(screen.getByRole('button', { name: /see the math/i }));
    expect(screen.getByTestId('forecast-math-sum').textContent).toMatch(/simulated rows only/i);
  });
});
