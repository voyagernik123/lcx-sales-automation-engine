import { request } from '../apiClient';
import type { DeliveryResponse } from '@lcx/shared';

/**
 * GLOBAL SERVICES — THE DELIVERY DESK's one read.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THERE IS EXACTLY ONE DECLARATION OF `DeliveryResponse` AND IT IS NOT HERE.
 * ═════════════════════════════════════════════════════════════════════════════
 * It lives in `packages/shared/src/gps/deliveryView.ts:1085` and BOTH sides import
 * that one declaration. This module declares no response interface, no row shape
 * and no field list.
 *
 * That is not stylistic. A hand-copied response interface in this directory —
 * declaring fields the API never returned — took production down this week:
 * `tsc` believed the copy, the mocked page test agreed with the copy, and the
 * server had never heard of half of it. Two artefacts agreeing with each other is
 * not a contract. The composer that produces this payload
 * (`composeDeliveryResponse`, deliveryView.ts:1234) and the screen that renders it
 * now typecheck against the same file, so a field that does not exist there does
 * not exist anywhere.
 *
 * `import type` and nothing else, deliberately: every sentence this screen has to
 * print — the drift assertion, the review-gate mechanism, the lockout reasons —
 * is CARRIED ON THE WIRE (`DeliveryResponse.lockout`,
 * `AcceptanceView.gateMechanism`, `EvidenceChase.referenceNotice`) rather than
 * imported as a constant. deliveryView.ts:1078 says why: a surface cannot render
 * the screen without the lockout notice if the notice arrives inside the payload,
 * whereas an imported constant can be forgotten by deleting one import line.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO UPLOAD, ATTACHMENT, DOCUMENT, FILE, MULTIPART OR FETCH-THAT-URL FUNCTION.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 3 delivers everything AROUND a client's artifact and nowhere to put one.
 * `EvidenceRequest.externalLocation` is INERT TEXT an operator types — where the
 * client says the material lives, in the client's own systems. Nothing here
 * resolves, retrieves, previews, proxies or indexes it, and the page renders it as
 * plain text with no `href` (see `GpsDelivery.tsx`, `ExternalReference`).
 *
 * The gate is decision D2 — LCX's DPO has not answered controller-vs-processor for
 * third-party confidential material — and it is enforced by ratchet, not by
 * discipline: `apps/api/src/gps/__tests__/intakeLockout.test.ts` (20 assertions,
 * mutation-tested against 12 adversarial edits) and, for this module's export
 * list, `pages/__tests__/gpsDelivery.test.tsx`. Adding an upload-shaped export
 * here goes red before it reaches review.
 */

/** The API's read-side envelope, identical to every other compartment's. */
const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

/**
 * The whole delivery screen for one engagement, in one request.
 *
 * ONE call rather than five, because the payload is not five independent reads: the
 * progress view is composed FROM the plan (deliveryView.ts:500 takes an
 * `EngagementPlan`, not milestones, precisely so the unusable-plan case cannot be
 * forgotten), and acceptance is composed from the deliverables AND the same
 * evidence rows the chase list uses (`canAccept` does its own filtering,
 * delivery.ts:966). Fetching those separately would let the screen show a plan from
 * one instant and a percentage from another, which is the class of bug this whole
 * compartment exists to make impossible.
 *
 * `wip` inside the response is DESK-WIDE, not this engagement's. The coordination
 * ceiling is the founder's, drawn on by everything already running, and he does
 * this around a full-time LCX job — so the answer to "can I take another one" can
 * only be computed over the whole desk. The server joins it; the screen does not
 * get to assemble it from a second call and hope the two agree.
 */
export const fetchGpsDelivery = (engagementId: string) =>
  unwrap(request<{ data: DeliveryResponse }>(
    // `/delivery` on the existing engagement resource, matching the shape of
    // `/v1/gps/engagements/:id/proposal` (routes/gps.ts:546) rather than inventing a
    // top-level `/v1/gps/delivery?engagementId=`. NOTE for the human wiring pass:
    // this route DOES NOT EXIST YET — routes/gps.ts is not mine to edit, and the
    // path here is the contract I am asking for, stated in one place so the API's
    // ratchet tests can read it. Encoded because the id reaches this from a URL
    // segment and an unencoded one silently requests a different resource.
    `/v1/gps/engagements/${encodeURIComponent(engagementId)}/delivery`,
    { auth: true },
  ));
