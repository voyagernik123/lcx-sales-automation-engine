import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, requiresOperate } from '../../app.js';
import { closeDb } from '../../db/index.js';
import { invalidateEntitlements } from '../../access/entitlements.js';

/**
 * GPS CLIENT ARTIFACT INTAKE — IS IT REALLY INSIDE THE COMPARTMENT?
 *
 * `routes/gpsArtifact.ts` declares NO workspace middleware of its own. It relies
 * entirely on being mounted inside `gpsRoutes`, under a prefix that `app.ts:163-172`
 * gates from the workspace constitution. That is the correct design — a per-router
 * gate is a second thing to forget — but "it is covered automatically" is a claim
 * about wiring in three other files, and a comment asserting it is worth nothing.
 * So it is verified here, per path and per method:
 *
 *   · the path is REGISTERED under /v1/gps (not merely 404-behind-a-gate),
 *   · an unauthenticated call is refused before any handler runs,
 *   · a principal that holds no `gps` grant is refused with WORKSPACE_FORBIDDEN,
 *     and the capability DEMANDED is 'view' for the reads and 'operate' for the
 *     upload and the delete.
 *
 * The refused principal is the SHARED MACHINE KEY, which is deterministic without a
 * database: `gps` sets `machineAccess: false`, so `loadEntitlements` returns a
 * machine map with no `gps` entry and never queries anything. It is also the
 * principal that matters most here — the least attributable credential in the
 * system must not be able to read a third party's confidential document.
 */
const MACHINE_KEY = 'dev-operator-key-change-me';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';
const ENGAGEMENT = '22222222-2222-4222-8222-222222222222';

/** The five paths, with the tier each one must gate at. */
const SURFACE = [
  { method: 'POST', path: `/v1/gps/engagements/${ENGAGEMENT}/artifacts`, needed: 'operate', route: '/v1/gps/engagements/:id/artifacts' },
  { method: 'GET', path: `/v1/gps/engagements/${ENGAGEMENT}/artifacts`, needed: 'view', route: '/v1/gps/engagements/:id/artifacts' },
  { method: 'GET', path: `/v1/gps/artifacts/${ARTIFACT}/download-url`, needed: 'view', route: '/v1/gps/artifacts/:id/download-url' },
  { method: 'GET', path: `/v1/gps/artifacts/${ARTIFACT}/content?grant=x`, needed: 'view', route: '/v1/gps/artifacts/:id/content' },
  { method: 'DELETE', path: `/v1/gps/artifacts/${ARTIFACT}`, needed: 'operate', route: '/v1/gps/artifacts/:id' },
] as const;

describe('the intake surface is inside the GPS compartment gate', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = MACHINE_KEY;
    invalidateEntitlements();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('registers all five paths under /v1/gps and nowhere else', () => {
    const registered = new Set(
      app.routes
        .filter((r) => /artifact/i.test(r.path))
        .map((r) => `${r.method} ${r.path}`),
    );
    for (const s of SURFACE) {
      expect(
        registered.has(`${s.method} ${s.route}`),
        `${s.method} ${s.route} is not registered — a shipped fetcher would 404`,
      ).toBe(true);
    }
    // Nothing may serve artifacts from outside the compartment prefix, because the
    // gate is installed on that prefix and on nothing else.
    for (const r of app.routes) {
      if (/artifact/i.test(r.path)) expect(r.path.startsWith('/v1/gps/')).toBe(true);
    }
  });

  for (const s of SURFACE) {
    it(`${s.method} ${s.route} refuses an unauthenticated caller`, async () => {
      const res = await app.request(s.path, { method: s.method });
      expect(res.status).toBe(401);
    });

    it(`${s.method} ${s.route} gates at '${s.needed}' and refuses the shared machine key`, async () => {
      const res = await app.request(s.path, {
        method: s.method,
        headers: { 'x-api-key': MACHINE_KEY, 'Content-Type': 'application/pdf' },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string; workspace: string; needed: string };
      expect(body.code).toBe('WORKSPACE_FORBIDDEN');
      expect(body.workspace).toBe('gps');
      // The tier itself, not just "forbidden": a read gating at 'operate' would lock
      // view-only members out of documents they are entitled to see, and a write
      // gating at 'view' would let them upload.
      expect(body.needed).toBe(s.needed);
    });

    it(`${s.method} ${s.route} is classified '${s.needed}' by the boundary function`, () => {
      // Asserted against `requiresOperate` directly as well as through the app, so a
      // future change to READ_SHAPED_POSTS that exempted a GPS write would fail here
      // even if the middleware wiring changed shape.
      expect(requiresOperate(s.method, s.path.split('?')[0]!)).toBe(s.needed === 'operate');
    });
  }
});
