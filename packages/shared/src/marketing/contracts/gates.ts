/**
 * MARKETING — THE LAST SEVEN RESPONSE CONTRACTS (the gates, provenance, silence, M8).
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `apps/web/src/lib/api/marketing.ts` ships seven fetchers typed
 * `UncontractedPayload = unknown` and names them in `MARKETING_CONTRACTS_OWED`, each with
 * the shared type it owes. Those are the seven declared below, under exactly those names,
 * plus the one shape `components/marketing/deskApi.ts reviewText` reads off
 * `POST /v1/marketing/review`. `apps/api/src/routes/marketingGates.ts` imports the same
 * symbols. One declaration, or none: a web-local interface claiming fields the API does
 * not return compiles, passes a mocked test, and renders blank on real data — that is the
 * `GpsSummary` crash and it cost a day.
 *
 * ── THIS FILE ADDS NO VOCABULARY, AND CANNOT SEE THE API ─────────────────────
 * `packages/shared` may not import from `apps/api`, so the api-side engines
 * (`provenanceLadder.ts`, `oembed.ts`, `postTime.ts`, `outboundGate.ts`) are NOT
 * referenced here. Where a shape has to cross the wire, it is composed from the shared
 * vocabulary that already describes it — `InboundProvenance`, `Corroboration`,
 * `Reliability`, `Credibility`, `Figure`, `Refusal` — never re-declared. Three narrow
 * exceptions exist and each is argued at its own docblock (§2 `ProvenanceGrade`,
 * §4 `ClearanceLatencyReading`, `FirstStatementReading`, `NextUpdateReading`,
 * `RetractionReading`): they NAME an anonymous inline return type from `loop.ts`, which
 * has no importable symbol at all. Naming an unnamed type is not copying a declared one,
 * and a drift is a compile error at the route because the route assigns the engine's
 * return value straight into the field.
 *
 * ── THE TWO OWNER CONSTRAINTS ARE IN THE TYPES ───────────────────────────────
 * No X credential exists and none ever will, and nothing in this compartment may post,
 * store a credential, or act as the LCX account. So:
 *   · No shape here has a `publish`, `send`, `schedule` or `post` field, and none carries
 *     a token. The only outbound network call behind any of them is an unauthenticated
 *     GET to `publish.twitter.com/oembed`.
 *   · `ClaimSafetyVerdict.usableText` is `null` unless `recorded` is `true`. A copy path
 *     that left no record is the defect doctrine rule 5 exists to prevent, and here it is
 *     structural rather than documented: there is no field holding releasable text on the
 *     unrecorded path.
 *   · §4 has no `reach`, `impressions`, `engagementRate`, `clickThroughRate`,
 *     `shareOfVoice` or `sentiment` field, and `assertHonestPayload` in
 *     `../observation.js` fails a payload that grows one. No denominator exists for any of
 *     them, and `refusedMetrics` renders the refusal where the tile would have been.
 *
 * ── THE BARREL IS NOT WIRED HERE ─────────────────────────────────────────────
 * `../index.ts` needs the line `export * from './contracts/gates.js';` and
 * `packages/shared/src/index.ts` needs the marketing barrel. Both files belong to the
 * ship agent; until that line exists these names do not resolve through `@lcx/shared`,
 * because the package publishes a single `"."` export and a deep specifier is not a
 * workaround.
 */
import type {
  ActorId,
  CorroboratedField,
  Disposition,
  Figure,
  InboundSourceKind,
  Instant,
  MarketingRegime,
  MarketingViolation,
  ObservationFrame,
  PriorityTier,
  ProcessMetricKey,
  ReachLevel,
  Refusal,
  RefusalCode,
  RefusedMetricKey,
  SenderAuthEvidence,
  Verifiability,
} from '../types.js';
/* `Reliability` and `Credibility` live in `../../provenance.js` — the Admiralty scale is
 * the whole repo's, not marketing's, and `marketing/types.ts` imports them from there for
 * the same reason. Importing them from `../types.js` is a TS2459: it re-exports neither. */
import type { Credibility, Reliability } from '../../provenance.js';
import type { ClaimSafetyOutcome } from '../claimSafety.js';
import type { MarketAbuseVerdict } from '../abuse.js';
import type { SilenceRecord } from '../triage.js';
import type {
  ClearanceLatencyRow,
  ContradictionDebtMetric,
  FirstStatementRow,
  LineStalenessMetric,
  MarketingVolumeStatement,
  PostMortemReport,
  ProcessRate,
  QuestionCoverageMetric,
  RefusalFrequency,
  WbrMarketingBlock,
} from '../loop.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 THE OUTBOUND GATE — POST /claim-safety AND POST /review                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `POST /v1/marketing/claim-safety` — the verdict, the refusals, and the only text an
 * operator may copy.
 *
 * A VERDICT, NOT A SCORE. Doctrine rule 1: strip is for formatting, refusal is for
 * substance, and every refusal here arrived from `checkClaimSafety` or
 * `assessMarketAbuse` carrying the provision that caused it. Nothing on this object is
 * computed in the browser — `lib/api/gpsLoop.ts:117` makes the same argument about
 * blockers, and a second copy of a rule in the browser drifts from the engine the first
 * time either changes.
 *
 * WHY BOTH ENGINES, ALWAYS. `checkClaimSafety` reads THE WORDS; `assessMarketAbuse` reads
 * THE STATE the words sit in — whether the asset named is under embargo (MiCAR Art 90) and
 * whether the author holds it (Art 91(3)(c)). Doctrine rule 2: the dangerous axis is the
 * invisible one, and a wording review passes a perfectly-worded bullish reply about a
 * token the author owns. `claimSafety` and `marketAbuse` are both carried so a surface can
 * say WHICH gate refused; either being `null` means that gate did not complete, which is
 * a refusal and never a pass.
 *
 * `flagged` IS NOT `clear`. Both engines can raise an ERROR-severity violation with an
 * empty refusal list, and `blockingViolations` is the subset that made `allowed` false.
 * A caller branches on `allowed` and on nothing else.
 */
export interface ClaimSafetyVerdict {
  readonly allowed: boolean;
  /**
   * `null` whenever anything refused, AND whenever `recorded` is `false`.
   *
   * The second condition is the owner constraint, not a nicety: no copy path may leave no
   * record, so text that could not be written to the gate ledger is not released. There is
   * no other field on this object holding releasable text.
   */
  readonly usableText: string | null;
  readonly disposition: Disposition;
  readonly refusals: readonly Refusal[];
  readonly violations: readonly MarketingViolation[];
  /** The subset that caused `allowed: false`. Empty when nothing blocked on a violation. */
  readonly blockingViolations: readonly MarketingViolation[];
  /** Which symbols the gate believed the text named. Shown, never hidden. */
  readonly assetsExtracted: readonly string[];
  /** The extractor's own statement of what it cannot see. Rendered, never dropped. */
  readonly extractionCaveat: string;
  readonly claimSafety: ClaimSafetyOutcome | null;
  readonly marketAbuse: MarketAbuseVerdict | null;
  /** Set when a gate threw. A thrown check is a refusal, never a pass. */
  readonly gateError: string | null;
  /** Read off the session. Never a body field — see `routes/marketing.ts:approve`. */
  readonly checkedBy: ActorId;
  readonly checkedAt: Instant;
  readonly phase: 'draft' | 'clearance';
  /** True when the gate-decision ledger row was written. Gates `usableText`. */
  readonly recorded: boolean;
  /** Non-null exactly when `recorded` is false, saying which record was unavailable. */
  readonly recordRefusal: Refusal | null;
  /** `MARKETING_RULES_DISCLOSURE`, so no panel can render a verdict without the caveat. */
  readonly disclosure: string;
  /** Stated in the payload because the button does not exist: nothing here publishes. */
  readonly cannotPublish: string;
}

/**
 * `POST /v1/marketing/review` — the live advisory read, as an operator types.
 *
 * SHAPED BY ITS CONSUMER. `deskApi.ts reviewText` reads `claimSafety`, `marketAbuse`,
 * `regime` and `regimes` off the top level and narrows each through `asRefusals`, which
 * yields `null` for anything that is not an array and makes the drafting room render that
 * gate as UNCHECKED rather than as clean. So the field names and the null convention are
 * the client's, deliberately, and the extra fields below are additive.
 *
 * IT WRITES NOTHING AND RELEASES NO TEXT. That is what makes it safe to call on a debounce
 * and what makes it a genuinely read-shaped POST: it is a POST only because a draft does
 * not fit in a query string. `releasesNoText` is the literal `true` so a future edit that
 * wants to return copyable text from an unrecorded check has to change this type.
 */
export interface ReviewVerdict {
  /** `null` means the words gate did not complete. Never an empty array in that case. */
  readonly claimSafety: readonly Refusal[] | null;
  /** `null` means the state gate did not complete — an absent register, or a throw. */
  readonly marketAbuse: readonly Refusal[] | null;
  /**
   * ALWAYS `null` on this route, and `regimeRefusal` says why in one sentence.
   *
   * `classifyRegimes` needs facts this request does not carry — the jurisdictions
   * addressed and excluded, the asset treatment, the consideration kind, the product's
   * MiCA perimeter status, the Art 7 role. Defaulting any of them would clear Art 7 by
   * omission, which is the one failure mode `regime.ts` is built around. The full
   * classification lives at `POST /v1/marketing/regime`.
   */
  readonly regime: readonly Refusal[] | null;
  /** `null`, not `[]`: an empty regime list reads as "no law applies", which is a clear. */
  readonly regimes: readonly MarketingRegime[] | null;
  /** Always present, naming the facts the classifier was not given. */
  readonly regimeRefusal: Refusal;
  readonly violations: readonly MarketingViolation[];
  readonly blockingViolations: readonly MarketingViolation[];
  readonly disposition: Disposition;
  readonly assetsExtracted: readonly string[];
  readonly extractionCaveat: string;
  readonly gateError: string | null;
  /** Literal `true`. This route has no `usableText` field at all. */
  readonly releasesNoText: true;
  readonly reviewedBy: ActorId;
  readonly reviewedAt: Instant;
  readonly disclosure: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 PROVENANCE — GET /replies/:id/provenance AND POST /replies/:id/corroborate */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT THE STORED CORROBORATION ROWS SAY, AS FIVE STATES AND NOT TWO.
 *
 * THIS IS THE WHOLE POINT OF THE §2 CONTRACTS. An outage, a deleted post and a lookup
 * nobody ever ran are three different facts, and a boolean `corroborated` collapses all
 * three into "no". `could_not_check` therefore has its own member, and the type has no
 * member meaning "not corroborated" at all.
 *
 *  · `agrees` / `disagrees` — a second channel spoke. `disagrees` needs a human.
 *  · `could_not_check` — the channel was asked and did not answer. Says NOTHING about the
 *    post. This is the member that stops an outage reading as a forgery signal.
 *  · `never_attempted` — the corroboration table exists and holds no row for this reply.
 *  · `storage_absent` — migration 0062 has not been applied here, so no row could exist.
 *    Not "uncorroborated": unknowable, and the refusal says so.
 */
export type CorroborationState =
  | {
      readonly kind: 'agrees' | 'disagrees' | 'could_not_check';
      /** Every stored row, newest observation first. Ids and outcomes, never a stranger's text. */
      readonly rows: readonly CorroborationRow[];
      /** When the channel was last consulted for this reply. */
      readonly lastObservedAt: Instant;
      readonly sentence: string;
    }
  | {
      readonly kind: 'never_attempted' | 'storage_absent';
      readonly rows: readonly [];
      readonly lastObservedAt: null;
      readonly sentence: string;
      /** Why nothing is known. Never rendered as a negative result. */
      readonly refusal: Refusal;
    };

/**
 * One row of `marketing_reply_corroboration`, on the wire.
 *
 * `observedValue` is non-null ONLY on `disagrees` — 0062's own rule, because keeping a
 * second copy of a stranger's post text for every corroborated reply re-creates the
 * data-minimisation problem `raw_email` had.
 */
export interface CorroborationRow {
  readonly field: CorroboratedField;
  readonly channel: InboundSourceKind | 'oembed' | 'syndication_embed' | 'mirror_discovery';
  readonly outcome: 'agrees' | 'disagrees' | 'could_not_check';
  readonly observedValue: string | null;
  readonly detail: string;
  /** True for channels whose contract X does not publish. `false` here is a fact. */
  readonly undocumented: boolean;
  /** When WE looked. NEVER the post date. */
  readonly observedAt: Instant;
}

/**
 * THE LADDER'S GRADE, PROJECTED FOR A SURFACE — and the one hoist in §2.
 *
 * `provenanceLadder.ts` lives in `apps/api` and `packages/shared` cannot import it, so
 * `GradeStamp` and `LadderRung` have no shared symbol. Every field below is copied by the
 * route out of the verdict the ladder returned in the same request, so the two cannot
 * disagree; nothing here is recomputed and there is no second grading scheme. `rung` is
 * the ladder's own rung string and `statement` is its own sentence, rendered verbatim —
 * a surface must never print a bare code.
 */
export interface ProvenanceGrade {
  /** `LadderRung`. Which real situation this row is in, not a score bucket. */
  readonly rung: string;
  /** `admiraltyCode(reliability, credibility)`, e.g. `B2`. */
  readonly admiralty: string;
  readonly reliability: Reliability;
  readonly credibility: Credibility;
  /** The ladder's one-sentence statement for the rung. Rendered, never summarised. */
  readonly statement: string;
  /** Why this rung and not the one above it. */
  readonly rationale: string;
  /** 0–100 from `confidenceFrom`, with no staleness decay applied at grading time. */
  readonly confidence: number;
  /** True when a human has to read this before it is trusted. */
  readonly needsHumanRead: boolean;
}

/**
 * `GET /v1/marketing/replies/:id/provenance` — how much this row is worth believing.
 *
 * LOAD-BEARING BECAUSE THE INGEST IS FORGEABLE. `fetchNotificationEmails` searches
 * `{seen:false}` with no sender filter and `RawEmail` has no `from` field
 * (`xMail.ts:81`), so anyone who learns the polled address can inject a fabricated reply
 * that grades identically to a real one until a second channel disagrees.
 *
 * `grade` IS A `Figure`, AND IT IS `absent` MORE OFTEN THAN A PANEL WOULD LIKE. This read
 * performs no network call, so it cannot make the observation a grade would rest on. Where
 * a stored lookup exists, the ladder's unchecked rung — whose sentence reads
 * "Corroboration has not been attempted" — would be FALSE, and emitting a false sentence
 * is worse than emitting none. So the grade refuses and names the recovery, which is one
 * button: `POST /replies/:id/corroborate`. Where no lookup exists, the unchecked rung is
 * exactly true and the grade is `measured`.
 */
export interface ReplyProvenanceRecord {
  readonly replyId: number;
  readonly xCommentId: string;
  readonly xPostId: string | null;
  /** Who the item CLAIMS wrote it. Untrusted until a second channel agrees. */
  readonly claimedAuthorHandle: string;
  /** Attacker-chosen. Never rendered as the author. */
  readonly claimedAuthorDisplay: string | null;
  /** True when the row is held out of the queue. Quarantine has NO grade. */
  readonly quarantined: boolean;
  /**
   * THE LADDER'S OWN QUARANTINE CODE AND ITS OWN SENTENCES, untranslated.
   *
   * `QuarantineCode` (`MKT_PROV_*`) and the shared `QuarantineReason` vocabulary are two
   * different enumerations and NO mapping between them exists anywhere in the repo.
   * Inventing one here would be a second classification of why a row is held, decided by a
   * route rather than by the engine that held it — so these three fields carry the
   * engine's code, message and rule verbatim and translate nothing. All three are `null`
   * together, exactly when `quarantined` is false.
   */
  readonly quarantineCode: string | null;
  readonly quarantineMessage: string | null;
  readonly quarantineRule: string | null;
  /** DKIM/ARC as recorded at ingest, or `null` where the columns hold nothing. */
  readonly senderAuth: SenderAuthEvidence | null;
  /** Non-null when the sender could not be authenticated, with the rule. */
  readonly senderRefusal: Refusal | null;
  readonly grade: Figure<ProvenanceGrade>;
  readonly corroboration: CorroborationState;
  /** X's own calendar date for the post, `YYYY-MM-DD`. Never the mail header date. */
  readonly postedOnDisplayed: string | null;
  /** Which channel the date came from. `null` means no channel ever supplied one. */
  readonly postedAtSource: string | null;
  /** Non-null when no post date is held: mail latency is not a post time. */
  readonly postDateRefusal: Refusal | null;
  /** When WE received it. Never presented as when the post was written. */
  readonly receivedAt: Instant;
  readonly readAt: Instant;
  /** The census frame for this row's channel. Counts here are lower bounds. */
  readonly frame: ObservationFrame;
}

/**
 * `POST /v1/marketing/replies/:id/corroborate` — one unauthenticated GET to
 * `publish.twitter.com/oembed`, and the record of what came back.
 *
 * A POST BECAUSE IT WRITES, NOT BECAUSE ANYTHING IS SENT. oEmbed is a documented, keyless
 * read of a public endpoint. It is the cheapest high-value fix in the plan: it repairs the
 * author field, yields X's own post date so a clock stops measuring mail latency, and —
 * being an independent channel — is the anti-forgery corroboration the ingest defect
 * needs.
 *
 * `attempted: false` IS A REAL OUTCOME AND IT IS NOT A FAILURE OF THE POST. The breaker
 * may already be open, or 0062 may not be applied. Nothing is asked and nothing is
 * written in that case, because an outage must not mark a row as unconfirmed.
 */
export interface CorroborationResult {
  readonly replyId: number;
  readonly attempted: boolean;
  /** Non-null exactly when `attempted` is false, naming what stopped the lookup. */
  readonly refusal: Refusal | null;
  /** `OEmbedStatus` — `confirmed`, `not_public` or `unknown`. Three outcomes, never two. */
  readonly status: 'confirmed' | 'not_public' | 'unknown' | null;
  /** `OEmbedCode`. Rendered through `message`, never bare. */
  readonly code: string | null;
  /** The human sentence for `code`. */
  readonly message: string | null;
  /** When WE looked. */
  readonly observedAt: Instant | null;
  /** The rows written, exactly as persisted. Empty when nothing was attempted. */
  readonly wrote: readonly CorroborationRow[];
  /** True only when the post date column was actually updated by this call. */
  readonly postDateRecorded: boolean;
  /** X's calendar date for the post, when this lookup learned one. */
  readonly postedOnDisplayed: string | null;
  /** The ladder's verdict on the row AFTER this observation. `absent` when not graded. */
  readonly grade: Figure<ProvenanceGrade>;
  /** Set when this lookup moved the row into quarantine — an attribution error. */
  readonly quarantinedByLadder: boolean;
  /** Rows written with `disagrees`. Each one needs a named human to read both texts. */
  readonly disagreements: number;
  /** The ladder's degradation notice, when the channel was impaired. */
  readonly degraded: string | null;
  readonly requestedBy: ActorId;
  readonly requestedAt: Instant;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE SILENCE LOG — GET /silence AND POST /:id/silence                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ONE RECORDED DECISION NOT TO ANSWER.
 *
 * A decision not to answer IS a decision. RESIST 2's lowest tier means "lines prepared, no
 * response made", which is an action with a rationale rather than an absence — and today
 * `POST /:id/status` accepts `'ignored'` and records no reason at all, so the desk's most
 * common decision leaves the least evidence. A silent ignore is indistinguishable from an
 * oversight, and this row is the difference.
 *
 * FIELD NAMES ARE THE CLIENT'S. `deskApi.ts listSilences` reads `id`, `subject`,
 * `disposition`, `reasonCode`, `rationale`, `decidedBy`, `decidedAt` and `revisitBy` and
 * substitutes an empty string for a missing one. Renaming any of them silently blanks a
 * column on `components/marketing/SilenceLog.tsx`.
 *
 * `record` carries `recordSilence`'s own output whole — the priority, reach and
 * verifiability AS THEY WERE when silence was chosen. Those three are read from the
 * reply's last recorded triage decision, never from the request body, because a decision
 * that states its own basis is not evidence of one.
 */
export interface SilenceLogEntry {
  /** The `object_actions` ledger row id. The evidence, not a display key. */
  readonly id: string;
  readonly replyId: number;
  /** The author handle. `deskApi` renders this column as `subject`. */
  readonly subject: string;
  readonly authorHandle: string;
  /** Always `'ignored'`: this log holds nothing else. */
  readonly disposition: 'ignored';
  /** The reason the operator gave, as given. Free text, required, never inferred. */
  readonly reasonCode: string;
  /** The sentence an operator would defend in a review. Never empty on a stored row. */
  readonly rationale: string;
  readonly decidedBy: ActorId;
  readonly decidedAt: Instant;
  /** When a re-read is owed, when one was set. `null` means none was. */
  readonly revisitBy: Instant | null;
  /** Lines prepared but not used — RESIST 2's own definition of the tier. */
  readonly linesPrepared: string | null;
  readonly record: SilenceRecord;
  readonly priorityAtDecision: PriorityTier;
  readonly reachAtDecision: ReachLevel;
  readonly verifiabilityAtDecision: Verifiability;
  /**
   * Which entry point wrote it. TWO ENTRY POINTS, ONE LEDGER, ONE READER — `POST
   * /:id/triage` records a silence when its action is `ignore`, and `POST /:id/silence` is
   * the shortcut. Both go through `recordSilence` and both append to `object_actions`, so
   * this is not the two-write-paths defect GPS Phase 1 shipped; the field exists so a
   * reviewer can see which surface the decision came from.
   */
  readonly source: 'silence_decision' | 'triage_decision';
  /** Whether the queue row was moved to `ignored` by the same call. */
  readonly queueStatusSet: 'ignored' | null;
}

/**
 * `GET /v1/marketing/silence` — AN ARRAY, and that resolves a conflict the web ledger
 * already names.
 *
 * `lib/api/marketing.ts fetchSilenceLog` and `components/marketing/deskApi.ts
 * listSilences` are two fetchers for one route, and `listSilences` does
 * `Array.isArray(rows) ? rows : []`. An envelope object would therefore render
 * `SilenceLog.tsx` as an EMPTY LOG on a desk with recorded silences — a silent zero on the
 * one screen whose whole purpose is that a decision left a trace. So `data` is the array,
 * `SilenceLog` is that array's type, and the log-level facts travel in `meta` as
 * `SilenceLogMeta`.
 */
export type SilenceLog = readonly SilenceLogEntry[];

/**
 * What `GET /silence` puts in `meta` beside the array.
 *
 * The frame cannot live in `data` because `data` is the array (above), and a list of
 * decisions with no statement of what the window could not see is the absence this
 * compartment refuses elsewhere. `truncated` is the honest reading of a `limit`: a
 * truncated log is not a short one.
 */
export interface SilenceLogMeta {
  readonly timestamp: Instant;
  readonly version: string;
  readonly frame: ObservationFrame;
  /** `absent` means the ledger could not be read — never an empty log. */
  readonly storage: 'present' | 'absent';
  readonly storageRefusal: Refusal | null;
  readonly limit: number;
  readonly returned: number;
  readonly truncated: boolean;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 THE TWELVE PROCESS METRICS — GET /metrics                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * A metric that is refused BY CONSTRUCTION, with the reason and the substitute.
 *
 * Rendered where the tile would have been. That is the difference between a dashboard
 * that is missing things and an instrument that says what it cannot know. Every one of
 * these needs a denominator that only exists behind an X credential, and there is no
 * credential and never will be.
 */
export interface RefusedMetricRow {
  readonly key: RefusedMetricKey;
  readonly reason: string;
  /** Empty string where the honest answer is "nothing". A proxy nobody can defend is worse. */
  readonly substitute: string;
  readonly refusal: Refusal;
}

/**
 * NAMES AN ANONYMOUS RETURN TYPE. `loop.ts clearanceLatencyByRole` returns an inline
 * object literal type with no exported symbol, so there is nothing to import and nothing
 * being copied. The route assigns the engine's return value straight into this field, so a
 * change to the engine's shape is a compile error here.
 */
export interface ClearanceLatencyReading {
  readonly rows: readonly ClearanceLatencyRow[];
  readonly frame: ObservationFrame;
  /** Excluded rather than counted as instant. A zero would flatter the desk. */
  readonly unreadableDates: number;
}

/** Names `loop.ts timeToFirstStatement`'s anonymous return type — see above. */
export interface FirstStatementReading {
  readonly rows: readonly FirstStatementRow[];
  readonly breachCount: number;
  readonly stillSilentCount: number;
  readonly notAssessable: number;
  /** Why no average is shown: incidents with different budgets share no clock. */
  readonly averageIsWithheld: string;
  readonly frame: ObservationFrame;
}

/** Names `loop.ts nextUpdateBreachCount`'s anonymous return type — see above. */
export interface NextUpdateReading {
  readonly count: Figure<number>;
  readonly breachedItemIds: readonly string[];
  readonly openCommitments: number;
  readonly sentence: string;
}

/** Names `loop.ts retractionCount`'s anonymous return type — see above. */
export interface RetractionReading {
  readonly linkedRetractions: Figure<number>;
  /** Items removed with no linked correction object. A finding, not a retraction. */
  readonly deletionsWithNoLinkedRecord: number;
  readonly sentence: string;
}

/** Which stored records answered, per migration. `absent` is stated, never inferred. */
export interface MetricsStorageState {
  /** 0046 — the reply queue. */
  readonly queue: 'present' | 'absent';
  /** 0062 — the gate-decision ledger, which is where refusal events come from. */
  readonly gateLedger: 'present' | 'absent';
  /** 0063 — own statements, crisis incidents, statement instances, clearances. */
  readonly memory: 'present' | 'absent';
  readonly refusals: readonly Refusal[];
}

/**
 * `GET /v1/marketing/metrics` — the twelve process metrics, and nothing else.
 *
 * WHAT THIS SHAPE CANNOT CONTAIN, because it is the honesty ceiling: impressions, reach,
 * follower delta, engagement rate, click-through, share of voice, audience sentiment.
 * There is no field for any of them, `refusedMetrics` carries the typed refusal instead,
 * and `observation.ts assertHonestPayload` fails a payload that grows one.
 *
 * EVERY FIGURE IS A `Figure`, SO ABSENCE CANNOT ARRIVE AS ZERO. A missing migration, an
 * empty window and a rate below the minimum n are three different sentences, and doctrine
 * rule 3 is that none of them is a zero. `ProcessRate.pct` is already `number | null` with
 * its own suppression sentence, and it is wrapped anyway: a suppressed rate over records
 * that exist is a different fact from a rate over records that do not.
 *
 * COUNTS OF OBSERVED ITEMS ARE LOWER BOUNDS and arrive named as such from the engines.
 * Nothing here renames one into a total.
 */
export interface ProcessMetrics {
  readonly asOf: Instant;
  readonly windowFrom: Instant;
  readonly windowTo: Instant;
  /** `own_record`, census of our own corpus. The reason these are defensible at all. */
  readonly frame: ObservationFrame;
  readonly storage: MetricsStorageState;

  /** The only honest read on whether the gates are load-bearing or ornamental. */
  readonly refusalsByCode: Figure<RefusalFrequency>;
  readonly preclearedDerivation: Figure<ProcessRate>;
  readonly claimProvenance: Figure<ProcessRate>;
  readonly ignoreWithRationale: Figure<ProcessRate>;
  readonly notKnownNonEmpty: Figure<ProcessRate>;
  readonly clearanceLatency: Figure<ClearanceLatencyReading>;
  readonly timeToFirstStatement: Figure<FirstStatementReading>;
  readonly nextUpdateBreaches: Figure<NextUpdateReading>;
  readonly retractions: Figure<RetractionReading>;
  readonly contradictionDebt: Figure<ContradictionDebtMetric>;
  readonly lineStaleness: Figure<LineStalenessMetric>;
  readonly questionCoverage: Figure<QuestionCoverageMetric>;

  /** `PROCESS_METRIC_KEYS` — the vocabulary. */
  readonly metricsDefined: readonly ProcessMetricKey[];
  /** `IMPLEMENTED_PROCESS_METRICS` — the ones with an engine behind them. */
  readonly metricsImplemented: readonly ProcessMetricKey[];
  /** Named in the vocabulary with no implementation. Admitted, not hidden. */
  readonly metricsNotImplemented: readonly ProcessMetricKey[];
  /** Which of the twelve this response actually served, i.e. `kind === 'measured'`. */
  readonly metricsServed: readonly ProcessMetricKey[];
  readonly refusedMetrics: readonly RefusedMetricRow[];
  /** What the desk's own volume is, in the engine's words. Never a benchmark. */
  readonly volume: MarketingVolumeStatement;
  /** `MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK`, verbatim. */
  readonly measurementIsAboutTheDesk: string;
  /** The sentences that survive a print, each carrying its own n. */
  readonly lines: readonly string[];
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 THE LOOP — GET /loop                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `GET /v1/marketing/loop` — the post-mortem packet and the weekly block.
 *
 * AT n=0 THE VERDICT IS THE REPORT, the way `GET /v1/gps/loop` answers 200 on zero
 * records. "This desk has recorded no outcomes in the window" is a finding a review can
 * act on; an empty panel is not, and a 404 would read as a broken route. `verdictAtZero`
 * is non-null in exactly that case and carries the sentence.
 *
 * NOT A SCOREBOARD. `PostMortemReport.refusesToRank` is the literal `true`, and it travels
 * whole: a future edit that wants to rank angles has to change the engine's type. There is
 * no `bestPerforming`, no `topAngle` and no comparison field anywhere in this shape,
 * because ranking outcomes needs the denominators §4 refuses.
 */
export interface MarketingLoopReport {
  readonly periodFrom: Instant;
  readonly periodTo: Instant;
  readonly frame: ObservationFrame;
  readonly storage: MetricsStorageState;
  /** The packet. `absent` when the records it needs could not be read. */
  readonly report: Figure<PostMortemReport>;
  /** The marketing section of the weekly review, printable. */
  readonly wbr: Figure<WbrMarketingBlock>;
  /** Monday of the review week the block was composed for, `YYYY-MM-DD`. */
  readonly weekStart: string;
  /** Non-null when the window holds no recorded outcome. The finding, said out loud. */
  readonly verdictAtZero: string | null;
  /**
   * `POST_MORTEM_WITHOUT_CHANGE_IS_DECORATION`, carried when the period changed nothing.
   * A review that produced no change is the finding, not a blank section.
   */
  readonly noChangeWarning: string | null;
  readonly refusedMetrics: readonly RefusedMetricRow[];
  readonly measurementIsAboutTheDesk: string;
  readonly lines: readonly string[];
  readonly composedBy: ActorId;
  readonly composedAt: Instant;
}

/**
 * EVERY REFUSAL CODE THIS SUB-ROUTER CAN EMIT ITSELF, as data.
 *
 * Not a new namespace: each member is already in `RefusalCode`, and this list is only the
 * subset `routes/marketingGates.ts` constructs rather than passing through from an engine.
 * It exists so `loop.ts refusalCodeFrequency`'s never-fired list can be read against what
 * this router is even capable of emitting — a code no route can produce is not a gate that
 * has never tripped, and conflating the two is how 47 gates became invisible.
 */
export const MARKETING_GATE_REFUSAL_CODES: readonly RefusalCode[] = [
  'DATA_ABSENT_NOT_ZERO',
  'FETCH_OUTCOME_UNKNOWN',
  'CORROBORATION_ABSENT',
  'SENDER_AUTHENTICATION_ABSENT',
  'INBOUND_QUARANTINED',
  'IGNORE_WITHOUT_RATIONALE',
  'TRIAGE_ASSESSMENT_REQUIRED_BEFORE_DECISION',
  'METRIC_NOT_OBSERVABLE',
  'PUBLISHED_TEXT_NOT_PASTED_BACK',
  'RETENTION_POLICY_UNRESOLVED',
];
