import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const TEST_KEY = process.env.OPERATOR_API_KEY ?? 'dev-operator-key-change-me';

describe('API health + auth', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = TEST_KEY;
  });

  afterAll(() => {
    // no-op: pool closed only on process exit in server; tests use app.fetch only
  });

  it('GET /health returns ok with db status', async () => {
    const res = await app.request('/health');
    expect([200, 503]).toContain(res.status);
    const body = (await res.json()) as {
      ok: boolean;
      service: string;
      db: string;
      timestamp: string;
    };
    expect(body.service).toBe('lcx-sales-api');
    expect(['up', 'down', 'skipped']).toContain(body.db);
    expect(typeof body.timestamp).toBe('string');
    if (body.db === 'up' || body.db === 'skipped') {
      expect(body.ok).toBe(true);
      expect(res.status).toBe(200);
    }
  });

  it('GET /v1/me rejects missing API key', async () => {
    const res = await app.request('/v1/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('GET /v1/me rejects wrong API key', async () => {
    const res = await app.request('/v1/me', {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/me accepts Bearer API key', async () => {
    const res = await app.request('/v1/me', {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; role: string; authMethod: string };
    };
    expect(body.data.role).toBe('operator');
    expect(body.data.authMethod).toBe('api_key');
  });

  it('GET /v1/me accepts X-API-Key header', async () => {
    const res = await app.request('/v1/me', {
      headers: { 'X-API-Key': TEST_KEY },
    });
    expect(res.status).toBe(200);
  });
});
