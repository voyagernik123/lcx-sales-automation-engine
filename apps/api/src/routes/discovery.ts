import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';
import { enqueueDiscovery, enqueueBatch, processDiscoveryTick } from '../discovery/service.js';

export const discoveryRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

discoveryRoutes.post('/projects/:id', requireOperator, async (c) => {
  const { id } = c.req.param();
  const result = await enqueueDiscovery(id);
  if (result.skipped) return c.json({ error: result.skipped, code: 'DISCOVERY_SKIPPED' }, 409);
  return c.json({ data: { jobId: result.jobId }, meta: meta() }, 201);
});

discoveryRoutes.post('/enqueue-batch', requireOperator, async (c) => {
  const body = await c.req.json<{ limit?: number }>().catch(() => ({ limit: undefined }));
  const enqueued = await enqueueBatch(body.limit ?? 200);
  return c.json({ data: { enqueued }, meta: meta() });
});

discoveryRoutes.post('/tick', requireOperator, async (c) => {
  try {
    const result = await processDiscoveryTick(3);
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[discovery] tick error:', err);
    return c.json({ error: 'Discovery tick failed', code: 'DISCOVERY_ERROR' }, 500);
  }
});

discoveryRoutes.get('/jobs', requireOperator, async (c) => {
  const db = getDb();
  const qs = c.req.query();
  const conditions = [sql`TRUE`];
  if (qs.status) conditions.push(sql`status = ${qs.status}`);
  if (qs.projectId) conditions.push(sql`project_id = ${qs.projectId}`);
  const result = await db.execute(sql`
    SELECT id, project_id, status, attempts, error, result, created_at, finished_at
    FROM discovery_jobs
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY created_at DESC
    LIMIT ${Math.min(Number(qs.limit) || 50, 200)}
  `);
  return c.json({
    data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      projectId: r.project_id,
      status: r.status,
      attempts: r.attempts,
      error: r.error,
      result: r.result,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    })),
    meta: meta(),
  });
});
