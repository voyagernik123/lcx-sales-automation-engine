/**
 * ADOPTION — THE VERB IS THE ACT.
 *
 * The object under review in this compartment is never "the text". It is
 * `(verb, target, author)`. A reply is our own communication and stands or falls on
 * our words. A plain repost or a like is an ADOPTION: it produces no words of ours
 * and still makes a stranger's claim ours, in full. A quote is both at once. Only a
 * strictly factual correction adopts nothing, and that exemption is narrow enough
 * that this module spends a section refusing to let an argument wear it.
 *
 * FINRA Regulatory Notice 17-18 is cited throughout as a MODEL, not as law binding
 * LCX — it is US broker-dealer guidance, and it is used because it is the sharpest
 * published articulation of entanglement and adoption and because MiCA has no
 * analogue. What makes the model load-bearing here is that the EU rules it maps onto
 * are binding and harsher:
 *
 *  - MiCA Art 91(2)(c) makes disseminating information "including the dissemination
 *    of rumours" a market-manipulation offence on a "knew, or ought to have known"
 *    standard. Retweeting someone else's price claim IS dissemination, so
 *    amplification is the regulated act and the absence of our own words is not a
 *    defence, it is the removal of the only place a qualification could have gone.
 *  - UCPD Annex I point 11 bans undisclosed paid editorial "in all circumstances" —
 *    no materiality test, no consumer-harm test, no defence. The Commission's
 *    guidance says retweets count, that consideration includes free products and
 *    event invitations, that EACH item must be labelled, and that a national court
 *    held the BRAND liable for re-posting an influencer's unlabelled promo. So the
 *    retweet button is a liability-transfer device and this module treats it as a
 *    gated act with a partner lookup, never as a one-click affordance.
 *  - UCPD Annex I point 22 bans falsely representing oneself as a consumer. Staff
 *    boosting LCX from personal accounts is therefore inside a per-se prohibition.
 *    It is also the single most likely thing to actually happen at LCX, which is why
 *    §6 exists and why bio-level disclosure is not accepted as a substitute for
 *    per-item disclosure.
 *
 * TWO STATE MACHINES, NOT ONE (§7). FINRA RN 10-06 splits static content (bio,
 * pinned post, profile) — pre-approval mandatory — from interactive content (replies,
 * quotes) where pre-approval is NOT required but risk-based review and retention are.
 * Collapsing them produces either over-gating, where nobody replies in time, or
 * under-gating, where nothing is recorded. `risk_based_review_plus_retention` is a
 * DIFFERENT duty, not a weaker one, and §7 refuses to certify it without the
 * sampling record that 2210(b)(3) makes its substitute for pre-use review.
 *
 * ABSENCE NEVER READS AS CLEAR. Every "we did not look" input in this module is a
 * distinct state from "we looked and it was fine", and it refuses: a null
 * claim-gate verdict on the target, a `register_absent` partner lookup, an `unknown`
 * consideration kind, an `unknown` speaker capacity. A gate that treats an unchecked
 * target as a clean one converts "we just retweeted it" from a defensible act into
 * an indefensible one while displaying a tick.
 *
 * Pure and total: no I/O, no clock, no randomness, no module-scope `Date.now()`.
 * Every timestamp is supplied by the caller, because a rule about what the desk knew
 * at the moment it acted cannot be tested by a function that reads today's clock.
 */
import {
  INSTRUMENTS,
  SURFACE_APPROVAL_REGIME,
  SURFACE_CLASS,
  VERB_ADOPTION,
  VERB_INHERITS_TARGET_RISK,
  VERB_PRODUCES_OWN_TEXT,
  normaliseForMatch,
  type ActorId,
  type AdoptionEffect,
  type ApprovalRegime,
  type Clearance,
  type ConsiderationKind,
  type ContentHash,
  type ContentSurface,
  type DeskMode,
  type EngagementVerb,
  type Handle,
  type InboundProvenance,
  type Instant,
  type Permalink,
  type Refusal,
  type RefusalCode,
  type ReviewSamplingRecord,
  type RuleCitation,
  type SurfaceClass,
} from './types.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 CITATIONS AND THE REFUSAL CONSTRUCTOR                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Stamped onto every refusal this module emits, so a refusal read out of an audit row
 * six months from now can be read against the rules that were in force when it fired
 * rather than against today's.
 */
export const ADOPTION_RULESET_VERSION = 1;

/** MiCA, cited with the provision as read. */
const MICA = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.mica.key,
  provision,
  text,
});

/** The UCPD blacklist. "In all circumstances unfair" — there is nothing to balance. */
const UCPD = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.ucpd.key,
  provision,
  text,
});

/** Commission Guidance 2021/C 526/01 — not binding, but it is the operational spec. */
const GUIDANCE = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.ucpd_guidance.key,
  provision,
  text,
});

/** FINRA RN 17-18 / 10-06 / Rule 2210 — model only, and labelled as such on screen. */
const FINRA_17_18 = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.finra_rn_17_18.key,
  provision,
  text,
});

const FINRA_10_06 = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.finra_rn_10_06.key,
  provision,
  text,
});

const FINRA_2210 = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.finra_2210.key,
  provision,
  text,
});

/** Ours, not the law's. Cited whenever the rule is a desk policy so nobody mistakes it. */
const DESK_POLICY = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

/**
 * The one place a `Refusal` is built in this module.
 *
 * `matched` is the span the refusal objected to, and it is passed explicitly at every
 * call site rather than defaulted, because a refusal that will not show what it
 * objected to is an assertion of authority and an operator will route around it. It
 * is `null` only for state-absence refusals, where there genuinely is no span.
 */
function refuse(
  code: RefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: Refusal['recovery'],
  matched: string | null,
): Refusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: ADOPTION_RULESET_VERSION };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 WHAT EACH VERB ADOPTS, WITH THE REASONING ATTACHED                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The rule that puts each verb where `VERB_ADOPTION` puts it.
 *
 * This table is the answer to "why does a like carry someone else's claims" and it
 * travels with the verdict, so the operator who disagrees can read the provision
 * instead of arguing with a colour. Verbs are not interchangeable and a surface that
 * renders Like and Reply as equally weightless buttons is wrong.
 */
export const VERB_ADOPTION_CITATION: Record<EngagementVerb, RuleCitation> = {
  reply: FINRA_17_18(
    'RN 17-18, Third-Party Posts',
    "A firm's own reply is its own communication; the third party's post it answers is not adopted by the act of answering it. Content standards apply to our words.",
  ),
  quote: MICA(
    'Art 91(2)(c)',
    'Market manipulation includes "disseminating information through the media, including the internet, or by any other means, which gives, or is likely to give, false or misleading signals as to the supply of, demand for, or price of one or several crypto-assets ... including the dissemination of rumours, where the person who engaged in the dissemination knew, or ought to have known, that the information was false or misleading."',
  ),
  repost: FINRA_17_18(
    'RN 17-18 Q9',
    'By liking or sharing the favorable comments, the representative has adopted them and they are subject to the communications rules.',
  ),
  like: FINRA_17_18(
    'RN 17-18 Q9',
    'By liking or sharing the favorable comments, the representative has adopted them and they are subject to the communications rules.',
  ),
  original: FINRA_17_18(
    'RN 17-18, Third-Party Posts',
    'A communication the firm originates is the firm\'s own; there is no third-party content to adopt and no parent context to rely on.',
  ),
  correction: FINRA_17_18(
    'RN 17-18 Q11',
    'Correcting a factual error in a third-party listing does not constitute adoption of the incorrect original.',
  ),
};

/**
 * One sentence per verb, addressed to the operator, saying what the act does. Written
 * to be readable on a confirm dialog next to the button, because that is the moment
 * the distinction has to land.
 */
export const VERB_CONSEQUENCE: Record<EngagementVerb, string> = {
  reply:
    "A reply is LCX's own communication. It carries our words only — the post we answer is context, not something we endorsed.",
  quote:
    "A quote is LCX's own communication AND a republication of the target. Both sets of standards apply, and if the target carries a price-relevant claim, our republication of it is itself a regulated act.",
  repost:
    'A plain repost adopts the target\'s claims in full. The claim becomes ours and we added nothing that could qualify it.',
  like:
    'A like adopts the target\'s claims in full, with no words of ours anywhere in the artefact. There is nothing to edit and nothing to qualify.',
  original:
    "An original post is LCX's own communication with no parent context to rely on. Everything in it is ours.",
  correction:
    'A strictly factual correction adopts nothing. The exemption is narrow: it holds only while the correction stays factual, and it is lost the moment the text argues.',
};

/**
 * What a verb does, as one object, derived from the tables in `types.ts` rather than
 * restated here. Snapshot it onto the record: a stored verdict must not depend on
 * today's table.
 */
export interface AdoptionExplanation {
  readonly verb: EngagementVerb;
  readonly effect: AdoptionEffect;
  /** Whether the target's own risk flags flow onto our item. */
  readonly inheritsTargetRisk: boolean;
  /** Whether there is any text of ours that could be drafted, refused or edited. */
  readonly producesOwnText: boolean;
  readonly consequence: string;
  readonly citation: RuleCitation;
}

/** Total over `EngagementVerb`. No default branch: a new verb must break the build. */
export function explainAdoption(verb: EngagementVerb): AdoptionExplanation {
  return {
    verb,
    effect: VERB_ADOPTION[verb],
    inheritsTargetRisk: VERB_INHERITS_TARGET_RISK[verb],
    producesOwnText: VERB_PRODUCES_OWN_TEXT[verb],
    consequence: VERB_CONSEQUENCE[verb],
    citation: VERB_ADOPTION_CITATION[verb],
  };
}

/**
 * Whether the verb is an AMPLIFICATION — whether performing it puts a third party's
 * words in front of LCX's audience under LCX's name.
 *
 * Derived from `VERB_INHERITS_TARGET_RISK` rather than listed, so the two cannot drift
 * apart. `correction` is deliberately not an amplification even though it mentions the
 * original: §2 is what keeps that honest, by taking the exemption away when the
 * "correction" restates the claim instead of correcting it.
 */
export function isAmplification(verb: EngagementVerb): boolean {
  return VERB_INHERITS_TARGET_RISK[verb];
}

/**
 * Whether the operator has anywhere to put a fix.
 *
 * This is the fact that decides whether a refusal on an amplification is recoverable
 * by editing. For `like` and `repost` the answer is no, and the honest recovery is
 * "do not do it, or say it in our own words" — never "reword it", because there are
 * no words.
 */
export function hasEditableSurface(verb: EngagementVerb): boolean {
  return VERB_PRODUCES_OWN_TEXT[verb];
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1.1 TEXT MATCHING — lexical, and it says so                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * READ THIS BEFORE TRUSTING A MATCH. Rendered next to any finding derived from a term
 * list, for the same reason `precedent.ts` renders `GROUPING_IS_LEXICAL_NOT_SEMANTIC`.
 *
 * Every detector in this module is lexical. It has no model of meaning, it will miss
 * a paraphrase, and its terms are matched as prefixes so `'restat'` fires on
 * `restated` and `restatement` — and also on nothing else useful, which is the
 * trade. The direction of the error is deliberate: a miss on a target-text detector
 * produces a refusal that a human can overrule with a recorded reason, never a silent
 * pass, and every finding returns the term that fired so the operator can disagree
 * with it specifically rather than with the tool generally.
 */
export const ADOPTION_MATCHING_IS_LEXICAL =
  'These checks match a fixed list of words and phrases; they do not understand the sentence. A paraphrase can slip past them, so a clear result means "matched nothing I hold", not "safe". Every finding names the term that fired so it can be argued with.';

/** Every term from `terms` present in `text`, in the order the list declares them. */
export function matchTerms(text: string, terms: readonly string[]): readonly string[] {
  const haystack = normaliseForMatch(text);
  const hits: string[] = [];
  for (const term of terms) {
    const needle = normaliseForMatch(term).trimEnd();
    if (needle.trim().length === 0) continue;
    if (haystack.includes(needle)) hits.push(term);
  }
  return hits;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE CORRECTION EXEMPTION IS NARROW, AND IT IS NOT SELF-CERTIFYING         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The false fact and the true one, named.
 *
 * RN 17-18 Q11 exempts correcting "a factual error". So the exemption is available
 * only to an act that can say WHICH fact was wrong and WHAT is actually true — and
 * `sourceRef` is required because the correction asserts the true fact, and an
 * unsourced assertion of fact is the thing the substantiation rules exist about
 * (FINRA 2210(b)(4)(A)(iv) requires the source of any statistic used; MiCA Art 66(2)
 * requires information that is fair, clear and not misleading). Making the desk fill
 * this in is the whole mechanism: it is very hard to write `wrong`/`right` honestly
 * for a post you simply disagree with.
 */
export interface CorrectionClaim {
  /** The specific factual error in the target, quoted from it. */
  readonly wrong: string;
  /** What is actually the case. */
  readonly right: string;
  /** Where `right` is evidenced. `null` is a disqualifier, not a blank field. */
  readonly sourceRef: string | null;
}

/**
 * Why a claimed correction does not get RN 17-18 Q11's protection. Each is a distinct
 * fact about the text and they do not collapse into a score.
 */
export type CorrectionDisqualifier =
  /** No `wrong`/`right` pair was named, so nothing was corrected. */
  | 'no_corrected_fact_declared'
  /** The true fact is asserted with no source. */
  | 'corrected_fact_unsourced'
  /** The text argues rather than corrects. Q11 covers factual errors, not disputes. */
  | 'argumentative_language'
  /** Evaluative or promotional language: a correction that also sells is not a correction. */
  | 'evaluative_language'
  /** Forward-looking language: a correction is about what IS, not what will be. */
  | 'forward_looking_language'
  /** It reproduces a run of the target's own words, which republishes the claim. */
  | 'restates_target_claim'
  /** Nothing was written. */
  | 'empty';

/**
 * Argumentative markers. These are the register of a dispute, not of a correction —
 * RESIST 2 lists trolling, whataboutism, strawman, social proof and ad hominem as the
 * devices of someone "not interested in correcting false or misleading information",
 * and a desk that adopts the same register has stopped correcting too.
 */
export const ARGUMENTATIVE_MARKERS: readonly string[] = [
  'fud',
  'fudding',
  'shill',
  'shilling',
  'nonsense',
  'ridiculous',
  'lying',
  'liar',
  'clueless',
  'ignorant',
  'do your research',
  'do your own research',
  'cope',
  'seething',
  'everyone knows',
  'as usual',
  'yet again',
  'stop spreading',
  'stay mad',
  'imagine thinking',
];

/**
 * Evaluative and promotional markers. A correction that also sells is a marketing
 * communication wearing a correction's exemption — and under MiCA Art 66(2) it would
 * also need to be identified as marketing, which a "correction" by construction is
 * not.
 */
export const EVALUATIVE_MARKERS: readonly string[] = [
  'the best',
  'world leading',
  'world class',
  'safest',
  'most secure',
  'fastest growing',
  'number one',
  'unmatched',
  'superior to',
  'better than any',
  'guaranteed',
];

/**
 * Forward-looking markers. A correction speaks to what is or was. The moment it
 * speaks to what will be it is a commitment, and a commitment is the class that
 * `UNCONDITIONAL_FORWARD_COMMITMENT` exists for — SEC v. Bankman-Fried pleads "We
 * will always allow withdrawals" as part of the fraud, and it was written as
 * reassurance.
 */
export const FORWARD_LOOKING_MARKERS: readonly string[] = [
  'we will',
  'will be',
  'going to',
  'coming soon',
  'in the coming',
  'expect to',
  'plan to',
  'shortly',
  'next week',
  'next month',
  'roadmap',
];

/** How many consecutive words shared with the target counts as republishing it. */
export const RESTATEMENT_RUN_WORDS = 6;

/**
 * The longest run of `RESTATEMENT_RUN_WORDS` consecutive words that appears in both
 * texts, or `null`.
 *
 * Mechanical and reproducible by hand, which is the point: `restates_target_claim` is
 * a finding an operator can check with their eyes, and the run is returned so the
 * refusal can show it. Six words is a policy threshold, not a legal one — quoting five
 * words of someone's sentence is normal correction practice, and reproducing a whole
 * clause is republication.
 */
export function sharedWordRun(a: string, b: string): string | null {
  const wordsOf = (t: string): readonly string[] =>
    normaliseForMatch(t)
      .trim()
      .split(' ')
      .filter((w) => w.length > 0);
  const aw = wordsOf(a);
  const bw = wordsOf(b);
  if (aw.length < RESTATEMENT_RUN_WORDS || bw.length < RESTATEMENT_RUN_WORDS) return null;
  const bRuns = new Set<string>();
  for (let i = 0; i + RESTATEMENT_RUN_WORDS <= bw.length; i += 1) {
    bRuns.add(bw.slice(i, i + RESTATEMENT_RUN_WORDS).join(' '));
  }
  for (let i = 0; i + RESTATEMENT_RUN_WORDS <= aw.length; i += 1) {
    const run = aw.slice(i, i + RESTATEMENT_RUN_WORDS).join(' ');
    if (bRuns.has(run)) return run;
  }
  return null;
}

/**
 * What the claimed correction actually is.
 *
 * `effective` is the field that matters. When the exemption is lost the act does not
 * become forbidden — it becomes what it always was: our own communication, plus
 * adoption if it republished the target. Everything downstream reads `effective`, so
 * an operator cannot buy `no_adoption` by relabelling an argument as a correction. The
 * label is an input; the effect is a finding.
 */
export interface CorrectionAssessment {
  /** What the operator asserted by choosing the `correction` verb. */
  readonly claimed: 'no_adoption';
  /** What it actually does. Equal to `claimed` only when `exemptionHolds`. */
  readonly effective: AdoptionEffect;
  readonly exemptionHolds: boolean;
  readonly disqualifiers: readonly CorrectionDisqualifier[];
  /** The terms that fired, so the finding is arguable rather than authoritative. */
  readonly matchedTerms: readonly string[];
  /** The run of the target's words this text reproduced, if any. */
  readonly restatedRun: string | null;
}

/**
 * Assess a correction against RN 17-18 Q11. Total: an empty text and a missing claim
 * are answered, not thrown at.
 *
 * `targetText` may be `null` — the desk sometimes corrects a post it has not captured
 * verbatim. A null target cannot produce `restates_target_claim`, and that absence is
 * honest rather than reassuring: it is one fewer check having run, which is why the
 * amplification gate refuses an unread target separately (§4).
 */
export function assessCorrection(
  text: string,
  claim: CorrectionClaim | null,
  targetText: string | null,
): CorrectionAssessment {
  const disqualifiers: CorrectionDisqualifier[] = [];
  const matchedTerms: string[] = [];

  if (text.trim().length === 0) disqualifiers.push('empty');
  if (claim == null || claim.wrong.trim().length === 0 || claim.right.trim().length === 0) {
    disqualifiers.push('no_corrected_fact_declared');
  } else if (claim.sourceRef == null || claim.sourceRef.trim().length === 0) {
    disqualifiers.push('corrected_fact_unsourced');
  }

  const argumentative = matchTerms(text, ARGUMENTATIVE_MARKERS);
  if (argumentative.length > 0) {
    disqualifiers.push('argumentative_language');
    matchedTerms.push(...argumentative);
  }
  const evaluative = matchTerms(text, EVALUATIVE_MARKERS);
  if (evaluative.length > 0) {
    disqualifiers.push('evaluative_language');
    matchedTerms.push(...evaluative);
  }
  const forward = matchTerms(text, FORWARD_LOOKING_MARKERS);
  if (forward.length > 0) {
    disqualifiers.push('forward_looking_language');
    matchedTerms.push(...forward);
  }

  const restatedRun = targetText == null ? null : sharedWordRun(text, targetText);
  if (restatedRun != null) disqualifiers.push('restates_target_claim');

  const exemptionHolds = disqualifiers.length === 0;
  const effective: AdoptionEffect = exemptionHolds
    ? 'no_adoption'
    : restatedRun != null
      ? 'own_communication_plus_adoption'
      : 'own_communication_only';

  return { claimed: 'no_adoption', effective, exemptionHolds, disqualifiers, matchedTerms, restatedRun };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE TARGET — what would be adopted, and whether we have even read it      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * What the desk has done about the target's factual content.
 *
 * `unverified` is the default and it is not a slur on the author; it is a statement
 * about US. Art 91(2)(c)'s standard is "knew, or ought to have known", so
 * amplification of an unverified market-relevant claim is exposure regardless of the
 * author's honesty — verifying it is the only thing that moves the needle, and
 * verifying it AFTER amplifying is the wrong order.
 */
export type TargetVerificationState = 'verified_by_desk' | 'unverified' | 'known_false';

/**
 * The partner register lookup. THREE STATES, because "not a partner" and "we did not
 * check" are different facts and collapsing them is how a brand ends up liable for
 * re-posting an unlabelled paid promo.
 *
 * `register_absent` is the GPS perimeter pattern applied here: an empty register
 * refuses and says so, rather than returning "no partners found" and letting the
 * absence read as a clean bill of health.
 */
export type PartnerRegisterLookup =
  | { readonly state: 'register_absent' }
  | { readonly state: 'not_a_partner'; readonly checkedAt: Instant }
  | { readonly state: 'partner'; readonly partner: PartnerStatus };

/**
 * A partner as the register must hold it.
 *
 * `consideration` is a `ConsiderationKind` and not a boolean because Commission
 * Guidance 2021/C 526/01 §4.2.6 makes the trigger "any form of consideration ...
 * including ... free products (including unsolicited gifts), trips or event
 * invitations", and states that "the presence of a contract and monetary payment is
 * not necessary". A comped conference ticket and an airdropped allocation both count.
 *
 * `disclosureTermsRecorded` exists because the guidance names the controls that
 * discharge the brand's diligence — "ensuring transparency, educating influencers and
 * having control mechanisms to bring infringements to an end". Whether the partner was
 * ever told what to write is therefore a field in the record, not an assumption.
 */
export interface PartnerStatus {
  readonly handle: Handle;
  readonly consideration: ConsiderationKind;
  /**
   * Which way the consideration flowed. The duty attaches either way — the artefact
   * reaching consumers is a paid commercial communication whether LCX paid a KOL or a
   * project paid LCX — so this field is for the record and the escalation path, not
   * for deciding whether the rule applies.
   */
  readonly direction: 'lcx_gave' | 'lcx_received';
  /** Whether the partner was given the labelling terms in writing. */
  readonly disclosureTermsRecorded: boolean;
  readonly recordedAt: Instant;
}

/**
 * Whether a consideration kind creates the UCPD disclosure duty.
 *
 * Three values, not a boolean: `unknown` is a real state of the register and it must
 * not resolve to either answer. It refuses (`PARTNER_CONSIDERATION_UNKNOWN`), because
 * guessing `no_duty` is the mistake with a per-se prohibition behind it.
 */
export const CONSIDERATION_DUTY: Record<ConsiderationKind, 'duty' | 'no_duty' | 'unknown'> = {
  none: 'no_duty',
  payment: 'duty',
  discount: 'duty',
  partnership: 'duty',
  affiliate_commission: 'duty',
  free_product: 'duty',
  unsolicited_gift: 'duty',
  trip: 'duty',
  event_invitation: 'duty',
  fee_waiver: 'duty',
  referral_code: 'duty',
  token_allocation: 'duty',
  unknown: 'unknown',
};

/**
 * The post being amplified, as the desk actually holds it.
 *
 * `text: null` means NOT OBSERVED, and it is a refusal rather than an empty string:
 * you cannot adopt what you have not read, and an empty string would silently pass
 * every text detector in this file and produce a clean verdict on an unknown claim.
 */
export interface TargetPost {
  readonly permalink: Permalink | null;
  readonly handle: Handle | null;
  /** The target's text as observed. `null` when we do not have it. */
  readonly text: string | null;
  readonly provenance: InboundProvenance;
  readonly verification: TargetVerificationState;
  /** True when the target is one of LCX's own accounts — a staff repost of it still bites (§5). */
  readonly isLcxOwnAccount: boolean;
  readonly partner: PartnerRegisterLookup;
}

/**
 * Terms that make a post's content market-relevant, i.e. capable of giving "false or
 * misleading signals as to the supply of, demand for, or price of" a crypto-asset.
 *
 * This list decides whether Art 91(2)(c) is in play, so it is deliberately broad and
 * errs toward firing. A false positive costs the operator one recorded override; a
 * false negative costs a market-manipulation exposure on an "ought to have known"
 * standard.
 */
export const MARKET_RELEVANT_TERMS: readonly string[] = [
  'price',
  'pump',
  'dump',
  'moon',
  'ath',
  'all time high',
  'listing',
  'listed',
  'delist',
  'insolvent',
  'solvency',
  'solvent',
  'reserves',
  'proof of reserves',
  'withdrawals paused',
  'withdrawals halted',
  'halted',
  'frozen',
  'depeg',
  'hack',
  'hacked',
  'exploit',
  'drained',
  'rug',
  'rugged',
  'exit scam',
  'buy now',
  'sell now',
  'apy',
  'apr',
  'yield',
  'returns',
  'airdrop',
  'token burn',
  'supply cut',
  'partnership announcement',
  'acquisition',
  'bankrupt',
  'liquidation',
  'liquidated',
];

/** Whether a text touches the price/supply/demand axis, and which terms fired. */
export interface MarketRelevance {
  readonly relevant: boolean;
  readonly matchedTerms: readonly string[];
}

export function assessMarketRelevance(text: string): MarketRelevance {
  const matchedTerms = matchTerms(text, MARKET_RELEVANT_TERMS);
  return { relevant: matchedTerms.length > 0, matchedTerms };
}

/**
 * WHAT LCX WOULD BE ADOPTING. The answer to the question the operator is actually
 * asking when their cursor is over the repost button.
 *
 * `adoptedText` is the third party's words that would become ours. It is `null` for
 * verbs that adopt nothing, and — importantly — it is also `null` when the verb DOES
 * adopt but we never observed the text, which is a different sentence and a refusal
 * (§6), not a smaller version of the same answer.
 */
export interface AdoptedContent {
  readonly verb: EngagementVerb;
  readonly effect: AdoptionEffect;
  /** The stranger's words that would become LCX's claim. */
  readonly adoptedText: string | null;
  /** True when the verb adopts but `adoptedText` is null because we never read it. */
  readonly adoptsUnreadText: boolean;
  /** Our own words, where the verb has any. */
  readonly ownText: string | null;
  readonly targetHandle: Handle | null;
  readonly targetPermalink: Permalink | null;
  readonly marketRelevance: MarketRelevance | null;
  /** One sentence for the confirm dialog. Names the handle, because that is the point. */
  readonly statement: string;
}

/**
 * Compute what would be adopted. Pure projection, no judgement — the refusals are
 * §6's job. `effect` is passed in rather than re-derived so a correction that lost its
 * exemption (§2) is described by what it EFFECTIVELY does.
 */
export function whatWouldBeAdopted(
  verb: EngagementVerb,
  effect: AdoptionEffect,
  target: TargetPost | null,
  ownText: string | null,
): AdoptedContent {
  const adopts = effect === 'adopts_target_claims' || effect === 'own_communication_plus_adoption';
  const adoptedText = adopts && target != null ? target.text : null;
  const adoptsUnreadText = adopts && (target == null || target.text == null);
  const marketRelevance = target?.text != null ? assessMarketRelevance(target.text) : null;
  const who = target?.handle ?? 'an unidentified account';

  const statement = !adopts
    ? `This act adopts nothing from ${who}. Only LCX's own words are under review.`
    : adoptsUnreadText
      ? `This act would adopt the claims in a post by ${who} that this compartment has not observed. LCX cannot adopt what it has not read.`
      : effect === 'adopts_target_claims'
        ? `This act makes every claim in ${who}'s post LCX's own claim, in full, with no words of LCX's anywhere in the artefact.`
        : `This act publishes LCX's own words AND republishes ${who}'s post. Both are LCX communications from the moment it is sent.`;

  return {
    verb,
    effect,
    adoptedText,
    adoptsUnreadText,
    ownText,
    targetHandle: target?.handle ?? null,
    targetPermalink: target?.permalink ?? null,
    marketRelevance,
    statement,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 UCPD ANNEX I POINT 11 — UNDISCLOSED PAID EDITORIAL, PER SE               */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Point 11 is in the "in all circumstances unfair" blacklist. Stated as a constant
 * because the surface must say it: there is no materiality test to argue, no
 * consumer-harm element to disprove, and no good-faith defence. Either each item was
 * labelled prominently or the practice is unfair.
 */
export const UCPD_BLACKLIST_HAS_NO_DEFENCE =
  'UCPD Annex I lists practices that are unfair in all circumstances. There is no materiality test and no good-faith defence: if a paid item is not labelled prominently, the breach is complete on publication.';

/**
 * Labels that count as a disclosure, matched case-insensitively at a word boundary.
 *
 * NOT EXHAUSTIVE, and the direction of that gap is deliberate: an unrecognised label
 * yields "absent" and therefore a refusal the operator can overrule with a recorded
 * reason. The list errs toward refusing rather than toward accepting a novel phrasing
 * as adequate. German forms are included because Liechtenstein and the DACH audience
 * are LCX's home market, and `#Anzeige`/`Werbung` are the labels a German-speaking
 * reader actually recognises.
 */
export const DISCLOSURE_TOKENS: readonly string[] = [
  '#ad',
  '#ads',
  '#advert',
  '#advertisement',
  '#sponsored',
  '#sponsoredpost',
  '#paidpartnership',
  '#paidpromotion',
  '#anzeige',
  '#werbung',
  '#bezahltewerbung',
  '#publicidad',
  '#publicite',
  'paid partnership',
  'paid promotion',
  'paid advertisement',
  'sponsored by',
  'sponsored post',
  'advertisement',
  'werbung',
  'anzeige',
  'in exchange for',
  'we were paid',
  'we received',
];

/**
 * How far into the text a disclosure may sit and still count as prominent.
 *
 * THIS IS A DESK POLICY, NOT A PLATFORM FACT. X decides where it truncates a post and
 * that fold is not observable without a credential, so the honest move is to set a
 * conservative prominence budget of our own and label it as ours rather than to assert
 * a number about X's rendering that this compartment cannot verify. A disclosure
 * inside the first 100 characters is prominent under any plausible fold; one at
 * character 240 is a coin toss the Commission's guidance has already called:
 * disclosure is inadequate where it "requires the consumer to take additional steps
 * (e.g. click on 'read more')".
 *
 * Where the caller CAN observe the truncation point for a specific surface, pass it as
 * `visibleChars` and the check uses the observation instead of the policy.
 */
export const DISCLOSURE_PROMINENCE_BUDGET_CHARS = 100;

/** Why a disclosure does not discharge point 11. Each is a distinct, checkable fact. */
export type DisclosureInadequacy =
  /** No recognised label anywhere in the item. */
  | 'absent'
  /** Every label sits in the trailing block of hashtags, mentions and links. */
  | 'trailing_hashtag_block'
  /** The first label sits past the prominence budget. */
  | 'beyond_prominence_budget'
  /** The first label sits past a truncation point the caller observed. */
  | 'behind_expansion'
  /** The only signal is a mention of the brand. Guidance: "merely tagging a trader". */
  | 'merely_tagging_the_trader';

/** Where a recognised label was found. Offsets are into the raw text, for highlighting. */
export interface DisclosureToken {
  readonly token: string;
  readonly offset: number;
}

export interface DisclosureAssessment {
  readonly present: boolean;
  readonly adequate: boolean;
  readonly tokens: readonly DisclosureToken[];
  /** Offset of the earliest recognised label, or `null` when there is none. */
  readonly earliestOffset: number | null;
  /** Start offset of the trailing hashtag/mention/link block, or `null` when there is none. */
  readonly trailingBlockStart: number | null;
  readonly inadequacies: readonly DisclosureInadequacy[];
  /** The span to highlight: the label, or the trailing block, or null. */
  readonly matched: string | null;
}

/**
 * Every occurrence of a recognised label, with a word-boundary check on both sides so
 * `#ad` does not fire inside `#adoption` and `advertisement` does not fire inside
 * `advertisements-are-bad`.
 */
export function findDisclosureTokens(text: string): readonly DisclosureToken[] {
  const lower = text.toLowerCase();
  const isWordChar = (ch: string | undefined): boolean => ch != null && /[a-z0-9]/.test(ch);
  const found: DisclosureToken[] = [];
  for (const token of DISCLOSURE_TOKENS) {
    const needle = token.toLowerCase();
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const before = at === 0 ? undefined : lower[at - 1];
      const after = lower[at + needle.length];
      const startsWithSigil = needle.startsWith('#');
      if ((startsWithSigil || !isWordChar(before)) && !isWordChar(after)) {
        found.push({ token, offset: at });
      }
      from = at + needle.length;
    }
  }
  return found.slice().sort((a, b) => (a.offset === b.offset ? a.token.localeCompare(b.token) : a.offset - b.offset));
}

/**
 * Where the trailing block of hashtags, mentions and bare links begins, or `null`.
 *
 * Commission Guidance 2021/C 526/01 §4.2.6: disclosure is inadequate where it is "not
 * displayed prominently (e.g. hashtags at the end of a lengthy disclaimer; merely
 * tagging a trader)". So this is the shape of the most common real failure — `#ad`
 * dropped into the tag pile at the bottom — and it is detectable without any model of
 * meaning.
 */
export function trailingTagBlockStart(text: string): number | null {
  const matches = [...text.matchAll(/\S+/g)];
  let start: number | null = null;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const m = matches[i]!;
    const word = m[0];
    const isTagLike = /^[#@]\S+$/.test(word) || /^https?:\/\/\S+$/i.test(word);
    if (!isTagLike) break;
    start = m.index;
  }
  return start;
}

/**
 * Assess one item's disclosure against point 11 as the guidance operationalises it.
 *
 * `visibleChars` is the caller's OBSERVATION of where this surface truncates, or
 * `null` when it is not known. It is never guessed: with no observation the policy
 * budget applies and the verdict says which test it used.
 */
export function assessDisclosure(
  text: string,
  options?: { readonly visibleChars?: number | null },
): DisclosureAssessment {
  const tokens = findDisclosureTokens(text);
  const trailingBlockStart = trailingTagBlockStart(text);
  const inadequacies: DisclosureInadequacy[] = [];
  const earliestOffset = tokens.length > 0 ? tokens[0]!.offset : null;
  const visibleChars = options?.visibleChars ?? null;

  if (tokens.length === 0) {
    inadequacies.push('absent');
    if (/@\S+/.test(text)) inadequacies.push('merely_tagging_the_trader');
  } else {
    if (trailingBlockStart != null && tokens.every((t) => t.offset >= trailingBlockStart)) {
      inadequacies.push('trailing_hashtag_block');
    }
    if (earliestOffset != null && earliestOffset >= DISCLOSURE_PROMINENCE_BUDGET_CHARS) {
      inadequacies.push('beyond_prominence_budget');
    }
    if (visibleChars != null && earliestOffset != null && earliestOffset >= visibleChars) {
      inadequacies.push('behind_expansion');
    }
  }

  const matched =
    tokens.length > 0
      ? tokens[0]!.token
      : trailingBlockStart != null
        ? text.slice(trailingBlockStart)
        : null;

  return {
    present: tokens.length > 0,
    adequate: inadequacies.length === 0,
    tokens,
    earliestOffset,
    trailingBlockStart,
    inadequacies,
    matched,
  };
}

/** The sentence each inadequacy earns, addressed to the operator. */
export const DISCLOSURE_INADEQUACY_SENTENCE: Record<DisclosureInadequacy, string> = {
  absent:
    'This item carries consideration and no recognised disclosure label, so publishing or amplifying it is an unfair commercial practice in all circumstances.',
  trailing_hashtag_block:
    'The disclosure sits in the trailing block of hashtags and links, which the Commission guidance names as an example of a label that is not displayed prominently.',
  beyond_prominence_budget: `The disclosure appears after character ${DISCLOSURE_PROMINENCE_BUDGET_CHARS}, past the desk's prominence budget, so a reader may never reach it.`,
  behind_expansion:
    'The disclosure sits past the point where this surface truncates, so reading it requires the consumer to take an additional step.',
  merely_tagging_the_trader:
    'Tagging the brand is not a disclosure. The guidance says so in terms: merely tagging a trader does not label a commercial communication.',
};

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 UCPD ANNEX I POINT 22 — STAFF FROM PERSONAL ACCOUNTS                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Point 22, verbatim from the blacklist: "Falsely claiming or creating the impression
 * that the trader is not acting for purposes relating to his trade, business, craft or
 * profession, or falsely representing oneself as a consumer."
 *
 * MODEL IT, BECAUSE IT IS THE MOST LIKELY THING TO ACTUALLY HAPPEN AT LCX. Nobody at a
 * small exchange plans to breach a consumer-protection directive; they plan to "let
 * the team engage organically from their own handles", which is the same act. A
 * colleague replying "honestly the best exchange I've used" from a personal account,
 * with no statement that they work there, is inside a per-se prohibition — and unlike
 * a misleading claim there is nothing to soften, because the breach is the
 * impersonation of a consumer rather than the content of the sentence.
 */
export const UCPD_POINT_22_TEXT =
  'Falsely claiming or creating the impression that the trader is not acting for purposes relating to his trade, business, craft or profession, or falsely representing oneself as a consumer.';

/**
 * Who is speaking. `unknown` is a real state — a queued item whose author has not been
 * resolved — and it refuses rather than defaulting to `official_account`, because
 * defaulting would silently exempt the case the section exists for.
 */
export type SpeakerCapacity = 'official_account' | 'staff_personal_account' | 'unknown';

export interface Speaker {
  readonly actor: ActorId;
  readonly capacity: SpeakerCapacity;
  readonly handle: Handle | null;
  /**
   * Whether the employment relationship is stated in the account's bio or profile
   * only. Recorded and NEVER accepted as sufficient: Commission Guidance §4.2.6
   * requires each commercial communication to be "individually labelled ... as it
   * reaches consumers", and reaching a bio requires the consumer to take an additional
   * step — the same defect as `behind_expansion`.
   */
  readonly employmentDisclosedInProfileOnly: boolean;
  /**
   * Whether this item promotes the employer or its assets. Declared by the caller, and
   * OVERRIDDEN TO TRUE when the act amplifies one of LCX's own posts, so the flag
   * cannot be used to under-declare the obvious case.
   */
  readonly itemPromotesEmployer: boolean;
}

/**
 * Phrases that state an employment relationship in the item itself.
 *
 * Narrow on purpose. An unrecognised phrasing reads as "not disclosed" and produces a
 * refusal the operator can overrule with a reason, which is the safe direction for a
 * per-se prohibition. `#ad` is deliberately NOT here: point 22 is about concealing who
 * is speaking, and an ad label does not tell the reader that the author is on staff.
 */
export const EMPLOYMENT_DISCLOSURE_TOKENS: readonly string[] = [
  'i work at',
  'i work for',
  'i am employed by',
  'employee of',
  'my employer',
  'i am on the team',
  'part of the team at',
  'team member at',
  'speaking as an employee',
  'disclosure i work',
  'disclosure i am',
  'my company',
];

export interface EmploymentDisclosure {
  readonly disclosed: boolean;
  /** Whether it appears inside the prominence budget as well as appearing at all. */
  readonly prominent: boolean;
  readonly matchedTerms: readonly string[];
  readonly earliestOffset: number | null;
}

/**
 * Whether the ITEM states the employment relationship, derived from the text rather
 * than asserted by a flag.
 *
 * A boolean the author sets is self-certification, which is the thing §2 exists to
 * refuse; the same logic applies here. If the words are not in the item, the item does
 * not disclose.
 */
export function assessEmploymentDisclosure(text: string | null): EmploymentDisclosure {
  if (text == null || text.trim().length === 0) {
    return { disclosed: false, prominent: false, matchedTerms: [], earliestOffset: null };
  }
  const matchedTerms = matchTerms(text, EMPLOYMENT_DISCLOSURE_TOKENS);
  if (matchedTerms.length === 0) {
    return { disclosed: false, prominent: false, matchedTerms, earliestOffset: null };
  }
  const lower = text.toLowerCase();
  const offsets = matchedTerms
    .map((t) => lower.indexOf(t.toLowerCase()))
    .filter((n) => n >= 0)
    .sort((a, b) => a - b);
  const earliestOffset = offsets.length > 0 ? offsets[0]! : null;
  return {
    disclosed: true,
    prominent: earliestOffset != null && earliestOffset < DISCLOSURE_PROMINENCE_BUDGET_CHARS,
    matchedTerms,
    earliestOffset,
  };
}

/** What point 22 says about this act. One value, so a surface cannot render two. */
export type StaffCapacityFinding =
  /** The official account, or an item that does not promote the employer. Point 22 not engaged. */
  | 'not_engaged'
  /** Personal account, promotes the employer, employment stated prominently in the item. */
  | 'disclosed_in_item'
  /** Personal account, promotes the employer, nothing stated in the item. Per-se breach. */
  | 'undisclosed_personal_account'
  /** Stated in the item but past the prominence budget. */
  | 'disclosure_not_prominent'
  /** The verb produces no text, so there is nowhere for the disclosure to go. */
  | 'no_surface_for_disclosure'
  /** We do not know who is speaking. */
  | 'capacity_unknown';

export interface StaffCapacityAssessment {
  readonly finding: StaffCapacityFinding;
  readonly promotesEmployer: boolean;
  readonly employmentDisclosure: EmploymentDisclosure;
  readonly refusals: readonly Refusal[];
}

/**
 * Apply point 22 to one act. Total over every combination of capacity, verb and
 * target.
 *
 * `promotesEmployer` is derived, not trusted: amplifying LCX's own post from a personal
 * staff account promotes the employer by definition, whatever the caller passed.
 */
export function assessStaffCapacity(
  speaker: Speaker,
  verb: EngagementVerb,
  target: TargetPost | null,
  ownText: string | null,
): StaffCapacityAssessment {
  const amplifyingOwnAccount = isAmplification(verb) && target?.isLcxOwnAccount === true;
  const promotesEmployer = speaker.itemPromotesEmployer || amplifyingOwnAccount;
  const employmentDisclosure = assessEmploymentDisclosure(ownText);

  if (speaker.capacity === 'unknown') {
    return {
      finding: 'capacity_unknown',
      promotesEmployer,
      employmentDisclosure,
      refusals: [
        refuse(
          'SPEAKER_CAPACITY_UNKNOWN',
          'This compartment does not know whether this act is the official LCX account or a colleague speaking from a personal one, and the two attract different rules. It will not assume the safer answer.',
          DESK_POLICY(
            'speaker capacity',
            'An act whose speaker capacity is unresolved is refused rather than treated as the official account, because the personal-account case is the one UCPD Annex I point 22 catches per se.',
          ),
          {
            kind: 'supply_data',
            missing: 'the account this act is performed from, and whether it is an LCX account or a colleague\'s personal account',
            whoCanSupply: 'the operator performing the act',
          },
          speaker.handle,
        ),
      ],
    };
  }

  if (speaker.capacity === 'official_account' || !promotesEmployer) {
    return { finding: 'not_engaged', promotesEmployer, employmentDisclosure, refusals: [] };
  }

  const citation = UCPD('Annex I point 22', UCPD_POINT_22_TEXT);

  if (!hasEditableSurface(verb)) {
    return {
      finding: 'no_surface_for_disclosure',
      promotesEmployer,
      employmentDisclosure,
      refusals: [
        refuse(
          'UCPD_STAFF_POSING_AS_CONSUMER',
          `A ${verb} from a colleague's personal account boosts LCX while presenting as an ordinary user, and it carries no words in which the employment relationship could be disclosed. The compliant options are not to do it, or to do it from the LCX account.`,
          citation,
          {
            kind: 'not_recoverable',
            why: `A ${verb} produces no text of ours, so there is nowhere to put the disclosure that point 22 requires. Nothing can be edited into compliance here.`,
          },
          speaker.handle,
        ),
      ],
    };
  }

  if (!employmentDisclosure.disclosed) {
    return {
      finding: 'undisclosed_personal_account',
      promotesEmployer,
      employmentDisclosure,
      refusals: [
        refuse(
          'UCPD_STAFF_POSING_AS_CONSUMER',
          speaker.employmentDisclosedInProfileOnly
            ? 'This item promotes LCX from a colleague\'s personal account and states the employment relationship only in the profile. Each communication must be labelled as it reaches consumers; a reader who never opens the bio is being addressed by an apparent consumer.'
            : 'This item promotes LCX from a colleague\'s personal account without stating that the author works there, which UCPD Annex I point 22 makes unfair in all circumstances.',
          citation,
          {
            kind: 'edit_text',
            what: 'state the employment relationship in the item itself, in the first sentence — for example "Disclosure: I work at LCX."',
          },
          ownText,
        ),
      ],
    };
  }

  if (!employmentDisclosure.prominent) {
    return {
      finding: 'disclosure_not_prominent',
      promotesEmployer,
      employmentDisclosure,
      refusals: [
        refuse(
          'UCPD_DISCLOSURE_BELOW_TRUNCATION_FOLD',
          `The employment disclosure appears at character ${employmentDisclosure.earliestOffset ?? 0}, past the desk's prominence budget of ${DISCLOSURE_PROMINENCE_BUDGET_CHARS}, so a reader may never reach it.`,
          GUIDANCE(
            '§4.2.6',
            'The disclosure cannot be considered adequate in case the information concerning the commercial communication is not displayed prominently (e.g. hashtags at the end of a lengthy disclaimer; merely tagging a trader) or requires the consumer to take additional steps (e.g. click on "read more").',
          ),
          { kind: 'edit_text', what: 'move the disclosure into the opening sentence' },
          employmentDisclosure.matchedTerms[0] ?? null,
        ),
      ],
    };
  }

  return { finding: 'disclosed_in_item', promotesEmployer, employmentDisclosure, refusals: [] };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 THE AMPLIFICATION GATE — "we just retweeted it", adjudicated              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * One act, with everything the gate needs and nothing it can infer.
 *
 * `targetFindings` is the claim gate's verdict on the TARGET's text, and `null` means
 * IT WAS NOT RUN. That is the single most important field in this interface: an
 * amplification whose target has never been checked is refused, because a gate that
 * treats an unchecked target as a clean one is the mechanism by which "we just
 * retweeted it" becomes indefensible while a tick is on screen. An empty array means
 * checked and clean, and it is a different input.
 */
export interface AmplificationRequest {
  readonly verb: EngagementVerb;
  readonly surface: ContentSurface;
  readonly speaker: Speaker;
  /** The post being acted on. `null` only for `original`. */
  readonly target: TargetPost | null;
  /** Our own words, where the verb has any. */
  readonly ownText: string | null;
  /** Required to claim the RN 17-18 Q11 exemption on a `correction`. */
  readonly correctionClaim?: CorrectionClaim | null;
  readonly deskMode: DeskMode;
  /** Claim-gate refusals on the target's text, or `null` when the gate was not run. */
  readonly targetFindings: readonly Refusal[] | null;
  /** The caller's OBSERVATION of where this surface truncates. Never guessed. */
  readonly visibleChars?: number | null;
}

/** What the gate decided, with every part of the reasoning still attached. */
export interface AmplificationVerdict {
  readonly adoption: AdoptionExplanation;
  /** Present only for the `correction` verb. `effective` is what the gate acted on. */
  readonly correction: CorrectionAssessment | null;
  readonly adopted: AdoptedContent;
  /** The target's disclosure state, when a partner duty made it relevant. */
  readonly targetDisclosure: DisclosureAssessment | null;
  /** Our own item's disclosure state, when a partner duty made it relevant. */
  readonly ownDisclosure: DisclosureAssessment | null;
  readonly staff: StaffCapacityAssessment;
  readonly approval: ApprovalObligation;
  readonly refusals: readonly Refusal[];
  /** Codes inherited from the target rather than found in our own words. */
  readonly inheritedRefusalCodes: readonly RefusalCode[];
  /**
   * Checks that did NOT run, named. The honesty ceiling applied to the gate itself: a
   * verdict with no refusals and three unrun checks is not a clean verdict.
   */
  readonly notChecked: readonly string[];
  /**
   * Diligence gaps that are not refusals: things the Commission guidance names as the
   * controls that discharge the brand's professional diligence, which this act does not
   * block on but the desk owes.
   */
  readonly diligenceGaps: readonly string[];
  /** One line for the confirm dialog: what would be adopted, and what refused it. */
  readonly statement: string;
  readonly ruleSetVersion: number;
}

/** Refuse this act because the authority switched the desk off, or turned the gate up. */
function deskModeRefusals(deskMode: DeskMode): readonly Refusal[] {
  if (deskMode.kind === 'suspended_by_authority') {
    return [
      refuse(
        'DESK_SUSPENDED_BY_AUTHORITY',
        `${deskMode.authority} has suspended LCX's marketing communications under order ${deskMode.orderRef} until ${deskMode.expiresAt}. Drafting and recording continue; nothing may be handed off for posting.`,
        MICA(
          'Art 94',
          'Competent authorities have the power to suspend or prohibit marketing communications where there are reasonable grounds for suspecting an infringement, and to require a crypto-asset service provider to cease or suspend marketing communications for a maximum of 30 consecutive working days on any single occasion.',
        ),
        { kind: 'wait_until', condition: `the suspension expires on ${deskMode.expiresAt}, or the authority lifts it` },
        deskMode.orderRef,
      ),
    ];
  }
  if (deskMode.kind === 'heightened') {
    return [
      refuse(
        'DESK_HEIGHTENED_PRECLEARANCE_REQUIRED',
        `The desk is in heightened mode (${deskMode.reason}), so this item needs pre-clearance before it goes out even though its surface would not normally require it.`,
        DESK_POLICY(
          'heightened mode',
          'Heightened mode requires pre-clearance of every item regardless of surface class, mirroring FINRA 2210(c)(1)(B), under which a regulator may require a firm that has departed from the standards to file all communications before first use.',
        ),
        { kind: 'human_authority', role: 'policy' },
        null,
      ),
    ];
  }
  return [];
}

/**
 * The partner-duty branch of point 11.
 *
 * Checks BOTH texts, because §4.2.6 requires each commercial communication to be
 * "individually labell[ed] ... as it reaches consumers": our frame carrying a label
 * does not cure the republished post lacking one, and vice versa. And the amplification
 * is the act that transfers the liability — a national court held a trader liable for
 * re-posting influencer content that was not adequately labelled.
 */
function partnerRefusals(
  request: AmplificationRequest,
  amplifies: boolean,
): {
  readonly refusals: readonly Refusal[];
  readonly targetDisclosure: DisclosureAssessment | null;
  readonly ownDisclosure: DisclosureAssessment | null;
  readonly diligenceGaps: readonly string[];
  readonly notChecked: readonly string[];
} {
  const lookup = request.target?.partner ?? null;
  const refusals: Refusal[] = [];
  const diligenceGaps: string[] = [];
  const notChecked: string[] = [];

  if (lookup == null) {
    return { refusals, targetDisclosure: null, ownDisclosure: null, diligenceGaps, notChecked };
  }

  if (lookup.state === 'register_absent') {
    refusals.push(
      refuse(
        'PARTNER_CONSIDERATION_UNKNOWN',
        'There is no partner register to check this account against, so this compartment cannot tell whether amplifying it would republish an undisclosed paid promotion.',
        GUIDANCE(
          '§4.2.6',
          'The commercial element is considered to be present whenever the influencer receives any form of consideration for the endorsement ... The presence of a contract and monetary payment is not necessary to trigger the application of these rules.',
        ),
        {
          kind: 'supply_data',
          missing: 'a partner register recording every account LCX has given consideration to, and what kind',
          whoCanSupply: 'the desk owner, with legal',
        },
        request.target?.handle ?? null,
      ),
    );
    notChecked.push('whether the target account has received consideration from LCX — no register exists');
    return { refusals, targetDisclosure: null, ownDisclosure: null, diligenceGaps, notChecked };
  }

  if (lookup.state === 'not_a_partner') {
    return { refusals, targetDisclosure: null, ownDisclosure: null, diligenceGaps, notChecked };
  }

  const duty = CONSIDERATION_DUTY[lookup.partner.consideration];
  if (duty === 'unknown') {
    refusals.push(
      refuse(
        'PARTNER_CONSIDERATION_UNKNOWN',
        `The register records ${lookup.partner.handle} as a partner but does not say what consideration passed, and the disclosure duty turns on exactly that.`,
        GUIDANCE(
          '§4.2.6',
          'The commercial element is considered to be present whenever the influencer receives any form of consideration for the endorsement, including in case of payment, discounts, partnership arrangements, percentage from affiliate links, free products (including unsolicited gifts), trips or event invitations etc.',
        ),
        {
          kind: 'supply_data',
          missing: `the consideration kind recorded against ${lookup.partner.handle}`,
          whoCanSupply: 'whoever owns the partner relationship',
        },
        lookup.partner.handle,
      ),
    );
    return { refusals, targetDisclosure: null, ownDisclosure: null, diligenceGaps, notChecked };
  }

  if (duty === 'no_duty') {
    return { refusals, targetDisclosure: null, ownDisclosure: null, diligenceGaps, notChecked };
  }

  if (!lookup.partner.disclosureTermsRecorded) {
    diligenceGaps.push(
      `No labelling terms are recorded as having been given to ${lookup.partner.handle}. The Commission guidance names educating partners and holding control mechanisms as the measures that discharge the brand's professional diligence, and this act proceeds without them.`,
    );
  }

  const point11 = UCPD(
    'Annex I point 11',
    'Using editorial content in the media to promote a product where a trader has paid for the promotion without making that clear in the content or by images or sounds clearly identifiable by the consumer (advertorial).',
  );

  let targetDisclosure: DisclosureAssessment | null = null;
  if (amplifies) {
    if (request.target?.text == null) {
      notChecked.push('whether the partner\'s post carries a prominent disclosure — its text was never observed');
    } else {
      targetDisclosure = assessDisclosure(request.target.text, { visibleChars: request.visibleChars ?? null });
      if (!targetDisclosure.adequate) {
        const absent = targetDisclosure.inadequacies.includes('absent');
        refusals.push(
          refuse(
            absent ? 'UCPD_UNDISCLOSED_PAID_PROMOTION' : 'UCPD_DISCLOSURE_BELOW_TRUNCATION_FOLD',
            `${lookup.partner.handle} received ${lookup.partner.consideration} from LCX and this post is not adequately labelled. Amplifying it makes the unlabelled paid promotion LCX's own: a national court has held a brand liable on exactly these facts.`,
            absent ? point11 : GUIDANCE('§4.2.6', DISCLOSURE_INADEQUACY_SENTENCE.trailing_hashtag_block),
            {
              kind: 'wait_until',
              condition: `${lookup.partner.handle} labels the post prominently in its opening text, or LCX states the commercial relationship in its own words instead of amplifying`,
            },
            targetDisclosure.matched,
          ),
        );
      }
    }
  }

  let ownDisclosure: DisclosureAssessment | null = null;
  if (request.ownText != null && request.ownText.trim().length > 0) {
    ownDisclosure = assessDisclosure(request.ownText, { visibleChars: request.visibleChars ?? null });
    if (!ownDisclosure.adequate) {
      const absent = ownDisclosure.inadequacies.includes('absent');
      refusals.push(
        refuse(
          absent ? 'UCPD_UNDISCLOSED_PAID_PROMOTION' : 'UCPD_DISCLOSURE_BELOW_TRUNCATION_FOLD',
          `This item is a commercial communication about ${lookup.partner.handle}, who ${lookup.partner.direction === 'lcx_gave' ? 'received' : 'gave'} ${lookup.partner.consideration}. Every item must carry its own prominent label, and this one does not.`,
          absent ? point11 : GUIDANCE('§4.2.6', DISCLOSURE_INADEQUACY_SENTENCE.beyond_prominence_budget),
          { kind: 'edit_text', what: 'label the item in its opening text — "#ad" or "paid partnership" — not in the trailing hashtags' },
          ownDisclosure.matched,
        ),
      );
    }
  }

  return { refusals, targetDisclosure, ownDisclosure, diligenceGaps, notChecked };
}

/**
 * The adoption branch: everything that follows from putting a stranger's words in
 * front of LCX's audience under LCX's name.
 *
 * Note the asymmetry this function exists to produce. A `reply` to a post full of
 * unverified price claims returns nothing here, because a reply adopts nothing — the
 * claims stay the author's. The identical target under a `repost` refuses four ways.
 * That asymmetry IS the model; a gate that treated both the same would be a text
 * checker with a legal vocabulary.
 */
function adoptionRefusals(
  request: AmplificationRequest,
  effect: AdoptionEffect,
): {
  readonly refusals: readonly Refusal[];
  readonly inheritedRefusalCodes: readonly RefusalCode[];
  readonly notChecked: readonly string[];
} {
  const refusals: Refusal[] = [];
  const inheritedRefusalCodes: RefusalCode[] = [];
  const notChecked: string[] = [];
  const { verb, target } = request;
  const amplifies = effect === 'adopts_target_claims' || effect === 'own_communication_plus_adoption';

  if (verb !== 'original' && target == null) {
    refusals.push(
      refuse(
        'DATA_ABSENT_NOT_ZERO',
        `A ${verb} is an act performed on a specific post, and no target was supplied. This compartment will not record an act against an unnamed target.`,
        DESK_POLICY(
          'target required',
          'Every verb except `original` is defined by the post it acts on. An act with no target cannot be reviewed, reproduced for a supervisor, or argued with.',
        ),
        { kind: 'supply_data', missing: 'the permalink and text of the post being acted on', whoCanSupply: 'the operator' },
        null,
      ),
    );
    return { refusals, inheritedRefusalCodes, notChecked };
  }

  if (!amplifies || target == null) return { refusals, inheritedRefusalCodes, notChecked };

  const noEdit = !hasEditableSurface(verb);
  const cannotQualify = `A ${verb} carries no words of LCX's in which the claim could be qualified, corrected or sourced. It can be declined, or the point can be made in LCX's own words as a reply or an original post, which adopts nothing.`;

  if (target.text == null) {
    refusals.push(
      refuse(
        'ADOPTION_OF_UNVERIFIED_TARGET',
        `This ${verb} would adopt the claims in a post this compartment has never read. LCX cannot adopt what it has not seen.`,
        FINRA_17_18(
          'RN 17-18 Q9',
          'By liking or sharing the favorable comments, the representative has adopted them and they are subject to the communications rules.',
        ),
        {
          kind: 'supply_data',
          missing: "the target post's text, observed and corroborated through a second channel",
          whoCanSupply: 'the operator, by pasting the post or fetching its oEmbed record',
        },
        target.permalink,
      ),
    );
    notChecked.push('the target\'s text — it was never observed, so no text-level check ran on it');
  }

  if (target.provenance.state === 'quarantined') {
    refusals.push(
      refuse(
        'ADOPTION_OF_UNVERIFIED_TARGET',
        `The target is in quarantine (${target.provenance.reasons.join(', ')}), so what it says and who said it are both unconfirmed. Adopting it would make an unverified stranger's claim LCX's own claim.`,
        DESK_POLICY(
          'corroborate before believing',
          'An inbound item without independent corroboration is quarantined at a distinct state rather than graded, and a quarantined item may not be amplified. Promotion out of quarantine requires the corroboration named on the record.',
        ),
        { kind: 'supply_data', missing: target.provenance.promotionRequires, whoCanSupply: 'the operator' },
        target.permalink,
      ),
    );
  }

  if (request.targetFindings == null) {
    refusals.push(
      refuse(
        'ADOPTION_OF_UNVERIFIED_TARGET',
        `The target's own text has not been through the claim gate, so this ${verb} would adopt claims nobody has checked. An unchecked target is not a clean one.`,
        DESK_POLICY(
          'amplification inherits claim risk',
          "A verb that adopts the target's claims subjects them to the same content standards as LCX's own words, so the target's text must pass the same gate before the act is available.",
        ),
        {
          kind: 'supply_data',
          missing: "a claim-gate verdict on the target's text",
          whoCanSupply: 'the desk, by running the target text through the gate',
        },
        target.permalink,
      ),
    );
    notChecked.push("the target's claims — the claim gate was not run on the target text");
  } else if (request.targetFindings.length > 0) {
    for (const inherited of request.targetFindings) inheritedRefusalCodes.push(inherited.code);
    refusals.push(
      refuse(
        'ADOPTION_OF_REFUSED_CONTENT',
        `The target's text is itself refused (${request.targetFindings.map((r) => r.code).join(', ')}). A ${verb} adopts those claims wholesale, so every refusal on the target becomes a refusal on LCX.`,
        FINRA_17_18(
          'RN 17-18 Q9',
          'By liking or sharing the favorable comments, the representative has adopted them and they are subject to the communications rules.',
        ),
        { kind: 'not_recoverable', why: cannotQualify },
        request.targetFindings[0]?.matched ?? target.permalink,
      ),
    );
  }

  const relevance = target.text == null ? null : assessMarketRelevance(target.text);

  if (target.verification === 'known_false') {
    refusals.push(
      refuse(
        'ART_91_2_C_RUMOUR_RESTATED',
        `The desk has already established that this post is false. Republishing it — even to argue with it — is dissemination of information LCX knows to be misleading.`,
        MICA(
          'Art 91(2)(c)',
          'Market manipulation includes disseminating information through the media, including the internet, or by any other means, which gives, or is likely to give, false or misleading signals as to the supply of, demand for, or price of one or several crypto-assets, including the dissemination of rumours, where the person who engaged in the dissemination knew, or ought to have known, that the information was false or misleading.',
        ),
        {
          kind: 'not_recoverable',
          why: noEdit
            ? cannotQualify
            : 'The claim is known false and this act republishes it. State the true position in LCX\'s own words instead; a factual correction that does not reproduce the false claim adopts nothing.',
        },
        target.permalink,
      ),
    );
  } else if (target.verification === 'unverified' && relevance != null && relevance.relevant) {
    refusals.push(
      refuse(
        'ART_91_2_C_RUMOUR_RESTATED',
        `This post carries a market-relevant claim (${relevance.matchedTerms.join(', ')}) that the desk has not verified. Art 91(2)(c) applies to LCX's republication of it on an "ought to have known" standard, so it must be verified BEFORE the amplification, not after.`,
        MICA(
          'Art 91(2)(c)',
          'Market manipulation includes disseminating information ... including the dissemination of rumours, where the person who engaged in the dissemination knew, or ought to have known, that the information was false or misleading.',
        ),
        {
          kind: 'supply_data',
          missing: `verification of the market-relevant claim in the target (terms that fired: ${relevance.matchedTerms.join(', ')})`,
          whoCanSupply: 'the subject-matter expert who owns the fact',
        },
        relevance.matchedTerms[0] ?? target.permalink,
      ),
    );
  }

  return { refusals, inheritedRefusalCodes, notChecked };
}

/**
 * THE GATE. Given an act and its target, what LCX would be adopting and every refusal
 * that follows.
 *
 * Deterministic and total: every branch returns, no input throws, and the refusal
 * order is fixed — desk mode, then who is speaking, then adoption, then paid-promotion
 * disclosure, then the approval regime — so two colleagues reading the same verdict
 * read the same list in the same order.
 *
 * The gate never returns a boolean. It returns what was adopted, what was refused,
 * what was inherited, and what was not checked, because "no refusals" and "checked and
 * clean" are different claims and only the second one is worth anything.
 */
export function assessAmplification(request: AmplificationRequest): AmplificationVerdict {
  const declared = explainAdoption(request.verb);
  const correction =
    request.verb === 'correction'
      ? assessCorrection(request.ownText ?? '', request.correctionClaim ?? null, request.target?.text ?? null)
      : null;
  const effect: AdoptionEffect = correction != null ? correction.effective : declared.effect;
  const amplifies = effect === 'adopts_target_claims' || effect === 'own_communication_plus_adoption';

  const adoption: AdoptionExplanation = {
    ...declared,
    effect,
    inheritsTargetRisk: amplifies,
    consequence:
      correction != null && !correction.exemptionHolds
        ? `Submitted as a correction, but it does not qualify for RN 17-18 Q11's factual-correction exemption (${correction.disqualifiers.join(', ')}). ${VERB_CONSEQUENCE[amplifies ? 'quote' : 'reply']}`
        : declared.consequence,
  };

  const adopted = whatWouldBeAdopted(request.verb, effect, request.target, request.ownText);
  const staff = assessStaffCapacity(request.speaker, request.verb, request.target, request.ownText);
  const partner = partnerRefusals(request, amplifies);
  const adoptionPart = adoptionRefusals(request, effect);
  const approval = approvalObligationFor(request.surface, request.deskMode);

  const refusals: Refusal[] = [
    ...deskModeRefusals(request.deskMode),
    ...staff.refusals,
    ...adoptionPart.refusals,
    ...partner.refusals,
  ];

  const notChecked = [...adoptionPart.notChecked, ...partner.notChecked];
  if (correction != null && request.target?.text == null) {
    notChecked.push('whether the correction reproduces the target\'s wording — the target text was not supplied');
  }

  const statement =
    refusals.length === 0
      ? `${adopted.statement} No rule this gate holds was matched.${notChecked.length > 0 ? ` ${notChecked.length} check(s) did not run.` : ''}`
      : `${adopted.statement} ${refusals.length} refusal(s): ${refusals.map((r) => r.code).join(', ')}.`;

  return {
    adoption,
    correction,
    adopted,
    statement,
    targetDisclosure: partner.targetDisclosure,
    ownDisclosure: partner.ownDisclosure,
    staff,
    approval,
    refusals,
    inheritedRefusalCodes: adoptionPart.inheritedRefusalCodes,
    notChecked,
    diligenceGaps: partner.diligenceGaps,
    ruleSetVersion: ADOPTION_RULESET_VERSION,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §7 TWO STATE MACHINES — static pre-approval, interactive review + retention   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * What the surface obliges, as one object.
 *
 * `risk_based_review_plus_retention` is NOT a weaker duty. FINRA 2210(b)(3) spells out
 * what substitutes for pre-use review — education, documentation of that education,
 * and "surveillance and follow-up to ensure that such procedures are implemented and
 * adhered to", with the evidence retained and producible. So the interactive lane owes
 * an artefact too; it is just a different artefact, and §7.2 refuses to certify the
 * lane without it.
 */
export interface ApprovalObligation {
  readonly surface: ContentSurface;
  readonly surfaceClass: SurfaceClass;
  readonly regime: ApprovalRegime;
  /** True when desk mode forced pre-approval onto a surface that would not need it. */
  readonly upgradedByDeskMode: boolean;
  readonly obligations: readonly string[];
  readonly citation: RuleCitation;
  readonly statement: string;
}

/**
 * Which machine an item is in. Derived from the surface, then upgraded by desk mode —
 * never chosen by the author, because the class is a fact about where the words live.
 */
export function approvalObligationFor(surface: ContentSurface, deskMode: DeskMode): ApprovalObligation {
  const surfaceClass = SURFACE_CLASS[surface];
  const base = SURFACE_APPROVAL_REGIME[surfaceClass];
  const upgradedByDeskMode = deskMode.kind === 'heightened' && base !== 'pre_approval_required';
  const regime: ApprovalRegime = upgradedByDeskMode ? 'pre_approval_required' : base;

  const obligations =
    regime === 'pre_approval_required'
      ? [
          'a blocking clearance by someone other than the author, recorded before first use',
          'the clearance bound to the exact content hash, so an edit voids it',
          'the dates of first and last use recorded, so stale standing copy is detectable',
        ]
      : [
          'a documented risk-based review policy with a reproducible selection basis',
          'a sampling record per period naming the population, what was reviewed and what was found',
          'retention of the item and its approvals, and of the evidence that the review happened',
        ];

  const citation =
    regime === 'pre_approval_required'
      ? FINRA_10_06(
          'RN 10-06 A5',
          'The static content remains posted until it is changed ... a registered principal of the firm must approve all static content on a page of a social networking site ... before it is posted.',
        )
      : FINRA_10_06(
          'RN 10-06 A5',
          'Interactive posts on sites such as Twitter and Facebook ... constitute an interactive electronic forum, and firms are not required to have a registered principal approve these communications prior to use. Of course, firms still must supervise these communications.',
        );

  const statement = upgradedByDeskMode
    ? `${surface} is interactive and would normally need risk-based review rather than pre-approval, but the desk is in heightened mode, so this item pre-clears.`
    : regime === 'pre_approval_required'
      ? `${surface} is static content — it stays up until someone changes it — so it must be cleared before it goes up.`
      : `${surface} is interactive content. It does not pre-clear, and in exchange the desk owes a sampling record and retention. That is a different duty, not a lighter one.`;

  return { surface, surfaceClass, regime, upgradedByDeskMode, obligations, citation, statement };
}

/**
 * Named here so no surface can imply this module checked more than it did.
 *
 * §7.2 certifies the REVIEW half of `risk_based_review_plus_retention`. It does not
 * check retention: whether the published bytes were pasted back, whether the record
 * survives the 90-day sweep, and whether it is producible on request are the record
 * lane's questions, and answering them from here would be a claim this file cannot
 * keep.
 */
export const SUPERVISION_CHECK_COVERS_REVIEW_ONLY =
  'This check certifies the review half of the interactive regime — that a principled sampling record exists for the period. It does not check retention: whether the published text was captured, and whether it is still producible, is checked elsewhere and its absence is not visible here.';

/** Why an interactive period is or is not evidenced. */
export type SupervisionState =
  /** A sampling record exists, is internally consistent, and its selection basis is reproducible. */
  | 'evidenced'
  /** The period had no items. Nothing to sample, and that is not a failure. */
  | 'no_population'
  /** No sampling record at all. */
  | 'record_absent'
  /** A record exists but nothing was reviewed. */
  | 'no_review_performed'
  /** The selection basis cannot be reproduced, so the sample rate is not a claim about anything. */
  | 'basis_unfalsifiable'
  /** The record contradicts itself, e.g. more reviewed than existed. */
  | 'record_inconsistent';

/**
 * Selection bases that cannot be reproduced. "Spot checks" is not a sampling method,
 * it is a description of having looked at some things.
 *
 * `random` is treated as unfalsifiable UNLESS the basis also carries a number — a seed,
 * an every-Nth rule, a percentage — because randomness without a recorded seed cannot
 * be re-run and therefore cannot be audited.
 */
export const UNFALSIFIABLE_BASIS_TERMS: readonly string[] = [
  'spot check',
  'spot checks',
  'ad hoc',
  'as needed',
  'when time allows',
  'gut feel',
  'eyeballed',
  'whatever looked risky',
];

export interface InteractiveSupervisionAssessment {
  readonly state: SupervisionState;
  /**
   * Reviewed over population, or `null`. NEVER 0 for an absent record: absence is not
   * a rate of zero, and a panel that renders 0% for "we have no record" is inventing a
   * measurement.
   */
  readonly sampleRate: number | null;
  readonly refusals: readonly Refusal[];
  readonly statement: string;
  readonly matchedTerms: readonly string[];
}

/**
 * Certify — or refuse to certify — one period of the interactive lane.
 *
 * The obligation being tested is 2210(b)(3)'s substitute for pre-use review, and the
 * transferable idea is the whole reason this function exists: a desk that cannot review
 * everything must be able to prove its sampling was principled. So the artefact is the
 * record, generated by the tool, not a memo written in January about what someone did
 * last June.
 */
export function evaluateInteractiveSupervision(
  record: ReviewSamplingRecord | null,
): InteractiveSupervisionAssessment {
  const citation = FINRA_2210(
    '2210(b)(3)',
    'Where the procedures do not require review of institutional communications prior to first use, they must include provision for the education and training of associated persons, documentation of such education and training, and surveillance and follow-up to ensure that such procedures are implemented and adhered to; evidence that these supervisory procedures have been implemented and carried out must be retained.',
  );

  if (record == null) {
    return {
      state: 'record_absent',
      sampleRate: null,
      matchedTerms: [],
      statement:
        'There is no sampling record for this period, so the desk can show neither that it reviewed everything nor that it sampled principledly. This is not a 0% sample rate; it is no evidence either way.',
      refusals: [
        refuse(
          'REVIEW_SAMPLING_RECORD_ABSENT',
          'Interactive items do not pre-clear, and the duty that replaces pre-approval is a documented, risk-based review. With no sampling record for the period, neither duty was discharged.',
          citation,
          {
            kind: 'supply_data',
            missing: 'a review sampling record for the period: population, count, what was reviewed, how items were selected, findings',
            whoCanSupply: 'the reviewer, generated by the desk rather than written afterwards',
          },
          null,
        ),
      ],
    };
  }

  if (record.populationCount < 0 || record.reviewedCount < 0 || record.reviewedCount > record.populationCount) {
    return {
      state: 'record_inconsistent',
      sampleRate: null,
      matchedTerms: [],
      statement: `The record says ${record.reviewedCount} of ${record.populationCount} items were reviewed, which cannot be true. A record that contradicts itself is not evidence of review.`,
      refusals: [
        refuse(
          'REVIEW_SAMPLING_RECORD_ABSENT',
          `This sampling record reports reviewing ${record.reviewedCount} of ${record.populationCount} items. It is arithmetically impossible, so the period has no usable evidence of review.`,
          citation,
          {
            kind: 'supply_data',
            missing: 'a corrected population and reviewed count for the period',
            whoCanSupply: record.reviewer,
          },
          `${record.reviewedCount}/${record.populationCount}`,
        ),
      ],
    };
  }

  if (record.populationCount === 0) {
    return {
      state: 'no_population',
      sampleRate: null,
      matchedTerms: [],
      statement: `No interactive items fell in the period ${record.periodFrom} to ${record.periodTo} under the population "${record.population}", so there was nothing to sample. The rate is undefined, not zero.`,
      refusals: [],
    };
  }

  const basis = record.selectionBasis.trim();
  const matchedTerms = matchTerms(basis, UNFALSIFIABLE_BASIS_TERMS);
  const bareRandom = /random/i.test(basis) && !/\d/.test(basis);
  if (basis.length === 0 || matchedTerms.length > 0 || bareRandom) {
    return {
      state: 'basis_unfalsifiable',
      sampleRate: record.reviewedCount / record.populationCount,
      matchedTerms,
      statement:
        'The selection basis cannot be reproduced, so the sample rate does not describe a method. A rate over an unreproducible selection is a number without a claim attached.',
      refusals: [
        refuse(
          'REVIEW_SAMPLING_BASIS_UNFALSIFIABLE',
          basis.length === 0
            ? 'The sampling record does not say how items were chosen, so its sample rate is unfalsifiable.'
            : bareRandom
              ? 'The selection basis says the sample was random but records no seed or rule, so it cannot be re-run and cannot be audited.'
              : `The selection basis reads "${basis}", which describes having looked at some things rather than a method that can be re-run.`,
          citation,
          {
            kind: 'supply_data',
            missing: 'a selection basis that another person could re-run: a seed, an every-Nth rule, or an explicit risk-stratum rule',
            whoCanSupply: record.reviewer,
          },
          matchedTerms[0] ?? (basis.length === 0 ? null : basis),
        ),
      ],
    };
  }

  if (record.reviewedCount === 0) {
    return {
      state: 'no_review_performed',
      sampleRate: 0,
      matchedTerms: [],
      statement: `${record.populationCount} interactive items fell in the period and none were reviewed. Here the rate really is zero, and it is a finding.`,
      refusals: [
        refuse(
          'DATA_ABSENT_NOT_ZERO',
          `${record.populationCount} interactive items went out in this period and the record shows none were reviewed. The duty that replaces pre-approval was not performed.`,
          citation,
          { kind: 'human_authority', role: 'policy' },
          `0/${record.populationCount}`,
        ),
      ],
    };
  }

  return {
    state: 'evidenced',
    sampleRate: record.reviewedCount / record.populationCount,
    matchedTerms: [],
    statement: `${record.reviewedCount} of ${record.populationCount} items reviewed under "${record.population}", selected by "${basis}", strata: ${record.riskStrata.length > 0 ? record.riskStrata.join(', ') : 'none recorded'}. ${SUPERVISION_CHECK_COVERS_REVIEW_ONLY}`,
    refusals: [],
  };
}

/* ──── §7.1 The static lane ──── */

/**
 * A static item and its clearance state.
 *
 * `eligibleApprovers` is the field most tools do not have, and it is what makes doctrine
 * rule 8 possible: in a two-person workspace where the only other eligible approver is
 * the author's manager who is also the author, four-eyes is not slow, it is IMPOSSIBLE,
 * and the instrument should say so rather than accept a click and record a lie.
 */
export interface StaticApprovalRecord {
  readonly surface: ContentSurface;
  readonly author: ActorId;
  /** Hash of the text as it stands now. Clearances bound to a different hash are void. */
  readonly contentHash: ContentHash;
  readonly clearances: readonly Clearance[];
  /** Actors who may clear this surface class, as the workspace currently stands. */
  readonly eligibleApprovers: readonly ActorId[];
}

export interface StaticApprovalAssessment {
  readonly satisfied: boolean;
  /** Blocking clearances that are valid for the CURRENT content hash. */
  readonly validClearances: readonly Clearance[];
  /** Clearances voided because the text changed under them. */
  readonly voidedClearances: readonly Clearance[];
  readonly refusals: readonly Refusal[];
  readonly statement: string;
}

/**
 * Evaluate the static lane. Pre-approval, bound to bytes, by somebody else.
 *
 * Three failures, in the order they matter:
 *  1. `SELF_APPROVAL_FORBIDDEN` — the author cleared their own words. 2210(b)(4)(A)(iii)
 *     requires naming the preparer where there was no approver, i.e. the rule assumes
 *     preparer ≠ approver, and separation of duties must be impossible to breach rather
 *     than discouraged.
 *  2. `CLEARANCE_VOID_CONTENT_CHANGED` — the text moved after clearance. Otherwise four
 *     eyes silently degrades into four eyes on an earlier draft, which is the most
 *     common real failure of these systems.
 *  3. `FOUR_EYES_UNACHIEVABLE` — nobody else can clear it. Said out loud, because a
 *     surface that performs four-eyes it cannot deliver is worse than one that admits it.
 */
export function evaluateStaticPreApproval(record: StaticApprovalRecord): StaticApprovalAssessment {
  const refusals: Refusal[] = [];
  const blocking = record.clearances.filter((c) => c.mode === 'blocking');
  const validClearances = blocking.filter(
    (c) => c.contentHash === record.contentHash && c.reviewer !== record.author,
  );
  const voidedClearances = blocking.filter((c) => c.contentHash !== record.contentHash);
  const selfCleared = blocking.filter((c) => c.reviewer === record.author);
  const others = record.eligibleApprovers.filter((a) => a !== record.author);

  const preApproval = FINRA_2210(
    '2210(b)(1)(A)',
    'An appropriately qualified registered principal of the member must approve each retail communication before the earlier of its use or its filing with FINRA.',
  );

  if (selfCleared.length > 0) {
    refusals.push(
      refuse(
        'SELF_APPROVAL_FORBIDDEN',
        `${record.author} both wrote and cleared this ${record.surface}. Separation of duties is the point of clearance; one person doing both is not a clearance, it is a record of intent.`,
        preApproval,
        { kind: 'human_authority', role: 'reputation' },
        record.author,
      ),
    );
  }

  if (voidedClearances.length > 0) {
    refusals.push(
      refuse(
        'CLEARANCE_VOID_CONTENT_CHANGED',
        `The text changed after it was cleared, so ${voidedClearances.length} clearance(s) are void. They were given to different bytes.`,
        DESK_POLICY(
          'clearance binds to bytes',
          'A clearance is bound to a content hash. If the text changes the clearance is void, because otherwise four eyes degrades into four eyes on an earlier draft.',
        ),
        { kind: 'human_authority', role: voidedClearances[0]!.role },
        voidedClearances[0]!.contentHash,
      ),
    );
  }

  if (validClearances.length === 0) {
    if (others.length === 0) {
      refusals.push(
        refuse(
          'FOUR_EYES_UNACHIEVABLE',
          `${record.surface} is static content and must be cleared before it goes up, and this workspace has nobody other than ${record.author} who can clear it. The instrument cannot deliver four eyes here and will not pretend to.`,
          preApproval,
          {
            kind: 'not_recoverable',
            why: 'No second eligible approver exists in this workspace. This is an organisational fact, not a state of the draft, and no edit clears it.',
          },
          record.author,
        ),
      );
    } else if (voidedClearances.length === 0 && selfCleared.length === 0) {
      refusals.push(
        refuse(
          'PRE_APPROVAL_MISSING',
          `${record.surface} is static content: it stays up until someone changes it, so it must be cleared before it goes up. No blocking clearance is recorded.`,
          preApproval,
          { kind: 'human_authority', role: 'reputation' },
          null,
        ),
      );
    }
  }

  const satisfied = refusals.length === 0 && validClearances.length > 0;
  const statement = satisfied
    ? `Cleared for use by ${validClearances.map((c) => `${c.reviewer} (${c.role})`).join(', ')}, bound to the current text.`
    : `Not cleared for use: ${refusals.map((r) => r.code).join(', ') || 'no blocking clearance recorded'}.`;

  return { satisfied, validClearances, voidedClearances, refusals, statement };
}
