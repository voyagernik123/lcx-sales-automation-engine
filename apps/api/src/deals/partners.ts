/**
 * 5-8 Partner / referral tracking.
 * Records partners and the referrals they bring in, plus a tracked (not paid out)
 * commission accrual. No money movement — commission_cents is a ledger figure only.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export interface Partner {
  id: string;
  name: string;
  type: string;
  commissionPct: number;
  contact: string | null;
  createdAt: string;
}

export interface Referral {
  id: string;
  partnerId: string;
  partnerName?: string | null;
  projectId: string | null;
  dealId: string | null;
  status: string;
  commissionCents: number;
  notes: string | null;
  createdAt: string;
}

function mapPartner(r: Record<string, unknown>): Partner {
  return {
    id: String(r.id),
    name: String(r.name),
    type: String(r.type),
    commissionPct: Number(r.commission_pct ?? 0),
    contact: r.contact != null ? String(r.contact) : null,
    createdAt: String(r.created_at),
  };
}

function mapReferral(r: Record<string, unknown>): Referral {
  return {
    id: String(r.id),
    partnerId: String(r.partner_id),
    partnerName: r.partner_name != null ? String(r.partner_name) : null,
    projectId: r.project_id != null ? String(r.project_id) : null,
    dealId: r.deal_id != null ? String(r.deal_id) : null,
    status: String(r.status),
    commissionCents: Number(r.commission_cents ?? 0),
    notes: r.notes != null ? String(r.notes) : null,
    createdAt: String(r.created_at),
  };
}

export async function listPartners(): Promise<Partner[]> {
  const db = getDb();
  const rows = await db.execute(sql`SELECT * FROM partners ORDER BY name ASC`);
  return (rows.rows ?? []).map((r) => mapPartner(r as Record<string, unknown>));
}

export interface CreatePartnerInput {
  name: string;
  type?: string;
  commissionPct?: number;
  contact?: string | null;
}

export async function createPartner(input: CreatePartnerInput): Promise<Partner> {
  const db = getDb();
  const rows = await db.execute(sql`
    INSERT INTO partners (id, name, type, commission_pct, contact)
    VALUES (${randomUUID()}, ${input.name}, ${input.type ?? 'referral'}, ${input.commissionPct ?? 0}, ${input.contact ?? null})
    ON CONFLICT (name) DO UPDATE SET
      type = EXCLUDED.type, commission_pct = EXCLUDED.commission_pct, contact = EXCLUDED.contact
    RETURNING *
  `);
  return mapPartner(rows.rows?.[0] as Record<string, unknown>);
}

export async function listReferrals(partnerId?: string): Promise<Referral[]> {
  const db = getDb();
  const where = partnerId ? sql`WHERE r.partner_id = ${partnerId}` : sql``;
  const rows = await db.execute(sql`
    SELECT r.*, pt.name AS partner_name
    FROM referrals r
    JOIN partners pt ON pt.id = r.partner_id
    ${where}
    ORDER BY r.created_at DESC
    LIMIT 200
  `);
  return (rows.rows ?? []).map((r) => mapReferral(r as Record<string, unknown>));
}

export interface CreateReferralInput {
  partnerId: string;
  projectId?: string | null;
  dealId?: string | null;
  status?: string;
  commissionCents?: number;
  notes?: string | null;
}

export async function createReferral(input: CreateReferralInput): Promise<Referral> {
  const db = getDb();
  const rows = await db.execute(sql`
    INSERT INTO referrals (id, partner_id, project_id, deal_id, status, commission_cents, notes)
    VALUES (${randomUUID()}, ${input.partnerId}, ${input.projectId ?? null}, ${input.dealId ?? null},
            ${input.status ?? 'new'}, ${input.commissionCents ?? 0}, ${input.notes ?? null})
    RETURNING *
  `);
  return mapReferral(rows.rows?.[0] as Record<string, unknown>);
}
