import { Hono } from 'hono';
import type { HealthResponse } from '@lcx/shared';
import { checkDb } from '../db/index.js';
import { env } from '../lib/env.js';

export const healthRoutes = new Hono();

healthRoutes.get('/', async (c) => {
  const db = await checkDb();
  const body: HealthResponse = {
    ok: db === 'up' || db === 'skipped',
    service: 'lcx-sales-api',
    version: env.version,
    env: env.nodeEnv,
    db,
    timestamp: new Date().toISOString(),
  };

  return c.json(body, body.ok ? 200 : 503);
});
