/**
 * GLOBAL SERVICES (GPS) — ORIGINATION, the data layer for Phase 8.
 *
 * `packages/shared/src/gps/targeting.ts` is 1,152 lines with 70 tests and, until
 * this file, ZERO callers anywhere in the repo. Everything below exists to get a
 * persisted target into `buildOriginationQueue` and its output back out. There is
 * no scoring arithmetic here, and there must never be: a second implementation of
 * the ranking is the exact defect the contract rule of this programme forbids, and
 * it would diverge silently because both halves would look right.
 *
 * ── WHAT IS PERSISTED, AND WHERE ──────────────────────────────────────────────
 *  gps_target          NEW in 0050 (described in the handover; this file does NOT
 *                      own a migration). One row per curated watchlist target,
 *                      SCALAR COLUMNS ONLY — see the jsonb note below.
 *  observations        REUSED, unchanged, from 0029_spine.sql:23. Provenance for
 *                      the facts feeding the score (slice 8.3) and the why-now
 *                      trigger (8.1). It is not a stretch of that table, it is
 *                      what it is for: `subject_type/subject_id/predicate/source/
 *                      source_url/reliability/credibility/observed_at/actor` maps
 *                      onto `FactInput` field for field, and `confidenceFrom` is
 *                      already the function behind its `confidence` column.
 *  gps_outreach_opening NEW in 0050. The draft opening of slice 8.5, and NOTHING
 *                      ELSE — it has no approver column, no recipient, no channel
 *                      and no sent_at, so there is nowhere to record an approval
 *                      and nothing to send to. Same mechanism as the artifact
 *                      lockout: the absence of the column is the guarantee.
 *
 * A FACT ROW STORES NO VALUE. `observations.value_json` is left at its default for
 * a fact: the value lives on `gps_target`, and copying it here would create two
 * truths for one number with nothing to reconcile them. The trigger is the
 * exception and the reason is structural — a why-now has no column anywhere, so
 * its `{kind, statement}` IS the observation.
 *
 * ── NO CLIENT ARTIFACT, DOCUMENT OR UPLOAD PATH EXISTS HERE ───────────────────
 * Decision D2 (LCX legal/DPO: controller vs processor for a third party's
 * confidential material, the subprocessor chain, retention, erasure) is still
 * UNANSWERED, so GPS remains incapable of accepting a client document rather than
 * discouraged from it. Nothing below reads bytes, and 0050 adds no column one
 * could be written to. `__tests__/intakeLockout.test.ts` discovers this file by
 * path and fails the build if that changes.
 *
 * ── MIGRATION-PENDING DISCIPLINE ──────────────────────────────────────────────
 * Same as `gps/service.ts:54` and for the same deploy-ordering reason: the API
 * ships on a push to main and 0050 is applied by hand. `isOriginationMigrated`
 * answers false rather than throwing, reads degrade to an empty well-shaped body
 * and writes refuse with 503 — never 500, which the desk reads as an outage.
 *
 * ── ONE PENDING WIRING EDIT, STATED LOUDLY ────────────────────────────────────
 * The origination engine is imported from `@lcx/shared`, the bare package
 * specifier, and `packages/shared/src/gps/index.ts` does not re-export
 * `origination.ts` yet. That barrel belongs to the wiring pass, so this file does
 * not touch it and will not type-check until it does. The alternative was
 * measured and is worse: a deep relative path is TS6059 ("not under rootDir
 * 'apps/api/src'"), and a deep path through `node_modules/@lcx/shared/src/...`
 * type-checks locally and then CANNOT RESOLVE IN THE CONTAINER — `apps/api/
 * Dockerfile` copies `packages/shared/dist` only and rewrites the package's
 * `exports` to point at it, so a `src` specifier is a boot crash that no test in
 * this repo would catch. A compile error the wiring pass must fix is strictly
 * safer than a green build that dies on deploy.
 *
 * Money is integer cents. Every statement is parameterised. All time arithmetic
 * takes an explicit `asOfMs` so the output is reproducible.
 */
import type { Pool } from 'pg';
import {
  SCORING_FIELDS,
  TRIGGER_KIND_LABELS,
  buildOriginationQueue,
  deriveUnknowns,
  factProvenance,
  originationResponse,
  resolveTrigger,
  sealBrief,
  type BriefAssertion,
  type BriefDraft,
  type BriefResponse,
  type BriefSection,
  type Credibility,
  type DeadlineKind,
  type DeliveryComplexityFlags,
  type FactInput,
  type FactProvenance,
  type GpsTarget,
  type OfferKey,
  type OriginationInput,
  type OriginationResponse,
  type PerimeterStatus,
  type QueueRow,
  type RefusalEntry,
  type Reliability,
  type ScreeningResult,
  type TargetConflictStatus,
  type TriggerInput,
  type TriggerKind,
} from '@lcx/shared';

/* ── The migration probe ───────────────────────────────────────────────────── */

/**
 * HAS 0050 LANDED HERE?
 *
 * Both tables are checked in one round trip, `observations` included: origination
 * without provenance is a ranking with no sources, which is the decoration this
 * phase exists to remove, so a database holding one and not the other is not
 * "partly migrated" — it is not migrated. `to_regclass` returns NULL rather than
 * throwing, so the probe itself can never be the error.
 *
 * Cached per process for the reason `gps/service.ts:73` gives: the answer changes
 * only when a human runs a migration, and the API restarts on deploy.
 */
let migratedCache: boolean | null = null;

export async function isOriginationMigrated(pool: Pool): Promise<boolean> {
  if (migratedCache !== null) return migratedCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.gps_target') IS NOT NULL
          AND to_regclass('public.gps_outreach_opening') IS NOT NULL
          AND to_regclass('public.observations') IS NOT NULL AS ok`,
    );
    migratedCache = Boolean(res.rows[0]?.ok);
  } catch (err) {
    // CACHE ONLY THE POSITIVE, AND LOG THE CATCH.
    //
    // This used to be `catch { cache = false }` with no log. One connection reset,
    // statement timeout or pgbouncer restart therefore poisoned the process
    // PERMANENTLY: every GPS read served `migrated: false` and every write answered
    // 503 "awaiting migration", on a fully migrated production database, until
    // someone restarted the API — with nothing in the logs saying why. Each of these
    // probes justified caching with "the API restarts on deploy", but
    // `db/migrate.ts` states migrations are deliberately NOT part of the deploy, so a
    // true negative never self-heals either.
    //
    // Leaving the cache NULL means the next call re-probes: one extra round trip
    // while the database is unhealthy, and correct behaviour the moment it is not.
    console.error('[gps] origination migration probe failed; not caching the negative:', err);
    return false;
  }
  return migratedCache;
}

/** Test-only: forget the probe. */
export function _resetOriginationMigrated(): void {
  migratedCache = null;
}

/* ── Row shapes and mapping ────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/**
 * `bigint` arrives from node-postgres as a STRING. Nullability is preserved on
 * purpose — `gps/service.ts:109` coerces NULL to 0 because an engagement always
 * has a price, but here NULL means "we have not established a budget", and 0 means
 * "they told us zero". `deriveAbilityToPay` scores those differently and
 * `computeConfidence` charges only one of them, so collapsing them would flatter
 * every under-researched target in the queue.
 */
function centsOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Whole days from an instant to `asOfMs`; null when there is no instant. */
function ageDays(iso: string | null, asOfMs: number): number | null {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((asOfMs - ms) / DAY_MS);
}

/** Every column of `gps_target`, once, so a read and a RETURNING cannot drift. */
const TARGET_COLS = `id, name, jurisdiction, client_id, status,
  screening, perimeter, conflict, demands_guaranteed_outcome, materially_misleading,
  decision_maker_name, decision_maker_role, decision_maker_is_budget_holder,
  identified_needs, offer_key, stated_budget_cents, capital_proxy_cents, intro_path,
  deadline_at, deadline_kind, quoted_price_cents, expected_vendor_cost_cents,
  complexity_no_named_partner, complexity_scope_undefined, complexity_multi_jurisdiction,
  complexity_translation_required, complexity_client_side_dependencies, complexity_assessed_at,
  evidence_reliability, evidence_credibility, evidence_observed_at,
  created_by, created_at, updated_at`;

/** A raw `gps_target` row. Snake_case because that is what `pg` hands back. */
interface TargetRow {
  id: string;
  name: string;
  jurisdiction: string | null;
  client_id: string | null;
  status: string;
  screening: ScreeningResult;
  perimeter: PerimeterStatus;
  conflict: TargetConflictStatus;
  demands_guaranteed_outcome: boolean;
  materially_misleading: boolean;
  decision_maker_name: string | null;
  decision_maker_role: string | null;
  decision_maker_is_budget_holder: boolean | null;
  identified_needs: string[] | null;
  offer_key: OfferKey | null;
  stated_budget_cents: string | null;
  capital_proxy_cents: string | null;
  intro_path: 'direct_relationship' | 'warm_referral' | 'cold' | null;
  deadline_at: Date | string | null;
  deadline_kind: DeadlineKind | null;
  quoted_price_cents: string | null;
  expected_vendor_cost_cents: string | null;
  complexity_no_named_partner: boolean | null;
  complexity_scope_undefined: boolean | null;
  complexity_multi_jurisdiction: boolean | null;
  complexity_translation_required: boolean | null;
  complexity_client_side_dependencies: boolean | null;
  complexity_assessed_at: Date | string | null;
  evidence_reliability: Reliability | null;
  evidence_credibility: number | null;
  evidence_observed_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * What the surface needs about a target that `GpsTarget` has no room for: the
 * moment its recorded decisions were last touched, and who put it on the list.
 * `updatedIso` is load-bearing rather than decorative — it is the observation date
 * of every gate finding in the brief, because a gate is derived from the decisions
 * on this row and its age is therefore the row's age.
 */
export interface TargetRecord {
  target: GpsTarget;
  status: string;
  clientId: string | null;
  createdBy: string | null;
  createdIso: string;
  updatedIso: string;
}

/**
 * Row → `GpsTarget`.
 *
 * Two mappings carry the whole honesty of the ranking and are worth reading twice:
 *
 *  · `complexity` is null unless `complexity_assessed_at` is set, so "nobody has
 *    assessed delivery complexity" and "assessed, and none of the five flags fire"
 *    are DIFFERENT states. `deriveDeliveryComplexity` (`targeting.ts:819`) treats
 *    the first as unknown — zero points, lower confidence — and the second as a
 *    genuine zero penalty. A boolean-only schema would have made every unassessed
 *    target look clean.
 *  · `evidence.ageDays` is DERIVED here from `evidence_observed_at`, never stored.
 *    A stored age is wrong the day after it is written, and this is the number
 *    `computeConfidence` decays the Admiralty grade by.
 *
 * `market` is always null: 0050 stores no `SignalBundle`, so the last-resort
 * capital proxy is simply unavailable and reports itself as a missing factor.
 * Inventing market data to fill a score term would be the opposite of this phase.
 */
export function toTargetRecord(row: TargetRow, asOfMs: number): TargetRecord {
  const evidenceObserved = isoOrNull(row.evidence_observed_at);
  const flags: DeliveryComplexityFlags = {
    noNamedPartner: row.complexity_no_named_partner,
    scopeUndefined: row.complexity_scope_undefined,
    multiJurisdiction: row.complexity_multi_jurisdiction,
    translationRequired: row.complexity_translation_required,
    clientSideDependencies: row.complexity_client_side_dependencies,
  };
  const target: GpsTarget = {
    id: row.id,
    name: row.name,
    screening: row.screening,
    perimeter: row.perimeter,
    conflict: row.conflict,
    decisionMaker: row.decision_maker_name
      ? {
          name: row.decision_maker_name,
          role: row.decision_maker_role ?? '',
          isBudgetHolder: row.decision_maker_is_budget_holder,
        }
      : null,
    demandsGuaranteedOutcome: row.demands_guaranteed_outcome,
    materiallyMisleading: row.materially_misleading,
    identifiedNeeds: (row.identified_needs as readonly OfferKey[] | null) ?? null,
    offerKey: row.offer_key,
    statedBudgetCents: centsOrNull(row.stated_budget_cents),
    capitalProxyCents: centsOrNull(row.capital_proxy_cents),
    market: null,
    introPath: row.intro_path,
    deadlineIso: isoOrNull(row.deadline_at),
    deadlineKind: row.deadline_kind,
    quotedPriceCents: centsOrNull(row.quoted_price_cents),
    expectedVendorCostCents: centsOrNull(row.expected_vendor_cost_cents),
    complexity: isoOrNull(row.complexity_assessed_at) ? flags : null,
    evidence: row.evidence_reliability
      ? {
          reliability: row.evidence_reliability,
          credibility: (row.evidence_credibility ?? 6) as Credibility,
          ageDays: ageDays(evidenceObserved, asOfMs),
        }
      : null,
    jurisdiction: row.jurisdiction,
  };
  return {
    target,
    status: row.status,
    clientId: row.client_id,
    createdBy: row.created_by,
    createdIso: isoOrNull(row.created_at) ?? new Date(asOfMs).toISOString(),
    updatedIso: isoOrNull(row.updated_at) ?? new Date(asOfMs).toISOString(),
  };
}

/* ── Reads ─────────────────────────────────────────────────────────────────── */

/** The subject type of every origination observation. One string, one place. */
export const TARGET_SUBJECT_TYPE = 'gps_target';

/**
 * The predicate a why-now trigger is stored under. It is deliberately NOT one of
 * `SCORING_FIELDS` — a trigger never touches the score (`origination.ts:288` in
 * shared: "decays the RECORD, not the underlying urgency"), and giving it a
 * scoring field name would be the first step to double-counting urgency.
 */
export const WHY_NOW_PREDICATE = 'whyNow';

/** The `GpsTarget` fields provenance may be recorded against, from the engine. */
export const PROVENANCEABLE_FIELDS: readonly string[] = SCORING_FIELDS.map((s) => String(s.field));

/**
 * The closed set of why-now kinds, derived from the engine's label map rather than
 * retyped. A kind that exists in one list and not the other is the bug this avoids:
 * validation would accept a value the shelf-life table has no entry for, and the
 * trigger would come back with `shelfLifeDays: undefined`.
 */
export const TRIGGER_KINDS: readonly string[] = Object.keys(TRIGGER_KIND_LABELS);

export interface ListTargetsOptions {
  limit?: number;
  /** One target, for the brief. Kept on the same query so both paths map alike. */
  targetId?: string;
  /** Excluded from the queue by a human decision, e.g. `'dropped'`. */
  status?: string;
  asOfMs: number;
}

const MAX_LIMIT = 500;

/**
 * The curated watchlist, newest first.
 *
 * Bounded at 500 rows, and that ceiling is a statement rather than a guard against
 * load: this is a CURATED list (plan §4 — "explicitly not built: the global
 * discovery engine"), so a database holding more than 500 targets means mass
 * sourcing arrived through some other door and the queue's `capacity` cut is no
 * longer describing a day's work.
 */
export async function listTargetRecords(
  pool: Pool,
  opts: ListTargetsOptions,
): Promise<TargetRecord[]> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(opts.limit ?? 200)));
  const res = opts.targetId
    ? await pool.query(`SELECT ${TARGET_COLS} FROM gps_target WHERE id = $1`, [opts.targetId])
    : opts.status
      ? await pool.query(
          `SELECT ${TARGET_COLS} FROM gps_target WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
          [opts.status, limit],
        )
      : await pool.query(
          `SELECT ${TARGET_COLS} FROM gps_target ORDER BY created_at DESC LIMIT $1`,
          [limit],
        );
  return (res.rows as TargetRow[]).map((r) => toTargetRecord(r, opts.asOfMs));
}

interface ObservationRow {
  subject_id: string;
  predicate: string;
  value_json: { kind?: string; statement?: string; occurredIso?: string | null } | null;
  source: string;
  source_url: string | null;
  reliability: Reliability;
  credibility: number;
  observed_at: Date | string;
}

/**
 * The latest observation per (target, predicate) — facts and triggers in ONE read.
 *
 * `DISTINCT ON` rather than a max-per-group join because `observations` is
 * APPEND-ONLY by design (0029 is the provenance spine: re-recording a fact from a
 * better source must not erase the worse one, or the ledger cannot show that our
 * evidence improved). Latest-wins on read, everything kept on disk.
 *
 * Ordered by `observed_at DESC, created_at DESC`: two rows observed at the same
 * instant are broken by which was recorded later, so the result is deterministic
 * rather than dependent on physical row order.
 */
async function loadObservations(pool: Pool, targetIds: readonly string[]): Promise<ObservationRow[]> {
  if (targetIds.length === 0) return [];
  const res = await pool.query(
    `SELECT DISTINCT ON (subject_id, predicate)
            subject_id, predicate, value_json, source, source_url,
            reliability, credibility, observed_at
       FROM observations
      WHERE subject_type = $1 AND subject_id = ANY($2::text[])
      ORDER BY subject_id, predicate, observed_at DESC, created_at DESC`,
    [TARGET_SUBJECT_TYPE, [...targetIds]],
  );
  return res.rows as ObservationRow[];
}

/** One observation row → the engine's `FactInput`. */
function toFactInput(row: ObservationRow): FactInput {
  return {
    field: row.predicate,
    sourceId: row.source,
    sourceUrl: row.source_url,
    reliability: row.reliability,
    credibility: (row.credibility as Credibility) ?? 6,
    observedIso: isoOrNull(row.observed_at),
  };
}

/**
 * One observation row → `TriggerInput`, or null when it is not a usable trigger.
 *
 * The event date lives in `value_json.occurredIso` and NOT in `observed_at`, which
 * looks like the wrong column until you notice that `observations.observed_at` is
 * `NOT NULL` (0029_spine.sql:38). Putting the event date there would make an
 * UNDATED trigger indistinguishable from one that happened the moment it was
 * recorded — and `TriggerState` has an `'undated'` state precisely so that
 * confusion is visible. So `observed_at` carries WHEN WE RECORDED THE SOURCE (the
 * provenance clock) and `occurredIso` carries WHEN THE EVENT HAPPENED (the shelf
 * life clock). Two clocks, because they answer two questions.
 *
 * An unparseable `kind` returns null rather than a default kind: `TriggerKind` is a
 * closed union and a row written before a kind was renamed must disappear from the
 * why-now column rather than silently become a `market_event` with the wrong shelf
 * life.
 */
function toTriggerInput(row: ObservationRow, kinds: readonly string[]): TriggerInput | null {
  const kind = row.value_json?.kind;
  const statement = row.value_json?.statement;
  if (typeof kind !== 'string' || !kinds.includes(kind)) return null;
  if (typeof statement !== 'string' || statement.trim().length === 0) return null;
  return {
    kind: kind as TriggerKind,
    statement,
    occurredIso: row.value_json?.occurredIso ?? null,
    source: {
      sourceId: row.source,
      sourceUrl: row.source_url,
      reliability: row.reliability,
      credibility: (row.credibility as Credibility) ?? 6,
      observedIso: isoOrNull(row.observed_at),
    },
  };
}

/** A target, its facts and its why-now — the exact input the engine wants. */
export interface LoadedTarget {
  record: TargetRecord;
  input: OriginationInput;
}

/**
 * Load everything the queue needs. Two round trips, never one per target.
 *
 * `triggerKinds` is a parameter rather than a direct read of `TRIGGER_KINDS` so a
 * test can prove what happens to a stored trigger whose kind the engine no longer
 * has — it must disappear from the why-now column, not become another kind with the
 * wrong shelf life. Callers pass `TRIGGER_KINDS`; nothing else should.
 */
export async function loadTargets(
  pool: Pool,
  opts: ListTargetsOptions & { triggerKinds: readonly string[] },
): Promise<LoadedTarget[]> {
  const records = await listTargetRecords(pool, opts);
  if (records.length === 0) return [];
  const observations = await loadObservations(pool, records.map((r) => r.target.id));

  const factsById = new Map<string, FactInput[]>();
  const triggerById = new Map<string, TriggerInput>();
  for (const row of observations) {
    if (row.predicate === WHY_NOW_PREDICATE) {
      const trigger = toTriggerInput(row, opts.triggerKinds);
      if (trigger) triggerById.set(row.subject_id, trigger);
      continue;
    }
    // Provenance for a field that is not a scoring input would appear nowhere and
    // silently inflate nothing — it is dropped here rather than shipped as a fact
    // the surface cannot place.
    if (!PROVENANCEABLE_FIELDS.includes(row.predicate)) continue;
    const list = factsById.get(row.subject_id) ?? [];
    list.push(toFactInput(row));
    factsById.set(row.subject_id, list);
  }

  return records.map((record) => ({
    record,
    input: {
      target: record.target,
      trigger: triggerById.get(record.target.id) ?? null,
      facts: factsById.get(record.target.id) ?? [],
    },
  }));
}

/* ── Writes ────────────────────────────────────────────────────────────────── */

/**
 * The whole target as a human now understands it. Every field is stated, including
 * the ones being cleared.
 *
 * WHY REPLACE AND NOT PATCH. A patch needs either a dynamically built `SET` list —
 * which breaks the standing rule that no identifier is ever concatenated into SQL
 * (`gps/service.ts:21`) — or `COALESCE(col, $n)`, which makes it impossible to
 * UN-record a wrong budget. So a save states the whole row.
 *
 * The obvious objection is that an omitted field silently overwrites a recorded
 * decision. It does, and the direction that happens in is why this is acceptable:
 * the three gate decisions default to `not_screened`, `unknown` and `unresolved`,
 * so an omission costs 20 confidence points, another 10, and FIRES A GATE. A
 * careless save makes a target look worse and stops it being called, which is
 * recoverable in one minute. The opposite default would make it look screened.
 */
export interface TargetWrite {
  /** Present to replace an existing target, absent to create one. */
  id?: string | null;
  name: string;
  jurisdiction?: string | null;
  clientId?: string | null;
  status?: string | null;
  screening?: ScreeningResult | null;
  perimeter?: PerimeterStatus | null;
  conflict?: TargetConflictStatus | null;
  demandsGuaranteedOutcome?: boolean | null;
  materiallyMisleading?: boolean | null;
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
  decisionMakerIsBudgetHolder?: boolean | null;
  /** `null` = need not established; `[]` = looked and there is none. Kept apart. */
  identifiedNeeds?: readonly OfferKey[] | null;
  offerKey?: OfferKey | null;
  statedBudgetCents?: number | null;
  capitalProxyCents?: number | null;
  introPath?: 'direct_relationship' | 'warm_referral' | 'cold' | null;
  deadlineIso?: string | null;
  deadlineKind?: DeadlineKind | null;
  quotedPriceCents?: number | null;
  expectedVendorCostCents?: number | null;
  complexity?: DeliveryComplexityFlags | null;
  /** Set when a human has actually assessed complexity. Null ⇒ unassessed. */
  complexityAssessedIso?: string | null;
  evidenceReliability?: Reliability | null;
  evidenceCredibility?: Credibility | null;
  evidenceObservedIso?: string | null;
  createdBy: string;
}

/**
 * Create or replace one target. Static SQL; `id` decides which.
 *
 * `ON CONFLICT (id) DO UPDATE` leaves `created_by` and `created_at` alone — who put
 * a target on the watchlist is not something a later save may rewrite — and always
 * bumps `updated_at`, which is the observation date every gate finding in the brief
 * is dated by (`briefFor` below).
 */
export async function saveTarget(pool: Pool, w: TargetWrite, asOfMs: number): Promise<TargetRecord> {
  const c = w.complexity ?? null;
  const res = await pool.query(
    `INSERT INTO gps_target (
       id, name, jurisdiction, client_id, status,
       screening, perimeter, conflict, demands_guaranteed_outcome, materially_misleading,
       decision_maker_name, decision_maker_role, decision_maker_is_budget_holder,
       identified_needs, offer_key, stated_budget_cents, capital_proxy_cents, intro_path,
       deadline_at, deadline_kind, quoted_price_cents, expected_vendor_cost_cents,
       complexity_no_named_partner, complexity_scope_undefined, complexity_multi_jurisdiction,
       complexity_translation_required, complexity_client_side_dependencies, complexity_assessed_at,
       evidence_reliability, evidence_credibility, evidence_observed_at, created_by
     ) VALUES (
       COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4::uuid, COALESCE($5, 'watchlist'),
       COALESCE($6, 'not_screened'), COALESCE($7, 'unknown'), COALESCE($8, 'unresolved'),
       COALESCE($9, false), COALESCE($10, false),
       $11, $12, $13,
       $14::text[], $15, $16, $17, $18,
       $19::timestamptz, $20, $21, $22,
       $23, $24, $25, $26, $27, $28::timestamptz,
       $29, $30, $31::timestamptz, $32
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, jurisdiction = EXCLUDED.jurisdiction,
       client_id = EXCLUDED.client_id, status = EXCLUDED.status,
       screening = EXCLUDED.screening, perimeter = EXCLUDED.perimeter,
       conflict = EXCLUDED.conflict,
       demands_guaranteed_outcome = EXCLUDED.demands_guaranteed_outcome,
       materially_misleading = EXCLUDED.materially_misleading,
       decision_maker_name = EXCLUDED.decision_maker_name,
       decision_maker_role = EXCLUDED.decision_maker_role,
       decision_maker_is_budget_holder = EXCLUDED.decision_maker_is_budget_holder,
       identified_needs = EXCLUDED.identified_needs, offer_key = EXCLUDED.offer_key,
       stated_budget_cents = EXCLUDED.stated_budget_cents,
       capital_proxy_cents = EXCLUDED.capital_proxy_cents,
       intro_path = EXCLUDED.intro_path, deadline_at = EXCLUDED.deadline_at,
       deadline_kind = EXCLUDED.deadline_kind,
       quoted_price_cents = EXCLUDED.quoted_price_cents,
       expected_vendor_cost_cents = EXCLUDED.expected_vendor_cost_cents,
       complexity_no_named_partner = EXCLUDED.complexity_no_named_partner,
       complexity_scope_undefined = EXCLUDED.complexity_scope_undefined,
       complexity_multi_jurisdiction = EXCLUDED.complexity_multi_jurisdiction,
       complexity_translation_required = EXCLUDED.complexity_translation_required,
       complexity_client_side_dependencies = EXCLUDED.complexity_client_side_dependencies,
       complexity_assessed_at = EXCLUDED.complexity_assessed_at,
       evidence_reliability = EXCLUDED.evidence_reliability,
       evidence_credibility = EXCLUDED.evidence_credibility,
       evidence_observed_at = EXCLUDED.evidence_observed_at,
       updated_at = now()
     RETURNING ${TARGET_COLS}`,
    [
      w.id ?? null, w.name, w.jurisdiction ?? null, w.clientId ?? null, w.status ?? null,
      w.screening ?? null, w.perimeter ?? null, w.conflict ?? null,
      w.demandsGuaranteedOutcome ?? null, w.materiallyMisleading ?? null,
      w.decisionMakerName ?? null, w.decisionMakerRole ?? null, w.decisionMakerIsBudgetHolder ?? null,
      w.identifiedNeeds == null ? null : [...w.identifiedNeeds],
      w.offerKey ?? null, w.statedBudgetCents ?? null, w.capitalProxyCents ?? null, w.introPath ?? null,
      w.deadlineIso ?? null, w.deadlineKind ?? null,
      w.quotedPriceCents ?? null, w.expectedVendorCostCents ?? null,
      c?.noNamedPartner ?? null, c?.scopeUndefined ?? null, c?.multiJurisdiction ?? null,
      c?.translationRequired ?? null, c?.clientSideDependencies ?? null, w.complexityAssessedIso ?? null,
      w.evidenceReliability ?? null, w.evidenceCredibility ?? null, w.evidenceObservedIso ?? null,
      w.createdBy,
    ],
  );
  return toTargetRecord(res.rows[0] as TargetRow, asOfMs);
}

/**
 * Record provenance for ONE scoring field of one target.
 *
 * `observedIso` is REQUIRED by the caller (the route refuses without it) and that
 * refusal is the point: `observations.observed_at` is `NOT NULL` (0029_spine.sql:38),
 * so an undated fact stored here would arrive back looking as if it were observed
 * the moment it was typed. Omitting the date is the cheapest way to fake freshness
 * in any provenance system, so the system says no with a reason rather than
 * laundering it into a fresh-looking grade.
 *
 * `confidence` is stored as a SNAPSHOT of what `factProvenance` computed at
 * recording time — never read back into a score. Every read recomputes it against
 * the read's own clock, because the entire purpose of the grade is that it decays.
 */
export async function recordTargetFact(
  pool: Pool,
  args: { targetId: string; fact: FactInput & { observedIso: string }; actor: string },
  asOfMs: number,
): Promise<{ provenance: ReturnType<typeof factProvenance> }> {
  const provenance = factProvenance(args.fact, asOfMs);
  await pool.query(
    `INSERT INTO observations
       (subject_type, subject_id, predicate, source, source_url,
        reliability, credibility, confidence, observed_at, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10)`,
    [
      TARGET_SUBJECT_TYPE, args.targetId, args.fact.field,
      provenance.sourceId, provenance.sourceUrl,
      provenance.reliability, provenance.credibility, provenance.confidence,
      args.fact.observedIso, args.actor,
    ],
  );
  return { provenance };
}

/**
 * Record a why-now trigger.
 *
 * The event date goes in `value_json.occurredIso` and the recording instant in
 * `observed_at` — see `toTriggerInput` for why those are two different clocks.
 * `value_json` is the ONE place this compartment writes a jsonb value, and it holds
 * a closed-union `kind` plus one sentence a human typed about an EVENT. There is
 * nowhere in it for client material, and `observations` is not a `gps_` table, so
 * the frozen-jsonb ratchet on GPS migrations is untouched by it.
 */
export async function recordTargetTrigger(
  pool: Pool,
  args: {
    targetId: string;
    kind: TriggerKind;
    statement: string;
    occurredIso: string | null;
    sourceId: string;
    sourceUrl: string | null;
    reliability: Reliability | null;
    credibility: Credibility | null;
    actor: string;
  },
  asOfMs: number,
): Promise<ReturnType<typeof resolveTrigger>> {
  const recordedIso = new Date(asOfMs).toISOString();
  const input: TriggerInput = {
    kind: args.kind,
    statement: args.statement,
    occurredIso: args.occurredIso,
    source: {
      sourceId: args.sourceId,
      sourceUrl: args.sourceUrl,
      reliability: args.reliability,
      credibility: args.credibility,
      observedIso: recordedIso,
    },
  };
  const resolved = resolveTrigger(input, asOfMs);
  await pool.query(
    `INSERT INTO observations
       (subject_type, subject_id, predicate, value_json, source, source_url,
        reliability, credibility, confidence, observed_at, actor)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::timestamptz, $11)`,
    [
      TARGET_SUBJECT_TYPE, args.targetId, WHY_NOW_PREDICATE,
      JSON.stringify({ kind: args.kind, statement: args.statement, occurredIso: args.occurredIso }),
      resolved.provenance.sourceId, resolved.provenance.sourceUrl,
      resolved.provenance.reliability, resolved.provenance.credibility,
      resolved.provenance.confidence, recordedIso, args.actor,
    ],
  );
  return resolved;
}

/* ── The proposed opening — slice 8.5, a DRAFT and nothing else ─────────────── */

/**
 * A stored draft opening.
 *
 * There is no `approvedBy`, no `approvedAt`, no `channel`, no `recipient` and no
 * `sentAt` — not in this type and not in 0050's table. Approval and sending are a
 * governed action that belongs in `gps/actions.ts` behind `invokeAction`, and that
 * file is not touched by this phase. So the guarantee here is the same shape as the
 * artifact lockout: there is NOWHERE TO RECORD AN APPROVAL, therefore nothing can
 * mark a draft sendable, therefore no code path from origination reaches a send.
 *
 * `integrityOkAtDraft` is the verdict `sealBrief` returned when the draft was
 * accepted. It is stored and it is NOT trusted on read: every read re-seals the
 * brief and re-checks the opening against it, because an assertion can go stale, a
 * source can age past the threshold, or a fact can be superseded after the draft
 * was written. A stored "ok" that nobody re-derives is exactly the claim-without-a-
 * mechanism this programme removes.
 */
export interface StoredOpening {
  id: string;
  targetId: string;
  text: string;
  citedAssertionIds: string[];
  assertsNothing: boolean;
  integrityOkAtDraft: boolean;
  draftedBy: string;
  createdIso: string;
}

const OPENING_COLS = `id, target_id, opening_text, cited_assertion_ids,
  asserts_nothing, integrity_ok, drafted_by, created_at`;

interface OpeningRow {
  id: string;
  target_id: string;
  opening_text: string;
  cited_assertion_ids: string[] | null;
  asserts_nothing: boolean;
  integrity_ok: boolean;
  drafted_by: string;
  created_at: Date | string;
}

function toStoredOpening(row: OpeningRow): StoredOpening {
  return {
    id: row.id,
    targetId: row.target_id,
    text: row.opening_text,
    citedAssertionIds: row.cited_assertion_ids ?? [],
    assertsNothing: row.asserts_nothing,
    integrityOkAtDraft: row.integrity_ok,
    draftedBy: row.drafted_by,
    createdIso: isoOrNull(row.created_at) ?? '',
  };
}

/**
 * The most recent draft for a target, or null.
 *
 * APPEND-ONLY, latest-wins, like the observations above: a rewritten opening does
 * not erase the one before it. What was drafted about a client, and by whom, is the
 * kind of record an exchange employee's services business needs to be able to
 * produce, and an UPDATE would destroy it.
 */
export async function latestOpening(pool: Pool, targetId: string): Promise<StoredOpening | null> {
  const res = await pool.query(
    `SELECT ${OPENING_COLS} FROM gps_outreach_opening
      WHERE target_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [targetId],
  );
  const row = res.rows[0] as OpeningRow | undefined;
  return row ? toStoredOpening(row) : null;
}

export async function saveOpening(
  pool: Pool,
  args: {
    targetId: string;
    text: string;
    citedAssertionIds: readonly string[];
    assertsNothing: boolean;
    integrityOk: boolean;
    draftedBy: string;
  },
): Promise<StoredOpening> {
  const res = await pool.query(
    `INSERT INTO gps_outreach_opening
       (target_id, opening_text, cited_assertion_ids, asserts_nothing, integrity_ok, drafted_by)
     VALUES ($1::uuid, $2, $3::text[], $4, $5, $6)
     RETURNING ${OPENING_COLS}`,
    [
      args.targetId, args.text, [...args.citedAssertionIds],
      args.assertsNothing, args.integrityOk, args.draftedBy,
    ],
  );
  return toStoredOpening(res.rows[0] as OpeningRow);
}

/* ── The research brief — slice 8.4 ────────────────────────────────────────────
 *
 * THE FAILURE MODE THIS IS DESIGNED AGAINST is a brief that reads well and is
 * wrong, walking him into a client conversation on a false premise. So the brief is
 * ASSEMBLED, NEVER WRITTEN. There are exactly three sources of a sentence:
 *
 *   1  a recorded fact           → SOURCED, carries the Admiralty grade and age of
 *                                  the observation behind it
 *   2  a value with NO source    → UNVERIFIED, provenance null, printed as such.
 *                                  These are the fields already moving the score
 *                                  with nothing behind them, and this is where the
 *                                  brief refuses to launder them
 *   3  a finding of the system   → SOURCED to the target row itself: the gates that
 *                                  fired, and the jurisdiction the perimeter gate
 *                                  quotes. Observed at `updated_at`, because that
 *                                  is when a human last recorded those decisions
 *
 * Nothing else. No summary paragraph, no narrative, no adjective, and no LLM: there
 * is no free-prose field on `BriefDraft` to put one in (`origination.ts:977` in
 * shared), which is the mechanism rather than the intention.
 *
 * NO `BriefEstimate` IS PRODUCED, deliberately, although the shape exists. Turning
 * a 0–100 targeting score into a probability of winning would be an invention — the
 * weights are a stated prior over ~29 outcomes a year and were never fitted
 * (`targeting.ts:134`) — and D3 does not ask for a number dressed as a forecast, it
 * asks for the uncertainty to sit BESIDE the estimate, which `confidence`/`band`
 * already do. An estimate here would be the most plausible-sounding lie in the file.
 */

/** Integer cents → `$12,000`, the same rendering `targeting.ts:581` uses. */
function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/**
 * Where each scoring field lands in the brief, and what to call it.
 *
 * Keyed by the `GpsTarget` field names in `SCORING_FIELDS` (`origination.ts:521` in
 * shared). A colocated test asserts every one of them has an entry here, so adding
 * a seventh scoring input to `targeting.ts` fails a test rather than producing a
 * brief with an unplaced sentence.
 */
const FIELD_META: Record<string, { label: string; section: BriefSection }> = {
  identifiedNeeds: { label: 'Identified need', section: 'need' },
  statedBudgetCents: { label: 'Stated budget', section: 'ability_to_pay' },
  capitalProxyCents: { label: 'Capital proxy', section: 'ability_to_pay' },
  market: { label: 'Market signals', section: 'ability_to_pay' },
  quotedPriceCents: { label: 'Price under discussion', section: 'commercial' },
  expectedVendorCostCents: { label: 'Expected partner cost', section: 'commercial' },
  decisionMaker: { label: 'Decision maker', section: 'access' },
  introPath: { label: 'Route in', section: 'access' },
  deadlineIso: { label: 'Deadline', section: 'timing' },
  complexity: { label: 'Delivery complexity', section: 'risk' },
};

const INTRO_PATH_TEXT: Record<'direct_relationship' | 'warm_referral' | 'cold', string> = {
  direct_relationship: 'a direct relationship',
  warm_referral: 'a warm referral',
  cold: 'a cold approach',
};

/**
 * The recorded value of one scoring field, as a sentence fragment. Null when the
 * field holds nothing — a field with no value produces NO assertion at all, and
 * appears instead in `unknowns` through `deriveUnknowns`.
 *
 * Every branch renders what is stored and nothing more. `$25,000` is a rendering of
 * 2_500_000 cents; "a warm referral" is a rendering of `warm_referral`. There is no
 * branch that characterises, ranks or interprets a value, because a brief that says
 * "a healthy budget" has asserted something no source supports.
 */
function fieldValueText(field: string, t: GpsTarget): string | null {
  switch (field) {
    case 'identifiedNeeds': {
      const needs = t.identifiedNeeds;
      if (needs == null) return null;
      return needs.length === 0
        ? 'looked for, and none identified'
        : needs.join(', ');
    }
    case 'statedBudgetCents':
      return t.statedBudgetCents == null ? null : usd(t.statedBudgetCents);
    case 'capitalProxyCents':
      return t.capitalProxyCents == null ? null : `${usd(t.capitalProxyCents)} (proxy, not a stated budget)`;
    case 'market':
      return t.market == null ? null : 'recorded';
    case 'quotedPriceCents':
      return t.quotedPriceCents == null ? null : usd(t.quotedPriceCents);
    case 'expectedVendorCostCents':
      return t.expectedVendorCostCents == null ? null : usd(t.expectedVendorCostCents);
    case 'decisionMaker': {
      const dm = t.decisionMaker;
      if (dm == null) return null;
      const budget = dm.isBudgetHolder == null
        ? 'budget authority not recorded'
        : dm.isBudgetHolder ? 'holds the budget' : 'does not hold the budget';
      return `${dm.name}${dm.role ? `, ${dm.role}` : ''} — ${budget}`;
    }
    case 'introPath':
      return t.introPath == null ? null : INTRO_PATH_TEXT[t.introPath];
    case 'deadlineIso': {
      if (t.deadlineIso == null) return null;
      const day = t.deadlineIso.slice(0, 10);
      return t.deadlineKind ? `${day} (${t.deadlineKind.replace(/_/g, ' ')})` : day;
    }
    case 'complexity': {
      const c = t.complexity;
      if (c == null) return null;
      const on = (Object.entries(c) as [string, boolean | null | undefined][])
        .filter(([, v]) => v === true)
        .map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase().trim());
      return on.length === 0 ? 'assessed, no complexity flags set' : on.join(', ');
    }
    default:
      return null;
  }
}

/** Everything `composeBriefDraft` needs. Assembled by `briefFor`, pure from here. */
export interface BriefComposition {
  loaded: LoadedTarget;
  /** The queue row when the target is eligible; null when a gate fired. */
  row: QueueRow | null;
  /** The ledger entry when a gate fired; null when eligible. */
  refusal: RefusalEntry | null;
  /** The latest stored draft opening, re-checked on the way through. */
  opening: StoredOpening | null;
  asOfMs: number;
  asOfIso: string;
}

/**
 * Assemble the draft. Pure: same inputs, same brief, byte for byte.
 *
 * The score, confidence and band are READ OFF the queue row or the refusal entry —
 * never recomputed here. That is why `briefFor` runs the target through the same
 * `buildOriginationQueue` the queue route uses: a brief whose numbers can disagree
 * with the queue's is a second implementation of the ranking wearing a different
 * name, and one of the two would eventually be the one he reads out loud.
 */
export function composeBriefDraft(comp: BriefComposition): BriefDraft {
  const { loaded, row, refusal, opening, asOfMs } = comp;
  const { target } = loaded.record;
  const assertions: BriefAssertion[] = [];

  // (3) The system's own findings, dated by when a human last recorded the
  // decisions they rest on. Graded B2 — 'usually reliable' / 'probably true' — and
  // NOT A1: this is our own record of our own decisions, and grading an internal
  // inference 'confirmed by other sources' would be the flattery this file exists
  // to avoid.
  const rowProvenance = (label: string): FactProvenance =>
    factProvenance(
      { field: 'gps_target', label, sourceId: 'internal', credibility: 2, observedIso: loaded.record.updatedIso },
      asOfMs,
    );

  if (target.jurisdiction) {
    assertions.push({
      id: 'situation:jurisdiction',
      section: 'situation',
      text: `Jurisdiction recorded as "${target.jurisdiction}" (free text, as a human typed it — no perimeter is inferred from it).`,
      status: 'SOURCED',
      provenance: rowProvenance('Target record — jurisdiction'),
    });
  }

  // (1) Facts with provenance, in SCORING_FIELDS order so two briefs of the same
  // target list their claims identically and a diff between them means something.
  const factByField = new Map<string, FactProvenance>();
  for (const f of loaded.input.facts ?? []) {
    factByField.set(f.field, factProvenance(f, asOfMs));
  }
  for (const { field } of SCORING_FIELDS) {
    const key = String(field);
    const meta = FIELD_META[key];
    const value = fieldValueText(key, target);
    if (meta == null || value == null) continue;
    const provenance = factByField.get(key) ?? null;
    if (provenance != null) {
      assertions.push({
        id: `fact:${key}`,
        section: meta.section,
        text: `${meta.label}: ${value}.`,
        status: 'SOURCED',
        provenance,
      });
      continue;
    }
    // (2) A value already moving the score with nothing behind it. It is stated,
    // labelled UNVERIFIED and carries no provenance — which is what makes
    // `opening_cites_unverified` able to block an outreach line that leans on it.
    assertions.push({
      id: `unsourced:${key}`,
      section: meta.section,
      text: `${meta.label}: ${value}. NO SOURCE IS ATTACHED — this value is moving the score with nothing behind it.`,
      status: 'UNVERIFIED',
      provenance: null,
    });
  }

  // The why-now, with the grade and date of the source that recorded it.
  const trigger = loaded.input.trigger ? resolveTrigger(loaded.input.trigger, asOfMs) : null;
  if (trigger != null) {
    assertions.push({
      id: 'why-now',
      section: 'timing',
      text: `${trigger.kindLabel}: ${trigger.statement}`,
      status: 'SOURCED',
      provenance: trigger.provenance,
    });
  }

  // Every gate that fired, with the reason verbatim from the engine. A refused
  // target still gets a brief — you need to know who they are before you write the
  // decline — and it carries the wall it hit.
  for (const gate of refusal?.gates ?? []) {
    assertions.push({
      id: `gate:${gate.key}`,
      section: 'risk',
      text: gate.reason,
      status: 'SOURCED',
      provenance: rowProvenance(`Recorded decisions — ${gate.key}`),
    });
  }

  const confidence = row?.confidence ?? refusal?.confidence.confidence ?? 0;
  const band = row?.band ?? refusal?.confidence.band ?? 'low';
  const missingFactors = row?.missingFactors ?? refusal?.confidence.missingFactors ?? [];
  const penalties = row?.confidencePenalties ?? refusal?.confidence.penalties ?? [];

  return {
    targetId: target.id,
    name: target.name,
    asOf: comp.asOfIso,
    score: row?.score ?? null,
    confidence,
    band,
    gates: refusal?.gates ?? [],
    assertions,
    // `unprovenanced` is deliberately NOT passed: every unsourced field already
    // appears above as an UNVERIFIED assertion in its own section, and
    // `deriveUnknowns` would repeat each one as a second line. The same gap counted
    // twice reads as two gaps, which is its own small dishonesty.
    unknowns: deriveUnknowns({
      missingFactors,
      confidencePenalties: penalties,
      triggerState: trigger?.state ?? 'absent',
    }),
    trigger,
    proposedOpening: opening
      ? {
          text: opening.text,
          citedAssertionIds: opening.citedAssertionIds,
          assertsNothing: opening.assertsNothing,
          // The literal `false`, from the shared type. This module cannot construct
          // an approved opening and there is no column that would let it.
          approvedForSend: false,
        }
      : null,
  };
}

/* ── What the routes call ──────────────────────────────────────────────────── */

export interface QueueOptions {
  capacity?: number;
  limit?: number;
  asOfMs: number;
}

/**
 * The queue, the deferred cut, the refusal ledger and the derived counts.
 *
 * `originationResponse` is the ONLY place `counts` is computed (shared
 * `origination.ts:1210`) and this function does not touch them. GPS has already
 * shipped a surface whose `counts` field never existed on the response at all (plan
 * §1, D8); the fix is not "be careful", it is that the count and the arrays it
 * counts are built in one expression by one function that has a test.
 */
export async function queueFor(pool: Pool, opts: QueueOptions): Promise<OriginationResponse> {
  const loaded = await loadTargets(pool, {
    asOfMs: opts.asOfMs,
    limit: opts.limit,
    triggerKinds: TRIGGER_KINDS,
  });
  const queue = buildOriginationQueue(
    loaded.map((l) => l.input),
    { asOf: opts.asOfMs, capacity: opts.capacity },
  );
  return originationResponse(queue, new Date(opts.asOfMs).toISOString());
}

/**
 * One target's brief, with its refusal beside it when it has one.
 *
 * THE TARGET GOES THROUGH `buildOriginationQueue`, capacity 1, exactly as the queue
 * route does. It is a one-row queue and that is the point: the score, the drivers,
 * the confidence band, the provenance and the gate reasons all come from the same
 * call the queue makes, so the brief cannot quote a number the queue disagrees
 * with. Assessing the target separately here would be cheaper and would eventually
 * produce two truths.
 *
 * Returns null when the target does not exist, so the route can answer 404 rather
 * than a brief about nobody.
 */
export async function briefFor(
  pool: Pool,
  targetId: string,
  opts: { asOfMs: number },
): Promise<BriefResponse | null> {
  const loaded = await loadTargets(pool, {
    asOfMs: opts.asOfMs,
    targetId,
    triggerKinds: TRIGGER_KINDS,
  });
  const one = loaded[0];
  if (one == null) return null;

  const queue = buildOriginationQueue([one.input], { asOf: opts.asOfMs, capacity: 1 });
  const row = queue.rows[0] ?? null;
  const refusal = queue.refusals.entries[0] ?? null;
  const opening = await latestOpening(pool, targetId);

  const asOfIso = new Date(opts.asOfMs).toISOString();
  const draft = composeBriefDraft({ loaded: one, row, refusal, opening, asOfMs: opts.asOfMs, asOfIso });
  return {
    generatedIso: asOfIso,
    // `sealBrief` is the only constructor of a `ResearchBrief` and it runs
    // `briefIntegrity` on the way through, so a brief cannot reach a surface or a
    // printer without a verdict attached (shared `origination.ts:1131`).
    brief: sealBrief(draft, asOfIso),
    refusal,
  };
}

/**
 * Would this opening survive the integrity check? Used by the write path BEFORE it
 * stores anything.
 *
 * Same predicate, same function, one code path: the draft is composed with the
 * proposed opening in place and sealed, and the verdict that comes back is the same
 * verdict the read path will produce. A separate "validate the opening" routine
 * would drift from the one that judges it afterwards — and the direction it would
 * drift is towards accepting.
 */
export async function evaluateOpening(
  pool: Pool,
  args: {
    targetId: string;
    text: string;
    citedAssertionIds: readonly string[];
    assertsNothing: boolean;
    asOfMs: number;
  },
): Promise<{ ok: boolean; response: BriefResponse } | null> {
  const loaded = await loadTargets(pool, {
    asOfMs: args.asOfMs,
    targetId: args.targetId,
    triggerKinds: TRIGGER_KINDS,
  });
  const one = loaded[0];
  if (one == null) return null;

  const queue = buildOriginationQueue([one.input], { asOf: args.asOfMs, capacity: 1 });
  const asOfIso = new Date(args.asOfMs).toISOString();
  const draft = composeBriefDraft({
    loaded: one,
    row: queue.rows[0] ?? null,
    refusal: queue.refusals.entries[0] ?? null,
    opening: {
      id: 'pending',
      targetId: args.targetId,
      text: args.text,
      citedAssertionIds: [...args.citedAssertionIds],
      assertsNothing: args.assertsNothing,
      integrityOkAtDraft: false,
      draftedBy: '',
      createdIso: asOfIso,
    },
    asOfMs: args.asOfMs,
    asOfIso,
  });
  const brief = sealBrief(draft, asOfIso);
  return {
    ok: brief.integrity.ok,
    response: { generatedIso: asOfIso, brief, refusal: queue.refusals.entries[0] ?? null },
  };
}
