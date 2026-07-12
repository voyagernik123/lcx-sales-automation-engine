import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { persistMentions, type SocialMention } from './twitter.js';

// Credentials read directly from process.env (shared env module untouched).
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
const discordBotToken = process.env.DISCORD_BOT_TOKEN ?? '';

// LOCKED RULE: monitoring only. Never auto-message Telegram (or Discord).
// This module reads channels and records interest signals — it never sends.

export type ChatPlatform = 'telegram' | 'discord';

// Keywords that indicate a prospect is interested in getting listed / trading.
export const INTEREST_KEYWORDS = [
  'listing',
  'get listed',
  'when list',
  'exchange listing',
  'apply to list',
  'list our token',
  'trading pair',
  'market maker',
  'ido',
  'launchpad',
];

export interface ChatMessage {
  platform: ChatPlatform;
  author: string;
  text: string;
  url: string;
  occurredAt: string; // ISO
}

export interface ChatMonitor {
  readonly name: string;
  // Read-only fetch of recent channel messages.
  fetchMessages(platform: ChatPlatform, channel: string): Promise<ChatMessage[]>;
}

// ── Mock monitor ──

export class MockChatMonitor implements ChatMonitor {
  readonly name = 'mock';

  async fetchMessages(platform: ChatPlatform, channel: string): Promise<ChatMessage[]> {
    await delay(randomBetween(200, 600));
    const now = Date.now();
    const samples = [
      `Hey when is ${channel} going to apply for a listing on a regulated exchange?`,
      `gm — loving the project, any news on an exchange listing?`,
      `Random chatter about the weather, nothing to see here`,
      `We should get a EUR trading pair, market maker interest is high`,
    ];
    return samples.map((text, i) => ({
      platform,
      author: `user_${(i + 1) * 7}`,
      text,
      url: `https://${platform}.local/${channel}/msg/${now - i * 1000}`,
      occurredAt: new Date(now - i * 2_700_000).toISOString(),
    }));
  }
}

// ── Real monitor stubs (fall back to mock until implemented) ──

export class TelegramChatMonitor implements ChatMonitor {
  readonly name = 'telegram';
  private fallback = new MockChatMonitor();

  async fetchMessages(platform: ChatPlatform, channel: string): Promise<ChatMessage[]> {
    // Real impl: Telegram Bot API getUpdates / channel history (READ ONLY).
    console.warn('[chatMonitor] Telegram monitor stub — using mock messages');
    return this.fallback.fetchMessages(platform, channel);
  }
}

export class DiscordChatMonitor implements ChatMonitor {
  readonly name = 'discord';
  private fallback = new MockChatMonitor();

  async fetchMessages(platform: ChatPlatform, channel: string): Promise<ChatMessage[]> {
    // Real impl: Discord Gateway / GET /channels/{id}/messages (READ ONLY).
    console.warn('[chatMonitor] Discord monitor stub — using mock messages');
    return this.fallback.fetchMessages(platform, channel);
  }
}

// ── Factory ──

export function createChatMonitor(platform: ChatPlatform): ChatMonitor {
  if (platform === 'telegram') return telegramBotToken ? new TelegramChatMonitor() : new MockChatMonitor();
  return discordBotToken ? new DiscordChatMonitor() : new MockChatMonitor();
}

// ── Keyword match ──

export function matchInterest(text: string): string[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  return INTEREST_KEYWORDS.filter((k) => haystack.includes(k));
}

// ── Scan → record mentions + interest signals ──

export interface ChatScanResult {
  provider: string;
  platform: ChatPlatform;
  projectId: string;
  scanned: number;
  matched: number;
  mentionsInserted: number;
  signalsCreated: number;
}

export async function scanChat(params: {
  projectId: string;
  platform: ChatPlatform;
  channel: string;
}): Promise<ChatScanResult> {
  const monitor = createChatMonitor(params.platform);
  const messages = await monitor.fetchMessages(params.platform, params.channel);

  const matched = messages
    .map((m) => ({ m, keywords: matchInterest(m.text) }))
    .filter((x) => x.keywords.length > 0);

  const mentions: SocialMention[] = matched.map(({ m }) => ({
    platform: m.platform,
    author: m.author,
    text: m.text,
    url: m.url,
    occurredAt: m.occurredAt,
    sentiment: 'positive',
  }));

  const mentionsInserted = await persistMentions(params.projectId, mentions);

  // Record an interest signal per matched message (reuses the signals table).
  const db = getDb();
  let signalsCreated = 0;
  for (const { m, keywords } of matched) {
    await db.execute(sql`
      INSERT INTO signals (id, project_id, kind, payload, observed_at)
      VALUES (
        ${randomUUID()},
        ${params.projectId},
        'chat_interest',
        ${JSON.stringify({ platform: m.platform, channel: params.channel, author: m.author, keywords, text: m.text, url: m.url })}::jsonb,
        ${m.occurredAt}::timestamptz
      )
    `);
    signalsCreated++;
  }

  return {
    provider: monitor.name,
    platform: params.platform,
    projectId: params.projectId,
    scanned: messages.length,
    matched: matched.length,
    mentionsInserted,
    signalsCreated,
  };
}

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
