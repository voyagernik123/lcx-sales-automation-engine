/**
 * Intel job trigger (Wave 7 follow-on) — the HTTP entrypoint cron uses to run
 * the collection/derive pipeline. Validates auth, the job allowlist, and a real
 * synchronous run of a fast, safe job (calibrate) against the local dev DB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';

const TEST_KEY = 'dev-operator-key-change-me';
const AUTH = { Authorization: `Bearer ${TEST_KEY}`, 'Content-Type': 'application/json' };

describe('POST /v1/intel/jobs/:job', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.OPERATOR_API_KEY = TEST_KEY;
  });
  afterAll(async () => {
    await closeDb();
  });

  it('401s without a credential', async () => {
    const res = await app.request('/v1/intel/jobs/calibrate', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('400s on a job outside the allowlist (and lists valid jobs)', async () => {
    const res = await app.request('/v1/intel/jobs/rm-rf', { method: 'POST', headers: AUTH });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION');
    expect(body.jobs).toContain('collect');
    expect(body.jobs).toContain('alpha');
  });

  it('runs a job synchronously with ?wait=1 and returns stats', async () => {
    const res = await app.request('/v1/intel/jobs/calibrate?wait=1', { method: 'POST', headers: AUTH });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.job).toBe('calibrate');
    expect(data.status).toBe('ok');
    expect(data.stats).toBeTruthy();
    expect(typeof data.stats.snapshotted).toBe('number');
  }, 30_000);
});
