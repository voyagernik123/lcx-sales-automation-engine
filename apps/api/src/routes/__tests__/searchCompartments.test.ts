import { describe, expect, it } from 'vitest';
import { SEARCH_GROUPS, visibleGroups } from '../search.js';
import type { WorkspaceId } from '@lcx/shared';

/**
 * ⌘K MUST NOT WALK AROUND THE COMPARTMENT GATE.
 *
 * `/v1/search` is mounted desk-level on purpose — ⌘K has to work from anywhere,
 * so it is not behind `requireWorkspace`. But it queries `command_*`, `dist_*`
 * and `access_requests`, which means it read across three compartments for anyone
 * holding an operator credential, whatever their grants said. The gate on
 * `/v1/command/*` was bypassable by typing the same words into the command bar.
 *
 * That was survivable while the roster was three people who hold everything. It
 * stops being survivable when a compartment holds a third party's confidential
 * material — which is what `gps` is for. So this lands before that data exists.
 *
 * These tests are about ABSENCE, which is why the filter is a pure exported
 * function rather than logic buried in the handler: asserting that a query was
 * NOT run is not something an integration test can see.
 */

const ALL: Partial<Record<WorkspaceId, string>> = {
  command: 'approve', sales: 'approve', intel: 'approve', regulatory: 'approve',
  distribution: 'approve', marketing: 'approve', governance: 'approve',
};

const tagged = SEARCH_GROUPS.filter((g) => g.workspace);
const untagged = SEARCH_GROUPS.filter((g) => !g.workspace);

describe('compartment scoping of search groups', () => {
  it('has both tagged and desk-level groups (the fixture is meaningful)', () => {
    expect(tagged.length, 'no group claims a compartment — scoping would be vacuous').toBeGreaterThan(0);
    expect(untagged.length, 'no desk-level group — ⌘K would be empty for a new member').toBeGreaterThan(0);
  });

  it('shows everything to a principal holding every compartment', () => {
    expect(visibleGroups(SEARCH_GROUPS, ALL)).toHaveLength(SEARCH_GROUPS.length);
  });

  it('hides every compartment-owned group from a principal with NO grants', () => {
    const seen = visibleGroups(SEARCH_GROUPS, {});
    expect(seen).toHaveLength(untagged.length);
    for (const g of tagged) {
      expect(seen.some((s) => s.key === g.key), `${g.key} leaked with zero entitlements`).toBe(false);
    }
  });

  it('still shows desk-level groups to a principal with no grants', () => {
    // A brand-new member must not get a blank ⌘K — they should see the objects
    // that are genuinely deskwide, and nothing more.
    const seen = visibleGroups(SEARCH_GROUPS, {});
    for (const g of untagged) {
      expect(seen.some((s) => s.key === g.key), `${g.key} is desk-level and vanished`).toBe(true);
    }
  });

  it('grants one compartment without granting its neighbours', () => {
    const seen = visibleGroups(SEARCH_GROUPS, { command: 'view' });
    const keys = seen.map((s) => s.key);
    for (const g of tagged) {
      const expected = g.workspace === 'command';
      expect(keys.includes(g.key), `${g.key} (${g.workspace}) with only command:view`).toBe(expected);
    }
  });

  it('treats `view` as sufficient — scoping is read-gating, not write-gating', () => {
    const seen = visibleGroups(SEARCH_GROUPS, { distribution: 'view' });
    expect(seen.some((s) => s.workspace === 'distribution')).toBe(true);
  });

  it('denies on a missing grant rather than defaulting open', () => {
    // capAtLeast(undefined, 'view') must be false. If that ever inverts, every
    // compartment silently reopens here.
    const seen = visibleGroups(SEARCH_GROUPS, { command: undefined });
    expect(seen.some((s) => s.workspace === 'command')).toBe(false);
  });

  it('scopes the three compartments that were actually leaking', () => {
    // Named explicitly: these are the tables the audit found reachable —
    // command_* (5 groups), dist_* (2), access_requests (1).
    for (const ws of ['command', 'distribution', 'governance'] as const) {
      const owned = SEARCH_GROUPS.filter((g) => g.workspace === ws);
      expect(owned.length, `${ws} owns no search group — did a tag get dropped?`).toBeGreaterThan(0);
      const seen = visibleGroups(SEARCH_GROUPS, {});
      for (const g of owned) {
        expect(seen.some((s) => s.key === g.key), `${g.key} still ungated`).toBe(false);
      }
    }
  });

  it('leaves no command_/dist_/access_ group untagged', () => {
    // A new group added to one of these families without a workspace tag is the
    // regression this catches — the tag is easy to forget.
    for (const g of SEARCH_GROUPS) {
      if (/^(command_|dist_|access_)/.test(g.key)) {
        expect(g.workspace, `${g.key} must declare its compartment`).toBeDefined();
      }
    }
  });
});
