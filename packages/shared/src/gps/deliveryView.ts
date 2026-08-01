/**
 * GLOBAL SERVICES (GPS) — P10 DELIVERY, the VIEW layer.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  THIS FILE ADDS NO RULES. IT GIVES THE EXISTING ONES A FACE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `delivery.ts` is 1,320 lines with 45 tests and it is correct; until now it was
 *  referenced by zero web files (`GPS_100X_PLAN.md` §0: 4,564 engine lines, 0
 *  surfaces). The failure that produced a four-stat strip was not a missing
 *  engine, it was a missing wire shape — so everything below COMPOSES
 *  `deriveMilestones`, `engagementProgress`, `isEvidenceOverdue`, `canAccept`,
 *  `reviewSatisfied` and `wipLoad`, and re-derives none of them.
 *
 *  The rule that matters when reading this file: if a number appears here that
 *  the engine did not compute, it is a bug. The view's only jobs are (a) joining
 *  a derived plan to stored state, (b) turning a THROWN guarantee into a
 *  displayable verdict, (c) labelling, and (d) making one specific lie
 *  structurally impossible to render.
 *
 * WHAT THE DOCTRINE (`GPS_100X_PLAN.md` §1) REQUIRED OF EACH SHAPE
 *  D1 traceable  — `WipView.hourDrivers` is the `Driver { label, points }` pattern
 *                  (`alpha.ts:41`): every hour in the coordination total names the
 *                  engagement that contributed it. `ScopeDriftVerdict.coverage`
 *                  does the same for the plan: criterion → the milestones that
 *                  deliver it.
 *  D2 refusals    — `AcceptanceRow.verdict` carries `canAccept`'s reasons verbatim;
 *                  `EvidenceChaseRow.refused` keeps a refusal OUTSTANDING rather
 *                  than closing it; `EngagementPlan.unknownLiveKeys` surfaces a
 *                  stored milestone the catalogue no longer knows instead of
 *                  dropping it from the list.
 *  D3 uncertainty — `WipView.basisIsMeasured` sits BESIDE the hours, never inside
 *                  them (`COORDINATION_HOURS_ARE_PLACEHOLDERS`, delivery.ts:1173).
 *  D4 argues back — `notices` are the view's objections: over-ceiling, drift,
 *                  unexplained block, overdue input, unstaffable engagement.
 *  D5 density     — no presentation strings beyond labels and the engine's own
 *                  headline; the surface renders rows, not cards.
 *  D7 printable   — every view carries `asOf`, so a printed page is dated.
 *  D8 mechanism   — every claim on this wire names what produced it:
 *                  `SCOPE_DRIFT_MECHANISM`, `REVIEW_GATE_MECHANISM`,
 *                  `EXTERNAL_REFERENCE_IS_INERT`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ARTIFACT LOCKOUT APPLIES HERE, AND THIS FILE IS INSIDE THE RATCHET.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `intakeLockout.test.ts` discovers the shared GPS domain by walking the
 *  directory (`apps/api/src/gps/__tests__/intakeLockout.test.ts:180-186`), so this
 *  file is covered the moment it exists — deliberately, because a VIEW is the most
 *  natural place for someone to add "just a preview of the document". There is
 *  nothing to preview. `EvidenceChaseRow.externalLocation` is a reference a human
 *  types — "in the client's data room, folder 3", "held by their counsel, matter
 *  24-118" — and nothing in GPS resolves, retrieves, copies, mirrors or indexes
 *  it. Decision D2 (LCX DPO: controller vs processor for a third party's
 *  confidential material) is still unanswered, so the material stays where the
 *  client and counsel already keep it and GPS holds a sentence about where that
 *  is. See `delivery.ts:820-853` for the full reasoning; it is not repeated here
 *  because a second copy is a second thing to fall out of date.
 */

import type { Driver } from '../alpha.js';
import type { EngagementStatus, OfferKey, ServiceOffer } from './types.js';
import { ENGAGEMENT_STATUS_LABELS } from './types.js';
import { getOffer } from './catalogue.js';
import type {
  AcceptanceVerdict,
  Deliverable,
  DeliveryActor,
  DeliveryLoadInput,
  EngagementProgress,
  EvidenceCounterparty,
  EvidenceRequest,
  Milestone,
  MilestoneState,
  ProgressBlocker,
  WipLoad,
} from './delivery.js';
import {
  COORDINATION_HOURS_ARE_PLACEHOLDERS,
  DELIVERY_ACTOR_LABELS,
  MILESTONE_STATE_LABELS,
  NO_CLIENT_DOCUMENT_STORE_REASON,
  canAccept,
  deriveMilestones,
  engagementProgress,
  isEvidenceOutstanding,
  isEvidenceOverdue,
  reviewSatisfied,
  wipLoad,
} from './delivery.js';

/** One day, in ms. Ages and overdue-by are reported in whole days, never hours. */
const DAY_MS = 86_400_000;

/** Whole days between two instants, floored, or null when the input is unusable. */
function daysBetween(fromIso: string | null, toMs: number): number | null {
  if (!fromIso) return null;
  const t = new Date(fromIso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((toMs - t) / DAY_MS);
}

// ── 1 · THE PLAN, AND THE GUARANTEE THAT WAS ONLY EVER A THROW ────────────────

/**
 * `deriveMilestones` refuses to build a plan that has drifted from the sale, in
 * BOTH directions, and it refuses by THROWING (`delivery.ts:609-664`). A throw is
 * the right behaviour for a server and it is invisible on a screen: today the
 * only observable consequence is a 500, and the far more common case — the plan
 * is fine — produces no evidence at all.
 *
 * So the view runs the derivation and records the verdict either way. When it
 * passes, that is a POSITIVE assertion a screen can print with its mechanism
 * attached (D8): *every acceptance criterion sold is delivered by a named
 * milestone, and every milestone answers to one.* When it fails, the engine's own
 * message is carried verbatim rather than paraphrased, because the message names
 * the offer, the criterion and the index.
 */
export type ScopeDriftDirection =
  /** Work SOLD that the plan does not deliver — the failure that loses the client. */
  | 'sold_not_delivered'
  /** Work PLANNED that nobody sold — unbilled scope, the failure that eats margin. */
  | 'planned_not_sold'
  /** The plan cannot be built at all, so neither direction was reached. */
  | 'plan_unusable';

/**
 * The engine's five refusal cases, one code each, plus `unrecognised`.
 *
 * `unrecognised` exists because this classifier reads `delivery.ts`'s message
 * strings, and a future edit to those strings must degrade to "we cannot say
 * which direction" rather than to a confident wrong direction. That is D2 applied
 * to the view's own uncertainty: the verdict still refuses, it just stops claiming
 * to know why.
 */
export type ScopeDriftCode =
  | 'plan_missing'
  | 'duplicate_milestone_key'
  | 'criterion_out_of_range'
  | 'milestone_claims_nothing'
  | 'criterion_undelivered'
  | 'unrecognised';

export interface ScopeDriftFailure {
  code: ScopeDriftCode;
  direction: ScopeDriftDirection;
  /** `deriveMilestones`'s own message. Verbatim — it names offer, index and text. */
  engineMessage: string;
  /** What the operator has to do about it, in one sentence. */
  operatorDetail: string;
}

/** One sold acceptance criterion, and the milestones that answer for it. */
export interface CriterionCoverage {
  /** Index into `ServiceOffer.acceptanceCriteria`. Stable within a catalogue version. */
  index: number;
  /** The sentence the client agreed to, verbatim from the offer. Never paraphrased. */
  text: string;
  /**
   * Milestone keys delivering it. Non-empty for every criterion whenever
   * `matchesSale` is true — that is the whole content of the guarantee, and it is
   * shown as rows rather than asserted in prose (D1).
   */
  milestoneKeys: readonly string[];
}

/**
 * What was actually executed to produce the verdict. Rendered next to it, because
 * "this plan matches what was sold" is worth nothing without the mechanism (D8).
 */
export const SCOPE_DRIFT_MECHANISM =
  "deriveMilestones() re-derived the plan from the offer's acceptanceCriteria and refuses " +
  '(by throwing) if any criterion is delivered by no milestone, if any milestone claims no ' +
  'criterion, or if a milestone claims a criterion the offer does not have — delivery.ts:609.';

export interface ScopeDriftVerdict {
  /** True only when the derivation completed. There is no partial pass. */
  matchesSale: boolean;
  mechanism: string;
  checkedAt: string;
  criteriaSold: number;
  /** Distinct criteria claimed by at least one milestone. Equals `criteriaSold` on a pass. */
  criteriaDelivered: number;
  milestonesPlanned: number;
  coverage: readonly CriterionCoverage[];
  /**
   * Both directions are checked on every run, whichever way the verdict fell.
   * Carried so a screen can say WHICH guarantees hold rather than implying a
   * single vague "validated".
   */
  directionsChecked: readonly ScopeDriftDirection[];
  /** The printable positive claim, or the printable refusal. Never empty. */
  assertion: string;
  failure: ScopeDriftFailure | null;
}

const BOTH_DIRECTIONS: readonly ScopeDriftDirection[] = ['sold_not_delivered', 'planned_not_sold'];

/**
 * Map a `deriveMilestones` throw onto a code and a direction.
 *
 * Exported because it is the one piece of this file that is COUPLED to another
 * file's prose, and coupling that cannot be tested directly is coupling that
 * rots. Two of the five cases (`duplicate_milestone_key`, `milestone_claims_nothing`)
 * are unreachable through the real catalogue today — `MILESTONE_PLANS` is
 * module-private (`delivery.ts:200`) and all five plans are well-formed — so they
 * are tested through this function rather than through a contrived offer.
 */
export function classifyScopeDrift(message: string): { code: ScopeDriftCode; direction: ScopeDriftDirection } {
  if (/^no GPS delivery plan for offer/i.test(message)) {
    return { code: 'plan_missing', direction: 'plan_unusable' };
  }
  if (/duplicate milestone key/i.test(message)) {
    return { code: 'duplicate_milestone_key', direction: 'plan_unusable' };
  }
  if (/satisfies no acceptance criterion/i.test(message)) {
    return { code: 'milestone_claims_nothing', direction: 'planned_not_sold' };
  }
  if (/claims acceptance criterion/i.test(message)) {
    // A milestone pointing past the end of the criteria list is planned work with
    // nothing sold behind it — same direction as claiming none, different cause.
    return { code: 'criterion_out_of_range', direction: 'planned_not_sold' };
  }
  if (/does not deliver acceptance criterion/i.test(message)) {
    return { code: 'criterion_undelivered', direction: 'sold_not_delivered' };
  }
  return { code: 'unrecognised', direction: 'plan_unusable' };
}

const DRIFT_OPERATOR_DETAIL: Record<ScopeDriftCode, string> = {
  plan_missing:
    'This offer has no delivery plan in the catalogue, so nothing can be tracked against the sale. ' +
    'A plan has to be added to delivery.ts before this engagement can be run from here.',
  duplicate_milestone_key:
    "Two milestones in this offer's plan share a key, so state recorded against one could be read " +
    'as the other. The catalogue plan needs fixing; no engagement data is at fault.',
  criterion_out_of_range:
    "A milestone claims an acceptance criterion this offer does not have — the offer's criteria were " +
    'edited and the plan was not. Until they agree, the plan is delivering something nobody bought.',
  milestone_claims_nothing:
    'A milestone answers to no acceptance criterion: work is planned that was never sold, which is ' +
    'unbilled scope on a $10–25k engagement.',
  criterion_undelivered:
    'An acceptance criterion the client agreed to is delivered by no milestone. A partner is paid ' +
    'against these criteria, so this is work sold and not planned — fix before the next status call.',
  unrecognised:
    'The plan was refused and the refusal could not be classified — read the engine message as ' +
    'authoritative. This view no longer recognises delivery.ts\'s wording and needs updating.',
};

/**
 * The state an operator has actually recorded against a milestone.
 *
 * Narrow on purpose: the derived milestone owns title, intent, owner and the
 * quoted acceptance criteria (`delivery.ts:160-184`), and a stored copy of any of
 * those is a copy that can disagree with the sale. Only the three fields a human
 * changes are stored, which is also why the join below cannot drift.
 */
export interface LiveMilestoneState {
  key: string;
  state: MilestoneState;
  /** Required in practice when `state === 'blocked'`; 0049 enforces it in the DB. */
  blockedReason: string | null;
  /** When the state was last recorded. Null when nothing has been recorded yet. */
  updatedAt?: string | null;
}

/** A milestone as a row on a screen: the derived plan, plus what is recorded. */
export interface PlanRow {
  /** The derived milestone, with the live state already applied to `state`/`blockedReason`. */
  milestone: Milestone;
  ordinal: number;
  stateLabel: string;
  ownerLabel: string;
  /** False when no operator has ever recorded state — distinct from "not started". */
  recorded: boolean;
  recordedAt: string | null;
  /**
   * Blocked with no reason. Surfaced as its own defect rather than rendered as a
   * plain block, matching `ProgressBlocker.reasonMissing` (`delivery.ts:1009`).
   */
  blockedWithoutReason: boolean;
  /** True where the milestone cannot start until the client or counsel supplies something. */
  awaitsClientInput: boolean;
}

export interface EngagementPlan {
  offerKey: OfferKey;
  offerName: string;
  /** False when `deriveMilestones` refused. `rows` is then empty BY REFUSAL, not by absence. */
  usable: boolean;
  drift: ScopeDriftVerdict;
  /** Plan order. Empty if and only if `usable` is false. */
  rows: readonly PlanRow[];
  /**
   * Stored milestone keys the derived plan does not contain — a state row for work
   * the catalogue no longer plans. Shown, never dropped: silently discarding it is
   * how recorded delivery history disappears after a catalogue edit (D2).
   */
  unknownLiveKeys: readonly string[];
  /** Milestones with recorded state, of `rows.length`. A plan nobody has touched is visible. */
  recordedCount: number;
}

/**
 * Compose the plan for one engagement: derive from the sale, apply what is
 * recorded, and report the drift verdict either way.
 *
 * Takes a `ServiceOffer` rather than an `OfferKey` so a caller holding a frozen
 * `scope_snapshot` (`types.ts:328`) can pass the offer AS SOLD. That is the honest
 * input: an engagement sold in March must be checked against March's criteria, not
 * against a catalogue edited since.
 */
export function composeEngagementPlan(
  offer: ServiceOffer,
  live: readonly LiveMilestoneState[] = [],
  asOf: string = new Date().toISOString(),
): EngagementPlan {
  const criteria = offer.acceptanceCriteria;
  let derived: Milestone[] | null = null;
  let failure: ScopeDriftFailure | null = null;

  try {
    derived = deriveMilestones(offer);
  } catch (err) {
    const engineMessage = err instanceof Error ? err.message : String(err);
    const { code, direction } = classifyScopeDrift(engineMessage);
    failure = { code, direction, engineMessage, operatorDetail: DRIFT_OPERATOR_DETAIL[code] };
  }

  // Coverage is read back off the engine's OWN output rather than recomputed from
  // `satisfies`: each returned milestone carries the criteria text verbatim
  // (`delivery.ts:659`), so index equality is exact. Two identical criteria in one
  // offer would map to the same milestone set, which is correct — they are the same
  // sentence — and no offer has one today.
  const coverage: CriterionCoverage[] = criteria.map((text, index) => ({
    index,
    text,
    milestoneKeys: (derived ?? []).filter((m) => m.acceptanceCriteria.includes(text)).map((m) => m.key),
  }));
  const criteriaDelivered = coverage.filter((c) => c.milestoneKeys.length > 0).length;

  const drift: ScopeDriftVerdict = {
    matchesSale: failure === null,
    mechanism: SCOPE_DRIFT_MECHANISM,
    checkedAt: asOf,
    criteriaSold: criteria.length,
    criteriaDelivered,
    milestonesPlanned: derived?.length ?? 0,
    coverage,
    directionsChecked: failure && failure.direction === 'plan_unusable' ? [] : BOTH_DIRECTIONS,
    assertion: failure
      ? `SCOPE DRIFT — ${failure.operatorDetail}`
      : `This plan matches what was sold: all ${criteria.length} acceptance criteria are delivered by ` +
        `${derived?.length ?? 0} milestones, and every milestone answers to at least one criterion.`,
    failure,
  };

  const byKey = new Map(live.map((l) => [l.key, l]));
  const rows: PlanRow[] = (derived ?? []).map((m) => {
    const state = byKey.get(m.key);
    const merged: Milestone = state
      ? { ...m, state: state.state, blockedReason: state.blockedReason }
      : m;
    return {
      milestone: merged,
      ordinal: merged.ordinal,
      stateLabel: MILESTONE_STATE_LABELS[merged.state],
      ownerLabel: DELIVERY_ACTOR_LABELS[merged.owner],
      recorded: Boolean(state),
      recordedAt: state?.updatedAt ?? null,
      blockedWithoutReason: merged.state === 'blocked' && !merged.blockedReason,
      awaitsClientInput: merged.awaitsClientInput,
    };
  });

  const derivedKeys = new Set(rows.map((r) => r.milestone.key));

  return {
    offerKey: offer.key,
    offerName: offer.name,
    usable: failure === null,
    drift,
    rows,
    // Only meaningful when the plan derived; an unusable plan makes every stored
    // key "unknown", which would be noise rather than a finding.
    unknownLiveKeys: failure ? [] : live.map((l) => l.key).filter((k) => !derivedKeys.has(k)),
    recordedCount: rows.filter((r) => r.recorded).length,
  };
}

// ── 2 · PROGRESS, WHERE THE PERCENTAGE IS STRUCTURALLY UNAVAILABLE ────────────

/**
 * `engagementProgress` already refuses the flattering reading: `isBlocked` is
 * returned beside `completePct` with the instruction that a percentage must never
 * be rendered without it (`delivery.ts:1029-1034`), and the headline leads with
 * BLOCKED. But a caller can still read `completePct` and ignore `isBlocked` — the
 * comment is the only thing stopping it, and comments do not survive a hurried
 * screen.
 *
 * So the wire does not offer the choice. `ProgressDisplay` is a discriminated
 * union in which THE BLOCKED VARIANT HAS NO PERCENTAGE FIELD AT ALL. A surface
 * cannot render "60% done" on a blocked engagement because it cannot narrow to a
 * shape that has the number; the compiler refuses before a reviewer has to.
 *
 * Counts survive into the blocked variant on purpose. "3 of 5 complete, and one
 * blocked" is what the engine's own headline says (`delivery.ts:1101`); a count is
 * a fact about the plan, whereas the percentage is the thing that reads as
 * momentum. `blocked` and `not_started` are separate variants for the same reason
 * they are separate states (`delivery.ts:104-110`): one is a plan, the other is a
 * problem, and they must not share a rendering.
 */
export type ProgressDisplay =
  /** The plan could not be derived. There is no progress to report, and why. */
  | { readonly kind: 'plan_unusable'; readonly reason: string }
  /** Empty plan, or every milestone waived. "No plan" is not "0% done". */
  | { readonly kind: 'no_countable_milestones'; readonly total: number; readonly waived: number; readonly note: string }
  /** At least one milestone is blocked. NO `pct` FIELD — see the docblock above. */
  | {
      readonly kind: 'blocked';
      readonly complete: number;
      readonly countable: number;
      readonly blockedCount: number;
      /** The lead blocker's sentence, or the fact that nobody recorded one. */
      readonly leadReason: string;
    }
  /** Nothing blocked, so the percentage is honest. */
  | {
      readonly kind: 'percent';
      readonly pct: number;
      readonly complete: number;
      readonly countable: number;
      /** `not_started` and `in_progress` are distinguished here, not by the number. */
      readonly movement: 'not_started' | 'in_progress' | 'complete';
    };

/** A blocker as a row: the engine's blocker, labelled, with the missing-reason case named. */
export interface BlockerRow {
  key: string;
  ordinal: number;
  title: string;
  owner: DeliveryActor;
  ownerLabel: string;
  reason: string | null;
  /** True when the block has no recorded reason — itself the thing to chase. */
  reasonMissing: boolean;
  /** What to print. Never blank, and never silently blank-looking. */
  reasonDisplay: string;
}

export interface ProgressView {
  asOf: string;
  /**
   * The engine's reading, unaltered, for a drawer that opens the number (D1). Null
   * only when the plan is unusable — there is then nothing to compute over.
   */
  progress: EngagementProgress | null;
  /** What a surface is allowed to render. The only source of a percentage. */
  display: ProgressDisplay;
  /** `blocked` outranks `in_progress`, as in the engine. */
  stateLabel: string;
  isBlocked: boolean;
  blockers: readonly BlockerRow[];
  /** Blocked with nothing recorded as to why. A reporting defect, counted. */
  unexplainedBlockers: number;
  awaitingClientInput: number;
  /** The engine's own status sentence, verbatim. Paste-able into a client update. */
  headline: string;
  next: EngagementProgress['next'];
}

const PROGRESS_STATE_LABELS: Record<'not_started' | 'in_progress' | 'blocked' | 'complete', string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'BLOCKED',
  complete: 'Complete',
};

function blockerRow(b: ProgressBlocker): BlockerRow {
  return {
    key: b.key,
    ordinal: b.ordinal,
    title: b.title,
    owner: b.owner,
    ownerLabel: DELIVERY_ACTOR_LABELS[b.owner],
    reason: b.reason,
    reasonMissing: b.reasonMissing,
    reasonDisplay: b.reason ?? 'No reason recorded — chase this before the next status update.',
  };
}

/**
 * Compose the progress view from a plan.
 *
 * Takes the `EngagementPlan` rather than raw milestones so the unusable-plan case
 * cannot be forgotten: a caller that has no plan has no progress, and the
 * alternative — passing `[]` to `engagementProgress` — would report "No delivery
 * plan yet" for an engagement whose plan exists and is broken. Those are different
 * facts and a status call goes differently for each.
 */
export function composeProgressView(plan: EngagementPlan, asOf: string = new Date().toISOString()): ProgressView {
  if (!plan.usable) {
    const reason = plan.drift.failure?.operatorDetail ?? plan.drift.assertion;
    return {
      asOf,
      progress: null,
      display: { kind: 'plan_unusable', reason },
      stateLabel: 'No usable plan',
      isBlocked: false,
      blockers: [],
      unexplainedBlockers: 0,
      awaitingClientInput: 0,
      headline: `No progress can be reported: ${reason}`,
      next: null,
    };
  }

  const milestones = plan.rows.map((r) => r.milestone);
  const progress = engagementProgress(milestones);
  const blockers = progress.blockers.map(blockerRow);

  let display: ProgressDisplay;
  if (progress.countable === 0) {
    display = {
      kind: 'no_countable_milestones',
      total: progress.total,
      waived: progress.waived,
      note:
        progress.total === 0
          ? 'No delivery plan yet — not 0% done.'
          : `All ${progress.waived} milestones were waived by agreement; there is nothing left to complete.`,
    };
  } else if (progress.isBlocked) {
    // The percentage is not computed here and not carried. `progress.completePct`
    // still exists on the engine object for a drawer that shows the arithmetic,
    // but nothing in the blocked display path can reach it.
    display = {
      kind: 'blocked',
      complete: progress.complete,
      countable: progress.countable,
      blockedCount: progress.blocked,
      leadReason: blockers[0]?.reasonDisplay ?? 'Blocked, with no blocker recorded.',
    };
  } else {
    display = {
      kind: 'percent',
      // Non-null by construction: countable > 0 (`delivery.ts:1077`).
      pct: progress.completePct ?? 0,
      complete: progress.complete,
      countable: progress.countable,
      movement: progress.state === 'complete' ? 'complete' : progress.state === 'not_started' ? 'not_started' : 'in_progress',
    };
  }

  return {
    asOf,
    progress,
    display,
    stateLabel: PROGRESS_STATE_LABELS[progress.state],
    isBlocked: progress.isBlocked,
    blockers,
    unexplainedBlockers: blockers.filter((b) => b.reasonMissing).length,
    awaitingClientInput: progress.awaitingClientInput,
    headline: progress.headline,
    next: progress.next,
  };
}

// ── 3 · THE EVIDENCE CHASE ────────────────────────────────────────────────────

/**
 * The sentence a surface prints beside the reference an operator typed.
 *
 * Exported as text, for the same reason `NO_CLIENT_DOCUMENT_STORE_REASON` is
 * (`delivery.ts:64-70`): a boolean invites someone to flip it, and flipping it
 * would enable nothing, because no path in GPS accepts a client's material. The
 * reference is human-entered free text — an operator types it — and nothing in GPS
 * resolves, retrieves, copies, previews or indexes it.
 */
export const EXTERNAL_REFERENCE_IS_INERT =
  'Where the client says the material lives, in their own systems, typed by an operator. ' +
  'GPS never resolves, retrieves or copies it — decision D2 (controller vs processor for a ' +
  "third party's confidential material) is unanswered, so the material stays where the client " +
  'and their counsel already keep it.';

/**
 * One outstanding (or settled) client input, as a chase-list row.
 *
 * OVERDUE IS DERIVED HERE, NEVER STORED. `EvidenceStatus` has no `overdue` member
 * on purpose (`delivery.ts:780-790`): a stored flag is wrong the moment nobody runs
 * the job that sets it, and a wrong-but-confident status is worse than a computed
 * one. Every row below is computed against the `asOf` this view was built with, so
 * the same row read an hour later can honestly change.
 */
export interface EvidenceChaseRow {
  id: string;
  engagementId: string;
  clientId: string;
  /** The milestone this unblocks, when there is one. */
  milestoneKey: string | null;
  /** What we asked for, in words. The description IS the record; there is no payload. */
  description: string;
  requestedFrom: EvidenceCounterparty;
  requestedFromLabel: string;
  requestedFromName: string | null;
  requestedAt: string;
  dueBy: string | null;
  status: EvidenceRequest['status'];
  /** Does delivery actually stop without this? Per request, never implied. */
  blocking: boolean;
  outstanding: boolean;
  /** `isEvidenceOverdue(row, asOf)` — a function of `dueBy` and the clock. */
  overdue: boolean;
  /** Whole days past `dueBy`. Null when not overdue or undated. */
  overdueByDays: number | null;
  /** Whole days since we asked. The number that makes a polite chase inevitable. */
  ageDays: number | null;
  /** Outstanding with no `dueBy`: not overdue — UNMANAGED, which is worse. */
  unmanaged: boolean;
  /**
   * A refusal is a real outcome and it leaves the input outstanding: the client
   * said no, the work is still stopped, and the scope needs re-agreeing
   * (`delivery.ts:857-866`).
   */
  refused: boolean;
  resolutionNote: string | null;
  requestedBy: string;
  /** Human-entered reference. Read `EXTERNAL_REFERENCE_IS_INERT` above. */
  externalLocation: string | null;
  /** True when a reference was typed. There is nothing to click, only to read. */
  hasExternalReference: boolean;
}

export interface EvidenceChase {
  asOf: string;
  /** Outstanding first, then most overdue. Settled rows are excluded by the composer. */
  rows: readonly EvidenceChaseRow[];
  outstanding: number;
  /** Outstanding AND blocking — the count that explains a delivery date. */
  blockingOutstanding: number;
  overdue: number;
  /** Outstanding, undated. Nobody is chasing these and nothing will flag them. */
  unmanaged: number;
  refused: number;
  /** The chase-list statement. Names the party holding the oldest overdue item. */
  headline: string;
  /** Carried on the wire so a surface cannot omit it by forgetting to import it. */
  referenceNotice: string;
}

/**
 * Build the chase list. Settled requests (`received`, `waived`) are dropped —
 * `isEvidenceOutstanding` decides that, not this function — and everything else is
 * kept, including refusals.
 */
export function composeEvidenceChase(
  requests: readonly EvidenceRequest[],
  asOf: string = new Date().toISOString(),
): EvidenceChase {
  const nowMs = new Date(asOf).getTime();
  const rows: EvidenceChaseRow[] = requests
    .filter((r) => isEvidenceOutstanding(r))
    .map((r) => {
      const overdue = isEvidenceOverdue(r, nowMs);
      const past = overdue ? daysBetween(r.dueBy, nowMs) : null;
      return {
        id: r.id,
        engagementId: r.engagementId,
        clientId: r.clientId,
        milestoneKey: r.milestoneKey,
        description: r.description,
        requestedFrom: r.requestedFrom,
        requestedFromLabel: DELIVERY_ACTOR_LABELS[r.requestedFrom],
        requestedFromName: r.requestedFromName,
        requestedAt: r.requestedAt,
        dueBy: r.dueBy,
        status: r.status,
        blocking: r.blocking,
        outstanding: true,
        overdue,
        overdueByDays: past === null ? null : Math.max(past, 0),
        ageDays: daysBetween(r.requestedAt, nowMs),
        unmanaged: r.dueBy === null,
        refused: r.status === 'refused',
        resolutionNote: r.resolutionNote,
        requestedBy: r.requestedBy,
        externalLocation: r.externalLocation,
        hasExternalReference: typeof r.externalLocation === 'string' && r.externalLocation.trim().length > 0,
      };
    })
    // Most overdue first, then the oldest ask. Undated rows sort last among equals
    // because there is no date to be late against — `unmanaged` is how they surface.
    .sort((a, b) => (b.overdueByDays ?? -1) - (a.overdueByDays ?? -1) || (b.ageDays ?? 0) - (a.ageDays ?? 0));

  const overdue = rows.filter((r) => r.overdue);
  const blockingOutstanding = rows.filter((r) => r.blocking).length;
  const unmanaged = rows.filter((r) => r.unmanaged).length;
  const refused = rows.filter((r) => r.refused).length;

  const worst = overdue[0];
  const headline =
    rows.length === 0
      ? 'Nothing outstanding from the client, their counsel or a partner.'
      : `${rows.length} outstanding (${blockingOutstanding} blocking delivery)` +
        `${overdue.length > 0 ? `, ${overdue.length} overdue` : ''}` +
        `${worst ? ` — oldest is ${worst.overdueByDays}d late from ${worst.requestedFromLabel}${worst.requestedFromName ? ` (${worst.requestedFromName})` : ''}: ${worst.description}` : ''}` +
        `${unmanaged > 0 ? `; ${unmanaged} with no due date, so nothing will ever flag them` : ''}` +
        `${refused > 0 ? `; ${refused} refused — the scope needs re-agreeing, not chasing` : ''}.`;

  return {
    asOf,
    rows,
    outstanding: rows.length,
    blockingOutstanding,
    overdue: overdue.length,
    unmanaged,
    refused,
    headline,
    referenceNotice: EXTERNAL_REFERENCE_IS_INERT,
  };
}

// ── 4 · ACCEPTANCE, AND WHERE THE RULE ACTUALLY LIVES ─────────────────────────

/**
 * The review gate is enforced in the DATABASE, and the view's job is to make that
 * legible — not to restate it.
 *
 * `0049_gps_delivery.sql:328` declares
 * `CONSTRAINT gps_deliverable_no_acceptance_before_review CHECK (NOT (review_required
 * AND accepted_at IS NOT NULL AND reviewed_at IS NULL))`, so no endpoint, batch
 * update or hand-run SQL can accept unreviewed work product. `canAccept`
 * (`delivery.ts:927`) is the same rule stated where an operator can be told about it
 * BEFORE they try. Two statements of one rule is already one more than ideal; a third
 * in the web layer is how the three fall out of step, so this file adds none and
 * names both instead.
 */
export const REVIEW_GATE_MECHANISM =
  'Acceptance of review-required work is refused by canAccept() (delivery.ts:927) and, independently, ' +
  'by the database constraint gps_deliverable_no_acceptance_before_review (0049_gps_delivery.sql:328). ' +
  'This screen reports those refusals; it does not implement the rule.';

/** The constraint by name, so a refusal can cite the thing that would have stopped it anyway. */
export const REVIEW_GATE_DB_CONSTRAINT = 'gps_deliverable_no_acceptance_before_review';

export interface AcceptanceRow {
  deliverableId: string;
  engagementId: string;
  clientId: string;
  title: string;
  description: string;
  milestoneKey: string | null;
  /**
   * An accepted deliverable with no milestone is scope that was delivered and
   * possibly never priced (`delivery.ts:733-737`). Flagged, not inferred.
   */
  outsideThePlan: boolean;
  owner: Deliverable['owner'];
  ownerLabel: string;
  state: Deliverable['state'];
  reviewRequired: boolean;
  /** Kept even when review is not required: "we decided this needed none" is a decision. */
  reviewBasis: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** `reviewSatisfied(d)` — both a named reviewer AND a date, or it is a half-record. */
  reviewRecorded: boolean;
  /** The engine's verdict, unmodified: state, canAccept, and every reason in order. */
  verdict: AcceptanceVerdict;
  /** Empty when acceptance may proceed. Hardest gate first, as the engine ordered them. */
  refusals: AcceptanceVerdict['reasons'];
  acceptedAt: string | null;
  acceptedBy: string | null;
  /** The operator's audit note on how the client received it. Not a pointer. */
  handoverChannel: string | null;
}

export interface AcceptanceView {
  asOf: string;
  rows: readonly AcceptanceRow[];
  /** Deliverables `canAccept` would allow through right now. */
  acceptable: number;
  /** Refused, with reasons on every row. Never a silent exclusion (D2). */
  blocked: number;
  accepted: number;
  /** Refused specifically because a required review is not recorded. */
  awaitingReview: number;
  /** Refused because a blocking client input is still outstanding. */
  awaitingEvidence: number;
  /** Accepted work product that answers to no milestone — delivered, maybe unpriced. */
  outsideThePlan: number;
  headline: string;
  /** Carried on the wire: the refusal names its mechanism wherever it is rendered (D8). */
  gateMechanism: string;
  gateDbConstraint: string;
}

/**
 * Compose the acceptance view.
 *
 * `evidence` is passed straight through to `canAccept`, which does its own
 * filtering by engagement and milestone (`delivery.ts:966-972`) — deliberately not
 * pre-filtered here, because a second filter is a second chance to filter
 * differently and block the wrong deliverable.
 */
export function composeAcceptanceView(
  deliverables: readonly Deliverable[],
  evidence: readonly EvidenceRequest[] = [],
  asOf: string = new Date().toISOString(),
): AcceptanceView {
  const rows: AcceptanceRow[] = deliverables.map((d) => {
    const verdict = canAccept(d, evidence);
    return {
      deliverableId: d.id,
      engagementId: d.engagementId,
      clientId: d.clientId,
      title: d.title,
      description: d.description,
      milestoneKey: d.milestoneKey,
      outsideThePlan: d.milestoneKey === null,
      owner: d.owner,
      ownerLabel: DELIVERY_ACTOR_LABELS[d.owner],
      state: d.state,
      reviewRequired: d.reviewRequired,
      reviewBasis: d.reviewBasis,
      reviewedBy: d.reviewedBy,
      reviewedAt: d.reviewedAt,
      reviewRecorded: reviewSatisfied(d),
      verdict,
      refusals: verdict.reasons,
      acceptedAt: d.acceptedAt,
      acceptedBy: d.acceptedBy,
      handoverChannel: d.handoverChannel,
    };
  });

  const acceptable = rows.filter((r) => r.verdict.canAccept).length;
  const accepted = rows.filter((r) => r.verdict.state === 'accepted').length;
  const blocked = rows.filter((r) => r.verdict.state === 'blocked').length;
  const has = (r: AcceptanceRow, code: string) => r.refusals.some((x) => x.code === code);
  const awaitingReview = rows.filter((r) => has(r, 'review_outstanding')).length;
  const awaitingEvidence = rows.filter((r) => has(r, 'evidence_outstanding')).length;
  const outsideThePlan = rows.filter((r) => r.outsideThePlan).length;

  const headline =
    rows.length === 0
      ? 'No deliverables recorded yet.'
      : `${rows.length} deliverable${rows.length === 1 ? '' : 's'}: ${accepted} accepted, ${acceptable} ready to accept, ` +
        `${blocked} refused` +
        `${awaitingReview > 0 ? ` — ${awaitingReview} awaiting a recorded review, which the database will refuse to accept without (${REVIEW_GATE_DB_CONSTRAINT})` : ''}` +
        `${awaitingEvidence > 0 ? `; ${awaitingEvidence} waiting on a blocking client input` : ''}` +
        `${outsideThePlan > 0 ? `; ${outsideThePlan} answer to no milestone — delivered scope that may never have been priced` : ''}.`;

  return {
    asOf,
    rows,
    acceptable,
    blocked,
    accepted,
    awaitingReview,
    awaitingEvidence,
    outsideThePlan,
    headline,
    gateMechanism: REVIEW_GATE_MECHANISM,
    gateDbConstraint: REVIEW_GATE_DB_CONSTRAINT,
  };
}

// ── 5 · THE COORDINATION CEILING ──────────────────────────────────────────────

export interface WipCeiling {
  capacityHoursPerWeek: number;
  committedHoursPerWeek: number;
  /** Capacity minus committed. NEGATIVE when he is over — not clamped to zero. */
  headroomHours: number;
  utilisationPct: number | null;
  /** Exactly at the ceiling: no headroom left, not yet over. */
  atCeiling: boolean;
  overCeiling: boolean;
  /** Hours past the ceiling. Null when not over. */
  overByHours: number | null;
}

/** The answer to the only question this view exists to answer. */
export interface AnotherEngagementAnswer {
  verdict: 'capacity_remains' | 'at_ceiling' | 'over_ceiling';
  /** Names the hours, the ceiling and the basis. Never a bare yes/no. */
  because: string;
}

export interface WipView {
  asOf: string;
  /** `wipLoad()`'s output, unaltered — counts, per-offer spread, and its headline. */
  load: WipLoad;
  /**
   * Every hour in the committed total, attributed to the engagement that caused it
   * (D1, `Driver { label, points }`, `alpha.ts:41`). Points sum to
   * `load.coordinationHoursPerWeek`.
   */
  hourDrivers: readonly Driver[];
  ceiling: WipCeiling;
  /**
   * FALSE today. The hours are placeholders (`COORDINATION_HOURS_ARE_PLACEHOLDERS`,
   * `delivery.ts:1173`) and this flag sits BESIDE them rather than discounting them
   * (D3): a capacity number quietly shaded for uncertainty is a number nobody can
   * argue with.
   */
  basisIsMeasured: boolean;
  basisNote: string;
  /** The statement. When he is over the ceiling it says so first. */
  statement: string;
  anotherEngagement: AnotherEngagementAnswer;
}

const PLACEHOLDER_BASIS_NOTE =
  'Coordination hours per engagement and the weekly ceiling are PLACEHOLDERS, not measured ' +
  '(delivery.ts:1160-1196). Partners deliver; this is the founder\'s own coordination time around a ' +
  'full-time LCX job, and only he can supply the real figures. Read the shape and the ordering, not ' +
  'the magnitudes.';

const MEASURED_BASIS_NOTE =
  'Coordination hours are measured figures supplied per engagement or per offer, not placeholders.';

/**
 * Attribute the committed hours to engagements by LEAVE-ONE-OUT.
 *
 * The per-offer hours table is module-private in `delivery.ts:1178` and that is
 * correct — it is a placeholder nobody should read directly, the same posture as
 * `TODO_PRICE_BANDS`. So instead of copying it (a second constant, guaranteed to
 * drift), each engagement's contribution is the amount the engine's own total moves
 * when that engagement is removed. It costs one extra `wipLoad` call per
 * engagement, at a concurrency ceiling of a handful, and it cannot disagree with
 * the total it explains.
 */
function attributeHours(engagements: readonly DeliveryLoadInput[], total: number): Driver[] {
  const drivers: Driver[] = [];
  let attributed = 0;
  for (let i = 0; i < engagements.length; i += 1) {
    const e = engagements[i]!;
    const without = wipLoad(engagements.filter((_, j) => j !== i));
    const points = total - without.coordinationHoursPerWeek;
    attributed += points;
    const offerName = getOffer(e.offerKey).name;
    drivers.push({
      label:
        points === 0
          ? `${offerName} — ${e.engagementId}: no coordination hours assigned at status "${e.status}"`
          : `${offerName} — ${e.engagementId}`,
      points,
    });
  }
  // Defensive, and cheap: if attribution ever fails to reconstruct the engine's
  // total, say so on the wire rather than showing drivers that do not add up.
  if (attributed !== total) {
    drivers.push({ label: `UNATTRIBUTED — drivers do not reconstruct the engine total`, points: total - attributed });
  }
  return drivers.sort((a, b) => b.points - a.points);
}

/**
 * Compose the WIP view over the whole desk (not one engagement): the ceiling is
 * his, and it is drawn by everything already running.
 */
export function composeWipView(
  engagements: readonly DeliveryLoadInput[],
  asOf: string = new Date().toISOString(),
): WipView {
  const load = wipLoad(engagements);
  const committed = load.coordinationHoursPerWeek;
  const capacity = load.capacityHoursPerWeek;
  const headroom = capacity - committed;
  const atCeiling = capacity > 0 && committed === capacity;
  const overBy = load.overCapacity ? committed - capacity : null;

  const ceiling: WipCeiling = {
    capacityHoursPerWeek: capacity,
    committedHoursPerWeek: committed,
    headroomHours: headroom,
    utilisationPct: load.utilisationPct,
    atCeiling,
    overCeiling: load.overCapacity,
    overByHours: overBy,
  };

  const basisSuffix = load.usesPlaceholderHours ? ' on placeholder hours, which he has not yet replaced' : '';
  const anotherEngagement: AnotherEngagementAnswer = load.overCapacity
    ? {
        verdict: 'over_ceiling',
        because:
          `OVER CEILING by ${overBy}h/week: ${committed}h committed against a ${capacity}h ceiling${basisSuffix}. ` +
          'Another engagement is sold time he does not have.',
      }
    : atCeiling
      ? {
          verdict: 'at_ceiling',
          because: `AT CEILING: ${committed}h committed of ${capacity}h${basisSuffix}. There is no headroom for another engagement.`,
        }
      : {
          verdict: 'capacity_remains',
          because: `${headroom}h/week of ${capacity}h remains uncommitted${basisSuffix}.`,
        };

  const statement =
    (load.overCapacity ? `OVER COORDINATION CEILING. ` : atCeiling ? `AT COORDINATION CEILING. ` : '') +
    load.headline +
    (load.blocked > 0
      ? ` Blocked engagements are still counted: chasing a client for an input IS the coordination work.`
      : '') +
    (load.unstaffable > 0
      ? ` ${load.unstaffable} of these have no named partner, so they are his to deliver — the assumption this ceiling is built on does not hold for them.`
      : '');

  return {
    asOf,
    load,
    hourDrivers: attributeHours(engagements, committed),
    ceiling,
    basisIsMeasured: !load.usesPlaceholderHours,
    basisNote: load.usesPlaceholderHours ? PLACEHOLDER_BASIS_NOTE : MEASURED_BASIS_NOTE,
    statement,
    anotherEngagement,
  };
}

// ── 6 · THE WIRE ──────────────────────────────────────────────────────────────

/**
 * THIS IS THE ONE DECLARATION. The API returns it and the web imports it — neither
 * re-declares it.
 *
 * A hand-copied response interface in `apps/web/src/lib/api/` declaring fields the
 * API never returned took production down this week: `tsc` believed the copy and the
 * mocked test agreed with it. So the shape lives here, in the package both sides
 * already depend on, and a field that does not exist here does not exist.
 */
export interface DeliveryEngagementRef {
  id: string;
  clientId: string;
  /** Null when the caller did not join the client row. Never invented. */
  clientName: string | null;
  offerKey: OfferKey;
  offerName: string;
  status: EngagementStatus;
  statusLabel: string;
}

/** What the view objects to (D4). Ordered hardest-first by the composer. */
export type DeliveryNoticeCode =
  | 'scope_drift'
  | 'orphaned_milestone_state'
  | 'delivery_blocked'
  | 'unexplained_block'
  | 'evidence_overdue'
  | 'evidence_refused'
  | 'evidence_unmanaged'
  | 'acceptance_review_outstanding'
  | 'deliverable_outside_plan'
  | 'wip_over_ceiling'
  | 'wip_at_ceiling'
  | 'no_named_partner'
  | 'coordination_hours_are_placeholders';

export interface DeliveryNotice {
  code: DeliveryNoticeCode;
  /**
   * `refusal` — the system is saying no, and the reason is in `text`.
   * `warning`  — nothing is blocked yet and something will go wrong.
   * `badge`    — a statement about the data itself, e.g. a placeholder.
   */
  severity: 'refusal' | 'warning' | 'badge';
  text: string;
  /** What produced the notice, when it is not obvious from the text (D8). */
  mechanism?: string;
}

/** The lockout, restated on the wire so a surface cannot render the screen without it. */
export interface DeliveryLockoutNotice {
  /** `NO_CLIENT_DOCUMENT_STORE_REASON`, verbatim from `delivery.ts:71`. */
  noClientDocumentStore: string;
  /** `EXTERNAL_REFERENCE_IS_INERT`. */
  externalReferenceIsInert: string;
  /** Where the absence is enforced, so it reads as a lock and not as a missing feature. */
  enforcedBy: readonly string[];
}

export interface DeliveryResponse {
  /** When this was composed. Every view carries it, so a printed page is dated (D7). */
  asOf: string;
  engagement: DeliveryEngagementRef;
  plan: EngagementPlan;
  progress: ProgressView;
  evidence: EvidenceChase;
  acceptance: AcceptanceView;
  /** DESK-WIDE, not this engagement's: the ceiling is his and everything running draws on it. */
  wip: WipView;
  notices: readonly DeliveryNotice[];
  lockout: DeliveryLockoutNotice;
}

/** Everything the composer needs. Rows in, view out — it reads nothing. */
export interface DeliveryResponseInput {
  engagement: {
    id: string;
    clientId: string;
    clientName?: string | null;
    offerKey: OfferKey;
    status: EngagementStatus;
    /**
     * The offer AS SOLD — pass the frozen `scope_snapshot` offer when there is one
     * (`types.ts:328`), so drift is measured against what the client agreed to and
     * not against a catalogue edited since. Falls back to the live catalogue.
     */
    offer?: ServiceOffer;
  };
  /** Recorded milestone state for THIS engagement. Absent keys are simply not recorded. */
  liveMilestones?: readonly LiveMilestoneState[];
  /** Evidence requests for THIS engagement. */
  evidence?: readonly EvidenceRequest[];
  /** Deliverables for THIS engagement. */
  deliverables?: readonly Deliverable[];
  /** The WHOLE desk's live load, including this engagement. */
  deskLoad?: readonly DeliveryLoadInput[];
  asOf?: string;
}

const NOTICE_ORDER: readonly DeliveryNoticeCode[] = [
  'scope_drift',
  'wip_over_ceiling',
  'acceptance_review_outstanding',
  'delivery_blocked',
  'unexplained_block',
  'evidence_overdue',
  'evidence_refused',
  'orphaned_milestone_state',
  'deliverable_outside_plan',
  'wip_at_ceiling',
  'evidence_unmanaged',
  'no_named_partner',
  'coordination_hours_are_placeholders',
];

function deliveryNotices(
  plan: EngagementPlan,
  progress: ProgressView,
  evidence: EvidenceChase,
  acceptance: AcceptanceView,
  wip: WipView,
): DeliveryNotice[] {
  const out: DeliveryNotice[] = [];

  if (plan.drift.failure) {
    out.push({
      code: 'scope_drift',
      severity: 'refusal',
      text: plan.drift.failure.engineMessage,
      mechanism: plan.drift.mechanism,
    });
  }
  if (plan.unknownLiveKeys.length > 0) {
    out.push({
      code: 'orphaned_milestone_state',
      severity: 'warning',
      text:
        `${plan.unknownLiveKeys.length} recorded milestone state(s) belong to no milestone in the current plan ` +
        `(${plan.unknownLiveKeys.join(', ')}). Delivery history, still stored, no longer shown against anything.`,
    });
  }
  if (progress.isBlocked) {
    out.push({ code: 'delivery_blocked', severity: 'refusal', text: progress.headline });
  }
  if (progress.unexplainedBlockers > 0) {
    out.push({
      code: 'unexplained_block',
      severity: 'warning',
      text: `${progress.unexplainedBlockers} milestone(s) are blocked with no reason recorded. An unexplained block is its own reporting defect.`,
    });
  }
  if (evidence.overdue > 0) {
    out.push({
      code: 'evidence_overdue',
      severity: 'warning',
      text: evidence.headline,
      mechanism: 'Overdue is derived from dueBy against this response\'s asOf — isEvidenceOverdue(), delivery.ts:868. It is never a stored status.',
    });
  }
  if (evidence.refused > 0) {
    out.push({
      code: 'evidence_refused',
      severity: 'refusal',
      text: `${evidence.refused} requested input(s) were refused. A refusal does not supply the input — the scope needs re-agreeing.`,
    });
  }
  if (evidence.unmanaged > 0) {
    out.push({
      code: 'evidence_unmanaged',
      severity: 'warning',
      text: `${evidence.unmanaged} outstanding input(s) have no due date, so they can never be flagged as late.`,
    });
  }
  if (acceptance.awaitingReview > 0) {
    out.push({
      code: 'acceptance_review_outstanding',
      severity: 'refusal',
      text: `${acceptance.awaitingReview} deliverable(s) cannot be accepted: a required review is not recorded.`,
      mechanism: acceptance.gateMechanism,
    });
  }
  if (acceptance.outsideThePlan > 0) {
    out.push({
      code: 'deliverable_outside_plan',
      severity: 'warning',
      text: `${acceptance.outsideThePlan} deliverable(s) answer to no milestone — scope delivered that may never have been priced.`,
    });
  }
  if (wip.ceiling.overCeiling) {
    out.push({ code: 'wip_over_ceiling', severity: 'refusal', text: wip.anotherEngagement.because, mechanism: wip.basisNote });
  } else if (wip.ceiling.atCeiling) {
    out.push({ code: 'wip_at_ceiling', severity: 'warning', text: wip.anotherEngagement.because, mechanism: wip.basisNote });
  }
  if (wip.load.unstaffable > 0) {
    out.push({
      code: 'no_named_partner',
      severity: 'warning',
      text: `${wip.load.unstaffable} live engagement(s) have no named partner and cannot honestly be staffed (decision D5 is unanswered).`,
    });
  }
  if (COORDINATION_HOURS_ARE_PLACEHOLDERS) {
    out.push({ code: 'coordination_hours_are_placeholders', severity: 'badge', text: wip.basisNote });
  }

  return out.sort((a, b) => NOTICE_ORDER.indexOf(a.code) - NOTICE_ORDER.indexOf(b.code));
}

/** The whole delivery screen, composed from rows. Pure: it reads nothing and writes nothing. */
export function composeDeliveryResponse(rows: DeliveryResponseInput): DeliveryResponse {
  const asOf = rows.asOf ?? new Date().toISOString();
  const offer = rows.engagement.offer ?? getOffer(rows.engagement.offerKey);

  const plan = composeEngagementPlan(offer, rows.liveMilestones ?? [], asOf);
  const progress = composeProgressView(plan, asOf);
  const evidence = composeEvidenceChase(rows.evidence ?? [], asOf);
  const acceptance = composeAcceptanceView(rows.deliverables ?? [], rows.evidence ?? [], asOf);
  const wip = composeWipView(rows.deskLoad ?? [], asOf);

  return {
    asOf,
    engagement: {
      id: rows.engagement.id,
      clientId: rows.engagement.clientId,
      clientName: rows.engagement.clientName ?? null,
      offerKey: offer.key,
      offerName: offer.name,
      status: rows.engagement.status,
      statusLabel: ENGAGEMENT_STATUS_LABELS[rows.engagement.status],
    },
    plan,
    progress,
    evidence,
    acceptance,
    wip,
    notices: deliveryNotices(plan, progress, evidence, acceptance, wip),
    lockout: {
      noClientDocumentStore: NO_CLIENT_DOCUMENT_STORE_REASON,
      externalReferenceIsInert: EXTERNAL_REFERENCE_IS_INERT,
      enforcedBy: [
        'apps/api/src/gps/__tests__/intakeLockout.test.ts — 20 assertions, mutation-tested against 12 adversarial edits',
        'packages/shared/src/gps/delivery.test.ts — the ratchet for the domain layer',
        '0049_gps_delivery.sql — no column on any gps_ table can hold the material',
      ],
    },
  };
}
