import { Hono } from 'hono';
import {
  PACKET_KINDS,
  buildFounderPackets,
  type PacketKind,
  type PacketProposal,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  applyProposal,
  isPacketRegisterPresent,
  loadStandingDecisions,
  proposalDefectsFor,
  type PacketDecisionRow,
} from '../gps/packets.js';

/**
 * GLOBAL SERVICES — THE FOUNDER PACKETS (G0).
 *
 *   GET  /packets               the five built packets + the standing decision per kind
 *   POST /packets/:kind/decide  approve / approve-with-edits / reject one packet
 *
 * Mounted inside `gpsRoutes` at '/packets' — NOT in app.ts. Mounting inside gpsRoutes is what
 * puts the compartment gate in front of both methods; `requireOperator`/`requireApprover` on
 * the write is authentication and authority, not authorisation — the compartment is the floor.
 * Same reasoning, same wiring shape, as gpsInputs (whose mount test is the pattern for mine).
 *
 * ── WHY THE PACKETS ARE REBUILT PER REQUEST ──────────────────────────────────
 * `buildFounderPackets` is deterministic and its own tests hold every shipped proposal to the
 * same defect predicate this route runs on the owner's edits. Rebuilding means the screen can
 * never show a proposal that drifted from the code that argues for it; the database holds only
 * DECISIONS. The one clock read is stamped into `builtAt` so two packets in one response agree.
 *
 * ── THE DECIDE SEMANTICS, PRECISELY ──────────────────────────────────────────
 * `approved`            the proposal in the body must DEEP-EQUAL the built one. An approval
 *                       that silently carried edits would record the owner as having approved
 *                       something he never saw; the refusal tells him to resend as
 *                       approved_with_edits, which is one honest click away.
 * `approved_with_edits` the body's proposal is validated by `packetProposalDefects` — the SAME
 *                       predicate the builder's tests pass — then applied and stored as
 *                       final_proposal. His edits face the bar the system faced.
 * `rejected`            recorded with the BUILT proposal as final_proposal (what was rejected),
 *                       apply skipped, `recorded_only`. A rejection is a decision too.
 *
 * The decision row is INSERTed after apply so `apply_state` records what actually happened.
 * Both writes idempotent-or-append: a re-approve after `apply_failed` re-runs upserts and
 * appends a fresh row; nothing here can double-charge or half-record.
 *
 * ── ATTRIBUTION ──────────────────────────────────────────────────────────────
 * `decided_by` is `c.get('operator')`, never a body field — same rule as every GPS write.
 *
 * ── THERE IS NO CLIENT MATERIAL ON THIS ROUTE ────────────────────────────────
 * The bodies are the five typed proposals: offer keys, integer cents, person-days, service
 * classes, and one drafted memo the OWNER is deciding about. Nothing here receives a file,
 * a location, or anything a client supplied. intakeLockout discovers this file by path.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const REGISTER_ABSENT = {
  error:
    'There is nowhere to record a packet decision on this environment: gps_packet_decision does not '
    + 'exist. Apply 0076_gps_packets.sql (it also creates gps_price_band, which the price packet needs).',
  code: 'PACKET_REGISTER_ABSENT',
} as const;

/** Structural deep-equal that ignores key order — the client round-trips JSON, so order is noise. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

export const gpsPacketsRoutes = new Hono<{ Variables: AuthVariables }>();

gpsPacketsRoutes.get('/', requireOperator, async (c) => {
  try {
    const packets = buildFounderPackets(new Date().toISOString());
    const pool = getPool();
    const present = await isPacketRegisterPresent(pool);

    let decisions: PacketDecisionRow[] = [];
    if (present === true) decisions = await loadStandingDecisions(pool);

    return c.json({
      data: {
        packets,
        decisions,
        /* Three states, never collapsed: true (register exists), false (apply 0076), null (the
           probe itself failed — absence UNCONFIRMED, which is not the same as absent). */
        registerPresent: present,
        registerNotice:
          present === true
            ? null
            : present === false
              ? 'Decisions cannot be recorded yet: apply 0076_gps_packets.sql. The packets below are readable and editable meanwhile.'
              : 'The decision register could not be probed just now — decisions may exist that are not shown. Retry before treating any packet as undecided.',
      },
      meta: { ...meta(), migrated: present === true },
    });
  } catch (err) {
    console.error('[gps] packets read error:', err);
    return c.json({ error: 'Failed to load the founder packets', code: 'GPS_ERROR' }, 500);
  }
});

gpsPacketsRoutes.post('/:kind/decide', requireOperator, requireApprover, async (c) => {
  try {
    const kind = c.req.param('kind') as PacketKind;
    if (!PACKET_KINDS.includes(kind)) {
      return c.json({
        error: `Unknown packet "${kind}" — the five are ${PACKET_KINDS.join(', ')}.`,
        code: 'PACKET_UNKNOWN',
      }, 400);
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await c.req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Record<string, unknown>;
    } catch {
      return c.json({ error: 'body must be a JSON object', code: 'VALIDATION' }, 400);
    }

    const decision = body.decision;
    if (decision !== 'approved' && decision !== 'approved_with_edits' && decision !== 'rejected') {
      return c.json({
        error: 'decision must be approved, approved_with_edits, or rejected — silence is not one of the options, deliberately.',
        code: 'PACKET_DECISION_INVALID',
      }, 400);
    }
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 4000) : null;

    const built = buildFounderPackets(new Date().toISOString()).find((p) => p.kind === kind)!;

    // Resolve the FINAL proposal per the semantics in the header.
    let finalProposal: PacketProposal;
    if (decision === 'rejected') {
      finalProposal = built.proposal;
    } else {
      const submitted = body.proposal as PacketProposal | undefined;
      if (!submitted || typeof submitted !== 'object') {
        return c.json({
          error: 'proposal is required — the decision must name exactly what it decides on.',
          code: 'PACKET_PROPOSAL_MISSING',
        }, 400);
      }
      const defects = proposalDefectsFor(kind, submitted);
      if (defects.length > 0) {
        return c.json({
          error: 'The proposal has defects and was not recorded or applied.',
          code: 'PACKET_PROPOSAL_DEFECTIVE',
          data: { defects },
        }, 400);
      }
      if (decision === 'approved' && !deepEqual(submitted, built.proposal)) {
        return c.json({
          error:
            'This proposal differs from the built packet, but the decision says "approved". Approving '
            + 'edits as if they were the original would record you as having approved something you never '
            + 'saw — resend with decision "approved_with_edits".',
          code: 'PACKET_EDITS_UNDECLARED',
        }, 400);
      }
      finalProposal = submitted;
    }

    const pool = getPool();
    const present = await isPacketRegisterPresent(pool);
    if (present !== true) {
      return c.json({ ...REGISTER_ABSENT, meta: { ...meta(), migrated: false } }, 503);
    }

    const operator = c.get('operator');
    const decidedBy = operator?.id ?? 'unknown';
    const decidedAt = new Date().toISOString();

    // Apply first, then record what actually happened. A rejected packet applies nothing.
    const outcome =
      decision === 'rejected'
        ? { state: 'recorded_only' as const, detail: 'Rejected — nothing applied. The packet remains visible for a future decision.' }
        : await applyProposal(pool, finalProposal, decidedBy, decidedAt);

    await pool.query(
      `INSERT INTO gps_packet_decision
         (packet_kind, decision, final_proposal, apply_state, apply_detail, decided_by, notes)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
      [kind, decision, JSON.stringify(finalProposal), outcome.state, outcome.detail, decidedBy, notes],
    );

    const decisions = await loadStandingDecisions(pool);
    return c.json({
      data: { kind, decision, applyState: outcome.state, applyDetail: outcome.detail, decisions },
      meta: { ...meta(), migrated: true },
    });
  } catch (err) {
    console.error('[gps] packet decide error:', err);
    return c.json({ error: 'Failed to record this decision', code: 'GPS_ERROR' }, 500);
  }
});
