import { Hono } from 'hono';
import { X402_CATALOG, x402Guard, x402Mode, paymentRequired } from '../x402/seller.js';

/**
 * x402 seller routes (LCX ONE Phase 4). Deliberately UNAUTHENTICATED by the
 * desk gate: the whole point of x402 is that any agent — with no account, no
 * API key — can discover, pay, and get the resource. Payment IS the auth.
 * Runs in sandbox until X402_FACILITATOR_URL is set (keyless-first).
 *
 *  GET /v1/x402/catalog       — the priced-endpoint catalog (discovery)
 *  GET /v1/x402/:id           — 402 challenge without payment; resource with it
 */
export const x402Routes = new Hono();

x402Routes.get('/catalog', (c) =>
  c.json({
    data: {
      mode: x402Mode(),
      seller: 'PayAgent by LCX AI Labs',
      endpoints: X402_CATALOG.map((e) => ({
        id: e.id, path: e.path, description: e.description,
        priceUsd: e.priceUsd, network: e.network, asset: e.asset,
        challenge: paymentRequired(e),
      })),
    },
  }),
);

// Each catalog endpoint is guarded by its own 402 handshake.
for (const ep of X402_CATALOG) {
  const sub = ep.path.replace('/v1/x402/', '');
  x402Routes.get(`/${sub}`, x402Guard(ep));
}
