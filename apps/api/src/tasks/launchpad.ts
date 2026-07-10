/**
 * Listing launchpad — the post-sale onboarding checklist. When a deal is won,
 * generate one task per department step so nothing falls through the cracks
 * between "signed" and "live on LCX". Tasks land in the same operator task list
 * (kind = 'launchpad'), deduped per deal.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

interface LaunchStep {
  dept: string;
  title: string;
  dueDays: number;
}

const LAUNCHPAD: LaunchStep[] = [
  { dept: 'Compliance', title: 'Complete final KYC/AML review of the issuer', dueDays: 3 },
  { dept: 'Compliance', title: 'Confirm token classification + legal opinion on file', dueDays: 5 },
  { dept: 'Engineering', title: 'Technical integration & deposit/withdrawal testing', dueDays: 7 },
  { dept: 'Engineering', title: 'Configure trading pair and market surveillance', dueDays: 7 },
  { dept: 'Ops', title: 'Confirm market-maker / liquidity arrangement', dueDays: 10 },
  { dept: 'Marketing', title: 'Schedule listing announcement + AMA', dueDays: 10 },
  { dept: 'Marketing', title: 'Publish listing blog post and social campaign', dueDays: 14 },
  { dept: 'Ops', title: 'Go-live checklist sign-off and launch', dueDays: 14 },
];

/** Idempotent: dedup index on (kind, deal_id) prevents duplicate checklists. */
export async function createLaunchpadTasks(dealId: string, projectId: string): Promise<number> {
  const db = getDb();
  let created = 0;
  for (const step of LAUNCHPAD) {
    const res = await db.execute(sql`
      INSERT INTO tasks (id, project_id, deal_id, title, detail, kind, due_at, created_by)
      SELECT ${randomUUID()}, ${projectId}, ${dealId},
             ${`[${step.dept}] ${step.title}`}, 'listing launchpad', 'launchpad',
             NOW() + (${step.dueDays} || ' days')::interval, 'system'
      WHERE NOT EXISTS (
        SELECT 1 FROM tasks
        WHERE deal_id = ${dealId} AND kind = 'launchpad' AND title = ${`[${step.dept}] ${step.title}`}
      )
    `);
    created += res.rowCount ?? 0;
  }
  return created;
}
