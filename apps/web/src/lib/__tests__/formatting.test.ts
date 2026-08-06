import { describe, expect, it } from 'vitest';
import {
  cohortTimelineBand,
  formatUSD,
  parseMonetaryValue,
  parseTimeline,
  timelineBandCell,
  timelineBandDisplay,
} from '../formatting';

describe('parseMonetaryValue (deprecated shim)', () => {
  it('reads an exact figure in dollars', () => {
    expect(parseMonetaryValue('$500,000')).toBe(500_000);
    expect(parseMonetaryValue('$75K')).toBe(75_000);
    expect(parseMonetaryValue('$0')).toBe(0);
  });

  it('reads $1M as a million, not as 1', () => {
    // REGRESSION: the old char class stripped M, making its own M branch
    // unreachable, so '$1M' returned 1.
    expect(parseMonetaryValue('$1M')).toBe(1_000_000);
  });

  it('no longer concatenates the two ends of a range', () => {
    // REGRESSION: '$100,000-$500,000' returned 100_000_500_000.
    expect(parseMonetaryValue('$100,000-$500,000')).not.toBe(100_000_500_000);
    expect(parseMonetaryValue('$75K-$100K')).not.toBe(75_100_000);
    // It excludes them instead: 0 here means "not summable", and the
    // deprecation note on the function says so out loud.
    expect(parseMonetaryValue('$100,000-$500,000')).toBe(0);
  });

  it('excludes an open-ended floor rather than reading it as a value', () => {
    expect(parseMonetaryValue('$300K+')).toBe(0);
  });

  it('excludes prose', () => {
    expect(parseMonetaryValue('Institutional OTC only')).toBe(0);
    expect(parseMonetaryValue(undefined)).toBe(0);
  });
});

describe('formatUSD', () => {
  it('does not print a number for a non-finite input', () => {
    expect(formatUSD(NaN)).toBe('—');
    expect(formatUSD(Infinity)).toBe('—');
  });

  it('keeps its existing conventions', () => {
    expect(formatUSD(0)).toBe('$0');
    expect(formatUSD(500)).toBe('$500');
    expect(formatUSD(75_000)).toBe('$75K');
    expect(formatUSD(1_500_000)).toBe('$1.5M');
  });
});

describe('parseTimeline', () => {
  it('carries both ends of a month range', () => {
    expect(parseTimeline('4-6 months')).toEqual({
      kind: 'monthRange',
      lowMonths: 4,
      highMonths: 6,
      source: '4-6 months',
      qualifier: undefined,
    });
  });

  it('reads a single month figure', () => {
    expect(parseTimeline('6 months')).toMatchObject({ kind: 'months', months: 6 });
  });

  it('keeps the qualifying prose attached to the figure', () => {
    expect(parseTimeline('4-7 months (standard) or sandbox entry')).toMatchObject({
      kind: 'monthRange',
      lowMonths: 4,
      highMonths: 7,
      qualifier: '(standard) or sandbox entry',
    });
    expect(parseTimeline('9-12 months (post-framework stabilization)')).toMatchObject({
      kind: 'monthRange',
      qualifier: '(post-framework stabilization)',
    });
  });

  it('reports "no state process" as its own state, not as zero months', () => {
    // These four strings are real estTimeline values. The old parsers turned
    // every one of them into 0, which printed as "0m".
    for (const source of [
      'No state licensing (federal MSB registration only)',
      'No state licensing for non-custodial (federal MSB only)',
      'No state licensing for crypto-only (federal MSB only)',
      'No state MTL requirement',
    ]) {
      expect(parseTimeline(source)).toEqual({ kind: 'noStateProcess', source });
    }
  });

  it('separates absent from non-numeric', () => {
    expect(parseTimeline(undefined)).toMatchObject({ kind: 'unparseable', code: 'TIMELINE_ABSENT' });
    expect(parseTimeline('pending counsel')).toMatchObject({
      kind: 'unparseable',
      code: 'TIMELINE_NOT_NUMERIC',
    });
  });
});

describe('cohortTimelineBand', () => {
  it('bands the cohort instead of reporting only the worst case', () => {
    // The default brief cohort: MT (no state process), WY 8-14, TX 6-12, CA 9-12.
    // The old code printed "Max: 14m" — the upper end of one member's range
    // stated as the cohort figure.
    const band = cohortTimelineBand(
      [
        'No state licensing (federal MSB registration only)',
        '8-14 months',
        '6-12 months',
        '9-12 months',
      ].map(parseTimeline)
    );
    expect(band).toEqual({
      kind: 'band',
      lowMonths: 9,
      highMonths: 14,
      valuedCount: 3,
      noProcessCount: 1,
    });
    expect(timelineBandDisplay(9, 14)).toBe('9–14m');
  });

  it('refuses when a member has no readable timeline', () => {
    const band = cohortTimelineBand(['4-6 months', 'pending counsel'].map(parseTimeline));
    expect(band.kind).toBe('refused');
    if (band.kind !== 'refused') return;
    expect(band.refusals[0]).toMatchObject({
      code: 'TIMELINE_AGG_UNPARSEABLE_MEMBER',
      unvaluedCount: 1,
      sources: ['pending counsel'],
    });
  });

  it('refuses an empty cohort rather than printing 0m', () => {
    const band = cohortTimelineBand([]);
    expect(band.kind).toBe('refused');
    if (band.kind !== 'refused') return;
    expect(band.refusals[0].code).toBe('TIMELINE_AGG_NO_MEMBERS');
  });

  it('does NOT band a cohort where every member has no state process', () => {
    // THIS TEST WAS INVERTED. It used to assert
    //   { kind: 'band', lowMonths: 0, highMonths: 0, noProcessCount: 1 }
    // which pinned the exact failure the file header claims to have fixed:
    // BriefGenerator rendered that band through timelineBandDisplay and printed
    // "0m" — "instant" — with no refusal note, for Clear+MT and for the whole
    // 40-state NMLS cohort under CLARITY. A cohort with no readable duration has
    // no band, and 0–0 is not the answer.
    const band = cohortTimelineBand(['No state MTL requirement'].map(parseTimeline));
    expect(band).toEqual({ kind: 'noProcess', memberCount: 1 });
    expect(band).not.toMatchObject({ kind: 'band' });
    expect(timelineBandCell(band)).toBe('No state process');
    expect(timelineBandCell(band)).not.toMatch(/\d/);
  });

  it('does not band the multi-member all-no-process cohort either', () => {
    const band = cohortTimelineBand(
      [
        'No state MTL requirement',
        'No state licensing (federal MSB registration only)',
      ].map(parseTimeline)
    );
    expect(band).toEqual({ kind: 'noProcess', memberCount: 2 });
  });

  it('separates an absent member from a non-numeric one at the aggregate layer', () => {
    // money.ts rule 4: '' is a figure nobody recorded, 'pending counsel' is a
    // figure someone recorded but did not express in months. One bucket for both
    // is a collapse of two of the three states the doctrine forbids collapsing.
    const absent = cohortTimelineBand([undefined, '4-6 months'].map(parseTimeline));
    const prose = cohortTimelineBand(['pending counsel', '4-6 months'].map(parseTimeline));
    expect(absent.kind).toBe('refused');
    expect(prose.kind).toBe('refused');
    if (absent.kind !== 'refused' || prose.kind !== 'refused') return;
    expect(absent.refusals.map(r => r.code)).toEqual(['TIMELINE_AGG_ABSENT_MEMBER']);
    expect(prose.refusals.map(r => r.code)).toEqual(['TIMELINE_AGG_UNPARSEABLE_MEMBER']);
    expect(absent.refusals[0].code).not.toBe(prose.refusals[0].code);
    expect(absent.refusals[0].memberIndexes).toEqual([0]);
  });

  it('returns EVERY timeline refusal, not the first one found', () => {
    const band = cohortTimelineBand(
      [undefined, 'pending counsel', '18 months+', '4-6 months'].map(parseTimeline)
    );
    expect(band.kind).toBe('refused');
    if (band.kind !== 'refused') return;
    expect(band.refusals.map(r => r.code).sort()).toEqual([
      'TIMELINE_AGG_ABSENT_MEMBER',
      'TIMELINE_AGG_OPEN_ENDED_MEMBER',
      'TIMELINE_AGG_UNPARSEABLE_MEMBER',
    ]);
  });
});

describe('an open-ended timeline is not laundered into an exact one', () => {
  it('reads the trailing + as a floor, not as decoration', () => {
    // REGRESSION: parseTimeline('18 months+') returned
    // { kind:'months', months:18, qualifier:'+' } — a HARD 18 that then entered
    // cohortTimelineBand as if it were bounded. money.ts refuses '$X+' in every
    // aggregate for exactly this reason; the timeline path had no equivalent.
    const parsed = parseTimeline('18 months+');
    expect(parsed).toMatchObject({ kind: 'openEndedMonths', floorMonths: 18 });
    expect(parsed).not.toHaveProperty('months');
  });

  it('treats an open-ended range as open-ended, floored at its recorded high end', () => {
    expect(parseTimeline('12-18 months+')).toMatchObject({
      kind: 'openEndedMonths',
      floorMonths: 18,
    });
  });

  it('refuses the cohort band on an open-ended member — a band needs a ceiling', () => {
    const band = cohortTimelineBand(['18 months+', '4-6 months'].map(parseTimeline));
    expect(band.kind).toBe('refused');
    if (band.kind !== 'refused') return;
    expect(band.refusals[0]).toMatchObject({
      code: 'TIMELINE_AGG_OPEN_ENDED_MEMBER',
      unvaluedCount: 1,
      sources: ['18 months+'],
    });
    expect(band.refusals[0].rule).toMatch(/no upper end/i);
  });

  it('leaves the real corpus untouched — no estTimeline value carries a +', () => {
    // The branch above is latent by design. These are real values.
    for (const source of ['8-14 months', '6-12 months', '9-12 months', '4-6 months']) {
      expect(parseTimeline(source).kind).toBe('monthRange');
    }
  });
});
