import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';

export const templateRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

interface TemplateStep {
  touchIndex: number;
  delayDays: number;
  channel: 'email' | 'linkedin' | 'telegram';
}

function validSteps(steps: unknown): steps is TemplateStep[] {
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.length <= 10 &&
    steps.every(
      (s) =>
        s && typeof s.touchIndex === 'number' && typeof s.delayDays === 'number' &&
        ['email', 'linkedin', 'telegram'].includes(s.channel),
    )
  );
}

templateRoutes.get('/', requireOperator, async (c) => {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT id, name, description, steps, is_default, created_at
    FROM sequence_templates ORDER BY is_default DESC, created_at ASC
  `);
  return c.json({
    data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      steps: r.steps,
      isDefault: r.is_default,
    })),
    meta: meta(),
  });
});

templateRoutes.post('/', requireOperator, async (c) => {
  const db = getDb();
  const body = await c.req.json<{ name?: string; description?: string; steps?: unknown }>();
  if (!body.name?.trim()) return c.json({ error: 'Name required', code: 'VALIDATION' }, 400);
  if (!validSteps(body.steps)) return c.json({ error: 'steps must be 1-10 valid {touchIndex,delayDays,channel}', code: 'VALIDATION' }, 400);

  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO sequence_templates (id, name, description, steps)
    VALUES (${id}, ${body.name.trim()}, ${body.description ?? null}, ${JSON.stringify(body.steps)}::jsonb)
  `);
  return c.json({ data: { id }, meta: meta() }, 201);
});

templateRoutes.delete('/:id', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const [row] = await db.execute(sql`SELECT is_default FROM sequence_templates WHERE id = ${id}`).then((r) => r.rows as { is_default: boolean }[]);
  if (!row) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  if (row.is_default) return c.json({ error: 'Cannot delete the default template', code: 'PROTECTED' }, 400);
  await db.execute(sql`DELETE FROM sequence_templates WHERE id = ${id}`);
  return c.json({ data: { deleted: true }, meta: meta() });
});
