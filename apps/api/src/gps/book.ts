import type { Pool } from 'pg';
import {
  AGED_DEPOSIT_ALARM_DAYS,
  AXIS_LABEL,
  CATALOGUE_TODOS,
  CREDIBILITY_LABEL,
  RELIABILITY_LABEL,
  COORDINATION_HOURS_ARE_PLACEHOLDERS,
  ENGAGEMENT_STATUS_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  OFFERS,
  OFFER_KEYS,
  PARTNER_BENCH,
  PRICE_BANDS_ARE_PLACEHOLDERS,
  UNATTRIBUTED,
  VALUE_AXES,
  WIP_STATUSES,
  admiraltyCode,
  ageInDays,
  benchHeadroom,
  bindingConstraint,
  bookConcentration,
  bookHealth,
  bracketForAgeDays,
  cashConversion,
  isOpenPosition,
  isTerminalEngagementStatus,
  marginCents,
  marginRealisation,
  positionValueCents,
  type ActiveEngagementRef,
  type AgingBracketKey,
  type BenchHeadroom,
  type BookConcentration,
  type BookHealth,
  type BookPlaceholders,
  type BookPosition,
  type BookResponse,
  type BookUnresolved,
  type CashConversion,
  type ConcentrationBasis,
  type Driver,
  type EngagementStatus,
  type FunnelStage,
  type MarginRealisation,
  type OfferKey,
  type Partner,
  type ValueAxis,
  type WipLoad,
} from '@lcx/shared';
import { isMigrated } from './service.js';
import { OUTCOME_MIGRATION, isOutcomeMigrated, listOutcomeRecords } from './loop.js';
import { deskWip, isDeliveryMigrated } from './deliveryDesk.js';

/**
 * GLOBAL SERVICES — PHASE 6, THE BOOK: the data layer behind `/v1/gps/book`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  THIS FILE ADDS NO PORTFOLIO ARITHMETIC. IT LOADS ROWS AND CALLS THE ENGINES.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `packages/shared/src/gps/book.ts` (2,074 lines, 60 tests) owns concentration,
 *  cash conversion, the binding constraint and the composed grade. `partners.ts`
 *  owns bench headroom, `calibration.ts` owns margin realisation, `delivery.ts`
 *  owns the coordination ceiling. Before this phase, `benchHeadroom()` and
 *  `marginRealisation()` had never been called by anything at all
 *  (`GPS_100X_PLAN.md` §0: 4,564 lines of engine, 0 web files). Wiring them is the
 *  point of the phase, so if a figure appears below that an engine did not produce,
 *  that is a bug and not a feature.
 *
 *  WHAT THIS FILE IS ALLOWED TO DECIDE, and nothing else:
 *    1. which rows are a position (`gps_engagement ⨝ gps_client`),
 *    2. which statuses occupy a partner slot — and it does not decide that either,
 *       it imports `WIP_STATUSES` (`delivery.ts:1145`), because a second copy of
 *       that policy is the copy that goes stale,
 *    3. how the engine objects are REDUCED to the narrow nullable scalars
 *       `bindingConstraint` asks for (`book.ts:1397`),
 *    4. what is unresolved, and what a placeholder is standing in for.
 *
 * ── THE CONTRACT ──────────────────────────────────────────────────────────────
 *  `BookResponse` is declared ONCE, at `packages/shared/src/gps/book.ts:2035`.
 *  This file returns that type and `apps/web/src/lib/api/gpsBook.ts` re-exports the
 *  same declaration. Neither restates a field. The rule is written in blood: a
 *  hand-copied `GpsSummary` in the web api directory claimed `counts`,
 *  `clientCount` and `openValueCents`, the API never returned one of them, `tsc`
 *  type-checked the fiction because a copy is syntactically perfect, and the page's
 *  own test agreed with it because the test mocked the copy. It exploded the moment
 *  the migration landed. The ONE new shape here is the DRILL-DOWN envelope
 *  (`BookDrill`), which the shared layer does not declare; the handover names it as
 *  the thing to move into `packages/shared` if a surface consumes it, and forbids
 *  copying it into the web instead.
 *
 * ── MIGRATION-PENDING DISCIPLINE ──────────────────────────────────────────────
 *  0047 (clients + engagements) is applied BY HAND against a database whose
 *  credentials live in Render's dashboard, while this code ships on a push to main.
 *  So there is a window — possibly a weekend — where the book is live and
 *  `gps_engagement` does not exist. Reads answer 200 with `emptyBook()` and
 *  `migrated: false`; nothing here throws for a missing table. `migrated: false` is
 *  a first-class state and NOT the same fact as "the book is empty": one says the
 *  compartment has no tables yet, the other says the founder has sold nothing.
 *  The 0049 (delivery) and `gps_outcome` probes are SEPARATE and independent —
 *  three migrations, three answers, three named absences.
 *
 * ── NO CLIENT MATERIAL, STILL ─────────────────────────────────────────────────
 *  There is no intake of any kind in this file and no route in `gpsBook.ts` that
 *  could accept one. A portfolio screen is a tempting place to defeat that gate
 *  ("attach the signed SOW to the position"), and decision D2 (LCX DPO: controller
 *  vs processor for a third party's confidential material) is still UNANSWERED.
 *  `__tests__/intakeLockout.test.ts` DISCOVERS this file by path and fails the
 *  build if it opens any of the ten byte doors — so this is a lock, not a habit.
 *
 * ── EVERY MONEY FIGURE IS INTEGER CENTS, PER CURRENCY, NEVER POOLED ───────────
 *  `crossCurrencyTotalCents` is a literal `null` in the shared types, permanently.
 *  There is no FX source in this repo and one confident wrong total is worse than
 *  five honest ones.
 */

/* ── Reading money out of Postgres ─────────────────────────────────────────── */

/**
 * `bigint` arrives from node-postgres as a STRING, because a bigint does not fit
 * in a JS number in general. Ours do (no engagement is $90 quadrillion) but the
 * driver cannot know that, so every money column is normalised here exactly once —
 * the same helper, for the same reason, as `service.ts:109`.
 *
 * Reading `row.price_cents` directly is the bug this exists to prevent:
 * `"1200000" + 0` yields `"12000000"`, a figure ten times too large, silently, and
 * concentration is a ratio of sums so one coerced string poisons every share on the
 * screen rather than one cell.
 */
function cents(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** timestamptz → ISO string, preserving null. Null is data here, not a gap to fill. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/* ── The position load ─────────────────────────────────────────────────────── */

/**
 * Written out rather than `SELECT *`: a column rename in a later migration is then
 * a typecheck failure in one file instead of a silently missing field on a screen
 * (`service.ts:203` states the same rule for the same reason).
 *
 * `partner` is absent from this list because THERE IS NO PARTNER COLUMN. It is not
 * an oversight in the SELECT — `0047_gps.sql:124` has no such column and no offer
 * in the catalogue names a `partnerOwner` (D5 outstanding), so the delivering
 * partner is genuinely unknown for every row. `bookConcentration` receives `null`
 * and BANDS the partner axis instead of guessing (`book.ts:288`), which is the
 * difference between "we cannot answer this yet" as a computed fact and as a
 * missing feature.
 */
const POSITION_COLS = `
  e.id, e.client_id, c.name AS client_name, c.jurisdiction,
  e.offer_key, e.status, e.currency,
  e.price_cents, e.vendor_cost_cents, e.deposit_required_cents,
  e.accepted_at, e.deposit_paid_at, e.created_at`;

interface PositionRow {
  id: string;
  client_id: string;
  client_name: string | null;
  jurisdiction: string | null;
  offer_key: string;
  status: string;
  currency: string;
  price_cents: unknown;
  vendor_cost_cents: unknown;
  deposit_required_cents: unknown;
  accepted_at: unknown;
  deposit_paid_at: unknown;
  created_at: unknown;
}

function toPosition(r: PositionRow): BookPosition {
  return {
    engagementId: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    offerKey: r.offer_key as OfferKey,
    status: r.status as EngagementStatus,
    // Normalised here so two spellings of one currency cannot become two holders.
    currency: (r.currency || '').trim().toUpperCase() || 'UNKNOWN',
    priceCents: cents(r.price_cents),
    vendorCostCents: cents(r.vendor_cost_cents),
    jurisdiction: r.jurisdiction,
    partner: null,
    depositRequiredCents: cents(r.deposit_required_cents),
    acceptedAt: iso(r.accepted_at),
    depositPaidAt: iso(r.deposit_paid_at),
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    // `invoicedAt` is deliberately NOT set: 0047 has no invoiced_at column, and
    // substituting `updated_at` would age receivables from whenever somebody last
    // touched the row. `cashConversion` then REFUSES to age receivables and says so
    // (`CashConversion.receivableAgingRefusal`) rather than inventing an anchor.
  };
}

/**
 * The cap, and why a cap exists on a book of ~29 engagements a year.
 *
 * Not for performance — for the honesty of the aggregate. Concentration, HHI and
 * every conversion rate are ratios over the WHOLE book, so a silently truncated
 * read produces shares that are individually plausible and collectively wrong. The
 * load therefore asks for one row more than it will use, and if that row arrives it
 * reports truncation as a BLOCKING unresolved rather than trimming quietly (D2).
 */
const MAX_POSITIONS = 5000;

export interface PositionLoad {
  positions: readonly BookPosition[];
  /** True when the book is larger than `MAX_POSITIONS`. Every ratio is then wrong. */
  truncated: boolean;
  /** Rows the join returned. Equal to `positions.length` unless truncated. */
  rowsRead: number;
}

/**
 * Every engagement, as a position, with its client's name and jurisdiction.
 *
 * INNER JOIN, not LEFT: `gps_engagement.client_id` is NOT NULL and REFERENCES
 * `gps_client(id)` (`0047_gps.sql:127`), so a position with no client is
 * unrepresentable rather than merely unlikely. A LEFT JOIN here would add a branch
 * for a state the database forbids, and that branch would never be tested.
 *
 * TERMINAL POSITIONS ARE INCLUDED, and the two engines then disagree on purpose:
 * `bookConcentration` excludes them by default (a client who paid and left
 * concentrates nothing) while `cashConversion` needs all of them, because
 * `collected` is both a terminal status and the last funnel stage and dropping it
 * would delete the denominator of the only conversion anyone cares about
 * (`book.ts:1141`).
 */
export async function loadPositions(pool: Pool): Promise<PositionLoad> {
  const res = await pool.query<PositionRow>(
    `SELECT ${POSITION_COLS}
       FROM gps_engagement e
       JOIN gps_client c ON c.id = e.client_id
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT $1`,
    [MAX_POSITIONS + 1],
  );
  const rowsRead = res.rows.length;
  const truncated = rowsRead > MAX_POSITIONS;
  return {
    positions: res.rows.slice(0, MAX_POSITIONS).map(toPosition),
    truncated,
    rowsRead,
  };
}

/**
 * The engagements currently occupying a partner slot, for `benchHeadroom()`.
 *
 * `partnerId` is `null` on every ref for the same reason `BookPosition.partner` is,
 * and that null is LOAD-BEARING rather than lossy: `benchHeadroom` counts refs with
 * a null partner as `unstaffedActiveCount` — "sold and unstaffable, consuming
 * nobody's slot, invisible to the arithmetic and fatal to the moat"
 * (`partners.ts:379`). Handing it a fabricated partner id would delete exactly the
 * finding the function exists to produce.
 *
 * The occupying statuses come from `WIP_STATUSES` (`accepted`, `deposit_paid`,
 * `in_delivery`) because `partners.ts:320` explicitly leaves that policy to the
 * caller and `delivery.ts` is where the statuses already live.
 */
function activeRefs(positions: readonly BookPosition[]): ActiveEngagementRef[] {
  return positions
    .filter((p) => WIP_STATUSES.includes(p.status))
    .map((p) => ({ engagementId: p.engagementId, offerKey: p.offerKey, partnerId: null }));
}

/* ── 6.2 · BENCH CAPACITY — the first call `benchHeadroom()` has ever had ───── */

/**
 * Bench headroom, or an explicit null when there is no bench to measure.
 *
 * `PARTNER_BENCH` is `[]` (`partners.ts:307`): not one partner is recorded, because
 * only the founder can name them (D5). Calling `benchHeadroom` over an empty bench
 * returns `totalSpareSlots: 0`, and 0 is a TRUE answer to "how many slots are
 * spare" that a dense surface will render as AT CAPACITY — the opposite of the
 * actual state, which is "nobody has told us about the bench". So the null is the
 * honest response and `unresolved` carries the reason.
 *
 * The engine call is not dead code and is not deferred: `partners` is a parameter,
 * the guard is on the DATA and not on a feature flag, so the moment one partner is
 * recorded this returns a real `BenchHeadroom` with `perOfferIndependent` and every
 * `HeadroomReason` intact. `__tests__/book.test.ts` passes a synthetic bench and
 * asserts the engine's own output reaches the response unaltered.
 */
export function benchCapacity(
  positions: readonly BookPosition[],
  asOf: string,
  partners: readonly Partner[] = PARTNER_BENCH,
): BenchHeadroom | null {
  if (partners.length === 0) return null;
  // `asOf` is passed so availability windows are APPLIED rather than skipped —
  // omitting it makes the engine report `availabilityEvaluated: false`
  // (`partners.ts:379`), which would be a self-inflicted evidence gap.
  return benchHeadroom(OFFER_KEYS, partners, activeRefs(positions), { asOf });
}

/* ── The collection base rate: the one place a likelihood term is earned ───── */

/**
 * Realised deposit collection, with the right-censored cases REMOVED and counted.
 *
 * `bookHealth` will attach an ICD-203 likelihood term to this and to nothing else
 * (`book.ts:1723`), so the denominator has to be defensible. The naive version —
 * every accepted engagement over those that paid — is censored: an engagement
 * accepted two days ago that has not paid yet is not a failure, it is unfinished,
 * and counting it as one drags the rate down by an amount that depends only on how
 * recently he sold something.
 *
 * So the sample is RESOLVED ACCEPTANCES only:
 *   · numerator — accepted AND the deposit is recorded paid,
 *   · denominator — the numerator, plus accepted engagements that reached a terminal
 *     status (`collected` / `closed_lost` / `cancelled`) without the deposit ever
 *     being paid. Those are settled facts: no deposit is coming.
 * An accepted engagement that is still live and unpaid is in NEITHER, and is
 * returned as `censored` so the surface can say how much of the book the rate does
 * not cover.
 *
 * Returns null when the resolved sample is empty. `bookHealth` then states
 * `collectionOutlookRefusal` instead of a likelihood, which is the correct output:
 * a term attached to a base rate nobody has observed is invented precision (D8).
 */
export interface CollectionBaseRate {
  collected: number;
  total: number;
  /** Accepted, unpaid, still live. Excluded from the rate, never counted as a loss. */
  censored: number;
  basis: string;
}

export function collectionBaseRate(positions: readonly BookPosition[]): CollectionBaseRate | null {
  const accepted = positions.filter((p) => p.acceptedAt != null);
  const collected = accepted.filter((p) => p.depositPaidAt != null).length;
  const settledUnpaid = accepted.filter(
    (p) => p.depositPaidAt == null && isTerminalEngagementStatus(p.status),
  ).length;
  const censored = accepted.length - collected - settledUnpaid;
  const total = collected + settledUnpaid;
  if (total === 0) return null;
  return {
    collected,
    total,
    censored,
    basis:
      `${collected} of ${total} RESOLVED acceptances had the deposit paid. ` +
      `${censored} accepted engagement${censored === 1 ? ' is' : 's are'} still live and unpaid and ` +
      'are excluded rather than counted as failures — a two-day-old unpaid deposit is unfinished, ' +
      'not lost, and including it would move the rate by nothing more than how recently he sold.',
  };
}

/* ── Placeholders and unresolved inputs ────────────────────────────────────── */

/**
 * Which placeholders are in force. Read from the constants that own them, never
 * restated: `PRICE_BANDS_ARE_PLACEHOLDERS` (`catalogue.ts:58`) and
 * `COORDINATION_HOURS_ARE_PLACEHOLDERS` (`delivery.ts:1173`) flip in the commit that
 * supplies real figures, and a surface reading a second copy would badge the wrong
 * thing for a quarter.
 */
export function bookPlaceholders(partners: readonly Partner[] = PARTNER_BENCH): BookPlaceholders {
  return {
    priceBandsArePlaceholders: PRICE_BANDS_ARE_PLACEHOLDERS,
    // Vendor costs are placeholders exactly while no partner holds a rate card:
    // `quoteOffer` defaults an unsupplied cost from the catalogue's
    // `expectedVendorCostCents`, which is a TODO figure (`catalogue.ts:76`), and that
    // default is FROZEN into the engagement at creation. So a row's cost may be a
    // placeholder that has since acquired the authority of a stored number.
    vendorCostsArePlaceholders: !partners.some((p) => p.rateCards.length > 0),
    coordinationHoursArePlaceholders: COORDINATION_HOURS_ARE_PLACEHOLDERS,
    blockingQuotingDecisions: CATALOGUE_TODOS.filter((t) => t.blocksQuoting).length,
    partnerRateCardsSupplied: partners.some((p) => p.rateCards.length > 0),
  };
}

/**
 * What the engines asked for and did not get.
 *
 * A PLACEHOLDER is a number standing in for a real one; an UNRESOLVED is a
 * capability that does not exist. Both must be visible and they must not be
 * conflated, because conflating them is how "we used a guess" becomes "we measured
 * it" (`book.ts:2025`).
 *
 * `blocking` is reserved for a DECISION-BEARING NUMBER THAT IS UNAVAILABLE, not for
 * one that is merely approximate. Price bands are the instructive case: they are
 * placeholders, and they are NOT blocking here, because the book reads the price a
 * human actually typed onto each engagement rather than a band. Vendor costs are
 * the opposite case and they are blocking, because `margin` is the default
 * concentration basis and a frozen placeholder cost silently becomes the
 * denominator of every share on the screen.
 */
export interface UnresolvedInput {
  migrated: boolean;
  deliveryMigrated: boolean;
  outcomeMigrated: boolean;
  truncated: boolean;
  rowsRead: number;
  placeholders: BookPlaceholders;
  capacity: BenchHeadroom | null;
  /** Rows `gps_outcome` returned that the outcome union refused to map. */
  outcomeRejected: number;
  cash: CashConversion;
}

export function bookUnresolved(input: UnresolvedInput): readonly BookUnresolved[] {
  const out: BookUnresolved[] = [];

  if (!input.migrated) {
    out.push({
      field: 'migration 0047_gps.sql (gps_client, gps_engagement)',
      owner: 'engineering',
      whyItMatters:
        'Every figure in this response is computed from those two tables. Neither exists on this environment yet.',
      consequence:
        'The book is EMPTY BECAUSE IT IS UNREADABLE, not because nothing has been sold. Nothing below may be read as a measurement of the business.',
      blocking: true,
    });
  }
  if (input.truncated) {
    out.push({
      field: `book size (over ${MAX_POSITIONS} positions; ${input.rowsRead} rows seen)`,
      owner: 'engineering',
      whyItMatters:
        'Concentration, HHI and every conversion rate are ratios over the whole book, so a partial read produces shares that are individually plausible and collectively wrong.',
      consequence:
        'Treat every share, index and rate below as invalid until the read is paged. The counts are lower bounds.',
      blocking: true,
    });
  }
  if (input.placeholders.vendorCostsArePlaceholders) {
    out.push({
      field: 'partner rate cards → gps_engagement.vendor_cost_cents',
      owner: 'partner',
      whyItMatters:
        'Margin is the default concentration basis because partners deliver and he sells and coordinates, so margin and capacity are the business rather than revenue. Margin is price minus vendor cost.',
      consequence:
        'Where an engagement was created without an explicit cost, the catalogue placeholder was frozen into the row. Concentration BY MARGIN is arithmetically correct and UNCALIBRATED; the price basis is the one measured reading available today.',
      blocking: true,
    });
  }
  out.push({
    field: 'gps_engagement.partner (the delivering partner)',
    owner: 'engineering',
    whyItMatters:
      'A services book with 60% of its margin behind one partner is one resignation from a crisis. That is the axis this instrument exists to watch.',
    consequence:
      'No column exists and no offer names a partnerOwner, so the partner axis is BANDED, never measured: its low reading assumes every position is behind a different unseen partner and its high reading assumes one. The truth is inside that band and cannot be narrowed from the schema.',
    blocking: true,
  });
  if (input.capacity == null) {
    out.push({
      field: 'the partner bench (PARTNER_BENCH is empty)',
      owner: 'founder',
      whyItMatters:
        'Bench depth per offer IS the concurrency cap on a business whose delivery is subcontracted. Only he can name the partners, their capabilities, their jurisdictions and their concurrent capacity.',
      consequence:
        'benchHeadroom() has no bench to measure, so capacity is null rather than zero — "nobody has told us" is not "at capacity" — and the bench_capacity constraint check is reported unevaluable instead of passing.',
      blocking: true,
    });
  }
  if (!input.cash.receivableAnchorAvailable) {
    out.push({
      field: 'an invoice date (no invoiced_at column in 0047_gps.sql)',
      owner: 'engineering',
      whyItMatters:
        'Delivered-and-never-collected is how a services business dies. Aging a receivable needs the date the invoice was raised.',
      consequence:
        'Receivable aging is refused outright rather than aged from updated_at, which would age it from whenever somebody last touched the row. Deposit aging is unaffected: it anchors on accepted_at, which does exist.',
      blocking: true,
    });
  }
  if (!input.outcomeMigrated) {
    out.push({
      field: `realised margin outcomes (table gps_outcome, migration ${OUTCOME_MIGRATION})`,
      owner: 'engineering',
      whyItMatters:
        'Quoted versus realised margin per offer and per partner is the single most important number in a partner-delivered business, and nothing in the 47 migrations before 0047 tracked cost at all.',
      consequence:
        'marginRealisation() is null rather than an optimistic zero. Slippage cannot be derived from gps_engagement alone: quoted and realised would both read the same column, so the answer would be exactly 0% by construction — a fabricated measurement, which is worse than an absent one.',
      blocking: true,
    });
  }
  if (input.outcomeRejected > 0) {
    out.push({
      field: `gps_outcome rows the domain union refused (${input.outcomeRejected})`,
      owner: 'engineering',
      whyItMatters:
        'A row the database accepted and the TypeScript union rejected means the CHECK constraints and the union have diverged.',
      consequence:
        'Those outcomes are absent from margin realisation. The count is surfaced rather than logged so the gap cannot look like a shorter history.',
      blocking: false,
    });
  }
  if (!input.deliveryMigrated) {
    out.push({
      field: 'migration 0049_gps_delivery.sql (gps_milestone)',
      owner: 'engineering',
      whyItMatters:
        'The coordination ceiling is HIS, and it is measured over live milestones — he sells and coordinates around a full-time job at a regulated exchange.',
      consequence:
        'wip is null, so the coordination_hours constraint check is unevaluable rather than passing. A null there cannot produce a false "he has room".',
      blocking: false,
    });
  }
  if (input.placeholders.coordinationHoursArePlaceholders) {
    out.push({
      field: 'measured coordination hours per offer, and his weekly ceiling',
      owner: 'founder',
      whyItMatters:
        'Utilisation is the number a tool uses to say yes to a fifth engagement. Only he knows what an engagement actually costs him per week.',
      consequence:
        'The hours are placeholders. Read the SHAPE and the ORDERING, never the magnitudes, and never plan against the utilisation percentage.',
      blocking: false,
    });
  }
  if (input.placeholders.priceBandsArePlaceholders) {
    out.push({
      field: `price bands per offer (${input.placeholders.blockingQuotingDecisions} catalogue decisions block quoting)`,
      owner: 'founder',
      whyItMatters:
        'A band is what makes a quote defensible without him in the room. He has sold roughly $250k of these engagements manually without one.',
      consequence:
        'NOT blocking for the book: every figure here reads the price a human typed onto the engagement, not a band. It blocks the quoting surface, which badges it there.',
      blocking: false,
    });
  }

  // Blocking first, order within a group preserved — the sequence above is the
  // order a reader should meet them in, and a comparator on `owner` or on text
  // would shuffle that for no reason a reader could see.
  return [...out].sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE COMPOSITION — pure, so it is testable without a database
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Everything the composition needs, already loaded. Nothing here is optional and
 * nothing defaults, because a default is how "we did not look" becomes "there was
 * none": each `null` below has to be a decision somebody can point at.
 */
export interface BookFacts {
  positions: readonly BookPosition[];
  asOf: string;
  basis: ConcentrationBasis;
  /** 0047 applied. False means UNREADABLE, not empty. */
  migrated: boolean;
  /** 0049 applied — required before the coordination ceiling can be read. */
  deliveryMigrated: boolean;
  /** `gps_outcome` exists — required before realised margin can be read. */
  outcomeMigrated: boolean;
  truncated: boolean;
  rowsRead: number;
  wip: WipLoad | null;
  margin: MarginRealisation | null;
  outcomeRejected: number;
  /** Overridable only so a test can supply a bench; production passes nothing. */
  partners?: readonly Partner[];
}

/**
 * The book, composed. One `asOf` threaded through every engine.
 *
 * THE ORDER OF THESE FOUR CALLS IS THE ARGUMENT OF THE PHASE, so it is stated
 * rather than left to be inferred:
 *
 *  1 `bookConcentration` — open positions only. History concentrates nothing.
 *  2 `cashConversion`    — ALL positions, terminals included, because `collected`
 *    is both a terminal status and the final funnel stage (`book.ts:1141`).
 *  3 `bindingConstraint` — consumes the SAME `CashConversion` INSTANCE the funnel
 *    renders, so the verdict and the evidence under it are one instant.
 *  4 `bookHealth`        — consumes 1, 2 and 3. Its drivers sum to its score by
 *    construction, which is the whole of D1 in one property.
 *
 * A surface that fetched these separately could print a verdict about one instant
 * beside evidence from another. That is why `/v1/gps/book` is one request.
 */
export function composeBook(facts: BookFacts): BookResponse {
  const { positions, asOf, basis } = facts;
  const partners = facts.partners ?? PARTNER_BENCH;

  const concentration: BookConcentration = bookConcentration(positions, asOf, { basis });
  const cash: CashConversion = cashConversion(positions, asOf);
  const capacity = benchCapacity(positions, asOf, partners);
  const placeholders = bookPlaceholders(partners);

  /**
   * The reduction the constraint engine asks for: narrow NULLABLE scalars, not
   * engine objects (`book.ts:1397`). Every null below is the difference between
   * "no headroom" and "nobody has told us about the bench" — passing 0 for an
   * unknown silently manufactures a verdict, which is the exact defect D2 forbids.
   *
   * `offersWithNamedPartner` is NOT nullable here and is 0 today: that is a
   * catalogue fact (`partnerOwner: null` on all five offers), true whether or not a
   * migration has run, so it is measured rather than unknown.
   */
  const constraint = bindingConstraint({
    benchSpareSlots: capacity ? capacity.totalSpareSlots : null,
    offersWithNamedPartner: OFFERS.filter((o) => o.partnerOwner !== null).length,
    unstaffableActive: facts.wip ? facts.wip.unstaffable : null,
    coordinationHoursPerWeek: facts.wip ? facts.wip.coordinationHoursPerWeek : null,
    capacityHoursPerWeek: facts.wip ? facts.wip.capacityHoursPerWeek : null,
    coordinationHoursArePlaceholders: facts.wip
      ? facts.wip.usesPlaceholderHours
      : COORDINATION_HOURS_ARE_PLACEHOLDERS,
    cash,
    // Unreadable tables cannot report an empty pipeline. Null, not 0, or the
    // verdict would be "you are not selling" on a database nobody has migrated.
    liveOpportunities: facts.migrated
      ? positions.filter((p) => isOpenPosition(p) && p.acceptedAt == null).length
      : null,
    blockingQuotingDecisions: placeholders.blockingQuotingDecisions,
    priceBandsArePlaceholders: placeholders.priceBandsArePlaceholders,
  });

  const health: BookHealth = bookHealth({
    positions,
    concentration,
    cash,
    constraint,
    collectionHistory: collectionBaseRate(positions),
  });

  return {
    migrated: facts.migrated,
    asOf,
    positionCount: positions.length,
    openPositionCount: positions.filter(isOpenPosition).length,
    currencies: concentration.currencies.length > 0 ? concentration.currencies : cash.currencies,
    concentration,
    cash,
    health,
    capacity,
    wip: facts.wip,
    marginRealisation: facts.margin,
    placeholders,
    unresolved: bookUnresolved({
      migrated: facts.migrated,
      deliveryMigrated: facts.deliveryMigrated,
      outcomeMigrated: facts.outcomeMigrated,
      truncated: facts.truncated,
      rowsRead: facts.rowsRead,
      placeholders,
      capacity,
      outcomeRejected: facts.outcomeRejected,
      cash,
    }),
  };
}

/**
 * The shape a read returns while 0047 is pending.
 *
 * Composed by the REAL engines over zero positions rather than hand-written, which
 * is not tidiness: a hand-written empty body is a second declaration of the
 * response and it drifts. Every collection is genuinely empty, `migrated` is false,
 * and `unresolved[0]` says the book is unreadable rather than empty — so the UI
 * renders its banner instead of its error state, and nobody reads a zero as a fact
 * about the business.
 */
export function emptyBook(asOf: string, basis: ConcentrationBasis = 'margin'): BookResponse {
  return composeBook({
    positions: [],
    asOf,
    basis,
    migrated: false,
    deliveryMigrated: false,
    outcomeMigrated: false,
    truncated: false,
    rowsRead: 0,
    wip: null,
    margin: null,
    outcomeRejected: 0,
  });
}

/* ── The read ──────────────────────────────────────────────────────────────── */

export interface ReadBookOptions {
  basis?: ConcentrationBasis;
  asOf?: string;
}

/**
 * The whole book, from three independently probed migrations.
 *
 * Three probes, not one, and never a shared boolean: 0047 (the book itself), 0049
 * (the coordination ceiling) and `gps_outcome` (realised margin) are applied by hand
 * at different times, so a single flag would either hide two thirds of the book or
 * throw on a table that has not landed. Each absence becomes a null plus a named
 * `unresolved` entry, and nothing here catches an error to hide it: a genuinely
 * broken query must still reach the route's 500, or the book would report a healthy
 * empty portfolio during an outage.
 */
export interface BookRead {
  book: BookResponse;
  /**
   * The rows the response was composed FROM, so a drill-down opens the same
   * instant it was clicked on. Empty while 0047 is pending.
   */
  positions: readonly BookPosition[];
}

export async function readBook(pool: Pool, opts: ReadBookOptions = {}): Promise<BookResponse> {
  return (await readBookAndPositions(pool, opts)).book;
}

export async function readBookAndPositions(
  pool: Pool,
  opts: ReadBookOptions = {},
): Promise<BookRead> {
  const asOf = opts.asOf ?? new Date().toISOString();
  const basis = opts.basis ?? 'margin';

  if (!(await isMigrated(pool))) return { book: emptyBook(asOf, basis), positions: [] };

  const load = await loadPositions(pool);

  // The coordination ceiling comes from `deskWip`, which derives it from live
  // milestones through the same composer the delivery desk uses (`deliveryDesk.ts:811`).
  // Deriving it a second time here is how the WIP panel and the book come to
  // disagree about how many hours are committed.
  const deliveryMigrated = await isDeliveryMigrated(pool);
  const wip = deliveryMigrated ? (await deskWip(pool, asOf)).wip.load : null;

  // 6.4 — the first call `marginRealisation()` has had from a read path that a
  // human can reach. Null until `gps_outcome` exists; see the unresolved entry.
  const outcomeMigrated = await isOutcomeMigrated(pool);
  const outcomes = outcomeMigrated ? await listOutcomeRecords(pool) : null;
  const margin = outcomes ? marginRealisation(outcomes.records) : null;

  return {
    positions: load.positions,
    book: composeBook({
      positions: load.positions,
      asOf,
      basis,
      migrated: true,
      deliveryMigrated,
      outcomeMigrated,
      truncated: load.truncated,
      rowsRead: load.rowsRead,
      wip,
      margin,
      outcomeRejected: outcomes?.rejected ?? 0,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  D1 — EVERY NUMBER OPENS. THE FIGURE CATALOGUE AND THE DRILL-DOWN.
 * ══════════════════════════════════════════════════════════════════════════════
 *  "Any figure must answer 'what produced this' in one interaction: the rows, the
 *  formula, the source grade, the timestamp. A number that cannot be opened is
 *  decoration." (`GPS_100X_PLAN.md` §1, D1.)
 *
 *  The catalogue below is a MECHANISM, not documentation. `answers` lists the
 *  dotted paths into `BookResponse` that each drill-down accounts for, and
 *  `__tests__/book.test.ts` resolves every one of them against a composed response
 *  and fails if a path no longer exists OR if a top-level field of `BookResponse`
 *  is claimed by no figure. So a future slice that adds a number to the shared
 *  response without a way to open it fails the build rather than shipping a
 *  decoration (D8 — no claim without a mechanism).
 *
 *  WHY THIS IS ONE ROUTE AND NOT THIRTEEN. Each figure is the same question asked
 *  of a different slice of the same loaded positions, at the same instant, under
 *  the same basis. Thirteen handlers would be thirteen chances for one of them to
 *  load a different set of rows than the number the operator clicked.
 */

export type BookFigureId =
  | 'positions'
  | 'concentration.axis'
  | 'concentration.holder'
  | 'concentration.currency'
  | 'cash.stage'
  | 'cash.aging'
  | 'cash.aged'
  | 'health.score'
  | 'constraint.check'
  | 'capacity.offer'
  | 'wip'
  | 'margin.realisation'
  | 'gaps';

export type BookDrillParam =
  | 'axis' | 'currency' | 'holder' | 'stage' | 'leg' | 'bracket' | 'code' | 'offerKey';

export interface BookFigure {
  id: BookFigureId;
  label: string;
  /** What opening it answers, in one sentence, for a keyboard-driven menu. */
  question: string;
  /** Dotted paths into `BookResponse`. `[]` = every array element, `{}` = every key. */
  answers: readonly string[];
  /** The arithmetic, in words, reconstructable from the rows by addition. */
  formula: string;
  /** The table, column or engine function the rows come from. */
  source: string;
  requires: readonly BookDrillParam[];
  accepts: readonly BookDrillParam[];
}

export const BOOK_FIGURES: readonly BookFigure[] = [
  {
    id: 'positions',
    label: 'Positions',
    question: 'Which engagements make up the book at all?',
    answers: ['positionCount', 'openPositionCount', 'currencies', 'concentration.positionCount', 'concentration.scope', 'cash.positionCount', 'cash.currencies', 'concentration.currencies', 'concentration.basis', 'concentration.crossCurrencyTotalCents', 'cash.crossCurrencyTotalCents', 'cash.asOf', 'concentration.asOf', 'cash.notes', 'concentration.notes', 'cash.receivableAnchorAvailable', 'cash.receivableAgingRefusal'],
    formula: 'One row per gps_engagement joined to its gps_client. Open = not collected/closed_lost/cancelled.',
    source: 'gps_engagement ⨝ gps_client',
    requires: [],
    accepts: ['currency', 'offerKey'],
  },
  {
    id: 'concentration.axis',
    label: 'Concentration on one axis',
    question: 'Who is behind this index, and what happens if the largest one leaves?',
    answers: ['concentration.perCurrency[].byAxis{}', 'concentration.perCurrency[].currency', 'concentration.perCurrency[].positionCount', 'concentration.perCurrency[].totalValueCents'],
    formula: 'HHI = Σ(holder share)² over attributed positive holders, share = holder value ÷ attributed positive total. effectiveHolders = 1 ÷ HHI.',
    source: 'bookConcentration() over open positions in one currency',
    requires: ['axis', 'currency'],
    accepts: [],
  },
  {
    id: 'concentration.holder',
    label: 'One holder on one axis',
    question: 'Which engagements sit behind this client, offer, partner or jurisdiction?',
    answers: ['concentration.perCurrency[].byAxis{}.holders[]', 'concentration.perCurrency[].byAxis{}.dominant', 'concentration.perCurrency[].byAxis{}.top3[]', 'concentration.perCurrency[].byAxis{}.excludedNonPositive[]'],
    formula: 'Positions whose key on this axis equals the holder. Contribution = margin (price − vendor cost) or price, per the basis.',
    source: 'gps_engagement ⨝ gps_client, grouped by the axis key',
    requires: ['axis', 'currency', 'holder'],
    accepts: [],
  },
  {
    id: 'concentration.currency',
    label: 'Currency mix',
    question: 'How many currencies is the book spread across, and how uneven is it?',
    answers: ['concentration.currencyMix'],
    formula: 'HHI over POSITION COUNTS, not value — values in different currencies cannot be added, so a value-weighted mix would be meaningless.',
    source: 'gps_engagement.currency',
    requires: [],
    accepts: [],
  },
  {
    id: 'cash.stage',
    label: 'Funnel stage',
    question: 'Which engagements have reached this stage, and which fell out before it?',
    answers: ['cash.perCurrency[].stages[]', 'cash.perCurrency[].conversions[]', 'cash.perCurrency[].collectedCents', 'cash.perCurrency[].openCents', 'cash.perCurrency[].currency'],
    formula: 'CUMULATIVE: a collected engagement has also been booked, accepted and invoiced. Rate = to ÷ from, suppressed below n=8.',
    source: 'gps_engagement.status, accepted_at, deposit_paid_at',
    requires: ['currency', 'stage'],
    accepts: [],
  },
  {
    id: 'cash.aging',
    label: 'Aging',
    question: 'What is late, by how many days, and for how much?',
    answers: ['cash.perCurrency[].depositAging', 'cash.perCurrency[].receivableAging', 'cash.perCurrency[].awaitingDeposit', 'cash.perCurrency[].awaitingCollection', 'cash.awaitingDepositCount', 'cash.awaitingCollectionCount'],
    formula: 'Deposit leg: accepted_at IS NOT NULL AND deposit_paid_at IS NULL AND status not terminal, aged from accepted_at. Receivable leg: status delivered or invoiced, aged from the invoice date.',
    source: 'gps_engagement.accepted_at / deposit_required_cents',
    requires: ['currency', 'leg'],
    accepts: ['bracket'],
  },
  {
    id: 'cash.aged',
    label: 'Aged unpaid deposits',
    question: 'Whose deposit is old enough to be blocking delivery, not just late?',
    answers: ['cash.agedDepositCount', 'cash.oldestUnpaidDeposit'],
    formula: `Awaiting-deposit positions with age strictly greater than ${AGED_DEPOSIT_ALARM_DAYS} days, oldest first.`,
    source: 'gps_engagement.accepted_at',
    requires: [],
    accepts: ['currency'],
  },
  {
    id: 'health.score',
    label: 'Book health',
    question: 'What did each point of this score, and each end of its band, come from?',
    answers: ['health.score', 'health.scoreBand', 'health.grade', 'health.gradeLabel', 'health.drivers[]', 'health.confidence', 'health.confidenceLabel', 'health.confidenceBasis', 'health.statements', 'health.headline', 'health.collectionOutlook', 'health.collectionOutlookRefusal'],
    formula: 'Starts at 100 and charges signed deductions. The drivers sum to the score by addition — that is the whole of D1 in one property.',
    source: 'bookHealth() over concentration + cash + the binding constraint',
    requires: [],
    accepts: [],
  },
  {
    id: 'constraint.check',
    label: 'Binding constraint',
    question: 'What is actually limiting the book, and what did the other candidates say?',
    answers: ['health.binding'],
    formula: 'Six candidates tested in a fixed precedence; the first that binds wins. A check whose input was null is marked unevaluable and CANNOT bind.',
    source: 'bindingConstraint() over bench headroom, WIP load, cash and the catalogue',
    requires: [],
    accepts: ['code'],
  },
  {
    id: 'capacity.offer',
    label: 'Bench capacity per offer',
    question: 'How many more of this offer can the bench take, and why not more?',
    answers: ['capacity'],
    formula: 'Σ over capable, available partners of max(0, maxConcurrent − activeEngagements). NOT the sum of the per-offer figures: one partner capable of three offers contributes their spare slot to all three.',
    source: 'benchHeadroom() over PARTNER_BENCH and the occupying engagements',
    requires: [],
    accepts: ['offerKey'],
  },
  {
    id: 'wip',
    label: 'Coordination load',
    question: 'What is consuming his own hours right now?',
    answers: ['wip'],
    formula: 'Σ coordination hours per week over engagements in accepted / deposit_paid / in_delivery, against his weekly ceiling.',
    source: 'wipLoad() via deskWip() over live milestones',
    requires: [],
    accepts: [],
  },
  {
    id: 'margin.realisation',
    label: 'Quoted versus realised margin',
    question: 'Where does the margin actually go between the quote and the invoice?',
    answers: ['marginRealisation'],
    formula: 'Per offer and per partner: mean(realised margin − quoted margin), split into price slippage and cost overrun, with the dispersion.',
    source: `marginRealisation() over gps_outcome (${OUTCOME_MIGRATION})`,
    requires: [],
    accepts: ['offerKey'],
  },
  {
    id: 'gaps',
    label: 'The uncomfortable list',
    question: 'Which positions have something wrong with them that I can fix today?',
    answers: ['unresolved[]', 'placeholders'],
    formula: 'One row per position with a named defect: live and unpriced, quoted below vendor cost, deposit banked with no acceptance, deposit older than the alarm, or an offer with no partner to deliver it.',
    source: 'gps_engagement, tested row by row',
    requires: [],
    accepts: ['currency'],
  },
];

const FIGURE_IDS: readonly BookFigureId[] = BOOK_FIGURES.map((f) => f.id);

/** Lookup, or null — an unknown id is a 400 with the valid list, never a default. */
export function getFigure(id: string): BookFigure | null {
  return BOOK_FIGURES.find((f) => f.id === id) ?? null;
}

/* ── Request validation. Runs BEFORE the migration probe, in the route. ─────── */

export interface BookDrillRequest {
  figure: BookFigureId;
  basis: ConcentrationBasis;
  axis?: ValueAxis;
  currency?: string;
  holder?: string;
  stage?: FunnelStage;
  leg?: 'deposit' | 'receivable';
  bracket?: AgingBracketKey;
  code?: string;
  offerKey?: OfferKey;
}

export type DrillValidation =
  | { ok: true; request: BookDrillRequest }
  | { ok: false; error: string };

const LEGS = ['deposit', 'receivable'] as const;
const BRACKET_KEYS: readonly AgingBracketKey[] = ['d0_7', 'd8_30', 'd31_60', 'd61_90', 'd90_plus'];

/**
 * Validate a drill request against its figure's declared parameters.
 *
 * A malformed request is malformed in every environment, so this runs before the
 * route probes for the migration — answering 503 for an unknown figure would tell a
 * caller to retry something that can never succeed.
 *
 * Every refusal NAMES THE VALID VALUES. "axis is required" sends the caller to the
 * source; "axis is required for concentration.axis — one of client, offer, partner,
 * jurisdiction" ends the question (D2).
 */
export function validateDrill(query: Readonly<Record<string, string | undefined>>): DrillValidation {
  const id = (query.figure ?? '').trim();
  const figure = getFigure(id);
  if (!figure) {
    return {
      ok: false,
      error: `figure must be one of ${FIGURE_IDS.join(', ')}${id ? ` (received '${id.slice(0, 40)}')` : ''}`,
    };
  }

  const basisRaw = (query.basis ?? 'margin').trim();
  if (basisRaw !== 'margin' && basisRaw !== 'price') {
    return { ok: false, error: "basis must be 'margin' or 'price'" };
  }
  const req: BookDrillRequest = { figure: figure.id, basis: basisRaw };
  const allowed = new Set<BookDrillParam>([...figure.requires, ...figure.accepts]);

  const supplied = (p: BookDrillParam): string | undefined => {
    const v = query[p];
    if (v == null) return undefined;
    const t = v.trim();
    return t === '' ? undefined : t;
  };

  for (const p of ['axis', 'currency', 'holder', 'stage', 'leg', 'bracket', 'code', 'offerKey'] as const) {
    const value = supplied(p);
    if (value === undefined) continue;
    if (!allowed.has(p)) {
      // Silently ignoring an unused parameter is how an operator comes to believe
      // a filter was applied. Refuse, and say which parameters this figure takes.
      return {
        ok: false,
        error:
          `${figure.id} does not take '${p}' — it takes ${[...allowed].join(', ') || 'no parameters'}`,
      };
    }
    switch (p) {
      case 'axis':
        if (!VALUE_AXES.includes(value as ValueAxis)) {
          return { ok: false, error: `axis must be one of ${VALUE_AXES.join(', ')}` };
        }
        req.axis = value as ValueAxis;
        break;
      case 'stage':
        if (!FUNNEL_STAGES.includes(value as FunnelStage)) {
          return { ok: false, error: `stage must be one of ${FUNNEL_STAGES.join(', ')}` };
        }
        req.stage = value as FunnelStage;
        break;
      case 'leg':
        if (!LEGS.includes(value as (typeof LEGS)[number])) {
          return { ok: false, error: `leg must be one of ${LEGS.join(', ')}` };
        }
        req.leg = value as 'deposit' | 'receivable';
        break;
      case 'bracket':
        if (!BRACKET_KEYS.includes(value as AgingBracketKey)) {
          return { ok: false, error: `bracket must be one of ${BRACKET_KEYS.join(', ')}` };
        }
        req.bracket = value as AgingBracketKey;
        break;
      case 'offerKey':
        if (!OFFER_KEYS.includes(value as OfferKey)) {
          return { ok: false, error: `offerKey must be one of ${OFFER_KEYS.join(', ')}` };
        }
        req.offerKey = value as OfferKey;
        break;
      case 'currency':
        // Uppercased, never validated against a list: `currency` is free text in
        // 0047 and inventing an allow-list here would refuse a real engagement.
        if (!/^[A-Za-z]{3,8}$/.test(value)) {
          return { ok: false, error: 'currency must be an alphabetic ISO-4217-like code' };
        }
        req.currency = value.toUpperCase();
        break;
      case 'holder':
        req.holder = value.slice(0, 200);
        break;
      case 'code':
        req.code = value.slice(0, 60);
        break;
    }
  }

  for (const p of figure.requires as readonly BookDrillParam[]) {
    if (req[p] === undefined) {
      const hint =
        p === 'axis' ? ` — one of ${VALUE_AXES.join(', ')}`
        : p === 'stage' ? ` — one of ${FUNNEL_STAGES.join(', ')}`
        : p === 'leg' ? ` — one of ${LEGS.join(', ')}`
        : p === 'currency' ? ' — the currency the figure was read in, e.g. USD'
        : p === 'holder' ? ' — the holder key from the axis response, not its label'
        : '';
      return { ok: false, error: `${p} is required for ${figure.id}${hint}` };
    }
  }
  return { ok: true, request: req };
}

/* ── The drill-down ────────────────────────────────────────────────────────── */

/**
 * One row behind a figure, with the reason it is in the list.
 *
 * `because` is not decoration: a list of engagements is not an explanation, and the
 * question the operator asked was "what produced this number". Every row therefore
 * states its own membership — "accepted 41 days ago, deposit unpaid" — so the
 * printed page argues for itself without the screen it came from (D7).
 *
 * Money is per row in the row's own currency. `contributionCents` is the row's
 * contribution TO THE FIGURE BEING OPENED, which is not always its price: on a
 * margin-basis axis it is margin, on the deposit leg it is the deposit outstanding.
 */
export interface BookDrillRow {
  engagementId: string;
  clientId: string;
  clientName: string | null;
  offerKey: OfferKey;
  status: EngagementStatus;
  statusLabel: string;
  currency: string;
  priceCents: number;
  vendorCostCents: number;
  marginCents: number;
  contributionCents: number | null;
  /** Share of the figure's total, 1 dp. Null when the figure is not a share. */
  sharePct: number | null;
  /** Days that made this row late or old. Null when the figure does not age. */
  ageDays: number | null;
  jurisdiction: string | null;
  /** Always null today — there is no partner column. See the unresolved list. */
  partner: string | null;
  acceptedAt: string | null;
  depositPaidAt: string | null;
  createdAt: string;
  because: string;
}

/**
 * The answer to "what produced this number".
 *
 * THIS IS THE ONE RESPONSE SHAPE THIS COMPARTMENT DECLARES OUTSIDE
 * `packages/shared`, and it is declared here because the shared layer does not
 * declare it and this pass does not own the shared barrels. If a web surface
 * consumes it, the wiring pass MUST move this interface into
 * `packages/shared/src/gps/` and have both sides import that one declaration. It
 * must NOT be hand-copied into `apps/web/src/lib/api/` — a hand-copied response
 * interface in that directory is what took production down (`lib/api/gps.ts:60`).
 */
export interface BookDrill {
  figure: BookFigureId;
  label: string;
  question: string;
  /**
   * Carried from the response the figure was opened from. Without it, an empty row
   * list during the deploy-before-migration window reads as "nothing matched" —
   * which is a different fact from "the table does not exist yet", and the wrong one
   * to act on.
   */
  migrated: boolean;
  /** The parameters actually applied, echoed so a printed page states its own scope. */
  scope: Readonly<Record<string, string>>;
  /** The instant the figure was computed. A number without a time is not traceable. */
  asOf: string;
  basis: ConcentrationBasis;
  formula: string;
  source: string;
  /** Admiralty grade of the source (`provenance.ts`), so the row's weight is stated. */
  sourceGrade: string;
  sourceGradeLabel: string;
  rowCount: number;
  rows: readonly BookDrillRow[];
  /** Σ `contributionCents`. Null when the figure is not money, or spans currencies. */
  totalCents: number | null;
  /** The currency `totalCents` is in. Null whenever `totalCents` is null. */
  currency: string | null;
  /**
   * Signed score points, ONLY for `health.score`. Deliberately empty elsewhere:
   * `Driver.points` are points on a 0–100 composite, and putting cents or slots in
   * that field is how a capacity number ends up rendered as a score
   * (`partners.ts:339` refuses the same reuse for the same reason).
   */
  drivers: readonly Driver[];
  notes: readonly string[];
  /** Set when the figure cannot be opened, with the reason. Never a silent empty list. */
  refusal: string | null;
}

/**
 * Rows read from our own transactional tables, written by a named operator through
 * a validating route: completely reliable, and confirmed by the row itself.
 */
const GRADE_RECORDED = {
  code: admiraltyCode('A', 1),
  label: `${RELIABILITY_LABEL.A} · ${CREDIBILITY_LABEL[1]}`,
};

/**
 * A figure whose value depends on a PLACEHOLDER — coordination hours, an
 * unsupplied vendor cost, a price band. Graded F6 rather than a flattering C3: the
 * number is not weak evidence, it is not evidence at all, and the Admiralty scale
 * has a code for exactly that.
 */
const GRADE_PLACEHOLDER = {
  code: admiraltyCode('F', 6),
  label: `${RELIABILITY_LABEL.F} · ${CREDIBILITY_LABEL[6]}`,
};

/** Share as a percentage to 1 dp. Null — never 0 — when there is nothing to share. */
function share(part: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function drillRow(
  p: BookPosition,
  spec: {
    contributionCents?: number | null;
    sharePct?: number | null;
    ageDays?: number | null;
    because: string;
  },
): BookDrillRow {
  return {
    engagementId: p.engagementId,
    clientId: p.clientId,
    clientName: p.clientName,
    offerKey: p.offerKey,
    status: p.status,
    statusLabel: ENGAGEMENT_STATUS_LABELS[p.status],
    currency: p.currency,
    priceCents: p.priceCents,
    vendorCostCents: p.vendorCostCents,
    marginCents: marginCents(p.priceCents, p.vendorCostCents),
    contributionCents: spec.contributionCents ?? null,
    sharePct: spec.sharePct ?? null,
    ageDays: spec.ageDays ?? null,
    jurisdiction: p.jurisdiction,
    partner: p.partner,
    acceptedAt: p.acceptedAt,
    depositPaidAt: p.depositPaidAt,
    createdAt: p.createdAt,
    because: spec.because,
  };
}

/**
 * The grouping key on one axis. MIRRORS `axisKey` (`book.ts:412`), which is module
 * private there and correctly so — it is not a contract, it is an implementation.
 *
 * A mirror is a drift risk, so it is not left to discipline: every holder drill-down
 * RECONCILES its row count against the holder count the engine reported, and says so
 * loudly in `notes` when the two disagree. `__tests__/book.test.ts` asserts no
 * reconciliation note appears over a fixture covering every axis and every status,
 * so a divergence fails the build rather than quietly listing the wrong rows.
 */
function drillAxisKey(p: BookPosition, axis: ValueAxis): { key: string; label: string } | null {
  switch (axis) {
    case 'client':
      return { key: p.clientId, label: p.clientName?.trim() || p.clientId };
    case 'offer':
      return { key: p.offerKey, label: p.offerKey };
    case 'partner': {
      const raw = p.partner?.trim();
      return raw ? { key: raw, label: raw } : null;
    }
    case 'jurisdiction': {
      const raw = p.jurisdiction?.trim();
      if (!raw) return null;
      return { key: raw.toLowerCase().replace(/\s+/g, ' '), label: raw };
    }
  }
}

/** Which statuses have reached a funnel stage. Mirrors `STAGE_STATUSES`, reconciled below. */
const DRILL_STAGE_STATUSES: Record<FunnelStage, readonly EngagementStatus[]> = {
  booked: ['proposed', 'accepted', 'deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected'],
  accepted: ['accepted', 'deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected'],
  deposit: ['deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected'],
  invoiced: ['invoiced', 'collected'],
  collected: ['collected'],
};

function drillReachedStage(p: BookPosition, stage: FunnelStage): boolean {
  if (stage === 'accepted') {
    return p.acceptedAt != null || DRILL_STAGE_STATUSES.accepted.includes(p.status);
  }
  if (stage === 'deposit') {
    return p.depositPaidAt != null || DRILL_STAGE_STATUSES.deposit.includes(p.status);
  }
  return DRILL_STAGE_STATUSES[stage].includes(p.status);
}

/**
 * The self-check that keeps every mirrored predicate honest.
 *
 * A drill-down that lists a different set of rows than the number it claims to open
 * is worse than no drill-down: it is a false claim with evidence attached. So the
 * row count is compared against the engine's own count and the disagreement is
 * REPORTED, in the response, in words an operator can act on (D8).
 */
function reconcile(rowCount: number, engineCount: number | null, what: string): string[] {
  if (engineCount == null || rowCount === engineCount) return [];
  return [
    `DRIFT — this drill-down found ${rowCount} row${rowCount === 1 ? '' : 's'} for ${what} while the ` +
      `engine counted ${engineCount}. The membership rule in apps/api/src/gps/book.ts has diverged ` +
      'from the one in packages/shared/src/gps/book.ts. Trust the engine\'s figure; treat these rows ' +
      'as incomplete and report it.',
  ];
}

/**
 * Open one figure: the rows, the formula, the source grade and the timestamp.
 *
 * PURE over the composed response and the positions it was composed from, so the
 * route can serve a drill-down from the same instant as the number that was clicked
 * and a test can exercise all thirteen figures with no database at all.
 *
 * A figure that CANNOT be opened returns a `refusal` sentence and an empty row list
 * — never an empty list on its own. "No rows" and "this cannot be answered on this
 * schema" are opposite facts and a blank table reports the wrong one (D2).
 */
export function drillBook(
  book: BookResponse,
  positions: readonly BookPosition[],
  req: BookDrillRequest,
): BookDrill {
  const figure = getFigure(req.figure);
  if (!figure) {
    // Unreachable through the route (`validateDrill` runs first) and handled anyway:
    // a thrown error here would become a 500 on a request that was merely wrong.
    return {
      figure: req.figure, label: req.figure, question: '', migrated: book.migrated,
      scope: {}, asOf: book.asOf,
      basis: req.basis, formula: '', source: '', sourceGrade: GRADE_PLACEHOLDER.code,
      sourceGradeLabel: GRADE_PLACEHOLDER.label, rowCount: 0, rows: [], totalCents: null,
      currency: null, drivers: [], notes: [],
      refusal: `no figure named '${req.figure}'`,
    };
  }

  const scope: Record<string, string> = {};
  for (const [k, v] of Object.entries(req)) if (k !== 'figure' && v != null) scope[k] = String(v);

  const asOf = book.asOf;
  const sumOf = (rows: readonly BookDrillRow[]): number =>
    rows.reduce((a, r) => a + (r.contributionCents ?? 0), 0);
  /** One currency across the rows, or null — a total spanning two is never computed. */
  const oneCurrency = (rows: readonly BookDrillRow[]): string | null => {
    const set = new Set(rows.map((r) => r.currency));
    return set.size === 1 ? [...set][0] : null;
  };

  const envelope = (over: {
    rows: readonly BookDrillRow[];
    notes?: readonly string[];
    drivers?: readonly Driver[];
    refusal?: string | null;
    grade?: { code: string; label: string };
    /** Set false where a total would pool currencies or mean nothing. */
    total?: boolean;
  }): BookDrill => {
    const grade = over.grade ?? GRADE_RECORDED;
    const ccy = oneCurrency(over.rows);
    const wantTotal = over.total !== false && ccy != null;
    return {
      figure: figure.id,
      label: figure.label,
      question: figure.question,
      migrated: book.migrated,
      scope,
      asOf,
      basis: req.basis,
      formula: figure.formula,
      source: figure.source,
      sourceGrade: grade.code,
      sourceGradeLabel: grade.label,
      rowCount: over.rows.length,
      rows: over.rows,
      totalCents: wantTotal ? sumOf(over.rows) : null,
      currency: wantTotal ? ccy : null,
      drivers: over.drivers ?? [],
      notes: over.notes ?? [],
      refusal: over.refusal ?? null,
    };
  };

  const inCurrency = (p: BookPosition): boolean =>
    req.currency == null || p.currency === req.currency;
  const considered = book.concentration.scope === 'all' ? positions : positions.filter(isOpenPosition);
  const byValue = (a: BookDrillRow, b: BookDrillRow): number =>
    (b.contributionCents ?? 0) - (a.contributionCents ?? 0);

  switch (figure.id) {
    /* ── The book itself ─────────────────────────────────────────────────────── */
    case 'positions': {
      const rows = positions
        .filter((p) => inCurrency(p) && (req.offerKey == null || p.offerKey === req.offerKey))
        .map((p) =>
          drillRow(p, {
            contributionCents: positionValueCents(p, req.basis),
            because: `${ENGAGEMENT_STATUS_LABELS[p.status]} — ${
              isOpenPosition(p) ? 'in play' : 'terminal, excluded from concentration'
            }`,
          }),
        )
        .sort(byValue);
      const unfiltered = req.currency == null && req.offerKey == null;
      return envelope({
        rows,
        notes: [
          `${book.openPositionCount} of ${book.positionCount} positions are open. Terminal positions are ` +
            'excluded from concentration and INCLUDED in cash conversion, because `collected` is both a ' +
            'terminal status and the last funnel stage.',
          ...(unfiltered ? reconcile(rows.length, book.positionCount, 'the whole book') : []),
        ],
      });
    }

    /* ── 6.1 Concentration ───────────────────────────────────────────────────── */
    case 'concentration.axis':
    case 'concentration.holder': {
      const ccy = book.concentration.perCurrency.find((c) => c.currency === req.currency);
      if (!ccy) {
        return envelope({
          rows: [],
          refusal:
            `No positions are denominated in ${req.currency}. Currencies present: ` +
            `${book.concentration.currencies.join(', ') || 'none'}. Concentration is measured inside a ` +
            'currency and never across them — there is no FX source in this repo.',
        });
      }
      const axis = ccy.byAxis[req.axis as ValueAxis];
      const rowsInCcy = considered.filter((p) => p.currency === ccy.currency);

      if (figure.id === 'concentration.axis') {
        const rows = rowsInCcy
          .map((p) => {
            const k = drillAxisKey(p, req.axis as ValueAxis);
            const value = positionValueCents(p, req.basis);
            return drillRow(p, {
              contributionCents: value,
              sharePct: k ? share(Math.max(0, value), axis.totalPositiveCents) : null,
              because: k
                ? `${AXIS_LABEL[req.axis as ValueAxis]}: ${k.label}`
                : `No ${AXIS_LABEL[req.axis as ValueAxis].toLowerCase()} recorded — bracketed by the band, not dropped`,
            });
          })
          .sort(byValue);
        return envelope({
          rows,
          notes: [
            axis.headline,
            ...axis.notes,
            ...(axis.band ? [axis.band.basis] : []),
            `Index computed over ${axis.holderCount} holder${axis.holderCount === 1 ? '' : 's'} at ` +
              `${axis.coveragePct ?? 0}% attribution` +
              (axis.excludedNonPositive.length > 0
                ? `; ${axis.excludedNonPositive.length} holder(s) excluded at ≤ 0 value: ` +
                  `${axis.excludedNonPositive.map((h) => h.label).join(', ')} — a Herfindahl index is not ` +
                  'defined over negative shares, so a loss-making holder would otherwise INCREASE the ' +
                  'measured diversification of the book.'
                : '.'),
            ...reconcile(rows.length, ccy.positionCount, `${req.currency} positions`),
          ],
        });
      }

      const wanted = req.holder as string;
      const unattributedWanted = wanted === UNATTRIBUTED || wanted === '(none)';
      const rows = rowsInCcy
        .filter((p) => {
          const k = drillAxisKey(p, req.axis as ValueAxis);
          return unattributedWanted ? k == null : k?.key === wanted;
        })
        .map((p) => {
          const value = positionValueCents(p, req.basis);
          return drillRow(p, {
            contributionCents: value,
            sharePct: share(Math.max(0, value), axis.totalPositiveCents),
            because: `Held by ${unattributedWanted ? 'nobody recorded' : wanted}`,
          });
        })
        .sort(byValue);
      const holder =
        axis.holders.find((h) => h.key === wanted) ??
        axis.excludedNonPositive.find((h) => h.key === wanted) ??
        null;
      return envelope({
        rows,
        notes: [
          holder
            ? `${holder.label}: ${holder.positions} position${holder.positions === 1 ? '' : 's'}, ` +
              `${holder.valueCents} cents of ${req.basis} in ${ccy.currency}` +
              ('sharePct' in holder ? ` (${holder.sharePct}% of the attributed total)` : ' — excluded from the index at ≤ 0 value')
            : unattributedWanted
              ? `${axis.unattributedPositions} position(s) carry no ${AXIS_LABEL[req.axis as ValueAxis].toLowerCase()} at all.`
              : `No holder keyed '${wanted.slice(0, 60)}' appears in the ${AXIS_LABEL[req.axis as ValueAxis].toLowerCase()} axis for ${ccy.currency}.`,
          ...reconcile(
            rows.length,
            holder ? holder.positions : unattributedWanted ? axis.unattributedPositions : null,
            `holder '${wanted.slice(0, 40)}'`,
          ),
        ],
        refusal:
          rows.length === 0 && !holder && !unattributedWanted
            ? `Nothing is held by '${wanted.slice(0, 60)}' on the ${AXIS_LABEL[req.axis as ValueAxis].toLowerCase()} axis in ${ccy.currency}. Holder keys come from the axis response and are keys, not labels — a client is keyed by its uuid.`
            : null,
      });
    }

    case 'concentration.currency': {
      const rows = considered
        .map((p) =>
          drillRow(p, {
            contributionCents: positionValueCents(p, req.basis),
            because: `Denominated in ${p.currency}`,
          }),
        )
        .sort((a, b) => a.currency.localeCompare(b.currency) || byValue(a, b));
      return envelope({
        rows,
        total: false,
        notes: [
          book.concentration.currencyMix.headline,
          'The mix is a Herfindahl over POSITION COUNTS, and it says so in its own `basis` field: ' +
            'amounts in different currencies cannot be added, so a value-weighted mix would be a number ' +
            'true in no currency. No cross-currency total is computed anywhere in this response.',
        ],
      });
    }

    /* ── 6.3 Cash conversion ─────────────────────────────────────────────────── */
    case 'cash.stage': {
      const funnel = book.cash.perCurrency.find((c) => c.currency === req.currency);
      if (!funnel) {
        return envelope({
          rows: [],
          refusal:
            `No positions are denominated in ${req.currency}. Currencies present: ` +
            `${book.cash.currencies.join(', ') || 'none'}.`,
        });
      }
      const stage = req.stage as FunnelStage;
      const counted = funnel.stages.find((s) => s.stage === stage) ?? null;
      const rows = positions
        .filter((p) => p.currency === funnel.currency && drillReachedStage(p, stage))
        .map((p) =>
          drillRow(p, {
            contributionCents: p.priceCents,
            sharePct: share(p.priceCents, counted?.valueCents ?? 0),
            because: `${ENGAGEMENT_STATUS_LABELS[p.status]} — has reached ${FUNNEL_STAGE_LABELS[stage]}`,
          }),
        )
        .sort(byValue);
      const conversion = funnel.conversions.find((c) => c.from === stage);
      return envelope({
        rows,
        notes: [
          `The funnel is CUMULATIVE: a collected engagement has also been booked, accepted and invoiced. ` +
            'A partition would report zero at every earlier stage and make the ratios meaningless.',
          ...(conversion
            ? [
                conversion.ratePct == null
                  ? (conversion.suppressedReason ?? 'Rate suppressed.')
                  : `${conversion.toCount} of ${conversion.fromCount} went on to ` +
                    `${FUNNEL_STAGE_LABELS[conversion.to].toLowerCase()} (${conversion.ratePct}%).`,
              ]
            : []),
          ...reconcile(rows.length, counted?.count ?? null, `${FUNNEL_STAGE_LABELS[stage]} in ${funnel.currency}`),
        ],
      });
    }

    case 'cash.aging': {
      const funnel = book.cash.perCurrency.find((c) => c.currency === req.currency);
      if (!funnel) {
        return envelope({
          rows: [],
          refusal: `No positions are denominated in ${req.currency}. Currencies present: ${book.cash.currencies.join(', ') || 'none'}.`,
        });
      }
      const rowsIn = positions.filter((p) => p.currency === funnel.currency);

      if (req.leg === 'deposit') {
        const profile = funnel.depositAging;
        const all = rowsIn
          .filter((p) => p.acceptedAt != null && p.depositPaidAt == null && !isTerminalEngagementStatus(p.status))
          .map((p) => {
            const days = ageInDays(p.acceptedAt, asOf);
            const key = days == null ? null : bracketForAgeDays(days);
            return {
              key,
              row: drillRow(p, {
                contributionCents: p.depositRequiredCents,
                ageDays: days,
                sharePct: share(p.depositRequiredCents, funnel.awaitingDeposit.amountCents),
                because:
                  days == null
                    ? 'Accepted, deposit unpaid — and UNAGEABLE: accepted_at is missing or dated in the future, which is a data fault, not a fresh row'
                    : `Accepted ${days}d ago, deposit of ${p.depositRequiredCents} cents unpaid`,
              }),
            };
          });
        const rows = (req.bracket ? all.filter((r) => r.key === req.bracket) : all)
          .map((r) => r.row)
          .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));
        const bracketDef = req.bracket ? profile.brackets.find((b) => b.key === req.bracket) : null;
        return envelope({
          rows,
          notes: [
            `${profile.what}, anchored on ${profile.anchor}. Oldest ${profile.oldestDays ?? 0}d.`,
            ...(profile.unagedReason ? [profile.unagedReason] : []),
            'A deposit is what commits a partner, so an unpaid one is delivery blocked, not merely revenue late.',
            ...reconcile(
              rows.length,
              req.bracket ? (bracketDef?.count ?? null) : funnel.awaitingDeposit.count,
              req.bracket ? `bracket ${req.bracket}` : `the ${funnel.currency} deposit leg`,
            ),
          ],
        });
      }

      const profile = funnel.receivableAging;
      const rows = rowsIn
        .filter((p) => p.status === 'delivered' || p.status === 'invoiced')
        .map((p) =>
          drillRow(p, {
            contributionCents: p.priceCents,
            ageDays: null,
            sharePct: share(p.priceCents, funnel.awaitingCollection.amountCents),
            because: `${ENGAGEMENT_STATUS_LABELS[p.status]} and uncollected — age unknown, there is no invoice date to age from`,
          }),
        )
        .sort(byValue);
      return envelope({
        rows,
        notes: [
          `${profile.what}. ${rows.length} row${rows.length === 1 ? '' : 's'}, none of which can be aged.`,
          ...reconcile(rows.length, funnel.awaitingCollection.count, `the ${funnel.currency} receivable leg`),
        ],
        // The ROWS exist and are listed; the AGING is refused. Returning nothing at
        // all would hide uncollected work, which is the thing that kills a services
        // business, behind a schema gap.
        refusal: book.cash.receivableAgingRefusal,
        grade: book.cash.receivableAnchorAvailable ? GRADE_RECORDED : GRADE_PLACEHOLDER,
      });
    }

    case 'cash.aged': {
      const rows = positions
        .filter(
          (p) =>
            inCurrency(p) &&
            p.acceptedAt != null &&
            p.depositPaidAt == null &&
            !isTerminalEngagementStatus(p.status),
        )
        .map((p) => ({ p, days: ageInDays(p.acceptedAt, asOf) }))
        .filter((x) => x.days != null && x.days > AGED_DEPOSIT_ALARM_DAYS)
        .map((x) =>
          drillRow(x.p, {
            contributionCents: x.p.depositRequiredCents,
            ageDays: x.days,
            because: `Accepted ${x.days}d ago — past the ${AGED_DEPOSIT_ALARM_DAYS}d alarm, so this is delivery on trust`,
          }),
        )
        .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
      const oldest = book.cash.oldestUnpaidDeposit;
      return envelope({
        rows,
        notes: [
          oldest
            ? `Oldest: ${oldest.clientName ?? oldest.clientId} accepted ${oldest.days}d ago, ` +
              `${oldest.depositRequiredCents} cents in ${oldest.currency}, status ${oldest.statusLabel}.`
            : 'No unpaid deposit is old enough to alarm.',
          `Days are currency-agnostic, which is why this one figure is stated book-wide; each amount ` +
            'still carries its own currency and none are added together.',
          ...(req.currency == null
            ? reconcile(rows.length, book.cash.agedDepositCount, 'aged unpaid deposits')
            : []),
        ],
        total: req.currency != null,
      });
    }

    /* ── The composed grade, and the verdict under it ────────────────────────── */
    case 'health.score': {
      const h = book.health;
      const agedIds = new Set(
        positions
          .filter((p) => {
            const d = ageInDays(p.acceptedAt, asOf);
            return (
              p.depositPaidAt == null &&
              !isTerminalEngagementStatus(p.status) &&
              d != null &&
              d > AGED_DEPOSIT_ALARM_DAYS
            );
          })
          .map((p) => p.engagementId),
      );
      const rows = considered
        .map((p) => {
          const margin = marginCents(p.priceCents, p.vendorCostCents);
          const reasons: string[] = [];
          if (margin < 0) reasons.push('quoted BELOW vendor cost — charged to the score');
          if (agedIds.has(p.engagementId)) reasons.push(`deposit unpaid past ${AGED_DEPOSIT_ALARM_DAYS}d — charged to the score`);
          if (p.partner == null) reasons.push('no delivering partner recorded — widens the score band');
          if (reasons.length === 0) reasons.push('contributes to concentration only');
          return drillRow(p, {
            contributionCents: positionValueCents(p, req.basis),
            because: reasons.join('; '),
          });
        })
        .sort(byValue);
      return envelope({
        rows,
        drivers: h.drivers,
        notes: [
          h.headline,
          `Drivers sum to ${h.score} by addition — the score is reconstructable from the list, which is ` +
            'the whole of D1 in one property.',
          h.scoreBand.basis,
          h.confidenceBasis,
          ...h.statements,
          h.collectionOutlook
            ? `${h.collectionOutlook.claim}: ${h.collectionOutlook.phrase}`
            : (h.collectionOutlookRefusal ?? ''),
        ].filter((s) => s !== ''),
        grade: book.placeholders.vendorCostsArePlaceholders ? GRADE_PLACEHOLDER : GRADE_RECORDED,
      });
    }

    case 'constraint.check': {
      const binding = book.health.binding;
      const code = req.code ?? binding.code;
      const check = binding.considered.find((c) => c.code === code) ?? null;
      const active = positions.filter((p) => WIP_STATUSES.includes(p.status));

      // The rows that MADE the verdict, per code. A constraint with no rows behind it
      // is not a bug — `unstaffable_offers` is a catalogue fact, not a row fact — and
      // the note says which kind it is rather than leaving an empty table to imply.
      let rows: readonly BookDrillRow[] = [];
      if (code === 'cash_collection') {
        rows = positions
          .filter((p) => p.acceptedAt != null && p.depositPaidAt == null && !isTerminalEngagementStatus(p.status))
          .map((p) => {
            const d = ageInDays(p.acceptedAt, asOf);
            return drillRow(p, {
              contributionCents: p.depositRequiredCents,
              ageDays: d,
              because: `Deposit outstanding${d == null ? '' : ` ${d}d`} — this is the cash that funds a partner`,
            });
          })
          .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));
      } else if (code === 'unstaffable_offers') {
        const unstaffable = new Set(OFFERS.filter((o) => o.partnerOwner === null).map((o) => o.key));
        rows = active
          .filter((p) => unstaffable.has(p.offerKey))
          .map((p) =>
            drillRow(p, {
              contributionCents: positionValueCents(p, req.basis),
              because: `${p.offerKey} names no delivering partner — he would be delivering this himself`,
            }),
          );
      } else if (code === 'coordination_hours' || code === 'bench_capacity') {
        rows = active.map((p) =>
          drillRow(p, {
            contributionCents: positionValueCents(p, req.basis),
            because: `${ENGAGEMENT_STATUS_LABELS[p.status]} — draws on coordination hours and occupies a slot`,
          }),
        );
      } else if (code === 'demand') {
        rows = positions
          .filter((p) => isOpenPosition(p) && p.acceptedAt == null)
          .map((p) =>
            drillRow(p, {
              contributionCents: positionValueCents(p, req.basis),
              because: `${ENGAGEMENT_STATUS_LABELS[p.status]} — could still become revenue`,
            }),
          );
      }

      return envelope({
        rows,
        notes: [
          `Verdict: ${binding.label} — ${binding.reason}`,
          ...(binding.remedy ? [`Remedy: ${binding.remedy}`] : []),
          ...binding.evidence.map((e) => `${e.label}: ${e.value} (${e.source})`),
          ...(check ? [`${check.label}: ${check.reason}`] : []),
          ...binding.considered
            .filter((c) => c.code !== code)
            .map((c) => `${c.binds ? 'BINDS' : c.evaluable ? 'did not bind' : 'UNEVALUABLE'} — ${c.label}: ${c.reason}`),
          binding.confidenceBasis,
          ...(rows.length === 0
            ? ['This constraint is a catalogue or capacity fact rather than a row fact, so it has no engagements behind it. The evidence lines above are its whole basis.']
            : []),
        ],
        grade:
          code === 'coordination_hours' || code === 'quotability' ? GRADE_PLACEHOLDER : GRADE_RECORDED,
        refusal:
          req.code != null && check == null
            ? `'${req.code.slice(0, 40)}' is not a constraint this book considered. Considered: ${binding.considered.map((c) => c.code).join(', ')}.`
            : null,
      });
    }

    /* ── 6.2 Capacity, and his own ceiling ───────────────────────────────────── */
    case 'capacity.offer': {
      if (book.capacity == null) {
        return envelope({
          rows: [],
          grade: GRADE_PLACEHOLDER,
          refusal:
            'There is no partner bench to measure: PARTNER_BENCH is empty because only the founder can ' +
            'name the partners, their capabilities, their jurisdictions and their concurrent capacity ' +
            '(decision D5). benchHeadroom() is therefore not called with zero partners — a spare-slot ' +
            'count of 0 would render as AT CAPACITY, which is the opposite of "nobody has told us".',
        });
      }
      const cap = book.capacity;
      const rows = positions
        .filter((p) => WIP_STATUSES.includes(p.status) && (req.offerKey == null || p.offerKey === req.offerKey))
        .map((p) =>
          drillRow(p, {
            contributionCents: positionValueCents(p, req.basis),
            because: `${ENGAGEMENT_STATUS_LABELS[p.status]} — occupies a slot${p.partner == null ? ', with NO named partner (consumes nobody\'s slot and is invisible to the arithmetic)' : ''}`,
          }),
        );
      const offers = req.offerKey ? cap.perOffer.filter((o) => o.offerKey === req.offerKey) : cap.perOffer;
      return envelope({
        rows,
        notes: [
          `${cap.totalSpareSlots} spare slot${cap.totalSpareSlots === 1 ? '' : 's'} across the bench. THIS IS ` +
            'NOT THE SUM OF THE PER-OFFER FIGURES: a partner capable of three offers contributes their spare ' +
            'slot to all three, because each is the answer to "if the next deal were THIS offer, could we take it?".',
          ...(cap.perOfferIndependent
            ? []
            : ['At least one partner is capable of more than one offer, so the per-offer headroom figures OVERLAP.']),
          ...(cap.availabilityEvaluated ? [] : ['Availability windows were NOT applied — no asOf reached the engine.']),
          ...(cap.unstaffedActiveCount > 0
            ? [`${cap.unstaffedActiveCount} active engagement(s) have no named partner: sold and unstaffable.`]
            : []),
          ...offers.map(
            (o) =>
              `${o.offerKey}: headroom ${o.headroom}${o.blocked ? ' (BLOCKED)' : ''}, ${o.activeNow} active now, ` +
              `${o.capablePartnerIds.length} capable / ${o.quotablePartnerIds.length} quotable. ` +
              o.reasons.map((r) => `${r.label} (${r.slots})`).join('; '),
          ),
        ],
      });
    }

    case 'wip': {
      if (book.wip == null) {
        return envelope({
          rows: [],
          grade: GRADE_PLACEHOLDER,
          refusal:
            'The coordination ceiling cannot be read: migration 0049_gps_delivery.sql (gps_milestone) is not ' +
            'applied on this environment. Reported as unknown rather than derived from engagement counts — ' +
            'three diagnostics and three legal-opinion coordinations are the same count and roughly double the work.',
        });
      }
      const w = book.wip;
      const rows = positions
        .filter((p) => WIP_STATUSES.includes(p.status) || p.status === 'delivered' || p.status === 'invoiced')
        .map((p) =>
          drillRow(p, {
            contributionCents: positionValueCents(p, req.basis),
            because: WIP_STATUSES.includes(p.status)
              ? `${ENGAGEMENT_STATUS_LABELS[p.status]} — draws coordination hours`
              : `${ENGAGEMENT_STATUS_LABELS[p.status]} — chasing cash, counted separately and given NO coordination hours`,
          }),
        );
      return envelope({
        rows,
        notes: [
          w.headline,
          `${w.coordinationHoursPerWeek}h/week committed against a ${w.capacityHoursPerWeek}h ceiling` +
            `${w.utilisationPct == null ? '' : ` (${w.utilisationPct}%)`}${w.overCapacity ? ' — OVER CAPACITY' : ''}.`,
          ...(w.usesPlaceholderHours
            ? ['THE HOURS ARE PLACEHOLDERS, not measured. Read the shape and the ordering, never the magnitudes, and never plan against the utilisation percentage.']
            : []),
        ],
        grade: w.usesPlaceholderHours ? GRADE_PLACEHOLDER : GRADE_RECORDED,
      });
    }

    /* ── 6.4 Margin realisation ──────────────────────────────────────────────── */
    case 'margin.realisation': {
      const m = book.marginRealisation;
      if (m == null) {
        return envelope({
          rows: [],
          grade: GRADE_PLACEHOLDER,
          refusal:
            `Realised margin cannot be read: there is no gps_outcome table on this environment (migration ` +
            `${OUTCOME_MIGRATION}). It is NOT derivable from gps_engagement: quoted and realised would both ` +
            'read the same price and cost columns, so every slippage figure would be exactly 0% by ' +
            'construction — a fabricated measurement of the most important number in a partner-delivered ' +
            'business, which is worse than an absent one.',
        });
      }
      const groups = req.offerKey ? m.byOffer.filter((g) => g.key === req.offerKey) : m.byOffer;
      return envelope({
        rows: [],
        notes: [
          ...groups.map(
            (g) =>
              `${g.key}: n=${g.n}, mean slippage ${g.slippageMeanCents} cents ` +
              `(price ${g.priceSlippageMeanCents}, cost ${g.costSlippageMeanCents})` +
              `${g.slippageVarianceCents2 == null ? ' — one engagement gives no variance, and one overrun is an anecdote' : ''}`,
          ),
          ...m.byPartner.map((g) => `partner ${g.key}: n=${g.n}, mean slippage ${g.slippageMeanCents} cents`),
          m.overall
            ? `Pooled: n=${m.overall.n}, mean slippage ${m.overall.slippageMeanCents} cents.`
            : 'No completed engagement has both a realised price and a realised cost, so nothing is pooled.',
          ...(m.offersWithNoRealisationData.length > 0
            ? [`Blind spots — no realisation data at all for: ${m.offersWithNoRealisationData.join(', ')}. That list IS the finding.`]
            : []),
          `${m.excludedIncompleteRealisation} won engagement(s) excluded pending a realised figure; ` +
            `${m.excludedLost} lost (no margin was realised on them, which is not a data gap).`,
          'Rows live in gps_outcome, not in the book: an outcome is not a position. The outcome desk ' +
            'serves them per engagement.',
        ],
      });
    }

    /* ── 6.5 The uncomfortable list ──────────────────────────────────────────── */
    case 'gaps': {
      const unstaffable = new Set(OFFERS.filter((o) => o.partnerOwner === null).map((o) => o.key));
      const rows = positions
        .filter(inCurrency)
        .map((p) => {
          const defects: string[] = [];
          const margin = marginCents(p.priceCents, p.vendorCostCents);
          const days = ageInDays(p.acceptedAt, asOf);
          if (isOpenPosition(p) && p.priceCents === 0) defects.push('LIVE AND UNPRICED — no price on the engagement');
          if (margin < 0) defects.push('QUOTED BELOW VENDOR COST — at a $10–25k ticket there is no volume that fixes this');
          if (p.depositPaidAt != null && p.acceptedAt == null) defects.push('DEPOSIT BANKED WITH NO ACCEPTANCE DATE — cash arrived, the signature is unrecorded');
          if (days != null && days > AGED_DEPOSIT_ALARM_DAYS && p.depositPaidAt == null && !isTerminalEngagementStatus(p.status)) {
            defects.push(`DEPOSIT ${days}d UNPAID — delivery is proceeding on trust`);
          }
          if (WIP_STATUSES.includes(p.status) && unstaffable.has(p.offerKey)) {
            defects.push('NO PARTNER CAN DELIVER THIS OFFER — he is the bench');
          }
          return defects.length === 0
            ? null
            : drillRow(p, {
                contributionCents: positionValueCents(p, req.basis),
                ageDays: days,
                because: defects.join(' · '),
              });
        })
        .filter((r): r is BookDrillRow => r != null)
        .sort(byValue);
      return envelope({
        rows,
        notes: [
          'Row-level defects only. Missing and declined CONFLICT CHECKS are deliberately not re-counted ' +
            'here: the desk summary and the conflict register already define them, and a second definition ' +
            'is the one that goes stale.',
          ...book.unresolved.map(
            (u) => `${u.blocking ? 'BLOCKING' : 'open'} · ${u.field} (${u.owner}) — ${u.consequence}`,
          ),
        ],
        total: false,
      });
    }
  }
}
