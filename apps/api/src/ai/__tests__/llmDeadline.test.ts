import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE UPSTREAM CALL HAS A DEADLINE. Found in production on 2026-09-04: /v1/ai/win-loss never answered,
 * because `complete()` awaited an OpenRouter socket that never closed, and the Win/Loss page sat on its
 * skeletons for as long as the tab stayed open. Every other AI feature shared the exposure. The fix is a
 * hard `AbortSignal.timeout` on the transport, so a stall becomes the fourth collapsed condition — a
 * transport throw — and the caller gets the deterministic fallback it already has.
 */
const envMock = {
  databaseUrl: '',
  anthropicApiKey: '',
  anthropicModel: 'claude-opus-5',
  openrouterApiKey: '',
  openrouterModel: 'test/model',
};
vi.mock('../../lib/env.js', () => ({ env: envMock }));
vi.mock('../../db/index.js', () => ({
  getDb: () => {
    throw new Error('no database in this test');
  },
}));

const { LLMClient, LLM_TIMEOUT_MS } = await import('../llm.js');

/** A provider that holds the socket open until it is told to stop. */
const hangUntilAborted = (_url: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const signal = init?.signal;
    if (!signal) return; // never resolves: the test then fails on its own timeout, which is the point
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

beforeEach(() => {
  envMock.anthropicApiKey = '';
  envMock.openrouterApiKey = '';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('the LLM transport has a deadline', () => {
  it('has a sane default and honours LLM_TIMEOUT_MS only above one second', () => {
    expect(LLM_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect(LLM_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it('a stalled OpenRouter call returns the fallback inside the deadline, classified as provider_error', async () => {
    envMock.openrouterApiKey = 'k';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(hangUntilAborted as typeof fetch);
    const t0 = Date.now();
    const out = await new LLMClient().complete('p', { feature: 'win-loss', timeoutMs: 40 });
    const elapsed = Date.now() - t0;
    expect(out.usedLlm).toBe(false);
    expect(out.text).toBe('');
    expect(out.code).toBe('AI_PROVIDER_ERROR');
    expect(out.httpStatus).toBeNull();
    expect(elapsed).toBeLessThan(2000);
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('the Anthropic path carries the same signal', async () => {
    envMock.anthropicApiKey = 'k';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(hangUntilAborted as typeof fetch);
    const out = await new LLMClient().complete('p', { feature: 'dossier-qa', timeoutMs: 40 });
    expect(out.usedLlm).toBe(false);
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
