/**
 * G6 — THE INVOICE SERVICE: numbered, immutable, milestone-traced, aged, chased.
 *
 * The invariants this file exists to hold:
 *
 *  · AN INVOICE TRACES TO AN ACCEPTANCE OR IT DOES NOT EXIST. `issueInvoice`
 *    refuses unless the deliverable's `accepted_at` is set — the "no free-form
 *    invoice" rule (D1/D8), enforced in code above the NOT NULL FK the schema
 *    enforces below.
 *  · THE CORE IS SEALED. amount, currency and the id-derived number are written
 *    once. Every function after `issueInvoice` writes ONLY a status transition
 *    into its own attributed columns; there is no amount UPDATE path here, which
 *    is what makes "immutable" a property of the code and not a hope.
 *  · THE CHASE HAS ONE MOUTH. It is deterministic text (no model, no invented
 *    number) run through `gateOutboundText` and returned WITH its verdict, never
 *    sent — recorded in marketing's own ledger by the same `recordGateDecision`
 *    every outreach draft uses.
 *  · RAILS ARE EXTERNAL. `markPaid` records a reference to a settlement that
 *    happened elsewhere; it moves no money and there is no field that could.
 */

import type pg from 'pg';
import {
  buildChaseText,
  formatInvoiceNumber,
  invoiceAging,
  type InvoiceAging,
  type InvoiceStatus,
} from '@lcx/shared';
import { gateOutboundText, recordGateDecision, type OutboundGateVerdict } from '../marketing/outboundGate.js';

export async function isInvoiceMigrated(pool: pg.Pool): Promise<boolean | null> {
  try {
    const r = await pool.query(`SELECT to_regclass('gps_invoice') AS rel`);
    return r.rows[0]?.rel !== null;
  } catch (err) {
    console.error('[gps] invoice register probe failed; not caching:', err);
    return null;
  }
}

export interface InvoiceRow {
  id: number;
  number: string;
  engagementId: string;
  clientId: string;
  deliverableId: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  issuedBy: string;
  issuedAt: string;
  paidAt: string | null;
  paidBy: string | null;
  paidReference: string | null;
  disputedAt: string | null;
  disputedBy: string | null;
  disputedReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidedReason: string | null;
}

const isoOrNull = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

function mapInvoice(r: Record<string, unknown>): InvoiceRow {
  const id = Number(r.id);
  return {
    id,
    number: formatInvoiceNumber(id),
    engagementId: String(r.engagement_id),
    clientId: String(r.client_id),
    deliverableId: String(r.deliverable_id),
    amountCents: Number(r.amount_cents),
    currency: String(r.currency),
    status: r.status as InvoiceStatus,
    issuedBy: String(r.issued_by),
    issuedAt: new Date(r.issued_at as string).toISOString(),
    paidAt: isoOrNull(r.paid_at),
    paidBy: r.paid_by === null || r.paid_by === undefined ? null : String(r.paid_by),
    paidReference: r.paid_reference === null || r.paid_reference === undefined ? null : String(r.paid_reference),
    disputedAt: isoOrNull(r.disputed_at),
    disputedBy: r.disputed_by === null || r.disputed_by === undefined ? null : String(r.disputed_by),
    disputedReason: r.disputed_reason === null || r.disputed_reason === undefined ? null : String(r.disputed_reason),
    voidedAt: isoOrNull(r.voided_at),
    voidedBy: r.voided_by === null || r.voided_by === undefined ? null : String(r.voided_by),
    voidedReason: r.voided_reason === null || r.voided_reason === undefined ? null : String(r.voided_reason),
  };
}

export async function listInvoices(pool: pg.Pool, engagementId?: string): Promise<InvoiceRow[]> {
  const r = engagementId
    ? await pool.query(`SELECT * FROM gps_invoice WHERE engagement_id = $1 ORDER BY issued_at DESC LIMIT 500`, [engagementId])
    : await pool.query(`SELECT * FROM gps_invoice ORDER BY issued_at DESC LIMIT 500`);
  return r.rows.map(mapInvoice);
}

export async function invoiceAgingSummary(pool: pg.Pool, asOfIso: string): Promise<InvoiceAging> {
  const r = await pool.query(
    `SELECT status, amount_cents, currency, issued_at FROM gps_invoice WHERE status IN ('issued','disputed') LIMIT 5000`,
  );
  return invoiceAging(
    r.rows.map((row: Record<string, unknown>) => ({
      status: row.status as InvoiceStatus,
      amountCents: Number(row.amount_cents),
      currency: String(row.currency),
      issuedAtIso: new Date(row.issued_at as string).toISOString(),
    })),
    asOfIso,
  );
}

/* ── Issue — the one write that traces to an acceptance ─────────────────────── */

export type IssueOutcome =
  | { ok: true; invoice: InvoiceRow }
  | { ok: false; code: 'DELIVERABLE_NOT_FOUND' | 'NOT_TRACED' | 'ALREADY_INVOICED' | 'VALIDATION' | 'CURRENCY_MISMATCH'; detail: string };

export async function issueInvoice(
  pool: pg.Pool,
  args: { deliverableId: string; amountCents: number; issuedBy: string },
): Promise<IssueOutcome> {
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
    return { ok: false, code: 'VALIDATION', detail: 'amountCents must be a positive integer number of cents' };
  }
  const del = await pool.query(
    `SELECT d.id, d.engagement_id, d.client_id, d.accepted_at, d.name, e.currency
       FROM gps_deliverable d JOIN gps_engagement e ON e.id = d.engagement_id
      WHERE d.id = $1`,
    [args.deliverableId],
  );
  if (del.rows.length === 0) {
    return { ok: false, code: 'DELIVERABLE_NOT_FOUND', detail: `no deliverable ${args.deliverableId}` };
  }
  const d = del.rows[0] as Record<string, unknown>;
  if (d.accepted_at === null || d.accepted_at === undefined) {
    /* THE INVARIANT. An unaccepted deliverable is not billable — this is the "traces
       to an accepted milestone or it is inexpressible" rule, enforced before the
       insert the NOT NULL FK would otherwise let through with a null acceptance. */
    return {
      ok: false,
      code: 'NOT_TRACED',
      detail: 'This deliverable has not been accepted. An invoice must trace to an acceptance (D1/D8) — accept it first, on the desk or by the client, then bill it.',
    };
  }
  const currency = String(d.currency ?? 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, code: 'CURRENCY_MISMATCH', detail: `the engagement currency "${currency}" is not a 3-letter code` };
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO gps_invoice (engagement_id, client_id, deliverable_id, amount_cents, currency, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [String(d.engagement_id), String(d.client_id), args.deliverableId, args.amountCents, currency, args.issuedBy],
    );
    return { ok: true, invoice: mapInvoice(inserted.rows[0]) };
  } catch (err) {
    // The partial unique index: one non-void invoice per deliverable.
    if (err instanceof Error && /gps_invoice_one_per_deliverable/.test(err.message)) {
      return { ok: false, code: 'ALREADY_INVOICED', detail: 'this deliverable already has a live invoice — void it before re-issuing' };
    }
    throw err;
  }
}

/* ── Status transitions — the only post-issue writes, each attributed ──────── */

export type TransitionOutcome =
  | { ok: true; invoice: InvoiceRow }
  | { ok: false; code: 'NOT_FOUND' | 'ILLEGAL_TRANSITION'; detail: string };

async function transition(
  pool: pg.Pool,
  id: number,
  setSql: string,
  params: unknown[],
  fromStates: readonly InvoiceStatus[],
): Promise<TransitionOutcome> {
  const placeholders = fromStates.map((_, i) => `$${params.length + 2 + i}`).join(', ');
  const res = await pool.query(
    `UPDATE gps_invoice SET ${setSql}
      WHERE id = $1 AND status IN (${placeholders})
      RETURNING *`,
    [id, ...params, ...fromStates],
  );
  if ((res.rowCount ?? 0) > 0) return { ok: true, invoice: mapInvoice(res.rows[0]) };
  const exists = await pool.query(`SELECT status FROM gps_invoice WHERE id = $1`, [id]);
  if (exists.rows.length === 0) return { ok: false, code: 'NOT_FOUND', detail: `no invoice ${id}` };
  return {
    ok: false,
    code: 'ILLEGAL_TRANSITION',
    detail: `invoice ${id} is ${String(exists.rows[0].status)} — that transition is not allowed from this state`,
  };
}

export function markPaid(pool: pg.Pool, id: number, reference: string, paidBy: string): Promise<TransitionOutcome> {
  // Paid from issued OR disputed: a disputed invoice can still settle.
  return transition(
    pool, id,
    `status = 'paid', paid_at = now(), paid_by = $2, paid_reference = $3`,
    [paidBy, reference],
    ['issued', 'disputed'],
  );
}

export function disputeInvoice(pool: pg.Pool, id: number, reason: string, disputedBy: string): Promise<TransitionOutcome> {
  return transition(
    pool, id,
    `status = 'disputed', disputed_at = now(), disputed_by = $2, disputed_reason = $3`,
    [disputedBy, reason],
    ['issued'],
  );
}

export function voidInvoice(pool: pg.Pool, id: number, reason: string, voidedBy: string): Promise<TransitionOutcome> {
  // Void from anything not already settled: a paid invoice is history, not a draft.
  return transition(
    pool, id,
    `status = 'void', voided_at = now(), voided_by = $2, voided_reason = $3`,
    [voidedBy, reason],
    ['issued', 'disputed'],
  );
}

/* ── Chase — deterministic text, judged by the one gate, sent by nobody ────── */

export interface SafeGateVerdict {
  allowed: boolean;
  disposition: OutboundGateVerdict['disposition'];
  refusals: OutboundGateVerdict['refusals'];
  violations: OutboundGateVerdict['violations'];
  blockingViolations: OutboundGateVerdict['blockingViolations'];
  gateError: string | null;
  reference: string;
}

function safeVerdict(v: OutboundGateVerdict): SafeGateVerdict {
  return {
    allowed: v.allowed,
    disposition: v.disposition,
    refusals: v.refusals,
    violations: v.violations,
    blockingViolations: v.blockingViolations,
    gateError: v.gateError,
    reference: v.embargoScope.reference,
  };
}

export type ChaseOutcome =
  | { ok: true; draft: string; verdict: SafeGateVerdict; ledgerRecorded: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_OPEN'; detail: string };

export async function chaseInvoice(
  pool: pg.Pool,
  id: number,
  actor: string,
  asOfMs: number,
): Promise<ChaseOutcome> {
  const r = await pool.query(
    `SELECT i.id, i.amount_cents, i.currency, i.status, i.issued_at, d.name AS deliverable_name, c.name AS client_name
       FROM gps_invoice i
       JOIN gps_client c ON c.id = i.client_id
       JOIN gps_deliverable d ON d.id = i.deliverable_id
      WHERE i.id = $1`,
    [id],
  );
  if (r.rows.length === 0) return { ok: false, code: 'NOT_FOUND', detail: `no invoice ${id}` };
  const row = r.rows[0] as Record<string, unknown>;
  const status = String(row.status) as InvoiceStatus;
  if (status !== 'issued' && status !== 'disputed') {
    return { ok: false, code: 'NOT_OPEN', detail: `invoice ${id} is ${status} — a settled or void invoice is not chased` };
  }
  const ageDays = Math.max(0, Math.floor((asOfMs - new Date(row.issued_at as string).getTime()) / 86_400_000));
  const draft = buildChaseText({
    invoiceNumber: formatInvoiceNumber(Number(row.id)),
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    clientName: String(row.client_name),
    ageDays,
    deliverableName: String(row.deliverable_name),
  });

  /* One mouth: the same gate every outreach draft answers to, in draft phase,
     attributed to the operator; verdict stored in marketing's own ledger. */
  const verdict = await gateOutboundText(pool, {
    text: draft,
    verb: 'original',
    channel: 'email',
    actor,
    phase: 'draft',
  });
  const ledgerRecorded = await recordGateDecision(pool, { replyId: null, verdict, actor, phase: 'draft', text: draft });
  return { ok: true, draft, verdict: safeVerdict(verdict), ledgerRecorded };
}
