/**
 * LCX MARKETING — THE DESK'S MEMORY AND THE CRISIS ROOM, as an API.
 *
 *   GET  /precedent                              what did we say about this before
 *   GET  /precedent/debt                         the contradiction-debt figure
 *   POST /precedent/statement                    record one of LCX's own statements
 *   GET  /crisis/statements                      the versioned holding statements
 *   POST /crisis/incident                        open an incident (starts the clock)
 *   GET  /crisis/incident/:id/clock              the clock against its budget
 *   POST /crisis/incident/:id/first-statement    testimony that a human published
 *   POST /crisis/statements/:key/instance        compose; get the completeness verdict
 *   GET  /crisis/instance/:id                    one statement, board and clock
 *   POST /crisis/instance/:id/clearance          record one of the parallel clears
 *   GET  /crisis/preclears                       every peer-contagion preclear, one call
 *
 * ══ WHY THIS FILE EXISTS ══
 * `packages/shared/src/marketing/precedent.ts` (1 596 lines) and `crisis.ts` (2 792
 * lines) are the two most valuable engines in the compartment and NOTHING COULD REACH
 * EITHER. An engine nothing calls is decoration — the defect this codebase has now found
 * three separate times — and both are worse than decoration when absent: precedent is
 * how the desk stops saying two different things three weeks apart under its own name,
 * and the crisis room is what an operator opens at 03:00.
 *
 * ══ WHERE THIS IS MOUNTED ══
 * `routes/marketing.ts` nests it at `'/'` inside `marketingRoutes`, beside the desk and
 * record routers, so every path above resolves under `/v1/marketing` — which is what
 * `apps/web/src/lib/api/marketing.ts` already calls. Nesting rather than a fourth
 * `app.route('/v1/marketing', …)` line is what keeps this file inside both the compartment
 * gate and the outbound-classification ratchet; that argument is written out where the
 * mount is, and verified per path in `__tests__/marketingMount.test.ts`.
 *
 * No path here collides with `marketing.ts`: its parameterised routes are `/:id/draft`,
 * `/:id/drafts` and `/:id/status`, and every second segment used below (`statement`,
 * `debt`, `incident`, `instance`, `statements`, `preclears`, `clock`) differs from all
 * three literals.
 *
 * ══ THE CONTRACT IS DECLARED ONCE, IN packages/shared ══
 * Every response type comes from `packages/shared/src/marketing/contracts/memory.ts`
 * and is imported here AND by the browser. There is no API-local response interface in
 * this file and there must never be one: a web-side interface declaring fields the API
 * does not return compiles, passes a mocked test, and crashes on real data — which is
 * what took the GPS compartment down on 2026-08-01.
 *
 * `packages/shared/src/marketing/index.ts` re-exports `./contracts/memory.js` wholesale,
 * which is what makes the type import below resolve. `export *` cannot drift from the
 * directory it publishes; a hand-written name list is a second place to forget, with no
 * signal until an emit build in Docker order fails.
 *
 * ══ NOTHING HERE PUBLISHES. THERE IS NO X CREDENTIAL AND NEVER WILL BE ══
 * No route posts, stores a credential, or acts as the LCX account, and there is
 * deliberately nowhere to add one. `POST /crisis/incident/:id/first-statement` is the
 * only route that touches publication and it records TESTIMONY — a named human
 * asserting they pasted the text by hand, outside this system, at a stated time. That
 * is the same shape of assertion as `POST /v1/marketing/draft/:id/sent`, and it is the
 * only way the time-to-first-statement clock can leave `running`/`overdue`. The
 * `cannotPublish: true` field on every crisis payload exists so a surface can SAY so
 * rather than leave the absence to be inferred from a missing button.
 *
 * ══ TWO ROUTES HERE PRODUCE OR APPROVE OUTBOUND TEXT, AND BOTH ARE GATED ══
 * `POST /crisis/statements/:key/instance` brings publishable words into existence and
 * `POST /crisis/instance/:id/clearance` grants authority over them, so both run
 * `marketing/outboundGate.ts` — claim safety AND market abuse, failing closed — before
 * anything is stored. Completeness is a structural check and cannot see a regulated
 * promise or an embargoed symbol; see `gateCrisisStatement` for the whole argument.
 * `marketing/__tests__/outboundGateCoverage.test.ts` classifies every route in this file
 * and turns red on a new one until a human says which kind it is.
 *
 * ══ MIGRATION-PENDING DISCIPLINE, AND THE THREE-STATE PROBE ══
 * 0063 is applied by hand and this code ships on a push, so there is a window where
 * these routes are live and the tables do not exist. Reads answer 200 with a
 * well-shaped body carrying `storage.state: 'awaiting_migration_0063'` and a REFUSAL
 * sentence, so the page renders its banner instead of its error state; writes answer
 * 503, because the request was valid and the environment is not ready. Never 500.
 *
 * `unavailable` is a third state and is NOT cached: one transient database error
 * remembered as "not migrated" is how a desk is told to go and look for a migration
 * applied weeks ago (`marketing/service.ts` records that exact defect).
 *
 * TWO PAYLOADS CARRY NO `storage` FIELD AT ALL — the holding-statement library and the
 * peer preclears. They are in code, versioned, and must be readable with an empty
 * database and a pending migration. A migration banner in front of the holding
 * statements at 03:00 would defeat the entire point of preclearing them.
 *
 * ══ WHAT THIS FILE DOES NOT COMPUTE ══
 * Every figure is produced by the engines and copied. No threshold, no staleness
 * horizon, no contradiction axis and no clock budget is re-implemented here: a second
 * implementation of `MIN_TRIGRAM_SIMILARITY` is how a refusal becomes a hit, and a
 * second copy of `TTFS_BUDGET_MINUTES_BY_SEVERITY` is how two surfaces disagree about
 * whether the desk was late.
 *
 * It also does NOT read desk mode. `crisisCapabilities` needs a `DeskMode`, the desk-mode
 * store belongs to `POST /v1/marketing/desk-mode` (owed, `MARKETING_CONTRACTS_OWED`),
 * and accepting the mode as a request field would let a client assert the desk is not
 * suspended. So capabilities are absent rather than invented, and `activateCrisisStatement`
 * — whose last gate is `desk_permits_handoff` — is deliberately not called here.
 */
import { Hono } from 'hono';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  /* precedent — the desk's memory */
  ASSUMED_OWN_STATEMENT_RETENTION_DAYS,
  CONTRADICTION_DEBT_DEFINITION,
  GROUPING_IS_LEXICAL_NOT_SEMANTIC,
  INSTRUMENTS,
  PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS,
  PRECEDENT_RULESET_VERSION,
  QUESTION_KEYS,
  RETENTION_QUESTION_IS_OPEN,
  SOFT_FLAG_WHY_NOT_DEBT,
  STALENESS_HORIZON_DAYS,
  STALENESS_HORIZONS_ARE_A_STATED_POLICY,
  classifyQuestion,
  contradictionDebt,
  precedentPanel,
  /* crisis — the room */
  CONTAGION_APPLICABILITY_OWNER,
  CRISIS_BLOCKING_CLEARANCES,
  CRISIS_RULESET_VERSION,
  CRISIS_ROOM_HANDOFF_REASON,
  CLEARANCE_HEADLINE_TEST_QUESTION,
  HOLDING_LIBRARY_VERSION,
  HOLDING_PRECONDITIONS,
  HOLDING_PRECONDITION_PROMPT,
  HOLDING_STATEMENTS,
  HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON,
  HOLDING_STATEMENTS_UNREVIEWED_REASON,
  INCIDENT_SEVERITIES,
  LCX_CONTAGION_APPLICABILITY,
  TTFS_BUDGET_BASIS,
  assessClearance,
  assessStatementCompleteness,
  assessTimeToFirstStatement,
  contagionReadiness,
  gateContagionAnswer,
  getHoldingStatement,
  holdingStatementsFor,
  renderStatementGuidance,
  renderStatementText,
  seedStatementBody,
  ttfsBudget,
  unpreparedIncidentTypes,
} from '@lcx/shared';
import { gateOutboundText, recordGateDecision } from '../marketing/outboundGate.js';
import type {
  ActorId,
  ArtefactIntent,
  Clearance,
  ClearanceBoard,
  ClearanceRole,
  ContradictionDebtReport,
  CrisisOutboundGateVerdict,
  CrisisFirstStatementRecorded,
  CrisisIncidentOpened,
  CrisisIncidentRecord,
  CrisisClockReading,
  CrisisLibraryEntry,
  CrisisStatementDraft,
  CrisisStatementInstance,
  CrisisStatementLibrary,
  HoldingPrecondition,
  HoldingStatementId,
  ImpactSeverity,
  IncidentPhase,
  IncidentType,
  Instant,
  MemoryStorage,
  MemoryStorageState,
  OwnStatementRecorded,
  PeerPreclearLibrary,
  PeerPreclearRow,
  Polarity,
  PrecedentCorpusLoad,
  PrecedentQuery,
  PrecedentSearchResult,
  PrecedentStatement,
  PrecedentSubject,
  QuestionKey,
  Refusal,
  RefusalRecovery,
  RuleCitation,
  StatementBody,
  StatementKind,
  StatementStanding,
  TimeToFirstStatementBudget,
} from '@lcx/shared';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const nowIso = (): Instant => new Date().toISOString();

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The desk's own policy, cited where a refusal here is ours rather than the law's. */
const DESK_POLICY = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.desk_policy.key,
  provision,
  text,
});

/** CERC, cited where the rule is the crisis-communication doctrine's. */
const CERC = (provision: string, text: string): RuleCitation => ({
  instrument: INSTRUMENTS.cerc.key,
  provision,
  text,
});

function refuse(
  code: Refusal['code'],
  sentence: string,
  rule: RuleCitation,
  recovery: RefusalRecovery,
  matched: string | null = null,
  ruleSetVersion: number = PRECEDENT_RULESET_VERSION,
): Refusal {
  return { code, sentence, rule, recovery, matched, ruleSetVersion };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §0 THE STORAGE PROBE — three states, and only two of them are cached        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The file a human must run, named ONCE and exported.
 *
 * Every sibling does this — `abuseRegister.ABUSE_MIGRATION`, `record.RECORD_MIGRATION`,
 * `outboundGate.GATE_MIGRATION`, `retention.RETENTION_MIGRATION` — and it is not
 * decoration: `db/__tests__/migrationImmutability.test.ts` reads these constants to check
 * that the file a 503 tells an operator to run is a file that exists and is not already
 * pinned as shipped. Three surfaces once named migrations nobody had written, so an
 * operator was sent to run a file that did not exist and the surface refused forever.
 *
 * The `.sql` suffix is part of the name for the same reason: it is the thing to paste into
 * the Supabase SQL editor, not a prefix to reconstruct.
 */
export const MEMORY_MIGRATION = '0063_marketing_memory.sql';

/**
 * `to_regclass` over BOTH roots, because 0063 creates four tables in one file and a
 * half-applied migration is a real state on a hand-applied environment. Probing one
 * table and inferring the rest is how a read succeeds and the write beside it throws.
 *
 * Only a DEFINITIVE answer is cached, for the reason `marketing/service.ts` records at
 * length: caching an error pins the compartment into "awaiting migration" for the life
 * of the process, and the desk goes looking for a migration that landed weeks ago.
 */
let memoryMigratedCache: boolean | null = null;

async function memoryStorageState(pool: Pool): Promise<MemoryStorageState> {
  if (memoryMigratedCache !== null) {
    return memoryMigratedCache ? 'present' : 'awaiting_migration_0063';
  }
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.marketing_own_statement') IS NOT NULL
              AND to_regclass('public.marketing_crisis_incident') IS NOT NULL
              AND to_regclass('public.marketing_crisis_statement_instance') IS NOT NULL
              AND to_regclass('public.marketing_crisis_clearance') IS NOT NULL AS ok`,
    );
    memoryMigratedCache = Boolean(res.rows[0]?.ok);
    return memoryMigratedCache ? 'present' : 'awaiting_migration_0063';
  } catch {
    return 'unavailable';
  }
}

/** Test-only: forget the probe. Mirrors `service.ts:_resetMigrated`. */
export function _resetMemoryMigrated(): void {
  memoryMigratedCache = null;
}

const STORAGE_ABSENT_RULE = DESK_POLICY(
  'memory.storage_absent',
  'An absent table is a fact about this environment, not a finding about the desk. It must be reported as "cannot see" with the migration named, never as an empty list — an empty list reads as "nothing was said".',
);

function storageOf(state: MemoryStorageState): MemoryStorage {
  if (state === 'present') {
    return {
      state,
      migration: '0063_marketing_memory',
      sentence: 'Migration 0063 is applied on this environment: the precedent index and the crisis record are readable.',
      refusal: null,
    };
  }
  const absent = state === 'awaiting_migration_0063';
  return {
    state,
    migration: '0063_marketing_memory',
    sentence: absent
      ? 'Migration 0063 has not been applied on this environment, so the precedent index and the crisis record do not exist yet. Nothing here is a measurement of what the desk has said.'
      : 'The database would not answer whether migration 0063 is applied, so this read cannot say what the index holds. That is ignorance, not an empty index.',
    refusal: refuse(
      'DATA_ABSENT_NOT_ZERO',
      absent
        ? 'This panel cannot tell you what the desk has said before: migration 0063_marketing_memory has not been applied on this environment, so the index it reads does not exist. Treat every answer here as unknown, not as new.'
        : 'This panel cannot tell you what the desk has said before: the database did not answer the schema probe. Retry — and do not read the empty result as "nothing was said".',
      STORAGE_ABSENT_RULE,
      absent
        ? {
            kind: 'supply_data',
            missing: 'migration 0063_marketing_memory, applied on this environment',
            whoCanSupply: 'whoever applies migrations on this environment',
          }
        : { kind: 'wait_until', condition: 'the database answers a to_regclass probe' },
    ),
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1 PRECEDENT — the corpus, and how a row becomes a `PrecedentStatement`     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The most recent `PRECEDENT_CORPUS_CAP` statements are loaded and the total is COUNTED.
 * Both numbers travel on the payload: contradiction debt over a truncated corpus is a
 * FLOOR and not the count, because a pair whose earlier half was not read cannot be
 * found, and a floor presented as a total is exactly the confident default this
 * compartment exists to refuse.
 */
const PRECEDENT_CORPUS_CAP = 2000;

/**
 * `SELECT` with an explicit column list, never `*`. 0046's `listReplies` was
 * `SELECT *` and shipped up to 20KB of a stranger's forwarded email to the browser on
 * every queue read; the fix belonged in the route, and so does this discipline.
 */
const OWN_STATEMENT_COLUMNS = `statement_uid, body, kind, question_key, polarity,
       named_timeframe, standing, supersedes, superseded_by, stated_at, cleared_by,
       cleared_at, review_due_at, derived_from_approved_language_id, content_hash,
       subjects, claims, quantitative`;

type OwnStatementRow = {
  statement_uid: string;
  body: string;
  kind: string;
  question_key: string | null;
  polarity: string;
  named_timeframe: string | null;
  standing: string;
  supersedes: string | null;
  superseded_by: string | null;
  stated_at: Date | string;
  cleared_by: string;
  cleared_at: Date | string;
  review_due_at: Date | string | null;
  derived_from_approved_language_id: string | null;
  content_hash: string;
  subjects: unknown;
  claims: unknown;
  quantitative: unknown;
};

const iso = (value: Date | string): Instant =>
  value instanceof Date ? value.toISOString() : String(value);

const isoOrNull = (value: Date | string | null): Instant | null =>
  value === null ? null : iso(value);

const asArray = <T>(value: unknown): readonly T[] => (Array.isArray(value) ? (value as T[]) : []);

/**
 * Row → `PrecedentStatement`. The unions are asserted rather than re-validated because
 * 0063 CHECKs every one of them at the column, so a value outside the union cannot be
 * in the table. That is the one place an assertion is honest: the constraint is the
 * validation, and it runs on write.
 */
function toPrecedentStatement(row: OwnStatementRow): PrecedentStatement {
  return {
    id: row.statement_uid,
    body: row.body,
    kind: row.kind as StatementKind,
    subjects: asArray<PrecedentSubject>(row.subjects),
    questionKey: row.question_key as QuestionKey | null,
    polarity: row.polarity as Polarity,
    namedTimeframe: row.named_timeframe,
    claims: asArray(row.claims),
    quantitative: asArray(row.quantitative),
    standing: row.standing as StatementStanding,
    supersedes: row.supersedes,
    supersededBy: row.superseded_by,
    statedAt: iso(row.stated_at),
    clearedBy: row.cleared_by,
    clearedAt: iso(row.cleared_at),
    reviewDueAt: isoOrNull(row.review_due_at),
    derivedFromApprovedLanguageId: row.derived_from_approved_language_id,
    contentHash: row.content_hash,
  };
}

async function loadCorpus(
  pool: Pool,
): Promise<{ corpus: readonly PrecedentStatement[]; load: PrecedentCorpusLoad }> {
  const counted = await pool.query(`SELECT count(*)::int AS n FROM marketing_own_statement`);
  const total = Number(counted.rows[0]?.n ?? 0);
  const res = await pool.query(
    `SELECT ${OWN_STATEMENT_COLUMNS} FROM marketing_own_statement
      ORDER BY stated_at DESC LIMIT $1`,
    [PRECEDENT_CORPUS_CAP],
  );
  const corpus = (res.rows as OwnStatementRow[]).map(toPrecedentStatement);
  const capped = total > corpus.length;
  return {
    corpus,
    load: {
      loaded: corpus.length,
      total,
      cap: PRECEDENT_CORPUS_CAP,
      capped,
      sentence: capped
        ? `${corpus.length} of ${total} statements were loaded (the ${PRECEDENT_CORPUS_CAP} most recent). Any contradiction-debt figure below is a FLOOR: a disagreeing pair whose earlier half was not loaded cannot be found.`
        : `All ${total} statement${total === 1 ? '' : 's'} in the index were loaded and compared.`,
    },
  };
}

/**
 * `asset:BTC`, `question:withdrawal_status`, `peer:acme exchange`, `product:earn`.
 *
 * An unreadable subject is RETURNED VERBATIM in `unparsedSubjects`, never dropped: a
 * silently ignored filter is how an operator comes to believe a search was scoped when
 * it was not.
 */
function parseSubject(raw: string): PrecedentSubject | null {
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const kind = raw.slice(0, at).trim().toLowerCase();
  const value = raw.slice(at + 1).trim();
  if (value.length === 0) return null;
  if (kind === 'asset') return { kind: 'asset', symbol: value };
  if (kind === 'peer') return { kind: 'peer', organisation: value };
  if (kind === 'product') return { kind: 'product', product: value };
  if (kind === 'question') {
    return QUESTION_KEYS.includes(value as QuestionKey)
      ? { kind: 'question', questionKey: value as QuestionKey }
      : null;
  }
  return null;
}

const SOFT_FLAGS_ARE_NOT_DEBT =
  'Soft flags are differences a human should read and the count deliberately excludes: a stance that changed against a refusal to comment, a figure restated for a later date, a timeframe named on one side only, and near-duplicate wording. Each carries `countedAsDebt: false`. A debt number that moved when someone tuned a similarity threshold would not be a debt number.';

export const marketingMemoryRoutes = new Hono<{ Variables: AuthVariables }>();

/** Every refusal-carrying 422 in this file answers with this code. */
const REFUSED = 'MARKETING_MEMORY_REFUSED' as const;

/**
 * GET /precedent — WHAT DID WE SAY ABOUT THIS BEFORE.
 *
 * `asOf` is the SERVER clock and is never a query parameter. A staleness read the caller
 * can date is a staleness read the caller can defeat, and the whole point of
 * `stalenessOf` is what it says in August about a sentence cleared in March.
 *
 * FOUR OUTCOMES, FOUR SENTENCES. `hits`, `no_match` (the index holds statements and none
 * clears the floor — the desk has not answered this), `corpus_empty` (the index exists
 * and is empty, which after a 90-day sweep is the likely state and is NOT the same
 * claim), and `index_absent` (0063 unapplied). The engine keeps the first three apart;
 * this route keeps the fourth apart from them and never renders any of them as a zero.
 *
 * NOTHING IS RE-THRESHOLDED HERE. `precedentPanel` composes the lookup, the debt slice
 * and the coverage row in one call, and every figure below is copied out of it.
 */
marketingMemoryRoutes.get('/precedent', requireOperator, async (c) => {
  try {
    const asOf = nowIso();

    const rawSubjects = c.req.queries('subject') ?? [];
    const subjects: PrecedentSubject[] = [];
    const unparsedSubjects: string[] = [];
    for (const raw of rawSubjects) {
      const parsed = parseSubject(raw);
      if (parsed === null) unparsedSubjects.push(raw);
      else subjects.push(parsed);
    }

    const rawKey = (c.req.query('questionKey') ?? '').trim();
    if (rawKey !== '' && !QUESTION_KEYS.includes(rawKey as QuestionKey)) {
      // Validation BEFORE the storage probe: a bad key is bad in every environment, and
      // answering 200-with-a-banner would tell the caller the index was the problem.
      return c.json(
        {
          error: `questionKey must be one of: ${QUESTION_KEYS.join(', ')}`,
          code: 'VALIDATION',
        },
        400,
      );
    }
    const suppliedKey = rawKey === '' ? null : (rawKey as QuestionKey);
    const draftBody = (c.req.query('draft') ?? '').slice(0, 4000);
    const claimIds = (c.req.queries('claimId') ?? []).map((s) => s.trim()).filter((s) => s !== '');

    /*
     * `classifyQuestion` had no caller either. It is run whenever there is anything to
     * classify, and its result is returned WHOLE — `ambiguous` and `ungrouped` are
     * different facts (several readings of the question versus a gap in the ontology)
     * and the payload keeps them apart, as does the engine.
     */
    const classification =
      draftBody.trim() === '' && suppliedKey === null
        ? null
        : classifyQuestion(draftBody, suppliedKey);
    const questionKey = suppliedKey ?? classification?.key ?? null;

    const query: PrecedentQuery = { subjects, questionKey, draftBody, claimIds };
    const echo = {
      subjects,
      questionKey,
      draftBody,
      claimIds,
      classification,
      unparsedSubjects,
    };

    const state = await memoryStorageState(getPool());
    const storage = storageOf(state);
    if (state !== 'present') {
      const data: PrecedentSearchResult = {
        asOf,
        storage,
        outcome: state === 'awaiting_migration_0063' ? 'index_absent' : 'index_unreadable',
        lookup: null,
        relevantDebt: [],
        debt: null,
        coverage: null,
        corpus: null,
        query: echo,
        groupingCaveat: GROUPING_IS_LEXICAL_NOT_SEMANTIC,
        disclosures: [PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS, RETENTION_QUESTION_IS_OPEN],
        lines: [storage.sentence, storage.refusal?.sentence ?? ''].filter((s) => s !== ''),
      };
      return c.json({ data, meta: meta() });
    }

    const { corpus, load } = await loadCorpus(getPool());
    // `truncatedByRetention: false` is an ASSERTION THIS ROUTE IS ENTITLED TO MAKE, and
    // it is not the same claim as `load.capped`. The 90-day sweep in `service.ts` runs
    // over `marketing_x_reply`; nothing sweeps `marketing_own_statement`, so this corpus
    // does not begin at a retention boundary. What it may begin at is a LIMIT, which is
    // `load.capped` and is reported separately.
    const panel = precedentPanel(query, corpus, asOf, { truncatedByRetention: false });

    const data: PrecedentSearchResult = {
      asOf,
      storage,
      outcome: panel.lookup.outcome,
      lookup: panel.lookup,
      relevantDebt: panel.relevantDebt,
      debt: panel.debt,
      coverage: panel.coverage,
      corpus: load,
      query: echo,
      groupingCaveat: GROUPING_IS_LEXICAL_NOT_SEMANTIC,
      disclosures: panel.disclosures,
      lines: [...panel.lines, load.sentence],
    };
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[marketing/memory] precedent error:', err);
    return c.json({ error: 'Failed to search precedent', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * GET /precedent/debt — the contradiction-debt figure, and the flags that are NOT it.
 *
 * The definition travels with the number, always. A figure called "debt" that reaches a
 * board pack without its definition cannot be reproduced, and every item here is
 * reproducible by hand from the two records it names.
 */
marketingMemoryRoutes.get('/precedent/debt', requireOperator, async (c) => {
  try {
    const asOf = nowIso();
    const state = await memoryStorageState(getPool());
    const storage = storageOf(state);

    const common = {
      asOf,
      storage,
      definition: CONTRADICTION_DEBT_DEFINITION,
      softFlagReasons: SOFT_FLAG_WHY_NOT_DEBT,
      softFlagsAreNotDebt: SOFT_FLAGS_ARE_NOT_DEBT,
      groupingCaveat: GROUPING_IS_LEXICAL_NOT_SEMANTIC,
      disclosures: [
        PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS,
        RETENTION_QUESTION_IS_OPEN,
        STALENESS_HORIZONS_ARE_A_STATED_POLICY,
        CONTRADICTION_DEBT_DEFINITION,
      ],
    };

    if (state !== 'present') {
      const data: ContradictionDebtReport = {
        ...common,
        debt: null,
        corpus: null,
        lines: [storage.sentence, storage.refusal?.sentence ?? ''].filter((s) => s !== ''),
      };
      return c.json({ data, meta: meta() });
    }

    const { corpus, load } = await loadCorpus(getPool());
    const debt = contradictionDebt(corpus, asOf, { truncatedByRetention: false });

    const lines: string[] = [
      debt.standingCompared === 0
        ? 'Contradiction debt is not computable: the index holds no standing statements to compare. That is not a debt of zero.'
        : `${debt.count} item${debt.count === 1 ? '' : 's'} of contradiction debt across ${debt.standingCompared} standing statements.`,
      debt.window.statement,
      load.sentence,
    ];
    for (const item of debt.items) lines.push(`· ${item.sentence}`);
    if (debt.softFlags.length > 0) {
      lines.push(
        `${debt.softFlags.length} soft flag${debt.softFlags.length === 1 ? '' : 's'} shown and deliberately NOT counted as debt.`,
      );
      for (const flag of debt.softFlags) lines.push(`· ${flag.sentence} ${flag.whyNotDebt}`);
    }
    lines.push(
      debt.pairsExplicitlyLinked === 0 && debt.standingCompared > 1
        ? 'No pair on this corpus carries an explicit supersedes link. A desk with no debt and no recorded lineage has probably not recorded its lineage rather than achieved consistency.'
        : `${debt.pairsExplicitlyLinked} differing pair${debt.pairsExplicitlyLinked === 1 ? '' : 's'} carry an explicit supersedes link and are not debt.`,
    );

    const data: ContradictionDebtReport = { ...common, debt, corpus: load, lines };
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[marketing/memory] debt error:', err);
    return c.json({ error: 'Failed to compute contradiction debt', code: 'MARKETING_ERROR' }, 500);
  }
});

/* ── The write. Without it the index is permanently empty and the read is theatre. ── */

/** Derived from the engine's own record, so it cannot drift from `StatementKind`. */
const STATEMENT_KINDS = Object.keys(STALENESS_HORIZON_DAYS) as readonly StatementKind[];
/** Annotated by the union: a rename in `precedent.ts` breaks this line at compile time. */
const POLARITIES: readonly Polarity[] = ['affirms', 'denies', 'declines_to_say', 'not_a_yes_no'];
const STANDINGS: readonly StatementStanding[] = [
  'standing',
  'superseded',
  'retracted',
  'never_published',
];

/**
 * FIELDS THIS INDEX REFUSES TO ACCEPT, by name.
 *
 * `precedent.ts` §0 argues that the corpus may be retained past the 90-day sweep BECAUSE
 * it holds no third-party personal data, and it enforces that through the shape of
 * `PrecedentStatement` — no `authorHandle`, no inbound text, no permalink of someone
 * else's post. A route that quietly ignored such a field would let a caller believe it
 * had been stored; a route that stored it would destroy the retention argument for every
 * row in the table. So the write REFUSES and says which field, and 0063 has no column
 * that could hold one either. Two layers, and the SQL is the load-bearing one.
 */
const FORBIDDEN_STATEMENT_FIELDS = [
  'authorHandle',
  'author_handle',
  'authorDisplay',
  'author_display',
  'handle',
  'inboundBody',
  'inbound_body',
  'targetPermalink',
  'permalink',
  'xCommentId',
  'x_comment_id',
] as const;

const parseInstant = (value: unknown): Instant | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

/**
 * POST /precedent/statement — record one of LCX's own statements.
 *
 * `clearedBy` COMES FROM THE SESSION, never from a body field, for the same reason
 * `approve` does: an attribution the client could sign for somebody else is not a
 * record. `contentHash` is computed here from the text, so an edit cannot inherit a
 * clearance, and a client cannot bind a clearance to bytes it did not send.
 *
 * `supersedes` is written as a LINK ON BOTH ROWS inside one transaction, and it is the
 * only thing that takes a differing pair out of the debt count. Half a link — the new
 * row pointing back while the old row still reads `standing` with a null `supersededBy`
 * — is precisely the state `contradictionDebt` is looking for, so it must not be
 * reachable through a partial write.
 */
marketingMemoryRoutes.post('/precedent/statement', requireOperator, async (c) => {
  try {
    const raw = await c.req.json<Record<string, unknown>>();

    const offending = FORBIDDEN_STATEMENT_FIELDS.filter((f) => raw[f] !== undefined);
    if (offending.length > 0) {
      return c.json(
        {
          error: `This index holds LCX's own words only. It cannot accept: ${offending.join(', ')}.`,
          code: 'VALIDATION',
          rule: PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS,
          // No marketing RefusalCode is invented for this: the shared union in
          // `types.ts` is the one namespace, `loop.ts:refusalCodeFrequency` enumerates
          // it to report gates that never fired, and a code outside it is invisible to
          // the only honest read the desk has on whether its gates are load-bearing.
        },
        400,
      );
    }

    const body = typeof raw.body === 'string' ? raw.body.trim() : '';
    if (body === '') {
      return c.json({ error: 'body is required and must be the text as cleared', code: 'VALIDATION' }, 400);
    }
    const kind = String(raw.kind ?? '');
    if (!STATEMENT_KINDS.includes(kind as StatementKind)) {
      return c.json({ error: `kind must be one of: ${STATEMENT_KINDS.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const polarity = String(raw.polarity ?? 'not_a_yes_no');
    if (!POLARITIES.includes(polarity as Polarity)) {
      return c.json({ error: `polarity must be one of: ${POLARITIES.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const standing = String(raw.standing ?? 'standing');
    if (!STANDINGS.includes(standing as StatementStanding)) {
      return c.json({ error: `standing must be one of: ${STANDINGS.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const questionKeyRaw = raw.questionKey === undefined || raw.questionKey === null ? null : String(raw.questionKey);
    if (questionKeyRaw !== null && !QUESTION_KEYS.includes(questionKeyRaw as QuestionKey)) {
      return c.json({ error: `questionKey must be one of: ${QUESTION_KEYS.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const statedAt = parseInstant(raw.statedAt);
    if (statedAt === null) {
      // An unparseable instant is refused rather than defaulted to now: a statement
      // whose date the desk cannot read is not a fresh statement, and `stalenessOf`
      // reports `not_assessable` for exactly this reason.
      return c.json(
        {
          error: 'statedAt must be a parseable ISO-8601 instant: when the desk actually said it.',
          code: REFUSED,
          refusals: [
            refuse(
              'INSTANT_UNPARSEABLE',
              `"${String(raw.statedAt ?? '')}" is not a readable instant, so this statement cannot be dated. An undated statement cannot be aged, and an un-ageable statement must never be shown as current.`,
              DESK_POLICY(
                'precedent.stated_at_required',
                'Every recorded statement carries the instant the desk said it. Substituting the insert time would date the record by when somebody got round to typing it.',
              ),
              { kind: 'supply_data', missing: 'the instant the statement was made, ISO-8601', whoCanSupply: 'the operator recording it' },
              typeof raw.statedAt === 'string' ? raw.statedAt : null,
            ),
          ],
        },
        422,
      );
    }
    const reviewDueAt = raw.reviewDueAt === undefined || raw.reviewDueAt === null ? null : parseInstant(raw.reviewDueAt);
    if (raw.reviewDueAt !== undefined && raw.reviewDueAt !== null && reviewDueAt === null) {
      return c.json({ error: 'reviewDueAt must be a parseable ISO-8601 instant or omitted', code: 'VALIDATION' }, 400);
    }

    const subjects: PrecedentSubject[] = [];
    for (const entry of asArray<unknown>(raw.subjects)) {
      if (typeof entry === 'string') {
        const parsed = parseSubject(entry);
        if (parsed === null) {
          return c.json(
            { error: `subject "${entry}" is not readable. Use asset:SYMBOL, question:<questionKey>, peer:<organisation> or product:<product>.`, code: 'VALIDATION' },
            400,
          );
        }
        subjects.push(parsed);
        continue;
      }
      return c.json({ error: 'subjects must be strings of the form kind:value', code: 'VALIDATION' }, 400);
    }

    const claims = asArray<unknown>(raw.claims);
    const quantitative = asArray<unknown>(raw.quantitative);
    const supersedes = raw.supersedes === undefined || raw.supersedes === null ? null : String(raw.supersedes).trim() || null;
    const derivedFrom =
      raw.derivedFromApprovedLanguageId === undefined || raw.derivedFromApprovedLanguageId === null
        ? null
        : String(raw.derivedFromApprovedLanguageId);
    const namedTimeframe =
      raw.namedTimeframe === undefined || raw.namedTimeframe === null ? null : String(raw.namedTimeframe).trim() || null;

    const state = await memoryStorageState(getPool());
    if (state !== 'present') {
      const storage = storageOf(state);
      return c.json({ error: storage.sentence, code: 'MIGRATION_PENDING', refusals: [storage.refusal] }, 503);
    }

    const operator = c.get('operator');
    const clearedBy: ActorId = operator?.id ?? 'unknown';
    const clearedAt = nowIso();
    const uid = `own:${randomUUID()}`;
    const contentHash = sha256(body);

    const client = await getPool().connect();
    let expiresAt: Instant;
    let supersededLinked = false;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO marketing_own_statement (
           statement_uid, body, kind, question_key, polarity, named_timeframe, standing,
           supersedes, stated_at, cleared_by, cleared_at, review_due_at,
           derived_from_approved_language_id, content_hash, subjects, claims, quantitative,
           retention_expires_at, recorded_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11::timestamptz,
           $12::timestamptz, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb,
           $9::timestamptz + make_interval(days => $18::int), $10
         )
         RETURNING retention_expires_at`,
        [
          uid, body, kind, questionKeyRaw, polarity, namedTimeframe, standing,
          supersedes, statedAt, clearedBy, clearedAt, reviewDueAt, derivedFrom, contentHash,
          JSON.stringify(subjects), JSON.stringify(claims), JSON.stringify(quantitative),
          ASSUMED_OWN_STATEMENT_RETENTION_DAYS,
        ],
      );
      expiresAt = iso((inserted.rows[0] as { retention_expires_at: Date | string }).retention_expires_at);

      if (supersedes !== null) {
        // BOTH SIDES, OR NEITHER. `standing` moves only from `standing`, so a retracted
        // statement is not quietly relabelled as superseded.
        const linked = await client.query(
          `UPDATE marketing_own_statement
              SET superseded_by = $1,
                  standing = CASE WHEN standing = 'standing' THEN 'superseded' ELSE standing END
            WHERE statement_uid = $2`,
          [uid, supersedes],
        );
        supersededLinked = (linked.rowCount ?? 0) > 0;
        if (!supersededLinked) {
          await client.query('ROLLBACK');
          return c.json(
            {
              error: `supersedes names "${supersedes}", which is not a statement in this index. Nothing was recorded.`,
              code: 'VALIDATION',
            },
            400,
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    const statement: PrecedentStatement = {
      id: uid,
      body,
      kind: kind as StatementKind,
      subjects,
      questionKey: questionKeyRaw as QuestionKey | null,
      polarity: polarity as Polarity,
      namedTimeframe,
      claims: claims as PrecedentStatement['claims'],
      quantitative: quantitative as PrecedentStatement['quantitative'],
      standing: standing as StatementStanding,
      supersedes,
      supersededBy: null,
      statedAt,
      clearedBy,
      clearedAt,
      reviewDueAt,
      derivedFromApprovedLanguageId: derivedFrom,
      contentHash,
    };

    const data: OwnStatementRecorded = {
      storage: storageOf('present'),
      statement,
      refusals: [],
      holdsOnlyOwnWords: PRECEDENT_HOLDS_ONLY_LCX_OWN_WORDS,
      retention: {
        expiresAt,
        assumedDays: ASSUMED_OWN_STATEMENT_RETENTION_DAYS,
        policyResolved: false,
        openQuestion: RETENTION_QUESTION_IS_OPEN,
        sweepImplemented: false,
        sweepNote:
          'This row carries a stated expiry and NOTHING deletes on it: no sweeper reads marketing_own_statement in this compartment today. The 90-day sweep that does run touches marketing_x_reply only. Treat the expiry as a recorded intention, not as an executed retention policy.',
      },
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    console.error('[marketing/memory] record statement error:', err);
    return c.json({ error: 'Failed to record the statement', code: 'MARKETING_ERROR' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §2 THE CRISIS ROOM — vocabulary, and the two routes that need no database    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Annotated by the shared unions, so a rename in `types.ts` is a compile error here.
 * `crisis.ts` publishes `INCIDENT_SEVERITIES` and `RUN_DYNAMIC_INCIDENT_TYPES` but no
 * full type list, and validating against a locally-typed array is the same ratchet
 * `CRISIS_ONLY_REFUSAL_CODES` uses — a value outside the union will not compile.
 */
const INCIDENT_TYPES: readonly IncidentType[] = [
  'outage',
  'security_incident',
  'hack_rumour',
  'depeg',
  'delisting',
  'regulatory_action',
  'peer_contagion',
  'impersonation',
];
const INCIDENT_PHASES: readonly IncidentPhase[] = ['preparation', 'initial', 'maintenance', 'recovery'];
const CLEARANCE_ROLES: readonly ClearanceRole[] = ['reputation', 'policy', 'sme', 'legal'];

const UNKNOWN_IS_NOT_NO =
  'An attribute reading `unknown` means the desk does not know whether LCX shares it, so the answer to "are you like them" is NOT PREPARED. It does not mean the answer is no. Rendering `unknown` as "not applicable" is the exact defect this compartment exists to prevent.';

/**
 * GET /crisis/statements — the versioned holding statements.
 *
 * NEEDS ZERO DATA, AND THAT IS THE CONTRACT. No storage probe, no `migrated` flag and no
 * table read: these are in code, versioned, and readable at 03:00 with an empty database
 * and a pending migration. A surface that renders a migration banner here has defeated
 * the entire point of preclearing the text.
 *
 * Every entry carries its own review state and its INTERNAL brief. The brief is composed
 * by `renderStatementGuidance` from `mustNotSay`, `requiresBeforeUse` and
 * `operatorMustSupply`, so a future editor cannot delete a protection by rewording a
 * paragraph — and this route does not assemble it by hand for the same reason.
 */
marketingMemoryRoutes.get('/crisis/statements', requireOperator, (c) => {
  const asOf = nowIso();
  const nowMs = Date.parse(asOf);

  const entries: CrisisLibraryEntry[] = HOLDING_STATEMENTS.map((statement) => {
    const reviewMs = Date.parse(statement.reviewBy);
    const expired = !Number.isNaN(reviewMs) && nowMs > reviewMs;
    const reviewState = statement.supersededBy !== null ? 'superseded' : expired ? 'expired' : 'current';
    // Seeded from the engine, not counted from a comment: `standingKnown` and
    // `standingNotKnown` are what make a drawn statement already satisfy the tri-slot
    // check, which is the property the whole library exists for.
    const seeded = seedStatementBody(statement, asOf);
    return {
      statement,
      guidance: renderStatementGuidance(statement),
      reviewState,
      seedsKnownCount: seeded.known.length,
      seedsNotKnownCount: seeded.notKnown.length,
      sentence:
        reviewState === 'superseded'
          ? `${statement.id} v${statement.version} was superseded by ${String(statement.supersededBy)} and will not issue.`
          : reviewState === 'expired'
            ? `${statement.id} v${statement.version} was due for review on ${statement.reviewBy.slice(0, 10)} and will not issue until it is reviewed. Write your own words and own them instead.`
            : `${statement.id} v${statement.version} is current until ${statement.reviewBy.slice(0, 10)} and seeds ${seeded.known.length} known and ${seeded.notKnown.length} not-known lines before you add anything.`,
    };
  });

  const ttfsBudgets: TimeToFirstStatementBudget[] = [];
  for (const type of INCIDENT_TYPES) {
    for (const severity of INCIDENT_SEVERITIES) ttfsBudgets.push(ttfsBudget(type, severity));
  }

  const data: CrisisStatementLibrary = {
    asOf,
    libraryVersion: HOLDING_LIBRARY_VERSION,
    entries,
    unpreparedIncidentTypes: unpreparedIncidentTypes(INCIDENT_TYPES),
    ttfsBudgets,
    ttfsBudgetBasis: TTFS_BUDGET_BASIS,
    notCounselReviewed: true,
    notCounselReviewedReason: HOLDING_STATEMENTS_UNREVIEWED_REASON,
    incidentAgnostic: true,
    incidentAgnosticReason: HOLDING_STATEMENTS_INCIDENT_AGNOSTIC_REASON,
    cannotPublish: true,
    handoffReason: CRISIS_ROOM_HANDOFF_REASON,
    preconditionPrompts: HOLDING_PRECONDITION_PROMPT,
    readableWithNoDatabase: true,
  };
  return c.json({ data, meta: meta() });
});

/**
 * GET /crisis/preclears — every peer-contagion answer in ONE call.
 *
 * One call is the requirement and not a convenience: Crypto.com in November 2022 was
 * contagion by shared attribute rather than by exposure, and the window between a peer
 * failing and the question arriving is measured in minutes. An operator paging through
 * eight attributes is an operator answering from memory.
 *
 * `gateContagionAnswer` is called per attribute so the payload says whether each answer
 * would ISSUE right now, and `absent` and `expired` stay different refusals.
 */
marketingMemoryRoutes.get('/crisis/preclears', requireOperator, (c) => {
  const asOf = nowIso();
  const rows: PeerPreclearRow[] = contagionReadiness(asOf).map((readiness) => {
    const gate = gateContagionAnswer(readiness.attribute, asOf);
    return { readiness, preclear: gate.preclear, gate };
  });

  const data: PeerPreclearLibrary = {
    asOf,
    rows,
    applicability: LCX_CONTAGION_APPLICABILITY,
    applicabilityOwner: CONTAGION_APPLICABILITY_OWNER,
    unknownIsNotNo: UNKNOWN_IS_NOT_NO,
    cannotPublish: true,
    handoffReason: CRISIS_ROOM_HANDOFF_REASON,
    readableWithNoDatabase: true,
  };
  return c.json({ data, meta: meta() });
});

/* ── The incident: its row, its clock, and the two ways a clock reads honestly ── */

type IncidentRow = {
  incident_uid: string;
  incident_type: string;
  severity: string;
  phase: string;
  opened_at: Date | string;
  opened_by: string;
  first_statement_at: Date | string | null;
  first_statement_by: string | null;
  first_statement_source: string | null;
  legal_implications: boolean;
  counsel_named: string | null;
};

const INCIDENT_COLUMNS = `incident_uid, incident_type, severity, phase, opened_at, opened_by,
       first_statement_at, first_statement_by, first_statement_source,
       legal_implications, counsel_named`;

async function loadIncident(pool: Pool, uid: string): Promise<IncidentRow | null> {
  const res = await pool.query(
    `SELECT ${INCIDENT_COLUMNS} FROM marketing_crisis_incident WHERE incident_uid = $1`,
    [uid],
  );
  return (res.rows[0] as IncidentRow | undefined) ?? null;
}

const CLOCK_SUPPRESSION_NOTE =
  'This clock cannot be stopped. `validateClockSuppression` exists in the engine and this compartment offers no route that records a suppression, so no reason, no signature and no suppressed interval can be entered — and 0063 carries no column for one. An elapsed figure here is therefore always the whole elapsed figure.';

/**
 * The clock, against its budget. `suppression: null` is passed EXPLICITLY rather than
 * omitted, and the payload says why: a null that means "not supported" and a null that
 * means "nobody suppressed it" are different facts, and only the first is true here.
 */
function clockOf(row: IncidentRow, now: Instant): CrisisClockReading {
  const assessment = assessTimeToFirstStatement({
    incidentType: row.incident_type as IncidentType,
    severity: row.severity as ImpactSeverity,
    openedAt: iso(row.opened_at),
    firstStatementAt: isoOrNull(row.first_statement_at),
    now,
    suppression: null,
  });
  return {
    incidentId: row.incident_uid,
    assessment,
    budgetBasis: TTFS_BUDGET_BASIS,
    suppressionSupported: false,
    suppressionNote: CLOCK_SUPPRESSION_NOTE,
    sentence: assessment.sentence,
  };
}

async function incidentRecord(pool: Pool, row: IncidentRow, now: Instant): Promise<CrisisIncidentRecord> {
  const counted = await pool.query(
    `SELECT count(*)::int AS n FROM marketing_crisis_statement_instance WHERE incident_uid = $1`,
    [row.incident_uid],
  );
  const preclears = holdingStatementsFor(row.incident_type as IncidentType);
  return {
    incidentId: row.incident_uid,
    incidentType: row.incident_type as IncidentType,
    severity: row.severity as ImpactSeverity,
    phase: row.phase as IncidentPhase,
    openedAt: iso(row.opened_at),
    openedBy: row.opened_by,
    firstStatementAt: isoOrNull(row.first_statement_at),
    firstStatementBy: row.first_statement_by,
    firstStatementSource: row.first_statement_source === 'operator_testimony' ? 'operator_testimony' : null,
    legalImplications: row.legal_implications,
    counselNamed: row.counsel_named,
    clock: clockOf(row, now),
    preclearsAvailable: preclears.map((s) => s.id),
    unprepared: preclears.length === 0,
    statementCount: Number(counted.rows[0]?.n ?? 0),
    cannotPublish: true,
    handoffReason: CRISIS_ROOM_HANDOFF_REASON,
  };
}

/**
 * POST /crisis/incident — open an incident. THIS IS WHAT STARTS THE CLOCK.
 *
 * `openedAt` is WHEN THE DESK BECAME AWARE and the caller must state it. It is not
 * defaulted to now, because the two differ by however long it took somebody to open the
 * record and using the insert time would flatter the desk by exactly that amount. An
 * unstated awareness instant is refused with `TTFS_START_NOT_RECORDED` — the clock's own
 * refusal — rather than substituted, since `assessTimeToFirstStatement` would otherwise
 * report `unknown` forever and an unmeasured clock reads as an untroubled one.
 *
 * `legalImplications` and `counselNamed` are the desk's ASSERTIONS. Nothing infers "this
 * is legally sensitive" from text: that inference is the judgement a machine should not
 * be making, and CERC keeps legal out of the clearance path unless a human puts it there.
 */
marketingMemoryRoutes.post('/crisis/incident', requireOperator, async (c) => {
  try {
    const raw = await c.req.json<Record<string, unknown>>();

    const incidentType = String(raw.incidentType ?? '');
    if (!INCIDENT_TYPES.includes(incidentType as IncidentType)) {
      return c.json({ error: `incidentType must be one of: ${INCIDENT_TYPES.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const severity = String(raw.severity ?? '');
    if (!INCIDENT_SEVERITIES.includes(severity as ImpactSeverity)) {
      return c.json({ error: `severity must be one of: ${INCIDENT_SEVERITIES.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const phase = String(raw.phase ?? 'initial');
    if (!INCIDENT_PHASES.includes(phase as IncidentPhase)) {
      return c.json({ error: `phase must be one of: ${INCIDENT_PHASES.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const openedAt = parseInstant(raw.openedAt);
    if (openedAt === null) {
      return c.json(
        {
          error: 'openedAt is required: the instant the DESK BECAME AWARE, ISO-8601.',
          code: REFUSED,
          refusals: [
            refuse(
              'TTFS_START_NOT_RECORDED',
              'This incident has no recorded awareness instant, so time to first statement cannot be computed. That is not "on target" — it is unmeasured, and an unmeasured clock reads as an untroubled one. State when the desk became aware; it is not the same instant as when this record was opened.',
              DESK_POLICY(
                'crisis.clock_start',
                'The clock starts when the desk became aware, stated by the operator. Defaulting it to the insert time flatters the desk by however long it took somebody to open the record.',
              ),
              { kind: 'supply_data', missing: 'the instant the desk became aware of the incident', whoCanSupply: 'the operator opening the incident' },
              typeof raw.openedAt === 'string' ? raw.openedAt : null,
              CRISIS_RULESET_VERSION,
            ),
          ],
        },
        422,
      );
    }
    const counselNamed = raw.counselNamed === undefined || raw.counselNamed === null ? null : String(raw.counselNamed).trim() || null;
    const legalImplications = raw.legalImplications === true;

    const state = await memoryStorageState(getPool());
    if (state !== 'present') {
      const storage = storageOf(state);
      return c.json({ error: storage.sentence, code: 'MIGRATION_PENDING', refusals: [storage.refusal] }, 503);
    }

    const operator = c.get('operator');
    const uid = `inc:${randomUUID()}`;
    const pool = getPool();
    await pool.query(
      `INSERT INTO marketing_crisis_incident (
         incident_uid, incident_type, severity, phase, opened_at, opened_by,
         legal_implications, counsel_named
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8)`,
      [uid, incidentType, severity, phase, openedAt, operator?.id ?? 'unknown', legalImplications, counselNamed],
    );

    const row = await loadIncident(pool, uid);
    if (row === null) {
      return c.json({ error: 'The incident was written and could not be read back', code: 'MARKETING_ERROR' }, 500);
    }
    const data: CrisisIncidentOpened = {
      storage: storageOf('present'),
      incident: await incidentRecord(pool, row, nowIso()),
      refusals: [],
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    console.error('[marketing/memory] open incident error:', err);
    return c.json({ error: 'Failed to open the incident', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * GET /crisis/incident/:id/clock — the clock against its budget.
 *
 * The one metric on this surface that is honestly measurable with no X credential,
 * because both endpoints are the desk's own records. `overdue` is the loudest state and
 * `unknown` is never rendered as a tick.
 */
marketingMemoryRoutes.get('/crisis/incident/:id/clock', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const state = await memoryStorageState(getPool());
    if (state !== 'present') {
      const storage = storageOf(state);
      // A read, so 200 with a well-shaped body and the storage refusal — the page shows
      // its banner. `incident: null` is not an incident with a stopped clock.
      const data: CrisisIncidentOpened = { storage, incident: null, refusals: [storage.refusal as Refusal] };
      return c.json({ data, meta: meta() });
    }
    const row = await loadIncident(getPool(), id);
    if (row === null) return c.json({ error: 'incident not found', code: 'NOT_FOUND' }, 404);
    const data: CrisisClockReading = clockOf(row, nowIso());
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[marketing/memory] clock error:', err);
    return c.json({ error: 'Failed to read the clock', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * POST /crisis/incident/:id/first-statement — TESTIMONY, NOT A PUBLISH BUTTON.
 *
 * A named human asserts they published a statement by hand, outside this system, at a
 * stated instant. Nothing here posts, holds a credential or acts as the LCX account, and
 * `notAPublishPath: true` is on the payload so a surface can say so rather than leave the
 * absence to be inferred. It is the same shape of assertion as
 * `POST /v1/marketing/draft/:id/sent`.
 *
 * IT IS ALSO THE ONLY WAY THE CLOCK CAN STOP BURNING, which is why it exists at all: with
 * no route to record the first statement, `assessTimeToFirstStatement` would report
 * `running` then `overdue` forever and the desk's headline metric would be permanently
 * unfinishable.
 *
 * FIRST ASSERTION WINS. A second one answers 409 rather than overwriting: testimony that
 * can be silently replaced is not testimony, and the first statement's time is the number
 * every breach is measured against.
 */
marketingMemoryRoutes.post('/crisis/incident/:id/first-statement', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const raw = await c.req.json<Record<string, unknown>>();
    const publishedAt = parseInstant(raw.publishedAt);
    if (publishedAt === null) {
      return c.json({ error: 'publishedAt must be a parseable ISO-8601 instant: when the human actually published', code: 'VALIDATION' }, 400);
    }
    const instanceId = raw.instanceId === undefined || raw.instanceId === null ? null : String(raw.instanceId).trim() || null;

    const state = await memoryStorageState(getPool());
    if (state !== 'present') {
      const storage = storageOf(state);
      return c.json({ error: storage.sentence, code: 'MIGRATION_PENDING', refusals: [storage.refusal] }, 503);
    }

    const pool = getPool();
    const existing = await loadIncident(pool, id);
    if (existing === null) return c.json({ error: 'incident not found', code: 'NOT_FOUND' }, 404);
    if (Date.parse(publishedAt) < Date.parse(iso(existing.opened_at))) {
      return c.json(
        {
          error: `publishedAt (${publishedAt}) is before the desk became aware (${iso(existing.opened_at)}). One of the two instants is wrong, and guessing which would produce a negative elapsed time reported as speed.`,
          code: 'VALIDATION',
        },
        400,
      );
    }

    const operator = c.get('operator');
    const assertedBy: ActorId = operator?.id ?? 'unknown';
    const updated = await pool.query(
      `UPDATE marketing_crisis_incident
          SET first_statement_at = $2::timestamptz,
              first_statement_by = $3,
              first_statement_source = 'operator_testimony'
        WHERE incident_uid = $1 AND first_statement_at IS NULL`,
      [id, publishedAt, assertedBy],
    );
    if ((updated.rowCount ?? 0) === 0) {
      return c.json(
        {
          error: 'A first statement has already been asserted for this incident. Testimony is not overwritten; record a later statement as its own instance.',
          code: 'CONFLICT',
        },
        409,
      );
    }

    const row = await loadIncident(pool, id);
    const now = nowIso();
    const data: CrisisFirstStatementRecorded = {
      storage: storageOf('present'),
      incident: row === null ? null : await incidentRecord(pool, row, now),
      testimony: { assertedBy, publishedAt, instanceId, source: 'operator_testimony' },
      notAPublishPath: true,
      sentence: `${assertedBy} asserts a first statement was published by hand at ${publishedAt}. This system did not publish it, cannot verify it, and holds no credential that could.`,
      refusals: [],
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    console.error('[marketing/memory] first-statement error:', err);
    return c.json({ error: 'Failed to record the testimony', code: 'MARKETING_ERROR' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 THE STATEMENT INSTANCE, AND THE THREE PARALLEL CLEARS                    */
/* ══════════════════════════════════════════════════════════════════════════ */

type InstanceRow = {
  instance_uid: string;
  incident_uid: string;
  seq: number;
  statement_id: string | null;
  statement_version: number | null;
  library_version: number;
  ad_hoc: boolean;
  authored_by: string;
  authored_at: Date | string;
  phase: string;
  body: unknown;
  content_hash: string;
  preconditions_acknowledged: string[] | null;
  carries_promotional_content: boolean;
  is_inside_information_disclosure: boolean;
  residual_unknowns_closed: unknown;
  supersedes: string | null;
};

const INSTANCE_COLUMNS = `instance_uid, incident_uid, seq, statement_id, statement_version,
       library_version, ad_hoc, authored_by, authored_at, phase, body, content_hash,
       preconditions_acknowledged, carries_promotional_content,
       is_inside_information_disclosure, residual_unknowns_closed, supersedes`;

type ClearanceRow = {
  role: string;
  mode: string;
  reviewer: string;
  cleared_at: Date | string;
  headline_test: boolean;
  content_hash: string;
  comment: string | null;
};

/**
 * Loaded UNORDERED on purpose. `assessClearance` takes a SET and reads no position in a
 * sequence, so no order of arrival can change the outcome — the property a test asserts
 * by permuting the input. An `ORDER BY cleared_at` here would be harmless today and would
 * be the first step back towards a serial chain, which is what makes a regulated desk
 * structurally too slow to matter in a crisis.
 */
async function loadClearances(pool: Pool, instanceUid: string): Promise<readonly Clearance[]> {
  const res = await pool.query(
    `SELECT role, mode, reviewer, cleared_at, headline_test, content_hash, comment
       FROM marketing_crisis_clearance WHERE instance_uid = $1`,
    [instanceUid],
  );
  return (res.rows as ClearanceRow[]).map((row) => ({
    role: row.role as ClearanceRole,
    mode: row.mode as Clearance['mode'],
    reviewer: row.reviewer,
    at: iso(row.cleared_at),
    headlineTest: row.headline_test,
    contentHash: row.content_hash,
    comment: row.comment,
  }));
}

/** The stored row, back into the draft the engines assess. No field is re-derived. */
function draftFrom(row: InstanceRow, incident: IncidentRow): CrisisStatementDraft {
  const body = (row.body ?? {}) as StatementBody;
  const residual = row.residual_unknowns_closed as
    | { assertedBy: ActorId; basis: string }
    | null
    | undefined;
  return {
    incidentId: row.incident_uid,
    incidentType: incident.incident_type as IncidentType,
    phase: row.phase as IncidentPhase,
    severity: incident.severity as ImpactSeverity,
    seq: row.seq,
    body,
    statementId: row.statement_id as HoldingStatementId | null,
    statementVersion: row.statement_version,
    adHoc: row.ad_hoc,
    authoredBy: row.authored_by,
    residualUnknownsClosed: residual ?? null,
    // Bases are the reassurance-citation axis and 0063 carries no column for them: the
    // reassurance scan is `assessReassurance`'s and this router does not run it, so
    // claiming an empty basis list were a recorded fact would be worse than the gap.
    bases: [],
    preconditionsAcknowledged: (row.preconditions_acknowledged ?? []) as readonly HoldingPrecondition[],
    carriesPromotionalContent: row.carries_promotional_content,
    isInsideInformationDisclosure: row.is_inside_information_disclosure,
    contentHash: row.content_hash,
    supersedes: row.supersedes,
  };
}

/**
 * The board. `FOUR_EYES_UNACHIEVABLE` IS HOISTED TO ITS OWN FIELD and also left inside
 * `assessment.refusals`.
 *
 * A route that returned only `allBlockingHeld` would swallow it: one person holding all
 * three lanes produces three `held` lanes and `allBlockingHeld: true`, so the board would
 * render three green ticks over a record the engine itself calls actively misleading. It
 * is a STATED FACT here, and it is not recoverable — no configuration turns one human
 * into three independent clears.
 */
function boardFor(
  row: InstanceRow,
  clearances: readonly Clearance[],
  legalImplications: boolean,
): ClearanceBoard {
  const assessment = assessClearance({
    contentHash: row.content_hash,
    authoredBy: row.authored_by,
    authoredAt: iso(row.authored_at),
    clearances,
    legalImplications,
  });
  const fourEyes = assessment.refusals.find((r) => r.code === 'FOUR_EYES_UNACHIEVABLE') ?? null;
  const blockingRoles: ClearanceRole[] = legalImplications
    ? [...CRISIS_BLOCKING_CLEARANCES, 'legal']
    : [...CRISIS_BLOCKING_CLEARANCES];

  const outstanding = assessment.lanes.filter((l) => l.required && l.state !== 'held').map((l) => l.role);
  const sentence = assessment.allBlockingHeld
    ? `Every required lane is held by ${assessment.distinctReviewers} distinct reviewer${assessment.distinctReviewers === 1 ? '' : 's'}. Holding the clears does not authorise publication: a named human still has to post the text by hand.${fourEyes === null ? '' : ' ' + fourEyes.sentence}`
    : `${outstanding.length} required lane${outstanding.length === 1 ? '' : 's'} not held (${outstanding.join(', ')}). The three blocking lanes are gathered in parallel — none of them waits for another.`;

  return {
    instanceId: row.instance_uid,
    contentHash: row.content_hash,
    assessment,
    fourEyesUnachievable: fourEyes,
    recorded: clearances,
    blockingRoles,
    headlineTestQuestion: CLEARANCE_HEADLINE_TEST_QUESTION,
    cannotPublish: true,
    sentence,
    /*
     * NULL, AND NULL MEANS "NOT CHECKED IN THIS RESPONSE" — never "clear".
     *
     * `boardFor` recomputes the board from stored rows and runs no gate: it is called from
     * two reads and from the clearance write, and re-running two engines plus two register
     * loads on every board read would put a database round trip behind a recompute that is
     * otherwise pure. The clearance route, which DOES gate, overwrites this field with its
     * own verdict. The type is nullable rather than optional so a surface has to decide
     * what to render here rather than reading `undefined` as absence of a problem.
     */
    outboundGate: null,
  };
}

async function instancePayload(
  pool: Pool,
  row: InstanceRow,
  incident: IncidentRow,
  now: Instant,
  refusals: readonly Refusal[] = [],
): Promise<CrisisStatementInstance> {
  const draft = draftFrom(row, incident);
  const clearances = await loadClearances(pool, row.instance_uid);
  return {
    storage: storageOf('present'),
    instanceId: row.instance_uid,
    incidentId: row.incident_uid,
    seq: row.seq,
    statementId: row.statement_id as HoldingStatementId | null,
    statementVersion: row.statement_version,
    libraryVersion: row.library_version,
    adHoc: row.ad_hoc,
    authoredBy: row.authored_by,
    authoredAt: iso(row.authored_at),
    phase: row.phase as IncidentPhase,
    body: draft.body,
    renderedText: renderStatementText(draft.body),
    contentHash: row.content_hash,
    // RECOMPUTED, never read back from `complete_at_compose`: a `nextUpdateBy` that was
    // in the future at composition is in the past an hour later, and a cached verdict
    // would report a breached commitment as complete.
    completeness: assessStatementCompleteness(draft, now),
    clearance: boardFor(row, clearances, incident.legal_implications),
    clock: clockOf(incident, now),
    preconditionsAcknowledged: draft.preconditionsAcknowledged,
    carriesPromotionalContent: row.carries_promotional_content,
    isInsideInformationDisclosure: row.is_inside_information_disclosure,
    supersedes: row.supersedes,
    notCounselReviewedReason: HOLDING_STATEMENTS_UNREVIEWED_REASON,
    cannotPublish: true,
    handoffReason: CRISIS_ROOM_HANDOFF_REASON,
    refusals,
    // Null on every READ. The compose route spreads its own verdict over this field; a
    // GET re-reads a row and gates nothing, and saying so is the point of the field.
    outboundGate: null,
  };
}

const usableLines = (value: unknown): string[] =>
  asArray<unknown>(value)
    .filter((line): line is string => typeof line === 'string' && line.trim() !== '')
    .map((line) => line.trim());

async function loadInstance(pool: Pool, uid: string): Promise<InstanceRow | null> {
  const res = await pool.query(
    `SELECT ${INSTANCE_COLUMNS} FROM marketing_crisis_statement_instance WHERE instance_uid = $1`,
    [uid],
  );
  return (res.rows[0] as InstanceRow | undefined) ?? null;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  THE OUTBOUND GATE, ON THE TWO CRISIS PATHS THAT NEED IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ══ WHY COMPLETENESS IS NOT ENOUGH ══
 * `assessStatementCompleteness` asks one question — is the tri-slot structure honest —
 * and it is the right gate for the failure it was written for ("FTX is fine. Assets are
 * fine", no not-known column, pleaded as fraud in SEC v. Bankman-Fried ¶78). It does not
 * read the words for a regulated promise, and it CANNOT see the state the words sit in.
 * A structurally complete incident statement that says "withdrawals resume within 24
 * hours" is a regulated promise, and one that names an asset the author holds or that sat
 * in `mnpi_pending` is MiCA Art 90/91(3)(c) — neither visible in the prose. So both
 * engines run through `marketing/outboundGate.ts`, which fails closed: an unattested
 * embargo register REFUSES rather than passing text it could not check.
 *
 * ══ THIS IS STILL NOT A PUBLISH PATH ══
 * The gate decides whether text may be handed to a human, and nothing here hands it to X.
 * Every payload keeps `cannotPublish: true`, and a cleared gate verdict is one more thing
 * that must be true before a named human pastes it by hand, never a substitute for one.
 *
 * ══ ONE HELPER, TWO CALLERS, SO THE INPUTS CANNOT DRIFT ══
 * Composition and clearance must gate the SAME bytes under the SAME verb, channel and
 * intents, or the second check answers a different question from the first and "cleared at
 * compose, refused at clearance" stops being information about the perimeter.
 */

/**
 * `verb: 'original'` and `channel: 'x_public'`, and neither is a default worth hiding.
 *
 * A crisis statement is the desk's OWN words — not a reply, not a quote — so `original` is
 * the only honest verb, and it is also the one that maps to the `promotional` intent by
 * default, which is the Art 88(1) limb. `x_public` is the conservative channel: it is the
 * only one `isPublicTimeline` treats as a public timeline, so the strictest rules apply. A
 * statement destined for a web page would be checked MORE harshly than it needs to be,
 * which errs in the survivable direction.
 *
 * INTENTS ARE READ OFF THE OPERATOR'S OWN TWO FLAGS rather than defaulted from the verb.
 * `isInsideInformationDisclosure` is never inferred — nothing in the text says whether the
 * desk is the vehicle for a public disclosure — so the caller's assertion is the only
 * source, exactly as `OutboundGateRequest.intents` documents. `factual_service_notice` is
 * the floor when neither flag is set: a holding statement claiming nothing promotional is
 * a service notice, and pretending it is promotional would fire Art 88(1) on text that
 * does not combine anything.
 */
function crisisIntents(
  carriesPromotionalContent: boolean,
  isInsideInformationDisclosure: boolean,
): readonly ArtefactIntent[] {
  const intents: ArtefactIntent[] = [];
  if (isInsideInformationDisclosure) intents.push('inside_information_disclosure');
  if (carriesPromotionalContent) intents.push('promotional');
  if (intents.length === 0) intents.push('factual_service_notice');
  return intents;
}

/**
 * THE DESK'S WORDS — every string a human typed into this statement, and nothing else.
 *
 * ══ WHY NOT `renderStatementText(body)` ══
 * That was the first implementation and it refused EVERY crisis statement. Measured, not
 * reasoned about: `renderStatementText` frames the tri-slot with its own headers, and
 * `extractNamedAssets` is `[A-Z][A-Z0-9]{1,19}` over the raw string, so
 * `WHAT WE KNOW / WHAT WE DO NOT YET KNOW / WHAT HAPPENS NEXT` extracted six symbols —
 * WHAT, KNOW, DO, YET, HAPPENS, NEXT — and each one produced `EMBARGO_REGISTER_ABSENT`
 * plus `HOLDINGS_DECLARATION_MISSING` against an unattested register. The rendered
 * `Next update by <ISO instant>` line then added `UNSOURCED_FIGURE` on the timestamp's
 * digits. Twelve refusals and one unsourced figure on a statement containing no claim and
 * naming no asset.
 *
 * A GATE THAT ALWAYS REFUSES IS NOT A CONSERVATIVE GATE. The over-inclusive extraction in
 * `outboundGate.ts` is correct and stays: a token that is not really a ticker costs one
 * lookup that resolves to `unknown`, and unknown refuses. That argument holds for a RARE
 * false positive. A guaranteed refusal on every statement is a different thing — it teaches
 * the operator that the gate is noise, at 02:00, which is the moment this compartment
 * exists for. The fix is not to widen `NOT_TICKERS` with WHAT/DO/NEXT either: every entry
 * there is a symbol the gate stops checking, so a wrong one is a hole, and `NEXT` and `DO`
 * are perfectly plausible token names.
 *
 * ══ WHAT IS GATED, AND WHAT IS NOT ══
 * Gated: `known`, `notKnown`, `nextStep.action`, `empathy`, `withheld.what` and
 * `withheld.whyNotReleasable`. Those are the only fields an operator writes, and any
 * regulated promise, invented licence or named asset in this statement is in one of them.
 * NOT gated: the section headers and the `Next update by` line, which are constants and a
 * timestamp emitted by `crisis.ts` — neither is a claim, and neither is anybody's words.
 *
 * ══ THE CONSEQUENCE, STATED RATHER THAN HIDDEN ══
 * The bytes a human publishes are the RENDERED ones, so the gate reads a subset of what
 * goes out. What is excluded is fixed text this repository controls, and the exclusion is
 * one function so it cannot drift per caller. `content_hash` on the instance stays over the
 * RENDERED text — that is what the clearances bind to and what a reviewer read — while the
 * gate ledger's `text_sha256` is over these words. Two hashes because they answer two
 * questions, and neither is presented as the other.
 */
function operatorWordsOf(body: StatementBody): string {
  return [
    ...body.known,
    ...body.notKnown,
    body.nextStep.action,
    body.empathy ?? '',
    body.withheld?.what ?? '',
    body.withheld?.whyNotReleasable ?? '',
  ].map((s) => s.trim()).filter((s) => s !== '').join('\n');
}

/**
 * Run the gate and record the verdict. Returns the wire projection AND the refusals, so a
 * caller can fold them into its own refusal list rather than inventing a second sentence.
 *
 * BOTH OUTCOMES ARE RECORDED, before the caller branches. A ledger holding only refusals
 * cannot tell "the gate cleared this" from "the gate never ran", and "it was checked and
 * cleared" is precisely the claim the desk would have to defend under Art 8(2).
 *
 * `recordGateDecision` never throws and returns `false` while 0062 is pending; that answer
 * travels to the caller as `recordedInLedger` instead of being swallowed, because a gate
 * that ran and a gate whose verdict survived are different facts.
 *
 * `replyId: null` — a crisis statement is not an answer to an inbound row. 0062's column
 * is nullable for exactly this case; inventing an id would attach the verdict to somebody
 * else's reply.
 */
async function gateCrisisStatement(
  pool: Pool,
  input: {
    readonly text: string;
    readonly actor: ActorId;
    readonly phase: 'draft' | 'clearance';
    readonly carriesPromotionalContent: boolean;
    readonly isInsideInformationDisclosure: boolean;
    readonly now: Instant;
  },
): Promise<{ verdict: CrisisOutboundGateVerdict; refusals: readonly Refusal[] }> {
  const gate = await gateOutboundText(pool, {
    text: input.text,
    verb: 'original',
    channel: 'x_public',
    actor: input.actor,
    phase: input.phase,
    intents: crisisIntents(input.carriesPromotionalContent, input.isInsideInformationDisclosure),
    now: input.now,
  });
  const recordedInLedger = await recordGateDecision(pool, {
    replyId: null,
    verdict: gate,
    actor: input.actor,
    phase: input.phase,
    text: input.text,
  });
  return {
    verdict: {
      allowed: gate.allowed,
      disposition: gate.disposition,
      refusalCodes: gate.refusals.map((r) => r.code),
      blockingRules: gate.blockingViolations.map((v) => v.rule),
      // The non-blocking findings, on the allowed path too. The engines compute these and
      // a payload that dropped them would let a statement carrying
      // `art_88_1.disclosure_artefact_must_stay_clean` reach the room looking spotless.
      warningRules: gate.violations.filter((v) => v.severity === 'warning').map((v) => v.rule),
      assetsExtracted: gate.assetsExtracted,
      extractionCaveat: gate.extractionCaveat,
      gateError: gate.gateError,
      recordedInLedger,
      phase: input.phase,
    },
    refusals: gate.refusals,
  };
}

/** The path segment that means "my own words, and I own them". */
const AD_HOC_KEY = 'ad-hoc';

/**
 * POST /crisis/statements/:key/instance — COMPOSE, AND GET THE COMPLETENESS VERDICT.
 *
 * `:key` is a `HoldingStatementId` or the literal `ad-hoc`.
 *
 * ══ AN EMPTY notKnown REFUSES, AND NOTHING IS STORED ══
 * `assessStatementCompleteness` is the gate and this route does not second-guess it. A
 * statement with nothing in the not-known column is, by CERC's own logic, either
 * speculation or over-reassurance — there is no third thing it can be during a live
 * incident. "FTX is fine. Assets are fine" had no not-known column at all and is pleaded
 * as fraud in SEC v. Bankman-Fried ¶78. So the refusal is a 422 with the engine's own
 * sentences and NO ROW: a refused statement left in the table is a statement a surface
 * can serve while the refusal sits somewhere else.
 *
 * ══ WHY A PRECLEAR ALREADY PASSES ══
 * `seedStatementBody` fills both columns from `standingKnown`/`standingNotKnown` — lines
 * written to be true whether or not the incident is real. So drawing from the library
 * yields a statement that ALREADY satisfies the tri-slot check, and the operator's job at
 * 02:00 is to add specifics to something complete rather than compose something complete
 * under pressure. Operator lines are APPENDED to the seed, never substituted for it.
 *
 * ══ WHAT IS NOT GATED HERE, STATED PLAINLY ══
 * `activateCrisisStatement` — the full nine-gate hard gate — is NOT called, because its
 * last gate is `desk_permits_handoff` and that needs a `DeskMode` this compartment cannot
 * read (see the file header). Three of its gates are enforced here against the engine's
 * own data and with its own refusal codes: the library statement must resolve, be current,
 * and match the incident type; and its preconditions must be acknowledged. The reassurance
 * scan and the desk-mode gate are absent, and no comment here may imply otherwise.
 */
marketingMemoryRoutes.post('/crisis/statements/:key/instance', requireOperator, async (c) => {
  try {
    const key = c.req.param('key');
    const raw = await c.req.json<Record<string, unknown>>();
    const incidentId = String(raw.incidentId ?? '').trim();
    if (incidentId === '') {
      return c.json({ error: 'incidentId is required: a statement belongs to an incident', code: 'VALIDATION' }, 400);
    }
    const nextUpdateBy = parseInstant(raw.nextUpdateBy);
    if (nextUpdateBy === null) {
      return c.json({ error: 'nextUpdateBy must be a parseable ISO-8601 instant', code: 'VALIDATION' }, 400);
    }

    const adHoc = key === AD_HOC_KEY;
    const statement = adHoc ? null : getHoldingStatement(key as HoldingStatementId);
    const now = nowIso();

    if (!adHoc && statement === null) {
      return c.json(
        {
          error: `"${key}" is not a statement in the precleared library.`,
          code: REFUSED,
          refusals: [
            refuse(
              'HOLDING_STATEMENT_UNKNOWN',
              `"${key}" is not a statement in the precleared library. An id that resolves to nothing is not a plausible id — the record would claim a preclear was used when none was. Use ${AD_HOC_KEY} and own the words instead.`,
              DESK_POLICY(
                'crisis.preclear_integrity',
                'A recorded statement id must resolve to library text at the version recorded, or the record cannot be reproduced.',
              ),
              { kind: 'supply_data', missing: `a valid statement id, or "${AD_HOC_KEY}"`, whoCanSupply: 'the operator' },
              key,
              CRISIS_RULESET_VERSION,
            ),
          ],
        },
        422,
      );
    }

    const preconditions = usableLines(raw.preconditionsAcknowledged).filter((p): p is HoldingPrecondition =>
      (HOLDING_PRECONDITIONS as readonly string[]).includes(p),
    ) as HoldingPrecondition[];
    const carriesPromotionalContent = raw.carriesPromotionalContent === true;
    const isInsideInformationDisclosure = raw.isInsideInformationDisclosure === true;

    const state = await memoryStorageState(getPool());
    if (state !== 'present') {
      const storage = storageOf(state);
      return c.json({ error: storage.sentence, code: 'MIGRATION_PENDING', refusals: [storage.refusal] }, 503);
    }
    const pool = getPool();
    const incident = await loadIncident(pool, incidentId);
    if (incident === null) return c.json({ error: 'incident not found', code: 'NOT_FOUND' }, 404);

    const refusals: Refusal[] = [];

    if (statement !== null) {
      if (statement.supersededBy !== null) {
        refusals.push(
          refuse(
            'HOLDING_STATEMENT_SUPERSEDED',
            `${statement.id} has been superseded by ${statement.supersededBy}. Using superseded text is how two versions of the desk's position end up in public at the same time.`,
            DESK_POLICY('crisis.preclear_integrity', 'Superseded library text does not issue.'),
            { kind: 'supply_data', missing: `the replacement statement ${statement.supersededBy}`, whoCanSupply: 'the operator' },
            statement.supersededBy,
            CRISIS_RULESET_VERSION,
          ),
        );
      }
      const reviewMs = Date.parse(statement.reviewBy);
      if (!Number.isNaN(reviewMs) && Date.parse(now) > reviewMs) {
        refusals.push(
          refuse(
            'HOLDING_STATEMENT_EXPIRED',
            `${statement.id} v${statement.version} was due for review on ${statement.reviewBy.slice(0, 10)} and has not been reviewed. It will not issue, and this refusal cannot be overridden: unreviewed holding text confidently deployed after the world has changed is the artefact that turns one incident into two. Write your own words and own them — that records as ad hoc.`,
            DESK_POLICY('crisis.preclear_integrity', 'Library text past its review date does not issue.'),
            { kind: 'human_authority', role: statement.escalateTo },
            statement.reviewBy,
            CRISIS_RULESET_VERSION,
          ),
        );
      }
      if (!statement.incidentTypes.includes(incident.incident_type as IncidentType)) {
        refusals.push(
          refuse(
            'HOLDING_STATEMENT_TYPE_MISMATCH',
            `${statement.id} is written for ${statement.incidentTypes.join(', ')} and this incident is a ${incident.incident_type}. Text written for another kind of incident reads as a template somebody forgot to change.`,
            DESK_POLICY('crisis.preclear_integrity', 'A preclear issues only for the incident types it was written for.'),
            { kind: 'supply_data', missing: 'a statement written for this incident type', whoCanSupply: 'the operator' },
            statement.id,
            CRISIS_RULESET_VERSION,
          ),
        );
      }
      const missing = statement.requiresBeforeUse.filter((p) => !preconditions.includes(p));
      if (missing.length > 0) {
        refusals.push(
          refuse(
            'PRECONDITION_NOT_ACKNOWLEDGED',
            `${missing.length} precondition${missing.length === 1 ? '' : 's'} for ${statement.id} ${missing.length === 1 ? 'has' : 'have'} not been acknowledged: ${missing.map((p) => HOLDING_PRECONDITION_PROMPT[p]).join(' ')} None of them is checked for you — this instrument cannot know whether security looked at the exploit or treasury looked at the balances, only whether a named human says they did.`,
            CERC(
              'Crisis Communication Plans — before release',
              'Provide only information that has been approved and cleared by the appropriate channels.',
            ),
            { kind: 'human_authority', role: statement.escalateTo },
            missing.join(', '),
            CRISIS_RULESET_VERSION,
          ),
        );
      }
    }

    if (adHoc && (c.get('operator')?.id ?? '') === '') {
      refusals.push(
        refuse(
          'AD_HOC_WITHOUT_NAMED_OWNER',
          'An ad hoc statement needs a named owner. The escape hatch from the library does not lower any bar; it puts a person\'s name on the words instead of the library\'s.',
          DESK_POLICY('crisis.ad_hoc_owner', 'Ad hoc text is owned by the human who wrote it, by name.'),
          { kind: 'supply_data', missing: 'an authenticated author', whoCanSupply: 'the operator' },
          null,
          CRISIS_RULESET_VERSION,
        ),
      );
    }

    if (carriesPromotionalContent && isInsideInformationDisclosure) {
      refusals.push(
        refuse(
          'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING',
          'This statement is marked both as an inside-information disclosure and as carrying promotional content. MiCA Art 88(1) says the two shall not be combined, and the resolution is two adjacent artefacts, never one blended one.',
          DESK_POLICY('crisis.art_88_1_split', 'A disclosure and a marketing communication are separate artefacts.'),
          { kind: 'edit_text', what: 'Split the promotional sentence out into its own communication.' },
          null,
          CRISIS_RULESET_VERSION,
        ),
      );
    }

    const seeded = statement === null ? null : seedStatementBody(statement, nextUpdateBy);
    const suppliedAction = typeof raw.nextStepAction === 'string' ? raw.nextStepAction.trim() : '';
    const withheldWhat = typeof raw.withheldWhat === 'string' ? raw.withheldWhat.trim() : '';
    const withheldWhy = typeof raw.withheldWhyNotReleasable === 'string' ? raw.withheldWhyNotReleasable.trim() : '';
    const body: StatementBody = {
      known: [...(seeded?.known ?? []), ...usableLines(raw.known)],
      notKnown: [...(seeded?.notKnown ?? []), ...usableLines(raw.notKnown)],
      nextStep: { action: suppliedAction !== '' ? suppliedAction : (seeded?.nextStep.action ?? ''), nextUpdateBy },
      empathy: typeof raw.empathy === 'string' && raw.empathy.trim() !== '' ? raw.empathy.trim() : null,
      // A withheld entry with no reason is refused by the engine, not silently dropped:
      // announcing a secret and refusing to explain it costs more credibility than not
      // mentioning it. So an incomplete pair is passed through AS the operator wrote it.
      withheld: withheldWhat === '' && withheldWhy === '' ? null : { what: withheldWhat, whyNotReleasable: withheldWhy },
    };

    const phase = INCIDENT_PHASES.includes(String(raw.phase ?? '') as IncidentPhase)
      ? (String(raw.phase) as IncidentPhase)
      : (incident.phase as IncidentPhase);
    const residualRaw = raw.residualUnknownsClosed as { assertedBy?: unknown; basis?: unknown } | null | undefined;
    const residual =
      residualRaw != null && typeof residualRaw.assertedBy === 'string' && typeof residualRaw.basis === 'string'
        ? { assertedBy: residualRaw.assertedBy, basis: residualRaw.basis }
        : null;

    const authoredBy: ActorId = c.get('operator')?.id ?? 'unknown';
    const contentHash = sha256(renderStatementText(body));
    const draft: CrisisStatementDraft = {
      incidentId,
      incidentType: incident.incident_type as IncidentType,
      phase,
      severity: incident.severity as ImpactSeverity,
      seq: 0, // Assigned by the database on insert; not part of the completeness check.
      body,
      statementId: statement?.id ?? null,
      statementVersion: statement?.version ?? null,
      adHoc,
      authoredBy,
      residualUnknownsClosed: residual,
      bases: [],
      preconditionsAcknowledged: preconditions,
      carriesPromotionalContent,
      isInsideInformationDisclosure,
      contentHash,
      supersedes: typeof raw.supersedes === 'string' && raw.supersedes.trim() !== '' ? raw.supersedes.trim() : null,
    };

    const completeness = assessStatementCompleteness(draft, now);

    /*
     * THE OUTBOUND GATE RUNS BEFORE THE INSERT, over `operatorWordsOf(body)` — the desk's
     * own lines, for the reason measured and written out at that function.
     *
     * It runs even when `refusals` is already non-empty. Gating only the otherwise-clean
     * path would mean the one statement the desk is most likely to edit and resubmit is
     * the one whose words were never read, and the ledger would hold no row for the
     * attempt at all.
     */
    const gate = await gateCrisisStatement(pool, {
      text: operatorWordsOf(body),
      actor: authoredBy,
      phase: 'draft',
      carriesPromotionalContent,
      isInsideInformationDisclosure,
      now,
    });

    const allRefusals = [...refusals, ...completeness.refusals, ...gate.refusals];
    /*
     * `!gate.verdict.allowed` IS ITS OWN CONDITION, not folded into the refusal count.
     * Both engines can block on an ERROR-severity violation with an EMPTY refusal list —
     * `deal_closing.invitation_to_transact`, `claim.requires_human_review` — and reading
     * the length alone is exactly how a blocked verdict was once recorded as cleared.
     */
    if (allRefusals.length > 0 || !gate.verdict.allowed) {
      return c.json(
        {
          error: 'This statement was refused and has NOT been recorded.',
          code: REFUSED,
          refusals: allRefusals,
          completeness,
          // The gate's non-refusing blockers, so a 422 with an empty `refusals` array
          // still says what stopped it.
          outboundGate: gate.verdict,
          renderedText: renderStatementText(body),
        },
        422,
      );
    }

    const uid = `stmt:${randomUUID()}`;
    try {
      // `seq` is assigned BY THE DATABASE in the same statement, so two composers cannot
      // read the same max and both write 3. The row is read back below rather than
      // returned from here: the payload's every figure comes from the stored row.
      await pool.query(
        `INSERT INTO marketing_crisis_statement_instance (
           instance_uid, incident_uid, seq, statement_id, statement_version, library_version,
           ad_hoc, authored_by, authored_at, phase, body, content_hash,
           preconditions_acknowledged, carries_promotional_content,
           is_inside_information_disclosure, residual_unknowns_closed, supersedes,
           complete_at_compose
         )
         SELECT $1::text, $2::text, coalesce(max(seq), 0) + 1, $3::text, $4::int, $5::int,
                $6::boolean, $7::text, $8::timestamptz, $9::text, $10::jsonb, $11::text,
                $12::text[], $13::boolean, $14::boolean, $15::jsonb, $16::text, true
           FROM marketing_crisis_statement_instance WHERE incident_uid = $2`,
        [
          uid, incidentId, draft.statementId, draft.statementVersion, HOLDING_LIBRARY_VERSION,
          adHoc, authoredBy, now, phase, JSON.stringify(body), contentHash,
          preconditions, carriesPromotionalContent, isInsideInformationDisclosure,
          residual === null ? null : JSON.stringify(residual), draft.supersedes,
        ],
      );
    } catch (err) {
      // The UNIQUE (incident_uid, seq) is the real guard against two composers both
      // becoming statement 3. A 409 says retry; inventing a seq would break the
      // "one story straight" spine the audit is read along.
      if ((err as { code?: string }).code === '23505') {
        return c.json(
          { error: 'Another statement was recorded for this incident at the same sequence. Retry.', code: 'CONFLICT' },
          409,
        );
      }
      throw err;
    }

    const row = await loadInstance(pool, uid);
    if (row === null) {
      return c.json({ error: 'The statement was written and could not be read back', code: 'MARKETING_ERROR' }, 500);
    }
    const data = await instancePayload(pool, row, incident, now);
    // The CLEAR verdict travels with the stored statement, caveat attached, so no surface
    // can render "gated" without what the gate could not see.
    return c.json({ data: { ...data, outboundGate: gate.verdict }, meta: meta() }, 201);
  } catch (err) {
    console.error('[marketing/memory] compose error:', err);
    return c.json({ error: 'Failed to compose the statement', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * GET /crisis/instance/:id — one statement, its clearance board and its clock.
 *
 * The completeness verdict and the board are recomputed from the stored row on every
 * read. Nothing is cached and nothing is trusted from a column: an hour after
 * composition the same bytes can be a breached next-update commitment, and a stored
 * `true` would show it as complete.
 */
marketingMemoryRoutes.get('/crisis/instance/:id', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const state = await memoryStorageState(getPool());
    if (state !== 'present') {
      const storage = storageOf(state);
      return c.json({ error: storage.sentence, code: 'MIGRATION_PENDING', refusals: [storage.refusal] }, 503);
    }
    const pool = getPool();
    const row = await loadInstance(pool, id);
    if (row === null) return c.json({ error: 'statement instance not found', code: 'NOT_FOUND' }, 404);
    const incident = await loadIncident(pool, row.incident_uid);
    if (incident === null) {
      // The FK makes this unreachable while the FK exists, and it is handled rather than
      // asserted away: an instance whose incident vanished must not render a clock
      // computed from a default opening instant.
      return c.json({ error: 'the incident this statement belongs to is missing', code: 'NOT_FOUND' }, 404);
    }
    const data = await instancePayload(pool, row, incident, nowIso());
    return c.json({ data, meta: meta() });
  } catch (err) {
    console.error('[marketing/memory] instance error:', err);
    return c.json({ error: 'Failed to load the statement', code: 'MARKETING_ERROR' }, 500);
  }
});

/**
 * POST /crisis/instance/:id/clearance — record ONE of the parallel clears.
 *
 * `reviewer` COMES FROM THE SESSION. A clearance the client could sign for somebody else
 * is not a second pair of eyes, and `assessClearance` voids a clear given by the author —
 * which it can only do if the reviewer is who the session says it is.
 *
 * ══ THE WRITE SUCCEEDS AND THE BOARD STATES THE PROBLEM ══
 * A `headlineTestPassed: false` is a REFUSAL TO CLEAR, not a failed request: it is a
 * substantive objection that has to survive in the record, so the row is written and the
 * lane reads `refused_on_headline_test`. Likewise `FOUR_EYES_UNACHIEVABLE` — when one
 * human has supplied every held clear, the clearance is still recorded and the board says
 * in its own field that this is one pair of eyes wearing three hats. Swallowing either of
 * them would leave a board of green ticks over a record the engine calls misleading.
 *
 * ══ THE ONE CASE THAT REFUSES THE WRITE ══
 * A `reviewedContentHash` that does not match the instance. Instances are immutable in
 * 0063 — there is no UPDATE path for `body`, and changed text is composed as a new
 * instance at the next sequence — so a mismatched hash means the reviewer reviewed
 * something else. Recording that as a void clearance would fill the board with clears
 * against bytes nobody is proposing to publish, so it is refused with
 * `CLEARANCE_VOID_CONTENT_CHANGED` and nothing is written.
 */
marketingMemoryRoutes.post('/crisis/instance/:id/clearance', requireOperator, async (c) => {
  try {
    const id = c.req.param('id');
    const raw = await c.req.json<Record<string, unknown>>();

    const role = String(raw.role ?? '');
    if (!CLEARANCE_ROLES.includes(role as ClearanceRole)) {
      return c.json({ error: `role must be one of: ${CLEARANCE_ROLES.join(', ')}`, code: 'VALIDATION' }, 400);
    }
    const mode = String(raw.mode ?? 'blocking');
    if (mode !== 'blocking' && mode !== 'advisory') {
      return c.json({ error: 'mode must be blocking or advisory', code: 'VALIDATION' }, 400);
    }
    if (typeof raw.headlineTestPassed !== 'boolean') {
      return c.json(
        {
          error: `headlineTestPassed must be true or false, answering: ${CLEARANCE_HEADLINE_TEST_QUESTION} It is an assertion by the reviewer, so there is no default and no null.`,
          code: 'VALIDATION',
        },
        400,
      );
    }
    const headlineTest = raw.headlineTestPassed;
    const comment = typeof raw.comment === 'string' && raw.comment.trim() !== '' ? raw.comment.trim() : null;

    const state = await memoryStorageState(getPool());
    if (state !== 'present') {
      const storage = storageOf(state);
      return c.json({ error: storage.sentence, code: 'MIGRATION_PENDING', refusals: [storage.refusal] }, 503);
    }

    const pool = getPool();
    const row = await loadInstance(pool, id);
    if (row === null) return c.json({ error: 'statement instance not found', code: 'NOT_FOUND' }, 404);
    const incident = await loadIncident(pool, row.incident_uid);
    if (incident === null) {
      return c.json({ error: 'the incident this statement belongs to is missing', code: 'NOT_FOUND' }, 404);
    }

    const reviewedHash = typeof raw.reviewedContentHash === 'string' ? raw.reviewedContentHash.trim() : '';
    if (reviewedHash !== '' && reviewedHash !== row.content_hash) {
      return c.json(
        {
          error: 'This clearance was given against different text and has NOT been recorded.',
          code: REFUSED,
          refusals: [
            refuse(
              'CLEARANCE_VOID_CONTENT_CHANGED',
              `The text you reviewed (${reviewedHash.slice(0, 12)}…) is not the text of this statement (${row.content_hash.slice(0, 12)}…). A clearance binds to bytes, and "four eyes on an earlier draft" is the commonest way these systems fail quietly. Re-read the current text, or clear the instance that actually carries the words you read.`,
              CERC(
                'Crisis Communication Plans — clearance',
                'Provide only information that has been approved and cleared by the appropriate channels.',
              ),
              { kind: 'human_authority', role: role as ClearanceRole },
              reviewedHash,
              CRISIS_RULESET_VERSION,
            ),
          ],
        },
        422,
      );
    }

    const reviewer: ActorId = c.get('operator')?.id ?? 'unknown';
    const at = nowIso();

    /*
     * ══ THE GATE RE-RUNS AT CLEARANCE, AND THAT IS NOT REDUNDANT ══
     * The bytes are immutable — 0063 has no UPDATE path for `body` — but the STATE around
     * them is not. A statement cleared at 02:00 naming an asset that entered
     * `mnpi_pending` at 03:00 must not gather its third clear at 04:00. This is the same
     * argument that makes `POST /draft/:id/approve` re-gate stored text, and it is the only
     * check in the room that watches a moving perimeter.
     *
     * The gated words come from the STORED body — never from anything the client sent — so
     * a clear cannot be granted against text nobody stored. `operatorWordsOf` is the same
     * function composition used, so the two verdicts are about the same string and
     * "cleared at compose, refused at clearance" is information about the perimeter rather
     * than about two different inputs.
     */
    const gate = await gateCrisisStatement(pool, {
      text: operatorWordsOf(row.body as StatementBody),
      actor: reviewer,
      phase: 'clearance',
      carriesPromotionalContent: row.carries_promotional_content,
      isInsideInformationDisclosure: row.is_inside_information_disclosure,
      now: at,
    });

    /*
     * ══ A REFUSED GATE BLOCKS A CLEAR, AND ONLY A CLEAR ══
     * `headlineTestPassed: true` is the act of granting authority over these words, and the
     * gate refusing means the words may not be released at all — so granting it is refused
     * and nothing is written. The verdict is already in the ledger by the time this branch
     * runs, so the attempt is not lost.
     *
     * `headlineTestPassed: false` IS WRITTEN ANYWAY, and this asymmetry is deliberate. That
     * row is a reviewer's substantive OBJECTION; refusing it would stop the desk recording
     * a problem it has already found, which is strictly worse than the risk it would avoid.
     * A gate refusal and a human objection point the same way, and swallowing the second
     * because of the first would leave the board silent where it should be loudest.
     */
    if (!gate.verdict.allowed && headlineTest) {
      return c.json(
        {
          error: 'The outbound gate refuses this text, so a clear cannot be granted against '
            + 'it. The clearance has NOT been recorded. Record an objection, or compose a new '
            + 'instance whose words pass.',
          code: 'MARKETING_OUTBOUND_REFUSED',
          refusals: gate.refusals,
          outboundGate: gate.verdict,
        },
        422,
      );
    }

    await pool.query(
      `INSERT INTO marketing_crisis_clearance (
         instance_uid, role, mode, reviewer, cleared_at, headline_test, content_hash, comment
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8)
       ON CONFLICT (instance_uid, role, reviewer, content_hash)
       DO UPDATE SET headline_test = EXCLUDED.headline_test,
                     mode = EXCLUDED.mode,
                     comment = EXCLUDED.comment,
                     cleared_at = EXCLUDED.cleared_at`,
      [id, role, mode, reviewer, at, headlineTest, row.content_hash, comment],
    );

    const clearances = await loadClearances(pool, id);
    const data: ClearanceBoard = {
      ...boardFor(row, clearances, incident.legal_implications),
      // Overwrites `boardFor`'s null: this response DID gate, so the board says what the
      // gate said — including on the objection path, where the words were refused too.
      outboundGate: gate.verdict,
    };
    return c.json({ data, meta: meta() }, 201);
  } catch (err) {
    console.error('[marketing/memory] clearance error:', err);
    return c.json({ error: 'Failed to record the clearance', code: 'MARKETING_ERROR' }, 500);
  }
});
