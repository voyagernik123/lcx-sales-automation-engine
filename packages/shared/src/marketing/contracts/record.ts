/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  M6/M7 RESPONSE CONTRACTS — the watch, the record, retention, and the two GDPR
 *  paths. DECLARED ONCE, HERE, AND IMPORTED BY BOTH SIDES.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  WHY THIS FILE EXISTS AT ALL, stated as the defect it prevents rather than as a
 *  preference. A web-side interface that declares a field the API does not return
 *  compiles, satisfies a mocked test, and throws on the first real payload — that
 *  is how the GPS compartment broke on 2026-08-01. So the six routes this file
 *  covers have exactly one declaration of their response shape, in this package,
 *  and `apps/api/src/routes/marketingRecord.ts` assigns its handler output to
 *  these types before returning it. That assignment is the binding: if an engine
 *  in `apps/api/src/marketing/` changes a field name, the ROUTE fails to compile
 *  rather than the browser failing to render.
 *
 *  THE SIX ROWS OF `MARKETING_CONTRACTS_OWED` THIS FILE PAYS
 *    GET  /v1/marketing/watch               → `WatchDigest`
 *    GET  /v1/marketing/watch/claim-expiry  → `ClaimExpiryLedger`
 *    GET  /v1/marketing/export/:itemId      → `ExportBundle`
 *    POST /v1/marketing/subject-access      → `SubjectAccessResponse`
 *    POST /v1/marketing/erasure             → `ErasureOutcome`
 *    POST /v1/marketing/record              → `MarketingRecordRow`
 *  plus two the ledger does not name because the routes did not exist when it was
 *  written: `RetentionPosture` and `RetentionSweepReport`, which are the five-year
 *  clock made readable and runnable.
 *
 *  ── ON MIRRORING, AND WHY IT IS NOT DUPLICATION ──
 *  Several types below have the same field list as an interface in
 *  `apps/api/src/marketing/watch.ts` or `record.ts`. That is deliberate and it is
 *  not a second vocabulary: `apps/api` reaches this package only through its single
 *  `"."` export, and those engine files are not this wave's to edit. The route
 *  assigns the engine value INTO the type declared here, so the compiler checks the
 *  two agree on every field, in both directions, on every build. When the engines
 *  can import from `@lcx/shared` the mirrors collapse into imports and nothing else
 *  changes — the field names were chosen identical so that day is a deletion.
 *
 *  ── THE HONESTY RULES THESE SHAPES ENFORCE ──
 *   1. NO COUNT IS A BARE NUMBER WHERE IT COULD MEAN "we could not look". Every
 *      such field is `number | null`, and null means unobserved. A dead feed
 *      reports its refusal, never zero warnings.
 *   2. EVERY FIGURE CARRIES ITS `ObservationFrame`. `WatchSourceObservation.frame`
 *      is required, so a panel cannot render a watch number without the sentence
 *      saying what the window could not see.
 *   3. A BUNDLE STATES ITS OWN COMPLETENESS ON ITS FACE. `completeness` is required
 *      at both bundle and record level and its lines carry `absent` / `unverifiable`
 *      with a reason. Quiet omission is the failure a reader cannot detect.
 *   4. NOTHING HERE DESCRIBES A PUBLISH. There is no X credential and no route that
 *      posts; `publishedText` is what a human pasted back AFTER publishing by hand.
 *
 *  NO FIELD IN THIS FILE IS NAMED AFTER AN UNOBTAINABLE METRIC. `assertHonestPayload`
 *  (observation.ts) walks every marketing payload in the browser and throws on
 *  `impressions`, `reach`, `follower_delta` and the rest of `FORBIDDEN_FIELD_TABLE`;
 *  a contract that declared one would fail at runtime on the first read.
 */
import type { Figure, ObservationFrame } from '../types.js';

/* ════════ §1 THE WIRE REFUSAL ════════ */

/**
 * A refusal as it crosses the wire: a stable code, a sentence for the human who has
 * to act, and the rule that caused it.
 *
 * WHY IT IS NOT `Refusal` FROM `../types.js`. `Refusal.code` is the `RefusalCode`
 * union and `Refusal.rule` is a `RuleCitation` object. The watch and record engines
 * carry codes that are NOT in that union — `WATCH_SOURCE_UNREACHABLE`,
 * `RECORD_REGISTER_ABSENT`, `RETENTION_CLOCK_NEVER_RAN` — because they are about the
 * REGISTER or the TRANSPORT rather than about content, and widening the content union
 * to hold them would let a fetch failure be reported as a wording violation. So this
 * is the flat I/O shape, `code` is `string`, and the fields map one-to-one onto
 * `Refusal` for the day the unions merge.
 *
 * `ruleText` and `remedy` are optional because the two engines differ: the record
 * engine carries both, the watch engine carries neither. Optional-and-present beats a
 * second interface, and a surface that renders `sentence` alone is always correct.
 */
export interface MarketingWireRefusal {
  readonly code: string;
  readonly sentence: string;
  readonly rule: string;
  /** A claim id, an entry id, a competitor name — whatever the refusal is about. */
  readonly subject?: string;
  readonly ruleText?: string;
  /** The one thing a human can do about it. Present on record and retention refusals. */
  readonly remedy?: string;
}

/* ════════ §2 THE WATCH ════════ */

/**
 * ONE SOURCE, ONE WINDOW, AND WHAT IT COULD NOT SEE.
 *
 * The first thirteen fields are `WatchWindow` from `apps/api/src/marketing/watch.ts`,
 * which is the transport-level truth about one fetch. `frame` is the thing that file
 * said it was waiting for: it is built FROM the window by the route and is REQUIRED
 * here, so no watch figure can reach a screen without the frame beside it.
 */
export interface WatchSourceObservation {
  readonly sourceId: string;
  readonly label: string;
  /** The URL fetched, or the table read. Stated so a reader can check it by hand. */
  readonly locator: string;
  /**
   * `data` | `no_data_confirmed` | `unknown`, and there is no fourth state.
   * `no_data_confirmed` is "the source answered and its list is empty"; `unknown` is
   * "we could not look". Rendering both as an empty table is the defect.
   */
  readonly state: 'data' | 'no_data_confirmed' | 'unknown';
  readonly fetchedAt: string;
  readonly windowFrom: string | null;
  readonly windowTo: string | null;
  readonly httpStatus: number | null;
  readonly bytes: number | null;
  /** Admiralty code, e.g. `A3`. */
  readonly grade: string;
  readonly confidence: number;
  readonly couldSee: readonly string[];
  readonly couldNotSee: readonly string[];
  /** True when every count derived from this window is a floor, not a total. */
  readonly countsAreLowerBound: boolean;
  readonly refusals: readonly MarketingWireRefusal[];
  /** Required. Rule 2 of this file's header. */
  readonly frame: ObservationFrame;
}

/** One FMA warning-sitemap entry that matched a watch term. */
export interface WatchWarningMatch {
  readonly entryId: string;
  readonly kind: 'warning' | 'note' | 'announcement' | 'other';
  readonly url: string;
  readonly urls: readonly string[];
  readonly slug: string;
  /** A CHANGE timestamp, never a publication date. Do not relabel it.  */
  readonly sitemapLastmod: string | null;
  readonly matchedTerm: string;
  readonly matchedTermKind: 'own_brand' | 'partner' | 'listed_asset';
  readonly matchedTermLabel: string;
  readonly matchedToken: string;
  readonly reason: 'exact_token' | 'substring' | 'lookalike_token';
  /** `act_now` only for LCX's own brand: the warning body has NOT been read. */
  readonly severity: 'act_now' | 'assess';
  readonly sentence: string;
  readonly refusals: readonly MarketingWireRefusal[];
}

/** The FMA warning panel. */
export interface WatchWarningsPanel {
  readonly observation: WatchSourceObservation;
  /** False when the scan could not mean anything — e.g. an empty term list. */
  readonly usable: boolean;
  readonly matches: readonly WatchWarningMatch[];
  /**
   * NULL WHEN THE SOURCE COULD NOT BE READ, and that is the point of the type.
   * `0` here means "FMA's published list contains no entry matching our terms";
   * `null` means "we did not get to look". A watch that reports 0 after a network
   * failure is worse than no watch.
   */
  readonly matchesObserved: number | null;
  readonly entriesScanned: number | null;
  readonly locsRead: number | null;
  /** Locs that did not parse as a warning entry. Reported, never silently dropped. */
  readonly locsUnparsed: readonly string[];
}

/**
 * One item the news spine already holds.
 *
 * `at` is `COALESCE(published_at, created_at)` — the best timestamp the spine has,
 * which means it may be the INGEST time rather than the publication time. It is named
 * `at` and not `publishedAt` for exactly that reason: a field called `publishedAt`
 * holding an ingest time is a lie a surface cannot detect.
 */
export interface WatchSpineItem {
  readonly source: string;
  readonly title: string;
  readonly url: string | null;
  readonly at: string | null;
  readonly tickers: readonly string[];
}

/** A regulator this watch cannot see, and why. On screen, not in a comment. */
export interface WatchFeedNotWired {
  readonly authority: string;
  readonly feed: string | null;
  readonly why: string;
  readonly mitigation: string;
}

export interface WatchRegulatorPanel {
  readonly observation: WatchSourceObservation;
  readonly items: readonly WatchSpineItem[];
  /** A FLOOR: at most 20 items per feed per poll reach the spine. Null when unread. */
  readonly itemsObservedInWindow: number | null;
  readonly notWired: readonly WatchFeedNotWired[];
}

export interface WatchPressRow {
  readonly name: string;
  /** A LOWER BOUND on headlines containing the name. Never a share of anything. */
  readonly mentionsObservedInWindow: number;
  readonly sourcesObserved: readonly string[];
  readonly latest: readonly WatchSpineItem[];
  readonly refusals: readonly MarketingWireRefusal[];
}

export interface WatchPressPanel {
  readonly observation: WatchSourceObservation;
  readonly usable: boolean;
  readonly rows: readonly WatchPressRow[];
  readonly refusals: readonly MarketingWireRefusal[];
}

/**
 * Which watch terms the scan actually had, by kind.
 *
 * A SEPARATE FIELD BECAUSE AN ABSENT REGISTER IS NOT A CLEAN SCAN. LCX's own brand
 * terms are a fact about LCX and are in code; the partner and listed-asset registers
 * do not exist, so those kinds are empty and this block says so. Without it, "no
 * partner appears in an FMA warning" would read as reassurance when the truth is that
 * no partner was ever searched for.
 */
export interface WatchTermCoverage {
  readonly ownBrand: readonly string[];
  readonly partners: readonly string[];
  readonly listedAssets: readonly string[];
  readonly refusals: readonly MarketingWireRefusal[];
}

/** `GET /v1/marketing/watch`. */
export interface WatchDigest {
  readonly asOf: string;
  readonly warnings: WatchWarningsPanel;
  readonly regulator: WatchRegulatorPanel;
  readonly press: WatchPressPanel;
  readonly terms: WatchTermCoverage;
  /**
   * Source ids whose state is `unknown` this window. The one-line answer to "is this
   * panel telling me the world is quiet, or that it went blind?".
   */
  readonly sourcesUnreadable: readonly string[];
  readonly refusals: readonly MarketingWireRefusal[];
}

/* ════════ §3 THE CLAIM EXPIRY LEDGER ════════ */

export type ClaimExpiryBucket =
  | 'unreviewed'
  | 'version_drift'
  | 'past_due'
  | 'due_soon'
  | 'current';

export interface ClaimCopyDependency {
  readonly artefactId: string;
  readonly surface: string;
  /** `declared` is the artefact's own statement; `phrase_match` is derived from text. */
  readonly basis: 'declared' | 'phrase_match';
  readonly evidence: string;
}

export interface ClaimExpiryRow {
  readonly claimId: string;
  readonly claimText: string;
  readonly category: string;
  readonly riskLevel: string;
  readonly requiresHumanReview: boolean;
  readonly claimVersion: number;
  readonly bucket: ClaimExpiryBucket;
  readonly reviewedAt: string | null;
  readonly reviewDueAt: string | null;
  /** Negative when overdue. Null when there is no review record to count from. */
  readonly daysUntilDue: number | null;
  readonly pastDue: boolean;
  readonly versionDrift: boolean;
  /** Null means "cannot be determined", never "nothing depends on it". */
  readonly dependentCopy: readonly ClaimCopyDependency[] | null;
  readonly refusals: readonly MarketingWireRefusal[];
}

/**
 * `GET /v1/marketing/watch/claim-expiry`.
 *
 * `usable: false` with `counts: null` is the honest state on this environment today:
 * the claim library has no review dates on `Claim`, and the register a desk would
 * keep them in does not exist. The ledger refuses rather than reporting "0 claims
 * past due", which is the sentence that would let a stale claim sit forever.
 */
export interface ClaimExpiryLedger {
  readonly usable: boolean;
  readonly asOf: string;
  readonly dueSoonDays: number;
  readonly rows: readonly ClaimExpiryRow[];
  /** Null while `usable` is false — there is nothing honest to count. */
  readonly counts: Readonly<Record<ClaimExpiryBucket, number>> | null;
  readonly dependencyMethodNote: string;
  readonly refusals: readonly MarketingWireRefusal[];
  /** The desk's own corpus, so the frame's completeness is `census_of_own_corpus`. */
  readonly frame: ObservationFrame;
}

/* ════════ §4 THE ART 8(2) EXPORT BUNDLE ════════ */

/**
 * One line of a completeness statement — the type the whole export exists around.
 *
 * `absent` and `unverifiable` are the load-bearing members. A bundle that could not
 * reconstruct a fact names the fact and the reason, in the output, beside the record
 * it belongs to.
 */
export interface BundleCompletenessLine {
  readonly field: string;
  readonly state: 'reconstructed' | 'absent' | 'unverifiable';
  readonly why: string;
}

export interface BundleClaimUsed {
  readonly record_uid: string;
  readonly claim_id: string;
  /** WHICH VERSION was used. A claim id alone cannot evidence what was said. */
  readonly claim_version: number;
  /** Null when the register holds no category for the claim. Not defaulted to 'other'. */
  readonly claim_category: string | null;
  readonly verbatim: boolean;
}

export interface BundleRefusalFired {
  readonly record_uid: string;
  readonly code: string;
  readonly sentence: string;
  readonly rule_cited: string;
  readonly phase: string;
  readonly fired_at: string;
  /** A refusal an approver recorded and proceeded past — with their name on it. */
  readonly overridden: boolean;
  readonly overridden_by: string | null;
  readonly override_reason: string | null;
}

export interface BundleProcessorTransfer {
  /** Null for a transfer recorded before any record existed to attach it to. */
  readonly record_uid: string | null;
  readonly processor: string;
  readonly model: string | null;
  readonly purpose: string;
  readonly payload_kind: string;
  readonly contains_third_party_personal_data: boolean;
  /** Whether the processing left the EEA. A boolean, because that is what is known. */
  readonly third_country: boolean;
  readonly transfer_basis: string;
  readonly occurred_at: string;
}

export interface BundleRecordEntry {
  readonly recordUid: string;
  readonly regime: string;
  readonly draftedBy: string;
  readonly draftedAt: string;
  readonly clearedBy: string | null;
  readonly clearedAt: string | null;
  readonly clearanceReason: string | null;
  /** `same_human` is printed rather than normalised away. It is the finding. */
  readonly fourEyes: 'satisfied' | 'not_cleared' | 'same_human';
  readonly statementText: string;
  readonly statementHash: string;
  readonly integrity: 'verified' | 'broken' | 'unverifiable';
  /** What a human pasted back after publishing by hand. Null until they did. */
  readonly publishedText: string | null;
  readonly publishedHash: string | null;
  readonly publishedAt: string | null;
  readonly publishedPermalink: string | null;
  readonly closeOutState: string;
  /** Null means it could not be compared, not that it matched. */
  readonly publishedMatchesCleared: boolean | null;
  readonly withdrawnAt: string | null;
  readonly withdrawalReason: string | null;
  readonly inboundContextHash: string | null;
  readonly inboundContextExcerpt: string | null;
  readonly namedAssets: readonly string[];
  readonly jurisdictions: readonly string[];
  readonly considerationKind: string;
  readonly mandatoryElements: unknown;
  readonly embargoSnapshot: unknown;
  readonly holdingsSnapshot: unknown;
  readonly deskState: unknown;
  readonly claimsUsed: readonly BundleClaimUsed[];
  readonly refusals: readonly BundleRefusalFired[];
  readonly transfers: readonly BundleProcessorTransfer[];
  readonly retention: {
    readonly cls: string;
    readonly basis: string;
    readonly expiresAt: string;
    readonly legalHold: boolean;
    readonly legalHoldReason: string | null;
    readonly legalHoldUntil: string | null;
  };
  readonly completeness: readonly BundleCompletenessLine[];
}

export interface BundleDocument {
  readonly kind: 'lcx_marketing_export_bundle';
  readonly formatVersion: 1;
  readonly request: {
    readonly requestedBy: string;
    /** Art 7(3): the authority that asks need not be the FMA. */
    readonly authority: string;
    readonly windowFrom: string;
    readonly windowTo: string;
    readonly jurisdiction: string | null;
    readonly generatedAt: string;
  };
  readonly records: readonly BundleRecordEntry[];
  readonly counts: {
    readonly records: number;
    readonly published: number;
    readonly outstandingCloseOut: number;
    readonly withdrawn: number;
    readonly refusals: number;
    readonly refusalsOverridden: number;
    readonly integrityBroken: number;
    readonly integrityUnverifiable: number;
    readonly incompleteRecords: number;
  };
  /** Bundle-level absences: missing from the WHOLE bundle, not from one record. */
  readonly completeness: readonly BundleCompletenessLine[];
  /** Printed verbatim: the retention inference and the outstanding DPO ruling. */
  readonly caveats: readonly string[];
}

/**
 * `GET /v1/marketing/export/:itemId` and `GET /v1/marketing/export`.
 *
 * The response wraps the document rather than being it, because a production is three
 * things and a reader needs all three: the structured document, the text a human hands
 * over, and the digest that lets two productions of the same window be compared.
 * There is no file download here — the page renders `renderedText`.
 */
export interface ExportBundle {
  readonly bundle: BundleDocument;
  /** The printable artefact, rendered deterministically from `bundle`. */
  readonly renderedText: string;
  /** sha256 over the document. Same rows + same `generatedAt` → same digest. */
  readonly digest: string;
}

/* ════════ §5 GDPR ART 15 AND ART 17 ════════ */

/**
 * `POST /v1/marketing/subject-access` — GDPR Art 15.
 *
 * POST, not GET: the handle is personal data and must not appear in a URL, a referrer
 * or an access log.
 *
 * The row payloads are `Record<string, unknown>` ON PURPOSE and this is the one place
 * in the file where `unknown` is the honest type rather than an unpaid debt: an access
 * response must contain EVERYTHING held about the subject, so pinning a field list here
 * would silently exclude any column a later migration adds. A narrower type would make
 * the response incomplete by construction, which is the Art 15 failure mode.
 */
export interface SubjectAccessResponse {
  readonly handleQueried: string;
  readonly replies: readonly Record<string, unknown>[];
  readonly drafts: readonly Record<string, unknown>[];
  readonly transfers: readonly Record<string, unknown>[];
  /** Pointers only: LCX's own cleared statements are not the subject's personal data. */
  readonly recordsReferencing: readonly { readonly record_uid: string; readonly drafted_at: string }[];
  readonly notes: readonly string[];
  /** From the session, never from the body. Art 15 is answered by a named human. */
  readonly fulfilledBy: string;
  readonly fulfilledAt: string;
}

export type MarketingErasureBasis =
  | 'art_17_1_a_purpose_fulfilled'
  | 'art_17_1_b_consent_withdrawn'
  | 'art_17_1_c_objection'
  | 'data_subject_request'
  | 'retention_expiry';

/**
 * `POST /v1/marketing/erasure` — GDPR Art 17, and it is NOT a delete button.
 *
 * THE TENSION THIS TYPE EXISTS TO RESOLVE, because it is the whole difficulty:
 * Art 17(1) says erase, and the inferred Art 68(9) retention says keep. They are
 * reconciled by whose words they are.
 *
 *   · The stranger's words GO. Their queue rows are deleted, their drafts go with
 *     them on 0046's cascade, and any excerpt of their message carried inside an LCX
 *     record is NULLed and stamped `context_minimised_at`.
 *   · LCX's own cleared statements STAY, under Art 17(3)(b) — processing necessary
 *     for compliance with a legal obligation. `recordsRetained` is the count and
 *     `retainedBasis` is the exemption, both REPORTED to the subject. Silently
 *     keeping them would be the actual violation; keeping them and saying so is the
 *     lawful answer.
 *   · What remains linking the two is a HASH, not text. So a later paste-back can
 *     still be proved identical without holding a stranger's words for five years.
 */
export interface ErasureOutcome {
  readonly handleQueried: string;
  readonly repliesErased: number;
  readonly draftsErased: number;
  readonly recordsRetained: number;
  readonly excerptsMinimised: number;
  /** The Art 17(3) exemption relied on, or null when nothing was retained. */
  readonly retainedBasis: string | null;
  /** The sentence sent to the data subject. Not a log line. */
  readonly explanation: string;
  readonly decidedBy: string;
  readonly basis: MarketingErasureBasis;
  readonly erasedAt: string;
}

/* ════════ §6 THE RECORD AND THE FIVE-YEAR CLOCK ════════ */

/**
 * `POST /v1/marketing/record` — put one of LCX's OWN statements on the long clock.
 *
 * Idempotent by a content-derived `recordUid`, so `created: false` means "this exact
 * statement is already on the clock" and a retry is harmless.
 */
export interface MarketingRecordRow {
  readonly recordUid: string;
  readonly created: boolean;
  readonly retention: {
    readonly cls: 'lcx_statement';
    readonly years: number;
    readonly basis: string;
    readonly expiresAt: string;
  };
  /**
   * The session principal who performed the write. NOT the drafter and NOT the
   * approver — those are facts about the past and come from the body.
   */
  readonly recordedBy: string;
  /**
   * WHY `recordedBy` IS RETURNED AND NOT STORED, stated on the payload because it is
   * a real gap rather than a detail. `marketing_record` (0061) has columns for
   * `drafted_by`, `cleared_by` and `close_out_by` and NONE for "who entered this row",
   * so the act of recording is attributed in the response and in the API's own audit
   * trail, and nowhere in the register itself. Closing it needs a column, which needs
   * a migration that owns 0061's table.
   */
  readonly attributionNote: string;
  /**
   * Printed on every record and every bundle. Five-to-seven years is INFERRED from
   * Art 68(9) with Art 88(1); MiCA states no express period for marketing
   * communications. A reader must learn the number is inferred when they learn it.
   */
  readonly inferenceCaveat: string;
  /** The DPO ruling this system is still waiting on. Carried in the payload so it cannot be forgotten. */
  readonly dpoRulingOutstanding: string;
}

/** One clock, and what is provable about it. */
export interface RetentionClockState {
  /** `third_party_content` (short, minimising) or `lcx_statement` (five years). */
  readonly cls: 'third_party_content' | 'lcx_statement';
  /** The table this clock governs. */
  readonly register: string;
  /** Present on this environment? A clock over an absent table is not a clock. */
  readonly registerPresent: boolean;
  /** Days for the short clock, whole years for the long one. Null when undefined. */
  readonly periodDays: number | null;
  readonly periodYears: number | null;
  readonly basis: string;
  /**
   * Rows currently past their expiry and not yet swept. NULL when the register is
   * absent or unreadable — never 0, because 0 would read as "nothing is overdue".
   */
  readonly dueForSweep: number | null;
  readonly refusals: readonly MarketingWireRefusal[];
}

/**
 * A statement MiCA wants kept that the short clock is about to destroy.
 *
 * THE DEFECT THIS TYPE NAMES. 0046 gives every inbound row a 90-day expiry and the
 * sweep deletes the row; nothing has ever written the LCX side to the long clock. So
 * on day 91 an answered reply — the only evidence of what LCX said and to whom —
 * disappears, and the compartment retains nothing at all. These are the exact rows in
 * that state, before they go, with the days left on each.
 */
export interface RetentionJeopardyRow {
  readonly replyId: number;
  readonly xCommentId: string | null;
  readonly status: string;
  readonly retentionExpiresAt: string;
  /** Negative when the row is already past expiry and waiting on the next sweep. */
  readonly daysUntilExpiry: number;
  readonly approvedDrafts: number;
}

/** `GET /v1/marketing/retention`. */
export interface RetentionPosture {
  readonly asOf: string;
  readonly shortClock: RetentionClockState;
  readonly longClock: RetentionClockState;
  /** When the clock last actually ran, per the run ledger. Null means NEVER. */
  readonly lastRunAt: string | null;
  readonly lastRunBy: string | null;
  readonly runsRecorded: number | null;
  /**
   * Statements about to be destroyed by the short clock with no record on the long
   * one. NULL when it could not be computed; `[]` means checked and clear.
   */
  readonly jeopardy: readonly RetentionJeopardyRow[] | null;
  readonly jeopardyHorizonDays: number;
  /** How Art 17 erasure and the MiCA record are reconciled, in one paragraph. */
  readonly erasureReconciliation: string;
  readonly inferenceCaveat: string;
  readonly dpoRulingOutstanding: string;
  readonly refusals: readonly MarketingWireRefusal[];
}

/** `POST /v1/marketing/retention/run`. */
export interface RetentionSweepReport {
  readonly ranAt: string;
  readonly ranBy: string;
  /** `dry_run` computes and records nothing destructive. The default for a first look. */
  readonly mode: 'dry_run' | 'enforce';
  /**
   * Third-party rows deleted outright — nothing of LCX's depended on them.
   * Null when the sweep could not run.
   */
  readonly thirdPartyRowsDeleted: number | null;
  /**
   * Third-party BODIES replaced by their hash while the row was held, because an
   * unrecorded LCX statement still points at it. Minimisation, not deletion.
   */
  readonly thirdPartyRowsMinimised: number | null;
  /** LCX records past five-to-seven years with no legal hold. */
  readonly recordRowsExpired: number | null;
  readonly jeopardy: readonly RetentionJeopardyRow[];
  /** True when the ledger row was written. A sweep nobody can evidence is not a sweep. */
  readonly recorded: boolean;
  readonly refusals: readonly MarketingWireRefusal[];
}

/* ════════ §8 POST-TIME COVERAGE ════════ */

/**
 * WHAT FRACTION OF THE QUEUE CARRIES X'S OWN POST DATE.
 *
 * ══ WHY THIS NUMBER MATTERS MORE THAN IT LOOKS ══
 * Two clocks run over an inbound reply: since the desk LEARNED of it (`received_at`, always
 * known) and since the customer POSTED it (`posted_on_displayed`, known only where X's
 * public oEmbed endpoint answered). The second is the customer's actual wait and the only
 * one worth an SLA, and every surface that needs it REFUSES rather than substituting the
 * first. So this fraction is the size of the honest-refusal surface: at 0 it means every
 * "how long have they waited" question in the compartment refuses, forever.
 *
 * `apps/api/src/marketing/postTime.ts` is the only thing that can raise it, and until this
 * wave it had no caller at all — so the number was 0 on every live environment by
 * construction while nothing reported that fact.
 *
 * ══ A FRACTION, NOT A PERCENTAGE ══
 * `numerator` and `denominator` travel separately and there is deliberately no `percent`
 * field. 3 of 4 and 750 of 1 000 are both "75%" and a desk must not act on them alike. The
 * denominator is counted in SQL over the whole corpus, never over a loaded page — dividing
 * by the page is how a panel reads 100% on the first successful lookup.
 *
 * ══ `lookupEligible` IS WHY A PLATEAU IS READABLE ══
 * `arc`-authenticated mail and operator pastes cannot have their ladder inputs rebuilt from
 * the columns the store keeps, so no lookup is attempted for them and their post date can
 * never be filled by this path. Without this field a reader watching coverage stall at 0.6
 * cannot tell a broken channel from a schema limit.
 */
export interface PostTimeCoverageCounts {
  /** Rows carrying a post date obtained from X. */
  readonly numerator: number;
  /** Every non-quarantined reply the store still holds. Counted in SQL, never assumed. */
  readonly denominator: number;
  readonly ofWhat: string;
  readonly statement: string;
  /** Of the denominator, how many this sweep is even able to look up. */
  readonly lookupEligible: number;
  /** The rest, whose post date this path can never fill. Makes a plateau readable. */
  readonly notLookupEligible: number;
}

/**
 * `GET /v1/marketing/post-time` — the coverage read.
 *
 * IT MEASURES AND DOES NOT SWEEP. No oEmbed lookup happens on this route: a read that
 * quietly performed outbound HTTP would make refreshing a panel a rate-limit event, and the
 * breaker state would then depend on who was looking. The sweep runs on `POST /tick`.
 *
 * `coverage` is a `Figure`, so an empty corpus arrives as `absent` with a refusal rather
 * than as `0 of 0` — which on a panel is indistinguishable from full coverage.
 */
export interface PostTimeCoverageReport {
  /** 0046 applied. False means there is no queue table to measure. */
  readonly migrated: boolean;
  /** 0062 applied. False means the sweep cannot write its evidence, so it refuses. */
  readonly evidenceTablePresent: boolean;
  /** Absent when the corpus is empty or unreadable — never a zero. */
  readonly coverage: Figure<PostTimeCoverageCounts> | null;
  /** The single channel this fraction is about. One GET to publish.twitter.com/oembed. */
  readonly channel: 'oembed';
  /**
   * The route that RAISES this number, named so a reader who sees 0 knows what to run
   * rather than filing a bug against the panel.
   */
  readonly raisedBy: string;
  /** Why the figure is absent, or why the sweep cannot run here. Empty when neither. */
  readonly refusals: readonly MarketingWireRefusal[];
  /**
   * Literal `false`. Reading coverage performs no lookup and stores nothing, and saying so
   * is cheaper than inferring it from the absence of a button.
   */
  readonly readPerformsNoLookup: false;
}
