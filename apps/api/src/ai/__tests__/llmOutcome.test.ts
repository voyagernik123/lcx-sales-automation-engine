import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  FOUR DIFFERENT FACTS ABOUT THE WORLD, ONE RETURN VALUE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `complete()` returned the IDENTICAL `{ text: '', usedLlm: false }` for:
 *
 *   1. no provider configured        — nothing was ever asked
 *   2. `!res.ok`                     — a 429 on quota, or a 400 on the request shape
 *   3. HTTP 200, stop_reason refusal — the model declined
 *   4. a transport throw             — DNS, TLS, timeout
 *
 * and `ai_usage_log` recorded `used_llm = false` for all four with no reason. The
 * operator panel then printed one specific cause out loud — "AI narrative unavailable
 * (no key)" — which is a false statement in three of the four. `anthropicRequest.test.ts`
 * even records the consequence in its own docstring: a live, silent, total failure of
 * every AI feature was indistinguishable from "no key set".
 *
 * These tests assert the four conditions are now DISTINGUISHABLE. The single most
 * load-bearing assertion in this file is the last one: three distinct codes, and the
 * two `provider_error` shapes separable by `httpStatus`.
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

const { LLMClient } = await import('../llm.js');

const OPTS = { feature: 'dossier-qa', system: 'Be terse.', maxTokens: 100 };

/** A minimal Response stand-in. `complete()` only ever calls .ok/.status/.json/.text. */
const res = (init: { ok: boolean; status: number; json?: unknown; text?: string }) =>
  ({
    ok: init.ok,
    status: init.status,
    json: async () => init.json,
    text: async () => init.text ?? '',
  }) as unknown as Response;

beforeEach(() => {
  envMock.anthropicApiKey = '';
  envMock.openrouterApiKey = '';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('each way of not getting an answer has its own stable code', () => {
  it('no provider configured → AI_NO_PROVIDER, and no network call at all', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await new LLMClient().complete('p', OPTS);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out.usedLlm).toBe(false);
    expect(out.status).toBe('no_provider');
    expect(out.code).toBe('AI_NO_PROVIDER');
    expect(out.provider).toBeNull();
    expect(out.httpStatus).toBeNull();
    expect(out.rule).not.toBe('');
  });

  it('a 429 → AI_PROVIDER_ERROR carrying the real HTTP status', async () => {
    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: false, status: 429, text: '{"error":"rate_limit_error"}' })));
    const out = await new LLMClient().complete('p', OPTS);
    expect(out.status).toBe('provider_error');
    expect(out.code).toBe('AI_PROVIDER_ERROR');
    expect(out.httpStatus).toBe(429);
    expect(out.detail).toContain('429');
    // The key is fine. Nothing in the outcome may suggest otherwise.
    expect(out.detail).not.toMatch(/key/i);
  });

  it('a model-shape 400 → the same code, and the provider message survives', async () => {
    // This is the exact live defect `llm.ts` documents: a rejected `temperature`
    // 400s every call and used to look identical to an unset key.
    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: false, status: 400, text: '{"error":{"message":"temperature: unsupported"}}' })));
    const out = await new LLMClient().complete('p', OPTS);
    expect(out.code).toBe('AI_PROVIDER_ERROR');
    expect(out.httpStatus).toBe(400);
    expect(out.detail).toContain('temperature');
  });

  it('HTTP 200 with stop_reason refusal → AI_MODEL_REFUSED', async () => {
    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, status: 200, json: { content: [], stop_reason: 'refusal' } })));
    const out = await new LLMClient().complete('p', OPTS);
    expect(out.status).toBe('refused');
    expect(out.code).toBe('AI_MODEL_REFUSED');
    expect(out.httpStatus).toBe(200);
    expect(out.usedLlm).toBe(false);
  });

  it('a transport throw → AI_PROVIDER_ERROR with no HTTP status, because none arrived', async () => {
    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    const out = await new LLMClient().complete('p', OPTS);
    expect(out.code).toBe('AI_PROVIDER_ERROR');
    expect(out.httpStatus).toBeNull();
    expect(out.detail).toContain('ECONNRESET');
  });

  it('a real answer → status ok, code null, usedLlm true', async () => {
    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, status: 200, json: { content: [{ type: 'text', text: 'the answer' }], stop_reason: 'end_turn' } })));
    const out = await new LLMClient().complete('p', OPTS);
    expect(out.text).toBe('the answer');
    expect(out.usedLlm).toBe(true);
    expect(out.status).toBe('ok');
    expect(out.code).toBeNull();
    expect(out.provider).toBe('anthropic');
  });

  /**
   * THE ASSERTION THE WHOLE FILE EXISTS FOR. Before the fix these four returns were
   * `===`-equal in every field a caller could read.
   */
  it('the four conditions are not the same value', async () => {
    const client = new LLMClient();

    envMock.anthropicApiKey = '';
    vi.stubGlobal('fetch', vi.fn());
    const noProvider = await client.complete('p', OPTS);

    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: false, status: 429, text: '' })));
    const httpError = await client.complete('p', OPTS);

    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, status: 200, json: { content: [], stop_reason: 'refusal' } })));
    const refused = await client.complete('p', OPTS);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ETIMEDOUT'); }));
    const thrown = await client.complete('p', OPTS);

    // All four still degrade to the deterministic path — that behaviour is deliberate.
    for (const o of [noProvider, httpError, refused, thrown]) expect(o.usedLlm).toBe(false);

    // But they are no longer the same fact.
    expect(new Set([noProvider.code, httpError.code, refused.code, thrown.code]).size).toBe(3);
    expect(httpError.httpStatus).toBe(429);
    expect(thrown.httpStatus).toBeNull();
    expect(new Set([noProvider.detail, httpError.detail, refused.detail, thrown.detail]).size).toBe(4);
  });

  it('every refusal cites a rule; a real answer cites none', async () => {
    envMock.anthropicApiKey = '';
    vi.stubGlobal('fetch', vi.fn());
    expect((await new LLMClient().complete('p', OPTS)).rule.length).toBeGreaterThan(20);

    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, status: 200, json: { content: [{ type: 'text', text: 'a' }] } })));
    expect((await new LLMClient().complete('p', OPTS)).rule).toBe('');
  });
});

describe('the reason reaches the log even though the table cannot hold it', () => {
  it('names the code, the caller and the http status on a non-ok outcome', async () => {
    // A STATED ABSENCE: `ai_usage_log` has no caller/status/code/http_status column and
    // this lane may not add migration 0075, so the process log is the only record.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: false, status: 503, text: '' })));
    await new LLMClient().complete('p', OPTS);
    const line = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('AI_PROVIDER_ERROR');
    expect(line).toContain('caller=dossier-qa');
    expect(line).toContain('http=503');
  });

  it('says nothing extra on a successful call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    envMock.anthropicApiKey = 'sk-test';
    vi.stubGlobal('fetch', vi.fn(async () => res({ ok: true, status: 200, json: { content: [{ type: 'text', text: 'a' }] } })));
    await new LLMClient().complete('p', OPTS);
    expect(warn.mock.calls.filter((c) => String(c[0]).startsWith('[ai] AI_'))).toHaveLength(0);
  });
});
