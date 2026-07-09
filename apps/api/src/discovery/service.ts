/**
 * Discovery orchestration: queue jobs per project, process a few per tick
 * (cron-driven — Render free tier prefers short bursts), write accepted
 * emails/socials into people rows with provenance.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { crawlProjectSite } from './crawler.js';
import { rankEmails } from './rank.js';
import { verifyEmail, toEmailStatus } from './verifyEmail.js';

const MAX_ATTEMPTS = 2;
const ACCEPT_TOP_N = 3;

export async function enqueueDiscovery(projectId: string): Promise<{ jobId?: string; skipped?: string }> {
  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id, website: schema.projects.website })
    .from(schema.projects)
    .where(sql`${schema.projects.id} = ${projectId}`)
    .limit(1)
    .execute();
  if (!project) return { skipped: 'project not found' };
  if (!project.website) return { skipped: 'project has no website' };

  const jobId = randomUUID();
  const result = await db.execute(sql`
    INSERT INTO discovery_jobs (id, project_id) VALUES (${jobId}, ${projectId})
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  if ((result.rows ?? []).length === 0) return { skipped: 'job already pending' };
  return { jobId };
}

/** Queue every reachable-band project with a website and no usable email. */
export async function enqueueBatch(limit = 200): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO discovery_jobs (id, project_id)
    SELECT gen_random_uuid(), p.id
    FROM projects p
    LEFT JOIN scores s ON s.project_id = p.id
    WHERE p.website IS NOT NULL
      AND s.priority_score >= 20
      AND NOT EXISTS (
        SELECT 1 FROM people pl
        WHERE pl.project_id = p.id AND pl.email IS NOT NULL AND pl.email_status != 'invalid'
      )
      AND NOT EXISTS (
        SELECT 1 FROM discovery_jobs dj
        WHERE dj.project_id = p.id AND dj.status IN ('pending', 'running', 'done', 'blocked_robots')
      )
    ORDER BY s.priority_score DESC
    LIMIT ${limit}
  `);
  return result.rowCount ?? 0;
}

export interface DiscoveryTickResult {
  processed: number;
  emailsFound: number;
  failed: number;
}

export async function processDiscoveryTick(maxJobs = 3): Promise<DiscoveryTickResult> {
  const db = getDb();
  const out: DiscoveryTickResult = { processed: 0, emailsFound: 0, failed: 0 };

  const jobs = await db.execute(sql`
    UPDATE discovery_jobs SET status = 'running', started_at = NOW(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM discovery_jobs
      WHERE status = 'pending' OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS})
      ORDER BY created_at ASC
      LIMIT ${maxJobs}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, project_id
  `);

  for (const job of jobs.rows ?? []) {
    const jobId = String(job.id);
    const projectId = String(job.project_id);
    try {
      const found = await runDiscovery(projectId);
      await db.execute(sql`
        UPDATE discovery_jobs
        SET status = ${found.blockedByRobots ? 'blocked_robots' : 'done'},
            finished_at = NOW(), result = ${JSON.stringify(found.summary)}
        WHERE id = ${jobId}
      `);
      out.processed++;
      out.emailsFound += found.accepted;
    } catch (err) {
      await db.execute(sql`
        UPDATE discovery_jobs SET status = 'failed', finished_at = NOW(),
          error = ${err instanceof Error ? err.message : String(err)}
        WHERE id = ${jobId}
      `);
      out.failed++;
    }
  }

  return out;
}

async function runDiscovery(projectId: string): Promise<{ accepted: number; blockedByRobots: boolean; summary: Record<string, unknown> }> {
  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name, website: schema.projects.website, domain: schema.projects.domain })
    .from(schema.projects)
    .where(sql`${schema.projects.id} = ${projectId}`)
    .limit(1)
    .execute();
  if (!project?.website) throw new Error('project has no website');

  const people = await db
    .select({ id: schema.people.id, name: schema.people.name, email: schema.people.email, telegram: schema.people.telegram, linkedin: schema.people.linkedin })
    .from(schema.people)
    .where(sql`${schema.people.projectId} = ${projectId}`)
    .execute();

  const crawl = await crawlProjectSite(project.website);
  if (crawl.blockedByRobots) {
    return { accepted: 0, blockedByRobots: true, summary: { blockedByRobots: true } };
  }

  const ranked = rankEmails(crawl.emails, people.map((p) => p.name), project.domain);
  let accepted = 0;

  for (const candidate of ranked.slice(0, ACCEPT_TOP_N)) {
    const verdict = await verifyEmail(candidate.email);
    const status = toEmailStatus(verdict);
    if (status === 'invalid') continue;

    // Attach to an existing person whose name matches, else create an inbox row
    const local = candidate.email.split('@')[0].toLowerCase();
    const match = people.find((p) =>
      p.name.toLowerCase().split(/[^a-z]+/).some((t) => t.length >= 3 && local.includes(t)),
    );

    if (match && !match.email) {
      await db
        .update(schema.people)
        .set({ email: candidate.email, emailStatus: status, enrichedBy: 'discovery', updatedAt: new Date() })
        .where(sql`${schema.people.id} = ${match.id}`)
        .execute();
      accepted++;
    } else if (!match) {
      const exists = people.some((p) => p.email === candidate.email);
      if (!exists) {
        await db
          .insert(schema.people)
          .values({
            id: randomUUID(),
            projectId,
            name: `${project.name} inbox (${candidate.email.split('@')[0]})`,
            role: 'other',
            email: candidate.email,
            emailStatus: status,
            enrichedBy: 'discovery',
            raw: { _discovery: { sourceUrl: candidate.sourceUrl, method: candidate.method, reason: candidate.reason, foundAt: new Date().toISOString(), verifier: 'mx' } },
          })
          .execute();
        accepted++;
      }
    }
  }

  // Socials: fill empty slots only, never overwrite human data
  const primary = people[0];
  if (primary) {
    const updates: Record<string, unknown> = {};
    if (crawl.socials.telegram && !primary.telegram) updates.telegram = crawl.socials.telegram;
    if (crawl.socials.linkedin && !primary.linkedin) updates.linkedin = crawl.socials.linkedin;
    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.people)
        .set({ ...updates, updatedAt: new Date() })
        .where(sql`${schema.people.id} = ${primary.id}`)
        .execute();
    }
  }

  // Project-level provenance
  const [row] = await db
    .select({ raw: schema.projects.raw })
    .from(schema.projects)
    .where(sql`${schema.projects.id} = ${projectId}`)
    .limit(1)
    .execute();
  const currentRaw = (row?.raw ?? {}) as Record<string, unknown>;
  await db
    .update(schema.projects)
    .set({
      raw: {
        ...currentRaw,
        _discovery: {
          lastRunAt: new Date().toISOString(),
          pagesFetched: crawl.pagesFetched,
          socials: crawl.socials,
          emailsFound: crawl.emails.length,
          emailsAccepted: accepted,
        },
      },
      updatedAt: new Date(),
    })
    .where(sql`${schema.projects.id} = ${projectId}`)
    .execute();

  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    actor: 'discovery',
    action: 'discovery_completed',
    entity: 'projects',
    entityId: projectId,
    meta: { emailsFound: crawl.emails.length, accepted, pages: crawl.pagesFetched.length },
  });

  return {
    accepted,
    blockedByRobots: false,
    summary: {
      pagesFetched: crawl.pagesFetched,
      emails: ranked.slice(0, 10).map((r) => ({ email: r.email, rank: r.rank, reason: r.reason, sourceUrl: r.sourceUrl })),
      socials: crawl.socials,
      accepted,
    },
  };
}
