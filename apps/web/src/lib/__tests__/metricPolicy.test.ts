import { describe, expect, it } from 'vitest';
import { deltaPct, formatRate, hasTrend, isMonotoneFunnel } from '../metricPolicy';

describe('formatRate', () => {
  it('renders a percentage when the sample is big enough', () => {
    expect(formatRate(38, 100)).toEqual({ display: '38%', suppressed: false });
    expect(formatRate(3, 8).display).toBe('37.5%');
  });
  it('falls back to absolute form below the denominator floor', () => {
    const r = formatRate(3, 4);
    expect(r.display).toBe('3 of 4');
    expect(r.suppressed).toBe(true);
    expect(r.title).toContain('needs 8');
  });
  it('never renders an impossible >100% rate — the 400% reply-rate guard', () => {
    const r = formatRate(4, 1); // 4 replies attributed to 1 send
    expect(r.display).toBe('4 of 1');
    expect(r.suppressed).toBe(true);
    expect(r.title).toContain('inconsistent');
  });
  it('handles zero and garbage denominators', () => {
    expect(formatRate(0, 0).display).toBe('—');
    expect(formatRate(1, NaN).display).toBe('—');
  });
});

describe('deltaPct', () => {
  it('computes normal period-over-period change', () => {
    expect(deltaPct(12, 10)).toBeCloseTo(20);
    expect(deltaPct(8, 10)).toBeCloseTo(-20);
  });
  it('suppresses deltas on tiny baselines — the ▲1000% guard', () => {
    expect(deltaPct(11, 1)).toBeNull();
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(5, 4)).toBeNull();
  });
});

describe('isMonotoneFunnel', () => {
  it('accepts a real funnel', () => {
    expect(isMonotoneFunnel([100, 40, 12, 3])).toBe(true);
    expect(isMonotoneFunnel([5, 5, 2, 2])).toBe(true);
  });
  it('rejects the inverted funnel (1 contacted → 4 replied)', () => {
    expect(isMonotoneFunnel([1, 4, 4, 1])).toBe(false);
  });
});

describe('hasTrend', () => {
  it('requires enough points for a line', () => {
    expect(hasTrend(new Array(8).fill(0))).toBe(true);
    expect(hasTrend(new Array(3).fill(0))).toBe(false);
  });
});
