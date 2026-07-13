/**
 * POST /v1/analytics/board-report/send — email-not-configured behavior.
 *
 * RESEND_API_KEY is pinned to '' before the app (and its env snapshot) is
 * imported: vi.hoisted runs ahead of the static imports, and dotenv does not
 * override keys already present in process.env.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RESEND_API_KEY = '';
  process.env.OPERATOR_API_KEY = 'dev-operator-key-change-me';
});

import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';

const TEST_KEY = 'dev-operator-key-change-me';
const AUTH = { Authorization: `Bearer ${TEST_KEY}`, 'Content-Type': 'application/json' };

describe('POST /v1/analytics/board-report/send', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.OPERATOR_API_KEY = TEST_KEY;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('rejects unauthenticated access', async () => {
    const res = await app.request('/v1/analytics/board-report/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: ['exec@lcx.com'] }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 EMAIL_NOT_CONFIGURED when RESEND_API_KEY is empty', async () => {
    const res = await app.request('/v1/analytics/board-report/send', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ recipients: ['exec@lcx.com'], period: 'week' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('EMAIL_NOT_CONFIGURED');
    expect(body.error).toMatch(/RESEND_API_KEY/);
  });

  it('reports configured=false on the email-status endpoint', async () => {
    const res = await app.request('/v1/analytics/board-report/email-status', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configured).toBe(false);
  });
});
