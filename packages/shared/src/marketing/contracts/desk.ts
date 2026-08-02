/**
 * MARKETING — THE DESK RESPONSE CONTRACTS (regime, triage, adoption, desk mode).
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * `apps/web/src/lib/api/marketing.ts:54` types twenty of its twenty-one fetchers
 * `UncontractedPayload = unknown`, and the comment above the ledger says why in one
 * sentence: a hand-written web-side interface guessing at a payload is the defect that
 * crashed the GPS compartment on 2026-08-01. So every shape a desk route returns is
 * declared HERE, once, and imported by `apps/api/src/routes/marketingDesk.ts` and by
 * the browser from the same symbol. One declaration, or none.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 * Nothing in this file re-declares an engine type. `RegimeDecision`, `DeskStanding`,
 * `AmplificationVerdict`, `PriorityOutcome` and `TriageClockReading` are the engines'
 * own vocabulary and they are imported, not copied. Every interface below is an
 * ENVELOPE: it says which engine outputs a route returns together, and adds only the
 * fields the route itself is the first to know (who asked, when, what the ledger row
 * was, whether the migration is applied).
 *
 * A copied field is a second vocabulary that agrees until the day one of them changes,
 * and `marketing/index.ts` records fourteen collisions that were each a real defect of
 * exactly that kind. Two hoisting decisions are therefore made explicitly and
 * narrowly, and each one is argued at its own docblock: `Art7FitStatement` (§1) and
 * `DeskOutboundGateRow` (§4). Both are projections of a computation the route ran, not
 * re-statements of state stored somewhere else.
 *
 * ── THE BARREL IS NOT WIRED HERE ─────────────────────────────────────────────
 * `packages/shared/src/marketing/index.ts` re-exports its modules with `export *`, and
 * this directory is not yet on that list. Until the line `export * from
 * './contracts/desk.js';` is added there, these names do not resolve through
 * `@lcx/shared` — the package publishes a single `"."` export, so a deep specifier
 * cannot be used as a workaround. Wiring the barrel is the integration pass's act, and
 * the API route file names the one line it needs.
 */
import type {
  ActorId,
  Figure,
  Instant,
  ObservationFrame,
  MarketingRegime,
  Refusal,
  RefusalCode,
  ResponseAction,
} from '../types.js';
import type { RegimeDecision } from '../regime.js';
import type {
  IndicatorSuggestion,
  OpinionGateVerdict,
  PriorityOutcome,
  ReachTrajectory,
  SilenceRecord,
  TriageClockReading,
} from '../triage.js';
import type { AmplificationVerdict } from '../adoption.js';
import type {
  CalendarDate,
  DeskAct,
  DeskPolicy,
  DeskStanding,
  ModeTransition,
  OrderAssessment,
  WorkingDayCalendar,
  WorkingDayResult,
} from '../deskMode.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 REGIME — WHICH LAW BITES, AND THE ARITHMETIC THAT ENDS THE ARGUMENT       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE ART 7 CHARACTER ARITHMETIC, PROJECTED FOR A SURFACE.
 *
 * This is the one hoist in §1 and the reason is that the number the operator needs is
 * not a field on `Art7Budget`: they need to know HOW MANY CHARACTERS OVER the item is
 * and WHAT TO DO INSTEAD, and the second of those lives in a module constant
 * (`ART_7_LINK_TO_COMPLIANT_PAGE`) rather than in the budget. A surface that had to
 * assemble those two itself would assemble them differently on each screen.
 *
 * Every field here is copied from the `Art7Budget` the same response carries in
 * `decision.art7`, so the two cannot disagree: `RegimeReading.art7Fit` is built from
 * `RegimeReading.decision.art7` in one place, in the route, and is `null` exactly when
 * that is.
 *
 * `remedy` is `null` when the item fits. A remedy shown next to a passing check is how
 * an operator learns to stop reading the box.
 */
export interface Art7FitStatement {
  readonly fits: boolean;
  /** X-weighted characters over the channel ceiling. 0 when it fits. */
  readonly shortfallChars: number;
  /** The mandated Art 7(1)(d)+(e) / Art 29(1)(d) / Art 53(1)(d) block, measured. */
  readonly mandatedChars: number;
  /** The author's own words, measured on the same weighting. */
  readonly editorialChars: number;
  /** `null` where the surface has no ceiling worth modelling — never "unlimited, so fine". */
  readonly limitChars: number | null;
  readonly channelLabel: string;
  /** True when the mandated text alone will not fit: nothing the author writes can help. */
  readonly mandatedAloneExceedsLimit: boolean;
  /**
   * Facts the desk has not supplied, so no honest length could be measured. Non-empty
   * means `shortfallChars` is 0 because the arithmetic did NOT run — read `fits`.
   */
  readonly missingMandatedFacts: readonly string[];
  /** `ART_7_LINK_TO_COMPLIANT_PAGE`, verbatim, or `null` when the item fits. */
  readonly remedy: string | null;
  readonly refusalCode: RefusalCode | null;
}

/** `POST /v1/marketing/regime` — the classifier, with its arithmetic and its refusals. */
export interface RegimeReading {
  /** The engine's decision, unreshaped. */
  readonly decision: RegimeDecision;
  /** `decision.classification.regimes`, hoisted for the one-line summary on a chip row. */
  readonly regimes: readonly MarketingRegime[];
  /** Built from `decision.art7`; `null` exactly when no promotional regime applies. */
  readonly art7Fit: Art7FitStatement | null;
  /** Every refusal code in `decision.refusals`, for a filterable list. */
  readonly refusalCodes: readonly RefusalCode[];
  /** Who ran the classifier. Read off the session, never off the request body. */
  readonly assessedBy: ActorId;
  readonly assessedAt: Instant;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 TRIAGE — THE RESIST 2 ASSESSMENT, AND THE DECISION IT SUPPORTS            */
/* ══════════════════════════════════════════════════════════════════════════ */

/** One rung of the reach ladder, with RESIST 2's own description. */
export interface ReachLadderRung {
  readonly level: string;
  readonly rank: number;
  readonly description: string;
  /** True for the rung the assessment currently sits on. */
  readonly current: boolean;
}

/**
 * `POST /v1/marketing/triage/assess` — the assessment, with nothing collapsed.
 *
 * The opinion gate comes first in the type for the same reason it runs first in the
 * engine: it is the discriminator that empties the queue, and an item it routes to
 * `engage_on_merits_or_ignore` should not be shown a debunk builder.
 *
 * `notChecked` is not decoration. A reading with no refusals and three unrun checks is
 * not a clean reading, and the field is what stops the screen presenting it as one.
 */
export interface TriageReading {
  readonly opinionGate: OpinionGateVerdict;
  /** FIRST suggestions from observable signals only. Every one needs a human to confirm. */
  readonly indicatorSuggestions: readonly IndicatorSuggestion[];
  /** Grade-basis and reach-basis refusals. Empty means every supplied grade had a basis. */
  readonly gradeRefusals: readonly Refusal[];
  readonly reachTrajectory: ReachTrajectory;
  readonly reachLadder: readonly ReachLadderRung[];
  readonly priority: PriorityOutcome;
  readonly clock: TriageClockReading;
  /** The tier's leading response options, per RESIST's own tools column. Advisory. */
  readonly leadingResponses: readonly ResponseAction['kind'][];
  /** Checks this reading did NOT run, named. */
  readonly notChecked: readonly string[];
  readonly assessedBy: ActorId;
  readonly assessedAt: Instant;
}

/**
 * `POST /v1/marketing/:id/triage` — the recorded decision.
 *
 * `silence` is non-null exactly when the action was `ignore`, and the route refuses the
 * write outright when an `ignore` arrives with no rationale: silence with no reason
 * recorded is absence of evidence, and the whole point of the log is to turn it into
 * evidence.
 *
 * `queueStatusSet` is the narrow union of the only two statuses this route sets. It is
 * NOT the full `ReplyStatus` vocabulary — declaring that here would put a second copy
 * of the queue's state machine in the shared package, and the route has no business
 * moving a row to `sent` or `approved_pending_send`.
 */
export interface TriageDecisionRecord {
  readonly replyId: number;
  readonly reading: TriageReading;
  readonly action: ResponseAction;
  readonly silence: SilenceRecord | null;
  readonly queueStatusSet: 'triaged' | 'ignored' | null;
  /** `object_actions.id` for the ledger row this decision produced. */
  readonly ledgerRef: string;
  readonly recordedBy: ActorId;
  readonly recordedAt: Instant;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 ADOPTION — WHAT "WE ONLY RETWEETED IT" ACTUALLY MEANS                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `POST /v1/marketing/adoption` — the answer to the question the operator is asking
 * with their cursor over the repost button.
 *
 * The verdict is returned whole. `blocked` is the single derived field, and it is
 * `verdict.refusals.length > 0` — computed in the route so no surface has to decide
 * for itself whether a refusal is advisory. In this compartment none of them are.
 */
export interface AdoptionReading {
  readonly verdict: AmplificationVerdict;
  /** True when at least one refusal fired. There is no "warning" tier here. */
  readonly blocked: boolean;
  readonly refusalCodes: readonly RefusalCode[];
  readonly askedBy: ActorId;
  readonly askedAt: Instant;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 THE DESK — ITS MODE, ITS STANDING, AND THE DOOR A SUSPENSION SHUTS       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * One outbound act and the refusal that met it, or `null` for a permitted act.
 *
 * THE SECOND HOIST, and the argument for it: `DeskStanding.outboundPermitted` is a
 * boolean, and a disabled button beside a boolean teaches an operator to look for
 * another route — which in this compartment means copying the text out by hand, which
 * is exactly what a suspension forbids and exactly what leaves no record. So the board
 * carries the refusal SENTENCE for each of the three doors text can leave through,
 * produced by `gateDeskAct`, which is the same function the write paths call.
 */
export interface DeskOutboundGateRow {
  readonly act: DeskAct;
  readonly refusal: Refusal | null;
}

/**
 * One recorded entry in the mode ledger.
 *
 * `transition` is `null` for the case the `DeskMode` union cannot express and
 * `deskMode.ts:1052 standingFromOrder` exists to carry: an Art 94(1)(p) prohibition
 * with no end date, or a (q) order whose effective date was recorded unreadably. Those
 * orders ARE recorded — refusing to record them would leave the desk reading `normal`
 * while a regulator's prohibition was in force, which is the one outcome no branch here
 * may produce — and the standing then comes from the order rather than from a mode.
 *
 * At least one of `transition` and `order` is always non-null.
 */
export interface DeskModeHistoryEntry {
  readonly transition: ModeTransition | null;
  readonly order: OrderAssessment | null;
  /** `object_actions.id`. The ledger row IS the evidence; the mode is derived from it. */
  readonly ledgerRef: string;
  readonly recordedAt: Instant;
  readonly recordedBy: ActorId;
  /** Why the mode changed, as the recorder wrote it. Never derived. */
  readonly reason: string;
}

/**
 * The queue counts the board shows, and nothing more.
 *
 * `byStatus` EXCLUDES quarantined rows — that is how `queueSummary` counts, and a
 * board that presented the two together would show a forged item as triaged work.
 * They are reported beside it, separately, deliberately.
 */
export interface DeskQueueCounts {
  readonly byStatus: Readonly<Record<string, number>>;
  readonly quarantined: number;
  readonly collisions: number;
  readonly unparsed: number;
  readonly suspicious: number;
}

/**
 * `GET /v1/marketing/desk` — the board in one read.
 *
 * ONE CALL RATHER THAN FIVE, because the parts are not independent: a clock is
 * meaningless without the `DeskMode` that may have suspended it, and a queue count is
 * meaningless without the frame saying what the window could not see. Assembling those
 * from separate responses in the browser is how a screen ends up showing a live clock
 * under a suspended desk.
 *
 * `queue` is a `Figure`, so the migration-pending case is `absent` with a refusal
 * rather than a plausible zero. The MODE, by contrast, is always readable: it is
 * derived from `object_actions`, which has existed since migration 0029, so an
 * authority suspension recorded during the 0046 window still shuts the desk.
 */
export interface DeskBoard {
  readonly standing: DeskStanding;
  readonly policy: DeskPolicy;
  readonly outboundGate: readonly DeskOutboundGateRow[];
  /**
   * The Art 94 order assessment, when the live mode came from one. Carries the
   * statutory ceiling and every anomaly in the order as recorded.
   */
  readonly order: OrderAssessment | null;
  /** The calendar the working-day arithmetic used, or `null` when none was recorded. */
  readonly calendar: WorkingDayCalendar | null;
  /** Working days left on a (q) suspension, or the refusal that says why it is unknown. */
  readonly workingDaysRemaining: WorkingDayResult<number> | null;
  readonly queue: Figure<DeskQueueCounts>;
  readonly frame: ObservationFrame;
  readonly history: readonly DeskModeHistoryEntry[];
  /**
   * `ledger` when a recorded transition set the current mode; `default_normal` when
   * nothing has ever been recorded. The difference matters: `default_normal` means the
   * desk is open because nobody has said otherwise, not because someone cleared it.
   */
  readonly modeSource: 'ledger' | 'default_normal';
  /** Migration 0046. `false` means the queue figure is absent, not empty. */
  readonly migrated: boolean;
  readonly asOf: Instant;
}

/**
 * `POST /v1/marketing/desk-mode` — the accepted mode change.
 *
 * A REFUSED change is not this shape: it is a 422 carrying `refusals`, because a
 * response that returned the requested mode with an empty transition would read as
 * acceptance. The engine returns refusals plurally on purpose — telling an operator
 * their reason is too short, and only after they fix it that they also lack the role,
 * is how a governance control gets routed around.
 */
export interface DeskModeRecord {
  /** `null` when the recorded order has no expressible `DeskMode` — see `DeskModeHistoryEntry`. */
  readonly transition: ModeTransition | null;
  /** The standing that follows, computed from the new mode rather than asserted. */
  readonly standing: DeskStanding;
  readonly policy: DeskPolicy;
  /** Present when the change recorded an Art 94 order. Carries the ceiling and anomalies. */
  readonly order: OrderAssessment | null;
  /** The Art 94(1)(q) statutory last day, where the power and a calendar allow it. */
  readonly statutoryCeiling: CalendarDate | null;
  readonly ledgerRef: string;
  readonly recordedAt: Instant;
}
