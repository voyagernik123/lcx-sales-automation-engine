import type { Reliability, Credibility } from '../provenance.js';

/**
 * MARKETING — the vocabulary the compartment is built on.
 *
 * Types, constants and doc comments only. No logic, no I/O, no `Date.now()`, no
 * randomness. Everything here must be importable from the API, the web app and a
 * test and mean exactly the same thing in all three.
 *
 * TWO CONSTRAINTS ARE ENCODED IN WHAT IS *ABSENT* FROM THIS FILE, and they are not
 * preferences:
 *   1. There is no X/Twitter API credential and never will be. So there is no
 *      `impressions`, no `followerCount`, no timeline query — see §8.
 *   2. Nothing may act as the LCX account. So there is no `post`, `schedule`,
 *      `send`, `credential` or `session` noun anywhere in this compartment. The
 *      terminal state of a cleared draft is `handoff` — a human copies the text and
 *      posts it by hand, outside this system, and then pastes back what was
 *      actually published (§9, `PublicationCloseOut`). That gap is the only
 *      unbypassable guarantee that a software defect cannot speak for LCX.
 *
 * Why the vocabulary is this large: the two most dangerous classes of failure here
 * are invisible to a wording review. A "coming soon" reply about an unannounced
 * listing is unlawful disclosure of inside information (MiCA Art 90); a bullish
 * reply about a token the author personally holds is market manipulation (Art
 * 91(3)(c), fines from EUR 700 000 for a *natural person* — Art 111(2)(d)). Neither
 * is a sentence-quality problem. Both are resolved by joins against state — an
 * embargo register and a holdings declaration — so that state has to be nameable
 * here or the engines cannot refuse on it.
 *
 * Citation policy: every legal claim below names its provision. Primary text was
 * read directly (EUR-Lex CELEX:32023R1114 for MiCA, CELEX:02005L0029-20220528 for
 * the UCPD, the FINRA rulebook and Regulatory Notices for 2210/10-06/17-18).
 * `INSTRUMENTS` (§5) carries the source URLs so a citation is checkable rather than
 * asserted.
 */

/* ════════ §0 SHARED REFERENCE SHAPES ════════ */

/**
 * A ticker/symbol as the desk writes it, uppercased by convention but NOT
 * normalised by this type. Resolution to a listed asset is a join, and a symbol
 * that resolves to nothing must produce a refusal, never an assumption (doctrine
 * rule 3).
 */
export type AssetSymbol = string;

/** A workspace member's stable id — the named human on every record. */
export type ActorId = string;

/**
 * An X handle WITHOUT the leading '@'. Never a display name: display names are
 * attacker-chosen and are not identity.
 */
export type Handle = string;

/** ISO-8601 UTC instant, e.g. `2026-08-02T09:41:00.000Z`. */
export type Instant = string;

/** Lowercase hex SHA-256. Approval binds to one of these, never to a row id. */
export type ContentHash = string;

/**
 * A jurisdiction a communication was, or was not, addressed to.
 *
 * Deliberately NOT `claims/types.ts`'s `Jurisdiction` (`'eu' | 'us' | 'global'`),
 * which is sales-shaped. Art 7(3) gives the competent authority of *each* Member
 * State where a communication is disseminated the power to assess it, and Art 8(2)
 * requires notification to the host authority — so "eu" is not a granular enough
 * answer to "was this visible to consumers in Italy". `'uk'` is separate because
 * the UK financial-promotions regime is criminal in character and was NOT verified
 * in research (mkt-r1 §8 gap 6): it is listed so it can be *excluded*, not so it
 * can be claimed as cleared.
 */
export type MarketingJurisdiction =
  | 'li'          // Liechtenstein — home Member State, FMA is the competent authority
  | 'eea_other'   // any other EEA state reached by the passport
  | 'uk'
  | 'us'
  | 'row'         // rest of world
  | 'unknown';    // and `unknown` may not be treated as cleared

/**
 * Where a communication a human published can be re-read. Stored, never
 * constructed: `x.com/{handle}/status/{id}` happens to redirect, which makes a
 * constructed URL look right while pointing at the wrong profile path.
 */
export type Permalink = string;

/**
 * A recorded decision to stop a clock — any clock. THE ONE SHAPE, and it lives here
 * because it was written twice: `crisis.ts` had it for the time-to-first-statement
 * budget and `triage.ts` had it, field-for-field identical, for the triage clock. Two
 * declarations of the same record is how the reason field ends up mandatory in one
 * surface and optional in the other.
 *
 * `reason` and `by` are both mandatory and both checked by the caller, because a
 * suppression with no reason is how a breach becomes invisible — and the breach, not
 * the suppression, is what a post-mortem can learn from. Suppressing does NOT erase the
 * elapsed figure: both clocks keep reporting how long it had been, so the record shows
 * that the desk was late AND that it said why.
 */
export interface ClockSuppression {
  readonly reason: string;
  readonly by: ActorId;
  readonly at: Instant;
}

/**
 * THE COMPARTMENT'S ONE LEXICAL NORMALISER. Lowercase, turn every non-alphanumeric run
 * into a single space, and pad with spaces so a term can be tested at a word-ish
 * boundary without a regex per term.
 *
 * Punctuation becomes a space rather than being deleted: deleting it joins words across
 * a full stop and manufactures matches the reader cannot see in the text.
 *
 * It lives in the vocabulary because it decides what "the same words" means, and that is
 * a rule, not a helper. `adoption.ts` and `precedent.ts` each carried a byte-identical
 * private copy, with a comment in one of them arguing the duplication was deliberate.
 * It was not survivable: `adoption.ts:442 sharedWordRun` degrades a claimed correction
 * to an adoption on a six-word overlap, and `precedent.ts` decides whether two published
 * statements contradict. If those two ever normalise differently, the desk can be told a
 * reply is a correction while the precedent index reads it as a restatement.
 *
 * Pure and total: no clock, no randomness, no module-level regex state (no `/g`).
 */
export function normaliseForMatch(text: string): string {
  const lowered = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return ` ${lowered.trim().replace(/\s+/g, ' ')} `;
}

/* ════════ §1 REGIME — WHICH LAW APPLIES TO THIS ITEM ════════ */

/**
 * The legal regime an item falls under. An item is routinely in SEVERAL AT ONCE —
 * a celebratory listing tweet is `casp_conduct` (Art 66) *and* `offer_promo`
 * (Art 7) *and* `market_abuse` (Title VI, because LCX operates the platform the
 * asset is admitted to). Hence `RegimeSet` below: nothing in this compartment may
 * pick one regime and discard the others, because the mandatory elements are the
 * UNION of the applicable ones and the refusals are the union of theirs too.
 *
 *  - `casp_conduct`   Art 66(2)-(3). The baseline duty on LCX as a CASP: fair,
 *                     clear and not misleading, "including in marketing
 *                     communications, which shall be identified as such", breached
 *                     "deliberately or negligently"; plus the risk warning and,
 *                     for a trading platform, hyperlinks to white papers. This
 *                     attaches to essentially every public statement.
 *                     (Corrects an earlier brief that cited Art 29: Art 29 governs
 *                     issuers of asset-referenced tokens, not LCX's own account.)
 *  - `offer_promo`    Art 7. Marketing communications for an offer to the public
 *                     or an admission to trading. Art 7(1) is drafted to catch
 *                     "the operator of the trading platform", so a new-listing
 *                     post is capable of being an Art 7 communication. Drags the
 *                     mandated statement (Art 7(1)(e)) plus the white-paper and
 *                     contact-details elements (Art 7(1)(d)) — see §1.2, which is
 *                     arithmetic, not judgement.
 *  - `art_promo`      Art 29. Asset-referenced tokens. Bites only where LCX is the
 *                     issuer or promoting on the issuer's behalf.
 *  - `emt_promo`      Art 53. E-money tokens. Same narrowness.
 *  - `market_abuse`   Title VI, Arts 86-92. Art 86 applies Title VI to "any
 *                     person", to behaviour "irrespective of whether [it] takes
 *                     place on a trading platform", and "in the Union and in third
 *                     countries", for any asset admitted to trading or with a
 *                     pending admission request. Every asset LCX lists or has
 *                     applied to list is therefore in scope, which is the subject
 *                     matter of most replies.
 *  - `ucpd_paid_promotion`
 *                     Directive 2005/29/EC Annex I point 11 (undisclosed
 *                     advertorial, unfair "in all circumstances") and point 22
 *                     (falsely representing oneself as a consumer), read with
 *                     Commission Guidance 2021/C 526/01 §4.2.6. Attaches whenever
 *                     consideration of ANY kind passed — see `ConsiderationKind`.
 *  - `advice`         Art 81 read with the Art 3(1) definition of "providing
 *                     advice on crypto-assets". Reached by personalisation, not by
 *                     topic. An item in this regime cannot be made compliant
 *                     inside a public reply (Art 81(1) suitability, Art 81(2) "in
 *                     good time before"), so this regime's only honest outcome is
 *                     a refusal — see `ART_81_PERSONALISED_RECOMMENDATION`.
 */
export type MarketingRegime =
  | 'casp_conduct'
  | 'offer_promo'
  | 'art_promo'
  | 'emt_promo'
  | 'market_abuse'
  | 'ucpd_paid_promotion'
  | 'advice';

/**
 * The regimes applying to one item. Non-empty by intent: an item with an empty
 * regime set has not been classified, and MiCA never defines "marketing
 * communication" at Level 1 (checked against the Art 3(1) definitions), so the
 * classification is a recorded judgement with reasons — never an obvious fact.
 */
export type RegimeSet = readonly MarketingRegime[];

export const MARKETING_REGIMES: readonly MarketingRegime[] = [
  'casp_conduct',
  'offer_promo',
  'art_promo',
  'emt_promo',
  'market_abuse',
  'ucpd_paid_promotion',
  'advice',
] as const;

export const REGIME_LABEL: Record<MarketingRegime, string> = {
  casp_conduct: 'CASP conduct (MiCA Art 66(2)-(3))',
  offer_promo: 'Offer / admission promotion (MiCA Art 7)',
  art_promo: 'Asset-referenced token promotion (MiCA Art 29)',
  emt_promo: 'E-money token promotion (MiCA Art 53)',
  market_abuse: 'Market abuse (MiCA Title VI, Arts 86-92)',
  ucpd_paid_promotion: 'Paid promotion / influencer (UCPD 2005/29/EC Annex I)',
  advice: 'Advice on crypto-assets (MiCA Art 81)',
};

/**
 * Why an item was put in a regime. Recorded, not recomputed: recomputing at export
 * time applies today's rules to yesterday's text, which has close to zero
 * evidential value under Art 68(9) ("sufficient to enable competent authorities
 * ... to ascertain whether [the CASP] complied").
 */
export interface RegimeAssignment {
  readonly regime: MarketingRegime;
  /** The human-readable reason this regime was assigned to THIS item. */
  readonly basis: string;
  /** The provision relied on. */
  readonly citation: RuleCitation;
  /** Who decided, and when. Never a machine alone for `advice` or `market_abuse`. */
  readonly decidedBy: ActorId;
  readonly decidedAt: Instant;
}

/**
 * The classification of one item, snapshotted at approval time.
 *
 * `linkPresent` is load-bearing and cheap: ESMA's reverse-solicitation guideline
 * (ESMA35-1872330276-1899, GL 1 para 17) treats educational material as promotion
 * once "the audience is directed to the [firm]'s website". So a first-party link or
 * CTA flips an educational reply into a marketing communication, which switches on
 * the identify-as-such and risk-warning elements. Used here by analogy — that
 * guideline formally addresses third-country firms — and the analogy is recorded as
 * such rather than dressed up as a direct duty.
 */
export interface RegimeClassification {
  readonly regimes: RegimeSet;
  readonly assignments: readonly RegimeAssignment[];
  /** True when the item contains a first-party link, signup or app-store CTA. */
  readonly linkPresent: boolean;
  /** Jurisdictions the desk asserts this was addressed to. */
  readonly addressedTo: readonly MarketingJurisdiction[];
  /**
   * Jurisdictions explicitly excluded. Needed because "we did not target the UK"
   * is a factual claim that must be evidenced, and because a token prize draw's
   * lawfulness is national gambling law, unharmonised, and can only come from
   * counsel (mkt-r1 §5.3).
   */
  readonly excludedFrom: readonly MarketingJurisdiction[];
  /** Ruleset version that produced the mandatory-element list, stamped at decision time. */
  readonly ruleSetVersion: number;
}

/* ──── §1.1 Mandatory elements ──── */

/**
 * An element some regime requires to be PRESENT in the artefact itself.
 *
 * `conflict_of_interest_disclosure` is in this list rather than in a compliance
 * register because Art 91(3)(c) requires the conflict to be disclosed
 * "simultaneously ... to the public in a proper and effective way" — a holdings
 * register filed with compliance does not satisfy it. The disclosure has to be in
 * the post.
 *
 * `paid_promotion_disclosure` must additionally be prominent and unavoidable:
 * Commission Guidance 2021/C 526/01 §4.2.6 states a disclosure is inadequate where
 * it is "hashtags at the end of a lengthy disclaimer; merely tagging a trader" or
 * "requires the consumer to take additional steps (e.g. click on 'read more')".
 * On X that means inside the visible text before truncation — hence
 * `MandatoryElementCheck.aboveTruncationFold`.
 */
export type MandatoryElement =
  | 'identified_as_marketing'            // Art 7(1)(a), Art 66(2)
  | 'fair_clear_not_misleading'          // Art 7(1)(b), Art 66(2)
  | 'consistent_with_white_paper'        // Art 7(1)(c)
  | 'white_paper_published_statement'    // Art 7(1)(d) first limb
  | 'offeror_contact_details'            // Art 7(1)(d) second limb: website + phone + email
  | 'no_authority_review_statement'      // Art 7(1)(e) — verbatim, see §1.2
  | 'risk_warning'                       // Art 66(3) first sentence
  | 'white_paper_hyperlink'              // Art 66(3) second sentence
  | 'regulated_status_of_named_product'  // ESMA35-1872330276-2329 (halo effect)
  | 'paid_promotion_disclosure'          // UCPD Annex I pt 11 + Guidance §4.2.6
  | 'conflict_of_interest_disclosure'    // Art 91(3)(c)
  /**
   * Art 29(2) (asset-referenced tokens) and Art 53(2) (e-money tokens, which add "and
   * at par value"): marketing communications shall contain a clear and unambiguous
   * statement that holders have a right of redemption against the issuer at any time.
   * Both limbs read from the primary text by the regime lane, which could not add the
   * member and recorded the gap at `regime.ts:959` instead. An element list that omits
   * a mandated element is worse than no list, because it reads as complete — so this
   * closes it. Required only on `art_promo` / `emt_promo`; `regime.ts` decides.
   */
  | 'redemption_right_statement';

/**
 * One element's check result, stored as data at approval time (not recomputed).
 * `present: false` on a required element is a refusal, never a warning: doctrine
 * rule 1 — a regulated promise cannot be stripped into safety.
 */
export interface MandatoryElementCheck {
  readonly element: MandatoryElement;
  readonly required: boolean;
  readonly present: boolean;
  /** Which regime pulled it in. Empty when `required` is false. */
  readonly requiredBy: readonly MarketingRegime[];
  /**
   * Whether the element sits in the visible text before the platform truncates.
   * `null` where truncation does not apply to the surface (a landing page).
   */
  readonly aboveTruncationFold: boolean | null;
  /** The span that satisfied it, so the judgement is arguable rather than asserted. */
  readonly evidence: string | null;
}

/* ──── §1.2 The Art 7 arithmetic — a listing promo does not fit in a post ──── */

/** Who the Art 7(1)(e) statement names as solely responsible. */
export type Art7Role = 'offeror' | 'person_seeking_admission' | 'platform_operator';

/**
 * MiCA Art 7(1)(e), VERBATIM, offeror form. 261 characters.
 *
 * Do not paraphrase, do not re-wrap, do not "improve" the punctuation. The
 * Regulation prescribes the words; an engine that checks for this element must
 * assert byte equality against one of these three constants.
 */
export const ART_7_1_E_STATEMENT_OFFEROR =
  'This crypto-asset marketing communication has not been reviewed or approved by any competent authority in any Member State of the European Union. The offeror of the crypto-asset is solely responsible for the content of this crypto-asset marketing communication.';

/** Art 7(1)(e) with the Art 7(1) second-subparagraph substitution. 289 characters. */
export const ART_7_1_E_STATEMENT_PERSON_SEEKING_ADMISSION =
  'This crypto-asset marketing communication has not been reviewed or approved by any competent authority in any Member State of the European Union. The person seeking admission to trading of the crypto-asset is solely responsible for the content of this crypto-asset marketing communication.';

/**
 * Art 7(1)(e), operator-of-the-trading-platform form. 286 characters.
 *
 * THIS IS THE ONE THAT MATTERS FOR LCX, because LCX is the platform operator, and
 * 286 > `X_POST_MAX_CHARS` (280). The mandated statement alone does not fit in a
 * post with zero other content. Art 7(1)(d) then adds the white-paper statement, a
 * website address, a telephone number and an email address on top of that.
 *
 * So: an Art 7 marketing communication CANNOT be compliant as a standalone post.
 * That is arithmetic, not an opinion, and it is why `ART_7_BOILERPLATE_DOES_NOT_FIT`
 * is a refusal with a constructive recovery (`different_surface`) rather than a
 * warning an operator can click past.
 */
export const ART_7_1_E_STATEMENT_PLATFORM_OPERATOR =
  'This crypto-asset marketing communication has not been reviewed or approved by any competent authority in any Member State of the European Union. The operator of the trading platform of the crypto-asset is solely responsible for the content of this crypto-asset marketing communication.';

export const ART_7_1_E_STATEMENT: Record<Art7Role, string> = {
  offeror: ART_7_1_E_STATEMENT_OFFEROR,
  person_seeking_admission: ART_7_1_E_STATEMENT_PERSON_SEEKING_ADMISSION,
  platform_operator: ART_7_1_E_STATEMENT_PLATFORM_OPERATOR,
};

/**
 * The elements Art 7(1)(d) requires in addition to the (e) statement. Their
 * combined length depends on LCX's actual website, telephone number and email, so
 * the budget engine must be given them rather than guessing — an unknown contact
 * block produces `ART_7_BOILERPLATE_DOES_NOT_FIT` with `supply_data`, not an
 * optimistic estimate.
 */
export const ART_7_1_D_ELEMENTS: readonly MandatoryElement[] = [
  'white_paper_published_statement',
  'offeror_contact_details',
] as const;

/**
 * X's character limit for a standard (non-premium) post.
 *
 * Named for the platform because it is the platform's rule, not ours. LCX's
 * premium status is not knowable from inside this compartment, so 280 is the only
 * defensible assumption — assuming the higher limit would let a refusal be
 * silently skipped.
 */
export const X_POST_MAX_CHARS = 280;

/* ──── §1.3 Asset state — the invisible axis (doctrine rule 2) ──── */

/**
 * An asset's inside-information state, as at the moment of drafting.
 *
 * Art 87(1)(a) makes an unannounced listing decision inside information (precise,
 * not public, price-significant), and Art 87(2)-(3) extend that to the intermediate
 * steps of a protracted process. Art 90(1) then prohibits unlawful disclosure to
 * any other person; a teaser reply is a disclosure to the world, and "the normal
 * exercise of an employment" is not a defence a social-media coordinator can hold.
 *
 * `unknown` IS NOT `clear`. A compartment that cannot read the register must refuse
 * (`EMBARGO_REGISTER_EMPTY` / `MARKET_ABUSE_PERIMETER_UNKNOWN`), because the
 * alternative is guessing on the single highest-consequence axis. Empty registers
 * refuse honestly and say so.
 */
export type AssetEmbargoState =
  | 'clear'          // publicly announced, or never inside information
  | 'mnpi_pending'   // inside information exists and is not yet public → hard block
  | 'announced'      // disclosed under Art 88(1); marketing is now a SEPARATE artefact
  | 'exempt_offer'   // Art 4(2)/(3) exemption in force — Art 4(4) can destroy it
  | 'unknown';

/**
 * Whether a named human's position in a named asset is known.
 *
 * `not_declared` and `register_absent` are different facts and must not collapse:
 * the first means this person has not answered, the second means the desk has no
 * register at all. Both refuse (`HOLDINGS_DECLARATION_MISSING`), because Art
 * 91(3)(c) attaches personal liability from EUR 700 000 (Art 111(2)(d)) and a
 * record that says "approved by nik@lcx.com" without "does nik hold TOKEN" cannot
 * answer the only question that matters six months later.
 *
 * Ownership note: the register itself is the owner's and legal's to produce, not
 * this compartment's to infer.
 */
export type HoldingsDeclarationState =
  | 'declared_holding'   // holds it → conflict disclosure required IN THE POST
  | 'declared_none'      // affirmatively declared no position
  | 'not_declared'       // this person has not answered for this asset
  | 'register_absent';   // there is no holdings register

/**
 * Whether a named LCX product is inside MiCA's perimeter.
 *
 * ESMA's statement on avoiding misperceptions (ESMA35-1872330276-2329) names as a
 * DON'T: "The CASP's regulatory status is used as a promotional tool", and requires
 * that "all marketing communications should indicate clearly if a product and/or
 * service offered by a CASP is regulated or not".
 *
 * The uncomfortable consequence, stated plainly because the engine must act on it:
 * LCX's brand line — regulated in Liechtenstein — is a PROHIBITED framing when the
 * item is about an unregulated product. That is LCX's highest-frequency violation
 * risk, and an engine that will not flag its owner's favourite sentence is
 * decoration.
 */
export type ProductRegulatoryStatus = 'mica_regulated' | 'not_mica_regulated' | 'unknown';

/**
 * Consideration that creates a UCPD disclosure duty.
 *
 * Commission Guidance 2021/C 526/01 §4.2.6: "The commercial element is considered
 * to be present whenever the influencer receives any form of consideration ...
 * including in case of payment, discounts, partnership arrangements, percentage
 * from affiliate links, free products (including unsolicited gifts), trips or event
 * invitations etc. The presence of a contract and monetary payment is not necessary
 * to trigger the application of these rules."
 *
 * Hence an enum and not a boolean `isPaid`: comping a conference ticket and
 * airdropping tokens both count. `unknown` refuses
 * (`PARTNER_CONSIDERATION_UNKNOWN`) before any amplification, because the same
 * guidance makes the brand liable for re-posting a partner's unlabelled promo.
 */
export type ConsiderationKind =
  | 'none'
  | 'payment'
  | 'discount'
  | 'partnership'
  | 'affiliate_commission'
  | 'free_product'
  | 'unsolicited_gift'
  | 'trip'
  | 'event_invitation'
  | 'fee_waiver'
  | 'referral_code'
  | 'token_allocation'
  | 'unknown';

/* ════════ §2 THE ENGAGEMENT VERB — THE UNIT OF LEGAL EXPOSURE ════════ */

/**
 * What the desk DID. The object under review is never "the text"; it is
 * `(verb, target, author)`.
 *
 * FINRA's entanglement/adoption doctrine (Regulatory Notice 17-18, "Third-Party
 * Posts") is the sharpest available model and transfers cleanly. Third-party posts
 * are generally not the firm's communications, except where the firm has "paid for
 * or been involved in the preparation of the content" (entanglement) or "explicitly
 * or implicitly endorsed or approved the content" (adoption). RN 17-18 Q9: "By
 * liking or sharing the favorable comments, the representative has adopted them and
 * they are subject to the communications rules." RN 17-18 Q11: correcting a factual
 * error does not constitute adoption of the incorrect original.
 *
 * Consequence a UI cannot be allowed to hide: a tool that offers Like and Reply as
 * equally weightless buttons is wrong. A `like` produces no text of ours and is
 * still a firm communication carrying someone else's claims.
 *
 * Non-engagement is deliberately NOT a verb here. "We decided not to answer" is a
 * decision with a rationale, modelled as `ResponseAction {kind:'ignore'}` in §4, so
 * that it lands in the silence log instead of masquerading as an act that produced
 * an artefact.
 *
 *  - `reply`             our own text, answering a target. Content standards apply
 *                        to our words only.
 *  - `quote`             our text plus a republication of the target. Both our
 *                        communication AND partial adoption — and, when the target
 *                        carries a price-relevant claim, the single highest-risk
 *                        action available to the desk, because Art 91(2)(c) covers
 *                        "the dissemination of rumours" on an "ought to have known"
 *                        standard. Quote-tweeting FUD to rebut it republishes it.
 *  - `repost`            plain repost, no frame. Full adoption: the claim is now
 *                        ours and we added nothing to qualify it.
 *  - `like`              full adoption per RN 17-18 Q9, with no text of ours at all.
 *  - `original`          a post that is not a response to anything. No adoption,
 *                        and no parent context to hide behind either.
 *  - `correction`        a strictly factual correction of a factual error. Per
 *                        RN 17-18 Q11 this does NOT adopt the original. The
 *                        exemption is narrow: it holds only while the correction
 *                        stays factual, so an engine must not let an argument be
 *                        relabelled as a correction to buy the exemption.
 */
export type EngagementVerb =
  | 'reply'
  | 'quote'
  | 'repost'
  | 'like'
  | 'original'
  | 'correction';

export const ENGAGEMENT_VERBS: readonly EngagementVerb[] = [
  'reply', 'quote', 'repost', 'like', 'original', 'correction',
] as const;

/** What the verb does to the target's claims. */
export type AdoptionEffect =
  /** RN 17-18 adoption: the target's claims become ours, in full. */
  | 'adopts_target_claims'
  /** Our words only; the target is context, not content we endorsed. */
  | 'own_communication_only'
  /** Our words AND a republication of theirs. Both sets of standards apply. */
  | 'own_communication_plus_adoption'
  /** RN 17-18 Q11: a factual correction adopts nothing. */
  | 'no_adoption';

/**
 * The adoption table. This is the load-bearing constant of §2 — everything else in
 * the verb model is derived from it.
 */
export const VERB_ADOPTION: Record<EngagementVerb, AdoptionEffect> = {
  reply: 'own_communication_only',
  quote: 'own_communication_plus_adoption',
  repost: 'adopts_target_claims',
  like: 'adopts_target_claims',
  original: 'own_communication_only',
  correction: 'no_adoption',
};

/**
 * Whether the target's own risk flags flow onto our item.
 *
 * True wherever the verb adopts or republishes. The practical effect: a `like` or
 * `repost` of a post carrying an unverified price claim inherits that claim's
 * refusals — there is no text of ours to edit, so the only available outcomes are
 * "do not do it" or "verify the target first".
 */
export const VERB_INHERITS_TARGET_RISK: Record<EngagementVerb, boolean> = {
  reply: false,
  quote: true,
  repost: true,
  like: true,
  original: false,
  correction: false,
};

/** Whether the verb produces text of ours that can be drafted, refused or edited. */
export const VERB_PRODUCES_OWN_TEXT: Record<EngagementVerb, boolean> = {
  reply: true,
  quote: true,
  repost: false,
  like: false,
  original: true,
  correction: true,
};

/**
 * The act, as the record must hold it. `author` and `approver` are separate fields
 * elsewhere (§9) because Art 91(3)(c) needs the position of BOTH, as at approval
 * time.
 */
export interface EngagementAct {
  readonly verb: EngagementVerb;
  /** The post being replied to / quoted / reposted / liked. `null` for `original`. */
  readonly targetPermalink: Permalink | null;
  /** The target's author handle as observed, not as typed. `null` for `original`. */
  readonly targetHandle: Handle | null;
  readonly author: ActorId;
  readonly surface: ContentSurface;
  /** Assets the item names, extracted and stored — Art 86(1) scope, Art 4(4), Art 7(2). */
  readonly namedAssets: readonly AssetSymbol[];
  /** Derived from `VERB_ADOPTION`, snapshotted so the record does not depend on today's table. */
  readonly adoption: AdoptionEffect;
}

/* ════════ §3 STATIC VS INTERACTIVE — TWO APPROVAL REGIMES, NOT ONE ════════ */

/**
 * The surface an item lives on.
 *
 * FINRA Regulatory Notice 10-06 A5 draws the distinction this compartment turns on:
 * "The static content remains posted until it is changed ... a registered principal
 * of the firm must approve all static content on a page of a social networking site
 * ... before it is posted", whereas "interactive posts on sites such as Twitter and
 * Facebook" constitute an interactive electronic forum and "firms are not required
 * to have a registered principal approve these communications prior to use. Of
 * course, firms still must supervise these communications." RN 10-06 A4 gives the
 * test: "whether it is used to engage in real-time interactive communications with
 * third parties".
 *
 * Two state machines, not one. Collapsing them produces either over-gating (nobody
 * replies in time) or under-gating (no audit trail) — the two ways in-house tools
 * fail. FINRA is cited as a MODEL, not as law binding LCX; MiCA sets no
 * pre-clearance regime at all (Art 8(3): competent authorities "shall not require
 * prior approval"), which is precisely why the internal record is the only evidence.
 */
export type ContentSurface =
  | 'bio'
  | 'pinned_post'
  | 'profile'
  | 'campaign_landing_copy'
  | 'reply'
  | 'quote_post'
  | 'original_post'
  | 'thread_in_progress';

export type SurfaceClass = 'static' | 'interactive';

/**
 * `original_post` is INTERACTIVE, and this is the classification most likely to be
 * challenged, so the reasoning is recorded: RN 10-06 fn 11 holds that frequent
 * updating does not by itself make a surface interactive, but a post on the X
 * timeline sits inside the interactive forum and invites real-time third-party
 * response. A pinned post is static because it "remains posted until it is
 * changed", which is RN 10-06's own words.
 */
export const SURFACE_CLASS: Record<ContentSurface, SurfaceClass> = {
  bio: 'static',
  pinned_post: 'static',
  profile: 'static',
  campaign_landing_copy: 'static',
  reply: 'interactive',
  quote_post: 'interactive',
  original_post: 'interactive',
  thread_in_progress: 'interactive',
};

/**
 * Which regime a surface class attracts.
 *
 * `risk_based_review_plus_retention` is not a weaker duty, it is a DIFFERENT one.
 * FINRA 2210(b)(3) spells out what substitutes for pre-use review: education,
 * documentation of that education, and "surveillance and follow-up to ensure that
 * such procedures are implemented and adhered to", with evidence retained and
 * producible. Which yields the transferable design idea: a desk that cannot review
 * everything must be able to prove its sampling was principled — so the artefact of
 * compliance is a `ReviewSamplingRecord`, generated by the tool, not a memo written
 * in January about what someone did last June.
 */
export type ApprovalRegime =
  | 'pre_approval_required'
  | 'risk_based_review_plus_retention';

export const SURFACE_APPROVAL_REGIME: Record<SurfaceClass, ApprovalRegime> = {
  static: 'pre_approval_required',
  interactive: 'risk_based_review_plus_retention',
};

/**
 * The sampling record for the interactive regime. Named fields, not a vibe: without
 * `selectionBasis` and `population` a sample rate is unfalsifiable.
 */
export interface ReviewSamplingRecord {
  readonly periodFrom: Instant;
  readonly periodTo: Instant;
  /** How the population was defined — the denominator OF OUR OWN QUEUE, which we do have. */
  readonly population: string;
  readonly populationCount: number;
  readonly reviewedCount: number;
  /** Risk strata the sample deliberately over-weighted. */
  readonly riskStrata: readonly string[];
  /** How items were chosen. Must be reproducible; a seed or an explicit rule, never "spot checks". */
  readonly selectionBasis: string;
  readonly reviewer: ActorId;
  readonly findings: readonly string[];
  readonly escalations: readonly string[];
}

/* ════════ §4 TRIAGE — THE RESIST 2 TAXONOMY ════════ */

/**
 * A graded judgement. Confidence is per-PROPOSITION, not per-item.
 *
 * RESIST 2 (UK Government Communication Service, Cabinet Office, 2021): "you may
 * have high confidence that a piece of social media content is disinformation, but
 * low confidence in who is ultimately behind it and why". An item therefore holds
 * several independently graded judgements, and collapsing them into one number is
 * the mistake the toolkit exists to prevent.
 *
 * `basis` is required. A grade with no basis is a feeling with a letter on it.
 */
export interface Graded<T> {
  readonly value: T;
  readonly confidence: Confidence;
  readonly basis: string;
}

/**
 * RESIST 2's confidence yardstick, verbatim definitions in `CONFIDENCE_DEFINITION`.
 * Kept as the single-letter form the toolkit prescribes ("place a letter in
 * parentheses at the end of a proposition") rather than renamed to
 * low/medium/high, so a rendered assessment reads the way the doctrine reads.
 *
 * Distinct from `estimative.ts`'s `ConfidenceLevel` ('low'|'moderate'|'high'), which
 * is ICD-203 analytic confidence over a probability estimate. Different construct,
 * deliberately not merged.
 */
export type Confidence = 'L' | 'M' | 'H';

export const CONFIDENCE_DEFINITION: Record<Confidence, string> = {
  H: 'High confidence: the evidence currently available is sufficient to reach a reasonable conclusion.',
  M: 'Medium confidence: it is possible to reach a reasonable conclusion based on the available evidence, but additional evidence could easily sway that conclusion.',
  L: 'Low confidence: there is some relevant evidence, but it is taken in isolation or without corroboration.',
};

/**
 * THE OPINION GATE — the first discriminator, and the one that empties the queue.
 *
 * RESIST 2: "Is the message an opinion? Opinions are usually subjective, which means
 * that they cannot be verifiably false. If the message is simply a statement of
 * opinion, you should not treat it as disinformation. However, if the opinion is
 * based on verifiably false, deceptive, or manipulated information that has the
 * potential to cause harm, it may be worth investigating further."
 *
 * Only `verifiable_factual` and `opinion_resting_on_false_fact` are eligible for a
 * correction path. `opinion` routes to ignore-or-engage-on-merits and NEVER to
 * "debunk" — the desk is not the arbiter of public debate.
 */
export type Verifiability =
  | 'verifiable_factual'
  | 'opinion'
  | 'opinion_resting_on_false_fact';

/**
 * FIRST — RESIST 2's five recognition indicators. Sparse: most items fire none.
 *
 * For a crypto venue the two that fire constantly are `identity` (fake support
 * handles, fake "LCX Airdrop" accounts) and `symbolism` (misuse of on-chain
 * statistics). `identity` is also the one case where the correct action is not a
 * reply at all but a platform report plus an owned-channel warning — see
 * `ResponseAction`.
 */
export type FirstIndicator =
  | 'fabrication'
  | 'identity'
  | 'rhetoric'
  | 'symbolism'
  | 'technology';

/** RESIST 2's own question for each indicator, verbatim. */
export const FIRST_INDICATOR_QUESTION: Record<FirstIndicator, string> = {
  fabrication:
    'Is there any manipulated content? For example, a forged document, manipulated image, or deliberately twisted citation.',
  identity:
    "Does anything point to a disguised or misleading source, or false claims about someone else's identity? For example, a fake social media account, claiming that a person or organisation is something they are not, or behaviour that doesn't match the way the account presents itself.",
  rhetoric:
    'Is there use of an aggravating tone or false arguments? E.g., trolling, whataboutism, strawman, social proof, and ad hominem argumentation.',
  symbolism:
    'Are data, issues or events exploited to achieve an unrelated communicative goal? E.g. historical examples taken out of context, unconnected facts used to justify conspiracy theories, misuse of statistics, or conclusions that are far removed from what data reasonably supports.',
  technology:
    'Do the communicative techniques exploit technology in order to trick or mislead? E.g. off-platform coordination, bots amplifying messages, or machine-generated text, audio and visual content.',
};

/**
 * THE REACH LADDER — five ordered levels.
 *
 * RESIST 2 asks the analyst to ESTIMATE this ("Is it likely to disappear within a
 * few hours or does it have the potential to become tomorrow's headlines?"). It is
 * therefore a JUDGEMENT, not a metric — which is exactly what makes it usable with
 * no API, and exactly why it must be carried as `Graded<ReachLevel>` with a human's
 * basis string rather than as a computed number. Anything that computes this from
 * observed data is inventing a denominator that does not exist (§8).
 */
export type ReachLevel =
  | 'little_interest'
  | 'filter_bubble'
  | 'trending'
  | 'minor_story'
  | 'headline_story';

/** Ordinal rank, so escalation between levels is comparable. */
export const REACH_RANK: Record<ReachLevel, 1 | 2 | 3 | 4 | 5> = {
  little_interest: 1,
  filter_bubble: 2,
  trending: 3,
  minor_story: 4,
  headline_story: 5,
};

/** RESIST 2's level descriptions, verbatim. */
export const REACH_LEVEL_DESCRIPTION: Record<ReachLevel, string> = {
  little_interest: 'Little interest: very limited circulation and engagement',
  filter_bubble:
    'Filter bubble: some engagement within niche audiences with similar worldview / automated circulation',
  trending: 'Trending: some discussion online, may include open debate and rebuttals',
  minor_story: 'Minor story: some reporting on mainstream media',
  headline_story: 'Headline story: affecting day-to-day operations',
};

/**
 * A reach estimate plus where it came from, because ESCALATION BETWEEN LEVELS is the
 * real trigger, not the level itself.
 */
export interface ReachAssessment {
  readonly current: Graded<ReachLevel>;
  readonly previous: Graded<ReachLevel> | null;
  readonly previousAt: Instant | null;
}

/**
 * THREE PRIORITY TIERS. Read `PRIORITY_MEANING.low` before building any UI on this.
 *
 * RESIST 2's framing, which is the most important sentence in the toolkit for this
 * compartment: "Keep your assessment outcome-focused... The role of government is
 * not to respond to every piece of false or misleading information. You should not
 * take on the role of arbiter of truth or moderator of public debate."
 */
export type PriorityTier = 'high' | 'medium' | 'low';

export const PRIORITY_MEANING: Record<PriorityTier, string> = {
  high:
    'Significant risk and a high likelihood of making headlines; much of the evidence is high confidence. Requires immediate attention and escalation.',
  medium:
    'Negative effect on reputation or a large stakeholder group, and trending online. The evidence indicates potential for harm if left unchallenged. It requires a response.',
  low:
    'Potential to affect the climate of debate, with limited circulation and mixed-quality evidence. Insight and press lines are prepared, but no response is made for the time being; the area is monitored and baseline analysis is used to spot sudden changes.',
};

/**
 * The triage state machine.
 *
 * `monitoring_with_line_prepared` is the point of the whole taxonomy and is NOT
 * `dismissed`. RESIST 2's worked low-priority example ends: "Insight and press lines
 * are prepared, but no response is made for the time being." That is a real state
 * with real work in it, and it is where most items should terminate. The artefact of
 * triage is a prepared, cleared line that was not used — which is also CDC CERC's
 * preclearance prescription, and it is what makes the next crisis survivable.
 *
 * Note the absent transition: there is NO edge from `received` to `drafting`. The
 * compartment as it stands today is effectively `received → draft` (queue a reply,
 * AI-draft it, approve). That missing screening step is the gap this vocabulary
 * exists to close.
 */
export type TriageState =
  | 'received'
  | 'screened'
  | 'assessed'
  | 'decided'
  | 'out_of_scope'
  | 'ignored_with_rationale'
  | 'monitoring_with_line_prepared'
  | 'drafting'
  | 'escalated'
  | 'closed';

/**
 * The impact matrix rows, translated to what they mean for a venue. Sparse — most
 * rows are empty on most items, and a matrix rendered as fully populated is a lie.
 */
export type ImpactRow =
  | 'ability_to_deliver_services'   // can clients trade/withdraw, and do they believe they can
  | 'reputation'
  | 'individual_staff_safety'       // doxxing of employees; a real escalation trigger in crypto
  | 'key_stakeholders'              // FMA, banking partners, listing partners, market makers
  | 'key_audiences'
  | 'niche_audiences'
  | 'vulnerable_audiences'          // retail holders in a depeg or a delisting
  | 'market_integrity'              // added: Art 92 detection duty has no RESIST analogue
  | 'climate_of_debate';

export type ImpactSeverity = 'none' | 'low' | 'medium' | 'high';

/**
 * Rhetorical devices, counted per counterparty over time rather than per message.
 *
 * RESIST 2: "If somebody repeatedly uses these techniques in their online
 * engagements, they are likely not interested in correcting false or misleading
 * information." So troll-ness is a rate property of an account, derived from the
 * desk's OWN accumulated triage history — which needs no credential, because these
 * accounts arrived in our own notifications.
 */
export type RhetoricalDevice =
  | 'trolling'
  | 'whataboutism'
  | 'strawman'
  | 'social_proof'
  | 'ad_hominem'
  | 'claims_of_no_evidence';

/**
 * Attribution — naming who is behind something.
 *
 * RESIST 2: "there needs to be collective agreement before any attribution is
 * made." So this is WRITE-GATED on at least `ATTRIBUTION_MIN_CONCURRING` named
 * humans. In a one- or two-person workspace that makes it effectively unsettable,
 * and THAT IS THE CORRECT ANSWER: the instrument should say it cannot attribute
 * rather than let a single operator label an account as a coordinated adversary.
 * See `FOUR_EYES_UNACHIEVABLE` for the same honesty applied to clearance.
 */
export const ATTRIBUTION_MIN_CONCURRING = 2;

export interface AttributionAssertion {
  readonly actorDescription: string;
  readonly concurringBy: readonly ActorId[];
  readonly assertedAt: Instant;
  readonly confidence: Confidence;
  readonly basis: string;
}

/** The full assessment of one inbound item. Every field independently graded. */
export interface TriageAssessment {
  readonly verifiability: Verifiability;
  readonly isFalse: Graded<boolean>;
  readonly actorIntent: Graded<'deceive' | 'mistaken' | 'unknown'>;
  readonly coordination: Graded<boolean>;
  readonly indicators: readonly FirstIndicator[];
  readonly reach: ReachAssessment;
  readonly impacts: Partial<Record<ImpactRow, Graded<ImpactSeverity>>>;
  readonly priority: PriorityTier;
  /** Absent unless at least ATTRIBUTION_MIN_CONCURRING humans concurred. */
  readonly attribution: AttributionAssertion | null;
  readonly assessedBy: ActorId;
  readonly assessedAt: Instant;
}

/**
 * THE CLOSED RESPONSE SET. Nine options, and "reply publicly" is ONE of nine — a
 * surface that privileges it is making the decision for the desk.
 *
 * `ignore` carries a REQUIRED rationale. That is the cheapest integrity win
 * available in the whole compartment: it converts silence from absence-of-evidence
 * into evidence, and it is what makes a silence log possible at all.
 */
export type ResponseAction =
  | { readonly kind: 'ignore'; readonly rationale: string }
  | { readonly kind: 'monitor'; readonly baselineRef: string; readonly reviewAt: Instant }
  | { readonly kind: 'prepare_line_hold'; readonly approvedLanguageId: string }
  | { readonly kind: 'reply_public'; readonly draftId: string }
  | { readonly kind: 'owned_channel_statement'; readonly statementId: string }
  | { readonly kind: 'direct_contact_author'; readonly rationale: string }
  | {
      readonly kind: 'platform_report';
      readonly reportType: 'impersonation' | 'fraud' | 'harassment';
    }
  | {
      readonly kind: 'escalate_internal';
      readonly to: readonly ClearanceRole[];
      readonly severity: ImpactSeverity;
    }
  | {
      readonly kind: 'escalate_market_abuse';
      readonly authority: string;
      readonly basis: string;
    };

/**
 * The debunk template, structural rather than free text.
 *
 * RESIST 2's message structure, verbatim: "Fact: lead with the truth / Myth: point
 * to false information / Explain fallacy: why is it false? / Fact: state the truth
 * again". Four required fields, rendered in that order.
 *
 * Collision to handle rather than trip over: `mythRestated` REPUBLISHES the claim.
 * If the myth is price-relevant, Art 91(2)(c) applies to our restatement of it on an
 * "ought to have known" standard, so the rebuttal must be verified before the
 * amplification happens, not after.
 */
export interface Debunk {
  readonly factLead: string;
  readonly mythRestated: string;
  readonly fallacy: string;
  readonly factRepeat: string;
}

/* ════════ §5 REFUSAL AS A FIRST-CLASS TYPE ════════ */

/**
 * The instruments this compartment cites. Keys are stable; the titles and URLs make
 * a citation checkable instead of merely confident.
 *
 * `finra_2210`, `finra_rn_10_06` and `finra_rn_17_18` are cited as MODELS — they are
 * US broker-dealer rules and do not bind LCX. They are used because they are the
 * sharpest published articulation of adoption/entanglement and of the static vs
 * interactive split, and because MiCA has no analogue. `cerc` and `resist_2` are
 * doctrine, not law. Only the MiCA, UCPD and ESMA rows are binding or
 * supervisory-expectation material for a Liechtenstein CASP.
 */
export const INSTRUMENTS = {
  mica: {
    key: 'mica',
    title: 'Regulation (EU) 2023/1114 (MiCA)',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1114',
    binding: true,
  },
  ucpd: {
    key: 'ucpd',
    title: 'Directive 2005/29/EC (Unfair Commercial Practices), consolidated',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02005L0029-20220528',
    binding: true,
  },
  ucpd_guidance: {
    key: 'ucpd_guidance',
    title: 'Commission Guidance on Directive 2005/29/EC (2021/C 526/01)',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:52021XC1229(05)',
    binding: false,
  },
  esma_halo: {
    key: 'esma_halo',
    title:
      'ESMA35-1872330276-2329 — Statement on avoiding misperceptions: CASPs offering unregulated services',
    url: 'https://www.esma.europa.eu/sites/default/files/2025-07/ESMA35-1872330276-2329_-_MiCA_Statement_Access_to_Unregulated_Activities.pdf',
    binding: false,
  },
  esma_reverse_solicitation: {
    key: 'esma_reverse_solicitation',
    title: 'ESMA35-1872330276-1899 — Final report on Guidelines on reverse solicitation under MiCA',
    url: 'https://www.esma.europa.eu/sites/default/files/2024-12/ESMA35-1872330276-1899_-_Final_report_on_GLs_on_reverse_solicitation_under_MiCA.pdf',
    binding: false,
  },
  finra_2210: {
    key: 'finra_2210',
    title: 'FINRA Rule 2210 — Communications with the Public (model only, not binding on LCX)',
    url: 'https://www.finra.org/rules-guidance/rulebooks/finra-rules/2210',
    binding: false,
  },
  finra_rn_10_06: {
    key: 'finra_rn_10_06',
    title: 'FINRA Regulatory Notice 10-06 — Social Media (model only)',
    url: 'https://www.finra.org/rules-guidance/notices/10-06',
    binding: false,
  },
  finra_rn_17_18: {
    key: 'finra_rn_17_18',
    title: 'FINRA Regulatory Notice 17-18 — Social Media and Digital Communications (model only)',
    url: 'https://www.finra.org/rules-guidance/notices/17-18',
    binding: false,
  },
  cerc: {
    key: 'cerc',
    title: 'CDC Crisis and Emergency Risk Communication manual (doctrine)',
    url: 'https://emergency.cdc.gov/cerc/manual/index.asp',
    binding: false,
  },
  resist_2: {
    key: 'resist_2',
    title: 'UK GCS RESIST 2 Counter-Disinformation Toolkit (doctrine)',
    url: 'https://gcs.civilservice.gov.uk/publications/resist-2-counter-disinformation-toolkit/',
    binding: false,
  },
  desk_policy: {
    key: 'desk_policy',
    title: "LCX marketing desk policy — this compartment's own rules, not law",
    url: null,
    binding: false,
  },
} as const;

export type InstrumentKey = keyof typeof INSTRUMENTS;

/**
 * The rule that caused a refusal. `text` is the provision as read, quoted or closely
 * paraphrased — never invented, and never a summary that softens it.
 */
export interface RuleCitation {
  readonly instrument: InstrumentKey;
  /** e.g. `'Art 91(3)(c)'`, `'Annex I point 11'`, `'2210(b)(1)(A)'`, `'RN 17-18 Q9'`. */
  readonly provision: string;
  readonly text: string;
}

/**
 * How, if at all, a refusal can be cleared.
 *
 * `not_recoverable` is real and load-bearing. An Art 7 marketing communication
 * cannot be edited into a compliant 280-character post, and an item that has become
 * personalised advice cannot be disclaimed into safety — adding "NFA" changes
 * nothing, because the MiCA definition turns on what was done, not on how it was
 * labelled. Offering an edit path there would be a lie shaped like helpfulness.
 */
export type RefusalRecovery =
  | { readonly kind: 'not_recoverable'; readonly why: string }
  /** Change the words. The only case where "just reword it" is honest. */
  | { readonly kind: 'edit_text'; readonly what: string }
  /** A fact the compartment does not hold. Names the missing datum, not a vague "more info". */
  | { readonly kind: 'supply_data'; readonly missing: string; readonly whoCanSupply: string }
  /** A named human with the right authority must act. Never satisfiable by the author. */
  | { readonly kind: 'human_authority'; readonly role: ClearanceRole }
  /** Time or an external event resolves it, e.g. a white paper being published. */
  | { readonly kind: 'wait_until'; readonly condition: string }
  /** The content is fine; the surface is not. e.g. link to a compliant page instead. */
  | { readonly kind: 'different_surface'; readonly suggestion: string };

/**
 * EVERY REFUSAL CODE THE COMPARTMENT CAN EMIT.
 *
 * Stable strings: these end up in audit rows, in refusal-frequency counts (the only
 * honest read on whether the gates are load-bearing or ornamental), and on screen.
 * Renaming one is a breaking change to the record.
 *
 * The strip/refuse split, stated once here because it is doctrine rule 1 and it is
 * the decision the existing `sanitise.ts` gets right for the wrong scope:
 *  - STRIP AND FLAG is correct for links, addresses and foreign handles. A draft
 *    minus its link is still a usable draft, and `sanitise.ts:27-30` is right that
 *    a refusal there would teach the operator the tool is broken.
 *  - REFUSE is the only correct answer for a regulated promise. "LCX will list your
 *    token in Q3" with the date stripped is STILL a listing promise, and now the
 *    operator cannot see what was wrong with it. A regulated promise cannot be
 *    stripped into safety.
 *
 * Absence is never zero (doctrine rule 3): the `*_UNKNOWN`, `*_MISSING` and
 * `*_ABSENT` codes below exist so that missing state produces a visible refusal
 * instead of a confident default.
 */
export type RefusalCode =
  /* ── Art 7 / Art 66 mandatory elements ── */
  | 'ART_7_BOILERPLATE_DOES_NOT_FIT'
  | 'ART_7_2_WHITE_PAPER_NOT_PUBLISHED'
  | 'ART_7_1_C_INCONSISTENT_WITH_WHITE_PAPER'
  | 'ART_7_1_E_STATEMENT_ALTERED'
  | 'ART_66_2_NOT_IDENTIFIED_AS_MARKETING'
  | 'ART_66_2_UNSUBSTANTIATED_SUPERLATIVE'
  | 'ART_66_3_RISK_WARNING_MISSING'
  | 'ART_66_3_WHITE_PAPER_LINK_MISSING'
  | 'ART_4_4_EXEMPTION_DESTROYING_STATEMENT'
  /* ── Title VI market abuse: the invisible axis ── */
  | 'ART_90_ASSET_UNDER_EMBARGO'
  | 'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING'
  | 'ART_91_3_C_UNDISCLOSED_HOLDING'
  | 'ART_91_2_C_RUMOUR_RESTATED'
  | 'EMBARGO_REGISTER_ABSENT'
  | 'HOLDINGS_DECLARATION_MISSING'
  | 'ASSET_STATE_UNKNOWN'
  /* ── Advice and authorisation perimeter ── */
  | 'ART_81_PERSONALISED_RECOMMENDATION'
  | 'AUTHORISED_SERVICE_LIST_ABSENT'
  | 'SERVICE_NOT_AUTHORISED'
  /* ── ESMA halo effect ── */
  | 'ESMA_REGULATORY_STATUS_AS_PROMOTION'
  | 'ESMA_UNREGULATED_PRODUCT_STATUS_MISSING'
  | 'PRODUCT_REGULATORY_STATUS_UNKNOWN'
  /* ── Claim safety: regulated promises. REFUSE, never strip. ── */
  | 'REGULATED_PROMISE_PRICE'
  | 'REGULATED_PROMISE_RETURN'
  | 'REGULATED_PROMISE_LISTING'
  | 'REGULATED_PROMISE_TIMELINE'
  | 'UNCONDITIONAL_FORWARD_COMMITMENT'
  | 'SOLVENCY_ASSERTION_WITHOUT_ATTESTATION'
  | 'SUPPORT_OUTCOME_ASSERTED'
  | 'FAULT_ADMISSION'
  | 'INVENTED_LICENCE_CLAIM'
  /* ── Substantiation ── */
  | 'UNSOURCED_LCX_FACT'
  | 'UNSOURCED_FIGURE'
  | 'QUANTITATIVE_CLAIM_WITHOUT_SOURCE'
  | 'PERFORMANCE_OR_YIELD_WITHOUT_CONDITIONS'
  | 'CLAIM_LIBRARY_COVERAGE_NONE'
  | 'CLAIM_EXPIRED'
  | 'CONTRADICTS_LIVE_CLAIM'
  | 'APPROVED_LANGUAGE_FREE_TEXT_SLOT_FILLED'
  | 'MATERIAL_CHANGE_VOIDS_CLEARANCE'
  /* ── UCPD: paid promotion, partners, giveaways ── */
  | 'UCPD_UNDISCLOSED_PAID_PROMOTION'
  | 'UCPD_DISCLOSURE_BELOW_TRUNCATION_FOLD'
  | 'UCPD_STAFF_POSING_AS_CONSUMER'
  | 'UCPD_FREE_IS_NOT_FREE'
  | 'UCPD_FALSE_URGENCY'
  | 'PARTNER_CONSIDERATION_UNKNOWN'
  | 'PRIZE_DRAW_JURISDICTION_EXCLUSIONS_ABSENT'
  /* ── Adoption: the verb, not the words ── */
  | 'ADOPTION_OF_UNVERIFIED_TARGET'
  | 'ADOPTION_OF_REFUSED_CONTENT'
  /* ──
   * The two approval regimes (§3). These four were `DATA_ABSENT_NOT_ZERO` until the
   * integration pass, and that reuse was a real defect rather than a tidiness one: a
   * refusal-frequency panel that shows one bucket cannot tell "we never recorded who
   * approved the bio" from "the clearance-latency table was empty this week", and those
   * two have different owners and different fixes.
   * ── */
  | 'SPEAKER_CAPACITY_UNKNOWN'
  | 'PRE_APPROVAL_MISSING'
  | 'REVIEW_SAMPLING_RECORD_ABSENT'
  | 'REVIEW_SAMPLING_BASIS_UNFALSIFIABLE'
  /* ── Governance and authorship ── */
  | 'AUTHORED_BY_MODEL_UNEDITED'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'CLEARANCE_VOID_CONTENT_CHANGED'
  | 'FOUR_EYES_UNACHIEVABLE'
  | 'ATTRIBUTION_REQUIRES_CONCURRENCE'
  | 'DESK_SUSPENDED_BY_AUTHORITY'
  | 'DESK_HEIGHTENED_PRECLEARANCE_REQUIRED'
  /* ── Crisis discipline ── */
  | 'NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT'
  | 'NEXT_UPDATE_BY_MISSING'
  | 'STATEMENT_CONTRADICTS_INCIDENT_RECORD'
  | 'OVER_REASSURANCE'
  /* ── Provenance of inbound ── */
  | 'INBOUND_QUARANTINED'
  | 'SENDER_AUTHENTICATION_ABSENT'
  | 'CORROBORATION_ABSENT'
  | 'ID_COLLISION_CONFLICTING_CONTENT'
  /* ── Observation honesty ── */
  | 'METRIC_NOT_OBSERVABLE'
  | 'OBSERVATION_FRAME_MISSING'
  | 'DATA_ABSENT_NOT_ZERO'
  | 'FETCH_OUTCOME_UNKNOWN'
  /* ── Record completeness ── */
  | 'PUBLISHED_TEXT_NOT_PASTED_BACK'
  | 'LENGTH_BUDGET_EXCEEDED'
  | 'RULESET_VERSION_UNKNOWN'
  | 'RETENTION_POLICY_UNRESOLVED'
  /* ──
   * §7 desk mode: the two absences a working-day calculation can hit. Neither is a
   * data-absent tile — an unreadable order date must fail the desk CLOSED, and reusing
   * `DATA_ABSENT_NOT_ZERO` for it put "the suspension might have expired" in the same
   * bucket as "no clearances this week".
   * ── */
  | 'WORKING_DAY_CALENDAR_ABSENT'
  | 'INSTANT_UNPARSEABLE'
  /* ──
   * §1, Art 29(2) / Art 53(2): the redemption-right statement. Mandatory on any ART or
   * EMT marketing communication and, until this pass, unnameable — see
   * `MandatoryElement`.
   * ── */
  | 'ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING'
  /* ──
   * §1, the Art 7(1) elements whose absence had no code and so could not be refused
   * without repurposing a code that meant something else. `ART_7_1_E_STATEMENT_ALTERED`
   * means the mandated words were EDITED; these mean they are not there at all, which
   * is a different finding with a different fix.
   * ── */
  | 'ART_7_1_B_WHITE_PAPER_STATEMENT_MISSING'
  | 'ART_7_1_A_OFFEROR_CONTACT_MISSING'
  | 'ART_7_1_E_STATEMENT_MISSING'
  /* ══════════════════════════════════════════════════════════════════════════
   * TRIAGE (§4, RESIST 2). These 28 were `TRIAGE_ONLY_REFUSAL_CODES` in `triage.ts`
   * — a second, parallel refusal vocabulary, which is the one thing a refusal-code
   * namespace cannot have. `refusalCodeFrequency` enumerates `REFUSAL_CODES` to find
   * the gates that never fired; a code living outside that array is invisible to the
   * only honest read the desk has on whether its gates are load-bearing. Folded in
   * here, unchanged in spelling, so `triage.ts` keeps its citations.
   * ══════════════════════════════════════════════════════════════════════════ */
  /* ── the opinion gate ── */
  | 'RESIST_OPINION_IS_NOT_DISINFORMATION'
  | 'RESIST_DEBUNK_OF_OPINION_REFUSED'
  /* ── graded judgement hygiene ── */
  | 'GRADE_BASIS_MISSING'
  | 'REACH_ESTIMATE_BASIS_MISSING'
  | 'REACH_ESTIMATE_COMPUTED_NOT_JUDGED'
  /* ── priority ── */
  | 'PRIORITY_NOT_SUPPORTED_BY_EVIDENCE'
  | 'PRIORITY_OVERRIDE_UNREASONED'
  | 'PRIORITY_OVERRIDE_UNATTRIBUTED'
  /* ── the state machine ── */
  | 'TRIAGE_TRANSITION_FORBIDDEN'
  | 'TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION'
  /* ── the response set ── */
  | 'IGNORE_WITHOUT_RATIONALE'
  | 'MONITOR_REVIEW_NOT_IN_FUTURE'
  | 'MONITOR_BASELINE_MISSING'
  | 'PREPARED_LINE_MISSING'
  | 'DIRECT_CONTACT_WITHOUT_RATIONALE'
  | 'ESCALATION_WITHOUT_RECIPIENT'
  | 'MARKET_ABUSE_ESCALATION_WITHOUT_BASIS'
  | 'PLATFORM_REPORT_WITHOUT_SIGNAL'
  | 'DEBUNK_STRUCTURE_INCOMPLETE'
  /* ── impersonation and scam reading ── */
  | 'OWNED_HANDLE_ALLOWLIST_ABSENT'
  | 'IMPERSONATION_SIGNAL_NOT_OBSERVABLE'
  | 'IMPERSONATION_PREVALENCE_NOT_OBSERVABLE'
  | 'TEMPLATE_REUSE_CORPUS_ABSENT'
  /* ── counterparty pattern ── */
  | 'RHETORIC_HISTORY_INSUFFICIENT'
  /* ── the clock. Shared with `crisis.ts` on purpose: one desk, one clock. ── */
  | 'TTFS_START_NOT_RECORDED'
  | 'TTFS_BUDGET_ABSENT'
  | 'TTFS_SUPPRESSION_UNREASONED'
  | 'TTFS_SUPPRESSION_UNATTRIBUTED'
  /* ══════════════════════════════════════════════════════════════════════════
   * THE CRISIS ROOM (§9, CDC CERC). These 19 were `CRISIS_ONLY_REFUSAL_CODES` in
   * `crisis.ts` — the third parallel vocabulary, folded in for the same reason as the
   * triage set: a code outside `REFUSAL_CODES` is invisible to the never-fired list, and
   * a crisis gate nobody can see is the worst possible one to lose track of.
   * `TTFS_SUPPRESSION_UNREASONED` appeared in both crisis's and triage's private arrays
   * and is deliberately ONE code here: two rooms suppress the same clock for the same
   * reason and the record counts them together.
   * ══════════════════════════════════════════════════════════════════════════ */
  | 'CERC_KNOWN_EMPTY'
  | 'CERC_NOT_KNOWN_EMPTY'
  | 'CERC_NEXT_UPDATE_NOT_IN_FUTURE'
  | 'CERC_RECOVERY_UNKNOWNS_NOT_CLOSED'
  | 'CERC_WITHHELD_WITHOUT_REASON'
  | 'OVER_REASSURANCE_BASIS_STALE'
  | 'CLEARANCE_BLOCKING_OUTSTANDING'
  | 'CLEARANCE_HEADLINE_TEST_FAILED'
  | 'CLEARANCE_LEGAL_REQUIRED'
  | 'HOLDING_STATEMENT_UNKNOWN'
  | 'HOLDING_STATEMENT_EXPIRED'
  | 'HOLDING_STATEMENT_SUPERSEDED'
  | 'HOLDING_STATEMENT_TYPE_MISMATCH'
  | 'PRECONDITION_NOT_ACKNOWLEDGED'
  | 'AD_HOC_WITHOUT_NAMED_OWNER'
  | 'CONTAGION_PRECLEAR_ABSENT'
  | 'CONTAGION_PRECLEAR_EXPIRED'
  | 'ART_94_CLASSIFICATION_REQUIRES_COUNSEL'
  | 'RETRACTION_WITHOUT_REASON';

/**
 * Every code, as data — so a test can assert the union and this array agree, and so
 * a refusal-frequency panel can enumerate codes that have never fired (a gate that
 * never fires is either perfect or dead, and the desk should be told which it
 * suspects).
 */
export const REFUSAL_CODES: readonly RefusalCode[] = [
  'ART_7_BOILERPLATE_DOES_NOT_FIT',
  'ART_7_2_WHITE_PAPER_NOT_PUBLISHED',
  'ART_7_1_C_INCONSISTENT_WITH_WHITE_PAPER',
  'ART_7_1_E_STATEMENT_ALTERED',
  'ART_66_2_NOT_IDENTIFIED_AS_MARKETING',
  'ART_66_2_UNSUBSTANTIATED_SUPERLATIVE',
  'ART_66_3_RISK_WARNING_MISSING',
  'ART_66_3_WHITE_PAPER_LINK_MISSING',
  'ART_4_4_EXEMPTION_DESTROYING_STATEMENT',
  'ART_90_ASSET_UNDER_EMBARGO',
  'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING',
  'ART_91_3_C_UNDISCLOSED_HOLDING',
  'ART_91_2_C_RUMOUR_RESTATED',
  'EMBARGO_REGISTER_ABSENT',
  'HOLDINGS_DECLARATION_MISSING',
  'ASSET_STATE_UNKNOWN',
  'ART_81_PERSONALISED_RECOMMENDATION',
  'AUTHORISED_SERVICE_LIST_ABSENT',
  'SERVICE_NOT_AUTHORISED',
  'ESMA_REGULATORY_STATUS_AS_PROMOTION',
  'ESMA_UNREGULATED_PRODUCT_STATUS_MISSING',
  'PRODUCT_REGULATORY_STATUS_UNKNOWN',
  'REGULATED_PROMISE_PRICE',
  'REGULATED_PROMISE_RETURN',
  'REGULATED_PROMISE_LISTING',
  'REGULATED_PROMISE_TIMELINE',
  'UNCONDITIONAL_FORWARD_COMMITMENT',
  'SOLVENCY_ASSERTION_WITHOUT_ATTESTATION',
  'SUPPORT_OUTCOME_ASSERTED',
  'FAULT_ADMISSION',
  'INVENTED_LICENCE_CLAIM',
  'UNSOURCED_LCX_FACT',
  'UNSOURCED_FIGURE',
  'QUANTITATIVE_CLAIM_WITHOUT_SOURCE',
  'PERFORMANCE_OR_YIELD_WITHOUT_CONDITIONS',
  'CLAIM_LIBRARY_COVERAGE_NONE',
  'CLAIM_EXPIRED',
  'CONTRADICTS_LIVE_CLAIM',
  'APPROVED_LANGUAGE_FREE_TEXT_SLOT_FILLED',
  'MATERIAL_CHANGE_VOIDS_CLEARANCE',
  'UCPD_UNDISCLOSED_PAID_PROMOTION',
  'UCPD_DISCLOSURE_BELOW_TRUNCATION_FOLD',
  'UCPD_STAFF_POSING_AS_CONSUMER',
  'UCPD_FREE_IS_NOT_FREE',
  'UCPD_FALSE_URGENCY',
  'PARTNER_CONSIDERATION_UNKNOWN',
  'PRIZE_DRAW_JURISDICTION_EXCLUSIONS_ABSENT',
  'ADOPTION_OF_UNVERIFIED_TARGET',
  'ADOPTION_OF_REFUSED_CONTENT',
  'AUTHORED_BY_MODEL_UNEDITED',
  'SELF_APPROVAL_FORBIDDEN',
  'CLEARANCE_VOID_CONTENT_CHANGED',
  'FOUR_EYES_UNACHIEVABLE',
  'ATTRIBUTION_REQUIRES_CONCURRENCE',
  'DESK_SUSPENDED_BY_AUTHORITY',
  'DESK_HEIGHTENED_PRECLEARANCE_REQUIRED',
  'NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT',
  'NEXT_UPDATE_BY_MISSING',
  'STATEMENT_CONTRADICTS_INCIDENT_RECORD',
  'OVER_REASSURANCE',
  'INBOUND_QUARANTINED',
  'SENDER_AUTHENTICATION_ABSENT',
  'CORROBORATION_ABSENT',
  'ID_COLLISION_CONFLICTING_CONTENT',
  'METRIC_NOT_OBSERVABLE',
  'OBSERVATION_FRAME_MISSING',
  'DATA_ABSENT_NOT_ZERO',
  'FETCH_OUTCOME_UNKNOWN',
  'PUBLISHED_TEXT_NOT_PASTED_BACK',
  'LENGTH_BUDGET_EXCEEDED',
  'RULESET_VERSION_UNKNOWN',
  'RETENTION_POLICY_UNRESOLVED',
  'SPEAKER_CAPACITY_UNKNOWN',
  'PRE_APPROVAL_MISSING',
  'REVIEW_SAMPLING_RECORD_ABSENT',
  'REVIEW_SAMPLING_BASIS_UNFALSIFIABLE',
  'WORKING_DAY_CALENDAR_ABSENT',
  'INSTANT_UNPARSEABLE',
  'ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING',
  'ART_7_1_B_WHITE_PAPER_STATEMENT_MISSING',
  'ART_7_1_A_OFFEROR_CONTACT_MISSING',
  'ART_7_1_E_STATEMENT_MISSING',
  'RESIST_OPINION_IS_NOT_DISINFORMATION',
  'RESIST_DEBUNK_OF_OPINION_REFUSED',
  'GRADE_BASIS_MISSING',
  'REACH_ESTIMATE_BASIS_MISSING',
  'REACH_ESTIMATE_COMPUTED_NOT_JUDGED',
  'PRIORITY_NOT_SUPPORTED_BY_EVIDENCE',
  'PRIORITY_OVERRIDE_UNREASONED',
  'PRIORITY_OVERRIDE_UNATTRIBUTED',
  'TRIAGE_TRANSITION_FORBIDDEN',
  'TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION',
  'IGNORE_WITHOUT_RATIONALE',
  'MONITOR_REVIEW_NOT_IN_FUTURE',
  'MONITOR_BASELINE_MISSING',
  'PREPARED_LINE_MISSING',
  'DIRECT_CONTACT_WITHOUT_RATIONALE',
  'ESCALATION_WITHOUT_RECIPIENT',
  'MARKET_ABUSE_ESCALATION_WITHOUT_BASIS',
  'PLATFORM_REPORT_WITHOUT_SIGNAL',
  'DEBUNK_STRUCTURE_INCOMPLETE',
  'OWNED_HANDLE_ALLOWLIST_ABSENT',
  'IMPERSONATION_SIGNAL_NOT_OBSERVABLE',
  'IMPERSONATION_PREVALENCE_NOT_OBSERVABLE',
  'TEMPLATE_REUSE_CORPUS_ABSENT',
  'RHETORIC_HISTORY_INSUFFICIENT',
  'TTFS_START_NOT_RECORDED',
  'TTFS_BUDGET_ABSENT',
  'TTFS_SUPPRESSION_UNREASONED',
  'TTFS_SUPPRESSION_UNATTRIBUTED',
  'CERC_KNOWN_EMPTY',
  'CERC_NOT_KNOWN_EMPTY',
  'CERC_NEXT_UPDATE_NOT_IN_FUTURE',
  'CERC_RECOVERY_UNKNOWNS_NOT_CLOSED',
  'CERC_WITHHELD_WITHOUT_REASON',
  'OVER_REASSURANCE_BASIS_STALE',
  'CLEARANCE_BLOCKING_OUTSTANDING',
  'CLEARANCE_HEADLINE_TEST_FAILED',
  'CLEARANCE_LEGAL_REQUIRED',
  'HOLDING_STATEMENT_UNKNOWN',
  'HOLDING_STATEMENT_EXPIRED',
  'HOLDING_STATEMENT_SUPERSEDED',
  'HOLDING_STATEMENT_TYPE_MISMATCH',
  'PRECONDITION_NOT_ACKNOWLEDGED',
  'AD_HOC_WITHOUT_NAMED_OWNER',
  'CONTAGION_PRECLEAR_ABSENT',
  'CONTAGION_PRECLEAR_EXPIRED',
  'ART_94_CLASSIFICATION_REQUIRES_COUNSEL',
  'RETRACTION_WITHOUT_REASON',
] as const;

/**
 * A refusal. Four things, all required: a stable machine code, one sentence a human
 * can act on, the rule that caused it, and whether it can be recovered and how.
 *
 * `matched` exists so a refusal is ARGUABLE. A refusal that will not show the span
 * it objected to is an assertion of authority, and an operator will route around it.
 */
export interface Refusal {
  readonly code: RefusalCode;
  /** One sentence, addressed to the operator, in the active voice. No hedging. */
  readonly sentence: string;
  readonly rule: RuleCitation;
  readonly recovery: RefusalRecovery;
  /** The offending span, where there is one. `null` for state-absence refusals. */
  readonly matched: string | null;
  /** Ruleset version that produced this refusal, stamped onto the record. */
  readonly ruleSetVersion: number;
}

/** Strip-and-flag lives here; refuse lives in `Refusal`. Both, never one. */
export type Disposition = 'clear' | 'stripped' | 'flagged' | 'refused';

/**
 * A non-refusing finding. Extends the shape of `claims/messageRules.ts`'s
 * `RuleViolation` (`{rule, severity, message}`) so the two vocabularies compose, and
 * adds the three fields that make a finding useful on screen: the rule text
 * verbatim, the matched span, and what to write instead.
 */
export interface MarketingViolation {
  /** Dotted rule id, e.g. `'regulated_promise.price'`. */
  readonly rule: string;
  readonly severity: 'error' | 'warning';
  readonly rule_citation: RuleCitation;
  readonly matched: string;
  readonly remedy: string;
  readonly ruleVersion: number;
}

/**
 * The verdict every draft carries. A verdict, not a boolean.
 *
 * `clear` MEANS "matched no rule I hold" — a statement about the rulebook, not about
 * the sentence. `coverage` exists because a gate with an empty rulebook that returns
 * `clear` is worse than no gate: it manufactures confidence. When the claim library
 * holds nothing for the topic, the verdict must say so on screen.
 */
export interface GateVerdict {
  readonly disposition: Disposition;
  readonly refusals: readonly Refusal[];
  readonly violations: readonly MarketingViolation[];
  /** Claim ids actually cited by the draft. Resolve via `getClaimById` — an id that
   * resolves to nothing is `UNSOURCED_LCX_FACT`, not a plausible id. */
  readonly claimIdsCited: readonly string[];
  /** Whether the library holds any active claim for the topic this item is about. */
  readonly coverage: 'covered' | 'partial' | 'none';
  readonly ruleSetVersion: number;
}

/**
 * The honesty device, copied deliberately from the GPS compartment's disclosure
 * pattern: state the limit of the instrument in code, and badge every surface that
 * renders a verdict with it.
 *
 * A `clear` verdict does not mean the item is compliant, legally reviewed or
 * approved. These rules were written from primary legal text by an engineer, not by
 * counsel, and the gaps are known and named (LCX's authorised-service list, the
 * Art 68(10)(b) records RTS, UK financial promotions, national gambling law).
 */
export const MARKETING_RULES_ARE_NOT_COUNSEL_REVIEWED = true;

export const MARKETING_RULES_DISCLOSURE =
  'These rules were derived from primary legal text, not from legal advice, and they have not been reviewed by counsel. A clear verdict means the draft matched no rule this instrument holds — it is not a statement that the draft is compliant.';

/* ════════ §6 PROVENANCE ON INBOUND — GRADED, OR QUARANTINED ════════ */

/**
 * Where an inbound item came from.
 *
 * `SourceKind` in `../provenance.js` already contains `'social'`, but the `SOURCES`
 * registry has no social entry, so `getSource('x')` returns the F-reliability stub.
 * These are the marketing-owned channels; grading is per-channel, following the
 * precedent of `newsReliability()` which grades per-outlet rather than per-kind.
 *
 *  - `x_notification_email`  the forwarded notification mailbox. The only inbound
 *                            path today, and the one with the forgery problem: the
 *                            fetch has no sender filter and the parsed shape has no
 *                            `from` field at all, so anyone who learns the mailbox
 *                            address can inject an attacker-chosen handle, comment
 *                            id, display name and body.
 *  - `operator_paste`        a human pasting a URL and text. First-class, not a
 *                            fallback: RESIST expects situational insight to be
 *                            produced by judgement, and this is how it arrives.
 *  - `oembed`                `publish.twitter.com/oembed` — official, documented,
 *                            keyless. Returns author name, post text, language and
 *                            the TRUE post date. It is an INDEPENDENT channel, which
 *                            is what makes it the anti-forgery corroborator.
 *  - `syndication_embed`     `cdn.syndication.twimg.com/tweet-result` — X's own embed
 *                            backend, UNDOCUMENTED. Off by default, graded low,
 *                            per-post pull only. Its ToS standing is a judgement
 *                            call, not a technical one, and this compartment does
 *                            not pretend otherwise.
 *  - `mirror_discovery`      public Nitter-class mirrors. DISCOVERY ONLY. A mirror is
 *                            a third party that would control what LCX's instrument
 *                            believes LCX said, so an id may come from here and text
 *                            may never be stored from here — it must be corroborated
 *                            through `oembed` first.
 *  - `regulator_feed`        ESMA RSS; the FMA typed sitemaps including
 *                            `sitemap.warning_entry.xml`, which carries investor
 *                            warning entries. FMA publishes no RSS at all.
 *  - `news_feed`             the existing keyless `market_news` spine.
 *  - `first_party_site`      lcx.com and its `llms.txt`, which is a grounding corpus
 *                            stronger than any prompt instruction.
 */
export type InboundSourceKind =
  | 'x_notification_email'
  | 'operator_paste'
  /**
   * NOT INBOUND AT ALL — the desk's own record, added because `ObservationFrame.source`
   * is typed on this union and the process metrics measure the desk rather than the
   * market. Before it existed, `observation.ts:298 ownCorpusFrame` had to label a census
   * of our own decisions `operator_paste`, which reads on a panel as "a human typed this
   * in" and understates how complete the population is. Reliability is 'A': it is the
   * only source in this union that is not somebody else's claim about the world.
   */
  | 'own_record'
  | 'oembed'
  | 'syndication_embed'
  | 'mirror_discovery'
  | 'regulator_feed'
  | 'news_feed'
  | 'first_party_site';

/**
 * Default Admiralty reliability per channel, reusing `Reliability` from
 * `../provenance.js`.
 *
 * `oembed` is 'A' because it is first-party and official. `x_notification_email` is
 * 'C' — but only ONCE SENDER AUTHENTICATION HAS SURVIVED; an unauthenticated email
 * is not a C-grade source, it is quarantined and carries no grade at all (see
 * `InboundProvenance`). `mirror_discovery` is 'E' and may only ever contribute an id.
 */
export const INBOUND_SOURCE_RELIABILITY: Record<InboundSourceKind, Reliability> = {
  own_record: 'A',
  oembed: 'A',
  first_party_site: 'A',
  regulator_feed: 'A',
  operator_paste: 'B',
  x_notification_email: 'C',
  news_feed: 'C',
  syndication_embed: 'D',
  mirror_discovery: 'E',
};

/**
 * Evidence that a notification email really came from X.
 *
 * A naive `From:` header check is useless: forwarding breaks SPF, and the display
 * name is attacker-controlled. What can survive a forward is X's own DKIM signature
 * (`d=`) or an ARC chain added by the forwarding hop. So authentication rests on
 * those, and their absence is `quarantined`, not a lower grade.
 */
export interface SenderAuthentication {
  /** DKIM signing domains recovered from the message, in order of appearance. */
  readonly dkimDomains: readonly string[];
  /** Whether a DKIM `d=` matched an expected X signing domain. */
  readonly dkimMatchedExpected: boolean;
  /** Whether an ARC chain was present and internally consistent. */
  readonly arcChainPresent: boolean;
  /**
   * SPF result, recorded but NOT relied on. Kept because its absence after a
   * forward is expected and someone will otherwise read the gap as a failure.
   */
  readonly spfResult: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'unknown';
}

/** Which field a second channel agreed or disagreed about. */
export type CorroboratedField =
  | 'author_handle'
  | 'author_display'
  | 'post_text'
  | 'posted_at'
  | 'post_id'
  | 'language';

/**
 * One independent channel's confirmation.
 *
 * `disagrees` being non-empty is the interesting case, and it must not be averaged
 * away: if the email says handle X and oEmbed says handle Y for the same post id,
 * something is wrong and the item belongs in quarantine, not at a slightly lower
 * confidence.
 */
export interface Corroboration {
  readonly channel: InboundSourceKind;
  readonly agrees: readonly CorroboratedField[];
  readonly disagrees: readonly CorroboratedField[];
  readonly observedAt: Instant;
  /** What was actually fetched, so the corroboration is re-checkable. */
  readonly evidence: string | null;
}

/**
 * Why an item is in quarantine. Each is a distinct fact and they do not collapse.
 *
 * `id_collision_conflicting_content` matters more than it looks: ids are
 * attacker-chosen and the current ingest resolves collisions with
 * `ON CONFLICT DO NOTHING` while reporting them as "duplicates". Claim a real
 * reply's id first and the genuine one is discarded forever, silently. A collision
 * where the CONTENT differs must raise, not discard.
 */
export type QuarantineReason =
  | 'sender_authentication_absent'
  | 'sender_authentication_failed'
  | 'no_independent_corroboration'
  | 'corroboration_disagreed'
  | 'id_collision_conflicting_content'
  | 'parse_failed'
  | 'discovery_only_source';

/**
 * Inbound provenance. QUARANTINED IS A DISTINCT STATE, NOT A LOW GRADE.
 *
 * This is the shape that fixes the live defect: today a fabricated email is graded
 * `C3` "fairly reliable" identically to a real one, because grading happens by
 * source kind and nothing authenticates the sender. Making `quarantined` a variant
 * with NO `reliability` and NO `credibility` field means a caller cannot read a grade
 * off an unverified item even by accident — there is nothing there to read.
 *
 * Corroborate before believing (doctrine rule 6): an uncorroborated item is
 * quarantined at a distinct state rather than promoted.
 */
export type InboundProvenance =
  | {
      readonly state: 'quarantined';
      readonly reasons: readonly QuarantineReason[];
      readonly channel: InboundSourceKind;
      readonly senderAuth: SenderAuthentication | null;
      readonly collectedAt: Instant;
      /** What it would take to promote this out of quarantine. */
      readonly promotionRequires: string;
    }
  | {
      readonly state: 'graded';
      readonly channel: InboundSourceKind;
      readonly reliability: Reliability;
      readonly credibility: Credibility;
      /** `admiraltyCode(reliability, credibility)` — stored so the record is readable. */
      readonly admiralty: string;
      readonly senderAuth: SenderAuthentication | null;
      /** At least one entry, or this should have been `quarantined`. */
      readonly corroboration: readonly Corroboration[];
      readonly observedAt: Instant;
      readonly collectedAt: Instant;
    };

/**
 * Half-life to pass to `confidenceFrom()` for social items.
 *
 * `provenance.ts` defaults to 30 days, which is wrong here: a three-day-old reply is
 * operationally cold, yet at a 30-day half-life a three-day-old C3 item still scores
 * 56. Three days makes the decay match how quickly a social item stops being
 * actionable. Passed explicitly at every call site — the default is not overridden
 * globally, because other compartments legitimately want 30.
 */
export const SOCIAL_CONFIDENCE_HALF_LIFE_DAYS = 3;

/* ════════ §7 DESK MODE ════════ */

/**
 * The desk's operating mode, workspace-level and orthogonal to everything else.
 *
 * `suspended_by_authority` exists because MiCA Art 94 gives competent authorities
 * the power to suspend or prohibit marketing communications where there are
 * reasonable grounds for suspecting an infringement, and specifically to require a
 * CASP "to cease or suspend marketing communications for a maximum of 30 consecutive
 * working days on any single occasion". Art 7(3)-(4) means the order can come from a
 * HOST-state authority — LCX could learn about a problem from BaFin or CONSOB before
 * hearing from the FMA — so `authority` is a free string, not an enum of one.
 *
 * Behaviour the type is designed to force: in `suspended_by_authority` the desk MUST
 * still be able to draft, assess and log, because the record is what the supervisor
 * will ask for. What is disabled is every publish-adjacent affordance — handoff,
 * copy-out, export-for-posting — and the reason is displayed rather than hidden
 * behind a disabled button.
 *
 * `heightened` mirrors the same idea imposed internally (and FINRA 2210(c)(1)(B) is
 * the external precedent for a regulator forcing pre-clearance on a firm that has
 * departed from the standards). It is a MODE with an effective date and an expiry,
 * never a per-item checkbox.
 *
 * WHY `expiresAt` ON A SUSPENSION IS NULLABLE. The first version of this type made it
 * non-null, on the strength of the 30-working-day ceiling. That was wrong, and
 * `deskMode.ts:84` found it against the primary text: Art 94(1) holds TWO powers, and
 * only (q) — "cease or suspend marketing communications for a maximum of 30 consecutive
 * working days" — carries the ceiling. (p) is "prohibit or suspend the marketing", with
 * NO time limit and no requirement that it ever end. A non-null `expiresAt` made an
 * indefinite (p) prohibition inexpressible, which means the desk would have had to
 * invent an end date for an order that has none — the instrument granting itself relief
 * by typing. `null` therefore means UNBOUNDED, and `deskMode.ts:998 standingFromOrder`
 * reads it as `phase: 'unbounded'`. It never means "we did not write the date down":
 * that is `WORKING_DAY_CALENDAR_ABSENT` or `INSTANT_UNPARSEABLE`, and both refuse.
 * `suspensionPower` records which limb the order came from, so the ceiling is only
 * checked where the statute imposes one.
 */
export type DeskMode =
  | { readonly kind: 'normal' }
  | {
      readonly kind: 'heightened';
      readonly reason: string;
      readonly imposedBy: ActorId;
      readonly effectiveFrom: Instant;
      readonly expiresAt: Instant | null;
    }
  | {
      readonly kind: 'suspended_by_authority';
      /** The competent authority that issued it, home or host. */
      readonly authority: string;
      readonly orderRef: string;
      readonly effectiveFrom: Instant;
      /**
       * Art 94(1)(q): at most ART_94_MAX_SUSPENSION_WORKING_DAYS WORKING days per
       * occasion. `null` is an Art 94(1)(p) prohibition, which has no statutory end —
       * see the docblock above. Never null for want of a recorded date.
       */
      readonly expiresAt: Instant | null;
      /**
       * Which limb of Art 94(1) the order rests on. Only `cease_or_suspend_30_days`
       * has a ceiling to check; `prohibit_or_suspend` does not, and a validator that
       * applied the ceiling to it would silently expire a live prohibition.
       */
      readonly suspensionPower: 'cease_or_suspend_30_days' | 'prohibit_or_suspend';
      readonly recordedBy: ActorId;
    };

/**
 * MiCA Art 94: a suspension of marketing communications may run for a maximum of 30
 * consecutive WORKING days on any single occasion. Working days, not calendar days —
 * so a validator must not compute the ceiling by adding 30 to a date.
 */
export const ART_94_MAX_SUSPENSION_WORKING_DAYS = 30;

/* ════════ §8 OBSERVATION FRAME AND THE HONESTY CEILING ════════ */

/**
 * WHAT A WINDOW COULD AND COULD NOT SEE. Every figure this compartment renders is
 * accompanied by one of these. If a figure has no frame, it does not render — the
 * same discipline as a quantitative claim with no source reference.
 *
 * The reason is arithmetic, not modesty. Share of voice is a ratio whose denominator
 * is "all items covering the issue". With no API credential and no listening
 * licence, the observable population is "items that mentioned, replied to or quoted
 * us AND triggered a notification email AND survived the forwarding rule". That is
 * not a sample of the discourse; it is a census of one edge type in a graph centred
 * on ourselves, further filtered by whatever the platform decided to send. A ratio
 * computed over it trivially approaches 1 and means nothing.
 *
 * `completeness` has no 'complete' value for social sources on purpose.
 */
export interface ObservationFrame {
  readonly source: InboundSourceKind;
  /** Plain-language: what this window DID capture. */
  readonly captures: string;
  /** The named absences. Non-empty for every social source. */
  readonly doesNotCapture: readonly string[];
  /** Known biases, e.g. controversy-weighted delivery, platform-side filtering. */
  readonly knownBiases: readonly string[];
  readonly completeness:
    | 'unknown_no_denominator'   // social: there is no population to divide by
    | 'census_of_own_corpus'     // our own drafts/decisions: we hold all of them
    | 'complete_first_party';    // a file we fetched from our own site
  readonly windowFrom: Instant;
  readonly windowTo: Instant;
  /**
   * When this channel last succeeded. `null` means never. Shown next to every
   * derived number, because a fall in a line must be readable as a pipeline fault
   * rather than a market signal.
   */
  readonly lastSuccessfulPollAt: Instant | null;
}

/**
 * A fetch resolves to exactly one of three states, and `unknown` must render as
 * unknown.
 *
 * Two failure modes observed in research make this mandatory rather than tidy:
 * a competitor endpoint returned HTTP 202 with ZERO BYTES, and both X syndication
 * timeline endpoints returned HTTP 200 with ZERO BYTES. A fetcher that checks
 * `res.ok` and parses an empty list records "no competitor news today" and "LCX
 * posted nothing" — confident, wrong, and unfalsifiable on screen. Separately, a
 * DNS/RPZ block on the apex domain would have concluded LCX has no blog.
 *
 * So: transport failure is not absence, and a 2xx with no content is not absence.
 */
export type FetchOutcome<T> =
  | { readonly kind: 'data'; readonly value: T; readonly at: Instant }
  | { readonly kind: 'no_data_confirmed'; readonly at: Instant; readonly basis: string }
  | { readonly kind: 'unknown'; readonly at: Instant; readonly reason: string };

/**
 * A number the compartment is willing to show, with its frame — or a refusal.
 *
 * There is deliberately no third variant and no `value: number | null`. Absent data
 * produces a refusal, never a 0 (doctrine rule 3). A zero and an absence look
 * identical on a chart and mean opposite things.
 */
export type Figure<T> =
  | { readonly kind: 'measured'; readonly value: T; readonly frame: ObservationFrame }
  | { readonly kind: 'absent'; readonly refusal: Refusal };

/**
 * A count that is a LOWER BOUND, carrying that fact in its type.
 *
 * Reply counts derived from notification mail are lower bounds: X batches, digests
 * and throttles notifications, and the forwarding rule filters further. So the field
 * is named `repliesObserved`, never `replies`, and the shape says `atLeast` rather
 * than `value`. Naming the type honestly is the cheapest guard against the number
 * being re-presented as a total three screens later.
 */
export interface LowerBound<Metric extends string> {
  readonly kind: 'lower_bound';
  readonly metric: Metric;
  readonly atLeast: number;
  readonly frame: ObservationFrame;
}

/**
 * The counts this compartment can honestly hold about an item.
 *
 * Every field name ends in `Observed` and every value is a `LowerBound`. There is no
 * `repliesTotal`, because we cannot know it. `likesObserved` and
 * `conversationObserved` are absolute counters read from a single per-post lookup at
 * a stated time — never divided by anything, never averaged into a rate.
 *
 * Note the asymmetry, and state it on screen rather than hiding it: likes and reply
 * count are obtainable keyless; reposts, quotes and bookmarks are not. A tile reading
 * "10 likes, 3 replies, — reposts" is more trustworthy than one that quietly omits
 * the row.
 */
export interface ObservedCounts {
  readonly repliesObserved: Figure<LowerBound<'replies'>>;
  readonly likesObserved: Figure<LowerBound<'likes'>>;
  readonly conversationObserved: Figure<LowerBound<'conversation'>>;
}

/* ──── §8.1 The honesty ceiling, as a compile-time ban ──── */

/**
 * Property names this compartment may never carry.
 *
 * These are the seven families the research proved unobtainable without an X
 * credential — impressions, reach, follower delta, engagement rate, click-through,
 * share of voice, audience sentiment — plus their obvious spellings. Reach and share
 * of voice need a denominator that does not exist; notification mail is a
 * controversy-skewed census of one edge type, so an aggregate sentiment number off
 * it is worse than no number.
 *
 * Bare `sentiment` is NOT banned, deliberately: a per-item read of a reply we
 * actually hold is honest when it is labelled with N and carries a frame. What is
 * banned is every aggregate form of it.
 */
export type ForbiddenMetricField =
  | 'impressions' | 'impressionCount' | 'impression_count'
  | 'views' | 'viewCount' | 'view_count'
  | 'reach' | 'reachCount' | 'uniqueReach' | 'unique_reach'
  | 'followers' | 'followerCount' | 'follower_count'
  | 'followerDelta' | 'follower_delta' | 'followerGrowth' | 'follower_growth' | 'newFollowers'
  | 'engagementRate' | 'engagement_rate'
  | 'clickThroughRate' | 'click_through_rate' | 'ctr' | 'clickRate'
  | 'shareOfVoice' | 'share_of_voice' | 'sov'
  | 'audienceSentiment' | 'audience_sentiment'
  | 'sentimentScore' | 'sentiment_score'
  | 'netSentiment' | 'net_sentiment'
  | 'sentimentPct' | 'sentiment_pct'
  | 'bestTimeToPost' | 'audienceDemographics' | 'audienceGeography';

/**
 * Wrap any figure-bearing payload in this and a forbidden field name becomes a
 * COMPILE ERROR rather than a code-review note:
 *
 *   type Panel = HonestFigures<{ repliesObserved: number }>  // → the object type
 *   type Bad   = HonestFigures<{ impressions: number }>      // → never, unassignable
 *
 * What it prevents, precisely: a property whose NAME is in `ForbiddenMetricField`
 * existing on a type that passed through this wrapper. What it does not and cannot
 * prevent: someone computing an engagement rate and calling the field `score`. That
 * failure is caught by review and by the `ObservationFrame` requirement — a figure
 * with no honest frame has nothing to render next to it — not by the compiler. Say
 * so rather than let the guard be mistaken for a proof.
 */
export type HonestFigures<T extends object> =
  [Extract<keyof T, ForbiddenMetricField>] extends [never] ? T : never;

/** The metrics a normal social tool shows on its front page and this one refuses. */
export type RefusedMetricKey =
  | 'impressions'
  | 'reach'
  | 'follower_delta'
  | 'engagement_rate'
  | 'repost_count'
  | 'bookmark_count'
  | 'click_through_rate'
  | 'share_of_voice'
  | 'audience_sentiment'
  | 'mention_volume'
  | 'best_time_to_post'
  | 'audience_demographics'
  | 'high_follower_author_triage'
  | 'competitor_social_performance';

/**
 * The refusal list as data, so a web surface asks "may I show impressions?" and gets
 * a typed no with a reason and a substitute — rendered where the tile would have
 * been. That is the difference between a dashboard that is missing things and an
 * instrument that tells you what it cannot know.
 *
 * `substitute` is empty string where the honest answer is "nothing". Saying nothing
 * is available is a better answer than a proxy nobody can defend.
 */
export const REFUSED_METRICS: Record<
  RefusedMetricKey,
  { readonly reason: string; readonly substitute: string }
> = {
  impressions: {
    reason: 'Only X Analytics holds it, and reading it requires being signed in as the account. Absent from notification mail and from every keyless endpoint.',
    substitute: '',
  },
  reach: {
    reason: 'Derived from impressions, so strictly less available than impressions.',
    substitute: '',
  },
  follower_delta: {
    reason: 'Verified absent keyless: profile oEmbed returns no follower field, and both syndication timeline endpoints return 200 with zero bytes.',
    substitute: 'A dated snapshot an operator typed in, shown as an operator assertion — never charted as a trend from two hand-entered points.',
  },
  engagement_rate: {
    reason: 'It is engagements divided by impressions. The denominator does not exist.',
    substitute: 'Absolute per-post counters from a single lookup, stamped with the fetch time, never divided and never averaged.',
  },
  repost_count: {
    reason: 'Not in notification mail and not in the syndication embed response, checked field by field.',
    substitute: 'Show the row as unavailable rather than omitting it, so the asymmetry with likes is visible.',
  },
  bookmark_count: { reason: 'Not present in any keyless response.', substitute: '' },
  click_through_rate: {
    reason: "Requires X Analytics or a link-shortener stack. LCX's own robots.txt disallows UTM-tagged URLs, so the site treats them as non-canonical.",
    substitute: "Whatever LCX's own web analytics reports, cited as that system's number and not as a marketing-desk figure.",
  },
  share_of_voice: {
    reason: 'A ratio whose denominator is all items covering the issue. We observe only items that mentioned us and reached our inbox, so the ratio approaches 1 by construction.',
    substitute: '',
  },
  audience_sentiment: {
    reason: 'No population sample, and notification volume is controversy-driven, so the observable corpus is systematically negative-skewed.',
    substitute: 'Per-item sentiment on replies we actually hold, labelled as a model read of N items with N shown. Never a percentage, never a trend line.',
  },
  mention_volume: {
    reason: 'Same missing denominator. A fall in mentions is indistinguishable from X changing its notification batching.',
    substitute: 'Replies received — a count of our own ingest — paired with mailbox health and last successful poll time.',
  },
  best_time_to_post: { reason: 'Derived from impressions-by-hour.', substitute: '' },
  audience_demographics: {
    reason: "Requires X Analytics, and accumulating it would breach the compartment's own GDPR posture: no profile enrichment, no follower graph, no cross-post identity building.",
    substitute: '',
  },
  high_follower_author_triage: {
    reason: 'Follower count is unavailable keyless, so this cannot be built and should not be promised.',
    substitute: 'Verification status where a per-post lookup returns it, whether the body names a listing or a ticker, and whether the handle resembles @lcx — which needs no credential at all.',
  },
  competitor_social_performance: {
    reason: 'No competitor engagement data keyless, and competitor newsrooms were themselves unfetchable in research.',
    substitute: 'Competitor ANNOUNCEMENTS via press feeds filtered by name, plus human paste. Publishing activity, not performance.',
  },
};

/* ──── §8.2 What CAN be measured: the desk, not the market ──── */

/**
 * The process metrics. Every one is computable from data the desk owns completely,
 * with no credential and no denominator problem.
 *
 * This list is the answer to "what does a marketing compartment measure when it has
 * no API": it measures the desk. That is less flattering and far more defensible,
 * and it cannot be gamed by an integration outage.
 *
 * `refusal_rate_by_code` is the important one — the only honest read on whether the
 * gates are load-bearing or ornamental.
 */
export type ProcessMetricKey =
  | 'time_to_first_statement'        // against the severity budget
  | 'clearance_latency_by_role'      // which lane is the bottleneck, before a crisis proves it
  | 'precleared_derivation_rate'     // published items derived from cleared language vs improvised
  | 'claim_provenance_rate'          // quantitative claims carrying a source reference
  | 'contradiction_debt'             // live claim pairs overlapping and differing with no supersedes link
  | 'line_staleness'                 // cleared language past review, claims used after validTo
  | 'not_known_non_empty_rate'       // initial-phase statements that admitted uncertainty
  | 'refusal_rate_by_code'
  | 'retraction_count'               // linked corrections, never deletions
  | 'next_update_breach_count'
  | 'ignore_with_rationale_rate'     // integrity of the triage record
  | 'question_coverage';             // anticipated questions with a live cleared line

export const PROCESS_METRIC_KEYS: readonly ProcessMetricKey[] = [
  'time_to_first_statement',
  'clearance_latency_by_role',
  'precleared_derivation_rate',
  'claim_provenance_rate',
  'contradiction_debt',
  'line_staleness',
  'not_known_non_empty_rate',
  'refusal_rate_by_code',
  'retraction_count',
  'next_update_breach_count',
  'ignore_with_rationale_rate',
  'question_coverage',
] as const;

/* ════════ §9 CLEARANCE, AUTHORSHIP, HANDOFF ════════ */

/**
 * The clearance lanes.
 *
 * CDC CERC names three reviewers and this compartment keeps them: "Have three people
 * clear a document before it's released — the communication director responsible for
 * your organization's reputation; the policy director who is responsible for ensuring
 * that the information does not counter organization policy; a subject matter expert
 * (SME) who is both fast and knowledgeable". CERC also says to "keep the legal
 * department out of the clearance process unless the subject has specific legal
 * implications" — hence `legal` is added as blocking only when the item is flagged as
 * having legal implications, rather than sitting in the path by default.
 */
export type ClearanceRole = 'reputation' | 'policy' | 'sme' | 'legal';

/**
 * Blocking or advisory, IN THE TYPE.
 *
 * CERC: "If appropriate, you may have others review and comment on the document, but
 * not delay its release." An advisory reviewer who can block turns every interested
 * party into a veto and the desk stops shipping. Encoding the distinction is the only
 * way it survives contact with an org chart.
 */
export type ClearanceMode = 'blocking' | 'advisory';

/**
 * One clearance hold.
 *
 * Two properties that most implementations get wrong:
 *  - Clearances are gathered IN PARALLEL, as a set of independent holds, not as a
 *    pipeline. CERC: "Clear all information simultaneously". A serial chain is what
 *    makes regulated desks structurally too slow to matter in a crisis.
 *  - `contentHash` binds the approval to the exact bytes. If the text changes, the
 *    clearance is void — otherwise "four eyes" silently degrades into "four eyes on
 *    an earlier draft", which is the most common real-world failure of these systems
 *    and the reason `CLEARANCE_VOID_CONTENT_CHANGED` exists.
 *
 * `headlineTest` records CERC's reviewer question — "Ask if he or she would be
 * comfortable seeing this as a news headline" — as an assertion rather than a click.
 */
export interface Clearance {
  readonly role: ClearanceRole;
  readonly mode: ClearanceMode;
  readonly reviewer: ActorId;
  readonly at: Instant;
  readonly headlineTest: boolean;
  readonly contentHash: ContentHash;
  readonly comment: string | null;
}

export const CLEARANCE_HEADLINE_TEST_QUESTION =
  'Would you be comfortable seeing this as a news headline?';

/** The three lanes a crisis release requires, all blocking, gathered in parallel. */
export const CRISIS_BLOCKING_CLEARANCES: readonly ClearanceRole[] = [
  'reputation',
  'policy',
  'sme',
] as const;

/**
 * Who actually wrote it.
 *
 * FINRA 2210(b)(4)(A)(iii) requires naming "the person who prepared or distributed"
 * a communication that was not pre-approved — the rule assumes preparer and approver
 * are different people and forces the record to say which you had. AI is never one of
 * the eyes: a model draft is an unapproved artefact by an unregistered preparer, so
 * `model_unedited` must be un-approvable by policy, which is what
 * `AUTHORED_BY_MODEL_UNEDITED` refuses.
 */
export type AuthorshipProvenance = 'human' | 'model_edited_by_human' | 'model_unedited';

/**
 * The draft lifecycle. Note what the terminal state is NOT.
 *
 * `handoff` renders the final text with a copy affordance and asks the human to
 * confirm they posted it. The compartment never touches the account: there is no
 * `posted` transition it performs, only a `published` record a human completes. That
 * seam is deliberate, and adding posting to it must remain a CHOICE rather than the
 * natural next commit.
 *
 * `expired` matters because FINRA 2210(b)(4)(A)(i) records "the dates of first and
 * (if applicable) last use" — cleared language that is still in the library and stale
 * is a compliance defect, not untidiness.
 */
export type DraftLifecycleState =
  | 'draft'
  | 'validating'
  | 'refused'
  | 'clearing'
  | 'cleared'
  | 'handoff'
  | 'published'
  | 'expired'
  | 'withdrawn';

/**
 * The paste-back close-out. This is what turns the record from an intention into
 * evidence.
 *
 * Art 68(9) requires records "sufficient to enable competent authorities ... to
 * ascertain whether crypto-asset service providers have complied", and Art 8(2)
 * requires marketing communications to be notified on request. Neither is satisfied
 * by the approved draft, because the approved draft is a claim about what was
 * published, not proof of it — they differ whenever someone edits in the compose box
 * after approval. With no API there is exactly one route to the published bytes: the
 * human pastes them back. So this is a required close-out with a visible outstanding
 * count, not an optional field.
 *
 * `parentSnapshot` is captured at DRAFT time, not close-out time: a reply is only
 * intelligible with the post it answers, and six months later the parent may be
 * deleted, edited or suspended. An orphan sentence reads worse than it was.
 */
export interface PublicationCloseOut {
  readonly publishedText: string;
  readonly publishedTextHash: ContentHash;
  readonly permalink: Permalink;
  /** The platform's timestamp, corroborated via oEmbed — not the email Date header. */
  readonly publishedAt: Instant;
  readonly confirmedBy: ActorId;
  readonly confirmedAt: Instant;
  /** Whether the published bytes equal the cleared bytes. `false` is not a bug, it is a finding. */
  readonly matchesClearedText: boolean;
  readonly parentSnapshot: {
    readonly text: string;
    readonly authorHandle: Handle;
    readonly observedAt: Instant;
    readonly provenance: InboundProvenance;
  } | null;
}

/**
 * Deletion is not remediation. A withdrawal is a LINKED OBJECT with a reason, never a
 * hard delete — SEC v. Bankman-Fried records both the tweet and its deletion, and the
 * deletion destroyed the only evidence of good behaviour while preserving none of the
 * bad. Retention must survive takedown: the post goes, the record does not.
 */
export interface Withdrawal {
  readonly reason: string;
  readonly withdrawnBy: ActorId;
  readonly withdrawnAt: Instant;
  /** The item this withdraws or corrects. */
  readonly supersedes: string;
}

/* ──── §9.1 Pre-cleared language and its mutation policy ──── */

/**
 * What may be substituted into a cleared line WITHOUT losing its clearance.
 *
 * FINRA 2210(c)(7)(A)-(B) protects reuse only "without material change", and template
 * reuse only where changes are limited to "updates of more recent statistical or other
 * non-narrative information" and "non-predictive narrative information". So the
 * library is not a snippets folder; it is a typed template whose mutation policy is
 * what preserves the approval.
 *
 * Filling a `free_text` slot VOIDS the inherited clearance and returns the draft to
 * full review (`APPROVED_LANGUAGE_FREE_TEXT_SLOT_FILLED`). The surface should show the
 * clearance being lost the moment the slot is touched — the honesty is the feature,
 * and it is the difference between a library that provides legal cover and one that
 * provides false confidence.
 */
export type SlotKind =
  | 'numeric_update'
  | 'date_update'
  | 'enum'
  | 'non_predictive_narrative'
  | 'free_text';

export const SLOT_PRESERVES_CLEARANCE: Record<SlotKind, boolean> = {
  numeric_update: true,
  date_update: true,
  enum: true,
  non_predictive_narrative: true,
  free_text: false,
};

/* ──── §9.2 Crisis discipline: the tri-slot body ──── */

export type IncidentPhase = 'preparation' | 'initial' | 'maintenance' | 'recovery';

/**
 * Incident types. `peer_contagion` and `impersonation` are the two most taxonomies
 * miss, and both are native to a crypto venue.
 */
export type IncidentType =
  | 'outage'
  | 'security_incident'
  | 'hack_rumour'
  | 'depeg'
  | 'delisting'
  | 'regulatory_action'
  | 'peer_contagion'
  | 'impersonation';

/**
 * Attributes a peer failure can make you guilty of by association.
 *
 * When Crypto.com's own token fell in November 2022 the question asked was not what
 * it had done but whether it was structurally like FTX. LCX has a native token, so it
 * is in the same equivalence class CRO and FTT were in. The precleared-language
 * library should be indexed by this, because the question is always "are you like
 * them?" and the answer must be prepared BEFORE the peer fails.
 */
export type ContagionAttribute =
  | 'native_exchange_token'
  | 'affiliated_market_maker'
  | 'opaque_reserves'
  | 'same_banking_partner'
  | 'same_custodian'
  | 'same_jurisdiction'
  | 'same_auditor'
  | 'same_stablecoin_exposure';

/**
 * The only shape a public statement about an incident may take.
 *
 * CERC: "State what you know, what you don't know, and what you are doing to find out
 * more. Do not speculate." And, on media guidance: "Don't speculate and don't
 * over-reassure."
 *
 * `notKnown` MUST be non-empty in the `initial` phase
 * (`NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT`). A first statement that admits no
 * uncertainty is, by CERC's own logic, either speculation or over-reassurance — and
 * over-reassurance is the charged act, not merely a bad look: SEC v. Bankman-Fried
 * pleads "FTX is fine. Assets are fine" as false and misleading. The reassurance path
 * is the dangerous path, and this type makes it the hardest one to walk.
 *
 * `nextUpdateBy` turns "be credible" from a sentiment into a deadline the instrument
 * can hold the desk to, and its breach is a first-class event.
 */
export interface StatementBody {
  readonly known: readonly string[];
  /** Required non-empty on an `initial`-phase statement. */
  readonly notKnown: readonly string[];
  readonly nextStep: {
    readonly action: string;
    readonly nextUpdateBy: Instant;
  };
  readonly empathy: string | null;
  /** CERC's openness rule: if you cannot share something, say why. */
  readonly withheld: { readonly what: string; readonly whyNotReleasable: string } | null;
}

/**
 * The clock, and why it exists.
 *
 * The Federal Reserve's SVB review recorded over $40 billion of deposits lost in a
 * single day — roughly 85% of the deposit base — against $10 billion over 8 days for
 * Wachovia in 2008, and attributed the change to social media plus instant
 * withdrawals. A crypto venue is worse-positioned on every dimension named:
 * withdrawals are 24/7 and settle in minutes, and there is no deposit insurance to
 * slow a panic. So the relevant unit for a comms desk here is minutes, not hours, and
 * a time-to-first-statement budget belongs in the type system rather than in a
 * ternary in a JSX file.
 */
export interface TimeToFirstStatementBudget {
  readonly incidentType: IncidentType;
  readonly severity: ImpactSeverity;
  readonly budgetMinutes: number;
}

/* ════════ §10 RETENTION — AND THE CONTRADICTION THE OWNER MUST RESOLVE ════════ */

/**
 * MiCA Art 68(9): CASP records "shall be kept for a period of five years and, where
 * requested by the competent authority before five years have elapsed, for a period
 * of up to seven years".
 *
 * MiCA sets no express retention period for a CASP's MARKETING communications, so
 * this number is reasoned rather than quoted: Art 68(9) is the only retention figure
 * MiCA gives for CASP records, its first subparagraph expressly covers obligations
 * "with respect to clients or prospective clients and to the integrity of the
 * market", and Art 88(1) independently requires inside information to be maintained
 * on the website "for a period of at least five years". Anything shorter than five
 * years is indefensible. Labelled as an inference so nobody later cites it as text.
 */
export const MICA_RECORD_RETENTION_YEARS = 5;

/** Art 68(9)'s ceiling on a competent-authority extension. */
export const MICA_RECORD_RETENTION_MAX_YEARS = 7;

/**
 * THE UNRESOLVED CONTRADICTION, named here rather than papered over.
 *
 * The compartment's existing retention sweep deletes inbound rows after 90 days for
 * GDPR reasons. The supervisor wants five to seven years. Those cannot both be right,
 * and the resolution is a data-protection ruling the owner and the DPO owe — not
 * something an engine may decide.
 *
 * Working assumption until it is answered, and it is an ASSUMPTION:
 * retain LCX's own published statements and their clearance records for the full
 * period, and minimise retention of third-party content. An item whose retention
 * treatment is genuinely undetermined produces `RETENTION_POLICY_UNRESOLVED` rather
 * than a silent default in either direction.
 */
export const RETENTION_RULING_OUTSTANDING = true;

export const RETENTION_RULING_QUESTION =
  "May LCX's own published statements be retained past the 90-day inbound sweep? MiCA Art 68(9) implies five to seven years; the current cascade deletes at ninety days. A DPO ruling is required.";
