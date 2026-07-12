/**
 * Integration tests for the master-plan features: tasks, notifications,
 * send queue, deal board, forecast, gap analysis, timeline.
 * Runs against the local dev database (same convention as enrich.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';

const TEST_KEY = 'dev-operator-key-change-me';
const AUTH = { Authorization: `Bearer ${TEST_KEY}` };

describe('master-plan feature routes', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.OPERATOR_API_KEY = TEST_KEY;
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('error mapping (onError)', () => {
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

    it('creates a manual task', async () => {
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

    it('lists open tasks including the new one', async () => {
      const res = await app.request('/v1/tasks?status=open', { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.some((t: { id: string }) => t.id === taskId)).toBe(true);
    });

    it('completes the task and removes it from the open list', async () => {
      const done = await app.request(`/v1/tasks/${taskId}/done`, { method: 'POST', headers: AUTH });
      expect(done.status).toBe(200);
      const res = await app.request('/v1/tasks?status=open', { headers: AUTH });
      const body = await res.json();
      expect(body.data.some((t: { id: string }) => t.id === taskId)).toBe(false);
    });

    it('404s on completing a missing task', async () => {
      const res = await app.request('/v1/tasks/00000000-0000-0000-0000-000000000000/done', {
        method: 'POST',
        headers: AUTH,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('notifications', () => {
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

  describe('send queue', () => {
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

  describe('deal board + forecast', () => {
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

    it('returns a coherent Monte Carlo forecast', async () => {
      const res = await app.request('/v1/kpis/forecast', { headers: AUTH });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.runs).toBe(10000);
      expect(data.p10).toBeLessThanOrEqual(data.p50);
      expect(data.p50).toBeLessThanOrEqual(data.p90);
      for (const d of data.deals) {
        expect(d.winProbability).toBeGreaterThanOrEqual(0);
        expect(d.winProbability).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('gap analysis', () => {
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

  describe('unified timeline', () => {
    it('merges activity kinds in descending time order', async () => {
      const projects = await app.request('/v1/projects?limit=1&sort=priority', { headers: AUTH });
      const pid = (await projects.json()).data[0]?.id;
      expect(pid).toBeTruthy();

      const res = await app.request(`/v1/projects/${pid}/timeline`, { headers: AUTH });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      for (let i = 1; i < data.length; i++) {
        expect(new Date(data[i - 1].ts).getTime()).toBeGreaterThanOrEqual(new Date(data[i].ts).getTime());
      }
    });
  });
});
