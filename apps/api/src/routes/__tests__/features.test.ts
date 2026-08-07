/**
 * Integration tests for the master-plan features: tasks, notifications,
 * send queue, deal board, forecast, gap analysis, timeline.
 * Runs against the local dev database (same convention as enrich.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { closeDb, getDb } from '../../db/index.js';
import { describeDb, itDb } from '../../test/db.js';

const TEST_KEY = 'dev-operator-key-change-me';
const AUTH = { Authorization: `Bearer ${TEST_KEY}` };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

describe('master-plan feature routes', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.OPERATOR_API_KEY = TEST_KEY;
  });

  afterAll(async () => {
    await closeDb();
  });

  describeDb('error mapping (onError)', () => {
    it('maps a malformed UUID to 400, not 500', async () => {
      const res = await app.request('/v1/dealdesk/invoices/not-a-uuid/status', {
        method: 'PATCH',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('INVALID_INPUT');
    });

    it('maps a foreign-key violation to 409', async () => {
      const res = await app.request('/v1/dealdesk/referrals', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: '00000000-0000-0000-0000-0000000000ff' }),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('FK_VIOLATION');
    });
  });

  describe('report builder is injection-safe', () => {
    it('rejects a non-allowlisted groupBy column', async () => {
      const res = await app.request('/v1/analytics/reports/run', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'projects', groupBy: 'name; DROP TABLE projects;--', metric: 'count' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('BAD_CONFIG');
    });

    it('rejects a non-allowlisted entity', async () => {
      const res = await app.request('/v1/analytics/reports/run', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'users; DROP TABLE users', metric: 'count' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('tasks', () => {
    let taskId: string;

    it('rejects unauthenticated access', async () => {
      const res = await app.request('/v1/tasks');
      expect(res.status).toBe(401);
    });

    itDb('creates a manual task', async () => {
      const res = await app.request('/v1/tasks', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'integration-test task' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      taskId = body.data.id;
      expect(taskId).toBeTruthy();
    });

    it('rejects a task without a title', async () => {
      const res = await app.request('/v1/tasks', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    itDb('lists open tasks including the new one', async () => {
      const res = await app.request('/v1/tasks?status=open', { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.some((t: { id: string }) => t.id === taskId)).toBe(true);
    });

    itDb('completes the task and removes it from the open list', async () => {
      const done = await app.request(`/v1/tasks/${taskId}/done`, { method: 'POST', headers: AUTH });
      expect(done.status).toBe(200);
      const res = await app.request('/v1/tasks?status=open', { headers: AUTH });
      const body = await res.json();
      expect(body.data.some((t: { id: string }) => t.id === taskId)).toBe(false);
    });

    itDb('404s on completing a missing task', async () => {
      const res = await app.request('/v1/tasks/00000000-0000-0000-0000-000000000000/done', {
        method: 'POST',
        headers: AUTH,
      });
      expect(res.status).toBe(404);
    });
  });

  describeDb('notifications', () => {
    it('lists notifications with an unread count', async () => {
      const res = await app.request('/v1/notifications', { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(typeof body.data.unread).toBe('number');
    });

    it('mark-all-read zeroes the unread count', async () => {
      const res = await app.request('/v1/notifications/read-all', { method: 'POST', headers: AUTH });
      expect(res.status).toBe(200);
      const after = await app.request('/v1/notifications', { headers: AUTH });
      const body = await after.json();
      expect(body.data.unread).toBe(0);
    });
  });

  describeDb('send queue', () => {
    it('returns items plus LinkedIn cap guidance', async () => {
      const res = await app.request('/v1/outreach/queue', { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data.caps.limits).toEqual({
        dailyConnections: 7,
        weeklyConnections: 50,
        dailyMessages: 20,
      });
    });

    it('409s when marking a missing task sent', async () => {
      const res = await app.request('/v1/outreach/queue/00000000-0000-0000-0000-000000000000/sent', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(409);
    });
  });

  describeDb('deal board + forecast', () => {
    it('returns board deals with project context', async () => {
      const res = await app.request('/v1/deals/board', { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      if (body.data.length > 0) {
        expect(body.data[0]).toHaveProperty('projectName');
        expect(body.data[0]).toHaveProperty('stage');
        expect(body.data[0]).toHaveProperty('priorityScore');
      }
    });

    /**
     * THIS ASSERTED THE ORDERING AND NOTHING ELSE, SO IT COULD ONLY PASS ON A POPULATED
     * DATABASE — and `17cf731` had just given CI its first database.
     *
     * With no deals there is nothing to simulate, so `p10/p50/p90` are `null` and the route
     * says so. That is `kpi/forecast.ts:91` behaving exactly as designed: *"Null passes
     * THROUGH. Dividing null by 100 in JS yields 0, which is exactly how a refusal would have
     * become a $0 quarter on the dashboard."* The engine is right; the assertion was written
     * for one of the two states.
     *
     * `expect(null).toBeLessThanOrEqual(...)` throws `actual value must be number or bigint,
     * received "object"` — because `typeof null === 'object'` — which reads like a type bug in
     * the route and is not one. Caught by `npm run ci-mirror` against a freshly migrated empty
     * database; the local gate passes because a developer's database has deals in it. That
     * divergence is the whole reason ci-mirror exists, and this is it earning its keep: no CI
     * run has been created since `e009970` (Actions minutes), so this would have failed on
     * whichever push next got one, with nobody expecting it.
     *
     * Both states are now covered, and the refusal branch is asserted rather than skipped —
     * a test that quietly returns early on empty data is how an unmeasurable surface passes
     * forever.
     */
    it('returns a coherent Monte Carlo forecast, or a stated refusal when there is nothing to simulate', async () => {
      const res = await app.request('/v1/kpis/forecast', { headers: AUTH });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.runs).toBe(10000);

      /*
       * THREE STATES, AND THE FIRST VERSION OF THIS FIX COLLAPSED TWO OF THEM.
       *
       * I first asserted that numeric quantiles imply `simulatedDealCount > 0`, and CI failed
       * with "expected 0 to be greater than 0". That assertion was wrong, not the engine:
       * `MonteCarloResult` documents the distinction at its own definition — "Null means the
       * simulation had nothing it could price ... An EMPTY OPEN PIPELINE is a different state:
       * that genuinely forecasts 0 and reports 0" — and `forecast/index.ts:343` implements it
       * as `allExcluded = open.length > 0 && n === 0`.
       *
       * So a $0 forecast is only dishonest when something was excluded. With nothing open at
       * all, zero is the answer, and refusing there would be its own kind of lie.
       *
       * ci-mirror did NOT catch this because other suites leave deals in its database; CI's is
       * genuinely empty. Two environments, two different states, and only running both showed
       * the third.
       */
      const quantiles = [data.p10, data.p50, data.p90];
      const allNull = quantiles.every((q) => q === null);
      const allNumbers = quantiles.every((q) => typeof q === 'number');
      // Never a mix: three quantiles from one simulation are all present or all absent.
      expect(allNull || allNumbers, `mixed quantiles: ${JSON.stringify(quantiles)}`).toBe(true);

      if (allNumbers && data.simulatedDealCount > 0) {
        // (1) A real book: the ordering must hold.
        expect(data.p10).toBeLessThanOrEqual(data.p50);
        expect(data.p50).toBeLessThanOrEqual(data.p90);
        expect(data.distributionRefusal ?? null).toBeNull();
      } else if (allNumbers) {
        // (2) An EMPTY open pipeline. Genuinely zero, and it must be exactly zero rather than
        // some other number arrived at with nothing to simulate.
        expect(data.simulatedDealCount).toBe(0);
        expect(quantiles).toEqual([0, 0, 0]);
        expect(data.distributionRefusal ?? null, 'an empty pipeline is not a refusal').toBeNull();
      } else {
        // (3) Deals were open and NONE could be priced. A refusal must SAY it is one — a
        // silent null trio is the $0 quarter `kpi/forecast.ts:91` exists to prevent.
        expect(data.simulatedDealCount).toBe(0);
        expect(data.distributionRefusal?.code, 'null quantiles with no stated refusal')
          .toBe('ALL_OPEN_DEALS_UNPRICEABLE');
        expect(data.distributionRefusal?.rule, 'a refusal that cites no rule').toBeTruthy();
      }

      for (const d of data.deals) {
        expect(d.winProbability).toBeGreaterThanOrEqual(0);
        expect(d.winProbability).toBeLessThanOrEqual(100);
      }
    });
  });

  describeDb('gap analysis', () => {
    it('returns gaps with exchange chips, none on LCX', async () => {
      const res = await app.request('/v1/analytics/gaps?minExchanges=1', { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.meta.total).toBe('number');
      for (const row of body.data.slice(0, 10)) {
        expect(row.exchangeCount).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(row.topExchanges)).toBe(true);
      }
    });
  });

  describeDb('unified timeline', () => {
    /**
     * This test used to borrow `GET /v1/projects?limit=1`'s first row and assert the
     * ordering of whatever activity that project happened to have. It passed on this
     * laptop for one reason: a dev database with 54k projects in it. The first time it
     * ran anywhere else — a GitHub runner with a migrated but EMPTY database — there was
     * no row 0, `pid` was `undefined`, and it failed on `expect(pid).toBeTruthy()`.
     *
     * The deeper problem is that it never tested its own name. Most projects have no
     * activity at all, so `data` came back empty, the ordering loop ran ZERO times, and
     * the assertion about merging kinds in descending order was never evaluated. It
     * would have passed against an endpoint that returned `[]` unconditionally, and it
     * would have passed against one that returned a single kind.
     *
     * So it now arranges its own fixture: three rows across TWO kinds, inserted in
     * ASCENDING time order so a missing or reversed `ORDER BY` cannot survive, with the
     * message deliberately in the middle so a merge that simply concatenates the two
     * source queries fails too. Self-contained, and it finally checks what it claims.
     */
    it('merges activity kinds in descending time order', async () => {
      const created = await app.request('/v1/projects', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: `timeline-test-${Date.now()}` }),
      });
      expect(created.status).toBe(201);
      const pid = (await created.json()).data.id;

      const db = getDb();
      // Fixed, distinct timestamps rather than `now()` offsets: two rows written in the
      // same millisecond would make the ordering assertion pass by luck.
      const t1 = '2020-01-01T00:00:00Z'; // oldest  → must come LAST
      const t2 = '2020-06-01T00:00:00Z'; // middle  → the other kind, so concatenation fails
      const t3 = '2020-12-01T00:00:00Z'; // newest  → must come FIRST
      await db.execute(sql`
        INSERT INTO signals (project_id, kind, payload, observed_at)
        VALUES (${pid}::uuid, 'price_movement', '{"mcapMovePct":"12"}'::jsonb, ${t1}::timestamptz),
               (${pid}::uuid, 'price_movement', '{"mcapMovePct":"34"}'::jsonb, ${t3}::timestamptz)
      `);
      await db.execute(sql`
        INSERT INTO messages (project_id, to_email, subject, body, provider, status, sent_at)
        VALUES (${pid}::uuid, 'probe@example.com', 'timeline probe', '', 'test', 'sent', ${t2}::timestamptz)
      `);

      try {
        const res = await app.request(`/v1/projects/${pid}/timeline`, { headers: AUTH });
        expect(res.status).toBe(200);
        const { data } = await res.json();

        // Non-vacuous: the loop below is worthless without this.
        expect(data.length, 'the timeline returned nothing for a project with 3 activity rows').toBe(3);
        // Both kinds present — this is the "merges" half of the claim.
        expect(new Set(data.map((r: { kind: string }) => r.kind))).toEqual(new Set(['signal', 'message']));
        // And the interleave: newest signal, then the message, then the oldest signal.
        expect(data.map((r: { kind: string }) => r.kind)).toEqual(['signal', 'message', 'signal']);

        for (let i = 1; i < data.length; i++) {
          expect(new Date(data[i - 1].ts).getTime()).toBeGreaterThanOrEqual(new Date(data[i].ts).getTime());
        }
      } finally {
        // Always clean up, even on failure — a leaked fixture makes the next run's
        // failure harder to read than this one's.
        await db.execute(sql`DELETE FROM signals WHERE project_id = ${pid}::uuid`);
        await db.execute(sql`DELETE FROM messages WHERE project_id = ${pid}::uuid`);
        await db.execute(sql`DELETE FROM projects WHERE id = ${pid}::uuid`);
      }
    });
  });
});
