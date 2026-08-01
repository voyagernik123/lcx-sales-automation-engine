import { ApiError, request } from '../apiClient';
import type {
  LoopResponse, MarginRealisation, OutcomeCaptureDraft, OutcomeCaptureForm, WinLossSummary,
} from '@lcx/shared';

/**
 * GLOBAL SERVICES — THE LOOP (Phase 12), browser side. Fetchers only.
 *
 * Mirrors `apps/api/src/routes/gpsLoop.ts` one function per endpoint, mounted at
 * `/v1/gps/loop` (nested inside `gpsRoutes`, NOT registered separately in app.ts —
 * `intakeLockout.test.ts` fences that prefix).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO RESPONSE SHAPE IS DECLARED IN THIS FILE, AND THAT IS THE POINT.
 * ─────────────────────────────────────────────────────────────────────────────
 * `LoopResponse`, `OutcomeCaptureForm`, `OutcomeCaptureDraft`, `WinLossSummary` and
 * `MarginRealisation` are imported from `@lcx/shared` — one declaration, compiled
 * once, imported by the route handler and by this module. The alternative was tried
 * in this compartment and it shipped a broken page with a green suite:
 * `lib/api/gps.ts:83` carries the post-mortem, where a hand-written `GpsSummary`
 * declared `counts`, `clientCount`, `openValueCents` and `missingConflictChecks`,
 * none of which the API has ever returned. `tsc` believed the interface, the
 * module-mocked page test agreed with it, and the page was guaranteed to crash the
 * moment 0047 was applied. A response interface is a CLAIM about a runtime payload;
 * the compiler cannot check a claim it was handed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE IS NO UPLOAD, ATTACHMENT, DOCUMENT OR FILE FUNCTION HERE.
 * ─────────────────────────────────────────────────────────────────────────────
 * An outcome is nine scalars plus a map of quote-time factor scores. Decision D2 —
 * whether LCX legal/DPO accepts third-party confidential material on LCX
 * infrastructure — is UNANSWERED (`GPS_IMPLEMENTATION_PLAN.md` §3 D2), so there is
 * no multipart, no attachment field, and no location string the server would fetch.
 * `pages/__tests__/gpsLoop.test.tsx` reads this module's export list and fails if an
 * upload-shaped function appears, because adding one here is the first step in
 * defeating the gate and that has to be a red test rather than a code review
 * somebody was busy for.
 */

/** The API's read-side envelope, identical to every other compartment's. */
const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

/**
 * `GET /v1/gps/loop` — the whole of Phase 12 in one response.
 *
 * `engagementId` is optional because `LoopResponse.capture` is legitimately null:
 * the review, health, monitor and WBR blocks are book-wide and do not depend on one
 * engagement (`loop.ts:1341`). It travels as a query parameter because it is an
 * opaque internal uuid — no client name, no price, nothing personal in a URL.
 *
 * ANSWERS 200 EVEN BEFORE `gps_outcome` EXISTS, with a well-shaped body composed on
 * zero records and `meta.migrated: false`. That is deliberate on the server side and
 * it is why this page is useful at n=0: the health block's verdict at zero records
 * is itself the report.
 */
export const fetchGpsLoop = (engagementId?: string) =>
  unwrap(request<{ data: LoopResponse }>(
    engagementId ? `/v1/gps/loop?engagementId=${encodeURIComponent(engagementId)}` : '/v1/gps/loop',
    { auth: true },
  ));

/**
 * `GET /v1/gps/loop/win-loss` → `WinLossSummary`.
 *
 * A SEPARATE CALL BECAUSE `LoopResponse` CARRIES ONLY THE POOLED RATE
 * (`wbr.pooledWinRate`) plus a list of offer keys whose rate is expressible. The
 * per-offer table — five rows, each with its own counts, its own null rate and its
 * own suppression sentence — is what a review of a five-offer catalogue needs, and
 * `byOffer` includes offers with ZERO outcomes (`calibration.ts:345`): a missing row
 * is invisible, while "0 won / 0 lost" is the finding that an offer has never been
 * decided.
 *
 * The server refuses (500 `RATE_SUPPRESSION_BREACH`) rather than serialising a
 * percentage below the stated minimum n. A refused response is recoverable; a "33%"
 * gets screenshotted into a deck and outlives the bug that produced it.
 */
export const fetchGpsWinLoss = () =>
  unwrap(request<{ data: WinLossSummary }>('/v1/gps/loop/win-loss', { auth: true }));

/**
 * `GET /v1/gps/loop/margin` → `MarginRealisation`.
 *
 * Quoted versus realised, per offer AND per partner, with the dispersion.
 * `LoopResponse` carries one pooled mean and two counts; it does not carry
 * `byPartner`, and "which partner leaks margin" is the question this compartment
 * exists to answer — partners deliver, the founder sells and coordinates, and at a
 * $10–25k ticket one scope overrun eats the engagement.
 *
 * `byPartner` arrives WORST MEAN SLIPPAGE FIRST (`calibration.ts:541`). It is an
 * action list, not a league table, and the screen must not re-sort it.
 */
export const fetchGpsMarginRealisation = () =>
  unwrap(request<{ data: MarginRealisation }>('/v1/gps/loop/margin', { auth: true }));

/**
 * `GET /v1/gps/loop/outcome/:engagementId` → the capture form for one engagement.
 *
 * Returns `{ data: null }` while 0047 itself is pending, which is why the return
 * type admits null rather than the page inventing an empty form.
 */
export const fetchGpsCaptureForm = (engagementId: string) =>
  unwrap(request<{ data: OutcomeCaptureForm | null }>(
    `/v1/gps/loop/outcome/${encodeURIComponent(engagementId)}`,
    { auth: true },
  ));

/**
 * The three ways a close attempt ends, as the SERVER decides them.
 *
 * This is a discriminated union over HTTP outcomes — UI state, not a payload shape.
 * The payload in every arm is `OutcomeCaptureForm`, unmodified, from `@lcx/shared`.
 *
 * WHY THE REFUSALS CARRY THE FULL FORM AND NOT A MESSAGE. `POST /v1/gps/loop/outcome`
 * answers 422 with the whole form when the facts do not constitute a record, so the
 * blockers, the per-field status and the legal reason options travel WITH the refusal
 * (D2) instead of a toast saying "invalid". The screen therefore never computes a
 * blocker itself: one evaluator, on the server, and the browser renders its verdict.
 * A second copy of `won_before_acceptance` in the browser would drift from the engine
 * the first time either changed.
 */
export type OutcomeSubmission =
  /** 200 — written, idempotently (the engagement id is the primary key). */
  | { outcome: 'recorded'; form: OutcomeCaptureForm }
  /** 422 — describable, but these facts are not yet a record. Nothing was written. */
  | { outcome: 'blocked'; form: OutcomeCaptureForm }
  /**
   * 503 — the entry was acceptable and the TABLE does not exist. `gps_outcome`
   * arrives in `0050_gps_outcome.sql`, which nobody has applied; the server names it
   * rather than answering 500, so the remedy is "run one file" and not "the platform
   * is down".
   */
  | { outcome: 'store_missing'; form: OutcomeCaptureForm | null; migration: string; detail: unknown };

/**
 * Read a field off `ApiError.data`.
 *
 * `apiClient` keeps every key of an error body except `error`/`code` verbatim
 * (`apiClient.ts:390`), so a refusal is machine-readable. The key names below are
 * read from `routes/gpsLoop.ts` — 422 nests the form under `data`, 503 under `form`
 * — and a cast is unavoidable at this boundary because the error body is genuinely
 * `unknown`. It is confined to these two lines rather than spread across the page.
 */
function formFromError(e: ApiError, key: 'data' | 'form'): OutcomeCaptureForm | null {
  const v = e.data?.[key];
  return v && typeof v === 'object' ? (v as OutcomeCaptureForm) : null;
}

/**
 * `POST /v1/gps/loop/outcome` — record the outcome at close.
 *
 * Attribution is the authenticated principal server-side and is NOT a body field:
 * on a margin figure that is the difference between a record and a rumour.
 *
 * 400 (a shape the engine cannot describe: bad uuid, non-integer cents, unknown
 * reason string, impossible date) and 404 (no such engagement) are left to THROW.
 * They are programming or routing errors, not decisions the operator can take from
 * this form, and dressing them as a form state would hide them.
 */
export async function recordGpsOutcome(
  engagementId: string,
  draft: OutcomeCaptureDraft,
): Promise<OutcomeSubmission> {
  try {
    const r = await request<{ data: OutcomeCaptureForm }>('/v1/gps/loop/outcome', {
      auth: true,
      method: 'POST',
      body: { engagementId, ...draft },
    });
    return { outcome: 'recorded', form: r.data };
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) {
      const form = formFromError(e, 'data');
      // A 422 without a form would leave the operator with no blockers to act on, so
      // it is re-thrown rather than rendered as an empty refusal.
      if (form) return { outcome: 'blocked', form };
    }
    if (e instanceof ApiError && e.status === 503) {
      return {
        outcome: 'store_missing',
        form: formFromError(e, 'form'),
        migration: typeof e.data?.migration === 'object' && e.data.migration !== null
          && 'file' in (e.data.migration as Record<string, unknown>)
          ? String((e.data.migration as Record<string, unknown>).file)
          : '0050_gps_outcome.sql',
        detail: e.data?.migration ?? null,
      };
    }
    throw e;
  }
}

/**
 * Re-exported for the page's own signatures only.
 *
 * Re-exporting a TYPE is not re-declaring one: it is the same symbol from
 * `@lcx/shared`, so a field the API stops returning still breaks the build here.
 */
export type {
  LoopResponse, MarginRealisation, OutcomeCaptureDraft, OutcomeCaptureForm, WinLossSummary,
};
