/**
 * CLAIM-SAFETY GATE — tests.
 *
 * Two things every test here is trying to be. First, a test that FAILS if the
 * behaviour is removed: the refusal assertions name the code, not merely "some
 * refusal", so deleting a rule cannot leave a green suite. Second, a test of the
 * ASSUMPTIONS this gate makes about a file it does not own — `messageRules.ts` is
 * consumed here as an oracle, and the three properties that consumption rests on
 * (`includes('')` is always true, `channel` is unread, the sentinel ticker defuses the
 * `"buy "` substitution) are pinned directly against that module rather than trusted.
 */
import { describe, it, expect } from 'vitest';
import {
  CLAIM_SAFETY_RULESET_VERSION,
  checkClaimSafety,
  isPublicTimeline,
  stripMeaninglessCarriers,
  type ClaimSafetyInput,
} from './claimSafety.js';
import { MARKETING_RULES_DISCLOSURE, REFUSAL_CODES, type RefusalCode } from './types.js';
import { getClaims } from '../claims/claims.js';
import { getTemplates } from '../claims/templates.js';
import { validateDraftOutput } from '../claims/messageRules.js';
import type { Channel, DraftInput, DraftOutput } from '../claims/types.js';

/** A draft that clears everything, so any refusal in a test is caused by the change. */
const CLEAN = 'Thanks for flagging this — the team is looking into it and someone will come back with specifics.';

function input(overrides: Partial<ClaimSafetyInput> = {}): ClaimSafetyInput {
  return {
    text: CLEAN,
    channel: 'x_public',
    verb: 'reply',
    claimIdsCited: [],
    topic: 'marketing',
    jurisdiction: 'global',
    product: null,
    sourceText: null,
    substantiatedFigures: [],
    solvencyAttestationRef: null,
    ...overrides,
  };
}

function codes(text: string, overrides: Partial<ClaimSafetyInput> = {}): RefusalCode[] {
  return checkClaimSafety(input({ text, ...overrides })).verdict.refusals.map(r => r.code);
}

function ruleIds(text: string, overrides: Partial<ClaimSafetyInput> = {}): string[] {
  return checkClaimSafety(input({ text, ...overrides })).verdict.violations.map(v => v.rule);
}

describe('the clean case', () => {
  it('clears a draft that asserts nothing', () => {
    const out = checkClaimSafety(input());
    expect(out.verdict.refusals).toEqual([]);
    expect(out.verdict.violations).toEqual([]);
    expect(out.verdict.disposition).toBe('clear');
    expect(out.usableText).toBe(CLEAN);
  });

  it('carries the not-counsel-reviewed disclosure on every verdict, including a clear one', () => {
    expect(checkClaimSafety(input()).disclosure).toBe(MARKETING_RULES_DISCLOSURE);
    expect(checkClaimSafety(input({ text: 'We guarantee 20% APY.' })).disclosure).toBe(MARKETING_RULES_DISCLOSURE);
  });

  it('stamps the ruleset version on the verdict and on every refusal', () => {
    const out = checkClaimSafety(input({ text: 'You should buy now.' }));
    expect(out.verdict.ruleSetVersion).toBe(CLAIM_SAFETY_RULESET_VERSION);
    for (const refusal of out.verdict.refusals) {
      expect(refusal.ruleSetVersion).toBe(CLAIM_SAFETY_RULESET_VERSION);
    }
  });
});

describe('strip versus refuse — the central distinction', () => {
  it('strips meaningless carriers and reports what it removed', () => {
    /* U+200B zero-width space, U+00A0 non-breaking space. Written as escapes because a
     * literal one is invisible in the diff, which is the whole point of the attack. */
    const text = 'Thanks\u200B for\u00A0flagging this.';
    const out = checkClaimSafety(input({ text }));
    expect(out.verdict.disposition).toBe('stripped');
    expect(out.strips.map(s => s.kind).sort()).toEqual(['nonstandard_space', 'zero_width']);
    expect(out.usableText).toBe('Thanks for flagging this.');
    expect(out.verdict.refusals).toEqual([]);
  });

  it('strips the untrusted-input fence if a model echoed it back', () => {
    const out = checkClaimSafety(input({ text: `Thanks. <<<UNTRUSTED_PUBLIC_REPLY>>> The team is looking.` }));
    expect(out.strips.map(s => s.kind)).toContain('prompt_fence');
    expect(out.usableText).not.toContain('UNTRUSTED_PUBLIC_REPLY');
  });

  it('a zero-width character cannot hide a promise from a rule', () => {
    expect(codes('Rewards are risk-free.')).toContain('REGULATED_PROMISE_RETURN');
    expect(codes('Rewards are ri\u200Bsk-free.')).toContain('REGULATED_PROMISE_RETURN');
  });

  it('a fullwidth form cannot hide a promise, and the operator\'s own characters are not rewritten', () => {
    const text = 'Rewards are ｒｉｓｋ-ｆｒｅｅ.';
    expect(codes(text)).toContain('REGULATED_PROMISE_RETURN');
    /* Matching happens on an NFKC copy; the text handed back is never normalised, so a
     * draft written in another script is not silently rewritten by the gate. */
    expect(stripMeaninglessCarriers(text).text).toContain('ｒｉｓｋ');
  });

  it('NEVER hands back a softened promise: refusal means there is no usable text', () => {
    const out = checkClaimSafety(input({ text: 'LCX will list your token in Q3.' }));
    expect(out.verdict.disposition).toBe('refused');
    expect(out.usableText).toBeNull();
  });

  it('a flag preserves the text — only a refusal removes it', () => {
    const out = checkClaimSafety(input({ text: 'You can open an account whenever you like.' }));
    expect(out.verdict.disposition).toBe('flagged');
    expect(out.usableText).toBe('You can open an account whenever you like.');
  });
});

describe('regulated promises refuse, and name the rule that caused it', () => {
  it('price forecast', () => {
    expect(codes('BTC will break out this month.')).toContain('REGULATED_PROMISE_PRICE');
  });

  it('price target language', () => {
    expect(codes('Our price target is published elsewhere.')).toContain('REGULATED_PROMISE_PRICE');
  });

  it('a multiple is a price claim', () => {
    expect(codes('This is a 10x from here.')).toContain('REGULATED_PROMISE_PRICE');
  });

  it('but a performance multiple is not — the rule does not cry wolf', () => {
    expect(codes('Settlement is 10x faster than it was.')).not.toContain('REGULATED_PROMISE_PRICE');
  });

  /**
   * THE MISS THE INTEGRATION PASS FOUND, and it was in the unsafe direction.
   *
   * `PRICE_MOVE` listed bare stems, and `\bhit\b` does not match "hits" — there is no word
   * boundary between `t` and `s`. So the entire PRESENT TENSE slipped past all three price
   * rules: `price_forecast` needs a modal, `price_target` needs the literal word "target",
   * and `price_language` needs a named artefact or a multiple. "BTC hits $250,000 by
   * December" matched none of them and came back as `UNSOURCED_FIGURE` alone — a code that
   * invites an operator to ADD A CITATION to a price call.
   *
   * A present-tense forecast is worse than a hedged one, because it reads as an observation.
   */
  it('catches a present-tense price call, which is how a prediction is actually written', () => {
    expect(codes('BTC hits $250,000 by December, easily.')).toContain('REGULATED_PROMISE_PRICE');
    expect(codes('ETH touches $10k before 2027.')).toContain('REGULATED_PROMISE_PRICE');
    expect(codes('LCX token doubles to $2 this cycle.')).toContain('REGULATED_PROMISE_PRICE');
  });

  /**
   * The other direction, which is what makes the rule above usable. A PAST observation about
   * the market is a factual statement: it needs a source, and `UNSOURCED_FIGURE` demands one.
   * Refusing it as a price call would be a false positive on a true sentence, and it is the
   * FUTURE HORIZON — not the verb and not the number — that turns a level into a forecast.
   */
  it('does not refuse a past observation of a level as a price call', () => {
    const past = codes('BTC broke $100,000 last night, per CoinGecko.');
    expect(past).not.toContain('REGULATED_PROMISE_PRICE');
    // A bare count with a horizon is a growth statement, not a price call.
    expect(codes('We reach 10,000 verified users by December.')).not.toContain('REGULATED_PROMISE_PRICE');
  });

  it('return promises', () => {
    expect(codes('Staking pays APY on idle balances.')).toContain('REGULATED_PROMISE_RETURN');
    expect(codes('Earn 8% on your balance.')).toContain('REGULATED_PROMISE_RETURN');
  });

  it('a percentage attached to a reward is a return claim', () => {
    expect(codes('Rewards are around 4.5% at the moment.')).toContain('REGULATED_PROMISE_RETURN');
  });

  it('listing promises refuse and route to a human, not to a reword', () => {
    const out = checkClaimSafety(input({ text: 'Listing is coming soon, stay tuned.' }));
    const listing = out.verdict.refusals.find(r => r.code === 'REGULATED_PROMISE_LISTING');
    expect(listing).toBeDefined();
    expect(listing!.recovery.kind).toBe('human_authority');
    expect(listing!.rule.provision).toContain('Art 90(1)');
  });

  it('a dated commitment refuses', () => {
    expect(codes('We will credit it by Friday.')).toContain('REGULATED_PROMISE_TIMELINE');
  });

  it('but a date that is not a commitment does not — "deposits are live today" is a fact', () => {
    expect(codes('Deposits are live today.')).not.toContain('REGULATED_PROMISE_TIMELINE');
  });

  it('an unconditional forward commitment refuses', () => {
    expect(codes('We will always allow withdrawals.')).toContain('UNCONDITIONAL_FORWARD_COMMITMENT');
  });

  it('a support outcome the desk cannot see refuses', () => {
    expect(codes('Your funds are safe.')).toContain('SUPPORT_OUTCOME_ASSERTED');
    expect(codes('Your withdrawal has been processed.')).toContain('SUPPORT_OUTCOME_ASSERTED');
  });

  it('an admission of fault refuses to legal, because there is no wording fix for it', () => {
    const out = checkClaimSafety(input({ text: 'That was our mistake.' }));
    const fault = out.verdict.refusals.find(r => r.code === 'FAULT_ADMISSION');
    expect(fault).toBeDefined();
    expect(fault!.recovery).toEqual({ kind: 'human_authority', role: 'legal' });
  });

  it('every refusal shows the span it objected to, or is honestly about absent state', () => {
    const out = checkClaimSafety(input({ text: 'You should buy now — we guarantee 20% APY.' }));
    expect(out.verdict.refusals.length).toBeGreaterThan(0);
    for (const refusal of out.verdict.refusals) {
      expect(REFUSAL_CODES).toContain(refusal.code);
      expect(refusal.sentence.length).toBeGreaterThan(20);
      expect(refusal.rule.text.length).toBeGreaterThan(20);
      if (refusal.matched !== null) expect(refusal.matched.length).toBeGreaterThan(0);
    }
  });
});

describe('solvency assertions need the artefact, not a softer verb', () => {
  it('refuses without an attestation reference', () => {
    expect(codes('All client funds are safe and fully backed.')).toContain('SOLVENCY_ASSERTION_WITHOUT_ATTESTATION');
  });

  it('downgrades to a warning when an attestation exists — and still demands it be visible', () => {
    const out = checkClaimSafety(input({
      text: 'Reserves are fully backed.',
      solvencyAttestationRef: 'attestation-2026-07',
    }));
    expect(out.verdict.refusals.map(r => r.code)).not.toContain('SOLVENCY_ASSERTION_WITHOUT_ATTESTATION');
    const warning = out.verdict.violations.find(v => v.rule === 'solvency.assertion');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
  });

  it('a blank attestation reference is not an attestation', () => {
    expect(codes('Reserves are fully backed.', { solvencyAttestationRef: '   ' }))
      .toContain('SOLVENCY_ASSERTION_WITHOUT_ATTESTATION');
  });
});

describe('advice — personalisation is what makes it the regulated service', () => {
  it('refuses a transaction instruction aimed at a person', () => {
    expect(codes('You should sell before it drops.')).toContain('ART_81_PERSONALISED_RECOMMENDATION');
  });

  it('refuses reasoning from the counterparty\'s own position to a transaction', () => {
    expect(codes('Given your position, add more here.')).toContain('ART_81_PERSONALISED_RECOMMENDATION');
  });

  it('is not recoverable on a public timeline, and names a human elsewhere', () => {
    const onX = checkClaimSafety(input({ text: 'You should buy more.', channel: 'x_public' }));
    const onEmail = checkClaimSafety(input({ text: 'You should buy more.', channel: 'email' }));
    expect(onX.verdict.refusals[0]!.recovery.kind).toBe('not_recoverable');
    expect(onEmail.verdict.refusals[0]!.recovery.kind).toBe('human_authority');
    expect(isPublicTimeline('x_public')).toBe(true);
    expect(isPublicTimeline('email')).toBe(false);
  });

  it('"not financial advice" changes NOTHING — identical refusals with and without it', () => {
    const bare = codes('You should buy more.');
    const disclaimed = codes('You should buy more. Not financial advice.');
    expect(disclaimed).toEqual(bare);
    expect(ruleIds('You should buy more. Not financial advice.')).toContain('disclaimer.no_legal_effect');
  });
});

describe('licence and jurisdiction claims', () => {
  it('reuses the claim library blocklist and shows the phrase it fired on', () => {
    const out = checkClaimSafety(input({ text: 'We are SEC-approved.' }));
    const licence = out.verdict.refusals.filter(r => r.code === 'INVENTED_LICENCE_CLAIM');
    expect(licence.length).toBeGreaterThan(0);
    expect(licence.some(r => (r.matched ?? '').includes('SEC-approved'))).toBe(true);
  });

  it('catches a foreign perimeter claim the blocklist does not hold', () => {
    expect(codes('We are also regulated in the US.')).toContain('INVENTED_LICENCE_CLAIM');
  });

  it('does not fire on the abbreviation "sec" — the acronym is matched case-sensitively', () => {
    expect(codes('Authorised in Liechtenstein. Someone will reply in a sec.'))
      .not.toContain('INVENTED_LICENCE_CLAIM');
  });
});

describe('MiCA is a regulation, not a licence', () => {
  /**
   * THE GAP `INVENTED_LICENSE_PHRASES` LEFT. That blocklist is US-shaped — SEC, FINRA, MSB,
   * NYDFS, FDIC — and the foreign-perimeter rule needs a foreign authority or a foreign
   * jurisdiction in the sentence. "LCX is MiCA-licensed" has neither, and it came back
   * completely clean when the integration pass measured it.
   *
   * It matters because it is the wording most likely to be written in GOOD FAITH: by someone
   * who knows LCX is authorised and reaches for the shortest way to say so. And it asserts
   * the opposite of a statement MiCA mandates elsewhere — Art 7(1)(e) requires an offer
   * communication to say it has NOT been approved by any competent authority.
   *
   * BaFin, FCA and CySEC were checked at the same time and all three already refuse through
   * the perimeter rule, so nothing was added for them.
   */
  it('refuses a claimed MiCA licence, approval or registration', () => {
    for (const text of [
      'LCX is MiCA-licensed.',
      'We are MiCA-approved.',
      'LCX is a MiCA-registered exchange.',
      'Licensed by MiCA since 2024.',
    ]) {
      expect(codes(text), text).toContain('INVENTED_LICENCE_CLAIM');
    }
  });

  it('does not refuse the true statement, which is what the recovery asks for', () => {
    // A rule that refused its own recovery would be unusable, and this is the exact sentence
    // the recovery text tells the operator to write.
    expect(codes('LCX is authorised as a crypto-asset service provider under MiCA by the FMA.'))
      .not.toContain('INVENTED_LICENCE_CLAIM');
    expect(codes('LCX is authorised as a CASP in Liechtenstein.'))
      .not.toContain('INVENTED_LICENCE_CLAIM');
  });

  it('still refuses the foreign-perimeter claims, which were already covered', () => {
    for (const text of ['LCX is BaFin-licensed.', 'We are FCA-approved.', 'CySEC-licensed operation.']) {
      expect(codes(text), text).toContain('INVENTED_LICENCE_CLAIM');
    }
  });
});

describe('the halo effect — the gate must be willing to flag LCX\'s own best line', () => {
  const REGULATED = { name: 'LCX Exchange', regulatoryStatus: 'mica_regulated' } as const;
  const UNREGULATED = { name: 'LCX Rewards', regulatoryStatus: 'not_mica_regulated' } as const;
  const UNKNOWN = { name: 'LCX Vault', regulatoryStatus: 'unknown' } as const;

  it('a factual status statement clears', () => {
    const out = checkClaimSafety(input({
      text: 'LCX is authorised as a crypto-asset service provider in Liechtenstein.',
      product: REGULATED,
    }));
    expect(out.verdict.refusals.map(r => r.code)).not.toContain('ESMA_REGULATORY_STATUS_AS_PROMOTION');
  });

  it('the same fact spent on a product benefit refuses — this is the brand line', () => {
    const out = checkClaimSafety(input({
      text: 'LCX is fully regulated in Liechtenstein, so you can trade with confidence.',
      product: REGULATED,
    }));
    const halo = out.verdict.refusals.find(r => r.code === 'ESMA_REGULATORY_STATUS_AS_PROMOTION');
    expect(halo).toBeDefined();
    expect(halo!.rule.instrument).toBe('esma_halo');
    expect(halo!.rule.text).toContain('promotional tool');
  });

  it('mentioning the authorisation on an item about an unregulated product refuses', () => {
    expect(codes('LCX Rewards is backed by our MiCA-regulated platform. Not covered by MiCA.', { product: UNREGULATED }))
      .toContain('ESMA_REGULATORY_STATUS_AS_PROMOTION');
  });

  it('an unregulated product with no status marker refuses on the DO, not the DON\'T', () => {
    const out = checkClaimSafety(input({ text: 'LCX Rewards is live for everyone.', product: UNREGULATED }));
    expect(out.verdict.refusals.map(r => r.code)).toContain('ESMA_UNREGULATED_PRODUCT_STATUS_MISSING');
    expect(out.verdict.refusals.map(r => r.code)).not.toContain('ESMA_REGULATORY_STATUS_AS_PROMOTION');
  });

  it('an unregulated product that says so, without invoking the licence, clears the halo rules', () => {
    const out = checkClaimSafety(input({
      text: 'LCX Rewards is live. It is not covered by MiCA and carries no regulatory protection.',
      product: UNREGULATED,
    }));
    expect(out.verdict.refusals.map(r => r.code)).not.toContain('ESMA_UNREGULATED_PRODUCT_STATUS_MISSING');
    expect(out.verdict.refusals.map(r => r.code)).not.toContain('ESMA_REGULATORY_STATUS_AS_PROMOTION');
  });

  it('an unknown perimeter status refuses on the unknown, never on the easier answer', () => {
    const out = checkClaimSafety(input({
      text: 'LCX Vault is fully regulated in Liechtenstein, so you can deposit with confidence.',
      product: UNKNOWN,
    }));
    const codesOut = out.verdict.refusals.map(r => r.code);
    expect(codesOut).toContain('PRODUCT_REGULATORY_STATUS_UNKNOWN');
    expect(codesOut).not.toContain('ESMA_REGULATORY_STATUS_AS_PROMOTION');
    const unknown = out.verdict.refusals.find(r => r.code === 'PRODUCT_REGULATORY_STATUS_UNKNOWN');
    expect(unknown!.recovery.kind).toBe('supply_data');
  });
});

describe('unsubstantiated superlatives', () => {
  it('refuse when nothing supports them', () => {
    expect(codes('We have the tightest spreads on the market.'))
      .toContain('ART_66_2_UNSUBSTANTIATED_SUPERLATIVE');
  });

  it('become a warning once a measurement is supplied', () => {
    const out = checkClaimSafety(input({
      text: 'We have the tightest spreads on the market.',
      substantiatedFigures: [{ figure: 'spread-study-2026-07', sourceRef: 'internal market data, July 2026' }],
    }));
    expect(out.verdict.refusals.map(r => r.code)).not.toContain('ART_66_2_UNSUBSTANTIATED_SUPERLATIVE');
    expect(out.verdict.violations.map(v => v.rule)).toContain('superlative.unsubstantiated');
  });

  it('do not fire on a superlative with no commercial object', () => {
    expect(codes('The best thing to do is send the ticket id.'))
      .not.toContain('ART_66_2_UNSUBSTANTIATED_SUPERLATIVE');
  });
});

describe('figures — never a number the desk cannot point at', () => {
  it('refuses an unsourced figure and shows it', () => {
    const out = checkClaimSafety(input({ text: 'We process 5000 orders a second.' }));
    const figure = out.verdict.refusals.find(r => r.code === 'UNSOURCED_FIGURE');
    expect(figure).toBeDefined();
    expect(figure!.matched).toBe('5000');
  });

  it('accepts a figure that was in the item being answered', () => {
    expect(codes('We process 5000 orders a second.', { sourceText: 'is it true you do 5000 orders a second?' }))
      .not.toContain('UNSOURCED_FIGURE');
  });

  it('accepts a figure the caller can point at', () => {
    expect(codes('We process 5000 orders a second.', {
      substantiatedFigures: [{ figure: '5000', sourceRef: 'throughput test, 2026-06' }],
    })).not.toContain('UNSOURCED_FIGURE');
  });

  it('no active claim currently carries a numeral, so citing one cannot source a figure', () => {
    /* Pinned deliberately rather than assumed. The claim-text pool is wired as a figure
     * source, and today it is empty of numbers: every one of the 18 active claims is
     * qualitative. If this assertion ever fails, someone has added a numeric claim, and
     * a number inside approved language needs its own review before a marketing desk
     * pastes it onto a public timeline — the whole point of the Kraken 21% figure. */
    expect(getClaims().some(c => /\d/.test(c.text))).toBe(false);
  });

  it('citing an unrelated claim does not launder an unsourced figure', () => {
    expect(codes('We process 5000 orders a second.', { claimIdsCited: ['marketing-001'] }))
      .toContain('UNSOURCED_FIGURE');
  });

  it('does not treat digits in a handle or a hashtag as a claim', () => {
    expect(codes('Thanks @user2019 — passing this to the team. #lcx100')).not.toContain('UNSOURCED_FIGURE');
  });

  it('reports each distinct figure once, not once per occurrence', () => {
    const out = checkClaimSafety(input({ text: 'It was 42 then, and it is 42 now.' }));
    expect(out.verdict.refusals.filter(r => r.code === 'UNSOURCED_FIGURE')).toHaveLength(1);
  });

  it('folds thousands separators so one source covers both spellings', () => {
    expect(codes('There are 1,000 pairs.', { sourceText: 'do you have 1000 pairs?' }))
      .not.toContain('UNSOURCED_FIGURE');
  });

  it('does NOT fold a decimal point — 1.5 is not sourced by 15', () => {
    expect(codes('The fee is 1.5 units.', { sourceText: 'is the fee 15 units?' }))
      .toContain('UNSOURCED_FIGURE');
  });
});

describe('claim ids are resolved, not pattern-matched', () => {
  it('refuses a plausibly-prefixed id the library does not hold', () => {
    /* `validateClaimsUsed` would pass this: it checks the id PREFIX only. */
    const out = checkClaimSafety(input({ claimIdsCited: ['marketing-999'] }));
    const unsourced = out.verdict.refusals.find(r => r.code === 'UNSOURCED_LCX_FACT');
    expect(unsourced).toBeDefined();
    expect(unsourced!.matched).toBe('marketing-999');
  });

  it('accepts a real id and reports full coverage', () => {
    const out = checkClaimSafety(input({ claimIdsCited: ['marketing-001'] }));
    expect(out.verdict.refusals.map(r => r.code)).not.toContain('UNSOURCED_LCX_FACT');
    expect(out.verdict.coverage).toBe('covered');
    expect(out.verdict.claimIdsCited).toEqual(['marketing-001']);
  });

  it('flags a claim the library says needs a human', () => {
    const needsReview = getClaims().find(c => c.requiresHumanReview);
    expect(needsReview).toBeDefined();
    const out = checkClaimSafety(input({
      claimIdsCited: [needsReview!.id],
      topic: needsReview!.category,
      jurisdiction: needsReview!.jurisdiction[0]!,
    }));
    expect(out.verdict.violations.map(v => v.rule)).toContain('claim.requires_human_review');
  });
});

describe('coverage — an empty rulebook may not report clear', () => {
  it('refuses when the library holds nothing for the topic', () => {
    const out = checkClaimSafety(input({ topic: 'eu_access', jurisdiction: 'us' }));
    expect(out.verdict.coverage).toBe('none');
    expect(out.verdict.refusals.map(r => r.code)).toContain('CLAIM_LIBRARY_COVERAGE_NONE');
  });

  it('says so when no topic was stated rather than reporting covered', () => {
    const out = checkClaimSafety(input({ topic: null }));
    expect(out.verdict.coverage).toBe('partial');
    expect(out.verdict.violations.map(v => v.rule)).toContain('coverage.topic_not_stated');
  });

  it('is partial when the library holds language and the draft cited none of it', () => {
    expect(checkClaimSafety(input()).verdict.coverage).toBe('partial');
  });
});

describe('the verb is the act', () => {
  it('a like is not reviewed by this gate, and does not get a clear verdict from it', () => {
    const out = checkClaimSafety(input({ verb: 'like', text: '' }));
    expect(out.verdict.disposition).toBe('flagged');
    expect(out.verdict.refusals).toEqual([]);
    expect(out.verdict.violations.map(v => v.rule)).toEqual(['verb.produces_no_own_text']);
    expect(out.usableText).toBeNull();
  });

  it('a repost is treated the same way', () => {
    expect(checkClaimSafety(input({ verb: 'repost', text: '' })).verdict.violations[0]!.rule)
      .toBe('verb.produces_no_own_text');
  });

  it('a reply is reviewed', () => {
    expect(checkClaimSafety(input({ verb: 'reply' })).verdict.disposition).toBe('clear');
  });
});

describe('obfuscation is reported, not rewritten', () => {
  it('flags a token built from two alphabets', () => {
    /* U+0435 is a Cyrillic small letter ie: `g<CYRILLIC e>nuine` renders as "genuine". */
    const out = checkClaimSafety(input({ text: 'Our support is gеnuine and here to help.' }));
    expect(out.verdict.violations.map(v => v.rule)).toContain('obfuscation.mixed_script');
    expect(out.usableText).toContain('gеnuine');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* The assumptions this gate makes about a file it does not own                 */
/* ══════════════════════════════════════════════════════════════════════════ */

function salesProbe(body: string, ticker: string | null, channel: Channel): { draft: DraftOutput; input: DraftInput } {
  return {
    draft: {
      subject: '', body, channel, touchIndex: 0, claimsUsed: [],
      requiresHumanReview: true, templateId: 't', operatorEdited: false,
    },
    input: {
      projectName: '', projectTicker: ticker, projectWebsite: null, projectChain: null,
      projectEuScore: null, projectUsPreScore: null, projectUsPostScore: null, projectBand: '',
      scoreReasons: [], contactName: '', contactTitle: null, contactRole: '',
      jurisdiction: 'global', clarityEnacted: false, touchIndex: 0, channel, market: null,
    },
  };
}

describe('hazard 1 — the two guaranteed false errors cannot reach a marketing verdict', () => {
  it('empty contactName and projectName disarm tag_person and project_hook at the source', () => {
    const { draft, input: probeInput } = salesProbe('Thanks for flagging this.', 'ZZ_SENTINEL', 'email');
    const rules = validateDraftOutput(draft, probeInput).violations.map(v => v.rule);
    expect(rules).not.toContain('tag_person');
    expect(rules).not.toContain('project_hook');
  });

  it('and none of the four sales-shaped rules appears in any marketing verdict', () => {
    const out = checkClaimSafety(input({ text: 'Thanks for flagging this.' }));
    const emitted = [...out.verdict.violations.map(v => v.rule), ...out.verdict.refusals.map(r => r.code)];
    for (const salesRule of ['tag_person', 'project_hook', 'has_question', 'has_benefit']) {
      expect(emitted).not.toContain(salesRule);
    }
  });
});

describe('hazard 2 — the "buy " substitution bug is routed around', () => {
  it('is real: a null ticker makes any body containing "buy " fail the sales rule', () => {
    const { draft, input: probeInput } = salesProbe('Anyone can buy tokens on a public market.', null, 'email');
    expect(validateDraftOutput(draft, probeInput).violations.map(v => v.rule)).toContain('no_deal_closing');
  });

  it('and a non-empty sentinel ticker defuses it', () => {
    const { draft, input: probeInput } = salesProbe('Anyone can buy tokens on a public market.', 'ZZ_SENTINEL', 'email');
    expect(validateDraftOutput(draft, probeInput).violations.map(v => v.rule)).not.toContain('no_deal_closing');
  });

  it('so the gate does not fire on the word "buy" in ordinary prose', () => {
    const out = checkClaimSafety(input({ text: 'Anyone can buy tokens on a public market.' }));
    expect(out.verdict.violations.map(v => v.rule)).not.toContain('deal_closing.invitation_to_transact');
    expect(out.verdict.refusals).toEqual([]);
  });

  it('while a real invitation to transact is still reported, with the phrase it fired on', () => {
    const out = checkClaimSafety(input({ text: 'Just open an account and you are set.' }));
    const finding = out.verdict.violations.find(v => v.rule === 'deal_closing.invitation_to_transact');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.rule_citation.provision).toContain('Art 7(1)(d)');
    expect(finding!.matched.toLowerCase()).toContain('open an account');
  });
});

describe('hazard 3 — the claim library is consumed, never mutated', () => {
  it('leaves the claim set and the nine templates exactly as they were', () => {
    const before = getClaims().map(c => `${c.id}:${c.text}`);
    const templatesBefore = getTemplates().length;
    checkClaimSafety(input({ text: 'We guarantee 20% APY.', claimIdsCited: ['marketing-001', 'bogus-1'] }));
    checkClaimSafety(input({ text: 'Anyone can buy tokens.', claimIdsCited: [] }));
    expect(getClaims().map(c => `${c.id}:${c.text}`)).toEqual(before);
    expect(getTemplates().length).toBe(templatesBefore);
  });
});

describe('the probe channel is inert', () => {
  it('validateDraftOutput returns the same rules for every channel, so the probe value is not a decision', () => {
    const body = 'Just open an account. We are SEC-approved.';
    const perChannel = (['email', 'linkedin', 'telegram'] as Channel[]).map(channel => {
      const { draft, input: probeInput } = salesProbe(body, 'ZZ_SENTINEL', channel);
      return validateDraftOutput(draft, probeInput).violations.map(v => v.rule).sort().join(',');
    });
    expect(new Set(perChannel).size).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* Purity                                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('pure and total', () => {
  const SAMPLES: string[] = [
    CLEAN,
    'BTC will break out this month.',
    'You should buy more. Not financial advice.',
    'We are SEC-approved and fully regulated in Liechtenstein, so you can trade with confidence.',
    'Your funds are safe and fully backed 1:1.',
    'Just open an account.',
    '',
  ];

  it('gives the same answer on repeated calls — no regex lastIndex leaks between them', () => {
    for (const text of SAMPLES) {
      const first = checkClaimSafety(input({ text }));
      const second = checkClaimSafety(input({ text }));
      const third = checkClaimSafety(input({ text }));
      expect(second).toEqual(first);
      expect(third).toEqual(first);
    }
  });

  it('never returns usable text alongside a refusal, and always returns it without one', () => {
    for (const text of SAMPLES) {
      const out = checkClaimSafety(input({ text }));
      if (out.verdict.refusals.length > 0) {
        expect(out.usableText).toBeNull();
        expect(out.verdict.disposition).toBe('refused');
      } else {
        expect(out.usableText).not.toBeNull();
        expect(out.verdict.disposition).not.toBe('refused');
      }
    }
  });

  it('emits only codes the vocabulary declares', () => {
    for (const text of SAMPLES) {
      for (const refusal of checkClaimSafety(input({ text })).verdict.refusals) {
        expect(REFUSAL_CODES).toContain(refusal.code);
      }
    }
  });

  it('handles an empty draft without inventing a finding', () => {
    const out = checkClaimSafety(input({ text: '' }));
    expect(out.verdict.refusals).toEqual([]);
    expect(out.usableText).toBe('');
  });
});
