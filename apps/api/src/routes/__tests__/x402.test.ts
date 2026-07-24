import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';

/**
 * x402 seller layer (LCX ONE Phase 4) — the handshake, end to end, in sandbox.
 * Proves: discovery is public, no-payment gets the 402 challenge in the exact
 * scheme shape, a valid sandbox payment settles and serves, and a bogus
 * payment is rejected. Keyless — no facilitator, no chain, no keys.
 */
describe('x402 seller handshake (sandbox)', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    delete process.env.X402_FACILITATOR_URL; // force sandbox
  });
  afterAll(async () => { await closeDb(); });

  it('serves the catalog publicly (no auth, discovery)', async () => {
    const res = await app.request('/v1/x402/catalog');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { mode: string; endpoints: Array<{ id: string; priceUsd: number }> } };
    expect(data.mode).toBe('sandbox');
    expect(data.endpoints.length).toBeGreaterThanOrEqual(2);
    expect(data.endpoints.find((e) => e.id === 'token_risk')).toBeTruthy();
  });

  it('returns a 402 challenge in the exact-scheme shape without payment', async () => {
    const res = await app.request('/v1/x402/token-risk?token=USDC');
    expect(res.status).toBe(402);
    const body = (await res.json()) as { x402Version: number; accepts: Array<{ scheme: string; network: string; asset: string; maxAmountRequired: string }> };
    expect(body.x402Version).toBe(1);
    expect(body.accepts[0]!.scheme).toBe('exact');
    expect(body.accepts[0]!.network).toBe('base');
    expect(body.accepts[0]!.asset).toBe('USDC');
    expect(body.accepts[0]!.maxAmountRequired).toBe('50000'); // $0.05 × 1e6
  });

  it('settles a valid sandbox payment and serves the resource', async () => {
    const res = await app.request('/v1/x402/token-risk?token=USDC', {
      headers: { 'X-Payment': 'sandbox:signed-blob' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { product: string; token: string }; payment: { settled: boolean; mode: string } };
    expect(body.data.product).toBe('token-risk');
    expect(body.data.token).toBe('USDC');
    expect(body.payment.settled).toBe(true);
    expect(body.payment.mode).toBe('sandbox');
  });

  it('rejects a bogus payment header with another 402', async () => {
    const res = await app.request('/v1/x402/token-risk', {
      headers: { 'X-Payment': 'not-a-real-payment' },
    });
    expect(res.status).toBe(402);
  });

  it('prices the listing-intel endpoint at $0.25', async () => {
    const res = await app.request('/v1/x402/listing-intel');
    expect(res.status).toBe(402);
    const body = (await res.json()) as { accepts: Array<{ maxAmountRequired: string }> };
    expect(body.accepts[0]!.maxAmountRequired).toBe('250000'); // $0.25 × 1e6
  });
});
