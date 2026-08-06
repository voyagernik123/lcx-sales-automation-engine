/**
 * TWO WITNESSES — cross-examining the numbers a suppression rests on.
 *
 * ══ THE DEFECT THIS ANSWERS ══
 * `apps/api/src/intel/deception.ts` reads TWO COLUMNS of one table
 * (`projects.market_cap_usd`, `projects.volume_24h_usd`), divides one by the other,
 * and writes a grade-F `wash_trading_flag` observation when the quotient clears a
 * hardcoded `TURNOVER_SUSPECT = 2.0` — for the projects it scans at all, which is
 * `WHERE tier = 'tracked'` and nothing else (`deception.ts:35`). That population
 * predicate is part of the verdict: for any other tier there is no verdict to
 * reproduce, and asserting one would be the laundering this module exists to catch.
 * See `DETECTOR_POPULATION_TIER`. Where the flag IS written it is not a margin note:
 *   · `packages/shared/src/alpha.ts:266` multiplies conviction by 0.4;
 *   · `apps/api/src/intel/iw.ts:43` admits an indication only at `conviction >= 40`,
 *     so a 95-conviction project scores 38 and leaves the I&W list altogether;
 *   · `packages/shared/src/gps/targeting.ts:671` halves ability-to-pay and :947
 *     takes 15 confidence points off the target.
 * One unverified number, read from one source, silently removes real opportunities
 * from three surfaces. This module does not change that behaviour. It cross-examines
 * the inputs and says WHEN the disagreement between them is the thing deciding.
 *
 * ══ WHAT THIS MODULE IS NOT ══
 * It is not a retuning of 2.0 and it does not suppress or unsuppress anything. It
 * reports. It also does not claim that two agreeing witnesses are right: two feeds
 * derived from the same order books can be wrong together, so agreement here is
 * CORROBORATION and the type says so by name.
 *
 * PURE. No I/O, no clock, no database — `packages/shared` has none and keeps none.
 * The reading of the witnesses lives in `apps/api/src/intel/crossExamine.ts`.
 */

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE WITNESSES                                                                   */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** What a witness testifies ABOUT. Only witnesses to the same quantity are compared. */
export type Quantity = 'volume_24h_usd' | 'size_usd';

export type WitnessId =
  | 'volume_projects_row'
  | 'volume_venue_sum'
  | 'size_projects_row'
  | 'size_defillama';

/**
 * Declaration order is load-bearing: it fixes the order of `values`, of `between`,
 * and of the disagreement list, so a caller and a test can name a pair without
 * guessing which side is which. Volume before size because the detector's numerator
 * is the number an operator questions first.
 */
export const WITNESS_IDS: readonly WitnessId[] = [
  'volume_projects_row',
  'volume_venue_sum',
  'size_projects_row',
  'size_defillama',
];

export interface WitnessDef {
  readonly id: WitnessId;
  readonly quantity: Quantity;
  /** For a screen. */
  readonly label: string;
  /** Where the number physically comes from, in terms a reader can go and check. */
  readonly derivation: string;
  /**
   * The thing that is NOT true of this witness. Shown next to it, never omitted:
   * every one of these four has a limitation that changes how a gap should be read.
   */
  readonly caveat: string;
}

export const WITNESSES: Record<WitnessId, WitnessDef> = {
  volume_projects_row: {
    id: 'volume_projects_row',
    quantity: 'volume_24h_usd',
    label: 'Aggregate 24h volume (project row)',
    derivation: 'projects.volume_24h_usd — one provider-supplied global aggregate, refreshed by bulk '
      + 'enrichment (apps/api/src/intel/backfill.ts records it as source coingecko).',
    caveat: 'A single provider aggregate. Whatever venues that provider chose to include are '
      + 'included, and it publishes no venue breakdown, so nothing about it can be re-derived.',
  },
  volume_venue_sum: {
    id: 'volume_venue_sum',
    quantity: 'volume_24h_usd',
    label: 'Sum of per-venue 24h volume',
    derivation: 'SUM(exchange_listings.volume_24h_usd) GROUP BY project_id, over a real foreign key '
      + '(0015_exchanges.sql:7 — project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE).',
    caveat: 'A PARTIAL sum, and systematically the smaller number: apps/api/src/enrich/exchanges.ts '
      + 'skips every market the provider marked outlier before summing, and it only covers venues '
      + 'that were fetched inside that run\'s call budget. Rows are also never deleted, so a stale '
      + 'venue can still contribute. B being lower than A is therefore expected and is not by '
      + 'itself evidence of fabrication.',
  },
  size_projects_row: {
    id: 'size_projects_row',
    quantity: 'size_usd',
    label: 'Market cap (project row)',
    derivation: 'projects.market_cap_usd — the denominator the production detector actually divides by.',
    caveat: 'Circulating market cap from one provider. It moves with a supply figure the provider '
      + 'chose, which is the part of the turnover ratio no one on this desk has audited.',
  },
  size_defillama: {
    id: 'size_defillama',
    quantity: 'size_usd',
    label: 'Token size (DefiLlama)',
    derivation: 'observations WHERE predicate = \'fdv_usd\' — written for every symbol-matched token '
      + 'by apps/api/src/connectors/defillama.ts and read by no engine before this one.',
    caveat: 'The predicate is called fdv_usd but the value is DefiLlama\'s `mcap` field, so it is '
      + 'not verified to be fully diluted — treat it as an INDEPENDENT size reading, not as an FDV. '
      + 'The match is by ticker symbol, with a name match only raising reliability from B to A, so '
      + 'it can be a different token with the same symbol.',
  },
};

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE FOUR STATES A WITNESS CAN BE IN                                             */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Why a witness has nothing to say. Distinguished because the remedy differs: a
 * NULL column is an enrichment gap, no rows is a coverage gap, and no observation
 * is a connector that never matched the token.
 */
export type AbsenceCause =
  | 'column_null'
  | 'no_rows'
  | 'no_observation'
  | 'not_collected_for_this_tier';

export interface PresentReading {
  readonly state: 'present';
  /** May legitimately be 0. A zero is a finding; an absence is not a zero. */
  readonly value: number;
  /** ISO instant the SOURCE observed it, where the row records one. */
  readonly observedAt: string | null;
  readonly source: string | null;
  /** Admiralty reliability where the row carries one (observations do; columns do not). */
  readonly reliability: string | null;
  readonly caveats: readonly string[];
}

export type WitnessReading =
  | { readonly state: 'not_loaded' }
  | { readonly state: 'withheld'; readonly compartment: string }
  | { readonly state: 'absent'; readonly because: AbsenceCause; readonly note: string | null }
  | PresentReading;

/** The query for this witness was never run. Not the same as it having no answer. */
export const notLoaded = (): WitnessReading => ({ state: 'not_loaded' });

/**
 * The witness exists and the caller is not cleared to see it. Kept apart from
 * `absent` because collapsing them turns a need-to-know boundary into a data gap,
 * and a data gap invites someone to go and "fix" it.
 */
export const withheld = (compartment: string): WitnessReading => ({ state: 'withheld', compartment });

export const absent = (because: AbsenceCause, note: string | null = null): WitnessReading =>
  ({ state: 'absent', because, note });

export interface ObservedMeta {
  readonly observedAt: string | null;
  readonly source: string | null;
  readonly reliability?: string | null;
  readonly caveats?: readonly string[];
}

/**
 * A witness with something to say. `value` is a FINITE number or this is not a
 * present reading at all.
 *
 * THE GUARD IS HERE, NOT ONLY IN THE READER. `PresentReading.value` promises a number
 * that may legitimately be 0; `NaN` and `±Infinity` are neither 0 nor numbers a
 * surface can print (they render as "$NaN" and "$∞" in the operator sentence, and
 * `relativeGap` over them is `NaN`). This is the exported constructor — the pure API
 * any caller reaches for — so the state machine refuses non-finite input here rather
 * than trusting every caller to have its own `num()`.
 */
export const observed = (value: number, meta: ObservedMeta): WitnessReading => {
  if (!Number.isFinite(value)) {
    return absent('column_null', `the recorded value is not a finite number (${String(value)})`);
  }
  return {
    state: 'present',
    value,
    observedAt: meta.observedAt,
    source: meta.source,
    reliability: meta.reliability ?? null,
    caveats: meta.caveats ?? [],
  };
};

export const isPresent = (r: WitnessReading): r is PresentReading => r.state === 'present';

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE RULES A REFUSAL CITES                                                       */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Declared here rather than imported from `marks/mark.ts`, which declares the same
 * shape for the same reason (`mark.ts:299`). Two small identical declarations beat one
 * cross-compartment import: this module has no other dependency and can stay that way.
 */
export interface WitnessRuleCitation {
  readonly instrument: 'LCX_HOUSE_DOCTRINE';
  readonly provision: string;
  readonly text: string;
}

const RULE_ABSENT_REFUSES: WitnessRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list that '
    + 'reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
};

const RULE_THREE_STATES: WitnessRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'three states are never collapsed',
  text: 'Three states are never collapsed: not-loaded / present-but-withheld / genuinely-empty.',
};

const RULE_NO_LAUNDERING: WitnessRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'an inference is never laundered into a certainty',
  text: 'An inference is never laundered into a certainty. If you cannot know, say you cannot know.',
};

const RULE_ENVIRONMENT_LABEL: WitnessRuleCitation = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'every figure from a database carries an environment label',
  text: 'Every figure carries an ObservationFrame and an environment label where it came from a database.',
};

/**
 * `XWIT_RATIO_DENOMINATOR_UNUSABLE` IS DELIBERATELY NOT `..._ABSENT`, and the rename
 * is the point. The denominator can fail a division from four different states —
 * not-loaded, withheld, absent, or present-but-non-positive — and a code called
 * `_ABSENT` names one of them as a fact about the other three. A code is the part a
 * downstream panel keys off and the part a human greps for, so it must not assert a
 * state; the refusal's `sentence` names which state it actually was, and the witness
 * carries its own `XWIT_WITNESS_{NOT_LOADED,WITHHELD,ABSENT}` refusal alongside.
 * Two refusals about one witness is correct here: one about the witness, one about the
 * ratio that no longer exists because of it.
 */
export type WitnessRefusalCode =
  | 'XWIT_WITNESS_NOT_LOADED'
  | 'XWIT_WITNESS_WITHHELD'
  | 'XWIT_WITNESS_ABSENT'
  | 'XWIT_RATIO_DENOMINATOR_UNUSABLE'
  | 'XWIT_NO_CORROBORATING_WITNESS'
  | 'XWIT_ENVIRONMENT_UNLABELLED'
  | 'XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION'
  | 'XWIT_DETECTOR_POPULATION_UNKNOWN'
  | 'XWIT_NEGATIVE_QUANTITY_REFUSED';

/** For the deliberate-absences register (docs/phases/ABSENCES.md, rule 1 of doctrine-lint). */
export const WITNESS_REFUSAL_CODES: readonly WitnessRefusalCode[] = [
  'XWIT_WITNESS_NOT_LOADED',
  'XWIT_WITNESS_WITHHELD',
  'XWIT_WITNESS_ABSENT',
  'XWIT_RATIO_DENOMINATOR_UNUSABLE',
  'XWIT_NO_CORROBORATING_WITNESS',
  'XWIT_ENVIRONMENT_UNLABELLED',
  'XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION',
  'XWIT_DETECTOR_POPULATION_UNKNOWN',
  'XWIT_NEGATIVE_QUANTITY_REFUSED',
];

export interface WitnessRefusal {
  readonly code: WitnessRefusalCode;
  /** One sentence, to the operator, active voice. Names the witness and the consequence. */
  readonly sentence: string;
  readonly rule: WitnessRuleCitation;
  /** `null` where the refusal is about the examination rather than one witness. */
  readonly witness: WitnessId | null;
  readonly quantity: Quantity | null;
  /** `null` only when the caller could not name the database. That is itself a refusal. */
  readonly environment: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE MIRRORED DETECTOR                                                           */
/* ══════════════════════════════════════════════════════════════════════════════ */

export interface DetectorThresholds {
  readonly turnoverSuspect: number;
  readonly thinCapUsd: number;
  readonly thinCapTurnover: number;
}

export const DETECTOR_MIRROR_SOURCE = 'apps/api/src/intel/deception.ts';

/**
 * A COPY of the three constants in `apps/api/src/intel/deception.ts`
 * (`TURNOVER_SUSPECT`, `THIN_CAP_USD`, and the `>= 1.0` inline on the thin-cap limb).
 *
 * A copy is a second place to forget, so it is not trusted: `crossExamine.test.ts`
 * reads deception.ts off disk and fails if the numbers drift apart. The copy exists
 * because the detector does not export them and this lane does not own that file —
 * the alternative was to guess, which is the failure mode under examination here.
 */
export const DETECTOR_THRESHOLDS_AS_MIRRORED: DetectorThresholds = {
  turnoverSuspect: 2.0,
  thinCapUsd: 5_000_000,
  thinCapTurnover: 1.0,
};

/**
 * WHAT IS NOT KNOWN ABOUT 2.0, in the words a surface should show beside an
 * escalation. The comment above the constant asserts that "legitimate large-caps
 * rarely turn over their whole float in a day"; no measurement, backtest or
 * calibration for the figure exists anywhere in this repository.
 */
export const TURNOVER_SUSPECT_HAS_NO_RECORDED_DERIVATION =
  'The 200%/day threshold that decides this has no recorded derivation — it is a declared prior, '
  + 'not a measured one, and when it fires it costs the project 60% of its conviction wherever '
  + 'conviction is read (alpha.ts:266), which is by itself enough to drop a project under the I&W '
  + 'list\'s conviction >= 40 cut. Read an escalation as "the decision turns on an unaudited '
  + 'number", not as "the project is manipulating its volume".';

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE POPULATION THE DETECTOR ACTUALLY SCANS                                      */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * `deception.ts:35` — `WHERE tier = 'tracked'`. THE HARDEST PRECONDITION OF THE
 * VERDICT, and the easiest one to drop when mirroring arithmetic.
 *
 * A copy of a threshold that drifts gives a wrong answer to the right question. A
 * dropped population predicate is worse: it answers a question production never
 * asked. Reproducing the division for a `catalog`-tier project would report a live
 * suppression, and escalate on it, for a project the detector never looks at — the
 * project is not in its population, so nothing about it is suppressed and nothing
 * can flip. Pinned off disk in `crossExamine.test.ts` beside the three constants.
 */
export const DETECTOR_POPULATION_TIER = 'tracked';

/**
 * Whether the production detector scans this subject at all. `unknown` is its own
 * state and is NOT read as `outside`: an unread tier is a gap in this examination,
 * while a known non-tracked tier is a fact about production. Both refuse a verdict;
 * they refuse it with different codes because the remedies differ.
 */
export type DetectorPopulation = 'in_population' | 'outside_population' | 'unknown';

export const detectorPopulationOfTier = (tier: string | null | undefined): DetectorPopulation => {
  if (tier === null || tier === undefined || tier === '') return 'unknown';
  return tier === DETECTOR_POPULATION_TIER ? 'in_population' : 'outside_population';
};

/** clean < thin_cap_hot < wash_suspected. Both non-clean bands write the same flag. */
export type SuspicionBand = 'clean' | 'thin_cap_hot' | 'wash_suspected';

/**
 * The production detector's ARITHMETIC, reproduced. `null` where it cannot be computed
 * — a ratio against a denominator that is absent or non-positive is not a ratio, and
 * defaulting the missing side to 0 or 1 is precisely how a real target gets suppressed.
 *
 * NOT THE VERDICT ON ITS OWN. The verdict is this arithmetic AND the population
 * predicate (`DETECTOR_POPULATION_TIER`); `crossExamine` applies both, and only
 * `crossExamine`'s `bandAsDetected` may be read as "what production concludes".
 */
export function suspicionBand(
  volumeUsd: number,
  sizeUsd: number,
  th: DetectorThresholds = DETECTOR_THRESHOLDS_AS_MIRRORED,
): SuspicionBand | null {
  if (!Number.isFinite(volumeUsd) || !Number.isFinite(sizeUsd)) return null;
  // deception.ts's own query already excludes market_cap_usd <= 0; mirroring the
  // exclusion rather than dividing keeps the two in step.
  if (sizeUsd <= 0) return null;
  const turnover = volumeUsd / sizeUsd;
  if (turnover >= th.turnoverSuspect) return 'wash_suspected';
  if (sizeUsd < th.thinCapUsd && turnover >= th.thinCapTurnover) return 'thin_cap_hot';
  return 'clean';
}

/**
 * Does this band cost the project its place on the three surfaces?
 *
 * BOTH flagging limbs write the same `wash_trading_flag` observation — they differ
 * only in the `reason` string — so both carry the ×0.4 conviction discount. A move
 * BETWEEN them is therefore not a change of decision, and that distinction is the
 * whole reason the materiality gate is not just "did the band label change".
 */
export const bandSuppresses = (b: SuspicionBand): boolean => b !== 'clean';

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE EXAMINATION                                                                 */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Relative gap between two readings of the same quantity, in [0, 1]. Symmetric, and
 * defined when one side is a genuine zero (which `a/b` is not).
 *
 * DEFINED ONLY FOR FINITE, NON-NEGATIVE READINGS, and it THROWS rather than return a
 * figure it cannot define. Both quantities here — a 24h volume and a market size —
 * are non-negative by nature, but `projects.volume_24h_usd` carries no CHECK
 * constraint (production's own query filters `> 0` precisely because the column can
 * hold junk). On opposite signs the old formula returned 2, which then printed as
 * "a 200% gap" beside "$-100,000,000": a formatted number standing in for a column
 * nobody should be reading. `crossExamine` refuses a negative reading
 * (XWIT_NEGATIVE_QUANTITY_REFUSED) before it ever gets here, so the throw is
 * unreachable through the engine and is a stack trace, not a plausible percentage,
 * for any caller that skips the guard.
 */
export function relativeGap(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
    throw new RangeError(
      `relativeGap is defined for finite, non-negative readings only; got ${String(a)} and ${String(b)}`,
    );
  }
  const scale = Math.max(a, b);
  if (scale === 0) return 0;
  return Math.abs(a - b) / scale;
}

/**
 * The gap above which two witnesses to one quantity are treated as in dispute.
 *
 * A DECLARED PRIOR WITH NO MEASUREMENT BEHIND IT — the same species of number this
 * module exists to distrust. It is survivable because of what it can and cannot do:
 * it decides whether an IMMATERIAL gap is worth writing down. It can never suppress
 * an escalation, because escalation is decided by the band flip and is checked
 * first. Pick it badly and the log gets noisier or quieter; no decision moves.
 */
export const DEFAULT_DISPUTE_TOLERANCE = 0.2;

export interface Corroboration {
  readonly quantity: Quantity;
  readonly witnesses: readonly WitnessId[];
  readonly values: readonly number[];
  readonly relativeGap: number;
  /** The type carries the epistemics so a surface cannot upgrade them by accident. */
  readonly certainty: 'corroborated_not_proved';
  readonly sentence: string;
}

export interface Disagreement {
  readonly quantity: Quantity;
  readonly between: readonly [WitnessId, WitnessId];
  readonly values: readonly [number, number];
  readonly relativeGap: number;
  /** Larger ÷ smaller. `null` when the smaller side is a genuine zero. */
  readonly ratio: number | null;
  /** The band each side would produce, holding the other quantity at the incumbent. */
  readonly bandUnder: readonly [SuspicionBand | null, SuspicionBand | null];
  readonly bandMoved: boolean;
  readonly suppressionUnder: readonly [boolean | null, boolean | null];
  readonly suppressionFlips: boolean;
  /**
   * `outside_detector_population` is not a weaker `immaterial`: an immaterial gap is
   * one production weighed and would decide the same way either side, while this one
   * production never weighed at all.
   */
  readonly materiality: 'material' | 'immaterial' | 'undeterminable' | 'outside_detector_population';
  readonly disposition: 'escalated' | 'recorded';
  readonly sentence: string;
}

export interface WitnessObservationFrame {
  /** `null` refuses (XWIT_ENVIRONMENT_UNLABELLED) rather than reading as production. */
  readonly environment: string | null;
  readonly examinedAt: string;
  readonly window: 'rolling_24h_as_reported_by_each_source';
  readonly witnessesPresent: readonly WitnessId[];
  readonly witnessesAbsent: readonly WitnessId[];
  readonly witnessesWithheld: readonly WitnessId[];
  readonly witnessesNotLoaded: readonly WitnessId[];
  /**
   * About the QUANTITIES, not about the witness count — the two are different and the
   * old `single_witness_uncorroborated` stated the wrong one: it was emitted beside a
   * `witnessesPresent` of length 2 whenever the two present witnesses spoke to
   * different quantities, contradicting its own frame. `no_quantity_corroborated`
   * means no quantity has two present witnesses, whatever the head count is.
   */
  readonly completeness: 'no_witness' | 'no_quantity_corroborated' | 'two_witness_partial';
  /** Whether production's detector scans this subject at all (`deception.ts:35`). */
  readonly detectorPopulation: DetectorPopulation;
  /** The tier as read, or `null` where the caller could not name it. Never defaulted. */
  readonly subjectTier: string | null;
  /** Named absences of the window itself. Shown, not omitted. */
  readonly doesNotCapture: readonly string[];
  readonly knownBiases: readonly string[];
  readonly thresholdCaveat: string;
}

export interface CrossExamineInput {
  readonly subjectId: string;
  /** `null` means the caller could not name the database. It refuses. */
  readonly environment: string | null;
  /** Supplied, not read — this module has no clock. */
  readonly examinedAt: string;
  /**
   * `projects.tier`, because the verdict is not the arithmetic alone: the detector
   * scans `WHERE tier = 'tracked'` and nothing else.
   *
   * REQUIRED, NOT OPTIONAL, AND NEVER DEFAULTED. An optional field with a `?? 'tracked'`
   * behind it would reinstate the exact defect this answers — a caller that forgot the
   * tier would get a confident verdict about a project production never scans. `null`
   * is the honest value for "not read", and it refuses
   * (XWIT_DETECTOR_POPULATION_UNKNOWN) instead of assuming either way.
   */
  readonly subjectTier: string | null;
  readonly readings: Readonly<Record<WitnessId, WitnessReading>>;
  readonly thresholds?: DetectorThresholds;
  readonly disputeTolerance?: number;
}

export interface CrossExamination {
  readonly subjectId: string;
  readonly environment: string | null;
  /** Whether production's detector scans this subject at all. */
  readonly detectorPopulation: DetectorPopulation;
  /**
   * What the production detector concludes about this subject RIGHT NOW, on the two
   * witnesses it actually reads. `null` whenever it concludes nothing: no usable
   * ratio, or the subject is outside its population, or the population is unknown.
   * Never `clean` as a stand-in for any of those.
   */
  readonly bandAsDetected: SuspicionBand | null;
  readonly suppressesAsDetected: boolean | null;
  readonly readings: Readonly<Record<WitnessId, WitnessReading>>;
  readonly corroborations: readonly Corroboration[];
  /** EVERY disagreement, in witness declaration order. Never just the first. */
  readonly disagreements: readonly Disagreement[];
  /** EVERY refusal. Never just the first. */
  readonly refusals: readonly WitnessRefusal[];
  readonly escalate: boolean;
  readonly frame: WitnessObservationFrame;
}

/** The pair of witnesses examined for each quantity, in declaration order. */
const PAIRS: readonly { readonly quantity: Quantity; readonly pair: readonly [WitnessId, WitnessId] }[] = [
  { quantity: 'volume_24h_usd', pair: ['volume_projects_row', 'volume_venue_sum'] },
  { quantity: 'size_usd', pair: ['size_projects_row', 'size_defillama'] },
];

/** The two readings the production detector divides. Everything else is a challenger. */
const INCUMBENT: Readonly<Record<Quantity, WitnessId>> = {
  volume_24h_usd: 'volume_projects_row',
  size_usd: 'size_projects_row',
};

const usd = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;
const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

export function crossExamine(input: CrossExamineInput): CrossExamination {
  const th = input.thresholds ?? DETECTOR_THRESHOLDS_AS_MIRRORED;
  const tolerance = input.disputeTolerance ?? DEFAULT_DISPUTE_TOLERANCE;
  const env = input.environment;
  const readings = input.readings;

  const refuse = (
    code: WitnessRefusalCode,
    sentence: string,
    rule: WitnessRuleCitation,
    witness: WitnessId | null,
    quantity: Quantity | null,
  ): WitnessRefusal => ({ code, sentence, rule, witness, quantity, environment: env });

  const refusals: WitnessRefusal[] = [];

  /*
   * A PRESENT READING THAT NO QUANTITY OF THIS KIND CAN HAVE. Both quantities are
   * non-negative by nature; `projects.volume_24h_usd` has no CHECK constraint to say
   * so, and production's own query filters `> 0` because the column can hold junk.
   * A negative reading is refused, not formatted and not compared — printing
   * "says $-100,000,000 … a 200% gap" would be a laundered figure either way.
   */
  const usable = (r: WitnessReading): r is PresentReading => isPresent(r) && r.value >= 0;

  /* ── One refusal per witness that has nothing to say, with the reason kept apart ── */
  for (const id of WITNESS_IDS) {
    const r = readings[id];
    const def = WITNESSES[id];
    if (isPresent(r) && r.value < 0) {
      refusals.push(refuse(
        'XWIT_NEGATIVE_QUANTITY_REFUSED',
        `${def.label} records ${r.value} for ${def.quantity}, which no quantity of this kind can be. `
        + 'The reading is refused rather than compared or formatted: treat the column as holding junk, '
        + 'not as holding a small number.',
        RULE_NO_LAUNDERING, id, def.quantity,
      ));
    }
    if (r.state === 'not_loaded') {
      refusals.push(refuse(
        'XWIT_WITNESS_NOT_LOADED',
        `${def.label} was not read for this subject, so it has not corroborated or contradicted `
        + 'anything. That is not the same as its having no value.',
        RULE_THREE_STATES, id, def.quantity,
      ));
    } else if (r.state === 'withheld') {
      refusals.push(refuse(
        'XWIT_WITNESS_WITHHELD',
        `${def.label} exists but is withheld from this reader (compartment ${r.compartment}). `
        + 'It is present-but-withheld, not empty, and must not be shown as a gap in the data.',
        RULE_THREE_STATES, id, def.quantity,
      ));
    } else if (r.state === 'absent') {
      refusals.push(refuse(
        'XWIT_WITNESS_ABSENT',
        `${def.label} has no recorded value (${r.because})${r.note ? `: ${r.note}` : ''}. It is not `
        + 'reported as zero and it is not compared against anything.',
        RULE_ABSENT_REFUSES, id, def.quantity,
      ));
    }
  }

  if (env === null) {
    refusals.push(refuse(
      'XWIT_ENVIRONMENT_UNLABELLED',
      'No environment label reached this cross-examination, so no figure below can be attributed to '
      + 'a database. Read them as unattributed until the caller supplies one.',
      RULE_ENVIRONMENT_LABEL, null, null,
    ));
  }

  /* ── The incumbent verdict: what the production detector concludes right now ── */
  const incVolume = readings[INCUMBENT.volume_24h_usd];
  const incSize = readings[INCUMBENT.size_usd];

  /*
   * THE POPULATION PREDICATE, APPLIED BEFORE THE ARITHMETIC. `deception.ts:35` selects
   * `WHERE tier = 'tracked'`. Outside that tier there is no production verdict to
   * reproduce: nothing is suppressed, so nothing can flip, and reporting
   * `wash_suspected` would be an inference about a project the detector never scanned
   * dressed up as its live conclusion. Unknown is refused separately, because "we did
   * not read the tier" and "production does not scan this tier" call for different
   * things from whoever reads it.
   */
  const population = detectorPopulationOfTier(input.subjectTier);
  if (population === 'outside_population') {
    refusals.push(refuse(
      'XWIT_SUBJECT_OUTSIDE_DETECTOR_POPULATION',
      `No production verdict is reported: the wash-trading detector scans only `
      + `tier = '${DETECTOR_POPULATION_TIER}' projects (${DETECTOR_MIRROR_SOURCE}) and this subject's `
      + `tier is '${input.subjectTier}'. The same arithmetic can still be run over its witnesses, but `
      + 'nothing about this project is suppressed today, so no disagreement between them changes a '
      + 'decision.',
      RULE_NO_LAUNDERING, null, null,
    ));
  } else if (population === 'unknown') {
    refusals.push(refuse(
      'XWIT_DETECTOR_POPULATION_UNKNOWN',
      `No production verdict is reported: projects.tier was not read for this subject, and the `
      + `detector scans only tier = '${DETECTOR_POPULATION_TIER}' (${DETECTOR_MIRROR_SOURCE}). Whether `
      + 'it is scanned at all is unknown, and an unknown population is not an empty one.',
      RULE_THREE_STATES, null, null,
    ));
  }

  const bandAsDetected = population === 'in_population' && usable(incVolume) && usable(incSize)
    ? suspicionBand(incVolume.value, incSize.value, th)
    : null;
  const suppressesAsDetected = bandAsDetected === null ? null : bandSuppresses(bandAsDetected);

  /*
   * NO RATIO EXISTS, and the honest consequence is that no band exists either — not
   * `clean`, not 0. FOUR ways to get here and all four are refused, each naming its own
   * state rather than borrowing "absent": the query was never run, the reader is not
   * cleared, nothing was recorded, or something WAS recorded that a division cannot use.
   * The last is easy to miss because the reading IS present, so a caller that only
   * checks presence would divide by zero and get Infinity, which clears every threshold.
   * See `WitnessRefusalCode` for why the code itself does not name a state.
   */
  const sizeUsable = isPresent(incSize) && incSize.value > 0;
  if (!sizeUsable) {
    const why = isPresent(incSize)
      ? `recorded as ${incSize.value}, which is not a positive denominator`
      : incSize.state === 'not_loaded'
        ? 'not loaded — its query was never run for this subject, which is not the same as its '
          + 'having no value'
        : incSize.state === 'withheld'
          ? `present but withheld from this reader (compartment ${incSize.compartment}) — the figure `
            + 'exists and this reader may not see it'
          : `absent (${incSize.because})`;
    refusals.push(refuse(
      'XWIT_RATIO_DENOMINATOR_UNUSABLE',
      `No turnover ratio is computed: the denominator (${WITNESSES.size_projects_row.label}) is `
      + `${why}, and dividing by a denominator this examination does not have is how a real target `
      + 'gets suppressed. No band is reported for this subject.',
      RULE_ABSENT_REFUSES, INCUMBENT.size_usd, 'size_usd',
    ));
  }

  const corroborations: Corroboration[] = [];
  const disagreements: Disagreement[] = [];

  for (const { quantity, pair } of PAIRS) {
    const [idA, idB] = pair;
    const a = readings[idA];
    const b = readings[idB];

    if (!usable(a) || !usable(b)) {
      // Fewer than two USABLE witnesses is not agreement. It is an uncorroborated
      // figure, and the surface must not read it as a checked one. A present-but-
      // negative reading counts as no witness here and carries its own refusal above.
      refusals.push(refuse(
        'XWIT_NO_CORROBORATING_WITNESS',
        `${quantity} rests on ${[a, b].filter(usable).length} witness of a possible 2, so nothing `
        + 'about it has been cross-examined. An uncorroborated figure is not a corroborated one.',
        RULE_NO_LAUNDERING, null, quantity,
      ));
      continue;
    }

    const gap = relativeGap(a.value, b.value);
    const lo = Math.min(a.value, b.value);
    const hi = Math.max(a.value, b.value);
    const ratio = lo === 0 ? null : hi / lo;

    /*
     * THE MATERIALITY GATE. Re-run the production verdict with each side of the
     * dispute substituted in, holding the OTHER quantity at whatever the detector
     * uses today. What matters is not whether the band label moves but whether the
     * SUPPRESSION moves: `thin_cap_hot` and `wash_suspected` write the same flag, so
     * a move between them changes nothing a human acts on.
     */
    const other = quantity === 'volume_24h_usd' ? incSize : incVolume;
    const bandOf = (v: number): SuspicionBand | null => {
      // Outside the detector's population there is no verdict to substitute into, so
      // there is no band under either witness — not `clean`, and not a guess.
      if (population !== 'in_population' || !usable(other)) return null;
      return quantity === 'volume_24h_usd'
        ? suspicionBand(v, other.value, th)
        : suspicionBand(other.value, v, th);
    };
    const bandA = bandOf(a.value);
    const bandB = bandOf(b.value);
    const supA = bandA === null ? null : bandSuppresses(bandA);
    const supB = bandB === null ? null : bandSuppresses(bandB);
    const suppressionFlips = supA !== null && supB !== null && supA !== supB;
    const materiality: Disagreement['materiality'] = population === 'outside_population'
      ? 'outside_detector_population'
      : supA === null || supB === null
        ? 'undeterminable'
        : suppressionFlips ? 'material' : 'immaterial';

    // A flip is a disagreement whatever the tolerance says (see DEFAULT_DISPUTE_TOLERANCE).
    if (!suppressionFlips && gap <= tolerance) {
      corroborations.push({
        quantity,
        witnesses: [idA, idB],
        values: [a.value, b.value],
        relativeGap: gap,
        certainty: 'corroborated_not_proved',
        sentence:
          `${WITNESSES[idA].label} (${usd(a.value)}) and ${WITNESSES[idB].label} (${usd(b.value)}) `
          + `agree on ${quantity} to within ${pct(gap)} over each source's own rolling 24h window. `
          + 'Two differently-derived readings corroborate each other; they do not establish the '
          + 'figure, and both can be wrong together.',
      });
      continue;
    }

    const said =
      `${WITNESSES[idA].label} says ${usd(a.value)} and ${WITNESSES[idB].label} says ${usd(b.value)} `
      + `for ${quantity} — a ${pct(gap)} gap`;

    const sentence = materiality === 'outside_detector_population'
      ? `${said}. It changes no production decision: the wash-trading detector scans only `
        + `tier = '${DETECTOR_POPULATION_TIER}' projects and this subject's tier is `
        + `'${input.subjectTier}', so it carries no flag today whichever witness is believed. The `
        + 'disagreement is worth knowing about the DATA; it is not an escalation.'
      : materiality === 'undeterminable'
        ? `${said}. Whether it changes the wash-trading verdict cannot be determined: the other side `
          + 'of the ratio is missing. Nothing is suppressed in that state either, since the detector\'s '
          + 'own query requires a non-null, positive market cap.'
        : suppressionFlips
          ? `${said}, and the two answers land on opposite sides of the verdict (${bandA} vs ${bandB}). `
            + 'Which witness is believed decides whether this project carries the wash-trading flag at '
            + 'all, and the flag multiplies its conviction by 0.4 wherever conviction is read — Targets, '
            + 'the DailyBrief and the I&W list. What it does NOT decide on its own is whether the '
            + 'project then appears: iw.ts:43 also requires listed_on_lcx = false, a hot or warming '
            + 'timing window and no open deal, none of which this examination reads. '
            + TURNOVER_SUSPECT_HAS_NO_RECORDED_DERIVATION
          : `${said}. Recorded, not escalated: the verdict is `
            + `${bandA === bandB ? `${bandA} either way` : `${bandA} or ${bandB}`}, and both answers `
            + 'suppress or keep the project alike, so no decision turns on it.';

    disagreements.push({
      quantity,
      between: [idA, idB],
      values: [a.value, b.value],
      relativeGap: gap,
      ratio,
      bandUnder: [bandA, bandB],
      bandMoved: bandA !== bandB,
      suppressionUnder: [supA, supB],
      suppressionFlips,
      materiality,
      disposition: suppressionFlips ? 'escalated' : 'recorded',
      sentence,
    });
  }

  const byState = (s: WitnessReading['state']): WitnessId[] =>
    WITNESS_IDS.filter((id) => readings[id].state === s);
  const present = byState('present');

  const frame: WitnessObservationFrame = {
    environment: env,
    examinedAt: input.examinedAt,
    window: 'rolling_24h_as_reported_by_each_source',
    witnessesPresent: present,
    witnessesAbsent: byState('absent'),
    witnessesWithheld: byState('withheld'),
    witnessesNotLoaded: byState('not_loaded'),
    completeness: present.length === 0
      ? 'no_witness'
      : corroborations.length + disagreements.length === 0
        ? 'no_quantity_corroborated'
        : 'two_witness_partial',
    detectorPopulation: population,
    subjectTier: input.subjectTier,
    doesNotCapture: [
      'Any venue the provider did not return, or returned after the run\'s call budget was spent '
      + '(apps/api/src/enrich/exchanges.ts caps a run at 150 CoinPaprika + 40 CoinGecko projects).',
      'Any market the upstream provider marked as an outlier — those are dropped before the '
      + 'per-venue sum is taken, so the sum cannot see the very trades a wash check is about.',
      'Whether a venue in exchange_listings still lists the token: rows are updated, never deleted, '
      + 'so last_seen_at is the only evidence of staleness.',
      'Off-exchange, OTC and unreported flow, in either witness.',
      'Any window other than the 24h each source chose. The two windows are not aligned and cannot '
      + 'be aligned from what is stored.',
    ],
    knownBiases: [
      'The per-venue sum is biased LOW by construction (outlier markets filtered at source, '
      + 'partial venue coverage), so it being the smaller number is expected and is not evidence.',
      'Projects outside tier = tracked are never enriched with per-venue data at all, so their '
      + 'second witness is structurally absent rather than contingently missing.',
      'The DefiLlama size witness is matched by ticker symbol; a name match only raises Admiralty '
      + 'reliability from B to A, and never disqualifies a symbol collision.',
    ],
    thresholdCaveat: TURNOVER_SUSPECT_HAS_NO_RECORDED_DERIVATION,
  };

  return {
    subjectId: input.subjectId,
    environment: env,
    detectorPopulation: population,
    bandAsDetected,
    suppressesAsDetected,
    readings,
    corroborations,
    disagreements,
    refusals,
    escalate: disagreements.some((d) => d.disposition === 'escalated'),
    frame,
  };
}
