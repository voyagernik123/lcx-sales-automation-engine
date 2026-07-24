import type { Context, MiddlewareHandler } from 'hono';
import { env } from '../lib/env.js';

/**
 * The x402 seller layer (LCX ONE Phase 4) — PayAgent takes the first-seller
 * position on the rail it is adopting. LCX data products (token risk, market
 * intel, listing intel) are exposed as x402-priced endpoints: a request with
 * no payment gets the HTTP 402 challenge (the `exact` scheme handshake shape);
 * a request carrying the payment header is verified via a facilitator and the
 * resource is served.
 *
 * KEYLESS BY DEFAULT (the standing rule): with no facilitator configured
 * (X402_FACILITATOR_URL unset), the layer runs in SANDBOX — it still issues
 * the 402 challenge, and it accepts a sandbox payment header, simulating
 * settlement and logging it. The moment PayAgent's x402 work + CDP keys land,
 * one env var flips it to live and every sale becomes real (and a PayAgent
 * demo). Nothing here is blocked on procurement.
 */

export interface PricedEndpoint {
  id: string;
  path: string;                 // the x402-protected resource path
  description: string;
  priceUsd: number;             // price in USDC (the `exact` amount)
  network: string;              // e.g. 'base'
  asset: string;                // e.g. 'USDC'
  /** Produces the resource once payment is settled. */
  produce: (c: Context) => Record<string, unknown>;
}

export function x402Mode(): 'live' | 'sandbox' {
  return env.x402FacilitatorUrl ? 'live' : 'sandbox';
}

/** The PAYMENT-REQUIRED challenge body (x402 exact-scheme shape). */
export function paymentRequired(ep: PricedEndpoint): Record<string, unknown> {
  return {
    x402Version: 1,
    error: 'payment required',
    accepts: [
      {
        scheme: 'exact',
        network: ep.network,
        maxAmountRequired: String(Math.round(ep.priceUsd * 1_000_000)), // 6dp USDC atomic
        asset: ep.asset,
        payTo: env.x402PayTo || '0xLCX_PAYAGENT_RECEIVER',
        resource: ep.path,
        description: ep.description,
        mimeType: 'application/json',
        maxTimeoutSeconds: 60,
      },
    ],
  };
}

/** Facilitator verify+settle. In sandbox, simulate; live path is a TODO the
 *  env flip enables (wire to CDP /verify + /settle when keys arrive). */
export async function verifyAndSettle(paymentHeader: string, ep: PricedEndpoint): Promise<{ ok: boolean; mode: string; txRef: string | null }> {
  if (x402Mode() === 'sandbox') {
    // Sandbox accepts a non-empty payment header prefixed 'sandbox:' and
    // simulates settlement deterministically — enough to exercise the whole
    // handshake, gate, and telemetry without a chain or a key.
    const ok = paymentHeader.startsWith('sandbox:');
    return { ok, mode: 'sandbox', txRef: ok ? `sandbox-tx-${ep.id}` : null };
  }
  // Live path (enabled by X402_FACILITATOR_URL) — intentionally not called
  // until PayAgent's x402 integration + CDP keys land; keyless-first.
  return { ok: false, mode: 'live-unconfigured', txRef: null };
}

/** Guards a priced endpoint: 402 without payment, serve with valid payment. */
export function x402Guard(ep: PricedEndpoint): MiddlewareHandler {
  return async (c) => {
    const payment = c.req.header('x-payment') ?? c.req.header('payment-signature') ?? '';
    if (!payment) {
      return c.json(paymentRequired(ep), 402);
    }
    const settle = await verifyAndSettle(payment, ep);
    if (!settle.ok) {
      return c.json({ ...paymentRequired(ep), reason: 'payment invalid or unsettled' }, 402);
    }
    const body = ep.produce(c);
    c.header('X-Payment-Response', JSON.stringify({ settled: true, mode: settle.mode, txRef: settle.txRef }));
    return c.json({ data: body, payment: { settled: true, mode: settle.mode, txRef: settle.txRef } });
  };
}

/* ── The catalog: LCX data products, x402-priced ── */
export const X402_CATALOG: PricedEndpoint[] = [
  {
    id: 'token_risk',
    path: '/v1/x402/token-risk',
    description: 'LCX token-risk snapshot: liquidity, holder concentration, contract flags.',
    priceUsd: 0.05,
    network: 'base',
    asset: 'USDC',
    produce: (c) => {
      const token = c.req.query('token') ?? 'UNKNOWN';
      return {
        product: 'token-risk',
        token,
        // Deterministic illustrative payload (real scoring wires to the intel
        // layer when the endpoint goes live); shape is the contract.
        liquidityGrade: 'B',
        holderConcentration: 'medium',
        contractFlags: [],
        note: 'Illustrative LCX token-risk shape — x402 seller layer (sandbox).',
      };
    },
  },
  {
    id: 'listing_intel',
    path: '/v1/x402/listing-intel',
    description: 'LCX listing-readiness intel for a token or exchange target.',
    priceUsd: 0.25,
    network: 'base',
    asset: 'USDC',
    produce: (c) => ({
      product: 'listing-intel',
      subject: c.req.query('subject') ?? 'UNKNOWN',
      readiness: 'partial',
      blockers: ['legal opinion', 'market surveillance config'],
      note: 'Illustrative LCX listing-intel shape — x402 seller layer (sandbox).',
    }),
  },
];
