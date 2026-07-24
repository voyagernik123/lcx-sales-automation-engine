import { describe, expect, it } from 'vitest';
import {
  WORKSPACES, WORKSPACE_IDS, capAtLeast, getWorkspace,
  legacyEntitlements, workspaceForApiPath, workspaceForPath,
} from './workspaces.js';
import { TEAM } from './operators.js';

describe('LCX OS workspace constitution (Phase 1)', () => {
  it('declares exactly the six compartments', () => {
    expect(WORKSPACE_IDS).toEqual(['command', 'sales', 'intel', 'regulatory', 'distribution', 'governance']);
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

  describe('the no-lockout covenant (full-desk backfill mirror, 2026-07-24)', () => {
    it('gives every roster member every workspace at role-mapped capability', () => {
      for (const m of TEAM) {
        const map = legacyEntitlements(m.role);
        for (const w of WORKSPACES) {
          expect(capAtLeast(map[w.id], 'view'), `${m.id} lost ${w.id}`).toBe(true);
          if (m.role === 'operator') expect(map[w.id]).toBe('operate');
          if (m.role === 'approver') expect(map[w.id]).toBe('approve');
        }
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
