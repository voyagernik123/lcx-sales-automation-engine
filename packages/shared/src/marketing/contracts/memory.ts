/**
 * MARKETING RESPONSE CONTRACTS — THE DESK'S MEMORY (precedent) AND THE CRISIS ROOM.
 *
 * ══ WHY THIS FILE EXISTS AT ALL ══
 * A web-side interface that declares fields the API does not return COMPILES, passes a
 * mocked test, and crashes on real data. That is not a hypothetical in this repo: it is
 * what took the GPS compartment down on 2026-08-01. So every response shape served by
 * `apps/api/src/routes/marketingMemory.ts` is declared here, ONCE, and imported by both
 * sides. There is no API-local copy and there must never be a browser-local one.
 *
 * `apps/web/src/lib/api/marketing.ts:991 MARKETING_CONTRACTS_OWED` names six of the
 * twenty-three rows this file discharges:
 *   fetchPrecedent          GET  /v1/marketing/precedent                        PrecedentSearchResult
 *   fetchCrisisStatements   GET  /v1/marketing/crisis/statements                CrisisStatementLibrary
 *   openCrisisStatement     POST /v1/marketing/crisis/statements/:key/instance  CrisisStatementInstance
 *   fetchCrisisInstance     GET  /v1/marketing/crisis/instance/:id              CrisisStatementInstance
 *   recordCrisisClearance   POST /v1/marketing/crisis/instance/:id/clearance    ClearanceBoard
 *   fetchPeerPreclears      GET  /v1/marketing/crisis/preclears                 PeerPreclearLibrary
 *
 * ══ IT IS TYPES ONLY, AND THAT IS DELIBERATE ══
 * Nothing here computes anything. Every figure in every shape below is produced by
 * `precedent.ts` or `crisis.ts` and COPIED — never recomputed and never re-thresholded,
 * because a second implementation of `MIN_TRIGRAM_SIMILARITY` or of the four
 * contradiction axes is how a refusal becomes a hit. Where a wrapper needs the shape of
 * an engine function's anonymous return, it uses `ReturnType<typeof f>` rather than
 * restating the fields, so it cannot drift from the function it describes.
 *
 * ══ THE ONE RULE THESE SHAPES ENFORCE STRUCTURALLY ══
 * Absent data refuses; it never returns zero, and it never collapses two different
 * absences into one. `PrecedentSearchOutcome` therefore has FOUR members where the
 * engine has three: `corpus_empty` (the index exists and is empty — likely after a
 * 90-day sweep), `no_match` (the index holds statements and none clears the floor),
 * `index_absent` (migration 0063 is not applied on this environment), and
 * `index_unreadable` (the database would not answer). A surface that renders all four
 * as an empty list has defeated the point, and the type is what stops it doing so by
 * accident: `lookup` is `null` in exactly the two storage cases.
 */
import type {
  ActorId,
  Clearance,
  ClearanceRole,
  ContagionAttribute,
  ContentHash,
  Disposition,
  ImpactSeverity,
  IncidentPhase,
  IncidentType,
  Instant,
  Refusal,
  RefusalCode,
  StatementBody,
  TimeToFirstStatementBudget,
} from '../types.js';
import type {
  ContradictionDebt,
  ContradictionDebtItem,
  PrecedentLookup,
  PrecedentOutcome,
  PrecedentStatement,
  PrecedentSubject,
  QuestionClassification,
  QuestionCoverageRow,
  QuestionKey,
  SoftFlagReason,
} from '../precedent.js';
import type {
  ClearanceAssessment,
  ContagionApplicability,
  ContagionPreclear,
  ContagionReadinessRow,
  HoldingPrecondition,
  HoldingStatement,
  HoldingStatementId,
  StatementCompleteness,
  TtfsAssessment,
  gateContagionAnswer,
} from '../crisis.js';

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 STORAGE — "the table is not there" is not "the desk said nothing"        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Three states, and the third is ignorance rather than a negative.
 *
 * `unavailable` is NOT `awaiting_migration_0063`: one transient database error cached
 * as "not migrated" is how a compartment tells the desk to go and look for a migration
 * that was applied weeks ago (`marketing/service.ts` records that defect and its fix).
 */
export type MemoryStorageState = 'present' | 'awaiting_migration_0063' | 'unavailable';

/**
 * Carried on every payload that touches a table. The crisis LIBRARY and the peer
 * preclears do not carry it, because they need zero data and must be readable at 03:00
 * on the worst night of the year with an empty database — a surface that renders a
 * migration banner instead of the holding statements has defeated their purpose.
 */
export interface MemoryStorage {
  readonly state: MemoryStorageState;
  /** The migration that creates the four tables. Named so an operator can act. */
  readonly migration: '0063_marketing_memory';
  /** One sentence. Never a bare token, and never an empty string. */
  readonly sentence: string;
  /** Null when and only when `state === 'present'`. */
  readonly refusal: Refusal | null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 PRECEDENT — what did we say about this before                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * FOUR distinct facts. `PrecedentOutcome`'s three, plus the two storage cases, and
 * every one of them is a different sentence on screen.
 */
export type PrecedentSearchOutcome = PrecedentOutcome | 'index_absent' | 'index_unreadable';

/**
 * What the server understood the question to be. Echoed because a lexical grouper that
 * silently reinterprets the query is unarguable, and an operator who cannot see which
 * subjects were parsed cannot tell a miss from a typo.
 */
export interface PrecedentQueryEcho {
  readonly subjects: readonly PrecedentSubject[];
  /** As supplied, or as `classifyQuestion` derived it. `basis` says which. */
  readonly questionKey: QuestionKey | null;
  readonly draftBody: string;
  readonly claimIds: readonly string[];
  /**
   * Null when the caller named a key AND supplied no draft text, so nothing was
   * classified. Otherwise the full classification, INCLUDING `ambiguous` and
   * `ungrouped` — two different facts that must not collapse into "no key".
   */
  readonly classification: QuestionClassification | null;
  /** Subject strings the parser could not read, verbatim. Never silently dropped. */
  readonly unparsedSubjects: readonly string[];
}

/**
 * How much of the corpus the read actually loaded.
 *
 * A DIFFERENT FACT FROM `CorpusWindow.truncatedByRetention`, and they must not be
 * conflated. That flag is the caller's assertion that the corpus BEGINS at a retention
 * boundary; this is the instrument admitting it read the most recent `cap` rows of a
 * larger table. When `capped` is true the debt figure is a FLOOR, not the count, because
 * a pair whose earlier half was not loaded cannot be found — and a floor presented as a
 * total is the failure this compartment exists to prevent.
 */
export interface PrecedentCorpusLoad {
  readonly loaded: number;
  /** Rows in the table. Counted, never estimated from the page. */
  readonly total: number;
  readonly cap: number;
  readonly capped: boolean;
  readonly sentence: string;
}

/**
 * `GET /v1/marketing/precedent`.
 *
 * `groupingCaveat` is `GROUPING_IS_LEXICAL_NOT_SEMANTIC` and is REQUIRED, not optional:
 * the browser must not present lexical grouping as semantic understanding, and a field
 * a surface may omit is a field a surface will omit.
 */
export interface PrecedentSearchResult {
  /** The instant the search was run against. Server clock; never a client parameter. */
  readonly asOf: Instant;
  readonly storage: MemoryStorage;
  readonly outcome: PrecedentSearchOutcome;
  /** Null in exactly the two storage cases. Never an empty lookup standing in for one. */
  readonly lookup: PrecedentLookup | null;
  /** Debt items touching a subject or question key in this query. */
  readonly relevantDebt: readonly ContradictionDebtItem[];
  /** The whole-corpus figure, for context beside the relevant slice. */
  readonly debt: ContradictionDebt | null;
  readonly coverage: QuestionCoverageRow | null;
  /** Null in the two storage cases; otherwise what was read and what was left. */
  readonly corpus: PrecedentCorpusLoad | null;
  readonly query: PrecedentQueryEcho;
  /** Always `GROUPING_IS_LEXICAL_NOT_SEMANTIC`. */
  readonly groupingCaveat: string;
  /** Every caveat the panel must render, engine-supplied. */
  readonly disclosures: readonly string[];
  /** One sentence per finding, each carrying its own qualification, for print. */
  readonly lines: readonly string[];
}

/**
 * `GET /v1/marketing/precedent/debt` — the contradiction-debt figure on its own.
 *
 * The soft flags travel inside `debt.softFlags`, where each one carries
 * `countedAsDebt: false` as a literal type. They are NOT copied to the top level: a
 * second array of the same rows is how a count and a list come to disagree.
 */
export interface ContradictionDebtReport {
  readonly asOf: Instant;
  readonly storage: MemoryStorage;
  /** Null in the two storage cases. A missing table is not a debt of zero. */
  readonly debt: ContradictionDebt | null;
  readonly corpus: PrecedentCorpusLoad | null;
  /** `CONTRADICTION_DEBT_DEFINITION`. Travels with the number, always. */
  readonly definition: string;
  /** Why each soft-flag class is deliberately excluded. `SOFT_FLAG_WHY_NOT_DEBT`. */
  readonly softFlagReasons: Record<SoftFlagReason, string>;
  /** One sentence stating that soft flags are shown and not counted. */
  readonly softFlagsAreNotDebt: string;
  readonly groupingCaveat: string;
  readonly disclosures: readonly string[];
  readonly lines: readonly string[];
}

/**
 * `POST /v1/marketing/precedent/statement` — record one of LCX's own statements.
 *
 * WITHOUT THIS THE INDEX IS PERMANENTLY EMPTY and `findPrecedent` is decoration —
 * which is the defect this codebase has now found three separate times. The write is
 * the reason the read is worth having.
 */
export interface OwnStatementRecorded {
  readonly storage: MemoryStorage;
  /** Null when the write refused. Never a partially-populated row. */
  readonly statement: PrecedentStatement | null;
  readonly refusals: readonly Refusal[];
  /** `PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS` — the retention argument, on the payload. */
  readonly holdsOnlyOwnWords: string;
  readonly retention: OwnStatementRetention;
}

/**
 * The clock this row was written with, and the two things that are NOT true about it.
 *
 * `policyResolved` is the literal `false` for the same reason
 * `CorpusWindow.retentionPolicyResolved` is: the DPO has not ruled, and a boolean that
 * could be `true` invites a screen that says the question is settled.
 */
export interface OwnStatementRetention {
  readonly expiresAt: Instant;
  /** `ASSUMED_OWN_STATEMENT_RETENTION_DAYS`. A policy default, not a finding. */
  readonly assumedDays: number;
  readonly policyResolved: false;
  /** `RETENTION_QUESTION_IS_OPEN`. */
  readonly openQuestion: string;
  /**
   * Literal `false`, and it is the honest half of the clock: 0063 sets an expiry on
   * every row and NOTHING deletes on it. A future edit that ships a sweeper has to
   * change this type, which is the only way a reader can tell a promise from a column.
   */
  readonly sweepImplemented: false;
  readonly sweepNote: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE CRISIS ROOM — the library, which needs zero data                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Why a library entry will or will not issue today. Three states, never a boolean. */
export type HoldingReviewState = 'current' | 'expired' | 'superseded';

export interface CrisisLibraryEntry {
  readonly statement: HoldingStatement;
  /** `renderStatementGuidance` — the INTERNAL brief. Never published. */
  readonly guidance: string;
  readonly reviewState: HoldingReviewState;
  /** The tri-slot body this entry seeds, so a surface can show what it starts from. */
  readonly seedsKnownCount: number;
  readonly seedsNotKnownCount: number;
  readonly sentence: string;
}

/**
 * `GET /v1/marketing/crisis/statements`.
 *
 * NO `storage` FIELD, AND THAT IS THE CONTRACT. These statements are in code, versioned,
 * and readable with an empty database and a pending migration. A response that depended
 * on `migrated: true` would put a migration banner in front of the operator at 03:00.
 */
export interface CrisisStatementLibrary {
  readonly asOf: Instant;
  readonly libraryVersion: number;
  readonly entries: readonly CrisisLibraryEntry[];
  /** Incident types with no preclear at all. A visible gap, not a zero. */
  readonly unpreparedIncidentTypes: readonly IncidentType[];
  /** Every type × severity budget, computed by `ttfsBudget`. */
  readonly ttfsBudgets: readonly TimeToFirstStatementBudget[];
  readonly ttfsBudgetBasis: string;
  /** Literal `true`: the wording is a versioned draft, not counsel-reviewed text. */
  readonly notCounselReviewed: true;
  readonly notCounselReviewedReason: string;
  /** Literal `true`: a preclear asserts nothing about whether the incident is real. */
  readonly incidentAgnostic: true;
  readonly incidentAgnosticReason: string;
  /** Literal `true`. There is no publish path here and there must never be one. */
  readonly cannotPublish: true;
  readonly handoffReason: string;
  readonly preconditionPrompts: Record<HoldingPrecondition, string>;
  /** Literal `true` — this payload does not read a table. See the docblock. */
  readonly readableWithNoDatabase: true;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE INCIDENT AND ITS CLOCK                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The clock, against its budget.
 *
 * `suppressionSupported` is the literal `false`: `validateClockSuppression` exists in
 * the engine and this compartment offers no way to record a suppression, so the clock
 * cannot be stopped. Saying so is the difference between a control that is absent and
 * one that is silently unavailable.
 */
export interface CrisisClockReading {
  readonly incidentId: string;
  readonly assessment: TtfsAssessment;
  readonly budgetBasis: string;
  readonly suppressionSupported: false;
  readonly suppressionNote: string;
  /** Copied from `assessment.sentence`. Populated in every state, `unknown` included. */
  readonly sentence: string;
}

export interface CrisisIncidentRecord {
  readonly incidentId: string;
  readonly incidentType: IncidentType;
  readonly severity: ImpactSeverity;
  readonly phase: IncidentPhase;
  /** When the DESK BECAME AWARE. Not when the incident began, not the insert time. */
  readonly openedAt: Instant;
  readonly openedBy: ActorId;
  /** Testimony that a human published, outside this system. Null until asserted. */
  readonly firstStatementAt: Instant | null;
  readonly firstStatementBy: ActorId | null;
  /** `'operator_testimony'` or null. Never `'observed'` — nothing here observes X. */
  readonly firstStatementSource: 'operator_testimony' | null;
  readonly legalImplications: boolean;
  readonly counselNamed: string | null;
  readonly clock: CrisisClockReading;
  /** Preclears that cover this incident type. Empty is the gap, stated. */
  readonly preclearsAvailable: readonly HoldingStatementId[];
  /** True when the library covers this type with nothing at all. */
  readonly unprepared: boolean;
  readonly statementCount: number;
  readonly cannotPublish: true;
  readonly handoffReason: string;
}

/** `POST /v1/marketing/crisis/incident`, and the incident read. */
export interface CrisisIncidentOpened {
  readonly storage: MemoryStorage;
  readonly incident: CrisisIncidentRecord | null;
  readonly refusals: readonly Refusal[];
}

/**
 * `POST /v1/marketing/crisis/incident/:id/first-statement`.
 *
 * `notAPublishPath` is the literal `true`. This route records that a named human
 * published by hand at a stated time; it is the same shape of assertion as
 * `POST /v1/marketing/draft/:id/sent`, and it is the ONLY way the clock leaves
 * `running`/`overdue`. Nothing here posts, holds a credential, or acts as the account.
 */
export interface CrisisFirstStatementRecorded {
  readonly storage: MemoryStorage;
  readonly incident: CrisisIncidentRecord | null;
  readonly testimony: {
    readonly assertedBy: ActorId;
    readonly publishedAt: Instant;
    readonly instanceId: string | null;
    readonly source: 'operator_testimony';
  } | null;
  readonly notAPublishPath: true;
  readonly sentence: string;
  readonly refusals: readonly Refusal[];
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §4 THE STATEMENT INSTANCE AND ITS CLEARANCE BOARD                           */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT THE OUTBOUND GATE SAID ABOUT THESE BYTES, on the one crisis path that brings
 * publishable text into existence and the one that approves it.
 *
 * ══ WHY A CRISIS STATEMENT IS GATED AT ALL ══
 * `assessStatementCompleteness` asks whether the tri-slot structure is honest. It does
 * NOT read the words for a regulated promise, and it cannot see the state the words sit
 * in: whether the statement names an asset under embargo (MiCA Art 90) or one the author
 * holds (Art 91(3)(c)). Neither of those is visible in prose, and both carry personal
 * fines. A complete statement can be an unlawful one, so both engines run —
 * `apps/api/src/marketing/outboundGate.ts` — before anything is stored.
 *
 * ══ WHY IT IS ALSO ON THE CLEARANCE ══
 * The bytes are immutable; the STATE around them is not. A statement cleared at 02:00
 * naming an asset that enters `mnpi_pending` at 03:00 must not gather its third clear at
 * 04:00. The gate re-runs at clearance for the same reason `POST /draft/:id/approve`
 * re-runs it, and that is not redundancy — it is the only check on a moving perimeter.
 *
 * ══ `allowed: true` DOES NOT MEAN "CLEAR" ══
 * `assetsExtracted` and `extractionCaveat` travel on the CLEAR verdict as well as the
 * refused one. Symbol extraction is lexical: an asset named in prose, lower case, or by
 * project name is not detected, so a clear verdict means "clear for the symbols listed".
 * A surface that showed the verdict without the caveat would be worse than no gate.
 *
 * ══ `null` MEANS NOT CHECKED ON THIS READ, NEVER "CLEAR" ══
 * `GET /crisis/instance/:id` does not re-run the gate — it re-reads a stored row — so the
 * field is `null` there. It is a nullable field rather than an optional one precisely so a
 * surface has to decide what to render for "nobody checked in this response".
 */
export interface CrisisOutboundGateVerdict {
  readonly allowed: boolean;
  readonly disposition: Disposition;
  /** Empty when nothing refused. An error-severity violation can block with no refusal. */
  readonly refusalCodes: readonly RefusalCode[];
  /** Dotted rule ids of the error-severity findings that caused `allowed: false`. */
  readonly blockingRules: readonly string[];
  /** Warning-severity findings, which travel without blocking. */
  readonly warningRules: readonly string[];
  /** The symbols the gate believed the text named. Shown, never hidden. */
  readonly assetsExtracted: readonly string[];
  readonly extractionCaveat: string;
  /** Set when a check itself threw. A thrown check is a refusal, never a pass. */
  readonly gateError: string | null;
  /**
   * Did the verdict reach `marketing_outbound_gate_decision`? False while 0062 is
   * pending. The gate still RAN and still blocked — this says only that the row a later
   * Art 8(2) production would read is not there.
   */
  readonly recordedInLedger: boolean;
  /** `'draft'` at composition, `'clearance'` at a clear. */
  readonly phase: 'draft' | 'clearance';
}

/**
 * `POST /v1/marketing/crisis/instance/:id/clearance`, and embedded in the instance.
 *
 * ══ `fourEyesUnachievable` IS THE FIELD THIS TYPE EXISTS FOR ══
 * `assessClearance` emits `FOUR_EYES_UNACHIEVABLE` when one human supplied every held
 * clear, and a route that only returned `allBlockingHeld` would swallow it — the board
 * would show three green lanes and the record would be actively misleading. It is
 * hoisted to its own field so a surface cannot render the board without deciding what
 * to do with it, AND it remains inside `assessment.refusals`, which is what the ledger
 * and the refusal-frequency count read. Two places, one object, no second computation.
 */
export interface ClearanceBoard {
  readonly instanceId: string;
  /** The bytes every clear on this board was given against. */
  readonly contentHash: ContentHash;
  readonly assessment: ClearanceAssessment;
  /** Extracted from `assessment.refusals`. Null when it did not fire. */
  readonly fourEyesUnachievable: Refusal | null;
  /** Every clear recorded for this instance, as stored. Unordered by construction. */
  readonly recorded: readonly Clearance[];
  /** `CRISIS_BLOCKING_CLEARANCES`, plus `legal` where the incident is flagged. */
  readonly blockingRoles: readonly ClearanceRole[];
  readonly headlineTestQuestion: string;
  /** Literal `true`: holding every clear does not authorise publication. */
  readonly cannotPublish: true;
  readonly sentence: string;
  /**
   * The gate verdict for the clear that produced this board. `null` on every read and
   * inside `CrisisStatementInstance.clearance`, where no gate was run — see
   * `CrisisOutboundGateVerdict`. Never `null` meaning "clear".
   */
  readonly outboundGate: CrisisOutboundGateVerdict | null;
}

/**
 * `POST /v1/marketing/crisis/statements/:key/instance` and
 * `GET  /v1/marketing/crisis/instance/:id`.
 *
 * `completeness` is RECOMPUTED on every read from the stored body against the current
 * instant, never read back from a column: a `nextUpdateBy` that was in the future when
 * the statement was composed is in the past an hour later, and a cached verdict would
 * report a breached commitment as complete.
 */
export interface CrisisStatementInstance {
  readonly storage: MemoryStorage;
  readonly instanceId: string;
  readonly incidentId: string;
  readonly seq: number;
  readonly statementId: HoldingStatementId | null;
  readonly statementVersion: number | null;
  readonly libraryVersion: number;
  readonly adHoc: boolean;
  readonly authoredBy: ActorId;
  readonly authoredAt: Instant;
  readonly phase: IncidentPhase;
  readonly body: StatementBody;
  /** `renderStatementText` — a missing slot is visibly missing, never silently absent. */
  readonly renderedText: string;
  readonly contentHash: ContentHash;
  readonly completeness: StatementCompleteness;
  readonly clearance: ClearanceBoard;
  readonly clock: CrisisClockReading;
  readonly preconditionsAcknowledged: readonly HoldingPrecondition[];
  readonly carriesPromotionalContent: boolean;
  readonly isInsideInformationDisclosure: boolean;
  readonly supersedes: string | null;
  readonly notCounselReviewedReason: string;
  readonly cannotPublish: true;
  readonly handoffReason: string;
  /** Refusals from composition. Empty on a complete statement, never absent. */
  readonly refusals: readonly Refusal[];
  /**
   * What the outbound gate said at COMPOSITION, carried on the 201 so no surface can show
   * a stored statement without the caveat attached to its clear verdict. `null` on
   * `GET /crisis/instance/:id`, where no gate ran — see `CrisisOutboundGateVerdict`.
   *
   * A refused composition never reaches this type at all: the route answers 422 with the
   * gate's refusals and stores no row, so there is no instance to carry a refused verdict.
   */
  readonly outboundGate: CrisisOutboundGateVerdict | null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §5 PEER CONTAGION — "are you like the firm that just failed"                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The engine's own gate result, by reference rather than by restatement. If
 * `gateContagionAnswer` grows a field, this type grows it in the same commit.
 */
export type ContagionAnswerGate = ReturnType<typeof gateContagionAnswer>;

export interface PeerPreclearRow {
  readonly readiness: ContagionReadinessRow;
  /** Null where nothing is prepared. `absent` and `expired` are different states. */
  readonly preclear: ContagionPreclear | null;
  /** Whether it would issue right now, and the refusal if not. */
  readonly gate: ContagionAnswerGate;
}

/**
 * `GET /v1/marketing/crisis/preclears` — every attribute in one call.
 *
 * ONE CALL IS THE REQUIREMENT, not a convenience: the window between a peer failing and
 * the question arriving is measured in minutes, and an operator paging through eight
 * attributes is an operator who answers from memory.
 *
 * No `storage` field: nothing here reads a table.
 */
export interface PeerPreclearLibrary {
  readonly asOf: Instant;
  readonly rows: readonly PeerPreclearRow[];
  /** `LCX_CONTAGION_APPLICABILITY` — what LCX can honestly say it shares. */
  readonly applicability: Record<ContagionAttribute, ContagionApplicability>;
  /** `CONTAGION_APPLICABILITY_OWNER` — whose facts these are, and that they are absent. */
  readonly applicabilityOwner: string;
  /** One sentence: `unknown` means the answer is not prepared, NOT that it is "no". */
  readonly unknownIsNotNo: string;
  readonly cannotPublish: true;
  readonly handoffReason: string;
  readonly readableWithNoDatabase: true;
}

