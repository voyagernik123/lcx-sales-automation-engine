import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, requiresOperate } from '../../app.js';
import { closeDb } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ARE THE FIVE NESTED MARKETING ROUTERS REALLY INSIDE THE COMPARTMENT GATE?
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `routes/marketingDesk.ts`, `marketingMemory.ts`, `marketingRecord.ts`,
 * `marketingGates.ts` and `marketingHoldings.ts` declare NO workspace middleware of their
 * own. They rely entirely on being nested inside `marketingRoutes`, which `app.ts` gates
 * from the workspace constitution's `apiPrefixes`. That is the correct design — a per-router gate is a second
 * thing to forget — but "it is covered automatically" is a claim about wiring in four other
 * files, and a comment asserting it is worth nothing. `__tests__/gpsArtifact.test.ts` makes
 * the same argument for the same reason; this is its marketing counterpart.
 *
 * ══ THE FOURTH ROUTER IS WHY THIS FILE EXISTS; THE FIFTH IS WHY IT KEEPS EARNING ITS PLACE ══
 * `marketingGates.ts` shipped with eight routes and NOTHING mounted it — only its own tests
 * referenced the export. `POST /claim-safety`, the only route in the compartment that hands
 * a human copyable text with a ledger row behind it, answered 404. Nothing was red. This
 * file is now the thing that would have been: the count below is asserted, so a router that
 * fails to mount cannot shrink the list it is checked against.
 *
 * ══ WHAT THIS VERIFIES ══
 *   · every path the five routers declare is REGISTERED under /v1/marketing — not merely
 *     404-behind-a-gate, which is indistinguishable from "gated" to a caller;
 *   · nothing they declare is registered outside that prefix, because the gate is
 *     installed on that prefix and on nothing else;
 *   · an unauthenticated call is refused BEFORE any handler runs, which is the only way to
 *     show the gate precedes the handler without a database;
 *   · `requiresOperate` demands the tier this compartment intends for each path, so a new
 *     `READ_SHAPED_POSTS` entry cannot quietly downgrade one of the thirty-eight;
 *   · the source of each router is free of its own `app.route`/`app.use`, so the mount
 *     stays in one place.
 *
 * ══ WHAT IT DOES NOT VERIFY, and why the machine key is not the probe here ══
 * `gpsArtifact.test.ts` can refuse the shared machine key because `gps` sets
 * `machineAccess: false`. `marketing` sets it TRUE (`workspaces.ts:197`) — the shared
 * operator key legitimately holds this compartment, because the cron tick runs as it. So
 * there is no principal this test can construct that the gate refuses on the CAPABILITY
 * axis without a database behind `loadEntitlements`. The 401 assertions prove the gate runs
 * ahead of the handlers; they do not prove what a `view`-only human can reach. That is not
 * this file's claim and no test name below says otherwise.
 *
 * Nothing here executes a handler: every assertion is answered by the middleware chain or
 * by the router table, so no route touches `pg`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (file: string) => readFileSync(resolve(HERE, '..', file), 'utf8');

/**
 * Source with comments removed.
 *
 * The self-mount assertion below is about CODE. Matching the raw file made it red on a
 * docblock that explains where the mount lives — a test a comment can break is a test
 * somebody weakens instead of reading, and these files are mostly prose by line count.
 */
const codeOf = (file: string) =>
  src(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A path with a parameter filled in, plus the pattern it must be registered as. */
interface Surface {
  readonly method: 'GET' | 'POST';
  /** The concrete URL a fetcher would call. */
  readonly url: string;
  /** The registered pattern, `:param` style. */
  readonly route: string;
  /** The tier `app.ts:requiresOperate` must demand. */
  readonly needed: 'view' | 'operate';
  /** Which router file declares it. */
  readonly file: 'marketingDesk.ts' | 'marketingMemory.ts' | 'marketingRecord.ts' | 'marketingGates.ts'
  | 'marketingHoldings.ts';
}

const INSTANCE = 'stmt:11111111-1111-4111-8111-111111111111';
const INCIDENT = 'inc:22222222-2222-4222-8222-222222222222';

/**
 * The thirty-eight paths, each with the tier it gates at.
 *
 * WRITTEN OUT RATHER THAN DERIVED from `app.routes`. Deriving the expectation from the
 * thing under test is the standard way this class of assertion becomes a tautology: a
 * router that failed to mount would contribute nothing to the list and the loop would pass
 * over an empty set. The count is asserted separately for the same reason.
 */
const SURFACE: readonly Surface[] = [
  /* ── marketingDesk.ts ── */
  { method: 'POST', url: '/v1/marketing/regime', route: '/regime', needed: 'view', file: 'marketingDesk.ts' },
  { method: 'POST', url: '/v1/marketing/triage/assess', route: '/triage/assess', needed: 'view', file: 'marketingDesk.ts' },
  { method: 'POST', url: '/v1/marketing/41/triage', route: '/:id/triage', needed: 'operate', file: 'marketingDesk.ts' },
  { method: 'POST', url: '/v1/marketing/adoption', route: '/adoption', needed: 'view', file: 'marketingDesk.ts' },
  { method: 'GET', url: '/v1/marketing/desk', route: '/desk', needed: 'view', file: 'marketingDesk.ts' },
  { method: 'POST', url: '/v1/marketing/desk-mode', route: '/desk-mode', needed: 'operate', file: 'marketingDesk.ts' },

  /* ── marketingMemory.ts ── */
  { method: 'GET', url: '/v1/marketing/precedent', route: '/precedent', needed: 'view', file: 'marketingMemory.ts' },
  { method: 'GET', url: '/v1/marketing/precedent/debt', route: '/precedent/debt', needed: 'view', file: 'marketingMemory.ts' },
  { method: 'POST', url: '/v1/marketing/precedent/statement', route: '/precedent/statement', needed: 'operate', file: 'marketingMemory.ts' },
  { method: 'GET', url: '/v1/marketing/crisis/statements', route: '/crisis/statements', needed: 'view', file: 'marketingMemory.ts' },
  { method: 'GET', url: '/v1/marketing/crisis/preclears', route: '/crisis/preclears', needed: 'view', file: 'marketingMemory.ts' },
  { method: 'POST', url: '/v1/marketing/crisis/incident', route: '/crisis/incident', needed: 'operate', file: 'marketingMemory.ts' },
  { method: 'GET', url: `/v1/marketing/crisis/incident/${INCIDENT}/clock`, route: '/crisis/incident/:id/clock', needed: 'view', file: 'marketingMemory.ts' },
  { method: 'POST', url: `/v1/marketing/crisis/incident/${INCIDENT}/first-statement`, route: '/crisis/incident/:id/first-statement', needed: 'operate', file: 'marketingMemory.ts' },
  { method: 'POST', url: '/v1/marketing/crisis/statements/lcx-holding-1/instance', route: '/crisis/statements/:key/instance', needed: 'operate', file: 'marketingMemory.ts' },
  { method: 'GET', url: `/v1/marketing/crisis/instance/${INSTANCE}`, route: '/crisis/instance/:id', needed: 'view', file: 'marketingMemory.ts' },
  { method: 'POST', url: `/v1/marketing/crisis/instance/${INSTANCE}/clearance`, route: '/crisis/instance/:id/clearance', needed: 'operate', file: 'marketingMemory.ts' },

  /* ── marketingRecord.ts ── */
  { method: 'GET', url: '/v1/marketing/watch', route: '/watch', needed: 'view', file: 'marketingRecord.ts' },
  { method: 'GET', url: '/v1/marketing/watch/claim-expiry', route: '/watch/claim-expiry', needed: 'view', file: 'marketingRecord.ts' },
  { method: 'GET', url: '/v1/marketing/export', route: '/export', needed: 'view', file: 'marketingRecord.ts' },
  { method: 'GET', url: '/v1/marketing/export/rec-1', route: '/export/:itemId', needed: 'view', file: 'marketingRecord.ts' },
  { method: 'POST', url: '/v1/marketing/record', route: '/record', needed: 'operate', file: 'marketingRecord.ts' },
  { method: 'POST', url: '/v1/marketing/subject-access', route: '/subject-access', needed: 'operate', file: 'marketingRecord.ts' },
  { method: 'POST', url: '/v1/marketing/erasure', route: '/erasure', needed: 'operate', file: 'marketingRecord.ts' },
  { method: 'GET', url: '/v1/marketing/retention', route: '/retention', needed: 'view', file: 'marketingRecord.ts' },
  { method: 'POST', url: '/v1/marketing/retention/run', route: '/retention/run', needed: 'operate', file: 'marketingRecord.ts' },
  { method: 'GET', url: '/v1/marketing/post-time', route: '/post-time', needed: 'view', file: 'marketingRecord.ts' },

  /* ── marketingGates.ts ──
   * `/review` gates at 'view' via MARKETING_GATES_READ_SHAPED_POSTS and writes nothing.
   * The other three POSTs mutate: `/claim-safety` writes the 0062 gate row and releases
   * text, `/corroborate` writes an observation, `/:id/silence` writes the silence record. */
  { method: 'POST', url: '/v1/marketing/claim-safety', route: '/claim-safety', needed: 'operate', file: 'marketingGates.ts' },
  { method: 'POST', url: '/v1/marketing/review', route: '/review', needed: 'view', file: 'marketingGates.ts' },
  { method: 'GET', url: '/v1/marketing/replies/41/provenance', route: '/replies/:id/provenance', needed: 'view', file: 'marketingGates.ts' },
  { method: 'POST', url: '/v1/marketing/replies/41/corroborate', route: '/replies/:id/corroborate', needed: 'operate', file: 'marketingGates.ts' },
  { method: 'GET', url: '/v1/marketing/silence', route: '/silence', needed: 'view', file: 'marketingGates.ts' },
  { method: 'POST', url: '/v1/marketing/41/silence', route: '/:id/silence', needed: 'operate', file: 'marketingGates.ts' },
  { method: 'GET', url: '/v1/marketing/metrics', route: '/metrics', needed: 'view', file: 'marketingGates.ts' },
  { method: 'GET', url: '/v1/marketing/loop', route: '/loop', needed: 'view', file: 'marketingGates.ts' },

  /* ── marketingHoldings.ts ──
   * Three GETs, so all three gate at 'view' by method alone — `requiresOperate` needs no
   * allowlist entry for them and none was added. There is NO write here on purpose:
   * declaring goes through the governed action `marketing_holdings_declare`, so this file
   * cannot be a second door to the same table with its own idea of the rules.
   *
   * `/holdings/register` is APPROVER-ONLY, and that is enforced inside the handler
   * (`listHoldingsRegister`) rather than by the mount — the compartment ladder has no
   * 'approve' floor for a read, and this table's supervision view is the one read on the
   * desk that needs one. `requiresOperate` cannot express it and this test does not claim
   * it does; `__tests__/marketingHoldings.test.ts` asserts the 403. */
  { method: 'GET', url: '/v1/marketing/holdings', route: '/holdings', needed: 'view', file: 'marketingHoldings.ts' },
  { method: 'GET', url: '/v1/marketing/holdings/cells', route: '/holdings/cells', needed: 'view', file: 'marketingHoldings.ts' },
  { method: 'GET', url: '/v1/marketing/holdings/register', route: '/holdings/register', needed: 'view', file: 'marketingHoldings.ts' },
];

describe('the five marketing sub-routers are mounted under /v1/marketing', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    invalidateEntitlements();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('lists all thirty-eight paths, so no loop below runs over a short list', () => {
    // Non-vacuity: if a router failed to mount, the assertions still have to be about
    // thirty-eight paths rather than about however many happen to be here.
    expect(SURFACE.length).toBe(38);
    expect(SURFACE.filter((s) => s.file === 'marketingDesk.ts').length).toBe(6);
    expect(SURFACE.filter((s) => s.file === 'marketingMemory.ts').length).toBe(11);
    expect(SURFACE.filter((s) => s.file === 'marketingRecord.ts').length).toBe(10);
    expect(SURFACE.filter((s) => s.file === 'marketingGates.ts').length).toBe(8);
    expect(SURFACE.filter((s) => s.file === 'marketingHoldings.ts').length).toBe(3);
  });

  it('registers every one of them under /v1/marketing', () => {
    const registered = new Set(app.routes.map((r) => `${r.method} ${r.path}`));
    const missing = SURFACE
      .filter((s) => !registered.has(`${s.method} /v1/marketing${s.route}`))
      .map((s) => `${s.method} /v1/marketing${s.route} (${s.file})`);
    expect(
      missing,
      'these paths are declared by a router that nothing mounts. A shipped fetcher gets a '
      + '404 that is indistinguishable from "not allowed", and every engine behind them is '
      + 'unreachable — which is the defect this whole wave exists to end.',
    ).toEqual([]);
  });

  it('registers nothing from those routers outside the gated prefix', () => {
    // The gate is installed on '/v1/marketing' and '/v1/marketing/*' and on nothing else,
    // so a path served from any other prefix is a path served with no compartment check.
    const patterns = new Set(SURFACE.map((s) => s.route));
    const outside = app.routes
      .filter((r) => !r.path.startsWith('/v1/marketing') && patterns.has(r.path))
      .map((r) => `${r.method} ${r.path}`);
    expect(outside, 'a marketing path is also served from outside the gated prefix').toEqual([]);
  });

  for (const s of SURFACE) {
    it(`${s.method} /v1/marketing${s.route} refuses an unauthenticated caller before any handler runs`, async () => {
      const res = await app.request(s.url, {
        method: s.method,
        headers: { 'Content-Type': 'application/json' },
        ...(s.method === 'POST' ? { body: '{}' } : {}),
      });
      // 401, not 404 and not 500: the middleware answered, so the chain in front of these
      // handlers is real. A 500 here would mean a handler ran and reached for a pool.
      expect(res.status).toBe(401);
    });
  }

  it('demands the intended tier for each of the thirty-eight', () => {
    for (const s of SURFACE) {
      expect(
        requiresOperate(s.method, s.url) ? 'operate' : 'view',
        `${s.method} ${s.url} does not gate at '${s.needed}'. If a READ_SHAPED_POSTS entry `
        + 'was added, it has silently moved a marketing write to the read tier; if one was '
        + 'removed, a read-shaped question just became approver-adjacent for every view member.',
      ).toBe(s.needed);
    }
  });

  it('leaves the mount in one file — no sub-router mounts itself', () => {
    // Two places that can mount a router is two places to disagree about the prefix, and
    // the one in the router file would not be visible from the compartment's route table.
    for (const file of [
      'marketingDesk.ts', 'marketingMemory.ts', 'marketingRecord.ts', 'marketingGates.ts',
      'marketingHoldings.ts',
    ] as const) {
      expect(codeOf(file), `${file} mounts itself`).not.toMatch(/\bapp\.(route|use)\(/);
    }
  });

  it('mounts all five from routes/marketing.ts and at the root segment', () => {
    // '/' and not a segment of its own: each router declares its own first segment, and
    // mounting one under e.g. '/crisis' would double the segment and 404 a shipped fetcher.
    const code = codeOf('marketing.ts');
    for (const router of [
      'marketingDeskRoutes', 'marketingMemoryRoutes', 'marketingRecordRoutes', 'marketingGatesRoutes',
      'marketingHoldingsRoutes',
    ]) {
      expect(code).toMatch(new RegExp(`marketingRoutes\\.route\\('/', ${router}\\)`));
    }
  });
});
