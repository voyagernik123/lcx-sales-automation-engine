import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  ABSENCE_REFUSAL_CODE,
  ART_66_2_FAULT_STANDARD,
  ART_7_1_D_REQUIRED_FACTS,
  ART_7_1_D_WORDING_IS_NOT_PRESCRIBED,
  ELEMENTS_WITHOUT_ABSENCE_CODE,
  ITEM_PURPOSES,
  REGIMES_REQUIRING_HUMAN_CONFIRMATION,
  REGIME_RULESET_VERSION,
  SURFACE_CHANNEL,
  UNLIMITED_CHANNEL,
  X_CHANNEL_LIMIT,
  X_SINGLE_WEIGHT_CODE_POINT_RANGES,
  art7Budget,
  art88CombinationRefusal,
  checkArt7Statement,
  classifyRegimes,
  mandatedBlock,
  marketingCommunicationCharacter,
  missingArt7DisclosureFacts,
  requiredElementsFor,
  unsubstantiatedAdvantageRefusals,
  whitePaperTimingRefusals,
  xWeightedLength,
  type AssetFact,
  type Art7DisclosureBlock,
  type RegimeInput,
} from './regime.js';
import {
  ART_7_1_E_STATEMENT_OFFEROR,
  ART_7_1_E_STATEMENT_PERSON_SEEKING_ADMISSION,
  ART_7_1_E_STATEMENT_PLATFORM_OPERATOR,
  ENGAGEMENT_VERBS,
  INSTRUMENTS,
  MARKETING_REGIMES,
  REFUSAL_CODES,
  SURFACE_CLASS,
  X_POST_MAX_CHARS,
  type AssetSymbol,
  type ContentSurface,
  type MarketingRegime,
  type Refusal,
  type RefusalCode,
} from './types.js';

/* ── Fixtures. Deliberately CLEAN by default: every refusal in this file has to be
   caused by the thing the test names, not inherited from a dirty base. ── */

const DISCLOSURE: Art7DisclosureBlock = {
  whitePaperPublishedStatement: 'A crypto-asset white paper has been published.',
  websiteAddress: 'https://www.lcx.com/legal/whitepapers',
  telephone: '+423 000 0000',
  email: 'compliance@lcx.com',
};

function asset(overrides: Partial<AssetFact> = {}): AssetFact {
  return {
    asset: 'XYZ',
    kind: 'other_crypto_asset',
    treatment: 'mentions',
    lcxAdmission: 'admitted',
    admittedOnAnotherVenue: true,
    embargo: 'clear',
    whitePaper: { kind: 'published', publishedAt: '2026-01-01T00:00:00.000Z' },
    reliesOnArt4Exemption: false,
    lcxActsForIssuer: false,
    authorHolding: 'declared_none',
    ...overrides,
  };
}

function input(overrides: Partial<RegimeInput> = {}): RegimeInput {
  return {
    verb: 'reply',
    surface: 'reply',
    body: 'Deposits are processed once the network confirms the transfer.',
    targetBody: null,
    purpose: 'support_answer',
    assets: [],
    products: [],
    firstPartyLinkPresent: false,
    citesOwnRegulatoryStatus: false,
    consideration: 'none',
    authorAccount: 'lcx_official',
    employmentRelationshipDisclosed: false,
    advantageClaims: [],
    personalisation: { personalised: false, basis: 'no second-person transaction verb', foundBy: 'claim gate' },
    authorisedServices: ['operation of a trading platform for crypto-assets'],
    art7Role: 'platform_operator',
    art7Disclosure: DISCLOSURE,
    addressedTo: ['li', 'eea_other'],
    excludedFrom: ['uk', 'us'],
    at: '2026-08-02T09:00:00.000Z',
    decidedBy: 'nik@lcx.com',
    ...overrides,
  };
}

const codes = (refusals: readonly Refusal[]): readonly RefusalCode[] => refusals.map((r) => r.code);
const hasCode = (refusals: readonly Refusal[], code: RefusalCode): boolean =>
  refusals.some((r) => r.code === code);

/* ══════════════════════════════════════════════════════════════════════════ */
describe('the character model', () => {
  it('counts Latin text as one weighted character per code point', () => {
    expect(xWeightedLength('abc')).toBe(3);
    expect(xWeightedLength('')).toBe(0);
    expect(xWeightedLength('Größe – ünïcode')).toBe([...'Größe – ünïcode'].length);
  });

  it('counts CJK, Hangul and emoji as TWO, which String.length gets wrong', () => {
    // Three CJK characters weigh 6 on X. `.length` says 3.
    expect('日本語'.length).toBe(3);
    expect(xWeightedLength('日本語')).toBe(6);
    expect(xWeightedLength('한국어')).toBe(6);
    // One astral emoji: two UTF-16 units, one code point, weight 2.
    expect(xWeightedLength('🚀')).toBe(2);
    expect([...'🚀'].length).toBe(1);
  });

  it('treats the published weight-100 boundaries as boundaries', () => {
    expect(xWeightedLength(String.fromCodePoint(0x10ff))).toBe(1);
    expect(xWeightedLength(String.fromCodePoint(0x1100))).toBe(2);
    expect(xWeightedLength(String.fromCodePoint(0x2000))).toBe(1);
    expect(xWeightedLength(String.fromCodePoint(0x200e))).toBe(2);
    expect(xWeightedLength(String.fromCodePoint(0x2037))).toBe(1);
    expect(xWeightedLength(String.fromCodePoint(0x2038))).toBe(2);
  });

  it('publishes the ranges it used, ascending and non-overlapping', () => {
    let previousHi = -1;
    for (const [lo, hi] of X_SINGLE_WEIGHT_CODE_POINT_RANGES) {
      expect(lo).toBeLessThanOrEqual(hi);
      expect(lo).toBeGreaterThan(previousHi);
      previousHi = hi;
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('the Art 7 arithmetic — the refusal that is not an opinion', () => {
  it('pins the three verbatim statements at the lengths the Regulation produces', () => {
    expect(xWeightedLength(ART_7_1_E_STATEMENT_OFFEROR)).toBe(261);
    expect(xWeightedLength(ART_7_1_E_STATEMENT_PERSON_SEEKING_ADMISSION)).toBe(289);
    expect(xWeightedLength(ART_7_1_E_STATEMENT_PLATFORM_OPERATOR)).toBe(286);
  });

  it('proves the statement LCX must use does not fit in a post with zero content', () => {
    expect(xWeightedLength(ART_7_1_E_STATEMENT_PLATFORM_OPERATOR)).toBeGreaterThan(X_POST_MAX_CHARS);
    expect(X_POST_MAX_CHARS).toBe(280);
  });

  it('refuses an offer promotion on a post, quoting the shortfall in characters', () => {
    const budget = art7Budget({
      regime: 'offer_promo',
      role: 'platform_operator',
      disclosure: DISCLOSURE,
      body: 'XYZ is live.',
      channel: X_CHANNEL_LIMIT,
    });
    expect(budget.fits).toBe(false);
    expect(budget.mandatedAloneExceedsLimit).toBe(true);
    expect(budget.refusal?.code).toBe('ART_7_BOILERPLATE_DOES_NOT_FIT');
    expect(budget.refusal?.recovery.kind).toBe('different_surface');
    const shortfall = budget.block.totalChars - X_POST_MAX_CHARS;
    expect(shortfall).toBeGreaterThan(0);
    expect(budget.refusal?.sentence).toContain(`short by ${shortfall} characters`);
    expect(budget.refusal?.sentence).toContain(String(budget.block.totalChars));
  });

  it('reports roughly 330+ characters of mandated text, which is the plan\'s claim', () => {
    const block = mandatedBlock('offer_promo', 'platform_operator', DISCLOSURE);
    expect(block.art7_1_eChars).toBe(286);
    expect(block.art7_1_dChars).toBeGreaterThan(0);
    expect(block.totalChars).toBe(block.art7_1_dChars + block.art7_1_eChars + 1);
    expect(block.totalChars).toBeGreaterThan(330);
  });

  it('refuses with supply_data, naming all four facts, when the (d) block is absent', () => {
    const budget = art7Budget({
      regime: 'offer_promo',
      role: 'platform_operator',
      disclosure: null,
      body: 'XYZ is live.',
      channel: X_CHANNEL_LIMIT,
    });
    expect(budget.refusal?.code).toBe('ART_7_BOILERPLATE_DOES_NOT_FIT');
    expect(budget.refusal?.recovery.kind).toBe('supply_data');
    for (const fact of ART_7_1_D_REQUIRED_FACTS) {
      expect(budget.refusal?.recovery).toMatchObject({ missing: expect.stringContaining(fact) });
    }
    // It still tells the operator the (e) statement alone cannot fit.
    expect(budget.refusal?.sentence).toContain('286');
    expect(budget.mandatedAloneExceedsLimit).toBe(true);
  });

  it('will not invent Art 7(1)(d) wording, and says so', () => {
    expect(ART_7_1_D_WORDING_IS_NOT_PRESCRIBED).toBe(true);
    expect(missingArt7DisclosureFacts(null)).toEqual(ART_7_1_D_REQUIRED_FACTS);
    expect(missingArt7DisclosureFacts({ ...DISCLOSURE, telephone: '   ' })).toEqual([
      ART_7_1_D_REQUIRED_FACTS[2],
    ]);
    expect(missingArt7DisclosureFacts(DISCLOSURE)).toEqual([]);
  });

  it('fits on a surface with no character ceiling — the recovery is real', () => {
    const budget = art7Budget({
      regime: 'offer_promo',
      role: 'platform_operator',
      disclosure: DISCLOSURE,
      body: 'A long landing page paragraph.',
      channel: UNLIMITED_CHANNEL,
    });
    expect(budget.fits).toBe(true);
    expect(budget.refusal).toBeNull();
    expect(budget.limit).toBeNull();
  });

  it('omits the (e) statement for ARTs and EMTs, because Art 29 and Art 53 do not have one', () => {
    for (const regime of ['art_promo', 'emt_promo'] as const) {
      const block = mandatedBlock(regime, 'platform_operator', DISCLOSURE);
      expect(block.art7_1_eChars).toBe(0);
      expect(block.art7_1_eText).toBe('');
      expect(block.totalChars).toBe(block.art7_1_dChars);
    }
  });

  it('separates "the boilerplate does not fit" from "your draft is too long"', () => {
    const roomy = { label: 'test channel', maxWeightedChars: 200 };
    const short = art7Budget({
      regime: 'art_promo',
      role: 'platform_operator',
      disclosure: DISCLOSURE,
      body: '',
      channel: roomy,
    });
    expect(short.fits).toBe(true);
    expect(short.remainingForEditorial).toBe(200 - short.block.totalChars);

    const long = art7Budget({
      regime: 'art_promo',
      role: 'platform_operator',
      disclosure: DISCLOSURE,
      body: 'x'.repeat(200),
      channel: roomy,
    });
    expect(long.fits).toBe(false);
    expect(long.mandatedAloneExceedsLimit).toBe(false);
    expect(long.refusal?.code).toBe('LENGTH_BUDGET_EXCEEDED');
    expect(long.refusal?.recovery.kind).toBe('edit_text');
    expect(long.shortfallChars).toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('the Art 7(1)(e) statement is checked byte for byte', () => {
  it('accepts the verbatim statement for the declared role', () => {
    const check = checkArt7Statement(`XYZ is live. ${ART_7_1_E_STATEMENT_PLATFORM_OPERATOR}`, 'platform_operator');
    expect(check.present).toBe(true);
    expect(check.refusal).toBeNull();
  });

  it('refuses the wrong role — it names the wrong person as solely responsible', () => {
    const check = checkArt7Statement(ART_7_1_E_STATEMENT_OFFEROR, 'platform_operator');
    expect(check.present).toBe(false);
    expect(check.wrongRole).toBe('offeror');
    expect(check.refusal?.code).toBe('ART_7_1_E_STATEMENT_ALTERED');
    expect(check.refusal?.matched).toBe(ART_7_1_E_STATEMENT_OFFEROR);
  });

  it('refuses a near-miss rather than accepting a paraphrase', () => {
    const altered = 'This crypto-asset marketing communication has not been reviewed by any regulator.';
    const check = checkArt7Statement(altered, 'platform_operator');
    expect(check.present).toBe(false);
    expect(check.refusal?.code).toBe('ART_7_1_E_STATEMENT_ALTERED');
  });

  it('does not manufacture a refusal when the statement is simply absent', () => {
    const check = checkArt7Statement('Deposits take about ten minutes.', 'platform_operator');
    expect(check.present).toBe(false);
    expect(check.wrongRole).toBeNull();
    expect(check.refusal).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('Art 66(2) is the floor and it is never absent', () => {
  it('assigns casp_conduct for every verb, surface and purpose combination', () => {
    for (const verb of ENGAGEMENT_VERBS) {
      for (const surface of Object.keys(SURFACE_CLASS) as ContentSurface[]) {
        for (const purpose of ITEM_PURPOSES) {
          const decision = classifyRegimes(input({ verb, surface, purpose, body: '' }));
          expect(decision.classification.regimes.length).toBeGreaterThan(0);
          expect(decision.classification.regimes).toContain('casp_conduct');
        }
      }
    }
  });

  it('carries the negligence standard on the decision, not just in a comment', () => {
    expect(ART_66_2_FAULT_STANDARD).toBe('deliberately_or_negligently');
    expect(classifyRegimes(input()).faultStandard).toBe('deliberately_or_negligently');
  });

  it('refuses a declared advantage claim with no recorded check', () => {
    const refusals = unsubstantiatedAdvantageRefusals([
      { text: 'the lowest fees in Europe', substantiation: null },
    ]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.code).toBe('ART_66_2_UNSUBSTANTIATED_SUPERLATIVE');
    expect(refusals[0]!.sentence).toContain('negligently');
    expect(refusals[0]!.matched).toBe('the lowest fees in Europe');
  });

  it('accepts the same claim once the check exists — the fix is a record, not a reword', () => {
    expect(
      unsubstantiatedAdvantageRefusals([
        {
          text: 'the lowest fees in Europe',
          substantiation: {
            sourceRef: 'fee-survey-2026-07',
            verifiedBy: 'nik@lcx.com',
            verifiedAt: '2026-07-30T10:00:00.000Z',
          },
        },
      ]),
    ).toEqual([]);
  });

  it('surfaces the unsubstantiated claim through the classifier too', () => {
    const decision = classifyRegimes(
      input({ advantageClaims: [{ text: 'the safest exchange', substantiation: null }] }),
    );
    expect(hasCode(decision.refusals, 'ART_66_2_UNSUBSTANTIATED_SUPERLATIVE')).toBe(true);
  });

  it('records the identify-as-marketing duty only when the item is a marketing communication', () => {
    const plain = classifyRegimes(input());
    expect(plain.isMarketingCommunication).toBe(false);
    expect(plain.requiredElements.map((r) => r.element)).not.toContain('identified_as_marketing');

    const linked = classifyRegimes(input({ firstPartyLinkPresent: true }));
    expect(linked.isMarketingCommunication).toBe(true);
    expect(linked.requiredElements.map((r) => r.element)).toContain('identified_as_marketing');
  });

  it('flips education into promotion the moment a first-party link appears', () => {
    const bare = marketingCommunicationCharacter(input({ purpose: 'education' }));
    expect(bare.is).toBe(false);
    const linked = marketingCommunicationCharacter(
      input({ purpose: 'education', firstPartyLinkPresent: true }),
    );
    expect(linked.is).toBe(true);
    expect(linked.citation.instrument).toBe(INSTRUMENTS.esma_reverse_solicitation.key);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('Art 7 bites when the item promotes an offer or an admission to trading', () => {
  it('classifies a new-listing post as offer_promo, on the platform-operator limb', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        body: 'XYZ is now live on LCX.',
        assets: [asset({ treatment: 'promotes_trading' })],
      }),
    );
    expect(decision.classification.regimes).toContain('offer_promo');
    const assignment = decision.classification.assignments.find((a) => a.regime === 'offer_promo');
    expect(assignment?.basis).toContain('operator of the trading platform');
    expect(assignment?.citation.provision).toBe('Art 7(1)');
    expect(assignment?.decidedBy).toBe('nik@lcx.com');
    expect(assignment?.decidedAt).toBe('2026-08-02T09:00:00.000Z');
  });

  it('does NOT assign offer_promo to a factual mention', () => {
    const decision = classifyRegimes(input({ assets: [asset({ treatment: 'mentions' })] }));
    expect(decision.classification.regimes).not.toContain('offer_promo');
    expect(decision.art7).toBeNull();
  });

  it('runs the arithmetic and refuses the moment a listing promo lands on a post', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ treatment: 'promotes_trading' })],
      }),
    );
    expect(decision.art7?.refusal?.code).toBe('ART_7_BOILERPLATE_DOES_NOT_FIT');
    expect(hasCode(decision.refusals, 'ART_7_BOILERPLATE_DOES_NOT_FIT')).toBe(true);
    // The refusal on the decision IS the object the budget produced: they cannot drift.
    expect(decision.refusals).toContain(decision.art7!.refusal!);
  });

  it('stops refusing the same item on a landing page', () => {
    const decision = classifyRegimes(
      input({
        surface: 'campaign_landing_copy',
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ treatment: 'promotes_trading' })],
      }),
    );
    expect(decision.art7?.fits).toBe(true);
    expect(hasCode(decision.refusals, 'ART_7_BOILERPLATE_DOES_NOT_FIT')).toBe(false);
    expect(SURFACE_CHANNEL.campaign_landing_copy).toBe(UNLIMITED_CHANNEL);
  });

  it('routes an ART to Art 29 and an EMT to Art 53, only when LCX acts for the issuer', () => {
    const art = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ kind: 'asset_referenced_token', treatment: 'promotes_offer', lcxActsForIssuer: true })],
      }),
    );
    expect(art.classification.regimes).toContain('art_promo');
    expect(art.classification.regimes).not.toContain('offer_promo');

    const emt = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ kind: 'e_money_token', treatment: 'promotes_offer', lcxActsForIssuer: true })],
      }),
    );
    expect(emt.classification.regimes).toContain('emt_promo');

    const notForIssuer = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ kind: 'asset_referenced_token', treatment: 'promotes_offer', lcxActsForIssuer: false })],
      }),
    );
    expect(notForIssuer.classification.regimes).not.toContain('art_promo');
  });

  it('refuses rather than guessing when the asset kind is unknown and the item promotes', () => {
    const promoting = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ kind: 'unknown', treatment: 'promotes_trading' })],
      }),
    );
    expect(hasCode(promoting.refusals, 'ASSET_STATE_UNKNOWN')).toBe(true);
    const refusal = promoting.refusals.find((r) => r.code === 'ASSET_STATE_UNKNOWN')!;
    expect(refusal.recovery.kind).toBe('supply_data');
    expect(refusal.sentence).toContain('no safe superset');

    // The same unknown kind is NOT refused for a passing mention: nothing turns on it.
    const mentioning = classifyRegimes(
      input({ assets: [asset({ kind: 'unknown', treatment: 'mentions' })] }),
    );
    expect(hasCode(mentioning.refusals, 'ASSET_STATE_UNKNOWN')).toBe(false);
  });

  it('requires the redemption-right statement on an EMT promotion, and cites Art 53(2) not Art 29(2)', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ kind: 'e_money_token', treatment: 'promotes_offer', lcxActsForIssuer: true })],
      }),
    );
    const req = decision.requiredElements.find((r) => r.element === 'redemption_right_statement');
    expect(req).toBeDefined();
    // The element is one; the text that satisfies it is not. Art 53(2) adds "at par
    // value" and Art 29(2) does not, so an EMT promotion cited to Art 29(2) would clear
    // on wording that breaches Art 53(2).
    expect(req!.citation.provision).toBe('Art 53(2)');
    expect(req!.citation.text).toContain('at par value');
    // Absence now refuses under its own name instead of being reported in prose.
    expect(req!.absenceCode).toBe('ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING');
  });

  it('still says what it did NOT check about the redemption-right wording', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ kind: 'asset_referenced_token', treatment: 'promotes_offer', lcxActsForIssuer: true })],
      }),
    );
    const gap = decision.coverage.find(
      (c) => c.axis === 'redemption_right_statement_wording_not_checked',
    );
    expect(gap).toBeDefined();
    expect(gap!.sentence).toContain('at par value');
    expect(gap!.sentence).toContain('right of redemption');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('Title VI is broader than people expect', () => {
  it('bites on a pending admission request, not only on a live listing', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ lcxAdmission: 'admission_requested', admittedOnAnotherVenue: false })] }),
    );
    expect(decision.classification.regimes).toContain('market_abuse');
    const assignment = decision.classification.assignments.find((a) => a.regime === 'market_abuse');
    expect(assignment?.basis).toContain('pending admission request');
    expect(assignment?.citation.provision).toBe('Art 86(1)-(3)');
    expect(assignment?.citation.text).toContain('in the Union and in third countries');
  });

  it('bites on an asset LCX does not list but another venue does', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ lcxAdmission: 'not_on_lcx', admittedOnAnotherVenue: true })] }),
    );
    expect(decision.classification.regimes).toContain('market_abuse');
  });

  it('widens rather than clears when admission state cannot be established', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ lcxAdmission: 'not_on_lcx', admittedOnAnotherVenue: 'unknown' })] }),
    );
    expect(decision.classification.regimes).toContain('market_abuse');
    const gap = decision.coverage.find((c) => c.axis === 'title_vi_venues_beyond_lcx');
    expect(gap?.sentence).toContain('in the Union and in third countries');
  });

  it('leaves Title VI out only when the answer is actually no', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ lcxAdmission: 'not_on_lcx', admittedOnAnotherVenue: false })] }),
    );
    expect(decision.classification.regimes).not.toContain('market_abuse');
    expect(decision.coverage.some((c) => c.axis === 'title_vi_venues_beyond_lcx')).toBe(false);
  });

  it('will not let a machine settle market_abuse or advice by itself', () => {
    const decision = classifyRegimes(input({ assets: [asset()] }));
    expect(decision.requiresHumanConfirmation).toContain('market_abuse');
    expect(REGIMES_REQUIRING_HUMAN_CONFIRMATION).toEqual(['market_abuse', 'advice']);
    const clean = classifyRegimes(input());
    expect(clean.requiresHumanConfirmation).toEqual([]);
  });

  it('requires the conflict disclosure IN THE POST, above the fold, when a holding is declared', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ authorHolding: 'declared_holding' })] }),
    );
    const element = decision.requiredElements.find(
      (r) => r.element === 'conflict_of_interest_disclosure',
    );
    expect(element).toBeDefined();
    expect(element!.mustBeAboveTruncationFold).toBe(true);
    expect(element!.citation.provision).toBe('Art 91(3)(c)');
    expect(element!.absenceCode).toBe('ART_91_3_C_UNDISCLOSED_HOLDING');
  });

  it('names the holdings join as owed when the register did not answer', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ authorHolding: 'register_absent' })] }),
    );
    const gap = decision.coverage.find((c) => c.axis === 'holdings_register_not_joined');
    expect(gap?.sentence).toContain('700 000');
    expect(decision.requiredElements.map((r) => r.element)).not.toContain(
      'conflict_of_interest_disclosure',
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('Art 88(1) — the disclosure and the advert may not be one artefact', () => {
  it('refuses a celebratory listing post that both reveals and sells', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        body: 'Big news: XYZ is live on LCX today. Start trading now.',
        firstPartyLinkPresent: true,
        assets: [
          asset({ treatment: 'discloses_non_public' }),
          asset({ asset: 'ABC', treatment: 'promotes_trading' }),
        ],
      }),
    );
    const refusal = decision.refusals.find((r) => r.code === 'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
    expect(refusal).toBeDefined();
    expect(refusal!.rule.provision).toBe('Art 88(1)');
    expect(refusal!.recovery.kind).toBe('different_surface');
    expect(refusal!.sentence).toContain('XYZ');
  });

  it('does not fire on a bare disclosure — the fix is two artefacts, so one must be allowed', () => {
    const bare = input({
      purpose: 'inside_information_disclosure',
      body: 'LCX has admitted XYZ to trading with effect from today.',
      firstPartyLinkPresent: false,
      citesOwnRegulatoryStatus: false,
      assets: [asset({ treatment: 'discloses_non_public' })],
    });
    expect(art88CombinationRefusal(bare, marketingCommunicationCharacter(bare).is)).toBeNull();
    expect(hasCode(classifyRegimes(bare).refusals, 'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING')).toBe(
      false,
    );
  });

  it('does not fire on a bare promotion either', () => {
    const promo = input({
      purpose: 'product_promotion',
      firstPartyLinkPresent: true,
      assets: [asset({ treatment: 'promotes_trading' })],
    });
    expect(art88CombinationRefusal(promo, true)).toBeNull();
  });

  it('fires on a disclosure that only adds a link — a link is marketing', () => {
    const linked = input({
      purpose: 'inside_information_disclosure',
      firstPartyLinkPresent: true,
      assets: [asset({ treatment: 'discloses_non_public' })],
    });
    const refusal = art88CombinationRefusal(linked, marketingCommunicationCharacter(linked).is);
    expect(refusal?.code).toBe('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
    expect(refusal?.sentence).toContain('first-party link');
  });

  it("fires on a disclosure that leans on LCX's regulated status", () => {
    const halo = input({
      purpose: 'inside_information_disclosure',
      citesOwnRegulatoryStatus: true,
      assets: [asset({ treatment: 'discloses_non_public' })],
    });
    const refusal = art88CombinationRefusal(halo, marketingCommunicationCharacter(halo).is);
    expect(refusal?.sentence).toContain('regulated status');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('Art 7(2) — no marketing before the white paper', () => {
  const promoted = new Map<AssetSymbol, MarketingRegime>([['XYZ', 'offer_promo']]);

  it('refuses when a required white paper has not been published', () => {
    const refusals = whitePaperTimingRefusals(
      [asset({ treatment: 'promotes_trading', whitePaper: { kind: 'required_not_published' } })],
      promoted,
      '2026-08-02T09:00:00.000Z',
    );
    expect(codes(refusals)).toEqual(['ART_7_2_WHITE_PAPER_NOT_PUBLISHED']);
    expect(refusals[0]!.recovery.kind).toBe('wait_until');
    expect(refusals[0]!.sentence).toContain('no wording fixes it');
  });

  it('refuses when the item pre-dates publication, and says both instants', () => {
    const refusals = whitePaperTimingRefusals(
      [
        asset({
          treatment: 'promotes_trading',
          whitePaper: { kind: 'published', publishedAt: '2026-09-01T00:00:00.000Z' },
        }),
      ],
      promoted,
      '2026-08-02T09:00:00.000Z',
    );
    expect(codes(refusals)).toEqual(['ART_7_2_WHITE_PAPER_NOT_PUBLISHED']);
    expect(refusals[0]!.sentence).toContain('2026-08-02T09:00:00.000Z');
    expect(refusals[0]!.sentence).toContain('2026-09-01T00:00:00.000Z');
  });

  it('clears when publication precedes the item', () => {
    expect(
      whitePaperTimingRefusals(
        [asset({ treatment: 'promotes_trading' })],
        promoted,
        '2026-08-02T09:00:00.000Z',
      ),
    ).toEqual([]);
  });

  it('refuses an unknown white-paper state rather than assuming publication', () => {
    const refusals = whitePaperTimingRefusals(
      [asset({ treatment: 'promotes_trading', whitePaper: { kind: 'unknown' } })],
      promoted,
      '2026-08-02T09:00:00.000Z',
    );
    expect(codes(refusals)).toEqual(['ASSET_STATE_UNKNOWN']);
    expect(refusals[0]!.recovery.kind).toBe('supply_data');
  });

  it('refuses an unparseable publication instant instead of sorting it as epoch zero', () => {
    const refusals = whitePaperTimingRefusals(
      [asset({ treatment: 'promotes_trading', whitePaper: { kind: 'published', publishedAt: 'soon' } })],
      promoted,
      '2026-08-02T09:00:00.000Z',
    );
    expect(codes(refusals)).toEqual(['ASSET_STATE_UNKNOWN']);
    expect(refusals[0]!.sentence).toContain('cannot be read as an instant');
  });

  it('does not apply the timing rule to an asset that is only mentioned', () => {
    expect(
      whitePaperTimingRefusals(
        [asset({ treatment: 'mentions', whitePaper: { kind: 'required_not_published' } })],
        new Map(),
        '2026-08-02T09:00:00.000Z',
      ),
    ).toEqual([]);
  });

  it('reaches the classifier: a coming-soon promo with no white paper is refused', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        body: 'XYZ listing coming soon.',
        assets: [
          asset({ treatment: 'signals_future_admission', whitePaper: { kind: 'required_not_published' } }),
        ],
      }),
    );
    expect(hasCode(decision.refusals, 'ART_7_2_WHITE_PAPER_NOT_PUBLISHED')).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('Art 4(4), Art 90 and the campaign that stops being free', () => {
  it('refuses a listing tease that destroys somebody else\'s Art 4 exemption', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ treatment: 'signals_future_admission', reliesOnArt4Exemption: true })],
      }),
    );
    const refusal = decision.refusals.find((r) => r.code === 'ART_4_4_EXEMPTION_DESTROYING_STATEMENT');
    expect(refusal?.rule.provision).toBe('Art 4(4)');
    expect(refusal?.recovery.kind).toBe('edit_text');
    expect(refusal?.sentence).toContain('counterparty');
  });

  it('does not fire Art 4(4) when no exemption is relied on', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        assets: [asset({ treatment: 'signals_future_admission', reliesOnArt4Exemption: false })],
      }),
    );
    expect(hasCode(decision.refusals, 'ART_4_4_EXEMPTION_DESTROYING_STATEMENT')).toBe(false);
  });

  it('refuses a teaser about an asset under embargo', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ treatment: 'signals_future_admission', embargo: 'mnpi_pending' })] }),
    );
    const refusal = decision.refusals.find((r) => r.code === 'ART_90_ASSET_UNDER_EMBARGO');
    expect(refusal?.rule.provision).toBe('Art 90(1)');
    expect(refusal?.recovery.kind).toBe('wait_until');
    expect(refusal?.sentence).toContain('normal exercise of an employment');
  });

  it('stays narrow: a passing mention of an embargoed asset is the perimeter\'s call, not this module\'s', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ treatment: 'mentions', embargo: 'mnpi_pending' })] }),
    );
    expect(hasCode(decision.refusals, 'ART_90_ASSET_UNDER_EMBARGO')).toBe(false);
    expect(decision.coverage.some((c) => c.axis === 'embargo_register_not_joined')).toBe(true);
  });

  it('refuses an unknown embargo state on a signal, because that guess is unrecoverable', () => {
    const decision = classifyRegimes(
      input({ assets: [asset({ treatment: 'signals_future_admission', embargo: 'unknown' })] }),
    );
    const refusal = decision.refusals.find(
      (r) => r.code === 'ASSET_STATE_UNKNOWN' && r.rule.provision === 'Art 90(1)',
    );
    expect(refusal?.recovery).toMatchObject({ kind: 'supply_data' });
    expect(refusal!.sentence).toContain('personal liability');
  });

  it('turns a data-harvesting giveaway into an Art 7 promotion via Art 4(3)', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'campaign_or_giveaway',
        giveawayRequiresPersonalDataOrBenefit: true,
        prizeDrawExclusionsFromCounsel: true,
        assets: [asset({ treatment: 'mentions' })],
      }),
    );
    expect(decision.classification.regimes).toContain('offer_promo');
    const assignment = decision.classification.assignments.find((a) => a.regime === 'offer_promo');
    expect(assignment?.citation.provision).toBe('Art 4(3), second subparagraph');
    expect(assignment?.basis).toContain('not offered for free');
  });

  it('refuses a giveaway whose mechanics it has not been told', () => {
    const decision = classifyRegimes(
      input({ purpose: 'campaign_or_giveaway', prizeDrawExclusionsFromCounsel: true }),
    );
    const refusal = decision.refusals.find(
      (r) => r.code === 'ASSET_STATE_UNKNOWN' && r.rule.provision === 'Art 4(3), second subparagraph',
    );
    expect(refusal).toBeDefined();
    expect(refusal!.recovery).toMatchObject({ kind: 'supply_data' });
  });

  it('will not generate a prize draw without jurisdiction exclusions from counsel', () => {
    const decision = classifyRegimes(
      input({ purpose: 'campaign_or_giveaway', giveawayRequiresPersonalDataOrBenefit: false }),
    );
    const refusal = decision.refusals.find(
      (r) => r.code === 'PRIZE_DRAW_JURISDICTION_EXCLUSIONS_ABSENT',
    );
    expect(refusal?.recovery).toEqual({ kind: 'human_authority', role: 'legal' });
    expect(decision.coverage.some((c) => c.axis === 'national_gambling_law_not_assessed')).toBe(true);

    const cleared = classifyRegimes(
      input({
        purpose: 'campaign_or_giveaway',
        giveawayRequiresPersonalDataOrBenefit: false,
        prizeDrawExclusionsFromCounsel: true,
      }),
    );
    expect(hasCode(cleared.refusals, 'PRIZE_DRAW_JURISDICTION_EXCLUSIONS_ABSENT')).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('the UCPD axis', () => {
  it('treats a comped ticket as consideration — a contract and a payment are not necessary', () => {
    const decision = classifyRegimes(
      input({ purpose: 'partner_amplification', consideration: 'event_invitation' }),
    );
    expect(decision.classification.regimes).toContain('ucpd_paid_promotion');
    const element = decision.requiredElements.find((r) => r.element === 'paid_promotion_disclosure');
    expect(element?.mustBeAboveTruncationFold).toBe(true);
    expect(element?.absenceCode).toBe('UCPD_UNDISCLOSED_PAID_PROMOTION');
  });

  it('refuses to amplify a third party whose consideration status is unknown', () => {
    const decision = classifyRegimes(
      input({ purpose: 'partner_amplification', consideration: 'unknown' }),
    );
    expect(hasCode(decision.refusals, 'PARTNER_CONSIDERATION_UNKNOWN')).toBe(true);
    expect(decision.classification.regimes).toContain('ucpd_paid_promotion');
  });

  it('does not invent a partner question when there is no third party and nothing passed', () => {
    const decision = classifyRegimes(input({ consideration: 'none' }));
    expect(hasCode(decision.refusals, 'PARTNER_CONSIDERATION_UNKNOWN')).toBe(false);
    expect(decision.classification.regimes).not.toContain('ucpd_paid_promotion');
  });

  it('refuses staff promoting LCX from a personal account without saying so', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'product_promotion',
        authorAccount: 'staff_personal',
        employmentRelationshipDisclosed: false,
      }),
    );
    const refusal = decision.refusals.find((r) => r.code === 'UCPD_STAFF_POSING_AS_CONSUMER');
    expect(refusal?.rule.provision).toBe('Annex I point 22');
    expect(refusal?.sentence).toContain('all circumstances');
  });

  it('clears the same post once the relationship is disclosed in the visible text', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'product_promotion',
        authorAccount: 'staff_personal',
        employmentRelationshipDisclosed: true,
      }),
    );
    expect(hasCode(decision.refusals, 'UCPD_STAFF_POSING_AS_CONSUMER')).toBe(false);
    expect(decision.classification.regimes).toContain('ucpd_paid_promotion');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('advice, and the authorisation perimeter behind it', () => {
  it('does not conclude "not advice" when nobody assessed personalisation', () => {
    const decision = classifyRegimes(input({ personalisation: undefined }));
    expect(decision.classification.regimes).not.toContain('advice');
    const gap = decision.coverage.find((c) => c.axis === 'advice_personalisation_not_assessed');
    expect(gap?.sentence).toContain('not a finding of no advice');
  });

  it('refuses a personalised recommendation as not recoverable, disclaimer or not', () => {
    const decision = classifyRegimes(
      input({
        personalisation: { personalised: true, basis: '"you should add here"', foundBy: 'claim gate' },
      }),
    );
    expect(decision.classification.regimes).toContain('advice');
    expect(decision.requiresHumanConfirmation).toContain('advice');
    const refusal = decision.refusals.find((r) => r.code === 'ART_81_PERSONALISED_RECOMMENDATION');
    expect(refusal?.recovery.kind).toBe('not_recoverable');
    expect(refusal?.sentence).toContain('not financial advice');
  });

  it('escalates to unauthorised activity when advice is off the authorised list', () => {
    const decision = classifyRegimes(
      input({
        personalisation: { personalised: true, basis: '"buy here"', foundBy: 'claim gate' },
        authorisedServices: ['operation of a trading platform for crypto-assets'],
      }),
    );
    const refusal = decision.refusals.find((r) => r.code === 'SERVICE_NOT_AUTHORISED');
    expect(refusal?.rule.provision).toBe('Art 59(1)');
    expect(refusal?.recovery.kind).toBe('not_recoverable');
  });

  it('says it cannot grade the severity when the authorised list is absent', () => {
    const decision = classifyRegimes(
      input({
        personalisation: { personalised: true, basis: '"buy here"', foundBy: 'claim gate' },
        authorisedServices: null,
      }),
    );
    expect(hasCode(decision.refusals, 'AUTHORISED_SERVICE_LIST_ABSENT')).toBe(true);
    expect(hasCode(decision.refusals, 'SERVICE_NOT_AUTHORISED')).toBe(false);
    expect(decision.coverage.some((c) => c.axis === 'authorised_service_list_absent')).toBe(true);
  });

  it('does not escalate when the service IS authorised', () => {
    const decision = classifyRegimes(
      input({
        personalisation: { personalised: true, basis: '"buy here"', foundBy: 'claim gate' },
        authorisedServices: ['providing advice on crypto-assets'],
      }),
    );
    expect(hasCode(decision.refusals, 'SERVICE_NOT_AUTHORISED')).toBe(false);
    expect(hasCode(decision.refusals, 'ART_81_PERSONALISED_RECOMMENDATION')).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('the halo effect — the engine flags its owner\'s favourite sentence', () => {
  it("refuses LCX's regulated status as a promotional tool for an unregulated product", () => {
    const decision = classifyRegimes(
      input({
        purpose: 'product_promotion',
        citesOwnRegulatoryStatus: true,
        products: [{ name: 'LCX Earn', status: 'not_mica_regulated' }],
      }),
    );
    const refusal = decision.refusals.find((r) => r.code === 'ESMA_REGULATORY_STATUS_AS_PROMOTION');
    expect(refusal?.rule.instrument).toBe(INSTRUMENTS.esma_halo.key);
    expect(refusal?.sentence).toContain('Regulated in Liechtenstein');
    expect(refusal?.recovery.kind).toBe('edit_text');
  });

  it('requires the status marker, above the fold, whenever an unregulated product is named', () => {
    const decision = classifyRegimes(
      input({ purpose: 'product_promotion', products: [{ name: 'LCX Earn', status: 'not_mica_regulated' }] }),
    );
    const element = decision.requiredElements.find(
      (r) => r.element === 'regulated_status_of_named_product',
    );
    expect(element?.mustBeAboveTruncationFold).toBe(true);
    expect(element?.absenceCode).toBe('ESMA_UNREGULATED_PRODUCT_STATUS_MISSING');
  });

  it('refuses an unknown product status rather than assuming the product is regulated', () => {
    const decision = classifyRegimes(
      input({ products: [{ name: 'LCX Vault', status: 'unknown' }] }),
    );
    const refusal = decision.refusals.find((r) => r.code === 'PRODUCT_REGULATORY_STATUS_UNKNOWN');
    expect(refusal?.matched).toBe('LCX Vault');
  });

  it('permits the licence claim about a regulated product', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'product_promotion',
        citesOwnRegulatoryStatus: true,
        products: [{ name: 'LCX Exchange', status: 'mica_regulated' }],
      }),
    );
    expect(hasCode(decision.refusals, 'ESMA_REGULATORY_STATUS_AS_PROMOTION')).toBe(false);
    expect(hasCode(decision.refusals, 'PRODUCT_REGULATORY_STATUS_UNKNOWN')).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('the mandatory-element union', () => {
  it('is a union, not a winner: one element can be required by several regimes', () => {
    const elements = requiredElementsFor({
      regimes: ['casp_conduct', 'offer_promo'],
      isMarketingCommunication: true,
      concernsCryptoAssetTransactions: true,
      providesServiceInRelationToNamedAsset: true,
      whitePaperRequiredForPromotedAsset: true,
      anyDeclaredHolding: false,
      anyUnregulatedProductNamed: false,
    });
    const identify = elements.find((e) => e.element === 'identified_as_marketing');
    expect(identify?.requiredBy).toEqual(['casp_conduct', 'offer_promo']);
    // Cited under the baseline duty, which is the earlier regime in MARKETING_REGIMES order.
    expect(identify?.citation.provision).toBe('Art 66(2)');
  });

  it('gives offer_promo the (e) statement and gives ARTs and EMTs none', () => {
    const base = {
      isMarketingCommunication: true,
      concernsCryptoAssetTransactions: true,
      providesServiceInRelationToNamedAsset: false,
      whitePaperRequiredForPromotedAsset: true,
      anyDeclaredHolding: false,
      anyUnregulatedProductNamed: false,
    };
    const offer = requiredElementsFor({ ...base, regimes: ['casp_conduct', 'offer_promo'] });
    expect(offer.map((e) => e.element)).toContain('no_authority_review_statement');

    for (const regime of ['art_promo', 'emt_promo'] as const) {
      const other = requiredElementsFor({ ...base, regimes: ['casp_conduct', regime] });
      expect(other.map((e) => e.element)).not.toContain('no_authority_review_statement');
      expect(other.map((e) => e.element)).toContain('white_paper_published_statement');
      expect(other.map((e) => e.element)).toContain('offeror_contact_details');
      expect(other.map((e) => e.element)).toContain('consistent_with_white_paper');
    }
  });

  it('drops consistent_with_white_paper when no white paper is required — Art 7(1)(c) is conditional', () => {
    const elements = requiredElementsFor({
      regimes: ['casp_conduct', 'offer_promo'],
      isMarketingCommunication: true,
      concernsCryptoAssetTransactions: true,
      providesServiceInRelationToNamedAsset: false,
      whitePaperRequiredForPromotedAsset: false,
      anyDeclaredHolding: false,
      anyUnregulatedProductNamed: false,
    });
    expect(elements.map((e) => e.element)).not.toContain('consistent_with_white_paper');
  });

  it('requires the Art 66(3) risk warning only for items that concern crypto-asset transactions', () => {
    const withAsset = classifyRegimes(input({ assets: [asset()] }));
    expect(withAsset.requiredElements.map((e) => e.element)).toContain('risk_warning');
    const without = classifyRegimes(input({ assets: [] }));
    expect(without.requiredElements.map((e) => e.element)).not.toContain('risk_warning');
  });

  it('requires the white-paper hyperlink when a service is provided in relation to the named asset', () => {
    const promoting = classifyRegimes(
      input({ purpose: 'product_promotion', assets: [asset({ treatment: 'promotes_trading' })] }),
    );
    expect(promoting.requiredElements.map((e) => e.element)).toContain('white_paper_hyperlink');
    const mentioning = classifyRegimes(input({ assets: [asset({ treatment: 'mentions' })] }));
    expect(mentioning.requiredElements.map((e) => e.element)).not.toContain('white_paper_hyperlink');
  });

  it('is ordered stably, and orders by regime priority', () => {
    const args = {
      regimes: ['casp_conduct', 'offer_promo', 'ucpd_paid_promotion'] as const,
      isMarketingCommunication: true,
      concernsCryptoAssetTransactions: true,
      providesServiceInRelationToNamedAsset: true,
      whitePaperRequiredForPromotedAsset: true,
      anyDeclaredHolding: false,
      anyUnregulatedProductNamed: false,
    };
    const a = requiredElementsFor(args);
    const b = requiredElementsFor(args);
    expect(a).toEqual(b);
    const names = a.map((e) => e.element);
    expect(names.indexOf('paid_promotion_disclosure')).toBeGreaterThan(
      names.indexOf('no_authority_review_statement'),
    );
  });

  it('maps every element to a real refusal code, or to an honest null', () => {
    for (const [element, code] of Object.entries(ABSENCE_REFUSAL_CODE)) {
      if (code == null) {
        expect(ELEMENTS_WITHOUT_ABSENCE_CODE).toContain(element);
        continue;
      }
      expect(REFUSAL_CODES).toContain(code);
      expect(ELEMENTS_WITHOUT_ABSENCE_CODE).not.toContain(element);
    }
    // The gap is real and must not be quietly closed by repurposing a code.
    expect(ELEMENTS_WITHOUT_ABSENCE_CODE.length).toBeGreaterThan(0);
  });

  it('leaves exactly one element without an absence code, and it is the quality standard', () => {
    /*
     * FOUR OF THE FIVE GAPS CLOSED IN THE INTEGRATION PASS. This test asserted that
     * `no_authority_review_statement` was reported in prose because no code could name its
     * absence; `ART_7_1_E_STATEMENT_MISSING` now does, alongside
     * `ART_7_1_B_WHITE_PAPER_STATEMENT_MISSING`, `ART_7_1_A_OFFEROR_CONTACT_MISSING` and
     * `ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING`.
     *
     * `fair_clear_not_misleading` stays uncoded ON PURPOSE and this test pins that too:
     * Art 7(1)(b)/Art 66(2) is a QUALITY STANDARD, not a component. No span of text
     * satisfies it by being inserted, so an absence code would invite a check that looks
     * for a sentence saying "this is fair and clear" — the compliance theatre this
     * compartment exists to refuse.
     */
    expect(ELEMENTS_WITHOUT_ABSENCE_CODE).toEqual(['fair_clear_not_misleading']);
    for (const el of ['no_authority_review_statement', 'white_paper_published_statement',
      'offeror_contact_details', 'redemption_right_statement'] as const) {
      expect(ABSENCE_REFUSAL_CODE[el], el).not.toBeNull();
      expect(REFUSAL_CODES, el).toContain(ABSENCE_REFUSAL_CODE[el]);
    }

    const decision = classifyRegimes(
      input({
        purpose: 'offer_or_listing_promotion',
        surface: 'campaign_landing_copy',
        assets: [asset({ treatment: 'promotes_trading' })],
      }),
    );
    const gap = decision.coverage.find((c) => c.axis === 'element_absence_has_no_refusal_code');
    expect(gap?.sentence).toContain('fair_clear_not_misleading');
    expect(gap?.sentence).not.toContain('no_authority_review_statement');
  });

  it('always states that requirement is not presence', () => {
    const decision = classifyRegimes(input());
    const gap = decision.coverage.find((c) => c.axis === 'element_presence_not_checked');
    expect(gap?.sentence).toContain('never presence');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('invariants every refusal and every decision must satisfy', () => {
  const corpus = [
    input(),
    input({ firstPartyLinkPresent: true }),
    input({ purpose: 'offer_or_listing_promotion', assets: [asset({ treatment: 'promotes_trading' })] }),
    input({ purpose: 'offer_or_listing_promotion', assets: [asset({ kind: 'unknown', treatment: 'promotes_offer' })] }),
    input({ assets: [asset({ treatment: 'discloses_non_public' })], firstPartyLinkPresent: true }),
    input({ assets: [asset({ treatment: 'signals_future_admission', embargo: 'mnpi_pending', reliesOnArt4Exemption: true })] }),
    input({ purpose: 'campaign_or_giveaway' }),
    input({ purpose: 'partner_amplification', consideration: 'unknown', targetBody: 'a partner post' }),
    input({ authorAccount: 'staff_personal', purpose: 'product_promotion' }),
    input({ personalisation: { personalised: true, basis: '"you should buy"', foundBy: 'gate' }, authorisedServices: null }),
    input({ products: [{ name: 'LCX Earn', status: 'unknown' }] }),
    input({ advantageClaims: [{ text: 'lowest fees', substantiation: null }] }),
    input({ art7Disclosure: null, purpose: 'offer_or_listing_promotion', assets: [asset({ treatment: 'promotes_offer' })] }),
  ];

  it('emits only codes that exist in the vocabulary', () => {
    for (const item of corpus) {
      for (const refusal of classifyRegimes(item).refusals) {
        expect(REFUSAL_CODES).toContain(refusal.code);
      }
    }
  });

  it('gives every refusal a human sentence, a checkable rule and a stamped version', () => {
    const instrumentKeys = Object.keys(INSTRUMENTS);
    for (const item of corpus) {
      for (const refusal of classifyRegimes(item).refusals) {
        expect(refusal.sentence.length).toBeGreaterThan(40);
        expect(refusal.sentence.trimEnd().endsWith('.')).toBe(true);
        expect(instrumentKeys).toContain(refusal.rule.instrument);
        expect(refusal.rule.provision.length).toBeGreaterThan(0);
        expect(refusal.rule.text.length).toBeGreaterThan(20);
        expect(refusal.ruleSetVersion).toBe(REGIME_RULESET_VERSION);
      }
    }
  });

  it('never returns a bare warning where a refusal is due, and never an empty regime set', () => {
    for (const item of corpus) {
      const decision = classifyRegimes(item);
      expect(decision.classification.regimes.length).toBeGreaterThan(0);
      expect(decision.classification.assignments.length).toBeGreaterThan(0);
      expect(decision.classification.ruleSetVersion).toBe(REGIME_RULESET_VERSION);
      for (const assignment of decision.classification.assignments) {
        expect(assignment.decidedAt).toBe(item.at);
        expect(assignment.decidedBy).toBe(item.decidedBy);
        expect(assignment.basis.length).toBeGreaterThan(20);
      }
    }
  });

  it('orders the regime set canonically, so two panels agree on what it says', () => {
    const decision = classifyRegimes(
      input({
        purpose: 'partner_amplification',
        consideration: 'token_allocation',
        assets: [asset({ treatment: 'promotes_trading' })],
        personalisation: { personalised: true, basis: '"you should"', foundBy: 'gate' },
      }),
    );
    const ranks = decision.classification.regimes.map((r) => MARKETING_REGIMES.indexOf(r));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(decision.classification.regimes).size).toBe(decision.classification.regimes.length);
  });

  it('is deterministic: the same item classified twice is the same object', () => {
    for (const item of corpus) {
      expect(classifyRegimes(item)).toEqual(classifyRegimes(item));
    }
  });

  it('carries the item\'s own link and jurisdiction assertions into the snapshot', () => {
    const decision = classifyRegimes(
      input({ firstPartyLinkPresent: true, addressedTo: ['li'], excludedFrom: ['uk', 'us', 'row'] }),
    );
    expect(decision.classification.linkPresent).toBe(true);
    expect(decision.classification.addressedTo).toEqual(['li']);
    expect(decision.classification.excludedFrom).toEqual(['uk', 'us', 'row']);
  });

  it('flags the unresearched non-EEA regimes unless BOTH are excluded', () => {
    const bothExcluded = classifyRegimes(input({ excludedFrom: ['uk', 'us'] }));
    expect(bothExcluded.coverage.some((c) => c.axis === 'non_eea_regimes_not_assessed')).toBe(false);
    const oneExcluded = classifyRegimes(input({ excludedFrom: ['uk'] }));
    expect(oneExcluded.coverage.some((c) => c.axis === 'non_eea_regimes_not_assessed')).toBe(true);
    const unknownAudience = classifyRegimes(
      input({ addressedTo: ['unknown'], excludedFrom: ['uk', 'us'] }),
    );
    expect(unknownAudience.coverage.some((c) => c.axis === 'non_eea_regimes_not_assessed')).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('the module stays pure and unsuppressed', () => {
  const sourceOf = (file: string): string =>
    readFileSync(new URL(file, import.meta.url), 'utf8');

  it('reads no clock and no randomness — every instant is supplied by the caller', () => {
    const source = sourceOf('./regime.ts');
    expect(source).not.toMatch(/Date\.now\s*\(/);
    expect(source).not.toMatch(/Math\.random\s*\(/);
    expect(source).not.toMatch(/new Date\s*\(\s*\)/);
  });

  it('carries no suppressions in either the module or its tests', () => {
    // The needles are assembled rather than written out, so this test does not trip
    // over its own source. A ratchet that has to exempt itself is not a ratchet.
    const needles = [
      '@' + 'ts-ignore',
      '@' + 'ts-expect' + '-error',
      'eslint' + '-disable',
      '.' + 'skip(',
      '.' + 'only(',
    ];
    for (const file of ['./regime.ts', './regime.test.ts']) {
      const source = sourceOf(file);
      for (const needle of needles) {
        expect(source.includes(needle)).toBe(false);
      }
    }
  });
});
