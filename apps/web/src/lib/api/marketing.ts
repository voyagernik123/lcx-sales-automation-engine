import { request } from '../apiClient';
import { unwrapWithMeta } from './meta.js';
// Response contracts, declared ONCE in shared and imported by the API route too. See
// §16 of `packages/shared/src/marketing/types.ts` for why they do not live here.
import {
  assertHonestPayload,
  assertHonestPayloadAll,
  type AbusePerimeterState,
  /* ── THE SIXTEEN CONTRACTS THAT HAVE LANDED ────────────────────────────────────
   * Each name below is declared exactly ONCE — in `packages/shared/src/marketing/
   * contracts/{desk,memory,record}.ts`, or in `types.ts` §16 / `abuse.ts` for the two that
   * predate the contracts directory — and is imported from that single declaration by the
   * route handler AND by this module. That is the whole discipline, and the reason it is a
   * discipline rather than a preference is `lib/api/gps.ts:83`: a hand-written web-side
   * `GpsSummary` claimed four fields the API had never returned, `tsc` was green because a
   * copy is syntactically perfect, the page's own test agreed because it mocked the module,
   * and the page crashed on the first real payload.
   *
   * The SEVEN still typed `UncontractedPayload` are listed in `MARKETING_CONTRACTS_OWED`
   * below with the type each one owes. `unknown` is deliberately inconvenient: a page
   * cannot read a field off it without narrowing, so a missing contract obstructs at
   * compile time instead of crashing in front of an operator. */
  type AdoptionReading,
  type ClaimSafetyVerdict,
  type CorroborationResult,
  type MarketingLoopReport,
  type ProcessMetrics,
  type ReplyProvenanceRecord,
  type ReviewVerdict,
  type SilenceLog,
  type SilenceLogEntry,
  type ClaimExpiryLedger,
  type ClearanceBoard,
  type CrisisStatementInstance,
  type CrisisStatementLibrary,
  type DeskBoard,
  type DeskModeRecord,
  type ErasureOutcome,
  type ExportBundle,
  type MarketAbuseVerdict,
  type MarketingRecordRow,
  type PeerPreclearLibrary,
  type PostTimeCoverageReport,
  type PrecedentSearchResult,
  type PublicationCloseOut,
  type RegimeReading,
  type SubjectAccessResponse,
  type WatchDigest,
} from '@lcx/shared';

/**
 * LCX MARKETING — the browser's view of the desk.
 *
 * Mirrors `apps/api/src/routes/marketing.ts` the way `lib/api/gps.ts` mirrors
 * `routes/gps.ts`: thin, typed, one function per endpoint, `unwrap` peeling the
 * envelope, `auth: true` on everything, no logic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE IS NO POST, PUBLISH, SEND, SCHEDULE OR CREDENTIAL FUNCTION HERE, AND
 * THERE IS DELIBERATELY NOWHERE TO ADD ONE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Not a stub, not a disabled variant, not a `dryRun` flag that a later commit
 * could flip. The owner's constraint is that nothing in this system can act as
 * the LCX account, and the terminal state of a cleared draft is a human copying
 * text and posting it by hand, outside this software. That gap is the only
 * guarantee a defect in this compartment cannot speak for LCX — every other
 * guarantee would be a promise about code, and code changes.
 *
 * `__tests__/marketingAbsences.test.ts` reads this file's source and fails if a
 * publish-shaped name appears, because adding one here is the first step in
 * defeating that constraint and it has to be a red test rather than a code
 * review somebody was busy for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY REQUEST BODIES ARE DECLARED HERE AND RESPONSE SHAPES MOSTLY ARE NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * `lib/api/gps.ts:83` carries the post-mortem: a hand-written `GpsSummary`
 * declared `counts`, `clientCount`, `openValueCents` and `missingConflictChecks`,
 * none of which the API has ever returned. `tsc` was green, the module-mocked
 * page test was green, and the page was guaranteed to crash the moment the
 * migration was applied — because a response interface is a CLAIM about a
 * runtime payload and the compiler believes whatever claim it is handed.
 *
 * The two directions are NOT symmetric, which is what this module's typing rests
 * on:
 *
 *  · A wrong REQUEST body fails loudly and immediately. The route validates it
 *    and answers 400 `VALIDATION` on the first click, in development, with the
 *    field named. So request shapes are declared here in full — they are what
 *    this client chooses to send, and the server is the check.
 *  · A wrong RESPONSE type fails silently, later, in front of whoever is
 *    holding the screen. Nothing checks it. So a response shape is declared in
 *    exactly one place — `packages/shared` — and imported by the route handler
 *    and by this module, or it is not declared at all.
 *
 * Where a route does not exist yet, its response is `UncontractedPayload`
 * (= `unknown`) and the shared type it is waiting on is named in
 * `MARKETING_CONTRACTS_OWED` below. `unknown` is deliberately inconvenient: a
 * page cannot read a field off it without narrowing, so the missing contract
 * obstructs at compile time instead of crashing at runtime. An invented
 * interface would have done the opposite.
 */

/** The API's read-side envelope, identical to every other compartment's. */
// The envelope's `meta` used to die here — see lib/api/meta.ts. `unwrapWithMeta`
// attaches it under a non-enumerable symbol, so no call site or type changes and
// `responseMeta(x)` / `isMigrated(x)` / `metaNotices(x)` can finally answer.
//
// EVERY function in this module goes through it, including the ones whose route
// does not exist yet. Seven surfaces lost `migrated: false` and their provenance
// last week by peeling `.data` by hand; a new fetcher that does the same would
// make a screen look warning-free rather than look broken.
// ── AND IT NOW APPLIES THE RUNTIME HALF OF THE HONESTY CEILING ────────────────
// `observation.ts`'s header claims three layers guard the ceiling. Layer 2 is the runtime
// walk, and it had ZERO production callers — only its own tests — so the claim was
// describing a function nobody ran. A proof that is never applied is a definition.
//
// This is the right place for it: the walk is over a PARSED JSON payload, which is exactly
// the case `HonestFigures<T>` cannot see. If the API ever starts returning `impressions`,
// `follower_delta` or any of the other banned names — from a new route, a JSON column or an
// AI response — the read fails here, before a component can render it.
//
// ── IT IS NO LONGER THE ONLY PLACE, AND IT IS STILL THE STRICTEST ─────────────
// `apps/api/src/middleware/honesty.ts` now walks every `application/json` response body
// server-side, per compartment, and replaces an offending FIELD with its refusal rather than
// failing the response — because a 500 on a live surface over a field name has a larger blast
// radius than the defect it catches. Past `MAX_PAYLOAD_DEPTH` there is no offending field to
// replace (nothing below the bound was read), so the server replaces the whole UNVERIFIED
// SUB-TREE with a `PAYLOAD_TOO_DEEP_TO_VERIFY` refusal instead — the argument, including that
// this deletes data the walk never read, is above `seatRefusals` in that file.
//
// (It is EXPORTED READY TO MOUNT and not yet mounted in `app.ts`; the reason is in that file's
// header and it is about not breaking SSE. When it is mounted it goes AHEAD of the compartment
// gates, not after them — a Hono gate that denies with `c.json` never calls `next()`, so
// anything registered after it does not run on the refusal envelope. That file said the
// opposite until an adversary pass caught it.)
//
// THE TWO LAYERS DO NOT OVERLAP AND NEITHER IS REDUNDANT. The server refuses the FIELD and
// leaves the NAME in place, so this walk still sees `impressions` and still throws — which is
// correct and deliberate: in the marketing compartment a banned name is absolute, and a page
// here has no rendering for "a refusal object where a figure was". The other seven
// compartments have no browser ceiling at all, and for them the server's field-level refusal
// is the only thing standing between a fabricated number and a screen.
//
// THE ONE CASE WHERE THE NAME DOES NOT SURVIVE is the too-deep sub-tree, which the server
// replaces wholesale — the banned name goes with it. This walk still throws on such a payload,
// but with `PAYLOAD_TOO_DEEP_TO_VERIFY` rather than `METRIC_NOT_OBSERVABLE`: the seated refusal
// object itself sits below the bound, so the browser walk runs out of depth at the same node the
// server did. Different code, same outcome — the read fails and no figure is rendered.
//
// A CONSEQUENCE, SO IT IS NOT DISCOVERED IN AN INCIDENT: once the middleware is mounted, a
// marketing route that starts returning a banned name produces a THROWN read here whose
// payload has already been rewritten by the server. The `matched` path and `code` are the
// same either way, so the sentence a page shows does not change; what changes is that the
// value is a refusal object rather than the original number, and nothing in this module reads
// the value.
//
// ── WHAT THIS COMMENT HAS NOW CLAIMED FALSELY TWICE ───────────────────────────
// Version 1 said: "This is the one place every marketing read passes through." Version 2
// replaced it with "the ceiling covers every marketing READ" and named two exceptions. Both
// sentences were falsified by the same one-line grep, `grep -rn "v1/marketing" apps/web/src`,
// and the second one is the more instructive failure: the lane's whole thesis is that this
// comment is what a reader checks INSTEAD of the imports, and it shipped a fresh version of
// the same defect.
//
// SO THE CLAIM IS NOW AN ENUMERATION, AND A TEST HOLDS IT. `__tests__/marketingCeiling.test.ts`
// greps the web source for `/v1/marketing` and fails if any file other than the three below
// reaches the compartment. That is the only form of this statement that cannot rot, because
// the next bypass makes a test red instead of making a comment stale.
//
// FOUR CLIENTS TOUCH `/v1/marketing`. THIS ONE, AND THREE THAT DO NOT USE THE CEILING:
//
//   1. THIS MODULE — every fetcher here goes through `unwrap`, so every read it owns is
//      walked. That is a statement about this file and nothing wider.
//   2. `components/marketing/deskApi.ts` — the compartment's second web client. Its one GET,
//      `findPrecedent`, goes through `unwrapMarketingRead` below (this same function,
//      exported rather than copied). Its two POSTs do NOT, deliberately — see (3), the
//      argument is identical and that file states it at each call.
//   3. `invokeMarketingAbuse` HERE (the three governed perimeter writes) calls `request(`
//      with no unwrap and DELIBERATELY still does. It returns `Promise<void>` and discards
//      the response, so there is no payload any surface could render; and throwing on a
//      response body AFTER a governed write has been committed to `object_actions` would
//      report a completed write as a failed one, which is a worse lie than the one it would
//      be catching.
//   4. `pages/MarketingHoldings.tsx` — THREE LIVE READS WITH NO CEILING AND NO ENVELOPE:
//      `GET /v1/marketing/holdings` (:120), `/holdings/register` (:126) and
//      `/holdings/cells` (:182). All three are mounted (`routes/marketing.ts:768` mounts
//      `routes/marketingHoldings.ts`, handlers at :168/:210/:283) and the page imports
//      `request` from `@/lib/apiClient` directly.
//      IT IS NOT A ONE-LINE FIX AND THAT IS WHY IT IS STILL OPEN. Those three handlers
//      answer with a BARE object — `c.json({ memberId, rows, … })`, no `{ data, meta }`
//      envelope — so `unwrapMarketingRead` would peel a `.data` that does not exist and
//      return `undefined` for all three panels. Putting them behind the ceiling means
//      enveloping the routes or giving the ceiling a bare-payload entry point, and the page
//      and the route are both outside this lane's file set. The holdings contracts carry no
//      banned name today (`packages/shared/src/marketing/contracts/holdings.ts`), which is
//      the condition the ceiling exists to defend against CHANGING — so this is a real hole,
//      not a theoretical one, and it is written here rather than rounded off.
//
// IT THROWS RATHER THAN LOGGING. Doctrine rule 1: a number nobody can defend is not
// softened into a warning beside itself. The pages already handle a failed read; they have
// no handling for a plausible figure that should not exist.
/**
 * THE COMPARTMENT, NAMED RATHER THAN IMPLIED.
 *
 * `CeilingScope` is the parameterised half of a refusal's citation: which compartment's
 * payload violated the ceiling. Server-side it is derived from the workspace table
 * (`middleware/honesty.ts honestyScope`); here it is a literal, because this module IS the
 * marketing client and there is no path to look up — every read below goes to `/v1/marketing`.
 * `derivedFrom` says exactly that, so a refusal in a browser log and a refusal in an API log
 * carry the same field with the same meaning and neither has to be guessed at.
 *
 * NO EXEMPTIONS ARE PASSED, and that is the load-bearing part. The API middleware runs with
 * `DOCTRINE_CEILING_EXEMPTIONS` so the ordinal `reach` in the channel-mix matrix and the
 * RESIST 2 reach ladder keep flowing; this compartment gets none of them, so a banned name is
 * absolute on a marketing read exactly as it was before this lane existed.
 */
const MARKETING_CEILING_SCOPE = {
  compartment: 'marketing',
  derivedFrom: 'the browser client for /v1/marketing — this module reads no other namespace',
  subject: 'apps/web/src/lib/api/marketing.ts unwrap()',
} as const;

const unwrap = async <T>(p: Promise<{ data: T; meta?: unknown }>): Promise<T> => {
  const out = await unwrapWithMeta(p);
  /* The cheap probe first — it answers `null` for a clean payload, which is the case every
     read takes. It is also the call `scripts/doctrine-lint.mjs` RULE 3 counts to prove the
     ceiling has not regressed to zero production callers; do not collapse it into the line
     below without reading that rule. */
  const refused = assertHonestPayload(out, { scope: MARKETING_CEILING_SCOPE });
  if (refused !== null) {
    /* EVERY refusal, not the first one found — the house pattern at
       `apps/api/src/routes/marketingDesk.ts`. A guard that names one banned field per read
       gets routed around one field per deploy. The second walk only ever runs on a payload
       that is already failing, so it costs nothing on the path that matters. */
    throw new HonestyCeilingError(refused, assertHonestPayloadAll(out, { scope: MARKETING_CEILING_SCOPE }));
  }
  return out;
};

/**
 * DERIVED FROM THE FUNCTION, NOT RE-DECLARED AND NOT IMPORTED BY NAME.
 *
 * `CeilingRefusal` and `CeilingRefusalCode` are declared once, in
 * `packages/shared/src/marketing/observation.ts`. They are not on the `type X,` import list
 * above for one mechanical reason: `marketingContract.test.ts` proves every name on that
 * list is declared in a RESPONSE-CONTRACT module (`types.ts`, `abuse.ts`, `claimSafety.ts`,
 * `contracts/*.ts`), and these two are not response contracts — they are the ceiling's own
 * vocabulary, which lives with the walker.
 *
 * Deriving them off the function's return type keeps the one-declaration rule exactly, and
 * more tightly than an import would: there is no second copy to drift, and a rename or a
 * shape change in shared is a TS error at this line rather than a shape mismatch later.
 */
export type CeilingRefusal = NonNullable<ReturnType<typeof assertHonestPayload>>;
export type CeilingRefusalCode = CeilingRefusal['code'];

/**
 * THE WHOLE REFUSAL, NOT JUST ITS SENTENCE.
 *
 * This used to be `throw Object.assign(new Error(refused.sentence), { code })`, which
 * dropped `rule`, `recovery`, `matched` and `ruleSetVersion` on the floor. The doctrine
 * says a refusal CITES THE RULE IT APPLIES, and at the one place in the browser where the
 * ceiling actually fires, the citation never reached a surface — so the only honest
 * rendering available to a page was a bare sentence with no provision behind it and no
 * statement of what would make the read succeed.
 *
 * `message` is still `refusal.sentence` and `code` is still an own property, because
 * `__tests__/marketingCeiling.test.ts` asserts on both and a caller catching this today
 * reads them. What is added is additive: `refusal` is the whole `CeilingRefusal`, and
 * `refusals` is every one the payload carried.
 */
export class HonestyCeilingError extends Error {
  /** The PRIMARY refusal's code, for a caller that switches on one. */
  readonly code: CeilingRefusalCode;
  /**
   * The primary refusal, whole: rule, recovery, matched span and ruleset version.
   *
   * PRIMARY, NOT FIRST-IN-WALK-ORDER, and this is `assertHonestPayload`'s choice rather than
   * this class's: a named forbidden field outranks a container the walker could not read, so
   * a payload that is both too deep AND carries `ctr` reports the `ctr`. `refusals` stays in
   * walk order, so `refusals[0]` and `refusal` are not always the same entry.
   */
  readonly refusal: CeilingRefusal;
  /** Every refusal the payload carried, in walk order. Length is at least 1. */
  readonly refusals: readonly CeilingRefusal[];

  constructor(first: CeilingRefusal, all: readonly CeilingRefusal[]) {
    super(first.sentence);
    this.name = 'HonestyCeilingError';
    this.code = first.code;
    this.refusal = first;
    /* `all` is recomputed and could in principle come back empty if the payload were
       mutated between the two walks. Fall back to the refusal we already hold rather than
       hand a surface an empty list beside a thrown refusal — an empty `refusals` on an
       error object reads as "nothing was wrong". */
    this.refusals = all.length > 0 ? all : [first];
  }
}

/**
 * THE CEILING, EXPORTED — for the compartment's OTHER web client.
 *
 * `components/marketing/deskApi.ts` exists for the reasons its own header gives, and it
 * was calling `unwrapWithMeta` directly. That is not a style difference: it meant its reads
 * reached components with the ceiling never applied, while this file's comment said every
 * marketing read passed through it.
 *
 * ONE CALLER TODAY, NOT THREE: `findPrecedent`, which is a GET. The two POSTs in that module
 * were briefly put behind this and had to be taken back out — a response-body refusal on a
 * request the server has already committed makes the screen state that nothing was written.
 * That argument is at both call sites there, and at `invokeMarketingAbuse` here.
 *
 * Exported rather than duplicated. `lib/api/meta.ts` records what eight hand-rolled
 * `unwrap` one-liners cost the GPS compartment, and a second copy of the ceiling would be
 * the same failure with higher stakes — the two copies agree until one of them is the only
 * one someone remembers to update.
 */
export const unwrapMarketingRead = <T>(p: Promise<{ data: T; meta?: unknown }>): Promise<T> =>
  unwrap(p);

/* ════════ §1 THE LIVE COMPARTMENT — routes/marketing.ts, mounted today ════════ */

/**
 * Row shapes below MIRROR `apps/api/src/marketing/service.ts` — `ReplyRow`,
 * `DraftRow` and `queueSummary`'s return — column for column.
 *
 * They SHOULD live in `packages/shared/src/marketing/`, declared once and
 * imported by both sides, which is what `lib/api/gpsLoop.ts` does and what this
 * module's own header argues for. They do not, because this wave does not own
 * `packages/shared/src/marketing/types.ts`. Until they move, the binding is
 * enforced from outside the type system: `__tests__/marketingContract.test.ts`
 * reads BOTH declarations off disk and fails when the field names drift, in
 * either direction. No mock can satisfy that test, and it fails at the moment
 * the two disagree rather than when a user clicks.
 */

/**
 * `answered` IS SET ON APPROVAL, NOT ON PUBLICATION, and no surface may label it
 * "sent" (plan §1 defect 6). There is no edit box and no gated copy path, so
 * approved text need not equal published text and a `proposed` draft can be
 * pasted out leaving no record at all. The honest reading of `answered` today is
 * "a human approved some text for this reply".
 */
export type ReplyStatus = 'new' | 'triaged' | 'drafted' | 'answered' | 'ignored';

export interface MarketingReply {
  id: number;
  x_comment_id: string;
  x_post_id: string | null;
  author_handle: string;
  /** Attacker-chosen and not identity. Never render this as the author. */
  author_display: string | null;
  body: string;
  /**
   * REPAIRED IN M0/M3, AND THE OLD WARNING IS KEPT BECAUSE IT EXPLAINS THE SHAPE. This was
   * written from the email `Date:` header, not from X's timestamp, and fell back to
   * `received_at` — so any clock derived from it measured mail-forwarding latency and
   * flattered the desk by exactly the delay. It is now written only from oEmbed, which is
   * an independent first-party channel, and `posted_at_source` says which channel supplied
   * it. There is NO fallback: an unknown post time is null, and the API refuses
   * `MKT_CLOCK_POST_TIME_UNKNOWN` rather than substituting `received_at`.
   *
   * X prints a DATE and no time on an embed, so `posted_on_displayed` is the honest field
   * for what oEmbed actually observed. Do not render `posted_at` as a time-of-day.
   *
   * ── AND TODAY IT IS ALWAYS NULL, WHICH "REPAIRED" DOES NOT CONVEY ──
   * `apps/api/src/marketing/oembed.ts` is imported for TYPES ONLY, by
   * `provenanceLadder.ts:67`, and `service.ts recordPostedOn` has no caller anywhere in
   * `apps/api/src`. So the lookup that would write this column never runs, on any path,
   * and post-time coverage on a live environment is 0% rather than partial. The panels
   * report that rather than hiding it — which is why the coverage sentence had to stop
   * dividing by the loaded page, since a page-wide ratio would have read 100% the moment
   * one row happened to carry a date.
   *
   * The shape is right and the writer is missing. `corroborateReply` in
   * `MARKETING_CONTRACTS_OWED` is the route that would call it.
   */
  posted_at: string | null;
  /** Which channel supplied `posted_at`. Null means nothing did. Never assume `oembed`. */
  posted_at_source: string | null;
  /** The DATE X printed on the embed. There is no time component; do not invent one. */
  posted_on_displayed: string | null;
  received_at: string;
  status: ReplyStatus;
  /**
   * A DECLARED COLUMN THAT IS NEVER WRITTEN (plan §3). Always null. It is
   * declared here because the API returns it, and it may not be rendered as
   * "neutral" — an unwritten column is not a measurement.
   */
  sentiment: string | null;
  /** Admiralty grade, e.g. `C3`. See `SOURCE_GRADE` in the API's service.ts. */
  source_grade: string;
  source_kind: string;
  parse_failed: boolean;
  /**
   * `raw_email` IS GONE FROM THIS SHAPE, AND THAT IS THE FIX RATHER THAN A TIDY-UP.
   *
   * It used to be declared here, with a comment saying it was present only because
   * `listReplies` was `SELECT * FROM marketing_x_reply` — so up to 20KB of a stranger's
   * forwarded email crossed to the browser on every queue read, for every row not yet
   * triaged. That comment was honest about the payload and correct about where the fix
   * belonged: the route, via a column list.
   *
   * The route now names its columns (`service.ts REPLY_COLUMNS`) and `raw_email` is not
   * among them, so the field is no longer in the payload and declaring it would be the
   * *opposite* lie — a field the API never sends, which is how `Object.entries(s.counts)`
   * crashed the GPS compartment on real data. `marketingContract.test.ts` compares the
   * two field sets in both directions and fails either way round.
   *
   * What survives is the timestamp below: the fact that the body was cleared, which is an
   * audit fact and not content.
   */
  /** When the field sweep nulled `raw_email` server-side. Null while it is still held. */
  raw_email_cleared_at: string | null;

  /* ── M0 defect 1: how the sender was established, if at all ──────────────────────────
   * These four are DELIBERATELY in the payload, unlike `raw_email` above: they are named
   * in `REPLY_COLUMNS` because the desk has to be able to see whether an inbound message
   * was authenticated at all. They are sender metadata, not the sender's message.
   *
   * `sender_auth_evidence` is the provider's verbatim `Authentication-Results` field. It
   * is diagnostic, it names third-party infrastructure, and NOTHING MAY RENDER IT on a
   * shared screen. What a surface shows is `sender_auth_state` — and it shows it as
   * "how the sender was established", never as a trust score. `quarantined` is the
   * decision; the state is the reason for it.
   * ─────────────────────────────────────────────────────────────────────────────────── */
  sender_from: string | null;
  /** `dkim` | `arc` | `unverified` | `no_trust_anchor` | `operator_asserted`. */
  sender_auth_state: string | null;
  sender_dkim_domain: string | null;
  sender_auth_evidence: string | null;

  /**
   * TRUE MEANS THIS ROW IS NOT IN THE QUEUE AND NOT IN ANY COUNT. An unauthenticated
   * message, or an id collision with differing content. It is visible — a forgery attempt
   * the desk cannot see is worse than one it can — but it is never promoted, never drafted
   * from, and never aged in an SLA. `quarantine_code` says which of the two it was.
   */
  quarantined: boolean;
  quarantine_code: string | null;
  /**
   * Set when this row's id was already claimed by different content. The genuine reply is
   * PRESERVED here rather than discarded, which is the whole of M0 defect 6: `ON CONFLICT
   * DO NOTHING` reported an attack as "duplicates" and threw the real message away.
   */
  collision_of_comment_id: string | null;
}

export interface MarketingDraft {
  id: number;
  reply_id: number;
  body: string;
  used_llm: boolean;
  /** The sanitiser removed a link or an address from the model's output. */
  flagged: boolean;
  flag_reason: string | null;
  status: 'proposed' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  /**
   * M0 DEFECT 5. `answered` used to be set on APPROVAL, when nothing had been sent — there
   * is no send path in this compartment and there must never be one, so approval could
   * never mean sent. These two are the only evidence that a human pasted the text into X,
   * and they are TESTIMONY, not an observation: no credential exists that could check.
   * Render them as "N asserts they sent this", never as a delivery receipt.
   *
   * Null on an approved draft means the desk cleared the text and nobody has said it went
   * out. That is a real and useful state; it is not a failure to record something.
   */
  sent_asserted_by: string | null;
  sent_asserted_at: string | null;
}

export interface MarketingSummary {
  counts: Partial<Record<ReplyStatus, number>>;
  /**
   * @deprecated Read `oldestObservedWaitingHours` instead. Identical value, honest name.
   *
   * Hours since the oldest OPEN reply was RECEIVED — `received_at`, i.e. SINCE WE LEARNED
   * of it, not since the customer posted. The two differ by however long the mail spent
   * being forwarded, and the field name is the problem: "unanswered" invites reading it as
   * a wait the customer experienced. It is not. Any surface rendering it must label it
   * "since we learned"; the wait since the post is `oldestSincePostedHours`, which REFUSES
   * rather than substituting this number when the post time is unknown.
   */
  oldestUnansweredHours: number | null;
  /**
   * THE HONEST NAME FOR THE SAME NUMBER. Hours since the desk LEARNED of the oldest open
   * reply. Label it "since we learned" on any surface; it is a real and useful figure and
   * it is not the customer's wait.
   */
  oldestObservedWaitingHours: number | null;
  /**
   * TWO CLOCKS, AND THIS IS THE ONE THAT REFUSES. Hours since the oldest open reply was
   * POSTED — which is what "how long has the customer been waiting" actually means, and
   * which this system frequently cannot know.
   *
   * A `FigureRefusal` instead of a number is the correct answer, not an error state: it
   * carries a code, a sentence, and what would have to be true for the figure to exist. A
   * surface must render the sentence in place of the tile. Never fall back to
   * `oldestObservedWaitingHours` — substituting one clock for the other is the defect that
   * made this pair necessary, and it flattered the desk by exactly the forwarding delay.
   *
   * The API withholds it unless EVERY open row has a post date, because a minimum over the
   * subset that has one is a lower bound presented as a maximum.
   */
  oldestSincePostedHours: number | null | { code: string; message: string; needs: string };
  /**
   * POST-TIME COVERAGE OVER THE WHOLE OPEN POPULATION. Read this; never divide the queue
   * array, which is a PAGE.
   *
   * `fetchMarketingQueue` passes no `limit`, the route defaults to 50 and the service caps
   * at 200, so `queue.length` is `min(open rows, 50)`. `DeskMeasurement` and `TriageBoard`
   * both computed coverage from it and rendered "50 of 50 … Every open item carries one"
   * for a desk where 70 of 120 open replies had no post date — on the same screen as the
   * refusal that says so correctly. Absent from a response (an older API), this is
   * `undefined`, and a panel must refuse rather than fall back to the page.
   */
  postTimeCoverage?: { openRows: number; withPostTime: number };
  /** Replies whose text looks like an attempt to steer the model. */
  suspicious: number;
  /** Emails the parser could not read — a human must look. */
  unparsed: number;
  /**
   * Rows that failed sender authentication or collided with an existing id. EXCLUDED from
   * `counts`, from the queue and from every SLA figure above, so this is the only number on
   * the summary that reports them. A non-zero value that nobody looks at is the same as no
   * control at all — read the lane itself at `GET /v1/marketing/quarantined`.
   */
  quarantined: number;
  /**
   * Of those, how many were an id collision with DIFFERING content. That is the signal that
   * someone is pre-claiming ids: the genuine reply is preserved rather than discarded, and
   * this count is how the desk finds out it is happening.
   */
  collisions: number;
  mailConfigured: boolean;
  /**
   * False until migration 0046 is applied on this environment. The compartment
   * reports itself as not-yet-enabled rather than erroring, so the page shows a
   * banner instead of a crash during the window between deploy and migration.
   *
   * `migrated: false` also travels in the envelope on `/queue` and `/:id/drafts`
   * — read it with `isMigrated()` from `./meta`, because an empty list under a
   * missing migration is a fact about the environment, not about the desk.
   */
  migrated: boolean;
}

export const fetchMarketingQueue = (status?: ReplyStatus) =>
  unwrap(request<{ data: MarketingReply[] }>(
    `/v1/marketing/queue${status ? `?status=${status}` : ''}`, { auth: true },
  ));

export const fetchMarketingSummary = () =>
  unwrap(request<{ data: MarketingSummary }>('/v1/marketing/summary', { auth: true }));

/** Paste a reply by hand — the path that works with zero mail setup. */
export const ingestReply = (body: {
  authorHandle: string; body: string; xCommentId?: string; xPostId?: string; authorDisplay?: string;
}) => unwrap(request<{ data: { result: 'inserted' | 'duplicate' } }>(
  '/v1/marketing/ingest', { method: 'POST', body, auth: true },
));

export const draftForReply = (id: number) =>
  unwrap(request<{ data: { draft: MarketingDraft; usedLlm: boolean; suspiciousInput: boolean } }>(
    `/v1/marketing/${id}/draft`, { method: 'POST', auth: true },
  ));

export const fetchDrafts = (id: number) =>
  unwrap(request<{ data: MarketingDraft[] }>(`/v1/marketing/${id}/drafts`, { auth: true }));

/**
 * Approve — the governed act. Attribution comes from the session, never from the
 * body: a client that can name its own approver can forge one.
 *
 * WHAT APPROVAL IS NOT, stated here because the word oversells itself: it writes
 * no `audit_log` and no `object_actions` row today (`service.ts:283`, plan §1
 * defect 3), so this is a status flip on a draft row and not yet a governed
 * action in the platform's sense. M0 owns that repair.
 */
export const approveDraft = (draftId: number) =>
  unwrap(request<{ data: MarketingDraft }>(
    `/v1/marketing/draft/${draftId}/approve`, { method: 'POST', auth: true },
  ));

export const setReplyStatus = (id: number, status: ReplyStatus) =>
  unwrap(request<{ data: { ok: true } }>(
    `/v1/marketing/${id}/status`, { method: 'POST', body: { status }, auth: true },
  ));

/* ════════ §2 THE CONTRACTS ANOTHER WAVE STILL OWES ════════ */

/**
 * A RESPONSE WHOSE SHAPE IS NOT YET DECLARED IN `packages/shared`.
 *
 * `unknown`, on purpose, and named so it is greppable. Every function below
 * calls a route that does not exist on `routes/marketing.ts` yet, so there is no
 * server declaration to mirror and nothing that could check an interface written
 * here. Writing one anyway is not a head start, it is the `GpsSummary` failure
 * with no server to disagree with it — see this module's header.
 *
 * `unknown` obstructs: a page cannot read `.verdict` off it without narrowing,
 * so the missing contract stops the build at the consumer instead of crashing
 * the screen. When the shared type named in `MARKETING_CONTRACTS_OWED` lands and
 * `packages/shared/src/index.ts` re-exports it, the fix is one import and one
 * generic per function, and the ledger entry is deleted.
 */
/*
 * NO FETCHER IN THIS FILE USES IT ANY MORE, and it is exported anyway. The seven that did
 * were contracted when `contracts/gates.ts` landed. The alias stays because the next route
 * to be built ahead of its contract needs somewhere honest to point, and re-deriving the
 * argument for it under deadline is how a hand-written guess gets written instead.
 * `marketingContract.test.ts` proves the count is zero rather than asserting it in a comment.
 */
export type UncontractedPayload = unknown;

/**
 * WHY THE VOCABULARY FIELDS BELOW ARE TYPED `string`.
 *
 * `EngagementVerb`, `ContentSurface`, `MarketingJurisdiction`,
 * `ConsiderationKind`, `AssetSymbol`, `Permalink`, `Handle` and `ActorId` all
 * exist, declared once, in `packages/shared/src/marketing/types.ts`. They are
 * NOT importable from this app: `packages/shared/package.json` publishes a single
 * `"."` export, so a deep specifier does not resolve, and `src/index.ts` does not
 * re-export `./marketing/types.js` yet.
 *
 * The alternative was hand-copying `'reply' | 'quote' | 'repost' | 'like' | ...`
 * into this file, which is a second declaration of the compartment's central
 * vocabulary — the exact drift this wave was told not to create. `string` is
 * weaker and honest; a wrong value fails loudly at the route's validator on the
 * first click, which is the asymmetry this module's header rests on.
 *
 * `MARKETING_VOCABULARY_OWED` records which shared symbol each one must become,
 * and `__tests__/marketingAbsences.test.ts` fails if the vocabulary is ever
 * re-declared here instead.
 */

/* ──── M1 — the claim-safety gate ──── */

/**
 * The thing under review is `(verb, target, author)`, never "the text" — a `like`
 * produces no words of ours and still adopts the target's claims (FINRA RN 17-18
 * Q9, encoded as `VERB_ADOPTION` in the shared vocabulary). So the verb, the
 * surface and the named assets are required inputs, not decoration on a string.
 */
export interface ClaimSafetyBody {
  /** Shared `EngagementVerb`. */
  verb: string;
  /** Shared `ContentSurface` — it decides which of the two approval regimes applies. */
  surface: string;
  /** Our own text. Empty for `like` and `repost`, which produce none. */
  text: string;
  /** Shared `Permalink`. Null for an `original`. */
  targetPermalink?: string | null;
  /** The target's text as OBSERVED, for the verbs that inherit its risk. */
  targetText?: string | null;
  /** Shared `AssetSymbol[]`. Drives the embargo and holdings joins. */
  namedAssets?: string[];
  /** Shared `MarketingJurisdiction[]`. `unknown` may not be treated as cleared. */
  addressedTo?: string[];
  excludedFrom?: string[];
  /** Shared `ConsiderationKind`. Absent is NOT `none` — the server must refuse. */
  considerationKind?: string;
}

/**
 * `POST /v1/marketing/claim-safety` — the verdict, including the refusals.
 *
 * A verdict, not a score. Doctrine rule 1: strip is for formatting, refusal is
 * for substance, and a refusal cites the provision that caused it. The response
 * carries the regime set, the mandatory-element checks, the strips and the
 * refusals; the screen renders them and computes none of them, because a second
 * copy of the rule in the browser drifts from the engine the first time either
 * changes (`lib/api/gpsLoop.ts:117` makes the same argument about blockers).
 */
export const checkClaimSafety = (body: ClaimSafetyBody) =>
  unwrap(request<{ data: ClaimSafetyVerdict }>(
    '/v1/marketing/claim-safety', { method: 'POST', body, auth: true },
  ));

/**
 * `POST /v1/marketing/review` — the live advisory read, as an operator types.
 *
 * THE TWO AXES NOTHING ELSE ANSWERS. `checkClaimSafety` reads THE WORDS and
 * `assessMarketAbuse` reads THE STATE the words sit in — whether the named asset is under
 * embargo (Art 90) and whether the author holds it (Art 91(3)(c), personal fines from
 * €700,000). Doctrine rule 2 is that the dangerous axis is the invisible one, and a wording
 * review passes a perfectly-worded bullish reply about a token the author owns.
 *
 * `regime` IS ALWAYS `null` HERE AND THAT IS NOT A GAP. `classifyRegimes` needs facts this
 * request does not carry — the jurisdictions addressed and excluded, asset treatment,
 * consideration kind, the Art 7 role — and defaulting any of them would clear Art 7 by
 * omission. `regimeRefusal` names them, and the full classification is `POST /regime`, which
 * the drafting room calls separately with the operator's own declarations.
 *
 * IT WRITES NOTHING AND RELEASES NO TEXT: `releasesNoText` is the literal `true` and there is
 * no `usableText` field on the type at all, so a future edit wanting to return copyable text
 * from an unrecorded check has to change the contract. That is what makes it safe on a
 * debounce. The gate that DOES release text is `POST /claim-safety`, whose `usableText` is
 * `null` whenever its ledger row could not be written.
 */
export interface ReviewCheckBody {
  /** Shared `EngagementVerb`. */
  verb: string;
  /** Our own text. May be empty. */
  text: string;
  draftId?: number | null;
  replyId?: number | null;
}

export const checkReview = (body: ReviewCheckBody) =>
  unwrap(request<{ data: ReviewVerdict }>(
    '/v1/marketing/review', { method: 'POST', body, auth: true },
  ));

/**
 * `POST /v1/marketing/regime` — WHICH LAW BITES, and the arithmetic that ends the argument.
 *
 * ── THIS IS THE ROUTE `POST /review` WAS NEVER GOING TO BE ────────────────────
 * `MARKETING_CLIENT_OVERLAPS` records the finding: `components/marketing/deskApi.ts
 * reviewText` posts to `/v1/marketing/review`, NO ROUTER DECLARES IT, and the drafting
 * room's gates therefore rendered `absent` on every environment — the honest outcome of the
 * wrong path. The API built three narrower endpoints instead, separating the wording axis
 * from the state-join axis, and the earlier wave declined to repoint the surface because
 * "guessing at [which one the drafting room asks for] is how a screen ends up showing a
 * triage verdict as a wording verdict". This is that decision made rather than deferred:
 * the drafting room asks `/regime` about the words and `/adoption` about the verb, and asks
 * `/triage/assess` about NOTHING, because triage is an upstream decision that belongs to the
 * board and putting it here is exactly the confusion that was feared.
 *
 * ── THE BODY IS LONG BECAUSE THE ENGINE REFUSES TO GUESS, AND SO MUST THE FORM ─
 * `bool()` throws on a missing key rather than defaulting to `false`, and
 * `giveawayRequiresPersonalDataOrBenefit` is a `Known<boolean>` where an omission is
 * `'unknown'` and widens the regime set. That is the point: a clearance obtained by leaving
 * a field blank is the failure mode the whole compartment is built against, so every one of
 * these is a recorded judgement an operator makes on screen and none of them has a default.
 *
 * REQUEST SHAPES ARE DECLARED HERE, response shapes are not — this module's header sets out
 * why the two directions are not symmetric. `RegimeReading` comes from
 * `packages/shared/src/marketing/contracts/desk.ts` and the route handler assigns to the
 * same symbol.
 */
export interface RegimeCheckBody {
  /** Shared `EngagementVerb`. */
  verb: string;
  /** Shared `ContentSurface` — it carries the channel ceiling the arithmetic divides by. */
  surface: string;
  /** Our own text. May be empty for a verb that produces none. */
  body: string;
  /** The target's text as OBSERVED. `null` is a real answer: unread text can still be adopted. */
  targetBody?: string | null;
  /** Shared `ItemPurpose`. */
  purpose: string;
  /** Shared `ConsiderationKind`. Absent is NOT `none`. */
  consideration: string;
  /** Whether the item links to something LCX controls. No default. */
  firstPartyLinkPresent: boolean;
  /** ESMA's halo-effect DON'T: LCX's own best line is its highest-frequency risk. */
  citesOwnRegulatoryStatus: boolean;
  authorAccount: 'lcx_official' | 'staff_personal';
  employmentRelationshipDisclosed: boolean;
  /** Shared `Art7Role`. */
  art7Role: string;
  /** `true`, `false` or `'unknown'` — and `'unknown'` widens the regime set rather than clearing it. */
  giveawayRequiresPersonalDataOrBenefit: boolean | 'unknown';
  /** Shared `MarketingJurisdiction[]`. `unknown` may not be treated as cleared. */
  addressedTo?: string[];
  excludedFrom?: string[];
  /**
   * `null` means the list was not supplied, which is a NAMED GAP
   * (`AUTHORISED_SERVICE_LIST_ABSENT`) and the owner's to close (plan §7). An omitted key
   * must not become `[]`: an empty list reads as "authorised for nothing", which is a
   * different, confident, wrong answer.
   */
  authorisedServices?: string[] | null;
}

export const checkRegime = (body: RegimeCheckBody) =>
  unwrap(request<{ data: RegimeReading }>(
    '/v1/marketing/regime', { method: 'POST', body, auth: true },
  ));

/**
 * `POST /v1/marketing/adoption` — what "we only retweeted it" actually means.
 *
 * The answer to the question an operator is asking with their cursor over the repost
 * button, and the reason the verb is modelled separately from the words: a like produces no
 * text of ours and still adopts everything the target said (FINRA RN 17-18 Q9). The desk
 * mode is read from the ledger SERVER-SIDE and not taken from this body, so an amplification
 * cannot be assessed against a mode the caller supplied while a regulator's Art 94
 * suspension sits in the record.
 *
 * `target.text: null` is a real and different answer — the verdict reports
 * `adoptsUnreadText`, "LCX cannot adopt what it has not read" — where an empty string would
 * be the same sentence with a confident zero in it.
 */
export interface AdoptionCheckBody {
  /** Shared `EngagementVerb`. */
  verb: string;
  /** Shared `ContentSurface`. */
  surface: string;
  speaker: {
    /** Shared `SpeakerCapacity`. The actor itself is the session's, never this body's. */
    capacity: string;
    handle?: string | null;
    employmentDisclosedInProfileOnly: boolean;
    itemPromotesEmployer: boolean;
  };
  /** `null` for an original post, which has no target to adopt. */
  target: {
    permalink?: string | null;
    handle?: string | null;
    /** As observed. `null` means unread, which the verdict reports rather than hides. */
    text?: string | null;
    /** Shared `TargetVerificationState`. */
    verification: string;
    isLcxOwnAccount: boolean;
  } | null;
  ownText?: string | null;
  /** Observed on the surface, never estimated. Omit rather than guess. */
  visibleChars?: number | null;
}

export const checkAdoption = (body: AdoptionCheckBody) =>
  unwrap(request<{ data: AdoptionReading }>(
    '/v1/marketing/adoption', { method: 'POST', body, auth: true },
  ));

/* ──── M2 — the market-abuse perimeter ──── */

/**
 * Separate from `checkClaimSafety` because it answers a different question with
 * different inputs: not "are these words fair and clear" but "may this named
 * human say anything at all about this named asset right now". Art 90 (inside
 * information) and Art 91(3)(c) (undisclosed position, personal fines from EUR
 * 700 000) are invisible to a wording review and are resolved by joins against
 * the embargo register and the holdings declaration.
 */
export interface MarketAbuseCheckBody {
  /** Shared `AssetSymbol[]`. An empty list is a refusal input, not a pass. */
  namedAssets: string[];
  /** Shared `EngagementVerb`. */
  verb: string;
  /** Shared `ActorId` of the drafter. The approver's position is joined server-side. */
  author: string;
  text?: string;
}

/**
 * `POST /v1/marketing/abuse-check` — the embargo and holdings verdict.
 *
 * `unknown` state is not `clear`. An empty embargo register or an undeclared
 * holding must come back as a refusal that says which register was missing, not
 * as a pass — the GPS perimeter pattern, which is now the house pattern.
 */
export const checkMarketAbuse = (body: MarketAbuseCheckBody) =>
  unwrap(request<{ data: MarketAbuseVerdict }>(
    '/v1/marketing/abuse-check', { method: 'POST', body, auth: true },
  ));

/**
 * `GET /v1/marketing/perimeter` — the state of the two registers themselves.
 *
 * Read by every surface that needs an honest empty state: "no embargoed assets"
 * and "there is no embargo register" are different sentences and a desk that
 * cannot tell them apart is guessing on the highest-consequence axis. The
 * registers are the owner's and legal's to produce (plan §7), so the expected
 * steady state on day one is "absent", said out loud.
 *
 * CONTRACTED — the route exists and its response type is `AbusePerimeterState`, declared
 * in `packages/shared/src/marketing/types.ts` §16 and imported by BOTH sides. It is not
 * re-declared here: a web-side interface mirroring what the API probably sends is the
 * defect that crashed the GPS compartment on real data.
 */
export const fetchAbusePerimeter = () =>
  unwrap(request<{ data: AbusePerimeterState }>('/v1/marketing/perimeter', { auth: true }));

/**
 * THE THREE GOVERNED WRITES ON THE PERIMETER.
 *
 * These go through `/v1/actions/:id/invoke`, not through a bespoke marketing route, and
 * that is the whole point: the registry path carries the `object_actions` ledger, the
 * `audit_log` row, the `approver` role check and `assertNamedHuman`. A REST twin would be
 * a second write path with weaker controls, which is exactly the defect GPS Phase 1 shipped
 * (two write paths for one operation, and the surfaces called the weaker one).
 *
 * They were unreachable from any surface until this wave: `MARKETING_ABUSE_ACTIONS` was
 * exported and merged into nothing, so the register the whole compartment refuses against
 * had no governed way to be populated. `actions/__tests__/surfaceReach.test.ts` is the
 * ratchet that caught it — an action only ⌘K can name is one an operator has to already
 * know exists.
 *
 * SUBJECT IS THE ASSET SYMBOL (`MARKETING_ASSET_SUBJECT` = `marketing_asset`), so
 * `audit_log.entity_id` is the symbol — which is why `/v1/audit` withholds it below
 * `marketing:view`.
 */
async function invokeMarketingAbuse(
  actionId: string,
  assetSymbol: string,
  params: Record<string, unknown>,
): Promise<void> {
  await request(`/v1/actions/${actionId}/invoke`, {
    auth: true,
    method: 'POST',
    body: { subjectType: 'marketing_asset', subjectId: assetSymbol, params },
  });
}

/** Record an asset's inside-information state. Approver-only, named human, server-side. */
export const enterAssetEmbargo = (assetSymbol: string, params: Record<string, unknown>) =>
  invokeMarketingAbuse('marketing_embargo_enter', assetSymbol, params);

/** Lift a live embargo — normally because the event became public. */
export const liftAssetEmbargo = (assetSymbol: string, params: Record<string, unknown>) =>
  invokeMarketingAbuse('marketing_embargo_lift', assetSymbol, params);

/** Declare whether a named member holds an asset. Art 91(3)(c)'s invisible limb. */
export const declareAssetHoldings = (assetSymbol: string, params: Record<string, unknown>) =>
  invokeMarketingAbuse('marketing_holdings_declare', assetSymbol, params);

/* ──── M3 — the provenance ladder ──── */

/**
 * `GET /v1/marketing/replies/:id/provenance` — how much this row is worth
 * believing: the Admiralty grade, the DKIM/ARC evidence recorded at ingest, and
 * whether the independent oEmbed channel corroborated it.
 *
 * Load-bearing because the ingest is forgeable today: `fetchNotificationEmails`
 * searches `{seen:false}` with no sender filter and `RawEmail` has no `from`
 * field (`xMail.ts:81`), so anyone who learns the polled address can inject a
 * fabricated reply graded identically to a real one.
 */
export const fetchReplyProvenance = (replyId: number) =>
  unwrap(request<{ data: ReplyProvenanceRecord }>(
    `/v1/marketing/replies/${replyId}/provenance`, { auth: true },
  ));

/**
 * `POST /v1/marketing/replies/:id/corroborate` — pull `publish.twitter.com/oembed`
 * for this row's permalink and record what came back.
 *
 * A POST because it writes the corroboration record, NOT because anything is
 * sent anywhere: oEmbed is an unauthenticated read of a public, documented
 * endpoint, and it is the cheapest high-value fix in the plan — it repairs the
 * author field, yields the true post date (so a clock can stop measuring mail
 * latency) and, being an independent channel, is the anti-forgery corroboration
 * the ingest defect needs.
 */
export const corroborateReply = (replyId: number) =>
  unwrap(request<{ data: CorroborationResult }>(
    `/v1/marketing/replies/${replyId}/corroborate`, { method: 'POST', auth: true },
  ));

/* ──── M4 — the desk ──── */

/**
 * `GET /v1/marketing/desk` — the triage board in one read.
 *
 * One call rather than five because the board's parts are not independent: the
 * clock is meaningless without the `DeskMode` that may have suspended it, and a
 * priority tier is meaningless without the `ObservationFrame` saying what the
 * window could and could not see. Assembling those from separate responses in the
 * browser is how a screen ends up showing a live clock under a suspended desk.
 *
 * The response must carry its own `ObservationFrame`. Notification emails are a
 * controversy-skewed census of one edge type centred on LCX, not a sample of
 * anything, and nothing on this board may be presented as coverage.
 */
export const fetchDeskBoard = () =>
  unwrap(request<{ data: DeskBoard }>('/v1/marketing/desk', { auth: true }));

/**
 * `POST /v1/marketing/desk-mode` — declare the desk's mode, including the one a
 * regulator can impose.
 *
 * MiCA Art 94 lets the competent authority suspend marketing communications for
 * 30 working days. That is a state the instrument must have somewhere to put, or
 * the day it happens the desk keeps drafting as though nothing changed. `basis`
 * is required and free text: an operator switching the desk off must say on whose
 * instruction, because that sentence is the record.
 */
export interface DeskModeBody {
  /** Shared `DeskMode`. */
  mode: string;
  /** Why, and on whose authority. Never optional. */
  basis: string;
  /** ISO-8601. Null for an open-ended suspension. */
  untilInstant?: string | null;
}

export const setDeskMode = (body: DeskModeBody) =>
  unwrap(request<{ data: DeskModeRecord }>(
    '/v1/marketing/desk-mode', { method: 'POST', body, auth: true },
  ));

/**
 * `GET /v1/marketing/precedent` — what did we say about this before.
 *
 * Needs its own table on the server side, which is the whole point: the 90-day
 * retention cascade destroys the desk's memory, so "we answered this in March"
 * is unanswerable from the reply queue. Two answers to the same question that
 * disagree is contradiction debt, and it is only visible if the earlier answer
 * survived.
 */
export const fetchPrecedent = (params: { q?: string; asset?: string; limit?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.asset) qs.set('asset', params.asset);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const suffix = qs.toString();
  return unwrap(request<{ data: PrecedentSearchResult }>(
    `/v1/marketing/precedent${suffix ? `?${suffix}` : ''}`, { auth: true },
  ));
};

/**
 * `GET /v1/marketing/silence` — the decisions not to answer.
 *
 * A decision not to answer is a decision, and RESIST 2's lowest priority tier
 * explicitly means "lines prepared, no response made" — which is an action with a
 * rationale, not an absence. Today `POST /:id/status` accepts `'ignored'` and
 * records no reason at all, so the desk's most common decision leaves the least
 * evidence.
 */
export const fetchSilenceLog = (limit?: number) =>
  /* `unwrap`, like every other read here. It calls `unwrapWithMeta` internally, so the
     `SilenceLogMeta` this route puts beside the array — the frame, and whether the ledger was
     readable at all — survives on the non-enumerable symbol and `responseMeta(rows)` can
     still answer. Peeling `.data` by hand is what cost seven surfaces their `migrated: false`. */
  unwrap(request<{ data: SilenceLog }>(
    `/v1/marketing/silence${limit !== undefined ? `?limit=${limit}` : ''}`, { auth: true },
  ));

/**
 * `POST /v1/marketing/:id/silence` — record WHY nothing was said.
 *
 * Distinct from `setReplyStatus(id, 'ignored')` because the rationale is the
 * record; a status flip with no reason is the thing this replaces. Whether it
 * also sets the status to `ignored` is the server's business, so no surface has
 * to remember to make two calls in the right order.
 */
export interface SilenceDecisionBody {
  /** Shared triage vocabulary — the tier/reason this decision rests on. */
  reason: string;
  /** The sentence an operator would defend in a review. Never optional. */
  rationale: string;
  /** Lines prepared but not used, if any — the tier's own definition. */
  linesPrepared?: string | null;
}

export const recordSilenceDecision = (replyId: number, body: SilenceDecisionBody) =>
  unwrap(request<{ data: SilenceLogEntry }>(
    `/v1/marketing/${replyId}/silence`, { method: 'POST', body, auth: true },
  ));

/* ──── M5 — the crisis room ──── */

/**
 * `GET /v1/marketing/crisis/statements` — the versioned holding statements.
 *
 * NEEDS ZERO DATA. These are in code, versioned, and readable at 03:00 on the
 * worst night of the year with an empty database and a pending migration. The
 * response must therefore never depend on `migrated: true`, and a surface that
 * renders a migration banner instead of the statements has defeated the point.
 */
export const fetchCrisisStatements = () =>
  unwrap(request<{ data: CrisisStatementLibrary }>('/v1/marketing/crisis/statements', { auth: true }));

/**
 * `POST /v1/marketing/crisis/statements/:key/instance` — start a live instance of
 * a template, in the known / notKnown / next-update-by shape.
 *
 * `notKnown` and `nextUpdateBy` are required, and that is the doctrine rule this
 * body exists to enforce: over-reassurance is the charged act. "FTX is fine.
 * Assets are fine" is pleaded as fraud in SEC v. Bankman-Fried ¶78 — the failure
 * mode is not saying too little, it is saying more than is known.
 */
export interface CrisisInstanceBody {
  /** What is established, and would survive being read back in a hearing. */
  known: string[];
  /** What is NOT yet established. An empty array must be refused, not accepted. */
  notKnown: string[];
  /** ISO-8601. A commitment the clock will measure and the metrics will breach. */
  nextUpdateBy: string;
  /** Shared `MarketingJurisdiction[]`. */
  addressedTo?: string[];
}

export const openCrisisStatement = (templateKey: string, body: CrisisInstanceBody) =>
  unwrap(request<{ data: CrisisStatementInstance }>(
    `/v1/marketing/crisis/statements/${encodeURIComponent(templateKey)}/instance`,
    { method: 'POST', body, auth: true },
  ));

/**
 * `GET /v1/marketing/crisis/instance/:id` — one live statement with its clearance
 * board and its clock.
 */
export const fetchCrisisInstance = (instanceId: string) =>
  unwrap(request<{ data: CrisisStatementInstance }>(
    `/v1/marketing/crisis/instance/${encodeURIComponent(instanceId)}`, { auth: true },
  ));

/**
 * `POST /v1/marketing/crisis/instance/:id/clearance` — record one clear.
 *
 * CDC's CERC model runs reputation, policy and SME clearance IN PARALLEL and
 * blocking, with advisory reviewers who "may comment but not delay". Serialising
 * them is how a holding statement takes six hours; SVB lost more than $40bn in a
 * single day, which is the reason the clock exists at all.
 *
 * `role` is not `approvedBy`: WHO cleared comes from the session. And the surface
 * must be able to admit that two approvers holding one shared passcode is not
 * four-eyes (doctrine rule 8) rather than perform it.
 */
export interface CrisisClearanceBody {
  /** Which of the three blocking clears, or an advisory comment. */
  role: string;
  /**
   * Shared `ClearanceDecision`. `string` rather than a three-literal union
   * written here, for the same reason as every other vocabulary field in this
   * file: the crisis room's decision enum belongs in
   * `packages/shared/src/marketing/`, and a copy in the browser is a second
   * vocabulary that agrees until the day one of them changes.
   */
  decision: string;
  /** The reviewer's test: comfortable seeing this as a news headline? */
  headlineTestPassed?: boolean | null;
  comment?: string | null;
}

export const recordCrisisClearance = (instanceId: string, body: CrisisClearanceBody) =>
  unwrap(request<{ data: ClearanceBoard }>(
    `/v1/marketing/crisis/instance/${encodeURIComponent(instanceId)}/clearance`,
    { method: 'POST', body, auth: true },
  ));

/**
 * `GET /v1/marketing/crisis/preclears` — the peer-contagion preclears.
 *
 * `are_you_like_<peer>` lines, prepared before they are needed. Crypto.com in
 * November 2022 was contagion by shared attribute, not by exposure, and LCX is in
 * that class: the question arrives whether or not there is anything to it.
 */
export const fetchPeerPreclears = () =>
  unwrap(request<{ data: PeerPreclearLibrary }>('/v1/marketing/crisis/preclears', { auth: true }));

/* ──── M6 — the watch ──── */

/**
 * `GET /v1/marketing/watch` — the regulator and narrative watch.
 *
 * All keyless, all verified reachable: ESMA's `/rss.xml`, FMA's typed
 * `sitemap.warning_entry.xml` (FMA publishes no RSS at all, so the sitemap IS the
 * investor-warning feed), and the ~20 feeds the `market_news` spine already pulls
 * and marketing reads none of.
 *
 * Every feed carries its own `ObservationFrame`, and a feed that failed to fetch
 * must come back as "could not see" rather than as an empty list. A watch panel
 * that silently renders zero warnings after a network failure is worse than no
 * watch panel.
 */
export const fetchMarketingWatch = () =>
  unwrap(request<{ data: WatchDigest }>('/v1/marketing/watch', { auth: true }));

/**
 * `GET /v1/marketing/watch/claim-expiry` — the claim-freshness ledger.
 *
 * A claim that was true in March is a liability in August. Liechtenstein's Art
 * 143(3) transition ended on 1 July 2026 and TVTG registrations expired on 2 July
 * — last month — so every line asserting a TVTG registration is stale right now
 * and there is no grandfathering left to cover it.
 */
export const fetchClaimExpiry = () =>
  unwrap(request<{ data: ClaimExpiryLedger }>('/v1/marketing/watch/claim-expiry', { auth: true }));

/* ──── M7 — the record ──── */

/**
 * `GET /v1/marketing/export/:itemId` — the produce-on-demand bundle.
 *
 * Art 8(2) is a produce-on-demand duty, which makes this a feature rather than an
 * afterthought: one communication, reproducible with who wrote it, who cleared
 * it, which claims it used, what the desk knew at the time, and the regime
 * classification AS RECORDED — never recomputed, because recomputing at export
 * time applies today's rules to yesterday's text and has close to zero evidential
 * value under Art 68(9).
 *
 * Returns a JSON bundle, not a file. There is no download endpoint here and no
 * blob handling: the printable artefact is rendered by the page from this payload,
 * which keeps the record and its presentation in one place and out of a second
 * server format nobody diffs.
 */
export const fetchExportBundle = (itemId: string) =>
  unwrap(request<{ data: ExportBundle }>(
    `/v1/marketing/export/${encodeURIComponent(itemId)}`, { auth: true },
  ));

/**
 * `GET /v1/marketing/post-time` — what fraction of the queue carries X's own post date.
 *
 * ── WHY THIS FETCHER IS WORTH ITS OWN ENTRY IN A FILE THAT AVOIDS DECORATION ──
 * The route's own docblock (`routes/marketingRecord.ts:975`) ended with "No browser surface
 * fetches this route … a client fetcher with no component would be the same decoration this
 * wave exists to remove, so there is none." That sentence was true and is now false in both
 * halves: `components/marketing/PostTimePanel.tsx` is the component, and this is the
 * fetcher it uses. The API's comment is the one thing this wave could not edit, so it is
 * quoted here rather than left to contradict the code silently.
 *
 * ── AND WHY THE NUMBER MATTERS MORE THAN A COVERAGE FIGURE USUALLY WOULD ──
 * Two clocks run over an inbound reply: since the desk LEARNED of it (`received_at`, always
 * known) and since the customer POSTED it (`posted_on_displayed`, known only where X's
 * public oEmbed endpoint answered). Only the second is the customer's wait, and every
 * surface needing it refuses rather than substituting the first. So this fraction is the
 * size of the honest-refusal surface — at 0 every "how long have they waited" question in
 * the compartment refuses forever — and, because oEmbed is an INDEPENDENT channel from the
 * mailbox, it is simultaneously the anti-forgery corroboration rate for defect 1.
 *
 * CONTRACTED. `PostTimeCoverageReport` is declared once, in
 * `packages/shared/src/marketing/contracts/record.ts` §8, and the route handler assigns its
 * response to that same symbol. `coverage` is a `Figure`, so an empty corpus arrives as
 * `absent` with a refusal and never as `0 of 0` — which on a panel is indistinguishable
 * from full coverage.
 */
export const fetchCorroborationCoverage = () =>
  unwrap(request<{ data: PostTimeCoverageReport }>('/v1/marketing/post-time', { auth: true }));

/* ──── M8 — honest measurement, and the loop ──── */

/**
 * `GET /v1/marketing/metrics` — the twelve process metrics, and nothing else.
 *
 * WHAT THIS RESPONSE MUST NEVER CONTAIN, because it is the honesty ceiling and a
 * panel showing any of them is a defect rather than a feature: impressions,
 * reach, follower delta, engagement rate, click-through, share of voice,
 * audience sentiment. Each needs a denominator that does not exist without an X
 * credential, and there is no credential and never will be.
 *
 * What it does contain is measurable from the desk's own records:
 * time-to-first-statement against budget, per-role clearance latency,
 * precleared-derivation rate, claim-provenance rate, contradiction debt, line
 * staleness, `notKnown` non-empty rate, refusal codes by frequency, retraction
 * count and next-update breaches. Counts of observed items are LOWER BOUNDS and
 * must arrive named as such — `repliesObserved`, never `replies`.
 *
 * Refusal codes by frequency is the only honest read on whether the desk is
 * getting safer, which is why it is a first-class metric and not a debug log.
 */
export const fetchProcessMetrics = () =>
  unwrap(request<{ data: ProcessMetrics }>('/v1/marketing/metrics', { auth: true }));

/**
 * `GET /v1/marketing/loop` — the post-mortem loop and the WBR block.
 *
 * At n=0 the verdict IS the report, the way `GET /v1/gps/loop` answers 200 on
 * zero records: "this desk has recorded no outcomes" is a finding a review can
 * act on, and an empty panel is not.
 */
export const fetchMarketingLoop = () =>
  unwrap(request<{ data: MarketingLoopReport }>('/v1/marketing/loop', { auth: true }));

/* ──── M7 — the three GDPR / retention paths whose engine has no caller ──── */

/**
 * `POST /v1/marketing/subject-access` — GDPR Art 15, everything held about one handle.
 *
 * THE ENGINE EXISTS AND IS DEAD. `apps/api/src/marketing/record.ts subjectAccess` is
 * written and tested; nothing in `apps/api/src` imports the module, so there is no route,
 * and a data subject's Art 15 request cannot be answered from this product at all. Art
 * 12(3) allows one month. That is a compliance gap with a clock on it, and it was the only
 * absence in this compartment that was not written down anywhere — the other twenty were.
 *
 * `POST` and not `GET` on purpose: the handle is personal data and must not travel in a
 * URL, a referrer or an access log.
 */
export const requestSubjectAccess = (body: { handle: string; requestedBy: string }) =>
  unwrap(request<{ data: SubjectAccessResponse }>('/v1/marketing/subject-access', {
    method: 'POST', body, auth: true,
  }));

/**
 * `POST /v1/marketing/erasure` — GDPR Art 17, and it is NOT a delete button.
 *
 * `record.ts eraseByHandle` erases third-party content while preserving what Art 17(3)(b)
 * and (e) require the desk to keep, and writes `marketing_erasure_log` so the erasure
 * itself is provable. Also dead for want of an importer.
 */
export const requestErasure = (body: { handle: string; requestedBy: string; basis: string }) =>
  unwrap(request<{ data: ErasureOutcome }>('/v1/marketing/erasure', {
    method: 'POST', body, auth: true,
  }));

/**
 * `POST /v1/marketing/record` — put one of LCX's OWN statements on the five-year clock.
 *
 * The 90-day sweep is wired; `writeRecord` is not. So the retention split 0061 designs is
 * inoperative in one direction: nothing is ever placed on the long clock, and on day 91 the
 * compartment retains nothing at all — which is the opposite of what Art 68(9) and Art
 * 88(1) require of the statements LCX itself published. The DPO ruling in §7 of the plan is
 * arriving as a default instead of as a decision, and this is the route that would let it
 * be a decision.
 */
export const recordOwnStatement = (body: {
  itemId: string; text: string; recordedBy: string;
}) =>
  unwrap(request<{ data: MarketingRecordRow }>('/v1/marketing/record', {
    method: 'POST', body, auth: true,
  }));

/* ──── The close-out — a RECORD, and the reason there is no publish path ──── */

/**
 * `POST /v1/marketing/draft/:id/close-out` — record what a human actually
 * published, AFTER they published it, by hand, outside this system.
 *
 * READ THIS BEFORE ASSUMING IT IS A SEND. It transmits nothing to X. It exists
 * because approval is not publication and the desk currently pretends otherwise:
 * status flips to `answered` on approval, copy is ungated, and approved text need
 * not equal published text — so today there is no row anywhere that says what LCX
 * said. This closes that gap in the only direction the owner's constraint allows:
 * the human is the actuator, and the software is the witness.
 *
 * `publishedText` is required and is NOT defaulted to the approved draft. A
 * default would silently re-assert the thing this endpoint exists to stop
 * assuming, and the diff between approved and published is precisely the evidence
 * a regulator asks for.
 */
export interface PublicationCloseOutBody {
  /** Shared `Permalink`. Stored as pasted; never constructed from an id. */
  permalink: string;
  /** Verbatim, as it appears on the platform. Not the approved draft. */
  publishedText: string;
  /** ISO-8601, from the platform. Null if the operator could not read it. */
  publishedAt?: string | null;
}

export const recordPublicationCloseOut = (draftId: number, body: PublicationCloseOutBody) =>
  unwrap(request<{ data: PublicationCloseOut }>(
    // `/handoff`, not `/close-out`. `handoff` is the word the shared vocabulary
    // already uses for the terminal state of a cleared draft
    // (`packages/shared/src/marketing/types.ts` §9), and
    // `components/marketing/deskApi.ts:106` is a live caller of exactly that path.
    // Two names for one route means the API wave mounts one of them and the other
    // 404s on click, which is how `issueGpsProposal` shipped pointing at
    // `/propose` while the server mounted `/proposal` (`lib/api/gps.ts:206`).
    `/v1/marketing/draft/${draftId}/handoff`, { method: 'POST', body, auth: true },
  ));

/* ════════ §3 THE LEDGERS — the debt, in code rather than in a commit message ════════ */

/**
 * ONE ROW PER ROUTE THAT DOES NOT EXIST YET.
 *
 * A comment saying "the API owes us this" is invisible the week after it is
 * written. This is a value: `__tests__/marketingContract.test.ts` counts the
 * `UncontractedPayload` fetchers in this file and fails if the two disagree, so a
 * function cannot be added without recording its debt and a debt cannot be
 * dropped while its function still returns `unknown`.
 *
 * `sharedTypeOwed` is the name the response shape must be declared under in
 * `packages/shared/src/marketing/`, so that the route handler and this module
 * import the SAME symbol. That is the whole discipline: one declaration, or none.
 *
 * ROUTE-ORDERING HAZARD for whoever mounts these. `routes/marketing.ts` already
 * owns `POST /:id/draft`, `GET /:id/drafts` and `POST /:id/status`, where `:id` is
 * a positive integer. The static-prefixed routes below (`/desk`, `/precedent`,
 * `/crisis/...`, `/export/...`) must be registered so they cannot be shadowed by
 * those patterns — none of them collides today, because every two-segment pattern
 * differs in its literal second segment, but a future `GET /:id/anything` would
 * silently capture `/export/anything` and answer 400 `VALIDATION` on a path that
 * looks correct.
 */
export interface MarketingContractOwed {
  /** The exported fetcher in this file. */
  readonly fn: string;
  readonly method: 'GET' | 'POST';
  /** The route pattern, `:param` style, as it must be mounted. */
  readonly path: string;
  /** The plan phase that owns building it. */
  readonly phase: 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8';
  /** The response type `packages/shared/src/marketing/` must declare. */
  readonly sharedTypeOwed: string;
}

/**
 * SIXTEEN OF THE TWENTY-THREE ARE NOW DELIVERED, and the fact is recorded here rather
 * than left to be inferred from a shorter list.
 *
 * `contracts/desk.ts`, `contracts/memory.ts` and `contracts/record.ts` landed the response
 * shapes for the desk board, desk mode, the precedent index, all five crisis routes, the
 * watch, the claim-expiry ledger, the Art 8(2) export bundle and the three statutory paths;
 * `types.ts` §16 already held `AbusePerimeterState` and `PublicationCloseOut`, and
 * `abuse.ts` held `MarketAbuseVerdict`. Each is imported at the top of this file from that
 * single declaration, and the route handler imports the same symbol.
 *
 * WHAT THAT BUYS, CONCRETELY. `WatchDigest` is nothing like the payload this client's
 * surfaces had guessed at while the contract was being authored — the guess had `feeds[]`,
 * `mentionsUs` and a `standing` string, and the real shape has three named source panels,
 * a term-coverage block and `matchesObserved: number | null`. Every one of those guesses
 * would have compiled, satisfied a mocked test, and rendered an empty watch forever.
 *
 * THE SEVEN BELOW REMAIN `UncontractedPayload = unknown`, deliberately and unchanged.
 * An uncontracted route obstructs at compile time; the alternative — a hand-written
 * web-side interface guessing at the payload — is the exact defect that crashed the GPS
 * compartment on 2026-08-01. Their surfaces narrow `unknown` at runtime through
 * `components/marketing/narrow.ts`, which is the only other honest move, and the length of
 * this list is the honest measure of how much of this compartment is still guessing.
 */
export const MARKETING_CONTRACTS_OWED: readonly MarketingContractOwed[] = [
  /*
   * ══ EMPTY, AND THE EMPTINESS IS THE ENTRY ══
   *
   * All twenty-three are declared. `contracts/gates.ts` landed the last seven —
   * `ClaimSafetyVerdict`, `ReplyProvenanceRecord`, `CorroborationResult`, `SilenceLog` and
   * `SilenceLogEntry`, `ProcessMetrics`, `MarketingLoopReport` — and every fetcher above now
   * imports its response type from `packages/shared`, which the route handler imports from
   * the same declaration. There is no `UncontractedPayload` left in this file, and
   * `marketingContract.test.ts` compares this list against the `unknown`-returning fetchers
   * on disk in BOTH directions, so it fails if either side drifts.
   *
   * THE TYPE, THE INTERFACE AND THIS ARRAY ARE ALL KEPT rather than deleted with the debt.
   * Deleting the apparatus is how the next uncontracted route arrives with no place to be
   * recorded, and the argument for `unknown` — that a missing contract must obstruct at
   * compile time instead of crashing in front of an operator — is not a fact about these
   * twenty-three. It is the rule for the next one.
   *
   * WHAT THIS DID NOT BUY, said plainly. A contract is a guarantee that both sides read the
   * same field names; it is not a guarantee that a route is mounted, that its migration is
   * applied, or that its engine has a caller. Three of the seven were dead engines with
   * contracts written for them, and `useDeskRead`'s `absent` state is what still carries that
   * distinction on screen.
   */
] as const;

/**
 * THE VOCABULARY THIS FILE IS TYPING AS `string` UNDER PROTEST.
 *
 * Every symbol below is already declared, once, in
 * `packages/shared/src/marketing/types.ts`. None of them can be imported here
 * until `packages/shared/src/index.ts` re-exports `./marketing/types.js` — the
 * package publishes a single `"."` export, so a deep specifier does not resolve.
 * That one-line change is not this wave's to make, and it is the highest-value
 * unblock in the whole client: it turns twelve `string` fields into checked
 * unions without touching a single call site.
 *
 * Re-declaring them here instead would give the compartment two vocabularies that
 * agree until the day one of them changes.
 */
/**
 * ONE ROUTE, TWO CLIENTS — and now one of them is known to be aimed at nothing.
 *
 * `components/marketing/deskApi.ts` is a SECOND web client for this compartment, written
 * concurrently with this module by the wave that built the desk components. It is not sloppy
 * — it narrows `unknown` at runtime rather than declaring a response interface, which is the
 * right instinct — but four of its routes overlap this file's, and the API has now decided
 * two of the arguments:
 *
 *  · `POST /v1/marketing/review` (deskApi's `reviewText`) WAS NOT MOUNTED and no router ever
 *    declared it. What the API built instead is three narrower routes — `POST /regime`,
 *    `POST /triage/assess` and `POST /adoption` in `routes/marketingDesk.ts` — which is the
 *    plan's separation of the wording axis from the state-join axis rather than one combined
 *    verdict. The previous wave declined to repoint the surface and said why: the three
 *    replacement routes need their contracts read and a decision about which of them the
 *    drafting room asks for, and guessing is how a screen ends up showing a triage verdict as
 *    a wording verdict.
 *
 *    THAT DECISION IS NOW MADE. The drafting room asks `/regime` about the words (and takes
 *    its Art 7 arithmetic as the length gate's verdict) and `/adoption` about the verb, and
 *    asks `/triage/assess` NOTHING — triage is the board's upstream decision, which is the
 *    confusion that was feared. `reviewText` and `ReviewVerdict` are deleted from
 *    `deskApi.ts` rather than left pointing at a 404, so this row is history and not a live
 *    overlap; the deletion is documented in that file at the place they used to be.
 *  · `GET /v1/marketing/silence` and `POST /v1/marketing/:id/silence` ARE MOUNTED NOW
 *    (`routes/marketingGates.ts:1240`, `:1395`), and the prediction in this bullet's earlier
 *    wording — "it will cost something the day the route lands and only one of them is
 *    updated" — is why the duplication was resolved rather than updated. `listSilences` and
 *    `SilenceEntry` are deleted; the panel reads the contracted `SilenceLog` through
 *    `fetchSilenceLog`, so a server-side rename is a TS error instead of a blank column.
 *    The write is wired too, which it never was: `POST /:id/silence` had no caller in any
 *    component, so the desk's most common decision could only be recorded as a status flip
 *    with no reason at all.
 *  · `GET /v1/marketing/precedent` — `findPrecedent` there, `fetchPrecedent` here. The route
 *    EXISTS now (`routes/marketingMemory.ts:445`) and its response is typed
 *    `PrecedentSearchResult`. `fetchPrecedent` imports that type; `findPrecedent` still
 *    narrows a guess. The panel on screen is wired to the narrower.
 *  · `POST /v1/marketing/:id/triage` (deskApi's `recordTriage`) is mounted
 *    (`routes/marketingDesk.ts:1187`) and has no counterpart here. That one is fine as it is.
 *
 * THIS WAVE OWNS `deskApi.ts` and still did not merge the two clients, which is a choice and
 * not an oversight. Repointing four live, tested surfaces at differently-shaped responses is
 * a change whose failure mode is a screen that renders a verdict about the wrong axis, and it
 * belongs in a pass that can re-test each panel against the real payloads rather than at the
 * end of a wave whose remaining budget is one file. The list below is checked by
 * `marketingContract.test.ts` against `deskApi.ts` on disk, so it cannot rot quietly.
 *
 * ── THE TWO CLIENTS ARE STILL TWO, BUT THEY NO LONGER DISAGREE ABOUT THE CEILING ──
 * The unmerged part was never the expensive part. `deskApi.ts` imported `unwrapWithMeta`
 * directly and applied NO honesty ceiling to any of its three reads, while this file's
 * `unwrap` comment claimed to be the one place every marketing read passed through. A second
 * client is a maintenance cost; a second client with weaker guarantees than the first is the
 * GPS two-write-paths defect in read form — and the surfaces used the weaker one. All three
 * now call `unwrapMarketingRead`, so both clients share one ceiling and one refusal shape.
 *
 * ONE THING WAS CHECKED BEFORE DOING IT, because getting it wrong would break a live board:
 * `recordTriage` SENDS a body carrying `reach` — the legitimate RESIST 2 ordinal, not the
 * banned audience metric. The ceiling walks RESPONSES and never request bodies, and the
 * response (`TriageDecisionRecord`) names its reach-shaped fields `reachTrajectory`,
 * `reachLadder` and `reachAtDecision`, none of which normalise to a banned key. If a future
 * route echoed the request body back, the ceiling would fire on it — and that would be the
 * ceiling doing its job on a payload that had no business carrying the bare name.
 */
export const MARKETING_CLIENT_OVERLAPS: readonly string[] = [
  'components/marketing/deskApi.ts findPrecedent → GET /v1/marketing/precedent',
  'components/marketing/deskApi.ts recordTriage → POST /v1/marketing/:id/triage (no counterpart here)',
] as const;

export const MARKETING_VOCABULARY_OWED: readonly string[] = [
  'ActorId',
  'AssetSymbol',
  'ConsiderationKind',
  'ContentSurface',
  'DeskMode',
  'EngagementVerb',
  'Handle',
  'Instant',
  'MarketingJurisdiction',
  'Permalink',
] as const;
