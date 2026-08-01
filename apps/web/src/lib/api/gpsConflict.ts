import { request } from '../apiClient';
import type { GpsConflictCheck, GpsEngagement } from '@lcx/shared';

/**
 * THE CONFLICT WALL — fetchers only (GPS Phase 9, plan §5).
 *
 * `pages/GpsConflict.tsx` is the screen an LCX employee selling market-access-
 * adjacent services can put in front of compliance, a client or an auditor. This
 * module is the only place it talks to the server, and it is deliberately tiny:
 * almost everything the wall renders is either an EXISTING GPS endpoint or a pure
 * function in `packages/shared/src/gps/{perimeter,disclosure}.ts` that needs no
 * server at all.
 *
 * ─── NO RESPONSE INTERFACE IS DECLARED IN THIS FILE ──────────────────────────
 * Not a style preference — a regression guard. `lib/api/gps.ts:80-95` carries the
 * post-mortem: an earlier `GpsSummary` here declared `counts`, `clientCount`,
 * `openValueCents`, `openMarginCents` and `missingConflictChecks`, none of which
 * the API has ever returned. A response interface is a CLAIM about a runtime
 * payload and `tsc` believes it, so the build, the lint and 1081 web tests were
 * green while the page was guaranteed to crash — and it crashed the moment 0047
 * was applied and real data arrived.
 *
 * So the two shapes below are written INLINE at the call site, out of types that
 * are declared exactly once (`packages/shared/src/gps/types.ts`, which mirrors
 * `0047_gps.sql` column-for-column), with the server line that produces each one
 * cited beside it. Nothing here re-describes a row.
 *
 * ─── THERE IS NO UPLOAD, ATTACHMENT, DOCUMENT OR FILE FUNCTION HERE ──────────
 * Same lock as `lib/api/gps.ts:20-33`: decision D2 (whether LCX legal/DPO accepts
 * third-party confidential material on LCX infrastructure) is unanswered, so GPS
 * accepts no client artifact anywhere. A conflict wall is exactly the surface
 * where someone would reach for "attach the signed disclosure PDF"; the answer is
 * that the disclosure TEXT is stored verbatim in a column
 * (`gps_conflict_check.disclosure_text_used`, `types.ts:362`) and that is the
 * defensible record. `pages/__tests__/gpsConflict.test.tsx` reads this module's
 * export list and fails if an upload-shaped name appears.
 */

/** The API's read-side envelope, identical to every other compartment's. */
const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

/**
 * ONE engagement with its conflict check IN FULL — including
 * `disclosureTextUsed`, which is the whole point of the wall and is the one field
 * the list endpoint does not carry (`GpsEngagementRow.conflict` is a
 * `Pick<…, 'decision' | 'decidedBy' | 'decidedAt'>`, `lib/api/gps.ts:57`).
 *
 * Shape mirrors `apps/api/src/routes/gps.ts:333` literally — two named slots,
 * each a shared row type. `data` is `null`, not an error, while `0047_gps.sql` is
 * unapplied (`routes/gps.ts:328`), which is why the null is in the signature: the
 * wall must be able to say "this compartment is not migrated here" instead of
 * throwing an error boundary over an empty page.
 *
 * WHY THE WALL FETCHES THIS PER ENGAGEMENT. It is an N+1 and that is a considered
 * choice: the disclosure text is client-facing legal wording that must be on the
 * PRINTED artifact (D7), so it cannot be lazy-loaded on row expansion, and there
 * is no batch endpoint returning full conflict checks. At the volume this desk
 * actually runs at — ~29 engagements a year (`calibration.ts`
 * `ASSUMED_ANNUAL_ENGAGEMENT_VOLUME`) — that is dozens of requests, not
 * thousands. The page caps the fan-out and STATES the cap rather than silently
 * rendering a partial wall; a wall with rows quietly missing is worse than no
 * wall, because it reads as completeness.
 */
export const fetchGpsEngagementConflict = (engagementId: string) =>
  unwrap(request<{
    data: { engagement: GpsEngagement; conflictCheck: GpsConflictCheck | null } | null;
  }>(`/v1/gps/engagements/${engagementId}`, { auth: true }));

/**
 * WHO CAME IN ON THE SHARED PASSCODE.
 *
 * `apps/api/src/lib/secondTier.ts` has recorded every address arriving on the
 * shared `SECONDARY_PASSCODE` path since that credential shipped (45990fa) and
 * nothing has ever shown it. `apps/api/src/routes/gpsConflict.ts:622` now serves
 * it — `secondTierView()` (`apps/api/src/gps/conflict.ts:1452`), approver-only,
 * DB-free, with the roster comparison already done server-side against `TEAM`.
 *
 * THE PATH IS A DEPENDENCY ON A DECISION THIS FILE DOES NOT OWN. That router
 * deliberately does not mount itself: `app.ts` belongs to a human wiring pass, and
 * `gps/__tests__/intakeLockout.test.ts:315` requires it to be composed INTO
 * `gpsRoutes` rather than mounted beside it, so the sub-path is the wiring pass's
 * choice. `/conflict` is the natural composition of a router named
 * `gpsConflictRoutes`; if the wiring pass picks another, THIS LINE is the only one
 * to change, and until it is mounted at all the request 404s.
 *
 * That 404 is why this constant is exported. The screen names the endpoint it is
 * waiting on and states that it cannot see the credential — because "we cannot
 * observe who used the shared passcode" and "nobody used it" are opposite readings
 * of the same empty table, and a compliance surface may not conflate them. The
 * repo has already paid for an assumed path once: `issueGpsProposal` was written
 * against `/propose` while the server mounts `/proposal` (`lib/api/gps.ts:170`),
 * and nothing typechecked the string.
 */
export const SECOND_TIER_ENDPOINT = '/v1/gps/conflict/sessions';

/**
 * The second-tier view: usage, the non-roster subset, and the honest limits.
 *
 * Shape mirrors `SecondTierView` (`apps/api/src/gps/conflict.ts:1425`) field for
 * field, written inline at the call site for the reason at the top of this file,
 * and it is NOT imported from there — that module is server code (it reads `env`
 * and the `TEAM` roster) and importing it would pull API internals into the
 * browser bundle.
 *
 * BECAUSE THAT MIRRORING IS THE EXACT THING THAT BROKE GPS ONCE, the caller
 * validates the payload at runtime and refuses to render on a mismatch instead of
 * trusting the annotation. A `tsc` type is a claim about a payload, not a check on
 * one; the check has to happen where the data arrives.
 *
 * `unexpected` — addresses NOT on the roster — is the number that says rotate, and
 * it is computed on the server against `TEAM` rather than here against
 * `/v1/access/matrix`: that endpoint is approver-only and can answer with no
 * members pre-0042 (`routes/access.ts:21`), and membership measured against an
 * empty roster would print an all-clear derived from nothing.
 *
 * `limits` is carried verbatim to the screen. The in-memory store forgets every
 * session when the API restarts, and a shared passcode names a credential rather
 * than a person; those sentences travel with the data so a surface cannot
 * accidentally present it as an audit record.
 */
export const fetchSecondTierSessions = () =>
  unwrap(request<{
    data: {
      asOf: string;
      /** False when SECONDARY_PASSCODE is unset — i.e. the second door is closed. */
      configured: boolean;
      usage: Array<{ email: string; firstSeen: string; lastSeen: string; count: number }>;
      unexpected: Array<{ email: string; firstSeen: string; lastSeen: string; count: number }>;
      rosterEmailCount: number;
      rotateAdvised: boolean;
      limits: string[];
    };
  }>(SECOND_TIER_ENDPOINT, { auth: true }));
