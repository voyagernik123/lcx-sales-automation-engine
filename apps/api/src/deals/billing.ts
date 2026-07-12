/**
 * 5-5 Payment & billing — TRACKING ONLY.
 * HARD RULE: nothing here moves money, touches payment credentials, or executes
 * transfers. Invoices are status records; markInvoiceStatus is a manual status
 * change (e.g. an operator marking an invoice paid after confirming off-system).
 * crypto_address is a display/reference field only.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface LineItem {
  description: string;
  amountCents: number;
}

export interface Invoice {
  id: string;
  dealId: string;
  amountCents: number;
  currency: string;
  status: string;
  dueDate: string | null;
  cryptoAddress: string | null;
  lineItems: LineItem[];
  createdAt: string;
  updatedAt: string;
  projectName?: string | null;
}

function mapInvoice(r: Record<string, unknown>): Invoice {
  return {
    id: String(r.id),
    dealId: String(r.deal_id),
    amountCents: Number(r.amount_cents ?? 0),
    currency: String(r.currency ?? 'USD'),
    status: String(r.status),
    dueDate: r.due_date != null ? String(r.due_date) : null,
    cryptoAddress: r.crypto_address != null ? String(r.crypto_address) : null,
    lineItems: Array.isArray(r.line_items) ? (r.line_items as LineItem[]) : [],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    projectName: r.project_name != null ? String(r.project_name) : undefined,
  };
}

export interface CreateInvoiceInput {
  dealId: string;
  amountCents: number;
  currency?: string;
  dueDate?: string | null;
  cryptoAddress?: string | null;
  lineItems?: LineItem[];
  status?: InvoiceStatus;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const db = getDb();
  const rows = await db.execute(sql`
    INSERT INTO invoices (id, deal_id, amount_cents, currency, status, due_date, crypto_address, line_items)
    VALUES (${randomUUID()}, ${input.dealId}, ${input.amountCents}, ${input.currency ?? 'USD'},
            ${input.status ?? 'draft'}, ${input.dueDate ?? null}, ${input.cryptoAddress ?? null},
            ${JSON.stringify(input.lineItems ?? [])}::jsonb)
    RETURNING *
  `);
  return mapInvoice(rows.rows?.[0] as Record<string, unknown>);
}

export async function listInvoices(dealId?: string): Promise<Invoice[]> {
  const db = getDb();
  const where = dealId ? sql`WHERE i.deal_id = ${dealId}` : sql``;
  const rows = await db.execute(sql`
    SELECT i.*, p.name AS project_name
    FROM invoices i
    JOIN deals d ON d.id = i.deal_id
    JOIN projects p ON p.id = d.project_id
    ${where}
    ORDER BY i.created_at DESC
    LIMIT 200
  `);
  return (rows.rows ?? []).map((r) => mapInvoice(r as Record<string, unknown>));
}

/** Manual status change only — records the new status, never executes payment. */
export async function markInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    UPDATE invoices SET status = ${status}, updated_at = NOW() WHERE id = ${id} RETURNING *
  `);
  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  return row ? mapInvoice(row) : null;
}

/** Invoices past due date and not yet paid — for the collections view. */
export async function listOverdue(): Promise<Invoice[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT i.*, p.name AS project_name
    FROM invoices i
    JOIN deals d ON d.id = i.deal_id
    JOIN projects p ON p.id = d.project_id
    WHERE i.status <> 'paid'
      AND i.due_date IS NOT NULL
      AND i.due_date < CURRENT_DATE
    ORDER BY i.due_date ASC
  `);
  return (rows.rows ?? []).map((r) => mapInvoice(r as Record<string, unknown>));
}
