/**
 * Tests for the adoption engine. Every assertion here fails if the behaviour it names
 * is removed — the tables are checked for totality, the thresholds are checked from
 * both sides, and the asymmetry between a reply and a repost on the SAME target is
 * asserted directly, because that asymmetry is the entire model.
 */
import { describe, expect, it } from 'vitest';
import {
  ADOPTION_RULESET_VERSION,
  CONSIDERATION_DUTY,
  DISCLOSURE_PROMINENCE_BUDGET_CHARS,
  RESTATEMENT_RUN_WORDS,
  VERB_ADOPTION_CITATION,
  VERB_CONSEQUENCE,
  approvalObligationFor,
  assessAmplification,
  assessCorrection,
  assessDisclosure,
  assessEmploymentDisclosure,
  assessMarketRelevance,
  assessStaffCapacity,
  evaluateInteractiveSupervision,
  evaluateStaticPreApproval,
  explainAdoption,
  findDisclosureTokens,
  hasEditableSurface,
  isAmplification,
  sharedWordRun,
  trailingTagBlockStart,
  whatWouldBeAdopted,
  type AmplificationRequest,
  type PartnerRegisterLookup,
  type Speaker,
  type TargetPost,
} from './adoption.js';
import {
  ENGAGEMENT_VERBS,
  INSTRUMENTS,
  REFUSAL_CODES,
  VERB_ADOPTION,
  VERB_INHERITS_TARGET_RISK,
  type Clearance,
  type DeskMode,
  type InboundProvenance,
  type Refusal,
  type ReviewSamplingRecord,
} from './types.js';

/* ──── builders: minimal, explicit, no hidden defaults that matter ──── */

const GRADED: InboundProvenance = {
  state: 'graded',
  channel: 'oembed',
  reliability: 'B',
  credibility: 2,
  admiralty: 'B2',
  senderAuth: null,
  corroboration: [
    { channel: 'oembed', agrees: ['post_text', 'author_handle'], disagrees: [], observedAt: '2026-08-01T00:00:00Z', evidence: 'oembed json' },
  ],
  observedAt: '2026-08-01T00:00:00Z',
  collectedAt: '2026-08-01T00:00:00Z',
};

const QUARANTINED: InboundProvenance = {
  state: 'quarantined',
  reasons: ['no_independent_corroboration'],
  channel: 'x_notification_email',
  senderAuth: null,
  collectedAt: '2026-08-01T00:00:00Z',
  promotionRequires: 'an oEmbed record agreeing on handle, text and posted_at',
};

const NOT_A_PARTNER: PartnerRegisterLookup = { state: 'not_a_partner', checkedAt: '2026-08-01T00:00:00Z' };

function target(overrides: Partial<TargetPost> = {}): TargetPost {
  return {
    permalink: 'https://x.com/someone/status/1',
    handle: '@someone',
    text: 'Great support experience with this team today, sorted in ten minutes.',
    provenance: GRADED,
    verification: 'unverified',
    isLcxOwnAccount: false,
    partner: NOT_A_PARTNER,
    ...overrides,
  };
}

function speaker(overrides: Partial<Speaker> = {}): Speaker {
  return {
    actor: 'nik',
    capacity: 'official_account',
    handle: '@lcx',
    employmentDisclosedInProfileOnly: false,
    itemPromotesEmployer: false,
    ...overrides,
  };
}

const NORMAL: DeskMode = { kind: 'normal' };

function request(overrides: Partial<AmplificationRequest> = {}): AmplificationRequest {
  return {
    verb: 'reply',
    surface: 'reply',
    speaker: speaker(),
    target: target(),
    ownText: 'Thanks for letting us know.',
    deskMode: NORMAL,
    targetFindings: [],
    ...overrides,
  };
}

function codes(refusals: readonly Refusal[]): readonly string[] {
  return refusals.map((r) => r.code);
}

/* ══════════════════════════════════════════════════════════════════════════ */
describe('§1 the verb is the act', () => {
  it('every verb has an explanation, a consequence sentence and a real citation', () => {
    for (const verb of ENGAGEMENT_VERBS) {
      const e = explainAdoption(verb);
      expect(e.effect).toBe(VERB_ADOPTION[verb]);
      expect(VERB_CONSEQUENCE[verb].length).toBeGreaterThan(20);
      const cite = VERB_ADOPTION_CITATION[verb];
      expect(Object.keys(INSTRUMENTS)).toContain(cite.instrument);
      expect(cite.provision.length).toBeGreaterThan(0);
      expect(cite.text.length).toBeGreaterThan(20);
    }
  });

  it('a like and a plain repost adopt the target wholesale; a reply does not', () => {
    expect(explainAdoption('like').effect).toBe('adopts_target_claims');
    expect(explainAdoption('repost').effect).toBe('adopts_target_claims');
    expect(explainAdoption('reply').effect).toBe('own_communication_only');
    expect(explainAdoption('quote').effect).toBe('own_communication_plus_adoption');
    expect(explainAdoption('correction').effect).toBe('no_adoption');
  });

  it('amplification is derived from the inheritance table, and like/repost have no editable surface', () => {
    for (const verb of ENGAGEMENT_VERBS) {
      expect(isAmplification(verb)).toBe(VERB_INHERITS_TARGET_RISK[verb]);
    }
    expect(hasEditableSurface('like')).toBe(false);
    expect(hasEditableSurface('repost')).toBe(false);
    expect(hasEditableSurface('quote')).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('§2 the correction exemption does not self-certify', () => {
  const claim = { wrong: 'LCX is unlicensed', right: 'LCX AG is registered with the FMA', sourceRef: 'fma-register-2026' };

  it('a strictly factual, sourced correction keeps RN 17-18 Q11 and adopts nothing', () => {
    const a = assessCorrection('LCX AG holds a Liechtenstein registration; the register entry is public.', claim, 'LCX is unlicensed and nobody should trust them');
    expect(a.exemptionHolds).toBe(true);
    expect(a.effective).toBe('no_adoption');
    expect(a.disqualifiers).toEqual([]);
  });

  it('no declared wrong/right pair loses the exemption', () => {
    const a = assessCorrection('That is not accurate.', null, null);
    expect(a.exemptionHolds).toBe(false);
    expect(a.disqualifiers).toContain('no_corrected_fact_declared');
    expect(a.effective).toBe('own_communication_only');
  });

  it('an unsourced true fact loses the exemption', () => {
    const a = assessCorrection('The register entry is public.', { ...claim, sourceRef: null }, null);
    expect(a.disqualifiers).toContain('corrected_fact_unsourced');
    expect(a.exemptionHolds).toBe(false);
  });

  it('argument, promotion and forward-looking language each lose the exemption', () => {
    const argue = assessCorrection('This is pure FUD, do your research.', claim, null);
    expect(argue.disqualifiers).toContain('argumentative_language');
    expect(argue.matchedTerms).toContain('fud');

    const sell = assessCorrection('We are the safest exchange in Europe.', claim, null);
    expect(sell.disqualifiers).toContain('evaluative_language');

    const forward = assessCorrection('We will publish the attestation next month.', claim, null);
    expect(forward.disqualifiers).toContain('forward_looking_language');
  });

  it('reproducing a run of the target becomes republication, and the effect degrades to adoption', () => {
    const targetText = 'LCX moved forty million tokens to an exchange wallet last night';
    const a = assessCorrection(`Wrong: LCX moved forty million tokens to an exchange wallet last night is a misreading of a routine transfer.`, claim, targetText);
    expect(a.disqualifiers).toContain('restates_target_claim');
    expect(a.restatedRun).not.toBeNull();
    expect(a.effective).toBe('own_communication_plus_adoption');
  });

  it('a short quotation below the run threshold is not republication', () => {
    const targetText = 'LCX moved forty million tokens somewhere last night and nobody knows why';
    const short = 'The phrase "moved forty million tokens" describes a routine internal rebalance.';
    expect(sharedWordRun(short, targetText)).toBeNull();
    const a = assessCorrection(short, claim, targetText);
    expect(a.disqualifiers).not.toContain('restates_target_claim');
    expect(a.exemptionHolds).toBe(true);
  });

  it('empty text is a disqualifier, not a pass', () => {
    expect(assessCorrection('', claim, null).disqualifiers).toContain('empty');
  });

  it('sharedWordRun needs both sides to reach the threshold', () => {
    const five = 'one two three four five';
    expect(sharedWordRun(five, five)).toBeNull();
    const six = 'one two three four five six';
    expect(sharedWordRun(six, six)).toBe('one two three four five six');
    expect(RESTATEMENT_RUN_WORDS).toBe(6);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('§3 the target and what would be adopted', () => {
  it('consideration duty is total, and unknown resolves to neither answer', () => {
    const values = Object.values(CONSIDERATION_DUTY);
    expect(values).toHaveLength(13);
    expect(CONSIDERATION_DUTY.unknown).toBe('unknown');
    expect(CONSIDERATION_DUTY.none).toBe('no_duty');
    expect(CONSIDERATION_DUTY.event_invitation).toBe('duty');
    expect(CONSIDERATION_DUTY.unsolicited_gift).toBe('duty');
    expect(CONSIDERATION_DUTY.token_allocation).toBe('duty');
  });

  it('market relevance fires on price/supply language and stays quiet otherwise', () => {
    const hot = assessMarketRelevance('their reserves are gone, withdrawals halted, price to zero');
    expect(hot.relevant).toBe(true);
    expect(hot.matchedTerms).toContain('reserves');
    expect(assessMarketRelevance('the support agent was very helpful today').relevant).toBe(false);
  });

  it('a repost adopts the observed text; a like of an unread post adopts text we never read', () => {
    const t = target();
    const reposted = whatWouldBeAdopted('repost', 'adopts_target_claims', t, null);
    expect(reposted.adoptedText).toBe(t.text);
    expect(reposted.adoptsUnreadText).toBe(false);
    expect(reposted.statement).toContain('@someone');

    const unread = whatWouldBeAdopted('like', 'adopts_target_claims', target({ text: null }), null);
    expect(unread.adoptedText).toBeNull();
    expect(unread.adoptsUnreadText).toBe(true);
    expect(unread.statement).toContain('has not observed');
  });

  it('a reply adopts nothing even when the target is full of claims', () => {
    const a = whatWouldBeAdopted('reply', 'own_communication_only', target({ text: 'price to zero, reserves gone' }), 'We have replied by email.');
    expect(a.adoptedText).toBeNull();
    expect(a.adoptsUnreadText).toBe(false);
    expect(a.statement).toContain('adopts nothing');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('§4 UCPD Annex I point 11 — disclosure adequacy', () => {
  it('a label in the opening text is adequate', () => {
    const d = assessDisclosure('#ad We partnered with Acme on this campaign.');
    expect(d.present).toBe(true);
    expect(d.adequate).toBe(true);
    expect(d.inadequacies).toEqual([]);
  });

  it('a label buried in the trailing hashtag block is inadequate', () => {
    const d = assessDisclosure('Acme is doing great things for traders everywhere. #crypto #trading #ad @acme');
    expect(d.present).toBe(true);
    expect(d.adequate).toBe(false);
    expect(d.inadequacies).toContain('trailing_hashtag_block');
    expect(d.trailingBlockStart).not.toBeNull();
  });

  it('merely tagging the trader is not a disclosure', () => {
    const d = assessDisclosure('Big things happening with @acme this quarter.');
    expect(d.present).toBe(false);
    expect(d.inadequacies).toContain('absent');
    expect(d.inadequacies).toContain('merely_tagging_the_trader');
  });

  it('a label past the prominence budget is inadequate', () => {
    const padding = 'x'.repeat(DISCLOSURE_PROMINENCE_BUDGET_CHARS + 5);
    const d = assessDisclosure(`${padding} paid partnership with Acme`);
    expect(d.present).toBe(true);
    expect(d.inadequacies).toContain('beyond_prominence_budget');
  });

  it('a caller-observed truncation point is used instead of the policy budget', () => {
    const d = assessDisclosure('short intro then more words here and there #ad', { visibleChars: 10 });
    expect(d.inadequacies).toContain('behind_expansion');
  });

  it('#adoption is not #ad — boundaries are enforced', () => {
    const d = assessDisclosure('#adoption of the standard is growing');
    expect(d.present).toBe(false);
  });

  it('tokens are returned in offset order and prose endings have no trailing block', () => {
    const found = findDisclosureTokens('advertisement here and later #ad again');
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found[0]!.offset).toBeLessThan(found[found.length - 1]!.offset);
    expect(trailingTagBlockStart('this ends in ordinary prose')).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('§5 UCPD Annex I point 22 — staff from personal accounts', () => {
  it('the official account does not engage point 22', () => {
    const a = assessStaffCapacity(speaker(), 'reply', target(), 'We have looked into this.');
    expect(a.finding).toBe('not_engaged');
    expect(a.refusals).toEqual([]);
  });

  it('an unresolved speaker capacity refuses rather than assuming the safer answer', () => {
    const a = assessStaffCapacity(speaker({ capacity: 'unknown' }), 'reply', target(), 'hello');
    expect(a.finding).toBe('capacity_unknown');
    expect(codes(a.refusals)).toEqual(['SPEAKER_CAPACITY_UNKNOWN']);
    expect(a.refusals[0]!.recovery.kind).toBe('supply_data');
  });

  it('a staff personal account promoting the employer without saying so is a per-se breach', () => {
    const a = assessStaffCapacity(
      speaker({ capacity: 'staff_personal_account', handle: '@colleague', itemPromotesEmployer: true }),
      'reply',
      target(),
      'Honestly the best exchange I have used, withdrawals are instant.',
    );
    expect(a.finding).toBe('undisclosed_personal_account');
    expect(codes(a.refusals)).toEqual(['UCPD_STAFF_POSING_AS_CONSUMER']);
    expect(a.refusals[0]!.recovery.kind).toBe('edit_text');
    expect(a.refusals[0]!.rule.provision).toBe('Annex I point 22');
  });

  it('a bio-only disclosure is not accepted, and the sentence says why', () => {
    const a = assessStaffCapacity(
      speaker({ capacity: 'staff_personal_account', itemPromotesEmployer: true, employmentDisclosedInProfileOnly: true }),
      'reply',
      target(),
      'Great product, genuinely.',
    );
    expect(a.finding).toBe('undisclosed_personal_account');
    expect(a.refusals[0]!.sentence).toContain('profile');
  });

  it('a disclosure in the item itself clears it', () => {
    const a = assessStaffCapacity(
      speaker({ capacity: 'staff_personal_account', itemPromotesEmployer: true }),
      'reply',
      target(),
      'Disclosure: I work at LCX. The withdrawal queue is documented in our status page.',
    );
    expect(a.finding).toBe('disclosed_in_item');
    expect(a.refusals).toEqual([]);
  });

  it('a disclosure past the prominence budget is not prominent', () => {
    const padding = 'a '.repeat(DISCLOSURE_PROMINENCE_BUDGET_CHARS);
    const a = assessStaffCapacity(
      speaker({ capacity: 'staff_personal_account', itemPromotesEmployer: true }),
      'reply',
      target(),
      `${padding} i work at LCX`,
    );
    expect(a.finding).toBe('disclosure_not_prominent');
    expect(codes(a.refusals)).toEqual(['UCPD_DISCLOSURE_BELOW_TRUNCATION_FOLD']);
  });

  it('a like of LCX\'s own post from a personal staff account has nowhere to put a disclosure', () => {
    const a = assessStaffCapacity(
      // itemPromotesEmployer is FALSE and must be overridden by the derivation
      speaker({ capacity: 'staff_personal_account', itemPromotesEmployer: false }),
      'like',
      target({ isLcxOwnAccount: true }),
      null,
    );
    expect(a.promotesEmployer).toBe(true);
    expect(a.finding).toBe('no_surface_for_disclosure');
    expect(codes(a.refusals)).toEqual(['UCPD_STAFF_POSING_AS_CONSUMER']);
    expect(a.refusals[0]!.recovery.kind).toBe('not_recoverable');
  });

  it('a personal account not promoting the employer is out of scope', () => {
    const a = assessStaffCapacity(speaker({ capacity: 'staff_personal_account' }), 'reply', target(), 'nice weather');
    expect(a.finding).toBe('not_engaged');
  });

  it('employment disclosure is read from the text, not from a flag', () => {
    expect(assessEmploymentDisclosure(null).disclosed).toBe(false);
    expect(assessEmploymentDisclosure('I work at LCX').disclosed).toBe(true);
    expect(assessEmploymentDisclosure('LCX is great').disclosed).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('§6 the amplification gate', () => {
  const RUMOUR = 'BREAKING: their reserves are gone and withdrawals halted, price to zero next';

  it('a clean reply on a checked, benign target refuses nothing', () => {
    const v = assessAmplification(request());
    expect(v.refusals).toEqual([]);
    expect(v.notChecked).toEqual([]);
    expect(v.statement).toContain('No rule this gate holds was matched');
  });

  it('THE ASYMMETRY: the same unchecked target is clean under reply and refused under repost', () => {
    const unchecked = { target: target({ text: RUMOUR }), targetFindings: null };
    const reply = assessAmplification(request({ verb: 'reply', ...unchecked }));
    expect(codes(reply.refusals)).toEqual([]);

    const repost = assessAmplification(
      request({ verb: 'repost', surface: 'original_post', ownText: null, ...unchecked }),
    );
    expect(codes(repost.refusals)).toContain('ADOPTION_OF_UNVERIFIED_TARGET');
    expect(repost.notChecked.join(' ')).toContain('claim gate was not run');
  });

  it('an unchecked target is not a clean target, and an empty findings array is a different input', () => {
    const notRun = assessAmplification(request({ verb: 'repost', ownText: null, targetFindings: null }));
    expect(codes(notRun.refusals)).toContain('ADOPTION_OF_UNVERIFIED_TARGET');

    const checkedClean = assessAmplification(request({ verb: 'repost', ownText: null, targetFindings: [] }));
    expect(codes(checkedClean.refusals)).toEqual([]);
    expect(checkedClean.notChecked).toEqual([]);
  });

  it('the target\'s own refusals are inherited by name, and there is nothing to edit', () => {
    const inherited: Refusal = {
      code: 'REGULATED_PROMISE_PRICE',
      sentence: 'A price prediction cannot be published.',
      rule: { instrument: 'mica', provision: 'Art 66(2)', text: 'fair, clear and not misleading' },
      recovery: { kind: 'edit_text', what: 'remove the prediction' },
      matched: '10x by Q4',
      ruleSetVersion: 1,
    };
    const v = assessAmplification(
      request({ verb: 'repost', ownText: null, target: target({ text: 'LCX 10x by Q4' }), targetFindings: [inherited] }),
    );
    expect(codes(v.refusals)).toContain('ADOPTION_OF_REFUSED_CONTENT');
    expect(v.inheritedRefusalCodes).toEqual(['REGULATED_PROMISE_PRICE']);
    const adoption = v.refusals.find((r) => r.code === 'ADOPTION_OF_REFUSED_CONTENT')!;
    expect(adoption.recovery.kind).toBe('not_recoverable');
    expect(adoption.sentence).toContain('REGULATED_PROMISE_PRICE');
  });

  it('a quarantined target cannot be amplified, and the promotion requirement is quoted back', () => {
    const v = assessAmplification(
      request({ verb: 'like', ownText: null, target: target({ provenance: QUARANTINED }) }),
    );
    const r = v.refusals.find((x) => x.code === 'ADOPTION_OF_UNVERIFIED_TARGET')!;
    expect(r.sentence).toContain('quarantine');
    expect(r.recovery).toEqual({
      kind: 'supply_data',
      missing: 'an oEmbed record agreeing on handle, text and posted_at',
      whoCanSupply: 'the operator',
    });
  });

  it('an unverified market-relevant claim must be verified BEFORE amplification', () => {
    const v = assessAmplification(
      request({ verb: 'quote', surface: 'quote_post', ownText: 'This is not correct.', target: target({ text: RUMOUR }) }),
    );
    const r = v.refusals.find((x) => x.code === 'ART_91_2_C_RUMOUR_RESTATED')!;
    expect(r.recovery.kind).toBe('supply_data');
    expect(r.rule.provision).toBe('Art 91(2)(c)');
  });

  it('a known-false claim may not be republished at all', () => {
    const v = assessAmplification(
      request({ verb: 'quote', surface: 'quote_post', ownText: 'Wrong.', target: target({ text: RUMOUR, verification: 'known_false' }) }),
    );
    const r = v.refusals.find((x) => x.code === 'ART_91_2_C_RUMOUR_RESTATED')!;
    expect(r.recovery.kind).toBe('not_recoverable');
  });

  it('a verified market-relevant target does not trip the rumour gate', () => {
    const v = assessAmplification(
      request({ verb: 'repost', ownText: null, target: target({ text: RUMOUR, verification: 'verified_by_desk' }) }),
    );
    expect(codes(v.refusals)).not.toContain('ART_91_2_C_RUMOUR_RESTATED');
  });

  it('no partner register means no amplification, and the gap is named rather than passed', () => {
    const v = assessAmplification(
      request({ verb: 'repost', ownText: null, target: target({ partner: { state: 'register_absent' } }) }),
    );
    expect(codes(v.refusals)).toContain('PARTNER_CONSIDERATION_UNKNOWN');
    expect(v.notChecked.join(' ')).toContain('no register exists');
  });

  it('an unknown consideration kind refuses; none does not', () => {
    const base = { handle: '@acme' as const, direction: 'lcx_gave' as const, disclosureTermsRecorded: true, recordedAt: '2026-07-01T00:00:00Z' };
    const unknown = assessAmplification(
      request({ verb: 'repost', ownText: null, target: target({ partner: { state: 'partner', partner: { ...base, consideration: 'unknown' } } }) }),
    );
    expect(codes(unknown.refusals)).toContain('PARTNER_CONSIDERATION_UNKNOWN');

    const none = assessAmplification(
      request({ verb: 'repost', ownText: null, target: target({ partner: { state: 'partner', partner: { ...base, consideration: 'none' } } }) }),
    );
    expect(codes(none.refusals)).toEqual([]);
  });

  it('amplifying a partner\'s unlabelled post is the brand\'s infringement', () => {
    const v = assessAmplification(
      request({
        verb: 'repost',
        ownText: null,
        target: target({
          text: 'LCX is the venue I use every day, check it out',
          partner: {
            state: 'partner',
            partner: { handle: '@acme', consideration: 'token_allocation', direction: 'lcx_gave', disclosureTermsRecorded: true, recordedAt: '2026-07-01T00:00:00Z' },
          },
        }),
      }),
    );
    const r = v.refusals.find((x) => x.code === 'UCPD_UNDISCLOSED_PAID_PROMOTION')!;
    expect(r.rule.provision).toBe('Annex I point 11');
    expect(r.recovery.kind).toBe('wait_until');
    expect(v.targetDisclosure!.adequate).toBe(false);
  });

  it('#ad in the partner\'s trailing hashtag block is a prominence refusal, not a pass', () => {
    const v = assessAmplification(
      request({
        verb: 'repost',
        ownText: null,
        target: target({
          text: 'LCX is the venue I use every day, check it out #crypto #ad',
          partner: {
            state: 'partner',
            partner: { handle: '@acme', consideration: 'free_product', direction: 'lcx_gave', disclosureTermsRecorded: false, recordedAt: '2026-07-01T00:00:00Z' },
          },
        }),
      }),
    );
    expect(codes(v.refusals)).toContain('UCPD_DISCLOSURE_BELOW_TRUNCATION_FOLD');
    expect(v.diligenceGaps.join(' ')).toContain('No labelling terms are recorded');
    expect(codes(v.refusals)).not.toContain('UCPD_UNDISCLOSED_PAID_PROMOTION');
  });

  it('our own item must carry its own label even when the partner\'s post does', () => {
    const v = assessAmplification(
      request({
        verb: 'quote',
        surface: 'quote_post',
        ownText: 'Delighted to be working with Acme on this.',
        target: target({
          text: '#ad Working with LCX on a new campaign',
          partner: {
            state: 'partner',
            partner: { handle: '@acme', consideration: 'payment', direction: 'lcx_received', disclosureTermsRecorded: true, recordedAt: '2026-07-01T00:00:00Z' },
          },
        }),
      }),
    );
    expect(v.targetDisclosure!.adequate).toBe(true);
    expect(v.ownDisclosure!.adequate).toBe(false);
    expect(codes(v.refusals)).toContain('UCPD_UNDISCLOSED_PAID_PROMOTION');
  });

  it('an authority suspension blocks the act but still returns the record', () => {
    const suspended: DeskMode = {
      kind: 'suspended_by_authority',
      authority: 'FMA',
      orderRef: 'FMA-2026-11',
      effectiveFrom: '2026-08-01T00:00:00Z',
      expiresAt: '2026-09-12T00:00:00Z',
      suspensionPower: 'cease_or_suspend_30_days',
      recordedBy: 'nik',
    };
    const v = assessAmplification(request({ deskMode: suspended }));
    expect(codes(v.refusals)).toContain('DESK_SUSPENDED_BY_AUTHORITY');
    expect(v.refusals[0]!.recovery.kind).toBe('wait_until');
    expect(v.adopted.statement.length).toBeGreaterThan(0);
  });

  it('heightened mode forces pre-clearance onto an interactive surface', () => {
    const heightened: DeskMode = {
      kind: 'heightened',
      reason: 'two refusals overridden last week',
      imposedBy: 'nik',
      effectiveFrom: '2026-08-01T00:00:00Z',
      expiresAt: null,
    };
    const v = assessAmplification(request({ deskMode: heightened }));
    expect(codes(v.refusals)).toContain('DESK_HEIGHTENED_PRECLEARANCE_REQUIRED');
    expect(v.approval.regime).toBe('pre_approval_required');
    expect(v.approval.upgradedByDeskMode).toBe(true);
  });

  it('a correction that lost its exemption is gated as the amplification it is', () => {
    const targetText = 'LCX moved forty million tokens to an exchange wallet last night';
    const v = assessAmplification(
      request({
        verb: 'correction',
        surface: 'reply',
        ownText: `LCX moved forty million tokens to an exchange wallet last night is a misreading; it was internal.`,
        correctionClaim: { wrong: 'moved to an exchange', right: 'internal rebalance', sourceRef: 'tx-hash' },
        target: target({ text: targetText, verification: 'unverified' }),
        targetFindings: null,
      }),
    );
    expect(v.correction!.exemptionHolds).toBe(false);
    expect(v.adoption.inheritsTargetRisk).toBe(true);
    expect(codes(v.refusals)).toContain('ADOPTION_OF_UNVERIFIED_TARGET');
    expect(v.adoption.consequence).toContain('Q11');
  });

  it('an act on a missing target is refused rather than recorded', () => {
    const v = assessAmplification(request({ verb: 'like', ownText: null, target: null }));
    expect(codes(v.refusals)).toContain('DATA_ABSENT_NOT_ZERO');
  });

  it('every refusal the gate emits is well formed and its code is declared in types', () => {
    const cases: readonly AmplificationRequest[] = [
      request({ verb: 'repost', ownText: null, targetFindings: null }),
      request({ verb: 'like', ownText: null, target: target({ provenance: QUARANTINED, partner: { state: 'register_absent' } }) }),
      request({ verb: 'quote', surface: 'quote_post', ownText: 'no', target: target({ text: 'reserves gone', verification: 'known_false' }) }),
      request({ speaker: speaker({ capacity: 'unknown' }) }),
      request({ verb: 'like', ownText: null, target: null }),
    ];
    for (const c of cases) {
      const v = assessAmplification(c);
      expect(v.refusals.length).toBeGreaterThan(0);
      for (const r of v.refusals) {
        expect(REFUSAL_CODES).toContain(r.code);
        expect(r.sentence.trim().length).toBeGreaterThan(20);
        expect(r.rule.text.trim().length).toBeGreaterThan(20);
        expect(Object.keys(INSTRUMENTS)).toContain(r.rule.instrument);
        expect(r.ruleSetVersion).toBe(ADOPTION_RULESET_VERSION);
      }
      expect(v.statement).toContain('refusal(s)');
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('§7 two state machines, not one', () => {
  it('static surfaces pre-approve, interactive surfaces do not', () => {
    expect(approvalObligationFor('bio', NORMAL).regime).toBe('pre_approval_required');
    expect(approvalObligationFor('pinned_post', NORMAL).regime).toBe('pre_approval_required');
    expect(approvalObligationFor('reply', NORMAL).regime).toBe('risk_based_review_plus_retention');
    expect(approvalObligationFor('reply', NORMAL).obligations.join(' ')).toContain('sampling record');
    expect(approvalObligationFor('bio', NORMAL).obligations.join(' ')).toContain('content hash');
  });

  it('a suspension does not silently become a pre-approval regime', () => {
    const suspended: DeskMode = {
      kind: 'suspended_by_authority',
      authority: 'FMA',
      orderRef: 'x',
      effectiveFrom: '2026-08-01T00:00:00Z',
      expiresAt: '2026-09-12T00:00:00Z',
      suspensionPower: 'cease_or_suspend_30_days',
      recordedBy: 'nik',
    };
    const o = approvalObligationFor('reply', suspended);
    expect(o.regime).toBe('risk_based_review_plus_retention');
    expect(o.upgradedByDeskMode).toBe(false);
  });

  describe('the interactive lane', () => {
    const base: ReviewSamplingRecord = {
      periodFrom: '2026-07-01T00:00:00Z',
      periodTo: '2026-07-31T23:59:59Z',
      population: 'every public reply sent from @lcx in the period',
      populationCount: 100,
      reviewedCount: 20,
      riskStrata: ['mentions a listed asset', 'complaint'],
      selectionBasis: 'every 5th item by permalink id, plus all items in the risk strata',
      reviewer: 'nik',
      findings: [],
      escalations: [],
    };

    it('no record is not a zero sample rate', () => {
      const a = evaluateInteractiveSupervision(null);
      expect(a.state).toBe('record_absent');
      expect(a.sampleRate).toBeNull();
      expect(codes(a.refusals)).toEqual(['REVIEW_SAMPLING_RECORD_ABSENT']);
      expect(a.statement).toContain('not a 0% sample rate');
    });

    it('an arithmetically impossible record is refused', () => {
      const a = evaluateInteractiveSupervision({ ...base, reviewedCount: 200 });
      expect(a.state).toBe('record_inconsistent');
      expect(a.sampleRate).toBeNull();
      expect(a.refusals).toHaveLength(1);
    });

    it('an empty period is honest, not a failure, and its rate is undefined', () => {
      const a = evaluateInteractiveSupervision({ ...base, populationCount: 0, reviewedCount: 0 });
      expect(a.state).toBe('no_population');
      expect(a.sampleRate).toBeNull();
      expect(a.refusals).toEqual([]);
    });

    it('"spot checks" is not a sampling method', () => {
      const a = evaluateInteractiveSupervision({ ...base, selectionBasis: 'spot checks when time allows' });
      expect(a.state).toBe('basis_unfalsifiable');
      expect(a.matchedTerms).toContain('spot check');
      expect(a.refusals).toHaveLength(1);
    });

    it('random without a seed cannot be re-run; random with one can', () => {
      const bare = evaluateInteractiveSupervision({ ...base, selectionBasis: 'a random selection' });
      expect(bare.state).toBe('basis_unfalsifiable');
      const seeded = evaluateInteractiveSupervision({ ...base, selectionBasis: 'random, seed 42' });
      expect(seeded.state).toBe('evidenced');
    });

    it('an empty basis is refused', () => {
      expect(evaluateInteractiveSupervision({ ...base, selectionBasis: '   ' }).state).toBe('basis_unfalsifiable');
    });

    it('items with nobody reviewing them is a real zero, and a finding', () => {
      const a = evaluateInteractiveSupervision({ ...base, reviewedCount: 0 });
      expect(a.state).toBe('no_review_performed');
      expect(a.sampleRate).toBe(0);
      expect(a.refusals).toHaveLength(1);
    });

    it('a principled record is evidenced, and says it covers review only', () => {
      const a = evaluateInteractiveSupervision(base);
      expect(a.state).toBe('evidenced');
      expect(a.sampleRate).toBeCloseTo(0.2);
      expect(a.refusals).toEqual([]);
      expect(a.statement).toContain('does not check retention');
    });
  });

  describe('the static lane', () => {
    const clearance = (over: Partial<Clearance> = {}): Clearance => ({
      role: 'reputation',
      mode: 'blocking',
      reviewer: 'lena',
      at: '2026-08-01T09:00:00Z',
      headlineTest: true,
      contentHash: 'hash-1',
      comment: null,
      ...over,
    });

    const record = {
      surface: 'bio' as const,
      author: 'nik',
      contentHash: 'hash-1',
      clearances: [clearance()],
      eligibleApprovers: ['nik', 'lena'],
    };

    it('a blocking clearance by someone else, bound to the current bytes, satisfies it', () => {
      const a = evaluateStaticPreApproval(record);
      expect(a.satisfied).toBe(true);
      expect(a.refusals).toEqual([]);
      expect(a.validClearances).toHaveLength(1);
    });

    it('self-approval is refused', () => {
      const a = evaluateStaticPreApproval({ ...record, clearances: [clearance({ reviewer: 'nik' })] });
      expect(codes(a.refusals)).toContain('SELF_APPROVAL_FORBIDDEN');
      expect(a.satisfied).toBe(false);
    });

    it('editing the text after clearance voids it', () => {
      const a = evaluateStaticPreApproval({ ...record, contentHash: 'hash-2' });
      expect(codes(a.refusals)).toContain('CLEARANCE_VOID_CONTENT_CHANGED');
      expect(a.voidedClearances).toHaveLength(1);
      expect(a.validClearances).toEqual([]);
    });

    it('an advisory reviewer cannot clear a static item', () => {
      const a = evaluateStaticPreApproval({ ...record, clearances: [clearance({ mode: 'advisory' })] });
      expect(a.satisfied).toBe(false);
      expect(codes(a.refusals)).toContain('PRE_APPROVAL_MISSING');
    });

    it('a one-person workspace is told four eyes is impossible, not asked to try harder', () => {
      const a = evaluateStaticPreApproval({ ...record, clearances: [], eligibleApprovers: ['nik'] });
      expect(codes(a.refusals)).toEqual(['FOUR_EYES_UNACHIEVABLE']);
      expect(a.refusals[0]!.recovery.kind).toBe('not_recoverable');
    });

    it('no clearance at all, with someone available, asks for the human', () => {
      const a = evaluateStaticPreApproval({ ...record, clearances: [] });
      expect(codes(a.refusals)).toEqual(['PRE_APPROVAL_MISSING']);
      expect(a.refusals[0]!.recovery).toEqual({ kind: 'human_authority', role: 'reputation' });
    });
  });
});
