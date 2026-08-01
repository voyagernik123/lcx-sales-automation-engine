import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTION_REGISTRY, subjectTypeWorkspace } from '../registry.js';

/**
 * THREE UNTAGGED ACTIONS COULD WRITE A GPS ENGAGEMENT'S AUDIT TRAIL.
 *
 * `invokeAction`'s compartment gate keyed off `action.workspace` — the compartment the
 * VERB belongs to. `watchlist_add`, `flag_review` and `notify` are cross-cutting and
 * carry no tag (`subjectTypes: ['*']`), so the gate was skipped for them entirely. And
 * any of them accepts `subjectType: 'gps_engagement'`.
 *
 * `POST /v1/actions/watchlist_add/invoke {"subjectType":"gps_engagement","subjectId":…}`
 * with the shared machine key therefore inserted `object_actions` and an `audit_log` row
 * stamped `entity='gps_engagement'` with free text in `meta`, against an engagement id it
 * never had to prove exists. `POST /v1/intel/actions` was a second door with the same
 * shape and a 2,000-character `note_add`.
 *
 * The subject's compartment is now gated too, in BOTH doors.
 */

const REGISTRY = readFileSync(new URL('../registry.ts', import.meta.url), 'utf8');
const INTEL = readFileSync(new URL('../../intel/actions.ts', import.meta.url), 'utf8');

describe('a subject type carries its own compartment', () => {
  it('maps every gps_ subject to the gps compartment', () => {
    expect(subjectTypeWorkspace('gps_engagement')).toBe('gps');
    expect(subjectTypeWorkspace('gps_client')).toBe('gps');
    expect(subjectTypeWorkspace('gps_deliverable')).toBe('gps');
    expect(subjectTypeWorkspace('gps_anything_added_later')).toBe('gps');
  });

  it('leaves other subject types unmapped, so nothing that worked stops working', () => {
    for (const t of ['project', 'deal', 'token', 'campaign', 'listing', '*', '']) {
      expect(subjectTypeWorkspace(t), t).toBeNull();
    }
  });

  it('is not fooled by a suffix or an infix', () => {
    // A prefix map, deliberately — and it must be a PREFIX.
    expect(subjectTypeWorkspace('not_gps_engagement')).toBeNull();
    expect(subjectTypeWorkspace('xgps_engagement')).toBeNull();
  });
});

describe('the three untagged actions that reach a GPS subject are now gated', () => {
  it('confirms they really are untagged — otherwise this test is vacuous', () => {
    for (const id of ['watchlist_add', 'flag_review', 'notify']) {
      const a = ACTION_REGISTRY[id];
      expect(a, `${id} is gone from the registry`).toBeTruthy();
      expect(a!.workspace, `${id} gained a workspace tag; re-read this test`).toBeUndefined();
      // …and each still accepts any subject type, which is what made it reachable.
      expect(a!.subjectTypes).toContain('*');
    }
  });

  it('invokeAction gates on the SUBJECT workspace as well as the action workspace', () => {
    expect(REGISTRY).toContain('subjectTypeWorkspace(input.subjectType)');
    // Both gates, in one loop, so a future third gate cannot be added to only one path.
    expect(REGISTRY).toMatch(/for \(const g of gates\)/);
    expect(REGISTRY).toMatch(/capAtLeast\(entitlements\[g\.workspace\], g\.needed\)/);
  });

  it('runs the gate BEFORE the params are parsed and before the executor', () => {
    const gate = REGISTRY.indexOf('subjectTypeWorkspace(input.subjectType)');
    const parse = REGISTRY.indexOf('action.paramsSchema.safeParse');
    expect(gate).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(parse);
  });

  it('requires operate, not view, on the subject compartment', () => {
    // An action is a write. `view` would let a reader stamp the audit trail.
    expect(REGISTRY).toMatch(/subjectWorkspace, needed: 'operate'/);
  });
});

describe('the intel action path is gated the same way', () => {
  it('checks the subject compartment before it writes either table', () => {
    expect(INTEL).toContain('subjectTypeWorkspace(subjectType)');
    expect(INTEL).toMatch(/capAtLeast\(ents\[subjectWs\], 'operate'\)/);
    const gate = INTEL.indexOf('subjectTypeWorkspace(subjectType)');
    const ledger = INTEL.indexOf('INSERT INTO object_actions');
    const audit = INTEL.indexOf('INSERT INTO audit_log');
    expect(gate).toBeLessThan(ledger);
    expect(gate).toBeLessThan(audit);
  });

  it('uses the SAME map as invokeAction rather than a second copy', () => {
    // Two maps is how the two doors disagreed in the first place.
    expect(INTEL).toMatch(/import \{[^}]*subjectTypeWorkspace[^}]*\} from '\.\.\/actions\/registry\.js'/s);
    expect(INTEL, 'a private subject→workspace map has appeared').not.toMatch(/SUBJECT_TYPE_WORKSPACES/);
  });
});
