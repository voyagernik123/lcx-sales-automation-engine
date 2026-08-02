/**
 * DESK MODE — what the desk may do today, and who decided that.
 *
 * The compartment has three operating postures and one of them is imposed from
 * outside. MiCA Art 94(1) gives every competent authority — home OR host, because
 * Art 7(3) hands assessment of a disseminated marketing communication to the
 * authority of each Member State it reached — two distinct powers over marketing
 * communications, and they are NOT the same power:
 *
 *   Art 94(1)(q)  "to require ... relevant crypto-asset service providers to cease or
 *                 suspend marketing communications for a maximum of 30 consecutive
 *                 working days on any single occasion" — time-boxed, and the box is
 *                 measured in WORKING days.
 *   Art 94(1)(p)  "to suspend or prohibit marketing communications where there are
 *                 reasonable grounds for suspecting that this Regulation has been
 *                 infringed" — no time limit stated at all, and it includes PROHIBIT.
 *
 * That difference is the reason this module exists rather than a `mode` column. A
 * 30-working-day suspension has a computable end date; a (p) prohibition does not,
 * and an instrument that renders a resume date for one is lying about the other.
 *
 * `DeskMode.suspended_by_authority.expiresAt` USED TO BE NON-NULL, which made an
 * indefinite prohibition inexpressible and forced this module to hold the desk closed
 * through `resumesAt: null` while `expiresAt` echoed a past date. The integration pass
 * made the field nullable and added `suspensionPower`, so the state is now stated
 * directly: `expiresAt: null` means unbounded by statute, and the ceiling is only checked
 * on the (q) limb. What has NOT changed is the direction of failure — an order whose end
 * date this module cannot read still produces no mode at all, and the desk stays closed
 * on the anomaly rather than on a guess. A defect in this file must not read as
 * permission to speak.
 *
 * THE ARITHMETIC IS THE FEATURE. "30 consecutive working days" is not "30 days".
 * Adding 30 to a date overstates the desk's freedom by roughly two weeks, and
 * `ART_94_MAX_SUSPENSION_WORKING_DAYS` exists in `types.ts` precisely so nobody adds
 * 30 to an ISO string. Working days need a holiday calendar, holiday calendars are
 * jurisdictional, and this compartment does not hold one — so the calendar is an
 * INPUT, and a range that falls outside the supplied calendar's coverage produces a
 * refusal rather than an assumption that there were no holidays (doctrine rule 3:
 * absent data is never a zero, and "no holidays declared" is absence, not evidence).
 *
 * WHAT A SUSPENDED DESK MAY STILL DO, and this is deliberate: draft, assess, triage,
 * clear, log and export for the record. The supervisor who suspended the desk will
 * ask what the desk was doing during the suspension, and the answer must be a record,
 * not a dark screen. What stops is every publish-adjacent affordance — handoff,
 * copy-out, export-for-posting — with the reason on screen next to the disabled
 * control rather than hidden behind it (§5, §6).
 *
 * Pure and total. No I/O, no clock, no randomness: `asOf` and the calendar are always
 * supplied by the caller. A liveness function that reads the clock cannot be tested
 * for what it says on the last working day of a suspension, which is the entire
 * behaviour under test.
 */
import {
  ART_94_MAX_SUSPENSION_WORKING_DAYS,
  INSTRUMENTS,
  type ActorId,
  type ApprovalRegime,
  type ClearanceRole,
  type DeskMode,
  type Instant,
  type Refusal,
  type RuleCitation,
  type SurfaceClass,
} from './types.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 CITATIONS AND THE RULESET STAMP                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Stamped onto every refusal this module emits, so a refusal in an audit row can be
 * read against the rules that were in force when it fired rather than today's.
 */
export const DESK_MODE_RULESET_VERSION = 1;

/** Art 94(1)(q), verbatim from CELEX:32023R1114. The 30-working-day ceiling. */
export const ART_94_1_Q: RuleCitation = {
  instrument: INSTRUMENTS.mica.key,
  provision: 'Art 94(1)(q)',
  text: 'to require offerors, persons seeking admission to trading of crypto-assets, issuers of asset-referenced tokens or e-money tokens or relevant crypto-asset service providers to cease or suspend marketing communications for a maximum of 30 consecutive working days on any single occasion where there are reasonable grounds for suspecting that this Regulation has been infringed',
};

/**
 * Art 94(1)(p), verbatim. Note what it does NOT contain: any time limit, and any
 * distinction between suspending and prohibiting. Read next to (q) it is the reason
 * this module has an indefinite branch.
 */
export const ART_94_1_P: RuleCitation = {
  instrument: INSTRUMENTS.mica.key,
  provision: 'Art 94(1)(p)',
  text: 'to suspend or prohibit marketing communications where there are reasonable grounds for suspecting that this Regulation has been infringed',
};

/** Art 7(3): every Member State the communication reached may assess it. */
export const ART_7_3: RuleCitation = {
  instrument: INSTRUMENTS.mica.key,
  provision: 'Art 7(3)',
  text: 'The competent authority of the Member State where the marketing communications are disseminated shall have the power to assess the compliance of such marketing communications with paragraph 1.',
};

/**
 * Art 7(4): a host authority using its Art 94 powers notifies the home authority.
 * Which is why `AuthorityOrder.authority` is a free string: LCX may hear from BaFin
 * or CONSOB before it hears from the FMA, and an enum of one would have made the
 * first real order unrecordable.
 */
export const ART_7_4: RuleCitation = {
  instrument: INSTRUMENTS.mica.key,
  provision: 'Art 7(4)',
  text: 'The use of any of the supervisory and investigatory powers set out in Article 94 in relation to the enforcement of this Article by the competent authority of a host Member State shall be notified without undue delay to the competent authority of the home Member State of the offeror, the person seeking admission to trading or the operator of the trading platform for the crypto-assets.',
};

/**
 * FINRA 2210(c)(1)(B) is the external precedent for `heightened`: a regulator may
 * impose pre-use filing on a firm that has departed from the standards. Cited as a
 * MODEL — it does not bind LCX — because MiCA has no analogue and the design idea
 * (a firm-level pre-approval regime with a start date and an end date, not a
 * per-item checkbox) transfers exactly.
 */
export const FINRA_2210_C_1_B: RuleCitation = {
  instrument: INSTRUMENTS.finra_2210.key,
  provision: '2210(c)(1)(B)',
  text: 'FINRA may require a member to file all communications with the Department at least 10 business days prior to first use, where the Department determines that the member has departed from the standards of Rule 2210. (Model only: not binding on LCX.)',
};

/** The desk's own policy, cited when a refusal here is ours rather than the law's. */
const DESK_POLICY = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

function refusal(
  code: Refusal['code'],
  sentence: string,
  rule: RuleCitation,
  recovery: Refusal['recovery'],
  matched: string | null = null,
): Refusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: DESK_MODE_RULESET_VERSION };
}

/**
 * Renderable next to any suspension. The asymmetry between (p) and (q) is not a
 * subtlety a surface may keep to itself: a desk that thinks every suspension ends in
 * 30 working days will plan a campaign for the wrong week.
 */
export const ART_94_POWERS_DIFFER_DISCLOSURE =
  'Art 94(1)(q) caps a suspension of marketing communications at 30 consecutive working days per occasion. Art 94(1)(p) states no time limit and also allows outright prohibition. A resume date can only be computed for a (q) order, and only against a holiday calendar for the relevant jurisdiction.';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 WORKING-DAY ARITHMETIC — WITH A CALENDAR, OR NOT AT ALL                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/** A calendar date in UTC, `YYYY-MM-DD`. Not an instant: a working day has no time. */
export type CalendarDate = string;

/**
 * The holiday calendar, supplied by the caller because the compartment does not hold
 * one and must not pretend to.
 *
 * `coversFrom`/`coversTo` are the honesty mechanism. A calendar with an empty
 * `holidays` array is indistinguishable from a calendar nobody filled in, so the
 * arithmetic never trusts silence: a date outside the covered range produces a
 * refusal naming the missing range and who can supply it. `source` is required for
 * the same reason a quantitative claim needs a source reference — a holiday list with
 * no provenance is an opinion about dates.
 *
 * `weekend` is UTC day numbers (0 = Sunday) rather than a hardcoded Sat/Sun, because
 * the authority that issues the order decides whose week it is, and hardcoding the
 * Western week into an enforcement deadline is exactly the kind of assumption this
 * compartment is supposed to surface.
 */
export interface WorkingDayCalendar {
  /** The jurisdiction whose working week this is, e.g. `'li'`, `'de'`, `'it'`. */
  readonly jurisdiction: string;
  readonly weekend: readonly number[];
  readonly holidays: readonly CalendarDate[];
  readonly coversFrom: CalendarDate;
  readonly coversTo: CalendarDate;
  /** Where the holiday list came from. A list with no provenance is not a calendar. */
  readonly source: string;
}

/** What a single date is, on a given calendar. `not_covered` is not `working`. */
export type DayClass = 'working' | 'weekend' | 'holiday' | 'not_covered' | 'malformed';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * Strict `YYYY-MM-DD` → UTC millis, or `null`. Strict on purpose: `new Date('2026-13-40')`
 * and `new Date('next tuesday')` both produce something, and one of them is a
 * suspension deadline.
 */
function dateToMillis(date: CalendarDate): number | null {
  const m = DATE_RE.exec(date);
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

function millisToDate(ms: number): CalendarDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The UTC calendar date an instant falls on.
 *
 * STATED LIMITATION, because it is real: working days are counted in the authority's
 * own timezone, and an order effective at `2026-08-03T22:30:00Z` is already 4 August
 * in Vaduz. Where a boundary sits within a few hours of local midnight, the recorded
 * calendar date must come from the order itself rather than from this helper, which is
 * why `AuthorityOrder` carries instants the recorder read off the order and every
 * arithmetic function in this module takes `CalendarDate` explicitly.
 */
export function utcDateOf(instant: Instant): CalendarDate | null {
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  return millisToDate(ms);
}

/** Classify one date. Total: every input lands in exactly one class. */
export function classifyDay(date: CalendarDate, calendar: WorkingDayCalendar): DayClass {
  const ms = dateToMillis(date);
  if (ms === null) return 'malformed';
  const from = dateToMillis(calendar.coversFrom);
  const to = dateToMillis(calendar.coversTo);
  if (from === null || to === null) return 'not_covered';
  if (ms < from || ms > to) return 'not_covered';
  if (calendar.weekend.includes(new Date(ms).getUTCDay())) return 'weekend';
  if (calendar.holidays.includes(date)) return 'holiday';
  return 'working';
}

/** A working-day computation resolves to a number, a date, or a refusal. Never a guess. */
export type WorkingDayResult<T> =
  | { readonly kind: 'computed'; readonly value: T }
  | { readonly kind: 'refused'; readonly refusal: Refusal };

const CALENDAR_RULE = DESK_POLICY(
  'working-day arithmetic',
  'MiCA Art 94 counts working days. Working days require a public-holiday calendar for the relevant jurisdiction. This compartment holds no such calendar, so it is an input, and a date outside the supplied calendar produces a refusal rather than an assumption that the day was a working day.',
);

function calendarRefusal(what: string, calendar: WorkingDayCalendar): Refusal {
  return refusal(
    'WORKING_DAY_CALENDAR_ABSENT',
    `Cannot count working days: ${what}. The supplied ${calendar.jurisdiction} calendar covers ${calendar.coversFrom} to ${calendar.coversTo}, and this compartment will not assume an uncovered day was a working day.`,
    CALENDAR_RULE,
    {
      kind: 'supply_data',
      missing: `a public-holiday calendar for ${calendar.jurisdiction} covering the suspension period`,
      whoCanSupply: 'the compliance owner, from the competent authority or the national holiday list',
    },
    what,
  );
}

/**
 * Working days in `[from, to]` INCLUSIVE of both ends.
 *
 * Inclusive because Art 94's unit is the day of the order, not the hour: an order
 * effective on a Monday spends that Monday suspended. Reversed ranges refuse rather
 * than silently returning 0 — a negative interval in a suspension calculation means
 * an input is wrong, and 0 would read as "the suspension is over".
 */
export function countWorkingDays(
  from: CalendarDate,
  to: CalendarDate,
  calendar: WorkingDayCalendar,
): WorkingDayResult<number> {
  const fromMs = dateToMillis(from);
  const toMs = dateToMillis(to);
  if (fromMs === null) return { kind: 'refused', refusal: calendarRefusal(`'${from}' is not a YYYY-MM-DD date`, calendar) };
  if (toMs === null) return { kind: 'refused', refusal: calendarRefusal(`'${to}' is not a YYYY-MM-DD date`, calendar) };
  if (toMs < fromMs) {
    return {
      kind: 'refused',
      refusal: calendarRefusal(`the range ends (${to}) before it starts (${from})`, calendar),
    };
  }
  let count = 0;
  for (let ms = fromMs; ms <= toMs; ms += MS_PER_DAY) {
    const day = millisToDate(ms);
    const cls = classifyDay(day, calendar);
    if (cls === 'not_covered' || cls === 'malformed') {
      return { kind: 'refused', refusal: calendarRefusal(`${day} is outside the calendar's coverage`, calendar) };
    }
    if (cls === 'working') count += 1;
  }
  return { kind: 'computed', value: count };
}

/**
 * The date of the `n`th working day, counting the first working day on or after
 * `from` as day 1.
 *
 * THE COUNTING CONVENTION IS AN INTERPRETATION AND IS LABELLED AS ONE. MiCA says "30
 * consecutive working days on any single occasion" and does not say whether the day
 * the order takes effect is day 1 or day 0. This module counts it as day 1 — the
 * shorter, stricter reading of the desk's freedom — and where the difference matters
 * the anomaly list says so rather than letting a one-day error look like arithmetic.
 */
export function nthWorkingDayFrom(
  from: CalendarDate,
  n: number,
  calendar: WorkingDayCalendar,
): WorkingDayResult<CalendarDate> {
  if (!Number.isInteger(n) || n < 1) {
    return {
      kind: 'refused',
      refusal: calendarRefusal(`${String(n)} is not a positive whole number of working days`, calendar),
    };
  }
  const fromMs = dateToMillis(from);
  if (fromMs === null) {
    return { kind: 'refused', refusal: calendarRefusal(`'${from}' is not a YYYY-MM-DD date`, calendar) };
  }
  let seen = 0;
  for (let ms = fromMs; ; ms += MS_PER_DAY) {
    const day = millisToDate(ms);
    const cls = classifyDay(day, calendar);
    if (cls === 'not_covered' || cls === 'malformed') {
      return { kind: 'refused', refusal: calendarRefusal(`${day} is outside the calendar's coverage`, calendar) };
    }
    if (cls === 'working') {
      seen += 1;
      if (seen === n) return { kind: 'computed', value: day };
    }
  }
}

/**
 * The last date an Art 94(1)(q) suspension may lawfully run to: the 30th consecutive
 * working day, counting the first working day on or after the effective date as day 1.
 *
 * This is the number a supervisor and the desk will disagree about, so it is one
 * function with one convention and a test that pins a hand-checked example.
 */
export function art94CeilingDate(
  effectiveFrom: CalendarDate,
  calendar: WorkingDayCalendar,
): WorkingDayResult<CalendarDate> {
  return nthWorkingDayFrom(effectiveFrom, ART_94_MAX_SUSPENSION_WORKING_DAYS, calendar);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE ORDER — WHAT AN AUTHORITY ACTUALLY SENT                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Which Art 94(1) power the order invoked. Recorded, never inferred: (p) and (q) have
 * different consequences and the difference is the first thing counsel will ask about.
 *
 * `art_94_1_p_prohibit` is the branch most systems would omit and then discover in
 * production. It has no statutory end date. It IS now expressible as a `DeskMode` —
 * `expiresAt: null`, `suspensionPower: 'prohibit_or_suspend'` — where before the
 * integration pass it was not, and the mode was withheld entirely. Either way the desk
 * stays closed indefinitely rather than being handed an invented expiry; the change is
 * that the record can now say which of the two powers closed it.
 *
 * The three values do not collapse to two. `art_94_1_p_suspend` and
 * `art_94_1_p_prohibit` share a citation and share the absence of a ceiling, but they
 * are different orders and counsel will ask which arrived. `SUSPENSION_POWER_CITATION`
 * mapping two keys to one `RuleCitation` is the correct shape, not a redundancy.
 */
export type SuspensionPower = 'art_94_1_q' | 'art_94_1_p_suspend' | 'art_94_1_p_prohibit';

export const SUSPENSION_POWER_CITATION: Record<SuspensionPower, RuleCitation> = {
  art_94_1_q: ART_94_1_Q,
  art_94_1_p_suspend: ART_94_1_P,
  art_94_1_p_prohibit: ART_94_1_P,
};

/**
 * Whether the statutory 30-working-day ceiling applies. Only (q) states one.
 *
 * A (p) suspension is not "the same thing with a friendlier letter": the provision
 * that caps the period is (q), and reading (p) as capped would be the desk arguing its
 * own case against the text.
 */
export const POWER_HAS_STATUTORY_CEILING: Record<SuspensionPower, boolean> = {
  art_94_1_q: true,
  art_94_1_p_suspend: false,
  art_94_1_p_prohibit: false,
};

/**
 * What the order covers.
 *
 * `named` exists because an order may target specific communications rather than the
 * whole desk. It is deliberately hostile to guessing: under a `named` scope an
 * outbound act must identify the item it concerns, and an act that cannot be matched
 * to the list is REFUSED rather than assumed to be outside scope (§6). The desk does
 * not get to decide what the authority meant.
 */
export type OrderScope =
  | { readonly kind: 'all_marketing_communications' }
  | { readonly kind: 'named'; readonly itemRefs: readonly string[]; readonly description: string };

/**
 * An authority order as a human recorded it off the document. Every field is
 * transcription, not derivation.
 *
 * `statedEndAt` is `null` when the order states no end — which is lawful under (p) and
 * a defect under (q), and the anomaly list distinguishes the two rather than
 * flattening both into "missing field".
 */
export interface AuthorityOrder {
  readonly power: SuspensionPower;
  /** Home or host. Free string because Art 7(4) means it may be any EEA authority. */
  readonly authority: string;
  /** The authority's own reference. Without it the order cannot be verified later. */
  readonly orderRef: string;
  readonly effectiveFrom: Instant;
  /** The end date the order itself states, or `null` if it states none. */
  readonly statedEndAt: Instant | null;
  readonly scope: OrderScope;
  readonly recordedBy: ActorId;
  readonly recordedAt: Instant;
  /** The infringement the authority says it suspects, in its words. */
  readonly groundsStated: string;
}

/**
 * Something wrong with the order AS RECORDED, or with what it implies.
 *
 * These are findings, not refusals: an over-long order is the authority's problem to
 * explain and counsel's to answer, and an engine that "corrected" it by shortening the
 * suspension would be the desk granting itself relief. So the desk stays closed for
 * the period recorded and the anomaly is raised.
 */
export type SuspensionAnomaly =
  | { readonly kind: 'exceeds_art_94_1_q_ceiling'; readonly statedEnd: CalendarDate; readonly ceiling: CalendarDate; readonly note: string }
  | { readonly kind: 'ends_before_it_starts'; readonly effectiveFrom: CalendarDate; readonly statedEnd: CalendarDate }
  | { readonly kind: 'no_end_date_recorded_under_q'; readonly note: string }
  | { readonly kind: 'prohibition_has_no_statutory_expiry'; readonly note: string }
  | { readonly kind: 'ceiling_not_computable'; readonly refusal: Refusal }
  | { readonly kind: 'authority_not_named' }
  | { readonly kind: 'order_ref_missing' }
  | { readonly kind: 'grounds_not_recorded' }
  | { readonly kind: 'effective_date_unparseable'; readonly value: string };

/**
 * The recorded order, assessed.
 *
 * `mode` is `null` whenever the order cannot be faithfully expressed as a `DeskMode` —
 * an indefinite prohibition, a (q) order with no end date, an unparseable effective
 * date. In every one of those cases `outboundPermitted` is still `false`: the failure
 * direction is closed, always, and `resumesAt` is `null` rather than a plausible date.
 */
export interface OrderAssessment {
  readonly order: AuthorityOrder;
  /** Expressible as a `DeskMode`, or `null` with the reason in `anomalies`. */
  readonly mode: (DeskMode & { readonly kind: 'suspended_by_authority' }) | null;
  /** The Art 94(1)(q) statutory last day, where the power and the calendar allow it. */
  readonly statutoryCeiling: CalendarDate | null;
  /** The date the desk may speak again, or `null` when that is not knowable. */
  readonly resumesAt: Instant | null;
  readonly anomalies: readonly SuspensionAnomaly[];
  /** One paragraph for the banner. Names the authority, the reference and the end. */
  readonly statement: string;
}

/**
 * Record an authority order. Total: every input produces an assessment, and no input
 * produces an open desk.
 */
export function assessAuthorityOrder(
  order: AuthorityOrder,
  calendar: WorkingDayCalendar | null,
): OrderAssessment {
  const anomalies: SuspensionAnomaly[] = [];
  if (order.authority.trim() === '') anomalies.push({ kind: 'authority_not_named' });
  if (order.orderRef.trim() === '') anomalies.push({ kind: 'order_ref_missing' });
  if (order.groundsStated.trim() === '') anomalies.push({ kind: 'grounds_not_recorded' });

  const effectiveDate = utcDateOf(order.effectiveFrom);
  if (effectiveDate === null) {
    anomalies.push({ kind: 'effective_date_unparseable', value: order.effectiveFrom });
    return {
      order,
      mode: null,
      statutoryCeiling: null,
      resumesAt: null,
      anomalies,
      statement: `${order.authority || 'An authority'} has suspended marketing communications under ${SUSPENSION_POWER_CITATION[order.power].provision}, but the effective date was recorded as '${order.effectiveFrom}', which is not a readable instant. Until it is corrected the desk stays closed and no resume date can be computed.`,
    };
  }

  let ceiling: CalendarDate | null = null;
  if (POWER_HAS_STATUTORY_CEILING[order.power]) {
    if (calendar === null) {
      anomalies.push({
        kind: 'ceiling_not_computable',
        refusal: refusal(
          'WORKING_DAY_CALENDAR_ABSENT',
          'No working-day calendar was supplied, so the Art 94(1)(q) 30-working-day ceiling cannot be computed. The desk stays closed for the period the order states.',
          CALENDAR_RULE,
          {
            kind: 'supply_data',
            missing: 'a public-holiday calendar for the authority\'s jurisdiction',
            whoCanSupply: 'the compliance owner',
          },
        ),
      });
    } else {
      const computed = art94CeilingDate(effectiveDate, calendar);
      if (computed.kind === 'computed') ceiling = computed.value;
      else anomalies.push({ kind: 'ceiling_not_computable', refusal: computed.refusal });
    }
  } else {
    anomalies.push({
      kind: 'prohibition_has_no_statutory_expiry',
      note: `${SUSPENSION_POWER_CITATION[order.power].provision} states no maximum period, so there is no statutory date on which the desk reopens. Only the authority can lift it.`,
    });
  }

  const statedEndDate = order.statedEndAt === null ? null : utcDateOf(order.statedEndAt);
  if (order.statedEndAt !== null && statedEndDate !== null) {
    if (statedEndDate < effectiveDate) {
      anomalies.push({ kind: 'ends_before_it_starts', effectiveFrom: effectiveDate, statedEnd: statedEndDate });
    } else if (ceiling !== null && statedEndDate > ceiling) {
      anomalies.push({
        kind: 'exceeds_art_94_1_q_ceiling',
        statedEnd: statedEndDate,
        ceiling,
        note: 'The order as recorded runs past the 30 consecutive working days Art 94(1)(q) allows for a single occasion. This module does not shorten it — the desk stays closed for the period recorded and the discrepancy goes to counsel, because an engine that trimmed an authority order would be the desk granting itself relief.',
      });
    }
  } else if (order.power === 'art_94_1_q') {
    anomalies.push({
      kind: 'no_end_date_recorded_under_q',
      note: 'An Art 94(1)(q) order is time-boxed by the provision itself, so an order recorded without an end date is incompletely transcribed. Read the order again before relying on any resume date.',
    });
  }

  const usableEnd = order.statedEndAt !== null && statedEndDate !== null && statedEndDate >= effectiveDate
    ? order.statedEndAt
    : null;

  /*
   * `DeskMode.expiresAt` IS NOW NULLABLE, so an indefinite Art 94(1)(p) prohibition is
   * expressible and no longer has to be smuggled through `standingFromOrder`. The
   * remaining `null` mode is the case that must stay unmodelled: an order that recorded
   * an end date this module could not read, or one that ends before it starts. Those are
   * defects in the transcription and the desk stays closed on the anomaly rather than on
   * a guess.
   *
   * The distinction is exactly which of two absences applies:
   *   - (p) with no stated end        → a MODE, `expiresAt: null`, unbounded by statute.
   *   - any power with an unusable end → NO mode; `anomalies` carries the refusal.
   */
  const indefiniteByStatute = order.power !== 'art_94_1_q' && order.statedEndAt === null;
  const mode = usableEnd === null && !indefiniteByStatute
    ? null
    : ({
        kind: 'suspended_by_authority',
        authority: order.authority,
        orderRef: order.orderRef,
        effectiveFrom: order.effectiveFrom,
        expiresAt: usableEnd,
        suspensionPower: order.power !== 'art_94_1_q' ? 'prohibit_or_suspend' : 'cease_or_suspend_30_days',
        recordedBy: order.recordedBy,
      } as const);

  const scopeText = order.scope.kind === 'all_marketing_communications'
    ? 'all marketing communications'
    : `${String(order.scope.itemRefs.length)} named communication(s): ${order.scope.description}`;

  const endText = usableEnd === null
    ? order.power === 'art_94_1_p_prohibit'
      ? 'The order states no end date and Art 94(1)(p) sets none, so nothing outbound may leave until the authority lifts it in writing.'
      : 'No usable end date was recorded, so no resume date is shown and nothing outbound may leave.'
    : `It runs to ${usableEnd}${ceiling === null ? '' : ` (Art 94(1)(q) ceiling: ${ceiling})`}.`;

  return {
    order,
    mode,
    statutoryCeiling: ceiling,
    resumesAt: usableEnd,
    anomalies,
    statement: `${order.authority || 'An authority'} has ordered LCX to cease or suspend ${scopeText} under ${SUSPENSION_POWER_CITATION[order.power].provision} (ref ${order.orderRef || 'not recorded'}), effective ${order.effectiveFrom}. ${endText} The desk may still draft, assess, clear and log — the supervisor will ask what was done during the suspension, and the answer has to be a record.`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 TRANSITIONS — WHO MAY CHANGE THE MODE, AND WHY IT CHANGED                */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * How strict each mode is. Ordering exists so the ASYMMETRY can be enforced:
 * tightening the desk is always allowed and needs one named human; loosening it is a
 * governance act and needs a second one.
 *
 * That asymmetry is the whole of the transition policy. Every real failure of a
 * mode system is a quiet relaxation — someone flips the desk back to normal on a
 * Friday afternoon with no reason recorded and nobody notices until a supervisor asks
 * who authorised it.
 */
export const MODE_STRICTNESS: Record<DeskMode['kind'], 0 | 1 | 2> = {
  normal: 0,
  heightened: 1,
  suspended_by_authority: 2,
};

export type TransitionDirection = 'escalation' | 'relaxation' | 'lateral';

/**
 * Who may do what. A POLICY OBJECT, not a hardcoded list, because the roster is the
 * workspace's business and this module must not pretend to know it.
 *
 * `mayRecordSuspension` is deliberately wide: recording an authority order is a DUTY,
 * not a privilege, and a policy that let only one absent person record it would leave
 * the desk open while an order sat unentered. The recorder is named either way.
 */
export interface ModeChangePolicy {
  readonly mayEscalate: readonly ClearanceRole[];
  readonly mayRelax: readonly ClearanceRole[];
  readonly mayRecordSuspension: 'any_named_member' | readonly ClearanceRole[];
  /** A relaxation may not be performed by the person who imposed the mode. */
  readonly relaxationRequiresDifferentActor: boolean;
  readonly minReasonChars: number;
}

/**
 * The default, and the reasoning: `policy` and `legal` are the two CERC lanes whose
 * job is the firm's position rather than the message, and a desk mode is a position.
 * `reputation` and `sme` may escalate — anyone who can see trouble should be able to
 * tighten the desk — but not relax it.
 */
export const DEFAULT_MODE_CHANGE_POLICY: ModeChangePolicy = {
  mayEscalate: ['reputation', 'policy', 'sme', 'legal'],
  mayRelax: ['policy', 'legal'],
  mayRecordSuspension: 'any_named_member',
  relaxationRequiresDifferentActor: true,
  minReasonChars: 12,
};

/**
 * A request to change mode. `reason` is required and is not decoration: it is the
 * field a supervisor reads first, and `MATERIAL_CHANGE_VOIDS_CLEARANCE`-style
 * after-the-fact reconstruction is exactly what it exists to prevent.
 */
export interface ModeChangeRequest {
  readonly to: DeskMode;
  readonly by: ActorId;
  readonly byRoles: readonly ClearanceRole[];
  readonly at: Instant;
  readonly reason: string;
  /**
   * Required to leave a live `suspended_by_authority` before its recorded expiry: only
   * the authority can lift its own order early, so the desk must hold its reference.
   */
  readonly authorityWithdrawal: {
    readonly authority: string;
    readonly ref: string;
    readonly at: Instant;
  } | null;
}

/** The record of a mode change. This, and not the mode column, is the evidence. */
export interface ModeTransition {
  readonly from: DeskMode;
  readonly to: DeskMode;
  readonly direction: TransitionDirection;
  readonly by: ActorId;
  readonly byRoles: readonly ClearanceRole[];
  readonly at: Instant;
  readonly reason: string;
  readonly authorityWithdrawal: ModeChangeRequest['authorityWithdrawal'];
  /** Rendered in the mode history. One sentence, past tense, names the human. */
  readonly statement: string;
}

export type ModeChangeOutcome =
  | { readonly kind: 'accepted'; readonly transition: ModeTransition }
  | { readonly kind: 'refused'; readonly refusals: readonly Refusal[] };

const IMPOSER_RULE = DESK_POLICY(
  'mode relaxation is a governed act',
  'Tightening the desk needs one named human. Loosening it needs a different one, a stated reason, and — where the mode was imposed by an authority — that authority\'s own withdrawal. A desk that can be reopened by the person who closed it has a mode field, not a control.',
);

const AUTHORITY_LIFT_RULE = DESK_POLICY(
  'only the authority lifts its own order',
  'A suspension imposed under MiCA Art 94(1)(p) or (q) ends when it expires by its own terms or when the issuing authority withdraws it. It does not end because the desk would like to publish.',
);

function whoImposed(mode: DeskMode): ActorId | null {
  if (mode.kind === 'heightened') return mode.imposedBy;
  if (mode.kind === 'suspended_by_authority') return mode.recordedBy;
  return null;
}

/**
 * Decide a mode change. Pure: `from`, the request and `asOf` are all supplied.
 *
 * Refusals are plural on purpose. Telling an operator their reason is too short, and
 * only after they fix it that they also lack the role, is how a governance control
 * gets routed around.
 */
export function requestModeChange(
  from: DeskMode,
  request: ModeChangeRequest,
  asOf: Instant,
  policy: ModeChangePolicy = DEFAULT_MODE_CHANGE_POLICY,
): ModeChangeOutcome {
  const refusals: Refusal[] = [];
  const fromRank = MODE_STRICTNESS[from.kind];
  const toRank = MODE_STRICTNESS[request.to.kind];
  const direction: TransitionDirection =
    toRank > fromRank ? 'escalation' : toRank < fromRank ? 'relaxation' : 'lateral';

  if (request.reason.trim().length < policy.minReasonChars) {
    refusals.push(
      refusal(
        'DESK_HEIGHTENED_PRECLEARANCE_REQUIRED',
        `A mode change needs a reason of at least ${String(policy.minReasonChars)} characters, because the reason is the first thing a supervisor reads. The desk stays in ${from.kind}.`,
        IMPOSER_RULE,
        { kind: 'edit_text', what: 'state why the mode is changing, in a sentence a supervisor will accept' },
        request.reason,
      ),
    );
  }

  /* Leaving a live authority suspension: only the authority may do it early. */
  if (from.kind === 'suspended_by_authority' && direction === 'relaxation') {
    /*
     * `expiresAt: null` is an Art 94(1)(p) prohibition with no statutory end, so it can
     * NEVER be expired by the passage of time. Reading a null end as "no deadline, so
     * the deadline has passed" would reopen the desk on the strictest order the statute
     * allows, which is why this is written as an explicit `false` rather than left to
     * `Date.parse(null as unknown as string)` producing NaN and a falsy comparison by
     * luck. An unparseable date is likewise not an expiry.
     */
    const endAt = from.expiresAt === null ? null : Date.parse(from.expiresAt);
    const expired = endAt !== null && Number.isFinite(endAt) && Date.parse(asOf) > endAt;
    const endText = from.expiresAt === null
      ? 'has no end date, because Art 94(1)(p) sets none'
      : `runs to ${from.expiresAt}`;
    if (!expired && request.authorityWithdrawal === null) {
      refusals.push(
        refusal(
          'DESK_SUSPENDED_BY_AUTHORITY',
          `${from.authority}'s order ${from.orderRef} ${endText} and has not been withdrawn. The desk cannot be reopened from inside; record the authority's withdrawal${from.expiresAt === null ? '' : ' or wait for the order to expire'}.`,
          AUTHORITY_LIFT_RULE,
          {
            kind: 'wait_until',
            condition: from.expiresAt === null
              ? `a written withdrawal from ${from.authority}. There is no date on which this lifts by itself.`
              : `${from.expiresAt}, or a written withdrawal from ${from.authority}`,
          },
        ),
      );
    }
    if (request.authorityWithdrawal !== null && request.authorityWithdrawal.ref.trim() === '') {
      refusals.push(
        refusal(
          'DESK_SUSPENDED_BY_AUTHORITY',
          'A withdrawal was recorded with no reference. An unreferenced withdrawal cannot be verified against the order it withdraws, so the suspension stands.',
          AUTHORITY_LIFT_RULE,
          { kind: 'supply_data', missing: "the authority's withdrawal reference", whoCanSupply: 'the compliance owner, from the authority\'s letter' },
        ),
      );
    }
  }

  /* Entering a suspension: the order's identifying fields are not optional. */
  if (request.to.kind === 'suspended_by_authority') {
    if (request.to.authority.trim() === '' || request.to.orderRef.trim() === '') {
      refusals.push(
        refusal(
          'DESK_SUSPENDED_BY_AUTHORITY',
          'A suspension must name the authority and its order reference. An unattributed suspension cannot be verified, lifted or reported, and the desk needs all three.',
          AUTHORITY_LIFT_RULE,
          { kind: 'supply_data', missing: 'the issuing authority and its order reference', whoCanSupply: 'whoever received the order' },
        ),
      );
    }
    if (
      policy.mayRecordSuspension !== 'any_named_member' &&
      !request.byRoles.some((r) => (policy.mayRecordSuspension as readonly ClearanceRole[]).includes(r))
    ) {
      refusals.push(
        refusal(
          'DESK_SUSPENDED_BY_AUTHORITY',
          'This workspace restricts who may record an authority order, and the requester holds none of those roles. Recording an order is a duty, so escalate immediately rather than waiting.',
          IMPOSER_RULE,
          { kind: 'human_authority', role: 'legal' },
        ),
      );
    }
  }

  /* Role gates. Escalation is wide, relaxation is narrow. */
  if (direction === 'relaxation' && !request.byRoles.some((r) => policy.mayRelax.includes(r))) {
    refusals.push(
      refusal(
        'DESK_HEIGHTENED_PRECLEARANCE_REQUIRED',
        `Relaxing the desk from ${from.kind} to ${request.to.kind} needs ${policy.mayRelax.join(' or ')}, and the requester holds ${request.byRoles.length === 0 ? 'no recorded role' : request.byRoles.join(', ')}. The desk stays in ${from.kind}.`,
        IMPOSER_RULE,
        { kind: 'human_authority', role: policy.mayRelax[0] ?? 'legal' },
      ),
    );
  }
  if (direction === 'escalation' && !request.byRoles.some((r) => policy.mayEscalate.includes(r))) {
    refusals.push(
      refusal(
        'DESK_HEIGHTENED_PRECLEARANCE_REQUIRED',
        `Tightening the desk needs ${policy.mayEscalate.join(' or ')}, and the requester holds ${request.byRoles.length === 0 ? 'no recorded role' : request.byRoles.join(', ')}.`,
        IMPOSER_RULE,
        { kind: 'human_authority', role: policy.mayEscalate[0] ?? 'policy' },
      ),
    );
  }

  /* Four eyes on relaxation: not the person who imposed it. */
  const imposer = whoImposed(from);
  if (
    direction === 'relaxation' &&
    policy.relaxationRequiresDifferentActor &&
    imposer !== null &&
    imposer === request.by
  ) {
    refusals.push(
      refusal(
        'SELF_APPROVAL_FORBIDDEN',
        `${request.by} imposed this mode and cannot also lift it. If nobody else in the workspace holds ${policy.mayRelax.join(' or ')}, the honest answer is that this desk cannot relax its own mode — say so rather than performing a second pair of eyes.`,
        IMPOSER_RULE,
        { kind: 'human_authority', role: policy.mayRelax[0] ?? 'legal' },
      ),
    );
  }

  if (refusals.length > 0) return { kind: 'refused', refusals };

  return {
    kind: 'accepted',
    transition: {
      from,
      to: request.to,
      direction,
      by: request.by,
      byRoles: request.byRoles,
      at: request.at,
      reason: request.reason,
      authorityWithdrawal: request.authorityWithdrawal,
      statement: `${request.by} moved the desk from ${from.kind} to ${request.to.kind} (${direction}) at ${request.at}: ${request.reason.trim()}`,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 STANDING — IS THAT MODE ACTUALLY IN FORCE RIGHT NOW                      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Where a recorded mode sits relative to `asOf`.
 *
 *  - `pending`      recorded, effective in the future. Not in force yet, and a surface
 *                   that shows it as in force will have the desk stop work early.
 *  - `in_force`
 *  - `lapsed`       the recorded end has passed and nobody filed a lift. The desk is
 *                   free again by the order's own terms, and the missing lift record is
 *                   a bookkeeping defect the banner must show — not a reason to keep
 *                   refusing, because refusing longer than the authority ordered is its
 *                   own compliance problem.
 *  - `unbounded`    in force with no computable end: an Art 94(1)(p) prohibition, or an
 *                   order whose end date could not be read.
 *  - `undated`      the recorded mode's own instants are unreadable. Fails CLOSED.
 */
export type ModePhase = 'pending' | 'in_force' | 'lapsed' | 'unbounded' | 'undated' | 'not_applicable';

/**
 * The single question the rest of the compartment asks this module: what may the desk
 * do, at this instant, and what do I put on screen if the answer is no.
 */
export interface DeskStanding {
  readonly mode: DeskMode;
  readonly phase: ModePhase;
  readonly asOf: Instant;
  readonly strictness: 0 | 1 | 2;
  /** False for a live suspension or an unbounded prohibition. Nothing else clears it. */
  readonly outboundPermitted: boolean;
  /** When the desk may speak again. `null` where that is not knowable — never a guess. */
  readonly resumesAt: Instant | null;
  /** Working days left, when a calendar was supplied. A refusal when it was not. */
  readonly workingDaysRemaining: WorkingDayResult<number> | null;
  /** What the order covers. Defaults to everything when the mode carries no scope. */
  readonly scope: OrderScope;
  /** The expired-but-never-lifted case, surfaced rather than tidied away. */
  readonly lapsedWithoutLiftRecord: boolean;
  /** The banner. Says what is happening, who ordered it, and when it ends. */
  readonly statement: string;
}

const ALL_SCOPE: OrderScope = { kind: 'all_marketing_communications' };

function parsedOrNull(instant: Instant): number | null {
  const ms = Date.parse(instant);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Compute standing. Total, and the failure direction is closed: an unreadable date on a
 * suspension leaves the desk shut with `phase: 'undated'`, because the alternative is a
 * malformed string reopening a desk a regulator closed.
 */
export function deskStanding(
  mode: DeskMode,
  asOf: Instant,
  calendar: WorkingDayCalendar | null = null,
  scope: OrderScope = ALL_SCOPE,
): DeskStanding {
  const strictness = MODE_STRICTNESS[mode.kind];
  const now = parsedOrNull(asOf);

  if (mode.kind === 'normal') {
    return {
      mode,
      phase: 'not_applicable',
      asOf,
      strictness,
      outboundPermitted: true,
      resumesAt: null,
      workingDaysRemaining: null,
      scope: ALL_SCOPE,
      lapsedWithoutLiftRecord: false,
      statement: 'The desk is in normal mode. Static surfaces still need pre-approval and interactive items still need a risk-based review with a retained sampling record.',
    };
  }

  const from = parsedOrNull(mode.effectiveFrom);
  /**
   * `null` means NO END EXISTS — `heightened` with no expiry, or an Art 94(1)(p)
   * prohibition, which the statute gives no maximum period. It does NOT mean the date
   * could not be read: that is `expiresAt` set to a string `parsedOrNull` rejects, and it
   * lands in the `undated` branch below and fails closed.
   *
   * Keeping those two apart matters in both directions. Before `expiresAt` was nullable,
   * a null here could only be a defect, so the guard below treated it as `undated` — which
   * would now report a live indefinite prohibition as a record-keeping error instead of
   * the strictest order in Art 94. And a genuinely unreadable date must never be read as
   * "unbounded, so no ceiling to check".
   */
  const endInstant: Instant | null = mode.expiresAt;
  const until = endInstant === null ? null : parsedOrNull(endInstant);
  const endUnreadable = endInstant !== null && until === null;

  if (now === null || from === null || endUnreadable) {
    return {
      mode,
      phase: 'undated',
      asOf,
      strictness,
      outboundPermitted: false,
      resumesAt: null,
      workingDaysRemaining: null,
      scope,
      lapsedWithoutLiftRecord: false,
      statement:
        mode.kind === 'suspended_by_authority'
          ? `${mode.authority}'s order ${mode.orderRef} is recorded with a date this instrument cannot read, so no end can be computed and nothing outbound may leave. Correct the record before publishing anything.`
          : 'The heightened-mode record carries a date this instrument cannot read. Every surface needs pre-approval until it is corrected.',
    };
  }

  const phase: ModePhase =
    now < from
      ? 'pending'
      : until === null
        ? mode.kind === 'suspended_by_authority'
          ? 'unbounded'
          : 'in_force'
        : now > until
          ? 'lapsed'
          : 'in_force';

  const suspended = mode.kind === 'suspended_by_authority' && (phase === 'in_force' || phase === 'unbounded');

  let remaining: WorkingDayResult<number> | null = null;
  if (suspended && calendar !== null && endInstant !== null) {
    const today = utcDateOf(asOf);
    const last = utcDateOf(endInstant);
    remaining = today === null || last === null
      ? { kind: 'refused', refusal: calendarRefusal('the suspension dates are not readable as calendar dates', calendar) }
      : countWorkingDays(today, last, calendar);
  }

  const remainingText =
    remaining === null
      ? 'No working-day calendar was supplied, so the number of working days left is not shown — counting calendar days here would overstate the desk\'s freedom by roughly two weeks.'
      : remaining.kind === 'computed'
        ? `${String(remaining.value)} working day(s) remain, counted on the ${calendar?.jurisdiction ?? 'supplied'} calendar (${calendar?.source ?? 'source not stated'}).`
        : remaining.refusal.sentence;

  const scopeText = scope.kind === 'all_marketing_communications'
    ? 'all marketing communications'
    : `named communications only (${scope.description})`;

  let statement: string;
  if (mode.kind === 'suspended_by_authority') {
    statement =
      phase === 'pending'
        ? `${mode.authority}'s order ${mode.orderRef} takes effect ${mode.effectiveFrom}. The desk is not suspended yet.`
        : phase === 'lapsed'
          ? `${mode.authority}'s order ${mode.orderRef} expired at ${mode.expiresAt} and no lift was recorded. The desk may publish again — record the lift so the mode history is complete.`
          : phase === 'unbounded'
            ? `${mode.authority} has prohibited marketing communications under Art 94(1)(p) (ref ${mode.orderRef}), effective ${mode.effectiveFrom}. Art 94(1)(p) states no maximum period, so there is no date on which this ends by itself: nothing outbound may leave until ${mode.authority} withdraws the order in writing. Drafting, assessment, clearance and logging continue, because the supervisor will ask what the desk did during the suspension.`
            : `${mode.authority} has suspended ${scopeText} under Art 94 (ref ${mode.orderRef}), from ${mode.effectiveFrom} to ${mode.expiresAt}. Nothing may be handed off, copied out or exported for posting. ${remainingText} Drafting, assessment, clearance and logging continue.`;
  } else {
    statement =
      phase === 'pending'
        ? `Heightened mode, imposed by ${mode.imposedBy}, takes effect ${mode.effectiveFrom}: ${mode.reason}`
        : phase === 'lapsed'
          ? `Heightened mode expired at ${String(mode.expiresAt)} and was not renewed. The desk is back to normal review — confirm that is intended.`
          : `Heightened mode, imposed by ${mode.imposedBy} on ${mode.effectiveFrom}${mode.expiresAt === null ? ' with no expiry set' : ` until ${mode.expiresAt}`}: ${mode.reason}. Every surface needs pre-approval by a named human; risk-based sampling is not available in this mode.`;
  }

  return {
    mode,
    phase,
    asOf,
    strictness,
    outboundPermitted: !suspended,
    resumesAt: suspended ? (phase === 'unbounded' ? null : endInstant) : null,
    workingDaysRemaining: remaining,
    scope,
    lapsedWithoutLiftRecord: phase === 'lapsed',
    statement,
  };
}

/**
 * Standing straight from a recorded order — including the cases the `DeskMode` union
 * cannot express, which is the point of having it.
 *
 * When `assessAuthorityOrder` could not produce a mode (indefinite prohibition, no
 * readable end date), this returns a standing with `outboundPermitted: false`,
 * `resumesAt: null` and the order's own sentence. There is no path through this
 * function that opens the desk on a defective order.
 */
export function standingFromOrder(
  assessment: OrderAssessment,
  asOf: Instant,
  calendar: WorkingDayCalendar | null = null,
): DeskStanding {
  if (assessment.mode !== null) {
    return deskStanding(assessment.mode, asOf, calendar, assessment.order.scope);
  }
  return {
    mode: {
      kind: 'suspended_by_authority',
      authority: assessment.order.authority,
      orderRef: assessment.order.orderRef,
      effectiveFrom: assessment.order.effectiveFrom,
      /*
       * WAS A WORKAROUND, IS NOW THE TRUTH. This echoed `effectiveFrom` because
       * `DeskMode.expiresAt` was non-null and an indefinite prohibition had no legal
       * shape — a past date sitting in a field every surface reads as "reopens on". The
       * integration pass made the field nullable, so the absence of an end is now stated
       * rather than encoded. `phase: 'unbounded'` and `resumesAt: null` still carry the
       * meaning for callers.
       */
      expiresAt: null,
      suspensionPower: assessment.order.power !== 'art_94_1_q' ? 'prohibit_or_suspend' : 'cease_or_suspend_30_days',
      recordedBy: assessment.order.recordedBy,
    },
    phase: 'unbounded',
    asOf,
    strictness: 2,
    outboundPermitted: false,
    resumesAt: null,
    workingDaysRemaining: null,
    scope: assessment.order.scope,
    lapsedWithoutLiftRecord: false,
    statement: assessment.statement,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 WHAT EACH MODE CHANGES — REVIEW REQUIREMENTS, NOT VIBES                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Everything the desk does that a mode could plausibly gate.
 *
 * The split that matters is between the acts that PRODUCE A RECORD and the acts that
 * MOVE TEXT TOWARDS THE PUBLIC. A suspension stops the second set entirely and must
 * leave the first set alone: the record is what the supervisor asked for.
 *
 * `handoff`, `copy_out` and `export_for_posting` are the only three routes text takes
 * out of this compartment, because the compartment never posts. Gating exactly those
 * three is therefore gating publication — there is no fourth door for a suspension to
 * miss.
 */
export type DeskAct =
  | 'draft'
  | 'assess'
  | 'triage'
  | 'clear'
  | 'log'
  | 'export_for_record'
  | 'handoff'
  | 'copy_out'
  | 'export_for_posting';

/** The three that move text towards the public. Suspension blocks these and only these. */
export const OUTBOUND_ACTS: readonly DeskAct[] = ['handoff', 'copy_out', 'export_for_posting'] as const;

export const ACT_IS_OUTBOUND: Record<DeskAct, boolean> = {
  draft: false,
  assess: false,
  triage: false,
  clear: false,
  log: false,
  export_for_record: false,
  handoff: true,
  copy_out: true,
  export_for_posting: true,
};

/**
 * What a mode does to review requirements. Derived, never stored: a stored copy of this
 * drifts from the mode it claims to describe.
 */
export interface DeskPolicy {
  readonly mode: DeskMode['kind'];
  readonly outboundPermitted: boolean;
  readonly permittedActs: readonly DeskAct[];
  readonly forbiddenActs: readonly DeskAct[];
  /**
   * Applied to EVERY surface class when set, overriding `SURFACE_APPROVAL_REGIME`.
   * `null` means the per-surface default stands.
   */
  readonly approvalRegimeOverride: ApprovalRegime | null;
  /**
   * Whether the FINRA 2210(b)(3)-style substitute for pre-use review is available.
   * False under heightened mode: the point of heightened mode is that sampling stopped
   * being enough.
   */
  readonly interactiveSamplingPermitted: boolean;
  /** Blocking clearance lanes this mode adds on top of whatever the item already needs. */
  readonly addedBlockingClearances: readonly ClearanceRole[];
  readonly note: string;
}

/** Pure lookup over the mode kind. Total, and every branch is tested. */
export function deskPolicy(mode: DeskMode['kind']): DeskPolicy {
  switch (mode) {
    case 'normal':
      return {
        mode,
        outboundPermitted: true,
        permittedActs: ['draft', 'assess', 'triage', 'clear', 'log', 'export_for_record', 'handoff', 'copy_out', 'export_for_posting'],
        forbiddenActs: [],
        approvalRegimeOverride: null,
        interactiveSamplingPermitted: true,
        addedBlockingClearances: [],
        note: 'Static surfaces need pre-approval; interactive items take risk-based review plus a retained sampling record.',
      };
    case 'heightened':
      return {
        mode,
        outboundPermitted: true,
        permittedActs: ['draft', 'assess', 'triage', 'clear', 'log', 'export_for_record', 'handoff', 'copy_out', 'export_for_posting'],
        forbiddenActs: [],
        approvalRegimeOverride: 'pre_approval_required',
        interactiveSamplingPermitted: false,
        addedBlockingClearances: ['policy'],
        note: 'Every surface, interactive included, needs pre-approval by a named human before handoff. Risk-based sampling is not available: FINRA 2210(c)(1)(B) is the model for a regime imposed precisely because sampling stopped being enough.',
      };
    case 'suspended_by_authority':
      return {
        mode,
        outboundPermitted: false,
        permittedActs: ['draft', 'assess', 'triage', 'clear', 'log', 'export_for_record'],
        forbiddenActs: ['handoff', 'copy_out', 'export_for_posting'],
        approvalRegimeOverride: 'pre_approval_required',
        interactiveSamplingPermitted: false,
        addedBlockingClearances: ['legal'],
        note: 'Nothing leaves. Drafting, assessment, clearance and logging continue deliberately: the record of what the desk did during a suspension is what the supervisor will ask for, and a dark screen is not an answer.',
      };
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 THE GATE — A SUSPENDED DESK REFUSES, AND SAYS WHY                        */
/* ══════════════════════════════════════════════════════════════════════════ */

const SCOPE_RULE = DESK_POLICY(
  'named-scope orders are not narrowed by guesswork',
  'Where an authority order names the communications it covers, an outbound act that cannot be matched to that list is refused. The desk does not decide what the authority meant, and an unidentified item is not evidence of being out of scope.',
);

/**
 * May this act proceed? `null` means yes.
 *
 * The refusal names the authority, the reference, the period and the working days left,
 * because a disabled button with no sentence next to it teaches an operator to look for
 * another route — and in this compartment the other route is copying the text by hand,
 * which is exactly what the suspension forbids and exactly what leaves no record.
 */
export function gateDeskAct(
  standing: DeskStanding,
  act: DeskAct,
  itemRef: string | null = null,
): Refusal | null {
  if (!ACT_IS_OUTBOUND[act]) return null;

  const policy = deskPolicy(standing.mode.kind);
  const blockedByMode = !standing.outboundPermitted || !policy.outboundPermitted;
  const suspensionLive =
    standing.mode.kind === 'suspended_by_authority' &&
    (standing.phase === 'in_force' || standing.phase === 'unbounded' || standing.phase === 'undated');

  if (!blockedByMode || !suspensionLive) return null;

  const mode = standing.mode;
  if (mode.kind !== 'suspended_by_authority') return null;

  /* A named-scope order: refuse anything that cannot be shown to be outside it. */
  if (standing.scope.kind === 'named') {
    if (itemRef === null) {
      return refusal(
        'DESK_SUSPENDED_BY_AUTHORITY',
        `${mode.authority}'s order ${mode.orderRef} covers named communications only, and this act did not identify which item it concerns. Name the item: an unidentified item cannot be shown to be outside the order.`,
        SCOPE_RULE,
        { kind: 'supply_data', missing: 'the item reference this act concerns', whoCanSupply: 'the operator performing the act' },
      );
    }
    if (!standing.scope.itemRefs.includes(itemRef)) return null;
  }

  const remaining = standing.workingDaysRemaining;
  const remainingText =
    remaining === null
      ? 'The working days remaining are not shown because no holiday calendar was supplied.'
      : remaining.kind === 'computed'
        ? `${String(remaining.value)} working day(s) remain.`
        : 'The working days remaining could not be counted; see the calendar refusal on the banner.';

  const endText =
    standing.phase === 'unbounded'
      ? `Art 94(1)(p) states no maximum period, so there is no date on which this lifts by itself — only ${mode.authority} can withdraw it.`
      : standing.phase === 'undated'
        ? 'The order is recorded with an unreadable date, so no end can be computed and the desk stays closed until the record is corrected.'
        : `It runs to ${mode.expiresAt}. ${remainingText}`;

  /*
   * TWO REASONS, TWO CODES, AND THEY HAVE DIFFERENT OWNERS. Both refuse the act and both
   * keep the desk closed, so the operator sees the same outcome — but the refusal-frequency
   * panel is how the desk learns WHICH problem it has, and "an authority has closed us" and
   * "we transcribed the order with a date nothing can read" are not the same finding. The
   * first is answered by waiting or by a withdrawal letter; the second by re-reading the
   * order, today, because right now nobody knows when it ends. Landing them in one bucket
   * would hide a record-keeping defect behind a supervisory event.
   */
  return refusal(
    standing.phase === 'undated' ? 'INSTANT_UNPARSEABLE' : 'DESK_SUSPENDED_BY_AUTHORITY',
    `Refused: ${act.replace(/_/g, ' ')} is not available while ${mode.authority}'s order ${mode.orderRef} is in force (effective ${mode.effectiveFrom}). ${endText} Draft it, clear it and log it — the record is wanted — but nothing may be handed off, copied out or exported for posting, and posting it from a personal account would be the same breach with worse evidence.`,
    SUSPENSION_POWER_CITATION[standing.phase === 'unbounded' ? 'art_94_1_p_prohibit' : 'art_94_1_q'],
    {
      kind: 'wait_until',
      condition:
        standing.phase === 'unbounded' || standing.phase === 'undated'
          ? `a written withdrawal from ${mode.authority}`
          : `${mode.expiresAt}, or an earlier written withdrawal from ${mode.authority}`,
    },
    act,
  );
}

/**
 * The approval regime an item actually attracts, once the mode has had its say.
 *
 * Returns the stricter of the surface default and the mode override, plus the sentence
 * explaining any upgrade. A surface that silently upgrades the regime produces an
 * operator who believes the tool is inconsistent.
 */
export function effectiveApprovalRegime(
  standing: DeskStanding,
  surfaceClass: SurfaceClass,
  surfaceDefault: ApprovalRegime,
): { readonly regime: ApprovalRegime; readonly upgradedByMode: boolean; readonly why: string | null } {
  const policy = deskPolicy(standing.mode.kind);
  const inForce = standing.phase === 'in_force' || standing.phase === 'unbounded' || standing.phase === 'undated';
  if (!inForce || policy.approvalRegimeOverride === null) {
    return { regime: surfaceDefault, upgradedByMode: false, why: null };
  }
  if (policy.approvalRegimeOverride === surfaceDefault) {
    return { regime: surfaceDefault, upgradedByMode: false, why: null };
  }
  return {
    regime: policy.approvalRegimeOverride,
    upgradedByMode: true,
    why: `${surfaceClass} surfaces normally take ${surfaceDefault.replace(/_/g, ' ')}, but the desk is in ${standing.mode.kind}: ${policy.note}`,
  };
}
