import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './lib/env.js';
import { recordLatency } from './lib/latency.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import perfRoutes from './routes/perf.js';
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
import { intelRoutes } from './routes/intel.js';
import { graphRoutes } from './routes/graph.js';
import { searchRoutes } from './routes/search.js';
import { reviewRoutes } from './routes/reviews.js';
import { actionRoutes } from './routes/actions.js';
import { monitorRoutes } from './routes/monitors.js';
import { marketingRoutes } from './routes/marketing.js';
import { scenarioRoutes, pirRoutes } from './routes/planning.js';
import { wbrRoutes } from './routes/wbr.js';
import { decisionRoutes } from './routes/decisions.js';
import { aiOperatorRoutes } from './routes/aiOperator.js';
import { commandRoutes } from './routes/command.js';
import { distributionRoutes } from './routes/distribution.js';
import { x402Routes } from './routes/x402.js';
import { accessRoutes } from './routes/access.js';
import { requireWorkspace } from './middleware/workspace.js';
import { NO_STORE_HEADER, noStore } from './middleware/noStore.js';
import { WORKSPACES } from '@lcx/shared';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  // Record request latency into the in-memory ring buffer that backs the API
  // p95 SLO (Phase 4.3). Wraps the whole chain; excludes the health check so
  // uptime pings don't skew the desk-facing latency picture.
  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    // /health is excluded so uptime pings don't skew the desk-facing number;
    // /v1/perf is excluded because it CARRIES the UI latency measurement —
    // timing it into the API ring would let measuring pollute the measured.
    if (c.req.path !== '/health' && c.req.path !== '/v1/perf') {
      recordLatency(performance.now() - start);
    }
  });
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
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Purpose'],
      // The web shell is ALWAYS cross-origin (Cloudflare Pages and
      // tauri://localhost → onrender.com), and fetch() hides any response header
      // not listed here. X-LCX-No-Store must be exposed or the cache kill switch
      // is set by the server, dropped by the browser, and silently does nothing.
      exposeHeaders: ['Content-Type', NO_STORE_HEADER],
      maxAge: 86400,
      credentials: false,
    }),
  );

  // Server-authoritative, deny-only cache veto. Ahead of the compartment gates
  // so it also stamps their 401/403 envelopes.
  app.use('*', noStore());

  // ── LCX OS compartment gates (Phase 1) ─────────────────────────────────
  // The workspace constitution (@lcx/shared) declares which /v1 namespaces
  // each workspace owns; every one is guarded at 'view' capability BEFORE the
  // route mounts below. Desk-level namespaces (me, tasks, notifications,
  // integrations, search, reviews, actions) stay ungated here — actions are
  // gated per-action inside the registry instead.
  for (const ws of WORKSPACES) {
    for (const prefix of ws.apiPrefixes) {
      app.use(`${prefix}/*`, requireWorkspace(ws.id, 'view'));
      app.use(prefix, requireWorkspace(ws.id, 'view'));
    }
  }

  app.route('/health', healthRoutes);
  app.route('/v1/me', meRoutes);
  app.route('/v1/perf', perfRoutes);
  app.route('/v1/access', accessRoutes);
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
  app.route('/v1/ai', aiOperatorRoutes);
  app.route('/v1/command', commandRoutes);
  app.route('/v1/distribution', distributionRoutes);
  // x402 seller layer — public by design (payment is the auth), not gated.
  app.route('/v1/x402', x402Routes);
  app.route('/v1/integrations', integrationRoutes);
  app.route('/v1/tasks', taskRoutes);
  app.route('/v1/notifications', notificationRoutes);
  app.route('/v1/intel', intelRoutes);
  app.route('/v1/graph', graphRoutes);
  app.route('/v1/search', searchRoutes);
  app.route('/v1/reviews', reviewRoutes);
  app.route('/v1/actions', actionRoutes);
  app.route('/v1/monitors', monitorRoutes);
  // Guarded at 'view' automatically: app.ts mounts requireWorkspace from the
  // registry's apiPrefixes, and '/v1/marketing' is declared there.
  app.route('/v1/marketing', marketingRoutes);
  app.route('/v1/scenarios', scenarioRoutes);
  app.route('/v1/pirs', pirRoutes);
  app.route('/v1/wbr', wbrRoutes);
  app.route('/v1/decisions', decisionRoutes);

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
