/**
 * 5-3 Approval workflows.
 * A deal that exceeds a rep's self-serve authority (discount % or value) needs
 * approval. requestApproval builds an ordered chain of approval_steps from the
 * authority tiers whose limits are exceeded; decideApproval records the outcome.
 * No money movement — this only gates and records human sign-off.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

// Rep self-serve ceiling. Anything above this needs escalation. Mirrors the
// seeded approval_authority 'rep' row; kept as constants so needsApproval works
// even before authority rows are queried.
export const REP_MAX_DISCOUNT_PCT = 10;
export const REP_MAX_VALUE_CENTS = 5_000_000;

export interface ApprovalStep {
  id: string;
  requestId: string;
  stepOrder: number;
  role: string;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface ApprovalRequest {
  id: string;
  dealId: string;
  requestedBy: string;
  status: string;
  reason: string | null;
  discountPct: number | null;
  dealValueCents: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  steps?: ApprovalStep[];
}

/** Pure predicate: does a deal at this value/discount require approval? */
export function needsApproval(dealValueCents: number, discountPct: number): boolean {
  return discountPct > REP_MAX_DISCOUNT_PCT || dealValueCents > REP_MAX_VALUE_CENTS;
}

function mapRequest(r: Record<string, unknown>): ApprovalRequest {
  return {
    id: String(r.id),
    dealId: String(r.deal_id),
    requestedBy: String(r.requested_by),
    status: String(r.status),
    reason: r.reason != null ? String(r.reason) : null,
    discountPct: r.discount_pct != null ? Number(r.discount_pct) : null,
    dealValueCents: r.deal_value_cents != null ? Number(r.deal_value_cents) : null,
    decidedBy: r.decided_by != null ? String(r.decided_by) : null,
    decidedAt: r.decided_at != null ? String(r.decided_at) : null,
    createdAt: String(r.created_at),
  };
}

function mapStep(r: Record<string, unknown>): ApprovalStep {
  return {
    id: String(r.id),
    requestId: String(r.request_id),
    stepOrder: Number(r.step_order),
    role: String(r.role),
    status: String(r.status),
    decidedBy: r.decided_by != null ? String(r.decided_by) : null,
    decidedAt: r.decided_at != null ? String(r.decided_at) : null,
    note: r.note != null ? String(r.note) : null,
  };
}

export interface RequestApprovalInput {
  dealId: string;
  requestedBy: string;
  dealValueCents: number;
  discountPct: number;
  reason?: string;
}

/**
 * Create an approval request plus the ordered chain of steps. The chain is every
 * authority tier (ordered by ascending limit) whose thresholds are exceeded by
 * this deal — so a big-discount deal routes up through manager → director → vp.
 */
export async function requestApproval(input: RequestApprovalInput): Promise<ApprovalRequest> {
  const db = getDb();
  const requestId = randomUUID();

  await db.execute(sql`
    INSERT INTO approval_requests (id, deal_id, requested_by, status, reason, discount_pct, deal_value_cents)
    VALUES (${requestId}, ${input.dealId}, ${input.requestedBy}, 'pending', ${input.reason ?? null},
            ${input.discountPct}, ${input.dealValueCents})
  `);

  // Tiers that CANNOT self-approve this deal are skipped; the first tier that can
  // approve (and everyone below it who is still exceeded) forms the chain.
  const authRows = await db.execute(sql`
    SELECT role, max_discount_pct, max_value_cents
    FROM approval_authority
    WHERE role <> 'rep'
    ORDER BY max_value_cents ASC, max_discount_pct ASC
  `);

  const chain: string[] = [];
  for (const raw of (authRows.rows ?? [])) {
    const a = raw as Record<string, unknown>;
    const role = String(a.role);
    chain.push(role);
    const canFullyApprove =
      input.discountPct <= Number(a.max_discount_pct) && input.dealValueCents <= Number(a.max_value_cents);
    if (canFullyApprove) break; // this tier's authority covers the deal — chain complete
  }
  // Fallback: if no authority rows exist, at least route to a manager.
  if (chain.length === 0) chain.push('manager');

  let order = 0;
  for (const role of chain) {
    await db.execute(sql`
      INSERT INTO approval_steps (id, request_id, step_order, role, status)
      VALUES (${randomUUID()}, ${requestId}, ${order}, ${role}, 'pending')
    `);
    order++;
  }

  const created = await getApproval(requestId);
  return created!;
}

export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  const db = getDb();
  const reqRows = await db.execute(sql`SELECT * FROM approval_requests WHERE id = ${id} LIMIT 1`);
  const reqRow = reqRows.rows?.[0] as Record<string, unknown> | undefined;
  if (!reqRow) return null;
  const stepRows = await db.execute(sql`
    SELECT * FROM approval_steps WHERE request_id = ${id} ORDER BY step_order ASC
  `);
  return { ...mapRequest(reqRow), steps: (stepRows.rows ?? []).map((r) => mapStep(r as Record<string, unknown>)) };
}

export async function listApprovals(status?: string): Promise<ApprovalRequest[]> {
  const db = getDb();
  const where = status ? sql`WHERE ar.status = ${status}` : sql``;
  const rows = await db.execute(sql`
    SELECT ar.*, p.name AS project_name
    FROM approval_requests ar
    JOIN deals d ON d.id = ar.deal_id
    JOIN projects p ON p.id = d.project_id
    ${where}
    ORDER BY ar.created_at DESC
    LIMIT 200
  `);
  return (rows.rows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return { ...mapRequest(row), projectName: row.project_name != null ? String(row.project_name) : null } as ApprovalRequest & { projectName: string | null };
  });
}

/**
 * Decide the current pending step. Rejecting any step rejects the whole request.
 * Approving the last pending step approves the whole request.
 */
export async function decideApproval(
  requestId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  note?: string,
): Promise<ApprovalRequest | null> {
  const db = getDb();

  const existing = await getApproval(requestId);
  if (!existing) return null;
  if (existing.status !== 'pending') return existing; // already decided — idempotent no-op

  const nextStep = (existing.steps ?? []).find((s) => s.status === 'pending');
  if (nextStep) {
    await db.execute(sql`
      UPDATE approval_steps SET status = ${decision}, decided_by = ${decidedBy},
        decided_at = NOW(), note = ${note ?? null}
      WHERE id = ${nextStep.id}
    `);
  }

  const remaining = await db.execute(sql`
    SELECT COUNT(*) AS n FROM approval_steps WHERE request_id = ${requestId} AND status = 'pending'
  `);
  const pendingLeft = Number((remaining.rows?.[0] as Record<string, unknown> | undefined)?.n ?? 0);

  if (decision === 'rejected') {
    await db.execute(sql`
      UPDATE approval_requests SET status = 'rejected', decided_by = ${decidedBy}, decided_at = NOW()
      WHERE id = ${requestId}
    `);
  } else if (pendingLeft === 0) {
    await db.execute(sql`
      UPDATE approval_requests SET status = 'approved', decided_by = ${decidedBy}, decided_at = NOW()
      WHERE id = ${requestId}
    `);
  }

  return getApproval(requestId);
}
