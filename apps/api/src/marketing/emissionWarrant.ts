/**
 * THE EMISSION WARRANT — a token-incentivised campaign may not reach `approved` or
 * `live` until the Title VI engine has run over its own public text and over the
 * launcher's LCX position, and the result has been ledgered where it cannot be edited.
 *
 * ══ THIS ONE BLOCKS. `oneMouth.ts` BESIDE IT DOES NOT. ══
 * Shadow mode is for measuring the base rate on traffic nobody has ever gated. It does
 * not apply here, and the reason is the consequence: MiCA Art 91(3)(c) attaches
 * PERSONALLY, at roughly EUR 700,000, to the human who launches a promotion about an
 * asset they hold. A campaign that pays rewards in LCX is a promotion about LCX by
 * construction. There is no version of "let it through and count it" that is
 * survivable for the person whose name is on the launch.
 *
 * ══ WHAT THE CAMPAIGN'S "OWN PUBLIC TEXT" IS, EXACTLY ══
 * `composeCampaignPublicText` — `dist_campaigns.name`, then the published description,
 * then the task labels. Those three are what `GET /v1/distribution/campaigns/:id/export`
 * emits as `spec.title`, `spec.description` and `spec.tasks[].label`, i.e. the bytes a
 * human pastes into Galxe or Layer3. The composition is CANONICAL and the sha256 in the
 * warrant is over exactly it, because a warrant over "roughly the campaign text" is a
 * warrant over nothing: it could not later be checked against what was published.
 *
 * THE PUBLISHED DESCRIPTION IS NOT ALWAYS `detail`, AND THE FIRST VERSION OF THIS FILE
 * GOT THAT WRONG. The route emits `camp.detail ?? 'PayAgent distribution campaign — ' +
 * name`, so a campaign with a NULL detail still publishes a real sentence. The first
 * composition here contributed NO line in that case and also `.trim()`ed a detail that
 * was present, so for two ordinary campaigns the digest identified bytes nobody
 * publishes and `warrantCoversText` was false against the actual page.
 *
 * TWO DIFFERENT TESTS PIN THE TWO RULES, and they are different KINDS of test. The
 * fallback is pinned by SOURCE PARITY — `__tests__/emissionWarrant.test.ts` reads
 * `routes/distribution.ts` and asserts the prefix and the `??` are still in it — because
 * the claim is about another file. The verbatim rule is pinned BEHAVIOURALLY, by
 * "never edits the text it is about to warrant", which composes a padded detail and
 * compares the bytes and the digest; no amount of reading the route could establish it.
 *
 * THE TASK LABELS AND THE FALLBACK ARE MIRRORED, NOT IMPORTED, AND THAT IS A KNOWN SEAM.
 * `routes/distribution.ts` builds them inline inside the handler, so there is nothing
 * exported to import, and that file belongs to another lane. `CAMPAIGN_TASK_LABELS` and
 * `CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX` below therefore hold copies, and the
 * source-parity test asserts every label AND the fallback prefix still appear in the
 * route. A silent drift would mean the warrant covers text the platform never saw — so
 * the drift is made loud instead.
 *
 * ══ THE LAUNCHER'S LCX POSITION IS CHECKED SEPARATELY, AND HERE IS WHY ══
 * `gateOutboundText` extracts symbols server-side and runs the Art 91(3)(c) join on
 * them. `LCX` is in its `NOT_TICKERS` presumption list, so the bare word is extracted
 * ONLY IF the desk has already recorded an embargo or holdings row naming it
 * (`recordedSymbolsAmong`). That is the right trade for a tweet — extracting `LCX`
 * unconditionally would refuse every draft against a register that is `not_attested`
 * by design — and it is the WRONG trade here, because for a token-incentivised campaign
 * the emission asset is LCX whether or not the copy spells it out. `dist_campaign_create`
 * hardcodes `{ asset: 'LCX' }` in the export spec; the rewards are LCX by construction.
 *
 * So this module resolves `(launcher, 'LCX')` against the holdings register itself and
 * refuses on its own code. The gate's own limbs still run over the text and are still
 * load-bearing; this is an ADDITIONAL limb for the one asset the campaign is about, and
 * it does not depend on the copy having named it.
 *
 * ══ THE CAP DOES NOT EXIST, SO THE DEFAULT ANSWER IS NO ══
 * `DECLARED_EMISSION_CAP` is `null` and will stay `null` until an owner declares one.
 * The cap-less case therefore REFUSES. This platform has already shipped the
 * alternative once: `actions/registry.ts` computes
 * `emissionBudget({ projectedPaidLinks: budget, treasuryBudgetLcx: Math.max(budget, 1) })`
 * — the projection and the envelope are the same number, so `withinBudget` is true for
 * every input and the limb is arithmetically incapable of failing. A gate that cannot
 * fail is not a gate, and a gate compared against an absent cap is that gate.
 *
 * AND THE SAME DEFECT CAME BACK THROUGH THE DECLARATION ITSELF. `capLcx: NaN` made
 * `total > cap.capLcx` false for every input — the identical arithmetic hole, one level
 * up — and `JSON.stringify(NaN)` is `null`, so the immutable warrant recorded
 * `"capLcx":null` beside `"granted":true`, i.e. the permanent record of a launch
 * asserted the one state this module says must refuse. Nothing validated the single
 * number a human is asked to supply. `capDeclarationFaults` now does, and a declaration
 * that does not survive it is NOT A CAP: the arithmetic never sees it, and the refusal
 * names every fault rather than the first.
 *
 * AND A REJECTED DECLARATION IS NOT AN ABSENT ONE. Both leave `cap` null, so the limb fell
 * through to EMISSION_CAP_NOT_DECLARED — whose sentence opens "No owner has declared a
 * cap", which is false when one did and it was rejected, and which sends that owner to
 * declare a cap they have already declared. EMISSION_CAP_DECLARATION_INVALID was in the
 * union, in the RULES map, and emitted by nothing. It is the refusal that fires now, and
 * `capDeclarationFaults` on the warrant is how the immutable record keeps the two apart
 * after the fact.
 *
 * ══ THE WARRANT GOES IN `audit_log`, NOT IN A TABLE OF ITS OWN ══
 * As of `0070_audit_seal.sql` `audit_log` is hash-chained and append-only, enforced by
 * triggers: a row written there cannot afterwards be edited or deleted, which is the
 * entire property a warrant needs. NOTHING HERE UPDATES OR DELETES. A warrant that
 * turns out to be wrong is corrected by APPENDING a later one, and
 * `readEmissionWarrants` returns them newest-first so the correction is what a reader
 * sees first.
 *
 * Until 0070 is applied the rows are still appended and are still the record — they
 * simply are not yet tamper-evident, and `access/seal.ts` reports them as
 * AUDIT_SEAL_PRE_SEAL_UNVERIFIABLE rather than as intact. That is stated on the
 * warrant (`sealedAtWrite`) rather than assumed either way.
 */
import type { Pool } from 'pg';
import { resolveHoldings, type Disposition } from '@lcx/shared';
import { PENDING_MIGRATIONS } from '../db/migrationLedger.js';
import { loadHoldingsRegister } from './abuseRegister.js';
import { gateOutboundText, gateTextSha256 } from './outboundGate.js';

/** The audit action every warrant is written under. Grep-able, and stable. */
export const EMISSION_WARRANT_ACTION = 'marketing:emission_warrant';

/** `audit_log.entity` for a warrant — the same polymorphic subject type the launch
 *  gate and `analytic_reviews` already use for a campaign. */
export const EMISSION_WARRANT_ENTITY = 'dist_campaign';

/** The contract tag on the payload and in `audit_log.meta`, so a reader can tell which
 *  version of this check produced a row. */
export const EMISSION_WARRANT_CONTRACT = 'marketing.emission_warrant.v1';

/**
 * The asset a token-incentivised campaign emits.
 *
 * NOT INFERRED FROM THE COPY. `routes/distribution.ts` emits
 * `rewards: { asset: 'LCX', budget: … }` for every `token_incentivized` campaign and
 * `dist_campaigns.budget_lcx` is denominated in LCX by its own column name. A campaign
 * that rewards in something else would need a column to say so, and there is none — so
 * this constant is the schema's own assumption made explicit, not a guess.
 */
export const EMISSION_ASSET = 'LCX';

/** The two statuses the warrant governs. `measured` is after the fact; `draft` and
 *  `compliance_review` are before publication. */
export const WARRANT_REQUIRED_STATUSES: readonly string[] = ['approved', 'live'];

/**
 * The public task labels, mirrored from the keyless export in `routes/distribution.ts`.
 * See the file docblock for why this is a copy and what holds it honest.
 */
export const CAMPAIGN_TASK_LABELS: readonly string[] = [
  'Create a PayAgent payment link',
  'Get one link paid (verifiable on-chain)',
  'Hold ≥ required LCX',
];

/**
 * The description the export publishes when `dist_campaigns.detail` is NULL, mirrored
 * from `routes/distribution.ts` (`camp.detail ?? \`PayAgent distribution campaign — ${camp.name}\``).
 *
 * IT IS A REAL PUBLISHED SENTENCE, so it is gated and digested like any other. A
 * composition that contributed no line here would have produced a warrant over bytes
 * nobody publishes, and the description that DOES reach the public would have met no
 * check at all. The prefix is exported so the source-parity test can find it in the
 * route.
 */
export const CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX = 'PayAgent distribution campaign — ';

/** The published description for a campaign, `detail` or the route's fallback. */
export function campaignPublicDescription(campaign: {
  readonly name: string;
  readonly detail?: string | null;
}): string {
  const detail = campaign.detail;
  // `?? ` and NOT a truthiness test, because that is what the route does: an empty-string
  // detail publishes an empty description, and the digest has to be over that.
  return detail === null || detail === undefined
    ? `${CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX}${campaign.name}`
    : detail;
}

/** What the warrant's sha256 is over, named so it travels with the digest. */
export const WARRANT_TEXT_COMPOSITION: readonly string[] = [
  'dist_campaigns.name',
  `dist_campaigns.detail — or, when it is NULL, the published fallback `
  + `"${CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX}<name>" (routes/distribution.ts export spec)`,
  ...CAMPAIGN_TASK_LABELS.map((_, i) => `task_label[${i}]`),
];

/**
 * The campaign's own public text, canonically — the bytes the export publishes.
 *
 * NEWLINE-JOINED AND NEVER EDITED. Every line is present VERBATIM: no trim, no
 * normalisation, no dropping. This function may not edit the text it is about to
 * warrant, because the digest's only job is to identify what was published, and a digest
 * over tidied-up bytes identifies something else.
 *
 * WHAT THE FIRST VERSION DID INSTEAD, RECORDED BECAUSE IT SHIPPED: it `.trim()`ed
 * `detail` and contributed NO line when `detail` was NULL. The export trims nothing and
 * substitutes a real sentence, so for a campaign with padded detail, and for every
 * campaign with no detail at all, the warrant's digest did not match the published bytes
 * and `warrantCoversText` returned false against the actual page.
 */
export function composeCampaignPublicText(campaign: {
  readonly name: string;
  readonly detail?: string | null;
}): string {
  return [
    campaign.name,
    campaignPublicDescription(campaign),
    ...CAMPAIGN_TASK_LABELS,
  ].join('\n');
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE CAP
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A DECLARED cap on concurrent in-flight LCX emission.
 *
 * `basis` IS A LITERAL TYPE ON PURPOSE. The aggregate this module computes is
 * `SUM(budget_lcx) WHERE status IN ('approved','live')` — everything emitting RIGHT
 * NOW. A cap declared per quarter or per year is a different quantity and comparing it
 * against this aggregate would understate exposure by however many campaigns have
 * already been `measured`. Making the basis a one-member union means a periodic cap
 * cannot be passed in here at all; it would need its own aggregate, and inventing one
 * is not this module's decision.
 *
 * Provenance is required rather than optional: an unattributed number in a compliance
 * gate is a magic constant, and the whole point of the refusal below is that nobody has
 * yet put their name to one.
 */
export interface EmissionCapDeclaration {
  readonly capLcx: number;
  readonly basis: 'concurrent_in_flight';
  /** Who declared it. A person or a body, never 'system'. */
  readonly declaredBy: string;
  readonly declaredAt: string;
  /** The instrument that authorises it, e.g. a board minute or a treasury policy. */
  readonly instrument: string;
}

/**
 * THE CAP IS DECLARED, as of 2026-08-07. It was `null` until a human put a number to it,
 * and `null` was the correct value for as long as nobody had.
 *
 * WHAT THE NUMBER IS, AND WHAT IT IS NOT. It caps CONCURRENT IN-FLIGHT LCX — the sum of
 * `budget_lcx` over every token-incentivised campaign at `approved` or `live`, plus the one
 * being launched. It is a ceiling on STOCK, not on flow: a campaign reaching `completed`
 * returns its headroom. It is NOT a periodic or annual emissions budget, and `checkCap`
 * refuses a declaration whose `basis` says otherwise precisely because comparing a periodic
 * cap against a concurrent total would understate the exposure.
 *
 * WHY THE FIGURE HAS EIGHT DECIMALS, which no policy threshold would. The owner's intent
 * was USD 100,000 of simultaneous exposure, converted to LCX at the spot rate on the day.
 * The precision is an artefact of that conversion, not a precisely-chosen boundary.
 *
 * AND THE CONSEQUENCE OF THAT, STATED HERE BECAUSE NOTHING ELSE WILL SAY IT: THE CAP IS
 * ENFORCED IN LCX AND DOES NOT RE-PEG. As the LCX price moves, this ceiling stops being
 * USD 100,000 — it drifts up in dollar terms if LCX falls and down if LCX rises. That is a
 * deliberate consequence of there being NO LCX/USD RATE ANYWHERE IN THIS CODEBASE: the old
 * hardcoded 0.5 LCX/USD rate is one of the four fabricated figures this programme deleted
 * (plan section 4.5), and re-introducing one here — inside a market-abuse control carrying
 * Art 91(3)(c) personal liability — to keep a dollar peg would be the worse error by far.
 * Re-declare with a fresh `capLcx` and `declaredAt` when the dollar intent matters again.
 */
export const DECLARED_EMISSION_CAP: EmissionCapDeclaration | null = {
  capLcx: 6212723.65805169,
  basis: 'concurrent_in_flight',
  declaredBy: 'Nikhil Sharma (nikhil.sharma@lcx.com), founder',
  declaredAt: '2026-08-07T16:10:43.000Z',
  instrument:
    'Founder authority. No board minute and no separate written treasury policy stands behind '
    + 'this: the founder declared it directly, and it is recorded that way rather than dressed '
    + 'up as a policy instrument. Ceiling chosen as the LCX equivalent of USD 100,000 of '
    + 'simultaneous in-flight exposure at the spot rate on 2026-08-07; enforced in LCX and NOT '
    + 're-pegged as the price moves.',
};

/**
 * EVERY WAY A "DECLARED CAP" CAN FAIL TO BE ONE. Empty means it is a cap.
 *
 * The type says `capLcx: number` and `declaredBy: string`; the TYPE is not the check.
 * This module is reachable from a route handler, from a job, and from JavaScript, and a
 * `Number(req.body.cap)` upstream turns a typo into `NaN` without any of them noticing.
 * `NaN` is the dangerous one: `total > NaN` is false for every total, so the cap limb
 * becomes arithmetically incapable of failing — the exact `budget <= budget` shape this
 * file exists to replace — and `JSON.stringify(NaN)` is `null`, so the warrant would
 * record "no cap declared" beside "granted".
 *
 * `Infinity` is rejected for the same reason with a plainer motive: an infinite envelope
 * is an absent one, spelled differently.
 *
 * The provenance fields are checked because the interface's own docblock says they are
 * required — "an unattributed number in a compliance gate is a magic constant" — and
 * before this they were required by the type and by nothing else: `declaredBy: ''` was
 * accepted and the launch was granted.
 *
 * EVERY fault, not the first: an owner fixing one and re-running to find the next is how
 * a control gets abandoned.
 */
export function capDeclarationFaults(cap: EmissionCapDeclaration): readonly string[] {
  const faults: string[] = [];
  if (typeof cap.capLcx !== 'number' || !Number.isFinite(cap.capLcx)) {
    faults.push(
      `capLcx is ${typeof cap.capLcx === 'number' ? String(cap.capLcx) : typeof cap.capLcx}, `
      + 'which is not a finite number. A cap that is not a number cannot be exceeded by any '
      + 'emission, so the limb could never fail.',
    );
  } else if (cap.capLcx < 0) {
    faults.push(
      `capLcx is ${cap.capLcx}. A negative envelope is not an envelope: every emission `
      + 'exceeds it, including one of zero.',
    );
  }
  if (cap.basis !== 'concurrent_in_flight') {
    faults.push(
      `basis is ${JSON.stringify(cap.basis)} and the aggregate this module computes is `
      + 'concurrent in-flight LCX. Comparing a periodic cap against it would understate '
      + 'exposure by every campaign already measured.',
    );
  }
  const provenance: readonly [string, unknown][] = [
    ['declaredBy', cap.declaredBy],
    ['declaredAt', cap.declaredAt],
    ['instrument', cap.instrument],
  ];
  for (const [field, value] of provenance) {
    if (typeof value !== 'string' || value.trim() === '') {
      faults.push(
        `${field} is empty, so the number is unattributed. An unattributed number in a `
        + 'compliance gate is a magic constant, and nobody has put their name to this one.',
      );
    }
  }
  if (typeof cap.declaredAt === 'string' && cap.declaredAt.trim() !== ''
    && Number.isNaN(new Date(cap.declaredAt).getTime())) {
    faults.push(
      `declaredAt (${cap.declaredAt}) is not a date this runtime can read, so WHEN the cap `
      + 'was declared is unknown.',
    );
  }
  return faults;
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  REFUSALS
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * These are NOT members of the shared `RefusalCode` union, for the same reason
 * `GateReferenceRefusalCode` in `outboundGate.ts` and `RecordRefusalCode` in
 * `record.ts` are not: they are about the CAMPAIGN and the REGISTERS rather than about
 * the words in a draft, and `packages/shared` is not this lane's to widen.
 */
export type EmissionWarrantRefusalCode =
  /** The campaign register could not be read at all. Not "the trigger does not apply". */
  | 'EMISSION_CAMPAIGN_REGISTER_ABSENT'
  /** No campaign under that id. */
  | 'EMISSION_CAMPAIGN_NOT_FOUND'
  /** `token_incentivized` is not a boolean, so the trigger condition is UNKNOWN. */
  | 'EMISSION_TRIGGER_NOT_STATED'
  /** The Title VI engine refused the campaign's own public text. */
  | 'EMISSION_TITLE_VI_REFUSED'
  /** The engine could not complete. An unavailable check is not a passed check. */
  | 'EMISSION_TITLE_VI_UNAVAILABLE'
  /** The launcher holds the emission asset and is launching an emission of it. */
  | 'EMISSION_LAUNCHER_HOLDS_EMISSION_ASSET'
  /** No in-date declaration for (launcher, LCX). Silence is not 'declared none'. */
  | 'EMISSION_LAUNCHER_POSITION_UNDECLARED'
  /** The holdings register could not be read. */
  | 'EMISSION_LAUNCHER_POSITION_UNREADABLE'
  /** `token_incentivized` is true and `budget_lcx` is NULL: the amount is unknown. */
  | 'EMISSION_AMOUNT_NOT_STATED'
  /** This campaign's `budget_lcx` is negative: a meaningless quantity, not room. */
  | 'EMISSION_AMOUNT_NEGATIVE'
  /** The in-flight aggregate is negative, so the register holds a meaningless value. */
  | 'EMISSION_AGGREGATE_NEGATIVE'
  /** THE DEFAULT CASE. No owner has declared a cap, so nothing can be within one. */
  | 'EMISSION_CAP_NOT_DECLARED'
  /** A cap was passed and is not one: NaN/Infinity/negative, or unattributed. */
  | 'EMISSION_CAP_DECLARATION_INVALID'
  /** In-flight plus this campaign exceeds the declared cap. */
  | 'EMISSION_CAP_EXCEEDED'
  /** The in-flight aggregate could not be read. */
  | 'EMISSION_AGGREGATE_UNREADABLE'
  /** Some already-live token campaign states no budget, so the aggregate is a lower
   *  bound — and a lower bound compared against a cap can only ever pass. */
  | 'EMISSION_AGGREGATE_INCOMPLETE'
  /** The warrant could not be appended to the audit log, so there is no warrant. */
  | 'EMISSION_WARRANT_NOT_LEDGERED';

export interface EmissionWarrantRefusal {
  readonly code: EmissionWarrantRefusalCode;
  readonly sentence: string;
  readonly rule: string;
  readonly ruleText: string;
  readonly remedy: string;
}

const RULES: Record<EmissionWarrantRefusalCode, { rule: string; ruleText: string }> = {
  EMISSION_CAMPAIGN_REGISTER_ABSENT: {
    rule: 'house_doctrine — absent data refuses',
    ruleText:
      'Absent data refuses. A trigger condition that could not be read is UNKNOWN, and '
      + 'unknown must never resolve to "the gate does not apply".',
  },
  EMISSION_CAMPAIGN_NOT_FOUND: {
    rule: 'house_doctrine — three states are never collapsed',
    ruleText:
      'Not-loaded, present-but-withheld and genuinely-empty are three facts. A campaign '
      + 'that does not exist is a genuine absence and is reported as one.',
  },
  EMISSION_TRIGGER_NOT_STATED: {
    rule: 'house_doctrine — three states are never collapsed',
    ruleText:
      'A trigger condition that is neither true nor false is UNKNOWN, and unknown is not '
      + '"the gate does not apply". Reading a non-boolean as false would let a campaign '
      + 'reach approved or live with no warrant on the strength of a value nobody can '
      + 'interpret.',
  },
  EMISSION_AMOUNT_NEGATIVE: {
    rule: 'house_doctrine — placeholders must look like placeholders',
    ruleText:
      'A negative emission has no meaning on the concurrent-in-flight basis. It is a defect '
      + 'in the register, not headroom, and treating it as a measurement lets one data value '
      + 'satisfy any cap.',
  },
  EMISSION_AGGREGATE_NEGATIVE: {
    rule: 'house_doctrine — a gate that cannot fail is not a gate',
    ruleText:
      'A sum that is below zero means some row states a negative budget. Added to this '
      + 'campaign it produces a total that clears any cap, so the limb would be defeated by a '
      + 'single value in another campaign\'s row.',
  },
  EMISSION_CAP_DECLARATION_INVALID: {
    rule: 'house_doctrine — an inference is never laundered into a certainty',
    ruleText:
      'A declaration that is not a finite, non-negative, attributed number is not a declared '
      + 'cap. Accepting one would state the inference "a cap exists" as a certainty in a '
      + 'granted warrant — and a NaN cap cannot be exceeded by any emission, so the limb '
      + 'could never fail.',
  },
  EMISSION_TITLE_VI_REFUSED: {
    rule: 'MiCA Title VI (Art 88-91)',
    ruleText:
      'Market abuse: unlawful disclosure of inside information (Art 89-90), market '
      + 'manipulation including dissemination of misleading information (Art 91), and the '
      + 'prohibition on combining a disclosure to the public with the marketing of one\'s '
      + 'own activities (Art 88(1)).',
  },
  EMISSION_TITLE_VI_UNAVAILABLE: {
    rule: 'desk_policy — outbound gate fails closed',
    ruleText:
      'Where the claim-safety or market-abuse check cannot be completed, the artefact is '
      + 'refused. A check that did not run has not been passed.',
  },
  EMISSION_LAUNCHER_HOLDS_EMISSION_ASSET: {
    rule: 'MiCA Art 91(3)(c)',
    ruleText:
      'It is market manipulation for a person to take advantage of occasional or regular '
      + 'access to media to express an opinion about a crypto-asset while holding a '
      + 'position in it, without simultaneously disclosing that conflict in a proper and '
      + 'effective way. Liability under this limb is PERSONAL.',
  },
  EMISSION_LAUNCHER_POSITION_UNDECLARED: {
    rule: 'MiCA Art 91(3)(c)',
    ruleText:
      'The conflict must be known before it can be disclosed. An absent or expired '
      + 'declaration is silence, and silence is not a declaration of no position.',
  },
  EMISSION_LAUNCHER_POSITION_UNREADABLE: {
    rule: 'house_doctrine — an inference is never laundered into a certainty',
    ruleText:
      'If you cannot know, say you cannot know. An unreadable holdings register yields '
      + 'unknown, and unknown does not clear an Art 91(3)(c) limb.',
  },
  EMISSION_AMOUNT_NOT_STATED: {
    rule: 'house_doctrine — absent data refuses',
    ruleText:
      'Absent data refuses; it never renders 0. A token-incentivised campaign whose LCX '
      + 'budget is NULL has an UNKNOWN emission, and an unknown quantity cannot be shown '
      + 'to be within any envelope.',
  },
  EMISSION_CAP_NOT_DECLARED: {
    rule: 'house_doctrine — a gate that cannot fail is not a gate',
    ruleText:
      'A comparison against an absent limit passes for every input. This platform has '
      + 'shipped that once already (budget <= budget in the campaign launch limb), so an '
      + 'undeclared cap refuses rather than clears.',
  },
  EMISSION_CAP_EXCEEDED: {
    rule: 'desk_policy — declared emission envelope',
    ruleText:
      'Concurrent in-flight LCX emission, plus the emission this campaign would add, '
      + 'must not exceed the cap an owner has declared on that basis.',
  },
  EMISSION_AGGREGATE_UNREADABLE: {
    rule: 'house_doctrine — absent data refuses',
    ruleText:
      'An aggregate that could not be read is not an aggregate of zero. Refusing is the '
      + 'only direction in which a failed read cannot become a granted launch.',
  },
  EMISSION_AGGREGATE_INCOMPLETE: {
    rule: 'house_doctrine — an inference is never laundered into a certainty',
    ruleText:
      'A sum over rows some of which state no amount is a LOWER BOUND. Comparing a lower '
      + 'bound against a cap can only ever pass, which is the same defect as comparing '
      + 'against an absent cap.',
  },
  EMISSION_WARRANT_NOT_LEDGERED: {
    rule: 'MiCA Art 68(9) / house doctrine — nothing leaves without a record',
    ruleText:
      'Records shall be sufficient to enable competent authorities to ascertain '
      + 'compliance. A warrant that exists only in a process\'s memory is not a record, so '
      + 'a failed append is a refusal rather than a footnote.',
  },
};

export const EMISSION_WARRANT_REFUSAL_CODES =
  Object.keys(RULES) as EmissionWarrantRefusalCode[];

function refusal(
  code: EmissionWarrantRefusalCode,
  sentence: string,
  remedy: string,
): EmissionWarrantRefusal {
  return { code, sentence, ...RULES[code], remedy };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE WARRANT
 * ════════════════════════════════════════════════════════════════════════════ */

/** How the launcher's position in the emission asset resolved. */
export type LauncherPositionState =
  | 'declared_none'
  | 'declared_holding'
  | 'not_declared'
  | 'register_absent'
  | 'unreadable';

/**
 * The record. Written to `audit_log.meta` verbatim except for `refusals`, whose
 * sentences are long and whose codes are the part a query needs.
 *
 * NO TEXT FIELD, ON PURPOSE. The digest identifies the bytes; a warrant is a control
 * record and does not need a second copy of the campaign copy. What it DOES carry is
 * `textComposition`, because a digest whose composition is unstated cannot be
 * recomputed by anybody checking it later.
 */
export interface EmissionWarrant {
  readonly contract: typeof EMISSION_WARRANT_CONTRACT;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly targetStatus: string;
  readonly launcher: string;
  readonly observedAt: string;
  readonly textSha256: string;
  readonly textChars: number;
  readonly textComposition: readonly string[];
  /** The gate's own disposition over the campaign's public text. */
  readonly gateDisposition: Disposition;
  /** The UNSCOPED codes from the gate — the Art 90 limb included. */
  readonly gateRefusalCodes: readonly string[];
  readonly gateBlockingViolations: readonly string[];
  readonly assetsExtracted: readonly string[];
  readonly gateError: string | null;
  readonly launcherPosition: LauncherPositionState;
  readonly launcherPositionNarrative: string;
  /**
   * `null` when no cap is declared, which is today's answer — AND ALSO when a declaration
   * was supplied and rejected, in which case `capDeclarationFaults` is non-empty and says
   * so. The two are distinguished by that field and never by this one, because a `null`
   * here must always mean "the arithmetic had no cap to use".
   *
   * ONLY EVER A FINITE NUMBER OR NULL. `JSON.stringify` writes NaN and Infinity as
   * `null`, so an unvalidated value here would make the immutable record say "no cap"
   * beside "granted".
   */
  readonly capLcx: number | null;
  readonly capBasis: 'concurrent_in_flight' | null;
  /** Why a supplied declaration was not treated as a cap. Empty when none was supplied,
   *  or when the one supplied is valid. */
  readonly capDeclarationFaults: readonly string[];
  /** LCX already committed by approved/live token campaigns other than this one. */
  readonly emissionInFlightLcx: number | null;
  /** True when that aggregate is a lower bound. */
  readonly emissionInFlightIsLowerBound: boolean;
  readonly thisCampaignLcx: number | null;
  readonly refusalCodes: readonly EmissionWarrantRefusalCode[];
  readonly granted: boolean;
  /** Was the audit log hash-chained at the moment this was written? */
  readonly sealedAtWrite: boolean;
  /** The `audit_log.id` this warrant occupies, or null if the append failed. */
  readonly auditRowId: string | null;
}

/**
 * THREE OUTCOMES, AS A UNION, so no caller can read a boolean the wrong way round.
 *
 * `not_applicable` is NOT `granted`. A non-token campaign needs no warrant and must not
 * be recorded as holding one — a later reader asking "which live campaigns have a
 * warrant" would otherwise be told yes about a campaign nothing checked.
 */
export type EmissionWarrantDecision =
  | {
    readonly outcome: 'not_applicable';
    readonly why: string;
    readonly tokenIncentivized: boolean | null;
    readonly targetStatus: string;
  }
  | { readonly outcome: 'granted'; readonly warrant: EmissionWarrant }
  | {
    readonly outcome: 'refused';
    /** EVERY refusal, not the first one found. */
    readonly refusals: readonly EmissionWarrantRefusal[];
    /** `null` only when the campaign row itself could not be read. */
    readonly warrant: EmissionWarrant | null;
  };

/** The one predicate a caller needs. `not_applicable` may proceed; `refused` may not. */
export function mayReachStatus(decision: EmissionWarrantDecision): boolean {
  return decision.outcome !== 'refused';
}

function isMissingTable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

/** A numeric column that arrives as a decimal string, or `null` — never a fabricated 0. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface CampaignRow {
  id: unknown;
  name: unknown;
  detail: unknown;
  token_incentivized: unknown;
  budget_lcx: unknown;
  status: unknown;
}

export interface EmissionWarrantInput {
  readonly campaignId: string;
  /** The status the caller is trying to move the campaign to. */
  readonly targetStatus: string;
  /** The authenticated principal performing the launch. Never a body field. */
  readonly launcher: string;
  readonly now?: string;
  /**
   * The declared cap. Defaults to `DECLARED_EMISSION_CAP`, which is `null`.
   *
   * A PARAMETER RATHER THAN A HARDCODED READ so an owner can declare one in a single
   * place later, and so the within-cap and over-cap limbs are testable at all. Passing
   * `null` explicitly is the same as passing nothing: it refuses.
   */
  readonly cap?: EmissionCapDeclaration | null;
}

/**
 * Evaluate — and, whatever the answer, LEDGER — the emission warrant for one campaign.
 *
 * The order of the limbs is deliberate: everything that can be known is computed BEFORE
 * anything is decided, so the warrant records the whole picture even on the refusal
 * path. A refusal that only says "no cap" while the Title VI engine also refused would
 * send an operator to fix the wrong thing.
 */
export async function evaluateEmissionWarrant(
  pool: Pool,
  input: EmissionWarrantInput,
): Promise<EmissionWarrantDecision> {
  const now = input.now ?? new Date().toISOString();
  /*
   * A DECLARATION IS NOT A CAP UNTIL IT SURVIVES `capDeclarationFaults`. `cap` below is
   * the only thing the arithmetic ever sees, and it is `null` both when nothing was
   * declared and when what was declared is not a number a limb could fail against. The
   * faults travel onto the warrant so the immutable record says which of the two it was.
   */
  const declaredCap = input.cap === undefined ? DECLARED_EMISSION_CAP : input.cap;
  const capFaults = declaredCap === null ? [] : capDeclarationFaults(declaredCap);
  const cap = declaredCap !== null && capFaults.length === 0 ? declaredCap : null;
  const refusals: EmissionWarrantRefusal[] = [];

  /* ── 1. The trigger condition, read SERVER-SIDE from the column that holds it ──
   *
   * `token_incentivized` is a column on `dist_campaigns` (0043_distribution.sql:39),
   * NOT a field on this request. A caller cannot suppress the warrant by omitting it,
   * for the same reason `gateOutboundText` extracts symbols itself: on the one axis a
   * launcher has the most incentive to skip, the fact is taken from the database.
   */
  let row: CampaignRow | null;
  try {
    const res = await pool.query<CampaignRow>(
      `SELECT id::text AS id, name, detail, token_incentivized, budget_lcx, status
         FROM dist_campaigns WHERE id = $1`,
      [input.campaignId],
    );
    row = res.rows[0] ?? null;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    return {
      outcome: 'refused',
      warrant: null,
      refusals: [refusal(
        'EMISSION_CAMPAIGN_REGISTER_ABSENT',
        'There is no dist_campaigns relation on this environment, so whether this campaign is '
        + 'token-incentivised cannot be read. That is not a finding that it is not — it is a '
        + 'statement that the trigger condition is UNKNOWN, and an unknown trigger condition '
        + 'refuses.',
        'Apply 0043_distribution.sql. Until then no campaign may be advanced to approved or '
        + 'live on this environment, because nothing here can tell a token campaign from a '
        + 'content one.',
      )],
    };
  }

  if (row === null) {
    return {
      outcome: 'refused',
      warrant: null,
      refusals: [refusal(
        'EMISSION_CAMPAIGN_NOT_FOUND',
        `No campaign exists under id ${input.campaignId}. The register was read and this is a `
        + 'genuine absence, not an unavailable answer.',
        'Check the id. A status transition on a campaign that does not exist is a bug in the '
        + 'caller, not a compliance finding.',
      )],
    };
  }

  /*
   * THREE STATES, AND THE FIRST VERSION HAD TWO. `row.token_incentivized === true` sent
   * NULL, the string 'true', and anything a driver shape change produced down the
   * `not_applicable` branch — which `mayReachStatus` returns TRUE for, so an UNKNOWN
   * trigger let the campaign reach approved/live with no warrant at all. That is the
   * precise failure `EMISSION_CAMPAIGN_REGISTER_ABSENT` exists to prevent, one level up
   * and inverted. Only the literal `false` may mean "the gate does not apply".
   */
  const trigger = row.token_incentivized;
  const tokenIncentivized = typeof trigger === 'boolean' ? trigger : null;
  const campaignName = String(row.name ?? '');

  if (!WARRANT_REQUIRED_STATUSES.includes(input.targetStatus)) {
    return {
      outcome: 'not_applicable',
      tokenIncentivized,
      targetStatus: input.targetStatus,
      why:
        `The warrant governs the transitions to ${WARRANT_REQUIRED_STATUSES.join(' and ')} — the `
        + `points at which a campaign becomes public. ${input.targetStatus} is not one of them, so `
        + 'no warrant is required and none has been granted. This is NOT a cleared warrant.',
    };
  }

  if (tokenIncentivized === null) {
    return {
      outcome: 'refused',
      warrant: null,
      refusals: [refusal(
        'EMISSION_TRIGGER_NOT_STATED',
        `dist_campaigns.token_incentivized for this campaign is ${JSON.stringify(trigger)}, which is `
        + 'not a boolean. Whether the campaign emits LCX is therefore UNKNOWN, and unknown does not '
        + 'mean no: reading it as false would advance a possibly token-incentivised campaign to '
        + `${input.targetStatus} with no warrant and no Art 91(3)(c) check on the launcher.`,
        'Set token_incentivized to true or false on the campaign row. If the value came back in an '
        + 'unexpected shape from a readable row, the driver or the column type changed and that is '
        + 'a defect to fix before any campaign is advanced.',
      )],
    };
  }

  if (tokenIncentivized === false) {
    return {
      outcome: 'not_applicable',
      tokenIncentivized,
      targetStatus: input.targetStatus,
      why:
        'dist_campaigns.token_incentivized is false for this campaign, so it emits no LCX and the '
        + 'Art 91(3)(c) position limb has nothing to attach to. The flag was read from the '
        + 'database rather than from the request. NOTE that this says nothing about the campaign\'s '
        + 'COPY: a shadow-mode Title VI engine over campaign text EXISTS (marketing/oneMouth.ts) '
        + 'and is NOT WIRED into any send or launch path, so this campaign\'s copy has met no check '
        + 'at all.',
    };
  }

  /* ── 2. The Title VI engine over the campaign's own public text ──────────── */

  const text = composeCampaignPublicText({ name: campaignName, detail: row.detail as string | null });
  /*
   * The digest is computed by the SAME function the 0062 gate ledger and the
   * `gate:<16 hex>` reference use, so a warrant, a gate verdict and a shadow observation
   * over these bytes all join on one value. Two independent hash expressions would drift
   * and the drift would be silent.
   */
  const textSha256 = await gateTextSha256(text);

  const verdict = await gateOutboundText(pool, {
    text,
    // A desk-authored public artefact, not a reply. `gateOutboundText` maps this to
    // surface `original_post`; `campaign_landing_copy` would be the truer ContentSurface
    // and is unreachable from here because the gate derives surface from the verb and
    // that file is not this lane's to change. The difference affects SURFACE_CLASS only.
    verb: 'original',
    channel: 'web_page',
    // The LAUNCHER is the author for Art 91(3)(c) purposes: they are the person putting
    // this in front of the public.
    actor: input.launcher,
    phase: 'clearance',
    now,
  });

  if (verdict.gateError !== null) {
    refusals.push(refusal(
      'EMISSION_TITLE_VI_UNAVAILABLE',
      `The Title VI check over this campaign's public text could not be completed: `
      + `${verdict.gateError}. Nothing about the copy is known to be wrong, and nothing about it `
      + 'is known to be right.',
      'Retry. An unavailable check is not a passed check, so the campaign stays where it is until '
      + 'the check completes.',
    ));
  } else if (!verdict.allowed) {
    refusals.push(refusal(
      'EMISSION_TITLE_VI_REFUSED',
      `The Title VI engine refused this campaign's own public text (`
      + `${verdict.assetsExtracted.length === 0
        ? 'no asset symbols were extracted from it'
        : `symbols extracted server-side: ${verdict.assetsExtracted.join(', ')}`}`
      + `). Codes: ${[...verdict.ledgerOnly.refusalCodes,
        ...verdict.blockingViolations.map((v) => v.rule)].join(', ') || 'none named'}.`,
      'Read the codes above against the campaign name, detail and task labels — those three are '
      + 'what was checked. Editing the campaign changes the digest, so a new warrant must be '
      + 'obtained afterwards; the refused one stays in the ledger.',
    ));
  }

  /* ── 3. The launcher's position in the emission asset ─────────────────────── */

  let launcherPosition: LauncherPositionState = 'unreadable';
  let launcherNarrative = '';
  try {
    const register = await loadHoldingsRegister(pool, {
      memberIds: [input.launcher],
      symbols: [EMISSION_ASSET],
    });
    const resolution = resolveHoldings(input.launcher, EMISSION_ASSET, register, now);
    launcherNarrative = resolution.narrative;
    launcherPosition = resolution.state === 'declared_none'
      ? 'declared_none'
      : resolution.state === 'declared_holding'
        ? 'declared_holding'
        : resolution.state === 'register_absent' ? 'register_absent' : 'not_declared';
  } catch (err) {
    launcherPosition = 'unreadable';
    launcherNarrative = err instanceof Error ? err.message : String(err);
  }

  if (launcherPosition === 'declared_holding') {
    refusals.push(refusal(
      'EMISSION_LAUNCHER_HOLDS_EMISSION_ASSET',
      `${input.launcher} has declared a position in ${EMISSION_ASSET} and is launching a campaign `
      + `that emits ${EMISSION_ASSET}. ${launcherNarrative} Art 91(3)(c) liability is personal, `
      + 'and this is the limb no wording review can see.',
      `Either the launch is performed by somebody with no ${EMISSION_ASSET} position, or the `
      + 'conflict is disclosed properly and effectively in the campaign artefact itself and the '
      + 'disclosure is reviewed on its own terms. This gate cannot assess a disclosure it has not '
      + 'been shown.',
    ));
  } else if (launcherPosition !== 'declared_none') {
    refusals.push(refusal(
      launcherPosition === 'unreadable'
        ? 'EMISSION_LAUNCHER_POSITION_UNREADABLE'
        : 'EMISSION_LAUNCHER_POSITION_UNDECLARED',
      launcherPosition === 'unreadable'
        ? `The staff holdings register could not be read, so whether ${input.launcher} holds `
          + `${EMISSION_ASSET} is unknown: ${launcherNarrative}`
        : `There is no in-date declaration of ${input.launcher}'s ${EMISSION_ASSET} position. `
          + `${launcherNarrative} This limb is checked here rather than left to the text gate `
          + `because ${EMISSION_ASSET} is on that gate's not-a-ticker presumption list and is only `
          + 'extracted from bare copy when the desk has already recorded a row naming it — while a '
          + 'token-incentivised campaign emits it whether the copy says so or not.',
      launcherPosition === 'unreadable'
        ? 'Retry, and if it persists the register is unreadable and no token campaign may launch '
          + 'until it is.'
        : `${input.launcher} declares their ${EMISSION_ASSET} position (holding or none) in the `
          + 'marketing holdings register, and it must be in date. An expired declaration is not a '
          + 'declaration: a position can be opened after one was made.',
    ));
  }

  /* ── 4. The budget limb ──────────────────────────────────────────────────── */

  const thisCampaignLcx = num(row.budget_lcx);
  if (thisCampaignLcx === null) {
    refusals.push(refusal(
      'EMISSION_AMOUNT_NOT_STATED',
      'This campaign is token-incentivised and states no LCX budget, so how much it would emit is '
      + 'UNKNOWN. An unknown quantity is not zero and cannot be shown to be inside any envelope.',
      'Set budget_lcx on the campaign. If the number genuinely is not decided yet, the campaign is '
      + 'not ready to be approved.',
    ));
  } else if (thisCampaignLcx < 0) {
    /*
     * `dist_campaigns.budget_lcx` is a bare `numeric` with no CHECK (0043:39), so this is
     * a value the database will happily hold. Read as a measurement it satisfies any cap
     * on its own — the same "a gate that cannot fail is not a gate" defect, arriving as
     * data instead of as code.
     */
    refusals.push(refusal(
      'EMISSION_AMOUNT_NEGATIVE',
      `This campaign states an LCX budget of ${thisCampaignLcx}. A negative emission has no meaning `
      + 'on the concurrent-in-flight basis, so this is a defect in the row rather than headroom — '
      + 'and taken at face value it would clear any declared cap by itself.',
      'Correct budget_lcx on the campaign. dist_campaigns.budget_lcx has no CHECK constraint, so '
      + 'nothing at the storage layer prevented this; a migration adding `CHECK (budget_lcx >= 0)` '
      + 'belongs to whoever owns 0043\'s table.',
    ));
  }

  let inFlight: number | null = null;
  let inFlightIsLowerBound = false;
  try {
    const res = await pool.query<{ total: unknown; unstated: unknown; n: unknown }>(
      /*
       * OTHER campaigns only (`id <> $1`). Including this one would put its budget on
       * both sides of the comparison, which is exactly the `budget <= budget` shape the
       * file docblock records; the campaign's own emission is added ONCE, below, in
       * TypeScript where it is visible.
       */
      `SELECT COALESCE(SUM(budget_lcx), 0) AS total,
              COUNT(*) FILTER (WHERE budget_lcx IS NULL) AS unstated,
              COUNT(*) AS n
         FROM dist_campaigns
        WHERE token_incentivized = true
          AND status IN ('approved', 'live')
          AND id <> $1`,
      [input.campaignId],
    );
    inFlight = num(res.rows[0]?.total);
    inFlightIsLowerBound = (num(res.rows[0]?.unstated) ?? 0) > 0;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    inFlight = null;
  }

  if (inFlight === null) {
    refusals.push(refusal(
      'EMISSION_AGGREGATE_UNREADABLE',
      'The in-flight emission aggregate over approved and live token campaigns could not be read, '
      + 'so what this campaign would be added TO is unknown. That is a failed read, not an '
      + 'aggregate of zero.',
      'Retry. Refusing is the only direction in which a failed read cannot become a granted '
      + 'launch.',
    ));
  }
  if (inFlight !== null && inFlight < 0) {
    refusals.push(refusal(
      'EMISSION_AGGREGATE_NEGATIVE',
      `The in-flight total over other approved and live token campaigns is ${inFlight}, so at least `
      + 'one of those rows states a negative LCX budget. A sum below zero is not room: added to this '
      + `campaign's ${thisCampaignLcx === null ? 'unstated' : thisCampaignLcx} LCX it would produce a `
      + 'total that clears any cap, which means one value in another campaign\'s row would defeat '
      + 'this limb for every launch after it.',
      'Find and correct the approved or live token campaigns whose budget_lcx is negative '
      + '(`SELECT id, name, budget_lcx FROM dist_campaigns WHERE token_incentivized AND status IN '
      + '(\'approved\',\'live\') AND budget_lcx < 0`). The column has no CHECK constraint, so the '
      + 'register cannot be trusted to hold quantities until it does.',
    ));
  }
  if (inFlight !== null && inFlightIsLowerBound) {
    refusals.push(refusal(
      'EMISSION_AGGREGATE_INCOMPLETE',
      `At least one approved or live token campaign states no LCX budget, so the in-flight total of `
      + `${inFlight} is a LOWER BOUND. Compared against a cap, a lower bound can only ever pass — `
      + 'which is the same defect as comparing against no cap at all.',
      'Set budget_lcx on every approved and live token-incentivised campaign, or pause the ones '
      + 'that cannot state a number. Until then this limb cannot answer.',
    ));
  }

  /*
   * THE CAP LIMB. Checked LAST and unconditionally: an absent cap refuses even when
   * every other limb is clean, and even when the aggregate is zero. A zero aggregate
   * under no cap is not "plenty of room" — it is an unbounded envelope.
   */
  if (capFaults.length > 0) {
    /*
     * A REJECTED DECLARATION IS NOT AN ABSENT ONE, AND THE FIRST VERSION SAID IT WAS.
     *
     * `cap` is null in both cases, so the limb fell through to EMISSION_CAP_NOT_DECLARED —
     * whose sentence opens "No owner has declared a cap". That is false when an owner
     * declared one and it was rejected, and it sends them to declare a cap they have already
     * declared instead of to the fault in the one they supplied. It also left
     * EMISSION_CAP_DECLARATION_INVALID unreachable: a code in the union, in the RULES map,
     * documented in the docblock, and emitted by nothing.
     *
     * EVERY fault, in one sentence, for the reason `capDeclarationFaults` collects them all:
     * an owner who fixes one and re-runs to find the next abandons the control.
     */
    refusals.push(refusal(
      'EMISSION_CAP_DECLARATION_INVALID',
      `A cap declaration was supplied and it is not a cap, on ${capFaults.length} count(s): `
      + `${capFaults.join(' ')} The arithmetic therefore had NO cap to compare against — the `
      + 'declaration is not used at reduced confidence, it is not used at all — and this warrant '
      + `records capLcx as null beside those faults so the immutable record cannot later be read `
      + 'as "no cap was ever declared here".',
      'Correct EVERY fault named above and re-run. A cap is a finite, non-negative number on the '
      + 'concurrent in-flight basis, with who declared it, when, and under which instrument. Note '
      + 'that NaN and Infinity are refused rather than tolerated because `total > NaN` is false '
      + 'for every total: a cap that cannot be exceeded is the gate that cannot fail, which is the '
      + 'defect this whole module replaces.',
    ));
  } else if (cap === null) {
    refusals.push(refusal(
      'EMISSION_CAP_NOT_DECLARED',
      'No owner has declared a cap on concurrent in-flight LCX emission, so there is nothing for '
      + `this campaign's emission (${thisCampaignLcx === null ? 'amount not stated' : `${thisCampaignLcx} LCX`}`
      + `, on top of ${inFlight === null ? 'an unreadable in-flight total' : `${inFlight} LCX already in flight`}) `
      + 'to be within. This refusal is the DEFAULT and it is deliberate: a gate that compares '
      + 'against an absent limit returns OK for every input, and this platform has shipped '
      + 'exactly that once already.',
      'An owner declares the cap — a number, on the concurrent in-flight basis, with who declared '
      + 'it, when, and under which instrument — and it is set in emissionWarrant.ts '
      + 'DECLARED_EMISSION_CAP. There is no interim default, because a plausible number would be '
      + 'read as a policy.',
    ));
  } else if (thisCampaignLcx !== null && inFlight !== null && !inFlightIsLowerBound) {
    const total = inFlight + thisCampaignLcx;
    if (total > cap.capLcx) {
      refusals.push(refusal(
        'EMISSION_CAP_EXCEEDED',
        `Approving this campaign would put ${total} LCX in flight (${inFlight} already approved or `
        + `live, plus ${thisCampaignLcx} here) against a declared cap of ${cap.capLcx} LCX on the `
        + `concurrent in-flight basis, declared by ${cap.declaredBy} on ${cap.declaredAt} under `
        + `${cap.instrument}.`,
        `Reduce this campaign's budget_lcx to at most ${Math.max(cap.capLcx - inFlight, 0)}, `
        + 'move an approved or live campaign to measured, or have the owner raise the cap on the '
        + 'record.',
      ));
    }
  }

  /* ── 5. The warrant itself, appended whatever the answer ─────────────────── */

  const granted = refusals.length === 0;
  const sealedAtWrite = !PENDING_MIGRATIONS.includes('0070_audit_seal.sql');

  const draft: Omit<EmissionWarrant, 'auditRowId'> = {
    contract: EMISSION_WARRANT_CONTRACT,
    campaignId: String(row.id ?? input.campaignId),
    campaignName,
    targetStatus: input.targetStatus,
    launcher: input.launcher,
    observedAt: now,
    textSha256,
    textChars: text.length,
    textComposition: WARRANT_TEXT_COMPOSITION,
    gateDisposition: verdict.disposition,
    // THE UNSCOPED CODES. `verdict.refusals` may have had the Art 90 limb replaced by one
    // scoped refusal for a reader not cleared to read the basis; a warrant that recorded
    // the redaction instead of the register would be evidence of the wrong thing.
    gateRefusalCodes: verdict.ledgerOnly.refusalCodes,
    gateBlockingViolations: verdict.blockingViolations.map((v) => v.rule),
    assetsExtracted: verdict.assetsExtracted,
    gateError: verdict.gateError,
    launcherPosition,
    launcherPositionNarrative: launcherNarrative,
    capLcx: cap === null ? null : cap.capLcx,
    capBasis: cap === null ? null : cap.basis,
    /*
     * WHY THIS IS IN THE WARRANT AND NOT ONLY IN THE REFUSALS.
     *
     * `capLcx: null` is ambiguous on its own — it means BOTH "no cap has been declared"
     * (today's answer) and "a cap was supplied and rejected". Those are different facts
     * about how carefully this launch was governed, and the warrant is immutable, so the
     * distinction has to be recorded at write time or it is never recoverable. This field
     * carries the faults `capDeclarationFaults` found; empty means none was supplied, or
     * the one supplied was sound.
     */
    capDeclarationFaults: capFaults,
    emissionInFlightLcx: inFlight,
    emissionInFlightIsLowerBound: inFlightIsLowerBound,
    thisCampaignLcx,
    refusalCodes: refusals.map((r) => r.code),
    granted,
    sealedAtWrite,
  };

  const auditRowId = await ledgerWarrant(pool, draft);
  const warrant: EmissionWarrant = { ...draft, auditRowId };

  if (auditRowId === null) {
    /*
     * A FAILED APPEND IS A REFUSAL, AND THAT IS THE OPPOSITE ORDERING FROM
     * `recordGateDecision`. There, the caller has already decided to refuse and a failed
     * INSERT must not turn a clean 422 into a 500 — the bookkeeping is secondary to the
     * refusal. HERE the ledger row IS the warrant: the whole claim being made is "this
     * was checked, and here is the immutable record of it". Granting a launch whose
     * warrant was never written would produce a live token campaign that no reader can
     * find a warrant for, which is indistinguishable from one that never had a check.
     */
    return {
      outcome: 'refused',
      warrant: { ...warrant, granted: false },
      refusals: [
        ...refusals,
        refusal(
          'EMISSION_WARRANT_NOT_LEDGERED',
          'The warrant could not be appended to audit_log, so there is no warrant — only a '
          + 'verdict in a process that is about to forget it. The check ran; its record did not '
          + 'survive.',
          'Fix the audit log write path and re-run the check. Do NOT advance the campaign on the '
          + 'strength of a verdict nobody can look up afterwards.',
        ),
      ],
    };
  }

  return granted
    ? { outcome: 'granted', warrant }
    : { outcome: 'refused', warrant, refusals };
}

/**
 * Append one warrant to `audit_log`. Returns the row id, or `null` if it did not land.
 *
 * INSERT ONLY. 0070's BEFORE UPDATE OR DELETE trigger raises AUDIT_SEAL_APPEND_ONLY, so
 * an UPDATE here would fail in production and pass in a database without the seal —
 * which is the worst kind of difference. A warrant is corrected by appending another.
 */
async function ledgerWarrant(
  pool: Pool,
  warrant: Omit<EmissionWarrant, 'auditRowId'>,
): Promise<string | null> {
  try {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO audit_log (actor, action, entity, entity_id, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id::text AS id`,
      [
        warrant.launcher,
        EMISSION_WARRANT_ACTION,
        EMISSION_WARRANT_ENTITY,
        warrant.campaignId,
        JSON.stringify(warrant),
      ],
    );
    return res.rows[0]?.id ?? null;
  } catch (err) {
    console.error('[marketing] emission warrant NOT ledgered:', err);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  READING THE WARRANT BACK — a warrant nobody can find is not evidence.
 * ════════════════════════════════════════════════════════════════════════════ */

export type WarrantReadRefusalCode =
  | 'WARRANT_LEDGER_ABSENT'
  | 'WARRANT_ABSENT';

export type EmissionWarrantHistory =
  | {
    readonly ok: true;
    /** Newest first, so an appended correction is what a reader sees first. */
    readonly warrants: readonly EmissionWarrant[];
    readonly note: string;
  }
  | {
    readonly ok: false;
    readonly code: WarrantReadRefusalCode;
    readonly sentence: string;
    readonly remedy: string;
  };

/** A bound, not a filter. */
export const WARRANT_HISTORY_LIMIT = 50;

/**
 * Every warrant ever appended for one campaign.
 *
 * `WARRANT_ABSENT` is a REFUSAL and not an empty list, because "this campaign has no
 * warrant" is the finding that matters: it is the state a token-incentivised campaign
 * must not be `approved` or `live` in.
 */
export async function readEmissionWarrants(
  pool: Pool,
  campaignId: string,
): Promise<EmissionWarrantHistory> {
  let rows: Array<{ meta: unknown; id: string }>;
  try {
    const res = await pool.query<{ meta: unknown; id: string }>(
      `SELECT id::text AS id, meta
         FROM audit_log
        WHERE action = $1 AND entity = $2 AND entity_id = $3
        ORDER BY created_at DESC, id DESC
        LIMIT ${WARRANT_HISTORY_LIMIT}`,
      [EMISSION_WARRANT_ACTION, EMISSION_WARRANT_ENTITY, campaignId],
    );
    rows = res.rows;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    return {
      ok: false,
      code: 'WARRANT_LEDGER_ABSENT',
      sentence:
        'There is no audit_log relation on this environment, so no warrant can be read here — '
        + 'including this campaign\'s. That is not a finding that it has none.',
      remedy:
        'This is a broken environment rather than a compliance finding. Nothing may be advanced '
        + 'to approved or live while the warrant ledger cannot be read.',
    };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      code: 'WARRANT_ABSENT',
      sentence:
        `The warrant ledger was read and holds no emission warrant for campaign ${campaignId}. `
        + 'This is a genuine absence. A token-incentivised campaign in approved or live with no '
        + 'warrant has never had its Title VI limbs checked at all.',
      remedy:
        'Run evaluateEmissionWarrant for the campaign. If it is already live, that is a finding to '
        + 'escalate rather than a gap to backfill — a warrant minted today says nothing about the '
        + 'text that was published last week.',
    };
  }

  const warrants = rows.map((r) => {
    const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>;
    return { ...(meta as unknown as EmissionWarrant), auditRowId: r.id };
  });

  return {
    ok: true,
    warrants,
    note:
      `${warrants.length} warrant(s), newest first${
        warrants.length === WARRANT_HISTORY_LIMIT
          ? `. THIS IS THE ${WARRANT_HISTORY_LIMIT}-ROW CEILING, so older warrants exist and are not shown`
          : ''
      }. Warrants are appended and never edited (0070_audit_seal.sql refuses an UPDATE), so a `
      + 'correction appears as a LATER row rather than as a change to an earlier one. Each carries '
      + 'the sha256 of the exact text it covers: if the campaign copy has changed since, the '
      + 'newest warrant covers different bytes than the ones now on the page. Rows are returned '
      + `AS RECORDED, so check each one's contract tag — a warrant written under an earlier `
      + 'version of this check may not carry every field, and a missing field is not a false one.',
  };
}

/**
 * Does this warrant cover these bytes?
 *
 * The reason the digest is on the warrant at all. A granted warrant over an earlier
 * draft of the copy is not a warrant over the copy that shipped, and nothing but a
 * digest comparison can tell the two apart.
 */
export function warrantCoversText(warrant: EmissionWarrant, textSha256: string): boolean {
  return warrant.granted === true && warrant.textSha256 === textSha256;
}
