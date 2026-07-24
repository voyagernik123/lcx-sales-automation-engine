/**
 * What a governed write makes stale (TERMINAL Phase 2).
 *
 * After `invokeAction` succeeds, some cached reads no longer describe reality.
 * This maps an action to the read prefixes it dirties.
 *
 * Two design choices worth stating, because both are easy to get wrong:
 *
 * **Mark stale, never delete.** A single task-status flip dirties a nine-query
 * rollup, a Monte Carlo launch date and a readiness dial — none of which the
 * client can recompute. Deleting those entries would show the operator an empty
 * panel where a slightly-old one would have done, which is the exact
 * blank-screen pattern this phase exists to remove. So entries stay, flagged for
 * immediate revalidation.
 *
 * **Over-invalidate rather than under-invalidate.** A prefix that is too broad
 * costs one extra background request. A prefix that is too narrow shows an
 * operator a value the server has already changed. Those costs are not
 * comparable, so every mapping below errs wide, and anything unrecognised
 * invalidates everything cacheable.
 */

import { markStale } from './readCache';

/**
 * Action id (or prefix) → read prefixes it dirties.
 *
 * Keys are matched by prefix, so `command_task_` covers every task action
 * without enumerating them, and a new sibling action inherits the mapping
 * instead of silently getting none.
 */
const MAP: ReadonlyArray<{ action: string; dirties: readonly string[] }> = [
  // Program: tasks, decisions, partners and risks all feed the same rollups —
  // the overview aggregate, the deep read and the weekly report.
  { action: 'command_', dirties: ['/v1/command', '/v1/decisions', '/v1/wbr', '/v1/kpis', '/v1/me/desk'] },

  // Distribution: listings and campaigns share the deep read and the cockpit.
  // (Campaign reads themselves are never cached — they are gate inputs.)
  { action: 'dist_', dirties: ['/v1/distribution', '/v1/wbr', '/v1/kpis', '/v1/me/desk'] },

  // BD: project and deal mutations move the list, the boards and the KPIs.
  { action: 'project_', dirties: ['/v1/projects', '/v1/kpis', '/v1/me/desk'] },
  { action: 'deal_', dirties: ['/v1/projects', '/v1/kpis', '/v1/wbr', '/v1/me/desk'] },

  // Access grants change what the nav and every workspace guard should show.
  // The access reads are never cached, but MY DESK is, and it is entitlement
  // shaped — so it must not survive a grant.
  { action: 'grant_entitlement', dirties: ['/v1/me/desk'] },
  { action: 'revoke_entitlement', dirties: ['/v1/me/desk'] },

  // Reviews gate other actions. The review reads are never cached; the surfaces
  // that summarise review state are.
  { action: 'review_', dirties: ['/v1/command', '/v1/distribution', '/v1/me/desk'] },
];

/** Everything the cache is allowed to hold, for the unknown-action fallback. */
const EVERYTHING = [
  '/v1/command',
  '/v1/distribution',
  '/v1/projects',
  '/v1/decisions',
  '/v1/wbr',
  '/v1/kpis',
  '/v1/me/desk',
  '/v1/graph/explorations',
];

/**
 * Call after a governed write SUCCEEDS. Returns how many entries were marked, so
 * a caller can log or assert it.
 *
 * An unknown action invalidates everything cacheable. That is deliberate: the
 * failure mode of a forgotten mapping is an operator acting on a value the
 * server already changed, and one extra round of background revalidation is a
 * trivial price to make that impossible.
 */
export function invalidateAfterAction(actionId: string): number {
  const matches = MAP.filter((m) => actionId.startsWith(m.action));
  const prefixes = matches.length > 0 ? [...new Set(matches.flatMap((m) => m.dirties))] : EVERYTHING;
  return markStale(prefixes);
}

/** Exposed for the test that asserts every mapping targets a real read prefix. */
export const INVALIDATION_MAP = MAP;
export const ALL_CACHEABLE_PREFIXES = EVERYTHING;
