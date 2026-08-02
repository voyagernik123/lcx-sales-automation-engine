/**
 * LCX MARKETING — THE DESK ROUTER. Four engines that had no caller, given one.
 *
 *   POST /v1/marketing/regime         which MiCA regimes bite, and the Art 7 arithmetic
 *   POST /v1/marketing/triage/assess  the RESIST 2 assessment for a queued reply
 *   POST /v1/marketing/:id/triage     record the decision (an 'ignore' needs a rationale)
 *   POST /v1/marketing/adoption       what LCX would be ADOPTING, and every refusal
 *   GET  /v1/marketing/desk           the board: mode, standing, the doors, the counts
 *   POST /v1/marketing/desk-mode      set the mode, including an Art 94 suspension
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `regime.ts` (2,216 lines), `triage.ts` (2,603), `adoption.ts` (2,034) and
 * `deskMode.ts` (1,308) were built, tested to 1,200-line test files, and imported by
 * NOTHING in `apps/api/src`. An engine nothing calls is decoration; this repo has now
 * found that defect three separate times. These six routes are the thin, honest layer
 * over them: no rule is re-implemented here, no threshold is re-stated, and every
 * refusal in a response body was produced by the engine that owns the rule.
 *
 * ── WHERE THIS IS MOUNTED ────────────────────────────────────────────────────
 * `routes/marketing.ts` nests it at `'/'` inside `marketingRoutes`, which `app.ts` mounts
 * at `/v1/marketing` from the workspace registry. It MUST be that prefix:
 * `apps/web/src/lib/api/marketing.ts` already calls `/v1/marketing/desk` and
 * `/v1/marketing/desk-mode`, and a router mounted anywhere else silently 404s a button
 * that looks correct. Nesting rather than a fourth `app.route` line keeps this file inside
 * both the compartment gate and the outbound-classification ratchet — the argument is at
 * the mount, and every path is verified in `__tests__/marketingMount.test.ts`.
 *
 * ROUTE-ORDERING HAZARD, and it is already recorded in the web client's ledger:
 * `routes/marketing.ts` owns `POST /:id/draft`, `GET /:id/drafts` and
 * `POST /:id/status`. Every path here differs in its literal FIRST segment
 * (`regime`, `triage`, `adoption`, `desk`, `desk-mode`) except `POST /:id/triage`,
 * which differs in its literal SECOND. Nothing collides today. A future
 * `POST /:id/:anything` in either file would capture all of them and answer 400 on a
 * path that looks right.
 *
 * ── THE CAPABILITY TIER IS DECIDED IN app.ts, NOT HERE ───────────────────────
 * `app.ts:requiresOperate` gates GET/HEAD/OPTIONS at `marketing:view` and everything
 * else at `marketing:operate`, unless the path is on the `READ_SHAPED_POSTS`
 * allowlist. So `GET /desk` reads at 'view' and all five POSTs write-tier at
 * 'operate'. THREE OF THEM MUTATE NOTHING — `/regime`, `/triage/assess` and
 * `/adoption` are POSTs only because a classification input does not fit in a query
 * string. They are deliberately NOT added to that allowlist by this file: the
 * allowlist lives in `app.ts`, each entry there was read before it was added, and an
 * exemption is a code review rather than a side effect of a new router. The
 * consequence is stated rather than hidden: a `view`-only member cannot ask "what
 * would this adopt?". `requireOperator` is on every handler, matching every sibling
 * marketing and GPS route, so the router is never open when mounted bare in a test.
 *
 * ── NOTHING HERE POSTS, AND THERE IS NOWHERE TO ADD IT ───────────────────────
 * There is no X credential in this system and never will be. `POST /adoption` answers
 * "what would this act adopt, and what refuses it" — it does not perform the act, and
 * the only three doors text can leave through (`handoff`, `copy_out`,
 * `export_for_posting`) belong to `routes/marketing.ts`. `GET /desk` reports the
 * refusal each of those doors would give under the live mode; a suspended desk refuses
 * outbound and says so, in the sentence `gateDeskAct` wrote.
 *
 * ── WHERE THE MODE IS STORED, AND WHY IT IS NOT A NEW TABLE ──────────────────
 * `object_actions` (migration 0029, applied everywhere) is an append-only ledger of
 * `{subject_type, subject_id, action, params, result, actor, created_at}`. The desk
 * mode is written there as a sequence of transitions and the current mode is the
 * newest row — which is what `deskMode.ts:671` already says the record IS: "The record
 * of a mode change. This, and not the mode column, is the evidence." No migration is
 * added by this wave (0057-0062 are off limits and a seventh marketing migration is
 * not this router's to invent), and the append-only shape is strictly better than a
 * mutable column: a mode that was lifted and re-imposed keeps both facts.
 *
 * TWO CONSEQUENCES, both real and both handled. (1) A concurrent second writer could
 * read the same `from` mode and append a transition computed against a stale base, so
 * every append takes a transaction-scoped advisory lock on one key — the mode ledger
 * is serialised, and `pg_advisory_xact_lock` blocks rather than failing, because a
 * mode change is a governance act and dropping one is worse than waiting. (2) The
 * ledger has no unique constraint tying it to the desk, so ordering is
 * `created_at DESC, id DESC`; under the lock two appends cannot share an instant.
 *
 * ── ATTRIBUTION IS NEVER A BODY FIELD ────────────────────────────────────────
 * `decidedBy`, `assessedBy`, `imposedBy`, `recordedBy` and `by` all come from
 * `c.get('operator')`. Letting a client name the actor would make every audit row a
 * suggestion — the same rule `routes/marketing.ts:approve` states for approvals.
 * `byRoles` is the one exception and it is validated, not trusted for identity: the
 * roster holds no clearance-role column, so the caller states which CERC lanes the
 * signed-in human holds and the transition record carries that claim next to their id.
 * That is a NAMED weakness, not a silent one: `DEFAULT_MODE_CHANGE_POLICY` can then be
 * satisfied by a single person asserting `['legal']`, exactly as doctrine rule 8 says
 * one shared passcode is not four eyes.
 *
 * ── ABSENT DATA REFUSES ──────────────────────────────────────────────────────
 * Malformed input is a 400 `VALIDATION` naming the field and the valid values, because
 * a malformed request is malformed in every environment. Missing STATE is a `Refusal`
 * from the engine, with its code, its rule and its recovery. Migration 0046 pending is
 * a 503 on a write and an `absent` `Figure` on the board — never a zero. The mode
 * itself stays readable in that window, because `object_actions` does not depend on
 * 0046 and a regulator's suspension recorded during a migration gap must still shut
 * the desk.
 */
import { Hono } from 'hono';
import {
  ART_7_LINK_TO_COMPLIANT_PAGE,
  CONFIDENCE_DEFINITION,
  CONSIDERATION_DUTY,
  DEFAULT_MODE_CHANGE_POLICY,
  DESK_MODE_RULESET_VERSION,
  ENGAGEMENT_VERBS,
  INBOUND_SOURCE_RELIABILITY,
  INSTRUMENTS,
  ITEM_PURPOSES,
  OBSERVATION_RULESET_VERSION,
  OUTBOUND_ACTS,
  PRIORITY_MEANING,
  REACH_LEVEL_DESCRIPTION,
  REACH_RANK,
  RESPONSE_KINDS,
  SUSPENSION_POWER_CITATION,
  SURFACE_CLASS,
  TIER_LEADING_RESPONSES,
  admiraltyCode,
  applyPriority,
  assessAmplification,
  assessAuthorityOrder,
  checkGrade,
  checkReach,
  checkResponseAction,
  classifyRegimes,
  derivePriority,
  deskPolicy,
  deskStanding,
  gateDeskAct,
  gateOpinion,
  notificationFrame,
  ownCorpusFrame,
  readTemplateReuse,
  readTriageClock,
  reachTrajectory,
  recordSilence,
  requestModeChange,
  standingFromOrder,
  suggestFirstIndicators,
  type ActorId,
  type AdvantageClaim,
  type AmplificationRequest,
  type AuthorityOrder,
  type Art7DisclosureBlock,
  type Art7Role,
  type AssetEmbargoState,
  type AssetFact,
  type AssetKind,
  type AssetTreatment,
  type ClearanceRole,
  type Confidence,
  type ConsiderationKind,
  type ContentSurface,
  type Corroboration,
  type CorroboratedField,
  type Credibility,
  type DeskMode,
  type DeskStanding,
  type EngagementVerb,
  type Figure,
  type Graded,
  type HoldingsDeclarationState,
  type ImpactRow,
  type ImpactSeverity,
  type InboundProvenance,
  type InboundSourceKind,
  type Instant,
  type LcxAdmissionStatus,
  type MarketingJurisdiction,
  type ModeChangeRequest,
  type ModeTransition,
  type NamedProduct,
  type OrderAssessment,
  type OrderScope,
  type PartnerRegisterLookup,
  type PriorityTier,
  type ProductRegulatoryStatus,
  type QuarantineReason,
  type ReachAssessment,
  type ReachLevel,
  type Refusal,
  type RefusalCode,
  type RegimeInput,
  type Reliability,
  type ResponseAction,
  type SilenceRecord,
  type SpeakerCapacity,
  type SuspensionPower,
  type TargetVerificationState,
  type TemplateReuseReading,
  type Verifiability,
  type WhitePaperState,
  type WorkingDayCalendar,
} from '@lcx/shared';
import type {
  AdoptionReading,
  Art7FitStatement,
  DeskBoard,
  DeskModeHistoryEntry,
  DeskModeRecord,
  DeskOutboundGateRow,
  DeskQueueCounts,
  ReachLadderRung,
  RegimeReading,
  TriageDecisionRecord,
  TriageReading,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import { isMigrated, queueSummary, setReplyStatus } from '../marketing/service.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

/**
 * Migration 0046. Writes answer 503 — the request was valid and would have worked, the
 * environment is not ready — exactly as `routes/marketing.ts` does. Never 500.
 */
const NOT_MIGRATED = {
  error: 'LCX MARKETING is awaiting migration 0046 on this environment',
  code: 'MIGRATION_PENDING',
} as const;

export const marketingDeskRoutes = new Hono<{ Variables: AuthVariables }>();

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE VALIDATION KIT — REFUSE, NAME THE FIELD, NAME THE VALID VALUES        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * A malformed request body. Carries the field and, where the field is a vocabulary,
 * every value it accepts — the `validateDrill` discipline from `routes/gpsBook.ts`: a
 * refusal that does not name the valid values sends the caller back to the source.
 *
 * This is deliberately NOT a `Refusal`. `Refusal` means "the rules forbid this act",
 * carries a rule citation and a recovery, and belongs to the engines. "You sent
 * `verb: 'retweet'`" is not a regulatory finding, and dressing it as one would put
 * noise into the refusal-code frequency table that `loop.ts` reads to tell the desk
 * which gates have never fired.
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

/** Keys of an exhaustive `Record`, as the union. The map IS the valid-value list. */
const keysOf = <T extends string>(map: Record<T, unknown>): readonly T[] =>
  Object.keys(map) as T[];

const asObject = (field: string, raw: unknown): Record<string, unknown> => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Invalid(field, 'must be an object');
  }
  return raw as Record<string, unknown>;
};

const oneOf = <T extends string>(field: string, raw: unknown, valid: readonly T[]): T => {
  if (typeof raw !== 'string' || !(valid as readonly string[]).includes(raw)) {
    throw new Invalid(field, `must be one of the listed values, received ${JSON.stringify(raw)}`, valid);
  }
  return raw as T;
};

const str = (field: string, raw: unknown, { max = 4000, allowEmpty = false } = {}): string => {
  if (typeof raw !== 'string') throw new Invalid(field, 'must be a string');
  if (!allowEmpty && raw.trim() === '') throw new Invalid(field, 'must not be empty');
  if (raw.length > max) throw new Invalid(field, `must be at most ${String(max)} characters`);
  return raw;
};

const nullableStr = (field: string, raw: unknown, max = 4000): string | null =>
  raw === null || raw === undefined ? null : str(field, raw, { max });

const bool = (field: string, raw: unknown): boolean => {
  if (typeof raw !== 'boolean') throw new Invalid(field, 'must be true or false');
  return raw;
};

/**
 * `Known<boolean>` — `true`, `false` or the literal `'unknown'`.
 *
 * A missing key is NOT coerced to `false`. `regime.ts` widens the regime set on
 * `'unknown'` and refuses on an unanswered giveaway question, and defaulting to `false`
 * would clear a check by omission.
 */
const knownBool = (field: string, raw: unknown): boolean | 'unknown' => {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'unknown' || raw === undefined || raw === null) return 'unknown';
  throw new Invalid(field, "must be true, false or 'unknown'");
};

/** ISO-8601 that `Date.parse` can actually read. `INSTANT_UNPARSEABLE`, at the door. */
const instant = (field: string, raw: unknown): Instant => {
  const s = str(field, raw, { max: 64 });
  if (!Number.isFinite(Date.parse(s))) {
    throw new Invalid(field, 'must be an ISO-8601 instant a clock can read, e.g. 2026-08-03T09:15:00.000Z');
  }
  return s;
};

const nullableInstant = (field: string, raw: unknown): Instant | null =>
  raw === null || raw === undefined ? null : instant(field, raw);

const arrayOf = <T>(field: string, raw: unknown, each: (item: unknown, i: number) => T, max = 200): readonly T[] => {
  if (!Array.isArray(raw)) throw new Invalid(field, 'must be an array');
  if (raw.length > max) throw new Invalid(field, `must hold at most ${String(max)} entries`);
  return raw.map((item, i) => each(item, i));
};

const strArray = (field: string, raw: unknown, max = 200): readonly string[] =>
  arrayOf(field, raw, (item, i) => str(`${field}[${String(i)}]`, item, { max: 400 }), max);

/* ── The vocabularies, each pinned to its union ─────────────────────────────
 *
 * Where the shared package already publishes an exhaustive map or list, the valid
 * values are DERIVED from it, so they cannot drift. Where it publishes only the type,
 * the list below is written as an object literal with `satisfies Record<Union, true>`
 * — which fails to compile both when a member is missing and when one is invented. So
 * adding a value to a vocabulary in `packages/shared` breaks this file until someone
 * has decided whether the route accepts it. A plain `as const` array would have
 * accepted the drift silently, which is the whole failure mode.
 */
const VERBS = ENGAGEMENT_VERBS;
const PURPOSES = ITEM_PURPOSES;
const SURFACES = keysOf<ContentSurface>(SURFACE_CLASS);
const CONSIDERATIONS = keysOf<ConsiderationKind>(CONSIDERATION_DUTY);
const CONFIDENCES = keysOf<Confidence>(CONFIDENCE_DEFINITION);
const REACH_LEVELS = keysOf<ReachLevel>(REACH_RANK);
const TIERS = keysOf<PriorityTier>(PRIORITY_MEANING);
const POWERS = keysOf<SuspensionPower>(SUSPENSION_POWER_CITATION);
/** Derived from the shared Record over every inbound source kind — never hand-listed. */
const SOURCE_KINDS = keysOf<InboundSourceKind>(INBOUND_SOURCE_RELIABILITY);

const VERIFIABILITIES = keysOf(
  { verifiable_factual: true, opinion: true, opinion_resting_on_false_fact: true } satisfies Record<Verifiability, true>,
);
const ASSET_KINDS = keysOf(
  { other_crypto_asset: true, asset_referenced_token: true, e_money_token: true, unknown: true } satisfies Record<AssetKind, true>,
);
const ASSET_TREATMENTS = keysOf(
  { mentions: true, promotes_trading: true, promotes_offer: true, signals_future_admission: true, discloses_non_public: true } satisfies Record<AssetTreatment, true>,
);
const ADMISSIONS = keysOf(
  { admitted: true, admission_requested: true, not_on_lcx: true, unknown: true } satisfies Record<LcxAdmissionStatus, true>,
);
const EMBARGO_STATES = keysOf(
  { clear: true, mnpi_pending: true, announced: true, exempt_offer: true, unknown: true } satisfies Record<AssetEmbargoState, true>,
);
const HOLDING_STATES = keysOf(
  { declared_holding: true, declared_none: true, not_declared: true, register_absent: true } satisfies Record<HoldingsDeclarationState, true>,
);
const WHITE_PAPER_KINDS = keysOf(
  { not_required: true, published: true, required_not_published: true, unknown: true } satisfies Record<WhitePaperState['kind'], true>,
);
const PRODUCT_STATUSES = keysOf(
  { mica_regulated: true, not_mica_regulated: true, unknown: true } satisfies Record<ProductRegulatoryStatus, true>,
);
const ART_7_ROLES = keysOf(
  { offeror: true, person_seeking_admission: true, platform_operator: true } satisfies Record<Art7Role, true>,
);
const JURISDICTIONS = keysOf(
  { li: true, eea_other: true, uk: true, us: true, row: true, unknown: true } satisfies Record<MarketingJurisdiction, true>,
);
const IMPACT_ROWS = keysOf(
  {
    ability_to_deliver_services: true, reputation: true, individual_staff_safety: true,
    key_stakeholders: true, key_audiences: true, niche_audiences: true,
    vulnerable_audiences: true, market_integrity: true, climate_of_debate: true,
  } satisfies Record<ImpactRow, true>,
);
const SEVERITIES = keysOf(
  { none: true, low: true, medium: true, high: true } satisfies Record<ImpactSeverity, true>,
);
const CAPACITIES = keysOf(
  { official_account: true, staff_personal_account: true, unknown: true } satisfies Record<SpeakerCapacity, true>,
);
const VERIFICATION_STATES = keysOf(
  { verified_by_desk: true, unverified: true, known_false: true } satisfies Record<TargetVerificationState, true>,
);
const QUARANTINE_REASONS = keysOf(
  {
    sender_authentication_absent: true, sender_authentication_failed: true,
    no_independent_corroboration: true, corroboration_disagreed: true,
    id_collision_conflicting_content: true, parse_failed: true, discovery_only_source: true,
  } satisfies Record<QuarantineReason, true>,
);
const CORROBORATED_FIELDS = keysOf(
  { author_handle: true, author_display: true, post_text: true, posted_at: true, post_id: true, language: true } satisfies Record<CorroboratedField, true>,
);
const RELIABILITIES = keysOf(
  { A: true, B: true, C: true, D: true, E: true, F: true } satisfies Record<Reliability, true>,
);
const MODE_KINDS = keysOf(
  { normal: true, heightened: true, suspended_by_authority: true } satisfies Record<DeskMode['kind'], true>,
);
const ROLES = keysOf(
  { reputation: true, policy: true, sme: true, legal: true } satisfies Record<ClearanceRole, true>,
);

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE PARSERS — ONE PER ENGINE INPUT, TOTAL, AND NEVER DEFAULTING TO CLEAR  */
/* ══════════════════════════════════════════════════════════════════════════ */

const graded = <T>(field: string, raw: unknown, value: (v: unknown) => T): Graded<T> => {
  const o = asObject(field, raw);
  return {
    value: value(o.value),
    confidence: oneOf(`${field}.confidence`, o.confidence, CONFIDENCES),
    /*
     * `basis` is passed through EMPTY when empty rather than rejected here, because
     * `checkGrade` and `checkReach` are the engines that own that rule and they return a
     * refusal with the citation attached (`GRADE_BASIS_MISSING`,
     * `REACH_ESTIMATE_BASIS_MISSING`). A 400 here would replace a cited refusal with a
     * validation error and lose the sentence that tells the operator what to write.
     */
    basis: str(`${field}.basis`, raw === null ? '' : o.basis ?? '', { allowEmpty: true }),
  };
};

const parseWhitePaper = (field: string, raw: unknown): WhitePaperState => {
  const o = asObject(field, raw);
  const kind = oneOf(`${field}.kind`, o.kind, WHITE_PAPER_KINDS);
  if (kind === 'not_required') return { kind, basis: str(`${field}.basis`, o.basis) };
  if (kind === 'published') return { kind, publishedAt: instant(`${field}.publishedAt`, o.publishedAt) };
  return { kind };
};

const parseAsset = (field: string, raw: unknown): AssetFact => {
  const o = asObject(field, raw);
  return {
    asset: str(`${field}.asset`, o.asset, { max: 32 }),
    kind: oneOf(`${field}.kind`, o.kind, ASSET_KINDS),
    treatment: oneOf(`${field}.treatment`, o.treatment, ASSET_TREATMENTS),
    lcxAdmission: oneOf(`${field}.lcxAdmission`, o.lcxAdmission, ADMISSIONS),
    admittedOnAnotherVenue: knownBool(`${field}.admittedOnAnotherVenue`, o.admittedOnAnotherVenue),
    embargo: oneOf(`${field}.embargo`, o.embargo, EMBARGO_STATES),
    whitePaper: parseWhitePaper(`${field}.whitePaper`, o.whitePaper),
    reliesOnArt4Exemption: bool(`${field}.reliesOnArt4Exemption`, o.reliesOnArt4Exemption),
    lcxActsForIssuer: bool(`${field}.lcxActsForIssuer`, o.lcxActsForIssuer),
    authorHolding: oneOf(`${field}.authorHolding`, o.authorHolding, HOLDING_STATES),
  };
};

const parseAdvantageClaim = (field: string, raw: unknown): AdvantageClaim => {
  const o = asObject(field, raw);
  const sub = o.substantiation;
  if (sub === null || sub === undefined) {
    /*
     * NOT "we have not added a source yet". Art 66(2) prohibits misleading a client
     * deliberately OR NEGLIGENTLY, so the absence of a check IS the fault element, and
     * `unsubstantiatedAdvantageRefusals` treats a null exactly that way. Accepting the
     * null here and letting the engine refuse is the point; rejecting it at the door
     * would hide the finding behind a form error.
     */
    return { text: str(`${field}.text`, o.text), substantiation: null };
  }
  const s = asObject(`${field}.substantiation`, sub);
  return {
    text: str(`${field}.text`, o.text),
    substantiation: {
      sourceRef: str(`${field}.substantiation.sourceRef`, s.sourceRef),
      verifiedBy: str(`${field}.substantiation.verifiedBy`, s.verifiedBy, { max: 200 }),
      verifiedAt: instant(`${field}.substantiation.verifiedAt`, s.verifiedAt),
    },
  };
};

const parseProduct = (field: string, raw: unknown): NamedProduct => {
  const o = asObject(field, raw);
  return {
    name: str(`${field}.name`, o.name, { max: 200 }),
    status: oneOf(`${field}.status`, o.status, PRODUCT_STATUSES),
  };
};

const parseArt7Disclosure = (raw: unknown): Art7DisclosureBlock | null => {
  if (raw === null || raw === undefined) return null;
  const o = asObject('art7Disclosure', raw);
  /*
   * Empty strings are ALLOWED through, and that is deliberate: `missingArt7DisclosureFacts`
   * names exactly which of the four Art 7(1)(d) facts is absent and
   * `ART_7_BOILERPLATE_DOES_NOT_FIT` says the budget was not estimated because an invented
   * contact block "would produce a number that looks like arithmetic and is not". A 400
   * would tell the operator to fill a form; the refusal tells them which fact is missing
   * and who can supply it.
   */
  return {
    whitePaperPublishedStatement: str('art7Disclosure.whitePaperPublishedStatement', o.whitePaperPublishedStatement ?? '', { allowEmpty: true, max: 600 }),
    websiteAddress: str('art7Disclosure.websiteAddress', o.websiteAddress ?? '', { allowEmpty: true, max: 300 }),
    telephone: str('art7Disclosure.telephone', o.telephone ?? '', { allowEmpty: true, max: 100 }),
    email: str('art7Disclosure.email', o.email ?? '', { allowEmpty: true, max: 200 }),
  };
};

/**
 * The classifier's input. `at` and `decidedBy` are NOT read from the body: the clock is
 * the server's and the actor is the session's, because a classification stamped with a
 * client-supplied time and a client-supplied name is not a record of anything.
 */
const parseRegimeInput = (body: Record<string, unknown>, actor: ActorId, now: Instant): RegimeInput => {
  const verb = oneOf('verb', body.verb, VERBS);
  const hasPersonalisation = body.personalisation !== null && body.personalisation !== undefined;
  const p = hasPersonalisation ? asObject('personalisation', body.personalisation) : null;
  return {
    verb,
    surface: oneOf('surface', body.surface, SURFACES),
    body: str('body', body.body ?? '', { allowEmpty: true }),
    targetBody: nullableStr('targetBody', body.targetBody),
    purpose: oneOf('purpose', body.purpose, PURPOSES),
    assets: arrayOf('assets', body.assets ?? [], (item, i) => parseAsset(`assets[${String(i)}]`, item), 50),
    products: arrayOf('products', body.products ?? [], (item, i) => parseProduct(`products[${String(i)}]`, item), 50),
    firstPartyLinkPresent: bool('firstPartyLinkPresent', body.firstPartyLinkPresent),
    citesOwnRegulatoryStatus: bool('citesOwnRegulatoryStatus', body.citesOwnRegulatoryStatus),
    consideration: oneOf('consideration', body.consideration, CONSIDERATIONS),
    authorAccount: oneOf('authorAccount', body.authorAccount, ['lcx_official', 'staff_personal'] as const),
    employmentRelationshipDisclosed: bool('employmentRelationshipDisclosed', body.employmentRelationshipDisclosed),
    advantageClaims: arrayOf('advantageClaims', body.advantageClaims ?? [], (item, i) => parseAdvantageClaim(`advantageClaims[${String(i)}]`, item), 50),
    ...(p === null ? {} : {
      personalisation: {
        personalised: bool('personalisation.personalised', p.personalised),
        basis: str('personalisation.basis', p.basis),
        foundBy: str('personalisation.foundBy', p.foundBy, { max: 200 }),
      },
    }),
    /*
     * `null` MEANS "the list was not supplied", which is `AUTHORISED_SERVICE_LIST_ABSENT`
     * — a named gap. An omitted key must therefore NOT become `[]`: an empty list reads as
     * "authorised for nothing", which is a different, confident, wrong answer.
     */
    authorisedServices: body.authorisedServices === null || body.authorisedServices === undefined
      ? null
      : strArray('authorisedServices', body.authorisedServices, 60),
    art7Role: oneOf('art7Role', body.art7Role, ART_7_ROLES),
    art7Disclosure: parseArt7Disclosure(body.art7Disclosure),
    addressedTo: arrayOf('addressedTo', body.addressedTo ?? [], (item, i) => oneOf<MarketingJurisdiction>(`addressedTo[${String(i)}]`, item, JURISDICTIONS), 10),
    excludedFrom: arrayOf('excludedFrom', body.excludedFrom ?? [], (item, i) => oneOf<MarketingJurisdiction>(`excludedFrom[${String(i)}]`, item, JURISDICTIONS), 10),
    ...(body.prizeDrawExclusionsFromCounsel === undefined ? {} : {
      prizeDrawExclusionsFromCounsel: bool('prizeDrawExclusionsFromCounsel', body.prizeDrawExclusionsFromCounsel),
    }),
    giveawayRequiresPersonalDataOrBenefit: knownBool('giveawayRequiresPersonalDataOrBenefit', body.giveawayRequiresPersonalDataOrBenefit),
    at: now,
    decidedBy: actor,
  };
};

const parseReach = (raw: unknown): ReachAssessment => {
  const o = asObject('reach', raw);
  const level = (field: string) => (v: unknown) => oneOf<ReachLevel>(field, v, REACH_LEVELS);
  return {
    current: graded('reach.current', o.current, level('reach.current.value')),
    previous: o.previous === null || o.previous === undefined
      ? null
      : graded('reach.previous', o.previous, level('reach.previous.value')),
    previousAt: nullableInstant('reach.previousAt', o.previousAt),
  };
};

const parseImpacts = (raw: unknown): Partial<Record<ImpactRow, Graded<ImpactSeverity>>> => {
  if (raw === null || raw === undefined) return {};
  const o = asObject('impacts', raw);
  const out: Partial<Record<ImpactRow, Graded<ImpactSeverity>>> = {};
  for (const key of Object.keys(o)) {
    const row = oneOf<ImpactRow>('impacts key', key, IMPACT_ROWS);
    out[row] = graded(`impacts.${row}`, o[key], (v) => oneOf<ImpactSeverity>(`impacts.${row}.value`, v, SEVERITIES));
  }
  return out;
};

const parseAction = (raw: unknown): ResponseAction => {
  const o = asObject('action', raw);
  const kind = oneOf('action.kind', o.kind, RESPONSE_KINDS);
  switch (kind) {
    /*
     * `rationale` comes through even when blank. `checkResponseAction` and
     * `recordSilence` own the rule that an ignore needs a written reason, and their
     * refusal (`IGNORE_WITHOUT_RATIONALE`) carries the citation "silence is a decision"
     * plus who can supply the sentence. Rejecting the blank here would answer 400 and
     * lose all of that.
     */
    case 'ignore':
      return { kind, rationale: str('action.rationale', o.rationale ?? '', { allowEmpty: true }) };
    case 'monitor':
      return {
        kind,
        baselineRef: str('action.baselineRef', o.baselineRef ?? '', { allowEmpty: true, max: 400 }),
        reviewAt: str('action.reviewAt', o.reviewAt ?? '', { allowEmpty: true, max: 64 }),
      };
    case 'prepare_line_hold':
      return { kind, approvedLanguageId: str('action.approvedLanguageId', o.approvedLanguageId ?? '', { allowEmpty: true, max: 200 }) };
    case 'reply_public':
      return { kind, draftId: str('action.draftId', o.draftId ?? '', { allowEmpty: true, max: 200 }) };
    case 'owned_channel_statement':
      return { kind, statementId: str('action.statementId', o.statementId ?? '', { allowEmpty: true, max: 200 }) };
    case 'direct_contact_author':
      return { kind, rationale: str('action.rationale', o.rationale ?? '', { allowEmpty: true }) };
    case 'platform_report':
      return { kind, reportType: oneOf('action.reportType', o.reportType, ['impersonation', 'fraud', 'harassment'] as const) };
    case 'escalate_internal':
      return {
        kind,
        to: arrayOf('action.to', o.to ?? [], (item, i) => oneOf<ClearanceRole>(`action.to[${String(i)}]`, item, ROLES), 4),
        severity: oneOf('action.severity', o.severity, SEVERITIES),
      };
    case 'escalate_market_abuse':
      return {
        kind,
        authority: str('action.authority', o.authority ?? '', { allowEmpty: true, max: 200 }),
        basis: str('action.basis', o.basis ?? '', { allowEmpty: true }),
      };
  }
};

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE MODE LEDGER — APPEND-ONLY, SERIALISED, AND FAILING CLOSED             */
/* ══════════════════════════════════════════════════════════════════════════ */

const MODE_SUBJECT_TYPE = 'marketing_desk';
const MODE_SUBJECT_ID = 'mode';
const MODE_ACTION = 'marketing_desk_mode_change';
const TRIAGE_SUBJECT_TYPE = 'marketing_x_reply';
const TRIAGE_ACTION = 'marketing_triage_decision';
/** One lock for the whole desk mode. `hashtext` of this string, as `withJobRun` does. */
const MODE_LOCK_KEY = 'marketing:desk_mode';

/**
 * A ledger row this code cannot read as a mode.
 *
 * IT IS AN ERROR AND NOT A FALLBACK, and that is the single most important decision in
 * this file. The alternative — skip the unreadable row and read the one below it — would
 * answer "the desk is normal" when the newest record might be a regulator's prohibition
 * that a bad deploy or a hand-edited JSONB left unparseable. Reporting a closed desk as
 * open is the failure this compartment exists to prevent, so the read fails loudly and
 * the sentence tells the operator to treat the desk as closed until it is fixed.
 */
class LedgerUnreadable extends Error {
  constructor(readonly ledgerRef: string, readonly why: string) {
    super(`desk mode ledger row ${ledgerRef} is unreadable: ${why}`);
    this.name = 'LedgerUnreadable';
  }
}

/**
 * Parse a `DeskMode`.
 *
 * `actor` non-null is the REQUEST path: `imposedBy` / `recordedBy` are taken from the
 * session and any value in the body is ignored, because a client-named imposer makes the
 * governance record a suggestion. `actor` null is the LEDGER path, where those fields are
 * read back from the row that recorded them.
 */
const parseDeskMode = (field: string, raw: unknown, actor: ActorId | null, now: Instant): DeskMode => {
  const o = asObject(field, raw);
  const kind = oneOf(`${field}.kind`, o.kind, MODE_KINDS);
  if (kind === 'normal') return { kind };
  if (kind === 'heightened') {
    return {
      kind,
      reason: str(`${field}.reason`, o.reason, { max: 2000 }),
      imposedBy: actor ?? str(`${field}.imposedBy`, o.imposedBy, { max: 200 }),
      effectiveFrom: o.effectiveFrom === undefined && actor !== null ? now : instant(`${field}.effectiveFrom`, o.effectiveFrom),
      expiresAt: nullableInstant(`${field}.expiresAt`, o.expiresAt),
    };
  }
  return {
    kind,
    authority: str(`${field}.authority`, o.authority, { max: 300 }),
    orderRef: str(`${field}.orderRef`, o.orderRef, { max: 300 }),
    effectiveFrom: instant(`${field}.effectiveFrom`, o.effectiveFrom),
    expiresAt: nullableInstant(`${field}.expiresAt`, o.expiresAt),
    suspensionPower: oneOf(`${field}.suspensionPower`, o.suspensionPower, ['cease_or_suspend_30_days', 'prohibit_or_suspend'] as const),
    recordedBy: actor ?? str(`${field}.recordedBy`, o.recordedBy, { max: 200 }),
  };
};

const parseCalendar = (raw: unknown): WorkingDayCalendar | null => {
  if (raw === null || raw === undefined) return null;
  const o = asObject('calendar', raw);
  const date = (field: string, v: unknown): string => {
    const s = str(field, v, { max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Invalid(field, 'must be a YYYY-MM-DD date');
    return s;
  };
  return {
    jurisdiction: str('calendar.jurisdiction', o.jurisdiction, { max: 40 }),
    weekend: arrayOf('calendar.weekend', o.weekend ?? [], (item, i) => {
      if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 6) {
        throw new Invalid(`calendar.weekend[${String(i)}]`, 'must be a UTC day number, 0 (Sunday) to 6');
      }
      return item;
    }, 7),
    holidays: arrayOf('calendar.holidays', o.holidays ?? [], (item, i) => date(`calendar.holidays[${String(i)}]`, item), 400),
    coversFrom: date('calendar.coversFrom', o.coversFrom),
    coversTo: date('calendar.coversTo', o.coversTo),
    /* A holiday list with no provenance is an opinion about dates — the engine's words. */
    source: str('calendar.source', o.source, { max: 600 }),
  };
};

/** One row of the ledger, already validated. */
interface ModeLedgerRow {
  readonly ledgerRef: string;
  readonly recordedAt: Instant;
  readonly recordedBy: ActorId;
  readonly reason: string;
  readonly mode: DeskMode | null;
  readonly transitionRaw: unknown;
  readonly order: OrderAssessment | null;
  readonly calendar: WorkingDayCalendar | null;
}

interface Queryable {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Read the newest rows of the mode ledger, newest first.
 *
 * `created_at DESC, id DESC` — the tiebreak matters because `object_actions` has no
 * unique constraint tying a row to the desk and `NOW()` is the transaction's start
 * instant, so two appends in the same microsecond would otherwise order arbitrarily.
 * Under the advisory lock they cannot be concurrent, and the tiebreak makes the read
 * deterministic anyway.
 */
async function readModeLedger(q: Queryable, limit: number): Promise<readonly ModeLedgerRow[]> {
  const res = await q.query(
    `SELECT id, result, actor, created_at FROM object_actions
      WHERE subject_type = $1 AND subject_id = $2 AND action = $3
      ORDER BY created_at DESC, id DESC LIMIT $4`,
    [MODE_SUBJECT_TYPE, MODE_SUBJECT_ID, MODE_ACTION, limit],
  );
  return res.rows.map((row) => {
    const ledgerRef = String(row.id);
    const result = row.result;
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      throw new LedgerUnreadable(ledgerRef, 'the stored result is not an object');
    }
    const r = result as Record<string, unknown>;
    const transitionRaw = r.transition ?? null;
    let mode: DeskMode | null = null;
    if (transitionRaw !== null) {
      const t = asObject('transition', transitionRaw);
      try {
        mode = parseDeskMode('transition.to', t.to, null, '');
      } catch (err) {
        throw new LedgerUnreadable(ledgerRef, err instanceof Invalid ? err.message : 'the stored mode did not validate');
      }
    }
    const order = (r.order ?? null) as OrderAssessment | null;
    if (mode === null && order === null) {
      throw new LedgerUnreadable(ledgerRef, 'the row carries neither a transition nor an order');
    }
    return {
      ledgerRef,
      recordedAt: new Date(String(row.created_at)).toISOString(),
      recordedBy: String(row.actor ?? 'unknown'),
      reason: typeof r.reason === 'string' ? r.reason : '',
      mode,
      transitionRaw,
      order,
      calendar: (r.calendar ?? null) as WorkingDayCalendar | null,
    };
  });
}

/**
 * The standing the newest row implies. `null` rows away means nothing was ever recorded,
 * which is `default_normal` — the desk is open because nobody has said otherwise, and the
 * board says which of those two it is.
 */
function standingFrom(newest: ModeLedgerRow | undefined, now: Instant): {
  standing: DeskStanding;
  order: OrderAssessment | null;
  calendar: WorkingDayCalendar | null;
  source: 'ledger' | 'default_normal';
} {
  if (newest === undefined) {
    return { standing: deskStanding({ kind: 'normal' }, now), order: null, calendar: null, source: 'default_normal' };
  }
  if (newest.mode === null && newest.order !== null) {
    return {
      standing: standingFromOrder(newest.order, now, newest.calendar),
      order: newest.order,
      calendar: newest.calendar,
      source: 'ledger',
    };
  }
  const scope = newest.order?.order.scope;
  return {
    standing: deskStanding(newest.mode as DeskMode, now, newest.calendar, scope),
    order: newest.order,
    calendar: newest.calendar,
    source: 'ledger',
  };
}

/** The three doors text can leave through, each with the sentence that shuts it. */
const outboundGateRows = (standing: DeskStanding, itemRef: string | null = null): readonly DeskOutboundGateRow[] =>
  OUTBOUND_ACTS.map((act) => ({ act, refusal: gateDeskAct(standing, act, itemRef) }));

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 THE HANDLER SHELL — ONE PLACE THAT TURNS AN Invalid INTO A 400            */
/* ══════════════════════════════════════════════════════════════════════════ */

interface Failure { readonly body: Record<string, unknown>; readonly status: 400 | 500 | 503 }

/**
 * Map a thrown error to a response. Four outcomes and no fifth:
 * a malformed body is 400 with the field and the valid values; an unreadable mode row is
 * 500 with the sentence that says the desk must be treated as closed; anything else is
 * the compartment's generic 500, logged.
 */
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
  if (err instanceof LedgerUnreadable) {
    console.error(`[marketingDesk] ${route} ledger unreadable:`, err);
    return {
      status: 500,
      body: {
        error: `The newest desk-mode record cannot be read (${err.why}). Treat the desk as CLOSED until it is corrected: this endpoint will not report a mode it cannot verify, because reporting a suspended desk as open is the one wrong answer here.`,
        code: 'MARKETING_DESK_MODE_UNREADABLE',
        ledgerRef: err.ledgerRef,
      },
    };
  }
  console.error(`[marketingDesk] ${route} error:`, err);
  return { status: 500, body: { error: 'Failed to serve the desk', code: 'MARKETING_ERROR' } };
}

const readJson = async (c: { req: { json: <T>() => Promise<T> } }): Promise<Record<string, unknown>> => {
  let raw: unknown;
  try {
    raw = await c.req.json<unknown>();
  } catch {
    throw new Invalid('body', 'must be a JSON object');
  }
  return asObject('body', raw);
};

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 REGIME — POST /regime                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Build the Art 7 fit statement from the budget the classifier already computed.
 *
 * ONE place assembles it, so the shortfall on screen and the shortfall in the refusal
 * are the same number by construction. `remedy` is `ART_7_LINK_TO_COMPLIANT_PAGE`
 * verbatim — the module constant exists precisely so every refusal recommends the same
 * thing in the same words — and it is `null` when the item fits, because a remedy shown
 * beside a passing check teaches an operator to stop reading.
 */
function art7FitOf(decision: ReturnType<typeof classifyRegimes>): Art7FitStatement | null {
  const b = decision.art7;
  if (b === null) return null;
  return {
    fits: b.fits,
    shortfallChars: b.shortfallChars,
    mandatedChars: b.block.totalChars,
    editorialChars: b.editorialChars,
    limitChars: b.limit,
    channelLabel: b.channel.label,
    mandatedAloneExceedsLimit: b.mandatedAloneExceedsLimit,
    missingMandatedFacts: b.block.missingFacts,
    remedy: b.fits ? null : ART_7_LINK_TO_COMPLIANT_PAGE,
    refusalCode: b.refusal?.code ?? null,
  };
}

/**
 * WHICH LAW BITES. Pure computation over a body the caller supplies — no row is read and
 * no row is written, which is why there is no migration probe on this route.
 *
 * The response is the engine's `RegimeDecision` whole, plus the arithmetic projection.
 * `requiresHumanConfirmation` travels inside the decision and is not flattened away: a
 * machine may not settle `market_abuse` or `advice` by itself, and a surface that showed
 * the regime chips without that list would present a criminal-adjacent classification as
 * a computed fact.
 */
marketingDeskRoutes.post('/regime', requireOperator, async (c) => {
  try {
    const body = await readJson(c);
    const actor = c.get('operator')?.id ?? 'unknown';
    const now = new Date().toISOString();
    const decision = classifyRegimes(parseRegimeInput(body, actor, now));
    const data: RegimeReading = {
      decision,
      regimes: decision.classification.regimes,
      art7Fit: art7FitOf(decision),
      refusalCodes: decision.refusals.map((r) => r.code),
      assessedBy: actor,
      assessedAt: now,
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    const f = failureFor('regime', err);
    return c.json(f.body, f.status);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 TRIAGE — POST /triage/assess AND POST /:id/triage                         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * How far back the template-reuse corpus reaches.
 *
 * A COLLECTION decision, not a rule, which is why it is a constant here and not in
 * `packages/shared`: the engine owns the similarity floor
 * (`TEMPLATE_REUSE_MIN_SIMILARITY`) and the handle count
 * (`TEMPLATE_REUSE_MIN_HANDLES`) and this file must never re-state either. Seven days
 * is chosen against the retention clock — `MARKETING_RETENTION_DAYS` defaults to 90, so
 * the window is always inside what the table still holds.
 */
const TEMPLATE_REUSE_WINDOW_HOURS = 168;
const TEMPLATE_REUSE_CORPUS_MAX = 500;

/**
 * Read the reuse corpus from our own rows. This is the one FIRST indicator the server
 * can honestly source: `technology` ("bots amplifying messages") is near-identical text
 * across many handles, which needs a corpus, and only the API has one.
 *
 * The frame is the notification frame with the census sentence attached, plus one named
 * blind spot of its own. `lastSuccessfulPollAt` is the newest DELIVERY in the window,
 * which is a LOWER BOUND on the last successful poll: a poll that succeeded and found
 * nothing leaves no row. Naming it is the point — a fall in this signal must be readable
 * as a forwarding failure rather than as coordination stopping.
 */
async function readReuse(
  pool: Queryable,
  item: { handle: string; bodyText: string; parentPostId: string | null; excludeId: number | null },
  now: Instant,
): Promise<TemplateReuseReading> {
  const from = new Date(Date.parse(now) - TEMPLATE_REUSE_WINDOW_HOURS * 3_600_000).toISOString();
  const res = await pool.query(
    `SELECT author_handle, body, x_post_id, received_at FROM marketing_x_reply
      WHERE NOT quarantined AND received_at >= $1 AND id <> $2
      ORDER BY received_at DESC LIMIT ${String(TEMPLATE_REUSE_CORPUS_MAX)}`,
    [from, item.excludeId ?? -1],
  );
  const rows = res.rows;
  const newestDelivery = rows.length === 0 ? null : new Date(String(rows[0].received_at)).toISOString();
  const frame = notificationFrame(
    { from, to: now, asOf: now, lastSuccessfulPollAt: newestDelivery },
    [
      'when the mailbox was last polled: this compartment records deliveries, not polls, so lastSuccessfulPollAt is the newest item DELIVERED in the window and is a lower bound on the last successful poll',
      `anything older than ${String(TEMPLATE_REUSE_WINDOW_HOURS)} hours, and anything past the ${String(TEMPLATE_REUSE_CORPUS_MAX)}-row cap on this read`,
      'items held in quarantine, which are excluded from the corpus deliberately: a forged batch must not be able to manufacture a coordination signal',
    ],
  );
  return readTemplateReuse({
    handle: item.handle,
    bodyText: item.bodyText,
    parentPostId: item.parentPostId,
    corpus: rows.map((r) => ({
      handle: String(r.author_handle),
      bodyText: String(r.body),
      parentPostId: r.x_post_id === null || r.x_post_id === undefined ? null : String(r.x_post_id),
    })),
    frame,
  });
}

/**
 * THE CHECK THIS ROUTE DOES NOT RUN, NAMED IN EVERY RESPONSE.
 *
 * `readImpersonationSignals` needs the list of LCX-owned handles. That list exists once,
 * as `MARKETING_LCX_HANDLES` parsed privately inside `apps/api/src/marketing/sanitise.ts`,
 * and a second parse of the same variable here would be a second vocabulary — the failure
 * mode `marketing/index.ts` records fourteen instances of. So `identity` is neither
 * suggested nor excluded by this route, and the sentence says so rather than letting an
 * empty suggestion list read as "no impersonation signals".
 */
const IMPERSONATION_NOT_RUN =
  'identity (impersonation): not read. The §10 impersonation read requires the LCX owned-handle allowlist, which lives privately in marketing/sanitise.ts and has no route or shared export yet. An empty indicator list here is NOT a finding that the account is genuine.';

const ATTRIBUTION_NOT_RUN =
  'attribution: not asserted. assertAttribution needs at least two named humans concurring, which is a decision, not a computation — this route never attributes an item to an actor by itself.';

interface TriageInputs {
  readonly verifiability: Verifiability;
  readonly reach: ReachAssessment;
  readonly impacts: Partial<Record<ImpactRow, Graded<ImpactSeverity>>>;
  readonly supportingGrades: readonly Confidence[];
  readonly requestedPriority: PriorityTier | undefined;
  readonly overrideRationale: string | undefined;
  readonly startedAt: Instant | null;
  readonly firstStatementAt: Instant | null;
  readonly suppression: { reason: string; by: ActorId; at: Instant } | null;
  readonly item: { handle: string; bodyText: string; parentPostId: string | null } | null;
}

const parseTriageInputs = (body: Record<string, unknown>): TriageInputs => {
  const s = body.suppression === null || body.suppression === undefined ? null : asObject('suppression', body.suppression);
  const item = body.item === null || body.item === undefined ? null : asObject('item', body.item);
  return {
    verifiability: oneOf('verifiability', body.verifiability, VERIFIABILITIES),
    reach: parseReach(body.reach),
    impacts: parseImpacts(body.impacts),
    supportingGrades: arrayOf('supportingGrades', body.supportingGrades ?? [], (v, i) => oneOf<Confidence>(`supportingGrades[${String(i)}]`, v, CONFIDENCES), 40),
    requestedPriority: body.requestedPriority === null || body.requestedPriority === undefined
      ? undefined
      : oneOf<PriorityTier>('requestedPriority', body.requestedPriority, TIERS),
    overrideRationale: body.overrideRationale === null || body.overrideRationale === undefined
      ? undefined
      : str('overrideRationale', body.overrideRationale, { allowEmpty: true }),
    startedAt: nullableInstant('startedAt', body.startedAt),
    firstStatementAt: nullableInstant('firstStatementAt', body.firstStatementAt),
    suppression: s === null ? null : {
      reason: str('suppression.reason', s.reason, { allowEmpty: true }),
      by: str('suppression.by', s.by, { allowEmpty: true, max: 200 }),
      at: instant('suppression.at', s.at),
    },
    item: item === null ? null : {
      handle: str('item.handle', item.handle, { max: 40 }).replace(/^@/, ''),
      bodyText: str('item.bodyText', item.bodyText, { allowEmpty: true }),
      parentPostId: nullableStr('item.parentPostId', item.parentPostId, 200),
    },
  };
};

/**
 * THE ASSESSMENT. One code path, used by the read and by the write, so the reading a
 * decision was recorded against is the reading the operator was shown.
 *
 * Order is the engine's reading order of the risk: the opinion gate first (it is the
 * discriminator that empties the queue), then the grades, then reach and its trajectory,
 * then the tier, then the clock.
 */
async function buildTriageReading(
  pool: Queryable | null,
  inputs: TriageInputs,
  actor: ActorId,
  now: Instant,
  excludeId: number | null,
): Promise<TriageReading> {
  const notChecked: string[] = [IMPERSONATION_NOT_RUN, ATTRIBUTION_NOT_RUN];

  let reuse: TemplateReuseReading | null = null;
  if (inputs.item === null) {
    notChecked.push(
      'technology (template reuse): not read. No `item` was supplied, so there was no text to compare against the window. Absence of the check is not absence of coordination.',
    );
  } else if (pool === null) {
    notChecked.push(
      'technology (template reuse): not read. Migration 0046 is not applied on this environment, so there is no corpus table to compare against.',
    );
  } else {
    try {
      reuse = await readReuse(pool, { ...inputs.item, excludeId }, now);
    } catch (err) {
      /*
       * A corpus read that fails must NOT take the assessment down with it, and must not
       * quietly read as "no reuse". The most likely cause is migration 0059 (which adds
       * `quarantined`) not being applied — the same dependency `queueSummary` already
       * carries — and the honest answer is a named absence.
       */
      console.error('[marketingDesk] template-reuse corpus read failed:', err);
      notChecked.push(
        'technology (template reuse): not read. The corpus read failed on this environment (most often migration 0059, which adds marketing_x_reply.quarantined, not yet applied). This is a pipeline fault, not a finding.',
      );
    }
  }

  const gradeRefusals: Refusal[] = [];
  const reachRefusal = checkReach(inputs.reach);
  if (reachRefusal !== null) gradeRefusals.push(reachRefusal);
  for (const [row, g] of Object.entries(inputs.impacts)) {
    if (g === undefined) continue;
    const r = checkGrade(`impact '${row}'`, g);
    if (r !== null) gradeRefusals.push(r);
  }

  const derivation = derivePriority({
    reach: inputs.reach,
    impacts: inputs.impacts,
    supportingGrades: inputs.supportingGrades,
  });
  const priority = applyPriority({
    derivation,
    ...(inputs.requestedPriority === undefined ? {} : { requested: inputs.requestedPriority }),
    ...(inputs.overrideRationale === undefined ? {} : { rationale: inputs.overrideRationale }),
    /*
     * `by` is the SESSION, never the body. An override needs a named human and this is the
     * only name the server has any reason to believe. `applyPriority` refuses an
     * unattributed override; it cannot refuse a forged one, so it is never given the chance.
     */
    by: actor,
    at: now,
  });

  /*
   * A REFUSED override has no tier of its own — `PriorityOutcome.refused` deliberately
   * carries the refusal and the derivation and nothing else, because an override that was
   * refused did not happen. The clock and the response ladder therefore run on the DERIVED
   * tier: falling back to the requested tier would let an unattributed override change the
   * SLA it was refused for setting.
   */
  const effectiveTier: PriorityTier = priority.kind === 'refused' ? derivation.tier : priority.tier;

  const currentLevel = inputs.reach.current.value;
  const reachLadder: readonly ReachLadderRung[] = REACH_LEVELS.map((level) => ({
    level,
    rank: REACH_RANK[level],
    description: REACH_LEVEL_DESCRIPTION[level],
    current: level === currentLevel,
  }));

  return {
    opinionGate: gateOpinion(inputs.verifiability),
    indicatorSuggestions: suggestFirstIndicators({ impersonation: null, templateReuse: reuse }),
    gradeRefusals,
    reachTrajectory: reachTrajectory(inputs.reach, now),
    reachLadder,
    priority,
    clock: readTriageClock({
      startedAt: inputs.startedAt,
      firstStatementAt: inputs.firstStatementAt,
      tier: effectiveTier,
      suppression: inputs.suppression,
      now,
    }),
    leadingResponses: TIER_LEADING_RESPONSES[effectiveTier],
    notChecked,
    assessedBy: actor,
    assessedAt: now,
  };
}

/**
 * THE ASSESSMENT, WITHOUT RECORDING ANYTHING.
 *
 * A read that happens to be a POST: nothing is written, and the migration probe exists
 * only to decide whether a reuse corpus can be read at all. When 0046 is pending the
 * assessment still runs — the RESIST 2 reading needs no table — and the corpus is
 * reported as not checked rather than as clean.
 */
marketingDeskRoutes.post('/triage/assess', requireOperator, async (c) => {
  try {
    const body = await readJson(c);
    const inputs = parseTriageInputs(body);
    const actor = c.get('operator')?.id ?? 'unknown';
    const now = new Date().toISOString();
    const pool = getPool();
    const migrated = await isMigrated(pool);
    const data = await buildTriageReading(migrated ? pool : null, inputs, actor, now, null);
    return c.json({ data, meta: { ...meta(), migrated } });
  } catch (err) {
    const f = failureFor('triage/assess', err);
    return c.json(f.body, f.status);
  }
});

/**
 * RECORD THE DECISION.
 *
 * THE RULE THIS ROUTE EXISTS FOR: an `ignore` needs a written rationale, and without one
 * the write is REFUSED rather than stored with an empty string. `recordSilence` produces
 * `IGNORE_WITHOUT_RATIONALE` with the citation "silence is a decision", and this handler
 * returns 422 before touching the ledger or the queue row — because a silence stored
 * without its sentence is indistinguishable from an oversight, and the whole value of the
 * log is that it turns absence of evidence into evidence.
 *
 * `checkResponseAction` runs on EVERY action kind, not just `ignore`: a `monitor` whose
 * review date is in the past reads on a board as if it were live, and a
 * `platform_report` of an impersonation with no signal behind it is an accusation the
 * desk cannot evidence. Both refuse here.
 *
 * WHAT IS WRITTEN, and in this order: the `object_actions` ledger row first, then the
 * queue status. If the status update fails the ledger still holds the decision, which is
 * the safe direction — a decision recorded with a stale queue status is a visible
 * inconsistency, while a status moved with no record of who moved it or why is the exact
 * absence this compartment exists to prevent.
 */
marketingDeskRoutes.post('/:id/triage', requireOperator, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid id', code: 'VALIDATION', field: 'id' }, 400);
    }
    const body = await readJson(c);
    const inputs = parseTriageInputs(body);
    const action = parseAction(body.action);
    const actor = c.get('operator')?.id ?? 'unknown';
    const now = new Date().toISOString();

    // Validation FIRST, migration probe second: a malformed action is malformed in every
    // environment, and a 503 would tell the caller to retry what can never succeed.
    const pool = getPool();
    if (!(await isMigrated(pool))) return c.json(NOT_MIGRATED, 503);

    const reply = await pool.query(
      `SELECT id, author_handle, body, x_post_id FROM marketing_x_reply WHERE id = $1`,
      [id],
    );
    const row = reply.rows[0];
    if (row === undefined) return c.json({ error: 'reply not found', code: 'NOT_FOUND' }, 404);

    /*
     * The item the reuse corpus is compared against comes from the ROW, not from the body.
     * A caller could otherwise ask for a reading of one reply and have it computed over
     * text they invented, and the decision would be recorded against the wrong item.
     */
    const withItem: TriageInputs = {
      ...inputs,
      item: {
        handle: String(row.author_handle),
        bodyText: String(row.body),
        parentPostId: row.x_post_id === null || row.x_post_id === undefined ? null : String(row.x_post_id),
      },
    };
    const reading = await buildTriageReading(pool, withItem, actor, now, id);

    /*
     * EVERY refusal, then one 422 — never the first one found. Telling an operator their
     * monitor date is in the past, and only after they fix it that the baseline reference
     * is also missing, is how a control gets routed around; `checkResponseAction` returns
     * them plurally for that reason and this handler must not narrow it to one.
     *
     * Deduplicated by code, because a blank `ignore` rationale legitimately fires the same
     * `IGNORE_WITHOUT_RATIONALE` from both `checkResponseAction` and `recordSilence` — two
     * gates agreeing is not two findings, and a list that showed it twice would read as a
     * bug in the instrument.
     */
    const refusals: Refusal[] = [...checkResponseAction(action, { now })];
    let silenceRecord: SilenceRecord | null = null;
    if (action.kind === 'ignore') {
      const outcome = recordSilence({
        action,
        decidedBy: actor,
        decidedAt: now,
        priority: reading.priority.kind === 'refused' ? reading.priority.derivation.tier : reading.priority.tier,
        reach: withItem.reach.current.value,
        verifiability: withItem.verifiability,
      });
      if (outcome.kind === 'refused') {
        if (!refusals.some((r) => r.code === outcome.refusal.code)) refusals.push(outcome.refusal);
      } else {
        silenceRecord = outcome.record;
      }
    }
    if (refusals.length > 0) {
      return c.json({
        error: 'This decision was refused and nothing was recorded.',
        code: 'MARKETING_TRIAGE_REFUSED',
        refusals,
      }, 422);
    }

    const ledger = await pool.query(
      `INSERT INTO object_actions (subject_type, subject_id, action, params, result, actor)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) RETURNING id`,
      [
        TRIAGE_SUBJECT_TYPE,
        String(id),
        TRIAGE_ACTION,
        JSON.stringify({ action, verifiability: withItem.verifiability, requestedPriority: withItem.requestedPriority ?? null }),
        JSON.stringify({ reading, silence: silenceRecord }),
        actor,
      ],
    );
    const ledgerRef = String(ledger.rows[0]?.id ?? '');

    /*
     * The queue status. Two values and no others — `ignored` for a recorded silence,
     * `triaged` for every other decision. The rest of `ReplyStatus` belongs to the draft
     * and send paths in `routes/marketing.ts`, and moving a row to `sent` from a triage
     * screen would be a second write path to the one column that means "a human published
     * this".
     */
    const queueStatusSet = action.kind === 'ignore' ? ('ignored' as const) : ('triaged' as const);
    await setReplyStatus(pool, id, queueStatusSet);

    const data: TriageDecisionRecord = {
      replyId: id,
      reading,
      action,
      silence: silenceRecord,
      queueStatusSet,
      ledgerRef,
      recordedBy: actor,
      recordedAt: now,
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    const f = failureFor(':id/triage', err);
    return c.json(f.body, f.status);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §7 ADOPTION — POST /adoption                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

const parseCorroboration = (field: string, raw: unknown): Corroboration => {
  const o = asObject(field, raw);
  const fields = (name: string, v: unknown) =>
    arrayOf(name, v ?? [], (item, i) => oneOf<CorroboratedField>(`${name}[${String(i)}]`, item, CORROBORATED_FIELDS), 6);
  return {
    channel: oneOf(`${field}.channel`, o.channel, SOURCE_KINDS),
    agrees: fields(`${field}.agrees`, o.agrees),
    disagrees: fields(`${field}.disagrees`, o.disagrees),
    observedAt: instant(`${field}.observedAt`, o.observedAt),
    evidence: nullableStr(`${field}.evidence`, o.evidence, 2000),
  };
};

/**
 * The target's provenance, and it is REQUIRED.
 *
 * An adoption assessment computed over an invented provenance would answer "you may
 * repost this" about a post nobody verified, and the engine's own refusal for a
 * quarantined target (`ADOPTION_OF_UNVERIFIED_TARGET`) turns entirely on this field. So
 * the caller states it, in one of the two shapes the vocabulary has, and neither shape has
 * a default.
 *
 * A `graded` provenance with NO corroboration is refused at the door, and that is this
 * route enforcing a sentence the type only documents: `InboundProvenance.corroboration`
 * says "At least one entry, or this should have been `quarantined`". An item nothing
 * independent confirmed is not a weakly-graded item, it is an unverified one, and the
 * ladder in `marketing/provenanceLadder.ts` exists because grading a forged email `C3`
 * put a fabricated claim into a regulated audit trail wearing the clothes of a real one.
 *
 * `senderAuth` is `null` here, always, and that is a scope statement rather than a
 * finding: DKIM/ARC evidence belongs to the ingest path and to `GET /replies/:id/
 * provenance`, and this route neither holds it nor pretends to.
 */
const parseProvenance = (raw: unknown): InboundProvenance => {
  const o = asObject('target.provenance', raw);
  const state = oneOf('target.provenance.state', o.state, ['quarantined', 'graded'] as const);
  if (state === 'quarantined') {
    const reasons = arrayOf('target.provenance.reasons', o.reasons ?? [], (item, i) => oneOf<QuarantineReason>(`target.provenance.reasons[${String(i)}]`, item, QUARANTINE_REASONS), 7);
    if (reasons.length === 0) throw new Invalid('target.provenance.reasons', 'must name at least one reason', QUARANTINE_REASONS);
    return {
      state,
      reasons,
      channel: oneOf('target.provenance.channel', o.channel, SOURCE_KINDS),
      senderAuth: null,
      collectedAt: instant('target.provenance.collectedAt', o.collectedAt),
      promotionRequires: str('target.provenance.promotionRequires', o.promotionRequires, { max: 1000 }),
    };
  }
  const reliability = oneOf<Reliability>('target.provenance.reliability', o.reliability, RELIABILITIES);
  const credibilityRaw = o.credibility;
  if (typeof credibilityRaw !== 'number' || !Number.isInteger(credibilityRaw) || credibilityRaw < 1 || credibilityRaw > 6) {
    throw new Invalid('target.provenance.credibility', 'must be an Admiralty credibility digit, 1 to 6');
  }
  const credibility = credibilityRaw as Credibility;
  const corroboration = arrayOf('target.provenance.corroboration', o.corroboration ?? [], (item, i) => parseCorroboration(`target.provenance.corroboration[${String(i)}]`, item), 20);
  if (corroboration.length === 0) {
    throw new Invalid(
      'target.provenance.corroboration',
      "must hold at least one independent confirmation. A graded provenance with nothing corroborating it should have been recorded as 'quarantined' — that is the difference between a weak fact and the absence of one",
    );
  }
  return {
    state,
    channel: oneOf('target.provenance.channel', o.channel, SOURCE_KINDS),
    reliability,
    credibility,
    admiralty: admiraltyCode(reliability, credibility),
    senderAuth: null,
    corroboration,
    observedAt: instant('target.provenance.observedAt', o.observedAt),
    collectedAt: instant('target.provenance.collectedAt', o.collectedAt),
  };
};

const parsePartner = (raw: unknown): PartnerRegisterLookup => {
  if (raw === null || raw === undefined) {
    /*
     * NOT "not a partner". `register_absent` is a distinct state with its own consequence:
     * `CONSIDERATION_DUTY` has three values precisely so an unanswered register does not
     * resolve to `no_duty`, which is the mistake with a per-se UCPD prohibition behind it.
     */
    return { state: 'register_absent' };
  }
  const o = asObject('target.partner', raw);
  const state = oneOf('target.partner.state', o.state, ['register_absent', 'not_a_partner', 'partner'] as const);
  if (state === 'register_absent') return { state };
  if (state === 'not_a_partner') return { state, checkedAt: instant('target.partner.checkedAt', o.checkedAt) };
  const p = asObject('target.partner.partner', o.partner);
  return {
    state,
    partner: {
      handle: str('target.partner.partner.handle', p.handle, { max: 40 }),
      consideration: oneOf('target.partner.partner.consideration', p.consideration, CONSIDERATIONS),
      direction: oneOf('target.partner.partner.direction', p.direction, ['lcx_gave', 'lcx_received'] as const),
      disclosureTermsRecorded: bool('target.partner.partner.disclosureTermsRecorded', p.disclosureTermsRecorded),
      recordedAt: instant('target.partner.partner.recordedAt', p.recordedAt),
    },
  };
};

const parseAmplification = (body: Record<string, unknown>, actor: ActorId, deskMode: DeskMode): AmplificationRequest => {
  const verb = oneOf<EngagementVerb>('verb', body.verb, VERBS);
  const targetRaw = body.target;
  const target = targetRaw === null || targetRaw === undefined ? null : asObject('target', targetRaw);
  const speaker = asObject('speaker', body.speaker);
  const correctionRaw = body.correctionClaim;
  const correction = correctionRaw === null || correctionRaw === undefined ? null : asObject('correctionClaim', correctionRaw);
  if (verb !== 'original' && target === null) {
    throw new Invalid('target', `is required for the verb '${verb}': only 'original' acts on no post`);
  }
  return {
    verb,
    surface: oneOf<ContentSurface>('surface', body.surface, SURFACES),
    speaker: {
      /* The actor is the session's. Only the CAPACITY and the handle are the caller's. */
      actor,
      capacity: oneOf<SpeakerCapacity>('speaker.capacity', speaker.capacity, CAPACITIES),
      handle: nullableStr('speaker.handle', speaker.handle, 40),
      employmentDisclosedInProfileOnly: bool('speaker.employmentDisclosedInProfileOnly', speaker.employmentDisclosedInProfileOnly),
      itemPromotesEmployer: bool('speaker.itemPromotesEmployer', speaker.itemPromotesEmployer),
    },
    target: target === null ? null : {
      permalink: nullableStr('target.permalink', target.permalink, 500),
      handle: nullableStr('target.handle', target.handle, 40),
      /*
       * `null` is a REAL and different answer: `whatWouldBeAdopted` reports
       * `adoptsUnreadText` and says "LCX cannot adopt what it has not read". An empty
       * string would be the same sentence with a confident zero in it.
       */
      text: nullableStr('target.text', target.text, 4000),
      provenance: parseProvenance(target.provenance),
      verification: oneOf<TargetVerificationState>('target.verification', target.verification, VERIFICATION_STATES),
      isLcxOwnAccount: bool('target.isLcxOwnAccount', target.isLcxOwnAccount),
      partner: parsePartner(target.partner),
    },
    ownText: nullableStr('ownText', body.ownText, 4000),
    correctionClaim: correction === null ? null : {
      wrong: str('correctionClaim.wrong', correction.wrong, { allowEmpty: true, max: 4000 }),
      right: str('correctionClaim.right', correction.right, { allowEmpty: true, max: 4000 }),
      /*
       * `null` is a DISQUALIFIER, not a blank field — `corrected_fact_unsourced` costs the
       * claimed act its RN 17-18 Q11 protection, so the absence is passed through to
       * `assessCorrection` rather than rejected as a form error.
       */
      sourceRef: nullableStr('correctionClaim.sourceRef', correction.sourceRef, 600),
    },
    deskMode,
    /*
     * `null` means the claim gate was NOT run on the target's text, which
     * `AmplificationVerdict.notChecked` reports. An empty array would mean "run, found
     * nothing" — the difference between an unexamined axis and a clean one, and reporting
     * the first as the second is the specific dishonesty this compartment refuses.
     */
    targetFindings: null,
    visibleChars: body.visibleChars === null || body.visibleChars === undefined
      ? null
      : (() => {
          const n = body.visibleChars;
          if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
            throw new Invalid('visibleChars', 'must be a positive whole number of characters, as OBSERVED on the surface — never estimated');
          }
          return n;
        })(),
  };
};

/**
 * WHAT WE WOULD BE ADOPTING. The endpoint that makes "we only retweeted it" answerable.
 *
 * The desk mode is read from the ledger rather than taken from the body: an amplification
 * assessed against a mode the caller supplied would say the act is permitted while a
 * regulator's suspension sat in the record. `assessAmplification` then produces the
 * suspension refusal itself, so the mode and the verdict cannot disagree.
 *
 * Nothing is written and nothing is posted. `whatWouldBeAdopted` is called separately for
 * the `like` and `original` cases the verdict still describes, and both are in the same
 * response object the engine returned — no reshaping.
 */
marketingDeskRoutes.post('/adoption', requireOperator, async (c) => {
  try {
    const body = await readJson(c);
    const actor = c.get('operator')?.id ?? 'unknown';
    const now = new Date().toISOString();
    const ledger = await readModeLedger(getPool(), 1);
    const { standing } = standingFrom(ledger[0], now);
    const request = parseAmplification(body, actor, standing.mode);
    const verdict = assessAmplification(request);
    const data: AdoptionReading = {
      verdict,
      blocked: verdict.refusals.length > 0,
      refusalCodes: verdict.refusals.map((r) => r.code),
      askedBy: actor,
      askedAt: now,
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    const f = failureFor('adoption', err);
    return c.json(f.body, f.status);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §8 THE DESK — GET /desk AND POST /desk-mode                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

const HISTORY_LIMIT = 25;

/** The board's own frame. A census of the desk's records, and it says so. */
const boardFrame = (from: Instant, now: Instant) =>
  ownCorpusFrame(
    { from, to: now, asOf: now, lastSuccessfulPollAt: null },
    'every reply row this environment still retains, and every desk-mode transition ever recorded in the object_actions ledger',
    [
      'when the mailbox was last polled: this is not a polled channel, so lastSuccessfulPollAt is null because nothing is fetched to build this board, not because a poll failed',
      'rows already deleted by the retention sweep, which is why a count falling is not a queue shrinking',
      'quarantined rows, which are excluded from byStatus and reported separately',
    ],
  );

/**
 * A queue figure that is ABSENT, with the reason. Never a zero.
 *
 * `DATA_ABSENT_NOT_ZERO` is the vocabulary's own code for exactly this, and the citation
 * is the desk's own rule rather than the law's: a board that renders 0 during a migration
 * window or a missing-column window is making a claim about the world from the absence of
 * a table.
 */
const queueAbsent = (why: string): Figure<DeskQueueCounts> => ({
  kind: 'absent',
  refusal: {
    code: 'DATA_ABSENT_NOT_ZERO',
    sentence: `The queue counts could not be read (${why}), so they are absent rather than zero. The desk mode above is unaffected: it comes from the object_actions ledger, which does not depend on this migration.`,
    rule: {
      instrument: INSTRUMENTS.desk_policy.key,
      provision: 'absence is not zero',
      text: 'A figure that could not be read is reported as absent with the reason. Rendering it as 0 turns a missing table into a claim about the world.',
    },
    recovery: { kind: 'supply_data', missing: why, whoCanSupply: 'whoever applies migrations on this environment' },
    matched: null,
    ruleSetVersion: OBSERVATION_RULESET_VERSION,
  },
});

/**
 * THE BOARD. The one read the desk screen makes.
 *
 * It answers even when migration 0046 is pending, and that is the whole design: the mode
 * lives in `object_actions` (0029), so a regulator's suspension recorded during a
 * migration window still shuts the desk and still renders its sentence. Only the QUEUE
 * figure degrades, and it degrades to `absent` with its reason attached.
 *
 * The queue read is wrapped in its own try/catch for the same reason: `queueSummary`
 * selects `NOT quarantined`, a column migration 0059 adds, and a 500 on the whole board
 * because a count was unavailable would take away the mode banner at exactly the moment
 * it matters. A dark screen is not an answer.
 */
marketingDeskRoutes.get('/desk', requireOperator, async (c) => {
  try {
    const now = new Date().toISOString();
    const pool = getPool();
    const rows = await readModeLedger(pool, HISTORY_LIMIT);
    const { standing, order, calendar, source } = standingFrom(rows[0], now);

    let queue: Figure<DeskQueueCounts>;
    let migrated = false;
    try {
      migrated = await isMigrated(pool);
      if (!migrated) {
        queue = queueAbsent('migration 0046 is not applied on this environment');
      } else {
        const s = await queueSummary(pool);
        queue = {
          kind: 'measured',
          value: {
            byStatus: s.counts,
            quarantined: s.quarantined,
            collisions: s.collisions,
            unparsed: s.unparsed,
            suspicious: s.suspicious,
          },
          frame: boardFrame(new Date(Date.parse(now) - 90 * 86_400_000).toISOString(), now),
        };
      }
    } catch (err) {
      console.error('[marketingDesk] queue counts unavailable:', err);
      queue = queueAbsent('the count query failed on this environment — most often migration 0059, which adds marketing_x_reply.quarantined');
    }

    const history: readonly DeskModeHistoryEntry[] = rows.map((r) => ({
      transition: (r.transitionRaw ?? null) as DeskModeHistoryEntry['transition'],
      order: r.order,
      ledgerRef: r.ledgerRef,
      recordedAt: r.recordedAt,
      recordedBy: r.recordedBy,
      reason: r.reason,
    }));

    const data: DeskBoard = {
      standing,
      policy: deskPolicy(standing.mode.kind),
      outboundGate: outboundGateRows(standing),
      order,
      calendar,
      workingDaysRemaining: standing.workingDaysRemaining,
      queue,
      frame: boardFrame(new Date(Date.parse(now) - 90 * 86_400_000).toISOString(), now),
      history,
      modeSource: source,
      migrated,
      asOf: now,
    };
    return c.json({ data, meta: { ...meta(), migrated } });
  } catch (err) {
    const f = failureFor('desk', err);
    return c.json(f.body, f.status);
  }
});

const parseScope = (raw: unknown): OrderScope => {
  if (raw === null || raw === undefined) return { kind: 'all_marketing_communications' };
  const o = asObject('order.scope', raw);
  const kind = oneOf('order.scope.kind', o.kind, ['all_marketing_communications', 'named'] as const);
  if (kind === 'all_marketing_communications') return { kind };
  return {
    kind,
    itemRefs: strArray('order.scope.itemRefs', o.itemRefs ?? [], 200),
    description: str('order.scope.description', o.description, { max: 2000 }),
  };
};

/**
 * The order as a human transcribed it off the document. Every field is transcription, not
 * derivation — `recordedBy` and `recordedAt` excepted, and those are the session and the
 * clock for the usual reason.
 *
 * `statedEndAt` is `null` when the order states no end, which is LAWFUL under Art 94(1)(p)
 * and a DEFECT under (q). The two are not flattened: `assessAuthorityOrder` raises
 * `no_end_date_recorded_under_q` for one and `prohibition_has_no_statutory_expiry` for the
 * other, and the desk stays shut either way.
 */
const parseOrder = (raw: unknown, actor: ActorId, now: Instant): AuthorityOrder => {
  const o = asObject('order', raw);
  return {
    power: oneOf<SuspensionPower>('order.power', o.power, POWERS),
    authority: str('order.authority', o.authority ?? '', { allowEmpty: true, max: 300 }),
    orderRef: str('order.orderRef', o.orderRef ?? '', { allowEmpty: true, max: 300 }),
    effectiveFrom: str('order.effectiveFrom', o.effectiveFrom, { max: 64 }),
    statedEndAt: nullableInstant('order.statedEndAt', o.statedEndAt),
    scope: parseScope(o.scope),
    recordedBy: actor,
    recordedAt: now,
    groundsStated: str('order.groundsStated', o.groundsStated ?? '', { allowEmpty: true, max: 4000 }),
  };
};

/**
 * SET THE MODE. Governed, reasoned, attributed, and serialised.
 *
 * A SUSPENSION IS NEVER TAKEN AS A MODE FROM THE BODY. It is recorded as an ORDER and the
 * mode is derived by `assessAuthorityOrder`, which is what makes the working-day
 * arithmetic run: the Art 94(1)(q) ceiling is the 30th consecutive WORKING day from the
 * effective date, it needs a public-holiday calendar this compartment does not hold, and a
 * caller who typed an expiry directly would have skipped all of that. With no calendar the
 * assessment raises `ceiling_not_computable` carrying `WORKING_DAY_CALENDAR_ABSENT`, and
 * the order is still recorded — because refusing to record a regulator's order until
 * somebody supplies a holiday list would leave the desk reading `normal` while a
 * suspension was in force. That is the one outcome no branch here may produce.
 *
 * `requestModeChange` owns every governance rule: the minimum reason length, who may
 * escalate, who may relax, that a relaxation needs a DIFFERENT actor, and that leaving a
 * live authority suspension needs that authority's own withdrawal. None of those numbers
 * or lists is re-stated here.
 *
 * THE ONE CASE THE ENGINE CANNOT DECIDE is an order with no expressible `DeskMode` — an
 * indefinite (p) prohibition, or an unreadable effective date. `requestModeChange` takes a
 * `DeskMode` and there is none to give it. That row is recorded as an order-only entry,
 * with the ONE governance condition that still applies checked here — the reason — and its
 * length read from `DEFAULT_MODE_CHANGE_POLICY.minReasonChars` rather than written as a
 * literal, so the two paths cannot drift apart.
 */
marketingDeskRoutes.post('/desk-mode', requireOperator, async (c) => {
  /*
   * PARSED BEFORE A CONNECTION IS TAKEN. Validation first is the rule everywhere in this
   * file; here it also means a malformed body never holds the mode lock, so one bad client
   * cannot serialise every other operator behind it.
   */
  let parsed: {
    actor: ActorId; now: Instant; reason: string; byRoles: readonly ClearanceRole[];
    calendar: WorkingDayCalendar | null; withdrawal: ModeChangeRequest['authorityWithdrawal'];
    targetKind: DeskMode['kind']; assessment: OrderAssessment | null; to: DeskMode | null;
  };
  try {
    const body = await readJson(c);
    const actor = c.get('operator')?.id ?? 'unknown';
    const now = new Date().toISOString();
    const reason = str('reason', body.reason ?? '', { allowEmpty: true, max: 4000 });
    const byRoles = arrayOf('byRoles', body.byRoles ?? [], (item, i) => oneOf<ClearanceRole>(`byRoles[${String(i)}]`, item, ROLES), 4);
    const calendar = parseCalendar(body.calendar);
    const withdrawalRaw = body.authorityWithdrawal;
    const withdrawal = withdrawalRaw === null || withdrawalRaw === undefined ? null : asObject('authorityWithdrawal', withdrawalRaw);
    const targetKind = oneOf('to.kind', asObject('to', body.to).kind, MODE_KINDS);

    let assessment: OrderAssessment | null = null;
    let to: DeskMode | null = null;
    if (targetKind === 'suspended_by_authority') {
      assessment = assessAuthorityOrder(parseOrder(body.order, actor, now), calendar);
      to = assessment.mode;
    } else {
      to = parseDeskMode('to', body.to, actor, now);
    }
    parsed = { actor, now, reason, byRoles, calendar, withdrawal: withdrawal === null ? null : {
      authority: str('authorityWithdrawal.authority', withdrawal.authority, { max: 300 }),
      ref: str('authorityWithdrawal.ref', withdrawal.ref, { max: 300 }),
      at: instant('authorityWithdrawal.at', withdrawal.at),
    }, targetKind, assessment, to };
  } catch (err) {
    const f = failureFor('desk-mode', err);
    return c.json(f.body, f.status);
  }

  const { actor, now, reason, byRoles, calendar, withdrawal, targetKind, assessment, to } = parsed;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    /*
     * ONE WRITER AT A TIME, AND IT WAITS ITS TURN. `pg_advisory_xact_lock` blocks rather
     * than returning false: two operators changing the mode in the same second must both
     * be recorded against the state they actually followed, and dropping one governance
     * act because a lock was busy is worse than a caller waiting. The lock is released by
     * COMMIT or ROLLBACK, so no path leaks it.
     */
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MODE_LOCK_KEY]);
    const before = await readModeLedger(client, 1);
    const { standing: fromStanding } = standingFrom(before[0], now);

    let transition: ModeTransition | null = null;
    if (to !== null) {
      const request: ModeChangeRequest = {
        to,
        by: actor,
        byRoles,
        at: now,
        reason,
        authorityWithdrawal: withdrawal,
      };
      const outcome = requestModeChange(fromStanding.mode, request, now);
      if (outcome.kind === 'refused') {
        await client.query('ROLLBACK');
        return c.json({
          error: 'The desk mode was not changed.',
          code: 'MARKETING_DESK_MODE_REFUSED',
          refusals: outcome.refusals,
          standing: fromStanding,
        }, 422);
      }
      transition = outcome.transition;
    } else if (reason.trim().length < DEFAULT_MODE_CHANGE_POLICY.minReasonChars) {
      await client.query('ROLLBACK');
      return c.json({
        error: 'The order was not recorded.',
        code: 'MARKETING_DESK_MODE_REFUSED',
        refusals: [{
          code: 'DESK_SUSPENDED_BY_AUTHORITY' as RefusalCode,
          sentence: `This order has no expressible desk mode (${(assessment?.anomalies ?? []).map((a) => a.kind).join(', ') || 'unknown'}), so it is recorded as an order rather than a transition — and a recorded order still needs a reason of at least ${String(DEFAULT_MODE_CHANGE_POLICY.minReasonChars)} characters, because the reason is the first thing a supervisor reads.`,
          rule: {
            instrument: INSTRUMENTS.desk_policy.key,
            provision: 'a recorded order states why',
            text: 'Recording an authority order is a duty and any named member may do it. It is still a governance act, and the sentence explaining it is the record.',
          },
          recovery: { kind: 'edit_text', what: 'state which order arrived and from whom, in a sentence a supervisor will accept' },
          matched: reason,
          ruleSetVersion: DESK_MODE_RULESET_VERSION,
        }],
        standing: fromStanding,
      }, 422);
    }

    const inserted = await client.query(
      `INSERT INTO object_actions (subject_type, subject_id, action, params, result, actor)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) RETURNING id, created_at`,
      [
        MODE_SUBJECT_TYPE,
        MODE_SUBJECT_ID,
        MODE_ACTION,
        JSON.stringify({ requestedKind: targetKind, byRoles, hasCalendar: calendar !== null }),
        JSON.stringify({ transition, order: assessment, calendar, reason }),
        actor,
      ],
    );
    await client.query('COMMIT');

    const ledgerRef = String(inserted.rows[0]?.id ?? '');
    /*
     * The standing is COMPUTED from what was just recorded, never asserted. When the order
     * had no expressible mode, `standingFromOrder` is the function that carries exactly
     * that case, and there is no path through it that opens the desk on a defective order.
     */
    let standing: DeskStanding;
    if (transition !== null) {
      standing = deskStanding(transition.to, now, calendar, assessment?.order.scope);
    } else if (assessment !== null) {
      standing = standingFromOrder(assessment, now, calendar);
    } else {
      // Unreachable by construction: `to` is null only on the order-only path, where the
      // assessment exists. Thrown rather than defaulted, because the default would be a mode.
      throw new Error('desk-mode: neither a transition nor an order to compute standing from');
    }
    const data: DeskModeRecord = {
      transition,
      standing,
      policy: deskPolicy(standing.mode.kind),
      order: assessment,
      statutoryCeiling: assessment?.statutoryCeiling ?? null,
      ledgerRef,
      recordedAt: now,
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* The connection is already unusable; the original error is the one that matters. */
    }
    const f = failureFor('desk-mode', err);
    return c.json(f.body, f.status);
  } finally {
    client.release();
  }
});
