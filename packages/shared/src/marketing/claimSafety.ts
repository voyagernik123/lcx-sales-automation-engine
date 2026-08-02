/**
 * MARKETING CLAIM SAFETY — the gate that turns four prompt sentences into refusals.
 *
 * `apps/api/src/ai/socialReply.ts:31-55` states four HARD RULES to the model: no
 * price or return promises, no listing timelines, nothing reading as financial
 * advice, no support-outcome claims, no fact about LCX it was not given. Not one of
 * them is checked against what comes back. `sanitiseDraft` removes links and
 * address-shaped tokens and stops there, so the entire class of harm with the
 * highest regulatory cost is enforced by hope — by the layer that file itself calls
 * the weakest. This module is that missing check, and it is deliberately pure so the
 * API and the web surface score a draft identically.
 *
 * THE CENTRAL DISTINCTION IS STRIP VERSUS REFUSE, AND IT IS NOT A SEVERITY DIAL.
 *
 *  - STRIP is for carriers of no meaning: zero-width joiners, bidi overrides,
 *    non-breaking spaces, an echoed prompt fence. Removing them changes nothing a
 *    reader would have understood, so `sanitise.ts:27-30` is right that refusing
 *    there would only teach the operator the tool is broken.
 *  - REFUSE is the only honest answer to a regulated promise. "LCX will list your
 *    token in Q3" with the date deleted is still a listing promise, and now the
 *    operator cannot see what was wrong with it. So a refusal here does not soften
 *    the draft: `usableText` becomes `null`. There is no path through this module
 *    that returns a quietly de-fanged version of a promise, because that path is how
 *    a promise reaches a timeline with a compliance badge on it.
 *
 * WHAT THIS GATE READS, AND WHAT IT CANNOT: it reads OUR WORDS. It does not know
 * what is under embargo (MiCA Art 90), what the author holds (Art 91(3)(c)), or
 * whether the mandated Art 7 boilerplate fits — those are joins against state and
 * arithmetic, they live in their own engines, and a `clear` verdict from THIS module
 * is not a statement about them. `MARKETING_RULES_DISCLOSURE` travels on every
 * outcome for that reason.
 *
 * REUSE, NOT REBUILD. The claim library (`../claims/`) is 1 392 pure lines that no
 * marketing file imports today. This module consumes it — `getClaimById` for real id
 * resolution, `getClaimsForJurisdictionAndCategory` for coverage, and
 * `validateDraftOutput` for the two of its six rules that mean anything off a sales
 * pipeline. Its three known hazards are routed around rather than patched, because
 * `claims/` is not this compartment's to edit:
 *
 *   1. `validateDraftOutput` hard-requires `contactName` and `projectName` to appear
 *      in the body (`messageRules.ts:60,69`) and would emit two guaranteed false
 *      errors on any marketing draft. Both are passed as `''`, and
 *      `String.includes('')` is unconditionally true, so those rules cannot fire.
 *      Belt and braces: only `REUSED_RULE_IDS` are read out of the result, so a
 *      future change there cannot leak a sales-shaped error into a marketing verdict.
 *   2. `DEAL_CLOSING_PHRASES` contains `buy {{ticker}}`, which becomes the literal
 *      `"buy "` when no ticker is supplied (`messageRules.ts:97`) — every marketing
 *      draft containing the word "buy" would fail. A non-empty sentinel ticker is
 *      passed so that substitution cannot match prose.
 *   3. `claims.test.ts:79` pins `templates.length === 9`. Nothing here registers a
 *      template, adds a claim or mutates the library, and a test asserts that.
 *
 * Pure and total: no I/O, no clock, no randomness, no module-level mutable state.
 * Every regex here is declared without the `g` flag, because a module-level global
 * regex carries `lastIndex` between calls and would make this gate answer
 * differently on the second identical draft.
 */
import { getClaimById, getClaimsForJurisdictionAndCategory } from '../claims/claims.js';
import { validateDraftOutput } from '../claims/messageRules.js';
import type { ClaimCategory, Channel, DraftInput, DraftOutput, Jurisdiction } from '../claims/types.js';
import {
  MARKETING_RULES_DISCLOSURE,
  VERB_PRODUCES_OWN_TEXT,
  type Disposition,
  type EngagementVerb,
  type GateVerdict,
  type MarketingViolation,
  type ProductRegulatoryStatus,
  type Refusal,
  type RefusalCode,
  type RefusalRecovery,
  type RuleCitation,
} from './types.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 VERSION — stamped onto every refusal and violation                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Bump this when a rule is added, removed or its behaviour changes. It lands in the
 * audit record next to the verdict, so "why did this pass in March" is answerable
 * without archaeology. Never reuse a number.
 */
export const CLAIM_SAFETY_RULESET_VERSION = 1;

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE CHANNEL NOTION — this gate's own, because `claims/Channel` has no 'x' */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `claims/types.ts:13` defines `Channel = 'email' | 'linkedin' | 'telegram'`. There
 * is no `'x'`, and that file is not this compartment's to widen — so this gate
 * carries its own channel notion rather than passing `'telegram'` as a lie.
 *
 * `x_public` is separate from every other value because of one legal fact, not for
 * tidiness: on a public timeline there is no earlier moment and no private document.
 * Art 81(2) requires the CASP to inform a prospective client whether advice is
 * independent "in good time before providing advice", and Art 81(1) requires a
 * suitability assessment. Neither is achievable inside a reply, which is why an
 * advice finding on `x_public` is `not_recoverable` while the same words on a
 * one-to-one channel can in principle be routed to someone authorised to say them.
 */
export type SafetyChannel = 'x_public' | 'linkedin' | 'telegram' | 'email' | 'web_page';

/** Channels where the audience is the public, unknown in jurisdiction and in kind. */
const PUBLIC_TIMELINE_CHANNELS: readonly SafetyChannel[] = ['x_public'];

export function isPublicTimeline(channel: SafetyChannel): boolean {
  return PUBLIC_TIMELINE_CHANNELS.includes(channel);
}

/**
 * The `channel` field of the probe handed to `validateDraftOutput`.
 *
 * `validateDraftOutput` never reads `draft.channel` (`messageRules.ts:53-122` reads
 * `body`, `claimsUsed`, `input.contactName`, `input.projectName` and
 * `input.projectTicker`, and nothing else), so this value is INERT — it exists
 * because the parameter type demands one. A test pins that inertness by running the
 * same text under every `Channel` and asserting identical findings; if that test
 * ever fails, the mapping has become load-bearing and must be replaced with a real
 * decision rather than quietly re-tuned.
 */
const PROBE_CHANNEL: Channel = 'email';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 STRIP — the layer that is allowed to edit the text                       */
/* ══════════════════════════════════════════════════════════════════════════ */

export type StripKind =
  /** U+200B-200D, U+2060, U+FEFF, U+00AD — invisible, and used to split keywords. */
  | 'zero_width'
  /** U+202A-202E, U+2066-2069 — reorder rendered text without changing the bytes. */
  | 'bidi_control'
  /** NBSP and friends, folded to U+0020 so a rule cannot be evaded with a space. */
  | 'nonstandard_space'
  /** The literal untrusted-input fence, echoed back by a model that was fed it. */
  | 'prompt_fence';

export interface StripRecord {
  readonly kind: StripKind;
  readonly count: number;
  /** Why removing this changed no meaning. Rendered next to the draft. */
  readonly note: string;
}

/**
 * The fence `ai/socialReply.ts:87` wraps untrusted input in. It is a fixed literal,
 * so a hostile reply can contain it and close the block early; the drafting path
 * must strip it from the input, and this gate strips it from the OUTPUT in case the
 * model echoed it back. Kept in sync by name, not by import: `shared` may not import
 * from `apps/api`.
 */
const PROMPT_FENCE = '<<<UNTRUSTED_PUBLIC_REPLY>>>';

/* Written as escapes, not as the characters themselves: a literal zero-width joiner
 * inside a character class is invisible in every editor and in every code review,
 * which is exactly the property an evasion relies on. */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/;
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/;
const NONSTANDARD_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/;

function countMatches(text: string, single: RegExp): number {
  const all = new RegExp(single.source, single.flags.includes('u') ? 'gu' : 'g');
  return text.match(all)?.length ?? 0;
}

/**
 * Remove the meaningless carriers and record what was removed. Deliberately does NOT
 * normalise the whole string: `String.normalize('NFKC')` would rewrite ligatures and
 * fullwidth forms in an operator's own text, and a gate that hands back words the
 * human did not write is a gate the human stops trusting. Normalisation is applied
 * to a MATCHING COPY only (§3).
 */
export function stripMeaninglessCarriers(text: string): {
  text: string;
  strips: readonly StripRecord[];
} {
  const strips: StripRecord[] = [];
  let out = text;

  const fenceCount = out.split(PROMPT_FENCE).length - 1;
  if (fenceCount > 0) {
    out = out.split(PROMPT_FENCE).join(' ');
    strips.push({
      kind: 'prompt_fence',
      count: fenceCount,
      note: 'The untrusted-input fence was present in the draft; it is scaffolding, never content.',
    });
  }

  const zw = countMatches(out, ZERO_WIDTH);
  if (zw > 0) {
    out = out.replace(new RegExp(ZERO_WIDTH.source, 'g'), '');
    strips.push({
      kind: 'zero_width',
      count: zw,
      note: 'Invisible characters removed. They render as nothing and are the cheapest way to split a word a rule looks for.',
    });
  }

  const bidi = countMatches(out, BIDI_CONTROL);
  if (bidi > 0) {
    out = out.replace(new RegExp(BIDI_CONTROL.source, 'g'), '');
    strips.push({
      kind: 'bidi_control',
      count: bidi,
      note: 'Bidirectional overrides removed. They change the order text is displayed in without changing the text.',
    });
  }

  const spaces = countMatches(out, NONSTANDARD_SPACE);
  if (spaces > 0) {
    out = out.replace(new RegExp(NONSTANDARD_SPACE.source, 'g'), ' ');
    strips.push({
      kind: 'nonstandard_space',
      count: spaces,
      note: 'Non-breaking and exotic spaces folded to a plain space, so a rule cannot be evaded by the width of a gap.',
    });
  }

  return { text: out, strips };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE MATCHING COPY — how the gate reads, versus what it hands back        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * NFKC-fold a copy for matching only. This is where fullwidth and compatibility
 * forms collapse, so `ｂｕｙ` cannot walk past a rule that `buy` trips.
 *
 * What it does NOT do, deliberately: it does not transliterate homoglyphs. Mapping
 * Cyrillic `а` to Latin `a` would be a guess about intent applied to a human's words,
 * and getting it wrong silently rewrites a legitimate draft in Serbian. Mixed script
 * is reported instead — `obfuscation.mixed_script` below — because "this token is
 * built from two alphabets" is a fact, and "the author meant the Latin one" is not.
 */
function matchingCopy(text: string): string {
  return text.normalize('NFKC');
}

/** Sentence-ish split, used by the conjunction rules. Cheap on purpose: the only
 * property needed is that two spans in the same clause are read together and two
 * spans a paragraph apart are not. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/** A token carrying two alphabets at once. Not stripped, reported. */
const MIXED_SCRIPT_TOKEN = /\b(?=\S*\p{Script=Latin})(?=\S*[\p{Script=Cyrillic}\p{Script=Greek}])\S+/u;

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 THE REFUSAL TABLE — one row per thing LCX may not say                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * A lexical refusal rule.
 *
 * `and` + `sameSentence` exist because precision is the difference between a gate an
 * operator reads and a gate an operator learns to click past. "Deposits are live
 * today" is a fact; "we will credit you today" is a dated commitment. The difference
 * is not a word, it is a co-occurrence inside one clause, so that is what is encoded.
 */
interface LexicalRule {
  /** Dotted id. Stable: it appears in violation rows and in refusal-frequency counts. */
  readonly id: string;
  readonly code: RefusalCode;
  /** One sentence to the operator, active voice, no hedging. */
  readonly sentence: string;
  readonly citation: RuleCitation;
  /**
   * A function where the honest recovery depends on the channel. Never a function of
   * the text: a recovery that varies with wording is a hint about how to get past the
   * gate, which is the opposite of what a recovery is for.
   */
  readonly recovery: RefusalRecovery | ((channel: SafetyChannel) => RefusalRecovery);
  /** At least one must match. */
  readonly any: readonly RegExp[];
  /** When present, at least one of these must match as well. */
  readonly and?: readonly RegExp[];
  /** When true, `any` and `and` must match inside the SAME sentence. */
  readonly sameSentence?: boolean;
}

/* ── Citations, written once. Provision text is quoted from primary sources; the
 *    research lane read EUR-Lex CELEX:32023R1114 directly rather than a summary. ── */

const CITE_ART_66_2: RuleCitation = {
  instrument: 'mica',
  provision: 'Art 66(2)',
  text: 'Crypto-asset service providers shall provide their clients with information that is fair, clear and not misleading, including in marketing communications, which shall be identified as such. Crypto-asset service providers shall not, deliberately or negligently, mislead a client in relation to the real or perceived advantages of any crypto-assets.',
};

const CITE_ART_81_1: RuleCitation = {
  instrument: 'mica',
  provision: 'Art 3(1) read with Art 81(1)',
  text: '"Providing advice on crypto-assets" means offering, giving or agreeing to give personalised recommendations to a client, either at the client\'s request or on the initiative of the crypto-asset service provider providing the advice, in respect of one or more transactions relating to crypto-assets, or the use of crypto-asset services. Art 81(1) then requires the provider to assess whether the crypto-assets are suitable for that client, taking into account their knowledge, experience, objectives, risk tolerance and ability to bear losses.',
};

const CITE_ESMA_HALO: RuleCitation = {
  instrument: 'esma_halo',
  provision: "DON'T, read with Art 66(1)-(2)",
  text: "The CASP's regulatory status is used as a promotional tool. When engaging in unregulated activities, information provided to the client or potential client, including marketing materials and other documentation, includes a reference to the CASP being authorised/regulated by an NCA.",
};

const CITE_ESMA_STATUS_DO: RuleCitation = {
  instrument: 'esma_halo',
  provision: 'DO, read with Art 66(1)-(2)',
  text: 'All marketing communications should indicate clearly if a product and/or service offered by a CASP is regulated or not. Such indication should be clearly visible to clients and prospective clients.',
};

const CITE_DESK_POLICY_FAULT: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Fault admissions are cleared by legal, not by the desk',
  text: 'A public admission of fault by the official account is a discoverable statement made on behalf of the company. It is not a wording problem, so it has no wording fix: it is cleared by legal or it is not made.',
};

const CITE_DESK_POLICY_SUBSTANTIATION: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Every figure carries a source, or it is not published',
  text: 'A figure produced by a drafting model that appears in neither the item it answers nor an approved claim is unsourced by construction. The desk publishes the source or the desk does not publish the figure.',
};

/* ── Building blocks, named so a rule reads as a sentence ── */

const FORWARD_VERB = /\b(will|'ll|shall|gonna|going to|about to|set to|due to|expected to|poised to)\b/i;
/**
 * INFLECTED ON PURPOSE. The first version listed bare stems — `hit`, `reach`, `break` —
 * and `\bhit\b` does not match "hits", because there is no word boundary between `t` and
 * `s`. So the entire present-tense form slipped through: "BTC hits $250,000 by December"
 * matched no price rule at all. That is the SINGLE COMMONEST SHAPE of a prediction on a
 * public timeline, and it fails in the unsafe direction — a present-tense forecast reads as
 * a statement of fact, which is worse than a hedged one.
 *
 * Found by exercising `checkClaimSafety` against exactly that string during the integration
 * pass; it came back with `UNSOURCED_FIGURE` only. The refusal happened, so the like was
 * still blocked — but under a code that says "cite your source", which invites an operator
 * to add a citation to a price call.
 */
const PRICE_MOVE = /\b(hits?|reach(es)?|touch(es)?|breaks?|breakout|tops?|moons?|pumps?|surges?|rall(y|ies)|doubles?|triples?|explodes?|skyrockets?|dips? to|bottoms? at|retraces? to|new ath)\b/i;

/**
 * A marker that puts a sentence in the future WITHOUT a modal verb. Months and bare years
 * are here and nowhere else: `TIMELINE_TOKEN` covers the desk's own operational horizons
 * (today, this week, by Friday, Q3) because that is what a support commitment sounds like,
 * and a price forecast sounds different — it reaches for a month or a year.
 *
 * Kept SEPARATE from `TIMELINE_TOKEN` rather than merged into it. Merging would have widened
 * the dated-commitment rule to fire on "our audit report covers 2025", which is a factual
 * statement about a document, and a rule that cries wolf is the mechanism by which a
 * reviewer stops reading.
 */
const FUTURE_HORIZON =
  /\b(by|before|in|until|come)\s+(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?|20[2-9]\d)\b|\b(this|next) (cycle|bull run|halving)\b|\bend of (the )?(year|cycle)\b/i;

/**
 * A price-move verb sitting NEXT TO a currency level, in that order.
 *
 * Adjacency is doing real work. `LexicalRule.and` means "at least one of these also
 * matches", so a rule cannot ask for three separate conditions — and asking only for a
 * price-move verb plus a future horizon would fire on "we reach 10,000 users by December",
 * which is a growth statement and not a price call. Requiring a CURRENCY figure within a
 * short span of the verb excludes it: a bare count is not a level.
 *
 * The residual overlap, stated rather than hidden: "we reach $10m ARR by December" matches.
 * That is a forward-looking financial commitment from the official account, which the
 * dated-commitment rule also refuses — so the item is blocked either way, and the cost of
 * the overlap is one imprecise sentence rather than a miss.
 */
const PRICE_MOVE_NEAR_LEVEL =
  /\b(hits?|reach(es)?|touch(es)?|breaks?|tops?|doubles?|triples?|dips? to|bottoms? at|retraces? to)\b[^.!?]{0,40}?(?:[$€£]\s?\d[\d,.]*\s?(?:k|m|bn|b|t)?\b|\b\d[\d,.]*\s?(?:usd|eur|usdt|usdc|chf)\b)/i;
const CURRENCY_FIGURE = /(?:[$€£]\s?\d[\d,.]*\s?(?:k|m|bn|b|t)?\b|\b\d[\d,.]*\s?(?:usd|eur|usdt|usdc|chf)\b)/i;
const PERCENT_FIGURE = /\b\d[\d.,]*\s?%/;
const TIMELINE_TOKEN =
  /\b(today|tonight|tomorrow|this (week|month|quarter)|next (week|month|quarter)|by (mon|tues|wednes|thurs|fri|satur|sun)day|by (the )?end of (the )?(day|week|month|quarter|year)|(with)?in \d+ (minutes?|hours?|days?|weeks?)|q[1-4]( \d{4})?)\b/i;
const COMMITMENT =
  /\b(we|lcx|i)\s?('ll|will|shall)\b|\byou('ll| will) (get|have|receive|be)\b|\bwill be (credited|processed|resolved|fixed|live|completed|refunded|listed|enabled)\b/i;
const TRANSACTION_VERB =
  /\b(buy|sell|hold|swap|stake|unstake|add|exit|enter|accumulate|withdraw|deposit|convert|trade|invest|allocate)\b/i;
const COMMERCIAL_NOUN =
  /\b(exchange|platform|venue|fees?|spreads?|rates?|liquidity|security|custody|prices?|market|marketplace|service|onboarding|execution|withdrawals?)\b/i;
/* Acronyms are matched case-SENSITIVELY: `/sec/i` also matches "30 sec", and a gate
 * that cries wolf on "back in 30 sec" is a gate nobody reads. */
const FOREIGN_AUTHORITY_ACRONYM = /\b(SEC|FINRA|CFTC|FDIC|FCA|BaFin|CySEC|MAS|VARA|ADGM|DFSA|JFSA|ASIC|NYDFS|OCC)\b/;
const FOREIGN_JURISDICTION =
  /\bin (the )?(us|usa|united states|uk|united kingdom|uae|dubai|singapore|japan|australia|canada|switzerland)\b/i;
const REGULATORY_WORD = /\b(regulated|licen[cs]ed|authoris(ed)?|authorized|registered|approved|supervised)\b/i;

/**
 * THE UNCONDITIONAL REFUSALS. Every row here is a promise, an admission or a
 * recommendation — substance, not formatting — so no row has a strip path.
 *
 * `recovery` is a function where the honest answer depends on the channel. Advice is
 * the case that matters: on a public timeline it is `not_recoverable`, because Art
 * 81(2)'s "in good time before providing advice" has no room to happen inside a
 * reply and, as the research lane put it, adding "NFA" changes the label rather than
 * the act — the MiCA definition turns on what was done. On a one-to-one channel the
 * same words can be routed to somebody authorised to say them, so the recovery there
 * names a human instead of pretending an edit will do.
 */
const LEXICAL_RULES: readonly LexicalRule[] = [
  {
    id: 'regulated_promise.price_language',
    code: 'REGULATED_PROMISE_PRICE',
    sentence: 'This draft predicts a price. Remove the prediction — a price call from the official account is not a wording problem and cannot be softened into one.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'edit_text', what: 'State observable facts about the venue instead of a direction, target or multiple.' },
    any: [
      /\bprice (target|prediction|forecast|projection)\b/i,
      /\b(to the moon|moonshot|next 100x|guaranteed pump|easy money|free money)\b/i,
      /\b\d{1,3}\s?x\b(?!\s*(faster|cheaper|better|worse|more|less|speed|throughput|volume|capacity))/i,
      /\b(bullish|bearish) (target|call)\b/i,
      /\b(undervalued|overvalued) at\b/i,
    ],
  },
  {
    id: 'regulated_promise.price_forecast',
    code: 'REGULATED_PROMISE_PRICE',
    sentence: 'This draft says a price will move. Delete the forecast; a forecast with the number removed is still a forecast.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'edit_text', what: 'Drop the forward-looking verb, or attribute the view to a named third party outside LCX rather than stating it as ours.' },
    any: [FORWARD_VERB],
    and: [PRICE_MOVE],
    sameSentence: true,
  },
  {
    id: 'regulated_promise.price_target',
    code: 'REGULATED_PROMISE_PRICE',
    sentence: 'This draft names a future price level. That is a price target and the desk does not publish price targets.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'edit_text', what: 'Remove the level, or restate it as a past observation with its source and its date.' },
    /* `and` is deliberately NOT a bare forward verb here. "$50 will be credited to
     * you" is a support statement, not a price target, and it is already caught by
     * the support-outcome and unsourced-figure rules — catching it a third time as a
     * price call would teach the operator that the price rule cries wolf. */
    any: [CURRENCY_FIGURE],
    and: [/\btarget\b/i, PRICE_MOVE],
    sameSentence: true,
  },
  {
    id: 'regulated_promise.price_present_tense_forecast',
    code: 'REGULATED_PROMISE_PRICE',
    sentence: 'This draft states a future price as though it were already a fact. Present tense does not make a forecast an observation — delete it; the desk does not publish price calls in any tense.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'edit_text', what: 'Remove the level and the horizon. If the point is that the asset is tradable, say that instead.' },
    /*
     * THE GAP THE OTHER THREE PRICE RULES LEFT. `price_forecast` needs a modal
     * (`will`, `set to`); `price_target` needs the literal word "target". Neither fires on
     * "BTC hits $250,000 by December", which is how a prediction is actually written.
     *
     * A FUTURE HORIZON IS REQUIRED and that is what keeps this precise. "BTC broke $100,000
     * last night" is a past observation about the market — it needs a source, which
     * `UNSOURCED_FIGURE` already demands, and calling it a price call would be a false
     * positive on a true statement. It is the horizon that turns a level into a forecast.
     */
    any: [PRICE_MOVE_NEAR_LEVEL],
    and: [FUTURE_HORIZON],
    sameSentence: true,
  },
  {
    id: 'regulated_promise.return_language',
    code: 'REGULATED_PROMISE_RETURN',
    sentence: 'This draft promises a return. An advertised return is the exact artefact regulators charge on, and it cannot be disclaimed into safety.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'not_recoverable', why: 'A public promise of return by the venue itself has no compliant short form. It belongs on a product page with its conditions, its assumptions and its risk warning, cleared before use.' },
    any: [
      /\b(apy|apr)\b/i,
      /\bguaranteed (returns?|profits?|yield|income|gains?)\b/i,
      /\brisk[- ]free\b/i,
      /\bno (risk|downside)\b/i,
      /\bpassive income\b/i,
      /\bdouble your (money|funds|investment|portfolio|stack)\b/i,
      /\b(up to|earn|make) \d[\d.,]*\s?%/i,
      /\bcan't lose\b/i,
    ],
  },
  {
    id: 'regulated_promise.return_figure',
    code: 'REGULATED_PROMISE_RETURN',
    sentence: 'This draft attaches a percentage to a yield or a reward. Publish it with its conditions on a cleared page, not in a reply.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'different_surface', suggestion: 'Link a page that carries the figure, the period it was measured over, and the conditions under which it does not hold.' },
    any: [PERCENT_FIGURE],
    and: [/\b(returns?|yield|apy|apr|earn(ing)?s?|staking|rewards?|interest|profits?)\b/i],
    sameSentence: true,
  },
  {
    id: 'regulated_promise.listing',
    code: 'REGULATED_PROMISE_LISTING',
    sentence: 'This draft promises or teases a listing. Route it to the embargo check before any version of it exists as copyable text.',
    citation: {
      instrument: 'mica',
      provision: 'Art 66(2), read with Art 90(1)',
      text: 'Information to clients must be fair, clear and not misleading. Separately, Art 90(1) prohibits unlawful disclosure of inside information to any other person, and an unannounced admission to trading is capable of being inside information — so a teaser is a disclosure to the world, not a tone.',
    },
    recovery: { kind: 'human_authority', role: 'legal' },
    any: [
      /\bwill (be )?list(ed)?\b/i,
      /\blisting (is )?(coming|soon|confirmed|imminent|next)\b/i,
      /\bcoming soon\b/i,
      /\b(we|lcx) ('re|are|is) (adding|listing|about to list)\b/i,
      /\bgoing live (soon|shortly|this week|next week)\b/i,
      /\bstay tuned for (the )?listing\b/i,
      /\bsoon™\b/i,
    ],
  },
  {
    id: 'regulated_promise.timeline',
    code: 'REGULATED_PROMISE_TIMELINE',
    sentence: 'This draft commits the desk to a date. Say what is true now and who owns the next update instead of when it will be done.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'edit_text', what: 'Replace the date with the fact that is already true, plus the person or channel that will carry the next update.' },
    any: [COMMITMENT],
    and: [TIMELINE_TOKEN],
    sameSentence: true,
  },
  {
    id: 'forward_commitment.unconditional',
    code: 'UNCONDITIONAL_FORWARD_COMMITMENT',
    sentence: 'This draft makes a promise with no conditions on it. An "always" or a "never" from the official account is the sentence that gets quoted back.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'edit_text', what: 'State the current policy and the fact that it is a policy, not a guarantee about every future circumstance.' },
    any: [
      /\bwe (will|'ll) (always|never)\b/i,
      /\bwe (guarantee|promise|assure)\b/i,
      /\balways allow withdrawals\b/i,
      /\b(will|shall) never (be|go|fail|happen)\b/i,
      /\bunder no circumstances will we\b/i,
      /\byour (funds|assets|money) will (always )?(be|remain) (safe|secure)\b/i,
    ],
  },
  {
    id: 'support_outcome.asserted',
    code: 'SUPPORT_OUTCOME_ASSERTED',
    sentence: 'This draft asserts an outcome the desk cannot see. Support owns whether a specific account was made whole; the timeline is not where that is announced.',
    citation: CITE_ART_66_2,
    recovery: { kind: 'supply_data', missing: 'the resolved state of this specific case, from the system that actually holds it', whoCanSupply: 'the support owner for the ticket, in the ticket' },
    any: [
      /\byour (funds|assets|money|balance) (are|is) (safe|secure)\b/i,
      /\b(it|this|the issue|the bug|the problem) (is|has been|'s been) (fixed|resolved|sorted|solved)\b/i,
      /\byour (withdrawal|deposit|order|transfer|account|kyc|verification) (has been|was|is) (processed|completed|approved|restored|credited|released|unlocked)\b/i,
      /\byou (will|'ll) be (refunded|reimbursed|compensated|made whole)\b/i,
      /\bnothing (was|has been) lost\b/i,
      /\bno funds (were|are) (lost|affected|at risk)\b/i,
    ],
  },
  {
    id: 'fault.admission',
    code: 'FAULT_ADMISSION',
    sentence: 'This draft admits fault on behalf of LCX. That is a legal decision with a legal owner, and it is not made by whoever is holding the queue.',
    citation: CITE_DESK_POLICY_FAULT,
    recovery: { kind: 'human_authority', role: 'legal' },
    any: [
      /\bour (mistake|error|fault|bug|failure)\b/i,
      /\bwe (messed|screwed) (this )?up\b/i,
      /\bour (system|platform|api|exchange) (failed|went down|broke|was down)\b/i,
      /\bthis was (on us|our (fault|doing))\b/i,
      /\bwe (were|got) hacked\b/i,
      /\bwe lost (your|customer|user|client)\b/i,
      /\bwe (are|'re) (sorry|apologi[sz]e) (for|that we)\b/i,
      /\bwe (should have|shouldn't have|failed to)\b/i,
    ],
  },
  {
    id: 'advice.personalised',
    code: 'ART_81_PERSONALISED_RECOMMENDATION',
    sentence: 'This draft tells a specific person what to do with their money. That is the regulated service of advising, and a reply cannot be a compliant one.',
    citation: CITE_ART_81_1,
    recovery: (channel) =>
      isPublicTimeline(channel)
        ? {
            kind: 'not_recoverable',
            why: 'Art 81(1) requires a suitability assessment and Art 81(2) requires the independence disclosure "in good time before" the advice. Neither can happen inside a public reply, and a "not financial advice" label changes what the words are called rather than what was done.',
          }
        : { kind: 'human_authority', role: 'legal' },
    any: [
      /\byou should (buy|sell|hold|swap|stake|add|exit|move|withdraw|deposit|convert|trade|invest)\b/i,
      /\b(i|we) (would|'d) (buy|sell|hold|add|exit|stake|wait)\b/i,
      /\bif i were you\b/i,
      /\bnow (is|would be) a (good|great|perfect) time to (buy|sell|enter|exit|stake|invest)\b/i,
      /\bin your (case|position|situation|shoes)\b/i,
      /\b(buy|sell|accumulate|ape|dca|load up)( the)? (dip|now|here|more)\b/i,
      /\byour best (bet|move|option) (is|would be)\b/i,
    ],
  },
  {
    id: 'advice.personalised_context',
    code: 'ART_81_PERSONALISED_RECOMMENDATION',
    sentence: 'This draft reasons from this person’s own position to a transaction. Personalisation is what makes it advice, not the topic.',
    citation: CITE_ART_81_1,
    recovery: (channel) =>
      isPublicTimeline(channel)
        ? { kind: 'not_recoverable', why: 'The recommendation is already personalised to the counterparty. Removing the reasoning leaves the instruction, and removing the instruction leaves nothing that was asked for.' }
        : { kind: 'human_authority', role: 'legal' },
    any: [/\bgiven (that )?(you|your)\b/i, /\bsince you\b/i, /\bbecause you\b/i, /\bfor your (portfolio|position|situation|size)\b/i],
    and: [TRANSACTION_VERB],
    sameSentence: true,
  },
  {
    id: 'invented_licence.foreign_perimeter',
    code: 'INVENTED_LICENCE_CLAIM',
    sentence: 'This draft claims a permission in a jurisdiction outside the Liechtenstein authorisation. Name the actual authorisation or name none.',
    citation: {
      instrument: 'mica',
      provision: 'Art 66(2), read with Art 59(1)',
      text: 'Information to clients must be fair, clear and not misleading. A claim to be regulated by an authority that has not authorised the firm misleads about the protection a client has, and in the named jurisdiction it is a supervisory matter for that authority rather than for the FMA.',
    },
    recovery: { kind: 'edit_text', what: 'State only the authorisation LCX actually holds, and name the authority that granted it.' },
    any: [REGULATORY_WORD],
    and: [FOREIGN_AUTHORITY_ACRONYM, FOREIGN_JURISDICTION],
    sameSentence: true,
  },
  {
    id: 'invented_licence.mica_is_not_a_licence',
    code: 'INVENTED_LICENCE_CLAIM',
    sentence: 'Nobody is "MiCA-licensed" or "MiCA-approved" — MiCA is a regulation, and no authority approves a firm under it in those words. Say what LCX actually holds: authorisation as a crypto-asset service provider under MiCA, granted by the FMA.',
    citation: {
      instrument: 'mica',
      provision: 'Art 66(2), read with Art 7(1)(e)',
      text: 'Information to clients must be fair, clear and not misleading. Art 7(1)(e) requires a marketing communication for an offer to state that it "has not been reviewed or approved by any competent authority in any Member State of the European Union" — so a claim of approval UNDER MiCA asserts the opposite of a statement the same Regulation mandates elsewhere.',
    },
    recovery: { kind: 'edit_text', what: 'Write "authorised as a crypto-asset service provider under MiCA" and name the FMA as the authority that granted it.' },
    /*
     * THE GAP `INVENTED_LICENSE_PHRASES` (claims/messageRules.ts:15) LEAVES, and the one the
     * foreign-perimeter rule above does not reach. That list is US-shaped — SEC, FINRA, MSB,
     * NYDFS, FDIC — and the rule above needs a foreign AUTHORITY or a foreign JURISDICTION in
     * the sentence. "LCX is MiCA-licensed" has neither: MiCA is not an authority and
     * Liechtenstein is not foreign. Measured, not assumed — BaFin, FCA and CySEC all already
     * refuse through the rule above; this exact string came back clean.
     *
     * It is the most likely wording to be written in good faith, by someone who knows LCX is
     * authorised and reaches for the shortest way to say it. That is what makes it worth a
     * rule of its own rather than a note.
     *
     * NARROW BY CONSTRUCTION: the regulatory word must be adjacent to the instrument's name.
     * "Authorised as a CASP under MiCA" is the TRUE statement and must not fire — it is what
     * the recovery asks for, and a rule that refused its own recovery would be unusable.
     */
    any: [/\bmica[- ](licen[cs]ed|approved|registered|certified|accredited)\b/i,
      /\b(licen[cs]ed|approved|registered|certified|accredited)[- ]by[- ]mica\b/i],
    sameSentence: true,
  },
];

/**
 * REFUSALS THAT DEPEND ON SOMETHING THE CALLER KNOWS.
 *
 * These are separated from `LEXICAL_RULES` because their answer is not a property of
 * the text alone, and collapsing the two would hide that: a yield figure with a
 * published attestation behind it is a different object from the same figure with
 * nothing behind it, and only one of them is a lie.
 */
interface ConditionalRule extends LexicalRule {
  /** True when the condition that would EXCUSE the language is satisfied. */
  readonly satisfiedWhen: (input: ClaimSafetyInput) => boolean;
  /** Recorded as a warning-severity violation when `satisfiedWhen` is true — the
   *  language still has to carry its evidence on the face of the post. */
  readonly remedyWhenSatisfied: string;
}

const CONDITIONAL_RULES: readonly ConditionalRule[] = [
  {
    id: 'solvency.assertion',
    code: 'SOLVENCY_ASSERTION_WITHOUT_ATTESTATION',
    sentence: 'This draft asserts that the money is there. Nothing in this compartment can see that, so it cannot be published on this desk\'s word.',
    citation: {
      instrument: 'mica',
      provision: 'Art 66(2)',
      text: 'Crypto-asset service providers shall not, deliberately or negligently, mislead a client in relation to the real or perceived advantages of any crypto-assets. A solvency assertion is the highest-consequence form of that risk: it is relied on immediately and checked afterwards.',
    },
    recovery: {
      kind: 'supply_data',
      missing: 'a reference to a published attestation or reserve report that a reader can open',
      whoCanSupply: 'finance, with the treasury or auditor reference',
    },
    /* The reason this rule exists in this shape rather than as a wording rule: the
     * charged act in SEC v. Bankman-Fried was a reassurance, not an exaggeration. The
     * complaint pleads the 7 November 2022 tweet at para 78 and two earlier
     * withdrawal reassurances at para 52. Nothing about those sentences was fixable by
     * editing them; what was missing was that they were not true. So the gate demands
     * the artefact, not a softer verb. */
    any: [
      /\b(fully|100%) (backed|collateralis(ed|ing)|collateralized|reserved)\b/i,
      /\b1\s?[:\s]\s?1 (backed|backing|reserves?)\b/i,
      /\bproof of reserves\b/i,
      /\b(we are|we're|lcx is) solvent\b/i,
      /\ball (client|customer|user) (funds|assets) are (safe|secure|accounted for|intact)\b/i,
      /\b(assets|funds) are fine\b/i,
      /\bwe (hold|have) enough to cover\b/i,
      /\bwe (do not|don't|never) (invest|lend|touch|rehypothecate) (client|customer|user) (funds|assets)\b/i,
    ],
    satisfiedWhen: (input) => input.solvencyAttestationRef !== null && input.solvencyAttestationRef.trim().length > 0,
    remedyWhenSatisfied: 'The attestation reference must appear in the published text, not only in the record — a reader cannot check a reference they cannot see.',
  },
  {
    id: 'superlative.unsubstantiated',
    code: 'ART_66_2_UNSUBSTANTIATED_SUPERLATIVE',
    sentence: 'This draft claims to be the best at something and carries nothing to prove it. Art 66(2) is breached negligently as well as deliberately.',
    citation: CITE_ART_66_2,
    recovery: {
      kind: 'supply_data',
      missing: 'the measurement behind the superlative — what was compared, over what period, against whom',
      whoCanSupply: 'whoever produced the figure; if nobody did, the claim is not available',
    },
    any: [
      /\b(safest|fastest|cheapest|best|lowest|tightest|deepest|most (secure|trusted|liquid|regulated))\b/i,
      /\b(#1|number one|the only (regulated|licen[cs]ed|compliant))\b/i,
    ],
    and: [COMMERCIAL_NOUN],
    sameSentence: true,
    satisfiedWhen: (input) => input.substantiatedFigures.length > 0 || input.claimIdsCited.length > 0,
    remedyWhenSatisfied: 'Name the comparison in the text itself. A superlative whose basis is only in the record reads as an unsupported boast to everyone who sees it.',
  },
];

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 THE HALO RULE — where the line was drawn, and why                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ESMA35-1872330276-2329 names as a DON'T: "The CASP's regulatory status is used as a
 * promotional tool." LCX's brand line is *regulated in Liechtenstein*. So this rule
 * has to be willing to flag its owner's favourite sentence, or the whole gate is
 * decoration — and the interesting engineering problem is where the line goes, because
 * "never mention the licence" is both wrong and unusable: the same statement names as
 * a DO that "all marketing communications should indicate clearly if a product and/or
 * service offered by a CASP is regulated or not", which cannot be satisfied without
 * saying the word.
 *
 * WHERE THE LINE IS DRAWN HERE, and it is a judgement, recorded so it can be argued
 * with rather than discovered:
 *
 *   A FACTUAL STATUS STATEMENT is the status, stated, and nothing else in that clause.
 *   "LCX is authorised as a crypto-asset service provider in Liechtenstein." It
 *   answers "who regulates you", it is checkable against a register, and it carries no
 *   inference about anything else the firm sells. This CLEARS.
 *
 *   A PROMOTIONAL USE is the same fact placed so that it does work it cannot do.
 *   Three mechanically detectable forms, all inside one sentence:
 *     (a) the status sits in the same clause as a commercial benefit, a product or a
 *         call to action — "regulated in Liechtenstein, so trade with confidence".
 *         The status is being spent on the product's credibility, which is precisely
 *         the halo the statement describes;
 *     (b) the status is adorned with an intensifier or an exclusivity claim — "fully",
 *         "100%", "the only", "unlike others". Intensifying an authorisation adds
 *         nothing checkable and everything reassuring;
 *     (c) the item is about a product that is NOT inside MiCA's perimeter. Here the
 *         statement is explicit and needs no interpretation: mentioning the NCA
 *         authorisation while engaging in unregulated activities is the named DON'T,
 *         and there is no adornment test to apply.
 *
 * AND THE ABSENT-DATA CASE IS A REFUSAL, NOT A PASS (doctrine rule 3). If the caller
 * cannot say whether the named product is inside the perimeter, the gate cannot judge
 * either (a) or (c), so it refuses with `PRODUCT_REGULATORY_STATUS_UNKNOWN` instead of
 * reporting the more comfortable of the two answers.
 *
 * What this rule deliberately does NOT do: it does not touch `mica_awareness` claims
 * from the library (`mica-001..003`). Those are approved sentences and their approval
 * is somebody's recorded decision; this gate reports the halo pattern and names the
 * cited claim, and a human decides whether the approval still holds.
 */
const STATUS_PHRASES: readonly RegExp[] = [
  /\b(regulated|licen[cs]ed|authoris(ed)?|authorized|supervised)\b[^.!?]{0,40}?\b(in|by) (liechtenstein|the fma|fma|the eu|europe|the eea)\b/i,
  /\bmica[- ](regulated|licen[cs]ed|authoris(ed)?|authorized|compliant)\b/i,
  /\bfully regulated\b/i,
  /\bregulated (crypto[- ]?asset )?(exchange|platform|entity|venue|provider|service provider)\b/i,
  /\b(casp|crypto[- ]asset service provider) (licence|license|authorisation|authorization)\b/i,
  /\beu[- ]regulated\b/i,
];

/** (b) — intensifiers and exclusivity. These add reassurance, never information. */
const STATUS_ADORNMENT =
  /\b(fully|100%|completely|totally|the only|unlike|safest|most regulated|peace of mind|worry[- ]free|trust(ed)?|confidence|so you can|which is why)\b/i;

/** (a) — a benefit, a product or an instruction sharing the clause with the status. */
const STATUS_BENEFIT_CONTEXT = /\b(trade|trading|deposit|invest|earn|stake|buy|sell|onboard|sign up|join|switch|move your)\b/i;

/** A marker that says a product is OUTSIDE the perimeter. Satisfies the ESMA DO. */
const NOT_REGULATED_MARKER =
  /\b(not (a )?(mica[- ])?regulated|outside (the )?(scope of )?mica|unregulated|not covered by mica|no regulatory protection)\b/i;

/** "NFA" and friends. Recorded, and explicitly given no power to excuse anything. */
const DISCLAIMER_TOKENS =
  /\b(not (financial|investment) advice|nfa\b|dyor\b|this is not advice|for informational purposes only)\b/i;

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 REUSING THE CLAIM LIBRARY'S VALIDATOR — as an oracle, not as a copy      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The only two rules of `validateDraftOutput`'s six that survive the move off a sales
 * pipeline. `tag_person`, `project_hook`, `has_question` and `has_benefit` are about
 * a templated outbound email to a named contact at a named project and are meaningless
 * for a reply to a stranger; they are excluded by id rather than merely neutralised,
 * so a future edit to `messageRules.ts` cannot leak a sales-shaped error into a
 * marketing verdict.
 */
const REUSED_RULE_IDS = ['no_invented_licenses', 'no_deal_closing'] as const;

/**
 * The allowlist is a TYPE, not a filter applied after the fact: nothing in this module
 * can even ask `validateDraftOutput` about a rule id outside `REUSED_RULE_IDS`, so a
 * new sales-shaped rule appearing there cannot reach a marketing verdict by accident.
 */
type ReusedRuleId = (typeof REUSED_RULE_IDS)[number];

/**
 * A ticker that cannot occur in prose.
 *
 * `DEAL_CLOSING_PHRASES` includes `buy {{ticker}}`, and `messageRules.ts:97`
 * substitutes `input.projectTicker ?? ''` — so a null ticker turns the phrase into the
 * literal `"buy "` and every marketing draft containing the word "buy" fails on a rule
 * that was written about closing a token-listing deal. Passing a non-empty sentinel
 * makes the substitution harmless without touching a file this compartment does not
 * own. The sentinel is deliberately ugly: if it ever appears in a message on screen,
 * the cause is obvious.
 */
const PROBE_TICKER = 'ZZ_NO_TICKER_MARKETING_PROBE';

/**
 * Build the probe handed to `validateDraftOutput`.
 *
 * This is a PROBE, not a record: it is never stored, never returned and never shown.
 * `contactName` and `projectName` are `''` because `String.prototype.includes('')` is
 * unconditionally true, which is what disarms `messageRules.ts:60,69` — the two rules
 * that would otherwise emit a guaranteed false error on every marketing draft.
 */
function probe(text: string, claimIdsCited: readonly string[]): { draft: DraftOutput; input: DraftInput } {
  const draft: DraftOutput = {
    subject: '',
    body: text,
    channel: PROBE_CHANNEL,
    touchIndex: 0,
    claimsUsed: [...claimIdsCited],
    requiresHumanReview: true,
    templateId: 'marketing-claim-safety-probe',
    operatorEdited: false,
  };
  const input: DraftInput = {
    projectName: '',
    projectTicker: PROBE_TICKER,
    projectWebsite: null,
    projectChain: null,
    projectEuScore: null,
    projectUsPreScore: null,
    projectUsPostScore: null,
    projectBand: '',
    scoreReasons: [],
    contactName: '',
    contactTitle: null,
    contactRole: '',
    jurisdiction: 'global',
    clarityEnacted: false,
    touchIndex: 0,
    channel: PROBE_CHANNEL,
    market: null,
  };
  return { draft, input };
}

function reusedRuleFires(text: string, ruleId: ReusedRuleId, claimIdsCited: readonly string[]): boolean {
  const { draft, input } = probe(text, claimIdsCited);
  return validateDraftOutput(draft, input).violations.some(v => v.rule === ruleId);
}

/**
 * Find the smallest run of words that still trips a claim-library rule.
 *
 * `INVENTED_LICENSE_PHRASES` and `DEAL_CLOSING_PHRASES` are module-private consts in
 * `messageRules.ts` — not exported, and that file is not this compartment's to edit.
 * Copying the nine regexes here would create a second blocklist that drifts from the
 * first, which is the failure this instruction was written to prevent. So the
 * validator is used as an ORACLE instead: ask it about short windows of the text until
 * one of them answers yes, and that window is the span to show the operator.
 *
 * Bounded at four words because both phrase lists are one to three tokens long
 * ("SEC-approved", "open an account", "start your free trial"). If nothing that short
 * trips it, the span is reported as absent rather than guessed — a refusal that shows
 * the wrong span is worse than one that shows none.
 */
function smallestTriggeringWindow(text: string, ruleId: ReusedRuleId, claimIdsCited: readonly string[]): string | null {
  const words = text.split(/(\s+)/).filter(w => w.trim().length > 0);
  for (let size = 1; size <= 4; size += 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const window = words.slice(start, start + size).join(' ');
      if (reusedRuleFires(window, ruleId, claimIdsCited)) return window;
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §7 FIGURES — a number the desk cannot point at is a number it did not have   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every digit run in the draft, minus the ones that are identity rather than
 * assertion: `@LCX_Support_Desk`, `@user2019` and `#top100` name a person or a tag,
 * and a handle is not a claim about the world.
 *
 * Thousands separators are folded (`1,000` → `1000`) so the same figure written two
 * ways is the same figure. Decimal points are NOT folded: `1.5` and `15` are different
 * claims and collapsing them would let a source for one excuse the other.
 */
function figuresIn(text: string): string[] {
  const withoutIdentity = text.replace(/[@#][A-Za-z0-9_]+/g, ' ');
  const found = withoutIdentity.match(/\d[\d,.]*\d|\d/g) ?? [];
  return found.map(normaliseFigure).filter(f => f.length > 0);
}

function normaliseFigure(raw: string): string {
  return raw.replace(/,(?=\d{3}\b)/g, '').replace(/[.,]+$/, '');
}

/**
 * The figures the desk can point at: whatever was in the item being answered, whatever
 * is in an approved claim the draft cites, and whatever the caller supplied with a
 * source reference.
 *
 * The rule this implements, stated in the adversary lane and mechanical enough to be
 * worth having: a figure the drafting model produced that appears in none of those is
 * unsourced BY CONSTRUCTION. It does not need a semantic check, and it catches
 * hallucinated prices, fees, dates, percentages and volumes in one pass.
 *
 * Consequence accepted on purpose: "support is available 24/7" refuses until somebody
 * cites the claim that says so. That is not a false positive. It is a factual assertion
 * about LCX's operations published under LCX's name, and the recovery names exactly
 * what would make it publishable.
 */
function sourcedFigures(input: ClaimSafetyInput, claimTexts: readonly string[]): Set<string> {
  const pool = [input.sourceText ?? '', ...claimTexts, ...input.substantiatedFigures.map(f => f.figure)].join(' \n ');
  return new Set(figuresIn(pool));
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §8 THE GATE                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Everything the gate needs, and nothing it does not. Fields that would only be
 * decoration are absent: this module has no `surface`, because the static/interactive
 * approval regime is another engine's decision and a field that changes no answer is a
 * claim that it does.
 */
export interface ClaimSafetyInput {
  /** The draft exactly as a human would publish it. */
  readonly text: string;
  readonly channel: SafetyChannel;
  /** `like` and `repost` produce no text of ours; see the short-circuit below. */
  readonly verb: EngagementVerb;
  /** Claim ids the draft asserts it used. Resolved against the library, never trusted. */
  readonly claimIdsCited: readonly string[];
  /** What the item is about, for the library-coverage question. `null` is honest and
   *  produces a visible violation rather than a silent 'covered'. */
  readonly topic: ClaimCategory | null;
  /** Only used to ask the library what it holds. Not a statement about the audience. */
  readonly jurisdiction: Jurisdiction;
  /** The LCX product the item is about, if any, with its MiCA perimeter status. */
  readonly product: { readonly name: string; readonly regulatoryStatus: ProductRegulatoryStatus } | null;
  /** The text of the item being answered. Figures present here are observed, not invented. */
  readonly sourceText: string | null;
  /** Figures the caller can point at, each with the reference that supports it. */
  readonly substantiatedFigures: readonly { readonly figure: string; readonly sourceRef: string }[];
  /** A published attestation reference, where the draft speaks about reserves. */
  readonly solvencyAttestationRef: string | null;
}

export interface ClaimSafetyOutcome {
  readonly verdict: GateVerdict;
  /**
   * The text an operator may copy — stripped of meaningless carriers, otherwise
   * unchanged. **`null` whenever anything refused.** This is doctrine rule 1 made
   * structural: there is no field on this object that holds a softened promise, so no
   * surface can accidentally render one.
   */
  readonly usableText: string | null;
  readonly strips: readonly StripRecord[];
  /** Travels with the verdict so no panel can show `clear` without the caveat. */
  readonly disclosure: string;
}

function resolveRecovery(rule: LexicalRule, channel: SafetyChannel): RefusalRecovery {
  return typeof rule.recovery === 'function' ? rule.recovery(channel) : rule.recovery;
}

function refusal(code: RefusalCode, sentence: string, rule: RuleCitation, recovery: RefusalRecovery, matched: string | null): Refusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: CLAIM_SAFETY_RULESET_VERSION };
}

function violation(rule: string, severity: 'error' | 'warning', citation: RuleCitation, matched: string, remedy: string): MarketingViolation {
  return { rule, severity, rule_citation: citation, matched, remedy, ruleVersion: CLAIM_SAFETY_RULESET_VERSION };
}

function firstSpan(text: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = pattern.exec(text);
    if (hit) return hit[0];
  }
  return null;
}

/** The span a lexical rule objected to, or `null` when the rule did not fire. */
function lexicalSpan(text: string, rule: LexicalRule): string | null {
  if (rule.sameSentence) {
    for (const sentence of sentences(text)) {
      const primary = firstSpan(sentence, rule.any);
      if (primary === null) continue;
      if (rule.and && firstSpan(sentence, rule.and) === null) continue;
      return sentence.length > 160 ? primary : sentence;
    }
    return null;
  }
  const primary = firstSpan(text, rule.any);
  if (primary === null) return null;
  if (rule.and && firstSpan(text, rule.and) === null) return null;
  return primary;
}

/**
 * THE HALO DECISION. Returns the refusals; the reasoning is in §5's docblock.
 *
 * Order matters and is not arbitrary: `unknown` is answered before promotional use,
 * because a gate that says "this looks promotional" while it cannot see whether the
 * product is even inside the perimeter is asserting the easier of two answers.
 */
function haloRefusals(text: string, input: ClaimSafetyInput): Refusal[] {
  const out: Refusal[] = [];
  const statusSpan = firstSpan(text, STATUS_PHRASES);
  const status = input.product?.regulatoryStatus ?? null;

  if (status === 'unknown') {
    out.push(refusal(
      'PRODUCT_REGULATORY_STATUS_UNKNOWN',
      `This item names ${input.product?.name ?? 'a product'} and the desk cannot say whether that product is inside MiCA's perimeter, so it cannot judge the sentence about being regulated.`,
      CITE_ESMA_STATUS_DO,
      { kind: 'supply_data', missing: 'the MiCA perimeter status of the named product — regulated or not regulated', whoCanSupply: 'compliance, from the authorisation and the product register' },
      statusSpan,
    ));
    return out;
  }

  if (status === 'not_mica_regulated') {
    if (statusSpan !== null) {
      out.push(refusal(
        'ESMA_REGULATORY_STATUS_AS_PROMOTION',
        `This item is about ${input.product?.name ?? 'an unregulated product'} and mentions LCX's regulatory status. ESMA names that combination as a don't, and it is LCX's most likely violation because it is LCX's best line.`,
        CITE_ESMA_HALO,
        { kind: 'edit_text', what: 'Remove the authorisation reference from an item about an unregulated product, and state plainly that this product is not covered by MiCA.' },
        statusSpan,
      ));
    }
    if (!NOT_REGULATED_MARKER.test(text)) {
      out.push(refusal(
        'ESMA_UNREGULATED_PRODUCT_STATUS_MISSING',
        `This item names ${input.product?.name ?? 'an unregulated product'} and does not say it is unregulated. The indication has to be clearly visible, which on a timeline means in the text.`,
        CITE_ESMA_STATUS_DO,
        { kind: 'edit_text', what: 'State in the visible text that this product is not covered by MiCA. Terms and conditions do not satisfy this, and neither does a link.' },
        null,
      ));
    }
    return out;
  }

  if (statusSpan !== null) {
    for (const sentence of sentences(text)) {
      if (firstSpan(sentence, STATUS_PHRASES) === null) continue;
      const adornment = STATUS_ADORNMENT.exec(sentence);
      const benefit = STATUS_BENEFIT_CONTEXT.exec(sentence);
      if (adornment === null && benefit === null) continue;
      out.push(refusal(
        'ESMA_REGULATORY_STATUS_AS_PROMOTION',
        'This sentence spends LCX\'s regulatory status on a product benefit. State the authorisation as a fact in its own sentence, or leave it out.',
        CITE_ESMA_HALO,
        {
          kind: 'edit_text',
          what: `Separate the two claims. "${adornment?.[0] ?? benefit?.[0] ?? ''}" is what turns a checkable fact about who supervises LCX into a reason to trade.`,
        },
        sentence,
      ));
      break;
    }
  }
  return out;
}

const CITE_ART_7_ELEMENTS: RuleCitation = {
  instrument: 'mica',
  provision: 'Art 7(1)(d)-(e)',
  text: 'A marketing communication relating to an offer to the public or an admission to trading must state that a crypto-asset white paper is available, give the website address, telephone number and email address of the offeror or person seeking admission, and carry the prescribed statement that the communication has not been reviewed or approved by any competent authority.',
};

const CITE_DESK_POLICY_OBFUSCATION: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'The desk reads what the reader reads',
  text: 'A token built from two alphabets renders as ordinary text and matches no rule written in either. The gate reports it rather than rewriting it, because deciding which alphabet the author meant is a guess applied to a human\'s own words.',
};

/**
 * Non-Latin scripts this gate cannot read a word of. Detected by block, not by guessing a
 * language: a single Cyrillic or CJK word is enough to put the sentence outside the
 * rulebook, and `obfuscation.mixed_script` covers the single-character homoglyph case.
 */
const NON_LATIN_SCRIPTS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: 'Cyrillic', re: /[Ѐ-ӿ]{2,}/ },
  { name: 'Greek', re: /[Ͱ-Ͽ]{2,}/ },
  { name: 'Hebrew', re: /[֐-׿]{2,}/ },
  { name: 'Arabic', re: /[؀-ۿ]{2,}/ },
  { name: 'Devanagari', re: /[ऀ-ॿ]{2,}/ },
  { name: 'Han, kana or Hangul', re: /[぀-ヿ㐀-䶿一-鿿가-힯]/ },
];

/**
 * Function words that do not occur in English marketing copy, per language.
 *
 * DELIBERATELY SHORT AND HIGH-PRECISION. Every entry is a word that cannot appear in an
 * English sentence about an exchange, so a hit is evidence rather than a hint. Two hits are
 * required, because one borrowed word ("und" in a company name, "de" in a surname) is not a
 * German or French draft — and a false refusal on an English draft would teach the desk to
 * distrust the gate, which costs more than this rule buys.
 */
const NON_ENGLISH_MARKERS: readonly { readonly name: string; readonly words: readonly string[] }[] = [
  { name: 'German', words: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'für', 'wir', 'sie', 'ihre', 'werden', 'mit', 'auf', 'sind', 'wird'] },
  { name: 'French', words: ['les', 'des', 'est', 'nous', 'vous', 'votre', 'pour', 'avec', 'sur', 'sont', 'pas', 'nos', 'cette'] },
  { name: 'Spanish', words: ['los', 'las', 'una', 'para', 'con', 'que', 'nuestro', 'nuestra', 'son', 'está', 'sus', 'por'] },
  { name: 'Italian', words: ['gli', 'della', 'sono', 'nostro', 'nostra', 'con', 'per', 'che', 'sui', 'delle'] },
  { name: 'Portuguese', words: ['nosso', 'nossa', 'para', 'com', 'não', 'são', 'está', 'seus', 'pelo'] },
  { name: 'Dutch', words: ['het', 'een', 'onze', 'niet', 'zijn', 'wordt', 'voor', 'met', 'uw'] },
];

/**
 * Which language this draft appears to be in, when it is not English. `null` means the gate
 * has no reason to think its rulebook does not apply.
 *
 * NOT A LANGUAGE DETECTOR, and the limits are the point. It answers one question — "is
 * there positive evidence this is outside my rulebook" — and it will miss a Danish draft, a
 * transliterated one, and English prose with a German promise buried in it. Those misses
 * leave the gate exactly where it was before this function existed; what it removes is the
 * case where a whole draft in another language was reported as `clear`.
 */
export function unanalysableLanguage(text: string): string | null {
  for (const script of NON_LATIN_SCRIPTS) {
    if (script.re.test(text)) return `${script.name} script`;
  }
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.length < 4) return null;
  const seen = new Set(words);
  for (const lang of NON_ENGLISH_MARKERS) {
    const hits = lang.words.filter((w) => seen.has(w));
    if (hits.length >= 2) return `${lang.name}, on the words ${hits.slice(0, 3).join(', ')}`;
  }
  return null;
}

/**
 * Score a draft. Pure, total, and the same answer every time for the same input.
 *
 * Reading order of the result: if `usableText` is `null` there is nothing to copy, and
 * `verdict.refusals` says why in sentences. `verdict.disposition` is a summary of that,
 * never a substitute for it.
 */
export function checkClaimSafety(input: ClaimSafetyInput): ClaimSafetyOutcome {
  const disclosure = MARKETING_RULES_DISCLOSURE;

  /* A `like` or a plain `repost` produces no text of ours, so there is nothing here to
   * review — and reporting `clear` would put a compliance badge on an act this gate
   * never looked at. `VERB_PRODUCES_OWN_TEXT` is the vocabulary's own answer to which
   * verbs those are; the exposure they carry is adoption of someone else's claims,
   * which is the adoption model's verdict and not this one's. */
  if (!VERB_PRODUCES_OWN_TEXT[input.verb]) {
    return {
      verdict: {
        disposition: 'flagged',
        refusals: [],
        violations: [
          violation(
            'verb.produces_no_own_text',
            'error',
            {
              instrument: 'finra_rn_17_18',
              provision: 'RN 17-18 Q9 (model, not binding on LCX)',
              text: 'By liking or sharing the favorable comments, the representative has adopted them and they are subject to the communications rules.',
            },
            input.verb,
            `A ${input.verb} carries someone else's claims and none of our words, so this gate reviewed nothing. The verdict belongs to the adoption model, which reads the target.`,
          ),
        ],
        claimIdsCited: [...input.claimIdsCited],
        coverage: 'none',
        ruleSetVersion: CLAIM_SAFETY_RULESET_VERSION,
      },
      usableText: null,
      strips: [],
      disclosure,
    };
  }

  const { text: stripped, strips } = stripMeaninglessCarriers(input.text);
  const read = matchingCopy(stripped);
  const refusals: Refusal[] = [];
  const violations: MarketingViolation[] = [];

  /*
   * FIRST, BECAUSE EVERYTHING AFTER IT IS WRITTEN IN ENGLISH.
   *
   * Every pattern in this file is ASCII English, so a draft in another language matched
   * nothing and came back `clear` — and `clear` here means "matched no rule I hold", which
   * a screen renders as a passed gate. The attack needed no cleverness: "Antworte auf
   * Deutsch" in a stranger's reply, the model obliges, and the German price promise it
   * produces is invisible to `regulated_promise.price_language` and to every other rule.
   *
   * A refusal, not a violation, and not a strip. There is no wording change that makes a
   * German sentence reviewable by an English rulebook, so the recovery is a human who
   * reads the language — `human_authority`, the same shape used where the library holds no
   * claim for the topic.
   */
  const unanalysable = unanalysableLanguage(stripped);
  if (unanalysable !== null) {
    refusals.push(refusal(
      'LANGUAGE_NOT_ANALYSABLE',
      `This draft is not in English (${unanalysable}), and every rule this gate holds is written in English. `
      + 'It matched nothing, and that is a fact about the rulebook rather than about the text — a clear '
      + 'verdict here would mean "unreviewed", which is the one thing it must never mean.',
      {
        instrument: 'desk_policy',
        provision: 'The gate reviews only what its rulebook covers',
        text:
          'Where a communication is in a language the claim-safety ruleset does not cover, the gate refuses '
          + 'rather than reporting a clear verdict. An unexamined draft and an examined one must not produce '
          + 'the same answer.',
      },
      { kind: 'human_authority', role: 'legal' },
      unanalysable,
    ));
  }

  for (const rule of LEXICAL_RULES) {
    const span = lexicalSpan(read, rule);
    if (span !== null) {
      refusals.push(refusal(rule.code, rule.sentence, rule.citation, resolveRecovery(rule, input.channel), span));
    }
  }

  for (const rule of CONDITIONAL_RULES) {
    const span = lexicalSpan(read, rule);
    if (span === null) continue;
    if (rule.satisfiedWhen(input)) {
      violations.push(violation(rule.id, 'warning', rule.citation, span, rule.remedyWhenSatisfied));
    } else {
      refusals.push(refusal(rule.code, rule.sentence, rule.citation, resolveRecovery(rule, input.channel), span));
    }
  }

  refusals.push(...haloRefusals(read, input));

  /* Claim ids are resolved with `getClaimById`, NOT with `validateClaimsUsed`, which
   * checks the id prefix only (`messageRules.ts:127`) — so `marketing-999` and
   * `us-totally-made-up` both pass it. A model that hallucinates a plausibly-prefixed
   * id must not be able to manufacture provenance. */
  const claimTexts: string[] = [];
  for (const id of input.claimIdsCited) {
    const claim = getClaimById(id);
    if (claim === undefined) {
      refusals.push(refusal(
        'UNSOURCED_LCX_FACT',
        `The draft cites claim "${id}" and the library holds no active claim with that id, so the sentence has no approved source behind it.`,
        CITE_DESK_POLICY_SUBSTANTIATION,
        {
          kind: 'supply_data',
          /* The library exposes only active claims (`claims.ts:218-220` filters on
           * `active`), so "never existed" and "was deactivated" are indistinguishable
           * from outside. The refusal names both rather than picking one. */
          missing: `an active claim id for this sentence — "${id}" either never existed or has been deactivated, and the library cannot tell those apart from outside`,
          whoCanSupply: 'whoever approved the wording',
        },
        id,
      ));
      continue;
    }
    claimTexts.push(claim.text);
    if (claim.requiresHumanReview) {
      violations.push(violation(
        'claim.requires_human_review',
        'error',
        CITE_ART_66_2,
        id,
        `Claim ${id} is marked requiresHumanReview in the library, so this draft cannot be cleared by its author alone.`,
      ));
    }
  }

  const sourced = sourcedFigures(input, claimTexts);
  const reported = new Set<string>();
  for (const figure of figuresIn(read)) {
    if (sourced.has(figure) || reported.has(figure)) continue;
    reported.add(figure);
    refusals.push(refusal(
      'UNSOURCED_FIGURE',
      `The figure ${figure} appears in this draft and in nothing the desk can point at — not in the item being answered, and not in any claim the draft cites.`,
      CITE_DESK_POLICY_SUBSTANTIATION,
      {
        kind: 'supply_data',
        missing: `a source for ${figure}`,
        whoCanSupply: 'the author, or the claim library if an approved sentence already carries this number',
      },
      figure,
    ));
  }

  let coverage: GateVerdict['coverage'];
  if (input.topic === null) {
    coverage = 'partial';
    violations.push(violation(
      'coverage.topic_not_stated',
      'warning',
      CITE_DESK_POLICY_SUBSTANTIATION,
      '',
      'No topic was stated, so the claim library was never consulted. This verdict says nothing about whether approved language exists for what the draft is about.',
    ));
  } else {
    const held = getClaimsForJurisdictionAndCategory(input.jurisdiction, input.topic);
    if (held.length === 0) {
      coverage = 'none';
      refusals.push(refusal(
        'CLAIM_LIBRARY_COVERAGE_NONE',
        `The library holds no active ${input.topic} claim for ${input.jurisdiction}, so there is no approved language for this item and this gate has nothing to check it against.`,
        CITE_DESK_POLICY_SUBSTANTIATION,
        { kind: 'human_authority', role: 'legal' },
        null,
      ));
    } else {
      coverage = input.claimIdsCited.length > 0 && claimTexts.length === input.claimIdsCited.length ? 'covered' : 'partial';
    }
  }

  if (reusedRuleFires(read, 'no_invented_licenses', input.claimIdsCited)) {
    refusals.push(refusal(
      'INVENTED_LICENCE_CLAIM',
      'This draft names a licence LCX does not hold. The claim library keeps that blocklist and it fired on this text.',
      CITE_ART_66_2,
      { kind: 'edit_text', what: 'Name the authorisation LCX actually holds and the authority that granted it, or say nothing about licences.' },
      smallestTriggeringWindow(read, 'no_invented_licenses', input.claimIdsCited),
    ));
  }

  /* Deal-closing language is a VIOLATION here and not a refusal, for two reasons that
   * both matter. First, its marketing consequence is a change of regime rather than a
   * bad sentence: an invitation to transact is capable of making the item an Art 7
   * marketing communication, which drags roughly 330 characters of mandatory
   * boilerplate that a 280-character post cannot carry — and that verdict is the Art 7
   * engine's arithmetic, not this gate's opinion. Second, the phrase list carries the
   * `"buy "` substitution bug, and a rule with a known false-positive mode must not
   * hold a refusal. */
  if (reusedRuleFires(read, 'no_deal_closing', input.claimIdsCited)) {
    violations.push(violation(
      'deal_closing.invitation_to_transact',
      'error',
      CITE_ART_7_ELEMENTS,
      smallestTriggeringWindow(read, 'no_deal_closing', input.claimIdsCited) ?? '',
      'This reads as an invitation to transact, which is capable of making the item an Art 7 marketing communication. Route it to the Art 7 element check before it is cleared, or remove the call to action.',
    ));
  }

  const mixedScript = MIXED_SCRIPT_TOKEN.exec(stripped);
  if (mixedScript !== null) {
    violations.push(violation(
      'obfuscation.mixed_script',
      'error',
      CITE_DESK_POLICY_OBFUSCATION,
      mixedScript[0],
      'This token mixes alphabets. Retype it in one script so that what the gate reads is what a reader reads.',
    ));
  }

  /* "NFA" is recorded and given no power. The MiCA definition of advice turns on
   * whether a personalised recommendation was given, not on how it was labelled, so a
   * disclaimer cannot suppress a refusal — and a test asserts that the same text with
   * and without it produces an identical refusal set. */
  const disclaimer = DISCLAIMER_TOKENS.exec(read);
  if (disclaimer !== null) {
    violations.push(violation(
      'disclaimer.no_legal_effect',
      'warning',
      CITE_ART_81_1,
      disclaimer[0],
      'This disclaimer changes nothing about the characterisation of the words around it. Keep it if the desk wants it; do not rely on it.',
    ));
  }

  let disposition: Disposition;
  if (refusals.length > 0) disposition = 'refused';
  else if (violations.some(v => v.severity === 'error')) disposition = 'flagged';
  else if (strips.length > 0) disposition = 'stripped';
  else disposition = 'clear';

  return {
    verdict: {
      disposition,
      refusals,
      violations,
      claimIdsCited: [...input.claimIdsCited],
      coverage,
      ruleSetVersion: CLAIM_SAFETY_RULESET_VERSION,
    },
    usableText: refusals.length > 0 ? null : stripped,
    strips,
    disclosure,
  };
}
