import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { closeDb } from '../../db/index.js';
import { itDb } from '../../test/db.js';

const TEST_KEY = 'dev-operator-key-change-me';

describe('POST /v1/projects/:id/enrich', () => {
  const app = createApp();

  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = TEST_KEY;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('returns 401 without API key', async () => {
    const res = await app.request('/v1/projects/some-id/enrich', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  itDb('returns 404 for non-existent project', async () => {
    const res = await app.request('/v1/projects/00000000-0000-0000-0000-000000000000/enrich', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });
});
