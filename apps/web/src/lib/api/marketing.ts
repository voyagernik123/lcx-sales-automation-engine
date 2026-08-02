import { request } from '../apiClient';
import { unwrapWithMeta } from './meta.js';

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
const unwrap = unwrapWithMeta;

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
   * PRESENT BECAUSE THE ROUTE SELECTS `*`, NOT BECAUSE ANY SCREEN NEEDS IT.
   *
   * `listReplies` is `SELECT * FROM marketing_x_reply` (`service.ts:201`), so up
   * to 20KB of a stranger's forwarded email crosses to the browser on every
   * queue read. Declared rather than omitted because the field IS in the
   * payload and pretending otherwise is the same class of lie this module is
   * built to avoid — but nothing may render it, and the fix belongs to the
   * route (a column list), not to this client.
   */
  raw_email: string | null;
  /** When the field sweep nulled `raw_email`. Null while it is still held. */
  raw_email_cleared_at: string | null;

  /* ── M0 defect 1: how the sender was established, if at all ──────────────────────────
   * These four cross to the browser for the same `SELECT *` reason as `raw_email`, and
   * they are declared for the same reason: the field IS in the payload, and pretending
   * otherwise is the lie this module exists to avoid.
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
  unwrap(request<{ data: UncontractedPayload }>(
    '/v1/marketing/claim-safety', { method: 'POST', body, auth: true },
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
  unwrap(request<{ data: UncontractedPayload }>(
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
 */
export const fetchAbusePerimeter = () =>
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/perimeter', { auth: true }));

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
  unwrap(request<{ data: UncontractedPayload }>(
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
  unwrap(request<{ data: UncontractedPayload }>(
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
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/desk', { auth: true }));

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
  unwrap(request<{ data: UncontractedPayload }>(
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
  return unwrap(request<{ data: UncontractedPayload }>(
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
  unwrap(request<{ data: UncontractedPayload }>(
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
  unwrap(request<{ data: UncontractedPayload }>(
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
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/crisis/statements', { auth: true }));

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
  unwrap(request<{ data: UncontractedPayload }>(
    `/v1/marketing/crisis/statements/${encodeURIComponent(templateKey)}/instance`,
    { method: 'POST', body, auth: true },
  ));

/**
 * `GET /v1/marketing/crisis/instance/:id` — one live statement with its clearance
 * board and its clock.
 */
export const fetchCrisisInstance = (instanceId: string) =>
  unwrap(request<{ data: UncontractedPayload }>(
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
  unwrap(request<{ data: UncontractedPayload }>(
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
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/crisis/preclears', { auth: true }));

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
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/watch', { auth: true }));

/**
 * `GET /v1/marketing/watch/claim-expiry` — the claim-freshness ledger.
 *
 * A claim that was true in March is a liability in August. Liechtenstein's Art
 * 143(3) transition ended on 1 July 2026 and TVTG registrations expired on 2 July
 * — last month — so every line asserting a TVTG registration is stale right now
 * and there is no grandfathering left to cover it.
 */
export const fetchClaimExpiry = () =>
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/watch/claim-expiry', { auth: true }));

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
  unwrap(request<{ data: UncontractedPayload }>(
    `/v1/marketing/export/${encodeURIComponent(itemId)}`, { auth: true },
  ));

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
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/metrics', { auth: true }));

/**
 * `GET /v1/marketing/loop` — the post-mortem loop and the WBR block.
 *
 * At n=0 the verdict IS the report, the way `GET /v1/gps/loop` answers 200 on
 * zero records: "this desk has recorded no outcomes" is a finding a review can
 * act on, and an empty panel is not.
 */
export const fetchMarketingLoop = () =>
  unwrap(request<{ data: UncontractedPayload }>('/v1/marketing/loop', { auth: true }));

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
  unwrap(request<{ data: UncontractedPayload }>(
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

export const MARKETING_CONTRACTS_OWED: readonly MarketingContractOwed[] = [
  { fn: 'recordPublicationCloseOut', method: 'POST', path: '/v1/marketing/draft/:id/handoff', phase: 'M0', sharedTypeOwed: 'PublicationCloseOut' },
  { fn: 'checkClaimSafety', method: 'POST', path: '/v1/marketing/claim-safety', phase: 'M1', sharedTypeOwed: 'ClaimSafetyVerdict' },
  { fn: 'checkMarketAbuse', method: 'POST', path: '/v1/marketing/abuse-check', phase: 'M2', sharedTypeOwed: 'MarketAbuseVerdict' },
  { fn: 'fetchAbusePerimeter', method: 'GET', path: '/v1/marketing/perimeter', phase: 'M2', sharedTypeOwed: 'AbusePerimeterState' },
  { fn: 'fetchReplyProvenance', method: 'GET', path: '/v1/marketing/replies/:id/provenance', phase: 'M3', sharedTypeOwed: 'ReplyProvenanceRecord' },
  { fn: 'corroborateReply', method: 'POST', path: '/v1/marketing/replies/:id/corroborate', phase: 'M3', sharedTypeOwed: 'CorroborationResult' },
  { fn: 'fetchDeskBoard', method: 'GET', path: '/v1/marketing/desk', phase: 'M4', sharedTypeOwed: 'DeskBoard' },
  { fn: 'setDeskMode', method: 'POST', path: '/v1/marketing/desk-mode', phase: 'M4', sharedTypeOwed: 'DeskModeRecord' },
  { fn: 'fetchPrecedent', method: 'GET', path: '/v1/marketing/precedent', phase: 'M4', sharedTypeOwed: 'PrecedentSearchResult' },
  { fn: 'fetchSilenceLog', method: 'GET', path: '/v1/marketing/silence', phase: 'M4', sharedTypeOwed: 'SilenceLog' },
  { fn: 'recordSilenceDecision', method: 'POST', path: '/v1/marketing/:id/silence', phase: 'M4', sharedTypeOwed: 'SilenceLogEntry' },
  { fn: 'fetchCrisisStatements', method: 'GET', path: '/v1/marketing/crisis/statements', phase: 'M5', sharedTypeOwed: 'CrisisStatementLibrary' },
  { fn: 'openCrisisStatement', method: 'POST', path: '/v1/marketing/crisis/statements/:key/instance', phase: 'M5', sharedTypeOwed: 'CrisisStatementInstance' },
  { fn: 'fetchCrisisInstance', method: 'GET', path: '/v1/marketing/crisis/instance/:id', phase: 'M5', sharedTypeOwed: 'CrisisStatementInstance' },
  { fn: 'recordCrisisClearance', method: 'POST', path: '/v1/marketing/crisis/instance/:id/clearance', phase: 'M5', sharedTypeOwed: 'ClearanceBoard' },
  { fn: 'fetchPeerPreclears', method: 'GET', path: '/v1/marketing/crisis/preclears', phase: 'M5', sharedTypeOwed: 'PeerPreclearLibrary' },
  { fn: 'fetchMarketingWatch', method: 'GET', path: '/v1/marketing/watch', phase: 'M6', sharedTypeOwed: 'WatchDigest' },
  { fn: 'fetchClaimExpiry', method: 'GET', path: '/v1/marketing/watch/claim-expiry', phase: 'M6', sharedTypeOwed: 'ClaimExpiryLedger' },
  { fn: 'fetchExportBundle', method: 'GET', path: '/v1/marketing/export/:itemId', phase: 'M7', sharedTypeOwed: 'ExportBundle' },
  { fn: 'fetchProcessMetrics', method: 'GET', path: '/v1/marketing/metrics', phase: 'M8', sharedTypeOwed: 'ProcessMetrics' },
  { fn: 'fetchMarketingLoop', method: 'GET', path: '/v1/marketing/loop', phase: 'M8', sharedTypeOwed: 'MarketingLoopReport' },
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
 * ONE ROUTE, TWO CLIENTS — read before adding a third.
 *
 * `components/marketing/deskApi.ts` is a SECOND web client for this compartment,
 * written concurrently with this module by the wave that owns the desk components.
 * It is not sloppy — it narrows `unknown` at runtime rather than declaring a
 * response interface, which is the right instinct — but four of its routes overlap
 * this file's, and two of them disagree about the path:
 *
 *  · `GET /v1/marketing/silence` — `listSilences` there, `fetchSilenceLog` here.
 *  · `GET /v1/marketing/precedent` — `findPrecedent` there, `fetchPrecedent` here.
 *    Same path in both, so nothing breaks; two fetchers for one route is still one
 *    of them that will not be updated when the response shape lands.
 *  · `POST /v1/marketing/review` (there) versus `POST /v1/marketing/claim-safety`
 *    plus `POST /v1/marketing/abuse-check` (here). A REAL CONFLICT: the API wave
 *    will mount one shape and the other is dead on arrival. `deskApi`'s combined
 *    call is the one already wired to a screen; this file's split is the one that
 *    matches the plan's separation of the wording axis from the state-join axis
 *    (M1 versus M2). It needs deciding, not averaging.
 *  · `POST /v1/marketing/:id/triage` (there) has no counterpart here;
 *    `recordSilenceDecision` covers only the decision-not-to-answer case.
 *
 * Recorded rather than resolved because this wave does not own `deskApi.ts`, and
 * editing another wave's file mid-flight is how two agents produce three
 * contracts. `recordPublicationCloseOut` was pointed at `deskApi`'s `/handoff`
 * path for the one case where alignment was free and unambiguous.
 */
export const MARKETING_CLIENT_OVERLAPS: readonly string[] = [
  'components/marketing/deskApi.ts listSilences → GET /v1/marketing/silence',
  'components/marketing/deskApi.ts findPrecedent → GET /v1/marketing/precedent',
  'components/marketing/deskApi.ts reviewText → POST /v1/marketing/review (conflicts with claim-safety + abuse-check)',
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
