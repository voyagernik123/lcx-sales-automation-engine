/**
 * 5-7 Post-listing success automation.
 * On a deal being won, generate 30/60/90-day QBR review rows for the project so
 * account management has a standing cadence. Idempotent via the dedup unique
 * index on (deal_id, review_type, scheduled_at).
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export interface SuccessReview {
  id: string;
  projectId: string;
  dealId: string | null;
  reviewType: string;
  scheduledAt: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): SuccessReview {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    dealId: r.deal_id != null ? String(r.deal_id) : null,
    reviewType: String(r.review_type),
    scheduledAt: r.scheduled_at != null ? String(r.scheduled_at) : null,
    status: String(r.status),
    notes: r.notes != null ? String(r.notes) : null,
    createdAt: String(r.created_at),
  };
}

/**
 * Generate the 30/60/90-day QBR cadence for a won deal. Callable from the deal
 * won transition. Returns the number of review rows created.
 */
export async function generateSuccessReviews(
  dealId: string,
  projectId: string,
  wonAt: Date = new Date(),
): Promise<number> {
  const db = getDb();
  let created = 0;
  for (const day of [30, 60, 90] as const) {
    const scheduledAt = new Date(wonAt.getTime() + day * 86400000);
    const res = await db.execute(sql`
      INSERT INTO success_reviews (id, project_id, deal_id, review_type, scheduled_at, status, notes)
      VALUES (${randomUUID()}, ${projectId}, ${dealId}, 'QBR', ${scheduledAt.toISOString()}, 'scheduled',
              ${`${day}-day post-listing QBR`})
      ON CONFLICT (deal_id, review_type, scheduled_at) WHERE deal_id IS NOT NULL DO NOTHING
    `);
    created += res.rowCount ?? 0;
  }
  return created;
}

export async function listSuccessReviews(projectId: string): Promise<SuccessReview[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT * FROM success_reviews WHERE project_id = ${projectId} ORDER BY scheduled_at ASC
  `);
  return (rows.rows ?? []).map((r) => mapRow(r as Record<string, unknown>));
}
