import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';
import { itDb } from '../../test/db.js';
import { draftListingPacket } from '../../ai/distributionOperator.js';
import { ACTION_REGISTRY } from '../../actions/registry.js';

/**
 * LCX ONE Phase 7 — the grand audit (red-team round 2). A hostile pass over
 * the whole fabric now that all seven phases are in: the AI operator can't
 * publish, its output is grounded/keyless-safe, the x402 layer resists abuse,
 * the compartment gates + governed actions still hold, and no action escaped
 * its workspace tag. This suite is a permanent part of the gate.
 */
const KEY = 'dev-operator-key-change-me';
const PASS = 'test#1234';
const nik = { Authorization: `Bearer nik@lcx.com:${PASS}`, 'Content-Type': 'application/json' };
const sam = { Authorization: `Bearer sam@lcx.com:${PASS}`, 'Content-Type': 'application/json' };

describe('grand audit — AI operator safety (network-free invariants)', () => {
  // Functional LLM output is verified end-to-end via curl (fast, keyed) in the
  // phase wrap — NOT here: a unit suite must never depend on a live model.
  // These assert the security-relevant, deterministic guarantees.

  it('grounds only in the ontology: an unknown surface yields nothing (no LLM call, early return)', async () => {
    const p = await draftListingPacket('not-a-real-surface');
    expect(p.packet).toBe('');
    expect(p.usedLlm).toBe(false);
  });

  it('the operator module exposes only text-returning functions — no write/DB export', async () => {
    const mod = await import('../../ai/distributionOperator.js');
    // The whole surface is read/generate; nothing that mutates state.
    expect(Object.keys(mod).sort()).toEqual(
      ['askDistribution', 'draftGeoContent', 'draftListingPacket', 'suggestCampaign'].sort(),
    );
  });
});

describe('grand audit — registry invariants', () => {
  it('every distribution + governance action is workspace-tagged (no ungoverned writes)', () => {
    for (const [id, a] of Object.entries(ACTION_REGISTRY)) {
      if (id.startsWith('dist_')) expect(a.workspace, id).toBe('distribution');
      if (id.startsWith('grant_') || id.startsWith('revoke_') || id.startsWith('decide_access') || id === 'set_member_profile') {
        expect(a.workspace, id).toBe('governance');
      }
      if (id.startsWith('command_')) expect(a.workspace, id).toBe('command');
    }
  });

  it('access + profile actions are approver-only', () => {
    for (const id of ['grant_entitlement', 'revoke_entitlement', 'decide_access_request', 'set_member_profile']) {
      expect(ACTION_REGISTRY[id]!.minRole, id).toBe('approver');
    }
  });
});

describe('grand audit — live surface (app-level)', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = KEY;
    process.env.DESK_PASSCODE = PASS;
    delete process.env.X402_FACILITATOR_URL;
    invalidateEntitlements();
  });
  afterAll(async () => { await closeDb(); });

  itDb('the AI ask endpoint enforces the compartment gate + input validation (network-free checks)', async () => {
    const anon = await app.request('/v1/distribution/ask', { method: 'POST', body: JSON.stringify({ question: 'which rail?' }) });
    expect(anon.status).toBe(401); // gate first — no auth, never reaches the model
    const short = await app.request('/v1/distribution/ask', { method: 'POST', headers: nik, body: JSON.stringify({ question: 'x' }) });
    expect(short.status).toBe(400); // validation before any model call
    // The 200 path invokes the model — verified end-to-end via curl in the wrap.
  });

  it('x402 replay/tamper: a bogus or altered payment never settles', async () => {
    const bogus = await app.request('/v1/x402/token-risk', { headers: { 'X-Payment': 'replayed-nonce' } });
    expect(bogus.status).toBe(402);
    const empty = await app.request('/v1/x402/token-risk');
    expect(empty.status).toBe(402);
    // only the sandbox-prefixed signal settles (and only in sandbox mode)
    const ok = await app.request('/v1/x402/token-risk?token=USDC', { headers: { 'X-Payment': 'sandbox:x' } });
    expect(ok.status).toBe(200);
  });

  it('cross-workspace: an operator still cannot invoke an approver-only governance action', async () => {
    const res = await app.request('/v1/actions/grant_entitlement/invoke', {
      method: 'POST', headers: sam,
      body: JSON.stringify({ subjectType: 'member', subjectId: 'monty', params: { workspace: 'distribution', capability: 'approve', justification: 'round-2 escalation probe' } }),
    });
    expect(res.status).toBe(403);
  });

  it('the AI drafters are inside the distribution gate (401 anon)', async () => {
    for (const path of ['/v1/distribution/geo-draft', '/v1/distribution/listing-packet', '/v1/distribution/campaign-suggest']) {
      const res = await app.request(path, { method: 'POST', body: JSON.stringify({}) });
      expect(res.status, path).toBe(401);
    }
  });
});
