/**
 * MARKETING PRECEDENT (M4's memory) — WHAT DID WE SAY ABOUT THIS BEFORE.
 *
 * The desk's characteristic failure is not saying something wrong once. It is saying
 * two different things three weeks apart, in public, under its own name. Today the
 * compartment structurally cannot notice: `marketing_reply_draft` is
 * `ON DELETE CASCADE` from `marketing_x_reply` (`0046_marketing.sql:98`) and the
 * reply is swept at `MARKETING_RETENTION_DAYS`, default 90 (`service.ts:15`). So the
 * desk's memory of its own words self-destructs every quarter, and every
 * consistency check built on that table inherits a 90-day amnesia.
 *
 * THE RESOLUTION IS A CHANGE OF SUBJECT, NOT A LONGER RETENTION. This module models
 * a corpus of LCX's OWN STATEMENTS — our text, our claim ids, our approver — and
 * holds no third-party personal data at all. Look at `PrecedentStatement` (§1): there
 * is no author handle, no inbound reply text, no display name, no permalink of
 * someone else's post. That absence is the GDPR argument for retaining it past the
 * 90-day sweep, so it is enforced by the shape of the type rather than asserted in a
 * comment. `Handle` is deliberately not imported into this file.
 *
 * WHAT THIS MODULE WILL NOT DO, because both temptations are worse than the gap:
 *  1. It will not present the best-scoring row as precedent when nothing clears the
 *     threshold. A loosely similar prior answer shown as "what we said" is worse than
 *     silence, because the operator aligns to it and the desk acquires a position it
 *     never took. Below `MIN_TRIGRAM_SIMILARITY` the answer is a refusal with a
 *     sentence, and `corpus_empty` and `no_match` are different sentences (absent data
 *     never renders as a zero).
 *  2. It will not judge whether two statements are inconsistent. It reports what
 *     DIFFERS on a mechanically checkable axis, shows both sides, and leaves the
 *     adjudication to a named human.
 *
 * CONTRADICTION DEBT IS EXACT, AND THAT IS THE POINT (§5). It counts only pairs that
 * differ on one of four enumerated axes — polarity, named timeframe, a quantitative
 * assertion on the same metric key, and a standing statement resting on an expired
 * claim. Trigram similarity is NOT one of the axes: lexical suspicion is reported by
 * `possibleContradictions` and is explicitly excluded from the debt count, because a
 * debt number that moves when someone tunes a similarity threshold is not a debt
 * number, it is a mood. Everything in the count is reproducible by hand from the two
 * records it names.
 *
 * Pure and total: no I/O, no DB, no clock, no randomness. `asOf` is always supplied
 * by the caller — a staleness function that reads the clock cannot be tested for
 * what it says in August about a sentence written in March, which is the entire
 * behaviour under test.
 */
import {
  INSTRUMENTS,
  normaliseForMatch,
  type ActorId,
  type ContentHash,
  type Instant,
  type Refusal,
  type RuleCitation,
} from './types.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 THE CORPUS IS OURS — the retention argument, in the types                */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Renderable on the panel, because an operator who does not know why the memory
 * outlives the queue will assume it is a bug and ask for it to be swept.
 */
export const PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS =
  'The precedent index holds only statements LCX itself cleared or published: our text, the claims it cited, and the colleague who cleared it. It holds no handles, no inbound reply text and no third-party names, which is why it can be retained after the 90-day sweep removes the queue it came from.';

/**
 * Working assumption, pending the DPO ruling the plan records as owed (§7 of the
 * plan): the regulator's producible-record expectation is five years extendable to
 * seven (MiCA Art 8(2) read with the record-keeping duty), and the current cascade
 * deletes at ninety days. Those cannot both be right.
 *
 * 2 557 days is seven years including two leap days. It is a POLICY DEFAULT, not a
 * finding, and `CorpusWindow.retentionPolicyResolved` reports `false` until a human
 * rules, so nothing on screen can claim the question is settled.
 */
export const ASSUMED_OWN_STATEMENT_RETENTION_DAYS = 2557;

/** Cited on the corpus window so the open question travels with the data. */
export const RETENTION_QUESTION_IS_OPEN =
  'Whether LCX may retain its own published statements past the 90-day marketing sweep is an unresolved data-protection question. Until it is ruled on, this index assumes a seven-year retention for LCX-authored text and holds no third-party personal data at all.';

/**
 * What the memory could and could not see. Carried on every lookup and on the debt
 * figure, for the same reason `ObservationFrame` is carried on every measurement:
 * a count over a window that silently begins 90 days ago is a different claim from
 * the same count over three years.
 */
export interface CorpusWindow {
  /** Earliest `statedAt` the corpus actually holds. Null when the corpus is empty. */
  readonly earliestStatedAt: Instant | null;
  readonly latestStatedAt: Instant | null;
  readonly statementCount: number;
  /** Of those, how many are still standing in public (§1 `StatementStanding`). */
  readonly standingCount: number;
  /**
   * True when the caller told us the corpus begins at a retention boundary rather
   * than at the desk's first statement. Never inferred from the dates: a young desk
   * and a swept corpus look identical from inside, and guessing which one this is
   * would be exactly the confident default this compartment exists to refuse.
   */
  readonly truncatedByRetention: boolean;
  /** Permanently false until a human answers the question in `RETENTION_QUESTION_IS_OPEN`. */
  readonly retentionPolicyResolved: false;
  /** One sentence naming the limit of this window, for print and for the panel. */
  readonly statement: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE RECORD — one statement the desk made                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The question ontology. A closed vocabulary, because the same question arrives in a
 * hundred phrasings and the only cheap way to answer it consistently is to give the
 * hundred phrasings one key.
 *
 * Composition: the operational classes an exchange support queue actually receives
 * (`withdrawal_status` … `off_topic`), plus the CERC anticipated-question set that a
 * crisis desk must have precleared before it is needed — `are_you_solvent`,
 * `are_you_like_peer`, `where_are_reserves`, `who_is_your_custodian`. The last group
 * are the entries a human under pressure at 02:00 improvises badly, which is the
 * argument for having them keyed at all.
 *
 * `are_you_like_peer` is ONE key, not one per peer: the peer is carried as a
 * `PrecedentSubject`, so "are you like FTX" and "are you like Celsius" group as the
 * same question about different subjects. That is the join the desk needs — the
 * answer's shape is shared, the named peer is not.
 */
export type QuestionKey =
  | 'withdrawal_status'
  | 'deposit_not_credited'
  | 'kyc_stuck'
  | 'fee_question'
  | 'listing_request'
  | 'token_availability'
  | 'api_issue'
  | 'price_speculation'
  | 'regulatory_question'
  | 'regulatory_status_of_lcx'
  | 'are_you_solvent'
  | 'are_you_like_peer'
  | 'where_are_reserves'
  | 'who_is_your_custodian'
  | 'outage_status'
  | 'delisting_rationale'
  | 'scam_or_impersonation'
  | 'complaint'
  | 'praise'
  | 'off_topic';

export const QUESTION_KEYS: readonly QuestionKey[] = [
  'withdrawal_status',
  'deposit_not_credited',
  'kyc_stuck',
  'fee_question',
  'listing_request',
  'token_availability',
  'api_issue',
  'price_speculation',
  'regulatory_question',
  'regulatory_status_of_lcx',
  'are_you_solvent',
  'are_you_like_peer',
  'where_are_reserves',
  'who_is_your_custodian',
  'outage_status',
  'delisting_rationale',
  'scam_or_impersonation',
  'complaint',
  'praise',
  'off_topic',
] as const;

export const QUESTION_LABEL: Record<QuestionKey, string> = {
  withdrawal_status: 'Where is my withdrawal?',
  deposit_not_credited: 'My deposit has not been credited',
  kyc_stuck: 'My verification is stuck',
  fee_question: 'What does this cost?',
  listing_request: 'Will you list this token?',
  token_availability: 'Is this asset available on LCX?',
  api_issue: 'The API or app is not behaving',
  price_speculation: 'Where is the price going?',
  regulatory_question: 'Is this permitted where I live?',
  regulatory_status_of_lcx: 'What is LCX licensed to do?',
  are_you_solvent: 'Are you solvent?',
  are_you_like_peer: 'Are you like this other company?',
  where_are_reserves: 'Where are customer assets held?',
  who_is_your_custodian: 'Who holds the keys?',
  outage_status: 'Is something down right now?',
  delisting_rationale: 'Why was this delisted?',
  scam_or_impersonation: 'Is this account or offer really LCX?',
  complaint: 'A complaint with no answerable question',
  praise: 'Praise',
  off_topic: 'Not about LCX',
};

/**
 * A thing a statement was ABOUT. Closed union, because the join is the whole feature
 * and a free-text subject would make two statements about ETH fail to meet.
 *
 * `peer` names a company, never a person: contagion questions are about
 * organisations with shared attributes ("are you like Celsius"), and admitting a
 * natural person here would put third-party personal data into the one table whose
 * retention argument depends on holding none.
 */
export type PrecedentSubject =
  | { readonly kind: 'asset'; readonly symbol: string }
  | { readonly kind: 'question'; readonly questionKey: QuestionKey }
  | { readonly kind: 'peer'; readonly organisation: string }
  | { readonly kind: 'product'; readonly product: string };

/**
 * The comparable form of a subject, so two subjects can be tested for identity
 * without a deep compare and without case or whitespace deciding the answer.
 * Exported because a debt item names the shared subject and the panel prints it.
 */
export function subjectKey(subject: PrecedentSubject): string {
  switch (subject.kind) {
    case 'asset':
      return `asset:${subject.symbol.trim().toUpperCase()}`;
    case 'question':
      return `question:${subject.questionKey}`;
    case 'peer':
      return `peer:${subject.organisation.trim().toLowerCase()}`;
    case 'product':
      return `product:${subject.product.trim().toLowerCase()}`;
  }
}

/**
 * What kind of thing was said. Drives the staleness horizon (§4) and nothing else —
 * a quantitative statement decays in weeks, a refusal to comment does not decay at
 * all, and one horizon for both would either nag about the refusals or let the
 * numbers rot.
 */
export type StatementKind =
  | 'position'
  | 'fact'
  | 'quantitative'
  | 'commitment'
  | 'refusal_to_comment';

/**
 * The checkable yes/no axis. This is one of the four things contradiction debt is
 * computed from, so it is a recorded field and not a re-read of the text: a
 * classifier that re-derives polarity in August from a sentence cleared in March
 * gives a debt figure that changes when the classifier changes.
 *
 * `not_a_yes_no` is the honest default and must stay available — most statements are
 * not answers to a closed question, and forcing them into affirm/deny to make the
 * axis populated would manufacture contradictions.
 */
export type Polarity = 'affirms' | 'denies' | 'declines_to_say' | 'not_a_yes_no';

/**
 * A claim the statement leaned on, snapshotted AT CLEARANCE TIME.
 *
 * `version` and `validTo` are copies, not lookups. The claim library
 * (`packages/shared/src/claims/`) carries `version` and `active` on a live row
 * (`claims/types.ts:15-24`); resolving a three-month-old statement against today's
 * row tells you what the claim says now, which is not the question. The question is
 * what the desk relied on when it spoke, and whether that has since moved.
 */
export interface ClaimReference {
  readonly claimId: string;
  /** The version in force when this statement was cleared. */
  readonly versionAtUse: number;
  /** The library category, snapshotted. Used to pair statements on the same subject matter. */
  readonly category: string;
  /** When the claim stopped being usable, if it has. ISO date or instant. Null = open-ended. */
  readonly validTo: Instant | null;
}

/**
 * A number the statement asserted. Kept structured because "TVL is $40m" and "TVL is
 * $52m" are a contradiction the desk can be held to, and neither a similarity score
 * nor a human skim reliably finds it three weeks later.
 *
 * `valueText` is a string, not a number: "over 100 000", "roughly 40m" and "40.2m"
 * are all things a desk writes, and parsing them into a float would invent precision
 * the sentence did not have. Comparison is therefore on the normalised text, and a
 * differing text is reported as a difference for a human to adjudicate — never
 * silently reconciled.
 */
export interface QuantitativeAssertion {
  /** Stable key for the thing measured, e.g. `'listed_assets'`, `'reserve_ratio'`. */
  readonly metricKey: string;
  readonly valueText: string;
  readonly unit: string | null;
  /** The date the figure was true as at, if the statement said. Null is a real answer. */
  readonly asOf: Instant | null;
  /** Where the figure came from. Null is the substantiation gap, not a formatting gap. */
  readonly sourceRef: string | null;
}

/**
 * Whether the statement is still the desk's public position.
 *
 * `superseded` does NOT mean gone. A superseded post is still readable by anyone who
 * scrolls, so it still contributes to how LCX is understood; what changed is that the
 * desk has a later position. That is why debt is computed over `standing` only and
 * why `supersedes` must be an explicit link — an unlinked later statement leaves the
 * earlier one standing, which is precisely the state the count exists to surface.
 */
export type StatementStanding =
  | 'standing'
  | 'superseded'
  | 'retracted'
  | 'never_published';

/**
 * One statement the desk made. LCX's own words and nothing else — see the header.
 *
 * There is deliberately no `body` of anyone else's post, no `authorHandle`, no
 * `targetPermalink` and no inbound text. If a future field needs one of those, it
 * belongs in the queue tables that are swept at 90 days, not here.
 */
export interface PrecedentStatement {
  readonly id: string;
  /** Our text, as cleared. */
  readonly body: string;
  readonly kind: StatementKind;
  readonly subjects: readonly PrecedentSubject[];
  /** Null when the statement was never classified. Never guessed — see §2. */
  readonly questionKey: QuestionKey | null;
  readonly polarity: Polarity;
  /**
   * A timeframe the statement named, normalised by the desk when recorded
   * (`'Q3 2026'`, `'within 48 hours'`). Null when it named none, which is the
   * commonest and safest case.
   */
  readonly namedTimeframe: string | null;
  readonly claims: readonly ClaimReference[];
  readonly quantitative: readonly QuantitativeAssertion[];
  readonly standing: StatementStanding;
  /** Explicit lineage. `null` on both sides is the state debt is looking for. */
  readonly supersedes: string | null;
  readonly supersededBy: string | null;
  /** When the desk said it in public, or cleared it if it never went out. */
  readonly statedAt: Instant;
  readonly clearedBy: ActorId;
  readonly clearedAt: Instant;
  /** Set when a scheduled re-read is owed. Null means no review was ever scheduled. */
  readonly reviewDueAt: Instant | null;
  /** The preclearance entry it derived from, if any. Feeds M8's derivation rate. */
  readonly derivedFromApprovedLanguageId: string | null;
  /** Binds the record to the exact text, so an edit cannot inherit a clearance. */
  readonly contentHash: ContentHash;
}

/** The desk's own policy, cited when a refusal here is ours rather than the law's. */
const DESK_POLICY = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

/**
 * Stamped onto every refusal this module emits, so a refusal in an audit row can be
 * read against the rules that were in force when it fired rather than today's.
 */
export const PRECEDENT_RULESET_VERSION = 1;

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE QUESTION ONTOLOGY — grouping, and the limits of grouping              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * READ THIS BEFORE TRUSTING A GROUP. Stated as a constant so it can be rendered next
 * to any count derived from grouping.
 *
 * This is LEXICAL matching against a closed vocabulary of surface forms. It has no
 * model of meaning. "Can I get my money out" matches `withdrawal_status` because it
 * contains a withdrawal token and a possessive; "is my cash trapped" contains neither
 * and will land in `ungrouped`. That is a real miss, and `ungrouped` is a visible
 * bucket rather than a silent assignment to the nearest key precisely so the misses
 * stay countable.
 *
 * No embeddings are used and none are claimed. The trade is deliberate: a trigram
 * score of 0.71 can be reproduced by hand in an audit and a vector distance cannot,
 * and for a corpus of a few thousand of our own sentences the retrieval difference
 * does not pay for the loss of explanation.
 */
export const GROUPING_IS_LEXICAL_NOT_SEMANTIC =
  'Questions are grouped by matching a closed vocabulary of words and phrases, not by understanding meaning. A paraphrase that shares no vocabulary with the key will not group, and shows as ungrouped rather than being assigned to the nearest match.';

/**
 * The surface forms per key. Each entry is a set of ALTERNATIVES: a text matches the
 * key when it contains at least one `anchors` term AND, where `qualifiers` is
 * non-empty, at least one qualifier too.
 *
 * The two-part shape is what stops `price_speculation` swallowing every message
 * containing "price". A bare mention of price is a fee question or a fact request;
 * it is speculation only alongside a directional or predictive qualifier.
 *
 * All terms lowercase and matched as whole words, so `'moon'` does not fire inside
 * `'moonlight'`. A trailing `*` asks for a prefix match and is the only way to get
 * one: `'withdraw*'` covers withdrawal and withdrawing, while `'list'` deliberately
 * does not cover `'listen'`. See `containsTerm`.
 */
export interface SurfaceForms {
  readonly anchors: readonly string[];
  readonly qualifiers: readonly string[];
}

export const QUESTION_SURFACE_FORMS: Record<QuestionKey, SurfaceForms> = {
  withdrawal_status: {
    anchors: ['withdraw*', 'cash out', 'payout', 'get my money out'],
    qualifiers: [],
  },
  deposit_not_credited: {
    anchors: ['deposit*', 'transfer in', 'sent funds'],
    qualifiers: ['not credited', 'missing', 'pending', 'never arrived', 'not showing', 'stuck', 'lost'],
  },
  kyc_stuck: {
    anchors: ['kyc', 'verification', 'verify', 'verified', 'id check', 'document review'],
    qualifiers: [],
  },
  fee_question: {
    anchors: ['fee', 'fees', 'commission', 'spread', 'how much does it cost', 'charge*'],
    qualifiers: [],
  },
  listing_request: {
    anchors: ['list', 'listing', 'when list', 'add this token', 'get listed'],
    qualifiers: ['please', 'when', 'will you', 'can you', 'request', 'consider'],
  },
  token_availability: {
    anchors: ['available', 'do you support', 'do you have', 'can i buy', 'tradable', 'is it on'],
    qualifiers: [],
  },
  api_issue: {
    anchors: ['api', 'endpoint', 'websocket', 'rate limit', 'sdk', 'app crash', 'app is broken'],
    qualifiers: [],
  },
  price_speculation: {
    anchors: ['price', 'pump', 'dump', 'moon', 'target', 'ath', 'forecast', 'prediction'],
    qualifiers: ['will', 'going to', 'when', 'predict', 'forecast', 'expect', 'moon', 'target', 'pump', 'dump'],
  },
  regulatory_question: {
    anchors: ['allowed', 'permitted', 'legal', 'restricted', 'my country', 'available in'],
    qualifiers: [],
  },
  regulatory_status_of_lcx: {
    anchors: ['licence*', 'license*', 'regulated', 'mica', 'fma', 'authorised', 'authorized', 'registered'],
    qualifiers: [],
  },
  are_you_solvent: {
    anchors: ['solvent', 'solvency', 'insolvent', 'bankrupt*', 'liquidity', 'run on', 'still safe'],
    qualifiers: [],
  },
  are_you_like_peer: {
    anchors: ['like ftx', 'next ftx', 'like celsius', 'like mt gox', 'same as', 'another ftx'],
    qualifiers: [],
  },
  where_are_reserves: {
    anchors: ['reserves', 'proof of reserves', 'segregated', 'client funds', 'customer assets', 'where are the funds'],
    qualifiers: [],
  },
  who_is_your_custodian: {
    anchors: ['custodian', 'custody', 'who holds', 'private keys', 'cold storage', 'multisig'],
    qualifiers: [],
  },
  outage_status: {
    anchors: ['down', 'outage', 'offline', 'maintenance', 'not loading', 'unavailable'],
    qualifiers: [],
  },
  delisting_rationale: {
    anchors: ['delist*', 'removed from', 'why remove'],
    qualifiers: [],
  },
  scam_or_impersonation: {
    anchors: ['scam*', 'fake', 'impersonat*', 'phishing', 'airdrop dm', 'is this really', 'support dm'],
    qualifiers: [],
  },
  complaint: {
    anchors: ['complaint', 'unacceptable', 'terrible service', 'worst', 'no response for'],
    qualifiers: [],
  },
  praise: {
    anchors: ['thank you', 'thanks', 'great work', 'love this', 'well done', 'congrats'],
    qualifiers: [],
  },
  off_topic: { anchors: [], qualifiers: [] },
};

/**
 * Whether a normalised haystack contains a term.
 *
 * WHOLE WORDS BY DEFAULT, and prefixes only where the vocabulary asks for one with a
 * trailing `*` (`'withdraw*'` matches withdraw, withdrawal, withdrawals,
 * withdrawing). The default was the other way round in the first draft of this file
 * and a test caught it: a bare prefix match on `'list'` fires on `'listen'`, so
 * "can you listen to your users" was classified as a listing request. Silent
 * over-matching is worse here than a miss, because a miss lands in the visible
 * `ungrouped` bucket while an over-match quietly puts the wrong precedent in front of
 * an operator.
 *
 * Multi-word terms are matched as whole phrases on the same boundary rule.
 */
export function containsTerm(normalisedHaystack: string, term: string): boolean {
  const isPrefix = term.trimEnd().endsWith('*');
  const bare = isPrefix ? term.trimEnd().slice(0, -1) : term;
  const core = normaliseForMatch(bare).trim();
  if (core.length === 0) return false;
  return normalisedHaystack.includes(isPrefix ? ` ${core}` : ` ${core} `);
}

/** How a text came to be in a group, or why it is not in one. */
export type GroupingBasis =
  /** Matched exactly one key's surface forms. */
  | 'lexical_single_match'
  /** A human assigned the key. Outranks everything: this module never overrides it. */
  | 'operator_assigned'
  /** Matched two or more keys and no rule picks between them — see below. */
  | 'ambiguous'
  /** Matched nothing. A real answer, and a countable one. */
  | 'ungrouped';

/**
 * The outcome of classifying one text.
 *
 * `key` is null for BOTH `ambiguous` and `ungrouped`, and the two are different facts
 * that must not collapse: ambiguous means the desk has several ways to read the
 * question, ungrouped means the vocabulary did not recognise it at all. The first is
 * an invitation to pick; the second is a gap in the ontology.
 *
 * THERE IS NO TIEBREAK BY SCORE. Two keys matching with equal standing produces
 * `ambiguous` with both candidates, not the alphabetically-first or the
 * most-terms-matched one. Ranking here would make the group depend on how many
 * synonyms someone happened to type into `QUESTION_SURFACE_FORMS`, which is not a
 * property of the question.
 */
export interface QuestionClassification {
  readonly key: QuestionKey | null;
  readonly basis: GroupingBasis;
  /** Every key whose surface forms matched. Length 0, 1 or many. */
  readonly candidates: readonly QuestionKey[];
  /** The exact terms that fired, per candidate, so the match is arguable. */
  readonly matchedTerms: readonly { readonly key: QuestionKey; readonly terms: readonly string[] }[];
  /** Rendered next to any count derived from this. Always `GROUPING_IS_LEXICAL_NOT_SEMANTIC`. */
  readonly limitation: string;
}

/**
 * Classify a question deterministically. Rules only; no model, no network, no clock.
 *
 * `operatorAssigned` short-circuits everything. A human who has read the message
 * knows more than the vocabulary does, and a classifier that argues with them will be
 * turned off.
 */
export function classifyQuestion(
  text: string,
  operatorAssigned?: QuestionKey | null,
): QuestionClassification {
  if (operatorAssigned != null) {
    return {
      key: operatorAssigned,
      basis: 'operator_assigned',
      candidates: [operatorAssigned],
      matchedTerms: [],
      limitation: GROUPING_IS_LEXICAL_NOT_SEMANTIC,
    };
  }

  const hay = normaliseForMatch(text);
  const matchedTerms: { key: QuestionKey; terms: string[] }[] = [];

  for (const key of QUESTION_KEYS) {
    const forms = QUESTION_SURFACE_FORMS[key];
    if (forms.anchors.length === 0) continue;
    const anchorHits = forms.anchors.filter((t) => containsTerm(hay, t));
    if (anchorHits.length === 0) continue;
    if (forms.qualifiers.length > 0) {
      const qualifierHits = forms.qualifiers.filter((t) => containsTerm(hay, t));
      if (qualifierHits.length === 0) continue;
      matchedTerms.push({ key, terms: [...anchorHits, ...qualifierHits] });
      continue;
    }
    matchedTerms.push({ key, terms: anchorHits });
  }

  const candidates = matchedTerms.map((m) => m.key);
  if (candidates.length === 0) {
    return {
      key: null,
      basis: 'ungrouped',
      candidates: [],
      matchedTerms: [],
      limitation: GROUPING_IS_LEXICAL_NOT_SEMANTIC,
    };
  }
  if (candidates.length > 1) {
    return {
      key: null,
      basis: 'ambiguous',
      candidates,
      matchedTerms,
      limitation: GROUPING_IS_LEXICAL_NOT_SEMANTIC,
    };
  }
  return {
    key: candidates[0]!,
    basis: 'lexical_single_match',
    candidates,
    matchedTerms,
    limitation: GROUPING_IS_LEXICAL_NOT_SEMANTIC,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 LINE STALENESS — true in March is a liability in August                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ISO instant to epoch ms, or null when it does not parse.
 *
 * Null propagates into `not_assessable` rather than into a default: a statement whose
 * date the desk cannot read is not a fresh statement, and `Date.parse` returning NaN
 * silently coerced through arithmetic is how an unreadable date becomes "0 days old".
 */
function epochMs(value: string | null): number | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `from` to `to`, or null when either does not parse. Negative when
 * `to` precedes `from`, and the sign is kept — a review date in the future and one in
 * the past are opposite facts.
 */
export function daysBetween(from: string | null, to: string | null): number | null {
  const a = epochMs(from);
  const b = epochMs(to);
  if (a == null || b == null) return null;
  return Math.floor((b - a) / MS_PER_DAY);
}

/**
 * How long a statement of each kind stays usable without a re-read.
 *
 * THESE ARE A STATED DESK POLICY, NOT A MEASUREMENT. Nothing was observed to derive
 * them; they are the desk's own choice about how fast each kind of sentence rots, and
 * they are in code rather than in a table for the reason `gps/disclosure.ts:6-20`
 * gives about versioned policy text: a table with an UPDATE path silently rewrites
 * what the desk was told last quarter.
 *
 * `refusal_to_comment` is null on purpose. "We do not comment on ongoing
 * investigations" does not become false with age, and expiring it would produce a
 * queue of nags that trains the operator to clear staleness warnings without reading
 * them — which destroys the warnings that matter.
 */
export const STALENESS_HORIZON_DAYS: Record<StatementKind, number | null> = {
  quantitative: 30,
  commitment: 30,
  fact: 180,
  position: 365,
  refusal_to_comment: null,
};

export const STALENESS_HORIZONS_ARE_A_STATED_POLICY =
  'Staleness horizons are a desk policy, not a measured decay rate: 30 days for figures and commitments, 180 for facts, a year for positions, and no expiry for a refusal to comment. Past the horizon means a re-read is owed, not that the statement became false.';

/**
 * Why a statement is stale, worst first. `not_assessable` heads the order because a
 * statement the instrument could not date must never be shown as current — that is
 * doctrine rule 3 applied to a timestamp.
 */
export type StalenessVerdict =
  | 'not_assessable'
  | 'rests_on_expired_claim'
  | 'rests_on_moved_claim_version'
  | 'review_overdue'
  | 'past_horizon'
  | 'current';

const STALENESS_PRECEDENCE: readonly StalenessVerdict[] = [
  'not_assessable',
  'rests_on_expired_claim',
  'rests_on_moved_claim_version',
  'review_overdue',
  'past_horizon',
  'current',
] as const;

/**
 * A staleness read on one statement.
 *
 * `axesNotChecked` is the load-bearing field. Claim-version movement can only be
 * assessed when the caller supplies today's library versions; without them the honest
 * answer is "three axes checked, one not", and a `current` verdict that quietly
 * skipped an axis is the kind of false reassurance this compartment is built against.
 */
export interface StalenessAssessment {
  readonly verdict: StalenessVerdict;
  /** Every reason that fired, in precedence order. Empty exactly when `current`. */
  readonly reasons: readonly string[];
  readonly ageDays: number | null;
  readonly horizonDays: number | null;
  readonly reviewOverdueByDays: number | null;
  /** Claim ids that have expired as at `asOf`. */
  readonly expiredClaimIds: readonly string[];
  /** Claim ids whose library version has moved since this statement used them. */
  readonly movedClaimIds: readonly string[];
  readonly axesNotChecked: readonly string[];
  /** One sentence for the panel. Never a bare verdict token. */
  readonly sentence: string;
}

function worst(verdicts: readonly StalenessVerdict[]): StalenessVerdict {
  for (const candidate of STALENESS_PRECEDENCE) {
    if (verdicts.includes(candidate)) return candidate;
  }
  return 'current';
}

/**
 * Assess one statement's staleness as at `asOf`.
 *
 * `currentClaimVersions` is optional and its absence is REPORTED, not defaulted. Pass
 * a map of claim id to the version now in force to enable the
 * `rests_on_moved_claim_version` axis.
 */
export function stalenessOf(
  statement: PrecedentStatement,
  asOf: Instant,
  currentClaimVersions?: ReadonlyMap<string, number>,
): StalenessAssessment {
  const reasons: string[] = [];
  const verdicts: StalenessVerdict[] = [];
  const axesNotChecked: string[] = [];

  const ageDays = daysBetween(statement.statedAt, asOf);
  const horizonDays = STALENESS_HORIZON_DAYS[statement.kind];

  if (ageDays == null) {
    verdicts.push('not_assessable');
    reasons.push(
      `The date on this statement (${statement.statedAt}) could not be read, so its age is unknown. It is not being treated as current.`,
    );
  }

  const expiredClaimIds = statement.claims
    .filter((c) => {
      const expiryDays = daysBetween(c.validTo, asOf);
      return expiryDays != null && expiryDays >= 0;
    })
    .map((c) => c.claimId);
  if (expiredClaimIds.length > 0) {
    verdicts.push('rests_on_expired_claim');
    reasons.push(
      `It rests on ${expiredClaimIds.length === 1 ? 'a claim that has' : 'claims that have'} since expired: ${expiredClaimIds.join(', ')}.`,
    );
  }

  let movedClaimIds: string[] = [];
  if (currentClaimVersions == null) {
    axesNotChecked.push(
      'claim version movement — no current claim-library versions were supplied to compare against',
    );
  } else {
    movedClaimIds = statement.claims
      .filter((c) => {
        const now = currentClaimVersions.get(c.claimId);
        return now != null && now !== c.versionAtUse;
      })
      .map((c) => c.claimId);
    if (movedClaimIds.length > 0) {
      verdicts.push('rests_on_moved_claim_version');
      reasons.push(
        `Cites ${movedClaimIds.join(', ')} at a version the library has since moved past, so the wording it relied on is no longer the current wording.`,
      );
    }
  }

  const reviewOverdueByDays = daysBetween(statement.reviewDueAt, asOf);
  if (statement.reviewDueAt == null) {
    axesNotChecked.push('scheduled review — no review date was ever set on this statement');
  } else if (reviewOverdueByDays == null) {
    verdicts.push('not_assessable');
    reasons.push(`The review date on this statement (${statement.reviewDueAt}) could not be read.`);
  } else if (reviewOverdueByDays > 0) {
    verdicts.push('review_overdue');
    reasons.push(`Its scheduled review was due ${reviewOverdueByDays} days ago and has not happened.`);
  }

  if (ageDays != null && horizonDays != null && ageDays > horizonDays) {
    verdicts.push('past_horizon');
    reasons.push(
      `It is ${ageDays} days old against a stated ${horizonDays}-day horizon for a ${statement.kind} statement, so a re-read is owed.`,
    );
  }

  const verdict = worst(verdicts);
  const sentence =
    verdict === 'current'
      ? axesNotChecked.length === 0
        ? `Current: ${ageDays} days old, inside the ${horizonDays == null ? 'open-ended' : `${horizonDays}-day`} horizon for a ${statement.kind} statement.`
        : `No staleness found on the axes checked (${ageDays} days old), but ${axesNotChecked.length} ${axesNotChecked.length === 1 ? 'axis was' : 'axes were'} not checked — see axesNotChecked.`
      : reasons.join(' ');

  return {
    verdict,
    reasons,
    ageDays,
    horizonDays,
    reviewOverdueByDays,
    expiredClaimIds,
    movedClaimIds,
    axesNotChecked,
    sentence,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 RETRIEVAL — the three nearest things we actually said                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * At most three prior answers are shown. Not a rendering preference: the panel sits
 * in front of the operator at drafting time, and a list of nine near-misses is read as
 * noise and dismissed, which loses the one hit that mattered.
 */
export const MAX_PRECEDENT_HITS = 3;

/**
 * The similarity floor. Below it the answer is "the desk has not answered this",
 * not "here is the closest thing".
 *
 * 0.35 Jaccard over character trigrams is a desk policy chosen to be strict, and it
 * is deliberately quotable in an audit — "similarity 0.71 on trigrams, threshold
 * 0.35" is a sentence a reviewer can reproduce with `trigramSimilarity` by hand,
 * which is the property a vector distance does not have.
 */
export const MIN_TRIGRAM_SIMILARITY = 0.35;

/** Character 3-grams of the normalised text. Exported so a reviewer can reproduce a score. */
export function trigrams(text: string): ReadonlySet<string> {
  const norm = normaliseForMatch(text);
  const out = new Set<string>();
  if (norm.length < 3) return out;
  for (let i = 0; i + 3 <= norm.length; i += 1) out.add(norm.slice(i, i + 3));
  return out;
}

/**
 * Jaccard similarity over character trigrams — intersection over union, 0 to 1.
 *
 * Deterministic, symmetric, and reproducible by hand. Two empty texts score 0 rather
 * than 1: an empty draft is not identical to an empty prior statement, and returning
 * 1 there would make every empty box match everything.
 */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared += 1;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** What the desk is about to say, as far as the panel needs to know it. */
export interface PrecedentQuery {
  /** What it is about. Empty is allowed and simply narrows retrieval to text and claims. */
  readonly subjects: readonly PrecedentSubject[];
  readonly questionKey: QuestionKey | null;
  /** The draft text, for the trigram pass. Empty string is allowed. */
  readonly draftBody: string;
  readonly claimIds: readonly string[];
}

/**
 * Which pass found the hit. Tiered, and the tier ranks above the score: an exact
 * question-key match at trigram 0.02 is better precedent than an unrelated statement
 * that happens to share phrasing, because the key is a recorded human judgement about
 * what the question was and the trigram score is a coincidence of vocabulary.
 */
export type MatchBasis = 'question_key' | 'subject' | 'trigram' | 'claim_overlap';

const MATCH_TIER: Record<MatchBasis, 1 | 2 | 3 | 4> = {
  question_key: 1,
  subject: 2,
  trigram: 3,
  claim_overlap: 4,
};

export interface PrecedentHit {
  readonly statement: PrecedentStatement;
  readonly matchBasis: MatchBasis;
  /** 1 for an exact key or subject match; the Jaccard score for the fuzzy passes. */
  readonly score: number;
  /** Subject keys this statement and the query have in common. May be empty. */
  readonly sharedSubjectKeys: readonly string[];
  /** The staleness verdict on the prior answer, so it is never shown as simply "what we said". */
  readonly staleness: StalenessAssessment;
  /** How this hit was found, in words, for the audit and for the panel. */
  readonly explanation: string;
}

/**
 * Three outcomes, and collapsing any two of them would be the defect.
 *
 *  - `hits`        the desk has answered something like this, and here it is.
 *  - `no_match`    the corpus holds statements and none of them clears the floor.
 *                  The desk has not answered this.
 *  - `corpus_empty` the corpus holds nothing at all. The desk cannot see whether it
 *                  has answered this — which after a 90-day sweep is the likely
 *                  state, and is a completely different sentence from `no_match`.
 */
export type PrecedentOutcome = 'hits' | 'no_match' | 'corpus_empty';

export interface PrecedentLookup {
  readonly outcome: PrecedentOutcome;
  /** Empty unless `outcome === 'hits'`. Never the best near-miss. */
  readonly hits: readonly PrecedentHit[];
  readonly window: CorpusWindow;
  /**
   * Present for `no_match` and `corpus_empty`, null for `hits`. A refusal rather than
   * an empty list, so the surface has a sentence and a rule to render instead of a
   * blank panel the operator reads as "nothing to worry about".
   */
  readonly refusal: Refusal | null;
  /** One sentence, always populated, in every outcome. */
  readonly sentence: string;
  /** How many statements were compared. The denominator of our own corpus, which we have. */
  readonly comparedCount: number;
}

/**
 * Build the corpus window. `truncatedByRetention` is the caller's assertion, never an
 * inference — see the field's doc comment.
 */
export function corpusWindow(
  corpus: readonly PrecedentStatement[],
  truncatedByRetention: boolean,
): CorpusWindow {
  const dated = corpus
    .map((s) => ({ id: s.id, ms: epochMs(s.statedAt), statedAt: s.statedAt }))
    .filter((d): d is { id: string; ms: number; statedAt: string } => d.ms != null)
    .sort((a, b) => a.ms - b.ms);
  const standingCount = corpus.filter((s) => s.standing === 'standing').length;
  const earliest = dated.length > 0 ? dated[0]!.statedAt : null;
  const latest = dated.length > 0 ? dated[dated.length - 1]!.statedAt : null;

  const statement =
    corpus.length === 0
      ? 'The precedent index holds no statements. That is not evidence the desk has said nothing — it is evidence this index cannot see what the desk said.'
      : truncatedByRetention
        ? `The index holds ${corpus.length} of the desk's own statements, the earliest dated ${earliest}. It begins at a retention boundary, so anything said before that date is gone and cannot be counted.`
        : `The index holds ${corpus.length} of the desk's own statements, ${earliest} to ${latest}, and the caller states it is not truncated by retention.`;

  return {
    earliestStatedAt: earliest,
    latestStatedAt: latest,
    statementCount: corpus.length,
    standingCount,
    truncatedByRetention,
    retentionPolicyResolved: false,
    statement,
  };
}

function refusal(
  code: Refusal['code'],
  sentence: string,
  rule: RuleCitation,
  recovery: Refusal['recovery'],
): Refusal {
  return { code, sentence, rule, recovery, matched: null, ruleSetVersion: PRECEDENT_RULESET_VERSION };
}

/**
 * Find what the desk said before. Deterministic and total.
 *
 * Order of passes is the order of trustworthiness: recorded human judgement
 * (question key), then recorded subject, then vocabulary overlap, then shared claim
 * ids. A statement is reported once, on its strongest basis.
 *
 * Ties break on tier, then score descending, then `statedAt` descending, then id
 * ascending — fully specified, because an unstable order in a panel that three
 * colleagues are reading is a source of disagreement about what the desk said.
 */
export function findPrecedent(
  query: PrecedentQuery,
  corpus: readonly PrecedentStatement[],
  asOf: Instant,
  options?: {
    readonly truncatedByRetention?: boolean;
    readonly currentClaimVersions?: ReadonlyMap<string, number>;
  },
): PrecedentLookup {
  const window = corpusWindow(corpus, options?.truncatedByRetention ?? false);

  if (corpus.length === 0) {
    return {
      outcome: 'corpus_empty',
      hits: [],
      window,
      refusal: refusal(
        'DATA_ABSENT_NOT_ZERO',
        'The precedent index is empty, so this panel cannot tell you whether the desk has answered this before. Treat it as unknown, not as new.',
        DESK_POLICY(
          'precedent.corpus_empty',
          'An empty corpus means the instrument cannot see the desk\'s history. It must say so rather than render an empty list, which reads as "nothing was said".',
        ),
        {
          kind: 'supply_data',
          missing: "the desk's own cleared statements, retained beyond the 90-day queue sweep",
          whoCanSupply: 'the marketing desk, once statements are recorded into the precedent index',
        },
      ),
      sentence:
        'No precedent index yet — this panel cannot say whether the desk has answered this before.',
      comparedCount: 0,
    };
  }

  const querySubjectKeys = new Set(query.subjects.map(subjectKey));
  const queryClaimIds = new Set(query.claimIds);

  const scored: PrecedentHit[] = [];
  for (const statement of corpus) {
    const statementSubjectKeys = statement.subjects.map(subjectKey);
    const sharedSubjectKeys = statementSubjectKeys.filter((k) => querySubjectKeys.has(k));

    let basis: MatchBasis | null = null;
    let score = 0;

    if (query.questionKey != null && statement.questionKey === query.questionKey) {
      basis = 'question_key';
      score = 1;
    } else if (sharedSubjectKeys.length > 0) {
      basis = 'subject';
      score = 1;
    } else {
      const sim = trigramSimilarity(query.draftBody, statement.body);
      if (sim >= MIN_TRIGRAM_SIMILARITY) {
        basis = 'trigram';
        score = sim;
      } else {
        const shared = statement.claims.filter((c) => queryClaimIds.has(c.claimId));
        if (shared.length > 0) {
          const union = new Set([...queryClaimIds, ...statement.claims.map((c) => c.claimId)]).size;
          basis = 'claim_overlap';
          score = union === 0 ? 0 : shared.length / union;
        }
      }
    }

    if (basis == null) continue;

    const staleness = stalenessOf(statement, asOf, options?.currentClaimVersions);
    const explanation =
      basis === 'question_key'
        ? `Same recorded question (${QUESTION_LABEL[statement.questionKey!]}).`
        : basis === 'subject'
          ? `Same subject: ${sharedSubjectKeys.join(', ')}.`
          : basis === 'trigram'
            ? `Trigram similarity ${score.toFixed(2)} against the cleared text, above the ${MIN_TRIGRAM_SIMILARITY} floor. Vocabulary overlap only — not a judgement that it is the same question.`
            : `Cites ${statement.claims
                .filter((c) => queryClaimIds.has(c.claimId))
                .map((c) => c.claimId)
                .join(', ')}, which this draft also cites.`;

    scored.push({ statement, matchBasis: basis, score, sharedSubjectKeys, staleness, explanation });
  }

  if (scored.length === 0) {
    return {
      outcome: 'no_match',
      hits: [],
      window,
      refusal: refusal(
        'CLAIM_LIBRARY_COVERAGE_NONE',
        `Nothing in the ${corpus.length} statements this index holds matches on question, subject, wording or cited claim. The desk has not answered this before — write it fresh, and expect it to become the precedent.`,
        DESK_POLICY(
          'precedent.no_match',
          'Below the similarity floor the panel shows nothing. A loosely similar prior answer presented as precedent is worse than silence, because the operator aligns to it and the desk acquires a position it never took.',
        ),
        { kind: 'not_recoverable', why: 'There is no prior answer to show. This is a fact, not a blocker.' },
      ),
      sentence: `No precedent — the desk has not answered this before, across ${corpus.length} statements searched.`,
      comparedCount: corpus.length,
    };
  }

  scored.sort((a, b) => {
    const tier = MATCH_TIER[a.matchBasis] - MATCH_TIER[b.matchBasis];
    if (tier !== 0) return tier;
    if (b.score !== a.score) return b.score - a.score;
    const at = epochMs(a.statement.statedAt) ?? 0;
    const bt = epochMs(b.statement.statedAt) ?? 0;
    if (bt !== at) return bt - at;
    return a.statement.id < b.statement.id ? -1 : a.statement.id > b.statement.id ? 1 : 0;
  });

  const hits = scored.slice(0, MAX_PRECEDENT_HITS);
  const stale = hits.filter((h) => h.staleness.verdict !== 'current').length;
  return {
    outcome: 'hits',
    hits,
    window,
    refusal: null,
    sentence:
      `${scored.length} prior statement${scored.length === 1 ? '' : 's'} matched; showing ${hits.length}.` +
      (stale > 0 ? ` ${stale} of them ${stale === 1 ? 'is' : 'are'} stale — read the verdict before reusing the wording.` : ''),
    comparedCount: corpus.length,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 CONTRADICTION DEBT — the number that makes the instrument worth having    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The four axes. This list IS the definition of the debt: a difference that is not on
 * one of these axes is not debt, however uncomfortable it looks.
 *
 *  - `polarity`           two standing statements about the same subject, one
 *                         affirming and one denying. `declines_to_say` is excluded on
 *                         purpose — "we do not comment" followed later by "yes" is a
 *                         change of stance, not a contradiction of fact, and counting
 *                         it would make the number argue with the desk's right to
 *                         decline. It is reported as a soft flag instead.
 *  - `named_timeframe`    both named a timeframe for the same subject and the
 *                         timeframes differ. Q3 and Q4 for the same thing is the
 *                         classic public inconsistency.
 *  - `quantitative_value` both asserted the same `metricKey` AS AT THE SAME DATE, and
 *                         the value or the unit differs. The as-at test is what makes
 *                         this exact: a figure restated for a later date is an update,
 *                         not a contradiction, and it goes to soft flags.
 *  - `expired_claim`      a single standing statement resting on a claim that has
 *                         expired as at `asOf`. This is the plan's "conflicts with a
 *                         claim that has since expired", and it is one statement's
 *                         defect, not a pair's.
 */
export type ContradictionAxis =
  | 'polarity'
  | 'named_timeframe'
  | 'quantitative_value'
  | 'expired_claim';

export const CONTRADICTION_AXES: readonly ContradictionAxis[] = [
  'polarity',
  'named_timeframe',
  'quantitative_value',
  'expired_claim',
] as const;

/**
 * The definition, in one renderable paragraph, because a number called "debt" that
 * nobody can define is the kind of metric that gets quoted in a board pack and then
 * cannot be reproduced.
 */
export const CONTRADICTION_DEBT_DEFINITION =
  'Contradiction debt counts statements the desk has left standing that disagree on a mechanically checkable axis: a yes against a no, two different named timeframes, the same figure as at the same date with two different values, or a standing statement resting on an expired claim. Both sides must still be standing and neither may be linked as superseding the other. Nothing is counted on the basis of wording similarity, and nothing is counted as a judgement about which side is right.';

/** Why a difference was looked at and deliberately NOT counted. */
export type SoftFlagReason =
  | 'polarity_versus_declined_to_say'
  | 'quantitative_restated_for_a_later_date'
  | 'timeframe_added_or_dropped'
  | 'lexically_near_duplicate';

export const SOFT_FLAG_WHY_NOT_DEBT: Record<SoftFlagReason, string> = {
  polarity_versus_declined_to_say:
    'One statement answers and the other declines to comment. That is a change of stance a desk is entitled to make, so it is shown for a human to read and is not counted as debt.',
  quantitative_restated_for_a_later_date:
    'The same figure is asserted as at two different dates. A number that moved is usually an update rather than a contradiction, so it is shown and not counted.',
  timeframe_added_or_dropped:
    'One statement names a timeframe and the other names none. Silence is not a competing timeframe, so it is shown and not counted.',
  lexically_near_duplicate:
    'Two statements on the same subject share most of their wording. That is normally consistency, occasionally a stale copy, and never mechanically a contradiction — so it is shown and not counted.',
};

/**
 * One item of debt. Everything needed to reproduce the finding by hand is on the item:
 * both ids, both sides of the axis verbatim, and what they share.
 */
export interface ContradictionDebtItem {
  readonly axis: ContradictionAxis;
  /** Deterministic, stable across runs, so an item can be acknowledged and tracked. */
  readonly key: string;
  /** For pair axes, the earlier statement by `statedAt`. For `expired_claim`, the statement. */
  readonly leftId: string;
  /** Null only for `expired_claim`. */
  readonly rightId: string | null;
  readonly leftDetail: string;
  readonly rightDetail: string | null;
  readonly sharedSubjectKeys: readonly string[];
  readonly sharedQuestionKey: QuestionKey | null;
  /** States the difference. Never states which side is correct. */
  readonly sentence: string;
}

/** A difference shown to a human and deliberately excluded from the count. */
export interface SoftContradictionFlag {
  readonly reason: SoftFlagReason;
  readonly leftId: string;
  readonly rightId: string;
  readonly sharedSubjectKeys: readonly string[];
  readonly sentence: string;
  readonly whyNotDebt: string;
  /** Literal `false`. A future edit that wants to count these has to change this type. */
  readonly countedAsDebt: false;
}

/**
 * The debt figure and everything that qualifies it.
 *
 * `pairsExplicitlyLinked` is the healthy counterpart and is reported alongside,
 * because a desk that has zero debt and zero explicit supersedes links has probably
 * not recorded its lineage rather than achieved consistency, and the panel should let
 * a reader see the difference.
 */
export interface ContradictionDebt {
  /** The count. Equals `items.length`. Soft flags are not in it. */
  readonly count: number;
  readonly items: readonly ContradictionDebtItem[];
  readonly byAxis: Record<ContradictionAxis, number>;
  readonly softFlags: readonly SoftContradictionFlag[];
  /** Pairs that differ on an axis but carry an explicit supersedes link. Not debt. */
  readonly pairsExplicitlyLinked: number;
  /** Standing statements compared. The denominator, over our own corpus. */
  readonly standingCompared: number;
  readonly window: CorpusWindow;
  readonly definition: string;
  readonly asOf: Instant;
}

/** True when either statement records a supersedes link to the other, in either direction. */
function explicitlyLinked(a: PrecedentStatement, b: PrecedentStatement): boolean {
  return (
    a.supersededBy === b.id ||
    b.supersededBy === a.id ||
    a.supersedes === b.id ||
    b.supersedes === a.id
  );
}

/** Normalised comparison of two free-text fields. Case, punctuation and spacing never decide. */
function sameText(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a === b;
  return normaliseForMatch(a) === normaliseForMatch(b);
}

/** Order a pair so the same two statements always produce the same item key. */
function orderPair(
  a: PrecedentStatement,
  b: PrecedentStatement,
): readonly [PrecedentStatement, PrecedentStatement] {
  const at = epochMs(a.statedAt);
  const bt = epochMs(b.statedAt);
  if (at != null && bt != null && at !== bt) return at < bt ? [a, b] : [b, a];
  return a.id <= b.id ? [a, b] : [b, a];
}

/**
 * Compute contradiction debt over the corpus as at `asOf`.
 *
 * Only `standing` statements are compared. A retracted statement is not debt — the
 * desk did the thing it was supposed to do. A `never_published` draft is not debt
 * either: nobody ever read it, so it cannot conflict in public.
 *
 * Pairs are enumerated exhaustively over standing statements that share a subject or a
 * recorded question key. That is quadratic in the standing set, and it is the right
 * trade here: the standing set is the desk's own published positions, a corpus of
 * thousands at most, and an index that made this cheaper would also make the count
 * depend on the index.
 *
 * The function is deterministic and total. Same corpus and same `asOf` always produce
 * the same items in the same order.
 */
export function contradictionDebt(
  corpus: readonly PrecedentStatement[],
  asOf: Instant,
  options?: { readonly truncatedByRetention?: boolean },
): ContradictionDebt {
  const window = corpusWindow(corpus, options?.truncatedByRetention ?? false);
  const standing = corpus.filter((s) => s.standing === 'standing');
  const items: ContradictionDebtItem[] = [];
  const softFlags: SoftContradictionFlag[] = [];
  let pairsExplicitlyLinked = 0;

  /* ── Single-statement axis: resting on an expired claim ── */
  for (const s of standing) {
    for (const claim of s.claims) {
      const overdueDays = daysBetween(claim.validTo, asOf);
      if (overdueDays == null || overdueDays < 0) continue;
      items.push({
        axis: 'expired_claim',
        key: `expired_claim|${s.id}|${claim.claimId}`,
        leftId: s.id,
        rightId: null,
        leftDetail: `cites ${claim.claimId} v${claim.versionAtUse}, which expired ${claim.validTo}`,
        rightDetail: null,
        sharedSubjectKeys: s.subjects.map(subjectKey),
        sharedQuestionKey: s.questionKey,
        sentence: `Statement ${s.id} is still standing and rests on claim ${claim.claimId}, which expired ${claim.validTo} — ${overdueDays} days before ${asOf}.`,
      });
    }
  }

  /* ── Pair axes ── */
  for (let i = 0; i < standing.length; i += 1) {
    for (let j = i + 1; j < standing.length; j += 1) {
      const first = standing[i]!;
      const second = standing[j]!;

      const firstKeys = first.subjects.map(subjectKey);
      const secondKeys = new Set(second.subjects.map(subjectKey));
      const sharedSubjectKeys = firstKeys.filter((k) => secondKeys.has(k));
      const sharedQuestionKey =
        first.questionKey != null && first.questionKey === second.questionKey
          ? first.questionKey
          : null;
      if (sharedSubjectKeys.length === 0 && sharedQuestionKey == null) continue;

      if (explicitlyLinked(first, second)) {
        pairsExplicitlyLinked += 1;
        continue;
      }

      const [left, right] = orderPair(first, second);
      const shared = { sharedSubjectKeys, sharedQuestionKey };
      const about =
        sharedSubjectKeys.length > 0
          ? sharedSubjectKeys.join(', ')
          : `the question "${QUESTION_LABEL[sharedQuestionKey!]}"`;

      /* polarity */
      const polarities = [left.polarity, right.polarity];
      if (polarities.includes('affirms') && polarities.includes('denies')) {
        items.push({
          axis: 'polarity',
          key: `polarity|${left.id}|${right.id}`,
          leftId: left.id,
          rightId: right.id,
          leftDetail: `${left.polarity} (${left.statedAt})`,
          rightDetail: `${right.polarity} (${right.statedAt})`,
          ...shared,
          sentence: `On ${about}, ${left.id} (${left.statedAt}) ${left.polarity === 'affirms' ? 'affirms' : 'denies'} and ${right.id} (${right.statedAt}) ${right.polarity === 'affirms' ? 'affirms' : 'denies'}. Both are standing and neither supersedes the other.`,
        });
      } else if (
        (polarities.includes('affirms') || polarities.includes('denies')) &&
        polarities.includes('declines_to_say')
      ) {
        softFlags.push({
          reason: 'polarity_versus_declined_to_say',
          leftId: left.id,
          rightId: right.id,
          sharedSubjectKeys,
          sentence: `On ${about}, one statement answers (${left.polarity === 'declines_to_say' ? right.polarity : left.polarity}) and the other declines to say.`,
          whyNotDebt: SOFT_FLAG_WHY_NOT_DEBT.polarity_versus_declined_to_say,
          countedAsDebt: false,
        });
      }

      /* named timeframe */
      if (left.namedTimeframe != null && right.namedTimeframe != null) {
        if (!sameText(left.namedTimeframe, right.namedTimeframe)) {
          items.push({
            axis: 'named_timeframe',
            key: `named_timeframe|${left.id}|${right.id}`,
            leftId: left.id,
            rightId: right.id,
            leftDetail: left.namedTimeframe,
            rightDetail: right.namedTimeframe,
            ...shared,
            sentence: `On ${about}, ${left.id} names "${left.namedTimeframe}" and ${right.id} names "${right.namedTimeframe}". Both are standing.`,
          });
        }
      } else if (left.namedTimeframe != null || right.namedTimeframe != null) {
        softFlags.push({
          reason: 'timeframe_added_or_dropped',
          leftId: left.id,
          rightId: right.id,
          sharedSubjectKeys,
          sentence: `On ${about}, one statement names the timeframe "${left.namedTimeframe ?? right.namedTimeframe}" and the other names none.`,
          whyNotDebt: SOFT_FLAG_WHY_NOT_DEBT.timeframe_added_or_dropped,
          countedAsDebt: false,
        });
      }

      /* quantitative assertions, same metric key */
      for (const lq of left.quantitative) {
        for (const rq of right.quantitative) {
          if (lq.metricKey !== rq.metricKey) continue;
          const valueDiffers = !sameText(lq.valueText, rq.valueText) || !sameText(lq.unit, rq.unit);
          if (!valueDiffers) continue;
          if (sameText(lq.asOf, rq.asOf)) {
            items.push({
              axis: 'quantitative_value',
              key: `quantitative_value|${left.id}|${right.id}|${lq.metricKey}`,
              leftId: left.id,
              rightId: right.id,
              leftDetail: `${lq.metricKey} = ${lq.valueText}${lq.unit == null ? '' : ` ${lq.unit}`} as at ${lq.asOf ?? 'no date given'}`,
              rightDetail: `${rq.metricKey} = ${rq.valueText}${rq.unit == null ? '' : ` ${rq.unit}`} as at ${rq.asOf ?? 'no date given'}`,
              ...shared,
              sentence: `${lq.metricKey} is stated as ${lq.valueText}${lq.unit == null ? '' : ` ${lq.unit}`} in ${left.id} and as ${rq.valueText}${rq.unit == null ? '' : ` ${rq.unit}`} in ${right.id}, both as at ${lq.asOf ?? 'no stated date'}. Both are standing.`,
            });
          } else {
            softFlags.push({
              reason: 'quantitative_restated_for_a_later_date',
              leftId: left.id,
              rightId: right.id,
              sharedSubjectKeys,
              sentence: `${lq.metricKey} is ${lq.valueText} as at ${lq.asOf ?? 'no date'} in ${left.id} and ${rq.valueText} as at ${rq.asOf ?? 'no date'} in ${right.id}.`,
              whyNotDebt: SOFT_FLAG_WHY_NOT_DEBT.quantitative_restated_for_a_later_date,
              countedAsDebt: false,
            });
          }
        }
      }
    }
  }

  const axisRank = (axis: ContradictionAxis): number => CONTRADICTION_AXES.indexOf(axis);
  items.sort((a, b) => {
    const byAxisRank = axisRank(a.axis) - axisRank(b.axis);
    if (byAxisRank !== 0) return byAxisRank;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  softFlags.sort((a, b) => {
    const keyA = `${a.reason}|${a.leftId}|${a.rightId}`;
    const keyB = `${b.reason}|${b.leftId}|${b.rightId}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  const byAxis: Record<ContradictionAxis, number> = {
    polarity: 0,
    named_timeframe: 0,
    quantitative_value: 0,
    expired_claim: 0,
  };
  for (const item of items) byAxis[item.axis] += 1;

  return {
    count: items.length,
    items,
    byAxis,
    softFlags,
    pairsExplicitlyLinked,
    standingCompared: standing.length,
    window,
    definition: CONTRADICTION_DEBT_DEFINITION,
    asOf,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 COVERAGE AND THE PANEL — what the desk is ready to answer                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/** One row of question coverage. */
export interface QuestionCoverageRow {
  readonly key: QuestionKey;
  readonly label: string;
  /** Standing statements recorded against this key. Zero is a real and useful answer. */
  readonly standingCount: number;
  readonly latestStatedAt: Instant | null;
  /** The worst staleness verdict across the standing statements. Null when there are none. */
  readonly worstStaleness: StalenessVerdict | null;
  readonly sentence: string;
}

/**
 * What the desk has a standing answer for, per question key.
 *
 * ABSENCE HERE MEANS ONE THING ONLY: no statement in this index carries that key. It
 * does not mean nobody asked, and it does not mean the desk has no answer — an answer
 * given before the retention boundary, or given without being recorded, is invisible
 * to this function. `coverageCaveat` says so and must be rendered with the table.
 */
export function questionCoverage(
  corpus: readonly PrecedentStatement[],
  asOf: Instant,
  currentClaimVersions?: ReadonlyMap<string, number>,
): { readonly rows: readonly QuestionCoverageRow[]; readonly coverageCaveat: string } {
  const rows = QUESTION_KEYS.map((key): QuestionCoverageRow => {
    const matching = corpus.filter((s) => s.questionKey === key && s.standing === 'standing');
    const dated = matching
      .map((s) => ({ s, ms: epochMs(s.statedAt) }))
      .filter((d): d is { s: PrecedentStatement; ms: number } => d.ms != null)
      .sort((a, b) => b.ms - a.ms);
    const verdicts = matching.map((s) => stalenessOf(s, asOf, currentClaimVersions).verdict);
    const worstStaleness = matching.length === 0 ? null : worst(verdicts);
    return {
      key,
      label: QUESTION_LABEL[key],
      standingCount: matching.length,
      latestStatedAt: dated.length > 0 ? dated[0]!.s.statedAt : null,
      worstStaleness,
      sentence:
        matching.length === 0
          ? `No recorded standing answer to "${QUESTION_LABEL[key]}". That is a gap in this index, not proof the desk has never answered it.`
          : `${matching.length} standing answer${matching.length === 1 ? '' : 's'}, most recent ${dated.length > 0 ? dated[0]!.s.statedAt : 'undated'}; worst staleness ${worstStaleness}.`,
    };
  });

  return {
    rows,
    coverageCaveat:
      'A key with no standing answer means nothing in this index carries that key. Answers given before the retention boundary, or given without being recorded here, are invisible to this table.',
  };
}

/**
 * The M4 drafting-room panel: what we said, whether it is still good, and what is
 * already in dispute on this subject.
 *
 * Composition only. Every figure here is produced by a function above and copied —
 * never recomputed and never re-thresholded, because a second implementation of
 * `MIN_TRIGRAM_SIMILARITY` is how a refusal becomes a hit.
 *
 * `lines` is what survives a print: one sentence per finding, each carrying its own
 * qualification, because the failure mode is a debt count reaching a slide with the
 * definition left behind on the screen it came from.
 */
export interface PrecedentPanel {
  readonly lookup: PrecedentLookup;
  /** Debt items that touch a subject or question key in this query. */
  readonly relevantDebt: readonly ContradictionDebtItem[];
  /** The whole-corpus debt figure, for context beside the relevant slice. */
  readonly debt: ContradictionDebt;
  readonly coverage: QuestionCoverageRow | null;
  readonly disclosures: readonly string[];
  readonly lines: readonly string[];
}

export function precedentPanel(
  query: PrecedentQuery,
  corpus: readonly PrecedentStatement[],
  asOf: Instant,
  options?: {
    readonly truncatedByRetention?: boolean;
    readonly currentClaimVersions?: ReadonlyMap<string, number>;
  },
): PrecedentPanel {
  const lookup = findPrecedent(query, corpus, asOf, options);
  const debt = contradictionDebt(corpus, asOf, {
    truncatedByRetention: options?.truncatedByRetention ?? false,
  });

  const querySubjectKeys = new Set(query.subjects.map(subjectKey));
  const relevantDebt = debt.items.filter(
    (item) =>
      item.sharedSubjectKeys.some((k) => querySubjectKeys.has(k)) ||
      (query.questionKey != null && item.sharedQuestionKey === query.questionKey),
  );

  const coverage =
    query.questionKey == null
      ? null
      : (questionCoverage(corpus, asOf, options?.currentClaimVersions).rows.find(
          (r) => r.key === query.questionKey,
        ) ?? null);

  const lines: string[] = [lookup.sentence, lookup.window.statement];
  for (const hit of lookup.hits) {
    lines.push(
      `${hit.statement.statedAt} · cleared by ${hit.statement.clearedBy} · ${hit.statement.standing} · ${hit.explanation} Staleness: ${hit.staleness.sentence}`,
    );
  }
  if (relevantDebt.length === 0) {
    lines.push(
      debt.standingCompared === 0
        ? 'Contradiction debt on this subject: not computable — the index holds no standing statements to compare.'
        : `Contradiction debt on this subject: none, across ${debt.standingCompared} standing statements compared. ${debt.count} item${debt.count === 1 ? '' : 's'} of debt exist elsewhere in the corpus.`,
    );
  } else {
    lines.push(
      `Contradiction debt on this subject: ${relevantDebt.length} item${relevantDebt.length === 1 ? '' : 's'}. Resolve or link before adding a third statement.`,
    );
    for (const item of relevantDebt) lines.push(`· ${item.sentence}`);
  }
  if (coverage != null) lines.push(coverage.sentence);

  return {
    lookup,
    relevantDebt,
    debt,
    coverage,
    disclosures: [
      PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS,
      RETENTION_QUESTION_IS_OPEN,
      GROUPING_IS_LEXICAL_NOT_SEMANTIC,
      STALENESS_HORIZONS_ARE_A_STATED_POLICY,
      CONTRADICTION_DEBT_DEFINITION,
    ],
    lines,
  };
}
