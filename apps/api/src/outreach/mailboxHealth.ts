/**
 * 4-4 — Mailbox health monitoring.
 *
 * Real per-domain bounce / complaint / delivery rates computed straight from the
 * `messages` table, with threshold-based status and an auto-pause suggestion.
 *
 * The messages row records the recipient (to_email) but not our sending domain,
 * so we group by the recipient domain — the practical signal available for
 * spotting where deliverability is degrading. Read-only: this never sends.
 */
import type { Pool } from 'pg';

export type MailboxStatus = 'healthy' | 'at_risk' | 'critical';

export interface MailboxDomainHealth {
  domain: string;
  total: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  status: MailboxStatus;
  suggestPause: boolean;
  reason: string;
}

export interface MailboxHealthReport {
  windowDays: number;
  domains: MailboxDomainHealth[];
  overall: {
    total: number;
    delivered: number;
    bounced: number;
    complained: number;
    bounceRate: number;
    complaintRate: number;
    status: MailboxStatus;
  };
}

// Industry-standard deliverability guardrails.
const BOUNCE_CRITICAL = 0.1;
const BOUNCE_WARN = 0.05;
const COMPLAINT_CRITICAL = 0.005;
const COMPLAINT_WARN = 0.001;
const MIN_SAMPLE = 10; // below this we don't cry wolf on a couple of bounces

function classify(bounceRate: number, complaintRate: number, sample: number): {
  status: MailboxStatus;
  suggestPause: boolean;
  reason: string;
} {
  if (sample < MIN_SAMPLE) {
    return { status: 'healthy', suggestPause: false, reason: 'too few sends to assess' };
  }
  if (bounceRate > BOUNCE_CRITICAL || complaintRate > COMPLAINT_CRITICAL) {
    return {
      status: 'critical',
      suggestPause: true,
      reason:
        bounceRate > BOUNCE_CRITICAL
          ? `bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds 10%`
          : `complaint rate ${(complaintRate * 100).toFixed(2)}% exceeds 0.5%`,
    };
  }
  if (bounceRate > BOUNCE_WARN || complaintRate > COMPLAINT_WARN) {
    return {
      status: 'at_risk',
      suggestPause: false,
      reason: 'bounce/complaint rate approaching limits — slow down',
    };
  }
  return { status: 'healthy', suggestPause: false, reason: 'within limits' };
}

/**
 * Compute the mailbox health report. Takes a pg Pool directly (per spec) so it
 * can run outside a Drizzle context (e.g. from a scheduled job).
 */
export async function computeMailboxHealth(
  pool: Pool,
  windowDays = 30,
): Promise<MailboxHealthReport> {
  const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : 30;

  const { rows } = await pool.query(
    `SELECT
       split_part(to_email, '@', 2) AS domain,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE sent_at IS NOT NULL OR status IN ('sent','delivered','bounced','complained')) AS sent,
       COUNT(*) FILTER (WHERE delivered_at IS NOT NULL OR status = 'delivered') AS delivered,
       COUNT(*) FILTER (WHERE bounced_at IS NOT NULL OR status = 'bounced') AS bounced,
       COUNT(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained') AS complained
     FROM messages
     WHERE provider = 'resend'
       AND created_at > NOW() - ($1 || ' days')::interval
       AND to_email IS NOT NULL AND to_email <> ''
     GROUP BY 1
     ORDER BY total DESC`,
    [String(days)],
  );

  const domains: MailboxDomainHealth[] = rows.map((r: Record<string, unknown>) => {
    const total = Number(r.total ?? 0);
    const sent = Number(r.sent ?? 0);
    const delivered = Number(r.delivered ?? 0);
    const bounced = Number(r.bounced ?? 0);
    const complained = Number(r.complained ?? 0);
    const denom = sent > 0 ? sent : total;
    const bounceRate = denom > 0 ? bounced / denom : 0;
    const complaintRate = denom > 0 ? complained / denom : 0;
    const deliveryRate = denom > 0 ? delivered / denom : 0;
    const { status, suggestPause, reason } = classify(bounceRate, complaintRate, denom);
    return {
      domain: String(r.domain ?? 'unknown'),
      total,
      sent,
      delivered,
      bounced,
      complained,
      deliveryRate,
      bounceRate,
      complaintRate,
      status,
      suggestPause,
      reason,
    };
  });

  const agg = domains.reduce(
    (a, d) => {
      a.total += d.total;
      a.delivered += d.delivered;
      a.bounced += d.bounced;
      a.complained += d.complained;
      a.sent += d.sent;
      return a;
    },
    { total: 0, delivered: 0, bounced: 0, complained: 0, sent: 0 },
  );
  const denom = agg.sent > 0 ? agg.sent : agg.total;
  const bounceRate = denom > 0 ? agg.bounced / denom : 0;
  const complaintRate = denom > 0 ? agg.complained / denom : 0;
  const overallStatus = classify(bounceRate, complaintRate, denom).status;

  return {
    windowDays: days,
    domains,
    overall: {
      total: agg.total,
      delivered: agg.delivered,
      bounced: agg.bounced,
      complained: agg.complained,
      bounceRate,
      complaintRate,
      status: overallStatus,
    },
  };
}
