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
  app.route('/v1/outreach/queue', queueRoutes);
  app.route('/v1/outreach', outreachRoutes);
  app.route('/v1/handoffs', handoffRoutes);
  app.route('/v1/deals', dealRoutes);
  app.route('/v1/kpis', kpiRoutes);
  app.route('/v1/audit', auditRoutes);
  app.route('/v1/discovery', discoveryRoutes);

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
    console.error('[api] unhandled', err);
    return c.json({ error: env.nodeEnv === 'production' ? 'Internal server error' : err.message, code: 'INTERNAL' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
