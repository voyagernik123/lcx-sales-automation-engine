import type { Pool } from 'pg';
import {
  DEFAULT_ISSUE_POLICY,
  DEFAULT_SAMPLE_COUNT,
  DEFAULT_SEED,
  EFFORT_TRIPLES_ARE_PLACEHOLDERS,
  OFFER_KEYS,
  UNATTRIBUTED_PARTNER,
  buildUnderwriteResponse,
  effortFromRequest,
  getOffer,
  isRefusal,
  placeholderEffortTriple,
  type CostModel,
  type EffortTriple,
  type IssueDecision,
  type IssuePolicy,
  type OfferKey,
  type RateCard,
  type RateUnit,
  type RecordedOutcome,
  type ServiceOfferLike,
  type UnderwriteResponse,
  type Underwriting,
} from '@lcx/shared';
import { getEngagement, isMigrated } from './service.js';
import { isOutcomeMigrated, listOutcomeRecords } from './loop.js';

/**
 * GLOBAL SERVICES (GPS) — PHASE 7 UNDERWRITING, SERVER SIDE.
 *
 * `packages/shared/src/gps/underwrite.ts` is 1,843 lines of Monte Carlo that has
 * no way to reach a database and no opinion about who is allowed to call it. This
 * file is that way, and the gate. It performs NO arithmetic: every percentile,
 * every `pLoss`, every block reason on the wire is produced by `underwrite`,
 * `overrunSensitivity`, `shouldBlockIssue` or `devilsAdvocate`, so the API cannot
 * disagree with the engine's thresholds. What this file owns is INPUT PROVENANCE
 * and REFUSAL.
 *
 * ══ THE ONE IDEA IN THIS FILE ══
 *
 *   The exploratory route may accept COMMERCIAL inputs from the caller.
 *   Every RISK-BEARING input is a SERVER FACT.
 *
 * Commercial: the price being typed, the currency, which partner would deliver,
 * a pass-through cost, the overrun ladder. Risk-bearing: the rate itself, the
 * card's validity, hours per day, the effort triple, the sample count, the seed,
 * `asOf`, and the issue policy. Every one of those, supplied by a caller, is a
 * lever that moves `pLoss` toward zero — and `pLoss` is what blocks a proposal.
 * `UnderwriteRequest`'s own docblock (`underwrite.ts:1727`) makes this argument
 * about the rate card ("the underwriting would become a mirror"); the same
 * argument applies unchanged to the other seven, so they are refused with a
 * reason rather than honoured or, worse, silently ignored (D2).
 *
 * Four bypasses that a permissive mapper would have shipped, each closed here and
 * each with a test in `__tests__/underwrite.test.ts`:
 *
 *  1. `samples: 1` — legal in the engine, where 1 exists so the degenerate case is
 *     testable. On one draw `pLoss` is 0 or 1, so roughly four times in five a
 *     loss-making quote reports P(loss) = 0% and issues. `MIN_DECISION_SAMPLES`.
 *  2. `seed: n` — the engine is deterministic per seed, which means a caller can
 *     shop seeds until `pLoss` lands under the ceiling. The seed is ours.
 *  3. `asOf: '2020-01-01'` — staleness is judged against `asOf`, so a past date
 *     makes an expired rate card usable and turns a rate nobody re-confirmed into
 *     three confident percentiles. The clock is ours: a supplied `asOf` is CHECKED
 *     against the server's and never used (`ASOF_IS_A_SERVER_FACT` explains why
 *     that one is checked rather than refused outright — the shared request type
 *     declares it required, so every honest client sends it).
 *  4. `policy: { maxPLoss: 1 }` — the block threshold arriving in the body of the
 *     request being blocked. Overrides are accepted in the STRICTER direction
 *     only; a loosening is a 400, and the appetite's `statedBy` is the session's
 *     operator, never a body field.
 *
 * ══ WHAT IS NOT ON RECORD, AND WHY THAT PRODUCES A REFUSAL RATHER THAN A NUMBER ══
 * There is no rate card anywhere in this repo. `PARTNER_BENCH` is an empty array
 * and says why (`partners.ts:293`: decision D5 unanswered, no named partners), the
 * `partners` table (`0024_dealdesk_ext.sql:66`) is the BD referral table and holds
 * a commission percentage rather than a per-offer cost, and no effort triple has
 * been supplied either (`GPS_100X_PLAN.md` §12). So on this environment today the
 * only honest output of this file is a REASONED REFUSAL, and the placeholder card
 * below is built so that it cannot become anything else — see
 * `PLACEHOLDER_CARD_CANNOT_PRICE`.
 *
 * ══ MIGRATION-PENDING DISCIPLINE ══
 * Same as `service.ts` and `loop.ts`: the two tables this file wants DO NOT EXIST.
 * Reads answer 200 with a well-shaped body and say `migrated: false`; nothing here
 * writes at all. The DDL a human must apply is `UNDERWRITING_MIGRATION_SPEC`,
 * expressed as data so a response can print exactly what is missing instead of a
 * 500 that reads as "the platform is down".
 *
 * ══ THERE IS NO ARTIFACT INTAKE HERE, EITHER ══
 * No client material of any kind reaches this file: an underwriting is nine
 * numbers, a rate card row and a frozen scope snapshot. Decision D2 (LCX
 * legal/DPO — controller vs processor for a third party's confidential material)
 * is still UNANSWERED, and `__tests__/intakeLockout.test.ts` discovers this file
 * by path and fails the build if that changes.
 */

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE MIGRATION THAT DOES NOT EXIST YET                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * 0052 — the first free number, and the premise this comment used to quote is stale.
 *
 * It said `loop.ts` declares `0050_gps_outcome.sql`, which was already out of date
 * when it was written and then became wrong twice over: loop.ts moved to 0051, which
 * collided with the applied `0051_gps_evidence_refusal.sql`, and outcome is now 0053.
 * The three unapplied GPS migrations are 0052 (here), 0053 (`gps/loop.ts`
 * OUTCOME_MIGRATION) and 0054 (`routes/gpsOrigination.ts`); `deploySafety.test.ts`
 * asserts each is distinct and names no file that already exists on disk, so this is
 * checked rather than asserted. One constant per migration, one edit if it moves.
 */
export const UNDERWRITING_MIGRATION = '0052_gps_underwriting.sql';

/**
 * What the pending migration must contain, as data rather than as a comment, so a
 * refusal can carry it and an operability audit can read it.
 *
 * WHY TWO TABLES AND NOT COLUMNS ON `gps_engagement`. A rate card is a fact about
 * a PARTNER AND AN OFFER that outlives every engagement quoted against it, and an
 * effort triple is a fact about an OFFER. Putting either on the engagement would
 * copy the rate onto every row, so re-confirming a rate would mean a backfill and
 * the `validUntil` that is the entire point of `RateCard` (`partners.ts:176`)
 * would go stale per-row, invisibly. The engagement gets exactly one new column —
 * WHO IS GOING TO DELIVER IT — because that is genuinely per-engagement and
 * because without it the guard cannot know whose rate to underwrite against.
 */
export const UNDERWRITING_MIGRATION_SPEC = {
  file: UNDERWRITING_MIGRATION,
  tables: ['gps_rate_card', 'gps_effort_triple'],
  rateCardColumns: [
    "partner_id text NOT NULL — TEXT, NOT AN FK. The bench is not a table (`partners.ts:305`: \"When names arrive they are ROWS, not entries here\"), and 0047 set the precedent with `owner`. An FK to the BD `partners` table would silently equate a referral counterparty with a delivery partner",
    'offer_key text NOT NULL — one card per (partner, offer), which is what `Partner.rateCards` means by "one card per offer they can deliver"',
    "unit text NOT NULL CHECK (unit IN ('fixed','day_rate','hourly')) — mirrors RateUnit (`partners.ts:161`)",
    'amount_cents bigint NOT NULL CHECK (amount_cents >= 0) — cost to US per unit, integer cents. NO DEFAULT: a defaulted 0 would price the work as free',
    'expected_units numeric CHECK (expected_units > 0) — NULLABLE, and null on a metered unit means the cost CANNOT be derived. `rateCardCostCents` returns null rather than assuming 1 (`partners.ts:233`); do not add a DEFAULT 1',
    'hours_per_day numeric CHECK (hours_per_day > 0) — NULLABLE. Required only for an hourly card, because the effort triple is in DAYS. It lives HERE and not on the request: an assumed or caller-supplied 8 is an invented number on a proposal, and a caller who wants a cheaper margin would supply 1',
    'fixed_cost_cents bigint NOT NULL DEFAULT 0 CHECK (fixed_cost_cents >= 0) — pass-through that does not scale with effort, e.g. counsel\'s own fee (`catalogue.ts:79`)',
    'currency text NOT NULL — ISO-4217 uppercase. Partners invoice in their own; nothing here converts, and a mismatch against the quote is a refusal',
    'valid_until date — NULLABLE, AND NULL IS UNUSABLE RATHER THAN FOREVER. `rateCardStatus` returns `no_validity_stated` and the underwriting refuses (`underwrite.ts:385`). A rate with no expiry is a rate nobody re-confirmed',
    "stated_by text NOT NULL — a named human. Never a service account, and never a body field: the shared machine key holds `gps` at operate (`access/entitlements.ts:39`), so a card written by a cron job would be an unattributable cost basis",
    'stated_at timestamptz NOT NULL DEFAULT now()',
    'partner_label text — NULLABLE display name, for the reason strings only. Never used to join',
    'PRIMARY KEY (partner_id, offer_key)',
  ],
  effortTripleColumns: [
    'offer_key text PRIMARY KEY — partner-days per engagement of this offer. Per offer and NOT per partner: the shared `EffortTriple` is keyed by offer alone (`underwrite.ts:83`), and a per-partner triple would let a cheap partner also be modelled as a fast one on no evidence',
    'optimistic_days numeric NOT NULL CHECK (optimistic_days >= 0)',
    'likely_days numeric NOT NULL CHECK (likely_days >= 0)',
    'pessimistic_days numeric NOT NULL CHECK (pessimistic_days >= 0)',
    'NO CHECK ordering the three. `resolveDuration` (`launchSim.ts:160`) clamps them (min ≥ 0, mode ≥ min, max ≥ mode) and its clamping is already tested; a CHECK would turn a typo into a 500 instead of a visibly odd triple',
    'stated_by text NOT NULL — the founder, by name. This is the input `GPS_100X_PLAN.md` §12 says only he can supply and which "turns the underwriting screen from a prior into a model"',
    'stated_at timestamptz NOT NULL DEFAULT now()',
  ],
  engagementAlter: [
    'ALTER TABLE gps_engagement ADD COLUMN IF NOT EXISTS partner_id text — WHO IS DELIVERING. Nullable, and NULL BLOCKS ISSUANCE rather than being inferred: with one card on record it would be tempting to guess, but "this engagement will be delivered by X" is a claim nobody made, and the margin on a proposal must not rest on one (D8)',
  ],
  rls: 'ALTER TABLE gps_rate_card ENABLE ROW LEVEL SECURITY; ALTER TABLE gps_effort_triple ENABLE ROW LEVEL SECURITY; NO POLICIES — deny-all, exactly as 0047_gps.sql:361, 0049_gps_delivery.sql:518 and the gps_outcome spec. gps_rate_card is what a named third party charges LCX per offer: the most commercially sensitive table in the compartment after gps_outcome. RLS with no policy closes the anon-key path; the entitlement gate does the rest.',
  forbidden: [
    'NO margin, cost or p_loss column anywhere. Every one of those is derived, and a stored copy would be the stale number a screen quotes after the rate changes.',
    'NO artifact, attachment, location, url or mime column. Decision D2 (LCX DPO — controller vs processor for a third party\'s confidential material) is UNANSWERED; intakeLockout.test.ts discovers migrations by content and will fail the build on one.',
    'NO DEFAULT on valid_until. A defaulted expiry is a fabricated re-confirmation date, which is the precise failure `RateCard.validUntil` exists to prevent.',
  ],
} as const;

/**
 * Reads degrade to this shape. NOTHING in this file writes, so there is no 503
 * path: an underwriting is a computation over rows, and during the
 * deploy-before-migration window the honest answer is a refusal WITH ITS REASON,
 * not an error. A 500 or a 503 here would read as "the platform is down", and the
 * desk would act on that reading instead of on "apply one migration".
 */
export const UNDERWRITING_NOT_MIGRATED = {
  code: 'UNDERWRITING_REGISTRY_ABSENT',
  reason: `No rate card registry exists on this environment: migration ${UNDERWRITING_MIGRATION} (tables gps_rate_card, gps_effort_triple) has not been applied. Nothing can be underwritten against a rate nobody has recorded, so this is a refusal rather than a number.`,
} as const;

/* ══════════════════════════════════════════════════════════════════════════ */
/* PROBES — cached per process, and never themselves the error                  */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface RegistryPresence {
  rateCards: boolean;
  effortTriples: boolean;
}

let presenceCache: RegistryPresence | null = null;

/**
 * Are the underwriting registries present?
 *
 * ONE round trip, TWO booleans, and separately reported on purpose: applying half
 * of a migration is a real state, and "rate cards exist, effort triples do not" is
 * a different sentence from "neither exists" — the first still underwrites, on a
 * disclosed placeholder triple, and the second cannot underwrite at all.
 *
 * `to_regclass` returns NULL on absence instead of throwing, exactly as
 * `service.ts:80` and `loop.ts:154`, so the probe cannot be the thing that breaks.
 */
export async function underwritingRegistries(pool: Pool): Promise<RegistryPresence> {
  if (presenceCache !== null) return presenceCache;
  try {
    const res = await pool.query(
      `SELECT to_regclass('public.gps_rate_card')     IS NOT NULL AS rate_cards,
              to_regclass('public.gps_effort_triple') IS NOT NULL AS effort_triples`,
    );
    presenceCache = {
      rateCards: Boolean(res.rows[0]?.rate_cards),
      effortTriples: Boolean(res.rows[0]?.effort_triples),
    };
  } catch {
    // A database that cannot answer this cannot serve a cost basis either. Report
    // absent rather than propagating, and let the refusal carry the reason.
    presenceCache = { rateCards: false, effortTriples: false };
  }
  return presenceCache;
}

let partnerColumnCache: boolean | null = null;

/**
 * Does `gps_engagement` carry `partner_id` yet?
 *
 * A SEPARATE probe from the two tables, because this one is an ALTER on a table
 * 0047 already created and a deploy where the tables exist and the column does not
 * is the expected middle state. Selecting `partner_id` without checking would
 * raise 42703 (undefined column) — a 500 for a schema fact the code could have
 * asked about, which is exactly what the migration-pending discipline exists to
 * avoid. Parameterised, like every query in this file.
 */
export async function engagementHasPartnerColumn(pool: Pool): Promise<boolean> {
  if (partnerColumnCache !== null) return partnerColumnCache;
  try {
    const res = await pool.query(
      `SELECT true AS ok FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gps_engagement' AND column_name = $1`,
      ['partner_id'],
    );
    partnerColumnCache = res.rows.length > 0;
  } catch {
    partnerColumnCache = false;
  }
  return partnerColumnCache;
}

/** Test-only: forget both probes. */
export function _resetUnderwritingProbes(): void {
  presenceCache = null;
  partnerColumnCache = null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* ROW NORMALISATION — `bigint` and `numeric` both arrive as strings            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `bigint` AND `numeric` are handed back by node-postgres as STRINGS, because
 * neither fits a JS number in general. Ours do; the driver cannot know that. Every
 * money and every quantity column is therefore normalised here exactly once.
 *
 * Reading `row.amount_cents` directly is the bug this prevents, in the words
 * `service.ts:105` already uses: `"1200000" + 0` yields `"12000000"`, a rate ten
 * times too large, silently.
 */
function num(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Integer cents from a `bigint` column. Rounds rather than truncating. */
function cents(v: unknown): number {
  const n = numOrNull(v);
  return n === null ? 0 : Math.round(n);
}

/** A `date` column arrives as a Date; `RateCard.validUntil` wants ISO or null. */
function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  return s === '' ? null : s;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE ONE EDITABLE PLACEHOLDER BLOCK                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  TODO — NO PARTNER RATE CARD HAS BEEN SUPPLIED. THERE IS NO REAL RATE HERE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Decision D5 is unanswered: no named partners, therefore no rate cards
 *  (`catalogue.ts:495`, `partners.ts:293`, and every `expectedVendorCostCents` in
 *  the catalogue is a placeholder for the same reason). ONE BLOCK, exactly as
 *  `TODO_PRICE_BANDS` (`catalogue.ts:61`), `TODO_EFFORT_DAYS`
 *  (`underwrite.ts:129`) and `TODO_DEPOSIT_PCT` (`service.ts:210`) are single
 *  blocks: replacing it is one edit with no stale copy surviving elsewhere.
 *
 *  Flip `RATE_CARDS_ARE_PLACEHOLDERS` to false in the SAME COMMIT that applies
 *  the migration and inserts real rows — never before, and never for a demo.
 */
export const RATE_CARDS_ARE_PLACEHOLDERS = true;

/**
 * WHY THE PLACEHOLDER CARD IS BUILT TO BE UNUSABLE, AND HOW.
 *
 * Every other placeholder in this programme is a number that would merely be
 * wrong. A placeholder RATE is different in kind: it is the denominator of the
 * margin, so a plausible-looking one produces a plausible-looking p10/p50/p90 and
 * a `pLoss` that could permit a proposal. `GPS_100X_PLAN.md` §11 names exactly
 * this failure — "distributions are founder-priors dressed as measurement" — and a
 * label on the screen does not fix it, because nobody reads the label on a number
 * that looks certain.
 *
 * So the placeholder cannot produce a number at all, by TWO INDEPENDENT
 * MECHANISMS, either of which alone is sufficient:
 *
 *   1. `validUntil: null` → `rateCardStatus` returns `no_validity_stated` →
 *      `resolveCostBasis` refuses with `refused_rate_card_no_validity_stated`
 *      (`underwrite.ts:385`) before any arithmetic happens.
 *   2. `amountCents: -1` → deliberately not money. Had someone "fixed" (1) by
 *      typing a validity date, the day-rate branch refuses a negative amount with
 *      `refused_rate_not_derivable` (`underwrite.ts:421`).
 *
 * The second exists because the first is one careless edit away from being
 * satisfied. A ZERO amount was rejected as the second lock: zero is finite and
 * non-negative, so a zero-rate card that acquired a validity date would price the
 * partner's work as free, report `pLoss: 0` on every quote, and permit every
 * issue — the worst possible failure of this file, arrived at by making the
 * placeholder look tidier. `__tests__/underwrite.test.ts` asserts the refusal for
 * every offer, and asserts that the distribution is null when it fires.
 */
export const PLACEHOLDER_CARD_CANNOT_PRICE =
  'The rate card used here is a placeholder with no validity date and a deliberately non-derivable amount. It cannot produce a cost, a margin or a P(loss) — only a refusal naming what is missing. No number on this screen came from it.';

const PLACEHOLDER_STATED_BY = 'system:placeholder';
/** The epoch, deliberately: a placeholder must never look freshly confirmed. */
const PLACEHOLDER_STATED_AT = '1970-01-01T00:00:00.000Z';

/**
 * The badged placeholder card. `currency` ECHOES THE QUOTE rather than asserting
 * one: a fabricated EUR would make the engine refuse with
 * `refused_currency_mismatch`, and "the partner's card is in EUR" is a false
 * statement about a card that does not exist. The refusal must name the real
 * defect, which is that nobody has recorded a rate.
 */
export function placeholderRateCard(offerKey: OfferKey, currency: string): RateCard {
  return {
    offerKey,
    unit: 'day_rate',
    amountCents: -1,
    expectedUnits: null,
    currency: currency.toUpperCase(),
    validUntil: null,
    statedBy: PLACEHOLDER_STATED_BY,
    statedAt: PLACEHOLDER_STATED_AT,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* LOADING THE COST BASIS                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Where the card came from. On the wire beside every underwriting, because a
 * surface that cannot tell a recorded rate from a placeholder will eventually
 * present one as the other (D8).
 */
export type RateCardSource = 'recorded' | 'placeholder_registry_absent' | 'placeholder_not_on_record';

export interface ResolvedRateCard {
  card: RateCard;
  source: RateCardSource;
  /** One sentence, quotable verbatim. Never empty. */
  statement: string;
  /** The partner's recorded display name, else the id. Used in reason strings. */
  partnerLabel: string;
  /** From the card row. NULL is a refusal for an hourly card, never an assumed 8. */
  hoursPerDay: number | null;
  /** Pass-through cost from the card row, integer cents. */
  fixedCostCents: number;
  /** True only for `recorded`. */
  onRecord: boolean;
}

const RATE_CARD_COLS = `partner_id, offer_key, unit, amount_cents, expected_units,
  hours_per_day, fixed_cost_cents, currency, valid_until, stated_by, stated_at,
  partner_label`;

/**
 * THE CARD, FROM THE SERVER, OR A PLACEHOLDER THAT CANNOT PRICE.
 *
 * Note what this function does NOT take: a card, a rate, an amount, a validity
 * date, or anything else a caller could have chosen. It takes two identifiers and
 * reads. `UnderwriteRequest` deliberately carries no card (`underwrite.ts:1727`)
 * and this is the other half of that decision.
 *
 * `currency` is passed only so a placeholder can echo it — see
 * `placeholderRateCard`. A RECORDED card's currency comes from the row and is
 * compared, never converted.
 */
export async function loadRateCard(
  pool: Pool,
  partnerId: string,
  offerKey: OfferKey,
  quoteCurrency: string,
): Promise<ResolvedRateCard> {
  const registries = await underwritingRegistries(pool);
  if (!registries.rateCards) {
    return {
      card: placeholderRateCard(offerKey, quoteCurrency),
      source: 'placeholder_registry_absent',
      statement: `${UNDERWRITING_NOT_MIGRATED.reason} ${PLACEHOLDER_CARD_CANNOT_PRICE}`,
      partnerLabel: partnerId,
      hoursPerDay: null,
      fixedCostCents: 0,
      onRecord: false,
    };
  }

  const res = await pool.query(
    `SELECT ${RATE_CARD_COLS} FROM gps_rate_card WHERE partner_id = $1 AND offer_key = $2`,
    [partnerId, offerKey],
  );
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return {
      card: placeholderRateCard(offerKey, quoteCurrency),
      source: 'placeholder_not_on_record',
      statement:
        `No rate card is on record for partner "${partnerId}" on ${offerKey}. The registry exists and this pair is not in it, `
        + `so there is nothing to cost the work against. ${PLACEHOLDER_CARD_CANNOT_PRICE}`,
      partnerLabel: partnerId,
      hoursPerDay: null,
      fixedCostCents: 0,
      onRecord: false,
    };
  }

  const label = typeof row.partner_label === 'string' && row.partner_label.trim()
    ? row.partner_label.trim()
    : partnerId;
  const validUntil = isoOrNull(row.valid_until);
  return {
    card: {
      offerKey,
      unit: String(row.unit) as RateUnit,
      amountCents: cents(row.amount_cents),
      expectedUnits: numOrNull(row.expected_units),
      currency: String(row.currency ?? '').toUpperCase(),
      validUntil,
      statedBy: String(row.stated_by ?? 'unknown'),
      statedAt: isoOrNull(row.stated_at) ?? PLACEHOLDER_STATED_AT,
    },
    source: 'recorded',
    statement:
      `Rate card on record for ${label} on ${offerKey}: ${String(row.unit)}, stated by ${String(row.stated_by)} `
      + `and valid until ${validUntil ?? 'NO DATE STATED (which is a refusal, not "forever")'}.`,
    partnerLabel: label,
    hoursPerDay: numOrNull(row.hours_per_day),
    fixedCostCents: cents(row.fixed_cost_cents),
    onRecord: true,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* LOADING THE EFFORT TRIPLE                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export type EffortSource = 'recorded' | 'request' | 'placeholder';

export interface ResolvedEffort {
  effort: EffortTriple;
  source: EffortSource;
  statement: string;
}

/**
 * PARTNER-DAYS PER ENGAGEMENT, from the registry or from the shipped placeholder.
 *
 * `effortFromRequest` (`underwrite.ts:177`) owns the `isPlaceholder` flag and there
 * is deliberately no way to set it by hand, so a recorded row goes through the same
 * door a request would. That is the whole point of that function existing: this is
 * precisely the hand-written mapper where `isPlaceholder: false` gets typed next to
 * a placeholder by accident.
 *
 * `statedBy` on a REQUEST-supplied triple is the session's operator, decided by the
 * caller of this function and never read from the body — same discipline as the
 * conflict check (`routes/gps.ts:438`: a body field naming the decider would make
 * the record a claim about who decided rather than a record of it).
 */
export async function loadEffort(
  pool: Pool,
  offerKey: OfferKey,
  supplied: { optimisticDays: number; likelyDays: number; pessimisticDays: number } | null,
  statedBy: string,
  statedAt: string,
): Promise<ResolvedEffort> {
  if (supplied) {
    return {
      effort: effortFromRequest(offerKey, { ...supplied, statedBy, statedAt }),
      source: 'request',
      statement:
        `Effort triple supplied in this request by ${statedBy} at ${statedAt} and NOT persisted — `
        + `there is nowhere to persist it until ${UNDERWRITING_MIGRATION} is applied. It is an exploration, `
        + 'and the proposal-issue guard does not read it: the guard underwrites the recorded triple or the placeholder.',
    };
  }

  const registries = await underwritingRegistries(pool);
  if (registries.effortTriples) {
    const res = await pool.query(
      `SELECT optimistic_days, likely_days, pessimistic_days, stated_by, stated_at
         FROM gps_effort_triple WHERE offer_key = $1`,
      [offerKey],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (row) {
      const rowStatedBy = String(row.stated_by ?? 'unknown');
      const rowStatedAt = isoOrNull(row.stated_at) ?? PLACEHOLDER_STATED_AT;
      return {
        effort: effortFromRequest(offerKey, {
          optimisticDays: num(row.optimistic_days, 0),
          likelyDays: num(row.likely_days, 0),
          pessimisticDays: num(row.pessimistic_days, 0),
          statedBy: rowStatedBy,
          statedAt: rowStatedAt,
        }),
        source: 'recorded',
        statement: `Effort triple on record for ${offerKey}, stated by ${rowStatedBy} at ${rowStatedAt}.`,
      };
    }
  }

  return {
    effort: placeholderEffortTriple(offerKey),
    source: 'placeholder',
    statement:
      `No effort triple has been supplied for ${offerKey}, so the shipped PLACEHOLDER is in use `
      + '(GPS_100X_PLAN.md §12 names it as the one input that turns this screen from a prior into a model, '
      + 'and only the founder can supply it). Its spread is deliberately wide: a narrow placeholder would '
      + 'manufacture a tight, confident-looking band out of nothing.',
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* LOADING RECORDED OUTCOMES — and stating what the capture form never asked    */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface ResolvedOutcomes {
  outcomes: readonly RecordedOutcome[];
  statement: string;
  /** Rows the Phase 12 mapper itself refused. Surfaced, never swallowed. */
  rejected: number;
}

/**
 * WHAT THE BOOK HAS ACTUALLY OBSERVED, which is what moves `basis` off `prior`.
 *
 * Read through `listOutcomeRecords` (`gps/loop.ts:310`) rather than with a second
 * query against `gps_outcome`: that file owns the table, its column list and its
 * migration spec, and a duplicate SELECT here would drift from the DDL the first
 * time a column was added. One loader, one shape.
 *
 * ── THE MAPPING IS LOSSY, AND THAT IS DISCLOSED RATHER THAN PAPERED OVER ──────
 * `OutcomeRecord` (`calibration.ts:158`) and `RecordedOutcome` (`partners.ts:780`)
 * are different types for different jobs, and the Phase 12 capture form does not
 * ask for two of the five things the devil's advocate can argue from:
 *
 *   · `dueAt` / `deliveredAt` — NOT CAPTURED. `cycle_time_days` is first contact to
 *     decision, which is not lateness against an acceptance criterion, so mapping
 *     it would fabricate a late delivery out of a long sales cycle.
 *   · `reworkRounds` — NOT CAPTURED. `acceptance_first_pass` is a boolean; a count
 *     of rounds is a different fact and inventing 1 from `false` would report a
 *     round nobody recorded.
 *
 * Both therefore arrive as NULL, which the engine reads as "no sample" rather than
 * as "zero" — `devilsAdvocate` requires `count > 0 && denominator > 0` before an
 * argument is admitted (`underwrite.ts:1611`), so those two arguments can never
 * fire from data. That is a limit of the capture form, NOT evidence that delivery
 * is never late, and the statement below says so on every response (D8).
 */
/**
 * Appended to EVERY outcomes statement, present or absent, because it is true in
 * both cases and it is the sentence that stops an unraised argument from reading as
 * a finding.
 */
const OUTCOME_CAPTURE_GAP =
  'Due dates and rework-round counts are NOT captured by the outcome form, so the "delivery slipped" and '
  + '"unscoped revision rounds" arguments can never be raised from data — their absence is a gap in what is '
  + 'recorded, not a finding that neither has happened.';

export async function loadOutcomes(pool: Pool): Promise<ResolvedOutcomes> {
  const [pipelineMigrated, outcomesMigrated] = await Promise.all([
    isMigrated(pool),
    isOutcomeMigrated(pool),
  ]);
  if (!pipelineMigrated || !outcomesMigrated) {
    return {
      outcomes: [],
      rejected: 0,
      statement:
        'No recorded outcomes are readable on this environment (the outcome table is awaiting its migration), '
        + `so the underwriting basis is a PRIOR: nothing below has been measured. ${OUTCOME_CAPTURE_GAP}`,
    };
  }

  const { records, rejected } = await listOutcomeRecords(pool);
  const outcomes: RecordedOutcome[] = records.map((r) => ({
    engagementId: r.engagementId,
    // The bench is not a table, so an outcome's partner is free text and may be
    // absent. `UNATTRIBUTED_PARTNER` is the platform's existing name for that case
    // (`calibration.ts`), and the blend groups by OFFER anyway.
    partnerId: r.partner ?? UNATTRIBUTED_PARTNER,
    offerKey: r.offerKey,
    quotedPriceCents: r.quotedPriceCents,
    quotedVendorCostCents: r.quotedVendorCostCents,
    finalPriceCents: r.realisedPriceCents,
    actualVendorCostCents: r.realisedVendorCostCents,
    dueAt: null,
    deliveredAt: null,
    reworkRounds: null,
    acceptedFirstPass: r.acceptanceFirstPass,
  }));

  const withCost = outcomes.filter((o) => o.actualVendorCostCents !== null).length;
  return {
    outcomes,
    rejected,
    statement:
      `${outcomes.length} recorded outcome${outcomes.length === 1 ? '' : 's'} read, of which ${withCost} `
      + `carr${withCost === 1 ? 'ies' : 'y'} a realised partner cost and can move the cost distribution. `
      + OUTCOME_CAPTURE_GAP
      + (rejected > 0 ? ` ${rejected} row(s) were rejected by the outcome mapper and are excluded.` : ''),
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE APPETITE — server-owned, tightenable, never loosenable                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The minimum sample count any response carrying a BLOCK DECISION is computed on.
 *
 * The engine clamps to [1, 20000] and permits 1 deliberately, so that the
 * degenerate case is testable (`UnderwriteOptions.samples`). One draw makes `pLoss`
 * either 0 or 1, so on the founder's own loss case — a $10k price against a ~$12k
 * likely cost, where the honest answer is P(loss) ≈ 92% — roughly one request in
 * twelve would report 0% and permit the issue. That is not a rounding problem; it
 * is a bypass with a query parameter, so the sample count is a server fact and a
 * request that supplies one is refused rather than silently clamped.
 *
 * 1,000 is a stated floor, not a derived one: at 1,000 draws the standard error on
 * a probability near 20% is about 1.3 points, which is small against a 20% ceiling
 * and cheap to compute. `DEFAULT_SAMPLE_COUNT` (4,000) is what actually runs.
 */
export const MIN_DECISION_SAMPLES = 1000;

/**
 * Fields a caller may NOT supply, with the reason each is refused. Data rather
 * than a chain of `if`s so the route, the tests and the error body all read the
 * same list, and so adding a field to `UnderwriteRequest` cannot quietly become a
 * new lever.
 */
export const SERVER_FACT_FIELDS: ReadonlyArray<{ field: string; reason: string }> = [
  {
    field: 'seed',
    reason:
      'The simulation is deterministic per seed, so a caller who may choose the seed may shop for one '
      + 'that puts P(loss) under the ceiling. The seed is fixed server-side and echoed on the response.',
  },
  {
    field: 'samples',
    reason:
      `The sample count decides how many outcomes P(loss) is counted over; at 1 it is 0 or 1. Fixed `
      + `server-side at no fewer than ${MIN_DECISION_SAMPLES}.`,
  },
  {
    field: 'hoursPerDay',
    reason:
      'Hours per day bridges an hourly card to an effort triple in days, and a smaller number is a '
      + 'smaller cost: it belongs on the rate card row, stated by whoever recorded the rate. An hourly '
      + 'card with no hours per day on record is a refusal, never an assumed 8.',
  },
];

/**
 * `asOf` GETS ITS OWN RULE, because the shared `UnderwriteRequest` declares it
 * REQUIRED (`underwrite.ts:1759`) and a web client typed against that declaration
 * will send it. Refusing it outright would 400 every well-behaved caller; ignoring
 * it would be a silent default, which D2 forbids; honouring it would let a caller
 * backdate the clock and revive an expired rate card, which is the whole reason it
 * cannot be a caller's choice.
 *
 * So it is accepted as a CONSISTENCY CHECK and never as the instant: the server's
 * own clock is what reaches the engine and what the response reports, and a
 * supplied `asOf` more than five minutes from it is refused with the reason. A
 * caller who sends their honest now is fine; a caller who sends 2020 is told why
 * not. Five minutes is a stated tolerance for ordinary clock skew, not a derived
 * figure.
 */
export const ASOF_TOLERANCE_MS = 5 * 60 * 1000;

export const ASOF_IS_A_SERVER_FACT =
  'asOf may be sent, but it is only checked against the server clock — never used. Rate-card staleness is '
  + 'judged against the server instant, because a caller-supplied date is a caller-supplied verdict on '
  + 'whether an expired rate may be used.';

export type PolicyDecision =
  | { ok: true; policy: IssuePolicy; tightened: readonly string[] }
  | { ok: false; field: string; reason: string };

/**
 * Apply a caller's policy override IN THE STRICTER DIRECTION ONLY.
 *
 * `GPS_100X_PLAN.md` §3 slice 7.3 requires P(loss) above a threshold to BLOCK
 * issuing "rather than warning politely". A threshold that arrives in the body of
 * the request being blocked is a warning with extra steps. But refusing overrides
 * outright would be wrong too: a desk that wants a 10% ceiling on a particular
 * quote is asking for MORE control, and there is no reason to deny it.
 *
 * So: a request may tighten, and every tightening is reported by name. `statedBy`
 * and `statedAt` are always the session's operator and the server clock — an
 * appetite is a HUMAN'S RISK APPETITE (`underwrite.ts:1336`), and a body field
 * naming who set it would make the record a claim rather than a record.
 */
export function tightenPolicy(
  requested: Partial<IssuePolicy> | null | undefined,
  statedBy: string,
  statedAt: string,
): PolicyDecision {
  const base = DEFAULT_ISSUE_POLICY;
  // Nothing requested means the appetite is the SERVER default, and `system:default`
  // is genuinely who stated it. Re-attributing an untouched threshold to whoever
  // happened to open the screen would be the same false record this function is
  // otherwise preventing.
  if (requested == null) return { ok: true, policy: { ...base }, tightened: [] };

  for (const field of ['statedBy', 'statedAt'] as const) {
    if (requested[field] !== undefined) {
      return {
        ok: false,
        field: `policy.${field}`,
        reason:
          `policy.${field} may not be supplied: the risk appetite is attributed to the authenticated `
          + 'operator, not to whoever the body names. This is the same rule the conflict check applies to decidedBy.',
      };
    }
  }

  const tightened: string[] = [];
  const policy: IssuePolicy = { ...base, statedBy, statedAt };

  if (requested.maxPLoss !== undefined) {
    const v = requested.maxPLoss;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      return { ok: false, field: 'policy.maxPLoss', reason: 'policy.maxPLoss must be a probability between 0 and 1.' };
    }
    if (v > base.maxPLoss) {
      return {
        ok: false,
        field: 'policy.maxPLoss',
        reason:
          `policy.maxPLoss may not be raised above the server ceiling of ${base.maxPLoss}. Raising the `
          + 'threshold in the request that is being blocked is the bypass this endpoint exists to prevent; '
          + 'to change the appetite, change it on the record.',
      };
    }
    if (v < base.maxPLoss) tightened.push(`maxPLoss ${base.maxPLoss} → ${v}`);
    policy.maxPLoss = v;
  }

  if (requested.minP50MarginPct !== undefined && requested.minP50MarginPct !== null) {
    const v = requested.minP50MarginPct;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, field: 'policy.minP50MarginPct', reason: 'policy.minP50MarginPct must be a number or null.' };
    }
    // The server default is null — NO FLOOR, because none has been supplied and
    // inventing one would put a fabricated business rule between the founder and
    // his own quote (`underwrite.ts:1343`). Any floor a caller adds can therefore
    // only add failures, which is strictly stricter.
    if (base.minP50MarginPct !== null && v < base.minP50MarginPct) {
      return {
        ok: false,
        field: 'policy.minP50MarginPct',
        reason: `policy.minP50MarginPct may not be lowered below the server floor of ${base.minP50MarginPct}%.`,
      };
    }
    tightened.push(`minP50MarginPct ${base.minP50MarginPct === null ? 'none' : `${base.minP50MarginPct}%`} → ${v}%`);
    policy.minP50MarginPct = v;
  }

  for (const flag of ['blockOnRefusal', 'blockOnPriorBasis', 'blockOnPlaceholderEffort'] as const) {
    const v = requested[flag];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') {
      return { ok: false, field: `policy.${flag}`, reason: `policy.${flag} must be a boolean.` };
    }
    if (base[flag] && !v) {
      return {
        ok: false,
        field: `policy.${flag}`,
        reason:
          `policy.${flag} is true on the server and may not be turned off by a request. A proposal whose `
          + 'margin could not be computed is not a proposal that may be issued.',
      };
    }
    if (!base[flag] && v) tightened.push(`${flag} false → true`);
    policy[flag] = v;
  }

  return { ok: true, policy, tightened };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* VALIDATION — pure, and it refuses rather than defaulting                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * $1bn. Same bound and same reasoning as `routes/gps.ts:124`: `price_cents` is a
 * `bigint`, so a fat-fingered 20-digit number would be accepted by the database and
 * arrive back beyond `Number.MAX_SAFE_INTEGER`, where the margin arithmetic stops
 * being exact.
 */
const MAX_CENTS = 100_000_000_000;

/** The commercial inputs a caller IS allowed to choose, after validation. */
export interface UnderwriteInput {
  offerKey: OfferKey;
  priceCents: number;
  currency: string;
  quotedVendorCostCents: number | null;
  partnerId: string;
  /** Pass-through only, and only upward: it can make the cost worse, never better. */
  fixedCostCents: number | null;
  effort: { optimisticDays: number; likelyDays: number; pessimisticDays: number } | null;
  uplifts: readonly number[] | undefined;
  policy: Partial<IssuePolicy> | null;
}

export type ValidationOutcome =
  | { ok: true; input: UnderwriteInput }
  | { ok: false; code: string; error: string };

const CURRENCY_RE = /^[A-Za-z]{3}$/;

function badCents(v: unknown): boolean {
  return typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_CENTS;
}

/**
 * VALIDATE, AND NEVER DEFAULT A MISSING FIELD INTO A PERMISSIVE ONE (D2).
 *
 * Pure on purpose: the whole point of the ratchet in
 * `__tests__/underwrite.test.ts` is that omitting a field cannot produce an
 * answer, and that property is worth testing without a database, a pool or a
 * route. Every branch below either names the field or returns the input; there is
 * no `?? 0`, no `?? 'USD'` and no `?? DEFAULT_PARTNER`.
 *
 * A missing price is the sharpest case: `0` is the column default in 0047, so
 * defaulting an absent price to 0 would produce a margin of exactly minus the cost
 * — a confident loss on a quote nobody has priced — or, with a fixed-fee card of 0,
 * a riskless profit. Both are fiction. It is a 400.
 */
export function validateUnderwriteBody(
  body: Record<string, unknown> | null,
  /** The server instant, passed in so this stays pure and testable. */
  nowMs: number,
): ValidationOutcome {
  if (!body) return { ok: false, code: 'VALIDATION', error: 'body must be a JSON object' };

  for (const { field, reason } of SERVER_FACT_FIELDS) {
    // An explicit `null` is "not supplied": a client filling out an optional field
    // of the shared request type should not be refused for saying so out loud.
    if (body[field] !== undefined && body[field] !== null) {
      return { ok: false, code: 'SERVER_FACT', error: `${field} may not be supplied. ${reason}` };
    }
  }

  if (body.asOf !== undefined && body.asOf !== null) {
    const supplied = typeof body.asOf === 'string' ? Date.parse(body.asOf) : Number.NaN;
    if (!Number.isFinite(supplied) || Math.abs(supplied - nowMs) > ASOF_TOLERANCE_MS) {
      return {
        ok: false,
        code: 'SERVER_FACT',
        error:
          `asOf must be within ${ASOF_TOLERANCE_MS / 60000} minutes of the server clock. ${ASOF_IS_A_SERVER_FACT}`,
      };
    }
  }

  const offerKey = body.offerKey as OfferKey;
  if (!OFFER_KEYS.includes(offerKey)) {
    return { ok: false, code: 'VALIDATION', error: `offerKey must be one of ${OFFER_KEYS.join(', ')}` };
  }

  if (badCents(body.priceCents)) {
    return {
      ok: false,
      code: 'VALIDATION',
      error:
        'priceCents is required and must be a non-negative integer number of cents. It is not defaulted: '
        + 'a quote with no price underwrites to a fictional margin in whichever direction the cost model points.',
    };
  }

  const currency = typeof body.currency === 'string' ? body.currency.trim() : '';
  if (!CURRENCY_RE.test(currency)) {
    return {
      ok: false,
      code: 'VALIDATION',
      error:
        'currency is required and must be a 3-letter ISO-4217 code. It is compared against the rate card and '
        + 'never converted, so it cannot be defaulted.',
    };
  }

  const partnerId = typeof body.partnerId === 'string' ? body.partnerId.trim() : '';
  if (!partnerId || partnerId.length > 200) {
    return {
      ok: false,
      code: 'VALIDATION',
      error:
        'partnerId is required: the cost of this engagement is whatever the partner delivering it charges, '
        + 'and there is no such thing as an average partner to fall back on.',
    };
  }

  if (body.quotedVendorCostCents !== undefined && body.quotedVendorCostCents !== null
      && badCents(body.quotedVendorCostCents)) {
    return { ok: false, code: 'VALIDATION', error: 'quotedVendorCostCents must be non-negative integer cents when supplied' };
  }
  if (body.fixedCostCents !== undefined && body.fixedCostCents !== null && badCents(body.fixedCostCents)) {
    return { ok: false, code: 'VALIDATION', error: 'fixedCostCents must be non-negative integer cents when supplied' };
  }

  let effort: UnderwriteInput['effort'] = null;
  if (body.effort !== undefined && body.effort !== null) {
    const e = body.effort as Record<string, unknown>;
    if (typeof e !== 'object' || Array.isArray(e)) {
      return { ok: false, code: 'VALIDATION', error: 'effort must be an object when supplied' };
    }
    for (const field of ['statedBy', 'statedAt'] as const) {
      if (e[field] !== undefined) {
        return {
          ok: false,
          code: 'SERVER_FACT',
          error:
            `effort.${field} may not be supplied: an effort triple is a claim a named human made, and the `
            + 'name comes from the authenticated session so that the record is a record rather than an assertion.',
        };
      }
    }
    const days = ['optimisticDays', 'likelyDays', 'pessimisticDays'] as const;
    for (const d of days) {
      const v = e[d];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 5000) {
        return {
          ok: false,
          code: 'VALIDATION',
          error: `effort.${d} must be a number of partner-days between 0 and 5000 when an effort override is supplied`,
        };
      }
    }
    effort = {
      optimisticDays: e.optimisticDays as number,
      likelyDays: e.likelyDays as number,
      pessimisticDays: e.pessimisticDays as number,
    };
  }

  let uplifts: readonly number[] | undefined;
  if (body.effortUpliftsPct !== undefined && body.effortUpliftsPct !== null) {
    const raw = body.effortUpliftsPct;
    if (!Array.isArray(raw) || raw.length > 8) {
      return { ok: false, code: 'VALIDATION', error: 'effortUpliftsPct must be an array of at most 8 percentages' };
    }
    for (const u of raw) {
      if (typeof u !== 'number' || !Number.isFinite(u) || u <= 0 || u > 500) {
        return { ok: false, code: 'VALIDATION', error: 'each effortUpliftsPct entry must be a percentage above 0 and at most 500' };
      }
    }
    uplifts = raw as number[];
  }

  if (body.policy !== undefined && body.policy !== null
      && (typeof body.policy !== 'object' || Array.isArray(body.policy))) {
    return { ok: false, code: 'VALIDATION', error: 'policy must be an object when supplied' };
  }

  return {
    ok: true,
    input: {
      offerKey,
      priceCents: body.priceCents as number,
      currency: currency.toUpperCase(),
      quotedVendorCostCents: (body.quotedVendorCostCents as number | undefined) ?? null,
      partnerId,
      fixedCostCents: (body.fixedCostCents as number | undefined) ?? null,
      effort,
      uplifts,
      policy: (body.policy as Partial<IssuePolicy> | undefined) ?? null,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE UNDERWRITING, ASSEMBLED                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Where every input came from, on the wire beside every response.
 *
 * This is the D1 answer to "what produced this" at the level the engine cannot
 * reach: the engine can explain its arithmetic in `drivers`, but only the server
 * knows whether the rate it was handed was on record or a placeholder. Reported as
 * data, in one place, so a surface renders it rather than reconstructing it.
 */
export interface UnderwriteProvenance {
  asOf: string;
  seed: number;
  sampleCount: number;
  minDecisionSamples: number;
  evaluatedBy: string;
  rateCard: { source: RateCardSource; onRecord: boolean; statement: string; partnerLabel: string };
  effort: { source: EffortSource; statement: string };
  /**
   * Which scope the devil's advocate argued about. `scope_snapshot` means what the
   * client actually agreed to; `catalogue` means today's versioned code, which is
   * the honest fallback when an engagement has no usable snapshot — and it is
   * reported because those two can disagree about the exclusions.
   */
  offerSource: 'scope_snapshot' | 'catalogue';
  outcomes: { count: number; rejected: number; statement: string };
  registries: RegistryPresence;
  rateCardsArePlaceholders: boolean;
  effortTriplesArePlaceholders: boolean;
  policyTightenedBy: readonly string[];
  migration: string;
  /** True when nothing on record could have produced a number. */
  refusedForMissingInputs: boolean;
  serverFactFields: readonly string[];
}

export interface UnderwritingResult {
  response: UnderwriteResponse;
  provenance: UnderwriteProvenance;
}

export interface UnderwriteContext {
  /** `c.get('operator').id`. Never a body field. */
  operator: string;
  /** The server clock, resolved once per request so every figure shares an instant. */
  asOf: string;
  policy: IssuePolicy;
  tightened: readonly string[];
  /** The frozen `scopeSnapshot` when underwriting something already sold. */
  offer?: ServiceOfferLike;
}

/**
 * RUN THE WHOLE UNDERWRITING. One simulation, three projections.
 *
 * `buildUnderwriteResponse` (`underwrite.ts:1805`) produces the distribution, the
 * sensitivity ladder, the block decision and the devil's advocate from a single
 * seeded run, which is why the `/sensitivity` and the argument routes both read
 * this one result rather than each calling the engine again. Two runs would be two
 * opinions on one screen, and a p50 that differs by $40 between two panels teaches
 * the desk to distrust the instrument.
 */
export async function buildUnderwriting(
  pool: Pool,
  input: UnderwriteInput,
  ctx: UnderwriteContext,
): Promise<UnderwritingResult> {
  const [card, effort, outcomes] = await Promise.all([
    loadRateCard(pool, input.partnerId, input.offerKey, input.currency),
    loadEffort(pool, input.offerKey, input.effort, ctx.operator, ctx.asOf),
    loadOutcomes(pool),
  ]);

  const model: CostModel = {
    offerKey: input.offerKey,
    partnerId: input.partnerId,
    partnerLabel: card.partnerLabel,
    card: card.card,
    effort: effort.effort,
    // From the CARD ROW, never from the request — see SERVER_FACT_FIELDS. An hourly
    // card with no hours per day on record refuses in the engine, which is the
    // intended outcome (`underwrite.ts:428`).
    hoursPerDay: card.hoursPerDay,
    // The row's pass-through plus any the caller declared. Additive on purpose: a
    // caller can only make the cost worse, so this direction cannot be a bypass.
    fixedCostCents: card.fixedCostCents + (input.fixedCostCents ?? 0),
  };

  const response = buildUnderwriteResponse(
    {
      offerKey: input.offerKey,
      priceCents: input.priceCents,
      currency: input.currency,
      quotedVendorCostCents: input.quotedVendorCostCents,
    },
    model,
    {
      asOf: ctx.asOf,
      outcomes: outcomes.outcomes,
      samples: DEFAULT_SAMPLE_COUNT,
      seed: DEFAULT_SEED,
    },
    ctx.offer ?? getOffer(input.offerKey),
    input.uplifts,
    ctx.policy,
  );

  const registries = await underwritingRegistries(pool);
  return {
    response,
    provenance: {
      asOf: ctx.asOf,
      seed: response.underwriting.seed,
      sampleCount: response.underwriting.sampleCount,
      minDecisionSamples: MIN_DECISION_SAMPLES,
      evaluatedBy: ctx.operator,
      rateCard: {
        source: card.source,
        onRecord: card.onRecord,
        statement: card.statement,
        partnerLabel: card.partnerLabel,
      },
      effort: { source: effort.source, statement: effort.statement },
      offerSource: ctx.offer ? 'scope_snapshot' : 'catalogue',
      outcomes: { count: outcomes.outcomes.length, rejected: outcomes.rejected, statement: outcomes.statement },
      registries,
      rateCardsArePlaceholders: RATE_CARDS_ARE_PLACEHOLDERS,
      effortTriplesArePlaceholders: EFFORT_TRIPLES_ARE_PLACEHOLDERS,
      policyTightenedBy: ctx.tightened,
      migration: UNDERWRITING_MIGRATION,
      refusedForMissingInputs: !card.onRecord && isRefusal(response.underwriting.verdict),
      serverFactFields: SERVER_FACT_FIELDS.map((f) => f.field),
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE GUARD — enforced on issuance, not reported next to it                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHY THIS EXISTS AND WHAT IT COSTS.
 *
 * `GPS_100X_PLAN.md` §3 slice 7.3: "P(loss) above a threshold blocks issuing the
 * proposal through the governed action rather than warning politely." A screen that
 * warns and a server that permits is theatre — the warning is the thing you click
 * past at 23:00 to get a quote out. So the block lives HERE, in front of
 * `issueProposal`, and the surface's copy of the decision is advisory.
 *
 * IT FAILS CLOSED, AND THAT IS A DECISION WITH A PRICE. When the cost basis cannot
 * be resolved — no rate card registry, no card for this partner, no partner
 * assigned — this refuses. It does not "allow with a warning", and there is no flag
 * to make it. The alternative was considered and rejected: a guard that permits
 * whatever it cannot evaluate is precisely the defect D2 names, and every real
 * bypass of this file would go through the un-evaluable case rather than through
 * the risky one.
 *
 * The price is that on an environment with no rate cards, NO PROPOSAL CAN BE
 * ISSUED. That is affordable here and would not be everywhere: 0047 is not applied
 * on production, so the number of proposals this has ever refused is zero, and the
 * inputs it wants (one migration, one card row, one partner assignment) are inputs
 * the plan already says the founder must supply. Every refusal carries the remedy
 * in the response so the desk is never left guessing which of the three is missing.
 *
 * ATTRIBUTION is `c.get('operator')`, passed in. This writes NOTHING — there is no
 * table for a refusal record and inventing one would be out of scope — so the
 * refusal is observable in the response and in the log line, and a durable record
 * of blocked issues is named in the return notes as something a human must decide
 * on rather than being quietly skipped.
 */
export const ISSUE_GUARD_FAILS_CLOSED =
  'Proposal issuance is refused whenever the margin distribution cannot be computed, not only when it is bad. '
  + 'A guard that permits what it cannot evaluate is a guard that every bypass goes through.';

export type IssueGuardCode =
  | 'ok'
  | 'MIGRATION_PENDING'
  | 'NOT_FOUND'
  | 'NO_PRICE'
  /** A caller declared `proposedPriceCents` that is not a positive whole number of cents. */
  | 'DECLARED_PRICE_INVALID'
  | 'UNDERWRITING_PARTNER_UNASSIGNABLE'
  | 'UNDERWRITING_NO_PARTNER'
  | 'UNDERWRITING_BLOCKED';

export interface IssueGuardDecision {
  allowed: boolean;
  code: IssueGuardCode;
  /** The status the caller must answer with. 200 only when `allowed`. */
  status: 200 | 404 | 409 | 503;
  /** One sentence, written to be quoted verbatim to whoever clicked issue. */
  reason: string;
  /** What to do about it. Null only when nothing is wrong. */
  remedy: string | null;
  engagementId: string;
  /** `c.get('operator').id` — who was refused, never a body field. */
  evaluatedBy: string;
  asOf: string;
  /** Null when the guard refused before it could underwrite. */
  underwriting: Underwriting | null;
  issue: IssueDecision | null;
  provenance: UnderwriteProvenance | null;
  policyNotice: string;
  perimeterGateNotice: string;
}

/** The frozen snapshot, when it is one, so the argument is about what was SOLD. */
function snapshotOffer(offerKey: OfferKey, snapshot: unknown): ServiceOfferLike | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const s = snapshot as Record<string, unknown>;
  const strings = (v: unknown): readonly string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  const exclusions = strings(s.exclusions);
  const inputs = strings(s.requiredClientInputs);
  if (exclusions === null || inputs === null) return undefined;
  return {
    key: offerKey,
    name: typeof s.offerName === 'string' ? s.offerName : getOffer(offerKey).name,
    exclusions,
    requiredClientInputs: inputs,
  };
}

/**
 * MAY THIS ENGAGEMENT'S PROPOSAL BE ISSUED?
 *
 * Everything is read server-side: the price, the currency and the offer from
 * `gps_engagement`, the partner from its assignment, the rate from the registry,
 * the appetite from `DEFAULT_ISSUE_POLICY`. NOTHING comes from a request body, so
 * there is no field a caller can add or omit to change the answer — which is the
 * property the exploratory route can only claim and this one can enforce.
 *
 * The one refusal it deliberately does NOT own is the conflict gate: that lives in
 * `setEngagementStatus` inside the same transaction as the status move
 * (`service.ts:825`) and parks the engagement in `conflict_pending` when it fires.
 * Duplicating it here would produce a second, laxer copy of the compartment's most
 * important control.
 *
 * WHAT IT DOES NOT GUARANTEE, stated rather than left to be discovered: this reads
 * the engagement outside the transaction that `issueProposal` later opens, so a
 * price changed in the milliseconds between the two would be underwritten at its
 * old value. Not fixed with a lock, because the alternative — moving the
 * underwriting inside `setEngagementStatus` — would put a 4,000-sample simulation
 * inside a `FOR UPDATE` transaction on the compartment's hot row, and the exposure
 * is one desk, one operator, one click. If GPS ever gains a second concurrent
 * writer, this is the line to revisit.
 *
 * ── `proposedPriceCents`, AND WHY IT IS NOT A HOLE ───────────────────────────
 * The REST route does not set a price: `issueProposal` moves the status and the
 * price was frozen at creation, so reading the row is reading the price that will be
 * issued. The ACTION path (`gps_proposal_issue`) sets the price in the same statement
 * that moves the status, so reading the row there would underwrite the OLD price and
 * then write a different one — a guard evaluating a number that is about to be
 * replaced. So the caller may declare the price it is about to write, and only that.
 *
 * It is not a bypass, and the distinction matters: `seed`, `samples`, `hoursPerDay`
 * and the policy remain server facts (`SERVER_FACT_FIELDS`) precisely because those
 * change the ANSWER without changing the world. The price is the opposite — it is
 * the thing being decided, it is what gets persisted, and a caller who lowers it to
 * flatter the simulation has lowered the actual price of the actual engagement. A
 * HIGHER declared price than the row's is likewise fine: it is the price that will
 * be on the proposal.
 *
 * A DECLARED PRICE IS AUTHORITATIVE, AND THAT MEANS IT IS NEVER SILENTLY IGNORED.
 * This used to read `Number.isInteger(p) && p > 0 ? p : engagement.priceCents`, so a
 * declared 0, -1, 0.5 or NaN FELL BACK to the row — the guard then underwrote a
 * number the caller was not about to write, and answered `allowed` about it. That is
 * the same shape as the sub-cent hole in `packages/shared/src/gps/underwrite.ts:443`:
 * a guard that re-decides which input to trust is a guard with a door in it. Today's
 * two callers cannot reach it — the action's zod schema is `centsAtLeast(1)` and the
 * REST middleware declares nothing — but the exported contract is what the next
 * caller reads, so the contract is what gets fixed. When the field is PRESENT it is
 * used or it is refused (`DECLARED_PRICE_INVALID`); the row's own `<= 0` is still
 * `NO_PRICE`, and the two codes are distinct because "this engagement was never
 * quoted" and "you handed me a price I cannot write" are different findings.
 */
export async function guardProposalIssue(
  pool: Pool,
  engagementId: string,
  ctx: { operator: string; asOf: string; proposedPriceCents?: number },
): Promise<IssueGuardDecision> {
  const shell = {
    engagementId,
    evaluatedBy: ctx.operator,
    asOf: ctx.asOf,
    underwriting: null,
    issue: null,
    provenance: null,
    policyNotice: DEFAULT_ISSUE_POLICY.statedBy === 'system:default'
      ? 'The 20% P(loss) ceiling is a stated default, not a founder-agreed risk appetite. It should be reviewed the first time it blocks something.'
      : `Appetite stated by ${DEFAULT_ISSUE_POLICY.statedBy}.`,
    perimeterGateNotice: ISSUE_GUARD_FAILS_CLOSED,
  };

  if (!(await isMigrated(pool))) {
    return {
      ...shell,
      allowed: false,
      code: 'MIGRATION_PENDING',
      status: 503,
      reason: 'GLOBAL SERVICES is awaiting migration 0047 on this environment, so there is no engagement to underwrite.',
      remedy: 'Apply 0047_gps.sql.',
    };
  }

  const engagement = await getEngagement(pool, engagementId);
  if (!engagement) {
    return { ...shell, allowed: false, code: 'NOT_FOUND', status: 404, reason: 'engagement not found', remedy: null };
  }
  // The price about to be WRITTEN, when the caller is writing one. See the docblock:
  // a declared price is USED or REFUSED, never quietly swapped for the row's.
  const declared = ctx.proposedPriceCents;
  if (declared !== undefined && !(Number.isSafeInteger(declared) && declared > 0)) {
    return {
      ...shell,
      allowed: false,
      code: 'DECLARED_PRICE_INVALID',
      status: 409,
      reason:
        `The price declared for this proposal (${String(declared)}) is not a positive whole `
        + 'number of cents, so there is nothing to underwrite. It was NOT replaced with the '
        + 'price already on the engagement: underwriting one number while a different one is '
        + 'written is how a below-cost proposal gets a green light.',
      remedy: 'Declare priceCents as a positive integer, or omit it to underwrite the engagement’s own price.',
    };
  }
  const priceCents = declared ?? engagement.priceCents;
  if (priceCents <= 0) {
    // Refused here with the SAME code the route already uses for this, so a client
    // branching on NO_PRICE sees no change. Not delegated downstream: a guard that
    // relies on something after it to catch a case is a guard with a hole in it.
    return {
      ...shell,
      allowed: false,
      code: 'NO_PRICE',
      status: 409,
      reason: 'This engagement has no price, so there is no margin to underwrite. A proposal with no number is not a proposal.',
      remedy: 'Quote the engagement first.',
    };
  }

  if (!(await engagementHasPartnerColumn(pool))) {
    return {
      ...shell,
      allowed: false,
      code: 'UNDERWRITING_PARTNER_UNASSIGNABLE',
      status: 409,
      reason:
        'This engagement cannot record who is delivering it, so the cost of delivering it cannot be modelled and '
        + 'the margin on the proposal is unknown. Issuance is refused rather than permitted on an unknown margin.',
      remedy: `Apply ${UNDERWRITING_MIGRATION}: ${UNDERWRITING_MIGRATION_SPEC.engagementAlter[0]}`,
    };
  }

  const partnerRes = await pool.query(
    `SELECT partner_id FROM gps_engagement WHERE id = $1`,
    [engagementId],
  );
  const partnerId = typeof partnerRes.rows[0]?.partner_id === 'string'
    ? String(partnerRes.rows[0].partner_id).trim()
    : '';
  if (!partnerId) {
    return {
      ...shell,
      allowed: false,
      code: 'UNDERWRITING_NO_PARTNER',
      status: 409,
      reason:
        'No partner is assigned to this engagement. Partners deliver and the founder coordinates, so the cost of '
        + 'this engagement is whatever the assigned partner charges — and it is not inferred from the one card on '
        + 'record, because "X will deliver this" is a claim nobody has made.',
      remedy: 'Assign the delivering partner on the engagement, then re-issue.',
    };
  }

  // The SERVER appetite, attributed to the operator who is being refused. No body,
  // no override, no seed, no sample count: `buildUnderwriting` is handed
  // `DEFAULT_SAMPLE_COUNT` and `DEFAULT_SEED` and there is no path to anything else.
  const built = await buildUnderwriting(
    pool,
    {
      offerKey: engagement.offerKey,
      priceCents,
      currency: engagement.currency,
      quotedVendorCostCents: engagement.vendorCostCents,
      partnerId,
      fixedCostCents: null,
      effort: null,
      uplifts: undefined,
      policy: null,
    },
    {
      operator: ctx.operator,
      asOf: ctx.asOf,
      policy: DEFAULT_ISSUE_POLICY,
      tightened: [],
      // Argue about what the client actually agreed to, not about today's
      // catalogue — the catalogue is versioned code and will have moved on.
      offer: snapshotOffer(engagement.offerKey, engagement.scopeSnapshot),
    },
  );

  const { response, provenance } = built;
  const decided = {
    ...shell,
    underwriting: response.underwriting,
    issue: response.issue,
    provenance,
    policyNotice: response.policyNotice,
  };

  if (response.issue.blocked) {
    return {
      ...decided,
      allowed: false,
      code: 'UNDERWRITING_BLOCKED',
      status: 409,
      // Verbatim from the engine: the screen, the log and this body must not quote
      // three different numbers for one threshold.
      reason: response.issue.reason,
      remedy: provenance.refusedForMissingInputs
        ? `${provenance.rateCard.statement} Record the rate card (migration ${UNDERWRITING_MIGRATION}), then re-issue.`
        : 'Raise the price, cut the scope, or have the risk appetite changed on the record.',
    };
  }

  return {
    ...decided,
    allowed: true,
    code: 'ok',
    status: 200,
    reason: response.issue.reason,
    remedy: null,
  };
}
