import type { OfferKey } from '../types.js';
import type { RateUnit, RateCardStatus } from '../partners.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GPS INPUT DESK — THE WIRE CONTRACT, DECLARED ONCE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three blocking business inputs have never had anywhere to be typed:
 *
 *   PRICE BANDS    what LCX sells an offer for, low / mid / high. Today every one
 *                  is `TODO_PRICE_BANDS` in `catalogue.ts:61`, badged by
 *                  `PRICE_BANDS_ARE_PLACEHOLDERS` (`catalogue.ts:58`).
 *   EFFORT TRIPLES partner-days per engagement, optimistic / likely / pessimistic.
 *                  Feeds the Monte Carlo. Absent ⇒ the distribution is labelled
 *                  `basis: 'prior'`, i.e. a guess.
 *   NAMED PARTNER  who delivers an offer, and at what rate. `PARTNER_BENCH` is an
 *                  empty array (`partners.ts:332`) — decision D5 is unanswered.
 *
 * ── WHY A CONTRACT FILE AND NOT AN INTERFACE IN THE PAGE ─────────────────────
 * `apps/web/src/lib/api/gps.ts:60` records the cost of the alternative: a
 * hand-written `GpsSummary` claiming three fields the API has never sent. `tsc`
 * believed the copy, the page test mocked the boundary and agreed with it, and
 * production crashed the moment the migrations landed. A response interface is a
 * CLAIM about a runtime payload and the compiler cannot check a claim.
 *
 * So this file does two things rather than one:
 *   1. declares the types, ONCE, for the web side to import; and
 *   2. exports `deskContractDefects` / `refusalBodyDefects` — RUNTIME checks that
 *      the API's own test runs against a real HTTP response and the web's test runs
 *      against its fixture. Two artefacts agreeing with each other is not a
 *      contract; both agreeing with one executable predicate is closer.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 * No price. No partner name. No effort number. Nothing in this file states a
 * commercial fact, because nobody here is entitled to state one. The placeholder
 * bands stay in `catalogue.ts` where the single-edit comment already lives, and
 * the bench stays empty until a human types names into it.
 *
 * NO VALIDATOR IS HERE EITHER, and that is a decision. Validation is the SERVER's
 * authority (`apps/api/src/routes/gpsInputs.ts`) — a client-side copy would be a
 * second opinion about what counts as a refusal, and the browser's opinion is not
 * the one that protects the database. The web submits and renders the server's
 * refusal verbatim.
 *
 * ══ ONE BARREL LINE IS OUTSTANDING (a human wiring pass owns barrels) ════════
 * `packages/shared/package.json` publishes exactly one entry point (`"."` →
 * `src/index.ts`), so `@lcx/shared/gps/contracts/inputs.js` does NOT resolve — for
 * `tsc` or for Vite — and a deep path through `node_modules` type-checks and then
 * fails the emit build with TS6059 (`not under rootDir`), which is the Docker-order
 * failure the pre-push gate exists to catch (`routes/marketingGates.ts:170`).
 * Until `packages/shared/src/gps/index.ts` carries
 *
 *     export * from './contracts/inputs.js';
 *
 * the web imports this file by RELATIVE path (legal there: `apps/web` is `noEmit`
 * with no `rootDir`, and its tests already do it), and the API route — which is
 * emitted, and therefore cannot — declares no types at all and is held to this
 * contract by `deskContractDefects` in its own test instead.
 */

/** Contract id, echoed on every payload so a stale bundle is visible rather than inferred. */
export const GPS_INPUTS_CONTRACT = 'gps.inputs.v1';

/**
 * ISO-4217 as a CLOSED PATTERN, not a length cap.
 *
 * `currency` was the door: read as a bare string it flowed into a `text` column
 * with no length and no CHECK on a server with no `bodyLimit`, and a base32-encoded
 * document survived `.toUpperCase()` losslessly. Three bytes drawn from 26 letters
 * is not a channel; `text(v, 3)` is the same hole at 1.1 bits per request.
 * `0052_gps_underwriting.sql:98` applies the same pattern in the schema, and
 * `apps/api/src/gps/__tests__/intakeLockout.test.ts:1026` ratchets it at the edge.
 */
export const CURRENCY_CODE_RE = /^[A-Za-z]{3}$/;

/* ══════════════════════════════════════════════════════════════════════════ */
/* REFUSALS — a code, a sentence, and the rule that produced it                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every code this desk can answer with. A closed list rather than free strings so
 * a surface can branch on it and a test can assert the API invents none.
 */
export const GPS_INPUT_REFUSAL_CODES = [
  /** The body was not a JSON object. */
  'BODY_NOT_AN_OBJECT',
  /** `offerKey` was absent or is not one of the five catalogue keys. */
  'OFFER_KEY_UNKNOWN',
  /** No `gps_price_band` relation on this environment. Nothing to write to. */
  'PRICE_BAND_REGISTER_ABSENT',
  /** No `gps_effort_triple` relation on this environment. */
  'EFFORT_REGISTER_ABSENT',
  /** No `gps_rate_card` relation on this environment. */
  'RATE_CARD_REGISTER_ABSENT',
  /** The delivery bench has no names on it, so no offer can be assigned a partner. */
  'PARTNER_BENCH_EMPTY',
  /** A partner id that is on no bench and on no card. Names are not invented here. */
  'PARTNER_NOT_ON_BENCH',
  /** A band edge is zero, negative or not finite. */
  'BAND_NOT_POSITIVE',
  /** low ≤ mid ≤ high failed. */
  'BAND_NOT_ASCENDING',
  /** A money field carried a fraction of a cent. */
  'AMOUNT_NOT_INTEGER_CENTS',
  /** An effort day count is negative or not finite. */
  'EFFORT_NEGATIVE',
  /** optimistic ≤ likely ≤ pessimistic failed. */
  'EFFORT_NOT_ASCENDING',
  /** A rate of zero or less. Zero is an unfilled form, never free labour. */
  'RATE_NOT_POSITIVE',
  /** The derived engagement cost rounds to nothing — a sub-cent rate. */
  'RATE_BELOW_ONE_CENT',
  /** `currency` is not three letters. */
  'CURRENCY_NOT_ISO_4217',
  /** `unit` is not one of fixed / day_rate / hourly. */
  'RATE_UNIT_UNKNOWN',
  /** No `validUntil`. A rate nobody re-confirmed is unusable, not eternal. */
  'VALIDITY_NOT_STATED',
  /** `validUntil` did not parse as a date. */
  'VALIDITY_NOT_A_DATE',
  /** A metered unit with no expected units. The cost cannot be derived. */
  'UNITS_NOT_STATED',
  /** An hourly card with no hours per day. The triple is in DAYS. */
  'HOURS_PER_DAY_NOT_STATED',
] as const;

/**
 * THERE IS NO CODE HERE FOR AN UNATTRIBUTED INPUT, and the omission is deliberate.
 *
 * `stated_by` is taken from `c.get('operator')` and never from a body field, so an
 * input cannot arrive without an author — the same discipline the conflict check
 * applies to `decided_by`. What that record is NOT is proof of WHICH human: entry is
 * a shared `DESK_PASSCODE`, and a shared `SECONDARY_PASSCODE` admits any @lcx.com
 * address. Adding a refusal code for "not a named human" would imply this desk can
 * tell, and it cannot. `0052_gps_underwriting.sql:107` states the same limit about
 * the same column.
 */

export type GpsInputRefusalCode = (typeof GPS_INPUT_REFUSAL_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set<string>(GPS_INPUT_REFUSAL_CODES);

/** Is this a code this contract publishes? Used by the API's conformance test. */
export function isGpsInputRefusalCode(v: unknown): v is GpsInputRefusalCode {
  return typeof v === 'string' && CODE_SET.has(v);
}

/**
 * A refusal, not a warning.
 *
 * `rule` is the citation — a file:line, a CHECK constraint name, or a named
 * constant. It exists because "invalid input" teaches nobody anything, and because
 * a refusal whose rule cannot be located is a refusal somebody will delete.
 */
export interface GpsInputRefusal {
  code: GpsInputRefusalCode;
  /** Addressed to the person who can fix it, in one sentence. */
  reason: string;
  /** Where the rule lives. Never empty. */
  rule: string;
  /** The field it is about, or null when it is about the whole request. */
  field: string | null;
}

/**
 * The refusal AS IT ARRIVES OVER HTTP. The house envelope is
 * `{ error, code, data }` — see `routes/gpsUnderwrite.ts:136` — so the sentence is
 * on `error` and the citation travels in `data`, rather than a second shape
 * existing only for this desk.
 */
export interface GpsInputRefusalBody {
  error: string;
  code: GpsInputRefusalCode;
  data: { rule: string; field: string | null };
}

/** One place that turns a refusal into the wire body, so the two cannot drift. */
export function refusalBody(r: GpsInputRefusal): GpsInputRefusalBody {
  return { error: r.reason, code: r.code, data: { rule: r.rule, field: r.field } };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PRICE BANDS — and the distinction that is the whole point of the screen      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHERE THE NUMBER ON SCREEN CAME FROM.
 *
 * `compiled_placeholder` means the band is `TODO_PRICE_BANDS` (`catalogue.ts:61`) —
 * shaped by two facts the founder gave in passing and agreed by nobody. `entered`
 * means a named human typed it and it is on record.
 *
 * A surface that rendered both identically would make the placeholder invisible,
 * which is strictly worse than showing no price at all: the founder sold ~$250k by
 * hand, and a system that quietly invents his prices is worse than the document it
 * replaces.
 */
export type PriceBandSource = 'entered' | 'compiled_placeholder';

export interface PriceBandRow {
  offerKey: OfferKey;
  /** The catalogue's own name for the offer. Not re-typed on the client. */
  offerName: string;
  source: PriceBandSource;
  lowCents: number;
  midCents: number;
  highCents: number;
  currency: string;
  /**
   * TRUE when `midCents` is the arithmetic midpoint rather than a number anyone
   * stated. The compiled placeholder has only a floor and a ceiling
   * (`PriceBandCents`, `types.ts:87`), so its mid is always derived — and a derived
   * mid must not read as a decided one on a proposal.
   */
  midIsDerived: boolean;
  /** Null on a placeholder: nobody stated it, so there is no author to name. */
  statedBy: string | null;
  statedAt: string | null;
  /**
   * The sentence to render beside a placeholder band, from the server. Null when
   * the band was entered — an always-on banner is decoration, and the absence half
   * is what makes the presence half mean something.
   */
  placeholderNotice: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* EFFORT TRIPLES — measured, or a prior                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `prior` is the honest word for a guess. It is the same vocabulary the
 * underwriting already prints (`UnderwritingBasis`, `underwrite.ts`), deliberately,
 * so the input desk and the distribution cannot describe the same row differently.
 */
export type EffortBasis = 'measured' | 'prior';

export interface EffortTripleRow {
  offerKey: OfferKey;
  offerName: string;
  basis: EffortBasis;
  optimisticDays: number;
  likelyDays: number;
  pessimisticDays: number;
  statedBy: string | null;
  statedAt: string | null;
  /** Why this row is still a prior. Null once it is measured. */
  priorNotice: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* RATE CARDS AND THE NAMED PARTNER                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface RateCardRow {
  offerKey: OfferKey;
  offerName: string;
  partnerId: string;
  /** Display only. The join key is `partnerId`; a drifting label must not re-point a rate. */
  partnerLabel: string | null;
  unit: RateUnit;
  amountCents: number;
  expectedUnits: number | null;
  hoursPerDay: number | null;
  fixedCostCents: number;
  currency: string;
  validUntil: string | null;
  /** `usable` / `expired` / `no_validity_stated`, from `rateCardStatus` and nothing else. */
  status: RateCardStatus;
  /**
   * The derived cost of ONE engagement, or NULL when it cannot be derived.
   *
   * Never 0. `rateCardCostCents` (`partners.ts:254`) returns null for a zero rate,
   * for a metered card with no expected units, and for a rate that rounds to
   * nothing — the pen test found both a zero card underwriting as FREE and a
   * sub-cent card slipping through. This field is that function's output, not a
   * second opinion about it.
   */
  engagementCostCents: number | null;
  statedBy: string;
  statedAt: string;
}

/** Where a selectable partner name came from. There is no third source, and no invented one. */
export type PartnerOptionOrigin = 'compiled_bench' | 'rate_card_on_file';

export interface PartnerOption {
  partnerId: string;
  label: string;
  origin: PartnerOptionOrigin;
}

/** Which of the three registers this environment actually has. */
export interface InputRegisters {
  priceBands: boolean;
  effortTriples: boolean;
  rateCards: boolean;
}

/**
 * THE WHOLE DESK IN ONE PAYLOAD.
 *
 * One read, because the three inputs are one decision: a band without an effort
 * triple is a price with no cost model behind it, and either without a named
 * partner is a margin nobody can be held to. Splitting the fetch would let the
 * screen show a band from one instant beside a bench from another.
 */
export interface GpsInputsDesk {
  contract: string;
  /** One clock read per request, shared by every staleness judgement on the payload. */
  asOf: string;
  registers: InputRegisters;
  priceBands: readonly PriceBandRow[];
  effortTriples: readonly EffortTripleRow[];
  rateCards: readonly RateCardRow[];
  /** Empty is the expected state, and it is a refusal rather than an empty dropdown. */
  partnerOptions: readonly PartnerOption[];
  /** Desk-wide refusals: an absent register, an empty bench. Never a toast. */
  refusals: readonly GpsInputRefusal[];
  /** What only a human can supply, as sentences. A boolean would not say WHICH. */
  awaitingHuman: readonly string[];
  /** Counts for the header. Derived on the server so two panels cannot disagree. */
  counts: {
    offersOnPlaceholderBand: number;
    offersOnPriorEffort: number;
    offersWithNoPartner: number;
  };
  /**
   * The DDL for the register that does not exist, verbatim, so the screen can show
   * a human exactly what to paste rather than describing it.
   */
  priceBandRegisterDdl: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE REGISTER THAT DOES NOT EXIST YET                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

/*
 * There is no DDL constant in this file, on purpose.
 *
 * `0052_gps_underwriting.sql` created `gps_rate_card` (what a partner charges LCX —
 * COST) and `gps_effort_triple`. It created nothing for the SELL side, and it was
 * right not to: a rate that varies by client is not a rate card (`0052:28-35`). So
 * the price band has no register, and the desk refuses to write one with
 * `PRICE_BAND_REGISTER_ABSENT` until one exists.
 *
 * The DDL a human pastes is `PRICE_BAND_REGISTER_DDL` in
 * `apps/api/src/routes/gpsInputs.ts` — beside the probe that decides whether to
 * refuse, and beside the INSERT whose column list must match it. That is where
 * `UNDERWRITING_MIGRATION_SPEC` already lives for the same reason. It reaches the
 * browser as `GpsInputsDesk.priceBandRegisterDdl` rather than being compiled into
 * two bundles, so the refusal message and the schema cannot disagree.
 */

/* ══════════════════════════════════════════════════════════════════════════ */
/* RUNTIME CONFORMANCE — the half a type cannot check                           */
/* ══════════════════════════════════════════════════════════════════════════ */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStr = (v: unknown): boolean => typeof v === 'string';
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const isNullOr = (v: unknown, p: (x: unknown) => boolean): boolean => v === null || p(v);

function fields(
  where: string,
  row: unknown,
  spec: Readonly<Record<string, (v: unknown) => boolean>>,
  out: string[],
): void {
  if (!isObj(row)) {
    out.push(`${where} is not an object`);
    return;
  }
  for (const [name, ok] of Object.entries(spec)) {
    if (!(name in row)) out.push(`${where}.${name} is missing`);
    else if (!ok(row[name])) out.push(`${where}.${name} has the wrong type`);
  }
}

/**
 * WHAT IS WRONG WITH THIS PAYLOAD, as a list of sentences. Empty means it conforms.
 *
 * Run by BOTH sides against the same declaration: the API's route test runs it over
 * a real serialised HTTP response, and the web's page test runs it over the fixture
 * the page is rendered from. That is the only arrangement that catches the
 * `GpsSummary` failure — a page and a test agreeing on a field the server never
 * sends — because a mocked boundary can prove internal consistency and nothing else.
 *
 * It checks PRESENCE AND TYPE, not values: `lowCents: 1` is conformant and may still
 * be a bad price. Values are the route's business, and it refuses them.
 */
export function deskContractDefects(value: unknown): string[] {
  const out: string[] = [];
  if (!isObj(value)) return ['the desk payload is not an object'];

  fields('desk', value, {
    contract: isStr,
    asOf: isStr,
    registers: isObj,
    priceBands: Array.isArray,
    effortTriples: Array.isArray,
    rateCards: Array.isArray,
    partnerOptions: Array.isArray,
    refusals: Array.isArray,
    awaitingHuman: Array.isArray,
    counts: isObj,
    priceBandRegisterDdl: isStr,
  }, out);

  if (value.contract !== GPS_INPUTS_CONTRACT) {
    out.push(`desk.contract is '${String(value.contract)}', expected '${GPS_INPUTS_CONTRACT}'`);
  }

  fields('desk.registers', value.registers, {
    priceBands: (v) => typeof v === 'boolean',
    effortTriples: (v) => typeof v === 'boolean',
    rateCards: (v) => typeof v === 'boolean',
  }, out);

  fields('desk.counts', value.counts, {
    offersOnPlaceholderBand: isNum,
    offersOnPriorEffort: isNum,
    offersWithNoPartner: isNum,
  }, out);

  const bands = Array.isArray(value.priceBands) ? value.priceBands : [];
  bands.forEach((row, i) => fields(`desk.priceBands[${i}]`, row, {
    offerKey: isStr,
    offerName: isStr,
    source: (v) => v === 'entered' || v === 'compiled_placeholder',
    lowCents: isNum,
    midCents: isNum,
    highCents: isNum,
    currency: isStr,
    midIsDerived: (v) => typeof v === 'boolean',
    statedBy: (v) => isNullOr(v, isStr),
    statedAt: (v) => isNullOr(v, isStr),
    placeholderNotice: (v) => isNullOr(v, isStr),
  }, out));

  const triples = Array.isArray(value.effortTriples) ? value.effortTriples : [];
  triples.forEach((row, i) => fields(`desk.effortTriples[${i}]`, row, {
    offerKey: isStr,
    offerName: isStr,
    basis: (v) => v === 'measured' || v === 'prior',
    optimisticDays: isNum,
    likelyDays: isNum,
    pessimisticDays: isNum,
    statedBy: (v) => isNullOr(v, isStr),
    statedAt: (v) => isNullOr(v, isStr),
    priorNotice: (v) => isNullOr(v, isStr),
  }, out));

  const cards = Array.isArray(value.rateCards) ? value.rateCards : [];
  cards.forEach((row, i) => fields(`desk.rateCards[${i}]`, row, {
    offerKey: isStr,
    offerName: isStr,
    partnerId: isStr,
    partnerLabel: (v) => isNullOr(v, isStr),
    unit: (v) => v === 'fixed' || v === 'day_rate' || v === 'hourly',
    amountCents: isNum,
    expectedUnits: (v) => isNullOr(v, isNum),
    hoursPerDay: (v) => isNullOr(v, isNum),
    fixedCostCents: isNum,
    currency: isStr,
    validUntil: (v) => isNullOr(v, isStr),
    status: (v) => v === 'usable' || v === 'expired' || v === 'no_validity_stated',
    // NULL, never 0 — see `RateCardRow.engagementCostCents`.
    engagementCostCents: (v) => isNullOr(v, isNum),
    statedBy: isStr,
    statedAt: isStr,
  }, out));

  const options = Array.isArray(value.partnerOptions) ? value.partnerOptions : [];
  options.forEach((row, i) => fields(`desk.partnerOptions[${i}]`, row, {
    partnerId: isStr,
    label: isStr,
    origin: (v) => v === 'compiled_bench' || v === 'rate_card_on_file',
  }, out));

  const refusals = Array.isArray(value.refusals) ? value.refusals : [];
  refusals.forEach((row, i) => {
    fields(`desk.refusals[${i}]`, row, {
      code: isGpsInputRefusalCode,
      reason: isStr,
      rule: isStr,
      field: (v) => isNullOr(v, isStr),
    }, out);
    if (isObj(row) && isStr(row.rule) && String(row.rule).trim() === '') {
      out.push(`desk.refusals[${i}].rule is empty — a refusal must cite the rule that produced it`);
    }
  });

  const awaiting = Array.isArray(value.awaitingHuman) ? value.awaitingHuman : [];
  awaiting.forEach((s, i) => {
    if (!isStr(s)) out.push(`desk.awaitingHuman[${i}] is not a string`);
  });

  return out;
}

/**
 * The same check for a refusal RESPONSE.
 *
 * The API builds the three fields itself — it did so because it could not import
 * `refusalBody` above, and `gps/index.ts` now re-exports this file, so that reason has
 * expired. The reason the predicate stays is the durable one: it runs over a REAL HTTP
 * RESPONSE in `apps/api/src/routes/__tests__/gpsInputs.test.ts`, after serialisation, which
 * is the only place a shape can be checked as the browser will actually receive it. A type
 * annotation proves nothing survived `JSON.stringify`.
 */
export function refusalBodyDefects(value: unknown): string[] {
  const out: string[] = [];
  if (!isObj(value)) return ['the refusal body is not an object'];
  fields('refusal', value, {
    error: isStr,
    code: isGpsInputRefusalCode,
    data: isObj,
  }, out);
  fields('refusal.data', value.data, {
    rule: isStr,
    field: (v) => isNullOr(v, isStr),
  }, out);
  if (isObj(value.data) && isStr(value.data.rule) && String(value.data.rule).trim() === '') {
    out.push('refusal.data.rule is empty — every refusal cites the rule that produced it');
  }
  return out;
}
