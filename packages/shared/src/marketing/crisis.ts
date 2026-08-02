import {
  ART_94_MAX_SUSPENSION_WORKING_DAYS,
  CLEARANCE_HEADLINE_TEST_QUESTION,
  CRISIS_BLOCKING_CLEARANCES,
} from './types.js';
import type {
  ActorId,
  Clearance,
  ClearanceRole,
  ClockSuppression,
  ContagionAttribute,
  ContentHash,
  DeskMode,
  ImpactSeverity,
  IncidentPhase,
  IncidentType,
  Instant,
  InstrumentKey,
  Refusal,
  RefusalCode,
  RefusalRecovery,
  RuleCitation,
  StatementBody,
  TimeToFirstStatementBudget,
  Withdrawal,
} from './types.js';

/**
 * MARKETING M5 — THE CRISIS ROOM. Pure, total, no I/O, no `Date.now()`, no
 * randomness. Every function takes `now` as an argument, so the clock is
 * testable and a decision taken at 02:14 can be reproduced exactly years later.
 *
 * WHY THE STATEMENTS ARE CODE AND A TABLE WOULD BE WORSE. Same argument as
 * `gps/disclosure.ts:6-20`, and it bites harder here: the entire value of a
 * holding statement is being able to say, later and in front of someone,
 * *exactly* what was said on the night. A `holding_statements` table with an
 * UPDATE path silently rewrites that. The row that produced the sentence the
 * world read at 02:14 is gone by Friday, and the record then shows a different
 * sentence under the same id. Text in reviewed code with a version number
 * cannot do that: changing a word requires a diff, a reviewer and a version
 * bump, and the old text stays recoverable from git forever.
 *
 * WHY M5 COULD BE BUILT BEFORE ANYTHING ELSE. It needs no data. No X
 * credential, no embargo register, no holdings declaration, no inbound feed.
 * That is also the argument for building it first: a preclear that does not
 * exist before the day it is needed is not a preclear, it is a draft written
 * under the worst conditions a desk ever faces. CDC CERC states the duty
 * plainly — "Have as much information on a topic precleared as possible."
 *
 * WHAT THIS FILE CANNOT DO, BY CONSTRUCTION. It cannot publish. There is no
 * `post`, `send`, `schedule`, `credential` or `session` noun in it. The terminal
 * state of a cleared crisis statement is a handoff: a named human copies the
 * text and publishes it by hand, outside this system. That gap is the only
 * unbypassable guarantee that a defect in this file cannot speak for LCX during
 * the one hour in which speaking wrongly is most expensive.
 *
 * THERE IS NO OVERRIDE PARAMETER ANYWHERE IN THIS FILE. Not `force`, not
 * `acceptRisk`, not `founderApproved`. A boolean that defeats a crisis refusal
 * would be set once, at 02:00, in a hurry, and then live in every call site
 * forever. The escape hatch is `adHoc` — write your own words and own them by
 * name — recorded as such, so the record shows plainly that no precleared text
 * was used. `gps/perimeter.ts:713-721` takes the same decision for the same
 * reason.
 */

/* ════════════════════════════════════════════════════════════════════════════
 *  §0  ONE INTEGRATION BLOCK — THE ONLY THING THIS FILE ADDS TO THE VOCABULARY
 * ════════════════════════════════════════════════════════════════════════════
 *  Everything else is imported from `types.ts`, which owns `IncidentPhase`,
 *  `IncidentType`, `ContagionAttribute`, `StatementBody`, `Clearance`,
 *  `Refusal`, `RefusalCode`, `RuleCitation`, `DeskMode` and the CERC/Art 94
 *  constants. No concept it owns is re-declared here.
 *
 *  WHAT USED TO BE DECLARED HERE: twenty refusal codes the crisis path needed and
 *  `RefusalCode` did not carry, with `CrisisRefusalCode` widening the shared union.
 *  The integration pass folded all nineteen surviving codes into `types.ts` (the
 *  twentieth, `TTFS_SUPPRESSION_UNREASONED`, was already shared with `triage.ts`),
 *  so `CrisisRefusalCode` is now an ALIAS for `RefusalCode` and nothing here widens
 *  anything. The situations the shared union already covered —
 *  `OVER_REASSURANCE`, `NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT`,
 *  `NEXT_UPDATE_BY_MISSING`, `UNCONDITIONAL_FORWARD_COMMITMENT`,
 *  `SOLVENCY_ASSERTION_WITHOUT_ATTESTATION`, `SELF_APPROVAL_FORBIDDEN`,
 *  `CLEARANCE_VOID_CONTENT_CHANGED`, `FOUR_EYES_UNACHIEVABLE`,
 *  `DESK_SUSPENDED_BY_AUTHORITY`, `ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING`,
 *  `STATEMENT_CONTRADICTS_INCIDENT_RECORD` — use the SHARED code and land in the
 *  same refusal-frequency count.
 *
 *  `CRISIS_ONLY_REFUSAL_CODES` survives as `readonly RefusalCode[]` — the annotation
 *  is the ratchet: a code that is not in the shared union no longer compiles here, so
 *  this file cannot grow a private vocabulary again.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * INTEGRATION PASS, DONE. These 19 now live in `types.ts`'s `RefusalCode` and in
 * `REFUSAL_CODES`, and the `readonly RefusalCode[]` annotation is what keeps them there:
 * a string that is not in the shared union no longer compiles here, so this array cannot
 * drift back into a private vocabulary. It is retained as data because it is still the
 * useful answer to "which codes does the crisis room own".
 *
 * `TTFS_SUPPRESSION_UNREASONED` is no longer listed here. It is shared with `triage.ts`
 * and both rooms emit the one code — it was in both private arrays, which is exactly the
 * splitting this fold removes.
 */
export const CRISIS_ONLY_REFUSAL_CODES: readonly RefusalCode[] = [
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

export type CrisisOnlyRefusalCode = RefusalCode;

/** The one namespace. Retained as an alias so this file's signatures read unchanged. */
export type CrisisRefusalCode = RefusalCode;

/**
 * A refusal from the crisis room — now exactly the shared `Refusal`, since the code union
 * is the shared one. Retained as an alias rather than removed so the signatures below
 * keep naming the room they came from.
 */
export type CrisisRefusal = Refusal;

/**
 * The ruleset version stamped onto every refusal this file emits. Local because
 * `types.ts` does not export one yet; integration should replace it with the
 * compartment-wide constant so a refusal from the crisis room and one from the
 * claim gate are comparable in the record.
 */
export const CRISIS_RULESET_VERSION = 1;

/* ════════════════════════════════════════════════════════════════════════════
 *  §1  WHAT THIS FILE IS NOT
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THESE STATEMENTS ARE NOT COUNSEL-REVIEWED. THEY ARE DRAFTS WITH A VERSION.
 * ══════════════════════════════════════════════════════════════════════════════
 *  They were written to be protective and they are legally unverified. That is
 *  a fact about them, so it is data rather than a comment nobody reads — every
 *  surface rendering one must badge it, exactly as `gps/disclosure.ts:47`
 *  badges disclosures and `gps/catalogue.ts:58` badges prices. The statement id
 *  and version are recorded on every activation, so a later counsel review can
 *  be applied retrospectively to everything that was actually said.
 */
export const HOLDING_STATEMENTS_ARE_NOT_COUNSEL_REVIEWED = true;

export const HOLDING_STATEMENTS_UNREVIEWED_REASON =
  'This holding-statement wording is a versioned draft, not counsel-reviewed text. It is protective by intent and legally unverified. Counsel must review it before it is relied on. The statement id and version are recorded on every activation, so a review can be applied retrospectively to what was actually said.';

/**
 * A second and separate claim this file must never make. A precleared statement
 * is written to be true whether or not the incident it is activated for is
 * real: it states what is known, what is not, and when the next update comes.
 * It does NOT know that an exploit happened, that a rumour is false, or that
 * client funds are safe. Anything requiring those has to come from a named
 * human with a cited basis (§4).
 */
export const HOLDING_STATEMENTS_DO_NOT_ASSERT_THE_INCIDENT_IS_REAL = true;

export const HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON =
  'A precleared statement is written to be true whether or not the incident is real. It carries no assertion that an exploit occurred, that a rumour is false, or that funds are safe. Any such assertion must be added by a named human and must carry a cited basis, or the statement refuses to be issued.';

/**
 * There is no publish path here, and this exists so a surface can SAY so rather
 * than leave the absence to be inferred from a missing button.
 */
export const CRISIS_ROOM_CANNOT_PUBLISH = true;

export const CRISIS_ROOM_HANDOFF_REASON =
  'This room drafts, clears and records. It cannot publish. A cleared statement is handed to a named human who posts it by hand, outside this system, and then records what was actually published. Nothing here holds a credential or can act as the LCX account.';

/* ── Citations. Every refusal below carries one. ───────────────────────────── */

const CERC_TRI_SLOT: RuleCitation = {
  instrument: 'cerc',
  provision: 'Messages and Audiences — message construction',
  text: "State what you know, what you don't know, and what you are doing to find out more. Do not speculate.",
};

const CERC_NO_OVER_REASSURANCE: RuleCitation = {
  instrument: 'cerc',
  provision: 'Crisis Communication Plans — working with the media',
  text: "Provide only information that has been approved and cleared by the appropriate channels. Don't speculate and don't over-reassure.",
};

const CERC_THREE_CLEARS: RuleCitation = {
  instrument: 'cerc',
  provision: 'Crisis Communication Plans — information verification and clearance procedures',
  text: "Have three people clear a document before it's released from the organization: the communication director responsible for your organization's reputation; the policy director who is responsible for ensuring that the information does not counter organization policy; a subject matter expert (SME) who is both fast and knowledgeable.",
};

const CERC_ADVISORY_MAY_NOT_DELAY: RuleCitation = {
  instrument: 'cerc',
  provision: 'Crisis Communication Plans — clearance constraints',
  text: 'If appropriate, you may have others review and comment on the document, but not delay its release. Keep the legal department out of the clearance process unless the subject has specific legal implications.',
};

const CERC_PRECLEAR: RuleCitation = {
  instrument: 'cerc',
  provision: 'Crisis Communication Plans — preparation',
  text: 'Have as much information on a topic precleared as possible. Make sure that predeveloped information is sensitive to the conditions of the current crisis before it is released.',
};

const CERC_OPENNESS: RuleCitation = {
  instrument: 'cerc',
  provision: 'Messages and Audiences — openness',
  text: 'If you have information you are unable to share, tell the public why the information is not available for release at the time.',
};

const CERC_HEADLINE_TEST: RuleCitation = {
  instrument: 'cerc',
  provision: 'Crisis Communication Plans — the reviewer\'s question',
  text: 'Ask if he or she would be comfortable seeing this as a news headline.',
};

const MICA_88_1: RuleCitation = {
  instrument: 'mica',
  provision: 'Art 88(1)',
  text: 'Issuers, offerors and persons seeking admission to trading shall inform the public as soon as possible of inside information which concerns them ... They shall not combine the disclosure of inside information to the public with the marketing of their activities.',
};

const MICA_94: RuleCitation = {
  instrument: 'mica',
  provision: 'Art 94(1)',
  text: 'Competent authorities shall have the power to suspend or prohibit marketing communications where there are reasonable grounds for suspecting that this Regulation has been infringed, and to require crypto-asset service providers to cease or suspend marketing communications for a maximum of 30 consecutive working days on any single occasion.',
};

/**
 * The desk's own rule, cited as the desk's own rule.
 *
 * SEC v. Bankman-Fried is EVIDENCE that over-reassurance is the charged act. It
 * is not law binding LCX, and this file does not pretend otherwise: the
 * instrument is `desk_policy`, and the complaint travels alongside as
 * `CrisisEvidence` (§2), where the case number, the paragraph and the URL are
 * all checkable. Dressing a US complaint up as a MiCA provision would be the
 * exact species of dishonesty this compartment exists to prevent.
 *
 * DONE — the two non-binding keys now exist. `INSTRUMENTS` gained
 * `sec_v_bankman_fried` and `fed_svb_review`, so the complaint and the review carry
 * their title and URL in the register every other citation resolves through, and
 * `CrisisEvidence.instrument` names them. THE RULE BELOW STILL CITES `desk_policy`, and
 * that is not an oversight: the rule is the desk's, the case is the evidence for it, and
 * collapsing the two would restate a US complaint as a rule binding LCX.
 */
const DESK_NO_OVER_REASSURANCE: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Crisis room — reassurance requires a cited basis',
  text: 'A statement asserting solvency, safety of client funds, full backing, or that all is well may not be issued unless a named human has attached a dated basis a reader could go and check. Evidenced by SEC v. Bankman-Fried, which pleads "FTX is fine. Assets are fine" as false and misleading.',
};

const DESK_NO_UNCONDITIONAL_FORWARD: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Crisis room — no unconditional forward commitment',
  text: 'A promise about all future time ("we will always allow withdrawals", "funds will never be at risk") may not be issued at all. No basis can evidence a claim about every future state, so there is no version of it a citation repairs.',
};

const DESK_CLOCK: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Crisis room — time to first statement',
  text: 'Every incident carries a time-to-first-statement budget. It may be suppressed only by a named person with a recorded reason, and the elapsed figure is retained either way.',
};

const DESK_ONE_STORY: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Crisis room — one story straight',
  text: 'A statement that moves a fact out of the known column, or contradicts the standing incident record, must link to the statement it supersedes. Inconsistent messages from one desk cost more credibility than the incident did.',
};

const DESK_PRECLEAR_INTEGRITY: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Crisis room — preclear integrity',
  text: 'A precleared statement may be issued only while its review date is in the future, its preconditions have been acknowledged by a named human, and it has not been superseded. Confident deployment of unreviewed text is what turns one incident into two.',
};

function refuse(
  code: CrisisRefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: RefusalRecovery,
  matched: string | null = null,
): CrisisRefusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: CRISIS_RULESET_VERSION };
}

/* ── Small total helpers. `null` propagates; it never collapses to 0. ──────── */

function ms(at: Instant | null | undefined): number | null {
  if (typeof at !== 'string' || at.trim() === '') return null;
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : null;
}

function minutesBetween(from: Instant | null | undefined, to: Instant | null | undefined): number | null {
  const a = ms(from);
  const b = ms(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 60000);
}

function nonEmpty(s: string | null | undefined): string | null {
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : null;
}

function usableLines(lines: readonly string[] | null | undefined): readonly string[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((l) => nonEmpty(l)).filter((l): l is string => l !== null);
}

/** Comparison key for "is this the same assertion". Case and spacing only. */
function factKey(line: string): string {
  return line.toLowerCase().replace(/\s+/g, ' ').replace(/[.;,]+$/, '').trim();
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §2  THE EVIDENCE — WHY EACH GATE EXISTS, HELD AS DATA
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The four documented cases this room is built out of, with sources, so a
 * surface can show WHY a refusal exists instead of asserting that it should be
 * obeyed. A gate whose reason a human cannot check gets clicked past the first
 * time it is inconvenient — which is the failure mode that makes compliance
 * software ornamental.
 */
export interface CrisisEvidence {
  readonly key: 'svb_run_speed' | 'ftx_over_reassurance' | 'crypto_com_contagion' | 'cerc_clearance';
  readonly headline: string;
  readonly detail: string;
  /** The primary document, named precisely enough to be fetched and checked. */
  readonly authority: string;
  readonly locator: string;
  readonly url: string;
  /**
   * THE `INSTRUMENTS` ENTRY THIS EVIDENCE IS THE EVIDENCE *OF*, WHERE ONE EXISTS.
   *
   * `INSTRUMENTS` had no key for SEC v. Bankman-Fried or the Federal Reserve's SVB
   * review, so those two citations rode as `desk_policy` and their `url` lived only
   * here — a second copy of an authority's address, free to drift from the register
   * every other citation in the compartment resolves through. Both now have
   * non-binding keys and this field names them.
   *
   * `null` IS A REAL ANSWER, not a gap to be filled later: `crypto_com_contagion`
   * rests on contemporaneous press reporting, which is not an instrument and must not
   * be dressed as one. `crisis.test.ts` asserts that a non-null key resolves and that
   * its URL matches `INSTRUMENTS[key].url`, so the two copies cannot disagree.
   */
  readonly instrument: InstrumentKey | null;
}

/**
 * WHY THERE IS A CLOCK AT ALL, in the words of the supervisor who wrote the
 * post-mortem. The strongest available argument that a comms desk at an exchange
 * is a risk system and not a growth system.
 */
export const SVB_RUN_SPEED_EVIDENCE: CrisisEvidence = {
  key: 'svb_run_speed',
  headline: 'Over $40bn left SVB in a single day — roughly 85% of the deposit base.',
  detail:
    'The Federal Reserve\'s own review records that "On March 9, SVB lost over $40 billion in deposits, and SVBFG management expected to lose over $100 billion more on March 10", representing "roughly 85 percent of the bank\'s deposit base", against Wachovia\'s "$10 billion in outflows over 8 days" in 2008 and Washington Mutual\'s "$19 billion over 16 days". The review concludes that "the combination of social media, a highly networked and concentrated depositor base, and technology may have fundamentally changed the speed of bank runs". An exchange is worse-positioned on every dimension named: withdrawals are 24/7, settle in minutes, and there is no deposit insurance to slow a panic. So the unit for this desk is minutes, not hours. Note the second-order finding too: SVB\'s own 8 March announcement was the trigger. A badly-sequenced disclosure caused the run.',
  authority: "Federal Reserve, Review of the Federal Reserve's Supervision and Regulation of Silicon Valley Bank (28 April 2023)",
  locator: "Vice Chair Barr's foreword; body, deposit-outflow findings",
  instrument: 'fed_svb_review',
  url: 'https://www.federalreserve.gov/publications/files/svb-review-20230428.pdf',
};

/**
 * WHY OVER-REASSURANCE IS THE CHARGED ACT rather than a style note. §4 exists
 * because of this paragraph, and the refusal it drives cannot be overridden.
 */
export const FTX_OVER_REASSURANCE_EVIDENCE: CrisisEvidence = {
  key: 'ftx_over_reassurance',
  headline: '"FTX is fine. Assets are fine." — pleaded as fraud, then deleted.',
  detail:
    'The SEC\'s complaint pleads, at paragraph 78: "Attempting to maintain public and investor confidence in FTX, Bankman-Fried tweeted on or about November 7, 2022: \'FTX is fine. Assets are fine ... FTX has enough to cover all client holdings. We don\'t invest client assets (even in treasuries). We have been processing all withdrawals, and will continue to be ....\' That tweet was false and misleading, and Bankman-Fried later deleted it." Paragraph 79: "The next day, November 8, 2022, FTX paused all customer withdrawals, and the price of FTT plummeted by approximately 80%." Paragraph 52 pleads earlier reassurances in the same way, including "We will always allow withdrawals". Three things follow and all three are encoded: a solvency assertion is a regulated claim and not a reassurance; an unconditional forward commitment is a distinct and higher class than a present-tense fact; and deletion is not remediation, because the complaint records both the tweet and its deletion.',
  authority: 'SEC v. Samuel Bankman-Fried, No. 1:22-cv-10501 (S.D.N.Y., filed 13 December 2022)',
  locator: 'Complaint paragraphs 52, 78, 79',
  instrument: 'sec_v_bankman_fried',
  url: 'https://www.sec.gov/files/litigation/complaints/2022/comp-pr2022-219.pdf',
};

/**
 * WHY PEER PRECLEARS EXIST. LCX has a native exchange token, which puts it in
 * the equivalence class CRO and FTT were in during November 2022.
 */
export const CRYPTO_COM_CONTAGION_EVIDENCE: CrisisEvidence = {
  key: 'crypto_com_contagion',
  headline: 'Crypto.com, November 2022: attacked for a shared attribute, not for anything it did.',
  detail:
    'A decline in the value of Cronos, the exchange\'s own token, triggered fears of a collapse similar to FTX\'s and spurred withdrawals; the CEO gave assurances that the firm was liquid and that it did not use Cronos in the way FTX used FTT. The attribute under attack was structural — a native exchange token — and the question asked was "are you like them". LCX is in that class. The answer has to be written before the peer fails, because the window in which it is asked is measured in the minutes the SVB review describes.',
  authority: 'Contemporaneous reporting on FTX contagion (Reuters, collected)',
  locator: 'Crypto.com / Cronos, November 2022',
  instrument: null,
  url: 'https://en.wikipedia.org/wiki/Bankruptcy_of_FTX',
};

/**
 * WHY THE THREE CLEARS ARE PARALLEL. The doctrine names the tension explicitly,
 * then resolves it in favour of speed without giving up review.
 */
export const CERC_CLEARANCE_EVIDENCE: CrisisEvidence = {
  key: 'cerc_clearance',
  headline: 'Three clears, gathered simultaneously. Legal stays out unless there are legal implications.',
  detail:
    'CERC names the tension — "The need to ensure that information is confirmed to be accurate through a clearance process [and] The need to ensure that information is communicated quickly" — then prescribes three reviewers: reputation, policy, and a subject matter expert "who is both fast and knowledgeable". And the constraints: "Keep the legal department out of the clearance process unless the subject has specific legal implications"; "you may have others review and comment on the document, but not delay its release"; "Clear all information simultaneously"; "Ask if he or she would be comfortable seeing this as a news headline"; and "it is worse to release nothing than to release information that is not yet complete". A serial approval chain is what makes regulated desks structurally too slow to matter in a crisis, so clearance is modelled as a set of independent holds and never as a pipeline.',
  authority: 'CDC Crisis and Emergency Risk Communication (CERC) manual, Crisis Communication Plans chapter',
  locator: 'Information verification and clearance procedures',
  instrument: 'cerc',
  url: 'https://emergency.cdc.gov/cerc/manual/index.asp',
};

export const CRISIS_EVIDENCE: readonly CrisisEvidence[] = [
  SVB_RUN_SPEED_EVIDENCE,
  FTX_OVER_REASSURANCE_EVIDENCE,
  CRYPTO_COM_CONTAGION_EVIDENCE,
  CERC_CLEARANCE_EVIDENCE,
] as const;

/* ════════════════════════════════════════════════════════════════════════════
 *  §3  THE CLOCK — TIME TO FIRST STATEMENT, AGAINST A BUDGET
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * `ImpactSeverity` under the name the crisis surfaces use. AN ALIAS, NOT A COPY:
 * it is the same four values from `types.ts`, so a value crosses between the
 * triage board and this room without a conversion. It exists because "impact
 * severity" reads oddly next to a clock, and because a surface importing only
 * `crisis.js` should not have to reach into `types.js` for the label.
 */
export type IncidentSeverity = ImpactSeverity;

/**
 * Display order, worst first. `types.ts` declares the union but no ordered array,
 * and order matters here: a severity picker that lists `none` first invites the
 * wrong answer under pressure.
 */
export const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = ['high', 'medium', 'low', 'none'] as const;

/** Labels written for a crisis surface, where "none" still means a live clock. */
export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  high: 'High — run risk',
  medium: 'Medium — material and public',
  low: 'Low — contained',
  none: 'None yet — watch',
};

/**
 * Re-exported, NOT redefined, so a surface importing this room does not also
 * have to reach into `types.js` for the three things it needs to render a
 * clearance board. These are `types.ts`'s definitions; there is deliberately no
 * second copy of them anywhere in this file.
 */
export type { ContagionAttribute } from './types.js';
export { CLEARANCE_HEADLINE_TEST_QUESTION, CRISIS_BLOCKING_CLEARANCES } from './types.js';

/**
 * Minutes from the desk becoming aware to its first statement, by severity.
 *
 * DESK TARGETS derived from `SVB_RUN_SPEED_EVIDENCE`, not legal deadlines, and
 * nothing in MiCA sets one. What MiCA does set, where the information is inside
 * information, is Art 88(1)'s "as soon as possible" — stricter than any number
 * here, and not satisfied by hitting a budget.
 *
 * 30 minutes at `high` is uncomfortable and is meant to be: if $40bn could leave
 * a bank in a business day with wire cut-offs, an exchange whose withdrawals
 * settle in minutes does not have an hour. `none` still carries a budget,
 * because "we were watching it" with no recorded clock is indistinguishable
 * from not having noticed.
 */
/*
 * NOT THE SAME LADDER AS `triage.ts`'s `TTFS_BUDGET_MINUTES_BY_TIER`, and the names say
 * so because the two were both called `TTFS_BUDGET_MINUTES` and disagreed at `medium`
 * (120 here, 240 there). Neither was wrong: this one is keyed on INCIDENT SEVERITY —
 * something happened to LCX and the desk owes the public a statement — and the triage
 * one is keyed on the PRIORITY TIER of somebody else's claim, where `low` carries no
 * clock at all. Reconciling them to one number would have invented an agreement that
 * does not exist between "our exchange is down" and "an account with 40 followers is
 * wrong about us". They must never be indexed by each other's key space; that is what
 * `Record<ImpactSeverity>` versus `Record<PriorityTier>` is for.
 */
export const TTFS_BUDGET_MINUTES_BY_SEVERITY: Record<ImpactSeverity, number> = {
  high: 30,
  medium: 120,
  low: 480,
  none: 1440,
};

/**
 * Incident types with run dynamics halve the budget, floored at 15 minutes.
 *
 * The distinction is not severity, it is MECHANISM: an outage annoys people, a
 * solvency rumour moves their money. The SVB review's finding is specifically
 * about withdrawal velocity, so the types that can start a withdrawal race get
 * the tighter clock even at the same severity as one that cannot.
 */
export const RUN_DYNAMIC_INCIDENT_TYPES: readonly IncidentType[] = [
  'security_incident',
  'hack_rumour',
  'depeg',
  'peer_contagion',
] as const;

export const TTFS_FLOOR_MINUTES = 15;

export const TTFS_BUDGET_BASIS =
  'These budgets are desk targets reasoned from the Federal Reserve\'s SVB review, not legal deadlines. Where the information is inside information, MiCA Art 88(1) requires the public to be informed "as soon as possible", which is stricter than any budget here and is not satisfied by meeting one.';

/** The budget for one incident, in the shared shape. Pure; never throws. */
export function ttfsBudget(
  incidentType: IncidentType,
  severity: ImpactSeverity,
): TimeToFirstStatementBudget {
  const base = TTFS_BUDGET_MINUTES_BY_SEVERITY[severity];
  const runDynamic = RUN_DYNAMIC_INCIDENT_TYPES.includes(incidentType);
  const budgetMinutes = runDynamic ? Math.max(TTFS_FLOOR_MINUTES, Math.floor(base / 2)) : base;
  return { incidentType, severity, budgetMinutes };
}

/**
 * A recorded decision to stop the clock. The only way a budget stops burning.
 *
 * The shape is `types.ts`'s `ClockSuppression` — ONE record for both clocks. It was
 * declared here and again in `triage.ts`, field-for-field identical, and re-exporting
 * rather than redeclaring is what stops the two surfaces drifting on whether `reason`
 * is mandatory. `assessTtfs` below checks it; so does `readTriageClock`. Imported, not
 * re-exported: the barrel publishes it once, from the vocabulary.
 */

export type TtfsState =
  /** Statement issued inside the budget. */
  | 'met'
  /** Statement issued, after the budget. A recorded event, not a colour. */
  | 'breached'
  /** Nothing said yet, budget not yet spent. */
  | 'running'
  /** Nothing said yet, budget already spent. The loudest state on the surface. */
  | 'overdue'
  /** Clock stopped by a recorded decision. Elapsed is still reported. */
  | 'suppressed'
  /**
   * The desk cannot tell — `openedAt` or `now` is missing or unusable. Distinct
   * from `met` in every direction, and it must never render as a zero or a tick.
   */
  | 'unknown';

export interface TtfsAssessment {
  readonly budget: TimeToFirstStatementBudget;
  /** Minutes from opening to first statement, or to `now` where none was issued. */
  readonly elapsedMinutes: number | null;
  /** Positive is time left, negative is over. `null` wherever elapsed is. */
  readonly remainingMinutes: number | null;
  readonly state: TtfsState;
  readonly firstStatementAt: Instant | null;
  readonly suppression: ClockSuppression | null;
  /** One sentence, operator-facing. Populated for every state, `unknown` included. */
  readonly sentence: string;
  /** The evidence justifying the budget's existence. */
  readonly basis: CrisisEvidence;
}

export interface TtfsInput {
  readonly incidentType: IncidentType;
  readonly severity: ImpactSeverity;
  /** When the DESK became aware. Not when the incident began. */
  readonly openedAt: Instant | null;
  /** When the first statement was actually issued, or `null`. */
  readonly firstStatementAt: Instant | null;
  readonly now: Instant;
  readonly suppression: ClockSuppression | null;
}

/**
 * Time to first statement, against budget. Pure, total, never throws.
 *
 * The one metric on this surface that is honestly measurable with no X
 * credential, because both endpoints are the desk's own records. Which is why it
 * is the headline number in M8 and impressions are not: impressions need a
 * denominator that does not exist, and this needs two timestamps we own.
 */
export function assessTimeToFirstStatement(input: TtfsInput): TtfsAssessment {
  const budget = ttfsBudget(input.incidentType, input.severity);
  const suppression = input.suppression;
  const first = nonEmpty(input.firstStatementAt);
  const elapsed = minutesBetween(input.openedAt, first ?? input.now);
  const remaining = elapsed === null ? null : budget.budgetMinutes - elapsed;

  const base = {
    budget,
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    firstStatementAt: first,
    suppression,
    basis: SVB_RUN_SPEED_EVIDENCE,
  };

  if (elapsed === null) {
    return {
      ...base,
      state: 'unknown',
      sentence:
        'Time to first statement cannot be computed: the opening instant or the current instant is missing or unusable. This is not "on target" — it is unmeasured. Record when the desk became aware before the budget means anything.',
    };
  }

  if (suppression !== null) {
    return {
      ...base,
      state: 'suppressed',
      sentence: `Clock suppressed by ${suppression.by} at ${suppression.at}: ${suppression.reason} Elapsed at suppression is still recorded as ${elapsed} minute(s) against a ${budget.budgetMinutes}-minute budget.`,
    };
  }

  if (first !== null) {
    const met = elapsed <= budget.budgetMinutes;
    return {
      ...base,
      state: met ? 'met' : 'breached',
      sentence: met
        ? `First statement issued ${elapsed} minute(s) after the desk became aware, inside the ${budget.budgetMinutes}-minute budget for a ${input.severity}-severity ${input.incidentType}.`
        : `BREACH: first statement issued ${elapsed} minute(s) after the desk became aware, ${elapsed - budget.budgetMinutes} minute(s) over the ${budget.budgetMinutes}-minute budget for a ${input.severity}-severity ${input.incidentType}. The breach is the finding; record what caused the delay in the post-mortem.`,
    };
  }

  const overdue = elapsed > budget.budgetMinutes;
  return {
    ...base,
    state: overdue ? 'overdue' : 'running',
    sentence: overdue
      ? `OVERDUE: nothing has been said for ${elapsed} minute(s) against a ${budget.budgetMinutes}-minute budget. CERC: "it is worse to release nothing than to release information that is not yet complete." Issue the known / not-known / next-update statement now.`
      : `${elapsed} minute(s) elapsed; ${remaining} minute(s) of the ${budget.budgetMinutes}-minute budget remaining. Nothing has been said yet.`,
  };
}

/**
 * Validate a suppression before it is recorded. The reason is the entire point:
 * a suppression without one hides the breach, and the breach is the only thing
 * anyone can learn from afterwards.
 */
export function validateClockSuppression(input: {
  readonly reason: string | null;
  readonly by: ActorId | null;
  readonly at: Instant | null;
}): CrisisRefusal | null {
  const reason = nonEmpty(input.reason);
  const by = nonEmpty(input.by);
  if (reason !== null && reason.length >= 12 && by !== null && ms(input.at) !== null) return null;
  return refuse(
    'TTFS_SUPPRESSION_UNREASONED',
    'The time-to-first-statement clock cannot be suppressed without a recorded reason of at least twelve characters, a named person, and a valid instant. Suppression is how a breach becomes invisible, and the breach is the only thing a post-mortem can learn from.',
    DESK_CLOCK,
    {
      kind: 'supply_data',
      missing: 'a reason of at least twelve characters, the person suppressing, and a valid instant',
      whoCanSupply: 'the operator suppressing the clock',
    },
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §4  THE STATEMENT — THE CERC TRI-SLOT, AND WHAT MAY NOT BE SAID IN IT
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A basis for a claim that would otherwise be over-reassurance.
 *
 * `asOf` is mandatory and is checked against a staleness horizon, because "our
 * reserves are fully backed" evidenced by an attestation from four months ago is
 * the FTX sentence with a footnote. An attestation is a photograph, not a state.
 *
 * `assertedBy` is the named human who says this basis supports this claim. The
 * system never derives that link: it cannot read an attestation, and pretending
 * it can is how a citation becomes decoration.
 */
export interface CitedBasis {
  readonly kind:
    | 'attestation'
    | 'proof_of_reserves'
    | 'audit'
    | 'regulatory_filing'
    | 'on_chain_record'
    | 'internal_ledger_extract';
  /** A reference a human can go and fetch. Never "confirmed by treasury". */
  readonly ref: string;
  readonly asOf: Instant;
  readonly assertedBy: ActorId;
  /** Which reassurance classes this basis is offered as evidence for. */
  readonly supports: readonly ReassuranceClass[];
}

/**
 * How old a basis may be before it stops supporting a present-tense claim about
 * client funds. Seven days is a desk judgement, stated as one, and it is short
 * deliberately: the interval between "assets are fine" and a full withdrawal
 * pause was ONE DAY (`FTX_OVER_REASSURANCE_EVIDENCE`, paragraphs 78-79).
 */
export const REASSURANCE_BASIS_MAX_AGE_DAYS = 7;

export const REASSURANCE_BASIS_AGE_BASIS =
  'Seven days is a desk judgement, not a legal figure. It is short because the interval between "FTX is fine. Assets are fine" and a full withdrawal pause was one day. A basis older than this does not support a present-tense claim about client funds; it supports a claim about the date it was taken.';

/**
 * The classes of reassurance that need a cited basis, or cannot be said at all.
 *
 * These are not tone categories. Each one is a factual assertion about a state
 * of the world that the desk either can evidence or cannot, and the whole point
 * of the enum is that "sounds reassuring" is not one of the values.
 */
export type ReassuranceClass =
  /** "we are solvent", "we have enough to cover all client holdings" */
  | 'solvency'
  /** "client funds are safe", "your assets are secure" */
  | 'funds_safety'
  /** "reserves are fully backed", "1:1 backed" */
  | 'full_backing'
  /** "withdrawals are processing normally", "all systems normal" */
  | 'operations_normal'
  /** "we have no exposure to X" */
  | 'no_exposure'
  /** "we are audited", "independently verified" */
  | 'audited'
  /** "funds are insured" */
  | 'insured'
  /** an unconditional promise about all future time — never issuable */
  | 'unconditional_forward';

export const REASSURANCE_CLASSES: readonly ReassuranceClass[] = [
  'solvency',
  'funds_safety',
  'full_backing',
  'operations_normal',
  'no_exposure',
  'audited',
  'insured',
  'unconditional_forward',
] as const;

/**
 * `unconditional_forward` is the one class no basis can repair, and that is the
 * whole reason it is separated from the others.
 *
 * SEC v. Bankman-Fried paragraph 52 pleads "We will always allow withdrawals"
 * alongside the paragraph-78 tweet. There is no attestation that evidences every
 * future state of the world, so offering an "attach a basis" recovery here would
 * be a lie shaped like helpfulness. The honest recovery is to rewrite the
 * sentence with its conditions in it.
 */
export const REASSURANCE_CLASS_CURABLE_BY_BASIS: Record<ReassuranceClass, boolean> = {
  solvency: true,
  funds_safety: true,
  full_backing: true,
  operations_normal: true,
  no_exposure: true,
  audited: true,
  insured: true,
  unconditional_forward: false,
};

/**
 * A detector for one reassurance class.
 *
 * DELIBERATELY IMPRECISE, AND SAYING SO. These patterns catch the constructions
 * that have actually appeared in exchange failures. They will not catch a
 * paraphrase, and this file makes no claim that they do: the detector is a floor
 * under human review, not a substitute for it. `REASSURANCE_SCAN_IS_NOT_A_PROOF`
 * exists so a surface has to say that out loud rather than badge a scanned draft
 * as safe.
 */
export interface ReassurancePattern {
  readonly cls: ReassuranceClass;
  readonly pattern: RegExp;
  /** Why this construction is dangerous, in one sentence, for the operator. */
  readonly why: string;
}

export const REASSURANCE_SCAN_IS_NOT_A_PROOF = true;

export const REASSURANCE_SCAN_LIMIT_REASON =
  'This scan matches constructions that have appeared in real exchange failures. It cannot catch a paraphrase, another language, or an implication carried by tone. A draft that matches nothing has matched nothing — which is a statement about the pattern list, not about the draft.';

/**
 * The patterns. Each one is traceable to a documented sentence or to its direct
 * family, and the list is exported so it can be reviewed as prose rather than
 * discovered by grep.
 */
export const REASSURANCE_PATTERNS: readonly ReassurancePattern[] = [
  {
    cls: 'unconditional_forward',
    pattern: /\b(?:we|lcx)\s+will\s+(?:always|never)\b/i,
    why: 'A promise about all future time. "We will always allow withdrawals" is pleaded in SEC v. Bankman-Fried paragraph 52. No evidence can support it, so it cannot be issued with a citation either.',
  },
  {
    cls: 'unconditional_forward',
    pattern: /\b(?:guarantee|guaranteed|guarantees)\b/i,
    why: 'A guarantee is an unconditional commitment. If the desk means "we expect", write that; if it means "we are contractually obliged", cite the obligation.',
  },
  {
    cls: 'unconditional_forward',
    pattern: /\bat\s+all\s+times\b/i,
    why: 'An assertion about every future moment. Bound it in time or drop it.',
  },
  {
    cls: 'solvency',
    pattern: /\b(?:we\s+are|lcx\s+is)\s+(?:fully\s+)?solvent\b/i,
    why: 'A solvency assertion is a regulated claim, not a reassurance. It needs a dated basis a reader can check.',
  },
  {
    cls: 'solvency',
    pattern: /\benough\s+to\s+cover\s+all\b/i,
    why: 'This is the paragraph-78 construction — "FTX has enough to cover all client holdings" — pleaded as false and misleading.',
  },
  {
    cls: 'funds_safety',
    pattern: /\b(?:assets|funds|deposits)\s+are\s+(?:fine|safe|secure)\b/i,
    why: 'This is the paragraph-78 sentence almost verbatim: "Assets are fine". It is the charged act, not a bad look.',
  },
  {
    cls: 'funds_safety',
    pattern: /\byour\s+(?:funds|assets)\s+are\s+(?:safe|secure|protected)\b/i,
    why: 'A safety-of-funds assertion. It needs a dated basis, and "safe" needs to say safe from what.',
  },
  {
    cls: 'operations_normal',
    pattern: /\b(?:everything|all\s+systems)\s+(?:is|are)\s+(?:fine|normal|operational)\b/i,
    why: 'An all-clear during a live incident. CERC records the cost of one arm of a response saying "normal" while another says "degraded"; the desk loses more credibility than the incident did.',
  },
  {
    cls: 'operations_normal',
    pattern: /\b(?:lcx|we)\s+(?:is|are)\s+fine\b/i,
    why: 'This is the first three words of the paragraph-78 tweet: "FTX is fine."',
  },
  {
    cls: 'full_backing',
    pattern: /\b(?:fully\s+backed|1\s*:\s*1\s+backed|backed\s+1\s*:\s*1)\b/i,
    why: 'A backing ratio is a quantitative claim. It needs a dated basis and it decays; a backing figure with no as-of date is a claim about no particular moment.',
  },
  {
    cls: 'no_exposure',
    pattern: /\b(?:no|zero)\s+exposure\b/i,
    why: 'A negative factual claim, and the hardest kind to evidence. Name what the desk has checked and as at when.',
  },
  {
    cls: 'audited',
    pattern: /\b(?:independently\s+)?(?:audited|verified\s+by)\b/i,
    why: 'An audit claim identifies a firm, a scope and a date, or it is unfalsifiable. An attestation is not an audit.',
  },
  {
    cls: 'insured',
    pattern: /\b(?:insured|insurance\s+cover(?:s|ed)?)\b/i,
    why: 'An insurance claim names the insurer, the limit and the exclusions, or it will be read as a deposit guarantee that does not exist.',
  },
] as const;

/** One matched construction, with the class it belongs to. */
export interface ReassuranceFinding {
  readonly cls: ReassuranceClass;
  readonly matched: string;
  readonly why: string;
}

/**
 * Find the reassurance constructions in a piece of text. Pure; never throws.
 *
 * Returns findings, not a verdict — the verdict needs the bases, and lives in
 * `assessReassurance`.
 */
export function scanReassurance(text: string): readonly ReassuranceFinding[] {
  const source = typeof text === 'string' ? text : '';
  const out: ReassuranceFinding[] = [];
  for (const p of REASSURANCE_PATTERNS) {
    const m = p.pattern.exec(source);
    if (m !== null) out.push({ cls: p.cls, matched: m[0], why: p.why });
  }
  return out;
}

export interface ReassuranceAssessment {
  readonly findings: readonly ReassuranceFinding[];
  readonly refusals: readonly CrisisRefusal[];
  /** Classes that were asserted AND carry a basis inside the age horizon. */
  readonly citedClasses: readonly ReassuranceClass[];
  readonly scanIsNotAProof: true;
}

/**
 * Over-reassurance, as a refusable defect rather than a style note.
 *
 * The rule, stated once: any assertion of solvency, safety of funds, full
 * backing, normal operations, absence of exposure, audit or insurance must carry
 * a dated basis from a named human, or it does not go out. An unconditional
 * forward commitment does not go out at all, because nothing can evidence it.
 *
 * A stale basis is refused SEPARATELY from a missing one, because they are
 * different failures and the operator's next action differs: one needs a fresh
 * figure, the other needs a citation.
 */
export function assessReassurance(
  text: string,
  bases: readonly CitedBasis[],
  now: Instant,
): ReassuranceAssessment {
  const findings = scanReassurance(text);
  const refusals: CrisisRefusal[] = [];
  const cited: ReassuranceClass[] = [];
  const nowMs = ms(now);
  const horizonMs = REASSURANCE_BASIS_MAX_AGE_DAYS * 86400000;

  for (const f of findings) {
    if (!REASSURANCE_CLASS_CURABLE_BY_BASIS[f.cls]) {
      refusals.push(
        refuse(
          'UNCONDITIONAL_FORWARD_COMMITMENT',
          `"${f.matched}" is an unconditional commitment about all future time. ${f.why} There is no basis that would make it issuable, so this refusal has no data recovery: the sentence has to say what the desk will do and under what conditions.`,
          DESK_NO_UNCONDITIONAL_FORWARD,
          {
            kind: 'edit_text',
            what: 'Replace the unconditional promise with a bounded statement: what the desk is doing, over what period, and what would change it.',
          },
          f.matched,
        ),
      );
      continue;
    }

    const offered = (Array.isArray(bases) ? bases : []).filter(
      (b) => Array.isArray(b.supports) && b.supports.includes(f.cls) && nonEmpty(b.ref) !== null && nonEmpty(b.assertedBy) !== null,
    );

    if (offered.length === 0) {
      refusals.push(
        refuse(
          f.cls === 'solvency' ? 'SOLVENCY_ASSERTION_WITHOUT_ATTESTATION' : 'OVER_REASSURANCE',
          `"${f.matched}" asserts ${f.cls.replace(/_/g, ' ')} with nothing behind it. ${f.why} CERC's instruction is "don't speculate and don't over-reassure", and over-reassurance is the charged act: SEC v. Bankman-Fried pleads "FTX is fine. Assets are fine" as false and misleading, one day before withdrawals were paused.`,
          f.cls === 'solvency' ? DESK_NO_OVER_REASSURANCE : CERC_NO_OVER_REASSURANCE,
          {
            kind: 'supply_data',
            missing: `a dated basis for the ${f.cls.replace(/_/g, ' ')} claim — a reference a reader could go and check, with an as-of date inside ${REASSURANCE_BASIS_MAX_AGE_DAYS} days`,
            whoCanSupply: 'treasury or finance, asserted by a named human',
          },
          f.matched,
        ),
      );
      continue;
    }

    const fresh = offered.filter((b) => {
      const asOf = ms(b.asOf);
      return asOf !== null && nowMs !== null && nowMs - asOf <= horizonMs && asOf <= nowMs;
    });

    if (fresh.length === 0) {
      const newest = offered
        .map((b) => ({ b, at: ms(b.asOf) }))
        .filter((x): x is { b: CitedBasis; at: number } => x.at !== null)
        .sort((a, z) => z.at - a.at)[0];
      refusals.push(
        refuse(
          'OVER_REASSURANCE_BASIS_STALE',
          newest === undefined
            ? `"${f.matched}" is offered with a basis that has no usable as-of date. A basis with no date supports a claim about no particular moment.`
            : `"${f.matched}" is offered with a basis dated ${newest.b.asOf}, which is outside the ${REASSURANCE_BASIS_MAX_AGE_DAYS}-day horizon. ${REASSURANCE_BASIS_AGE_BASIS}`,
          DESK_NO_OVER_REASSURANCE,
          {
            kind: 'supply_data',
            missing: `a basis for the ${f.cls.replace(/_/g, ' ')} claim dated within ${REASSURANCE_BASIS_MAX_AGE_DAYS} days, or a restatement of the claim as at the basis date`,
            whoCanSupply: 'treasury or finance, asserted by a named human',
          },
          f.matched,
        ),
      );
      continue;
    }

    if (!cited.includes(f.cls)) cited.push(f.cls);
  }

  return { findings, refusals, citedClasses: cited, scanIsNotAProof: true };
}

/* ── §4.2 The tri-slot, checked ────────────────────────────────────────────── */

/**
 * A crisis statement as the desk holds it: the shared `StatementBody` plus the
 * provenance of the words and the bases behind any reassurance in them.
 *
 * `statementId` and `statementVersion` are what make the record reproducible —
 * "which text did we use, and which version of it" — and they are `null`
 * together for an ad hoc statement, which is legitimate and recorded plainly.
 */
export interface CrisisStatementDraft {
  readonly incidentId: string;
  readonly incidentType: IncidentType;
  readonly phase: IncidentPhase;
  readonly severity: ImpactSeverity;
  /** Monotonic within the incident. Gives the "one story straight" audit its spine. */
  readonly seq: number;
  readonly body: StatementBody;
  /** The precleared statement this derives from, or `null` for ad hoc. */
  readonly statementId: HoldingStatementId | null;
  readonly statementVersion: number | null;
  /**
   * True where the operator wrote their own words instead of using a preclear.
   * Not a failure — it is the only escape hatch this file offers — but it needs a
   * named owner, because the point of the escape hatch is that somebody owns it.
   */
  readonly adHoc: boolean;
  readonly authoredBy: ActorId;
  /**
   * `recovery` phase only: the named assertion that the residual unknowns are
   * closed. `notKnown` may be empty only when this is present, so "we know
   * everything now" is somebody's signature rather than an omission.
   */
  readonly residualUnknownsClosed: { readonly assertedBy: ActorId; readonly basis: string } | null;
  /** Bases offered for any reassurance-class claim in the text (§4.1). */
  readonly bases: readonly CitedBasis[];
  /** Preconditions the operator has ticked. Acknowledged, never auto-satisfied. */
  readonly preconditionsAcknowledged: readonly HoldingPrecondition[];
  /** True where the operator marks this as also carrying promotional content. */
  readonly carriesPromotionalContent: boolean;
  /** True where the desk asserts this discloses inside information under Art 88(1). */
  readonly isInsideInformationDisclosure: boolean;
  /** Hash of the rendered text. Clearances bind to this, never to a row id. */
  readonly contentHash: ContentHash;
  /** The statement this supersedes or corrects, where there is one. */
  readonly supersedes: string | null;
}

export interface StatementCompleteness {
  readonly complete: boolean;
  readonly refusals: readonly CrisisRefusal[];
  /** Slot by slot, so a surface shows three lanes rather than one error. */
  readonly slots: {
    readonly known: boolean;
    readonly notKnown: boolean;
    readonly nextUpdate: boolean;
  };
}

/**
 * Is this statement issuable at all? The three slots are the template and all
 * three are mandatory.
 *
 * THE TWO REFUSALS THAT MATTER:
 *
 *  1. **An empty `notKnown` is refused.** By CERC's own logic a statement with
 *     nothing in the not-known column is either speculation or over-reassurance;
 *     there is no third thing it can be, because a live incident always has open
 *     questions. This is the highest-value refusal in the crisis path — it is
 *     what structurally prevents "FTX is fine. Assets are fine", which had no
 *     not-known column at all. Relaxed in `recovery` ONLY against a named
 *     assertion that the unknowns are closed.
 *
 *  2. **A missing or past `nextUpdateBy` is refused.** "We will keep you
 *     informed" with no time is not a commitment the desk can be held to or the
 *     audience can plan around. A time already in the past is worse: it is a
 *     breach at the moment of issue.
 *
 * Pure and total. Never throws.
 */
export function assessStatementCompleteness(
  draft: CrisisStatementDraft,
  now: Instant,
): StatementCompleteness {
  const refusals: CrisisRefusal[] = [];
  const body = draft.body;
  const known = usableLines(body?.known);
  const notKnown = usableLines(body?.notKnown);

  if (known.length === 0) {
    refusals.push(
      refuse(
        'CERC_KNOWN_EMPTY',
        'This statement says nothing that is known. A statement with an empty known column is not a holding statement, it is an admission that something is happening — and CERC\'s "be first" duty is discharged with facts, however few, not with the absence of them.',
        CERC_TRI_SLOT,
        {
          kind: 'edit_text',
          what: 'Add at least one fact the desk can stand behind. "We are aware of reports of delayed ETH withdrawals" is a fact.',
        },
      ),
    );
  }

  const recoveryClosed =
    draft.phase === 'recovery' &&
    draft.residualUnknownsClosed !== null &&
    nonEmpty(draft.residualUnknownsClosed.assertedBy) !== null &&
    nonEmpty(draft.residualUnknownsClosed.basis) !== null;

  if (notKnown.length === 0 && !recoveryClosed) {
    refusals.push(
      draft.phase === 'recovery'
        ? refuse(
            'CERC_RECOVERY_UNKNOWNS_NOT_CLOSED',
            'A recovery-phase statement may leave the not-known column empty only against a named assertion that the residual unknowns are closed, with the basis for it. Without that, an empty not-known column is an omission wearing the clothes of a resolution.',
            CERC_TRI_SLOT,
            {
              kind: 'supply_data',
              missing: 'who asserts the residual unknowns are closed, and on what basis',
              whoCanSupply: 'the incident owner',
            },
          )
        : refuse(
            draft.phase === 'initial' ? 'NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT' : 'CERC_NOT_KNOWN_EMPTY',
            'This statement claims nothing is unknown. During a live incident that is either speculation or over-reassurance — CERC requires stating what you know, what you do not know, and what you are doing to find out more, and the second column is the one that stops a statement becoming "everything is fine".',
            CERC_TRI_SLOT,
            {
              kind: 'edit_text',
              what: 'List at least one open question. "We do not yet know the cause" and "we cannot yet give a restoration time" are both legitimate and both beat silence on the point.',
            },
          ),
    );
  }

  const nextAction = nonEmpty(body?.nextStep?.action);
  const nextByRaw = body?.nextStep?.nextUpdateBy ?? null;
  const nextBy = ms(nextByRaw);
  const nowMs = ms(now);

  if (nextAction === null || nextBy === null) {
    refusals.push(
      refuse(
        'NEXT_UPDATE_BY_MISSING',
        'This statement makes no next-update commitment. CERC requires telling people when and where to get updates; without a committed instant and a statement of what the desk is doing in the meantime, "we will keep you informed" is a sentiment nobody can be held to.',
        CERC_TRI_SLOT,
        {
          kind: 'supply_data',
          missing: 'an instant by which the next statement will be issued, and what is happening until then',
          whoCanSupply: 'the incident owner',
        },
      ),
    );
  } else if (nowMs !== null && nextBy <= nowMs) {
    refusals.push(
      refuse(
        'CERC_NEXT_UPDATE_NOT_IN_FUTURE',
        `The committed next update (${nextByRaw}) is not in the future. Issuing this would breach the commitment at the moment it was made.`,
        CERC_TRI_SLOT,
        { kind: 'edit_text', what: 'Move the next-update instant to a time the desk can actually meet.' },
        String(nextByRaw),
      ),
    );
  }

  const withheld = body?.withheld ?? null;
  if (withheld !== null && nonEmpty(withheld.whyNotReleasable) === null) {
    refusals.push(
      refuse(
        'CERC_WITHHELD_WITHOUT_REASON',
        `The statement says "${nonEmpty(withheld.what) ?? '(unnamed)'}" is being withheld and does not say why. CERC: if you have information you are unable to share, tell the public why it is not available for release. Announcing a secret and refusing to explain it costs more credibility than not mentioning it.`,
        CERC_OPENNESS,
        { kind: 'edit_text', what: 'Give the reason it cannot be released, or remove the withheld entry.' },
        nonEmpty(withheld.what),
      ),
    );
  }

  return {
    complete: refusals.length === 0,
    refusals,
    slots: {
      known: known.length > 0,
      notKnown: notKnown.length > 0 || recoveryClosed,
      nextUpdate: nextAction !== null && nextBy !== null && (nowMs === null || nextBy > nowMs),
    },
  };
}

/**
 * Render the statement the desk will hand to a human. Composed from the slots,
 * so a slot that is missing is visibly missing rather than silently absent.
 *
 * This is NOT a publish path and there is no length budget applied here: a
 * crisis statement that does not fit in a post is published on an owned page and
 * linked, which is a decision for the desk and not for a truncator.
 */
export function renderStatementText(body: StatementBody): string {
  const known = usableLines(body?.known);
  const notKnown = usableLines(body?.notKnown);
  const lines: string[] = [];
  if (nonEmpty(body?.empathy) !== null) lines.push(nonEmpty(body.empathy) as string, '');
  lines.push('WHAT WE KNOW');
  lines.push(...(known.length > 0 ? known.map((k) => `- ${k}`) : ['- (nothing recorded)']));
  lines.push('', 'WHAT WE DO NOT YET KNOW');
  lines.push(...(notKnown.length > 0 ? notKnown.map((k) => `- ${k}`) : ['- (nothing recorded)']));
  const withheld = body?.withheld ?? null;
  if (withheld !== null && nonEmpty(withheld.what) !== null) {
    lines.push('', 'WHAT WE ARE NOT RELEASING, AND WHY');
    lines.push(`- ${nonEmpty(withheld.what)}: ${nonEmpty(withheld.whyNotReleasable) ?? '(no reason recorded)'}`);
  }
  lines.push('', 'WHAT HAPPENS NEXT');
  lines.push(
    `- ${nonEmpty(body?.nextStep?.action) ?? '(no action recorded)'}`,
    `- Next update by ${nonEmpty(body?.nextStep?.nextUpdateBy) ?? '(no time committed)'}`,
  );
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §5  THE THREE PARALLEL BLOCKING CLEARS
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * What one clearance lane looks like, resolved. A lane, not a step.
 *
 * PARALLEL IS THE POINT, and it is encoded in the shape rather than asserted in
 * a comment: this function takes an unordered SET of clearances and returns a
 * per-role state. Nothing in it reads a position in a sequence, so no ordering of
 * arrivals can produce a different answer — which is the property a test asserts
 * by permuting the input. A serial chain is what makes a regulated desk
 * structurally too slow to matter in a crisis, and once one exists in code
 * nobody ever takes it out.
 */
export interface ClearanceLane {
  readonly role: ClearanceRole;
  readonly required: boolean;
  readonly state:
    | 'held'
    /** No clearance recorded for this role. */
    | 'outstanding'
    /** Recorded, but the reviewer answered the headline test 'no'. */
    | 'refused_on_headline_test'
    /** Recorded against different bytes. Void — see `CLEARANCE_VOID_CONTENT_CHANGED`. */
    | 'void_content_changed'
    /** Recorded by the author of the text. Not a second pair of eyes. */
    | 'void_self_cleared'
    /** Recorded, but this role is advisory: it may comment and may not delay. */
    | 'advisory_comment'
    /** Not required for this item, and nothing was recorded. */
    | 'not_required';
  readonly clearance: Clearance | null;
  /** Minutes from statement authoring to this clearance. `null` where not held. */
  readonly latencyMinutes: number | null;
  /** One sentence for the lane, always populated. */
  readonly sentence: string;
}

export interface ClearanceAssessment {
  readonly lanes: readonly ClearanceLane[];
  /** True only when every required blocking lane is `held`. */
  readonly allBlockingHeld: boolean;
  readonly refusals: readonly CrisisRefusal[];
  /** Advisory comments, surfaced and never able to block. */
  readonly advisoryComments: readonly { readonly role: ClearanceRole; readonly reviewer: ActorId; readonly comment: string }[];
  /**
   * Blocking roles supplied for `legal` when the item has no legal
   * implications. Downgraded to advisory rather than honoured, per CERC.
   */
  readonly downgradedToAdvisory: readonly ClearanceRole[];
  /** Distinct humans holding a required blocking lane. */
  readonly distinctReviewers: number;
  /**
   * The honest admission, or `null`. Doctrine rule 8: four eyes with two
   * approvers is not four eyes, and the surface has to say so rather than
   * perform it.
   */
  readonly benchAdmission: string | null;
  /** The lane that took longest, for the per-role latency metric in M8. */
  readonly longestPole: { readonly role: ClearanceRole; readonly minutes: number } | null;
  readonly headlineTestQuestion: string;
}

export interface ClearanceInput {
  /** The bytes the clearances must be against. */
  readonly contentHash: ContentHash;
  readonly authoredBy: ActorId;
  readonly authoredAt: Instant;
  /** Unordered. Order of arrival must not change the outcome. */
  readonly clearances: readonly Clearance[];
  /**
   * True where the subject has specific legal implications. CERC: keep legal out
   * of the clearance process unless it does. Stated by a human; nothing infers
   * it, because inferring "this is legally sensitive" from text is exactly the
   * judgement a machine should not be making.
   */
  readonly legalImplications: boolean;
}

/**
 * Resolve the clearance state. Pure, total, order-independent, never throws.
 *
 * The four things this encodes that a single "approver" slot cannot:
 *
 *  1. **Three blocking lanes, gathered in parallel** — reputation, policy, SME.
 *  2. **Legal is excluded unless there are legal implications.** A blocking legal
 *     clearance supplied when there are none is DOWNGRADED to advisory rather
 *     than honoured, so an interested party cannot make itself a veto by
 *     submitting a hold. That is the mechanism that stops a crisis clearance
 *     deadlocking, and it is CERC's rule read literally.
 *  3. **Advisory reviewers may comment and may not delay.** An advisory
 *     clearance can never appear as outstanding and can never move
 *     `allBlockingHeld`.
 *  4. **A clearance binds to bytes.** Change the text and every clearance
 *     against the old hash is void — otherwise four eyes degrades into four eyes
 *     on an earlier draft, which is the commonest real failure of these systems.
 */
export function assessClearance(input: ClearanceInput): ClearanceAssessment {
  const supplied = Array.isArray(input.clearances) ? input.clearances : [];
  const requiredRoles: ClearanceRole[] = [...CRISIS_BLOCKING_CLEARANCES];
  if (input.legalImplications) requiredRoles.push('legal');

  const downgraded: ClearanceRole[] = [];
  const advisoryComments: { role: ClearanceRole; reviewer: ActorId; comment: string }[] = [];
  const refusals: CrisisRefusal[] = [];
  const lanes: ClearanceLane[] = [];
  const heldReviewers = new Set<ActorId>();

  const roles: ClearanceRole[] = ['reputation', 'policy', 'sme', 'legal'];

  for (const role of roles) {
    const required = requiredRoles.includes(role);
    // Highest-value clearance for this role: a held one beats a void one.
    const forRole = supplied.filter((c) => c?.role === role);

    // CERC: legal may not sit in the blocking path by default.
    const effectiveMode = (c: Clearance): 'blocking' | 'advisory' => {
      if (role === 'legal' && !input.legalImplications && c.mode === 'blocking') {
        if (!downgraded.includes('legal')) downgraded.push('legal');
        return 'advisory';
      }
      return c.mode;
    };

    for (const c of forRole) {
      if (effectiveMode(c) === 'advisory' && nonEmpty(c.comment) !== null) {
        advisoryComments.push({ role, reviewer: c.reviewer, comment: nonEmpty(c.comment) as string });
      }
    }

    const blocking = forRole.filter((c) => effectiveMode(c) === 'blocking');

    if (!required) {
      const advisoryOnly = forRole.length > 0;
      lanes.push({
        role,
        required: false,
        state: advisoryOnly ? 'advisory_comment' : 'not_required',
        clearance: advisoryOnly ? forRole[0] : null,
        latencyMinutes: null,
        sentence: advisoryOnly
          ? `${role} reviewed and commented. This lane is advisory for this item: CERC allows others to "review and comment on the document, but not delay its release", so it cannot hold the statement.`
          : role === 'legal'
            ? 'Legal is not in the clearance path: this item is not flagged as having specific legal implications. CERC keeps legal out unless the subject has them, because a legal review in the path is what makes a crisis desk structurally too slow to matter.'
            : `${role} is not required for this item.`,
      });
      continue;
    }

    if (blocking.length === 0) {
      lanes.push({
        role,
        required: true,
        state: 'outstanding',
        clearance: null,
        latencyMinutes: null,
        sentence: `${role} has not cleared. This lane blocks release and is gathered in parallel with the others — it does not wait for them.`,
      });
      continue;
    }

    const c = blocking[0];
    if (c.contentHash !== input.contentHash) {
      lanes.push({
        role,
        required: true,
        state: 'void_content_changed',
        clearance: c,
        latencyMinutes: null,
        sentence: `${role} cleared different bytes (${String(c.contentHash).slice(0, 12)}…), and the text has changed since. That clearance is void: an approval of an earlier draft is not an approval of this one.`,
      });
      refusals.push(
        refuse(
          'CLEARANCE_VOID_CONTENT_CHANGED',
          `${c.reviewer} cleared the ${role} lane against different text. The clearance is void because the statement changed after it was given, and "four eyes on an earlier draft" is the commonest way these systems fail quietly.`,
          CERC_THREE_CLEARS,
          { kind: 'human_authority', role },
          String(c.contentHash),
        ),
      );
      continue;
    }

    if (c.reviewer === input.authoredBy) {
      lanes.push({
        role,
        required: true,
        state: 'void_self_cleared',
        clearance: c,
        latencyMinutes: null,
        sentence: `${role} was cleared by ${c.reviewer}, who wrote the statement. That is not a second pair of eyes and it does not count.`,
      });
      refusals.push(
        refuse(
          'SELF_APPROVAL_FORBIDDEN',
          `${c.reviewer} wrote this statement and also cleared the ${role} lane. Separation of duties is a constraint, not a preference: the author cannot be one of the three clears.`,
          CERC_THREE_CLEARS,
          { kind: 'human_authority', role },
          c.reviewer,
        ),
      );
      continue;
    }

    if (!c.headlineTest) {
      lanes.push({
        role,
        required: true,
        state: 'refused_on_headline_test',
        clearance: c,
        latencyMinutes: minutesBetween(input.authoredAt, c.at),
        sentence: `${c.reviewer} reviewed the ${role} lane and answered "no" to: ${CLEARANCE_HEADLINE_TEST_QUESTION} That is a refusal to clear, not a pending clearance.`,
      });
      refusals.push(
        refuse(
          'CLEARANCE_HEADLINE_TEST_FAILED',
          `${c.reviewer} would not be comfortable seeing this as a news headline. CERC makes that the reviewer's test, and a "no" is a substantive objection: the text has to change, not the reviewer.`,
          CERC_HEADLINE_TEST,
          { kind: 'edit_text', what: nonEmpty(c.comment) ?? 'Ask the reviewer which sentence they would not want quoted, and rewrite that.' },
          nonEmpty(c.comment),
        ),
      );
      continue;
    }

    heldReviewers.add(c.reviewer);
    lanes.push({
      role,
      required: true,
      state: 'held',
      clearance: c,
      latencyMinutes: minutesBetween(input.authoredAt, c.at),
      sentence: `${role} cleared by ${c.reviewer} at ${c.at}, headline test answered yes, against the current text.`,
    });
  }

  const requiredLanes = lanes.filter((l) => l.required);
  const outstanding = requiredLanes.filter((l) => l.state !== 'held');
  const allBlockingHeld = outstanding.length === 0;

  if (!allBlockingHeld) {
    const names = outstanding.filter((l) => l.state === 'outstanding').map((l) => l.role);
    if (names.length > 0) {
      refusals.push(
        refuse(
          'CLEARANCE_BLOCKING_OUTSTANDING',
          `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} not cleared. A crisis statement needs three blocking clears — reputation, policy and subject matter expert — gathered simultaneously${input.legalImplications ? ', plus legal because this item is flagged as having legal implications' : ''}.`,
          CERC_THREE_CLEARS,
          { kind: 'human_authority', role: names[0] },
        ),
      );
    }
  }

  if (input.legalImplications && !requiredLanes.some((l) => l.role === 'legal' && l.state === 'held')) {
    refusals.push(
      refuse(
        'CLEARANCE_LEGAL_REQUIRED',
        'This item is flagged as having specific legal implications, so legal is a blocking lane for it. CERC keeps legal out of the clearance process by default precisely so that this exception means something.',
        CERC_ADVISORY_MAY_NOT_DELAY,
        { kind: 'human_authority', role: 'legal' },
      ),
    );
  }

  const distinctReviewers = heldReviewers.size;
  const requiredCount = requiredLanes.length;
  let benchAdmission: string | null = null;

  if (distinctReviewers === 1 && requiredCount > 1) {
    benchAdmission = `All held clearances on this statement were given by one person. ${requiredCount} independent clears were required and one human supplied them, so this is one pair of eyes wearing ${requiredCount} hats. The instrument records that rather than reporting the statement as cleared.`;
    refusals.push(
      refuse(
        'FOUR_EYES_UNACHIEVABLE',
        benchAdmission,
        CERC_THREE_CLEARS,
        {
          kind: 'not_recoverable',
          why: 'A second and third reviewer have to exist. No configuration of this instrument can turn one person into three independent clears, and pretending otherwise would make the record actively misleading.',
        },
      ),
    );
  } else if (distinctReviewers > 0 && distinctReviewers < requiredCount) {
    benchAdmission = `${requiredCount} independent clears are required and ${distinctReviewers} distinct people supplied the held ones. That is thinner than the doctrine assumes, and it is stated here rather than hidden behind a green tick.`;
  }

  const held = requiredLanes.filter(
    (l): l is ClearanceLane & { latencyMinutes: number } => l.state === 'held' && l.latencyMinutes !== null,
  );
  const longestPole =
    held.length === 0
      ? null
      : held.reduce((worst, l) => (l.latencyMinutes > worst.latencyMinutes ? l : worst), held[0]);

  return {
    lanes,
    allBlockingHeld,
    refusals,
    advisoryComments,
    downgradedToAdvisory: downgraded,
    distinctReviewers,
    benchAdmission,
    longestPole: longestPole === null ? null : { role: longestPole.role, minutes: longestPole.latencyMinutes },
    headlineTestQuestion: CLEARANCE_HEADLINE_TEST_QUESTION,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §6  THE PRECLEARED LIBRARY — VERSIONED TEXT, IN CODE
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A precondition the operator ACKNOWLEDGES. Never auto-checked.
 *
 * The instrument cannot know whether security has confirmed an exploit is real
 * or whether treasury has looked at the balances. It can refuse to proceed until
 * a named human says they did, and it can record that they said it. Auto-
 * satisfying a precondition the system cannot verify is how a checklist becomes
 * a formality — and the one class of statement that most needs a checklist is the
 * one drafted at 02:00 by somebody who has been awake for nineteen hours.
 */
export type HoldingPrecondition =
  | 'security_confirmed_whether_real'
  | 'treasury_confirmed_balances'
  | 'status_page_updated_first'
  | 'support_macro_aligned'
  | 'legal_notified_of_regulator_contact'
  | 'no_embargoed_asset_named'
  | 'peer_claim_not_restated'
  | 'incident_owner_named';

export const HOLDING_PRECONDITIONS: readonly HoldingPrecondition[] = [
  'security_confirmed_whether_real',
  'treasury_confirmed_balances',
  'status_page_updated_first',
  'support_macro_aligned',
  'legal_notified_of_regulator_contact',
  'no_embargoed_asset_named',
  'peer_claim_not_restated',
  'incident_owner_named',
] as const;

/** The sentence the operator is ticking. Written as a question they can answer. */
export const HOLDING_PRECONDITION_PROMPT: Record<HoldingPrecondition, string> = {
  security_confirmed_whether_real:
    'Has security confirmed whether this is real? A statement that assumes either answer is speculation, and the wrong assumption is unrecoverable.',
  treasury_confirmed_balances:
    'Has treasury confirmed the balances this statement relies on, and as at when? A balance figure with no as-of time is a claim about no particular moment.',
  status_page_updated_first:
    'Does the status page already say the same thing? CERC records the cost of one arm of a response contradicting another; the exchange version is a status page saying "degraded" while the account says "normal".',
  support_macro_aligned:
    'Does the support macro say the same thing this statement says? A customer reading both must not get two answers.',
  legal_notified_of_regulator_contact:
    'Has legal been told about the regulator contact? This one is about sequencing, not permission — legal learning from a screenshot is its own incident.',
  no_embargoed_asset_named:
    'Have you checked that no asset named here is under embargo? An unannounced listing decision is inside information (MiCA Art 87), and disclosing it is Art 90.',
  peer_claim_not_restated:
    'Does this statement repeat the peer\'s or the rumour\'s claim in order to deny it? Art 91(2)(c) covers the dissemination of rumours on an "ought to have known" standard, so restating it to rebut it republishes it.',
  incident_owner_named:
    'Is there a named human who owns this incident until it closes? "The team" is not an owner.',
};

/**
 * Every precleared statement in the library. Closed, so an incident class with no
 * preclear is a visible gap rather than an empty search result.
 */
export type HoldingStatementId =
  | 'hs-are-you-solvent'
  | 'hs-withdrawal-delay'
  | 'hs-platform-outage'
  | 'hs-exploit-unconfirmed'
  | 'hs-where-are-reserves'
  | 'hs-stablecoin-depeg'
  | 'hs-delisting-rationale'
  | 'hs-regulatory-contact-no-comment'
  | 'hs-impersonation-warning';

/**
 * A precleared statement.
 *
 * `standingKnown` and `standingNotKnown` are the load-bearing fields, and the
 * design decision behind them is the reason this whole file can exist with no
 * data: they are lines that are TRUE WHETHER OR NOT THE INCIDENT IS REAL. So a
 * seeded statement already satisfies the tri-slot check the moment it is drawn
 * from the library, and the operator's job at 02:00 is to add specifics to a
 * complete statement rather than to compose a complete one from nothing.
 *
 * `mustNotSay` is the set of things this class of statement reliably gets wrong.
 * The operator brief is COMPOSED from it (`renderStatementGuidance`), so a future
 * editor cannot delete a protection by rewording a paragraph — the same device
 * as `gps/disclosure.ts:PROHIBITED_PROMISE_SENTENCE`, and a test asserts every
 * line appears in the rendered brief.
 */
export interface HoldingStatement {
  readonly id: HoldingStatementId;
  /** Bumped on ANY text change, however small. The version travels into the record. */
  readonly version: number;
  readonly title: string;
  readonly incidentTypes: readonly IncidentType[];
  /** Phases this statement is written for. */
  readonly phases: readonly IncidentPhase[];
  readonly standingKnown: readonly string[];
  readonly standingNotKnown: readonly string[];
  /** What the operator must add for this to be about THIS incident. */
  readonly operatorMustSupply: readonly string[];
  /** The process line for the next-update slot. */
  readonly nextStepAction: string;
  readonly mustNotSay: readonly string[];
  /** The role this escalates to. A ROLE, never a person or a phone number. */
  readonly escalateTo: ClearanceRole;
  readonly requiresBeforeUse: readonly HoldingPrecondition[];
  readonly authoredOn: Instant;
  /** Forced staleness review. Past this instant the statement refuses. */
  readonly reviewBy: Instant;
  readonly supersededBy: HoldingStatementId | null;
}

/**
 * The library. Nine entries, drawn from CERC's anticipated-question list and from
 * what a crypto venue is actually asked. Every `reviewBy` is deliberately short:
 * an unreviewed holding statement confidently deployed nine months after the
 * world changed is the artefact that turns one incident into two.
 */
export const HOLDING_STATEMENTS: readonly HoldingStatement[] = [
  {
    id: 'hs-are-you-solvent',
    version: 1,
    title: 'Are you solvent? / Are you like the exchange that just failed?',
    incidentTypes: ['peer_contagion', 'hack_rumour'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'We have seen the questions being asked about LCX and we are answering them here rather than leaving them unanswered.',
      'LCX is a crypto-asset service provider licensed in Liechtenstein and supervised by the FMA. Our licence covers the services listed on our own website, and it does not make any individual crypto-asset safe.',
      'Customer withdrawals and deposits are operating on the status published on our status page, which is the authoritative source and is updated before this account is.',
    ],
    standingNotKnown: [
      'We will not characterise the position of any other firm. We do not have their books and anything we said about them would be speculation.',
      'We cannot answer questions about a specific counterparty relationship in a public post; where we are able to say something, we will say it here with a date attached.',
    ],
    operatorMustSupply: [
      'The specific question being asked, in the words it is being asked in.',
      'Any figure the desk intends to give, with its as-of timestamp and the basis reference behind it.',
    ],
    nextStepAction:
      'We are gathering the figures needed to answer this precisely, with the date they are true as at.',
    mustNotSay: [
      'Never say "we are solvent", "funds are safe" or "assets are fine" without a dated basis a reader can check. Those are the sentences pleaded in SEC v. Bankman-Fried.',
      'Never say "we will always allow withdrawals" or any promise about all future time. No evidence can support it.',
      'Never assert anything about the failing peer\'s books, reserves or intentions. We do not know, and saying it is both wrong and actionable.',
      'Never restate the rumour in order to deny it. MiCA Art 91(2)(c) covers dissemination of rumours on an "ought to have known" standard.',
      'Never give a reserve figure without an as-of timestamp and a reference.',
    ],
    escalateTo: 'sme',
    requiresBeforeUse: ['treasury_confirmed_balances', 'peer_claim_not_restated', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-withdrawal-delay',
    version: 1,
    title: 'Withdrawals are delayed',
    incidentTypes: ['outage', 'security_incident'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'We are aware that withdrawals are taking longer than usual and we are working on it now.',
      'Your balance is unaffected by a processing delay. A delayed withdrawal is a queue, not a loss.',
      'The status page is the authoritative source for the current state and is updated before this account is.',
    ],
    standingNotKnown: [
      'We do not yet have a restoration time we would be willing to commit to, and we would rather say that than give one we then miss.',
      'We do not yet know whether every asset and network is affected in the same way.',
    ],
    operatorMustSupply: [
      'Which assets and networks are affected, as at a stated time.',
      'Whether deposits are also affected.',
    ],
    nextStepAction: 'We are working on the queue and will post the next update whether or not it has cleared.',
    mustNotSay: [
      'Never promise a restoration time the desk has not been given by the team doing the work.',
      'Never say "all systems normal" while any lane is degraded. One arm of a response contradicting another costs more credibility than the incident.',
      'Never blame a named third party before the cause is established.',
      'Never imply the delay is the customer\'s error unless that has been established for that specific case, which a public post cannot establish.',
    ],
    escalateTo: 'sme',
    requiresBeforeUse: ['status_page_updated_first', 'support_macro_aligned', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-platform-outage',
    version: 1,
    title: 'The platform is degraded or unavailable',
    incidentTypes: ['outage'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'We are aware of the problem, it is being worked on now, and this account will not be the last place you hear about it.',
      'The status page is the authoritative source for what is affected and is updated before this account is.',
    ],
    standingNotKnown: [
      'We do not yet know the cause well enough to describe it accurately.',
      'We do not yet have a restoration time we would commit to.',
    ],
    operatorMustSupply: ['Which surfaces are affected — web, app, API — as at a stated time.'],
    nextStepAction: 'We will post again at the committed time whether or not the platform is back.',
    mustNotSay: [
      'Never state a cause that engineering has not confirmed.',
      'Never say "resolved" before the status page does.',
      'Never use humour. CERC: humour is never a good idea in emergency communication.',
    ],
    escalateTo: 'sme',
    requiresBeforeUse: ['status_page_updated_first', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-exploit-unconfirmed',
    version: 1,
    title: 'There are reports of an exploit and we do not yet know if they are true',
    incidentTypes: ['hack_rumour', 'security_incident'],
    phases: ['initial'],
    standingKnown: [
      'We have seen the reports and we are investigating them with the seriousness they deserve.',
      'We will tell you what we find, including if what we find is worse than what has been reported.',
    ],
    standingNotKnown: [
      'We do not yet know whether the reports are accurate, and we are not going to guess in either direction.',
      'We do not yet know whether any customer funds are affected.',
    ],
    operatorMustSupply: [
      'What has actually been reported, and by whom, without repeating an unverified figure.',
      'Which protective measures have been taken, if any can be described without helping an attacker.',
    ],
    nextStepAction:
      'Security is investigating and we will report what we know at the committed time, including if the answer is still "we do not know".',
    mustNotSay: [
      'Never say "there has been no breach" before security has established it. A denial that has to be withdrawn is worse than the incident.',
      'Never say "customer funds are safe" without a dated basis.',
      'Never quote the attacker\'s or reporter\'s figure as though the desk had verified it.',
      'Never describe a mitigation in enough detail to be useful to whoever is doing this.',
    ],
    escalateTo: 'sme',
    requiresBeforeUse: ['security_confirmed_whether_real', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-where-are-reserves',
    version: 1,
    title: 'Where are the reserves and who holds them?',
    incidentTypes: ['peer_contagion', 'hack_rumour'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'We understand why this is being asked and we would rather answer it with a date attached than quickly.',
      'Anything we publish about holdings will carry the time it is true as at, because a balance without a timestamp is a claim about no particular moment.',
    ],
    standingNotKnown: [
      'We are not going to give a figure in this post that we cannot evidence, and we will not round one to make it easier to read.',
    ],
    operatorMustSupply: [
      'The figure, its as-of timestamp, and the reference a reader can check it against.',
      'Which custody arrangement it covers and which it does not.',
    ],
    nextStepAction: 'We are assembling the figures with their as-of times and references.',
    mustNotSay: [
      'Never publish a reserve or backing figure without an as-of timestamp and a reference.',
      'Never say "fully backed" or "1:1" as a standing property. It is a measurement, and measurements have dates.',
      'Never describe an attestation as an audit.',
      'Never name a custodian or banking partner without their agreement; it creates a counterparty risk for both of you.',
    ],
    escalateTo: 'policy',
    requiresBeforeUse: ['treasury_confirmed_balances', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-stablecoin-depeg',
    version: 1,
    title: 'A listed stablecoin has moved away from its peg',
    incidentTypes: ['depeg'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'We are monitoring the market for this asset and our trading and risk controls are operating as designed.',
      'The issuer is the authoritative source on the state of the asset and its reserves. We are a venue, not the issuer.',
    ],
    standingNotKnown: [
      'We do not know whether or when the price will return to its reference value, and we will not forecast it.',
      'We cannot speak to the issuer\'s reserve position.',
    ],
    operatorMustSupply: [
      'Which trading and risk measures are in force on this market, as at a stated time.',
      'The issuer\'s own published statement, linked rather than summarised.',
    ],
    nextStepAction:
      'We are monitoring the market and the issuer\'s disclosures and will update at the committed time.',
    mustNotSay: [
      'Never predict whether the peg will be restored. A price prediction is a regulated claim in any register.',
      'Never characterise the issuer\'s reserves. It is their disclosure to make.',
      'Never suggest what a holder should do. Under MiCA Art 81 that becomes advice, and a public post cannot be made suitable.',
    ],
    escalateTo: 'sme',
    requiresBeforeUse: ['no_embargoed_asset_named', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-delisting-rationale',
    version: 1,
    title: 'Why was an asset delisted or suspended?',
    incidentTypes: ['delisting'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'The decision was taken under our published listing and review framework, and the notice period and process in that framework apply.',
      'Holders can find what happens to their balances and by when in the notice, which is the authoritative document.',
    ],
    standingNotKnown: [
      'We do not comment publicly on the individual factors behind a listing decision beyond what the notice sets out.',
    ],
    operatorMustSupply: ['The notice link, and the date balances must be actioned by.'],
    nextStepAction: 'The notice is published and we will answer process questions about it here.',
    mustNotSay: [
      'Never characterise the project, its team or its conduct. A delisting rationale that reads as an accusation is a defamation risk and a market-abuse risk in one sentence.',
      'Never imply anything about a future listing decision for any asset. An unannounced decision is inside information (MiCA Art 87) and disclosing it is Art 90.',
      'Never suggest holders sell or hold. That is advice.',
    ],
    escalateTo: 'policy',
    requiresBeforeUse: ['no_embargoed_asset_named', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-regulatory-contact-no-comment',
    version: 1,
    title: 'There are reports of a regulatory inquiry',
    incidentTypes: ['regulatory_action'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'We engage with our supervisors as a matter of course, and we do not discuss those engagements publicly.',
      'Our licence status is a matter of public record and can be checked on the FMA register rather than taken from us.',
    ],
    standingNotKnown: [
      'We do not comment on the existence, scope or content of any supervisory or investigative process.',
    ],
    operatorMustSupply: ['Nothing. This statement is complete as written, and adding to it is the risk.'],
    nextStepAction:
      'If there is anything we are able to say, we will say it here. If there is not, we will say that too.',
    mustNotSay: [
      'Never confirm or deny the existence of an inquiry. Confirming it is a disclosure; denying it is a hostage to the next filing.',
      'Never characterise the regulator, its motives or its competence.',
      'Never say "we have done nothing wrong". It is an unevidenced conclusion about a process whose scope the desk does not know.',
      'Never use the licence as reassurance about an unregulated product. ESMA names the CASP\'s regulatory status used as a promotional tool as a DON\'T, and it is LCX\'s highest-frequency version of this mistake.',
    ],
    escalateTo: 'legal',
    requiresBeforeUse: ['legal_notified_of_regulator_contact', 'incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
  {
    id: 'hs-impersonation-warning',
    version: 1,
    title: 'Accounts impersonating LCX or its staff',
    incidentTypes: ['impersonation'],
    phases: ['initial', 'maintenance'],
    standingKnown: [
      'Accounts impersonating LCX and its staff exist and are being reported to the platform.',
      'LCX staff will never send you a direct message first, never ask for a seed phrase or password, and never ask you to move funds to a new address.',
      'Our only verified channels are the ones listed on lcx.com, and that page is the authoritative list.',
    ],
    standingNotKnown: [
      'We cannot see or control what any impersonating account is sending, and we cannot get a platform report actioned on a timetable we control.',
    ],
    operatorMustSupply: ['Nothing specific to the impersonator. Naming it gives it reach.'],
    nextStepAction:
      'We have reported the accounts and will keep the verified-channel list on lcx.com current.',
    mustNotSay: [
      'Never name, quote or link the impersonating account. Amplifying it to warn about it is still amplifying it.',
      'Never promise the platform will take it down, or say when. That is not in the desk\'s control.',
      'Never promise to reimburse a victim in a public post. That is a commitment made without the facts.',
    ],
    escalateTo: 'reputation',
    requiresBeforeUse: ['incident_owner_named'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
    supersededBy: null,
  },
] as const;

/** Library version, bumped when any entry changes. Recorded per activation. */
export const HOLDING_LIBRARY_VERSION = 1;

export function getHoldingStatement(id: HoldingStatementId | null | undefined): HoldingStatement | null {
  if (id === null || id === undefined) return null;
  return HOLDING_STATEMENTS.find((s) => s.id === id) ?? null;
}

/** Which preclears cover an incident type. Empty is a visible gap, not a zero. */
export function holdingStatementsFor(incidentType: IncidentType): readonly HoldingStatement[] {
  return HOLDING_STATEMENTS.filter((s) => s.incidentTypes.includes(incidentType));
}

/**
 * Incident types with no preclear at all. Exported so a preparation-phase surface
 * can show the gap rather than the operator discovering it during the incident.
 */
export function unpreparedIncidentTypes(
  types: readonly IncidentType[],
): readonly IncidentType[] {
  return types.filter((t) => holdingStatementsFor(t).length === 0);
}

/**
 * Seed a statement body from a preclear. This is the artefact the whole file
 * exists to produce: a body that already satisfies the tri-slot check, so that
 * the operator adds specifics to something complete rather than composing
 * something complete under pressure.
 *
 * `nextUpdateBy` is the caller's, because only the desk knows what it can meet.
 */
export function seedStatementBody(
  statement: HoldingStatement,
  nextUpdateBy: Instant,
): StatementBody {
  return {
    known: [...statement.standingKnown],
    notKnown: [...statement.standingNotKnown],
    nextStep: { action: statement.nextStepAction, nextUpdateBy },
    empathy: null,
    withheld: null,
  };
}

/**
 * The operator brief. INTERNAL — this is never published, and it is composed
 * from `mustNotSay`, `requiresBeforeUse` and `operatorMustSupply` so that a
 * future editor cannot remove a protection by rewriting a paragraph. A test
 * asserts every line of each appears in the rendered brief.
 */
export function renderStatementGuidance(statement: HoldingStatement): string {
  const lines: string[] = [
    `PRECLEARED STATEMENT — ${statement.title}`,
    `${statement.id} v${statement.version}, authored ${statement.authoredOn.slice(0, 10)}, review by ${statement.reviewBy.slice(0, 10)}`,
    '',
    HOLDING_STATEMENTS_UNREVIEWED_REASON,
    '',
    HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON,
    '',
    'BEFORE USE — TICK EACH, NONE IS CHECKED FOR YOU',
    ...statement.requiresBeforeUse.map((p) => `- ${HOLDING_PRECONDITION_PROMPT[p]}`),
    '',
    'YOU MUST SUPPLY',
    ...statement.operatorMustSupply.map((s) => `- ${s}`),
    '',
    'THIS CLASS OF STATEMENT MUST NOT SAY',
    ...statement.mustNotSay.map((s) => `- ${s}`),
    '',
    `ESCALATES TO: ${statement.escalateTo}`,
    '',
    CRISIS_ROOM_HANDOFF_REASON,
  ];
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §7  PEER CONTAGION PRECLEARS — THE "ARE YOU LIKE THEM" ANSWERS
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Whether LCX actually has the attribute a peer failure will be about.
 *
 * `unknown` IS NOT `no`. The desk knows LCX has a native exchange token; it does
 * not know, from inside this compartment, whether LCX shares a custodian or a
 * banking partner with any given peer. Rendering `unknown` as "not applicable"
 * would be the exact defect this compartment exists to prevent, so the three
 * states are separate and `unknown` refuses to be treated as cleared.
 */
export type ContagionApplicability = 'confirmed' | 'not_applicable' | 'unknown';

/**
 * LCX's position on each attribute, as far as this compartment can honestly say.
 *
 * Only `native_exchange_token` is `confirmed`, and it is the one that matters:
 * that is the attribute CRO and FTT were attacked for in November 2022. Every
 * other attribute is `unknown` because answering it requires facts this
 * compartment does not hold — who the custodian is, which bank, which auditor.
 * Those are the owner's and finance's to state. An `unknown` here is a preparation
 * gap with a name, which is more useful than a confident `no`.
 */
export const LCX_CONTAGION_APPLICABILITY: Record<ContagionAttribute, ContagionApplicability> = {
  native_exchange_token: 'confirmed',
  affiliated_market_maker: 'unknown',
  opaque_reserves: 'unknown',
  same_banking_partner: 'unknown',
  same_custodian: 'unknown',
  same_jurisdiction: 'unknown',
  same_auditor: 'unknown',
  same_stablecoin_exposure: 'unknown',
};

export const CONTAGION_APPLICABILITY_OWNER =
  'Which of these attributes LCX actually shares with a peer is a question of fact about custody, banking, audit and inventory arrangements. This compartment does not hold those facts and does not infer them. Until the owner and finance record them, they read `unknown` — which means the answer to "are you like them" is not prepared, not that it is "no".';

/**
 * A prepared answer to "are you like the firm that just failed", indexed by the
 * attribute the question will be about.
 *
 * THE CONSTRAINT THAT MAKES THESE SAFE: every differentiation line is about LCX
 * and only about LCX. None of them says anything about a peer's books, reserves
 * or conduct — partly because the desk does not know, and partly because a
 * statement about a failing firm is the fastest available route from crisis comms
 * into a defamation claim and a market-abuse question at the same time. A test
 * asserts no preclear text names a peer.
 */
export interface ContagionPreclear {
  readonly attribute: ContagionAttribute;
  readonly version: number;
  readonly question: string;
  /** Lines about LCX. Never about the peer. */
  readonly differentiation: readonly string[];
  readonly mustNotSay: readonly string[];
  /** What the desk must supply before this is issuable, with dates. */
  readonly operatorMustSupply: readonly string[];
  readonly authoredOn: Instant;
  readonly reviewBy: Instant;
}

export const CONTAGION_PRECLEARS: readonly ContagionPreclear[] = [
  {
    attribute: 'native_exchange_token',
    version: 1,
    question: 'You have your own token. Is it the same situation?',
    differentiation: [
      'LCX has a native token, and we are not going to pretend that question is unreasonable.',
      'What we can tell you about it is factual and dated: what it is used for on the platform, what it is not used for, and how it is or is not counted in anything we publish about our position.',
      'Any figure we give about it will carry the time it is true as at and a reference you can check it against.',
    ],
    mustNotSay: [
      'Never describe another firm\'s use of its own token. We do not have their books.',
      'Never say "we are not like them". It invites the comparison and evidences nothing; state what LCX does instead.',
      'Never give a treasury or float figure without an as-of timestamp and a reference.',
      'Never promise the token\'s price behaviour, liquidity or future utility.',
    ],
    operatorMustSupply: [
      'The token\'s actual role on the platform today, in one sentence, checked against the published documentation.',
      'Whether and how it appears in any figure the desk is publishing, as at a stated time.',
    ],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
  },
  {
    attribute: 'opaque_reserves',
    version: 1,
    question: 'Nobody can see your reserves. Why should anyone believe you?',
    differentiation: [
      'It is a fair question and the answer is a document, not a sentence from us.',
      'Anything we publish about our position will state what it covers, what it does not cover, the date it is true as at, and who produced it.',
      'Where we have not published something, we will say that rather than imply that we have.',
    ],
    mustNotSay: [
      'Never describe an attestation as an audit, or a snapshot as a standing state.',
      'Never say "fully backed" without a date and a reference.',
      'Never characterise any other firm\'s disclosure practice.',
    ],
    operatorMustSupply: [
      'What is actually published today, linked, with its as-of date.',
      'What is not published, stated plainly.',
    ],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
  },
  {
    attribute: 'same_jurisdiction',
    version: 1,
    question: 'You are regulated in the same place they were. Does that mean anything?',
    differentiation: [
      'Our licence and its scope are a matter of public record and can be checked on the FMA register rather than taken from us.',
      'A licence covers named services. It does not make any individual crypto-asset safe, and we will not present it as though it did.',
    ],
    mustNotSay: [
      'Never use the licence as reassurance about an unregulated product or about the value of any asset. ESMA names the CASP\'s regulatory status used as a promotional tool as a DON\'T, and this is the sentence LCX is most likely to reach for.',
      'Never characterise the supervisor, another firm\'s licence, or another supervisor\'s conduct.',
      'Never say or imply that regulation means solvency.',
    ],
    operatorMustSupply: ['The register link, and the actual scope of the licence in the register\'s own words.'],
    authoredOn: '2026-08-02T00:00:00.000Z',
    reviewBy: '2026-11-02T00:00:00.000Z',
  },
] as const;

export function getContagionPreclear(attribute: ContagionAttribute): ContagionPreclear | null {
  return CONTAGION_PRECLEARS.find((p) => p.attribute === attribute) ?? null;
}

export interface ContagionReadinessRow {
  readonly attribute: ContagionAttribute;
  readonly applicability: ContagionApplicability;
  readonly preclear: 'ready' | 'expired' | 'absent';
  readonly reviewBy: Instant | null;
  /** One sentence. Honest about the difference between "no" and "we do not know". */
  readonly sentence: string;
}

/**
 * Preparation-phase readiness. The point of a preclear is that it exists before
 * the day it is required, so this is the panel that should be looked at on a
 * quiet Tuesday and never during an incident.
 *
 * `absent` on an attribute whose applicability is `unknown` is the worst cell on
 * the board and the sentence says so: the desk neither knows whether the question
 * applies to LCX nor has an answer prepared if it does.
 */
export function contagionReadiness(now: Instant): readonly ContagionReadinessRow[] {
  const nowMs = ms(now);
  const attributes = Object.keys(LCX_CONTAGION_APPLICABILITY) as ContagionAttribute[];
  return attributes.map((attribute) => {
    const applicability = LCX_CONTAGION_APPLICABILITY[attribute];
    const preclear = getContagionPreclear(attribute);
    if (preclear === null) {
      return {
        attribute,
        applicability,
        preclear: 'absent' as const,
        reviewBy: null,
        sentence:
          applicability === 'unknown'
            ? `No prepared answer for "${attribute.replace(/_/g, ' ')}", and it is not recorded whether LCX shares this attribute at all. Both halves are gaps: the fact is the owner's to state, the words are the desk's to write, and neither exists yet.`
            : `No prepared answer for "${attribute.replace(/_/g, ' ')}", which LCX ${applicability === 'confirmed' ? 'does share' : 'does not share'}. Write it before it is asked.`,
      };
    }
    const reviewMs = ms(preclear.reviewBy);
    const expired = reviewMs !== null && nowMs !== null && nowMs > reviewMs;
    return {
      attribute,
      applicability,
      preclear: expired ? ('expired' as const) : ('ready' as const),
      reviewBy: preclear.reviewBy,
      sentence: expired
        ? `The prepared answer for "${attribute.replace(/_/g, ' ')}" was due for review on ${preclear.reviewBy.slice(0, 10)} and has not been reviewed. It refuses to be issued until it is: text written for a world that has moved on is what turns one incident into two.`
        : `Prepared answer v${preclear.version} is current until ${preclear.reviewBy.slice(0, 10)}. LCX applicability: ${applicability}.`,
    };
  });
}

/**
 * The gate on issuing a contagion answer. Refuses when nothing is prepared, and
 * refuses separately when what is prepared is stale.
 */
export function gateContagionAnswer(
  attribute: ContagionAttribute,
  now: Instant,
): { readonly allowed: boolean; readonly preclear: ContagionPreclear | null; readonly refusal: CrisisRefusal | null } {
  const preclear = getContagionPreclear(attribute);
  if (preclear === null) {
    return {
      allowed: false,
      preclear: null,
      refusal: refuse(
        'CONTAGION_PRECLEAR_ABSENT',
        `There is no prepared answer to "are you like them" on the ${attribute.replace(/_/g, ' ')} attribute. The whole point of a preclear is that it exists before the day it is needed, and Crypto.com's November 2022 experience is that the window between a peer failing and the question arriving is measured in minutes.`,
        CERC_PRECLEAR,
        {
          kind: 'supply_data',
          missing: `a prepared differentiation answer for the ${attribute.replace(/_/g, ' ')} attribute`,
          whoCanSupply: 'the desk, in the preparation phase, reviewed by policy and an SME',
        },
      ),
    };
  }
  const reviewMs = ms(preclear.reviewBy);
  const nowMs = ms(now);
  if (reviewMs !== null && nowMs !== null && nowMs > reviewMs) {
    return {
      allowed: false,
      preclear,
      refusal: refuse(
        'CONTAGION_PRECLEAR_EXPIRED',
        `The prepared ${attribute.replace(/_/g, ' ')} answer was due for review on ${preclear.reviewBy.slice(0, 10)} and has not been reviewed. It will not issue. The escape hatch is to write your own words and own them, recorded as ad hoc — not to use unreviewed text because it was there.`,
        DESK_PRECLEAR_INTEGRITY,
        {
          kind: 'human_authority',
          role: 'policy',
        },
        preclear.reviewBy,
      ),
    };
  }
  return { allowed: true, preclear, refusal: null };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §8  A SUSPENDED DESK IN A CRISIS — WHAT IS STILL PERMITTED
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * What the crisis room can still do in each desk mode.
 *
 * THE STATE THIS MODELS IS SPECIFIC AND UNPLEASANT. A competent authority has
 * suspended LCX's marketing communications for up to 30 working days (MiCA Art
 * 94(1)), and an incident starts. The naive implementation disables the crisis
 * room, which is wrong twice over: the record is exactly what the supervisor will
 * ask for, and Art 88(1) independently requires the public to be informed of
 * inside information "as soon as possible" — a duty a marketing suspension does
 * not switch off.
 *
 * So the suspension bites on marketing, not on disclosure, and this compartment
 * MUST NOT decide which one a given statement is. That classification is a legal
 * call: a statement can be an incident disclosure, a marketing communication, or
 * — in the eyes of a supervisor already unhappy with the desk — both. Which is why
 * `mayHandOff` under suspension is conditional on counsel being named, and why
 * `ART_94_CLASSIFICATION_REQUIRES_COUNSEL` exists rather than a rule of thumb.
 */
export interface CrisisCapabilities {
  /** Compose statements. Always true: the record is the point. */
  readonly mayDraft: boolean;
  /** Gather the three clears. Always true, for the same reason. */
  readonly mayClear: boolean;
  /** Record what a human published, after they published it. Always true. */
  readonly mayRecordPublication: boolean;
  /** Hand cleared text to a human to post. THIS is what a suspension bites on. */
  readonly mayHandOff: boolean;
  /** Export the record for a competent authority. Always true. */
  readonly mayExportRecord: boolean;
  /** Lines an operator can read. Every capability that is false says why. */
  readonly notes: readonly string[];
  readonly refusals: readonly CrisisRefusal[];
}

/**
 * Resolve what the room can do. Pure; never throws.
 *
 * `isInsideInformationDisclosure` and `carriesPromotionalContent` are the desk's
 * own assertions about the item, not inferences. Both being true is refused
 * outright: Art 88(1) says the two "shall not" be combined, and the resolution is
 * two adjacent artefacts, never one blended one.
 */
export function crisisCapabilities(
  mode: DeskMode,
  item: {
    readonly isInsideInformationDisclosure: boolean;
    readonly carriesPromotionalContent: boolean;
    /** Counsel actually engaged on this incident. Named, never a boolean. */
    readonly counselNamed: string | null;
  },
): CrisisCapabilities {
  const notes: string[] = [];
  const refusals: CrisisRefusal[] = [];

  if (item.isInsideInformationDisclosure && item.carriesPromotionalContent) {
    refusals.push(
      refuse(
        'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING',
        'This statement is marked both as disclosing inside information and as carrying promotional content. MiCA Art 88(1) prohibits combining the two in one artefact. Split it: publish the disclosure on its own, and publish any context alongside it as a separate artefact at the same time.',
        MICA_88_1,
        {
          kind: 'different_surface',
          suggestion: 'Two adjacent artefacts published together — the disclosure, and the context beside it — never one blended post.',
        },
      ),
    );
    notes.push(
      'Note the tension this sits in: the SVB review found that a disclosure released without accompanying context was itself the trigger for the run. The resolution is adjacent artefacts, not a blended one, because getting it wrong is a fine either way.',
    );
  }

  if (mode.kind === 'suspended_by_authority') {
    notes.push(
      `Marketing communications are suspended by ${mode.authority} under order ${mode.orderRef}, effective ${mode.effectiveFrom} until ${mode.expiresAt}. MiCA Art 94 caps a single occasion at ${ART_94_MAX_SUSPENSION_WORKING_DAYS} consecutive WORKING days — check the expiry against working days, not by adding ${ART_94_MAX_SUSPENSION_WORKING_DAYS} to the start date.`,
      'Drafting, clearance, recording and export all remain available, and they are the point: the record is what the supervisor will ask for, and a desk that stops keeping it during a suspension has made its position worse.',
    );

    if (item.isInsideInformationDisclosure && nonEmpty(item.counselNamed) === null) {
      refusals.push(
        refuse(
          'ART_94_CLASSIFICATION_REQUIRES_COUNSEL',
          `The desk is under an Art 94 marketing suspension and this statement is marked as an Art 88(1) inside-information disclosure. Those two facts point in opposite directions: Art 88(1) requires the public to be informed as soon as possible, and the suspension prohibits marketing communications. Whether this particular statement is one, the other, or both is a legal question, and this instrument will not answer it.`,
          MICA_94,
          {
            kind: 'supply_data',
            missing: 'the name of counsel who has ruled whether this statement is a marketing communication, a disclosure, or both',
            whoCanSupply: 'counsel, on the record, before handoff',
          },
        ),
      );
      notes.push(
        'Until counsel is named, the statement can be drafted, cleared and logged, but not handed off. That is a worse outcome than either answer and it is the honest one.',
      );
    } else if (item.isInsideInformationDisclosure) {
      notes.push(
        `Handoff is permitted on counsel's ruling (${nonEmpty(item.counselNamed)}), on the basis that an Art 88(1) disclosure is not a marketing communication. The ruling and the name are on the record.`,
      );
    } else {
      notes.push(
        'Handoff is blocked. This statement is not marked as an Art 88(1) disclosure, so on its face it falls inside the suspended category. If the desk believes otherwise, the route is a recorded ruling from counsel, not a reclassification in this box.',
      );
      refusals.push(
        refuse(
          'DESK_SUSPENDED_BY_AUTHORITY',
          `${mode.authority} has suspended LCX's marketing communications under order ${mode.orderRef} until ${mode.expiresAt}. This statement cannot be handed off for publication. It can still be drafted, cleared, logged and exported, and doing so is in LCX's interest.`,
          MICA_94,
          { kind: 'wait_until', condition: `the suspension expires on ${mode.expiresAt}, or counsel rules that this statement is not a marketing communication` },
        ),
      );
    }

    const mayHandOff = item.isInsideInformationDisclosure && nonEmpty(item.counselNamed) !== null;
    return {
      mayDraft: true,
      mayClear: true,
      mayRecordPublication: true,
      mayHandOff: mayHandOff && refusals.every((r) => r.code !== 'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING'),
      mayExportRecord: true,
      notes,
      refusals,
    };
  }

  if (mode.kind === 'heightened') {
    notes.push(
      `The desk is in heightened supervision (${mode.reason}), imposed by ${mode.imposedBy}, effective ${mode.effectiveFrom}${mode.expiresAt === null ? ' with no recorded expiry' : ` until ${mode.expiresAt}`}. Crisis statements already require three blocking clears, so heightened mode changes nothing here — it is recorded so the record shows the mode the desk was in.`,
    );
  }

  return {
    mayDraft: true,
    mayClear: true,
    mayRecordPublication: true,
    mayHandOff: refusals.length === 0,
    mayExportRecord: true,
    notes,
    refusals,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §9  ACTIVATION — THE ORDERED GATE
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The gates, in the order they are evaluated. Order is not cosmetic: the library
 * checks come first because an expired statement should be reported as expired
 * rather than as three missing clears, and the desk-mode check comes last because
 * an operator needs to know the text is sound before being told the desk is
 * switched off.
 */
export const CRISIS_GATE_ORDER = [
  'statement_resolved',
  'statement_current',
  'statement_matches_incident',
  'preconditions_acknowledged',
  'ad_hoc_owned',
  'tri_slot_complete',
  'no_over_reassurance',
  'clearances_held',
  'desk_permits_handoff',
] as const;

export type CrisisGateName = (typeof CRISIS_GATE_ORDER)[number];

export interface CrisisGateResult {
  readonly gate: CrisisGateName;
  readonly passed: boolean;
  /** True where an earlier refusal meant this gate was never evaluated. */
  readonly skipped: boolean;
  readonly detail: string;
}

export interface CrisisActivation {
  /** True only when every gate passed. There is no partial issue. */
  readonly issuable: boolean;
  readonly gates: readonly CrisisGateResult[];
  readonly refusals: readonly CrisisRefusal[];
  /** The text that would be handed to a human. `null` where not issuable. */
  readonly text: string | null;
  /** The record a caller persists: who, which text, which version, when. */
  readonly record: {
    readonly incidentId: string;
    readonly seq: number;
    readonly statementId: HoldingStatementId | null;
    readonly statementVersion: number | null;
    readonly libraryVersion: number;
    readonly adHoc: boolean;
    readonly authoredBy: ActorId;
    readonly contentHash: ContentHash;
    readonly preconditionsAcknowledged: readonly HoldingPrecondition[];
    readonly clearances: readonly Clearance[];
    readonly citedClasses: readonly ReassuranceClass[];
    readonly decidedAt: Instant;
    readonly ruleSetVersion: number;
  };
  readonly clearance: ClearanceAssessment;
  readonly completeness: StatementCompleteness;
  readonly reassurance: ReassuranceAssessment;
  readonly capabilities: CrisisCapabilities;
  /** The badge every rendering surface must show. */
  readonly unreviewedNotice: string;
}

export interface CrisisActivationInput {
  readonly draft: CrisisStatementDraft;
  readonly clearances: readonly Clearance[];
  readonly authoredAt: Instant;
  readonly legalImplications: boolean;
  readonly deskMode: DeskMode;
  readonly counselNamed: string | null;
  readonly now: Instant;
}

/**
 * MAY THIS STATEMENT BE ISSUED? A hard gate that refuses by default and regularly
 * should. Pure, total, never throws.
 *
 * There is deliberately no override parameter, and no combination of inputs can
 * clear an expired statement, a self-clearance, an unconditional forward
 * commitment, or an uncited solvency claim. The only escape from the library is
 * `adHoc`, which does not lower any bar — it removes the inherited text and puts a
 * named human's name on the words instead.
 */
export function activateCrisisStatement(input: CrisisActivationInput): CrisisActivation {
  const { draft, now } = input;
  const gates: CrisisGateResult[] = [];
  const refusals: CrisisRefusal[] = [];

  const clearance = assessClearance({
    contentHash: draft.contentHash,
    authoredBy: draft.authoredBy,
    authoredAt: input.authoredAt,
    clearances: input.clearances,
    legalImplications: input.legalImplications,
  });
  const completeness = assessStatementCompleteness(draft, now);
  const reassurance = assessReassurance(renderStatementText(draft.body), draft.bases, now);
  const capabilities = crisisCapabilities(input.deskMode, {
    isInsideInformationDisclosure: draft.isInsideInformationDisclosure,
    carriesPromotionalContent: draft.carriesPromotionalContent,
    counselNamed: input.counselNamed,
  });

  const record = {
    incidentId: draft.incidentId,
    seq: draft.seq,
    statementId: draft.statementId,
    statementVersion: draft.statementVersion,
    libraryVersion: HOLDING_LIBRARY_VERSION,
    adHoc: draft.adHoc,
    authoredBy: draft.authoredBy,
    contentHash: draft.contentHash,
    preconditionsAcknowledged: draft.preconditionsAcknowledged,
    clearances: input.clearances,
    citedClasses: reassurance.citedClasses,
    decidedAt: now,
    ruleSetVersion: CRISIS_RULESET_VERSION,
  };

  const stop = (from: CrisisGateName): CrisisActivation => {
    for (const g of CRISIS_GATE_ORDER.slice(CRISIS_GATE_ORDER.indexOf(from) + 1)) {
      gates.push({ gate: g, passed: false, skipped: true, detail: 'not reached' });
    }
    return {
      issuable: false,
      gates,
      refusals,
      text: null,
      record,
      clearance,
      completeness,
      reassurance,
      capabilities,
      unreviewedNotice: HOLDING_STATEMENTS_UNREVIEWED_REASON,
    };
  };
  const pass = (gate: CrisisGateName, detail: string): void => {
    gates.push({ gate, passed: true, skipped: false, detail });
  };
  const fail = (gate: CrisisGateName, detail: string): void => {
    gates.push({ gate, passed: false, skipped: false, detail });
  };

  /* ── The library ── */
  const statement = getHoldingStatement(draft.statementId);

  if (draft.statementId !== null && statement === null) {
    fail('statement_resolved', `"${String(draft.statementId)}" is not in the library.`);
    refusals.push(
      refuse(
        'HOLDING_STATEMENT_UNKNOWN',
        `"${String(draft.statementId)}" is not a statement in the precleared library. An id that resolves to nothing is not a plausible id — it means the record would claim a preclear was used when none was.`,
        DESK_PRECLEAR_INTEGRITY,
        { kind: 'supply_data', missing: 'a valid statement id, or `adHoc` with a named author', whoCanSupply: 'the operator' },
        String(draft.statementId),
      ),
    );
    return stop('statement_resolved');
  }
  pass('statement_resolved', statement === null ? 'Ad hoc: no library statement referenced.' : `${statement.id} v${statement.version} resolved.`);

  if (statement !== null) {
    if (statement.supersededBy !== null) {
      fail('statement_current', `${statement.id} was superseded by ${statement.supersededBy}.`);
      refusals.push(
        refuse(
          'HOLDING_STATEMENT_SUPERSEDED',
          `${statement.id} has been superseded by ${statement.supersededBy}. Using superseded text is how two versions of the desk's position end up in public at the same time.`,
          DESK_PRECLEAR_INTEGRITY,
          { kind: 'supply_data', missing: `the replacement statement ${statement.supersededBy}`, whoCanSupply: 'the operator' },
          statement.supersededBy,
        ),
      );
      return stop('statement_current');
    }
    const reviewMs = ms(statement.reviewBy);
    const nowMs = ms(now);
    if (reviewMs !== null && nowMs !== null && nowMs > reviewMs) {
      fail('statement_current', `${statement.id} was due for review on ${statement.reviewBy}.`);
      refusals.push(
        refuse(
          'HOLDING_STATEMENT_EXPIRED',
          `${statement.id} v${statement.version} was due for review on ${statement.reviewBy.slice(0, 10)} and has not been reviewed. It will not issue. An unreviewed holding statement, confidently deployed after the world has changed, is the artefact that turns one incident into two — so this refusal cannot be overridden. Write your own words and own them: that is recorded as ad hoc, and the record then shows plainly that no precleared text was used.`,
          DESK_PRECLEAR_INTEGRITY,
          { kind: 'human_authority', role: statement.escalateTo },
          statement.reviewBy,
        ),
      );
      return stop('statement_current');
    }
    pass('statement_current', `Review not due until ${statement.reviewBy.slice(0, 10)}; not superseded.`);

    if (!statement.incidentTypes.includes(draft.incidentType)) {
      fail('statement_matches_incident', `${statement.id} is not written for a ${draft.incidentType}.`);
      refusals.push(
        refuse(
          'HOLDING_STATEMENT_TYPE_MISMATCH',
          `${statement.id} is written for ${statement.incidentTypes.join(', ')} and this incident is a ${draft.incidentType}. CERC requires that "predeveloped information is sensitive to the conditions of the current crisis before it is released"; text borrowed from an adjacent class is how a statement ends up answering a question nobody asked.`,
          CERC_PRECLEAR,
          { kind: 'supply_data', missing: `a preclear written for a ${draft.incidentType}, or ad hoc text with a named author`, whoCanSupply: 'the operator' },
          statement.id,
        ),
      );
      return stop('statement_matches_incident');
    }
    pass('statement_matches_incident', `${statement.id} covers ${draft.incidentType}.`);

    const acknowledged = Array.isArray(draft.preconditionsAcknowledged) ? draft.preconditionsAcknowledged : [];
    const missing = statement.requiresBeforeUse.filter((p) => !acknowledged.includes(p));
    if (missing.length > 0) {
      fail('preconditions_acknowledged', `${missing.length} precondition(s) not acknowledged.`);
      for (const p of missing) {
        refusals.push(
          refuse(
            'PRECONDITION_NOT_ACKNOWLEDGED',
            `A precondition of ${statement.id} has not been acknowledged: ${HOLDING_PRECONDITION_PROMPT[p]} Nothing here checks this for you — the instrument cannot see whether it is true, so it refuses until a named human says it is.`,
            DESK_PRECLEAR_INTEGRITY,
            { kind: 'human_authority', role: statement.escalateTo },
            p,
          ),
        );
      }
      return stop('preconditions_acknowledged');
    }
    pass('preconditions_acknowledged', `All ${statement.requiresBeforeUse.length} precondition(s) acknowledged.`);
  } else {
    pass('statement_current', 'Ad hoc: no library currency to check.');
    pass('statement_matches_incident', 'Ad hoc: no library scope to check.');
    pass('preconditions_acknowledged', 'Ad hoc: no library preconditions.');
  }

  /* ── The escape hatch has to be owned ── */
  if (draft.statementId === null) {
    if (!draft.adHoc || nonEmpty(draft.authoredBy) === null) {
      fail('ad_hoc_owned', 'No library statement and no named ad hoc author.');
      refusals.push(
        refuse(
          'AD_HOC_WITHOUT_NAMED_OWNER',
          'This statement uses no precleared text, which is allowed, but it must be marked as ad hoc and carry the name of the human whose words they are. An unowned statement with no library provenance leaves a record that cannot answer "who wrote this" six months later.',
          DESK_PRECLEAR_INTEGRITY,
          { kind: 'supply_data', missing: 'the ad hoc flag and the authoring human', whoCanSupply: 'the operator' },
        ),
      );
      return stop('ad_hoc_owned');
    }
    pass('ad_hoc_owned', `Ad hoc, owned by ${draft.authoredBy}.`);
  } else {
    pass('ad_hoc_owned', `Derived from ${String(draft.statementId)} v${String(draft.statementVersion)}.`);
  }

  /* ── The tri-slot ── */
  if (!completeness.complete) {
    fail('tri_slot_complete', `${completeness.refusals.length} slot defect(s).`);
    refusals.push(...completeness.refusals);
    return stop('tri_slot_complete');
  }
  pass('tri_slot_complete', 'Known, not-known and next-update are all present.');

  /* ── Over-reassurance ── */
  if (reassurance.refusals.length > 0) {
    fail('no_over_reassurance', `${reassurance.refusals.length} reassurance defect(s).`);
    refusals.push(...reassurance.refusals);
    return stop('no_over_reassurance');
  }
  pass(
    'no_over_reassurance',
    reassurance.findings.length === 0
      ? 'No reassurance construction matched. Note that this is a statement about the pattern list, not about the text.'
      : `${reassurance.findings.length} reassurance claim(s), each carrying a basis dated within ${REASSURANCE_BASIS_MAX_AGE_DAYS} days.`,
  );

  /* ── Clearance ── */
  if (!clearance.allBlockingHeld || clearance.refusals.length > 0) {
    fail('clearances_held', clearance.benchAdmission ?? 'Blocking clearances outstanding or void.');
    refusals.push(...clearance.refusals);
    return stop('clearances_held');
  }
  pass(
    'clearances_held',
    `${clearance.lanes.filter((l) => l.state === 'held').length} blocking lane(s) held by ${clearance.distinctReviewers} distinct reviewer(s)${clearance.longestPole === null ? '' : `; slowest lane ${clearance.longestPole.role} at ${clearance.longestPole.minutes} minute(s)`}.`,
  );

  /* ── Desk mode, last ── */
  if (!capabilities.mayHandOff) {
    fail('desk_permits_handoff', capabilities.notes[0] ?? 'The desk may not hand off.');
    refusals.push(...capabilities.refusals);
    return stop('desk_permits_handoff');
  }
  pass('desk_permits_handoff', 'The desk may hand this to a human to publish.');

  return {
    issuable: true,
    gates,
    refusals,
    text: renderStatementText(draft.body),
    record,
    clearance,
    completeness,
    reassurance,
    capabilities,
    unreviewedNotice: HOLDING_STATEMENTS_UNREVIEWED_REASON,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §10  THE LEDGER — ONE STORY STRAIGHT, AND BREACHES AS EVENTS
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A next-update commitment that was not met. A first-class event, because that is
 * the only thing that makes the commitment mean anything: an unmet promise the
 * instrument does not notice is worse than no promise, since the audience noticed.
 */
export interface NextUpdateBreach {
  readonly incidentId: string;
  readonly seq: number;
  readonly promisedBy: Instant;
  readonly actualAt: Instant | null;
  readonly overdueMinutes: number;
  readonly sentence: string;
}

/**
 * Find the breached next-update commitments in an incident's statement ledger.
 *
 * `actualAt` is the instant the NEXT statement in sequence was issued, or `null`
 * where none has been. `null` with a promise in the past is the live breach and
 * the loudest row on the surface.
 */
export function nextUpdateBreaches(
  ledger: readonly { readonly incidentId: string; readonly seq: number; readonly promisedNextUpdateBy: Instant; readonly issuedAt: Instant }[],
  now: Instant,
): readonly NextUpdateBreach[] {
  const rows = Array.isArray(ledger) ? [...ledger].sort((a, z) => a.seq - z.seq) : [];
  const nowMs = ms(now);
  const out: NextUpdateBreach[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const promised = ms(row.promisedNextUpdateBy);
    if (promised === null) continue;
    const next = rows[i + 1] ?? null;
    const actual = next === null ? null : ms(next.issuedAt);
    if (actual !== null) {
      if (actual <= promised) continue;
      out.push({
        incidentId: row.incidentId,
        seq: row.seq,
        promisedBy: row.promisedNextUpdateBy,
        actualAt: next?.issuedAt ?? null,
        overdueMinutes: Math.round((actual - promised) / 60000),
        sentence: `Statement ${row.seq} committed to an update by ${row.promisedNextUpdateBy}; the next statement came ${Math.round((actual - promised) / 60000)} minute(s) late. A missed commitment is a recorded event, not a rounding error.`,
      });
      continue;
    }
    if (nowMs !== null && nowMs > promised) {
      out.push({
        incidentId: row.incidentId,
        seq: row.seq,
        promisedBy: row.promisedNextUpdateBy,
        actualAt: null,
        overdueMinutes: Math.round((nowMs - promised) / 60000),
        sentence: `LIVE BREACH: statement ${row.seq} committed to an update by ${row.promisedNextUpdateBy} and none has been issued. It is ${Math.round((nowMs - promised) / 60000)} minute(s) past the commitment the desk made in public.`,
      });
    }
  }
  return out;
}

/**
 * Does this statement contradict the standing record without saying so?
 *
 * WHAT THIS DETECTS AND WHAT IT DOES NOT, stated plainly because the difference
 * matters: it detects a line that was in the KNOWN column of an earlier statement
 * and is in the NOT-KNOWN column of this one, compared on normalised text. That
 * is a genuine reversal and it is the shape the Michigan-blackout failure takes on
 * an exchange — "withdrawals are processing" followed by "we do not know whether
 * withdrawals are processing". It does NOT detect a paraphrased contradiction, a
 * contradiction in a figure, or a contradiction of tone, and it makes no claim to.
 * Human review is still the mechanism; this catches the case a tired human misses.
 */
export function contradictionRefusal(
  previous: readonly StatementBody[],
  next: CrisisStatementDraft,
): CrisisRefusal | null {
  if (nonEmpty(next.supersedes) !== null) return null;
  const priorKnown = new Set<string>();
  for (const body of Array.isArray(previous) ? previous : []) {
    for (const line of usableLines(body?.known)) priorKnown.add(factKey(line));
  }
  const reversed = usableLines(next.body?.notKnown).find((line) => priorKnown.has(factKey(line)));
  if (reversed === undefined) return null;
  return refuse(
    'STATEMENT_CONTRADICTS_INCIDENT_RECORD',
    `An earlier statement in this incident listed "${reversed}" as known, and this one lists it as not known. That is a reversal, and it may well be the right thing to publish — but it has to link to the statement it supersedes, so the record shows one story changing rather than two stories running at once.`,
    DESK_ONE_STORY,
    { kind: 'supply_data', missing: 'the id of the statement this supersedes', whoCanSupply: 'the operator' },
    reversed,
  );
}

/**
 * Retract a statement. DELETION IS NOT REMEDIATION.
 *
 * SEC v. Bankman-Fried records both the paragraph-78 tweet and its deletion; the
 * deletion destroyed nothing of the exposure and added an act to the complaint.
 * So a retraction here is a linked `Withdrawal` with a reason, and the original
 * text stays in the record. There is no hard-delete function in this file, and
 * adding one must remain a choice somebody makes on purpose rather than the
 * natural next commit.
 */
export function buildRetraction(input: {
  readonly supersedes: string;
  readonly reason: string | null;
  readonly withdrawnBy: ActorId | null;
  readonly withdrawnAt: Instant;
}): { readonly withdrawal: Withdrawal | null; readonly refusal: CrisisRefusal | null } {
  const reason = nonEmpty(input.reason);
  const by = nonEmpty(input.withdrawnBy);
  const supersedes = nonEmpty(input.supersedes);
  if (reason === null || reason.length < 12 || by === null || supersedes === null || ms(input.withdrawnAt) === null) {
    return {
      withdrawal: null,
      refusal: refuse(
        'RETRACTION_WITHOUT_REASON',
        'A retraction needs the statement it withdraws, a named person, a valid instant, and a reason of at least twelve characters. A retraction with no reason is a deletion with extra steps, and deletion is not remediation: SEC v. Bankman-Fried records the tweet AND its deletion.',
        DESK_ONE_STORY,
        {
          kind: 'supply_data',
          missing: 'the superseded statement id, the person retracting, the instant, and the reason',
          whoCanSupply: 'the operator',
        },
      ),
    };
  }
  return {
    withdrawal: { reason, withdrawnBy: by, withdrawnAt: input.withdrawnAt, supersedes },
    refusal: null,
  };
}
