import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBadge, BandBadge } from '../ScoreBadge';

describe('ScoreBadge', () => {
  it('renders score value', () => {
    render(<ScoreBadge score={85} band="immediate" />);
    expect(screen.getByText('85')).toBeDefined();
  });

  it('renders / 100 suffix', () => {
    render(<ScoreBadge score={42} band="watch" />);
    expect(screen.getByText('/ 100')).toBeDefined();
  });

  it('applies correct aria-label', () => {
    render(<ScoreBadge score={72} band="high" />);
    expect(screen.getByLabelText('Score: 72, band: high')).toBeDefined();
  });

  it('renders sm size without error', () => {
    const { container } = render(<ScoreBadge score={30} band="archive" size="sm" />);
    expect(container.firstChild).toBeDefined();
  });

  it('renders unscored band', () => {
    render(<ScoreBadge score={0} band="unscored" />);
    expect(screen.getByText('0')).toBeDefined();
  });

  it('renders each band color class without error', () => {
    const bands = ['immediate', 'high', 'nurture', 'watch', 'archive', 'unscored'] as const;
    for (const band of bands) {
      const { container } = render(<ScoreBadge score={50} band={band} />);
      expect(container.firstChild).toBeDefined();
    }
  });
});

describe('BandBadge', () => {
  it('renders band label text', () => {
    render(<BandBadge band="immediate" />);
    expect(screen.getByText('Immediate')).toBeDefined();
  });

  it('renders all band labels', () => {
    const cases: [string, string][] = [
      ['immediate', 'Immediate'],
      ['high', 'High'],
      ['nurture', 'Nurture'],
      ['watch', 'Watch'],
      ['archive', 'Archive'],
      ['unscored', 'Unscored'],
    ];
    for (const [band, label] of cases) {
      const { unmount } = render(<BandBadge band={band as any} />);
      expect(screen.getByText(label)).toBeDefined();
      unmount();
    }
  });
});
