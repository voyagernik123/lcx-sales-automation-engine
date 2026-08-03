import {
  ART_7_1_E_STATEMENT_PLATFORM_OPERATOR,
  VERB_ADOPTION,
  VERB_INHERITS_TARGET_RISK,
  VERB_PRODUCES_OWN_TEXT,
  X_POST_MAX_CHARS,
  type EngagementVerb,
  type GateReading,
  type Refusal,
  type RefusalCode,
  type RefusalRecovery,
  type RuleCitation,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE LIVE PRE-CHECKS — what a screen may honestly decide on its own
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * These run on every keystroke, with no network, and they are ADVISORY. The
 * compartment's engines (`marketing/claimSafety.ts`, `abuse.ts`, `regime.ts`) are
 * authoritative and can refuse text this file lets through. That posture is the house
 * one rather than an excuse: `meta.issueDecisionIsAdvisory` makes the GPS quote desk say
 * exactly the same thing about its own preview — "the gate on POST … decides, against
 * the state at that moment, and it can refuse what this preview allows".
 *
 * SO THE ADMISSION CRITERION HERE IS NARROW. A pre-check may only exist in this file if
 * it is ARITHMETIC over a constant the shared vocabulary owns, a LITERAL phrase match
 * with a citation, or a lookup in one of the shared verb tables. Nothing here judges
 * whether a sentence is fair, clear and not misleading: that is a ruleset with a version
 * number, it lives in the engine, and a second opinion about it written in a component
 * is the slop this wave exists to answer.
 *
 * EVERY REFUSAL BELOW CARRIES A `RefusalCode` FROM THE SHARED UNION — no local codes.
 * The codes end up in refusal-frequency counts, which are the only honest read on whether
 * these gates are load-bearing, so a code invented here would be a measurement nobody
 * could aggregate.
 *
 * WHAT A CLEAN RESULT MEANS: nothing. An empty list is not a clearance and `composeGates`
 * will not render it as one — six of the eleven mandatory elements, both market-abuse
 * joins and the whole claim-safety ruleset are unreachable from a browser with no engine
 * behind it, and the surface says so.
 */

/** The desk's pre-check ruleset version, stamped onto every refusal it emits. */
export const PRECHECK_RULESET_VERSION = 1;

const cite = (instrument: RuleCitation['instrument'], provision: string, text: string): RuleCitation =>
  ({ instrument, provision, text });

const refuse = (
  code: RefusalCode,
  sentence: string,
  rule: RuleCitation,
  recovery: RefusalRecovery,
  matched: string | null,
): Refusal => ({ code, sentence, rule, recovery, matched, ruleSetVersion: PRECHECK_RULESET_VERSION });

/* ── The Art 7 arithmetic. Not an opinion: 286 > 280. ────────────────────────── */

/**
 * The mandated Art 7(1)(e) statement in its platform-operator form does not fit in a
 * post before a single word of LCX's own is written — and Art 7(1)(d) then adds the
 * white-paper statement, a website, a telephone number and an email on top of it.
 *
 * Computed from the shared constant rather than restated, so if the Regulation's text is
 * ever corrected in one place this arithmetic follows it.
 */
export const ART_7_BUDGET = {
  statementChars: ART_7_1_E_STATEMENT_PLATFORM_OPERATOR.length,
  postMax: X_POST_MAX_CHARS,
} as const;

/* ── Literal phrase sets. Each carries the source that made it a rule. ───────── */

/**
 * ESMA35-1872330276-2329 names as a DON'T: "The CASP's regulatory status is used as a
 * promotional tool", and requires marketing to "indicate clearly if a product and/or
 * service offered by a CASP is regulated or not".
 *
 * These phrases are LCX's own brand line. An engine that will not flag its owner's
 * favourite sentence is decoration — which is why this list is short, specific, and
 * about the FRAMING (status as the selling point) rather than about the word "regulated"
 * appearing anywhere. `sanitise.ts:73` is the standing warning: a matcher that fires on
 * the safe thing manufactures the alarm fatigue that makes a reviewer stop reading.
 */
const HALO_PHRASES: readonly RegExp[] = [
  /\bregulated\s+in\s+liechtenstein\b/i,
  /\bfully\s+regulated\b/i,
  /\bfma[-\s]?(regulated|licen[cs]ed|approved)\b/i,
  /\b(the\s+)?(only|first)\s+regulated\b/i,
  /\bregulated\s+(exchange|platform|venue)\b/i,
];

/**
 * MiCA Art 81 read with the Art 3(1) definition: advice is reached by PERSONALISATION,
 * not by topic. An item in that regime cannot be made compliant inside a public reply —
 * Art 81(1) suitability and Art 81(2)'s "in good time before" are both unsatisfiable in
 * 280 characters to a stranger — so the only honest outcome is a `not_recoverable`
 * refusal, and adding "NFA" changes nothing, because the definition turns on what was
 * done rather than on how it was labelled.
 *
 * Literal second-person recommendations only. "Should I buy?" in the STRANGER's text is
 * not this: only our own words are scanned.
 */
const ADVICE_PHRASES: readonly RegExp[] = [
  /\byou\s+should\s+(buy|sell|hold|swap|stake|ape|allocate)\b/i,
  /\b(i|we)\s+(would\s+)?recommend\s+(you|that\s+you)\b/i,
  /\bin\s+your\s+(case|position|situation)\b/i,
  /\bmy\s+advice\s+(to\s+you\s+)?is\b/i,
];

/**
 * A cashtag. THE LIMIT OF THIS DETECTOR IS PRINTED ON THE SCREEN, because it is the
 * difference between a clean result and an unexamined one: `$LCX` is caught, a bare `LCX`
 * is not. Bare-ticker extraction is the engine's job and it needs the listed-asset table
 * to do it without inventing symbols out of ordinary words — which is exactly the mistake
 * `sanitise.ts` made when it redacted the bare word `ETH` and let scam handles through.
 */
const CASHTAG = /\$([A-Z][A-Z0-9]{1,9})\b/g;

export function namedAssets(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(CASHTAG)) out.add(m[1]);
  return [...out];
}

/* ── The pre-check pass ─────────────────────────────────────────────────────── */

export interface PreCheckInput {
  /** OUR text. Never the stranger's. */
  readonly text: string;
  readonly verb: EngagementVerb;
  /**
   * The operator's own declaration that this promotes an offer or an admission to
   * trading. Asked, not guessed: MiCA never defines "marketing communication" at Level
   * 1, so the classification is a recorded judgement, and a component that inferred it
   * would be inventing the one fact that pulls in the Art 7 elements.
   */
  readonly promotesOfferOrListing: boolean;
}

export function previewRefusals(input: PreCheckInput): Refusal[] {
  const { text, verb, promotesOfferOrListing } = input;
  const out: Refusal[] = [];
  const trimmed = text.trim();

  /* THE VERB, FIRST. Where the verb adopts the target's claims there is no text of ours
     to edit, so no amount of wording work reaches the exposure: the available outcomes
     are "do not do it" or "verify the target". Straight out of the shared adoption
     table — this file states no view of its own about it. */
  if (VERB_INHERITS_TARGET_RISK[verb]) {
    out.push(refuse(
      'ADOPTION_OF_UNVERIFIED_TARGET',
      VERB_PRODUCES_OWN_TEXT[verb]
        ? `A ${verb} republishes the target as well as saying something of ours, so the target's claims are partly ours too (${VERB_ADOPTION[verb].replace(/_/g, ' ')}).`
        : `A ${verb} produces no text of ours and adopts the target's claims in full (${VERB_ADOPTION[verb].replace(/_/g, ' ')}).`,
      cite('finra_rn_17_18', 'Q9',
        'By liking or sharing the favorable comments, the representative has adopted them and they are subject to the communications rules.'),
      {
        kind: 'not_recoverable',
        why: 'There are no words of ours to change. Verify the target against the claim library before the act, or choose a verb that does not adopt it — a factual correction adopts nothing (RN 17-18 Q11).',
      },
      null,
    ));
  }

  if (trimmed.length > X_POST_MAX_CHARS) {
    out.push(refuse(
      'LENGTH_BUDGET_EXCEEDED',
      `This is ${trimmed.length} characters and a standard post holds ${X_POST_MAX_CHARS}.`,
      cite('desk_policy', 'X standard post limit',
        'A standard (non-premium) X post holds 280 characters. LCX premium status is not knowable from inside this compartment, so 280 is the only limit this screen may assume — assuming the higher one would let a refusal be skipped silently.'),
      { kind: 'edit_text', what: `Cut ${trimmed.length - X_POST_MAX_CHARS} characters, or move the substance to a page and link to it.` },
      null,
    ));
  }

  if (promotesOfferOrListing) {
    out.push(refuse(
      'ART_7_BOILERPLATE_DOES_NOT_FIT',
      `A post promoting an offer or an admission to trading cannot be compliant: the mandated statement alone is ${ART_7_BUDGET.statementChars} characters and the post holds ${ART_7_BUDGET.postMax}.`,
      cite('mica', 'Art 7(1)(e)', ART_7_1_E_STATEMENT_PLATFORM_OPERATOR),
      {
        kind: 'different_surface',
        suggestion: 'Put the promotion on a page carrying the Art 7(1)(e) statement verbatim, the white-paper statement and the offeror contact details, and let the post link to it. This is arithmetic, so there is no wording that gets past it.',
      },
      null,
    ));

    /* Art 66(3) attaches the risk warning and the white-paper hyperlink to the CASP's own
       communications. ABSENCE is checked; PRESENCE is not certified — a link in the text
       is not proof it resolves to the right white paper, and this screen does not claim
       that it is. */
    if (!/https?:\/\/\S+/i.test(text)) {
      out.push(refuse(
        'ART_66_3_WHITE_PAPER_LINK_MISSING',
        "There is no hyperlink in this text, and a communication promoting an admission to trading has to carry one to the asset's white paper.",
        cite('mica', 'Art 66(3)',
          'Crypto-asset service providers shall include in their marketing communications a hyperlink to the crypto-asset white paper.'),
        {
          kind: 'edit_text',
          what: 'Add the white-paper link. That a link points at the RIGHT white paper is a judgement the engine and a human make; this check can only see whether one is present.',
        },
        null,
      ));
    }
  }

  for (const re of HALO_PHRASES) {
    const m = re.exec(text);
    if (!m) continue;
    out.push(refuse(
      'ESMA_REGULATORY_STATUS_AS_PROMOTION',
      `"${m[0]}" uses LCX's regulatory status as the selling point.`,
      cite('esma_halo', "DON'Ts",
        "The CASP's regulatory status is used as a promotional tool. All marketing communications should indicate clearly if a product and/or service offered by a CASP is regulated or not."),
      {
        kind: 'edit_text',
        what: 'Name the specific product or service and state whether THAT product is regulated. The status of the firm is not a feature of the asset, and this is the desk\'s highest-frequency exposure precisely because it is the house line.',
      },
      m[0],
    ));
    break;
  }

  for (const re of ADVICE_PHRASES) {
    const m = re.exec(text);
    if (!m) continue;
    out.push(refuse(
      'ART_81_PERSONALISED_RECOMMENDATION',
      `"${m[0]}" makes this a personalised recommendation.`,
      cite('mica', 'Art 81',
        "Providing advice on crypto-assets means offering, giving or agreeing to give personalised recommendations to a client, either at the client's request or on the initiative of the crypto-asset service provider."),
      {
        kind: 'not_recoverable',
        why: 'No wording makes this safe in a public reply: suitability under Art 81(1) and the "in good time before" duty under Art 81(2) cannot be met in a post, and a disclaimer does not change what was done. Answer the general question, or say nothing.',
      },
      m[0],
    ));
    break;
  }

  const assets = namedAssets(text);
  if (assets.length > 0) {
    /* THE INVISIBLE AXIS (doctrine rule 2). Not a wording finding, and not resolvable by
       reading the prose: an unannounced listing decision is inside information (Art
       87(1)(a)) and a bullish line about an asset the author holds is manipulation unless
       the position is disclosed simultaneously and publicly (Art 91(3)(c), personal fines
       from EUR 700 000). Both are answered by joins against registers this screen cannot
       read, and `unknown` is not `clear`. */
    out.push(refuse(
      'ASSET_STATE_UNKNOWN',
      `This names ${assets.map((a) => `$${a}`).join(', ')}, and neither the asset embargo register nor the author's holdings declaration is readable from this screen.`,
      cite('mica', 'Art 91(3)(c)',
        'A conflict of interest must be disclosed simultaneously to the public in a proper and effective way — a holdings register filed with compliance does not satisfy it, because the disclosure has to be in the post.'),
      {
        kind: 'supply_data',
        missing: "the asset's embargo state, and the declared positions of the author and the approver in it",
        whoCanSupply: "compliance and the owner — the registers themselves are the owner's and legal's to produce, not this compartment's to infer",
      },
      assets.map((a) => `$${a}`).join(' '),
    ));
  }

  return out;
}

/* ── Composition: what the drafting room actually renders ────────────────────── */

/**
 * THE ENGINE ANSWERS THIS SCREEN ACTUALLY GETS, per axis, tri-state per axis.
 *
 * ── WHY THIS REPLACED `ReviewVerdict` ─────────────────────────────────────────
 * `ReviewVerdict` was the shape of `POST /v1/marketing/review`, and NO ROUTER EVER
 * DECLARED THAT ROUTE. It was recorded as a known defect rather than found later
 * (`lib/api/marketing.ts MARKETING_CLIENT_OVERLAPS`), and its consequence was that the
 * drafting room's gates rendered `absent` on every environment — the correct outcome of
 * calling nothing, which is exactly why `Gate`'s `absent` source exists.
 *
 * The API built two narrower endpoints instead, and they are mounted and contracted:
 * `POST /regime` → `RegimeReading` and `POST /adoption` → `AdoptionReading`. So the axes
 * are now filled by the engines that own them, and the axes NOBODY answers are named
 * individually instead of being covered by one sentence about a route that never existed.
 *
 * `null` per field is load-bearing and is not the same as `[]`: `null` means that axis was
 * not examined, `[]` means the engine examined it and matched nothing. Collapsing the two
 * turns a missing endpoint into a green tick.
 */
export interface EngineGateVerdicts {
  /**
   * `packages/shared/src/marketing/claimSafety.ts checkClaimSafety` — 1 164 lines, and it
   * has NO ROUTE CALLER anywhere in `apps/api/src`. `POST /v1/marketing/claim-safety` is in
   * `MARKETING_CONTRACTS_OWED` and is not mounted, so this is `null` on every environment
   * today and the gate says so in those words.
   */
  readonly claimSafety: readonly Refusal[] | null;
  /** `POST /abuse-check` is likewise unmounted. The invisible axis stays unexamined. */
  readonly marketAbuse: readonly Refusal[] | null;
  /** From `RegimeReading.decision.refusals`, minus the Art 7 arithmetic. */
  readonly regime: readonly Refusal[] | null;
  /**
   * The Art 7 character arithmetic AS THE ENGINE COMPUTED IT. When this is non-null the
   * length gate stops being this screen's own estimate and becomes a verdict: the engine
   * measures on X's weighting, against the surface's real ceiling, over the mandated block
   * it assembled — none of which a component can do.
   */
  readonly lengthBudget: readonly Refusal[] | null;
  /** From `AdoptionReading.verdict.refusals` — what a like or a repost would adopt. */
  readonly adoption: readonly Refusal[] | null;
}

/**
 * Turn the engine answers (or their absences) plus the local previews into the five gates
 * the drafting room shows.
 *
 * THE RULE THIS FUNCTION EXISTS TO ENFORCE: a gate the engine did not answer renders as
 * `absent` with a sentence, never as an empty pass. `claim_safety` matters most, because
 * it is the entire ruleset about regulated promises and there is no honest browser-side
 * substitute for it.
 *
 * `engineAbsentBecause` IS NOW PER-AXIS rather than one string for all of them. One
 * sentence about a single missing endpoint was accurate when a single endpoint was missing;
 * with two axes answered and two unmounted it would have told an operator that a live
 * verdict had not been reached.
 */
export function composeGates(args: {
  pre: readonly Refusal[];
  engine: EngineGateVerdicts | null;
  /** Why an axis has no answer, in a sentence, keyed by gate. */
  absentBecause: Readonly<Record<GateReading['gate'], string>>;
}): GateReading[] {
  const { pre, engine, absentBecause } = args;
  const byCode = (...codes: RefusalCode[]) => pre.filter((r) => codes.includes(r.code));

  const gate = (
    g: GateReading['gate'],
    fromEngine: readonly Refusal[] | null | undefined,
    preview: readonly Refusal[],
  ): GateReading => {
    if (fromEngine) {
      return { gate: g, source: 'engine', refusals: [...fromEngine, ...preview], absentBecause: null };
    }
    if (preview.length > 0) {
      return { gate: g, source: 'preview', refusals: preview, absentBecause: absentBecause[g] };
    }
    return { gate: g, source: 'absent', refusals: [], absentBecause: absentBecause[g] };
  };

  return [
    gate(
      'claim_safety',
      engine?.claimSafety,
      byCode('ESMA_REGULATORY_STATUS_AS_PROMOTION', 'ART_81_PERSONALISED_RECOMMENDATION'),
    ),
    gate(
      'market_abuse',
      engine?.marketAbuse,
      byCode('ASSET_STATE_UNKNOWN', 'ADOPTION_OF_UNVERIFIED_TARGET'),
    ),
    gate('regime', engine?.regime, byCode('ART_66_3_WHITE_PAPER_LINK_MISSING')),
    /*
     * THE ONE GATE THAT WAS COMPLETE WITHOUT AN ENGINE, AND IS NO LONGER ONLY THAT.
     *
     * It used to be hard-coded `source: 'preview'` with the comment "arithmetic over two
     * constants … it is the only one that may". That was true of what this screen can
     * compute — `text.length` against `X_POST_MAX_CHARS` — and it was NOT the Art 7
     * arithmetic, which weighs characters X's way, uses the surface's real ceiling and
     * measures a mandated block this screen never sees. So when the engine answers, its
     * number wins and the source becomes `engine`; the local estimate stays as the
     * advisory fallback it always was.
     */
    gate(
      'length_budget',
      engine?.lengthBudget,
      /*
       * BOTH CODES, and the second one is here because dropping it was a live regression for
       * about twenty minutes: `ART_7_BOILERPLATE_DOES_NOT_FIT` used to ride on the `regime`
       * gate, and when the axes were re-cut it was removed from there and not added here — so
       * `previewRefusals` produced it and NO gate rendered it. A refusal computed and then
       * silently dropped is worse than one never computed, and `deskGates.test.tsx` now
       * asserts that every code this screen can emit lands on some gate.
       */
      byCode('LENGTH_BUDGET_EXCEEDED', 'ART_7_BOILERPLATE_DOES_NOT_FIT'),
    ),
    /*
     * THE VERB'S OWN GATE, which did not exist while the only engine call was a combined
     * "review". A like produces no words of ours and adopts everything the target said;
     * scoring that on the same axis as our wording is how "we only retweeted it" became a
     * defence nobody could check.
     */
    gate('adoption', engine?.adoption, byCode('ADOPTION_OF_UNVERIFIED_TARGET')),
  ];
}
