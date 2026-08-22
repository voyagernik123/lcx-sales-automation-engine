import { Hono } from 'hono';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  isPortalMigrated,
  portalAcceptDeliverable,
  portalEngagementView,
  recordPortalEvent,
  resolvePortalToken,
  submitPortalFacts,
  uploadGateState,
  type PortalSessionRow,
} from '../portal/service.js';

/**
 * THE PORTAL SURFACE — /v1/portal/*, the client's own country (G4, doctrine D9).
 *
 *   GET  /v1/portal/engagement            the scoped view: proposal, milestones, deliverables, facts
 *   POST /v1/portal/facts                 typed answers to the offer's own requested inputs
 *   POST /v1/portal/deliverables/:id/accept   the client acceptance that arms invoicing (G6)
 *   POST /v1/portal/upload-intent         records readiness; the byte door stays shut (see below)
 *
 * ── ONE PRINCIPAL, ONE ENGAGEMENT, NO CROSSOVER ──────────────────────────────
 * The bearer token is a magic-link session minted by an internal approver and
 * scoped to a single engagement. There is no `operator` on this surface and no
 * portal session is accepted by any internal route: the two planes share a
 * database and nothing else. Every handler below reads its engagement id from the
 * SESSION, never from the request — a portal client cannot name a row.
 *
 * ── RATE BUDGET, SEPARATE FROM EVERYONE ELSE'S ───────────────────────────────
 * Per-IP and per-session buckets, both process-local, same shape as the public
 * intake's. A client plane with the desk's budget is a client plane that can
 * starve the desk.
 *
 * ── NO BYTES. NOT A PARSER, NOT A STREAM, NOT A FIELD ────────────────────────
 * Every body here is c.req.json() of typed, capped strings. The upload endpoint
 * answers with the DPO gate's three honest states and records an INTENT event;
 * the day the dpo_memo decision is approved AND permits processor-basis holding,
 * the byte path ships in the same commit as the DPA it requires — through the
 * artifact machinery's bounded reader, not a second door here.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const NOT_MIGRATED = {
  error: 'The portal does not exist on this environment. Apply 0080_gps_portal.sql.',
  code: 'PORTAL_REGISTER_ABSENT',
} as const;

/* Same bucket shape as servicesIntake.ts, separate budget: the client plane pays
   from its own pocket. */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 120;
const MAX_PER_SESSION = 60;
const ipHits = new Map<string, number[]>();
const sessionHits = new Map<string, number[]>();

function overLimit(map: Map<string, number[]>, key: string, ceiling: number, nowMs: number): boolean {
  const list = (map.get(key) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  list.push(nowMs);
  map.set(key, list);
  if (map.size > 10_000) {
    for (const [k, v] of map) if (v.every((t) => nowMs - t >= WINDOW_MS)) map.delete(k);
  }
  return list.length > ceiling;
}

type PortalVars = { Variables: { portalSession: PortalSessionRow } };

export const portalRoutes = new Hono<PortalVars>();

/**
 * The gate. Bearer token → digest lookup → expiry/revocation, on EVERY request.
 * The three refusal codes are deliberately distinct on the wire: a client whose
 * link expired needs a different sentence from one whose link was revoked, and
 * collapsing them teaches the client to email the desk a screenshot instead.
 */
portalRoutes.use('*', async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (overLimit(ipHits, ip, MAX_PER_IP, Date.now())) {
    return c.json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' }, 429);
  }
  const pool = getPool();
  const present = await isPortalMigrated(pool);
  if (present !== true) return c.json(NOT_MIGRATED, 503);

  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token === '') {
    return c.json({ error: 'This surface answers to a portal link only.', code: 'SESSION_REQUIRED' }, 401);
  }
  const resolved = await resolvePortalToken(pool, token);
  if (!resolved.ok) {
    const sentence = {
      SESSION_INVALID: 'This link is not recognised. Ask the desk for a fresh invite.',
      SESSION_EXPIRED: 'This link has expired. Ask the desk for a fresh invite — nothing you submitted is lost.',
      SESSION_REVOKED: 'This link was revoked by the desk. If that is unexpected, contact them directly.',
    }[resolved.code];
    return c.json({ error: sentence, code: resolved.code }, 401);
  }
  if (overLimit(sessionHits, resolved.session.id, MAX_PER_SESSION, Date.now())) {
    return c.json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' }, 429);
  }
  c.set('portalSession', resolved.session);
  await next();
});

portalRoutes.get('/engagement', async (c) => {
  try {
    const pool = getPool();
    const session = c.get('portalSession');
    const view = await portalEngagementView(pool, session);
    if (view === null) {
      return c.json({ error: 'This engagement no longer exists.', code: 'NOT_FOUND' }, 404);
    }
    await recordPortalEvent(pool, session, 'session_used', `engagement viewed by ${session.label}`);
    return c.json({
      data: {
        ...view,
        /** The gate's honest state travels with the view, so the page never invents an upload button. */
        uploadGate: await uploadGateState(pool),
        sessionLabel: session.label,
        sessionExpiresAt: session.expiresAt,
      },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[portal] view error:', err);
    return c.json({ error: 'Failed to load this engagement', code: 'PORTAL_ERROR' }, 500);
  }
});

portalRoutes.post('/facts', async (c) => {
  try {
    let entries: Array<{ factKey: unknown; factValue: unknown }> = [];
    try {
      const parsed = await c.req.json();
      if (Array.isArray(parsed?.facts)) entries = parsed.facts as typeof entries;
    } catch { /* refused below as empty */ }
    const pool = getPool();
    const session = c.get('portalSession');
    const out = await submitPortalFacts(pool, session, entries);
    if (!out.ok) return c.json({ error: out.detail, code: out.code }, 400);
    return c.json({ data: { stored: out.stored }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[portal] facts error:', err);
    return c.json({ error: 'Submission failed — nothing was stored', code: 'PORTAL_ERROR' }, 500);
  }
});

portalRoutes.post('/deliverables/:id/accept', async (c) => {
  try {
    const id = c.req.param('id');
    const pool = getPool();
    const session = c.get('portalSession');
    const out = await portalAcceptDeliverable(pool, session, id);
    if (!out.ok) {
      /*
       * The desk's own refusal, verbatim: a review-gated or conflict-gated
       * deliverable refuses the CLIENT too, with the same sentence. An acceptance
       * door that is stricter for the desk than for the client would invert the
       * whole point of the gates.
       */
      return c.json({ error: out.detail, code: out.code }, out.code === 'NOT_FOUND' ? 404 : 409);
    }
    return c.json({ data: { acceptedAt: out.acceptedAt }, meta: { ...meta(), migrated: true } });
  } catch (err) {
    console.error('[portal] accept error:', err);
    return c.json({ error: 'Acceptance failed — nothing was recorded', code: 'PORTAL_ERROR' }, 500);
  }
});

portalRoutes.post('/upload-intent', async (c) => {
  try {
    let note = '';
    try {
      const parsed = await c.req.json();
      note = typeof parsed?.note === 'string' ? parsed.note.trim().slice(0, 300) : '';
    } catch { /* a bare intent is fine */ }
    const pool = getPool();
    const session = c.get('portalSession');
    const gate = await uploadGateState(pool);
    if (gate.state !== 'permitted') {
      await recordPortalEvent(pool, session, 'upload_refused', `${gate.state}: ${session.label}${note ? ` — ${note}` : ''}`);
      return c.json({
        error: gate.detail,
        code: gate.state === 'forbidden' ? 'UPLOAD_FORBIDDEN_BY_DPO' : 'UPLOAD_AWAITS_DPO_DECISION',
        data: { readinessRecorded: true },
      }, 403);
    }
    await recordPortalEvent(pool, session, 'upload_intent_recorded', `${session.label} has material ready${note ? `: ${note}` : ''}`);
    return c.json({
      data: {
        recorded: true,
        note: gate.detail,
      },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[portal] upload-intent error:', err);
    return c.json({ error: 'Failed to record', code: 'PORTAL_ERROR' }, 500);
  }
});
