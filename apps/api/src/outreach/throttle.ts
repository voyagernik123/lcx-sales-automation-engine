/**
 * 4-2 — Smart throttling + anti-burn for the (email) auto-send path.
 *
 * Picks a sendable sending domain, records sends against its daily budget, and
 * adaptively lowers a domain's cap when the recent bounce rate is high. All
 * state lives in the `sending_domains` table (see migration 0022).
 *
 * NOTE: only the email channel auto-sends. LinkedIn/Telegram are human-sent via
 * the Send Queue and never touch this throttle.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

export interface SendingDomain {
  id: string;
  domain: string;
  dailyCap: number;
  sentToday: number;
  reputationScore: number;
  status: 'active' | 'paused' | string;
  lastResetAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function mapDomain(r: Record<string, unknown>): SendingDomain {
  return {
    id: String(r.id),
    domain: String(r.domain),
    dailyCap: Number(r.daily_cap ?? 0),
    sentToday: Number(r.sent_today ?? 0),
    reputationScore: Number(r.reputation_score ?? 0),
    status: String(r.status ?? 'active'),
    lastResetAt: (r.last_reset_at as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

/**
 * Roll the per-day counter over when last_reset_at is on an earlier calendar
 * day. Keeps sent_today meaningful without a separate cron.
 */
async function resetStaleCounters(): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    UPDATE sending_domains
    SET sent_today = 0, last_reset_at = NOW(), updated_at = NOW()
    WHERE last_reset_at < date_trunc('day', NOW())
  `);
}

/** List every sending domain (highest reputation first). */
export async function listDomains(): Promise<SendingDomain[]> {
  const db = getDb();
  await resetStaleCounters();
  const res = await db.execute(sql`
    SELECT * FROM sending_domains
    ORDER BY status = 'active' DESC, reputation_score DESC, domain ASC
  `);
  return (res.rows ?? []).map((r) => mapDomain(r as Record<string, unknown>));
}

/**
 * The next domain we're allowed to send from: active, under its daily cap,
 * ranked by reputation then remaining headroom. Returns null when everything is
 * paused or capped out (caller should skip sending).
 */
export async function getSendableDomain(): Promise<SendingDomain | null> {
  const db = getDb();
  await resetStaleCounters();
  const res = await db.execute(sql`
    SELECT * FROM sending_domains
    WHERE status = 'active' AND sent_today < daily_cap
    ORDER BY reputation_score DESC, (daily_cap - sent_today) DESC
    LIMIT 1
  `);
  const row = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
  return row ? mapDomain(row) : null;
}

/** Charge one send against a domain's daily budget. Returns the updated row. */
export async function recordSend(domain: string): Promise<SendingDomain | null> {
  const db = getDb();
  const res = await db.execute(sql`
    UPDATE sending_domains
    SET sent_today = sent_today + 1, updated_at = NOW()
    WHERE domain = ${domain} AND status = 'active'
    RETURNING *
  `);
  const row = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
  return row ? mapDomain(row) : null;
}

export interface AdaptiveCapResult {
  domain: string;
  previousCap: number;
  newCap: number;
  reputationScore: number;
  bounceRate: number;
  complaintRate: number;
  sampleSize: number;
  reason: string;
}

/**
 * Recompute a domain's daily cap + reputation from the recent bounce/complaint
 * signal in `messages`. High bounce rate ratchets the cap down and dents
 * reputation; a clean history lets the cap recover toward 50.
 *
 * The messages table doesn't tag a sending domain, so the bounce signal is the
 * recent resend-channel rate (a shared-infrastructure proxy). Deterministic.
 */
export async function adaptiveCap(domain: string): Promise<AdaptiveCapResult | null> {
  const db = getDb();
  const current = (
    await db.execute(sql`SELECT * FROM sending_domains WHERE domain = ${domain} LIMIT 1`)
  ).rows?.[0] as Record<string, unknown> | undefined;
  if (!current) return null;

  const prevCap = Number(current.daily_cap ?? 50);

  const stats = (
    await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sent_at IS NOT NULL OR status IN ('sent','delivered','bounced','complained')) AS sent,
        COUNT(*) FILTER (WHERE bounced_at IS NOT NULL OR status = 'bounced') AS bounced,
        COUNT(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained') AS complained
      FROM messages
      WHERE provider = 'resend' AND created_at > NOW() - INTERVAL '14 days'
    `)
  ).rows?.[0] as Record<string, unknown> | undefined;

  const sent = Number(stats?.sent ?? 0);
  const bounced = Number(stats?.bounced ?? 0);
  const complained = Number(stats?.complained ?? 0);
  const bounceRate = sent > 0 ? bounced / sent : 0;
  const complaintRate = sent > 0 ? complained / sent : 0;

  // Reputation: start at 100, dock heavily for bounces and complaints.
  const reputationScore = Math.max(
    0,
    Math.min(100, Math.round(100 - bounceRate * 400 - complaintRate * 2000)),
  );

  // Cap policy. With no signal yet, leave the cap alone.
  let newCap = prevCap;
  let reason = 'insufficient signal — cap unchanged';
  if (sent >= 20) {
    if (bounceRate > 0.1 || complaintRate > 0.005) {
      newCap = Math.max(5, Math.floor(prevCap * 0.5));
      reason = 'high bounce/complaint rate — cap halved';
    } else if (bounceRate > 0.05 || complaintRate > 0.001) {
      newCap = Math.max(10, Math.floor(prevCap * 0.75));
      reason = 'elevated bounce/complaint rate — cap reduced';
    } else if (bounceRate < 0.02 && prevCap < 50) {
      newCap = Math.min(50, prevCap + 10);
      reason = 'clean history — cap recovering';
    } else {
      reason = 'healthy — cap held';
    }
  }

  await db.execute(sql`
    UPDATE sending_domains
    SET daily_cap = ${newCap}, reputation_score = ${reputationScore}, updated_at = NOW()
    WHERE domain = ${domain}
  `);

  return {
    domain,
    previousCap: prevCap,
    newCap,
    reputationScore,
    bounceRate,
    complaintRate,
    sampleSize: sent,
    reason,
  };
}
