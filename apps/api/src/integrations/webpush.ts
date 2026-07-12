import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

// VAPID keys read directly from process.env (shared env module untouched).
// When both are set, real delivery would require the 'web-push' library — we
// intentionally do NOT add that dependency here; sendWebPush stays a logged
// no-op stub and documents what a real integration needs.
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? '';

export const webPushConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

export interface PushSubscriptionInput {
  endpoint: string;
  keys: Record<string, string>; // { p256dh, auth }
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  keys: Record<string, string>;
  createdAt: string;
}

export async function storeSubscription(input: PushSubscriptionInput): Promise<PushSubscriptionRow> {
  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO web_push_subscriptions (id, endpoint, keys)
    VALUES (${randomUUID()}, ${input.endpoint}, ${JSON.stringify(input.keys ?? {})}::jsonb)
    ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys
    RETURNING id, endpoint, keys, created_at
  `);
  const r = result.rows[0] as Record<string, unknown>;
  return {
    id: r.id as string,
    endpoint: r.endpoint as string,
    keys: (r.keys as Record<string, string>) ?? {},
    createdAt: r.created_at as string,
  };
}

export interface WebPushResult {
  delivered: boolean;
  reason: string;
  recipients: number;
}

/**
 * MOCK / no-op web-push sender.
 *
 * Real delivery would iterate stored subscriptions and call
 * `webpush.sendNotification(subscription, payload)` from the 'web-push' npm
 * package, configured with the VAPID key pair. That dependency is intentionally
 * NOT added — this stub logs the intent instead so the feature compiles and
 * runs with no credentials.
 */
export async function sendWebPush(payload: { title: string; body?: string; href?: string }): Promise<WebPushResult> {
  const db = getDb();
  const subs = await db.execute(sql`SELECT COUNT(*)::int AS n FROM web_push_subscriptions`);
  const recipients = Number((subs.rows[0] as Record<string, unknown>)?.n ?? 0);

  if (!webPushConfigured) {
    console.warn('[webpush] VAPID keys not set — skipping send (mock no-op)', { title: payload.title, recipients });
    return { delivered: false, reason: 'vapid_not_configured', recipients };
  }

  // Configured, but the 'web-push' library is not installed by design.
  console.warn('[webpush] VAPID configured but "web-push" lib not installed — logging only', {
    title: payload.title,
    body: payload.body,
    href: payload.href,
    recipients,
  });
  return { delivered: false, reason: 'web_push_lib_not_installed', recipients };
}

// ── Notification preferences ──

export interface NotificationPreference {
  rule: string;
  enabled: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreference[] = [
  { rule: 'deal_stalled', enabled: true },
  { rule: 'competitor_listing', enabled: true },
  { rule: 'discovery_found', enabled: true },
  { rule: 'reply_received', enabled: true },
  { rule: 'meeting_booked', enabled: true },
];

export async function listPreferences(): Promise<NotificationPreference[]> {
  const db = getDb();
  // Seed defaults idempotently so the UI always has toggles to show.
  for (const p of DEFAULT_PREFERENCES) {
    await db.execute(sql`
      INSERT INTO notification_preferences (id, rule, enabled)
      VALUES (${randomUUID()}, ${p.rule}, ${p.enabled})
      ON CONFLICT (rule) DO NOTHING
    `);
  }
  const result = await db.execute(sql`
    SELECT rule, enabled FROM notification_preferences ORDER BY rule
  `);
  return (result.rows ?? []).map((r: Record<string, unknown>) => ({
    rule: r.rule as string,
    enabled: Boolean(r.enabled),
  }));
}

export async function setPreference(rule: string, enabled: boolean): Promise<NotificationPreference> {
  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO notification_preferences (id, rule, enabled)
    VALUES (${randomUUID()}, ${rule}, ${enabled})
    ON CONFLICT (rule) DO UPDATE SET enabled = EXCLUDED.enabled
    RETURNING rule, enabled
  `);
  const r = result.rows[0] as Record<string, unknown>;
  return { rule: r.rule as string, enabled: Boolean(r.enabled) };
}
