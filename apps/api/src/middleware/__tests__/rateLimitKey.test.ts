import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TEAM } from '@lcx/shared';
import { Hono } from 'hono';
import {
  _provenCredentialCount,
  _rateLimitBucketCount,
  _rateLimitKeyFor,
  _resetRateLimit,
  rateLimit,
} from '../rateLimit.js';
import { requireOperator } from '../auth.js';
import { createApp } from '../../app.js';
import { invalidateEntitlements } from '../../access/entitlements.js';
import { env } from '../../lib/env.js';

/* The second tier authenticates an address the limiter cannot enumerate, which is the only
   path left that exercises PROMOTION rather than recognition. */
const SECONDARY = 'promo-secondary-probe-value';
process.env.SECONDARY_PASSCODE = SECONDARY;

/**
 * THE BUCKET KEY HAS BEEN ATTACKER-CONTROLLED TWICE AND VICTIM-CONTROLLED ONCE.
 *
 * ROUND ONE: the key was `key:${djb2(credential)}:${firstXffHop}`. `X-Forwarded-For` is a
 * header anyone may write, so ONE holder of ONE valid credential minted a fresh bucket per
 * request by rotating it and the 240/min cap never tripped.
 *
 * ROUND TWO: the replacement was `key:${djb2(credential)}`. But `app.ts:136` mounts this
 * limiter BEFORE any route auth, so "the credential" there is an arbitrary string the
 * caller chose — and guessing a passcode rotates that string by definition, so the
 * guessing attack and the bucket-minting attack are the same keystrokes.
 *
 * ROUND THREE, reverted the same day it landed: unproven credentials were pooled per
 * SOURCE. That fixed the minting and made any laptop a platform-wide outage, because in
 * this deployment every caller collapses to one source and the victim was then in the
 * attacker's bucket.
 *
 * ── WHAT THESE TESTS HAVE TO BE, GIVEN THAT HISTORY ──────────────────────────────────
 * All three rounds were "the key derives from something one side of the fight controls",
 * and a test that names the offending input can only ever catch the input someone thought
 * of. So the assertions below are CLOSURE and INDEPENDENCE assertions:
 *   · the key of an unproven request must be EXACTLY the key of a request carrying the
 *     same claimed identity and nothing else — any other caller-supplied byte entering the
 *     key, including one nobody has thought of, breaks that equality;
 *   · two different claimed identities must never share a bucket, so one being attacked
 *     cannot refuse the other.
 *
 * ── NOT A TIMING TEST ────────────────────────────────────────────────────────────────
 * Nothing here reads a clock or sleeps. The observables are `X-RateLimit-Remaining`, the
 * status code, and the two test-only counters. A monotone step-down across a rotating
 * input IS the proof that the input no longer participates in the key.
 */

const remaining = (res: Response): number => Number(res.headers.get('X-RateLimit-Remaining'));

/**
 * Read, never set. `env.operatorApiKey` goes through `required()`, which SNAPSHOTS
 * process.env at module evaluation, long before any hook runs — the same trap documented
 * in `secondTierThrottle.test.ts`.
 */
const OPERATOR_KEY = env.operatorApiKey;
const DESK = (email: string) => `${email}:${env.deskPasscode}`;

/** A real Hono with only this middleware mounted — nothing mocked, nothing else in the way. */
function bare(cfg?: Parameters<typeof rateLimit>[0]): Hono {
  const app = new Hono();
  app.use('*', rateLimit(cfg));
  app.get('/health', (c) => c.text('ok'));
  app.get('/x', (c) => c.text('ok'));
  return app;
}

/**
 * The same middleware in front of the REAL `requireOperator`, because the whole fix turns
 * on a distinction only real authentication can draw: a credential earns a bucket of its
 * own once THE SERVER has accepted it, and never because the caller presented it. A stub
 * that "authenticates" whatever the test says would assert the stub, not the property.
 */
function guarded(cfg?: Parameters<typeof rateLimit>[0]): Hono {
  const app = new Hono();
  app.use('*', rateLimit(cfg));
  app.get('/guarded', requireOperator, (c) => c.text('ok'));
  // Deliberately UNAUTHENTICATED and deliberately 200: a route that succeeds without
  // authenticating must not be able to promote a credential. See the test that uses it.
  app.get('/open', (c) => c.text('ok'));
  return app;
}

/**
 * The credential shapes `resolvePrincipal` accepts, DERIVED from its source rather than listed here.
 * A hand-written list cannot fail on the path nobody thought of, which is the failure mode the test
 * that uses this exists to prevent.
 */
function credentialShapesResolvePrincipalAccepts() {
  const src = readFileSync(resolve(process.cwd(), 'src/middleware/auth.ts'), 'utf8');
  const shapes = [];
  if (/safeEqual\(key, env\.operatorApiKey\)/.test(src)) {
    shapes.push({ name: 'the shared OPERATOR_API_KEY', cred: env.operatorApiKey });
  }
  if (/safeEqual\(passcode, env\.deskPasscode\)/.test(src)) {
    shapes.push({ name: 'a roster email with DESK_PASSCODE', cred: `nik@lcx.com:${env.deskPasscode}` });
  }
  if (/safeEqual\(passcode, env\.secondaryPasscode\)/.test(src)) {
    shapes.push({ name: 'an lcx.com address with SECONDARY_PASSCODE', cred: `anyone@lcx.com:${env.secondaryPasscode}` });
  }
  return shapes;
}

describe('the key of an unproven request carries the claimed IDENTITY and nothing else', () => {
  beforeEach(() => _resetRateLimit());

  /** A context shaped exactly as the middleware sees one, with a chosen header map. */
  const ctx = (headers: Record<string, string>) => ({
    req: { header: (n: string) => headers[n.toLowerCase()] },
    get: (_k: 'operator') => undefined,
  });

  it('is unchanged by any other byte the caller writes, including headers nobody listed', () => {
    // Names and values are generated, so this is not a list of headers someone remembered
    // — it is "caller data, wherever it is put".
    const noise: Record<string, string> = {};
    for (let i = 0; i < 24; i++) noise[`x-generated-${i}`] = `tok-${i}-${'z'.repeat(i)}`;

    const baseline = _rateLimitKeyFor(ctx({ authorization: 'Bearer nik@lcx.com:pw' }));
    const cases = [
      { ...noise, authorization: 'Bearer nik@lcx.com:pw', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      { ...noise, authorization: 'Bearer nik@lcx.com:pw', 'x-real-ip': '198.51.100.4', forwarded: 'for=203.0.113.9' },
      { ...noise, authorization: 'Bearer nik@lcx.com:pw', 'user-agent': 'curl/8', cookie: 'session=abc' },
      { ...noise, authorization: 'ApiKey nik@lcx.com:pw' },
      { ...noise, authorization: 'bearer  nik@lcx.com:pw' },
      { ...noise, 'x-api-key': 'nik@lcx.com:pw' },
    ];
    for (const headers of cases) expect(_rateLimitKeyFor(ctx(headers))).toBe(baseline);
  });

  it('is unchanged by the SECRET half — which is the half a guess varies', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 64; i++) {
      const key = _rateLimitKeyFor(ctx({ authorization: `Bearer nik@lcx.com:guess-${i}` }));
      expect(key).not.toContain(`guess-${i}`);
      keys.add(key);
    }
    expect(keys.size).toBe(1);
  });

  it('DOES change with the claimed identity, so one identity under attack is not everyone', () => {
    const nik = _rateLimitKeyFor(ctx({ authorization: 'Bearer nik@lcx.com:pw' }));
    const monty = _rateLimitKeyFor(ctx({ authorization: 'Bearer monty@lcx.com:pw' }));
    const stranger = _rateLimitKeyFor(ctx({ authorization: 'Bearer nobody@example.com:pw' }));
    const opaque = _rateLimitKeyFor(ctx({ authorization: 'Bearer some-api-key-shaped-string' }));
    const none = _rateLimitKeyFor(ctx({}));
    expect(new Set([nik, monty, stranger, opaque, none]).size).toBe(5);
  });

  it('collapses every identity that is not on the roster into ONE key, so it cannot be minted', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(_rateLimitKeyFor(ctx({ authorization: `Bearer u${i}@lcx.com:pw` })));
    for (let i = 0; i < 200; i++) keys.add(_rateLimitKeyFor(ctx({ 'x-api-key': `junk-${i}` })));
    expect(keys.size).toBe(2); // `other` and `opaque`, and nothing else
  });

  it('reads the roster the way auth.ts does — case and padding are not new identities', () => {
    // `findMemberByEmail` lower-cases and trims, and `auth.ts` splits the credential at the
    // FIRST colon. Both files must agree or one identity gets two buckets. The padded case
    // goes through `X-API-Key` on purpose: an `Authorization` value is split on whitespace
    // by BOTH files identically, so padding inside a Bearer token is a different question
    // and not one the key can answer.
    const canonical = _rateLimitKeyFor(ctx({ authorization: 'Bearer nik@lcx.com:pw' }));
    for (const spelling of ['NIK@LCX.COM', 'nIk@lCx.CoM']) {
      expect(_rateLimitKeyFor(ctx({ authorization: `Bearer ${spelling}:pw` }))).toBe(canonical);
    }
    expect(_rateLimitKeyFor(ctx({ 'x-api-key': '   Nik@LCX.com:pw   ' }))).toBe(canonical);
  });
});

describe('bucket minting is O(1) in the number of guesses', () => {
  beforeEach(() => _resetRateLimit());

  it('rotating the secret K times creates the same ONE bucket at every K', async () => {
    // THE REGRESSION DETECTOR. Under the defect this was exactly K up to the map ceiling,
    // which is why a 195-second flood reached 17,339 evaluated guesses. Measuring at three
    // separations of magnitude means a leak cannot hide inside a constant.
    const counts: number[] = [];
    for (const k of [8, 64, 512]) {
      _resetRateLimit();
      const app = bare({ maxRequests: 10_000 });
      for (let i = 0; i < k; i++) {
        await app.request('/x', { headers: { Authorization: `Bearer nik@lcx.com:guess-${i}` } });
      }
      counts.push(_rateLimitBucketCount());
    }
    expect(counts).toEqual([1, 1, 1]);
  });

  it('the cap FIRES under rotation, at the same place it fires for a fixed credential', async () => {
    // The pentest measured these two runs side by side and they disagreed:
    // 300 fixed -> {401: 240, 429: 60}; 300 rotated -> {401: 300, 429: 0}. They must not.
    const run = async (rotate: boolean) => {
      _resetRateLimit();
      const app = bare({ maxRequests: 3 });
      const out: number[] = [];
      for (let i = 0; i < 6; i++) {
        const cred = rotate ? `nik@lcx.com:g${i}` : 'nik@lcx.com:fixed';
        out.push((await app.request('/x', { headers: { Authorization: `Bearer ${cred}` } })).status);
      }
      return out;
    };
    const fixed = await run(false);
    const rotated = await run(true);
    expect(fixed).toEqual([200, 200, 200, 429, 429, 429]);
    expect(rotated).toEqual(fixed);
  });

  it('rotating BOTH the secret and X-Forwarded-For is no better than rotating neither', async () => {
    // Round one and round two of the defect, combined into the one request an attacker
    // would actually send.
    const app = bare({ maxRequests: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (
          await app.request('/x', {
            headers: {
              Authorization: `Bearer nik@lcx.com:g${i}`,
              'X-Forwarded-For': `198.51.100.${i}, 10.0.0.1`,
            },
          })
        ).status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
    expect(_rateLimitBucketCount()).toBe(1);
  });

  it('an Authorization scheme auth would never accept mints no buckets either', async () => {
    // `middleware/auth.ts extractApiKey` only reads `Bearer` and `ApiKey`, so anything
    // else is not a credential and must not act as one here.
    const app = bare({ maxRequests: 100 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(remaining(await app.request('/x', { headers: { Authorization: `Basic ${i}-${'x'.repeat(i)}` } })));
    }
    expect(seen).toEqual([99, 98, 97, 96]);
    expect(_rateLimitBucketCount()).toBe(1);
  });

  it('never rate-limits the liveness probe', async () => {
    const app = bare({ maxRequests: 1 });
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/health')).status).toBe(200);
    }
  });
});

describe('one identity being attacked does not refuse anybody else', () => {
  beforeEach(() => _resetRateLimit());

  it('a flood against one roster address leaves a COLD, CORRECT sign-in as another admitted', async () => {
    // THE TEST THAT KILLED THE PREVIOUS ATTEMPT, at unit scale. Under the source-keyed
    // fix this returned 429 forever; under the pre-fix code it returned 429 until the
    // attacker's minted buckets aged out. It must return 200 on the first try.
    const app = guarded({ maxRequests: 4 });
    const flood: number[] = [];
    for (let i = 0; i < 12; i++) {
      flood.push((await app.request('/guarded', { headers: { Authorization: `Bearer nik@lcx.com:g${i}` } })).status);
    }
    expect(flood.filter((s) => s === 429).length).toBeGreaterThan(4);

    const cold = await app.request('/guarded', { headers: { Authorization: `Bearer ${DESK('monty@lcx.com')}` } });
    expect(cold.status).toBe(200);
  });

  it('a credential flood cannot 429 the no-credential family — webhooks, unsubscribe, SSE', async () => {
    // MEASURED DEFECT, 2026-08-16: a 195-second credential flood returned the
    // credential-free poller `{401: 124, 429: 60}` — one whole window of refusals — while
    // it had sent nothing but credential-free requests. This is that end to end.
    const app = bare({ maxRequests: 3, maxBuckets: 2 });
    for (let i = 0; i < 30; i++) {
      await app.request('/x', { headers: { Authorization: `Bearer nik@lcx.com:g${i}` } });
    }
    const noCredential: number[] = [];
    for (let i = 0; i < 3; i++) noCredential.push((await app.request('/x')).status);
    expect(noCredential).toEqual([200, 200, 200]);
  });

  it('and the mechanism that guarantees it: the no-credential key is NEVER folded into overflow', async () => {
    // The end-to-end test above passes for a second reason too — a credential flood can no
    // longer reach the overflow bucket at all — so on its own it would still pass if the
    // fold were re-widened. This drives the map to its ceiling with the one family that CAN
    // still fold (a proven credential), saturates the overflow bucket, and then asks the
    // credential-free caller. It is the only test here that separates the two reasons.
    const app = guarded({ maxRequests: 3, maxBuckets: 1 });
    const h = { Authorization: `Bearer ${OPERATOR_KEY}` };
    const proven: number[] = [];
    for (let i = 0; i < 6; i++) proven.push((await app.request('/guarded', { headers: h })).status);
    // The map is at its ceiling and the shared overflow bucket is spent.
    expect(proven.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect((await app.request('/open')).status).toBe(200);
  });

  it('the shared API key and a desk sign-in are different families, so neither starves the other', async () => {
    const app = bare({ maxRequests: 3 });
    for (let i = 0; i < 10; i++) await app.request('/x', { headers: { 'X-API-Key': `junk-${i}` } });
    expect((await app.request('/x', { headers: { Authorization: `Bearer nik@lcx.com:pw` } })).status).toBe(200);
  });
});

describe('what fills the unproven bucket is FAILURE, never a legitimate request', () => {
  beforeEach(() => _resetRateLimit());

  it('a cold burst of CORRECT sign-ins does not consume the budget it would otherwise trip', async () => {
    // Fired together so every one of them is still unproven when the limiter decides:
    // the promotion happens in the continuation, which has not run for any of them yet.
    // Counting requests would 429 the tail of a cold browser load; counting failures
    // cannot, because none of these failed.
    const app = guarded({ maxRequests: 3 });
    const statuses = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.request('/guarded', { headers: { Authorization: `Bearer ${DESK('nik@lcx.com')}` } }).then((r) => r.status),
      ),
    );
    /*
     * AMENDED, and the amendment is the point. A correct credential is now recognised on request
     * ONE and counted in its OWN bucket, so at an artificial `maxRequests: 3` the tail of a
     * ten-request burst is refused — by its own budget, which is what a per-credential rate limit
     * is for. In production that budget is 240 a minute and a cold page load spends ten of it.
     *
     * What must NOT happen is these requests consuming the SHARED budget, because that is the one
     * an attacker can also spend, and that is what the next assertion checks. The previous version
     * asserted ten 200s, which was true only because a correct credential spent its first request
     * unrecognised — the warm-up that let a flood hold cron out.
     */
    expect(statuses.filter((x) => x === 200).length,
      'a correct credential must be admitted up to its OWN budget').toBe(3);
    expect(new Set(statuses)).toEqual(new Set([200, 429]));
  });

  it('and the shared claim budget is UNTOUCHED by them, which is the property that matters', () => {
    /*
     * The half of the old assertion that is still true and is the one worth keeping: an attacker
     * shares the claim bucket, so if legitimate sign-ins spent it, an attacker could be starved by
     * ordinary traffic — or, far worse and measured twice on earlier attempts, ordinary traffic
     * could be starved by an attacker. A recognised credential never enters that bucket at all.
     */
    const keyOf = (cred: string): string =>
      _rateLimitKeyFor({
        req: { header: (n: string) => (n.toLowerCase() === 'authorization' ? `Bearer ${cred}` : undefined) },
        get: () => undefined,
      } as Parameters<typeof _rateLimitKeyFor>[0]);
    expect(keyOf(DESK('nik@lcx.com')).startsWith('claim:'),
      'a correct sign-in is landing in the shared claim bucket').toBe(false);
    expect(keyOf('nik@lcx.com:wrong').startsWith('claim:'),
      'a wrong guess must land in the shared claim bucket').toBe(true);
  });

  it('and the same burst of WRONG ones does trip it', async () => {
    // The negative control for the test above: identical shape, identical count, only the
    // passcode differs. If both passed, the assertion above would be proving nothing.
    const app = guarded({ maxRequests: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      statuses.push((await app.request('/guarded', { headers: { Authorization: `Bearer nik@lcx.com:no-${i}` } })).status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(4);
  });

  it('a REFUSED request does not extend the lockout — only evaluated guesses charge', async () => {
    // `lib/secondTier.ts` gives the reasoning for its own throttle: counting refusals lets
    // a sustained attacker hold the window open forever. The same must hold here, or the
    // lockout stops being bounded by the window and becomes bounded by the attack.
    const app = guarded({ maxRequests: 3 });
    for (let i = 0; i < 3; i++) await app.request('/guarded', { headers: { Authorization: `Bearer nik@lcx.com:a${i}` } });
    expect((await app.request('/guarded', { headers: { Authorization: 'Bearer nik@lcx.com:b' } })).status).toBe(429);
    const before = Number(
      (await app.request('/guarded', { headers: { Authorization: 'Bearer nik@lcx.com:c' } })).headers.get('X-RateLimit-Remaining'),
    );
    for (let i = 0; i < 20; i++) await app.request('/guarded', { headers: { Authorization: `Bearer nik@lcx.com:d${i}` } });
    const after = Number(
      (await app.request('/guarded', { headers: { Authorization: 'Bearer nik@lcx.com:e' } })).headers.get('X-RateLimit-Remaining'),
    );
    expect(after).toBe(before);
  });
});

describe('a bucket of your own is something the SERVER grants, through real authentication', () => {
  beforeEach(() => _resetRateLimit());

  it('a KNOWN secret skips the claim bucket entirely — it is recognised, not promoted', async () => {
    /*
     * THIS TEST USED TO ASSERT A PROMOTION, and the promotion was the outage. A credential had to
     * spend one request in the shared claim bucket before earning its own, so a caller arriving
     * COLD during a flood was refused and could never become warm — refusal happens before the
     * promotion fires. Measured on that version: a cold OPERATOR_API_KEY returned {429: 80} with no
     * admission while the same key warm returned {200: 80}. Cron, held out by an attacker who knew
     * nothing.
     *
     * A secret this process already holds is now recognised on request ONE. So there is no claim
     * bucket in the story any more, and the bucket count is 1 rather than 2.
     */
    const app = guarded({ maxRequests: 100 });
    const h = { Authorization: `Bearer ${OPERATOR_KEY}` };

    expect(remaining(await app.request('/guarded', { headers: h }))).toBe(99);
    expect(remaining(await app.request('/guarded', { headers: h }))).toBe(98);
    expect(_rateLimitBucketCount(), 'a known secret must not touch a shared bucket at all').toBe(1);
  });

  it('and PROMOTION still exists for a credential the limiter cannot recognise', async () => {
    /*
     * Recognition is a fast path over the secrets this process holds; promotion is the general
     * mechanism, and it is what would cover an auth path added later — a per-user token from the
     * database, say — that `matchesKnownSecret` knows nothing about. Kept, and asserted, so it does
     * not rot into dead code that looks live.
     *
     * Driven through the second tier, which authenticates an address the limiter cannot enumerate.
     */
    const app = guarded({ maxRequests: 100 });
    const h = { Authorization: `Bearer promo-probe@lcx.com:${SECONDARY}` };
    const first = await app.request('/guarded', { headers: h });
    expect(first.status, 'the second tier must authenticate for this test to mean anything').toBe(200);
    expect(_provenCredentialCount(), 'the server\'s verdict did not promote the credential').toBe(1);
  });

  it('a 200 from a route that never authenticates does NOT promote anything', async () => {
    // The promotion reads the server's verdict (`c.get('operator')`), not the status code.
    // If it ever read the status, this junk credential would earn a bucket from a public
    // endpoint and the whole minting surface would be back.
    const app = guarded({ maxRequests: 100 });
    for (let i = 0; i < 20; i++) {
      expect((await app.request('/open', { headers: { 'X-API-Key': `junk-${i}` } })).status).toBe(200);
    }
    expect(_provenCredentialCount()).toBe(0);
  });

  it('a proven credential is ONE bucket however the header spells it', async () => {
    const app = guarded({ maxRequests: 100 });
    await app.request('/guarded', { headers: { Authorization: `Bearer ${OPERATOR_KEY}` } });
    const spellings = [
      { 'X-API-Key': OPERATOR_KEY },
      { Authorization: `Bearer ${OPERATOR_KEY}` },
      { Authorization: `ApiKey ${OPERATOR_KEY}` },
      { Authorization: `bearer  ${OPERATOR_KEY}` },
    ];
    const seen: number[] = [];
    for (const headers of spellings) seen.push(remaining(await app.request('/guarded', { headers })));
    expect(seen).toEqual([98, 97, 96, 95]);
  });

  it('same credential, different IPs, still counted together — shared egress is unharmed', async () => {
    const app = guarded({ maxRequests: 100 });
    await app.request('/guarded', { headers: { Authorization: `Bearer ${OPERATOR_KEY}` } });
    const first = remaining(
      await app.request('/guarded', {
        headers: { Authorization: `Bearer ${OPERATOR_KEY}`, 'X-Forwarded-For': '192.0.2.7' },
      }),
    );
    const second = remaining(
      await app.request('/guarded', {
        headers: { Authorization: `Bearer ${OPERATOR_KEY}`, 'X-Forwarded-For': '192.0.2.99' },
      }),
    );
    /* Counts from request one — see the note on the previous case. The property under test is
       unchanged: one credential is ONE bucket however the header spells it or wherever it comes from. */
    expect([first, second]).toEqual([98, 97]);
  });

  it('a WARM caller keeps working while its own identity is being flooded', async () => {
    // THE POSITIVE CONTROL FOR THE RESIDUAL. A cold caller whose exact claimed identity is
    // under attack IS refused — that is the accepted cost, written down in the file header
    // and measured in docs/3d/AUDIT_PENTEST.md. A caller that has authenticated once is
    // not, because it is no longer in the bucket being attacked.
    const app = guarded({ maxRequests: 4 });
    const good = { Authorization: `Bearer ${DESK('nik@lcx.com')}` };
    expect((await app.request('/guarded', { headers: good })).status).toBe(200);

    for (let i = 0; i < 20; i++) {
      await app.request('/guarded', { headers: { Authorization: `Bearer nik@lcx.com:g${i}` } });
    }
    expect((await app.request('/guarded', { headers: good })).status).toBe(200);
  });
});

describe('the memory ceiling still bounds the families that CAN grow', () => {
  beforeEach(() => _resetRateLimit());

  it('folds proven credentials into the shared overflow bucket once the map is full', async () => {
    // Only `auth:` and `key:` may be folded, and both need a real secret to create. This
    // asserts the ceiling is still wired, using the one credential a test can prove.
    const app = guarded({ maxRequests: 100, maxBuckets: 1 });
    await app.request('/guarded', { headers: { Authorization: `Bearer ${OPERATOR_KEY}` } });
    await app.request('/guarded', { headers: { Authorization: `Bearer ${OPERATOR_KEY}` } });
    expect(_rateLimitBucketCount()).toBeLessThanOrEqual(2);
  });
});

describe('through the real app mount at app.ts:136', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = 'dev-operator-key-change-me';
    invalidateEntitlements();
  });
  beforeEach(() => _resetRateLimit());

  it('RECOGNITION COVERS EVERY AUTH PATH, so promotion is currently unreachable — and that is stated', () => {
    /*
     * THIS TEST REPLACED ONE THAT COULD NO LONGER BE WRITTEN, and the reason is worth more than the
     * test it replaced.
     *
     * The old test demonstrated two positional facts by counting buckets: that `operator` is unset
     * on the way in, and that the continuation runs after auth so a credential gets PROMOTED out of
     * its claimed-identity bucket. It drove that with `OPERATOR_API_KEY`. Once a known secret was
     * recognised on request one, both requests keyed the same private bucket and the count stayed
     * at 1, so the demonstration stopped working.
     *
     * The obvious repair was to drive it with a credential the limiter cannot recognise. THERE IS
     * NO SUCH CREDENTIAL. `resolvePrincipal` accepts exactly three things — the shared API key, a
     * roster email with the desk passcode, and an lcx.com address with the secondary passcode — and
     * `matchesKnownSecret` covers all three. Every credential that can authenticate is recognised
     * before it ever reaches a shared bucket.
     *
     * SO PROMOTION IS DEAD CODE TODAY. This programme has shipped three things that were built,
     * correct and unreachable while the record described them as live, so it is said plainly rather
     * than left for someone to discover: the promotion path in `rateLimit.ts` cannot currently fire.
     * It is kept because it is the GENERAL mechanism — an auth path added later, a per-user token
     * from the database, would be caught by it and not by recognition — and deleting it would mean
     * rebuilding it the day that lands.
     *
     * What this test does instead is pin the PREMISE. If a fourth auth path appears and recognition
     * does not cover it, this goes red and the reader has a choice to make: extend recognition, or
     * accept that the new path warms up through promotion and inherits the cold-start behaviour
     * that caused two outages.
     */
    const paths = credentialShapesResolvePrincipalAccepts();
    expect(paths.length, 'no auth paths derived — this check would pass vacuously').toBeGreaterThanOrEqual(3);
    const keyOf = (cred) => _rateLimitKeyFor({
      req: { header: (n) => (n.toLowerCase() === 'authorization' ? `Bearer ${cred}` : undefined) },
      get: () => undefined,
    });
    for (const { name, cred } of paths) {
      expect(keyOf(cred).startsWith('key:'),
        `${name} is NOT recognised on arrival, so it warms up through the shared bucket and can be`
        + ' starved by an attacker on a cold start. Either extend matchesKnownSecret or accept that.')
        .toBe(true);
    }
  });

  it('shares one bucket across a rotating X-Forwarded-For', async () => {
    const headers = (i: number) => ({
      Authorization: 'Bearer dev-operator-key-change-me',
      'X-Forwarded-For': `203.0.113.${100 + i}`,
    });
    await app.request('/v1/distribution/campaigns', { headers: headers(0) }); // prove it once
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(remaining(await app.request('/v1/distribution/campaigns', { headers: headers(i) })));
    }
    const [first] = seen;
    expect(seen).toEqual([first, first - 1, first - 2, first - 3]);
  });

  it('a rotating credential through the real mount cannot mint buckets either', async () => {
    for (let i = 0; i < 200; i++) {
      await app.request('/v1/distribution/campaigns', {
        headers: { Authorization: `Bearer nik@lcx.com:guess-${i}` },
      });
    }
    expect(_rateLimitBucketCount()).toBe(1);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  A CREDENTIAL THAT IS ALREADY CORRECT GETS ITS OWN BUCKET ON REQUEST ONE.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  This property took three attempts and produced two outages before it was named, so it is pinned
 *  rather than left to the shape of the key builder.
 *
 *  ATTEMPT 1 keyed unproven credentials by SOURCE. Twenty connections — one laptop — refused a roster
 *  approver holding the correct passcode for 180 consecutive seconds across three window rollovers.
 *  ATTEMPT 2 keyed by CLAIMED IDENTITY, which fixed that for a targeted victim and broke cron: every
 *  colon-free string an attacker invents shared the bucket the shared `OPERATOR_API_KEY` lands in, so
 *  a COLD API key measured {429: 80} with no admission, while the same key WARM measured {200: 80}.
 *  Self-sealing, because refusal happens before the promotion that would have made it warm.
 *
 *  Both failed the same way: they made a correct credential WAIT to be recognised. The fix is to
 *  recognise it immediately — comparing against the secrets this process already holds is a
 *  constant-time string compare, affordable before deciding to refuse.
 *
 *  WHY THIS IS NOT AN ATTACKER'S DOOR: minting a private bucket this way requires presenting a secret
 *  that is ALREADY CORRECT. An attacker who can do that does not need a bucket. Every wrong guess
 *  still falls through to the shared claim bucket and is still counted — asserted below, because a
 *  fix that admits everybody is not a fix.
 */
describe('an already-correct credential is never collateral of someone else failing', () => {
  const keyFor = (cred: string): string =>
    _rateLimitKeyFor({
      req: { header: (n: string) => (n.toLowerCase() === 'authorization' ? `Bearer ${cred}` : undefined) },
      get: () => undefined,
    } as Parameters<typeof _rateLimitKeyFor>[0]);

  it('the shared operator key gets a PRIVATE bucket cold, so a credential flood cannot hold cron out', () => {
    const cron = keyFor(env.operatorApiKey);
    expect(cron.startsWith('key:'), `cron keyed as ${cron}, which is shared — this is the outage`).toBe(true);
  });

  it('a roster operator with the CORRECT passcode gets a private bucket cold', () => {
    const real = keyFor(`nik@lcx.com:${env.deskPasscode}`);
    expect(real.startsWith('key:'), `a correct sign-in keyed as ${real}`).toBe(true);
  });

  it('and WRONG guesses still share, whatever they claim — otherwise the throttle is decorative', () => {
    /* The negative half, and the one that makes the test above meaningful. Derived rather than
       listed: several shapes an attacker can vary, none of which may earn a private bucket. */
    const guesses = [
      'nik@lcx.com:wrong-1', 'nik@lcx.com:wrong-2', 'monty@lcx.com:wrong-1',
      'nobody@evil.test:wrong', 'opaque-junk-1', 'opaque-junk-2',
    ];
    for (const g of guesses) {
      expect(keyFor(g).startsWith('key:'), `${g} earned a private bucket — an attacker can mint`).toBe(false);
    }
    /* And they must not each get their OWN shared bucket either, or rotation is back. */
    /* Bounded, not fixed: the claim space is the roster plus `other` plus `opaque`, so the ceiling
       is derived from the roster rather than typed. What matters is that it does not grow with the
       number of GUESSES, which is what rotation exploited. */
    const ceiling = TEAM.length + 2;
    expect(new Set(guesses.map(keyFor)).size,
      'wrong guesses spread across too many buckets — rotation evades the cap again')
      .toBeLessThanOrEqual(ceiling);
  });

  it('a near-miss on the real secret is still a miss', () => {
    /* Guards against a prefix or length comparison creeping in where an exact one is required. */
    expect(keyFor(`nik@lcx.com:${env.deskPasscode}x`).startsWith('key:')).toBe(false);
    expect(keyFor(`nik@lcx.com:${env.deskPasscode.slice(0, -1)}`).startsWith('key:')).toBe(false);
    expect(keyFor(`${env.operatorApiKey}x`).startsWith('key:')).toBe(false);
  });
});
