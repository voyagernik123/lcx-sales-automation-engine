/**
 * THE OUTBOUND GATE — the one place a draft is checked before a human can copy it.
 *
 * ══ WHY THIS FILE EXISTS ══
 * `claimSafety.checkClaimSafety` and `abuse.assessMarketAbuse` are 148KB of engine
 * between them, and until this file landed NOTHING CALLED EITHER ONE on a write path.
 * `POST /v1/marketing/:id/draft` generated reply text through the LLM and saved it, and
 * `POST /v1/marketing/draft/:id/approve` marked text approved for a human to paste into
 * X — both without consulting a single gate. The refusals existed, the rules were cited,
 * the tests passed, and the compartment produced outbound text with no check on it.
 *
 * That is the exact defect found in the GPS perimeter the week before: a gate existed and
 * no write path consulted it. An engine with no caller is decoration.
 *
 * ══ THE TWO GATES ARE NOT INTERCHANGEABLE, AND BOTH RUN ══
 * They answer different questions and neither subsumes the other:
 *
 *   - `checkClaimSafety` reads THE WORDS. Regulated promises, invented licences,
 *     unsubstantiated figures, missing risk warnings — MiCA Art 66(2)-(3) and the UCPD.
 *   - `assessMarketAbuse` reads THE STATE the words sit in. Whether the asset named is
 *     under embargo (Art 90), whether the author holds it (Art 91(3)(c)), whether the
 *     text restates a rumour (Art 91(2)(c)). None of that is visible in the prose.
 *
 * Doctrine rule 2: the dangerous axis is the invisible one. A wording review passes a
 * perfectly-worded bullish reply about a token the author owns, and that is the limb
 * carrying personal fines from EUR 700,000.
 *
 * ══ FAIL CLOSED, AND THIS IS VERIFIED RATHER THAN ASSUMED ══
 * The registers are loaded from `abuseRegister.ts`, which returns
 * `completeness: { kind: 'not_attested' }` when migration 0060 has not been applied.
 * `assessMarketAbuse` was then run against exactly that input to see what it does, and
 * it returns `disposition: 'refused'` with `EMBARGO_REGISTER_ABSENT` and
 * `HOLDINGS_DECLARATION_MISSING`. So an environment with no perimeter tables refuses to
 * produce outbound text rather than producing it unchecked. `unknown` is not `clear`.
 *
 * The gate additionally refuses if either engine THROWS: an exception inside a check is
 * not a pass. `gateOutboundText` never rejects — it resolves with a refusal — so a caller
 * cannot accidentally treat a thrown error as an absent verdict.
 *
 * ══ WHY `namedAssets` IS EXTRACTED HERE AND OVER-INCLUSIVELY ══
 * `assessMarketAbuse` does NOT extract symbols from text (abuse.ts:76) — it is GIVEN
 * `EngagementAct.namedAssets`. Nothing in the compartment extracted them, so the
 * asset limbs could only ever have been evaluated against an empty list, which reads as
 * "this text names no assets" and skips the two highest-consequence rules entirely.
 *
 * Taking the list from the CLIENT was rejected: it would put the drafter in charge of
 * whether the embargo check runs at all, on the one axis they have the most incentive to
 * skip. So it is extracted server-side, and deliberately OVER-inclusively: a token that
 * is not really a ticker adds an embargo lookup that resolves to `unknown`, and unknown
 * REFUSES. Over-matching therefore errs toward refusing, and under-matching errs toward
 * publishing inside information. Only one of those is survivable.
 *
 * WHAT THE EXTRACTOR CANNOT DO, stated plainly: it is lexical. It will not catch an
 * asset named in prose ("the Solana listing"), lowercase, or by a project name rather
 * than a ticker. `EXTRACTION_IS_LEXICAL` is exported so a surface can say so, and the
 * verdict carries `assetsExtracted` so a reviewer can see what the gate believed the
 * text was about. A gate that hid that would be worse than no gate.
 *
 * It DOES fold homoglyphs before matching (`SОL` with a Cyrillic О is read as `SOL`),
 * because a lookalike character was otherwise the cheapest way to make a ticker
 * invisible to the extractor while staying legible to every human reader. Folding is
 * over-inclusive in the same direction as everything else here, and the untouched
 * original text is what both engines read — the fold decides only which symbols get
 * looked up.
 *
 * ══ `flagged` IS NOT `clear`, AND THAT COST A REWRITE ══
 * This file previously computed `refused` from `refusals.length` alone. Both engines can
 * report an ERROR-severity violation with an empty refusal list —
 * `deal_closing.invitation_to_transact`, `obfuscation.mixed_script`,
 * `claim.requires_human_review`, `title_vi.directional_with_no_named_asset` — and
 * `checkClaimSafety` leaves `usableText` non-null in exactly that case. So a draft whose
 * own verdict said `flagged` was cleared, saved, returned 201, and written to the ledger
 * as `allowed: true, refusal_codes: []`. The ledger recorded "checked and cleared" for
 * text the engine had refused to call clear.
 *
 * An error violation now BLOCKS, `violations` is a field on the verdict, and both
 * outcomes carry it to the caller. Warning-severity findings still travel without
 * blocking: `art_88_1.disclosure_artefact_must_stay_clean` fires when Art 88(1) is
 * SATISFIED, and a gate that refused on it would be refusing compliance.
 */
import type { Pool } from 'pg';
import {
  VERB_ADOPTION,
  assessMarketAbuse,
  checkClaimSafety,
  type ArtefactIntent,
  type ClaimSafetyOutcome,
  type ContentSurface,
  type Disposition,
  type EngagementVerb,
  type MarketAbuseVerdict,
  type MarketingViolation,
  type Refusal,
  type SafetyChannel,
} from '@lcx/shared';
import { loadEmbargoRegister, loadHoldingsRegister, recordedSymbolsAmong } from './abuseRegister.js';

/** Said out loud on any surface that shows a clear verdict. */
export const EXTRACTION_IS_LEXICAL =
  'Asset symbols are matched lexically from the text. An asset named in prose, in lower '
  + 'case, or by project name rather than ticker is NOT detected, so a clear verdict on '
  + 'the market-abuse limbs means "clear for the symbols listed", never "clear". A '
  + 'one-character symbol written without the $ sigil is also not detected: the bare form '
  + 'requires two characters, because every standalone capital in ordinary prose would '
  + 'otherwise be looked up. Write $X to have a one-character symbol checked. Common words '
  + 'that are also tickers — LCX, GMT, ATH, NOW, CAN — are not extracted from their bare '
  + 'form on their own, but they ARE promoted and checked whenever this desk holds an '
  + 'embargo or holdings row naming them, so the presumption cannot hide an asset the desk '
  + 'has recorded. It can hide one the desk has not.';

/**
 * Tokens PRESUMED not to be tickers when written bare.
 *
 * ══ THIS LIST WAS FAIL-OPEN, AND `LCX` WAS THE WORST ENTRY IN IT ══
 * The rule was "only words that cannot be a listed symbol qualify", and five entries broke
 * it outright with real, currently-traded tokens: `LCX` (the house token, listed on LCX's own
 * exchange), `GMT` (STEPN), `ATH` (Aethir), `NOW` (ChangeNOW), `CAN` (CanYaCoin). The worst
 * was the first. `LCX deposits are open.` extracted `[]`, so `loadEmbargoRegister(pool, [])`
 * returned nothing and BOTH high-consequence limbs — Art 90 embargo and Art 91(3)(c)
 * holdings — never ran, on every gated route. `$LCX` was caught, so the whole evasion was
 * deleting one character, on the one symbol this desk is most likely to hold inside
 * information about.
 *
 * ══ THE FIX IS THE PROMOTION, NOT A SHORTER LIST — AND HERE IS THE WORKING ══
 * Deleting the five entries was tried first and it is the wrong fix. `loadEmbargoRegister`
 * reports `completeness: { kind: 'not_attested' }` and always will until the desk records an
 * attestation of its own, so absence from the register resolves to `unknown`, which REFUSES.
 * Extracting the bare word `LCX` therefore refuses every draft, every crisis statement and
 * every pre-cleared holding statement in `crisis.ts` — whose reviewed text says "LCX" by
 * design — until an approver keeps an in-date `clear` row for it. That is the 02:00 failure
 * this compartment has already had once, recorded in `marketingMemory.test.ts`: when the gate
 * refuses everything, humans stop using the gate, and the real risk goes UP.
 *
 * So the entries stay, and the list stops being the last word. `extractSuppressedCandidates`
 * hands back exactly what this filter removed, and `gateOutboundText` asks the registers
 * whether the desk has ACTUALLY RECORDED any of them (`recordedSymbolsAmong`). Anything it
 * has is promoted into `assets` and checked like any other symbol. A wrong entry is now a
 * delay, not a hole:
 *
 *   · LCX under embargo, recorded  → promoted → `ART_90_ASSET_UNDER_EMBARGO`. The exploit is
 *     closed on the case that carries the consequence, in both the bare and `$` forms.
 *   · a declared holding in LCX    → promoted → Art 91(3)(c) runs against the real author.
 *   · no row anywhere names it     → not promoted, and the register had nothing to say.
 *
 * ══ WHAT IS STILL NOT COVERED, STATED RATHER THAN IMPLIED ══
 * An embargo on a suppressed word that the desk has NOT recorded is not detected. That is a
 * weaker guarantee than the one every other symbol gets, where absence from an unattested
 * register refuses. Two things bound it. The register is the desk's own record, so "embargoed
 * and unrecorded" is a failure of the perimeter rather than of this filter — and it is the
 * failure `POST /perimeter` and the attestation work exist to close. And a STANCE about a
 * suppressed word cannot be cleared regardless: with no symbol extracted,
 * `title_vi.directional_with_no_named_asset` fires at `error` severity and blocks, which is
 * asserted behaviourally in `outboundGateRuns.test.ts` rather than trusted here.
 *
 * `EXTRACTION_IS_LEXICAL` says all of this on every surface that shows a verdict.
 *
 * ADDING AN ENTRY IS STILL A DECISION, not a way to quiet noise: the promotion covers
 * recorded symbols and nothing else. The `$` form is never filtered, here or anywhere — the
 * author typed the sigil.
 */
const NOT_TICKERS = new Set([
  'LCX', 'AND', 'THE', 'FOR', 'ARE', 'NOT', 'YOU', 'ALL', 'CAN', 'NEW', 'NOW', 'OUR',
  'API', 'URL', 'FAQ', 'CEO', 'CTO', 'KYC', 'AML', 'MICA', 'ESMA', 'FMA', 'GDPR',
  'USD', 'EUR', 'ATH', 'DYOR', 'NFA', 'AMA', 'TBA', 'TBD', 'PDF', 'UTC', 'GMT',
  'OK', 'NO', 'IT', 'IS', 'AT', 'ON', 'IN', 'TO', 'OF', 'BY', 'WE', 'AN', 'AS', 'IF',
  'HTTPS', 'HTTP', 'WWW', 'COM',
]);

/**
 * Latin lookalikes for the Cyrillic and Greek characters that appear in real tickers.
 *
 * WHY THIS IS NOT PARANOIA: `[A-Z][A-Z0-9]{1,19}` cannot span a non-ASCII codepoint, so
 * `SОL` with one Cyrillic О (U+041E) extracted to `[]`, `loadEmbargoRegister(pool, [])`
 * returned nothing, and both high-consequence limbs were skipped on a string every human
 * reads as SOL. Substituting one character was a complete bypass of the Art 90 join.
 *
 * Only characters that are visually identical to an ASCII capital are listed. A
 * substitution that a reader would notice is not this attack.
 */
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  // Cyrillic
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T',
  У: 'Y', Х: 'X', Ѕ: 'S', І: 'I', Ј: 'J', Ԛ: 'Q', Ԝ: 'W', Ғ: 'F',
  // Greek
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O',
  Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
  // Digits that read as letters in a ticker
  '０': '0', '１': '1',
};

/**
 * The string the extractor matches against. NFKC first (fullwidth and compatibility
 * forms), then the homoglyph fold. Not exported as a sanitiser: nothing downstream
 * receives this text. Both engines read `req.text` unchanged, so no fold can silently
 * alter the words a human is asked to approve.
 */
function foldForExtraction(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFKC')) out += HOMOGLYPHS[ch] ?? ch;
  return out;
}

/**
 * Candidate asset symbols in a piece of text.
 *
 * Two forms: `$SOL` (explicit, always taken) and a bare uppercase run of 2-20 characters
 * matching the 0060 `asset_symbol` CHECK. The bare form is filtered through
 * `NOT_TICKERS`; the `$` form never is, because the author typed the sigil.
 *
 * Matched over the homoglyph-folded text, so a lookalike ticker is looked up rather than
 * skipped. The claim gate independently raises `obfuscation.mixed_script` on the same
 * token, which now blocks — a mixed-alphabet ticker is therefore both looked up and
 * refused, and the operator is told which character to retype.
 */
export function extractNamedAssets(text: string): readonly string[] {
  const found = new Set<string>();
  const folded = foldForExtraction(text);
  for (const m of folded.matchAll(/\$([A-Za-z][A-Za-z0-9]{0,19})\b/g)) {
    found.add(m[1].toUpperCase());
  }
  for (const m of folded.matchAll(/\b([A-Z][A-Z0-9]{1,19})\b/g)) {
    if (!NOT_TICKERS.has(m[1])) found.add(m[1]);
  }
  return [...found];
}

/**
 * The bare tokens `NOT_TICKERS` REMOVED — the presumption's own working, handed back so it
 * can be checked instead of trusted.
 *
 * `gateOutboundText` passes these to `recordedSymbolsAmong` and promotes any that the desk
 * has actually recorded in the embargo or holdings registers. That inverts the failure mode
 * of a suppression list: a wrong entry used to mean an asset was never looked up, and now
 * means an asset is looked up one query later. A word with no row anywhere is still not
 * looked up, which is the case where the lookup has nothing to say.
 *
 * SIGIL FORMS ARE NOT INCLUDED. `$AND` is already in `extractNamedAssets` — it was never
 * filtered — so returning it here would double-count it in `assetsExtracted`.
 */
export function extractSuppressedCandidates(text: string): readonly string[] {
  const found = new Set<string>();
  const folded = foldForExtraction(text);
  for (const m of folded.matchAll(/\b([A-Z][A-Z0-9]{1,19})\b/g)) {
    if (NOT_TICKERS.has(m[1])) found.add(m[1]);
  }
  return [...found];
}

/** What a caller must say about the text it wants to put in front of a human. */
export interface OutboundGateRequest {
  readonly text: string;
  /** The act. `reply` for a queue answer; `original` for a desk-authored post. */
  readonly verb: EngagementVerb;
  readonly channel: SafetyChannel;
  /** The authenticated principal. Never a body field — the gate records who asked. */
  readonly actor: string;
  /** The phase this ran in, recorded with the refusals: 'draft' or 'clearance'. */
  readonly phase: 'draft' | 'clearance';
  readonly targetHandle?: string | null;
  readonly targetPermalink?: string | null;
  /**
   * What the artefact is FOR — the Art 88(1) input, and the ONE fact on this request the
   * gate cannot derive.
   *
   * It was previously hardcoded to `['marketing']`, which is not a member of
   * `ArtefactIntent` at all; the whole literal was cast `as never`, tsc said nothing, and
   * `checkDisclosureMixedWithMarketing` returned an empty result on its first line for
   * every call the compartment has ever made. Art 88(1) was dead in its only caller.
   *
   * Defaulted from the verb rather than left required, because a wrong default here must
   * be the CONSERVATIVE one: `inside_information_disclosure` is never inferred — nothing
   * in the text says whether the desk is the vehicle for a public disclosure, and guessing
   * it either way would be an invention. A caller that IS disclosing says so.
   */
  readonly intents?: readonly ArtefactIntent[];
  readonly now?: string;
}

/**
 * Verb → what the artefact is for, when the caller did not say.
 *
 * A queue answer is a `community_reply`; a desk-authored post is `promotional`, which is
 * the limb that combines with a disclosure under Art 88(1); a `correction` is its own
 * intent because FINRA RN 17-18 treats a factual correction as not adopting the target.
 */
const DEFAULT_INTENTS: Readonly<Record<EngagementVerb, readonly ArtefactIntent[]>> = {
  reply: ['community_reply'],
  quote: ['community_reply'],
  repost: ['community_reply'],
  like: ['community_reply'],
  original: ['promotional'],
  correction: ['correction'],
};

/** Verb → the surface the act happens on. `'x_reply'` was passed for years; it is not a
 * `ContentSurface` member, and the `as never` cast hid that too. */
const VERB_SURFACE: Readonly<Record<EngagementVerb, ContentSurface>> = {
  reply: 'reply',
  quote: 'quote_post',
  repost: 'quote_post',
  like: 'reply',
  original: 'original_post',
  correction: 'reply',
};

/**
 * The verdict. `allowed` is the ONLY field a caller should branch on, and `usableText`
 * is null whenever anything refused — there is no field on this object holding a
 * softened promise, which is doctrine rule 1 made structural.
 */
export interface OutboundGateVerdict {
  readonly allowed: boolean;
  readonly usableText: string | null;
  readonly disposition: Disposition;
  readonly refusals: readonly Refusal[];
  /**
   * Every non-refusing finding from both engines. THIS FIELD DID NOT EXIST, and its
   * absence is what made `flagged` indistinguishable from `clear` to every caller: the
   * engines computed these, the gate dropped them on the floor, and the 201 body omitted
   * them. An error-severity entry blocks; a warning travels.
   */
  readonly violations: readonly MarketingViolation[];
  /** The subset that caused `allowed: false`. Empty when nothing blocked on a violation. */
  readonly blockingViolations: readonly MarketingViolation[];
  /** Which symbols the gate believed the text named. Shown, never hidden. */
  readonly assetsExtracted: readonly string[];
  readonly extractionCaveat: string;
  /** Both sub-verdicts, so a surface can say WHICH gate refused. */
  readonly claimSafety: ClaimSafetyOutcome | null;
  readonly marketAbuse: MarketAbuseVerdict | null;
  /** Set when a gate threw. A thrown check is a refusal, never a pass. */
  readonly gateError: string | null;
}

/** The refusal used when a gate itself fails. Not a code the engines emit. */
function gateFailure(message: string, assets: readonly string[]): OutboundGateVerdict {
  return {
    allowed: false,
    usableText: null,
    disposition: 'refused',
    refusals: [{
      code: 'ASSET_STATE_UNKNOWN',
      sentence:
        'The outbound checks could not be completed, so this text cannot be released. '
        + 'An unavailable check is not a passed check.',
      rule: {
        instrument: 'desk_policy',
        provision: 'Outbound gate — fail closed',
        text:
          'Where the claim-safety or market-abuse check cannot be completed, the draft is '
          + 'refused. A check that did not run has not been passed.',
      },
      recovery: {
        kind: 'not_recoverable',
        why:
          'The gate itself did not complete. Nothing about the text is known to be wrong, and '
          + 'nothing about it is known to be right — rewording cannot resolve an absent check.',
      },
      matched: null,
      ruleSetVersion: 1,
    }],
    violations: [],
    blockingViolations: [],
    assetsExtracted: assets,
    extractionCaveat: EXTRACTION_IS_LEXICAL,
    claimSafety: null,
    marketAbuse: null,
    gateError: message,
  };
}

/**
 * Run both gates. Resolves with a refusal rather than throwing, so no caller can read a
 * thrown error as an absent verdict.
 */
export async function gateOutboundText(
  pool: Pool,
  req: OutboundGateRequest,
): Promise<OutboundGateVerdict> {
  const lexical = extractNamedAssets(req.text);
  const now = req.now ?? new Date().toISOString();
  /*
   * `assets` is `let` for exactly one reason: `gateFailure` in the catch below must report
   * whatever the gate believed the text named at the moment it broke, and the promotion step
   * happens inside the try. Assigning once, before the registers are read, keeps
   * `assetsExtracted` honest on both paths.
   */
  let assets: readonly string[] = lexical;

  try {
    /*
     * THE PRESUMPTION IS CHECKED BEFORE IT IS RELIED ON.
     *
     * `NOT_TICKERS` removed some uppercase words on the presumption that they are English.
     * That presumption held the house token for a whole phase, so it no longer gets the last
     * word: any suppressed word the desk has ACTUALLY recorded in either register is promoted
     * back into the lookup. One extra query, and only when the text contains a suppressed
     * ALL-CAPS token at all — lower-case prose never reaches the bare-form matcher.
     *
     * BEFORE the register loads, not after, because the loads are scoped to `assets` and a
     * promotion discovered afterwards would need a second round trip to be of any use.
     */
    const suppressed = extractSuppressedCandidates(req.text);
    const promoted = await recordedSymbolsAmong(pool, suppressed);
    if (promoted.length > 0) assets = [...new Set([...lexical, ...promoted])];

    // Scoped loads: only the symbols this text names, and only this actor's holdings.
    // A full-register read would pull every embargoed symbol into the request for a
    // draft that names one of them.
    const [embargoRegister, holdingsRegister] = await Promise.all([
      loadEmbargoRegister(pool, assets),
      loadHoldingsRegister(pool, { memberIds: [req.actor], symbols: assets }),
    ]);

    const claim = checkClaimSafety({
      text: req.text,
      channel: req.channel,
      verb: req.verb,
      claimIdsCited: [],
      topic: null,
      jurisdiction: 'eu',
      product: null,
      sourceText: null,
      substantiatedFigures: [],
      solvencyAttestationRef: null,
    });

    /*
     * NO `as never` ANYWHERE IN THIS LITERAL, and that is the fix rather than a style
     * preference. The cast covered four wrong fields at once: `actorId` for `actor`,
     * `'staff'` for a role that must be `author | approver | named_spokesperson`,
     * `'x_reply'` for a `ContentSurface` that has no such member, and `'marketing'` for an
     * `ArtefactIntent` that has no such member. Two of them were load-bearing —
     * `resolveHoldings(undefined, …)` returned `not_declared` forever, so every draft
     * naming any symbol refused with `…about BTC by undefined (staff)…` no matter what the
     * holdings register said, and Art 88(1) never ran at all. `as never` on a whole object
     * literal disables every field check inside it; if the shapes drift again, tsc says so.
     */
    const abuse = assessMarketAbuse({
      act: {
        verb: req.verb,
        targetPermalink: req.targetPermalink ?? null,
        targetHandle: req.targetHandle ?? null,
        author: req.actor,
        surface: VERB_SURFACE[req.verb],
        namedAssets: assets,
        adoption: VERB_ADOPTION[req.verb],
      },
      text: req.text,
      // The authenticated principal, as the AUTHOR — the role Art 91(3)(c) attaches to on
      // a draft. `assessMarketAbuse` adds `act.author` itself when a caller omits it, so
      // the earlier phantom entry did not remove the real check; it added a second,
      // unresolvable one beside it and refused on that.
      attributedActors: [{ actor: req.actor, role: 'author' }],
      declaredStance: null,
      intents: req.intents ?? DEFAULT_INTENTS[req.verb],
      linkPresent: /https?:\/\//.test(req.text),
      embargoRegister,
      holdingsRegister,
      disclosure: null,
      rumour: null,
      publishAt: null,
      now,
    });

    const refusals = [...claim.verdict.refusals, ...abuse.refusals];
    const violations = [...claim.verdict.violations, ...abuse.violations];
    /*
     * AN ERROR VIOLATION BLOCKS. Both engines set `severity: 'error'` on findings that
     * are not refusals only because the remedy is a routing step rather than a rewording
     * — "route it to the Art 7 element check BEFORE it is cleared", "this draft cannot be
     * cleared by its author alone", "retype the token in one script", "the two most
     * dangerous gates were skipped". Nothing routed any of them, and there is no second
     * surface to route them to, so treating them as advisory meant they were discarded.
     * Warnings are left non-blocking on purpose — one of them fires when Art 88(1) is
     * satisfied.
     */
    const blockingViolations = violations.filter((v) => v.severity === 'error');
    /*
     * EITHER GATE REFUSING IS A REFUSAL. Reading only `abuse.disposition` here would have
     * let a claim-safety refusal through whenever the market-abuse limbs happened to be
     * clear, which is most of the time — the words gate fires far more often than the
     * state gate. `usableText !== null` is the third condition rather than a substitute
     * for the other two: `checkClaimSafety` already nulls it on any refusal of its own,
     * but it knows nothing about the embargo register.
     */
    const refused = claim.verdict.disposition === 'refused'
      || abuse.disposition === 'refused'
      || refusals.length > 0;
    const allowed = !refused && blockingViolations.length === 0 && claim.usableText !== null;

    return {
      allowed,
      usableText: allowed ? claim.usableText : null,
      // `flagged` is reported as `flagged`, never rounded to `clear`: the ledger row and
      // the operator both need to see that something fired.
      disposition: refused
        ? 'refused'
        : blockingViolations.length > 0
          ? 'flagged'
          : claim.verdict.disposition === 'clear' ? abuse.disposition : claim.verdict.disposition,
      refusals,
      violations,
      blockingViolations,
      assetsExtracted: assets,
      extractionCaveat: EXTRACTION_IS_LEXICAL,
      claimSafety: claim,
      marketAbuse: abuse,
      gateError: null,
    };
  } catch (err) {
    return gateFailure(err instanceof Error ? err.message : String(err), assets);
  }
}

/** Named by the ledger table this writes to, so a grep for either finds both. */
export const GATE_MIGRATION = '0062_marketing_gate_decisions.sql';

let gateLedgerCache: boolean | null = null;

/** Test-only: forget the probe. */
export function _resetGateLedgerMigrated(): void {
  gateLedgerCache = null;
}

/**
 * Has 0062 landed here? Same three-state discipline as `service.ts migrationState`:
 * only a DEFINITIVE answer is cached, so one transient error does not pin the ledger
 * into "absent" for the life of the process.
 */
async function gateLedgerMigrated(pool: Pool): Promise<boolean> {
  if (gateLedgerCache !== null) return gateLedgerCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_outbound_gate_decision') IS NOT NULL AS ok`,
    );
    gateLedgerCache = Boolean(res.rows[0]?.ok);
    return gateLedgerCache;
  } catch {
    return false;
  }
}

/**
 * RECORD THE VERDICT — doctrine rule 5, nothing leaves without a record.
 *
 * WRITES BOTH OUTCOMES. A ledger holding only refusals cannot distinguish "the gate
 * cleared this" from "the gate never ran", and that conflation is the one this whole
 * compartment exists to prevent. "It was checked and cleared" is also the claim the desk
 * will have to defend under Art 8(2) produce-on-demand.
 *
 * A HASH, NOT THE TEXT. The gated bytes must be identifiable so a later approval ties to
 * the same draft, but a control ledger does not need a second copy of every draft — and
 * on the refusal path the text is precisely what should not be copied further.
 *
 * NEVER THROWS, AND THAT IS A DELIBERATE ORDERING CHOICE. The caller has already decided
 * to refuse by the time this runs, so letting a failed INSERT raise would convert a clean
 * 422-with-reasons into a 500, and the operator would lose the refusal that matters in
 * favour of an error about bookkeeping. The failure is logged. What must NOT happen — and
 * does not — is the reverse: a gate failure being read as a pass.
 */
export async function recordGateDecision(
  pool: Pool,
  input: {
    readonly replyId: number | null;
    readonly verdict: OutboundGateVerdict;
    readonly actor: string;
    readonly phase: 'draft' | 'clearance';
    readonly text: string;
  },
): Promise<boolean> {
  try {
    if (!(await gateLedgerMigrated(pool))) return false;
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(input.text, 'utf8').digest('hex');
    await pool.query(
      `INSERT INTO marketing_outbound_gate_decision
         (reply_id, phase, actor, allowed, disposition, text_sha256,
          assets_extracted, refusal_codes, violation_codes, gate_error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.replyId,
        input.phase,
        input.actor.trim() === '' ? 'unknown' : input.actor,
        input.verdict.allowed,
        input.verdict.disposition,
        hash,
        input.verdict.assetsExtracted,
        input.verdict.refusals.map((r) => r.code),
        // The BLOCKING ones only. A warning that travelled without stopping anything is
        // not why this row says allowed=false, and recording it here would make the
        // ledger unreadable on the one question it exists to answer.
        input.verdict.blockingViolations.map((v) => v.rule),
        input.verdict.gateError,
      ],
    );
    return true;
  } catch (err) {
    console.error('[marketing] gate decision not recorded:', err);
    return false;
  }
}
