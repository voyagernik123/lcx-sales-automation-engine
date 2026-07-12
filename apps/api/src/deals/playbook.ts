/**
 * 5-2 Negotiation playbook + BATNA tracker.
 * Playbooks are read-only reference content (seeded in 0023). The BATNA tracker
 * records negotiation figures per deal — tracking only, never moves money.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export interface Playbook {
  id: string;
  name: string;
  steps: unknown[];
  createdAt: string;
}

export interface Batna {
  id: string;
  dealId: string;
  ourFloorCents: number | null;
  theirOfferCents: number | null;
  competitorOfferCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listPlaybooks(): Promise<Playbook[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT id, name, steps, created_at FROM negotiation_playbooks ORDER BY name ASC
  `);
  return (rows.rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    steps: Array.isArray(r.steps) ? (r.steps as unknown[]) : [],
    createdAt: String(r.created_at),
  }));
}

function mapBatna(r: Record<string, unknown>): Batna {
  return {
    id: String(r.id),
    dealId: String(r.deal_id),
    ourFloorCents: r.our_floor_cents != null ? Number(r.our_floor_cents) : null,
    theirOfferCents: r.their_offer_cents != null ? Number(r.their_offer_cents) : null,
    competitorOfferCents: r.competitor_offer_cents != null ? Number(r.competitor_offer_cents) : null,
    notes: r.notes != null ? String(r.notes) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function getBatna(dealId: string): Promise<Batna | null> {
  const db = getDb();
  const rows = await db.execute(sql`SELECT * FROM batna_tracker WHERE deal_id = ${dealId} LIMIT 1`);
  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  return row ? mapBatna(row) : null;
}

export interface BatnaInput {
  ourFloorCents?: number | null;
  theirOfferCents?: number | null;
  competitorOfferCents?: number | null;
  notes?: string | null;
}

/** Create the BATNA row for a deal (one per deal — upsert on deal_id). */
export async function createBatna(dealId: string, input: BatnaInput): Promise<Batna> {
  const db = getDb();
  const rows = await db.execute(sql`
    INSERT INTO batna_tracker (id, deal_id, our_floor_cents, their_offer_cents, competitor_offer_cents, notes)
    VALUES (${randomUUID()}, ${dealId}, ${input.ourFloorCents ?? null}, ${input.theirOfferCents ?? null},
            ${input.competitorOfferCents ?? null}, ${input.notes ?? null})
    ON CONFLICT (deal_id) DO UPDATE SET
      our_floor_cents = EXCLUDED.our_floor_cents,
      their_offer_cents = EXCLUDED.their_offer_cents,
      competitor_offer_cents = EXCLUDED.competitor_offer_cents,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `);
  return mapBatna(rows.rows?.[0] as Record<string, unknown>);
}

/** Patch an existing BATNA row; only provided fields change. */
export async function updateBatna(dealId: string, input: BatnaInput): Promise<Batna | null> {
  const db = getDb();
  const sets = [sql`updated_at = NOW()`];
  if (input.ourFloorCents !== undefined) sets.push(sql`our_floor_cents = ${input.ourFloorCents}`);
  if (input.theirOfferCents !== undefined) sets.push(sql`their_offer_cents = ${input.theirOfferCents}`);
  if (input.competitorOfferCents !== undefined) sets.push(sql`competitor_offer_cents = ${input.competitorOfferCents}`);
  if (input.notes !== undefined) sets.push(sql`notes = ${input.notes}`);

  const rows = await db.execute(sql`
    UPDATE batna_tracker SET ${sql.join(sets, sql`, `)} WHERE deal_id = ${dealId} RETURNING *
  `);
  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  return row ? mapBatna(row) : null;
}
