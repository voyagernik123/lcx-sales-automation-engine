import { request } from '../apiClient';
import type {
  ClientStatus, ConflictDecision, ContractingEntity, EngagementStatus,
  GpsClient, GpsConflictCheck, GpsEngagement, OfferKey,
} from '@lcx/shared';

/**
 * GLOBAL SERVICES (GPS) — the browser's view of the services desk.
 *
 * Mirrors `apps/api/src/routes/gps.ts` the way `lib/api/marketing.ts` mirrors
 * `routes/marketing.ts`: thin, typed, one function per endpoint, `unwrap` peeling
 * the envelope, `auth: true` on everything. Row shapes are NOT redeclared here —
 * `GpsClient`, `GpsEngagement` and `GpsConflictCheck` come from `@lcx/shared`
 * (`packages/shared/src/gps/types.ts`), which mirrors `0047_gps.sql`
 * column-for-column. One vocabulary across migration, API and screen; a column
 * rename breaks the build in all three at once instead of drifting.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE IS DELIBERATELY NO UPLOAD, ATTACHMENT, DOCUMENT OR FILE FUNCTION HERE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 1 accepts no client artifact, by construction, because decision D2 is
 * unanswered — whether LCX legal/DPO accepts third-party confidential material
 * on LCX infrastructure (`GPS_IMPLEMENTATION_PLAN.md` §3 D2, §4 S0.4). The
 * offers name `requiredClientInputs`, and those are collected in conversation on
 * whatever channel the client already uses. Naming an input does not create a
 * place to put it.
 *
 * `pages/__tests__/gps.test.tsx` ratchets this: it reads this module's export
 * list and fails if an upload-shaped function appears. Adding one here is the
 * first step in defeating the gate, so it has to be a red test, not a code
 * review someone was busy for.
 *
 * WHAT IS NOT IMPORTED, ON PURPOSE: nothing from `@lcx/shared`'s `alpha.ts`.
 * Its composites score LCX LISTING propensity and treat `listedOnLcx: true` as
 * REDUCING opportunity (`alpha.ts:80`), which is inverted for a services
 * business — an already-listed project is an excellent client (plan §1.2).
 */

/** The API's read-side envelope, identical to every other compartment's. */
const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);

/**
 * An engagement as the LIST needs it: the row plus the two things a list cannot
 * usefully render without a join.
 *
 * `clientName` because "0f3c…-9a1b" is not a client, and `conflict` because
 * whether the check exists is the one fact this desk must never have to click
 * into a detail view to discover — the founder is an LCX employee, and a
 * proposal issued without a recorded check is the failure this compartment was
 * built to make visible (plan §5).
 *
 * Margin is NOT a field. It is derived on the screen from `priceCents` and
 * `vendorCostCents` via `marginCents()`, exactly as the migration derives it and
 * never stores it, so the number on screen cannot disagree with the arithmetic.
 */
export interface GpsEngagementRow extends GpsEngagement {
  clientName: string;
  /** Null when no check has been recorded — which is the point of the field. */
  conflict: Pick<GpsConflictCheck, 'decision' | 'decidedBy' | 'decidedAt'> | null;
}

/**
 * The desk header numbers.
 *
 * `migrated` follows the pattern `MarketingSummary.migrated` established
 * (`lib/api/marketing.ts:50`): between a deploy and its migration the
 * compartment reports itself not-yet-enabled rather than throwing, so the page
 * shows an amber banner instead of an error boundary. GPS is migration 0047.
 */
/** One currency's rollup. Money is integer cents, always. */
export interface GpsCurrencyTotal {
  currency: string;
  count: number;
  priceCents: number;
  vendorCostCents: number;
  marginCents: number;
}

/**
 * MIRRORS `DeskSummary` in `apps/api/src/gps/service.ts:1053`. The API is the
 * source of truth for this shape and this interface must follow it.
 *
 * WHY THAT SENTENCE IS HERE. The first version of this file declared a completely
 * different summary — `counts`, `clientCount`, `openValueCents`, `openMarginCents`,
 * `missingConflictChecks` — none of which the API has ever returned. TypeScript
 * cannot catch that: a response interface is a CLAIM about a runtime payload, and
 * the compiler believes it. So `tsc`, lint and 1081 web tests were all green while
 * the page was guaranteed to crash.
 *
 * It crashed exactly when the data arrived, too, not before: while 0047 was pending
 * the page short-circuited on `migrated: false` and rendered its banner, never
 * touching these fields. Applying the migration was what turned a green build into
 * `Cannot convert undefined or null to object` from `Object.entries(s.counts)`.
 *
 * If you change the server shape, change it here in the same commit. The safest
 * pattern is to read the API's own interface and copy it, which is what this now is.
 */
export interface GpsSummary {
  /** False until `0047_gps.sql` is applied on this environment. */
  migrated: boolean;
  clients: { total: number; byStatus: Record<string, number> };
  engagements: {
    total: number;
    byStatus: Record<string, number>;
    byOffer: Record<string, number>;
  };
  /** Non-terminal engagements: what is actually in play. */
  openByCurrency: GpsCurrencyTotal[];
  /** `collected` only — cash in, not bookings. */
  collectedByCurrency: GpsCurrencyTotal[];
  awaitingDeposit: {
    count: number;
    byCurrency: Array<{ currency: string; depositRequiredCents: number }>;
    oldestAcceptedDays: number | null;
  };
  /** The things a desk should be uncomfortable about, counted so they get acted on. */
  gaps: {
    missingConflictCheck: number;
    conflictDeclined: number;
    unpriced: number;
    depositWithoutAcceptance: number;
    unstaffable: number;
  };
  catalogue: {
    priceBandsArePlaceholders: boolean;
    depositPolicyIsPlaceholder: boolean;
    blockingTodoCount: number;
  };
}

export const fetchGpsSummary = () =>
  unwrap(request<{ data: GpsSummary }>('/v1/gps/summary', { auth: true }));

export const fetchGpsClients = () =>
  unwrap(request<{ data: GpsClient[] }>('/v1/gps/clients', { auth: true }));

export const createGpsClient = (body: {
  name: string;
  legalEntity?: string;
  jurisdiction?: string;
  primaryContact?: string;
  status?: ClientStatus;
}) => unwrap(request<{ data: GpsClient }>('/v1/gps/clients', { method: 'POST', body, auth: true }));

export const fetchGpsEngagements = (status?: EngagementStatus) =>
  unwrap(request<{ data: GpsEngagementRow[] }>(
    `/v1/gps/engagements${status ? `?status=${status}` : ''}`, { auth: true },
  ));

/**
 * Create the quote. Price and vendor cost are integer cents and are sent as the
 * desk set them — the server does not "helpfully" default a price from the
 * catalogue band, because the bands are placeholders until D4 and a
 * server-invented price is the exact thing this build must not do.
 */
export const createGpsEngagement = (body: {
  clientId: string;
  offerKey: OfferKey;
  contractingEntity: ContractingEntity;
  priceCents: number;
  vendorCostCents: number;
  depositRequiredCents: number;
  currency?: string;
  projectId?: string;
  owner?: string;
}) => unwrap(request<{ data: GpsEngagementRow }>(
  '/v1/gps/engagements', { method: 'POST', body, auth: true },
));

/**
 * Issue the proposal — the governed act, and the reason this surface exists.
 *
 * The body carries NO attribution: who issued it comes from the session, the
 * same rule `approveDraft` follows (`lib/api/marketing.ts:78`). A client that
 * could name its own issuer is a client that can forge one.
 *
 * The server is expected to refuse when no conflict check is recorded. The UI
 * ALSO refuses, and that duplication is deliberate rather than sloppy: the
 * button being disabled is what teaches the desk the rule, and the server check
 * is what enforces it.
 */
export const issueGpsProposal = (engagementId: string) =>
  unwrap(request<{ data: GpsEngagementRow }>(
    // `/proposal`, not `/propose`. This said `/propose` — an assumed contract,
    // written before routes/gps.ts existed — and the server mounts
    // `POST /v1/gps/engagements/:id/proposal` (routes/gps.ts:546). Every click of
    // the button this file exists for would have 404'd, and nothing typechecked
    // the string. Corrected on the client because the API's ratchet tests read
    // routes/gps.ts as the contract.
    `/v1/gps/engagements/${engagementId}/proposal`, { method: 'POST', auth: true },
  ));

/**
 * Record the conflict check. `decidedBy` is NOT in the body for the same reason.
 *
 * HONEST LIMIT, recorded here because it is easy to over-claim: attribution is
 * only as strong as the shared `DESK_PASSCODE` (plan §1.5 — "per-person
 * attribution you could show a client: ABSENT"). This row is a real, dated,
 * verbatim record of what was checked and what was disclosed; it is not proof of
 * WHO checked, and nothing in the UI may imply that it is.
 */
export const recordGpsConflictCheck = (engagementId: string, body: {
  checkPerformed: string;
  decision: ConflictDecision;
  disclosureTextUsed?: string;
}) => unwrap(request<{ data: GpsConflictCheck }>(
  `/v1/gps/engagements/${engagementId}/conflict-check`, { method: 'POST', body, auth: true },
));
