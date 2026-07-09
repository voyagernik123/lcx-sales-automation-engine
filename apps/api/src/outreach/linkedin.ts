import { env } from '../lib/env.js';

export interface ConnectionRequestParams {
  profileUrl: string;
  note?: string;
}

export interface MessageParams {
  profileUrl: string;
  message: string;
}

export interface CampaignResult {
  campaignId: string;
  status: 'running' | 'completed' | 'failed' | 'quota_exceeded';
  success?: boolean;
  error?: string;
  providerMessageId?: string;
}

export interface QuotaInfo {
  remainingConnections: number;
  remainingMessages: number;
  resetAt: string;
}

export interface LinkedInProvider {
  sendConnectionRequest(params: ConnectionRequestParams): Promise<CampaignResult>;
  sendMessage(params: MessageParams): Promise<CampaignResult>;
  getCampaignStatus(campaignId: string): Promise<CampaignResult>;
  checkQuota(): Promise<QuotaInfo>;
}

// ── Mock provider for dev/testing ──

export class MockLinkedInProvider implements LinkedInProvider {
  async sendConnectionRequest(_params: ConnectionRequestParams): Promise<CampaignResult> {
    void _params;
    await delay(randomBetween(500, 1500));
    return {
      campaignId: `mock-li-cr-${Date.now()}`,
      status: 'completed',
      success: true,
      providerMessageId: `mock-msg-${Date.now()}`,
    };
  }

  async sendMessage(_params: MessageParams): Promise<CampaignResult> {
    void _params;
    await delay(randomBetween(500, 1500));
    return {
      campaignId: `mock-li-msg-${Date.now()}`,
      status: 'completed',
      success: true,
      providerMessageId: `mock-msg-${Date.now()}`,
    };
  }

  async getCampaignStatus(campaignId: string): Promise<CampaignResult> {
    return { campaignId, status: 'completed', success: true };
  }

  async checkQuota(): Promise<QuotaInfo> {
    return { remainingConnections: 50, remainingMessages: 20, resetAt: new Date(Date.now() + 86400000).toISOString() };
  }
}

// ── Phantombuster provider ──

export class PhantombusterProvider implements LinkedInProvider {
  private apiKey: string;
  private baseUrl = 'https://api.phantombuster.com/api/v1';
  private agentIdConnection: string;
  private agentIdMessage: string;

  constructor() {
    this.apiKey = env.phantombusterApiKey;
    this.agentIdConnection = env.phantombusterConnectionAgentId;
    this.agentIdMessage = env.phantombusterMessageAgentId;
  }

  async sendConnectionRequest(params: ConnectionRequestParams): Promise<CampaignResult> {
    if (!this.apiKey) throw new Error('PHANTOMBUSTER_API_KEY not configured');

    try {
      const res = await fetch(`${this.baseUrl}/agents/${this.agentIdConnection}/launch`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          arguments: {
            profileUrl: params.profileUrl,
            note: params.note ?? '',
            sessionCookie: env.linkedinSessionCookie ?? '',
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { campaignId: '', status: 'failed', error: `HTTP ${res.status}: ${text}` };
      }
      const data = await res.json() as Record<string, unknown>;
      return {
        campaignId: (data.containerId as string) ?? (data.id as string) ?? '',
        status: 'running',
        success: true,
      };
    } catch (err) {
      return { campaignId: '', status: 'failed', error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  async sendMessage(params: MessageParams): Promise<CampaignResult> {
    if (!this.apiKey) throw new Error('PHANTOMBUSTER_API_KEY not configured');

    try {
      const res = await fetch(`${this.baseUrl}/agents/${this.agentIdMessage}/launch`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          arguments: {
            profileUrl: params.profileUrl,
            message: params.message,
            sessionCookie: env.linkedinSessionCookie ?? '',
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { campaignId: '', status: 'failed', error: `HTTP ${res.status}: ${text}` };
      }
      const data = await res.json() as Record<string, unknown>;
      return {
        campaignId: (data.containerId as string) ?? (data.id as string) ?? '',
        status: 'running',
        success: true,
      };
    } catch (err) {
      return { campaignId: '', status: 'failed', error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  async getCampaignStatus(campaignId: string): Promise<CampaignResult> {
    const res = await fetch(`${this.baseUrl}/containers/${campaignId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      return { campaignId, status: 'failed', error: `HTTP ${res.status}` };
    }

    const data = await res.json() as Record<string, unknown>;
    const status = (data.status as string) ?? 'unknown';
    const output = data.output as Record<string, unknown> | undefined;

    return {
      campaignId,
      status: status === 'finished' ? 'completed' : status === 'error' ? 'failed' : 'running',
      success: output?.success as boolean ?? undefined,
      error: output?.error as string ?? undefined,
      providerMessageId: output?.messageId as string ?? undefined,
    };
  }

  async checkQuota(): Promise<QuotaInfo> {
    const res = await fetch(`${this.baseUrl}/quota`, { headers: this.headers() });
    if (!res.ok) {
      return { remainingConnections: 0, remainingMessages: 0, resetAt: new Date().toISOString() };
    }
    const data = await res.json() as Record<string, unknown>;
    return {
      remainingConnections: Number(data.remainingConnectionRequests ?? 0),
      remainingMessages: Number(data.remainingMessages ?? 0),
      resetAt: (data.resetAt as string) ?? new Date().toISOString(),
    };
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }
}

// ── Factory ──

export function createLinkedInProvider(): LinkedInProvider {
  if (env.phantombusterApiKey) {
    return new PhantombusterProvider();
  }
  return new MockLinkedInProvider();
}

// ── Cap checking helpers ──

import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { randomUUID } from 'node:crypto';

export const LI_DAILY_CONNECTION_CAP = 7;
export const LI_WEEKLY_CONNECTION_CAP = 50;
export const LI_DAILY_MESSAGE_CAP = 20;

export interface LiCapStatus {
  connectionsRemainingToday: number;
  connectionsRemainingWeek: number;
  messagesRemainingToday: number;
  canSendConnection: boolean;
  canSendMessage: boolean;
}

export async function checkLiCap(action: 'connection_request' | 'message'): Promise<LiCapStatus> {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart();

  // Count today's usage
  const todayRows = await db
    .select({ total: sql<number>`COALESCE(SUM(count), 0)` })
    .from(schema.linkedinUsage)
    .where(
      sql`${schema.linkedinUsage.date} = ${today} AND ${schema.linkedinUsage.action} = ${action}`,
    )
    .execute();
  const todayCount = Number(todayRows[0]?.total ?? 0);

  // Count this week's connection requests
  let weekCount = 0;
  if (action === 'connection_request') {
    const weekRows = await db
      .select({ total: sql<number>`COALESCE(SUM(count), 0)` })
      .from(schema.linkedinUsage)
      .where(
        sql`${schema.linkedinUsage.weekStart} = ${weekStart} AND ${schema.linkedinUsage.action} = 'connection_request'`,
      )
      .execute();
    weekCount = Number(weekRows[0]?.total ?? 0);
  }

  const dailyCap = action === 'connection_request' ? LI_DAILY_CONNECTION_CAP : LI_DAILY_MESSAGE_CAP;
  const weeklyCap = LI_WEEKLY_CONNECTION_CAP;

  return {
    connectionsRemainingToday: LI_DAILY_CONNECTION_CAP - (action === 'connection_request' ? todayCount : 0),
    connectionsRemainingWeek: LI_WEEKLY_CONNECTION_CAP - weekCount,
    messagesRemainingToday: LI_DAILY_MESSAGE_CAP - (action === 'message' ? todayCount : 0),
    canSendConnection: (action === 'connection_request' ? todayCount < dailyCap && weekCount < weeklyCap : true),
    canSendMessage: (action === 'message' ? todayCount < dailyCap : true),
  };
}

export async function incrementLiUsage(action: 'connection_request' | 'message'): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart();

  const existing = await db
    .select()
    .from(schema.linkedinUsage)
    .where(
      sql`${schema.linkedinUsage.date} = ${today} AND ${schema.linkedinUsage.action} = ${action}`,
    )
    .limit(1)
    .execute();

  if (existing.length > 0) {
    await db
      .update(schema.linkedinUsage)
      .set({ count: sql`count + 1` })
      .where(sql`${schema.linkedinUsage.id} = ${existing[0].id}`)
      .execute();
  } else {
    await db
      .insert(schema.linkedinUsage)
      .values({
        id: randomUUID(),
        date: sql`${today}::date`,
        action,
        count: 1,
        weekStart: sql`${weekStart}::date`,
      })
      .execute();
  }
}
// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}
