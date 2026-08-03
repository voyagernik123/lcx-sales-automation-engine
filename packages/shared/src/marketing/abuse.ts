import {
  VERB_INHERITS_TARGET_RISK,
  type ActorId,
  type AssetEmbargoState,
  type AssetSymbol,
  type Disposition,
  type EngagementAct,
  type EngagementVerb,
  type HoldingsDeclarationState,
  type Instant,
  type MarketingViolation,
  type Refusal,
  type RuleCitation,
} from './types.js';

/**
 * MARKET ABUSE — MiCA Title VI, made load-bearing.
 *
 * PURE. No I/O, no `Date.now()`, no randomness, no mutation of its inputs. Every
 * function takes the state it needs, including `now`, and returns refusals.
 *
 * ── Why this file exists ──
 *
 * The two worst classes of violation available to a marketing desk are INVISIBLE TO A
 * WORDING REVIEW. No amount of reading the prose finds them, because they are not
 * properties of the prose:
 *
 *   Art 90(1)  A "coming soon" reply about an unannounced listing is unlawful
 *              disclosure of inside information. The sentence is unremarkable. What
 *              makes it a violation is the EMBARGO STATE OF THE ASSET, which lives in
 *              a register, not in the text.
 *
 *   Art 91(3)(c)  A directional statement about an asset the author personally holds,
 *              without simultaneous public disclosure of that position, is market
 *              manipulation. Administrative fines for a NATURAL PERSON start at
 *              EUR 700 000 (Art 111(2)(d)). What makes it a violation is WHO IS
 *              SPEAKING AND WHAT THEY HOLD, which lives in a declaration.
 *
 * Both are resolved by joining the draft against declared state. That is the whole
 * thesis: a compartment that only reviews prose is optimising the least dangerous
 * axis.
 *
 * ── Why the scope is total ──
 *
 * Art 86 applies Title VI to "any person", to behaviour "irrespective of whether such
 * transaction, order or behaviour takes place on a trading platform", and to "actions
 * and omissions, in the Union and in third countries", for any crypto-asset "admitted
 * to trading or in respect of which a request for admission to trading has been made".
 * LCX operates a trading platform. So every token LCX lists, and every token LCX has
 * applied to list, is inside Title VI — which is the subject matter of most replies.
 * There is no geography defence and no off-platform defence.
 *
 * ── The house pattern: an empty register is not clearance ──
 *
 * Proven by the GPS perimeter and now doctrine here. An empty embargo register does
 * not mean nothing is embargoed; it means THE DESK DOES NOT KNOW. Every resolver in
 * this file returns `unknown` in that case and every gate refuses on `unknown` with a
 * sentence that says so in those words. There is deliberately no attestation, flag,
 * option or parameter anywhere in this module that lets an empty register read as
 * clear — a gate you can walk past is decoration.
 *
 * The corollary, stated because it is counter-intuitive: an UNDECLARED author is the
 * dangerous case, not the safe one. `not_declared` and `register_absent` both refuse.
 *
 * ── What this file does NOT do ──
 *
 *  - It does not own the tables. `EmbargoRegister` and `HoldingsRegister` are the
 *    shapes it needs; persisting them is the API's job and the migration is another
 *    agent's. The registers themselves are the owner's and legal's to POPULATE —
 *    Art 91(3)(c) carries personal liability, so who holds what is not something an
 *    engine may infer.
 *  - It does not classify regimes, check mandatory elements, compute the Art 7
 *    boilerplate arithmetic, or hold the desk mode. Those are separate lanes. In
 *    particular an Art 94 suspension (`DESK_SUSPENDED_BY_AUTHORITY`) is a DeskMode
 *    concern and is not re-implemented here.
 *  - It does not extract asset symbols from text. It is GIVEN `EngagementAct.namedAssets`
 *    and treats an empty list as a fact about the extractor, not about the world —
 *    see `MARKET_ABUSE_VIOLATIONS.directional_with_no_named_asset`.
 *
 * Citation policy: every refusal in this file names its provision and quotes or
 * closely paraphrases the text. MiCA primary text was read from
 * EUR-Lex CELEX:32023R1114. Nothing here is legal advice — see
 * `MARKETING_RULES_DISCLOSURE` in `./types.js`.
 */

/* ════════ §0 RULESET VERSION AND CITATIONS ════════ */

/**
 * Stamped onto every `Refusal` and `MarketingViolation` this file emits.
 *
 * Bump whenever a rule CHANGES MEANING, never for a wording fix. Records store the
 * version they were decided under, so a five-year-old refusal remains readable
 * against the rules that produced it rather than against today's.
 */
export const MARKET_ABUSE_RULESET_VERSION = 1;

/**
 * The provisions this file refuses on, as data.
 *
 * Exported so a surface can render the rule next to the refusal without re-typing it,
 * and so a test can assert that every refusal carries one of these rather than a
 * hand-written citation that drifted.
 */
export const MARKET_ABUSE_CITATIONS = {
  art_86: {
    instrument: 'mica',
    provision: 'Art 86(1)-(3)',
    text:
      'This Title shall apply to acts carried out by any person concerning crypto-assets that are admitted to trading or in respect of which a request for admission to trading has been made. ... irrespective of whether such transaction, order or behaviour takes place on a trading platform. ... This Title shall apply to actions and omissions, in the Union and in third countries.',
  },
  art_87: {
    instrument: 'mica',
    provision: 'Art 87(1)(a), (2)-(4)',
    text:
      "Inside information means information of a precise nature, which has not been made public, relating, directly or indirectly, to one or more issuers, offerors or persons seeking admission to trading, or to one or more crypto-assets, and which, if it were made public, would likely have a significant effect on the prices of those crypto-assets. Intermediate steps of a protracted process are covered. The test is information a reasonable holder of crypto-assets would likely use as part of the basis of the holder's investment decisions.",
  },
  art_88_1: {
    instrument: 'mica',
    provision: 'Art 88(1)',
    text:
      'Issuers, offerors and persons seeking admission to trading shall inform the public as soon as possible of inside information ... shall not combine the disclosure of inside information to the public with the marketing of their activities ... and shall post and maintain on their website, for a period of at least five years, all inside information that they are required to disclose publicly.',
  },
  art_90_1: {
    instrument: 'mica',
    provision: 'Art 90(1)',
    text:
      'No person in possession of inside information shall unlawfully disclose inside information to any other person, except where such disclosure is made in the normal exercise of an employment, a profession or duties.',
  },
  art_91_2_c: {
    instrument: 'mica',
    provision: 'Art 91(2)(c)',
    text:
      'disseminating information through the media, including the internet, or by any other means, which gives, or is likely to give, false or misleading signals as to the supply of, demand for, or price of one or several crypto-assets, or secures or is likely to secure, the price of one or several crypto-assets at an abnormal or artificial level, including the dissemination of rumours, where the person who engaged in the dissemination knew, or ought to have known, that the information was false or misleading.',
  },
  art_91_3_c: {
    instrument: 'mica',
    provision: 'Art 91(3)(c)',
    text:
      'taking advantage of occasional or regular access to the traditional or electronic media by voicing an opinion about a crypto-asset, while having previously taken positions on that crypto-asset, and profiting subsequently from the impact of the opinions voiced on the price of that crypto-asset, without having simultaneously disclosed that conflict of interest to the public in a proper and effective way.',
  },
  art_111_2_d: {
    instrument: 'mica',
    provision: 'Art 111(2)(d)',
    text:
      'maximum administrative fines of at least EUR 700 000 [for natural persons] ... or twice the amount of the profits gained or losses avoided because of the infringement where those can be determined.',
  },
} as const satisfies Record<string, RuleCitation>;

export type MarketAbuseCitationKey = keyof typeof MARKET_ABUSE_CITATIONS;

/* ════════ §1 THE REGISTERS — THE STATE THE PROSE CANNOT SHOW ════════ */

/**
 * Whether a register can be treated as ENUMERATING its subject matter.
 *
 * The distinction this type exists to force: "the register does not list ASSET" and
 * "ASSET is not embargoed" are different statements, and only a dated attestation by a
 * named human converts the first into the second. Without it, absence from a register
 * is absence of knowledge.
 *
 * `nextAttestationDue` is required on the attested variant because an attestation with
 * no expiry is a claim about a moment being reused as a claim about the present. A
 * lapsed attestation resolves exactly like no attestation.
 */
export type RegisterCompleteness =
  | { readonly kind: 'not_attested' }
  | {
      readonly kind: 'attested';
      /** The named human asserting the register enumerates its subject matter. */
      readonly by: ActorId;
      readonly at: Instant;
      readonly nextAttestationDue: Instant;
    };

/**
 * One row of the asset embargo register.
 *
 * `reviewBy` is what stops a stale row reading as a live clearance. An asset marked
 * `clear` in March is not evidence about August, because Art 87(2)-(3) put the
 * intermediate steps of a protracted process inside inside-information — a listing
 * that was not yet contemplated in March may be at diligence stage now.
 *
 * A `mnpi_pending` row is the one exception: it BLOCKS whether or not it is stale,
 * because staleness must never be able to downgrade a block. Ageing out of an embargo
 * would be the single worst bug this file could contain.
 */
export interface EmbargoRegisterEntry {
  readonly asset: AssetSymbol;
  readonly state: AssetEmbargoState;
  /** Why the asset is in this state. Free text, shown in the refusal. */
  readonly basis: string;
  readonly recordedBy: ActorId;
  readonly recordedAt: Instant;
  /**
   * When this row must be re-confirmed. `null` means it never was given one, and a
   * clearing state with no review date resolves to `unknown` — see `resolveEmbargo`.
   */
  readonly reviewBy: Instant | null;
  /** Set when `state` is `announced`: when the information was disclosed publicly. */
  readonly announcedAt: Instant | null;
}

/**
 * The asset embargo register.
 *
 * The desk does not own the contents. The owner owes either the list itself or the
 * rule for deriving it from listing state; until then this register is empty and every
 * gate that reads it refuses and says it is empty.
 */
export interface EmbargoRegister {
  readonly entries: readonly EmbargoRegisterEntry[];
  readonly completeness: RegisterCompleteness;
  /**
   * Whether `entries` is the WHOLE register or a per-symbol slice of it.
   *
   * WHY THIS FIELD HAD TO EXIST. `resolveEmbargo` reported `register_empty` — "the desk
   * holds no register at all" — from `entries.length === 0`, and the only production
   * loader (`abuseRegister.ts loadEmbargoRegister`) is SYMBOL-SCOPED: it selects
   * `WHERE asset_symbol = ANY($1)`. So a register with 500 rows returned zero entries for
   * one unlisted symbol and the desk was told to supply a register it had already
   * supplied. Every embargo refusal on that path named the wrong missing fact, and
   * `absent_from_unattested_register` — the correct reason, with the correct remedy — was
   * unreachable in production while being covered by tests.
   *
   * `undefined` reads as "the caller did not say", and is treated as the WHOLE register so
   * an omission cannot silently turn `register_empty` into a softer answer.
   */
  readonly scopedToSymbols?: boolean;
  /**
   * Whether the register table holds ANY row, independent of the scope above. Only
   * meaningful when `scopedToSymbols` is true; `undefined` means the loader did not ask.
   */
  readonly anyRowsInRegister?: boolean;
}

/**
 * One staff holdings declaration, for one actor and one asset.
 *
 * `declared` carries only the two states a human can actually ASSERT. The other two
 * members of `HoldingsDeclarationState` — `not_declared` and `register_absent` — are
 * RESOLUTION OUTCOMES, not declarations, and keeping them out of this type is what
 * stops "nobody answered" being stored as though somebody had.
 *
 * `reviewBy` is required, not optional. A declaration with no expiry is treated as
 * true forever, and a person who declared no position in January may have bought in
 * March. A stale declaration is not a declaration.
 */
export interface HoldingsDeclarationEntry {
  readonly actor: ActorId;
  readonly asset: AssetSymbol;
  readonly declared: 'declared_holding' | 'declared_none';
  readonly declaredAt: Instant;
  /** The date by which this declaration must be renewed. Past it, it is not an answer. */
  readonly reviewBy: Instant;
  /**
   * Free-text detail the desk may hold, e.g. "spot position, personal account". Never
   * a quantity: this compartment has no business holding an employee's position size,
   * and Art 91(3)(c) turns on whether a position exists, not on how large it is.
   */
  readonly note: string | null;
}

/**
 * The staff holdings declaration register.
 *
 * NOTE THE ASYMMETRY WITH `EmbargoRegister`, because it is a deliberate judgement and
 * not an oversight: an attested-complete EMBARGO register lets absence resolve to
 * `clear`, but an attested-complete HOLDINGS register does NOT let absence resolve to
 * `declared_none`. The reason is that Art 91(3)(c) turns on a fact about one named
 * individual, and an attestation about a register is not that individual's answer.
 * Only a positive row for that (actor, asset) pair is.
 */
export interface HoldingsRegister {
  readonly entries: readonly HoldingsDeclarationEntry[];
  readonly completeness: RegisterCompleteness;
}

/** An empty register, for callers that have no table yet. Refuses, by construction. */
export const EMPTY_EMBARGO_REGISTER: EmbargoRegister = {
  entries: [],
  completeness: { kind: 'not_attested' },
};

/** An empty register, for callers that have no table yet. Refuses, by construction. */
export const EMPTY_HOLDINGS_REGISTER: HoldingsRegister = {
  entries: [],
  completeness: { kind: 'not_attested' },
};

/* ════════ §2 SMALL PURE HELPERS ════════ */

/**
 * Parse an `Instant` to epoch milliseconds, or `null` when it is not a usable instant.
 *
 * `null` is not an error to swallow: every caller treats an unparseable instant as
 * UNKNOWN and therefore refuses, rather than comparing `NaN` and silently taking the
 * false branch. A corrupt timestamp must not be able to clear a gate.
 *
 * The `typeof` guard is not redundant with the type signature: rows arrive from JSON at
 * the API boundary, and a column that has drifted to a number would otherwise be
 * coerced by `Date.parse` into a plausible-looking instant. Blank and malformed strings
 * need no special case — `Date.parse` returns `NaN` for both and `Number.isFinite`
 * catches it, so adding one would be untested code pretending to be a guard.
 */
export function instantMs(value: Instant | null): number | null {
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * `true` when `a` is strictly known to be at or before `b`. Unknown on either side is
 * `false` — the caller then takes the conservative branch.
 */
function atOrBefore(a: Instant | null, b: Instant | null): boolean {
  const ams = instantMs(a);
  const bms = instantMs(b);
  if (ams === null || bms === null) return false;
  return ams <= bms;
}

/** Whole days from `from` to `to`, or `null` when either is unknown. */
function daysBetween(from: Instant | null, to: Instant | null): number | null {
  const fms = instantMs(from);
  const tms = instantMs(to);
  if (fms === null || tms === null) return null;
  return Math.floor((tms - fms) / 86_400_000);
}

/** Asset symbols compare case-insensitively, trimmed. Nothing else is normalised. */
export function sameAsset(a: AssetSymbol, b: AssetSymbol): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Actor ids compare exactly. An id that differs by case is a different id. */
function sameActor(a: ActorId, b: ActorId): boolean {
  return a === b;
}

/* ════════ §3 RESOLVING THE EMBARGO REGISTER (Art 90) ════════ */

/**
 * Why `resolveEmbargo` landed where it did. Exported because a refusal that will not
 * say WHICH kind of ignorance it is suffering from cannot be fixed by the person
 * reading it.
 *
 *  - `entry_found`                        a live row said so.
 *  - `entry_state_unknown`                a row exists and records `unknown`.
 *  - `entry_stale`                        a row exists, is not `mnpi_pending`, and is
 *                                         past its review date or never had one.
 *  - `register_empty`                     no rows at all. THE DESK DOES NOT KNOW.
 *  - `absent_from_unattested_register`    rows exist, this asset is not among them,
 *                                         and nobody has attested the register
 *                                         enumerates the embargoed set.
 *  - `register_attestation_stale`         the attestation has lapsed.
 *  - `absent_from_attested_register`      the only path on which absence means clear,
 *                                         and it costs a named human's dated
 *                                         attestation that is still in date.
 */
export type EmbargoResolutionReason =
  | 'entry_found'
  | 'entry_state_unknown'
  | 'entry_stale'
  | 'register_empty'
  | 'absent_from_unattested_register'
  | 'register_attestation_stale'
  | 'absent_from_attested_register';

export interface EmbargoResolution {
  readonly asset: AssetSymbol;
  /** `unknown` whenever the desk cannot say. Never defaults to `clear`. */
  readonly state: AssetEmbargoState;
  readonly reason: EmbargoResolutionReason;
  readonly entry: EmbargoRegisterEntry | null;
  /** One sentence stating exactly what the desk does and does not know. */
  readonly narrative: string;
}

/**
 * Join one asset against the embargo register.
 *
 * The ordering of the branches is the whole control. In particular the empty-register
 * check comes FIRST and has no escape: there is no attestation, option or argument that
 * makes an empty register mean "nothing is embargoed". If the owner has not supplied
 * the list or the derivation rule, the honest answer is that the desk cannot tell, and
 * the honest answer is the one that ships.
 */
export function resolveEmbargo(
  asset: AssetSymbol,
  register: EmbargoRegister,
  now: Instant,
): EmbargoResolution {
  /*
   * A SYMBOL-SCOPED LOAD THAT FOUND NOTHING IS NOT AN EMPTY REGISTER, and conflating the
   * two made every refusal on the production path name the wrong missing fact. Both
   * outcomes still REFUSE — `state: 'unknown'` either way, and the empty-register branch
   * below still has no escape — so this changes which sentence the desk reads and which
   * human it sends them to, not whether the draft is blocked.
   */
  const scoped = register.scopedToSymbols === true;
  const registerHasRows = scoped
    ? register.anyRowsInRegister === true
    : register.entries.length > 0;

  if (!registerHasRows) {
    return {
      asset,
      state: 'unknown',
      reason: 'register_empty',
      entry: null,
      narrative:
        `The embargo register is empty, so this desk cannot say whether ${asset} is under embargo. ` +
        'An empty register does not mean nothing is embargoed; it means the desk does not know.',
    };
  }

  const entry = register.entries.find((e) => sameAsset(e.asset, asset)) ?? null;

  if (entry !== null) {
    // A block never ages out. Staleness may only ever move a state toward `unknown`,
    // never away from `mnpi_pending`.
    if (entry.state === 'mnpi_pending') {
      return {
        asset,
        state: 'mnpi_pending',
        reason: 'entry_found',
        entry,
        narrative:
          `${asset} is recorded as under embargo (inside information exists and is not yet public): ` +
          `${entry.basis}. Recorded by ${entry.recordedBy} on ${entry.recordedAt}.`,
      };
    }

    if (entry.state === 'unknown') {
      return {
        asset,
        state: 'unknown',
        reason: 'entry_state_unknown',
        entry,
        narrative:
          `The embargo register holds a row for ${asset} but records its state as unknown: ${entry.basis}.`,
      };
    }

    if (!atOrBefore(now, entry.reviewBy)) {
      const staleBy = daysBetween(entry.reviewBy, now);
      const when =
        entry.reviewBy === null
          ? 'the row was never given a review date'
          : staleBy === null
            ? `the row's review date (${entry.reviewBy}) is not a readable instant`
            : `the row fell due for review on ${entry.reviewBy}, ${staleBy} day(s) ago`;
      return {
        asset,
        state: 'unknown',
        reason: 'entry_stale',
        entry,
        narrative:
          `The embargo register records ${asset} as '${entry.state}', but ${when}, so that row is not ` +
          'evidence about today. Art 87(2)-(3) put the intermediate steps of a protracted process inside ' +
          'inside information, so a row that was true in the past is not a clearance now.',
      };
    }

    return {
      asset,
      state: entry.state,
      reason: 'entry_found',
      entry,
      narrative:
        `${asset} is recorded as '${entry.state}' (${entry.basis}), reviewed as current to ${String(entry.reviewBy)}.`,
    };
  }

  if (register.completeness.kind === 'not_attested') {
    return {
      asset,
      state: 'unknown',
      reason: 'absent_from_unattested_register',
      entry: null,
      narrative:
        `${asset} does not appear in the embargo register, and nobody has attested that the register ` +
        'enumerates every embargoed asset. Absence from an unattested register is absence of knowledge, ' +
        'not clearance.',
    };
  }

  if (!atOrBefore(now, register.completeness.nextAttestationDue)) {
    return {
      asset,
      state: 'unknown',
      reason: 'register_attestation_stale',
      entry: null,
      narrative:
        `${asset} does not appear in the embargo register, and the register's completeness attestation ` +
        `by ${register.completeness.by} fell due for renewal on ${register.completeness.nextAttestationDue}. ` +
        'A lapsed attestation resolves the same way as none.',
    };
  }

  return {
    asset,
    state: 'clear',
    reason: 'absent_from_attested_register',
    entry: null,
    narrative:
      `${asset} does not appear in the embargo register, and ${register.completeness.by} attested on ` +
      `${register.completeness.at} that the register enumerates every embargoed asset, valid to ` +
      `${register.completeness.nextAttestationDue}.`,
  };
}

/* ════════ §4 RESOLVING THE HOLDINGS REGISTER (Art 91(3)(c)) ════════ */

/**
 * Why `resolveHoldings` landed where it did.
 *
 *  - `declaration_found`      a live declaration for this exact (actor, asset) pair.
 *  - `declaration_stale`      a declaration exists and is past its review date. It
 *                             resolves to `not_declared`, because an expired answer is
 *                             not an answer.
 *  - `actor_not_declared`     the register holds rows but none for this pair.
 *  - `register_not_attested`  as above, and the register is not attested either — a
 *                             separate fact, kept separate.
 *  - `register_empty`         no rows at all.
 */
export type HoldingsResolutionReason =
  | 'declaration_found'
  | 'declaration_stale'
  | 'actor_not_declared'
  | 'register_not_attested'
  | 'register_empty';

export interface HoldingsResolution {
  readonly actor: ActorId;
  readonly asset: AssetSymbol;
  /** One of the four `HoldingsDeclarationState` values from `./types.js`. */
  readonly state: HoldingsDeclarationState;
  readonly reason: HoldingsResolutionReason;
  readonly entry: HoldingsDeclarationEntry | null;
  /** Days past the review date, when stale and computable. */
  readonly staleByDays: number | null;
  readonly narrative: string;
}

/**
 * Join one (actor, asset) pair against the holdings register.
 *
 * Three things this function refuses to do, each of which would be the natural
 * shortcut:
 *  1. It never returns `declared_none` for an actor with no row. Absence is silence.
 *  2. It never lets an attestation about the register substitute for that actor's own
 *     answer — see the docblock on `HoldingsRegister`.
 *  3. It never carries a stale `declared_none` forward. That is the exact shape of the
 *     accident this whole gate exists to prevent: a January declaration clearing an
 *     August post about a position taken in March.
 */
export function resolveHoldings(
  actor: ActorId,
  asset: AssetSymbol,
  register: HoldingsRegister,
  now: Instant,
): HoldingsResolution {
  if (register.entries.length === 0) {
    return {
      actor,
      asset,
      state: 'register_absent',
      reason: 'register_empty',
      entry: null,
      staleByDays: null,
      narrative:
        'There is no staff holdings register, so this desk cannot say whether ' +
        `${actor} holds ${asset}. The register is the owner's and legal's to produce; ` +
        'Art 91(3)(c) attaches personal liability and an engine may not infer it.',
    };
  }

  const entry =
    register.entries.find((e) => sameActor(e.actor, actor) && sameAsset(e.asset, asset)) ?? null;

  if (entry !== null) {
    if (atOrBefore(now, entry.reviewBy)) {
      return {
        actor,
        asset,
        state: entry.declared,
        reason: 'declaration_found',
        entry,
        staleByDays: null,
        narrative:
          `${actor} declared '${entry.declared}' for ${asset} on ${entry.declaredAt}, in date to ` +
          `${entry.reviewBy}.`,
      };
    }
    const staleByDays = daysBetween(entry.reviewBy, now);
    return {
      actor,
      asset,
      state: 'not_declared',
      reason: 'declaration_stale',
      entry,
      staleByDays,
      narrative:
        `${actor} declared '${entry.declared}' for ${asset} on ${entry.declaredAt}, but that declaration ` +
        `fell due for renewal on ${entry.reviewBy}` +
        (staleByDays === null ? '' : ` — ${staleByDays} day(s) ago`) +
        '. A stale declaration is not a declaration: a position can be opened or closed after it was made.',
    };
  }

  if (register.completeness.kind === 'not_attested') {
    return {
      actor,
      asset,
      state: 'not_declared',
      reason: 'register_not_attested',
      entry: null,
      staleByDays: null,
      narrative:
        `${actor} has not declared a position in ${asset}, and the holdings register carries no ` +
        'completeness attestation either. An undeclared author is the dangerous case, not the safe one.',
    };
  }

  return {
    actor,
    asset,
    state: 'not_declared',
    reason: 'actor_not_declared',
    entry: null,
    staleByDays: null,
    narrative:
      `${actor} has not declared a position in ${asset}. An attestation about the register is not this ` +
      "individual's answer, and Art 91(3)(c) turns on this individual's position.",
  };
}

/* ════════ §5 THE LINE: A DIRECTIONAL STATEMENT VS A FACTUAL ONE ════════ */

/**
 * WHERE THE LINE IS DRAWN, AND WHY. Read this before changing anything below it,
 * because every Art 91(3)(c) refusal in this file rests on it.
 *
 * Art 91(3)(c) bites on "VOICING AN OPINION about a crypto-asset". So the question is
 * not "is this post enthusiastic" and not "does it mention a price". It is: did the
 * author voice an OPINION about the asset, as opposed to stating a FACT about it?
 *
 * THE TEST USED HERE — falsifiability by a public source at the time of writing:
 *
 *   FACTUAL      The statement predicates something about the asset's PRESENT OR PAST
 *                state that a named public source could settle TODAY, either way.
 *                "LCX lists TOKEN." "TOKEN trades against EUR." "Deposits opened at
 *                09:00 UTC." Each of these can be shown false by pointing at something.
 *
 *   DIRECTIONAL  The statement predicates something about the asset's FUTURE or its
 *                MERIT — where it is going, what it is worth, whether it is a good
 *                thing to hold, how it compares. "TOKEN is undervalued." "This is
 *                going to run." "Strongest fundamentals in the sector." None of these
 *                can be settled today by pointing at anything, which is precisely what
 *                makes them opinions.
 *
 * This is the same cut RESIST 2 makes in its opinion gate and that `Verifiability` in
 * `./types.js` already encodes — "opinions are usually subjective, which means that
 * they cannot be verifiably false" — reused deliberately rather than invented, so the
 * compartment has ONE theory of what an opinion is.
 *
 * FOUR CONSEQUENCES OF DRAWING IT HERE, each of which is a decision, not an accident:
 *
 * 1. MIXED IS DIRECTIONAL. "Deposits are live, and this one is going to run" is one
 *    artefact containing an opinion. Exposure is set by the worst clause, not by the
 *    average of the clauses. There is no `mixed` value in `StatementStance` because
 *    there is nothing to do with it that differs from `directional`.
 *
 * 2. THE RULE IS DIRECTION-NEUTRAL. The Article says "an opinion", not "a favourable
 *    opinion". A staffer who is short an asset and calls it a dead project is inside
 *    the same definition. So `STANCE_MARKERS` carries bearish markers too, and
 *    `OpinionDirection` records which way it pointed for the record rather than for the
 *    gate. NAMED GAP: `HoldingsDeclarationEntry.declared` cannot express a SHORT
 *    position, so the bearish limb currently only fires where the actor also holds
 *    spot. Closing it needs a declaration shape the owner and legal define.
 *
 * 3. THE ENGINE MAY PROVE `directional`. IT MAY NEVER PROVE `factual_verifiable`.
 *    Marker evidence is one-way. If no marker fires, the answer is `undetermined`, and
 *    only a NAMED HUMAN with a public source reference can move it to
 *    `factual_verifiable` (`DeclaredStance`). The reason is cost asymmetry: a wrong
 *    `directional` costs one register lookup, and a wrong `factual_verifiable` costs a
 *    personal fine from EUR 700 000 (Art 111(2)(d)). The classifier is therefore
 *    deliberately biased toward `directional`, and saying so is better than pretending
 *    it is neutral.
 *
 * 4. `undetermined` DOES NOT GET THE FACTUAL EXEMPTION. It is treated, for gating
 *    purposes, exactly like `directional`: the holdings join must succeed. Note what
 *    that means in practice — an undetermined post by someone with a live
 *    `declared_none` still clears. The refusal only arrives where the desk cannot say
 *    whether an opinion was voiced AND cannot say what the author holds. That is two
 *    unknowns stacked, and refusing on two unknowns is not over-gating.
 *
 *    ══ DECIDED, 2026-08-02: THERE IS DELIBERATELY NO `STANCE_UNDETERMINED` CODE. ══
 *    The wiring pass asked whether this withholding should become a visible refusal of
 *    its own. It should not, for two reasons.
 *
 *    First, a refusal names a MISSING FACT and who can supply it. Nobody can supply a
 *    stance: it is this classifier's own uncertainty about text that already exists. The
 *    fact actually missing is the holdings declaration, and
 *    `HOLDINGS_DECLARATION_MISSING` names it precisely, together with the person who can
 *    close it. A `STANCE_UNDETERMINED` beside it would name the instrument's doubt rather
 *    than the desk's gap, and its recovery would have to be "reword so the classifier is
 *    surer", which is advice to game a gate.
 *
 *    Second, `loop.ts refusalCodeFrequency` enumerates `REFUSAL_CODES` to report which
 *    gates have never fired. A code that only ever fires ALONGSIDE the holdings code
 *    would double-count one refusal as two and make the holdings gate look twice as
 *    load-bearing as it is — the same defect as the ten process metrics implemented
 *    twice.
 *
 *    What the verdict DOES carry is `stance` on `StanceAssessment`, so a surface can say
 *    "we could not tell whether this voices an opinion" as context beside the refusal.
 *    That is the honest shape: the uncertainty is visible, and it is not pretending to be
 *    a rule.
 *
 * WHAT THIS IS NOT: a sentiment score, and not a clever regex. `STANCE_MARKERS` is an
 * enumerated, categorised, individually-justified list of phrases, each carrying the
 * reason it evidences an opinion. Every entry is separately assertable in a test, a
 * reviewer can argue with any single one without arguing with the model, and the
 * matching is plain word-boundary containment with no capture groups, no alternation
 * and no lookahead. A phrase list you can read is auditable; a regex you cannot is not.
 */

/** Which way the opinion pointed. Recorded for the file; not used to decide the gate. */
export type OpinionDirection = 'bullish' | 'bearish';

/**
 * The five ways a statement stops being a fact about the asset and becomes an opinion
 * about it. Each category maps to a distinct limb of the reasoning above.
 */
export type StanceMarkerCategory =
  /** Predicates the asset's FUTURE. Cannot be settled today, by anyone. */
  | 'future_or_forecast'
  /** Predicates the asset's WORTH. A valuation is an opinion however confidently held. */
  | 'valuation_or_merit'
  /** Tells the reader what to DO. An inducement necessarily embeds a favourable view. */
  | 'inducement_to_transact'
  /** Ranks the asset against others. A ranking is a judgement, not an observation. */
  | 'comparative_superiority'
  /** States OUR affect toward it. "We are bullish" is the paradigm case of the Article. */
  | 'endorsement_affect';

export interface StanceMarker {
  /** Stable id, so a test and a refusal can name the exact marker that fired. */
  readonly id: string;
  readonly category: StanceMarkerCategory;
  readonly direction: OpinionDirection;
  /** Lowercase phrases, matched on word boundaries. */
  readonly phrases: readonly string[];
  /** Why a statement carrying this is "voicing an opinion" within Art 91(3)(c). */
  readonly why: string;
}

/**
 * THE MARKER TABLE. Long on purpose: this is the argument, written out, rather than
 * compressed into a pattern nobody can review.
 *
 * Phrases are chosen to be predicates ABOUT THE ASSET. Deliberately absent: the bare
 * words `buy`, `sell`, `soon` and `live`. "You can buy TOKEN on LCX" and "deposits go
 * live soon" are factual statements about LCX's own service, and marking them
 * directional would train the operator that the gate is noise. `soon` in particular
 * belongs to the Art 90 embargo gate (§6), not here — a teaser is dangerous because of
 * what it discloses, not because of an opinion it voices.
 */
export const STANCE_MARKERS: readonly StanceMarker[] = [
  {
    id: 'forecast_rise',
    category: 'future_or_forecast',
    direction: 'bullish',
    phrases: [
      'will rise', 'will go up', 'will pump', 'going to run', 'going to rise',
      'about to run', 'set to rally', 'poised to', 'next leg up', 'breakout incoming',
      'price target', 'to the moon', 'gonna moon', 'sending it', 'parabolic',
    ],
    why:
      'A statement about where the price is going cannot be settled by any public source today, so it is an opinion and not a fact. Art 91(2)(c) additionally treats it as capable of giving misleading signals as to demand.',
  },
  {
    id: 'forecast_fall',
    category: 'future_or_forecast',
    direction: 'bearish',
    phrases: ['will dump', 'going to zero', 'will collapse', 'about to crash', 'heading lower'],
    why:
      'Art 91(3)(c) says "an opinion", not "a favourable opinion". A forecast of decline by a person with a position in the asset is inside the same definition.',
  },
  {
    id: 'valuation',
    category: 'valuation_or_merit',
    direction: 'bullish',
    phrases: [
      'undervalued', 'still cheap', 'below fair value', 'worth far more', 'mispriced',
      'massive potential', 'huge upside', 'asymmetric bet', 'hidden gem', 'no brainer',
    ],
    why:
      'A valuation is a judgement about what the asset is worth. Two honest analysts can hold opposite views on identical data, which is the definition of an opinion rather than a fact.',
  },
  {
    id: 'valuation_negative',
    category: 'valuation_or_merit',
    direction: 'bearish',
    phrases: ['overvalued', 'worthless', 'dead project', 'vapourware', 'vaporware'],
    why: 'The mirror of `valuation`, and inside the Article for the same reason: the rule is direction-neutral.',
  },
  {
    id: 'inducement',
    category: 'inducement_to_transact',
    direction: 'bullish',
    phrases: [
      'time to buy', 'should buy', 'buy the dip', 'accumulate here', 'load up',
      'get in early', 'do not miss', "don't miss", 'last chance', 'ape in',
      'fill your bags', 'stack more',
    ],
    why:
      'Telling a reader to acquire the asset necessarily embeds a favourable view of it, so it voices an opinion. It is also capable of being an inducement within Art 89(3) where inside information is in play.',
  },
  {
    id: 'comparative',
    category: 'comparative_superiority',
    direction: 'bullish',
    phrases: [
      'better than', 'outperform', 'will outperform', 'strongest in the sector',
      'best performing', 'leaves every other', 'flippening',
    ],
    why:
      'Ranking one asset above another is a judgement about relative merit. It is not settleable by a public source, because the ranking criterion is chosen by the speaker.',
  },
  {
    id: 'endorsement',
    category: 'endorsement_affect',
    direction: 'bullish',
    phrases: [
      'bullish', 'very bullish', 'excited about', 'excited for', 'we love',
      'our favourite', 'our favorite', 'believe in', 'high conviction', 'conviction play',
      'diamond hands', 'long term hold', 'wagmi', 'lfg',
    ],
    why:
      'This is the paradigm case the Article describes: "voicing an opinion about a crypto-asset". Stating our own favourable disposition toward the asset is the opinion itself, with nothing else needed.',
  },
  {
    id: 'endorsement_negative',
    category: 'endorsement_affect',
    direction: 'bearish',
    phrases: ['bearish', 'we are out', 'staying away from', 'avoid this one'],
    why: 'The bearish mirror of `endorsement`, inside the Article on the same direction-neutral reading.',
  },
];

/** One marker hit, with the reason attached so the refusal is arguable. */
export interface StanceFinding {
  readonly markerId: string;
  readonly category: StanceMarkerCategory;
  readonly direction: OpinionDirection;
  /** The phrase that matched, verbatim from the marker table. */
  readonly matched: string;
  readonly why: string;
}

export type StatementStance = 'directional' | 'factual_verifiable' | 'undetermined';

/**
 * A named human's stance judgement.
 *
 * `factual_verifiable` REQUIRES `publicSourceRef`, because the whole test for a fact is
 * that a public source can settle it. A declaration with no source is not a
 * declaration that the statement is a fact; it is a declaration that the declarer
 * believes so, and belief is not the test.
 *
 * A declaration can only ever escalate or complete. It cannot demote: see
 * `assessStance`.
 */
export interface DeclaredStance {
  readonly stance: 'directional' | 'factual_verifiable';
  readonly by: ActorId;
  readonly at: Instant;
  readonly basis: string;
  /** The public source that settles the statement today. Required for `factual_verifiable`. */
  readonly publicSourceRef: string | null;
}

export interface StanceAssessment {
  readonly stance: StatementStance;
  readonly findings: readonly StanceFinding[];
  readonly declared: DeclaredStance | null;
  /** One sentence: why the assessment landed here. Rendered next to the verdict. */
  readonly rationale: string;
  /**
   * True when a human declared `factual_verifiable` and marker evidence overrode it.
   * Surfaced rather than hidden: a human asserting a post is factual while the text
   * says "very bullish" is a disagreement worth a reviewer's eyes, and silently
   * discarding either side would hide it.
   */
  readonly declarationOverriddenByEvidence: boolean;
}

/**
 * Normalise for matching: lowercase, every character that is not a letter, digit or
 * apostrophe becomes a space, runs of space collapse, and the result is padded with a
 * single space at each end so that phrase matching is word-boundary matching.
 *
 * Apostrophes survive so that "don't miss" matches as written. The typographic
 * apostrophe is folded to the ASCII one first, because a copy-paste from a document
 * would otherwise walk straight past the marker.
 */
function normaliseForMatching(text: string): string {
  const folded = text.replace(/[‘’ʼ]/g, "'").toLowerCase();
  let out = '';
  for (const ch of folded) {
    const isWord = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === "'";
    out += isWord ? ch : ' ';
  }
  return ` ${out.split(' ').filter((t) => t !== '').join(' ')} `;
}

/** Word-boundary containment. No regex against caller text, so no pattern can be injected. */
function containsPhrase(padded: string, phrase: string): boolean {
  return padded.includes(` ${phrase} `);
}

/**
 * Classify one artefact's stance toward the assets it names.
 *
 * The decision procedure, in order, and the order IS the policy:
 *  1. Any marker fires  → `directional`. Nothing overrides evidence, including a human
 *                         declaration to the contrary, which is instead recorded.
 *  2. Declared `directional` → `directional`. Escalation is always honoured.
 *  3. Declared `factual_verifiable` WITH a public source → `factual_verifiable`.
 *  4. Declared `factual_verifiable` WITHOUT a source → `undetermined`, naming the gap.
 *  5. Nothing → `undetermined`. Never `factual_verifiable` by default.
 */
export function assessStance(text: string, declared: DeclaredStance | null): StanceAssessment {
  const padded = normaliseForMatching(text);
  const findings: StanceFinding[] = [];
  for (const marker of STANCE_MARKERS) {
    for (const phrase of marker.phrases) {
      if (containsPhrase(padded, phrase)) {
        findings.push({
          markerId: marker.id,
          category: marker.category,
          direction: marker.direction,
          matched: phrase,
          why: marker.why,
        });
      }
    }
  }

  if (findings.length > 0) {
    const overridden = declared !== null && declared.stance === 'factual_verifiable';
    return {
      stance: 'directional',
      findings,
      declared,
      declarationOverriddenByEvidence: overridden,
      rationale:
        `The text voices an opinion about the asset: ${findings.map((f) => `"${f.matched}"`).join(', ')}. ` +
        (overridden
          ? `${declared.by} declared this factual, but marker evidence is one-way in this engine and is not ` +
            'overridable by declaration — the disagreement is recorded for a reviewer.'
          : 'Art 91(3)(c) bites on voicing an opinion, so the holdings join must succeed.'),
    };
  }

  if (declared !== null && declared.stance === 'directional') {
    return {
      stance: 'directional',
      findings,
      declared,
      declarationOverriddenByEvidence: false,
      rationale:
        `No marker fired, and ${declared.by} declared the statement directional (${declared.basis}). ` +
        'A declaration may always escalate.',
    };
  }

  if (declared !== null && declared.stance === 'factual_verifiable') {
    if (declared.publicSourceRef !== null && declared.publicSourceRef.trim() !== '') {
      return {
        stance: 'factual_verifiable',
        findings,
        declared,
        declarationOverriddenByEvidence: false,
        rationale:
          `No marker fired, and ${declared.by} declared the statement factual and settleable today from ` +
          `${declared.publicSourceRef} (${declared.basis}).`,
      };
    }
    return {
      stance: 'undetermined',
      findings,
      declared,
      declarationOverriddenByEvidence: false,
      rationale:
        `${declared.by} declared the statement factual but named no public source that settles it. The test ` +
        'for a fact is that a public source can settle it, so the declaration is incomplete and the stance ' +
        'stays undetermined.',
    };
  }

  return {
    stance: 'undetermined',
    findings,
    declared: null,
    declarationOverriddenByEvidence: false,
    rationale:
      'No opinion marker fired and nobody declared the stance. This engine may prove that an opinion was ' +
      'voiced; it may never prove that one was not, so the stance is undetermined and does not receive the ' +
      'factual exemption.',
  };
}

/** `true` where Art 91(3)(c)'s "voicing an opinion" limb must be treated as engaged. */
export function stanceEngagesArt91_3_c(stance: StatementStance): boolean {
  return stance !== 'factual_verifiable';
}

/* ════════ §6 GATE 1 — Art 90: THE ASSET UNDER EMBARGO ════════ */

/**
 * Build a `Refusal` with this file's ruleset version stamped on.
 *
 * There is no `severity`, no `canProceed` and no `override` parameter, here or
 * anywhere else in this module. A refusal is a refusal; the only ways past one are the
 * `RefusalRecovery` it carries.
 */
function refusal(
  code: Refusal['code'],
  sentence: string,
  citation: MarketAbuseCitationKey,
  recovery: Refusal['recovery'],
  matched: string | null,
): Refusal {
  return {
    code,
    sentence,
    rule: MARKET_ABUSE_CITATIONS[citation],
    recovery,
    matched,
    ruleSetVersion: MARKET_ABUSE_RULESET_VERSION,
  };
}

function violation(
  rule: string,
  citation: MarketAbuseCitationKey,
  matched: string,
  remedy: string,
  /**
   * `warning` by default because most findings here record that a limb was SATISFIED and
   * must stay that way. `error` is for the one finding that says a gate did not run:
   * `outboundGate.ts` blocks on error severity, and a finding whose own remedy is "record
   * which" cannot be delivered by a field nobody reads.
   */
  severity: MarketingViolation['severity'] = 'warning',
): MarketingViolation {
  return {
    rule,
    severity,
    rule_citation: MARKET_ABUSE_CITATIONS[citation],
    matched,
    remedy,
    ruleVersion: MARKET_ABUSE_RULESET_VERSION,
  };
}

/** What a gate returns: refusals, non-blocking findings, and the state it resolved. */
export interface EmbargoCheck {
  readonly refusals: readonly Refusal[];
  readonly violations: readonly MarketingViolation[];
  readonly resolutions: readonly EmbargoResolution[];
}

/**
 * Art 90(1) — unlawful disclosure of inside information.
 *
 * The violation here is not a phrasing. It is naming an asset whose listing (or any
 * intermediate step toward it, per Art 87(2)-(3)) is inside information that has not
 * been made public. "Something exciting coming for XYZ 👀" is the textbook case, and a
 * wording review passes it every time.
 *
 * Three outcomes and no fourth:
 *  - `mnpi_pending`  → `ART_90_ASSET_UNDER_EMBARGO`. Recovery is `wait_until` the
 *                      information is disclosed under Art 88(1), because there is no
 *                      wording that makes this safe and offering an edit path would be
 *                      a lie shaped like helpfulness.
 *  - `unknown`       → `EMBARGO_REGISTER_ABSENT` when the register is empty, otherwise
 *                      `ASSET_STATE_UNKNOWN`. Two codes because they need two different
 *                      people to fix them.
 *  - anything else   → no refusal. `announced` additionally raises the Art 88(1) gate
 *                      (§9), because a just-announced asset is exactly when someone
 *                      wants to combine the announcement with a promotion.
 */
export function checkEmbargo(
  namedAssets: readonly AssetSymbol[],
  register: EmbargoRegister,
  now: Instant,
): EmbargoCheck {
  const refusals: Refusal[] = [];
  const violations: MarketingViolation[] = [];
  const resolutions: EmbargoResolution[] = [];

  for (const asset of namedAssets) {
    const resolution = resolveEmbargo(asset, register, now);
    resolutions.push(resolution);

    if (resolution.state === 'mnpi_pending') {
      refusals.push(
        refusal(
          'ART_90_ASSET_UNDER_EMBARGO',
          `Do not publish this: ${asset} is under embargo, so naming it in public discloses inside ` +
            `information. ${resolution.narrative} Art 90(1) prohibits disclosure to any other person, and ` +
            '"the normal exercise of an employment" is not a defence a marketing desk can hold.',
          'art_90_1',
          {
            kind: 'wait_until',
            condition:
              `the inside information about ${asset} has been disclosed to the public under Art 88(1) and the ` +
              'embargo register row has been moved to `announced`',
          },
          asset,
        ),
      );
      continue;
    }

    if (resolution.state === 'unknown') {
      const registerIsEmpty = resolution.reason === 'register_empty';
      refusals.push(
        refusal(
          registerIsEmpty ? 'EMBARGO_REGISTER_ABSENT' : 'ASSET_STATE_UNKNOWN',
          `This desk cannot clear a post naming ${asset}, because it cannot tell whether ${asset} is under ` +
            `embargo. ${resolution.narrative}`,
          'art_90_1',
          {
            kind: 'supply_data',
            missing: registerIsEmpty
              ? 'the asset embargo register, or the rule for deriving it from listing state'
              : `an in-date embargo register row for ${asset}`,
            whoCanSupply:
              'the listings desk, countersigned by compliance — an engine may not infer an asset\'s ' +
              'inside-information state',
          },
          asset,
        ),
      );
      continue;
    }

    if (resolution.state === 'exempt_offer') {
      violations.push(
        violation(
          'embargo.exempt_offer_is_fragile',
          'art_87',
          asset,
          `${asset} is recorded as sitting under an Art 4(2)/(3) offer exemption. Art 4(4) can destroy that ` +
            'exemption with a single sentence in a single post, and that check belongs to the regime lane, ' +
            'not here. Route this item through it before clearing.',
        ),
      );
    }
  }

  return { refusals, violations, resolutions };
}

/* ════════ §7 GATE 2 — Art 91(3)(c) — THE UNDISCLOSED HOLDING ════════ */

/**
 * A conflict-of-interest disclosure, as Art 91(3)(c) requires it to exist.
 *
 * The Article's remedy is disclosure "SIMULTANEOUSLY ... TO THE PUBLIC in a proper and
 * effective way". Each of those words removes an option people reach for:
 *  - "simultaneously" kills the follow-up post and the correction-later pattern.
 *  - "to the public" kills the holdings register filed with compliance, and kills a DM.
 *  - "in a proper and effective way" is why `inArtefact` exists: a disclosure the
 *    reader has to click through to find is not effective. The same reasoning appears
 *    in Commission Guidance 2021/C 526/01 §4.2.6 for paid-promotion labels.
 */
export interface ConflictDisclosure {
  /** The assets this disclosure actually covers. A disclosure about ABC does not cover XYZ. */
  readonly assets: readonly AssetSymbol[];
  /** True only where the text sits inside the artefact the public sees. */
  readonly inArtefact: boolean;
  readonly audience: 'public' | 'internal' | 'private_to_counterparty';
  readonly text: string;
  /**
   * When the disclosure becomes visible. `null` where it is part of the same artefact
   * and therefore simultaneous by construction. A value LATER than the opinion is the
   * case the Article forecloses, and it is checked rather than assumed away.
   */
  readonly visibleFrom: Instant | null;
}

/** Each way a purported disclosure fails to cure. Separate facts, kept separate. */
export type DisclosureCureFailure =
  | 'absent'
  | 'not_in_artefact'
  | 'not_public'
  | 'asset_not_covered'
  | 'later_than_the_opinion';

export interface DisclosureCure {
  readonly cures: boolean;
  readonly failures: readonly DisclosureCureFailure[];
  readonly narrative: string;
}

const CURE_FAILURE_SENTENCE: Record<DisclosureCureFailure, string> = {
  absent: 'there is no conflict disclosure at all',
  not_in_artefact:
    'the disclosure is not in the artefact itself, and a disclosure held elsewhere is not made "in a proper and effective way"',
  not_public:
    'the disclosure is not public, and Art 91(3)(c) requires disclosure "to the public" — a register filed with compliance does not satisfy it',
  asset_not_covered: 'the disclosure does not name the asset the opinion is about',
  later_than_the_opinion:
    'the disclosure becomes visible after the opinion does, and Art 91(3)(c) requires it "simultaneously" — a disclosure made later does not cure',
};

/**
 * Does this disclosure cure the Art 91(3)(c) exposure for this asset?
 *
 * All four limbs must hold. They are evaluated independently and every failure is
 * reported, because telling an operator only the first thing wrong guarantees a second
 * round trip.
 */
export function assessDisclosureCure(
  asset: AssetSymbol,
  disclosure: ConflictDisclosure | null,
  opinionVisibleFrom: Instant | null,
): DisclosureCure {
  if (disclosure === null) {
    return {
      cures: false,
      failures: ['absent'],
      narrative: `No conflict disclosure accompanies this item, so the position in ${asset} is undisclosed.`,
    };
  }

  const failures: DisclosureCureFailure[] = [];
  if (!disclosure.inArtefact) failures.push('not_in_artefact');
  if (disclosure.audience !== 'public') failures.push('not_public');
  if (!disclosure.assets.some((a) => sameAsset(a, asset))) failures.push('asset_not_covered');

  // Simultaneity. `visibleFrom === null` on an in-artefact disclosure is simultaneous
  // by construction. Where a timestamp IS given, it must not be after the opinion — and
  // an unreadable timestamp on either side counts as later, not as earlier, because an
  // unverifiable simultaneity claim is not a satisfied one.
  if (disclosure.visibleFrom !== null) {
    if (!atOrBefore(disclosure.visibleFrom, opinionVisibleFrom)) {
      failures.push('later_than_the_opinion');
    }
  }

  if (failures.length === 0) {
    return {
      cures: true,
      failures,
      narrative:
        `The item carries a public conflict disclosure naming ${asset} in the artefact itself, so the ` +
        'Art 91(3)(c) conflict is disclosed simultaneously and to the public.',
    };
  }

  return {
    cures: false,
    failures,
    narrative:
      `The conflict disclosure does not cure the position in ${asset}: ` +
      `${failures.map((f) => CURE_FAILURE_SENTENCE[f]).join('; ')}.`,
  };
}

/**
 * Whose personal position Art 91(3)(c) attaches to on this item.
 *
 * The drafter AND the approver, at minimum. The approver is included because the
 * approval step is the moment the firm adopts the words, and a record saying
 * "approved by nik@lcx.com" without "does nik hold TOKEN" cannot answer the only
 * question that matters six months later.
 */
export interface AttributedActor {
  readonly actor: ActorId;
  readonly role: 'author' | 'approver' | 'named_spokesperson';
}

export interface HoldingCheck {
  readonly refusals: readonly Refusal[];
  readonly violations: readonly MarketingViolation[];
  readonly resolutions: readonly HoldingsResolution[];
  /** True where the factual-statement exemption was applied, with `stance.rationale` as the reason. */
  readonly factualExemptionApplied: boolean;
}

/**
 * Art 91(3)(c) — voicing an opinion while holding a position, undisclosed.
 *
 * The join is (every attributed actor) × (every named asset). Both dimensions matter:
 * one actor holding one of three named assets is enough, and a clean drafter does not
 * clear a holding approver.
 */
export function checkUndisclosedHolding(input: {
  readonly namedAssets: readonly AssetSymbol[];
  readonly stance: StanceAssessment;
  readonly attributedActors: readonly AttributedActor[];
  readonly holdings: HoldingsRegister;
  readonly disclosure: ConflictDisclosure | null;
  readonly opinionVisibleFrom: Instant | null;
  readonly now: Instant;
}): HoldingCheck {
  const refusals: Refusal[] = [];
  const violations: MarketingViolation[] = [];
  const resolutions: HoldingsResolution[] = [];

  const engaged = stanceEngagesArt91_3_c(input.stance.stance);

  if (input.attributedActors.length === 0 && input.namedAssets.length > 0 && engaged) {
    refusals.push(
      refusal(
        'HOLDINGS_DECLARATION_MISSING',
        'This item voices an opinion about a named asset but no author or approver is attributed to it, so ' +
          'there is nobody whose position can be checked. Art 91(3)(c) attaches to a natural person, and an ' +
          'unattributed item cannot be cleared against it.',
        'art_91_3_c',
        {
          kind: 'supply_data',
          missing: 'the attributed author and approver for this item',
          whoCanSupply: 'the desk — attribution is a record-keeping act, not an inference',
        },
        null,
      ),
    );
  }

  for (const attributed of input.attributedActors) {
    for (const asset of input.namedAssets) {
      const resolution = resolveHoldings(attributed.actor, asset, input.holdings, input.now);
      resolutions.push(resolution);

      if (!engaged) continue;

      if (resolution.state === 'declared_none') continue;

      if (resolution.state === 'declared_holding') {
        const cure = assessDisclosureCure(asset, input.disclosure, input.opinionVisibleFrom);
        if (cure.cures) continue;
        refusals.push(
          refusal(
            'ART_91_3_C_UNDISCLOSED_HOLDING',
            `Do not publish this: the ${attributed.role} (${attributed.actor}) holds ${asset} and this item ` +
              `voices an opinion about it. ${cure.narrative} Art 91(3)(c) makes that market manipulation, and ` +
              'Art 111(2)(d) sets administrative fines for a natural person from EUR 700 000.',
            'art_91_3_c',
            {
              kind: 'edit_text',
              what:
                `add a conflict-of-interest disclosure naming ${asset} to the text of this artefact itself, so ` +
                'it is public and simultaneous — a later post, a pinned note or a register entry does not cure it',
            },
            asset,
          ),
        );
        continue;
      }

      // `not_declared` and `register_absent`. The dangerous case, refused as such.
      refusals.push(
        refusal(
          'HOLDINGS_DECLARATION_MISSING',
          `This desk cannot clear an opinion about ${asset} by ${attributed.actor} (${attributed.role}), ` +
            `because it does not know whether they hold it. ${resolution.narrative} An undeclared author is ` +
            'the dangerous case, not the safe one.',
          'art_91_3_c',
          {
            kind: 'supply_data',
            missing:
              resolution.state === 'register_absent'
                ? 'the staff holdings declaration register'
                : `an in-date holdings declaration from ${attributed.actor} for ${asset}`,
            whoCanSupply:
              'the named individual, recorded by compliance. Art 91(3)(c) carries personal liability, so this ' +
              "is the owner's and legal's to produce and is not something this compartment may infer",
          },
          asset,
        ),
      );
    }
  }

  if (!engaged && input.namedAssets.length > 0) {
    violations.push(
      violation(
        'art_91_3_c.factual_exemption_applied',
        'art_91_3_c',
        input.namedAssets.join(', '),
        `No Art 91(3)(c) refusal was raised because the statement was assessed as factual rather than an ` +
          `opinion: ${input.stance.rationale} If that assessment is wrong, the exemption is wrong — the ` +
          'holdings resolutions are recorded alongside it so a reviewer can check both.',
      ),
    );
  }

  return { refusals, violations, resolutions, factualExemptionApplied: !engaged };
}

/* ════════ §8 GATE 3 — Art 91(2)(c) — REPEATING A RUMOUR ════════ */

/**
 * One thing the desk did to check the claim, before restating it.
 *
 * `at` is load-bearing: verification performed AFTER publication is not verification,
 * it is a post-mortem. `checkRumourRestatement` compares it against the publication
 * instant rather than accepting the list as evidence of diligence.
 */
export interface VerificationStep {
  readonly what: string;
  readonly source: string;
  readonly at: Instant;
  readonly outcome: 'confirmed_true' | 'confirmed_false' | 'inconclusive';
}

/**
 * Material in the desk's possession that CUTS AGAINST the rumour.
 *
 * This is the field that encodes the negligence standard. Art 91(2)(c) catches a person
 * who "knew, OR OUGHT TO HAVE KNOWN" the information was false or misleading, so the
 * question the engine must ask is not "did the desk believe it" but "what was on the
 * desk's own file". Contrary material on file is how "we thought it was true" becomes
 * "you ought to have known it was not".
 *
 * `heldSince` is required for the same reason `VerificationStep.at` is: material that
 * arrived after publication cannot found an ought-to-have-known at publication.
 */
export interface ContraryItem {
  readonly what: string;
  readonly source: string;
  readonly heldSince: Instant;
  readonly cuts: 'against_the_rumour' | 'against_our_restatement';
}

export interface RumourRestatement {
  readonly claimSummary: string;
  /**
   * Whether the claim is capable of giving signals as to supply, demand or price. Note
   * Art 91(2)(c) says "gives, OR IS LIKELY TO GIVE" — no actual price effect need be
   * shown — so this is a low bar and should be answered honestly rather than defensively.
   */
  readonly priceRelevant: boolean;
  /**
   * Whether OUR artefact reproduces the claim. Includes a debunk that restates the myth:
   * `Debunk.mythRestated` in `./types.js` republishes it by design, which is the
   * collision this gate exists to catch.
   */
  readonly restatesClaim: boolean;
  readonly verification: readonly VerificationStep[];
  readonly contraryMaterial: readonly ContraryItem[];
  /** What the desk actually thought. Recorded, and expressly NOT the legal test. */
  readonly beliefHeld: 'believed_true' | 'believed_false' | 'no_view';
}

/**
 * Which limb of Art 91(2)(c) produced the refusal. Same code, four different fixes, so
 * the basis is exported and asserted in tests rather than inferred from a sentence.
 */
export type RumourRefusalBasis =
  | 'contrary_material_on_file'
  | 'verified_false'
  | 'no_verification'
  | 'verification_inconclusive';

export interface RumourCheck {
  readonly refusals: readonly Refusal[];
  readonly violations: readonly MarketingViolation[];
  readonly basis: RumourRefusalBasis | null;
  /** Whether the artefact republishes the claim, by its own text or by its verb. */
  readonly republishes: boolean;
}

/**
 * Art 91(2)(c) — disseminating information, including a rumour, that the person knew or
 * OUGHT TO HAVE KNOWN was false or misleading.
 *
 * The counter-intuitive result this gate exists to deliver: the most natural crisis
 * reflex — quote-tweeting a false claim in order to rebut it — is the single
 * highest-risk action available to the desk. It republishes a price-relevant claim the
 * desk knows to be false, to a wider audience, in the firm's own voice. On the face of
 * Art 91(2)(c) that is dissemination of information known to be false. The remedy is
 * not "be careful"; it is to correct WITHOUT reproducing the claim, which is why the
 * recovery on the contrary-material limb is `edit_text` and not `wait_until`.
 *
 * Note the interaction with the verb model: `VERB_INHERITS_TARGET_RISK` from
 * `./types.js` is the authority on whether a verb republishes, so a `like` and a
 * `repost` are caught with no text of ours to read at all.
 */
export function checkRumourRestatement(input: {
  readonly verb: EngagementVerb;
  readonly rumour: RumourRestatement | null;
  /** When our artefact becomes public. `null` means the desk has not said. */
  readonly publishAt: Instant | null;
}): RumourCheck {
  const inheritsByVerb = VERB_INHERITS_TARGET_RISK[input.verb];

  if (input.rumour === null) {
    if (!inheritsByVerb) {
      return { refusals: [], violations: [], basis: null, republishes: false };
    }
    return {
      refusals: [
        refusal(
          'ADOPTION_OF_UNVERIFIED_TARGET',
          `A '${input.verb}' republishes the target's claims, and nothing on this item says whether the ` +
            'target carries a price-relevant claim or whether it was checked. There is no text of ours to ' +
            'review here, so the assessment is the only control available.',
          'art_91_2_c',
          {
            kind: 'supply_data',
            missing:
              'an assessment of the target: what it claims, whether that claim is price-relevant, and what ' +
              'the desk did to check it',
            whoCanSupply: 'the desk, before the verb is used and not after',
          },
          null,
        ),
      ],
      violations: [],
      basis: null,
      republishes: true,
    };
  }

  const rumour = input.rumour;
  const republishes = rumour.restatesClaim || inheritsByVerb;

  if (!republishes) {
    return { refusals: [], violations: [], basis: null, republishes: false };
  }

  if (!rumour.priceRelevant) {
    return {
      refusals: [],
      violations: [
        violation(
          'art_91_2_c.amplification_without_price_relevance',
          'art_91_2_c',
          rumour.claimSummary,
          'This item republishes a third-party claim assessed as not price-relevant, so Art 91(2)(c) is not ' +
            'engaged. The amplification cost still applies: restating a claim spreads it, and RESIST 2 treats ' +
            'the decision to engage as a decision with a cost.',
        ),
      ],
      basis: null,
      republishes: true,
    };
  }

  // Material the desk held BEFORE publishing. Where the publication instant is unknown,
  // every item counts — an unknown publication time may not buy the desk a defence.
  const contraryOnFile = rumour.contraryMaterial.filter(
    (item) =>
      item.cuts === 'against_the_rumour' &&
      (input.publishAt === null || atOrBefore(item.heldSince, input.publishAt)),
  );

  if (contraryOnFile.length > 0) {
    return {
      refusals: [
        refusal(
          'ART_91_2_C_RUMOUR_RESTATED',
          `Do not republish this claim: the desk's own file already contains material cutting against it — ` +
            `${contraryOnFile.map((c) => `${c.what} (${c.source}, held since ${c.heldSince})`).join('; ')}. ` +
            'Art 91(2)(c) catches dissemination where the person knew or ought to have known the information ' +
            'was false or misleading, and material on our own file settles the "ought to have known" limb ' +
            'against us. Rebutting by quoting still disseminates it.',
          'art_91_2_c',
          {
            kind: 'edit_text',
            what:
              'state the correction without reproducing the claim — lead with the fact, do not restate the ' +
              'myth, and do not quote or repost the original',
          },
          rumour.claimSummary,
        ),
      ],
      violations: [],
      basis: 'contrary_material_on_file',
      republishes: true,
    };
  }

  const stepsBeforePublish = rumour.verification.filter(
    (step) => input.publishAt === null || atOrBefore(step.at, input.publishAt),
  );

  const confirmedFalse = stepsBeforePublish.filter((s) => s.outcome === 'confirmed_false');
  if (confirmedFalse.length > 0) {
    return {
      refusals: [
        refusal(
          'ART_91_2_C_RUMOUR_RESTATED',
          `Do not republish this claim: the desk verified it as false (${confirmedFalse
            .map((s) => `${s.source}, ${s.at}`)
            .join('; ')}) and this item reproduces it anyway. Art 91(2)(c) catches dissemination of ` +
            'information the person KNEW was false, which is the stronger limb of the two.',
          'art_91_2_c',
          {
            kind: 'edit_text',
            what:
              'correct the record without reproducing the false claim, and do not use a verb that republishes ' +
              'it (quote, repost or like)',
          },
          rumour.claimSummary,
        ),
      ],
      violations: [],
      basis: 'verified_false',
      republishes: true,
    };
  }

  if (stepsBeforePublish.length === 0) {
    const laterSteps = rumour.verification.length - stepsBeforePublish.length;
    return {
      refusals: [
        refusal(
          'ART_91_2_C_RUMOUR_RESTATED',
          'Do not republish this price-relevant claim: nothing on this item records the claim being checked ' +
            `before publication${laterSteps > 0 ? ` (${laterSteps} verification step(s) are dated after it)` : ''}. ` +
            `The desk records its belief as '${rumour.beliefHeld}', and belief is not the standard — ` +
            'Art 91(2)(c) is satisfied by negligence, on an "ought to have known" test.',
          'art_91_2_c',
          {
            kind: 'supply_data',
            missing:
              'verification of the claim against a named source, dated before publication, with an outcome',
            whoCanSupply: 'the desk, or a subject-matter expert on the clearance lane',
          },
          rumour.claimSummary,
        ),
      ],
      violations: [],
      basis: 'no_verification',
      republishes: true,
    };
  }

  if (!stepsBeforePublish.some((s) => s.outcome === 'confirmed_true')) {
    return {
      refusals: [
        refusal(
          'ART_91_2_C_RUMOUR_RESTATED',
          'Do not republish this price-relevant claim: every verification step recorded before publication was ' +
            'inconclusive, so the desk knows the claim is unverified and would be restating it as though it ' +
            'were not. An unverified price-relevant claim is "likely to give ... misleading signals as to ' +
            'the supply of, demand for, or price of" the asset, which is the test Art 91(2)(c) applies.',
          'art_91_2_c',
          {
            kind: 'supply_data',
            missing: 'a verification step that resolves the claim either way',
            whoCanSupply: 'the desk, or a subject-matter expert on the clearance lane',
          },
          rumour.claimSummary,
        ),
      ],
      violations: [],
      basis: 'verification_inconclusive',
      republishes: true,
    };
  }

  return {
    refusals: [],
    violations: [
      violation(
        'art_91_2_c.verified_but_still_amplifies',
        'art_91_2_c',
        rumour.claimSummary,
        'The claim was verified true before publication, so Art 91(2)(c) is not engaged. Republishing it still ' +
          'amplifies it: keep the restatement to the minimum the correction needs, and prefer the RESIST 2 ' +
          'fact-myth-fallacy-fact structure over a bare quote.',
      ),
    ],
    basis: null,
    republishes: true,
  };
}

/* ════════ §9 GATE 4 — Art 88(1) — DISCLOSURE MUST NOT BE COMBINED WITH MARKETING ════════ */

/**
 * What the artefact is FOR. An artefact can hold several intents at once, and that is
 * precisely the problem Art 88(1) addresses.
 *
 * `inside_information_disclosure` means: this artefact is the vehicle by which inside
 * information is made public under Art 88(1). It is not "this post mentions something
 * confidential".
 */
export type ArtefactIntent =
  | 'inside_information_disclosure'
  | 'promotional'
  | 'factual_service_notice'
  | 'community_reply'
  | 'correction';

export interface CombinationCheck {
  readonly refusals: readonly Refusal[];
  readonly violations: readonly MarketingViolation[];
}

/**
 * Art 88(1) — "shall not combine the disclosure of inside information to the public
 * with the marketing of their activities".
 *
 * Almost nobody implements this, and it is breached BY CONSTRUCTION by the single most
 * natural artefact a venue produces: the celebratory listing post that both reveals the
 * listing and sells the platform. Two artefacts are required, and no wording fixes one
 * artefact, so the recovery is `different_surface` and never `edit_text`.
 *
 * `linkPresent` is treated as marketing for this purpose on the reasoning already
 * recorded in `RegimeClassification` in `./types.js`: ESMA's reverse-solicitation
 * guideline treats material as promotion once the audience is directed to the firm's
 * website. A disclosure post carrying a signup CTA has combined the two. That reasoning
 * is an analogy, and is flagged as one in the refusal sentence rather than presented as
 * a direct duty.
 */
export function checkDisclosureMixedWithMarketing(
  intents: readonly ArtefactIntent[],
  linkPresent: boolean,
): CombinationCheck {
  const discloses = intents.includes('inside_information_disclosure');
  if (!discloses) return { refusals: [], violations: [] };

  const promotional = intents.includes('promotional');
  if (!promotional && !linkPresent) {
    return {
      refusals: [],
      violations: [
        violation(
          'art_88_1.disclosure_artefact_must_stay_clean',
          'art_88_1',
          'inside_information_disclosure',
          'This artefact discloses inside information and carries no promotional intent or first-party link, ' +
            'so Art 88(1) is satisfied. Keep it that way: adding a CTA, a signup link or a product line later ' +
            'combines disclosure with marketing and voids this. Art 88(1) also requires the disclosure to be ' +
            'posted and maintained on the website for at least five years, which is a separate obligation this ' +
            'gate does not discharge.',
        ),
      ],
    };
  }

  const because = promotional
    ? linkPresent
      ? 'it is also marked promotional and carries a first-party link or CTA'
      : 'it is also marked promotional'
    : 'it carries a first-party link or CTA, which directs the audience to LCX and so functions as promotion ' +
      '(by analogy with ESMA\'s reverse-solicitation guideline — an analogy, not a direct duty)';

  return {
    refusals: [
      refusal(
        'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING',
        `Split this into two artefacts: it discloses inside information to the public and ${because}. ` +
          'Art 88(1) states that issuers, offerors and persons seeking admission to trading "shall not combine ' +
          'the disclosure of inside information to the public with the marketing of their activities". No ' +
          'wording fixes a single artefact that does both.',
        'art_88_1',
        {
          kind: 'different_surface',
          suggestion:
            'publish the disclosure on its own, with no link, no CTA and no product language, and maintain it ' +
            'on the website for at least five years as Art 88(1) requires. Then publish the marketing as a ' +
            'separate artefact, cleared separately, which may link to the disclosure.',
        },
        promotional ? 'promotional' : 'first_party_link',
      ),
    ],
    violations: [],
  };
}

/* ════════ §10 THE COMPOSITE — ALL FOUR GATES, NO WAY PAST ════════ */

export interface MarketAbuseInput {
  /** The act: verb, target, author, surface and the assets it names. */
  readonly act: EngagementAct;
  /** The text of our own words, used only for stance assessment. */
  readonly text: string;
  /**
   * Whose position Art 91(3)(c) attaches to. `act.author` is added automatically if it
   * is not already present, so an incomplete caller cannot accidentally exclude the
   * drafter from the check.
   */
  readonly attributedActors: readonly AttributedActor[];
  readonly declaredStance: DeclaredStance | null;
  readonly intents: readonly ArtefactIntent[];
  readonly linkPresent: boolean;
  readonly embargoRegister: EmbargoRegister;
  readonly holdingsRegister: HoldingsRegister;
  readonly disclosure: ConflictDisclosure | null;
  readonly rumour: RumourRestatement | null;
  /** When our artefact becomes public. Used for the simultaneity and diligence tests. */
  readonly publishAt: Instant | null;
  readonly now: Instant;
}

export interface MarketAbuseVerdict {
  /**
   * `refused` whenever `refusals` is non-empty, `flagged` when only violations were
   * raised, `clear` otherwise. Never `stripped`: nothing in Title VI can be stripped
   * into safety, and this module holds no strip path at all.
   */
  readonly disposition: Disposition;
  readonly refusals: readonly Refusal[];
  readonly violations: readonly MarketingViolation[];
  readonly stance: StanceAssessment;
  readonly embargo: readonly EmbargoResolution[];
  readonly holdings: readonly HoldingsResolution[];
  readonly rumourBasis: RumourRefusalBasis | null;
  /**
   * Whether the asset-specific limbs of Title VI could be evaluated at all. `false`
   * means the act names no asset — the Art 88(1) gate still ran, the other three could
   * not.
   */
  readonly assetLimbsEvaluated: boolean;
  readonly ruleSetVersion: number;
}

/**
 * Run every Title VI gate over one item.
 *
 * THERE IS NO OVERRIDE. No argument, flag, role or field in `MarketAbuseInput` can
 * suppress a refusal, and `disposition` is derived from `refusals.length` rather than
 * being an input. The only routes past a refusal are the `RefusalRecovery` it carries,
 * each of which requires somebody to actually supply the missing state, change the
 * words, or wait. That is the GPS perimeter pattern: a gate you can walk past is
 * decoration.
 *
 * Gate order is stable so refusal lists are diffable across runs: embargo (Art 90),
 * holdings (Art 91(3)(c)), rumour (Art 91(2)(c)), combination (Art 88(1)).
 */
export function assessMarketAbuse(input: MarketAbuseInput): MarketAbuseVerdict {
  const namedAssets = input.act.namedAssets;

  const attributed: AttributedActor[] = [...input.attributedActors];
  if (!attributed.some((a) => sameActor(a.actor, input.act.author))) {
    attributed.push({ actor: input.act.author, role: 'author' });
  }

  const stance = assessStance(input.text, input.declaredStance);

  const embargo = checkEmbargo(namedAssets, input.embargoRegister, input.now);
  const holding = checkUndisclosedHolding({
    namedAssets,
    stance,
    attributedActors: attributed,
    holdings: input.holdingsRegister,
    disclosure: input.disclosure,
    opinionVisibleFrom: input.publishAt,
    now: input.now,
  });
  const rumour = checkRumourRestatement({
    verb: input.act.verb,
    rumour: input.rumour,
    publishAt: input.publishAt,
  });
  const combination = checkDisclosureMixedWithMarketing(input.intents, input.linkPresent);

  const refusals: Refusal[] = [
    ...embargo.refusals,
    ...holding.refusals,
    ...rumour.refusals,
    ...combination.refusals,
  ];
  const violations: MarketingViolation[] = [
    ...embargo.violations,
    ...holding.violations,
    ...rumour.violations,
    ...combination.violations,
  ];

  /*
   * A directional statement that names no asset is a fact about the extractor, not about
   * the world. Say so rather than reporting a clean pass over an empty list.
   *
   * `error`, NOT `warning`, and the severity is the load-bearing part. "The Solana
   * listing is live tomorrow" extracts no symbol, so `checkEmbargo` loops an empty list
   * and `checkUndisclosedHolding` gates on `namedAssets.length > 0` — the two limbs
   * carrying unlawful disclosure and a EUR 700 000 personal fine both no-op, and this is
   * the ONLY finding that says so. As a warning it was raised, carried, and dropped: the
   * outbound gate cleared the draft, returned 201 and wrote `allowed: true`. There is
   * nowhere to "record which" other than by stopping.
   */
  if (namedAssets.length === 0 && stance.stance === 'directional') {
    violations.push(
      violation(
        'title_vi.directional_with_no_named_asset',
        'art_86',
        stance.findings.map((f) => f.matched).join(', '),
        'This item voices an opinion but names no asset, so the Art 90 and Art 91(3)(c) joins had nothing to ' +
          'run against. Either the asset extraction missed a symbol — in which case the two most dangerous ' +
          'gates were skipped — or the opinion is about something outside Title VI. Record which: name the ' +
          'asset with its ticker so the joins can run, or state that the opinion is not about a crypto-asset.',
        'error',
      ),
    );
  }

  return {
    disposition: refusals.length > 0 ? 'refused' : violations.length > 0 ? 'flagged' : 'clear',
    refusals,
    violations,
    stance,
    embargo: embargo.resolutions,
    holdings: holding.resolutions,
    rumourBasis: rumour.basis,
    assetLimbsEvaluated: namedAssets.length > 0,
    ruleSetVersion: MARKET_ABUSE_RULESET_VERSION,
  };
}

/* ════════ §11 NEED TO KNOW — WHO MAY READ THE Art 90 BASIS ════════ */

/**
 * ══ THE REFUSAL WAS ITSELF AN UNLAWFUL DISCLOSURE ══
 *
 * `checkEmbargo` hands `ART_90_ASSET_UNDER_EMBARGO` — with the asset, the basis, the
 * name of whoever recorded it and the date — to WHOEVER ASKED. The caller is a social
 * media drafter. Art 90(1) reads "No person in possession of inside information shall
 * unlawfully disclose inside information TO ANY OTHER PERSON", and an embargo row IS
 * inside information: it says a listing (or an intermediate step under Art 87(2)-(3))
 * exists and is not public. So the gate built to prevent an Art 90 disclosure was
 * performing one on every refusal, to a person with no need to know.
 *
 * It is worse than a leak of a fact. A drafter who reads that sentence is now IN
 * POSSESSION of inside information, and Art 89(2) then forbids them from trading the
 * asset — a legal disability the desk imposed on them silently, with no insider list and
 * no acknowledgement. The refusal made the reader an insider as a side effect of being
 * told they could not post.
 *
 * ══ AND REDACTING IT ENTIRELY IS ALSO WRONG ══
 * A refusal with no explanation leaves the drafter with no move. That is the 02:00
 * failure this compartment has already had once (`marketingMemory.test.ts`): when the
 * gate refuses without a route forward, humans route around the gate, and the real risk
 * goes UP. Both extremes are wrong, so the EXPLANATION is scoped and the REFUSAL is not.
 *
 * ══ WHAT A NON-CLEARED READER GETS, AND WHY EACH PART IS THERE ══
 *  · the draft is refused, in the same words whatever the register holds;
 *  · that the basis is held at a clearance they do not have — stated WITHOUT asserting
 *    that a restriction exists, because "there is a restriction" is the secret;
 *  · a ring to ask, as a ROLE and never a name (naming the recorder would confirm both
 *    that a row exists and who wrote it);
 *  · a reference that ties this exact refusal to its ledger row, so the approver they ask
 *    can look up the verdict instead of being asked "is SOL embargoed?" — which is the
 *    question a drafter must not have to ask out loud.
 *
 * ══ THE PROPERTY THIS RESTS ON ══
 * A non-cleared reader must not be able to tell `mnpi_pending` from `unknown` from an
 * empty register, because separating those three IS the oracle: two of them are benign
 * and one of them is the secret, so any observable difference identifies the secret. So
 * the scoped output is byte-identical across all three, carries ONE refusal rather than
 * one per asset (a count identifies how many symbols are restricted), carries
 * `matched: null` (the span identifies which), and empties `embargo` entirely — including
 * the resolutions that came back `clear`, because a per-asset array showing three clears
 * and one omission names the fourth.
 *
 * ══ WHAT THIS DOES NOT CLOSE, STATED PLAINLY ══
 * A drafter can still submit one symbol at a time and watch refused-versus-released. That
 * distinguishes "not cleared" from "cleared" — it does NOT distinguish embargo from
 * unknown from empty, which is the axis that carries Art 90 — and every probe writes its
 * own row into the 0062 ledger under the prober's name. The bulk bound in
 * `outboundGate.ts` is what forces that pattern to be many recorded requests instead of
 * one. This is a detectable residual, not a closed hole, and calling it closed would be
 * the lie.
 *
 * `embargo.exempt_offer_is_fragile` still names its asset to any reader, and that is a
 * decision rather than an oversight: an Art 4(2)/(3) OFFER exemption is a fact about a
 * public offer, not about unpublished inside information, and it is warning-severity so
 * the 0062 row (which records blocking findings only) holds no copy of it. Redacting it
 * would delete the drafter's only instruction — "route this through the regime lane" —
 * and leave the finding recorded nowhere at all.
 */
export type EmbargoBasisClearance = 'cleared' | 'not_cleared';

/**
 * The three codes the Art 90 limb emits, as data, so the scoping filter is a list a test
 * can read rather than a regex over sentences.
 *
 * `ASSET_STATE_UNKNOWN` is also emitted by `outboundGate.ts gateFailure` for a gate that
 * threw. That is why `scopeEmbargoDisclosure` runs on the market-abuse verdict ALONE,
 * before it is merged with anything: a filter applied to the merged list would silently
 * eat a gate-failure refusal and report the softer scoped one in its place.
 */
export const EMBARGO_LIMB_REFUSAL_CODES: readonly Refusal['code'][] = [
  'ART_90_ASSET_UNDER_EMBARGO',
  'EMBARGO_REGISTER_ABSENT',
  'ASSET_STATE_UNKNOWN',
];

/**
 * The states whose BASIS is inside information and therefore withholdable.
 *
 * `mnpi_pending` is the secret. `unknown` is in the list not because ignorance is secret
 * but because it must be indistinguishable from the secret — the whole point. `clear`,
 * `announced` and `exempt_offer` are not: an announced asset is public by definition, and
 * the other two are the absence of a live embargo.
 */
function embargoStateIsWithholdable(state: AssetEmbargoState): boolean {
  return state === 'mnpi_pending' || state === 'unknown';
}

/**
 * Is this reader inside the ring for the Art 90 basis on THIS item?
 *
 * Two ways in, and no third:
 *  · they are an approver — the ring the caller declares, see `viewerIsApprover`;
 *  · they RECORDED every withholdable restriction in play, so the verdict would tell them
 *    only what they themselves entered.
 *
 * THE SECOND TEST IS ALL-OR-NOTHING, and per-asset clearance was rejected for a reason
 * worth writing down: if a reader who recorded SOL's row saw SOL's resolution and not
 * BTC's, the OMISSION would name BTC. A clearance that leaks by omission is not a
 * clearance. So a recorder reads the full verdict only when every withheld restriction on
 * the item is their own; the moment somebody else's row is in play they are outside the
 * ring, exactly like any other drafter.
 *
 * A resolution with `entry: null` — an empty register, or an asset absent from one — can
 * never have been recorded by anybody, so those cases put every non-approver outside the
 * ring. That is the state this desk is in today: the register is `not_attested` by
 * design, so in practice only approvers are ever cleared.
 *
 * Actor comparison is EXACT, via `sameActor`. A near-match is not a match: this decides
 * who reads inside information, and it is not the place to be generous about whitespace.
 */
export function embargoBasisClearance(input: {
  readonly viewer: ActorId;
  readonly viewerIsApprover: boolean;
  readonly resolutions: readonly EmbargoResolution[];
}): EmbargoBasisClearance {
  if (input.viewerIsApprover) return 'cleared';
  const withheld = input.resolutions.filter((r) => embargoStateIsWithholdable(r.state));
  if (withheld.length === 0) return 'cleared';
  const allTheirOwn = withheld.every(
    (r) => r.entry !== null && sameActor(r.entry.recordedBy, input.viewer),
  );
  return allTheirOwn ? 'cleared' : 'not_cleared';
}

/**
 * Who a non-cleared drafter is told to ask. A ROLE, NEVER A NAME.
 *
 * Naming the person who recorded the row would confirm both that a row exists and who
 * wrote it, which is most of the secret. And this module holds no directory: inventing a
 * name here would be inventing a fact about a real person, which the house rules forbid
 * outright. `approver` is the role that already exists in `AttributedActor` — whoever may
 * clear outbound text on this desk — so this sentence points at a ring the compartment can
 * actually describe rather than at a person it cannot.
 */
export const EMBARGO_BASIS_RING =
  'an approver on this desk — the `approver` role in `AttributedActor`, i.e. anyone who may '
  + 'clear outbound text — or, failing that, whoever maintains the asset embargo register';

/**
 * THE ONE SENTENCE, AND WHY IT SAYS WHAT IT SAYS.
 *
 * `ASSET_STATE_UNKNOWN` IS A REUSED CODE, and that is a compromise this file should not
 * pretend is a design. The right code is a dedicated one — the reader's clearance is not
 * the asset's state — and `RefusalCode` lives in `types.ts`, which this pass does not own.
 * Of the codes that exist it is the only honest fit: from this reader's position the asset
 * state IS unknown, because the gate declines to state it. Two consequences are stated
 * rather than left to be discovered. First, it collapses three outcomes into one code, so
 * a refusal-frequency panel fed from RESPONSES will under-count `ART_90_ASSET_UNDER_EMBARGO`
 * — the 0062 gate ledger keeps the unscoped codes and is the authoritative read. Second,
 * `ASSET_STATE_UNKNOWN` already fires for benign reasons, which is a small mercy here: its
 * presence in a scoped verdict carries no signal at all.
 *
 * The sentence DISCLOSES ITS OWN UNIFORMITY — "the same sentence is returned whether the
 * register holds a restriction, holds nothing, or holds no rows" — so a reader cannot
 * over-read it as confirmation that something is embargoed. A redaction that hides the
 * fact of redaction invites exactly that inference.
 */
export function embargoBasisWithheldRefusal(reference: string): Refusal {
  return refusal(
    'ASSET_STATE_UNKNOWN',
    'This draft cannot be released. It names at least one crypto-asset symbol whose embargo '
      + 'state this desk will not state on this response, because the basis for that state is '
      + 'held at a clearance this account does not have. Read nothing into that: the same '
      + 'sentence is returned whether the register holds a restriction on one of these symbols, '
      + 'holds a row that cannot be resolved, or holds no rows at all. There is no wording '
      + `change that resolves it. Quote reference ${reference} to an approver — that reference `
      + 'identifies this exact check in the outbound gate ledger, so they can read the full '
      + 'verdict and tell you what to do with the draft without either of you naming an asset.',
    'art_90_1',
    {
      kind: 'supply_data',
      missing:
        'an approver\'s reading of the Art 90 embargo state of the symbols this draft names. '
        + 'The desk holds an answer; this account is not cleared to be shown it, so the missing '
        + 'input is the approver\'s decision rather than any fact the drafter can supply',
      whoCanSupply: EMBARGO_BASIS_RING,
    },
    /*
     * `null`, ALWAYS. `matched` is the offending span everywhere else in this module, and
     * here the offending span is the asset symbol — which is the thing being withheld. A
     * refusal that redacts the sentence and then puts the asset in `matched` has redacted
     * nothing; the field is rendered on every surface that renders a refusal.
     */
    null,
  );
}

/**
 * A market-abuse verdict, scoped to what one reader may be shown.
 *
 * `verdict` is the ONLY member safe to serialise to that reader. `unscopedRefusalCodes` is
 * for the control ledger and must never reach a response body — see the field comment.
 */
export interface ScopedMarketAbuseVerdict {
  /** Safe to hand to the reader this was scoped for. */
  readonly verdict: MarketAbuseVerdict;
  readonly clearance: EmbargoBasisClearance;
  /**
   * True when detail was actually removed. Carries no signal a non-cleared reader does not
   * already have from the refusal itself, and lets a surface say "the explanation on this
   * one is scoped" rather than implying the gate had nothing more to say.
   */
  readonly explanationWithheld: boolean;
  /**
   * ══ FOR THE RECORD ONLY. NEVER PUT THIS IN A RESPONSE. ══
   * The codes the limb ACTUALLY produced, so `recordGateDecision` can write the true
   * verdict to the 0062 ledger — without it an approver has nothing to look up and the
   * scoping becomes a deletion. Serialising this field to a non-cleared reader
   * reintroduces the exact oracle this section exists to close.
   */
  readonly unscopedRefusalCodes: readonly Refusal['code'][];
}

/**
 * Project a verdict for one reader. PURE, and it never weakens the refusal.
 *
 * `refusals` keeps every non-embargo refusal untouched and replaces the whole embargo limb
 * with ONE `embargoBasisWithheldRefusal`, placed FIRST so the documented gate order
 * (embargo, holdings, rumour, combination) still holds and refusal lists stay diffable.
 * `disposition` is recomputed from the scoped lists by the same rule
 * `assessMarketAbuse` uses, so a scoped verdict can never say `clear` where the unscoped
 * one said `refused`: the limb contributed at least one refusal in and exactly one out.
 *
 * `embargo` is emptied for a non-cleared reader UNCONDITIONALLY — including resolutions
 * that came back `clear` — because an array of four entries with one missing names the
 * missing one, and an array that shows `clear` for three symbols and nothing for the
 * fourth is the oracle wearing a different hat. Nothing downstream reads this field to
 * decide anything; `allowed` and `refusals` carry the decision.
 */
export function scopeEmbargoDisclosure(
  verdict: MarketAbuseVerdict,
  input: { readonly clearance: EmbargoBasisClearance; readonly reference: string },
): ScopedMarketAbuseVerdict {
  const unscopedRefusalCodes = verdict.refusals.map((r) => r.code);
  if (input.clearance === 'cleared') {
    return { verdict, clearance: 'cleared', explanationWithheld: false, unscopedRefusalCodes };
  }

  const limb = verdict.refusals.filter((r) => EMBARGO_LIMB_REFUSAL_CODES.includes(r.code));
  const kept = verdict.refusals.filter((r) => !EMBARGO_LIMB_REFUSAL_CODES.includes(r.code));
  const refusals: readonly Refusal[] =
    limb.length === 0 ? kept : [embargoBasisWithheldRefusal(input.reference), ...kept];

  return {
    verdict: {
      ...verdict,
      refusals,
      disposition:
        refusals.length > 0 ? 'refused' : verdict.violations.length > 0 ? 'flagged' : 'clear',
      embargo: [],
    },
    clearance: 'not_cleared',
    explanationWithheld: limb.length > 0,
    unscopedRefusalCodes,
  };
}
