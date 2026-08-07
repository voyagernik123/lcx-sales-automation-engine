import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { getPool } from '../db/index.js';
import { loadControlRegister } from '../access/controlRegister.js';
import { AUDIT_SEAL_DOES_NOT_DETECT, verifyAuditSeal } from '../access/seal.js';
import { entitlementAsOfInstantRequired, entitlementsAsOf } from '../access/asOf.js';
import { env } from '../lib/env.js';

/**
 * THE GOVERNANCE COMPARTMENT'S THREE READS. All are GETs; none writes anything.
 *
 *   GET /v1/governance/control-register     governed acts that succeeded while a
 *                                           control did not run
 *   GET /v1/governance/audit-seal           is the audit log's hash chain installed,
 *                                           and does it hold?
 *   GET /v1/governance/entitlements-as-of   who held which compartment at an instant
 *
 * WHY THE SECOND AND THIRD ARE HERE AT ALL. `verifyAuditSeal` and `entitlementsAsOf`
 * were built, tested against a real Postgres, and had NO PRODUCTION CALLER — every
 * reference outside their own files was a comment or a test. That is this programme's
 * own named failure mode (an engine surfaced in zero reachable files) sitting inside
 * the compartment whose entire job is proving things are what they claim. A seal
 * nobody reads is not evidence, and a replay nobody can run does not answer a
 * regulator. `docs/phases/P5_EVIDENCE.md` records both absences under OUTSTANDING.
 *
 * ── 0069, 0070 AND 0071 ARE NOT APPLIED TO PRODUCTION ────────────────────────
 * So on production today the honest answers are AUDIT_SEAL_NOT_INSTALLED and
 * ENTITLEMENT_LEDGER_ABSENT, and both modules already produce exactly those. Nothing
 * here converts an absent control into a green one, and nothing here converts it into
 * a 500 either: "this control is not installed" is a FINDING and it is published as
 * one, with the migration that would install it named on the payload.
 *
 * ── EVERY REFUSAL IS CARRIED ON A 200, NOT AS AN HTTP ERROR ──────────────────
 * Following `control-register`, whose clamp comes back as REGISTER_OPTIONS_CLAMPED on
 * the payload. These modules return refusals as VALUES in a discriminated union —
 * `not_installed`, `invalid_bounds`, `unknowable`, `unanswerable`, `ledger_absent` —
 * each with a stable code and the rule it applies. Re-encoding some of them as 4xx
 * would put half the vocabulary in the status line and half in the body, and a client
 * that discards non-2xx bodies (the browser's `request()` throws on one) would show an
 * operator a bare "400" where the module wrote a paragraph naming what is missing.
 * A 500 is reserved for a genuine fault — see the catch blocks.
 *
 * GET /v1/governance/control-register — the governed acts that succeeded while a
 * control did not run.
 *
 *   ?windowDays=1..730   how far back to look (default 90)
 *   ?limit=1..500        how many marked acts to fetch per marker family (default 200)
 *
 * Both are clamped by `loadControlRegister`, which REFUSES rather than substitutes: an
 * out-of-range or unreadable value comes back on the payload as REGISTER_OPTIONS_CLAMPED
 * naming what was requested and what was applied. See `asNumber` below.
 *
 * ONE READ AND NOTHING ELSE. Every remedy this register points at already has a
 * write path that owns it — a missing review is filed at `POST /v1/reviews`, a
 * decision is re-opened through the action registry — and a second write path from a
 * report is how two surfaces come to disagree about what "reviewed" means.
 *
 * ── THE GATE IS DECLARED HERE, NOT INHERITED ─────────────────────────────────
 * `app.ts` mounts `requireWorkspace(ws.id, …)` automatically for every prefix in a
 * workspace's `apiPrefixes` (the workspace constitution in `@lcx/shared`).
 * GOVERNANCE declares `/v1/audit`, `/v1/wbr` and `/v1/decisions` — NOT
 * `/v1/governance`. `packages/shared` is owned by another lane this pass, so the
 * automatic gate cannot be extended to cover this route, and mounting it without a
 * gate would publish the register to the whole desk. The middleware is therefore
 * applied explicitly below, which is idempotent with the automatic mount: if
 * `/v1/governance` is later added to `apiPrefixes` this route keeps working
 * unchanged, because `requireWorkspace` authenticates only when it is first in line.
 *
 * WHY THAT GATE MATTERS HERE and not just as a formality: the rows carry
 * `gateDegradedReason` and `overrideReason` verbatim from `audit_log.meta`, and one
 * of the three writing call sites is the GPS discount limb — a compartment that is
 * `machineAccess: false` precisely so machines cannot read a third party's
 * confidential commercial terms. `routes/audit.ts` records at length what happened
 * the last time governance republished another compartment's `meta` unfiltered.
 *
 * WHAT IS DELIBERATELY NOT DONE ABOUT THAT, said out loud rather than implied: this
 * route does NOT apply `routes/audit.ts`'s per-row `gps`/`marketing` capability
 * redaction to the reasons it returns. A GPS `gateDegradedReason` is a fixed
 * server-authored sentence about placeholder price bands and carries no client
 * material today — but that is a property of the current message, not of the field,
 * and the next marker reason could carry more. The redaction belongs in the composer
 * and is owed work; until it exists, this surface is gated at governance `view` and
 * the reasons are as readable as `/v1/audit`'s already are to the same principals.
 */

export const governanceRegisterRoutes = new Hono<{ Variables: AuthVariables }>();

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * THE ENVIRONMENT LABEL. A COPY, AND SAID SO.
 *
 * Byte-identical in shape to `access/controlRegister.ts:environmentLabel` — `nodeEnv ·
 * host` — because the control register already publishes that shape and the three
 * panels on `ControlRegister.tsx` must not disagree about which database they are
 * describing. It is not imported because that function is module-private there and
 * `controlRegister.ts` is another lane's file this pass.
 *
 * `URL.host` is hostname:port and never carries the DSN's credentials. A DSN that does
 * not parse SAYS SO rather than guessing: a figure whose environment is unknown must
 * not silently acquire the label of the one you are looking at.
 */
function environmentLabel(): string {
  let host = 'unknown-host';
  try {
    host = new URL(env.databaseUrl).host || host;
  } catch {
    // No DSN configured (a test, or a boot before env is set).
  }
  return `${env.nodeEnv} · ${host}`;
}

/** The observation frame every figure below is only readable beside. */
const frame = (source: string) => ({
  observedAt: new Date().toISOString(),
  environment: environmentLabel(),
  source,
});

/**
 * ONE OWNER OF THE BOUNDS, AND IT IS THE MODULE, NOT THIS ROUTE.
 *
 * The route used to clamp and `loadControlRegister` did not, which was wrong twice over.
 * The exported function was unsafe on its own — measured: a non-finite `windowDays` threw
 * `Invalid time value`, `-30` produced a window running INTO THE FUTURE and published
 * `windowDays: -30` with no refusal, and `limit: 0` published an empty register for a
 * window in which a marked act had been fetched. And clamping HERE meant the substitution
 * was silent: `?windowDays=-30` came back describing 90 days as though that had been
 * asked for.
 *
 * So the module clamps (it owns WINDOW_DAYS_BOUNDS / LIMIT_BOUNDS) and STATES the clamp
 * as REGISTER_OPTIONS_CLAMPED on the payload. This function only parses: an absent
 * parameter is `undefined` so the module applies its default without refusing, and
 * anything present is passed through as the caller wrote it — including `abc`, which
 * comes back as a refusal naming what was asked for rather than as a quiet 90 days.
 */
function asNumber(raw: string | undefined): number | undefined {
  return raw === undefined || raw === '' ? undefined : Number(raw);
}

governanceRegisterRoutes.get(
  '/control-register',
  requireWorkspace('governance', 'view'),
  requireOperator,
  async (c) => {
    const windowDays = asNumber(c.req.query('windowDays'));
    const limit = asNumber(c.req.query('limit'));
    try {
      const data = await loadControlRegister(getPool(), { windowDays, limit });
      return c.json({ data, meta: meta() });
    } catch (err) {
      /*
       * A 500 AND NOT AN EMPTY REGISTER. `loadControlRegister` already converts the
       * one recoverable fault — 42P01, a migration that has not landed — into a
       * stated refusal with `rows: null`. Anything reaching here is a genuine fault,
       * and the one thing this surface must never do is answer "no controls were
       * missed" because the database was broken.
       */
      console.error('[governance] control register error:', err);
      return c.json(
        {
          error: 'The control register could not be computed. This is a fault, NOT a finding that every control ran.',
          code: 'CONTROL_REGISTER_ERROR',
        },
        500,
      );
    }
  },
);

/* ══════════════════════════════════════════════════════════════════════════════
 *  GET /audit-seal — IS THE AUDIT LOG ACTUALLY SEALED, AND DOES THE CHAIN HOLD?
 *
 *  ?fromSeq=N          walk from this chain position (1 = the beginning)
 *  ?maxRows=N          cap the walk; a capped walk does NOT cover the whole chain
 *  ?crossCheckCanon=1  also re-derive the canonical string in TypeScript
 *
 *  THE BOUNDS ARE NOT CLAMPED HERE AND THAT IS DELIBERATE. `verifyAuditSeal` refuses
 *  an unusable bound under AUDIT_SEAL_INVALID_BOUNDS rather than ignoring it, because
 *  an IGNORED bound makes the verdict BROADER than the caller asked for — `maxRows:
 *  NaN` used to drop the LIMIT and answer `coversWholeChain: true`. `asNumber` passes
 *  `abc` through as NaN precisely so that refusal is reachable from the wire.
 *
 *  WHAT THE PAYLOAD MUST CARRY BESIDE THE VERDICT, and why it is not optional:
 *  `doesNotDetect` is `AUDIT_SEAL_DOES_NOT_DETECT`, published on EVERY response
 *  including a broken and a not-installed one. An `intact` verdict is not evidence
 *  against whoever holds this API's own database credential — ownership permits
 *  ALTER TABLE … DISABLE TRIGGER ALL and a re-chain that this verifier reports as
 *  intact (P5_EVIDENCE F9, proven by probe, not argued). The repo has carried the
 *  opposite claim once already.
 * ════════════════════════════════════════════════════════════════════════════ */
governanceRegisterRoutes.get(
  '/audit-seal',
  requireWorkspace('governance', 'view'),
  requireOperator,
  async (c) => {
    const fromSeq = asNumber(c.req.query('fromSeq'));
    const maxRows = asNumber(c.req.query('maxRows'));
    const raw = c.req.query('crossCheckCanon');
    const crossCheckCanon = raw === '1' || raw === 'true';
    try {
      const verification = await verifyAuditSeal(getPool(), { fromSeq, maxRows, crossCheckCanon });
      return c.json({
        data: {
          control: 'audit_seal',
          /** Named so a not-installed answer points at what would install it. */
          migration: '0070_audit_seal.sql',
          frame: frame('audit_log + audit_seal_state'),
          verification,
          doesNotDetect: AUDIT_SEAL_DOES_NOT_DETECT,
        },
        meta: meta(),
      });
    } catch (err) {
      /*
       * A 500, AND EXPLICITLY NOT A VERDICT. `verifyAuditSeal` already converts the one
       * recoverable fault — 42P01/42703/42883, the migration that has not landed — into
       * `not_installed`. Anything reaching here is a genuine fault, and the one thing
       * this surface must never do is answer "the chain is fine" because the database
       * was broken, or "the seal is missing" because a query timed out.
       */
      console.error('[governance] audit seal verification error:', err);
      return c.json(
        {
          error:
            'The audit seal could not be verified. This is a FAULT, not a verdict: it is '
            + 'neither a finding that the chain is intact nor a finding that the seal is '
            + 'absent. Nothing about the integrity of audit_log follows from this response.',
          code: 'AUDIT_SEAL_VERIFICATION_ERROR',
        },
        500,
      );
    }
  },
);

/* ══════════════════════════════════════════════════════════════════════════════
 *  GET /entitlements-as-of — WHO HELD WHICH COMPARTMENT AT AN INSTANT?
 *
 *  ?at=<ISO-8601>   REQUIRED. Absent is refused, never defaulted to now().
 *  ?memberId=…      optional narrowing
 *  ?workspace=…     optional narrowing
 *
 *  `at` IS PASSED AS THE CALLER WROTE IT. Not parsed into a `Date` first: a `Date`
 *  holds milliseconds and `occurred_at` holds microseconds, so round-tripping an
 *  instant read out of the ledger lands up to 999µs EARLY and `occurred_at <= at`
 *  then excludes the very event the operator clicked on. `entitlementsAsOf` hands the
 *  string to Postgres and lets ONE parser decide — which is also what makes
 *  'yesterday' and '-infinity' reachable as refusals instead of as answers.
 *
 *  THIS READS ANOTHER COMPARTMENT'S MEMBERSHIP, so the gate is not a formality: the
 *  holdings name members, the compartments they could read, and the justification
 *  text a step-up recorded. It is gated at governance `view` — the same tier as the
 *  control register — because an entitlement history IS governance evidence.
 *
 *  WHAT THAT GATE DOES NOT DO, said plainly rather than implied: it does NOT keep
 *  machines out. `governance` declares `machineAccess: true` (packages/shared
 *  workspaces.ts), so the shared operator key is handed `operate` on this compartment
 *  without a database lookup, and `requireOperator` is AUTHENTICATION, not a human
 *  test — `reviewsCompartment.test.ts` records what happens when the two are confused.
 *  Both new reads here are therefore readable by cron and by the AI operator, exactly
 *  as `/v1/audit` already is to the same principals. If entitlement history should be
 *  human-only, that is a change to the workspace constitution, not to this file, and
 *  it is named as owed work rather than quietly assumed.
 * ════════════════════════════════════════════════════════════════════════════ */
governanceRegisterRoutes.get(
  '/entitlements-as-of',
  requireWorkspace('governance', 'view'),
  requireOperator,
  async (c) => {
    const at = c.req.query('at');
    // An empty string is NOT a narrowing — it is an absent narrowing, and passing ''
    // through as a scope would refuse UNKNOWN_SCOPE for a member nobody asked about.
    const memberId = c.req.query('memberId')?.trim() || null;
    const workspace = c.req.query('workspace')?.trim() || null;
    const scope = { memberId, workspace };

    if (at === undefined || at.trim() === '') {
      return c.json({
        data: {
          control: 'entitlement_ledger',
          migration: '0071_grant_ledger.sql',
          frame: frame('entitlement_events'),
          answer: entitlementAsOfInstantRequired(at, scope),
        },
        meta: meta(),
      });
    }

    try {
      const answer = await entitlementsAsOf(getPool(), { at, memberId, workspace });
      return c.json({
        data: {
          control: 'entitlement_ledger',
          migration: '0071_grant_ledger.sql',
          frame: frame('entitlement_events'),
          answer,
        },
        meta: meta(),
      });
    } catch (err) {
      /*
       * Same reasoning as the seal above. `entitlementsAsOf` converts 42P01/42703 into
       * `ledger_absent` and 22007/22008/22P02 into UNPARSEABLE_INSTANT, so anything here
       * is a fault — and answering it with an empty holder set would assert that nobody
       * held the compartment, which is the single claim this module exists to refuse.
       */
      console.error('[governance] entitlement as-of error:', err);
      return c.json(
        {
          error:
            'The entitlement replay could not be run. This is a FAULT, not an answer: it is '
            + 'not a finding that nobody held this compartment, and it is not a finding that '
            + 'the ledger is absent.',
          code: 'ENTITLEMENT_AS_OF_ERROR',
        },
        500,
      );
    }
  },
);
