/**
 * G4 — THE PORTAL PLANE (doctrine D9: the client lives in a separate country).
 *
 * This directory is deliberately OUTSIDE `gps/` — a different principal, a different
 * gate, a different failure budget — and everything here observes the client-plane
 * rules the migration states:
 *
 *  · A SESSION IS A DIGEST. `mintPortalSession` returns the bearer token exactly
 *    once; the table holds its SHA-256 and can never produce it again. Lookup is
 *    by digest, and expiry/revocation are checked on every request — a revoked
 *    link dies mid-session, not at the next login, because there is no login.
 *  · MINIMUM DISCLOSURE IS BUILT, NOT FILTERED. `portalEngagementView` assembles
 *    the client's view field by field: milestone states arrive honest (blocked has
 *    its reason and no percent — the same compiler-enforced honesty the desk gets),
 *    but the OWNER column never leaves the building. Who is staffed on a milestone
 *    is a desk fact; the need-to-know lesson (2026-08-15) was paid for once.
 *  · ACCEPTANCE GOES THROUGH THE ONE DOOR. The client's accept calls the SAME
 *    `acceptDeliverable` the desk uses — conflict gate, review gate, canAccept
 *    verdict, all of it — with attribution 'portal:<label>'. A portal that wrote
 *    its own UPDATE would be the second acceptance path this compartment refuses
 *    to have, exactly as demand promotion refuses a second target insert.
 *  · THE UPLOAD DOOR STAYS SHUT until a NAMED HUMAN opens it. `uploadGateState`
 *    reads the dpo_memo packet decision (G0) and answers with three honest states —
 *    undecided / forbidden / permitted — and the endpoint records intent, never
 *    bytes. Building a byte-receiving surface against a data-protection decision
 *    approved by nobody would be the exact D2 violation the intake lockout exists
 *    to make impossible.
 */

import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { getOffer, type OfferKey } from '@lcx/shared';
import { acceptDeliverable } from '../gps/deliveryDesk.js';

export async function isPortalMigrated(pool: pg.Pool): Promise<boolean | null> {
  try {
    const r = await pool.query(`SELECT to_regclass('gps_portal_session') AS rel`);
    return r.rows[0]?.rel !== null;
  } catch (err) {
    console.error('[portal] register probe failed; not caching:', err);
    return null;
  }
}

const digestToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/* ── Minting — an internal, governed act ────────────────────────────────────── */

export const PORTAL_SESSION_DAYS_DEFAULT = 14;
export const PORTAL_SESSION_DAYS_MAX = 60;

export type MintOutcome =
  | { ok: true; sessionId: string; token: string; expiresAt: string }
  | { ok: false; code: 'ENGAGEMENT_NOT_FOUND'; detail: string };

export async function mintPortalSession(
  pool: pg.Pool,
  args: { engagementId: string; label: string; days: number; mintedBy: string },
): Promise<MintOutcome> {
  const eng = await pool.query(`SELECT id, client_id FROM gps_engagement WHERE id = $1`, [args.engagementId]);
  if (eng.rows.length === 0) {
    return { ok: false, code: 'ENGAGEMENT_NOT_FOUND', detail: `no engagement ${args.engagementId}` };
  }
  const token = randomBytes(32).toString('hex');
  const days = Math.max(1, Math.min(PORTAL_SESSION_DAYS_MAX, Math.floor(args.days)));
  const saved = await pool.query(
    `INSERT INTO gps_portal_session (engagement_id, client_id, token_digest, label, minted_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
     RETURNING id, expires_at`,
    [args.engagementId, String(eng.rows[0].client_id), digestToken(token), args.label, args.mintedBy, days],
  );
  return {
    ok: true,
    sessionId: String(saved.rows[0].id),
    token,
    expiresAt: new Date(saved.rows[0].expires_at as string).toISOString(),
  };
}

export interface PortalSessionRow {
  id: string;
  engagementId: string;
  clientId: string;
  label: string;
  mintedBy: string;
  mintedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  lastSeenAt: string | null;
}

const mapSession = (r: Record<string, unknown>): PortalSessionRow => ({
  id: String(r.id),
  engagementId: String(r.engagement_id),
  clientId: String(r.client_id),
  label: String(r.label),
  mintedBy: String(r.minted_by),
  mintedAt: new Date(r.minted_at as string).toISOString(),
  expiresAt: new Date(r.expires_at as string).toISOString(),
  revokedAt: r.revoked_at ? new Date(r.revoked_at as string).toISOString() : null,
  revokedBy: r.revoked_by === null || r.revoked_by === undefined ? null : String(r.revoked_by),
  lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at as string).toISOString() : null,
});

export async function listPortalSessions(pool: pg.Pool, engagementId: string): Promise<PortalSessionRow[]> {
  const r = await pool.query(
    `SELECT * FROM gps_portal_session WHERE engagement_id = $1 ORDER BY minted_at DESC LIMIT 50`,
    [engagementId],
  );
  return r.rows.map(mapSession);
}

export async function revokePortalSession(
  pool: pg.Pool,
  sessionId: string,
  revokedBy: string,
): Promise<'revoked' | 'NOT_FOUND' | 'ALREADY_REVOKED'> {
  const r = await pool.query(
    `UPDATE gps_portal_session SET revoked_at = now(), revoked_by = $2
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [sessionId, revokedBy],
  );
  if ((r.rowCount ?? 0) > 0) return 'revoked';
  const exists = await pool.query(`SELECT id FROM gps_portal_session WHERE id = $1`, [sessionId]);
  return exists.rows.length === 0 ? 'NOT_FOUND' : 'ALREADY_REVOKED';
}

/* ── Resolving a bearer token — the portal's whole authentication ───────────── */

export type ResolveOutcome =
  | { ok: true; session: PortalSessionRow }
  | { ok: false; code: 'SESSION_INVALID' | 'SESSION_EXPIRED' | 'SESSION_REVOKED' };

export async function resolvePortalToken(pool: pg.Pool, token: string): Promise<ResolveOutcome> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, code: 'SESSION_INVALID' };
  const r = await pool.query(`SELECT * FROM gps_portal_session WHERE token_digest = $1`, [digestToken(token)]);
  if (r.rows.length === 0) return { ok: false, code: 'SESSION_INVALID' };
  const session = mapSession(r.rows[0] as Record<string, unknown>);
  if (session.revokedAt !== null) return { ok: false, code: 'SESSION_REVOKED' };
  if (new Date(session.expiresAt).getTime() <= Date.now()) return { ok: false, code: 'SESSION_EXPIRED' };
  // Touch, throttled to the minute — a read amplifier is not an audit trail.
  if (session.lastSeenAt === null || Date.now() - new Date(session.lastSeenAt).getTime() > 60_000) {
    await pool.query(`UPDATE gps_portal_session SET last_seen_at = now() WHERE id = $1`, [session.id]);
  }
  return { ok: true, session };
}

export async function recordPortalEvent(
  pool: pg.Pool,
  session: PortalSessionRow,
  kind: 'session_used' | 'facts_submitted' | 'acceptance_recorded' | 'acceptance_refused' | 'upload_intent_recorded' | 'upload_refused',
  detail: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO gps_portal_event (engagement_id, session_id, kind, detail) VALUES ($1, $2, $3, $4)`,
    [session.engagementId, session.id, kind, detail.slice(0, 500)],
  );
}

/* ── The client's view — built field by field, never spread ─────────────────── */

export interface PortalEngagementView {
  engagement: {
    id: string;
    clientName: string;
    offerKey: string;
    offerName: string;
    status: string;
    priceCents: number | null;
    currency: string;
    depositRequiredCents: number | null;
    depositPaidAt: string | null;
    /** From the sealed scope snapshot, whitelisted fields only. */
    exclusions: readonly string[];
    requiredClientInputs: readonly string[];
  };
  milestones: Array<{
    id: string;
    ordinal: number;
    name: string;
    /** The desk's honest states, verbatim. `blocked` carries its reason and NO percent. */
    status: string;
    dueBy: string | null;
    completedAt: string | null;
    blockedReason: string | null;
  }>;
  deliverables: Array<{
    id: string;
    name: string;
    status: string;
    reviewRequired: boolean;
    reviewedAt: string | null;
    acceptedAt: string | null;
  }>;
  /** Latest value per fact key the client has submitted. */
  facts: Array<{ factKey: string; factValue: string; submittedAt: string }>;
}

const isoOrNull = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export async function portalEngagementView(pool: pg.Pool, session: PortalSessionRow): Promise<PortalEngagementView | null> {
  const eng = await pool.query(
    `SELECT e.id, e.offer_key, e.status, e.price_cents, e.currency, e.scope_snapshot,
            e.deposit_required_cents, e.deposit_paid_at, c.name AS client_name
       FROM gps_engagement e JOIN gps_client c ON c.id = e.client_id
      WHERE e.id = $1`,
    [session.engagementId],
  );
  if (eng.rows.length === 0) return null;
  const e = eng.rows[0] as Record<string, unknown>;

  /*
   * The snapshot is OUR sealed record of what was sold; the client sees the two
   * lists that are about THEM. Field-by-field, never a spread: whatever else the
   * snapshot holds or grows, it does not travel to the client plane by accident.
   */
  const snap = (e.scope_snapshot ?? {}) as Record<string, unknown>;
  const strList = (v: unknown): readonly string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];

  const offer = getOffer(String(e.offer_key) as OfferKey);

  const [milestones, deliverables, facts] = await Promise.all([
    pool.query(
      `SELECT id, ordinal, name, status, due_by, completed_at, blocked_reason
         FROM gps_milestone WHERE engagement_id = $1 ORDER BY ordinal, created_at`,
      [session.engagementId],
    ),
    pool.query(
      `SELECT id, name, status, review_required, reviewed_at, accepted_at
         FROM gps_deliverable WHERE engagement_id = $1 ORDER BY created_at`,
      [session.engagementId],
    ),
    pool.query(
      `SELECT DISTINCT ON (fact_key) fact_key, fact_value, submitted_at
         FROM gps_portal_fact WHERE engagement_id = $1
        ORDER BY fact_key, submitted_at DESC`,
      [session.engagementId],
    ),
  ]);

  return {
    engagement: {
      id: String(e.id),
      clientName: String(e.client_name),
      offerKey: String(e.offer_key),
      offerName: offer?.name ?? String(e.offer_key),
      status: String(e.status),
      priceCents: e.price_cents === null ? null : Number(e.price_cents),
      currency: String(e.currency ?? 'USD'),
      depositRequiredCents: e.deposit_required_cents === null ? null : Number(e.deposit_required_cents),
      depositPaidAt: isoOrNull(e.deposit_paid_at),
      exclusions: strList(snap.exclusions),
      requiredClientInputs: strList(snap.requiredClientInputs),
    },
    milestones: milestones.rows.map((m: Record<string, unknown>) => ({
      id: String(m.id),
      ordinal: Number(m.ordinal),
      name: String(m.name),
      status: String(m.status),
      dueBy: isoOrNull(m.due_by),
      completedAt: isoOrNull(m.completed_at),
      blockedReason: m.blocked_reason === null || m.blocked_reason === undefined ? null : String(m.blocked_reason),
    })),
    deliverables: deliverables.rows.map((d: Record<string, unknown>) => ({
      id: String(d.id),
      name: String(d.name),
      status: String(d.status),
      reviewRequired: Boolean(d.review_required),
      reviewedAt: isoOrNull(d.reviewed_at),
      acceptedAt: isoOrNull(d.accepted_at),
    })),
    facts: facts.rows.map((f: Record<string, unknown>) => ({
      factKey: String(f.fact_key),
      factValue: String(f.fact_value),
      submittedAt: new Date(f.submitted_at as string).toISOString(),
    })),
  };
}

/* ── Typed facts — the catalogue's own closed set, per offer ────────────────── */

export const PORTAL_FACTS_PER_CALL_MAX = 20;
export const PORTAL_FACT_VALUE_MAX = 2000;

export type FactsOutcome =
  | { ok: true; stored: number }
  | { ok: false; code: 'VALIDATION'; detail: string };

export async function submitPortalFacts(
  pool: pg.Pool,
  session: PortalSessionRow,
  entries: ReadonlyArray<{ factKey: unknown; factValue: unknown }>,
): Promise<FactsOutcome> {
  if (entries.length === 0) return { ok: false, code: 'VALIDATION', detail: 'no facts in the submission' };
  if (entries.length > PORTAL_FACTS_PER_CALL_MAX) {
    return { ok: false, code: 'VALIDATION', detail: `at most ${PORTAL_FACTS_PER_CALL_MAX} facts per submission` };
  }
  const eng = await pool.query(`SELECT offer_key FROM gps_engagement WHERE id = $1`, [session.engagementId]);
  if (eng.rows.length === 0) return { ok: false, code: 'VALIDATION', detail: 'engagement no longer exists' };
  const offer = getOffer(String(eng.rows[0].offer_key) as OfferKey);
  const allowed = new Set<string>(offer?.requiredClientInputs ?? []);

  for (const entry of entries) {
    if (typeof entry.factKey !== 'string' || typeof entry.factValue !== 'string') {
      return { ok: false, code: 'VALIDATION', detail: 'each fact is { factKey, factValue }, both strings' };
    }
    if (!allowed.has(entry.factKey)) {
      /*
       * The closed set is the offer's own requiredClientInputs — the same list the
       * proposal printed. An unknown key is refused BY NAME so the client's counsel
       * can see exactly what was not asked for, and nothing free-form accumulates
       * in a table nobody reviews.
       */
      return {
        ok: false,
        code: 'VALIDATION',
        detail: `"${entry.factKey.slice(0, 80)}" is not one of this engagement's requested inputs — the desk asks; this form answers.`,
      };
    }
    const v = entry.factValue.trim();
    if (v === '' || v.length > PORTAL_FACT_VALUE_MAX) {
      return { ok: false, code: 'VALIDATION', detail: `"${entry.factKey}" must be 1–${PORTAL_FACT_VALUE_MAX} characters` };
    }
  }
  for (const entry of entries) {
    await pool.query(
      `INSERT INTO gps_portal_fact (engagement_id, session_id, fact_key, fact_value) VALUES ($1, $2, $3, $4)`,
      [session.engagementId, session.id, entry.factKey, (entry.factValue as string).trim()],
    );
  }
  await recordPortalEvent(pool, session, 'facts_submitted', `${entries.length} fact(s) submitted by ${session.label}`);
  return { ok: true, stored: entries.length };
}

/* ── Client acceptance — the desk's own door, portal attribution ────────────── */

export async function portalAcceptDeliverable(
  pool: pg.Pool,
  session: PortalSessionRow,
  deliverableId: string,
): Promise<
  | { ok: true; acceptedAt: string }
  | { ok: false; code: string; detail: string }
> {
  // Scope check FIRST: this session speaks for one engagement and no other row.
  const owned = await pool.query(
    `SELECT id FROM gps_deliverable WHERE id = $1 AND engagement_id = $2`,
    [deliverableId, session.engagementId],
  );
  if (owned.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', detail: 'no such deliverable on this engagement' };
  }
  const out = await acceptDeliverable(pool, { deliverableId, operator: `portal:${session.label}` });
  if (!out.ok) {
    await recordPortalEvent(pool, session, 'acceptance_refused', `${deliverableId}: ${out.code}`);
    return { ok: false, code: out.code, detail: out.message };
  }
  await recordPortalEvent(
    pool, session, 'acceptance_recorded',
    `deliverable ${deliverableId} accepted by ${session.label} via portal`,
  );
  return { ok: true, acceptedAt: out.value.acceptedAt };
}

/* ── The upload door — three honest states, zero bytes ──────────────────────── */

export type UploadGateState =
  | { state: 'undecided'; detail: string }
  | { state: 'forbidden'; detail: string }
  | { state: 'permitted'; detail: string };

export async function uploadGateState(pool: pg.Pool): Promise<UploadGateState> {
  const present = await pool.query(`SELECT to_regclass('gps_packet_decision') AS rel`);
  if (present.rows[0]?.rel === null) {
    return {
      state: 'undecided',
      detail: 'The founder-packet register does not exist yet (0076 unapplied), so the DPO decision this door waits on cannot even have been made.',
    };
  }
  const r = await pool.query(
    `SELECT decision, final_proposal #>> '{memo,recommendedOptionId}' AS option
       FROM gps_packet_decision
      WHERE packet_kind = 'dpo_memo'
      ORDER BY decided_at DESC, id DESC
      LIMIT 1`,
  );
  if (r.rows.length === 0 || String(r.rows[0].decision) === 'rejected') {
    return {
      state: 'undecided',
      detail: 'The DPO decision (dpo_memo packet, G0) has not been approved. Until a named human decides the controller/processor question, this system refuses to hold client files.',
    };
  }
  const option = String(r.rows[0].option ?? '');
  if (option !== 'adopt_processor_dpa') {
    return {
      state: 'forbidden',
      detail: `The approved DPO decision (${option || 'option unrecorded'}) does not permit client uploads. Files stay in the client's own systems; the desk records references only.`,
    };
  }
  return {
    state: 'permitted',
    detail: 'The approved DPO decision permits processor-basis uploads. The byte path ships together with the DPA it requires; until then the desk relays files through its one audited intake.',
  };
}
