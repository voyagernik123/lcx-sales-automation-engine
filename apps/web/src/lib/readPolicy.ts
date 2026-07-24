/**
 * What may be cached, and what must never be (TERMINAL Phase 2).
 *
 * This is the one module in the read layer that must never be wrong, so it is
 * DENY BY DEFAULT: an unrecognised path is `never`. Adding a new endpoint gets
 * you correctness for free and speed only when someone deliberately opts in —
 * the opposite bias would make a forgotten endpoint silently cacheable.
 *
 * Why this matters more than latency: every governance gate in the platform reads
 * its inputs at WRITE time, and three of them fail open on error
 * (apps/api/src/actions/registry.ts:205 for the SAT gate, registry.ts:632 for the
 * distribution compliance gate, apps/api/src/routes/reviews.ts:212-213 for
 * hasActivePremortem). So any value an operator uses to PREDICT a gate outcome
 * must be read live. Serve a stale campaign budget and an approver can launch a
 * token-incentivised campaign at a number the server never evaluated, or
 * pre-emptively mint an audited override against a block that no longer exists.
 * A fast wrong answer here is worse than a slow right one.
 *
 * (An earlier draft of the plan justified this with a "hash-chained audit log".
 * That is false — audit_log has seven columns and no hash. The real reason is the
 * write-time gate evaluation above, which is both true and stronger.)
 */

/** How a GET may be served. */
export type ReadMode =
  /** Always the network. Never stored, never served from a local copy. */
  | 'never'
  /** Serve the cached copy immediately, revalidate in the background. */
  | 'swr'
  /** Immutable for the life of a deploy — no revalidation at all. */
  | 'immutable';

export interface ReadPolicy {
  mode: ReadMode;
  /** How long a stored entry may be served before it is considered stale (ms). */
  freshMs: number;
  /**
   * Memory only — never written to IndexedDB. For high-cardinality keys (search)
   * where persisting would blow the byte budget for no benefit, and for anything
   * whose durability across restarts is not worth the disk footprint.
   */
  memoryOnly?: boolean;
  /** Why this endpoint has this policy. Present on every entry, deliberately. */
  reason: string;
}

const NEVER = (reason: string): ReadPolicy => ({ mode: 'never', freshMs: 0, reason });

const SEC = 1000;
const MIN = 60 * SEC;

/**
 * Paths that must NEVER be cached, exported separately so a test can assert that
 * nothing in the allowlist below can shadow them. The list is the point; the
 * matching is deliberately dumb (prefix), because a clever matcher is a place for
 * a bug to hide in exactly the code that must not have one.
 *
 * Each entry names the concrete harm, not a category.
 */
export const NEVER_CACHE: ReadonlyArray<{ prefix: string; reason: string }> = [
  // grant_entitlement is a blind upsert with no compare-and-swap
  // (registry.ts:417-422), so an approver acting on a stale matrix silently
  // DOWNGRADES a capability another approver just raised — and the audit records
  // it as an intentional grant. /v1/access/requests also returns a different body
  // for approvers vs operators at the SAME URL (access.ts:113-116), so a
  // URL-keyed cache would leak every member's justification text to a
  // non-approver. And the member dossier writes its "who looked, and why" audit
  // row in middleware BEFORE the handler (purpose.ts:17-44) — a cache hit would
  // silently delete the record the checkpoint exists to create.
  { prefix: '/v1/access', reason: 'Entitlements, matrix, requests, dossier: stale reads cause wrong grants and leak across roles.' },
  { prefix: '/v1/audit', reason: 'A stale audit view is indistinguishable from a tampered one.' },
  // The SAT gate needs an ACTIVE premortem + devils_advocate, read at write time,
  // and FAILS OPEN on error (registry.ts:190-216). A cached list still showing
  // "premortem on file" after it moved to draft makes the operator believe the
  // gate will pass; showing "missing" when it exists makes them pre-emptively send
  // overrideSat with a reason — minting an audited override that was never
  // required, which pollutes the governance record worse than a refusal would.
  { prefix: '/v1/reviews', reason: 'SAT gate inputs, read at write time by a gate that fails open.' },
  // A cached response would let one settled payment be replayed indefinitely, and
  // a stale catalog could direct funds to a superseded payTo (x402/seller.ts:46).
  { prefix: '/v1/x402', reason: 'Payment surface: replay and stale payTo address.' },
  // Backed by a process-local in-memory ring that resets on deploy
  // (lib/latency.ts). Caching would show a p95 computed by a process that no
  // longer exists — on the very dashboard this phase is judged by.
  { prefix: '/v1/intel/slo', reason: 'Process-local ring; a cached p95 would describe a dead process.' },
  // Carries budget_lcx and token_incentivized — the compliance gate's inputs,
  // read fresh at write time, with no expected-current-status guard on the status
  // write (registry.ts:602-660). The cockpit renders these, so a stale
  // "5,000 LCX — within budget" lets an approver launch a campaign someone
  // re-budgeted to 50,000.
  { prefix: '/v1/distribution/campaigns', reason: 'Carries the compliance gate inputs (budget_lcx, token_incentivized).' },
  // Stream-first, not request-first: there is a live SSE channel, and mark-read is
  // a GLOBAL mutation, so one operator reading changes what everyone else sees.
  { prefix: '/v1/notifications', reason: 'Live SSE stream; mark-read is a global mutation.' },
  // decideApproval is idempotent and returns the existing row once decided
  // (deals/approvals.ts:179-216), so a second approver acting on a stale queue
  // gets a SUCCESS response while nothing happened and no sign-off was recorded.
  { prefix: '/v1/dealdesk', reason: 'Approvals queue: a stale row makes a no-op read as success.' },
];

/**
 * Explicit opt-ins. Everything absent from this table is `never`.
 *
 * Ordering is irrelevant by construction: the never-list is checked first and
 * cannot be overridden, and lookup here is longest-prefix so a more specific
 * entry always wins over a broader one. That removes the "first match wins"
 * fragility where reordering the table silently changes behaviour.
 */
const ALLOW: ReadonlyArray<{ prefix: string; policy: ReadPolicy }> = [
  {
    prefix: '/v1/command/deep',
    policy: {
      mode: 'swr',
      freshMs: 5 * MIN,
      // The `reference` half is compiled seed data, immutable for the life of a
      // deploy (~112KB); the `live` half is desk state, so the whole response
      // revalidates rather than being treated as immutable. Fetched twice on one
      // page today.
      reason: 'Heaviest read; compiled reference plus a live block.',
    },
  },
  {
    prefix: '/v1/distribution/deep',
    policy: {
      mode: 'swr',
      freshMs: 5 * MIN,
      // 22KB, requested by five different pages.
      reason: 'Compiled reference plus a live block.',
    },
  },
  {
    prefix: '/v1/command/overview',
    policy: {
      mode: 'swr',
      freshMs: 2 * MIN,
      reason: 'Read-only aggregate; no gate inputs.',
    },
  },
  {
    prefix: '/v1/distribution/listings',
    policy: {
      mode: 'swr',
      freshMs: 60 * SEC,
      // The compliance gate reads campaigns, not listings. Short window so a
      // colleague's edit surfaces quickly.
      reason: 'Working state, not a gate input.',
    },
  },
  {
    prefix: '/v1/projects',
    policy: {
      mode: 'swr',
      freshMs: 60 * SEC,
      // Measured p50 334ms with a tail to 1.9s — the biggest felt win. Note the
      // deliberate carve-out below: /v1/projects/:id/gate is never cached.
      reason: 'The BD list; measured p50 334ms with a 1.9s tail.',
    },
  },
  {
    prefix: '/v1/me/desk',
    policy: {
      mode: 'swr',
      freshMs: 60 * SEC,
      // Owner-scoped by SQL predicate (routes/me.ts:44-103) and the key already
      // includes the operator, so it cannot cross operators. Its four blocks
      // degrade to [] independently, so a partly stale view is coherent.
      reason: 'The landing surface; owner-scoped and independently degradable.',
    },
  },
  {
    prefix: '/v1/decisions',
    policy: {
      mode: 'swr',
      freshMs: 60 * SEC,
      reason: 'Append-mostly, read constantly, not a gate input.',
    },
  },
  {
    prefix: '/v1/wbr',
    policy: {
      mode: 'swr',
      freshMs: 10 * MIN,
      reason: 'A weekly report; recomputing per visit is waste.',
    },
  },
  {
    prefix: '/v1/kpis',
    policy: {
      mode: 'swr',
      freshMs: 5 * MIN,
      reason: 'Slow-moving aggregates; no gate depends on them.',
    },
  },
  {
    prefix: '/v1/graph/explorations',
    policy: {
      mode: 'swr',
      freshMs: 60 * SEC,
      reason: 'Owner-scoped; the key carries the operator.',
    },
  },
];

/**
 * Paths inside an allowed prefix that are nonetheless never cacheable. Checked
 * with the never-list, so a broad allow can never accidentally cover them.
 */
const ALLOW_EXCEPTIONS: ReadonlyArray<{ match: (p: string) => boolean; reason: string }> = [
  {
    match: (p) => /^\/v1\/projects\/[^/]+\/gate$/.test(p),
    // Computes pass/fail from live state including the outreach `suppressed` flag
    // (routes/projects.ts:1062-1121). A cached `pass: true` on a since-suppressed
    // project invites outreach to a suppressed target.
    reason: 'Gate verdict computed from live state incl. the suppressed flag.',
  },
];

/** True when a search-ish key would explode cardinality if persisted. */
function isHighCardinality(pathWithQuery: string): boolean {
  const q = pathWithQuery.split('?')[1];
  if (!q) return false;
  return /(^|&)(q|search|term|query)=/.test(q);
}

/**
 * The policy for a GET. `pathWithQuery` is the canonical path (see readCache).
 *
 * Deny by default: anything not explicitly allowed is `never`.
 */
export function policyFor(pathWithQuery: string): ReadPolicy {
  const path = pathWithQuery.split('?')[0];

  // 1. The never-list wins over everything. Checked first, cannot be shadowed.
  for (const entry of NEVER_CACHE) {
    if (path === entry.prefix || path.startsWith(`${entry.prefix}/`)) {
      return NEVER(entry.reason);
    }
  }

  // 2. Carve-outs inside otherwise-allowed prefixes.
  for (const ex of ALLOW_EXCEPTIONS) {
    if (ex.match(path)) return NEVER(ex.reason);
  }

  // 3. Longest matching opt-in wins, so ordering the table cannot change meaning.
  let best: { prefix: string; policy: ReadPolicy } | null = null;
  for (const entry of ALLOW) {
    if (path === entry.prefix || path.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  if (!best) {
    return NEVER('Not explicitly allowed; the read layer denies by default.');
  }

  if (isHighCardinality(pathWithQuery)) {
    // Search keys are high-cardinality: persisting them fills the byte budget
    // with entries nobody reads twice.
    return { ...best.policy, memoryOnly: true, reason: `${best.policy.reason} (memory-only: search key)` };
  }
  return best.policy;
}

/** Convenience for call sites that only need a yes/no. */
export function isCacheable(pathWithQuery: string): boolean {
  return policyFor(pathWithQuery).mode !== 'never';
}
