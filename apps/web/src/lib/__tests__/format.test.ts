import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPct,
} from '../format';

describe('formatMoney', () => {
  it('keeps exact figures below $10K', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(8400)).toBe('$8,400');
    expect(formatMoney(9999)).toBe('$9,999');
  });
  it('compacts from $10K with one decimal, no trailing .0', () => {
    expect(formatMoney(10_000)).toBe('$10K');
    expect(formatMoney(48_500)).toBe('$48.5K');
    expect(formatMoney(450_000)).toBe('$450K');
    expect(formatMoney(1_200_000)).toBe('$1.2M');
    expect(formatMoney(2_000_000_000)).toBe('$2B');
  });
  it('supports exact mode and negatives', () => {
    expect(formatMoney(48_500, { exact: true })).toBe('$48,500');
    expect(formatMoney(-3_400)).toBe('−$3,400');
    expect(formatMoney(-1_250_000)).toBe('−$1.3M');
  });
  it('never renders NaN/Infinity', () => {
    expect(formatMoney(NaN)).toBe('—');
    expect(formatMoney(Infinity)).toBe('—');
  });
});

describe('formatPct', () => {
  it('caps at one decimal and trims .0', () => {
    expect(formatPct(42.37)).toBe('42.4%');
    expect(formatPct(8)).toBe('8%');
    expect(formatPct(100)).toBe('100%');
    expect(formatPct(-3.14)).toBe('−3.1%');
  });
  it('never renders NaN', () => {
    expect(formatPct(NaN)).toBe('—');
  });
});

describe('formatCount', () => {
  it('is exact with separators below 100K', () => {
    expect(formatCount(7870)).toBe('7,870');
    expect(formatCount(99_999)).toBe('99,999');
  });
  it('compacts above 100K', () => {
    expect(formatCount(124_000)).toBe('124K');
    expect(formatCount(1_240_000)).toBe('1.2M');
  });
});

describe('formatDuration', () => {
  it('scales minutes → hours → days → weeks', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(4 * 60)).toBe('4h');
    expect(formatDuration(36 * 60)).toBe('36h');
    expect(formatDuration(3 * 1440)).toBe('3d');
    expect(formatDuration(15 * 1440)).toBe('2w');
  });
  it('caps SLA-style ages — 283h becomes 7d+', () => {
    expect(formatDuration(283 * 60, { capDays: 7 })).toBe('7d+');
    expect(formatDuration(2 * 1440, { capDays: 7 })).toBe('2d');
  });
  it('rejects negatives and non-finite', () => {
    expect(formatDuration(-5)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
  });
});

describe('formatDate', () => {
  const now = new Date('2026-07-17T12:00:00Z');
  it('is relative under 7 days', () => {
    expect(formatDate(new Date('2026-07-17T11:59:40Z'), now)).toBe('just now');
    expect(formatDate(new Date('2026-07-17T11:10:00Z'), now)).toBe('50m ago');
    expect(formatDate(new Date('2026-07-17T04:00:00Z'), now)).toBe('8h ago');
    expect(formatDate(new Date('2026-07-14T12:00:00Z'), now)).toBe('3d ago');
  });
  it('switches to month-day at 7 days, adds year across years', () => {
    expect(formatDate(new Date('2026-07-01T12:00:00Z'), now)).toBe('Jul 1');
    expect(formatDate(new Date('2025-11-02T12:00:00Z'), now)).toBe('Nov 2, 2025');
  });
  it('handles future dates and garbage', () => {
    expect(formatDate(new Date('2026-08-09T12:00:00Z'), now)).toBe('Aug 9');
    expect(formatDate('not-a-date', now)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('renders a UTC-labeled timestamp', () => {
    expect(formatDateTime(new Date('2026-07-13T14:02:00Z'))).toBe('Jul 13, 14:02 UTC');
  });
});
