/**
 * MARKETING REGIME — WHICH LAW BITES, AND THE ARITHMETIC THAT PROVES ONE OF THEM
 * CANNOT BE SATISFIED IN A POST.
 *
 * This module answers one question — *which rules apply to this item* — and it
 * answers a second question that falls out of the first as pure arithmetic: *can the
 * mandated text physically fit in the channel*. Nothing here reads a database, a
 * clock or a random number. `at` is always supplied by the caller, because a timing
 * rule (Art 7(2)) that reads the clock cannot be tested for what it says about a
 * post written before a white paper existed, which is the entire behaviour under
 * test.
 *
 * FOUR THINGS THIS MODULE INSISTS ON, none of them stylistic:
 *
 * 1. **An item is in several regimes at once, or it has not been classified.** A
 *    celebratory listing post is `casp_conduct` (Art 66) *and* `offer_promo`
 *    (Art 7, because Art 7(1) is drafted to catch "the operator of the trading
 *    platform") *and* `market_abuse` (Title VI, because the asset is admitted to
 *    trading). The mandatory elements are the UNION of the applicable regimes' and
 *    so are the refusals. `classifyRegimes` therefore returns a set and never a
 *    winner.
 *
 * 2. **Art 66(2) is the floor and it is never absent.** Every public item gets
 *    `casp_conduct`. There is no input to this module that produces an empty regime
 *    set — see `regime.test.ts`, which asserts it over every combination of verb,
 *    surface and purpose.
 *
 * 3. **The Art 7 refusal is arithmetic, not judgement.** The Art 7(1)(e) statement in
 *    its platform-operator form is 286 characters (`ART_7_1_E_STATEMENT_PLATFORM_
 *    OPERATOR`, verified against the Regulation), `X_POST_MAX_CHARS` is 280, and
 *    Art 7(1)(d) then adds a white-paper statement, a website address, a telephone
 *    number and an email address on top. The mandated text does not fit with zero
 *    words of our own, so an Art 7 marketing communication cannot be compliant as a
 *    standalone post. `art7Budget` computes the shortfall in characters and the
 *    refusal quotes it, because "this might be a problem" is arguable and "you are
 *    short by 147 characters" is not.
 *
 * 4. **Unknown state resolves in the direction that is safe, and the direction is
 *    not the same in both cases.** Where an unknown fact only *widens* scrutiny —
 *    "is this asset admitted to trading somewhere we cannot see" — the classifier
 *    assigns the wider regime and records why (a refusal on every item would be a
 *    dead gate, and assuming more law applies is not a false claim). Where an unknown
 *    fact changes WHAT MUST BE IN THE ARTEFACT — is this a plain crypto-asset, an
 *    ART or an EMT, because Art 7, Art 29 and Art 53 mandate different text — the
 *    classifier refuses, because guessing there produces an artefact carrying the
 *    wrong mandatory statement.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO, so the boundary is visible rather than
 * discovered later:
 *  - It does not read prose for superlatives, personalisation or regulated promises.
 *    Those are the claim gate's, and they are lexical. This module consumes their
 *    findings (`PersonalisationFinding`, `AdvantageClaim`) as declared inputs and
 *    will say, in `coverage`, when an axis was never assessed rather than let silence
 *    read as a pass.
 *  - It does not join the embargo register or the holdings declaration. It records
 *    that the join is owed (`CoverageAxis`), requires the Art 91(3)(c) conflict
 *    disclosure as an element when a holding is declared to it, and leaves the
 *    perimeter's refusals to the perimeter.
 *  - It does not decide whether an element is PRESENT in the text. It decides which
 *    elements are REQUIRED, by which regime, under which provision. Presence needs
 *    the rendered artefact; requirement needs only the classification, and conflating
 *    the two is how a checklist ends up asserting a check nobody performed.
 *
 * Citation policy: every provision below was read from the primary text
 * (EUR-Lex CELEX:32023R1114 for MiCA, CELEX:02005L0029-20220528 for the UCPD).
 * Verbatim strings live in `types.ts` and are compared by byte equality, never
 * paraphrased. Where the Regulation prescribes CONTENT but not WORDING — Art 7(1)(d)
 * is the case that matters — this module says so in
 * `ART_7_1_D_WORDING_IS_NOT_PRESCRIBED` and requires the desk to supply its own
 * words rather than inventing legal text to measure.
 */
import {
  ART_7_1_D_ELEMENTS,
  ART_7_1_E_STATEMENT,
  INSTRUMENTS,
  MARKETING_REGIMES,
  X_POST_MAX_CHARS,
  type ActorId,
  type Art7Role,
  type AssetEmbargoState,
  type AssetSymbol,
  type ConsiderationKind,
  type ContentSurface,
  type EngagementVerb,
  type HoldingsDeclarationState,
  type Instant,
  type MandatoryElement,
  type MarketingJurisdiction,
  type MarketingRegime,
  type ProductRegulatoryStatus,
  type Refusal,
  type RefusalCode,
  type RegimeAssignment,
  type RegimeClassification,
  type RegimeSet,
  type RuleCitation,
} from './types.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 CITATIONS, AND THE ONE PLACE A REFUSAL IS CONSTRUCTED                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Stamped onto every refusal and every classification this module emits, so an audit
 * row can be read against the rules that were in force when it fired rather than
 * against today's. Bump this when a rule below changes meaning, never when a comment
 * changes.
 */
export const REGIME_RULESET_VERSION = 1;

/** MiCA, cited with the provision and the words as read. */
const MICA = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.mica.key,
  provision,
  text,
});

/** Directive 2005/29/EC (UCPD), consolidated text. */
const UCPD = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.ucpd.key,
  provision,
  text,
});

/** Commission Guidance 2021/C 526/01 — interpretation, not law. */
const UCPD_GUIDANCE = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.ucpd_guidance.key,
  provision,
  text,
});

/** ESMA35-1872330276-2329, the halo-effect statement — supervisory expectation. */
const ESMA_HALO = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.esma_halo.key,
  provision,
  text,
});

/**
 * ESMA35-1872330276-1899, the reverse-solicitation guidelines. Used BY ANALOGY: that
 * guideline formally addresses third-country firms and Art 61, not LCX. It is cited
 * because it is the supervisor's own vocabulary for the education/promotion line that
 * Art 66(2) requires the desk to draw, and the analogy is recorded as an analogy.
 */
const ESMA_REVERSE_SOLICITATION = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.esma_reverse_solicitation.key,
  provision,
  text,
});

/** The desk's own rule, cited when a refusal here is ours rather than the law's. */
const DESK_POLICY = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

function refuse(
  code: RefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: Refusal['recovery'],
  matched: string | null = null,
): Refusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: REGIME_RULESET_VERSION };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE ITEM, AS THE CLASSIFIER NEEDS TO SEE IT                               */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * A tri-state the caller must answer deliberately. `'unknown'` is not a synonym for
 * `false` anywhere in this module; every read of it is either a refusal or a recorded
 * widening of scope.
 */
export type Known<T> = T | 'unknown';

/**
 * Which of MiCA's three marketing regimes an asset falls under.
 *
 * This is not decoration. Art 7 (other crypto-assets), Art 29 (asset-referenced
 * tokens) and Art 53 (e-money tokens) mandate DIFFERENT text: only Art 7(1)(e)
 * carries the "has not been reviewed or approved by any competent authority"
 * statement, and only Art 29(2)/Art 53(2) carry the redemption-right statement. So
 * `'unknown'` here cannot be resolved conservatively — there is no superset to fall
 * back to — and it produces `ASSET_STATE_UNKNOWN` whenever the item promotes.
 */
export type AssetKind =
  | 'other_crypto_asset'      // Title II / Art 7
  | 'asset_referenced_token'  // Title III / Art 29
  | 'e_money_token'           // Title IV / Art 53
  | 'unknown';

/**
 * The asset's admission state ON LCX — which is all the desk's own register can know.
 *
 * READ THE `'not_on_lcx'` DOC BEFORE USING IT AS AN ALL-CLEAR. Art 86(1) applies
 * Title VI to crypto-assets "admitted to trading or in respect of which a request for
 * admission to trading has been made" — it is not limited to the platform the author
 * happens to work for. An asset admitted on another venue is inside Title VI while
 * being `'not_on_lcx'` here. That is why `AssetFact.admittedOnAnotherVenue` exists as
 * a separate, separately-unknown fact, and why an unknown answer there WIDENS the
 * regime set instead of clearing it.
 */
export type LcxAdmissionStatus =
  | 'admitted'             // trading live on LCX
  | 'admission_requested'  // application made — Art 86(1) is already engaged
  | 'not_on_lcx'
  | 'unknown';

/**
 * The white-paper state for one asset, as at the moment of the item.
 *
 * Art 7(2): "Where a crypto-asset white paper is required pursuant to Article 4 or 5,
 * no marketing communications shall be disseminated prior to the publication of the
 * crypto-asset white paper." Art 29(6) and Art 53(6) say the same for ARTs and EMTs.
 * So the rule is a comparison of two timestamps and it is breached ON TIMING ALONE,
 * however careful the wording — which is precisely the class a prose review cannot
 * catch.
 *
 * `'not_required'` carries a `basis` because "no white paper was required" is a legal
 * conclusion about Art 4/Art 5 exemptions, not an absence of data, and a record that
 * cannot say why will read as a record that never asked.
 */
export type WhitePaperState =
  | { readonly kind: 'not_required'; readonly basis: string }
  | { readonly kind: 'published'; readonly publishedAt: Instant }
  | { readonly kind: 'required_not_published' }
  | { readonly kind: 'unknown' };

/**
 * WHAT THE ITEM DOES WITH THIS ASSET. Declared by the desk, per asset, because the
 * same asset in the same sentence can be a passing mention or an admission promotion
 * and no lexical rule separates them reliably.
 *
 *  - `mentions`                 named factually, nothing promoted. Art 66(2) still
 *                               applies; Art 7 does not.
 *  - `promotes_trading`         "now live", "trade it here". This RELATES TO the
 *                               admission to trading, which is the Art 7(1) trigger
 *                               for the operator of the trading platform.
 *  - `promotes_offer`           promotes an offer to the public — a sale, a launchpad
 *                               round, a subscription.
 *  - `signals_future_admission` "listing soon", "will be tradable". Two consequences,
 *                               not one: Art 4(4) destroys any Art 4(2)/(3) exemption
 *                               the asset relied on the moment the intention is made
 *                               known by the offeror "or another person acting on the
 *                               offeror's behalf", and if the decision is not yet
 *                               public it is inside information (Art 87, Art 90).
 *  - `discloses_non_public`     THIS ARTEFACT IS THE DISCLOSURE. The Art 88(1) axis:
 *                               an issuer, offeror or person seeking admission "shall
 *                               not combine the disclosure of inside information to
 *                               the public with the marketing of their activities".
 */
export type AssetTreatment =
  | 'mentions'
  | 'promotes_trading'
  | 'promotes_offer'
  | 'signals_future_admission'
  | 'discloses_non_public';

/** Treatments that make the item a promotion of an offer or an admission to trading. */
const PROMOTIONAL_TREATMENTS: readonly AssetTreatment[] = [
  'promotes_trading',
  'promotes_offer',
  'signals_future_admission',
] as const;

/**
 * Everything the classifier needs to know about one named asset. Supplied, never
 * inferred: this module holds no register and will not pretend to.
 */
export interface AssetFact {
  readonly asset: AssetSymbol;
  readonly kind: AssetKind;
  readonly treatment: AssetTreatment;
  readonly lcxAdmission: LcxAdmissionStatus;
  /**
   * Whether the asset is admitted to trading, or has a pending admission request, on
   * any venue OTHER than LCX. `'unknown'` is the honest default and it widens the
   * regime set rather than clearing it (Art 86(1) is venue-agnostic).
   */
  readonly admittedOnAnotherVenue: Known<boolean>;
  /** Inside-information state as at the moment of the item. The perimeter owns the join; this module only reads it. */
  readonly embargo: AssetEmbargoState;
  readonly whitePaper: WhitePaperState;
  /**
   * True when the asset's offer relies on an Art 4(2)/(3) exemption. Art 4(4) then
   * makes a single "listing soon" sentence destroy it, and the exemption belongs to
   * the offeror — so the own-goal lands on a counterparty.
   */
  readonly reliesOnArt4Exemption: boolean;
  /**
   * True when LCX is the issuer of this asset, or is promoting it on the issuer's
   * behalf or for the issuer's account. Art 29 and Art 53 bite only then; and the
   * same fact means the activity may be "placing of crypto-assets" (Art 3(1)), a
   * licensable service, which is why `authorisedServices` exists on the input.
   */
  readonly lcxActsForIssuer: boolean;
  /**
   * The author's declared position in this asset, if the holdings register answered.
   * Read for one purpose only: requiring the Art 91(3)(c) conflict disclosure IN THE
   * POST. The refusals for `not_declared` and `register_absent` belong to the
   * perimeter, not here, and this module records the join as owed rather than
   * duplicating it.
   */
  readonly authorHolding: HoldingsDeclarationState;
}

/**
 * What the desk says the item is FOR. A recorded judgement with a reason — MiCA never
 * defines "marketing communication" at Level 1 (checked against the Art 3(1)
 * definitions), so the classification cannot be presented as an obvious fact.
 *
 * `education` is the interesting one. ESMA's reverse-solicitation guideline (GL 1
 * para 17) treats purely educational material as non-solicitation, but as promotion
 * once "the audience is directed to the [firm]'s website". So `education` plus
 * `firstPartyLinkPresent` is a marketing communication, and the identify-as-such duty
 * switches on. The practical reading, which the desk should hear out loud: the safe
 * answer to a question is often the answer without the link.
 */
export type ItemPurpose =
  | 'support_answer'
  | 'education'
  | 'product_promotion'
  | 'offer_or_listing_promotion'
  | 'campaign_or_giveaway'
  | 'correction_or_rebuttal'
  | 'crisis_statement'
  | 'partner_amplification'
  | 'inside_information_disclosure';

export const ITEM_PURPOSES: readonly ItemPurpose[] = [
  'support_answer',
  'education',
  'product_promotion',
  'offer_or_listing_promotion',
  'campaign_or_giveaway',
  'correction_or_rebuttal',
  'crisis_statement',
  'partner_amplification',
  'inside_information_disclosure',
] as const;

/** An LCX product or service the item names, with its MiCA perimeter status. */
export interface NamedProduct {
  readonly name: string;
  readonly status: ProductRegulatoryStatus;
}

/**
 * A claim about the advantages of a crypto-asset or of LCX, as the desk declared it,
 * with the check that was actually made.
 *
 * `substantiation: null` is not "we did not add a source yet". Art 66(2) second
 * sentence prohibits misleading a client "deliberately or **negligently**", so the
 * absence of a check IS the fault element — see §6. The claim gate finds the
 * superlatives; this module holds the record obligation that follows from the
 * negligence standard.
 */
export interface AdvantageClaim {
  readonly text: string;
  readonly substantiation:
    | { readonly sourceRef: string; readonly verifiedBy: ActorId; readonly verifiedAt: Instant }
    | null;
}

/**
 * The claim gate's verdict on personalisation, passed in rather than recomputed.
 *
 * When this is absent the classifier does NOT conclude "not advice". It records
 * `advice_personalisation_not_assessed` in `coverage`, because an unexamined axis
 * reported as clear is the specific dishonesty this compartment exists to refuse.
 */
export interface PersonalisationFinding {
  readonly personalised: boolean;
  readonly basis: string;
  readonly foundBy: string;
}

/**
 * The channel's hard character ceiling, in X-weighted characters.
 *
 * `maxWeightedChars: null` means the surface has no ceiling worth modelling (a landing
 * page, an email). It does NOT mean "unlimited and therefore fine": the Art 7 elements
 * are still required there, they simply fit.
 */
export interface ChannelLimit {
  readonly label: string;
  readonly maxWeightedChars: number | null;
}

/** X's standard post ceiling, as the platform's rule and not ours. */
export const X_CHANNEL_LIMIT: ChannelLimit = {
  label: 'X post (standard, non-premium)',
  maxWeightedChars: X_POST_MAX_CHARS,
};

/** A surface with no character ceiling — a landing page, a blog post, an email. */
export const UNLIMITED_CHANNEL: ChannelLimit = {
  label: 'long-form surface (no platform character ceiling)',
  maxWeightedChars: null,
};

/**
 * The default channel per surface. `campaign_landing_copy` is the only surface that
 * escapes the ceiling, which is exactly why `different_surface` is a real recovery
 * from the Art 7 arithmetic and not a consolation.
 */
export const SURFACE_CHANNEL: Record<ContentSurface, ChannelLimit> = {
  bio: { label: 'X bio', maxWeightedChars: 160 },
  pinned_post: X_CHANNEL_LIMIT,
  profile: { label: 'X profile field', maxWeightedChars: 160 },
  campaign_landing_copy: UNLIMITED_CHANNEL,
  reply: X_CHANNEL_LIMIT,
  quote_post: X_CHANNEL_LIMIT,
  original_post: X_CHANNEL_LIMIT,
  thread_in_progress: X_CHANNEL_LIMIT,
};

/**
 * The item, as classification needs it. Everything is declared; nothing is read from
 * the world. `at` and `decidedBy` are required because a classification is evidence
 * only if it says when it was made and by whom (Art 68(9)).
 */
export interface RegimeInput {
  readonly verb: EngagementVerb;
  readonly surface: ContentSurface;
  /** Our own words. Empty string for `like` and `repost`, which produce no text of ours. */
  readonly body: string;
  /** The target's text, where the verb republishes or adopts it. `null` for `original`. */
  readonly targetBody: string | null;
  readonly purpose: ItemPurpose;
  readonly assets: readonly AssetFact[];
  readonly products: readonly NamedProduct[];
  /** True when the item carries an LCX link, signup CTA or app-store link. */
  readonly firstPartyLinkPresent: boolean;
  /** True when the item invokes LCX's own authorisation or regulated status. */
  readonly citesOwnRegulatoryStatus: boolean;
  /** Consideration that passed between LCX and the account or asset being promoted. */
  readonly consideration: ConsiderationKind;
  /** Whose account this goes out from. UCPD Annex I point 22 turns on this. */
  readonly authorAccount: 'lcx_official' | 'staff_personal';
  /** True when a staff-personal item states the LCX relationship in the visible text. */
  readonly employmentRelationshipDisclosed: boolean;
  /** Advantage claims the desk declared, with their substantiation or its absence. */
  readonly advantageClaims: readonly AdvantageClaim[];
  /** The claim gate's personalisation verdict. Absent means "not assessed", never "clear". */
  readonly personalisation?: PersonalisationFinding;
  /**
   * Which Annex I services LCX is authorised for, read off the authorisation. `null`
   * means the list has not been supplied — a named gap, not an empty list, and the
   * difference is the whole of `AUTHORISED_SERVICE_LIST_ABSENT`.
   */
  readonly authorisedServices: readonly string[] | null;
  /** Who Art 7(1)(e) names as solely responsible. `platform_operator` for LCX's own listings. */
  readonly art7Role: Art7Role;
  /** The Art 7(1)(d) block the desk intends to use, in its own words. `null` refuses. */
  readonly art7Disclosure: Art7DisclosureBlock | null;
  /** Channel ceiling. Defaults to `SURFACE_CHANNEL[surface]` when omitted. */
  readonly channel?: ChannelLimit;
  /** Jurisdictions the desk asserts this was addressed to. */
  readonly addressedTo: readonly MarketingJurisdiction[];
  /** Jurisdictions explicitly excluded — a factual claim that must be evidenced. */
  readonly excludedFrom: readonly MarketingJurisdiction[];
  /** For `campaign_or_giveaway`: whether the draw's excluded jurisdictions came from counsel. */
  readonly prizeDrawExclusionsFromCounsel?: boolean;
  /**
   * For `campaign_or_giveaway`: whether entry requires personal data or confers any
   * benefit on LCX. Art 4(3) second subparagraph says an asset is NOT offered for free
   * in that case, so the Title II exemption falls away and the promotion becomes an
   * Art 7 marketing communication.
   */
  readonly giveawayRequiresPersonalDataOrBenefit?: Known<boolean>;
  readonly at: Instant;
  readonly decidedBy: ActorId;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE ART 7 ARITHMETIC — A LISTING PROMOTION DOES NOT FIT IN A POST         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Code-point ranges X weights as ONE character. Everything outside them weighs TWO.
 *
 * From X's published `twitter-text` configuration (v3): `defaultWeight` 200,
 * `scale` 100, `maxWeightedTweetLength` 280, with weight-100 ranges 0–4351,
 * 8192–8205, 8208–8223 and 8242–8247. So Latin, Cyrillic, Greek, Hebrew and Arabic
 * count as one; CJK, Hangul and every emoji count as two.
 *
 * WHY THIS AND NOT `String.length`: `.length` counts UTF-16 units, so one emoji reads
 * as 2 and an astral CJK character as 2 — coincidentally right for the wrong reason,
 * and wrong for a flag sequence. Counting code points alone UNDERCOUNTS a Japanese
 * post by half, and an undercount lets a real over-length pass. The failure direction
 * matters more than the elegance.
 */
export const X_SINGLE_WEIGHT_CODE_POINT_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
] as const;

/**
 * WHAT THIS MEASUREMENT DOES NOT MODEL, and which way each omission errs. Rendered on
 * the panel next to the budget, because a character count an operator cannot reconcile
 * with what X shows them is a count they will stop believing.
 *
 * 1. **t.co shortening.** X counts every URL as 23 characters however long it is. This
 *    function counts the URL's real length, so a 90-character link is counted as 90.
 *    That OVERSTATES the length — the budget is conservative and refuses earlier than
 *    the platform would. Safe direction.
 * 2. **Attached media and quoted posts** do not consume characters on X. Not modelled,
 *    and not needed: the mandated text is text.
 * 3. **Premium (formerly Blue) long posts.** LCX's subscription tier is not knowable
 *    from inside this compartment, so 280 is the only defensible ceiling. Assuming the
 *    higher one would let the Art 7 refusal be skipped silently, which is the one
 *    outcome worth designing against.
 */
export const X_LENGTH_MODEL_LIMITS: readonly string[] = [
  'URLs are counted at their real length; X counts every URL as 23 characters, so this budget is conservative for long links and refuses earlier than the platform would.',
  'Attached media and a quoted post consume no characters on X and are not counted here.',
  'The 280-character ceiling assumes a standard account. A premium long-post allowance is not knowable from inside this compartment and is deliberately not assumed.',
];

function codePointWeight(codePoint: number): 1 | 2 {
  for (const [lo, hi] of X_SINGLE_WEIGHT_CODE_POINT_RANGES) {
    if (codePoint >= lo && codePoint <= hi) return 1;
  }
  return 2;
}

/**
 * Length in X-weighted characters. Deterministic, total, and equal to `[...s].length`
 * for pure Latin text — which is why the Art 7 statement measures 286 either way.
 */
export function xWeightedLength(text: string): number {
  let total = 0;
  for (const char of text) {
    total += codePointWeight(char.codePointAt(0)!);
  }
  return total;
}

/**
 * ART 7(1)(d) PRESCRIBES CONTENT, NOT WORDING — AND SO THIS MODULE WILL NOT SUPPLY A
 * STRING FOR IT.
 *
 * The provision requires that the marketing communications "clearly state that a
 * crypto-asset white paper has been published and clearly indicate the address of the
 * website of the offeror, the person seeking admission to trading, or the operator of
 * the trading platform for the crypto-asset concerned, as well as a telephone number
 * and an email address to contact that person". Those are four facts, not a sentence.
 *
 * Art 7(1)(e) is the opposite: it prescribes the words, and they are held verbatim in
 * `types.ts` as `ART_7_1_E_STATEMENT_*` and compared by byte equality.
 *
 * Consequence for the arithmetic: the (d) block's length depends on LCX's actual
 * website, telephone number, email address and chosen phrasing. There is no verbatim
 * string to measure, no defensible average to substitute, and an invented sentence
 * measured to two decimal places would be a fabrication wearing a number. So an absent
 * block produces `ART_7_BOILERPLATE_DOES_NOT_FIT` with a `supply_data` recovery naming
 * the four missing facts.
 */
export const ART_7_1_D_WORDING_IS_NOT_PRESCRIBED = true;

export const ART_7_1_D_WORDING_NOTE =
  'MiCA Art 7(1)(d) prescribes four facts — that a white paper has been published, the website address, a telephone number and an email address — but not the words that carry them. This instrument therefore holds no verbatim string for Art 7(1)(d) and will not estimate its length: the desk supplies its own wording and contact details, and until it does, the Art 7 budget refuses rather than guesses.';

/** The four Art 7(1)(d) facts, named so a `supply_data` recovery can list them. */
export const ART_7_1_D_REQUIRED_FACTS: readonly string[] = [
  'a statement that a crypto-asset white paper has been published',
  'the website address of the offeror, person seeking admission to trading, or operator of the trading platform',
  'a telephone number to contact that person',
  'an email address to contact that person',
] as const;

/**
 * The Art 7(1)(d) block in the desk's own words, with the three contact facts held
 * separately so a missing one is nameable rather than a short string.
 */
export interface Art7DisclosureBlock {
  /** The desk's sentence stating that a white paper has been published. */
  readonly whitePaperPublishedStatement: string;
  readonly websiteAddress: string;
  readonly telephone: string;
  readonly email: string;
}

/** Which of the Art 7(1)(d) facts a supplied block is missing. Empty means complete. */
export function missingArt7DisclosureFacts(
  block: Art7DisclosureBlock | null,
): readonly string[] {
  if (block == null) return ART_7_1_D_REQUIRED_FACTS;
  const missing: string[] = [];
  if (block.whitePaperPublishedStatement.trim() === '') missing.push(ART_7_1_D_REQUIRED_FACTS[0]!);
  if (block.websiteAddress.trim() === '') missing.push(ART_7_1_D_REQUIRED_FACTS[1]!);
  if (block.telephone.trim() === '') missing.push(ART_7_1_D_REQUIRED_FACTS[2]!);
  if (block.email.trim() === '') missing.push(ART_7_1_D_REQUIRED_FACTS[3]!);
  return missing;
}

/**
 * How the mandated elements are joined when rendered. One space between the (d) facts
 * and one space before the (e) statement — the minimum a reader could call "clear and
 * prominent". Modelled explicitly so the arithmetic is reproducible by hand, and
 * deliberately minimal, because a generous separator would inflate the shortfall and
 * make the refusal look manufactured.
 */
export const MANDATED_BLOCK_SEPARATOR = ' ';

/**
 * The mandated text for an Art 7 / Art 29 / Art 53 promotion, assembled and measured.
 *
 * `art7_1_eChars` is 0 for `art_promo` and `emt_promo`: Art 29(1) and Art 53(1) carry
 * (a)–(d) but NOT the Art 7(1)(e) "not reviewed or approved" statement. Verified
 * against the text. Getting that wrong in either direction would be a fabricated
 * mandatory element or a missed one.
 */
export interface MandatedBlock {
  /** The regime whose mandatory text this is. */
  readonly regime: Extract<MarketingRegime, 'offer_promo' | 'art_promo' | 'emt_promo'>;
  readonly art7_1_dText: string;
  readonly art7_1_dChars: number;
  readonly art7_1_eText: string;
  readonly art7_1_eChars: number;
  readonly totalChars: number;
  /** Facts the desk has not supplied. Non-empty means the block could not be assembled. */
  readonly missingFacts: readonly string[];
}

/**
 * Assemble and measure the mandated block. Returns `missingFacts` non-empty rather
 * than throwing or guessing when the (d) facts are absent, and reports the (e)
 * statement's length regardless, because 286 > 280 is worth showing even to an
 * operator who has not filled the contact block in yet.
 */
export function mandatedBlock(
  regime: MandatedBlock['regime'],
  role: Art7Role,
  block: Art7DisclosureBlock | null,
): MandatedBlock {
  const missingFacts = missingArt7DisclosureFacts(block);
  const dText =
    block == null || missingFacts.length > 0
      ? ''
      : [
          block.whitePaperPublishedStatement.trim(),
          block.websiteAddress.trim(),
          block.telephone.trim(),
          block.email.trim(),
        ].join(MANDATED_BLOCK_SEPARATOR);
  const eText = regime === 'offer_promo' ? ART_7_1_E_STATEMENT[role] : '';
  const dChars = xWeightedLength(dText);
  const eChars = xWeightedLength(eText);
  const joinChars =
    dChars > 0 && eChars > 0 ? xWeightedLength(MANDATED_BLOCK_SEPARATOR) : 0;
  return {
    regime,
    art7_1_dText: dText,
    art7_1_dChars: dChars,
    art7_1_eText: eText,
    art7_1_eChars: eChars,
    totalChars: dChars + eChars + joinChars,
    missingFacts,
  };
}

/**
 * The budget. The number the desk argues with, and the refusal that follows from it.
 *
 * `shortfallChars` is the honest headline: how many characters over the ceiling the
 * item is once the mandated text is added. It is positive whenever the item cannot be
 * made compliant on this surface, and `mandatedAloneExceedsLimit` distinguishes the
 * two cases that need different sentences — the mandated text alone does not fit
 * (nothing the author writes can help) versus the mandated text fits but this draft
 * pushes it over (fewer words would help).
 */
export interface Art7Budget {
  readonly regime: MandatedBlock['regime'];
  readonly channel: ChannelLimit;
  readonly block: MandatedBlock;
  readonly editorialChars: number;
  /** `null` when the channel has no ceiling. */
  readonly limit: number | null;
  /** Characters left for the author after the mandated text. Negative when there are none. */
  readonly remainingForEditorial: number | null;
  /** How far over the ceiling the assembled item is. 0 when it fits. */
  readonly shortfallChars: number;
  readonly fits: boolean;
  /** True when the mandated text alone exceeds the ceiling — the arithmetic that ends the argument. */
  readonly mandatedAloneExceedsLimit: boolean;
  readonly refusal: Refusal | null;
}

const ART_7_1_D_CITATION = MICA(
  'Art 7(1)(d)',
  'the marketing communications clearly state that a crypto-asset white paper has been published and clearly indicate the address of the website of the offeror, the person seeking admission to trading, or the operator of the trading platform for the crypto-asset concerned, as well as a telephone number and an email address to contact that person',
);

const ART_7_1_E_CITATION = MICA(
  'Art 7(1)(e)',
  "the marketing communications contain the following clear and prominent statement: 'This crypto-asset marketing communication has not been reviewed or approved by any competent authority in any Member State of the European Union. The offeror of the crypto-asset is solely responsible for the content of this crypto-asset marketing communication.'",
);

/**
 * The link-to-a-compliant-page pattern, named once so every refusal recommends the
 * same thing in the same words.
 *
 * It is not a loophole and the wording says so. Art 7(1)(e) requires the statement to
 * be "clear and prominent"; a statement one click away is a judgement call the desk is
 * taking, and the record should show it took it knowingly. The alternative shapes are
 * (a) do not make the item an offer promotion at all, which is usually the right
 * answer, and (b) a thread whose first post carries the mandated text.
 */
export const ART_7_LINK_TO_COMPLIANT_PAGE =
  'Do not promote the offer or the admission in the post. Post the factual sentence without the promotional framing, and put the Art 7(1)(d) and (e) text on a landing page the post links to — accepting that "clear and prominent" is then a judgement the desk has taken, and recording that it did. A thread whose first post carries the mandated text is the other defensible shape.';

/**
 * Compute the Art 7 / 29 / 53 character budget for one item.
 *
 * Total and pure. The refusal it returns is the same object the classifier surfaces,
 * so the arithmetic and the refusal can never disagree.
 */
export function art7Budget(args: {
  readonly regime: MandatedBlock['regime'];
  readonly role: Art7Role;
  readonly disclosure: Art7DisclosureBlock | null;
  readonly body: string;
  readonly channel: ChannelLimit;
}): Art7Budget {
  const block = mandatedBlock(args.regime, args.role, args.disclosure);
  const editorialChars = xWeightedLength(args.body);
  const limit = args.channel.maxWeightedChars;
  const provision = args.regime === 'offer_promo' ? 'Art 7(1)(d)+(e)' : args.regime === 'art_promo' ? 'Art 29(1)(d)' : 'Art 53(1)(d)';

  // The (d) facts are missing: there is no honest length to measure. Refuse and name
  // the four facts, rather than estimate a block nobody has written.
  if (block.missingFacts.length > 0) {
    const eNote =
      block.art7_1_eChars > 0 && limit != null && block.art7_1_eChars > limit
        ? ` The Art 7(1)(e) statement alone is ${block.art7_1_eChars} characters against a ${limit}-character ceiling, so this will not fit whatever the contact block says.`
        : '';
    return {
      regime: args.regime,
      channel: args.channel,
      block,
      editorialChars,
      limit,
      remainingForEditorial: null,
      shortfallChars: 0,
      fits: false,
      mandatedAloneExceedsLimit: limit != null && block.art7_1_eChars > limit,
      refusal: refuse(
        'ART_7_BOILERPLATE_DOES_NOT_FIT',
        `This item promotes an offer or an admission to trading, so ${provision} mandates text this instrument has not been given: ${block.missingFacts.join('; ')}.${eNote} The budget is not estimated, because an invented contact block would produce a number that looks like arithmetic and is not.`,
        ART_7_1_D_CITATION,
        {
          kind: 'supply_data',
          missing: block.missingFacts.join('; '),
          whoCanSupply: 'the marketing desk, from the published contact details LCX actually uses for this asset',
        },
      ),
    };
  }

  if (limit == null) {
    return {
      regime: args.regime,
      channel: args.channel,
      block,
      editorialChars,
      limit: null,
      remainingForEditorial: null,
      shortfallChars: 0,
      fits: true,
      mandatedAloneExceedsLimit: false,
      refusal: null,
    };
  }

  const remainingForEditorial = limit - block.totalChars;
  const total = block.totalChars + (editorialChars > 0 ? editorialChars + xWeightedLength(MANDATED_BLOCK_SEPARATOR) : 0);
  const shortfallChars = Math.max(0, total - limit);
  const mandatedAloneExceedsLimit = block.totalChars > limit;

  if (mandatedAloneExceedsLimit) {
    return {
      regime: args.regime,
      channel: args.channel,
      block,
      editorialChars,
      limit,
      remainingForEditorial,
      shortfallChars,
      fits: false,
      mandatedAloneExceedsLimit: true,
      refusal: refuse(
        'ART_7_BOILERPLATE_DOES_NOT_FIT',
        `${provision} mandate ${block.totalChars} characters of text this instrument cannot shorten, and the ${args.channel.label} holds ${limit} — short by ${block.totalChars - limit} characters before a single word of yours. This item cannot be compliant on this surface.`,
        args.regime === 'offer_promo' ? ART_7_1_E_CITATION : ART_7_1_D_CITATION,
        { kind: 'different_surface', suggestion: ART_7_LINK_TO_COMPLIANT_PAGE },
      ),
    };
  }

  if (shortfallChars > 0) {
    return {
      regime: args.regime,
      channel: args.channel,
      block,
      editorialChars,
      limit,
      remainingForEditorial,
      shortfallChars,
      fits: false,
      mandatedAloneExceedsLimit: false,
      refusal: refuse(
        'LENGTH_BUDGET_EXCEEDED',
        `The mandated ${provision} text takes ${block.totalChars} of the ${limit} characters on this ${args.channel.label}, leaving ${remainingForEditorial} for you; this draft uses ${editorialChars} and is ${shortfallChars} over.`,
        ART_7_1_D_CITATION,
        {
          kind: 'edit_text',
          what: `cut ${shortfallChars} characters, or move the promotion to a surface without a character ceiling`,
        },
      ),
    };
  }

  return {
    regime: args.regime,
    channel: args.channel,
    block,
    editorialChars,
    limit,
    remainingForEditorial,
    shortfallChars: 0,
    fits: true,
    mandatedAloneExceedsLimit: false,
    refusal: null,
  };
}

/**
 * Whether the body carries the Art 7(1)(e) statement, by byte equality against the
 * verbatim constants.
 *
 * Byte equality and nothing looser, on purpose. The Regulation prescribes the words;
 * a fuzzy match would let "has not been reviewed or approved by any regulator" pass as
 * the mandated statement, which is a different sentence with a different meaning. The
 * `wrongRole` case exists because using the offeror form when LCX is the platform
 * operator names the wrong person as solely responsible — a substantive error that
 * reads as a typo.
 */
export interface Art7StatementCheck {
  readonly present: boolean;
  /** Set when a statement for a DIFFERENT role is present. */
  readonly wrongRole: Art7Role | null;
  /** Set when text that is nearly the statement is present but not byte-equal. */
  readonly refusal: Refusal | null;
}

export function checkArt7Statement(body: string, role: Art7Role): Art7StatementCheck {
  const required = ART_7_1_E_STATEMENT[role];
  if (body.includes(required)) return { present: true, wrongRole: null, refusal: null };

  for (const other of Object.keys(ART_7_1_E_STATEMENT) as Art7Role[]) {
    if (other !== role && body.includes(ART_7_1_E_STATEMENT[other])) {
      return {
        present: false,
        wrongRole: other,
        refusal: refuse(
          'ART_7_1_E_STATEMENT_ALTERED',
          `The Art 7(1)(e) statement in this item is the ${other.replace(/_/g, ' ')} form, but this communication is prepared as ${role.replace(/_/g, ' ')} — so it names the wrong person as solely responsible for the content.`,
          ART_7_1_E_CITATION,
          { kind: 'edit_text', what: `replace it with the ${role.replace(/_/g, ' ')} form, verbatim` },
          ART_7_1_E_STATEMENT[other],
        ),
      };
    }
  }

  // Near-miss detection, kept deliberately crude: the opening clause is distinctive
  // enough that its presence without the whole statement means someone edited the
  // mandated words. Anything less specific would fire on ordinary prose.
  const opening = 'This crypto-asset marketing communication has not been';
  if (body.includes(opening)) {
    return {
      present: false,
      wrongRole: null,
      refusal: refuse(
        'ART_7_1_E_STATEMENT_ALTERED',
        'This item carries something close to the Art 7(1)(e) statement but not the statement itself. The Regulation prescribes the words; an edited version satisfies nothing and looks worse than an omission.',
        ART_7_1_E_CITATION,
        { kind: 'edit_text', what: 'paste the mandated statement verbatim, unwrapped and unpunctuated by you' },
        opening,
      ),
    };
  }

  return { present: false, wrongRole: null, refusal: null };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 MANDATORY ELEMENTS — WHICH ARE REQUIRED, BY WHICH REGIME, UNDER WHICH     */
/*    PROVISION. NOT WHETHER THEY ARE PRESENT.                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The refusal code to emit when a required element is ABSENT from the artefact.
 *
 * `null` is not laziness and it is not a pass. It means no code can honestly name that
 * element's absence, and this module will not repurpose a code that means something
 * else — `ART_7_1_E_STATEMENT_ALTERED` means the mandated words were edited, and reusing
 * it for "the statement is not there at all" would make the refusal-frequency panel lie
 * about which failure the desk actually has. The nulls are enumerated in
 * `ELEMENTS_WITHOUT_ABSENCE_CODE` and reported as a coverage gap, which is the
 * doctrine's eighth rule applied to the instrument itself: say when it cannot do its job.
 *
 * THE INTEGRATION PASS CLOSED FOUR OF THE FIVE. `ART_7_1_B_WHITE_PAPER_STATEMENT_MISSING`,
 * `ART_7_1_A_OFFEROR_CONTACT_MISSING`, `ART_7_1_E_STATEMENT_MISSING` and
 * `ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING` were added to `types.ts` rather than
 * approximated, so an element that is simply not there now refuses under its own name.
 * Exactly one null remains and it is deliberate; see `fair_clear_not_misleading` below.
 *
 * In practice the Art 7(1)(d)/(e) nulls rarely bite, because on any surface with a
 * character ceiling the arithmetic refuses first with
 * `ART_7_BOILERPLATE_DOES_NOT_FIT`. They bite on a landing page, where the elements
 * fit and simply were not written.
 */
export const ABSENCE_REFUSAL_CODE: Record<MandatoryElement, RefusalCode | null> = {
  identified_as_marketing: 'ART_66_2_NOT_IDENTIFIED_AS_MARKETING',
  /**
   * STAYS NULL, AND THIS IS THE ONE THAT SHOULD. Art 7(1)(b)/Art 66(2)'s "fair, clear
   * and not misleading" is a QUALITY STANDARD, not a component that can be present or
   * absent — there is no span of text whose insertion satisfies it. Its failures are
   * refused by the specific gates (`claimSafety.ts`, the halo-effect rule, the
   * substantiation rules) and giving it an absence code would invite a check that looks
   * for a sentence saying "this is fair and clear", which is the form of compliance
   * theatre this compartment exists to avoid.
   */
  fair_clear_not_misleading: null,
  consistent_with_white_paper: 'ART_7_1_C_INCONSISTENT_WITH_WHITE_PAPER',
  white_paper_published_statement: 'ART_7_1_B_WHITE_PAPER_STATEMENT_MISSING',
  offeror_contact_details: 'ART_7_1_A_OFFEROR_CONTACT_MISSING',
  no_authority_review_statement: 'ART_7_1_E_STATEMENT_MISSING',
  redemption_right_statement: 'ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING',
  risk_warning: 'ART_66_3_RISK_WARNING_MISSING',
  white_paper_hyperlink: 'ART_66_3_WHITE_PAPER_LINK_MISSING',
  regulated_status_of_named_product: 'ESMA_UNREGULATED_PRODUCT_STATUS_MISSING',
  paid_promotion_disclosure: 'UCPD_UNDISCLOSED_PAID_PROMOTION',
  conflict_of_interest_disclosure: 'ART_91_3_C_UNDISCLOSED_HOLDING',
};

/** Elements whose absence has no dedicated refusal code. Derived, never hand-listed. */
export const ELEMENTS_WITHOUT_ABSENCE_CODE: readonly MandatoryElement[] = (
  Object.keys(ABSENCE_REFUSAL_CODE) as MandatoryElement[]
).filter((element) => ABSENCE_REFUSAL_CODE[element] == null);

/**
 * THE MANDATORY ELEMENT THE VOCABULARY COULD NOT NAME — NOW NAMED.
 *
 * Art 29(2): "Marketing communications shall contain a clear and unambiguous statement
 * that the holders of the asset-referenced token have a right of redemption against the
 * issuer at any time" (`mica.txt:1033`). Art 53(2) is the same for e-money tokens and
 * adds "and at par value" (`mica.txt:1589`). Both read from the primary text.
 *
 * `MandatoryElement` had no member for it, so the first version of this file recorded
 * the requirement in a constant and emitted it as a coverage gap — an element list that
 * omits a mandated element is worse than no list, because it reads as complete. The
 * integration pass added `redemption_right_statement` to the vocabulary and
 * `ART_29_2_REDEMPTION_RIGHT_STATEMENT_MISSING` to `RefusalCode`, and
 * `requiredElementsFor` now claims it on `art_promo` (Art 29(2)) and `emt_promo`
 * (Art 53(2)) with the correct citation on each limb.
 *
 * The sentence survives because THE GAP MOVED RATHER THAN CLOSING COMPLETELY: this
 * classifier decides REQUIREMENT, never PRESENCE, and the par-value distinction is a
 * text check no one has written. So the coverage note on every ART/EMT promotion now
 * says what remains unchecked instead of what cannot be expressed.
 */
export const REDEMPTION_RIGHT_STATEMENT_IS_NOT_TEXT_CHECKED =
  'MiCA Art 29(2) (asset-referenced tokens) and Art 53(2) (e-money tokens) require a clear and unambiguous statement of the holder\'s right of redemption against the issuer at any time — and Art 53(2) additionally requires "at par value", which Art 29(2) does not. This classifier requires the element and names the provision; it does not read the artefact, so whether the wording actually carries the par-value limb on an e-money token promotion has NOT been checked here. An EMT promotion whose statement omits "at par value" satisfies Art 29(2) and breaches Art 53(2).';

/**
 * One element, required by named regimes under a named provision. `absenceCode` is
 * carried on the requirement so the gate that CAN see the text does not have to
 * re-derive which refusal to raise.
 */
export interface ElementRequirement {
  readonly element: MandatoryElement;
  readonly requiredBy: readonly MarketingRegime[];
  readonly citation: RuleCitation;
  readonly absenceCode: RefusalCode | null;
  /**
   * True where the element must sit in the visible text before the platform truncates.
   * Commission Guidance 2021/C 526/01 §4.2.6: a disclosure is inadequate where it is
   * "hashtags at the end of a lengthy disclaimer; merely tagging a trader" or where it
   * "requires the consumer to take additional steps (e.g. click on 'read more')".
   */
  readonly mustBeAboveTruncationFold: boolean;
}

const ELEMENT_CITATIONS = {
  art66_2_identify: MICA(
    'Art 66(2)',
    'Crypto-asset service providers shall provide their clients with information that is fair, clear and not misleading, including in marketing communications, which shall be identified as such.',
  ),
  art66_2_not_misleading: MICA(
    'Art 66(2)',
    'Crypto-asset service providers shall not, deliberately or negligently, mislead a client in relation to the real or perceived advantages of any crypto-assets.',
  ),
  art66_3_risk: MICA(
    'Art 66(3)',
    'Crypto-asset service providers shall warn clients of the risks associated with transactions in crypto-assets.',
  ),
  art66_3_whitepaper: MICA(
    'Art 66(3)',
    'Crypto-asset service providers ... shall provide their clients with hyperlinks to any crypto-asset white papers for the crypto-assets in relation to which they are providing those services.',
  ),
  art7_1_a: MICA('Art 7(1)(a)', 'the marketing communications are clearly identifiable as such'),
  art7_1_b: MICA('Art 7(1)(b)', 'the information in the marketing communications is fair, clear and not misleading'),
  art7_1_c: MICA(
    'Art 7(1)(c)',
    'the information in the marketing communications is consistent with the information in the crypto-asset white paper, where such crypto-asset white paper is required pursuant to Article 4 or 5',
  ),
  art29_1_a: MICA('Art 29(1)(a)', 'the marketing communications are clearly identifiable as such'),
  art29_1_b: MICA('Art 29(1)(b)', 'the information in the marketing communications is fair, clear and not misleading'),
  art29_1_c: MICA(
    'Art 29(1)(c)',
    'the information in the marketing communications is consistent with the information in the crypto-asset white paper',
  ),
  art29_1_d: MICA(
    'Art 29(1)(d)',
    'the marketing communications clearly state that a crypto-asset white paper has been published and clearly indicate the address of the website of the issuer of the asset-referenced token, as well as a telephone number and an email address to contact the issuer',
  ),
  art53_1_a: MICA('Art 53(1)(a)', 'the marketing communications are clearly identifiable as such'),
  art53_1_b: MICA('Art 53(1)(b)', 'the information in the marketing communications is fair, clear and not misleading'),
  art53_1_c: MICA(
    'Art 53(1)(c)',
    'the information in the marketing communications is consistent with the information in the crypto-asset white paper',
  ),
  art53_1_d: MICA(
    'Art 53(1)(d)',
    'the marketing communications clearly state that a crypto-asset white paper has been published and clearly indicate the address of the website of the issuer of the e-money token, as well as a telephone number and an email address to contact the issuer',
  ),
  /**
   * The two limbs of the redemption-right statement, quoted from the primary text
   * (`mica.txt:1033` and `mica.txt:1589`). Read directly, not from a summary. Note that
   * Art 53(2) adds "and at par value" and Art 29(2) does not: an EMT promotion that
   * states only a right of redemption "at any time" has not satisfied Art 53(2).
   */
  art29_2: MICA(
    'Art 29(2)',
    'Marketing communications shall contain a clear and unambiguous statement that the holders of the asset-referenced token have a right of redemption against the issuer at any time.',
  ),
  art53_2: MICA(
    'Art 53(2)',
    'Marketing communications shall contain a clear and unambiguous statement that the holders of the e-money token have a right of redemption against the issuer at any time and at par value.',
  ),
  art91_3_c: MICA(
    'Art 91(3)(c)',
    'taking advantage of occasional or regular access to the traditional or electronic media by voicing an opinion about a crypto-asset, while having previously taken positions on that crypto-asset, and profiting subsequently from the impact of the opinions voiced on the price of that crypto-asset, without having simultaneously disclosed that conflict of interest to the public in a proper and effective way',
  ),
  ucpd_annex_i_11: UCPD(
    'Annex I point 11',
    'Using editorial content in the media to promote a product where a trader has paid for the promotion without making that clear in the content or by images or sounds clearly identifiable by the consumer (advertorial).',
  ),
  esma_halo_status: ESMA_HALO(
    'ESMA35-1872330276-2329, DOs',
    'all marketing communications should indicate clearly if a product and/or service offered by a CASP is regulated or not. Such indication should be clearly visible to clients and prospective clients.',
  ),
} as const;

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 ART 7(2) — THE TIMING RULE NO WORDING REVIEW CATCHES                      */
/* ══════════════════════════════════════════════════════════════════════════ */

const ART_7_2_CITATION = MICA(
  'Art 7(2)',
  'Where a crypto-asset white paper is required pursuant to Article 4 or 5, no marketing communications shall be disseminated prior to the publication of the crypto-asset white paper.',
);

const ART_29_6_CITATION = MICA(
  'Art 29(6)',
  'No marketing communications shall be disseminated prior to the publication of the crypto-asset white paper.',
);

/**
 * Compare two ISO-8601 instants. Returns `null` when either is unparseable, and every
 * caller treats `null` as unknown rather than as ordered — a malformed timestamp that
 * silently sorts as epoch-zero would make every white paper look published.
 */
function orderOf(earlier: Instant, later: Instant): -1 | 0 | 1 | null {
  const a = Date.parse(earlier);
  const b = Date.parse(later);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Art 7(2) / Art 29(6) / Art 53(6): no marketing communication before the white paper
 * is published.
 *
 * Breached ON TIMING ALONE. An excited "big listing coming" reply about an asset whose
 * white paper is not out yet infringes however carefully it is worded, which is exactly
 * why this is a timestamp comparison and not a prose check.
 *
 * Returns one refusal per offending asset, so the sentence can name the asset. Only
 * called for assets in a promotional regime — Art 7(2) attaches to marketing
 * communications, not to every mention.
 */
export function whitePaperTimingRefusals(
  assets: readonly AssetFact[],
  regimeByAsset: ReadonlyMap<AssetSymbol, MarketingRegime>,
  at: Instant,
): readonly Refusal[] {
  const out: Refusal[] = [];
  for (const fact of assets) {
    const regime = regimeByAsset.get(fact.asset);
    if (regime == null) continue;
    const citation = regime === 'offer_promo' ? ART_7_2_CITATION : ART_29_6_CITATION;

    switch (fact.whitePaper.kind) {
      case 'not_required':
      case 'published':
        break;
      case 'required_not_published':
        out.push(
          refuse(
            'ART_7_2_WHITE_PAPER_NOT_PUBLISHED',
            `A white paper is required for ${fact.asset} and has not been published, so no marketing communication about it may be disseminated yet. This is a timing infringement: no wording fixes it.`,
            citation,
            {
              kind: 'wait_until',
              condition: `the crypto-asset white paper for ${fact.asset} is published`,
            },
            fact.asset,
          ),
        );
        break;
      case 'unknown':
        out.push(
          refuse(
            'ASSET_STATE_UNKNOWN',
            `This instrument does not know whether a white paper is required for ${fact.asset} or whether it has been published, and Art 7(2) turns on exactly that. It will not guess on a rule that is breached by timing alone.`,
            citation,
            {
              kind: 'supply_data',
              missing: `whether a crypto-asset white paper is required for ${fact.asset} under Art 4 or 5, and its publication timestamp if so`,
              whoCanSupply: 'the listings desk, from the asset onboarding record',
            },
            fact.asset,
          ),
        );
        break;
    }

    if (fact.whitePaper.kind === 'published') {
      const order = orderOf(at, fact.whitePaper.publishedAt);
      if (order === null) {
        out.push(
          refuse(
            'ASSET_STATE_UNKNOWN',
            `The white-paper publication timestamp recorded for ${fact.asset} cannot be read as an instant, so this instrument cannot tell whether this item pre-dates it.`,
            citation,
            {
              kind: 'supply_data',
              missing: `a valid ISO-8601 publication instant for the ${fact.asset} white paper (recorded value: ${fact.whitePaper.publishedAt})`,
              whoCanSupply: 'the listings desk',
            },
            fact.asset,
          ),
        );
      } else if (order === -1) {
        out.push(
          refuse(
            'ART_7_2_WHITE_PAPER_NOT_PUBLISHED',
            `This item is dated ${at}, before the ${fact.asset} white paper was published at ${fact.whitePaper.publishedAt}. A marketing communication disseminated before publication infringes on timing alone.`,
            citation,
            {
              kind: 'wait_until',
              condition: `${fact.whitePaper.publishedAt}, when the ${fact.asset} white paper was published`,
            },
            fact.asset,
          ),
        );
      }
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 ART 88(1) — ONE ARTEFACT MAY NOT BE BOTH THE DISCLOSURE AND THE ADVERT     */
/* ══════════════════════════════════════════════════════════════════════════ */

const ART_88_1_CITATION = MICA(
  'Art 88(1)',
  'Issuers, offerors and persons seeking admission to trading shall not combine the disclosure of inside information to the public with the marketing of their activities.',
);

/**
 * The rule almost nobody implements, and the one a celebratory listing post breaches by
 * construction.
 *
 * A single post that both reveals an unannounced listing and sells the platform is two
 * legally distinct acts in one artefact: the Art 88(1) disclosure, which must be posted
 * and maintained on the website for at least five years, and the marketing of LCX's
 * activities. The Regulation says they may not be combined. Splitting them is trivial
 * and free — and nobody does it, because the celebratory post is the natural shape.
 *
 * The detection is deliberately structural rather than lexical. It asks two questions
 * this module already has answers to: *is this artefact the disclosure* (an asset
 * treated as `discloses_non_public`, or the purpose declared as
 * `inside_information_disclosure`) and *does the same artefact market LCX* (a
 * promotional regime, a promotional purpose, or a first-party link). Both true is the
 * refusal. No sentiment reading, no keyword list, nothing an author can rephrase past.
 *
 * `not_recoverable` by edit, and `different_surface` is the honest recovery: the fix is
 * two artefacts, not better words.
 */
export function art88CombinationRefusal(
  input: RegimeInput,
  isMarketingCommunication: boolean,
): Refusal | null {
  const disclosingAssets = input.assets
    .filter((a) => a.treatment === 'discloses_non_public')
    .map((a) => a.asset);
  const isDisclosure =
    disclosingAssets.length > 0 || input.purpose === 'inside_information_disclosure';
  if (!isDisclosure) return null;

  const promotionalPurpose =
    input.purpose === 'product_promotion' ||
    input.purpose === 'offer_or_listing_promotion' ||
    input.purpose === 'campaign_or_giveaway' ||
    input.purpose === 'partner_amplification';
  const promotesAnAsset = input.assets.some((a) =>
    PROMOTIONAL_TREATMENTS.includes(a.treatment),
  );
  const marketsLcx =
    promotionalPurpose ||
    promotesAnAsset ||
    input.firstPartyLinkPresent ||
    input.citesOwnRegulatoryStatus ||
    (isMarketingCommunication && input.purpose !== 'inside_information_disclosure');
  if (!marketsLcx) return null;

  const why: string[] = [];
  if (promotionalPurpose) why.push(`its declared purpose is ${input.purpose.replace(/_/g, ' ')}`);
  if (promotesAnAsset) why.push('it promotes trading in, or an offer of, a named asset');
  if (input.firstPartyLinkPresent) why.push('it carries a first-party link or CTA');
  if (input.citesOwnRegulatoryStatus) why.push("it invokes LCX's own regulated status");
  if (why.length === 0) why.push('it is classified as a marketing communication');

  const subject =
    disclosingAssets.length > 0
      ? `inside information about ${disclosingAssets.join(', ')}`
      : 'inside information';

  return refuse(
    'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING',
    `This one artefact both discloses ${subject} and markets LCX (${why.join('; ')}). Art 88(1) prohibits combining the two. Publish the disclosure on its own, and the promotion as a separate artefact afterwards.`,
    ART_88_1_CITATION,
    {
      kind: 'different_surface',
      suggestion:
        'Split it in two: a bare disclosure with no promotional framing, no link and no reference to LCX\'s regulated status — posted and maintained on the website for at least five years as Art 88(1) requires — and, separately, the marketing post.',
    },
    disclosingAssets.length > 0 ? disclosingAssets.join(', ') : null,
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 ART 66(2) — NEGLIGENCE IS ENOUGH, WHICH CHANGES WHAT THE DESK RECORDS      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The fault standard, as a constant, because it is the single most consequential word
 * in Art 66(2) and it is routinely read as if it said "deliberately".
 *
 * "Crypto-asset service providers shall not, **deliberately or negligently**, mislead a
 * client in relation to the real or perceived advantages of any crypto-assets."
 *
 * WHAT NEGLIGENCE-SUFFICES CHANGES, and it is a record-keeping consequence rather than
 * a drafting one:
 *
 *  - "We did not intend to mislead" is not a defence. Intent is one of two routes to
 *    liability, not the gate.
 *  - So the defensible position is not "we meant well" but "here is the check we made
 *    before we said it". Absence of a check is the fault element itself.
 *  - Which means an unsubstantiated advantage claim is not a drafting weakness to be
 *    tidied later. At the moment of publication it is the breach, and the record must
 *    show substantiation existed BEFORE, naming the source, the colleague who verified
 *    it and when.
 *  - And it is why superlatives are the characteristic failure of a fast reply: a
 *    30-second answer reaches for "lowest fees" precisely because checking is slow.
 */
export const ART_66_2_FAULT_STANDARD = 'deliberately_or_negligently' as const;

export const ART_66_2_NEGLIGENCE_NOTE =
  'Art 66(2) is breached deliberately OR NEGLIGENTLY. So "we did not mean to mislead" is not a defence, and the record the desk must keep is not its intention but the check it made: for every claim about the advantages of a crypto-asset, the source relied on, the colleague who verified it, and when. An advantage claim with no recorded check is not an untidy draft — at the moment of publication it is the fault element.';

/**
 * What the negligence standard obliges the desk to hold, per advantage claim. Rendered
 * on the panel so the obligation is visible before the claim is written rather than
 * after it is challenged.
 */
export const ART_66_2_RECORD_OBLIGATIONS: readonly string[] = [
  'the source relied on for the advantage asserted, identifiable by someone who was not in the room',
  'the named colleague who verified it against that source',
  'the instant the verification happened, which must precede publication',
  'the claim as published, so the record can be read against what the audience saw',
];

/**
 * Refuse a declared advantage claim that carries no substantiation.
 *
 * This module does not FIND superlatives — that is lexical and it belongs to the claim
 * gate. It refuses the ones the desk has declared and left unsubstantiated, which is
 * the half of the problem that survives a perfect detector: the desk knew it was making
 * an advantage claim and shipped it without the check.
 */
export function unsubstantiatedAdvantageRefusals(
  claims: readonly AdvantageClaim[],
): readonly Refusal[] {
  return claims
    .filter((claim) => claim.substantiation == null)
    .map((claim) =>
      refuse(
        'ART_66_2_UNSUBSTANTIATED_SUPERLATIVE',
        `This item asserts an advantage — "${claim.text}" — with no recorded source, verifier or verification time. Art 66(2) is breached negligently as well as deliberately, so an unchecked advantage claim is the breach, not a loose end.`,
        ELEMENT_CITATIONS.art66_2_not_misleading,
        {
          kind: 'supply_data',
          missing: ART_66_2_RECORD_OBLIGATIONS.join('; '),
          whoCanSupply: 'whoever can point at the source the claim rests on, before it is published',
        },
        claim.text,
      ),
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §7 COVERAGE — THE AXES THIS CLASSIFICATION DID NOT ASSESS                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * An axis the classification could not reach. Reported on every decision, because a
 * regime set that is silent about what it did not look at reads as a regime set that
 * looked at everything.
 */
export type CoverageAxis =
  | 'advice_personalisation_not_assessed'
  | 'title_vi_venues_beyond_lcx'
  | 'authorised_service_list_absent'
  | 'holdings_register_not_joined'
  | 'embargo_register_not_joined'
  | 'element_presence_not_checked'
  | 'redemption_right_statement_wording_not_checked'
  | 'element_absence_has_no_refusal_code'
  | 'national_gambling_law_not_assessed'
  | 'non_eea_regimes_not_assessed';

export interface CoverageGap {
  readonly axis: CoverageAxis;
  /** One sentence naming what was not assessed and what follows from that. */
  readonly sentence: string;
}

/**
 * Art 86(3): "This Title shall apply to actions and omissions, in the Union and in
 * third countries." Stated as a constant because the instinct it contradicts is
 * universal — that a post from a non-EU staffer, or aimed at a non-EU audience, is
 * outside the market-abuse rules. It is not. The geographic reach attaches to the ACT,
 * not to the asset and not to the audience.
 */
export const GEOGRAPHY_IS_NOT_A_DEFENCE =
  'MiCA Title VI applies to acts by any person, on or off a trading platform, in the Union and in third countries (Art 86). Where the author sits and where the audience sits change nothing. The only scope question is whether the asset is admitted to trading, or has a pending admission request, anywhere.';

/** Non-EEA regimes the research did not verify, named so they can be excluded rather than assumed cleared. */
export const NON_EEA_REGIMES_NOT_ASSESSED =
  'The UK financial-promotions regime (criminal in character for unauthorised cryptoasset promotions) and US federal and state rules were not verified by the research behind these rules. This classifier does not assess them. Excluding a jurisdiction is a factual claim about who could see the item, and it must be evidenced, not asserted.';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §8 THE CLASSIFIER                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

const ART_66_2_BASELINE_CITATION = ELEMENT_CITATIONS.art66_2_identify;

const ART_7_1_CITATION = MICA(
  'Art 7(1)',
  'Any marketing communications relating to an offer to the public of a crypto-asset other than an asset-referenced token or e-money token, or to the admission to trading of such crypto-asset, shall comply with all of the following requirements ... Where the marketing communication is prepared by the person seeking admission to trading or the operator of a trading platform, then, instead of "offeror", a reference to "person seeking admission to trading" or "operator of the trading platform" shall be included in the statement.',
);

const ART_29_1_CITATION = MICA(
  'Art 29(1)',
  'Any marketing communications relating to an offer to the public of an asset-referenced token, or to the admission to trading of such asset-referenced token, shall comply with all of the following requirements.',
);

const ART_53_1_CITATION = MICA(
  'Art 53(1)',
  'Marketing communications relating to an offer to the public of an e-money token, or to the admission to trading of such e-money token, shall comply with all the following requirements.',
);

const ART_86_CITATION = MICA(
  'Art 86(1)-(3)',
  'This Title shall apply to acts carried out by any person concerning crypto-assets that are admitted to trading or in respect of which a request for admission to trading has been made ... irrespective of whether such transaction, order or behaviour takes place on a trading platform ... in the Union and in third countries.',
);

const ART_4_3_CITATION = MICA(
  'Art 4(3), second subparagraph',
  'a crypto-asset shall not be considered to be offered for free where purchasers are required to provide, or to undertake to provide, personal data to the offeror in exchange for that crypto-asset, or where the offeror ... receives from prospective holders ... any fees, commissions, or monetary or non-monetary benefits in exchange for that crypto-asset',
);

const ART_4_4_CITATION = MICA(
  'Art 4(4)',
  "The exemptions listed in paragraphs 2 and 3 shall not apply where the offeror, or another person acting on the offeror's behalf, makes known in any communication its intention to seek admission to trading of a crypto-asset other than an asset-referenced token or e-money token.",
);

const ART_90_1_CITATION = MICA(
  'Art 90(1)',
  'No person in possession of inside information shall unlawfully disclose inside information to any other person, except where such disclosure is made in the normal exercise of an employment, a profession or duties.',
);

const ART_81_CITATION = MICA(
  'Art 81(1)-(2) with Art 3(1)',
  "'providing advice on crypto-assets' means offering, giving or agreeing to give personalised recommendations to a client ... in respect of one or more transactions relating to crypto-assets, or the use of crypto-asset services; and the provider shall assess whether the crypto-asset services or crypto-assets are suitable ... and shall, in good time before providing advice, inform the prospective client whether the advice is independent.",
);

const UCPD_ANNEX_I_22_CITATION = UCPD(
  'Annex I point 22',
  'Falsely claiming or creating the impression that the trader is not acting for purposes relating to his trade, business, craft or profession, or falsely representing oneself as a consumer.',
);

const UCPD_GUIDANCE_CONSIDERATION_CITATION = UCPD_GUIDANCE(
  '2021/C 526/01 §4.2.6',
  'The commercial element is considered to be present whenever the influencer receives any form of consideration for the endorsement, including in case of payment, discounts, partnership arrangements, percentage from affiliate links, free products (including unsolicited gifts), trips or event invitations etc. The presence of a contract and monetary payment is not necessary to trigger the application of these rules.',
);

const ESMA_HALO_PROMOTIONAL_TOOL_CITATION = ESMA_HALO(
  'ESMA35-1872330276-2329, DON\'Ts',
  "The CASP's regulatory status is used as a promotional tool. When engaging in unregulated activities, information provided to the client or potential client, including marketing materials and other documentation, includes a reference to the CASP being authorised/regulated by an NCA.",
);

const ESMA_GL1_17_CITATION = ESMA_REVERSE_SOLICITATION(
  'ESMA35-1872330276-1899, Guideline 1 para 17',
  'Educational materials, trainings, and industry events that are purely educational ... should not be considered solicitation. [They] would be considered as having the effect to directly or indirectly promote the ... crypto-asset services ... when, for example, the audience is directed to the [firm]\'s website.',
);

/** Purposes that are a promotion of LCX or its products on their face. */
const PROMOTIONAL_PURPOSES: readonly ItemPurpose[] = [
  'product_promotion',
  'offer_or_listing_promotion',
  'campaign_or_giveaway',
  'partner_amplification',
] as const;

/**
 * Whether the item is a marketing communication, and why.
 *
 * Three routes in, and the third is the cheap one worth stating out loud: an item whose
 * purpose is educational or a support answer becomes a marketing communication the
 * moment it carries a first-party link. ESMA's reverse-solicitation guideline says
 * education becomes promotion once "the audience is directed to the [firm]'s website".
 * That guideline formally addresses third-country firms, so this is an analogy, and it
 * is recorded as one — but it is the supervisor's own line-drawing and the honest
 * operational reading is that the safe answer is often the answer without the link.
 */
export function marketingCommunicationCharacter(input: RegimeInput): {
  readonly is: boolean;
  readonly basis: string;
  readonly citation: RuleCitation;
} {
  if (PROMOTIONAL_PURPOSES.includes(input.purpose)) {
    return {
      is: true,
      basis: `The desk declared this item's purpose as ${input.purpose.replace(/_/g, ' ')}.`,
      citation: ART_66_2_BASELINE_CITATION,
    };
  }
  const promoted = input.assets.filter((a) => PROMOTIONAL_TREATMENTS.includes(a.treatment));
  if (promoted.length > 0) {
    return {
      is: true,
      basis: `It promotes trading in, or an offer of, ${promoted.map((a) => a.asset).join(', ')}.`,
      citation: ART_66_2_BASELINE_CITATION,
    };
  }
  if (input.firstPartyLinkPresent) {
    return {
      is: true,
      basis:
        'It carries a first-party link or CTA, which directs the audience to LCX and converts an educational or supportive item into a promotion.',
      citation: ESMA_GL1_17_CITATION,
    };
  }
  if (input.citesOwnRegulatoryStatus) {
    return {
      is: true,
      basis: "It invokes LCX's own regulated status, which is a promotional use of that status.",
      citation: ESMA_HALO_PROMOTIONAL_TOOL_CITATION,
    };
  }
  return {
    is: false,
    basis:
      'No promotional purpose, no promoted asset, no first-party link and no appeal to regulated status. Art 66(2) still applies to it as information given to clients and prospective clients; the identify-as-marketing duty does not.',
    citation: ART_66_2_BASELINE_CITATION,
  };
}

/** One (regime, citation) pair claiming an element. Merged by `requiredElementsFor`. */
interface ElementClaim {
  readonly element: MandatoryElement;
  readonly regime: MarketingRegime;
  readonly citation: RuleCitation;
  readonly mustBeAboveTruncationFold?: boolean;
}

/**
 * Which elements the assigned regimes require. The UNION, never a winner — the whole
 * reason `RegimeSet` is a set.
 *
 * Ordering is by `MARKETING_REGIMES` and then by first claim, so two runs over the same
 * input produce the same list in the same order. An unstable order in a checklist three
 * colleagues are reading is a source of disagreement about what was required.
 */
export function requiredElementsFor(args: {
  readonly regimes: RegimeSet;
  readonly isMarketingCommunication: boolean;
  readonly concernsCryptoAssetTransactions: boolean;
  readonly providesServiceInRelationToNamedAsset: boolean;
  readonly whitePaperRequiredForPromotedAsset: boolean;
  readonly anyDeclaredHolding: boolean;
  readonly anyUnregulatedProductNamed: boolean;
}): readonly ElementRequirement[] {
  const claims: ElementClaim[] = [];
  const has = (regime: MarketingRegime): boolean => args.regimes.includes(regime);

  if (has('casp_conduct')) {
    claims.push({
      element: 'fair_clear_not_misleading',
      regime: 'casp_conduct',
      citation: ELEMENT_CITATIONS.art66_2_not_misleading,
    });
    if (args.isMarketingCommunication) {
      claims.push({
        element: 'identified_as_marketing',
        regime: 'casp_conduct',
        citation: ELEMENT_CITATIONS.art66_2_identify,
      });
    }
    if (args.concernsCryptoAssetTransactions) {
      claims.push({
        element: 'risk_warning',
        regime: 'casp_conduct',
        citation: ELEMENT_CITATIONS.art66_3_risk,
      });
    }
    if (args.providesServiceInRelationToNamedAsset) {
      claims.push({
        element: 'white_paper_hyperlink',
        regime: 'casp_conduct',
        citation: ELEMENT_CITATIONS.art66_3_whitepaper,
      });
    }
  }

  if (has('offer_promo')) {
    claims.push({ element: 'identified_as_marketing', regime: 'offer_promo', citation: ELEMENT_CITATIONS.art7_1_a });
    claims.push({ element: 'fair_clear_not_misleading', regime: 'offer_promo', citation: ELEMENT_CITATIONS.art7_1_b });
    if (args.whitePaperRequiredForPromotedAsset) {
      claims.push({
        element: 'consistent_with_white_paper',
        regime: 'offer_promo',
        citation: ELEMENT_CITATIONS.art7_1_c,
      });
    }
    for (const element of ART_7_1_D_ELEMENTS) {
      claims.push({ element, regime: 'offer_promo', citation: ART_7_1_D_CITATION });
    }
    claims.push({
      element: 'no_authority_review_statement',
      regime: 'offer_promo',
      citation: ART_7_1_E_CITATION,
    });
  }

  if (has('art_promo')) {
    claims.push({ element: 'identified_as_marketing', regime: 'art_promo', citation: ELEMENT_CITATIONS.art29_1_a });
    claims.push({ element: 'fair_clear_not_misleading', regime: 'art_promo', citation: ELEMENT_CITATIONS.art29_1_b });
    claims.push({ element: 'consistent_with_white_paper', regime: 'art_promo', citation: ELEMENT_CITATIONS.art29_1_c });
    for (const element of ART_7_1_D_ELEMENTS) {
      claims.push({ element, regime: 'art_promo', citation: ELEMENT_CITATIONS.art29_1_d });
    }
    // Art 29(2). Unconditional: it attaches to the marketing communication itself, not
    // to whether a white paper was required, so there is no `args` flag to gate it on.
    claims.push({
      element: 'redemption_right_statement',
      regime: 'art_promo',
      citation: ELEMENT_CITATIONS.art29_2,
    });
  }

  if (has('emt_promo')) {
    claims.push({ element: 'identified_as_marketing', regime: 'emt_promo', citation: ELEMENT_CITATIONS.art53_1_a });
    claims.push({ element: 'fair_clear_not_misleading', regime: 'emt_promo', citation: ELEMENT_CITATIONS.art53_1_b });
    claims.push({ element: 'consistent_with_white_paper', regime: 'emt_promo', citation: ELEMENT_CITATIONS.art53_1_c });
    for (const element of ART_7_1_D_ELEMENTS) {
      claims.push({ element, regime: 'emt_promo', citation: ELEMENT_CITATIONS.art53_1_d });
    }
    // Art 53(2). Same element, DIFFERENT citation from the ART limb, because Art 53(2)
    // requires "at any time and at par value" and Art 29(2) does not mention par value.
    // The element is one; the text that satisfies it is not.
    claims.push({
      element: 'redemption_right_statement',
      regime: 'emt_promo',
      citation: ELEMENT_CITATIONS.art53_2,
    });
  }

  if (has('market_abuse') && args.anyDeclaredHolding) {
    claims.push({
      element: 'conflict_of_interest_disclosure',
      regime: 'market_abuse',
      citation: ELEMENT_CITATIONS.art91_3_c,
      mustBeAboveTruncationFold: true,
    });
  }

  if (has('ucpd_paid_promotion')) {
    claims.push({
      element: 'paid_promotion_disclosure',
      regime: 'ucpd_paid_promotion',
      citation: ELEMENT_CITATIONS.ucpd_annex_i_11,
      mustBeAboveTruncationFold: true,
    });
  }

  if (args.anyUnregulatedProductNamed) {
    claims.push({
      element: 'regulated_status_of_named_product',
      regime: 'casp_conduct',
      citation: ELEMENT_CITATIONS.esma_halo_status,
      mustBeAboveTruncationFold: true,
    });
  }

  const order = (regime: MarketingRegime): number => MARKETING_REGIMES.indexOf(regime);
  const merged = new Map<MandatoryElement, ElementRequirement>();
  const firstSeen: MandatoryElement[] = [];
  for (const claim of [...claims].sort((a, b) => order(a.regime) - order(b.regime))) {
    const existing = merged.get(claim.element);
    if (existing == null) {
      firstSeen.push(claim.element);
      merged.set(claim.element, {
        element: claim.element,
        requiredBy: [claim.regime],
        citation: claim.citation,
        absenceCode: ABSENCE_REFUSAL_CODE[claim.element],
        mustBeAboveTruncationFold: claim.mustBeAboveTruncationFold === true,
      });
      continue;
    }
    merged.set(claim.element, {
      ...existing,
      requiredBy: existing.requiredBy.includes(claim.regime)
        ? existing.requiredBy
        : [...existing.requiredBy, claim.regime],
      mustBeAboveTruncationFold:
        existing.mustBeAboveTruncationFold || claim.mustBeAboveTruncationFold === true,
    });
  }
  return firstSeen.map((element) => merged.get(element)!);
}

/**
 * Everything the classifier decided, and everything it could not.
 *
 * `classification` is the snapshot shape the record stores (`RegimeClassification` in
 * `types.ts`), so an approval can denormalise it verbatim rather than keeping a pointer
 * that resolves to today's answer to yesterday's question.
 */
export interface RegimeDecision {
  readonly classification: RegimeClassification;
  readonly isMarketingCommunication: boolean;
  readonly marketingCommunicationBasis: string;
  readonly requiredElements: readonly ElementRequirement[];
  /** The character arithmetic, when a promotional regime applies. `null` otherwise. */
  readonly art7: Art7Budget | null;
  readonly refusals: readonly Refusal[];
  readonly coverage: readonly CoverageGap[];
  /**
   * Regimes a machine may not settle alone. `RegimeAssignment.decidedBy` records who
   * ran the classifier; for `advice` and `market_abuse` the consequences are personal
   * and criminal-adjacent, so the assignment needs a named human to confirm it.
   */
  readonly requiresHumanConfirmation: readonly MarketingRegime[];
  readonly faultStandard: typeof ART_66_2_FAULT_STANDARD;
  readonly ruleSetVersion: number;
}

/** Regimes whose assignment a machine may not settle by itself. */
export const REGIMES_REQUIRING_HUMAN_CONFIRMATION: readonly MarketingRegime[] = [
  'market_abuse',
  'advice',
] as const;

/**
 * DECIDE WHICH LAW BITES. Deterministic, total, and pure.
 *
 * Reading order inside the function is the reading order of the risk: the Art 66 floor,
 * then the promotional regimes per asset (which is where an unknown asset kind refuses
 * rather than guesses), then Title VI, then the UCPD, then advice, then the halo
 * effect, then the four cross-cutting refusals — Art 4(4), Art 90, Art 88(1) and
 * Art 7(2) — then the arithmetic, then the element union, then what was not assessed.
 *
 * Every refusal it returns carries its own rule and its own recovery, and the
 * arithmetic's refusal is the same object `art7Budget` produced, so the number on screen
 * and the number in the refusal cannot drift apart.
 */
export function classifyRegimes(input: RegimeInput): RegimeDecision {
  const assignments: RegimeAssignment[] = [];
  const refusals: Refusal[] = [];
  const coverage: CoverageGap[] = [];
  const channel = input.channel ?? SURFACE_CHANNEL[input.surface];
  const mc = marketingCommunicationCharacter(input);

  const assign = (regime: MarketingRegime, basis: string, citation: RuleCitation): void => {
    assignments.push({
      regime,
      basis,
      citation,
      decidedBy: input.decidedBy,
      decidedAt: input.at,
    });
  };

  /* ── The floor. Art 66(2) attaches to every public statement, always. ── */
  assign(
    'casp_conduct',
    mc.is
      ? `Art 66(2) applies to every statement LCX makes to clients and prospective clients, and this one is a marketing communication: ${mc.basis}`
      : `Art 66(2) applies to every statement LCX makes to clients and prospective clients. ${mc.basis}`,
    ART_66_2_BASELINE_CITATION,
  );

  /* ── Promotional regimes, decided PER ASSET because the mandated text differs. ── */
  const regimeByAsset = new Map<AssetSymbol, MarketingRegime>();
  const giveawayIsNotFree =
    input.purpose === 'campaign_or_giveaway' && input.giveawayRequiresPersonalDataOrBenefit === true;

  if (
    input.purpose === 'campaign_or_giveaway' &&
    (input.giveawayRequiresPersonalDataOrBenefit == null ||
      input.giveawayRequiresPersonalDataOrBenefit === 'unknown')
  ) {
    refusals.push(
      refuse(
        'ASSET_STATE_UNKNOWN',
        'This is a campaign or giveaway and this instrument has not been told whether entry requires personal data or confers any benefit on LCX. Art 4(3) says an asset is not offered for free in either case, which strips the Title II exemption and makes these posts Art 7 marketing communications — so the answer decides which mandatory text is required.',
        ART_4_3_CITATION,
        {
          kind: 'supply_data',
          missing:
            'whether entry requires personal data (an email address or a wallet address tied to an identity counts) or confers a monetary or non-monetary benefit on LCX (a follow, a repost, a Discord join)',
          whoCanSupply: 'whoever wrote the campaign mechanics',
        },
      ),
    );
  }

  for (const fact of input.assets) {
    const promotional = PROMOTIONAL_TREATMENTS.includes(fact.treatment) || giveawayIsNotFree;
    if (!promotional) continue;

    switch (fact.kind) {
      case 'other_crypto_asset': {
        regimeByAsset.set(fact.asset, 'offer_promo');
        const basis = giveawayIsNotFree
          ? `The campaign requires personal data or confers a benefit on LCX, so ${fact.asset} is not offered for free (Art 4(3)) and the Title II exemption falls away — this is an Art 7 marketing communication.`
          : `It relates to ${fact.treatment === 'promotes_offer' ? 'an offer to the public' : 'the admission to trading'} of ${fact.asset}, and Art 7(1) catches the operator of the trading platform, not only the offeror.`;
        assign('offer_promo', basis, giveawayIsNotFree ? ART_4_3_CITATION : ART_7_1_CITATION);
        break;
      }
      case 'asset_referenced_token': {
        if (fact.lcxActsForIssuer) {
          regimeByAsset.set(fact.asset, 'art_promo');
          assign(
            'art_promo',
            `${fact.asset} is an asset-referenced token and LCX is the issuer or is promoting it on the issuer's behalf, so Art 29 applies rather than Art 7.`,
            ART_29_1_CITATION,
          );
        }
        break;
      }
      case 'e_money_token': {
        if (fact.lcxActsForIssuer) {
          regimeByAsset.set(fact.asset, 'emt_promo');
          assign(
            'emt_promo',
            `${fact.asset} is an e-money token and LCX is the issuer or is promoting it on the issuer's behalf, so Art 53 applies rather than Art 7.`,
            ART_53_1_CITATION,
          );
        }
        break;
      }
      case 'unknown': {
        refusals.push(
          refuse(
            'ASSET_STATE_UNKNOWN',
            `This item promotes ${fact.asset} and this instrument does not know whether it is a plain crypto-asset, an asset-referenced token or an e-money token. Art 7, Art 29 and Art 53 mandate different text — only Art 7 carries the "not reviewed or approved" statement, only Art 29 and Art 53 carry the redemption-right statement — so there is no safe superset to fall back to.`,
            MICA(
              'Art 7(1), Art 29(1)-(2), Art 53(1)-(2)',
              'Three separate marketing-communication regimes with different mandatory elements, selected by whether the crypto-asset is an asset-referenced token, an e-money token, or neither.',
            ),
            {
              kind: 'supply_data',
              missing: `the MiCA classification of ${fact.asset}: asset-referenced token, e-money token, or another crypto-asset`,
              whoCanSupply: 'the listings desk, from the asset onboarding record',
            },
            fact.asset,
          ),
        );
        break;
      }
    }
  }

  /* ── Title VI. Unknown state WIDENS the set; it never clears it. ── */
  let titleViVenueGapNoted = false;
  for (const fact of input.assets) {
    if (fact.lcxAdmission === 'admitted' || fact.lcxAdmission === 'admission_requested') {
      assign(
        'market_abuse',
        `${fact.asset} is ${fact.lcxAdmission === 'admitted' ? 'admitted to trading' : 'the subject of a pending admission request'} on LCX, so Title VI applies to anything said about it by any person, on or off a platform, in the Union or a third country.`,
        ART_86_CITATION,
      );
      continue;
    }
    if (fact.lcxAdmission === 'unknown' || fact.admittedOnAnotherVenue === 'unknown') {
      assign(
        'market_abuse',
        `Title VI cannot be excluded for ${fact.asset}: ${fact.lcxAdmission === 'unknown' ? "its admission state on LCX is unknown" : 'it is not on LCX but whether it is admitted elsewhere is unknown'}. Art 86(1) is not limited to LCX's own platform, so the wider regime is assumed rather than the narrower one.`,
        ART_86_CITATION,
      );
      if (!titleViVenueGapNoted) {
        titleViVenueGapNoted = true;
        coverage.push({
          axis: 'title_vi_venues_beyond_lcx',
          sentence: `Title VI was assumed to apply because admission state could not be established for ${fact.asset}. ${GEOGRAPHY_IS_NOT_A_DEFENCE}`,
        });
      }
      continue;
    }
    if (fact.admittedOnAnotherVenue === true) {
      assign(
        'market_abuse',
        `${fact.asset} is not on LCX but is admitted to trading, or has a pending admission request, on another venue. Art 86(1) is venue-agnostic.`,
        ART_86_CITATION,
      );
    }
  }

  /* ── UCPD. Consideration of ANY kind, and the staff-personal-account trap. ── */
  const thirdPartyInvolved =
    input.purpose === 'partner_amplification' || input.targetBody != null;
  if (input.consideration !== 'none' && input.consideration !== 'unknown') {
    assign(
      'ucpd_paid_promotion',
      `Consideration of kind "${input.consideration.replace(/_/g, ' ')}" passed, and the commercial element is present whenever consideration of any form is received — a contract and a monetary payment are not necessary.`,
      UCPD_GUIDANCE_CONSIDERATION_CITATION,
    );
  } else if (input.consideration === 'unknown' && thirdPartyInvolved) {
    assign(
      'ucpd_paid_promotion',
      'Whether consideration passed is unknown and a third party is involved, so the disclosure regime is assumed to apply rather than excluded.',
      UCPD_GUIDANCE_CONSIDERATION_CITATION,
    );
    refusals.push(
      refuse(
        'PARTNER_CONSIDERATION_UNKNOWN',
        'This instrument does not know whether any consideration passed between LCX and this account or asset. A comped ticket, an airdropped allocation, a fee waiver or a referral code all count, and re-posting a partner\'s unlabelled promotion makes the infringement LCX\'s.',
        UCPD_GUIDANCE_CONSIDERATION_CITATION,
        {
          kind: 'supply_data',
          missing: 'the consideration kind for this account or asset, from the partner register',
          whoCanSupply: 'whoever holds the partner and consideration register',
        },
      ),
    );
  }

  if (input.authorAccount === 'staff_personal' && mc.is) {
    assign(
      'ucpd_paid_promotion',
      'A member of staff is promoting LCX from a personal account, which engages the per-se prohibition on falsely representing oneself as a consumer unless the relationship is disclosed.',
      UCPD_ANNEX_I_22_CITATION,
    );
    if (!input.employmentRelationshipDisclosed) {
      refusals.push(
        refuse(
          'UCPD_STAFF_POSING_AS_CONSUMER',
          'This promotes LCX from a staff personal account without stating the LCX relationship in the visible text. Annex I point 22 is unfair in all circumstances — there is no materiality test and no need to prove harm.',
          UCPD_ANNEX_I_22_CITATION,
          {
            kind: 'edit_text',
            what: 'state the LCX relationship in the visible text, before any truncation, or post it from the official account instead',
          },
        ),
      );
    }
  }

  /* ── Advice. Reached by personalisation, not by topic; and it cannot be cured. ── */
  if (input.personalisation == null) {
    coverage.push({
      axis: 'advice_personalisation_not_assessed',
      sentence:
        'No personalisation finding was supplied, so the Art 81 advice axis was not assessed. Absence of a finding is not a finding of no advice; the claim gate must run before this classification is relied on.',
    });
  } else if (input.personalisation.personalised) {
    assign(
      'advice',
      `The claim gate found a personalised recommendation (${input.personalisation.basis}, per ${input.personalisation.foundBy}). Advice is reached by personalisation, not by topic.`,
      ART_81_CITATION,
    );
    refusals.push(
      refuse(
        'ART_81_PERSONALISED_RECOMMENDATION',
        'This is a personalised recommendation about a transaction in crypto-assets, which is the regulated service of providing advice. It cannot be made compliant in a public reply: Art 81(1) requires a suitability assessment of a person whose circumstances you do not know, and Art 81(2) requires disclosure "in good time before" the advice, which is impossible inside the advice itself. Adding "not financial advice" changes nothing, because the definition turns on what was done.',
        ART_81_CITATION,
        {
          kind: 'not_recoverable',
          why: 'A public reply structurally cannot satisfy the Art 81 preconditions, and a disclaimer has no effect on the legal characterisation. Answer generically, or point to a help article, or do not answer.',
        },
        input.personalisation.basis,
      ),
    );
    if (input.authorisedServices == null) {
      refusals.push(
        refuse(
          'AUTHORISED_SERVICE_LIST_ABSENT',
          "This item is advice, and this instrument has not been given LCX's authorised service list — so it cannot tell you whether this is a conduct breach of Art 81 or the provision of a crypto-asset service LCX is not authorised for, which is a different order of problem.",
          MICA(
            'Art 63 with Annex I',
            'A crypto-asset service provider is authorised for named services; providing advice on crypto-assets is one of them and it is not implied by any other.',
          ),
          {
            kind: 'supply_data',
            missing: "the Annex I services on LCX's MiCAR authorisation, read off the authorisation itself",
            whoCanSupply: 'the owner and legal, from the FMA authorisation',
          },
        ),
      );
      coverage.push({
        axis: 'authorised_service_list_absent',
        sentence:
          "LCX's authorised service list was not supplied, so the severity of an advice finding — conduct breach versus unauthorised activity — could not be determined.",
      });
    } else if (!input.authorisedServices.includes('providing advice on crypto-assets')) {
      refusals.push(
        refuse(
          'SERVICE_NOT_AUTHORISED',
          'This item is advice on crypto-assets and that service is not on the authorised list supplied to this instrument. That is not a conduct breach — it is the provision of a crypto-asset service without authorisation for it.',
          MICA(
            'Art 59(1)',
            'No person shall provide crypto-asset services within the Union unless that person is an authorised crypto-asset service provider or otherwise permitted.',
          ),
          {
            kind: 'not_recoverable',
            why: 'The service is outside LCX\'s authorisation. No wording makes an unauthorised service authorised.',
          },
        ),
      );
    }
  }

  /* ── The halo effect. The engine that will not flag its owner's favourite sentence
       is decoration, so this section is deliberately unkind to LCX's brand line. ── */
  const unregulatedProducts = input.products.filter((p) => p.status === 'not_mica_regulated');
  const unknownStatusProducts = input.products.filter((p) => p.status === 'unknown');
  for (const product of unknownStatusProducts) {
    refusals.push(
      refuse(
        'PRODUCT_REGULATORY_STATUS_UNKNOWN',
        `This item names "${product.name}" and this instrument does not know whether that product is inside MiCA's perimeter. ESMA requires every marketing communication to indicate clearly whether a product is regulated or not, so the status is a precondition, not a nicety.`,
        ELEMENT_CITATIONS.esma_halo_status,
        {
          kind: 'supply_data',
          missing: `whether "${product.name}" is a MiCA-regulated service or falls outside the perimeter`,
          whoCanSupply: 'the product register, once it records MiCA status per product',
        },
        product.name,
      ),
    );
  }
  if (unregulatedProducts.length > 0 && input.citesOwnRegulatoryStatus) {
    refusals.push(
      refuse(
        'ESMA_REGULATORY_STATUS_AS_PROMOTION',
        `This item invokes LCX's regulated status while promoting ${unregulatedProducts.map((p) => `"${p.name}"`).join(', ')}, which falls outside MiCA. ESMA names that as a DON'T: the CASP's regulatory status used as a promotional tool, encouraging confusion between regulated and unregulated products. "Regulated in Liechtenstein" is LCX's best line and this is the item where it may not be used.`,
        ESMA_HALO_PROMOTIONAL_TOOL_CITATION,
        {
          kind: 'edit_text',
          what: `remove the reference to LCX's authorisation or regulated status, and state instead that ${unregulatedProducts.map((p) => `"${p.name}"`).join(', ')} ${unregulatedProducts.length === 1 ? 'is' : 'are'} not regulated under MiCA — clearly visible, not in terms and conditions and not behind a link`,
        },
      ),
    );
  }

  /* ── Art 4(4): one sentence destroys somebody else's exemption. ── */
  for (const fact of input.assets) {
    if (fact.treatment !== 'signals_future_admission') continue;
    if (!fact.reliesOnArt4Exemption) continue;
    refusals.push(
      refuse(
        'ART_4_4_EXEMPTION_DESTROYING_STATEMENT',
        `${fact.asset} relies on an Art 4(2)/(3) exemption, and this item makes known an intention to seek admission to trading. Art 4(4) then withdraws the exemption — and the exemption belongs to the offeror, so the harm lands on a counterparty and creates a contractual problem on top of the regulatory one.`,
        ART_4_4_CITATION,
        {
          kind: 'edit_text',
          what: `remove every statement of an intention to seek admission to trading for ${fact.asset}, including hints and dated teasers`,
        },
        fact.asset,
      ),
    );
  }

  /* ── Art 90: the teaser about an unannounced listing.
       NARROW ON PURPOSE. The market-abuse perimeter owns the general rule that any
       draft naming an embargoed asset is blocked; this module refuses only the case its
       own classification establishes — that the item's declared treatment of the asset
       IS the signal or the disclosure. Codes are deduplicated at the gate, so an
       overlap is a repeated refusal and not a contradiction. ── */
  for (const fact of input.assets) {
    const isSignalOrDisclosure =
      fact.treatment === 'signals_future_admission' || fact.treatment === 'discloses_non_public';
    if (!isSignalOrDisclosure) continue;
    if (fact.embargo === 'mnpi_pending') {
      refusals.push(
        refuse(
          'ART_90_ASSET_UNDER_EMBARGO',
          `${fact.asset} is under embargo — inside information exists and is not yet public — and this item signals or discloses it. A teaser reply is a disclosure to the world, and "the normal exercise of an employment" is not a defence a social-media coordinator can hold.`,
          ART_90_1_CITATION,
          {
            kind: 'wait_until',
            condition: `the information about ${fact.asset} is disclosed publicly under Art 88(1), separately from any marketing`,
          },
          fact.asset,
        ),
      );
    } else if (fact.embargo === 'unknown') {
      refusals.push(
        refuse(
          'ASSET_STATE_UNKNOWN',
          `This item signals or discloses something about ${fact.asset} and this instrument does not know whether that information is public yet. That is the one axis where guessing is unrecoverable: unlawful disclosure of inside information carries personal liability.`,
          ART_90_1_CITATION,
          {
            kind: 'supply_data',
            missing: `whether the information about ${fact.asset} in this item is already public, and the instant it became public`,
            whoCanSupply: 'the asset embargo register, which the owner and legal still owe',
          },
          fact.asset,
        ),
      );
    }
  }
  const embargoJoinNeeded = input.assets.some(
    (f) => f.embargo === 'unknown' || f.embargo === 'mnpi_pending',
  );
  if (embargoJoinNeeded) {
    coverage.push({
      axis: 'embargo_register_not_joined',
      sentence:
        'This classifier reads an embargo state it was handed; it does not join the embargo register itself. The general block on every draft naming an embargoed asset belongs to the market-abuse perimeter and must run as well as this.',
    });
  }
  if (input.assets.some((f) => f.authorHolding === 'not_declared' || f.authorHolding === 'register_absent')) {
    coverage.push({
      axis: 'holdings_register_not_joined',
      sentence:
        "The author's position in at least one named asset is undeclared or the register is absent. Art 91(3)(c) attaches personal liability from EUR 700 000, and this classifier only requires the disclosure element when a holding is declared to it — the refusal for a missing declaration belongs to the perimeter.",
    });
  }

  /* ── Art 88(1) and Art 7(2). ── */
  const art88 = art88CombinationRefusal(input, mc.is);
  if (art88 != null) refusals.push(art88);
  refusals.push(...whitePaperTimingRefusals(input.assets, regimeByAsset, input.at));

  /* ── Art 66(2): negligence suffices, so an unchecked advantage claim is the breach. ── */
  refusals.push(...unsubstantiatedAdvantageRefusals(input.advantageClaims));

  /* ── Prize draws: national gambling law is not harmonised and is not code's to guess. ── */
  if (input.purpose === 'campaign_or_giveaway' && input.prizeDrawExclusionsFromCounsel !== true) {
    refusals.push(
      refuse(
        'PRIZE_DRAW_JURISDICTION_EXCLUSIONS_ABSENT',
        'This is a campaign or prize draw with no recorded jurisdiction exclusions from counsel. Whether a token draw is a lottery or a game of chance is national law, unharmonised across the EEA, and a draw that is lawful in one Member State can be unlawful in another.',
        DESK_POLICY(
          'regime.prize_draw_exclusions',
          'National gambling and lottery law is outside MiCA and was not researched. A prize-draw promotion needs a jurisdiction-exclusion list that came from counsel, and this instrument will not generate one.',
        ),
        { kind: 'human_authority', role: 'legal' },
      ),
    );
    coverage.push({
      axis: 'national_gambling_law_not_assessed',
      sentence:
        'National gambling and lottery law across the EEA was not researched and is not assessed here. Prize-draw exclusions must come from counsel.',
    });
  }

  /* ── The arithmetic. Computed for the promotional regime that mandates the most text,
       because that is the binding constraint when a basket mixes asset kinds. ── */
  const regimes: RegimeSet = MARKETING_REGIMES.filter((regime) =>
    assignments.some((a) => a.regime === regime),
  );
  const promoRegime: MandatedBlock['regime'] | null = regimes.includes('offer_promo')
    ? 'offer_promo'
    : regimes.includes('art_promo')
      ? 'art_promo'
      : regimes.includes('emt_promo')
        ? 'emt_promo'
        : null;
  const art7 =
    promoRegime == null
      ? null
      : art7Budget({
          regime: promoRegime,
          role: input.art7Role,
          disclosure: input.art7Disclosure,
          body: input.body,
          channel,
        });
  if (art7?.refusal != null) refusals.push(art7.refusal);

  /* ── If the item claims to carry the Art 7(1)(e) statement, it must be verbatim. ── */
  if (promoRegime === 'offer_promo') {
    const statement = checkArt7Statement(input.body, input.art7Role);
    if (statement.refusal != null) refusals.push(statement.refusal);
  }

  /* ── The element union. ── */
  const promotedAssets = input.assets.filter((f) => regimeByAsset.has(f.asset));
  const requiredElements = requiredElementsFor({
    regimes,
    isMarketingCommunication: mc.is,
    concernsCryptoAssetTransactions: input.assets.length > 0,
    providesServiceInRelationToNamedAsset: input.assets.some(
      (f) => f.treatment === 'promotes_trading' || f.treatment === 'promotes_offer',
    ),
    whitePaperRequiredForPromotedAsset: promotedAssets.some(
      (f) => f.whitePaper.kind !== 'not_required',
    ),
    anyDeclaredHolding: input.assets.some((f) => f.authorHolding === 'declared_holding'),
    anyUnregulatedProductNamed: unregulatedProducts.length > 0,
  });

  /* ── What this classification did not, and structurally cannot, assess. ── */
  coverage.push({
    axis: 'element_presence_not_checked',
    sentence: `${requiredElements.length} element${requiredElements.length === 1 ? '' : 's'} ${requiredElements.length === 1 ? 'is' : 'are'} required by the regimes assigned here. This classifier decides requirement, never presence: whether the artefact actually carries them needs the rendered text and belongs to the gate.`,
  });
  if (regimes.includes('art_promo') || regimes.includes('emt_promo')) {
    coverage.push({
      axis: 'redemption_right_statement_wording_not_checked',
      sentence: REDEMPTION_RIGHT_STATEMENT_IS_NOT_TEXT_CHECKED,
    });
  }
  const uncodedRequired = requiredElements.filter((r) => r.absenceCode == null);
  if (uncodedRequired.length > 0) {
    coverage.push({
      axis: 'element_absence_has_no_refusal_code',
      sentence: `No refusal code exists for the absence of: ${uncodedRequired.map((r) => r.element).join(', ')}. Their absence must be reported by the gate in words, because this instrument will not reuse a code that means something else.`,
    });
  }
  // Fires unless BOTH of the unresearched regimes are explicitly excluded. Excluding one
  // does not silence it: the gap is that neither rulebook was read, and a partial
  // exclusion answers only half the question.
  if (
    input.addressedTo.includes('unknown') ||
    !(input.excludedFrom.includes('uk') && input.excludedFrom.includes('us'))
  ) {
    coverage.push({
      axis: 'non_eea_regimes_not_assessed',
      sentence: NON_EEA_REGIMES_NOT_ASSESSED,
    });
  }

  const classification: RegimeClassification = {
    regimes,
    assignments,
    linkPresent: input.firstPartyLinkPresent,
    addressedTo: input.addressedTo,
    excludedFrom: input.excludedFrom,
    ruleSetVersion: REGIME_RULESET_VERSION,
  };

  return {
    classification,
    isMarketingCommunication: mc.is,
    marketingCommunicationBasis: mc.basis,
    requiredElements,
    art7,
    refusals,
    coverage,
    requiresHumanConfirmation: REGIMES_REQUIRING_HUMAN_CONFIRMATION.filter((r) =>
      regimes.includes(r),
    ),
    faultStandard: ART_66_2_FAULT_STANDARD,
    ruleSetVersion: REGIME_RULESET_VERSION,
  };
}
