import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

// Read credential directly from process.env (shared env module untouched).
const twitterBearer = process.env.TWITTER_BEARER ?? '';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface SocialMention {
  platform: string; // 'twitter'
  author: string;
  text: string;
  url: string;
  occurredAt: string; // ISO
  sentiment: Sentiment;
}

export interface TwitterProvider {
  readonly name: string;
  // Monitoring only — no posting, no auto-DM.
  scan(query: string): Promise<SocialMention[]>;
}

// ── Mock provider ──

export class MockTwitterProvider implements TwitterProvider {
  readonly name = 'mock';

  async scan(query: string): Promise<SocialMention[]> {
    await delay(randomBetween(200, 700));
    const now = Date.now();
    const samples: Array<{ author: string; text: string; sentiment: Sentiment }> = [
      { author: '@defi_alice', text: `Curious when ${query} gets listed on a regulated EU exchange like @LCX`, sentiment: 'positive' },
      { author: '@crypto_bob', text: `${query} team is shipping fast, watching closely`, sentiment: 'positive' },
      { author: '@skeptic_sam', text: `Not sure ${query} has real volume yet, seems quiet`, sentiment: 'negative' },
      { author: '@newsdesk', text: `${query} announces new partnership this week`, sentiment: 'neutral' },
    ];
    return samples.map((s, i) => ({
      platform: 'twitter',
      author: s.author,
      text: s.text,
      url: `https://x.com/${s.author.replace('@', '')}/status/${now - i * 1000}`,
      occurredAt: new Date(now - i * 5_400_000).toISOString(),
      sentiment: s.sentiment,
    }));
  }
}

// ── Real provider stub (falls back to mock until implemented) ──

export class XApiTwitterProvider implements TwitterProvider {
  readonly name = 'twitter';
  private fallback = new MockTwitterProvider();

  async scan(query: string): Promise<SocialMention[]> {
    // Real impl: GET https://api.twitter.com/2/tweets/search/recent
    // with Authorization: Bearer ${twitterBearer}. Monitoring only.
    console.warn('[twitter] X API provider stub — using mock mentions');
    return this.fallback.scan(query);
  }
}

// ── Factory ──

export function createTwitterProvider(): TwitterProvider {
  return twitterBearer ? new XApiTwitterProvider() : new MockTwitterProvider();
}

// ── Scan + persist ──

export interface TwitterScanResult {
  provider: string;
  projectId: string;
  found: number;
  inserted: number;
}

export async function scanTwitter(projectId: string, query: string): Promise<TwitterScanResult> {
  const provider = createTwitterProvider();
  const mentions = await provider.scan(query);
  const inserted = await persistMentions(projectId, mentions);
  return { provider: provider.name, projectId, found: mentions.length, inserted };
}

// Shared insert used by twitter + chat monitors (both live in social_mentions).
export async function persistMentions(projectId: string, mentions: SocialMention[]): Promise<number> {
  const db = getDb();
  let inserted = 0;
  for (const m of mentions) {
    const result = await db.execute(sql`
      INSERT INTO social_mentions (id, project_id, platform, author, text, url, occurred_at, sentiment)
      VALUES (
        ${randomUUID()},
        ${projectId},
        ${m.platform},
        ${m.author},
        ${m.text},
        ${m.url},
        ${m.occurredAt}::timestamptz,
        ${m.sentiment}
      )
      ON CONFLICT (url) DO NOTHING
      RETURNING id
    `);
    if ((result.rows ?? []).length > 0) inserted++;
  }
  return inserted;
}

export interface SocialMentionRow {
  id: string;
  projectId: string;
  platform: string;
  author: string;
  text: string;
  url: string;
  occurredAt: string;
  sentiment: string;
}

export async function listSocialMentions(projectId: string, platform?: string): Promise<SocialMentionRow[]> {
  const db = getDb();
  const cond = platform
    ? sql`WHERE project_id = ${projectId} AND platform = ${platform}`
    : sql`WHERE project_id = ${projectId}`;
  const result = await db.execute(sql`
    SELECT id, project_id, platform, author, text, url, occurred_at, sentiment
    FROM social_mentions
    ${cond}
    ORDER BY occurred_at DESC
    LIMIT 200
  `);
  return (result.rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    platform: r.platform as string,
    author: r.author as string,
    text: r.text as string,
    url: r.url as string,
    occurredAt: r.occurred_at as string,
    sentiment: r.sentiment as string,
  }));
}

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
