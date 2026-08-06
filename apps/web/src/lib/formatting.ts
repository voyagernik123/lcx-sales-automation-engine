import { Status, Tier, ReadinessStatus } from '@/types/ontology';
import { parseMoney, isExact } from '@/lib/money';

/**
 * DEPRECATED — a monetary string that is a range, an open-ended floor or prose
 * has no single numeric value, and this signature cannot say so.
 *
 * It now delegates to the one parser (money.ts) and returns dollars ONLY for a
 * figure that parses exactly. Everything else returns 0, which here means
 * "excluded from arithmetic", not "$0".
 *
 * That is a change of direction, not a fix: the old implementation
 * OVERSTATED (it scavenged digits, so '$75K-$100K' became $75,100,000 and
 * '$100,000-$500,000' became $100,000,500,000); this one UNDERSTATES, because
 * it drops the 14 open-ended and 14 range estCost values instead of inventing
 * a figure for them. Understating without saying so is still a doctrine
 * violation — the fix is for the caller to use parseMoney/sumExactMoney and
 * refuse. The three remaining callers live outside this lane's file set:
 *   apps/web/src/pages/CapitalEstimator.tsx:35,41,48
 *   apps/web/src/pages/Simulator.tsx:43,48,65,70,77,92,97,103
 *   apps/web/src/pages/ScenarioPlanner.tsx:57
 *
 * @deprecated Use parseMoney() and handle every result kind.
 */
export function parseMonetaryValue(cost: string | undefined): number {
  const parsed = parseMoney(cost);
  return isExact(parsed) ? parsed.cents / 100 : 0;
}

export function formatUSD(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  if (amount === 0) return '$0';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000).toLocaleString()}K`;
  return `$${Math.round(amount).toLocaleString()}`;
}

// ── Timelines ──────────────────────────────────────────────────────────────
// The old parseTimelineMonths returned a bare number and had zero callers,
// while BriefGenerator.tsx hand-rolled the identical regex inline. Both took
// the UPPER end of '4-6 months' silently, and both turned 'No state MTL
// requirement' into 0 — which prints as "0m" and reads as "instant".
//
// The FIRST attempt at that fix classified 'No state…' correctly at the member
// level and then re-introduced the same 0 one layer up: cohortTimelineBand
// returned `{kind:'band', lowMonths: 0, highMonths: 0}` whenever no member had a
// readable duration, and BriefGenerator printed it through timelineBandDisplay
// as "0m" with a note underneath saying every figure had been read as recorded.
// Clear + MT reproduced it, and so did the 40-state NMLS cohort under CLARITY.
// A fix that moves a wrong number from the parser into the aggregate is not a
// fix, so the aggregate now has a fourth outcome — see TimelineBand below.

export type TimelineRefusalCode = 'TIMELINE_ABSENT' | 'TIMELINE_NOT_NUMERIC';

export type ParsedTimeline =
  | { kind: 'months'; months: number; source: string; qualifier?: string }
  | { kind: 'monthRange'; lowMonths: number; highMonths: number; source: string; qualifier?: string }
  /**
   * '18 months+' / '4-6 months+'. A floor with no ceiling, exactly as money.ts
   * treats '$300K+'. It was previously read as a HARD 18 with the '+' filed away
   * as decorative `qualifier` prose, and that hard 18 then entered the cohort
   * band as if it were bounded. No estTimeline value carries a '+' today, so
   * this branch is latent — it exists so the next data edit cannot quietly
   * launder an open-ended timeline into an exact one.
   */
  | { kind: 'openEndedMonths'; floorMonths: number; source: string; qualifier?: string }
  /** 'No state MTL requirement' — a real statement that no state process exists,
   *  which is NOT the same as a duration of zero and not the same as missing. */
  | { kind: 'noStateProcess'; source: string }
  | { kind: 'unparseable'; source: string; code: TimelineRefusalCode; rule: string };

const TIMELINE_RULES: Record<TimelineRefusalCode, string> = {
  TIMELINE_ABSENT: 'No timeline was recorded for this jurisdiction. An absent timeline is not zero months.',
  TIMELINE_NOT_NUMERIC:
    'The recorded timeline is not expressed in months. It is printed verbatim and excluded from the cohort band.',
};

const TIMELINE_RE = /^(\d+)(?:\s*[-–—]\s*(\d+))?\s*months?\b(.*)$/i;

export function parseTimeline(raw: string | null | undefined): ParsedTimeline {
  const source = raw ?? '';
  const normalized = source.trim().replace(/\s+/g, ' ');
  if (normalized === '') {
    return { kind: 'unparseable', source, code: 'TIMELINE_ABSENT', rule: TIMELINE_RULES.TIMELINE_ABSENT };
  }
  if (/^no state\b/i.test(normalized)) return { kind: 'noStateProcess', source };

  const m = TIMELINE_RE.exec(normalized);
  if (!m) {
    return {
      kind: 'unparseable',
      source,
      code: 'TIMELINE_NOT_NUMERIC',
      rule: TIMELINE_RULES.TIMELINE_NOT_NUMERIC,
    };
  }
  const [, lowText, highText, trailing] = m;
  // '4-7 months (standard) or sandbox entry' — the months are readable but the
  // sentence qualifies them, so the qualifier travels with the figure and the
  // surface prints the source string rather than the digits alone.
  const qualifier = trailing.trim() === '' ? undefined : trailing.trim();
  // '18 months+' — the '+' is the open-ended marker, not decoration.
  const openEnded = /^\s*\+/.test(trailing);
  const low = parseInt(lowText, 10);
  if (highText === undefined) {
    return openEnded
      ? { kind: 'openEndedMonths', floorMonths: low, source, qualifier }
      : { kind: 'months', months: low, source, qualifier };
  }
  const high = parseInt(highText, 10);
  if (high < low) {
    return {
      kind: 'unparseable',
      source,
      code: 'TIMELINE_NOT_NUMERIC',
      rule: TIMELINE_RULES.TIMELINE_NOT_NUMERIC,
    };
  }
  // A range whose upper end carries the '+' has no ceiling either; its floor is
  // the recorded high end.
  if (openEnded) return { kind: 'openEndedMonths', floorMonths: high, source, qualifier };
  return { kind: 'monthRange', lowMonths: low, highMonths: high, source, qualifier };
}

export type TimelineAggregateRefusalCode =
  | 'TIMELINE_AGG_NO_MEMBERS'
  /** A member's estTimeline field is empty — nobody recorded one. */
  | 'TIMELINE_AGG_ABSENT_MEMBER'
  /** A member recorded a timeline that is not expressed in months. */
  | 'TIMELINE_AGG_UNPARSEABLE_MEMBER'
  /** A member's timeline is open-ended ('18 months+'), so the cohort has no ceiling. */
  | 'TIMELINE_AGG_OPEN_ENDED_MEMBER';

export interface TimelineAggregateRefusal {
  code: TimelineAggregateRefusalCode;
  rule: string;
  unvaluedCount: number;
  sources: string[];
  /** Positions in the input array, so a caller can name the members. */
  memberIndexes: number[];
}

export type TimelineBand =
  | {
      kind: 'band';
      lowMonths: number;
      highMonths: number;
      valuedCount: number;
      /** Members with no state process at all — they wait on nothing. */
      noProcessCount: number;
    }
  /**
   * NOT ONE member has a readable duration and every member that could have had
   * one states that no state process exists. There is no band, because there is
   * no waiting: the cohort's answer is a statement, not a number.
   *
   * This variant is the whole reason the header comment above exists. Returning
   * `{kind:'band', lowMonths: 0, highMonths: 0}` here — which is what
   * `lows.length === 0 ? 0 : Math.max(...)` did — printed "0m" through
   * timelineBandDisplay and read as "instant" to the board, the state regulators
   * and the SEC. Six states carry a 'No state…' timeline outright, and with
   * CLARITY enacted every preempted state becomes noStateProcess, so the whole
   * 40-state NMLS cohort collapsed into it.
   */
  | { kind: 'noProcess'; memberCount: number }
  | { kind: 'refused'; refusals: TimelineAggregateRefusal[]; valuedCount: number };

const TIMELINE_AGG_RULES: Record<TimelineAggregateRefusalCode, string> = {
  TIMELINE_AGG_NO_MEMBERS: 'The cohort is empty. "0 months" over no members is not a finding.',
  TIMELINE_AGG_ABSENT_MEMBER:
    'A member has no timeline recorded at all, so the cohort has no worst case and nothing entitles it to count that member as zero months. This is not the same as a member whose recorded timeline could not be read.',
  TIMELINE_AGG_UNPARSEABLE_MEMBER:
    'A member recorded a timeline that is not expressed in months, so the cohort has no worst case.',
  TIMELINE_AGG_OPEN_ENDED_MEMBER:
    'A member’s timeline is open-ended and has no upper end, so the cohort band has no ceiling to carry.',
};

/**
 * The cohort band. What it IS, stated exactly, because the note printed beside
 * it on the brief used to call it "the slowest jurisdiction's range" and that is
 * false: it is MAX OF THE LOW ENDS to MAX OF THE HIGH ENDS, which can be a range
 * no single jurisdiction has (WY 8-14, TX 6-12, CA 9-12 band to 9–14, and no
 * member's range is 9–14). Read it as "no earlier than the latest low end, no
 * later than the latest high end". Reporting only the upper end — what both old
 * copies did — states a worst case as if it were the expectation.
 *
 * The band assumes applications are filed in PARALLEL. That is an assumption
 * about how LCX would actually file, not something in the dataset, and any
 * surface printing the band must label it as one.
 */
export function cohortTimelineBand(parsed: ParsedTimeline[]): TimelineBand {
  if (parsed.length === 0) {
    return {
      kind: 'refused',
      valuedCount: 0,
      refusals: [
        {
          code: 'TIMELINE_AGG_NO_MEMBERS',
          rule: TIMELINE_AGG_RULES.TIMELINE_AGG_NO_MEMBERS,
          unvaluedCount: 0,
          sources: [],
          memberIndexes: [],
        },
      ],
    };
  }

  // EVERY refusal, not the first found, and absent never collapsed into
  // non-numeric (the house pattern — routes/marketingDesk.ts:1207-1214).
  const buckets = new Map<TimelineAggregateRefusalCode, { sources: string[]; indexes: number[] }>();
  parsed.forEach((p, i) => {
    let code: TimelineAggregateRefusalCode | null = null;
    if (p.kind === 'openEndedMonths') code = 'TIMELINE_AGG_OPEN_ENDED_MEMBER';
    else if (p.kind === 'unparseable') {
      code = p.code === 'TIMELINE_ABSENT'
        ? 'TIMELINE_AGG_ABSENT_MEMBER'
        : 'TIMELINE_AGG_UNPARSEABLE_MEMBER';
    }
    if (!code) return;
    const existing = buckets.get(code);
    if (existing) {
      existing.sources.push(p.source);
      existing.indexes.push(i);
    } else {
      buckets.set(code, { sources: [p.source], indexes: [i] });
    }
  });

  const valued = parsed.filter(
    (p): p is Extract<ParsedTimeline, { kind: 'months' | 'monthRange' }> =>
      p.kind === 'months' || p.kind === 'monthRange'
  );

  if (buckets.size > 0) {
    return {
      kind: 'refused',
      valuedCount: valued.length,
      refusals: [...buckets.entries()].map(([code, { sources, indexes }]) => ({
        code,
        rule: TIMELINE_AGG_RULES[code],
        unvaluedCount: sources.length,
        sources,
        memberIndexes: indexes,
      })),
    };
  }

  const noProcessCount = parsed.filter(p => p.kind === 'noStateProcess').length;
  // Nothing was refused, so every member is either a readable duration or an
  // explicit "no state process". With no readable duration at all there is no
  // band — and 0–0 is not the answer.
  if (valued.length === 0) return { kind: 'noProcess', memberCount: noProcessCount };

  const lows = valued.map(p => (p.kind === 'months' ? p.months : p.lowMonths));
  const highs = valued.map(p => (p.kind === 'months' ? p.months : p.highMonths));
  return {
    kind: 'band',
    lowMonths: Math.max(...lows),
    highMonths: Math.max(...highs),
    valuedCount: valued.length,
    noProcessCount,
  };
}

/** '9–14m', or '12m' when the ends coincide. */
export function timelineBandDisplay(low: number, high: number): string {
  return low === high ? `${low}m` : `${low}–${high}m`;
}

/**
 * What a surface prints in the timeline cell. Never a duration for a cohort that
 * has none. Kept here so the aggregate and its rendering cannot drift apart.
 */
export function timelineBandCell(band: TimelineBand): string {
  if (band.kind === 'band') return timelineBandDisplay(band.lowMonths, band.highMonths);
  if (band.kind === 'noProcess') return 'No state process';
  return band.refusals.map(r => `REFUSED [${r.code}]`).join(' · ');
}

export function toBadgeStatus(status: Status | ReadinessStatus): BadgeStatusKey {
  switch (status) {
    case 'Ready':
    case 'Complete':
      return 'ready';
    case 'Conditional':
    case 'Counsel Review':
      return 'conditional';
    case 'Blocked':
      return 'blocked';
    case 'Deferred':
    case 'Not Started':
      return 'deferred';
    case 'Needs verification':
    case 'In Progress':
    default:
      return 'unverified';
  }
}

export type BadgeStatusKey = 'ready' | 'conditional' | 'blocked' | 'deferred' | 'unverified';

export function tierAbbreviated(tier: Tier): string {
  return tier.replace(/^Tier \d - /, '');
}

export function truncateDomain(domain: string, maxLen: number = 18): string {
  return domain.length > maxLen ? domain.slice(0, maxLen - 2) + '…' : domain;
}
