import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v === 'yes';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? '',
  allowDbSkip: bool('ALLOW_DB_SKIP', false),
  operatorApiKey: required('OPERATOR_API_KEY', 'dev-operator-key-change-me'),
  corsOrigins: (process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://127.0.0.1:5173,https://lcx-sales-automation-engine.pages.dev')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  version: process.env.npm_package_version ?? '0.1.0',
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? '',
  coingeckoKeyType: (process.env.COINGECKO_KEY_TYPE === 'pro' ? 'pro' : 'demo') as 'demo' | 'pro',
  // AI (all LLM features fall back to deterministic when this is empty)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? '',
  outreachFromEmail: process.env.OUTREACH_FROM_EMAIL ?? 'outreach@lcx.sales',
  // Outreach send window (email auto-send only inside this window)
  sendWindowDays: (process.env.SEND_WINDOW_DAYS ?? '2,3,4')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  sendWindowStartHour: Number(process.env.SEND_WINDOW_START_HOUR ?? 9),
  sendWindowEndHour: Number(process.env.SEND_WINDOW_END_HOUR ?? 17),
  sendWindowTz: process.env.SEND_WINDOW_TZ ?? 'Europe/Berlin',
  lcxTelegramHandle: process.env.LCX_TELEGRAM_HANDLE ?? '',
  unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET ?? '',
  inboundWebhookSecret: process.env.INBOUND_WEBHOOK_SECRET ?? '',
  crawlerContactEmail: process.env.CRAWLER_CONTACT_EMAIL ?? 'bd@lcx.com',
  apiPublicUrl: (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, ''),
  phantombusterApiKey: process.env.PHANTOMBUSTER_API_KEY ?? '',
  phantombusterConnectionAgentId: process.env.PHANTOMBUSTER_CONNECTION_AGENT_ID ?? '',
  phantombusterMessageAgentId: process.env.PHANTOMBUSTER_MESSAGE_AGENT_ID ?? '',
  linkedinSessionCookie: process.env.LINKEDIN_SESSION_COOKIE ?? '',
} as const;

export type Env = typeof env;
