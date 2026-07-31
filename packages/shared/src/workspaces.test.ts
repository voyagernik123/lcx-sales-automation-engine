import { describe, expect, it } from 'vitest';
import {
  FOUNDING_MEMBER_IDS,
  WORKSPACES, WORKSPACE_IDS, capAtLeast, getWorkspace,
  legacyEntitlements, workspaceForApiPath, workspaceForPath,
} from './workspaces.js';
import { TEAM } from './operators.js';

describe('LCX OS workspace constitution (Phase 1)', () => {
  /**
   * An EXACT list, not a `length >= n`, and it is meant to fail when someone adds
   * a compartment. A workspace is a need-to-know boundary: it decides what a
   * whole team can and cannot see, it mounts an API guard, and once granted it is
   * awkward to withdraw. That deserves a deliberate edit here rather than passing
   * silently because the assertion was written loosely.
   *
   * Amended 2026-07-31 — six → seven, adding `marketing`. The marketing team
   * needs X reply triage and has a different need-to-know from the BD desk;
   * see the reasoning on the WorkspaceDef itself. Default-deny (`legacy: false`).
   *
   * Amended again 2026-07-31 — seven → eight, adding `gps` (GLOBAL SERVICES).
   * This one is the sharpest case for asserting the count exactly: GPS is the
   * first compartment that will hold a THIRD PARTY's confidential commercial
   * terms on a regulated exchange's infrastructure, and it is `legacy: false`,
   * which since commit d62b965 genuinely means grant-only. Anyone adding a
   * ninth id here is making a need-to-know decision about client data, and
   * should have to write it down.
   *
   * If you are here because this test failed: that is the test doing its job.
   * Add your id to this list on purpose, and say why on the definition — do not
   * relax the assertion.
   */
  it('declares exactly the eight compartments', () => {
    expect(WORKSPACE_IDS).toEqual([
      'command', 'sales', 'intel', 'regulatory', 'distribution', 'marketing', 'gps', 'governance',
    ]);
  });

  it('owns each web path in at most one workspace (no contested territory)', () => {
    const seen = new Map<string, string>();
    for (const w of WORKSPACES) {
      for (const p of w.webPaths) {
        expect(seen.has(p), `path '${p}' claimed by ${seen.get(p)} and ${w.id}`).toBe(false);
        seen.set(p, w.id);
      }
    }
  });

  it('classifies routes to their home workspace', () => {
    expect(workspaceForPath('/command-deck')).toBe('command');
    expect(workspaceForPath('/bd-pipeline/abc123')).toBe('sales');
    expect(workspaceForPath('/graph')).toBe('intel');
    expect(workspaceForPath('/red-flags')).toBe('regulatory');
    expect(workspaceForPath('/distribution')).toBe('distribution');
    expect(workspaceForPath('/access')).toBe('governance');
  });

  it('leaves desk-level surfaces outside every compartment', () => {
    for (const p of ['/', '/tasks', '/notes', '/notes/p1', '/integrations', '/settings', '/select']) {
      expect(workspaceForPath(p), p).toBeNull();
    }
  });

  it('guards API namespaces without swallowing neighbours', () => {
    expect(workspaceForApiPath('/v1/command/overview')).toBe('command');
    expect(workspaceForApiPath('/v1/command')).toBe('command');
    expect(workspaceForApiPath('/v1/commander')).toBeNull(); // prefix must be segment-exact
    expect(workspaceForApiPath('/v1/deals/d1/playbook')).toBe('sales');
    expect(workspaceForApiPath('/v1/wbr')).toBe('governance');
    expect(workspaceForApiPath('/v1/me')).toBeNull();
    expect(workspaceForApiPath('/v1/notifications')).toBeNull();
  });

  it('orders the capability ladder view < operate < approve', () => {
    expect(capAtLeast('approve', 'view')).toBe(true);
    expect(capAtLeast('operate', 'operate')).toBe(true);
    expect(capAtLeast('view', 'operate')).toBe(false);
    expect(capAtLeast(undefined, 'view')).toBe(false);
  });

  /**
   * THE NO-LOCKOUT COVENANT, CORRECTED 2026-07-31.
   *
   * This block used to assert that `legacyEntitlements` gives every roster member
   * EVERY workspace. That was an accurate description of the code and a
   * description of a security hole.
   *
   * `legacyEntitlements` is contracted as "exactly the access everyone had before
   * LCX OS existed" (`apps/api/src/access/entitlements.ts:18`), and it is the
   * FAIL-OPEN map — used when the grant table cannot be read, and (until today)
   * for any roster member with zero grant rows. It looped over all of `WORKSPACES`,
   * so it handed out `distribution` and `marketing` too — the two compartments
   * declared `legacy: false` *specifically* to mean default-deny.
   *
   * Worse, `legacy` was read by no code anywhere: only the type declaration, the
   * literal values and two comments. So the flag documented a guarantee it did not
   * enforce, and got quoted in review as though it were a control — including in
   * `apps/api/src/routes/__tests__/access.test.ts`, which claimed "a fourth person
   * (a marketing hire) still gets nothing until an approver grants it". False: a
   * member with zero rows got everything. That test passed only because it
   * exercises `sam`, who has rows.
   *
   * Live consequence: add someone to `operators.ts`, deploy, and until a grant row
   * exists they hold US COMMAND and GOVERNANCE at `approve` if approver-roled.
   * `gps` will hold third-party client material, so this had to close before it
   * ships.
   *
   * The covenant still holds for what it was for — a founding member is never
   * locked out of the pre-LCX-OS desk by a missing row — and no longer reaches a
   * compartment created after LCX OS.
   */
  describe('the no-lockout covenant (corrected: legacy compartments only)', () => {
    it('gives every roster member the LEGACY workspaces at role-mapped capability', () => {
      for (const m of TEAM) {
        const map = legacyEntitlements(m.role);
        for (const w of WORKSPACES.filter((x) => x.legacy)) {
          expect(capAtLeast(map[w.id], 'view'), `${m.id} lost ${w.id}`).toBe(true);
          if (m.role === 'operator') expect(map[w.id]).toBe('operate');
          if (m.role === 'approver') expect(map[w.id]).toBe('approve');
        }
      }
    });

    it('gives NO ONE a default-deny compartment through fail-open', () => {
      const denied = WORKSPACES.filter((w) => !w.legacy).map((w) => w.id);
      expect(denied.length, 'expected at least one legacy:false compartment').toBeGreaterThan(0);
      for (const m of TEAM) {
        const map = legacyEntitlements(m.role);
        for (const id of denied) {
          expect(
            map[id],
            `${m.id} received ${id} from fail-open — it is legacy:false, i.e. grant-only`,
          ).toBeUndefined();
        }
      }
    });

    it('makes the `legacy` flag load-bearing, not decorative', () => {
      // The difference between a control and a comment: flipping a flag must
      // change this function's output.
      expect(Object.keys(legacyEntitlements('approver')).sort()).toEqual(
        WORKSPACES.filter((w) => w.legacy).map((w) => w.id).sort(),
      );
    });

    it('never returns the full workspace set — the shape of the old bug', () => {
      expect(Object.keys(legacyEntitlements('approver')).length).toBeLessThan(WORKSPACES.length);
    });

    it('scopes the covenant to the three members 0042 actually backfilled', () => {
      // The loader consults this list to decide whether a zero-row member gets
      // the floor or nothing. A literal, deliberately: deriving it from the
      // roster would re-open the hole on the next hire.
      expect([...FOUNDING_MEMBER_IDS].sort()).toEqual(['monty', 'nik', 'sam']);
      for (const later of ['marketing-hire', 'specialist', 'analyst']) {
        expect(FOUNDING_MEMBER_IDS.includes(later), later).toBe(false);
      }
    });

    it('keeps the roster at exactly nik, sam, monty', () => {
      expect(TEAM.map((m) => m.id).sort()).toEqual(['monty', 'nik', 'sam']);
    });
  });

  it('every workspace lands somewhere it owns (or the desk)', () => {
    for (const w of WORKSPACES) {
      const home = workspaceForPath(w.defaultLanding);
      expect(home === w.id || home === null, `${w.id} lands on ${String(home)}`).toBe(true);
      expect(() => getWorkspace(w.id)).not.toThrow();
    }
  });
});
