/**
 * How search groups become ⌘K rows.
 *
 * Two properties, and both are reachability properties rather than layout ones:
 *
 *  1. EVERY MATCHED GROUP GETS A ROW BEFORE ANY GROUP GETS A SECOND ONE. The old
 *     fill was `for group { take 5 }`, so a query matching eight projects and one
 *     program partner spent slots on projects and the partner never appeared —
 *     which means `command_set_partner_stage` was unreachable FOR THAT QUERY even
 *     though the vocabulary was right. A fixed gate on the api side cannot fix a
 *     row list that never shows the row.
 *
 *  2. THE CAP HOLDS ON EVERY PATH. /v1/search can emit fourteen groups; the first
 *     pass is unbounded by construction (one per group), so the fill loop's early
 *     return has to apply the cap too. It did not, and no browser on this database
 *     could show it: eleven simultaneous groups need seeded news, notes, campaigns
 *     and an access request all matching one string, and market_news is empty here.
 *     That is the case for pinning it in a unit test.
 */

import { describe, it, expect } from 'vitest';
import { flattenGroups, OBJECT_ROWS } from '../CommandBody';
import type { SearchGroup } from '@/lib/objectRegistry';

/** A group with `n` items, shaped exactly as the route emits it. */
function group(key: string, subjectType: string, n: number, inspector?: SearchGroup['inspector']): SearchGroup {
  return {
    key,
    label: `${key} plural`,
    typeLabel: key,
    subjectType,
    ...(inspector ? { inspector } : {}),
    count: n,
    items: Array.from({ length: n }, (_, i) => ({ id: `${key}-${i}`, label: `${key} item ${i}` })),
  };
}

/** The real fourteen, in route order, each with enough items to overflow. */
const FOURTEEN: SearchGroup[] = [
  group('projects', 'project', 8, 'project'),
  group('contacts', 'contact', 8, 'contact'),
  group('deals', 'deal', 8, 'deal'),
  group('notes', 'document', 8, 'document'),
  group('news', 'signal', 8, 'signal'),
  group('command_tasks', 'command_task', 8),
  group('command_decisions', 'command_decision', 8),
  group('command_partners', 'command_partner', 8),
  group('command_requirements', 'command_requirement', 8),
  group('command_blockers', 'command_blocker', 8),
  group('dist_listings', 'dist_listing', 8),
  group('dist_campaigns', 'dist_campaign', 8),
  group('access_requests', 'access_request', 8),
  group('members', 'member', 8),
];

describe('flattenGroups', () => {
  it('never returns more rows than the cap, even with more groups than slots', () => {
    // THE MUTATION THAT PROVES THIS: change the fill loop's
    // `return rows.slice(0, OBJECT_ROWS)` back to `return rows` and this goes red
    // with `expected 14 to be less than or equal to 10`.
    expect(FOURTEEN.length).toBeGreaterThan(OBJECT_ROWS); // the guard's premise
    const rows = flattenGroups(FOURTEEN);
    expect(rows.length).toBeLessThanOrEqual(OBJECT_ROWS);
    expect(rows.length).toBe(OBJECT_ROWS);
  });

  it('gives a one-item group its row before a big group gets a second', () => {
    const rows = flattenGroups([
      group('projects', 'project', 8, 'project'),
      group('command_partners', 'command_partner', 1),
    ]);
    const partnerAt = rows.findIndex((r) => r.noun?.type === 'command_partner');
    expect(partnerAt, 'the only partner match must be on screen at all').toBeGreaterThanOrEqual(0);
    expect(partnerAt, 'and not buried below eight projects').toBe(1);
  });

  it('carries the registry subject type onto every row it emits', () => {
    // The reachability property, at the row level: a row with no noun cannot reach
    // a verb no matter what the registry says.
    const rows = flattenGroups(FOURTEEN);
    expect(rows.every((r) => r.noun !== undefined)).toBe(true);
    expect(new Set(rows.map((r) => r.noun!.type)).size).toBe(rows.length);
  });

  it('keeps a group with no items out of the row list entirely', () => {
    const rows = flattenGroups([group('projects', 'project', 0), group('members', 'member', 2)]);
    expect(rows.map((r) => r.noun?.type)).toEqual(['member', 'member']);
  });
});
