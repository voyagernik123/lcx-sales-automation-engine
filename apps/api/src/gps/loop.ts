import type { Pool } from 'pg';
import {
  BOOK_MONITOR_SPECS,
  EMPTY_OUTCOME_CAPTURE_DRAFT,
  LOOP_VOLUME_STATEMENT,
  LOSS_REASONS,
  MIN_N_FOR_RATE,
  OFFER_KEYS,
  WEIGHTS_V1,
  WIN_REASONS,
  calibrationHealthView,
  loopResponse,
  marginRealisation,
  MONITOR_INPUT_LABEL,
  monitorRegistrability,
  outcomeCaptureForm,
  reviewPacket,
  suppressibleRate,
  winLossSummary,
  type CalibrationHealthView,
  type CaptureSubject,
  type EngagementStatus,
  type LoopResponse,
  type MarginRealisation,
  type MonitorInputAvailability,
  type MonitorInputKey,
  type MonitorRegistrability,
  type OfferKey,
  type OutcomeCaptureDraft,
  type OutcomeCaptureForm,
  type OutcomeDisposition,
  type OutcomeReason,
  type OutcomeRecord,
  type ReviewPacket,
  type SuppressibleRate,
  type WinLossSummary,
  type WaterfallShape,
  type WipLoad,
} from '@lcx/shared';
import { weekStartOf } from '../kpi/wbr.js';
import { waterfallMeasurement } from './factory.js';

/**
 * GLOBAL SERVICES — Phase 12 data layer: THE OUTCOME LOOP.
 *
 * `packages/shared/src/gps/loop.ts` is 1,475 lines of engine that had no way to
 * reach a database. This file is that way, and nothing more: it reads rows, maps
 * them to `OutcomeRecord`, hands them to the shared functions, and returns what
 * those functions return. No arithmetic is performed here — every number on the
 * wire is produced by `winLossSummary`, `marginRealisation`, `weightReviewPacket`
 * or `calibrationHealth`, so the API cannot disagree with the engine's thresholds.
 *
 * ══ THE HONESTY REQUIREMENT IS THE FEATURE ══
 * Below `MIN_N_FOR_RATE` (8, `calibration.ts:243`) there is no percentage. The
 * engine already returns `winRatePct: null` with `rateSuppressed: true` and a
 * reason, and this file's job is to NOT undo that on the way out: no `?? 0`, no
 * `Math.round(won / n * 100)`, no "0%" for an empty book. A rate computed on
 * three engagements is the vanity number in a spreadsheet that this whole
 * programme exists to replace, and `__tests__/loop.test.ts` asserts its absence at
 * the ROUTE boundary — over the serialised JSON, not over an engine return value —
 * because the engine being right has never been the failure mode.
 *
 * ══ A LOSS MUST BE REPRESENTABLE ══
 * Realised partner cost MAY EXCEED realised price. At $10–25k one scope overrun
 * eats the engagement, so that is the case the founder most needs to see, and it
 * is the case a defensive `Math.abs` or a `GREATEST(0, ...)` would erase. There is
 * no absolute value anywhere in this file and no CHECK in the migration below
 * relating the two figures. Margin stays DERIVED (`marginCents`, `types.ts`) and
 * signed; slippage stays signed (`MarginGroup.slippageMeanCents`).
 *
 * ══ THE ARTIFACT LOCKOUT STILL HOLDS ══
 * An outcome is nine scalars and a JSON map of quote-time factor scores. It is not
 * a report, an invoice PDF or a signed acceptance certificate. Nothing here reads
 * bytes, dereferences a location, or stores anything a client sent — decision D2
 * (controller vs processor for third-party confidential material) is still
 * unanswered, and `__tests__/intakeLockout.test.ts` discovers this file by path and
 * will fail the build if that changes.
 *
 * ══ MIGRATION-PENDING DISCIPLINE ══
 * Same as `service.ts`: the table this file needs DOES NOT EXIST YET. Reads answer
 * 200 with a well-shaped body and `migrated: false`; writes answer 503, never 500.
 * The DDL a human must apply is specified in `OUTCOME_MIGRATION_SPEC` below, as
 * data, so the API can print exactly what is missing instead of a 500 that reads
 * as "the platform is down".
 */

/**
 * The migration a human must write and apply. Named in every 503.
 *
 * 0053, RENUMBERED 2026-08-01, and the reason is the whole point of naming a file in
 * an error message. This said `0051_gps_outcome.sql` — and `0051_gps_evidence_refusal.sql`
 * is on disk AND applied on production. So an operator told "awaiting migration 0051"
 * looked in `_migrations`, found 0051 applied, and concluded the API was lying to
 * them: the exact reaction `MIGRATION_PENDING` exists to prevent. The comment that
 * used to sit here claimed the number was "checked against the directory rather than
 * assumed", and nothing checked it.
 *
 * The three unapplied GPS migrations now hold distinct, free numbers and each is
 * declared exactly once: 0052 underwriting (`gps/underwrite.ts`), 0053 outcome (here),
 * 0054 origination (`routes/gpsOrigination.ts`). `deploySafety.test.ts` asserts none of
 * them collides with a file that exists.
 */
export const OUTCOME_MIGRATION = '0053_gps_outcome.sql';

/**
 * What the pending migration must contain, as data rather than a comment, so a
 * 503 can carry it and the operability audit can read it.
 *
 * WHY A NEW TABLE AND NOT COLUMNS ON `gps_engagement`. Four of these nine fields
 * genuinely could live there (`realised_price_cents`, `realised_vendor_cost_cents`,
 * `cycle_time_days`, `acceptance_first_pass`). The other five cannot without
 * damage: `disposition`/`reason` duplicate `status` and would let a row say
 * `status='collected', disposition='lost'`; `factor_scores_at_quote` is a
 * snapshot whose whole point is that it is frozen against a versioned scorer
 * (`calibration.ts:150`), and a nullable jsonb on the pipeline table invites a
 * recompute-in-place; and an outcome needs its own `recorded_by`/`recorded_at`,
 * which is the attribution `updated_at` on the engagement destroys on the next
 * status change. One row per engagement, so the quoted side stays exactly where
 * it was frozen and the realised side is a separate, attributable act.
 */
export const OUTCOME_MIGRATION_SPEC = {
  file: OUTCOME_MIGRATION,
  table: 'gps_outcome',
  columns: [
    'engagement_id uuid PRIMARY KEY REFERENCES gps_engagement(id) ON DELETE CASCADE — one outcome per engagement; the PK IS the idempotency key, so a re-submitted close updates rather than double-counting the book',
    "disposition text NOT NULL CHECK (disposition IN ('won','lost')) — mirrors OutcomeDisposition (calibration.ts:71). Cancelled is NOT a disposition: it is the excluded case, and excluding it is disclosed on every response",
    'reason text NOT NULL — validated against WIN_REASONS/LOSS_REASONS at the edge by isReasonValidFor; a CHECK listing 12 literals here would go stale against the union',
    'realised_price_cents bigint CHECK (realised_price_cents >= 0) — NULLABLE. Null for lost and for won-but-not-yet-invoiced. NEVER defaulted to price_cents: that default would read as zero discount forever and destroy priceSlippageMeanCents (calibration.ts:526)',
    'realised_vendor_cost_cents bigint CHECK (realised_vendor_cost_cents >= 0) — NULLABLE, same reason',
    'cycle_time_days integer CHECK (cycle_time_days >= 0) — NULLABLE. Stored and NOT aggregated by anything (calibration.ts:150); the capture form says so rather than implying a dashboard',
    'acceptance_first_pass boolean — NULLABLE, and null is not false: "not delivered" and "failed first pass" are opposite facts',
    'partner text — NULLABLE. Text, not an FK: the bench is not a table (0047 precedent for owner)',
    'factor_scores_at_quote jsonb — NULLABLE. Snapshot, never recomputed. Null means the engagement predates scoring, which weightReviewPacket counts as absent evidence rather than a zero',
    'decided_at date NOT NULL — a decision DATE, not a timestamptz: the WBR windows on it, and a timestamptz makes the Monday boundary depend on the reader\'s zone',
    'recorded_by text NOT NULL — desk roster id from c.get(\'operator\').id, never a body field. This is what makes the row a record rather than a suggestion',
    'recorded_at timestamptz NOT NULL DEFAULT now()',
    'updated_at timestamptz NOT NULL DEFAULT now()',
  ],
  indexes: [
    'CREATE INDEX IF NOT EXISTS gps_outcome_decided_idx ON gps_outcome (decided_at DESC) — the WBR week window and every ORDER BY here',
    'CREATE INDEX IF NOT EXISTS gps_outcome_disposition_idx ON gps_outcome (disposition) — win/loss counts',
    'CREATE INDEX IF NOT EXISTS gps_outcome_partner_idx ON gps_outcome (partner) WHERE partner IS NOT NULL — marginRealisation.byPartner is the action list',
  ],
  rls: 'ALTER TABLE gps_outcome ENABLE ROW LEVEL SECURITY; NO POLICIES — deny-all, exactly as 0047_gps.sql:361 and 0049_gps_delivery.sql:518. This table holds what a third party actually paid and what the partner actually charged, i.e. LCX margin per counterparty: the single most sensitive table in the compartment. RLS with no policy closes the Supabase anon-key path; the entitlement gate does the rest.',
  forbidden: [
    'NO CHECK relating realised_vendor_cost_cents to realised_price_cents. A realised loss (cost > price) is a real, expected state and the number the founder most needs; a CHECK would make it unrepresentable and turn a bad engagement into a 500.',
    'NO margin column. Margin is derived (marginCents, packages/shared/src/gps/types.ts) so it cannot go stale against the price.',
    'NO DEFAULT on realised_price_cents or realised_vendor_cost_cents. Absent must stay absent — marginRealisation counts those separately as excludedIncompleteRealisation (calibration.ts:557).',
    'NO artifact, attachment, location or url column. Decision D2 is unanswered; intakeLockout.test.ts discovers migrations by content and will fail on one.',
  ],
} as const;

/**
 * Reads degrade to this; writes answer 503 with it. Never 500, for the reason
 * `service.ts` gives: during the deploy-before-migration window a 500 reads as
 * "the platform is down", and that is the reading the desk acts on.
 */
export const OUTCOME_NOT_MIGRATED = {
  error: `GPS outcome capture is awaiting migration ${OUTCOME_MIGRATION} (table gps_outcome) on this environment`,
  code: 'MIGRATION_PENDING',
} as const;

/**
 * Probe, cached per process — same shape and same reasoning as
 * `service.ts:80`. `to_regclass` returns NULL on absence instead of throwing, so
 * the probe can never itself be the error.
 *
 * SEPARATE from `isMigrated`: 0047 (the pipeline) and this table ship in different
 * migrations, and a deploy where 0047 is applied and 0050 is not is the expected
 * state for as long as it takes someone to run one file. Reusing the 0047 probe
 * would report the loop as available and then 500 on the first read.
 */
let outcomeMigratedCache: boolean | null = null;

export async function isOutcomeMigrated(pool: Pool): Promise<boolean> {
  if (outcomeMigratedCache !== null) return outcomeMigratedCache;
  try {
    const res = await pool.query(`SELECT to_regclass('public.gps_outcome') IS NOT NULL AS ok`);
    outcomeMigratedCache = Boolean(res.rows[0]?.ok);
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
    console.error('[gps] outcome migration probe failed; not caching the negative:', err);
    return false;
  }
  return outcomeMigratedCache;
}

/** Test-only: forget the probe. */
export function _resetOutcomeMigrated(): void {
  outcomeMigratedCache = null;
}

/* ── Row mapping ──────────────────────────────────────────────────────────────
 *  `bigint` arrives from node-postgres as a STRING (service.ts:109 explains the
 *  `"1200000" + 0 === "12000000"` bug this prevents). The difference here is that
 *  a realised figure may be legitimately NULL, and null must survive: `cents()` in
 *  service.ts folds null to 0, which is exactly wrong for this table — 0 means
 *  "invoiced nothing", null means "not invoiced yet", and `marginRealisation`
 *  treats them completely differently.
 */

/** Integer cents, or null. Null in → null out. No clamping, no absolute value. */
function centsOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Integer cents for a NOT NULL quoted column. Absent means 0 there (0047 DEFAULT 0). */
function cents(v: unknown): number {
  return centsOrNull(v) ?? 0;
}

/** Whole non-negative integer, or null. */
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * `date` → YYYY-MM-DD. node-postgres hands back a Date for `date` columns
 * constructed in the LOCAL zone, so `toISOString()` on it can move the day
 * backwards west of UTC — which would move a decision into the previous WBR week.
 * The local getters are therefore the correct readers for a date-only column.
 */
function dateOnly(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v ?? '').slice(0, 10);
}

/** Factor scores: jsonb → a flat map of finite numbers, or null. Never partially trusted. */
function factorScores(v: unknown): Readonly<Record<string, number>> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const isOfferKey = (v: unknown): v is OfferKey => OFFER_KEYS.includes(v as OfferKey);
const REASONS: readonly string[] = [...WIN_REASONS, ...LOSS_REASONS];

interface OutcomeJoinRow {
  engagement_id: string;
  client_id: string;
  offer_key: string;
  disposition: string;
  reason: string;
  price_cents: unknown;
  realised_price_cents: unknown;
  vendor_cost_cents: unknown;
  realised_vendor_cost_cents: unknown;
  cycle_time_days: unknown;
  acceptance_first_pass: boolean | null;
  partner: string | null;
  factor_scores_at_quote: unknown;
  decided_at: unknown;
}

/**
 * A joined row → `OutcomeRecord`.
 *
 * THE QUOTED SIDE COMES FROM THE JOIN, NEVER FROM THIS TABLE. `quotedPriceCents`
 * and `quotedVendorCostCents` are `gps_engagement.price_cents` /
 * `vendor_cost_cents` (0047), frozen at quote time. Copying them onto the outcome
 * row at close is the mechanism by which every slippage number quietly becomes
 * zero: whoever types the realised figure types the quoted one to match.
 *
 * Returns null on a row whose enums the database allowed but the union does not —
 * a refusal, counted and disclosed by the caller (D2), never coerced into a
 * plausible-looking record.
 */
function toOutcomeRecord(r: OutcomeJoinRow): OutcomeRecord | null {
  if (!isOfferKey(r.offer_key)) return null;
  if (r.disposition !== 'won' && r.disposition !== 'lost') return null;
  if (!REASONS.includes(r.reason)) return null;
  return {
    engagementId: r.engagement_id,
    clientId: r.client_id,
    offerKey: r.offer_key,
    disposition: r.disposition as OutcomeDisposition,
    reason: r.reason as OutcomeReason,
    quotedPriceCents: cents(r.price_cents),
    realisedPriceCents: centsOrNull(r.realised_price_cents),
    quotedVendorCostCents: cents(r.vendor_cost_cents),
    realisedVendorCostCents: centsOrNull(r.realised_vendor_cost_cents),
    cycleTimeDays: intOrNull(r.cycle_time_days),
    acceptanceFirstPass: typeof r.acceptance_first_pass === 'boolean' ? r.acceptance_first_pass : null,
    partner: r.partner?.trim() ? r.partner.trim() : null,
    factorScoresAtQuote: factorScores(r.factor_scores_at_quote),
    decidedAt: dateOnly(r.decided_at),
  };
}

/* ── Reads ────────────────────────────────────────────────────────────────────
 *  Parameterised throughout. The only interpolation anywhere in this file is the
 *  `to_regclass` literal in the probe, which contains no input.
 */

/** One SELECT list, used by both readers, so the two can never drift apart. */
const OUTCOME_SELECT = `
  SELECT o.engagement_id, e.client_id, e.offer_key,
         o.disposition, o.reason,
         e.price_cents, o.realised_price_cents,
         e.vendor_cost_cents, o.realised_vendor_cost_cents,
         o.cycle_time_days, o.acceptance_first_pass, o.partner,
         o.factor_scores_at_quote, o.decided_at
    FROM gps_outcome o
    JOIN gps_engagement e ON e.id = o.engagement_id`;

/**
 * Records, and the count this file REFUSED to map.
 *
 * `rejected` is surfaced rather than logged: a row the database accepted and the
 * union rejects means the CHECK constraints and the TypeScript union have
 * diverged, and a silently shorter array would show up as a win rate that quietly
 * moved (D2 — no silent exclusion).
 */
export interface OutcomeRecordSet {
  records: readonly OutcomeRecord[];
  rejected: number;
}

/** Every decided outcome on file, oldest first. Pooled aggregates need the whole history. */
export async function listOutcomeRecords(pool: Pool, limit = 2000): Promise<OutcomeRecordSet> {
  const capped = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 5000) : 2000;
  const res = await pool.query<OutcomeJoinRow>(
    `${OUTCOME_SELECT} ORDER BY o.decided_at ASC, o.engagement_id ASC LIMIT $1`,
    [capped],
  );
  return collect(res.rows);
}

/**
 * Outcomes decided during one WBR week, `[weekStart, weekStart + 7 days)`.
 *
 * Half-open on purpose: `BETWEEN weekStart AND weekStart + 7` double-counts the
 * following Monday, which at ~29 engagements a year is a 100% error on a week.
 */
export async function outcomeRecordsInWeek(pool: Pool, weekStart: string): Promise<OutcomeRecordSet> {
  const res = await pool.query<OutcomeJoinRow>(
    `${OUTCOME_SELECT}
      WHERE o.decided_at >= $1::date
        AND o.decided_at <  ($1::date + INTERVAL '7 days')
      ORDER BY o.decided_at ASC, o.engagement_id ASC`,
    [weekStart],
  );
  return collect(res.rows);
}

function collect(rows: readonly OutcomeJoinRow[]): OutcomeRecordSet {
  const records: OutcomeRecord[] = [];
  let rejected = 0;
  for (const row of rows) {
    const rec = toOutcomeRecord(row);
    if (rec) records.push(rec);
    else rejected += 1;
  }
  return { records, rejected };
}

interface SubjectRow {
  id: string;
  client_id: string;
  offer_key: string;
  status: string;
  price_cents: unknown;
  vendor_cost_cents: unknown;
}

/**
 * The read-only facts the capture form is built on. Reads `gps_engagement`, which
 * 0047 created — so this works while 0050 is still pending, and the form can be
 * shown (and its blockers read) before the table to save it into exists.
 */
export async function getCaptureSubject(pool: Pool, engagementId: string): Promise<CaptureSubject | null> {
  const res = await pool.query<SubjectRow>(
    `SELECT id, client_id, offer_key, status, price_cents, vendor_cost_cents
       FROM gps_engagement WHERE id = $1 LIMIT 1`,
    [engagementId],
  );
  const r = res.rows[0];
  if (!r || !isOfferKey(r.offer_key)) return null;
  return {
    engagementId: r.id,
    clientId: r.client_id,
    offerKey: r.offer_key,
    status: r.status as EngagementStatus,
    quotedPriceCents: cents(r.price_cents),
    quotedVendorCostCents: cents(r.vendor_cost_cents),
  };
}

interface StoredDraftRow {
  disposition: string;
  reason: string;
  realised_price_cents: unknown;
  realised_vendor_cost_cents: unknown;
  cycle_time_days: unknown;
  acceptance_first_pass: boolean | null;
  partner: string | null;
  factor_scores_at_quote: unknown;
  decided_at: unknown;
}

/**
 * The already-recorded outcome for an engagement, as a DRAFT to re-open.
 *
 * Returns `EMPTY_OUTCOME_CAPTURE_DRAFT` when nothing is stored — the empty draft
 * is a legitimate state the engine models (`completeness: 'empty'`), not an error.
 */
export async function getStoredDraft(pool: Pool, engagementId: string): Promise<OutcomeCaptureDraft> {
  const res = await pool.query<StoredDraftRow>(
    `SELECT disposition, reason, realised_price_cents, realised_vendor_cost_cents,
            cycle_time_days, acceptance_first_pass, partner,
            factor_scores_at_quote, decided_at
       FROM gps_outcome WHERE engagement_id = $1 LIMIT 1`,
    [engagementId],
  );
  const r = res.rows[0];
  if (!r) return EMPTY_OUTCOME_CAPTURE_DRAFT;
  const disposition = r.disposition === 'won' || r.disposition === 'lost' ? r.disposition : null;
  return {
    disposition,
    reason: REASONS.includes(r.reason) ? (r.reason as OutcomeReason) : null,
    realisedPriceCents: centsOrNull(r.realised_price_cents),
    realisedVendorCostCents: centsOrNull(r.realised_vendor_cost_cents),
    cycleTimeDays: intOrNull(r.cycle_time_days),
    acceptanceFirstPass: typeof r.acceptance_first_pass === 'boolean' ? r.acceptance_first_pass : null,
    partner: r.partner?.trim() ? r.partner.trim() : null,
    decidedAt: r.decided_at ? dateOnly(r.decided_at) : null,
    factorScoresAtQuote: factorScores(r.factor_scores_at_quote),
  };
}

/* ── The write ────────────────────────────────────────────────────────────── */

/** What `recordOutcome` returns. `stored` is false whenever the engine refused. */
export interface RecordOutcomeResult {
  form: OutcomeCaptureForm;
  stored: boolean;
}

/**
 * Record an outcome at close.
 *
 * GOVERNED, in the three senses that are available without owning
 * `actions/registry.ts`:
 *
 *  1. THE ENGINE IS THE GATE. `outcomeCaptureForm` decides whether these facts
 *     constitute a record: `form.record === null` means blocked, and this function
 *     writes NOTHING in that case. It does not re-implement the checks — there is
 *     no second opinion here to drift from `loop.ts:368`, which is why a "won"
 *     before acceptance and a realised price on a loss are refused at the API with
 *     the same wording the surface shows.
 *  2. ATTRIBUTION IS THE OPERATOR, NEVER A BODY FIELD. `recordedBy` comes from
 *     `c.get('operator').id` at the route (`routes/gps.ts` header states the same
 *     rule for the conflict check). A margin figure nobody is named against is a
 *     rumour.
 *  3. IDEMPOTENT BY PRIMARY KEY. `ON CONFLICT (engagement_id) DO UPDATE` — closing
 *     the same engagement twice corrects one row instead of adding a second win to
 *     the book. At ~29 engagements a year a duplicated outcome is a 3% error in
 *     every rate on every surface.
 *
 * NOT YET GOVERNED, and stated rather than implied: this does not go through
 * `invokeAction`, so there is no `object_actions` ledger row and no hash-chained
 * `audit_log` entry for it. That requires a sixth entry in `GPS_ACTIONS`
 * (`apps/api/src/gps/actions.ts`) and a registry line, neither of which this phase
 * owns. `recorded_by`/`recorded_at` on the row are the interim attribution, and the
 * wiring note in the phase report names the action to add.
 */
export async function recordOutcome(
  pool: Pool,
  args: { subject: CaptureSubject; draft: OutcomeCaptureDraft; recordedBy: string },
): Promise<RecordOutcomeResult> {
  const form = outcomeCaptureForm(args.subject, args.draft);
  const record = form.record;
  if (!record) return { form, stored: false };

  await pool.query(
    `INSERT INTO gps_outcome (
       engagement_id, disposition, reason,
       realised_price_cents, realised_vendor_cost_cents,
       cycle_time_days, acceptance_first_pass, partner,
       factor_scores_at_quote, decided_at, recorded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::date,$11)
     ON CONFLICT (engagement_id) DO UPDATE SET
       disposition                = EXCLUDED.disposition,
       reason                     = EXCLUDED.reason,
       realised_price_cents       = EXCLUDED.realised_price_cents,
       realised_vendor_cost_cents = EXCLUDED.realised_vendor_cost_cents,
       cycle_time_days            = EXCLUDED.cycle_time_days,
       acceptance_first_pass      = EXCLUDED.acceptance_first_pass,
       partner                    = EXCLUDED.partner,
       factor_scores_at_quote     = EXCLUDED.factor_scores_at_quote,
       decided_at                 = EXCLUDED.decided_at,
       recorded_by                = EXCLUDED.recorded_by,
       updated_at                 = now()`,
    [
      record.engagementId,
      record.disposition,
      record.reason,
      // Passed as-is: null stays null. A `?? 0` here is the bug that would make
      // every unbilled win look like a 100% discount.
      record.realisedPriceCents,
      record.realisedVendorCostCents,
      record.cycleTimeDays,
      record.acceptanceFirstPass,
      record.partner,
      record.factorScoresAtQuote ? JSON.stringify(record.factorScoresAtQuote) : null,
      record.decidedAt,
      args.recordedBy,
    ],
  );

  return { form, stored: true };
}

/* ── Composition ──────────────────────────────────────────────────────────────
 *  EVERY ROUTE'S `data` IS A SHARED TYPE OR A `Pick` OF ONE. There is no
 *  API-local response interface in this file and there must not be one in
 *  `apps/web/src/lib/api/*` either: a hand-copied web interface that declared
 *  fields the API never returned took production down this week, `tsc` believed it
 *  and the mocked test agreed with it. `WinLossSummary`, `MarginRealisation`,
 *  `ReviewPacket`, `CalibrationHealthView`, `OutcomeCaptureForm` and `LoopResponse`
 *  are all declared exactly once, in `packages/shared/src/gps/`, and both sides
 *  import that declaration.
 */

/** Win/loss, engine shape verbatim — `WinLossAggregate` already carries suppression. */
export async function winLossView(pool: Pool): Promise<WinLossSummary> {
  const { records } = await listOutcomeRecords(pool);
  return winLossSummary(records);
}

/**
 * Margin realisation, engine shape verbatim.
 *
 * Signed throughout. `overall` is NULL rather than a zeroed group when no
 * engagement has both realised figures, and `excludedIncompleteRealisation` names
 * the hole. A caller that renders null as 0 is inventing a break-even book.
 */
export async function marginView(pool: Pool): Promise<MarginRealisation> {
  const { records } = await listOutcomeRecords(pool);
  return marginRealisation(records);
}

/** Calibration health — carries "nothing can be concluded" as a verdict, not an empty state. */
export async function healthView(pool: Pool): Promise<CalibrationHealthView> {
  const { records } = await listOutcomeRecords(pool);
  return calibrationHealthView(records);
}

/**
 * The quarterly review packet.
 *
 * `WEIGHTS_V1` is passed BY REFERENCE and comes back unmutated —
 * `weightReviewPacket` returns a frozen shallow copy (`calibration.ts:673`) and
 * `reviewPacket` documents that it deliberately does not clone again. A colocated
 * test asserts `WEIGHTS_V1` is deep-equal after a request, because the one thing a
 * review instrument must never do is quietly become a trainer.
 */
export async function reviewView(pool: Pool): Promise<ReviewPacket> {
  const { records } = await listOutcomeRecords(pool);
  return reviewPacket(records, WEIGHTS_V1);
}

/** The monitor specifications, as data. No DB, no probe — code constants only. */
/**
 * WHAT THE REGISTERS ACTUALLY HOLD — the five founder inputs, MEASURED.
 *
 * `monitorRegistrability` refuses to default a missing key to `true` precisely so a
 * monitor cannot light up on inputs nobody supplied, which means someone has to go
 * and look. This is that someone.
 *
 * AN ABSENT REGISTER IS AN ABSENT INPUT, so a failed probe answers `false` rather
 * than throwing or being cached. That is both honest (the input genuinely is not
 * there) and conservative in the safe direction: an unapplied migration can only
 * ever make a monitor look LESS ready, never more. Migrations 0076/0079 are ledgered
 * and unapplied today, so several of these are false for that reason and the screen
 * says which.
 *
 * `perimeter_reviewed` encodes the SECOND-HUMAN rule rather than mere presence: a row
 * whose reviewer is its own author is not reviewed, and `MONITOR_INPUT_LABEL` promises
 * "never the proposer" — so the SQL compares the two names instead of trusting one.
 */
export async function monitorInputAvailability(pool: Pool): Promise<MonitorInputAvailability> {
  const has = async (sql: string): Promise<boolean> => {
    try {
      const r = await pool.query(sql);
      return r.rows.length > 0;
    } catch {
      return false;
    }
  };
  const [priceBands, effortTriples, pricingPolicy, partnerBench, perimeterReviewed] = await Promise.all([
    has(`SELECT 1 FROM gps_price_band LIMIT 1`),
    has(`SELECT 1 FROM gps_effort_triple LIMIT 1`),
    has(`SELECT 1 FROM gps_pricing_policy LIMIT 1`),
    has(`SELECT 1 FROM gps_rate_card LIMIT 1`),
    has(
      `SELECT 1 FROM gps_jurisdiction_profile
        WHERE reviewed_at IS NOT NULL
          AND btrim(coalesce(reviewed_by, '')) <> ''
          AND btrim(reviewed_by) <> btrim(entered_by)
        LIMIT 1`,
    ),
  ]);
  return {
    price_bands: priceBands,
    effort_triples: effortTriples,
    pricing_policy: pricingPolicy,
    partner_bench: partnerBench,
    perimeter_reviewed: perimeterReviewed,
  };
}

export interface MonitorsView extends Pick<LoopResponse, 'monitors' | 'registerableMonitorKeys' | 'volume'> {
  /** Per monitor: registerable, and if not, exactly which inputs are missing. */
  registrability: readonly MonitorRegistrability[];
  /** What was measured, so the reader can check the verdict rather than trust it. */
  inputs: MonitorInputAvailability;
  /** The owner-facing name of each input, for the remedy line. */
  inputLabels: Record<MonitorInputKey, string>;
}

/**
 * `registerableMonitorKeys` USED TO BE A SHIPPED CONSTANT — `!blockedOnPlaceholders`,
 * decided when the file was written. It is now measured against the registers.
 *
 * On today's environment the two answers AGREE (the two unblocked specs declare
 * `requiresInputs: []`, so no register can take them away), and that agreement is
 * asserted in the tests rather than assumed. What changes is the future: the day the
 * owner approves the price-band and effort-triple packets, the other three monitors
 * become registerable BY MEASUREMENT, with nobody editing a constant — which is the
 * whole difference between a claim and an instrument.
 */
export async function monitorsView(pool: Pool): Promise<MonitorsView> {
  const inputs = await monitorInputAvailability(pool);
  const registrability = monitorRegistrability(inputs);
  return {
    monitors: BOOK_MONITOR_SPECS,
    registerableMonitorKeys: registrability.filter((r) => r.registerable).map((r) => r.spec.key),
    volume: LOOP_VOLUME_STATEMENT,
    registrability,
    inputs,
    inputLabels: MONITOR_INPUT_LABEL,
  };
}

/**
 * The whole of Phase 12 in one response.
 *
 * `wip` is a PARAMETER, defaulting to null, and this file computes no coordination
 * load. `wipLoad` (`delivery.ts:1258`) needs milestone rows from 0049 and the
 * delivery service that reads them, which this phase does not own; supplying a
 * fabricated load would put a placeholder utilisation percentage into the weekly
 * review. Null is carried honestly all the way to the printed line ("Delivery
 * load: not supplied. No claim is made about coordination capacity this week.").
 */
/**
 * THE LOOP RESPONSE PLUS WHAT THIS PROCESS MEASURED.
 *
 * Deliberately an API-owned type that EXTENDS the shared `LoopResponse` rather than a
 * widening of it. `loopResponse()` is a pure function with a large test suite; these
 * four fields need a pool to exist, so putting them in the shared shape would force
 * every pure caller to invent them. Extending keeps the engine pure and still lets
 * one wire carry both.
 */
export interface LoopSnapshot extends LoopResponse {
  monitorRegistrability: readonly MonitorRegistrability[];
  monitorInputs: MonitorInputAvailability;
  monitorInputLabels: Record<MonitorInputKey, string>;
  /** G5's closing leg: what the three-stage waterfall actually cost, per offer. */
  waterfall: WaterfallShape;
}

/**
 * The two measurements, gathered together because both are absence-tolerant and
 * neither depends on the outcome register — so they are just as true on an
 * environment where 0053 is pending as on one where it is applied.
 */
export async function loopMeasurements(pool: Pool): Promise<Omit<LoopSnapshot, keyof LoopResponse>> {
  const [inputs, waterfall] = await Promise.all([
    monitorInputAvailability(pool),
    waterfallMeasurement(pool),
  ]);
  return {
    monitorRegistrability: monitorRegistrability(inputs),
    monitorInputs: inputs,
    monitorInputLabels: MONITOR_INPUT_LABEL,
    waterfall,
  };
}

export async function loopSnapshot(
  pool: Pool,
  args: { asOf: string; engagementId?: string | null; wip?: WipLoad | null },
): Promise<LoopSnapshot> {
  const asOf = args.asOf;
  const weekStart = weekStartOf(new Date(asOf));
  const all = await listOutcomeRecords(pool);
  const week = await outcomeRecordsInWeek(pool, weekStart);

  let capture: { subject: CaptureSubject; draft: OutcomeCaptureDraft } | null = null;
  if (args.engagementId) {
    const subject = await getCaptureSubject(pool, args.engagementId);
    if (subject) capture = { subject, draft: await getStoredDraft(pool, args.engagementId) };
  }

  const response = loopResponse({
    asOf,
    records: all.records,
    recordsThisWeek: week.records,
    weekStart,
    currentWeights: WEIGHTS_V1,
    wip: args.wip ?? null,
    capture,
  });

  // Refusals are additive, never replacements: the engine's notices stay first.
  const extra: string[] = [];
  if (all.rejected > 0) {
    extra.push(
      `${all.rejected} stored outcome row(s) were REFUSED by the API, not counted: an enum in the database is outside the union the engine accepts. Every number above is computed on ${all.records.length} row(s), and this line is the disclosure.`,
    );
  }
  if (args.engagementId && !capture) {
    extra.push(
      `No engagement ${args.engagementId} exists, so no capture form is shown. The book-wide blocks below are unaffected.`,
    );
  }
  const measured = await loopMeasurements(pool);
  const withNotices = extra.length === 0 ? response : { ...response, notices: [...response.notices, ...extra] };
  return { ...withNotices, ...measured };
}

/**
 * The shape a read returns while `gps_outcome` does not exist.
 *
 * Composed by the SAME function, on zero records — so a pending migration renders
 * the identical dense table reading "no outcomes at all", rather than an empty
 * state that the desk would have to interpret. `migrated: false` in `meta` is what
 * distinguishes it from a migrated-and-empty book; the difference is real and the
 * envelope carries it.
 */
export function emptyLoopSnapshot(asOf: string): LoopResponse {
  const base = loopResponse({
    asOf,
    records: [],
    recordsThisWeek: [],
    weekStart: weekStartOf(new Date(asOf)),
    currentWeights: WEIGHTS_V1,
    wip: null,
  });
  return {
    ...base,
    notices: [
      `Migration ${OUTCOME_MIGRATION} (table gps_outcome) is not applied on this environment, so NO outcome has been read. This is not an empty book — it is an unreadable one, and every "nothing can be concluded" below follows from that rather than from the business.`,
      ...base.notices,
    ],
  };
}

/* ── The route-boundary honesty check ─────────────────────────────────────────
 *
 * WHY THIS EXISTS WHEN THE ENGINE IS ALREADY CORRECT. The engine suppressing a
 * rate has never been the failure mode; the failure mode is a route, a mapper or a
 * later refactor putting a number back. This runs over the payload that is about
 * to be serialised, on every response that carries a rate, and a breach REFUSES
 * the response instead of shipping the percentage. A 500 that says "the API nearly
 * published a rate on n=3" is recoverable. The rate is not: it gets screenshotted
 * into a deck and outlives the bug.
 */

/**
 * Any expressible rate resting on fewer than `MIN_N_FOR_RATE` observations.
 * Empty means the payload is honest. Pure — safe to call on every response.
 */
export function rateBreaches(label: string, rate: SuppressibleRate): readonly string[] {
  const out: string[] = [];
  if (rate.pct !== null && rate.n < rate.minN) {
    out.push(
      `${label}: a win rate of ${rate.pct}% is expressed on n=${rate.n}, below the stated minimum of ${rate.minN} (calibration.ts:243). The counts ${rate.counts.won} won / ${rate.counts.lost} lost are the only honest finding at that n.`,
    );
  }
  if (rate.pct !== null && rate.interval95Pct === null) {
    out.push(`${label}: a win rate is expressed with no 95% interval beside it (D3).`);
  }
  return out;
}

/** The same check over a whole summary: pooled plus every offer row. */
export function rateHonestyBreaches(summary: WinLossSummary): readonly string[] {
  const out: string[] = [...rateBreaches('pooled', suppressibleRate(summary.overall))];
  for (const row of summary.byOffer) out.push(...rateBreaches(row.offerKey, suppressibleRate(row)));
  if (summary.minNForRate !== MIN_N_FOR_RATE) {
    out.push(
      `the response declares minNForRate=${summary.minNForRate} while the engine constant is ${MIN_N_FOR_RATE} — a rendered report would carry the wrong threshold.`,
    );
  }
  return out;
}
