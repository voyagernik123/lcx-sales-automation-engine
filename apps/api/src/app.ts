import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './lib/env.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
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

  app.get('/', (c) =>
    c.json({
      service: 'lcx-sales-api',
      docs: 'GET /health (public) · GET /v1/me (API key)',
    }),
  );

  app.notFound((c) =>
    c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404),
  );

  app.onError((err, c) => {
    console.error('[api] unhandled', err);
    return c.json(
      {
        error: env.nodeEnv === 'production' ? 'Internal server error' : err.message,
        code: 'INTERNAL',
      },
      500,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
