import { request } from '../apiClient';

/**
 * GLOBAL SERVICES — THE BOOK (Phase 6): the browser's view of the portfolio.
 *
 * ONE GET AND NOTHING ELSE. The book is a read — every write that could change it
 * (accept, invoice, chase, price) already exists on the quote desk, the delivery
 * desk and the conflict register, and a second write path to the same rows from a
 * portfolio screen is how two surfaces come to disagree about what a deposit is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO RESPONSE SHAPE IS DECLARED IN THIS FILE, AND THAT IS THE WHOLE POINT.
 * ─────────────────────────────────────────────────────────────────────────────
 * `BookResponse` is declared exactly once, at
 * `packages/shared/src/gps/book.ts:2035`, and the API composer and this module
 * import THAT declaration. Every name below is a re-export; not one of them is a
 * copy.
 *
 * The rule is written in blood. `lib/api/gps.ts:60` carries the post-mortem: a
 * hand-written `GpsSummary` in this directory claimed `counts`, `clientCount` and
 * `openValueCents`, the API had never returned any of the three, `tsc` believed
 * the copy because a copy is syntactically perfect, and the page's own test agreed
 * with the copy because the test mocked this module. Two artefacts agreeing with
 * each other is not a contract — it is a shared misconception with a green tick.
 * The moment `0047_gps.sql` landed, the page would have read `undefined.total`.
 *
 * WIRED (P13): the barrel now re-exports `book.ts`, so the imports below name
 * `@lcx/shared` rather than a deep relative path into `packages/shared/src`. That
 * was a path swap, not a contract change — the declarations were already the
 * shared ones. The deep path is not merely ugly: it bypasses the package boundary,
 * so a symbol could go missing from the barrel and this file would still compile.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO UPLOAD, ATTACHMENT, DOCUMENT, FILE OR MULTIPART FUNCTION. NOT ONE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Decision D2 (LCX DPO — controller vs processor for third-party confidential
 * material) is unanswered, and the book is a tempting place to defeat that gate
 * because "attach the signed SOW to the position" is an obviously useful feature.
 * It is refused here for the same reason it is refused on the quote desk and the
 * delivery desk, and it is refused by ratchet rather than by memory: the export
 * list of this module is read and asserted in `pages/__tests__/gpsBook.test.tsx`.
 */

/* ── The contract, re-exported once ────────────────────────────────────────── */

export type {
  // The envelope.
  BookResponse,
  BookPlaceholders,
  BookUnresolved,
  // 6.1 concentration.
  BookConcentration,
  CurrencyConcentration,
  AxisConcentration,
  ConcentrationHolder,
  ConcentrationBand,
  ConcentrationBasis,
  CurrencyMix,
  CurrencyHolder,
  ValueAxis,
  // 6.3 cash conversion.
  CashConversion,
  CurrencyFunnel,
  FunnelStage,
  FunnelStageCount,
  FunnelConversion,
  AgingProfile,
  AgingBracket,
  AgingBracketKey,
  OldestUnpaidDeposit,
  // 6.2 the verdict.
  BindingConstraint,
  BindingConstraintInput,
  ConstraintCheck,
  ConstraintCode,
  ConstraintEvidence,
  // The composed grade.
  BookHealth,
  BookHealthGrade,
  // Re-exported THROUGH book.ts so the bench/WIP/margin shapes arrive intact
  // rather than being flattened into a book-local summary (book.ts:2056).
  BenchHeadroom,
  WipLoad,
  MarginRealisation,
  Driver,
  // The row the API assembles from `gps_engagement ⨝ gps_client`. Exported for
  // fixtures: a test that builds positions and runs the real engines cannot drift
  // from the contract, whereas a hand-written response object can.
  BookPosition,
} from '@lcx/shared';

/**
 * Display vocabulary and the STATED PRIORS the engine speaks at.
 *
 * Imported rather than restated in CSS or in a local map, because a surface that
 * highlights at 40% while the engine alarms at 50% has invented a second opinion
 * nobody reconciles (book.ts:388 says exactly this about these constants).
 */
export {
  AXIS_LABEL,
  VALUE_AXES,
  FUNNEL_STAGE_LABELS,
  CONSTRAINT_LABEL,
  CONSTRAINT_PRECEDENCE,
  BOOK_HEALTH_GRADE_LABEL,
  BOOK_HEALTH_BANDS,
  SINGLE_HOLDER_ALARM_SHARE_PCT,
  SINGLE_HOLDER_WATCH_SHARE_PCT,
  TOP3_ALARM_SHARE_PCT,
  AGED_DEPOSIT_ALARM_DAYS,
  UNATTRIBUTED,
} from '@lcx/shared';

import type { BookResponse } from '@lcx/shared';

/** The API's read-side envelope, identical to every other compartment's. */
const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

/**
 * The whole book in one request.
 *
 * ONE call, not six, and this is load-bearing rather than a performance choice.
 * `bookHealth()` takes `concentration`, `cash` AND `constraint` as inputs
 * (book.ts:1723) and charges signed deductions derived from all three, so a score
 * fetched separately from the concentration it was computed over could disagree
 * with the table underneath it. `bindingConstraint()` likewise consumes the same
 * `CashConversion` instance the funnel renders (book.ts:1424). Splitting the read
 * would let this screen print a verdict about one instant beside evidence from
 * another — the precise failure mode a portfolio instrument exists to prevent.
 *
 * NOTE FOR THE HUMAN WIRING PASS: `/v1/gps/book` DOES NOT EXIST YET.
 * `apps/api/src/routes/gps.ts` is not mine to edit, so the path is stated here in
 * exactly one place, as the contract being requested, where the API's own ratchet
 * tests can read it. `basis` is a query parameter and not a client default:
 * `'margin'` is the engine's default and it is a COMMERCIAL decision — partners
 * deliver, he sells and coordinates, so margin is the business, not revenue
 * (book.ts:229) — and a default that expresses a commercial position belongs on
 * the server that can report its own basis. Passing `'price'` is for an operator
 * who deliberately wants the revenue reading.
 */
export const fetchGpsBook = (basis?: 'margin' | 'price') =>
  unwrap(request<{ data: BookResponse }>(
    `/v1/gps/book${basis != null ? `?basis=${basis}` : ''}`,
    { auth: true },
  ));
