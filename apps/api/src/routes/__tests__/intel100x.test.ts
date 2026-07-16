/**
 * Integration tests for the intel-100x additions: project snooze (raw-jsonb),
 * deal playbook (migration 0028), score payload enrichment, forecast history,
 * and the weekly digest job. Runs against the local dev database (same
 * convention as features.test.ts / kpiHistory.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { closeDb, getDb, getPool } from '../../db/index.js';
import { runWeeklyDigest } from '../../notifications/digest.js';

const TEST_KEY = 'dev-operator-key-change-me';
const AUTH = { Authorization: `Bearer ${TEST_KEY}` };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };
const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('intel 100x features', () => {
  const app = createApp();
  const projectName = `intel100x-test-${Date.now()}`;
  let projectId: string;
  let dealId: string;

  beforeAll(async () => {
    process.env.OPERATOR_API_KEY = TEST_KEY;

    const projectRes = await app.request('/v1/projects', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: projectName }),
    });
    expect(projectRes.status).toBe(201);
    projectId = (await projectRes.json()).data.id;

    const dealRes = await app.request(`/v1/deals/projects/${projectId}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });
    expect(dealRes.status).toBe(201);
    dealId = (await dealRes.json()).data.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (projectId) {
      await db.execute(sql`DELETE FROM deals WHERE project_id = ${projectId}`);
      await db.execute(sql`DELETE FROM audit_log WHERE entity_id = ${projectId} OR entity_id = ${dealId ?? ''}`);
      await db.execute(sql`DELETE FROM projects WHERE id = ${projectId}`);
    }
    await closeDb();
  });

  describe('project snooze', () => {
    it('rejects unauthenticated access', async () => {
      const res = await app.request(`/v1/projects/${MISSING_UUID}/snooze`, { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('400s when neither days nor until is given', async () => {
      const res = await app.request(`/v1/projects/${projectId}/snooze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION');
    });

    it('400s on an unparseable until date', async () => {
      const res = await app.request(`/v1/projects/${projectId}/snooze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ until: 'not-a-date' }),
      });
      expect(res.status).toBe(400);
    });

    it('404s on a missing project', async () => {
      const res = await app.request(`/v1/projects/${MISSING_UUID}/snooze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ days: 7 }),
      });
      expect(res.status).toBe(404);
    });

    it('snoozes, surfaces snoozedUntil in the list, then clears', async () => {
      // Snooze for 5 days
      const snooze = await app.request(`/v1/projects/${projectId}/snooze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ days: 5, reason: 'integration test' }),
      });
      expect(snooze.status).toBe(200);
      const { data } = await snooze.json();
      expect(typeof data.snoozeUntil).toBe('string');
      const until = new Date(data.snoozeUntil).getTime();
      expect(until).toBeGreaterThan(Date.now() + 4 * 86_400_000);
      expect(until).toBeLessThan(Date.now() + 6 * 86_400_000);

      // List pass-through (no server-side filtering — value only)
      const list = await app.request(`/v1/projects?search=${encodeURIComponent(projectName)}`, { headers: AUTH });
      expect(list.status).toBe(200);
      const row = (await list.json()).data.find((p: { id: string }) => p.id === projectId);
      expect(row).toBeTruthy();
      expect(row.snoozedUntil).toBe(data.snoozeUntil);

      // Audit trail written
      const audit = await getDb().execute(sql`
        SELECT 1 FROM audit_log WHERE action = 'project_snoozed' AND entity_id = ${projectId}
      `);
      expect((audit.rows ?? []).length).toBeGreaterThan(0);

      // Clear it
      const clear = await app.request(`/v1/projects/${projectId}/snooze`, { method: 'DELETE', headers: AUTH });
      expect(clear.status).toBe(200);
      expect((await clear.json()).data.snoozeUntil).toBeNull();

      const listAfter = await app.request(`/v1/projects?search=${encodeURIComponent(projectName)}`, { headers: AUTH });
      const rowAfter = (await listAfter.json()).data.find((p: { id: string }) => p.id === projectId);
      expect(rowAfter.snoozedUntil).toBeNull();
    });
  });

  describe('deal playbook', () => {
    it('starts empty', async () => {
      const res = await app.request(`/v1/deals/${dealId}/playbook`, { headers: AUTH });
      expect(res.status).toBe(200);
      expect((await res.json()).data.done).toEqual([]);
    });

    it('round-trips a valid done set', async () => {
      const patch = await app.request(`/v1/deals/${dealId}/playbook`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ done: ['T', 'K'] }),
      });
      expect(patch.status).toBe(200);
      expect((await patch.json()).data.done).toEqual(['T', 'K']);

      const get = await app.request(`/v1/deals/${dealId}/playbook`, { headers: AUTH });
      expect(get.status).toBe(200);
      expect((await get.json()).data.done).toEqual(['T', 'K']);

      // Audit trail written
      const audit = await getDb().execute(sql`
        SELECT 1 FROM audit_log WHERE action = 'deal_playbook_updated' AND entity_id = ${dealId}
      `);
      expect((audit.rows ?? []).length).toBeGreaterThan(0);
    });

    it('400s on a non-allowlisted step code', async () => {
      const res = await app.request(`/v1/deals/${dealId}/playbook`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ done: ['T', 'X'] }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION');
    });

    it('400s when done is not an array of strings', async () => {
      const res = await app.request(`/v1/deals/${dealId}/playbook`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ done: 'T' }),
      });
      expect(res.status).toBe(400);
    });

    it('404s on a missing deal', async () => {
      const res = await app.request(`/v1/deals/${MISSING_UUID}/playbook`, { headers: AUTH });
      expect(res.status).toBe(404);
    });
  });

  describe('score payload enrichment (project detail)', () => {
    it('keeps score null when the project is unscored', async () => {
      const res = await app.request(`/v1/projects/${projectId}`, { headers: AUTH });
      expect(res.status).toBe(200);
      expect((await res.json()).data.score).toBeNull();
    });

    it('exposes propensityScore / priorityScore / propensityReasons / usIntelSignals', async () => {
      const scoreRes = await app.request(`/v1/projects/${projectId}/score`, { method: 'POST', headers: AUTH });
      expect(scoreRes.status).toBe(200);

      const res = await app.request(`/v1/projects/${projectId}`, { headers: AUTH });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.score).toBeTruthy();
      expect(typeof data.score.propensityScore).toBe('number');
      expect(typeof data.score.priorityScore).toBe('number');
      expect(Array.isArray(data.score.propensityReasons)).toBe(true);
      for (const r of data.score.propensityReasons) {
        expect(typeof r.code).toBe('string');
        expect(typeof r.factor).toBe('string');
        expect(typeof r.points).toBe('number');
        expect(typeof r.max).toBe('number');
        expect(typeof r.note).toBe('string');
      }
      expect(data.score.usIntelSignals).toBeTypeOf('object');
    });
  });

  describe('GET /v1/kpis/forecast-history', () => {
    const today = new Date().toISOString().slice(0, 10);

    beforeAll(async () => {
      // Idempotent seed: today's snapshot carries a forecast payload.
      await getDb().execute(sql`
        INSERT INTO kpi_daily_snapshots (snapshot_date, forecast)
        VALUES (${today}, ${JSON.stringify({ p10: 0, p50: 100, p90: 500, expected: 180 })}::jsonb)
        ON CONFLICT (snapshot_date) DO UPDATE SET forecast = EXCLUDED.forecast
      `);
    });

    it('rejects unauthenticated access', async () => {
      const res = await app.request('/v1/kpis/forecast-history');
      expect(res.status).toBe(401);
    });

    it('returns the documented shape ascending by date', async () => {
      const res = await app.request('/v1/kpis/forecast-history?days=90', { headers: AUTH });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta.days).toBe(90);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      const dates = body.data.map((s: { date: string }) => s.date);
      expect([...dates].sort()).toEqual(dates);

      for (const row of body.data) {
        expect(typeof row.date).toBe('string');
        expect(typeof row.p10).toBe('number');
        expect(typeof row.p50).toBe('number');
        expect(typeof row.p90).toBe('number');
        expect(typeof row.expected).toBe('number');
      }

      const todayRow = body.data.find((s: { date: string }) => s.date === today);
      expect(todayRow).toBeTruthy();
      expect(todayRow.p50).toBe(100);
      expect(todayRow.expected).toBe(180);
    });

    it('clamps a bad days param instead of erroring', async () => {
      const res = await app.request('/v1/kpis/forecast-history?days=notanumber', { headers: AUTH });
      expect(res.status).toBe(200);
      expect((await res.json()).meta.days).toBe(90);
    });
  });

  describe('weekly digest job', () => {
    it('inserts exactly one deduped notification for the current ISO week', async () => {
      const pool = getPool();
      const week = String(
        (await pool.query(`SELECT TO_CHAR(NOW(), 'IYYY-IW') AS week`)).rows[0].week,
      );
      const dedupKey = `digest:${week}`;

      // Clean slate for this week so the insert is provable
      await pool.query(`DELETE FROM notifications WHERE dedup_key = $1`, [dedupKey]);

      const result = await runWeeklyDigest(pool);
      expect(result.isoWeek).toBe(week);
      expect(result.notified).toBe(true);
      expect(typeof result.openHandoffs).toBe('number');
      expect(typeof result.stalledCount).toBe('number');
      expect(result.riskiest.length).toBeLessThanOrEqual(3);

      const first = await pool.query(
        `SELECT rule, href FROM notifications WHERE dedup_key = $1`, [dedupKey],
      );
      expect(first.rowCount).toBe(1);
      expect(first.rows[0].rule).toBe('weekly_digest');
      expect(first.rows[0].href).toBe('/');

      // Re-run stays quiet (dedup) — still exactly one row
      const rerun = await runWeeklyDigest(pool);
      expect(rerun.notified).toBe(true);
      const second = await pool.query(
        `SELECT COUNT(*)::int AS n FROM notifications WHERE dedup_key = $1`, [dedupKey],
      );
      expect(second.rows[0].n).toBe(1);
    });
  });
});
