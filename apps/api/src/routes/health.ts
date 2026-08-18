import { Hono } from 'hono';
import type { HealthResponse } from '@lcx/shared';
import { checkDb, getLastDbError, getDbTlsState, getDbUrlSource, getDbHealFailure } from '../db/index.js';
import { trustedProxyHops } from '../middleware/auth.js';
import { describeConnectionTarget } from '../db/connectionTarget.js';
import { env } from '../lib/env.js';

/**
 * LIVENESS, NOT READINESS — and the difference took this API off the internet.
 *
 * `/health` is what `render.yaml` names as `healthCheckPath`. A load balancer reads it to
 * decide whether this PROCESS should receive traffic at all. It used to return 503 whenever
 * the database was down, which sounds careful and is the opposite:
 *
 *   database unreachable → /health 503 → Render marks every instance unhealthy → stops
 *   routing → EVERY endpoint fails, including the ones that never touch the database.
 *
 * A degraded service became a dead one. Login, which does not need a row from Postgres to
 * reject a bad key, went down with it. Measured on 2026-08-08: TLS completing in 41 ms and
 * then zero bytes, on every path.
 *
 * So the split is now explicit, and it is the standard one:
 *
 *   GET /health         LIVENESS.  200 whenever this process can answer. The database's
 *                       real state is REPORTED IN THE BODY, never hidden — a reader still
 *                       learns the truth, but a dependency outage no longer removes the
 *                       service from the internet.
 *   GET /health/ready   READINESS. 503 when the database is down. For a monitor or a
 *                       deploy gate that genuinely wants "can this serve a full request",
 *                       and for a human asking the same question.
 *
 * `ok` keeps its old meaning — "everything this service depends on is working" — because
 * that is what every existing reader of this payload was told it means. What changed is the
 * STATUS CODE on the liveness path, not the honesty of the body. Absent is not collapsed
 * into fine: `db` still carries `up` / `down` / `skipped` exactly as before.
 */

export const healthRoutes = new Hono();

async function snapshot(): Promise<HealthResponse> {
  const db = await checkDb();
  const dbError = db === 'down' ? getLastDbError() : null;
  /*
   * THE EDIT, NOT JUST THE SYMPTOM. `dbError` names what the network did; this names what
   * the operator should change. Derived by READING `DATABASE_URL`, so it is present even
   * when nothing answers — which is the only case where anyone needs it.
   *
   * Only when `db` is down, and only when there is something to say: a defect-free string
   * adds no field, so a healthy deployment publishes nothing extra. See `DbConfigVerdict`
   * for why this carries no part of the URL.
   */
  const hint = db === 'down' ? describeConnectionTarget(env.databaseUrl) : null;
  const dbHint = hint && hint.severity !== 'none' ? hint : null;
  return {
    ok: db === 'up' || db === 'skipped',
    ...(dbError ? { dbError } : {}),
    ...(dbHint ? { dbHint } : {}),
    service: 'lcx-sales-api',
    version: env.version,
    env: env.nodeEnv,
    db,
    /*
     * `process.uptime()`, not a module-load timestamp: it is the real process age from the
     * runtime, so it cannot be fooled by a module being re-imported. This is what makes
     * "has my environment change actually deployed yet?" answerable from outside.
     */
    uptimeSeconds: Math.round(process.uptime()),
    /* Read from the LIVE pool rather than re-derived from the URL: what was negotiated is the
       only thing worth reporting, and re-deciding it here could disagree with reality. */
    dbTls: getDbTlsState(),
    /* 'pooler-fallback' means the CONFIGURED value is not the value in use. That divergence
       must be visible or the next person inherits a system whose config does not describe it. */
    dbUrlSource: getDbUrlSource(),
    /* Only present when the self-repair actually failed, and it names WHICH failure: a rejected
       password and an unreachable region look identical from here otherwise, and they were
       conflated for a day. Omitted rather than null so a clean boot carries no noise. */
    ...(() => { const f = getDbHealFailure(); return f ? { dbHealFailure: f } : {}; })(),
    /* A hop COUNT, never a header value or an address. `TRUSTED_PROXY_HOPS` lives in a dashboard
       that cannot be read back, and an unverifiable security control is one nobody can check. */
    throttleKey: (() => { const n = trustedProxyHops(); return n > 0 ? `xff-last-${n}` : 'tcp-peer'; })(),
    /*
     * ── WHAT SHAPE IS THE CONFIGURED URL? Added because a save that did not land is
     * indistinguishable from a save that landed and failed. ─────────────────────────────
     *
     * A credential was proven to connect from the owner's laptop — session pooler, role
     * postgres, 142 tables — then pasted into the dashboard. The service restarted (uptime
     * fell 208s to 27s, observed) and still reported SUPABASE_DIRECT_HOST_IS_IPV6_ONLY. Two
     * explanations fit that equally: the value never changed, or it changed to something that
     * still names the direct host. From outside the process they look identical, and each
     * round of guessing costs a deploy.
     *
     * So the SHAPE of the configured URL is reported, and only the shape. No host, no user,
     * no ref, no password — the three booleans and a length are enough to distinguish every
     * case that has actually occurred, and none of them is a credential:
     *   pooler   false ⇒ the direct host is still configured, whatever was pasted
     *   userRef  false ⇒ pooler host but username is plain `postgres`, which answers XX000
     *   len            ⇒ a mangled paste (appended rather than replaced) shows as a length
     *                    far above the ~120 a real string has
     *
     * `dbHint` already tells the world this is a Supabase direct host, so this adds no fact an
     * attacker did not have.
     */
    dbUrlShape: (() => {
      const raw = process.env.DATABASE_URL ?? '';
      if (raw === '') return { configured: false } as const;
      /* Parsed with URL, not a regex: a regex over a credential is how a password with a `@`
         in it gets read as a hostname. A value URL cannot parse is itself the finding. */
      try {
        const u = new URL(raw);
        return {
          configured: true,
          pooler: u.hostname.endsWith('.pooler.supabase.com'),
          direct: /^db\..*\.supabase\.co$/.test(u.hostname),
          port: u.port || '(default)',
          userRef: u.username.includes('.'),
          len: raw.length,
        } as const;
      } catch {
        return { configured: true, parses: false, len: raw.length } as const;
      }
    })(),
    /* WHY A SIGN-IN IS BEING REFUSED, when the credential itself is fine. Read from env, so it
       reflects the running process rather than what anyone believes is configured. */
    authPaths: {
      deskPasscode: env.deskPasscodeIsPublicDefault ? 'refused-public-default' : 'open',
      secondTier: env.secondaryPasscode ? 'open' : 'disabled',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * LIVENESS. Always 200 while the process can answer.
 *
 * `checkDb` carries its own hard 2-second deadline, so this responds promptly even when the
 * database is unreachable — the previous version could hang indefinitely on a half-open
 * socket, which is what actually caused the outage rather than the status code alone.
 */
healthRoutes.get('/', async (c) => c.json(await snapshot(), 200));

/** READINESS. 503 when a dependency is down — for monitors, not for the load balancer. */
healthRoutes.get('/ready', async (c) => {
  const body = await snapshot();
  return c.json(body, body.ok ? 200 : 503);
});
