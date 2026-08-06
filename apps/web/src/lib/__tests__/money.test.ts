import { describe, expect, it } from 'vitest';
import {
  lowerBoundCents,
  maxMoneyBand,
  parseMoney,
  moneyDisplay,
  sourceLabel,
  sumExactMoney,
  sumMoneyBand,
  type ParsedMoney,
} from '../money';

/**
 * These tests are written against the values that actually live in
 * apps/web/src/data/states.ts and competitors.ts. Every string quoted below is
 * a real field value, not an invented one — a parser that passes on invented
 * inputs and fails on the corpus is worthless.
 */

function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

describe('parseMoney — plain figures', () => {
  it('reads a comma-grouped figure', () => {
    expect(parseMoney('$50,000')).toEqual({ kind: 'exact', cents: cents(50_000), source: '$50,000' });
    expect(parseMoney('$100,000')).toMatchObject({ kind: 'exact', cents: cents(100_000) });
  });

  it('treats $0 as a real figure and not as absent', () => {
    // 8 states carry minNetWorth '$0' (CO, ME, MT, NV, NH, NM, SC, SD). A
    // parser that reports 0 as falsy/absent is how BriefGenerator came to
    // print a $100,000 statutory minimum for states that require nothing.
    expect(parseMoney('$0')).toEqual({ kind: 'exact', cents: 0, source: '$0' });
  });

  it('reads a bare figure with no currency symbol', () => {
    expect(parseMoney('50000')).toMatchObject({ kind: 'exact', cents: cents(50_000) });
  });
});

describe('parseMoney — K/M/B/T suffixes', () => {
  it('reads K', () => {
    expect(parseMoney('$300K')).toMatchObject({ kind: 'exact', cents: cents(300_000) });
    expect(parseMoney('$75k')).toMatchObject({ kind: 'exact', cents: cents(75_000) });
  });

  it('reads M — the branch that was unreachable in formatting.ts', () => {
    // REGRESSION: formatting.ts:5 stripped every char except [0-9.Kk], so the
    // M branch below it could never fire and '$1M' returned 1.
    expect(parseMoney('$1M')).toMatchObject({ kind: 'exact', cents: cents(1_000_000) });
    expect(parseMoney('$1.5M')).toMatchObject({ kind: 'exact', cents: cents(1_500_000) });
  });

  it('reads B and T', () => {
    expect(parseMoney('$6.56B')).toMatchObject({ kind: 'exact', cents: cents(6_560_000_000) });
    expect(parseMoney('$1.6T')).toMatchObject({ kind: 'exact', cents: cents(1_600_000_000_000) });
  });
});

describe('parseMoney — ranges', () => {
  it('carries both ends and picks neither', () => {
    // REGRESSION: formatting.ts turned this into the digit string
    // '100000500000' and returned $100,000,500,000 — a x217,618 overstatement
    // on a surety bond that prints on a memo addressed to the SEC.
    const parsed = parseMoney('$100,000-$500,000');
    expect(parsed).toEqual({
      kind: 'range',
      lowCents: cents(100_000),
      highCents: cents(500_000),
      source: '$100,000-$500,000',
    });
    expect(parsed).not.toMatchObject({ cents: cents(100_000_500_000) });
  });

  it('carries both ends of a suffixed range', () => {
    // REGRESSION: '$75K-$100K' became '75100K' → $75,100,000.
    expect(parseMoney('$75K-$100K')).toEqual({
      kind: 'range',
      lowCents: cents(75_000),
      highCents: cents(100_000),
      source: '$75K-$100K',
    });
  });

  it('reads an en-dash range', () => {
    expect(parseMoney('$50,000 – $100,000')).toMatchObject({
      kind: 'range',
      lowCents: cents(50_000),
      highCents: cents(100_000),
    });
  });

  it('refuses an inverted range rather than silently reordering it', () => {
    expect(parseMoney('$500,000-$100,000')).toMatchObject({
      kind: 'unparseable',
      code: 'MONEY_RANGE_INVERTED',
    });
  });
});

describe('parseMoney — open-ended figures', () => {
  it('returns a floor and no value', () => {
    const parsed = parseMoney('$300K+');
    expect(parsed).toEqual({ kind: 'openEnded', floorCents: cents(300_000), source: '$300K+' });
    // A floor is not a value. Nothing on the result may be read as one.
    expect(parsed).not.toHaveProperty('cents');
  });

  it('handles a comma-grouped floor', () => {
    expect(parseMoney('$150,000+')).toMatchObject({ kind: 'openEnded', floorCents: cents(150_000) });
  });

  it('refuses a range whose upper end is itself open-ended', () => {
    // '$500M-$1B+' has no upper bound at all. Reading the high end as $1B
    // would launder the '+' away.
    expect(parseMoney('$500M-$1B+')).toMatchObject({
      kind: 'unparseable',
      code: 'MONEY_RANGE_OPEN_ENDED',
    });
  });
});

describe('parseMoney — non-numeric prose refuses with the source intact', () => {
  const prose = [
    'N/A (oracle network)',
    'Unknown (declining)',
    'Trillions annually',
    'Institutional OTC only',
    'Not disclosed',
    'Undisclosed (private)',
    'Consolidated into Robinhood',
    'Negligible in US',
    'Largest global',
  ];

  it.each(prose)('refuses %s', (source) => {
    const parsed = parseMoney(source);
    expect(parsed.kind).toBe('unparseable');
    expect((parsed as { source: string }).source).toBe(source);
  });

  it('distinguishes absent from non-numeric', () => {
    expect(parseMoney('')).toMatchObject({ kind: 'unparseable', code: 'MONEY_ABSENT' });
    expect(parseMoney('   ')).toMatchObject({ kind: 'unparseable', code: 'MONEY_ABSENT' });
    expect(parseMoney(undefined)).toMatchObject({ kind: 'unparseable', code: 'MONEY_ABSENT' });
    expect(parseMoney('Unknown (declining)')).toMatchObject({ code: 'MONEY_NOT_NUMERIC' });
  });

  it('refuses prose that merely contains a suffix letter inside a word', () => {
    // competitiveScoring.ts:4 kept B/M/T/K out of English words, so
    // 'Trillions annually' tested positive for the T suffix and
    // 'Institutional OTC only' for both T and K.
    for (const source of ['Trillions annually', 'Institutional OTC only', 'Unknown (declining)']) {
      const parsed = parseMoney(source);
      expect(parsed.kind).toBe('unparseable');
    }
  });
});

describe('the round-trip rule', () => {
  it('refuses a figure buried in prose even though digits are present', () => {
    // REGRESSION: '$500M-$1B+ est. annual' parsed to $500 TRILLION under
    // competitiveScoring.ts (the 't' in 'est.' selected the T multiplier) and
    // poisoned the cohort maximum for every other competitor.
    const parsed = parseMoney('$500M-$1B+ est. annual');
    expect(parsed.kind).toBe('unparseable');
    expect((parsed as { source: string }).source).toBe('$500M-$1B+ est. annual');
  });

  it.each([
    '$120M+ ARR (2023)',
    '$1.67B (H1 2024)',
    '$8.5B+ (firm-wide)',
    '$307B AUC (all asset classes)',
    'USDY: $500M+ AUM',
    '$13B+ originated on Provenance Blockchain',
    'Consolidated into Robinhood ($4.47B total)',
  ])('refuses %s — re-rendering it would not reproduce the source', (source) => {
    expect(parseMoney(source).kind).toBe('unparseable');
  });

  it('renders every accepted figure to the exact string its kind promises', () => {
    // THIS TEST WAS VACUOUS. It read:
    //   expect(moneyDisplay(parsed)).toContain(source.replace(/^\$/,'').slice(0,1))
    // i.e. for '$50,000' it asserted the output contains the character '5', so
    // '$5' passed. Under a heading claiming to verify the round trip. The
    // contract is per KIND, and it is asserted per kind here:
    //   exact  → formatMoney of the parsed cents, character for character
    //   range / openEnded / unparseable → the source string, verbatim
    const exact: Array<[string, string]> = [
      ['$0', '$0'],
      ['$50,000', '$50,000'],
      ['$75K', '$75,000'],
      ['$1.5M', '$1,500,000'],
      ['$6.56B', '$6,560,000,000'],
      ['50000', '$50,000'],
    ];
    for (const [source, rendered] of exact) {
      const parsed = parseMoney(source);
      expect(parsed.kind).toBe('exact');
      if (parsed.kind !== 'exact') continue;
      expect(moneyDisplay(parsed)).toBe(rendered);
      // The rendered figure carries the same AMOUNT: re-parsing it must land on
      // the same cents. This is the check that catches a digit dropped or added.
      expect(parseMoney(moneyDisplay(parsed))).toMatchObject({ cents: parsed.cents });
    }

    for (const source of ['$100,000-$500,000', '$75K-$100K', '$300K+', '$150,000+']) {
      const parsed = parseMoney(source);
      expect(parsed.kind).not.toBe('unparseable');
      expect(parsed.kind).not.toBe('exact');
      // Nothing is chosen, nothing is reformatted: the reader gets the record.
      expect(moneyDisplay(parsed)).toBe(source);
    }

    for (const source of ['Not disclosed', '$120M+ ARR (2023)']) {
      expect(moneyDisplay(parseMoney(source))).toBe(source);
    }
  });

  it('does not claim to give back the source NOTATION for an exact figure', () => {
    // Stated explicitly so nobody re-writes the overclaim: '$75K' displays as
    // '$75,000'. Same amount, different notation, and that is the formatting
    // bible's job — not a laundering, and not a character-for-character round
    // trip either.
    expect(moneyDisplay(parseMoney('$75K'))).not.toBe('$75K');
    expect(moneyDisplay(parseMoney('$75K'))).toBe('$75,000');
  });

  it('refuses sub-dollar precision rather than rounding it into a different figure', () => {
    // formatMoney renders whole dollars, so '$0.5' used to be accepted as exact
    // and printed '$1' — a 100% overstatement produced by the display layer.
    expect(parseMoney('$0.5')).toMatchObject({
      kind: 'unparseable',
      code: 'MONEY_SUB_DOLLAR_PRECISION',
    });
    expect(parseMoney('$0.001').kind).toBe('unparseable');
    expect(parseMoney('$1,000.25').kind).toBe('unparseable');
    expect(moneyDisplay(parseMoney('$0.5'))).toBe('$0.5');
    // A decimal that lands on whole dollars is still fine.
    expect(parseMoney('$1.5M')).toMatchObject({ kind: 'exact' });
  });

  it('refuses a magnitude the arithmetic cannot hold exactly', () => {
    // $9,007,199,254,740,993 is 900,719,925,474,099,300 cents, past
    // Number.MAX_SAFE_INTEGER, and displayed as ...992 — one dollar short of
    // what was recorded, silently.
    expect(parseMoney('$9,007,199,254,740,993')).toMatchObject({
      kind: 'unparseable',
      code: 'MONEY_UNSAFE_MAGNITUDE',
    });
    // The largest figure in the corpus is nowhere near the limit.
    expect(parseMoney('$1.6T')).toMatchObject({ kind: 'exact' });
  });

  it('refuses malformed thousands grouping', () => {
    expect(parseMoney('$1,00,000').kind).toBe('unparseable');
  });
});

describe('moneyDisplay', () => {
  it('prints the source string for everything that is not an exact figure', () => {
    expect(moneyDisplay(parseMoney('$100,000-$500,000'))).toBe('$100,000-$500,000');
    expect(moneyDisplay(parseMoney('$300K+'))).toBe('$300K+');
    expect(moneyDisplay(parseMoney('Unknown (declining)'))).toBe('Unknown (declining)');
  });

  it('renders an exact figure through the formatting bible', () => {
    expect(moneyDisplay(parseMoney('$50,000'))).toBe('$50,000');
    expect(moneyDisplay(parseMoney('$0'))).toBe('$0');
  });

  it('marks an absent figure as absent rather than printing nothing', () => {
    expect(moneyDisplay(parseMoney(undefined))).toBe('NOT RECORDED');
  });
});

describe('sumExactMoney', () => {
  it('totals exact figures, zero included', () => {
    const result = sumExactMoney(['$0', '$500,000', '$500,000']);
    expect(result).toMatchObject({ kind: 'total', cents: cents(1_000_000), valuedCount: 3 });
  });

  it('refuses a cohort containing an open-ended member and names the count', () => {
    // The default brief cohort (MT, WY, TX, CA) has estCost
    // '$0', '$400K+', '$150K+', '$300K+' — 3 of 4 unvaluable.
    const result = sumExactMoney(['$0', '$400K+', '$150K+', '$300K+']);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    const openEnded = result.refusals.find(r => r.code === 'MONEY_AGG_OPEN_ENDED_MEMBER');
    expect(openEnded).toBeDefined();
    expect(openEnded!.unvaluedCount).toBe(3);
    expect(openEnded!.sources).toEqual(['$400K+', '$150K+', '$300K+']);
    expect(openEnded!.rule).toMatch(/open-ended/i);
    expect(result.valuedCount).toBe(1);
  });

  it('returns EVERY refusal, not the first one found', () => {
    const result = sumExactMoney(['$300K+', '$75K-$100K', 'Unknown (declining)', '$50,000']);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    expect(result.refusals.map(r => r.code).sort()).toEqual([
      'MONEY_AGG_OPEN_ENDED_MEMBER',
      'MONEY_AGG_RANGE_MEMBER',
      'MONEY_AGG_UNPARSEABLE_MEMBER',
    ]);
  });

  it('refuses an empty cohort instead of reporting $0', () => {
    const result = sumExactMoney([]);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    expect(result.refusals[0].code).toBe('MONEY_AGG_NO_MEMBERS');
  });

  it('separates a genuine zero total from an empty cohort', () => {
    expect(sumExactMoney(['$0', '$0'])).toMatchObject({ kind: 'total', cents: 0, valuedCount: 2 });
  });
});

describe('sumMoneyBand', () => {
  it('adds ranges as bounds without choosing an end', () => {
    // $50,000-$100,000 plus $100,000-$300,000 is $150,000 to $400,000. Which
    // end a surety bond lands on depends on transmission volume this repo does
    // not hold, so both are carried.
    const result = sumMoneyBand(['$50,000-$100,000', '$100,000-$300,000']);
    expect(result).toMatchObject({
      kind: 'band',
      lowCents: cents(150_000),
      highCents: cents(400_000),
      valuedCount: 2,
    });
  });

  it('collapses to a point band when every member is exact', () => {
    expect(sumMoneyBand(['$0', '$500,000', '$500,000'])).toMatchObject({
      kind: 'band',
      lowCents: cents(1_000_000),
      highCents: cents(1_000_000),
    });
  });

  it('still refuses on an open-ended member — a band has an upper bound', () => {
    const result = sumMoneyBand(['$50,000-$100,000', '$150,000+']);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    expect(result.refusals.map(r => r.code)).toEqual(['MONEY_AGG_OPEN_ENDED_MEMBER']);
    expect(result.refusals[0].unvaluedCount).toBe(1);
  });

  it('refuses on unparseable prose', () => {
    const result = sumMoneyBand(['$50,000', 'Not disclosed']);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    expect(result.refusals[0].code).toBe('MONEY_AGG_UNPARSEABLE_MEMBER');
  });
});

describe('the three states are not collapsed at the aggregate layer', () => {
  it('gives an absent member a different code from a withheld one', () => {
    // money.ts rule 4: "'' is a figure nobody recorded; 'Not disclosed' is a
    // figure someone recorded as withheld … must never collapse". Both used to
    // land in MONEY_AGG_UNPARSEABLE_MEMBER.
    const absent = sumMoneyBand(['', '$50,000']);
    const withheld = sumMoneyBand(['Not disclosed', '$50,000']);
    expect(absent.kind).toBe('refused');
    expect(withheld.kind).toBe('refused');
    if (absent.kind !== 'refused' || withheld.kind !== 'refused') return;
    expect(absent.refusals.map(r => r.code)).toEqual(['MONEY_AGG_ABSENT_MEMBER']);
    expect(withheld.refusals.map(r => r.code)).toEqual(['MONEY_AGG_UNPARSEABLE_MEMBER']);
    expect(absent.refusals[0].code).not.toBe(withheld.refusals[0].code);
  });

  it('reports both codes when both kinds of gap are present', () => {
    const result = sumMoneyBand(['', 'Not disclosed', '$50,000']);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    expect(result.refusals.map(r => r.code).sort()).toEqual([
      'MONEY_AGG_ABSENT_MEMBER',
      'MONEY_AGG_UNPARSEABLE_MEMBER',
    ]);
    // …and each names only its own member, so no bucket prints the other's
    // source string.
    const absentBucket = result.refusals.find(r => r.code === 'MONEY_AGG_ABSENT_MEMBER')!;
    expect(absentBucket.sources).toEqual(['']);
    expect(absentBucket.memberIndexes).toEqual([0]);
    const proseBucket = result.refusals.find(r => r.code === 'MONEY_AGG_UNPARSEABLE_MEMBER')!;
    expect(proseBucket.sources).toEqual(['Not disclosed']);
    expect(proseBucket.memberIndexes).toEqual([1]);
  });

  it('labels an absent source so it does not print as a bare comma', () => {
    // The page prints "Values not summed: <sources>". With '' in the list that
    // read "Values not summed: , Not disclosed." — the unrecorded member was a
    // comma.
    expect(sourceLabel('')).toBe('NOT RECORDED');
    expect(sourceLabel('   ')).toBe('NOT RECORDED');
    expect(sourceLabel('$400K+')).toBe('$400K+');
  });

  it('carries the member position of every refused figure', () => {
    // A caller merging refusals across several columns needs this to count
    // DISTINCT jurisdictions; unvaluedCount counts FIGURES and printed
    // "(2 of 1 jurisdictions)" when it was used as a member count.
    const result = sumMoneyBand(['$50,000', '$400K+', '$100,000', '$300K+']);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    const openEnded = result.refusals.find(r => r.code === 'MONEY_AGG_OPEN_ENDED_MEMBER')!;
    expect(openEnded.memberIndexes).toEqual([1, 3]);
    expect(openEnded.unvaluedCount).toBe(2);
  });
});

describe('maxMoneyBand', () => {
  it('takes the cohort ceiling, not the total', () => {
    // The default brief cohort's minNetWorth: $0, $400,000, $500,000, $500,000.
    expect(maxMoneyBand(['$0', '$400,000', '$500,000', '$500,000'])).toMatchObject({
      kind: 'band',
      lowCents: cents(500_000),
      highCents: cents(500_000),
      valuedCount: 4,
    });
  });

  it('carries a range member into both ends of the ceiling', () => {
    expect(maxMoneyBand(['$100,000', '$100,000-$500,000'])).toMatchObject({
      kind: 'band',
      lowCents: cents(100_000),
      highCents: cents(500_000),
    });
  });

  it('refuses on an open-ended member', () => {
    const result = maxMoneyBand(['$100,000', '$150,000+']);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    expect(result.refusals[0].code).toBe('MONEY_AGG_OPEN_ENDED_MEMBER');
  });

  it('refuses an empty cohort', () => {
    expect(maxMoneyBand([])).toMatchObject({ kind: 'refused' });
  });
});

describe('lowerBoundCents', () => {
  it('gives the low end of a range and the floor of an open-ended figure', () => {
    expect(lowerBoundCents(parseMoney('$100,000-$500,000'))).toBe(cents(100_000));
    expect(lowerBoundCents(parseMoney('$300K+'))).toBe(cents(300_000));
    expect(lowerBoundCents(parseMoney('$50,000'))).toBe(cents(50_000));
    expect(lowerBoundCents(parseMoney('$0'))).toBe(0);
  });

  it('has no bound to give for prose', () => {
    expect(lowerBoundCents(parseMoney('Not disclosed'))).toBeNull();
    expect(lowerBoundCents(parseMoney(''))).toBeNull();
  });
});

describe('the corpus parses without a single silent wrong number', () => {
  // Every distinct estCost / suretyBond / minNetWorth value in states.ts,
  // with the classification each MUST receive.
  const corpus: Array<[string, ParsedMoney['kind']]> = [
    ['$0', 'exact'],
    ['$50K', 'exact'],
    ['$75K', 'exact'],
    ['$100K', 'exact'],
    ['$25,000', 'exact'],
    ['$50,000', 'exact'],
    ['$100,000', 'exact'],
    ['$125,000', 'exact'],
    ['$150,000', 'exact'],
    ['$400,000', 'exact'],
    ['$500,000', 'exact'],
    ['$50K-$75K', 'range'],
    ['$75K-$100K', 'range'],
    ['$100K-$150K', 'range'],
    ['$50,000-$100,000', 'range'],
    ['$50,000-$150,000', 'range'],
    ['$50,000-$300,000', 'range'],
    ['$100,000-$250,000', 'range'],
    ['$100,000-$300,000', 'range'],
    ['$100,000-$500,000', 'range'],
    ['$150,000-$500,000', 'range'],
    ['$100K+', 'openEnded'],
    ['$125K+', 'openEnded'],
    ['$150K+', 'openEnded'],
    ['$175K+', 'openEnded'],
    ['$200K+', 'openEnded'],
    ['$300K+', 'openEnded'],
    ['$400K+', 'openEnded'],
    ['$500K+', 'openEnded'],
    ['$150,000+', 'openEnded'],
  ];

  it.each(corpus)('%s is %s', (source, kind) => {
    expect(parseMoney(source).kind).toBe(kind);
  });
});
