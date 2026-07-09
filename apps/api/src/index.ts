import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closeDb } from './db/index.js';
import { env } from './lib/env.js';

const app = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
    hostname: env.host,
  },
  (info) => {
    console.log(`[api] LCX Sales API on http://${info.address}:${info.port} (${env.nodeEnv})`);
    console.log(`[api] health: http://127.0.0.1:${info.port}/health`);
    console.log(`[api] projects: http://127.0.0.1:${info.port}/v1/projects`);
  },
);

async function shutdown(signal: string) {
  console.log(`[api] ${signal} — shutting down`);
  await closeDb();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
