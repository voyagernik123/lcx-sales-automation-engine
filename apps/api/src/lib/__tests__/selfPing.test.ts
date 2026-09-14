import { describe, expect, it, vi } from 'vitest';
import { selfPingTarget, startSelfPing } from '../selfPing.js';

describe('the API keeps itself awake on the free tier', () => {
  it('is off outside production, without a public URL, or against loopback', () => {
    expect(selfPingTarget({ production: false, publicUrl: 'https://x.onrender.com' })).toEqual({ off: 'not production' });
    expect(selfPingTarget({ production: true, publicUrl: '' })).toMatchObject({ off: expect.stringContaining('no public URL') });
    expect(selfPingTarget({ production: true, publicUrl: 'http://localhost:8787' })).toEqual({ off: 'public URL is loopback' });
    expect(selfPingTarget({ production: true, publicUrl: 'ftp://x' })).toEqual({ off: 'public URL is not http(s)' });
  });

  it('targets <public>/health and strips a trailing slash', () => {
    expect(selfPingTarget({ production: true, publicUrl: 'https://lcx-sales-api.onrender.com/' })).toEqual({ url: 'https://lcx-sales-api.onrender.com/health' });
  });

  it('pings on the interval with a bounded request and logs the target once', () => {
    const calls: string[] = []; const logs: string[] = [];
    let tick: (() => void) | null = null;
    const setIntervalImpl = ((fn: () => void) => { tick = fn; return 1 as unknown as ReturnType<typeof setInterval>; }) as unknown as typeof setInterval;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url)); expect(init?.signal).toBeInstanceOf(AbortSignal); return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;
    const h = startSelfPing({ production: true, publicUrl: 'https://lcx-sales-api.onrender.com', fetchImpl, setIntervalImpl, log: (l) => logs.push(l) });
    expect(h.target).toBe('https://lcx-sales-api.onrender.com/health');
    expect(logs[0]).toMatch(/self-ping every 300s → https:\/\/lcx-sales-api\.onrender\.com\/health/);
    tick!(); tick!();
    expect(calls).toEqual(['https://lcx-sales-api.onrender.com/health', 'https://lcx-sales-api.onrender.com/health']);
  });
});
