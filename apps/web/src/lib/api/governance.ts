import { request } from '../apiClient';

/**
 * THE CONTROL REGISTER — the browser's view of governed acts that succeeded while a
 * control did not run.
 *
 * ONE GET AND NOTHING ELSE. Every remedy this surface points at already has a write
 * path that owns it: a missing review is filed at `POST /v1/reviews`, and a decision
 * is re-opened through the action registry. A second write path from a governance
 * report is how two surfaces come to disagree about what "reviewed" means.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS A MIRROR OF A CONTRACT THAT SHOULD NOT NEED MIRRORING.
 * ─────────────────────────────────────────────────────────────────────────────
 * The declaration lives at `apps/api/src/access/controlRegister.ts` under the
 * `THE CONTRACT` banner. It belongs in `packages/shared`, so that the API composer
 * and this module import ONE declaration and a copy is impossible — which is the
 * arrangement `lib/api/gps.ts:60` records the post-mortem of. A hand-written
 * `GpsSummary` in this directory claimed `counts`, `clientCount` and
 * `openValueCents`; the API had never returned any of the three; `tsc` believed the
 * copy because a copy is syntactically perfect; and the page's own test agreed with
 * the copy because the test mocked this module. Two artefacts agreeing with each
 * other is not a contract.
 *
 * `packages/shared` is owned by another lane this pass, so the copy could not be
 * avoided — but it is not left on trust. `apps/api/src/access/__tests__/
 * controlRegister.test.ts` reads BOTH files from disk, strips their comments, extracts
 * only 2-space-indented field DECLARATIONS, and asserts the two name sets are EQUAL.
 *
 * BOTH DIRECTIONS, AND THE COMMENTS ARE STRIPPED, because the first version of that
 * ratchet guarded neither. It grepped `\bfieldName\b` over the whole web file and only
 * API→web, so (a) adding `passRatePct`, `clientCount` and `openValueCents` to the web
 * mirror — literally reinstating two of gps.ts's three phantom fields, which is the
 * failure the post-mortem is ABOUT — passed, and (b) adding `review`, `complete` and
 * `counts` to the API contract also passed, because those words appear in this comment
 * banner. Moving the block into shared and deleting the mirror is still owed work.
 */

/** What the marker on a row actually says happened. */
export type ControlFinding = 'gate_not_evaluated' | 'override_accepted' | 'idempotency_degraded';

/** Whether the review that was missing at the time was ever filed afterwards. */
export type Remediation = 'filed' | 'not_filed' | 'unknown';

export interface MarkerEpoch {
  marker: string;
  commit: string;
  date: string;
  site: string;
}

export interface ConsequenceComponent {
  key: string;
  points: number;
  because: string;
}

export interface ControlRegisterRule {
  instrument: string;
  provision: string;
  text: string;
}

export interface ControlRegisterRefusal {
  code: string;
  sentence: string;
  rule: ControlRegisterRule;
}

export interface ControlRegisterRow {
  auditId: string;
  occurredAt: string;
  actor: string;
  actorIsMachine: boolean;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  findings: ControlFinding[];
  gateDegradedReason: string | null;
  overrideReason: string | null;
  idempotencyReason: string | null;
  programCritical: boolean;
  remediation: Remediation;
  /** `null` means the review register was not read — NOT that nothing was filed. */
  reviewKindsAfter: string[] | null;
  firstReviewAfter: string | null;
  recurrence: number;
  consequence: number;
  consequenceComponents: ConsequenceComponent[];
}

export interface ControlRegisterFrame {
  observedAt: string;
  windowFrom: string;
  windowTo: string;
  windowDays: number;
  environment: string;
  source: 'audit_log.meta';
  /** `null` is ambiguous on its own — read it beside `auditLogEmpty`. */
  earliestReachableRow: string | null;
  /**
   * `null` the aggregate was not read · `true` read and audit_log holds no rows ·
   * `false` read and rows exist. Without this, `earliestReachableRow: null` meant BOTH
   * "the table does not exist" and "the table is empty" — `MIN()` over zero rows is
   * NULL on real Postgres — and the page rendered the second as "could not be read".
   */
  auditLogEmpty: boolean | null;
  indexesApplied: boolean;
}

export interface ControlRegisterCoverage {
  /** Always the literal `false`. The API's type forbids anything else. */
  complete: false;
  statement: string;
  covers: string[];
  doesNotCover: string[];
}

/** EVERY count is nullable. `null` means the read did not happen — never 0. */
export interface ControlRegisterCounts {
  markedInWindow: number | null;
  /** Audit rows FETCHED — a key-existence superset, so it may legitimately exceed `shown`. */
  scanned: number | null;
  /** Rows actually PUBLISHED in `rows`. Below `scanned` or `markedInWindow` means truncation. */
  shown: number | null;
  governedActsInWindow: number | null;
  cleanInWindow: number | null;
}

export interface UnverifiableBucket {
  governedActsInWindow: number | null;
  governedActsAllTime: number | null;
  boundary: string;
  epochs: MarkerEpoch[];
}

export interface GateErrorBucket {
  state: 'not_loaded' | 'present_but_withheld' | 'empty';
  count: number | null;
  earliest: string | null;
  latest: string | null;
  withheldWhy: string | null;
}

export interface ControlRegister {
  contract: string;
  frame: ControlRegisterFrame;
  coverage: ControlRegisterCoverage;
  /** `null` means NOT LOADED. `[]` means genuinely no markers in the window. */
  rows: ControlRegisterRow[] | null;
  counts: ControlRegisterCounts;
  unverifiable: UnverifiableBucket;
  gateErrors: GateErrorBucket;
  refusals: ControlRegisterRefusal[];
}

export async function fetchControlRegister(params: {
  windowDays?: number;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<ControlRegister> {
  const qs = new URLSearchParams();
  if (params.windowDays) qs.set('windowDays', String(params.windowDays));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return request<ControlRegister>(
    `/v1/governance/control-register${q ? `?${q}` : ''}`,
    { auth: true, signal: params.signal },
  );
}
