/**
 * LCX MARKETING — THE GATES SUB-ROUTER. The last seven contracts, plus the one nobody
 * mounted.
 *
 *   POST /v1/marketing/claim-safety              the verdict, and the only copyable text
 *   POST /v1/marketing/review                    the live advisory read, releases no text
 *   GET  /v1/marketing/replies/:id/provenance    what this row is worth believing
 *   POST /v1/marketing/replies/:id/corroborate   one keyless oEmbed read, recorded
 *   GET  /v1/marketing/silence                   the decisions not to answer
 *   POST /v1/marketing/:id/silence               record WHY nothing was said
 *   GET  /v1/marketing/metrics                   the twelve process metrics
 *   GET  /v1/marketing/loop                      the post-mortem packet and the WBR block
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Seven client functions in `apps/web/src/lib/api/marketing.ts` called routes that DID NOT
 * EXIST — they are the list in `MARKETING_CONTRACTS_OWED` — and `deskApi.ts reviewText`
 * called an eighth that nobody had mounted. So four drafting panels rendered 'absent' on a
 * compartment whose engines were fully built and fully tested. This repo has now found
 * that defect four separate times: an engine nothing calls is decoration, and a client
 * function whose route 404s is worse, because the screen says the desk has no data rather
 * than that the desk has no route.
 *
 * NO RULE IS RE-IMPLEMENTED HERE. Every refusal in every response body was produced by the
 * engine that owns the rule — `checkClaimSafety`, `assessMarketAbuse`, `gradeInboundItem`,
 * `recordSilence`, `loop.ts`. What this file owns is validation, SQL, and the assembly of
 * a declared response shape.
 *
 * ── WHERE THIS IS MOUNTED, AND THE ORDERING HAZARD ───────────────────────────
 * `routes/marketing.ts` nests it at `'/'` inside `marketingRoutes`, which `app.ts` mounts
 * at `/v1/marketing`. It MUST be that prefix: the web client already calls these exact
 * paths, and a router mounted anywhere else silently 404s a button that looks correct.
 *
 * `POST /:id/silence` IS THE ONE PATH THAT CAN COLLIDE. `routes/marketing.ts` owns
 * `POST /:id/draft` and `POST /:id/status`, and `routes/marketingDesk.ts` owns
 * `POST /:id/triage`; all four differ only in the literal SECOND segment. Nothing collides
 * today. A future `POST /:id/:anything` in any of the three files would capture all of
 * them and answer 400 on a path that looks right. Every path here is asserted in
 * `__tests__/marketingGatesMount.test.ts`.
 *
 * ── THE CAPABILITY TIER, DECIDED PER ROUTE, AND WHAT `app.ts` ACTUALLY DOES ──
 * `app.ts:requiresOperate` gates GET/HEAD/OPTIONS at `marketing:view` and every POST at
 * `marketing:operate` unless the path is on the `READ_SHAPED_POSTS` allowlist — which
 * lives in `app.ts`, is owned by the integration pass, and is deliberately not edited from
 * here: each entry there was read before it was added, and an exemption must be a code
 * review rather than a side effect of a new router.
 *
 * The four GETs therefore read at `view`, which is correct — all four are SELECT-only.
 * Of the four POSTs:
 *
 *   · `POST /review` is GENUINELY READ-SHAPED. It runs both engines, writes NOTHING, and
 *     returns no releasable text; it is a POST only because a draft does not fit in a
 *     query string. It BELONGS on the `READ_SHAPED_POSTS` allowlist and is not on it, so
 *     today a `view`-granted member gets 403 on the drafting room's live check. That is the
 *     same regression the allowlist comment records for cited Q&A, and the one line the
 *     integration pass needs is stated at the route.
 *   · `POST /claim-safety` STAYS AT `operate`, and this is not an oversight. It releases
 *     `usableText` — the bytes a human copies into X by hand — and doctrine rule 5 means it
 *     therefore writes a `marketing_outbound_gate_decision` row. A route that mutates the
 *     control ledger is a write, so `operate` is right and it must NOT be exempted.
 *   · `POST /replies/:id/corroborate` writes corroboration rows and may update the post
 *     date. A write. `operate`.
 *   · `POST /:id/silence` appends to `object_actions` and moves the queue row. A write.
 *     `operate`.
 *
 * `requireOperator` is on every handler regardless, matching every sibling marketing and
 * GPS route, so the router is never open when mounted bare in a test.
 *
 * ── NOTHING HERE POSTS, AND THERE IS NOWHERE TO ADD IT ───────────────────────
 * There is no X credential in this system and never will be. The only outbound network
 * call any route makes is `fetchOEmbed` — one unauthenticated GET to
 * `publish.twitter.com/oembed` with no body and no header identifying an account. No
 * response shape has a `publish`, `send` or `schedule` field, and the three doors text can
 * leave through belong to `routes/marketing.ts`. A human sends by hand, outside this
 * system.
 *
 * ── ABSENT DATA REFUSES ──────────────────────────────────────────────────────
 * Malformed input is a 400 `VALIDATION` naming the field, because a malformed request is
 * malformed in every environment. Missing STATE is a `Refusal` from the engine or a
 * `Figure` of kind `absent`, never a zero — 0046, 0062 and 0063 are probed separately and
 * each answers for its own tables. A silence write with no rationale is a 422 that leaves
 * NOTHING behind.
 */
import { Hono } from 'hono';
import {
  ENGAGEMENT_VERBS,
  INSTRUMENTS,
  MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
  MARKETING_RULES_DISCLOSURE,
  MARKETING_VOLUME_STATEMENT,
  POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION,
  PRIORITY_MEANING,
  PROCESS_METRIC_KEYS,
  REACH_RANK,
  REFUSAL_CODES,
  REFUSED_METRICS,
  IMPLEMENTED_PROCESS_METRICS,
  claimProvenanceRate,
  clearanceLatencyByRole,
  contradictionDebtMetric,
  ignoreWithRationaleRate,
  lineStalenessMetric,
  nextUpdateBreachCount,
  notKnownNonEmptyRate,
  notificationCensusFrame,
  ownRecordsFrame,
  postMortem,
  preclearedDerivationRate,
  questionCoverageMetric,
  recordSilence,
  refusalCodeFrequency,
  refuseUnobservableMetric,
  retractionCount,
  timeToFirstStatement,
  ttfsBudget,
  unimplementedProcessMetrics,
  wbrMarketingBlock,
  type ActorId,
  type ClearanceLatencyRecord,
  type ClearanceLatencyRow,
  type ClearanceRole,
  type CrisisStatementRecord,
  type DeskItemRecord,
  type EngagementVerb,
  type Figure,
  type FirstStatementRecord,
  type ImpactSeverity,
  type IncidentPhase,
  type IncidentType,
  type Instant,
  type NextUpdateCommitment,
  type ObservationFrame,
  type Polarity,
  type PrecedentStatement,
  type QuestionKey,
  type StatementKind,
  type StatementStanding,
  type PriorityTier,
  type ProcessMetricKey,
  type QuantitativeAssertion,
  type ReachLevel,
  type MarketingRefusalCode as RefusalCode,
  type Refusal,
  type RefusedMetricKey,
  type RuleCitation,
  type SafetyChannel,
  type SilenceRecord,
  type TriageClosureRecord,
  type Verifiability,
} from '@lcx/shared';
import type {
  ClaimSafetyVerdict,
  ClearanceLatencyReading,
  CorroborationResult,
  CorroborationRow,
  CorroborationState,
  FirstStatementReading,
  MarketingLoopReport,
  MetricsStorageState,
  NextUpdateReading,
  ProcessMetrics,
  ProvenanceGrade,
  ReplyProvenanceRecord,
  RefusedMetricRow,
  RetractionReading,
  ReviewVerdict,
  SilenceLog,
  SilenceLogEntry,
  SilenceLogMeta,
} from '@lcx/shared';
/*
 * THE BARREL LINE IS IN. `packages/shared/src/marketing/index.ts` now ends with
 * `export * from './contracts/gates.js';`, and the eighteen names in the block above resolve
 * because of it.
 *
 * KEPT AS A NOTE RATHER THAN DELETED, because the failure it records has now happened twice
 * in this compartment and the second time cost a wave: `@lcx/shared` publishes a single `"."`
 * export, so a deep specifier like `@lcx/shared/marketing/contracts/gates.js` is NOT a
 * workaround — it resolves the types and then fails the emit build with TS6059 (`not under
 * rootDir`), which is the Docker-order failure `gate-must-run-emit-build` exists to catch.
 * If these imports ever go red again, the fix is that one line in the barrel and nothing
 * here. `contracts/desk.ts` records the same handover for the same reason.
 */
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { isMigrated, recordPostedOn, setReplyStatus } from '../marketing/service.js';
import {
  gateOutboundText,
  recordGateDecision,
  type OutboundGateVerdict,
} from '../marketing/outboundGate.js';
import { gradeInboundItem, type InboundItem, type LadderVerdict } from '../marketing/provenanceLadder.js';
import { fetchOEmbed, oembedHealth, type PostRef } from '../marketing/oembed.js';
import {
  buildCorroborations,
  corroborationTablePresent,
  postDateToRecord,
  writeCorroboration,
  type PostTimeCandidate,
} from '../marketing/postTime.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/** 0046. A write answers 503 — the request was valid, the environment is not ready. */
const NOT_MIGRATED = {
  error: 'LCX MARKETING is awaiting migration 0046 on this environment',
  code: 'MIGRATION_PENDING',
} as const;

export const marketingGatesRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * THE ONE POST IN THIS FILE THAT IS A QUESTION, declared here and spread into
 * `app.ts:READ_SHAPED_POSTS`.
 *
 * `POST /review` is a POST only because a 20 000-character body does not fit in a query
 * string. Verified line by line before it was listed, and the property is asserted rather
 * than described: the handler calls `gateOutboundText(getPool(), …)` and nothing else. It
 * contains no `INSERT`, `UPDATE`, `DELETE` or `recordGateDecision`, its response type
 * `ReviewVerdict` has no `usableText` field at all, and `releasesNoText: true` is on the
 * wire. `__tests__/marketingGatesReadShaped.test.ts` re-asserts that against this source, so
 * the day a write appears in that handler while this list still exempts it, it goes red.
 *
 * WHY IT MATTERS THAT IT IS ON THE LIST. `requiresOperate` defaults every non-GET to the
 * write tier. `POST /review` is the drafting room's live engine check — the thing that turns
 * "at least one gate never ran" into a verdict — and a `marketing:view` member is exactly
 * the person who needs to see it and cannot write. Left off the list, every gate on that
 * screen renders UNCHECKED for them with a 403 behind it, which is the silent policy change
 * the allowlist's own docblock in `app.ts` records for cited Q&A.
 *
 * DELIBERATELY ABSENT: `POST /claim-safety` (writes the 0062 gate row and RELEASES text),
 * `POST /replies/:id/corroborate` (writes `marketing_reply_corroboration` and may set
 * `posted_on_displayed`) and `POST /:id/silence` (writes the silence record and moves the
 * queue row). All three mutate; all three stay at `operate`.
 */
export const MARKETING_GATES_READ_SHAPED_POSTS: readonly RegExp[] = [
  /^\/v1\/marketing\/review$/,
];

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE KIT — REFUSE, NAME THE FIELD, NAME THE VALID VALUES                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * A malformed request body. Deliberately NOT a `Refusal`: "you sent `verb: 'retweet'`" is
 * not a regulatory finding, and dressing it as one would put noise into the refusal-code
 * frequency table that `loop.ts` reads to tell the desk which gates are load-bearing.
 * The same class as `routes/marketingDesk.ts:Invalid`, and for the same reason.
 */
class Invalid extends Error {
  constructor(
    readonly field: string,
    readonly why: string,
    readonly validValues: readonly string[] | null = null,
  ) {
    super(`${field}: ${why}`);
    this.name = 'Invalid';
  }
}

const asObject = (field: string, raw: unknown): Record<string, unknown> => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Invalid(field, 'must be an object');
  }
  return raw as Record<string, unknown>;
};

const str = (field: string, raw: unknown, { max = 4000, allowEmpty = false } = {}): string => {
  if (typeof raw !== 'string') throw new Invalid(field, 'must be a string');
  if (!allowEmpty && raw.trim() === '') throw new Invalid(field, 'must not be empty');
  if (raw.length > max) throw new Invalid(field, `must be at most ${String(max)} characters`);
  return raw;
};

const nullableStr = (field: string, raw: unknown, max = 4000): string | null =>
  raw === null || raw === undefined ? null : str(field, raw, { max });

const oneOf = <T extends string>(field: string, raw: unknown, valid: readonly T[]): T => {
  if (typeof raw !== 'string' || !(valid as readonly string[]).includes(raw)) {
    throw new Invalid(field, `must be one of the listed values, received ${JSON.stringify(raw)}`, valid);
  }
  return raw as T;
};

const strArray = (field: string, raw: unknown, max = 200): readonly string[] => {
  if (!Array.isArray(raw)) throw new Invalid(field, 'must be an array');
  if (raw.length > max) throw new Invalid(field, `must hold at most ${String(max)} entries`);
  return raw.map((item, i) => str(`${field}[${String(i)}]`, item, { max: 400 }));
};

const positiveInt = (field: string, raw: string | undefined, fallback: number, cap: number): number => {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Invalid(field, 'must be a positive integer');
  return Math.min(n, cap);
};

const readJson = async (c: { req: { json: <T>() => Promise<T> } }): Promise<Record<string, unknown>> => {
  let raw: unknown;
  try {
    raw = await c.req.json<unknown>();
  } catch {
    throw new Invalid('body', 'must be a JSON object');
  }
  return asObject('body', raw);
};

const replyId = (raw: string | undefined): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Invalid('id', 'must be a positive integer');
  return id;
};

interface Failure { readonly body: Record<string, unknown>; readonly status: 400 | 500 }

function failureFor(route: string, err: unknown): Failure {
  if (err instanceof Invalid) {
    return {
      status: 400,
      body: {
        error: err.message,
        code: 'VALIDATION',
        field: err.field,
        ...(err.validValues === null ? {} : { validValues: err.validValues }),
      },
    };
  }
  console.error(`[marketingGates] ${route} error:`, err);
  return { status: 500, body: { error: 'Failed to serve the marketing gate', code: 'MARKETING_ERROR' } };
}

/** Stamped onto every refusal this ROUTER constructs, so an audit row can be read back. */
const GATES_RULESET_VERSION = 1;

const DESK_POLICY = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

/**
 * Build a refusal this router owns. Every code passed here is already a member of the
 * shared `RefusalCode` union — this file adds no code and widens nothing, which is the
 * ratchet that keeps `loop.ts refusalCodeFrequency`'s never-fired list meaningful.
 */
const refuse = (
  code: RefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: Refusal['recovery'],
  matched: string | null = null,
): Refusal => ({ code, sentence, rule, recovery, matched, ruleSetVersion: GATES_RULESET_VERSION });

const absent = <T>(refusal: Refusal): Figure<T> => ({ kind: 'absent', refusal });
const measured = <T>(value: T, frame: ObservationFrame): Figure<T> => ({ kind: 'measured', value, frame });

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE OUTBOUND GATE — POST /claim-safety AND POST /review                    */
/* ══════════════════════════════════════════════════════════════════════════ */

const VERBS = ENGAGEMENT_VERBS;
const PHASES = ['draft', 'clearance'] as const;

/**
 * `ContentSurface` → `SafetyChannel`. A PROJECTION, NOT A RULE.
 *
 * `checkClaimSafety` is keyed on `SafetyChannel` (which decides the public-timeline test
 * and the length ceiling); the web client sends `ContentSurface` (which decides the
 * approval regime). No map between them exists in `packages/shared`, and the two unions
 * answer different questions, so one has to be stated. It is stated here, ONCE, as a
 * `satisfies Record<ContentSurface, SafetyChannel>` — which fails to compile both when a
 * surface is added to the vocabulary and when a value is invented, so a new surface is a
 * decision somebody makes rather than a default somebody inherits.
 *
 * Seven of the eight surfaces ARE the X account, so they map to `x_public`.
 * `campaign_landing_copy` is a web page and is the only one that is not: mapping it to
 * `x_public` would apply a 280-character ceiling to a landing page and produce a length
 * refusal that is simply false.
 */
const CHANNEL_FOR_SURFACE = {
  bio: 'x_public',
  pinned_post: 'x_public',
  profile: 'x_public',
  reply: 'x_public',
  quote_post: 'x_public',
  original_post: 'x_public',
  thread_in_progress: 'x_public',
  campaign_landing_copy: 'web_page',
} as const satisfies Record<string, SafetyChannel>;

const SURFACES = Object.keys(CHANNEL_FOR_SURFACE) as (keyof typeof CHANNEL_FOR_SURFACE)[];

/**
 * `POST /review` IS THE X DRAFTING ROOM'S LIVE CHECK, so its channel is fixed.
 *
 * `deskApi.ts reviewText` sends `{ text, verb, draftId?, replyId? }` and no surface, and
 * the room it is called from answers X replies. Guessing per-request would mean inferring a
 * channel from a verb, and `x_public` is both the truth here and the strictest of the five
 * — a caller on another channel uses `POST /claim-safety`, which takes the surface.
 */
const REVIEW_CHANNEL: SafetyChannel = 'x_public';

/**
 * The one refusal `/review` always carries, and the reason `regime` is `null` there.
 *
 * The classifier needs the jurisdictions addressed and excluded, the asset treatment, the
 * consideration kind, the product's MiCA perimeter status and the Art 7 role. This request
 * carries none of them, and defaulting any one would CLEAR Art 7 by omission — the exact
 * failure `regime.ts` is built around. So the regime lanes come back `null`, the client
 * renders them UNCHECKED rather than clean, and this sentence says where the real answer
 * lives.
 */
const REGIME_NOT_CLASSIFIED = (): Refusal =>
  refuse(
    'PRODUCT_REGULATORY_STATUS_UNKNOWN',
    'The regime classifier did not run on this request. It needs the jurisdictions addressed and excluded, the asset treatment, the consideration kind, the product’s MiCA perimeter status and the Art 7 role, and none of them travel with a live text check. Nothing here should be read as "no regime applies".',
    DESK_POLICY(
      'gates.regime_needs_its_inputs',
      'A classification is reported only when the facts it turns on were supplied. Defaulting an unanswered input clears the check by omission, which is worse than declining to classify.',
    ),
    {
      kind: 'supply_data',
      missing: 'the full regime input — jurisdictions, asset treatment, consideration kind, product status, Art 7 role',
      whoCanSupply: 'the drafting operator, via POST /v1/marketing/regime',
    },
  );

/**
 * `considerationKind` ABSENT IS NOT `none`.
 *
 * The web client states this requirement above `ClaimSafetyBody` and it is the UCPD limb:
 * an undisclosed paid promotion is a breach whether or not the wording is careful, and no
 * engine reachable from this route evaluates it (`ClaimSafetyInput` has no consideration
 * field; the duty lives in `classifyRegimes`). So an unstated consideration REFUSES here
 * rather than passing silently, and the refusal blocks `usableText` like any other.
 */
const CONSIDERATION_UNSTATED = (): Refusal =>
  refuse(
    'PARTNER_CONSIDERATION_UNKNOWN',
    'This draft does not say whether anyone was paid, gifted or otherwise given consideration for it. An unstated consideration is not "none": the UCPD duty to disclose a paid promotion applies on the fact, not on the wording, and no gate on this route can evaluate it.',
    DESK_POLICY(
      'gates.consideration_absent_is_not_none',
      'A promotional artefact states its consideration kind explicitly. Absence is refused rather than read as an absence of consideration.',
    ),
    {
      kind: 'supply_data',
      missing: 'considerationKind',
      whoCanSupply: 'the drafting operator, or whoever agreed the arrangement',
    },
  );

/** The record that must exist before text is released, and the refusal when it cannot. */
const GATE_RECORD_UNAVAILABLE = (): Refusal =>
  refuse(
    'PUBLISHED_TEXT_NOT_PASTED_BACK',
    'The gate decision could not be written, so no copyable text is returned. A check whose result left no record cannot be produced on demand later, and "it was checked and cleared" is exactly the claim this desk would have to defend.',
    DESK_POLICY(
      'gates.no_copy_path_without_a_record',
      'Text is released for a human to copy only when the decision to release it has been recorded. Where the control ledger is unavailable, the verdict is still returned and the text is not.',
    ),
    {
      kind: 'wait_until',
      condition: 'migration 0062_marketing_gate_decisions.sql is applied on this environment',
    },
  );

/** Never a body field. Letting a client name the actor makes every audit row a suggestion. */
const actorOf = (c: { get: (k: 'operator') => { id: string } | undefined }): ActorId =>
  c.get('operator')?.id ?? 'unknown';

/**
 * Run both gates over one body, and fold in the refusals this ROUTE owns.
 *
 * `extra` refusals are appended to the engine's own list and then `allowed` is RECOMPUTED
 * from the combined list. Appending without recomputing is how `flagged` became `clear`
 * once already in this compartment: the ledger recorded "checked and cleared" for text an
 * engine had refused to call clear.
 */
function foldRefusals(verdict: OutboundGateVerdict, extra: readonly Refusal[]): OutboundGateVerdict {
  if (extra.length === 0) return verdict;
  const refusals = [...verdict.refusals, ...extra];
  return {
    ...verdict,
    refusals,
    allowed: false,
    usableText: null,
    disposition: 'refused',
  };
}

/**
 * THE VERDICT, AND THE ONLY TEXT AN OPERATOR MAY COPY.
 *
 * `namedAssets` FROM THE BODY IS VALIDATED AND NOT USED FOR THE LOOKUP, and that is
 * deliberate rather than an omission: `outboundGate.ts` extracts symbols server-side
 * precisely so the drafter is not in charge of whether the embargo check runs at all, on
 * the one axis they have the most incentive to skip. `assetsExtracted` in the response
 * reports what the gate actually looked up, and `extractionCaveat` states what a lexical
 * extractor cannot see. The field is accepted so a malformed value still 400s rather than
 * being silently dropped.
 *
 * `addressedTo`, `excludedFrom` and `targetText` are validated for the same reason and
 * belong to `POST /regime` and `POST /adoption`; `REGIME_NOT_CLASSIFIED` is not attached
 * here because this route does not claim to classify.
 */
marketingGatesRoutes.post('/claim-safety', requireOperator, async (c) => {
  try {
    const body = await readJson(c);
    const surface = oneOf('surface', body.surface, SURFACES);
    const verb = oneOf<EngagementVerb>('verb', body.verb, VERBS);
    /* Empty is legal: `like` and `repost` produce no text of ours, and `checkClaimSafety`
     * short-circuits on exactly that with a violation rather than a clear. */
    const text = str('text', body.text, { max: 20_000, allowEmpty: true });
    const targetPermalink = nullableStr('targetPermalink', body.targetPermalink, 500);
    const phase = body.phase === undefined ? 'draft' : oneOf('phase', body.phase, PHASES);
    if (body.namedAssets !== undefined) strArray('namedAssets', body.namedAssets, 50);
    if (body.addressedTo !== undefined) strArray('addressedTo', body.addressedTo, 20);
    if (body.excludedFrom !== undefined) strArray('excludedFrom', body.excludedFrom, 20);
    if (body.targetText !== undefined) nullableStr('targetText', body.targetText, 20_000);
    const considerationStated = typeof body.considerationKind === 'string' && body.considerationKind.trim() !== '';

    const actor = actorOf(c);
    const now = new Date().toISOString();
    const pool = getPool();

    const gate = foldRefusals(
      await gateOutboundText(pool, {
        text,
        verb,
        channel: CHANNEL_FOR_SURFACE[surface],
        actor,
        phase,
        targetPermalink,
        now,
      }),
      considerationStated ? [] : [CONSIDERATION_UNSTATED()],
    );

    /*
     * THE RECORD IS WRITTEN BEFORE THE TEXT IS RELEASED, and the release is conditional on
     * it. `recordGateDecision` never throws and returns false when 0062 is absent, so the
     * refusal path here is a stated one rather than an exception.
     */
    const recorded = await recordGateDecision(pool, { replyId: null, verdict: gate, actor, phase, text });
    const recordRefusal = recorded ? null : GATE_RECORD_UNAVAILABLE();

    /*
     * THE RELEASE DECISION, AS ONE BRANCH ON THE VERDICT — not folded into the field
     * initialisers below.
     *
     * Two reasons it is a statement. First, this is the act: everything else in this
     * response is reporting, and the one line that decides whether words leave the server
     * should be readable as such. Second, it is the line
     * `marketing/__tests__/outboundGateCoverage.test.ts` matches to prove this route
     * BRANCHES on the verdict rather than obtaining one and discarding it — the failure mode
     * that looks gated. Written as `gate.allowed && recorded ? … : null` the route was
     * correct and the ratchet could not see it, which is the state that rots.
     */
    let released = true;
    /* The rules refused the words. */
    if (!gate.allowed) released = false;
    /* The words were clear and the decision to release them did not reach the ledger. */
    if (!recorded) released = false;

    const data: ClaimSafetyVerdict = {
      allowed: released,
      usableText: released ? gate.usableText : null,
      disposition: gate.disposition,
      refusals: recordRefusal === null ? gate.refusals : [...gate.refusals, recordRefusal],
      violations: gate.violations,
      blockingViolations: gate.blockingViolations,
      assetsExtracted: gate.assetsExtracted,
      extractionCaveat: gate.extractionCaveat,
      claimSafety: gate.claimSafety,
      marketAbuse: gate.marketAbuse,
      gateError: gate.gateError,
      checkedBy: actor,
      checkedAt: now,
      phase,
      recorded,
      recordRefusal,
      disclosure: MARKETING_RULES_DISCLOSURE,
      cannotPublish:
        'Nothing on this route publishes. There is no X credential in this system and no button anywhere that posts; a named human copies the text above and sends it by hand.',
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    const f = failureFor('claim-safety', err);
    return c.json(f.body, f.status);
  }
});

/**
 * THE LIVE ADVISORY READ. Writes nothing, releases nothing, and says so in its own type.
 *
 * ONE LINE IS OWED IN `app.ts`: `/^\/v1\/marketing\/review$/` on `READ_SHAPED_POSTS`.
 * Until it lands, a `marketing:view` member gets 403 on the drafting room's live check and
 * every gate renders UNCHECKED — the same silent policy change the allowlist's own comment
 * records for cited Q&A. This file cannot add it: the allowlist is `app.ts`'s, and an
 * exemption must be a code review.
 *
 * NO LEDGER ROW, ON PURPOSE. `deskApi.ts` debounces this, so recording every intermediate
 * draft would fill the control ledger with keystrokes and make the one question it exists
 * to answer — was the text a human copied checked? — unreadable. Nothing is released here,
 * so nothing has to be recorded here; `POST /claim-safety` is the recorded path.
 */
marketingGatesRoutes.post('/review', requireOperator, async (c) => {
  try {
    const body = await readJson(c);
    const verb = oneOf<EngagementVerb>('verb', body.verb, VERBS);
    const text = str('text', body.text, { max: 20_000, allowEmpty: true });
    if (body.draftId !== undefined && body.draftId !== null && typeof body.draftId !== 'number') {
      throw new Invalid('draftId', 'must be a number when present');
    }
    if (body.replyId !== undefined && body.replyId !== null && typeof body.replyId !== 'number') {
      throw new Invalid('replyId', 'must be a number when present');
    }

    const actor = actorOf(c);
    const now = new Date().toISOString();
    const gate = await gateOutboundText(getPool(), {
      text,
      verb,
      channel: REVIEW_CHANNEL,
      actor,
      phase: 'draft',
      now,
    });

    const data: ReviewVerdict = {
      /* `null` when the gate did not complete, so the room renders UNCHECKED rather than
       * clean. An empty array here would be the lie. */
      claimSafety: gate.claimSafety === null ? null : gate.claimSafety.verdict.refusals,
      marketAbuse: gate.marketAbuse === null ? null : gate.marketAbuse.refusals,
      regime: null,
      regimes: null,
      regimeRefusal: REGIME_NOT_CLASSIFIED(),
      violations: gate.violations,
      blockingViolations: gate.blockingViolations,
      disposition: gate.disposition,
      assetsExtracted: gate.assetsExtracted,
      extractionCaveat: gate.extractionCaveat,
      gateError: gate.gateError,
      releasesNoText: true,
      reviewedBy: actor,
      reviewedAt: now,
      disclosure: MARKETING_RULES_DISCLOSURE,
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    const f = failureFor('review', err);
    return c.json(f.body, f.status);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 PROVENANCE — GET /replies/:id/provenance AND POST /replies/:id/corroborate */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The columns the ladder and the corroboration writer both need, in one read.
 *
 * Shaped so the same row satisfies `PostTimeCandidate` (which `buildCorroborations`
 * requires) and `InboundItem` (which `gradeInboundItem` requires), so neither is
 * reconstructed twice with a different idea of what the row said.
 */
const REPLY_PROVENANCE_SQL = `
  SELECT id, x_comment_id, x_post_id, author_handle, author_display, body,
         received_at, quarantined, source_kind, sender_auth_state, sender_dkim_domain,
         sender_auth_evidence, posted_on_displayed, posted_at_source
    FROM marketing_x_reply
   WHERE id = $1`;

interface ReplyRow {
  id: number;
  x_comment_id: string;
  x_post_id: string | null;
  author_handle: string;
  author_display: string | null;
  body: string;
  received_at: string | Date;
  quarantined: boolean;
  source_kind: string | null;
  sender_auth_state: string | null;
  sender_dkim_domain: string | null;
  sender_auth_evidence: string | null;
  posted_on_displayed: string | Date | null;
  posted_at_source: string | null;
}

const asInstant = (v: string | Date): Instant => (v instanceof Date ? v.toISOString() : String(v));
const asDateOnly = (v: string | Date | null): string | null =>
  v === null ? null : asInstant(v).slice(0, 10);

/**
 * Rebuild the `InboundItem` the ladder grades, from the columns and NOTHING ELSE.
 *
 * `sender` IS THE FAITHFUL RECONSTRUCTION AND IT IS THE ONLY ONE THE COLUMNS SUPPORT —
 * the same reconstruction `postTime.ts` performs, for the same reason. `sender_auth_state`
 * is the derived state, so `dkimPass` is true only when it literally says `dkim`, and
 * `arcPass` is false because no column records an ARC pass. An item whose columns cannot
 * evidence authentication gets `sender: null`, and the ladder quarantines it with
 * `MKT_PROV_SENDER_UNVERIFIED` — which is the honest answer, not a defect.
 *
 * `oembed: null` MEANS NOT ATTEMPTED BY THIS READ, which is what the ladder's own
 * `email_authenticated_unchecked` rung says. Whether an EARLIER lookup happened is a
 * separate question, answered by the corroboration table and handled in `gradeFor` below.
 */
function inboundItemFrom(row: ReplyRow): InboundItem {
  const authed = row.sender_auth_state === 'dkim' && row.sender_dkim_domain !== null;
  return {
    itemId: row.x_comment_id,
    channel: (row.source_kind ?? 'x_notification_email') as InboundItem['channel'],
    claimedAuthorHandle: row.author_handle,
    claimedPostId: row.x_post_id,
    claimedText: row.body,
    receivedAt: asInstant(row.received_at),
    sender: authed
      ? {
          dkimPass: true,
          dkimDomain: row.sender_dkim_domain,
          arcPass: false,
          arcSealerDomain: null,
          rawAuthenticationResults: row.sender_auth_evidence,
        }
      : null,
    oembed: null,
    syndication: null,
    /* `operator_paste` rows need the named human, and no column holds one. The ladder
     * refuses such a row with `MKT_PROV_NO_OPERATOR` rather than inventing an operator,
     * which is the correct outcome: an assertion with no asserter is not an assertion. */
    operator: null,
    mirrorHost: null,
  };
}

/** `PostTimeCandidate` from the same row. Only reached once the columns are known present. */
function candidateFrom(row: ReplyRow): PostTimeCandidate | null {
  if (row.x_post_id === null || row.sender_dkim_domain === null) return null;
  return {
    id: row.id,
    xCommentId: row.x_comment_id,
    xPostId: row.x_post_id,
    authorHandle: row.author_handle,
    authorDisplay: row.author_display,
    body: row.body,
    postedOnDisplayed: asDateOnly(row.posted_on_displayed),
    receivedAt: asInstant(row.received_at),
    senderDkimDomain: row.sender_dkim_domain,
    senderAuthEvidence: row.sender_auth_evidence,
  };
}

/** The stored corroboration rows for one reply, newest observation first. */
async function readCorroborationRows(
  pool: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> },
  id: number,
): Promise<readonly CorroborationRow[]> {
  const res = await pool.query(
    `SELECT field, channel, outcome, observed_value, detail, undocumented, observed_at
       FROM marketing_reply_corroboration
      WHERE reply_id = $1
      ORDER BY observed_at DESC, id DESC`,
    [id],
  );
  return (res.rows as Record<string, unknown>[]).map((r): CorroborationRow => ({
    field: r.field as CorroborationRow['field'],
    channel: r.channel as CorroborationRow['channel'],
    outcome: r.outcome as CorroborationRow['outcome'],
    observedValue: r.observed_value === null || r.observed_value === undefined ? null : String(r.observed_value),
    detail: r.detail === null || r.detail === undefined ? '' : String(r.detail),
    undocumented: Boolean(r.undocumented),
    observedAt: asInstant(r.observed_at as string | Date),
  }));
}

/** 0062 is not applied here, so nothing is KNOWN about corroboration. Not "none". */
const CORROBORATION_STORAGE_ABSENT = (): Refusal =>
  refuse(
    'CORROBORATION_ABSENT',
    'The table that records corroboration does not exist on this environment, so whether an independent channel has ever agreed with this row is unknown. This is not the same as "not corroborated", and it must not be read as one.',
    DESK_POLICY(
      'gates.absent_storage_is_not_a_negative_result',
      'Where the record of an observation cannot exist, the answer is unknown. An unavailable store reads as a refusal naming what was missing, never as a negative finding about the item.',
    ),
    { kind: 'wait_until', condition: 'migration 0062_marketing_gate_decisions.sql is applied on this environment' },
  );

/**
 * NO LOOKUP HAS EVER BEEN RECORDED for this row. Distinct from an outage, and distinct
 * from storage being absent — all three are separately stated because a boolean would
 * collapse them and the collapse is the defect.
 */
const CORROBORATION_NEVER_ATTEMPTED = (): Refusal =>
  refuse(
    'CORROBORATION_ABSENT',
    'No independent channel has been consulted about this row. The ingest that produced it is forgeable — the mailbox poll has no sender filter — so an uncorroborated row is a claim, not a fact.',
    DESK_POLICY(
      'gates.single_channel_is_not_confirmation',
      'One channel cannot confirm itself. Until a second, independent channel has been asked, the row carries the grade of a single unconfirmed source.',
    ),
    { kind: 'supply_data', missing: 'an oEmbed observation for this post', whoCanSupply: 'any operator, via POST /v1/marketing/replies/:id/corroborate' },
  );

/**
 * READ THE STORED EVIDENCE INTO FIVE STATES, NEVER TWO.
 *
 * The precedence is deliberate and it is the whole safety property: `disagrees` outranks
 * everything (a contradiction needs a human), then `agrees`, and `could_not_check` is
 * reported as ITSELF rather than folded into "no". An outage, a deleted post and a lookup
 * nobody ran are three facts, and the one thing this function may never do is let the first
 * read as the third.
 */
function corroborationStateOf(
  rows: readonly CorroborationRow[],
  storagePresent: boolean,
): CorroborationState {
  if (!storagePresent) {
    return {
      kind: 'storage_absent',
      rows: [],
      lastObservedAt: null,
      sentence: 'Corroboration cannot be read on this environment: the table that holds it has not been created.',
      refusal: CORROBORATION_STORAGE_ABSENT(),
    };
  }
  if (rows.length === 0) {
    return {
      kind: 'never_attempted',
      rows: [],
      lastObservedAt: null,
      sentence: 'No independent channel has been consulted about this row yet.',
      refusal: CORROBORATION_NEVER_ATTEMPTED(),
    };
  }
  const lastObservedAt = rows[0]!.observedAt;
  const disagreed = rows.filter((r) => r.outcome === 'disagrees');
  if (disagreed.length > 0) {
    return {
      kind: 'disagrees',
      rows,
      lastObservedAt,
      sentence: `An independent channel CONTRADICTED this row on ${disagreed.map((r) => r.field).join(', ')}. A named human must read both before anything is quoted from it.`,
    };
  }
  if (rows.some((r) => r.outcome === 'agrees')) {
    return {
      kind: 'agrees',
      rows,
      lastObservedAt,
      sentence: `An independent channel agreed with this row on ${rows.filter((r) => r.outcome === 'agrees').map((r) => r.field).join(', ')}, observed ${lastObservedAt}.`,
    };
  }
  return {
    kind: 'could_not_check',
    rows,
    lastObservedAt,
    sentence: `The corroboration channel was asked at ${lastObservedAt} and did not answer: ${rows[0]!.detail}. That says nothing about this post — it is not evidence against it, and it is not an absence of corroboration.`,
  };
}

/** Project the ladder's graded verdict for a surface. Nothing is recomputed. */
const gradeOf = (v: LadderVerdict): ProvenanceGrade | null =>
  v.state === 'graded'
    ? {
        rung: v.rung,
        admiralty: v.grade.code,
        reliability: v.grade.reliability,
        credibility: v.grade.credibility,
        /* `statement` and `rationale` are the VERDICT's, not the `GradeStamp`'s: the stamp
         * carries the scale and the verdict carries the sentence for the rung it landed on. */
        statement: v.statement,
        rationale: v.rationale,
        confidence: v.grade.confidence,
        needsHumanRead: v.needsHumanRead,
      }
    : null;

/**
 * WHY A GRADE CAN BE `absent` ON A ROW THAT HAS BEEN CORROBORATED.
 *
 * This read makes no network call, so the ladder can only be run with `oembed: null` — and
 * that yields the `email_authenticated_unchecked` rung, whose sentence reads "Corroboration
 * has not been attempted." On a row with a stored lookup that sentence is FALSE, and
 * emitting a false sentence is worse than emitting none.
 *
 * The stored rows cannot repair it either, and that is structural rather than lazy: 0062
 * keeps an observed value ONLY on disagreement, so an agreeing lookup deliberately did not
 * persist X's author or X's text, and the inputs the rung turns on are gone. Faithfully
 * reconstructing the observation is therefore impossible, and reconstructing it
 * unfaithfully would be a second grading scheme.
 *
 * So the grade refuses and names the recovery, which is one button in the same panel. The
 * panel is not left empty: the whole corroboration record is beside it, and
 * `POST /replies/:id/corroborate` returns a grade computed against a live observation.
 */
const GRADE_NEEDS_LIVE_LOOKUP = (at: Instant): Refusal =>
  refuse(
    'FETCH_OUTCOME_UNKNOWN',
    `A corroboration lookup was recorded at ${at}, so this row is not "unchecked" — but this read made no observation of its own, and grading it as unchecked would state something false. Corroborate it again to grade it against a live observation.`,
    DESK_POLICY(
      'gates.a_read_does_not_regrade_on_an_old_observation',
      'A grade is reported only where the observation it rests on was made. A read that cannot observe declines to grade rather than re-using a rung whose own sentence contradicts the record.',
    ),
    { kind: 'supply_data', missing: 'a current oEmbed observation', whoCanSupply: 'any operator, via POST /v1/marketing/replies/:id/corroborate' },
    at,
  );

const QUARANTINE_HAS_NO_GRADE = (code: string, message: string): Refusal =>
  refuse(
    'INBOUND_QUARANTINED',
    `${message} A quarantined row has no grade at all — not F6, not C3, none — because grading it would put a number on an attribution nobody has established.`,
    DESK_POLICY(
      'gates.quarantine_is_not_a_low_grade',
      'Quarantine and the grading ladder are separate namespaces. A held row is held; it is not a source of low confidence.',
    ),
    { kind: 'human_authority', role: 'policy' },
    code,
  );

const LADDER_REFUSED = (code: string, message: string): Refusal =>
  refuse(
    'DATA_ABSENT_NOT_ZERO',
    `${message} No grade is shown, because the ladder declined to produce one for this row.`,
    DESK_POLICY(
      'gates.no_grade_without_the_inputs',
      'The provenance ladder refuses rather than grading a row whose identity, channel or receipt time it cannot read. A refused grade is not a poor one.',
    ),
    { kind: 'supply_data', missing: 'the columns the ladder refused on', whoCanSupply: 'whoever owns the ingest for this channel' },
    code,
  );

/**
 * HOW MUCH THIS ROW IS WORTH BELIEVING.
 *
 * LOAD-BEARING BECAUSE THE INGEST IS FORGEABLE TODAY: `fetchNotificationEmails` searches
 * `{seen:false}` with no sender filter and `RawEmail` has no `from` field
 * (`xMail.ts:81`), so anyone who learns the polled address can inject a fabricated reply
 * that grades identically to a real one until an independent channel disagrees. This route
 * is the only place that difference is visible.
 *
 * READ-ONLY. No lookup, no write, no clock beyond `readAt`.
 */
marketingGatesRoutes.get('/replies/:id/provenance', requireOperator, async (c) => {
  try {
    const id = replyId(c.req.param('id'));
    const pool = getPool();
    if (!(await isMigrated(pool))) return c.json(NOT_MIGRATED, 503);

    const res = await pool.query(REPLY_PROVENANCE_SQL, [id]);
    const row = res.rows[0] as ReplyRow | undefined;
    if (row === undefined) return c.json({ error: 'reply not found', code: 'NOT_FOUND' }, 404);

    const storagePresent = await corroborationTablePresent(pool);
    const rows = storagePresent ? await readCorroborationRows(pool, id) : [];
    const corroboration = corroborationStateOf(rows, storagePresent);

    const verdict = gradeInboundItem(inboundItemFrom(row));
    const readAt = new Date().toISOString();
    /*
     * The frame is the notification census, not a sample of anything: notification mail is
     * a controversy-skewed census of one edge type centred on LCX, and counts derived from
     * it are lower bounds. `lastSuccessfulPollAt` is this row's own receipt instant, which
     * is a LOWER BOUND on the last successful poll — a poll that found nothing leaves no
     * row to read.
     */
    const frame = notificationCensusFrame(asInstant(row.received_at), readAt, asInstant(row.received_at));

    const grade: Figure<ProvenanceGrade> =
      verdict.state === 'quarantined'
        ? absent(QUARANTINE_HAS_NO_GRADE(verdict.code, verdict.message))
        : verdict.state === 'refused'
          ? absent(LADDER_REFUSED(verdict.code, verdict.message))
          : corroboration.lastObservedAt !== null
            ? absent(GRADE_NEEDS_LIVE_LOOKUP(corroboration.lastObservedAt))
            : measured(gradeOf(verdict)!, frame);

    const data: ReplyProvenanceRecord = {
      replyId: row.id,
      xCommentId: row.x_comment_id,
      xPostId: row.x_post_id,
      claimedAuthorHandle: row.author_handle,
      claimedAuthorDisplay: row.author_display,
      /* The COLUMN, not the verdict: the row's held state is what the queue acts on. The
       * ladder's own opinion travels in `quarantineCode` below, and the two disagreeing is
       * itself a finding worth seeing. */
      quarantined: Boolean(row.quarantined),
      quarantineCode: verdict.state === 'quarantined' ? verdict.code : null,
      quarantineMessage: verdict.state === 'quarantined' ? verdict.message : null,
      quarantineRule: verdict.state === 'quarantined' ? verdict.rule : null,
      senderAuth: verdict.state === 'refused' ? null : verdict.senderEvidence,
      senderRefusal:
        row.sender_auth_state === 'dkim'
          ? null
          : refuse(
              'SENDER_AUTHENTICATION_ABSENT',
              'This row carries no DKIM pass, so nothing establishes that the mail it came from was sent by X. The ingest has no sender filter, which makes an unauthenticated row indistinguishable from an injected one.',
              DESK_POLICY(
                'gates.unauthenticated_ingest_is_not_evidence',
                'An inbound item whose sender cannot be authenticated is held, not graded. The absence of a signature is the finding.',
              ),
              { kind: 'not_recoverable', why: 'Authentication is a property of the message as delivered. It cannot be added afterwards, and a later corroboration confirms the POST, not the mail.' },
              row.sender_auth_state,
            ),
      grade,
      corroboration,
      postedOnDisplayed: asDateOnly(row.posted_on_displayed),
      postedAtSource: row.posted_at_source,
      postDateRefusal:
        row.posted_on_displayed === null
          ? refuse(
              'DATA_ABSENT_NOT_ZERO',
              'No post date is held for this row. The mail header date is when the notification was delivered, which is mail latency and not when a human typed — so it is not shown here as a post time.',
              DESK_POLICY(
                'gates.a_mail_date_is_not_a_post_date',
                'The instant a notification arrived is never presented as the instant the post was written. Where X’s own date has not been learned, none is shown.',
              ),
              { kind: 'supply_data', missing: 'X’s own post date', whoCanSupply: 'any operator, via POST /v1/marketing/replies/:id/corroborate' },
            )
          : null,
      receivedAt: asInstant(row.received_at),
      readAt,
      frame,
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    const f = failureFor('replies/:id/provenance', err);
    return c.json(f.body, f.status);
  }
});

/** The breaker is open. Nothing was asked and nothing was written — deliberately. */
const CHANNEL_COOLING = (): Refusal =>
  refuse(
    'FETCH_OUTCOME_UNKNOWN',
    'X’s oEmbed endpoint failed repeatedly and the breaker is open, so this row was not looked up. It is unchanged, not unconfirmed.',
    DESK_POLICY(
      'gates.an_outage_does_not_mark_a_row',
      'While the corroboration channel is cooling, no lookup is attempted and no corroboration row is written. Writing "could not check" for every row during an outage records our own hammering rather than anything about the posts.',
    ),
    { kind: 'wait_until', condition: 'the oEmbed circuit breaker closes — see channelHealth.coolingUntilMs' },
  );

/** The row cannot be looked up at all: no post id, or no authenticated sender to grade from. */
const NOT_A_CANDIDATE = (): Refusal =>
  refuse(
    'DATA_ABSENT_NOT_ZERO',
    'This row cannot be corroborated: a lookup needs X’s own post id and an authenticated sender to grade the result against, and this row is missing one of them.',
    DESK_POLICY(
      'gates.corroboration_needs_an_identity',
      'A corroboration is an agreement between two channels about the SAME post. Without a post id there is nothing to ask about, and without an authenticated first channel there is nothing for an answer to agree with.',
    ),
    { kind: 'not_recoverable', why: 'The missing columns are properties of the message as ingested. Neither can be supplied after the fact without inventing it.' },
  );

/**
 * ONE KEYLESS READ OF A PUBLIC ENDPOINT, AND THE RECORD OF WHAT CAME BACK.
 *
 * A POST BECAUSE IT WRITES, NOT BECAUSE ANYTHING IS SENT ANYWHERE. `fetchOEmbed` issues a
 * single GET to `publish.twitter.com/oembed` with no credential, no body and no header
 * naming an account. It cannot publish, and there is nowhere here to add it.
 *
 * IT IS THE CHEAPEST HIGH-VALUE FIX IN THE PLAN: it repairs the author field, it yields
 * X's own post date so a clock stops measuring mail latency, and — being an independent
 * channel — it is the anti-forgery corroboration the ingest defect needs.
 *
 * THE ORDER IS THE SWEEP'S ORDER, and it is not cosmetic:
 *  1. Refuse if 0062 is absent. A lookup whose evidence cannot be written must not happen.
 *  2. Refuse if the breaker is open. An outage must not mark a row as unconfirmed.
 *  3. One attempt. No retries.
 *  4. Grade through `gradeInboundItem` — the same ladder, with the live result folded in.
 *  5. Write the corroboration rows through `writeCorroboration`, and the post date only
 *     where `postDateToRecord` allows it. Both writers are `postTime.ts`'s, unchanged.
 */
marketingGatesRoutes.post('/replies/:id/corroborate', requireOperator, async (c) => {
  try {
    const id = replyId(c.req.param('id'));
    const actor = actorOf(c);
    const requestedAt = new Date().toISOString();
    const pool = getPool();
    if (!(await isMigrated(pool))) return c.json(NOT_MIGRATED, 503);

    const res = await pool.query(REPLY_PROVENANCE_SQL, [id]);
    const row = res.rows[0] as ReplyRow | undefined;
    if (row === undefined) return c.json({ error: 'reply not found', code: 'NOT_FOUND' }, 404);

    const notAttempted = (refusal: Refusal): CorroborationResult => ({
      replyId: id,
      attempted: false,
      refusal,
      status: null,
      code: null,
      message: null,
      observedAt: null,
      wrote: [],
      postDateRecorded: false,
      postedOnDisplayed: asDateOnly(row.posted_on_displayed),
      grade: absent(refusal),
      quarantinedByLadder: false,
      disagreements: 0,
      degraded: null,
      requestedBy: actor,
      requestedAt,
    });

    if (!(await corroborationTablePresent(pool))) {
      return c.json({ data: notAttempted(CORROBORATION_STORAGE_ABSENT()), meta: meta() }, 200);
    }
    if (oembedHealth(Date.parse(requestedAt)).cooling) {
      return c.json({ data: notAttempted(CHANNEL_COOLING()), meta: meta() }, 200);
    }
    const candidate = candidateFrom(row);
    if (candidate === null) {
      return c.json({ data: notAttempted(NOT_A_CANDIDATE()), meta: meta() }, 200);
    }

    const ref: PostRef = { handle: candidate.authorHandle.replace(/^@/, ''), postId: candidate.xPostId };
    const result = await fetchOEmbed(ref);
    const health = oembedHealth(Date.parse(result.fetchedAt));
    const verdict = gradeInboundItem(
      { ...inboundItemFrom(row), oembed: result },
      { channelCooling: health.cooling },
    );

    const writes = buildCorroborations(candidate, result, verdict);
    for (const w of writes) await writeCorroboration(pool, w);

    const date = postDateToRecord(verdict);
    const postDateRecorded = date === null ? false : await recordPostedOn(pool, candidate.xCommentId, date);

    const wrote: readonly CorroborationRow[] = writes.map((w) => ({
      field: w.field,
      channel: w.channel,
      outcome: w.outcome,
      observedValue: w.observedValue,
      detail: w.detail,
      undocumented: w.undocumented,
      observedAt: w.observedAt,
    }));

    const data: CorroborationResult = {
      replyId: id,
      attempted: true,
      refusal: null,
      status: result.status,
      code: result.code,
      message: result.message,
      observedAt: result.fetchedAt,
      wrote,
      postDateRecorded,
      /* X's own date when this lookup learned one; otherwise whatever was already held.
       * Never the mail header date, on either branch. */
      postedOnDisplayed: result.status === 'confirmed'
        ? (result.post?.postedOnDisplayed ?? asDateOnly(row.posted_on_displayed))
        : asDateOnly(row.posted_on_displayed),
      grade:
        verdict.state === 'quarantined'
          ? absent(QUARANTINE_HAS_NO_GRADE(verdict.code, verdict.message))
          : verdict.state === 'refused'
            ? absent(LADDER_REFUSED(verdict.code, verdict.message))
            : measured(gradeOf(verdict)!, notificationCensusFrame(asInstant(row.received_at), result.fetchedAt, asInstant(row.received_at))),
      quarantinedByLadder: verdict.state === 'quarantined',
      disagreements: writes.filter((w) => w.outcome === 'disagrees').length,
      degraded: health.cooling
        ? 'X’s oEmbed endpoint is cooling after repeated failures. This lookup was graded with the channel marked degraded, so a low grade here reflects the channel and not the row.'
        : null,
      requestedBy: actor,
      requestedAt,
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    const f = failureFor('replies/:id/corroborate', err);
    return c.json(f.body, f.status);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 THE SILENCE LOG — GET /silence AND POST /:id/silence                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE LEDGER COORDINATES, AND THE ONE DRIFT RISK IN THIS FILE, NAMED.
 *
 * `routes/marketingDesk.ts` writes a silence into `object_actions` under
 * `subject_type = 'marketing_x_reply'`, `action = 'marketing_triage_decision'`, and does
 * NOT export either literal. Reading its rows therefore means restating them, and a
 * restated literal is exactly the kind of copy this compartment's barrel comment records
 * fourteen defects about.
 *
 * IT IS NOT LEFT AS A COMMENT. `__tests__/marketingGatesSilence.test.ts` drives
 * `POST /:id/triage` on the REAL desk router with an `ignore`, then `GET /silence` on this
 * one, over ONE in-memory `object_actions` array — so if either literal changes on either
 * side, that test fails rather than the log quietly going empty. A silence that stops
 * appearing in the log is indistinguishable from a silence nobody recorded, which is the
 * defect this route exists to remove.
 */
const REPLY_SUBJECT_TYPE = 'marketing_x_reply';
const TRIAGE_ACTION = 'marketing_triage_decision';
/** This route's own action. A second ENTRY POINT to one record, not a second write path. */
const SILENCE_ACTION = 'marketing_silence_decision';
const SILENCE_ACTIONS: readonly string[] = [SILENCE_ACTION, TRIAGE_ACTION];

const SILENCE_LOG_DEFAULT_LIMIT = 100;
const SILENCE_LOG_MAX_LIMIT = 500;

const TIERS = Object.keys(PRIORITY_MEANING) as PriorityTier[];
const REACH_LEVELS = Object.keys(REACH_RANK) as ReachLevel[];
const VERIFIABILITIES: readonly Verifiability[] = [
  'verifiable_factual',
  'opinion',
  'opinion_resting_on_false_fact',
];

const SILENCE_LOG_SQL = `
  SELECT a.id, a.subject_id, a.action, a.params, a.result, a.actor, a.created_at,
         r.author_handle
    FROM object_actions a
    LEFT JOIN marketing_x_reply r
           ON a.subject_id ~ '^[0-9]+$' AND r.id = a.subject_id::bigint
   WHERE a.subject_type = $1
     AND a.action = ANY($2::text[])
     AND a.result -> 'silence' IS NOT NULL
     AND a.result -> 'silence' <> 'null'::jsonb
   ORDER BY a.created_at DESC, a.id DESC
   LIMIT $3`;

interface LedgerSilenceRow {
  id: string | number;
  subject_id: string;
  action: string;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  actor: string;
  created_at: string | Date;
  author_handle: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Turn one ledger row into one log entry.
 *
 * TOTAL, AND IT REFUSES NOTHING — this is a READ of rows that were already refused-or-
 * accepted at write time, so a field it cannot read comes back as the stored value's
 * absence rather than as a 500. `rationale` empty on a stored row is a FINDING (the client
 * documents that too: "Empty here means the row was written without one"), and it is
 * visible rather than hidden, because the rows that predate this route were written by
 * `POST /:id/status` with no reason at all.
 */
function silenceEntryFrom(row: LedgerSilenceRow): SilenceLogEntry {
  const result = obj(row.result);
  const params = obj(row.params);
  const record = obj(result.silence) as unknown as SilenceRecord;
  const action = obj(params.action);
  const id = Number(row.subject_id);
  return {
    id: String(row.id),
    replyId: Number.isInteger(id) ? id : 0,
    subject: row.author_handle ?? '',
    authorHandle: row.author_handle ?? '',
    disposition: 'ignored',
    reasonCode: typeof params.reason === 'string' ? params.reason : String(action.kind ?? 'ignore'),
    rationale: typeof record.rationale === 'string' ? record.rationale : '',
    decidedBy: typeof record.decidedBy === 'string' ? record.decidedBy : row.actor,
    decidedAt: typeof record.decidedAt === 'string' ? record.decidedAt : asInstant(row.created_at),
    /*
     * ALWAYS NULL, AND THAT IS THE RECORD RATHER THAN A GAP. `SilenceRecord` has no revisit
     * field: a review date belongs to the `monitor` action (`reviewAt`), and a decision that
     * needs revisiting IS a monitor rather than a silence. Synthesising one here would put a
     * commitment in the log that nobody made.
     */
    revisitBy: null,
    linesPrepared: typeof params.linesPrepared === 'string' ? params.linesPrepared : null,
    record,
    priorityAtDecision: record.priorityAtDecision,
    reachAtDecision: record.reachAtDecision,
    verifiabilityAtDecision: record.verifiabilityAtDecision,
    source: row.action === SILENCE_ACTION ? 'silence_decision' : 'triage_decision',
    queueStatusSet: 'ignored',
  };
}

/**
 * THE DECISIONS NOT TO ANSWER.
 *
 * A decision not to answer IS a decision. RESIST 2's lowest tier explicitly means "lines
 * prepared, no response made", and today `POST /:id/status` accepts `'ignored'` and records
 * no reason at all — so the desk's most common decision leaves the least evidence, and a
 * silent ignore is indistinguishable from an oversight.
 *
 * `data` IS AN ARRAY, and that resolves a conflict the web client's own ledger names:
 * `fetchSilenceLog` and `deskApi.ts listSilences` are two fetchers for one route, and
 * `listSilences` does `Array.isArray(rows) ? rows : []`. An envelope object would render
 * `SilenceLog.tsx` as an EMPTY LOG on a desk with recorded silences — a silent zero on the
 * one screen whose entire purpose is that a decision left a trace. So the frame, the
 * storage state and the truncation flag travel in `meta` as `SilenceLogMeta`.
 */
marketingGatesRoutes.get('/silence', requireOperator, async (c) => {
  try {
    const limit = positiveInt('limit', c.req.query('limit'), SILENCE_LOG_DEFAULT_LIMIT, SILENCE_LOG_MAX_LIMIT);
    const pool = getPool();
    const now = new Date().toISOString();

    /*
     * `object_actions` (0029) is applied everywhere, but the JOIN reads 0046's table, so an
     * unmigrated environment answers with a STATED absence rather than an empty log. An
     * empty array on a desk that has recorded silences is the one wrong answer here.
     */
    const migrated = await isMigrated(pool);
    const frame = ownRecordsFrame(
      /* The window is the log's own reach: these are our records, and the earliest one is
       * whatever survived the retention sweep. Truncation by retention is declared rather
       * than discovered, because the 90-day cascade destroys the queue these rows point at
       * while the ledger rows themselves persist. */
      new Date(Date.parse(now) - 365 * 24 * 3_600_000).toISOString(),
      now,
      { truncatedByRetention: true },
    );

    if (!migrated) {
      const metaOut: SilenceLogMeta = {
        timestamp: now,
        version: env.version,
        frame,
        storage: 'absent',
        storageRefusal: refuse(
          'DATA_ABSENT_NOT_ZERO',
          'The silence log cannot be read on this environment: migration 0046 has not been applied, so the queue rows these decisions attach to do not exist. This is not an empty log.',
          DESK_POLICY(
            'gates.an_unreadable_log_is_not_an_empty_one',
            'Where the store cannot be read, the response says so. A zero-length list is reserved for a store that was read and held nothing.',
          ),
          { kind: 'wait_until', condition: 'migration 0046_marketing.sql is applied on this environment' },
        ),
        limit,
        returned: 0,
        truncated: false,
      };
      return c.json({ data: [] as unknown as SilenceLog, meta: metaOut }, 200);
    }

    const res = await pool.query(SILENCE_LOG_SQL, [REPLY_SUBJECT_TYPE, SILENCE_ACTIONS, limit]);
    const rows = res.rows as LedgerSilenceRow[];
    const data: SilenceLog = rows.map(silenceEntryFrom);
    const metaOut: SilenceLogMeta = {
      timestamp: now,
      version: env.version,
      frame,
      storage: 'present',
      storageRefusal: null,
      limit,
      returned: data.length,
      /* A truncated log is not a short one. `===` because the query cannot return more. */
      truncated: data.length === limit,
    };
    return c.json({ data, meta: metaOut });
  } catch (err) {
    const f = failureFor('silence', err);
    return c.json(f.body, f.status);
  }
});

/**
 * THE ASSESSMENT THIS SILENCE RESTS ON, READ FROM THE RECORD AND NEVER FROM THE BODY.
 *
 * `recordSilence` stores the priority, reach and verifiability AS THEY WERE when silence
 * was chosen. A body that stated them would be a decision asserting its own basis, which
 * is not evidence of one — so they come from the reply's newest recorded triage decision,
 * and every one is validated against its vocabulary. An unreadable stored assessment
 * refuses with the same code as a missing one: a silence recorded against an assessment
 * nobody can read is a silence with no basis.
 */
const TRIAGE_BASIS_SQL = `
  SELECT params, result FROM object_actions
   WHERE subject_type = $1 AND subject_id = $2 AND action = ANY($3::text[])
   ORDER BY created_at DESC, id DESC LIMIT 1`;

interface SilenceBasis {
  readonly priority: PriorityTier;
  readonly reach: ReachLevel;
  readonly verifiability: Verifiability;
}

const NO_ASSESSMENT = (why: string): Refusal =>
  refuse(
    'TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION',
    `${why} A silence is a decision, and a decision recorded with no assessment behind it cannot be defended in a review — the priority, the reach and the verifiability at the moment of the decision are what make the row worth keeping.`,
    DESK_POLICY(
      'gates.silence_records_the_assessment_it_rested_on',
      'A recorded silence carries the assessment that was live when it was taken. Where no assessment exists, the silence is refused rather than recorded against invented values.',
    ),
    {
      kind: 'supply_data',
      missing: 'a recorded triage assessment for this reply',
      whoCanSupply: 'the triaging operator, via POST /v1/marketing/:id/triage',
    },
  );

async function readSilenceBasis(
  pool: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> },
  id: number,
): Promise<SilenceBasis | Refusal> {
  const res = await pool.query(TRIAGE_BASIS_SQL, [REPLY_SUBJECT_TYPE, String(id), SILENCE_ACTIONS]);
  const row = res.rows[0] as { params: unknown; result: unknown } | undefined;
  if (row === undefined) return NO_ASSESSMENT('This reply has no recorded triage decision.');

  const result = obj(row.result);
  const params = obj(row.params);
  const stored = obj(result.silence);
  const reading = obj(result.reading);
  const priorityOutcome = obj(reading.priority);
  const trajectory = obj(reading.reachTrajectory);

  /* A previous silence already holds all three, validated when it was written. Prefer it:
   * it is the closest record to the same decision. */
  const rawPriority = stored.priorityAtDecision
    ?? priorityOutcome.tier
    ?? obj(priorityOutcome.derivation).tier;
  const rawReach = stored.reachAtDecision ?? trajectory.level ?? trajectory.toLevel;
  const rawVerifiability = stored.verifiabilityAtDecision ?? params.verifiability;

  try {
    return {
      priority: oneOf<PriorityTier>('storedAssessment.priority', rawPriority, TIERS),
      reach: oneOf<ReachLevel>('storedAssessment.reach', rawReach, REACH_LEVELS),
      verifiability: oneOf<Verifiability>('storedAssessment.verifiability', rawVerifiability, VERIFIABILITIES),
    };
  } catch {
    return NO_ASSESSMENT(
      'This reply has a recorded triage decision whose stored assessment cannot be read as a priority, a reach level and a verifiability.',
    );
  }
}

/**
 * RECORD WHY NOTHING WAS SAID.
 *
 * DISTINCT FROM `setReplyStatus(id, 'ignored')` because the rationale IS the record; a
 * status flip with no reason is precisely the thing this replaces. It also sets the queue
 * status itself, so no surface has to remember to make two calls in the right order.
 *
 * THE WRITE IS REFUSED WITHOUT A RATIONALE, AND NOTHING IS WRITTEN WHEN IT IS. Two gates
 * agree on that and both run: this route's own validator rejects an empty string at the
 * door, and `recordSilence` refuses with `IGNORE_WITHOUT_RATIONALE` and its citation. The
 * engine's refusal is the one returned, because it carries the rule and the recovery; the
 * validator exists so a whitespace-only rationale cannot reach the engine as a plausible
 * one. The refusal is deduplicated by code, because two gates agreeing is not two findings.
 *
 * ORDER: refuse first, write second. The 422 path performs no INSERT and no status change,
 * which a status-code assertion alone would not catch — so the test asserts the absence of
 * the ledger write as well.
 */
marketingGatesRoutes.post('/:id/silence', requireOperator, async (c) => {
  try {
    const id = replyId(c.req.param('id'));
    const body = await readJson(c);
    const reason = str('reason', body.reason, { max: 200 });
    const rationale = str('rationale', body.rationale, { max: 4000 });
    const linesPrepared = nullableStr('linesPrepared', body.linesPrepared, 4000);
    const actor = actorOf(c);
    const now = new Date().toISOString();

    const pool = getPool();
    if (!(await isMigrated(pool))) return c.json(NOT_MIGRATED, 503);

    const reply = await pool.query(
      `SELECT id, author_handle FROM marketing_x_reply WHERE id = $1`,
      [id],
    );
    const replyRow = reply.rows[0] as { id: number; author_handle: string } | undefined;
    if (replyRow === undefined) return c.json({ error: 'reply not found', code: 'NOT_FOUND' }, 404);

    const basis = await readSilenceBasis(pool, id);
    if ('code' in basis) {
      return c.json({
        error: 'This silence was refused and nothing was recorded.',
        code: 'MARKETING_SILENCE_REFUSED',
        refusals: [basis],
      }, 422);
    }

    const outcome = recordSilence({
      action: { kind: 'ignore', rationale },
      decidedBy: actor,
      decidedAt: now,
      priority: basis.priority,
      reach: basis.reach,
      verifiability: basis.verifiability,
    });
    if (outcome.kind === 'refused') {
      return c.json({
        error: 'This silence was refused and nothing was recorded.',
        code: 'MARKETING_SILENCE_REFUSED',
        refusals: [outcome.refusal],
      }, 422);
    }

    const ledger = await pool.query(
      `INSERT INTO object_actions (subject_type, subject_id, action, params, result, actor)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) RETURNING id, created_at`,
      [
        REPLY_SUBJECT_TYPE,
        String(id),
        SILENCE_ACTION,
        JSON.stringify({ action: { kind: 'ignore', rationale }, reason, linesPrepared }),
        JSON.stringify({ silence: outcome.record }),
        actor,
      ],
    );
    const ledgerRow = ledger.rows[0] as { id: string | number } | undefined;
    await setReplyStatus(pool, id, 'ignored');

    const data: SilenceLogEntry = {
      id: String(ledgerRow?.id ?? ''),
      replyId: id,
      subject: replyRow.author_handle,
      authorHandle: replyRow.author_handle,
      disposition: 'ignored',
      reasonCode: reason,
      rationale,
      decidedBy: actor,
      decidedAt: now,
      revisitBy: null,
      linesPrepared,
      record: outcome.record,
      priorityAtDecision: outcome.record.priorityAtDecision,
      reachAtDecision: outcome.record.reachAtDecision,
      verifiabilityAtDecision: outcome.record.verifiabilityAtDecision,
      source: 'silence_decision',
      queueStatusSet: 'ignored',
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    const f = failureFor(':id/silence', err);
    return c.json(f.body, f.status);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 HONEST MEASUREMENT — GET /metrics AND GET /loop                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE WINDOW IS THE RETENTION WINDOW, and that is a collection fact rather than a rule.
 *
 * `MARKETING_RETENTION_DAYS` defaults to 90 and the sweep destroys the queue rows these
 * metrics are derived from, so a longer window would report a fall in every count as
 * though behaviour had changed. `truncatedByRetention` is passed to the frame so the
 * boundary is declared rather than discovered.
 */
const METRICS_WINDOW_DAYS = 90;
const METRICS_MAX_DAYS = 365;
const CORPUS_MAX = 2_000;

/** Which migration owns which table. Probed separately: each answers only for its own. */
async function probeStorage(
  pool: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> },
): Promise<MetricsStorageState> {
  const res = await pool.query(
    `SELECT to_regclass('public.marketing_x_reply')                 IS NOT NULL AS queue,
            to_regclass('public.marketing_outbound_gate_decision')  IS NOT NULL AS gate,
            to_regclass('public.marketing_own_statement')           IS NOT NULL AS memory`,
  );
  const row = (res.rows[0] ?? {}) as Record<string, unknown>;
  const queue = Boolean(row.queue);
  const gate = Boolean(row.gate);
  const memory = Boolean(row.memory);
  const refusals: Refusal[] = [];
  const missing = (what: string, migration: string) =>
    refuse(
      'DATA_ABSENT_NOT_ZERO',
      `${what} cannot be read on this environment, so every metric derived from it is withheld rather than reported as zero. A zero and an absence look identical on a chart and mean opposite things.`,
      DESK_POLICY(
        'measurement.absent_is_not_zero',
        'An unavailable source renders as a refusal naming what was missing, never as a zero.',
      ),
      { kind: 'wait_until', condition: `migration ${migration} is applied on this environment` },
      migration,
    );
  if (!queue) refusals.push(missing('The reply queue', '0046_marketing.sql'));
  if (!gate) refusals.push(missing('The outbound gate-decision ledger', '0062_marketing_gate_decisions.sql'));
  if (!memory) refusals.push(missing('The desk’s own statements and crisis records', '0063_marketing_memory.sql'));
  return {
    queue: queue ? 'present' : 'absent',
    gateLedger: gate ? 'present' : 'absent',
    memory: memory ? 'present' : 'absent',
    refusals,
  };
}

type Queryable = { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> };

/**
 * THE REFUSAL EVENTS, from the one table that records them.
 *
 * `marketing_outbound_gate_decision.refusal_codes` is the only place a fired refusal is
 * persisted, which is why 0062 being absent withholds this metric instead of reporting an
 * empty frequency table. A stored code outside `REFUSAL_CODES` is DROPPED and counted, not
 * coerced: `refusalCodeFrequency` enumerates the union to report which gates have never
 * fired, and letting an unrecognised string in would make that list unreadable.
 */
async function readRefusalEvents(
  pool: Queryable,
  from: Instant,
  to: Instant,
): Promise<{ events: readonly { code: RefusalCode; at: Instant; itemId: string }[]; unrecognised: number }> {
  const res = await pool.query(
    `SELECT id, reply_id, refusal_codes, created_at
       FROM marketing_outbound_gate_decision
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at DESC LIMIT 5000`,
    [from, to],
  );
  const events: { code: RefusalCode; at: Instant; itemId: string }[] = [];
  let unrecognised = 0;
  const known = new Set<string>(REFUSAL_CODES);
  for (const raw of res.rows as Record<string, unknown>[]) {
    const at = asInstant(raw.created_at as string | Date);
    const itemId = raw.reply_id === null || raw.reply_id === undefined
      ? `gate:${String(raw.id)}`
      : `reply:${String(raw.reply_id)}`;
    const codes = Array.isArray(raw.refusal_codes) ? raw.refusal_codes : [];
    for (const code of codes) {
      if (typeof code === 'string' && known.has(code)) events.push({ code: code as RefusalCode, at, itemId });
      else unrecognised += 1;
    }
  }
  return { events, unrecognised };
}

/**
 * ONE STATEMENT ROW → ONE `PrecedentStatement`.
 *
 * THIS DUPLICATES `routes/marketingMemory.ts:toPrecedentStatement`, WHICH IS NOT EXPORTED,
 * and the duplication is stated rather than hidden. It is a projection of 0063's columns
 * onto a shared type — no rule, no threshold and no default that could clear a check —
 * and `__tests__/marketingGatesMetrics.test.ts` asserts that every field of a fully
 * populated row survives the mapping, so a column this forgets is a failing test rather
 * than a silently-null field feeding three metrics. If the memory router ever exports its
 * reader, this should be deleted in favour of it.
 */
function precedentFrom(r: Record<string, unknown>): PrecedentStatement {
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    id: String(r.statement_uid),
    body: String(r.body),
    kind: r.kind as StatementKind,
    subjects: arr(r.subjects) as PrecedentStatement['subjects'],
    questionKey: r.question_key === null || r.question_key === undefined ? null : (String(r.question_key) as QuestionKey),
    polarity: r.polarity as Polarity,
    namedTimeframe: r.named_timeframe === null || r.named_timeframe === undefined ? null : String(r.named_timeframe),
    claims: arr(r.claims) as PrecedentStatement['claims'],
    quantitative: arr(r.quantitative) as readonly QuantitativeAssertion[],
    standing: r.standing as StatementStanding,
    supersedes: r.supersedes === null || r.supersedes === undefined ? null : String(r.supersedes),
    supersededBy: r.superseded_by === null || r.superseded_by === undefined ? null : String(r.superseded_by),
    statedAt: asInstant(r.stated_at as string | Date),
    clearedBy: String(r.cleared_by),
    clearedAt: asInstant(r.cleared_at as string | Date),
    reviewDueAt: r.review_due_at === null || r.review_due_at === undefined ? null : asInstant(r.review_due_at as string | Date),
    derivedFromApprovedLanguageId:
      r.derived_from_approved_language_id === null || r.derived_from_approved_language_id === undefined
        ? null
        : String(r.derived_from_approved_language_id),
    contentHash: String(r.content_hash),
  };
}

const OWN_STATEMENT_SQL = `
  SELECT statement_uid, body, kind, question_key, polarity, named_timeframe, standing,
         supersedes, superseded_by, stated_at, cleared_by, cleared_at, review_due_at,
         derived_from_approved_language_id, content_hash, subjects, claims, quantitative
    FROM marketing_own_statement
   WHERE stated_at >= $1 AND stated_at <= $2
   ORDER BY stated_at DESC LIMIT ${String(CORPUS_MAX)}`;

/** `DeskItemRecord` is the SAME rows, read for the two derivation metrics. */
const deskItemFrom = (s: PrecedentStatement): DeskItemRecord => ({
  id: s.id,
  at: s.statedAt,
  derivedFromApprovedLanguageId: s.derivedFromApprovedLanguageId,
  quantitative: s.quantitative,
});

/** Every triage or silence decision in the window, as a closure record. */
async function readClosures(pool: Queryable, from: Instant, to: Instant): Promise<readonly TriageClosureRecord[]> {
  const res = await pool.query(
    `SELECT subject_id, params, result FROM object_actions
      WHERE subject_type = $1 AND action = ANY($2::text[])
        AND created_at >= $3 AND created_at <= $4
      ORDER BY created_at DESC LIMIT 5000`,
    [REPLY_SUBJECT_TYPE, SILENCE_ACTIONS, from, to],
  );
  return (res.rows as Record<string, unknown>[]).map((row): TriageClosureRecord => {
    const params = obj(row.params);
    const action = obj(params.action);
    const stored = obj(obj(row.result).silence);
    const closedAsIgnore = action.kind === 'ignore';
    return {
      itemId: String(row.subject_id),
      closedAsIgnore,
      /* The RECORDED rationale, from the silence record where one was written. A blank is
       * the defect this metric counts, so it is passed through blank rather than filled. */
      rationale: typeof stored.rationale === 'string'
        ? stored.rationale
        : typeof action.rationale === 'string' ? action.rationale : null,
    };
  });
}

/** Crisis statement instances, for the notKnown rate and the update commitments. */
async function readCrisisStatements(
  pool: Queryable,
  from: Instant,
  to: Instant,
): Promise<{ statements: readonly CrisisStatementRecord[]; commitments: readonly NextUpdateCommitment[] }> {
  const res = await pool.query(
    `SELECT i.instance_uid, i.incident_uid, i.seq, i.phase, i.authored_by, i.authored_at, i.body,
            (SELECT MIN(n.authored_at) FROM marketing_crisis_statement_instance n
              WHERE n.incident_uid = i.incident_uid AND n.seq > i.seq) AS next_authored_at
       FROM marketing_crisis_statement_instance i
      WHERE i.authored_at >= $1 AND i.authored_at <= $2
      ORDER BY i.authored_at DESC LIMIT 2000`,
    [from, to],
  );
  const statements: CrisisStatementRecord[] = [];
  const commitments: NextUpdateCommitment[] = [];
  for (const row of res.rows as Record<string, unknown>[]) {
    const body = obj(row.body);
    const notKnown = Array.isArray(body.notKnown) ? body.notKnown : [];
    statements.push({
      id: String(row.instance_uid),
      phase: String(row.phase) as IncidentPhase,
      /* NON-EMPTY MEANS A LINE THAT SAYS SOMETHING. A whitespace entry is an empty
       * notKnown section with a character in it, and counting it would flatter the desk on
       * the one metric that tracks over-reassurance. */
      notKnownIsNonEmpty: notKnown.some((line) => typeof line === 'string' && line.trim() !== ''),
    });
    const nextUpdateBy = obj(body.nextStep).nextUpdateBy;
    if (typeof nextUpdateBy === 'string' && Number.isFinite(Date.parse(nextUpdateBy))) {
      commitments.push({
        itemId: String(row.instance_uid),
        committedBy: String(row.authored_by),
        nextUpdateBy,
        /*
         * FULFILLED BY THE NEXT STATEMENT IN THE SAME INCIDENT, which is the only evidence
         * the schema holds. No column records "the promised update was made", so the
         * successor statement is the record — and a commitment with no successor is OPEN
         * rather than breached until the clock passes it, which is what
         * `nextUpdateBreachCount` decides.
         */
        fulfilledAt: row.next_authored_at === null || row.next_authored_at === undefined
          ? null
          : asInstant(row.next_authored_at as string | Date),
      });
    }
  }
  return { statements, commitments };
}

/**
 * PER-ROLE CLEARANCE LATENCY, AND THE CLOCK IT ACTUALLY MEASURES.
 *
 * `marketing_crisis_clearance` HAS NO `requested_at` COLUMN. The clock therefore starts at
 * the statement's `authored_at` — composition — and not at the moment a lane was asked,
 * because nothing records the second. That makes every latency here an UPPER BOUND on the
 * lane's own hold time: it includes any delay between the text being written and the lane
 * being asked. It is named in the frame's blind spots rather than presented as a hold time,
 * and it is still the honest bottleneck signal, because the bias is the same for all four
 * lanes.
 */
async function readClearances(pool: Queryable, from: Instant, to: Instant): Promise<readonly ClearanceLatencyRecord[]> {
  const res = await pool.query(
    `SELECT c.role, c.reviewer, c.cleared_at, i.authored_at
       FROM marketing_crisis_clearance c
       JOIN marketing_crisis_statement_instance i ON i.instance_uid = c.instance_uid
      WHERE c.cleared_at >= $1 AND c.cleared_at <= $2
      ORDER BY c.cleared_at DESC LIMIT 2000`,
    [from, to],
  );
  return (res.rows as Record<string, unknown>[]).map((r): ClearanceLatencyRecord => ({
    role: String(r.role) as ClearanceRole,
    requestedAt: asInstant(r.authored_at as string | Date),
    clearedAt: asInstant(r.cleared_at as string | Date),
    reviewer: String(r.reviewer),
  }));
}

/** Incidents, with the budget the engine computes from type and severity. */
async function readIncidents(pool: Queryable, from: Instant, to: Instant): Promise<readonly FirstStatementRecord[]> {
  const res = await pool.query(
    `SELECT incident_uid, incident_type, severity, opened_at, first_statement_at
       FROM marketing_crisis_incident
      WHERE opened_at >= $1 AND opened_at <= $2
      ORDER BY opened_at DESC LIMIT 1000`,
    [from, to],
  );
  return (res.rows as Record<string, unknown>[]).map((r): FirstStatementRecord => ({
    incidentId: String(r.incident_uid),
    /* `opened_at` IS WHEN THE DESK BECAME AWARE, which is 0063's own stated meaning for the
     * column and the only defensible start for this clock. `created_at` would flatter the
     * desk by however long it took somebody to open the record. */
    detectedAt: asInstant(r.opened_at as string | Date),
    firstStatementAt: r.first_statement_at === null || r.first_statement_at === undefined
      ? null
      : asInstant(r.first_statement_at as string | Date),
    /* The engine owns the ladder. This route restates no threshold. */
    budgetMinutes: ttfsBudget(r.incident_type as IncidentType, r.severity as ImpactSeverity).budgetMinutes,
  }));
}

/** The metrics that can never be served here, each with its typed refusal. */
const refusedMetricRows = (): readonly RefusedMetricRow[] =>
  (Object.keys(REFUSED_METRICS) as RefusedMetricKey[]).map((key) => ({
    key,
    reason: REFUSED_METRICS[key].reason,
    substitute: REFUSED_METRICS[key].substitute,
    refusal: refuseUnobservableMetric(key),
  }));

const rateLine = (r: { metric: string; pct: number | null; numerator: number; denominator: number; suppressionReason: string | null }): string =>
  r.pct === null
    ? `${r.metric}: WITHHELD — ${String(r.numerator)}/${String(r.denominator)}. ${r.suppressionReason ?? ''}`.trim()
    : `${r.metric}: ${String(r.pct)}% (${String(r.numerator)}/${String(r.denominator)}).`;

/** Everything both M8 routes load, loaded once. */
interface M8Data {
  readonly storage: MetricsStorageState;
  readonly frame: ObservationFrame;
  readonly from: Instant;
  readonly to: Instant;
  readonly corpus: readonly PrecedentStatement[];
  readonly items: readonly DeskItemRecord[];
  readonly events: readonly { code: RefusalCode; at: Instant; itemId: string }[];
  readonly unrecognisedCodes: number;
  readonly closures: readonly TriageClosureRecord[];
  readonly crisis: readonly CrisisStatementRecord[];
  readonly commitments: readonly NextUpdateCommitment[];
  readonly clearances: readonly ClearanceLatencyRecord[];
  readonly incidents: readonly FirstStatementRecord[];
}

async function loadM8(pool: Queryable, days: number, now: Instant): Promise<M8Data> {
  const from = new Date(Date.parse(now) - days * 24 * 3_600_000).toISOString();
  const storage = await probeStorage(pool);
  const frame: ObservationFrame = {
    ...ownRecordsFrame(from, now, { truncatedByRetention: true }),
    /* ONE NAMED BLIND SPOT ADDED, and it is this router's own: see `readClearances`. The
     * rest of the frame is the engine's and is not edited here. */
    knownBiases: [
      ...ownRecordsFrame(from, now).knownBiases,
      'clearance latency is measured from a statement being composed, not from a lane being asked: no column records the request, so every latency is an upper bound on the lane’s own hold time',
    ],
  };

  const memory = storage.memory === 'present';
  const corpus = memory
    ? (await pool.query(OWN_STATEMENT_SQL, [from, now])).rows.map((r) => precedentFrom(r as Record<string, unknown>))
    : [];
  const crisisRead = memory
    ? await readCrisisStatements(pool, from, now)
    : { statements: [], commitments: [] };
  const gateRead = storage.gateLedger === 'present'
    ? await readRefusalEvents(pool, from, now)
    : { events: [], unrecognised: 0 };

  return {
    storage,
    frame,
    from,
    to: now,
    corpus,
    items: corpus.map(deskItemFrom),
    events: gateRead.events,
    unrecognisedCodes: gateRead.unrecognised,
    closures: storage.queue === 'present' ? await readClosures(pool, from, now) : [],
    crisis: crisisRead.statements,
    commitments: crisisRead.commitments,
    clearances: memory ? await readClearances(pool, from, now) : [],
    incidents: memory ? await readIncidents(pool, from, now) : [],
  };
}

/**
 * THE TWELVE PROCESS METRICS, AND NOTHING ELSE.
 *
 * WHAT THIS RESPONSE NEVER CONTAINS, because it is the honesty ceiling and a panel showing
 * any of them is a defect rather than a feature: impressions, reach, follower delta,
 * engagement rate, click-through, share of voice, audience sentiment. Each needs a
 * denominator that only exists behind an X credential, there is no credential and never
 * will be, and `refusedMetrics` carries the typed refusal where the tile would have been.
 *
 * EVERY FIGURE CARRIES ITS FRAME OR REFUSES. A metric whose source table is absent is
 * `kind: 'absent'` with the migration named — not a zero, and not a suppressed rate, which
 * is a third and different fact. `ProcessRate` already withholds a percentage below n=10
 * and states why; wrapping it in a `Figure` distinguishes "too few to express" from "the
 * records do not exist".
 *
 * COUNTS OF OBSERVED ITEMS ARE LOWER BOUNDS and arrive from the engines already named as
 * such. Nothing here renames one into a total.
 */
marketingGatesRoutes.get('/metrics', requireOperator, async (c) => {
  try {
    const days = positiveInt('days', c.req.query('days'), METRICS_WINDOW_DAYS, METRICS_MAX_DAYS);
    const now = new Date().toISOString();
    const d = await loadM8(getPool(), days, now);

    const gateAbsent = d.storage.gateLedger === 'absent';
    const memoryAbsent = d.storage.memory === 'absent';
    const queueAbsent = d.storage.queue === 'absent';
    const gateRefusal = () => d.storage.refusals.find((r: Refusal) => r.matched === '0062_marketing_gate_decisions.sql')!;
    const memoryRefusal = () => d.storage.refusals.find((r: Refusal) => r.matched === '0063_marketing_memory.sql')!;
    const queueRefusal = () => d.storage.refusals.find((r: Refusal) => r.matched === '0046_marketing.sql')!;

    const refusalsByCode: Figure<ReturnType<typeof refusalCodeFrequency>> = gateAbsent
      ? absent(gateRefusal())
      : measured(refusalCodeFrequency(d.events, d.frame), d.frame);
    const precleared = memoryAbsent
      ? absent<ReturnType<typeof preclearedDerivationRate>>(memoryRefusal())
      : measured(preclearedDerivationRate(d.items, d.frame), d.frame);
    const claimProvenance = memoryAbsent
      ? absent<ReturnType<typeof claimProvenanceRate>>(memoryRefusal())
      : measured(claimProvenanceRate(d.items, d.frame), d.frame);
    const ignoreRate = queueAbsent
      ? absent<ReturnType<typeof ignoreWithRationaleRate>>(queueRefusal())
      : measured(ignoreWithRationaleRate(d.closures, d.frame), d.frame);
    const notKnown = memoryAbsent
      ? absent<ReturnType<typeof notKnownNonEmptyRate>>(memoryRefusal())
      : measured(notKnownNonEmptyRate(d.crisis, d.frame), d.frame);
    const clearanceLatency: Figure<ClearanceLatencyReading> = memoryAbsent
      ? absent(memoryRefusal())
      : measured(clearanceLatencyByRole(d.clearances, d.frame), d.frame);
    const ttfs: Figure<FirstStatementReading> = memoryAbsent
      ? absent(memoryRefusal())
      : measured(timeToFirstStatement(d.incidents, now, d.frame), d.frame);
    const nextUpdate: Figure<NextUpdateReading> = memoryAbsent
      ? absent(memoryRefusal())
      : measured(
          nextUpdateBreachCount({ commitments: d.commitments, recordsAvailable: true }, now, d.frame),
          d.frame,
        );
    /*
     * RETRACTIONS: `recordsAvailable: false`, AND THAT IS THE TRUTH RATHER THAN A STUB.
     *
     * No table in this compartment records a retraction or a deletion.
     * `marketing_own_statement.standing` can hold `'retracted'`, but a standing is a state,
     * not an event: it carries no `at`, no `reason` and no `supersedes` pair, which are the
     * three fields `RetractionRecord` needs and the three a reviewer would ask for. Deriving
     * a retraction event from a standing would put a date and a reason on the record that
     * nobody wrote. `retractionCount` handles the absence itself and returns an absent
     * Figure with its own sentence, which is why the input is passed honestly rather than
     * this metric being omitted.
     */
    const retractions: Figure<RetractionReading> = measured(
      retractionCount(
        { retractions: [], deletionsWithNoLinkedRecord: 0, recordsAvailable: false },
        d.frame,
      ),
      d.frame,
    );
    const debt = memoryAbsent
      ? absent<ReturnType<typeof contradictionDebtMetric>>(memoryRefusal())
      : measured(contradictionDebtMetric(d.corpus, now, d.frame, { truncatedByRetention: true }), d.frame);
    const staleness = memoryAbsent
      ? absent<ReturnType<typeof lineStalenessMetric>>(memoryRefusal())
      : measured(lineStalenessMetric(d.corpus, now, d.frame), d.frame);
    const coverage = memoryAbsent
      ? absent<ReturnType<typeof questionCoverageMetric>>(memoryRefusal())
      : measured(questionCoverageMetric(d.corpus, now, d.frame), d.frame);

    /** Which of the twelve this response actually served. `absent` is not served. */
    const served: ProcessMetricKey[] = [];
    const serve = (key: ProcessMetricKey, f: Figure<unknown>) => { if (f.kind === 'measured') served.push(key); };
    serve('refusal_rate_by_code', refusalsByCode);
    serve('precleared_derivation_rate', precleared);
    serve('claim_provenance_rate', claimProvenance);
    serve('ignore_with_rationale_rate', ignoreRate);
    serve('not_known_non_empty_rate', notKnown);
    serve('clearance_latency_by_role', clearanceLatency);
    serve('time_to_first_statement', ttfs);
    serve('next_update_breach_count', nextUpdate);
    serve('retraction_count', retractions);
    serve('contradiction_debt', debt);
    serve('line_staleness', staleness);
    serve('question_coverage', coverage);

    const lines: string[] = [
      `The desk, ${d.from} to ${d.to}. These twelve metrics are about the DESK, not about an audience.`,
      refusalsByCode.kind === 'measured'
        ? refusalsByCode.value.lines[0]!
        : 'Refusal frequency: WITHHELD — the gate-decision ledger is not available on this environment, so which gates have fired cannot be read.',
      ...[precleared, claimProvenance, ignoreRate, notKnown].map((f) =>
        f.kind === 'measured' ? rateLine(f.value) : `WITHHELD — ${f.refusal.sentence}`),
      debt.kind === 'measured' ? debt.value.sentence : `Contradiction debt: WITHHELD — ${debt.refusal.sentence}`,
      staleness.kind === 'measured' ? staleness.value.sentence : `Line staleness: WITHHELD — ${staleness.refusal.sentence}`,
      coverage.kind === 'measured' ? coverage.value.sentence : `Question coverage: WITHHELD — ${coverage.refusal.sentence}`,
      nextUpdate.kind === 'measured' ? nextUpdate.value.sentence : `Next-update breaches: WITHHELD — ${nextUpdate.refusal.sentence}`,
      retractions.kind === 'measured' ? retractions.value.sentence : `Retractions: WITHHELD — ${retractions.refusal.sentence}`,
      ttfs.kind === 'measured'
        ? `Time to first statement: ${String(ttfs.value.breachCount)} breach(es), ${String(ttfs.value.stillSilentCount)} still silent, ${String(ttfs.value.notAssessable)} not assessable. ${ttfs.value.averageIsWithheld}`
        : `Time to first statement: WITHHELD — ${ttfs.refusal.sentence}`,
      clearanceLatency.kind === 'measured'
        ? clearanceLatency.value.rows.map((r: ClearanceLatencyRow) => r.sentence).join(' ')
        : `Clearance latency: WITHHELD — ${clearanceLatency.refusal.sentence}`,
      d.unrecognisedCodes > 0
        ? `${String(d.unrecognisedCodes)} stored refusal code(s) in this window are not members of the refusal vocabulary and were excluded rather than counted, because an unrecognised code makes the never-fired list unreadable.`
        : 'Every stored refusal code in this window is a member of the refusal vocabulary.',
      `Not shown, and why: ${String((Object.keys(REFUSED_METRICS) as RefusedMetricKey[]).length)} audience metrics are refused by construction. ${REFUSED_METRICS.share_of_voice.reason}`,
      MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
      `Window: ${d.frame.captures} Completeness: ${d.frame.completeness}.`,
    ];

    const data: ProcessMetrics = {
      asOf: now,
      windowFrom: d.from,
      windowTo: d.to,
      frame: d.frame,
      storage: d.storage,
      refusalsByCode,
      preclearedDerivation: precleared,
      claimProvenance,
      ignoreWithRationale: ignoreRate,
      notKnownNonEmpty: notKnown,
      clearanceLatency,
      timeToFirstStatement: ttfs,
      nextUpdateBreaches: nextUpdate,
      retractions,
      contradictionDebt: debt,
      lineStaleness: staleness,
      questionCoverage: coverage,
      metricsDefined: PROCESS_METRIC_KEYS,
      metricsImplemented: IMPLEMENTED_PROCESS_METRICS,
      metricsNotImplemented: unimplementedProcessMetrics(),
      metricsServed: served,
      refusedMetrics: refusedMetricRows(),
      volume: MARKETING_VOLUME_STATEMENT,
      measurementIsAboutTheDesk: MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
      lines,
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    const f = failureFor('metrics', err);
    return c.json(f.body, f.status);
  }
});

/** Monday of the week an instant falls in, `YYYY-MM-DD`, in UTC. */
function weekStartOf(at: Instant): string {
  const d = new Date(Date.parse(at));
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

/**
 * THE POST-MORTEM PACKET AND THE WEEKLY BLOCK.
 *
 * AT n=0 THE VERDICT IS THE REPORT, and this route answers 200. "This desk has recorded no
 * outcomes in the window" is a finding a review can act on; an empty panel is not, and a
 * 404 would read as a broken route. `GET /v1/gps/loop` answers the same way for the same
 * reason.
 *
 * IT IS NOT A SCOREBOARD. `PostMortemReport.refusesToRank` is the literal `true` and it
 * travels whole. Nothing here ranks angles, compares outcomes or names a best-performing
 * anything, because every one of those needs the denominators §5 refuses.
 *
 * `learnings` AND `changes` ARE EMPTY AND THAT IS THE FINDING. No table records either —
 * `postMortem` reports `unevidencedLearnings` and `producedNoChange` precisely so an empty
 * review is legible as an empty review. Synthesising a learning from a metric would be the
 * instrument writing its own post-mortem, which is the decoration
 * `POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION` names.
 */
marketingGatesRoutes.get('/loop', requireOperator, async (c) => {
  try {
    const days = positiveInt('days', c.req.query('days'), METRICS_WINDOW_DAYS, METRICS_MAX_DAYS);
    const now = new Date().toISOString();
    const actor = actorOf(c);
    const d = await loadM8(getPool(), days, now);

    const whatWasSaid = d.corpus.map((s) => ({ itemId: s.id, summary: s.body.slice(0, 200) }));
    const nothingRecorded =
      whatWasSaid.length === 0 && d.events.length === 0 && d.closures.length === 0 && d.crisis.length === 0;

    const report: Figure<ReturnType<typeof postMortem>> =
      d.storage.gateLedger === 'absent' && d.storage.memory === 'absent'
        ? absent(d.storage.refusals[0]!)
        : measured(
            postMortem({
              periodFrom: d.from,
              periodTo: d.to,
              whatWasSaid,
              refusals: d.events,
              learnings: [],
              changes: [],
              frame: d.frame,
            }),
            d.frame,
          );

    const wbr: Figure<ReturnType<typeof wbrMarketingBlock>> =
      d.storage.memory === 'absent'
        ? absent(d.storage.refusals.find((r: Refusal) => r.matched === '0063_marketing_memory.sql')!)
        : measured(
            wbrMarketingBlock({
              weekStart: weekStartOf(now),
              generatedAt: now,
              frame: d.frame,
              items: d.items,
              refusals: d.events,
              clearances: d.clearances,
              closures: d.closures,
              crisisStatements: d.crisis,
              precedentCorpus: d.corpus,
              truncatedByRetention: true,
            }),
            d.frame,
          );

    const data: MarketingLoopReport = {
      periodFrom: d.from,
      periodTo: d.to,
      frame: d.frame,
      storage: d.storage,
      report,
      wbr,
      weekStart: weekStartOf(now),
      verdictAtZero: nothingRecorded
        ? 'This desk has recorded no outcomes in the window: no statement, no refusal, no triage closure and no crisis statement. That is a finding about the desk or about its recording, and it is not an empty screen.'
        : null,
      noChangeWarning:
        report.kind === 'measured' && report.value.producedNoChange
          ? POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION
          : null,
      refusedMetrics: refusedMetricRows(),
      measurementIsAboutTheDesk: MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
      lines: [
        ...(report.kind === 'measured' ? report.value.lines : [`The post-mortem is withheld: ${report.refusal.sentence}`]),
        ...(wbr.kind === 'measured' ? wbr.value.lines : [`The weekly block is withheld: ${wbr.refusal.sentence}`]),
      ],
      composedBy: actor,
      composedAt: now,
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    const f = failureFor('loop', err);
    return c.json(f.body, f.status);
  }
});
