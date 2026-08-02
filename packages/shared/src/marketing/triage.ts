import { ATTRIBUTION_MIN_CONCURRING, PRIORITY_MEANING, REACH_RANK } from './types.js';
import { trigramSimilarity } from './precedent.js';
import type {
  ActorId,
  AttributionAssertion,
  ClockSuppression,
  Confidence,
  Debunk,
  Figure,
  FirstIndicator,
  Graded,
  Handle,
  ImpactRow,
  ImpactSeverity,
  InboundSourceKind,
  Instant,
  LowerBound,
  ObservationFrame,
  PriorityTier,
  ReachAssessment,
  ReachLevel,
  Refusal,
  RefusalCode,
  RefusalRecovery,
  ResponseAction,
  RhetoricalDevice,
  RuleCitation,
  TriageState,
  Verifiability,
} from './types.js';

/**
 * MARKETING M1 — THE TRIAGE INSTRUMENT. Pure, total, no I/O, no `Date.now()`, no
 * randomness. Every function that needs the clock takes `now` as an argument, so a
 * decision taken at 02:14 is reproducible byte for byte years later.
 *
 * WHAT IT IS. RESIST 2 (UK Government Communication Service, Cabinet Office, 2021)
 * encoded almost line for line: the opinion gate first, the FIRST recognition
 * indicators, L/M/H confidence with attribution write-gated on collective
 * agreement, the five-level reach ladder, and three priority tiers where `low`
 * means *lines prepared, no response made*. Plus the two things RESIST has no
 * analogue for and a crypto venue needs daily: impersonation and scam signals read
 * off a notification email, and a clock.
 *
 * WHY RESIST AND NOT A HOME-GROWN SEVERITY ENUM. The toolkit exists to replace gut
 * feeling with a shared vocabulary, which is precisely the failure mode of a
 * one-person desk under time pressure. Its most important sentence is not about
 * detection at all: "The role of government is not to respond to every piece of
 * false or misleading information. You should not take on the role of arbiter of
 * truth or moderator of public debate." A queue whose default action is "draft a
 * reply" has already lost that argument. Here the default terminal state is
 * `monitoring_with_line_prepared`, and `reply_public` is one option out of nine.
 *
 * THE THREE HONESTY CONSTRAINTS THIS FILE IS BUILT AROUND, stated up front because
 * each of them removes a feature a normal social tool would ship:
 *
 *  1. There is no 0-100 risk score anywhere in it. Impersonation returns NAMED,
 *     INDIVIDUALLY CITED signals and a band whose definition is quotable
 *     (§10). A single number would be defensible to nobody: a regulator asking how
 *     it was produced gets an arithmetic answer instead of a model.
 *  2. Account age, follower count, verification status, profile image, bio text and
 *     cross-venue behaviour are NOT OBSERVABLE from a notification email, and this
 *     file refuses to score them rather than approximating them. `UNOBSERVABLE_ACCOUNT_SIGNALS`
 *     is data, and `refuseUnobservableSignal` hands back a refusal a surface can
 *     render where the tile would have been.
 *  3. THE DOMINANT REAL-WORLD SCAM IS INVISIBLE HERE. A fake support account
 *     replying under the VICTIM's own tweet generates no notification to LCX at
 *     all. So everything this module reports about impersonation is scoped to
 *     "visible in our own mentions", the count is a `LowerBound` with a frame that
 *     says so, and `refuseImpersonationPrevalence` exists so that asking this
 *     compartment how much impersonation is happening in the wild returns a
 *     refusal rather than a number. A tile called "impersonation attempts" built on
 *     this data would manufacture comfort, which is worse than an empty panel.
 *
 * WHAT IT CANNOT DO, BY CONSTRUCTION. It cannot post, report, block, mute, message
 * or fetch. `platform_report` is a RECOMMENDATION that a named human carries out by
 * hand on x.com; there is no credential, session or client in this compartment.
 * There is also no `force`, `override` or `acceptRisk` parameter: the escape hatch
 * from a derived priority is `PriorityOverride`, which requires a named human and a
 * written reason and keeps the derived tier alongside it in the record.
 */

/* ════════════════════════════════════════════════════════════════════════════
 *  §0  ONE INTEGRATION BLOCK — WHAT THIS FILE ADDS TO THE VOCABULARY
 * ════════════════════════════════════════════════════════════════════════════
 *  `types.ts` owns every concept below that is shared: `Verifiability`,
 *  `FirstIndicator`, `Confidence`, `Graded`, `ReachLevel`, `REACH_RANK`,
 *  `PriorityTier`, `PRIORITY_MEANING`, `TriageState`, `ImpactRow`,
 *  `RhetoricalDevice`, `AttributionAssertion`, `ResponseAction`, `Debunk`,
 *  `Refusal`, `RuleCitation`, `ObservationFrame`, `Figure`, `LowerBound`. None of
 *  them is re-declared here.
 *
 *  WHAT USED TO BE DECLARED HERE: the refusal codes the triage path needed and
 *  `RefusalCode` did not carry, with `TriageRefusalCode` widening the shared union.
 *  All 28 are now in the shared union itself, so nothing here widens anything and the
 *  situations the
 *  shared union already covers — `ATTRIBUTION_REQUIRES_CONCURRENCE`,
 *  `ART_91_2_C_RUMOUR_RESTATED`, `DATA_ABSENT_NOT_ZERO`, `METRIC_NOT_OBSERVABLE`,
 *  `OBSERVATION_FRAME_MISSING` — use the SHARED code and land in the same
 *  refusal-frequency bucket.
 *
 *  `TTFS_SUPPRESSION_UNREASONED` is deliberately the SAME STRING that
 *  `crisis.ts` uses. Two rooms suppress the same clock for the same reason and
 *  the record should count them together; a `TRIAGE_TTFS_SUPPRESSION_UNREASONED`
 *  would split one number into two and hide half of it.
 *
 *  DONE: the integration pass moved `TRIAGE_ONLY_REFUSAL_CODES` into `RefusalCode`.
 *  `TriageRefusalCode` is now an alias for it and `TriageRefusal` an alias for
 *  `Refusal`; the array survives as `readonly RefusalCode[]`, which is the ratchet
 *  that stops a private vocabulary growing back.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Codes the triage path needs and `RefusalCode` does not yet have. Held as data so
 * a test can assert the union and the array agree in both directions, exactly as
 * `REFUSAL_CODES` does for the shared set.
 */
export const TRIAGE_ONLY_REFUSAL_CODES: readonly RefusalCode[] = [
  /* ── the opinion gate ── */
  'RESIST_OPINION_IS_NOT_DISINFORMATION',
  'RESIST_DEBUNK_OF_OPINION_REFUSED',
  /* ── graded judgement hygiene ── */
  'GRADE_BASIS_MISSING',
  'REACH_ESTIMATE_BASIS_MISSING',
  'REACH_ESTIMATE_COMPUTED_NOT_JUDGED',
  /* ── priority ── */
  'PRIORITY_NOT_SUPPORTED_BY_EVIDENCE',
  'PRIORITY_OVERRIDE_UNREASONED',
  'PRIORITY_OVERRIDE_UNATTRIBUTED',
  /* ── the state machine ── */
  'TRIAGE_TRANSITION_FORBIDDEN',
  'TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION',
  /* ── the response set ── */
  'IGNORE_WITHOUT_RATIONALE',
  'MONITOR_REVIEW_NOT_IN_FUTURE',
  'MONITOR_BASELINE_MISSING',
  'PREPARED_LINE_MISSING',
  'DIRECT_CONTACT_WITHOUT_RATIONALE',
  'ESCALATION_WITHOUT_RECIPIENT',
  'MARKET_ABUSE_ESCALATION_WITHOUT_BASIS',
  'PLATFORM_REPORT_WITHOUT_SIGNAL',
  'DEBUNK_STRUCTURE_INCOMPLETE',
  /* ── impersonation and scam reading ── */
  'OWNED_HANDLE_ALLOWLIST_ABSENT',
  'IMPERSONATION_SIGNAL_NOT_OBSERVABLE',
  'IMPERSONATION_PREVALENCE_NOT_OBSERVABLE',
  'TEMPLATE_REUSE_CORPUS_ABSENT',
  /* ── counterparty pattern ── */
  'RHETORIC_HISTORY_INSUFFICIENT',
  /* ── the clock ── */
  'TTFS_START_NOT_RECORDED',
  'TTFS_BUDGET_ABSENT',
  'TTFS_SUPPRESSION_UNREASONED',
  'TTFS_SUPPRESSION_UNATTRIBUTED',
] as const;

/**
 * INTEGRATION PASS, DONE. These are no longer "triage-only": all 28 now live in
 * `types.ts`'s `RefusalCode` and in `REFUSAL_CODES`, and the annotation below is what
 * keeps the two in step — `readonly RefusalCode[]` makes a string that is not in the
 * shared union a compile error here, so this array cannot drift back into a private
 * vocabulary. It is kept as data because it is still the useful answer to "which codes
 * does the triage path own", which a coverage test asserts.
 *
 * Why it mattered: `loop.ts:refusalCodeFrequency` enumerates `REFUSAL_CODES` to list the
 * gates that never fired. A code outside that array is invisible to the only honest read
 * the desk has on whether its gates are load-bearing or ornamental — so a parallel union
 * did not merely duplicate a name, it hid 28 gates from the measurement.
 */
export type TriageOnlyRefusalCode = RefusalCode;

/** The one namespace. Retained as an alias so this file's signatures read unchanged. */
export type TriageRefusalCode = RefusalCode;

/**
 * A refusal from the triage desk — now exactly the shared `Refusal`, since the code
 * union is the shared one. Retained as an alias rather than removed so the ~30
 * signatures below keep naming the desk they came from.
 */
export type TriageRefusal = Refusal;

/**
 * The ruleset version stamped onto every refusal this file emits. Local because
 * `types.ts` does not export one yet; integration should replace it with the
 * compartment-wide constant so a refusal from triage and one from the claim gate
 * are comparable in the record.
 */
export const TRIAGE_RULESET_VERSION = 1;

function refuse(
  code: TriageRefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: RefusalRecovery,
  matched: string | null = null,
): TriageRefusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: TRIAGE_RULESET_VERSION };
}

/**
 * Historically the narrowed-to-shared variant, for the places where a shared type
 * demands a `Refusal` — `Figure<T>`'s `absent` variant, for one. It existed so those
 * call sites did not need a cast, and a cast there would have been the lie this
 * compartment is built to avoid: a widened code compiled into a field typed as a shared
 * one, silently wrong the day a triage-only code went through it.
 *
 * The integration pass folded the codes in, so this is now literally the same function
 * as `refuse`. Both are kept: they mark, at each call site, whether the author intended
 * a code the shared vocabulary already had. Deleting the distinction would lose that,
 * and it costs one line.
 */
function refuseShared(
  code: RefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: RefusalRecovery,
  matched: string | null = null,
): Refusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion: TRIAGE_RULESET_VERSION };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §1  WHAT THIS FILE IS NOT — the disclosures, as data rather than comments
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * THE HARD TRUTH, held as a constant so a surface can render it instead of
 * inferring it from a missing feature.
 *
 * X notifies an account about replies to its own posts and mentions of its handle.
 * The dominant real-world exchange scam is a fake support account replying under
 * the VICTIM's own tweet, which mentions the victim and not LCX — so it produces no
 * notification to LCX and is entirely invisible to this compartment. Everything
 * here is therefore a reading of *our own mentions*, and the phrase is in the type
 * names and in the frame, not only in a tooltip.
 */
export const IMPERSONATION_VISIBILITY_IS_OWN_MENTIONS_ONLY = true;

export const IMPERSONATION_VISIBILITY_REASON =
  "This desk sees only accounts that replied to an LCX post or mentioned the LCX handle, because a notification email is the only inbound channel. The dominant scam pattern — a fake support account replying under the victim's own tweet — mentions the victim, not LCX, so it generates no notification and is invisible here. Every impersonation figure this module produces is scoped to what is visible in our own mentions and is a lower bound on that; it is not a measure of impersonation in the wild.";

/** The only label a surface may put on an impersonation count derived from here. */
export const IMPERSONATION_TILE_LABEL = 'Impersonation signals visible in our own mentions';

/**
 * The scam lexicon is English-only and that is a property of it, not a defect to be
 * hidden. Stated so the band reads as "these terms fired" and never as "this body is
 * clean".
 *
 * What carries across languages is the STRUCTURAL side — an off-platform handle, a
 * t.me or wa.me link, a wallet-shaped string, a phone number, a URL. Those are the
 * signals the current production sanitiser misses entirely while redacting the
 * ticker symbols in "ETH deposits are live", and they are the ones worth having.
 */
export const SCAM_LEXICON_IS_ENGLISH_ONLY = true;

export const SCAM_LEXICON_COVERAGE_REASON =
  'The scam term list is English. A body in another language can carry every scam signal and match none of these terms, so an absence of lexicon hits is not evidence that a message is safe. The structural signals — off-platform handles, t.me/wa.me links, wallet-shaped strings, phone numbers, URLs — are language-independent and are reported separately.';

/**
 * This file grades content. It does not name adversaries. RESIST 2 is explicit that
 * "there needs to be collective agreement before any attribution is made", and in a
 * one- or two-person workspace that makes attribution effectively unsettable — which
 * is the correct answer, not a limitation to be worked around.
 */
export const TRIAGE_DOES_NOT_ATTRIBUTE_ALONE = true;

/* ── Citations. Every refusal below carries one. ───────────────────────────── */

const RESIST_OPINION_GATE: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Recognise — is the message an opinion?',
  text: 'Is the message an opinion? Opinions are usually subjective, which means that they cannot be verifiably false. If the message is simply a statement of opinion, you should not treat it as disinformation. However, if the opinion is based on verifiably false, deceptive, or manipulated information that has the potential to cause harm, it may be worth investigating further.',
};

const RESIST_NOT_ARBITER: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Impact analysis — keep your assessment outcome-focused',
  text: 'The role of government is not to respond to every piece of false or misleading information. You should not take on the role of arbiter of truth or moderator of public debate. A prioritised response is one in which there is a clear and compelling need to protect government objectives, information, brands and/or audiences.',
};

const RESIST_CONFIDENCE: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Situational insight — confidence',
  text: 'You may have high confidence that a piece of social media content is disinformation, but low confidence in who is ultimately behind it and why. Low confidence [L]: there is some relevant evidence, but it is taken in isolation or without corroboration.',
};

const RESIST_ATTRIBUTION: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Situational insight — attribution',
  text: 'Note that there needs to be collective agreement before any attribution is made.',
};

const RESIST_REACH_IS_A_JUDGEMENT: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Impact analysis — reach',
  text: "You should make an assessment of how extensively you believe the mis- and disinformation will be engaged with. Is it likely to disappear within a few hours or does it have the potential to become tomorrow's headlines?",
};

const RESIST_LOW_PRIORITY: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Impact analysis — low priority',
  text: 'The debate should be routinely followed but intervention is unnecessary/undesirable. Insight and press lines are prepared, but no response is made for the time being. The area is monitored and baseline analysis is used to spot any sudden changes in the climate of debate.',
};

const RESIST_NOT_EVERYTHING_ANSWERED: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Strategic communication — response options',
  text: 'Not all mis- and disinformation has to be responded to. In many circumstances, public opinion will self-correct. Any public response to false or misleading information that you do decide to make should represent the truth, well told.',
};

const RESIST_DEBUNK_STRUCTURE: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Strategic communication — debunk structure',
  text: 'Fact: lead with the truth / Myth: point to false information / Explain fallacy: why is it false? / Fact: state the truth again.',
};

const RESIST_TROLLS: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Strategic communication — engagement discipline',
  text: 'If somebody repeatedly uses these techniques in their online engagements, they are likely not interested in correcting false or misleading information.',
};

const RESIST_IDENTITY_INDICATOR: RuleCitation = {
  instrument: 'resist_2',
  provision: 'Recognise — FIRST, Identity',
  text: "Does anything point to a disguised or misleading source, or false claims about someone else's identity? For example, a fake social media account, claiming that a person or organisation is something they are not, or behaviour that doesn't match the way the account presents itself.",
};

const MICA_91_2_C: RuleCitation = {
  instrument: 'mica',
  provision: 'Art 91(2)(c)',
  text: 'Market manipulation comprises disseminating information through the media, including the internet, or by any other means, which gives, or is likely to give, false or misleading signals as to the supply of, demand for, or price of one or several crypto-assets, including the dissemination of rumours, where the person who engaged in the dissemination knew, or ought to have known, that the information was false or misleading.',
};

const DESK_SILENCE_IS_A_DECISION: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Triage — silence is a recorded decision',
  text: 'A decision not to answer must carry a written rationale and a named human. A silent ignore is indistinguishable from an oversight, and the silence log is the only evidence that the desk chose rather than missed.',
};

const DESK_NO_SCORE: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Triage — signals are named, not scored',
  text: 'Impersonation is reported as named signals with the evidence that fired each one. Signals that cannot be observed from a notification email — account age, follower count, verification status, profile image, bio, cross-venue behaviour — are refused rather than approximated, and the absence of a signal is never reported as its negation.',
};

const DESK_OWN_MENTIONS_ONLY: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Triage — impersonation visibility',
  text: IMPERSONATION_VISIBILITY_REASON,
};

const DESK_ABSENCE_IS_NOT_ZERO: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Triage — absence is not zero',
  text: 'Where the state a check needs does not exist, the check refuses and names what is missing. It never returns a clean result computed against an empty register, because a clean result manufactures confidence that nothing was checked.',
};

const DESK_CLOCK: RuleCitation = {
  instrument: 'desk_policy',
  provision: 'Triage — time to first statement',
  text: 'A triaged item that requires a response carries a time-to-first-statement budget. The clock may be suppressed only by a named person with a written reason, the elapsed figure is computed and retained either way, and a breach that had already happened stays on the record after suppression.',
};

/* ── Small total helpers. `null` propagates; it never collapses to 0. ──────── */

function nonEmpty(s: string | null | undefined): string | null {
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : null;
}

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

function uniqueStrings(xs: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const v = nonEmpty(x);
    if (v === null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §2  THE OPINION GATE — the first discriminator, and the one that empties the
 *      queue
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Where an item goes after the opinion gate. Three routes, and only two of them
 * lead anywhere near a correction.
 *
 *  - `correction_path`            a verifiable factual claim. Eligible for a debunk.
 *  - `investigate_false_premise`  an opinion resting on a verifiably false fact:
 *                                 RESIST says the FACT may be worth investigating,
 *                                 not that the opinion may be debunked. So the
 *                                 correction addresses the premise and never the
 *                                 view.
 *  - `engage_on_merits_or_ignore` a plain opinion. A reply is permitted — a desk may
 *                                 answer a criticism — but a DEBUNK is refused,
 *                                 because there is nothing verifiably false to
 *                                 debunk and the desk is not the arbiter of debate.
 */
export type OpinionRoute =
  | 'correction_path'
  | 'investigate_false_premise'
  | 'engage_on_merits_or_ignore';

/** The gate's verdict. `debunkEligible` is the load-bearing field. */
export interface OpinionGateVerdict {
  readonly verifiability: Verifiability;
  readonly route: OpinionRoute;
  /** Whether a debunk artefact may be built at all. */
  readonly debunkEligible: boolean;
  /** Whether the item is in scope as mis-/disinformation. Opinions are not. */
  readonly inScopeAsDisinformation: boolean;
  /** One sentence for the operator, quoting the gate's own logic. */
  readonly sentence: string;
  readonly rule: RuleCitation;
}

const OPINION_ROUTE_SENTENCE: Record<Verifiability, string> = {
  verifiable_factual:
    'The claim is verifiably factual, so it is in scope and a correction may be built.',
  opinion_resting_on_false_fact:
    'The view itself is an opinion; the fact it rests on is verifiably false. Investigate and correct the premise, never the opinion.',
  opinion:
    'This is an opinion and cannot be verifiably false, so it is not disinformation. Answer it on its merits or record why you are not answering it — do not debunk it.',
};

/**
 * THE GATE. Run this before anything else, including before any impersonation
 * reading: a hostile opinion from a real customer and a fabricated factual claim
 * from a fake support account are different objects and the desk should not spend
 * the same minute on both.
 */
export function gateOpinion(verifiability: Verifiability): OpinionGateVerdict {
  const route: OpinionRoute =
    verifiability === 'verifiable_factual'
      ? 'correction_path'
      : verifiability === 'opinion_resting_on_false_fact'
        ? 'investigate_false_premise'
        : 'engage_on_merits_or_ignore';

  return {
    verifiability,
    route,
    debunkEligible: verifiability !== 'opinion',
    inScopeAsDisinformation: verifiability !== 'opinion',
    sentence: OPINION_ROUTE_SENTENCE[verifiability],
    rule: RESIST_OPINION_GATE,
  };
}

/**
 * The refusal a caller gets for trying to debunk an opinion. Separate from the gate
 * so the gate stays a classification and the refusal stays a refusal.
 *
 * Recovery is `not_recoverable` on purpose: there is no edit that turns an opinion
 * into a falsehood you may correct. What the operator can do instead is answer on
 * the merits or record a rationale, and the sentence says so.
 */
export function refuseDebunkOfOpinion(matched: string | null = null): TriageRefusal {
  return refuse(
    'RESIST_DEBUNK_OF_OPINION_REFUSED',
    'This is an opinion, so it cannot be verifiably false and there is nothing to debunk. Answer it on its merits, or record a rationale for not answering it.',
    RESIST_OPINION_GATE,
    {
      kind: 'not_recoverable',
      why: 'No wording change converts a subjective view into a verifiably false statement of fact. Debunking an opinion is the desk claiming to arbitrate public debate.',
    },
    matched,
  );
}

/**
 * The refusal for treating an opinion as an in-scope disinformation item — e.g.
 * counting it in a disinformation total, or escalating it as such.
 */
export function refuseOpinionAsDisinformation(matched: string | null = null): TriageRefusal {
  return refuse(
    'RESIST_OPINION_IS_NOT_DISINFORMATION',
    'An opinion is not disinformation and may not be counted or escalated as one.',
    RESIST_OPINION_GATE,
    { kind: 'edit_text', what: 'Reclassify the item, or record it as criticism rather than as disinformation.' },
    matched,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §3  FIRST — SUGGESTED INDICATORS, NEVER ASSERTED ONES
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A suggested FIRST indicator with the evidence that suggested it.
 *
 * SUGGESTED, not set. RESIST's indicators are analyst judgements answering a
 * question ("Is there any manipulated content?"), and a regex cannot answer a
 * question about intent. What a regex can honestly do is say "this fired, look at
 * it" — so every suggestion carries `humanMustConfirm: true`, a `Confidence` that is
 * never `H` for a machine-derived signal, and the exact span that fired.
 *
 * `H` is reserved for a human who has looked. A machine suggestion capped at `M`
 * matches RESIST's own definition: "additional evidence could easily sway that
 * conclusion".
 */
export interface IndicatorSuggestion {
  readonly indicator: FirstIndicator;
  readonly confidence: Exclude<Confidence, 'H'>;
  readonly basis: string;
  readonly matched: string | null;
  readonly humanMustConfirm: true;
}

/**
 * Turn observable signals into FIRST suggestions.
 *
 * Only two indicators can be suggested from a notification email at all, and
 * naming which two is the honest part of this function:
 *
 *  - `identity`   — the impersonation signals of §10. This is the indicator that
 *                   fires constantly for a venue, and it is also the one whose
 *                   correct response is not a reply.
 *  - `technology` — template reuse across many handles, which is the strongest
 *                   available coordination signal that needs no credential
 *                   ("bots amplifying messages").
 *
 * `fabrication`, `rhetoric` and `symbolism` are NOT suggested. A forged screenshot,
 * a strawman and a misused on-chain statistic all require reading the content and
 * knowing the underlying truth, and a keyword list that claimed to detect them
 * would be the decorative kind of alarm that teaches an operator to stop reading.
 * They stay available for a human to set on `TriageAssessment.indicators`.
 */
export function suggestFirstIndicators(input: {
  readonly impersonation: ImpersonationReading | null;
  readonly templateReuse: TemplateReuseReading | null;
}): readonly IndicatorSuggestion[] {
  const out: IndicatorSuggestion[] = [];

  const imp = input.impersonation;
  if (imp !== null && imp.kind === 'read' && imp.signals.length > 0) {
    const strongest = imp.signals.find((s) => s.strength === 'strong') ?? imp.signals[0]!;
    out.push({
      indicator: 'identity',
      confidence: imp.band === 'handle_and_name_both_impersonate' ? 'M' : 'L',
      basis: `${imp.signals.length} impersonation signal(s) visible in our own mentions; strongest: ${strongest.sentence}`,
      matched: strongest.matched,
      humanMustConfirm: true,
    });
  }

  const tr = input.templateReuse;
  if (tr !== null && tr.kind === 'read' && tr.distinctHandles >= TEMPLATE_REUSE_MIN_HANDLES) {
    out.push({
      indicator: 'technology',
      confidence: 'M',
      basis: `near-identical body text seen from ${tr.distinctHandles} distinct handles in the window (trigram similarity >= ${TEMPLATE_REUSE_MIN_SIMILARITY})`,
      matched: null,
      humanMustConfirm: true,
    });
  }

  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §4  CONFIDENCE AND ATTRIBUTION
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A `Graded<T>` with no basis is a feeling with a letter on it, so this is a check
 * and not a formality. Returns `null` when the grade is usable.
 */
export function checkGrade<T>(field: string, graded: Graded<T>): TriageRefusal | null {
  if (nonEmpty(graded.basis) !== null) return null;
  return refuse(
    'GRADE_BASIS_MISSING',
    `The ${field} judgement carries a confidence letter but no basis. Write what the evidence was.`,
    RESIST_CONFIDENCE,
    { kind: 'supply_data', missing: `basis for ${field}`, whoCanSupply: 'the assessing operator' },
  );
}

/** Attribution, or the refusal that says why it cannot be made. */
export type AttributionOutcome =
  | { readonly kind: 'asserted'; readonly assertion: AttributionAssertion }
  | { readonly kind: 'refused'; readonly refusal: TriageRefusal; readonly concurringCount: number };

/**
 * WRITE-GATED ATTRIBUTION. Distinct named humans, at least
 * `ATTRIBUTION_MIN_CONCURRING` of them, or no attribution.
 *
 * Duplicates are collapsed first, so one operator listing themselves twice does not
 * become collective agreement. In a one-person workspace this is unsettable, and the
 * refusal saying so is the correct output: an instrument that let a single operator
 * label an account as a coordinated adversary would be manufacturing an accusation.
 */
export function assertAttribution(input: {
  readonly actorDescription: string;
  readonly concurringBy: readonly ActorId[];
  readonly assertedAt: Instant;
  readonly confidence: Confidence;
  readonly basis: string;
}): AttributionOutcome {
  const concurring = uniqueStrings(input.concurringBy);
  const description = nonEmpty(input.actorDescription);
  const basis = nonEmpty(input.basis);

  if (concurring.length < ATTRIBUTION_MIN_CONCURRING || description === null || basis === null) {
    return {
      kind: 'refused',
      concurringCount: concurring.length,
      refusal: refuse(
        'ATTRIBUTION_REQUIRES_CONCURRENCE',
        `Attribution needs ${ATTRIBUTION_MIN_CONCURRING} distinct named humans concurring, a description of the actor and a written basis; there ${concurring.length === 1 ? 'is' : 'are'} ${concurring.length}.`,
        RESIST_ATTRIBUTION,
        {
          kind: 'human_authority',
          role: 'policy',
        },
        description,
      ),
    };
  }

  return {
    kind: 'asserted',
    assertion: {
      actorDescription: description,
      concurringBy: concurring,
      assertedAt: input.assertedAt,
      confidence: input.confidence,
      basis,
    },
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §5  THE REACH LADDER — five ordered levels, ESTIMATED not computed
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Reach is a judgement. This exists to stop it being anything else.
 *
 * There is no function in this file that derives a `ReachLevel` from observed
 * counts, and that absence is deliberate: every observable count here is a lower
 * bound off a controversy-skewed corpus with no denominator, so a computed reach
 * level would be a denominator invented from nothing. `refuseComputedReach` is what
 * a caller gets for trying.
 */
export function refuseComputedReach(matched: string | null = null): TriageRefusal {
  return refuse(
    'REACH_ESTIMATE_COMPUTED_NOT_JUDGED',
    'Reach must be estimated by a named human with a basis. It cannot be computed here: the only counts available are lower bounds from our own mentions, with no population to divide by.',
    RESIST_REACH_IS_A_JUDGEMENT,
    {
      kind: 'supply_data',
      missing: 'a human reach estimate with a basis',
      whoCanSupply: 'the assessing operator',
    },
    matched,
  );
}

/** Whether a reach estimate is usable, and the refusal if it is not. */
export function checkReach(reach: ReachAssessment): TriageRefusal | null {
  if (nonEmpty(reach.current.basis) === null) {
    return refuse(
      'REACH_ESTIMATE_BASIS_MISSING',
      'The reach estimate has no basis. Write what you are reading it from — a level with no basis cannot be argued with or revised.',
      RESIST_REACH_IS_A_JUDGEMENT,
      { kind: 'supply_data', missing: 'basis for the reach estimate', whoCanSupply: 'the assessing operator' },
      reach.current.value,
    );
  }
  if (reach.previous !== null && nonEmpty(reach.previous.basis) === null) {
    return refuse(
      'REACH_ESTIMATE_BASIS_MISSING',
      'The previous reach estimate has no basis, so the trajectory cannot be read.',
      RESIST_REACH_IS_A_JUDGEMENT,
      { kind: 'supply_data', missing: 'basis for the previous reach estimate', whoCanSupply: 'the assessing operator' },
      reach.previous.value,
    );
  }
  return null;
}

/**
 * The trajectory, because ESCALATION BETWEEN LEVELS is the trigger and not the level
 * itself. An item sitting at `trending` for a week is a different object from one
 * that went from `little_interest` to `trending` in an hour.
 *
 * `first_estimate` is its own case rather than `steps: 0`: a first reading has no
 * direction, and calling that "flat" would invent a trend from one point.
 */
export type ReachTrajectory =
  | { readonly kind: 'first_estimate'; readonly level: ReachLevel; readonly rank: number }
  | {
      readonly kind: 'escalated' | 'de_escalated' | 'unchanged';
      readonly fromLevel: ReachLevel;
      readonly toLevel: ReachLevel;
      readonly fromRank: number;
      readonly toRank: number;
      /** Levels crossed, always positive; `kind` carries the direction. */
      readonly steps: number;
      /** Minutes since the previous estimate, or `null` if it was not timestamped. */
      readonly sincePreviousMinutes: number | null;
    };

/** `now` is passed in rather than read, so a trajectory is reproducible. */
export function reachTrajectory(reach: ReachAssessment, now: Instant): ReachTrajectory {
  const toLevel = reach.current.value;
  const toRank = REACH_RANK[toLevel];
  if (reach.previous === null) return { kind: 'first_estimate', level: toLevel, rank: toRank };

  const fromLevel = reach.previous.value;
  const fromRank = REACH_RANK[fromLevel];
  const steps = toRank - fromRank;

  return {
    kind: steps > 0 ? 'escalated' : steps < 0 ? 'de_escalated' : 'unchanged',
    fromLevel,
    toLevel,
    fromRank,
    toRank,
    steps: Math.abs(steps),
    sincePreviousMinutes: minutesBetween(reach.previousAt, now),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §6  THE THREE PRIORITY TIERS — DERIVED, ARGUABLE, OVERRIDABLE ONLY BY NAME
 * ════════════════════════════════════════════════════════════════════════════ */

const IMPACT_RANK: Record<ImpactSeverity, 0 | 1 | 2 | 3> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const CONFIDENCE_RANK: Record<Confidence, 1 | 2 | 3> = { L: 1, M: 2, H: 3 };

/**
 * RESIST's own words for the quality of the evidence behind a tier: high requires
 * that "much of the evidence is high confidence and builds a clear picture", low
 * that "the evidence is of mixed quality".
 */
export type EvidenceQuality = 'mostly_high' | 'mixed' | 'thin';

/** The impact row that actually drove the tier, so the tier is arguable. */
export interface DrivingImpact {
  readonly row: ImpactRow;
  readonly severity: ImpactSeverity;
  readonly confidence: Confidence;
  readonly basis: string;
}

/**
 * The derivation. `tier` is a conclusion; the rest of the record is the argument for
 * it, which is what lets an operator disagree with a specific step instead of
 * distrusting the whole instrument.
 */
export interface PriorityDerivation {
  readonly tier: PriorityTier;
  readonly meaning: string;
  readonly driving: DrivingImpact | null;
  readonly reachLevel: ReachLevel;
  readonly reachRank: number;
  readonly evidenceQuality: EvidenceQuality;
  /** Why this tier and not another, in one sentence. */
  readonly reason: string;
  /**
   * Exactly what is missing for the next tier up, or empty at `high`. This is the
   * field that makes the derivation honest: an operator who thinks the tier is too
   * low can see which of the three conditions failed rather than arguing with a
   * number.
   */
  readonly unmetForNextTier: readonly string[];
  readonly rule: RuleCitation;
}

/** Minimum reach rank for each tier. `trending` is RESIST's own word for medium. */
export const PRIORITY_MIN_REACH_RANK: Record<Exclude<PriorityTier, 'low'>, 3 | 4> = {
  medium: 3, // "is trending online"
  high: 4, // "high likelihood of making headlines"
};

function evidenceQualityOf(grades: readonly Confidence[]): EvidenceQuality {
  if (grades.length === 0) return 'thin';
  const high = grades.filter((g) => g === 'H').length;
  const low = grades.filter((g) => g === 'L').length;
  if (high * 2 >= grades.length && low === 0) return 'mostly_high';
  if (high === 0 && low === grades.length) return 'thin';
  return 'mixed';
}

/**
 * DERIVE THE TIER. Outcome-focused, per RESIST: the question is whether what you are
 * seeing is a significant obstacle to your objectives, not whether it is false.
 *
 * Three conjunctive conditions per tier, all three from the toolkit's own text:
 *
 *   high   = a `high`-severity impact row, graded H, AND reach at `minor_story` or
 *            above, AND evidence `mostly_high`.
 *   medium = an impact row at `medium` or above, graded M or better, AND reach at
 *            `trending` or above.
 *   low    = everything else — and `low` is NOT "do nothing". Read
 *            `PRIORITY_MEANING.low`: lines prepared, no response made, baseline
 *            monitored. Most items should terminate there.
 *
 * Note what does NOT raise the tier: how false the claim is, how rude it is, how
 * many signals fired, and whether attribution was possible. A confident, coordinated,
 * verifiably false claim with no impact on any protectee is a `low` — that is the
 * whole point of the outcome-focused framing, and it is the discipline that stops a
 * desk from becoming the arbiter of debate.
 */
export function derivePriority(input: {
  readonly reach: ReachAssessment;
  readonly impacts: Partial<Record<ImpactRow, Graded<ImpactSeverity>>>;
  /** Other graded judgements that form the evidence picture, e.g. `isFalse`. */
  readonly supportingGrades?: readonly Confidence[];
}): PriorityDerivation {
  const reachLevel = input.reach.current.value;
  const reachRank = REACH_RANK[reachLevel];

  const rows = Object.entries(input.impacts).filter(
    (e): e is [ImpactRow, Graded<ImpactSeverity>] => e[1] !== undefined,
  );

  let driving: DrivingImpact | null = null;
  for (const [row, graded] of rows) {
    if (IMPACT_RANK[graded.value] === 0) continue;
    const better =
      driving === null ||
      IMPACT_RANK[graded.value] > IMPACT_RANK[driving.severity] ||
      (IMPACT_RANK[graded.value] === IMPACT_RANK[driving.severity] &&
        CONFIDENCE_RANK[graded.confidence] > CONFIDENCE_RANK[driving.confidence]);
    if (better) {
      driving = { row, severity: graded.value, confidence: graded.confidence, basis: graded.basis };
    }
  }

  const grades: readonly Confidence[] = [
    ...rows.map(([, g]) => g.confidence),
    ...(input.supportingGrades ?? []),
  ];
  const evidenceQuality = evidenceQualityOf(grades);

  const severityRank = driving === null ? 0 : IMPACT_RANK[driving.severity];
  const drivingConfidence = driving === null ? null : driving.confidence;

  const highMet =
    severityRank === 3 &&
    drivingConfidence === 'H' &&
    reachRank >= PRIORITY_MIN_REACH_RANK.high &&
    evidenceQuality === 'mostly_high';

  const mediumMet =
    severityRank >= 2 &&
    drivingConfidence !== null &&
    CONFIDENCE_RANK[drivingConfidence] >= CONFIDENCE_RANK.M &&
    reachRank >= PRIORITY_MIN_REACH_RANK.medium;

  const tier: PriorityTier = highMet ? 'high' : mediumMet ? 'medium' : 'low';

  const unmet: string[] = [];
  if (tier === 'medium') {
    if (severityRank < 3) unmet.push('no impact row is assessed at high severity');
    if (drivingConfidence !== 'H') unmet.push('the driving impact is not graded H');
    if (reachRank < PRIORITY_MIN_REACH_RANK.high)
      unmet.push('reach is below minor_story, so headlines are not likely');
    if (evidenceQuality !== 'mostly_high')
      unmet.push(`the evidence picture is ${evidenceQuality}, not mostly high confidence`);
  } else if (tier === 'low') {
    if (severityRank < 2) unmet.push('no impact row is assessed at medium severity or above');
    if (drivingConfidence === null) unmet.push('no impact row is assessed at all');
    else if (CONFIDENCE_RANK[drivingConfidence] < CONFIDENCE_RANK.M)
      unmet.push('the driving impact is graded L, which is evidence taken without corroboration');
    if (reachRank < PRIORITY_MIN_REACH_RANK.medium)
      unmet.push('reach is below trending, so circulation is limited');
  }

  const reason =
    tier === 'high'
      ? `a ${driving?.row} impact assessed high at H confidence, reach ${reachLevel}, and a mostly high-confidence evidence picture`
      : tier === 'medium'
        ? `a ${driving?.row} impact assessed ${driving?.severity} at ${driving?.confidence} confidence, with reach ${reachLevel}`
        : `no protectee is assessed at medium severity with corroborated evidence and reach at trending or above (reach ${reachLevel}, evidence ${evidenceQuality})`;

  return {
    tier,
    meaning: PRIORITY_MEANING[tier],
    driving,
    reachLevel,
    reachRank,
    evidenceQuality,
    reason,
    unmetForNextTier: unmet,
    rule: tier === 'low' ? RESIST_LOW_PRIORITY : RESIST_NOT_ARBITER,
  };
}

/**
 * A recorded departure from the derivation. There is no `force` flag anywhere in
 * this file; this is the only way a tier differs from what the evidence supports,
 * and it costs a name and a sentence.
 */
export interface PriorityOverride {
  readonly derived: PriorityTier;
  readonly applied: PriorityTier;
  readonly direction: 'raised' | 'lowered';
  readonly rationale: string;
  readonly by: ActorId;
  readonly at: Instant;
}

export type PriorityOutcome =
  | { readonly kind: 'derived'; readonly tier: PriorityTier; readonly derivation: PriorityDerivation }
  | {
      readonly kind: 'overridden';
      readonly tier: PriorityTier;
      readonly derivation: PriorityDerivation;
      readonly override: PriorityOverride;
    }
  | { readonly kind: 'refused'; readonly refusal: TriageRefusal; readonly derivation: PriorityDerivation };

const PRIORITY_ORDER: Record<PriorityTier, 1 | 2 | 3> = { low: 1, medium: 2, high: 3 };

/**
 * Apply a tier. With no `requested` tier the derivation stands. With one, it must be
 * accompanied by a named human and a written reason — in BOTH directions.
 *
 * Lowering deserves the reason more than raising does: raising a tier costs the desk
 * attention, lowering one is how an item that mattered stops being looked at. The
 * asymmetry most tools ship — free to downgrade, ceremony to escalate — has it
 * exactly backwards.
 */
export function applyPriority(input: {
  readonly derivation: PriorityDerivation;
  readonly requested?: PriorityTier;
  readonly rationale?: string;
  readonly by?: ActorId;
  /** The clock, passed in. Stamped on the override record. */
  readonly at: Instant;
}): PriorityOutcome {
  const { derivation } = input;
  const requested = input.requested;
  if (requested === undefined || requested === derivation.tier) {
    return { kind: 'derived', tier: derivation.tier, derivation };
  }

  const by = nonEmpty(input.by);
  if (by === null) {
    return {
      kind: 'refused',
      derivation,
      refusal: refuse(
        'PRIORITY_OVERRIDE_UNATTRIBUTED',
        `The evidence supports ${derivation.tier} and ${requested} was asked for, with nobody named. An unattributed override is not a decision.`,
        RESIST_NOT_ARBITER,
        { kind: 'supply_data', missing: 'the id of the human overriding the tier', whoCanSupply: 'the operator making the change' },
        requested,
      ),
    };
  }

  const rationale = nonEmpty(input.rationale);
  if (rationale === null) {
    return {
      kind: 'refused',
      derivation,
      refusal: refuse(
        'PRIORITY_OVERRIDE_UNREASONED',
        `The evidence supports ${derivation.tier} and ${requested} was asked for, with no reason given. Write why the derivation is wrong.`,
        RESIST_NOT_ARBITER,
        { kind: 'supply_data', missing: 'a written reason for the tier change', whoCanSupply: by },
        derivation.unmetForNextTier.join('; ') || null,
      ),
    };
  }

  return {
    kind: 'overridden',
    tier: requested,
    derivation,
    override: {
      derived: derivation.tier,
      applied: requested,
      direction: PRIORITY_ORDER[requested] > PRIORITY_ORDER[derivation.tier] ? 'raised' : 'lowered',
      rationale,
      by,
      at: input.at,
    },
  };
}

/**
 * The refusal for a tier that arrived with no derivation and no override behind it —
 * i.e. someone typed `high` into a field. Kept separate from `applyPriority` so an
 * ingest path validating a stored record has something to call.
 */
export function refuseUnsupportedPriority(claimed: PriorityTier, derived: PriorityTier): TriageRefusal {
  return refuse(
    'PRIORITY_NOT_SUPPORTED_BY_EVIDENCE',
    `This item is recorded as ${claimed}; the assessment supports ${derived} and there is no recorded override.`,
    RESIST_NOT_ARBITER,
    { kind: 'supply_data', missing: 'a priority override with a named human and a reason', whoCanSupply: 'the assessing operator' },
    claimed,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §7  THE STATE MACHINE — AND THE EDGE THAT IS DELIBERATELY MISSING
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The allowed transitions.
 *
 * The important entry is `received`, which may go to `screened` or `out_of_scope`
 * and NOWHERE ELSE. Today's production path is effectively `received → draft`: a
 * reply arrives, the desk asks an AI to draft an answer, a human approves it. That
 * missing screening step is the whole reason this file exists, so the absence is
 * encoded rather than described.
 *
 * `closed`, `out_of_scope` and `ignored_with_rationale` all re-open to `screened`,
 * because new evidence is a normal event and a desk that cannot revisit a silence
 * has an incentive not to record one.
 */
export const TRIAGE_TRANSITIONS: Record<TriageState, readonly TriageState[]> = {
  received: ['screened', 'out_of_scope'],
  screened: ['assessed', 'out_of_scope', 'ignored_with_rationale'],
  assessed: ['decided', 'ignored_with_rationale'],
  decided: [
    'drafting',
    'monitoring_with_line_prepared',
    'escalated',
    'ignored_with_rationale',
    'closed',
  ],
  drafting: ['closed', 'escalated', 'monitoring_with_line_prepared'],
  monitoring_with_line_prepared: ['assessed', 'drafting', 'escalated', 'closed'],
  escalated: ['drafting', 'monitoring_with_line_prepared', 'closed'],
  out_of_scope: ['screened', 'closed'],
  ignored_with_rationale: ['screened', 'closed'],
  closed: ['screened'],
};

/**
 * The forbidden edges worth naming, with the reason each one is forbidden. Held as
 * data so a test pins the SEMANTICS rather than the shape of the table above — a
 * later edit that adds `received → drafting` back has to delete a sentence
 * explaining why it must not exist.
 */
export const NOTABLY_FORBIDDEN_TRANSITIONS: readonly {
  readonly from: TriageState;
  readonly to: TriageState;
  readonly why: string;
}[] = [
  {
    from: 'received',
    to: 'drafting',
    why: 'Drafting before screening is the current production behaviour and the defect this taxonomy exists to remove. An item must pass the opinion gate and an impersonation reading before anyone writes a reply to it, because for a scam reply the correct action is a platform report and never a witty answer.',
  },
  {
    from: 'received',
    to: 'decided',
    why: 'A decision with no assessment behind it has nothing to cite when it is questioned.',
  },
  {
    from: 'screened',
    to: 'drafting',
    why: 'Screening establishes scope, not impact. Reach, impact and priority are still unknown, so there is no basis for choosing a public reply over the eight other responses.',
  },
  {
    from: 'screened',
    to: 'decided',
    why: 'Same reason: no assessment, no arguable decision.',
  },
  {
    from: 'assessed',
    to: 'drafting',
    why: 'A draft is one of nine response actions. It has to be chosen at `decided`, on the record, so that the eight not chosen are visibly available rather than skipped.',
  },
];

export function canTransition(from: TriageState, to: TriageState): boolean {
  return TRIAGE_TRANSITIONS[from].includes(to);
}

/** The transition, or the refusal that names what is missing. */
export function transitionTriage(from: TriageState, to: TriageState): TriageRefusal | null {
  if (canTransition(from, to)) return null;

  const named = NOTABLY_FORBIDDEN_TRANSITIONS.find((f) => f.from === from && f.to === to);
  const code: TriageRefusalCode =
    to === 'decided' || to === 'drafting'
      ? 'TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION'
      : 'TRIAGE_TRANSITION_FORBIDDEN';

  return refuse(
    code,
    named !== undefined
      ? `${from} may not go straight to ${to}. ${named.why}`
      : `${from} may not go to ${to}. Allowed from ${from}: ${TRIAGE_TRANSITIONS[from].join(', ') || 'nothing'}.`,
    named !== undefined ? RESIST_NOT_EVERYTHING_ANSWERED : DESK_SILENCE_IS_A_DECISION,
    {
      kind: 'wait_until',
      condition: `the item reaches one of: ${TRIAGE_TRANSITIONS[from].join(', ') || 'no onward state'}`,
    },
    `${from} -> ${to}`,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §8  THE CLOSED RESPONSE SET — NINE OPTIONS, AND `ignore` COSTS A SENTENCE
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Every response kind, as data, so a surface can enumerate the nine rather than
 * render one prominent button and a dropdown. RESIST: "Not all mis- and
 * disinformation has to be responded to. In many circumstances, public opinion will
 * self-correct."
 */
export const RESPONSE_KINDS: readonly ResponseAction['kind'][] = [
  'ignore',
  'monitor',
  'prepare_line_hold',
  'reply_public',
  'owned_channel_statement',
  'direct_contact_author',
  'platform_report',
  'escalate_internal',
  'escalate_market_abuse',
];

/**
 * What each tier's response options are, per RESIST's own tools column. Advisory,
 * not enforced — a `high` item can still end in `monitor` if that is the judgement —
 * but `low` is where the taxonomy has teeth, and the surface should lead with
 * `prepare_line_hold` and `monitor` there rather than with a reply box.
 */
export const TIER_LEADING_RESPONSES: Record<PriorityTier, readonly ResponseAction['kind'][]> = {
  high: ['escalate_internal', 'owned_channel_statement', 'reply_public', 'prepare_line_hold'],
  medium: ['prepare_line_hold', 'reply_public', 'owned_channel_statement', 'monitor'],
  low: ['prepare_line_hold', 'monitor', 'ignore'],
};

/**
 * Validate a chosen response. Returns every refusal, not the first.
 *
 * `now` is needed for exactly one check — `monitor.reviewAt` must be in the future,
 * because a review date in the past is a monitor that has already lapsed and reads
 * on a board as if it were live.
 */
export function checkResponseAction(
  action: ResponseAction,
  context: {
    readonly now: Instant;
    /**
     * Impersonation signals visible in our own mentions. Required for a
     * `platform_report` of kind `impersonation`: a report with no signal behind it is
     * an accusation the desk cannot evidence if it is challenged.
     */
    readonly impersonationSignals?: readonly ImpersonationSignal[];
  },
): readonly TriageRefusal[] {
  const out: TriageRefusal[] = [];

  switch (action.kind) {
    case 'ignore': {
      if (nonEmpty(action.rationale) === null) {
        out.push(
          refuse(
            'IGNORE_WITHOUT_RATIONALE',
            'Ignoring this needs a written reason. A silent ignore cannot be told apart from an oversight, and the silence log depends on the sentence.',
            DESK_SILENCE_IS_A_DECISION,
            {
              kind: 'supply_data',
              missing: 'one sentence saying why no response is being made',
              whoCanSupply: 'the deciding operator',
            },
          ),
        );
      }
      break;
    }
    case 'monitor': {
      if (nonEmpty(action.baselineRef) === null) {
        out.push(
          refuse(
            'MONITOR_BASELINE_MISSING',
            'Monitoring needs a baseline to compare against, or there is nothing to notice a change against.',
            RESIST_LOW_PRIORITY,
            { kind: 'supply_data', missing: 'a baseline reference', whoCanSupply: 'the deciding operator' },
          ),
        );
      }
      const reviewIn = minutesBetween(context.now, action.reviewAt);
      if (reviewIn === null || reviewIn <= 0) {
        out.push(
          refuse(
            'MONITOR_REVIEW_NOT_IN_FUTURE',
            'The review date is missing or already past, so this monitor is lapsed rather than live.',
            RESIST_LOW_PRIORITY,
            { kind: 'edit_text', what: 'Set a review date in the future.' },
            action.reviewAt,
          ),
        );
      }
      break;
    }
    case 'prepare_line_hold': {
      if (nonEmpty(action.approvedLanguageId) === null) {
        out.push(
          refuse(
            'PREPARED_LINE_MISSING',
            'A line hold with no prepared line is the state RESIST calls low priority without doing the work it calls for.',
            RESIST_LOW_PRIORITY,
            {
              kind: 'supply_data',
              missing: 'the id of the prepared, cleared line being held',
              whoCanSupply: 'the deciding operator',
            },
          ),
        );
      }
      break;
    }
    case 'direct_contact_author': {
      if (nonEmpty(action.rationale) === null) {
        out.push(
          refuse(
            'DIRECT_CONTACT_WITHOUT_RATIONALE',
            'Contacting the author privately needs a recorded reason: it is an off-platform approach by a regulated firm to a named individual.',
            DESK_SILENCE_IS_A_DECISION,
            { kind: 'supply_data', missing: 'why private contact is the right channel', whoCanSupply: 'the deciding operator' },
          ),
        );
      }
      break;
    }
    case 'platform_report': {
      const signals = context.impersonationSignals ?? [];
      if (action.reportType === 'impersonation' && signals.length === 0) {
        out.push(
          refuse(
            'PLATFORM_REPORT_WITHOUT_SIGNAL',
            'An impersonation report needs at least one named signal behind it. Report the account by all means, but the record has to say what fired.',
            RESIST_IDENTITY_INDICATOR,
            {
              kind: 'supply_data',
              missing: 'at least one impersonation signal, or an operator note describing what was seen',
              whoCanSupply: 'the deciding operator',
            },
          ),
        );
      }
      break;
    }
    case 'escalate_internal': {
      if (action.to.length === 0) {
        out.push(
          refuse(
            'ESCALATION_WITHOUT_RECIPIENT',
            'An escalation with no recipient is a note to nobody.',
            DESK_SILENCE_IS_A_DECISION,
            { kind: 'supply_data', missing: 'at least one clearance role to escalate to', whoCanSupply: 'the deciding operator' },
          ),
        );
      }
      break;
    }
    case 'escalate_market_abuse': {
      if (nonEmpty(action.basis) === null || nonEmpty(action.authority) === null) {
        out.push(
          refuse(
            'MARKET_ABUSE_ESCALATION_WITHOUT_BASIS',
            'A market-abuse escalation must name the authority and the basis. This one leaves the desk unable to say what it reported or why.',
            MICA_91_2_C,
            {
              kind: 'supply_data',
              missing: 'the competent authority and the basis for the escalation',
              whoCanSupply: 'compliance',
            },
          ),
        );
      }
      break;
    }
    case 'reply_public':
    case 'owned_channel_statement':
      /* Content gating for these two lives in the claim gate, not here. Triage
       * decides WHETHER to speak; the drafting room decides whether the words may
       * be said. Duplicating the wording rules here would let the two disagree. */
      break;
  }

  return out;
}

/**
 * A row in the silence log.
 *
 * The plan's silence log is only possible because `ignore` carries a rationale, and
 * this is the shape it becomes. Note what it retains: the priority and the reach
 * level AT THE MOMENT OF THE DECISION. Six months later, "we ignored it" is
 * indefensible; "we ignored it at low priority with reach little_interest, because
 * the account had two followers and the claim was self-correcting" is a decision.
 */
export interface SilenceRecord {
  readonly rationale: string;
  readonly decidedBy: ActorId;
  readonly decidedAt: Instant;
  readonly priorityAtDecision: PriorityTier;
  readonly reachAtDecision: ReachLevel;
  readonly verifiabilityAtDecision: Verifiability;
  /** Impersonation signals that were visible when silence was chosen, if any. */
  readonly signalsAtDecision: readonly string[];
}

export type SilenceOutcome =
  | { readonly kind: 'recorded'; readonly record: SilenceRecord }
  | { readonly kind: 'refused'; readonly refusal: TriageRefusal };

/**
 * Record a silence. Refuses without a rationale AND without a named human — the two
 * fields that make the row worth keeping.
 */
export function recordSilence(input: {
  readonly action: Extract<ResponseAction, { kind: 'ignore' }>;
  readonly decidedBy: ActorId;
  readonly decidedAt: Instant;
  readonly priority: PriorityTier;
  readonly reach: ReachLevel;
  readonly verifiability: Verifiability;
  readonly signals?: readonly ImpersonationSignal[];
}): SilenceOutcome {
  const rationale = nonEmpty(input.action.rationale);
  const by = nonEmpty(input.decidedBy);

  if (rationale === null || by === null) {
    return {
      kind: 'refused',
      refusal: refuse(
        'IGNORE_WITHOUT_RATIONALE',
        rationale === null
          ? 'This silence has no rationale, so it cannot be logged as a decision.'
          : 'This silence names nobody, so it cannot be logged as a decision.',
        DESK_SILENCE_IS_A_DECISION,
        {
          kind: 'supply_data',
          missing: rationale === null ? 'a written rationale' : 'the id of the deciding human',
          whoCanSupply: 'the deciding operator',
        },
      ),
    };
  }

  return {
    kind: 'recorded',
    record: {
      rationale,
      decidedBy: by,
      decidedAt: input.decidedAt,
      priorityAtDecision: input.priority,
      reachAtDecision: input.reach,
      verifiabilityAtDecision: input.verifiability,
      signalsAtDecision: (input.signals ?? []).map((s) => s.id),
    },
  };
}

/**
 * Validate a debunk. Four fields, all required, in RESIST's order.
 *
 * The second check is the one that matters and it is not about structure:
 * `mythRestated` REPUBLISHES the claim. Under MiCA Art 91(2)(c) disseminating
 * information likely to give false or misleading price signals is manipulation on an
 * "ought to have known" standard, and quote-tweeting FUD to rebut it is the most
 * natural crisis reflex there is. So a price-relevant myth that has not been verified
 * false may not be restated yet — the verification comes before the amplification,
 * not after it.
 */
export function checkDebunk(
  debunk: Debunk,
  context: {
    readonly mythIsPriceRelevant: boolean;
    readonly mythVerifiedFalse: boolean;
    readonly verifiability: Verifiability;
  },
): readonly TriageRefusal[] {
  const out: TriageRefusal[] = [];

  if (context.verifiability === 'opinion') out.push(refuseDebunkOfOpinion(debunk.mythRestated));

  const missing: string[] = [];
  if (nonEmpty(debunk.factLead) === null) missing.push('factLead');
  if (nonEmpty(debunk.mythRestated) === null) missing.push('mythRestated');
  if (nonEmpty(debunk.fallacy) === null) missing.push('fallacy');
  if (nonEmpty(debunk.factRepeat) === null) missing.push('factRepeat');

  if (missing.length > 0) {
    out.push(
      refuse(
        'DEBUNK_STRUCTURE_INCOMPLETE',
        `A debunk is fact, myth, fallacy, fact — in that order. Missing: ${missing.join(', ')}.`,
        RESIST_DEBUNK_STRUCTURE,
        { kind: 'edit_text', what: `Write the missing part(s): ${missing.join(', ')}.` },
      ),
    );
  }

  if (context.mythIsPriceRelevant && !context.mythVerifiedFalse) {
    out.push(
      refuse(
        'ART_91_2_C_RUMOUR_RESTATED',
        'Restating a price-relevant claim that has not been verified false republishes it. Verify it first; the standard is what you ought to have known, not what you meant.',
        MICA_91_2_C,
        {
          kind: 'wait_until',
          condition: 'the claim has been verified false by a named human with a cited basis',
        },
        debunk.mythRestated,
      ),
    );
  }

  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §9  IMPERSONATION AND SCAM SIGNALS — FROM WHAT A NOTIFICATION EMAIL ACTUALLY
 *      CONTAINS, AND NOTHING ELSE
 * ════════════════════════════════════════════════════════════════════════════
 *  Five fields are available and they are the five this section reads: the handle
 *  string, the display name, the body text, the timing, and the body text of other
 *  items in the same window (template reuse). Everything an anti-abuse team would
 *  actually want — account age, followers, verification, profile image, bio — is
 *  absent, and §9.1 refuses it by name rather than approximating it.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ──── §9.1 What cannot be known, refused by name ──── */

/** The signals a notification email does not carry, and why each one is unobtainable. */
export const UNOBSERVABLE_ACCOUNT_SIGNALS = [
  { key: 'account_age', why: 'A notification email carries no account creation date, and there is no API to ask for one.' },
  { key: 'follower_count', why: 'Follower and following counts appear nowhere in notification mail.' },
  { key: 'verification_status', why: 'Whether an account is verified or subscribed is not in the email body or headers.' },
  { key: 'profile_image', why: 'The avatar is a remote image reference at best, and identical avatars are trivially reused.' },
  { key: 'bio_text', why: 'The profile bio is not included in a notification email.' },
  { key: 'posting_history', why: 'Only the items that reached our own mentions are visible; the account timeline is not.' },
  { key: 'cross_venue_behaviour', why: 'Whether the same account replies under twenty other exchanges cannot be seen from our own mentions.' },
  { key: 'prior_reports', why: 'Whether the account has been reported by anyone else is not knowable from here.' },
  { key: 'account_still_live', why: 'Whether the account or the reply still exists at the time of reading is not knowable without fetching it.' },
] as const;

export type UnobservableAccountSignal = (typeof UNOBSERVABLE_ACCOUNT_SIGNALS)[number]['key'];

/**
 * The refusal for asking this compartment to score something it cannot see.
 *
 * This exists so a caller gets a typed no with a reason it can render, instead of a
 * plausible number. "Account is 3 days old" from an instrument that cannot see
 * account age is the exact class of confident fabrication the compartment exists to
 * prevent.
 */
export function refuseUnobservableSignal(key: UnobservableAccountSignal): TriageRefusal {
  const entry = UNOBSERVABLE_ACCOUNT_SIGNALS.find((s) => s.key === key)!;
  return refuse(
    'IMPERSONATION_SIGNAL_NOT_OBSERVABLE',
    `${key.replace(/_/g, ' ')} cannot be observed from a notification email, so it is not scored here. ${entry.why}`,
    DESK_NO_SCORE,
    {
      kind: 'not_recoverable',
      why: 'There is no X API credential and there never will be. This signal is not obtainable keyless, and approximating it would be an invention.',
    },
    key,
  );
}

/**
 * THE REFUSAL THAT KEEPS THIS SECTION HONEST.
 *
 * Anything asking "how much impersonation of LCX is happening" gets this. The
 * dominant pattern — a fake support account replying under the victim's own tweet —
 * never touches our mentions, so this compartment has no view of the population and
 * cannot bound it from below OR above. A prevalence figure computed from what arrived
 * in our inbox would be a fraction of an unknown, presented as the whole.
 */
export function refuseImpersonationPrevalence(): TriageRefusal {
  return refuse(
    'IMPERSONATION_PREVALENCE_NOT_OBSERVABLE',
    'How much impersonation of LCX exists cannot be answered here. The only accounts visible are those that replied to us or mentioned us; the commonest scam replies under the victim, not under LCX.',
    DESK_OWN_MENTIONS_ONLY,
    {
      kind: 'not_recoverable',
      why: 'The population is unobservable without a platform search credential. What can be reported is a lower bound on signals visible in our own mentions, which is a different quantity and is named as one.',
    },
  );
}

/* ──── §9.2 Confusable folding and edit distance ──── */

/**
 * Invisible characters an attacker inserts to break a naive string comparison:
 * soft hyphen, the zero-width family, the bidi overrides, the invisible operators and
 * the BOM. Written as escapes on purpose — a literal zero-width character in source
 * is a defect nobody can see in a diff.
 */
const INVISIBLE_CHARS = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * Homoglyph map, applied BEFORE lowercasing so `I` (capital i) folding to `l` is not
 * lost. Latin, Cyrillic and Greek lookalikes plus the digit substitutions that carry
 * the common exchange typosquats (`1cx`, `lcx0fficial`).
 *
 * Deliberately small and readable. A generic Unicode confusables table would fold
 * far more, and every extra fold is a false-positive risk on a real customer's
 * non-English handle — which is the failure mode that teaches an operator to ignore
 * the flag.
 */
const CONFUSABLE_FOLD: Readonly<Record<string, string>> = {
  I: 'l',
  'İ': 'l', // Turkish dotted capital I
  'І': 'l', // Cyrillic Byelorussian-Ukrainian I
  'Ӏ': 'l', // Cyrillic palochka
  'а': 'a',
  'е': 'e',
  'о': 'o',
  'р': 'p',
  'с': 'c',
  'х': 'x',
  'у': 'y',
  'і': 'i',
  'ѕ': 's',
  'ј': 'j',
  'к': 'k',
  'в': 'b',
  'н': 'h',
  'м': 'm',
  'т': 't',
  'α': 'a',
  'ο': 'o',
  'ρ': 'p',
  'ν': 'v',
  'ε': 'e',
  'ı': 'i', // dotless i
};

const LEET_FOLD: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
};

/**
 * Fold a string to its comparison skeleton: invisibles removed, diacritics stripped,
 * lookalikes mapped to Latin, lowercased, leet digits mapped to letters.
 *
 * Exported because a signal must be reproducible by hand. "`Icx_support`, capital i,
 * folds to `lcx_support`" is a sentence a reviewer can re-derive by calling this
 * function, which is the property a similarity model does not have. No homoglyph is
 * written into this comment: a lookalike character in a doc comment is a defect a
 * reviewer cannot see.
 */
export function foldConfusables(raw: string): string {
  const stripped = raw.replace(INVISIBLE_CHARS, '').normalize('NFKD').replace(/\p{M}+/gu, '');
  /* Folded BEFORE lowercasing, so capital `I` folding to `l` is not lost, and again
   * AFTER, because `toLowerCase` on a capital Cyrillic С produces a lowercase one that
   * the first pass never saw. Folding twice is idempotent for everything else. */
  let out = '';
  for (const ch of stripped) out += CONFUSABLE_FOLD[ch] ?? ch;
  out = out.toLowerCase();
  let refolded = '';
  for (const ch of out) refolded += CONFUSABLE_FOLD[ch] ?? ch;
  let leeted = '';
  for (const ch of refolded) leeted += LEET_FOLD[ch] ?? ch;
  return leeted;
}

/**
 * A handle's skeleton: folded, with the separators X allows (`_`) and the ones people
 * type by mistake (`-`, `.`) removed, so `lcx-support`, `lcx_support` and
 * `lcxsupport` are one string.
 */
export function handleSkeleton(handle: Handle): string {
  return foldConfusables(handle.replace(/^@/, '')).replace(/[^a-z0-9]/g, '');
}

/**
 * Levenshtein distance, capped. The cap is not an optimisation: past the cap the
 * exact number is not decision-relevant, and returning `cap + 1` keeps the function
 * total and its cost bounded on adversarially long input.
 */
export function boundedLevenshtein(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev = row;
  }
  const d = prev[b.length]!;
  return d > cap ? cap + 1 : d;
}

/* ──── §9.3 The lexicon and the structural detectors ──── */

/**
 * Tokens that turn a brand-shaped handle into a support-desk claim. An account whose
 * skeleton is the brand plus one of these is claiming a role it does not have, and
 * that is close to conclusive when the display name agrees with it.
 */
export const ROLE_CLAIM_TOKENS: readonly string[] = [
  'support',
  'supports',
  'helpdesk',
  'help',
  'service',
  'services',
  'customercare',
  'care',
  'admin',
  'official',
  'officials',
  'team',
  'staff',
  'agent',
  'assist',
  'assistance',
  'recovery',
  'recover',
  'refund',
  'wallet',
  'airdrop',
  'giveaway',
  'claim',
  'rewards',
  'bot',
  'desk',
  'security',
  'verify',
  'kyc',
];

/** What a lexicon hit means, so a signal can say which family fired. */
export type ScamTermKind =
  | 'secret_request'
  | 'wallet_action'
  | 'payment_request'
  | 'off_platform_contact'
  | 'giveaway_bait'
  | 'authority_claim'
  | 'false_urgency';

/**
 * The scam lexicon. Version it: a term list is a rule, and a refusal that cites a
 * rule must be able to say which version of it fired.
 *
 * Note what this list is NOT for. It is not a blocklist protecting an output — the
 * output guard is the drafting room's allowlist. This reads INBOUND text, where the
 * question is "is this account trying to rob the person it is talking to", and a term
 * hit here changes the recommended ACTION (report, do not reply) rather than editing
 * any words.
 */
export const SCAM_LEXICON_VERSION = 1;

export const SCAM_LEXICON: readonly {
  readonly term: string;
  readonly kind: ScamTermKind;
}[] = [
  { term: 'seed phrase', kind: 'secret_request' },
  { term: 'seedphrase', kind: 'secret_request' },
  { term: 'recovery phrase', kind: 'secret_request' },
  { term: 'private key', kind: 'secret_request' },
  { term: 'secret phrase', kind: 'secret_request' },
  { term: '12 words', kind: 'secret_request' },
  { term: '24 words', kind: 'secret_request' },
  { term: 'keystore', kind: 'secret_request' },
  { term: 'validate your wallet', kind: 'wallet_action' },
  { term: 'validate wallet', kind: 'wallet_action' },
  { term: 'sync your wallet', kind: 'wallet_action' },
  { term: 'sync wallet', kind: 'wallet_action' },
  { term: 'restore wallet', kind: 'wallet_action' },
  { term: 'connect your wallet', kind: 'wallet_action' },
  { term: 'rectify your wallet', kind: 'wallet_action' },
  { term: 'whitelist your wallet', kind: 'wallet_action' },
  { term: 'gas fee', kind: 'payment_request' },
  { term: 'gas fees', kind: 'payment_request' },
  { term: 'activation fee', kind: 'payment_request' },
  { term: 'unlock fee', kind: 'payment_request' },
  { term: 'validation fee', kind: 'payment_request' },
  { term: 'recovery fee', kind: 'payment_request' },
  { term: 'upfront fee', kind: 'payment_request' },
  { term: 'dm me', kind: 'off_platform_contact' },
  { term: 'dm us', kind: 'off_platform_contact' },
  { term: 'message the admin', kind: 'off_platform_contact' },
  { term: 'contact the admin', kind: 'off_platform_contact' },
  { term: 'message support on telegram', kind: 'off_platform_contact' },
  { term: 'telegram', kind: 'off_platform_contact' },
  { term: 'whatsapp', kind: 'off_platform_contact' },
  { term: 'recovery agent', kind: 'authority_claim' },
  { term: 'recovery specialist', kind: 'authority_claim' },
  { term: 'certified recovery', kind: 'authority_claim' },
  { term: 'blockchain expert', kind: 'authority_claim' },
  { term: 'official support', kind: 'authority_claim' },
  { term: 'verified support', kind: 'authority_claim' },
  { term: 'airdrop', kind: 'giveaway_bait' },
  { term: 'claim your reward', kind: 'giveaway_bait' },
  { term: 'claim your tokens', kind: 'giveaway_bait' },
  { term: 'free tokens', kind: 'giveaway_bait' },
  { term: 'giveaway', kind: 'giveaway_bait' },
  { term: 'first 100', kind: 'giveaway_bait' },
  { term: 'act fast', kind: 'false_urgency' },
  { term: 'expires in', kind: 'false_urgency' },
  { term: 'last chance', kind: 'false_urgency' },
  { term: 'limited slots', kind: 'false_urgency' },
];

/**
 * Language-independent structural detectors. These are the ones worth having, and
 * they are precisely the ones the production sanitiser misses: it redacts `ETH` as a
 * bare word while `DM @LCX_Recovery_Desk`, a t.me link and a phone number pass clean.
 */
const STRUCTURAL_PATTERNS: readonly {
  readonly id: string;
  readonly pattern: RegExp;
  readonly sentence: string;
}[] = [
  {
    id: 'off_platform_link',
    pattern: /\b(?:t\.me|telegram\.me|wa\.me|chat\.whatsapp\.com|discord\.gg|m\.me)\/[^\s)]+/gi,
    sentence: 'the body links to an off-platform messaging channel',
  },
  {
    id: 'url',
    pattern: /\bhttps?:\/\/[^\s)]+|\b[a-z0-9-]+\.(?:com|net|org|io|xyz|top|live|app|link|pro|site|online|info|co)\b/gi,
    sentence: 'the body contains a URL or domain',
  },
  {
    id: 'other_handle',
    /* X caps a handle at 15 characters, and this deliberately allows 30. A longer
     * token is not a real handle, but "DM @LCX_Recovery_Desk" is still an instruction
     * to contact someone, and matching only the first 15 characters would report a
     * truncated span the operator cannot find in the email in front of them. Evidence
     * that cannot be located is not evidence. */
    pattern: /(?:^|[^\w])@([A-Za-z0-9_]{2,30})/g,
    sentence: 'the body names another account to contact',
  },
  {
    id: 'phone_number',
    pattern: /\+\d[\d\s().-]{7,}\d/g,
    sentence: 'the body contains a phone number',
  },
  {
    id: 'wallet_address',
    pattern: /\b(?:0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{20,}|T[A-Za-z0-9]{33})\b/g,
    sentence: 'the body contains a wallet-shaped address',
  },
];

/** How much weight a single signal carries on its own. Named, never summed. */
export type SignalStrength = 'weak' | 'moderate' | 'strong';

/**
 * Which readable field a signal came from. Three, not five.
 *
 * There is no `corpus` family and no `timing` family here, and the absence is the
 * honest answer rather than an oversight:
 *  - corpus-level findings are a property of the WINDOW, not of one item, so they live
 *    in `TemplateReuseReading` where the window's frame travels with them;
 *  - timing is not scored at all, for the reason in `TIMING_NOT_SCORED_REASON`.
 * An enum value nothing emits would let a surface build a filter that is always empty
 * and read that as "no timing problems".
 */
export type SignalFamily = 'handle' | 'display_name' | 'body';

/** As data, so a test can assert that nothing emits a family outside this list. */
export const SIGNAL_FAMILIES: readonly SignalFamily[] = ['handle', 'display_name', 'body'];

/**
 * WHY NOTHING HERE SCORES TIMING.
 *
 * The obvious signals — a reply seconds after the post, a burst under one post — need
 * a trustworthy post time, and the compartment does not have one: `posted_at` is
 * written from the notification email's `Date` header rather than from X, so a
 * computed delay measures mail-forwarding latency, and it falls back to `received_at`
 * when absent, which flatters the number by exactly the delay. Scoring on that would
 * produce a signal whose value is an artefact of the mail route.
 *
 * The one time-shaped finding that IS honest needs no timestamp at all: how many
 * distinct handles hit the same parent post, which `readTemplateReuse` reports as
 * `sameParentHandles`. When `posted_at` is repaired from oEmbed, a timing family can
 * be added here and this constant deleted.
 */
export const TIMING_IS_NOT_SCORED = true;

export const TIMING_NOT_SCORED_REASON =
  "No timing signal is emitted. posted_at is taken from the notification email's Date header rather than from X and falls back to received_at when absent, so any computed delay measures the mail route rather than the poster. The honest time-shaped finding is how many distinct handles replied under the same parent post, reported by readTemplateReuse as sameParentHandles.";

/**
 * One named, individually cited signal.
 *
 * There is no numeric weight on this object and no function in this file that adds
 * them up. A regulator asking how a conclusion was reached gets the list, the span
 * that fired, and the rule — not a coefficient.
 */
export interface ImpersonationSignal {
  /** Stable id, so a silence log can record which signals were visible. */
  readonly id: string;
  readonly family: SignalFamily;
  readonly strength: SignalStrength;
  /** One sentence an operator can check against the email in front of them. */
  readonly sentence: string;
  /** The exact span or value that fired, so the signal is arguable. */
  readonly matched: string | null;
  readonly rule: RuleCitation;
}

/**
 * The band. Deliberately not a score, and deliberately named for what was SEEN.
 *
 * `no_signals_visible` is the important one: it says nothing fired in the five
 * readable fields. It does not say the account is genuine, and the name is chosen so
 * that a surface cannot render it as "clean" without editing the string.
 */
export type ImpersonationBand =
  | 'no_signals_visible'
  | 'signals_in_one_field_only'
  | 'corroborating_signals'
  | 'handle_and_name_both_impersonate';

export const IMPERSONATION_BAND_DEFINITION: Record<ImpersonationBand, string> = {
  no_signals_visible:
    'Nothing fired in the handle, display name, body, corpus or timing. This is not a finding that the account is genuine — the signals that would settle that (account age, followers, verification) are not observable here.',
  signals_in_one_field_only:
    'One or more signals fired, but all of them in the same readable field, so they do not corroborate each other. RESIST 2 calls evidence taken in isolation or without corroboration low confidence. Read the signals rather than the band: a single strong one — a display name claiming to be LCX support — can still be decisive.',
  corroborating_signals:
    'Signals fired in two or more of the readable fields, which corroborate one another because they are independent of each other.',
  handle_and_name_both_impersonate:
    'The handle is a lookalike of an LCX-owned handle AND the display name claims to be LCX or LCX support, while the handle is not LCX-owned. Research calls this close to conclusive; it is still a human decision to report.',
};

/**
 * The reading, or a refusal.
 *
 * `refused` fires when there is no owned-handle allowlist to compare against. That is
 * the doctrine's third rule applied literally: with nothing to measure distance from,
 * "no impersonation signals" would be a clean result computed against an empty
 * register, and a clean result is what a reader acts on.
 */
export type ImpersonationReading =
  | {
      readonly kind: 'read';
      readonly band: ImpersonationBand;
      readonly bandMeaning: string;
      readonly signals: readonly ImpersonationSignal[];
      /** Always non-empty. Rendered next to the band, not behind a tooltip. */
      readonly notObservable: readonly TriageRefusal[];
      readonly lexiconVersion: number;
      readonly lexiconCaveat: string;
      readonly visibilityCaveat: string;
      readonly readAt: Instant;
    }
  | { readonly kind: 'refused'; readonly refusal: TriageRefusal };

/** How much weight a single signal carries. Ranked so the strongest wins, never summed. */
const STRENGTH_RANK: Record<SignalStrength, 1 | 2 | 3> = { weak: 1, moderate: 2, strong: 3 };

/**
 * Normalisation for lexicon matching: folded, then everything that is not a letter or
 * digit becomes a space, then padded — so a term is tested at a word boundary without
 * a regex per term, and `seed phrase.` matches `seed phrase`.
 *
 * Both the text and the term go through this, which is what makes leet folding safe
 * here: `12 words` folds to `l2 words` on both sides and still matches, and a term
 * that reads oddly folded is still compared against an identically folded body.
 */
function lexiconNorm(text: string): string {
  const folded = foldConfusables(text).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return ` ${folded} `;
}

function containsRoleToken(skeleton: string): string | null {
  for (const token of ROLE_CLAIM_TOKENS) {
    if (skeleton.includes(token)) return token;
  }
  return null;
}

/**
 * READ THE FIVE FIELDS. Pure; `now` is only stamped onto the record.
 *
 * The handle comparison runs on skeletons, so `lcx-support`, `lcx_support`,
 * `LCXSupport` and a Cyrillic-c spelling are one string, and the distance is reported
 * in the sentence so an operator can disagree with the specific number.
 */
export function readImpersonationSignals(input: {
  readonly handle: Handle;
  readonly displayName: string | null;
  readonly bodyText: string;
  /** LCX-owned handles, without '@'. An empty list is a refusal, not zero signals. */
  readonly ownedHandles: readonly Handle[];
  /** Staff handles, treated as owned for the purpose of lookalike detection. */
  readonly staffHandles?: readonly Handle[];
  /** The brand tokens a display name may not claim, e.g. `['lcx']`. */
  readonly brandTokens?: readonly string[];
  readonly now: Instant;
}): ImpersonationReading {
  const owned = uniqueStrings([...input.ownedHandles, ...(input.staffHandles ?? [])]);
  if (owned.length === 0) {
    return {
      kind: 'refused',
      refusal: refuse(
        'OWNED_HANDLE_ALLOWLIST_ABSENT',
        'There is no list of LCX-owned handles to compare against, so no lookalike reading is possible. Reporting no signals here would be a clean result computed against an empty register.',
        DESK_ABSENCE_IS_NOT_ZERO,
        {
          kind: 'supply_data',
          missing: 'the list of LCX-owned and staff X handles',
          whoCanSupply: 'the marketing desk owner',
        },
      ),
    };
  }

  const candidate = handleSkeleton(input.handle);
  const ownedSkeletons = owned.map((h) => ({ handle: h, skeleton: handleSkeleton(h) }));
  const isOwned = ownedSkeletons.some((o) => o.handle.toLowerCase() === input.handle.replace(/^@/, '').toLowerCase());

  const signals: ImpersonationSignal[] = [];

  if (!isOwned) {
    /* Handle family. Strongest applicable finding only — three overlapping
     * descriptions of one handle would read as three pieces of evidence. */
    let best: ImpersonationSignal | null = null;
    for (const o of ownedSkeletons) {
      const distance = boundedLevenshtein(candidate, o.skeleton, 3);
      const roleToken = candidate.startsWith(o.skeleton) || candidate.endsWith(o.skeleton)
        ? containsRoleToken(candidate.replace(o.skeleton, ''))
        : null;

      let found: ImpersonationSignal | null = null;
      if (distance === 0) {
        found = {
          id: `handle_folds_to_owned:${o.handle}`,
          family: 'handle',
          strength: 'strong',
          sentence: `the handle @${input.handle} is not LCX-owned but folds to the same skeleton as @${o.handle} once lookalike characters and separators are normalised`,
          matched: input.handle,
          rule: RESIST_IDENTITY_INDICATOR,
        };
      } else if (roleToken !== null) {
        found = {
          id: `handle_owned_plus_role_token:${o.handle}`,
          family: 'handle',
          strength: 'strong',
          sentence: `the handle @${input.handle} is @${o.handle} plus the role token "${roleToken}", which claims a support or official role it does not have`,
          matched: input.handle,
          rule: RESIST_IDENTITY_INDICATOR,
        };
      } else if (distance <= 2) {
        found = {
          id: `handle_near_owned:${o.handle}`,
          family: 'handle',
          strength: 'moderate',
          sentence: `the handle @${input.handle} is ${distance} edit${distance === 1 ? '' : 's'} from @${o.handle} on folded skeletons`,
          matched: input.handle,
          rule: RESIST_IDENTITY_INDICATOR,
        };
      } else if (o.skeleton.length >= 3 && candidate.includes(o.skeleton)) {
        found = {
          id: `handle_contains_owned:${o.handle}`,
          family: 'handle',
          strength: 'weak',
          sentence: `the handle @${input.handle} contains @${o.handle} as a substring`,
          matched: input.handle,
          rule: RESIST_IDENTITY_INDICATOR,
        };
      }

      if (found !== null && (best === null || STRENGTH_RANK[found.strength] > STRENGTH_RANK[best.strength])) {
        best = found;
      }
    }
    if (best !== null) signals.push(best);
  }

  /* Display-name family. A display name is attacker-chosen and is not identity, which
   * is exactly why it is evidence of a CLAIM being made. */
  const display = nonEmpty(input.displayName);
  const brandTokens = uniqueStrings(input.brandTokens ?? ['lcx']);
  if (display !== null && !isOwned) {
    const displaySkeleton = foldConfusables(display).replace(/[^a-z0-9]/g, '');
    const brandHit = brandTokens.find((t) => displaySkeleton.includes(foldConfusables(t)));
    if (brandHit !== undefined) {
      const roleToken = containsRoleToken(displaySkeleton);
      signals.push(
        roleToken !== null
          ? {
              id: 'display_name_claims_brand_role',
              family: 'display_name',
              strength: 'strong',
              sentence: `the display name "${display}" claims to be ${brandHit} ${roleToken} on a handle that is not LCX-owned`,
              matched: display,
              rule: RESIST_IDENTITY_INDICATOR,
            }
          : {
              id: 'display_name_claims_brand',
              family: 'display_name',
              strength: 'moderate',
              sentence: `the display name "${display}" carries the ${brandHit} brand on a handle that is not LCX-owned`,
              matched: display,
              rule: RESIST_IDENTITY_INDICATOR,
            },
      );
    }
  }

  /* Body family: lexicon, then the language-independent structural detectors. */
  const norm = lexiconNorm(input.bodyText);
  const lexiconHits = SCAM_LEXICON.filter((entry) => norm.includes(lexiconNorm(entry.term)));
  const seenKinds = new Set<ScamTermKind>();
  for (const hit of lexiconHits) {
    if (seenKinds.has(hit.kind)) continue;
    seenKinds.add(hit.kind);
    const terms = lexiconHits.filter((h) => h.kind === hit.kind).map((h) => h.term);
    signals.push({
      id: `body_${hit.kind}`,
      family: 'body',
      strength:
        hit.kind === 'secret_request' || hit.kind === 'payment_request' || hit.kind === 'wallet_action'
          ? 'strong'
          : 'moderate',
      sentence: `the body matches the ${hit.kind.replace(/_/g, ' ')} term list: ${terms.join(', ')}`,
      matched: terms.join(', '),
      rule: DESK_NO_SCORE,
    });
  }

  for (const detector of STRUCTURAL_PATTERNS) {
    const re = new RegExp(detector.pattern.source, detector.pattern.flags);
    const found = input.bodyText.match(re);
    if (found === null || found.length === 0) continue;
    if (detector.id === 'other_handle') {
      const ownedLower = new Set(owned.map((h) => h.toLowerCase()));
      const foreign = uniqueStrings(
        found.map((m) => m.replace(/^[^@]*@/, '')).filter((h) => !ownedLower.has(h.toLowerCase())),
      );
      if (foreign.length === 0) continue;
      signals.push({
        id: 'body_names_other_account',
        family: 'body',
        strength: 'moderate',
        sentence: `${detector.sentence}: @${foreign.join(', @')}`,
        matched: foreign.join(', '),
        rule: DESK_NO_SCORE,
      });
      continue;
    }
    signals.push({
      id: `body_${detector.id}`,
      family: 'body',
      strength: detector.id === 'url' ? 'weak' : 'moderate',
      sentence: `${detector.sentence}: ${uniqueStrings(found).slice(0, 3).join(', ')}`,
      matched: uniqueStrings(found).slice(0, 3).join(', '),
      rule: DESK_NO_SCORE,
    });
  }

  const band = bandOf(signals);
  return {
    kind: 'read',
    band,
    bandMeaning: IMPERSONATION_BAND_DEFINITION[band],
    signals,
    notObservable: UNOBSERVABLE_ACCOUNT_SIGNALS.map((s) => refuseUnobservableSignal(s.key)),
    lexiconVersion: SCAM_LEXICON_VERSION,
    lexiconCaveat: SCAM_LEXICON_COVERAGE_REASON,
    visibilityCaveat: IMPERSONATION_VISIBILITY_REASON,
    readAt: input.now,
  };
}

/** The band, derived from the signal list only. No thresholds on counts of terms. */
export function bandOf(signals: readonly ImpersonationSignal[]): ImpersonationBand {
  if (signals.length === 0) return 'no_signals_visible';
  const strongHandle = signals.some((s) => s.family === 'handle' && s.strength === 'strong');
  const displayClaim = signals.some((s) => s.family === 'display_name');
  if (strongHandle && displayClaim) return 'handle_and_name_both_impersonate';
  const families = new Set(signals.map((s) => s.family));
  return families.size >= 2 ? 'corroborating_signals' : 'signals_in_one_field_only';
}

/* ──── §9.4 Template reuse — the strongest coordination signal available keyless ──── */

/** Trigram similarity at or above this counts as the same template. */
export const TEMPLATE_REUSE_MIN_SIMILARITY = 0.75;

/** Distinct handles needed before reuse is reported at all. */
export const TEMPLATE_REUSE_MIN_HANDLES = 3;

/**
 * The reuse reading, or a refusal when there is no corpus to compare against.
 *
 * Reuse is computed over the desk's OWN accumulated window — items that arrived in our
 * own mentions — so it needs no credential. Its limit is the same as everything else
 * here: it can only see coordination that touched us.
 */
export type TemplateReuseReading =
  | {
      readonly kind: 'read';
      readonly distinctHandles: number;
      readonly matchedHandles: readonly Handle[];
      readonly similarityFloor: number;
      /** Distinct handles that hit the same parent post, where the parent is known. */
      readonly sameParentHandles: number;
      readonly frame: ObservationFrame;
    }
  | { readonly kind: 'refused'; readonly refusal: TriageRefusal };

/**
 * Compare one body against the window's other bodies.
 *
 * Reuses `trigramSimilarity` from `precedent.ts` rather than inventing a second
 * similarity measure: two different notions of "near-identical text" in one
 * compartment is how two surfaces come to disagree about the same pair of items, and
 * that function is already exported so a reviewer can reproduce a score by hand.
 */
export function readTemplateReuse(input: {
  readonly handle: Handle;
  readonly bodyText: string;
  readonly parentPostId: string | null;
  readonly corpus: readonly {
    readonly handle: Handle;
    readonly bodyText: string;
    readonly parentPostId: string | null;
  }[];
  readonly frame: ObservationFrame;
}): TemplateReuseReading {
  if (input.corpus.length === 0) {
    return {
      kind: 'refused',
      refusal: refuse(
        'TEMPLATE_REUSE_CORPUS_ABSENT',
        'There are no other items in the window to compare this text against, so reuse cannot be read. That is not the same as this text being unique.',
        DESK_ABSENCE_IS_NOT_ZERO,
        {
          kind: 'supply_data',
          missing: 'other inbound items in the retention window',
          whoCanSupply: 'the ingest, once the window has items in it',
        },
      ),
    };
  }

  const self = input.handle.toLowerCase();
  const matched: string[] = [];
  const sameParent = new Set<string>();

  for (const item of input.corpus) {
    if (item.handle.toLowerCase() === self) continue;
    if (trigramSimilarity(input.bodyText, item.bodyText) < TEMPLATE_REUSE_MIN_SIMILARITY) continue;
    matched.push(item.handle);
    if (
      input.parentPostId !== null &&
      item.parentPostId !== null &&
      item.parentPostId === input.parentPostId
    ) {
      sameParent.add(item.handle.toLowerCase());
    }
  }

  const matchedHandles = uniqueStrings(matched);
  return {
    kind: 'read',
    /* +1 for the item itself: three handles sharing a template means this one plus two
     * others, and reporting two would understate what the operator is looking at. */
    distinctHandles: matchedHandles.length === 0 ? 0 : matchedHandles.length + 1,
    matchedHandles,
    similarityFloor: TEMPLATE_REUSE_MIN_SIMILARITY,
    sameParentHandles: sameParent.size === 0 ? 0 : sameParent.size + 1,
    frame: input.frame,
  };
}

/* ──── §9.5 The only count this section will produce, and its frame ──── */

/** The metric name carries the scope. There is no shorter honest name for it. */
export type OwnMentionsImpersonationMetric = 'impersonation_signals_in_own_mentions';

/**
 * The frame for anything read off notification mail. Built rather than hard-coded so
 * the window and the last successful poll are the caller's facts, not this file's
 * guesses — but `doesNotCapture` and `completeness` are fixed, because they are
 * properties of the channel and not of the window.
 */
export function ownMentionsFrame(input: {
  readonly windowFrom: Instant;
  readonly windowTo: Instant;
  readonly lastSuccessfulPollAt: Instant | null;
  readonly source?: InboundSourceKind;
}): ObservationFrame {
  return {
    source: input.source ?? 'x_notification_email',
    captures:
      'replies to LCX posts and mentions of the LCX handle, as delivered to the notification mailbox and as forwarded by the mail rule',
    doesNotCapture: [
      'a fake support account replying under the victim\'s own tweet, which is the dominant scam pattern and mentions the victim rather than LCX',
      'impersonation accounts that never replied to us or mentioned us',
      'posts that did not mention LCX',
      'notifications X batched, digested, throttled or did not send',
      'items deleted before the mailbox was polled',
      'private, protected or limited-audience posts',
      'anything on any platform we do not receive mail from',
    ],
    knownBiases: [
      'controversy-weighted delivery: the corpus over-represents conflict',
      'platform-side notification filtering with unknown rules',
      'mail forwarding and delivery gaps',
    ],
    completeness: 'unknown_no_denominator',
    windowFrom: input.windowFrom,
    windowTo: input.windowTo,
    lastSuccessfulPollAt: input.lastSuccessfulPollAt,
  };
}

/**
 * THE COUNT. A `LowerBound` inside a `Figure`, never a bare number.
 *
 * Three properties, each of which a normal dashboard breaks:
 *  - the metric NAME says "in own mentions", so it cannot be re-presented two screens
 *    later as a count of impersonation;
 *  - it is a lower bound, because the corpus is a filtered census of one edge type;
 *  - a window with nothing in it and a window that never polled are different, so the
 *    second returns a refusal rather than 0. A zero and an absence look identical on a
 *    tile and mean opposite things.
 */
export function countImpersonationSignalsInOwnMentions(input: {
  readonly readings: readonly ImpersonationReading[];
  readonly frame: ObservationFrame;
}): Figure<LowerBound<OwnMentionsImpersonationMetric>> {
  if (input.frame.lastSuccessfulPollAt === null) {
    return {
      kind: 'absent',
      refusal: refuseShared(
        'DATA_ABSENT_NOT_ZERO',
        'This channel has never polled successfully, so the count is unknown rather than zero.',
        DESK_ABSENCE_IS_NOT_ZERO,
        { kind: 'wait_until', condition: 'the notification mailbox has been polled successfully at least once' },
      ),
    };
  }

  const atLeast = input.readings.reduce(
    (n, r) => (r.kind === 'read' ? n + r.signals.length : n),
    0,
  );

  /* The frame appears twice because both shared types require one: `Figure` carries
   * the frame a surface renders beside the number, and `LowerBound` carries the frame
   * that travels with the count if it is ever passed on alone. They are the same
   * object here, deliberately — two frames that could differ would be a way for a
   * number to arrive somewhere with a friendlier caveat than the one it was measured
   * under. */
  return {
    kind: 'measured',
    frame: input.frame,
    value: {
      kind: 'lower_bound',
      metric: 'impersonation_signals_in_own_mentions',
      atLeast,
      frame: input.frame,
    },
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §10  THE COUNTERPARTY, NOT THE MESSAGE — RHETORICAL PATTERN OVER TIME
 * ════════════════════════════════════════════════════════════════════════════ */

/** Items an account must have in the window before any pattern claim is made. */
export const RHETORIC_MIN_ITEMS = 3;

/** Times one device must recur before "repeatedly" is a word this desk will use. */
export const RHETORIC_MIN_REPEATS = 2;

export type RhetoricVerdict =
  | 'insufficient_history'
  | 'no_repeated_device_observed'
  | 'repeated_devices_observed';

export interface RhetoricPattern {
  readonly verdict: RhetoricVerdict;
  readonly itemsObserved: number;
  readonly deviceCounts: Partial<Record<RhetoricalDevice, number>>;
  readonly repeatedDevices: readonly RhetoricalDevice[];
  readonly frame: ObservationFrame;
  /** Present only at `insufficient_history`. */
  readonly refusal: TriageRefusal | null;
  readonly rule: RuleCitation;
}

/**
 * Read an account's rhetorical pattern from the desk's own triage history.
 *
 * RESIST licenses the conclusion only for repetition: "If somebody repeatedly uses
 * these techniques in their online engagements, they are likely not interested in
 * correcting false or misleading information." So one aggressive reply is not a troll,
 * and this function will not say it is: below `RHETORIC_MIN_ITEMS` the verdict is
 * `insufficient_history` and carries a refusal, because "no pattern" computed over one
 * item is the same false negative as a clean result over an empty register.
 *
 * The devices come from human triage records, never from a keyword pass. Whataboutism
 * and strawmanning are argument structures; a regex claiming to find them would be the
 * decorative kind of alarm this compartment refuses to ship.
 */
export function readRhetoricPattern(input: {
  readonly devicesPerItem: readonly (readonly RhetoricalDevice[])[];
  readonly frame: ObservationFrame;
}): RhetoricPattern {
  const counts: Partial<Record<RhetoricalDevice, number>> = {};
  for (const item of input.devicesPerItem) {
    for (const device of new Set(item)) counts[device] = (counts[device] ?? 0) + 1;
  }
  const repeated = (Object.entries(counts) as [RhetoricalDevice, number][])
    .filter(([, n]) => n >= RHETORIC_MIN_REPEATS)
    .map(([d]) => d);

  const itemsObserved = input.devicesPerItem.length;
  if (itemsObserved < RHETORIC_MIN_ITEMS) {
    return {
      verdict: 'insufficient_history',
      itemsObserved,
      deviceCounts: counts,
      repeatedDevices: repeated,
      frame: input.frame,
      refusal: refuse(
        'RHETORIC_HISTORY_INSUFFICIENT',
        `This account has ${itemsObserved} item(s) in our own mentions; ${RHETORIC_MIN_ITEMS} are needed before the desk will describe a pattern. One aggressive reply is not a pattern.`,
        RESIST_TROLLS,
        {
          kind: 'wait_until',
          condition: `${RHETORIC_MIN_ITEMS} items from this account have been triaged in the window`,
        },
      ),
      rule: RESIST_TROLLS,
    };
  }

  return {
    verdict: repeated.length > 0 ? 'repeated_devices_observed' : 'no_repeated_device_observed',
    itemsObserved,
    deviceCounts: counts,
    repeatedDevices: repeated,
    frame: input.frame,
    refusal: null,
    rule: RESIST_TROLLS,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §11  THE CLOCK — SUPPRESSIBLE WITH A REASON, NEVER HIDDEN
 * ════════════════════════════════════════════════════════════════════════════
 *  A paused clock with a reason on it is honest. A clock that quietly stopped is a
 *  desk lying to itself about its own response time, and it is the reason "oldest
 *  waiting" numbers in reply tools are worthless.
 *
 *  Three properties this implementation keeps and a `paused: boolean` would lose:
 *   1. Suppression takes a NAME and a REASON, and refuses without either.
 *   2. Elapsed time is still computed while suppressed. Suppression removes the
 *      alarm, not the number.
 *   3. A breach that had ALREADY happened stays on the record after suppression
 *      (`breachedBeforeSuppression`). Suppressing a clock cannot retroactively make
 *      the desk have been on time.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The budget per tier, in minutes.
 *
 * `low` is `null` and that is the point of the taxonomy, not an omission: RESIST's low
 * priority means lines prepared and NO RESPONSE MADE, so there is no first statement
 * to be late for. A first-statement clock on a `low` item would manufacture urgency
 * the doctrine explicitly rejects — and it is how a desk ends up answering everything.
 *
 * The two numbers are desk policy, chosen against the Fed's SVB review: over $40bn of
 * deposits left in a single day, attributed to social media plus instant withdrawals.
 * A venue with 24/7 settlement and no deposit insurance is worse-positioned, so the
 * unit for a `high` item is tens of minutes.
 */
/*
 * Keyed on the TRIAGE TIER of somebody else's claim. `crisis.ts`'s
 * `TTFS_BUDGET_MINUTES_BY_SEVERITY` is the other ladder — keyed on the severity of an
 * incident that happened to LCX — and the two are deliberately not reconciled: see the
 * note above that constant. `low: null` is the whole point here and has no analogue
 * there, because a crisis always owes a clock and a low-tier claim never does.
 */
export const TTFS_BUDGET_MINUTES_BY_TIER: Record<PriorityTier, number | null> = {
  high: 30,
  medium: 240,
  low: null,
};

/*
 * A suppression, once it has survived validation, is `types.ts`'s `ClockSuppression`.
 * It was declared here and identically in `crisis.ts`; one desk gets one suppression
 * record, so the vocabulary owns it and both clocks import it.
 */

export type TriageClockReading =
  | {
      readonly kind: 'running';
      readonly elapsedMinutes: number;
      readonly budgetMinutes: number;
      readonly remainingMinutes: number;
      readonly state: 'within_budget' | 'breached';
      readonly breachedByMinutes: number;
    }
  | {
      readonly kind: 'suppressed';
      /** Still computed. Suppression removes the alarm, not the number. */
      readonly elapsedMinutes: number;
      readonly budgetMinutes: number;
      readonly suppression: ClockSuppression;
      /** True if the budget was already breached when suppression was recorded. */
      readonly breachedBeforeSuppression: boolean;
    }
  | {
      readonly kind: 'stopped';
      readonly elapsedMinutes: number;
      readonly budgetMinutes: number;
      readonly state: 'within_budget' | 'breached';
      readonly firstStatementAt: Instant;
    }
  | {
      readonly kind: 'not_applicable';
      readonly why: string;
    }
  | { readonly kind: 'unavailable'; readonly refusal: TriageRefusal };

/**
 * Read the clock. Pure: `now` is an argument, so a reading is reproducible.
 *
 * Order of the checks matters and is deliberate. A missing start REFUSES rather than
 * reading zero — an item with no recorded arrival time is not an item answered
 * instantly. A `low` tier is `not_applicable` rather than an infinite budget, because
 * a surface renders those two differently and only one of them is true.
 */
export function readTriageClock(input: {
  readonly startedAt: Instant | null;
  readonly firstStatementAt: Instant | null;
  readonly tier: PriorityTier;
  readonly suppression: ClockSuppression | null;
  readonly now: Instant;
  /** Override the tier default, e.g. from an incident's own budget. */
  readonly budgetMinutes?: number | null;
}): TriageClockReading {
  const budget = input.budgetMinutes === undefined ? TTFS_BUDGET_MINUTES_BY_TIER[input.tier] : input.budgetMinutes;

  if (input.startedAt === null || ms(input.startedAt) === null) {
    return {
      kind: 'unavailable',
      refusal: refuse(
        'TTFS_START_NOT_RECORDED',
        'This item has no usable start time, so elapsed time is unknown rather than zero.',
        DESK_CLOCK,
        {
          kind: 'supply_data',
          missing: 'the instant the item became known to the desk',
          whoCanSupply: 'the ingest, or the operator who saw it first',
        },
        input.startedAt,
      ),
    };
  }

  if (budget === null) {
    return {
      kind: 'not_applicable',
      why:
        input.tier === 'low'
          ? PRIORITY_MEANING.low
          : 'No time-to-first-statement budget is set for this item, so there is nothing to burn against.',
    };
  }

  if (input.firstStatementAt !== null && ms(input.firstStatementAt) !== null) {
    const elapsed = minutesBetween(input.startedAt, input.firstStatementAt)!;
    return {
      kind: 'stopped',
      elapsedMinutes: elapsed,
      budgetMinutes: budget,
      state: elapsed > budget ? 'breached' : 'within_budget',
      firstStatementAt: input.firstStatementAt,
    };
  }

  if (input.suppression !== null) {
    const elapsed = minutesBetween(input.startedAt, input.now)!;
    const atSuppression = minutesBetween(input.startedAt, input.suppression.at);
    return {
      kind: 'suppressed',
      elapsedMinutes: elapsed,
      budgetMinutes: budget,
      suppression: input.suppression,
      breachedBeforeSuppression: atSuppression !== null && atSuppression > budget,
    };
  }

  const elapsed = minutesBetween(input.startedAt, input.now)!;
  const breachedBy = elapsed - budget;
  return {
    kind: 'running',
    elapsedMinutes: elapsed,
    budgetMinutes: budget,
    remainingMinutes: budget - elapsed,
    state: breachedBy > 0 ? 'breached' : 'within_budget',
    breachedByMinutes: breachedBy > 0 ? breachedBy : 0,
  };
}

export type SuppressionOutcome =
  | { readonly kind: 'suppressed'; readonly suppression: ClockSuppression }
  | { readonly kind: 'refused'; readonly refusal: TriageRefusal };

/**
 * Suppress the clock. Both fields are mandatory and each has its own refusal, because
 * "who" and "why" fail for different reasons and an operator fixing one should not be
 * told about the other.
 */
export function suppressTriageClock(input: {
  readonly by: ActorId;
  readonly reason: string;
  readonly at: Instant;
}): SuppressionOutcome {
  const by = nonEmpty(input.by);
  if (by === null) {
    return {
      kind: 'refused',
      refusal: refuse(
        'TTFS_SUPPRESSION_UNATTRIBUTED',
        'Suppressing the clock needs a named human. An unattributed suppression is a clock that stopped by itself.',
        DESK_CLOCK,
        { kind: 'supply_data', missing: 'the id of the human suppressing the clock', whoCanSupply: 'the operator' },
      ),
    };
  }
  const reason = nonEmpty(input.reason);
  if (reason === null) {
    return {
      kind: 'refused',
      refusal: refuse(
        'TTFS_SUPPRESSION_UNREASONED',
        'Suppressing the clock needs a written reason. A paused clock with a reason is honest; a hidden one is not.',
        DESK_CLOCK,
        { kind: 'supply_data', missing: 'the reason the clock is being suppressed', whoCanSupply: by },
      ),
    };
  }
  return { kind: 'suppressed', suppression: { by, reason, at: input.at } };
}

/**
 * The refusal for a clock asked to run with no budget at all — e.g. a caller passing
 * an explicit `null` budget for a `high` item. Kept as its own function so an ingest
 * validating stored records has something to call.
 */
export function refuseAbsentBudget(tier: PriorityTier): TriageRefusal {
  return refuse(
    'TTFS_BUDGET_ABSENT',
    `A ${tier}-priority item has no time-to-first-statement budget, so lateness cannot be read at all.`,
    DESK_CLOCK,
    { kind: 'supply_data', missing: 'a budget in minutes for this tier', whoCanSupply: 'the marketing desk owner' },
    tier,
  );
}
