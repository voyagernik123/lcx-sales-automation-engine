/**
 * GPS G1 — DEMAND: four channels, one queue, nothing invented.
 *
 * The origination watchlist is CURATED — `POST /origination/targets` is a human act, and
 * that stays true. What this module adds is the layer beneath curation: CANDIDATES, each
 * carrying where it came from, why it is here (with the fields that argued for it cited —
 * D1), and an idempotency ref so a channel replayed twice cannot double the queue. A
 * candidate becomes a target only when an operator PROMOTES it; refusing one records the
 * reason. Automation feeds the queue; judgment empties it.
 *
 * ── THE TELEGRAM CHANNEL'S MINIMISATION CONTRACT, WHICH IS THE POINT ─────────
 * The owner supplies Telegram Desktop EXPORTS (files he provides — never his account, a
 * standing security rule). Group chatter is personal data with bystanders in it, so the
 * parser is built as a SIEVE, not a scraper:
 *
 *   · NOTHING about a sender is kept. No names, no usernames, no ids — v1 keeps zero
 *     sender fields, and the drop report says how many were seen and discarded.
 *   · Of a matched message, at most a 200-character snippet around the match survives.
 *     Whole-message retention is not a smaller version of this; it is a different thing.
 *   · Unmatched messages contribute NOTHING, not even counts per sender.
 *   · The report of what was dropped travels with the result, because a minimisation
 *     nobody can inspect is a claim, not a control.
 *
 * ── THE PARTNER-ROOM RULE (measured in, 2026-08-31) ──────────────────────────
 * The first live import proved the message-level rule too narrow for how these deals
 * actually happen: 756 signal-word messages carried no ticker or link, 725 of them inside
 * rooms whose OWN NAME names the counterpart ("USTBL <> LCX"), and 118 real deal rooms
 * yielded nothing at all. A room Telegram already titled after the relationship is an
 * identity the sieve may use. So: a chat whose name is partner-shaped (an LCX-and-someone
 * name) that carries signal words but produced no message-level candidate becomes ONE
 * candidate — for the ROOM, never one per message, so a chatty room cannot flood the
 * queue. The minimisation holds unchanged: no sender fields, one ≤200-char snippet, and
 * the rule announces itself in the report (`partnerRoomsMatched`).
 *
 * ── EVERY REASON CITES ITS FIELDS (D1) ───────────────────────────────────────
 * A crossfeed rule that says "looks promising" is a vibe with a database connection. Each
 * rule's reason names the field values that fired it, so the operator promoting or
 * refusing a candidate argues with evidence, not with the rule's author.
 */

import { OFFER_KEYS, type OfferKey } from './types.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* TYPES                                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

export type DemandSource =
  | 'bd_crossfeed'
  | 'inbound_intake'
  | 'telegram_import'
  | 'partner_referral';

export const DEMAND_SOURCES: readonly DemandSource[] = [
  'bd_crossfeed', 'inbound_intake', 'telegram_import', 'partner_referral',
] as const;

export type OfferHypothesis = OfferKey | 'unsure';

export interface DemandCandidate {
  source: DemandSource;
  /**
   * Idempotency key WITHIN the source — `(source, sourceRef)` is unique in the register,
   * so replaying an export or re-running the crossfeed cannot double the queue.
   */
  sourceRef: string;
  projectName: string;
  /** Recorded and NEVER dereferenced — a string a human may follow, same rule as sourceUrl everywhere in GPS. */
  url: string | null;
  chain: string | null;
  jurisdiction: string | null;
  offerHypothesis: OfferHypothesis;
  /** WHY this candidate exists, citing the fields that argued for it. Shown verbatim. */
  reason: string;
  /**
   * ≤200 chars of matched context for telegram candidates; null elsewhere. The cap is a
   * contract, not a courtesy — `demandCandidateDefects` refuses beyond it.
   */
  snippet: string | null;
  /** Admiralty-style grade of the SOURCE for this claim, stated not implied. */
  provenanceGrade: 'B2' | 'B3' | 'C3';
  /** Present only for inbound intake — the requester's own address, supplied by them. */
  contactEmail: string | null;
  observedAt: string;
}

export const SNIPPET_MAX = 200;
const NAME_MAX = 120;
const URL_MAX = 300;
const REASON_MAX = 500;
const EMAIL_MAX = 254;
export const INTAKE_MESSAGE_MAX = 500;

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE ONE VALIDATOR                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Defects as sentences; empty = acceptable. Used by every producer AND the API edge. */
export function demandCandidateDefects(c: DemandCandidate): string[] {
  const out: string[] = [];
  if (!DEMAND_SOURCES.includes(c.source)) out.push(`unknown source "${c.source}".`);
  if (!c.sourceRef.trim() || c.sourceRef.length > 200) out.push('sourceRef must be non-blank and ≤200 chars — it is the idempotency key.');
  if (!c.projectName.trim() || c.projectName.length > NAME_MAX) out.push(`projectName must be non-blank and ≤${NAME_MAX} chars.`);
  if (c.url !== null && (c.url.length > URL_MAX || !/^(https?:\/\/|t\.me\/)/i.test(c.url))) {
    out.push(`url must look like https://… or t.me/… and stay ≤${URL_MAX} chars — it is a reference a human may follow, never a retrieval.`);
  }
  if (c.offerHypothesis !== 'unsure' && !OFFER_KEYS.includes(c.offerHypothesis)) {
    out.push(`offerHypothesis "${c.offerHypothesis}" is neither an offer key nor "unsure".`);
  }
  if (!c.reason.trim() || c.reason.length > REASON_MAX) out.push(`reason must be non-blank and ≤${REASON_MAX} chars — an unexplained candidate is noise with a row id.`);
  if (c.snippet !== null && c.snippet.length > SNIPPET_MAX) {
    out.push(`snippet exceeds ${SNIPPET_MAX} chars — whole-message retention is not a smaller version of minimisation.`);
  }
  if (c.snippet !== null && c.source !== 'telegram_import') out.push('only telegram candidates carry a snippet.');
  if (c.contactEmail !== null) {
    if (c.source !== 'inbound_intake') out.push('only inbound intake carries a contact email — nothing else was CONSENTED to.');
    else if (c.contactEmail.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contactEmail)) out.push('contactEmail is not a plausible address.');
  }
  if (!Number.isFinite(Date.parse(c.observedAt))) out.push('observedAt must be an ISO instant.');
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* CHANNEL 1 · BD CROSSFEED                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/** The projection of a BD project the rules are allowed to see. Nulls are absences, never zeros. */
export interface CrossfeedProjectInput {
  id: string;
  name: string;
  chain: string | null;
  jurisdiction: string | null;
  euScore: number | null;
  band: string | null;
  listedOnLcx: boolean | null;
  hasOpenDeal: boolean;
  daysSinceUpdate: number | null;
}

/**
 * Three rules, deliberately few and each citing its fields. A rule fires at most one
 * candidate per project; a project can fire several rules (different hypotheses are
 * different candidates, and the operator sees why each exists).
 */
export function crossfeedSignals(projects: readonly CrossfeedProjectInput[], asOf: string): DemandCandidate[] {
  const out: DemandCandidate[] = [];
  for (const p of projects) {
    if (!p.name.trim()) continue;
    const base = {
      source: 'bd_crossfeed' as const,
      projectName: p.name.slice(0, NAME_MAX),
      url: null,
      chain: p.chain,
      jurisdiction: p.jurisdiction,
      snippet: null,
      contactEmail: null,
      /* B3: our own database (usually reliable) asserting a DERIVED signal (possibly true).
         The row values are facts; the hypothesis built on them is not. */
      provenanceGrade: 'B3' as const,
      observedAt: asOf,
    };
    // R1 · EU-facing score with no LCX listing → the MiCA paper is the door.
    if ((p.euScore ?? 0) >= 70 && p.listedOnLcx !== true) {
      out.push({
        ...base,
        sourceRef: `xf:mica:${p.id}`,
        offerHypothesis: 'mica_whitepaper',
        reason: `euScore ${p.euScore} (≥70) and listedOnLcx ${String(p.listedOnLcx)} — an EU-facing project not yet on the venue; a MiCA white paper is the concrete first engagement.`,
      });
    }
    // R2 · An open deal gone quiet → a paid diagnostic restarts the conversation smaller.
    if (p.hasOpenDeal && (p.daysSinceUpdate ?? 0) >= 45) {
      out.push({
        ...base,
        sourceRef: `xf:diag:${p.id}`,
        offerHypothesis: 'diagnostic',
        reason: `open deal with daysSinceUpdate ${p.daysSinceUpdate} (≥45) — the listing conversation stalled; a diagnostic is a smaller yes that reopens it.`,
      });
    }
    // R3 · High-band project with no deal at all → GTM sprint as the wedge.
    if ((p.band === 'high' || p.band === 'immediate') && !p.hasOpenDeal) {
      out.push({
        ...base,
        sourceRef: `xf:gtm:${p.id}`,
        offerHypothesis: 'gtm_sprint',
        reason: `band "${p.band}" with no open deal — scored worth pursuing and nobody is talking to them; a GTM sprint opens the door without a listing commitment.`,
      });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* CHANNEL 2 · TELEGRAM EXPORT (the sieve)                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface TelegramParseReport {
  chatName: string | null;
  messagesSeen: number;
  messagesMatched: number;
  /** Senders seen across ALL messages, and kept for NONE — the minimisation, counted. */
  sendersSeenAndDropped: number;
  /** Messages whose text survived only as a ≤200-char snippet. */
  snippetsKept: number;
  unparseableEntries: number;
  /**
   * 1 when the partner-room rule fired for this chat (0 otherwise) — a count, not a flag,
   * so a multi-group import can sum it. At most one per parse, by construction.
   */
  partnerRoomsMatched: number;
}

export interface TelegramParseResult {
  candidates: DemandCandidate[];
  report: TelegramParseReport;
}

const TICKER_RE = /\$[A-Z]{2,10}\b/;
const TME_RE = /t\.me\/[A-Za-z0-9_]{3,60}/;
const URL_RE = /https?:\/\/[^\s"']{4,200}/;
const SIGNAL_WORDS = /\b(listing|TGE|token generation|launch|MiCA|white ?paper|raise|IDO|ICO|market maker|exchange)\b/i;

/** Separators Telegram deal rooms actually use: "A <> B", "A | B", "A x B", "A + B", "A / B". */
const PARTNER_SPLIT = /\s*(?:<>|\||\+|\/|\bx\b)\s*/i;

/**
 * The counterpart a partner-shaped room name identifies, or null when the name is not
 * partner-shaped. Partner-shaped means: names LCX, has a separator, and at least one
 * segment that is NOT the LCX side. "USTBL <> LCX" → "USTBL"; "LCX Listings Deals" → null
 * (no separator — an internal room, not a relationship).
 */
export function partnerRoomCounterpart(chatName: string): string | null {
  if (!/lcx/i.test(chatName)) return null;
  const parts = chatName.split(PARTNER_SPLIT).map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  const others = parts.filter((p) => !/lcx/i.test(p));
  if (others.length === 0) return null;
  return others.join(' <> ').slice(0, NAME_MAX);
}

/** One message's extractable text, from either export shape, with no sender fields read. */
function messageText(m: Record<string, unknown>): string | null {
  const t = m.text;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) {
    // text_entities style: array of strings and {text} chunks.
    const parts = t.map((x) => (typeof x === 'string' ? x : typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text : ''));
    const joined = parts.join('');
    return joined.length > 0 ? joined : null;
  }
  return null;
}

/**
 * Parse a Telegram Desktop export (`result.json` shape: `{ name?, messages?: [...] }`).
 * Total function: garbage in yields an empty result with the report saying so.
 */
export function parseTelegramExport(raw: unknown, asOf: string): TelegramParseResult {
  const report: TelegramParseReport = {
    chatName: null, messagesSeen: 0, messagesMatched: 0,
    sendersSeenAndDropped: 0, snippetsKept: 0, unparseableEntries: 0,
    partnerRoomsMatched: 0,
  };
  const candidates: DemandCandidate[] = [];
  if (raw === null || typeof raw !== 'object') return { candidates, report };
  const root = raw as Record<string, unknown>;
  report.chatName = typeof root.name === 'string' ? root.name.slice(0, NAME_MAX) : null;
  const messages = Array.isArray(root.messages) ? root.messages : [];
  const seenRefs = new Set<string>();
  /* Fuel for the partner-room rule: the LAST signal-word message with no identity of its
     own (most recent = the state of the conversation), the count of such messages, and
     whether any of them was MiCA-flavoured. Nothing here retains sender data. */
  let roomSignal: { text: string; word: string; at: number } | null = null;
  let roomSignalCount = 0;
  let roomMica = false;

  for (const entry of messages) {
    if (entry === null || typeof entry !== 'object') { report.unparseableEntries += 1; continue; }
    const m = entry as Record<string, unknown>;
    report.messagesSeen += 1;
    /* THE SIEVE'S FIRST RULE: sender fields are counted and never read further. `from`,
       `from_id`, `actor` — whatever the export calls them, none is touched beyond this. */
    if ('from' in m || 'from_id' in m || 'actor' in m) report.sendersSeenAndDropped += 1;

    const text = messageText(m);
    if (text === null || text.length === 0) continue;

    const tme = TME_RE.exec(text);
    const ticker = TICKER_RE.exec(text);
    const urlM = URL_RE.exec(text);
    const words = SIGNAL_WORDS.exec(text);
    // A match needs an IDENTITY (link or ticker) — signal words alone are chatter,
    // UNLESS the room's own name supplies the identity (the partner-room rule, below).
    const identity = tme?.[0] ?? ticker?.[0] ?? null;
    if (identity === null || words === null) {
      if (identity === null && words !== null) {
        roomSignalCount += 1;
        roomSignal = { text, word: words[0], at: words.index ?? 0 };
        if (/MiCA|white ?paper/i.test(text)) roomMica = true;
      }
      continue;
    }

    report.messagesMatched += 1;
    const msgId = typeof m.id === 'number' || typeof m.id === 'string' ? String(m.id) : `t${report.messagesSeen}`;
    const ref = `tg:${report.chatName ?? 'chat'}:${msgId}`;
    if (seenRefs.has(ref)) continue;
    seenRefs.add(ref);

    // ≤200 chars AROUND the match — the second rule of the sieve.
    const at = (words.index ?? 0);
    const start = Math.max(0, at - 80);
    const snippet = text.slice(start, start + SNIPPET_MAX);
    report.snippetsKept += 1;

    candidates.push({
      source: 'telegram_import',
      sourceRef: ref,
      projectName: (tme ? tme[0].replace('t.me/', '') : ticker![0].replace('$', '')).slice(0, NAME_MAX),
      url: tme ? tme[0] : urlM ? urlM[0].slice(0, URL_MAX) : null,
      chain: null,
      jurisdiction: null,
      offerHypothesis: /MiCA|white ?paper/i.test(text) ? 'mica_whitepaper' : 'unsure',
      reason: `Telegram signal in "${report.chatName ?? 'chat'}": matched ${tme ? 'a t.me handle' : `ticker ${ticker![0]}`} beside "${words[0]}" — an announcement-shaped mention, not a qualified need.`,
      snippet,
      provenanceGrade: 'C3',
      contactEmail: null,
      observedAt: asOf,
    });
  }

  /* THE PARTNER-ROOM RULE. Fires only when the message-level rule kept NOTHING from this
     chat — a room that already speaks for itself needs no second voice. One candidate for
     the ROOM: sourceRef is the room, so re-imports (and a >2MB room split into batches
     that each see only chatter) can never stack duplicates past the (source, sourceRef)
     key. The snippet is from the most recent signal message, same 200-char cap. */
  const counterpart = report.chatName === null ? null : partnerRoomCounterpart(report.chatName);
  if (candidates.length === 0 && roomSignal !== null && counterpart !== null) {
    const start = Math.max(0, roomSignal.at - 80);
    const snippet = roomSignal.text.slice(start, start + SNIPPET_MAX);
    report.snippetsKept += 1;
    report.partnerRoomsMatched = 1;
    candidates.push({
      source: 'telegram_import',
      sourceRef: `tg:group:${report.chatName}`,
      projectName: counterpart,
      url: null,
      chain: null,
      jurisdiction: null,
      offerHypothesis: roomMica ? 'mica_whitepaper' : 'unsure',
      reason: `Partner-room signal in "${report.chatName}": the room's own name identifies the counterpart, and ${roomSignalCount} message(s) carried "${roomSignal.word}"-class words with no ticker or link beside them — a relationship-shaped room, not a qualified need.`,
      snippet,
      provenanceGrade: 'C3',
      contactEmail: null,
      observedAt: asOf,
    });
  }
  return { candidates, report };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* CHANNELS 3 & 4 · INBOUND INTAKE AND PARTNER REFERRAL                          */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface IntakeFields {
  projectName: string;
  url: string | null;
  email: string;
  offerInterest: OfferHypothesis;
  jurisdiction: string | null;
  message: string;
  /** The honeypot. A human never sees the field; anything in it is a refusal. */
  website: string;
}

export function intakeCandidate(fields: IntakeFields, sourceRef: string, asOf: string):
  | { ok: true; candidate: DemandCandidate }
  | { ok: false; defects: string[] } {
  if (fields.website.trim() !== '') {
    // Said plainly in the code and never to the caller — the route answers the same
    // {received:true} either way, because a honeypot that explains itself stops being one.
    return { ok: false, defects: ['honeypot field was filled.'] };
  }
  if (fields.message.length > INTAKE_MESSAGE_MAX) {
    return { ok: false, defects: [`message exceeds ${INTAKE_MESSAGE_MAX} chars.`] };
  }
  const candidate: DemandCandidate = {
    source: 'inbound_intake',
    sourceRef,
    projectName: fields.projectName.trim().slice(0, NAME_MAX),
    url: fields.url,
    chain: null,
    jurisdiction: fields.jurisdiction,
    offerHypothesis: fields.offerInterest,
    reason: `Inbound request from the public services page: interest "${fields.offerInterest}"${fields.message.trim() ? ` — "${fields.message.trim().slice(0, 200)}"` : ''}.`,
    snippet: null,
    provenanceGrade: 'C3',
    contactEmail: fields.email.trim().toLowerCase(),
    observedAt: asOf,
  };
  const defects = demandCandidateDefects(candidate);
  return defects.length > 0 ? { ok: false, defects } : { ok: true, candidate };
}

export function referralCandidate(
  partnerId: string,
  fields: { projectName: string; url: string | null; jurisdiction: string | null; offerHypothesis: OfferHypothesis; note: string },
  sourceRef: string,
  asOf: string,
): { ok: true; candidate: DemandCandidate } | { ok: false; defects: string[] } {
  if (!partnerId.trim()) return { ok: false, defects: ['a referral names its referring partner.'] };
  const candidate: DemandCandidate = {
    source: 'partner_referral',
    sourceRef,
    projectName: fields.projectName.trim().slice(0, NAME_MAX),
    url: fields.url,
    chain: null,
    jurisdiction: fields.jurisdiction,
    offerHypothesis: fields.offerHypothesis,
    /* B2: a named partner vouching is a usually-reliable source making a probably-true
       referral — the strongest grade in this queue, and still not a finding. */
    reason: `Referred by partner ${partnerId.trim()}${fields.note.trim() ? `: "${fields.note.trim().slice(0, 300)}"` : '.'}`,
    snippet: null,
    provenanceGrade: 'B2',
    contactEmail: null,
    observedAt: asOf,
  };
  const defects = demandCandidateDefects(candidate);
  return defects.length > 0 ? { ok: false, defects } : { ok: true, candidate };
}
