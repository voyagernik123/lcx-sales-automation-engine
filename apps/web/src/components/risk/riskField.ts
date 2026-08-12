/**
 * THE FORWARD RISK FIELD — the dataset E7 THE STORM integrates, and the flat calendar tabulates.
 *
 * One object, two drawings. `RiskCalendar` draws it flat and `StormReliefGl` marches it as a volume, and
 * both read THIS structure rather than the caller's rows — which is the only reason the two can be
 * compared at all. It is the same discipline `buildSurfaceMesh` gives E5.
 *
 * ── THE THREE DAY STATES ARE THE WHOLE POINT, AND THEY NEVER COLLAPSE ────────────────
 * A density field is a scalar. Zero means NO RISK. There is no float that means "we did not look", so a
 * day the monitor did not cover cannot be represented in the volume at all — and writing zero there
 * would state, in the most convincing way a renderer has, that an unmeasured day was calm.
 *
 *   observed      the monitor covered the day. Integrable.
 *   not_measured  the feed dropped. NOT zero. A hole in the floor, a gap in the calendar.
 *   withheld      measured, and this reader may not see it. A lid on an intact tile.
 *
 * So this builder REFUSES the two shapes that would conflate them: an observed day carrying a null cell
 * (a measurement claimed and not supplied) and a non-observed day carrying numbers (a measurement
 * supplied for a day nobody measured). Both are `3D_VFX_1000X.md` §6 rule 6, enforced where the data
 * enters rather than where it is drawn.
 *
 * ── THE CUMULATIVE READING IS REFUSED PAST A GAP, NOT CONTINUED ──────────────────────
 * "The total risk between you and that day" requires every day in between. A day beyond an unmeasured
 * one therefore carries no accumulated reading at all, and the two reasons stay apart because an
 * operator does something different about each: an outage is a vendor problem, a compartment is a
 * clearance problem. A ruler that looks the same on both sides of a hole is a ruler claiming the hole is
 * not there.
 *
 * Pure, so it is testable and so it runs in SSR and print with no renderer anywhere.
 */

/** What the monitor did on a given day. Never inferred from the values. */
export type RiskDayState = 'observed' | 'not_measured' | 'withheld';

/**
 * What a cumulative figure means for a day. Never summed across members: three of these five are
 * refusals with different owners.
 */
export type RiskReading =
  | 'integrable'
  | 'day_not_measured'
  | 'day_withheld'
  | 'integral_crosses_unmeasured_day'
  | 'integral_crosses_withheld_day';

export interface RiskFrame {
  /** Where the numbers came from. A field with no stated source is not a measurement. */
  readonly source: string;
  readonly observedAt: string;
  /** True marks the values as a shape rather than a reading. Rendered, in amber, by both views. */
  readonly valuesArePlaceholders?: boolean;
}

export interface RiskDayInput {
  readonly label: string;
  readonly state: RiskDayState;
}

export interface RiskFieldInput {
  /** Channels. Categories, never interpolated across. */
  readonly lanes: readonly string[];
  /** Severity bands, ordered low to high. Within a band there is no gradation. */
  readonly bands: readonly string[];
  readonly days: readonly RiskDayInput[];
  /**
   * `cells[lane][day][band]` in risk units. A non-observed day's cells MUST be `null` and an observed
   * day's MUST be numbers — see the refusal codes.
   */
  readonly cells: readonly (readonly (readonly (number | null)[])[])[];
  readonly frame: RiskFrame;
  /** The stated escalation trigger, in accumulated risk units. Omit for no gate. */
  readonly reviewThreshold?: number;
  /**
   * Already-scheduled items that landed on days the monitor did not cover. Their weight is in no cell
   * and is not zero, so it is carried as a count rather than absorbed into silence.
   */
  readonly itemsLostToUnmeasuredDays?: number;
}

export interface RiskDay {
  readonly index: number;
  readonly label: string;
  readonly state: RiskDayState;
  readonly reading: RiskReading;
  /** Per-band totals across every lane. `null` on a non-observed day — never 0. */
  readonly bandTotals: readonly (number | null)[];
  readonly total: number | null;
  /** Accumulated risk from day 0 to here. `null` wherever `reading !== 'integrable'`. */
  readonly cumulative: number | null;
}

export interface RiskField {
  readonly kind: 'field';
  readonly lanes: readonly string[];
  readonly bands: readonly string[];
  readonly days: readonly RiskDay[];
  /** The largest single cell. The colour ramp and the density normalisation both hang off it. */
  readonly maxCell: number;
  /** First day the accumulation reaches the threshold, or `null`. */
  readonly frontDay: number | null;
  /** Why there is no front, when there is none and a threshold was given. */
  readonly frontRefusal: string | null;
  /** The last day a cumulative figure exists for. `null` when none does. */
  readonly integrableToDay: number | null;
  readonly observedDays: number;
  readonly unmeasuredDays: number;
  readonly withheldDays: number;
  readonly itemsLostToUnmeasuredDays: number;
  readonly frame: RiskFrame;
  /** `null` where the day is not observed. The renderers must branch, not coerce. */
  cell(lane: number, day: number, band: number): number | null;
}

export type RiskFieldRefusalCode =
  | 'NO_LANES'
  | 'NO_BANDS'
  | 'NO_DAYS'
  | 'CELLS_SHAPE_MISMATCH'
  | 'OBSERVED_DAY_MISSING_VALUES'
  | 'NON_OBSERVED_DAY_CARRIES_VALUES'
  | 'NEGATIVE_RISK'
  | 'NO_OBSERVED_DAY'
  | 'NO_RISK_OBSERVED'
  /** No feed reaches this surface at all. Not "no risk ahead" — see `riskFieldUnavailable`. */
  | 'NO_FORWARD_RISK_FEED';

export interface RiskFieldRefusal {
  readonly kind: 'refused';
  readonly code: RiskFieldRefusalCode;
  /** One sentence, in the reader's words. Both views print it rather than blanking.  */
  readonly reason: string;
}

export type RiskFieldOutcome = RiskField | RiskFieldRefusal;

export function isRiskField(o: RiskFieldOutcome | null | undefined): o is RiskField {
  return o != null && o.kind === 'field';
}

const refuse = (code: RiskFieldRefusalCode, reason: string): RiskFieldRefusal => (
  { kind: 'refused', code, reason }
);

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * A surface that has no feed to build a field from, said out loud.
 *
 * The failure to design against is not a blank page — it is a page that renders the absence of a feed as
 * a calm fortnight. This exists so a caller with nothing to plot can hand the figure a NAMED absence and
 * have it printed, which is the same posture `ClaimExpiryLedger` takes with `usable: false` rather than
 * reporting "0 claims past due".
 *
 * `reason` must say what is missing and whose it is to supply. A refusal that does not name its owner is
 * a shrug.
 */
export function riskFieldUnavailable(reason: string): RiskFieldRefusal {
  return { kind: 'refused', code: 'NO_FORWARD_RISK_FEED', reason };
}

/**
 * Build the field, or refuse it. Never returns a field that is partly true.
 */
export function buildRiskField(input: RiskFieldInput): RiskFieldOutcome {
  const lanes = input.lanes;
  const bands = input.bands;
  const days = input.days;

  if (lanes.length === 0) return refuse('NO_LANES', 'no channels were supplied, so there is nothing to lay out.');
  if (bands.length === 0) return refuse('NO_BANDS', 'no severity bands were supplied, so a risk figure has nowhere to sit.');
  if (days.length === 0) return refuse('NO_DAYS', 'no days were supplied, so there is no calendar.');

  if (input.cells.length !== lanes.length) {
    return refuse('CELLS_SHAPE_MISMATCH',
      `${input.cells.length} channel(s) of values were supplied for ${lanes.length} channel(s).`);
  }

  /* THE SHAPE IS CHECKED BEFORE ANYTHING IS SUMMED. A short row read as zero is the defect this whole
     module exists to make impossible, and `undefined` arithmetic yields NaN, which renders as a gap in
     an SVG and as a black hole in a volume — two different silent lies from one missing number. */
  for (let l = 0; l < lanes.length; l++) {
    const lane = input.cells[l]!;
    if (lane.length !== days.length) {
      return refuse('CELLS_SHAPE_MISMATCH',
        `channel "${lanes[l]}" carries ${lane.length} day(s) of values for ${days.length} day(s).`);
    }
    for (let d = 0; d < days.length; d++) {
      const cell = lane[d]!;
      if (cell.length !== bands.length) {
        return refuse('CELLS_SHAPE_MISMATCH',
          `channel "${lanes[l]}" day ${d} carries ${cell.length} band(s) for ${bands.length} band(s).`);
      }
      const observed = days[d]!.state === 'observed';
      for (let b = 0; b < bands.length; b++) {
        const v = cell[b]!;
        if (observed) {
          if (v === null || !Number.isFinite(v)) {
            return refuse('OBSERVED_DAY_MISSING_VALUES',
              `day ${d} ("${days[d]!.label}") is declared observed but "${lanes[l]}" / "${bands[b]}" `
              + 'carries no value. A day is either measured or it is not; a half-measured day would be '
              + 'drawn as a calm one.');
          }
          if (v < 0) {
            return refuse('NEGATIVE_RISK',
              `day ${d} ("${days[d]!.label}") carries ${v} risk units in "${lanes[l]}" / "${bands[b]}". `
              + 'Negative risk has no reading: it would subtract from an accumulation that is supposed to '
              + 'be a total.');
          }
        } else if (v !== null) {
          return refuse('NON_OBSERVED_DAY_CARRIES_VALUES',
            `day ${d} ("${days[d]!.label}") is ${days[d]!.state.replace('_', ' ')} and yet carries a `
            + 'value. A day nobody measured has no number, and supplying one — even zero — states that '
            + 'it was calm.');
        }
      }
    }
  }

  const observedDays = days.filter((d) => d.state === 'observed').length;
  if (observedDays === 0) {
    return refuse('NO_OBSERVED_DAY',
      'not one day in this window was measured, so there is no field to draw and no total to report. '
      + 'This is not a quiet calendar.');
  }

  const firstUnmeasured = days.findIndex((d) => d.state === 'not_measured');
  const firstWithheld = days.findIndex((d) => d.state === 'withheld');

  const readingOf = (d: number): RiskReading => {
    const st = days[d]!.state;
    if (st === 'not_measured') return 'day_not_measured';
    if (st === 'withheld') return 'day_withheld';
    if (firstUnmeasured >= 0 && d > firstUnmeasured) return 'integral_crosses_unmeasured_day';
    if (firstWithheld >= 0 && d > firstWithheld) return 'integral_crosses_withheld_day';
    return 'integrable';
  };

  let maxCell = 0;
  let running = 0;
  let frontDay: number | null = null;
  let frontRefusal: string | null = null;
  const threshold = input.reviewThreshold;

  const built: RiskDay[] = days.map((day, d) => {
    const reading = readingOf(d);
    if (day.state !== 'observed') {
      if (threshold !== undefined && frontDay === null && frontRefusal === null) {
        /* THE GATE REFUSES RATHER THAN STANDING ON THE LAST INTEGRABLE DAY. Putting it there would show
           a crossing that was never observed, at a place the data cannot support. */
        frontRefusal = day.state === 'not_measured'
          ? 'THRESHOLD_NOT_REACHED_BEFORE_UNMEASURED_DAY'
          : 'THRESHOLD_NOT_REACHED_BEFORE_WITHHELD_DAY';
      }
      return {
        index: d, label: day.label, state: day.state, reading,
        bandTotals: bands.map(() => null), total: null, cumulative: null,
      };
    }
    const bandTotals = bands.map((_b, b) => round3(
      lanes.reduce((n, _l, l) => n + (input.cells[l]![d]![b] as number), 0),
    ));
    let total = 0;
    for (let l = 0; l < lanes.length; l++) {
      for (let b = 0; b < bands.length; b++) {
        const v = input.cells[l]![d]![b] as number;
        total += v;
        if (v > maxCell) maxCell = v;
      }
    }
    running += total;
    if (threshold !== undefined && frontDay === null && frontRefusal === null && running >= threshold) {
      frontDay = d;
    }
    return {
      index: d, label: day.label, state: day.state, reading,
      bandTotals,
      total: round3(total),
      cumulative: reading === 'integrable' ? round3(running) : null,
    };
  });

  if (maxCell <= 0) {
    /* EVERY OBSERVED CELL IS ZERO. The volume would be entirely empty and the flat calendar entirely
       one colour, and neither is a reading — so this refuses rather than presenting a blank field as a
       measured all-clear. §6 rule 6's sibling case: nothing to draw is not nothing to say. */
    return refuse('NO_RISK_OBSERVED',
      `all ${observedDays} measured day(s) carry zero risk in every channel and band. There is no field `
      + 'to draw. Either the window is genuinely empty or the feed is reporting zeros, and the two are '
      + 'not distinguishable from here.');
  }

  const integrableDays = built.filter((d) => d.reading === 'integrable').map((d) => d.index);

  return {
    kind: 'field',
    lanes, bands,
    days: built,
    maxCell: round3(maxCell),
    frontDay,
    frontRefusal,
    integrableToDay: integrableDays.length > 0 ? Math.max(...integrableDays) : null,
    observedDays,
    unmeasuredDays: days.filter((d) => d.state === 'not_measured').length,
    withheldDays: days.filter((d) => d.state === 'withheld').length,
    itemsLostToUnmeasuredDays: input.itemsLostToUnmeasuredDays ?? 0,
    frame: input.frame,
    cell(lane, day, band) {
      const v = input.cells[lane]?.[day]?.[band];
      return typeof v === 'number' ? v : null;
    },
  };
}

/** One sentence per reading state, for whichever view is printing it. */
export const RISK_READING_TEXT: Readonly<Record<RiskReading, string>> = {
  integrable: 'Total risk between now and this day.',
  day_not_measured: 'NO INTEGRAL — the monitor did not cover this day. This is not zero risk.',
  day_withheld: 'NO INTEGRAL — this day is measured and withheld from this reader.',
  integral_crosses_unmeasured_day:
    'NO INTEGRAL — an unmeasured day lies between now and this one, so no total can be stated.',
  integral_crosses_withheld_day:
    'NO INTEGRAL — a withheld day lies between now and this one, so no total can be stated.',
};
