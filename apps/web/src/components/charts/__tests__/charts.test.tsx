import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Sparkline,
  ColumnChart,
  BarChartH,
  StackedBarH,
  DonutChart,
  GaugeChart,
  FunnelChart,
  TrendDelta,
  StatCard,
  ChartCard,
  seriesVar,
  SERIES_COUNT,
} from '../index';
import {
  TableSkeleton,
  CardSkeleton,
  ChartSkeleton,
  PageSkeleton,
} from '../../shared/LoadingSkeleton';

describe('palette', () => {
  it('returns fixed-order series vars and wraps past 8', () => {
    expect(SERIES_COUNT).toBe(8);
    expect(seriesVar(1)).toBe('var(--chart-1)');
    expect(seriesVar(8)).toBe('var(--chart-8)');
    expect(seriesVar(9)).toBe('var(--chart-1)');
  });
});

describe('chart kit smoke tests', () => {
  it('Sparkline renders without crashing', () => {
    const { container } = render(<Sparkline data={[1, 3, 2, 5, 4]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    const { container: single } = render(<Sparkline data={[7]} good />);
    expect(single.querySelector('circle')).toBeInTheDocument();
  });

  it('ColumnChart renders without crashing', () => {
    const { container } = render(
      <ColumnChart
        data={[
          { label: 'Jan', value: 10 },
          { label: 'Feb', value: 25 },
          { label: 'Mar', value: 18 },
        ]}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
  });

  it('BarChartH renders without crashing', () => {
    const { container } = render(
      <BarChartH
        data={[
          { label: 'Alpha', value: 40 },
          { label: 'Beta', value: 22 },
        ]}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('StackedBarH renders segments and legend', () => {
    render(
      <StackedBarH
        segments={[
          { label: 'Won', value: 12 },
          { label: 'Lost', value: 5 },
        ]}
      />
    );
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
  });

  it('DonutChart renders center total and legend', () => {
    render(
      <DonutChart
        data={[
          { label: 'A', value: 60 },
          { label: 'B', value: 40 },
        ]}
      />
    );
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('GaugeChart renders without crashing', () => {
    const { container } = render(<GaugeChart value={72} label="Health" target={80} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
  });

  it('FunnelChart shows all stage labels', () => {
    render(
      <FunnelChart
        stages={[
          { label: 'Leads', value: 200 },
          { label: 'Qualified', value: 120 },
          { label: 'Proposal', value: 45 },
          { label: 'Closed', value: 18 },
        ]}
      />
    );
    for (const label of ['Leads', 'Qualified', 'Proposal', 'Closed']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('TrendDelta shows an up arrow for positive values', () => {
    render(<TrendDelta value={4.2} />);
    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.getByText(/4\.2%/)).toBeInTheDocument();
  });

  it('TrendDelta shows an em dash for zero/null', () => {
    const { container } = render(<TrendDelta value={0} />);
    expect(container.textContent).toBe('—');
  });

  it('StatCard shows its value', () => {
    render(
      <StatCard label="Active deals" value="1,284" delta={4.2} deltaLabel="vs last week" trend={[1, 2, 3, 2, 4]} />
    );
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('Active deals')).toBeInTheDocument();
    expect(screen.getByText('vs last week')).toBeInTheDocument();
  });

  it('ChartCard renders title, subtitle and children', () => {
    render(
      <ChartCard title="Pipeline" subtitle="Last 30 days" action={<button>All</button>}>
        <div>chart body</div>
      </ChartCard>
    );
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getByText('chart body')).toBeInTheDocument();
  });
});

describe('loading skeletons', () => {
  it('TableSkeleton renders without crashing', () => {
    render(<TableSkeleton rows={3} cols={2} />);
    expect(screen.getByRole('status', { name: 'Loading table' })).toBeInTheDocument();
  });

  it('CardSkeleton renders without crashing', () => {
    render(<CardSkeleton count={2} />);
    expect(screen.getByRole('status', { name: 'Loading cards' })).toBeInTheDocument();
  });

  it('ChartSkeleton renders without crashing', () => {
    render(<ChartSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading chart' })).toBeInTheDocument();
  });

  it('PageSkeleton renders without crashing', () => {
    render(<PageSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
  });
});
