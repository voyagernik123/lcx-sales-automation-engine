import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';

export const auditRoutes = new Hono<{ Variables: AuthVariables }>();

auditRoutes.get('/', requireOperator, async (c) => {
  const db = getDb();

  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const offset = (page - 1) * limit;
    const entity = c.req.query('entity');
    const action = c.req.query('action');
    const actor = c.req.query('actor');

    // NB: the queries below alias audit_log as `al`, so conditions must use
    // the alias — qualified column refs like "audit_log"."entity" are invalid
    // once the table is aliased and made every filtered query fail.
    const conditions: ReturnType<typeof sql>[] = [];
    if (entity) conditions.push(sql`al.entity = ${entity}`);
    if (action) conditions.push(sql`al.action = ${action}`);
    if (actor) conditions.push(sql`al.actor = ${actor}`);

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const [rowsResult, countResult] = await Promise.all([
      db.execute(sql`
        SELECT al.*, p.name AS project_name
        FROM ${schema.auditLog} al
        LEFT JOIN projects p ON al.entity = 'projects' AND al.entity_id = p.id::text
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS count FROM ${schema.auditLog} al ${whereClause}
      `),
    ]);

    const total = Number((countResult.rows?.[0] as Record<string, unknown> | undefined)?.count ?? 0);

    return c.json({
      data: (rowsResult.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        actor: r.actor,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        meta: r.meta,
        projectName: r.project_name ?? null,
        createdAt: r.created_at,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
        version: env.version,
      },
    });
  } catch (err) {
    console.error('[audit] list error:', err);
    return c.json({ error: 'Failed to load audit log', code: 'QUERY_ERROR' }, 500);
  }
});
