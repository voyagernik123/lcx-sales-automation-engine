/**
 * GPS THE LOOP (Phase 12) — wire types and composition over the calibration
 * engine. NO NEW STATISTICS ARE COMPUTED HERE.
 *
 * `calibration.ts` (946 lines, 43 tests) has existed since Phase 5 and has never
 * been surfaced anywhere: a grep for `winLossSummary`, `weightReviewPacket` or
 * `calibrationHealth` across `apps/web/src` and `apps/api/src/routes` returns
 * nothing. This file is the shape a screen and a monitor registration need in
 * order to read it. Every number below is produced by a function in
 * `calibration.ts`, `delivery.ts` or `partners.ts` and copied — never recomputed,
 * never re-thresholded, never re-rounded — because a second implementation of a
 * threshold is how a suppressed rate becomes an expressed one.
 *
 * THE DEFINING CONSTRAINT, PUT IN THE API SURFACE RATHER THAN IN A COMMENT.
 * ~29 engagements a year (`ASSUMED_ANNUAL_ENGAGEMENT_VOLUME`, `calibration.ts:218`)
 * means nothing here is learnable statistically. A comment saying so protects
 * nobody: the next person builds against the response shape, not against the
 * prose. So the constraint is carried by `LoopVolumeStatement` on every response,
 * with LITERAL types — `isTrainableDataset: false`, `learns: false` — so an edit
 * that starts fitting weights cannot keep this shape without a compile error.
 * That is the same device `WeightReviewPacket.autoAdjustmentApplied: false`
 * already uses (`calibration.ts:684`), applied at the response boundary.
 *
 * SUPPRESSION IS PRESERVED, NOT FLATTENED. `MIN_N_FOR_RATE` (`calibration.ts:243`)
 * makes `winRatePct` null below 8 decided engagements. The one way to destroy
 * that protection is a wire type declaring `winRatePct: number` and a `?? 0` at
 * the boundary — "0% win rate" off three deals is worse than the "33%" the
 * threshold was written to prevent. `SuppressibleRate` therefore keeps the null
 * AND carries the counts that replace it, so a renderer has something to print
 * without inventing a number.
 *
 * CONTRACT RULE. These declarations are the single source for both API and web
 * (see the note at the head of `types.ts`). Nothing in `apps/web/src/lib/api/`
 * may re-declare them; a hand-copied web interface that claimed fields the API
 * never returned is the production crash this rule exists to prevent.
 *
 * Pure and total: no I/O, no DB, no clock. `asOf` is always supplied by the
 * caller, because a function that reads the clock cannot be tested for what it
 * says on a Monday in the middle of a quarter.
 */
import type { Driver } from '../alpha.js';
import {
  ENGAGEMENT_STATUS_LABELS,
  marginCents,
  type EngagementStatus,
  type OfferKey,
} from './types.js';
import {
  ASSUMED_ANNUAL_ENGAGEMENT_VOLUME,
  CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL,
  LOSS_REASONS,
  MIN_N_FOR_RATE,
  MIN_N_PER_ARM_FOR_SEPARATION,
  MIN_STANDARDISED_SEPARATION,
  UNATTRIBUTED_PARTNER,
  WIN_REASONS,
  calibrationHealth,
  isReasonValidFor,
  marginRealisation,
  weightReviewPacket,
  winLossSummary,
  type CalibrationHealth,
  type FactorReviewRow,
  type FactorVerdict,
  type OutcomeDisposition,
  type OutcomeReason,
  type OutcomeRecord,
  type PriorWeights,
  type WeightReviewPacket,
  type WinLossAggregate,
} from './calibration.js';
import { COORDINATION_HOURS_ARE_PLACEHOLDERS, type WipLoad } from './delivery.js';

/** Re-exported so a surface can render an inspectable figure without importing alpha. */
export type { Driver };

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE VOLUME STATEMENT — the constraint, in the response                      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Carried on every `LoopResponse`. Literal-typed on purpose.
 *
 * `isTrainableDataset: false` is not a feature flag and not "false for now". At
 * 29 outcomes a year against a six-factor prior (`targeting.ts` WEIGHTS_V1), the
 * dataset large enough to fit those factors arrives after the market it describes
 * has changed — `CalibrationHealth.canTrainAModel` argues this at
 * `calibration.ts:845`. Anything that wants to flip these fields has to change
 * this type, and changing this type is a review, which is the point.
 */
export interface LoopVolumeStatement {
  /** `ASSUMED_ANNUAL_ENGAGEMENT_VOLUME`. Literal 29 — a widened type invites a target. */
  assumedAnnualEngagementVolume: 29;
  /** `MIN_N_FOR_RATE`. Literal 8. */
  minNForRate: 8;
  /** `MIN_N_PER_ARM_FOR_SEPARATION`. Literal 5. */
  minNPerArmForSeparation: 5;
  /** Permanently false. See the doc comment above. */
  isTrainableDataset: false;
  /** Permanently false. This module counts; it does not learn. */
  learns: false;
  /** Permanently false. Weights change when a human edits them, or not at all. */
  adjustsWeights: false;
  /** `CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL`, verbatim and renderable. */
  statement: string;
}

export const LOOP_VOLUME_STATEMENT: LoopVolumeStatement = {
  assumedAnnualEngagementVolume: 29,
  minNForRate: 8,
  minNPerArmForSeparation: 5,
  isTrainableDataset: false,
  learns: false,
  adjustsWeights: false,
  statement: CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL,
};

/**
 * Compile-time proof the literals above still match the engine's constants. If
 * someone raises `MIN_N_FOR_RATE` to 10 and forgets this file, `tsc` fails here
 * instead of the API quietly shipping an 8 that is no longer true.
 */
const _volumeMatchesEngine: [8, 5, 29] = [
  MIN_N_FOR_RATE as 8,
  MIN_N_PER_ARM_FOR_SEPARATION as 5,
  ASSUMED_ANNUAL_ENGAGEMENT_VOLUME as 29,
];
void _volumeMatchesEngine;

/* ══════════════════════════════════════════════════════════════════════════ */
/* SUPPRESSIBLE RATE — the null that must survive the wire                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Wilson interval, same shape `wilson95Pct` returns (`calibration.ts:295`). */
export interface Interval95Pct {
  lowPct: number;
  highPct: number;
}

/**
 * A rate that may not be expressible, plus everything needed to render the
 * refusal instead (D2).
 *
 * `pct: number | null` — NEVER `number`. A caller cannot accidentally print 0:
 * the null branch is unavoidable, and `counts` is always populated so there is
 * something honest to show in it. `interval95Pct` travels WITH the point estimate
 * (D3: uncertainty beside the number, never folded into it) so the width cannot
 * be dropped in the retelling.
 */
export interface SuppressibleRate {
  /** Whole percent, or null when suppressed. Zero means zero, not "unknown". */
  pct: number | null;
  n: number;
  minN: number;
  suppressed: boolean;
  /** Plain language, present exactly when `suppressed`. */
  suppressionReason: string | null;
  interval95Pct: Interval95Pct | null;
  /** What replaces the rate on screen. Present at every n, including 0. */
  counts: { won: number; lost: number };
}

/**
 * Lift a `WinLossAggregate` onto the wire without touching its thresholds.
 *
 * Copies `winRatePct` as-is. There is deliberately no `fallback` parameter and no
 * default: the only way to get a number out of this when the engine withheld one
 * is to edit this function, which a colocated test forbids.
 */
export function suppressibleRate(agg: WinLossAggregate): SuppressibleRate {
  return {
    pct: agg.winRatePct,
    n: agg.sampleSize,
    minN: MIN_N_FOR_RATE,
    suppressed: agg.rateSuppressed,
    suppressionReason: agg.suppressionReason,
    interval95Pct: agg.interval95Pct,
    counts: { won: agg.won, lost: agg.lost },
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.1 · OUTCOME CAPTURE — the record that has to exist at close              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The facts already on file for the engagement being closed.
 *
 * Quoted price and quoted vendor cost are NOT typed by the operator at close —
 * they were fixed at proposal time and re-typing them at close is how the quoted
 * side of every slippage number gets quietly rewritten to match the realised one.
 * They arrive here from `gps_engagement` (`0047_gps.sql:168` stores only the
 * QUOTED `vendor_cost_cents`) and are read-only on this form.
 */
export interface CaptureSubject {
  engagementId: string;
  clientId: string;
  offerKey: OfferKey;
  /** Current lifecycle status. Used to argue back — see `won_before_acceptance`. */
  status: EngagementStatus;
  quotedPriceCents: number;
  quotedVendorCostCents: number;
}

/**
 * What the operator is filling in. Every field nullable, because a half-finished
 * capture is a real and common state and modelling it as "invalid input" pushes
 * people into inventing values to get past the form.
 */
export interface OutcomeCaptureDraft {
  disposition: OutcomeDisposition | null;
  reason: OutcomeReason | null;
  realisedPriceCents: number | null;
  realisedVendorCostCents: number | null;
  cycleTimeDays: number | null;
  acceptanceFirstPass: boolean | null;
  partner: string | null;
  /** ISO-8601. Null until the operator states the decision date. */
  decidedAt: string | null;
  /** Factor scores as snapshotted at quote time. Never re-derived here. */
  factorScoresAtQuote: Readonly<Record<string, number>> | null;
}

export const EMPTY_OUTCOME_CAPTURE_DRAFT: OutcomeCaptureDraft = {
  disposition: null,
  reason: null,
  realisedPriceCents: null,
  realisedVendorCostCents: null,
  cycleTimeDays: null,
  acceptanceFirstPass: null,
  partner: null,
  decidedAt: null,
  factorScoresAtQuote: null,
};

export type CaptureFieldKey = keyof OutcomeCaptureDraft;

/**
 * Per-field state. Five values, and the last two are the ones that stop this
 * being a checklist that lies.
 *
 *  - `not_applicable` — a lost engagement has no realised price. Rendering that
 *    as "missing" trains the reader to ignore missing (`OutcomeRecord`,
 *    `calibration.ts:150`: nulls are meaningful, never zero-filled).
 *  - `awaiting_external_event` — a won engagement with no partner invoice yet is
 *    not an operator failing; it is a fact about the world, and
 *    `marginRealisation` already counts these separately as
 *    `excludedIncompleteRealisation` (`calibration.ts:557`).
 *  - `recorded_not_aggregated` — `cycleTimeDays` and `acceptanceFirstPass` are
 *    stored and nothing summarises them (`calibration.ts:150`). Saying so on the
 *    form is the only way the operator learns the truth before they infer a
 *    dashboard exists.
 */
export type CaptureFieldStatus =
  | 'recorded'
  | 'missing'
  | 'not_applicable'
  | 'awaiting_external_event'
  | 'recorded_not_aggregated';

export interface CaptureFieldState {
  key: CaptureFieldKey;
  label: string;
  status: CaptureFieldStatus;
  /** True only when a complete record is impossible without it. */
  requiredForRecord: boolean;
  /**
   * What is degraded downstream while this stays empty, named with the function
   * that degrades (D8: no claim without a mechanism). Null when nothing is.
   */
  consequenceIfAbsent: string | null;
  /** For enum fields: the legal values, already filtered by disposition (D2). */
  options: readonly string[] | null;
}

/** Why a draft cannot become a record. Reasoned refusals, never a disabled button. */
export type CaptureBlockerCode =
  | 'disposition_missing'
  | 'reason_missing'
  | 'reason_invalid_for_disposition'
  | 'decided_at_missing'
  | 'won_before_acceptance'
  | 'realised_price_on_lost'
  | 'negative_realised_figure';

export interface CaptureBlocker {
  code: CaptureBlockerCode;
  message: string;
  /** The field to focus (D6: keyboard primary — the UI needs a target, not a toast). */
  field: CaptureFieldKey | null;
}

/**
 * How complete this capture is. `ready_awaiting_realisation` is the load-bearing
 * value: it is a SUBMITTABLE state that is nonetheless visibly incomplete, which
 * is the only honest model of "we won it, the partner has not invoiced yet".
 * Collapsing it into `complete` is how `excludedIncompleteRealisation` silently
 * becomes a permanent hole in every margin number.
 */
export type CaptureCompleteness =
  | 'empty'
  | 'blocked'
  | 'ready_awaiting_realisation'
  | 'complete';

export interface OutcomeCaptureForm {
  subject: CaptureSubject;
  draft: OutcomeCaptureDraft;
  /** Every field, always — a field hidden because it is empty cannot be chased. */
  fields: readonly CaptureFieldState[];
  /** Legal reasons for the CURRENT disposition. Null until one is chosen (D2). */
  reasonOptions: readonly OutcomeReason[] | null;
  completeness: CaptureCompleteness;
  blockers: readonly CaptureBlocker[];
  /** Fields whose absence keeps this out of the margin numbers. */
  missingForMarginRealisation: readonly CaptureFieldKey[];
  /**
   * The record, or NULL. This is the whole point of the type: an incomplete
   * capture cannot produce an `OutcomeRecord`, so no caller can persist a
   * half-record and no aggregate can be computed over one. `calibration.ts`
   * functions take `OutcomeRecord[]` and this is the only place one is minted.
   */
  record: OutcomeRecord | null;
  /** Quoted margin, cents, from `marginCents`. Shown so the operator sees what is at stake. */
  quotedMarginCents: number;
  /** Realised margin once both realised figures exist. Null otherwise — never 0. */
  realisedMarginCents: number | null;
  /** Signed. Null until realised margin exists. Negative = margin given away. */
  marginSlippageCents: number | null;
  /** Traceable figures for the D1 inspector. */
  openNumbers: readonly Driver[];
  headline: string;
}

/** Statuses from which a WIN cannot honestly be claimed: nothing was signed. */
const PRE_ACCEPTANCE_STATUSES: readonly EngagementStatus[] = [
  'draft', 'conflict_pending', 'proposed',
] as const;

const FIELD_LABELS: Record<CaptureFieldKey, string> = {
  disposition: 'Won or lost',
  reason: 'Reason (closed vocabulary)',
  realisedPriceCents: 'Realised price (invoiced)',
  realisedVendorCostCents: 'Realised partner cost (invoiced by partner)',
  cycleTimeDays: 'Cycle time, days',
  acceptanceFirstPass: 'Accepted first pass',
  partner: 'Delivering partner',
  decidedAt: 'Decision date',
  factorScoresAtQuote: 'Factor scores at quote time',
};

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Build the capture form for one engagement.
 *
 * D4 — the system argues back. Choosing `won` on a `proposed` engagement raises
 * `won_before_acceptance` rather than accepting it: at $10–25k the difference
 * between a verbal yes and an accepted proposal is the whole basis of the deposit
 * leg, and a "won" with no acceptance is how a pipeline number becomes fiction.
 *
 * WHAT THIS FUNCTION WILL NOT DO. It does not default `realisedPriceCents` to the
 * quoted price for a win. That default is superficially reasonable and it would
 * destroy `priceSlippageMeanCents` (`calibration.ts:526`) by construction: every
 * engagement would show zero discount, and the one number that tells the founder
 * whether he is discounting under pressure would read zero forever.
 */
export function outcomeCaptureForm(
  subject: CaptureSubject,
  draft: OutcomeCaptureDraft = EMPTY_OUTCOME_CAPTURE_DRAFT,
): OutcomeCaptureForm {
  const d = draft.disposition;
  const isWon = d === 'won';
  const isLost = d === 'lost';
  const reasonOptions: readonly OutcomeReason[] | null =
    d == null ? null : isWon ? WIN_REASONS : LOSS_REASONS;

  const blockers: CaptureBlocker[] = [];
  if (d == null) {
    blockers.push({
      code: 'disposition_missing',
      message: 'Won or lost has not been stated. Nothing else on this form can be interpreted without it.',
      field: 'disposition',
    });
  }
  if (draft.reason == null) {
    blockers.push({
      code: 'reason_missing',
      message: 'A reason from the closed vocabulary is required. `unknown` is a legitimate choice and is preferable to a plausible guess (calibration.ts:126).',
      field: 'reason',
    });
  } else if (d != null && !isReasonValidFor(d, draft.reason)) {
    blockers.push({
      code: 'reason_invalid_for_disposition',
      message: `"${draft.reason}" is not a valid reason for ${d}. The two vocabularies are separate because a loss reason on a win is an entry error, not a nuance.`,
      field: 'reason',
    });
  }
  if (draft.decidedAt == null) {
    blockers.push({
      code: 'decided_at_missing',
      message: 'The decision date orders and windows every aggregate. Without it the record cannot be placed in a quarter.',
      field: 'decidedAt',
    });
  }
  if (isWon && PRE_ACCEPTANCE_STATUSES.includes(subject.status)) {
    blockers.push({
      code: 'won_before_acceptance',
      message: `This engagement is "${ENGAGEMENT_STATUS_LABELS[subject.status]}". A win recorded before acceptance counts revenue that nobody has signed for — move the status first, or record the outcome when the proposal is accepted.`,
      field: 'disposition',
    });
  }
  if (isLost && (draft.realisedPriceCents != null || draft.realisedVendorCostCents != null)) {
    blockers.push({
      code: 'realised_price_on_lost',
      message: 'A lost engagement realised nothing. Recording a realised figure here would enter it into margin means that describe delivered work.',
      field: draft.realisedPriceCents != null ? 'realisedPriceCents' : 'realisedVendorCostCents',
    });
  }
  if (
    (isInt(draft.realisedPriceCents) && draft.realisedPriceCents < 0) ||
    (isInt(draft.realisedVendorCostCents) && draft.realisedVendorCostCents < 0)
  ) {
    blockers.push({
      code: 'negative_realised_figure',
      message: 'Realised price and realised partner cost are amounts, not adjustments. A negative here inverts the sign of every slippage number it enters.',
      field: isInt(draft.realisedPriceCents) && draft.realisedPriceCents < 0
        ? 'realisedPriceCents'
        : 'realisedVendorCostCents',
    });
  }

  const realisedComplete = isWon && isInt(draft.realisedPriceCents) && isInt(draft.realisedVendorCostCents);

  const field = (
    key: CaptureFieldKey,
    status: CaptureFieldStatus,
    requiredForRecord: boolean,
    consequenceIfAbsent: string | null,
    options: readonly string[] | null = null,
  ): CaptureFieldState => ({ key, label: FIELD_LABELS[key], status, requiredForRecord, consequenceIfAbsent, options });

  const realisedStatus = (v: number | null): CaptureFieldStatus =>
    isLost ? 'not_applicable' : isInt(v) ? 'recorded' : isWon ? 'awaiting_external_event' : 'missing';

  const fields: CaptureFieldState[] = [
    field('disposition', d != null ? 'recorded' : 'missing', true,
      'Nothing is recorded at all; the engagement stays invisible to every calibration function.',
      ['won', 'lost']),
    field('reason', draft.reason != null ? 'recorded' : 'missing', true,
      'Loss reasons cannot be counted, so `topLossReasons` (calibration.ts:337) stays empty and "why we lose" stays anecdotal.',
      reasonOptions),
    field('decidedAt', draft.decidedAt != null ? 'recorded' : 'missing', true,
      'The record cannot be windowed into a quarter or ordered against others.'),
    field('realisedPriceCents', realisedStatus(draft.realisedPriceCents), false,
      isLost ? null : 'The engagement is counted in `excludedIncompleteRealisation` (calibration.ts:557) and contributes to no margin mean — including the discount side of slippage.'),
    field('realisedVendorCostCents', realisedStatus(draft.realisedVendorCostCents), false,
      isLost ? null : 'Cost overrun cannot be separated from discount, so `costSlippageMeanCents` (calibration.ts:527) has no evidence from this engagement.'),
    field('partner', draft.partner != null ? 'recorded' : isLost ? 'not_applicable' : 'missing', false,
      isLost ? null : `The engagement is grouped under "${UNATTRIBUTED_PARTNER}" in \`byPartner\` (calibration.ts:435) — deliberately still counted, so the totals reconcile, but it tells you nothing about which partner leaks margin.`),
    field('cycleTimeDays', draft.cycleTimeDays != null ? 'recorded_not_aggregated' : 'missing', false,
      'Nothing summarises cycle time today (calibration.ts:150). It is captured because it is unrecoverable later, not because a number is waiting on it.'),
    field('acceptanceFirstPass', draft.acceptanceFirstPass != null ? 'recorded_not_aggregated' : isLost ? 'not_applicable' : 'missing', false,
      isLost ? null : 'Nothing summarises first-pass acceptance today (calibration.ts:150). Null and false are opposite facts — "not delivered" is not "failed".'),
    field('factorScoresAtQuote', draft.factorScoresAtQuote != null ? 'recorded' : 'missing', false,
      'The engagement counts as absent evidence in `weightReviewPacket` — `recordsMissingFactorScores` (calibration.ts:667) — and never as a zero score.'),
  ];

  const completeness: CaptureCompleteness =
    d == null && draft.reason == null && draft.decidedAt == null
      ? 'empty'
      : blockers.length > 0
        ? 'blocked'
        : isLost || realisedComplete
          ? 'complete'
          : 'ready_awaiting_realisation';

  const missingForMarginRealisation: CaptureFieldKey[] = isLost
    ? []
    : ([
      isInt(draft.realisedPriceCents) ? null : 'realisedPriceCents',
      isInt(draft.realisedVendorCostCents) ? null : 'realisedVendorCostCents',
    ].filter((k): k is CaptureFieldKey => k != null));

  const quotedMarginCents = marginCents(subject.quotedPriceCents, subject.quotedVendorCostCents);
  const realisedMarginCents = realisedComplete
    ? marginCents(draft.realisedPriceCents as number, draft.realisedVendorCostCents as number)
    : null;

  // A record is minted ONLY from an unblocked draft. `blocked` and `empty` yield
  // null, which is what makes an incomplete capture unusable rather than merely
  // ugly: no aggregate in calibration.ts can be handed a partial record.
  const record: OutcomeRecord | null =
    blockers.length === 0 && d != null && draft.reason != null && draft.decidedAt != null
      ? {
        engagementId: subject.engagementId,
        clientId: subject.clientId,
        offerKey: subject.offerKey,
        disposition: d,
        reason: draft.reason,
        quotedPriceCents: subject.quotedPriceCents,
        realisedPriceCents: isLost ? null : draft.realisedPriceCents,
        quotedVendorCostCents: subject.quotedVendorCostCents,
        realisedVendorCostCents: isLost ? null : draft.realisedVendorCostCents,
        cycleTimeDays: draft.cycleTimeDays,
        acceptanceFirstPass: isLost ? null : draft.acceptanceFirstPass,
        partner: draft.partner,
        factorScoresAtQuote: draft.factorScoresAtQuote,
        decidedAt: draft.decidedAt,
      }
      : null;

  const openNumbers: Driver[] = [
    { label: 'Quoted price (cents, on file)', points: subject.quotedPriceCents },
    { label: 'Quoted partner cost (cents, on file)', points: subject.quotedVendorCostCents },
    { label: 'Quoted margin (cents) = price − cost', points: quotedMarginCents },
  ];
  if (realisedMarginCents != null) {
    openNumbers.push(
      { label: 'Realised margin (cents)', points: realisedMarginCents },
      { label: 'Slippage (cents) = realised − quoted margin', points: realisedMarginCents - quotedMarginCents },
    );
  }

  const headline =
    completeness === 'empty'
      ? 'Nothing recorded yet. Until this is captured the engagement is invisible to every calibration number.'
      : completeness === 'blocked'
        ? `${blockers.length} thing${blockers.length === 1 ? '' : 's'} to resolve before this can be recorded: ${blockers.map((b) => b.code).join(', ')}.`
        : completeness === 'ready_awaiting_realisation'
          ? `Recordable, and incomplete: ${missingForMarginRealisation.length} realised figure${missingForMarginRealisation.length === 1 ? '' : 's'} still outstanding, so this engagement will be excluded from margin realisation until they arrive.`
          : isLost
            ? 'Complete. A lost engagement realises nothing, which is a fact and not a gap.'
            : 'Complete — quoted and realised on both sides, so this engagement carries a measurable margin slippage.';

  return {
    subject,
    draft,
    fields,
    reasonOptions,
    completeness,
    blockers,
    missingForMarginRealisation,
    record,
    quotedMarginCents,
    realisedMarginCents,
    marginSlippageCents: realisedMarginCents == null ? null : realisedMarginCents - quotedMarginCents,
    openNumbers,
    headline,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.2 · REVIEW PACKET — what discriminated, with the n, and nothing applied   */
/* ══════════════════════════════════════════════════════════════════════════ */

export const FACTOR_VERDICT_LABELS: Record<FactorVerdict, string> = {
  insufficient_evidence: 'Insufficient evidence',
  no_apparent_separation: 'No apparent separation',
  apparent_separation_toward_won: 'Ran higher on wins',
  apparent_separation_toward_lost: 'Ran higher on losses',
};

/**
 * One factor, ready to render as a row of a dense table (D5).
 *
 * `openNumbers` reuses `Driver { label, points }` (`alpha.ts:41`) as the platform's
 * canonical inspectable-figure pair, per doctrine D1. HONEST CAVEAT: `points` here
 * is a labelled magnitude, NOT a signed contribution to a score — nothing on this
 * row contributes to anything, because this packet changes nothing.
 */
export interface ReviewFactorRow {
  /** The engine's row, copied whole. Nothing recomputed. */
  readonly source: FactorReviewRow;
  factor: string;
  label: string;
  verdictLabel: string;
  /**
   * True when the verdict is `insufficient_evidence`. Surfaced as its own flag so
   * a table can render those rows AS ROWS — greying them out or filtering them
   * away turns the most common honest answer into an absence, and an absence reads
   * as "nothing to see" rather than "we cannot tell".
   */
  insufficientEvidence: boolean;
  /** Both arms, always — a separation without its n is not a finding. */
  nWon: number;
  nLost: number;
  /** `MIN_N_PER_ARM_FOR_SEPARATION`, echoed so a printed row carries its threshold. */
  minNPerArm: number;
  openNumbers: readonly Driver[];
  /** How the row's numbers were produced (D1). */
  formula: string;
}

/**
 * The quarterly review packet.
 *
 * AUTO-ADJUSTMENT IS INEXPRESSIBLE IN THIS TYPE, not merely absent from the
 * implementation. Three devices, in increasing order of bluntness:
 *
 *  1. `weightsReviewed` is the only weights field, and it is the input echoed.
 *     There is no `weightsAfter`, so there is nothing for a tuner to write to.
 *  2. `proposedWeightChanges: never[]`. The empty array is the ONLY assignable
 *     value — `[{ factor: 'need', to: 0.3 }]` does not type-check. A future edit
 *     that wants to propose a change has to widen this type in a diff a reviewer
 *     will see, which is exactly the friction wanted.
 *  3. `autoAdjustmentApplied: false` and `humanReviewRequired: true` come through
 *     from `WeightReviewPacket` (`calibration.ts:684`) as literal types.
 *
 * The reason is in the engine's own comment and worth repeating because it is the
 * non-obvious part: fitted weights would be self-fulfilling, since the score
 * decides who gets pursued and therefore generates the data that confirms it.
 */
export interface ReviewPacket {
  /** The engine's packet, verbatim. Literal-typed guarantees ride along. */
  readonly packet: WeightReviewPacket;
  rows: readonly ReviewFactorRow[];
  /** Count per verdict, all four keys present even at zero. */
  verdictCounts: Readonly<Record<FactorVerdict, number>>;
  /** The honest headline number in most quarters. */
  insufficientEvidenceCount: number;
  /**
   * True when EVERY factor came back `insufficient_evidence` — i.e. the packet's
   * finding is "this review cannot be done yet", which is a result and not a
   * failure to produce one.
   */
  noFactorReviewable: boolean;
  /** Literal `false`. */
  weightsMutated: false;
  /** Literal `true`. The prior is stated, not fitted. */
  weightsAreAStatedPrior: true;
  /** Literal `never[]`. See device (2) above. */
  proposedWeightChanges: never[];
  /** The only mechanism by which a weight ever changes. Literal string. */
  weightChangeMechanism: 'a human edits WEIGHTS_V1 in targeting.ts and says why in the commit';
  /** `MIN_STANDARDISED_SEPARATION`, echoed onto the wire. */
  minStandardisedSeparation: number;
  headline: string;
  caveats: readonly string[];
  volume: LoopVolumeStatement;
}

/**
 * Compose the review packet for a screen.
 *
 * DOES NOT MUTATE `currentWeights`. It is not defensively cloned here either, and
 * that is deliberate: `weightReviewPacket` already returns a frozen shallow copy
 * (`calibration.ts:673`), so cloning again would hide a future regression in that
 * guarantee behind this function. A colocated test asserts the caller's object is
 * deep-equal after the call.
 */
export function reviewPacket(
  records: readonly OutcomeRecord[],
  currentWeights: PriorWeights,
): ReviewPacket {
  const packet = weightReviewPacket(records, currentWeights);

  const rows: ReviewFactorRow[] = packet.factors.map((source) => {
    const openNumbers: Driver[] = [
      { label: 'Scored won engagements (n)', points: source.nWon },
      { label: 'Scored lost engagements (n)', points: source.nLost },
    ];
    if (source.meanWhenWon != null) openNumbers.push({ label: 'Mean score when won', points: source.meanWhenWon });
    if (source.meanWhenLost != null) openNumbers.push({ label: 'Mean score when lost', points: source.meanWhenLost });
    if (source.separation != null) openNumbers.push({ label: 'Separation (won − lost)', points: source.separation });
    if (source.standardisedSeparation != null) {
      openNumbers.push({ label: "Standardised separation (Cohen's d)", points: source.standardisedSeparation });
    }
    if (source.currentWeight != null) openNumbers.push({ label: 'Current weight (stated prior)', points: source.currentWeight });

    return {
      source,
      factor: source.factor,
      label: source.weighted ? source.factor : `${source.factor} (observed, unweighted)`,
      verdictLabel: FACTOR_VERDICT_LABELS[source.verdict],
      insufficientEvidence: source.verdict === 'insufficient_evidence',
      nWon: source.nWon,
      nLost: source.nLost,
      minNPerArm: MIN_N_PER_ARM_FOR_SEPARATION,
      openNumbers,
      formula: `mean(score | won) − mean(score | lost), standardised by the pooled sample sd; described as a separation only when both arms reach ${MIN_N_PER_ARM_FOR_SEPARATION} and |d| ≥ ${MIN_STANDARDISED_SEPARATION}. No p-value is computed — at these n it would lend false authority (calibration.ts:264).`,
    };
  });

  const verdictCounts = {
    insufficient_evidence: 0,
    no_apparent_separation: 0,
    apparent_separation_toward_won: 0,
    apparent_separation_toward_lost: 0,
  } as Record<FactorVerdict, number>;
  for (const r of rows) verdictCounts[r.source.verdict] += 1;

  const insufficientEvidenceCount = verdictCounts.insufficient_evidence;
  const noFactorReviewable = rows.length > 0 && insufficientEvidenceCount === rows.length;

  const caveats = [
    ...packet.caveats,
    'Direction is not correctness. A factor that runs higher on losses may be doing exactly what it was designed to do — `deliveryComplexity` is subtracted in the prior (calibration.ts:715). This packet reports; the reviewer interprets.',
    'Nothing in this packet has been applied. No weight changed as a result of viewing it, and no code path exists that would.',
  ];

  return {
    packet,
    rows,
    verdictCounts,
    insufficientEvidenceCount,
    noFactorReviewable,
    weightsMutated: false,
    weightsAreAStatedPrior: true,
    proposedWeightChanges: [],
    weightChangeMechanism: 'a human edits WEIGHTS_V1 in targeting.ts and says why in the commit',
    minStandardisedSeparation: MIN_STANDARDISED_SEPARATION,
    headline: noFactorReviewable
      ? `No factor is reviewable yet: all ${rows.length} came back insufficient evidence on ${packet.recordsWithFactorScores} scored engagement${packet.recordsWithFactorScores === 1 ? '' : 's'}. That is the finding — the prior stands unchanged because there is nothing to weigh it against.`
      : packet.headline,
    caveats,
    volume: LOOP_VOLUME_STATEMENT,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.3 · CALIBRATION HEALTH — what can and cannot be concluded                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The overall evidence verdict.
 *
 * `nothing_can_be_concluded` is a FIRST-CLASS RESULT, not an empty state, and the
 * distinction is the whole reason this type exists. At n=3 a screen showing an
 * empty-state illustration and "no data yet" is a lie by omission: the honest
 * report is that three outcomes exist, that they support no rate, no margin
 * measurement and no factor review, and that the wait is roughly a year. That
 * report has content, so it gets a verdict rather than a blank.
 */
export type EvidenceVerdict =
  | 'no_outcomes_at_all'
  | 'nothing_can_be_concluded'
  | 'counts_only'
  | 'pooled_rate_only'
  | 'per_offer_rates_available';

export const EVIDENCE_VERDICT_LABELS: Record<EvidenceVerdict, string> = {
  no_outcomes_at_all: 'No outcomes recorded',
  nothing_can_be_concluded: 'Nothing can be concluded yet',
  counts_only: 'Counts only — no rate',
  pooled_rate_only: 'Pooled rate only',
  per_offer_rates_available: 'Per-offer rates available',
};

/**
 * One question a reviewer will actually ask, and whether the data answers it.
 *
 * `answer` is NEVER blank and never "—". When `answerable` is false the answer is
 * the reason it is false, because a dash on a slide gets read as an oversight and
 * a sentence gets read as a finding.
 */
export interface Conclusion {
  key:
  | 'overall_win_rate'
  | 'per_offer_win_rate'
  | 'margin_realisation'
  | 'which_partner_leaks_margin'
  | 'factor_separation'
  | 'trainable_model';
  question: string;
  answerable: boolean;
  answer: string;
  /** Observations the answer rests on. Zero is a legitimate, stated value. */
  n: number;
  /** The stated minimum for this question, or null where no threshold applies. */
  threshold: number | null;
  /** D3 — beside the estimate, never inside it. Present only with a point estimate. */
  interval95Pct: Interval95Pct | null;
}

export interface CalibrationHealthView {
  /** The engine's health object, verbatim. */
  readonly health: CalibrationHealth;
  verdict: EvidenceVerdict;
  verdictLabel: string;
  /**
   * True when nothing on the list is answerable. The screen renders the same dense
   * table either way — the rows just all read "cannot be concluded, because …".
   */
  isNothingConcludable: boolean;
  /** Always six entries, at every n including 0. Never an empty array. */
  conclusions: readonly Conclusion[];
  /** Answerable questions, in plain language, ready to paste into a deck. */
  canConclude: readonly string[];
  /** Unanswerable ones, WITH the reason. Ordered as `conclusions`. */
  cannotConclude: readonly string[];
  /** `CalibrationHealth.statements`, safe to render verbatim, most important first. */
  statements: readonly string[];
  /** Converts "not enough data" into "come back in about N years". Null once reached. */
  estimatedYearsToFirstOfferRate: number | null;
  headline: string;
  volume: LoopVolumeStatement;
}

/**
 * Wrap `calibrationHealth` for a screen, adding no arithmetic.
 *
 * The only judgement this function makes is which of five verdicts describes the
 * engine's booleans, and it makes it in one place so two surfaces cannot disagree
 * about whether three outcomes are "some data".
 */
export function calibrationHealthView(records: readonly OutcomeRecord[]): CalibrationHealthView {
  const health = calibrationHealth(records);
  const wl = winLossSummary(records);
  const mr = marginRealisation(records);

  const overall = wl.overall;
  const perOfferReady = health.offersWhereRateCanBeExpressed;

  const conclusions: Conclusion[] = [
    {
      key: 'overall_win_rate',
      question: 'What is our win rate across all offers?',
      answerable: overall.winRatePct != null,
      answer: overall.winRatePct != null
        ? `${overall.winRatePct}% on ${overall.sampleSize} decided engagements — quote the 95% interval (${overall.interval95Pct?.lowPct}–${overall.interval95Pct?.highPct}%), not the point.`
        : overall.sampleSize === 0
          ? `No engagement has been decided, so there is no rate and no counts either. Not "0%".`
          : `Cannot be concluded. ${overall.won} won / ${overall.lost} lost is below the stated minimum of ${MIN_N_FOR_RATE}; the counts are the finding.`,
      n: overall.sampleSize,
      threshold: MIN_N_FOR_RATE,
      interval95Pct: overall.interval95Pct,
    },
    {
      key: 'per_offer_win_rate',
      question: 'Which offer sells best?',
      answerable: perOfferReady.length > 0,
      answer: perOfferReady.length > 0
        ? `Rates are available for ${perOfferReady.length} of ${wl.byOffer.length} offers (${perOfferReady.join(', ')}); the rest are withheld.`
        : `Cannot be concluded. No single offer has reached ${MIN_N_FOR_RATE} decided engagements, so comparing offers now would be comparing noise.`,
      n: Math.max(0, ...wl.byOffer.map((r) => r.sampleSize)),
      threshold: MIN_N_FOR_RATE,
      interval95Pct: null,
    },
    {
      key: 'margin_realisation',
      question: 'Are we holding the margin we quote?',
      answerable: mr.overall != null,
      answer: mr.overall != null
        ? `Measured on ${mr.overall.n} engagement${mr.overall.n === 1 ? '' : 's'}: mean slippage ${mr.overall.slippageMeanCents} cents (${mr.overall.slippageMeanCents < 0 ? 'given away' : 'held or better'}), ${mr.overall.slippageStdDevCents == null ? 'dispersion not computable at n=1' : `sd ${mr.overall.slippageStdDevCents} cents`}.`
        : `Cannot be concluded. Nothing has both a realised price and a realised partner cost${mr.excludedIncompleteRealisation > 0 ? `; ${mr.excludedIncompleteRealisation} won engagement${mr.excludedIncompleteRealisation === 1 ? ' is' : 's are'} waiting on realised figures` : ''}.`,
      n: mr.overall?.n ?? 0,
      threshold: 1,
      interval95Pct: null,
    },
    {
      key: 'which_partner_leaks_margin',
      question: 'Which partner costs us margin?',
      answerable: mr.byPartner.length > 1,
      answer: mr.byPartner.length > 1
        ? `${mr.byPartner.length} partners have complete engagements; worst mean slippage first, "${mr.byPartner[0]?.key}" at ${mr.byPartner[0]?.slippageMeanCents} cents. One engagement each is still an anecdote.`
        : mr.byPartner.length === 1
          ? `Cannot be compared. Only "${mr.byPartner[0]?.key}" has any complete engagement, so there is nothing to rank it against.`
          : 'Cannot be concluded. No partner has a complete quoted-and-realised engagement on record.',
      n: mr.byPartner.length,
      threshold: 2,
      interval95Pct: null,
    },
    {
      key: 'factor_separation',
      question: 'Do the scoring factors actually predict wins?',
      answerable: health.canReviewFactorSeparation,
      answer: health.canReviewFactorSeparation
        ? `A human may look at apparent separation — both arms have reached ${MIN_N_PER_ARM_FOR_SEPARATION} scored engagements. This still supports no statistical claim.`
        : `Cannot be concluded. Below ${MIN_N_PER_ARM_FOR_SEPARATION} scored engagements per arm, so the weight review reports insufficient evidence for every factor.`,
      n: health.recordCount,
      threshold: MIN_N_PER_ARM_FOR_SEPARATION,
      interval95Pct: null,
    },
    {
      key: 'trainable_model',
      question: 'Can we learn the weights from outcomes?',
      // Permanently false. Not a data-volume question — see LoopVolumeStatement.
      answerable: false,
      answer: `No, and not by waiting. ${ASSUMED_ANNUAL_ENGAGEMENT_VOLUME} outcomes a year against a six-factor prior means the weights stay a stated prior reviewed quarterly by a human.`,
      n: health.recordCount,
      threshold: null,
      interval95Pct: null,
    },
  ];

  const answerable = conclusions.filter((c) => c.answerable);
  const isNothingConcludable = answerable.length === 0;

  const verdict: EvidenceVerdict =
    health.recordCount === 0
      ? 'no_outcomes_at_all'
      : isNothingConcludable
        ? 'nothing_can_be_concluded'
        : perOfferReady.length > 0
          ? 'per_offer_rates_available'
          : health.canExpressOverallWinRate
            ? 'pooled_rate_only'
            : 'counts_only';

  return {
    health,
    verdict,
    verdictLabel: EVIDENCE_VERDICT_LABELS[verdict],
    isNothingConcludable,
    conclusions,
    canConclude: answerable.map((c) => `${c.question} ${c.answer}`),
    cannotConclude: conclusions.filter((c) => !c.answerable).map((c) => `${c.question} ${c.answer}`),
    statements: health.statements,
    estimatedYearsToFirstOfferRate: health.estimatedYearsToFirstOfferRate,
    headline:
      verdict === 'no_outcomes_at_all'
        ? 'No outcomes recorded. Nothing can be concluded — including that things are going well.'
        : verdict === 'nothing_can_be_concluded'
          ? `${health.recordCount} outcome${health.recordCount === 1 ? '' : 's'} on record and nothing yet concludable from them. Six questions, six stated reasons; the honest answer today is "nothing", not "no data".`
          : health.headline,
    volume: LOOP_VOLUME_STATEMENT,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.4 · BOOK MONITORS — conditions that PROPOSE, described as data            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The action ids a book monitor may fire.
 *
 * Both are proposals: `notify` raises an in-app notification and `create_task`
 * queues a task (`apps/api/src/actions/registry.ts:83,102`). Neither changes a
 * GPS row. Every other id in `ACTION_REGISTRY` is deliberately excluded from this
 * union — a monitor that could, say, cancel an engagement or move a status would
 * be a machine making a commercial decision on a $10–25k engagement at 3am on the
 * strength of one SQL predicate. The founder coordinates around a full-time job;
 * he needs to be TOLD, in a place he already looks, and to decide.
 */
export type ProposingActionId = 'notify' | 'create_task';

/** Whitelisted operators, mirroring `OP_SQL` (`apps/api/src/intel/monitors.ts:26`). */
export type MonitorOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export type BookMonitorKey =
  | 'deposit_overdue'
  | 'conflict_missing'
  | 'margin_below_floor'
  | 'bench_headroom_zero'
  | 'perimeter_stale';

/**
 * The condition half of a spec.
 *
 * `metric` is a KEY, never an expression, because the evaluator resolves keys
 * through the `METRIC_SQL` whitelist and interpolates nothing
 * (`apps/api/src/intel/monitors.ts:15`). `sqlExpressionNeeded` is the expression a
 * human must ADD to that whitelist — it is documentation for the wiring pass, not
 * something any code here executes or concatenates.
 */
export interface BookMonitorCondition {
  metric: string;
  op: MonitorOp;
  threshold: number;
  /** Human-readable form of the predicate. */
  reads: string;
  /** The expression to register under `metric` in `METRIC_SQL`. Reviewed by a human. */
  sqlExpressionNeeded: string;
}

/** What the monitor asks a human to do. There is no `execute`, by construction. */
export interface BookMonitorProposal {
  actionId: ProposingActionId;
  title: string;
  detail: string;
  /** What the human is being asked to decide. Never phrased as an instruction to a machine. */
  decisionRequested: string;
}

/**
 * A monitor definition, as DATA for the human wiring pass to register through the
 * existing spine (`POST /v1/monitors`, `apps/api/src/routes/monitors.ts:33`).
 *
 * CONDITION → PROPOSE IS ENFORCED BY THE TYPE. `mutatesState: false` and
 * `proposes.actionId: ProposingActionId` mean a spec describing an acting monitor
 * does not compile. There is no `action` field and no `execute` field for one to
 * hide in.
 */
export interface BookMonitorSpec {
  key: BookMonitorKey;
  name: string;
  /** Subject type the evaluator would filter on. None of these exist yet — see `wiringRequired`. */
  subjectType: 'gps_engagement' | 'gps_client' | 'gps_offer';
  condition: BookMonitorCondition;
  proposes: BookMonitorProposal;
  /** Literal `false`. A monitor cannot be described as changing state. */
  mutatesState: false;
  /** Literal `true`. The fire ends at a human. */
  requiresHumanAction: true;
  /** Why this condition is worth interrupting someone for. */
  why: string;
  /** What must exist before this can be registered. Honest, and mostly non-empty. */
  wiringRequired: readonly string[];
  /**
   * True when the condition would fire on PLACEHOLDER inputs. Such a monitor must
   * stay disabled: `PRICE_BANDS_ARE_PLACEHOLDERS` (`catalogue.ts`) and
   * `COORDINATION_HOURS_ARE_PLACEHOLDERS` (`delivery.ts:1173`) mean the threshold
   * would be compared against a number nobody supplied, and an alert nobody
   * believes is worse than no alert — it teaches the reader to dismiss the channel.
   */
  blockedOnPlaceholders: boolean;
  /** Suggested initial `enabled` flag at registration. False whenever blocked. */
  enabledOnRegistration: boolean;
}

/**
 * The five monitors of plan §8 (12.4), as data.
 *
 * NONE OF THESE CAN BE REGISTERED TODAY and the specs say so rather than implying
 * a working watch. `METRIC_SQL` currently whitelists nine metrics, all of them
 * about tracked assets (`conviction`, `market_cap_usd`, …), and the evaluator's
 * query joins the asset tables; there is no GPS subject type and no GPS metric.
 * `wiringRequired` on each spec names precisely what a human must add, which is
 * the deliverable here — a spec that pretended to work would be the exact defect
 * this programme was called in to fix.
 */
export const BOOK_MONITOR_SPECS: readonly BookMonitorSpec[] = [
  {
    key: 'deposit_overdue',
    name: 'GPS · deposit overdue',
    subjectType: 'gps_engagement',
    condition: {
      metric: 'gps_days_since_accepted_without_deposit',
      op: 'gte',
      threshold: 14,
      reads: 'Accepted at least 14 days ago and `deposit_paid_at` is still null.',
      sqlExpressionNeeded:
        "date_part('day', now() - e.accepted_at) filtered to e.status = 'accepted' AND e.deposit_paid_at IS NULL",
    },
    proposes: {
      actionId: 'create_task',
      title: 'Chase deposit',
      detail: 'Accepted with no deposit recorded after 14 days. Acceptance is a signature; a deposit is cash, and only the cash commits a partner (types.ts:208).',
      decisionRequested: 'Chase the client, re-date the engagement, or close it lost with reason `timing_wrong`.',
    },
    mutatesState: false,
    requiresHumanAction: true,
    why: 'The only leg with a real anchor date. An accepted engagement with no deposit is the cheapest thing in the book to lose and the easiest to forget, because it looks closed on every list view.',
    wiringRequired: [
      "Register subject type 'gps_engagement' in the monitor evaluator's subject resolution.",
      'Add the metric to METRIC_SQL (apps/api/src/intel/monitors.ts:15) with the expression above, parameterised threshold only.',
      'Apply migration 0047_gps.sql — accepted_at/deposit_paid_at exist there and it is not applied on prod.',
    ],
    blockedOnPlaceholders: false,
    enabledOnRegistration: true,
  },
  {
    key: 'conflict_missing',
    name: 'GPS · conflict check missing',
    subjectType: 'gps_engagement',
    condition: {
      metric: 'gps_engagement_has_no_conflict_check',
      op: 'eq',
      threshold: 1,
      reads: 'Past draft, and no row in `gps_conflict_check` for the client.',
      sqlExpressionNeeded:
        "CASE WHEN NOT EXISTS (SELECT 1 FROM gps_conflict_check c WHERE c.client_id = e.client_id) AND e.status <> 'draft' THEN 1 ELSE 0 END",
    },
    proposes: {
      actionId: 'notify',
      title: 'Conflict check not recorded',
      detail: 'An engagement has moved past draft with no conflict check on file. The founder is an LCX employee; `conflict_pending` exists as a status so "we forgot" is visible in a list rather than discoverable in an audit (types.ts:204).',
      decisionRequested: 'Record the check — including `cleared_with_disclosure` and its exact disclosure text — or move the engagement back to `conflict_pending`.',
    },
    mutatesState: false,
    requiresHumanAction: true,
    why: 'The one condition here with a career consequence rather than a commercial one. It is also the one where an automatic action would be worst: the monitor must never silently reset a status and make the omission disappear.',
    wiringRequired: [
      "Register subject type 'gps_engagement'.",
      'Add the metric to METRIC_SQL with the NOT EXISTS expression above.',
      'Apply 0047_gps.sql (gps_conflict_check lives there).',
    ],
    blockedOnPlaceholders: false,
    enabledOnRegistration: true,
  },
  {
    key: 'margin_below_floor',
    name: 'GPS · margin below floor',
    subjectType: 'gps_engagement',
    condition: {
      metric: 'gps_quoted_margin_pct',
      op: 'lt',
      threshold: 0,
      reads: 'Quoted margin percent below the floor. Threshold shown as 0 — a LOSS — because no real floor has been supplied.',
      sqlExpressionNeeded:
        'derived, never stored: round(100.0 * (e.price_cents - e.vendor_cost_cents) / nullif(e.price_cents,0)) — matching marginPct (types.ts:272). 0047_gps.sql:168 stores only the quoted cost and notes margin is derived.',
    },
    proposes: {
      actionId: 'notify',
      title: 'Quoted margin below floor',
      detail: 'This quote does not clear the margin floor. At a $10–25k ticket one scope overrun eats the engagement (types.ts:157), and the partner cost here is the QUOTED one — the realised one is usually worse.',
      decisionRequested: 'Re-price, renegotiate the partner cost, or accept the thin margin deliberately and record why.',
    },
    mutatesState: false,
    requiresHumanAction: true,
    why: 'Margin is the number 47 migrations of this platform never tracked. But the threshold is a placeholder: the real floor is a commercial decision nobody has made.',
    wiringRequired: [
      "Register subject type 'gps_engagement'.",
      'Add the derived margin expression to METRIC_SQL.',
      'A HUMAN MUST SUPPLY THE FLOOR. `PRICE_BANDS_ARE_PLACEHOLDERS` (catalogue.ts) and no rate cards have been supplied, so 0 is a stand-in for "at least do not lose money", not a policy.',
    ],
    blockedOnPlaceholders: true,
    enabledOnRegistration: false,
  },
  {
    key: 'bench_headroom_zero',
    name: 'GPS · bench headroom zero',
    subjectType: 'gps_offer',
    condition: {
      metric: 'gps_offer_spare_slots',
      op: 'lte',
      threshold: 0,
      reads: 'An offer has no spare partner slot: the next sale of it cannot be staffed.',
      sqlExpressionNeeded:
        'NOT SQL. `benchHeadroom` (partners.ts:379) is a pure function over the bench and active engagements, and `PARTNER_BENCH` is a code constant with no table behind it. This needs an evaluator that can call a function, or a materialised view fed by one.',
    },
    proposes: {
      actionId: 'notify',
      title: 'No bench headroom for this offer',
      detail: 'Spare slots have reached zero. Note `totalSpareSlots` is NOT the sum of the per-offer figures (partners.ts:384) — a partner capable of three offers contributes their slot to all three.',
      decisionRequested: 'Stop selling this offer, widen the bench, or accept and sell against a known staffing gap.',
    },
    mutatesState: false,
    requiresHumanAction: true,
    why: 'Partners deliver; the founder sells and coordinates around a full-time LCX job. Bench depth per offer IS the concurrency cap on the business, so headroom hitting zero is the moment selling more becomes a liability.',
    wiringRequired: [
      "Register subject type 'gps_offer' — the evaluator is row-oriented and offers are code constants, so this is the spec needing the most new machinery.",
      'Decide where headroom is computed: a scheduled job writing a table, or an evaluator extension that can invoke a shared function.',
      'partnerOwner is null on all five offers today (catalogue.ts), so every offer would read zero — register disabled until the bench is real.',
    ],
    blockedOnPlaceholders: true,
    enabledOnRegistration: false,
  },
  {
    key: 'perimeter_stale',
    name: 'GPS · service perimeter review stale',
    subjectType: 'gps_offer',
    condition: {
      metric: 'gps_days_since_perimeter_review',
      op: 'gte',
      threshold: 365,
      reads: 'The four perimeter exclusions have not been reviewed by counsel within a year.',
      sqlExpressionNeeded:
        'No column exists. The perimeter is four exclusion lines in `catalogue.ts` awaiting counsel review (CATALOGUE_TODOS, catalogue.ts:529); a review DATE would have to be recorded somewhere first.',
    },
    proposes: {
      actionId: 'create_task',
      title: 'Perimeter exclusions due for counsel review',
      detail: 'The perimeter exclusions are appended to every offer (catalogue.ts:419) and are the boundary of the whole business. They have never been reviewed by counsel.',
      decisionRequested: 'Book the counsel review, or record a decision to defer it with a date.',
    },
    mutatesState: false,
    requiresHumanAction: true,
    why: 'Every quote inherits these four lines. A stale perimeter is the one condition here that is wrong on all engagements at once rather than one at a time.',
    wiringRequired: [
      'Somewhere to record a perimeter review date. There is no such column and no such table.',
      'A counsel review to have happened at least once, so the clock has a start.',
      'Until then this is a reminder a human should set, and saying so is more honest than a monitor that can never fire.',
    ],
    blockedOnPlaceholders: true,
    enabledOnRegistration: false,
  },
];

/** Specs that could be registered enabled today. Two of five, and that is the honest count. */
export function registerableBookMonitors(): readonly BookMonitorSpec[] {
  return BOOK_MONITOR_SPECS.filter((s) => !s.blockedOnPlaceholders);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.5 · THE WBR BLOCK — the book's week, printed (D7)                         */
/* ══════════════════════════════════════════════════════════════════════════ */

/** What the caller must supply for the WBR block. No clock is read here. */
export interface WbrGpsInput {
  /** Monday of the review week, YYYY-MM-DD — same convention as `weekStartOf`. */
  weekStart: string;
  /** ISO instant the block was composed. Printed, so a stale page is visible. */
  generatedAt: string;
  /** ALL decided outcomes on file. Pooled aggregates need the whole history. */
  records: readonly OutcomeRecord[];
  /** Outcomes decided during this week only. May be empty; empty is a finding. */
  recordsThisWeek: readonly OutcomeRecord[];
  /** `wipLoad(...)` result (`delivery.ts:1258`). Null when delivery load is unknown. */
  wip: WipLoad | null;
}

/**
 * The GPS section of the weekly review.
 *
 * Shaped to sit alongside `program` and `distribution` on `WbrReport`
 * (`apps/api/src/kpi/wbr.ts:76`), which is the file the wiring pass must add
 * `gps?: WbrGpsBlock` to — this module does not own it.
 *
 * PRINTABLE MEANS `lines` (D7). Every figure that survives the print is in there
 * as a sentence with its n attached, because the failure mode is a rate arriving
 * in a slide with no n beside it (`calibration.ts:872`). The structured fields are
 * for the screen; `lines` is what the page looks like on paper.
 */
export interface WbrGpsBlock {
  weekStart: string;
  generatedAt: string;

  /** This week's decisions. Small numbers, printed as counts. */
  decidedThisWeek: { won: number; lost: number };
  /** Cumulative pooled rate — suppressed until `MIN_N_FOR_RATE`. Never zero-filled. */
  pooledWinRate: SuppressibleRate;
  /** Offers whose per-offer rate is expressible. Usually empty for over a year. */
  offersWithExpressibleRate: readonly OfferKey[];

  /** Mean margin slippage, cents, or null when nothing is measurable. Negative = given away. */
  marginSlippageMeanCents: number | null;
  /** Won engagements still missing a realised figure — the hole in the number above. */
  awaitingRealisedFigures: number;
  /** Engagements delivered at a realised loss. A count, never a rate. */
  negativeRealisedMarginCount: number;

  /** Coordination load. Null when no delivery data was supplied. */
  wip: {
    active: number;
    blocked: number;
    awaitingCollection: number;
    unstaffable: number;
    coordinationHoursPerWeek: number;
    capacityHoursPerWeek: number;
    utilisationPct: number | null;
    overCapacity: boolean;
    /** True while the hours are placeholders — must be printed, not hidden. */
    usesPlaceholderHours: boolean;
  } | null;

  /** The evidence verdict, so the review states what it may not conclude. */
  evidenceVerdict: EvidenceVerdict;
  /** Printable, in order, safe verbatim. */
  lines: readonly string[];
  /** Caveats that must travel into the meeting with the numbers. */
  caveats: readonly string[];
  volume: LoopVolumeStatement;
}

export function wbrGpsBlock(input: WbrGpsInput): WbrGpsBlock {
  const { weekStart, generatedAt, records, recordsThisWeek, wip } = input;
  const week = winLossSummary(recordsThisWeek).overall;
  const all = winLossSummary(records);
  const mr = marginRealisation(records);
  const view = calibrationHealthView(records);

  const pooledWinRate = suppressibleRate(all.overall);
  const offersWithExpressibleRate = view.health.offersWhereRateCanBeExpressed;

  const lines: string[] = [
    `GPS — the book, week of ${weekStart} (composed ${generatedAt}).`,
    week.sampleSize === 0
      ? 'Decided this week: nothing. At ~29 engagements a year most weeks decide nothing, so an empty week is expected rather than alarming.'
      : `Decided this week: ${week.won} won, ${week.lost} lost.`,
    pooledWinRate.pct == null
      ? `Pooled win rate: WITHHELD. ${pooledWinRate.counts.won} won / ${pooledWinRate.counts.lost} lost is below the stated minimum of ${pooledWinRate.minN} (calibration.ts:243). The counts are the finding.`
      : `Pooled win rate: ${pooledWinRate.pct}% on n=${pooledWinRate.n}, 95% interval ${pooledWinRate.interval95Pct?.lowPct}–${pooledWinRate.interval95Pct?.highPct}% — quote the interval.`,
    offersWithExpressibleRate.length === 0
      ? `Per-offer win rates: all withheld — no offer has reached ${MIN_N_FOR_RATE} decided engagements.`
      : `Per-offer win rates available for: ${offersWithExpressibleRate.join(', ')}.`,
    mr.overall == null
      ? `Margin realisation: unmeasured. ${mr.excludedIncompleteRealisation} won engagement${mr.excludedIncompleteRealisation === 1 ? ' is' : 's are'} waiting on realised figures.`
      : `Margin realisation on n=${mr.overall.n}: mean slippage ${mr.overall.slippageMeanCents} cents (price ${mr.overall.priceSlippageMeanCents}, cost ${mr.overall.costSlippageMeanCents}); ${mr.overall.negativeRealisedMarginCount} delivered at a realised loss.`,
  ];
  if (wip) lines.push(`Delivery load: ${wip.headline}`);
  else lines.push('Delivery load: not supplied. No claim is made about coordination capacity this week.');
  lines.push(`Evidence verdict: ${EVIDENCE_VERDICT_LABELS[view.verdict]}.`);

  const caveats = [
    'Only won and lost count as outcomes. Cancelled engagements are excluded, which biases this section toward engagements that reached a decision (calibration.ts:66).',
    CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL,
  ];
  if (wip?.usesPlaceholderHours ?? COORDINATION_HOURS_ARE_PLACEHOLDERS) {
    caveats.push('Coordination hours are placeholders, not measured (delivery.ts:1173). Utilisation is arithmetic on a guess.');
  }
  if (mr.overall == null) {
    caveats.push('Every margin figure in this section is absent rather than zero. No engagement yet has both a realised price and a realised partner cost.');
  }

  return {
    weekStart,
    generatedAt,
    decidedThisWeek: { won: week.won, lost: week.lost },
    pooledWinRate,
    offersWithExpressibleRate,
    marginSlippageMeanCents: mr.overall?.slippageMeanCents ?? null,
    awaitingRealisedFigures: mr.excludedIncompleteRealisation,
    negativeRealisedMarginCount: mr.overall?.negativeRealisedMarginCount ?? 0,
    wip: wip
      ? {
        active: wip.active,
        blocked: wip.blocked,
        awaitingCollection: wip.awaitingCollection,
        unstaffable: wip.unstaffable,
        coordinationHoursPerWeek: wip.coordinationHoursPerWeek,
        capacityHoursPerWeek: wip.capacityHoursPerWeek,
        utilisationPct: wip.utilisationPct,
        overCapacity: wip.overCapacity,
        usesPlaceholderHours: wip.usesPlaceholderHours,
      }
      : null,
    evidenceVerdict: view.verdict,
    lines,
    caveats,
    volume: LOOP_VOLUME_STATEMENT,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.6 · THE WIRE TYPE                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Where each block's numbers came from (D1 — rows, formula, grade, timestamp).
 *
 * `sourceGrade` uses the Admiralty-style vocabulary the platform already uses for
 * provenance. `operator_entered` is the honest grade for every GPS outcome: a
 * human typed it, nothing verified it, and no engagement has been reconciled
 * against an invoice by any code in this repo.
 */
export interface LoopDataSource {
  block: 'capture' | 'review' | 'health' | 'monitors' | 'wbr';
  /** What was read. */
  reads: string;
  /** How many rows the block's numbers rest on. */
  rowCount: number;
  sourceGrade: 'operator_entered' | 'code_constant' | 'derived';
  /** ISO instant the underlying data was read. */
  asOf: string;
  /** Named absences. Populated far more often than not. */
  notPresent: readonly string[];
}

/**
 * `GET /v1/gps/loop` — the whole of Phase 12 in one response.
 *
 * `capture` is null when no engagement was named in the request: the review,
 * health and monitor blocks are the book-wide view and do not depend on one
 * engagement. Every other field is ALWAYS present, including on an empty book,
 * because "nothing can be concluded" is a result this response must be able to
 * carry (see `CalibrationHealthView.verdict`) and an omitted field renders as an
 * empty state, which is the thing being avoided.
 */
export interface LoopResponse {
  /** ISO instant the response was composed. Printed on every surface (D7). */
  asOf: string;
  /** The constraint, in the API surface. Literal-typed. */
  volume: LoopVolumeStatement;
  /** 12.1 — null unless an engagement was named. */
  capture: OutcomeCaptureForm | null;
  /** 12.2 — never auto-adjusts; `proposedWeightChanges` is `never[]`. */
  review: ReviewPacket;
  /** 12.3 — carries "nothing can be concluded" as a first-class verdict. */
  health: CalibrationHealthView;
  /** 12.4 — definitions only. Registering them is a human act. */
  monitors: readonly BookMonitorSpec[];
  /** 12.4 — the two that could be registered enabled today. */
  registerableMonitorKeys: readonly BookMonitorKey[];
  /** 12.5 — printable weekly block. */
  wbr: WbrGpsBlock;
  /** D1 — provenance per block. */
  dataSources: readonly LoopDataSource[];
  /** D2 — refusals and exclusions stated at the top level, never only per-block. */
  notices: readonly string[];
}

/** Everything the loop response is composed from. Supplied; nothing is fetched. */
export interface LoopInput {
  asOf: string;
  records: readonly OutcomeRecord[];
  recordsThisWeek: readonly OutcomeRecord[];
  weekStart: string;
  currentWeights: PriorWeights;
  wip: WipLoad | null;
  /**
   * Present only when a specific engagement is being closed. Optional, because
   * the book-wide blocks do not depend on one engagement and a caller asking for
   * the review should not have to pass `capture: null` to say so.
   */
  capture?: { subject: CaptureSubject; draft?: OutcomeCaptureDraft } | null;
}

export function loopResponse(input: LoopInput): LoopResponse {
  const { asOf, records, recordsThisWeek, weekStart, currentWeights, wip } = input;
  const review = reviewPacket(records, currentWeights);
  const health = calibrationHealthView(records);
  const wbr = wbrGpsBlock({ weekStart, generatedAt: asOf, records, recordsThisWeek, wip });
  const capture = input.capture
    ? outcomeCaptureForm(input.capture.subject, input.capture.draft ?? EMPTY_OUTCOME_CAPTURE_DRAFT)
    : null;

  const scored = records.filter((r) => r.factorScoresAtQuote != null).length;
  const dataSources: LoopDataSource[] = [
    ...(capture
      ? [{
        block: 'capture' as const,
        reads: `One engagement (${capture.subject.engagementId}); quoted price and quoted partner cost read from the engagement, never re-typed at close.`,
        rowCount: 1,
        sourceGrade: 'operator_entered' as const,
        asOf,
        notPresent: capture.missingForMarginRealisation.map((k) => FIELD_LABELS[k]),
      }]
      : []),
    {
      block: 'review',
      reads: `${records.length} decided outcome${records.length === 1 ? '' : 's'}, of which ${scored} carry quote-time factor scores.`,
      rowCount: scored,
      sourceGrade: 'operator_entered',
      asOf,
      notPresent: [
        `${review.packet.recordsMissingFactorScores} outcome(s) predate scoring — absent evidence, never a zero score.`,
        'No fitted weight, no p-value, no proposed change.',
      ],
    },
    {
      block: 'health',
      reads: `${records.length} decided outcome${records.length === 1 ? '' : 's'} pooled and per offer.`,
      rowCount: records.length,
      sourceGrade: 'derived',
      asOf,
      notPresent: health.cannotConclude,
    },
    {
      block: 'monitors',
      reads: 'Five specifications held as code constants. Nothing has been registered and nothing has fired.',
      rowCount: BOOK_MONITOR_SPECS.length,
      sourceGrade: 'code_constant',
      asOf,
      notPresent: [
        'No GPS metric exists in METRIC_SQL and no GPS subject type exists in the evaluator (apps/api/src/intel/monitors.ts).',
        `${BOOK_MONITOR_SPECS.filter((s) => s.blockedOnPlaceholders).length} of ${BOOK_MONITOR_SPECS.length} specs depend on figures nobody has supplied.`,
      ],
    },
    {
      block: 'wbr',
      reads: `Week of ${weekStart}: ${recordsThisWeek.length} decision(s) this week against ${records.length} on file.`,
      rowCount: recordsThisWeek.length,
      sourceGrade: 'derived',
      asOf,
      notPresent: wip ? [] : ['No delivery load supplied, so no coordination-capacity claim is made.'],
    },
  ];

  const notices: string[] = [
    CALIBRATION_IS_A_REVIEW_INSTRUMENT_NOT_A_MODEL,
    'Cancelled engagements are excluded from every number here. That is a survivorship bias, and this line is the disclosure (calibration.ts:66).',
    'Monitor specifications are definitions, not running monitors. Each proposes; none acts.',
  ];
  if (health.isNothingConcludable) {
    notices.push(`Nothing on this page is concludable at n=${records.length}. The rows state what cannot be concluded and why — that is the report, not a loading state.`);
  }
  if (review.noFactorReviewable && review.rows.length > 0) {
    notices.push('Every scoring factor came back insufficient evidence. The prior stands unchanged.');
  }

  return {
    asOf,
    volume: LOOP_VOLUME_STATEMENT,
    capture,
    review,
    health,
    monitors: BOOK_MONITOR_SPECS,
    registerableMonitorKeys: registerableBookMonitors().map((s) => s.key),
    wbr,
    dataSources,
    notices,
  };
}
