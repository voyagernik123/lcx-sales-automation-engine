import { request } from '../apiClient';

/**
 * GLOBAL SERVICES — UNDERWRITING (Phase 7): the browser's one call into the
 * crown jewel.
 *
 * FETCHERS ONLY. One function, one POST. Everything this screen renders — the
 * distribution, the sensitivity table, the block decision, the devil's advocate,
 * the honesty flags — arrives on a single `UnderwriteResponse`, because the whole
 * payload is ONE simulation and splitting the fetch would let the screen show a
 * P(loss) from one run beside a band from another. `buildUnderwriteResponse`
 * (`gps/underwrite.ts:1805`) exists precisely so the API route is a data-loading
 * function and not a fifth place where an opinion about the numbers can appear.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NO RESPONSE SHAPE, NO REQUEST SHAPE AND NO CONSTANT IS DECLARED IN THIS FILE.
 * ═════════════════════════════════════════════════════════════════════════════
 * `UnderwriteRequest` and `UnderwriteResponse` are declared exactly once, in
 * `packages/shared/src/gps/underwrite.ts:1732` and `:1777`, and the API route and
 * this module import THAT declaration. The re-exports below are pass-throughs, not
 * copies: `export type { X } from '…'` cannot drift from `X`, whereas
 * `interface X { … }` typed out here can and did.
 *
 * It did. `lib/api/gps.ts:60` carries the post-mortem — a hand-written
 * `GpsSummary` claiming `counts` / `clientCount` / `openValueCents` that the API
 * has never returned. `tsc` believed the copy. The page test mocked this layer, so
 * it asserted the page against the same invented contract the page was written
 * against, and agreed. Production crashed the moment the migrations landed. Two
 * artefacts agreeing with each other is not a contract; a response interface is a
 * CLAIM about a runtime payload and the compiler cannot check a claim.
 *
 * WIRED (P13): `gps/index.ts` re-exports `underwrite.js` and the root barrel now
 * re-exports the whole GPS compartment with `export *` rather than a name list, so
 * the statements below name `@lcx/shared`. The 60 TS2305 errors this comment used
 * to describe were that name list, not this file.
 *
 * `packages/shared` sets `"sideEffects": false`, so the two VALUES imported below
 * (a label map and a one-line predicate) do not drag the 1,843-line module's
 * functions into the chunk. They are imported rather than re-typed because
 * `verdict !== 'underwritten'` written in a page is a second opinion about what
 * counts as a refusal, and the first time the union gains a member the page would
 * quietly disagree with the module.
 */
export type {
  // The wire.
  UnderwriteRequest,
  UnderwriteResponse,
  // The answer, and the shape of its uncertainty.
  Underwriting,
  UnderwriteVerdict,
  MarginDistribution,
  UnderwriteDriver,
  UnderwritingBasis,
  VarianceAttribution,
  VarianceContribution,
  StochasticInputKey,
  // Where the numbers came from.
  EffortTriple,
  OutcomeBlend,
  ExcludedOutcome,
  // What a scope slip costs.
  OverrunSensitivity,
  OverrunPoint,
  // The governed block.
  IssueDecision,
  IssueCheck,
  IssueBlockCode,
  IssuePolicy,
  // The system arguing back.
  DevilsAdvocate,
  DevilsAdvocateSource,
  OverrunArgument,
} from '@lcx/shared';

export {
  UNDERWRITE_VERDICT_LABEL,
  isRefusal,
} from '@lcx/shared';

import type {
  UnderwriteRequest,
  UnderwriteResponse,
} from '@lcx/shared';
import { unwrapWithMeta } from './meta.js';

/** The API's read-side envelope, identical to every other compartment's. */
// The envelope's `meta` used to die here — see lib/api/meta.ts. `unwrapWithMeta`
// attaches it under a non-enumerable symbol, so no call site or type changes and
// `responseMeta(x)` / `isMigrated(x)` can finally answer.
const unwrap = unwrapWithMeta;

/**
 * THE BODY THE ROUTE ACTUALLY ACCEPTS — derived from `UnderwriteRequest`, never
 * retyped.
 *
 * `UnderwriteRequest` is the shared declaration of everything an underwriting run
 * needs. The route accepts a strict SUBSET of it, and refuses the rest with a
 * `SERVER_FACT` 400 rather than ignoring it (`apps/api/src/gps/underwrite.ts:665`,
 * `SERVER_FACT_FIELDS`). Each refusal has a reason worth restating, because they are
 * the difference between an instrument and a mirror:
 *
 *  · `asOf`   — rate-card staleness is judged against it and nothing else, so a
 *               caller-supplied date is a caller-supplied verdict on whether an
 *               expired rate may be used.
 *  · `seed`   — the run is deterministic per seed, so a caller who may choose the
 *               seed may SHOP for one that puts P(loss) under the ceiling.
 *  · `samples`— same family of problem.
 *  · `hoursPerDay` — it bridges an hourly card to a triple in days, and a smaller
 *               number is a smaller cost. It belongs on the rate-card row, stated by
 *               whoever recorded the rate.
 *  · `effort.statedBy` / `effort.statedAt` — the name comes from the authenticated
 *               session, so the record is a record rather than an assertion.
 *
 * WHY THIS IS A DERIVED TYPE AND NOT A HAND-WRITTEN ONE. `Omit` keeps the field
 * names, types and optionality tied to the shared declaration: rename `priceCents`
 * there and this breaks, which is the entire point. Writing the subset out by hand
 * would recreate the copied-contract failure in miniature — a web-side shape that
 * typechecks against nothing. The compiler now REFUSES to send a server fact, which
 * is better than a comment asking nobody to.
 */
export type UnderwriteBody =
  Omit<UnderwriteRequest, 'asOf' | 'seed' | 'samples' | 'hoursPerDay' | 'effort'> & {
    effort?: Pick<
      NonNullable<UnderwriteRequest['effort']>,
      'optimisticDays' | 'likelyDays' | 'pessimisticDays'
    > | null;
  };

/**
 * Underwrite a price that is still being typed.
 *
 * A POST, and not because it writes anything — it writes nothing. It is a POST
 * because the request carries a nested effort triple, a policy override and an
 * uplift array, and putting that in a query string produces a URL that is both
 * unreadable in a log and long enough to be truncated by one. `apiClient.request`
 * routes every non-bodyless-GET straight past the read cache
 * (`apiClient.ts:517`), which is exactly right here: a cached underwriting is a
 * cached opinion about a price the founder has since changed.
 *
 * NOTE WHAT THE CALLER CANNOT SEND: a rate card. `UnderwriteRequest` has no field
 * for one, deliberately (`underwrite.ts:1727`) — the server loads the card by
 * `partnerId` + `offerKey`, so the browser cannot choose its own cost basis and
 * then read back a margin that agrees with it. The card's currency and
 * `validUntil` are server facts, and a currency mismatch or an expired card comes
 * back as a stated refusal rather than as a number.
 *
 * `seed`, `samples` and `asOf` are not merely omitted here — the route REJECTS them
 * (see `UnderwriteBody`). The server's `DEFAULT_SEED` (42) and `DEFAULT_SAMPLE_COUNT`
 * (4,000) and its own clock are the single source of all three, and the response
 * echoes what it used (`Underwriting.seed`, `.sampleCount`, `asOf`) so the surface
 * prints the seed and the instant it actually ran on. A browser-chosen seed is a
 * browser-chosen answer.
 *
 * THE PATH IS `/v1/gps/underwriting`, not `/underwrite`. The router is mounted INSIDE
 * `gpsRoutes` as `gpsRoutes.route('/underwriting', gpsUnderwriteRoutes)`
 * (`apps/api/src/routes/gpsUnderwrite.ts:86`) rather than from `app.ts`, because
 * `intakeLockout.test.ts:315` asserts that the only router under `/v1/gps` is
 * `gpsRoutes` — the artifact-intake ratchet discovers files by path, and a router
 * mounted elsewhere would escape it. That mount is the wiring pass's edit, not this
 * file's; until it lands this call 404s, which the page renders as a stated error and
 * not as an empty band.
 *
 * `data` is the shared `UnderwriteResponse` and nothing else — the route adds no field
 * to it, and its server-side extras travel in `meta` (`routes/gpsUnderwrite.ts:170`),
 * which `unwrap` discards. So the type below is a claim the API makes too, in the same
 * declaration, rather than a hope this module holds.
 */
export const underwriteQuote = (body: UnderwriteBody) =>
  unwrap(request<{ data: UnderwriteResponse }>('/v1/gps/underwriting', {
    method: 'POST',
    body,
    auth: true,
  }));
