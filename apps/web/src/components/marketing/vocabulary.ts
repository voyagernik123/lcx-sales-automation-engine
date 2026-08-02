/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DESK'S VOCABULARY — one import boundary, and the whole of its debt
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every marketing surface in `components/marketing/**` and `pages/Marketing*.tsx`
 * takes its nouns from HERE and from nowhere else. That is deliberate: it makes the
 * one remaining compromise auditable in one file instead of scattered across ten.
 *
 * ── THE COMPROMISE: A DEEP PATH ───────────────────────────────────────────────
 * The declarations ARE the shared ones. `packages/shared/src/marketing/` owns the
 * vocabulary (`types.ts`), the crisis engine (`crisis.ts`) and the measurement engine
 * (`loop.ts`), and this file re-exports from them rather than restating anything. It
 * reaches them by a RELATIVE PATH because `packages/shared/src/index.ts` does not
 * export `./marketing/`, and the package's `exports` map has only `"."` — so
 * `@lcx/shared` cannot see these symbols and a subpath import would not resolve.
 *
 * `lib/api/gpsBook.ts:28` records why that is a real cost rather than mere ugliness: a
 * deep path bypasses the package boundary, so a symbol could vanish from the barrel and
 * this file would still compile.
 *
 * THE FIX IS ONE LINE IN A FILE THIS LANE DOES NOT OWN: add `export * from
 * './marketing/index.js'` to the shared barrel, then change the `from` clauses below to
 * `'@lcx/shared'`. No other file in the compartment changes.
 *
 * ── WHAT IS DECLARED LOCALLY, AND WHY IT IS NOT A PARALLEL COPY ───────────────
 * One shape, `GateReading`, and it is a property of THIS SCREEN's reads rather than of
 * the vocabulary: `GateVerdict` in types.ts §5 is the engine's answer, and `GateReading`
 * is the UI's knowledge of whether it got one. The wire shapes for the four reads that
 * did not exist yet live in `deskApi.ts`, narrowed from `unknown` and never asserted.
 */

/* ════════ THE SHARED VOCABULARY (types.ts, via the marketing barrel) ════════ */

export type {
  ActorId,
  AssetSymbol,
  Clearance,
  ClearanceRole,
  Confidence,
  ContentHash,
  DeskMode,
  EngagementVerb,
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
  RefusalCode,
  RefusalRecovery,
  RefusedMetricKey,
  ResponseAction,
  RuleCitation,
  TriageState,
  Verifiability,
} from '../../../../../packages/shared/src/marketing/index.js';

export {
  ART_7_1_E_STATEMENT_PLATFORM_OPERATOR,
  ATTRIBUTION_MIN_CONCURRING,
  CLEARANCE_HEADLINE_TEST_QUESTION,
  CONFIDENCE_DEFINITION,
  CRISIS_BLOCKING_CLEARANCES,
  ENGAGEMENT_VERBS,
  FIRST_INDICATOR_QUESTION,
  INSTRUMENTS,
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
} from '../../../../../packages/shared/src/marketing/index.js';

/* ════════ THE CRISIS ENGINE (crisis.ts) ════════
 *
 * Not re-exported through the marketing barrel, so it is reached directly. The crisis
 * room RENDERS this engine and re-implements none of it: the statement texts, the
 * clearance rules, the contagion readiness board and the four pieces of evidence are
 * the engine's, and are read from it rather than restated in a component.
 */

export type {
  CrisisEvidence,
  HoldingStatement,
  HoldingStatementId,
} from '../../../../../packages/shared/src/marketing/crisis.js';

export {
  CRISIS_EVIDENCE,
  HOLDING_STATEMENTS,
  HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON,
  HOLDING_STATEMENTS_UNREVIEWED_REASON,
  assessClearance,
  contagionReadiness,
  renderStatementGuidance,
} from '../../../../../packages/shared/src/marketing/crisis.js';

/* ════════ THE MEASUREMENT ENGINE (loop.ts) ════════ */

export {
  MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
  notificationCensusFrame,
  ownRecordsFrame,
} from '../../../../../packages/shared/src/marketing/loop.js';

/* ════════ LOCAL: WHAT THIS SCREEN KNOWS ABOUT A GATE ════════ */

import type { Refusal } from '../../../../../packages/shared/src/marketing/index.js';

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
  readonly gate: 'claim_safety' | 'market_abuse' | 'regime' | 'length_budget';
  readonly source: GateSource;
  readonly refusals: readonly Refusal[];
  /** Why the gate is not authoritative, when it is not. Printed verbatim. */
  readonly absentBecause: string | null;
}
