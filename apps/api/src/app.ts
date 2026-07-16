import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './lib/env.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { projectsRoutes } from './routes/projects.js';
import { outreachRoutes } from './routes/outreach.js';
import { queueRoutes } from './routes/queue.js';
import { discoveryRoutes } from './routes/discovery.js';
import { analyticsRoutes } from './routes/analytics.js';
import { taskRoutes } from './routes/tasks.js';
import { notificationRoutes } from './routes/notifications.js';
import { userRoutes, projectAssignmentRoutes } from './routes/users.js';
import { customer360Routes } from './routes/customer360.js';
import { noteRoutes } from './routes/notes.js';
import { aiRoutes } from './routes/ai.js';
import { outreachOpsRoutes } from './routes/outreachOps.js';
import { dealDeskRoutes } from './routes/dealdesk.js';
import { analytics2Routes } from './routes/analytics2.js';
import { integrationRoutes } from './routes/integrations.js';
import { templateRoutes } from './routes/templates.js';
import { handoffRoutes } from './routes/handoffs.js';
import { dealRoutes } from './routes/deals.js';
import { kpiRoutes } from './routes/kpis.js';
import { auditRoutes } from './routes/audit.js';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', rateLimit());
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return env.corsOrigins[0] ?? '*';
        if (env.corsOrigins.includes('*')) return origin;
        return env.corsOrigins.includes(origin) ? origin : env.corsOrigins[0] ?? '';
      },
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      exposeHeaders: ['Content-Type'],
      maxAge: 86400,
      credentials: false,
    }),
  );

  app.route('/health', healthRoutes);
  app.route('/v1/me', meRoutes);
  app.route('/v1/projects', projectsRoutes);
  // additional /v1/projects sub-routers (disjoint paths: /:id/360, /:id/assign, /:id/notes, /:id/documents)
  app.route('/v1/projects', projectAssignmentRoutes);
  app.route('/v1/projects', customer360Routes);
  app.route('/v1/projects', noteRoutes);
  app.route('/v1/users', userRoutes);
  app.route('/v1/outreach/queue', queueRoutes);
  app.route('/v1/outreach/templates', templateRoutes);
  app.route('/v1/outreach-ops', outreachOpsRoutes);
  app.route('/v1/outreach', outreachRoutes);
  app.route('/v1/handoffs', handoffRoutes);
  app.route('/v1/deals', dealRoutes);
  app.route('/v1/dealdesk', dealDeskRoutes);
  app.route('/v1/kpis', kpiRoutes);
  app.route('/v1/audit', auditRoutes);
  app.route('/v1/discovery', discoveryRoutes);
  app.route('/v1/analytics', analyticsRoutes);
  app.route('/v1/analytics', analytics2Routes);
  app.route('/v1/ai', aiRoutes);
  app.route('/v1/integrations', integrationRoutes);
  app.route('/v1/tasks', taskRoutes);
  app.route('/v1/notifications', notificationRoutes);

  app.get('/', (c) =>
    c.json({
      service: 'lcx-sales-api',
      docs: [
        'GET /health',
        'GET /v1/me',
        'GET /v1/projects',
        'GET /v1/projects/:id',
        'POST /v1/projects',
        'POST /v1/projects/score',
        'POST /v1/projects/:id/score',
        'POST /v1/projects/:id/enrich',
        'POST /v1/projects/:id/approve',
        'POST /v1/projects/:id/suppress',
        'POST /v1/projects/:id/snooze',
        'DELETE /v1/projects/:id/snooze',
        'GET /v1/deals/:id/playbook',
        'PATCH /v1/deals/:id/playbook',
        'GET /v1/kpis/forecast-history',
        'POST /v1/projects/:id/people',
        'PATCH /v1/projects/:id/people/:personId',
        'GET /v1/projects/:id/gate',
        'GET /v1/kpis',
        'GET /v1/kpis/export',
        'GET /v1/kpis/triggers',
        'POST /v1/kpis/triggers',
        'PATCH /v1/kpis/triggers/:id',
        'GET /v1/audit',
      ],
    }),
  );

  app.notFound((c) => c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404));

  app.onError((err, c) => {
    // Dig out a Postgres error code (Drizzle wraps the pg error in .cause)
    const pgCode =
      (err as { code?: string }).code ??
      ((err as { cause?: { code?: string } }).cause?.code);

    // Map common data errors to 4xx instead of a blanket 500
    const CLIENT_ERRORS: Record<string, { status: 400 | 404 | 409; code: string; msg: string }> = {
      '22P02': { status: 400, code: 'INVALID_INPUT', msg: 'Invalid identifier or value' }, // bad UUID / cast
      '23502': { status: 400, code: 'MISSING_FIELD', msg: 'Required field missing' }, // not-null
      '23503': { status: 409, code: 'FK_VIOLATION', msg: 'Referenced record does not exist' }, // foreign key
      '23505': { status: 409, code: 'DUPLICATE', msg: 'Record already exists' }, // unique
    };
    const mapped = pgCode ? CLIENT_ERRORS[pgCode] : undefined;
    if (mapped) {
      return c.json({ error: mapped.msg, code: mapped.code }, mapped.status);
    }

    console.error('[api] unhandled', err);
    return c.json({ error: env.nodeEnv === 'production' ? 'Internal server error' : err.message, code: 'INTERNAL' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
