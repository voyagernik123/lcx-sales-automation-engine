import type { OfferKey } from './types.js';
import { OFFER_KEYS } from './types.js';

/**
 * GPS PHASE 9.3 — THE JURISDICTION PERIMETER. Compiled policy, not a table.
 *
 * WHY THIS IS CODE AND A TABLE WOULD BE WORSE. The original mandate asked for
 * `jurisdiction_profile` and `service_perimeter` as database rows — and
 * `catalogue.ts:5-19` already refused that for the offer catalogue with the
 * reason that applies twice as hard here: **policy in a table is policy that
 * changes without code review.** An UPDATE statement can turn
 * `counsel_required` into `permitted` for every offer in a jurisdiction, at
 * 2am, with no diff, no reviewer, no deploy and no way to answer "who decided
 * this and when" six months later. The seller is an employee of an
 * EU/Liechtenstein-regulated exchange selling market-access-adjacent services;
 * the perimeter is the sentence that decides whether a given piece of work may
 * be quoted at all. Every widening of it should cost a pull request. The repo
 * already puts commercial and legal policy in reviewed code — the claim library
 * (`claims/claims.ts:6`), the offer catalogue (`gps/catalogue.ts:130`), the
 * source registry (`provenance.ts:48`) — and this file joins that set.
 *
 * WHAT THIS FILE DOES NOT DO: it does not originate a single regulatory
 * conclusion. There is no function here that reads "Cayman" and decides
 * anything, for the reason already stated at `targeting.ts:205-212` and
 * `types.ts:307-311` — `GpsClient.jurisdiction` is deliberately free text
 * because every jurisdiction rule available to the author of this programme is
 * unverified recalled training data. WebSearch and WebFetch were non-functional
 * in the environment where this was written, so **nothing regulatory could be
 * verified.** The design that follows is the correct one regardless of tooling:
 * a qualified HUMAN enters a position, cites a source, signs it, and gives it an
 * EXPIRY; the machine's entire job is to enforce that record and to REFUSE when
 * it is stale or absent.
 *
 * D2 (refusals are explicit and reasoned) is the whole point. An unlisted
 * jurisdiction does not fall through to permitted, and it does not fall through
 * to prohibited either — "no one has looked at this" is a third thing, and
 * calling it `prohibited` would be inventing a legal conclusion in the
 * conservative direction, which is still inventing one. It classifies `unknown`,
 * carries a sentence, and cannot be treated as permission by any caller.
 */

/**
 * How a given service may be delivered into a given jurisdiction, as decided by
 * a human. Four classes, closed union, deliberately no `permitted_with_notice`
 * or other soft middle: soft middles are where an unreviewed position hides.
 *
 * `counsel_required` and `partner_required` are CONDITIONS, not permissions —
 * `gateService` refuses until the condition is asserted as met by the caller,
 * which is why they are separate from `permitted` rather than flags on it.
 */
export type ServiceClass =
  | 'permitted'
  | 'counsel_required'
  | 'partner_required'
  | 'prohibited';

export const SERVICE_CLASS_LABEL: Record<ServiceClass, string> = {
  permitted: 'Permitted',
  counsel_required: 'Counsel required',
  partner_required: 'Local partner required',
  prohibited: 'Prohibited',
};

/**
 * What a caller may treat as a live answer. `unknown` is a first-class value and
 * NOT a member of `ServiceClass`, on purpose: the type system then makes
 * `classification.serviceClass === 'permitted'` false for an unlisted
 * jurisdiction at compile time as well as at runtime, and a caller who
 * exhaustively switches on the class is forced to write the `unknown` arm.
 */
export type PerimeterClass = ServiceClass | 'unknown';

/**
 * One human-entered position: jurisdiction × offer → class, with the four things
 * that make it defensible rather than folklore.
 *
 * `reviewBy` is an EXPIRY, not a reminder. Regulatory positions rot — MiCA
 * transitional windows, a new supervisory statement, a changed contracting
 * entity — and a perimeter with no expiry is a perimeter that silently outlives
 * the facts it was based on. Past `reviewBy` the entry still reports its
 * recorded class (D3: uncertainty sits BESIDE the estimate, never inside it —
 * we do not blank the class, we flag it stale) but it can no longer authorise
 * anything.
 */
export interface PerimeterEntry {
  serviceClass: ServiceClass;
  /**
   * The citation. A statute, an instrument, a supervisory statement, a written
   * counsel opinion with a date — whatever the human actually relied on. Free
   * text because a citation is not an enum; never blank, and
   * `perimeterEntryDefects` reports it when it is.
   */
  source: string;
  /** Optional deep link to the cited source. Never fetched by anything. */
  sourceUrl?: string;
  /**
   * The named human accountable for the position. A person, never a service
   * account and never 'system' — mirrors `GpsConflictCheck.decidedBy`
   * (`types.ts:357`). `UNASSIGNED` marks a shipped placeholder.
   */
  enteredBy: string;
  /** ISO instant the human entered it. */
  enteredAt: string;
  /** ISO instant it stops authorising anything. Hard expiry. */
  reviewBy: string;
  /** Why, in the decider's words. Goes on the screen next to the class. */
  note: string;
  /**
   * FALSE until a qualified human has reviewed this exact row. An unreviewed
   * row can never yield `permitted` — see `classify`. This is what keeps the
   * shipped placeholders below from reading as permission.
   */
  reviewed: boolean;
}

/**
 * A jurisdiction and its per-offer positions.
 *
 * An offer absent from `offers` classifies `unknown` for that offer. There is
 * deliberately NO per-jurisdiction default class: a blanket default is exactly
 * how a jurisdiction ends up permitted for an offer nobody considered.
 */
export interface JurisdictionProfile {
  /** Canonical key — the output of `normaliseJurisdiction`. */
  jurisdiction: string;
  /** Display name for surfaces. */
  label: string;
  offers: Readonly<Partial<Record<OfferKey, PerimeterEntry>>>;
}

/* ── Jurisdiction string handling (string work only, never legal reasoning) ── */

/**
 * Synonyms ONLY. Every pair here is two spellings of the same place.
 *
 * WHAT IS BANNED HERE, PERMANENTLY: containment. `germany → eu` would be a
 * regulatory conclusion — whether an EU-level position covers a member state
 * depends on the instrument, the passporting route and the contracting entity,
 * and encoding it as a string alias would smuggle a legal opinion into a lookup
 * table. `normaliseJurisdiction('Germany')` therefore returns `'germany'`,
 * which is unlisted, which classifies `unknown`, which refuses. That is the
 * correct behaviour and there is a test asserting it.
 */
const JURISDICTION_ALIASES: Record<string, string> = {
  li: 'liechtenstein',
  fl: 'liechtenstein',
  'principality of liechtenstein': 'liechtenstein',
  us: 'us',
  usa: 'us',
  // Punctuation becomes whitespace before lookup, so "U.S." and "U.S.A." arrive
  // here already split into letters.
  'u s': 'us',
  'u s a': 'us',
  'united states': 'us',
  'united states of america': 'us',
  eu: 'eu',
  'european union': 'eu',
};

/**
 * Fold a human-typed jurisdiction string to a lookup key: trim, lower-case,
 * strip punctuation, collapse whitespace, then apply synonyms. Pure and total;
 * returns `''` for input that contains no word characters, which is unlisted,
 * which refuses.
 */
export function normaliseJurisdiction(input: string | null | undefined): string {
  if (typeof input !== 'string') return '';
  const folded = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return JURISDICTION_ALIASES[folded] ?? folded;
}

/* ── The shipped perimeter: UNREVIEWED PLACEHOLDERS ────────────────────────── */

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SHIPPED PERIMETER IS NOT A PERIMETER. NOTHING BELOW IS A LEGAL POSITION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Exported so surfaces can BADGE the perimeter rather than render a
 * finished-looking wall — the same device as `PRICE_BANDS_ARE_PLACEHOLDERS`
 * (`catalogue.ts:58`) and `COORDINATION_HOURS_ARE_PLACEHOLDERS`
 * (`delivery.ts`). A placeholder perimeter presented as a real one is worse than
 * having none, because it would launder an invented regulatory conclusion
 * through an authoritative-looking screen.
 *
 * Flipping this constant to `false` does NOT unlock anything: every shipped row
 * carries `reviewed: false` AND `reviewBy === enteredAt`, so each one is stale
 * on arrival and independently incapable of authorising work. Two locks, because
 * one boolean is one careless edit.
 */
export const PERIMETER_IS_UNREVIEWED = true;

/** The one sentence a surface must show whenever it renders the perimeter. */
export const PERIMETER_UNREVIEWED_REASON =
  'This perimeter contains placeholder rows only. No qualified human has entered, sourced or reviewed a jurisdictional position, and no regulatory fact was verifiable when it was written. Every row is expired on arrival and authorises nothing.';

/**
 * A fixed past instant, so the placeholder rows are byte-identical across
 * builds and every test asserting staleness is deterministic rather than
 * dependent on when it runs.
 */
const PLACEHOLDER_INSTANT = '2026-07-31T00:00:00.000Z';

/**
 * Build one placeholder row. `counsel_required` is chosen as the placeholder
 * class because it is the only one of the four that asserts nothing about the
 * jurisdiction — "ask a qualified lawyer" is a statement about our own ignorance,
 * whereas `permitted` and `prohibited` are both findings we are not entitled to
 * make, and `partner_required` implies we know the shape of the local
 * requirement. It is also belt-and-braces: even a reviewed `counsel_required`
 * still refuses in `gateService` until counsel is actually engaged.
 */
function unreviewedPlaceholder(jurisdictionLabel: string): PerimeterEntry {
  return {
    serviceClass: 'counsel_required',
    source: 'PLACEHOLDER — no source. Nothing was verified.',
    enteredBy: 'UNASSIGNED',
    // reviewBy === enteredAt: stale the instant it exists. Deliberate.
    enteredAt: PLACEHOLDER_INSTANT,
    reviewBy: PLACEHOLDER_INSTANT,
    note: `PLACEHOLDER for ${jurisdictionLabel}. This is NOT a position about ${jurisdictionLabel}; it is the absence of one, shaped so the structure can be exercised and surfaced. A qualified human must replace it with a sourced, signed, dated entry.`,
    reviewed: false,
  };
}

/** Every offer in a jurisdiction gets a row: a hole in the grid reads as an oversight. */
function placeholderGrid(label: string): Readonly<Partial<Record<OfferKey, PerimeterEntry>>> {
  const out: Partial<Record<OfferKey, PerimeterEntry>> = {};
  for (const k of OFFER_KEYS) out[k] = unreviewedPlaceholder(label);
  return out;
}

/**
 * THREE jurisdictions, not thirty. Each is named only because it already appears
 * in this repo's own facts — Liechtenstein and the EU because LCX is licensed
 * there (`claims/claims.ts:11`), the US because a US strategy exists as a
 * separate workspace. Their presence here is NOT a claim that work may be done
 * in them; see every note above.
 */
export const PERIMETER_PROFILES: readonly JurisdictionProfile[] = [
  { jurisdiction: 'liechtenstein', label: 'Liechtenstein', offers: placeholderGrid('Liechtenstein') },
  { jurisdiction: 'eu', label: 'European Union', offers: placeholderGrid('the European Union') },
  { jurisdiction: 'us', label: 'United States', offers: placeholderGrid('the United States') },
];

/** Look up a profile by any spelling of the jurisdiction. */
export function getJurisdictionProfile(
  jurisdiction: string | null | undefined,
  profiles: readonly JurisdictionProfile[] = PERIMETER_PROFILES,
): JurisdictionProfile | null {
  const key = normaliseJurisdiction(jurisdiction);
  if (!key) return null;
  return profiles.find((p) => p.jurisdiction === key) ?? null;
}

/**
 * Structural defects in a human-entered row, as data rather than a comment.
 *
 * Exported so the wall can show a row that is malformed instead of trusting it:
 * a `reviewed: true` entry with a blank source or an unparseable date is the
 * most dangerous row in the file, because it is the one that would authorise
 * work. Returns `[]` for a well-formed row.
 */
export function perimeterEntryDefects(e: PerimeterEntry): readonly string[] {
  const out: string[] = [];
  if (!e.source.trim()) out.push('No source cited.');
  if (!e.enteredBy.trim() || e.enteredBy === 'UNASSIGNED') out.push('No named human accountable for the position.');
  if (!e.note.trim()) out.push('No note explaining the position.');
  if (!Number.isFinite(Date.parse(e.enteredAt))) out.push(`enteredAt "${e.enteredAt}" is not a valid instant.`);
  if (!Number.isFinite(Date.parse(e.reviewBy))) out.push(`reviewBy "${e.reviewBy}" is not a valid instant.`);
  return out;
}

/* ── classify ──────────────────────────────────────────────────────────────── */

/**
 * Why the classification is not usable as permission. `ok` means a fresh,
 * reviewed, well-formed human position was found — it does NOT mean permitted;
 * the class still decides that.
 */
export type PerimeterStatus =
  | 'ok'
  | 'unknown_jurisdiction'
  | 'unknown_offer'
  | 'unreviewed'
  | 'stale'
  | 'malformed'
  | 'unevaluable_asof';

export const PERIMETER_STATUS_LABEL: Record<PerimeterStatus, string> = {
  ok: 'Current',
  unknown_jurisdiction: 'Jurisdiction not in perimeter',
  unknown_offer: 'Offer not classified for this jurisdiction',
  unreviewed: 'Entered but not reviewed',
  stale: 'Review expired',
  malformed: 'Entry malformed',
  unevaluable_asof: 'Expiry could not be evaluated',
};

/**
 * The answer, with its own workings attached (D1). Every field a surface needs
 * to show WHY is here: the entry, the two timestamps the staleness arithmetic
 * used, and the day count it produced.
 */
export interface PerimeterClassification {
  /** Exactly what the human typed, so the surface can echo it back. */
  jurisdictionInput: string;
  /** The canonical key, or `null` when nothing was listed under it. */
  jurisdiction: string | null;
  /** Display label of the matched profile; null when unmatched. */
  jurisdictionLabel: string | null;
  offerKey: OfferKey;
  /**
   * The RECORDED class, or `'unknown'` when no human entered one. A stale entry
   * still reports its recorded class — staleness travels beside it in `stale`,
   * never folded into it (D3).
   */
  serviceClass: PerimeterClass;
  status: PerimeterStatus;
  /**
   * The ONLY field a caller may read as permission. True iff a reviewed,
   * well-formed, unexpired human entry says `permitted`. Every other path —
   * unknown jurisdiction, unclassified offer, unreviewed row, expired row,
   * malformed row, unparseable `asOf` — is false. This is D2 made structural:
   * there is no combination of inputs to this function under which a missing or
   * stale position reads as permission.
   */
  permitted: boolean;
  /** True past `reviewBy`, and true when expiry could not be evaluated. */
  stale: boolean;
  /** True inside `PERIMETER_REVIEW_WARNING_DAYS` of `reviewBy`, and not yet stale. */
  expiringSoon: boolean;
  /**
   * Whole days past `reviewBy` as of `asOf`; negative means days remaining.
   * Null when there is no entry or the arithmetic was impossible. Shown so the
   * number on screen can be re-derived from `reviewBy` and `asOf` by hand.
   */
  daysPastReview: number | null;
  /** The matched row, verbatim, for the wall. Null when nothing matched. */
  entry: PerimeterEntry | null;
  /** `perimeterEntryDefects(entry)`, or `[]`. */
  defects: readonly string[];
  /** One sentence, written for a human reading a refusal (D2). Never blank. */
  reason: string;
  /** The instant the question was asked, echoed for the printed artifact (D7). */
  asOf: string;
}

/** How long before `reviewBy` a row starts warning. Not a grace period — a warning. */
export const PERIMETER_REVIEW_WARNING_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Classify jurisdiction × offer as of an instant.
 *
 * `asOf` is REQUIRED, not defaulted to `Date.now()`. Two reasons: a defaulted
 * clock makes expiry untestable without faking time, and — more importantly — a
 * classification that appears on a printed artifact must state the instant it was
 * true (D7). An unparseable `asOf` FAILS CLOSED (`unevaluable_asof`, `stale:
 * true`) rather than falling back to the wall clock: silently substituting a
 * different instant than the caller asked about is how an expired perimeter gets
 * reported as current.
 *
 * `profiles` is injectable so the API can eventually pass a reviewed set, and so
 * tests can construct positions without the shipped placeholders (which, by
 * design, can never be permitted).
 *
 * Pure and total. Never throws.
 */
export function classify(
  jurisdiction: string | null | undefined,
  offer: OfferKey,
  asOf: string,
  profiles: readonly JurisdictionProfile[] = PERIMETER_PROFILES,
): PerimeterClassification {
  const input = typeof jurisdiction === 'string' ? jurisdiction : '';
  const base = {
    jurisdictionInput: input,
    offerKey: offer,
    expiringSoon: false,
    daysPastReview: null,
    entry: null,
    defects: [] as readonly string[],
    asOf,
  };

  const profile = getJurisdictionProfile(input, profiles);
  if (!profile) {
    return {
      ...base,
      jurisdiction: null,
      jurisdictionLabel: null,
      serviceClass: 'unknown',
      status: 'unknown_jurisdiction',
      permitted: false,
      stale: false,
      reason: input.trim()
        ? `No human has entered a perimeter position for "${input.trim()}". This is not a finding that work there is prohibited — it is the absence of a finding, and it cannot be read as permission.`
        : 'No jurisdiction was recorded for this client. A perimeter cannot be evaluated against a blank jurisdiction, and an unevaluated perimeter is not a permitted one.',
    };
  }

  const matched = { jurisdiction: profile.jurisdiction, jurisdictionLabel: profile.label };
  const entry = profile.offers[offer] ?? null;
  if (!entry) {
    return {
      ...base,
      ...matched,
      serviceClass: 'unknown',
      status: 'unknown_offer',
      permitted: false,
      stale: false,
      reason: `${profile.label} has perimeter entries, but none for offer "${offer}". A position on one service is not a position on another.`,
    };
  }

  const defects = perimeterEntryDefects(entry);
  const asOfMs = Date.parse(asOf);
  const reviewMs = Date.parse(entry.reviewBy);

  // Fail closed on either unparseable timestamp: report the recorded class so the
  // wall still shows what the human decided, but authorise nothing.
  if (!Number.isFinite(asOfMs) || !Number.isFinite(reviewMs)) {
    return {
      ...base,
      ...matched,
      entry,
      defects,
      serviceClass: entry.serviceClass,
      status: 'unevaluable_asof',
      permitted: false,
      stale: true,
      reason: !Number.isFinite(asOfMs)
        ? `The evaluation instant "${asOf}" is not a valid ISO timestamp, so expiry could not be checked. Refusing rather than assuming the position is current.`
        : `The entry's reviewBy "${entry.reviewBy}" is not a valid ISO timestamp, so expiry could not be checked. Refusing rather than assuming the position is current.`,
    };
  }

  const daysPastReview = Math.floor((asOfMs - reviewMs) / MS_PER_DAY);
  const stale = asOfMs >= reviewMs;
  const expiringSoon = !stale && daysPastReview >= -PERIMETER_REVIEW_WARNING_DAYS;
  const cls = entry.serviceClass;
  const dated = `Entered by ${entry.enteredBy} on ${entry.enteredAt.slice(0, 10)}, review due ${entry.reviewBy.slice(0, 10)}.`;

  if (defects.length > 0) {
    return {
      ...base, ...matched, entry, defects, serviceClass: cls, status: 'malformed',
      permitted: false, stale, expiringSoon, daysPastReview,
      reason: `The ${profile.label} entry for "${offer}" is not a usable record: ${defects.join(' ')} An unattributable or unsourced position authorises nothing.`,
    };
  }

  if (stale) {
    return {
      ...base, ...matched, entry, defects, serviceClass: cls, status: 'stale',
      permitted: false, stale: true, expiringSoon: false, daysPastReview,
      reason: `The ${profile.label} position for "${offer}" (${SERVICE_CLASS_LABEL[cls]}) expired ${daysPastReview} day(s) ago. ${dated} A regulatory position past its review date is a historical record, not a current one.`,
    };
  }

  if (!entry.reviewed) {
    return {
      ...base, ...matched, entry, defects, serviceClass: cls, status: 'unreviewed',
      permitted: false, stale: false, expiringSoon, daysPastReview,
      reason: `The ${profile.label} position for "${offer}" is recorded as NOT REVIEWED. ${dated} An unreviewed entry is a draft, and a draft perimeter authorises nothing.`,
    };
  }

  return {
    ...base, ...matched, entry, defects, serviceClass: cls, status: 'ok',
    permitted: cls === 'permitted', stale: false, expiringSoon, daysPastReview,
    reason: cls === 'permitted'
      ? `${SERVICE_CLASS_LABEL[cls]} in ${profile.label} for "${offer}". ${dated} Source: ${entry.source}`
      : `${SERVICE_CLASS_LABEL[cls]} in ${profile.label} for "${offer}" — this is a condition, not permission. ${dated} Source: ${entry.source}`,
  };
}

/* ── gateService — the hard refusal used before quoting ─────────────────────── */

/**
 * Why the service may not be quoted. Closed union so a surface can be
 * exhaustive; `perimeter_*` codes are the record's problem, the other two are
 * conditions the caller has not met.
 */
export type ServiceGateCode =
  | 'perimeter_unknown_jurisdiction'
  | 'perimeter_unknown_offer'
  | 'service_prohibited'
  | 'perimeter_malformed'
  | 'perimeter_stale'
  | 'perimeter_unreviewed'
  | 'counsel_not_engaged'
  | 'local_partner_not_named';

/**
 * Evaluation order. Deliberate, and one ordering choice is load-bearing:
 * `service_prohibited` is evaluated BEFORE `perimeter_stale`. A prohibition that
 * has passed its review date is still a human saying no; if staleness were
 * checked first, the refusal a client would see would degrade from "counsel
 * recorded this as prohibited" to "the entry expired" purely by the passage of
 * time — a refusal that gets vaguer as it ages is a refusal that eventually gets
 * ignored. The prohibition is reported, and the staleness travels with it in
 * `classification.stale`.
 */
export const SERVICE_GATE_ORDER: readonly ServiceGateCode[] = [
  'perimeter_unknown_jurisdiction',
  'perimeter_unknown_offer',
  'service_prohibited',
  'perimeter_malformed',
  'perimeter_stale',
  'perimeter_unreviewed',
  'counsel_not_engaged',
  'local_partner_not_named',
] as const;

/* ── What a refusal MEANS when there is no position to refuse from ──────────── */

/**
 * The codes that report the ABSENCE OF A HUMAN POSITION rather than a decision a
 * human took. Everything else in `SERVICE_GATE_ORDER` is somebody's recorded
 * answer: `service_prohibited` is a human saying no, and `counsel_not_engaged` /
 * `local_partner_not_named` are conditions attached to a position that exists and
 * is reviewed, current and well formed — the gate cannot reach either of them
 * otherwise.
 *
 * This split is the whole mechanism behind advisory operation, and it is DERIVED
 * FROM THE RECORD, not configured. There is no setting, no flag and no
 * environment variable anywhere in this file: the moment a reviewed, well-formed,
 * unexpired position exists for a jurisdiction × offer pair, `classify` returns
 * `status: 'ok'` for it, no absence code can be produced for it, and that pair
 * blocks again — with no edit here and nothing for a human to remember to switch
 * back. Its neighbours, which still have no position, stay advisory. Self-healing
 * is not a feature added on top; it is what "the perimeter is empty" stopping
 * being true does on its own.
 *
 * `perimeter_malformed` belongs on this list. A row that cites no source or
 * names no accountable human is not a position anybody took, whatever it says in
 * its `serviceClass` — and if what it says is `prohibited`, the prohibition gate
 * fires first and the act is blocked regardless.
 */
export const PERIMETER_ABSENCE_CODES: readonly ServiceGateCode[] = [
  'perimeter_unknown_jurisdiction',
  'perimeter_unknown_offer',
  'perimeter_malformed',
  'perimeter_stale',
  'perimeter_unreviewed',
] as const;

/**
 * The sentence that must appear on every quote, proposal and engagement produced
 * while no position is on file. It is not a disclaimer in small print: it is the
 * only honest description of what the artifact rests on, which is nothing.
 */
export const NO_LEGAL_POSITION_NOTICE =
  'No legal position on file. No qualified human has entered a reviewed, sourced, unexpired '
  + 'position for this jurisdiction and this offer, so nothing here has been cleared. The '
  + 'perimeter was consulted, it refused, and the refusal was recorded rather than enforced.';

/**
 * Is there a human position here that could be enforced at all? True only for a
 * reviewed, well-formed, unexpired entry — exactly `classify`'s `ok`. The two
 * extra conjuncts are belt-and-braces against a future `ok` that forgets one.
 */
export function hasLegalPositionOnFile(c: PerimeterClassification): boolean {
  return c.status === 'ok' && c.entry !== null && c.defects.length === 0;
}

/**
 * What the verdict MEANS, travelling beside the verdict and never inside it (D3).
 *
 * `blocked` is the only field an enforcement point may act on. It is NOT the
 * negation of `allowed`: a refusal whose code reports the absence of any position
 * is `allowed: false, advisory: true, blocked: false`, and the caller proceeds
 * while recording exactly what it proceeded past.
 */
export interface PerimeterDisposition {
  /** True iff a reviewed, well-formed, unexpired human position was found. */
  legalPositionOnFile: boolean;
  /** True when the gate refused for want of a position, and the act proceeds anyway. */
  advisory: boolean;
  /** True when the act must be refused. Prohibitions and unevaluable checks always are. */
  blocked: boolean;
  /** `gateService`'s own code, unchanged. Null iff allowed. */
  gateCode: ServiceGateCode | null;
  /** `gateService`'s own sentence, unchanged. Null iff allowed. */
  gateReason: string | null;
  /** `NO_LEGAL_POSITION_NOTICE` whenever `legalPositionOnFile` is false; else null. */
  notice: string | null;
}

/**
 * Derive the disposition from a decision. Pure, total, and it changes NOTHING
 * about the decision it reads.
 *
 * Two things always block, whatever the state of the perimeter:
 *   - `prohibited`. If a human has written down that a thing is forbidden, the
 *     emptiness of the rest of the matrix is not an argument against them. Tested
 *     on a prohibition that is also stale, and one that is also unreviewed.
 *   - `unevaluable_asof`. Advisory operation is the consequence of a perimeter
 *     that is EMPTY, never of one that could not be READ; an unparseable instant
 *     means the check did not happen, and a check that did not happen is a
 *     refusal on the same reasoning `classify` fails closed on it.
 */
export function perimeterDisposition(
  d: Pick<ServiceGateDecision, 'allowed' | 'code' | 'reason' | 'classification'>,
): PerimeterDisposition {
  const legalPositionOnFile = hasLegalPositionOnFile(d.classification);
  const base = {
    legalPositionOnFile,
    gateCode: d.code,
    gateReason: d.reason,
    notice: legalPositionOnFile ? null : NO_LEGAL_POSITION_NOTICE,
  };
  if (d.allowed) return { ...base, advisory: false, blocked: false };
  const absent =
    d.code !== null
    && PERIMETER_ABSENCE_CODES.includes(d.code)
    && d.classification.serviceClass !== 'prohibited'
    && d.classification.status !== 'unevaluable_asof';
  return { ...base, advisory: absent, blocked: !absent };
}

/**
 * One evaluated gate. `skipped` gates were never reached — never silently
 * passed. Same shape and same reasoning as `GateResult` (`partners.ts:595`):
 * "reporting an unevaluated check as passed is how a gate becomes theatre".
 */
export interface ServiceGateResult {
  code: ServiceGateCode;
  passed: boolean;
  skipped: boolean;
  detail: string;
}

export interface ServiceGateInput {
  /** Free text, as the human typed it (`GpsClient.jurisdiction`, `types.ts:310`). */
  jurisdiction: string | null | undefined;
  offer: OfferKey;
  /** ISO instant. Required — see `classify`. */
  asOf: string;
  /**
   * The NAME of the counsel actually engaged for this engagement, not a boolean.
   *
   * A boolean is a checkbox anyone can tick and nobody signs; a name is
   * attributable six months later when someone asks who advised on this. Blank
   * and whitespace-only are treated as not engaged. Only clears
   * `counsel_required` — it cannot clear a prohibition.
   */
  counselEngaged?: string | null;
  /**
   * The id of the named local delivery partner (`partners.ts` bench). Same
   * reasoning as `counselEngaged`: an id, not a flag. Only clears
   * `partner_required`.
   */
  localPartnerId?: string | null;
  profiles?: readonly JurisdictionProfile[];
}

/**
 * The composite decision.
 *
 * `allowed` here and `classification.permitted` answer DIFFERENT questions, and
 * conflating them would be a bug: `permitted` means "a human classified this
 * service in this jurisdiction as permitted outright"; `allowed` means "given
 * the record and the conditions the caller has asserted, this may be quoted
 * now". A `counsel_required` jurisdiction with counsel named is `allowed: true`
 * and `permitted: false`, and both are correct.
 */
export interface ServiceGateDecision {
  allowed: boolean;
  /** Non-null iff `allowed` is false. */
  code: ServiceGateCode | null;
  /** Non-null iff `allowed` is false. One sentence for a human (D2). */
  reason: string | null;
  /** What would clear it. Null when the honest answer is "do not do this work". */
  remedy: string | null;
  /** False when the answer is a wall rather than a task (`GateHit`, `targeting.ts:421`). */
  recoverable: boolean;
  /** The classification this decision rests on, with its own workings (D1). */
  classification: PerimeterClassification;
  /** Every gate in `SERVICE_GATE_ORDER`, including the ones not reached. */
  gates: readonly ServiceGateResult[];
  /** What the caller asserted, echoed back for the record. */
  conditionsAsserted: { counsel: string | null; localPartner: string | null };
  /**
   * What the verdict above MEANS — `perimeterDisposition`, computed here so that
   * every caller of `gateService`, on either side of the API, reads ONE derivation
   * of it. `allowed`, `code`, `reason`, `remedy`, `recoverable` and `gates` are
   * untouched by its presence: the disposition interprets the verdict, it does not
   * participate in reaching it.
   */
  disposition: PerimeterDisposition;
}

function named(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * MAY WE QUOTE THIS SERVICE INTO THIS JURISDICTION? A hard gate that refuses by
 * default and regularly should.
 *
 * Refuses on: unknown jurisdiction, unclassified offer, prohibited, malformed
 * record, expired review, unreviewed draft. Requires a named counsel where the
 * position says `counsel_required` and a named local partner where it says
 * `partner_required`.
 *
 * THERE IS DELIBERATELY NO OVERRIDE PARAMETER. Not `force`, not `acceptRisk`,
 * not `founderApproved`. A boolean that defeats a regulatory refusal is the
 * single most dangerous field this file could expose, because it would be set
 * once in a hurry and then live in every call site forever. If an escalation
 * path is ever genuinely needed, it must be a persisted, signed, dated record
 * with a named decider — i.e. a new REVIEWED `PerimeterEntry`, which is a code
 * review — not an argument. A test asserts that no combination of the two
 * condition arguments can clear a prohibition.
 *
 * Pure and total. Never throws.
 */
export function gateService(input: ServiceGateInput): ServiceGateDecision {
  const classification = classify(input.jurisdiction, input.offer, input.asOf, input.profiles);
  const counsel = named(input.counselEngaged);
  const localPartner = named(input.localPartnerId);
  const conditionsAsserted = { counsel, localPartner };
  const gates: ServiceGateResult[] = [];

  const refuse = (
    code: ServiceGateCode,
    detail: string,
    recoverable: boolean,
    remedy: string | null,
  ): ServiceGateDecision => {
    gates.push({ code, passed: false, skipped: false, detail });
    for (const c of SERVICE_GATE_ORDER.slice(SERVICE_GATE_ORDER.indexOf(code) + 1)) {
      gates.push({ code: c, passed: false, skipped: true, detail: 'not reached' });
    }
    const verdict = { allowed: false as const, code, reason: detail, remedy, recoverable, classification };
    return { ...verdict, gates, conditionsAsserted, disposition: perimeterDisposition(verdict) };
  };
  const pass = (code: ServiceGateCode, detail: string): void => {
    gates.push({ code, passed: true, skipped: false, detail });
  };

  const cls = classification.serviceClass;

  if (classification.status === 'unknown_jurisdiction') {
    return refuse('perimeter_unknown_jurisdiction', classification.reason, true,
      'A qualified human enters a sourced, signed, dated position for this jurisdiction and offer. Never inferred from the jurisdiction string.');
  }
  pass('perimeter_unknown_jurisdiction', `"${classification.jurisdictionInput}" resolves to ${classification.jurisdictionLabel}.`);

  if (classification.status === 'unknown_offer') {
    return refuse('perimeter_unknown_offer', classification.reason, true,
      `A qualified human classifies offer "${input.offer}" for ${classification.jurisdictionLabel}. A position on another service does not transfer.`);
  }
  pass('perimeter_unknown_offer', `Offer "${input.offer}" is classified for ${classification.jurisdictionLabel}.`);

  // Before staleness, on purpose — see SERVICE_GATE_ORDER.
  if (cls === 'prohibited') {
    return refuse('service_prohibited',
      `${classification.jurisdictionLabel} is recorded as PROHIBITED for "${input.offer}". ${classification.entry?.note ?? ''} Source: ${classification.entry?.source ?? 'none'}.`.trim(),
      false, null);
  }
  pass('service_prohibited', `Recorded class is ${cls === 'unknown' ? 'unknown' : SERVICE_CLASS_LABEL[cls]}, not prohibited.`);

  if (classification.status === 'malformed') {
    return refuse('perimeter_malformed', classification.reason, true,
      'Repair the entry: cite the source, name the accountable human, and give valid enteredAt/reviewBy instants.');
  }
  pass('perimeter_malformed', 'Entry is well formed.');

  if (classification.stale) {
    return refuse('perimeter_stale', classification.reason, true,
      'A qualified human re-reviews the position and extends reviewBy, or records a new class. The perimeter is not extended by the fact that nobody got round to it.');
  }
  pass('perimeter_stale', `Review not due until ${classification.entry?.reviewBy.slice(0, 10)} (${-(classification.daysPastReview ?? 0)} day(s) remaining).`);

  if (classification.status === 'unreviewed') {
    return refuse('perimeter_unreviewed', classification.reason, true,
      'A qualified human reviews the drafted position and marks it reviewed. Until then it is somebody\'s note, not a perimeter.');
  }
  pass('perimeter_unreviewed', 'Position is marked reviewed.');

  if (cls === 'counsel_required' && !counsel) {
    return refuse('counsel_not_engaged',
      `${classification.jurisdictionLabel} requires counsel for "${input.offer}" and no counsel is named on this engagement. ${classification.entry?.note ?? ''}`.trim(),
      true, 'Name the counsel actually engaged. The offer catalogue provides no legal advice (catalogue.ts:104), so this is counsel the client or LCX instructs, not us.');
  }
  pass('counsel_not_engaged', counsel ? `Counsel named: ${counsel}.` : 'Counsel not required by the recorded position.');

  if (cls === 'partner_required' && !localPartner) {
    return refuse('local_partner_not_named',
      `${classification.jurisdictionLabel} requires a local delivery partner for "${input.offer}" and none is named. ${classification.entry?.note ?? ''}`.trim(),
      true, 'Name a partner from the bench with a capability covering this jurisdiction (partners.ts capabilityCoversJurisdiction), then re-run the gate.');
  }
  pass('local_partner_not_named', localPartner ? `Local partner named: ${localPartner}.` : 'Local partner not required by the recorded position.');

  const cleared = { allowed: true as const, code: null, reason: null, remedy: null, recoverable: true, classification };
  return { ...cleared, gates, conditionsAsserted, disposition: perimeterDisposition(cleared) };
}
