import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closeDb } from './db/index.js';
import { connectionTargetBootLine } from './db/connectionTarget.js';
import { env } from './lib/env.js';

/*
 * SAY IT AT BOOT, BEFORE ANYTHING IS DIALLED.
 *
 * A connection string that cannot work is knowable from the string alone, and waiting for
 * the first query to fail costs the operator a round trip through a driver error code that
 * names the symptom rather than the fix. On 2026-08-10 that round trip cost three hours.
 *
 * `console.error`, not `log`: on Render this is the line that has to be findable in a wall
 * of request logs. It is silent when the string is clean — a boot line that always prints
 * something about the database is a boot line nobody reads.
 */
const bootLine = connectionTargetBootLine(env.databaseUrl, env.nodeEnv);
if (bootLine) console.error(bootLine);

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
