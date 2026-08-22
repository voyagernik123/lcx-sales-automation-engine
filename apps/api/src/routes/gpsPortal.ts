import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  PORTAL_SESSION_DAYS_DEFAULT,
  isPortalMigrated,
  listPortalSessions,
  mintPortalSession,
  revokePortalSession,
} from '../portal/service.js';

/**
 * PORTAL ADMINISTRATION — the DESK side of G4, inside the gps compartment gate.
 *
 *   POST /portal-admin/engagements/:id/invite     mint a magic link (approver act)
 *   GET  /portal-admin/engagements/:id/sessions   who holds a link, since when, until when
 *   POST /portal-admin/sessions/:sid/revoke       kill a link, attributed
 *
 * ── MINTING IS A CREDENTIAL ISSUANCE, SO IT TAKES AN APPROVER ────────────────
 * A magic link is the client plane's entire authentication. Cutting one is the
 * same class of act as approving a founder packet — requireOperator AND
 * requireApprover, the packet-decide stack — and the response carries the token
 * EXACTLY ONCE. It is not stored, not logged, and not readable back: the sessions
 * list shows digest-backed metadata only. The approver carries the link to the
 * client themselves (email machinery is a later decision); the system records who
 * cut it, for whom, and until when.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const NOT_MIGRATED = {
  error: 'The portal does not exist on this environment. Apply 0080_gps_portal.sql.',
  code: 'PORTAL_REGISTER_ABSENT',
} as const;

export const gpsPortalAdminRoutes = new Hono<{ Variables: AuthVariables }>();

gpsPortalAdminRoutes.post('/engagements/:id/invite', requireOperator, requireApprover, async (c) => {
  try {
    const engagementId = c.req.param('id');
    let label = '';
    let days = PORTAL_SESSION_DAYS_DEFAULT;
    try {
      const parsed = await c.req.json();
      label = typeof parsed?.label === 'string' ? parsed.label.trim().slice(0, 254) : '';
      if (typeof parsed?.days === 'number' && Number.isFinite(parsed.days)) days = parsed.days;
    } catch { /* refused below */ }
    if (label === '') {
      return c.json({
        error: 'label is required — who this link is for, in your words. It becomes the attribution on every act the holder performs.',
        code: 'VALIDATION',
      }, 400);
    }
    const pool = getPool();
    if ((await isPortalMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);

    const operator = c.get('operator');
    const out = await mintPortalSession(pool, { engagementId, label, days, mintedBy: operator?.id ?? 'unknown' });
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, 404);
    return c.json({
      data: {
        sessionId: out.sessionId,
        /* ══ SHOWN ONCE. The server holds a digest; this value cannot be re-read. ══ */
        url: `/portal#t=${out.token}`,
        expiresAt: out.expiresAt,
        shownOnce: true,
      },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] portal invite error:', err);
    return c.json({ error: 'Invite failed — no link was minted', code: 'GPS_ERROR' }, 500);
  }
});

gpsPortalAdminRoutes.get('/engagements/:id/sessions', requireOperator, async (c) => {
  try {
    const pool = getPool();
    const present = await isPortalMigrated(pool);
    if (present !== true) {
      return c.json({ data: { sessions: [], registerPresent: present }, meta: { ...meta(), migrated: false } });
    }
    const sessions = await listPortalSessions(pool, c.req.param('id'));
    return c.json({ data: { sessions, registerPresent: true }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] portal sessions error:', err);
    return c.json({ error: 'Failed to list sessions', code: 'GPS_ERROR' }, 500);
  }
});

gpsPortalAdminRoutes.post('/sessions/:sid/revoke', requireOperator, requireApprover, async (c) => {
  try {
    const pool = getPool();
    if ((await isPortalMigrated(pool)) !== true) return c.json(NOT_MIGRATED, 503);
    const operator = c.get('operator');
    const out = await revokePortalSession(pool, c.req.param('sid'), operator?.id ?? 'unknown');
    if (out === 'NOT_FOUND') return c.json({ error: 'no such session', code: 'NOT_FOUND' }, 404);
    if (out === 'ALREADY_REVOKED') return c.json({ error: 'already revoked — a revocation is not re-revoked', code: 'ALREADY_REVOKED' }, 409);
    return c.json({ data: { revoked: true }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[gps] portal revoke error:', err);
    return c.json({ error: 'Revocation failed', code: 'GPS_ERROR' }, 500);
  }
});
