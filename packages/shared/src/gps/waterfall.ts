import { OFFER_KEYS, type EngagementStatus, type OfferKey } from './types.js';
import { FACTORY_STAGES, type FactoryStage } from './factory.js';
import { ASSUMED_ANNUAL_ENGAGEMENT_VOLUME } from './calibration.js';

/**
 * G5's CLOSING LEG — what the three-stage waterfall ACTUALLY cost, per offer.
 *
 * `gps_stage_actual` (0081) records hours and cost per stage per engagement. Until
 * this module existed those rows were written and read back by one route and
 * consumed by nothing, so underwriting ran on shipped priors forever and the plan's
 * promise — "the calibration loop finally gets the waterfall's real cost shape, and
 * G0's effort triples stop being estimates" — was undelivered.
 *
 * ══ HOW THE LOOP CLOSES, AND WHY NOT AUTOMATICALLY ══
 * It would be one line to average these rows and overwrite the effort triple. That
 * line is forbidden, and not by taste: `loop.ts` types the review packet's
 * `proposedWeightChanges` as `never[]` precisely so that "the system quietly
 * re-fitted the number your price depends on" is inexpressible. At ~29 engagements
 * a year (`ASSUMED_ANNUAL_ENGAGEMENT_VOLUME`) nothing here is learnable at a
 * confidence that would justify silent adjustment.
 *
 * So the loop closes through the PACKET machinery instead, which is the same shape
 * every other founder input already has (decision 8: the system proposes, the owner
 * approves): this module measures, `observedEffortEvidence` turns the measurement
 * into GRADED EVIDENCE, and the effort-triples packet carries it — so when the owner
 * re-approves that packet, the numbers underwriting prices on are grounded in
 * measurement rather than in assistant knowledge. Measurement → proposal → a named
 * human's approval → new triples → a different price. A closed loop with a person
 * in it, on purpose.
 *
 * ══ WHAT IS REPORTED WHEN, AND WHY THE TWO ARE DIFFERENT ══
 * OBSERVED VALUES ARE ALWAYS REPORTED, at any n, because an order statistic of
 * recorded hours is a FACT — the median of three engagements is a middle value that
 * genuinely happened. THE VERDICT on a stated triple is an INFERENCE and is
 * withheld below `MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT`, because "your likely case is
 * too optimistic" off one engagement is the rate-shaped fabrication `MIN_N_FOR_RATE`
 * exists to suppress, wearing different clothes.
 */

/** One recorded stage row, with the offer and engagement state resolved by the caller's join. */
export interface StageActualInput {
  readonly engagementId: string;
  readonly offerKey: OfferKey;
  readonly stage: FactoryStage;
  readonly hours: number;
  readonly costCents: number;
  /**
   * REQUIRED, and it is a correctness field rather than metadata. An engagement still
   * in delivery has recorded PART of its hours, so including it drags the median DOWN
   * — i.e. toward cheaper quotes. The bias runs in the dangerous direction, so
   * in-flight engagements are excluded from every inferential figure and reported
   * separately instead.
   */
  readonly engagementStatus: EngagementStatus;
  /** When the row was recorded. Used for `lastRecordedAt`, never for arithmetic. */
  readonly recordedAt: string;
}

/**
 * The statuses at which delivery effort is COMPLETE, so its total is a fact.
 * `closed_lost` and `cancelled` are terminal but not delivered — their hours are a
 * partial spend on work that stopped, which is a different measurement and not this one.
 */
export const DELIVERY_FINISHED_STATUSES: readonly EngagementStatus[] = ['delivered', 'invoiced', 'collected'];

export const isDeliveryFinished = (s: EngagementStatus): boolean =>
  (DELIVERY_FINISHED_STATUSES as readonly string[]).includes(s);

/**
 * The minimum engagements before this module will JUDGE a stated triple.
 *
 * Three, and the number is argued rather than picked: at
 * `ASSUMED_ANNUAL_ENGAGEMENT_VOLUME` spread across five offers, a per-offer count
 * reaches three in roughly half a year, so a higher bar would mean the per-offer
 * verdict never speaks and the loop stays open in practice while looking principled.
 * Three is also the smallest n at which a median is an observed middle value rather
 * than the midpoint of two — which is the difference between reporting a sample and
 * inventing one. Below it, the observed numbers still print; only the verdict is
 * withheld, and it says so.
 */
export const MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT = 3;

export const WATERFALL_VOLUME_BASIS =
  `Thresholds are sized for ~${ASSUMED_ANNUAL_ENGAGEMENT_VOLUME} engagements a year across ${OFFER_KEYS.length} offers. Observed values print at any n because a recorded hour is a fact; a verdict on a stated triple needs ${MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT} engagements because it is an inference.`;

/** Per-stage totals across the engagements that recorded this stage at all. */
export interface StageShape {
  readonly stage: FactoryStage;
  /** Engagements with at least one row for this stage. Never inferred from another stage. */
  readonly engagements: number;
  readonly totalHours: number;
  readonly totalCostCents: number;
  /** Mean hours per engagement, 2dp. Null when no engagement recorded this stage. */
  readonly meanHoursPerEngagement: number | null;
}

export type TripleVerdict =
  | 'inside_band'
  | 'above_pessimistic'
  | 'below_optimistic'
  | 'withheld_small_n'
  | 'no_triple_stated'
  /** Hours are recorded but no hours-per-day is stated, so days cannot be derived. */
  | 'no_hours_per_day_stated';

export interface OfferWaterfall {
  readonly offerKey: OfferKey;
  /** Engagements with any recorded stage row. The n every figure below rests on. */
  readonly engagements: number;
  readonly stages: readonly StageShape[];
  readonly totalHours: number;
  readonly totalCostCents: number;
  /**
   * Order statistics over PER-ENGAGEMENT total HOURS. Always present when at least one
   * FINISHED engagement was measured, because an hour is what the register records.
   */
  readonly observedHours: { readonly min: number; readonly median: number; readonly max: number } | null;
  /**
   * The same statistics in DAYS — and null unless an hours-per-day was STATED for this
   * offer. This used to divide by a hardcoded 8, which is exactly the invention
   * `CostModel.hoursPerDay` exists to refuse: underwriting already declines to price an
   * hourly card with no stated hours-per-day, and inventing the divisor here would have
   * smuggled that same fabrication into a comparison against the effort triple — and
   * then into a price.
   */
  readonly observedDays: { readonly min: number; readonly median: number; readonly max: number } | null;
  /** The divisor actually used, echoed so a reader can check the arithmetic. Null when none. */
  readonly hoursPerDayUsed: number | null;
  /** Engagements still in delivery: their hours are partial and excluded from the above. */
  readonly inFlight: { readonly engagements: number; readonly totalHours: number };
  /** Most recent stage row for this offer, so a measured figure can carry a real instant. */
  readonly lastRecordedAt: string | null;
  /** The triple this offer is currently priced on, echoed for the comparison. */
  readonly statedTripleDays: { readonly optimistic: number; readonly likely: number; readonly pessimistic: number } | null;
  readonly verdict: TripleVerdict;
  /** One sentence a human can act on, or the reason there is none. */
  readonly reading: string;
}

export interface WaterfallShape {
  readonly byOffer: readonly OfferWaterfall[];
  /** Offers with no recorded stage rows at all — the blind spots, named. */
  readonly offersWithNoActuals: readonly OfferKey[];
  /** FINISHED engagements only. The n every inferential figure rests on. */
  readonly engagementsMeasured: number;
  /** Recorded, but still in delivery — counted so partial hours are never silently mixed in. */
  readonly engagementsInFlight: number;
  readonly volumeBasis: string;
}

export interface WaterfallOptions {
  /**
   * Hours per day, per offer, taken from the PARTNER'S RATE CARD by the caller. An
   * offer with no entry reports hours and refuses to report days.
   */
  readonly hoursPerDayByOffer?: Readonly<Partial<Record<OfferKey, number>>>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Nearest-rank median: an OBSERVED sample at any n, never the mean of two. */
function medianOf(sorted: readonly number[]): number {
  return sorted[Math.max(0, Math.ceil(sorted.length / 2) - 1)];
}

export interface StatedTriple {
  readonly offerKey: OfferKey;
  readonly optimisticDays: number;
  readonly likelyDays: number;
  readonly pessimisticDays: number;
}

/**
 * Measure the waterfall. Pure, deterministic, and it never mutates a triple —
 * `statedTriples` is read for comparison only.
 */
export function waterfallShape(
  actuals: readonly StageActualInput[],
  statedTriples: readonly StatedTriple[],
  opts: WaterfallOptions = {},
): WaterfallShape {
  const byOffer: OfferWaterfall[] = [];
  const noActuals: OfferKey[] = [];
  const measured = new Set<string>();
  const inFlightAll = new Set<string>();

  for (const offerKey of OFFER_KEYS) {
    const all = actuals.filter((a) => a.offerKey === offerKey);
    if (all.length === 0) {
      noActuals.push(offerKey);
      continue;
    }

    /* THE SPLIT THAT KEEPS THE MEDIAN HONEST. Only finished engagements have a total;
       everything else has a part of one, and a part read as a total biases every figure
       downward — toward quoting cheaper than the work costs. */
    const rows = all.filter((a) => isDeliveryFinished(a.engagementStatus));
    const inFlightRows = all.filter((a) => !isDeliveryFinished(a.engagementStatus));
    const inFlightIds = [...new Set(inFlightRows.map((r) => r.engagementId))];
    for (const id of inFlightIds) inFlightAll.add(id);
    const inFlight = {
      engagements: inFlightIds.length,
      totalHours: round2(inFlightRows.reduce((sum, r) => sum + r.hours, 0)),
    };

    const engagementIds = [...new Set(rows.map((r) => r.engagementId))].sort();
    for (const id of engagementIds) measured.add(id);

    const stages: StageShape[] = FACTORY_STAGES.map((stage) => {
      const forStage = rows.filter((r) => r.stage === stage);
      const stageEngagements = new Set(forStage.map((r) => r.engagementId)).size;
      const totalHours = round2(forStage.reduce((sum, r) => sum + r.hours, 0));
      return {
        stage,
        engagements: stageEngagements,
        totalHours,
        totalCostCents: forStage.reduce((sum, r) => sum + r.costCents, 0),
        meanHoursPerEngagement: stageEngagements === 0 ? null : round2(totalHours / stageEngagements),
      };
    });

    const lastRecordedAt = all
      .map((r) => r.recordedAt)
      .sort()
      .at(-1) ?? null;

    // Per-engagement totals in HOURS — the recorded unit, no divisor involved.
    const perEngagementHours = engagementIds
      .map((id) => round2(rows.filter((r) => r.engagementId === id).reduce((s, r) => s + r.hours, 0)))
      .sort((a, b) => a - b);

    const observedHours = perEngagementHours.length === 0
      ? null
      : { min: perEngagementHours[0], median: medianOf(perEngagementHours), max: perEngagementHours[perEngagementHours.length - 1] };

    const hpd = opts.hoursPerDayByOffer?.[offerKey];
    const hoursPerDayUsed = typeof hpd === 'number' && Number.isFinite(hpd) && hpd > 0 ? hpd : null;
    const observedDays = observedHours === null || hoursPerDayUsed === null
      ? null
      : {
          min: round2(observedHours.min / hoursPerDayUsed),
          median: round2(observedHours.median / hoursPerDayUsed),
          max: round2(observedHours.max / hoursPerDayUsed),
        };

    const stated = statedTriples.find((t) => t.offerKey === offerKey) ?? null;
    const inFlightNote = inFlight.engagements > 0
      ? ` ${inFlight.engagements} engagement(s) still in delivery are excluded: their ${inFlight.totalHours} recorded hour(s) are partial, and counting a part as a total would bias this toward cheaper quotes.`
      : '';

    let verdict: TripleVerdict;
    let reading: string;
    if (observedHours === null) {
      verdict = 'withheld_small_n';
      reading = `No FINISHED engagement has recorded stage hours for this offer yet.${inFlightNote}`;
    } else if (observedDays === null) {
      verdict = 'no_hours_per_day_stated';
      reading = `${engagementIds.length} finished engagement(s) recorded a median of ${observedHours.median} hour(s), and no hours-per-day is stated on the rate card for this offer — so those hours cannot become days without inventing the divisor. Reported in hours; no comparison against the ${stated === null ? 'triple' : `${stated.optimisticDays}–${stated.pessimisticDays} day band`} is made.${inFlightNote}`;
    } else if (stated === null) {
      verdict = 'no_triple_stated';
      reading = `${engagementIds.length} finished engagement(s), median ${observedDays.median} day(s) at ${hoursPerDayUsed}h/day. No effort triple is stated for this offer, so there is nothing to compare against — approving an effort-triples packet gives this a baseline.${inFlightNote}`;
    } else if (engagementIds.length < MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT) {
      verdict = 'withheld_small_n';
      reading = `${engagementIds.length} finished engagement(s) (median ${observedDays.median} day(s)) against a stated likely case of ${stated.likelyDays}. A verdict needs ${MIN_ENGAGEMENTS_FOR_TRIPLE_VERDICT}; the numbers are shown, the judgement is withheld.${inFlightNote}`;
    } else if (observedDays.median > stated.pessimisticDays) {
      verdict = 'above_pessimistic';
      reading = `The median finished engagement took ${observedDays.median} day(s) — ABOVE the stated pessimistic case of ${stated.pessimisticDays}. Every price quoted on this triple has been underwriting a cost that does not happen. Re-approve the effort-triples packet.${inFlightNote}`;
    } else if (observedDays.median < stated.optimisticDays) {
      verdict = 'below_optimistic';
      reading = `The median finished engagement took ${observedDays.median} day(s) — BELOW the stated optimistic case of ${stated.optimisticDays}. The triple is pessimistic, so quotes carry cost nobody spends; margin is real but the price may be losing work.${inFlightNote}`;
    } else {
      verdict = 'inside_band';
      reading = `The median finished engagement took ${observedDays.median} day(s), inside the stated ${stated.optimisticDays}–${stated.pessimisticDays} band (likely ${stated.likelyDays}). The triple is holding.${inFlightNote}`;
    }

    byOffer.push({
      offerKey,
      engagements: engagementIds.length,
      stages,
      totalHours: round2(rows.reduce((s, r) => s + r.hours, 0)),
      totalCostCents: rows.reduce((s, r) => s + r.costCents, 0),
      observedHours,
      observedDays,
      hoursPerDayUsed,
      inFlight,
      lastRecordedAt,
      statedTripleDays: stated === null
        ? null
        : { optimistic: stated.optimisticDays, likely: stated.likelyDays, pessimistic: stated.pessimisticDays },
      verdict,
      reading,
    });
  }

  return {
    byOffer,
    offersWithNoActuals: noActuals,
    engagementsMeasured: measured.size,
    engagementsInFlight: inFlightAll.size,
    volumeBasis: WATERFALL_VOLUME_BASIS,
  };
}

/**
 * The measurement as PACKET EVIDENCE — the line that actually closes the loop.
 *
 * Returns claim/basis pairs for the effort-triples packet. Grade is the caller's to
 * stamp (`packets.ts` owns PROVENANCE_GRADE), but the provenance is the point: an
 * effort triple whose evidence cites recorded engagements is `repo_measurement`,
 * where today's cites assistant knowledge with a verify-caveat. Empty when nothing
 * has been measured — absent evidence is absent, never a reassuring sentence.
 */
export function observedEffortEvidence(
  shape: WaterfallShape,
): ReadonlyArray<{ readonly claim: string; readonly basis: string }> {
  return shape.byOffer
    .filter((o) => o.engagements > 0 && o.observedHours !== null)
    .map((o) => {
      const inDays = o.observedDays !== null
        ? `, i.e. ${o.observedDays.median} day(s) at the card's ${o.hoursPerDayUsed}h/day`
        : ' (no hours-per-day stated on the rate card, so this is NOT expressed in days)';
      return {
        claim: `${o.offerKey}: ${o.engagements} finished engagement(s), median ${o.observedHours!.median} recorded hour(s)${inDays}.`,
        basis: `gps_stage_actual rows across the three-stage waterfall — recorded by named humans per stage, not estimated${o.lastRecordedAt === null ? '' : `, most recently ${o.lastRecordedAt}`}. ${o.reading}`,
      };
    });
}
