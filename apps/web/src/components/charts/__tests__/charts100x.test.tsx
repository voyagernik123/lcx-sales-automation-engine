import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Histogram, ControlBand, CompareBars, rateCI } from '../index';
import { PipelineSankey } from '../../kpi/PipelineSankey';
import { simulateTotals, binTotals } from '../../kpi/forecastSim';

describe('Histogram', () => {
  it('renders bins, percentile markers, and edge labels', () => {
    const { container } = render(
      <Histogram
        domain={[0, 100]}
        series={[{ label: 'Baseline', counts: [1, 4, 9, 4, 1] }]}
        markers={[
          { label: 'P10', value: 20 },
          { label: 'P90', value: 80 },
        ]}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('P10')).toBeInTheDocument();
    expect(screen.getByText('P90')).toBeInTheDocument();
    // single series → no legend
    expect(screen.queryByText('Baseline')).not.toBeInTheDocument();
  });

  it('renders a legend for the two-series (scenario overlay) case', () => {
    render(
      <Histogram
        domain={[0, 10]}
        series={[
          { label: 'Baseline', counts: [2, 5, 2] },
          { label: 'Scenario', counts: [1, 6, 3], className: 'text-cyan-500' },
        ]}
      />
    );
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.getByText('Scenario')).toBeInTheDocument();
  });

  it('returns null with no drawable series', () => {
    const { container } = render(<Histogram domain={[0, 1]} series={[{ label: 'x', counts: [] }]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ControlBand', () => {
  const data = [
    { x: '2026-07-01', lo: 10, hi: 30, mid: 20, actual: 12 },
    { x: '2026-07-02', lo: 12, hi: 34, mid: 22, actual: null },
    { x: '2026-07-03', lo: 15, hi: 40, mid: 26, actual: 18 },
  ];

  it('renders band, center line, and honest legend labels', () => {
    const { container } = render(
      <ControlBand data={data} bandLabel="P10–P90 called" midLabel="Expected (called)" actualLabel="Landed" />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('P10–P90 called')).toBeInTheDocument();
    expect(screen.getByText('Expected (called)')).toBeInTheDocument();
    expect(screen.getByText('Landed')).toBeInTheDocument();
    // gap in actuals → isolated readings render as dots, never interpolated
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
  });

  it('omits the actual legend entry when no readings exist', () => {
    render(<ControlBand data={data.map((d) => ({ ...d, actual: null }))} actualLabel="Landed" />);
    expect(screen.queryByText('Landed')).not.toBeInTheDocument();
  });

  it('renders nothing for an empty series and survives a single point', () => {
    const { container } = render(<ControlBand data={[]} />);
    expect(container.firstChild).toBeNull();
    const { container: single } = render(<ControlBand data={[data[0]]} />);
    expect(single.querySelector('svg')).toBeInTheDocument();
  });
});

describe('CompareBars', () => {
  it('renders variant labels, rates, and CI whiskers', () => {
    const { container } = render(
      <CompareBars
        data={[
          { label: 'A (n=200)', rate: 0.12, n: 200, converted: 24 },
          { label: 'B (n=210)', rate: 0.19, n: 210, converted: 40, winner: true },
        ]}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('12.0%')).toBeInTheDocument();
    expect(screen.getByText(/19\.0%/)).toBeInTheDocument(); // winner gets the star suffix
    // whiskers: 3 lines per variant with n>0
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText(/95% confidence interval/)).toBeInTheDocument();
  });

  it('computes a sane 95% CI', () => {
    const [lo, hi] = rateCI(0.5, 100);
    expect(lo).toBeCloseTo(0.402, 2);
    expect(hi).toBeCloseTo(0.598, 2);
    expect(rateCI(0.5, 0)).toEqual([0.5, 0.5]);
    const [clampedLo, clampedHi] = rateCI(0.01, 5);
    expect(clampedLo).toBe(0);
    expect(clampedHi).toBeLessThanOrEqual(1);
  });
});

describe('PipelineSankey', () => {
  const stages = [
    { key: 'universe', label: 'Universe', value: 1000 },
    { key: 'contacted', label: 'Contacted', value: 300 },
    { key: 'replied', label: 'Replied', value: 60 },
    { key: 'won', label: 'Won', value: 6 },
  ];

  it('renders stage labels, values, and carried-% per link', () => {
    const { container } = render(<PipelineSankey stages={stages} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    for (const label of ['Universe', 'Contacted', 'Replied', 'Won']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('30% →')).toBeInTheDocument(); // 300/1000
    expect(screen.getByText('20% →')).toBeInTheDocument(); // 60/300
    expect(screen.getByText('10% →')).toBeInTheDocument(); // 6/60
  });

  it('marks stages with a handler as clickable buttons', () => {
    const { container } = render(
      <PipelineSankey stages={stages.map((s) => ({ ...s, onClick: () => undefined }))} />
    );
    expect(container.querySelectorAll('[role="button"]').length).toBe(stages.length);
  });

  it('renders nothing with fewer than two stages', () => {
    const { container } = render(<PipelineSankey stages={[stages[0]]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('forecastSim', () => {
  it('is deterministic and matches the Σ p·v expectation', () => {
    const deals = [
      { p: 0.5, value: 100 },
      { p: 0.2, value: 1000 },
    ];
    const a = simulateTotals(deals, { runs: 2000, seed: 42 });
    const b = simulateTotals(deals, { runs: 2000, seed: 42 });
    expect(a.totals).toEqual(b.totals);
    expect(a.expected).toBe(0.5 * 100 + 0.2 * 1000);
    expect(a.p10).toBeLessThanOrEqual(a.p50);
    expect(a.p50).toBeLessThanOrEqual(a.p90);
    // every total is a subset-sum of the deal values
    expect(new Set(a.totals).size).toBeLessThanOrEqual(4);
  });

  it('bins totals over the domain with clamping', () => {
    const counts = binTotals([0, 4.9, 5, 9.9, 10, 25], [0, 10], 2);
    // bins are [0,5) and [5,10]; 10 and the out-of-domain 25 clamp into the last bin
    expect(counts).toEqual([2, 4]);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(6);
  });
});
