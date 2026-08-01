import { request } from '../apiClient';

/**
 * GLOBAL SERVICES — ORIGINATION (Phase 8): the browser's view of the targeting
 * engine that has existed, tested, for five phases and never had a surface.
 *
 * FETCHERS ONLY. Two GETs and nothing else, because origination is a read: the
 * only write this surface can lead to is a human approving an opening, and that
 * goes through the existing send-gate discipline, not through here
 * (`gps/origination.ts:900` — `ProposedOpening.approvedForSend` is the literal
 * `false`, so no code path from this module can construct an approved one).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO RESPONSE SHAPE IS DECLARED IN THIS FILE. That is the rule, and it is the
 * rule because GPS already shipped the bug it prevents: `lib/api/gps.ts:60`
 * carries the post-mortem — a hand-written `GpsSummary` claiming `counts`,
 * `clientCount`, `openValueCents` that the API had never returned. `tsc` believed
 * the copy, the mocked page test agreed with the copy, and the page was
 * guaranteed to crash the moment `0047_gps.sql` was applied. A response interface
 * is a CLAIM about a runtime payload; the compiler cannot check a claim.
 *
 * So `OriginationResponse` and `BriefResponse` are declared exactly once, in
 * `packages/shared/src/gps/origination.ts:1192` and `:1235`, and the API and this
 * module import THAT declaration. Re-exported below so the page has one import
 * site and so the deep path appears in exactly one line of the web app.
 *
 * WIRED (P13): `gps/index.ts` re-exports `origination.ts`, so the statements below
 * name `@lcx/shared`. A path swap, not a contract change — the declarations they
 * name were already the shared ones.
 */
export type {
  OriginationResponse,
  OriginationQueue,
  QueueRow,
  DeferredCut,
  RefusalLedger,
  RefusalEntry,
  RefusalDisposition,
  FactProvenance,
  WhyNowTrigger,
  TriggerState,
  TriggerKind,
  BriefResponse,
  ResearchBrief,
  BriefAssertion,
  BriefSection,
  BriefIntegrity,
  BriefViolation,
  BriefEstimate,
  ProposedOpening,
  AssertionStatus,
} from '@lcx/shared';

export {
  provenanceLabel,
  BRIEF_SECTION_LABELS,
  BRIEF_SECTION_ORDER,
  TRIGGER_KIND_LABELS,
  QUEUE_CAPACITY_DEFAULT,
  FACT_STALE_CONFIDENCE,
} from '@lcx/shared';

import type {
  BriefResponse,
  OriginationResponse,
} from '@lcx/shared';
import { unwrapWithMeta } from './meta.js';

/** The API's read-side envelope, identical to every other compartment's. */
// The envelope's `meta` used to die here — see lib/api/meta.ts. `unwrapWithMeta`
// attaches it under a non-enumerable symbol, so no call site or type changes and
// `responseMeta(x)` / `isMigrated(x)` can finally answer.
const unwrap = unwrapWithMeta;

/**
 * The queue, the deferred cut, the refusal ledger and the derived counts.
 *
 * ONE call, not three. The counts on this payload are derived by
 * `originationResponse()` from the very arrays it ships (`origination.ts:1210`),
 * and splitting the fetch would let a screen render a count from one response
 * beside rows from another — which is how a header comes to disagree with the
 * table under it. `considered === queued + deferred + refused` is asserted in the
 * shared tests; it only stays true if the surface reads them together.
 *
 * `capacity` is a query parameter and not a client default: `QUEUE_CAPACITY_DEFAULT`
 * (12) is a STATED PRIOR about how much real calling fits in his day
 * (`origination.ts:544`), and a prior belongs on the server that reports its own
 * basis. Passing it is for an operator who deliberately wants a longer look.
 */
export const fetchOriginationQueue = (capacity?: number) =>
  unwrap(request<{ data: OriginationResponse }>(
    `/v1/gps/origination${capacity != null ? `?capacity=${capacity}` : ''}`,
    { auth: true },
  ));

/**
 * One target's research brief, with its refusal beside it when it has one.
 *
 * `refusal` travels WITH the brief rather than instead of it (`origination.ts:1229`):
 * a brief for a refused target is legitimate — you still need to know who they are
 * before you write the decline — and a surface that renders the brief without the
 * gate has rebuilt the silent exclusion this phase exists to remove (D2).
 */
export const fetchTargetBrief = (targetId: string) =>
  unwrap(request<{ data: BriefResponse }>(
    `/v1/gps/origination/${encodeURIComponent(targetId)}/brief`,
    { auth: true },
  ));
