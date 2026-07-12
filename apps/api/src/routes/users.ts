import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';

export const userRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

type UserRow = Record<string, unknown>;
const mapUser = (r: UserRow) => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** GET /v1/users — list team members. */
userRoutes.get('/', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT id, email, name, role, status, created_at, updated_at
      FROM users
      ORDER BY created_at ASC
    `);
    return c.json({ data: (result.rows ?? []).map(mapUser), meta: meta() });
  } catch (err) {
    console.error('[users] list error:', err);
    return c.json({ error: 'Failed to list users', code: 'USERS_ERROR' }, 500);
  }
});

/** POST /v1/users — create a team member. */
userRoutes.post('/', requireOperator, async (c) => {
  const body = await c.req.json<{ email?: string; name?: string; role?: string }>();
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  if (!email || !name) return c.json({ error: 'email and name required', code: 'VALIDATION' }, 400);
  const role = body.role?.trim() || 'bd';
  const id = randomUUID();
  const db = getDb();
  try {
    const result = await db.execute(sql`
      INSERT INTO users (id, email, name, role)
      VALUES (${id}, ${email}, ${name}, ${role})
      RETURNING id, email, name, role, status, created_at, updated_at
    `);
    return c.json({ data: mapUser(result.rows![0] as UserRow), meta: meta() }, 201);
  } catch (err) {
    console.error('[users] create error:', err);
    return c.json({ error: 'Failed to create user (email may already exist)', code: 'USERS_ERROR' }, 500);
  }
});

/** GET /v1/users/:id/assignments — projects assigned to a user. */
userRoutes.get('/:id/assignments', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT pa.id, pa.project_id, pa.user_id, pa.role, pa.assigned_by, pa.assigned_at,
             p.name AS project_name, p.ticker AS project_ticker
      FROM project_assignments pa
      JOIN projects p ON p.id = pa.project_id
      WHERE pa.user_id = ${c.req.param('id')}
      ORDER BY pa.assigned_at DESC
    `);
    return c.json({
      data: (result.rows ?? []).map((r: UserRow) => ({
        id: r.id,
        projectId: r.project_id,
        userId: r.user_id,
        role: r.role,
        assignedBy: r.assigned_by,
        assignedAt: r.assigned_at,
        projectName: r.project_name,
        projectTicker: r.project_ticker,
      })),
      meta: meta(),
    });
  } catch (err) {
    console.error('[users] assignments error:', err);
    return c.json({ error: 'Failed to list assignments', code: 'ASSIGN_ERROR' }, 500);
  }
});

export const projectAssignmentRoutes = new Hono<{ Variables: AuthVariables }>();

/** GET /v1/projects/:id/assignments — users assigned to a project. */
projectAssignmentRoutes.get('/:id/assignments', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT pa.id, pa.project_id, pa.user_id, pa.role, pa.assigned_by, pa.assigned_at,
             u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM project_assignments pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id = ${c.req.param('id')}
      ORDER BY pa.assigned_at DESC
    `);
    return c.json({
      data: (result.rows ?? []).map((r: UserRow) => ({
        id: r.id,
        projectId: r.project_id,
        userId: r.user_id,
        role: r.role,
        assignedBy: r.assigned_by,
        assignedAt: r.assigned_at,
        userName: r.user_name,
        userEmail: r.user_email,
        userRole: r.user_role,
      })),
      meta: meta(),
    });
  } catch (err) {
    console.error('[projects] assignments error:', err);
    return c.json({ error: 'Failed to list assignments', code: 'ASSIGN_ERROR' }, 500);
  }
});

/** POST /v1/projects/:id/assign — assign a user to a project. */
projectAssignmentRoutes.post('/:id/assign', requireOperator, async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json<{ userId?: string; role?: string }>();
  if (!body.userId?.trim()) return c.json({ error: 'userId required', code: 'VALIDATION' }, 400);
  const role = body.role?.trim() || 'owner';
  const id = randomUUID();
  const db = getDb();
  try {
    const result = await db.execute(sql`
      INSERT INTO project_assignments (id, project_id, user_id, role, assigned_by)
      VALUES (${id}, ${projectId}, ${body.userId.trim()}, ${role}, ${c.get('operator').id})
      ON CONFLICT (project_id, user_id, role) DO UPDATE SET assigned_at = NOW()
      RETURNING id, project_id, user_id, role, assigned_by, assigned_at
    `);
    const r = result.rows![0] as UserRow;
    return c.json({
      data: {
        id: r.id,
        projectId: r.project_id,
        userId: r.user_id,
        role: r.role,
        assignedBy: r.assigned_by,
        assignedAt: r.assigned_at,
      },
      meta: meta(),
    }, 201);
  } catch (err) {
    console.error('[projects] assign error:', err);
    return c.json({ error: 'Failed to assign (check project and user ids)', code: 'ASSIGN_ERROR' }, 500);
  }
});

/** DELETE /v1/projects/:id/assign/:assignmentId — remove an assignment. */
projectAssignmentRoutes.delete('/:id/assign/:assignmentId', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      DELETE FROM project_assignments
      WHERE id = ${c.req.param('assignmentId')} AND project_id = ${c.req.param('id')}
      RETURNING id
    `);
    if (!result.rows?.length) return c.json({ error: 'Assignment not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: { id: result.rows[0].id }, meta: meta() });
  } catch (err) {
    console.error('[projects] unassign error:', err);
    return c.json({ error: 'Failed to remove assignment', code: 'ASSIGN_ERROR' }, 500);
  }
});
