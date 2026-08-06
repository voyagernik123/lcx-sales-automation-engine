import { ApiError, request } from '@/lib/apiClient';
/*
 * TWO UNWRAPS IN ONE FILE, AND THE LINE BETWEEN THEM IS "HAS THE SERVER ALREADY WRITTEN".
 *
 * This module imported `unwrapWithMeta` directly and called it on all three of its calls.
 * That carried the envelope — which was the point at the time — but it applied NO ceiling,
 * while `lib/api/marketing.ts` stated in a comment that it was "the one place every
 * marketing read passes through". It was not: `recordHandoff`, `findPrecedent` and
 * `recordTriage` all went round it, so a route here that started returning `impressions`
 * or `follower_delta` would have reached a component with nothing objecting.
 *
 * THE GET GOES THROUGH THE CEILING. `findPrecedent` uses `unwrapMarketingRead` — that is
 * `lib/api/marketing.ts`'s own `unwrap`, exported rather than copied. It calls
 * `unwrapWithMeta` internally, so the envelope still travels on its non-enumerable symbol
 * and `responseMeta(x)` still answers, and it then walks the parsed payload against
 * `FORBIDDEN_METRIC_FIELD_NAMES` and throws a `HonestyCeilingError` carrying the WHOLE
 * refusal. `lib/api/meta.ts` records what eight hand-rolled unwrap one-liners cost the GPS
 * compartment; a second copy of the ceiling would be the same mistake with higher stakes.
 *
 * ── THE TWO POSTS DO NOT, AND THE FIRST ATTEMPT AT THIS SHIPPED A LIE ─────────
 * `recordHandoff` and `recordTriage` were put behind the ceiling too, and that was wrong for
 * a reason the same lane had already written down about `invokeMarketingAbuse`: THROWING ON A
 * RESPONSE BODY AFTER THE SERVER HAS COMMITTED REPORTS A COMPLETED WRITE AS A FAILED ONE.
 *
 * `POST /v1/marketing/:id/triage` INSERTs into `object_actions` and calls `setReplyStatus`
 * BEFORE it builds its 201 body (`apps/api/src/routes/marketingDesk.ts:1240-1274`). A ceiling
 * refusal walks that body, so it fires with the ledger row written and
 * `marketing_x_reply.status` already `triaged` or `ignored`. The only catch site,
 * `TriageAssessment.tsx:146`, relabels every throw as `DATA_ABSENT_NOT_ZERO` with the rule
 * text "Nothing was written, so this item is still undecided." That sentence would then be
 * FALSE, and asserted as fact about a database the browser cannot see — an inference
 * laundered into a certainty, which is the doctrine's own third rule. `recordHandoff` has the
 * same shape (`DraftingRoom.tsx:174` says "The API refused to write the row") and its route
 * is not mounted yet, so it is exempted on the same argument before it becomes live.
 *
 * WHAT IS GIVEN UP BY EXEMPTING THEM, stated rather than glossed: a banned field name in
 * either response body is not caught here. What that costs is bounded and small — `asHandoff`
 * narrows its payload to six named strings, none of which is a metric, and `recordTriage`'s
 * caller reads only whether the result is `null`, so neither response can put an
 * unobservable figure on a screen through this module. If a surface ever renders these
 * payloads, the ceiling has to move to the SERVER side of the write (F1's middleware, before
 * the INSERT) rather than back to here.
 *
 * WHAT THE CEILING CHANGES FOR THE `optional()` CONTRACT BELOW, precisely: a ceiling refusal
 * is a THROW and not a `null`. It is not an absent route and must never be reported as one —
 * the screen's three outcomes are unchanged, and a refused payload lands in the same branch
 * as "the route is there and refused", which is exactly where it belongs.
 */
import { unwrapWithMeta } from '@/lib/api/meta';
import { unwrapMarketingRead } from '@/lib/api/marketing';

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
    /* `unwrapWithMeta`, NOT the ceiling — see the header. A response-body refusal on a POST
       the server has already committed makes `DraftingRoom.tsx:174` state "The API refused to
       write the row" about a row that exists. */
    unwrapWithMeta(
      request<{ data: unknown; meta?: unknown }>(`/v1/marketing/draft/${draftId}/handoff`, {
        method: 'POST',
        body: { contentHash: hash, surface },
        auth: true,
      }),
    ).then((d) => asHandoff(d, draftId, hash)),
  );

/* ════════ THE ENGINE'S VERDICT — REMOVED, AND WHY THE HOLE IS DOCUMENTED ════════
 *
 * `reviewText` and `ReviewVerdict` used to live here, posting to `POST /v1/marketing/review`.
 * NO ROUTER HAS EVER DECLARED THAT ROUTE. The drafting room's four gates therefore rendered
 * `absent` on every environment — the honest outcome of the wrong path, and the reason
 * `Gate`'s `absent` source exists, but it meant no axis on that screen had ever been checked
 * by a rulebook.
 *
 * They are DELETED rather than left in place because they are now actively misleading: the
 * drafting room asks `POST /regime` and `POST /adoption` through `lib/api/marketing.ts`, both
 * of which are mounted and CONTRACTED, so a second client here narrowing a guess at a route
 * that does not exist is exactly the parallel-client drift `MARKETING_CLIENT_OVERLAPS` was
 * written to track. `asRefusals` went with them — it had no other caller.
 *
 * The removal is recorded rather than silent because the next person to want "one combined
 * verdict" needs to know it was tried: the two axes are separate because the wording rules and
 * the state joins answer different questions, and collapsing them is how a triage verdict ends
 * up displayed as a wording verdict.
 */

/* ════════ THE SILENCE LOG — MOVED TO THE CONTRACT, AND WHY ════════
 *
 * `SilenceEntry` and `listSilences` used to live here, narrowing an unknown payload field by
 * field. That was the right instinct while `GET /v1/marketing/silence` was mounted by nobody
 * and `MARKETING_CLIENT_OVERLAPS` recorded them as one of two fetchers for one absent route.
 *
 * The route is mounted now (`routes/marketingGates.ts:1240`) and its response is
 * `SilenceLog = readonly SilenceLogEntry[]`, declared once in
 * `packages/shared/src/marketing/contracts/gates.ts` §3 and imported by the handler and by
 * `lib/api/marketing.ts fetchSilenceLog` from that one declaration. So the narrower is
 * deleted rather than kept beside it: two clients for one route cost nothing while the route
 * did not exist, and cost a blanked column the day it did — the contract's own docblock warns
 * that renaming any of the eight fields `listSilences` read would silently empty a column on
 * `SilenceLog.tsx`, and a runtime narrower cannot be told about a rename by a compiler.
 *
 * `SilenceLog.tsx` now reads the contracted type and also WRITES, which it never could: there
 * was no rationale-write surface anywhere in this compartment, so the desk's most common
 * decision was recordable only as `status = 'ignored'` with no reason at all.
 */

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

/**
 * A PAYLOAD THAT IS NOT A LIST IS NOT AN EMPTY LIST.
 *
 * This used to be `Array.isArray(rows) ? rows : []`, which turned a withheld, malformed or
 * enveloped-differently payload into "no precedent found" — on the panel whose entire purpose
 * is to stop the desk contradicting itself, and whose own copy reads "This is no ANSWER, no
 * precedent". A `[]` there is the not-loaded/genuinely-empty collapse, silently, on the read
 * that matters most. It throws instead, which `PrecedentPanel` already renders as a refusal
 * (`apiReadRefusal`), and `[]` now means the retriever genuinely found nothing.
 */
const asRows = (rows: unknown): readonly unknown[] => {
  if (Array.isArray(rows)) return rows;
  throw new Error(
    'Refused: the precedent route answered with something that is not a list of rows, so what the desk has said before is UNKNOWN — not "nothing". Read the prior approvals by hand before writing; the failure mode this panel exists to prevent is saying two different things three weeks apart.',
  );
};

export const findPrecedent = (q: string) =>
  optional(
    unwrapMarketingRead(
      request<{ data: unknown[]; meta?: unknown }>(
        `/v1/marketing/precedent?q=${encodeURIComponent(q)}`,
        { auth: true },
      ),
    ).then((rows) =>
      asRows(rows).map((x): PrecedentEntry => {
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

/**
 * Resolves `null` where the route is absent — the board then refuses to pretend.
 *
 * `unwrapWithMeta`, NOT the ceiling. The handler writes `object_actions` and sets the queue
 * status BEFORE it builds this body (`routes/marketingDesk.ts:1240-1274`), and the one catch
 * site says "Nothing was written, so this item is still undecided." A refusal raised here
 * would make that sentence a false statement about the ledger. The header carries the whole
 * argument and what is given up by it.
 */
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
