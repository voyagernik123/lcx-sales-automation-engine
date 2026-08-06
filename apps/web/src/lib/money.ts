/**
 * The one money parser.
 *
 * Every monetary figure in this repo arrives as a human-written string in a
 * data file: '$75K', '$100,000-$500,000', '$300K+', 'Institutional OTC only'.
 * Four separate ad-hoc parsers used to read those strings and all four were
 * wrong in different directions. What they got wrong, measured:
 *
 *   - formatting.ts stripped every character except [0-9.Kk], which made its
 *     own M branch unreachable ('$1M' → 1) and turned '$100,000-$500,000' into
 *     the digit string '100000500000' → $100,000,500,000. On a surety bond
 *     that is a x217,618 overstatement, and it printed on a memo whose default
 *     addressees are the board, state regulators and the SEC.
 *   - competitiveScoring.ts kept B/M/T/K so that suffix tests matched the
 *     letters inside English words: 'Trillions annually' tested positive for
 *     the T multiplier, and '$500M-$1B+ est. annual' parsed to $500 trillion
 *     because of the 't' in 'est.'.
 *   - BriefGenerator.tsx carried three more copies, none identical.
 *
 * The rules this module enforces, in order of how much they matter:
 *
 * 1. THE ROUND-TRIP RULE, stated precisely, because an earlier draft of this
 *    comment overclaimed it and the overclaim is the kind of thing this module
 *    exists to stop. There are TWO distinct checks and neither is "the display
 *    equals the source":
 *
 *      (a) NOTATION ROUND TRIP, applied at parse time. Every token is
 *          re-rendered from what was actually captured — currency mark,
 *          grouping, decimal, magnitude suffix, range separator, trailing '+' —
 *          and the rebuilt string must equal the whitespace-normalised source
 *          character for character. A figure with trailing prose, a stray
 *          separator or malformed grouping fails and refuses. This is what stops
 *          a digit-scavenging parser inventing a number out of a sentence.
 *      (b) VALUE ROUND TRIP, applied to the figure the surface will print.
 *          moneyDisplay routes an exact figure through formatMoney, which
 *          renders WHOLE DOLLARS, so a figure carrying sub-dollar precision
 *          would reach the reader as a different amount than was recorded
 *          ('$0.5' would print '$1'). It refuses instead. So does a magnitude
 *          past Number.MAX_SAFE_INTEGER cents, where the arithmetic itself
 *          drifts.
 *
 *    What is explicitly NOT claimed: moneyDisplay does not give back the source
 *    NOTATION. parseMoney('$75K') displays '$75,000' — the same amount written
 *    differently, which is the formatting bible's job and not a laundering. Only
 *    a figure that is not exact prints its source string verbatim.
 * 2. RANGES CARRY BOTH ENDS. Which end of '$100,000-$500,000' applies is a
 *    legal question that depends on transmission volume this repo does not
 *    hold. Callers must state which end they mean, or refuse. Nothing here
 *    picks one.
 * 3. AN OPEN-ENDED FIGURE HAS NO VALUE BY CONSTRUCTION. '$300K+' has a floor
 *    and no ceiling. 14 of the 50 estCost values and 1 surety bond are written
 *    this way, so any cohort aggregate containing one is a refusal, not a
 *    number.
 * 4. ABSENT AND NON-NUMERIC ARE DIFFERENT. '' is a figure nobody recorded;
 *    'Not disclosed' is a figure someone recorded as withheld. They carry
 *    different codes and must never collapse into 0.
 */

import { formatMoney } from '@/lib/format';

export type MoneyRefusalCode =
  /** Nothing was recorded in the field at all. */
  | 'MONEY_ABSENT'
  /** Something was recorded, but it is not a monetary figure. */
  | 'MONEY_NOT_NUMERIC'
  /** Digits are present but re-rendering them would not reproduce the source. */
  | 'MONEY_ROUND_TRIP_FAILED'
  /** A range written high-to-low. Reordering it would be a guess. */
  | 'MONEY_RANGE_INVERTED'
  /** A range whose upper end is itself open-ended, e.g. '$500M-$1B+'. */
  | 'MONEY_RANGE_OPEN_ENDED'
  /** Sub-dollar precision, which the whole-dollar renderer would round away. */
  | 'MONEY_SUB_DOLLAR_PRECISION'
  /** Past Number.MAX_SAFE_INTEGER cents — the arithmetic itself would drift. */
  | 'MONEY_UNSAFE_MAGNITUDE';

export type ParsedMoney =
  | { kind: 'exact'; cents: number; source: string }
  | { kind: 'range'; lowCents: number; highCents: number; source: string }
  | { kind: 'openEnded'; floorCents: number; source: string }
  | { kind: 'unparseable'; source: string; code: MoneyRefusalCode; rule: string };

/** The rule text each refusal cites. A code without a rule is an error message. */
const RULES: Record<MoneyRefusalCode, string> = {
  MONEY_ABSENT: 'No figure was recorded for this field. An absent figure is not zero.',
  MONEY_NOT_NUMERIC:
    'The recorded value is prose, not a monetary figure. It is printed verbatim and excluded from every sum.',
  MONEY_ROUND_TRIP_FAILED:
    'Re-rendering the digits found in this value would not reproduce the source string, so no reading of it is safe. The source is printed verbatim.',
  MONEY_RANGE_INVERTED:
    'The range is written high-to-low. Reordering it would substitute a guess for the recorded value.',
  MONEY_RANGE_OPEN_ENDED:
    'The upper end of the range is itself open-ended, so the range has no ceiling to carry.',
  MONEY_SUB_DOLLAR_PRECISION:
    'The figure carries sub-dollar precision and every money surface in this platform renders whole dollars, so printing it would show the reader a different amount than was recorded.',
  MONEY_UNSAFE_MAGNITUDE:
    'The figure is larger than can be held exactly in this platform’s integer arithmetic, so any sum or comparison involving it would drift silently.',
};

const SUFFIX_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  t: 1_000_000_000_000,
};

/**
 * One number token: optional '$', an integer part either bare or grouped in
 * threes, an optional decimal, an optional single-letter magnitude suffix.
 * Anchored — a token is the WHOLE string it is handed, never a match inside it.
 */
const TOKEN_RE = /^(\$?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?([KkMmBbTt]?)$/;

/** '$100,000-$500,000' / '$50,000 – $100,000'. The separator is captured verbatim
 *  so the round trip can rebuild the source exactly, spacing included. */
const RANGE_RE = /^(.+?)(\s*[-–—]\s*)(.+)$/;

interface Token {
  /**
   * Cents. 0 whenever `fault` is set — a faulted token has no usable value and
   * callers must check `fault` before reading this.
   */
  cents: number;
  /** What this token renders back to. Compared against the source. */
  canonical: string;
  /**
   * The VALUE round trip (rule 1b). A token can satisfy the notation check and
   * still be a figure this platform cannot print or add without changing it.
   */
  fault: MoneyRefusalCode | null;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function parseToken(text: string): Token | null {
  const m = TOKEN_RE.exec(text);
  if (!m) return null;
  const [, dollar, intPart, decPart, suffix] = m;
  const hadCommas = intPart.includes(',');
  const digits = intPart.replace(/,/g, '');
  const canonical = `${dollar}${hadCommas ? group(digits) : digits}${decPart ?? ''}${suffix}`;
  const faulted = (fault: MoneyRefusalCode): Token => ({ cents: 0, canonical, fault });

  /*
   * EXACT ARITHMETIC, no float anywhere on this path. The previous version did
   * `Math.round(parseFloat(digits + decPart) * multiplier * 100)`, and the round
   * silently absorbed the very precision loss the rule exists to catch: '$0.001'
   * came out as 0 cents and was returned as an EXACT $0 — a recorded figure
   * turned into a different figure, with no refusal.
   *
   * Everything here is an integer scaled by a power of ten, so BigInt reads it
   * without drift and the divisibility test below is the honest question: is
   * this a whole number of dollars, which is the only thing formatMoney can
   * render?
   */
  const decimals = decPart ? decPart.length - 1 : 0;
  const mantissa = BigInt(digits + (decPart ? decPart.slice(1) : ''));
  const multiplier = BigInt(suffix ? SUFFIX_MULTIPLIER[suffix.toLowerCase()] : 1);
  const scale = BigInt(10) ** BigInt(decimals);
  const scaledDollars = mantissa * multiplier;
  if (scaledDollars % scale !== BigInt(0)) return faulted('MONEY_SUB_DOLLAR_PRECISION');
  const cents = (scaledDollars / scale) * BigInt(100);
  if (cents > MAX_SAFE_CENTS) return faulted('MONEY_UNSAFE_MAGNITUDE');
  return { cents: Number(cents), canonical, fault: null };
}

function tokenFault(token: Token): MoneyRefusalCode | null {
  return token.fault;
}

function refuse(source: string, code: MoneyRefusalCode): ParsedMoney {
  return { kind: 'unparseable', source, code, rule: RULES[code] };
}

/**
 * Read a human-written monetary string. Never throws, never guesses, never
 * returns a number it cannot reproduce.
 */
export function parseMoney(raw: string | null | undefined): ParsedMoney {
  const source = raw ?? '';
  const normalized = source.trim().replace(/\s+/g, ' ');
  if (normalized === '') return refuse(source, 'MONEY_ABSENT');

  // A trailing '+' is the open-ended marker. Strip it before tokenising and
  // keep it verbatim so the round trip can put it back.
  const plusMatch = /(\s*\+)$/.exec(normalized);
  const plus = plusMatch ? plusMatch[1] : '';
  const core = plus ? normalized.slice(0, normalized.length - plus.length) : normalized;

  const rangeMatch = RANGE_RE.exec(core);
  if (rangeMatch) {
    const [, leftText, separator, rightText] = rangeMatch;
    const low = parseToken(leftText);
    const high = parseToken(rightText);
    if (!low || !high) {
      // Digits somewhere in prose ('$500M-$1B+ est. annual') land here.
      return refuse(source, /\d/.test(core) ? 'MONEY_ROUND_TRIP_FAILED' : 'MONEY_NOT_NUMERIC');
    }
    if (`${low.canonical}${separator}${high.canonical}${plus}` !== normalized) {
      return refuse(source, 'MONEY_ROUND_TRIP_FAILED');
    }
    if (plus) return refuse(source, 'MONEY_RANGE_OPEN_ENDED');
    const rangeFault = tokenFault(low) ?? tokenFault(high);
    if (rangeFault) return refuse(source, rangeFault);
    if (low.cents > high.cents) return refuse(source, 'MONEY_RANGE_INVERTED');
    return { kind: 'range', lowCents: low.cents, highCents: high.cents, source };
  }

  const token = parseToken(core);
  if (!token) {
    return refuse(source, /\d/.test(core) ? 'MONEY_ROUND_TRIP_FAILED' : 'MONEY_NOT_NUMERIC');
  }
  if (`${token.canonical}${plus}` !== normalized) {
    return refuse(source, 'MONEY_ROUND_TRIP_FAILED');
  }
  const fault = tokenFault(token);
  if (fault) return refuse(source, fault);
  if (plus) return { kind: 'openEnded', floorCents: token.cents, source };
  return { kind: 'exact', cents: token.cents, source };
}

/** True only for a figure that may enter arithmetic. */
export function isExact(parsed: ParsedMoney): parsed is Extract<ParsedMoney, { kind: 'exact' }> {
  return parsed.kind === 'exact';
}

/**
 * What a surface prints for one figure. An exact figure renders through the
 * formatting bible; everything else prints the source string, because the
 * source string is the only thing we know to be true about it.
 */
export function moneyDisplay(parsed: ParsedMoney): string {
  if (parsed.kind === 'exact') return formatMoney(parsed.cents / 100, { exact: true });
  if (parsed.kind === 'unparseable' && parsed.code === 'MONEY_ABSENT') return 'NOT RECORDED';
  return parsed.source;
}

// ── Cohort aggregates ──────────────────────────────────────────────────────

export type MoneyAggregateRefusalCode =
  | 'MONEY_AGG_NO_MEMBERS'
  | 'MONEY_AGG_OPEN_ENDED_MEMBER'
  | 'MONEY_AGG_RANGE_MEMBER'
  /** A member's field is EMPTY — nobody recorded a figure at all. */
  | 'MONEY_AGG_ABSENT_MEMBER'
  /** A member recorded something that is not a readable figure. */
  | 'MONEY_AGG_UNPARSEABLE_MEMBER';

export interface MoneyAggregateRefusal {
  code: MoneyAggregateRefusalCode;
  rule: string;
  /**
   * How many FIGURES this refusal accounts for. It is NOT a count of cohort
   * members: one member can contribute a refused fee AND a refused bond, and a
   * caller that merges refusals across columns will see this climb past the
   * cohort size. A surface printing "N of M jurisdictions" off this number
   * printed "(2 of 1 jurisdictions)" on a memo to the SEC. Use
   * `memberIndexes.length` for a member count.
   */
  unvaluedCount: number;
  /** Their source strings, so the surface can show what it could not value. */
  sources: string[];
  /**
   * The positions in the input array that this refusal came from, so a caller
   * merging refusals across several columns can count DISTINCT members. Indexes
   * are per-call; a caller merging calls must map them to its own member ids.
   */
  memberIndexes: number[];
}

/**
 * What a surface prints for one refused source string. An absent figure has no
 * source string, and printing '' puts a bare comma in a list of values the
 * reader is told were not summed.
 */
export function sourceLabel(source: string): string {
  return source.trim() === '' ? 'NOT RECORDED' : source;
}

export type MoneyTotal =
  | { kind: 'total'; cents: number; valuedCount: number }
  | { kind: 'refused'; refusals: MoneyAggregateRefusal[]; valuedCount: number };

export type MoneyBandTotal =
  | { kind: 'band'; lowCents: number; highCents: number; valuedCount: number }
  | { kind: 'refused'; refusals: MoneyAggregateRefusal[]; valuedCount: number };

const AGG_RULES: Record<MoneyAggregateRefusalCode, string> = {
  MONEY_AGG_NO_MEMBERS:
    'The cohort is empty. A total of $0 over no members would read as a finding; it is not one.',
  MONEY_AGG_OPEN_ENDED_MEMBER:
    'A member is open-ended ($X+) and has no upper bound, so the cohort has no total and no band.',
  MONEY_AGG_RANGE_MEMBER:
    'A member is a range and this total admits only single figures. Which end applies is a legal question this repo cannot answer.',
  MONEY_AGG_ABSENT_MEMBER:
    'A member has no figure recorded at all, so there is nothing to add and nothing that entitles the aggregate to treat it as zero. This is not the same as a member whose recorded value could not be read.',
  MONEY_AGG_UNPARSEABLE_MEMBER:
    'A member recorded a value that could not be read as a monetary figure, so it can be neither added nor treated as zero.',
};

function collectRefusals(parsed: ParsedMoney[], allowRanges: boolean): MoneyAggregateRefusal[] {
  const buckets = new Map<MoneyAggregateRefusalCode, { sources: string[]; indexes: number[] }>();
  const add = (code: MoneyAggregateRefusalCode, source: string, index: number) => {
    const existing = buckets.get(code);
    if (existing) {
      existing.sources.push(source);
      existing.indexes.push(index);
    } else {
      buckets.set(code, { sources: [source], indexes: [index] });
    }
  };

  // Every refusal, not the first one found (the house pattern —
  // routes/marketingDesk.ts:1207-1214).
  //
  // THREE STATES ARE NEVER COLLAPSED (money.ts rule 4): a member whose field is
  // empty and a member whose recorded value is prose reach the aggregate under
  // DIFFERENT codes, because '' is a figure nobody recorded and 'Not disclosed'
  // is a figure someone recorded as withheld.
  parsed.forEach((p, i) => {
    if (p.kind === 'openEnded') add('MONEY_AGG_OPEN_ENDED_MEMBER', p.source, i);
    else if (p.kind === 'unparseable') {
      add(
        p.code === 'MONEY_ABSENT' ? 'MONEY_AGG_ABSENT_MEMBER' : 'MONEY_AGG_UNPARSEABLE_MEMBER',
        p.source,
        i
      );
    } else if (p.kind === 'range' && !allowRanges) add('MONEY_AGG_RANGE_MEMBER', p.source, i);
  });

  return [...buckets.entries()].map(([code, { sources, indexes }]) => ({
    code,
    rule: AGG_RULES[code],
    unvaluedCount: sources.length,
    sources,
    memberIndexes: indexes,
  }));
}

function noMembers(): MoneyAggregateRefusal[] {
  return [
    {
      code: 'MONEY_AGG_NO_MEMBERS',
      rule: AGG_RULES.MONEY_AGG_NO_MEMBERS,
      unvaluedCount: 0,
      sources: [],
      memberIndexes: [],
    },
  ];
}

/**
 * Sum a cohort of figures. Strict: anything that is not a single exact figure
 * refuses the whole total. Use this where one number will be printed.
 */
export function sumExactMoney(sources: Array<string | null | undefined>): MoneyTotal {
  const parsed = sources.map(parseMoney);
  const exact = parsed.filter(isExact);
  if (parsed.length === 0) return { kind: 'refused', refusals: noMembers(), valuedCount: 0 };
  const refusals = collectRefusals(parsed, false);
  if (refusals.length > 0) return { kind: 'refused', refusals, valuedCount: exact.length };
  return {
    kind: 'total',
    cents: exact.reduce((sum, p) => sum + p.cents, 0),
    valuedCount: exact.length,
  };
}

/**
 * Sum a cohort as a BAND: the low ends added together and the high ends added
 * together. Calling this is the caller stating "I mean the band, not a figure"
 * — it is the only sanctioned way to aggregate ranges. Open-ended and
 * unparseable members still refuse, because a band needs an upper bound.
 */
export function sumMoneyBand(sources: Array<string | null | undefined>): MoneyBandTotal {
  const parsed = sources.map(parseMoney);
  if (parsed.length === 0) return { kind: 'refused', refusals: noMembers(), valuedCount: 0 };
  const refusals = collectRefusals(parsed, true);
  const valued = parsed.filter(
    (p): p is Extract<ParsedMoney, { kind: 'exact' | 'range' }> =>
      p.kind === 'exact' || p.kind === 'range'
  );
  if (refusals.length > 0) return { kind: 'refused', refusals, valuedCount: valued.length };
  let lowCents = 0;
  let highCents = 0;
  for (const p of valued) {
    if (p.kind === 'exact') {
      lowCents += p.cents;
      highCents += p.cents;
    } else {
      lowCents += p.lowCents;
      highCents += p.highCents;
    }
  }
  return { kind: 'band', lowCents, highCents, valuedCount: valued.length };
}

/**
 * The cohort CEILING as a band: the largest low end to the largest high end.
 * Used where a requirement is a maximum rather than a sum — a net-worth reserve
 * covering several states is the highest single requirement, not their total.
 * Refuses on the same members sumMoneyBand refuses on.
 */
export function maxMoneyBand(sources: Array<string | null | undefined>): MoneyBandTotal {
  const parsed = sources.map(parseMoney);
  if (parsed.length === 0) return { kind: 'refused', refusals: noMembers(), valuedCount: 0 };
  const refusals = collectRefusals(parsed, true);
  const valued = parsed.filter(
    (p): p is Extract<ParsedMoney, { kind: 'exact' | 'range' }> =>
      p.kind === 'exact' || p.kind === 'range'
  );
  if (refusals.length > 0) return { kind: 'refused', refusals, valuedCount: valued.length };
  const lows = valued.map(p => (p.kind === 'exact' ? p.cents : p.lowCents));
  const highs = valued.map(p => (p.kind === 'exact' ? p.cents : p.highCents));
  return {
    kind: 'band',
    lowCents: Math.max(...lows),
    highCents: Math.max(...highs),
    valuedCount: valued.length,
  };
}

/**
 * The lower bound of a figure, in cents, or null when there is not even a
 * bound. A range gives its low end, an open-ended figure gives its floor.
 *
 * This is the ONLY sanctioned way to get a single number out of a range or an
 * open-ended figure, and calling it is the caller stating that it means "at
 * least this much". A surface built on it must say so — a lower bound
 * presented as a value is exactly the laundering this module exists to stop.
 * Never use it to print a dollar total; use sumExactMoney/sumMoneyBand.
 */
export function lowerBoundCents(parsed: ParsedMoney): number | null {
  switch (parsed.kind) {
    case 'exact':
      return parsed.cents;
    case 'range':
      return parsed.lowCents;
    case 'openEnded':
      return parsed.floorCents;
    default:
      return null;
  }
}

/** '$1,000,000' for a point band, '$150,000 – $400,000' when the ends differ. */
export function bandDisplay(low: number, high: number): string {
  const lo = formatMoney(low / 100, { exact: true });
  if (low === high) return lo;
  return `${lo} – ${formatMoney(high / 100, { exact: true })}`;
}

/** One line a surface can print in place of the number it refused to compute. */
export function aggregateRefusalLine(refusals: MoneyAggregateRefusal[]): string {
  return refusals
    .map(r =>
      r.code === 'MONEY_AGG_NO_MEMBERS'
        ? `REFUSED [${r.code}]`
        : `REFUSED [${r.code}] ×${r.unvaluedCount}`
    )
    .join(' · ');
}
