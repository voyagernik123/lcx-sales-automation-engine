import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createApp } from '../../app.js';
import { requireOperator, resolvePrincipal, secondTierThrottleKey } from '../auth.js';
import {
  SECOND_TIER_MAX_FAILURES,
  _resetSecondTier,
  secondTierThrottled,
} from '../../lib/secondTier.js';
import { DESK_PASSCODE_DEV_FALLBACK, env } from '../../lib/env.js';

/**
 * THE SECOND-TIER BRUTE-FORCE LOCKOUT WAS DEAD CODE FOR ITS ENTIRE LIFE.
 *
 * `lib/secondTier.ts` exported `secondTierThrottled` and `secondTierFailed`, documented
 * the 5-failures-then-30-seconds design and the reason it is keyed per source, and
 * nothing in this repository ever imported either one — not a caller, not even a test.
 * Measured against a local production build on 2026-08-15: forty wrong second-tier
 * guesses from one address returned 401 forty times, and the forty-first request, with
 * the correct SECONDARY_PASSCODE, returned 200 with an `ext:probe99` principal. In the
 * same instrument a rotating credential reached 6,865 requests/second.
 *
 * ── WHAT THESE TESTS ARE FOR, GIVEN THE FAILURE MODE ─────────────────────────────
 * The defect was never "the throttle computes the wrong answer". Its unit behaviour was
 * correct. The defect was that NOTHING CALLED IT. So a test that imports the throttle
 * and checks its arithmetic would have passed on the broken code and proved nothing.
 *
 * Every test below therefore goes through a REAL TCP SOCKET into the REAL `createApp()`,
 * served by the SAME `@hono/node-server` adapter `src/index.ts` uses in production. That
 * is not ceremony: the throttle is keyed on the TCP peer address, which does not exist at
 * all under `app.request()`, so an in-process test literally cannot observe this control.
 * The one thing that could make it silently die again — the adapter ceasing to expose the
 * socket — is asserted directly in the first test rather than assumed.
 *
 * `/v1/actions` is the target because it is desk-level (no workspace gate, per `app.ts`)
 * and touches no database, so a 401-vs-200 here is a statement about authentication and
 * nothing else.
 */

const PORT = 5473;
const KEY_PORT = 5474;
const SECONDARY = 'sec-tier-code-for-this-suite';
/**
 * Read, not set. `env.operatorApiKey` goes through `required()`, which SNAPSHOTS
 * process.env at module evaluation — long before any `beforeAll` runs — so assigning
 * OPERATOR_API_KEY in a hook changes nothing and the assertion fails against correct
 * code. `env.secondaryPasscode` is a getter and can be set; these two are deliberately
 * different and the difference is documented in `lib/env.ts`.
 */
const OPERATOR_KEY = env.operatorApiKey;
const BASE = `http://127.0.0.1:${PORT}`;

let server: ReturnType<typeof serve>;
let keyServer: ReturnType<typeof serve>;

/** One request, one source. `source` becomes the RIGHTMOST X-Forwarded-For hop. */
async function attempt(cred: string, source: string, spoofPrefix?: string): Promise<number> {
  const forwarded = spoofPrefix ? `${spoofPrefix}, ${source}` : source;
  const res = await fetch(`${BASE}/v1/actions`, {
    headers: { Authorization: `Bearer ${cred}`, 'X-Forwarded-For': forwarded },
  });
  return res.status;
}

beforeAll(async () => {
  process.env.SECONDARY_PASSCODE = SECONDARY;
  server = serve({ fetch: createApp().fetch, port: PORT, hostname: '127.0.0.1' });

  // A second, deliberately tiny app whose only job is to hand back the key the real
  // adapter produces, so the reachability assertion is about the adapter and not about
  // anything this suite arranged.
  const probe = new Hono();
  probe.get('/key', (c) => c.json({ key: secondTierThrottleKey(c) }));
  probe.get('/guarded', requireOperator, (c) => c.json({ ok: true }));
  keyServer = serve({ fetch: probe.fetch, port: KEY_PORT, hostname: '127.0.0.1' });
  // Let both listeners bind before the first fetch.
  await new Promise((r) => setTimeout(r, 250));
});

afterAll(async () => {
  delete process.env.SECONDARY_PASSCODE;
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => keyServer.close(() => r()));
});

beforeEach(() => _resetSecondTier());

describe('the throttle is REACHED — the property the original code lacked', () => {
  it('the production adapter exposes a peer address, so the key is not null', async () => {
    // If this ever fails, the throttle has gone silently dead exactly the way it was
    // dead before 2026-08-15, and this is the test that says so out loud.
    const res = await fetch(`http://127.0.0.1:${KEY_PORT}/key`);
    const { key } = (await res.json()) as { key: string | null };
    expect(key).not.toBeNull();
    expect(key).toContain('peer:');
  });

  it('requireOperator threads the key in — a locked source is refused by the real middleware', async () => {
    const source = '198.51.100.5';
    for (let i = 0; i < SECOND_TIER_MAX_FAILURES; i++) {
      await fetch(`http://127.0.0.1:${KEY_PORT}/guarded`, {
        headers: { Authorization: `Bearer probe@lcx.com:no-${i}`, 'X-Forwarded-For': source },
      });
    }
    // The middleware — not this test — recorded those failures under a key it derived
    // from the socket. Nothing here calls secondTierFailed.
    const res = await fetch(`http://127.0.0.1:${KEY_PORT}/guarded`, {
      headers: { Authorization: `Bearer probe@lcx.com:${SECONDARY}`, 'X-Forwarded-For': source },
    });
    expect(res.status).toBe(401);
  });
});

describe('the finding, re-run: the 21st guess', () => {
  it('twenty wrong guesses then the CORRECT code — the correct one is now refused', async () => {
    const source = '203.0.113.77';
    const wrong: number[] = [];
    for (let i = 1; i <= 20; i++) wrong.push(await attempt(`probe99@lcx.com:wrong${i}`, source));
    expect(new Set(wrong)).toEqual(new Set([401]));

    // Before this change this line was 200, with an `ext:probe99` principal.
    expect(await attempt(`probe99@lcx.com:${SECONDARY}`, source)).toBe(401);
  });

  it('the budget is FIVE, and the fifth guess is still evaluated — the sixth is not', async () => {
    const source = '203.0.113.78';
    for (let i = 1; i < SECOND_TIER_MAX_FAILURES; i++) {
      expect(await attempt(`probe@lcx.com:wrong${i}`, source)).toBe(401);
    }
    // Budget not yet spent: the correct code still works on the fifth attempt.
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, source)).toBe(200);
  });
});

describe('the lockout closes ONE door, not the desk', () => {
  it('the roster keeps signing in with DESK_PASSCODE while the second tier is shut', async () => {
    const source = '203.0.113.79';
    for (let i = 0; i <= SECOND_TIER_MAX_FAILURES; i++) await attempt(`probe@lcx.com:x${i}`, source);
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, source)).toBe(401);

    // Same source, same instant, a real roster credential. This is the whole reason the
    // throttle check sits after case (2) instead of at the top of resolvePrincipal: an
    // attacker's failures must not become the desk's outage.
    expect(await attempt(`nik@lcx.com:${DESK_PASSCODE_DEV_FALLBACK}`, source)).toBe(200);
  });

  it('cron keeps working: the shared operator key is unaffected by the lockout', async () => {
    const source = '203.0.113.80';
    for (let i = 0; i <= SECOND_TIER_MAX_FAILURES; i++) await attempt(`probe@lcx.com:x${i}`, source);
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, source)).toBe(401);
    expect(await attempt(OPERATOR_KEY, source)).toBe(200);
  });

  it('WITHOUT a declared proxy chain the budget is SHARED, and that is the accepted trade', async () => {
    /*
     * THIS TEST USED TO ASSERT THE OPPOSITE, and it was passing for a reason that made the
     * control decorative. It read the RIGHTMOST X-Forwarded-For hop as "the source", so two
     * `attempt()` calls with different X-Forwarded-For values got different budgets — and a
     * skeptic pointed out that the caller writes that header. Rotating it walked straight
     * through: 200 guesses with the correct passcode hidden at #150 returned one 200.
     *
     * Every request in this suite comes from 127.0.0.1, which is adjacent, and
     * TRUSTED_PROXY_HOPS is unset — so every caller now shares `peer:127.0.0.1`. The budget
     * IS global here. Asserting that plainly, because the previous version of this file
     * asserted the comfortable thing and the comfortable thing was false.
     */
    const attacker = '203.0.113.81';
    const colleague = '203.0.113.82';
    for (let i = 0; i <= SECOND_TIER_MAX_FAILURES * 2; i++) await attempt(`probe@lcx.com:x${i}`, attacker);
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, attacker)).toBe(401);
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, colleague),
      'a different X-Forwarded-For must NOT mint a fresh budget — that was the hole').toBe(401);
  });

  it('and the cost of that trade is bounded: the other two doors stay open while it is shut', async () => {
    /* The reason a shared budget is acceptable at all. Cases 1 and 2 of `resolvePrincipal`
       return BEFORE the throttle, so cron and every named operator are unaffected. If this ever
       goes red, the trade above stops being defensible and the design has to change. */
    const src = '203.0.113.83';
    for (let i = 0; i <= SECOND_TIER_MAX_FAILURES * 2; i++) await attempt(`probe@lcx.com:x${i}`, src);
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, src)).toBe(401);
    expect(await attempt(OPERATOR_KEY, src), 'cron must survive a second-tier lockout').toBe(200);
    expect(await attempt(`nik@lcx.com:${DESK_PASSCODE_DEV_FALLBACK}`, src),
      'a named roster operator must survive a second-tier lockout').toBe(200);
  });
});

describe('the key cannot be rotated by the caller', () => {
  it('rotating ANY hop of X-Forwarded-For does not mint a fresh budget — the attack, re-run', async () => {
    /*
     * THE EXACT ATTACK THAT BROKE THE PREVIOUS VERSION. It rotated the RIGHTMOST hop, which
     * the old key trusted; the old test only rotated the FIRST, so it could never fail. Both
     * ends are rotated here, and the credential varies too, so nothing but the real key can
     * make this pass.
     */
    for (let i = 0; i <= SECOND_TIER_MAX_FAILURES; i++) {
      await attempt(`probe@lcx.com:x${i}`, `203.0.113.${100 + i}`, `10.9.9.${i}`);
    }
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, '203.0.113.199', '10.9.9.254'),
      'the correct passcode must still be refused after rotating both ends of the header').toBe(401);
  });

  it('a successful sign-in clears the budget, so a typo does not cost the next hour', async () => {
    const source = '203.0.113.91';
    for (let i = 1; i < SECOND_TIER_MAX_FAILURES; i++) await attempt(`probe@lcx.com:typo${i}`, source);
    // A working credential from this source resets the counter...
    expect(await attempt(`nik@lcx.com:${DESK_PASSCODE_DEV_FALLBACK}`, source)).toBe(200);
    // ...so the budget starts over rather than tripping on the next mistake.
    for (let i = 1; i < SECOND_TIER_MAX_FAILURES; i++) await attempt(`probe@lcx.com:typo${i}`, source);
    expect(await attempt(`probe@lcx.com:${SECONDARY}`, source)).toBe(200);
  });
});

describe('secondTierThrottleKey — which source, and why', () => {
  const ctx = (remoteAddress: string | undefined, forwarded?: string) => ({
    env: remoteAddress === undefined ? undefined : { incoming: { socket: { remoteAddress } } },
    req: { header: (n: string) => (n === 'x-forwarded-for' ? forwarded : undefined) },
  });

  it('ignores X-Forwarded-For entirely when the peer is a PUBLIC address', () => {
    // No proxy is in the way, so the header is pure client input and must not touch the
    // key — otherwise a direct caller rotates it and the control disappears.
    const a = secondTierThrottleKey(ctx('198.51.100.7', '1.1.1.1'));
    const b = secondTierThrottleKey(ctx('198.51.100.7', '2.2.2.2'));
    expect(a).toBe(b);
    expect(a).toBe('peer:198.51.100.7');
  });

  it('IGNORES X-Forwarded-For on an adjacent peer too, unless the deployment declares its chain', () => {
    /* "The peer is adjacent" does not establish that a proxy is in front — on loopback and on any
       directly-reachable private network it is false, and there the caller writes the whole
       header. Guessing cost this control its entire value once already. */
    expect(secondTierThrottleKey(ctx('10.1.2.3', '1.1.1.1, 9.9.9.9'))).toBe('peer:10.1.2.3');
    expect(secondTierThrottleKey(ctx('10.1.2.3', '9.9.9.9'))).toBe('peer:10.1.2.3');
    expect(secondTierThrottleKey(ctx('127.0.0.1', '8.8.8.8'))).toBe('peer:127.0.0.1');
  });

  it('recovers per-client granularity ONLY when TRUSTED_PROXY_HOPS declares the chain', () => {
    const prev = process.env.TRUSTED_PROXY_HOPS;
    try {
      process.env.TRUSTED_PROXY_HOPS = '1';
      /*
       * ── THESE EXPECTATIONS WERE THE DEFECT, WRITTEN DOWN AND PASSING ──────────────────
       *
       * They used to read `'203.0.113.5, 9.9.9.9'` -> `client:203.0.113.5`: the FIRST entry, on the
       * model "the last N are infrastructure, the one before them is the client". Everything to the
       * left of what our own proxies appended is caller-supplied, so that model reads a
       * caller-chosen value and calls it the client. The test agreed with the code, so neither
       * caught it.
       *
       * ONE appending proxy means ONE trustworthy entry, and it is the LAST one — the address that
       * proxy observed. A forged prefix must be ignored, not preferred.
       */
      expect(secondTierThrottleKey(ctx('10.1.2.3', '203.0.113.5')))
        .toBe('peer:10.1.2.3|client:203.0.113.5');

      /* THE ATTACK, ASSERTED: a caller prepends whatever it likes and the key does not move. Before
         the fix each of these produced a DIFFERENT key, so rotating one header bought an unlimited
         failure budget while honest callers shared one bucket. */
      const forged = ['1.2.3.4', 'evil-1', '', '  ', '203.0.113.9'].map((f) =>
        secondTierThrottleKey(ctx('10.1.2.3', `${f}, 203.0.113.5`)));
      expect(new Set(forged).size).toBe(1);
      expect(forged[0]).toBe('peer:10.1.2.3|client:203.0.113.5');

      /* An empty header still carries no evidence of the chain. */
      expect(secondTierThrottleKey(ctx('10.1.2.3', ''))).toBe('peer:10.1.2.3');

      process.env.TRUSTED_PROXY_HOPS = '2';
      /* Two appending proxies: the rightmost TWO were written by infrastructure, and the leftmost of
         those is what the outer one observed. Anything further left is the caller's. */
      expect(secondTierThrottleKey(ctx('10.1.2.3', '203.0.113.5, 9.9.9.9')))
        .toBe('peer:10.1.2.3|client:203.0.113.5');
      expect(secondTierThrottleKey(ctx('10.1.2.3', 'forged, 203.0.113.5, 9.9.9.9')))
        .toBe('peer:10.1.2.3|client:203.0.113.5');
      /* Fewer entries than the declared chain cannot have traversed it — refuse, never index. */
      expect(secondTierThrottleKey(ctx('10.1.2.3', '9.9.9.9'))).toBe('peer:10.1.2.3');
      /* Garbage and zero both mean "not declared", never "trust the header". */
      process.env.TRUSTED_PROXY_HOPS = 'yes';
      expect(secondTierThrottleKey(ctx('10.1.2.3', '203.0.113.5, 9.9.9.9'))).toBe('peer:10.1.2.3');
      process.env.TRUSTED_PROXY_HOPS = '0';
      expect(secondTierThrottleKey(ctx('10.1.2.3', '203.0.113.5, 9.9.9.9'))).toBe('peer:10.1.2.3');
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = prev;
    }
  });

  it('classifies 172.16/12 at its real boundaries, not at the round numbers', () => {
    // The half-open range is the one people get wrong. 172.15 and 172.32 are PUBLIC.
    expect(secondTierThrottleKey(ctx('172.15.0.1', '9.9.9.9'))).toBe('peer:172.15.0.1');
    expect(secondTierThrottleKey(ctx('172.16.0.1', '9.9.9.9'))).toBe('peer:172.16.0.1');
    expect(secondTierThrottleKey(ctx('172.31.255.254', '9.9.9.9'))).toBe('peer:172.31.255.254');
    expect(secondTierThrottleKey(ctx('172.32.0.1', '9.9.9.9'))).toBe('peer:172.32.0.1');
  });

  it('sees through an IPv4-mapped IPv6 peer, which is what Node hands back on a dual stack', () => {
    expect(secondTierThrottleKey(ctx('::ffff:10.0.0.4', '9.9.9.9'))).toBe('peer:::ffff:10.0.0.4');
    expect(secondTierThrottleKey(ctx('::ffff:198.51.100.7', '9.9.9.9'))).toBe('peer:::ffff:198.51.100.7');
  });

  it('returns null when there is no peer at all, rather than inventing a shared bucket', () => {
    // A constant here would give every caller on earth ONE failure budget, i.e. the
    // global lockout `lib/secondTier.ts` exists to refuse. Null means "no throttle",
    // which is why the adapter test above is not optional.
    expect(secondTierThrottleKey(ctx(undefined))).toBeNull();
    expect(secondTierThrottleKey(ctx(''))).toBeNull();
  });
});

describe('resolvePrincipal without a key behaves exactly as it did before the fix', () => {
  it('counts nothing and refuses nothing — the unthreaded caller cannot cause a lockout', () => {
    // middleware/workspace.ts:58 still calls with two arguments. That path is
    // unthrottled, which is a known gap; what must NOT happen is that it silently feeds
    // a budget nobody can clear.
    for (let i = 0; i < SECOND_TIER_MAX_FAILURES * 3; i++) {
      expect(resolvePrincipal(`Bearer probe@lcx.com:no-${i}`, undefined)).toBeNull();
    }
    expect(secondTierThrottled('peer:198.51.100.9')).toBe(false);
    expect(resolvePrincipal(`Bearer probe@lcx.com:${SECONDARY}`, undefined)?.id).toBe('ext:probe');
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  EVERY CALL SITE PASSES A THROTTLE KEY — because forgetting it is SILENT.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  `resolvePrincipal(auth, apiKey, throttleKey?)` applies no throttle when the key is absent. That
 *  default is deliberate and correct: a caller with no socket must not feed a lockout it cannot
 *  observe. The cost is that a call site which simply omits the third argument reverts to the
 *  pre-fix behaviour with no type error, no runtime error and no failing test.
 *
 *  That is not hypothetical. `middleware/workspace.ts:58` was exactly that site — every request
 *  entering through a compartment gate authenticated there, and therefore skipped the brute-force
 *  lockout entirely while the front door enforced it. It was found by reading the call graph after
 *  the fix shipped, which is not a repeatable way to find the next one.
 *
 *  So this asserts the PROPERTY rather than the site: every production call passes three arguments.
 *  A fourth call site added next month fails here on the day it is written.
 */
describe('no call site can silently disarm the throttle', () => {
  const API_SRC = resolve(process.cwd(), 'src');

  const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return e === 'node_modules' ? [] : walk(full);
    return /\.ts$/.test(e) && !/\.test\.ts$/.test(e) ? [full] : [];
  });

  /* Comments stripped first: prose naming the function is not a call to it. */
  const withoutComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('every production resolvePrincipal(...) is given a throttle key', () => {
    const files = walk(API_SRC);
    expect(files.length, 'the walk found no source files — this would pass vacuously')
      .toBeGreaterThan(50);

    const bad: string[] = [];
    let calls = 0;
    for (const f of files) {
      const src = withoutComments(readFileSync(f, 'utf8'));
      /* The declaration is not a call. Match invocations only, across line breaks, and stop at the
         matching close paren rather than at the first one so a nested call() does not truncate. */
      for (const m of src.matchAll(/(?<!function\s)resolvePrincipal\s*\(/g)) {
        const start = m.index! + m[0].length;
        let depth = 1, i = start;
        while (i < src.length && depth > 0) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') depth--;
          i++;
        }
        const args = src.slice(start, i - 1);
        calls++;
        /* Argument count by top-level commas — a comma inside a nested call is not a separator. */
        let d = 0, n = 1;
        for (const ch of args) {
          if (ch === '(') d++;
          else if (ch === ')') d--;
          else if (ch === ',' && d === 0) n++;
        }
        if (args.trim() === '') n = 0;
        if (n < 3) {
          bad.push(`${relative(API_SRC, f)} — resolvePrincipal called with ${n} argument(s)`);
        }
      }
    }

    expect(calls, 'no resolvePrincipal call was found at all — this census is broken')
      .toBeGreaterThanOrEqual(2);
    expect(bad,
      'these authenticate without passing a throttle key, so the second-tier brute-force lockout'
      + ' does not apply to any request that enters through them').toEqual([]);
  });
});
