/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DESK'S VOCABULARY — one import boundary, and the whole of its debt
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every marketing surface in `components/marketing/**` and `pages/Marketing*.tsx`
 * takes its nouns from HERE and from nowhere else. That is deliberate: it makes the
 * one remaining compromise auditable in one file instead of scattered across ten.
 *
 * ── THE COMPROMISE THAT IS NO LONGER ONE ──────────────────────────────────────
 * The declarations ARE the shared ones. `packages/shared/src/marketing/` owns the
 * vocabulary (`types.ts`), the crisis engine (`crisis.ts`) and the measurement engine
 * (`loop.ts`), and this file re-exports from them rather than restating anything.
 *
 * It used to reach them by a five-level RELATIVE PATH, with a comment here explaining
 * that `packages/shared/src/index.ts` did not export `./marketing/` and that the fix was
 * one line in a file this lane did not own. THAT LINE LANDED (`../index.ts:181`,
 * `export * from './marketing/index.js'`), so the comment was describing a repository
 * that no longer existed while the deep paths it justified stayed. Both are now gone: the
 * imports below are `@lcx/shared`, which is what `lib/api/gpsBook.ts:28` asks for — a deep
 * path bypasses the package boundary, so a symbol could vanish from the barrel and this
 * file would still compile.
 *
 * The package's `exports` map points `"."` at `./src/index.ts`, i.e. SOURCE, so nothing
 * here depends on a `dist` build being current.
 *
 * ── WHAT IS DECLARED LOCALLY, AND WHY IT IS NOT A PARALLEL COPY ───────────────
 * One shape, `GateReading`, and it is a property of THIS SCREEN's reads rather than of
 * the vocabulary: `GateVerdict` in types.ts §5 is the engine's answer, and `GateReading`
 * is the UI's knowledge of whether it got one.
 *
 * `DeskRead` in `useDeskRead.ts` is the same kind of thing one level up — what this screen
 * knows about whether a ROUTE answered. Neither is a response shape.
 *
 * The seven routes whose contracts have not landed are narrowed from `unknown` at runtime
 * by `narrow.ts` and by `deskApi.ts`, field by field, and never asserted. Those narrowing
 * results are not parallel copies of a response type: a copy CLAIMS the payload has a
 * shape, and a narrower CHECKS one field at a time and says so on screen when a field is
 * missing.
 */

/* ════════ THE SHARED VOCABULARY (types.ts, via the marketing barrel) ════════ */

export type {
  ActorId,
  Art7Role,
  AssetSymbol,
  Clearance,
  ConsiderationKind,
  ContentSurface,
  ItemPurpose,
  SpeakerCapacity,
  TargetVerificationState,
  ClearanceRole,
  Confidence,
  ContentHash,
  DeskMode,
  EngagementVerb,
  Figure,
  FirstIndicator,
  Graded,
  Handle,
  ImpactRow,
  ImpactSeverity,
  Instant,
  MarketingRegime,
  ObservationFrame,
  Permalink,
  PriorityTier,
  ProcessMetricKey,
  ReachLevel,
  Refusal,
  RefusalRecovery,
  RefusedMetricKey,
  ResponseAction,
  RuleCitation,
  TriageState,
  Verifiability,
} from '@lcx/shared';

/**
 * THE ONE CROSS-COMPARTMENT COLLISION, and it must be resolved HERE rather than by a deep
 * import that dodges it.
 *
 * `gps/partners.ts` and `marketing/types.ts` both export a type named `RefusalCode`, and
 * the shared barrel gives GPS the unqualified name as the incumbent (`../index.ts:201`).
 * `import type { RefusalCode } from '@lcx/shared'` therefore resolves to GPS's union — 14
 * silent errors' worth, every marketing code reported as "not assignable", which reads as
 * though the marketing vocabulary were wrong. `abuseRegister.ts:56` was worked around by
 * quoting three code strings as a literal union rather than diagnosing it.
 *
 * So the compartment's own name is bound to the compartment's own union, once, in the file
 * every marketing surface imports from.
 */
export type { MarketingRefusalCode as RefusalCode } from '@lcx/shared';

export {
  ART_7_1_E_STATEMENT_PLATFORM_OPERATOR,
  ATTRIBUTION_MIN_CONCURRING,
  CLEARANCE_HEADLINE_TEST_QUESTION,
  CONFIDENCE_DEFINITION,
  CONSIDERATION_DUTY,
  CRISIS_BLOCKING_CLEARANCES,
  ENGAGEMENT_VERBS,
  ITEM_PURPOSES,
  SURFACE_APPROVAL_REGIME,
  SURFACE_CLASS,
  FIRST_INDICATOR_QUESTION,
  INSTRUMENTS,
  MARKETING_INBOUND_RETENTION_DAYS,
  MARKETING_RULES_DISCLOSURE,
  PRIORITY_MEANING,
  PROCESS_METRIC_KEYS,
  REACH_LEVEL_DESCRIPTION,
  REACH_RANK,
  REFUSED_METRICS,
  REGIME_LABEL,
  VERB_ADOPTION,
  VERB_INHERITS_TARGET_RISK,
  VERB_PRODUCES_OWN_TEXT,
  X_POST_MAX_CHARS,
} from '@lcx/shared';

/* ════════ THE CRISIS ENGINE (crisis.ts) ════════
 *
 * The crisis room RENDERS this engine and re-implements none of it: the statement texts, the
 * clearance rules, the contagion readiness board and the four pieces of evidence are
 * the engine's, and are read from it rather than restated in a component.
 */

export type {
  CrisisEvidence,
  HoldingStatement,
  HoldingStatementId,
} from '@lcx/shared';

export {
  CRISIS_EVIDENCE,
  HOLDING_STATEMENTS,
  HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON,
  HOLDING_STATEMENTS_UNREVIEWED_REASON,
  assessClearance,
  contagionReadiness,
  renderStatementGuidance,
} from '@lcx/shared';

/* ════════ THE ROUTE CONTRACTS (marketing/contracts/*.ts) ════════
 *
 * THE RESPONSE SHAPES, DECLARED ONCE AND IMPORTED BY BOTH SIDES. `lib/api/marketing.ts`
 * typed twenty-one payloads `UncontractedPayload = unknown` on purpose, and
 * `MARKETING_CONTRACTS_OWED` names the type each one owed. These are the ones that have
 * been declared: the route handler imports the same symbol from the same file, so the
 * compiler — not a mocked test — is what checks that a screen reads a field the API sends.
 *
 * A WEB-LOCAL COPY OF ANY OF THESE IS THE BUG THIS BLOCK EXISTS TO PREVENT. `lib/api/
 * gps.ts:83` records what it costs: a hand-written `GpsSummary` declared four fields the
 * API had never returned, `tsc` was green because a copy is syntactically perfect, the
 * page's own test agreed because it mocked the module, and the page crashed on the first
 * real payload. Narrowing `unknown` at runtime (`narrow.ts`) is the only alternative, and
 * it is what the surfaces whose contracts have NOT landed still do.
 *
 * ── ONE DEPENDENCY, STATED HERE SO IT IS NOT DISCOVERED IN CI ─────────────────
 * These names resolve only once `packages/shared/src/marketing/index.ts` re-exports
 * `./contracts/*.js`. That barrel is not this lane's file to edit — four API lanes and this
 * one all import through it, and five agents editing one barrel is how a merge eats a
 * declaration. If a build fails here with TS2305 on a name below, the missing line is in
 * that barrel and not in this compartment.
 */

/* Declared in `types.ts` §16 rather than in `contracts/`, because it landed before the
 * contracts directory existed. Same discipline, same guarantee: one declaration, imported
 * by `routes/marketing.ts` and by `lib/api/marketing.ts` alike. */
export type {
  AbusePerimeterEmbargoView,
  AbusePerimeterHoldingView,
  AbusePerimeterState,
  AssetEmbargoState,
  RegisterPresence,
} from '@lcx/shared';

/* The three verdicts the drafting room asks for. `POST /regime` and `POST /adoption` are in
 * `contracts/desk.ts` (`routes/marketingDesk.ts:892`, `:1485`); `POST /review`, which this
 * surface called for weeks against no router at all, is in `contracts/gates.ts` and is now
 * mounted at `routes/marketingGates.ts:548`.
 *
 * ── THE ONE BARREL LINE THESE NAMES WAIT ON, recorded here and not discovered in CI ──
 * `MarketingViolation`, `ReviewVerdict`, `ClaimSafetyVerdict`, `ReplyProvenanceRecord`,
 * `CorroborationResult`, `SilenceLog`, `SilenceLogEntry`, `ProcessMetrics` and
 * `MarketingLoopReport` resolve only once `packages/shared/src/marketing/index.ts` carries
 * `export * from './contracts/gates.js'` beside the three it already has. That barrel is NOT
 * this lane's file — five agents editing one barrel is how a merge eats a declaration — and
 * `routes/marketingGates.ts:173` records the same dependency from the API side, where the
 * same names are equally unresolved until it lands. A TS2305 on any name below is that line
 * and nothing in this compartment. */
export type {
  AdoptionReading,
  Art7FitStatement,
  ClaimSafetyVerdict,
  CorroborationResult,
  CorroborationState,
  MarketingLoopReport,
  MarketingViolation,
  ProcessMetrics,
  ProvenanceGrade,
  RegimeReading,
  ReplyProvenanceRecord,
  ReviewVerdict,
  SilenceLog,
  SilenceLogEntry,
  SilenceLogMeta,
} from '@lcx/shared';

export type {
  BundleCompletenessLine,
  BundleRecordEntry,
  ClaimExpiryBucket,
  ClaimExpiryLedger,
  ClaimExpiryRow,
  ErasureOutcome,
  ExportBundle,
  MarketingRecordRow,
  MarketingWireRefusal,
  PostTimeCoverageCounts,
  PostTimeCoverageReport,
  RetentionPosture,
  SubjectAccessResponse,
  WatchDigest,
  WatchSourceObservation,
} from '@lcx/shared';

/* ════════ THE MEASUREMENT ENGINE (loop.ts) ════════ */

export {
  MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
  notificationCensusFrame,
  ownRecordsFrame,
} from '@lcx/shared';

/* ════════ LOCAL: WHAT THIS SCREEN KNOWS ABOUT A GATE ════════ */

import type { Refusal } from '@lcx/shared';

/**
 * A tri-state over one gate, and the middle value is the point of it.
 *
 *  · `engine`   the compartment's engine answered; `refusals` is its verdict.
 *  · `preview`  this screen ran an arithmetic or literal-text pre-check of its own.
 *               Advisory. The same posture `meta.issueDecisionIsAdvisory` takes on the
 *               GPS quote desk: the block decision on screen is a preview, and the gate
 *               that decides can disagree with it.
 *  · `absent`   nothing checked this. NOT "clean" — a gate with no answer renders as a
 *               refusal to certify, because the alternative is a green tick earned by a
 *               missing endpoint.
 */
export type GateSource = 'engine' | 'preview' | 'absent';

export interface GateReading {
  /**
   * `adoption` joined the four in the last wave, when the drafting room stopped calling the
   * unmounted `POST /review` and started calling `POST /adoption` — which is a verdict about
   * the VERB rather than about the words. Scoring "what a repost would adopt" on the same
   * row as "is this sentence fair and clear" is how "we only retweeted it" became a defence
   * nobody could check.
   */
  readonly gate: 'claim_safety' | 'market_abuse' | 'regime' | 'length_budget' | 'adoption';
  readonly source: GateSource;
  readonly refusals: readonly Refusal[];
  /** Why the gate is not authoritative, when it is not. Printed verbatim. */
  readonly absentBecause: string | null;
}
