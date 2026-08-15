import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

/**
 * The dev-only front-door passcode. Committed, therefore PUBLIC, therefore usable only
 * where nothing is at stake. Named rather than inlined so `deskPasscodeIsPublicDefault`
 * below and the refusal in `middleware/auth.ts` are demonstrably talking about this exact
 * value, and so a test can assert the production path never accepts it.
 */
export const DESK_PASSCODE_DEV_FALLBACK = 'test#1234';

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

/**
 * The value the front door will actually compare against, resolved ONCE so that the
 * guard below and the door in `middleware/auth.ts` can never be looking at different
 * things. Unset ⇒ the committed literal; set ⇒ whatever was set, including an empty
 * string (`??` is nullish, so an empty DESK_PASSCODE stays empty rather than falling
 * back — and an empty passcode is not a safer state, it is a worse one).
 */
const deskPasscodeResolved = process.env.DESK_PASSCODE ?? DESK_PASSCODE_DEV_FALLBACK;

/**
 * IS THE FRONT DOOR'S SECRET PUBLIC?
 *
 * THE OLD TEST WAS "IS DESK_PASSCODE UNSET", AND THAT IS NOT THE SAME QUESTION.
 * Proved on a local production build on 2026-08-15: with DESK_PASSCODE unset,
 * `nik@lcx.com` + the committed literal was refused with 401 and `/health` reported
 * `refused-public-default`. With DESK_PASSCODE explicitly SET to that same committed
 * literal, the identical request returned 200 with `role: approver`, `canApprove: true`
 * and `approve` on all eight compartments, and `/health` reported `open`. The guard
 * tested unset-ness; the danger is the VALUE.
 *
 * It now compares the resolved value against the one constant this repository defines
 * for it — one comparison, no second copy of the literal anywhere, so the guard cannot
 * drift from the fallback it is guarding. Unset, empty, and explicitly-set-to-the-literal
 * are all the same answer because they are all the same secret.
 */
function deskPasscodeIsPublic(): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  return deskPasscodeResolved === '' || deskPasscodeResolved === DESK_PASSCODE_DEV_FALLBACK;
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
  /**
   * PEM CA bundle for verifying the database server's certificate. Empty ⇒ the connection is
   * encrypted but the server is NOT authenticated (see `decideTls` in `db/index.ts`).
   *
   * The seam exists so that closing the last gap is a dashboard change and not a deploy:
   * paste Supabase's published CA bundle here and TLS moves from `encrypted` to `verified`.
   * Deliberately NOT `required()` — failing the boot over a missing CA would trade a
   * passive-interception risk for a total outage, which is not a trade worth making silently.
   */
  databaseCaCert: process.env.DATABASE_CA_CERT ?? '',
  /**
   * Self-heal an unroutable Supabase DIRECT `DATABASE_URL` by probing its session-pooler
   * forms. ON by default because the direct host CANNOT work from an IPv4-only network, so
   * the alternative to rewriting is a guaranteed outage. Set to 0 to disable.
   */
  supabasePoolerFallback: bool('SUPABASE_POOLER_FALLBACK', true),
  allowDbSkip: bool('ALLOW_DB_SKIP', false),
  operatorApiKey: required('OPERATOR_API_KEY', 'dev-operator-key-change-me'),
  /**
   * LCX OS front-door passcode: email sign-in requires `email:passcode`.
   *
   * THIS WAS THE ONE SECRET THAT SKIPPED `required()`, AND IT IS THE FRONT DOOR.
   *
   * It read `process.env.DESK_PASSCODE ?? 'test#1234'`. Read the comment on
   * `required()` above — it was written for exactly this hazard and every other real
   * secret already routes through it. With a plain `??`, an unset DESK_PASSCODE in
   * production did not crash the boot and did not log anything: it silently became
   * the literal on this line.
   *
   * Both halves of the resulting credential are public. The roster emails are
   * committed at `packages/shared/src/operators.ts:25-27`, two of them
   * (`monty@lcx.com`, `nik@lcx.com`) with `role: 'approver'`, and the fallback string
   * is committed here and in test fixtures. `middleware/auth.ts:77` compares the
   * supplied passcode against this value and returns `role: 'approver'` on a match.
   * So an unset env var turns `nik@lcx.com:test#1234` into an approver session —
   * the highest desk role, which clears deal sign-off and conflict-clearing.
   *
   * The value still falls back, so nothing crashes and no other credential is affected.
   * What closes the hole is `deskPasscodeIsPublicDefault` below, which
   * `middleware/auth.ts` uses to refuse THIS PATH ONLY when production is running on the
   * public literal. See that flag for why the refusal is at the door and not at boot.
   */
  deskPasscode: deskPasscodeResolved,
  /**
   * TRUE when production is running on the committed literal — WHETHER IT ARRIVED BY
   * DEFAULT OR BY BEING SET TO IT ON PURPOSE. See `deskPasscodeIsPublic()` above for the
   * measurement that showed why "is the variable unset" was the wrong question.
   *
   * WHY THIS IS A FLAG AND NOT A `required()` THROW, WHICH IS WHAT I WROTE FIRST.
   * Routing this through `required()` was correct about the danger and wrong about the
   * remedy: it fails closed AT BOOT, so an API deployed without the variable does not
   * start at all. That trades a silent security hole for an outage of every compartment,
   * including the paths that authenticate perfectly well by JWT or by OPERATOR_API_KEY.
   *
   * Fail closed at the DOOR instead. The process starts, every other credential keeps
   * working, and the ONE path whose secret is publicly known — email + passcode — is the
   * only thing refused (`middleware/auth.ts`). That is the smallest blast radius that
   * still closes the hole, and unlike a boot crash it is visible in a log line rather
   * than in a deploy that rolls back.
   *
   * Setting DESK_PASSCODE to a value that is not the committed literal clears this and
   * restores email sign-in.
   */
  deskPasscodeIsPublicDefault: deskPasscodeIsPublic(),
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

/*
 * SAY IT AT BOOT, NOT AT THE FIRST REFUSED REQUEST.
 *
 * The refusal itself stays at the door — `middleware/auth.ts` turns away the one path
 * whose secret is public and leaves the other seven compartments' credentials serving,
 * because a boot throw here would trade a quiet hole for a total outage. That argument
 * is about where the REFUSAL lives, and it was quietly doing double duty as an argument
 * for where the ANNOUNCEMENT lives. It should not have been: an operator who sets
 * DESK_PASSCODE to the value they found in the repository gets a working sign-in and a
 * `/health` field they have no reason to read, and learns nothing. The refusal is
 * visible only to whoever is refused, which in the dangerous case is the attacker.
 *
 * `console.error` and at module evaluation, so it lands in the Render deploy log next to
 * the database boot lines that are already read there. It is silent in every safe
 * configuration, because a boot line that always prints something about the passcode is
 * a boot line nobody reads.
 *
 * IT NAMES THE VARIABLE, NEVER THE VALUE. Printing the passcode to make the message
 * clearer would publish it into a log aggregator, which is the same class of mistake as
 * committing it — worse, because it would then be public in an environment where it was
 * NOT the committed default.
 */
if (env.deskPasscodeIsPublicDefault) {
  console.error(
    '[auth] DESK_PASSCODE is the value committed to this repository, so it is public. '
      + 'Email + passcode sign-in is REFUSED for every roster member, including approvers, '
      + 'until DESK_PASSCODE is set to a secret that is not in the source tree. '
      + 'The shared OPERATOR_API_KEY and SECONDARY_PASSCODE paths are unaffected.',
  );
}

export type Env = typeof env;
