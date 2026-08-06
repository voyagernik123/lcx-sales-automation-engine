import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLOSED_BOOK_WINDOW_AS_MEASURED,
  MARKET_DATA_IS_NOT_A_PRICE,
  MARK_EXCLUDED_LINE_ITEM,
  MARK_FEE_LINE_ITEMS,
  MARK_MIN_COMPARABLES,
  MARK_REFUSAL_CODES,
  censusOfComparables,
  environmentLabelFromDatabaseUrl,
  isFeeMark,
  isMarkRefusalCode,
  isStratumResolved,
  markToContract,
  observedFeeOf,
  sameStratum,
  stratumKey,
  stratumOf,
  type MarkComparable,
  type MarkStratumFeatures,
} from './mark.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THESE TESTS WERE WRITTEN BEFORE THE PRICES CHANGED.
 * ══════════════════════════════════════════════════════════════════════════════
 *  This lane changes a number a human quotes to a customer. A test written after the
 *  change proves the code does what the code does; these are written to the contract —
 *  the median is a real contract's total, absence refuses rather than rendering 0, and
 *  the stratum is never widened to reach K.
 *
 *  THE PRODUCTION FIGURES BELOW ARE FIXTURES, NOT MEASUREMENTS. Nothing in this file
 *  touches LCX's database; the shapes are modelled on what was measured on production
 *  2026-08-06 (36 closed rows, median fee $12,500) so the assertions read against
 *  plausible magnitudes, but every number here was written by hand.
 */

const ENV = 'supabase:db.example.supabase.co/postgres';

/** A `small`-cap, `normal`-turnover, category-fitting, chain-fitting comparable. */
function cmp(recordName: string, listingFeeUsd: number | null, over: Partial<MarkComparable> = {}): MarkComparable {
  return {
    recordName,
    listingFeeUsd,
    marketingFeeUsd: null,
    marketCapUsd: 50_000_000,
    volume24hUsd: 1_000_000, // ratio 0.02 → 'normal'
    category: 'defi',
    chain: 'ethereum',
    closedAt: '2025-06-01',
    ...over,
  };
}

const TARGET: MarkStratumFeatures = {
  marketCapUsd: 50_000_000,
  volume24hUsd: 1_000_000,
  category: 'defi',
  chain: 'ethereum',
};

/** Five priced contracts in the target's stratum: 5k, 10k, 12.5k, 20k, 40k. */
const FIVE = [
  cmp('Alpha', 5_000),
  cmp('Bravo', 10_000),
  cmp('Charlie', 12_500),
  cmp('Delta', 20_000),
  cmp('Echo', 40_000),
];

describe('the stratum keeps absence apart from "no"', () => {
  it('reports categoryFit and chainFit as null when nothing was recorded, never false', () => {
    const s = stratumOf({ marketCapUsd: 50_000_000, volume24hUsd: 1_000_000, category: null, chain: '  ' });
    expect(s.categoryFit).toBeNull();
    expect(s.chainFit).toBeNull();
    // The distinction is the whole point: an unrecorded category must not join the
    // "does not fit the won-deal profile" stratum, which on production would sweep
    // 721 of 810 rows into one bucket and hand it a confident median.
    const unfit = stratumOf({ marketCapUsd: 50_000_000, volume24hUsd: 1_000_000, category: 'zzz-nonsense', chain: 'solana' });
    expect(unfit.categoryFit).toBe(false);
    expect(unfit.chainFit).toBe(false);
    expect(sameStratum(s, unfit)).toBe(false);
    expect(stratumKey(s)).toContain('cat=unknown');
    expect(stratumKey(unfit)).toContain('cat=unfit');
  });

  it('refuses to band NaN or Infinity rather than calling them the LARGEST and HOTTEST', () => {
    /*
     * `mcapBand` (features.ts:32) tests `mcapUsd <= 0` — FALSE for NaN — then three `<`
     * comparisons, all false for NaN, so NaN fell THROUGH to 'large'; `volMcapBand` fell
     * through to 'hot'. A market cap with no numeric meaning was placed in the highest
     * band and the hottest turnover band, resolved a stratum, and got a confident quote.
     * features.ts is another compartment's calibrated code, so the guard is in mark.ts.
     */
    for (const junk of [NaN, Infinity, -Infinity]) {
      const s = stratumOf({ marketCapUsd: junk, volume24hUsd: junk, category: 'defi', chain: 'ethereum' });
      expect(s.mcap, `market cap ${junk} was banded`).toBeNull();
      expect(s.vol, `volume ${junk} was banded`).toBeNull();
      expect(isStratumResolved(s)).toBe(false);
    }
    // A finite volume against a NaN cap has no ratio, so it cannot be banded either.
    expect(stratumOf({ marketCapUsd: NaN, volume24hUsd: 1_000_000, category: 'defi', chain: 'ethereum' }).vol)
      .toBeNull();

    // End to end: a NaN target and a NaN book must refuse, not agree on 'large|hot'.
    const out = markToContract({
      target: { marketCapUsd: NaN, volume24hUsd: NaN, category: 'defi', chain: 'ethereum' },
      comparables: FIVE.map((c) => ({ ...c, marketCapUsd: NaN, volume24hUsd: NaN })),
      environment: ENV,
    });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals[0]!.code).toBe('MARK_STRATUM_UNRESOLVED');
  });

  it('treats a stratum with any unresolved dimension as unresolved', () => {
    expect(isStratumResolved(stratumOf(TARGET))).toBe(true);
    expect(isStratumResolved(stratumOf({ ...TARGET, marketCapUsd: null }))).toBe(false);
    expect(isStratumResolved(stratumOf({ ...TARGET, volume24hUsd: null }))).toBe(false);
    expect(isStratumResolved(stratumOf({ ...TARGET, category: null }))).toBe(false);
    expect(isStratumResolved(stratumOf({ ...TARGET, chain: null }))).toBe(false);
  });
});

describe('a fee is only the fee line items, and 0 is not a fee', () => {
  it('never touches liquidity — the identifier is absent from the module', () => {
    /*
     * An earlier pass summed `liquidity_amount_usd` into the book and reported
     * $816,500 as LCX's revenue. That column is capital placed alongside a market
     * maker, not income. The guard is structural — `MarkComparable` has no such field —
     * and this reads the source to prove the field was never quietly re-added.
     */
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'mark.ts'), 'utf8');
    expect(src, 'mark.ts has grown a liquidity input field').not.toMatch(/liquidityAmount/);
    expect(MARK_FEE_LINE_ITEMS).toEqual(['listing_fee_usd', 'marketing_fee_usd']);
    expect(MARK_EXCLUDED_LINE_ITEM).toBe('liquidity_amount_usd');
  });

  it('reads 0 and null as UNOBSERVED, not as a free listing', () => {
    // `labels/extract.ts:23-27` cannot write 0 — it nulls anything <= 0 — so a 0 in the
    // column came from a loader with nothing to record. On production listing_fee is 0
    // or null on 24 of 36 closed rows, so reading it as $0 would collapse the median.
    expect(observedFeeOf(cmp('Zero', 0))).toBeNull();
    expect(observedFeeOf(cmp('Null', null))).toBeNull();
    expect(observedFeeOf(cmp('Negative', -5_000))).toBeNull();
  });

  it('reads a SUB-CENT total as unobserved, not as $0.00', () => {
    /*
     * THE $0.00 PROPOSAL THAT WAS STILL REACHABLE. `observedFeeOf` used to test
     * `usd <= 0` BEFORE converting, then `cents += Math.round(usd * 100)`. A fee of
     * 0.004 passed the gate, rounded to 0 CENTS, and was recorded as an OBSERVED line
     * item — so five of them cleared K and the mark came back [0, 0, 0].
     *
     * These values reach the column for real: `labels/extract.ts:23-27` strips every
     * non-digit, so "0.004" becomes 0.004 and its only check is `n > 0`.
     */
    expect(observedFeeOf(cmp('SubCent', 0.004))).toBeNull();
    expect(observedFeeOf(cmp('SubCentBoth', 0.001, { marketingFeeUsd: 0.002 }))).toBeNull();
    // The floor is one cent, the smallest amount the money type holds — not a dollar.
    expect(observedFeeOf(cmp('OneCent', 0.01))!.cents).toBe(1);
  });

  it('markToContract REFUSES a stratum of sub-cent fees instead of quoting [0, 0, 0]', () => {
    const subCent = [
      cmp('A', 0.001), cmp('B', 0.002), cmp('C', 0.003), cmp('D', 0.004), cmp('E', 0.001),
    ];
    const out = markToContract({ target: TARGET, comparables: subCent, environment: ENV });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    // Five contracts ARE here — this is "nobody recorded a price", not "nobody is here".
    expect(out.refusals[0]!.code).toBe('MARK_NO_FEE_LINE_ITEM_OBSERVED');
    expect(out.refusals[0]!.sentence).toContain('at least one cent');
    expect(out.refusals[0]!.environment).toBe(ENV);
    // The invariant that mattered: nothing numeric escaped.
    expect(JSON.stringify(out)).not.toContain('p25Cents');
  });

  it('prices a contract that records only a marketing fee, naming the line item', () => {
    const f = observedFeeOf(cmp('MarketingOnly', null, { marketingFeeUsd: 7_500 }));
    expect(f).not.toBeNull();
    expect(f!.cents).toBe(750_000);
    expect(f!.lineItems).toEqual(['marketing_fee_usd']);
  });

  it('sums the two fee line items into integer cents', () => {
    const f = observedFeeOf(cmp('Both', 10_000, { marketingFeeUsd: 2_500 }));
    expect(f!.cents).toBe(1_250_000);
    expect(f!.lineItems).toEqual(['listing_fee_usd', 'marketing_fee_usd']);
  });
});

describe('markToContract refuses rather than inventing a price', () => {
  it('refuses when the environment is unstated — a laptop is not LCX production', () => {
    const out = markToContract({ target: TARGET, comparables: FIVE, environment: '   ' });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals.map((r) => r.code)).toContain('MARK_ENVIRONMENT_NOT_STATED');
  });

  it('separates an unreadable book from an empty one', () => {
    const unreadable = markToContract({
      target: TARGET, comparables: [], environment: ENV, bookUnreadableReason: 'relation listing_labels does not exist',
    });
    expect(unreadable.kind).toBe('refused');
    if (unreadable.kind !== 'refused') return;
    expect(unreadable.refusals.map((r) => r.code)).toEqual(['MARK_COMPARABLE_BOOK_UNREADABLE']);
    // An unread book must not also claim n=0, which reads as "we looked and found none".
    expect(unreadable.refusals[0]!.stratumN).toBeNull();

    const empty = markToContract({ target: TARGET, comparables: [], environment: ENV });
    expect(empty.kind).toBe('refused');
    if (empty.kind !== 'refused') return;
    expect(empty.refusals.map((r) => r.code)).toEqual(['MARK_STRATUM_BELOW_K']);
    expect(empty.refusals[0]!.stratumN).toBe(0);
  });

  it('names the empty stratum and its n in the refusal', () => {
    const out = markToContract({ target: TARGET, comparables: FIVE.slice(0, 2), environment: ENV });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    const [r] = out.refusals;
    expect(r!.code).toBe('MARK_STRATUM_BELOW_K');
    expect(r!.stratumN).toBe(2);
    expect(r!.sentence).toContain('mcap=small|vol=normal|cat=fit|chain=fit');
    expect(r!.sentence).toContain('2');
    expect(r!.environment).toBe(ENV);
    expect(r!.rule.instrument).toBe('LCX_HOUSE_DOCTRINE');
  });

  it('refuses a target it cannot place, naming every missing field', () => {
    const out = markToContract({
      target: { marketCapUsd: null, volume24hUsd: null, category: null, chain: null },
      comparables: FIVE,
      environment: ENV,
    });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals[0]!.code).toBe('MARK_STRATUM_UNRESOLVED');
    for (const field of ['market cap', 'category', 'chain']) {
      expect(out.refusals[0]!.sentence).toContain(field);
    }
  });

  it('distinguishes "contracts here record no fee" from "no contracts here"', () => {
    const unpriced = [cmp('A', 0), cmp('B', null), cmp('C', 0), cmp('D', null), cmp('E', 0), cmp('F', null)];
    const out = markToContract({ target: TARGET, comparables: unpriced, environment: ENV });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals[0]!.code).toBe('MARK_NO_FEE_LINE_ITEM_OBSERVED');
    expect(out.refusals[0]!.sentence).toContain('6');
  });

  it('NEVER widens the stratum to reach K', () => {
    // Nineteen priced contracts sit one band away (mid-cap). A widening engine would
    // find them and quote; this one must refuse on the empty small-cap stratum.
    const neighbours = Array.from({ length: 19 }, (_, i) =>
      cmp(`Mid${i}`, 30_000 + i * 1_000, { marketCapUsd: 500_000_000, volume24hUsd: 10_000_000 }));
    const out = markToContract({ target: TARGET, comparables: neighbours, environment: ENV });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals[0]!.code).toBe('MARK_STRATUM_BELOW_K');
    expect(out.refusals[0]!.stratumN).toBe(0);
    expect(out.refusals[0]!.sentence).toContain('mcap=small');
  });

  it('returns EVERY refusal it can determine, not the first one found', () => {
    // Unstated environment AND an unplaceable target: both must come back.
    const out = markToContract({
      target: { marketCapUsd: null, volume24hUsd: null, category: 'defi', chain: 'ethereum' },
      comparables: FIVE,
      environment: '',
    });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals.map((r) => r.code).sort())
      .toEqual(['MARK_ENVIRONMENT_NOT_STATED', 'MARK_STRATUM_UNRESOLVED']);
  });

  it('emits only codes from the closed list', () => {
    const out = markToContract({ target: TARGET, comparables: [], environment: '' });
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    for (const r of out.refusals) expect(isMarkRefusalCode(r.code)).toBe(true);
    expect(new Set(MARK_REFUSAL_CODES).size).toBe(MARK_REFUSAL_CODES.length);
  });
});

describe('a mark at or above K is real money from real contracts', () => {
  const out = markToContract({ target: TARGET, comparables: FIVE, environment: ENV });

  it('marks at exactly K', () => {
    expect(FIVE.length).toBe(MARK_MIN_COMPARABLES);
    expect(isFeeMark(out)).toBe(true);
  });

  it('quotes quantiles that are TOTALS SOME COUNTERPARTY ACTUALLY PAID', () => {
    if (!isFeeMark(out)) throw new Error('expected a mark');
    const observed = new Set(FIVE.map((c) => observedFeeOf(c)!.cents));
    for (const cents of [out.p25Cents, out.medianCents, out.p75Cents]) {
      expect(observed.has(cents), `${cents} is not any contract's total — the quantile interpolated`).toBe(true);
    }
    // Nearest rank on [500k, 1_000k, 1_250k, 2_000k, 4_000k] cents.
    expect(out.p25Cents).toBe(1_000_000);
    expect(out.medianCents).toBe(1_250_000);
    expect(out.p75Cents).toBe(2_000_000);
  });

  it('does NOT snap the price to a $1,000 grid', () => {
    // The fiction it replaces rounded every tier to the nearest 100_000 cents
    // (`deals/index.ts` before this wave), so a real $12,499 mark displayed as $12,000.
    const odd = markToContract({
      target: TARGET,
      comparables: [cmp('A', 4_137), cmp('B', 9_311), cmp('C', 12_499), cmp('D', 18_003), cmp('E', 41_777)],
      environment: ENV,
    });
    if (!isFeeMark(odd)) throw new Error('expected a mark');
    expect(odd.medianCents).toBe(1_249_900);
    expect(odd.medianCents % 100_000).not.toBe(0);
  });

  it('never returns a zero or negative quantile — across every book shape, not one fixture', () => {
    /*
     * THIS ASSERTION USED TO RUN AGAINST `FIVE` ALONE, so the invariant lived in the test
     * and nothing in the code enforced it — and sub-cent fees violated it (see the
     * sub-cent tests above, where the fix now refuses). Enumerating the shapes that
     * reach the quoting path is what makes it an invariant rather than a sample.
     */
    const books: Record<string, readonly MarkComparable[]> = {
      spread: FIVE,
      flat: Array.from({ length: 5 }, (_, i) => cmp(`Flat${i}`, 12_500)),
      oneCent: Array.from({ length: 5 }, (_, i) => cmp(`Cent${i}`, 0.01)),
      odd: [cmp('A', 4_137), cmp('B', 9_311), cmp('C', 12_499), cmp('D', 18_003), cmp('E', 41_777)],
      marketingOnly: Array.from({ length: 5 }, (_, i) =>
        cmp(`M${i}`, null, { marketingFeeUsd: 1_000 + i })),
      withBlanks: [...FIVE, cmp('NoFee', 0), cmp('SubCent', 0.004)],
    };
    for (const [label, book] of Object.entries(books)) {
      const m = markToContract({ target: TARGET, comparables: book, environment: ENV });
      if (!isFeeMark(m)) throw new Error(`${label}: expected a mark`);
      for (const [q, cents] of [['p25', m.p25Cents], ['median', m.medianCents], ['p75', m.p75Cents]] as const) {
        expect(Number.isInteger(cents), `${label}/${q} is not integer cents`).toBe(true);
        expect(cents, `${label}/${q} quoted ${cents} cents`).toBeGreaterThanOrEqual(1);
      }
      expect(m.p25Cents).toBeLessThanOrEqual(m.medianCents);
      expect(m.medianCents).toBeLessThanOrEqual(m.p75Cents);
    }
  });

  it('carries a frame naming the environment, the window, the line items and n', () => {
    if (!isFeeMark(out)) throw new Error('expected a mark');
    const f = out.frame;
    expect(f.environment).toBe(ENV);
    expect(f.stratumN).toBe(5);
    expect(f.comparablesConsidered).toBe(5);
    expect(f.lineItemsObserved).toEqual(['listing_fee_usd']);
    expect(f.lineItemsNeverObserved).toEqual(['marketing_fee_usd']);
    expect(f.lineItemExcluded).toBe('liquidity_amount_usd');
    expect(f.quantileMethod).toBe('nearest_rank_no_interpolation');
    expect(f.windowBasis).toBe('observed_from_comparables');
    expect(f.windowFrom).toBe('2025-06-01');
    expect(f.bookWindowAsMeasured).toEqual(CLOSED_BOOK_WINDOW_AS_MEASURED);
  });

  it('says the window is unknown rather than borrowing the book\'s measured span', () => {
    const undated = markToContract({
      target: TARGET,
      comparables: FIVE.map((c) => ({ ...c, closedAt: null })),
      environment: ENV,
    });
    if (!isFeeMark(undated)) throw new Error('expected a mark');
    expect(undated.frame.windowBasis).toBe('unknown_no_dated_comparable');
    expect(undated.frame.windowFrom).toBeNull();
    expect(undated.frame.windowTo).toBeNull();
    // The measured span is still carried, for comparison — never as the answer.
    expect(undated.frame.bookWindowAsMeasured.from).toBe('2024-02-02');
  });

  it('counts in-stratum contracts that recorded no fee, rather than dropping them silently', () => {
    const withBlanks = markToContract({
      target: TARGET,
      comparables: [...FIVE, cmp('NoFee1', 0), cmp('NoFee2', null)],
      environment: ENV,
    });
    if (!isFeeMark(withBlanks)) throw new Error('expected a mark');
    expect(withBlanks.frame.stratumN).toBe(5);
    expect(withBlanks.frame.comparablesWithoutAnyFeeLineItem).toBe(2);
    expect(withBlanks.frame.comparablesConsidered).toBe(7);
  });
});

describe('the census reports the engine\'s own thinness', () => {
  it('counts coverage per dimension and how many strata clear K', () => {
    const book = [
      ...FIVE,
      cmp('NoCat', 15_000, { category: null }),
      cmp('NoMcap', 15_000, { marketCapUsd: null, volume24hUsd: null }),
      cmp('NoFee', null),
      cmp('MidBand', 60_000, { marketCapUsd: 500_000_000, volume24hUsd: 10_000_000 }),
    ];
    const c = censusOfComparables(book, ENV);
    expect(c.comparablesConsidered).toBe(9);
    expect(c.withMarketCap).toBe(8);
    expect(c.withCategory).toBe(8);
    expect(c.withChain).toBe(9);
    expect(c.withAnyFeeLineItem).toBe(8);
    // NoCat and NoMcap cannot be placed at all.
    expect(c.fullyStratifiable).toBe(7);
    expect(c.strataMeetingK).toBe(1);
    const top = c.strata[0]!;
    expect(top.key).toBe('mcap=small|vol=normal|cat=fit|chain=fit');
    expect(top.n).toBe(6); // five priced plus NoFee
    expect(top.nPriced).toBe(5);
    expect(top.meetsK).toBe(true);
    expect(c.strata.find((s) => s.key.includes('mcap=mid'))!.meetsK).toBe(false);
  });

  it('an empty book censuses to zeros without inventing a stratum', () => {
    const c = censusOfComparables([], ENV);
    expect(c.comparablesConsidered).toBe(0);
    expect(c.strata).toEqual([]);
    expect(c.strataMeetingK).toBe(0);
    expect(c.minComparables).toBe(MARK_MIN_COMPARABLES);
  });
});

describe('the environment label names the database, not NODE_ENV', () => {
  it('labels supabase, local and external hosts distinctly', () => {
    expect(environmentLabelFromDatabaseUrl('postgresql://u:p@db.abcd.supabase.co:5432/postgres'))
      .toBe('supabase:db.abcd.supabase.co/postgres');
    expect(environmentLabelFromDatabaseUrl('postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales'))
      .toBe('local:localhost/lcx_sales');
    expect(environmentLabelFromDatabaseUrl('postgres://user:pw@db.render.com:5432/lcx'))
      .toBe('external:db.render.com/lcx');
  });

  it('never leaks the credentials it was handed', () => {
    const label = environmentLabelFromDatabaseUrl('postgresql://lcx:sup3r-s3cret@db.abcd.supabase.co:5432/postgres');
    expect(label).not.toContain('sup3r-s3cret');
    expect(label).not.toContain('lcx:');
  });

  it('returns null for junk, AND markToContract then actually refuses on it', () => {
    /*
     * ══ WHAT THIS TEST USED TO BE, AND WHY IT WAS WORSE THAN NOTHING ══
     *
     * It was titled "returns unknown for junk, which markToContract then refuses on"
     * and its whole body was:
     *
     *   expect(environmentLabelFromDatabaseUrl('')).toBe('unknown');
     *   expect(environmentLabelFromDatabaseUrl('not a url')).toBe('unknown');
     *
     * It never called `markToContract`. The load-bearing half of its own title was
     * untested — and false: `markToContract` refused only on the EMPTY string, so
     * `'unknown'` sailed through and a price shipped labelled `environment: 'unknown'`.
     * A green test whose title asserted the missing guard is how the gap survived.
     */
    expect(environmentLabelFromDatabaseUrl('')).toBeNull();
    expect(environmentLabelFromDatabaseUrl('not a url')).toBeNull();
    expect(environmentLabelFromDatabaseUrl('   ')).toBeNull();

    // The half that was missing. FIVE priced comparables — enough to clear K — so the
    // ONLY thing standing between this input and a quoted price is the environment guard.
    const fromJunk = markToContract({
      target: TARGET,
      comparables: FIVE,
      environment: environmentLabelFromDatabaseUrl('not a url'),
    });
    expect(fromJunk.kind).toBe('refused');
    if (fromJunk.kind !== 'refused') return;
    expect(fromJunk.refusals.map((r) => r.code)).toEqual(['MARK_ENVIRONMENT_NOT_STATED']);
    expect(JSON.stringify(fromJunk)).not.toContain('valueCents');
  });

  it('refuses the literal word "unknown" as an environment — it is not a database name', () => {
    // The sentinel can still arrive from a replayed payload or a persisted snapshot even
    // now the helper returns null, and a price labelled 'unknown' is the exact failure
    // this module was written after (laptop numbers reported as LCX's book).
    for (const junk of ['unknown', 'UNKNOWN', '  Unknown  ']) {
      const out = markToContract({ target: TARGET, comparables: FIVE, environment: junk });
      expect(out.kind, `environment '${junk}' produced a price`).toBe('refused');
      if (out.kind !== 'refused') continue;
      expect(out.refusals.map((r) => r.code)).toContain('MARK_ENVIRONMENT_NOT_STATED');
      expect(out.refusals[0]!.sentence).toContain('does not name a database');
    }
    // And a real label still marks, so the guard is not simply refusing everything.
    expect(isFeeMark(markToContract({ target: TARGET, comparables: FIVE, environment: ENV }))).toBe(true);
  });

  it('censuses with a null environment rather than the word unknown', () => {
    expect(censusOfComparables(FIVE, environmentLabelFromDatabaseUrl('')).environment).toBeNull();
    expect(censusOfComparables(FIVE, 'unknown').environment).toBeNull();
    expect(censusOfComparables(FIVE, ENV).environment).toBe(ENV);
  });
});

describe('market data is not a price', () => {
  it('publishes the refusal alpha.ts returns in place of its manufactured USD', () => {
    expect(MARKET_DATA_IS_NOT_A_PRICE.code).toBe('MARK_NOT_DERIVABLE_FROM_MARKET_DATA');
    expect(MARKET_DATA_IS_NOT_A_PRICE.environment).toBeNull(); // no database was read
    expect(MARKET_DATA_IS_NOT_A_PRICE.sentence).toMatch(/not what a counterparty agreed to pay/);
  });
});
