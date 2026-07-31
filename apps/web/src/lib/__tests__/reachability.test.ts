import { describe, expect, it, vi } from 'vitest';
import { classifyUnreachable, originBlockedMessage } from '../reachability';

/**
 * The whole value of this helper is that it does NOT report an outage when there
 * isn't one. These tests pin the two directions and the request shape that makes
 * the discrimination valid in the first place.
 */

describe('classifyUnreachable', () => {
  it('reports origin-blocked when the no-cors probe resolves', () => {
    // An opaque response IS a resolution: something answered.
    const f = vi.fn().mockResolvedValue({ type: 'opaque', status: 0 } as unknown as Response);
    return expect(classifyUnreachable('https://api.example/health', f as unknown as typeof fetch))
      .resolves.toBe('origin-blocked');
  });

  it('reports down when the no-cors probe rejects', () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    return expect(classifyUnreachable('https://api.example/health', f as unknown as typeof fetch))
      .resolves.toBe('down');
  });

  it('reports origin-blocked even for a 5xx, because reach is the question', () => {
    // A broken-but-present API is still not an unreachable one, and calling it
    // "down" on the login screen would send the operator after the wrong thing.
    const f = vi.fn().mockResolvedValue({ type: 'opaque', status: 0 } as unknown as Response);
    return expect(classifyUnreachable('https://api.example/health', f as unknown as typeof fetch))
      .resolves.toBe('origin-blocked');
  });

  it('probes with no-cors and no cache — the two things that make it valid', async () => {
    const f = vi.fn().mockResolvedValue({} as Response);
    await classifyUnreachable('https://api.example/health', f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.example/health');
    // no-cors: exempt from the read check, so it answers "did anything reply".
    expect(init).toMatchObject({ mode: 'no-cors', cache: 'no-store' });
    // A cached opaque response would prove reach that is minutes stale.
    expect(init.cache).toBe('no-store');
  });

  it('never throws — the caller is already on an error path', async () => {
    const f = vi.fn(() => {
      throw new Error('synchronous explosion');
    });
    await expect(classifyUnreachable('https://api.example/health', f as unknown as typeof fetch))
      .resolves.toBe('down');
  });
});

describe('originBlockedMessage', () => {
  it('names the offending origin', () => {
    const msg = originBlockedMessage('https://f2a86c32.lcx-sales-automation-engine.pages.dev');
    expect(msg).toContain('f2a86c32.lcx-sales-automation-engine.pages.dev');
  });

  it('does not claim the API is down', () => {
    const msg = originBlockedMessage('https://x.pages.dev').toLowerCase();
    expect(msg).toContain('the api is up');
    expect(msg).not.toContain('unreachable');
  });

  it('tells the operator what to actually do', () => {
    const msg = originBlockedMessage('https://x.pages.dev');
    expect(msg).toMatch(/production URL/);
    expect(msg).toMatch(/CORS_ORIGINS/);
  });
});
