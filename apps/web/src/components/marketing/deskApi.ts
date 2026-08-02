import { ApiError, request } from '@/lib/apiClient';
import { unwrapWithMeta } from '@/lib/api/meta';
import type { Refusal, RefusalCode } from './vocabulary';

/**
 * The record written when a human takes text out of the instrument by hand — the web
 * side of §9's `PublicationCloseOut`, narrowed to the fields a screen renders. Declared
 * here rather than in `vocabulary.ts` because it is a WIRE shape: when the handoff route
 * lands, its response type replaces this and nothing else changes.
 */
export interface HandoffView {
  readonly id: string;
  readonly draftId: number;
  readonly contentHash: string;
  readonly takenBy: string;
  readonly takenAt: string;
  /** Verbatim from the server: what it recorded, in its own words. */
  readonly notice: string | null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DESK'S OWN READS — and what each one does when its route is not there
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `lib/api/marketing.ts` covers the eight routes that exist today (queue, summary,
 * ingest, draft, drafts, approve, status, tick). The desk needs four more, and they
 * were being written in a concurrent lane while this surface was built. So every
 * function here is written to answer the question the screen actually asks — "can
 * this environment do X" — with three outcomes and never with a lie:
 *
 *   the value        the route answered
 *   `null`           the route is NOT on this environment (404, or 501)
 *   throws           the route is there and refused, or the network failed
 *
 * `null` IS NOT AN EMPTY LIST. A screen that renders "no silences recorded" when the
 * silence route does not exist is asserting a fact about the desk's judgement from
 * the absence of a deployment. Every caller of these functions distinguishes the two,
 * and `pages/__tests__/marketingDesk.test.tsx` fails if one stops.
 *
 * WHY A LOCAL MODULE AND NOT `lib/api/marketing.ts`: that file is the eight-route
 * mirror of `routes/marketing.ts` and is owned elsewhere. `components/gps/
 * artifactIntakeApi.ts` set the precedent for a compartment surface carrying its own
 * fetcher beside the component that needs it.
 *
 * NOTHING HERE POSTS TO X. There is no such route, no credential to reach one with,
 * and `recordHandoff` is the opposite of one: it records that a HUMAN took text out
 * of the instrument to send by hand, which is the only way text leaves at all.
 */

/** A 404/501 means the route is absent. Everything else is a real refusal. */
const absent = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 404 || e.status === 501);

/** Resolve to `null` where the route does not exist; re-throw anything else. */
async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (absent(e)) return null;
    throw e;
  }
}

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/* ════════ THE HANDOFF RECORD — defect 6, closed ════════ */

/**
 * SHA-256 of exactly the text the operator is about to take, lowercase hex.
 *
 * The record binds to the HASH and not to the draft's row id, because a draft row can
 * be re-drafted and an approval that names a row id says nothing about which text was
 * carried out of the building (`marketing/types.ts` §0, `ContentHash`).
 *
 * Returns `null` where WebCrypto is unavailable — an insecure origin, or a stripped
 * runtime. That is a refusal, not a fallback: a weaker hash computed in JS would make
 * the record look bound when it is not, and the caller turns `null` into a sentence
 * that says the text cannot be taken because the record cannot be bound to it.
 */
export async function contentHash(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function asHandoff(v: unknown, draftId: number, hash: string): HandoffView {
  const r = rec(v);
  return {
    id: str(r.id) ?? str(r.handoffId) ?? '',
    draftId: typeof r.draftId === 'number' ? r.draftId : draftId,
    contentHash: str(r.contentHash) ?? hash,
    /* `takenBy` comes from the SESSION, server-side, exactly as `approved_by` does.
       A client-supplied name on a record whose whole purpose is attribution would be
       attribution the record cannot support. Where the server did not state it, the
       screen says so rather than filling in the signed-in email from localStorage. */
    takenBy: str(r.takenBy) ?? '',
    takenAt: str(r.takenAt) ?? '',
    notice: str(r.notice),
  };
}

/**
 * Record that a human is taking this text out of the instrument, by hand.
 *
 * Resolves `null` where the route does not exist — and the caller must then NOT put
 * the text on the clipboard. That is the whole of defect 6: today's page has an
 * ungated copy button, so a `proposed` draft carrying a live flag can leave with no
 * record at all (`pages/Marketing.tsx:224` as it was).
 */
export const recordHandoff = (draftId: number, hash: string, surface: string) =>
  optional(
    unwrapWithMeta(
      request<{ data: unknown; meta?: unknown }>(`/v1/marketing/draft/${draftId}/handoff`, {
        method: 'POST',
        body: { contentHash: hash, surface },
        auth: true,
      }),
    ).then((d) => asHandoff(d, draftId, hash)),
  );

/* ════════ THE ENGINE'S VERDICT ON A PIECE OF TEXT ════════ */

export interface ReviewVerdict {
  readonly claimSafety: readonly Refusal[] | null;
  readonly marketAbuse: readonly Refusal[] | null;
  readonly regime: readonly Refusal[] | null;
  readonly regimes: readonly string[];
}

/**
 * Narrow the engine's refusals into the shared `Refusal` shape.
 *
 * NARROWED, NOT CAST. `lib/api/gps.ts:60` carries the post-mortem for the alternative: a
 * hand-written type in the browser claimed three fields the API had never returned, `tsc`
 * believed the copy because a copy is syntactically perfect, and the page's own test
 * agreed with it because the test mocked the module. Two artefacts agreeing with each
 * other is not a contract.
 *
 * Where a field is missing the substitute is deliberately UGLY rather than friendly: a
 * refusal that says the engine gave no sentence is a visible defect, and an invented
 * sentence is an invisible one.
 */
function asRefusals(v: unknown): Refusal[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x): Refusal => {
    const r = rec(x);
    const rule = rec(r.rule);
    const recovery = rec(r.recovery);
    return {
      code: (str(r.code) ?? 'RULESET_VERSION_UNKNOWN') as RefusalCode,
      sentence: str(r.sentence) ?? str(r.message) ?? 'The engine refused this text and did not send a sentence with it.',
      rule: {
        instrument: (str(rule.instrument) ?? 'desk_policy') as Refusal['rule']['instrument'],
        provision: str(rule.provision) ?? 'no provision stated',
        text: str(rule.text) ?? 'The engine cited no rule text.',
      },
      recovery: (typeof recovery.kind === 'string'
        ? (recovery as unknown as Refusal['recovery'])
        : { kind: 'not_recoverable', why: 'The engine stated no way to clear this. Ask compliance rather than editing until it stops complaining.' }),
      matched: str(r.matched),
      ruleSetVersion: typeof r.ruleSetVersion === 'number' ? r.ruleSetVersion : 0,
    };
  });
}

/**
 * Ask the compartment's engines what is wrong with this text.
 *
 * Resolves `null` where the route is absent, and the drafting room then renders every
 * gate as UNCHECKED rather than as clean. Debounced by the caller, never on a
 * keystroke: this is a network round trip and the live pre-checks are the thing that
 * runs on every character.
 */
export const reviewText = (body: {
  text: string;
  verb: string;
  draftId?: number;
  replyId?: number;
}) =>
  optional(
    unwrapWithMeta(
      request<{ data: unknown; meta?: unknown }>('/v1/marketing/review', {
        method: 'POST',
        body,
        auth: true,
      }),
    ).then((d): ReviewVerdict => {
      const r = rec(d);
      return {
        claimSafety: asRefusals(r.claimSafety),
        marketAbuse: asRefusals(r.marketAbuse),
        regime: asRefusals(r.regime),
        regimes: strs(r.regimes),
      };
    }),
  );

/* ════════ THE SILENCE LOG ════════ */

export interface SilenceEntry {
  readonly id: string;
  readonly subject: string;
  readonly disposition: string;
  readonly reasonCode: string;
  /** Required by the record. Empty here means the row was written without one. */
  readonly rationale: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly revisitBy: string | null;
}

export const listSilences = () =>
  optional(
    unwrapWithMeta(
      request<{ data: unknown[]; meta?: unknown }>('/v1/marketing/silence', { auth: true }),
    ).then((rows) =>
      (Array.isArray(rows) ? rows : []).map((x): SilenceEntry => {
        const r = rec(x);
        return {
          id: str(r.id) ?? '',
          subject: str(r.subject) ?? str(r.authorHandle) ?? '',
          disposition: str(r.disposition) ?? 'unstated',
          reasonCode: str(r.reasonCode) ?? 'unstated',
          rationale: str(r.rationale) ?? '',
          decidedBy: str(r.decidedBy) ?? '',
          decidedAt: str(r.decidedAt) ?? '',
          revisitBy: str(r.revisitBy),
        };
      }),
    ),
  );

/* ════════ THE PRECEDENT INDEX ════════ */

export interface PrecedentEntry {
  readonly id: string;
  readonly body: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly claimIds: readonly string[];
  /** How the retriever matched, in its own words: 'trigram similarity 0.71'. */
  readonly matchBasis: string;
  /** Claims cited by this precedent that have since changed or expired. */
  readonly staleClaimIds: readonly string[];
}

export const findPrecedent = (q: string) =>
  optional(
    unwrapWithMeta(
      request<{ data: unknown[]; meta?: unknown }>(
        `/v1/marketing/precedent?q=${encodeURIComponent(q)}`,
        { auth: true },
      ),
    ).then((rows) =>
      (Array.isArray(rows) ? rows : []).map((x): PrecedentEntry => {
        const r = rec(x);
        return {
          id: str(r.id) ?? '',
          body: str(r.body) ?? '',
          approvedBy: str(r.approvedBy) ?? '',
          approvedAt: str(r.approvedAt) ?? '',
          claimIds: strs(r.claimIds),
          matchBasis: str(r.matchBasis) ?? 'the retriever did not state how it matched',
          staleClaimIds: strs(r.staleClaimIds),
        };
      }),
    ),
  );

/* ════════ THE TRIAGE DECISION ════════ */

export interface TriageWrite {
  replyId: number;
  verifiability: string;
  indicators: readonly string[];
  reach: string;
  reachBasis: string;
  confidence: string;
  priority: string;
  action: string;
  rationale: string;
}

/** Resolves `null` where the route is absent — the board then refuses to pretend. */
export const recordTriage = (body: TriageWrite) =>
  optional(
    unwrapWithMeta(
      request<{ data: unknown; meta?: unknown }>(`/v1/marketing/${body.replyId}/triage`, {
        method: 'POST',
        body,
        auth: true,
      }),
    ),
  );
