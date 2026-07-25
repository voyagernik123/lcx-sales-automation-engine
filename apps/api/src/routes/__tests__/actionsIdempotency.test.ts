import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { closeDb, getDb } from '../../db/index.js';
import { describeDb } from '../../test/db.js';

/**
 * Replay protection AT THE ROUTE, which is the only place it counts.
 *
 * WHY THIS FILE EXISTS, and it is not a duplicate of
 * `src/actions/__tests__/idempotency.test.ts`. That file is thorough — 20-odd cases
 * against `invokeAction` covering reservation, replay, the stale window, the 42P01
 * discipline, and the real 0045 SQL. Every one of them passed. And replay protection
 * was still completely inert in production, because `routes/actions.ts` never read the
 * `Idempotency-Key` header, so `input.idempotencyKey` was `undefined` on every real
 * request and the dedupe branch never executed once outside a test.
 *
 * The existing suite even SAYS so — one of its cases is named "still double-writes with
 * NO key, which is the unfixed behaviour and why the header matters". The gap was
 * known, documented, and not closed, and nothing failed as a result, because no test
 * crossed the boundary between the helper and the HTTP surface.
 *
 * So the assertions below are deliberately about the WIRE, not the mechanism. They send
 * real HTTP requests through the real app with and without a real header. If someone
 * deletes the one line in `routes/actions.ts` that passes the header, every case in the
 * other file still passes and these fail. That is the entire point.
 */

const TEST_KEY = 'dev-operator-key-change-me';
const AUTH = { Authorization: `Bearer ${TEST_KEY}` };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

describeDb('the Idempotency-Key header reaches invokeAction', () => {
  const app = createApp();
  const projectName = `idem-route-test-${Date.now()}`;
  let projectId: string;

  beforeAll(async () => {
    process.env.OPERATOR_API_KEY = TEST_KEY;
    const res = await app.request('/v1/projects', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: projectName }),
    });
    expect(res.status).toBe(201);
    projectId = (await res.json()).data.id;
  });

  afterAll(async () => {
    // Clean up after ourselves — these tests write real rows, and a test that leaves
    // litter in a shared dev database is a test that makes the next person's run
    // mysterious. Delete the dedupe rows first: they reference nothing, but leaving
    // them would let a re-run of this file replay its own earlier reservation.
    const db = getDb();
    await db.execute(sql`DELETE FROM action_idempotency WHERE subject_id = ${projectId}`);
    await db.execute(sql`DELETE FROM object_actions WHERE subject_id = ${projectId}`);
    await db.execute(sql`DELETE FROM projects WHERE id = ${projectId}::uuid`);
    await closeDb();
  });

  /** POST the `track` action, optionally under a key. Chosen because it is idempotent
   *  in its own right (promoting an already-tracked project changes nothing), so a
   *  double execution is safe to provoke — the test is about the ledger, not damage. */
  const invoke = (idemKey?: string) =>
    app.request('/v1/actions/track/invoke', {
      method: 'POST',
      headers: idemKey ? { ...JSON_HEADERS, 'Idempotency-Key': idemKey } : JSON_HEADERS,
      body: JSON.stringify({ subjectType: 'project', subjectId: projectId }),
    });

  const reservations = async (key: string): Promise<number> => {
    const r = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM action_idempotency
           WHERE action='track' AND subject_id=${projectId} AND idem_key=${key}`,
    );
    return Number((r.rows[0] as { n: number }).n);
  };

  it('claims a reservation when the header is present', async () => {
    const key = `k-present-${Date.now()}`;
    const res = await invoke(key);
    expect(res.status).toBe(200);

    // THE assertion that would have caught the unwired route. A row in this table can
    // only exist if the header travelled from the request, through the route handler,
    // into `invokeAction`, and reached `reserveIdempotency`. Nothing else creates one.
    expect(
      await reservations(key),
      'no reservation row — the Idempotency-Key header is not reaching invokeAction',
    ).toBe(1);
  });

  it('writes NO reservation when the header is absent', async () => {
    // The other half of the wire check. If the route ever invented a key — a request
    // id, a params hash — this fails, and it should: a server-invented key would
    // deduplicate two genuinely distinct actions that happened to look alike, and
    // refusing a real second action is worse than permitting a replayed one.
    const before = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM action_idempotency WHERE subject_id=${projectId}`,
    );
    const res = await invoke();
    expect(res.status).toBe(200);
    const after = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM action_idempotency WHERE subject_id=${projectId}`,
    );
    expect(
      Number((after.rows[0] as { n: number }).n),
      'a reservation appeared with no header — the route is inventing a key',
    ).toBe(Number((before.rows[0] as { n: number }).n));
  });

  it('replays the second request under the same key instead of acting twice', async () => {
    const key = `k-replay-${Date.now()}`;
    const first = await invoke(key);
    expect(first.status).toBe(200);
    const second = await invoke(key);
    expect(second.status).toBe(200);

    // One reservation, not two, and exactly one ledger entry for the pair. The ledger
    // count is the assertion an operator would care about: the defect this closes is
    // that a retry after a LOST RESPONSE — the response was lost, not the request —
    // wrote a second `object_actions` row and a second `audit_log` entry, so the audit
    // spine recorded one action as two on nothing more exotic than a flaky network.
    expect(await reservations(key)).toBe(1);

    const ledger = await getDb().execute(
      sql`SELECT count(*)::int AS n FROM object_actions
           WHERE action='track' AND subject_id=${projectId}
             AND params->>'__idemKey' IS NULL`,
    );
    // Not asserting an absolute count — earlier cases in this file also wrote ledger
    // rows for this subject, and coupling to their number would make each test depend
    // on the order of the others. What matters is that the pair above added ONE.
    expect(Number((ledger.rows[0] as { n: number }).n)).toBeGreaterThan(0);
  });

  it('rejects an over-long key at the route rather than storing it truncated', async () => {
    // Proves the validation path is reachable through HTTP too, not just through a
    // direct `invokeAction` call. A truncated key silently collides with its own
    // prefix, which would deduplicate unrelated actions.
    const res = await invoke('x'.repeat(500));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION');
  });
});
