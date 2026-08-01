/**
 * GPS PHASE 6 — THE BOOK. Portfolio, not pipeline.
 *
 * THE REFRAME THIS FILE EXISTS TO SERVE (`GPS_100X_PLAN.md` §0): "GPS is not a
 * pipeline you fill. It is a book you underwrite." Each engagement is a POSITION
 * with an expected margin, a capacity draw, a concentration contribution and a
 * counterparty. Phases 0–5 built 4,564 lines of engine and surfaced them in zero
 * web files; this module is the arithmetic the one screen that fixes that needs,
 * plus the WIRE TYPES (`BookResponse`, bottom of file) that the API and the web
 * BOTH import.
 *
 * ── THE CONTRACT RULE, STATED AT THE TOP BECAUSE IT HAS ALREADY BEEN BROKEN ──
 * `BookResponse` and everything it transitively contains is declared HERE, once.
 * `apps/api` returns this type; `apps/web` imports this type. Neither
 * re-declares it. The production crash this rule prevents: the web hand-copied a
 * GPS summary interface claiming `counts` / `clientCount` / `openValueCents`,
 * fields the API never returned; `tsc` believed the copy, the mocked page test
 * agreed with the copy, and the page exploded the moment real migrations landed
 * (`GPS_100X_PLAN.md` §1 D8: "GPS has already failed once (`counts` never
 * existed)"). A duplicated response interface is not a style preference, it is an
 * untested claim about a server you did not read.
 *
 * ── WHAT THIS FILE DOES NOT DO ──
 * No I/O, no DB, no clock, no LLM. Every function is a pure fold over an array
 * the caller supplies, plus an explicit `asOf` for anything time-dependent — a
 * hidden `Date.now()` inside an aging calculation is a function you cannot test
 * at a boundary, and the boundaries are the entire point of §6.3.
 *
 * Money is integer cents throughout (`types.ts:26`). A share, a percentage and a
 * Herfindahl index are ratios and are therefore allowed to be floats; a cent is
 * never a float. There is no cross-currency total anywhere in this file, and
 * `crossCurrencyTotalCents: null` is literal-typed so a future edit that pools
 * currencies cannot keep the shape without a compile error — the same device
 * `calibration.ts:851` uses for `canTrainAModel: false`.
 *
 * ── WHAT THE SCHEMA DOES NOT STORE, WHICH THIS MODULE MUST NOT INVENT ──
 * Read `0047_gps.sql` before adding a field. `gps_engagement` has exactly four
 * timestamps — `deposit_paid_at:193`, `accepted_at:197`, `created_at:199`,
 * `updated_at:200`. There is **no `invoiced_at`, no `delivered_at`, and no
 * `partner_id`**. Three consequences are load-bearing and are surfaced rather
 * than papered over:
 *
 *   1. Receivable age from invoicing CANNOT be computed. `updated_at` is not a
 *      substitute — it moves on any edit, so a receivable would appear to get
 *      younger every time someone fixed a typo. `CashConversion` therefore
 *      reports `receivableAging: null` with a reason string, and only the
 *      deposit leg (which has a real anchor in `accepted_at`) is aged.
 *   2. Partner attribution per engagement is not stored, so the partner axis of
 *      `BookConcentration` is mostly UNATTRIBUTED. The engine reports the
 *      unattributed share explicitly and puts a BAND on the index rather than a
 *      number that pretends the unknown positions are all one partner (or all
 *      different ones). This is the axis the founder most needs — partners
 *      deliver, he sells and coordinates — which is exactly why a fabricated
 *      figure here would be the worst number on the screen.
 *   3. `jurisdiction` is free text on `gps_client:73`, by deliberate design (the
 *      system records what a human typed and refuses to infer a perimeter). It is
 *      therefore case- and whitespace-normalised for grouping only, and the
 *      original spelling of the dominant holder is preserved for display.
 *
 * ── WHY `Driver` COMES FROM alpha.ts AND THAT IS NOT A CONTRADICTION ──
 * `types.ts:13` warns at length against importing `alpha.ts` here. That warning
 * is about the COMPOSITES: `listingPropensity` treats `listedOnLcx` as reducing
 * opportunity (`alpha.ts:109`) and `dealValue` anchors on listing size
 * (`alpha.ts:157`), both inverted for a services book. The `Driver { label,
 * points }` shape (`alpha.ts:41`) carries no such wiring, and `GPS_100X_PLAN.md`
 * §1 D1 names it explicitly as the pattern to reuse. Type-only import, no
 * composite scores.
 *
 * ── WHERE THIS DELIBERATELY DIFFERS FROM alpha.ts ──
 * `assess()` multiplies conviction by its own confidence (`alpha.ts:230`).
 * `bookHealth()` does NOT. Folding confidence into a score is the exact defect
 * this programme removed from the targeting formula (`GPS_100X_PLAN.md` §1 D3,
 * `GPS_IMPLEMENTATION_PLAN.md` §1.3): it makes the score gameable by weakening
 * the evidence, and it destroys the reader's ability to tell "bad" from
 * "unknown". Here the score is a measurement and the confidence sits BESIDE it.
 */
import type { Driver } from '../alpha.js';
import {
  CONFIDENCE_LABEL,
  estimativeConfidence,
  likelihood,
  type ConfidenceLevel,
  type Likelihood,
} from '../estimative.js';
import {
  MIN_N_FOR_RATE,
  UNATTRIBUTED_PARTNER,
} from './calibration.js';
// TYPE-ONLY. These engines are called by the API layer, never from this module —
// `BookResponse` carries their own declared shapes so the web imports one
// declaration of each instead of hand-copying three (see the WIRE TYPES header).
import type { MarginRealisation } from './calibration.js';
import type { WipLoad } from './delivery.js';
import type { BenchHeadroom } from './partners.js';
import {
  ENGAGEMENT_STATUS_LABELS,
  isTerminalEngagementStatus,
  marginCents,
  type EngagementStatus,
  type OfferKey,
} from './types.js';

export type { Driver };
export type { BenchHeadroom, MarginRealisation, WipLoad };

/**
 * The sentinel for "we do not know who holds this".
 *
 * Reuses `calibration.ts:435`'s string rather than minting a second one: a UI
 * that wants to render an unattributed row in grey needs ONE literal to match
 * on, and two spellings of the same absence is how "(unattributed)" and
 * "(unknown)" end up side by side in the same table.
 */
export const UNATTRIBUTED = UNATTRIBUTED_PARTNER;

/** Round a ratio to one decimal place as a percentage. Never used on money. */
function pct1(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.round(fraction * 1000) / 10;
}

/** Round a Herfindahl index to 4 dp — enough to separate 0.3333 from 0.3334. */
function hhi4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

/**
 * A deduction as a signed driver point, normalising `-0` to `0`.
 *
 * Not pedantry: `-Math.round(0)` is `-0` in JavaScript, which a numeric formatter
 * will happily render as "-0" beside a driver that cost nothing. A surface whose
 * whole promise is that the numbers are readable cannot ship a minus sign in
 * front of zero.
 */
function deduct(points: number): number {
  return points === 0 ? 0 : -points;
}

/** Integer cents or zero. Guards a caller that hands us a float or a NaN. */
function cents(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? Math.round(v) : 0;
}

/**
 * Whole days between two ISO instants, floored, `to` after `from`.
 *
 * Returns null for an unparseable input or a NEGATIVE interval rather than
 * clamping to 0. A negative age means the row says it was accepted in the
 * future, which is a data fault; reporting it as "0 days old" would put it in
 * the freshest aging bracket and hide the fault forever (D2).
 */
export function ageInDays(fromIso: string | null | undefined, asOfIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(asOfIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const days = Math.floor((to - from) / 86_400_000);
  return days < 0 ? null : days;
}

/* ── The position ─────────────────────────────────────────────────────────── */

/**
 * One engagement, viewed as a POSITION rather than as a pipeline row.
 *
 * Assembled by the API from `gps_engagement` joined to `gps_client` (for
 * `clientName` and `jurisdiction`). Every field is stated as nullable exactly
 * where the schema permits null, because the whole value of this module is that
 * it distinguishes "zero" from "not known".
 */
export interface BookPosition {
  engagementId: string;
  clientId: string;
  /** Display name from `gps_client.name`. Grouping keys on `clientId`, never on this. */
  clientName: string | null;
  offerKey: OfferKey;
  status: EngagementStatus;
  /** ISO-4217, uppercase. Per engagement — partners invoice in their own (`0047_gps.sql:172`). */
  currency: string;
  priceCents: number;
  vendorCostCents: number;
  /**
   * Free text off `gps_client.jurisdiction` (`0047_gps.sql:73`). NOT an enum, on
   * purpose: no jurisdiction rule in this programme is verified, so the system
   * records what a human typed.
   */
  jurisdiction: string | null;
  /**
   * The delivering partner. NULL FOR EVERY ROW TODAY — `gps_engagement` has no
   * partner column and `catalogue.ts` names no `partnerOwner` on any of the five
   * offers (D5 outstanding). Supplied here so the axis works the day it lands,
   * and so the "we cannot answer this yet" is a computed fact rather than a
   * missing feature.
   */
  partner: string | null;
  /**
   * `deposit_required_cents` — set at acceptance. This, not `priceCents`, is the
   * amount actually outstanding on the deposit leg, and it is what ages.
   */
  depositRequiredCents: number;
  /** `accepted_at`. A signature, not cash. */
  acceptedAt: string | null;
  /** `deposit_paid_at`. Cash, and the only fact that commits a partner. */
  depositPaidAt: string | null;
  createdAt: string;
  /**
   * When the invoice was raised, IF a caller can supply it from somewhere other
   * than `gps_engagement` (which has no such column — see the file header).
   * Optional and expected absent; `cashConversion` refuses to age receivables
   * rather than substituting `updated_at`.
   */
  invoicedAt?: string | null;
}

/** Non-terminal positions: what is actually in play (`types.ts:250`). */
export function isOpenPosition(p: BookPosition): boolean {
  return !isTerminalEngagementStatus(p.status);
}

/**
 * The value of a position, in ITS OWN currency, under one of two bases.
 *
 * `margin` is the default everywhere in this module, and that is a commercial
 * decision not a technical one: partners deliver and the founder sells and
 * coordinates, so margin and capacity are the business, not revenue
 * (`GPS_100X_PLAN.md` §2). A book concentrated 60% of REVENUE behind one client
 * whose margin is 8% is a different problem from one concentrated 60% of MARGIN.
 */
export type ConcentrationBasis = 'margin' | 'price';

export function positionValueCents(p: BookPosition, basis: ConcentrationBasis): number {
  return basis === 'price'
    ? cents(p.priceCents)
    : marginCents(cents(p.priceCents), cents(p.vendorCostCents));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.1 — CONCENTRATION
 *
 * "A services book with 60% of margin behind one partner is one resignation
 * from a crisis" (`GPS_100X_PLAN.md` §2). The engine must be able to SAY that,
 * which is why an index alone is not the deliverable: HHI = 0.41 tells a reader
 * nothing they can act on, and a list of shares hides the shape. Every axis
 * returns BOTH — the index, and the dominant holder with its share and its
 * name.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The five axes. `currency` is separated from the other four in the type system
 * below because it cannot be measured in the same unit — see `CurrencyMix`.
 */
export type ValueAxis = 'client' | 'offer' | 'partner' | 'jurisdiction';
export const VALUE_AXES: readonly ValueAxis[] = ['client', 'offer', 'partner', 'jurisdiction'] as const;

export const AXIS_LABEL: Record<ValueAxis | 'currency', string> = {
  client: 'Client',
  offer: 'Offer',
  partner: 'Delivering partner',
  jurisdiction: 'Jurisdiction',
  currency: 'Currency',
};

/** One holder's stake on one axis. `key` is the grouping key; `label` is for display. */
export interface ConcentrationHolder {
  key: string;
  label: string;
  /** Integer cents, in the enclosing currency. Never pooled across currencies. */
  valueCents: number;
  /** Share of the ATTRIBUTED POSITIVE total on this axis, 1 dp. */
  sharePct: number;
  /** Positions behind this holder. Two $5k engagements and one $10k are not the same risk. */
  positions: number;
}

/**
 * A range on the index, and the named reason it is a range rather than a number.
 *
 * D3: uncertainty is first-class and sits BESIDE the estimate. The mechanism here
 * is real, not decorative — unattributed positions have two extreme readings and
 * the truth is between them:
 *   `high` — every unattributed position belongs to ONE unseen holder.
 *   `low`  — every unattributed position belongs to a DIFFERENT unseen holder.
 * Both are computed over the full positive total, so the band brackets the answer
 * you would get if the missing attribution arrived. When nothing is unattributed
 * the band collapses to a point and `isPoint` says so, because a band drawn around
 * a fully known quantity is theatre.
 */
export interface ConcentrationBand {
  low: number;
  high: number;
  isPoint: boolean;
  /** Plain-language mechanism. Safe to render verbatim. */
  basis: string;
}

/**
 * The concentration of one axis, within ONE currency.
 *
 * `hhi` is the Herfindahl-Hirschman index over the attributed positive holders,
 * Σsᵢ² with sᵢ a fractional share, so a single holder is exactly 1.0 and N equal
 * holders are 1/N. Reported as a 0–1 fraction AND as the 0–10,000 integer the
 * antitrust convention uses, because both readings appear in the literature and
 * a surface should not have to guess which one it has.
 */
export interface AxisConcentration {
  axis: ValueAxis;
  basis: ConcentrationBasis;
  currency: string;

  /** Sum of POSITIVE holder values, attributed + unattributed. The honest denominator. */
  totalPositiveCents: number;
  /** Sum of positive values we can attribute to a named holder. */
  attributedPositiveCents: number;
  /** `attributedPositiveCents / totalPositiveCents`, 1 dp. 100 when nothing is missing. */
  coveragePct: number | null;

  /** Named holders with positive value, largest first. */
  holders: readonly ConcentrationHolder[];
  holderCount: number;

  /**
   * Σsᵢ² over `holders`. Null — never 0 — when there is no positive attributed
   * value at all: "no concentration" and "nothing to measure" are different
   * facts and a zero here would render as a reassuringly diversified book.
   */
  hhi: number | null;
  /** The same index as an integer 0–10,000. Null whenever `hhi` is null. */
  hhiPoints: number | null;
  /**
   * How many equal-sized holders this book BEHAVES like, `1/hhi`, 1 dp. This is
   * the figure to put on a screen: "your book behaves like 1.8 independent
   * clients" is actionable in a way that "HHI 0.55" is not.
   */
  effectiveHolders: number | null;
  /**
   * `(hhi − 1/N) / (1 − 1/N)` — the index rescaled so 0 is perfectly even and 1
   * is a monopoly, which makes books with different holder counts comparable.
   * NULL when N ≤ 1, because the formula divides by zero there and a book with
   * one holder is not "0% concentrated"; it is the most concentrated book
   * possible, which `hhi = 1.0` already says.
   */
  normalisedHhi: number | null;
  /**
   * The bracket implied by unattributed value. NULL only when there is no
   * positive value at all on the axis — there is nothing to bracket, and a
   * `{low: 0, high: 0}` would read as a perfectly diversified book.
   */
  band: ConcentrationBand | null;

  /** The largest holder. The answer to "who is the single point of failure". */
  dominant: ConcentrationHolder | null;
  /** Largest three, in order. The rollup, because an index alone is not actionable. */
  top3: readonly ConcentrationHolder[];
  /** Combined share of `top3`, 1 dp. Null when nothing is measurable. */
  top3SharePct: number | null;

  /** Positions with no value on this axis' key. Excluded from `hhi`, bracketed by `band`. */
  unattributedPositions: number;
  unattributedPositiveCents: number;

  /**
   * Holders whose aggregated value is ≤ 0, named and excluded WITH the reason.
   *
   * A Herfindahl index is not defined over negative shares: a holder at −$2,000
   * against a $10,000 book has share −0.2, whose square is +0.04, so a loss-making
   * counterparty would INCREASE the measured diversification of the book. Rather
   * than silently drop them (D2 forbids exactly that) they are listed here so the
   * surface can show "index computed over 4 of 5 holders" and name the fifth.
   */
  excludedNonPositive: readonly { key: string; label: string; valueCents: number; positions: number }[];

  /** Every refusal and caveat on this axis, ordered most important first. D2. */
  notes: readonly string[];

  /**
   * One sentence naming the dominant holder, its share, and the consequence.
   *
   * This field is the reason the module exists rather than a `hhi` helper: the
   * plan's requirement is that the engine can SAY "a services book with 60% of
   * margin behind one partner is one resignation from a crisis"
   * (`GPS_100X_PLAN.md` §2), and an index cannot say anything. Safe to render
   * verbatim.
   */
  headline: string;
}

/* ── Concentration thresholds ──────────────────────────────────────────────────
 * A STATED PRIOR, reviewed by a human — the same status as `WEIGHTS_V1`
 * (`targeting.ts`), and deliberately NOT the same status as a price: these are
 * judgement boundaries on a measured share, not placeholders standing in for a
 * number the founder has yet to supply, so they are not badged as unresolved.
 * They are exported so a surface highlights at the same boundary the engine
 * speaks at, instead of inventing a second one in CSS.
 */

/** Above half, the holder IS the book: losing it is not a setback, it is the end of the quarter. */
export const SINGLE_HOLDER_ALARM_SHARE_PCT = 50;
/** Worth naming out loud. Roughly "one of three" in a book this size. */
export const SINGLE_HOLDER_WATCH_SHARE_PCT = 30;
/** Three holders carrying four fifths of the book is a book with three counterparties. */
export const TOP3_ALARM_SHARE_PCT = 80;

/**
 * The grouping key for a position on one axis, plus the spelling to display.
 *
 * Returns null for "cannot be attributed", which is a different answer from
 * "attributed to nobody" and is why this is nullable rather than defaulting to
 * `UNATTRIBUTED`. `client` and `offer` can never be null — both columns are NOT
 * NULL in `0047_gps.sql` — and the code below asserts that by construction
 * rather than by comment.
 */
function axisKey(p: BookPosition, axis: ValueAxis): { key: string; label: string } | null {
  switch (axis) {
    case 'client':
      return { key: p.clientId, label: p.clientName?.trim() || p.clientId };
    case 'offer':
      // The client-facing offer NAME lives in `catalogue.ts`; the key is stable
      // and the catalogue is versioned code, so a surface joins the two rather
      // than this module importing a display string it would then freeze.
      return { key: p.offerKey, label: p.offerKey };
    case 'partner': {
      const raw = p.partner?.trim();
      return raw ? { key: raw, label: raw } : null;
    }
    case 'jurisdiction': {
      const raw = p.jurisdiction?.trim();
      if (!raw) return null;
      // Free text (`0047_gps.sql:73`), so "Liechtenstein" and "liechtenstein "
      // are one holder for grouping. The FIRST-SEEN original spelling is kept for
      // display: normalising what a human typed into what a machine prefers is
      // how a screen stops matching the record it came from.
      return { key: raw.toLowerCase().replace(/\s+/g, ' '), label: raw };
    }
  }
}

/** Herfindahl over a list of non-negative values. Null when they sum to ≤ 0. */
function herfindahl(values: readonly number[]): number | null {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (total <= 0) return null;
  return values.reduce((a, v) => {
    const s = Math.max(0, v) / total;
    return a + s * s;
  }, 0);
}

/**
 * `(H − 1/N) / (1 − 1/N)`. Null at N ≤ 1 — see `AxisConcentration.normalisedHhi`
 * for why that is a refusal and not a zero.
 */
function normalise(hhi: number, holderCount: number): number | null {
  if (holderCount <= 1) return null;
  const floor = 1 / holderCount;
  return hhi4((hhi - floor) / (1 - floor));
}

function buildAxis(
  positions: readonly BookPosition[],
  axis: ValueAxis,
  basis: ConcentrationBasis,
  currency: string,
): AxisConcentration {
  const acc = new Map<string, { label: string; valueCents: number; positions: number }>();
  let unattributedPositions = 0;
  let unattributedPositiveCents = 0;
  let unattributedPositivePositions = 0;

  for (const p of positions) {
    const value = positionValueCents(p, basis);
    const k = axisKey(p, axis);
    if (!k) {
      unattributedPositions += 1;
      if (value > 0) {
        unattributedPositiveCents += value;
        unattributedPositivePositions += 1;
      }
      continue;
    }
    const cur = acc.get(k.key);
    if (cur) {
      cur.valueCents += value;
      cur.positions += 1;
    } else {
      acc.set(k.key, { label: k.label, valueCents: value, positions: 1 });
    }
  }

  const nonPositive = [...acc.entries()]
    .filter(([, v]) => v.valueCents <= 0)
    .map(([key, v]) => ({ key, label: v.label, valueCents: v.valueCents, positions: v.positions }))
    .sort((a, b) => a.valueCents - b.valueCents || a.key.localeCompare(b.key));

  const positive = [...acc.entries()]
    .filter(([, v]) => v.valueCents > 0)
    .map(([key, v]) => ({ key, label: v.label, valueCents: v.valueCents, positions: v.positions }))
    // Value descending, then key ascending: ties must not reorder between calls,
    // or a keyboard-driven list (D6) moves under the cursor.
    .sort((a, b) => b.valueCents - a.valueCents || a.key.localeCompare(b.key));

  const attributedPositiveCents = positive.reduce((a, h) => a + h.valueCents, 0);
  const totalPositiveCents = attributedPositiveCents + unattributedPositiveCents;

  const rawHhi = herfindahl(positive.map((h) => h.valueCents));
  const holders: ConcentrationHolder[] = positive.map((h) => ({
    key: h.key,
    label: h.label,
    valueCents: h.valueCents,
    sharePct: attributedPositiveCents > 0 ? pct1(h.valueCents / attributedPositiveCents) : 0,
    positions: h.positions,
  }));
  const top3 = holders.slice(0, 3);

  // The band. `high` puts every unattributed position behind one unseen holder;
  // `low` gives each its own. Both over the FULL positive total, so the band
  // brackets what the index would read once attribution arrives.
  let band: ConcentrationBand | null = null;
  if (totalPositiveCents > 0) {
    const attributedSquares = positive.reduce((a, h) => {
      const s = h.valueCents / totalPositiveCents;
      return a + s * s;
    }, 0);
    if (unattributedPositiveCents <= 0) {
      const point = hhi4(attributedSquares);
      band = {
        low: point,
        high: point,
        isPoint: true,
        basis: 'Every position on this axis is attributed; the index is a measurement, not a range.',
      };
    } else {
      const uShare = unattributedPositiveCents / totalPositiveCents;
      const m = Math.max(1, unattributedPositivePositions);
      band = {
        low: hhi4(attributedSquares + (uShare * uShare) / m),
        high: hhi4(attributedSquares + uShare * uShare),
        isPoint: false,
        basis:
          `${unattributedPositivePositions} position${unattributedPositivePositions === 1 ? '' : 's'} ` +
          `(${pct1(uShare)}% of positive ${basis}) have no ${AXIS_LABEL[axis].toLowerCase()} on record. ` +
          `Low assumes each belongs to a different holder; high assumes all belong to one.`,
      };
    }
  }

  const notes: string[] = [];
  if (rawHhi == null) {
    notes.push(
      totalPositiveCents > 0
        ? `No ${AXIS_LABEL[axis].toLowerCase()} could be attributed to any positive ${basis}, so no index is reported. The band is the only honest reading.`
        : `No positive ${basis} on this axis in ${currency}; there is nothing to concentrate.`,
    );
  }
  if (unattributedPositions > 0) {
    notes.push(
      `${unattributedPositions} of ${positions.length} positions have no ${AXIS_LABEL[axis].toLowerCase()} recorded` +
        (axis === 'partner'
          ? ' — `gps_engagement` has no partner column (0047_gps.sql) and no offer names a partnerOwner (catalogue.ts, decision D5), so this is expected until the bench exists.'
          : '.'),
    );
  }
  if (nonPositive.length > 0) {
    notes.push(
      `${nonPositive.length} holder${nonPositive.length === 1 ? '' : 's'} excluded from the index at ≤ 0 ${basis} ` +
        `(${nonPositive.map((h) => h.label).join(', ')}). A Herfindahl index over negative shares would count a ` +
        `loss-making counterparty as diversification.`,
    );
  }
  if (holders.length > 0 && holders.length < MIN_N_FOR_RATE) {
    notes.push(
      `Only ${holders.length} holder${holders.length === 1 ? '' : 's'} on this axis. An index over so few holders is ` +
        `arithmetically correct and strategically obvious — read the dominant holder, not the number.`,
    );
  }

  return {
    axis,
    basis,
    currency,
    totalPositiveCents,
    attributedPositiveCents,
    coveragePct: totalPositiveCents > 0 ? pct1(attributedPositiveCents / totalPositiveCents) : null,
    holders,
    holderCount: holders.length,
    hhi: rawHhi == null ? null : hhi4(rawHhi),
    hhiPoints: rawHhi == null ? null : Math.round(rawHhi * 10_000),
    effectiveHolders: rawHhi == null || rawHhi <= 0 ? null : Math.round((1 / rawHhi) * 10) / 10,
    normalisedHhi: rawHhi == null ? null : normalise(rawHhi, holders.length),
    band,
    dominant: holders[0] ?? null,
    top3,
    top3SharePct:
      attributedPositiveCents > 0
        ? pct1(top3.reduce((a, h) => a + h.valueCents, 0) / attributedPositiveCents)
        : null,
    unattributedPositions,
    unattributedPositiveCents,
    excludedNonPositive: nonPositive,
    notes,
    headline: axisHeadline(axis, basis, currency, holders, top3, attributedPositiveCents, positions.length),
  };
}

/** The consequence sentence per axis. Named per axis because the risk differs. */
const AXIS_CONSEQUENCE: Record<ValueAxis, string> = {
  client: 'one non-renewal removes it',
  offer: 'demand for one offer moving removes it',
  partner: 'one resignation removes it',
  jurisdiction: 'one regulatory change removes it',
};

function axisHeadline(
  axis: ValueAxis,
  basis: ConcentrationBasis,
  currency: string,
  holders: readonly ConcentrationHolder[],
  top3: readonly ConcentrationHolder[],
  attributedPositiveCents: number,
  positionCount: number,
): string {
  const unit = basis === 'margin' ? 'margin' : 'billings';
  if (holders.length === 0 || attributedPositiveCents <= 0) {
    return `No positive ${unit} attributable to a ${AXIS_LABEL[axis].toLowerCase()} in ${currency} across ${positionCount} position${positionCount === 1 ? '' : 's'}.`;
  }
  const d = holders[0];
  const shape =
    holders.length === 1
      ? `${d.label} is the ONLY ${AXIS_LABEL[axis].toLowerCase()} in ${currency}: 100% of ${unit}`
      : `${d.label} holds ${d.sharePct}% of ${currency} ${unit} across ${d.positions} of ${positionCount} positions`;
  if (d.sharePct >= SINGLE_HOLDER_ALARM_SHARE_PCT) {
    return `${shape} — ${AXIS_CONSEQUENCE[axis]}.`;
  }
  const t3 = pct1(top3.reduce((a, h) => a + h.valueCents, 0) / attributedPositiveCents);
  if (top3.length >= 2 && t3 >= TOP3_ALARM_SHARE_PCT) {
    return `${shape}; the top ${top3.length} hold ${t3}% together — ${AXIS_CONSEQUENCE[axis]} for most of the book.`;
  }
  if (d.sharePct >= SINGLE_HOLDER_WATCH_SHARE_PCT) {
    return `${shape}. Worth watching, not yet a single point of failure.`;
  }
  return `${shape}. No holder dominates on this axis.`;
}

/**
 * Currency concentration, measured in POSITION COUNT rather than value.
 *
 * THIS IS THE ONE AXIS THAT CANNOT BE MEASURED IN MONEY, and the reason is the
 * same doctrine that governs `CashConversion`: a share of value requires a total,
 * and a total across currencies is true in no currency. Converting at a rate this
 * module does not have and cannot source would be an invented number on a screen
 * whose entire promise is that every number is traceable (D1/D8). So the currency
 * mix is a count, labelled a count, and each currency's own-currency total travels
 * beside it un-pooled.
 */
export interface CurrencyHolder {
  currency: string;
  positions: number;
  /** Share of POSITION COUNT, 1 dp. Not a share of value — see the interface note. */
  sharePct: number;
  /** Total value in THIS currency, integer cents. Comparable to nothing else here. */
  valueCents: number;
}

export interface CurrencyMix {
  /** Herfindahl over position counts. Basis is stated in the type, not inferred. */
  basis: 'position_count';
  hhi: number | null;
  hhiPoints: number | null;
  effectiveHolders: number | null;
  normalisedHhi: number | null;
  holders: readonly CurrencyHolder[];
  dominant: CurrencyHolder | null;
  /** Literal null, permanently. See the file header. */
  crossCurrencyTotalCents: null;
  headline: string;
}

/**
 * ONE CURRENCY NORMALISER, BECAUSE THERE WERE FOUR COPIES AND A CONSUMER THAT USED
 * NONE OF THEM.
 *
 * `buildCurrencyMix`, `bookConcentration` and `cashConversion` each inlined
 * `(p.currency || '').trim().toUpperCase() || 'UNKNOWN'`, so every funnel and every
 * concentration axis is keyed by the NORMALISED code. `apps/api/src/gps/book.ts`'s
 * `cash.aging` drill then filtered positions with `p.currency === funnel.currency` —
 * RAW against NORMALISED. Verified: a position stored as `'usd'` or `''` groups into
 * the `USD` / `UNKNOWN` funnel, and the drill on that funnel then matches nothing, so
 * the figure has rows and the drill behind it is empty. `reconcile()` discloses the
 * class of defect as a DRIFT note; this removes the instance.
 *
 * Exported so the drill can key by exactly what the funnel keyed by. A second copy is
 * how the divergence happened the first time.
 */
export function normaliseCurrency(v: string | null | undefined): string {
  return (v || '').trim().toUpperCase() || 'UNKNOWN';
}

function buildCurrencyMix(
  positions: readonly BookPosition[],
  basis: ConcentrationBasis,
): CurrencyMix {
  const acc = new Map<string, { positions: number; valueCents: number }>();
  for (const p of positions) {
    const ccy = normaliseCurrency(p.currency);
    const cur = acc.get(ccy) ?? { positions: 0, valueCents: 0 };
    cur.positions += 1;
    cur.valueCents += positionValueCents(p, basis);
    acc.set(ccy, cur);
  }
  const total = positions.length;
  const holders: CurrencyHolder[] = [...acc.entries()]
    .map(([currency, v]) => ({
      currency,
      positions: v.positions,
      sharePct: total > 0 ? pct1(v.positions / total) : 0,
      valueCents: v.valueCents,
    }))
    .sort((a, b) => b.positions - a.positions || a.currency.localeCompare(b.currency));

  const raw = herfindahl(holders.map((h) => h.positions));
  const dominant = holders[0] ?? null;
  const headline =
    holders.length === 0
      ? 'No positions, so no currency exposure.'
      : holders.length === 1
        ? `Single-currency book: all ${total} position${total === 1 ? '' : 's'} in ${dominant!.currency}. No FX exposure to manage, and no cross-currency total is ever computed.`
        : `${holders.length} currencies, ${dominant!.currency} largest at ${dominant!.sharePct}% of positions. Totals are reported per currency only — a pooled figure would be true in none of them.`;

  return {
    basis: 'position_count',
    hhi: raw == null ? null : hhi4(raw),
    hhiPoints: raw == null ? null : Math.round(raw * 10_000),
    effectiveHolders: raw == null || raw <= 0 ? null : Math.round((1 / raw) * 10) / 10,
    normalisedHhi: raw == null ? null : normalise(raw, holders.length),
    holders,
    dominant,
    crossCurrencyTotalCents: null,
    headline,
  };
}

/** The four value axes, computed within one currency. */
export interface CurrencyConcentration {
  currency: string;
  positionCount: number;
  /** Sum of position values in THIS currency, signed. Losses are not clamped. */
  totalValueCents: number;
  byAxis: Record<ValueAxis, AxisConcentration>;
}

export interface ConcentrationOptions {
  /** Default `'margin'` — margin and capacity are the business, not revenue. */
  basis?: ConcentrationBasis;
  /**
   * Default false. Terminal positions (`collected`/`closed_lost`/`cancelled`) are
   * history, not exposure: a client who paid and left concentrates nothing.
   */
  includeTerminal?: boolean;
}

export interface BookConcentration {
  basis: ConcentrationBasis;
  /** The instant the caller stated. D1: a figure without a timestamp is not traceable. */
  asOf: string;
  scope: 'open' | 'all';
  positionCount: number;
  /** Currencies present, uppercase, sorted. */
  currencies: readonly string[];
  perCurrency: readonly CurrencyConcentration[];
  currencyMix: CurrencyMix;
  /** Literal null, permanently. A total true in no currency is a lie. */
  crossCurrencyTotalCents: null;
  notes: readonly string[];
}

/**
 * Concentration across every axis, per currency.
 *
 * Pure. `asOf` is threaded through purely so the result can state when it was
 * true; nothing in concentration is time-dependent, which is why it is a label
 * here and an input in `cashConversion`.
 */
export function bookConcentration(
  positions: readonly BookPosition[],
  asOf: string,
  opts: ConcentrationOptions = {},
): BookConcentration {
  const basis = opts.basis ?? 'margin';
  const scope: 'open' | 'all' = opts.includeTerminal ? 'all' : 'open';
  const considered = opts.includeTerminal ? [...positions] : positions.filter(isOpenPosition);

  const byCcy = new Map<string, BookPosition[]>();
  for (const p of considered) {
    const ccy = normaliseCurrency(p.currency);
    const list = byCcy.get(ccy);
    if (list) list.push(p);
    else byCcy.set(ccy, [p]);
  }

  const currencies = [...byCcy.keys()].sort();
  const perCurrency: CurrencyConcentration[] = currencies.map((currency) => {
    const rows = byCcy.get(currency)!;
    const byAxis = Object.fromEntries(
      VALUE_AXES.map((axis) => [axis, buildAxis(rows, axis, basis, currency)]),
    ) as Record<ValueAxis, AxisConcentration>;
    return {
      currency,
      positionCount: rows.length,
      totalValueCents: rows.reduce((a, p) => a + positionValueCents(p, basis), 0),
      byAxis,
    };
  });

  const notes: string[] = [];
  if (considered.length === 0) {
    notes.push(
      scope === 'open'
        ? 'No open positions. Concentration is undefined on an empty book — that is not the same as a diversified one.'
        : 'No positions at all.',
    );
  }
  if (!opts.includeTerminal && positions.length !== considered.length) {
    notes.push(
      `${positions.length - considered.length} terminal position${positions.length - considered.length === 1 ? '' : 's'} excluded (collected, lost or cancelled): they are history, not exposure.`,
    );
  }
  if (currencies.length > 1) {
    notes.push(
      `${currencies.length} currencies present (${currencies.join(', ')}). Every axis below is computed WITHIN one currency; there is no pooled total anywhere in this response.`,
    );
  }
  if (currencies.includes('UNKNOWN')) {
    notes.push('At least one position has no currency on record and is grouped under UNKNOWN rather than assumed to be USD.');
  }
  if (basis === 'margin') {
    notes.push(
      'Basis is MARGIN, not billings: partners deliver and the founder sells and coordinates, so a client carrying 40% of revenue at 8% margin is a smaller exposure than one carrying 25% at 60%.',
    );
  }

  return {
    basis,
    asOf,
    scope,
    positionCount: considered.length,
    currencies,
    perCurrency,
    currencyMix: buildCurrencyMix(considered, basis),
    crossCurrencyTotalCents: null,
    notes,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.3 — CASH CONVERSION
 *
 * booked → accepted → deposit → invoiced → collected, with aging per currency
 * and the oldest unpaid deposit in days. "A services business dies of
 * delivered-and-never-collected, not of lost deals" (`types.ts:203`).
 *
 * TWO RULES GOVERN EVERY NUMBER BELOW.
 *
 * (1) NEVER SUM ACROSS CURRENCIES. Not once, not "for the headline", not with an
 *     asterisk. A caller who wants a group figure must supply a rate and do the
 *     conversion where the rate can be sourced and dated — which is not here.
 *
 * (2) A RATE IS SUPPRESSED BELOW `MIN_N_FOR_RATE` (`calibration.ts:243`). "67%
 *     deposit conversion" off three engagements is the single most common way a
 *     small services business talks itself into a bad decision, and the
 *     threshold already exists in this codebase for exactly that reason. The
 *     counts are always returned; only the ratio is withheld, with a stated
 *     reason.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type FunnelStage = 'booked' | 'accepted' | 'deposit' | 'invoiced' | 'collected';

export const FUNNEL_STAGES: readonly FunnelStage[] = [
  'booked', 'accepted', 'deposit', 'invoiced', 'collected',
] as const;

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  booked: 'Booked (proposal issued)',
  accepted: 'Accepted (signed)',
  deposit: 'Deposit received',
  invoiced: 'Invoiced',
  collected: 'Collected',
};

/**
 * Which engagement statuses have REACHED each stage.
 *
 * The funnel is CUMULATIVE, not a partition: an engagement at `collected` has
 * also been booked, accepted, invoiced. A partition would report zero at every
 * earlier stage and make the conversion ratios meaningless.
 *
 * `booked` starts at `proposed`, not at `draft`: a draft is a thought, and
 * counting thoughts as bookings is how a pipeline number stops meaning anything.
 * `conflict_pending` is likewise excluded — nothing has been issued to the client
 * yet (`types.ts:206`).
 *
 * `accepted` and `deposit` read the TIMESTAMP rather than the status where one
 * exists (`accepted_at:197`, `deposit_paid_at:193`), because the two are
 * genuinely independent: `0047_gps.sql` permits a deposit banked with no
 * acceptance date, and `deskSummary.gaps.depositWithoutAcceptance` already counts
 * that case. A status-only reading would report the deposit and lose the missing
 * signature.
 */
const STAGE_STATUSES: Record<FunnelStage, readonly EngagementStatus[]> = {
  booked: ['proposed', 'accepted', 'deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected'],
  accepted: ['accepted', 'deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected'],
  deposit: ['deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected'],
  invoiced: ['invoiced', 'collected'],
  collected: ['collected'],
};

function reachedStage(p: BookPosition, stage: FunnelStage): boolean {
  if (stage === 'accepted') return p.acceptedAt != null || STAGE_STATUSES.accepted.includes(p.status);
  if (stage === 'deposit') return p.depositPaidAt != null || STAGE_STATUSES.deposit.includes(p.status);
  return STAGE_STATUSES[stage].includes(p.status);
}

export interface FunnelStageCount {
  stage: FunnelStage;
  label: string;
  count: number;
  /** Value in the enclosing currency, integer cents, signed. */
  valueCents: number;
}

/**
 * One stage-to-stage conversion. `ratePct` is null — never 0 — when the
 * denominator is below `MIN_N_FOR_RATE`, and `suppressedReason` says why.
 */
export interface FunnelConversion {
  from: FunnelStage;
  to: FunnelStage;
  fromCount: number;
  toCount: number;
  ratePct: number | null;
  suppressedReason: string | null;
}

/* ── Aging ─────────────────────────────────────────────────────────────────────
 * NAMED "BRACKET" AND NOT "BUCKET", DELIBERATELY, AND DO NOT CHANGE IT BACK.
 *
 * The D2 document-store ratchet in `delivery.test.ts` refuses the token `bucket`
 * anywhere in this compartment's shared layer, because it is object-store
 * vocabulary and the whole point of that test is that the primitives for holding
 * a client's file must not exist here even by name. "Aging bracket" is the
 * standard accounts-receivable term for the same idea and collides with nothing,
 * so the ratchet stays as written — widening its pattern list is exactly what its
 * own comment forbids.
 */

export type AgingBracketKey = 'd0_7' | 'd8_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export interface AgingBracketDef {
  key: AgingBracketKey;
  label: string;
  /** Inclusive. */
  minDays: number;
  /** Inclusive. Null on the open-ended final bracket. */
  maxDays: number | null;
}

/**
 * Brackets, inclusive at BOTH ends so the boundaries are testable and there is no
 * off-by-one where a 30-day item lands in the 31-60 column. 7 is the end of the
 * first week; 30 is a month, which is where a normal payment term expires; 90 is
 * where a receivable stops being late and starts being a bad debt conversation.
 */
export const AGING_BRACKETS: readonly AgingBracketDef[] = [
  { key: 'd0_7', label: '0–7d', minDays: 0, maxDays: 7 },
  { key: 'd8_30', label: '8–30d', minDays: 8, maxDays: 30 },
  { key: 'd31_60', label: '31–60d', minDays: 31, maxDays: 60 },
  { key: 'd61_90', label: '61–90d', minDays: 61, maxDays: 90 },
  { key: 'd90_plus', label: '90d+', minDays: 91, maxDays: null },
] as const;

/**
 * The bracket for an age in days. Null for a non-finite or negative age — a
 * negative age is a row claiming a future acceptance date, which is a data fault
 * and must not be filed in the freshest bracket where nobody would ever see it.
 */
export function bracketForAgeDays(days: number): AgingBracketKey | null {
  if (!Number.isFinite(days) || days < 0) return null;
  const d = Math.floor(days);
  for (const b of AGING_BRACKETS) {
    if (d >= b.minDays && (b.maxDays == null || d <= b.maxDays)) return b.key;
  }
  return null;
}

export interface AgingBracket {
  key: AgingBracketKey;
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  /** Integer cents in the enclosing currency. */
  amountCents: number;
}

/** An aging profile for one leg of the funnel, in ONE currency. */
export interface AgingProfile {
  /** What is being aged, and from which timestamp. Stated so the figure is traceable. */
  what: string;
  anchor: string;
  currency: string;
  brackets: readonly AgingBracket[];
  count: number;
  amountCents: number;
  /** Items whose anchor timestamp was missing or in the future. Named, not dropped. */
  unaged: number;
  unagedReason: string | null;
  /** The oldest item's age in days. Null when there is nothing to age. */
  oldestDays: number | null;
}

function emptyBrackets(): AgingBracket[] {
  return AGING_BRACKETS.map((b) => ({ ...b, count: 0, amountCents: 0 }));
}

function buildAging(
  items: readonly { ageDays: number | null; amountCents: number }[],
  what: string,
  anchor: string,
  currency: string,
): AgingProfile {
  const brackets = emptyBrackets();
  let count = 0;
  let amountCents = 0;
  let unaged = 0;
  let oldestDays: number | null = null;

  for (const it of items) {
    const key = it.ageDays == null ? null : bracketForAgeDays(it.ageDays);
    if (key == null) {
      unaged += 1;
      continue;
    }
    const b = brackets.find((x) => x.key === key)!;
    b.count += 1;
    b.amountCents += cents(it.amountCents);
    count += 1;
    amountCents += cents(it.amountCents);
    if (oldestDays == null || it.ageDays! > oldestDays) oldestDays = Math.floor(it.ageDays!);
  }

  return {
    what,
    anchor,
    currency,
    brackets,
    count,
    amountCents,
    unaged,
    unagedReason:
      unaged > 0
        ? `${unaged} item${unaged === 1 ? '' : 's'} could not be aged: the ${anchor} timestamp is missing or dated in the future. Counted here rather than filed in the newest bracket.`
        : null,
    oldestDays,
  };
}

/**
 * Where a deposit stops being "in progress" and starts being a problem. A STATED
 * PRIOR, like the concentration thresholds: 30 days is one full payment cycle
 * after a signature, past which the client has had every opportunity to pay and
 * the engagement is being delivered on trust.
 */
export const AGED_DEPOSIT_ALARM_DAYS = 30;

/** Statuses where work is done or billed but cash has not landed. */
const AWAITING_COLLECTION_STATUSES: readonly EngagementStatus[] = ['delivered', 'invoiced'] as const;

export interface OldestUnpaidDeposit {
  engagementId: string;
  clientId: string;
  clientName: string | null;
  currency: string;
  /** Days since `accepted_at`. */
  days: number;
  depositRequiredCents: number;
  acceptedAt: string;
  status: EngagementStatus;
  statusLabel: string;
}

export interface CurrencyFunnel {
  currency: string;
  /** Cumulative counts and values, in `FUNNEL_STAGES` order. */
  stages: readonly FunnelStageCount[];
  /** Stage-to-stage conversion, rate suppressed below `MIN_N_FOR_RATE`. */
  conversions: readonly FunnelConversion[];
  /** Accepted, deposit not received. Aged from `accepted_at`. */
  depositAging: AgingProfile;
  /**
   * Delivered or invoiced, not collected. Aged from `invoicedAt` IF a caller could
   * supply it; `gps_engagement` has no such column, so expect everything here in
   * `unaged` until one exists.
   */
  receivableAging: AgingProfile;
  awaitingDeposit: { count: number; amountCents: number };
  awaitingCollection: { count: number; amountCents: number };
  /** `collected` only. Cash in, not bookings. */
  collectedCents: number;
  /** Non-terminal price total in this currency. What is in play. */
  openCents: number;
}

export interface CashConversion {
  asOf: string;
  positionCount: number;
  currencies: readonly string[];
  perCurrency: readonly CurrencyFunnel[];
  /** Literal null, permanently. A total true in no currency is a lie. */
  crossCurrencyTotalCents: null;
  /**
   * The oldest unpaid deposit across the whole book.
   *
   * A single global answer is legitimate here and nowhere else in this type,
   * because DAYS are currency-agnostic. Its amount travels with its own currency
   * attached so the figure can be rendered without ever being added to another.
   */
  oldestUnpaidDeposit: OldestUnpaidDeposit | null;
  /** Counts are dimensionless, so these are safe to state book-wide. */
  awaitingDepositCount: number;
  awaitingCollectionCount: number;
  /** Unpaid deposits older than `AGED_DEPOSIT_ALARM_DAYS`. */
  agedDepositCount: number;
  /** True when at least one position supplied an `invoicedAt`. */
  receivableAnchorAvailable: boolean;
  /** Why receivable aging is empty when it is. Null when the anchor exists. */
  receivableAgingRefusal: string | null;
  notes: readonly string[];
}

function buildConversions(stages: readonly FunnelStageCount[]): FunnelConversion[] {
  const out: FunnelConversion[] = [];
  for (let i = 0; i < stages.length - 1; i += 1) {
    const from = stages[i];
    const to = stages[i + 1];
    const enough = from.count >= MIN_N_FOR_RATE;
    out.push({
      from: from.stage,
      to: to.stage,
      fromCount: from.count,
      toCount: to.count,
      ratePct: enough && from.count > 0 ? pct1(to.count / from.count) : null,
      suppressedReason: enough
        ? null
        : from.count === 0
          ? `Nothing has reached ${FUNNEL_STAGE_LABELS[from.stage].toLowerCase()}, so there is no conversion to express.`
          : `${from.count} of the ${MIN_N_FOR_RATE} engagements needed before a rate is meaningful (MIN_N_FOR_RATE, calibration.ts). Counts are ${to.count}/${from.count}.`,
    });
  }
  return out;
}

/**
 * The cash funnel, per currency, with aging.
 *
 * Considers ALL positions including terminal ones — unlike `bookConcentration`,
 * which excludes them. That asymmetry is deliberate: `collected` is a terminal
 * status AND the final funnel stage, so excluding terminals would delete the
 * denominator of the only conversion anyone cares about.
 */
export function cashConversion(positions: readonly BookPosition[], asOf: string): CashConversion {
  const byCcy = new Map<string, BookPosition[]>();
  for (const p of positions) {
    const ccy = normaliseCurrency(p.currency);
    const list = byCcy.get(ccy);
    if (list) list.push(p);
    else byCcy.set(ccy, [p]);
  }

  const receivableAnchorAvailable = positions.some((p) => p.invoicedAt != null);
  const currencies = [...byCcy.keys()].sort();

  let oldest: OldestUnpaidDeposit | null = null;
  let awaitingDepositCount = 0;
  let awaitingCollectionCount = 0;
  let agedDepositCount = 0;

  const perCurrency: CurrencyFunnel[] = currencies.map((currency) => {
    const rows = byCcy.get(currency)!;

    const stages: FunnelStageCount[] = FUNNEL_STAGES.map((stage) => {
      const hit = rows.filter((p) => reachedStage(p, stage));
      return {
        stage,
        label: FUNNEL_STAGE_LABELS[stage],
        count: hit.length,
        valueCents: hit.reduce((a, p) => a + cents(p.priceCents), 0),
      };
    });

    // The deposit leg. `accepted_at IS NOT NULL AND deposit_paid_at IS NULL` is
    // the same predicate as the partial index at `0047_gps.sql:221`, so the API
    // read this powers already has an index behind it.
    const awaitingDepositRows = rows.filter(
      (p) => p.acceptedAt != null && p.depositPaidAt == null && !isTerminalEngagementStatus(p.status),
    );
    const depositAging = buildAging(
      awaitingDepositRows.map((p) => ({
        ageDays: ageInDays(p.acceptedAt, asOf),
        amountCents: p.depositRequiredCents,
      })),
      'Deposits accepted but not received',
      'accepted_at',
      currency,
    );

    const awaitingCollectionRows = rows.filter((p) => AWAITING_COLLECTION_STATUSES.includes(p.status));
    const receivableAging = buildAging(
      awaitingCollectionRows.map((p) => ({
        ageDays: ageInDays(p.invoicedAt ?? null, asOf),
        amountCents: p.priceCents,
      })),
      'Delivered or invoiced, not collected',
      'invoicedAt (not stored — see CashConversion.receivableAgingRefusal)',
      currency,
    );

    for (const p of awaitingDepositRows) {
      const days = ageInDays(p.acceptedAt, asOf);
      if (days == null) continue;
      if (days > AGED_DEPOSIT_ALARM_DAYS) agedDepositCount += 1;
      if (oldest == null || days > oldest.days) {
        oldest = {
          engagementId: p.engagementId,
          clientId: p.clientId,
          clientName: p.clientName,
          currency,
          days,
          depositRequiredCents: cents(p.depositRequiredCents),
          acceptedAt: p.acceptedAt!,
          status: p.status,
          statusLabel: ENGAGEMENT_STATUS_LABELS[p.status],
        };
      }
    }
    awaitingDepositCount += awaitingDepositRows.length;
    awaitingCollectionCount += awaitingCollectionRows.length;

    return {
      currency,
      stages,
      conversions: buildConversions(stages),
      depositAging,
      receivableAging,
      awaitingDeposit: {
        count: awaitingDepositRows.length,
        amountCents: awaitingDepositRows.reduce((a, p) => a + cents(p.depositRequiredCents), 0),
      },
      awaitingCollection: {
        count: awaitingCollectionRows.length,
        amountCents: awaitingCollectionRows.reduce((a, p) => a + cents(p.priceCents), 0),
      },
      collectedCents: rows
        .filter((p) => p.status === 'collected')
        .reduce((a, p) => a + cents(p.priceCents), 0),
      openCents: rows.filter(isOpenPosition).reduce((a, p) => a + cents(p.priceCents), 0),
    };
  });

  const notes: string[] = [];
  if (currencies.length > 1) {
    notes.push(
      `${currencies.length} currencies (${currencies.join(', ')}). Every amount below belongs to exactly one of them and none are added together.`,
    );
  }
  if (!receivableAnchorAvailable && awaitingCollectionCount > 0) {
    notes.push(
      `${awaitingCollectionCount} engagement${awaitingCollectionCount === 1 ? ' is' : 's are'} delivered or invoiced and uncollected, and NONE can be aged.`,
    );
  }

  return {
    asOf,
    positionCount: positions.length,
    currencies,
    perCurrency,
    crossCurrencyTotalCents: null,
    oldestUnpaidDeposit: oldest,
    awaitingDepositCount,
    awaitingCollectionCount,
    agedDepositCount,
    receivableAnchorAvailable,
    receivableAgingRefusal: receivableAnchorAvailable
      ? null
      : 'Receivable age cannot be computed: `gps_engagement` has no `invoiced_at` column (0047_gps.sql stores only deposit_paid_at:193, accepted_at:197, created_at:199, updated_at:200). `updated_at` is NOT used as a substitute — it moves on any edit, so a receivable would appear to get younger every time someone corrected a typo. Reported as unknown rather than approximated.',
    notes,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.2 — THE BINDING CONSTRAINT
 *
 * The most important function in this module. "Not a gauge — a REASON"
 * (`GPS_100X_PLAN.md` §2, 6.2).
 *
 * A utilisation percentage tells you a number is high. It does not tell you what
 * to do, and in a one-seller partner-delivered business the answer is almost
 * always a specific thing: hire a second partner, chase one client, or go and
 * sell. So this returns the NAMED constraint, its reason, its evidence, and —
 * critically for D2 — every constraint it considered and did not choose, with why
 * not. A ranking that only shows the winner is a ranking you cannot audit.
 *
 * IT MUST BE ABLE TO SAY "NOTHING IS LIMITING YOU, YOU ARE SIMPLY NOT SELLING."
 * That is the `demand` code, and it is the whole reason the function is not
 * called `capacityUtilisation`.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type ConstraintCode =
  | 'unstaffable_offers'
  | 'bench_capacity'
  | 'coordination_hours'
  | 'cash_collection'
  | 'quotability'
  | 'demand'
  | 'none'
  | 'insufficient_data';

export const CONSTRAINT_LABEL: Record<ConstraintCode, string> = {
  unstaffable_offers: 'No bench to deliver on',
  bench_capacity: 'Bench capacity',
  coordination_hours: 'His own coordination hours',
  cash_collection: 'Cash collection',
  quotability: 'Cannot quote a real price',
  demand: 'Demand',
  none: 'Nothing is binding',
  insufficient_data: 'Cannot be determined',
};

/**
 * The precedence in which constraints are tested. THE FIRST ONE THAT BINDS WINS,
 * so this order is a design decision and is justified here rather than left to be
 * inferred from the array.
 *
 * The ordering is by HOW HARD THE WALL IS — how long relief takes and whether he
 * can grant it himself — not by where the constraint sits in the sales sequence.
 * A constraint he can clear this afternoon is not what is limiting the book, even
 * if it comes first chronologically.
 *
 *  1 `unstaffable_offers` — no offer names a delivering partner at all. Weeks of
 *    recruitment, and it invalidates the business model rather than throttling it:
 *    partners deliver, he sells and coordinates.
 *  2 `bench_capacity`     — partners exist and have no spare slot. Also weeks.
 *  3 `coordination_hours` — his own ceiling. Cannot be bought at any price; he has
 *    a full-time job. Relievable only by descoping.
 *  4 `cash_collection`    — a client owes a deposit that funds a partner. Days,
 *    and he can act on it directly by chasing.
 *  5 `quotability`        — price bands are placeholders / a decision blocks a real
 *    price. RANKED LAST OF THE REAL CONSTRAINTS ON PURPOSE: this blocks the
 *    INSTRUMENT, not the business. He has sold ~$250k of these engagements
 *    manually without it, so calling it "the thing limiting the book" would be
 *    the tool flattering itself.
 *  6 `demand`             — nothing on the supply side binds and nothing is in the
 *    pipeline.
 */
export const CONSTRAINT_PRECEDENCE: readonly ConstraintCode[] = [
  'unstaffable_offers', 'bench_capacity', 'coordination_hours', 'cash_collection', 'quotability', 'demand',
] as const;

/** One figure behind a verdict, with where it came from. D1. */
export interface ConstraintEvidence {
  label: string;
  /** Pre-formatted for display — the engine knows the unit, the surface does not. */
  value: string;
  /** The function or column that produced it, so it can be opened. */
  source: string;
}

/** One candidate constraint, tested. Returned whether it bound or not (D2). */
export interface ConstraintCheck {
  code: ConstraintCode;
  label: string;
  binds: boolean;
  /** False when an input was null, so "did not bind" would be a false negative. */
  evaluable: boolean;
  /** Why it bound, or why it did not, or why it could not be tested. */
  reason: string;
}

export interface BindingConstraint {
  code: ConstraintCode;
  label: string;
  /** One sentence, safe to render verbatim. Names WHAT and WHY. */
  reason: string;
  /** What would relieve it. Null only when nothing binds. */
  remedy: string | null;
  evidence: readonly ConstraintEvidence[];
  /** Every candidate in precedence order, bound or not. The audit trail. */
  considered: readonly ConstraintCheck[];
  /** Checks that could not be run because an input was null. */
  unevaluable: readonly ConstraintCode[];
  /**
   * ICD-203 analytic confidence in the VERDICT, sitting beside it and never
   * inside it (D3). Derived from how many checks were evaluable and how many
   * placeholder inputs were load-bearing — a real mechanism, not a mood.
   */
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  confidenceBasis: string;
}

/**
 * Inputs, deliberately narrow scalars rather than the engine objects.
 *
 * `benchHeadroom()` (`partners.ts`) and `wipLoad()` (`delivery.ts`) are consumed
 * by the API layer, which reduces them to the four numbers below before calling
 * here. That keeps this module free of a dependency on the partner bench's own
 * shape — and more importantly it makes every input NULLABLE, so "the bench has
 * no headroom" and "nobody has told us about the bench" are different answers
 * instead of both arriving as 0.
 */
export interface BindingConstraintInput {
  /** `BenchHeadroom.totalSpareSlots`. Null when the bench is unknown. */
  benchSpareSlots: number | null;
  /** Offers whose `partnerOwner` is non-null. 0 for all five today (D5). */
  offersWithNamedPartner: number | null;
  /** `WipLoad.unstaffable` — active engagements on an offer with no partner. */
  unstaffableActive: number | null;
  /** `WipLoad.coordinationHoursPerWeek`. */
  coordinationHoursPerWeek: number | null;
  /** `WipLoad.capacityHoursPerWeek`. */
  capacityHoursPerWeek: number | null;
  /** `WipLoad.usesPlaceholderHours` — lowers confidence, never the verdict. */
  coordinationHoursArePlaceholders: boolean;
  cash: CashConversion;
  /**
   * Non-terminal engagements not yet accepted: what could still become revenue.
   * Zero here with a clear supply side is the "you are not selling" verdict.
   */
  liveOpportunities: number | null;
  /** `CATALOGUE_TODOS.filter(t => t.blocksQuoting).length`. */
  blockingQuotingDecisions: number;
  /** `PRICE_BANDS_ARE_PLACEHOLDERS`. */
  priceBandsArePlaceholders: boolean;
}

/** Formats an integer-cent amount with its currency. Never pools. */
function money(cts: number, currency: string): string {
  const sign = cts < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cts));
  return `${sign}${currency} ${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Name what is actually limiting the book right now, and why.
 *
 * Pure. Every candidate is tested and returned; the first that binds in
 * `CONSTRAINT_PRECEDENCE` is the verdict. A check whose input is null is marked
 * `evaluable: false` and CANNOT bind — reporting "the bench has headroom" from a
 * null would be the silent default D2 exists to forbid.
 */
export function bindingConstraint(input: BindingConstraintInput): BindingConstraint {
  const {
    benchSpareSlots, offersWithNamedPartner, unstaffableActive,
    coordinationHoursPerWeek, capacityHoursPerWeek, coordinationHoursArePlaceholders,
    cash, liveOpportunities, blockingQuotingDecisions, priceBandsArePlaceholders,
  } = input;

  const oldest = cash.oldestUnpaidDeposit;
  const checks: ConstraintCheck[] = [];

  /* 1 — unstaffable_offers. The business model, not a throttle. */
  if (offersWithNamedPartner == null) {
    checks.push({
      code: 'unstaffable_offers', label: CONSTRAINT_LABEL.unstaffable_offers, binds: false, evaluable: false,
      reason: 'Not tested: nobody supplied how many offers name a delivering partner.',
    });
  } else if (offersWithNamedPartner === 0) {
    checks.push({
      code: 'unstaffable_offers', label: CONSTRAINT_LABEL.unstaffable_offers, binds: true, evaluable: true,
      reason:
        'No offer in the catalogue names a delivering partner, so every engagement sold is one he delivers himself. ' +
        'The model is that partners deliver and he sells and coordinates; without a bench there is nothing to coordinate.' +
        (unstaffableActive && unstaffableActive > 0
          ? ` ${unstaffableActive} engagement${unstaffableActive === 1 ? ' is' : 's are'} already sold in that state.`
          : ''),
    });
  } else if (unstaffableActive != null && unstaffableActive > 0) {
    checks.push({
      code: 'unstaffable_offers', label: CONSTRAINT_LABEL.unstaffable_offers, binds: true, evaluable: true,
      reason:
        `${unstaffableActive} active engagement${unstaffableActive === 1 ? '' : 's'} sit on an offer with no named partner. ` +
        'They consume nobody\'s bench slot, which is exactly why they are dangerous: invisible to the capacity arithmetic and delivered by him.',
    });
  } else {
    checks.push({
      code: 'unstaffable_offers', label: CONSTRAINT_LABEL.unstaffable_offers, binds: false, evaluable: true,
      reason: `${offersWithNamedPartner} offer${offersWithNamedPartner === 1 ? '' : 's'} name a delivering partner and no active engagement is unstaffable.`,
    });
  }

  /* 2 — bench_capacity. */
  if (benchSpareSlots == null) {
    checks.push({
      code: 'bench_capacity', label: CONSTRAINT_LABEL.bench_capacity, binds: false, evaluable: false,
      reason: 'Not tested: bench headroom was not supplied (benchHeadroom(), partners.ts).',
    });
  } else if (benchSpareSlots <= 0) {
    checks.push({
      code: 'bench_capacity', label: CONSTRAINT_LABEL.bench_capacity, binds: true, evaluable: true,
      reason:
        'Zero spare slots across the whole bench. The next engagement cannot be staffed by anyone currently on it, ' +
        'whatever the offer — bench depth per offer IS the concurrency cap on this business.',
    });
  } else {
    checks.push({
      code: 'bench_capacity', label: CONSTRAINT_LABEL.bench_capacity, binds: false, evaluable: true,
      reason: `${benchSpareSlots} spare slot${benchSpareSlots === 1 ? '' : 's'} across the bench. Note this is NOT the sum of the per-offer figures (BenchHeadroom.totalSpareSlots).`,
    });
  }

  /* 3 — coordination_hours. His own ceiling; cannot be bought. */
  if (coordinationHoursPerWeek == null || capacityHoursPerWeek == null || capacityHoursPerWeek <= 0) {
    checks.push({
      code: 'coordination_hours', label: CONSTRAINT_LABEL.coordination_hours, binds: false, evaluable: false,
      reason: 'Not tested: coordination load or weekly capacity was not supplied (wipLoad(), delivery.ts).',
    });
  } else if (coordinationHoursPerWeek >= capacityHoursPerWeek) {
    checks.push({
      code: 'coordination_hours', label: CONSTRAINT_LABEL.coordination_hours, binds: true, evaluable: true,
      reason:
        `Coordination load is ${coordinationHoursPerWeek}h/week against a ${capacityHoursPerWeek}h ceiling. ` +
        'He sells and coordinates around a full-time job, so this is the one constraint no amount of money relieves — only descoping does.' +
        (coordinationHoursArePlaceholders ? ' The hours are placeholders, so treat the crossing point as indicative.' : ''),
    });
  } else {
    checks.push({
      code: 'coordination_hours', label: CONSTRAINT_LABEL.coordination_hours, binds: false, evaluable: true,
      reason: `${coordinationHoursPerWeek}h/week of coordination against a ${capacityHoursPerWeek}h ceiling — ${capacityHoursPerWeek - coordinationHoursPerWeek}h spare.`,
    });
  }

  /* 4 — cash_collection. A deposit funds a partner; unpaid, nothing starts. */
  if (cash.agedDepositCount > 0 && oldest != null) {
    checks.push({
      code: 'cash_collection', label: CONSTRAINT_LABEL.cash_collection, binds: true, evaluable: true,
      reason:
        `${cash.agedDepositCount} accepted engagement${cash.agedDepositCount === 1 ? '' : 's'} ${cash.agedDepositCount === 1 ? 'has' : 'have'} an unpaid deposit older than ${AGED_DEPOSIT_ALARM_DAYS} days; the oldest is ` +
        `${oldest.days} days (${oldest.clientName ?? oldest.clientId}, ${money(oldest.depositRequiredCents, oldest.currency)}). ` +
        'A deposit is what commits a partner, so unpaid deposits stop delivery starting rather than merely delaying revenue.',
    });
  } else if (oldest != null) {
    checks.push({
      code: 'cash_collection', label: CONSTRAINT_LABEL.cash_collection, binds: false, evaluable: true,
      reason: `Oldest unpaid deposit is ${oldest.days} days (${money(oldest.depositRequiredCents, oldest.currency)}), inside the ${AGED_DEPOSIT_ALARM_DAYS}-day threshold.`,
    });
  } else {
    checks.push({
      code: 'cash_collection', label: CONSTRAINT_LABEL.cash_collection, binds: false, evaluable: true,
      reason: 'No accepted engagement is waiting on a deposit.',
    });
  }

  /* 5 — quotability. Blocks the instrument, not the sale. See CONSTRAINT_PRECEDENCE. */
  if (blockingQuotingDecisions > 0 || priceBandsArePlaceholders) {
    checks.push({
      code: 'quotability', label: CONSTRAINT_LABEL.quotability, binds: true, evaluable: true,
      reason:
        (priceBandsArePlaceholders ? 'Every price band in the catalogue is a placeholder' : 'A catalogue decision is outstanding') +
        (blockingQuotingDecisions > 0 ? ` and ${blockingQuotingDecisions} decision${blockingQuotingDecisions === 1 ? '' : 's'} block${blockingQuotingDecisions === 1 ? 's' : ''} a real quote` : '') +
        ', so no proposal can be issued from this system at a number anyone would honour. ' +
        'Ranked below the capacity and cash constraints because it blocks the instrument, not the business — these engagements have been sold manually without it.',
    });
  } else {
    checks.push({
      code: 'quotability', label: CONSTRAINT_LABEL.quotability, binds: false, evaluable: true,
      reason: 'Price bands are real and no catalogue decision blocks a quote.',
    });
  }

  /* 6 — demand. The verdict this function exists to be able to reach. */
  if (liveOpportunities == null) {
    checks.push({
      code: 'demand', label: CONSTRAINT_LABEL.demand, binds: false, evaluable: false,
      reason: 'Not tested: the count of live, not-yet-accepted engagements was not supplied.',
    });
  } else if (liveOpportunities === 0) {
    checks.push({
      code: 'demand', label: CONSTRAINT_LABEL.demand, binds: true, evaluable: true,
      reason:
        'Nothing is limiting you — you are simply not selling. Nothing on the supply side binds and there is not one ' +
        'live opportunity that has yet to be accepted, so no amount of capacity, cash or bench changes the next number on this screen.',
    });
  } else {
    checks.push({
      code: 'demand', label: CONSTRAINT_LABEL.demand, binds: false, evaluable: true,
      reason: `${liveOpportunities} live opportunit${liveOpportunities === 1 ? 'y' : 'ies'} not yet accepted.`,
    });
  }

  const ordered = CONSTRAINT_PRECEDENCE.map((code) => checks.find((c) => c.code === code)!);
  const unevaluable = ordered.filter((c) => !c.evaluable).map((c) => c.code);
  const winner = ordered.find((c) => c.binds) ?? null;

  const openAssumptions =
    (coordinationHoursArePlaceholders ? 1 : 0) +
    (priceBandsArePlaceholders ? 1 : 0) +
    (cash.receivableAnchorAvailable ? 0 : 1);
  const evaluableCount = ordered.length - unevaluable.length;
  const confidence = estimativeConfidence({
    sampleSize: evaluableCount,
    meanConfidence: Math.round((evaluableCount / ordered.length) * 100),
    openAssumptions,
  });

  // Nothing bound, but a check could not run: say so rather than declaring the
  // book unconstrained on the strength of the checks that happened to have data.
  const code: ConstraintCode = winner ? winner.code : unevaluable.length > 0 ? 'insufficient_data' : 'none';

  const reason =
    winner?.reason ??
    (code === 'insufficient_data'
      ? `No constraint bound, but ${unevaluable.length} of ${ordered.length} checks could not run (${unevaluable.join(', ')}). "Unconstrained" is not a conclusion this data supports.`
      : 'Capacity, cash, bench and quotability all have headroom and there is live demand. What limits the book right now is execution, not the book.');

  const remedy = winner ? CONSTRAINT_REMEDY[winner.code] : null;

  const evidence: ConstraintEvidence[] = [
    { label: 'Bench spare slots', value: benchSpareSlots == null ? 'not supplied' : String(benchSpareSlots), source: 'benchHeadroom().totalSpareSlots — partners.ts' },
    { label: 'Offers with a named partner', value: offersWithNamedPartner == null ? 'not supplied' : `${offersWithNamedPartner}`, source: 'ServiceOffer.partnerOwner — catalogue.ts' },
    { label: 'Unstaffable active engagements', value: unstaffableActive == null ? 'not supplied' : String(unstaffableActive), source: 'wipLoad().unstaffable — delivery.ts' },
    {
      label: 'Coordination load',
      value: coordinationHoursPerWeek == null || capacityHoursPerWeek == null
        ? 'not supplied'
        : `${coordinationHoursPerWeek}h / ${capacityHoursPerWeek}h per week${coordinationHoursArePlaceholders ? ' (placeholder hours)' : ''}`,
      source: 'wipLoad() — delivery.ts',
    },
    { label: 'Deposits unpaid', value: `${cash.awaitingDepositCount} (${cash.agedDepositCount} over ${AGED_DEPOSIT_ALARM_DAYS}d)`, source: 'cashConversion() — accepted_at, 0047_gps.sql:221' },
    { label: 'Oldest unpaid deposit', value: oldest == null ? 'none' : `${oldest.days}d · ${money(oldest.depositRequiredCents, oldest.currency)}`, source: 'cashConversion().oldestUnpaidDeposit' },
    { label: 'Live opportunities', value: liveOpportunities == null ? 'not supplied' : String(liveOpportunities), source: 'non-terminal engagements with accepted_at IS NULL' },
    { label: 'Blocking quote decisions', value: `${blockingQuotingDecisions}${priceBandsArePlaceholders ? ' · price bands are placeholders' : ''}`, source: 'CATALOGUE_TODOS — catalogue.ts' },
  ];

  return {
    code,
    label: CONSTRAINT_LABEL[code],
    reason,
    remedy,
    evidence,
    considered: ordered,
    unevaluable,
    confidence,
    confidenceLabel: CONFIDENCE_LABEL[confidence],
    confidenceBasis:
      `${evaluableCount} of ${ordered.length} constraint checks had the data to run; ` +
      `${openAssumptions} placeholder input${openAssumptions === 1 ? '' : 's'} in force. ` +
      'Confidence is reported beside the verdict and never folded into it.',
  };
}

/** What relieves each constraint. Named, because a verdict without a next action is a gauge. */
const CONSTRAINT_REMEDY: Record<ConstraintCode, string | null> = {
  unstaffable_offers: 'Name a delivering partner per offer (decision D5). Until then every sale is his own delivery capacity, not the bench\'s.',
  bench_capacity: 'Add bench depth on the offers that are selling, or stop selling those offers. Nothing else moves this number.',
  coordination_hours: 'Reduce scope, sequence engagements rather than running them concurrently, or push coordination onto the partner via acceptance criteria.',
  cash_collection: 'Chase the named deposit. It is one conversation, and it is what commits the partner.',
  quotability: 'Supply real price bands per offer (decision D4). An hour of the founder\'s time clears this.',
  demand: 'Sell. Originate targets — the ranked queue exists (rankTargets(), targeting.ts) and has no surface yet.',
  none: null,
  insufficient_data: 'Supply the missing inputs listed in `unevaluable` before treating the book as unconstrained.',
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 6 — BOOK HEALTH. A composed verdict with an attributable trail.
 *
 * D1: every point in the score is a `Driver`, and the drivers SUM TO THE SCORE
 * exactly. That is a test, not an aspiration — a capped or normalised total is a
 * number you cannot open, and "traceable" then means "we showed you some
 * numbers that nearly add up".
 *
 * D3: confidence sits BESIDE the score. It is never multiplied into it. See the
 * file header for why (`alpha.ts:230` does the opposite and this module
 * deliberately does not follow it).
 * ═══════════════════════════════════════════════════════════════════════════ */

export type BookHealthGrade = 'healthy' | 'watch' | 'strained' | 'critical';

export const BOOK_HEALTH_GRADE_LABEL: Record<BookHealthGrade, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  strained: 'Strained',
  critical: 'Critical',
};

/** Grade floors, inclusive. A stated prior, reviewed by a human. */
export const BOOK_HEALTH_BANDS: readonly { grade: BookHealthGrade; minScore: number }[] = [
  { grade: 'healthy', minScore: 80 },
  { grade: 'watch', minScore: 60 },
  { grade: 'strained', minScore: 35 },
  { grade: 'critical', minScore: 0 },
] as const;

export function bookHealthGrade(score: number): BookHealthGrade {
  return (BOOK_HEALTH_BANDS.find((b) => score >= b.minScore) ?? BOOK_HEALTH_BANDS[BOOK_HEALTH_BANDS.length - 1]).grade;
}

/**
 * Per-axis weight of the concentration penalty, summing to 30 of the 100 points.
 *
 * Weighted rather than capped so the drivers still sum to the score (D1). The
 * ordering is the business: losing a CLIENT removes revenue directly; losing a
 * PARTNER removes the ability to deliver what is already sold, which is worse per
 * unit but partially substitutable; OFFER concentration is demand risk and moves
 * over quarters; JURISDICTION is the slowest-moving of the four.
 */
export const CONCENTRATION_PENALTY_WEIGHTS: Record<ValueAxis, number> = {
  client: 12,
  partner: 10,
  offer: 5,
  jurisdiction: 3,
};

/**
 * A book behaving like three or more equal holders takes no penalty; a
 * single-holder book takes the full weight. `1/3` is the floor because three
 * counterparties is the point at which any one of them leaving is survivable.
 */
const CONCENTRATION_TOLERANCE_HHI = 1 / 3;

function concentrationSeverity(hhi: number): number {
  const s = (hhi - CONCENTRATION_TOLERANCE_HHI) / (1 - CONCENTRATION_TOLERANCE_HHI);
  return Math.max(0, Math.min(1, s));
}

/** Deductions charged to the binding constraint, EXCLUDING cash (charged once, below). */
const CONSTRAINT_PENALTY: Record<ConstraintCode, number> = {
  unstaffable_offers: 25,
  bench_capacity: 20,
  coordination_hours: 15,
  cash_collection: 0, // already charged by the aged-deposit driver; never twice.
  quotability: 5,
  demand: 20,
  none: 0,
  insufficient_data: 0, // an evidence gap, so it moves confidence and not the score.
};

export interface BookHealthInput {
  positions: readonly BookPosition[];
  concentration: BookConcentration;
  cash: CashConversion;
  constraint: BindingConstraint;
  /**
   * Realised deposit-collection history, if any exists — `collected` of `total`
   * accepted engagements that eventually paid.
   *
   * The ONLY route by which an ICD-203 likelihood term reaches this response. With
   * no history, `collectionOutlook` is null and `collectionOutlookRefusal` says
   * why: attaching "likely" to a measured share, or to a base rate nobody has
   * observed, is precisely the invented precision `estimative.ts` exists to
   * prevent (D8 — no claim without a mechanism).
   */
  collectionHistory?: { collected: number; total: number } | null;
}

export interface BookHealth {
  /** 0–100. The drivers sum to exactly this. */
  score: number;
  /**
   * The range the score would occupy once unattributed positions are attributed.
   * `low` is the worst reading, `high` the best — a band, not a point, on the one
   * decision-bearing number this module emits (D3).
   */
  scoreBand: { low: number; high: number; isPoint: boolean; basis: string };
  grade: BookHealthGrade;
  gradeLabel: string;
  /** Signed contributions, in points, largest magnitude first. `alpha.ts:41` shape. */
  drivers: Driver[];
  /** Beside the score, never inside it. */
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  confidenceBasis: string;
  binding: BindingConstraint;
  /** ICD-203 likelihood, only when a realised base rate was supplied. */
  collectionOutlook: {
    claim: string;
    likelihood: Likelihood;
    phrase: string;
    sampleSize: number;
    confidence: ConfidenceLevel;
  } | null;
  collectionOutlookRefusal: string | null;
  /** Plain language, most important first. Safe to render verbatim. */
  statements: readonly string[];
  headline: string;
}

/**
 * The axis reading that carries the book's risk: the currency holding the most
 * attributed value on that axis. Concentration inside a currency worth $2,000
 * beside one worth $200,000 is not the book's exposure, and picking the highest
 * index regardless of size would report exactly that.
 */
function dominantAxisReading(c: BookConcentration, axis: ValueAxis): AxisConcentration | null {
  let best: AxisConcentration | null = null;
  for (const ccy of c.perCurrency) {
    const a = ccy.byAxis[axis];
    if (best == null || a.attributedPositiveCents > best.attributedPositiveCents) best = a;
  }
  return best;
}

/**
 * The composed verdict.
 *
 * Pure. Starts at 100 — "a book with no observed problem" — and charges signed
 * deductions, each one a `Driver` naming what it is and what it cost. The score
 * is therefore reconstructable from the trail by addition, which is the whole of
 * D1 in one property.
 */
export function bookHealth(input: BookHealthInput): BookHealth {
  const { positions, concentration, cash, constraint } = input;
  const drivers: Driver[] = [{ label: 'Base (no observed problem)', points: 100 }];
  const statements: string[] = [];

  // ── Concentration, one driver per axis, plus the band mechanism ───────────
  // Deductions are accumulated explicitly rather than re-derived from the driver
  // labels afterwards: a band computed by string-matching its own output is a bug
  // waiting for someone to reword a label.
  let concentrationDeduction = 0;
  let otherDeduction = 0;
  let bandLowDeduction = 0;   // worst case: unattributed all behind one holder
  let bandHighDeduction = 0;  // best case: unattributed all distinct
  let bandIsPoint = true;
  const bandReasons: string[] = [];

  for (const axis of VALUE_AXES) {
    const reading = dominantAxisReading(concentration, axis);
    const weight = CONCENTRATION_PENALTY_WEIGHTS[axis];
    if (!reading || reading.hhi == null) {
      // Not measurable. Charge nothing — an unknown is not a problem — and say so
      // rather than letting a silent zero read as a clean bill of health (D2).
      drivers.push({ label: `${AXIS_LABEL[axis]} concentration — not measurable`, points: 0 });
      if (reading && reading.unattributedPositions > 0) {
        statements.push(
          `${AXIS_LABEL[axis]} concentration cannot be measured: ${reading.notes[0] ?? 'no attributed value on this axis'}`,
        );
        bandIsPoint = false;
        if (reading.band) {
          bandLowDeduction += Math.round(concentrationSeverity(reading.band.high) * weight);
          bandHighDeduction += Math.round(concentrationSeverity(reading.band.low) * weight);
          bandReasons.push(`${AXIS_LABEL[axis].toLowerCase()} unattributed`);
        }
      }
      continue;
    }
    const points = deduct(Math.round(concentrationSeverity(reading.hhi) * weight));
    concentrationDeduction += -points;
    drivers.push({
      label:
        reading.dominant
          ? `${AXIS_LABEL[axis]} concentration — ${reading.dominant.label} at ${reading.dominant.sharePct}% of ${reading.currency} ${concentration.basis}`
          : `${AXIS_LABEL[axis]} concentration`,
      points,
    });
    if (reading.band && !reading.band.isPoint) {
      bandIsPoint = false;
      bandLowDeduction += Math.round(concentrationSeverity(reading.band.high) * weight);
      bandHighDeduction += Math.round(concentrationSeverity(reading.band.low) * weight);
      bandReasons.push(`${AXIS_LABEL[axis].toLowerCase()} unattributed`);
    } else {
      bandLowDeduction += -points;
      bandHighDeduction += -points;
    }
    if (reading.dominant && reading.dominant.sharePct >= SINGLE_HOLDER_WATCH_SHARE_PCT) {
      statements.push(reading.headline);
    }
  }

  // ── Cash. Charged once, here; `cash_collection` scores 0 in CONSTRAINT_PENALTY. ──
  const oldest = cash.oldestUnpaidDeposit;
  if (cash.agedDepositCount > 0) {
    // 8 points per aged deposit, capped at 20 — a second aged deposit is a pattern,
    // a fifth is not five times worse than a first, it is the same conversation.
    const points = deduct(Math.min(20, cash.agedDepositCount * 8));
    otherDeduction += -points;
    drivers.push({
      label: `${cash.agedDepositCount} deposit${cash.agedDepositCount === 1 ? '' : 's'} unpaid beyond ${AGED_DEPOSIT_ALARM_DAYS}d${oldest ? ` (oldest ${oldest.days}d)` : ''}`,
      points,
    });
    if (oldest) {
      statements.push(
        `${oldest.clientName ?? oldest.clientId} accepted ${oldest.days} days ago and has not paid the ${money(oldest.depositRequiredCents, oldest.currency)} deposit. A deposit is what commits a partner, so this is delivery blocked, not just revenue late.`,
      );
    }
  } else {
    drivers.push({ label: 'No aged unpaid deposits', points: 0 });
  }

  // ── Realised losses. A position sold below cost is not a concentration issue. ──
  const negativeMargin = positions.filter(
    (p) => isOpenPosition(p) && marginCents(cents(p.priceCents), cents(p.vendorCostCents)) < 0,
  );
  if (negativeMargin.length > 0) {
    const points = deduct(Math.min(20, negativeMargin.length * 7));
    otherDeduction += -points;
    drivers.push({
      label: `${negativeMargin.length} open position${negativeMargin.length === 1 ? '' : 's'} quoted below vendor cost`,
      points,
    });
    statements.push(
      `${negativeMargin.length} open engagement${negativeMargin.length === 1 ? ' is' : 's are'} priced below what the partner is expected to cost. At $10–25k an engagement there is no volume that fixes that.`,
    );
  }

  // ── The binding constraint. ───────────────────────────────────────────────
  const constraintPenalty = CONSTRAINT_PENALTY[constraint.code];
  otherDeduction += constraintPenalty;
  drivers.push({
    label: `Binding constraint — ${constraint.label}`,
    points: deduct(constraintPenalty),
  });
  statements.push(constraint.reason);

  // The drivers sum to the score by construction, and `clamp` is where that
  // guarantee could quietly break — so the assertion is a test, not a comment
  // (`book.test.ts`, "drivers sum to the score").
  const raw = 100 - concentrationDeduction - otherDeduction;
  const score = Math.max(0, Math.min(100, raw));

  // The band shares the base and every non-concentration deduction with the score;
  // only the concentration term moves, because unattributed positions are the only
  // thing the band is about.
  const bandLow = Math.max(0, Math.min(100, 100 - otherDeduction - bandLowDeduction));
  const bandHigh = Math.max(0, Math.min(100, 100 - otherDeduction - bandHighDeduction));

  // ── Confidence: a mechanism, stated. ─────────────────────────────────────
  const measurableAxes = VALUE_AXES.map((a) => dominantAxisReading(concentration, a)).filter(
    (a): a is AxisConcentration => a != null && a.hhi != null,
  );
  const meanCoverage =
    measurableAxes.length > 0
      ? Math.round(measurableAxes.reduce((a, x) => a + (x.coveragePct ?? 0), 0) / measurableAxes.length)
      : 0;
  const openAssumptions =
    (cash.receivableAnchorAvailable ? 0 : 1) +
    (constraint.unevaluable.length > 0 ? 1 : 0) +
    (measurableAxes.length < VALUE_AXES.length ? 1 : 0);
  const confidence = estimativeConfidence({
    sampleSize: concentration.positionCount,
    meanConfidence: meanCoverage,
    openAssumptions,
  });

  // ── The one place an ICD-203 likelihood is permitted. ─────────────────────
  const hist = input.collectionHistory ?? null;
  const collectionOutlook =
    hist && hist.total > 0
      ? (() => {
          const l = likelihood(hist.collected / hist.total);
          const c = estimativeConfidence({ sampleSize: hist.total, meanConfidence: 100, openAssumptions: 0 });
          return {
            claim: 'An accepted engagement\'s deposit is eventually collected',
            likelihood: l,
            phrase: `${l.term.charAt(0).toUpperCase()}${l.term.slice(1)} (${l.pct}%) · ${CONFIDENCE_LABEL[c]} · n=${hist.total}`,
            sampleSize: hist.total,
            confidence: c,
          };
        })()
      : null;

  if (cash.receivableAgingRefusal) statements.push(cash.receivableAgingRefusal);
  for (const n of concentration.notes) statements.push(n);

  const grade = bookHealthGrade(score);
  const headline =
    concentration.positionCount === 0
      ? 'No open positions. There is no book to underwrite yet — this is an empty screen, not a healthy one.'
      : `${BOOK_HEALTH_GRADE_LABEL[grade]} (${score}/100, ${bandIsPoint ? 'measured' : `${bandLow}–${bandHigh} once attribution lands`}) · ${CONFIDENCE_LABEL[confidence]} · binding constraint: ${constraint.label}`;

  return {
    score,
    scoreBand: {
      low: Math.min(bandLow, bandHigh),
      high: Math.max(bandLow, bandHigh),
      isPoint: bandIsPoint,
      basis: bandIsPoint
        ? 'Every axis is fully attributed; the score is a measurement, not a range.'
        : `Range driven by unattributed positions (${[...new Set(bandReasons)].join(', ')}). Low assumes each unattributed position is behind one unseen holder; high assumes each is distinct.`,
    },
    grade,
    gradeLabel: BOOK_HEALTH_GRADE_LABEL[grade],
    drivers: [...drivers].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    confidence,
    confidenceLabel: CONFIDENCE_LABEL[confidence],
    confidenceBasis:
      `${concentration.positionCount} position${concentration.positionCount === 1 ? '' : 's'}; ` +
      `${measurableAxes.length} of ${VALUE_AXES.length} axes measurable at ${meanCoverage}% mean attribution; ` +
      `${openAssumptions} open assumption${openAssumptions === 1 ? '' : 's'}. Confidence never multiplies the score.`,
    binding: constraint,
    collectionOutlook,
    collectionOutlookRefusal: collectionOutlook
      ? null
      : 'No realised collection history was supplied, so no likelihood term is stated. There is no outcome table in the schema (0047_gps.sql creates gps_client, gps_engagement and gps_conflict_check only), and attaching an ICD-203 term to a base rate nobody has observed would be invented precision.',
    statements,
    headline,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WIRE TYPES — the ONE declaration of the /gps/book response.
 *
 * `apps/api` RETURNS `BookResponse`. `apps/web` IMPORTS `BookResponse`. Neither
 * declares its own copy, and `apps/web/src/lib/api/*` must not restate a single
 * field of it. The rule exists because it has already been broken: the web
 * declared `counts` / `clientCount` / `openValueCents` on a GPS summary, the API
 * never returned them, `tsc` type-checked the fiction, the mocked page test
 * agreed with the fiction, and the page crashed the moment migrations landed.
 *
 * A future slice that needs another field (6.5's worklist, for instance) ADDS IT
 * HERE. Adding it to a web-side interface reproduces the outage.
 *
 * Every field is nullable exactly where the data may be absent. `migrated:
 * false` is a first-class state, not an error: GPS's migrations (0047/0049) are
 * not applied on prod, so the honest response is "the compartment exists and has
 * no tables yet", which is different from "the book is empty".
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Placeholder inputs in force, so no surface can present one as a real number. */
export interface BookPlaceholders {
  /** `PRICE_BANDS_ARE_PLACEHOLDERS` — catalogue.ts. */
  priceBandsArePlaceholders: boolean;
  /** `expectedVendorCostCents` is a `TODO_VENDOR_COSTS` figure until D5 lands. */
  vendorCostsArePlaceholders: boolean;
  /** `COORDINATION_HOURS_ARE_PLACEHOLDERS` — delivery.ts. */
  coordinationHoursArePlaceholders: boolean;
  /** `CATALOGUE_TODOS.filter(t => t.blocksQuoting).length`. */
  blockingQuotingDecisions: number;
  /** False until real partner rate cards exist. Nothing derived from cost is measured until then. */
  partnerRateCardsSupplied: boolean;
}

/**
 * An input the engine asked for and did not get, with what its absence costs.
 *
 * Distinct from `BookPlaceholders`: a placeholder is a number standing in for a
 * real one, an unresolved is a capability that does not exist yet. Both must be
 * visible; conflating them is how "we used a guess" becomes "we measured it".
 */
export interface BookUnresolved {
  field: string;
  /** Who alone can supply it. Mirrors `CatalogueTodo.owner`. */
  owner: 'founder' | 'founder+counsel' | 'partner' | 'engineering';
  whyItMatters: string;
  consequence: string;
  /** True when a decision-bearing number is unavailable, not merely approximate. */
  blocking: boolean;
}

export interface BookResponse {
  /**
   * True once 0047/0049 are applied. When false every collection below is EMPTY,
   * and a surface must say "not migrated" rather than "0" — GPS has already
   * shipped one screen that could not tell those apart.
   */
  migrated: boolean;
  /** ISO instant the figures were computed. D1: a number without a time is not traceable. */
  asOf: string;
  positionCount: number;
  /** Non-terminal positions: what is actually in play. */
  openPositionCount: number;
  /** Uppercase ISO-4217, sorted. Nothing is ever totalled across these. */
  currencies: readonly string[];

  concentration: BookConcentration;
  cash: CashConversion;
  health: BookHealth;

  /**
   * 6.2 — bench capacity, computed by the API from `benchHeadroom()`
   * (`partners.ts`). The TYPE is re-exported through this response rather than
   * re-declared, so the web gets the partner bench's own shape and its
   * `perOfferIndependent` / `totalSpareSlots` warnings intact. Null when the
   * bench is unknown, which is the state today (D5).
   */
  capacity: BenchHeadroom | null;
  /** 6.2 — his own ceiling, from `wipLoad()` (`delivery.ts`). Null when unknown. */
  wip: WipLoad | null;
  /**
   * 6.4 — quoted vs realised margin, from `marginRealisation()`
   * (`calibration.ts`). Null until outcome records exist; there is no outcome
   * table in the schema, so expect null.
   */
  marginRealisation: MarginRealisation | null;

  placeholders: BookPlaceholders;
  /** Every unresolved input, ordered blocking first. D2 — refusals are explicit. */
  unresolved: readonly BookUnresolved[];
}
