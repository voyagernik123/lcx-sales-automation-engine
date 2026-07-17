import { describe, expect, it } from 'vitest';
import { ApiError } from '../apiClient';
import { classifyError } from '../errors';

describe('error taxonomy — every failure has a designed class (plan 5.1)', () => {
  const cases: Array<[number, string]> = [
    [401, 'auth'],
    [403, 'permission'],
    [400, 'validation'],
    [422, 'validation'],
    [409, 'conflict'],
    [429, 'rate-limit'],
    [500, 'system'],
    [503, 'system'],
  ];

  for (const [status, kind] of cases) {
    it(`maps HTTP ${status} → ${kind}`, () => {
      const c = classifyError(new ApiError('boom', status, 'X'));
      expect(c.kind).toBe(kind);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.message).not.toContain('boom'); // raw detail never leads
      expect(c.detail).toBe('boom'); // …but is preserved as fine print
    });
  }

  it('maps fetch failures to network with a calm no-data-lost message', () => {
    const c = classifyError(new TypeError('Failed to fetch'));
    expect(c.kind).toBe('network');
    expect(c.retryable).toBe(true);
    expect(c.message).toContain('status bar');
  });

  it('never throws on garbage input', () => {
    const c = classifyError('something exploded');
    expect(c.kind).toBe('system');
    expect(c.detail).toBe('something exploded');
  });

  it('rate limits and conflicts are retryable; auth and validation are not', () => {
    expect(classifyError(new ApiError('x', 429)).retryable).toBe(true);
    expect(classifyError(new ApiError('x', 409)).retryable).toBe(true);
    expect(classifyError(new ApiError('x', 401)).retryable).toBe(false);
    expect(classifyError(new ApiError('x', 422)).retryable).toBe(false);
  });
});
