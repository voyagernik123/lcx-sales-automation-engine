/**
 * MARKETING — THE PROVENANCE LADDER (M3).
 *
 * Wave 1 closed the forgeable mailbox by requiring DKIM or ARC evidence before an
 * inbound item is accepted at all. This file is the rung structure above that: every
 * inbound item leaves here carrying an Admiralty grade, the list of what corroborated
 * it, and — when nothing did — a QUARANTINED state that is deliberately NOT a grade.
 *
 * ── ONE GRADING SCHEME, AND IT ALREADY EXISTED ───────────────────────────────
 * The Admiralty scale lives in `packages/shared/src/provenance.ts` (`Reliability` A–F,
 * `Credibility` 1–6, `admiraltyCode`, `confidenceFrom`, and the two label maps). This
 * file DEFINES NO SECOND SCALE. It only decides which rung an item stands on, and
 * `admiraltyCode` renders it. GPS uses the same scale for the same reason
 * (`gps/book.ts:1180`), including its F6-for-a-placeholder convention.
 *
 * ── QUARANTINE IS NOT A GRADE ────────────────────────────────────────────────
 * The old ingest graded a forged email `C3` — "fairly reliable, possibly true" — which
 * is exactly the shape of an answer, and that is the problem: a fabricated reply
 * attributed to a journalist entered a regulated audit trail wearing the same clothes
 * as a real one (mkt-r5 §1.1). Quarantine therefore carries `grade: null`. There is no
 * letter, no digit, no confidence number, because "we cannot judge this" is not a
 * weak fact, it is the absence of one. Anything that wants to display a grade must
 * handle the null, and that is on purpose.
 *
 * ── WHAT MAKES CORROBORATION REAL ────────────────────────────────────────────
 * `oembed.ts` reads X's own official, documented, keyless oEmbed endpoint. It is an
 * INDEPENDENT channel from the mailbox: whoever can send SMTP to the forwarding
 * address cannot make publish.twitter.com agree with them. So "an email says this" and
 * "an email says this and X says this" are different rungs. That independence is the
 * whole mechanism; a second read of the same email would be decoration.
 *
 * ── WHAT AN UNCONFIRMED POST IS NOT ──────────────────────────────────────────
 * A post oEmbed could not confirm is NOT proven fake. Deleted, protected, rate-limited
 * and unreachable are four different things, and only the first two are facts about the
 * post. An outage produces `oembed_unavailable` — a lower rung with a stated reason —
 * and the BATCH says out loud that it was degraded (`BatchNotice`). A channel outage
 * that quietly lowered a whole queue's grade with nobody told would be the same failure
 * as reading a 200-with-zero-bytes as "nothing happened" (mkt-r3 §2.1).
 *
 * ── MIRRORS ARE DISCOVERY, NEVER TEXT ────────────────────────────────────────
 * `nitter.net/lcx/rss` works and is the only keyless discovery of @lcx's own timeline
 * (mkt-r3 §1.6). It is also an anonymous third-party proxy, so if its text were stored,
 * a mirror operator would control what LCX's own instrument believes LCX said. A mirror
 * item therefore yields an id and nothing else: `storableText` is null unless oEmbed
 * confirmed the post, and then the storable text is oEmbed's, never the mirror's.
 *
 * ── NO DENOMINATOR EXISTS ────────────────────────────────────────────────────
 * Counts here are lower bounds and are named as lower bounds. Reach, impressions,
 * follower delta, engagement rate, CTR, share of voice and audience sentiment are
 * refused by `refuseForbiddenMetric` — not omitted quietly, refused with the substitute
 * named (plan §3, §4 rule 3).
 *
 * PURE. No I/O, no database, no clock of its own beyond what the caller passes in. The
 * one network call in this compartment is in `oembed.ts`, and its RESULT is an input
 * here.
 */
import {
  admiraltyCode,
  confidenceFrom,
  CREDIBILITY_LABEL,
  RELIABILITY_LABEL,
  type Credibility,
  type Reliability,
} from '@lcx/shared';
import type { OEmbedResult, SyndicationObservation } from './oembed.js';

/** Where an inbound item physically came from. */
export type IngestChannel =
  /** Forwarded X notification email — the mailbox anyone can write to. */
  | 'x_notification_email'
  /** A named human pasted it, from their own logged-in session. */
  | 'human_paste'
  /** A public X mirror (nitter et al). DISCOVERY ONLY — never a text source. */
  | 'x_mirror'
  /** Undocumented syndication counters. Never a text source, graded low. */
  | 'syndication_undocumented';

/**
 * DKIM/ARC evidence, recorded per row.
 *
 * SPF is deliberately absent: the arrangement is a forwarding rule, so the forwarder is
 * the sender and SPF is guaranteed to fail (RFC 7489; ARC exists for exactly this hop,
 * RFC 8617). A `From:` header check is spoofable and worthless alone (mkt-r5 §1.1).
 *
 * NOTE FOR THE INGEST OWNER: this interface is structural on purpose. It is the shape
 * this file needs, not a claim about how the mailbox reader produces it.
 */
export interface SenderAuthEvidence {
  dkimPass: boolean;
  /** The `d=` value of the surviving signature. */
  dkimDomain: string | null;
  arcPass: boolean;
  /** Who sealed the ARC chain. Trusted only if the deployment names it. */
  arcSealerDomain: string | null;
  /** Kept verbatim for the audit trail — the evidence, not our summary of it. */
  rawAuthenticationResults: string | null;
}

/** Signing domains that count as X. A subdomain of one of these also counts. */
const X_SIGNING_DOMAINS = ['x.com', 'twitter.com'] as const;

export function isXSigningDomain(domain: string | null | undefined): boolean {
  const d = (domain ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!d) return false;
  return X_SIGNING_DOMAINS.some((base) => d === base || d.endsWith(`.${base}`));
}

export interface LadderOptions {
  /**
   * ARC sealers this deployment trusts — normally the LCX mailbox provider, trusted
   * because LCX owns it. EMPTY BY DEFAULT: with no sealer configured, an ARC-only
   * message cannot be authenticated and is quarantined with that stated as the reason.
   * An unconfigured trust anchor must not silently become a trusted one.
   */
  trustedArcSealers?: readonly string[];
  /** Health of the corroboration channel, from `oembedHealth()`. */
  channelCooling?: boolean;
}

/** An inbound item as the ingest hands it over. Every field may be absent. */
export interface InboundItem {
  /** Our own row identity (the x_comment_id, in practice). */
  itemId: string | null;
  channel: IngestChannel | null;
  /** Who the item CLAIMS wrote it. Untrusted until a second channel agrees. */
  claimedAuthorHandle: string | null;
  claimedPostId: string | null;
  /** The text as the channel delivered it. Untrusted. */
  claimedText: string | null;
  /** When WE received it. Never presented as when the post was written. */
  receivedAt: string | null;
  /** Required for `x_notification_email`; meaningless elsewhere. */
  sender: SenderAuthEvidence | null;
  /** `null` means the lookup was NOT ATTEMPTED — distinct from "attempted, unknown". */
  oembed: OEmbedResult | null;
  /** Optional, low-graded, undocumented. */
  syndication: SyndicationObservation | null;
  /** The named human, for `human_paste`. */
  operator: string | null;
  /** Which mirror, for `x_mirror`. Recorded so the hint's origin is auditable. */
  mirrorHost: string | null;
}

/** The rungs, best first. Each is a real situation, not a score bucket. */
export type LadderRung =
  | 'email_oembed_confirmed'
  | 'oembed_confirmed_single_channel'
  | 'email_oembed_text_not_comparable'
  | 'email_text_diverged'
  | 'email_post_not_public'
  | 'email_oembed_unavailable'
  | 'email_authenticated_unchecked'
  | 'operator_paste_asserted'
  | 'syndication_undocumented_only';

interface RungDef {
  reliability: Reliability;
  credibility: Credibility;
  /** One sentence an operator reads instead of a code. */
  statement: string;
  /** Why this rung and not the one above it. */
  rationale: string;
}

export const LADDER: Record<LadderRung, RungDef> = {
  email_oembed_confirmed: {
    reliability: 'B',
    credibility: 1,
    statement: 'An authenticated X notification, corroborated by X’s own oEmbed endpoint, with consistent text.',
    rationale: 'Two independent channels agree. Credibility 1 is literally "confirmed by other sources".',
  },
  oembed_confirmed_single_channel: {
    reliability: 'B',
    credibility: 2,
    statement: 'Confirmed against X’s own oEmbed endpoint. One channel only — nothing independent agrees with it yet.',
    rationale: 'First-party and keyless, so usually reliable; but a single channel cannot be "confirmed by other sources".',
  },
  email_text_diverged: {
    reliability: 'C',
    credibility: 4,
    statement: 'An authenticated X notification whose text does not match what oEmbed returns. A human must read both.',
    rationale:
      'The mail genuinely came from X, so this is more likely a crude body extraction or an edited post than a forgery — which is why it is graded down rather than quarantined. Divergence on an UNAUTHENTICATED channel is quarantined instead.',
  },
  email_oembed_text_not_comparable: {
    reliability: 'B',
    credibility: 2,
    statement: 'An authenticated X notification; oEmbed confirms the post and its author, but the two texts are too different in shape to compare.',
    rationale:
      'Author and existence are confirmed by an independent channel; the text is not. Credibility 2, because claiming 1 would assert a confirmation the comparison did not make.',
  },
  email_post_not_public: {
    reliability: 'B',
    credibility: 3,
    statement: 'An authenticated X notification for a post that is no longer publicly retrievable — deleted, protected or suspended.',
    rationale:
      'Existence is well-evidenced by the authenticated mail; the current text cannot be re-checked. Deletion is ordinary, so this is not "doubtful", it is unverifiable-now.',
  },
  email_oembed_unavailable: {
    reliability: 'C',
    credibility: 3,
    statement: 'An authenticated X notification. Corroboration was attempted and the channel did not answer.',
    rationale: 'Exactly the old default grade, and correct here: nothing independent has agreed, through no fault of the item.',
  },
  email_authenticated_unchecked: {
    reliability: 'C',
    credibility: 3,
    statement: 'An authenticated X notification. Corroboration has not been attempted.',
    rationale: 'Same standing as an outage: one channel, unconfirmed. The distinction is recorded in the rung, not the grade.',
  },
  operator_paste_asserted: {
    reliability: 'C',
    credibility: 3,
    statement: 'A named operator asserted this text. No independent channel has confirmed it.',
    rationale:
      'A human reading their own logged-in session is a real source, but the assertion and the text are the same channel, so it cannot self-corroborate.',
  },
  syndication_undocumented_only: {
    reliability: 'D',
    credibility: 4,
    statement: 'From X’s undocumented syndication backend. Counters only — never a source of text.',
    rationale:
      'X’s own infrastructure, so it cannot lie about X’s content, but it is not a public contract (it accepted token=a). Low by design, per mkt-r3 §1.5b.',
  },
};

/** Quarantine reasons. Distinct namespace from grades, because quarantine is not one. */
export type QuarantineCode =
  | 'MKT_PROV_SENDER_UNVERIFIED'
  | 'MKT_PROV_ARC_SEALER_UNTRUSTED'
  | 'MKT_PROV_AUTHOR_MISMATCH'
  | 'MKT_PROV_TEXT_CONTRADICTED'
  | 'MKT_PROV_MIRROR_UNCORROBORATED'
  | 'MKT_PROV_NO_TEXT';

interface QuarantineDef {
  message: string;
  rule: string;
}

export const QUARANTINE: Record<QuarantineCode, QuarantineDef> = {
  MKT_PROV_SENDER_UNVERIFIED: {
    message:
      'This notification carries no surviving X DKIM signature and no ARC chain, so nothing shows it came from X. Quarantined: it is not graded, and it is not fed to the drafter or counted in the SLA.',
    rule: 'Plan §4 rule 6 (corroborate before believing); mkt-r5 §1.1 — the polled mailbox is a public inbound write path.',
  },
  MKT_PROV_ARC_SEALER_UNTRUSTED: {
    message:
      'The only evidence is an ARC chain, and this deployment has not named a trusted ARC sealer. An unconfigured trust anchor is not a trusted one.',
    rule: 'RFC 8617 — an ARC chain is only evidence if you trust the sealer. Absent configuration is a refusal, never a default pass.',
  },
  MKT_PROV_AUTHOR_MISMATCH: {
    message:
      'X’s own endpoint says this post belongs to a different handle than the item claims. That is not a parsing difference; the attribution is wrong. Quarantined.',
    rule: 'Plan §4 rule 6. Attributing words to a named person inside a regulated audit trail is the harm in mkt-r5 §1.1.',
  },
  MKT_PROV_TEXT_CONTRADICTED: {
    message:
      'The text this item carries does not match what X returns for the same post, and the channel is not authenticated. Quarantined rather than graded.',
    rule: 'Plan §4 rule 6. On an unauthenticated channel, divergence is the forgery signal.',
  },
  MKT_PROV_MIRROR_UNCORROBORATED: {
    message:
      'This id came from a public X mirror and oEmbed has not confirmed it. A mirror is a discovery hint, never a source of text — storing its text would let the mirror operator decide what LCX believes LCX said.',
    rule: 'mkt-r3 §1.6; plan §6 (mirror-as-source explicitly killed).',
  },
  MKT_PROV_NO_TEXT: {
    message: 'The item carries no readable text and no confirmed text from any channel. There is nothing here to grade.',
    rule: 'Plan §4 rule 3 — absent data produces a refusal, never a zero.',
  },
};

/** Refusals: the item could not be evaluated at all. */
export type LadderRefusalCode =
  | 'MKT_PROV_NO_ITEM_ID'
  | 'MKT_PROV_UNKNOWN_CHANNEL'
  | 'MKT_PROV_NO_RECEIVED_AT'
  | 'MKT_PROV_NO_POST_ID'
  | 'MKT_PROV_NO_OPERATOR'
  | 'MKT_PROV_NO_SYNDICATION_DATA'
  | 'MKT_PROV_EMPTY_QUEUE';

export const LADDER_REFUSAL: Record<LadderRefusalCode, QuarantineDef> = {
  MKT_PROV_NO_ITEM_ID: {
    message: 'The item has no id, so nothing can be graded, recorded against it, or found again.',
    rule: 'Plan §4 rule 5 — nothing leaves without a record.',
  },
  MKT_PROV_UNKNOWN_CHANNEL: {
    message: 'The item does not say which channel it arrived on. A grade without a channel is a number with no provenance.',
    rule: 'Plan §4 rule 6.',
  },
  MKT_PROV_NO_RECEIVED_AT: {
    message: 'The item has no receipt time. Refused rather than stamped with now(), which would invent a fact about the past.',
    rule: 'Plan §4 rule 3 — absent data produces a refusal, never a default.',
  },
  MKT_PROV_NO_POST_ID: {
    message: 'The item has no X post id, so it can never be corroborated against X. Refused rather than graded on one channel forever.',
    rule: 'Plan §4 rule 6.',
  },
  MKT_PROV_NO_OPERATOR: {
    message: 'A pasted item with no named operator has no source at all. Refused: "a human said so" requires knowing which human.',
    rule: 'Plan §4 rule 5 — the record must name the human.',
  },
  MKT_PROV_NO_SYNDICATION_DATA: {
    message: 'This item is from the undocumented syndication source but carries no observation, so there is nothing to grade.',
    rule: 'Plan §4 rule 3 — absent data produces a refusal, never a zero.',
  },
  MKT_PROV_EMPTY_QUEUE: {
    message: 'There are no inbound items to grade. The register is EMPTY — this is not a clean bill of health.',
    rule: 'The house pattern: an empty register refuses honestly and says it is empty (GPS perimeter).',
  },
};

/* ── TEXT AGREEMENT ─────────────────────────────────────────────────────────── */

export type TextAgreement = 'consistent' | 'not_comparable' | 'contradicted';

export interface TextComparison {
  verdict: TextAgreement;
  /** Share of the smaller word set present in the other, 0–1. Null when not comparable. */
  overlap: number | null;
  comparableWords: number;
  note: string;
}

/** URLs are dropped: X rewrites links to t.co, so their absence proves nothing. */
function words(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^\p{L}\p{N}@#]+/gu, ' ')
      .split(' ')
      .filter((w) => w.length > 1),
  );
}

/**
 * Compare a channel's text with X's. Three verdicts, and the middle one is real: the
 * email body extractor is deliberately crude and capped at 4,000 chars, so a partial
 * overlap is genuinely uninformative and must not be reported as either agreement or
 * contradiction.
 */
export function compareText(claimed: string | null, confirmed: string | null): TextComparison {
  const a = words(claimed ?? '');
  const b = words(confirmed ?? '');
  const smaller = a.size <= b.size ? a : b;
  const larger = smaller === a ? b : a;
  if (smaller.size < 4) {
    return {
      verdict: 'not_comparable',
      overlap: null,
      comparableWords: smaller.size,
      note: 'Too few comparable words to say anything. Not treated as agreement and not treated as contradiction.',
    };
  }
  let hits = 0;
  for (const w of smaller) if (larger.has(w)) hits += 1;
  const overlap = hits / smaller.size;
  if (overlap >= 0.6) {
    return { verdict: 'consistent', overlap, comparableWords: smaller.size, note: 'The two channels say the same thing.' };
  }
  if (overlap <= 0.25) {
    return { verdict: 'contradicted', overlap, comparableWords: smaller.size, note: 'The two channels do not say the same thing.' };
  }
  return {
    verdict: 'not_comparable',
    overlap,
    comparableWords: smaller.size,
    note: 'Partial overlap. The body extractor is crude by design, so this is not evidence either way.',
  };
}

/* ── VERDICTS ───────────────────────────────────────────────────────────────── */

/** One thing that did (or did not) back the item up. */
export interface Corroboration {
  channel: 'oembed' | 'x_notification_email' | 'human_paste' | 'x_mirror' | 'syndication_undocumented';
  /** Did this channel support the item, contradict it, or say nothing? */
  outcome: 'supported' | 'contradicted' | 'unavailable' | 'not_attempted' | 'discovery_only';
  detail: string;
  /** When this channel was consulted, when we know. */
  at: string | null;
  /** True for sources whose contract X does not publish. */
  undocumented?: true;
}

export interface GradeStamp {
  code: string;
  reliability: Reliability;
  credibility: Credibility;
  label: string;
  /** 0–100 from `confidenceFrom`, with no staleness decay applied at grading time. */
  confidence: number;
}

interface VerdictBase {
  itemId: string;
  channel: IngestChannel;
  corroborations: Corroboration[];
  /** DKIM/ARC evidence carried through so the caller persists it per row. */
  senderEvidence: SenderAuthEvidence | null;
}

export interface GradedVerdict extends VerdictBase {
  state: 'graded';
  rung: LadderRung;
  grade: GradeStamp;
  statement: string;
  rationale: string;
  /** The ONLY text the caller may persist as this item's content. */
  storableText: string | null;
  /** X's own reading of who wrote it, when a confirmed lookup gave one. */
  confirmedAuthorHandle: string | null;
  /**
   * The post's calendar date from X, `YYYY-MM-DD`, or null. NEVER the email header
   * date: that is mail latency, not when a human typed (mkt-r3 §1.1, defect #5).
   */
  postedOnDisplayed: string | null;
  postedAtExact: string | null;
  postedAtSource: 'oembed_displayed_date' | 'syndication_undocumented' | 'unknown';
  /** True when a human has to read this before it is trusted. */
  needsHumanRead: boolean;
  /** True when the post is no longer publicly retrievable. */
  noLongerPublic: boolean;
  textComparison: TextComparison | null;
}

export interface QuarantinedVerdict extends VerdictBase {
  state: 'quarantined';
  /** Quarantine has NO grade. Not F6, not C3 — null. */
  grade: null;
  code: QuarantineCode;
  message: string;
  rule: string;
  /** Nothing from a quarantined item may be stored as content. */
  storableText: null;
}

export interface RefusedVerdict {
  state: 'refused';
  itemId: string | null;
  grade: null;
  code: LadderRefusalCode;
  message: string;
  rule: string;
}

export type LadderVerdict = GradedVerdict | QuarantinedVerdict | RefusedVerdict;

function stamp(reliability: Reliability, credibility: Credibility): GradeStamp {
  return {
    code: admiraltyCode(reliability, credibility),
    reliability,
    credibility,
    label: `${RELIABILITY_LABEL[reliability]} · ${CREDIBILITY_LABEL[credibility]}`,
    confidence: confidenceFrom(reliability, credibility, 0, 0),
  };
}

function refuse(itemId: string | null, code: LadderRefusalCode): RefusedVerdict {
  return { state: 'refused', itemId, grade: null, code, message: LADDER_REFUSAL[code].message, rule: LADDER_REFUSAL[code].rule };
}

function quarantine(base: VerdictBase, code: QuarantineCode): QuarantinedVerdict {
  return { ...base, state: 'quarantined', grade: null, code, message: QUARANTINE[code].message, rule: QUARANTINE[code].rule, storableText: null };
}

/* ── SENDER AUTHENTICATION ──────────────────────────────────────────────────── */

export type SenderAuthVerdict =
  | { authenticated: true; via: 'dkim' | 'arc' }
  | { authenticated: false; code: 'MKT_PROV_SENDER_UNVERIFIED' | 'MKT_PROV_ARC_SEALER_UNTRUSTED' };

/**
 * Was this really from X? DKIM with an X `d=` that survived the forwarding hop, or an
 * ARC chain reporting an X DKIM pass whose sealer this deployment has NAMED as trusted.
 * With no sealer configured, ARC-only evidence fails — deliberately.
 */
export function verifySender(
  ev: SenderAuthEvidence | null | undefined,
  trustedArcSealers: readonly string[] = [],
): SenderAuthVerdict {
  if (!ev) return { authenticated: false, code: 'MKT_PROV_SENDER_UNVERIFIED' };
  const xDomain = isXSigningDomain(ev.dkimDomain);
  if (ev.dkimPass && xDomain) return { authenticated: true, via: 'dkim' };
  if (ev.arcPass && xDomain) {
    const sealer = (ev.arcSealerDomain ?? '').trim().toLowerCase();
    const trusted = trustedArcSealers.map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (sealer && trusted.includes(sealer)) return { authenticated: true, via: 'arc' };
    return { authenticated: false, code: 'MKT_PROV_ARC_SEALER_UNTRUSTED' };
  }
  return { authenticated: false, code: 'MKT_PROV_SENDER_UNVERIFIED' };
}

/* ── THE LADDER ─────────────────────────────────────────────────────────────── */

const sameHandle = (a: string | null, b: string | null): boolean =>
  !!a && !!b && a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();

function graded(
  base: VerdictBase,
  rung: LadderRung,
  fields: Partial<Omit<GradedVerdict, keyof VerdictBase | 'state' | 'rung' | 'grade' | 'statement' | 'rationale'>>,
): GradedVerdict {
  const def = LADDER[rung];
  return {
    ...base,
    state: 'graded',
    rung,
    grade: stamp(def.reliability, def.credibility),
    statement: def.statement,
    rationale: def.rationale,
    storableText: fields.storableText ?? null,
    confirmedAuthorHandle: fields.confirmedAuthorHandle ?? null,
    postedOnDisplayed: fields.postedOnDisplayed ?? null,
    postedAtExact: fields.postedAtExact ?? null,
    postedAtSource: fields.postedAtSource ?? 'unknown',
    needsHumanRead: fields.needsHumanRead ?? false,
    noLongerPublic: fields.noLongerPublic ?? false,
    textComparison: fields.textComparison ?? null,
  };
}

/** The oEmbed attempt, described as a corroboration record. */
function oembedCorroboration(r: OEmbedResult | null): Corroboration {
  if (!r) {
    return { channel: 'oembed', outcome: 'not_attempted', detail: 'No oEmbed lookup was made for this item.', at: null };
  }
  const outcome: Corroboration['outcome'] =
    r.status === 'confirmed' ? 'supported' : r.status === 'not_public' ? 'unavailable' : 'unavailable';
  return { channel: 'oembed', outcome, detail: `${r.code}: ${r.message}`, at: r.fetchedAt };
}

function syndicationCorroboration(o: SyndicationObservation): Corroboration {
  return {
    channel: 'syndication_undocumented',
    outcome: 'supported',
    detail:
      'Undocumented syndication backend answered. Counters are lower bounds as of the fetch time and never raise this item’s grade.',
    at: o.fetchedAt,
    undocumented: true,
  };
}

/**
 * Grade ONE inbound item. Pure: everything it knows arrives as an argument.
 *
 * The syndication observation, when present, is recorded as a corroboration and may
 * supply an exact instant — but it NEVER raises a rung. An undocumented source cannot
 * be the reason we believe something.
 */
export function gradeInboundItem(item: InboundItem, opts: LadderOptions = {}): LadderVerdict {
  const itemId = (item.itemId ?? '').trim();
  if (!itemId) return refuse(null, 'MKT_PROV_NO_ITEM_ID');
  const channel = item.channel;
  if (channel !== 'x_notification_email' && channel !== 'human_paste' && channel !== 'x_mirror' && channel !== 'syndication_undocumented') {
    return refuse(itemId, 'MKT_PROV_UNKNOWN_CHANNEL');
  }
  if (!item.receivedAt || Number.isNaN(Date.parse(item.receivedAt))) return refuse(itemId, 'MKT_PROV_NO_RECEIVED_AT');

  const oe = item.oembed;
  const confirmed = oe && oe.status === 'confirmed' ? oe.post : null;
  const corroborations: Corroboration[] = [];
  const base: VerdictBase = { itemId, channel, corroborations, senderEvidence: item.sender ?? null };

  const dateFields = (): Pick<GradedVerdict, 'postedOnDisplayed' | 'postedAtExact' | 'postedAtSource'> => {
    const exact = item.syndication?.createdAtExact ?? null;
    if (confirmed?.postedOnDisplayed) {
      return { postedOnDisplayed: confirmed.postedOnDisplayed, postedAtExact: exact, postedAtSource: 'oembed_displayed_date' };
    }
    if (exact) return { postedOnDisplayed: exact.slice(0, 10), postedAtExact: exact, postedAtSource: 'syndication_undocumented' };
    return { postedOnDisplayed: null, postedAtExact: null, postedAtSource: 'unknown' };
  };

  if (item.syndication) corroborations.push(syndicationCorroboration(item.syndication));

  /* ── the undocumented counters, on their own ── */
  if (channel === 'syndication_undocumented') {
    if (!item.syndication) return refuse(itemId, 'MKT_PROV_NO_SYNDICATION_DATA');
    return graded(base, 'syndication_undocumented_only', { ...dateFields(), storableText: null });
  }

  /* ── a mirror: DISCOVERY ONLY ── */
  if (channel === 'x_mirror') {
    corroborations.push({
      channel: 'x_mirror',
      outcome: 'discovery_only',
      detail: `Id discovered via ${item.mirrorHost ?? 'an unnamed public mirror'}. Its text is discarded, never stored.`,
      at: item.receivedAt,
    });
    if (!item.claimedPostId) return refuse(itemId, 'MKT_PROV_NO_POST_ID');
    corroborations.push(oembedCorroboration(oe));
    if (!confirmed) return quarantine(base, 'MKT_PROV_MIRROR_UNCORROBORATED');
    if (item.claimedAuthorHandle && !sameHandle(item.claimedAuthorHandle, confirmed.authorHandle)) {
      return quarantine(base, 'MKT_PROV_AUTHOR_MISMATCH');
    }
    const cmp = compareText(item.claimedText, confirmed.text);
    return graded(base, 'oembed_confirmed_single_channel', {
      ...dateFields(),
      // oEmbed's text, and only oEmbed's text.
      storableText: confirmed.text,
      confirmedAuthorHandle: confirmed.authorHandle,
      textComparison: cmp,
      needsHumanRead: cmp.verdict === 'contradicted',
    });
  }

  /* ── a named human pasted it ── */
  if (channel === 'human_paste') {
    if (!(item.operator ?? '').trim()) return refuse(itemId, 'MKT_PROV_NO_OPERATOR');
    corroborations.push({
      channel: 'human_paste',
      outcome: 'supported',
      detail: `Asserted by ${item.operator}. The assertion and the text are the same channel, so it cannot corroborate itself.`,
      at: item.receivedAt,
    });
    corroborations.push(oembedCorroboration(oe));
    if (confirmed) {
      if (item.claimedAuthorHandle && !sameHandle(item.claimedAuthorHandle, confirmed.authorHandle)) {
        return quarantine(base, 'MKT_PROV_AUTHOR_MISMATCH');
      }
      const cmp = compareText(item.claimedText, confirmed.text);
      if (cmp.verdict === 'contradicted') return quarantine(base, 'MKT_PROV_TEXT_CONTRADICTED');
      return graded(base, 'oembed_confirmed_single_channel', {
        ...dateFields(),
        storableText: confirmed.text,
        confirmedAuthorHandle: confirmed.authorHandle,
        textComparison: cmp,
      });
    }
    if (!(item.claimedText ?? '').trim()) return quarantine(base, 'MKT_PROV_NO_TEXT');
    return graded(base, 'operator_paste_asserted', { ...dateFields(), storableText: item.claimedText });
  }

  /* ── the forwarded notification email ── */
  const auth = verifySender(item.sender, opts.trustedArcSealers ?? []);
  corroborations.push({
    channel: 'x_notification_email',
    outcome: auth.authenticated ? 'supported' : 'contradicted',
    detail: auth.authenticated
      ? `Sender authenticated via ${auth.via.toUpperCase()} (d=${item.sender?.dkimDomain ?? '?'}).`
      : 'Sender could not be authenticated as X.',
    at: item.receivedAt,
  });
  if (!auth.authenticated) return quarantine(base, auth.code);
  if (!item.claimedPostId) return refuse(itemId, 'MKT_PROV_NO_POST_ID');
  if (!(item.claimedText ?? '').trim() && !confirmed) return quarantine(base, 'MKT_PROV_NO_TEXT');

  corroborations.push(oembedCorroboration(oe));

  if (confirmed) {
    if (item.claimedAuthorHandle && !sameHandle(item.claimedAuthorHandle, confirmed.authorHandle)) {
      return quarantine(base, 'MKT_PROV_AUTHOR_MISMATCH');
    }
    const cmp = compareText(item.claimedText, confirmed.text);
    const rung: LadderRung =
      cmp.verdict === 'consistent'
        ? 'email_oembed_confirmed'
        : cmp.verdict === 'contradicted'
          ? 'email_text_diverged'
          : 'email_oembed_text_not_comparable';
    return graded(base, rung, {
      ...dateFields(),
      storableText: item.claimedText ?? confirmed.text,
      confirmedAuthorHandle: confirmed.authorHandle,
      textComparison: cmp,
      needsHumanRead: cmp.verdict === 'contradicted',
    });
  }

  if (oe && oe.status === 'not_public') {
    return graded(base, 'email_post_not_public', { ...dateFields(), storableText: item.claimedText, noLongerPublic: true });
  }
  if (oe) return graded(base, 'email_oembed_unavailable', { ...dateFields(), storableText: item.claimedText });
  return graded(base, 'email_authenticated_unchecked', { ...dateFields(), storableText: item.claimedText });
}

/* ── THE BATCH, AND SAYING WHEN THE CHANNEL WAS DOWN ────────────────────────── */

export interface BatchNotice {
  code: 'MKT_PROV_CORROBORATION_DEGRADED';
  message: string;
  /** How many items in THIS batch were graded lower because the channel did not answer. */
  degradedCount: number;
  /** True when the breaker was open, i.e. lookups were skipped rather than failed. */
  channelCooling: boolean;
}

export interface BatchCounts {
  total: number;
  graded: number;
  quarantined: number;
  refused: number;
  /** Items an independent channel actually confirmed. A fact about our own work. */
  corroborated: number;
  degraded: number;
}

export interface BatchResult {
  ok: true;
  verdicts: LadderVerdict[];
  counts: BatchCounts;
  /**
   * NON-NULL whenever anything was degraded. This is the mechanism that stops an
   * outage from silently lowering a whole queue: the caller cannot render the batch
   * without also having been handed the sentence that says what happened.
   */
  notice: BatchNotice | null;
  /** Plain-language coverage. Counts of our own queue only — never an audience claim. */
  coverageStatement: string;
}

export interface BatchRefusal {
  ok: false;
  code: LadderRefusalCode;
  message: string;
  rule: string;
}

/**
 * Grade a queue. An EMPTY queue refuses and says it is empty, rather than returning a
 * confident empty list that reads as "all clear" — the GPS perimeter pattern, now the
 * house pattern.
 */
export function gradeInboundBatch(items: readonly InboundItem[], opts: LadderOptions = {}): BatchResult | BatchRefusal {
  if (!items || items.length === 0) {
    return { ok: false, code: 'MKT_PROV_EMPTY_QUEUE', ...LADDER_REFUSAL.MKT_PROV_EMPTY_QUEUE };
  }
  const verdicts = items.map((i) => gradeInboundItem(i, opts));
  const counts: BatchCounts = {
    total: verdicts.length,
    graded: verdicts.filter((v) => v.state === 'graded').length,
    quarantined: verdicts.filter((v) => v.state === 'quarantined').length,
    refused: verdicts.filter((v) => v.state === 'refused').length,
    corroborated: verdicts.filter((v) => v.state === 'graded' && v.grade.credibility <= 2 && v.confirmedAuthorHandle !== null).length,
    degraded: verdicts.filter((v) => v.state === 'graded' && v.rung === 'email_oembed_unavailable').length,
  };
  const cooling = opts.channelCooling === true;
  const notice: BatchNotice | null =
    counts.degraded > 0 || cooling
      ? {
          code: 'MKT_PROV_CORROBORATION_DEGRADED',
          message: cooling
            ? `The oEmbed corroboration channel is cooling down after repeated failures, so ${counts.degraded} of ${counts.total} item(s) in this view are graded on the email alone. This is an instrument fault, not a fact about the items.`
            : `${counts.degraded} of ${counts.total} item(s) in this view are graded on the email alone because X’s oEmbed endpoint did not answer. This is an instrument fault, not a fact about the items.`,
          degradedCount: counts.degraded,
          channelCooling: cooling,
        }
      : null;
  return {
    ok: true,
    verdicts,
    counts,
    notice,
    coverageStatement:
      `${counts.corroborated} of ${counts.total} item(s) in this batch were confirmed by an independent channel; ` +
      `${counts.quarantined} quarantined, ${counts.refused} could not be evaluated. ` +
      'This describes our own queue and nothing about how many people saw anything.',
  };
}

/* ── WHAT MAY NEVER BE COMPUTED ─────────────────────────────────────────────── */

interface ForbiddenDef {
  reason: string;
  substitute: string;
}

/**
 * The honesty ceiling, in code rather than in a comment. Each of these needs a
 * denominator that does not exist without an X API credential, and there is no
 * credential (plan §3, mkt-r3 §2). A tile that renders one of these is not a missing
 * feature, it is a fabricated number.
 */
export const FORBIDDEN_DERIVATIONS: Record<string, ForbiddenDef> = {
  impressions: {
    reason: 'Impressions exist only inside X Analytics, for the logged-in account. They are absent from notification mail, from oEmbed, and from the syndication payload.',
    substitute: 'Nothing. If the desk needs it, a human reads X Analytics and records it as a dated operator assertion.',
  },
  reach: {
    reason: 'Reach is derived from impressions, so it is strictly less available than a number that is already unavailable.',
    substitute: 'Nothing.',
  },
  follower_delta: {
    reason: 'No keyless channel returns a follower count: profile oEmbed returns an empty title and the syndication timeline endpoints return 200 with zero bytes.',
    substitute: 'A dated operator-entered snapshot, shown as "as told to us on <date>", never charted as a trend from two hand-entered points.',
  },
  engagement_rate: {
    reason: 'It is engagements ÷ impressions. The denominator does not exist.',
    substitute: 'Absolute lower-bound counters on individual posts we looked up, each stamped with the fetch time and never divided by anything.',
  },
  click_through_rate: {
    reason: 'Needs X Analytics or a link-attribution stack; lcx.com even treats UTM-tagged URLs as non-canonical in robots.txt.',
    substitute: 'Whatever LCX’s own web analytics reports, cited as that different system. Not a marketing-compartment number.',
  },
  share_of_voice: {
    reason: 'Requires a census of the conversation. Notification email is a controversy-skewed slice of one edge type centred on LCX, which X throttles and digests without telling us.',
    substitute: 'Replies received — a count of our own ingest — shown next to mailbox health so a fall reads as a possible pipeline fault.',
  },
  audience_sentiment: {
    reason: 'There is no sample frame to compute a population sentiment over.',
    substitute: 'Per-item sentiment on items we actually hold, labelled as a model’s read of N items, with N shown.',
  },
};

const METRIC_ALIASES: Record<string, string> = {
  views: 'impressions', impression: 'impressions', view_count: 'impressions',
  unique_reach: 'reach', accounts_reached: 'reach',
  followers: 'follower_delta', follower_growth: 'follower_delta', follower_count: 'follower_delta',
  engagement: 'engagement_rate', engagement_pct: 'engagement_rate', er: 'engagement_rate',
  ctr: 'click_through_rate', clickthrough: 'click_through_rate',
  sov: 'share_of_voice', voice_share: 'share_of_voice',
  sentiment: 'audience_sentiment', sentiment_score: 'audience_sentiment', community_sentiment: 'audience_sentiment',
};

function normaliseMetric(name: string): string {
  const n = (name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return METRIC_ALIASES[n] ?? n;
}

export function isForbiddenDerivation(name: string): boolean {
  return normaliseMetric(name) in FORBIDDEN_DERIVATIONS;
}

export type MetricRefusal =
  | { refused: true; code: 'MKT_METRIC_FORBIDDEN'; metric: string; message: string; substitute: string; rule: string }
  | { refused: false; metric: string };

/**
 * Ask before rendering. A forbidden metric gets a typed refusal with the substitute
 * named — not a zero, not a dash, and not a quiet omission the reader would have to
 * notice on their own.
 */
export function refuseForbiddenMetric(name: string): MetricRefusal {
  const key = normaliseMetric(name);
  const def = FORBIDDEN_DERIVATIONS[key];
  if (!def) return { refused: false, metric: key };
  return {
    refused: true,
    code: 'MKT_METRIC_FORBIDDEN',
    metric: key,
    message: `${key.replace(/_/g, ' ')} cannot be computed here. ${def.reason}`,
    substitute: def.substitute,
    rule: 'Plan §3 (the honesty ceiling) and §4 rule 3 — never claim a number you cannot observe.',
  };
}

/**
 * Name a lower bound as a lower bound. A missing count is stated as not observed —
 * never rendered as 0, which would read as "nobody engaged".
 */
export function lowerBoundLabel(count: number | null | undefined, what: string, asOf: string): string {
  if (count === null || count === undefined || !Number.isFinite(count)) {
    return `${what}: not observed — no count was retrieved, which is not the same as none.`;
  }
  return `at least ${count} ${what}, as counted by X at ${asOf} (a lower bound, never divided by anything)`;
}
