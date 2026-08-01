import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

function required(name: string, devFallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  // Fail CLOSED in production: a dev convenience fallback (e.g. the public
  // 'dev-operator-key-change-me') must NEVER stand in for a real secret in
  // prod — that would make the shared operator key publicly known. Only fall
  // back outside production; otherwise crash the boot loudly.
  if (process.env.NODE_ENV !== 'production' && devFallback !== undefined && devFallback !== '') {
    return devFallback;
  }
  throw new Error(`Missing required env: ${name}`);
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
  /** LCX OS front-door passcode: email sign-in requires `email:passcode`. */
  deskPasscode: process.env.DESK_PASSCODE ?? 'test#1234',
  /**
   * SECOND-TIER desk passcode. Any @lcx.com address plus this signs in at
   * 'operator' on every compartment — no roster edit, no deploy, no grant wait.
   *
   * Requested by Nik on 2026-08-01 after the tradeoff was put to him explicitly
   * and he reaffirmed it: the team must be able to work now. See
   * `middleware/auth.ts` case (3) for what it deliberately does NOT grant
   * (approve-tier stays with the named roster) and `lib/secondTier.ts` for the
   * usage recording that makes a shared secret operationally survivable.
   *
   * NO DEFAULT, DELIBERATELY. An empty value disables the path entirely, and that
   * is the only safe default: a shared sign-in secret committed to the repo is
   * public to everyone with a checkout and to git history forever, while LOOKING
   * like a secret. `DESK_PASSCODE` above has a dev default because it gates a
   * roster of three known people; this one gates "any colleague", so it must be
   * set deliberately, per environment, by a human.
   *
   * Set SECONDARY_PASSCODE in the Render dashboard to open the door; unset or
   * empty it to close it. Rotating it is also the only thing that truly revokes a
   * departed colleague — see DEPARTED_MEMBER_EMAILS in @lcx/shared, which stops the
   * lazy attempt but cannot revoke a code someone already knows.
   *
   * A GETTER, not a snapshot, for two reasons: the value is read at request time
   * so rotating it takes effect without waiting on a module reload, and a test can
   * enable the path without the module having already frozen an empty string at
   * import time.
   */
  get secondaryPasscode(): string {
    return process.env.SECONDARY_PASSCODE ?? '';
  },
  /** x402 seller layer (Phase 4): unset → sandbox mode (keyless-first). */
  x402FacilitatorUrl: process.env.X402_FACILITATOR_URL ?? '',
  x402PayTo: process.env.X402_PAY_TO ?? '',
  corsOrigins: [
    ...(process.env.CORS_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173,https://lcx-sales-automation-engine.pages.dev')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // LCX TERMINAL (Phase 1): the desktop app's webview origins. Appended
    // UNCONDITIONALLY — these are fixed constants of our own signed app, not
    // user-configurable hosts, so the terminal works without anyone editing
    // CORS_ORIGINS in the Render dashboard. macOS/iOS use the tauri:// custom
    // protocol; Windows/Android use http://tauri.localhost.
    'tauri://localhost',
    'http://tauri.localhost',
  ],
  version: process.env.npm_package_version ?? '0.1.0',
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? '',
  coingeckoKeyType: (process.env.COINGECKO_KEY_TYPE === 'pro' ? 'pro' : 'demo') as 'demo' | 'pro',
  // AI (all LLM features fall back to deterministic when this is empty)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Opus 5 is the default because this is the quality path — the whole reason
  // to set an Anthropic key. Override with ANTHROPIC_MODEL to trade quality for
  // cost (`claude-sonnet-5`) or latency (`claude-haiku-4-5`); `ai/llm.ts`
  // adapts the request body per model, so any of them is a one-env-var change.
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
  // Fallback LLM provider: OpenRouter (OpenAI-compatible). Used only when no
  // Anthropic key is set — lets the platform run its AI layer on a free
  // open-source model (default: NVIDIA Nemotron 3 Ultra 550B, $0/token).
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterModel: process.env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b:free',
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
