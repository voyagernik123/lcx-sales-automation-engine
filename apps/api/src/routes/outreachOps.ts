/**
 * Phase-4 outreach operations API.
 *   4-2 throttling/anti-burn   → /domains
 *   4-4 mailbox health         → /mailbox-health
 *   4-5 A/B testing            → /ab-tests
 *   4-8 warmup (bookkeeping)   → /accounts
 *
 * Mount at /v1/outreach-ops. LinkedIn endpoints here are account management +
 * warmup only — never sending.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb, getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { listDomains, adaptiveCap } from '../outreach/throttle.js';
import { computeMailboxHealth } from '../outreach/mailboxHealth.js';
import { listTests, createTest, computeSignificance } from '../outreach/abtest.js';
import { warmupPlan } from '../outreach/warmup.js';

export const outreachOpsRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/* ── 4-2  Sending domains / throttling ───────────────────────────── */

/** GET /v1/outreach-ops/domains — every sending domain with its budget. */
outreachOpsRoutes.get('/domains', requireOperator, async (c) => {
  try {
    const data = await listDomains();
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] domains list error:', err);
    return c.json({ error: 'Failed to list domains', code: 'DOMAINS_ERROR' }, 500);
  }
});

/** POST /v1/outreach-ops/domains — create or update a sending domain. */
outreachOpsRoutes.post('/domains', requireOperator, async (c) => {
  const db = getDb();
  try {
    const body = (await c.req.json<{ domain?: string; dailyCap?: number }>().catch(() => ({} as never))) as { domain?: string; dailyCap?: number };
    const domain = (body.domain ?? '').trim().toLowerCase();
    if (!domain) return c.json({ error: 'domain is required', code: 'VALIDATION' }, 400);
    const dailyCap = Math.max(0, Math.floor(Number(body.dailyCap ?? 50)));

    const res = await db.execute(sql`
      INSERT INTO sending_domains (id, domain, daily_cap)
      VALUES (${randomUUID()}, ${domain}, ${dailyCap})
      ON CONFLICT (domain) DO UPDATE SET daily_cap = ${dailyCap}, updated_at = NOW()
      RETURNING *
    `);
    const r = (res.rows ?? [])[0] as Record<string, unknown>;
    return c.json({
      data: {
        id: r.id,
        domain: r.domain,
        dailyCap: Number(r.daily_cap ?? 0),
        sentToday: Number(r.sent_today ?? 0),
        reputationScore: Number(r.reputation_score ?? 0),
        status: r.status,
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[outreach-ops] domain upsert error:', err);
    return c.json({ error: 'Failed to save domain', code: 'DOMAIN_SAVE_ERROR' }, 500);
  }
});

/** POST /v1/outreach-ops/domains/:id/pause — pause (anti-burn kill switch). */
outreachOpsRoutes.post('/domains/:id/pause', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  try {
    const body = (await c.req.json<{ resume?: boolean }>().catch(() => ({} as never))) as { resume?: boolean };
    const status = body.resume ? 'active' : 'paused';
    const res = await db.execute(sql`
      UPDATE sending_domains SET status = ${status}, updated_at = NOW()
      WHERE id = ${id} RETURNING id, domain, status
    `);
    const r = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!r) return c.json({ error: 'Domain not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: { id: r.id, domain: r.domain, status: r.status }, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] domain pause error:', err);
    return c.json({ error: 'Failed to pause domain', code: 'DOMAIN_PAUSE_ERROR' }, 500);
  }
});

/** POST /v1/outreach-ops/domains/:id/recompute — re-run the adaptive cap. */
outreachOpsRoutes.post('/domains/:id/recompute', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  try {
    const row = (
      await db.execute(sql`SELECT domain FROM sending_domains WHERE id = ${id} LIMIT 1`)
    ).rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: 'Domain not found', code: 'NOT_FOUND' }, 404);
    const result = await adaptiveCap(String(row.domain));
    return c.json({ data: result, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] adaptive cap error:', err);
    return c.json({ error: 'Failed to recompute cap', code: 'ADAPTIVE_CAP_ERROR' }, 500);
  }
});

/* ── 4-4  Mailbox health ─────────────────────────────────────────── */

/** GET /v1/outreach-ops/mailbox-health — per-domain deliverability. */
outreachOpsRoutes.get('/mailbox-health', requireOperator, async (c) => {
  try {
    const windowDays = Number(c.req.query('windowDays')) || 30;
    const report = await computeMailboxHealth(getPool(), windowDays);
    return c.json({ data: report, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] mailbox health error:', err);
    return c.json({ error: 'Failed to compute mailbox health', code: 'MAILBOX_HEALTH_ERROR' }, 500);
  }
});

/* ── 4-5  A/B testing ────────────────────────────────────────────── */

/** GET /v1/outreach-ops/ab-tests — list tests. */
outreachOpsRoutes.get('/ab-tests', requireOperator, async (c) => {
  try {
    const data = await listTests();
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] ab-tests list error:', err);
    return c.json({ error: 'Failed to list tests', code: 'ABTESTS_ERROR' }, 500);
  }
});

/** POST /v1/outreach-ops/ab-tests — create a test. */
outreachOpsRoutes.post('/ab-tests', requireOperator, async (c) => {
  try {
    const body = (await c.req.json<{ name?: string; variants?: string[]; metric?: string }>().catch(() => ({} as never))) as { name?: string; variants?: string[]; metric?: string };
    const name = (body.name ?? '').trim();
    const variants = Array.isArray(body.variants)
      ? body.variants.map((v) => String(v).trim()).filter(Boolean)
      : [];
    if (!name) return c.json({ error: 'name is required', code: 'VALIDATION' }, 400);
    if (variants.length < 2)
      return c.json({ error: 'at least 2 variants required', code: 'VALIDATION' }, 400);
    const data = await createTest({ name, variants, metric: body.metric });
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] ab-test create error:', err);
    return c.json({ error: 'Failed to create test', code: 'ABTEST_CREATE_ERROR' }, 500);
  }
});

/** GET /v1/outreach-ops/ab-tests/:id/results — significance + per-variant stats. */
outreachOpsRoutes.get('/ab-tests/:id/results', requireOperator, async (c) => {
  const { id } = c.req.param();
  try {
    const data = await computeSignificance(id);
    if (!data) return c.json({ error: 'Test not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] ab-test results error:', err);
    return c.json({ error: 'Failed to compute results', code: 'ABTEST_RESULTS_ERROR' }, 500);
  }
});

/* ── 4-8  LinkedIn accounts / warmup ─────────────────────────────── */

/** GET /v1/outreach-ops/accounts — LinkedIn accounts (bookkeeping only). */
outreachOpsRoutes.get('/accounts', requireOperator, async (c) => {
  const db = getDb();
  try {
    const res = await db.execute(sql`SELECT * FROM linkedin_accounts ORDER BY created_at DESC`);
    return c.json({
      data: (res.rows ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id,
          name: r.name,
          sessionStatus: r.session_status,
          dailyWarmupTarget: Number(r.daily_warmup_target ?? 0),
          warmupDay: Number(r.warmup_day ?? 0),
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      }),
      meta: meta(),
    });
  } catch (err) {
    console.error('[outreach-ops] accounts list error:', err);
    return c.json({ error: 'Failed to list accounts', code: 'ACCOUNTS_ERROR' }, 500);
  }
});

/** POST /v1/outreach-ops/accounts — create/update a LinkedIn account. */
outreachOpsRoutes.post('/accounts', requireOperator, async (c) => {
  const db = getDb();
  try {
    const body = (await c.req.json<{
        id?: string;
        name?: string;
        sessionStatus?: string;
        dailyWarmupTarget?: number;
        warmupDay?: number;
        status?: string;
      }>().catch(() => ({} as never))) as {
        id?: string;
        name?: string;
        sessionStatus?: string;
        dailyWarmupTarget?: number;
        warmupDay?: number;
        status?: string;
      };
    const name = (body.name ?? '').trim();
    if (!name && !body.id) return c.json({ error: 'name is required', code: 'VALIDATION' }, 400);
    const dailyWarmupTarget = Math.max(1, Math.floor(Number(body.dailyWarmupTarget ?? 20)));
    const warmupDay = Math.max(1, Math.floor(Number(body.warmupDay ?? 1)));
    const sessionStatus = (body.sessionStatus ?? 'unknown').trim();
    const status = (body.status ?? 'warming').trim();

    let res;
    if (body.id) {
      res = await db.execute(sql`
        UPDATE linkedin_accounts SET
          name = COALESCE(NULLIF(${name}, ''), name),
          session_status = ${sessionStatus},
          daily_warmup_target = ${dailyWarmupTarget},
          warmup_day = ${warmupDay},
          status = ${status},
          updated_at = NOW()
        WHERE id = ${body.id}
        RETURNING *
      `);
    } else {
      res = await db.execute(sql`
        INSERT INTO linkedin_accounts
          (id, name, session_status, daily_warmup_target, warmup_day, status)
        VALUES (${randomUUID()}, ${name}, ${sessionStatus}, ${dailyWarmupTarget}, ${warmupDay}, ${status})
        RETURNING *
      `);
    }
    const r = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!r) return c.json({ error: 'Account not found', code: 'NOT_FOUND' }, 404);
    return c.json({
      data: {
        id: r.id,
        name: r.name,
        sessionStatus: r.session_status,
        dailyWarmupTarget: Number(r.daily_warmup_target ?? 0),
        warmupDay: Number(r.warmup_day ?? 0),
        status: r.status,
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[outreach-ops] account save error:', err);
    return c.json({ error: 'Failed to save account', code: 'ACCOUNT_SAVE_ERROR' }, 500);
  }
});

/** GET /v1/outreach-ops/accounts/:id/warmup-plan — deterministic ramp schedule. */
outreachOpsRoutes.get('/accounts/:id/warmup-plan', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  try {
    const row = (
      await db.execute(sql`SELECT * FROM linkedin_accounts WHERE id = ${id} LIMIT 1`)
    ).rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: 'Account not found', code: 'NOT_FOUND' }, 404);
    const plan = warmupPlan({
      id: String(row.id),
      name: String(row.name),
      dailyWarmupTarget: Number(row.daily_warmup_target ?? 20),
      warmupDay: Number(row.warmup_day ?? 1),
      status: String(row.status ?? 'warming'),
    });
    return c.json({ data: plan, meta: meta() });
  } catch (err) {
    console.error('[outreach-ops] warmup plan error:', err);
    return c.json({ error: 'Failed to build warmup plan', code: 'WARMUP_PLAN_ERROR' }, 500);
  }
});
