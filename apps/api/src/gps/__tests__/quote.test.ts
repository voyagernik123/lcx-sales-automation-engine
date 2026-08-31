import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_OFFER, NO_LEGAL_ADVICE_EXCLUSION, OFFERS, OFFER_KEYS,
  PRICE_BANDS_ARE_PLACEHOLDERS, bandMidpointCents, getOffer,
} from '@lcx/shared';
import { PriceNotSuppliedError, TODO_DEPOSIT_PCT, createEngagement, quoteOffer } from '../service.js';

/**
 * QUOTING — behaviour, not shape.
 *
 * `quoteOffer` is the one part of the compartment that is pure, so it is the one
 * part that can be tested for real rather than asserted about at source level.
 * What is worth testing here is not "does it return an object" — it is the three
 * commercial properties the business actually depends on:
 *
 *   1. MARGIN IS VISIBLE AND IS NOT FLATTERED. Partners deliver and the founder
 *      sells; a quote that hides vendor cost is the failure this compartment was
 *      built to end.
 *   2. A BAD QUOTE ANNOUNCES ITSELF. Below the band floor, or below vendor cost,
 *      must produce a warning at quote time — not a discovery at invoice time.
 *   3. THE PLACEHOLDER NUMBERS ARE MARKED AS PLACEHOLDERS. Price bands are not
 *      supplied (decision D4); a system that quietly presents invented prices as
 *      the founder's is worse than the manual process it replaces.
 */

describe('quoteOffer shows the margin', () => {
  it('defaults to the band midpoint and the catalogue vendor cost', () => {
    const q = quoteOffer({ offerKey: 'mica_whitepaper' });
    const offer = getOffer('mica_whitepaper');
    expect(q.priceCents).toBe(bandMidpointCents(offer));
    expect(q.vendorCostCents).toBe(offer.expectedVendorCostCents);
  });

  it('derives margin as price minus vendor cost, in integer cents', () => {
    const q = quoteOffer({ offerKey: 'gtm_sprint', priceCents: 2_000_000, vendorCostCents: 800_000 });
    expect(q.marginCents).toBe(1_200_000);
    // Percent OF PRICE (gross margin), not markup on cost — 60%, not 150%.
    expect(q.marginPct).toBe(60);
  });

  it('reports a NEGATIVE margin rather than clamping it', () => {
    // The whole failure mode would be hiding this. A quote below vendor cost has
    // to read as −$5,000 now, not as $0 discovered at invoice time.
    const q = quoteOffer({ offerKey: 'gtm_sprint', priceCents: 500_000, vendorCostCents: 1_000_000 });
    expect(q.marginCents).toBe(-500_000);
    expect(q.marginPct).toBe(-100);
    expect(q.warnings.join(' ')).toMatch(/does not pay for its own delivery/);
  });

  it('distinguishes "no price yet" from "zero margin"', () => {
    // marginPct is null at price 0, never 0/NaN/Infinity: a UI must be able to
    // tell an unpriced engagement from a break-even one.
    const q = quoteOffer({ offerKey: 'diagnostic', priceCents: 0 });
    expect(q.priceCents).toBe(0);
    expect(q.marginPct).toBeNull();
    expect(q.marginCents).toBeLessThan(0);
  });
});

describe('quoteOffer refuses to make a bad quote look normal', () => {
  it('warns and marks out-of-band when quoted below the floor', () => {
    const band = getOffer('mica_whitepaper').priceBandCents;
    const q = quoteOffer({ offerKey: 'mica_whitepaper', priceCents: band.min - 1 });
    expect(q.withinBand).toBe(false);
    expect(q.warnings.join(' ')).toMatch(/below this offer's band floor/);
  });

  it('warns when quoted above the ceiling, rather than silently accepting scope creep', () => {
    const band = getOffer('gtm_sprint').priceBandCents;
    const q = quoteOffer({ offerKey: 'gtm_sprint', priceCents: band.max + 1 });
    expect(q.withinBand).toBe(false);
    expect(q.warnings.join(' ')).toMatch(/above the band ceiling/);
  });

  it('says every offer is unstaffable, because no partner is named (D5)', () => {
    // partnerOwner is null on all five offers and that is honest, not a stub gap:
    // there is no partner bench yet. A null owner means the engagement cannot be
    // staffed, and the quote has to say so out loud.
    for (const key of OFFER_KEYS) {
      const q = quoteOffer({ offerKey: key });
      expect(q.partnerOwner).toBeNull();
      expect(q.warnings.join(' ')).toMatch(/cannot yet be staffed/);
    }
  });

  it('badges exactly what is still a placeholder — cost and deposit, no longer the price', () => {
    const q = quoteOffer({ offerKey: 'marketing_activation' });
    // D4 answered 2026-08-31 (approved bands), D5 still open (no rate cards):
    // the two flags DIVERGED, which is why vendorCostIsPlaceholder has its own
    // constant — wired to the price flag it would have started lying today.
    expect(q.priceIsPlaceholder).toBe(false);
    expect(q.vendorCostIsPlaceholder).toBe(true);
    expect(q.depositPolicyIsPlaceholder).toBe(true);
    const joined = q.warnings.join(' ');
    expect(joined).toMatch(/expected vendor cost is an UNCALIBRATED PLACEHOLDER \(D5\)/);
    expect(joined).not.toMatch(/price band is an UNCALIBRATED PLACEHOLDER/);
  });

  it('computes the deposit from a single stated percentage', () => {
    // One constant, one place. The deposit term is not agreed either, so it must
    // be replaceable with one edit.
    const q = quoteOffer({ offerKey: 'gtm_sprint', priceCents: 2_000_000 });
    expect(q.depositPct).toBe(TODO_DEPOSIT_PCT);
    expect(q.depositRequiredCents).toBe(Math.round((2_000_000 * TODO_DEPOSIT_PCT) / 100));
  });

  it('normalises the currency and defaults the contracting entity', () => {
    const q = quoteOffer({ offerKey: 'diagnostic', currency: 'eur' });
    expect(q.currency).toBe('EUR');
    // D1 is deliberately undecided; the default lives in the catalogue.
    expect(q.contractingEntity).toBe('lcx');
    expect(quoteOffer({ offerKey: 'diagnostic', contractingEntity: 'external' }).contractingEntity)
      .toBe('external');
  });

  it('throws on an unknown offer rather than pricing it at zero', () => {
    // The route validates against OFFER_KEYS first; this is the second line.
    expect(() => quoteOffer({ offerKey: 'listing_fast_track' as never })).toThrow(/unknown GPS offer/);
  });
});

describe('the frozen scope snapshot carries the perimeter', () => {
  it('freezes the exclusions, not just the inclusions', () => {
    // `ProposalSnapshot` (packages/shared/src/deals/index.ts:69) has no exclusions
    // field at all, which is the gap this snapshot exists to close: with a partner
    // delivering a $10–25k engagement, an unstated exclusion is an unbilled
    // overrun — and, for an exchange employee, an implied promise about listing.
    const snap = quoteOffer({ offerKey: 'mica_whitepaper' }).scopeSnapshot;
    expect(snap.exclusions.length).toBeGreaterThan(5);
    expect(snap.inclusions.length).toBeGreaterThan(0);
    expect(snap.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(snap.requiredClientInputs.length).toBeGreaterThan(0);
    expect(snap.priceWasPlaceholder).toBe(PRICE_BANDS_ARE_PLACEHOLDERS);
  });

  it('holds no field for client-supplied material', () => {
    // Naming the inputs does not create a place to put them (D2, plan §4 S0.4).
    const snap = quoteOffer({ offerKey: 'legal_opinion_coordination' }).scopeSnapshot;
    for (const key of Object.keys(snap)) {
      expect(key).not.toMatch(/attachment|upload|artifact|document|file/i);
    }
  });
});

/**
 * THE CATALOGUE INVARIANT NOBODY OWNED.
 *
 * `catalogue.ts:126` records that the composed-exclusions rule was left unasserted
 * because that file's author owned no test file. It is asserted here, from the API
 * side, because these four lines are the perimeter of a regulated exchange
 * employee's services business and "a reviewer will notice" is not a control.
 */
describe('every offer disclaims the four things it must', () => {
  it.each(OFFERS.map((o) => [o.key, o] as const))('%s', (_key, offer) => {
    const all = offer.exclusions.join(' ').toLowerCase();
    // 1. Listing — the single largest exposure in the programme (plan §9), and
    //    currently moot in the worst way: LCX listing is UNAVAILABLE.
    expect(all).toMatch(/no listing of any kind is included/);
    // 2. Regulator approval — no regulatory fact here was verifiable (plan §0).
    expect(all).toMatch(/no regulatory approval/);
    // 3. Legal advice — the universal line, OR the sharper substitute on the one
    //    offer whose deliverable is counsel's own opinion.
    const universal = offer.exclusions.includes(NO_LEGAL_ADVICE_EXCLUSION);
    const substitute = /do not give legal advice/.test(all);
    expect(
      universal || substitute,
      `${offer.key} disclaims legal advice neither universally nor with a substitute`,
    ).toBe(true);
    // 4. Market outcomes — no price, volume, liquidity or market-making promise.
    //    The MM lane is not built at all until the executed agreement is read (D6).
    expect(all).toMatch(/market-making|market making/);
  });
});

describe('the diagnostic is priced to actually sell', () => {
  it('is creditable against the engagement it qualifies', () => {
    expect(DIAGNOSTIC_OFFER.isDiagnostic).toBe(true);
    expect(DIAGNOSTIC_OFFER.creditableAgainstEngagement).toBe(true);
  });

  it('stays cheaper than every real engagement it qualifies', () => {
    // The 0.4 ratio the placeholder era pinned here did NOT survive the founder's
    // actual decision: he approved a $2.5–6k diagnostic against a $10k cheapest
    // floor (60%), and his creditable-in-full term changes the calculus the old
    // ratio guarded — a credited diagnostic is a down payment, not a surcharge.
    // What must still hold, and what a wrong future edit would break: the
    // diagnostic's CEILING stays strictly below the cheapest real offer's FLOOR,
    // and it stays creditable (asserted above).
    const cheapestRealFloor = Math.min(
      ...OFFERS.filter((o) => !o.isDiagnostic).map((o) => o.priceBandCents.min),
    );
    expect(DIAGNOSTIC_OFFER.priceBandCents.max).toBeLessThan(cheapestRealFloor);
  });

  it('is exactly one offer', () => {
    expect(OFFERS.filter((o) => o.isDiagnostic)).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* WHERE THE NUMBER CAME FROM — the field that had to exist                     */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('a server-invented price is marked, and is not persistable', () => {
  it('reports priceSource: band_midpoint when no price was supplied', () => {
    // `badCents(undefined)` is false — "absent is fine, defaults apply" — so an
    // omitted price fell through to the midpoint of TODO_PRICE_BANDS, the block
    // headed "NOT REAL PRICES. DO NOT QUOTE THESE", and `createEngagement` INSERTed
    // it as the engagement's real price.
    const q = quoteOffer({ offerKey: 'mica_whitepaper' });
    expect(q.priceSource).toBe('band_midpoint');
    expect(q.vendorCostSource).toBe('catalogue_expected');
    // The band is approved now, so the defaulted price is the founder's stated
    // mid — still a default the client never agreed, and the warning says which.
    expect(q.warnings.join(' ')).toMatch(/APPROVED BAND'S MID/);
    expect(q.warnings.join(' ')).toMatch(/not a price this client agreed/);
  });

  it('reports priceSource: supplied for a price a human typed', () => {
    const q = quoteOffer({ offerKey: 'mica_whitepaper', priceCents: 1_800_000, vendorCostCents: 600_000 });
    expect(q.priceSource).toBe('supplied');
    expect(q.vendorCostSource).toBe('supplied');
    expect(q.warnings.join(' ')).not.toMatch(/No price was supplied/);
  });

  it('priceIsPlaceholder cannot tell the two apart — which is why priceSource exists', () => {
    // Not a complaint about the flag: it is the CONSTANT PRICE_BANDS_ARE_PLACEHOLDERS
    // and is honest about the band. It is simply incapable of answering "did a human
    // choose this number", which is the question the persisted row needed answered.
    const invented = quoteOffer({ offerKey: 'gtm_sprint' });
    const chosen = quoteOffer({ offerKey: 'gtm_sprint', priceCents: 1_000_000 });
    expect(invented.priceIsPlaceholder).toBe(chosen.priceIsPlaceholder);
    expect(invented.priceSource).not.toBe(chosen.priceSource);
  });

  it('createEngagement REFUSES to persist a band-midpoint price', async () => {
    // The pool is never reached: the refusal is before the INSERT. If it were not,
    // this test would pass by accident on a stub that returns no rows.
    let queried = false;
    const pool = { query: async () => { queried = true; return { rows: [], rowCount: 0 }; } };
    await expect(
      createEngagement(pool as never, { clientId: 'c1', offerKey: 'mica_whitepaper' }),
    ).rejects.toBeInstanceOf(PriceNotSuppliedError);
    expect(queried).toBe(false);
  });

  it('createEngagement accepts a supplied price of zero — 0 is a decision, absent is not', async () => {
    // $0 is a real thing a founder may quote (a written-off diagnostic). The refusal
    // is about a number nobody chose, not about a small one.
    const rows = [{
      id: 'e1', client_id: 'c1', project_id: null, offer_key: 'mica_whitepaper',
      contracting_entity: 'lcx', scope_snapshot: null, price_cents: '0',
      vendor_cost_cents: '600000', currency: 'USD', status: 'conflict_pending',
      owner: null, deposit_required_cents: '0', deposit_paid_at: null,
      accepted_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    }];
    const pool = { query: async () => ({ rows, rowCount: 1 }) };
    const out = await createEngagement(pool as never, {
      clientId: 'c1', offerKey: 'mica_whitepaper', priceCents: 0,
    });
    expect(out.quote.priceSource).toBe('supplied');
  });
});
