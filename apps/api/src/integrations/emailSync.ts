import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

// Integration-specific credentials are read directly from process.env so the
// shared env module stays untouched. Absent creds → mock provider.
const gmailOauth = process.env.GMAIL_OAUTH_TOKEN ?? '';
const outlookOauth = process.env.OUTLOOK_OAUTH_TOKEN ?? '';

export interface SyncedThread {
  externalId: string;
  subject: string;
  snippet: string;
  direction: 'inbound' | 'outbound';
  occurredAt: string; // ISO
}

export interface EmailSyncProvider {
  readonly name: string;
  fetchThreads(projectId: string): Promise<SyncedThread[]>;
}

// ── Mock provider ──

export class MockEmailSyncProvider implements EmailSyncProvider {
  readonly name = 'mock';

  async fetchThreads(projectId: string): Promise<SyncedThread[]> {
    await delay(randomBetween(200, 600));
    const seed = hash(projectId);
    const now = Date.now();
    const subjects = [
      'Intro — LCX listing opportunity',
      'Re: LCX listing opportunity',
      'Following up on our conversation',
      'Compliance docs for review',
    ];
    return subjects.map((subject, i) => ({
      externalId: `mock-thread-${seed}-${i}`,
      subject,
      snippet:
        i % 2 === 0
          ? 'Thanks for reaching out — would love to learn more about the process.'
          : 'Sounds good, let me loop in our team and revert shortly.',
      direction: i % 2 === 0 ? 'inbound' : 'outbound',
      occurredAt: new Date(now - (subjects.length - i) * 3_600_000).toISOString(),
    }));
  }
}

// ── Real provider stubs (fall back to mock until fully implemented) ──

export class GmailSyncProvider implements EmailSyncProvider {
  readonly name = 'gmail';
  private fallback = new MockEmailSyncProvider();

  async fetchThreads(projectId: string): Promise<SyncedThread[]> {
    // Real impl would call the Gmail API (users.threads.list) with gmailOauth.
    console.warn('[emailSync] Gmail provider stub — using mock threads');
    return this.fallback.fetchThreads(projectId);
  }
}

export class OutlookSyncProvider implements EmailSyncProvider {
  readonly name = 'outlook';
  private fallback = new MockEmailSyncProvider();

  async fetchThreads(projectId: string): Promise<SyncedThread[]> {
    // Real impl would call Microsoft Graph (/me/messages) with outlookOauth.
    console.warn('[emailSync] Outlook provider stub — using mock threads');
    return this.fallback.fetchThreads(projectId);
  }
}

// ── Factory ──

export function createEmailSyncProvider(): EmailSyncProvider {
  if (gmailOauth) return new GmailSyncProvider();
  if (outlookOauth) return new OutlookSyncProvider();
  return new MockEmailSyncProvider();
}

// ── Sync run (persist synced threads, dedup on external_id) ──

export interface SyncRunResult {
  provider: string;
  projectId: string;
  synced: number;
  inserted: number;
}

export async function runEmailSync(projectId: string): Promise<SyncRunResult> {
  const provider = createEmailSyncProvider();
  const threads = await provider.fetchThreads(projectId);
  const db = getDb();
  let inserted = 0;

  for (const t of threads) {
    const result = await db.execute(sql`
      INSERT INTO email_threads (id, project_id, subject, snippet, direction, external_id, occurred_at)
      VALUES (
        ${randomUUID()},
        ${projectId},
        ${t.subject},
        ${t.snippet},
        ${t.direction},
        ${t.externalId},
        ${t.occurredAt}::timestamptz
      )
      ON CONFLICT (external_id) DO NOTHING
      RETURNING id
    `);
    if ((result.rows ?? []).length > 0) inserted++;
  }

  return { provider: provider.name, projectId, synced: threads.length, inserted };
}

export interface EmailThreadRow {
  id: string;
  projectId: string;
  subject: string;
  snippet: string;
  direction: string;
  externalId: string;
  occurredAt: string;
}

export async function listEmailThreads(projectId: string): Promise<EmailThreadRow[]> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT id, project_id, subject, snippet, direction, external_id, occurred_at
    FROM email_threads
    WHERE project_id = ${projectId}
    ORDER BY occurred_at DESC
    LIMIT 200
  `);
  return (result.rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    subject: r.subject as string,
    snippet: r.snippet as string,
    direction: r.direction as string,
    externalId: r.external_id as string,
    occurredAt: r.occurred_at as string,
  }));
}

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
