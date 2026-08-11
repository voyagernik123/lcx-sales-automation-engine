import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closeDb } from './db/index.js';
import { connectionTargetBootLine } from './db/connectionTarget.js';
import { decideTls, healDatabaseUrl } from './db/index.js';
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

/*
 * SAY IT OUT LOUD WHEN THE SERVER IS NOT AUTHENTICATED.
 *
 * `encrypted` in production means TLS without certificate verification: safe against passive
 * interception, not against anything that can answer for the host. That is a deliberate
 * trade — a pinned CA is not shipped, and failing the boot over it would swap a
 * confidentiality risk for an outage — but a deliberate trade that nobody can see is
 * indistinguishable from an oversight, and this one already survived one security pass by
 * looking like a default.
 */
const tls = decideTls(env.databaseUrl, env.databaseCaCert);
if (env.nodeEnv === 'production' && tls.state !== 'verified') {
  console.error(
    tls.state === 'off'
      ? '[db] TLS IS OFF in production — database traffic is in CLEARTEXT. Check DATABASE_URL points at a remote host.'
      : '[db] TLS is on but the server certificate is NOT verified. Set DATABASE_CA_CERT to the provider CA bundle to upgrade to verified.',
  );
}

/*
 * SELF-HEAL AN UNROUTABLE DATABASE URL — AND DO NOT BLOCK THE SERVER ON IT.
 *
 * Deliberately not awaited. The whole lesson of the liveness split is that this process must
 * answer `/health` immediately whatever the database is doing, so the probe runs alongside the
 * server and the pool is swapped the moment a candidate answers. The API is up in milliseconds
 * and the database heals within seconds, rather than a human being the retry loop.
 *
 * A no-op for every URL except the one host that provably cannot work from an IPv4-only
 * network. `.catch` because an unhandled rejection here would take down a process whose only
 * problem is a misconfigured dependency.
 */
void healDatabaseUrl().catch((err: unknown) => {
  console.error('[db] pooler fallback probe failed:', (err as Error)?.message ?? err);
});

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
