import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, requiresOperate } from '../../app.js';
import { closeDb } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE GPS INPUT DESK — IS IT REALLY INSIDE THE COMPARTMENT GATE?
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `routes/gpsInputs.ts` declares NO workspace middleware of its own. It relies entirely on
 * being mounted inside `gpsRoutes` at `'/inputs'`, under a prefix `app.ts:183-190` gates
 * from the workspace constitution's `apiPrefixes`. That is the correct design — a per-router
 * gate is a second thing to forget — but "it is covered automatically" is a claim about
 * wiring in three other files, and the router's own docblock asserting it is worth nothing.
 * This is the counterpart of `gpsArtifact.test.ts` and `marketingMount.test.ts`, and it is
 * written the same way for the same reason.
 *
 * ══ WHAT THIS FILE VERIFIES ══
 *   · all four paths are REGISTERED under `/v1/gps/inputs` — not merely 404-behind-a-gate,
 *     which is indistinguishable from "gated" to a caller, and which is exactly the state
 *     `marketingGates.ts` shipped in for a whole wave;
 *   · nothing from this router is served from any other prefix, because the gate is
 *     installed on `/v1/gps` and on nothing else;
 *   · an unauthenticated call is refused BEFORE any handler runs — the only way to show the
 *     gate precedes the handler without a database;
 *   · the shared MACHINE KEY is refused with `WORKSPACE_FORBIDDEN`, and the tier DEMANDED is
 *     'view' for the desk read and 'operate' for each of the three writes. `gps` sets
 *     `machineAccess: false` (`workspaces.ts`), so this is deterministic with no database:
 *     `loadEntitlements` returns a machine map with no `gps` entry and queries nothing;
 *   · the mount stays in one file, at `'/inputs'` and not `'/'`.
 *
 * ══ WHY THE PREFIX IS LOAD-BEARING AND NOT COSMETIC ══
 * This router registers its desk read as `'/'`. Mounted at `'/'` instead of `'/inputs'` it
 * would have put a second handler on `GET /v1/gps` — a path `gpsRoutes` already owns — and
 * in Hono the first registration wins, so the read would have been shadowed and the three
 * writes would have answered on `/v1/gps/price-bands`, which no fetcher calls. Both halves
 * are silent: no error, no 404 in a test that only checks the writes, and a desk screen that
 * renders the engagement summary where the input desk should be.
 *
 * ══ WHAT IT DOES NOT VERIFY ══
 * Nothing here executes a handler: every assertion is answered by the middleware chain or by
 * the route table, so no path touches `pg`. It cannot show that a price band is refused, that
 * a zero rate is rejected, or that a placeholder is badged — `gpsInputs.test.ts` does that
 * over a stubbed pool. It shows the paths exist, in the right place, behind the right tier.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MACHINE_KEY = 'dev-operator-key-change-me';

/** The four paths, with the tier each one must gate at. */
const SURFACE = [
  { method: 'GET', path: '/v1/gps/inputs', route: '/v1/gps/inputs', needed: 'view' },
  { method: 'POST', path: '/v1/gps/inputs/price-bands', route: '/v1/gps/inputs/price-bands', needed: 'operate' },
  { method: 'POST', path: '/v1/gps/inputs/effort-triples', route: '/v1/gps/inputs/effort-triples', needed: 'operate' },
  { method: 'POST', path: '/v1/gps/inputs/rate-cards', route: '/v1/gps/inputs/rate-cards', needed: 'operate' },
] as const;

describe('the GPS input desk is inside the GPS compartment gate', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = MACHINE_KEY;
    invalidateEntitlements();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('lists all four paths, so no loop below runs over a short list', () => {
    // Non-vacuity first. If the mount were missing, a list derived from the route table
    // would contribute nothing and every loop would pass over an empty set.
    expect(SURFACE.length).toBe(4);
    expect(SURFACE.filter((s) => s.needed === 'operate').length).toBe(3);
  });

  it('registers all four under /v1/gps/inputs and nowhere else', () => {
    const registered = new Set(app.routes.map((r) => `${r.method} ${r.path}`));
    const missing = SURFACE
      .filter((s) => !registered.has(`${s.method} ${s.route}`))
      .map((s) => `${s.method} ${s.route}`);
    expect(
      missing,
      'these paths are declared by a router nothing mounts, or mounted under the wrong '
      + 'segment. Either way a shipped fetcher gets a 404 that is indistinguishable from '
      + '"not allowed".',
    ).toEqual([]);

    // And the desk read did not land on `GET /v1/gps`, which `gpsRoutes` owns.
    const shadowed = app.routes.filter((r) => r.method === 'GET' && r.path === '/v1/gps');
    expect(
      shadowed.length,
      'GET /v1/gps has more than one registration, so one of them is unreachable — this is '
      + 'what mounting the input desk at \'/\' instead of \'/inputs\' does',
    ).toBeLessThanOrEqual(1);
  });

  it('serves nothing from this router outside the gated prefix', () => {
    const outside = app.routes
      .filter((r) => /price-bands|effort-triples|rate-cards/.test(r.path))
      .filter((r) => !r.path.startsWith('/v1/gps/'))
      .map((r) => `${r.method} ${r.path}`);
    expect(outside, 'an input-desk path is served from outside the compartment prefix').toEqual([]);
  });

  for (const s of SURFACE) {
    it(`${s.method} ${s.route} refuses an unauthenticated caller before any handler runs`, async () => {
      const res = await app.request(s.path, {
        method: s.method,
        headers: { 'Content-Type': 'application/json' },
        ...(s.method === 'POST' ? { body: '{}' } : {}),
      });
      // 401, not 404 and not 500. A 500 would mean a handler ran and reached for a pool.
      expect(res.status).toBe(401);
    });

    it(`${s.method} ${s.route} gates at '${s.needed}' and refuses the shared machine key`, async () => {
      const res = await app.request(s.path, {
        method: s.method,
        headers: { 'x-api-key': MACHINE_KEY, 'Content-Type': 'application/json' },
        ...(s.method === 'POST' ? { body: '{}' } : {}),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string; workspace: string; needed: string };
      expect(body.code).toBe('WORKSPACE_FORBIDDEN');
      expect(body.workspace).toBe('gps');
      /*
       * THE TIER ITSELF, not just "forbidden". A write gating at 'view' would let anyone
       * granted read access to GPS type the price of every offer — and `access.ts` hands out
       * `gps:view` by default on request. A read gating at 'operate' would hide the desk
       * from the view-only members who need to see which numbers are still placeholders.
       */
      expect(body.needed).toBe(s.needed);
      // The same answer from the exported boundary, which is what app.ts actually consults.
      expect(requiresOperate(s.method, s.path) ? 'operate' : 'view').toBe(s.needed);
    });
  }

  it('leaves the mount in one file, at /inputs and not at the root segment', () => {
    /*
     * Comments stripped first: this router's docblock EXPLAINS where the mount lives and
     * quotes the line, so matching raw text would make the assertion red on the explanation
     * — which teaches the next person to delete the explanation rather than keep the
     * property. Same `codeOf` shape as `marketingMount.test.ts`.
     */
    const codeOf = (file: string) =>
      readFileSync(resolve(HERE, '..', file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    expect(codeOf('gpsInputs.ts'), 'gpsInputs.ts mounts itself').not.toMatch(/\bapp\.(route|use)\(/);
    expect(codeOf('gps.ts')).toMatch(/gpsRoutes\.route\('\/inputs', gpsInputsRoutes\)/);
    // NOT at '/', for the reason in the header: it would shadow GET /v1/gps.
    expect(codeOf('gps.ts')).not.toMatch(/gpsRoutes\.route\('\/', gpsInputsRoutes\)/);
    // And not from app.ts, which `gps/__tests__/intakeLockout.test.ts:315` also ratchets:
    // a router mounted at the GPS prefix from outside gps.ts would serve inside the
    // compartment while sitting outside the per-file intake checks.
    expect(codeOf('../app.ts')).not.toMatch(/gpsInputsRoutes/);
  });
});
