import { describe, it, expect } from 'vitest';
import { canTransition, generateProposal, defaultPackageValue, buildProposalTiers, PACKAGES, DEAL_PACKAGE, STAGES, STAGE_LABELS } from '../index.js';
import type { MarkComparable, MarkStratumFeatures } from '../../marks/mark.js';

describe('Stage transition rules', () => {
  it('allows forward progression through stages', () => {
    expect(canTransition('not_started', 'contacted')).toBe(true);
    expect(canTransition('contacted', 'discovery')).toBe(true);
    expect(canTransition('discovery', 'proposal')).toBe(true);
    expect(canTransition('proposal', 'negotiating')).toBe(true);
  });

  it('allows jumping to won or lost from any non-terminal stage', () => {
    for (const stage of ['not_started', 'contacted', 'discovery', 'proposal', 'negotiating'] as const) {
      expect(canTransition(stage, 'won')).toBe(true);
      expect(canTransition(stage, 'lost')).toBe(true);
    }
  });

  it('blocks backwards transitions', () => {
    expect(canTransition('contacted', 'not_started')).toBe(false);
    expect(canTransition('discovery', 'contacted')).toBe(false);
    expect(canTransition('proposal', 'discovery')).toBe(false);
    expect(canTransition('negotiating', 'proposal')).toBe(false);
  });

  it('blocks transitions from terminal stages', () => {
    expect(canTransition('won', 'contacted')).toBe(false);
    expect(canTransition('won', 'lost')).toBe(false);
    expect(canTransition('lost', 'won')).toBe(false);
    expect(canTransition('lost', 'negotiating')).toBe(false);
  });

  it('has all 7 stages with labels', () => {
    expect(STAGES).toHaveLength(7);
    for (const s of STAGES) {
      expect(STAGE_LABELS[s]).toBeTruthy();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE FIXTURES. A modelled book, not a measurement — nothing here reads a database. */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** A real connection string — the label is derived from it, credentials stripped. */
const DB_URL = 'postgresql://lcx:sup3r-s3cret@db.example.supabase.co:5432/postgres';
const ENV = 'supabase:db.example.supabase.co/postgres';

const TARGET: MarkStratumFeatures = {
  marketCapUsd: 50_000_000, volume24hUsd: 1_000_000, category: 'defi', chain: 'ethereum',
};

function cmp(recordName: string, listingFeeUsd: number): MarkComparable {
  return {
    recordName, listingFeeUsd, marketingFeeUsd: null,
    marketCapUsd: 50_000_000, volume24hUsd: 1_000_000,
    category: 'defi', chain: 'ethereum', closedAt: '2025-06-01',
  };
}

/** 5k / 10k / 12.5k / 20k / 40k — nearest-rank p25/median/p75 = 10k / 12.5k / 20k. */
const BOOK = [cmp('A', 5_000), cmp('B', 10_000), cmp('C', 12_500), cmp('D', 20_000), cmp('E', 40_000)];

/** The book as `deals.ts` hands it over: comparables plus where they were read from. */
const MARKED = { target: TARGET, comparables: BOOK, databaseUrl: DB_URL };
const REFUSED = { target: TARGET, comparables: BOOK.slice(0, 2), databaseUrl: DB_URL };

describe('the package catalogue carries no money', () => {
  /*
   * ══ WHAT THIS SUITE USED TO ASSERT, AND WHY IT WAS WRONG ══
   *
   * Until this wave the block below read:
   *
   *   expect(listing?.basePrice).toBe(2_000_000);  // $20K
   *   expect(defaultPackageValue('listing')).toBe(2_000_000);
   *   expect(defaultPackageValue('unknown')).toBe(0);
   *
   * It was a green test pinning a fabrication. $20,000 was a literal nobody sourced,
   * and LCX's real median fee on its 36 closed contracts is $12,500 — so the pinned
   * default was 60% ABOVE the book, and the test's job had become to keep it there.
   * The `toBe(0)` line was worse: it asserted that an unknown package type quotes ZERO
   * DOLLARS, which is the exact silent-zero collapse the house doctrine forbids.
   *
   * `basePrice` is deleted, not corrected. There is no single right price for a
   * package type — there is a stratum of comparable closed contracts, or a refusal.
   */
  it('has 6 package types, each with a label and inclusions and no price', () => {
    expect(PACKAGES).toHaveLength(6);
    for (const p of PACKAGES) {
      expect(p.label).toBeTruthy();
      expect(p.includes.length).toBeGreaterThan(0);
      expect(p, `${p.type} has grown a price back`).not.toHaveProperty('basePrice');
    }
  });

  it('DEAL_PACKAGE describes inclusions only — the tier prices are gone', () => {
    expect(DEAL_PACKAGE.standardIncludes.length).toBeGreaterThan(0);
    expect(DEAL_PACKAGE.premiumIncludes.length).toBeGreaterThan(0);
    expect(DEAL_PACKAGE).not.toHaveProperty('standardPrice');
    expect(DEAL_PACKAGE).not.toHaveProperty('premiumPrice');
  });
});

describe('defaultPackageValue quotes the mark or refuses', () => {
  it('quotes the stratum median in cents, unrounded', () => {
    const q = defaultPackageValue('listing', MARKED);
    expect(q.kind).toBe('quoted');
    if (q.kind !== 'quoted') return;
    expect(q.valueCents).toBe(1_250_000);
    expect(q.frame.environment).toBe(ENV);
    expect(q.frame.stratumN).toBe(5);
  });

  it('refuses instead of returning 0 when the mark refused', () => {
    const q = defaultPackageValue('listing', REFUSED);
    expect(q.kind).toBe('refused');
    if (q.kind !== 'refused') return;
    expect(q.refusals.map((r) => r.code)).toContain('MARK_STRATUM_BELOW_K');
    // The whole point: no numeric field to accidentally render.
    expect(q).not.toHaveProperty('valueCents');
    // The refusal reports the engine's own thinness so the operator can act on it.
    expect(q.census.comparablesConsidered).toBe(2);
    expect(q.census.strataMeetingK).toBe(0);
    expect(q.census.strata[0]!.nPriced).toBe(2);
  });

  it('derives the environment label from the connection string without its password', () => {
    const q = defaultPackageValue('listing', MARKED);
    if (q.kind !== 'quoted') throw new Error('expected a quote');
    expect(q.frame.environment).toBe(ENV);
    expect(q.frame.environment).not.toContain('sup3r-s3cret');
    expect(JSON.stringify(q)).not.toContain('sup3r-s3cret');
  });

  it('refuses an unknown package type rather than quoting zero dollars', () => {
    const q = defaultPackageValue('not-a-package', MARKED);
    expect(q.kind).toBe('refused');
    if (q.kind !== 'refused') return;
    expect(q.refusals[0]!.code).toBe('MARK_PACKAGE_TYPE_UNKNOWN');
  });
});

describe('buildProposalTiers reads the observed spread, not a multiplier', () => {
  it('prices the three tiers at the stratum p25 / median / p75', () => {
    const t = buildProposalTiers('listing', MARKED);
    expect(t.kind).toBe('tiers');
    if (t.kind !== 'tiers') return;
    const [essential, growth, premium] = t.tiers;
    expect(essential!.priceCents).toBe(1_000_000);
    expect(growth!.priceCents).toBe(1_250_000);
    expect(premium!.priceCents).toBe(2_000_000);
    expect(essential!.basis).toBe('stratum_p25');
    expect(growth!.basis).toBe('stratum_median');
    expect(premium!.basis).toBe('stratum_p75');
    expect(growth!.recommended).toBe(true);
    expect(essential!.recommended).toBe(false);
    expect(premium!.recommended).toBe(false);
  });

  it('keeps the tiers STRICTLY ascending and never zero', () => {
    /*
     * ══ THIS TEST WAS TITLED 'ascending' AND ASSERTED `toBeLessThanOrEqual` ══
     * So it passed on [1_250_000, 1_250_000, 1_250_000] — three identical prices
     * presented to a counterparty as Essential / Growth / Premium. With K=5 and real
     * clustered fees (LCX has many contracts at exactly $12,500) that is a LIKELY shape,
     * not a corner case. Coincident quantiles now collapse into one tier, so strict
     * ascent is the real contract and `toBeLessThan` is the right assertion.
     */
    const t = buildProposalTiers('listing', MARKED);
    if (t.kind !== 'tiers') throw new Error('expected tiers');
    expect(t.spreadObserved).toBe(true);
    for (const tier of t.tiers) expect(tier.priceCents).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < t.tiers.length; i++) {
      expect(t.tiers[i]!.priceCents, 'two tiers share a price').toBeGreaterThan(t.tiers[i - 1]!.priceCents);
    }
    const [essential, , premium] = t.tiers;
    expect(premium!.inclusions.length).toBeGreaterThanOrEqual(essential!.inclusions.length);
  });

  it('reports a FLAT stratum as one tier, not three identical prices', () => {
    // Five contracts all at $12,500: p25 = median = p75. There is one observed price and
    // the document must say so — a ladder with equal rungs is a fabricated spread.
    const flat = {
      target: TARGET,
      comparables: Array.from({ length: 5 }, (_, i) => cmp(`Flat${i}`, 12_500)),
      databaseUrl: DB_URL,
    };
    const t = buildProposalTiers('listing', flat);
    if (t.kind !== 'tiers') throw new Error('expected tiers');
    expect(t.spreadObserved).toBe(false);
    expect(t.tiers).toHaveLength(1);
    expect(t.tiers[0]!.priceCents).toBe(1_250_000);
    expect(t.tiers[0]!.recommended).toBe(true);
    /*
     * The survivor is the MEDIAN's row, and that matters: the contracts that produced
     * $12,500 were standard-package contracts, so those are the inclusions the price was
     * observed against. Keeping the Premium row would give away the marketing and
     * liquidity bundle at a price nobody paid for it; keeping the Essential row would
     * trim the delivery at an unchanged price. Both invent a fact about what LCX sold.
     */
    expect(t.tiers[0]!.basis).toBe('stratum_median');
    expect(t.tiers[0]!.inclusions).toEqual(PACKAGES.find((p) => p.type === 'listing')!.includes);
    // And the provenance sentence says the spread collapsed rather than staying silent.
    const out = generateProposal({
      projectName: 'FlatCoin', projectTicker: 'FLT', packageType: 'listing',
      jurisdiction: 'EU', claimsUsed: [], book: flat,
    });
    if (out.kind !== 'quoted') throw new Error('expected a quote');
    expect(out.snapshot.priceBasis).toContain('no spread');
    expect(out.snapshot.tiers).toHaveLength(1);
  });

  it('collapses only the coincident pair when p25 equals the median', () => {
    // 10k, 10k, 10k, 20k, 40k → nearest rank (ranks 2, 3, 4) = 10k, 10k, 20k. Two prices.
    const partial = {
      target: TARGET,
      comparables: [cmp('A', 10_000), cmp('B', 10_000), cmp('C', 10_000), cmp('D', 20_000), cmp('E', 40_000)],
      databaseUrl: DB_URL,
    };
    const t = buildProposalTiers('listing', partial);
    if (t.kind !== 'tiers') throw new Error('expected tiers');
    expect(t.tiers.map((x) => x.priceCents)).toEqual([1_000_000, 2_000_000]);
    expect(t.tiers.map((x) => x.basis)).toEqual(['stratum_median', 'stratum_p75']);
    expect(t.spreadObserved).toBe(true);
    // The recommendation follows the MEDIAN'S PRICE, and only one tier carries it.
    expect(t.tiers.filter((x) => x.recommended)).toHaveLength(1);
    expect(t.tiers.find((x) => x.recommended)!.priceCents).toBe(1_000_000);
  });

  it('does NOT snap a tier to the nearest $1,000', () => {
    /*
     * THE BUG THIS REPLACES. The old tiers were
     *   `Math.round((packageValue * 0.7) / 100_000) * 100_000`
     * so a genuine $12,499 mark rendered as $12,000 and a $12,501 one as $13,000. Any
     * real number fed in was quantised onto a $1,000 grid before a customer saw it.
     */
    const odd = {
      target: TARGET,
      comparables: [cmp('A', 4_137), cmp('B', 9_311), cmp('C', 12_499), cmp('D', 18_003), cmp('E', 41_777)],
      databaseUrl: DB_URL,
    };
    const t = buildProposalTiers('listing', odd);
    if (t.kind !== 'tiers') throw new Error('expected tiers');
    expect(t.tiers.map((x) => x.priceCents)).toEqual([931_100, 1_249_900, 1_800_300]);
    for (const tier of t.tiers) expect(tier.priceCents % 100_000).not.toBe(0);
  });

  it('returns refusals, not a zero-priced tier list, when the mark refused', () => {
    const t = buildProposalTiers('listing', REFUSED);
    expect(t.kind).toBe('refused');
    if (t.kind !== 'refused') return;
    expect(t.refusals.map((r) => r.code)).toContain('MARK_STRATUM_BELOW_K');
    expect(t).not.toHaveProperty('tiers');
  });
});

describe('generateProposal', () => {
  const params = {
    projectName: 'TestCoin', projectTicker: 'TST', packageType: 'listing',
    jurisdiction: 'EU', claimsUsed: ['LCX is regulated', 'MiCA compliant'],
  };

  it('generates a complete proposal from a mark, carrying the frame', () => {
    const out = generateProposal({ ...params, book: MARKED });
    expect(out.kind).toBe('quoted');
    if (out.kind !== 'quoted') return;
    const p = out.snapshot;
    expect(p.projectName).toBe('TestCoin');
    expect(p.projectTicker).toBe('TST');
    expect(p.packageType).toBe('listing');
    expect(p.packageValue).toBe(1_250_000); // the mark's median, in cents
    expect(p.jurisdiction).toBe('EU');
    expect(p.claimsUsed).toHaveLength(2);
    expect(p.inclusions.length).toBeGreaterThan(0);
    expect(p.disclaimer).toBeTruthy();
    expect(p.generatedAt).toBeTruthy();
    expect(p.validUntil).toBeTruthy();
    // The environment label travels with the quote — the whole reason this lane exists.
    expect(p.mark).not.toBeNull();
    expect(p.mark!.frame.environment).toBe(ENV);
    expect(p.mark!.frame.lineItemExcluded).toBe('liquidity_amount_usd');
    expect(p.priceBasis).toContain('closed contracts');
    // The pricing basis is a discriminator, so no surface can read a hand price as a mark.
    expect(p.pricing.basis).toBe('mark_to_contract');
  });

  it('produces three STRICTLY ascending tiers with a recommended middle', () => {
    const out = generateProposal({ ...params, book: MARKED });
    if (out.kind !== 'quoted') throw new Error('expected a quote');
    const { tiers } = out.snapshot;
    expect(tiers).toHaveLength(3);
    const [essential, growth, premium] = tiers;
    // Strict, not `toBeLessThanOrEqual` — see the flat-stratum test above for why the
    // `<=` version of this assertion was passing on three identical prices.
    expect(essential!.priceCents).toBeLessThan(growth!.priceCents);
    expect(growth!.priceCents).toBeLessThan(premium!.priceCents);
    expect(growth!.recommended).toBe(true);
    expect(growth!.priceCents).toBe(1_250_000);
  });

  it('sets 30-day validity from generation date', () => {
    const out = generateProposal({ ...params, book: MARKED });
    if (out.kind !== 'quoted') throw new Error('expected a quote');
    const generated = new Date(out.snapshot.generatedAt).getTime();
    const validUntil = new Date(out.snapshot.validUntil).getTime();
    expect(Math.round((validUntil - generated) / (1000 * 60 * 60 * 24))).toBe(30);
  });

  it('REFUSES the whole proposal when the mark refused — it does not emit a $0 quote', () => {
    /*
     * The failure this replaces: `generateProposal` took `packageValue: number` and a
     * refusal reaching it as 0 collapsed all three tiers to 0
     * (`essentialPrice > 0 ? essentialPrice : packageValue`). A proposal quoting $0 to a
     * counterparty is worse than no proposal, so a refusal now stops the call.
     */
    const out = generateProposal({ ...params, book: REFUSED });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out).not.toHaveProperty('snapshot');
    expect(out.refusals.map((r) => r.code)).toContain('MARK_STRATUM_BELOW_K');
    expect(out.refusals[0]!.sentence).toContain('mcap=small');
  });

  it('a custom package still refuses without a mark rather than quoting its old $0 base', () => {
    const out = generateProposal({ ...params, packageType: 'custom', book: REFUSED });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals.length).toBeGreaterThan(0);
  });

  it('uses custom package inclusions when it can quote', () => {
    const out = generateProposal({ ...params, packageType: 'custom', book: MARKED });
    if (out.kind !== 'quoted') throw new Error('expected a quote');
    expect(out.snapshot.inclusions).toContain('Consultation');
    expect(out.snapshot.inclusions).toContain('Custom integration');
  });

  it('never returns a refused outcome with an empty reason list', () => {
    /*
     * THE BRANCH THIS REPLACES. `generateProposal` used to call `markFrom` a SECOND time
     * and narrow the result, and the else-branch returned `{ kind: 'refused',
     * refusals: [] }`. Had it ever fired, `routes/deals.ts:596` would have produced a 422
     * whose message was the prefix, a space, and nothing — plus `refusals: []`: the
     * operator told a refusal happened and shown an empty list of reasons, which is the
     * "empty list that reads as nothing happened" the doctrine names. The mark now rides
     * back on the tiers result and the branch does not exist.
     *
     * The `refusals` type is a non-empty tuple, so an empty one is no longer
     * constructible — this asserts the behaviour across every refusing shape as well.
     */
    const refusingBooks = [
      REFUSED,
      { target: TARGET, comparables: [], databaseUrl: DB_URL },
      { target: TARGET, comparables: BOOK, databaseUrl: 'not a url' },
      { target: TARGET, comparables: BOOK, databaseUrl: '' },
      { target: TARGET, comparables: BOOK, databaseUrl: DB_URL, bookUnreadableReason: 'relation missing' },
      { target: { ...TARGET, category: null }, comparables: BOOK, databaseUrl: DB_URL },
    ];
    for (const book of refusingBooks) {
      for (const pkgType of ['listing', 'not-a-package']) {
        const out = generateProposal({ ...params, packageType: pkgType, book });
        expect(out.kind, `${JSON.stringify(book.databaseUrl)} quoted`).toBe('refused');
        if (out.kind !== 'refused') continue;
        expect(out.refusals.length, 'a refusal carrying no refusal').toBeGreaterThan(0);
        for (const r of out.refusals) {
          expect(r.code).toBeTruthy();
          expect(r.sentence.trim().length).toBeGreaterThan(0);
          expect(r.rule.provision).toBeTruthy();
        }
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE HAND-PRICED PATH — the escape hatch that had gone missing                    */
/* ══════════════════════════════════════════════════════════════════════════════ */

describe('an operator can quote a hand-negotiated price without it being laundered as a mark', () => {
  const params = {
    projectName: 'HandCoin', projectTicker: 'HND', packageType: 'listing',
    jurisdiction: 'EU', claimsUsed: [] as string[],
  };
  const OP = { priceCents: 5_000_000, operatorId: 'op-nik', rationale: 'Negotiated on the 2026-08-04 call; includes a second pair.' };

  it('quotes the operator\'s own number even when the book refuses', () => {
    /*
     * THE CAPABILITY THAT HAD DISAPPEARED. `POST /:id/proposal` reads only the package
     * TYPE, never `deal.packageValue`. So a deal hand-priced at $50,000 on a project
     * whose category is unrecorded (721 of 810 rows on production) got a 422 and NO
     * document at any price — the endpoint would neither use the operator's number nor
     * let them past. Here the book refuses and the proposal is still produced, at the
     * operator's figure.
     */
    const out = generateProposal({ ...params, book: REFUSED, operatorPrice: OP });
    expect(out.kind).toBe('quoted');
    if (out.kind !== 'quoted') return;
    const p = out.snapshot;
    expect(p.packageValue).toBe(5_000_000);
    expect(p.mark).toBeNull();
    expect(p.pricing.basis).toBe('operator_supplied');
    if (p.pricing.basis !== 'operator_supplied') return;
    expect(p.pricing.operator.operatorId).toBe('op-nik');
    // WHAT THE BOOK SAID is on the document — the refusal is recorded, not hidden.
    expect(p.pricing.markRefusals.map((r) => r.code)).toContain('MARK_STRATUM_BELOW_K');
    // The census still reports the book's own thinness, and carries the environment.
    expect(out.census.environment).toBe(ENV);
  });

  it('says on the face of the document that the book did NOT set this price', () => {
    const out = generateProposal({ ...params, book: REFUSED, operatorPrice: OP });
    if (out.kind !== 'quoted') throw new Error('expected a quote');
    const { priceBasis } = out.snapshot;
    expect(priceBasis).toContain('BY HAND');
    expect(priceBasis).toContain('op-nik');
    expect(priceBasis).toContain('Negotiated on the 2026-08-04 call');
    expect(priceBasis).toContain('MARK_STRATUM_BELOW_K');
    expect(priceBasis).toMatch(/NOT marked to any stratum/);
    // It must not borrow the vocabulary of a mark it does not have.
    expect(priceBasis).not.toContain('comparable closed contracts');
    expect(priceBasis).not.toContain('nearest rank');
  });

  it('emits ONE tier, because a negotiated number has no observed spread around it', () => {
    const out = generateProposal({ ...params, book: MARKED, operatorPrice: OP });
    if (out.kind !== 'quoted') throw new Error('expected a quote');
    expect(out.snapshot.tiers).toHaveLength(1);
    expect(out.snapshot.tiers[0]!.priceCents).toBe(5_000_000);
    expect(out.snapshot.tiers[0]!.basis).toBe('operator_supplied');
    // No stratum quantile may appear on a hand-priced document.
    expect(out.snapshot.tiers.map((t) => t.basis)).not.toContain('stratum_median');
    // And the book, which COULD have priced this one, is recorded as not having done so.
    if (out.snapshot.pricing.basis !== 'operator_supplied') throw new Error('wrong basis');
    expect(out.snapshot.pricing.markRefusals).toEqual([]);
    expect(out.snapshot.priceBasis).toContain('was NOT used');
  });

  it('refuses a hand price that is not a price, or carries no reason', () => {
    const bad = [
      { ...OP, priceCents: 0 },
      { ...OP, priceCents: -5_000_000 },
      { ...OP, priceCents: 12.5 },
      { ...OP, priceCents: Number.NaN },
      { ...OP, rationale: '   ' },
      { ...OP, operatorId: '' },
    ];
    for (const op of bad) {
      const out = generateProposal({ ...params, book: MARKED, operatorPrice: op });
      expect(out.kind, `${JSON.stringify(op)} was quoted`).toBe('refused');
      if (out.kind !== 'refused') continue;
      expect(out.refusals.map((r) => r.code)).toContain('MARK_OPERATOR_PRICE_NOT_A_PRICE');
      expect(out).not.toHaveProperty('snapshot');
    }
  });

  it('still refuses an unknown package type on the hand-priced path', () => {
    const out = generateProposal({ ...params, packageType: 'not-a-package', book: MARKED, operatorPrice: OP });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') return;
    expect(out.refusals.map((r) => r.code)).toContain('MARK_PACKAGE_TYPE_UNKNOWN');
  });
});
